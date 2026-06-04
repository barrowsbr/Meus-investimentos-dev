import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/db/admin-auth";
import { isDbConfigured } from "@/lib/db/client";
import { runImport, DEFAULT_TABLES } from "@/lib/db/import";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Importa dados do Google Sheets → SQLite (somente leitura do Sheets).
// Idempotente. POST protegido. Parâmetros (query ou JSON body):
//   email   — usuário-alvo dos dados pessoais (default: ADMIN_EMAIL)
//   nome    — nome do usuário (opcional)
//   tables  — lista separada por vírgula (default: tudo menos db_cotacoes)
//             use ?tables=db_cotacoes para importar o histórico de cotações à parte.
export async function POST(request: Request) {
  const auth = checkAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  if (!isDbConfigured()) {
    return NextResponse.json({ error: "TURSO_DATABASE_URL não configurado" }, { status: 400 });
  }

  const url = new URL(request.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};
  try { body = await request.json(); } catch { /* sem body */ }

  const email = (url.searchParams.get("email") || body.email || process.env.ADMIN_EMAIL || "").trim();
  const nome = (url.searchParams.get("nome") || body.nome || "").trim() || undefined;
  if (!email) {
    return NextResponse.json({ error: "Informe ?email=... (ou defina ADMIN_EMAIL)" }, { status: 400 });
  }

  const tablesParam = url.searchParams.get("tables") || body.tables;
  const tables: string[] = tablesParam
    ? String(tablesParam).split(",").map((t) => t.trim()).filter(Boolean)
    : DEFAULT_TABLES;

  try {
    const report = await runImport({ email, nome, tables });
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
