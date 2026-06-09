import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";
import { toNumber } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

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
  investido: number;
  lucro: number;
  rentabilidade: number;
  proventos: number;
  resultadoTotal: number;
  isCaixa: boolean;
}

interface RFClosedPosition {
  ticker: string;
  moeda: string;
  compra: number;
  venda: number;
  imposto: number;
  lucro: number;
  rentabilidade: number;
  proventos: number;
  resultadoTotal: number;
}

const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

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
    const [rfTransacoes, fixaAberta, proventosRows] = await Promise.all([
      fetchTab("renda_fixa"),
      fetchTab("fixa_aberta"),
      fetchTab("meus_proventos"),
    ]);

    // 1. Parse fixa_aberta — source of truth for what's currently held
    const openSet = new Map<string, { atual: number; moeda: string }>();
    for (const row of fixaAberta) {
      const ticker = getTicker(row);
      if (!ticker) continue;
      const atual = toNumber(row["atual"] ?? row["valor_atual"] ?? row["saldo"] ?? row["valor atual"]) ?? 0;
      const moeda = String(row["moeda"] ?? "BRL").toUpperCase().trim() || "BRL";
      openSet.set(ticker, { atual, moeda });
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
    const allRfTickers = new Set([...openSet.keys(), ...Object.keys(txByTicker)]);
    const proventosPorTicker: Record<string, number> = {}; // líquido
    const impostoPorTicker: Record<string, number> = {};   // IR retido (custo positivo)
    let totalImpostoRF = 0;
    for (const row of proventosRows) {
      const ticker = String(row["ticker"] ?? row["símbolo"] ?? row["simbolo"] ?? "").trim();
      if (!ticker) continue;
      // Check if this ticker is an RF ticker (exists in fixa_aberta or renda_fixa)
      if (!allRfTickers.has(ticker) && !allRfTickers.has(ticker.toUpperCase())) continue;
      const valorAbs = Math.abs(toNumber(row["valor"] ?? row["value"] ?? row["liquido"]) ?? 0);
      if (valorAbs === 0) continue;
      const decisao = String(row["decisao"] ?? row["decisão"] ?? "").toLowerCase();
      const isImposto = decisao.includes("imposto");
      const key = allRfTickers.has(ticker) ? ticker : ticker.toUpperCase();
      if (isImposto) {
        proventosPorTicker[key] = (proventosPorTicker[key] ?? 0) - valorAbs;
        impostoPorTicker[key] = (impostoPorTicker[key] ?? 0) + valorAbs;
        totalImpostoRF += valorAbs;
      } else {
        proventosPorTicker[key] = (proventosPorTicker[key] ?? 0) + valorAbs;
      }
    }

    // 4. Build open positions (everything in fixa_aberta)
    const abertas: RFOpenPosition[] = [];
    let totalCaixa = 0;
    const caixaPositions: RFOpenPosition[] = [];

    for (const [ticker, { atual, moeda }] of openSet) {
      const isCaixa = CASH_TICKERS.has(ticker.toUpperCase());
      const txData = txByTicker[ticker];
      const investido = txData?.compra ?? 0;
      const proventos = proventosPorTicker[ticker] ?? 0;

      if (isCaixa) {
        totalCaixa += atual;
        caixaPositions.push({
          ticker, moeda, atual, investido, lucro: 0,
          rentabilidade: 0, proventos, resultadoTotal: proventos, isCaixa: true,
        });
        continue;
      }

      const lucro = investido > 0 ? atual - investido : 0;
      const resultadoTotal = lucro + proventos;
      const rentabilidade = investido > 0 ? (resultadoTotal / investido) * 100 : 0;

      abertas.push({
        ticker, moeda, atual, investido, lucro,
        rentabilidade, proventos, resultadoTotal, isCaixa: false,
      });
    }

    // 5. Build closed positions (has venda in renda_fixa but NOT in fixa_aberta)
    const encerradas: RFClosedPosition[] = [];
    for (const [ticker, agg] of Object.entries(txByTicker)) {
      if (openSet.has(ticker)) continue; // still open
      if (agg.venda <= 0) continue; // no sale = not closed
      if (CASH_TICKERS.has(ticker.toUpperCase())) continue;

      const lucro = agg.venda - agg.compra - agg.imposto;
      const proventos = proventosPorTicker[ticker] ?? 0;
      const resultadoTotal = lucro + proventos;
      const rentabilidade = agg.compra > 0 ? (resultadoTotal / agg.compra) * 100 : 0;

      encerradas.push({
        ticker, moeda: agg.moeda,
        compra: agg.compra, venda: agg.venda, imposto: agg.imposto,
        lucro, rentabilidade, proventos, resultadoTotal,
      });
    }

    // 6. Compute totals
    const totalAtual = abertas.reduce((s, p) => s + p.atual, 0);
    const totalInvestidoAberto = abertas.reduce((s, p) => s + p.investido, 0);
    const lucroNaoRealizado = abertas.reduce((s, p) => s + p.lucro, 0);
    const lucroRealizado = encerradas.reduce((s, p) => s + p.lucro, 0);
    const totalProventosRF = Object.values(proventosPorTicker).reduce((s, v) => s + v, 0); // líquido
    const totalProventosBrutoRF = totalProventosRF + totalImpostoRF;
    const totalProventosAberto = abertas.reduce((s, p) => s + p.proventos, 0);
    const rentMedia = totalInvestidoAberto > 0 ? ((lucroNaoRealizado + totalProventosAberto) / totalInvestidoAberto) * 100 : 0;

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
      totalImpostoRF,
      rentMedia,
      patrimonio: totalAtual + totalCaixa,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
