import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export interface RedditPost {
  id: string;
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  score: number;
  num_comments: number;
  selftext: string;
  author: string;
  created_utc: number;
  flair: string;
}

const SUBREDDITS = [
  "investimentos",
  "farialimabets",
  "bolsa",
  "stocks",
  "wallstreetbets",
  "dividends",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function parsePosts(json: Record<string, unknown>, sub: string): RedditPost[] {
  const children: unknown[] =
    (json?.data as Record<string, unknown>)?.children as unknown[] ?? [];
  return children
    .map((c: unknown) => {
      const d = (c as { data: Record<string, unknown> }).data;
      return {
        id: String(d.id ?? ""),
        title: String(d.title ?? ""),
        url: String(d.url ?? ""),
        permalink: `https://reddit.com${d.permalink ?? ""}`,
        subreddit: String(d.subreddit ?? sub),
        score: Number(d.score ?? 0),
        num_comments: Number(d.num_comments ?? 0),
        selftext: String(d.selftext ?? "").slice(0, 200),
        author: String(d.author ?? ""),
        created_utc: Number(d.created_utc ?? 0),
        flair: String(d.link_flair_text ?? ""),
      } satisfies RedditPost;
    })
    .filter((p) => p.title && !p.title.startsWith("[deleted]"));
}

async function fetchSubreddit(sub: string, limit = 8): Promise<RedditPost[]> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/json",
  };

  const urls = [
    `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
    `https://old.reddit.com/r/${sub}/hot.json?limit=${limit}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 429) {
        const wait = Math.min(Number(res.headers.get("retry-after") ?? "2"), 5);
        await new Promise((r) => setTimeout(r, wait * 1000));
        const retry = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (retry.ok) {
          return parsePosts(await retry.json(), sub);
        }
        continue;
      }
      if (!res.ok) continue;
      return parsePosts(await res.json(), sub);
    } catch {
      continue;
    }
  }
  return [];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subParam = searchParams.get("subs");
  const subs = subParam
    ? subParam.split(",").map((s) => s.trim()).filter(Boolean)
    : SUBREDDITS;

  try {
    const posts: RedditPost[] = [];

    // Fetch sequentially to avoid Reddit rate-limiting
    for (const sub of subs) {
      const result = await fetchSubreddit(sub);
      posts.push(...result);
    }

    posts.sort((a, b) => b.score - a.score);
    return NextResponse.json(
      { posts, count: posts.length },
      { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=600" } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: message, posts: [] }, { status: 500 });
  }
}
