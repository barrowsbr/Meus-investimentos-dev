// ─────────────────────────────────────────────────────────────────────────────
// Digest diário: reúne (server-side, para o cron) os números do dia — patrimônio,
// resultado, efeito do câmbio, melhores/piores e IBKR — + manchetes. Alimenta a
// imagem (next/og) e a legenda enviadas pro Telegram. NÃO recalcula nada: usa o
// snapshot canônico (calcularSnapshot) e buildIbkrOverview.
// ─────────────────────────────────────────────────────────────────────────────

import { getDataStore } from "@/lib/data-store";
import { fetchCotacoes, fetchQuotes } from "@/lib/cotacoes";
import { calcularSnapshot } from "@/lib/portfolio";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "@/lib/cambio";
import { buildIbkrOverview } from "@/lib/ibkr-overview";
import { fetchDigestHeadlines, type DigestHeadline } from "@/lib/news-digest";

export interface DigestMover {
  ticker: string;
  changePct: number;
  changeBRL: number;
  moeda: string;
}

export interface DigestIbkr {
  patrimonioUSD: number | null;
  patrimonioBRL: number;
  lucroDiaBRL: number;
  lucroDiaUSD: number | null;
  lucroDiaPct: number | null;
}

export interface DigestExposure {
  moeda: string;
  valorBRL: number;
  pct: number;
}

export interface DigestMercado {
  label: string;            // IBOV, S&P 500, BTC
  changePct: number;
}

export interface DigestData {
  dateLabel: string;
  timeLabel: string;
  patrimonioBRL: number;
  patrimonioUSD: number | null;
  dayBRL: number;
  dayPct: number;
  fxDayBRL: number;         // parcela do resultado do dia vinda do câmbio
  usdbrl: number;
  usdbrlDayPct: number | null;
  ibkr: DigestIbkr | null;
  gainers: DigestMover[];
  losers: DigestMover[];
  exposicao: DigestExposure[];
  headlines: DigestHeadline[];
  // ── Seções extras do card vertical ──
  rvBRL: number;                    // patrimônio em renda variável
  rfBRL: number;                    // patrimônio em renda fixa
  proventosMesBRL: number;          // proventos recebidos no mês corrente
  proventosMedia12mBRL: number;     // média mensal dos últimos 12 meses
  proventosTotalBRL: number;        // acumulado histórico
  mercados: DigestMercado[];        // IBOV / S&P 500 / BTC — variação do dia
}

const TZ = "America/Sao_Paulo";

function labels(): { dateLabel: string; timeLabel: string } {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long" });
  const timeLabel = now.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return { dateLabel: dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1), timeLabel };
}

