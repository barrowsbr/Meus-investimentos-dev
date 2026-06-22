import { NextResponse } from "next/server";
import { translateBatch } from "@/lib/translate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface DestaqueItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem: string | null;
  categoria: string;
  impacto: "alto" | "medio" | "baixo";
}

const HIGH: string[] = [
  "selic", "copom", "fomc", "fed ", "rate cut", "rate hike",
  "corte de juros", "alta de juros", "decisão",
  "inflação", "ipca", "cpi ", "pce ",
  "pib", "gdp", "recessão", "recession",
  "resultados", "earnings", "lucro líquido",
  "dividendos", "ipo", "falência", "bankruptcy",
  "fusão", "merger", "aquisição", "acquisition",
  "default", "moratória", "rebaixamento",
  "guerra", "war ", "sanções", "sanctions",
  "payroll", "urgente", "breaking",
];

const MEDIUM: string[] = [
  "balanço", "guidance", "analista", "analyst",
  "preço-alvo", "price target", "upgrade", "downgrade",
  "volatilidade", "sell-off", "rally",
  "câmbio", "dólar", "petróleo",
  "dividendo", "recompra", "buyback",
  "regulação", "regulation", "lucro", "receita",
];

function scoreImpact(t: string): DestaqueItem["impacto"] {
  const lc = t.toLowerCase();
  if (HIGH.some(k => lc.includes(k))) return "alto";
  if (MEDIUM.some(k => lc.includes(k))) return "medio";
  return "baixo";
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "").trim();
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

function stripCdata(s: string): string {
  const m = s.trim().match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (m ? m[1] : s).trim();
}

function extractSource(xml: string, fallback: string): string {
  const m = xml.match(/<source[^>]*>([^<]*)<\/source>/i);
  if (m) return decodeHtml(m[1].trim());
  const c = xml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  if (c) return decodeHtml(stripCdata(c[1]));
  return fallback;
}

// ── Filtro anti-logo: nunca aceitar imagem hospedada pelo Google ────────────────
// A causa-raiz dos "logos do Google" era usar o og:image de páginas google.com /
// consent.google.com (e os attachments do RSS do Google News, que são o próprio
// logo). Rejeitamos qualquer host Google em TODAS as etapas — pior caso é ficar
// sem imagem (ícone de jornal), nunca o logo.
function isGoogleHost(u: string): boolean {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return (
      /(^|\.)google\.[a-z.]+$/.test(h) ||
      h.endsWith("gstatic.com") ||
      h.endsWith("googleusercontent.com") ||
      h.endsWith("ggpht.com") ||
      h.includes("google")
    );
  } catch {
    return false;
  }
}

function looksLikeImage(u: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(u);
}

