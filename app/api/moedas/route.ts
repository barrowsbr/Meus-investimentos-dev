import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface CurrencyData {
  code: string;
  name: string;
  rate: number;
  change: number;
  changePct: number;
  flag: string;
  region: string;
  lat: number;
  lng: number;
}

const CURRENCIES: Omit<CurrencyData, "rate" | "change" | "changePct">[] = [
  { code: "BRL", name: "Real Brasileiro",     flag: "🇧🇷", region: "Americas",    lat: -15.8, lng: -47.9 },
  { code: "EUR", name: "Euro",                flag: "🇪🇺", region: "Europe",      lat: 50.1,  lng: 8.7   },
  { code: "GBP", name: "Libra Esterlina",     flag: "🇬🇧", region: "Europe",      lat: 51.5,  lng: -0.1  },
  { code: "JPY", name: "Iene Japonês",        flag: "🇯🇵", region: "Asia",        lat: 35.7,  lng: 139.7 },
  { code: "CHF", name: "Franco Suíço",        flag: "🇨🇭", region: "Europe",      lat: 46.9,  lng: 7.4   },
  { code: "CAD", name: "Dólar Canadense",     flag: "🇨🇦", region: "Americas",    lat: 45.4,  lng: -75.7 },
  { code: "AUD", name: "Dólar Australiano",   flag: "🇦🇺", region: "Oceania",     lat: -33.9, lng: 151.2 },
  { code: "CNY", name: "Yuan Chinês",         flag: "🇨🇳", region: "Asia",        lat: 39.9,  lng: 116.4 },
  { code: "INR", name: "Rúpia Indiana",       flag: "🇮🇳", region: "Asia",        lat: 28.6,  lng: 77.2  },
  { code: "MXN", name: "Peso Mexicano",       flag: "🇲🇽", region: "Americas",    lat: 19.4,  lng: -99.1 },
  { code: "KRW", name: "Won Sul-Coreano",     flag: "🇰🇷", region: "Asia",        lat: 37.6,  lng: 127.0 },
  { code: "SGD", name: "Dólar de Singapura",  flag: "🇸🇬", region: "Asia",        lat: 1.3,   lng: 103.8 },
  { code: "HKD", name: "Dólar de Hong Kong",  flag: "🇭🇰", region: "Asia",        lat: 22.3,  lng: 114.2 },
  { code: "NOK", name: "Coroa Norueguesa",    flag: "🇳🇴", region: "Europe",      lat: 59.9,  lng: 10.8  },
  { code: "SEK", name: "Coroa Sueca",         flag: "🇸🇪", region: "Europe",      lat: 59.3,  lng: 18.1  },
  { code: "ZAR", name: "Rand Sul-Africano",   flag: "🇿🇦", region: "Africa",      lat: -33.9, lng: 18.4  },
  { code: "TRY", name: "Lira Turca",          flag: "🇹🇷", region: "Europe",      lat: 39.9,  lng: 32.9  },
  { code: "ARS", name: "Peso Argentino",      flag: "🇦🇷", region: "Americas",    lat: -34.6, lng: -58.4 },
  { code: "CLP", name: "Peso Chileno",        flag: "🇨🇱", region: "Americas",    lat: -33.4, lng: -70.6 },
  { code: "COP", name: "Peso Colombiano",     flag: "🇨🇴", region: "Americas",    lat: 4.7,   lng: -74.1 },
  { code: "THB", name: "Baht Tailandês",      flag: "🇹🇭", region: "Asia",        lat: 13.8,  lng: 100.5 },
  { code: "PLN", name: "Zloty Polonês",       flag: "🇵🇱", region: "Europe",      lat: 52.2,  lng: 21.0  },
  { code: "ILS", name: "Shekel Israelense",   flag: "🇮🇱", region: "Middle East", lat: 31.8,  lng: 35.2  },
  { code: "SAR", name: "Riyal Saudita",       flag: "🇸🇦", region: "Middle East", lat: 24.7,  lng: 46.7  },
  { code: "AED", name: "Dirham dos EAU",      flag: "🇦🇪", region: "Middle East", lat: 25.3,  lng: 55.3  },
  { code: "NZD", name: "Dólar Neozelandês",   flag: "🇳🇿", region: "Oceania",     lat: -41.3, lng: 174.8 },
  { code: "TWD", name: "Dólar Taiwanês",      flag: "🇹🇼", region: "Asia",        lat: 25.0,  lng: 121.5 },
  { code: "RUB", name: "Rublo Russo",         flag: "🇷🇺", region: "Europe",      lat: 55.8,  lng: 37.6  },
  { code: "DKK", name: "Coroa Dinamarquesa",  flag: "🇩🇰", region: "Europe",      lat: 55.7,  lng: 12.6  },
  { code: "NGN", name: "Naira Nigeriana",     flag: "🇳🇬", region: "Africa",      lat: 9.1,   lng: 7.5   },
];

