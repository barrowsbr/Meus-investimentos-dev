import { NextResponse } from "next/server";
import { readHistoricoConfig, writeHistoricoConfig, recordHistorico } from "@/lib/historico-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  /api/config/historico            → { ativo }
// POST /api/config/historico { ativo }  → liga/desliga a gravação do histórico
// POST /api/config/historico { registrar: true } → registra um ponto AGORA (manual)
export async function GET() {
  try {
    const cfg = await readHistoricoConfig();
    return NextResponse.json(cfg, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.registrar === true) {
      const result = await recordHistorico({ force: true });
      return NextResponse.json({ ok: true, ...result });
    }
    if (typeof body?.ativo === "boolean") {
      await writeHistoricoConfig({ ativo: body.ativo });
      return NextResponse.json({ ok: true, ativo: body.ativo });
    }
    return NextResponse.json({ error: "Corpo inválido (esperado { ativo } ou { registrar })" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
