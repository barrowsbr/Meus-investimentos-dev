import { NextResponse } from "next/server";
import { fetchQuotes, fetchHistory, type HistoryPoint } from "@/lib/cotacoes";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface CurrencyMeta {
  code: string;
  name: string;
  flag: string;
  region: string;
  lat: number;
  lng: number;
}

interface CurrencyData extends CurrencyMeta {
  rate: number;
  change: number;
  changePct: number;
}

// Universo amplo de moedas. As que não retornarem cotação no Yahoo são
// filtradas automaticamente, então adicionar moedas exóticas é seguro.
const CURRENCIES: CurrencyMeta[] = [
  // ═══ Americas (22) ══════════════════════════════════════════════════════════
  { code: "USD", name: "Dólar Americano",      flag: "🇺🇸", region: "Americas",    lat: 38.9,  lng: -77.0 },
  { code: "BRL", name: "Real Brasileiro",      flag: "🇧🇷", region: "Americas",    lat: -15.8, lng: -47.9 },
  { code: "CAD", name: "Dólar Canadense",      flag: "🇨🇦", region: "Americas",    lat: 45.4,  lng: -75.7 },
  { code: "MXN", name: "Peso Mexicano",        flag: "🇲🇽", region: "Americas",    lat: 19.4,  lng: -99.1 },
  { code: "ARS", name: "Peso Argentino",       flag: "🇦🇷", region: "Americas",    lat: -34.6, lng: -58.4 },
  { code: "CLP", name: "Peso Chileno",         flag: "🇨🇱", region: "Americas",    lat: -33.4, lng: -70.6 },
  { code: "COP", name: "Peso Colombiano",      flag: "🇨🇴", region: "Americas",    lat: 4.7,   lng: -74.1 },
  { code: "PEN", name: "Sol Peruano",          flag: "🇵🇪", region: "Americas",    lat: -12.0, lng: -77.0 },
  { code: "UYU", name: "Peso Uruguaio",        flag: "🇺🇾", region: "Americas",    lat: -34.9, lng: -56.2 },
  { code: "BOB", name: "Boliviano",            flag: "🇧🇴", region: "Americas",    lat: -16.5, lng: -68.1 },
  { code: "PYG", name: "Guarani Paraguaio",    flag: "🇵🇾", region: "Americas",    lat: -25.3, lng: -57.6 },
  { code: "DOP", name: "Peso Dominicano",      flag: "🇩🇴", region: "Americas",    lat: 18.5,  lng: -69.9 },
  { code: "CRC", name: "Colón Costarriquenho", flag: "🇨🇷", region: "Americas",    lat: 9.9,   lng: -84.1 },
  { code: "GTQ", name: "Quetzal Guatemalteco", flag: "🇬🇹", region: "Americas",    lat: 14.6,  lng: -90.5 },
  { code: "HNL", name: "Lempira Hondurenho",   flag: "🇭🇳", region: "Americas",    lat: 14.1,  lng: -87.2 },
  { code: "NIO", name: "Córdoba Nicaraguense", flag: "🇳🇮", region: "Americas",    lat: 12.1,  lng: -86.3 },
  { code: "JMD", name: "Dólar Jamaicano",      flag: "🇯🇲", region: "Americas",    lat: 18.0,  lng: -76.8 },
  { code: "TTD", name: "Dólar de Trinidad",    flag: "🇹🇹", region: "Americas",    lat: 10.7,  lng: -61.5 },
  { code: "HTG", name: "Gourde Haitiano",      flag: "🇭🇹", region: "Americas",    lat: 18.5,  lng: -72.3 },
  { code: "SRD", name: "Dólar Surinamês",      flag: "🇸🇷", region: "Americas",    lat: 5.8,   lng: -55.2 },
  { code: "GYD", name: "Dólar Guianense",      flag: "🇬🇾", region: "Americas",    lat: 6.8,   lng: -58.2 },
  { code: "BZD", name: "Dólar de Belize",      flag: "🇧🇿", region: "Americas",    lat: 17.3,  lng: -88.8 },

  // ═══ Europe (25) ════════════════════════════════════════════════════════════
  { code: "EUR", name: "Euro",                 flag: "🇪🇺", region: "Europe",      lat: 50.1,  lng: 8.7   },
  { code: "GBP", name: "Libra Esterlina",      flag: "🇬🇧", region: "Europe",      lat: 51.5,  lng: -0.1  },
  { code: "CHF", name: "Franco Suíço",         flag: "🇨🇭", region: "Europe",      lat: 46.9,  lng: 7.4   },
  { code: "NOK", name: "Coroa Norueguesa",     flag: "🇳🇴", region: "Europe",      lat: 59.9,  lng: 10.8  },
  { code: "SEK", name: "Coroa Sueca",          flag: "🇸🇪", region: "Europe",      lat: 59.3,  lng: 18.1  },
  { code: "DKK", name: "Coroa Dinamarquesa",   flag: "🇩🇰", region: "Europe",      lat: 55.7,  lng: 12.6  },
  { code: "PLN", name: "Zloty Polonês",        flag: "🇵🇱", region: "Europe",      lat: 52.2,  lng: 21.0  },
  { code: "CZK", name: "Coroa Tcheca",         flag: "🇨🇿", region: "Europe",      lat: 50.1,  lng: 14.4  },
  { code: "HUF", name: "Florim Húngaro",       flag: "🇭🇺", region: "Europe",      lat: 47.5,  lng: 19.0  },
  { code: "RON", name: "Leu Romeno",           flag: "🇷🇴", region: "Europe",      lat: 44.4,  lng: 26.1  },
  { code: "TRY", name: "Lira Turca",           flag: "🇹🇷", region: "Europe",      lat: 39.9,  lng: 32.9  },
  { code: "RUB", name: "Rublo Russo",          flag: "🇷🇺", region: "Europe",      lat: 55.8,  lng: 37.6  },
  { code: "UAH", name: "Hryvnia Ucraniana",    flag: "🇺🇦", region: "Europe",      lat: 50.5,  lng: 30.5  },
  { code: "ISK", name: "Coroa Islandesa",      flag: "🇮🇸", region: "Europe",      lat: 64.1,  lng: -21.9 },
  { code: "BGN", name: "Lev Búlgaro",          flag: "🇧🇬", region: "Europe",      lat: 42.7,  lng: 23.3  },
  { code: "RSD", name: "Dinar Sérvio",         flag: "🇷🇸", region: "Europe",      lat: 44.8,  lng: 20.5  },
  { code: "ALL", name: "Lek Albanês",          flag: "🇦🇱", region: "Europe",      lat: 41.3,  lng: 19.8  },
  { code: "GEL", name: "Lari Georgiano",       flag: "🇬🇪", region: "Europe",      lat: 41.7,  lng: 44.8  },
  { code: "AMD", name: "Dram Armênio",         flag: "🇦🇲", region: "Europe",      lat: 40.2,  lng: 44.5  },
  { code: "AZN", name: "Manat Azeri",          flag: "🇦🇿", region: "Europe",      lat: 40.4,  lng: 49.9  },
  { code: "BYN", name: "Rublo Bielorrusso",    flag: "🇧🇾", region: "Europe",      lat: 53.9,  lng: 27.6  },
  { code: "MDL", name: "Leu Moldavo",          flag: "🇲🇩", region: "Europe",      lat: 47.0,  lng: 28.8  },
  { code: "BAM", name: "Marco Bósnio",         flag: "🇧🇦", region: "Europe",      lat: 43.9,  lng: 18.4  },
  { code: "MKD", name: "Denar Macedônio",      flag: "🇲🇰", region: "Europe",      lat: 42.0,  lng: 21.4  },
  { code: "HRK", name: "Kuna Croata",          flag: "🇭🇷", region: "Europe",      lat: 45.8,  lng: 16.0  },

  // ═══ Asia (25) ══════════════════════════════════════════════════════════════
  { code: "JPY", name: "Iene Japonês",         flag: "🇯🇵", region: "Asia",        lat: 35.7,  lng: 139.7 },
  { code: "CNY", name: "Yuan Chinês",          flag: "🇨🇳", region: "Asia",        lat: 39.9,  lng: 116.4 },
  { code: "INR", name: "Rúpia Indiana",        flag: "🇮🇳", region: "Asia",        lat: 28.6,  lng: 77.2  },
  { code: "KRW", name: "Won Sul-Coreano",      flag: "🇰🇷", region: "Asia",        lat: 37.6,  lng: 127.0 },
  { code: "SGD", name: "Dólar de Singapura",   flag: "🇸🇬", region: "Asia",        lat: 1.3,   lng: 103.8 },
  { code: "HKD", name: "Dólar de Hong Kong",   flag: "🇭🇰", region: "Asia",        lat: 22.3,  lng: 114.2 },
  { code: "TWD", name: "Dólar Taiwanês",       flag: "🇹🇼", region: "Asia",        lat: 25.0,  lng: 121.5 },
  { code: "THB", name: "Baht Tailandês",       flag: "🇹🇭", region: "Asia",        lat: 13.8,  lng: 100.5 },
  { code: "IDR", name: "Rupia Indonésia",      flag: "🇮🇩", region: "Asia",        lat: -6.2,  lng: 106.8 },
  { code: "MYR", name: "Ringgit Malaio",       flag: "🇲🇾", region: "Asia",        lat: 3.1,   lng: 101.7 },
  { code: "PHP", name: "Peso Filipino",        flag: "🇵🇭", region: "Asia",        lat: 14.6,  lng: 121.0 },
  { code: "VND", name: "Dong Vietnamita",      flag: "🇻🇳", region: "Asia",        lat: 21.0,  lng: 105.8 },
  { code: "PKR", name: "Rúpia Paquistanesa",   flag: "🇵🇰", region: "Asia",        lat: 33.7,  lng: 73.0  },
  { code: "BDT", name: "Taka de Bangladesh",   flag: "🇧🇩", region: "Asia",        lat: 23.8,  lng: 90.4  },
  { code: "KZT", name: "Tenge Cazaque",        flag: "🇰🇿", region: "Asia",        lat: 51.2,  lng: 71.4  },
  { code: "LKR", name: "Rúpia do Sri Lanka",   flag: "🇱🇰", region: "Asia",        lat: 6.9,   lng: 79.9  },
  { code: "MNT", name: "Tugrik Mongol",        flag: "🇲🇳", region: "Asia",        lat: 47.9,  lng: 106.9 },
  { code: "NPR", name: "Rúpia Nepalesa",       flag: "🇳🇵", region: "Asia",        lat: 27.7,  lng: 85.3  },
  { code: "MMK", name: "Kyat de Myanmar",      flag: "🇲🇲", region: "Asia",        lat: 16.9,  lng: 96.2  },
  { code: "KHR", name: "Riel Cambojano",       flag: "🇰🇭", region: "Asia",        lat: 11.6,  lng: 104.9 },
  { code: "LAK", name: "Kip Laosiano",         flag: "🇱🇦", region: "Asia",        lat: 17.9,  lng: 102.6 },
  { code: "BND", name: "Dólar de Brunei",      flag: "🇧🇳", region: "Asia",        lat: 4.9,   lng: 114.9 },
  { code: "UZS", name: "Som Uzbeque",          flag: "🇺🇿", region: "Asia",        lat: 41.3,  lng: 69.3  },
  { code: "KGS", name: "Som Quirguiz",         flag: "🇰🇬", region: "Asia",        lat: 42.9,  lng: 74.6  },
  { code: "AFN", name: "Afghani Afegão",       flag: "🇦🇫", region: "Asia",        lat: 34.5,  lng: 69.2  },

  // ═══ Middle East (13) ═══════════════════════════════════════════════════════
  { code: "ILS", name: "Shekel Israelense",    flag: "🇮🇱", region: "Middle East", lat: 31.8,  lng: 35.2  },
  { code: "SAR", name: "Riyal Saudita",        flag: "🇸🇦", region: "Middle East", lat: 24.7,  lng: 46.7  },
  { code: "AED", name: "Dirham dos EAU",       flag: "🇦🇪", region: "Middle East", lat: 25.3,  lng: 55.3  },
  { code: "QAR", name: "Riyal do Catar",       flag: "🇶🇦", region: "Middle East", lat: 25.3,  lng: 51.5  },
  { code: "KWD", name: "Dinar Kuwaitiano",     flag: "🇰🇼", region: "Middle East", lat: 29.4,  lng: 47.9  },
  { code: "BHD", name: "Dinar do Bahrein",     flag: "🇧🇭", region: "Middle East", lat: 26.2,  lng: 50.6  },
  { code: "OMR", name: "Rial de Omã",          flag: "🇴🇲", region: "Middle East", lat: 23.6,  lng: 58.5  },
  { code: "JOD", name: "Dinar Jordaniano",     flag: "🇯🇴", region: "Middle East", lat: 31.9,  lng: 35.9  },
  { code: "IQD", name: "Dinar Iraquiano",      flag: "🇮🇶", region: "Middle East", lat: 33.3,  lng: 44.4  },
  { code: "IRR", name: "Rial Iraniano",        flag: "🇮🇷", region: "Middle East", lat: 35.7,  lng: 51.4  },
  { code: "LBP", name: "Libra Libanesa",       flag: "🇱🇧", region: "Middle East", lat: 33.9,  lng: 35.5  },
  { code: "SYP", name: "Libra Síria",          flag: "🇸🇾", region: "Middle East", lat: 33.5,  lng: 36.3  },
  { code: "YER", name: "Rial Iemenita",        flag: "🇾🇪", region: "Middle East", lat: 15.4,  lng: 44.2  },

  // ═══ Africa (22) ════════════════════════════════════════════════════════════
  { code: "ZAR", name: "Rand Sul-Africano",    flag: "🇿🇦", region: "Africa",      lat: -33.9, lng: 18.4  },
  { code: "NGN", name: "Naira Nigeriana",      flag: "🇳🇬", region: "Africa",      lat: 9.1,   lng: 7.5   },
  { code: "EGP", name: "Libra Egípcia",        flag: "🇪🇬", region: "Africa",      lat: 30.0,  lng: 31.2  },
  { code: "KES", name: "Xelim Queniano",       flag: "🇰🇪", region: "Africa",      lat: -1.3,  lng: 36.8  },
  { code: "MAD", name: "Dirham Marroquino",    flag: "🇲🇦", region: "Africa",      lat: 34.0,  lng: -6.8  },
  { code: "GHS", name: "Cedi Ganês",           flag: "🇬🇭", region: "Africa",      lat: 5.6,   lng: -0.2  },
  { code: "TND", name: "Dinar Tunisiano",      flag: "🇹🇳", region: "Africa",      lat: 36.8,  lng: 10.2  },
  { code: "ETB", name: "Birr Etíope",          flag: "🇪🇹", region: "Africa",      lat: 9.0,   lng: 38.7  },
  { code: "TZS", name: "Xelim Tanzaniano",     flag: "🇹🇿", region: "Africa",      lat: -6.8,  lng: 39.3  },
  { code: "UGX", name: "Xelim Ugandense",      flag: "🇺🇬", region: "Africa",      lat: 0.3,   lng: 32.6  },
  { code: "RWF", name: "Franco Ruandês",       flag: "🇷🇼", region: "Africa",      lat: -1.9,  lng: 30.1  },
  { code: "MZN", name: "Metical Moçambicano",  flag: "🇲🇿", region: "Africa",      lat: -25.9, lng: 32.6  },
  { code: "AOA", name: "Kwanza Angolano",      flag: "🇦🇴", region: "Africa",      lat: -8.8,  lng: 13.2  },
  { code: "BWP", name: "Pula de Botsuana",     flag: "🇧🇼", region: "Africa",      lat: -24.7, lng: 25.9  },
  { code: "MUR", name: "Rúpia Mauriciana",     flag: "🇲🇺", region: "Africa",      lat: -20.2, lng: 57.5  },
  { code: "XOF", name: "Franco CFA (Oeste)",   flag: "🇸🇳", region: "Africa",      lat: 14.7,  lng: -17.5 },
  { code: "XAF", name: "Franco CFA (Central)", flag: "🇨🇲", region: "Africa",      lat: 3.9,   lng: 11.5  },
  { code: "ZMW", name: "Kwacha Zambiano",      flag: "🇿🇲", region: "Africa",      lat: -15.4, lng: 28.3  },
  { code: "DZD", name: "Dinar Argelino",       flag: "🇩🇿", region: "Africa",      lat: 36.8,  lng: 3.0   },
  { code: "LYD", name: "Dinar Líbio",          flag: "🇱🇾", region: "Africa",      lat: 32.9,  lng: 13.2  },
  { code: "NAD", name: "Dólar Namibiano",      flag: "🇳🇦", region: "Africa",      lat: -22.6, lng: 17.1  },
  { code: "CDF", name: "Franco Congolês",      flag: "🇨🇩", region: "Africa",      lat: -4.3,  lng: 15.3  },

  // ═══ Oceania (4) ════════════════════════════════════════════════════════════
  { code: "AUD", name: "Dólar Australiano",    flag: "🇦🇺", region: "Oceania",     lat: -33.9, lng: 151.2 },
  { code: "NZD", name: "Dólar Neozelandês",    flag: "🇳🇿", region: "Oceania",     lat: -41.3, lng: 174.8 },
  { code: "FJD", name: "Dólar Fijiano",        flag: "🇫🇯", region: "Oceania",     lat: -18.1, lng: 178.4 },
  { code: "PGK", name: "Kina Papua-Novaguiné", flag: "🇵🇬", region: "Oceania",     lat: -6.2,  lng: 147.0 },
];

