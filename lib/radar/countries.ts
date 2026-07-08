// ─────────────────────────────────────────────────────────────────────────────
// Catálogo COMPLETO de países do mapa-múndi (world-atlas 110m).
//
// O choropleth identifica cada país por ISO-numérico ("076" = Brasil). Os mapas
// monitorados (`COUNTRY_TO_ISO_NUM`, `COUNTRY_REGION`) cobrem só ~85 praças com
// bolsa/moeda. Este módulo PREENCHE o resto do mundo: dá a TODO país um código
// ISO-2 (→ bandeira emoji), uma região (cor do dossiê) e um nome PT amigável —
// para que QUALQUER país seja clicável e mostre "o que temos sobre ele".
//
// Não recalcula nada do mapa de calor: é só identidade (nome/bandeira/região) +
// o ISO-2 que destrava os indicadores do World Bank para países não monitorados.
// ─────────────────────────────────────────────────────────────────────────────

import { ISO_NUM_TO_COUNTRY, COUNTRY_REGION } from "./geo";

// ISO 3166-1 numérico (zero-paddeado, como o world-atlas) → ISO alpha-2.
export const ISO_NUM_TO_ISO2: Record<string, string> = {
  "004": "AF", "008": "AL", "012": "DZ", "024": "AO", "032": "AR", "036": "AU",
  "040": "AT", "044": "BS", "050": "BD", "051": "AM", "056": "BE", "064": "BT",
  "068": "BO", "070": "BA", "072": "BW", "076": "BR", "084": "BZ", "090": "SB",
  "096": "BN", "100": "BG", "104": "MM", "108": "BI", "112": "BY", "116": "KH",
  "120": "CM", "124": "CA", "140": "CF", "144": "LK", "148": "TD", "152": "CL",
  "156": "CN", "158": "TW", "170": "CO", "178": "CG", "180": "CD", "188": "CR", "191": "HR",
  "192": "CU", "196": "CY", "203": "CZ", "204": "BJ", "208": "DK", "214": "DO",
  "218": "EC", "222": "SV", "226": "GQ", "231": "ET", "232": "ER", "233": "EE",
  "242": "FJ", "246": "FI", "250": "FR", "262": "DJ", "266": "GA", "268": "GE",
  "270": "GM", "275": "PS", "276": "DE", "288": "GH", "300": "GR", "304": "GL",
  "308": "GD", "320": "GT", "324": "GN", "328": "GY", "332": "HT", "340": "HN",
  "344": "HK", "348": "HU", "352": "IS", "356": "IN", "360": "ID", "364": "IR",
  "368": "IQ", "372": "IE", "376": "IL", "380": "IT", "384": "CI", "388": "JM",
  "392": "JP", "398": "KZ", "400": "JO", "404": "KE", "408": "KP", "410": "KR",
  "414": "KW", "417": "KG", "418": "LA", "422": "LB", "426": "LS", "428": "LV",
  "430": "LR", "434": "LY", "440": "LT", "442": "LU", "446": "MO", "450": "MG",
  "454": "MW", "458": "MY", "466": "ML", "470": "MT", "478": "MR", "480": "MU",
  "484": "MX", "496": "MN", "498": "MD", "499": "ME", "504": "MA", "508": "MZ",
  "512": "OM", "516": "NA", "524": "NP", "528": "NL", "540": "NC", "548": "VU",
  "554": "NZ", "558": "NI", "562": "NE", "566": "NG", "578": "NO", "586": "PK",
  "591": "PA", "598": "PG", "600": "PY", "604": "PE", "608": "PH", "616": "PL",
  "620": "PT", "624": "GW", "626": "TL", "630": "PR", "634": "QA", "642": "RO",
  "643": "RU", "646": "RW", "682": "SA", "686": "SN", "688": "RS", "694": "SL",
  "702": "SG", "703": "SK", "704": "VN", "705": "SI", "706": "SO", "710": "ZA",
  "716": "ZW", "724": "ES", "728": "SS", "729": "SD", "732": "EH", "740": "SR",
  "748": "SZ", "752": "SE", "756": "CH", "760": "SY", "762": "TJ", "764": "TH",
  "768": "TG", "780": "TT", "784": "AE", "788": "TN", "792": "TR", "795": "TM",
  "800": "UG", "804": "UA", "807": "MK", "818": "EG", "826": "GB", "834": "TZ",
  "840": "US", "854": "BF", "858": "UY", "860": "UZ", "862": "VE", "882": "WS",
  "887": "YE", "894": "ZM",
};

