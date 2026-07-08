import { getDataStore } from "./data-store";
import { fetchFixaAbertaComIbkr } from "./ibkr-cash";
import { fetchCotacoes, yahooTicker } from "./cotacoes";
import { calcularSnapshot, type Position, type PortfolioSnapshot } from "./portfolio";
import { calcularRendaFixaPosicoes, type RendaFixaResult } from "./renda-fixa";
import { calcularCambioMetrics, buildPmFxRates, buildFxDateMap } from "./cambio";
import { toNumber } from "./format";
import { isRendaFixa } from "./sectors";

const MAX_RV_ROWS = 20;
const MAX_PROVENTOS_ROWS = 15;

type Row = Record<string, unknown>;

function fmtBRL(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function rowsToMarkdownTable(rows: Row[], columns?: string[]): string {
  if (!rows.length) return "  (sem dados)";
  const cols = columns ?? Object.keys(rows[0]);
  if (!cols.length) return "  (sem dados)";

  const header = `| ${cols.join(" | ")} |`;
  const sep = `|${cols.map(() => "---").join("|")}|`;
  const body = rows.map((r) => `| ${cols.map((c) => String(r[c] ?? "")).join(" | ")} |`).join("\n");
  return `${header}\n${sep}\n${body}`;
}

function buildPortfolioContext(
  transacoes: Row[],
  fixaAberta: Row[],
  rendaFixaHist: Row[],
  proventos: Row[],
): string {
  const today = new Date().toLocaleDateString("pt-BR");
  const lines: string[] = [
    `# Carteira do Investidor — resumo extraído em ${today}`,
    "",
    "> Dados importados do Google Sheets. Tabelas grandes foram resumidas para economizar contexto.",
    "",
  ];

  if (transacoes.length > 0) {
    const tickers = new Set(transacoes.map((r) => String(r["símbolo"] ?? r["simbolo"] ?? r["ticker"] ?? "").toUpperCase()).filter(Boolean));
    lines.push("## Renda Variável — aba `meus_ativos`");
    lines.push(`Total de operações: **${transacoes.length}** · Tickers únicos: **${tickers.size}**`);
    if (transacoes.length > MAX_RV_ROWS) {
      lines.push(`*(Mostrando as ${MAX_RV_ROWS} transações mais recentes)*`);
      lines.push("");
      lines.push(rowsToMarkdownTable(transacoes.slice(-MAX_RV_ROWS)));
    } else {
      lines.push("");
      lines.push(rowsToMarkdownTable(transacoes));
    }
    lines.push("");
  }

  if (fixaAberta.length > 0) {
    lines.push("## Renda Fixa — aba `fixa_aberta`");
    lines.push("Posições de renda fixa que o investidor POSSUI ATUALMENTE (CDBs, LCIs, LCAs, Tesouro Direto etc.).");
    lines.push("");
    lines.push(rowsToMarkdownTable(fixaAberta));
    lines.push("");
  }

  if (rendaFixaHist.length > 0) {
    lines.push("## Renda Fixa Histórico — aba `renda_fixa` (resumo)");
    lines.push(`Total de operações registradas: **${rendaFixaHist.length}** (compras, resgates, vencimentos — inclui ativos encerrados).`);
    const tipoCol = ["tipo", "Tipo", "operacao", "Operacao"].find((c) =>
      rendaFixaHist.some((r) => r[c] !== undefined)
    );
    if (tipoCol) {
      const counts: Record<string, number> = {};
      for (const r of rendaFixaHist) {
        const t = String(r[tipoCol] ?? "").trim();
        if (t) counts[t] = (counts[t] ?? 0) + 1;
      }
      const parts = Object.entries(counts).map(([k, v]) => `${k}: ${v}`);
      lines.push(`Distribuição: ${parts.join(" · ")}`);
    }
    lines.push("");
  }

  if (proventos.length > 0) {
    lines.push("## Proventos — aba `meus_proventos`");
    const valorCol = ["valor", "Valor", "value", "liquido"].find((c) =>
      proventos.some((r) => r[c] !== undefined)
    );
    if (valorCol) {
      let soma = 0;
      for (const r of proventos) {
        soma += Math.abs(toNumber(r[valorCol]) ?? 0);
      }
      lines.push(`Total recebido: **R$ ${soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}** em **${proventos.length}** eventos.`);
    } else {
      lines.push(`Total de eventos: **${proventos.length}**.`);
    }
    if (proventos.length > MAX_PROVENTOS_ROWS) {
      lines.push(`*(Mostrando os ${MAX_PROVENTOS_ROWS} mais recentes)*`);
      lines.push("");
      lines.push(rowsToMarkdownTable(proventos.slice(-MAX_PROVENTOS_ROWS)));
    } else {
      lines.push("");
      lines.push(rowsToMarkdownTable(proventos));
    }
    lines.push("");
  }

  return lines.join("\n");
}

function buildMarketSnapshot(
  snapshot: PortfolioSnapshot,
  rfData: RendaFixaResult,
): string {
  const today = new Date().toLocaleDateString("pt-BR");
  const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const total = snapshot.totalPatrimonioBRL;
  const rv = snapshot.rvPatrimonioBRL;
  const rf = snapshot.rfPatrimonioBRL;
  const dayR = snapshot.dayChangeTotalBRL;
  const dayPct = snapshot.dayChangeTotalPct;

  const lines: string[] = [
    `## Snapshot de Mercado — ${today} (atualizado às ${now})`,
    "",
    "> Valores calculados pelas mesmas funções do dashboard. PM, quantidade e posições seguem o método FIFO.",
    "> **IMPORTANTE**: todos os valores monetários neste bloco estão em BRL. Ativos em USD já estão convertidos pelo câmbio do dia.",
    "",
    "### Resumo Patrimonial",
    "> **Use estes valores** — são os números que aparecem no dashboard.",
    "| Componente | Valor (BRL) | % |",
    "|---|---:|---:|",
    `| **TOTAL DO PORTFÓLIO** | **R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}** | 100% |`,
  ];

  if (total > 0) {
    lines.push(`| Renda Variável (ações, ETFs RV, FIIs) | R$ ${rv.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${(rv / total * 100).toFixed(1)}% |`);
    lines.push(`| Renda Fixa (Tesouro + CDBs + caixa + SHV/BIL) | R$ ${rf.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${(rf / total * 100).toFixed(1)}% |`);
  }

  lines.push(`| Variação do dia | ${fmtBRL(dayR)} (${fmtPct(dayPct)}) | — |`);
  lines.push("");

  lines.push("### Câmbio do Dia (todos os valores BRL nas tabelas já usam estas taxas)");
  lines.push("| Moeda | Taxa BRL |");
  lines.push("|---|---:|");
  if (snapshot.usdbrl) lines.push(`| USD → BRL | R$ ${snapshot.usdbrl.toFixed(4)} |`);
  if (snapshot.eurbrl) lines.push(`| EUR → BRL | R$ ${snapshot.eurbrl.toFixed(4)} |`);
  if (snapshot.cadbrl) lines.push(`| CAD → BRL | R$ ${snapshot.cadbrl.toFixed(4)} |`);
  lines.push("");

  lines.push(
    "> Regra: **nunca some as colunas das tabelas abaixo para obter o total** — use o Resumo Patrimonial acima. SHV e ETFs de RF em USD já estão convertidos e incluídos no total de Renda Fixa."
  );
  lines.push("");

  // Top gainers/losers
  const rvPositions = snapshot.positions.filter((p) => !isRendaFixa(p.setor));
  const priced = rvPositions.filter((p) => p.precoAtual !== null);
  const sorted = [...priced].sort((a, b) => (b.dayChangePct ?? 0) - (a.dayChangePct ?? 0));

  const topGainers = sorted.filter((p) => (p.dayChangePct ?? 0) > 0).slice(0, 3);
  const topLosers = sorted.filter((p) => (p.dayChangePct ?? 0) < 0).slice(-3).reverse();

  if (topGainers.length > 0) {
    lines.push("### Maiores Altas do Dia (apenas RV)");
    for (const p of topGainers) {
      lines.push(
        `- **${p.ticker}** (${p.moeda}): ${fmtPct(p.dayChangePct ?? 0)} | Δ dia: ${fmtBRL(p.dayChangeBRL ?? 0)} | Posição: R$ ${p.valorAtualBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      );
    }
    lines.push("");
  }

  if (topLosers.length > 0) {
    lines.push("### Maiores Quedas do Dia (apenas RV)");
    for (const p of topLosers) {
      lines.push(
        `- **${p.ticker}** (${p.moeda}): ${fmtPct(p.dayChangePct ?? 0)} | Δ dia: ${fmtBRL(p.dayChangeBRL ?? 0)} | Posição: R$ ${p.valorAtualBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
      );
    }
    lines.push("");
  }

  // RV positions table
  const rvPositionsForTable = snapshot.positions.filter((p) => !isRendaFixa(p.setor) && p.valorAtualBRL > 1);
  if (rvPositionsForTable.length > 0) {
    lines.push("### Posições — Renda Variável");
    lines.push("> PM e Preço Atual estão na moeda nativa do ativo. **PM (BRL)** e **Valor BRL** já usam o câmbio do dia.");
    lines.push("");
    lines.push("| Ticker | Setor | Moeda | Qtd | PM | Valor BRL | Δ dia BRL | Δ dia % | Rent. BRL | Rent. % |");
    lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|");
    for (const p of rvPositionsForTable) {
      lines.push(
        `| ${p.ticker} | ${p.setor} | ${p.moeda} | ${p.quantidade.toFixed(2)} | ${p.custoMedio.toFixed(2)} | R$ ${p.valorAtualBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${fmtBRL(p.dayChangeBRL ?? 0)} | ${fmtPct(p.dayChangePct ?? 0)} | ${fmtBRL(p.lucroBRL ?? 0)} | ${fmtPct(p.lucroPct ?? 0)} |`
      );
    }
    lines.push("");
  }

  // RF positions from meus_ativos (SHV, BIL etc.)
  const rfFromRV = snapshot.positions.filter((p) => isRendaFixa(p.setor) && p.valorAtualBRL > 1);
  if (rfFromRV.length > 0) {
    lines.push("### Posições — ETFs de Renda Fixa USD (ex: SHV, BIL)");
    lines.push("> Contabilizados como **Renda Fixa** no Resumo Patrimonial, não como RV. Valores BRL já convertidos.");
    lines.push("");
    lines.push("| Ticker | Moeda | Qtd | PM | Valor BRL | Δ dia BRL | Δ dia % |");
    lines.push("|---|---|---:|---:|---:|---:|---:|");
    for (const p of rfFromRV) {
      lines.push(
        `| ${p.ticker} | ${p.moeda} | ${p.quantidade.toFixed(2)} | ${p.custoMedio.toFixed(2)} | R$ ${p.valorAtualBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${fmtBRL(p.dayChangeBRL ?? 0)} | ${fmtPct(p.dayChangePct ?? 0)} |`
      );
    }
    lines.push("");
  }

  // RF from fixa_aberta — motor canônico (lib/renda-fixa.ts, mesmo da página Renda Fixa)
  lines.push("### Renda Fixa — aba `fixa_aberta` (Tesouro, CDBs, LCIs, caixa)");
  lines.push("> O total de RF = soma desta tabela + ETFs de RF USD acima. O valor consolidado está no Resumo Patrimonial. Valores em BRL ao câmbio do dia.");
  const rfAtivas = [...rfData.abertas, ...rfData.caixa];
  if (rfAtivas.length > 0) {
    lines.push("");
    lines.push("| Ticker | Moeda | Investido (BRL) | Atual (BRL) | Lucro | Rent. % |");
    lines.push("|---|---|---:|---:|---:|---:|");
    for (const p of rfAtivas) {
      lines.push(
        `| ${p.ticker} | ${p.moeda} | R$ ${p.investidoBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | R$ ${p.atualBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${fmtBRL(p.lucroBRL)} | ${fmtPct(p.rentabilidade)} |`
      );
    }
  }
  lines.push("");

  // Sector allocation
  if (Object.keys(snapshot.setorAlocacao).length > 0) {
    lines.push("### Alocação por Setor");
    lines.push("| Setor | Valor BRL | % |");
    lines.push("|---|---:|---:|");
    const entries = Object.entries(snapshot.setorAlocacao).sort((a, b) => b[1] - a[1]);
    for (const [setor, valor] of entries) {
      lines.push(
        `| ${setor} | R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${total > 0 ? (valor / total * 100).toFixed(1) : "0"}% |`
      );
    }
    lines.push("");
  }

  // Proventos summary
  if (snapshot.totalProventosBRL > 0) {
    lines.push("### Proventos Acumulados");
    lines.push(`Total recebido: **R$ ${snapshot.totalProventosBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}**`);

    if (Object.keys(snapshot.proventosPorTicker).length > 0) {
      const topProv = Object.entries(snapshot.proventosPorTicker)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      lines.push("");
      lines.push("Top pagadores:");
      for (const [ticker, valor] of topProv) {
        lines.push(`- **${ticker}**: R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function buildAgentContext(): Promise<string> {
  const store = getDataStore();
  const [transacoes, fixaAberta, rendaFixaHist, proventos, cambioRows, ptaxRows] = await Promise.all([
    store.fetchTab("meus_ativos").catch(() => []),
    fetchFixaAbertaComIbkr(store).catch(() => []),
    store.fetchTab("renda_fixa").catch(() => []),
    store.fetchTab("meus_proventos").catch(() => []),
    store.fetchTab("cambio").catch(() => []),
    store.fetchTab("p_tax").catch(() => []),
  ]);

  const portfolioCtx = buildPortfolioContext(transacoes, fixaAberta, rendaFixaHist, proventos);

  const tickerSet = new Map<string, { moeda: string; corretora: string }>();
  for (const row of transacoes) {
    const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? "").toUpperCase().trim();
    if (!ticker) continue;
    if (!tickerSet.has(ticker)) {
      tickerSet.set(ticker, {
        moeda: String(row["moeda"] ?? "BRL").toUpperCase().trim(),
        corretora: String(row["corretora"] ?? "").trim(),
      });
    }
  }

  const tickers = Array.from(tickerSet.entries()).map(([ticker, info]) => ({
    ticker,
    moeda: info.moeda,
    corretora: info.corretora,
  }));

  let marketCtx = "";

  try {
    const cotacoes = await fetchCotacoes(tickers);
    const fxAtual = cotacoes.fx;
    const cambio = calcularCambioMetrics(cambioRows, fxAtual);
    const fxCusto = buildPmFxRates(cambio);
    const fxByDate = buildFxDateMap(ptaxRows, cambio.historico);
    const snapshot = calcularSnapshot(transacoes, proventos, fixaAberta, cotacoes.quotes, fxAtual, fxCusto, fxByDate);
    const rfData = calcularRendaFixaPosicoes(rendaFixaHist, fixaAberta, proventos, fxAtual);
    marketCtx = buildMarketSnapshot(snapshot, rfData);
  } catch (e) {
    marketCtx = `\n## Snapshot de Mercado\n⚠️ Erro ao calcular snapshot: ${e instanceof Error ? e.message : String(e)}\n`;
  }

  return `${portfolioCtx}\n${marketCtx}`;
}
