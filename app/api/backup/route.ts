import { NextRequest, NextResponse } from "next/server";
import { backupTab, downloadTabCsv } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TABS = ["meus_ativos", "meus_proventos", "renda_fixa", "fixa_aberta", "cambio"];

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab");
  if (!tab || !ALLOWED_TABS.includes(tab)) {
    return NextResponse.json(
      { error: `Tab inválida. Use: ${ALLOWED_TABS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const csv = await downloadTabCsv(tab);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${tab}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao gerar CSV" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab");
  if (!tab || !ALLOWED_TABS.includes(tab)) {
    return NextResponse.json(
      { error: `Tab inválida. Use: ${ALLOWED_TABS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const result = await backupTab(tab);
    return NextResponse.json({
      ok: true,
      tab,
      backupName: result.backupName,
      rows: result.rows,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao criar backup" },
      { status: 500 },
    );
  }
}
