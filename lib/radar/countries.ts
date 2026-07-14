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
import { ISO_NUM_TO_ISO2 } from "./iso";

export { ISO_NUM_TO_ISO2 };

// ISO 3166-1 numérico (zero-paddeado, como o world-atlas) → ISO alpha-2.

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
