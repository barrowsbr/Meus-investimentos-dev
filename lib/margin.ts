// ─────────────────────────────────────────────────────────────────────────────
// Motor canônico de ALAVANCAGEM (margin accounts — IBKR e afins)
//
// Conceito (decisão do dono):
//   • Patrimônio BRUTO  = tudo que está investido (inclui o que foi comprado
//     com margin — o lucro/prejuízo dessas posições é meu).
//   • DÍVIDA de margin  = empréstimos abertos (na moeda de origem → BRL).
//   • NET (patrimônio líquido) = BRUTO − DÍVIDA = "o dinheiro que realmente
//     tenho", como o Net Liquidation Value da corretora.
//   • % alavancagem = dívida / bruto.
//
// Juros IBKR: benchmark da moeda do empréstimo (EFFR p/ USD, €STR p/ EUR,
// SARON p/ CHF, TONAR p/ JPY, Selic p/ BRL…) + spread (~1,5%). O benchmark é
// buscado automaticamente em APIs oficiais dos bancos centrais (gratuitas);
// o spread é informado pelo usuário. Acrual ACT/360 (convenção IBKR).
//
// Persistência: aba `alavancagem` da planilha gdados (criada se não existir).
// ─────────────────────────────────────────────────────────────────────────────

import { toNumber } from "./format";

type Row = Record<string, unknown>;

export const MARGIN_TAB = "alavancagem";
export const MARGIN_HEADERS = [
  "id", "data", "corretora", "moeda", "valor", "benchmark",
  "taxa_benchmark", "spread", "status", "data_fechamento", "valor_fechamento", "obs",
];

export interface MarginEntry {
  id: string;
  data: string;            // YYYY-MM-DD (abertura)
  corretora: string;
  moeda: string;           // moeda do empréstimo
  valor: number;           // principal na moeda de origem
  benchmark: string;       // ex.: "EFFR", "SARON", "SELIC"
  taxaBenchmark: number;   // % a.a. registrada na abertura (fallback do acrual)
  spread: number;          // % a.a. (ex.: 1.5)
  status: "aberta" | "fechada";
  dataFechamento: string;
  valorFechamento: number; // principal+juros pagos no fechamento (moeda origem)
  obs: string;
}

export interface MarginEntryMetrics extends MarginEntry {
  taxaBenchmarkAtual: number | null; // da API (null = usou a registrada)
  taxaTotal: number;                 // benchmark + spread (% a.a.)
  dias: number;                      // dias corridos desde a abertura
  valorBRL: number;
  jurosAcumNative: number;           // ACT/360 desde a abertura
  jurosAcumBRL: number;
  custoAnualBRL: number;
}

export interface MarginResumo {
  entradas: MarginEntryMetrics[];
  abertas: MarginEntryMetrics[];
  fechadas: MarginEntryMetrics[];
  dividaBRL: number;          // principal aberto em BRL
  jurosAcumBRL: number;       // juros acruados (estimativa) das abertas
  dividaComJurosBRL: number;
  custoAnualBRL: number;      // dívida × taxa total
}

// ── Benchmarks por moeda (APIs oficiais, sem chave) ──────────────────────────

export const BENCHMARK_POR_MOEDA: Record<string, { code: string; label: string }> = {
  USD: { code: "EFFR",  label: "Fed Funds Effective (NY Fed)" },
  EUR: { code: "ESTR",  label: "€STR (BCE)" },
  BRL: { code: "SELIC", label: "Selic meta (BCB)" },
  CHF: { code: "SARON", label: "SARON / política SNB" },
  JPY: { code: "TONAR", label: "TONAR / política BoJ" },
  GBP: { code: "SONIA", label: "SONIA / política BoE" },
  CAD: { code: "CORRA", label: "CORRA / política BoC" },
};

// Fallback estático quando a API falhar — o formulário permite sobrescrever.
const BENCHMARK_FALLBACK: Record<string, number> = {
  EFFR: 4.33, ESTR: 2.0, SELIC: 15.0, SARON: 0.0, TONAR: 0.5, SONIA: 4.0, CORRA: 2.75,
};

