/**
 * api.ts
 * ======
 * Cliente HTTP centralizado para o backend FastAPI.
 * Todas as chamadas de dados passam por aqui.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export const portfolio = {
  snapshot: ()              => apiFetch<PortfolioSnapshot>("/api/portfolio/snapshot"),
  positions: ()             => apiFetch<Position[]>("/api/portfolio/positions"),
  fixedIncome: ()           => apiFetch<FixedIncomeItem[]>("/api/portfolio/fixed-income"),
  dividends: ()             => apiFetch<Dividend[]>("/api/portfolio/dividends"),
  summary: ()               => apiFetch<PortfolioSummary>("/api/portfolio/summary"),
};

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export const finance = {
  overview: (month?: string) =>
    apiFetch<FinanceOverview>(`/api/finance/overview${month ? `?month=${month}` : ""}`),
  subscriptions: ()         => apiFetch<Subscription[]>("/api/finance/subscriptions"),
  installments: ()          => apiFetch<Installment[]>("/api/finance/installments"),
};

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export const performance = {
  twr: (period = "all")     => apiFetch<TWRResult>(`/api/performance/twr?period=${period}`),
  navSeries: ()             => apiFetch<NavPoint[]>("/api/performance/nav-series"),
  advanced: ()              => apiFetch<AdvancedPerformance>("/api/performance/advanced"),
  history: ()               => apiFetch<PatrimonyPoint[]>("/api/performance/history"),
};

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

export const news = {
  list: (category?: string) =>
    apiFetch<NewsItem[]>(`/api/news${category ? `?category=${category}` : ""}`),
  polymarket: (category?: string) =>
    apiFetch<PolymarketEvent[]>(`/api/news/polymarket${category ? `?category=${category}` : ""}`),
};

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const agent = {
  chat: (message: string, history: ChatMessage[] = []) =>
    apiFetch<ChatResponse>("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify({ message, history }),
    }),
  context: () => apiFetch<Record<string, unknown>>("/api/agent/context"),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Position {
  ticker: string;
  setor: string;
  moeda: string;
  qty: number;
  pm: number;
  pm_brl?: number;
  current_price: number | null;
  market_value: number;
  market_value_brl?: number;
  day_pnl_r: number;
  day_pnl_r_brl?: number;
  day_pnl_pct: number;
  total_pnl_r: number;
  total_pnl_r_brl?: number;
  total_pnl_pct: number;
  has_price: boolean;
  fx_rate?: number;
}

export interface PortfolioSnapshot {
  positions: Position[];
  top_gainers: Position[];
  top_losers: Position[];
  portfolio_day_pnl_r: number;
  portfolio_day_pnl_pct: number;
  rv_total_brl?: number;
  day_pnl_r_brl?: number;
  rf_positions: FixedIncomeItem[];
  rf_total: number;
  computed_at: string;
  errors: string[];
  fx_rates?: Record<string, number>;
}

export interface PortfolioSummary {
  rv_total: number;
  rf_total: number;
  patrimonio_total: number;
  day_pnl_r: number;
  day_pnl_pct: number;
  top_gainers: Position[];
  top_losers: Position[];
  computed_at: string;
}

export interface FixedIncomeItem {
  [key: string]: string | number;
}

export interface Dividend {
  ticker: string;
  data: string;
  valor: number;
  lancamento: string;
  moeda: string;
}

export interface FinanceOverview {
  month: string | null;
  entradas: { nome: string; valor: number }[];
  saidas: { nome: string; valor: number }[];
  cartoes: { nome: string; valor: number }[];
  poupanca: { nome: string; valor: number }[];
  totais: {
    entradas: number;
    saidas: number;
    cartoes: number;
    poupanca_esperada: number;
    saldo: number;
  };
}

export interface Subscription {
  nome: string;
  valor: number;
  dia: string;
  ativa: boolean;
}

export interface Installment {
  nome: string;
  valor_total: number;
  parcelas: string;
  data_compra: string;
}

export interface TWRResult {
  period: string;
  daily_returns?: { date: string; return: number }[];
  [key: string]: unknown;
}

export interface NavPoint {
  date: string;
  nav: number;
}

export interface AdvancedPerformance {
  mwr?: number;
  mwr_error?: string;
  attribution?: Record<string, unknown>[];
  attribution_error?: string;
}

export interface PatrimonyPoint {
  [key: string]: string | number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  published: string;
  summary?: string;
  category?: string;
  tickers?: string[];
}

export interface PolymarketEvent {
  title: string;
  probability?: number;
  category?: string;
  url?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  model_used: string | null;
}