type RateInfo = { rate: number; change: number; changePct: number };

async function fetchRatesYahoo(): Promise<Record<string, RateInfo>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const YF: any = (await import("yahoo-finance2")).default;
  const yahooFinance = typeof YF === "function" ? new YF() : YF;

  const codes = CURRENCIES.filter(c => c.code !== "USD").map(c => c.code);
  const tickers = codes.map(c => `${c}=X`);
  const rates: Record<string, RateInfo> = {};

  const batchSize = 8;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(t => yahooFinance.quote(t))
    );
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value) {
        const q = r.value;
        const code = codes[i + j];
        const price = q.regularMarketPrice ?? 0;
        if (price > 0) {
          rates[code] = {
            rate: price,
            change: q.regularMarketChange ?? 0,
            changePct: q.regularMarketChangePercent ?? 0,
          };
        }
      }
    }
  }

  if (Object.keys(rates).length === 0) throw new Error("Yahoo: no FX rates");
  return rates;
}

async function fetchRatesAwesome(): Promise<Record<string, RateInfo>> {
  const supported = ["BRL","EUR","GBP","JPY","CHF","CAD","AUD","CNY","INR","MXN",
    "KRW","SGD","HKD","NOK","SEK","ZAR","TRY","ARS","CLP","COP","THB","PLN",
    "ILS","SAR","AED","NZD","TWD","RUB","DKK","NGN"];
  const pairs = supported.map(c => `USD-${c}`).join(",");
  const res = await fetch(`https://economia.awesomeapi.com.br/last/${pairs}`);
  if (!res.ok) throw new Error(`AwesomeAPI HTTP ${res.status}`);
  const data = await res.json();

  const rates: Record<string, RateInfo> = {};
  for (const code of supported) {
    const entry = data[`USD${code}`];
    if (entry) {
      const rate = parseFloat(entry.bid) || 0;
      if (rate > 0) {
        rates[code] = {
          rate,
          change: parseFloat(entry.varBid) || 0,
          changePct: parseFloat(entry.pctChange) || 0,
        };
      }
    }
  }

  if (Object.keys(rates).length === 0) throw new Error("AwesomeAPI: no rates");
  return rates;
}

async function fetchRatesOpenER(): Promise<Record<string, RateInfo>> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`ExchangeRate-API HTTP ${res.status}`);
  const json = await res.json();
  const rawRates: Record<string, number> = json.rates ?? {};

  const rates: Record<string, RateInfo> = {};
  for (const c of CURRENCIES) {
    if (c.code === "USD") continue;
    const rate = rawRates[c.code];
    if (rate && rate > 0) {
      rates[c.code] = { rate, change: 0, changePct: 0 };
    }
  }

  if (Object.keys(rates).length === 0) throw new Error("ExchangeRate-API: no rates");
  return rates;
}

export async function GET() {
  try {
    const sources: [string, () => Promise<Record<string, RateInfo>>][] = [
      ["yahoo", fetchRatesYahoo],
      ["awesomeapi", fetchRatesAwesome],
      ["exchangerate-api", fetchRatesOpenER],
    ];

    let rates: Record<string, RateInfo> = {};
    let source = "none";

    for (const [name, fn] of sources) {
      try {
        rates = await fn();
        source = name;
        break;
      } catch {
        // try next source
      }
    }

    if (Object.keys(rates).length === 0) {
      return NextResponse.json({ error: "Nenhuma fonte de cotação disponível" }, { status: 502 });
    }

    const currencies: CurrencyData[] = CURRENCIES.map((c) => {
      if (c.code === "USD") {
        return { ...c, rate: 1, change: 0, changePct: 0 };
      }
      const info = rates[c.code];
      if (!info) return null;
      return { ...c, rate: info.rate, change: info.change, changePct: info.changePct };
    }).filter((c): c is CurrencyData => c !== null);

    const usdBrl = rates["BRL"]?.rate ?? 5.7;

    return NextResponse.json({
      currencies,
      usdBrl,
      source,
      lastUpdate: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
