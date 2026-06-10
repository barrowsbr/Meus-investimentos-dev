"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Activity, ExternalLink, RefreshCw, BarChart2, TrendingUp,
  Globe, Cpu, Star, Briefcase, Filter, Users,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import { fetchPolymarket, polyToUnified, findPortfolioImpact } from "@/lib/polymarket";
import type { PolyEvent, UnifiedPrediction } from "@/lib/polymarket";
import { fetchKalshi } from "@/lib/kalshi";
import { fetchMetaculus } from "@/lib/metaculus";

const POLY_COLORS = ["#22d3ee", "#fb923c", "#a78bfa", "#34d399", "#f59e0b"];

const CAT_META: Record<string, { color: string; icon: typeof BarChart2; desc: string }> = {
  "📊 Correlatos ao Portfólio": { color: "#d4a574", icon: Briefcase, desc: "Apostas ligadas aos seus ativos" },
  "🏦 Macro & Finanças":       { color: "#38bdf8", icon: TrendingUp, desc: "Fed, juros, câmbio, economia global" },
  "🏦 Macro & Economia":       { color: "#38bdf8", icon: TrendingUp, desc: "Fed, juros, câmbio, economia global" },
  "🌍 Geopolítica":            { color: "#f59e0b", icon: Globe, desc: "Eleições, conflitos, relações internacionais" },
  "🤖 Tech & IA":              { color: "#a78bfa", icon: Cpu, desc: "Big tech, IA, regulação, inovação" },
  "⭐ Em Destaque":             { color: "#34d399", icon: Star, desc: "Mercados de alto volume" },
  "⭐ Outros":                  { color: "#34d399", icon: Star, desc: "Outros mercados relevantes" },
};

