import { NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

type Categoria = "acoes_b3" | "fiis" | "internacional" | "etfs_b3";

interface Transacao {
  date: string;
  tipo: string;
  ticker: string;
  quantidade: number;
  preco: number;
  valorBruto: number;
  valorLiquido: number;
  moeda: string;
  corretora: string;
}

interface Lot {
  quantity: number;
  costPerUnit: number;
}

interface GainEvent {
  date: string;
  ticker: string;
  categoria: Categoria;
  quantity: number;
  sellProceedsTotal: number;
  costBasisTotal: number;
  gainLoss: number;
  month: string;
}

export interface MonthSummary {
  month: string;
  acoes_sales: number;
  acoes_gain: number;
  fiis_gain: number;
  intl_gain: number;
  etfs_gain: number;
  isenta: boolean;
  gain_bruto: number;
  ir_aliquota: number;
  ir_devido: number;
  acc_loss_inicio: number;
  acc_loss_fim: number;
}

export interface ImpostosResult {
  summaries: MonthSummary[];
  events: GainEvent[];
  total_ir: number;
  total_gain: number;
  total_loss: number;
  acc_loss_atual: number;
  year_filter: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "0").replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function parseDate(v: unknown): string {
  const s = String(v ?? "");
  // yyyy-mm-dd
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10);
  // dd/mm/yyyy
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s.slice(0, 10);
}

function isBuy(tipo: string): boolean {
  const t = tipo.toLowerCase();
  return (
    t.includes("compra") || t === "buy" || t.includes("aporte") ||
    t.includes("bonif") || t.includes("subscri")
  );
}

function isSell(tipo: string): boolean {
  const t = tipo.toLowerCase();
  return t.includes("venda") || t === "sell" || t.includes("resgate");
}

function categorizeTicker(ticker: string, moeda: string, corretora: string): Categoria {
  // International (USD-denominated or IBKR corretora)
  if (
    moeda === "USD" ||
    corretora.toLowerCase().includes("ibkr") ||
    corretora.toLowerCase().includes("interactive")
  ) {
    return "internacional";
  }

  const t = ticker.toUpperCase().replace(".SA", "");

  // FIIs — typically end in 11 (e.g., XPML11, HGLG11)
  if (/[A-Z]{4}11$/.test(t)) return "fiis";

  // ETFs B3 — common ETF patterns ending in B3
  if (/[A-Z]{4}[1-9][1-9]$/.test(t) && !t.endsWith("11")) {
    // Additional known ETFs
    const etfs = ["BOVA11", "IVVB11", "SPY11", "XINA11", "SMAL11", "HASH11", "GOLD11", "DIVO11"];
    if (etfs.includes(t + ".SA") || etfs.includes(t)) return "etfs_b3";
  }

  return "acoes_b3";
}

// ─── FIFO engine ─────────────────────────────────────────────────────────────

