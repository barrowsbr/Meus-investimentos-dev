// Constantes compartilhadas do mapa-múndi (Scanner e Scanner 2).
// Fonte única para o choropleth/heatmap geográfico de bolsas.

export const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export interface IndexData {
  symbol: string;
  tvSymbol: string;
  name: string;
  country: string;
  flag: string;
  region: string;
  lat: number;
  lng: number;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

export const REGION_COLORS: Record<string, string> = {
  Americas: "#3b82f6",
  Europe: "#8b5cf6",
  Asia: "#f59e0b",
  "Middle East": "#ef4444",
  Africa: "#10b981",
  Oceania: "#06b6d4",
};

export const COUNTRY_TO_ISO_NUM: Record<string, string> = {
  "EUA": "840", "Brasil": "076", "Canadá": "124", "México": "484", "Argentina": "032",
  "Chile": "152", "Colômbia": "170", "Peru": "604", "Venezuela": "862", "Panamá": "591",
  "Costa Rica": "188", "Rep. Dominicana": "214",
  "Reino Unido": "826", "França": "250", "Alemanha": "276", "Espanha": "724",
  "Itália": "380", "Holanda": "528", "Suíça": "756", "Suécia": "752", "Noruega": "578",
  "Dinamarca": "208", "Finlândia": "246", "Bélgica": "056", "Áustria": "040",
  "Portugal": "620", "Grécia": "300", "Polônia": "616", "Hungria": "348",
  "Tchéquia": "203", "Romênia": "642", "Bulgária": "100", "Croácia": "191",
  "Sérvia": "688", "Eslovênia": "705", "Estônia": "233", "Letônia": "428",
  "Lituânia": "440", "Islândia": "352", "Luxemburgo": "442", "Malta": "470",
  "Bósnia": "070", "Ucrânia": "804", "Rússia": "643", "Turquia": "792",
  "Japão": "392", "China": "156", "Índia": "356", "Coreia do Sul": "410",
  "Austrália": "036", "Hong Kong": "344", "Singapura": "702", "Taiwan": "158",
  "Indonésia": "360", "Tailândia": "764", "Malásia": "458", "Filipinas": "608",
  "Vietnã": "704", "Paquistão": "586", "Bangladesh": "050", "Sri Lanka": "144",
  "Nepal": "524", "Mongólia": "496", "Cazaquistão": "398",
  "Israel": "376", "Arábia Saudita": "682", "Emirados": "784", "Catar": "634",
  "Kuwait": "414", "Bahrein": "048", "Omã": "512", "Jordânia": "400", "Líbano": "422", "Egito": "818",
  "África do Sul": "710", "Nigéria": "566", "Quênia": "404", "Marrocos": "504",
  "Gana": "288", "Costa do Marfim": "384", "Tunísia": "788", "Maurício": "480",
  "Botsuana": "072", "Ruanda": "646", "Tanzânia": "834", "Uganda": "800",
  "Nova Zelândia": "554",
};

// Cor de calor (vermelho → amarelo → verde) para uma variação % no dia (clamp ±4%).
export function heatColor(pct: number): string {
  const clamped = Math.max(-4, Math.min(4, pct));
  const t = (clamped + 4) / 8;
  if (t < 0.5) {
    const r = Math.round(239 + (250 - 239) * (t * 2));
    const g = Math.round(68 + (204 - 68) * (t * 2));
    const b = Math.round(68 + (21 - 68) * (t * 2));
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(250 + (34 - 250) * ((t - 0.5) * 2));
  const g = Math.round(204 + (197 - 204) * ((t - 0.5) * 2));
  const b = Math.round(21 + (94 - 21) * ((t - 0.5) * 2));
  return `rgb(${r},${g},${b})`;
}

// Mapa ISO-numérico → melhor índice (maior |variação|) daquele país.
export function buildCountryHeatMap(indices: IndexData[]): Map<string, { changePct: number; name: string; country: string; flag: string }> {
  const map = new Map<string, { changePct: number; name: string; country: string; flag: string }>();
  for (const idx of indices) {
    if (idx.symbol === "^VIX") continue;
    const iso = COUNTRY_TO_ISO_NUM[idx.country];
    if (!iso) continue;
    const existing = map.get(iso);
    if (!existing || Math.abs(idx.changePct) > Math.abs(existing.changePct)) {
      map.set(iso, { changePct: idx.changePct, name: idx.name, country: idx.country, flag: idx.flag });
    }
  }
  return map;
}
