"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Newspaper, RefreshCw, Briefcase, Globe, Clock,
  ExternalLink, TrendingUp, MessageSquare, ArrowUp, BarChart2,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { NewsItem } from "@/app/api/noticias/route";
import { type RedditPost, fetchRedditFromBrowser } from "@/lib/reddit";

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

// ─── News Card ────────────────────────────────────────────────────────────────

const CAT_CLS: Record<string, string> = {
  mercado: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  portfolio: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  economia: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};
const CAT_LBL: Record<string, string> = { mercado: "Mercado", portfolio: "Portfólio", economia: "Economia" };

function timeAgo(d: string) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a href={item.link} target="_blank" rel="noopener noreferrer"
      className="group flex flex-col gap-2 p-4 rounded-2xl border border-white/[0.07] border-l-2 border-l-cyan-500/40 bg-zinc-950/60 hover:border-white/[0.12] hover:border-l-cyan-400 hover:bg-white/[0.03] transition-all duration-200 no-underline">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-500 truncate">{item.fonte}</span>
        <span className="flex items-center gap-1 text-[11px] text-zinc-700 flex-shrink-0"><Clock size={10}/>{timeAgo(item.data)}</span>
      </div>
      <div className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-3 group-hover:text-white">{item.titulo}</div>
      <div className="flex items-center justify-between mt-auto">
        <div className="flex gap-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CAT_CLS[item.categoria] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>{CAT_LBL[item.categoria] ?? item.categoria}</span>
          {item.ticker && !["Mercado","Investimentos","Economia","Câmbio"].includes(item.ticker) && (
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

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type Tab = "todas" | "reddit" | "ticker";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "todas",  label: "Todas",      icon: <Newspaper size={13}/> },
  { id: "ticker", label: "Por Ticker", icon: <Briefcase size={13}/> },
  { id: "reddit", label: "Reddit",     icon: <MessageSquare size={13}/> },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NoticiasPage() {
  const { data: portfolio } = usePortfolio();

  const [tab, setTab] = useState<Tab>("todas");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [reddit, setReddit] = useState<RedditPost[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [redditLoading, setRedditLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [catFilter, setCatFilter] = useState<"all" | "mercado" | "portfolio" | "economia">("all");

  const portfolioTickers = useMemo(() => {
    if (!portfolio?.positions) return [];
    return portfolio.positions
      .filter((p: { quantidade: number }) => p.quantidade > 0)
      .slice(0, 20)
      .map((p: { ticker: string }) => p.ticker);
  }, [portfolio]);

  const tickerTapeItems = useMemo(() => {
    if (!portfolio?.positions) return [];
    return (portfolio.positions as Array<{ ticker: string; quantidade: number; precoAtual: number | null; variacaoDia?: number; moeda?: string }>)
      .filter(p => p.quantidade > 0 && (p.precoAtual ?? 0) > 0)
      .slice(0, 30)
      .map(p => ({ ticker: p.ticker, price: p.precoAtual ?? 0, changePct: p.variacaoDia ?? 0, moeda: p.moeda ?? "BRL" }));
  }, [portfolio]);

  // Load news
  useEffect(() => {
    setNewsLoading(true);
    setError(null);
    const t = portfolioTickers.slice(0, 8).join(",");
    fetch(t ? `/api/noticias?tickers=${encodeURIComponent(t)}` : "/api/noticias")
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setNews(d.articles ?? []); })
      .catch(e => setError(e.message))
      .finally(() => setNewsLoading(false));
  }, [portfolioTickers.join(","), refreshKey]); // eslint-disable-line

  // Load Reddit lazily.
  // 1) Try the server route (uses official OAuth API when credentials are set).
  // 2) If the server is blocked (datacenter IP) and returns nothing, fetch
  //    directly from the user's browser (residential IP isn't blocked by Reddit).
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
      } catch { /* fall through to client-side */ }

      // Server returned nothing → try fetching from the browser directly.
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
    for (const item of news.filter(n => n.categoria === "portfolio" || n.ticker)) {
      const key = item.ticker;
      if (!key || ["Mercado","Investimentos","Economia","Câmbio"].includes(key)) continue;
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => b.length - a.length);
  }, [news]);

  const filteredNews = useMemo(() => {
    if (catFilter === "all") return news;
    return news.filter(n => n.categoria === catFilter);
  }, [news, catFilter]);

  const counts = useMemo(() => ({
    all: news.length,
    mercado: news.filter(n => n.categoria === "mercado").length,
    portfolio: news.filter(n => n.categoria === "portfolio").length,
    economia: news.filter(n => n.categoria === "economia").length,
  }), [news]);

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <PageHeader title="Notícias" description="Feed financeiro — notícias, Reddit e mercados de previsão" />
        <button onClick={() => setRefreshKey(k => k + 1)} disabled={newsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07] transition-all disabled:opacity-50 mt-1">
          <RefreshCw size={12} className={newsLoading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      <TickerTape items={tickerTapeItems} />

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

      {error && tab !== "reddit" && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">
          Erro ao carregar notícias: {error}
        </div>
      )}

      {/* ── Tab: Todas ── */}
      {tab === "todas" && (
        <>
          <div className="flex gap-1.5 mb-4 overflow-x-auto">
            {(["all","mercado","portfolio","economia"] as const).map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`flex-shrink-0 flex items-center gap-1.5 py-1 px-3 rounded-xl text-xs font-semibold border transition-all ${
                  catFilter === c ? "bg-white/[0.08] border-white/[0.15] text-zinc-200" : "border-white/[0.06] text-zinc-500 hover:text-zinc-300"
                }`}>
                {c === "all" ? <Globe size={11}/> : c === "mercado" ? <BarChart2 size={11}/> : c === "portfolio" ? <Briefcase size={11}/> : <TrendingUp size={11}/>}
                {c === "all" ? "Todas" : CAT_LBL[c]}
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
