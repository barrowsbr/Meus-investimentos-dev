// Ajuste (%) do dono sobre a tabela FIPE de cada carro — persistido na
// PLANILHA (aba app_config, escopo "bens", chave ajuste_<id>). +5 = vale 5%
// acima da FIPE; -8 = 8% abaixo. Entra no valor da página Bens e no patrimônio
// da Home (computeBensFipe aplica). Escrita requer service account (e é
// bloqueada em modo demo pelo assertNotDemo do gsheets).

import { NextRequest, NextResponse } from "next/server";
import { lerEscopo, gravarEscopo } from "@/lib/app-config";
import { bemPorId } from "@/lib/bens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const map = await lerEscopo("bens");
  const ajustes: Record<string, number> = {};
  for (const [chave, valor] of map) {
    if (!chave.startsWith("ajuste_")) continue;
    const pct = Number(String(valor).replace(",", "."));
    if (Number.isFinite(pct)) ajustes[chave.slice("ajuste_".length)] = pct;
  }
  return NextResponse.json({ ajustes });
}

export async function POST(req: NextRequest) {
  let body: { id?: string; pct?: number } = {};
  try { body = await req.json(); } catch { /* segue com vazio */ }
  const id = String(body.id ?? "");
  const pct = Number(body.pct);
  if (!bemPorId(id)) return NextResponse.json({ error: "veículo desconhecido" }, { status: 400 });
  if (!Number.isFinite(pct) || pct < -90 || pct > 100) {
    return NextResponse.json({ error: "pct inválido (use −90 a +100)" }, { status: 400 });
  }

  try {
    const atual = await lerEscopo("bens");
    atual.set(`ajuste_${id}`, String(Math.round(pct * 100) / 100));
    await gravarEscopo("bens", atual);
    return NextResponse.json({ ok: true, id, pct });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao gravar" }, { status: 500 });
  }
}
