import { NextResponse } from "next/server";
import { fetchTab, appendRows } from "@/lib/gsheets";

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
    const valorStr = parts[10]?.trim() ?? "";

    if (!data || !simbolo) continue;

    const ticker = normalizeTicker(simbolo);

    // Determine currency from description
    let moeda = "USD";
    for (const m of ["CAD", "EUR", "GBP", "JPY", "CHF", "AUD"]) {
      if (descricao.includes(m)) { moeda = m; break; }
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
      const valorBruto = qtd * preco;
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

function findMissingProventos(
  existing: Record<string, unknown>[],
  incoming: IbkrEvent[]
): IbkrEvent[] {
  const existingKeys = new Set<string>();

  for (const row of existing) {
    const ticker = normalizeTicker(String(row["ticker"] ?? ""));
    const data = normalizeDate(String(row["data"] ?? ""));
    const decisao = String(row["decisao"] ?? "").toUpperCase();
    const valor = Math.round(parseValor(String(row["valor"] ?? "0")) * 10);
    const tipo = decisao.includes("IMPOSTO") ? "IMPOSTO" : "DIVIDENDO";

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

function findMissingTrades(
  existing: Record<string, unknown>[],
  incoming: IbkrTrade[]
): IbkrTrade[] {
  const existingSet: Array<{ ticker: string; tipo: string; qty: number; preco: number }> = [];

  for (const row of existing) {
    const ticker = normalizeTicker(String(row["Símbolo"] ?? row["simbolo"] ?? ""));
    const tipo = String(row["Tipo de transação"] ?? "").trim();
    const qty = Math.round(parseValor(String(row["Quantidade"] ?? "0")) * 100);
    const preco = parseValor(String(row["Preço"] ?? row["preco"] ?? "0"));
    existingSet.push({ ticker, tipo, qty, preco });
  }

  return incoming.filter(trade => {
    const ticker = normalizeTicker(trade.Símbolo);
    const tipo = trade["Tipo de transação"];
    const qty = Math.round(parseValor(trade.Quantidade) * 100);
    const preco = parseValor(trade.Preço);

    return !existingSet.some(ex =>
      ex.ticker === ticker &&
      ex.tipo === tipo &&
      Math.abs(ex.qty - qty) < 2 &&
      Math.abs(ex.preco - preco) / Math.max(Math.abs(ex.preco), Math.abs(preco), 1) < 0.02
    );
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
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
      const existing = await fetchTab("meus_proventos");
      const missing = findMissingProventos(existing, parsedProventos);

      result.proventos = {
        total_csv: parsedProventos.length,
        faltantes: missing.length,
        preview: missing.slice(0, 5),
      };

      if (!dryRun && missing.length > 0) {
        const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
        const rows = missing.map(e => COLS.map(c => (e as unknown as Record<string, string>)[c] ?? ""));
        await appendRows("meus_proventos", rows);
        (result.proventos as Record<string, unknown>).inserted = missing.length;
      }
    }

    if (["trades", "both"].includes(mode) && parsedTrades.length > 0) {
      const existing = await fetchTab("meus_ativos");
      const missing = findMissingTrades(existing, parsedTrades);

      result.trades = {
        total_csv: parsedTrades.length,
        faltantes: missing.length,
        preview: missing.slice(0, 5),
      };

      if (!dryRun && missing.length > 0) {
        const COLS = ["Data", "Tipo de transação", "Símbolo", "Quantidade", "Preço", "Valor bruto", "Taxa de corretagem", "Valor líquido", "Moeda", "Corretora"];
        const rows = missing.map(t => COLS.map(c => (t as unknown as Record<string, string>)[c] ?? ""));
        await appendRows("meus_ativos", rows);
        (result.trades as Record<string, unknown>).inserted = missing.length;
      }
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
