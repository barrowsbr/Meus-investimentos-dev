/**
 * Maps stock tickers to ISO country codes + coordinates for world map visualization.
 * Covers the top holdings of major ETFs (SPY, QQQ, VWRA, IVV).
 */

export interface CountryInfo {
  code: string;   // ISO 3166-1 alpha-2
  name: string;
  lat: number;
  lng: number;
  region: string;
}

const COUNTRIES: Record<string, CountryInfo> = {
  US: { code: "US", name: "Estados Unidos", lat: 39.8, lng: -98.5, region: "Americas" },
  BR: { code: "BR", name: "Brasil", lat: -14.2, lng: -51.9, region: "Americas" },
  CA: { code: "CA", name: "Canadá", lat: 56.1, lng: -106.3, region: "Americas" },
  GB: { code: "GB", name: "Reino Unido", lat: 55.4, lng: -3.4, region: "Europe" },
  DE: { code: "DE", name: "Alemanha", lat: 51.2, lng: 10.4, region: "Europe" },
  FR: { code: "FR", name: "França", lat: 46.2, lng: 2.2, region: "Europe" },
  NL: { code: "NL", name: "Holanda", lat: 52.1, lng: 5.3, region: "Europe" },
  CH: { code: "CH", name: "Suíça", lat: 46.8, lng: 8.2, region: "Europe" },
  IE: { code: "IE", name: "Irlanda", lat: 53.1, lng: -8.2, region: "Europe" },
  DK: { code: "DK", name: "Dinamarca", lat: 56.3, lng: 9.5, region: "Europe" },
  SE: { code: "SE", name: "Suécia", lat: 60.1, lng: 18.6, region: "Europe" },
  FI: { code: "FI", name: "Finlândia", lat: 61.9, lng: 25.7, region: "Europe" },
  ES: { code: "ES", name: "Espanha", lat: 40.5, lng: -3.7, region: "Europe" },
  IT: { code: "IT", name: "Itália", lat: 41.9, lng: 12.6, region: "Europe" },
  JP: { code: "JP", name: "Japão", lat: 36.2, lng: 138.3, region: "Asia" },
  CN: { code: "CN", name: "China", lat: 35.9, lng: 104.2, region: "Asia" },
  HK: { code: "HK", name: "Hong Kong", lat: 22.4, lng: 114.1, region: "Asia" },
  KR: { code: "KR", name: "Coreia do Sul", lat: 35.9, lng: 127.8, region: "Asia" },
  TW: { code: "TW", name: "Taiwan", lat: 23.7, lng: 121.0, region: "Asia" },
  IN: { code: "IN", name: "Índia", lat: 20.6, lng: 79.0, region: "Asia" },
  SG: { code: "SG", name: "Singapura", lat: 1.4, lng: 103.8, region: "Asia" },
  AU: { code: "AU", name: "Austrália", lat: -25.3, lng: 133.8, region: "Oceania" },
  IL: { code: "IL", name: "Israel", lat: 31.0, lng: 34.9, region: "Middle East" },
  SA: { code: "SA", name: "Arábia Saudita", lat: 23.9, lng: 45.1, region: "Middle East" },
  ZA: { code: "ZA", name: "África do Sul", lat: -30.6, lng: 22.9, region: "Africa" },
  MX: { code: "MX", name: "México", lat: 23.6, lng: -102.6, region: "Americas" },
  AR: { code: "AR", name: "Argentina", lat: -38.4, lng: -63.6, region: "Americas" },
};

