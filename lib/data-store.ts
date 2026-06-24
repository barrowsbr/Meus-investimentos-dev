/**
 * Abstraction layer for data storage — decouples business logic from Google Sheets.
 *
 * Today: backed by Google Sheets (lib/gsheets.ts + lib/db-cotacoes.ts).
 * Future: swap to Supabase/Postgres/etc by implementing the same interfaces.
 *
 * Usage:
 *   import { dataStore, marketDataStore } from "@/lib/data-store";
 *   const rows = await dataStore.fetchTab("meus_ativos");
 *   const prices = await marketDataStore.read();
 */

import type { GoldenSourceData } from "./db-cotacoes";

// ─── Row type ────────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>;

// ─── DataStore interface ─────────────────────────────────────────────────────

export interface DataStore {
  fetchTab(tabName: string): Promise<Row[]>;
  writeTab(tabName: string, headers: string[], rows: string[][]): Promise<void>;
  appendRows(tabName: string, rows: string[][]): Promise<void>;
  ensureTab(tabName: string, headers: string[]): Promise<boolean>;
  syncHeaders(tabName: string, headers: string[]): Promise<void>;
}

// ─── MarketDataStore interface (golden source — db_cotacoes) ─────────────────

export interface GoldenSourceStatus {
  empty: boolean;
  firstDate?: string;
  lastDate?: string;
  tickerCount?: number;
  dateCount?: number;
  points?: number;
  gaps?: number;
  coverage?: number;
}

export interface MarketDataStore {
  read(): Promise<GoldenSourceData>;
  write(data: GoldenSourceData): Promise<void>;
  status(data: GoldenSourceData): GoldenSourceStatus;
}

// ─── Google Sheets implementations ──────────────────────────────────────────

class GSheetsDataStore implements DataStore {
  async fetchTab(tabName: string): Promise<Row[]> {
    const { fetchTab } = await import("./gsheets");
    return fetchTab(tabName);
  }
  async writeTab(tabName: string, headers: string[], rows: string[][]): Promise<void> {
    const { writeTab } = await import("./gsheets");
    return writeTab(tabName, headers, rows);
  }
  async appendRows(tabName: string, rows: string[][]): Promise<void> {
    const { appendRows } = await import("./gsheets");
    return appendRows(tabName, rows);
  }
  async ensureTab(tabName: string, headers: string[]): Promise<boolean> {
    const { ensureTab } = await import("./gsheets");
    return ensureTab(tabName, headers);
  }
  async syncHeaders(tabName: string, headers: string[]): Promise<void> {
    const { syncHeaders } = await import("./gsheets");
    return syncHeaders(tabName, headers);
  }
}

class GSheetsMarketDataStore implements MarketDataStore {
  async read(): Promise<GoldenSourceData> {
    const { readGoldenSource } = await import("./db-cotacoes");
    return readGoldenSource();
  }
  async write(data: GoldenSourceData): Promise<void> {
    const { writeGoldenSource } = await import("./db-cotacoes");
    return writeGoldenSource(data);
  }
  status(data: GoldenSourceData): GoldenSourceStatus {
    const { goldenSourceStatus } = require("./db-cotacoes") as typeof import("./db-cotacoes");
    return goldenSourceStatus(data);
  }
}

// ─── Singleton instances ────────────────────────────────────────────────────

let _store: DataStore = new GSheetsDataStore();
let _marketStore: MarketDataStore = new GSheetsMarketDataStore();

export function getDataStore(): DataStore {
  return _store;
}

export function getMarketDataStore(): MarketDataStore {
  return _marketStore;
}

export function setDataStore(store: DataStore): void {
  _store = store;
}

export function setMarketDataStore(store: MarketDataStore): void {
  _marketStore = store;
}