// Resolve URL relativa → absoluta e valida (http/https, não-Google).
function cleanImageUrl(raw: string | null | undefined, base?: string): string | null {
  if (!raw) return null;
  let u = raw.trim().replace(/&amp;/g, "&");
  try {
    u = base ? new URL(u, base).href : new URL(u).href;
  } catch {
    return null;
  }
  if (!/^https?:\/\//i.test(u)) return null;
  if (isGoogleHost(u)) return null;
  return u;
}

function firstImgInHtml(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

// Extrai a imagem embutida no <item> do RSS (fonte primária e mais confiável):
// media:content (maior largura) → media:thumbnail → enclosure → content:encoded
// → <img> na description. Todas filtradas contra hosts do Google.
function pickFeedImage(block: string, base?: string): string | null {
  // media:content — escolher a de maior width quando houver várias
  const mediaTags = [...block.matchAll(/<media:content\b[^>]*?>/gi)].map(m => m[0]);
  let best: string | null = null;
  let bestW = -1;
  for (const tag of mediaTags) {
    const url = tag.match(/\burl=["']([^"']+)["']/i)?.[1];
    if (!url) continue;
    const type = tag.match(/\btype=["']([^"']+)["']/i)?.[1] ?? "";
    const medium = tag.match(/\bmedium=["']([^"']+)["']/i)?.[1] ?? "";
    const isImg = type.startsWith("image") || medium === "image" || looksLikeImage(url);
    if (!isImg) continue;
    const w = parseInt(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? "0", 10);
    if (w > bestW) { bestW = w; best = url; }
  }
  const fromMedia = cleanImageUrl(best, base);
  if (fromMedia) return fromMedia;

  // media:thumbnail
  const thumb = block.match(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i)?.[1];
  const fromThumb = cleanImageUrl(thumb, base);
  if (fromThumb) return fromThumb;

  // enclosure (imagem)
  const encTags = [...block.matchAll(/<enclosure\b[^>]*?>/gi)].map(m => m[0]);
  for (const tag of encTags) {
    const url = tag.match(/\burl=["']([^"']+)["']/i)?.[1];
    if (!url) continue;
    const type = tag.match(/\btype=["']([^"']+)["']/i)?.[1] ?? "";
    if (type.startsWith("image") || looksLikeImage(url)) {
      const ok = cleanImageUrl(url, base);
      if (ok) return ok;
    }
  }

  // content:encoded → primeiro <img>
  const ceRaw = block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1];
  if (ceRaw) {
    const img = firstImgInHtml(stripCdata(ceRaw));
    const ok = cleanImageUrl(img, base);
    if (ok) return ok;
  }

  // description → primeiro <img>
  const descRaw = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1];
  if (descRaw) {
    const img = firstImgInHtml(stripCdata(descRaw));
    const ok = cleanImageUrl(img, base);
    if (ok) return ok;
  }

  return null;
}

