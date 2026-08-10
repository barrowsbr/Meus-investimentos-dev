// ── ETF Cem / Índice mundo — composição REAL do MSCI ACWI ────────────────────
// Fonte: SPDR MSCI ACWI UCITS (SPYY) da SSGA — holdings COMPLETOS em XLSX
// diário (~2.300 papéis, 23 desenvolvidos + 24 emergentes), mesmo host já
// usado em produção para o SPY. Escolhido depois de testar as alternativas:
// iShares ACWI bloqueia fetch (Akamai) e o JSON do Vanguard VT vem com
// composição trimestral defasada.
//
// O XLSX identifica cada papel por ISIN (não por ticker Yahoo). O mapeamento
// ISIN → símbolo Yahoo é feito via busca do Yahoo por ISIN e CACHEADO na aba
// `etf_mundo_map` da planilha (golden source: resolve UMA vez por empresa na
// vida; rodadas seguintes leem da aba). A resolução é PROGRESSIVA — até
// MAX_BUSCAS_POR_RODADA por chamada, priorizando os maiores pesos — e papéis
// ainda sem símbolo aparecem na página com os dados do próprio XLSX (nome,
// peso, país, preço local), sem cotação ao vivo até o símbolo chegar.
//
// SERVER-ONLY (yahoo-finance2 + gsheets) — client importa só types daqui.

import * as XLSX from "xlsx";
import { fetchTab, ensureTab, appendRowsTyped } from "@/lib/gsheets";

export interface PapelAcwi {
  isin: string;
  nome: string;
  moeda: string;       // moeda de negociação local (SSGA)
  pesoPct: number;
  pais: string;
  setor: string;
  precoLocal: number | null; // preço do próprio XLSX (fallback p/ não mapeados)
}

export interface ComposicaoAcwi {
  asOf: string | null; // "2026-08-06"
  papeis: PapelAcwi[]; // top N por peso, só equity com ISIN válido
}

const SPYY_URL =
  "https://www.ssga.com/library-content/products/fund-data/etfs/emea/holdings-daily-emea-en-spyy-gy.xlsx";

const TAB_MAP = "etf_mundo_map";
const COLS_MAP = ["isin", "symbol", "nome"];
// Marcador para ISIN que o Yahoo não achou — evita re-buscar a cada rodada.
export const SEM_SIMBOLO = "nao_encontrado";

const MAX_BUSCAS_POR_RODADA = 60;
const CONCORRENCIA_BUSCA = 5;

const MESES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseAsOf(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const m = String(v ?? "").trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); // "06-Aug-2026"
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  return mes ? `${m[3]}-${mes}-${m[1].padStart(2, "0")}` : null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return isFinite(n) ? n : null;
};

/** Baixa e parseia o XLSX da SSGA. topN limita ao topo por peso. */
export async function fetchComposicaoAcwi(topN = 500): Promise<ComposicaoAcwi> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let buf: ArrayBuffer;
  try {
    const res = await fetch(SPYY_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MeusInvestimentos)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`SSGA HTTP ${res.status}`);
    buf = await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }

  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  let asOf: string | null = null;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(linhas.length, 12); i++) {
    const l = linhas[i];
    const c0 = String(l?.[0] ?? "").trim().toLowerCase();
    if (c0.startsWith("holdings as of")) asOf = parseAsOf(l?.[1]);
    if (c0 === "isin") { headerIdx = i; break; }
  }
  if (headerIdx === -1) throw new Error("XLSX da SSGA sem header ISIN — formato mudou");

  const header = (linhas[headerIdx] as unknown[]).map((c) => String(c ?? "").trim().toLowerCase());
  const col = (nome: string) => header.findIndex((h) => h.startsWith(nome));
  const iIsin = col("isin");
  const iNome = col("security name");
  const iMoeda = col("currency");
  const iPeso = col("percent of fund");
  const iPais = col("trade country");
  const iPreco = col("local price");
  const iSetor = col("sector");

  const papeis: PapelAcwi[] = [];
  for (let i = headerIdx + 1; i < linhas.length; i++) {
    const l = linhas[i] as unknown[];
    const isin = String(l?.[iIsin] ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue; // pula caixa/futuros/rodapé
    const peso = num(l?.[iPeso]);
    if (peso === null || peso <= 0) continue;
    papeis.push({
      isin,
      nome: String(l?.[iNome] ?? "").trim() || isin,
      moeda: String(l?.[iMoeda] ?? "").trim().toUpperCase() || "USD",
      pesoPct: peso,
      pais: String(l?.[iPais] ?? "").trim() || "—",
      setor: String(l?.[iSetor] ?? "").trim(),
      precoLocal: num(l?.[iPreco]),
    });
  }
  papeis.sort((a, b) => b.pesoPct - a.pesoPct);
  return { asOf, papeis: papeis.slice(0, topN) };
}

/** Lê o cache ISIN→símbolo da planilha (last-wins). */
export async function lerMapaSimbolos(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    for (const row of await fetchTab(TAB_MAP)) {
      const isin = String(row["isin"] ?? "").trim().toUpperCase();
      const symbol = String(row["symbol"] ?? "").trim();
      if (isin && symbol) mapa.set(isin, symbol);
    }
  } catch { /* aba ainda não existe */ }
  return mapa;
}

/** Resolve ISINs sem símbolo via busca do Yahoo (progressivo, maiores pesos
 *  primeiro) e persiste os novos na aba. Devolve o mapa atualizado. */
export async function resolverSimbolos(
  papeis: PapelAcwi[],
  mapa: Map<string, string>,
): Promise<{ mapa: Map<string, string>; buscados: number; pendentes: number }> {
  const faltam = papeis.filter((p) => !mapa.has(p.isin));
  const lote = faltam.slice(0, MAX_BUSCAS_POR_RODADA);
  if (lote.length === 0) return { mapa, buscados: 0, pendentes: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const YF: any = (await import("yahoo-finance2")).default;
  const yf = typeof YF === "function" ? new YF() : YF;

  const novos: string[][] = [];
  for (let i = 0; i < lote.length; i += CONCORRENCIA_BUSCA) {
    const leva = lote.slice(i, i + CONCORRENCIA_BUSCA);
    await Promise.all(leva.map(async (p) => {
      try {
        const r = await yf.search(p.isin, { quotesCount: 3, newsCount: 0 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = (r?.quotes ?? []).find((x: any) => typeof x?.symbol === "string" && x.symbol);
        const symbol = q?.symbol ? String(q.symbol).toUpperCase() : SEM_SIMBOLO;
        mapa.set(p.isin, symbol);
        novos.push([p.isin, symbol, p.nome]);
      } catch { /* throttle — fica para a próxima rodada */ }
    }));
  }

  if (novos.length > 0) {
    try {
      await ensureTab(TAB_MAP, COLS_MAP);
      await appendRowsTyped(TAB_MAP, novos);
    } catch { /* demo/sem service account — o mapa vale só nesta execução */ }
  }
  const pendentes = papeis.filter((p) => !mapa.has(p.isin)).length;
  return { mapa, buscados: novos.length, pendentes };
}
