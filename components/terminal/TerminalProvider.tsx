"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";

// ── Tema ─────────────────────────────────────────────────────────────────────
export type Theme = "ambar" | "jornal" | "matrix" | "miami" | "blade" | "starwars";
const THEME_KEY = "barroots_theme";
const VALID_THEMES: Theme[] = ["ambar", "jornal", "matrix", "miami", "blade", "starwars"];

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
  matrix: {
    accent: "#00FF41", pos: "#00FF41", neg: "#FF3838", info: "#41FFFF",
    text: "#B5E8B5", muted: "#5A8A5A", line: "#142014", panel: "#0A120A",
  },
  miami: {
    accent: "#FF2A6D", pos: "#05FFA1", neg: "#FF2A6D", info: "#05D9E8",
    text: "#F5ECFF", muted: "#8E7AA8", line: "#3A1F5C", panel: "#241040",
  },
  blade: {
    accent: "#FF6D00", pos: "#3FB950", neg: "#F0504A", info: "#38BDF8",
    text: "#C9D1D9", muted: "#6B7B8D", line: "#1A2332", panel: "#0C1219",
  },
  starwars: {
    accent: "#FFE81F", pos: "#43D17A", neg: "#FF3B3B", info: "#3BA9FF",
    text: "#E8E6D8", muted: "#6E6F78", line: "#1A1E2B", panel: "#0B0E16",
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

// ── Animação de fundo ───────────────────────────────────────────────────────
const BG_ANIM_KEY = "barroots_bg_anim";

interface TerminalCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  bgAnim: boolean;
  setBgAnim: (v: boolean) => void;
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
  const { theme, setTheme, bgAnim, setBgAnim } = useTerminal();
  return { theme, setTheme, bgAnim, setBgAnim };
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
  const [bgAnim, setBgAnimState] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
      if (savedTheme && VALID_THEMES.includes(savedTheme)) setThemeState(savedTheme);
      const savedAnim = localStorage.getItem(BG_ANIM_KEY);
      if (savedAnim !== null) setBgAnimState(savedAnim !== "0");
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

  const setBgAnim = useCallback((v: boolean) => {
    setBgAnimState(v);
    try { localStorage.setItem(BG_ANIM_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);

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

  return <Ctx.Provider value={{ theme, setTheme, bgAnim, setBgAnim, filters, setFilter }}>{children}</Ctx.Provider>;
}
