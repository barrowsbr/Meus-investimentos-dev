// ─────────────────────────────────────────────────────────────────────────────
// Tipos compartilhados do Radar V2.
// O Radar é um scanner de mercado (não toca no motor de portfólio): consome as
// rotas existentes /api/bolsas, /api/moedas e /api/bolsas/country.
// ─────────────────────────────────────────────────────────────────────────────

import type { IndexData } from "@/lib/world-map";

export type { IndexData };

// Camadas ativáveis do mapa (Fase 1: as duas "prontas p/ usar" do doc de visão).
export type RadarLayer = "mercados" | "cambio";

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
