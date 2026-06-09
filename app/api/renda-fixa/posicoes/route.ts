import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { toNumber } from "@/lib/format";
import { fetchFxRates, fxToBRL } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Row = Record<string, unknown>;

interface RFTransaction {
  date: string;
  ticker: string;
  tipo: string;
  valor: number;
  moeda: string;
}

interface RFOpenPosition {
  ticker: string;
  moeda: string;
  atual: number;
  atualBRL: number;
  investido: number;
  investidoBRL: number;
  lucro: number;
  lucroBRL: number;
  rentabilidade: number;
  proventos: number;
  proventosBRL: number;
  resultadoTotal: number;
  resultadoTotalBRL: number;
  isCaixa: boolean;
}

interface RFClosedPosition {
  ticker: string;
  moeda: string;
  compra: number;
  venda: number;
  imposto: number;
  lucro: number;
  lucroBRL: number;
  rentabilidade: number;
  proventos: number;
  proventosBRL: number;
  resultadoTotal: number;
  resultadoTotalBRL: number;
}

const CASH_TERMS = ["CAIXA", "SALDO", "CASH", "RESERVA", "LIQUIDEZ"];
function isCashTicker(ticker: string, tipo?: string): boolean {
  const t = ticker.toUpperCase();
  const tp = (tipo ?? "").toUpperCase();
  return CASH_TERMS.some(term => t.includes(term) || tp.includes(term));
}

function getTicker(row: Row): string {
  return String(row["ticker"] ?? row["ativo"] ?? row["papel"] ?? "").trim();
}

function parseTipo(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s.includes("compra") || s.includes("aplica") || s.includes("aporte")) return "compra";
  if (s.includes("venda") || s.includes("resgate") || s.includes("vencimento")) return "venda";
  if (s.includes("imposto")) return "imposto";
  return s;
}

