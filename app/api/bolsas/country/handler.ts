import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COUNTRY_ISO: Record<string, string> = {
  "EUA": "US", "Brasil": "BR", "Canadá": "CA", "México": "MX",
  "Argentina": "AR", "Chile": "CL", "Colômbia": "CO", "Peru": "PE",
  "Venezuela": "VE", "Costa Rica": "CR", "Rep. Dominicana": "DO", "Panamá": "PA",
  "Europa": "EU", "Reino Unido": "GB", "Alemanha": "DE", "França": "FR",
  "Espanha": "ES", "Itália": "IT", "Suíça": "CH", "Holanda": "NL",
  "Suécia": "SE", "Dinamarca": "DK", "Finlândia": "FI", "Noruega": "NO",
  "Áustria": "AT", "Bélgica": "BE", "Portugal": "PT", "Polônia": "PL",
  "Turquia": "TR", "Rússia": "RU", "Hungria": "HU", "Tchéquia": "CZ",
  "Romênia": "RO", "Grécia": "GR", "Islândia": "IS", "Lituânia": "LT",
  "Letônia": "LV", "Estônia": "EE", "Croácia": "HR", "Eslovênia": "SI",
  "Sérvia": "RS", "Bulgária": "BG", "Bósnia": "BA", "Luxemburgo": "LU",
  "Malta": "MT", "Ucrânia": "UA",
  "Japão": "JP", "Hong Kong": "HK", "China": "CN", "Coreia do Sul": "KR",
  "Taiwan": "TW", "Índia": "IN", "Singapura": "SG", "Indonésia": "ID",
  "Malásia": "MY", "Tailândia": "TH", "Vietnã": "VN", "Filipinas": "PH",
  "Paquistão": "PK", "Sri Lanka": "LK", "Bangladesh": "BD", "Nepal": "NP",
  "Mongólia": "MN", "Cazaquistão": "KZ",
  "Israel": "IL", "Arábia Saudita": "SA", "Emirados": "AE", "Catar": "QA",
  "Kuwait": "KW", "Bahrein": "BH", "Omã": "OM", "Jordânia": "JO", "Líbano": "LB",
  "África do Sul": "ZA", "Egito": "EG", "Marrocos": "MA", "Nigéria": "NG",
  "Quênia": "KE", "Tunísia": "TN", "Maurício": "MU", "Botsuana": "BW",
  "Gana": "GH", "Tanzânia": "TZ", "Uganda": "UG", "Costa do Marfim": "CI",
  "Ruanda": "RW",
  "Austrália": "AU", "Nova Zelândia": "NZ",
};

const TE_SLUG: Record<string, string> = {
  "EUA": "united-states", "Brasil": "brazil", "Canadá": "canada", "México": "mexico",
  "Argentina": "argentina", "Chile": "chile", "Colômbia": "colombia", "Peru": "peru",
  "Venezuela": "venezuela", "Costa Rica": "costa-rica", "Rep. Dominicana": "dominican-republic", "Panamá": "panama",
  "Europa": "euro-area", "Reino Unido": "united-kingdom", "Alemanha": "germany", "França": "france",
  "Espanha": "spain", "Itália": "italy", "Suíça": "switzerland", "Holanda": "netherlands",
  "Suécia": "sweden", "Dinamarca": "denmark", "Finlândia": "finland", "Noruega": "norway",
  "Áustria": "austria", "Bélgica": "belgium", "Portugal": "portugal", "Polônia": "poland",
  "Turquia": "turkey", "Rússia": "russia", "Hungria": "hungary", "Tchéquia": "czech-republic",
  "Romênia": "romania", "Grécia": "greece", "Islândia": "iceland", "Lituânia": "lithuania",
  "Letônia": "latvia", "Estônia": "estonia", "Croácia": "croatia", "Eslovênia": "slovenia",
  "Sérvia": "serbia", "Bulgária": "bulgaria", "Bósnia": "bosnia-and-herzegovina", "Luxemburgo": "luxembourg",
  "Malta": "malta", "Ucrânia": "ukraine",
  "Japão": "japan", "Hong Kong": "hong-kong", "China": "china", "Coreia do Sul": "south-korea",
  "Taiwan": "taiwan", "Índia": "india", "Singapura": "singapore", "Indonésia": "indonesia",
  "Malásia": "malaysia", "Tailândia": "thailand", "Vietnã": "vietnam", "Filipinas": "philippines",
  "Paquistão": "pakistan", "Sri Lanka": "sri-lanka", "Bangladesh": "bangladesh", "Nepal": "nepal",
  "Mongólia": "mongolia", "Cazaquistão": "kazakhstan",
  "Israel": "israel", "Arábia Saudita": "saudi-arabia", "Emirados": "united-arab-emirates", "Catar": "qatar",
  "Kuwait": "kuwait", "Bahrein": "bahrain", "Omã": "oman", "Jordânia": "jordan", "Líbano": "lebanon",
  "África do Sul": "south-africa", "Egito": "egypt", "Marrocos": "morocco", "Nigéria": "nigeria",
  "Quênia": "kenya", "Tunísia": "tunisia", "Maurício": "mauritius", "Botsuana": "botswana",
  "Gana": "ghana", "Tanzânia": "tanzania", "Uganda": "uganda", "Costa do Marfim": "ivory-coast",
  "Ruanda": "rwanda",
  "Austrália": "australia", "Nova Zelândia": "new-zealand",
};

