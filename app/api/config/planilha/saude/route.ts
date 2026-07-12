// Teste de saúde da planilha — somente leitura. Ver lib/planilha-saude.ts.

import { NextResponse } from "next/server";
import { checarSaude } from "@/lib/planilha-saude";
import { isDemoRequest } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // varre ~15 abas em sequência

export async function GET() {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  try {
    const rel = await checarSaude();
    return NextResponse.json(rel);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro no teste de saúde" }, { status: 500 });
  }
}

// Manutenção sugerida pelo teste: compactar a twr_mensal (remove linhas
// corrompidas por locale e duplicatas do re-append, com backup automático).
export async function POST(req: Request) {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  let body: { action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  try {
    if (body.action === "corrigir-twr-mes") {
      const b = body as { month?: string; pct?: number };
      if (!b.month || typeof b.pct !== "number") return NextResponse.json({ error: "month e pct obrigatórios" }, { status: 400 });
      const { corrigirMesLock } = await import("@/lib/twr-monthly-lock");
      const r = await corrigirMesLock(b.month, b.pct);
      return NextResponse.json(r);
    }
    if (body.action === "compactar-twr") {
      const { compactLockTab } = await import("@/lib/twr-monthly-lock");
      const r = await compactLockTab();
      return NextResponse.json(r);
    }
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro na manutenção" }, { status: 500 });
  }
}
