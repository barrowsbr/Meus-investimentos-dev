// ─────────────────────────────────────────────────────────────────────────────
// Motor de apuração de GANHO DE CAPITAL (compra/venda) — PF Brasil
//
// Princípios contábeis aplicados:
//  • Custo = PREÇO MÉDIO PONDERADO de aquisição (método exigido pela RFB para
//    ações), NÃO FIFO. Na venda, custo = qtd × PM; o PM dos remanescentes não muda.
//  • Eventos corporativos ajustam quantidade e PM sem gerar ganho:
//    desdobramento/grupamento (fator), bonificação/subscrição (entra como custo).
//  • Dia-trade: posição aberta e fechada no MESMO dia/ativo → modalidade própria
//    (20%, bucket isolado). O excedente é swing.
//  • Exterior (Lei 14.754/23): custo convertido pela PTAX da AQUISIÇÃO e venda
//    pela PTAX da ALIENAÇÃO; ganho apurado em reais.
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetClass, Modalidade } from "./rules";
import { identificarSetor } from "../sectors";

export interface RawTx {
  date: string;         // YYYY-MM-DD
  tipo: string;         // texto cru (compra/venda/...)
  ticker: string;
  quantidade: number;   // sempre positiva
  preco: number;        // preço unitário na moeda do ativo
  taxas: number;        // corretagem/emolumentos
  moeda: string;        // BRL/USD/...
  corretora: string;
}

export interface CorpEvent {
  date: string;
  ticker: string;
  tipo: "desdobramento" | "grupamento" | "bonificacao" | "subscricao";
  /** desdobramento/grupamento: novaQtd = qtd × fator (split 2:1 → 2; grupamento 10:1 → 0.1). */
  fator?: number;
  /** bonificação/subscrição: quantidade recebida e custo unitário (em moeda nativa). */
  quantidade?: number;
  custoUnitario?: number;
}

export interface RealizedEvent {
  date: string;
  month: string;        // YYYY-MM
  year: string;         // YYYY
  ticker: string;
  assetClass: AssetClass;
  modalidade: Modalidade;
  quantidade: number;
  proceedsNative: number;
  costNative: number;
  gainNative: number;
  proceedsBRL: number;
  costBRL: number;
  gainBRL: number;
  moeda: string;
  ptaxVenda?: number;
  ehDayTrade: boolean;
}

/** Função de conversão: retorna o fator moeda→BRL na data (PTAX para exterior). */
export type PtaxLookup = (moeda: string, dateISO: string) => number;

// ─── Classificação do ativo ──────────────────────────────────────────────────
//
// O REGIME tributário é definido pela MOEDA/natureza do ativo, NÃO pela
// corretora onde está custodiado (uma VALE3 em reais é B3 mesmo se na IBKR).
// Reutiliza identificarSetor (lib/sectors.ts), que já mantém as listas de
// FIIs vs ETFs vs units (TAEE11, KLBN11…) vs BDRs.
export function classifyAsset(ticker: string, moeda: string): AssetClass {
  const m = (moeda || "BRL").toUpperCase().trim();
  const setor = identificarSetor(ticker);
  if (setor === "Renda Fixa" || setor === "Renda Fixa USD") return "rf";
  // Moeda estrangeira ⇒ aplicação no exterior (Lei 14.754/23).
  if (m !== "BRL") return "exterior";
  if (setor === "FIIs") return "fii";
  if (setor === "ETF") return "etf_acoes";       // ETF de ações negociado na B3
  if (setor === "BDRs") return "bdr";
  if (setor === "Ações Brasil") return "acoes";
  // Internacional / ETF USA / Commodities / Cripto sem moeda explícita → exterior
  return "exterior";
}

function classToModalidade(cls: AssetClass): Modalidade {
  switch (cls) {
    case "acoes": return "acoes_swing";
    case "etf_acoes": return "etf_acoes";
    case "bdr": return "bdr";
    case "fii": return "fii";
    case "exterior": return "exterior";
    case "rf": return "rf";
  }
}