// ── DXY: índice oficial do dólar (cesta de 6 moedas) ────────────────────────────
// Pesos oficiais ICE. EUR domina (~57.6%).
// Como nossas rates já são "unidades por 1 USD" (ex: EUR=X = EUR por USD), a
// fórmula oficial — que inverte EURUSD/GBPUSD — se reduz a expoentes positivos:
//   DXY = C × Π rate_moeda^peso
const DXY_WEIGHTS: { code: string; weight: number }[] = [
  { code: "EUR", weight: 0.576 },
  { code: "JPY", weight: 0.136 },
  { code: "GBP", weight: 0.119 },
  { code: "CAD", weight: 0.091 },
  { code: "SEK", weight: 0.042 },
  { code: "CHF", weight: 0.036 },
];
const DXY_CONST = 50.14348112;

function syntheticDxy(rates: Record<string, number>): number | null {
  let product = DXY_CONST;
  for (const { code, weight } of DXY_WEIGHTS) {
    const r = rates[code];
    if (!r || r <= 0) return null;
    product *= Math.pow(r, weight);
  }
  return product;
}

// ── Helpers de performance histórica ────────────────────────────────────────────

function closeNDaysAgo(history: HistoryPoint[], days: number): number | null {
  if (history.length === 0) return null;
  const target = new Date();
  target.setDate(target.getDate() - days);
  const targetStr = target.toISOString().split("T")[0];
  // history é ascendente; pega o último ponto com data <= alvo
  let chosen: number | null = null;
  for (const p of history) {
    if (p.date <= targetStr) chosen = p.close;
    else break;
  }
  // se o alvo é anterior ao início do histórico, usa o primeiro ponto
  return chosen ?? history[0].close;
}

