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

const UA = "Mozilla/5.0 (compatible; InvestimentosBot/1.0; +https://github.com)";

async function fetchSubreddit(sub: string, limit = 8): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 1800 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const children: unknown[] = json?.data?.children ?? [];
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
    .filter(p => p.title && !p.title.startsWith("[deleted]"));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subParam = searchParams.get("subs");
  const subs = subParam ? subParam.split(",").map(s => s.trim()).filter(Boolean) : SUBREDDITS;

  try {
    const results = await Promise.allSettled(subs.map(s => fetchSubreddit(s)));
    const posts: RedditPost[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") posts.push(...r.value);
    }
    // Sort by score descending
    posts.sort((a, b) => b.score - a.score);
    return NextResponse.json({ posts, count: posts.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: message, posts: [] }, { status: 500 });
  }
}
