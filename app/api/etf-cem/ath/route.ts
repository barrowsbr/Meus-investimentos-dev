// ETF Cem — TOPO HISTÓRICO (ATH) por símbolo, via fechamento MENSAL do Yahoo
// desde 1970. Rota pesada: o cliente pede em chunks de até 25 símbolos e o
// resultado quase não muda — cache do lambda 7 dias + CDN 7 dias. Quando o
// preço fura o ATH guardado, a UI usa max(ath, preço) e a distância vai a 0.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface AthInfo { ath: number; ano: number | null }

const cache = new Map<string, { t: number; info: AthInfo | null }>();
const TTL = 7 * 24 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAth(yf: any, sym: string): Promise<AthInfo | null> {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.t < TTL) return hit.info;
  try {
    const r = await yf.chart(sym, { period1: "1970-01-01", interval: "1mo" });
    const quotes: Array<{ high?: number | null; close?: number | null; date?: Date }> = r?.quotes ?? [];
    let ath = 0;
    let ano: number | null = null;
    for (const q of quotes) {
      const v = (typeof q.high === "number" && isFinite(q.high) ? q.high : null) ?? (typeof q.close === "number" && isFinite(q.close) ? q.close : null);
      if (v !== null && v > ath) { ath = v; ano = q.date ? new Date(q.date).getUTCFullYear() : null; }
    }
    const info = ath > 0 ? { ath: Math.round(ath * 100) / 100, ano } : null;
    cache.set(sym, { t: Date.now(), info });
    return info;
  } catch {
    return null; // não cacheia falha — re-tenta na próxima
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{1,6}(-[A-Z])?$/.test(s))
    .slice(0, 25);
  if (symbols.length === 0) return NextResponse.json({ error: "symbols obrigatório (até 25, CSV)" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const YF: any = (await import("yahoo-finance2")).default;
  const yf = typeof YF === "function" ? new YF() : YF;

  const ath: Record<string, AthInfo> = {};
  // Concorrência 6 — 25 símbolos em ~4 levas, folgado no maxDuration.
  for (let i = 0; i < symbols.length; i += 6) {
    const leva = symbols.slice(i, i + 6);
    const res = await Promise.all(leva.map((s) => fetchAth(yf, s)));
    leva.forEach((s, j) => { if (res[j]) ath[s] = res[j]!; });
  }

  return NextResponse.json({ ath }, {
    headers: { "Cache-Control": "s-maxage=604800, stale-while-revalidate=86400" },
  });
}
