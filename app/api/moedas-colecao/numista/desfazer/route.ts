// Desfaz o envio para o Numista EM LOTE: apaga na plataforma os itens
// registrados na aba `numista_envio` (até 30 por chamada — o card repete até
// zerar) e remove as linhas correspondentes da aba. Nada além do que NÓS
// criamos é tocado — a aba é o perímetro do undo.

import { NextResponse } from "next/server";
import { tokenColecao, removerItem, numistaAtivo } from "@/lib/numista";
import { readTabRaw, writeTab } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TAB = "numista_envio";

export async function POST() {
  if (!numistaAtivo()) return NextResponse.json({ error: "NUMISTA_API_KEY não configurada" }, { status: 400 });

  let headers: string[] = [];
  let rows: string[][] = [];
  try {
    ({ headers, rows } = await readTabRaw(TAB));
  } catch {
    return NextResponse.json({ removidos: 0, restantes: 0 });
  }
  if (rows.length === 0) return NextResponse.json({ removidos: 0, restantes: 0 });

  const auth = await tokenColecao();
  if ("erro" in auth) return NextResponse.json({ error: auth.erro }, { status: 502 });

  const colItem = headers.indexOf("item_id");
  if (colItem < 0) return NextResponse.json({ error: "aba numista_envio sem coluna item_id" }, { status: 500 });

  const lote = rows.slice(0, 30);
  const falhas: string[][] = [];
  let removidos = 0;
  for (const linha of lote) {
    const itemId = Number(linha[colItem]);
    if (Number.isFinite(itemId) && (await removerItem(auth.token, auth.userId, itemId))) removidos++;
    else falhas.push(linha); // fica na aba para nova tentativa
  }

  const restantes = [...falhas, ...rows.slice(30)];
  await writeTab(TAB, headers, restantes);

  return NextResponse.json({ removidos, restantes: restantes.length, falhas: falhas.length });
}
