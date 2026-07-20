// Catálogo de jogos lido AO VIVO da pasta do Drive do dono (por console).
// Sem catálogo versionado — ver lib/gameboy-catalog.ts.

import { NextResponse } from "next/server";
import { lerCatalogoDrive } from "@/lib/gameboy-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const consoles = await lerCatalogoDrive();
    return NextResponse.json(
      { consoles, total: consoles.reduce((s, c) => s + c.jogos.length, 0) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
    );
  } catch (e) {
    // Drive API desabilitada na chave/projeto, pasta privada, etc. — a UI
    // mostra a mensagem e cai no "Abrir arquivo".
    return NextResponse.json(
      { consoles: [], total: 0, erro: e instanceof Error ? e.message : "falha ao ler o Drive" },
      { status: 200 },
    );
  }
}
