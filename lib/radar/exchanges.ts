// ─────────────────────────────────────────────────────────────────────────────
// exchanges.ts — registro de bolsas (praças) e alocação por bolsa.
//
// Para a "visão de bolsas" do Radar: agrupa as posições diretas pela bolsa em
// que SÃO NEGOCIADAS (venue de listagem), com coordenadas da cidade da bolsa
// para os pins no mapa. Difere da visão de país (origem): um ADR como TSM é
// negociado nos EUA (NYSE/Nasdaq) mas a ORIGEM é Taiwan — aqui ele entra em
// "EUA · NYSE/Nasdaq" (onde é negociado); na visão de país, em Taiwan.
//
// Client-safe: dados puros, sem imports server-only.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExchangeInfo {
  code: string;        // id interno (NYSE_NASDAQ, B3, TSX, …)
  name: string;        // nome curto exibido ("NYSE / Nasdaq", "B3", "Xetra")
  city: string;        // cidade da praça ("Nova York", "São Paulo")
  iso2: string;        // país da bolsa (US, BR, CA, …)
  coords: [number, number]; // [lng, lat] da cidade — para os pins
}

// Registro das praças que cobrimos. Coordenadas = cidade da bolsa.
export const EXCHANGES: Record<string, ExchangeInfo> = {
  NYSE_NASDAQ: { code: "NYSE_NASDAQ", name: "NYSE / Nasdaq", city: "Nova York", iso2: "US", coords: [-74.01, 40.71] },
  B3:          { code: "B3",          name: "B3",            city: "São Paulo", iso2: "BR", coords: [-46.63, -23.55] },
  TSX:         { code: "TSX",         name: "TSX",           city: "Toronto",   iso2: "CA", coords: [-79.38, 43.65] },
  LSE:         { code: "LSE",         name: "LSE",           city: "Londres",   iso2: "GB", coords: [-0.12, 51.51] },
  XETRA:       { code: "XETRA",       name: "Xetra",         city: "Frankfurt", iso2: "DE", coords: [8.68, 50.11] },
  EURONEXT_PA: { code: "EURONEXT_PA", name: "Euronext Paris", city: "Paris",    iso2: "FR", coords: [2.35, 48.86] },
  EURONEXT_AM: { code: "EURONEXT_AM", name: "Euronext Amsterdã", city: "Amsterdã", iso2: "NL", coords: [4.90, 52.37] },
  SIX:         { code: "SIX",         name: "SIX",           city: "Zurique",   iso2: "CH", coords: [8.54, 47.37] },
  BORSA_IT:    { code: "BORSA_IT",    name: "Borsa Italiana", city: "Milão",    iso2: "IT", coords: [9.19, 45.46] },
  BME:         { code: "BME",         name: "BME",           city: "Madri",     iso2: "ES", coords: [-3.70, 40.42] },
  EURONEXT_LS: { code: "EURONEXT_LS", name: "Euronext Lisboa", city: "Lisboa",  iso2: "PT", coords: [-9.14, 38.72] },
  TSE:         { code: "TSE",         name: "Tóquio (TSE)",  city: "Tóquio",    iso2: "JP", coords: [139.69, 35.68] },
  HKEX:        { code: "HKEX",        name: "HKEX",          city: "Hong Kong", iso2: "HK", coords: [114.16, 22.32] },
  KRX:         { code: "KRX",         name: "KRX",           city: "Seul",      iso2: "KR", coords: [126.98, 37.57] },
  TWSE:        { code: "TWSE",        name: "TWSE",          city: "Taipei",    iso2: "TW", coords: [121.56, 25.03] },
  NSE_BSE:     { code: "NSE_BSE",     name: "NSE / BSE",     city: "Mumbai",    iso2: "IN", coords: [72.87, 19.08] },
  SGX:         { code: "SGX",         name: "SGX",           city: "Singapura", iso2: "SG", coords: [103.85, 1.29] },
  ASX:         { code: "ASX",         name: "ASX",           city: "Sydney",    iso2: "AU", coords: [151.21, -33.87] },
  TASE:        { code: "TASE",        name: "TASE",          city: "Tel Aviv",  iso2: "IL", coords: [34.78, 32.08] },
  BMV:         { code: "BMV",         name: "BMV",           city: "Cidade do México", iso2: "MX", coords: [-99.13, 19.43] },
};

// Sufixo Yahoo de bolsa → praça.
const SUFFIX_TO_EXCHANGE: Record<string, string> = {
  ".SA": "B3",
  ".TO": "TSX", ".V": "TSX",
  ".L": "LSE",
  ".DE": "XETRA", ".F": "XETRA",
  ".PA": "EURONEXT_PA",
  ".AS": "EURONEXT_AM",
  ".SW": "SIX",
  ".MI": "BORSA_IT",
  ".MC": "BME",
  ".LS": "EURONEXT_LS",
  ".T": "TSE",
  ".HK": "HKEX",
  ".KS": "KRX", ".KQ": "KRX",
  ".TW": "TWSE",
  ".NS": "NSE_BSE", ".BO": "NSE_BSE",
  ".SI": "SGX",
  ".AX": "ASX",
  ".TA": "TASE",
  ".MX": "BMV",
};

// Resolve a praça (venue de NEGOCIAÇÃO) de um ticker. Sufixo manda; sem sufixo,
// é listado nos EUA (NYSE/Nasdaq) — inclusive ADRs. Fallback por moeda/setor.
export function resolveExchange(ticker: string, moeda?: string, setor?: string): ExchangeInfo | null {
  const t = (ticker ?? "").toUpperCase().trim();
  if (!t) return null;

  const dot = t.lastIndexOf(".");
  if (dot >= 0) {
    const suffix = t.slice(dot);
    const code = SUFFIX_TO_EXCHANGE[suffix];
    if (code) return EXCHANGES[code];
  }

  // Sem sufixo: praças que não usam sufixo Yahoo.
  const m = (moeda ?? "").toUpperCase();
  const s = (setor ?? "");
  if (m === "BRL" || s === "Ações Brasil" || s === "FIIs" || s === "BDRs") return EXCHANGES.B3;
  // Default: listado nos EUA (ações US e ADRs negociam em NYSE/Nasdaq).
  return EXCHANGES.NYSE_NASDAQ;
}

export interface ExchangeAlloc {
  exchange: ExchangeInfo;
  brl: number;
  tickers: string[];
  pct: number; // % do total alocado em bolsas
}

interface PosLike {
  ticker: string;
  moeda: string;
  setor: string;
  valorAtualBRL: number;
}

// Agrupa posições (em carteira) por praça de negociação.
export function buildExchangeAllocation(positions: PosLike[]): ExchangeAlloc[] {
  const byCode = new Map<string, { info: ExchangeInfo; brl: number; tickers: string[] }>();
  for (const p of positions) {
    if (!p || p.valorAtualBRL <= 0) continue;
    const ex = resolveExchange(p.ticker, p.moeda, p.setor);
    if (!ex) continue;
    const cur = byCode.get(ex.code) ?? { info: ex, brl: 0, tickers: [] };
    cur.brl += p.valorAtualBRL;
    if (!cur.tickers.includes(p.ticker)) cur.tickers.push(p.ticker);
    byCode.set(ex.code, cur);
  }
  const total = [...byCode.values()].reduce((s, e) => s + e.brl, 0);
  return [...byCode.values()]
    .map((e) => ({ exchange: e.info, brl: e.brl, tickers: e.tickers, pct: total > 0 ? (e.brl / total) * 100 : 0 }))
    .sort((a, b) => b.brl - a.brl);
}
