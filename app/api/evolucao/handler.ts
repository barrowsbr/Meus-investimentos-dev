import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { parseEvolucaoPatrimonio } from "@/lib/patrimonio";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  try {
    const store = getDataStore();
    const rows = await store.fetchTab("lb_historic");
    const evolucao = parseEvolucaoPatrimonio(rows);
    return NextResponse.json(evolucao);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
