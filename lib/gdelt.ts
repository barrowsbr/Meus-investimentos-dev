// ─────────────────────────────────────────────────────────────────────────────
// Fundação GDELT (aberto, sem key) compartilhada por:
//  • Buzz & Sentimento de um ativo (Renda Variável) — timelinevol + timelinetone
//  • Termômetro/visão GDELT do Radar — tom e volume globais + focos
//  • Camadas do globo — GEO 2.0 (ver lib/globe-conflicts.ts)
//
// DOC 2.0 API: https://api.gdeltproject.org/api/v2/doc/doc
//   mode=timelinevol  → "Volume Intensity" (% da cobertura global) por dia
//   mode=timelinetone → "Average Tone" (sentimento, ~-10..+10) por dia
// ─────────────────────────────────────────────────────────────────────────────

import { gdeltJson } from "@/lib/gdelt-fetch";

const DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

export interface GdeltPoint {
  date: string;   // YYYY-MM-DD
  vol: number | null;   // volume intensity (%) — cobertura
  tone: number | null;  // tom médio
}

export interface GdeltBuzz {
  query: string;
  points: GdeltPoint[];
  volAvg: number;        // média de cobertura no período
  volChangePct: number;  // variação da cobertura (2ª metade vs 1ª)
  toneAvg: number;       // tom médio no período
  toneNow: number;       // tom recente (últimos pontos)
  toneChange: number;    // toneNow − toneAvg (direção)
  hasData: boolean;
}

interface GdeltTimelineResp {
  timeline?: { series?: string; data?: { date?: string; value?: number }[] }[];
}

// "20260601T120000Z" | "2026-06-01" → "2026-06-01"
function gdeltDate(s: string): string {
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
}

async function fetchTimeline(query: string, mode: "timelinevol" | "timelinetone", days: number): Promise<Map<string, number>> {
  // GDELT não decodifica "+" como espaço — usar %20 (encodeURIComponent), não
  // URLSearchParams (que produz "+", quebrando a query). A chamada passa pelo
  // wrapper serializado (gdeltJson): respeita o limite de 1 req/5s e cacheia.
  const url = `${DOC_URL}?query=${encodeURIComponent(query)}&mode=${mode}&format=json&timespan=${days}d`;
  const json = await gdeltJson<GdeltTimelineResp>(url);
  const data = json?.timeline?.[0]?.data ?? [];
  const out = new Map<string, number>();
  for (const d of data) {
    if (!d.date || typeof d.value !== "number") continue;
    out.set(gdeltDate(d.date), d.value);
  }
  return out;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

/** Buzz (volume) + Sentimento (tom) de uma query nos últimos `days` dias. */
export async function fetchGdeltBuzz(query: string, days = 30): Promise<GdeltBuzz> {
  const empty: GdeltBuzz = { query, points: [], volAvg: 0, volChangePct: 0, toneAvg: 0, toneNow: 0, toneChange: 0, hasData: false };
  if (!query.trim()) return empty;

  let volMap = new Map<string, number>();
  let toneMap = new Map<string, number>();
  const [volR, toneR] = await Promise.allSettled([
    fetchTimeline(query, "timelinevol", days),
    fetchTimeline(query, "timelinetone", days),
  ]);
  if (volR.status === "fulfilled") volMap = volR.value;
  if (toneR.status === "fulfilled") toneMap = toneR.value;

  const dates = [...new Set([...volMap.keys(), ...toneMap.keys()])].sort();
  if (dates.length === 0) return empty;

  const points: GdeltPoint[] = dates.map(date => ({
    date,
    vol: volMap.get(date) ?? null,
    tone: toneMap.get(date) ?? null,
  }));

  const vols = points.map(p => p.vol).filter((v): v is number => v != null);
  const tones = points.map(p => p.tone).filter((v): v is number => v != null);
  const half = Math.floor(vols.length / 2);
  const volFirst = avg(vols.slice(0, half));
  const volSecond = avg(vols.slice(half));
  const volChangePct = volFirst > 0 ? ((volSecond - volFirst) / volFirst) * 100 : 0;
  const toneAvg = avg(tones);
  const toneNow = avg(tones.slice(-Math.max(1, Math.round(tones.length * 0.2))));

  return {
    query,
    points,
    volAvg: avg(vols),
    volChangePct,
    toneAvg,
    toneNow,
    toneChange: toneNow - toneAvg,
    hasData: vols.length > 0 || tones.length > 0,
  };
}

// ── Pulso GDELT mundial (para a visão do Radar) ───────────────────────────────
import { fetchGdeltEvents, COUNTRY_ISO_NUM, ptCountryName } from "@/lib/globe-conflicts";

export interface GdeltHotspot { iso: string; country: string; countryPT: string; mentions: number }
export interface GdeltWorld {
  tone: number;          // tom global recente
  toneAvg: number;
  toneSeries: { date: string; value: number }[];
  volSeries: { date: string; value: number }[];
  volChangePct: number;
  hotspots: GdeltHotspot[];   // focos de conflito por país (para o mapa + lista)
}

/** Snapshot mundial: tom/volume global + focos de conflito por país. */
export async function fetchGdeltWorld(): Promise<GdeltWorld> {
  const [buzz, events] = await Promise.all([
    // Tom/volume "do mundo" a partir de uma consulta ampla de risco/economia.
    // Parênteses obrigatórios: o GDELT rejeita lista de OR sem eles.
    fetchGdeltBuzz("(conflict OR war OR crisis OR economy OR inflation OR sanctions)", 30).catch(() => null),
    fetchGdeltEvents("conflitos").catch(() => []),
  ]);

  const hotspots: GdeltHotspot[] = events
    .filter(e => e.country && COUNTRY_ISO_NUM[e.country])
    .map(e => ({
      iso: COUNTRY_ISO_NUM[e.country as string],
      country: e.country as string,
      countryPT: ptCountryName(e.country as string),
      mentions: e.events ?? 0,
    }));

  return {
    tone: buzz?.toneNow ?? 0,
    toneAvg: buzz?.toneAvg ?? 0,
    toneSeries: (buzz?.points ?? []).filter(p => p.tone != null).map(p => ({ date: p.date, value: p.tone as number })),
    volSeries: (buzz?.points ?? []).filter(p => p.vol != null).map(p => ({ date: p.date, value: p.vol as number })),
    volChangePct: buzz?.volChangePct ?? 0,
    hotspots,
  };
}

// ── Cor coerente do tom (verde = positivo, vermelho = negativo) ───────────────
export function toneColor(tone: number): string {
  if (tone >= 2) return "#34d399";
  if (tone >= 0.5) return "#a3e635";
  if (tone > -0.5) return "#a1a1aa";
  if (tone > -2) return "#fb923c";
  return "#f87171";
}
export function toneLabel(tone: number): string {
  if (tone >= 2) return "Positivo";
  if (tone >= 0.5) return "Levemente positivo";
  if (tone > -0.5) return "Neutro";
  if (tone > -2) return "Levemente negativo";
  return "Negativo";
}