function computeFIFO(txs: Transacao[]): GainEvent[] {
  // Group by ticker
  const byTicker = new Map<string, Transacao[]>();
  for (const tx of txs) {
    const key = tx.ticker.toUpperCase().replace(".SA", "");
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key)!.push(tx);
  }

  const events: GainEvent[] = [];

  for (const [ticker, tickerTxs] of byTicker) {
    const sorted = [...tickerTxs].sort((a, b) => a.date.localeCompare(b.date));
    const lots: Lot[] = [];

    for (const tx of sorted) {
      if (isBuy(tx.tipo)) {
        if (tx.quantidade > 0) {
          lots.push({
            quantity: tx.quantidade,
            costPerUnit: tx.preco > 0 ? tx.preco : tx.valorBruto / tx.quantidade,
          });
        }
      } else if (isSell(tx.tipo)) {
        let remaining = tx.quantidade;
        let costBasis = 0;

        while (remaining > 0.0001 && lots.length > 0) {
          const lot = lots[0];
          const used = Math.min(remaining, lot.quantity);
          costBasis += used * lot.costPerUnit;
          lot.quantity -= used;
          remaining -= used;
          if (lot.quantity <= 0.0001) lots.shift();
        }

        // If we sell more than we bought (possible with corporatives), use tx.preco as cost
        if (remaining > 0.0001) {
          costBasis += remaining * tx.preco;
        }

        const sellProceeds =
          tx.valorLiquido > 0 ? tx.valorLiquido : tx.quantidade * tx.preco;

        const categoria = categorizeTicker(ticker, tx.moeda, tx.corretora);

        events.push({
          date: tx.date,
          ticker,
          categoria,
          quantity: tx.quantidade,
          sellProceedsTotal: sellProceeds,
          costBasisTotal: costBasis,
          gainLoss: sellProceeds - costBasis,
          month: tx.date.slice(0, 7),
        });
      }
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Monthly aggregation ──────────────────────────────────────────────────────

function aggregateByMonth(events: GainEvent[]): MonthSummary[] {
  // Group events by month
  const byMonth = new Map<string, {
    acoes_sales: number;
    acoes_gain: number;
    fiis_gain: number;
    intl_gain: number;
    etfs_gain: number;
  }>();

  for (const ev of events) {
    if (!byMonth.has(ev.month)) {
      byMonth.set(ev.month, {
        acoes_sales: 0, acoes_gain: 0, fiis_gain: 0, intl_gain: 0, etfs_gain: 0,
      });
    }
    const m = byMonth.get(ev.month)!;
    if (ev.categoria === "acoes_b3") {
      m.acoes_sales += ev.sellProceedsTotal;
      m.acoes_gain += ev.gainLoss;
    } else if (ev.categoria === "fiis") {
      m.fiis_gain += ev.gainLoss;
    } else if (ev.categoria === "internacional") {
      m.intl_gain += ev.gainLoss;
    } else if (ev.categoria === "etfs_b3") {
      m.etfs_gain += ev.gainLoss;
    }
  }

  const summaries: MonthSummary[] = [];
  let accLoss = 0;

  for (const [month, data] of [...byMonth.entries()].sort()) {
    // Isenção: ações B3 ≤ R$20k/mês → ganhos isentos
    const isenta = data.acoes_sales > 0 && data.acoes_sales <= 20000;
    const acoesGain = isenta ? 0 : data.acoes_gain;

    // Total taxable gain this month
    const gainBruto = acoesGain + data.fiis_gain + data.intl_gain + data.etfs_gain;

    const accLossInicio = accLoss;
    let taxBase = gainBruto - accLoss;

    if (taxBase < 0) {
      accLoss = Math.abs(taxBase);
      taxBase = 0;
    } else {
      accLoss = 0;
    }

    // Alíquota: 15% ações/ETFs, 20% FIIs — we use 15% as primary (simplified)
    const aliquota = data.fiis_gain > gainBruto * 0.5 ? 0.20 : 0.15;
    const irDevido = taxBase > 0 ? taxBase * aliquota : 0;

    summaries.push({
      month,
      acoes_sales: data.acoes_sales,
      acoes_gain: data.acoes_gain,
      fiis_gain: data.fiis_gain,
      intl_gain: data.intl_gain,
      etfs_gain: data.etfs_gain,
      isenta,
      gain_bruto: gainBruto,
      ir_aliquota: aliquota,
      ir_devido: irDevido,
      acc_loss_inicio: accLossInicio,
      acc_loss_fim: accLoss,
    });
  }

  return summaries;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam) : null;

  try {
    const raw = await fetchTab("meus_ativos");

    const txs: Transacao[] = raw
      .filter(r => r["tipo de transação"] || r["tipo"])
      .map(r => {
        const tipo = String(r["tipo de transação"] ?? r["tipo"] ?? "").trim();
        const ticker = String(r["símbolo"] ?? r["simbolo"] ?? r["symbol"] ?? "").trim().toUpperCase();
        return {
          date: parseDate(r["data"] ?? r["date"]),
          tipo,
          ticker,
          quantidade: Math.abs(parseNum(r["quantidade"] ?? r["qtd"] ?? r["quantity"])),
          preco: parseNum(r["preço"] ?? r["preco"] ?? r["price"]),
          valorBruto: Math.abs(parseNum(r["valor bruto"] ?? r["valor_bruto"])),
          valorLiquido: Math.abs(parseNum(r["valor líquido"] ?? r["valor_liquido"])),
          moeda: String(r["moeda"] ?? "BRL").toUpperCase(),
          corretora: String(r["corretora"] ?? "").trim(),
        };
      })
      .filter(t => t.ticker && (isBuy(t.tipo) || isSell(t.tipo)));

    // Filter by year if requested
    const filtered = year ? txs.filter(t => t.date.startsWith(String(year))) : txs;
    // Also need buys from before the year for correct cost basis
    const allForFIFO = year
      ? txs.filter(t => !t.date.startsWith(String(year)) ? isBuy(t.tipo) : true)
      : txs;

    const events = computeFIFO(allForFIFO);

    // Filter events to requested year
    const filteredEvents = year
      ? events.filter(e => e.date.startsWith(String(year)))
      : events;

    const summaries = aggregateByMonth(filteredEvents);

    const totalGain = filteredEvents.reduce((s, e) => e.gainLoss > 0 ? s + e.gainLoss : s, 0);
    const totalLoss = filteredEvents.reduce((s, e) => e.gainLoss < 0 ? s + Math.abs(e.gainLoss) : s, 0);
    const totalIR = summaries.reduce((s, m) => s + m.ir_devido, 0);
    const accLossAtual = summaries.length > 0 ? summaries[summaries.length - 1].acc_loss_fim : 0;

    const result: ImpostosResult = {
      summaries,
      events: filteredEvents,
      total_ir: totalIR,
      total_gain: totalGain,
      total_loss: totalLoss,
      acc_loss_atual: accLossAtual,
      year_filter: year,
    };

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
