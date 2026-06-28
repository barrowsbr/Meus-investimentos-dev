// ─────────────────────────────────────────────────────────────────────────────
// Helpers geográficos do Radar.
//
// O mapa (react-simple-maps + world-atlas) identifica cada país por um ISO
// numérico zero-paddeado ("076" = Brasil). `COUNTRY_TO_ISO_NUM` (lib/world-map)
// vai de nome PT → ISO; aqui derivamos o inverso e ligamos país → moeda/região/
// risco para pintar cada lente do mapa com a sensibilidade própria dela.
//
// Cada construtor devolve uma `intensity` em [-1, 1] (vermelho→âmbar→verde) já
// pronta para `intensityColor`, mais um `valueText` legível para o tooltip. A
// sensibilidade (o que conta como "extremo") mora aqui, no domínio de cada lente.
// ─────────────────────────────────────────────────────────────────────────────

import { COUNTRY_TO_ISO_NUM, signedNorm } from "@/lib/world-map";
import { ISO_NUM_TO_ISO2 } from "./countries";
import { adrOriginCountry } from "@/lib/ticker-country";
import type { CurrencyData, ExposureResponse } from "./types";

// ISO numérico → nome PT do país (inverso de COUNTRY_TO_ISO_NUM).
export const ISO_NUM_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_TO_ISO_NUM).map(([country, iso]) => [iso, country]),
);

// ISO-2 (código do motor canônico de país, lib/ticker-country) → nome PT no
// PADRÃO DO RADAR (chave de COUNTRY_TO_ISO_NUM). O dossiê e o Pulso casam a
// exposição por `countryPT === selected.name`/`indices.country`, e esses nomes
// vêm de COUNTRY_TO_ISO_NUM ("EUA", não "Estados Unidos") — então a camada ETF
// traduz o ISO-2 canônico para o nome do Radar antes de pintar/casar.
export const ISO2_TO_RADAR_PT: Record<string, string> = {
  US: "EUA", BR: "Brasil", CA: "Canadá", MX: "México", AR: "Argentina",
  CL: "Chile", CO: "Colômbia", PE: "Peru",
  GB: "Reino Unido", DE: "Alemanha", FR: "França", NL: "Holanda", CH: "Suíça",
  IE: "Irlanda", DK: "Dinamarca", SE: "Suécia", FI: "Finlândia", NO: "Noruega",
  ES: "Espanha", IT: "Itália", PT: "Portugal", BE: "Bélgica", AT: "Áustria",
  PL: "Polônia", GR: "Grécia", CZ: "Tchéquia", HU: "Hungria", TR: "Turquia", RU: "Rússia",
  JP: "Japão", CN: "China", HK: "Hong Kong", KR: "Coreia do Sul", TW: "Taiwan",
  IN: "Índia", SG: "Singapura", ID: "Indonésia", TH: "Tailândia", MY: "Malásia",
  PH: "Filipinas", VN: "Vietnã",
  AU: "Austrália", NZ: "Nova Zelândia",
  IL: "Israel", SA: "Arábia Saudita", AE: "Emirados", QA: "Catar", KW: "Kuwait",
  ZA: "África do Sul", NG: "Nigéria", EG: "Egito",
};

