import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";
import { MARGIN_TAB, parseMarginRows, computeMarginResumo, aplicarAlavancagem } from "@/lib/margin";
import { buildApuracao } from "@/lib/tax/apuracao-service";
import { computeAlertas, shouldSend } from "@/lib/alertas";
import { readAlertasConfig, readAlertasEstado, writeAlertasEstado } from "@/lib/alertas-store";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Alertas determinísticos (DARF a vencer/vencido, prazo DIRPF, alavancagem
// acima do limite) via Telegram — SEM monitorar preço em tempo real. Triggered
// pelo Vercel Cron definido em vercel.json. Mesmo padrão de auth dos outros
// crons (Authorization: Bearer CRON_SECRET).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  try {
    const config = await readAlertasConfig();
    if (!config.ativo || !config.chatId) {
      return NextResponse.json({
        ok: true,
        ranAt: new Date().toISOString(),
        skipped: !config.chatId ? "chat_id não configurado" : "alertas desativados",
      });
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const mesAtual = hoje.slice(0, 7);

    const [{ apuracao }, alavancagemPct] = await Promise.all([
      buildApuracao(),
      computeAlavancagemAtual(),
    ]);

    const triggers = computeAlertas({
      meses: apuracao.meses,
      mesAtual,
      hoje,
      alavancagemPct,
      limiteAlavancagemPct: config.limiteAlavancagemPct,
    });

    const estado = await readAlertasEstado();
    const toSend = triggers.filter((t) => shouldSend(t, estado, hoje));

    const enviados: string[] = [];
    const falhas: string[] = [];
    for (const t of toSend) {
      const res = await sendTelegramMessage(config.chatId, t.texto);
      if (res.ok) { enviados.push(t.chave); estado[t.chave] = hoje; }
      else falhas.push(`${t.chave}: ${res.error}`);
    }
    if (enviados.length > 0) await writeAlertasEstado(estado);

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      avaliados: triggers.map((t) => t.chave),
      enviados,
      falhas,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Mesma matemática de app/api/cotacoes/route.ts (snapshot canônico + margin) —
// só o suficiente para o alavancagemPct, sem os extras específicos daquela rota.
async function computeAlavancagemAtual(): Promise<number> {
  const store = getDataStore();
  const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows, marginRows] = await Promise.all([
    store.fetchTab("meus_ativos"),
    store.fetchTab("meus_proventos"),
    store.fetchTab("fixa_aberta"),
    store.fetchTab("cambio").catch(() => []),
    store.fetchTab("p_tax").catch(() => []),
    store.fetchTab(MARGIN_TAB).catch(() => []),
  ]);

  const tickerSet = new Map<string, { moeda: string; corretora: string }>();
  for (const row of transacoes) {
    const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
    if (!ticker || tickerSet.has(ticker)) continue;
    tickerSet.set(ticker, {
      moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
      corretora: String(row["corretora"] ?? "").trim(),
    });
  }
  const tickers = [...tickerSet.entries()].map(([ticker, i]) => ({ ticker, moeda: i.moeda, corretora: i.corretora }));

  const cotacoes = await fetchCotacoes(tickers);
  const fxAtual = cotacoes.fx;
  const cambio = calcularCambioMetrics(cambioRows, fxAtual);
  const fxCusto = buildPmFxRates(cambio);
  const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
  const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);

  const marginResumo = computeMarginResumo(parseMarginRows(marginRows), {
    BRL: 1,
    USD: fxAtual.USDBRL,
    EUR: fxAtual.EURBRL,
    GBP: fxAtual.GBPBRL,
    CAD: fxAtual.CADBRL,
    CHF: fxAtual.CHFBRL ?? 0,
    JPY: fxAtual.JPYBRL ?? 0,
  });
  return aplicarAlavancagem(snapshot.totalPatrimonioBRL, marginResumo).alavancagemPct;
}