export async function buildDigest(): Promise<DigestData> {
  const store = getDataStore();
  const [transacoes, proventos, fixaAberta, cambioRows, ptaxRows, headlines] = await Promise.all([
    store.fetchTab("meus_ativos"),
    store.fetchTab("meus_proventos"),
    store.fetchTab("fixa_aberta"),
    store.fetchTab("cambio").catch(() => []),
    store.fetchTab("p_tax").catch(() => []),
    fetchDigestHeadlines(5).catch(() => [] as DigestHeadline[]),
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

  // Variação cambial do dia (para o efeito do câmbio e o par USD/BRL) e os
  // termômetros de mercado (IBOV / S&P 500 / BTC) numa só chamada — best-effort.
  const fxDayChange: Record<string, { change: number; changePct: number }> = {};
  const mercados: DigestMercado[] = [];
  try {
    const fxTk: Record<string, string> = { USD: "BRL=X", EUR: "EURBRL=X", CAD: "CADBRL=X", GBP: "GBPBRL=X" };
    const mktTk: Record<string, string> = { IBOV: "^BVSP", "S&P 500": "^GSPC", BTC: "BTC-USD" };
    const q = await fetchQuotes([...Object.values(fxTk), ...Object.values(mktTk)]);
    for (const [ccy, tk] of Object.entries(fxTk)) {
      const qq = q.quotes[tk];
      if (qq) fxDayChange[ccy] = { change: qq.change, changePct: qq.changePercent };
    }
    for (const [label, tk] of Object.entries(mktTk)) {
      const qq = q.quotes[tk];
      if (qq && qq.changePercent != null) mercados.push({ label, changePct: qq.changePercent });
    }
  } catch { /* não crítico */ }

  const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate, fxDayChange);

  // IBKR (best-effort).
  let ibkr: DigestIbkr | null = null;
  try {
    const ov = await buildIbkrOverview();
    ibkr = {
      patrimonioUSD: ov.kpis.patrimonioUSD,
      patrimonioBRL: ov.kpis.patrimonioBRL,
      lucroDiaBRL: ov.kpis.lucroDiaBRL,
      lucroDiaUSD: ov.kpis.lucroDiaUSD,
      lucroDiaPct: ov.kpis.lucroDiaPct,
    };
  } catch { /* IBKR indisponível → seção some */ }

  // Melhores e piores do dia (posições com variação conhecida e valor relevante).
  const movers = snapshot.positions
    .filter(p => (p.quantidade ?? 0) > 0 && p.dayChangePct != null && p.valorAtualBRL > 50)
    .map(p => ({ ticker: p.ticker, changePct: p.dayChangePct as number, changeBRL: p.dayChangeBRL ?? 0, moeda: p.moeda ?? "BRL" }));
  const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
  const gainers = sorted.filter(m => m.changePct > 0).slice(0, 5);
  const losers = sorted.filter(m => m.changePct < 0).slice(-5).reverse();

  // Exposição cambial (moedas != BRL, top 4 por valor).
  const expo = snapshot.exposicaoCambial ?? {};
  const totalExpo = Object.values(expo).reduce((s, v) => s + Math.abs(v), 0) || 1;
  const exposicao = Object.entries(expo)
    .filter(([m]) => m !== "BRL")
    .map(([moeda, valorBRL]) => ({ moeda, valorBRL, pct: (valorBRL / totalExpo) * 100 }))
    .filter(e => e.valorBRL > 0)
    .sort((a, b) => b.valorBRL - a.valorBRL)
    .slice(0, 4);

  // Proventos: mês corrente (chave YYYY-MM, fuso de Brasília) + média 12m.
  const porMes = snapshot.proventosMensais ?? {};
  const mesAtualKey = new Date().toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);
  const proventosMesBRL = porMes[mesAtualKey] ?? 0;
  const ult12 = Object.keys(porMes).sort().slice(-12);
  const proventosMedia12mBRL = ult12.length > 0
    ? ult12.reduce((s, k) => s + (porMes[k] ?? 0), 0) / ult12.length
    : 0;

  const { dateLabel, timeLabel } = labels();

  return {
    dateLabel,
    timeLabel,
    patrimonioBRL: snapshot.totalPatrimonioBRL,
    patrimonioUSD: fxAtual.USDBRL > 0 ? snapshot.totalPatrimonioBRL / fxAtual.USDBRL : null,
    dayBRL: snapshot.dayChangeTotalBRL,
    dayPct: snapshot.dayChangeTotalPct,
    fxDayBRL: snapshot.dayChangeFxTotalBRL,
    usdbrl: fxAtual.USDBRL,
    usdbrlDayPct: fxDayChange["USD"]?.changePct ?? null,
    ibkr,
    gainers,
    losers,
    exposicao,
    headlines,
    rvBRL: snapshot.rvPatrimonioBRL,
    rfBRL: snapshot.rfPatrimonioBRL,
    proventosMesBRL,
    proventosMedia12mBRL,
    proventosTotalBRL: snapshot.totalProventosBRL,
    mercados,
  };
}

// ── Legenda (HTML) enviada junto com a foto ───────────────────────────────────
// UI Telegram-nativa, SEM duplicar o que a imagem já mostra:
//   • 1ª linha = preview da notificação push (resultado do dia + patrimônio).
//   • Manchetes viram LINKS clicáveis (a imagem não é clicável) dentro de um
//     <blockquote expandable> — recolhido por padrão, toque expande.
// Limite do Telegram: 1024 chars VISÍVEIS (URLs em href não contam).
function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function signMoney(v: number): string {
  return `${v >= 0 ? "+" : ""}${money(v)}`;
}
function signPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function safeHref(url: string): string {
  return url.replace(/"/g, "%22").replace(/&/g, "&amp;");
}

/** URL pública do app para os botões inline (env explícita > domínio Vercel). */
export function resolveAppUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return null;
}

export function buildDigestCaption(d: DigestData): string {
  const up = d.dayBRL >= 0;
  const lines: string[] = [
    // Preview da push: o dia em uma linha.
    `${up ? "🟢" : "🔴"} <b>${signMoney(d.dayBRL)} (${signPct(d.dayPct)})</b> · Patrimônio <b>${money(d.patrimonioBRL)}</b>`,
    `<i>Resumo do dia — ${escapeHtml(d.dateLabel)}, ${d.timeLabel}</i>`,
  ];
  if (d.headlines.length) {
    const items = d.headlines.slice(0, 4).map(h => {
      const titulo = h.titulo.length > 90 ? `${h.titulo.slice(0, 89)}…` : h.titulo;
      return `▸ <a href="${safeHref(h.link)}">${escapeHtml(titulo)}</a> — ${escapeHtml(h.fonte)}`;
    });
    lines.push(`<blockquote expandable>📰 <b>Manchetes do dia</b>\n${items.join("\n")}</blockquote>`);
  }
  return lines.join("\n");
}
