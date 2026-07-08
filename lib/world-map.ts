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
  // Americas
  "EUA": "840", "Brasil": "076", "Canadá": "124", "México": "484", "Argentina": "032",
  "Chile": "152", "Colômbia": "170", "Peru": "604", "Venezuela": "862", "Panamá": "591",
  "Costa Rica": "188", "Rep. Dominicana": "214", "Equador": "218", "Bolívia": "068",
  "Paraguai": "600", "Uruguai": "858", "Guatemala": "320", "Honduras": "340",
  "Nicarágua": "558", "El Salvador": "222", "Cuba": "192", "Haiti": "332",
  "Jamaica": "388", "Trinidad e Tobago": "780", "Belize": "084", "Guiana": "328",
  "Suriname": "740", "Porto Rico": "630", "Bahamas": "044",
  // Europe
  "Reino Unido": "826", "França": "250", "Alemanha": "276", "Espanha": "724",
  "Itália": "380", "Holanda": "528", "Suíça": "756", "Suécia": "752", "Noruega": "578",
  "Dinamarca": "208", "Finlândia": "246", "Bélgica": "056", "Áustria": "040",
  "Portugal": "620", "Grécia": "300", "Polônia": "616", "Hungria": "348",
  "Tchéquia": "203", "Romênia": "642", "Bulgária": "100", "Croácia": "191",
  "Sérvia": "688", "Eslovênia": "705", "Estônia": "233", "Letônia": "428",
  "Lituânia": "440", "Islândia": "352", "Luxemburgo": "442", "Malta": "470",
  "Bósnia": "070", "Ucrânia": "804", "Rússia": "643", "Turquia": "792",
  "Irlanda": "372", "Chipre": "196", "Eslováquia": "703", "Moldávia": "498",
  "Montenegro": "499", "Macedônia do Norte": "807", "Albânia": "008", "Belarus": "112",
  "Groenlândia": "304",
  // Asia
  "Japão": "392", "China": "156", "Índia": "356", "Coreia do Sul": "410",
  "Austrália": "036", "Hong Kong": "344", "Singapura": "702", "Taiwan": "158",
  "Indonésia": "360", "Tailândia": "764", "Malásia": "458", "Filipinas": "608",
  "Vietnã": "704", "Paquistão": "586", "Bangladesh": "050", "Sri Lanka": "144",
  "Nepal": "524", "Mongólia": "496", "Cazaquistão": "398",
  "Afeganistão": "004", "Mianmar": "104", "Camboja": "116", "Laos": "418",
  "Coreia do Norte": "408", "Quirguistão": "417", "Tajiquistão": "762",
  "Turcomenistão": "795", "Uzbequistão": "860", "Geórgia": "268", "Armênia": "051", "Azerbaijão": "031",
  "Butão": "064", "Brunei": "096", "Timor-Leste": "626", "Macau": "446",
  // Middle East
  "Israel": "376", "Arábia Saudita": "682", "Emirados": "784", "Catar": "634",
  "Kuwait": "414", "Bahrein": "048", "Omã": "512", "Jordânia": "400", "Líbano": "422",
  "Irã": "364", "Iraque": "368", "Síria": "760", "Iêmen": "887", "Palestina": "275",
  // Africa
  "Egito": "818", "África do Sul": "710", "Nigéria": "566", "Quênia": "404", "Marrocos": "504",
  "Gana": "288", "Costa do Marfim": "384", "Tunísia": "788", "Maurício": "480",
  "Botsuana": "072", "Ruanda": "646", "Tanzânia": "834", "Uganda": "800",
  "Argélia": "012", "Angola": "024", "Etiópia": "231", "Sudão": "729",
  "Sudão do Sul": "728", "Líbia": "434", "Senegal": "686", "Mali": "466",
  "Níger": "562", "Chade": "148", "Mauritânia": "478", "Moçambique": "508",
  "Zimbábue": "716", "Zâmbia": "894", "Namíbia": "516", "Somália": "706",
  "Serra Leoa": "694", "Libéria": "430", "Guiné": "324", "Guiné-Bissau": "624",
  "Gâmbia": "270", "Togo": "768", "Benin": "204", "Burquina Faso": "854",
  "Burundi": "108", "Camarões": "120", "Rep. Centro-Africana": "140",
  "Congo": "178", "RD Congo": "180", "Gabão": "266", "Guiné Equatorial": "226",
  "Djibouti": "262", "Eritreia": "232", "Lesoto": "426", "Essuatíni": "748",
  "Madagascar": "450", "Malawi": "454", "Saara Ocidental": "732",
  // Oceania
  "Nova Zelândia": "554", "Papua-Nova Guiné": "598", "Fiji": "242",
  "Ilhas Salomão": "090", "Vanuatu": "548", "Nova Caledônia": "540", "Samoa": "882",
};

// Cor de calor a partir de uma *intensidade* já normalizada em [-1, 1].
//   -1 → vermelho (ruim)   ·   0 → âmbar   ·   +1 → verde (bom)
// As camadas do Radar calculam a intensidade com a sensibilidade própria de
// cada lente (bolsas, câmbio, risco) e só então pedem a cor aqui — assim a
// escala de cor é uma fonte única e a sensibilidade mora no domínio certo.
export function intensityColor(t: number): string {
  const c = Math.max(-1, Math.min(1, t));
  let r: number, g: number, b: number;
  if (c < 0) {
    const k = c + 1; // 0 (vermelho) → 1 (âmbar)
    r = 239 + (250 - 239) * k;
    g = 68 + (204 - 68) * k;
    b = 68 + (21 - 68) * k;
  } else {
    const k = c; // 0 (âmbar) → 1 (verde)
    r = 250 + (34 - 250) * k;
    g = 204 + (197 - 204) * k;
    b = 21 + (94 - 21) * k;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// Normaliza uma variação % para [-1, 1] dado um `range` (o que conta como
// "extremo") e aplica um gamma (<1) para dar mais resolução perto de zero —
// é o que separa visualmente uma alta de 1% de uma de 2%.
export function signedNorm(value: number, range: number, gamma = 0.7): number {
  const n = Math.max(-1, Math.min(1, value / range));
  return Math.sign(n) * Math.pow(Math.abs(n), gamma);
}

// Cor de calor para uma variação % no dia. `range` define a saturação (default
// ±4% para compatibilidade); a resposta é não-linear (gamma) perto de zero.
export function heatColor(pct: number, range = 4): string {
  return intensityColor(signedNorm(pct, range));
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
