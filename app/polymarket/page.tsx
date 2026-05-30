"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Activity, ExternalLink, RefreshCw, BarChart2, TrendingUp,
  Globe, Cpu, Star, Briefcase, Filter,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import { fetchPolymarket } from "@/lib/polymarket";
import type { PolyEvent, PolyResponse } from "@/lib/polymarket";

const POLY_COLORS = ["#22d3ee", "#fb923c", "#a78bfa", "#34d399", "#f59e0b"];

const CAT_META: Record<string, { color: string; icon: typeof BarChart2; desc: string }> = {
  "📊 Correlatos ao Portfólio": { color: "#d4a574", icon: Briefcase, desc: "Apostas ligadas aos seus ativos" },
  "🏦 Macro & Finanças":       { color: "#38bdf8", icon: TrendingUp, desc: "Fed, juros, câmbio, economia global" },
  "🌍 Geopolítica":            { color: "#f59e0b", icon: Globe, desc: "Eleições, conflitos, relações internacionais" },
  "🤖 Tech & IA":              { color: "#a78bfa", icon: Cpu, desc: "Big tech, IA, regulação, inovação" },
  "⭐ Em Destaque":             { color: "#34d399", icon: Star, desc: "Mercados de alto volume" },
};

const CATEGORY_ORDER = [
  "📊 Correlatos ao Portfólio",
  "🏦 Macro & Finanças",
  "🌍 Geopolítica",
  "🤖 Tech & IA",
  "⭐ Em Destaque",
];

function PolyCard({ ev }: { ev: PolyEvent }) {
  const top = ev.odds.slice(0, 4);
  const volFmt = ev.volume >= 1_000_000
    ? `$${(ev.volume / 1_000_000).toFixed(1)}M`
    : ev.volume >= 1000
    ? `$${(ev.volume / 1000).toFixed(0)}K`
    : `$${ev.volume.toFixed(0)}`;

  return (
    <a
      href={ev.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 p-4 rounded-2xl border border-white/[0.07] bg-zinc-950/60 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-200 no-underline"
    >
      <div className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-2 group-hover:text-white">
        {ev.title}
      </div>

      <div className="flex flex-col gap-1.5">
        {top.map((odd, i) => (
          <div
            key={i}
            className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg overflow-hidden"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 rounded-lg transition-all duration-500"
              style={{
                width: `${odd.percent}%`,
                background: `${POLY_COLORS[i]}18`,
                borderRight: `2px solid ${POLY_COLORS[i]}50`,
              }}
            />
            <span className="relative z-10 flex-1 text-xs text-zinc-300 truncate">
              {odd.outcome}
            </span>
            <span
              className="relative z-10 text-xs font-bold tabular-nums"
              style={{ color: POLY_COLORS[i] }}
            >
              {odd.percent}%
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        <span className="flex items-center gap-1">
          <Activity size={10} /> Vol {volFmt}
        </span>
        {ev.days_left !== null ? (
          <span className={ev.days_left <= 7 ? "text-amber-500 font-semibold" : ""}>
            {ev.days_left}d restantes
          </span>
        ) : (
          <span>Sem prazo</span>
        )}
        <ExternalLink
          size={10}
          className="group-hover:text-zinc-400"
        />
      </div>
    </a>
  );
}

export default function PolymarketPage() {
  const { data: portfolio } = usePortfolio();
  const [poly, setPoly] = useState<PolyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const portfolioTickers = useMemo(() => {
    if (!portfolio?.positions) return [];
    return (portfolio.positions as Array<{ ticker: string; quantidade: number }>)
      .filter((p) => p.quantidade > 0)
      .map((p) => p.ticker);
  }, [portfolio]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPolymarket(portfolioTickers)
      .then((d) => { if (!cancelled) setPoly(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao buscar Polymarket"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [portfolioTickers.join(","), refreshKey]); // eslint-disable-line

  const sortedCategories = useMemo(() => {
    if (!poly?.categories) return [];
    return CATEGORY_ORDER
      .filter((cat) => poly.categories[cat]?.length > 0)
      .map((cat) => ({ name: cat, events: poly.categories[cat] }));
  }, [poly]);

  const totalMarkets = useMemo(
    () => sortedCategories.reduce((s, c) => s + c.events.length, 0),
    [sortedCategories],
  );

  const filteredCategories = useMemo(() => {
    if (!activeFilter) return sortedCategories;
    return sortedCategories.filter((c) => c.name === activeFilter);
  }, [sortedCategories, activeFilter]);

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <PageHeader
          title="Polymarket"
          description="Mercados de predição — apostas correlatas ao portfólio e cenário macro"
        />
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07] transition-all disabled:opacity-50 mt-1"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats bar */}
      {!loading && poly && (
        <div className="flex items-center gap-4 mb-5 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Activity size={12} className="text-cyan-400" />
            <strong className="text-zinc-300">{totalMarkets}</strong> mercados ativos
          </span>
          <span className="flex items-center gap-1.5">
            <BarChart2 size={12} className="text-violet-400" />
            <strong className="text-zinc-300">{sortedCategories.length}</strong> categorias
          </span>
          {poly.cached_at && (
            <span className="ml-auto text-zinc-700">
              {new Date(poly.cached_at).toLocaleTimeString("pt-BR")}
            </span>
          )}
        </div>
      )}

      {/* Category filter pills */}
      {!loading && sortedCategories.length > 1 && (
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveFilter(null)}
            className={`flex-shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
              !activeFilter
                ? "bg-white/[0.08] border-white/[0.15] text-zinc-200"
                : "border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            }`}
          >
            <Filter size={11} />
            Todas
            <span className="opacity-50 text-[10px]">{totalMarkets}</span>
          </button>
          {sortedCategories.map(({ name, events }) => {
            const meta = CAT_META[name];
            const Icon = meta?.icon ?? Star;
            return (
              <button
                key={name}
                onClick={() => setActiveFilter(activeFilter === name ? null : name)}
                className={`flex-shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  activeFilter === name
                    ? "bg-white/[0.08] border-white/[0.15] text-zinc-200"
                    : "border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                <Icon size={11} style={{ color: meta?.color }} />
                {name.replace(/^.\s/, "")}
                <span className="opacity-50 text-[10px]">{events.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : !poly || sortedCategories.length === 0 ? (
        <div className="text-center py-20 text-zinc-600">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Não foi possível carregar o Polymarket.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredCategories.map(({ name, events }) => {
            const meta = CAT_META[name];
            const color = meta?.color ?? "#71717a";
            return (
              <div key={name}>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-sm font-bold" style={{ color }}>
                    {name}
                  </h2>
                  <div
                    className="flex-1 h-px"
                    style={{ background: `${color}30` }}
                  />
                  <span className="text-[10px] text-zinc-600">
                    {events.length} mercados
                  </span>
                </div>
                {meta?.desc && (
                  <p className="text-[11px] text-zinc-600 mb-3">{meta.desc}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {events.map((ev) => (
                    <PolyCard key={ev.id} ev={ev} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
