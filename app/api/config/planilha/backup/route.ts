// Backup diário rotativo + rollback — ver lib/backup-diario.ts.
// GET → status (última fotografia por aba)
// POST {action:"daily"}          → roda o backup se ainda não rodou hoje (ping do shell)
// POST {action:"run"}            → força o backup agora (botão do card)
// POST {action:"rollback", tab}  → restaura a aba a partir da fotografia diária

import { NextResponse } from "next/server";
import { backupStatus, runDailyBackup, rollbackTab } from "@/lib/backup-diario";
import { isDemoRequest } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // fotografa ~15 abas (leitura+escrita cada)

export async function GET() {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  try {
    return NextResponse.json(await backupStatus());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao ler status" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  let body: { action?: string; tab?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  try {
    if (body.action === "daily") {
      const r = await runDailyBackup();
      return NextResponse.json(r);
    }
    if (body.action === "run") {
      const r = await runDailyBackup({ force: true });
      return NextResponse.json(r);
    }
    if (body.action === "rollback") {
      if (!body.tab) return NextResponse.json({ error: "tab obrigatória" }, { status: 400 });
      const r = await rollbackTab(body.tab);
      return r.ok ? NextResponse.json(r) : NextResponse.json(r, { status: 400 });
    }
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro no backup" }, { status: 500 });
  }
}
