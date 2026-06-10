"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Newspaper, RefreshCw, Briefcase, Globe, Clock,
  ExternalLink, TrendingUp, MessageSquare, ArrowUp, BarChart2,
  AlertTriangle, Zap, Activity, Landmark, Factory,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { NewsItem } from "@/app/api/noticias/route";
import { type RedditPost, fetchRedditFromBrowser } from "@/lib/reddit";
import { fetchPolymarket, polyToUnified } from "@/lib/polymarket";
import type { UnifiedPrediction } from "@/lib/polymarket";
import { fetchKalshi } from "@/lib/kalshi";
import { fetchMetaculus } from "@/lib/metaculus";

// ─── Ticker Tape ──────────────────────────────────────────────────────────────

function TickerTape({ items }: { items: { ticker: string; price: number; changePct: number; moeda: string }[] }) {
  if (!items.length) return null;
  const html = items.map(item => {
    const cls = item.changePct > 0 ? "text-emerald-400" : item.changePct < 0 ? "text-red-400" : "text-zinc-500";
    const arrow = item.changePct > 0 ? "▲" : item.changePct < 0 ? "▼" : "▬";
    const sign = item.changePct > 0 ? "+" : "";
    const p = item.price >= 100 ? item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price >= 1 ? item.price.toFixed(2) : item.price.toFixed(4);
    return `<span class="inline-flex items-center gap-2 px-5 border-r border-white/[0.06]"><span class="text-xs font-black text-zinc-200 tracking-wide">${item.ticker.replace(".SA","")}</span><span class="text-xs text-zinc-500 tabular-nums">${item.moeda==="USD"?"US$":"R$"} ${p}</span><span class="text-xs font-bold tabular-nums ${cls}">${arrow} ${sign}${item.changePct.toFixed(2)}%</span></span>`;
  }).join("");
  const dur = Math.max(20, items.length * 5);
  return (
    <div className="relative h-11 flex items-center bg-black/40 border border-white/[0.07] rounded-2xl overflow-hidden mb-5">
      <div className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-white/[0.07] h-full bg-emerald-900/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">Ao Vivo</span>
      </div>
      <div className="flex-1 overflow-hidden" style={{ maskImage: "linear-gradient(to right,transparent 0%,black 4%,black 96%,transparent 100%)", WebkitMaskImage: "linear-gradient(to right,transparent 0%,black 4%,black 96%,transparent 100%)" }}>
        <div dangerouslySetInnerHTML={{ __html: html + html }}
          style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", animation: `tickerScroll ${dur}s linear infinite` }} />
      </div>
      <style>{`@keyframes tickerScroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
    </div>
  );
}

// ─── Impact badge ────────────────────────────────────────────────────────────

const IMPACT_STYLE = {
  alto:  { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/25", label: "Alto Impacto", icon: Zap },
  medio: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", label: "Médio", icon: AlertTriangle },
  baixo: { bg: "", text: "", border: "", label: "", icon: null },
};

function ImpactBadge({ impacto }: { impacto: "alto" | "medio" | "baixo" }) {
  const s = IMPACT_STYLE[impacto];
  if (!s.label) return null;
  const Icon = s.icon!;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${s.bg} ${s.text} ${s.border}`}>
      <Icon size={8} />{s.label}
    </span>
  );
}

// ─── News Card ────────────────────────────────────────────────────────────────

const CAT_CLS: Record<string, string> = {
  mercado: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  portfolio: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  economia: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  macro: "bg-red-500/10 text-red-400 border-red-500/20",
  setor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};
const CAT_LBL: Record<string, string> = {
  mercado: "Mercado", portfolio: "Portfólio", economia: "Economia",
  macro: "Macro", setor: "Setor",
};

