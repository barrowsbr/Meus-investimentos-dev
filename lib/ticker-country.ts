/**
 * ticker-country.ts
 * =================
 * Resolves geographic allocation for ETF + direct positions.
 *
 * Strategy (for ETFs):
 *   1. FMP /etf-country-weightings/ — one call per ETF, returns 40+ countries
 *   2. Single-country ETF overrides (SPY → 100% US)
 *   3. Fallback: infer from individual holdings via exchange suffix + ADR map
 *
 * Strategy (for direct stocks):
 *   1. Exchange suffix inference (.SA → BR, .L → GB, .T → JP, etc.)
 *   2. ADR/known ticker map (BABA → CN, TSM → TW, etc.)
 *   3. Sector-based default (Ações Brasil → BR, ETF USA → US)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CountryInfo {
  code: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export interface CountryAllocation {
  country: CountryInfo;
  value_brl: number;
  pct: number;
  tickers: string[];
}

// ── Country database ─────────────────────────────────────────────────────────

const COUNTRIES: Record<string, CountryInfo> = {
  US: { code: "US", name: "Estados Unidos", lat: 39.8, lng: -98.5, region: "Americas" },
  BR: { code: "BR", name: "Brasil", lat: -14.2, lng: -51.9, region: "Americas" },
  CA: { code: "CA", name: "Canadá", lat: 56.1, lng: -106.3, region: "Americas" },
  MX: { code: "MX", name: "México", lat: 23.6, lng: -102.6, region: "Americas" },
  AR: { code: "AR", name: "Argentina", lat: -38.4, lng: -63.6, region: "Americas" },
  CL: { code: "CL", name: "Chile", lat: -35.7, lng: -71.5, region: "Americas" },
  CO: { code: "CO", name: "Colômbia", lat: 4.6, lng: -74.1, region: "Americas" },
  PE: { code: "PE", name: "Peru", lat: -9.2, lng: -75.0, region: "Americas" },
  GB: { code: "GB", name: "Reino Unido", lat: 55.4, lng: -3.4, region: "Europe" },
  DE: { code: "DE", name: "Alemanha", lat: 51.2, lng: 10.4, region: "Europe" },
  FR: { code: "FR", name: "França", lat: 46.2, lng: 2.2, region: "Europe" },
  NL: { code: "NL", name: "Holanda", lat: 52.1, lng: 5.3, region: "Europe" },
  CH: { code: "CH", name: "Suíça", lat: 46.8, lng: 8.2, region: "Europe" },
  IE: { code: "IE", name: "Irlanda", lat: 53.1, lng: -8.2, region: "Europe" },
  DK: { code: "DK", name: "Dinamarca", lat: 56.3, lng: 9.5, region: "Europe" },
  SE: { code: "SE", name: "Suécia", lat: 60.1, lng: 18.6, region: "Europe" },
  FI: { code: "FI", name: "Finlândia", lat: 61.9, lng: 25.7, region: "Europe" },
  NO: { code: "NO", name: "Noruega", lat: 60.5, lng: 8.5, region: "Europe" },
  ES: { code: "ES", name: "Espanha", lat: 40.5, lng: -3.7, region: "Europe" },
  IT: { code: "IT", name: "Itália", lat: 41.9, lng: 12.6, region: "Europe" },
  PT: { code: "PT", name: "Portugal", lat: 39.4, lng: -8.2, region: "Europe" },
  BE: { code: "BE", name: "Bélgica", lat: 50.8, lng: 4.5, region: "Europe" },
  AT: { code: "AT", name: "Áustria", lat: 47.5, lng: 14.6, region: "Europe" },
  PL: { code: "PL", name: "Polônia", lat: 51.9, lng: 19.1, region: "Europe" },
  GR: { code: "GR", name: "Grécia", lat: 39.1, lng: 21.8, region: "Europe" },
  CZ: { code: "CZ", name: "República Tcheca", lat: 49.8, lng: 15.5, region: "Europe" },
  HU: { code: "HU", name: "Hungria", lat: 47.2, lng: 19.5, region: "Europe" },
  JP: { code: "JP", name: "Japão", lat: 36.2, lng: 138.3, region: "Asia" },
  CN: { code: "CN", name: "China", lat: 35.9, lng: 104.2, region: "Asia" },
  HK: { code: "HK", name: "Hong Kong", lat: 22.4, lng: 114.1, region: "Asia" },
  KR: { code: "KR", name: "Coreia do Sul", lat: 35.9, lng: 127.8, region: "Asia" },
  TW: { code: "TW", name: "Taiwan", lat: 23.7, lng: 121.0, region: "Asia" },
  IN: { code: "IN", name: "Índia", lat: 20.6, lng: 79.0, region: "Asia" },
  SG: { code: "SG", name: "Singapura", lat: 1.4, lng: 103.8, region: "Asia" },
  ID: { code: "ID", name: "Indonésia", lat: -0.8, lng: 113.9, region: "Asia" },
  TH: { code: "TH", name: "Tailândia", lat: 15.9, lng: 100.9, region: "Asia" },
  MY: { code: "MY", name: "Malásia", lat: 4.2, lng: 101.9, region: "Asia" },
  PH: { code: "PH", name: "Filipinas", lat: 12.9, lng: 121.8, region: "Asia" },
  VN: { code: "VN", name: "Vietnã", lat: 14.1, lng: 108.3, region: "Asia" },
  AU: { code: "AU", name: "Austrália", lat: -25.3, lng: 133.8, region: "Oceania" },
  NZ: { code: "NZ", name: "Nova Zelândia", lat: -40.9, lng: 174.9, region: "Oceania" },
  IL: { code: "IL", name: "Israel", lat: 31.0, lng: 34.9, region: "Middle East" },
  SA: { code: "SA", name: "Arábia Saudita", lat: 23.9, lng: 45.1, region: "Middle East" },
  AE: { code: "AE", name: "Emirados Árabes", lat: 23.4, lng: 53.8, region: "Middle East" },
  QA: { code: "QA", name: "Catar", lat: 25.4, lng: 51.2, region: "Middle East" },
  KW: { code: "KW", name: "Kuwait", lat: 29.3, lng: 47.5, region: "Middle East" },
  ZA: { code: "ZA", name: "África do Sul", lat: -30.6, lng: 22.9, region: "Africa" },
  NG: { code: "NG", name: "Nigéria", lat: 9.1, lng: 8.7, region: "Africa" },
  EG: { code: "EG", name: "Egito", lat: 26.8, lng: 30.8, region: "Africa" },
  TR: { code: "TR", name: "Turquia", lat: 38.9, lng: 35.2, region: "Europe" },
  RU: { code: "RU", name: "Rússia", lat: 61.5, lng: 105.3, region: "Europe" },
};

// ── Exchange suffix → country ────────────────────────────────────────────────

const EXCHANGE_SUFFIX: Record<string, string> = {
  ".SA": "BR", ".L": "GB", ".T": "JP", ".DE": "DE", ".PA": "FR",
  ".SW": "CH", ".AS": "NL", ".CO": "DK", ".ST": "SE", ".HE": "FI",
  ".MC": "ES", ".MI": "IT", ".LS": "PT", ".BR": "BE", ".VI": "AT",
  ".WA": "PL", ".AT": "GR", ".PR": "CZ", ".BU": "HU",
  ".HK": "HK", ".KS": "KR", ".KQ": "KR", ".TW": "TW", ".BO": "IN",
  ".NS": "IN", ".SI": "SG", ".JK": "ID", ".BK": "TH", ".KL": "MY",
  ".AX": "AU", ".NZ": "NZ", ".TA": "IL", ".SR": "SA",
  ".TO": "CA", ".V": "CA", ".MX": "MX",
  ".AQ": "AR", ".SN": "CL",
};

// ── ADR / US-listed foreign companies ────────────────────────────────────────

const ADR_COUNTRY: Record<string, string> = {
  // China
  BABA: "CN", PDD: "CN", JD: "CN", BIDU: "CN", NIO: "CN", LI: "CN",
  XPEV: "CN", TCEHY: "CN", BILI: "CN", TME: "CN", VNET: "CN", ZTO: "CN",
  YUMC: "CN", TAL: "CN", FUTU: "CN", TIGR: "CN", IQ: "CN",
  // Taiwan
  TSM: "TW", UMC: "TW", ASX: "TW",
  // Japan
  TM: "JP", SONY: "JP", NTDOY: "JP", MUFG: "JP", SMFG: "JP", MFG: "JP",
  KEYCY: "JP",
  // Korea
  PKX: "KR",
  // India
  INFY: "IN", WIT: "IN", HDB: "IN", IBN: "IN", SIFY: "IN",
  // UK
  SHEL: "GB", BP: "GB", AZN: "GB", GSK: "GB", RIO: "GB", UL: "GB",
  HSBC: "GB", LIN: "GB", DEO: "GB", BTI: "GB", RELX: "GB", ARM: "GB",
  // Netherlands
  ASML: "NL", ING: "NL", QGEN: "NL",
  // Switzerland
  NVS: "CH", RHHBY: "CH", ABB: "CH", UBS: "CH",
  // Denmark
  NVO: "DK", NOVO: "DK",
  // France
  EADSY: "FR", LRLCY: "FR",
  // Germany
  SAP: "DE", SIEGY: "DE", DTEGY: "DE",
  // Sweden
  SPOT: "SE", ERIC: "SE",
  // Ireland
  LSCC: "IE", CRH: "IE", APTV: "IE", JHX: "IE",
  // Australia
  BHP: "AU",
  // Israel
  NICE: "IL", CYBR: "IL", MNDY: "IL", TEVA: "IL", WIX: "IL", FVRR: "IL",
  // Argentina
  MELI: "AR", GLOB: "AR", YPF: "AR", GGAL: "AR", DESP: "AR",
  // Mexico
  AMX: "MX",
  // Canada (sometimes no suffix)
  SHOP: "CA", TD: "CA", RY: "CA", ENB: "CA", CNI: "CA", CP: "CA",
  LULU: "CA", BN: "CA",
  // South Africa
  GFI: "ZA", AU: "ZA", HMY: "ZA",
  // Brazil ADRs
  PBR: "BR", VALE: "BR", ITUB: "BR", BBD: "BR", SBS: "BR", ABEV: "BR",
  BRBR: "BR", ERJ: "BR", TIMB: "BR",
  // Colombia
  EC: "CO",
  // Chile
  SQM: "CL", BSAC: "CL",
};

// ── ETFs that are 100% one country ───────────────────────────────────────────

const ETF_SINGLE_COUNTRY: Record<string, string> = {
  SPY: "US", VOO: "US", IVV: "US", IVVB11: "US", QQQ: "US", VTI: "US",
  DIA: "US", RSP: "US", MDY: "US", IWM: "US", SCHD: "US", VIG: "US",
  VNQ: "US", XLRE: "US", XLF: "US", XLK: "US", XLE: "US", XLV: "US",
  EWZ: "BR", BOVA11: "BR",
  EWJ: "JP", DXJ: "JP",
  EWG: "DE", EWU: "GB", EWQ: "FR", EWI: "IT", EWP: "ES", EWN: "NL",
  EWL: "CH", EWD: "SE", NORW: "NO",
  FXI: "CN", MCHI: "CN", KWEB: "CN", ASHR: "CN",
  EWY: "KR", EWT: "TW", INDA: "IN", EWA: "AU", EWC: "CA",
  EWS: "SG", THD: "TH", EIDO: "ID", EWM: "MY",
  EIS: "IL", KSA: "SA",
  EZA: "ZA",
  ARGT: "AR", ECH: "CL",
};

// ── Embedded ETF country allocations (from fund factsheets, Q1-2025) ─────────
// More complete than mapping individual tickers. Updated quarterly.

const ETF_COUNTRY_WEIGHTS: Record<string, Array<[string, number]>> = {
  // VWRA / VT / MSCI ACWI — source: iShares/Vanguard factsheet
  "VWRA.L": [
    ["US", 62.5], ["JP", 5.4], ["GB", 3.5], ["CN", 2.8], ["FR", 2.7],
    ["CA", 2.6], ["CH", 2.3], ["DE", 2.1], ["IN", 1.9], ["AU", 1.8],
    ["TW", 1.7], ["KR", 1.4], ["NL", 1.1], ["DK", 0.9], ["SE", 0.8],
    ["HK", 0.7], ["IT", 0.6], ["ES", 0.6], ["SG", 0.4], ["BR", 0.4],
    ["SA", 0.4], ["ZA", 0.3], ["FI", 0.3], ["BE", 0.3], ["NO", 0.3],
    ["IE", 0.3], ["IL", 0.2], ["MX", 0.2], ["TH", 0.2], ["ID", 0.2],
    ["MY", 0.2], ["AT", 0.1], ["NZ", 0.1], ["PH", 0.1], ["PL", 0.1],
    ["AE", 0.1], ["KW", 0.1], ["QA", 0.1], ["CL", 0.1], ["TR", 0.1],
    ["EG", 0.05], ["CZ", 0.05], ["GR", 0.05], ["HU", 0.05], ["CO", 0.05],
  ],
  // IEUR / EFA / MSCI EAFE (Europe, Australasia, Far East)
  IEUR: [
    ["GB", 14.2], ["JP", 21.5], ["FR", 10.8], ["CH", 9.6], ["DE", 8.5],
    ["AU", 7.2], ["NL", 4.3], ["DK", 3.2], ["SE", 2.8], ["HK", 2.5],
    ["IT", 2.4], ["ES", 2.3], ["SG", 1.4], ["FI", 1.1], ["BE", 1.0],
    ["NO", 0.8], ["IE", 0.7], ["IL", 0.6], ["NZ", 0.3], ["AT", 0.3],
    ["PT", 0.2],
  ],
  // VT (Vanguard Total World Stock)
  VT: [
    ["US", 60.0], ["JP", 5.8], ["GB", 3.4], ["CN", 3.2], ["CA", 2.7],
    ["FR", 2.6], ["CH", 2.2], ["DE", 2.0], ["IN", 2.0], ["AU", 1.7],
    ["TW", 1.8], ["KR", 1.5], ["NL", 1.0], ["DK", 0.9], ["SE", 0.8],
    ["HK", 0.7], ["IT", 0.6], ["ES", 0.6], ["BR", 0.5], ["SA", 0.4],
    ["SG", 0.4], ["ZA", 0.3], ["MX", 0.3], ["ID", 0.2], ["TH", 0.2],
  ],
  // AAXJ (iShares MSCI All Country Asia ex Japan)
  AAXJ: [
    ["CN", 26.0], ["IN", 21.0], ["TW", 17.5], ["KR", 12.5], ["HK", 4.5],
    ["SG", 3.0], ["TH", 2.5], ["ID", 2.0], ["MY", 1.8], ["PH", 0.8],
    ["VN", 0.5],
  ],
};
// Aliases
ETF_COUNTRY_WEIGHTS["VWRA"] = ETF_COUNTRY_WEIGHTS["VWRA.L"];
ETF_COUNTRY_WEIGHTS["IWDA"] = ETF_COUNTRY_WEIGHTS["VWRA.L"]; // MSCI World is similar
ETF_COUNTRY_WEIGHTS["URTH"] = ETF_COUNTRY_WEIGHTS["VWRA.L"];
ETF_COUNTRY_WEIGHTS["ACWI"] = ETF_COUNTRY_WEIGHTS["VWRA.L"];
ETF_COUNTRY_WEIGHTS["VEA"] = ETF_COUNTRY_WEIGHTS["IEUR"];
ETF_COUNTRY_WEIGHTS["EFA"] = ETF_COUNTRY_WEIGHTS["IEUR"];

// ── FMP country weightings cache ─────────────────────────────────────────────

const fmpCountryCache = new Map<string, { data: Array<{ country: string; weightPercentage: number }>; ts: number }>();
const FMP_CACHE_TTL = 86400_000; // 24 hours

// ── Normalize country name → ISO code ────────────────────────────────────────

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "united states": "US", "usa": "US", "us": "US",
  "brazil": "BR", "brasil": "BR",
  "canada": "CA",
  "mexico": "MX", "méxico": "MX",
  "argentina": "AR",
  "chile": "CL",
  "colombia": "CO", "colômbia": "CO",
  "peru": "PE",
  "united kingdom": "GB", "uk": "GB", "great britain": "GB",
  "germany": "DE", "deutschland": "DE", "alemanha": "DE",
  "france": "FR", "frança": "FR",
  "netherlands": "NL", "holland": "NL", "holanda": "NL",
  "switzerland": "CH", "suíça": "CH", "suica": "CH",
  "ireland": "IE", "irlanda": "IE",
  "denmark": "DK", "dinamarca": "DK",
  "sweden": "SE", "suécia": "SE",
  "finland": "FI", "finlândia": "FI",
  "norway": "NO", "noruega": "NO",
  "spain": "ES", "espanha": "ES",
  "italy": "IT", "itália": "IT",
  "portugal": "PT",
  "belgium": "BE", "bélgica": "BE",
  "austria": "AT", "áustria": "AT",
  "poland": "PL", "polônia": "PL",
  "greece": "GR", "grécia": "GR",
  "czech republic": "CZ", "czechia": "CZ",
  "hungary": "HU", "hungria": "HU",
  "turkey": "TR", "turquia": "TR", "türkiye": "TR",
  "russia": "RU", "rússia": "RU",
  "japan": "JP", "japão": "JP",
  "china": "CN",
  "hong kong": "HK",
  "south korea": "KR", "korea": "KR", "coreia do sul": "KR", "republic of korea": "KR",
  "taiwan": "TW",
  "india": "IN", "índia": "IN",
  "singapore": "SG", "singapura": "SG",
  "indonesia": "ID", "indonésia": "ID",
  "thailand": "TH", "tailândia": "TH",
  "malaysia": "MY", "malásia": "MY",
  "philippines": "PH", "filipinas": "PH",
  "vietnam": "VN", "vietnã": "VN",
  "australia": "AU", "austrália": "AU",
  "new zealand": "NZ", "nova zelândia": "NZ",
  "israel": "IL",
  "saudi arabia": "SA", "arábia saudita": "SA",
  "united arab emirates": "AE", "uae": "AE", "emirados árabes": "AE",
  "qatar": "QA", "catar": "QA",
  "kuwait": "KW",
  "south africa": "ZA", "áfrica do sul": "ZA",
  "nigeria": "NG", "nigéria": "NG",
  "egypt": "EG", "egito": "EG",
};

function normalizeCountryName(name: string): string | null {
  const lower = name.toLowerCase().trim();
  return COUNTRY_NAME_TO_CODE[lower] ?? null;
}

// ── Tier 1: FMP ETF Country Weightings ───────────────────────────────────────

async function fetchFmpCountryWeightings(ticker: string): Promise<Array<{ code: string; weight: number }> | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;

  const t = ticker.toUpperCase();
  const cached = fmpCountryCache.get(t);
  if (cached && Date.now() - cached.ts < FMP_CACHE_TTL) {
    return cached.data.map(d => {
      const code = normalizeCountryName(d.country);
      return code ? { code, weight: d.weightPercentage } : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }

  try {
    const url = `https://financialmodelingprep.com/api/v3/etf-country-weightings/${t}?apikey=${key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    fmpCountryCache.set(t, { data, ts: Date.now() });

    return data.map((d: Record<string, unknown>) => {
      const countryStr = String(d.country ?? "");
      const weight = parseFloat(String(d.weightPercentage ?? "0").replace("%", ""));
      const code = normalizeCountryName(countryStr);
      return code && weight > 0 ? { code, weight } : null;
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  } catch {
    return null;
  }
}

// ── Tier 2: Infer country from ticker ────────────────────────────────────────

function inferCountryFromTicker(ticker: string): string | null {
  // Check exchange suffix
  for (const [suffix, code] of Object.entries(EXCHANGE_SUFFIX)) {
    if (ticker.toUpperCase().endsWith(suffix.toUpperCase())) return code;
  }
  // Check ADR map
  const clean = ticker.toUpperCase().replace(".SA", "");
  return ADR_COUNTRY[clean] ?? null;
}

// ── Main: compute country allocation ─────────────────────────────────────────

export async function computeCountryAllocation(
  etfHoldings: Record<string, { valor_brl: number; components: Array<{ ativo: string; peso: number }> }>,
  directPositions: Array<{ ticker: string; setor: string; valorAtualBRL: number }>,
): Promise<CountryAllocation[]> {

  const countryAccum: Record<string, { value_brl: number; tickers: Set<string> }> = {};

  const addToCountry = (code: string, valueBRL: number, ticker: string) => {
    if (valueBRL <= 0 || !COUNTRIES[code]) return;
    if (!countryAccum[code]) countryAccum[code] = { value_brl: 0, tickers: new Set() };
    countryAccum[code].value_brl += valueBRL;
    countryAccum[code].tickers.add(ticker);
  };

  // ── Process ETFs ─────────────────────────────────────────────────────────
  const etfTickers = Object.keys(etfHoldings);
  const fmpResults = await Promise.allSettled(
    etfTickers.map(async (etfTicker) => {
      const clean = etfTicker.replace(".SA", "").toUpperCase();

      // Single-country override
      const singleCountry = ETF_SINGLE_COUNTRY[clean];
      if (singleCountry) return { etfTicker, type: "single" as const, country: singleCountry };

      // Try FMP country weightings
      const fmpData = await fetchFmpCountryWeightings(clean);
      if (fmpData && fmpData.length > 0) return { etfTicker, type: "fmp" as const, data: fmpData };

      // Try embedded country weights (from fund factsheets)
      const embedded = ETF_COUNTRY_WEIGHTS[clean] ?? ETF_COUNTRY_WEIGHTS[etfTicker.toUpperCase()];
      if (embedded) {
        const embeddedData = embedded.map(([code, weight]) => ({ code, weight }));
        return { etfTicker, type: "fmp" as const, data: embeddedData };
      }

      // Fallback: use holdings to infer
      return { etfTicker, type: "holdings" as const };
    })
  );

  for (const result of fmpResults) {
    if (result.status !== "fulfilled") continue;
    const r = result.value;
    const etf = etfHoldings[r.etfTicker];
    if (!etf || etf.valor_brl <= 0) continue;

    if (r.type === "single") {
      addToCountry(r.country, etf.valor_brl, r.etfTicker);
    } else if (r.type === "fmp") {
      const totalWeight = r.data.reduce((s, d) => s + d.weight, 0);
      for (const { code, weight } of r.data) {
        const valueBRL = totalWeight > 0 ? (weight / totalWeight) * etf.valor_brl : 0;
        addToCountry(code, valueBRL, r.etfTicker);
      }
    } else {
      // Infer from individual holdings
      const totalWeight = etf.components.reduce((s, c) => s + c.peso, 0);
      for (const comp of etf.components) {
        if (comp.ativo.startsWith("OUTROS.")) continue;
        const country = inferCountryFromTicker(comp.ativo) ?? "US";
        const valueBRL = totalWeight > 0 ? (comp.peso / totalWeight) * etf.valor_brl : 0;
        addToCountry(country, valueBRL, comp.ativo);
      }
    }
  }

  // ── Process direct positions ─────────────────────────────────────────────
  for (const pos of directPositions) {
    if (pos.valorAtualBRL <= 0) continue;

    const country = inferCountryFromTicker(pos.ticker);
    if (country) {
      addToCountry(country, pos.valorAtualBRL, pos.ticker);
    } else if (pos.ticker.endsWith(".SA") || ["Ações Brasil", "FIIs", "BDRs", "Renda Fixa", "Caixa/Liquidez"].includes(pos.setor)) {
      addToCountry("BR", pos.valorAtualBRL, pos.ticker);
    } else if (["Ações Internacional", "ETF USA", "Ações EUA"].includes(pos.setor)) {
      addToCountry("US", pos.valorAtualBRL, pos.ticker);
    } else if (pos.setor === "Cripto") {
      // skip crypto — no country
    } else {
      addToCountry("US", pos.valorAtualBRL, pos.ticker);
    }
  }

  // ── Build result ─────────────────────────────────────────────────────────
  const total = Object.values(countryAccum).reduce((s, v) => s + v.value_brl, 0);

  return Object.entries(countryAccum)
    .map(([code, data]) => ({
      country: COUNTRIES[code],
      value_brl: data.value_brl,
      pct: total > 0 ? (data.value_brl / total) * 100 : 0,
      tickers: [...data.tickers].slice(0, 12),
    }))
    .filter(x => x.country != null)
    .sort((a, b) => b.value_brl - a.value_brl);
}

export function getCountryInfo(code: string): CountryInfo | null {
  return COUNTRIES[code] ?? null;
}

export { COUNTRIES };
