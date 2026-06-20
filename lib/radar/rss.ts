export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

const ENTITIES: [RegExp, string][] = [
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&apos;/g, "'"],
];

export function decodeHtml(s: string): string {
  let out = s;
  for (const [re, ch] of ENTITIES) out = out.replace(re, ch);
  return out.replace(/<[^>]+>/g, "").trim();
}

export function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  const inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return cdata ? cdata[1] : inner;
}

function extractSource(xml: string): string {
  const m = xml.match(/<source[^>]*>([^<]*)<\/source>/i);
  return m ? decodeHtml(m[1].trim()) : "Google News";
}

function extractLink(block: string): string {
  let link = extractTag(block, "link");
  if (!link) {
    const hm = block.match(/<link\s+href="([^"]+)"/i);
    if (hm) link = hm[1];
  }
  if (!link) {
    const bare = block.match(/<link\s*\/?>\s*(https?:\/\/[^\s<]+)/i);
    if (bare) link = bare[1];
  }
  return link;
}

export function parseRssItems(xml: string): RssItem[] {
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const items: RssItem[] = [];

  for (const m of blocks) {
    const block = m[1];
    const title = decodeHtml(extractTag(block, "title"));
    const link = extractLink(block);
    const pubDate = extractTag(block, "pubDate");
    const source = extractSource(block);

    if (title && link) {
      items.push({ title, link, pubDate, source });
    }
  }

  return items;
}
