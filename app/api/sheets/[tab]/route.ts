import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export const revalidate = 300; // cache 5 min

export async function GET(
  _req: Request,
  { params }: { params: { tab: string } }
) {
  const allowed = [
    "meus_ativos",
    "meus_proventos",
    "renda_fixa",
    "fixa_aberta",
    "cambio",
    "db_cotacoes",
    "composicao",
    "p_tax",
    "lb_historic",
    "historico_patrimonio",
    // "financas" (órfã) saiu da allowlist — aba pode ser apagada da planilha
    "financas_pessoal",
  ];

  const tab = params.tab;
  if (!allowed.includes(tab)) {
    return NextResponse.json({ error: "Tab não permitida" }, { status: 400 });
  }

  try {
    const store = getDataStore();
    const data = await store.fetchTab(tab);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
