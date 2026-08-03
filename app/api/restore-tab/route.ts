import { NextResponse } from "next/server";
import { restoreTabFromSheet } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Restaura uma aba a partir do snapshot em bkp_<aba> (rollback do cron/import).
// Só abas conhecidas de dados — evita restaurar abas arbitrárias.
const ALLOWED = new Set(["meus_proventos", "meus_ativos", "cambio"]);

// Operação DESTRUTIVA (sobrescreve a aba viva). Exige Bearer CRON_SECRET —
// nenhuma tela do app chama esta rota, então não há UI a quebrar. Fail-closed:
// sem o secret configurado, ninguém restaura.
function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function restore(tab: string | null): Promise<NextResponse> {
  const t = (tab ?? "").trim();
  if (!ALLOWED.has(t)) {
    return NextResponse.json(
      { error: `tab inválido. Use um de: ${[...ALLOWED].join(", ")}` },
      { status: 400 },
    );
  }
  const res = await restoreTabFromSheet(t);
  return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}

// Só POST (mutação nunca em GET — evita disparo por prefetch/crawler/CSRF).
export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  return restore(String(body?.tab ?? ""));
}
