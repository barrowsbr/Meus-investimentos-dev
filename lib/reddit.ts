// Shared Reddit types + parsing + client-side fetch.
//
// IMPORTANT: Reddit blocks ALL datacenter IPs (Vercel/AWS/GCP) with HTTP 403 on
// every public endpoint (.json, old.reddit, .rss). So server-side fetching only
// works through the official OAuth API (oauth.reddit.com) with app credentials.
// As a zero-config fallback, we fetch directly from the user's browser, whose
// residential IP is not blocked.

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

export const DEFAULT_SUBREDDITS = [
  "investimentos",
  "farialimabets",
  "bolsa",
  "stocks",
  "wallstreetbets",
  "dividends",
];

// Parse Reddit listing JSON (same shape for .json and oauth.reddit.com) into posts.
export function parseRedditListing(json: unknown, sub: string): RedditPost[] {
  const data = (json as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const children = (data?.children as unknown[]) ?? [];
  return children
    .map((c) => {
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

// ── Client-side fetch (runs in the user's browser, residential IP) ─────────────

async function fetchSubredditFromBrowser(sub: string, limit: number): Promise<RedditPost[]> {
  const urls = [
    `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
    `https://old.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      return parseRedditListing(await res.json(), sub);
    } catch {
      continue;
    }
  }
  return [];
}

// Fetches all subreddits from the browser. Returns posts sorted by score.
// Throws only if EVERY subreddit failed (so callers can fall back).
export async function fetchRedditFromBrowser(
  subs: string[] = DEFAULT_SUBREDDITS,
  limit = 8
): Promise<RedditPost[]> {
  const results = await Promise.allSettled(
    subs.map((sub) => fetchSubredditFromBrowser(sub, limit))
  );

  const posts: RedditPost[] = [];
  let anySucceeded = false;
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.length > 0) anySucceeded = true;
      posts.push(...r.value);
    }
  }

  if (!anySucceeded && posts.length === 0) {
    throw new Error("Reddit bloqueou as requisições do navegador");
  }

  posts.sort((a, b) => b.score - a.score);
  return posts;
}
