import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(
  process.env.VERCEL ? "/tmp" : process.cwd(),
  ".radar-cache",
);

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function ensureDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function keyToPath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(CACHE_DIR, `${safe}.json`);
}

export function cacheGet<T>(key: string): T | null {
  try {
    const path = keyToPath(key);
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  try {
    ensureDir();
    const path = keyToPath(key);
    const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs };
    writeFileSync(path, JSON.stringify(entry));
  } catch {
    // best-effort
  }
}
