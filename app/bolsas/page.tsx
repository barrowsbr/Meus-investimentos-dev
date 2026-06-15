"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup,
} from "react-simple-maps";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, YAxis,
} from "recharts";
import {
  ArrowLeft, TrendingUp, TrendingDown, Search,
  ArrowUpDown, Filter, ExternalLink,
  Activity, BarChart3, Maximize, Flame, ChevronDown, Crown,
  Landmark, Globe2, DollarSign, Bitcoin, Coins, Gauge,
  ZoomIn, ZoomOut, Maximize2, Globe,
} from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import ErrorAlert from "@/components/ErrorAlert";

type RadarTab = "bolsas" | "moedas" | "crypto";

const BolsasGlobe = dynamic(() => import("@/components/BolsasGlobe"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center" style={{ height: 420 }}>
      <span className="text-zinc-500 text-sm animate-pulse">Carregando globo...</span>
    </div>
  ),
});

interface IndexData {
  symbol: string;
  tvSymbol: string;
  name: string;
  country: string;
  flag: string;
  region: string;
  lat: number;
  lng: number;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

type PeriodKey = "1S" | "1M" | "3M" | "6M" | "1A" | "YTD";

interface BolsasResponse {
  indices: IndexData[];
  spHistory: { date: string; close: number }[];
  spPeriods: Record<PeriodKey, number | null> | null;
  breadth: { up: number; down: number; total: number };
  best: { symbol: string; name: string; flag: string; changePct: number };
  worst: { symbol: string; name: string; flag: string; changePct: number };
  lastUpdate: string;
  error?: string;
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  "1S": "1 sem", "1M": "1 mês", "3M": "3 meses", "6M": "6 meses", "1A": "1 ano", YTD: "Ano (YTD)",
};

const REGION_COLORS: Record<string, string> = {
  Americas: "#3b82f6",
  Europe: "#8b5cf6",
  Asia: "#f59e0b",
  "Middle East": "#ef4444",
  Africa: "#10b981",
  Oceania: "#06b6d4",
};

type SortKey = "name" | "price" | "changePct" | "region";
type CurrSortKey = "code" | "rate" | "changePct" | "region";

const ALL_PERIODS: PeriodKey[] = ["1S", "1M", "3M", "6M", "1A", "YTD"];

function fmtPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ── Heatmap color helpers ──────────────────────────────────────────────────

function heatColor(pct: number): string {
  const clamped = Math.max(-4, Math.min(4, pct));
  const t = (clamped + 4) / 8;
  if (t < 0.5) {
    const r = Math.round(239 + (250 - 239) * (t * 2));
    const g = Math.round(68 + (204 - 68) * (t * 2));
    const b = Math.round(68 + (21 - 68) * (t * 2));
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(250 + (34 - 250) * ((t - 0.5) * 2));
  const g = Math.round(204 + (197 - 204) * ((t - 0.5) * 2));
  const b = Math.round(21 + (94 - 21) * ((t - 0.5) * 2));
  return `rgb(${r},${g},${b})`;
}

// ── Moedas types ─────────────────────────────────────────────────────────

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface CurrencyData {
  code: string; name: string; rate: number; change: number;
  changePct: number; flag: string; region: string; lat: number; lng: number;
}

interface DxyData {
  value: number; change: number; changePct: number;
  source: "yahoo" | "sintetico";
  periods: Record<PeriodKey, number | null> | null;
  history: { date: string; close: number }[];
}

interface MoedasVerdict { label: string; tone: "forte" | "neutro" | "fraco"; score: number; reason: string }

interface MoedasResponse {
  currencies: CurrencyData[]; usdBrl: number; lastUpdate: string;
  dxy: DxyData | null; breadth: { up: number; down: number; total: number };
  verdict: MoedasVerdict; error?: string;
}

const MOEDAS_TONE: Record<MoedasVerdict["tone"], { color: string; bg: string; label: string }> = {
  forte:  { color: "#34d399", bg: "rgba(16,185,129,0.12)", label: "Dólar forte" },
  neutro: { color: "#fbbf24", bg: "rgba(245,158,11,0.12)", label: "Neutro" },
  fraco:  { color: "#f87171", bg: "rgba(239,68,68,0.12)",  label: "Dólar fraco" },
};

// ── Main page ──────────────────────────────────────────────────────────────

interface PeriodsCache {
  [symbol: string]: Record<PeriodKey, number | null> | null;
}

export default function BolsasPage() {
  const searchParams = useSearchParams();
  const initialSymbol = searchParams.get("symbol");
  const initialTab = (searchParams.get("tab") as RadarTab) || "bolsas";
  const [activeTab, setActiveTab] = useState<RadarTab>(initialTab);
  const [data, setData] = useState<BolsasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePct");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<IndexData | null>(null);
  const [periodsCache, setPeriodsCache] = useState<PeriodsCache>({});
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [customAsset, setCustomAsset] = useState<IndexData | null>(null);
  const didAutoSelect = useRef(false);

  interface MacroData {
    yields: { label: string; maturity: number; yield: number; change: number }[];
    spread10Y2Y: number | null;
    dxy: { price: number; change: number; changePct: number } | null;
    gold: { price: number; change: number; changePct: number } | null;
  }
  interface CryptoAsset {
    id: string; symbol: string; name: string; image: string;
    price: number; marketCap: number; rank: number;
    change1h: number | null; change24h: number | null; change7d: number | null;
    volume24h: number; sparkline: number[]; ath: number; athChangePct: number;
  }
  const [macro, setMacro] = useState<MacroData | null>(null);
  const [cryptoAssets, setCryptoAssets] = useState<CryptoAsset[]>([]);
  const [btcDominance, setBtcDominance] = useState<number>(0);

  // Moedas state
  const [moedasData, setMoedasData] = useState<MoedasResponse | null>(null);
  const [moedasSearch, setMoedasSearch] = useState("");
  const [currSortKey, setCurrSortKey] = useState<CurrSortKey>("changePct");
  const [currSortAsc, setCurrSortAsc] = useState(false);
  const [hoveredCurrency, setHoveredCurrency] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyData | null>(null);

  useEffect(() => {
    fetch("/api/bolsas/yields")
      .then(r => r.json())
      .then(d => { if (!d.error) setMacro(d); })
      .catch(() => {});
    fetch("/api/bolsas/crypto")
      .then(r => r.json())
      .then(d => { if (d.assets?.length) { setCryptoAssets(d.assets); setBtcDominance(d.btcDominance ?? 0); } })
      .catch(() => {});
    fetch("/api/moedas")
      .then(r => r.json())
      .then(d => { if (!d.error) setMoedasData(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/bolsas")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else {
          setData(d);
          if (d.spPeriods) {
            setPeriodsCache(prev => ({ ...prev, "^GSPC": d.spPeriods }));
          }
          if (initialSymbol && !didAutoSelect.current) {
            didAutoSelect.current = true;
            const match = (d.indices as IndexData[]).find(i => i.symbol === initialSymbol);
            if (match) setSelectedIndex(match);
          }
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusedSymbol = customAsset?.symbol ?? selectedIndex?.symbol ?? "^GSPC";

  useEffect(() => {
    if (!focusedSymbol || periodsCache[focusedSymbol] !== undefined) return;
    let cancelled = false;
    setPeriodsLoading(true);
    fetch(`/api/bolsas/history?symbol=${encodeURIComponent(focusedSymbol)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setPeriodsCache(prev => ({ ...prev, [focusedSymbol]: d.periods ?? null }));
      })
      .catch(() => {
        if (!cancelled) setPeriodsCache(prev => ({ ...prev, [focusedSymbol]: null }));
      })
      .finally(() => { if (!cancelled) setPeriodsLoading(false); });
    return () => { cancelled = true; };
  }, [focusedSymbol, periodsCache]);

  const regions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.indices.map(i => i.region))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.indices;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.symbol.toLowerCase().includes(q) ||
        i.country.toLowerCase().includes(q) ||
        i.region.toLowerCase().includes(q)
      );
    }
    if (selectedRegion) {
      list = list.filter(i => i.region === selectedRegion);
    }
    list = [...list].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "name": va = a.name; vb = b.name; break;
        case "price": va = a.price; vb = b.price; break;
        case "changePct": va = a.changePct; vb = b.changePct; break;
        case "region": va = a.region; vb = b.region; break;
        default: va = a.changePct; vb = b.changePct;
      }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return list;
  }, [data, search, sortKey, sortAsc, selectedRegion]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "name" || key === "region"); }
  };

  const handleHover = useCallback((symbol: string | null) => setHoveredIndex(symbol), []);
  const handleSelect = useCallback((i: IndexData | null) => { setSelectedIndex(i); setCustomAsset(null); }, []);

  const handleSelectStock = useCallback((ticker: string, name: string, price: number, changePct: number, currency: string) => {
    setCustomAsset({
      symbol: ticker,
      tvSymbol: "",
      name,
      country: "",
      flag: "",
      region: "",
      lat: 0,
      lng: 0,
      price,
      change: price * changePct / 100,
      changePct,
      currency,
    });
  }, []);

  const handleClearCustom = useCallback(() => setCustomAsset(null), []);

  const handleCurrSort = (key: CurrSortKey) => {
    if (currSortKey === key) setCurrSortAsc(!currSortAsc);
    else { setCurrSortKey(key); setCurrSortAsc(key === "code" || key === "region"); }
  };
  const handleCurrHover = useCallback((code: string | null) => setHoveredCurrency(code), []);
  const handleCurrSelect = useCallback((c: CurrencyData | null) => setSelectedCurrency(c), []);

  const currRegions = useMemo(() => {
    if (!moedasData) return [];
    return [...new Set(moedasData.currencies.map(c => c.region))].sort();
  }, [moedasData]);

  const filteredCurrencies = useMemo(() => {
    if (!moedasData) return [];
    let list = moedasData.currencies;
    if (moedasSearch) {
      const q = moedasSearch.toLowerCase();
      list = list.filter(c => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    }
    if (selectedRegion) list = list.filter(c => c.region === selectedRegion);
    return [...list].sort((a, b) => {
      const va = currSortKey === "code" ? a.code : currSortKey === "rate" ? a.rate : currSortKey === "region" ? a.region : a.changePct;
      const vb = currSortKey === "code" ? b.code : currSortKey === "rate" ? b.rate : currSortKey === "region" ? b.region : b.changePct;
      if (typeof va === "string") return currSortAsc ? (va as string).localeCompare(vb as string) : (vb as string).localeCompare(va as string);
      return currSortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [moedasData, moedasSearch, currSortKey, currSortAsc, selectedRegion]);

  const currStats = useMemo(() => {
    if (!moedasData) return null;
    const cs = moedasData.currencies;
    return {
      strongest: cs.reduce((a, b) => a.changePct < b.changePct ? a : b),
      weakest: cs.reduce((a, b) => a.changePct > b.changePct ? a : b),
    };
  }, [moedasData]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  const sp = data.indices.find(i => i.symbol === "^GSPC");
  const ibov = data.indices.find(i => i.symbol === "^BVSP");
  const vix = data.indices.find(i => i.symbol === "^VIX");

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <Activity className="text-blue-400" size={22} />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-zinc-50 via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
            Radar
          </h1>
        </div>
        <p className="text-xs text-zinc-500 ml-[66px]">
          Mercados globais em tempo real &middot; Atualizado: {formatDate(data.lastUpdate)}
        </p>

        {/* Tab Bar */}
        <div className="flex mt-4 ml-[66px]" style={{ borderBottom: "1px solid var(--line)" }}>
          {([
            { key: "bolsas" as RadarTab, label: "Bolsas", icon: <BarChart3 size={13} /> },
            { key: "moedas" as RadarTab, label: "Moedas", icon: <Globe size={13} /> },
            { key: "crypto" as RadarTab, label: "Crypto", icon: <Bitcoin size={13} /> },
          ]).map(t => {
            const on = activeTab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setSearch(""); setMoedasSearch(""); }}
                className="flex items-center gap-1.5 font-mono uppercase whitespace-nowrap"
                style={{ padding: "9px 14px", marginBottom: -1, borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, color: on ? "var(--text)" : "var(--muted)", fontSize: 11, fontWeight: 600, letterSpacing: ".05em" }}
              >
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 space-y-6">

        {/* ═══ BOLSAS TAB ═══ */}
        {activeTab === "bolsas" && (<>
        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sp && (
            <SummaryCard
              label="S&P 500"
              value={fmtPrice(sp.price)}
              sub={`${sp.changePct >= 0 ? "+" : ""}${sp.changePct.toFixed(2)}%`}
              subColor={sp.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={<TrendingUp size={16} className="text-blue-400" />}
            />
          )}
          {ibov && (
            <SummaryCard
              label="Ibovespa"
              value={fmtPrice(ibov.price)}
              sub={`${ibov.changePct >= 0 ? "+" : ""}${ibov.changePct.toFixed(2)}%`}
              subColor={ibov.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={<TrendingUp size={16} className="text-emerald-400" />}
            />
          )}
          <SummaryCard
            label="Melhor do dia"
            value={`${data.best.flag} ${data.best.name}`}
            sub={`+${data.best.changePct.toFixed(2)}%`}
            subColor="text-emerald-400"
            icon={<TrendingUp size={16} className="text-emerald-400" />}
          />
          <SummaryCard
            label="Pior do dia"
            value={`${data.worst.flag} ${data.worst.name}`}
            sub={`${data.worst.changePct.toFixed(2)}%`}
            subColor="text-red-400"
            icon={<TrendingDown size={16} className="text-red-400" />}
          />
        </div>

        {/* ── Global Macro Strip ── */}
        {(macro || cryptoAssets.length > 0) && (
          <div
            className="rounded-2xl px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2"
            style={{ background: "rgba(13,14,20,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <span className="text-[9px] text-zinc-600 uppercase font-bold tracking-widest mr-1">Macro</span>
            {macro?.dxy && (
              <div className="flex items-center gap-1.5">
                <DollarSign size={11} className="text-green-400" />
                <span className="text-[10px] text-zinc-400 font-semibold">DXY</span>
                <span className="text-[11px] text-zinc-200 font-bold font-mono">{macro.dxy.price.toFixed(2)}</span>
                <span className={`text-[10px] font-semibold ${macro.dxy.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {macro.dxy.changePct >= 0 ? "+" : ""}{macro.dxy.changePct.toFixed(2)}%
                </span>
              </div>
            )}
            {macro?.gold && (
              <div className="flex items-center gap-1.5">
                <Coins size={11} className="text-yellow-400" />
                <span className="text-[10px] text-zinc-400 font-semibold">Ouro</span>
                <span className="text-[11px] text-zinc-200 font-bold font-mono">${macro.gold.price.toFixed(0)}</span>
                <span className={`text-[10px] font-semibold ${macro.gold.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {macro.gold.changePct >= 0 ? "+" : ""}{macro.gold.changePct.toFixed(2)}%
                </span>
              </div>
            )}
            {macro?.yields?.map(y => (
              <div key={y.label} className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 font-semibold">UST {y.label}</span>
                <span className="text-[11px] text-zinc-200 font-bold font-mono">{y.yield.toFixed(2)}%</span>
                <span className={`text-[10px] font-semibold ${y.change >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {y.change >= 0 ? "+" : ""}{y.change.toFixed(2)}
                </span>
              </div>
            ))}
            {macro?.spread10Y2Y != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500 font-semibold">Spread 10Y-2Y</span>
                <span className={`text-[11px] font-bold font-mono ${macro.spread10Y2Y >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {macro.spread10Y2Y >= 0 ? "+" : ""}{macro.spread10Y2Y.toFixed(3)}
                </span>
                {macro.spread10Y2Y < 0 && <span className="text-[9px] text-red-400/70">invertida</span>}
              </div>
            )}
            {cryptoAssets.length > 0 && (
              <>
                <span className="text-zinc-800">|</span>
                {cryptoAssets.slice(0, 3).map(c => (
                  <div key={c.id} className="flex items-center gap-1.5">
                    {c.id === "bitcoin" ? <Bitcoin size={11} className="text-orange-400" /> :
                     <img src={c.image} alt={c.symbol} className="w-3 h-3 rounded-full" />}
                    <span className="text-[10px] text-zinc-400 font-semibold uppercase">{c.symbol}</span>
                    <span className="text-[11px] text-zinc-200 font-bold font-mono">
                      ${c.price >= 1000 ? c.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : c.price.toFixed(2)}
                    </span>
                    <span className={`text-[10px] font-semibold ${(c.change24h ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {(c.change24h ?? 0) >= 0 ? "+" : ""}{(c.change24h ?? 0).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Heatmap World Map ── */}
        <div
          className="rounded-2xl p-3 md:p-5 overflow-hidden"
          style={{
            background: "rgba(13,14,20,0.92)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Flame size={16} className="text-orange-400" />
              Mapa de Calor — Bolsas
            </h2>
            <div className="flex gap-1.5 flex-wrap">
              {regions.map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedRegion(selectedRegion === r ? null : r)}
                  className="text-[10px] px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: selectedRegion === r
                      ? (REGION_COLORS[r] ?? "#888") + "30"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selectedRegion === r ? (REGION_COLORS[r] ?? "#888") + "60" : "rgba(255,255,255,0.06)"}`,
                    color: selectedRegion === r ? REGION_COLORS[r] ?? "#ddd" : "#888",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(5,7,14,0.6)" }}>
            <BolsasGlobe
              indices={data.indices}
              selectedRegion={selectedRegion}
              hoveredIndex={hoveredIndex}
              selectedIndex={selectedIndex}
              onHover={handleHover}
              onSelect={handleSelect}
            />
          </div>

          {/* Heatmap gradient legend */}
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="text-[9px] text-red-400 font-semibold">-4%</span>
            <div
              className="h-2 rounded-full flex-1 max-w-[200px]"
              style={{
                background: "linear-gradient(90deg, #ef4444, #facc15, #22c55e)",
              }}
            />
            <span className="text-[9px] text-emerald-400 font-semibold">+4%</span>
            <span className="text-[9px] text-zinc-600 ml-2">tamanho = intensidade</span>
          </div>
        </div>

        {/* ── Index Thermometer (dynamic) ── */}
        {(() => {
          const focusIdx = customAsset ?? selectedIndex ?? sp;
          if (!focusIdx) return null;
          const cachedPeriods = periodsCache[focusIdx.symbol];
          return (
            <IndexThermometer
              index={focusIdx}
              vix={vix ?? null}
              periods={cachedPeriods ?? null}
              breadth={data.breadth}
              historyLoading={periodsLoading && cachedPeriods === undefined}
              isDefault={!selectedIndex && !customAsset}
              isCustom={!!customAsset}
              expanded={chartExpanded}
              onToggleExpand={() => setChartExpanded(e => !e)}
              onSelectStock={handleSelectStock}
              onClearCustom={handleClearCustom}
              parentIndex={selectedIndex ?? sp ?? null}
            />
          );
        })()}

        {/* ── Selected Index Detail ── */}
        {selectedIndex && (
          <div
            className="rounded-2xl p-5"
            style={{
              background: "rgba(13,14,20,0.8)",
              border: `1px solid ${(REGION_COLORS[selectedIndex.region] ?? "#888")}30`,
              boxShadow: `0 8px 32px ${(REGION_COLORS[selectedIndex.region] ?? "#888")}08`,
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedIndex.flag}</span>
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">{selectedIndex.name}</h3>
                  <p className="text-xs text-zinc-500">{selectedIndex.country} &middot; {selectedIndex.region}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-zinc-100">{fmtPrice(selectedIndex.price)}</p>
                <p className="text-xs text-zinc-500">{selectedIndex.currency}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <DetailBox
                label="Variação dia"
                value={`${selectedIndex.changePct >= 0 ? "+" : ""}${selectedIndex.changePct.toFixed(2)}%`}
                color={selectedIndex.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <DetailBox
                label="Variação absoluta"
                value={`${selectedIndex.change >= 0 ? "+" : ""}${fmtPrice(Math.abs(selectedIndex.change))}`}
                color={selectedIndex.change >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <DetailBox
                label="Último preço"
                value={`${fmtPrice(selectedIndex.price)} ${selectedIndex.currency}`}
                color="text-zinc-200"
              />
            </div>
          </div>
        )}

        {/* ── Region Performance ── */}
        <div
          className="rounded-2xl p-4 md:p-6"
          style={{
            background: "rgba(13,14,20,0.8)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <Filter size={16} className="text-violet-400" />
            Performance por Região
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {regions.map(region => {
              const rc = data.indices.filter(i => i.region === region && i.symbol !== "^VIX");
              if (rc.length === 0) return null;
              const avg = rc.reduce((s, i) => s + i.changePct, 0) / rc.length;
              const color = REGION_COLORS[region] ?? "#888";
              return (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(selectedRegion === region ? null : region)}
                  className="rounded-xl p-3 text-center transition-all hover:scale-[1.02]"
                  style={{
                    background: selectedRegion === region ? `${color}15` : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selectedRegion === region ? `${color}40` : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{region}</p>
                  <p className={`text-sm font-bold mt-1 ${avg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {avg >= 0 ? "+" : ""}{avg.toFixed(2)}%
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{rc.length} {"índices"}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Index Table ── (moved here from below for bolsas tab) */}
        <IndexTableSection
          filtered={filtered}
          search={search}
          setSearch={setSearch}
          sortKey={sortKey}
          sortAsc={sortAsc}
          handleSort={handleSort}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          setHoveredIndex={setHoveredIndex}
        />
        </>)}

        {/* ═══ MOEDAS TAB ═══ */}
        {activeTab === "moedas" && moedasData && (<>
          <MoedasTabContent
            data={moedasData}
            currStats={currStats}
            currRegions={currRegions}
            filteredCurrencies={filteredCurrencies}
            selectedRegion={selectedRegion}
            setSelectedRegion={setSelectedRegion}
            hoveredCurrency={hoveredCurrency}
            selectedCurrency={selectedCurrency}
            onCurrHover={handleCurrHover}
            onCurrSelect={handleCurrSelect}
            moedasSearch={moedasSearch}
            setMoedasSearch={setMoedasSearch}
            currSortKey={currSortKey}
            currSortAsc={currSortAsc}
            handleCurrSort={handleCurrSort}
          />
        </>)}
        {activeTab === "moedas" && !moedasData && (
          <div className="flex items-center justify-center py-20 text-zinc-500 text-sm animate-pulse">
            Carregando moedas...
          </div>
        )}

        {/* ═══ CRYPTO TAB ═══ */}
        {activeTab === "crypto" && (
        <>
        {/* ── Crypto Market ── */}
        {cryptoAssets.length > 0 && (
          <div
            className="rounded-2xl p-4 md:p-6"
            style={{ background: "rgba(13,14,20,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Bitcoin size={16} className="text-orange-400" />
                Criptomoedas
              </h2>
              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                <span>BTC Dominância: <span className="text-orange-400 font-semibold">{(btcDominance * 100).toFixed(1)}%</span></span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {cryptoAssets.map(c => {
                const up = (c.change24h ?? 0) >= 0;
                return (
                  <div
                    key={c.id}
                    className="rounded-xl p-3 transition-all hover:scale-[1.02]"
                    style={{
                      background: up ? "rgba(16,185,129,0.04)" : "rgba(239,68,68,0.04)",
                      border: `1px solid ${up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)"}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <img src={c.image} alt={c.symbol} className="w-5 h-5 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-200 truncate">{c.name}</p>
                        <p className="text-[9px] text-zinc-500 uppercase">{c.symbol} · #{c.rank}</p>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-bold text-zinc-100 font-mono">
                        ${c.price >= 1000 ? c.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2)}
                      </span>
                      <span className={`text-[10px] font-bold ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {up ? "+" : ""}{(c.change24h ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[8px] text-zinc-600">7d</span>
                      <span className={`text-[9px] font-semibold ${(c.change7d ?? 0) >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                        {(c.change7d ?? 0) >= 0 ? "+" : ""}{(c.change7d ?? 0).toFixed(1)}%
                      </span>
                      <span className="text-[8px] text-zinc-600">MCap</span>
                      <span className="text-[9px] text-zinc-400 font-mono">
                        ${c.marketCap >= 1e12 ? `${(c.marketCap / 1e12).toFixed(2)}T` : c.marketCap >= 1e9 ? `${(c.marketCap / 1e9).toFixed(0)}B` : `${(c.marketCap / 1e6).toFixed(0)}M`}
                      </span>
                    </div>
                    {/* Mini sparkline */}
                    {c.sparkline.length > 10 && (
                      <svg viewBox={`0 0 ${c.sparkline.length} 20`} className="w-full h-4 mt-1.5" preserveAspectRatio="none">
                        <polyline
                          points={c.sparkline.map((v, i) => {
                            const min = Math.min(...c.sparkline);
                            const max = Math.max(...c.sparkline);
                            const y = max > min ? 20 - ((v - min) / (max - min)) * 20 : 10;
                            return `${i},${y}`;
                          }).join(" ")}
                          fill="none"
                          stroke={up ? "#34d399" : "#f87171"}
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        </>)}

        {/* ── Footer ── */}
        <p className="text-center text-[10px] text-zinc-700 pt-4">
          {`Cotações via Yahoo Finance · Crypto via CoinGecko · Câmbio via ExchangeRate API · Indicadores via World Bank · Yields via Yahoo Finance`}
        </p>
      </div>
    </div>
  );
}

// ── Lightweight Charts (candlestick + volume + indicators) ──────────────

interface OhlcPoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Indicator = "sma20" | "sma50" | "ema20" | "bb" | "vol" | "macd" | "rsi";
type TimeRange = "1M" | "3M" | "6M" | "1A" | "2A" | "5A";

const TIME_RANGES: { key: TimeRange; label: string; range: string; interval: string }[] = [
  { key: "1M", label: "1M", range: "1mo", interval: "1d" },
  { key: "3M", label: "3M", range: "3mo", interval: "1d" },
  { key: "6M", label: "6M", range: "6mo", interval: "1d" },
  { key: "1A", label: "1A", range: "1y", interval: "1d" },
  { key: "2A", label: "2A", range: "2y", interval: "1wk" },
  { key: "5A", label: "5A", range: "5y", interval: "1wk" },
];

const INDICATORS: { key: Indicator; label: string }[] = [
  { key: "sma20", label: "SMA 20" },
  { key: "sma50", label: "SMA 50" },
  { key: "ema20", label: "EMA 20" },
  { key: "bb", label: "Bollinger" },
  { key: "vol", label: "Volume" },
  { key: "macd", label: "MACD" },
  { key: "rsi", label: "RSI" },
];

function computeSMA(data: OhlcPoint[], period: number): { time: string; value: number }[] {
  const result: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

function computeEMA(data: OhlcPoint[], period: number): { time: string; value: number }[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  const result: { time: string; value: number }[] = [{ time: data[period - 1].time, value: ema }];
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

function computeBollinger(data: OhlcPoint[], period = 20, mult = 2) {
  const upper: { time: string; value: number }[] = [];
  const lower: { time: string; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const mean = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (data[j].close - mean) ** 2;
    const std = Math.sqrt(sqSum / period);
    upper.push({ time: data[i].time, value: mean + mult * std });
    lower.push({ time: data[i].time, value: mean - mult * std });
  }
  return { upper, lower };
}

function computeMACD(data: OhlcPoint[], fast = 12, slow = 26, signal = 9) {
  const emaFast = computeEMA(data, fast);
  const emaSlow = computeEMA(data, slow);
  const slowStart = slow - fast;
  const macdLine: { time: string; value: number }[] = [];
  for (let i = 0; i < emaFast.length; i++) {
    if (i < slowStart) continue;
    const slowVal = emaSlow[i - slowStart];
    if (!slowVal) continue;
    macdLine.push({ time: emaFast[i].time, value: emaFast[i].value - slowVal.value });
  }
  const signalLine: { time: string; value: number }[] = [];
  if (macdLine.length >= signal) {
    const k = 2 / (signal + 1);
    let ema = 0;
    for (let i = 0; i < signal; i++) ema += macdLine[i].value;
    ema /= signal;
    signalLine.push({ time: macdLine[signal - 1].time, value: ema });
    for (let i = signal; i < macdLine.length; i++) {
      ema = macdLine[i].value * k + ema * (1 - k);
      signalLine.push({ time: macdLine[i].time, value: ema });
    }
  }
  const histogram: { time: string; value: number; color: string }[] = [];
  const signalStart = macdLine.length - signalLine.length;
  for (let i = 0; i < signalLine.length; i++) {
    const diff = macdLine[signalStart + i].value - signalLine[i].value;
    histogram.push({
      time: signalLine[i].time,
      value: diff,
      color: diff >= 0 ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
    });
  }
  return { macdLine: macdLine.slice(signalStart), signalLine, histogram };
}

function computeRSI(data: OhlcPoint[], period = 14): { time: string; value: number }[] {
  if (data.length < period + 1) return [];
  const result: { time: string; value: number }[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({ time: data[period].time, value: 100 - 100 / (1 + rs) });
  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    const r = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({ time: data[i].time, value: 100 - 100 / (1 + r) });
  }
  return result;
}

function CandlestickChart({ symbol, height }: { symbol: string; height: number }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null);
  const [ohlcData, setOhlcData] = useState<OhlcPoint[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("1A");
  const [activeIndicators, setActiveIndicators] = useState<Set<Indicator>>(new Set(["vol"]));
  const [crosshairData, setCrosshairData] = useState<OhlcPoint | null>(null);

  const hasSubPane = activeIndicators.has("macd") || activeIndicators.has("rsi");
  const subPaneCount = (activeIndicators.has("macd") ? 1 : 0) + (activeIndicators.has("rsi") ? 1 : 0);
  const totalHeight = height + subPaneCount * 120;

  const toggleIndicator = useCallback((ind: Indicator) => {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind); else next.add(ind);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    const cfg = TIME_RANGES.find(r => r.key === timeRange) ?? TIME_RANGES[3];
    fetch(`/api/bolsas/ohlc?symbol=${encodeURIComponent(symbol)}&range=${cfg.range}&interval=${cfg.interval}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.data) setOhlcData(d.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, timeRange]);

  useEffect(() => {
    if (!chartContainerRef.current || ohlcData.length === 0) return;

    let disposed = false;
    let chart: ReturnType<typeof import("lightweight-charts").createChart> | null = null;

    import("lightweight-charts").then((lc) => {
      if (disposed || !chartContainerRef.current) return;

      chartContainerRef.current.innerHTML = "";

      chart = lc.createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: totalHeight,
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor: "#71717a",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.03)" },
          horzLines: { color: "rgba(255,255,255,0.03)" },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: "rgba(255,255,255,0.15)", style: lc.LineStyle.Dashed, width: 1, labelBackgroundColor: "#2a2a3e" },
          horzLine: { color: "rgba(255,255,255,0.15)", style: lc.LineStyle.Dashed, width: 1, labelBackgroundColor: "#2a2a3e" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          scaleMargins: {
            top: 0.05,
            bottom: hasSubPane
              ? 0.02 + subPaneCount * (height > 0 ? (120 / totalHeight) : 0.15)
              : activeIndicators.has("vol") ? 0.25 : 0.05,
          },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: false,
        },
        handleScroll: { vertTouchDrag: false },
      });
      chartRef.current = chart;

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef444480",
        wickUpColor: "#22c55e80",
      });
      candleSeries.setData(ohlcData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })));

      if (activeIndicators.has("vol")) {
        const volSeries = chart.addSeries(lc.HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
        });
        const volBottom = hasSubPane ? 0.02 + subPaneCount * (120 / totalHeight) : 0;
        chart.priceScale("vol").applyOptions({
          scaleMargins: { top: hasSubPane ? 0.6 : 0.8, bottom: volBottom },
        });
        volSeries.setData(ohlcData.map(d => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
        })));
      }

      const lineOpts = (color: string, dashed = false) => ({
        color,
        lineWidth: 1 as const,
        priceLineVisible: false,
        lastValueVisible: false,
        ...(dashed ? { lineStyle: lc.LineStyle.Dashed } : {}),
      });

      if (activeIndicators.has("sma20")) {
        const s = chart.addSeries(lc.LineSeries, lineOpts("#3b82f6"));
        s.setData(computeSMA(ohlcData, 20));
      }
      if (activeIndicators.has("sma50")) {
        const s = chart.addSeries(lc.LineSeries, lineOpts("#f59e0b"));
        s.setData(computeSMA(ohlcData, 50));
      }
      if (activeIndicators.has("ema20")) {
        const s = chart.addSeries(lc.LineSeries, lineOpts("#a855f7"));
        s.setData(computeEMA(ohlcData, 20));
      }
      if (activeIndicators.has("bb")) {
        const bb = computeBollinger(ohlcData);
        const upperS = chart.addSeries(lc.LineSeries, lineOpts("rgba(6,182,212,0.5)", true));
        const lowerS = chart.addSeries(lc.LineSeries, lineOpts("rgba(6,182,212,0.5)", true));
        upperS.setData(bb.upper);
        lowerS.setData(bb.lower);
      }

      let subPaneBottom = 0;

      if (activeIndicators.has("macd")) {
        const macd = computeMACD(ohlcData);
        const paneH = 120 / totalHeight;
        const paneTop = 1 - paneH - subPaneBottom;
        subPaneBottom += paneH + 0.01;

        const macdHist = chart.addSeries(lc.HistogramSeries, {
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          priceScaleId: "macd",
        });
        chart.priceScale("macd").applyOptions({
          scaleMargins: { top: paneTop, bottom: subPaneBottom - paneH },
          borderVisible: false,
        });
        macdHist.setData(macd.histogram);

        const macdLine = chart.addSeries(lc.LineSeries, {
          color: "#3b82f6",
          lineWidth: 1 as const,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "macd",
        });
        macdLine.setData(macd.macdLine);

        const sigLine = chart.addSeries(lc.LineSeries, {
          color: "#f59e0b",
          lineWidth: 1 as const,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "macd",
        });
        sigLine.setData(macd.signalLine);
      }

      if (activeIndicators.has("rsi")) {
        const rsi = computeRSI(ohlcData);
        const paneH = 120 / totalHeight;
        const paneTop = 1 - paneH - subPaneBottom;
        subPaneBottom += paneH + 0.01;

        const rsiSeries = chart.addSeries(lc.LineSeries, {
          color: "#a855f7",
          lineWidth: 2 as const,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "rsi",
        });
        chart.priceScale("rsi").applyOptions({
          scaleMargins: { top: paneTop, bottom: subPaneBottom - paneH },
          borderVisible: false,
        });
        rsiSeries.setData(rsi);

        const overbought = chart.addSeries(lc.LineSeries, {
          color: "rgba(239,68,68,0.3)",
          lineWidth: 1 as const,
          lineStyle: lc.LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "rsi",
        });
        overbought.setData(rsi.map(p => ({ time: p.time, value: 70 })));

        const oversold = chart.addSeries(lc.LineSeries, {
          color: "rgba(34,197,94,0.3)",
          lineWidth: 1 as const,
          lineStyle: lc.LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "rsi",
        });
        oversold.setData(rsi.map(p => ({ time: p.time, value: 30 })));
      }

      chart.subscribeCrosshairMove((param) => {
        if (!param.time) { setCrosshairData(null); return; }
        const timeStr = String(param.time);
        const pt = ohlcData.find(d => d.time === timeStr);
        setCrosshairData(pt ?? null);
      });

      chart.timeScale().fitContent();

      const el = chartContainerRef.current;
      const resizeObserver = new ResizeObserver(entries => {
        if (chart && entries[0]) {
          chart.applyOptions({ width: entries[0].contentRect.width });
        }
      });
      resizeObserver.observe(el);

      return () => { resizeObserver.disconnect(); };
    });

    return () => {
      disposed = true;
      if (chart) { chart.remove(); chartRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ohlcData, height, totalHeight, activeIndicators]);

  const last = ohlcData.length > 0 ? ohlcData[ohlcData.length - 1] : null;
  const display = crosshairData ?? last;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap border-b border-white/[0.04]">
        {/* Time ranges */}
        <div className="flex gap-1">
          {TIME_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              className="text-[10px] px-2 py-1 rounded transition-colors"
              style={{
                background: timeRange === r.key ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)",
                color: timeRange === r.key ? "#3b82f6" : "#71717a",
                border: `1px solid ${timeRange === r.key ? "rgba(59,130,246,0.3)" : "transparent"}`,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Indicators */}
        <div className="flex gap-1 flex-wrap">
          {INDICATORS.map(ind => {
            const active = activeIndicators.has(ind.key);
            const colors: Record<Indicator, string> = {
              sma20: "#3b82f6", sma50: "#f59e0b", ema20: "#a855f7", bb: "#06b6d4", vol: "#71717a", macd: "#f97316", rsi: "#a855f7",
            };
            const c = colors[ind.key];
            return (
              <button
                key={ind.key}
                onClick={() => toggleIndicator(ind.key)}
                className="text-[9px] px-2 py-0.5 rounded-full transition-all"
                style={{
                  background: active ? `${c}20` : "rgba(255,255,255,0.03)",
                  color: active ? c : "#52525b",
                  border: `1px solid ${active ? `${c}40` : "rgba(255,255,255,0.05)"}`,
                }}
              >
                {ind.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* OHLC values bar */}
      {display && (
        <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] border-b border-white/[0.04] flex-wrap">
          <span className="text-zinc-500">O <span className="text-zinc-300 font-mono">{fmtPrice(display.open)}</span></span>
          <span className="text-zinc-500">H <span className="text-emerald-400 font-mono">{fmtPrice(display.high)}</span></span>
          <span className="text-zinc-500">L <span className="text-red-400 font-mono">{fmtPrice(display.low)}</span></span>
          <span className="text-zinc-500">C <span className={`font-mono font-semibold ${display.close >= display.open ? "text-emerald-400" : "text-red-400"}`}>{fmtPrice(display.close)}</span></span>
          {display.volume > 0 && (
            <span className="text-zinc-600">Vol <span className="text-zinc-400 font-mono">
              {display.volume >= 1e9 ? `${(display.volume / 1e9).toFixed(1)}B` :
               display.volume >= 1e6 ? `${(display.volume / 1e6).toFixed(1)}M` :
               display.volume >= 1e3 ? `${(display.volume / 1e3).toFixed(0)}K` :
               display.volume.toFixed(0)}
            </span></span>
          )}
        </div>
      )}

      {/* Chart */}
      {dataLoading ? (
        <div className="flex items-center justify-center text-[11px] text-zinc-500 animate-pulse" style={{ height: totalHeight }}>
          Carregando dados...
        </div>
      ) : ohlcData.length === 0 ? (
        <div className="flex items-center justify-center text-[11px] text-zinc-600" style={{ height: totalHeight }}>
          Dados indisponíveis para este índice
        </div>
      ) : (
        <div ref={chartContainerRef} style={{ height: totalHeight }} />
      )}

      {/* Legend */}
      {activeIndicators.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 flex-wrap">
          {activeIndicators.has("sma20") && <span className="text-[9px] flex items-center gap-1 text-zinc-400"><span className="w-3 h-0.5 rounded" style={{ background: "#3b82f6" }} />SMA 20</span>}
          {activeIndicators.has("sma50") && <span className="text-[9px] flex items-center gap-1 text-zinc-400"><span className="w-3 h-0.5 rounded" style={{ background: "#f59e0b" }} />SMA 50</span>}
          {activeIndicators.has("ema20") && <span className="text-[9px] flex items-center gap-1 text-zinc-400"><span className="w-3 h-0.5 rounded" style={{ background: "#a855f7" }} />EMA 20</span>}
          {activeIndicators.has("bb") && <span className="text-[9px] flex items-center gap-1 text-zinc-400"><span className="w-3 h-0.5 rounded" style={{ background: "#06b6d4" }} />Bollinger</span>}
          {activeIndicators.has("macd") && <span className="text-[9px] flex items-center gap-1 text-zinc-400"><span className="w-3 h-0.5 rounded" style={{ background: "#f97316" }} />MACD (12,26,9)</span>}
          {activeIndicators.has("rsi") && <span className="text-[9px] flex items-center gap-1 text-zinc-400"><span className="w-3 h-0.5 rounded" style={{ background: "#a855f7" }} />RSI 14</span>}
        </div>
      )}
    </div>
  );
}

// ── Sector Treemap ────────────────────────────────────────────────────────

interface SectorItem {
  name: string;
  weight: number;
  changePct: number;
  ticker: string;
}

interface TreemapRect extends SectorItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutTreemap(items: SectorItem[], width: number, height: number): TreemapRect[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  function split(list: SectorItem[], x: number, y: number, w: number, h: number): TreemapRect[] {
    if (list.length === 0) return [];
    if (list.length === 1) return [{ ...list[0], x, y, w, h }];

    const total = list.reduce((s, i) => s + i.weight, 0);
    let acc = 0;
    let splitIdx = 0;
    const half = total / 2;
    for (let i = 0; i < list.length - 1; i++) {
      acc += list[i].weight;
      if (acc >= half) { splitIdx = i; break; }
    }

    const left = list.slice(0, splitIdx + 1);
    const right = list.slice(splitIdx + 1);
    const leftW = left.reduce((s, i) => s + i.weight, 0);
    const ratio = leftW / total;

    if (w >= h) {
      return [
        ...split(left, x, y, w * ratio, h),
        ...split(right, x + w * ratio, y, w * (1 - ratio), h),
      ];
    }
    return [
      ...split(left, x, y, w, h * ratio),
      ...split(right, x, y + h * ratio, w, h * (1 - ratio)),
    ];
  }

  return split(sorted, 0, 0, width, height);
}

function SectorTreemap({ symbol, indexName }: { symbol: string; indexName: string }) {
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [isRegional, setIsRegional] = useState(false);
  const [tmExpanded, setTmExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(600);
  const treemapH = 280;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/bolsas/sectors?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (!d.available || !d.sectors?.length) { setAvailable(false); setSectors([]); }
        else {
          setAvailable(true);
          setSectors(d.sectors);
          setIsRegional(!!d.regional);
        }
      })
      .catch(() => { if (!cancelled) setAvailable(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      if (entries[0]) setContainerW(entries[0].contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [tmExpanded]);

  const rects = useMemo(() => layoutTreemap(sectors, containerW, treemapH), [sectors, containerW, treemapH]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[11px] text-zinc-500 animate-pulse">
        Carregando composição setorial...
      </div>
    );
  }

  if (!available || sectors.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setTmExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all hover:bg-white/[0.03]"
        style={{
          background: tmExpanded ? "rgba(255,255,255,0.03)" : "transparent",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Flame size={13} className="text-orange-400" />
        <span className="text-[11px] font-semibold text-zinc-300">
          Setores — {indexName}
        </span>
        {isRegional && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            proxy regional
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-zinc-500 ml-auto transition-transform duration-200 ${tmExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {tmExpanded && (
        <>
          <div className="flex items-center justify-end px-1 mt-1 mb-1">
            <span className="text-[9px] text-zinc-600">tamanho = peso no índice · cor = variação do dia</span>
          </div>
          <div
            ref={containerRef}
            className="relative rounded-xl overflow-hidden"
            style={{ height: treemapH, background: "rgba(5,7,14,0.6)" }}
          >
            {rects.map((r, i) => {
              const color = heatColor(r.changePct);
              const isSmall = r.w < 60 || r.h < 40;
              const isTiny = r.w < 40 || r.h < 30;
              return (
                <div
                  key={i}
                  className="absolute flex flex-col items-center justify-center text-center transition-all group"
                  style={{
                    left: r.x,
                    top: r.y,
                    width: r.w,
                    height: r.h,
                    background: `${color}38`,
                    border: `1px solid ${color}55`,
                    padding: 3,
                  }}
                  title={`${r.name}: ${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}% · ${r.weight}% do índice`}
                >
                  {!isTiny && (
                    <>
                      <span
                        className="font-extrabold leading-tight truncate w-full"
                        style={{
                          fontSize: isSmall ? 10 : r.w > 120 ? 15 : 12,
                          color: "#fff",
                          textShadow: `0 0 8px ${color}, 0 1px 4px rgba(0,0,0,0.9)`,
                        }}
                      >
                        {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(2)}%
                      </span>
                      <span
                        className="truncate w-full leading-tight font-semibold"
                        style={{
                          fontSize: isSmall ? 8 : r.w > 120 ? 11 : 9,
                          color: "rgba(255,255,255,0.85)",
                          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                        }}
                      >
                        {r.name}
                      </span>
                      {!isSmall && (
                        <span className="text-[8px] truncate w-full" style={{ color: "rgba(255,255,255,0.5)" }}>
                          {r.weight}% · {r.ticker}
                        </span>
                      )}
                    </>
                  )}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded"
                    style={{ background: "rgba(0,0,0,0.88)" }}
                  >
                    <span className="text-[11px] font-bold text-white">{r.name}</span>
                    <span className="text-[13px] font-extrabold" style={{ color }}>
                      {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(2)}%
                    </span>
                    <span className="text-[9px] text-zinc-300">{r.weight}% do índice</span>
                    <span className="text-[8px] text-zinc-400">{r.ticker}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Top Constituents (expandable) ─────────────────────────────────────────

interface ConstituentItem {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
}

function TopConstituents({ symbol, indexName, onSelectStock }: {
  symbol: string;
  indexName: string;
  onSelectStock: (ticker: string, name: string, price: number, changePct: number, currency: string) => void;
}) {
  const [constituents, setConstituents] = useState<ConstituentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setFetched(false);
    setConstituents([]);
    setAvailable(true);
  }, [symbol]);

  const handleToggle = useCallback(() => {
    if (!fetched) {
      setLoading(true);
      fetch(`/api/bolsas/constituents?symbol=${encodeURIComponent(symbol)}`)
        .then(r => r.json())
        .then(d => {
          setFetched(true);
          if (!d.available || !d.constituents?.length) {
            setAvailable(false);
          } else {
            setConstituents(d.constituents);
            setAvailable(true);
          }
        })
        .catch(() => { setAvailable(false); setFetched(true); })
        .finally(() => setLoading(false));
    }
    setExpanded(e => !e);
  }, [symbol, fetched]);

  return (
    <div className="mt-3">
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all hover:bg-white/[0.03]"
        style={{
          background: expanded ? "rgba(255,255,255,0.03)" : "transparent",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Crown size={13} className="text-amber-400" />
        <span className="text-[11px] font-semibold text-zinc-300">
          Top 20 ações — {indexName}
        </span>
        <ChevronDown
          size={14}
          className={`text-zinc-500 ml-auto transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div
          className="mt-1 rounded-xl overflow-hidden"
          style={{
            background: "rgba(5,7,14,0.5)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[11px] text-zinc-500 animate-pulse">
              Carregando ações...
            </div>
          ) : !available || constituents.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-[11px] text-zinc-600">
              Dados de constituintes não disponíveis
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/30">
              {constituents.map((c, i) => {
                const up = c.changePct >= 0;
                const barW = Math.min(Math.abs(c.changePct) / 5 * 100, 100);
                return (
                  <div
                    key={c.ticker}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.04] transition-colors cursor-pointer"
                    onClick={() => onSelectStock(c.ticker, c.name, c.price, c.changePct, c.currency)}
                  >
                    <span className="text-[10px] text-zinc-600 w-5 text-right font-mono">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-zinc-200 truncate">{c.name}</span>
                        <span className="text-[9px] text-zinc-600 shrink-0">{c.ticker}</span>
                      </div>
                      <div className="mt-0.5 h-1 rounded-full overflow-hidden bg-zinc-800/50 max-w-[120px]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(barW, 2)}%`,
                            background: up
                              ? "linear-gradient(90deg, rgba(34,197,94,0.3), rgba(34,197,94,0.7))"
                              : "linear-gradient(90deg, rgba(239,68,68,0.3), rgba(239,68,68,0.7))",
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400 shrink-0">
                      {fmtPrice(c.price)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 w-20 justify-end">
                      {up
                        ? <TrendingUp size={10} className="text-emerald-400" />
                        : <TrendingDown size={10} className="text-red-400" />}
                      <span className={`text-[11px] font-bold font-mono ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {up ? "+" : ""}{c.changePct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Index Thermometer (dynamic — updates when user selects an index) ─────

function IndexThermometer({ index, vix, periods, breadth, historyLoading, isDefault, isCustom, expanded, onToggleExpand, onSelectStock, onClearCustom, parentIndex }: {
  index: IndexData;
  vix: IndexData | null;
  periods: Record<PeriodKey, number | null> | null;
  breadth: { up: number; down: number; total: number };
  historyLoading: boolean;
  isDefault: boolean;
  isCustom: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectStock: (ticker: string, name: string, price: number, changePct: number, currency: string) => void;
  onClearCustom: () => void;
  parentIndex: IndexData | null;
}) {
  const isUp = index.changePct >= 0;
  const [tickerSearch, setTickerSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const ticker = tickerSearch.trim().toUpperCase();
    if (!ticker) return;
    setSearchLoading(true);
    fetch(`/api/bolsas/ohlc?symbol=${encodeURIComponent(ticker)}&range=5d&interval=1d`)
      .then(r => r.json())
      .then(d => {
        if (d.data && d.data.length > 0) {
          const last = d.data[d.data.length - 1];
          const prev = d.data.length > 1 ? d.data[d.data.length - 2] : last;
          const pct = prev.close > 0 ? ((last.close / prev.close) - 1) * 100 : 0;
          onSelectStock(ticker, ticker, last.close, pct, "");
          setTickerSearch("");
        }
      })
      .catch(() => {})
      .finally(() => setSearchLoading(false));
  }, [tickerSearch, onSelectStock]);

  const tone = useMemo(() => {
    if (index.changePct > 0.5) return { color: "#34d399", bg: "rgba(16,185,129,0.12)" };
    if (index.changePct < -0.5) return { color: "#f87171", bg: "rgba(239,68,68,0.12)" };
    return { color: "#fbbf24", bg: "rgba(245,158,11,0.12)" };
  }, [index.changePct]);

  const [ohlcStats, setOhlcStats] = useState<{
    dayOpen: number; dayHigh: number; dayLow: number;
    week52High: number; week52Low: number; avgVol: number;
  } | null>(null);

  useEffect(() => {
    setOhlcStats(null);
    fetch(`/api/bolsas/ohlc?symbol=${encodeURIComponent(index.symbol)}&range=1y&interval=1d`)
      .then(r => r.json())
      .then(d => {
        if (!d.data || d.data.length < 2) return;
        const pts: OhlcPoint[] = d.data;
        const last = pts[pts.length - 1];
        let high52 = -Infinity, low52 = Infinity, volSum = 0;
        for (const p of pts) {
          if (p.high > high52) high52 = p.high;
          if (p.low < low52) low52 = p.low;
          volSum += p.volume;
        }
        setOhlcStats({
          dayOpen: last.open, dayHigh: last.high, dayLow: last.low,
          week52High: high52, week52Low: low52,
          avgVol: volSum / pts.length,
        });
      })
      .catch(() => {});
  }, [index.symbol]);

  const [profileDesc, setProfileDesc] = useState<string | null>(null);
  useEffect(() => {
    setProfileDesc(null);
    fetch(`/api/bolsas/profile?symbol=${encodeURIComponent(index.symbol)}`)
      .then(r => r.json())
      .then(d => { if (d.description) setProfileDesc(d.description); })
      .catch(() => {});
  }, [index.symbol]);

  interface YieldPt { label: string; maturity: number; yield: number; change: number }
  const [yields, setYields] = useState<YieldPt[]>([]);
  const [yieldSpread, setYieldSpread] = useState<number | null>(null);

  useEffect(() => {
    if (index.country !== "EUA") { setYields([]); return; }
    fetch("/api/bolsas/yields")
      .then(r => r.json())
      .then(d => {
        if (d.yields) setYields(d.yields);
        if (d.spread10Y2Y != null) setYieldSpread(d.spread10Y2Y);
      })
      .catch(() => {});
  }, [index.country]);

  interface CountryIndicator { id: string; label: string; format: string; value: number; year: number }
  const [countryTeUrl, setCountryTeUrl] = useState<string | null>(null);
  const [countryIndicators, setCountryIndicators] = useState<CountryIndicator[]>([]);
  const [countryCurrency, setCountryCurrency] = useState<string | null>(null);
  const [countryFx, setCountryFx] = useState<{ vsUSD: number | null; vsBRL: number | null } | null>(null);
  const [countryLoading, setCountryLoading] = useState(false);

  useEffect(() => {
    if (isCustom || !index.country) { setCountryTeUrl(null); setCountryIndicators([]); setCountryFx(null); return; }
    setCountryTeUrl(null);
    setCountryIndicators([]);
    setCountryFx(null);
    setCountryLoading(true);
    fetch(`/api/bolsas/country?country=${encodeURIComponent(index.country)}`)
      .then(r => r.json())
      .then(d => {
        setCountryTeUrl(d.teUrl ?? null);
        setCountryIndicators(d.indicators ?? []);
        setCountryCurrency(d.currency ?? null);
        setCountryFx(d.exchangeRate ?? null);
      })
      .catch(() => { setCountryTeUrl(null); setCountryIndicators([]); setCountryFx(null); })
      .finally(() => setCountryLoading(false));
  }, [index.country, isCustom]);

  return (
    <div
      className="rounded-2xl p-5 md:p-7 transition-all duration-300 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, rgba(13,14,20,0.95) 0%, ${tone.color}08 100%)`,
        border: `1px solid ${tone.color}30`,
        boxShadow: `0 4px 40px ${tone.color}12, 0 0 0 1px rgba(255,255,255,0.03) inset`,
      }}
    >
      {/* Subtle accent bar at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${tone.color}, transparent)` }} />

      {/* Header */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {isCustom && (
          <button
            onClick={onClearCustom}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Voltar ao índice"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <Activity size={18} style={{ color: tone.color }} />
        <h2 className="text-base md:text-lg font-bold text-zinc-100">
          {isDefault ? "Panorama de Mercado" : isCustom ? (
            <span className="flex items-center gap-2">
              <span>{index.name}</span>
              {parentIndex && (
                <span className="text-[10px] text-zinc-500 font-normal">
                  via {parentIndex.flag} {parentIndex.name}
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span>{index.flag}</span>
              <span>{index.name}</span>
              <span className="text-[10px] text-zinc-500 font-normal">({index.country})</span>
            </span>
          )}
        </h2>

        {/* External links */}
        <div className="flex items-center gap-2">
          <a
            href={`https://finance.yahoo.com/quote/${encodeURIComponent(index.symbol)}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors bg-purple-500/15 text-purple-400 border border-purple-500/25 hover:bg-purple-500/25"
          >
            <ExternalLink size={11} />
            Yahoo Finance
          </a>
          {countryTeUrl && (
            <a
              href={countryTeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-colors bg-cyan-500/15 text-cyan-400 border border-cyan-500/25 hover:bg-cyan-500/25"
            >
              <Globe2 size={11} />
              Trading Economics
            </a>
          )}
        </div>

        {/* Search box */}
        <form onSubmit={handleSearchSubmit} className="ml-auto flex items-center gap-1">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Buscar ticker..."
              value={tickerSearch}
              onChange={e => setTickerSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[11px] rounded-lg bg-zinc-900/70 border border-zinc-700/50 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-32 md:w-40"
            />
          </div>
          <button
            type="submit"
            disabled={searchLoading || !tickerSearch.trim()}
            className="text-[10px] px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-40 font-semibold"
          >
            {searchLoading ? "..." : "Ir"}
          </button>
        </form>
      </div>

      {/* Main price + key metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
        {/* Col 1: Price hero */}
        <div className="lg:col-span-4 flex flex-col justify-center gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold"
                style={{ background: `${tone.color}18`, color: tone.color, border: `1px solid ${tone.color}30` }}
              >
                {index.symbol.replace("^", "")}
              </span>
              {index.currency && <span className="text-[9px] text-zinc-500">{index.currency}</span>}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-white tracking-tight">{fmtPrice(index.price)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-base font-bold flex items-center gap-1 ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUp ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {isUp ? "+" : ""}{index.changePct.toFixed(2)}%
              </span>
              <span className={`text-xs ${isUp ? "text-emerald-400/60" : "text-red-400/60"}`}>
                ({isUp ? "+" : ""}{fmtPrice(Math.abs(index.change))})
              </span>
            </div>
            {profileDesc && (
              <p className="text-[11px] text-zinc-400 leading-relaxed mt-2 line-clamp-3">
                {profileDesc}
              </p>
            )}
          </div>

          {/* Day + 52w stats */}
          {ohlcStats && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[8px] text-zinc-500 uppercase">Abertura</p>
                  <p className="text-[11px] font-bold text-zinc-200 font-mono">{fmtPrice(ohlcStats.dayOpen)}</p>
                </div>
                <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[8px] text-zinc-500 uppercase">Vol. médio</p>
                  <p className="text-[11px] font-bold text-zinc-200 font-mono">
                    {ohlcStats.avgVol >= 1e9 ? `${(ohlcStats.avgVol / 1e9).toFixed(1)}B` :
                     ohlcStats.avgVol >= 1e6 ? `${(ohlcStats.avgVol / 1e6).toFixed(1)}M` :
                     ohlcStats.avgVol >= 1e3 ? `${(ohlcStats.avgVol / 1e3).toFixed(0)}K` :
                     ohlcStats.avgVol.toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Day range bar */}
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-zinc-500 uppercase">Range do dia</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-red-400 font-mono shrink-0">{fmtPrice(ohlcStats.dayLow)}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-800 relative">
                    <div
                      className="absolute h-full rounded-full"
                      style={{
                        left: "0%",
                        width: ohlcStats.dayHigh > ohlcStats.dayLow
                          ? `${((index.price - ohlcStats.dayLow) / (ohlcStats.dayHigh - ohlcStats.dayLow)) * 100}%`
                          : "50%",
                        background: `linear-gradient(90deg, #ef4444, #fbbf24, #22c55e)`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-emerald-400 font-mono shrink-0">{fmtPrice(ohlcStats.dayHigh)}</span>
                </div>
              </div>

              {/* 52-week range bar */}
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-zinc-500 uppercase">Range 52 semanas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-red-400 font-mono shrink-0">{fmtPrice(ohlcStats.week52Low)}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-zinc-800 relative">
                    <div
                      className="absolute h-full rounded-full"
                      style={{
                        left: "0%",
                        width: ohlcStats.week52High > ohlcStats.week52Low
                          ? `${((index.price - ohlcStats.week52Low) / (ohlcStats.week52High - ohlcStats.week52Low)) * 100}%`
                          : "50%",
                        background: `linear-gradient(90deg, #ef4444, #fbbf24, #22c55e)`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-emerald-400 font-mono shrink-0">{fmtPrice(ohlcStats.week52High)}</span>
                </div>
              </div>
            </div>
          )}

          {vix && isDefault && (
            <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[8px] text-zinc-500 uppercase mb-1">VIX — Medo &amp; Ganância</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-lg font-bold text-zinc-100">{vix.price.toFixed(2)}</span>
                <span className={`text-xs font-semibold ${vix.changePct >= 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {vix.changePct >= 0 ? "+" : ""}{vix.changePct.toFixed(2)}%
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  vix.price < 15 ? "bg-emerald-500/15 text-emerald-400" :
                  vix.price < 20 ? "bg-emerald-500/10 text-emerald-300" :
                  vix.price < 25 ? "bg-yellow-500/15 text-yellow-400" :
                  vix.price < 30 ? "bg-orange-500/15 text-orange-400" :
                  "bg-red-500/15 text-red-400"
                }`}>
                  {vix.price < 15 ? "Calmo" :
                   vix.price < 20 ? "Baixo" :
                   vix.price < 25 ? "Moderado" :
                   vix.price < 30 ? "Elevado" :
                   "Pânico"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Col 2: Periods */}
        <div className="lg:col-span-8 flex flex-col justify-center">
          {historyLoading ? (
            <div className="text-[11px] text-zinc-500 text-center animate-pulse">
              Carregando períodos...
            </div>
          ) : periods ? (
            <>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 font-semibold">{index.name} — Rentabilidade</p>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {ALL_PERIODS.map(p => {
                  const v = periods[p];
                  if (v == null) return null;
                  const up = v >= 0;
                  return (
                    <div
                      key={p}
                      className="rounded-lg px-2 py-2.5 text-center"
                      style={{
                        background: up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        border: `1px solid ${up ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                      }}
                    >
                      <p className="text-[9px] text-zinc-300 uppercase font-bold tracking-wide">{PERIOD_LABELS[p]}</p>
                      <p className={`text-sm font-extrabold font-mono mt-0.5 ${up ? "text-emerald-400" : "text-red-400"}`}>
                        {up ? "+" : ""}{v.toFixed(1)}%
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-zinc-600 text-center">
              Dados de períodos indisponíveis
            </div>
          )}

          {/* Breadth bar for default */}
          {isDefault && (
            <div className="mt-3 rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[8px] text-zinc-500 uppercase font-semibold">Breadth do mercado</span>
                <span className="text-[9px] text-zinc-400">{breadth.up} em alta · {breadth.down} em queda</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
                <div
                  className="h-full rounded-l-full"
                  style={{ width: `${(breadth.up / breadth.total) * 100}%`, background: "linear-gradient(90deg, #22c55e, #4ade80)" }}
                />
                <div
                  className="h-full rounded-r-full"
                  style={{ width: `${(breadth.down / breadth.total) * 100}%`, background: "linear-gradient(90deg, #f87171, #ef4444)" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* US Treasury Yield Curve */}
      {yields.length >= 3 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(5,7,14,0.5)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
            <span className="text-[10px] text-zinc-500 flex items-center gap-1.5 uppercase font-semibold tracking-wider">
              <Activity size={11} />
              Curva de Juros — US Treasury
            </span>
            {yieldSpread != null && (
              <span className={`text-[10px] font-semibold ${yieldSpread >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Spread 10Y-2Y: {yieldSpread >= 0 ? "+" : ""}{yieldSpread.toFixed(3)}
                {yieldSpread < 0 && <span className="text-red-400/60 ml-1">(invertida)</span>}
              </span>
            )}
          </div>
          <div className="px-4 py-4">
            <div className="flex items-end gap-1 h-28">
              {yields.map((y, i) => {
                const maxY = Math.max(...yields.map(yy => yy.yield), 0.1);
                const h = (y.yield / maxY) * 100;
                const up = y.change >= 0;
                return (
                  <div key={y.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[9px] font-bold font-mono ${up ? "text-red-400" : "text-emerald-400"}`}>
                      {y.yield.toFixed(2)}%
                    </span>
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${Math.max(h, 8)}%`,
                        background: i === 0 ? "rgba(59,130,246,0.5)" :
                          i === yields.length - 1 ? "rgba(168,85,247,0.5)" :
                          "rgba(99,102,241,0.5)",
                        border: `1px solid ${i === 0 ? "rgba(59,130,246,0.3)" : i === yields.length - 1 ? "rgba(168,85,247,0.3)" : "rgba(99,102,241,0.3)"}`,
                      }}
                    />
                    <span className="text-[9px] text-zinc-500 font-semibold">{y.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-[8px] text-zinc-600">Curto prazo</span>
              <span className="text-[8px] text-zinc-600">Longo prazo</span>
            </div>
          </div>
        </div>
      )}

      {/* Candlestick Chart */}
      <div className="rounded-xl overflow-hidden" style={{ background: "rgba(5,7,14,0.5)", border: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
          <span className="text-[10px] text-zinc-500 flex items-center gap-1.5">
            <BarChart3 size={11} />
            {index.flag} {index.name}
          </span>
          <button
            onClick={onToggleExpand}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            <Maximize size={10} />
            {expanded ? "Recolher" : "Expandir"}
          </button>
        </div>
        <CandlestickChart
          symbol={index.symbol}
          height={expanded ? 600 : 400}
        />
      </div>

      {/* Country Economic Indicators */}
      {!isCustom && countryIndicators.length > 0 && (
        <div className="mt-5 rounded-xl overflow-hidden" style={{ background: "rgba(5,7,14,0.5)", border: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.04]">
            <span className="text-[10px] text-zinc-500 flex items-center gap-1.5 uppercase font-semibold tracking-wider">
              <Landmark size={11} />
              {index.flag} Indicadores Econômicos — {index.country}
            </span>
            {countryTeUrl && (
              <a
                href={`${countryTeUrl}/indicators`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
              >
                Mais no Trading Economics <ExternalLink size={9} />
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.02]">
            {countryCurrency && countryFx && countryCurrency !== "USD" && countryFx.vsUSD && (
              <div className="px-3 py-3" style={{ background: "rgba(5,7,14,0.8)" }}>
                <p className="text-[8px] text-zinc-500 uppercase font-semibold mb-1">
                  <DollarSign size={8} className="inline" /> Câmbio ({countryCurrency}/USD)
                </p>
                <p className="text-sm font-bold text-zinc-100 font-mono">{countryFx.vsUSD.toFixed(countryFx.vsUSD >= 100 ? 0 : countryFx.vsUSD >= 1 ? 2 : 4)}</p>
                {countryFx.vsBRL && (
                  <p className="text-[8px] text-zinc-500 mt-0.5">{countryCurrency}/BRL: {countryFx.vsBRL.toFixed(countryFx.vsBRL >= 100 ? 0 : countryFx.vsBRL >= 1 ? 2 : 4)}</p>
                )}
              </div>
            )}
            {countryIndicators.map(ind => (
              <div key={ind.id} className="px-3 py-3" style={{ background: "rgba(5,7,14,0.8)" }}>
                <p className="text-[8px] text-zinc-500 uppercase font-semibold mb-1">{ind.label}</p>
                <p className="text-sm font-bold text-zinc-100 font-mono">
                  {ind.format === "usd"
                    ? ind.value >= 1e12 ? `$${(ind.value / 1e12).toFixed(2)}T`
                      : ind.value >= 1e9 ? `$${(ind.value / 1e9).toFixed(1)}B`
                      : `$${(ind.value / 1e6).toFixed(0)}M`
                    : ind.format === "pct"
                    ? `${ind.value.toFixed(1)}%`
                    : ind.format === "num"
                    ? ind.value >= 1e9 ? `${(ind.value / 1e9).toFixed(1)}B`
                      : ind.value >= 1e6 ? `${(ind.value / 1e6).toFixed(1)}M`
                      : ind.value.toLocaleString("pt-BR")
                    : ind.value.toFixed(2)}
                </p>
                {ind.year && <p className="text-[8px] text-zinc-600 mt-0.5">{ind.year}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!isCustom && countryLoading && (
        <div className="mt-5 flex items-center gap-2 text-[11px] text-zinc-500 animate-pulse px-2">
          <Landmark size={12} /> Carregando indicadores econômicos...
        </div>
      )}

      {/* Sector Treemap — only for indices, not custom stocks */}
      {!isCustom && <SectorTreemap symbol={index.symbol} indexName={index.name} />}

      {/* Top Constituents — only for indices */}
      {!isCustom && (
        <TopConstituents
          symbol={index.symbol}
          indexName={index.name}
          onSelectStock={onSelectStock}
        />
      )}
    </div>
  );
}

// ── Helpers & Sub-components ──────────────────────────────────────────────

function SummaryCard({ label, value, sub, subColor, icon }: {
  label: string; value: string; sub?: string; subColor?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4 transition-transform hover:scale-[1.02]"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-bold text-zinc-100 truncate">{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${subColor ?? "text-zinc-500"}`}>{sub}</p>}
    </div>
  );
}

function DetailBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function SortHeader({ label, colSpan, sortKey: sk, current, asc, onClick }: {
  label: string; colSpan: number; sortKey: SortKey;
  current: SortKey; asc: boolean; onClick: (k: SortKey) => void;
}) {
  const active = current === sk;
  return (
    <button
      className="text-left flex items-center gap-1 hover:text-zinc-400 transition-colors"
      style={{ gridColumn: `span ${colSpan}` }}
      onClick={() => onClick(sk)}
    >
      {label}
      {active && <ArrowUpDown size={9} className={asc ? "rotate-180" : ""} />}
    </button>
  );
}

function ChangeBar({ title, indices, color }: {
  title: string; indices: IndexData[]; color: string;
}) {
  if (indices.length === 0) return null;
  const maxAbs = Math.max(...indices.map(x => Math.abs(x.changePct)), 0.01);
  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <h3 className="text-xs font-semibold text-zinc-300 mb-3">{title}</h3>
      <div className="space-y-2">
        {indices.map(idx => {
          const width = (Math.abs(idx.changePct) / maxAbs) * 100;
          return (
            <div key={idx.symbol} className="flex items-center gap-2">
              <span className="text-sm w-6">{idx.flag}</span>
              <span className="text-[11px] font-semibold text-zinc-300 w-28 truncate">{idx.name}</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden bg-zinc-900/50 relative">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(width, 2)}%`,
                    background: `linear-gradient(90deg, ${color}40, ${color})`,
                  }}
                />
              </div>
              <span className="text-[11px] font-mono font-semibold w-16 text-right" style={{ color }}>
                {idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── IndexTableSection ─────────────────────────────────────────────────────

function IndexTableSection({ filtered, search, setSearch, sortKey, sortAsc, handleSort, selectedIndex, setSelectedIndex, setHoveredIndex }: {
  filtered: IndexData[];
  search: string;
  setSearch: (s: string) => void;
  sortKey: SortKey;
  sortAsc: boolean;
  handleSort: (k: SortKey) => void;
  selectedIndex: IndexData | null;
  setSelectedIndex: (i: IndexData | null) => void;
  setHoveredIndex: (s: string | null) => void;
}) {
  return (
    <div
      className="rounded-2xl p-4 md:p-6"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <ArrowUpDown size={16} className="text-amber-400" />
          Todos os {"Índices"}
        </h2>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            type="text"
            placeholder="Buscar bolsa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900/50 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
          />
        </div>
      </div>

      <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-800/50">
        <SortHeader label={"Índice"} colSpan={4} sortKey="name" current={sortKey} asc={sortAsc} onClick={handleSort} />
        <SortHeader label="Região" colSpan={2} sortKey="region" current={sortKey} asc={sortAsc} onClick={handleSort} />
        <SortHeader label="Preço" colSpan={3} sortKey="price" current={sortKey} asc={sortAsc} onClick={handleSort} />
        <SortHeader label="Variação" colSpan={3} sortKey="changePct" current={sortKey} asc={sortAsc} onClick={handleSort} />
      </div>

      <div className="divide-y divide-zinc-800/30">
        {filtered.map(idx => {
          const isUp = idx.changePct >= 0;
          const regionColor = REGION_COLORS[idx.region] ?? "#888";
          return (
            <div
              key={idx.symbol}
              className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-white/[0.02] transition-colors cursor-pointer rounded-lg"
              onMouseEnter={() => setHoveredIndex(idx.symbol)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => setSelectedIndex(selectedIndex?.symbol === idx.symbol ? null : idx)}
              style={{ background: selectedIndex?.symbol === idx.symbol ? "rgba(255,255,255,0.03)" : undefined }}
            >
              <div className="col-span-6 md:col-span-4 flex items-center gap-2">
                <span className="text-lg">{idx.flag}</span>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">{idx.name}</p>
                  <p className="text-[10px] text-zinc-500">{idx.country}</p>
                </div>
              </div>
              <div className="col-span-2 hidden md:flex items-center">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${regionColor}18`, color: regionColor }}>
                  {idx.region}
                </span>
              </div>
              <div className="col-span-3 md:col-span-3">
                <p className="text-xs font-mono text-zinc-300">{fmtPrice(idx.price)}</p>
                <p className="text-[9px] text-zinc-600 md:hidden">{idx.currency}</p>
              </div>
              <div className="col-span-3 flex items-center gap-1 justify-end md:justify-start">
                {isUp
                  ? <TrendingUp size={11} className="text-emerald-400 shrink-0" />
                  : <TrendingDown size={11} className="text-red-400 shrink-0" />}
                <span className={`text-xs font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                  {isUp ? "+" : ""}{idx.changePct.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-zinc-600 text-sm">
          Nenhum {"índice"} encontrado
        </div>
      )}
    </div>
  );
}

// ── Moedas helpers & components ───────────────────────────────────────────

function fmtRate(rate: number): string {
  if (rate < 1) return rate.toFixed(6);
  if (rate < 100) return rate.toFixed(4);
  return rate.toFixed(2);
}

const CHART_RANGES: { key: PeriodKey; days: number }[] = [
  { key: "1M", days: 30 }, { key: "3M", days: 90 },
  { key: "6M", days: 180 }, { key: "1A", days: 365 },
];

function CurrSortHeader({ label, colSpan, sortKey: sk, current, asc, onClick }: {
  label: string; colSpan: number; sortKey: CurrSortKey;
  current: CurrSortKey; asc: boolean; onClick: (k: CurrSortKey) => void;
}) {
  const active = current === sk;
  return (
    <button
      className="text-left flex items-center gap-1 hover:text-zinc-400 transition-colors"
      style={{ gridColumn: `span ${colSpan}` }}
      onClick={() => onClick(sk)}
    >
      {label}
      {active && <ArrowUpDown size={9} className={asc ? "rotate-180" : ""} />}
    </button>
  );
}

function CurrencyChangeBar({ title, currencies, color }: {
  title: string; currencies: CurrencyData[]; color: string;
}) {
  if (currencies.length === 0) return null;
  const maxAbs = Math.max(...currencies.map(x => Math.abs(x.changePct)), 0.01);
  return (
    <div
      className="rounded-2xl p-4 md:p-5"
      style={{ background: "rgba(13,14,20,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <h3 className="text-xs font-semibold text-zinc-300 mb-3">{title}</h3>
      <div className="space-y-2">
        {currencies.map(c => {
          const width = (Math.abs(c.changePct) / maxAbs) * 100;
          return (
            <div key={c.code} className="flex items-center gap-2">
              <span className="text-sm w-6">{c.flag}</span>
              <span className="text-[11px] font-semibold text-zinc-300 w-10">{c.code}</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden bg-zinc-900/50 relative">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(width, 2)}%`, background: `linear-gradient(90deg, ${color}40, ${color})` }}
                />
              </div>
              <span className="text-[11px] font-mono font-semibold w-16 text-right" style={{ color }}>
                {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── WorldMap (memoized) ──────────────────────────────────────────────────

const CurrencyWorldMap = memo(function CurrencyWorldMap({
  currencies, selectedRegion, hoveredCurrency, selectedCurrency, onHover, onSelect,
}: {
  currencies: CurrencyData[];
  selectedRegion: string | null;
  hoveredCurrency: string | null;
  selectedCurrency: CurrencyData | null;
  onHover: (code: string | null) => void;
  onSelect: (c: CurrencyData | null) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z * 1.5, 8)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z / 1.5, 1)), []);
  const handleReset = useCallback(() => { setZoom(1); setCenter([10, 20]); }, []);

  return (
    <div className="relative">
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        {[
          { icon: ZoomIn, action: handleZoomIn, label: "Zoom in" },
          { icon: ZoomOut, action: handleZoomOut, label: "Zoom out" },
          { icon: Maximize2, action: handleReset, label: "Reset" },
        ].map(({ icon: Icon, action, label }) => (
          <button
            key={label}
            onClick={action}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
            title={label}
          >
            <Icon size={13} className="text-zinc-400" />
          </button>
        ))}
      </div>

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [0, 30] }}
        style={{ width: "100%", height: "auto" }}
        width={800}
        height={450}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ coordinates, zoom: z }) => { setCenter(coordinates as [number, number]); setZoom(z); }}
          maxZoom={8}
        >
          <rect x={-200} y={-100} width={1200} height={700} fill="rgba(8,10,18,0.6)" />
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="rgba(255,255,255,0.04)"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none" },
                    hover: { fill: "rgba(255,255,255,0.08)", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {currencies.map((c) => {
            const regionColor = REGION_COLORS[c.region] ?? "#888";
            const isHovered = hoveredCurrency === c.code;
            const isSelected = selectedCurrency?.code === c.code;
            const active = isHovered || isSelected;
            const dimmed = selectedRegion ? c.region !== selectedRegion : false;
            const changeColor = c.changePct >= 0 ? "#4ade80" : "#f87171";
            const markerR = active ? 7 : 4.5;

            return (
              <Marker
                key={c.code}
                coordinates={[c.lng, c.lat]}
                onMouseEnter={() => onHover(c.code)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(isSelected ? null : c)}
              >
                <g style={{ opacity: dimmed ? 0.12 : 1, cursor: "pointer" }}>
                  {active && (
                    <>
                      <circle r={markerR + 8} fill="none" stroke={changeColor} strokeWidth={0.6} opacity={0.3}>
                        <animate attributeName="r" from={markerR + 4} to={markerR + 14} dur="1.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="1.8s" repeatCount="indefinite" />
                      </circle>
                      <circle r={markerR + 4} fill={`${regionColor}15`} stroke={regionColor} strokeWidth={0.4} opacity={0.5} />
                    </>
                  )}
                  <circle r={markerR} fill="rgba(0,0,0,0.4)" cx={0.5} cy={0.5} />
                  <circle
                    r={markerR}
                    fill={regionColor}
                    stroke={active ? "#fff" : `${regionColor}80`}
                    strokeWidth={active ? 1.8 : 0.6}
                    style={{ filter: active ? `drop-shadow(0 0 6px ${regionColor})` : undefined }}
                  />
                  <circle r={markerR * 0.4} fill={changeColor} opacity={0.9} />
                  {!dimmed && (
                    <text
                      y={-markerR - 4}
                      textAnchor="middle"
                      fill={active ? "#fff" : "rgba(255,255,255,0.6)"}
                      fontSize={active ? 11 : 8}
                      fontWeight={active ? 700 : 500}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                    >
                      {c.code}
                    </text>
                  )}
                  {active && (
                    <g>
                      <rect
                        x={-68} y={markerR + 6}
                        width={136} height={42}
                        rx={6}
                        fill="rgba(0,0,0,0.92)"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth={0.5}
                        style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
                      />
                      <text x={0} y={markerR + 21} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600} fontFamily="system-ui">
                        {c.flag} {c.name}
                      </text>
                      <text x={-28} y={markerR + 36} textAnchor="start" fill="#94a3b8" fontSize={9} fontFamily="system-ui">
                        1 USD = {fmtRate(c.rate)}
                      </text>
                      <text x={28} y={markerR + 36} textAnchor="end" fill={changeColor} fontSize={9} fontWeight={600} fontFamily="system-ui">
                        {c.changePct >= 0 ? "+" : ""}{c.changePct.toFixed(2)}%
                      </text>
                    </g>
                  )}
                </g>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
});

// ── DollarThermometer ────────────────────────────────────────────────────

function DollarThermometer({ dxy, verdict, breadth }: {
  dxy: DxyData; verdict: MoedasVerdict; breadth: { up: number; down: number; total: number };
}) {
  const [chartRange, setChartRange] = useState<PeriodKey>("3M");
  const tone = MOEDAS_TONE[verdict.tone];
  const dxyUp = dxy.changePct >= 0;
  const angle = ((verdict.score + 100) / 200) * 180;

  const chartData = useMemo(() => {
    if (dxy.history.length === 0) return [];
    const cfg = CHART_RANGES.find(r => r.key === chartRange) ?? CHART_RANGES[1];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cfg.days);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return dxy.history.filter(p => p.date >= cutoffStr);
  }, [dxy.history, chartRange]);

  const chartMin = useMemo(() => Math.min(...chartData.map(d => d.close)), [chartData]);
  const chartMax = useMemo(() => Math.max(...chartData.map(d => d.close)), [chartData]);
  const chartRangePct = chartData.length > 1
    ? ((chartData[chartData.length - 1].close / chartData[0].close) - 1) * 100
    : 0;

  return (
    <div
      className="rounded-2xl p-4 md:p-6"
      style={{
        background: "rgba(13,14,20,0.8)",
        border: `1px solid ${tone.color}25`,
        boxShadow: `0 8px 32px ${tone.color}08`,
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Gauge size={16} style={{ color: tone.color }} />
        <h2 className="text-sm font-semibold text-zinc-200">Termômetro do Dólar (DXY)</h2>
        <span className="text-[10px] text-zinc-600 ml-auto">
          {dxy.source === "sintetico" ? "índice sintético" : "ICE U.S. Dollar Index"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="flex flex-col items-center justify-center text-center">
          <svg viewBox="0 0 200 110" className="w-full max-w-[220px]">
            <defs>
              <linearGradient id="gaugeGradMoedas" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f87171" />
                <stop offset="50%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
            </defs>
            <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />
            <path d="M 15 100 A 85 85 0 0 1 185 100" fill="none" stroke="url(#gaugeGradMoedas)" strokeWidth={12} strokeLinecap="round" opacity={0.85} />
            <g transform={`rotate(${angle - 90} 100 100)`}>
              <line x1={100} y1={100} x2={100} y2={28} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={100} cy={100} r={6} fill="#fff" />
            </g>
            <text x={15} y={108} fill="#71717a" fontSize={8} textAnchor="middle">fraco</text>
            <text x={185} y={108} fill="#71717a" fontSize={8} textAnchor="middle">forte</text>
          </svg>
          <span
            className="text-[11px] px-2.5 py-1 rounded-full font-semibold mt-1"
            style={{ background: tone.bg, color: tone.color, border: `1px solid ${tone.color}40` }}
          >
            {verdict.label}
          </span>
          <p className="text-[11px] text-zinc-500 mt-2 leading-relaxed max-w-[260px]">{verdict.reason}</p>
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Índice DXY</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-100">{dxy.value.toFixed(2)}</span>
            <span className={`text-sm font-semibold flex items-center gap-1 ${dxyUp ? "text-emerald-400" : "text-red-400"}`}>
              {dxyUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {dxyUp ? "+" : ""}{dxy.changePct.toFixed(2)}% hoje
            </span>
          </div>
          {dxy.periods && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {ALL_PERIODS.map(p => {
                const v = dxy.periods![p];
                if (v == null) return null;
                const up = v >= 0;
                return (
                  <div key={p} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <p className="text-[9px] text-zinc-600 uppercase">{PERIOD_LABELS[p]}</p>
                    <p className={`text-xs font-bold font-mono ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? "+" : ""}{v.toFixed(1)}%
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
              <Activity size={11} /> Histórico DXY
            </span>
            <div className="flex gap-1">
              {CHART_RANGES.map(r => (
                <button
                  key={r.key}
                  onClick={() => setChartRange(r.key)}
                  className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: chartRange === r.key ? `${tone.color}25` : "rgba(255,255,255,0.04)",
                    color: chartRange === r.key ? tone.color : "#71717a",
                  }}
                >
                  {r.key}
                </button>
              ))}
            </div>
          </div>
          {chartData.length > 1 ? (
            <>
              <div className="flex-1 min-h-[120px]">
                <ResponsiveContainer width="100%" height={120}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="dxyAreaMoedas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartRangePct >= 0 ? "#34d399" : "#f87171"} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={chartRangePct >= 0 ? "#34d399" : "#f87171"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={[chartMin, chartMax]} hide />
                    <RTooltip
                      contentStyle={{ background: "rgba(0,0,0,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(v: number) => [v.toFixed(2), "DXY"]}
                    />
                    <Area
                      type="monotone" dataKey="close"
                      stroke={chartRangePct >= 0 ? "#34d399" : "#f87171"}
                      strokeWidth={1.5} fill="url(#dxyAreaMoedas)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-zinc-600 text-center">
                {chartRangePct >= 0 ? "+" : ""}{chartRangePct.toFixed(2)}% no período · {breadth.up}/{breadth.total} moedas perderam p/ USD hoje
              </p>
            </>
          ) : (
            <div className="flex-1 min-h-[120px] flex items-center justify-center text-[11px] text-zinc-600">
              Histórico indisponível
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MoedasTabContent ─────────────────────────────────────────────────────

function MoedasTabContent({ data, currStats, currRegions, filteredCurrencies, selectedRegion, setSelectedRegion, hoveredCurrency, selectedCurrency, onCurrHover, onCurrSelect, moedasSearch, setMoedasSearch, currSortKey, currSortAsc, handleCurrSort }: {
  data: MoedasResponse;
  currStats: { strongest: CurrencyData; weakest: CurrencyData } | null;
  currRegions: string[];
  filteredCurrencies: CurrencyData[];
  selectedRegion: string | null;
  setSelectedRegion: (r: string | null) => void;
  hoveredCurrency: string | null;
  selectedCurrency: CurrencyData | null;
  onCurrHover: (code: string | null) => void;
  onCurrSelect: (c: CurrencyData | null) => void;
  moedasSearch: string;
  setMoedasSearch: (s: string) => void;
  currSortKey: CurrSortKey;
  currSortAsc: boolean;
  handleCurrSort: (k: CurrSortKey) => void;
}) {
  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="USD/BRL"
          value={`R$ ${data.usdBrl.toFixed(4)}`}
          icon={<DollarSign size={16} className="text-emerald-400" />}
        />
        {currStats && (
          <>
            <SummaryCard
              label="Mais forte (vs USD)"
              value={`${currStats.strongest.flag} ${currStats.strongest.code}`}
              sub={`${currStats.strongest.changePct >= 0 ? "+" : ""}${currStats.strongest.changePct.toFixed(2)}%`}
              subColor={currStats.strongest.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={<TrendingUp size={16} className="text-emerald-400" />}
            />
            <SummaryCard
              label="Mais fraca (vs USD)"
              value={`${currStats.weakest.flag} ${currStats.weakest.code}`}
              sub={`${currStats.weakest.changePct >= 0 ? "+" : ""}${currStats.weakest.changePct.toFixed(2)}%`}
              subColor={currStats.weakest.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
              icon={<TrendingDown size={16} className="text-red-400" />}
            />
          </>
        )}
        <SummaryCard
          label="Moedas monitoradas"
          value={`${data.currencies.length}`}
          sub={`${currRegions.length} regiões`}
          icon={<Globe size={16} className="text-cyan-400" />}
        />
      </div>

      {/* DXY Thermometer */}
      {data.dxy && (
        <DollarThermometer dxy={data.dxy} verdict={data.verdict} breadth={data.breadth} />
      )}

      {/* World Map */}
      <div
        className="rounded-2xl p-3 md:p-5 overflow-hidden"
        style={{
          background: "rgba(13,14,20,0.8)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }}
      >
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Globe size={16} className="text-cyan-400" />
            Mapa de Cotações
          </h2>
          <div className="flex gap-1.5 flex-wrap">
            {currRegions.map(r => (
              <button
                key={r}
                onClick={() => setSelectedRegion(selectedRegion === r ? null : r)}
                className="text-[10px] px-2.5 py-1 rounded-full transition-all"
                style={{
                  background: selectedRegion === r ? (REGION_COLORS[r] ?? "#888") + "30" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selectedRegion === r ? (REGION_COLORS[r] ?? "#888") + "60" : "rgba(255,255,255,0.06)"}`,
                  color: selectedRegion === r ? REGION_COLORS[r] ?? "#ddd" : "#888",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(5,7,14,0.5)" }}>
          <CurrencyWorldMap
            currencies={data.currencies}
            selectedRegion={selectedRegion}
            hoveredCurrency={hoveredCurrency}
            selectedCurrency={selectedCurrency}
            onHover={onCurrHover}
            onSelect={onCurrSelect}
          />
        </div>
        <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
          {Object.entries(REGION_COLORS).map(([region, color]) => (
            <div key={region} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}50` }} />
              <span className="text-[10px] text-zinc-500">{region}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Currency Detail */}
      {selectedCurrency && (
        <div
          className="rounded-2xl p-5"
          style={{
            background: "rgba(13,14,20,0.8)",
            border: `1px solid ${(REGION_COLORS[selectedCurrency.region] ?? "#888")}30`,
            boxShadow: `0 8px 32px ${(REGION_COLORS[selectedCurrency.region] ?? "#888")}08`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{selectedCurrency.flag}</span>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">{selectedCurrency.name}</h3>
                <p className="text-xs text-zinc-500">{selectedCurrency.code} · {selectedCurrency.region}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-zinc-100">{fmtRate(selectedCurrency.rate)}</p>
              <p className="text-xs text-zinc-500">1 USD = {selectedCurrency.code}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <DetailBox
              label="Variação dia"
              value={`${selectedCurrency.changePct >= 0 ? "+" : ""}${selectedCurrency.changePct.toFixed(3)}%`}
              color={selectedCurrency.changePct >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <DetailBox
              label="Variação absoluta"
              value={`${selectedCurrency.change >= 0 ? "+" : ""}${selectedCurrency.change.toFixed(6)}`}
              color={selectedCurrency.change >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <DetailBox
              label="Vs BRL"
              value={data.usdBrl > 0 && selectedCurrency.code !== "BRL"
                ? `R$ ${(data.usdBrl / selectedCurrency.rate).toFixed(4)}`
                : selectedCurrency.code === "BRL" ? `R$ 1.0000` : "—"}
              color="text-zinc-200"
            />
          </div>
        </div>
      )}

      {/* Region Breakdown */}
      <div
        className="rounded-2xl p-4 md:p-6"
        style={{ background: "rgba(13,14,20,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <Filter size={16} className="text-violet-400" />
          Performance por Região
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {currRegions.map(region => {
            const rc = data.currencies.filter(c => c.region === region);
            const avg = rc.reduce((s, c) => s + c.changePct, 0) / rc.length;
            const color = REGION_COLORS[region] ?? "#888";
            return (
              <button
                key={region}
                onClick={() => setSelectedRegion(selectedRegion === region ? null : region)}
                className="rounded-xl p-3 text-center transition-all hover:scale-[1.02]"
                style={{
                  background: selectedRegion === region ? `${color}15` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${selectedRegion === region ? `${color}40` : "rgba(255,255,255,0.05)"}`,
                }}
              >
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{region}</p>
                <p className={`text-sm font-bold mt-1 ${avg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {avg >= 0 ? "+" : ""}{avg.toFixed(2)}%
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{rc.length} moedas</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Currency Table */}
      <div
        className="rounded-2xl p-4 md:p-6"
        style={{ background: "rgba(13,14,20,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <ArrowUpDown size={16} className="text-amber-400" />
            Todas as Moedas
          </h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input
              type="text"
              placeholder="Buscar moeda..."
              value={moedasSearch}
              onChange={e => setMoedasSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900/50 border border-zinc-800 text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
            />
          </div>
        </div>

        <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-800/50">
          <CurrSortHeader label="Moeda" colSpan={3} sortKey="code" current={currSortKey} asc={currSortAsc} onClick={handleCurrSort} />
          <CurrSortHeader label="Região" colSpan={2} sortKey="region" current={currSortKey} asc={currSortAsc} onClick={handleCurrSort} />
          <CurrSortHeader label="Cotação (1 USD)" colSpan={3} sortKey="rate" current={currSortKey} asc={currSortAsc} onClick={handleCurrSort} />
          <CurrSortHeader label="Variação" colSpan={2} sortKey="changePct" current={currSortKey} asc={currSortAsc} onClick={handleCurrSort} />
          <div className="col-span-2 text-right">Vs BRL</div>
        </div>

        <div className="divide-y divide-zinc-800/30">
          {filteredCurrencies.map(c => {
            const isUp = c.changePct >= 0;
            const vsBrl = c.code === "BRL" ? 1 : data.usdBrl > 0 ? data.usdBrl / c.rate : 0;
            const regionColor = REGION_COLORS[c.region] ?? "#888";
            return (
              <div
                key={c.code}
                className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-white/[0.02] transition-colors cursor-pointer rounded-lg"
                onMouseEnter={() => onCurrHover(c.code)}
                onMouseLeave={() => onCurrHover(null)}
                onClick={() => onCurrSelect(selectedCurrency?.code === c.code ? null : c)}
                style={{ background: selectedCurrency?.code === c.code ? "rgba(255,255,255,0.03)" : undefined }}
              >
                <div className="col-span-5 md:col-span-3 flex items-center gap-2">
                  <span className="text-lg">{c.flag}</span>
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">{c.code}</p>
                    <p className="text-[10px] text-zinc-500 hidden sm:block">{c.name}</p>
                  </div>
                </div>
                <div className="col-span-2 hidden md:flex items-center">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: `${regionColor}18`, color: regionColor }}>
                    {c.region}
                  </span>
                </div>
                <div className="col-span-3 md:col-span-3">
                  <p className="text-xs font-mono text-zinc-300">{fmtRate(c.rate)}</p>
                </div>
                <div className="col-span-2 flex items-center gap-1">
                  {isUp
                    ? <TrendingUp size={11} className="text-emerald-400 shrink-0" />
                    : <TrendingDown size={11} className="text-red-400 shrink-0" />}
                  <span className={`text-xs font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                    {isUp ? "+" : ""}{c.changePct.toFixed(2)}%
                  </span>
                </div>
                <div className="col-span-2 text-right hidden md:block">
                  <p className="text-xs font-mono text-zinc-400">
                    R$ {vsBrl < 0.01 ? vsBrl.toFixed(6) : vsBrl < 1 ? vsBrl.toFixed(4) : vsBrl.toFixed(2)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {filteredCurrencies.length === 0 && (
          <div className="text-center py-8 text-zinc-600 text-sm">
            Nenhuma moeda encontrada
          </div>
        )}
      </div>

      {/* Strongest / Weakest bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CurrencyChangeBar
          title="Mais Fortes vs USD (dia)"
          currencies={data.currencies
            .filter(c => c.changePct < 0)
            .sort((a, b) => a.changePct - b.changePct)
            .slice(0, 8)}
          color="#4ade80"
        />
        <CurrencyChangeBar
          title="Mais Fracas vs USD (dia)"
          currencies={data.currencies
            .filter(c => c.changePct > 0)
            .sort((a, b) => b.changePct - a.changePct)
            .slice(0, 8)}
          color="#f87171"
        />
      </div>
    </>
  );
}
