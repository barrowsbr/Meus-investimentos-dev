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

export async function GET() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 900 },
    });

    if (!res.ok) throw new Error(`API HTTP ${res.status}`);
    const json = await res.json();
    const rates: Record<string, number> = json.rates ?? {};

    let prevRates: Record<string, number> = {};
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split("T")[0];
      const prevRes = await fetch(
        `https://open.er-api.com/v6/historical/${yStr}?base=USD`,
        { next: { revalidate: 3600 } }
      );
      if (prevRes.ok) {
        const prevJson = await prevRes.json();
        prevRates = prevJson.rates ?? {};
      }
    } catch {
      // no historical data — changePct will be 0
    }

    const currencies: CurrencyData[] = CURRENCIES.map((c) => {
      const rate = rates[c.code] ?? 0;
      const prev = prevRates[c.code] ?? rate;
      const change = rate - prev;
      const changePct = prev > 0 ? ((rate / prev) - 1) * 100 : 0;
      return { ...c, rate, change, changePct };
    }).filter((c) => c.rate > 0);

    const usdBrl = rates["BRL"] ?? 5.7;

    return NextResponse.json({
      currencies,
      usdIndex: json.rates?.["DXY"] ?? null,
      usdBrl,
      lastUpdate: json.time_last_update_utc ?? new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
