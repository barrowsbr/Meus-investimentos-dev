import { NextResponse } from "next/server";
import { brandFor } from "@/lib/asset-brands";

// Resolver de logo por TICKER — escalável: qualquer ativo novo resolve sozinho,
// sem manutenção. Roda no servidor da app (internet aberta), tenta várias fontes
// e devolve a imagem com cache LONGO (o CDN "guarda" a logo na borda por 1 ano).
//
// Ordem das fontes:
//   1. Clearbit pelo domínio da marca (quando conhecido em asset-brands) — melhor qualidade
//   2. FMP por ticker (image-stock) — cobre US e vários internacionais
//   3. logo.dev por ticker (se LOGO_DEV_TOKEN definido) — cobertura ampla, inclui BR/ETFs
// Se nada resolver → 404 e o AssetLogo mostra o avatar de iniciais.

export const revalidate = 2592000; // 30 dias

function candidates(ticker: string): string[] {
  const t = ticker.toUpperCase().trim();
  const clean = t.replace(/\.[A-Z0-9]+$/, "");
  const urls: string[] = [];

  const brand = brandFor(t);
  if (brand?.domain) urls.push(`https://logo.clearbit.com/${brand.domain}?size=128`);

  // FMP (image-stock) — por ticker. Tenta limpo e com sufixo.
  urls.push(`https://financialmodelingprep.com/image-stock/${clean}.png`);
  if (clean !== t) urls.push(`https://financialmodelingprep.com/image-stock/${t}.png`);

  // logo.dev — por ticker (token publicável gratuito). Ativa só se houver token.
  const tok = process.env.LOGO_DEV_TOKEN;
  if (tok) urls.push(`https://img.logo.dev/ticker/${clean}?token=${tok}&size=128&format=png&retina=true`);

  return urls;
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const ticker = decodeURIComponent(params.ticker ?? "").trim();
  if (!ticker) return new NextResponse(null, { status: 400 });

  for (const url of candidates(ticker)) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) continue; // descarta placeholder/1x1
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "content-type": ct,
          // cache longo: borda (CDN) por 1 ano, navegador por 30 dias
          "cache-control": "public, max-age=2592000, s-maxage=31536000, immutable",
        },
      });
    } catch {
      // fonte indisponível/timeout — tenta a próxima
    }
  }

  return new NextResponse(null, { status: 404 });
}