function timeAgo(d: string) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function NewsCard({ item }: { item: NewsItem }) {
  const borderColor = item.impacto === "alto" ? "border-l-red-500/60" : item.impacto === "medio" ? "border-l-amber-500/40" : "border-l-cyan-500/40";
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer"
      className={`group flex flex-col gap-2 p-4 rounded-2xl border border-white/[0.07] border-l-2 ${borderColor} bg-zinc-950/60 hover:border-white/[0.12] hover:bg-white/[0.03] transition-all duration-200 no-underline`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-500 truncate">{item.fonte}</span>
        <span className="flex items-center gap-1 text-[11px] text-zinc-700 flex-shrink-0"><Clock size={10}/>{timeAgo(item.data)}</span>
      </div>
      <div className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-3 group-hover:text-white">{item.titulo}</div>
      <div className="flex items-center justify-between mt-auto">
        <div className="flex gap-1.5 flex-wrap">
          <ImpactBadge impacto={item.impacto} />
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CAT_CLS[item.categoria] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>{CAT_LBL[item.categoria] ?? item.categoria}</span>
          {item.ticker && !["Mercado","Investimentos","Economia","Câmbio","Wall Street","Renda Fixa","COPOM","FOMC","IPCA","Payroll","CPI","PIB","Energia","Financeiro","Varejo","Mineração","Tech","Saúde"].includes(item.ticker) && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-500 border border-white/[0.08]">{item.ticker}</span>
          )}
        </div>
        <span className="text-[11px] text-zinc-700 group-hover:text-zinc-400 flex items-center gap-1">Ler <ExternalLink size={10}/></span>
      </div>
    </a>
  );
}

// ─── Reddit Card ──────────────────────────────────────────────────────────────