const SOURCE_BADGE: Record<string, { color: string; label: string }> = {
  polymarket: { color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/25", label: "Polymarket" },
  kalshi:     { color: "text-violet-400 bg-violet-500/10 border-violet-500/25", label: "Kalshi" },
  metaculus:  { color: "text-amber-400 bg-amber-500/10 border-amber-500/25", label: "Metaculus" },
};

function UnifiedCard({ pred }: { pred: UnifiedPrediction }) {
  const top = pred.odds.slice(0, 4);
  const badge = SOURCE_BADGE[pred.source] ?? SOURCE_BADGE.polymarket;
  const volFmt = pred.volume
    ? pred.volume >= 1_000_000 ? `$${(pred.volume / 1_000_000).toFixed(1)}M` : pred.volume >= 1000 ? `$${(pred.volume / 1000).toFixed(0)}K` : `$${pred.volume.toFixed(0)}`
    : null;

  return (
    <a href={pred.url} target="_blank" rel="noopener noreferrer"
      className="group flex flex-col gap-3 p-4 rounded-2xl border border-white/[0.07] bg-zinc-950/60 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-200 no-underline">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge.color}`}>{badge.label}</span>
        {pred.portfolio_impact.length > 0 && (
          <div className="flex gap-1">
            {pred.portfolio_impact.slice(0, 3).map(t => (
              <span key={t} className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{t}</span>
            ))}
            {pred.portfolio_impact.length > 3 && <span className="text-[9px] text-zinc-600">+{pred.portfolio_impact.length - 3}</span>}
          </div>
        )}
      </div>
      <div className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-2 group-hover:text-white">{pred.title}</div>
      <div className="flex flex-col gap-1.5">
        {top.map((odd, i) => (
          <div key={i} className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="absolute left-0 top-0 bottom-0 rounded-lg" style={{ width: `${odd.percent}%`, background: `${POLY_COLORS[i]}18`, borderRight: `2px solid ${POLY_COLORS[i]}50` }} />
            <span className="relative z-10 flex-1 text-xs text-zinc-300 truncate">{odd.outcome}</span>
            <span className="relative z-10 text-xs font-bold tabular-nums" style={{ color: POLY_COLORS[i] }}>{odd.percent}%</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        <span className="flex items-center gap-1">
          {volFmt ? <><Activity size={10} /> Vol {volFmt}</> : pred.forecasters ? <><Users size={10} /> {pred.forecasters} forecasters</> : null}
        </span>
        {pred.days_left !== null ? <span className={pred.days_left <= 7 ? "text-amber-500 font-semibold" : ""}>{pred.days_left}d restantes</span> : <span>Sem prazo</span>}
        <ExternalLink size={10} className="group-hover:text-zinc-400" />
      </div>
    </a>
  );
}

type SourceFilter = "all" | "polymarket" | "kalshi" | "metaculus";

export default function MercadosPreditivosPage() {
  const { data: portfolio } = usePortfolio();
  const [predictions, setPredictions] = useState<UnifiedPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sourceCounts, setSourceCounts] = useState({ polymarket: 0, kalshi: 0, metaculus: 0 });

  const portfolioTickers = useMemo(() => {
    if (!portfolio?.positions) return [];
    return (portfolio.positions as Array<{ ticker: string; quantidade: number }>)
      .filter(p => p.quantidade > 0)
      .map(p => p.ticker);
  }, [portfolio]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const allPreds: UnifiedPrediction[] = [];
      const counts = { polymarket: 0, kalshi: 0, metaculus: 0 };

      const [polyRes, kalshiRes, metaculusRes] = await Promise.allSettled([
        fetchPolymarket(portfolioTickers).then(r => {
          const events = Object.values(r.categories).flat();
          return events.map(ev => {
            const u = polyToUnified(ev);
            u.category = Object.entries(r.categories).find(([, evs]) => evs.some(e => e.id === ev.id))?.[0] ?? "";
            return u;
          });
        }),
        fetchKalshi(),
        fetchMetaculus().then(qs => qs.map(q => ({ id: q.id, source: q.source, title: q.title, url: q.url, category: q.category, odds: q.odds, forecasters: q.forecasters, end_date: q.end_date, days_left: q.days_left, portfolio_impact: q.portfolio_impact } as UnifiedPrediction))),
      ]);

      if (polyRes.status === "fulfilled") { allPreds.push(...polyRes.value); counts.polymarket = polyRes.value.length; }
      if (kalshiRes.status === "fulfilled") { allPreds.push(...kalshiRes.value.map(k => ({ ...k } as UnifiedPrediction))); counts.kalshi = kalshiRes.value.length; }
      if (metaculusRes.status === "fulfilled") { allPreds.push(...metaculusRes.value); counts.metaculus = metaculusRes.value.length; }

      if (!cancelled) {
        setPredictions(allPreds);
        setSourceCounts(counts);
        if (allPreds.length === 0) setError("Não foi possível carregar mercados preditivos.");
      }
    })().finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [portfolioTickers.join(","), refreshKey]); // eslint-disable-line

  const categorized = useMemo(() => {
    let items = predictions;
    if (sourceFilter !== "all") items = items.filter(p => p.source === sourceFilter);

    const cats = new Map<string, UnifiedPrediction[]>();
    const correlated = items.filter(p => p.portfolio_impact.length > 0);
    if (correlated.length > 0) cats.set("📊 Correlatos ao Portfólio", correlated);

    for (const p of items) {
      const cat = p.category || "⭐ Outros";
      if (cat === "📊 Correlatos ao Portfólio") continue;
      const arr = cats.get(cat) ?? [];
      arr.push(p);
      cats.set(cat, arr);
    }

    for (const [, evs] of cats) evs.sort((a, b) => (b.volume ?? b.forecasters ?? 0) - (a.volume ?? a.forecasters ?? 0));

    const ORDER = ["📊 Correlatos ao Portfólio", "🏦 Macro & Finanças", "🏦 Macro & Economia", "🌍 Geopolítica", "🤖 Tech & IA", "⭐ Em Destaque", "⭐ Outros"];
    return [...cats.entries()]
      .sort(([a], [b]) => { const ia = ORDER.indexOf(a); const ib = ORDER.indexOf(b); return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib); })
      .filter(([, evs]) => evs.length > 0);
  }, [predictions, sourceFilter]);

  const totalMarkets = useMemo(() => categorized.reduce((s, [, evs]) => s + evs.length, 0), [categorized]);
  const filteredCategories = useMemo(() => activeFilter ? categorized.filter(([name]) => name === activeFilter) : categorized, [categorized, activeFilter]);

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <PageHeader title="Mercados Preditivos" description="Polymarket, Kalshi e Metaculus — apostas e previsões com impacto econômico" />
        <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07] transition-all disabled:opacity-50 mt-1">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />Atualizar
        </button>
      </div>

      {error && <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">{error}</div>}

      {!loading && predictions.length > 0 && (<>
        <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px] text-zinc-600">
          <span className="flex items-center gap-1.5"><Activity size={12} className="text-cyan-400" /><strong className="text-zinc-300">{predictions.length}</strong> mercados</span>
          {sourceCounts.polymarket > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" />{sourceCounts.polymarket} Polymarket</span>}
          {sourceCounts.kalshi > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" />{sourceCounts.kalshi} Kalshi</span>}
          {sourceCounts.metaculus > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{sourceCounts.metaculus} Metaculus</span>}
          <span className="flex items-center gap-1"><Briefcase size={10} className="text-amber-400" />{predictions.filter(p => p.portfolio_impact.length > 0).length} correlatas</span>
        </div>

        <div className="flex gap-1.5 mb-4 overflow-x-auto">
          {(["all", "polymarket", "kalshi", "metaculus"] as const).map(s => {
            const count = s === "all" ? predictions.length : sourceCounts[s];
            if (s !== "all" && count === 0) return null;
            return (
              <button key={s} onClick={() => { setSourceFilter(s); setActiveFilter(null); }}
                className={`flex-shrink-0 flex items-center gap-1.5 py-1 px-3 rounded-xl text-xs font-semibold border transition-all ${sourceFilter === s ? "bg-white/[0.08] border-white/[0.15] text-zinc-200" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"}`}>
                {s === "all" ? <Globe size={11} /> : <Activity size={11} />}
                {s === "all" ? "Todas" : SOURCE_BADGE[s]?.label ?? s}
                <span className="opacity-50 text-[10px]">{count}</span>
              </button>
            );
          })}
        </div>

        {categorized.length > 1 && (
          <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
            <button onClick={() => setActiveFilter(null)}
              className={`flex-shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all ${!activeFilter ? "bg-white/[0.08] border-white/[0.15] text-zinc-200" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"}`}>
              <Filter size={11} />Todas<span className="opacity-50 text-[10px]">{totalMarkets}</span>
            </button>
            {categorized.map(([name, events]) => {
              const meta = CAT_META[name]; const Icon = meta?.icon ?? Star;
              return (
                <button key={name} onClick={() => setActiveFilter(activeFilter === name ? null : name)}
                  className={`flex-shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold border transition-all ${activeFilter === name ? "bg-white/[0.08] border-white/[0.15] text-zinc-200" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"}`}>
                  <Icon size={11} style={{ color: meta?.color }} />{name.replace(/^.\s/, "")}<span className="opacity-50 text-[10px]">{events.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </>)}

      {loading ? <LoadingSpinner /> : predictions.length === 0 ? (
        <div className="text-center py-20 text-zinc-600"><BarChart2 size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm">Não foi possível carregar.</p></div>
      ) : (
        <div className="space-y-8">
          {filteredCategories.map(([name, events]) => {
            const meta = CAT_META[name]; const color = meta?.color ?? "#71717a";
            return (
              <div key={name}>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-sm font-bold" style={{ color }}>{name}</h2>
                  <div className="flex-1 h-px" style={{ background: `${color}30` }} />
                  <span className="text-[10px] text-zinc-600">{events.length} mercados</span>
                </div>
                {meta?.desc && <p className="text-[11px] text-zinc-600 mb-3">{meta.desc}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{events.map(ev => <UnifiedCard key={`${ev.source}-${ev.id}`} pred={ev} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
