// ─────────────────────────────────────────────────────────────────────────────
// Camada "Desastres" do HoloGlobe — dados REAIS de eventos naturais, não menções
// de notícia. Duas fontes abertas (sem key, SEM rate-limit como o GDELT):
//   • NASA EONET v3 — incêndios, tempestades, vulcões, enchentes, ciclones…
//     https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=N
//   • USGS — terremotos significativos (M4.5+) da última semana (GeoJSON).
//
// Por que trocar o GDELT aqui: o GDELT limita a 1 req/5s e devolve menções de
// texto (imprecisas p/ localizar um desastre). EONET/USGS dão coordenadas exatas
// e severidade — a camada fica de fato distinta das de conflito/protesto (era a
// reclamação: "tá muito igual"). Cada evento vira um ponto individual no globo.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConflictZoneData } from "@/lib/globe-conflicts";

// Só o que aconteceu HOJE ou ONTEM (pedido do dono): janela de 48h.
const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=2&limit=120";
// M4.5+ da semana, filtrado por 48h abaixo (o feed diário só cobre 24h).
const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";

const WINDOW_MS = 48 * 3600_000;
const PERIOD_DIAS = 2;
const MAX_ZONES = 16;

// Categoria EONET → rótulo PT + peso de severidade (p/ ranquear entre si e vs sismos).
interface CatMeta { pt: string; weight: number }
const EONET_CAT: Record<string, CatMeta> = {
  wildfires: { pt: "Incêndio florestal", weight: 5.2 },
  severeStorms: { pt: "Tempestade severa", weight: 6.0 },
  volcanoes: { pt: "Atividade vulcânica", weight: 6.2 },
  floods: { pt: "Enchente", weight: 5.6 },
  landslides: { pt: "Deslizamento", weight: 5.4 },
  drought: { pt: "Seca", weight: 4.8 },
  dustHaze: { pt: "Tempestade de poeira", weight: 4.5 },
  seaLakeIce: { pt: "Gelo marinho", weight: 4.2 },
  snow: { pt: "Nevasca", weight: 4.6 },
  tempExtremes: { pt: "Extremo de temperatura", weight: 4.7 },
  manmade: { pt: "Evento provocado", weight: 4.4 },
  waterColor: { pt: "Alteração da água", weight: 4.0 },
};

// Casamento por TÍTULO (robusto a mudança de id da API — v3 pode usar id numérico
// ou string; o título "Wildfires"/"Severe Storms"… é estável). "Earthquakes" fica
// de fora de propósito: sismos vêm do USGS (mais precisos), evitando duplicar.
const EONET_TITLE_MATCH: { kw: string; meta: CatMeta }[] = [
  { kw: "wildfire", meta: EONET_CAT.wildfires },
  { kw: "storm", meta: EONET_CAT.severeStorms },
  { kw: "cyclone", meta: EONET_CAT.severeStorms },
  { kw: "volcano", meta: EONET_CAT.volcanoes },
  { kw: "flood", meta: EONET_CAT.floods },
  { kw: "landslide", meta: EONET_CAT.landslides },
  { kw: "drought", meta: EONET_CAT.drought },
  { kw: "dust", meta: EONET_CAT.dustHaze },
  { kw: "haze", meta: EONET_CAT.dustHaze },
  { kw: "ice", meta: EONET_CAT.seaLakeIce },
  { kw: "snow", meta: EONET_CAT.snow },
  { kw: "temperature", meta: EONET_CAT.tempExtremes },
  { kw: "water", meta: EONET_CAT.waterColor },
];

function resolveEonetCat(c?: { id?: string | number; title?: string }): CatMeta | null {
  if (!c) return null;
  const key = String(c.id ?? "").trim();
  if (EONET_CAT[key]) return EONET_CAT[key];
  const t = (c.title ?? "").toLowerCase();
  if (/earthquake/.test(t)) return null; // fica com o USGS
  return EONET_TITLE_MATCH.find(m => t.includes(m.kw))?.meta ?? null;
}

interface EonetGeometry { date?: string; type?: string; coordinates?: number[] }
interface EonetEvent {
  id?: string;
  title?: string;
  categories?: { id?: string | number; title?: string }[];
  geometry?: EonetGeometry[];
}
interface UsgsFeature {
  id?: string;
  properties?: { mag?: number; place?: string; time?: number };
  geometry?: { type?: string; coordinates?: number[] };
}

interface Ranked extends ConflictZoneData { score: number }

function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "meus-investimentos (dashboard pessoal)" },
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// EONET: último ponto de cada evento com geometria de ponto.
function fromEonet(events: EonetEvent[]): Ranked[] {
  const out: Ranked[] = [];
  for (const ev of events) {
    const meta = resolveEonetCat(ev.categories?.[0]);
    if (!meta) continue;
    const geos = (ev.geometry ?? []).filter(g => g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2);
    if (geos.length === 0) continue;
    const g = geos[geos.length - 1]; // ponto mais recente
    const lng = Number(g.coordinates![0]);
    const lat = Number(g.coordinates![1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const title = (ev.title ?? meta.pt).trim();
    out.push({
      id: `desastres-eonet-${slug(ev.id ?? title)}`,
      name: title,
      lat, lng,
      nearbyMarkets: [],
      periodDias: PERIOD_DIAS,
      detail: meta.pt,
      source: "NASA EONET",
      score: meta.weight,
    });
  }
  return out;
}

// USGS: terremotos M4.5+ das últimas 48h; severidade = magnitude.
function fromUsgs(features: UsgsFeature[]): Ranked[] {
  const out: Ranked[] = [];
  const cutoff = Date.now() - WINDOW_MS;
  for (const f of features) {
    const mag = Number(f.properties?.mag);
    const time = Number(f.properties?.time);
    const coords = f.geometry?.coordinates;
    if (!Number.isFinite(mag) || !Array.isArray(coords) || coords.length < 2) continue;
    if (Number.isFinite(time) && time < cutoff) continue; // só hoje/ontem
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const place = (f.properties?.place ?? "Terremoto").replace(/^\d+\s*km.*?of\s*/i, "").trim();
    // "hoje"/"ontem" no card — dado que a janela é 48h, o rótulo diz qual dos dois.
    const isToday = Number.isFinite(time) && new Date(time).getUTCDate() === new Date().getUTCDate();
    out.push({
      id: `desastres-usgs-${f.id ?? slug(place)}`,
      name: `Terremoto — ${place}`,
      lat, lng,
      nearbyMarkets: [],
      events: Math.round(mag * 10),
      periodDias: PERIOD_DIAS,
      detail: `Magnitude ${mag.toFixed(1)} · ${isToday ? "hoje" : "ontem"}`,
      source: "USGS",
      score: mag,
    });
  }
  return out;
}

/**
 * Focos de desastres naturais ao vivo (EONET + USGS), ranqueados por severidade.
 * Cada evento é um ponto individual (coordenada real). Sem key, sem rate-limit.
 */
export async function fetchDisasters(): Promise<ConflictZoneData[]> {
  const [eonet, usgs] = await Promise.all([
    fetchJson<{ events?: EonetEvent[] }>(EONET_URL),
    fetchJson<{ features?: UsgsFeature[] }>(USGS_URL),
  ]);

  const ranked: Ranked[] = [
    ...fromEonet(eonet?.events ?? []),
    ...fromUsgs(usgs?.features ?? []),
  ].sort((a, b) => b.score - a.score);

  // Remove o campo interno `score` antes de devolver.
  return ranked.slice(0, MAX_ZONES).map(({ score: _score, ...z }) => z);
}
