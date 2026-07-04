// ─────────────────────────────────────────────────────────────────────────────
// Zonas de conflito/protesto do HoloGlobe — AO VIVO via GDELT Events 2.0
// (arquivos de 15 min em data.gdeltproject.org; ver lib/gdelt-events.ts).
// A antiga API GEO 2.0 foi APOSENTADA (404 para qualquer query — provado pela
// sonda /api/debug/gdelt-probe); os eventos brutos são a porta que funciona:
// abertos, sem key, sem rate-limit. Filtramos por código CAMEO, agregamos por
// país (janela ~1h) e ranqueamos por menções → focos.
//
// (ACLED foi descartado antes: e-mail pessoal = tier "Open", sem API.)
//
// Sem rede / GDELT fora do ar → [] e a rota cai na lista curada (FALLBACK_ZONES).
// ─────────────────────────────────────────────────────────────────────────────

import { fetchGdeltEventPoints, type GdeltEventPoint } from "@/lib/gdelt-events";
import { translateBatch } from "@/lib/translate";

export interface ConflictZoneData {
  id: string;
  name: string;            // nome amigável PT (ex.: "Guerra Rússia–Ucrânia")
  lat: number;
  lng: number;
  nearbyMarkets: string[]; // símbolos de índices próximos (para o card)
  events?: number;         // intensidade = menções de conflito no período
  fatalities?: number;     // não disponível no GDELT (fica undefined)
  periodDias?: number;     // janela (7)
  country?: string;        // país (inglês), para debug
  detail?: string;         // rótulo secundário pronto (ex.: "Magnitude 6.2 · sismo")
  source?: string;         // fonte dos dados (ex.: "USGS", "NASA EONET", "GDELT")
  spots?: string[];        // cidades-foco dentro do país (ex.: ["Los Angeles", "Seattle"])
  headlines?: string[];    // manchetes derivadas das notícias que reportaram os eventos
}

// Nome amigável PT para os conflitos mais conhecidos; fallback = "Conflito — <país>".
const COUNTRY_LABEL: Record<string, string> = {
  Ukraine: "Guerra Rússia–Ucrânia",
  Russia: "Guerra Rússia–Ucrânia",
  Palestine: "Conflito Israel–Palestina",
  Israel: "Conflito Israel–Palestina",
  Sudan: "Guerra Civil no Sudão",
  Myanmar: "Guerra Civil em Myanmar",
  Yemen: "Guerra Civil no Iêmen",
  Syria: "Conflito na Síria",
  "Democratic Republic of Congo": "Conflito no Leste da RDC",
  Somalia: "Conflito na Somália (Al-Shabaab)",
  Nigeria: "Insurgência na Nigéria",
  Mali: "Conflito no Sahel (Mali)",
  "Burkina Faso": "Conflito no Sahel (Burkina Faso)",
  Ethiopia: "Conflito na Etiópia",
  Iraq: "Conflito no Iraque",
  Lebanon: "Conflito no Líbano",
  Mexico: "Violência dos cartéis (México)",
  Colombia: "Conflito na Colômbia",
  Pakistan: "Insurgência no Paquistão",
  Afghanistan: "Conflito no Afeganistão",
  Iran: "Tensão no Irã",
};

const COUNTRY_PT: Record<string, string> = {
  Ukraine: "Ucrânia", Russia: "Rússia", Sudan: "Sudão", Myanmar: "Myanmar",
  Yemen: "Iêmen", Syria: "Síria", Somalia: "Somália", Nigeria: "Nigéria",
  Mali: "Mali", "Burkina Faso": "Burkina Faso", Ethiopia: "Etiópia",
  Iraq: "Iraque", Lebanon: "Líbano", Mexico: "México", Colombia: "Colômbia",
  Pakistan: "Paquistão", Afghanistan: "Afeganistão", Iran: "Irã",
  "Democratic Republic of Congo": "Rep. Dem. do Congo", Palestine: "Palestina",
  Israel: "Israel", Niger: "Níger", "South Sudan": "Sudão do Sul",
};

