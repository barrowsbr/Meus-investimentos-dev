// ─────────────────────────────────────────────────────────────────────────────
// Tipos compartilhados do Radar V2.
// O Radar é um scanner de mercado (não toca no motor de portfólio): consome as
// rotas existentes /api/bolsas, /api/moedas e /api/bolsas/country.
// ─────────────────────────────────────────────────────────────────────────────

import type { IndexData } from "@/lib/world-map";

export type { IndexData };

// Camadas ativáveis do mapa.
export type RadarLayer = "mercados" | "cambio" | "instabilidade" | "exposicao";

export interface BolsasResponse {
  indices: IndexData[];
  spHistory: { date: string; close: number }[];
  breadth: { up: number; down: number; total: number };
  best: { symbol: string; name: string; flag: string; changePct: number };
  worst: { symbol: string; name: string; flag: string; changePct: number };
  lastUpdate: string;
  error?: string;
}

export interface CurrencyData {
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

export interface MoedasResponse {
  currencies: CurrencyData[];
  usdBrl: number;
  lastUpdate: string;
  error?: string;
}

// ── Dossiê de país (Fase 1: cabeçalho, mercados locais, macro) ───────────────

export interface MacroIndicator {
  id: string;
  label: string;
  format: "pct" | "usd" | "num" | "ratio";
  value: number | null;
  year: number | null;
}

export interface CountryMacro {
  country: string;
  iso?: string;
  teUrl: string | null;
  currency: string | null;
  exchangeRate: { vsUSD: number | null; vsBRL: number | null };
  indicators: MacroIndicator[];
  error?: string;
}

// País selecionado no mapa → entrada do dossiê.
export interface SelectedCountry {
  name: string;          // nome PT (chave de COUNTRY_TO_ISO_NUM)
  iso: string;           // ISO numérico (id da geografia)
  flag: string;
  region: string;
}

// ── Fase 2: Inteligência ────────────────────────────────────────────────────

export interface InstabilityDimension {
  label: string;
  score: number;
  detail: string;
}

export interface InstabilityData {
  country: string;
  score: number;
  level: "baixo" | "moderado" | "elevado" | "crítico";
  dimensions: InstabilityDimension[];
  cachedAt: string;
  error?: string;
}

export interface BriefData {
  country: string;
  brief: string | null;
  model?: string;
  cachedAt?: string;
  error?: string;
}

export interface CountryNewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  impacto: "alto" | "medio" | "baixo";
  original?: string;   // manchete no idioma original (quando traduzida)
  idioma?: string;     // código do idioma de origem (ex: "ja", "de")
  local?: boolean;     // veículo local (vs agência internacional)
}

export interface CountryNewsResponse {
  country: string;
  articles: CountryNewsItem[];
  count: number;
  error?: string;
}

export interface SignalOdds {
  outcome: string;
  percent: number;
}

export interface Signal {
  title: string;
  url: string;
  odds: SignalOdds[];
  volume: number;
  daysLeft: number | null;
  category: string;
}

export interface SignalsResponse {
  country: string;
  signals: Signal[];
  count: number;
  error?: string;
}

// ── Fase 2: Timeline 7 dias ─────────────────────────────────────────────────

export interface TimelineDayPoint {
  date: string;
  indexClose: number | null;
  indexChangePct: number | null;
  fxRate: number | null;
  fxChangePct: number | null;
}

export interface TimelineResponse {
  country: string;
  indexSymbol: string | null;
  fxSymbol: string | null;
  timeline: TimelineDayPoint[];
  error?: string;
}

// ── Fase 5: Moeda (detalhe + histórico) ─────────────────────────────────────

export interface CurrencyPeriods {
  "1S": number | null;
  "1M": number | null;
  "3M": number | null;
  "6M": number | null;
  "1A": number | null;
  YTD: number | null;
}

export interface CurrencyDetail {
  code: string;
  isDollarIndex: boolean;
  symbol: string;
  rate: number;                 // "unidades por 1 USD" (ou valor do DXY)
  changePct: number;            // variação do dia da taxa
  periods: CurrencyPeriods | null;
  hi52: number | null;
  lo52: number | null;
  history: { date: string; close: number }[];
  error?: string;
}

// ── Fase 5: Mercados → drill-down de símbolo (índice ou ação) ────────────────

export type SymbolKind = "index" | "stock" | "commodity";

export interface SymbolTarget {
  symbol: string;     // símbolo Yahoo (^GSPC, AAPL, PETR4.SA)
  name: string;       // nome amigável
  kind: SymbolKind;
  moeda: string;      // moeda de cotação (para o eixo do gráfico)
  flag?: string;
}

// Resultado da busca livre de ativos no Yahoo (Command Palette ⌘K).
export interface SymbolSearchResult {
  symbol: string;     // símbolo Yahoo (PETR4.SA, AAPL, ^GSPC)
  name: string;       // nome amigável
  exchange: string;   // bolsa (NASDAQ, B3, …)
  type: string;       // rótulo PT: Ação, ETF, Índice, Cripto…
  kind: SymbolKind;   // index | stock (controla notícias e badge)
  moeda: string;      // palpite de moeda do eixo
}

export interface SymbolSearchResponse {
  query: string;
  results: SymbolSearchResult[];
  error?: string;
}

export interface ConstituentData {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
}

export interface ConstituentsResponse {
  symbol: string;
  constituents: ConstituentData[];
  available: boolean;
  total?: number;
  error?: string;
}

// ── Fase 4: Portfolio Exposure ──────────────────────────────────────────────

export interface ExposureEntry {
  countryPT: string;
  iso2: string;
  totalBRL: number;
  pct: number;
  tickers: string[];
  directBRL: number;
  etfBRL: number;
  etfSources: string[];
}

export interface ExposureResponse {
  exposure: ExposureEntry[];
  // Alocação por BOLSA de listagem (onde o papel é negociado, não a origem).
  // Alimenta a camada "Minhas bolsas" do mapa.
  exchanges?: ExposureEntry[];
  totalBRL?: number;
  etfDecomposed?: boolean;
  etfSupported?: string[];
  error?: string;
}