// Nome PT do país → código ISO-4217 da moeda local. Cobre os países com índice
// no Radar; zona do euro mapeia para EUR. Espelha o mapa do handler de país.
export const COUNTRY_CURRENCY: Record<string, string> = {
  "EUA": "USD", "Brasil": "BRL", "Canadá": "CAD", "México": "MXN",
  "Argentina": "ARS", "Chile": "CLP", "Colômbia": "COP", "Peru": "PEN",
  "Venezuela": "VES", "Costa Rica": "CRC", "Rep. Dominicana": "DOP", "Panamá": "PAB",
  "Equador": "USD", "Bolívia": "BOB", "Paraguai": "PYG", "Uruguai": "UYU",
  "Guatemala": "GTQ", "Honduras": "HNL", "Nicarágua": "NIO", "El Salvador": "USD",
  "Cuba": "CUP", "Haiti": "HTG", "Jamaica": "JMD", "Trinidad e Tobago": "TTD",
  "Belize": "BZD", "Guiana": "GYD", "Suriname": "SRD", "Porto Rico": "USD", "Bahamas": "BSD",
  "Europa": "EUR", "Reino Unido": "GBP", "Alemanha": "EUR", "França": "EUR",
  "Espanha": "EUR", "Itália": "EUR", "Suíça": "CHF", "Holanda": "EUR",
  "Suécia": "SEK", "Dinamarca": "DKK", "Finlândia": "EUR", "Noruega": "NOK",
  "Áustria": "EUR", "Bélgica": "EUR", "Portugal": "EUR", "Polônia": "PLN",
  "Turquia": "TRY", "Rússia": "RUB", "Hungria": "HUF", "Tchéquia": "CZK",
  "Romênia": "RON", "Grécia": "EUR", "Islândia": "ISK", "Lituânia": "EUR",
  "Letônia": "EUR", "Estônia": "EUR", "Croácia": "EUR", "Eslovênia": "EUR",
  "Luxemburgo": "EUR", "Malta": "EUR", "Ucrânia": "UAH",
  "Irlanda": "EUR", "Chipre": "EUR", "Eslováquia": "EUR", "Moldávia": "MDL",
  "Montenegro": "EUR", "Macedônia do Norte": "MKD", "Albânia": "ALL", "Belarus": "BYN",
  "Groenlândia": "DKK",
  "Japão": "JPY", "Hong Kong": "HKD", "China": "CNY", "Coreia do Sul": "KRW",
  "Taiwan": "TWD", "Índia": "INR", "Singapura": "SGD", "Indonésia": "IDR",
  "Malásia": "MYR", "Tailândia": "THB", "Vietnã": "VND", "Filipinas": "PHP",
  "Paquistão": "PKR", "Sri Lanka": "LKR", "Bangladesh": "BDT", "Nepal": "NPR",
  "Mongólia": "MNT", "Cazaquistão": "KZT",
  "Afeganistão": "AFN", "Mianmar": "MMK", "Camboja": "KHR", "Laos": "LAK",
  "Coreia do Norte": "KPW", "Quirguistão": "KGS", "Tajiquistão": "TJS",
  "Turcomenistão": "TMT", "Uzbequistão": "UZS", "Geórgia": "GEL", "Armênia": "AMD", "Azerbaijão": "AZN",
  "Butão": "BTN", "Brunei": "BND", "Timor-Leste": "USD", "Macau": "MOP",
  "Israel": "ILS", "Arábia Saudita": "SAR", "Emirados": "AED", "Catar": "QAR",
  "Kuwait": "KWD", "Bahrein": "BHD", "Omã": "OMR", "Jordânia": "JOD", "Líbano": "LBP",
  "Irã": "IRR", "Iraque": "IQD", "Síria": "SYP", "Iêmen": "YER",
  "África do Sul": "ZAR", "Egito": "EGP", "Marrocos": "MAD", "Nigéria": "NGN",
  "Quênia": "KES", "Tunísia": "TND", "Maurício": "MUR", "Botsuana": "BWP",
  "Gana": "GHS", "Tanzânia": "TZS", "Uganda": "UGX", "Costa do Marfim": "XOF",
  "Ruanda": "RWF", "Argélia": "DZD", "Angola": "AOA", "Etiópia": "ETB",
  "Sudão": "SDG", "Sudão do Sul": "SSP", "Líbia": "LYD", "Senegal": "XOF",
  "Mali": "XOF", "Níger": "XOF", "Chade": "XAF", "Mauritânia": "MRU",
  "Moçambique": "MZN", "Zimbábue": "ZWL", "Zâmbia": "ZMW", "Namíbia": "NAD",
  "Somália": "SOS", "Serra Leoa": "SLE", "Libéria": "LRD", "Guiné": "GNF",
  "Guiné-Bissau": "XOF", "Gâmbia": "GMD", "Togo": "XOF", "Benin": "XOF",
  "Burquina Faso": "XOF", "Burundi": "BIF", "Camarões": "XAF",
  "Rep. Centro-Africana": "XAF", "Congo": "XAF", "RD Congo": "CDF",
  "Gabão": "XAF", "Guiné Equatorial": "XAF", "Djibouti": "DJF",
  "Eritreia": "ERN", "Lesoto": "LSL", "Essuatíni": "SZL",
  "Madagascar": "MGA", "Malawi": "MWK",
  "Austrália": "AUD", "Nova Zelândia": "NZD",
  "Papua-Nova Guiné": "PGK", "Fiji": "FJD",
};