function closeYtd(history: HistoryPoint[]): number | null {
  if (history.length === 0) return null;
  const year = new Date().getFullYear();
  const jan1 = `${year}-01-01`;
  for (const p of history) {
    if (p.date >= jan1) return p.close;
  }
  return history[0].close;
}

function pct(now: number, then: number | null): number | null {
  if (then == null || then <= 0) return null;
  return ((now / then) - 1) * 100;
}

// ── Veredito: dólar se fortalecendo ou perdendo valor? ──────────────────────────

interface Periods {
  "1S": number | null;
  "1M": number | null;
  "3M": number | null;
  "6M": number | null;
  "1A": number | null;
  YTD: number | null;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function buildVerdict(
  periods: Periods | null,
  dxyDayPct: number,
  breadthUp: number,
  breadthTotal: number
): { label: string; tone: "forte" | "neutro" | "fraco"; score: number; reason: string } {
  // Score -100..100. Positivo = dólar forte/fortalecendo.
  let score = 0;
  let weightSum = 0;
  const contribs: [number | null, number, number][] = [
    // [variação%, escala (% que satura), peso]
    [dxyDayPct, 0.8, 0.10],
    [periods?.["1S"] ?? null, 1.5, 0.15],
    [periods?.["1M"] ?? null, 3, 0.30],
    [periods?.["3M"] ?? null, 5, 0.30],
    [periods?.["6M"] ?? null, 7, 0.15],
  ];
  for (const [val, scale, weight] of contribs) {
    if (val == null) continue;
    score += clamp(val / scale, -1, 1) * 100 * weight;
    weightSum += weight;
  }
  if (weightSum > 0) score = score / weightSum;

  // Amplitude do dia ajusta levemente (quantas moedas o USD venceu)
  if (breadthTotal > 0) {
    const breadthScore = ((breadthUp / breadthTotal) - 0.5) * 2 * 100; // -100..100
    score = score * 0.85 + breadthScore * 0.15;
  }
  score = Math.round(clamp(score, -100, 100));

  let label: string, tone: "forte" | "neutro" | "fraco";
  if (score > 35) { label = "Dólar se fortalecendo globalmente"; tone = "forte"; }
  else if (score > 12) { label = "Dólar levemente mais forte"; tone = "forte"; }
  else if (score >= -12) { label = "Dólar estável / lateral"; tone = "neutro"; }
  else if (score >= -35) { label = "Dólar perdendo valor gradualmente"; tone = "fraco"; }
  else { label = "Dólar enfraquecendo globalmente"; tone = "fraco"; }

  const parts: string[] = [];
  if (periods?.["1M"] != null) {
    parts.push(`${periods["1M"] >= 0 ? "subiu" : "caiu"} ${Math.abs(periods["1M"]).toFixed(1)}% no mês`);
  }
  if (periods?.["3M"] != null) {
    parts.push(`${periods["3M"] >= 0 ? "+" : ""}${periods["3M"].toFixed(1)}% em 3 meses`);
  }
  if (breadthTotal > 0) {
    const usdLost = breadthTotal - breadthUp;
    parts.push(`hoje o USD se valorizou contra ${breadthUp} e recuou contra ${usdLost} de ${breadthTotal} moedas`);
  }
  const reason = `O DXY ${parts.join("; ")}.`;

  return { label, tone, score, reason };
}

export async function GET() {
  try {
    const tickers = CURRENCIES.filter(c => c.code !== "USD").map(c => `${c.code}=X`);

    // Cotações das moedas + DXY em paralelo com o histórico do DXY
    const [{ quotes, source }, dxyQuoteRes, dxyHistory] = await Promise.all([
      fetchQuotes(tickers),
      fetchQuotes(["DX-Y.NYB"]).catch(() => ({ quotes: {} as Record<string, import("@/lib/cotacoes").Quote>, source: "none" })),
      fetchHistory("DX-Y.NYB", "1y", "1d").catch(() => [] as HistoryPoint[]),
    ]);

    const currencies: CurrencyData[] = CURRENCIES.map((c) => {
      if (c.code === "USD") return { ...c, rate: 1, change: 0, changePct: 0 };
      const q = quotes[`${c.code}=X`];
      if (!q || q.price <= 0) return null;
      return { ...c, rate: q.price, change: q.change, changePct: q.changePercent };
    }).filter((c): c is CurrencyData => c !== null);

    if (currencies.length <= 1) {
      return NextResponse.json({ error: "Nenhuma fonte de cotação disponível" }, { status: 502 });
    }

    const usdBrl = quotes["BRL=X"]?.price ?? 5.7;

    // ── DXY ──
    const rateMap: Record<string, number> = {};
    for (const c of currencies) rateMap[c.code] = c.rate;

    const dxyQuote = dxyQuoteRes.quotes["DX-Y.NYB"];
    let dxyValue = dxyQuote?.price ?? null;
    let dxyChange = dxyQuote?.change ?? 0;
    let dxyChangePct = dxyQuote?.changePercent ?? 0;
    let dxySource: "yahoo" | "sintetico" = "yahoo";

    if (!dxyValue || dxyValue <= 0) {
      const synth = syntheticDxy(rateMap);
      if (synth) {
        dxyValue = synth;
        dxySource = "sintetico";
        // variação aproximada do dia: %ΔDXY ≈ Σ peso × %Δrate (sem inversão)
        let dPct = 0;
        for (const { code, weight } of DXY_WEIGHTS) {
          const cc = currencies.find(x => x.code === code);
          if (cc) dPct += cc.changePct * weight;
        }
        dxyChangePct = dPct;
        dxyChange = dxyValue * dPct / 100;
      }
    }

    // ── Períodos a partir do histórico ──
    let periods: Periods | null = null;
    let history: HistoryPoint[] = [];
    if (dxyHistory.length > 5 && dxyValue) {
      history = dxyHistory;
      const now = dxyValue;
      periods = {
        "1S": pct(now, closeNDaysAgo(history, 7)),
        "1M": pct(now, closeNDaysAgo(history, 30)),
        "3M": pct(now, closeNDaysAgo(history, 90)),
        "6M": pct(now, closeNDaysAgo(history, 180)),
        "1A": pct(now, closeNDaysAgo(history, 365)),
        YTD: pct(now, closeYtd(history)),
      };
    }

    // ── Amplitude do dia (breadth): quantas moedas o USD venceu ──
    const nonUsd = currencies.filter(c => c.code !== "USD");
    const breadthUp = nonUsd.filter(c => c.changePct > 0).length; // rate subiu → USD mais forte
    const breadthTotal = nonUsd.length;

    const verdict = buildVerdict(periods, dxyChangePct, breadthUp, breadthTotal);

    return NextResponse.json({
      currencies,
      usdBrl,
      source,
      lastUpdate: new Date().toISOString(),
      dxy: dxyValue ? {
        value: dxyValue,
        change: dxyChange,
        changePct: dxyChangePct,
        source: dxySource,
        periods,
        history: history.map(p => ({ date: p.date, close: p.close })),
      } : null,
      breadth: { up: breadthUp, down: breadthTotal - breadthUp, total: breadthTotal },
      verdict,
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