// Decodifica a URL real do artigo a partir do redirect do Google News.
// (Best-effort: o formato novo às vezes não traz a URL legível — nesse caso
// retornamos null e o item fica só com o título, sem imagem.)
function decodeGoogleNewsUrl(gnUrl: string): string | null {
  try {
    const m = gnUrl.match(/\/articles\/([A-Za-z0-9_\-]+)/);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const buf = Buffer.from(b64, "base64");
    const str = buf.toString("latin1");
    // pegar TODAS as URLs e escolher a primeira que NÃO seja do Google
    const urls = str.match(/https?:\/\/[^\x00-\x1f\x7f-\x9f"'<>\s]+/g) ?? [];
    for (const u of urls) {
      if (!isGoogleHost(u)) return u;
    }
    return null;
  } catch {
    return null;
  }
}

type Lang = "pt" | "en";

interface Feed {
  url: string;
  categoria: string;
  lang: Lang;
  max: number;
  kind: "direct" | "google";
  fonte: string;
}

function newsUrl(q: string, lang: Lang = "pt"): string {
  const e = encodeURIComponent(q);
  return lang === "en"
    ? `https://news.google.com/rss/search?q=${e}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${e}&hl=pt-BR&gl=BR&ceid=BR:pt`;
}

// Feeds diretos de veículos — trazem a imagem REAL embutida no item (media:content
// / enclosure / <img>), sem qualquer redirect do Google. Fonte primária das fotos.
const DIRECT_FEEDS: Feed[] = [
  { url: "https://www.infomoney.com.br/mercados/feed/", categoria: "Mercado", lang: "pt", max: 6, kind: "direct", fonte: "InfoMoney" },
  { url: "https://www.infomoney.com.br/economia/feed/", categoria: "Economia", lang: "pt", max: 4, kind: "direct", fonte: "InfoMoney" },
  { url: "https://www.infomoney.com.br/investimentos/feed/", categoria: "Investimentos", lang: "pt", max: 3, kind: "direct", fonte: "InfoMoney" },
  { url: "https://www.moneytimes.com.br/feed/", categoria: "Mercado", lang: "pt", max: 5, kind: "direct", fonte: "Money Times" },
  { url: "https://g1.globo.com/rss/g1/economia/", categoria: "Economia", lang: "pt", max: 4, kind: "direct", fonte: "G1" },
  { url: "https://exame.com/feed/", categoria: "Investimentos", lang: "pt", max: 4, kind: "direct", fonte: "Exame" },
  { url: "https://valorinveste.globo.com/feed/rss/ultimas-noticias.ghtml", categoria: "Investimentos", lang: "pt", max: 3, kind: "direct", fonte: "Valor Investe" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", categoria: "Global", lang: "en", max: 4, kind: "direct", fonte: "CNBC" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", categoria: "Global", lang: "en", max: 3, kind: "direct", fonte: "MarketWatch" },
];

// Feeds do Google News — usados para AMPLITUDE/relevância de manchetes. A imagem
// (quando houver) vem do og:image da URL real decodificada, nunca de host Google.
const GOOGLE_FEEDS: Feed[] = [
  { url: newsUrl("bolsa brasil ibovespa mercado financeiro"), categoria: "Mercado", lang: "pt", max: 5, kind: "google", fonte: "Google News" },
  { url: newsUrl("dólar câmbio dividendos ações renda variável"), categoria: "Investimentos", lang: "pt", max: 4, kind: "google", fonte: "Google News" },
  { url: newsUrl("S&P 500 Nasdaq Wall Street earnings fed", "en"), categoria: "Global", lang: "en", max: 4, kind: "google", fonte: "Google News" },
];

interface Parsed extends DestaqueItem {
  _lang: Lang;
  _kind: "direct" | "google";
  _gnLink: string; // link original do Google News (para decodificar)
}

function parseFeed(xml: string, feed: Feed): Parsed[] {
  const items: Parsed[] = [];
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  // Atom (alguns feeds usam <entry> em vez de <item>)
  const entries = matches.length === 0 ? [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)] : matches;

  for (const m of entries.slice(0, feed.max)) {
    const block = m[1];
    const titulo = decodeHtml(extractTag(block, "title"));

    let link = extractTag(block, "link");
    if (!link) { const hm = block.match(/<link\s+href="([^"]+)"/i); if (hm) link = hm[1]; }
    link = link.trim();
    if (!titulo || !link) continue;

    const data = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    const fonte = extractSource(block, feed.fonte);

    // Imagem embutida — só para feeds diretos (Google News serve o próprio logo).
    const imagem = feed.kind === "direct" ? pickFeedImage(block, link) : null;

    items.push({
      titulo, link, data, fonte,
      imagem,
      categoria: feed.categoria,
      impacto: scoreImpact(titulo),
      _lang: feed.lang,
      _kind: feed.kind,
      _gnLink: link,
    });
  }
  return items;
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Busca og:image / twitter:image na página REAL do artigo (veículo, nunca Google).
async function fetchArticleImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    // Se redirecionou para um muro de consentimento do Google, descartar.
    if (isGoogleHost(res.url)) return null;
    const html = await res.text();
    const base = res.url || articleUrl;

    const og = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
    let img = cleanImageUrl(og?.[1], base);
    if (img) return img;

    const tw = html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
    img = cleanImageUrl(tw?.[1], base);
    if (img) return img;

    const linkImg = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
    img = cleanImageUrl(linkImg?.[1], base);
    if (img) return img;

    return null;
  } catch {
    return null;
  }
}

