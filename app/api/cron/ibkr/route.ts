import { NextResponse } from "next/server";
import { runFlexSync } from "@/lib/ibkr-flex-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Sync diário IBKR (trades + proventos) via Flex Web Service — sem gateway.
// Disparado pelo Vercel Cron (vercel.json). A Vercel envia automaticamente
// `Authorization: Bearer ${CRON_SECRET}` quando CRON_SECRET está definido.
// A dedup + backup tornam execuções repetidas seguras (nada é duplicado).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  try {
    const report = await runFlexSync({ mode: "both", dryRun: false });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
