"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

// ── Tema ─────────────────────────────────────────────────────────────────────
export type Theme = "ambar" | "jornal";
const THEME_KEY = "barroots_theme";

/**
 * Cores concretas por tema — para casos onde CSS var não resolve (atributos SVG
 * do Recharts). Mantidas em sincronia com os tokens de globals.css.
 */
export const THEME_COLORS: Record<Theme, Record<string, string>> = {
  ambar: {
    accent: "#E8A33D", pos: "#3FB950", neg: "#F0504A", info: "#5BA8FF",
    text: "#DEE1E8", muted: "#71757F", line: "#1E2027", panel: "#0D0E12",
  },
  jornal: {
    accent: "#000000", pos: "#0C6B2E", neg: "#7F1D1D", info: "#1E3A8A",
    text: "#000000", muted: "#333333", line: "transparent", panel: "transparent",
  },
};

// ── Filtros globais persistentes (README §7) ─────────────────────────────────
export type Periodo = "1D" | "1S" | "1M" | "YTD" | "12M" | "Máx";
export type Moeda = "BRL" | "USD";
export interface Filters {
  periodo: Periodo;
  moeda: Moeda;
  conta: string; // "todas" ou nome da corretora
}
const FILTERS_KEY = "barroots_filters";
const DEFAULT_FILTERS: Filters = { periodo: "YTD", moeda: "BRL", conta: "todas" };

interface TerminalCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}

const Ctx = createContext<TerminalCtx | null>(null);

export function useTerminal(): TerminalCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTerminal precisa estar dentro de <TerminalProvider>");
  return ctx;
}

export function useTheme() {
  const { theme, setTheme } = useTerminal();
  return { theme, setTheme };
}

/** Cores concretas do tema atual (para Recharts / SVG). */
export function usePalette() {
  const { theme } = useTerminal();
  return THEME_COLORS[theme];
}

export function useFilters() {
  const { filters, setFilter } = useTerminal();
  return { filters, setFilter };
}

export default function TerminalProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("ambar");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Hidratar a partir do localStorage (evita flash: o <html> já vem data-theme="ambar").
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
      if (savedTheme === "ambar" || savedTheme === "jornal") setThemeState(savedTheme);
      const savedFilters = localStorage.getItem(FILTERS_KEY);
      if (savedFilters) setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(savedFilters) });
    } catch {
      /* ignore */
    }
  }, []);

  // Aplicar tema ao <html> e persistir.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const setFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(FILTERS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ theme, setTheme, filters, setFilter }}>{children}</Ctx.Provider>;
}
