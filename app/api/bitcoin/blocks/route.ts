import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Blocos recentes da blockchain do Bitcoin via mempool.space (grátis, sem key).
// Foco estético: alimenta a faixa de "blocos minerados" na página de cripto.
// Proxy no servidor (evita CORS) + normalização + cache curto (bloco ~10min).

interface MempoolBlock {
  id: string;
  height: number;
  timestamp: number;
  tx_count: number;
  size: number;
  weight: number;
  extras?: {
    totalFees?: number;
    medianFee?: number;
    feeRange?: number[];
    reward?: number;
    pool?: { name?: string; slug?: string };
  };
}

export interface BitcoinBlock {
  height: number;
  id: string;
  timestamp: number;      // unix seconds
  txCount: number;
  sizeMB: number;
  medianFee: number;      // sat/vB
  feeMin: number;
  feeMax: number;
  totalFeesBTC: number;
  rewardBTC: number;
  pool: string;
}

const SATS = 100_000_000;

function normalize(b: MempoolBlock): BitcoinBlock {
  const range = b.extras?.feeRange ?? [];
  return {
    height: b.height,
    id: b.id,
    timestamp: b.timestamp,
    txCount: b.tx_count,
    sizeMB: b.size / 1_000_000,
    medianFee: Math.round((b.extras?.medianFee ?? 0) * 10) / 10,
    feeMin: range.length ? Math.round(range[0]) : 0,
    feeMax: range.length ? Math.round(range[range.length - 1]) : 0,
    totalFeesBTC: (b.extras?.totalFees ?? 0) / SATS,
    rewardBTC: (b.extras?.reward ?? 0) / SATS,
    pool: b.extras?.pool?.name ?? "—",
  };
}

export async function GET() {
  try {
    const res = await fetch("https://mempool.space/api/v1/blocks", {
      headers: { "User-Agent": "meus-investimentos" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`mempool.space HTTP ${res.status}`);
    const raw: MempoolBlock[] = await res.json();
    const blocks = (Array.isArray(raw) ? raw : []).slice(0, 12).map(normalize);
    return NextResponse.json(
      { blocks, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=45, stale-while-revalidate=120" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ blocks: [], error: msg }, { status: 200 });
  }
}
