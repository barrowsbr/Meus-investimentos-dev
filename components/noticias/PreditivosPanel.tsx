"use client";

// Painel de PREVISÕES (Polymarket + Kalshi + Metaculus) — extraído da antiga
// página /polymarket para virar uma aba dentro de /noticias. Mantém as
// categorias ricas (Preço dos Ativos, Correlatos, Macro, Geopolítica, Tech) e os
// filtros por fonte/categoria. Sem PageHeader (fica na página que o embute).

import { useState, useEffect, useMemo } from "react";
import {
  Activity, ExternalLink, RefreshCw, BarChart2, TrendingUp,
  Globe, Cpu, Star, Briefcase, Filter, Users,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import LoadingSpinner from "@/components/LoadingSpinner";
import { polyToUnified } from "@/lib/polymarket";
import type { UnifiedPrediction } from "@/lib/polymarket";
import { openEmbed } from "@/lib/embed-link";

const CAT_META: Record<string, { color: string; icon: typeof BarChart2; desc: string }> = {
  "💲 Preço dos Ativos": { color: "#4ade80", icon: TrendingUp, desc: "Apostas sobre o PREÇO dos ativos da sua carteira (busca direcionada)" },
  "📊 Correlatos ao Portfólio": { color: "#E8A33D", icon: Briefcase, desc: "Apostas ligadas aos seus ativos" },
  "🏦 Macro & Finanças": { color: "#38bdf8", icon: TrendingUp, desc: "Fed, juros, câmbio, economia global" },
  "🏦 Macro & Economia": { color: "#38bdf8", icon: TrendingUp, desc: "Fed, juros, câmbio, economia global" },
  "🌍 Geopolítica": { color: "#f59e0b", icon: Globe, desc: "Eleições, conflitos, relações internacionais" },
  "🤖 Tech & IA": { color: "#a78bfa", icon: Cpu, desc: "Big tech, IA, regulação, inovação" },
  "⭐ Em Destaque": { color: "#34d399", icon: Star, desc: "Mercados de alto volume" },
  "⭐ Outros": { color: "#34d399", icon: Star, desc: "Outros mercados relevantes" },
};

const SOURCE_BADGE: Record<string, { color: string; label: string; accent: string }> = {
  polymarket: { color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/25", label: "Polymarket", accent: "#22d3ee" },
  kalshi: { color: "text-violet-400 bg-violet-500/10 border-violet-500/25", label: "Kalshi", accent: "#a78bfa" },
  metaculus: { color: "text-amber-400 bg-amber-500/10 border-amber-500/25", label: "Metaculus", accent: "#f59e0b" },
};

function fmtVol(v: number | null | undefined): string | null {
  if (!v) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPrazo(d: number | null): string {
  if (d === null) return "sem prazo";
  if (d <= 0) return "hoje";
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}sem`;
  return `${Math.round(d / 30)}m`;
}

// Bloco estilo terminal (inspiração: tickers de mercados preditivos) — título,
// uma LINHA por outcome com barra horizontal + %, e rodapé FONTE | vol | fecha.
function UnifiedCard({ pred }: { pred: UnifiedPrediction }) {
  const top = pred.odds.slice(0, 4);
  const resto = pred.odds.length - top.length;
  const badge = SOURCE_BADGE[pred.source] ?? SOURCE_BADGE.polymarket;
  const volFmt = fmtVol(pred.volume);

  return (
    <a
      href={pred.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { e.preventDefault(); openEmbed(pred.url, "Mercado preditivo", pred.title); }}
      className="group block no-underline transition-colors hover:bg-white/[0.02]"
      style={{ border: "1px solid var(--line)", background: "var(--panel)" }}
    >
      {/* Título do evento */}
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-2" style={{ borderBottom: "1px solid var(--line)" }}>
        <span className="mt-[3px] shrink-0" style={{ width: 3, height: 12, background: badge.accent }} />
        <span className="flex-1 min-w-0 text-[13px] font-bold leading-snug line-clamp-2" style={{ color: "var(--text)" }}>
          {pred.title}
        </span>
        {pred.portfolio_impact.length > 0 && (
          <span className="shrink-0 font-mono text-[9px] font-bold px-1.5 py-0.5" style={{ background: "rgba(232,163,61,0.10)", border: "1px solid rgba(232,163,61,0.3)", color: "var(--accent)" }}>
            {pred.portfolio_impact[0]}{pred.portfolio_impact.length > 1 ? ` +${pred.portfolio_impact.length - 1}` : ""}
          </span>
        )}
      </div>

      {/* Linhas de outcome: label ..... barra + % */}
      <div className="px-3 py-2 space-y-1.5">
        {top.map((odd, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="flex-1 min-w-0 truncate font-mono text-[11.5px]" style={{ color: "var(--text-2)" }}>
              {odd.outcome}
            </span>
            <span className="shrink-0 overflow-hidden" style={{ width: 96, height: 6, background: "var(--hover)", borderRadius: 2 }}>
              <span className="block h-full" style={{ width: `${Math.max(2, Math.min(100, odd.percent))}%`, background: "var(--pos)", borderRadius: 2, opacity: 0.45 + 0.55 * (odd.percent / 100) }} />
            </span>
            <span className="shrink-0 w-10 text-right font-mono text-[11.5px] font-bold tabular-nums" style={{ color: "var(--pos)" }}>
              {odd.percent}%
            </span>
          </div>
        ))}
        {resto > 0 && (
          <p className="font-mono text-[10px]" style={{ color: "var(--faint)" }}>+{resto} outcomes</p>
        )}
      </div>

      {/* Rodapé: FONTE | vol | fecha */}
      <div className="flex items-center gap-1.5 px-3 pb-2 font-mono text-[9.5px] uppercase tracking-wider" style={{ color: "var(--faint)" }}>
        <span className="font-bold" style={{ color: badge.accent }}>{badge.label}</span>
        {volFmt && <><span>|</span><span>{volFmt} vol</span></>}
        {!volFmt && pred.forecasters ? <><span>|</span><span>{pred.forecasters} forecasters</span></> : null}
        <span>|</span>
        <span style={pred.days_left !== null && pred.days_left <= 7 ? { color: "var(--accent)", fontWeight: 700 } : undefined}>
          fecha: {fmtPrazo(pred.days_left)}
        </span>
        <ExternalLink size={9} className="ml-auto opacity-0 transition-opacity group-hover:opacity-60" />
      </div>
    </a>
  );
}

type SourceFilter = "all" | "polymarket" | "kalshi" | "metaculus";

export default function PreditivosPanel() {
  const { data: portfolio } = usePortfolio();
  const [predictions, setPredictions] = useState<UnifiedPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sourceCounts, setSourceCounts] = useState({ polymarket: 0, kalshi: 0, metaculus: 0 });
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"hot" | "top" | "fecha">("hot");

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
        fetch(`/api/preditivos/polymarket?tickers=${portfolioTickers.join(",")}`).then(r => r.json()).then(data => {
          if (!data.categories) return [];
          const events = Object.values(data.categories).flat();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (events as Array<any>).map(ev => {
            const u = polyToUnified(ev);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            u.category = Object.entries(data.categories).find(([, evs]: any) => evs.some((e: any) => e.id === ev.id))?.[0] ?? "";
            return u;
          });
        }),
        fetch(`/api/preditivos/kalshi`).then(r => r.json()).then(data => data || []),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fetch(`/api/preditivos/metaculus`).then(r => r.json()).then(qs => (qs || []).map((q: any) => ({ id: q.id, source: q.source, title: q.title, url: q.url, category: q.category, odds: q.odds, forecasters: q.forecasters, end_date: q.end_date, days_left: q.days_left, portfolio_impact: q.portfolio_impact } as UnifiedPrediction))),
      ]);

      if (polyRes.status === "fulfilled") { allPreds.push(...polyRes.value); counts.polymarket = polyRes.value.length; }
      if (kalshiRes.status === "fulfilled") { allPreds.push(...kalshiRes.value.map((k: UnifiedPrediction) => ({ ...k }))); counts.kalshi = kalshiRes.value.length; }
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
    const q = busca.trim().toLowerCase();
    if (q) {
      items = items.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.odds.some(o => o.outcome.toLowerCase().includes(q)) ||
        p.portfolio_impact.some(t => t.toLowerCase().includes(q)));
    }

    const cats = new Map<string, UnifiedPrediction[]>();
    const correlated = items.filter(p => p.portfolio_impact.length > 0 && p.category !== "💲 Preço dos Ativos");
    if (correlated.length > 0) cats.set("📊 Correlatos ao Portfólio", correlated);

    for (const p of items) {
      const cat = p.category || "⭐ Outros";
      if (cat === "📊 Correlatos ao Portfólio") continue;
      const arr = cats.get(cat) ?? [];
      arr.push(p);
      cats.set(cat, arr);
    }

    // HOT: volume/participação · TOP: probabilidade do líder · FECHA: prazo mais curto
    const cmp = (a: UnifiedPrediction, b: UnifiedPrediction) => {
      if (ordem === "top") return (b.odds[0]?.percent ?? 0) - (a.odds[0]?.percent ?? 0);
      if (ordem === "fecha") return (a.days_left ?? 9999) - (b.days_left ?? 9999);
      return (b.volume ?? b.forecasters ?? 0) - (a.volume ?? a.forecasters ?? 0);
    };
    for (const [, evs] of cats) evs.sort(cmp);

    const ORDER = ["💲 Preço dos Ativos", "📊 Correlatos ao Portfólio", "🏦 Macro & Finanças", "🏦 Macro & Economia", "🌍 Geopolítica", "🤖 Tech & IA", "⭐ Em Destaque", "⭐ Outros"];
    return [...cats.entries()]
      .sort(([a], [b]) => { const ia = ORDER.indexOf(a); const ib = ORDER.indexOf(b); return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib); })
      .filter(([, evs]) => evs.length > 0);
  }, [predictions, sourceFilter, busca, ordem]);

  const totalMarkets = useMemo(() => categorized.reduce((s, [, evs]) => s + evs.length, 0), [categorized]);
  const filteredCategories = useMemo(() => activeFilter ? categorized.filter(([name]) => name === activeFilter) : categorized, [categorized, activeFilter]);

  return (
    <>
      {/* Barra terminal: ordenação HOT/TOP/FECHA + busca + atualizar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden" style={{ border: "1px solid var(--line-strong)" }}>
          {([["hot", "HOT"], ["top", "TOP"], ["fecha", "FECHA"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setOrdem(id)}
              className="px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.12em] transition-colors"
              style={ordem === id
                ? { background: "var(--pos)", color: "var(--bg)" }
                : { color: "var(--muted)", borderLeft: id !== "hot" ? "1px solid var(--line)" : undefined }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 min-w-[160px] max-w-xs items-center" style={{ border: "1px solid var(--line-strong)" }}>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Search…"
            className="w-full bg-transparent px-2.5 py-1.5 font-mono text-[11px] outline-none"
            style={{ color: "var(--text)" }}
          />
          <span className="px-2 font-mono text-[10px] font-bold tracking-widest" style={{ color: "var(--pos)" }}>GO</span>
        </div>
        <button onClick={() => setRefreshKey(k => k + 1)} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider transition-colors disabled:opacity-50"
          style={{ border: "1px solid var(--line-strong)", color: "var(--muted)" }}>
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />ATUALIZAR
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">{events.map(ev => <UnifiedCard key={`${ev.source}-${ev.id}`} pred={ev} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
