import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";

export const dynamic = "force-dynamic";

const TABS = [
  "meus_ativos",
  "meus_proventos",
  "renda_fixa",
  "fixa_aberta",
  "cambio",
  "p_tax",
  "lb_historic",
  "financas",
  "financas_pessoal",
];

export async function GET() {
  const results: Record<string, { columns: string[]; rows: number; sample: Record<string, unknown> | null; error?: string }> = {};

  for (const tab of TABS) {
    try {
      const data = await fetchTab(tab);
      results[tab] = {
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        rows: data.length,
        sample: data.length > 0 ? data[0] : null,
      };
    } catch (e) {
      results[tab] = {
        columns: [],
        rows: 0,
        sample: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
