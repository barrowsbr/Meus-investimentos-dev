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

function normalizeDate(s: string): string {
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return s.slice(0, 10);
}

function normalizeTicker(t: string): string {
  // Extract ticker from "TICKER - FULL NAME" format
  const match = t.match(/^([A-Z0-9]+)/i);
  return (match ? match[1] : t).replace(/\.(SA|TO|L|AS)$/i, "").trim().toUpperCase();
}

function parseValor(v: string | number): number {
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

function formatValorBR(val: number): string {
  return Math.abs(val).toFixed(2).replace(".", ",");
}

// ── B3 CSV/TXT Parser ─────────────────────────────────────────────────────────
// B3 exports dividend files in CSV format with columns like:
// Empresa;Código;Data Com;Evento;Valor por Cota;Tipo;
// or tab-separated with similar structure

interface B3Provento {
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

function parseB3Csv(content: string): B3Provento[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // Detect separator
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";

  // Find header row
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const h = lines[i].split(sep).map(c => c.trim().toLowerCase());
    if (h.some(c => c.includes("código") || c.includes("ticker") || c.includes("ativo") || c.includes("produto"))) {
      headerIdx = i;
      headers = h;
      break;
    }
  }

  if (headerIdx === -1) return [];

  const findCol = (keywords: string[]) => {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const tickerCol = findCol(["código", "ticker", "ativo", "produto", "papel"]);
  const dataCol = findCol(["data com", "data pagamento", "data", "pagamento"]);
  const valorCol = findCol(["valor por", "valor cota", "valor unit", "rendimento", "valor"]);
  const tipoCol = findCol(["evento", "tipo", "lançamento", "provento"]);
  const empresaCol = findCol(["empresa", "nome", "razão"]);

  const result: B3Provento[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 3) continue;

    const rawTicker = tickerCol !== -1 ? cols[tickerCol] : "";
    if (!rawTicker) continue;

    const ticker = normalizeTicker(rawTicker);
    if (ticker.length < 4) continue;

    const rawData = dataCol !== -1 ? cols[dataCol] : "";
    if (!rawData) continue;

    const data = normalizeDate(rawData);
    if (!data.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

    const rawValor = valorCol !== -1 ? cols[valorCol] : "0";
    const valor = parseValor(rawValor);
    if (valor <= 0) continue;

    const rawTipo = tipoCol !== -1 ? cols[tipoCol] : "";
    let lancamento = "Dividendo";
    let categoria = "Ações Brasil";

    const tipoLower = rawTipo.toLowerCase();
    if (tipoLower.includes("jcp") || tipoLower.includes("juros")) {
      lancamento = "JCP";
    } else if (tipoLower.includes("rend") || tipoLower.includes("fii")) {
      lancamento = "Rendimento";
      categoria = "FIIs";
    } else if (tipoLower.includes("amort")) {
      lancamento = "Amortização";
    }

    const d = new Date(data + "T12:00:00Z");

    result.push({
      ticker,
      data,
      decisao: "Dividendo",
      mes: formatMesAno(data),
      ano: String(d.getUTCFullYear()),
      lancamento,
      categoria,
      valor: formatValorBR(valor),
      moeda: "BRL",
    });
  }

  return result;
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

function findMissingProventos(
  existing: Record<string, unknown>[],
  incoming: B3Provento[]
): B3Provento[] {
  const existingKeys = new Set<string>();

  for (const row of existing) {
    const ticker = normalizeTicker(String(row["ticker"] ?? ""));
    const data = normalizeDate(String(row["data"] ?? ""));
    const valor = Math.round(parseValor(String(row["valor"] ?? "0")) * 100);

    try {
      const d = new Date(data + "T12:00:00Z");
      for (let offset = -3; offset <= 3; offset++) {
        const dd = new Date(d.getTime() + offset * 86400000);
        const ds = dd.toISOString().split("T")[0];
        existingKeys.add(`${ds}|${ticker}|${valor}`);
      }
    } catch {
      existingKeys.add(`${data}|${ticker}|${valor}`);
    }
  }

  return incoming.filter(ev => {
    const ticker = normalizeTicker(ev.ticker);
    const valor = Math.round(parseValor(ev.valor) * 100);
    const key = `${ev.data}|${ticker}|${valor}`;
    return !existingKeys.has(key);
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const store = getDataStore();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const dryRun = formData.get("dry_run") === "true";

    if (!file) {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 400 });
    }

    const content = await file.text();
    const parsed = parseB3Csv(content);

    if (parsed.length === 0) {
      return NextResponse.json({
        error: "Nenhum provento reconhecido no arquivo. Verifique o formato.",
        hint: "Formatos aceitos: CSV ou TXT exportado da B3 com colunas de código, data e valor.",
      }, { status: 422 });
    }

    const existing = await store.fetchTab("meus_proventos");
    const missing = findMissingProventos(existing, parsed);

    const result: Record<string, unknown> = {
      total_csv: parsed.length,
      faltantes: missing.length,
      preview: missing.slice(0, 10),
    };

    if (!dryRun && missing.length > 0) {
      await backupTab("meus_proventos").catch(() => {});
      const COLS = ["ticker", "data", "decisao", "mes", "ano", "lancamento", "categoria", "valor", "moeda"];
      const rows = missing.map(e => COLS.map(c => (e as unknown as Record<string, string>)[c] ?? ""));
      await store.appendRows("meus_proventos", rows);
      result.inserted = missing.length;
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
