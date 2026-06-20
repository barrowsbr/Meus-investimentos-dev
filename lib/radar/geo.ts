// ─────────────────────────────────────────────────────────────────────────────
// Helpers geográficos do Radar.
//
// O mapa (react-simple-maps + world-atlas) identifica cada país por um ISO
// numérico zero-paddeado ("076" = Brasil). `COUNTRY_TO_ISO_NUM` (lib/world-map)
// vai de nome PT → ISO; aqui derivamos o inverso e ligamos país → moeda para
// pintar a camada de câmbio com a mesma lente do mapa.
// ─────────────────────────────────────────────────────────────────────────────

import { COUNTRY_TO_ISO_NUM } from "@/lib/world-map";
import type { CurrencyData } from "./types";

// ISO numérico → nome PT do país (inverso de COUNTRY_TO_ISO_NUM).
export const ISO_NUM_TO_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_TO_ISO_NUM).map(([country, iso]) => [iso, country]),
);

// Nome PT do país → código ISO-4217 da moeda local. Cobre os países com índice
// no Radar; zona do euro mapeia para EUR. Espelha o mapa do handler de país.
export const COUNTRY_CURRENCY: Record<string, string> = {
  "EUA": "USD", "Brasil": "BRL", "Canadá": "CAD", "México": "MXN",
  "Argentina": "ARS", "Chile": "CLP", "Colômbia": "COP", "Peru": "PEN",
  "Venezuela": "VES", "Costa Rica": "CRC", "Rep. Dominicana": "DOP", "Panamá": "PAB",
  "Europa": "EUR", "Reino Unido": "GBP", "Alemanha": "EUR", "França": "EUR",
  "Espanha": "EUR", "Itália": "EUR", "Suíça": "CHF", "Holanda": "EUR",
  "Suécia": "SEK", "Dinamarca": "DKK", "Finlândia": "EUR", "Noruega": "NOK",
  "Áustria": "EUR", "Bélgica": "EUR", "Portugal": "EUR", "Polônia": "PLN",
  "Turquia": "TRY", "Rússia": "RUB", "Hungria": "HUF", "Tchéquia": "CZK",
  "Romênia": "RON", "Grécia": "EUR", "Islândia": "ISK", "Lituânia": "EUR",
  "Letônia": "EUR", "Estônia": "EUR", "Croácia": "EUR", "Eslovênia": "EUR",
  "Luxemburgo": "EUR", "Malta": "EUR", "Ucrânia": "UAH",
  "Japão": "JPY", "Hong Kong": "HKD", "China": "CNY", "Coreia do Sul": "KRW",
  "Taiwan": "TWD", "Índia": "INR", "Singapura": "SGD", "Indonésia": "IDR",
  "Malásia": "MYR", "Tailândia": "THB", "Vietnã": "VND", "Filipinas": "PHP",
  "Paquistão": "PKR", "Sri Lanka": "LKR", "Bangladesh": "BDT", "Nepal": "NPR",
  "Mongólia": "MNT", "Cazaquistão": "KZT",
  "Israel": "ILS", "Arábia Saudita": "SAR", "Emirados": "AED", "Catar": "QAR",
  "Kuwait": "KWD", "Bahrein": "BHD", "Omã": "OMR", "Jordânia": "JOD", "Líbano": "LBP",
  "África do Sul": "ZAR", "Egito": "EGP", "Marrocos": "MAD", "Nigéria": "NGN",
  "Quênia": "KES", "Tunísia": "TND", "Maurício": "MUR", "Botsuana": "BWP",
  "Gana": "GHS", "Tanzânia": "TZS", "Uganda": "UGX", "Costa do Marfim": "XOF",
  "Ruanda": "RWF",
  "Austrália": "AUD", "Nova Zelândia": "NZD",
};

export interface HeatEntry {
  changePct: number;
  label: string;     // rótulo curto (nome do índice ou código da moeda)
  country: string;
  flag: string;
}