// Região (mesmas 6 chaves de REGION_COLORS) por ISO-2 — para QUALQUER país, não
// só os monitorados. Montado a partir de grupos legíveis para facilitar revisão.
const REGION_GROUPS: Record<string, string[]> = {
  Americas: ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "VE", "PA", "CR", "DO", "EC", "BO", "PY", "UY", "GT", "HN", "NI", "SV", "CU", "HT", "JM", "TT", "BZ", "GY", "SR", "PR", "GL", "BS"],
  Europe: ["GB", "FR", "DE", "ES", "IT", "NL", "CH", "SE", "NO", "DK", "FI", "BE", "AT", "PT", "GR", "PL", "HU", "CZ", "RO", "BG", "HR", "RS", "SI", "EE", "LV", "LT", "IS", "LU", "MT", "BA", "UA", "RU", "TR", "MK", "ME", "MD", "BY", "SK", "IE", "CY", "AL"],
  Asia: ["JP", "CN", "IN", "KR", "HK", "SG", "TW", "ID", "TH", "MY", "PH", "VN", "PK", "BD", "LK", "NP", "MN", "KZ", "AF", "MM", "KH", "LA", "BT", "BN", "TL", "KG", "TJ", "TM", "UZ", "MO", "KP", "GE", "AM"],
  "Middle East": ["IL", "SA", "AE", "QA", "KW", "BH", "OM", "JO", "LB", "IR", "IQ", "SY", "YE", "PS"],
  Africa: ["ZA", "NG", "KE", "MA", "GH", "CI", "TN", "MU", "BW", "RW", "TZ", "UG", "EG", "DZ", "AO", "ET", "SD", "SS", "LY", "SN", "ML", "NE", "TD", "MR", "MZ", "ZW", "ZM", "NA", "SO", "SL", "LR", "GN", "GW", "GM", "TG", "BJ", "BF", "BI", "CM", "CF", "CG", "CD", "GA", "GQ", "DJ", "ER", "LS", "SZ", "MG", "MW", "EH"],
  Oceania: ["AU", "NZ", "PG", "FJ", "SB", "VU", "NC", "WS"],
};

export const ISO2_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_GROUPS).flatMap(([region, codes]) => codes.map((c) => [c, region])),
);

// Nome PT para países NÃO monitorados (os monitorados já vêm de ISO_NUM_TO_COUNTRY).
// Quando ausente, cai no nome (inglês) que a própria geografia fornece.
export const EXTRA_NAME_PT: Record<string, string> = {
  "004": "Afeganistão", "008": "Albânia", "012": "Argélia", "024": "Angola",
  "044": "Bahamas", "051": "Armênia", "064": "Butão", "068": "Bolívia",
  "084": "Belize", "090": "Ilhas Salomão", "096": "Brunei", "104": "Mianmar",
  "108": "Burundi", "112": "Belarus", "116": "Camboja", "120": "Camarões",
  "140": "Rep. Centro-Africana", "148": "Chade", "178": "Congo", "180": "RD Congo",
  "192": "Cuba", "196": "Chipre", "204": "Benin", "218": "Equador",
  "222": "El Salvador", "226": "Guiné Equatorial", "231": "Etiópia", "232": "Eritreia",
  "242": "Fiji", "262": "Djibouti", "266": "Gabão", "268": "Geórgia",
  "270": "Gâmbia", "275": "Palestina", "304": "Groenlândia", "308": "Granada",
  "320": "Guatemala", "324": "Guiné", "328": "Guiana", "332": "Haiti",
  "340": "Honduras", "364": "Irã", "368": "Iraque", "372": "Irlanda",
  "388": "Jamaica", "408": "Coreia do Norte", "417": "Quirguistão", "418": "Laos",
  "426": "Lesoto", "430": "Libéria", "434": "Líbia", "446": "Macau",
  "450": "Madagascar", "454": "Malawi", "466": "Mali", "478": "Mauritânia",
  "498": "Moldávia", "499": "Montenegro", "508": "Moçambique", "516": "Namíbia",
  "540": "Nova Caledônia", "548": "Vanuatu", "558": "Nicarágua", "562": "Níger",
  "598": "Papua-Nova Guiné", "600": "Paraguai", "624": "Guiné-Bissau", "626": "Timor-Leste",
  "630": "Porto Rico", "686": "Senegal", "694": "Serra Leoa", "703": "Eslováquia",
  "706": "Somália", "716": "Zimbábue", "728": "Sudão do Sul", "729": "Sudão",
  "732": "Saara Ocidental", "740": "Suriname", "748": "Essuatíni", "760": "Síria",
  "762": "Tajiquistão", "768": "Togo", "780": "Trinidad e Tobago", "795": "Turcomenistão",
  "807": "Macedônia do Norte", "854": "Burquina Faso", "858": "Uruguai", "860": "Uzbequistão",
  "882": "Samoa", "887": "Iêmen", "894": "Zâmbia",
};

// ISO-2 → bandeira emoji (Regional Indicator Symbols). "BR" → 🇧🇷.
export function flagEmoji(iso2?: string | null): string {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  const cc = iso2.toUpperCase();
  const c0 = cc.charCodeAt(0) - 65;
  const c1 = cc.charCodeAt(1) - 65;
  if (c0 < 0 || c0 > 25 || c1 < 0 || c1 > 25) return "🏳️";
  return String.fromCodePoint(A + c0, A + c1);
}

export interface CountryMeta {
  name: string;      // nome PT (monitorado/extra) ou fallback informado
  iso2: string;      // ISO alpha-2 ("" se desconhecido)
  flag: string;      // bandeira emoji
  region: string;    // uma das 6 regiões, ou "—"
  monitored: boolean;
}

// Resolve identidade de QUALQUER país do mapa a partir do ISO-numérico.
// `fallbackName` = nome (inglês) que a geografia do mapa fornece, p/ a cauda longa.
export function resolveCountryMeta(isoNum: string, fallbackName?: string): CountryMeta | null {
  const iso2 = ISO_NUM_TO_ISO2[isoNum] ?? "";
  const ptMonitored = ISO_NUM_TO_COUNTRY[isoNum];
  const name = ptMonitored ?? EXTRA_NAME_PT[isoNum] ?? fallbackName ?? "";
  if (!name && !iso2) return null;
  const region = (ptMonitored && COUNTRY_REGION[ptMonitored]) || ISO2_REGION[iso2] || "—";
  return { name, iso2, flag: flagEmoji(iso2), region, monitored: !!ptMonitored };
}
