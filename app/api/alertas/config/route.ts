import { NextResponse } from "next/server";
import { readAlertasConfig, writeAlertasConfig } from "@/lib/alertas-store";

export const dynamic = "force-dynamic";

// GET — lê a config de alertas. NUNCA devolve o token do bot — apenas indica se
// está configurado (na env var ou salvo na planilha) e a origem. `botToken` é
// removido do payload de propósito.
export async function GET() {
  try {
    const config = await readAlertasConfig();
    const envToken = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim());
    const savedToken = !!(config.botToken && config.botToken.trim());
    const { botToken: _omit, ...safe } = config; void _omit;
    return NextResponse.json({
      ...safe,
      tokenConfigured: envToken || savedToken,
      tokenSource: envToken ? "env" : savedToken ? "config" : "none",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// POST — salva a config (writeTab herda assertNotDemo() + backup automático).
// O token só é atualizado quando um valor não-vazio é enviado; caso contrário
// preserva o token já salvo (para "Salvar" não apagar o token existente quando
// o campo é deixado em branco, já que o GET nunca reenvia o token pro cliente).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const existing = await readAlertasConfig();
    const chatId = String(body?.chatId ?? "").trim();
    const limiteRaw = Number(body?.limiteAlavancagemPct);
    const tokenInput = typeof body?.botToken === "string" ? body.botToken.trim() : "";
    // Flags booleanos: quando ausentes no payload, mantém ligado (default true).
    const flag = (v: unknown) => v === undefined ? true : Boolean(v);
    await writeAlertasConfig({
      chatId,
      botToken: tokenInput || existing.botToken,
      limiteAlavancagemPct: Number.isFinite(limiteRaw) && limiteRaw > 0 ? limiteRaw : 30,
      ativo: flag(body?.ativo),
      darfAtivo: flag(body?.darfAtivo),
      dirpfAtivo: flag(body?.dirpfAtivo),
      alavancagemAtivo: flag(body?.alavancagemAtivo),
      resumoAtivo: flag(body?.resumoAtivo),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