export async function GET() {
  try {
    const [rfTransacoes, fixaAberta, proventosRows, { fx }] = await Promise.all([
      fetchTab("renda_fixa"),
      fetchTab("fixa_aberta"),
      fetchTab("meus_proventos"),
      fetchFxRates(),
    ]);

    const toBRL = (valor: number, moeda: string) => valor * fxToBRL(moeda, fx);

    // 1. Parse fixa_aberta — source of truth for what's currently held
    // Uses array (not Map) because the same ticker can appear in multiple currencies
    // (e.g. "Caixa" in BRL and "Caixa" in USD).
    const openEntries: Array<{ ticker: string; atual: number; moeda: string; tipo: string }> = [];
    const openTickers = new Set<string>();
    for (const row of fixaAberta) {
      const ticker = getTicker(row);
      if (!ticker) continue;
      const atual = toNumber(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"]) ?? 0;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const tipo = String(row["tipo"] ?? "").trim();
      openEntries.push({ ticker, atual, moeda, tipo });
      openTickers.add(ticker);
    }

    // 2. Parse renda_fixa transactions — group by ticker
    const txByTicker: Record<string, { compra: number; venda: number; imposto: number; moeda: string; txs: RFTransaction[] }> = {};
    for (const row of rfTransacoes) {
      const ticker = getTicker(row);
      if (!ticker) continue;
      const tipoRaw = String(row["tipo"] ?? row["movimentacao"] ?? "");
      const tipo = parseTipo(tipoRaw);
      const valor = Math.abs(toNumber(row["valor"]) ?? 0);
      if (valor === 0 && tipo !== "imposto") continue;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      const date = String(row["compra"] ?? row["data"] ?? "");

      if (!txByTicker[ticker]) txByTicker[ticker] = { compra: 0, venda: 0, imposto: 0, moeda, txs: [] };
      if (tipo === "compra") txByTicker[ticker].compra += valor;
      else if (tipo === "venda") txByTicker[ticker].venda += valor;
      else if (tipo === "imposto") txByTicker[ticker].imposto += Math.abs(valor);

      txByTicker[ticker].txs.push({ date, ticker, tipo: tipoRaw, valor, moeda });
    }

    // 3. Parse proventos for RF tickers (líquido = bruto − IR retido)
    const allRfTickers = new Set([...openTickers, ...Object.keys(txByTicker)]);
    const proventosPorTicker: Record<string, number> = {}; // líquido (moeda original)
    const impostoPorTicker: Record<string, number> = {};   // IR retido (moeda original)
    let totalImpostoRFBRL = 0;

    const tickerMoeda = (t: string): string => {
      const entry = openEntries.find(e => e.ticker === t);
      return entry?.moeda ?? txByTicker[t]?.moeda ?? "BRL";
    };

    for (const row of proventosRows) {
      const ticker = String(row["ticker"] ?? row["símbolo"] ?? row["simbolo"] ?? "").trim();
      if (!ticker) continue;
      if (!allRfTickers.has(ticker) && !allRfTickers.has(ticker.toUpperCase())) continue;
      const valorAbs = Math.abs(toNumber(row["valor"] ?? row["value"] ?? row["liquido"]) ?? 0);
      if (valorAbs === 0) continue;
      const decisao = String(row["decisao"] ?? row["decisão"] ?? "").toLowerCase();
      const isImposto = decisao.includes("imposto");
      const key = allRfTickers.has(ticker) ? ticker : ticker.toUpperCase();
      const moeda = tickerMoeda(key);
      if (isImposto) {
        proventosPorTicker[key] = (proventosPorTicker[key] ?? 0) - valorAbs;
        impostoPorTicker[key] = (impostoPorTicker[key] ?? 0) + valorAbs;
        totalImpostoRFBRL += toBRL(valorAbs, moeda);
      } else {
        proventosPorTicker[key] = (proventosPorTicker[key] ?? 0) + valorAbs;
      }
    }

    // 4. Build open positions (everything in fixa_aberta)
    const abertas: RFOpenPosition[] = [];
    let totalCaixa = 0;
    const caixaPositions: RFOpenPosition[] = [];

    for (const { ticker, atual, moeda, tipo } of openEntries) {
      const isCaixa = isCashTicker(ticker, tipo);
      const txData = txByTicker[ticker];
      const investido = txData?.compra ?? 0;
      const proventos = proventosPorTicker[ticker] ?? 0;
      const atualBRL = toBRL(atual, moeda);
      const investidoBRL = toBRL(investido, moeda);
      const proventosBRL = toBRL(proventos, moeda);

      if (isCaixa) {
        totalCaixa += atualBRL;
        caixaPositions.push({
          ticker, moeda, atual, atualBRL, investido, investidoBRL, lucro: 0, lucroBRL: 0,
          rentabilidade: 0, proventos, proventosBRL, resultadoTotal: proventos,
          resultadoTotalBRL: proventosBRL, isCaixa: true,
        });
        continue;
      }

      const lucro = investido > 0 ? atual - investido : 0;
      const lucroBRL = toBRL(lucro, moeda);
      const resultadoTotal = lucro + proventos;
      const resultadoTotalBRL = lucroBRL + proventosBRL;
      const rentabilidade = investido > 0 ? (resultadoTotal / investido) * 100 : 0;

      abertas.push({
        ticker, moeda, atual, atualBRL, investido, investidoBRL, lucro, lucroBRL,
        rentabilidade, proventos, proventosBRL, resultadoTotal, resultadoTotalBRL, isCaixa: false,
      });
    }

    // 5. Build closed positions (has venda in renda_fixa but NOT in fixa_aberta)
    const encerradas: RFClosedPosition[] = [];
    for (const [ticker, agg] of Object.entries(txByTicker)) {
      if (openTickers.has(ticker)) continue; // still open
      if (agg.venda <= 0) continue; // no sale = not closed
      if (isCashTicker(ticker)) continue;

      const moeda = agg.moeda;
      const lucro = agg.venda - agg.compra - agg.imposto;
      const lucroBRL = toBRL(lucro, moeda);
      const proventos = proventosPorTicker[ticker] ?? 0;
      const proventosBRL = toBRL(proventos, moeda);
      const resultadoTotal = lucro + proventos;
      const resultadoTotalBRL = lucroBRL + proventosBRL;
      const rentabilidade = agg.compra > 0 ? (resultadoTotal / agg.compra) * 100 : 0;

      encerradas.push({
        ticker, moeda,
        compra: agg.compra, venda: agg.venda, imposto: agg.imposto,
        lucro, lucroBRL, rentabilidade, proventos, proventosBRL, resultadoTotal, resultadoTotalBRL,
      });
    }

    // 6. Compute totals (all in BRL)
    const totalAtual = abertas.reduce((s, p) => s + p.atualBRL, 0);
    const totalInvestidoAberto = abertas.reduce((s, p) => s + p.investidoBRL, 0);
    const lucroNaoRealizado = abertas.reduce((s, p) => s + p.lucroBRL, 0);
    const lucroRealizado = encerradas.reduce((s, p) => s + p.lucroBRL, 0);
    const totalProventosAbertoBRL = abertas.reduce((s, p) => s + p.proventosBRL, 0);
    const totalProventosRF = totalProventosAbertoBRL + encerradas.reduce((s, p) => s + p.proventosBRL, 0);
    const totalProventosBrutoRF = totalProventosRF + totalImpostoRFBRL;
    const rentMedia = totalInvestidoAberto > 0 ? ((lucroNaoRealizado + totalProventosAbertoBRL) / totalInvestidoAberto) * 100 : 0;

    // 7. All transactions for display (sorted newest first)
    const allTxs: RFTransaction[] = Object.values(txByTicker).flatMap(t => t.txs);

    return NextResponse.json({
      abertas,
      caixa: caixaPositions,
      encerradas,
      transacoes: allTxs,
      totalAtual,
      totalCaixa,
      totalInvestidoAberto,
      lucroNaoRealizado,
      lucroRealizado,
      totalProventosRF,
      totalProventosBrutoRF,
      totalImpostoRF: totalImpostoRFBRL,
      rentMedia,
      patrimonio: totalAtual + totalCaixa,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
