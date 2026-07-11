// Teste de saúde da planilha — somente leitura. Ver lib/planilha-saude.ts.

import { NextResponse } from "next/server";
import { checarSaude } from "@/lib/planilha-saude";
import { isDemoRequest } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // varre ~15 abas em sequência

export async function GET() {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  try {
    const rel = await checarSaude();
    return NextResponse.json(rel);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro no teste de saúde" }, { status: 500 });
  }
}
