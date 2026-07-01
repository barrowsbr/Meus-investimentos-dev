import { NextResponse } from "next/server";
import { readAlertasConfig, writeAlertasConfig } from "@/lib/alertas-store";

export const dynamic = "force-dynamic";

// GET — lê a config de alertas (chat_id, limite de alavancagem, ativo/inativo).
// `tokenConfigured` só informa se a env var existe no servidor — nunca expõe o token.
export async function GET() {
  try {
    const config = await readAlertasConfig();
    return NextResponse.json({ ...config, tokenConfigured: !!process.env.TELEGRAM_BOT_TOKEN });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST — salva a config (writeTab herda assertNotDemo() + backup automático).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const chatId = String(body?.chatId ?? "").trim();
    const limiteRaw = Number(body?.limiteAlavancagemPct);
    const ativo = Boolean(body?.ativo);
    await writeAlertasConfig({
      chatId,
      limiteAlavancagemPct: Number.isFinite(limiteRaw) && limiteRaw > 0 ? limiteRaw : 30,
      ativo,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
