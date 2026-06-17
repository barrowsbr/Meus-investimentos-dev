import { NextResponse } from "next/server";
import {
  type RedditPost,
  DEFAULT_SUBREDDITS,
  parseRedditListing,
} from "@/lib/reddit";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Re-export for existing type imports
export type { RedditPost };

const UA = "web:meus-investimentos:v1.0 (by /u/meus-investimentos)";

// ── OAuth (official API — the only server-side path that works from cloud) ─────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in ?? 3600) - 60) * 1000,
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

async function fetchViaOAuth(sub: string, token: string, limit: number): Promise<RedditPost[]> {
  try {
    const res = await fetch(`https://oauth.reddit.com/r/${sub}/hot?limit=${limit}&raw_json=1`, {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return parseRedditListing(await res.json(), sub);
  } catch {
    return [];
  }
}

// ── Public JSON fallback (works from residential IPs; 403 from datacenter) ─────

async function fetchViaPublicJson(sub: string, limit: number): Promise<RedditPost[]> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "application/json",
  };
  for (const url of [
    `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
    `https://old.reddit.com/r/${sub}/hot.json?limit=${limit}`,
  ]) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      return parseRedditListing(await res.json(), sub);
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
    : DEFAULT_SUBREDDITS;

  try {
    const token = await getAppToken();
    const posts: RedditPost[] = [];
    let source: "oauth" | "public" = token ? "oauth" : "public";

    if (token) {
      // OAuth allows quick sequential calls within rate budget
      for (const sub of subs) {
        posts.push(...(await fetchViaOAuth(sub, token, 8)));
      }
      // If OAuth somehow returned nothing, try public as last resort
      if (posts.length === 0) {
        source = "public";
        for (const sub of subs) posts.push(...(await fetchViaPublicJson(sub, 8)));
      }
    } else {
      for (const sub of subs) posts.push(...(await fetchViaPublicJson(sub, 8)));
    }

    posts.sort((a, b) => b.score - a.score);

    return NextResponse.json(
      {
        posts,
        count: posts.length,
        source,
        // Tells the client whether to attempt a browser-side fetch fallback.
        canFallbackClient: posts.length === 0,
        hint: posts.length === 0 && !token
          ? "Servidor bloqueado pelo Reddit (IP de datacenter). Configure REDDIT_CLIENT_ID e REDDIT_CLIENT_SECRET para o acesso oficial via OAuth."
          : undefined,
      },
      { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=600" } }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: message, posts: [], canFallbackClient: true }, { status: 500 });
  }
}