async function tryJson(url: string, timeoutMs = 8000): Promise<unknown | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** Busca a taxa benchmark atual (% a.a.) para um código. null = API indisponível. */
export async function fetchBenchmarkRate(code: string): Promise<number | null> {
  switch (code) {
    case "EFFR": {
      // NY Fed — Effective Federal Funds Rate
      const j = await tryJson("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json") as
        { refRates?: Array<{ percentRate?: number }> } | null;
      const v = j?.refRates?.[0]?.percentRate;
      return typeof v === "number" && v > 0 ? v : null;
    }
    case "SELIC": {
      // BCB SGS 432 — meta Selic definida pelo Copom (% a.a.)
      const j = await tryJson("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json") as
        Array<{ valor?: string }> | null;
      const v = parseFloat(String(j?.[0]?.valor ?? "").replace(",", "."));
      return isFinite(v) && v > 0 ? v : null;
    }
    case "ESTR": {
      // BCE data API — €STR (volume-weighted trimmed mean rate)
      try {
        const res = await fetch(
          "https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?lastNObservations=1&format=csvdata",
          { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } },
        );
        if (!res.ok) return null;
        const csv = await res.text();
        const lines = csv.trim().split("\n");
        if (lines.length < 2) return null;
        const headers = lines[0].split(",");
        const obsIdx = headers.findIndex(h => h.trim() === "OBS_VALUE");
        if (obsIdx < 0) return null;
        const v = parseFloat(lines[lines.length - 1].split(",")[obsIdx]);
        return isFinite(v) ? v : null;
      } catch { return null; }
    }
    // SARON/TONAR/SONIA/CORRA: sem API pública simples — usa fallback/registro.
    default:
      return null;
  }
}

/** Busca todas as taxas em paralelo, com fallback estático. */
export async function fetchBenchmarks(): Promise<Record<string, { rate: number; source: "api" | "fallback" }>> {
  const codes = [...new Set(Object.values(BENCHMARK_POR_MOEDA).map(b => b.code))];
  const results = await Promise.all(codes.map(async code => {
    const live = await fetchBenchmarkRate(code);
    return [code, live != null
      ? { rate: live, source: "api" as const }
      : { rate: BENCHMARK_FALLBACK[code] ?? 0, source: "fallback" as const }] as const;
  }));
  return Object.fromEntries(results);
}

// ── Parse das linhas da aba ───────────────────────────────────────────────────

function parseDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  return s.slice(0, 10);
}

export function parseMarginRows(rows: Row[]): MarginEntry[] {
  const out: MarginEntry[] = [];
  for (const r of rows) {
    const id = String(r["id"] ?? "").trim();
    const valor = Math.abs(toNumber(r["valor"]) ?? 0);
    if (!id || valor <= 0) continue;
    const statusRaw = String(r["status"] ?? "aberta").toLowerCase().trim();
    out.push({
      id,
      data: parseDate(r["data"]),
      corretora: String(r["corretora"] ?? "IBKR").trim() || "IBKR",
      moeda: (String(r["moeda"] ?? "USD").toUpperCase().trim() || "USD"),
      valor,
      benchmark: String(r["benchmark"] ?? "").toUpperCase().trim(),
      taxaBenchmark: toNumber(r["taxa_benchmark"]) ?? 0,
      spread: toNumber(r["spread"]) ?? 0,
      status: statusRaw.startsWith("fech") ? "fechada" : "aberta",
      dataFechamento: parseDate(r["data_fechamento"]),
      valorFechamento: Math.abs(toNumber(r["valor_fechamento"]) ?? 0),
      obs: String(r["obs"] ?? "").trim(),
    });
  }
  return out;
}

export function entryToRow(e: MarginEntry): string[] {
  return [
    e.id, e.data, e.corretora, e.moeda, String(e.valor), e.benchmark,
    String(e.taxaBenchmark), String(e.spread), e.status, e.dataFechamento,
    e.valorFechamento ? String(e.valorFechamento) : "", e.obs,
  ];
}

// ── Métricas ──────────────────────────────────────────────────────────────────

function diasEntre(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  if (!isFinite(ta) || !isFinite(tb)) return 0;
  return Math.max(0, Math.round((tb - ta) / 86400000));
}

export function computeMarginResumo(
  entries: MarginEntry[],
  fxBRL: Record<string, number>,                 // moeda → BRL
  benchmarks?: Record<string, { rate: number; source: "api" | "fallback" }>,
): MarginResumo {
  const hoje = new Date().toISOString().slice(0, 10);

  const entradas: MarginEntryMetrics[] = entries.map(e => {
    const fx = e.moeda === "BRL" ? 1 : (fxBRL[e.moeda] ?? 0);
    const live = benchmarks?.[e.benchmark]?.rate ?? null;
    const taxaBench = live ?? e.taxaBenchmark;
    const taxaTotal = taxaBench + e.spread;
    const fim = e.status === "fechada" && e.dataFechamento ? e.dataFechamento : hoje;
    const dias = diasEntre(e.data, fim);
    // ACT/360 — convenção IBKR para juros de margin
    const jurosAcumNative = e.valor * (taxaTotal / 100) * (dias / 360);
    const valorBRL = e.valor * fx;
    return {
      ...e,
      taxaBenchmarkAtual: live,
      taxaTotal,
      dias,
      valorBRL,
      jurosAcumNative,
      jurosAcumBRL: jurosAcumNative * fx,
      custoAnualBRL: valorBRL * (taxaTotal / 100),
    };
  });

  const abertas = entradas.filter(e => e.status === "aberta");
  const fechadas = entradas.filter(e => e.status === "fechada");
  const dividaBRL = abertas.reduce((s, e) => s + e.valorBRL, 0);
  const jurosAcumBRL = abertas.reduce((s, e) => s + e.jurosAcumBRL, 0);

  return {
    entradas, abertas, fechadas,
    dividaBRL,
    jurosAcumBRL,
    dividaComJurosBRL: dividaBRL + jurosAcumBRL,
    custoAnualBRL: abertas.reduce((s, e) => s + e.custoAnualBRL, 0),
  };
}

