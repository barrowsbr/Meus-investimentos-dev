/**
 * Helpers de scraping de RSS + extração de imagem (og:image), compartilhados
 * pelas rotas de notícias. A lógica nasceu em app/api/noticias/destaques e foi
 * extraída para reuso pela rota por-ativo (/api/noticias/ativo).
 *
 * Regra de ouro anti-logo: NUNCA aceitar imagem hospedada pelo Google — pior
 * caso é ficar sem imagem (placeholder), nunca o logo do Google News.
 */

export type Lang = "pt" | "en";

// ── XML / HTML ────────────────────────────────────────────────────────────────

export function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "").trim();
}

export function stripCdata(s: string): string {
  const m = s.trim().match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (m ? m[1] : s).trim();
}

export function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

export function extractSource(xml: string, fallback: string): string {
  const m = xml.match(/<source[^>]*>([^<]*)<\/source>/i);
  if (m) return decodeHtml(m[1].trim());
  const c = xml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  if (c) return decodeHtml(stripCdata(c[1]));
  return fallback;
}

// ── Imagem (filtro anti-Google) ────────────────────────────────────────────────

export function isGoogleHost(u: string): boolean {
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

export function looksLikeImage(u: string): boolean {
  return /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(u);
}

export function cleanImageUrl(raw: string | null | undefined, base?: string): string | null {
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

/** Imagem embutida no <item> do RSS: media:content → thumbnail → enclosure →
 *  content:encoded → <img> na description. Tudo filtrado contra hosts Google. */
export function pickFeedImage(block: string, base?: string): string | null {
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

  const thumb = block.match(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i)?.[1];
  const fromThumb = cleanImageUrl(thumb, base);
  if (fromThumb) return fromThumb;

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

  const ceRaw = block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)?.[1];
  if (ceRaw) {
    const ok = cleanImageUrl(firstImgInHtml(stripCdata(ceRaw)), base);
    if (ok) return ok;
  }

  const descRaw = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1];
  if (descRaw) {
    const ok = cleanImageUrl(firstImgInHtml(stripCdata(descRaw)), base);
    if (ok) return ok;
  }

  return null;
}

// ── Google News: decodificar URL real ──────────────────────────────────────────

export function decodeGoogleNewsUrl(gnUrl: string): string | null {
  try {
    const m = gnUrl.match(/\/articles\/([A-Za-z0-9_\-]+)/);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const buf = Buffer.from(b64, "base64");
    const str = buf.toString("latin1");
    const urls = str.match(/https?:\/\/[^\x00-\x1f\x7f-\x9f"'<>\s]+/g) ?? [];
    for (const u of urls) {
      if (!isGoogleHost(u)) return u;
    }
    return null;
  } catch {
    return null;
  }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
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

function extractOgImage(html: string, base: string): string | null {
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
  return img;
}

/** Busca og:image / twitter:image na página REAL do artigo (veículo, nunca Google). */
export async function fetchArticleImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    if (isGoogleHost(res.url)) return null;
    return extractOgImage(await res.text(), res.url || articleUrl);
  } catch {
    return null;
  }
}

/** Segue o redirect do Google News E extrai og:image num único fetch. */
export async function resolveAndImage(url: string): Promise<{ realUrl: string; img: string | null } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    if (isGoogleHost(res.url)) return null;
    return { realUrl: res.url, img: extractOgImage(await res.text(), res.url) };
  } catch {
    return null;
  }
}

/** URL de busca do Google News RSS para uma query. */
export function googleNewsSearchUrl(q: string, lang: Lang = "pt"): string {
  const e = encodeURIComponent(q);
  return lang === "en"
    ? `https://news.google.com/rss/search?q=${e}&hl=en-US&gl=US&ceid=US:en`
    : `https://news.google.com/rss/search?q=${e}&hl=pt-BR&gl=BR&ceid=BR:pt`;
}
