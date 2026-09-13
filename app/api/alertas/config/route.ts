import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth-server";
import { readAlertasConfig, writeAlertasConfig , parseConvidados } from "@/lib/alertas-store";

export const dynamic = "force-dynamic";

// GET — lê a config de alertas. NUNCA devolve o token do bot — apenas indica se
// está configurado (na env var ou salvo na planilha) e a origem. `botToken` é
// removido do payload de propósito.
export async function GET() {
  try {
    const config = await readAlertasConfig();
    const envToken = !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN.trim());
    const savedToken = !!(config.botToken && config.botToken.trim());
    // Fora do payload do cliente: o token do bot E o segredo do webhook. O
    // segredo é o que autentica as chamadas do Telegram — a UI não precisa
    // dele para nada (usa só o booleano de "bot ativo"), e mandá-lo ao
    // navegador é exposição sem contrapartida. Mesma regra do token.
    const { botToken: _t, webhookSecret: _w, ...safe } = config; void _t; void _w;
    return NextResponse.json({
      ...safe,
      tokenConfigured: envToken || savedToken,
      tokenSource: envToken ? "env" : savedToken ? "config" : "none",
      botRespostasAtivo: !!(config.webhookSecret && config.webhookSecret.trim()),
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
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const body = await req.json();
    const existing = await readAlertasConfig();
    const chatId = String(body?.chatId ?? "").trim();
    const limiteRaw = Number(body?.limiteAlavancagemPct);
    const tokenInput = typeof body?.botToken === "string" ? body.botToken.trim() : "";
    // Flags booleanos: quando ausentes no payload, mantém ligado (default true).
    const flag = (v: unknown) => v === undefined ? true : Boolean(v);
    // Horários do resumo (0–23, BRT): valida e deduplica; ausente/inválido → mantém o salvo.
    let horarios: number[] = existing.resumoHorarios;
    if (Array.isArray(body?.resumoHorarios)) {
      const parsed: number[] = (body.resumoHorarios as unknown[])
        .map((h) => Number(h))
        .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
      horarios = [...new Set(parsed)].sort((a, b) => a - b);
    }
    await writeAlertasConfig({
      chatId,
      botToken: tokenInput || existing.botToken,
      // PRESERVA o segredo do webhook: salvar ajustes de alerta pela UI não
      // pode desligar as respostas do bot em silêncio.
      webhookSecret: existing.webhookSecret,
      // Convidados: só troca quando o payload traz a lista (a UI manda um
      // array). Ausente = mantém — mesmo cuidado do webhookSecret.
      convidados: Array.isArray(body?.convidados) ? parseConvidados(body.convidados.join(",")) : existing.convidados,
      limiteAlavancagemPct: Number.isFinite(limiteRaw) && limiteRaw > 0 ? limiteRaw : 30,
      ativo: flag(body?.ativo),
      darfAtivo: flag(body?.darfAtivo),
      dirpfAtivo: flag(body?.dirpfAtivo),
      alavancagemAtivo: flag(body?.alavancagemAtivo),
      resumoAtivo: flag(body?.resumoAtivo),
      resumoHorarios: horarios.length > 0 ? horarios : existing.resumoHorarios,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