// País → índices próximos (símbolos Yahoo já presentes nas bolsas do globo).
const COUNTRY_INDICES: Record<string, string[]> = {
  Ukraine: ["^STOXX50E", "^GDAXI", "^FCHI"],
  Russia: ["^STOXX50E", "^GDAXI"],
  Palestine: ["^TA125.TA", "^CASE30"],
  Israel: ["^TA125.TA", "^CASE30"],
  Lebanon: ["^TA125.TA", "^CASE30"],
  Syria: ["^TA125.TA", "^CASE30"],
  Iraq: ["^TA125.TA"],
  Iran: ["^TA125.TA"],
  Yemen: ["^CASE30", "^TA125.TA", "^BSESN"],
  Sudan: ["^CASE30", "^JN0U.JO"],
  "South Sudan": ["^CASE30", "^JN0U.JO"],
  Somalia: ["^CASE30", "^JN0U.JO"],
  Ethiopia: ["^CASE30", "^JN0U.JO"],
  "Democratic Republic of Congo": ["^JN0U.JO"],
  Nigeria: ["^JN0U.JO"],
  Mali: ["^JN0U.JO"],
  "Burkina Faso": ["^JN0U.JO"],
  Niger: ["^JN0U.JO"],
  Myanmar: ["^SET.BK", "^STI"],
  Pakistan: ["^BSESN"],
  Afghanistan: ["^BSESN"],
  Mexico: ["^GSPC"],
  Colombia: ["^GSPC", "^BVSP"],
};

// Variações de nome de país que o GDELT usa → forma canônica dos mapas acima.
const COUNTRY_NORMALIZE: Record<string, string> = {
  "Congo (Kinshasa)": "Democratic Republic of Congo",
  "Democratic Republic of the Congo": "Democratic Republic of Congo",
  "DR Congo": "Democratic Republic of Congo",
  "Congo Kinshasa": "Democratic Republic of Congo",
  Burma: "Myanmar",
  "Palestinian Territory": "Palestine",
  "Occupied Palestinian Territory": "Palestine",
  "West Bank": "Palestine",
  "Gaza Strip": "Palestine",
  Gaza: "Palestine",
  "United States of America": "United States",
  "Russian Federation": "Russia",
};

// País (inglês) → ISO numérico 3 dígitos (para o heat do Radar).
export const COUNTRY_ISO_NUM: Record<string, string> = {
  Ukraine: "804", Russia: "643", Sudan: "729", "South Sudan": "728",
  Palestine: "275", Israel: "376", Lebanon: "422", Syria: "760", Iraq: "368",
  Iran: "364", Yemen: "887", Myanmar: "104", Somalia: "706", Ethiopia: "231",
  "Democratic Republic of Congo": "180", Nigeria: "566", Mali: "466",
  "Burkina Faso": "854", Niger: "562", Pakistan: "586", Afghanistan: "004",
  Mexico: "484", Colombia: "170", India: "356", Turkey: "792", Egypt: "818",
};