// Nome PT do país → região (mesmas chaves de REGION_COLORS). Permite filtrar o
// choropleth por região mesmo nas camadas que não vêm de uma lista com região
// embutida (ex.: risco estrutural).
export const COUNTRY_REGION: Record<string, string> = {
  // Americas
  "EUA": "Americas", "Canadá": "Americas", "México": "Americas", "Brasil": "Americas",
  "Argentina": "Americas", "Chile": "Americas", "Colômbia": "Americas", "Peru": "Americas",
  "Venezuela": "Americas", "Panamá": "Americas", "Costa Rica": "Americas", "Rep. Dominicana": "Americas",
  "Equador": "Americas", "Bolívia": "Americas", "Paraguai": "Americas", "Uruguai": "Americas",
  "Guatemala": "Americas", "Honduras": "Americas", "Nicarágua": "Americas", "El Salvador": "Americas",
  "Cuba": "Americas", "Haiti": "Americas", "Jamaica": "Americas", "Trinidad e Tobago": "Americas",
  "Belize": "Americas", "Guiana": "Americas", "Suriname": "Americas", "Porto Rico": "Americas",
  "Bahamas": "Americas", "Groenlândia": "Americas",
  // Europe
  "Reino Unido": "Europe", "França": "Europe", "Alemanha": "Europe", "Espanha": "Europe",
  "Itália": "Europe", "Holanda": "Europe", "Suíça": "Europe", "Suécia": "Europe",
  "Noruega": "Europe", "Dinamarca": "Europe", "Finlândia": "Europe", "Bélgica": "Europe",
  "Áustria": "Europe", "Portugal": "Europe", "Grécia": "Europe", "Polônia": "Europe",
  "Hungria": "Europe", "Tchéquia": "Europe", "Romênia": "Europe", "Bulgária": "Europe",
  "Croácia": "Europe", "Sérvia": "Europe", "Eslovênia": "Europe", "Estônia": "Europe",
  "Letônia": "Europe", "Lituânia": "Europe", "Islândia": "Europe", "Luxemburgo": "Europe",
  "Malta": "Europe", "Bósnia": "Europe", "Ucrânia": "Europe", "Rússia": "Europe", "Turquia": "Europe",
  "Irlanda": "Europe", "Chipre": "Europe", "Eslováquia": "Europe", "Moldávia": "Europe",
  "Montenegro": "Europe", "Macedônia do Norte": "Europe", "Albânia": "Europe", "Belarus": "Europe",
  // Asia
  "Japão": "Asia", "China": "Asia", "Índia": "Asia", "Coreia do Sul": "Asia",
  "Hong Kong": "Asia", "Singapura": "Asia", "Taiwan": "Asia", "Indonésia": "Asia",
  "Tailândia": "Asia", "Malásia": "Asia", "Filipinas": "Asia", "Vietnã": "Asia",
  "Paquistão": "Asia", "Bangladesh": "Asia", "Sri Lanka": "Asia", "Nepal": "Asia",
  "Mongólia": "Asia", "Cazaquistão": "Asia", "Afeganistão": "Asia", "Mianmar": "Asia",
  "Camboja": "Asia", "Laos": "Asia", "Coreia do Norte": "Asia", "Quirguistão": "Asia",
  "Tajiquistão": "Asia", "Turcomenistão": "Asia", "Uzbequistão": "Asia", "Geórgia": "Asia",
  "Armênia": "Asia", "Azerbaijão": "Asia", "Butão": "Asia", "Brunei": "Asia", "Timor-Leste": "Asia", "Macau": "Asia",
  // Middle East
  "Israel": "Middle East", "Arábia Saudita": "Middle East", "Emirados": "Middle East",
  "Catar": "Middle East", "Kuwait": "Middle East", "Bahrein": "Middle East", "Omã": "Middle East",
  "Jordânia": "Middle East", "Líbano": "Middle East", "Irã": "Middle East", "Iraque": "Middle East",
  "Síria": "Middle East", "Iêmen": "Middle East", "Palestina": "Middle East",
  // Africa
  "África do Sul": "Africa", "Nigéria": "Africa", "Quênia": "Africa", "Marrocos": "Africa",
  "Gana": "Africa", "Costa do Marfim": "Africa", "Tunísia": "Africa", "Maurício": "Africa",
  "Botsuana": "Africa", "Ruanda": "Africa", "Tanzânia": "Africa", "Uganda": "Africa", "Egito": "Africa",
  "Argélia": "Africa", "Angola": "Africa", "Etiópia": "Africa", "Sudão": "Africa",
  "Sudão do Sul": "Africa", "Líbia": "Africa", "Senegal": "Africa", "Mali": "Africa",
  "Níger": "Africa", "Chade": "Africa", "Mauritânia": "Africa", "Moçambique": "Africa",
  "Zimbábue": "Africa", "Zâmbia": "Africa", "Namíbia": "Africa", "Somália": "Africa",
  "Serra Leoa": "Africa", "Libéria": "Africa", "Guiné": "Africa", "Guiné-Bissau": "Africa",
  "Gâmbia": "Africa", "Togo": "Africa", "Benin": "Africa", "Burquina Faso": "Africa",
  "Burundi": "Africa", "Camarões": "Africa", "Rep. Centro-Africana": "Africa",
  "Congo": "Africa", "RD Congo": "Africa", "Gabão": "Africa", "Guiné Equatorial": "Africa",
  "Djibouti": "Africa", "Eritreia": "Africa", "Lesoto": "Africa", "Essuatíni": "Africa",
  "Madagascar": "Africa", "Malawi": "Africa", "Saara Ocidental": "Africa",
  // Oceania
  "Austrália": "Oceania", "Nova Zelândia": "Oceania", "Papua-Nova Guiné": "Oceania",
  "Fiji": "Oceania", "Ilhas Salomão": "Oceania", "Vanuatu": "Oceania",
  "Nova Caledônia": "Oceania", "Samoa": "Oceania",
};

