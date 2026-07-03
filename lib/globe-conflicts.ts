// ─────────────────────────────────────────────────────────────────────────────
// Zonas de conflito do HoloGlobe — AO VIVO via ACLED (Armed Conflict Location &
// Event Data). Agrega os eventos violentos dos últimos 30 dias por país, ranqueia
// por intensidade (eventos + mortes) e devolve os focos de conflito para o globo.
//
// Antes era uma lista fixa de 6 guerras no código. Agora atualiza sozinho:
// guerra nova que passe do limiar aparece; guerra que esfriou some.
//
// Credenciais: ACLED_API_KEY + ACLED_EMAIL (registro grátis em acleddata.com;
// uso pessoal/não-comercial permitido). Sem credenciais ou com a ACLED fora do
// ar → retorna [] e a rota cai na lista curada (FALLBACK_ZONES).
// ─────────────────────────────────────────────────────────────────────────────

export interface ConflictZoneData {
  id: string;
  name: string;          // nome amigável PT (ex.: "Guerra Rússia–Ucrânia")
  lat: number;
  lng: number;
  nearbyMarkets: string[]; // símbolos de índices próximos (para o card)
  events?: number;         // nº de eventos violentos no período
  fatalities?: number;     // mortes no período
  periodDias?: number;     // janela (30)
  country?: string;        // país ACLED (inglês), para debug
}

// Nome amigável PT para os conflitos mais conhecidos; fallback = "Conflito — <país>".
const COUNTRY_LABEL: Record<string, string> = {
  Ukraine: "Guerra Rússia–Ucrânia",
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

// Nome PT do país (fallback do rótulo). Cobertura parcial — o resto usa o inglês.
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
// Símbolo ausente na lista de mercados apenas não aparece — sem erro.
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

function ptCountry(en: string): string {
  return COUNTRY_PT[en] ?? en;
}
function labelFor(country: string): string {
  return COUNTRY_LABEL[country] ?? `Conflito — ${ptCountry(country)}`;
}
function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Lista curada de reserva (server-side) — usada quando a ACLED não responde.
export const FALLBACK_ZONES: ConflictZoneData[] = [
  { id: "ukraine", name: "Guerra Rússia–Ucrânia", lat: 48.5, lng: 32.0, nearbyMarkets: ["^STOXX50E", "^GDAXI", "^FCHI"] },
  { id: "israel-palestine", name: "Conflito Israel–Palestina", lat: 31.5, lng: 34.8, nearbyMarkets: ["^TA125.TA", "^CASE30"] },
  { id: "sudan", name: "Guerra Civil no Sudão", lat: 15.5, lng: 32.5, nearbyMarkets: ["^CASE30", "^JN0U.JO"] },
  { id: "myanmar", name: "Guerra Civil em Myanmar", lat: 19.8, lng: 96.2, nearbyMarkets: ["^SET.BK", "^STI"] },
  { id: "taiwan-strait", name: "Tensão no Estreito de Taiwan", lat: 24.0, lng: 121.0, nearbyMarkets: ["^TWII", "^HSI", "^N225"] },
  { id: "red-sea", name: "Crise no Mar Vermelho (Houthis)", lat: 14.5, lng: 42.5, nearbyMarkets: ["^CASE30", "^BSESN", "^TA125.TA"] },
];

interface AcledRow {
  country?: string;
  latitude?: string | number;
  longitude?: string | number;
  fatalities?: string | number;
  event_type?: string;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Só estes tipos contam como "conflito armado" (corta protesto pacífico etc.).
const VIOLENT_TYPES = new Set(["Battles", "Explosions/Remote violence", "Violence against civilians"]);

const MIN_EVENTS = 8;    // limiar p/ um país virar "foco de conflito" (30 dias)
const MAX_ZONES = 12;    // no máx. 12 marcadores no globo
const PERIOD_DIAS = 30;

/**
 * Busca e agrega os focos de conflito da ACLED (últimos 30 dias).
 * A construção da query fica ISOLADA aqui — se o formato de acesso da tua conta
 * ACLED for diferente (ex.: token OAuth novo), é só ajustar esta função.
 */
export async function fetchAcledConflicts(): Promise<ConflictZoneData[]> {
  const key = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;
  if (!key || !email) return [];

  const to = new Date();
  const from = new Date(to.getTime() - PERIOD_DIAS * 86400000);

  const params = new URLSearchParams({
    key,
    email,
    event_date: `${ymd(from)}|${ymd(to)}`,
    event_date_where: "BETWEEN",
    fields: "country|latitude|longitude|fatalities|event_type",
    limit: "20000",
  });
  const url = `https://api.acleddata.com/acled/read?${params.toString()}`;

  let rows: AcledRow[] = [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`ACLED HTTP ${res.status}`);
    const json = await res.json();
    if (json?.success === false) throw new Error(`ACLED erro: ${json?.error ?? "desconhecido"}`);
    rows = Array.isArray(json?.data) ? json.data : [];
  } catch (e) {
    console.error("ACLED indisponível:", e);
    return [];
  }

  // Agrega por país (só eventos violentos).
  interface Agg { country: string; events: number; fatalities: number; sumLat: number; sumLng: number }
  const byCountry = new Map<string, Agg>();
  for (const r of rows) {
    const country = String(r.country ?? "").trim();
    if (!country) continue;
    if (r.event_type && !VIOLENT_TYPES.has(String(r.event_type))) continue;
    const lat = toNum(r.latitude);
    const lng = toNum(r.longitude);
    if (lat === 0 && lng === 0) continue;
    const a = byCountry.get(country) ?? { country, events: 0, fatalities: 0, sumLat: 0, sumLng: 0 };
    a.events += 1;
    a.fatalities += toNum(r.fatalities);
    a.sumLat += lat;
    a.sumLng += lng;
    byCountry.set(country, a);
  }

  return [...byCountry.values()]
    .filter(a => a.events >= MIN_EVENTS)
    // Intensidade: eventos + peso nas mortes (guerra letal sobe).
    .sort((a, b) => (b.events + b.fatalities * 0.5) - (a.events + a.fatalities * 0.5))
    .slice(0, MAX_ZONES)
    .map(a => ({
      id: `acled-${slug(a.country)}`,
      name: labelFor(a.country),
      lat: a.sumLat / a.events,
      lng: a.sumLng / a.events,
      nearbyMarkets: COUNTRY_INDICES[a.country] ?? [],
      events: a.events,
      fatalities: Math.round(a.fatalities),
      periodDias: PERIOD_DIAS,
      country: a.country,
    }));
}