export function mergeIbkrMargin(entries: MarginEntry[], ibkrBalances: { moeda: string; saldo: number; jurosAcruados: number; initMargin: number; maintMargin: number }[]): MarginEntry[] {
  const result = [...entries];
  for (const mb of ibkrBalances) {
    if (mb.saldo <= 0) continue; // no debt
    // Find existing IBKR entry for this currency
    const idx = result.findIndex(e => e.status === "aberta" && e.corretora.toUpperCase() === "IBKR" && e.moeda === mb.moeda);
    
    // We create a mock entry or update the existing one
    if (idx >= 0) {
      result[idx] = { ...result[idx], valor: mb.saldo, obs: `IBKR Flex: Juros Acruados Mês ${mb.jurosAcruados.toFixed(2)}` };
    } else {
      result.push({
        id: `ibkr-${mb.moeda}`,
        data: new Date().toISOString().slice(0, 10),
        corretora: "IBKR",
        moeda: mb.moeda,
        valor: mb.saldo,
        benchmark: BENCHMARK_POR_MOEDA[mb.moeda]?.code ?? "USD",
        taxaBenchmark: 0,
        spread: 1.5,
        status: "aberta",
        dataFechamento: "",
        valorFechamento: 0,
        obs: `IBKR Flex: Juros Acruados Mês ${mb.jurosAcruados.toFixed(2)}`
      });
    }
  }
  return result;
}

// ── Margin canônico: aba + IBKR Flex (fonte única — regra dura) ──────────────
//
// A dívida real pode existir na IBKR sem estar espelhada na aba `alavancagem`.
// Historicamente só /api/composicao/resumo e /api/alavancagem faziam o merge
// com o Flex, enquanto /api/cotacoes (o canônico!), /api/performance/advanced
// e o cron de alertas liam só a aba — e o "Net" divergia entre páginas.
// TODA rota que calcula alavancagem deve montar as entradas por aqui.

export interface IbkrMarginBalance {
  moeda: string;
  saldo: number;
  jurosAcruados: number;
  initMargin: number;
  maintMargin: number;
}

/** Saldos de margin reais da IBKR (Flex, cache 30 min). Best-effort: sem env
 *  vars ou com Flex fora do ar retorna [] — a aba continua valendo sozinha. */
export async function loadIbkrMarginBalances(): Promise<IbkrMarginBalance[]> {
  try {
    const token = process.env.IBKR_FLEX_TOKEN;
    const queryId = process.env.IBKR_FLEX_QUERY_ID;
    if (!token || !queryId) return [];
    const { getFlexXmlCached, parseFlexXml } = await import("./ibkr-flex");
    const xml = await getFlexXmlCached(token, queryId, 1800000); // 30 min cache
    return parseFlexXml(xml).marginBalances;
  } catch (e) {
    console.error("Erro ao buscar margem IBKR:", e);
    return [];
  }
}

/** Entradas de margin CANÔNICAS: aba `alavancagem` + merge dos saldos IBKR. */
export async function loadMarginEntriesCanonicas(marginRows: Row[]): Promise<MarginEntry[]> {
  const entries = parseMarginRows(marginRows);
  const ibkr = await loadIbkrMarginBalances();
  return ibkr.length > 0 ? mergeIbkrMargin(entries, ibkr) : entries;
}

// ── Integração com o motor geral (snapshot/performance) ─────────────────────
//
// Para os APIs que já têm o snapshot: lê a aba e devolve a dívida aberta em
// BRL. Falha silenciosa (aba ausente / sem service account) ⇒ dívida zero,
// preservando o comportamento atual para quem não usa margin.

export interface AlavancagemPatrimonio {
  dividaBRL: number;
  jurosAcumBRL: number;
  netBRL: number;
  alavancagemPct: number;   // dívida / bruto
  leverageRatio: number;    // bruto / net
}

export function aplicarAlavancagem(brutoBRL: number, resumo: Pick<MarginResumo, "dividaBRL" | "jurosAcumBRL">): AlavancagemPatrimonio {
  const dividaBRL = resumo.dividaBRL;
  const netBRL = brutoBRL - dividaBRL;
  return {
    dividaBRL,
    jurosAcumBRL: resumo.jurosAcumBRL,
    netBRL,
    alavancagemPct: brutoBRL > 0 ? (dividaBRL / brutoBRL) * 100 : 0,
    leverageRatio: netBRL > 0 ? brutoBRL / netBRL : 0,
  };
}