// Risco estrutural base por país (0 = muito seguro · 100 = muito arriscado).
// Composição editorial de risco soberano/político/mercado (rating de crédito,
// estabilidade institucional, profundidade do mercado). É a ÂNCORA da camada de
// risco — a volatilidade do dia só ajusta ao redor dela, então um pregão agitado
// não transforma a Suíça em país de alto risco.
export const COUNTRY_RISK_BASE: Record<string, number> = {
  // Americas
  "EUA": 18, "Canadá": 14, "México": 42, "Brasil": 45, "Argentina": 88, "Chile": 32,
  "Colômbia": 50, "Peru": 48, "Venezuela": 96, "Panamá": 40, "Costa Rica": 42, "Rep. Dominicana": 48,
  "Equador": 58, "Bolívia": 65, "Paraguai": 52, "Uruguai": 28, "Guatemala": 56,
  "Honduras": 62, "Nicarágua": 72, "El Salvador": 58, "Cuba": 88, "Haiti": 94,
  "Jamaica": 52, "Trinidad e Tobago": 44, "Belize": 55, "Guiana": 50, "Suriname": 62,
  "Porto Rico": 22, "Bahamas": 35, "Groenlândia": 18,
  // Europe
  "Reino Unido": 20, "França": 24, "Alemanha": 14, "Espanha": 30, "Itália": 34, "Holanda": 13,
  "Suíça": 8, "Suécia": 12, "Noruega": 9, "Dinamarca": 11, "Finlândia": 14, "Bélgica": 22,
  "Áustria": 16, "Portugal": 30, "Grécia": 45, "Polônia": 32, "Hungria": 42, "Tchéquia": 28,
  "Romênia": 44, "Bulgária": 44, "Croácia": 40, "Sérvia": 55, "Eslovênia": 28, "Estônia": 26,
  "Letônia": 30, "Lituânia": 28, "Islândia": 22, "Luxemburgo": 10, "Malta": 30, "Bósnia": 62,
  "Ucrânia": 90, "Rússia": 85, "Turquia": 68,
  "Irlanda": 16, "Chipre": 34, "Eslováquia": 28, "Moldávia": 62, "Montenegro": 48,
  "Macedônia do Norte": 50, "Albânia": 52, "Belarus": 82,
  // Asia
  "Japão": 18, "China": 50, "Índia": 44, "Coreia do Sul": 26, "Hong Kong": 34, "Singapura": 12,
  "Taiwan": 32, "Indonésia": 46, "Tailândia": 44, "Malásia": 40, "Filipinas": 48, "Vietnã": 50,
  "Paquistão": 80, "Bangladesh": 60, "Sri Lanka": 72, "Nepal": 62, "Mongólia": 60, "Cazaquistão": 52,
  "Afeganistão": 97, "Mianmar": 90, "Camboja": 62, "Laos": 60, "Coreia do Norte": 98,
  "Quirguistão": 60, "Tajiquistão": 68, "Turcomenistão": 72, "Uzbequistão": 58,
  "Geórgia": 46, "Armênia": 52, "Azerbaijão": 55, "Butão": 42, "Brunei": 30, "Timor-Leste": 68, "Macau": 28,
  // Middle East
  "Israel": 38, "Arábia Saudita": 40, "Emirados": 28, "Catar": 28, "Kuwait": 34, "Bahrein": 50,
  "Omã": 44, "Jordânia": 55, "Líbano": 92,
  "Irã": 82, "Iraque": 85, "Síria": 96, "Iêmen": 97, "Palestina": 88,
  // Africa
  "África do Sul": 55, "Nigéria": 70, "Quênia": 62, "Marrocos": 45, "Gana": 66, "Costa do Marfim": 60,
  "Tunísia": 64, "Maurício": 40, "Botsuana": 42, "Ruanda": 58, "Tanzânia": 60, "Uganda": 64, "Egito": 66,
  "Argélia": 58, "Angola": 72, "Etiópia": 74, "Sudão": 92, "Sudão do Sul": 96,
  "Líbia": 90, "Senegal": 52, "Mali": 82, "Níger": 76, "Chade": 84,
  "Mauritânia": 68, "Moçambique": 72, "Zimbábue": 82, "Zâmbia": 66, "Namíbia": 44,
  "Somália": 97, "Serra Leoa": 76, "Libéria": 74, "Guiné": 72, "Guiné-Bissau": 80,
  "Gâmbia": 62, "Togo": 64, "Benin": 56, "Burquina Faso": 82,
  "Burundi": 84, "Camarões": 68, "Rep. Centro-Africana": 94,
  "Congo": 72, "RD Congo": 90, "Gabão": 56, "Guiné Equatorial": 74,
  "Djibouti": 62, "Eritreia": 88, "Lesoto": 60, "Essuatíni": 58,
  "Madagascar": 70, "Malawi": 72, "Saara Ocidental": 78,
  // Oceania
  "Austrália": 14, "Nova Zelândia": 15,
  "Papua-Nova Guiné": 68, "Fiji": 48, "Ilhas Salomão": 65, "Vanuatu": 55,
  "Nova Caledônia": 30, "Samoa": 50,
};

