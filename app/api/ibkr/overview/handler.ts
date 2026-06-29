import { NextResponse } from "next/server";
import { buildIbkrOverview } from "@/lib/ibkr-overview";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await buildIbkrOverview());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    const status = message.includes("não configurados") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
