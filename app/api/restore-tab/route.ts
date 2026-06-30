import { NextResponse } from "next/server";
import { restoreTabFromSheet } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Restaura uma aba a partir do snapshot em bkp_<aba> (rollback do cron/import).
// Só abas conhecidas de dados — evita restaurar abas arbitrárias.
const ALLOWED = new Set(["meus_proventos", "meus_ativos", "cambio"]);

async function restore(tab: string | null): Promise<NextResponse> {
  const t = (tab ?? "").trim();
  if (!ALLOWED.has(t)) {
    return NextResponse.json(
      { error: `tab inválido. Use um de: ${[...ALLOWED].join(", ")}` },
      { status: 400 },
    );
  }
  const res = await restoreTabFromSheet(t);
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}

export async function GET(req: Request) {
  return restore(new URL(req.url).searchParams.get("tab"));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return restore(String(body?.tab ?? ""));
}