// Camada MERCADOS: ISO numérico → índice de maior |variação| daquele país.
export function buildMarketHeat(indices: { symbol: string; country: string; changePct: number; name: string; flag: string }[]): Map<string, HeatEntry> {
  const map = new Map<string, HeatEntry>();
  for (const idx of indices) {
    if (idx.symbol === "^VIX") continue;
    const iso = COUNTRY_TO_ISO_NUM[idx.country];
    if (!iso) continue;
    const existing = map.get(iso);
    if (!existing || Math.abs(idx.changePct) > Math.abs(existing.changePct)) {
      map.set(iso, { changePct: idx.changePct, label: idx.name, country: idx.country, flag: idx.flag });
    }
  }
  return map;
}

// Camada CÂMBIO: ISO numérico → força da moeda local vs USD.
// A cotação é "1 USD = X local"; logo rate ↑ = moeda local mais fraca. Invertendo
// o sinal, o calor fica intuitivo: verde = moeda local valorizou (Força da moeda).
// Países que compartilham moeda (zona do euro) recebem o mesmo calor.
export function buildCurrencyHeat(currencies: CurrencyData[]): Map<string, HeatEntry> {
  const byCode = new Map<string, CurrencyData>();
  for (const c of currencies) byCode.set(c.code, c);

  const map = new Map<string, HeatEntry>();
  for (const [country, iso] of Object.entries(COUNTRY_TO_ISO_NUM)) {
    const code = COUNTRY_CURRENCY[country];
    if (!code) continue;
    const cur = byCode.get(code);
    if (!cur) continue;
    map.set(iso, { changePct: -cur.changePct, label: cur.code, country, flag: cur.flag });
  }
  return map;
}

// Camada INSTABILIDADE (risco): combina volatilidade dos mercados + fraqueza
// cambial num proxy de risco. Quanto MAIS volátil o mercado e MAIS fraca a moeda,
// maior o risco.  O valor é armazenado como `changePct` NEGATIVO para que
// `heatColor()` pinte vermelho (neg = red, pos = green).
export function buildRiskHeat(
  indices: { symbol: string; country: string; changePct: number; name: string; flag: string }[],
  currencies: CurrencyData[] | null,
): Map<string, HeatEntry> {
  // 1. Índice com maior |variação| por país (proxy de volatilidade de mercado)
  const marketVol = new Map<string, { vol: number; label: string; flag: string }>();
  for (const idx of indices) {
    if (idx.symbol === "^VIX") continue;
    const existing = marketVol.get(idx.country);
    const vol = Math.abs(idx.changePct);
    if (!existing || vol > existing.vol) {
      marketVol.set(idx.country, { vol, label: idx.name, flag: idx.flag });
    }
  }

  // 2. Fraqueza cambial por código ISO-4217 (changePct positivo = moeda enfraqueceu vs USD)
  const fxWeakness = new Map<string, number>();
  if (currencies) {
    for (const c of currencies) {
      // changePct da cotação "1 USD = X local": positivo = local enfraqueceu
      fxWeakness.set(c.code, Math.max(0, c.changePct));
    }
  }

  // 3. Combinar: riskProxy = 0.6 * marketVol + 0.4 * currencyWeakness
  const map = new Map<string, HeatEntry>();
  for (const [country, iso] of Object.entries(COUNTRY_TO_ISO_NUM)) {
    const mv = marketVol.get(country);
    if (!mv) continue; // só pinta países com índice monitorado

    const code = COUNTRY_CURRENCY[country];
    const cw = code ? (fxWeakness.get(code) ?? 0) : 0;

    const riskProxy = mv.vol * 0.6 + cw * 0.4;

    // Negativo para que heatColor() pinte vermelho (alto risco) e verde (baixo risco)
    map.set(iso, {
      changePct: -riskProxy,
      label: `Risco ${riskProxy.toFixed(1)}`,
      country,
      flag: mv.flag,
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
