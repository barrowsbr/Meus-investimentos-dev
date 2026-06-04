import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/db/admin-auth";
import { isDbConfigured, getDb } from "@/lib/db/client";
import { TABLE_NAMES } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnóstico do banco SQLite: configurado? tabelas existem? contagem de linhas.
export async function GET(request: Request) {
  const auth = checkAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (!isDbConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "Banco dormente — defina TURSO_DATABASE_URL e TURSO_AUTH_TOKEN para ativar.",
    });
  }

  try {
    const db = getDb();
    const counts: Record<string, number | string> = {};
    for (const t of TABLE_NAMES) {
      try {
        const res = await db.execute(`SELECT COUNT(*) AS n FROM ${t}`);
        counts[t] = Number(res.rows[0].n);
      } catch {
        counts[t] = "ausente (rode /migrate)";
      }
    }
    return NextResponse.json({ configured: true, counts, checkedAt: new Date().toISOString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ configured: true, ok: false, error: msg }, { status: 500 });
  }
}
