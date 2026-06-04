import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/db/admin-auth";
import { isDbConfigured, getDb } from "@/lib/db/client";
import { SCHEMA_STATEMENTS } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Cria as tabelas/índices no banco SQLite (idempotente — CREATE ... IF NOT EXISTS).
// Seguro rodar várias vezes. POST protegido por ADMIN_SECRET/CRON_SECRET.
export async function POST(request: Request) {
  const auth = checkAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (!isDbConfigured()) {
    return NextResponse.json({ error: "TURSO_DATABASE_URL não configurado" }, { status: 400 });
  }

  try {
    const db = getDb();
    let applied = 0;
    for (const stmt of SCHEMA_STATEMENTS) {
      await db.execute(stmt);
      applied++;
    }
    return NextResponse.json({ ok: true, statementsApplied: applied, ranAt: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
