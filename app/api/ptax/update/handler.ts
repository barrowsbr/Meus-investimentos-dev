import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { getServiceAccountAuth } from "@/lib/gsheets";
import { salvarPtaxNaPlanilha } from "@/lib/ptax-store";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Gatilho manual/na abertura da página Impostos. A MESMA lógica roda todo dia
// útil no cron de cotações (lib/ptax-store.ts) — este endpoint virou reforço.
export async function POST() {
  const denied = await requireOwner();
  if (denied) return denied;
  if (!getServiceAccountAuth()) {
    return NextResponse.json(
      { error: "Escrita requer GOOGLE_SERVICE_ACCOUNT_JSON" },
      { status: 500 },
    );
  }

  const r = await salvarPtaxNaPlanilha();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
