import { NextResponse } from "next/server";
import { brandFor } from "@/lib/asset-brands";

// Resolver de logo por TICKER — escalável: qualquer ativo novo resolve sozinho,
// sem manutenção. Roda no servidor da app (internet aberta), tenta várias fontes
// e devolve a imagem. Sucesso fica cacheado 1 ano na borda (CDN); FALHA fica só
// 1 hora — ativo recém-adicionado tenta de novo logo (antes o 404 ficava preso
// 30 dias pelo revalidate e a logo "nunca chegava").
//
// Ordem das fontes (cada uma cai para a próxima):
//   1. brapi (B3): campo logourl do quote — melhor cobertura de ações/FIIs BR
//   2. FMP images.financialmodelingprep.com/symbol — US e vários internacionais
//      (o host antigo financialmodelingprep.com/image-stock fica como legado)
//   3. logo.dev por ticker (se LOGO_DEV_TOKEN definido) — cobertura ampla
//   4. Parqet por símbolo (sem chave)
//   5. Domínio da marca (asset-brands) → logo.dev por domínio / favicon Google
//   6. Site oficial via Yahoo (quoteSummary assetProfile.website) → idem
// ⚠️ Clearbit (logo.clearbit.com) MORREU — sunset dez/2025, DNS nem resolve.
//    Não reintroduzir. Se nada resolver → 404 e o AssetLogo mostra iniciais.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 25;

const OK_CACHE = "public, max-age=2592000, s-maxage=31536000, immutable";
const MISS_CACHE = "public, max-age=300, s-maxage=3600"; // falha re-tenta em 1h

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Padrão de ticker B3: 4 letras + 1-2 dígitos (PETR4, IVVB11), com ou sem .SA.
function isB3(ticker: string, clean: string): boolean {
  return ticker.endsWith(".SA") || /^[A-Z]{4}\d{1,2}$/.test(clean);
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function domainUrls(domain: string): string[] {
  const tok = process.env.LOGO_DEV_TOKEN;
  const urls: string[] = [];
  if (tok) urls.push(`https://img.logo.dev/${domain}?token=${tok}&size=128&format=png`);
  urls.push(faviconUrl(domain));
  return urls;
}

// Baixa a URL e devolve a resposta pronta se for uma imagem de verdade.
async function tryImage(url: string): Promise<NextResponse | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null; // descarta placeholder/1x1
    return new NextResponse(buf, {
      status: 200,
      headers: { "content-type": ct, "cache-control": OK_CACHE },
    });
  } catch {
    return null; // fonte indisponível/timeout — tenta a próxima
  }
}

// brapi: o quote traz `logourl` (ícone oficial da ação/FII na B3).
// Sem BRAPI_TOKEN o tier grátis só libera 4 tickers — vale tentar mesmo assim.
async function brapiLogoUrl(clean: string): Promise<string | null> {
  try {
    const token = process.env.BRAPI_TOKEN;
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const res = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(clean)}${qs}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ logourl?: string }> };
    const u = json.results?.[0]?.logourl;
    return typeof u === "string" && u.startsWith("http") ? u : null;
  } catch {
    return null;
  }
}

// Último recurso: site oficial da empresa via Yahoo → domínio → logo por domínio.
async function yahooDomain(ticker: string): Promise<string | null> {
  try {
    const YF: any = (await import("yahoo-finance2")).default;
    const yf = typeof YF === "function" ? new YF() : YF;
    const summary = await yf.quoteSummary(ticker, { modules: ["assetProfile"] });
    const site = summary?.assetProfile?.website;
    if (typeof site !== "string" || !site) return null;
    return new URL(site).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function staticCandidates(ticker: string): string[] {
  const t = ticker.toUpperCase().trim();
  const clean = t.replace(/\.[A-Z0-9]+$/, "");
  const urls: string[] = [];

  // FMP — host novo primeiro (o antigo image-stock ficou instável), ticker
  // completo (PETR4.SA) e limpo (PETR4).
  const syms = clean !== t ? [t, clean] : [clean];
  for (const s of syms) urls.push(`https://images.financialmodelingprep.com/symbol/${s}.png`);
  for (const s of syms) urls.push(`https://financialmodelingprep.com/image-stock/${s}.png`);

  // logo.dev — por ticker (só com token).
  const tok = process.env.LOGO_DEV_TOKEN;
  if (tok) urls.push(`https://img.logo.dev/ticker/${clean}?token=${tok}&size=128&format=png&retina=true`);

  // Parqet — por símbolo, sem chave.
  urls.push(`https://assets.parqet.com/logos/symbol/${encodeURIComponent(clean)}?format=png&size=128`);

  // Domínio conhecido em asset-brands.
  const brand = brandFor(t);
  if (brand?.domain) urls.push(...domainUrls(brand.domain));

  return urls;
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = decodeURIComponent(params.ticker ?? "").trim();
  if (!ticker) return new NextResponse(null, { status: 400 });

  const t = ticker.toUpperCase();
  const clean = t.replace(/\.[A-Z0-9]+$/, "");

  // 1) B3 → brapi logourl (fonte específica do mercado BR, melhor qualidade).
  if (isB3(t, clean)) {
    const u = await brapiLogoUrl(clean);
    if (u) {
      const img = await tryImage(u);
      if (img) return img;
    }
  }

  // 2-5) Fontes estáticas em cascata.
  for (const url of staticCandidates(t)) {
    const img = await tryImage(url);
    if (img) return img;
  }

  // 6) Site oficial via Yahoo → logo por domínio (cobre QUALQUER ativo novo).
  const domain = await yahooDomain(t);
  if (domain) {
    for (const url of domainUrls(domain)) {
      const img = await tryImage(url);
      if (img) return img;
    }
  }

  return new NextResponse(null, {
    status: 404,
    headers: { "cache-control": MISS_CACHE },
  });
}
