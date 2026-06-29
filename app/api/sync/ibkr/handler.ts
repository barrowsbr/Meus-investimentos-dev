import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { backupTab } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES_PT: Record<number, string> = {
  1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
  7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez",
};

function formatMesAno(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    return `${MESES_PT[d.getUTCMonth() + 1]}/${String(d.getUTCFullYear()).slice(2)}`;
  } catch { return ""; }
}

function formatValorBR(val: number): string {
  return Math.abs(val).toFixed(2).replace(".", ",");
}

function normalizeDate(s: string): string {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const brHyphen = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (brHyphen) return `${brHyphen[3]}-${brHyphen[2]}-${brHyphen[1]}`;
  return s.slice(0, 10);
}

function normalizeTicker(t: string): string {
  return t.replace(/\.(SA|TO|L|AS)$/i, "").trim().toUpperCase();
}

function parseValor(v: string | number): number {
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(",", ".")) || 0;
}

// ── IBKR CSV Parser ───────────────────────────────────────────────────────────

interface IbkrEvent {
  ticker: string;
  data: string;
  decisao: string;
  mes: string;
  ano: string;
  lancamento: string;
  categoria: string;
  valor: string;
  moeda: string;
}

interface IbkrTrade {
  Data: string;
  "Tipo de transação": string;
  Símbolo: string;
  Quantidade: string;
  Preço: string;
  "Valor bruto": string;
  "Taxa de corretagem": string;
  "Valor líquido": string;
  Moeda: string;
  Corretora: string;
}

function parseIBKRCsv(content: string): { proventos: IbkrEvent[]; trades: IbkrTrade[] } {
  const lines = content.split(/\r?\n/);
  const proventos: IbkrEvent[] = [];
  const trades: IbkrTrade[] = [];

  for (const line of lines) {
    // IBKR CSV transaction header: "Histórico de transações,Data,..."
    if (!line.startsWith("Histórico de transações,")) continue;
    const parts = line.split(",");
    if (parts.length < 11) continue;

    const data = normalizeDate(parts[2]?.trim() ?? "");
    const descricao = parts[4]?.trim() ?? "";
    const tipo = parts[5]?.trim() ?? "";
    const simbolo = parts[6]?.trim() ?? "";
    const moedaPreco = (parts[9]?.trim() ?? "");
    const valorStr = parts[10]?.trim() ?? "";

    if (!data || !simbolo) continue;

    const ticker = normalizeTicker(simbolo);

    let moeda = "USD";
    const KNOWN = ["USD", "CAD", "EUR", "GBP", "JPY", "CHF", "AUD", "HKD", "SGD", "SEK", "NOK", "DKK", "NZD"];
    if (moedaPreco && moedaPreco !== "-" && KNOWN.includes(moedaPreco.toUpperCase())) {
      moeda = moedaPreco.toUpperCase();
    } else {
      for (const m of ["CAD", "EUR", "GBP", "JPY", "CHF", "AUD"]) {
        if (descricao.includes(m)) { moeda = m; break; }
      }
    }

    if (tipo === "Dividendo" || tipo === "Dividend") {
      const valor = parseValor(valorStr);
      if (isNaN(valor)) continue;
      const d = new Date(data + "T12:00:00Z");
      proventos.push({
        ticker,
        data,
        decisao: "Dividendo",
        mes: formatMesAno(data),
        ano: String(d.getUTCFullYear()),
        lancamento: "Dividendo",
        categoria: "Ação Internacional",
        valor: formatValorBR(valor),
        moeda,
      });
    } else if (tipo === "Retenção de imposto estrangeiro" || tipo.includes("Tax")) {
      const valor = parseValor(valorStr);
      if (isNaN(valor)) continue;
      const d = new Date(data + "T12:00:00Z");
      proventos.push({
        ticker,
        data,
        decisao: "IMPOSTO",
        mes: formatMesAno(data),
        ano: String(d.getUTCFullYear()),
        lancamento: "IMPOSTO",
        categoria: "Ação Internacional",
        valor: formatValorBR(Math.abs(valor)),
        moeda,
      });
    } else if (["Compra", "Venda", "Buy", "Sell"].includes(tipo)) {
      const qtdStr = parts[7]?.trim() ?? "0";
      const precoStr = parts[8]?.trim() ?? "0";
      const comissaoStr = parts[11]?.trim() ?? "0";

      const qtd = Math.abs(parseValor(qtdStr));
      const preco = Math.abs(parseValor(precoStr));
      const comissao = Math.abs(parseValor(comissaoStr));
      let valorBruto = Math.abs(parseValor(valorStr));
      if (valorBruto === 0 && qtd > 0 && preco > 0) {
        valorBruto = Math.round(qtd * preco * 100) / 100;
      }
      const tipoNorm = ["Compra", "Buy"].includes(tipo) ? "Compra" : "Venda";
      const valorLiquido = tipoNorm === "Compra" ? valorBruto + comissao : valorBruto - comissao;

      trades.push({
        Data: data,
        "Tipo de transação": tipoNorm,
        Símbolo: ticker,
        Quantidade: String(qtd).replace(".", ","),
        Preço: String(preco).replace(".", ","),
        "Valor bruto": String(valorBruto.toFixed(2)).replace(".", ","),
        "Taxa de corretagem": String(comissao.toFixed(2)).replace(".", ","),
        "Valor líquido": String(valorLiquido.toFixed(2)).replace(".", ","),
        Moeda: moeda,
        Corretora: "IBKR",
      });
    }
  }

  return { proventos, trades };
}

