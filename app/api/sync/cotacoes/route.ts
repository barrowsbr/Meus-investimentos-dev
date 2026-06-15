import { NextResponse } from "next/server";
import { readGoldenSource, goldenSourceStatus } from "@/lib/db-cotacoes";
import { runCotacoesSync, detectAnomalies } from "@/lib/sync-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── GET: status + anomalias detectadas na base atual ─────────────────────────────

export async function GET() {
  try {
    const data = await readGoldenSource();
    const status = goldenSourceStatus(data);
    const anomalies = detectAnomalies(data);
    return NextResponse.json({
      ...status,
      tickers: data.tickers,
      anomalies: anomalies.slice(0, 200),
      anomalyCount: anomalies.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// ── POST: backfill or update (manual, from Configurações) ────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action === "backfill" ? "backfill" : "update";
    const lookbackYears = Math.min(Number(body.lookback_years ?? 5), 10);
    const report = await runCotacoesSync(action, lookbackYears);
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