// Resolve a URL real de um artigo seguindo o redirect do Google News.
// Mais confiável que o decode base64 para URLs novas (pós-2024).
async function resolveGoogleRedirect(gnUrl: string): Promise<string | null> {
  try {
    const res = await fetch(gnUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    const finalUrl = res.url;
    if (isGoogleHost(finalUrl)) return null;
    return finalUrl;
  } catch {
    return null;
  }
}

// Busca og:image e resolve a URL real em um único fetch (evita duplo request).
// Se a URL de entrada for redirect do Google News, segue o redirect e extrai da
// página final. Retorna { url, img } ou null.
async function resolveAndImage(url: string): Promise<{ realUrl: string; img: string | null } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    if (isGoogleHost(res.url)) return null;
    const html = await res.text();
    const base = res.url;

    const og = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
    let img = cleanImageUrl(og?.[1], base);
    if (!img) {
      const tw = html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
      img = cleanImageUrl(tw?.[1], base);
    }
    if (!img) {
      const linkImg = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
      img = cleanImageUrl(linkImg?.[1], base);
    }

    return { realUrl: res.url, img };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const feeds = [...DIRECT_FEEDS, ...GOOGLE_FEEDS];
    const results = await Promise.allSettled(
      feeds.map(async f => parseFeed(await fetchFeed(f.url), f))
    );

    const all: Parsed[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") all.push(...r.value);
    }

    // Dedup por título e por link.
    const seen = new Set<string>();
    const deduped: Parsed[] = [];
    for (const item of all) {
      const key = item.titulo.toLowerCase().slice(0, 50);
      const linkKey = item.link.slice(0, 80);
      if (!seen.has(key) && !seen.has(linkKey)) {
        seen.add(key);
        seen.add(linkKey);
        deduped.push(item);
      }
    }

    const impactOrder = { alto: 0, medio: 1, baixo: 2 };
    deduped.sort((a, b) => {
      const i = impactOrder[a.impacto] - impactOrder[b.impacto];
      if (i !== 0) return i;
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });

    const pool = deduped.slice(0, 30);

    // Traduzir manchetes em inglês.
    const english = pool.filter(t => t._lang === "en");
    if (english.length > 0) {
      try {
        const translated = await translateBatch(english.map(e => e.titulo), "pt");
        for (let i = 0; i < english.length; i++) {
          if (translated[i] && translated[i].length > 3) english[i].titulo = translated[i];
        }
      } catch { /* mantém original */ }
    }

    // Preencher imagem faltante via og:image da página real.
    // - Itens diretos: buscar og:image no próprio link do veículo.
    // - Itens do Google News: decodificar base64 OU seguir redirect até o
    //   artigo real (num único fetch que já extrai og:image).
    await Promise.allSettled(
      pool.map(async item => {
        if (item.imagem) return;

        if (item._kind === "direct") {
          const img = await fetchArticleImage(item.link);
          if (img) item.imagem = img;
          return;
        }

        // Google News: tentar decode base64 primeiro (rápido, sem fetch extra).
        const decoded = decodeGoogleNewsUrl(item._gnLink);
        if (decoded) {
          item.link = decoded;
          const img = await fetchArticleImage(decoded);
          if (img) item.imagem = img;
          return;
        }

        // Fallback: seguir o redirect do Google News até o artigo real.
        // Um único fetch resolve a URL E extrai og:image de uma vez.
        const result = await resolveAndImage(item._gnLink);
        if (result) {
          item.link = result.realUrl;
          if (result.img) item.imagem = result.img;
        }
      })
    );

    // Reordenar: dentro de cada tier de impacto, artigos COM imagem sobem.
    pool.sort((a, b) => {
      const i = impactOrder[a.impacto] - impactOrder[b.impacto];
      if (i !== 0) return i;
      const ai = a.imagem ? 0 : 1;
      const bi = b.imagem ? 0 : 1;
      if (ai !== bi) return ai - bi;
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      return db - da;
    });

    let top = pool.slice(0, 20);
    const firstWithImg = top.findIndex(t => t.imagem);
    if (firstWithImg > 0) {
      const [hero] = top.splice(firstWithImg, 1);
      top = [hero, ...top];
    }

    const articles: DestaqueItem[] = top.map(({ _lang: _l, _kind: _k, _gnLink: _g, ...rest }) => rest);

    return NextResponse.json({ articles, count: articles.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ articles: [], count: 0, error: msg }, { status: 500 });
  }
}