// ── Dedup check ───────────────────────────────────────────────────────────────

// Normalização de ticker para COMPARAÇÃO: remove qualquer sufixo de bolsa
// (.TO, .AS, .SA, .DE, .L, …) para casar DPM↔DPM.TO, ASML↔ASML.AS, etc.
function dedupTk(t: string): string {
  return String(t ?? "").toUpperCase().trim().replace(/\.[A-Z]{1,2}$/i, "");
}

function findMissingProventos(
  existing: Record<string, unknown>[],
  incoming: IbkrEvent[]
): IbkrEvent[] {
  const existingKeys = new Set<string>();

  for (const row of existing) {
    const ticker = dedupTk(String(row["ticker"] ?? ""));
    const data = normalizeDate(String(row["data"] ?? ""));
    const decisao = String(row["decisao"] ?? row["decisão"] ?? row["lancamento"] ?? row["lançamento"] ?? "").toUpperCase();
    // Valor SEM sinal: imposto costuma ser gravado negativo (dedução) e o IBKR
    // manda em módulo — sem o abs, nenhum IMPOSTO casaria.
    const valor = Math.round(Math.abs(parseValor(String(row["valor"] ?? "0"))) * 10);
    const tipo = (decisao.includes("IMPOSTO") || decisao.includes("TAX")) ? "IMPOSTO" : "DIVIDENDO";

    // ±3 day window
    try {
      const d = new Date(data + "T12:00:00Z");
      for (let offset = -3; offset <= 3; offset++) {
        const dd = new Date(d.getTime() + offset * 86400000);
        const ds = dd.toISOString().split("T")[0];
        existingKeys.add(`${ds}|${ticker}|${tipo}|${valor}`);
      }
    } catch {
      existingKeys.add(`${data}|${ticker}|${tipo}|${valor}`);
    }
  }

  return incoming.filter(ev => {
    const ticker = dedupTk(ev.ticker);
    const tipo = ev.decisao === "IMPOSTO" ? "IMPOSTO" : "DIVIDENDO";
    const valor = Math.round(Math.abs(parseValor(ev.valor)) * 10);
    const key = `${ev.data}|${ticker}|${tipo}|${valor}`;
    return !existingKeys.has(key);
  });
}

interface IbkrTradeResult extends IbkrTrade {
  status_match?: string;
  match_details?: string[];
}

