// Fontes externas que o Radar ainda não cobria — SERVER-ONLY. Cada função
// devolve {date,close}[] ascendente, ou [] em qualquer falha (o adapter trata []
// como indisponível → a regra fica "sem_dados", nunca inventa número).
//
//  • FRED (livre, sem chave): yield real 10a (DFII10) e spread de high yield (OAS).
//  • BCB Focus/Olinda (livre): expectativa de Selic.
// O proxy de prêmio de risco BR (razão S&P/EWZ) vive em adapters.ts (usa Yahoo).

const TIMEOUT = 12000;
const UA = "Mozilla/5.0 (compatible; MeusInvestimentos/1.0)";

async function getText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store", headers: { "User-Agent": UA } });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

function startISO(yearsBack: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - yearsBack);
  return d.toISOString().slice(0, 10);
}

// ── FRED — fredgraph.csv?id=SERIES&cosd=START (CSV livre, sem chave) ──────────
export async function fetchFred(seriesId: string, yearsBack = 5): Promise<{ date: string; close: number }[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}&cosd=${startISO(yearsBack)}`;
  const csv = await getText(url);
  if (!csv) return [];
  const out: { date: string; close: number }[] = [];
  const lines = csv.trim().split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    // formato: DATE,VALUE — valor faltante vem como "."
    const comma = lines[i].indexOf(",");
    if (comma < 0) continue;
    const d = lines[i].slice(0, comma).trim();
    const v = lines[i].slice(comma + 1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || v === "." || v === "") continue;
    const num = Number(v);
    if (isFinite(num)) out.push({ date: d, close: num });
  }
  return out;
}

// ── BCB Focus (Olinda) — expectativa de Selic ────────────────────────────────
// Constrói uma série diária tomando, por data de coleta, a MEDIANA esperada para
// o ano de referência SEGUINTE (horizonte ~constante de 12+ meses) e baseCalculo
// 0 (janela padrão). Livre, sem chave.
export async function fetchFocusSelic(yearsBack = 5): Promise<{ date: string; close: number }[]> {
  const cosd = startISO(yearsBack);
  const base = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais";
  const filtro = `Indicador eq 'Selic' and baseCalculo eq 0 and Data ge '${cosd}'`;
  const url =
    `${base}?$format=json&$select=Data,DataReferencia,Mediana` +
    `&$orderby=Data asc&$top=40000&$filter=${encodeURIComponent(filtro)}`;
  const txt = await getText(url);
  if (!txt) return [];
  let rows: { Data?: string; DataReferencia?: string | number; Mediana?: number }[];
  try {
    rows = JSON.parse(txt)?.value ?? [];
  } catch {
    return [];
  }
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const d = r.Data;
    const med = Number(r.Mediana);
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !isFinite(med)) continue;
    // horizonte rolante: expectativa para o ANO SEGUINTE ao da coleta
    if (String(r.DataReferencia) !== String(Number(d.slice(0, 4)) + 1)) continue;
    byDate.set(d, med);
  }
  return [...byDate.entries()].map(([date, close]) => ({ date, close })).sort((a, b) => (a.date < b.date ? -1 : 1));
}