// Top ~200 tickers mapped to their country of incorporation/HQ
const TICKER_COUNTRY: Record<string, string> = {
  // US — mega caps & S&P 500 / Nasdaq-100
  AAPL: "US", MSFT: "US", NVDA: "US", AMZN: "US", META: "US", GOOGL: "US", GOOG: "US",
  AVGO: "US", TSLA: "US", "BRK-B": "US", JPM: "US", LLY: "US", UNH: "US", XOM: "US",
  COST: "US", V: "US", NFLX: "US", MA: "US", HD: "US", PG: "US", JNJ: "US", WMT: "US",
  ABBV: "US", BAC: "US", CRM: "US", AMD: "US", ADBE: "US", QCOM: "US", INTU: "US",
  TXN: "US", AMAT: "US", AMGN: "US", HON: "US", SBUX: "US", ISRG: "US", MU: "US",
  LRCX: "US", REGN: "US", T: "US", VZ: "US", PFE: "US", MRK: "US", CVX: "US",
  KO: "US", PEP: "US", TMO: "US", ABT: "US", DHR: "US", CMCSA: "US", ORCL: "US",
  ACN: "US", NKE: "US", MCD: "US", IBM: "US", GS: "US", MS: "US", C: "US", WFC: "US",
  CSCO: "US", AXP: "US", PM: "US", MDLZ: "US", BLK: "US", SYK: "US", SCHW: "US",
  DE: "US", GE: "US", LMT: "US", RTX: "US", LOW: "US", SPGI: "US", BKNG: "US",
  GILD: "US", CB: "US", MMC: "US", DIS: "US", NOW: "US", PANW: "US", PLTR: "US",
  ABNB: "US", UBER: "US", COIN: "US", SQ: "US", PYPL: "US", SNOW: "US", CRWD: "US",
  ZS: "US", DDOG: "US", NET: "US", MELI: "US", DASH: "US", SHOP: "US",

  // Brasil
  PETR4: "BR", VALE3: "BR", ITUB4: "BR", BBDC4: "BR", B3SA3: "BR", ABEV3: "BR",
  WEGE3: "BR", RENT3: "BR", SUZB3: "BR", JBSS3: "BR", BBAS3: "BR", MGLU3: "BR",
  TAEE11: "BR", HGCR11: "BR", XPML11: "BR", HGLG11: "BR", KNRI11: "BR", MXRF11: "BR",
  VISC11: "BR", BTLG11: "BR", CXSE3: "BR", EGIE3: "BR", VIVT3: "BR", TOTS3: "BR",

  // Europa
  ASML: "NL", SAP: "DE", "SAP.DE": "DE", NESN: "CH", "NESN.SW": "CH",
  "NOVO-B": "DK", NVO: "DK", "ROG.SW": "CH", RHHBY: "CH",
  "MC.PA": "FR", LVMH: "FR", "AZN.L": "GB", AZN: "GB",
  "SHEL.L": "GB", SHEL: "GB", "HSBA.L": "GB", HSBC: "GB",
  "ULVR.L": "GB", UL: "GB", "BP.L": "GB", BP: "GB",
  "SIE.DE": "DE", SIEGY: "DE", "DTE.DE": "DE",
  "AIR.PA": "FR", EADSY: "FR", "SAN.PA": "FR",
  "OR.PA": "FR", LRLCY: "FR",
  "ABB.ST": "CH", ABB: "CH",
  GSK: "GB", "GSK.L": "GB",
  RIO: "GB", "RIO.L": "GB",
  BHP: "AU", "BHP.AX": "AU",
  DEO: "GB", SPOT: "SE",

  // Japão
  "7203.T": "JP", TM: "JP",      // Toyota
  "6758.T": "JP", SONY: "JP",    // Sony
  "6861.T": "JP", KEYCY: "JP",   // Keyence
  "9984.T": "JP",                 // SoftBank
  "6902.T": "JP",                 // Denso
  "8306.T": "JP", MUFG: "JP",    // MUFG
  "7974.T": "JP", NTDOY: "JP",   // Nintendo

  // China / Hong Kong
  BABA: "CN", "9988.HK": "CN",
  TCEHY: "CN", "0700.HK": "CN",
  PDD: "CN", JD: "CN", BIDU: "CN", NIO: "CN", LI: "CN", XPEV: "CN",

  // Taiwan
  TSM: "TW", "2330.TW": "TW",

  // Coreia
  "005930.KS": "KR",             // Samsung

  // Índia
  INFY: "IN", WIT: "IN", HDB: "IN", IBN: "IN",

  // Canadá
  "RY.TO": "CA", RY: "CA",
  "TD.TO": "CA", TD: "CA",
  "SHOP.TO": "CA",
  "ENB.TO": "CA", ENB: "CA",
  "CNR.TO": "CA", CNI: "CA",

  // Austrália
  "CBA.AX": "AU", "CSL.AX": "AU",

  // Israel
  NICE: "IL", CYBR: "IL", MNDY: "IL",

  // Argentina
  ARGT: "AR", YPF: "AR", GGAL: "AR",

  // México
  AMX: "MX",

  // África do Sul
  GFI: "ZA",
};

