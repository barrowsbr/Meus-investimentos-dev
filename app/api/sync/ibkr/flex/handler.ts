import { NextRequest, NextResponse } from "next/server";
import { runFlexSync } from "@/lib/ibkr-flex-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza trades + proventos da IBKR via Flex Web Service (sem gateway).
 * GET  /api/sync/ibkr/flex?dry_run=true&mode=both
 * POST /api/sync/ibkr/flex  { mode, dry_run }
 * Sem dry_run, grava as linhas faltantes (com backup automático da aba).
 */
function handleError(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : "Erro desconhecido";
  const status = message.includes("não configurados") ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sp = req.nextUrl.searchParams;
    const mode = sp.get("mode") ?? "both";
    const dryRun = sp.get("dry_run") === "true" || sp.get("dryRun") === "true";
    const debug = sp.get("debug") === "1" || sp.get("debug") === "true";
    // debug força dry-run (só leitura) para inspecionar sem gravar.
    return NextResponse.json(await runFlexSync({ mode, dryRun: dryRun || debug, debug }));
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let mode = "both";
    let dryRun = false;
    try {
      const body = await req.json();
      if (body?.mode) mode = String(body.mode);
      if (body?.dry_run === true || body?.dryRun === true) dryRun = true;
    } catch {
      /* sem body → usa defaults */
    }
    return NextResponse.json(await runFlexSync({ mode, dryRun }));
  } catch (e) {
    return handleError(e);
  }
}
