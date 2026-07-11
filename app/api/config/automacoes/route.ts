// Card "Automações" em Configurações — lista os crons/Actions/rotinas com
// estado e liga/desliga. GET ?chave=X devolve só {ativo} (usado como gate por
// workflows do GitHub). Escrita bloqueada no modo demo.

import { NextResponse } from "next/server";
import { readAutomacoes, setAutomacao, isAutomacaoAtiva, AUTOMACOES } from "@/lib/automacoes";
import { isDemoRequest } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chave = searchParams.get("chave");
  try {
    if (chave) {
      // Gate leve (sem dados sensíveis) — workflows externos consultam antes de rodar.
      if (!AUTOMACOES.some((a) => a.chave === chave)) return NextResponse.json({ error: "chave desconhecida" }, { status: 400 });
      return NextResponse.json({ chave, ativo: await isAutomacaoAtiva(chave) });
    }
    return NextResponse.json({ automacoes: await readAutomacoes() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao ler automações" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (isDemoRequest()) return NextResponse.json({ error: "Indisponível no modo demonstração" }, { status: 403 });
  let body: { chave?: string; ativo?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (!body.chave || typeof body.ativo !== "boolean") return NextResponse.json({ error: "chave e ativo obrigatórios" }, { status: 400 });
  try {
    await setAutomacao(body.chave, body.ativo);
    return NextResponse.json({ ok: true, chave: body.chave, ativo: body.ativo });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao gravar" }, { status: 500 });
  }
}