// Dia-trade só se aplica a renda variável da B3.
function permiteDayTrade(cls: AssetClass): boolean {
  return cls === "acoes" || cls === "etf_acoes" || cls === "bdr" || cls === "fii";
}

// ─── Parsing de tipo ──────────────────────────────────────────────────────────

export function isCompra(tipo: string): boolean {
  const t = tipo.toLowerCase();
  return t.includes("compra") || t === "buy" || t.includes("subscri");
}
export function isVenda(tipo: string): boolean {
  const t = tipo.toLowerCase();
  return t.includes("venda") || t === "sell" || t.includes("resgate") || t.includes("vencimento");
}

// ─── Núcleo: apuração de ganhos realizados ─────────────────────────────────────

interface Inventory {
  qty: number;
  pmNative: number;     // preço médio ponderado (moeda nativa)
  custoTotalBRL: number;// custo de aquisição acumulado em reais (PTAX da compra)
}

/**
 * Apura todos os eventos de ganho/perda realizados (vendas), aplicando preço
 * médio, eventos corporativos e split dia-trade/swing.
 */
export function apurarGanhos(
  txs: RawTx[],
  corpEvents: CorpEvent[],
  ptax: PtaxLookup,
): RealizedEvent[] {
  // Agrupa por ticker normalizado.
  const norm = (t: string) => t.toUpperCase().replace(".SA", "").trim();
  const byTicker = new Map<string, { txs: RawTx[]; events: CorpEvent[] }>();
  for (const tx of txs) {
    const k = norm(tx.ticker);
    if (!byTicker.has(k)) byTicker.set(k, { txs: [], events: [] });
    byTicker.get(k)!.txs.push(tx);
  }
  for (const ev of corpEvents) {
    const k = norm(ev.ticker);
    if (!byTicker.has(k)) byTicker.set(k, { txs: [], events: [] });
    byTicker.get(k)!.events.push(ev);
  }

  const out: RealizedEvent[] = [];

  for (const [ticker, grp] of byTicker) {
    const sample = grp.txs[0];
    const moeda = (sample?.moeda || "BRL").toUpperCase();
    const cls = classifyAsset(ticker, moeda);
    const inv: Inventory = { qty: 0, pmNative: 0, custoTotalBRL: 0 };

    // Conjunto ordenado de datas com atividade.
    const datas = new Set<string>();
    for (const tx of grp.txs) datas.add(tx.date);
    for (const ev of grp.events) datas.add(ev.date);
    const diasOrdenados = [...datas].sort();

    for (const dia of diasOrdenados) {
      // 1) Eventos corporativos do dia (antes das negociações).
      for (const ev of grp.events.filter(e => e.date === dia)) {
        aplicarEventoCorporativo(inv, ev, ptax(moeda, dia));
      }

      // 2) Negociações do dia.
      const comprasDia = grp.txs.filter(t => t.date === dia && isCompra(t.tipo));
      const vendasDia = grp.txs.filter(t => t.date === dia && isVenda(t.tipo));
      if (comprasDia.length === 0 && vendasDia.length === 0) continue;

      const qtdComprada = comprasDia.reduce((s, t) => s + t.quantidade, 0);
      const qtdVendida = vendasDia.reduce((s, t) => s + t.quantidade, 0);
      // preço médio (com taxas) do dia, por lado:
      const custoComprasNative = comprasDia.reduce((s, t) => s + t.quantidade * t.preco + t.taxas, 0);
      const liqVendasNative = vendasDia.reduce((s, t) => s + t.quantidade * t.preco - t.taxas, 0);
      const precoMedioCompraDia = qtdComprada > 0 ? custoComprasNative / qtdComprada : 0;
      const precoMedioVendaDia = qtdVendida > 0 ? liqVendasNative / qtdVendida : 0;

      const ptaxDia = ptax(moeda, dia);

      // 3) Dia-trade: quantidade aberta e fechada no mesmo dia.
      const dtQty = permiteDayTrade(cls) ? Math.min(qtdComprada, qtdVendida) : 0;
      if (dtQty > 0) {
        const proceedsNative = dtQty * precoMedioVendaDia;
        const costNative = dtQty * precoMedioCompraDia;
        const proceedsBRL = proceedsNative * ptaxDia;
        const costBRL = costNative * ptaxDia;
        out.push(mkEvent(dia, ticker, cls, "day_trade", dtQty, proceedsNative, costNative, proceedsBRL, costBRL, moeda, ptaxDia, true));
      }

      // 4) Excedente após dia-trade.
      const compraExcedente = qtdComprada - dtQty; // entra no estoque
      const vendaExcedente = qtdVendida - dtQty;   // venda swing consumindo PM

      if (compraExcedente > 1e-9) {
        // adiciona ao estoque pelo preço médio de compra do dia
        const novoQty = inv.qty + compraExcedente;
        const custoNativoNovo = inv.qty * inv.pmNative + compraExcedente * precoMedioCompraDia;
        inv.pmNative = novoQty > 0 ? custoNativoNovo / novoQty : 0;
        inv.custoTotalBRL += compraExcedente * precoMedioCompraDia * ptaxDia;
        inv.qty = novoQty;
      }

      if (vendaExcedente > 1e-9) {
        const qtdSell = Math.min(vendaExcedente, inv.qty); // protege contra estoque negativo
        const custoMedioBRL = inv.qty > 0 ? inv.custoTotalBRL / inv.qty : 0;
        const costNative = qtdSell * inv.pmNative;
        const proceedsNative = qtdSell * precoMedioVendaDia;
        const costBRL = qtdSell * custoMedioBRL;
        const proceedsBRL = qtdSell * precoMedioVendaDia * ptaxDia;
        out.push(mkEvent(dia, ticker, cls, classToModalidade(cls), qtdSell, proceedsNative, costNative, proceedsBRL, costBRL, moeda, ptaxDia, false));
        // baixa do estoque (PM permanece; custo total e qtd reduzem proporcionalmente)
        inv.custoTotalBRL -= costBRL;
        inv.qty -= qtdSell;
        if (inv.qty < 1e-9) { inv.qty = 0; inv.pmNative = 0; inv.custoTotalBRL = 0; }
      }
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function aplicarEventoCorporativo(inv: Inventory, ev: CorpEvent, ptaxDia: number) {
  if (inv.qty <= 0 && ev.tipo !== "subscricao" && ev.tipo !== "bonificacao") return;
  if (ev.tipo === "desdobramento" || ev.tipo === "grupamento") {
    const fator = ev.fator ?? 1;
    if (fator <= 0) return;
    inv.qty *= fator;
    inv.pmNative /= fator; // custo total inalterado → ganho não é gerado
  } else {
    // bonificação ou subscrição: entra quantidade a um custo unitário (pode ser 0).
    const addQty = ev.quantidade ?? 0;
    const custoUnit = ev.custoUnitario ?? 0;
    if (addQty <= 0) return;
    const novoQty = inv.qty + addQty;
    const custoNativoNovo = inv.qty * inv.pmNative + addQty * custoUnit;
    inv.pmNative = novoQty > 0 ? custoNativoNovo / novoQty : 0;
    inv.custoTotalBRL += addQty * custoUnit * ptaxDia;
    inv.qty = novoQty;
  }
}

function mkEvent(
  date: string, ticker: string, assetClass: AssetClass, modalidade: Modalidade,
  quantidade: number, proceedsNative: number, costNative: number,
  proceedsBRL: number, costBRL: number, moeda: string, ptaxVenda: number, ehDayTrade: boolean,
): RealizedEvent {
  return {
    date, month: date.slice(0, 7), year: date.slice(0, 4),
    ticker, assetClass, modalidade, quantidade,
    proceedsNative, costNative, gainNative: proceedsNative - costNative,
    proceedsBRL, costBRL, gainBRL: proceedsBRL - costBRL,
    moeda, ptaxVenda: moeda === "BRL" ? undefined : ptaxVenda, ehDayTrade,
  };
}
