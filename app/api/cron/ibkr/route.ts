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

  // Liga/desliga em Configurações → Automações (o cron continua disparando;
  // o endpoint é quem pula quando desligado).
  const { isAutomacaoAtiva } = await import("@/lib/automacoes");
  if (!(await isAutomacaoAtiva("cron_ibkr"))) {
    return NextResponse.json({ ok: true, skipped: "desligado em Configurações → Automações" });
  }

  try {
    // Trava de volume: o cron insere sozinho até 40 linhas novas por aba; acima
    // disso é anomalia (dedup falhou?) — bloqueia e pede revisão manual.
    const report = await runFlexSync({ mode: "both", dryRun: false, maxNovos: 40 });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