const COUNTRY_CURRENCY: Record<string, string> = {
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
  "Sérvia": "RSD", "Bulgária": "BGN", "Bósnia": "BAM", "Luxemburgo": "EUR",
  "Malta": "EUR", "Ucrânia": "UAH",
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

interface WBIndicator {
  id: string;
  label: string;
  format: "pct" | "usd" | "num" | "ratio";
}

const INDICATORS: WBIndicator[] = [
  { id: "NY.GDP.MKTP.CD",     label: "PIB (USD)",          format: "usd" },
  { id: "NY.GDP.MKTP.KD.ZG",  label: "Cresc. PIB",        format: "pct" },
  { id: "FP.CPI.TOTL.ZG",     label: "Inflação (CPI)",    format: "pct" },
  { id: "FR.INR.DPST",        label: "Taxa de Juros",      format: "pct" },
  { id: "SL.UEM.TOTL.ZS",     label: "Desemprego",         format: "pct" },
  { id: "GC.DOD.TOTL.GD.ZS",  label: "Dívida/PIB",        format: "pct" },
  { id: "BN.CAB.XOKA.GD.ZS",  label: "Conta Corrente/PIB", format: "pct" },
  { id: "SP.POP.TOTL",        label: "População",          format: "num" },
];

async function fetchWBIndicator(iso: string, indicator: string): Promise<{ value: number | null; year: number | null }> {
  const currentYear = new Date().getFullYear();
  const url = `https://api.worldbank.org/v2/country/${iso}/indicator/${indicator}?format=json&date=${currentYear - 5}:${currentYear}&per_page=6&source=2`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return { value: null, year: null };
    const json = await res.json();
    const data = json?.[1];
    if (!Array.isArray(data)) return { value: null, year: null };
    for (const entry of data) {
      if (entry.value != null) {
        return { value: entry.value, year: parseInt(entry.date) };
      }
    }
    return { value: null, year: null };
  } catch {
    return { value: null, year: null };
  }
}

async function fetchExchangeRate(currency: string): Promise<{ vsUSD: number | null; vsBRL: number | null }> {
  if (currency === "USD") return { vsUSD: 1, vsBRL: null };
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/USD`, {
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { vsUSD: null, vsBRL: null };
    const data = await res.json();
    const rates = data.rates ?? {};
    const vsUSD = rates[currency] ?? null;
    const brlRate = rates["BRL"] ?? null;
    const vsBRL = (vsUSD && brlRate) ? vsUSD / brlRate : null;
    return { vsUSD, vsBRL };
  } catch {
    return { vsUSD: null, vsBRL: null };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country") ?? "";

  if (!country) {
    return NextResponse.json({ error: "country param required" }, { status: 400 });
  }

  const iso = COUNTRY_ISO[country];
  const teSlug = TE_SLUG[country];

  if (!iso) {
    return NextResponse.json({
      country,
      teSlug: teSlug ?? null,
      indicators: [],
      error: "ISO code not found for country",
    });
  }

  const currency = COUNTRY_CURRENCY[country] ?? null;

  const [indicatorResults, exchangeRateResult] = await Promise.all([
    Promise.allSettled(
      INDICATORS.map(async (ind) => {
        const { value, year } = await fetchWBIndicator(iso, ind.id);
        return { ...ind, value, year };
      })
    ),
    currency ? fetchExchangeRate(currency) : Promise.resolve({ vsUSD: null, vsBRL: null }),
  ]);

  const indicators = indicatorResults
    .filter((r): r is PromiseFulfilledResult<WBIndicator & { value: number | null; year: number | null }> => r.status === "fulfilled")
    .map(r => r.value)
    .filter(r => r.value != null);

  return NextResponse.json({
    country,
    iso,
    teSlug: teSlug ?? null,
    teUrl: teSlug ? `https://tradingeconomics.com/${teSlug}` : null,
    currency,
    exchangeRate: exchangeRateResult,
    indicators,
  });
}
