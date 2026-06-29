/**
 * Lógica COMPARTILHADA de sincronização IBKR — fonte única.
 *
 * Tipos, helpers, builders e deduplicação usados por:
 *   - app/api/sync/ibkr/handler.ts       (upload de CSV)
 *   - app/api/sync/ibkr/flex/handler.ts  (Flex Web Service — chamada à API)
 *
 * Ambos produzem os MESMOS objetos (IbkrTrade/IbkrEvent) via buildTrade/
 * buildProvento e passam pela MESMA dedup, garantindo que importar por arquivo
 * ou por API gere linhas idênticas na planilha.
 *
 * Módulo puro (sem imports server-only).
 */

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface IbkrEvent {
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

export interface IbkrTrade {
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

export interface IbkrTradeResult extends IbkrTrade {
  status_match?: string;
  match_details?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES_PT: Record<number, string> = {
  1: "jan", 2: "fev", 3: "mar", 4: "abr", 5: "mai", 6: "jun",
  7: "jul", 8: "ago", 9: "set", 10: "out", 11: "nov", 12: "dez",
};

export function formatMesAno(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00Z");
    return `${MESES_PT[d.getUTCMonth() + 1]}/${String(d.getUTCFullYear()).slice(2)}`;
  } catch { return ""; }
}

export function formatValorBR(val: number): string {
  return Math.abs(val).toFixed(2).replace(".", ",");
}

/** Normaliza datas para `yyyy-MM-dd`. Aceita ISO, dd/mm/yyyy, dd-mm-yyyy e o
 *  formato compacto da IBKR Flex `yyyyMMdd` (ex.: 20260628). */
export function normalizeDate(s: string): string {
  const raw = s.trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const brHyphen = raw.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (brHyphen) return `${brHyphen[3]}-${brHyphen[2]}-${brHyphen[1]}`;
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/); // IBKR Flex yyyyMMdd
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return raw.slice(0, 10);
}

export function normalizeTicker(t: string): string {
  return t.replace(/\.(SA|TO|L|AS)$/i, "").trim().toUpperCase();
}

export function parseValor(v: string | number): number {
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(",", ".")) || 0;
}

// ── Builders — fonte única do formato gravado na planilha ──────────────────────

/** Monta uma linha de trade no formato exato da aba `meus_ativos`
 *  (decimais BR com vírgula). Usado pelo parser de CSV e pelo de Flex. */
export function buildTrade(p: {
  data: string;
  tipo: "Compra" | "Venda";
  ticker: string;
  qtd: number;
  preco: number;
  valorBruto: number;
  comissao: number;
  moeda: string;
}): IbkrTrade {
  const valorLiquido = p.tipo === "Compra" ? p.valorBruto + p.comissao : p.valorBruto - p.comissao;
  return {
    Data: p.data,
    "Tipo de transação": p.tipo,
    Símbolo: p.ticker,
    Quantidade: String(p.qtd).replace(".", ","),
    Preço: String(p.preco).replace(".", ","),
    "Valor bruto": p.valorBruto.toFixed(2).replace(".", ","),
    "Taxa de corretagem": p.comissao.toFixed(2).replace(".", ","),
    "Valor líquido": valorLiquido.toFixed(2).replace(".", ","),
    Moeda: p.moeda,
    Corretora: "IBKR",
  };
}

/** Monta uma linha de provento/imposto no formato exato da aba `meus_proventos`. */
export function buildProvento(p: {
  ticker: string;
  data: string;
  isImposto: boolean;
  valor: number;
  moeda: string;
}): IbkrEvent {
  const d = new Date(p.data + "T12:00:00Z");
  const lancamento = p.isImposto ? "IMPOSTO" : "Dividendo";
  return {
    ticker: p.ticker,
    data: p.data,
    decisao: lancamento,
    mes: formatMesAno(p.data),
    ano: String(d.getUTCFullYear()),
    lancamento,
    categoria: "Ação Internacional",
    valor: formatValorBR(p.valor),
    moeda: p.moeda,
  };
}

// ── Dedup: proventos ───────────────────────────────────────────────────────────

export function findMissingProventos(
  existing: Record<string, unknown>[],
  incoming: IbkrEvent[]
): IbkrEvent[] {
  const existingKeys = new Set<string>();

  for (const row of existing) {
    const ticker = normalizeTicker(String(row["ticker"] ?? ""));
    const data = normalizeDate(String(row["data"] ?? ""));
    const decisao = String(row["decisao"] ?? row["decisão"] ?? row["lancamento"] ?? row["lançamento"] ?? "").toUpperCase();
    const valor = Math.round(parseValor(String(row["valor"] ?? "0")) * 10);
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
    const ticker = normalizeTicker(ev.ticker);
    const tipo = ev.decisao === "IMPOSTO" ? "IMPOSTO" : "DIVIDENDO";
    const valor = Math.round(parseValor(ev.valor) * 10);
    const key = `${ev.data}|${ticker}|${tipo}|${valor}`;
    return !existingKeys.has(key);
  });
}

// ── Dedup: trades (com detecção de split e ordem fragmentada) ──────────────────

export function findMissingTrades(
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