function ptCountry(en: string): string {
  return COUNTRY_PT[en] ?? en;
}
export const ptCountryName = ptCountry;
function labelFor(country: string): string {
  return COUNTRY_LABEL[country] ?? `Conflito — ${ptCountry(country)}`;
}
function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Extrai o país do nome GDELT ("Cidade, Região, País" → "País"), com normalização.
function extractCountry(name: string): string {
  const parts = name.split(",").map(s => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? name.trim();
  return COUNTRY_NORMALIZE[last] ?? last;
}

// Lista curada de reserva (server-side) — usada quando o GDELT não responde.
export const FALLBACK_ZONES: ConflictZoneData[] = [
  { id: "ukraine", name: "Guerra Rússia–Ucrânia", lat: 48.5, lng: 32.0, nearbyMarkets: ["^STOXX50E", "^GDAXI", "^FCHI"] },
  { id: "israel-palestine", name: "Conflito Israel–Palestina", lat: 31.5, lng: 34.8, nearbyMarkets: ["^TA125.TA", "^CASE30"] },
  { id: "sudan", name: "Guerra Civil no Sudão", lat: 15.5, lng: 32.5, nearbyMarkets: ["^CASE30", "^JN0U.JO"] },
  { id: "myanmar", name: "Guerra Civil em Myanmar", lat: 19.8, lng: 96.2, nearbyMarkets: ["^SET.BK", "^STI"] },
  { id: "taiwan-strait", name: "Tensão no Estreito de Taiwan", lat: 24.0, lng: 121.0, nearbyMarkets: ["^TWII", "^HSI", "^N225"] },
  { id: "red-sea", name: "Crise no Mar Vermelho (Houthis)", lat: 14.5, lng: 42.5, nearbyMarkets: ["^CASE30", "^BSESN", "^TA125.TA"] },
];

// Diagnóstico (para /api/globe/conflicts?debug=1).
export interface ConflictDiag {
  provider: "gdelt";
  httpStatus?: number;
  error?: string;
  featuresReturned?: number;
  countriesAgg?: number;
  zonesReturned: number;
  top?: { country: string; mentions: number }[];
}

const MAX_ZONES = 12;

// Camadas do globo. conflitos/protestos vêm dos eventos GDELT (código CAMEO);
// desastres vem do EONET/USGS (lib/disasters.ts) — rootCodes vazio.
export interface GlobeTheme {
  id: string;
  label: string;
  color: string;
  rootCodes: string[];    // EventRootCodes CAMEO (GDELT Events 2.0)
  minMentions: number;
  useWarLabels: boolean;  // conflitos usam os nomes amigáveis de guerra
  prefix: string;         // prefixo do rótulo p/ os demais temas
}
export const GLOBE_THEMES: Record<string, GlobeTheme> = {
  conflitos: {
    id: "conflitos", label: "Conflitos", color: "#ff4444", minMentions: 10, useWarLabels: true, prefix: "Conflito",
    rootCodes: ["18", "19", "20"], // agressão / combate / violência em massa
  },
  protestos: {
    id: "protestos", label: "Protestos", color: "#f59e0b", minMentions: 10, useWarLabels: false, prefix: "Protestos",
    rootCodes: ["14"], // protesto (CAMEO)
  },
  desastres: {
    id: "desastres", label: "Desastres", color: "#38bdf8", minMentions: 0, useWarLabels: false, prefix: "Alerta",
    rootCodes: [], // não usa GDELT — fonte é EONET/USGS
  },
};
export const DEFAULT_THEME = "conflitos";

function zoneName(country: string, theme: GlobeTheme): string {
  if (theme.useWarLabels) return labelFor(country);
  return `${theme.prefix} — ${ptCountry(country)}`;
}

// Manchete "de graça": o slug da URL da notícia costuma ser o próprio título
// ("/us/la-protests-immigration-raids" → "La protests immigration raids").
// Devolve null quando o slug é lixo (ids, curto demais) — melhor nada que ruído.
// Título e host separados: o título passa pelo tradutor; o host não.
function headlineFromUrl(url: string): { title: string; host: string } | null {
  try {
    const u = new URL(url);
    let seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    seg = seg.replace(/\.(html?|php|aspx?|shtml|cms)$/i, "");
    const words = seg.split(/[-_]+/).filter(w => w.length > 1 && !/^\d+$/.test(w) && !/^\d{4,}/.test(w));
    if (words.length < 3) return null;
    const text = words.join(" ");
    if (text.length < 18) return null;
    const host = u.hostname.replace(/^www\./, "");
    const t = text.charAt(0).toUpperCase() + text.slice(1);
    return { title: t.length > 80 ? t.slice(0, 77) + "…" : t, host };
  } catch {
    return null;
  }
}

/**
 * Busca e agrega focos de um TEMA por país, a partir dos eventos GDELT 2.0
 * (janela ~1h, arquivos de 15 min). Sem autenticação, sem rate-limit.
 */
export async function fetchGdeltEvents(themeId: string = DEFAULT_THEME, diag?: ConflictDiag): Promise<ConflictZoneData[]> {
  const theme = GLOBE_THEMES[themeId] ?? GLOBE_THEMES[DEFAULT_THEME];
  if (theme.rootCodes.length === 0) return []; // desastres: fonte é EONET/USGS

  let points: GdeltEventPoint[] = [];
  try {
    points = await fetchGdeltEventPoints(theme.rootCodes);
  } catch (e) {
    if (diag && !diag.error) diag.error = e instanceof Error ? e.message : "erro no feed de eventos";
    return [];
  }
  if (diag) { diag.httpStatus = 200; diag.featuresReturned = points.length; }

  // Agrega por país; centroide ponderado pelo volume de menções. Guarda também
  // as cidades mais citadas e as melhores URLs (viram o conteúdo do card).
  interface Agg {
    country: string; mentions: number; sumLat: number; sumLng: number; wsum: number;
    cities: Map<string, number>;
    topUrls: { mentions: number; url: string }[];
  }
  const byCountry = new Map<string, Agg>();
  for (const p of points) {
    const country = extractCountry(p.fullName);
    if (!country || country.length < 3) continue;
    const w = p.mentions;
    const a = byCountry.get(country) ?? { country, mentions: 0, sumLat: 0, sumLng: 0, wsum: 0, cities: new Map<string, number>(), topUrls: [] };
    a.mentions += w;
    a.sumLat += p.lat * w;
    a.sumLng += p.lng * w;
    a.wsum += w;
    // Cidade = 1º segmento quando o nome tem "Cidade, Região, País".
    const parts = p.fullName.split(",").map(s => s.trim());
    if (parts.length >= 3 && parts[0] && parts[0] !== country) {
      a.cities.set(parts[0], (a.cities.get(parts[0]) ?? 0) + w);
    }
    if (p.sourceUrl) {
      a.topUrls.push({ mentions: w, url: p.sourceUrl });
      if (a.topUrls.length > 12) {
        a.topUrls.sort((x, y) => y.mentions - x.mentions);
        a.topUrls.length = 8;
      }
    }
    byCountry.set(country, a);
  }

  const ranked = [...byCountry.values()]
    .filter(a => a.mentions >= theme.minMentions && a.wsum > 0)
    .sort((a, b) => b.mentions - a.mentions);

  if (diag) {
    diag.countriesAgg = byCountry.size;
    diag.top = ranked.slice(0, 8).map(a => ({ country: a.country, mentions: a.mentions }));
  }

  const rawHeads: { title: string; host: string }[][] = [];
  const zones: ConflictZoneData[] = ranked.slice(0, MAX_ZONES).map(a => {
    const spots = [...a.cities.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([c]) => c);
    const heads: { title: string; host: string }[] = [];
    for (const { url } of a.topUrls.sort((x, y) => y.mentions - x.mentions)) {
      const h = headlineFromUrl(url);
      if (h && !heads.some(e => e.title.slice(0, 30) === h.title.slice(0, 30))) heads.push(h);
      if (heads.length >= 2) break;
    }
    rawHeads.push(heads);
    return {
      id: `${theme.id}-${slug(a.country)}`,
      name: zoneName(a.country, theme),
      lat: a.sumLat / a.wsum,
      lng: a.sumLng / a.wsum,
      nearbyMarkets: COUNTRY_INDICES[a.country] ?? [],
      events: a.mentions,
      detail: `${a.mentions} menções · última hora`,
      source: "GDELT",
      country: a.country,
      spots: spots.length > 0 ? spots : undefined,
    };
  });

  // Manchetes vêm em inglês (slug da notícia) — passa pelo tradutor do app
  // (lote, cache em memória; falha → mantém o original, nunca quebra).
  const flat = rawHeads.flat();
  if (flat.length > 0) {
    let titles = flat.map(h => h.title);
    try {
      const translated = await translateBatch(titles, "pt");
      titles = titles.map((t, i) => (translated[i] && translated[i].length > 3 ? translated[i] : t));
    } catch { /* mantém originais */ }
    let k = 0;
    zones.forEach((z, i) => {
      const hs = rawHeads[i].map(h => `${titles[k++]} (${h.host})`);
      if (hs.length > 0) z.headlines = hs;
    });
  }

  if (diag) diag.zonesReturned = zones.length;
  return zones;
}

/** Compat: mantém o nome antigo usado pela rota/testes (tema = conflitos). */
export function fetchLiveConflicts(diag?: ConflictDiag): Promise<ConflictZoneData[]> {
  return fetchGdeltEvents(DEFAULT_THEME, diag);
}
