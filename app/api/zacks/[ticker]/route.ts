// Zacks Rank por ticker — proxy do feed público quote-feed.zacks.com (o mesmo
// que os raspadores de Zacks no GitHub usam). Cobre ações dos EUA, ADRs (TSM,
// NVO…) e até ETFs (Zacks ETF Rank). NÃO cobre ticker com sufixo de bolsa
// (B3 .SA, .T, .SW…) — o cliente nem chama nesses casos (ZacksBadge).
//
// Formato do feed (verificado ago/2026 via runner):
//   GET https://quote-feed.zacks.com/index?t=NVDA
//   → { "NVDA": { ticker, zacks_rank: "2", zacks_rank_text: "Buy", updated } }
//   ticker inexistente → {} (HTTP 200)
//
// Rank muda no máximo 1×/dia útil: cache 12h no lambda + CDN; miss re-tenta 1h.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

export interface ZacksInfo {
  ticker: string;
  rank: number;          // 1 (Strong Buy) … 5 (Strong Sell)
  texto: string;         // rótulo original da Zacks ("Strong Buy")
  atualizado: string | null;
}

const cache = new Map<string, { t: number; body: ZacksInfo | null }>();
const TTL = 12 * 60 * 60 * 1000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const t = decodeURIComponent(params.ticker ?? "").trim().toUpperCase();
  // Só ticker estilo EUA (sem sufixo de bolsa) — é o universo da Zacks.
  if (!/^[A-Z]{1,6}(-[A-Z])?$/.test(t)) {
    return NextResponse.json({ error: "ticker fora da cobertura Zacks" }, { status: 404, headers: { "cache-control": "public, s-maxage=86400" } });
  }

  const hit = cache.get(t);
  if (hit && Date.now() - hit.t < TTL) {
    return hit.body
      ? NextResponse.json(hit.body, { headers: { "cache-control": "public, max-age=3600, s-maxage=43200" } })
      : NextResponse.json({ error: "sem rank" }, { status: 404, headers: { "cache-control": "public, s-maxage=3600" } });
  }

  try {
    const res = await fetch(`https://quote-feed.zacks.com/index?t=${encodeURIComponent(t)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, { ticker?: string; zacks_rank?: string; zacks_rank_text?: string; updated?: string }>;
    const d = json?.[t];
    const rank = Number(d?.zacks_rank);

    if (!d || !Number.isInteger(rank) || rank < 1 || rank > 5) {
      cache.set(t, { t: Date.now(), body: null });
      return NextResponse.json({ error: "sem rank" }, { status: 404, headers: { "cache-control": "public, s-maxage=3600" } });
    }

    const body: ZacksInfo = {
      ticker: t,
      rank,
      texto: String(d.zacks_rank_text ?? ""),
      atualizado: typeof d.updated === "string" ? d.updated : null,
    };
    cache.set(t, { t: Date.now(), body });
    return NextResponse.json(body, { headers: { "cache-control": "public, max-age=3600, s-maxage=43200" } });
  } catch (e) {
    // Falha de rede NÃO entra no cache do lambda — re-tenta na próxima.
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 502, headers: { "cache-control": "public, s-maxage=300" } });
  }
}