function findMissingTrades(
  existing: Record<string, unknown>[],
  incoming: IbkrTrade[]
): IbkrTradeResult[] {
  if (incoming.length === 0) return [];

  const existingTrades: Array<{
    ticker: string; tipo: string; qty: number; preco: number; matched: boolean;
  }> = [];

  for (const row of existing) {
    const ticker = normalizeTicker(String(row["símbolo"] ?? row["simbolo"] ?? ""));
    const tipo = String(row["tipo de transação"] ?? row["tipo de transacao"] ?? "").trim();
    const qty = Math.round(parseValor(String(row["quantidade"] ?? "0")) * 100) / 100;
    const preco = parseValor(String(row["preço"] ?? row["preco"] ?? "0"));
    existingTrades.push({ ticker, tipo, qty, preco, matched: false });
  }

  function findMatch(ticker: string, tipo: string, qty: number, preco: number) {
    for (const trade of existingTrades) {
      if (trade.matched) continue;
      if (trade.ticker !== ticker) continue;
      if (trade.tipo !== tipo) continue;
      if (Math.abs(trade.qty - qty) > 0.01) continue;
      const precoDiff = Math.abs(trade.preco - preco);
      const precoPct = precoDiff / Math.max(trade.preco, preco, 1) * 100;
      if (precoPct <= 1 || precoDiff <= 1) {
        return trade;
      }
    }
    return null;
  }

  function findSplitOrCorrection(ticker: string, tipo: string, valorTotalIbkr: number) {
    const candidates: Array<typeof existingTrades[0]> = [];
    for (const trade of existingTrades) {
      if (trade.matched) continue;
      if (trade.ticker !== ticker) continue;
      if (trade.tipo !== tipo) continue;
      const valorTotalGs = trade.qty * trade.preco;
      const diff = Math.abs(valorTotalGs - valorTotalIbkr);
      if (diff < 5 || (valorTotalIbkr > 0 && diff / valorTotalIbkr < 0.01)) {
        candidates.push(trade);
      }
    }
    return candidates;
  }

  // Phase 0: Group fragmented orders (IBKR sends 1+1, GSheets has 2)
  const groupKeys = new Map<string, number[]>();
  for (let i = 0; i < incoming.length; i++) {
    const t = incoming[i];
    const key = `${normalizeTicker(t.Símbolo)}|${t["Tipo de transação"]}|${t.Data}`;
    const indices = groupKeys.get(key) ?? [];
    indices.push(i);
    groupKeys.set(key, indices);
  }

  const processedIndices = new Set<number>();
  const faltantes: IbkrTradeResult[] = [];

  // Phase A: Process fragmented groups first
  for (const [, indices] of groupKeys) {
    if (indices.length <= 1) continue;

    const groupRows = indices.map(i => incoming[i]);
    let totalQty = 0;
    let totalValue = 0;
    for (const r of groupRows) {
      const q = Math.abs(parseValor(r.Quantidade));
      const p = Math.abs(parseValor(r.Preço));
      totalQty += q;
      totalValue += q * p;
    }
    const avgPrice = totalQty > 0 ? totalValue / totalQty : 0;

    const first = groupRows[0];
    const ticker = normalizeTicker(first.Símbolo);
    const tipo = first["Tipo de transação"];

    const match = findMatch(ticker, tipo, Math.round(totalQty * 100) / 100, avgPrice);
    if (match) {
      match.matched = true;
      for (const idx of indices) processedIndices.add(idx);
    }
  }

  // Phase B: Individual matching for remaining
  for (let i = 0; i < incoming.length; i++) {
    if (processedIndices.has(i)) continue;

    const row = incoming[i];
    const ticker = normalizeTicker(row.Símbolo);
    const tipo = row["Tipo de transação"];
    const qty = Math.round(Math.abs(parseValor(row.Quantidade)) * 100) / 100;
    const preco = Math.abs(parseValor(row.Preço));
    const valorTotal = qty * preco;

    const match = findMatch(ticker, tipo, qty, preco);
    if (match) {
      match.matched = true;
    } else {
      const possibleSplits = findSplitOrCorrection(ticker, tipo, valorTotal);
      const result: IbkrTradeResult = { ...row };

      if (possibleSplits.length > 0) {
        result.status_match = "POTENTIAL_SPLIT";
        result.match_details = possibleSplits.map(
          s => `${s.qty} x ${s.preco} (Total: ${(s.qty * s.preco).toFixed(2)})`
        );
      } else {
        result.status_match = "MISSING";
      }

      faltantes.push(result);
    }
  }

  return faltantes;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const store = getDataStore();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) ?? "proventos"; // "proventos" | "trades" | "both"
    const dryRun = formData.get("dry_run") === "true";

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 400 });
    }

    const content = await file.text();
    const { proventos: parsedProventos, trades: parsedTrades } = parseIBKRCsv(content);

    const result: Record<string, unknown> = {
      parsed: {
        proventos: parsedProventos.length,
        trades: parsedTrades.length,
      },
    };

    if (["proventos", "both"].includes(mode) && parsedProventos.length > 0) {
      const existing = await store.fetchTab("meus_proventos");
      const missing = findMissingProventos(existing, parsedProventos);

      result.proventos = {
        total_csv: parsedProventos.length,
        faltantes: missing.length,
        preview: missing.slice(0, 5),
      };

      if (!dryRun && missing.length > 0) {
        await backupTab("meus_proventos").catch(() => {});
        const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
        const rows = missing.map(e => COLS.map(c => (e as unknown as Record<string, string>)[c] ?? ""));
        await store.appendRows("meus_proventos", rows);
        (result.proventos as Record<string, unknown>).inserted = missing.length;
      }
    }

    if (["trades", "both"].includes(mode) && parsedTrades.length > 0) {
      const existing = await store.fetchTab("meus_ativos");
      const allMissing = findMissingTrades(existing, parsedTrades);

      const trulyMissing = allMissing.filter(t => t.status_match === "MISSING");
      const potentialSplits = allMissing.filter(t => t.status_match === "POTENTIAL_SPLIT");

      result.trades = {
        total_csv: parsedTrades.length,
        existing_count: existing.length,
        faltantes: trulyMissing.length,
        potential_splits: potentialSplits.length,
        preview: allMissing.slice(0, 10).map(t => ({
          ...t,
          status_match: t.status_match,
          match_details: t.match_details,
        })),
      };

      if (!dryRun && trulyMissing.length > 0) {
        await backupTab("meus_ativos").catch(() => {});
        const COLS = ["Data", "Tipo de transação", "Símbolo", "Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido", "Moeda", "Corretora"];
        const rows = trulyMissing.map(t => COLS.map(c => (t as unknown as Record<string, string>)[c] ?? ""));
        await store.appendRows("meus_ativos", rows);
        (result.trades as Record<string, unknown>).inserted = trulyMissing.length;
      }
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
