import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function decodeGoogleNewsUrl(gnUrl: string): string | null {
  try {
    const m = gnUrl.match(/\/articles\/([A-Za-z0-9_\-]+)/);
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const buf = Buffer.from(b64, "base64");
    const str = buf.toString("latin1");
    const urlMatch = str.match(/https?:\/\/[^\x00-\x1f\x7f-\x9f"'<>\s]+/);
    return urlMatch?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const feedUrl = "https://news.google.com/rss/search?q=bolsa+brasil+ibovespa&hl=pt-BR&gl=BR&ceid=BR:pt";

  try {
    const res = await fetch(feedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 2);

    const debug = items.map((m, idx) => {
      const block = m[1];

      // Extract link
      const linkMatch = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      const link = linkMatch?.[1]?.trim() ?? "";

      // Extract description
      const descMatch = block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
      const rawDesc = descMatch?.[1]?.trim() ?? "";

      // Extract img from description
      const imgMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);

      // Extract media:content
      const mediaMatch = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);

      // Decode Google News URL
      const realUrl = decodeGoogleNewsUrl(link);

      // Try og:image from real URL (async, we'll resolve below)
      return {
        idx,
        link: link.substring(0, 120),
        realUrl,
        rawDescLength: rawDesc.length,
        rawDescSample: rawDesc.substring(0, 300),
        imgFromDesc: imgMatch?.[1] ?? null,
        mediaContent: mediaMatch?.[1] ?? null,
      };
    });

    // Try fetching og:image from first decoded URL
    let ogImageTest = null;
    const firstReal = debug[0]?.realUrl;
    if (firstReal) {
      try {
        const articleRes = await fetch(firstReal, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(5000),
          redirect: "follow",
        });
        const html = await articleRes.text();
        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        ogImageTest = {
          status: articleRes.status,
          finalUrl: articleRes.url,
          ogImage: og?.[1] ?? null,
          htmlLength: html.length,
          htmlSample: html.substring(0, 300),
        };
      } catch (e) {
        ogImageTest = { error: e instanceof Error ? e.message : "unknown" };
      }
    }

    return NextResponse.json({
      feedStatus: res.status,
      xmlLength: xml.length,
      itemCount: items.length,
      items: debug,
      ogImageTest,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
