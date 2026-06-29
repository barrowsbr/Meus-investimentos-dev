import { NextRequest, NextResponse } from "next/server";
import { reconcileProventoValues } from "@/lib/ibkr-reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Reconciliação MANUAL de valores de proventos (IBKR → planilha).
 * GET  /api/sync/ibkr/reconcile             → dry-run (só lista divergências)
 * GET  /api/sync/ibkr/reconcile?dry_run=false → corrige os valores (com backup)
 * POST { dry_run: false }                   → corrige
 */
function handleError(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : "Erro desconhecido";
  const status = message.includes("não configurados") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const dryRun = req.nextUrl.searchParams.get("dry_run") !== "false"; // padrão: dry-run
    return NextResponse.json(await reconcileProventoValues({ dryRun }));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let dryRun = true;
    try {
      const b = await req.json();
      if (b?.dry_run === false || b?.dryRun === false) dryRun = false;
    } catch { /* defaults */ }
    return NextResponse.json(await reconcileProventoValues({ dryRun }));
  } catch (e) {
    return handleError(e);
  }
}
