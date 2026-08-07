// Saúde REAL das automações do GitHub Actions (última execução de cada workflow).
// Endpoint separado do /api/config/automacoes de propósito: o card renderiza na
// hora com o estado dos interruptores e as badges de saúde chegam depois, sem
// atrasar a tela por causa de uma chamada à API do GitHub.

import { NextResponse } from "next/server";
import { AUTOMACOES } from "@/lib/automacoes";
import { arquivoDoLink, saudeDosWorkflows } from "@/lib/github-actions-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET() {
  try {
    // chave da automação → arquivo do workflow (só as do GitHub Actions têm link)
    const porChave: Record<string, string> = {};
    for (const a of AUTOMACOES) {
      const arq = a.tipo === "github" ? arquivoDoLink(a.link) : null;
      if (arq) porChave[a.chave] = arq;
    }

    const saude = await saudeDosWorkflows(Object.values(porChave));

    return NextResponse.json(
      { saude: Object.fromEntries(Object.entries(porChave).map(([chave, arq]) => [chave, saude[arq]])) },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