export type RiskLevel = "baixo" | "moderado" | "elevado" | "crítico";

export function riskLevel(score: number): RiskLevel {
  if (score < 30) return "baixo";
  if (score < 50) return "moderado";
  if (score < 70) return "elevado";
  return "crítico";
}

export interface HeatEntry {
  intensity: number;   // [-1, 1] → cor do choropleth (vermelho..verde)
  label: string;       // rótulo curto (nome do índice / código da moeda / "Instabilidade")
  valueText: string;   // valor legível para o tooltip ("+1.2%", "Risco 72 · elevado")
  positive: boolean;   // cor do valor no tooltip (verde/vermelho)
  region?: string;     // para o filtro de região dimar o choropleth
  country: string;
  flag: string;
  adrTickers?: string[]; // tickers que chegaram aqui via ADR (ex: TSM em Taiwan)
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

// Camada MERCADOS: ISO numérico → índice de maior |variação| daquele país.
// range 2.5% + gamma: separa visualmente +1% de +2% sem estourar tudo no extremo.
export function buildMarketHeat(
  indices: { symbol: string; country: string; changePct: number; name: string; flag: string; region?: string }[],
): Map<string, HeatEntry> {
  type Raw = { changePct: number; name: string; flag: string; region?: string };
  const best = new Map<string, Raw>();
  for (const idx of indices) {
    if (idx.symbol === "^VIX") continue;
    const iso = COUNTRY_TO_ISO_NUM[idx.country];
    if (!iso) continue;
    const cur = best.get(iso);
    if (!cur || Math.abs(idx.changePct) > Math.abs(cur.changePct)) {
      best.set(iso, { changePct: idx.changePct, name: idx.name, flag: idx.flag, region: idx.region });
    }
  }
  const map = new Map<string, HeatEntry>();
  for (const [iso, raw] of best) {
    const country = ISO_NUM_TO_COUNTRY[iso] ?? "";
    map.set(iso, {
      intensity: signedNorm(raw.changePct, 2.5, 0.65),
      label: raw.name,
      valueText: fmtPct(raw.changePct),
      positive: raw.changePct >= 0,
      region: raw.region ?? COUNTRY_REGION[country],
      country,
      flag: raw.flag,
    });
  }
  return map;
}

// Camada CÂMBIO: ISO numérico → força da moeda local vs USD.
// A cotação é "1 USD = X local"; logo rate ↑ = moeda local mais fraca. Invertendo
// o sinal, o calor fica intuitivo: verde = moeda local valorizou.
// range 1.0% (variações de câmbio diárias são pequenas) — o país INTEIRO ganha cor,
// não só um ponto no centro.
export function buildCurrencyHeat(currencies: CurrencyData[]): Map<string, HeatEntry> {
  const byCode = new Map<string, CurrencyData>();
  for (const c of currencies) byCode.set(c.code, c);

  const map = new Map<string, HeatEntry>();
  for (const [country, iso] of Object.entries(COUNTRY_TO_ISO_NUM)) {
    const code = COUNTRY_CURRENCY[country];
    if (!code) continue;
    const cur = byCode.get(code);
    if (!cur) continue;
    const localMove = -cur.changePct; // + = moeda local valorizou
    map.set(iso, {
      intensity: signedNorm(localMove, 1.0, 0.6),
      label: cur.code,
      valueText: `${fmtPct(localMove)} vs USD`,
      positive: localMove >= 0,
      region: cur.region ?? COUNTRY_REGION[country],
      country,
      flag: cur.flag,
    });
  }
  return map;
}

// Camada INSTABILIDADE (risco): ÂNCORA no risco estrutural por país (rating
// soberano / estabilidade / profundidade de mercado) e só AJUSTA com o estresse
// vivo do dia — volatilidade do índice, fraqueza cambial e o nível global do VIX.
// Assim a Suíça permanece baixo risco mesmo num pregão agitado, e o mapa fica
// totalmente pintado (todos os países com base de risco), não só os monitorados.
export function buildRiskHeat(
  indices: { symbol: string; country: string; changePct: number; name: string; flag: string }[],
  currencies: CurrencyData[] | null,
): Map<string, HeatEntry> {
  // Volatilidade do dia por país (maior |variação| de índice) — ajuste fino.
  const marketVol = new Map<string, { vol: number; flag: string }>();
  let vixChg = 0;
  for (const idx of indices) {
    if (idx.symbol === "^VIX") { vixChg = idx.changePct; continue; }
    const cur = marketVol.get(idx.country);
    const vol = Math.abs(idx.changePct);
    if (!cur || vol > cur.vol) marketVol.set(idx.country, { vol, flag: idx.flag });
  }

  // Fraqueza cambial vs USD por código (positivo = moeda local enfraqueceu).
  const fxWeak = new Map<string, number>();
  if (currencies) for (const c of currencies) fxWeak.set(c.code, Math.max(0, c.changePct));

  // Prêmio global de risco quando o VIX dispara (até ~+9 pts).
  const vixPremium = Math.min(30, Math.max(0, vixChg)) * 0.3;

  const map = new Map<string, HeatEntry>();
  for (const [country, base] of Object.entries(COUNTRY_RISK_BASE)) {
    const iso = COUNTRY_TO_ISO_NUM[country];
    if (!iso) continue;

    const mv = marketVol.get(country);
    const code = COUNTRY_CURRENCY[country];
    const cw = code ? (fxWeak.get(code) ?? 0) : 0;
    const dynamic = Math.min(40, (mv?.vol ?? 0) * 10 + cw * 6); // estresse do dia (0–40)

    // Base domina (82%); estresse do dia e VIX só nudge ao redor.
    const score = Math.max(0, Math.min(100, base * 0.82 + dynamic * 0.18 + vixPremium));

    // score 0 → +1 (verde/seguro) · 100 → -1 (vermelho/arriscado); gamma espalha o miolo.
    const raw = (50 - score) / 50;
    const intensity = Math.sign(raw) * Math.pow(Math.abs(raw), 0.8);

    map.set(iso, {
      intensity,
      label: "Instabilidade",
      valueText: `Risco ${Math.round(score)} · ${riskLevel(score)}`,
      positive: score < 50,
      region: COUNTRY_REGION[country],
      country,
      flag: mv?.flag ?? "",
    });
  }
  return map;
}

// ISO-2 → ISO numérico (inverso de ISO_NUM_TO_ISO2).
const ISO2_TO_ISO_NUM: Record<string, string> = Object.fromEntries(
  Object.entries(ISO_NUM_TO_ISO2).map(([num, a2]) => [a2, num]),
);

const fmtBRLk = (v: number) =>
  `R$ ${v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0)}`;

// Camada ALOCAÇÃO (exposição DIRETA do portfólio): marca os países onde há
// posição DIRETA (ações/ETFs detidos diretamente), NÃO o look-through de ETFs.
// ADRs são creditados ao país de ORIGEM (TSM → Taiwan), via computeCountryAllocation.
// Escala SEQUENCIAL azul (0→1) — só magnitude de exposição, sem "bom/ruim".
export function buildExposureHeat(exposure: ExposureResponse | null): Map<string, HeatEntry> {
  const map = new Map<string, HeatEntry>();
  if (!exposure || exposure.exposure.length === 0) return map;

  // Só alocação DIRETA: ignora países que só aparecem via look-through de ETF.
  const direct = exposure.exposure.filter((e) => (e.directBRL ?? 0) > 0);
  if (direct.length === 0) return map;

  const totalDirect = direct.reduce((s, e) => s + e.directBRL, 0);
  const maxDirect = Math.max(...direct.map((e) => e.directBRL));
  if (maxDirect <= 0) return map;

  // PISO de visibilidade: todo país com QUALQUER alocação direta recebe no mínimo
  // FLOOR de intensidade (azul distinto do neutro) e cresce até 1 no maior.
  const FLOOR = 0.32;

  for (const entry of direct) {
    const isoNum = ISO2_TO_ISO_NUM[entry.iso2];
    if (!isoNum) continue;
    const country = ISO_NUM_TO_COUNTRY[isoNum] ?? entry.countryPT;
    const region = COUNTRY_REGION[country];
    const pctDirect = totalDirect > 0 ? (entry.directBRL / totalDirect) * 100 : 0;

    // ADRs deste país (negociam nos EUA, origem aqui) — para a observação no tooltip.
    const adrTickers = (entry.tickers ?? []).filter((t) => adrOriginCountry(t) === entry.iso2);

    const norm = Math.sqrt(entry.directBRL / maxDirect);
    const adrNote = adrTickers.length > 0 ? ` · ADR ${adrTickers.join(", ")}` : "";
    map.set(isoNum, {
      intensity: FLOOR + (1 - FLOOR) * norm,
      label: `${pctDirect.toFixed(pctDirect < 1 ? 2 : 1)}% · alocação direta`,
      valueText: `${fmtBRLk(entry.directBRL)}${adrNote}`,
      positive: true,
      region,
      country,
      flag: "",
      adrTickers: adrTickers.length > 0 ? adrTickers : undefined,
    });
  }
  return map;
}

// Movimento da moeda local vs USD (rate invertido). +X% = moeda local valorizou.
export function localFxMove(changePct: number): number {
  return -changePct;
}

// Moeda local de um país, se monitorada.
export function currencyForCountry(country: string, currencies: CurrencyData[]): CurrencyData | null {
  const code = COUNTRY_CURRENCY[country];
  if (!code) return null;
  return currencies.find((c) => c.code === code) ?? null;
}