// ETFs that are 100% a single country (no need to look through)
const ETF_COUNTRY_OVERRIDE: Record<string, string> = {
  SPY: "US", VOO: "US", IVV: "US", "IVVB11": "US", QQQ: "US",
  EWZ: "BR", EWJ: "JP", EWG: "DE", EWU: "GB", FXI: "CN",
  EWY: "KR", EWT: "TW", EWA: "AU", EWC: "CA", INDA: "IN",
  DXJ: "JP", ARGT: "AR", IEUR: "EU",
};

export function getTickerCountry(ticker: string): string | null {
  const t = ticker.toUpperCase().replace(".SA", "");
  return TICKER_COUNTRY[t] ?? TICKER_COUNTRY[ticker] ?? null;
}

export function getCountryInfo(code: string): CountryInfo | null {
  return COUNTRIES[code] ?? null;
}

export function getEtfCountryOverride(etfTicker: string): string | null {
  const t = etfTicker.toUpperCase().replace(".SA", "");
  return ETF_COUNTRY_OVERRIDE[t] ?? null;
}

/**
 * Given look-through holdings for multiple ETFs + direct positions,
 * compute country allocation in BRL.
 */
export function computeCountryAllocation(
  etfHoldings: Record<string, { valor_brl: number; components: Array<{ ativo: string; peso: number }> }>,
  directPositions: Array<{ ticker: string; setor: string; valorAtualBRL: number }>,
): Array<{ country: CountryInfo; value_brl: number; pct: number; tickers: string[] }> {

  const countryAccum: Record<string, { value_brl: number; tickers: Set<string> }> = {};

  const addToCountry = (countryCode: string, valueBRL: number, ticker: string) => {
    if (!countryAccum[countryCode]) countryAccum[countryCode] = { value_brl: 0, tickers: new Set() };
    countryAccum[countryCode].value_brl += valueBRL;
    countryAccum[countryCode].tickers.add(ticker);
  };

  // Process ETF look-through holdings
  for (const [etfTicker, etf] of Object.entries(etfHoldings)) {
    const override = getEtfCountryOverride(etfTicker);

    if (override && override !== "EU") {
      // Single-country ETF — assign all value to that country
      addToCountry(override, etf.valor_brl, etfTicker);
      continue;
    }

    // Multi-country ETF (e.g. VWRA) — distribute by component
    const totalWeight = etf.components.reduce((s, c) => s + c.peso, 0);
    for (const comp of etf.components) {
      if (comp.ativo.startsWith("OUTROS.")) continue;
      const country = getTickerCountry(comp.ativo);
      const valueBRL = totalWeight > 0 ? (comp.peso / totalWeight) * etf.valor_brl : 0;
      if (country) {
        addToCountry(country, valueBRL, comp.ativo);
      } else {
        addToCountry("US", valueBRL, comp.ativo); // default unknown to US for major ETFs
      }
    }
  }

  // Process direct positions (non-ETF)
  for (const pos of directPositions) {
    if (pos.valorAtualBRL <= 0) continue;
    const ticker = pos.ticker.replace(".SA", "");
    const country = getTickerCountry(pos.ticker);

    if (country) {
      addToCountry(country, pos.valorAtualBRL, pos.ticker);
    } else if (pos.ticker.endsWith(".SA") || ["Ações Brasil", "FIIs", "BDRs"].includes(pos.setor)) {
      addToCountry("BR", pos.valorAtualBRL, pos.ticker);
    } else if (["Ações Internacional", "ETF USA", "Ações EUA"].includes(pos.setor)) {
      addToCountry("US", pos.valorAtualBRL, pos.ticker);
    }
  }

  const total = Object.values(countryAccum).reduce((s, v) => s + v.value_brl, 0);

  return Object.entries(countryAccum)
    .map(([code, data]) => {
      const info = getCountryInfo(code);
      if (!info) return null;
      return {
        country: info,
        value_brl: data.value_brl,
        pct: total > 0 ? (data.value_brl / total) * 100 : 0,
        tickers: [...data.tickers].slice(0, 10),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.value_brl - a.value_brl);
}

export { COUNTRIES };
