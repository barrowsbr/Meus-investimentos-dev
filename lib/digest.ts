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

  // Variação cambial do dia (para o efeito do câmbio e o par USD/BRL).
  const fxDayChange: Record<string, { change: number; changePct: number }> = {};
  try {
    const fxTk: Record<string, string> = { USD: "BRL=X", EUR: "EURBRL=X", CAD: "CADBRL=X", GBP: "GBPBRL=X" };
    const q = await fetchQuotes(Object.values(fxTk));
    for (const [ccy, tk] of Object.entries(fxTk)) {
      const qq = q.quotes[tk];
      if (qq) fxDayChange[ccy] = { change: qq.change, changePct: qq.changePercent };
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
  const gainers = sorted.filter(m => m.changePct > 0).slice(0, 3);
  const losers = sorted.filter(m => m.changePct < 0).slice(-3).reverse();

  // Exposição cambial (moedas != BRL, top 3 por valor).
  const expo = snapshot.exposicaoCambial ?? {};
  const totalExpo = Object.values(expo).reduce((s, v) => s + Math.abs(v), 0) || 1;
  const exposicao = Object.entries(expo)
    .filter(([m]) => m !== "BRL")
    .map(([moeda, valorBRL]) => ({ moeda, valorBRL, pct: (valorBRL / totalExpo) * 100 }))
    .filter(e => e.valorBRL > 0)
    .sort((a, b) => b.valorBRL - a.valorBRL)
    .slice(0, 3);

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
  };
}

// ── Legenda (texto) enviada junto com a foto (Markdown, ≤1024 chars) ──────────
function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function signPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function buildDigestCaption(d: DigestData): string {
  const up = d.dayBRL >= 0;
  const lines: string[] = [];
  lines.push(`*Resumo do dia* · ${d.dateLabel}`);
  lines.push("");
  lines.push(`${up ? "🟢" : "🔴"} Patrimônio *${money(d.patrimonioBRL)}*  (${up ? "+" : ""}${money(d.dayBRL)} · ${signPct(d.dayPct)})`);
  if (d.ibkr) {
    lines.push(`🏦 IBKR ${d.ibkr.patrimonioUSD != null ? `US$ ${Math.round(d.ibkr.patrimonioUSD).toLocaleString("pt-BR")}` : money(d.ibkr.patrimonioBRL)} · dia ${d.ibkr.lucroDiaUSD != null ? `${d.ibkr.lucroDiaUSD >= 0 ? "+" : ""}US$ ${Math.round(d.ibkr.lucroDiaUSD).toLocaleString("pt-BR")}` : money(d.ibkr.lucroDiaBRL)}`);
  }
  lines.push(`💵 USD/BRL ${d.usdbrl.toFixed(2)}${d.usdbrlDayPct != null ? ` (${signPct(d.usdbrlDayPct)})` : ""} · efeito câmbio ${d.fxDayBRL >= 0 ? "+" : ""}${money(d.fxDayBRL)}`);
  if (d.gainers.length || d.losers.length) {
    lines.push("");
    if (d.gainers.length) lines.push(`📈 ${d.gainers.map(g => `${g.ticker} ${signPct(g.changePct)}`).join("  ·  ")}`);
    if (d.losers.length) lines.push(`📉 ${d.losers.map(g => `${g.ticker} ${signPct(g.changePct)}`).join("  ·  ")}`);
  }
  if (d.headlines.length) {
    lines.push("");
    lines.push("*Manchetes*");
    for (const h of d.headlines.slice(0, 3)) lines.push(`• ${h.titulo}`);
  }
  return lines.join("\n").slice(0, 1024);
}