function RedditCard({ post }: { post: RedditPost }) {
  const timeStr = timeAgo(new Date(post.created_utc * 1000).toISOString());
  const subColors: Record<string, string> = {
    investimentos: "#f59e0b", farialimabets: "#8b5cf6", bolsa: "#3b82f6",
    stocks: "#10b981", wallstreetbets: "#f97316", dividends: "#34d399",
  };
  const c = subColors[post.subreddit.toLowerCase()] ?? "#71717a";

  return (
    <a href={post.permalink} target="_blank" rel="noopener noreferrer"
      className="group flex flex-col gap-2 p-4 rounded-2xl border border-white/[0.07] bg-zinc-950/60 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-200 no-underline">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${c}20`, color: c }}>
          r/{post.subreddit}
        </span>
        <span className="text-[11px] text-zinc-700">{timeStr}</span>
      </div>
      <div className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-3 group-hover:text-white">{post.title}</div>
      {post.selftext && (
        <div className="text-[11px] text-zinc-500 line-clamp-2">{post.selftext}</div>
      )}
      <div className="flex items-center gap-4 mt-1">
        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
          <ArrowUp size={11} className="text-orange-400" />{post.score.toLocaleString()}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
          <MessageSquare size={11} />{post.num_comments}
        </span>
        <span className="ml-auto text-[11px] text-zinc-700 group-hover:text-zinc-400 flex items-center gap-1">Ver <ExternalLink size={10}/></span>
      </div>
    </a>
  );
}

// ─── Mini Prediction Card (for Previsões tab) ────────────────────────────────

const SOURCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  polymarket: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/25" },
  kalshi:     { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/25" },
  metaculus:  { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/25" },
};

const SOURCE_LABEL: Record<string, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  metaculus: "Metaculus",
};

const PRED_COLORS = ["#22d3ee", "#fb923c", "#a78bfa", "#34d399"];

function PredictionCard({ pred }: { pred: UnifiedPrediction }) {
  const sc = SOURCE_COLORS[pred.source] ?? SOURCE_COLORS.polymarket;
  const top = pred.odds.slice(0, 3);
  const volFmt = pred.volume
    ? pred.volume >= 1_000_000 ? `$${(pred.volume / 1_000_000).toFixed(1)}M` : pred.volume >= 1000 ? `$${(pred.volume / 1000).toFixed(0)}K` : `$${pred.volume.toFixed(0)}`
    : pred.forecasters ? `${pred.forecasters} forecasters` : null;

  return (
    <a href={pred.url} target="_blank" rel="noopener noreferrer"
      className="group flex flex-col gap-3 p-4 rounded-2xl border border-white/[0.07] bg-zinc-950/60 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all duration-200 no-underline">
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${sc.bg} ${sc.text} ${sc.border}`}>
          {SOURCE_LABEL[pred.source]}
        </span>
        {pred.portfolio_impact.length > 0 && (
          <div className="flex gap-1">
            {pred.portfolio_impact.slice(0, 3).map(t => (
              <span key={t} className="text-[9px] font-bold px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">{t}</span>
            ))}
            {pred.portfolio_impact.length > 3 && <span className="text-[9px] text-zinc-600">+{pred.portfolio_impact.length - 3}</span>}
          </div>
        )}
      </div>

      <div className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-2 group-hover:text-white">{pred.title}</div>

      <div className="flex flex-col gap-1.5">
        {top.map((odd, i) => (
          <div key={i} className="relative flex items-center gap-2 px-2 py-1 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="absolute left-0 top-0 bottom-0 rounded-lg transition-all duration-500"
              style={{ width: `${odd.percent}%`, background: `${PRED_COLORS[i]}18`, borderRight: `2px solid ${PRED_COLORS[i]}50` }} />
            <span className="relative z-10 flex-1 text-xs text-zinc-300 truncate">{odd.outcome}</span>
            <span className="relative z-10 text-xs font-bold tabular-nums" style={{ color: PRED_COLORS[i] }}>{odd.percent}%</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-zinc-600">
        {volFmt && <span className="flex items-center gap-1"><Activity size={10} />{volFmt}</span>}
        {pred.days_left !== null ? (
          <span className={pred.days_left <= 7 ? "text-amber-500 font-semibold" : ""}>{pred.days_left}d restantes</span>
        ) : <span>Sem prazo</span>}
        <ExternalLink size={10} className="group-hover:text-zinc-400" />
      </div>
    </a>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = "todas" | "ticker" | "macro" | "setores" | "previsoes" | "reddit";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "todas",     label: "Todas",      icon: <Newspaper size={13}/> },
  { id: "ticker",    label: "Por Ticker",  icon: <Briefcase size={13}/> },
  { id: "macro",     label: "Macro",       icon: <Landmark size={13}/> },
  { id: "setores",   label: "Setores",     icon: <Factory size={13}/> },
  { id: "previsoes", label: "Previsões",   icon: <Activity size={13}/> },
  { id: "reddit",    label: "Reddit",      icon: <MessageSquare size={13}/> },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NoticiasPage() {
  const { data: portfolio } = usePortfolio();

  const [tab, setTab] = useState<Tab>("todas");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [reddit, setReddit] = useState<RedditPost[]>([]);
  const [predictions, setPredictions] = useState<UnifiedPrediction[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [redditLoading, setRedditLoading] = useState(false);
  const [predsLoading, setPredsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [catFilter, setCatFilter] = useState<"all" | "mercado" | "portfolio" | "economia" | "macro" | "setor">("all");
  const [predFilter, setPredFilter] = useState<"all" | "polymarket" | "kalshi" | "metaculus" | "portfolio">("all");

  const portfolioTickers = useMemo(() => {
    if (!portfolio?.positions) return [];
    return portfolio.positions
      .filter((p: { quantidade: number }) => p.quantidade > 0)
      .map((p: { ticker: string }) => p.ticker);
  }, [portfolio]);

  const tickerTapeItems = useMemo(() => {
    if (!portfolio?.positions) return [];
    return (portfolio.positions as Array<{ ticker: string; quantidade: number; precoAtual: number | null; variacaoDia?: number; moeda?: string }>)
      .filter(p => p.quantidade > 0 && (p.precoAtual ?? 0) > 0)
      .slice(0, 30)
      .map(p => ({ ticker: p.ticker, price: p.precoAtual ?? 0, changePct: p.variacaoDia ?? 0, moeda: p.moeda ?? "BRL" }));
  }, [portfolio]);

  // Load news — send ALL tickers now
  useEffect(() => {
    setNewsLoading(true);
    setError(null);
    const t = portfolioTickers.join(",");
    fetch(t ? `/api/noticias?tickers=${encodeURIComponent(t)}` : "/api/noticias")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setNews(d.articles ?? []); })
      .catch(e => setError(e.message))
      .finally(() => setNewsLoading(false));
  }, [portfolioTickers.join(","), refreshKey]); // eslint-disable-line

  // Load predictions lazily
  useEffect(() => {
    if (tab !== "previsoes" || predictions.length > 0) return;
    let cancelled = false;
    setPredsLoading(true);

    (async () => {
      const allPreds: UnifiedPrediction[] = [];

      const [polyRes, kalshiRes, metaculusRes] = await Promise.allSettled([
        fetchPolymarket(portfolioTickers).then(r => {
          const events = Object.values(r.categories).flat();
          return events.map(polyToUnified);
        }),
        fetchKalshi(),
        fetchMetaculus().then(qs => qs.map(q => ({
          id: q.id,
          source: q.source,
          title: q.title,
          url: q.url,
          category: q.category,
          odds: q.odds,
          forecasters: q.forecasters,
          end_date: q.end_date,
          days_left: q.days_left,
          portfolio_impact: q.portfolio_impact,
        } as UnifiedPrediction))),
      ]);

      if (polyRes.status === "fulfilled") allPreds.push(...polyRes.value);
      if (kalshiRes.status === "fulfilled") allPreds.push(...kalshiRes.value.map(k => ({ ...k } as UnifiedPrediction)));
      if (metaculusRes.status === "fulfilled") allPreds.push(...metaculusRes.value);

      if (!cancelled) setPredictions(allPreds);
    })().finally(() => { if (!cancelled) setPredsLoading(false); });

    return () => { cancelled = true; };
  }, [tab, portfolioTickers.join(",")]); // eslint-disable-line

  // Load Reddit lazily
  useEffect(() => {
    if (tab !== "reddit" || reddit.length > 0) return;
    let cancelled = false;
    setRedditLoading(true);

    (async () => {
      try {
        const d = await fetch("/api/reddit").then(r => r.json());
        if (!cancelled && (d.posts?.length ?? 0) > 0) {
          setReddit(d.posts);
          return;
        }
      } catch { /* fall through */ }

      try {
        const posts = await fetchRedditFromBrowser();
        if (!cancelled) setReddit(posts);
      } catch {
        if (!cancelled) setReddit([]);
      }
    })().finally(() => { if (!cancelled) setRedditLoading(false); });

    return () => { cancelled = true; };
  }, [tab]); // eslint-disable-line

  // By-ticker grouping
  const newsByTicker = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    const genericTickers = new Set(["Mercado","Investimentos","Economia","Câmbio","Wall Street","Renda Fixa","COPOM","FOMC","IPCA","Payroll","CPI","PIB","Energia","Financeiro","Varejo","Mineração","Tech","Saúde"]);
    for (const item of news.filter(n => n.categoria === "portfolio" || n.ticker)) {
      const key = item.ticker;
      if (!key || genericTickers.has(key)) continue;
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b.length - a.length);
  }, [news]);

  // Macro news
  const macroNews = useMemo(() => news.filter(n => n.categoria === "macro"), [news]);

  // Sector news
  const sectorNews = useMemo(() => {
    const map = new Map<string, NewsItem[]>();
    for (const item of news.filter(n => n.categoria === "setor")) {
      const arr = map.get(item.ticker) ?? [];
      arr.push(item);
      map.set(item.ticker, arr);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b.length - a.length);
  }, [news]);

  const filteredNews = useMemo(() => {
    if (catFilter === "all") return news;
    return news.filter(n => n.categoria === catFilter);
  }, [news, catFilter]);

  const filteredPreds = useMemo(() => {
    if (predFilter === "all") return predictions;
    if (predFilter === "portfolio") return predictions.filter(p => p.portfolio_impact.length > 0);
    return predictions.filter(p => p.source === predFilter);
  }, [predictions, predFilter]);

  const counts = useMemo(() => ({
    all: news.length,
    mercado: news.filter(n => n.categoria === "mercado").length,
    portfolio: news.filter(n => n.categoria === "portfolio").length,
    economia: news.filter(n => n.categoria === "economia").length,
    macro: news.filter(n => n.categoria === "macro").length,
    setor: news.filter(n => n.categoria === "setor").length,
  }), [news]);

  const predCounts = useMemo(() => ({
    all: predictions.length,
    polymarket: predictions.filter(p => p.source === "polymarket").length,
    kalshi: predictions.filter(p => p.source === "kalshi").length,
    metaculus: predictions.filter(p => p.source === "metaculus").length,
    portfolio: predictions.filter(p => p.portfolio_impact.length > 0).length,
  }), [predictions]);

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <PageHeader title="Inteligência" description="Notícias, macro, setores, mercados preditivos e Reddit" />
        <button onClick={() => { setRefreshKey(k => k + 1); setPredictions([]); }} disabled={newsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07] transition-all disabled:opacity-50 mt-1">
          <RefreshCw size={12} className={newsLoading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      <TickerTape items={tickerTapeItems} />

      {/* Stats bar */}
      {!newsLoading && news.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px] text-zinc-600">
          <span className="flex items-center gap-1"><Newspaper size={11} className="text-cyan-400" /><strong className="text-zinc-400">{news.length}</strong> notícias</span>
          <span className="flex items-center gap-1"><Zap size={11} className="text-red-400" /><strong className="text-zinc-400">{news.filter(n => n.impacto === "alto").length}</strong> alto impacto</span>
          <span className="flex items-center gap-1"><Briefcase size={11} className="text-violet-400" /><strong className="text-zinc-400">{counts.portfolio}</strong> do portfólio</span>
          <span className="flex items-center gap-1"><Landmark size={11} className="text-red-400" /><strong className="text-zinc-400">{counts.macro}</strong> macro</span>
        </div>
      )}

      {/* Main tabs */}
      <div className="flex gap-1.5 mb-5 bg-white/[0.03] p-1 rounded-2xl border border-white/[0.06] overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
              tab === t.id ? "bg-accent/12 text-accent" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {error && tab !== "reddit" && tab !== "previsoes" && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">
          Erro ao carregar notícias: {error}
        </div>
      )}

      {/* ── Tab: Todas ── */}
      {tab === "todas" && (
        <>
          <div className="flex gap-1.5 mb-4 overflow-x-auto">
            {(["all","mercado","portfolio","economia","macro","setor"] as const).map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`flex-shrink-0 flex items-center gap-1.5 py-1 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  catFilter === c ? "bg-white/[0.08] border-white/[0.15] text-zinc-200" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"
                }`}>
                {c === "all" ? <Globe size={11}/> : c === "mercado" ? <BarChart2 size={11}/> : c === "portfolio" ? <Briefcase size={11}/> : c === "economia" ? <TrendingUp size={11}/> : c === "macro" ? <Landmark size={11}/> : <Factory size={11}/>}
                {c === "all" ? "Todas" : CAT_LBL[c] ?? c}
                <span className="opacity-50 text-[10px]">{counts[c]}</span>
              </button>
            ))}
          </div>
          {newsLoading ? <div className="columns-1 md:columns-2 lg:columns-3 gap-3 space-y-3">{Array.from({length:9}).map((_,i)=><div key={i} className="break-inside-avoid p-4 rounded-2xl border border-white/[0.07] bg-zinc-950/60 animate-pulse h-32"/>)}</div>
            : filteredNews.length === 0 ? <div className="text-center py-20 text-zinc-600"><Newspaper size={40} className="mx-auto mb-3 opacity-30"/><p className="text-sm">Nenhuma notícia disponível.</p></div>
            : <div className="columns-1 md:columns-2 lg:columns-3 gap-3 space-y-3">{filteredNews.map((item,i)=><div key={i} className="break-inside-avoid"><NewsCard item={item}/></div>)}</div>
          }
        </>
      )}

      {/* ── Tab: Por Ticker ── */}
      {tab === "ticker" && (
        newsLoading ? <LoadingSpinner /> : (
          <div className="space-y-6">
            {newsByTicker.length === 0
              ? <div className="text-center py-20 text-zinc-600"><Briefcase size={40} className="mx-auto mb-3 opacity-30"/><p className="text-sm">Nenhuma notícia por ticker.</p></div>
              : newsByTicker.map(([ticker, items]) => (
                  <div key={ticker}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-zinc-100">{ticker.replace(".SA","")}</span>
                      <span className="text-[10px] text-zinc-600">{items.length} artigos</span>
                      {items.some(i => i.impacto === "alto") && <Zap size={11} className="text-red-400" />}
                      <div className="flex-1 h-px bg-white/[0.05]" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {items.slice(0, 6).map((item, i) => <NewsCard key={i} item={item} />)}
                    </div>
                  </div>
                ))
            }
          </div>
        )
      )}

      {/* ── Tab: Macro ── */}
      {tab === "macro" && (
        newsLoading ? <LoadingSpinner /> : (
          <div>
            <p className="text-xs text-zinc-600 mb-4">Decisões de política monetária, inflação, emprego, PIB e eventos macroeconômicos globais</p>
            {macroNews.length === 0
              ? <div className="text-center py-20 text-zinc-600"><Landmark size={40} className="mx-auto mb-3 opacity-30"/><p className="text-sm">Nenhuma notícia macro disponível.</p></div>
              : <div className="columns-1 md:columns-2 lg:columns-3 gap-3 space-y-3">{macroNews.map((item,i)=><div key={i} className="break-inside-avoid"><NewsCard item={item}/></div>)}</div>
            }
          </div>
        )
      )}

      {/* ── Tab: Setores ── */}
      {tab === "setores" && (
        newsLoading ? <LoadingSpinner /> : (
          <div className="space-y-6">
            <p className="text-xs text-zinc-600">Notícias por setor da economia — energia, financeiro, varejo, mineração, tech e saúde</p>
            {sectorNews.length === 0
              ? <div className="text-center py-20 text-zinc-600"><Factory size={40} className="mx-auto mb-3 opacity-30"/><p className="text-sm">Nenhuma notícia setorial disponível.</p></div>
              : sectorNews.map(([sector, items]) => (
                  <div key={sector}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm font-bold text-emerald-400">{sector}</span>
                      <span className="text-[10px] text-zinc-600">{items.length} artigos</span>
                      <div className="flex-1 h-px bg-emerald-500/10" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {items.slice(0, 6).map((item, i) => <NewsCard key={i} item={item} />)}
                    </div>
                  </div>
                ))
            }
          </div>
        )
      )}

      {/* ── Tab: Previsões ── */}
      {tab === "previsoes" && (
        predsLoading ? <LoadingSpinner /> : (
          <div>
            <p className="text-xs text-zinc-600 mb-4">
              Apostas e previsões de Polymarket, Kalshi e Metaculus com correlação ao portfólio
            </p>

            {/* Source filters */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto">
              {(["all", "portfolio", "polymarket", "kalshi", "metaculus"] as const).map(f => (
                <button key={f} onClick={() => setPredFilter(f)}
                  className={`flex-shrink-0 flex items-center gap-1.5 py-1 px-3 rounded-xl text-xs font-semibold border transition-all ${
                    predFilter === f ? "bg-white/[0.08] border-white/[0.15] text-zinc-200" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"
                  }`}>
                  {f === "all" ? <Globe size={11}/> : f === "portfolio" ? <Briefcase size={11}/> : <Activity size={11}/>}
                  {f === "all" ? "Todas" : f === "portfolio" ? "Meu Portfólio" : SOURCE_LABEL[f] ?? f}
                  <span className="opacity-50 text-[10px]">{predCounts[f]}</span>
                </button>
              ))}
            </div>

            {/* Source summary */}
            {predictions.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px] text-zinc-600">
                {predCounts.polymarket > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" />{predCounts.polymarket} Polymarket</span>}
                {predCounts.kalshi > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-400" />{predCounts.kalshi} Kalshi</span>}
                {predCounts.metaculus > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{predCounts.metaculus} Metaculus</span>}
                <span className="flex items-center gap-1"><Briefcase size={10} className="text-violet-400" />{predCounts.portfolio} correlatas ao portfólio</span>
              </div>
            )}

            {filteredPreds.length === 0
              ? <div className="text-center py-20 text-zinc-600"><Activity size={40} className="mx-auto mb-3 opacity-30"/><p className="text-sm">Nenhuma previsão disponível.</p></div>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredPreds.map(pred => <PredictionCard key={`${pred.source}-${pred.id}`} pred={pred} />)}
                </div>
            }
          </div>
        )
      )}

      {/* ── Tab: Reddit ── */}
      {tab === "reddit" && (
        redditLoading ? <LoadingSpinner /> : (
          <div>
            <p className="text-xs text-zinc-600 mb-4">Posts mais votados de r/investimentos, r/farialimabets, r/bolsa, r/stocks, r/wallstreetbets e r/dividends</p>
            {reddit.length === 0
              ? <div className="text-center py-20 text-zinc-600">
                  <MessageSquare size={40} className="mx-auto mb-3 opacity-30"/>
                  <p className="text-sm">Não foi possível carregar o Reddit.</p>
                  <p className="text-xs text-zinc-700 mt-2 max-w-sm mx-auto">
                    O Reddit bloqueia o servidor da Vercel. Para acesso garantido, configure
                    <span className="font-mono text-zinc-500"> REDDIT_CLIENT_ID</span> e
                    <span className="font-mono text-zinc-500"> REDDIT_CLIENT_SECRET</span> nas variáveis de ambiente.
                  </p>
                </div>
              : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {reddit.map(p => <RedditCard key={p.id} post={p} />)}
                </div>
            }
          </div>
        )
      )}

    </>
  );
}
