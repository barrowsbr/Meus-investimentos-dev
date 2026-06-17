import { NextResponse } from "next/server";
import { readGoldenSource, goldenSourceStatus } from "@/lib/db-cotacoes";
import { runCotacoesSync } from "@/lib/sync-cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function lastBusinessDay(): string {
  const d = new Date();
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() - 2);
  else if (day === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

let running = false;

export async function GET() {
  try {
    const existing = await readGoldenSource();
    const status = goldenSourceStatus(existing);

    if (status.empty) {
      if (running) return NextResponse.json({ status: "running" });
      running = true;
      try {
        const report = await runCotacoesSync("update");
        return NextResponse.json({ status: "synced", newPoints: report.newPoints });
      } finally {
        running = false;
      }
    }

    const target = lastBusinessDay();
    if (status.lastDate >= target) {
      return NextResponse.json({ status: "fresh", lastDate: status.lastDate });
    }

    if (running) return NextResponse.json({ status: "running" });
    running = true;
    try {
      const report = await runCotacoesSync("update");
      return NextResponse.json({
        status: "synced",
        lastDate: report.status.empty ? null : (report.status as { lastDate: string }).lastDate,
        newPoints: report.newPoints,
        tickerErrors: report.tickerErrors,
      });
    } finally {
      running = false;
    }
  } catch (e) {
    running = false;
    return NextResponse.json(
      { status: "error", error: e instanceof Error ? e.message : "Erro desconhecido" },
      { status: 500 },
    );
  }
}
