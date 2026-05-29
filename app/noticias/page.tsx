"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Newspaper, RefreshCw, TrendingUp, TrendingDown, Minus,
  Globe, BarChart2, Briefcase, Clock, ExternalLink, Filter,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import type { NewsItem } from "@/app/api/noticias/route";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
    return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function cleanLink(url: string): string {
  // Google News proxies links through a redirect; pass as-is
  return url;
}

// ─── Ticker Tape ──────────────────────────────────────────────────────────────

interface TickerItem {
  ticker: string;
  price: number;
  changePct: number;
  moeda: string;
}

function TickerTape({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  const html = items
    .map(item => {
      const cls = item.changePct > 0 ? "text-emerald-400" : item.changePct < 0 ? "text-red-400" : "text-zinc-500";
      const arrow = item.changePct > 0 ? "▲" : item.changePct < 0 ? "▼" : "▬";
      const sign = item.changePct > 0 ? "+" : "";
      const priceStr = item.price >= 100
        ? item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : item.price >= 1
        ? item.price.toFixed(2)
        : item.price.toFixed(4);

      return (
        `<span class="inline-flex items-center gap-2 px-5 border-r border-white/[0.06]">` +
        `<span class="text-xs font-black text-zinc-200 tracking-wide">${item.ticker}</span>` +
        `<span class="text-xs text-zinc-500 tabular-nums">${item.moeda === "USD" ? "US$" : "R$"} ${priceStr}</span>` +
        `<span class="text-xs font-bold tabular-nums ${cls}">${arrow} ${sign}${item.changePct.toFixed(2)}%</span>` +
        `</span>`
      );
    })
    .join("");

  const doubled = html + html;
  const dur = Math.max(20, items.length * 5);

  return (
    <div className="relative h-11 flex items-center bg-black/40 border border-white/[0.07] rounded-2xl overflow-hidden mb-6">
      {/* LIVE badge */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-white/[0.07] h-full bg-emerald-900/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">Ao Vivo</span>
      </div>
      {/* Scrolling track */}
      <div
        className="flex-1 overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)",
        }}
      >
        <div
          dangerouslySetInnerHTML={{ __html: doubled }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            whiteSpace: "nowrap",
            animation: `tickerScroll ${dur}s linear infinite`,
          }}
        />
      </div>
      <style>{`
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// ─── News Card ────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  mercado: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  portfolio: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  economia: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const CAT_LABELS: Record<string, string> = {
  mercado: "Mercado",
  portfolio: "Portfólio",
  economia: "Economia",
};

function NewsCard({ item }: { item: NewsItem }) {
  const catCls = CAT_COLORS[item.categoria] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  const catLabel = CAT_LABELS[item.categoria] ?? item.categoria;
  const ago = timeAgo(item.data);

  return (
    <a
      href={cleanLink(item.link)}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2.5 p-4 rounded-2xl border border-white/[0.07] border-l-2
                 border-l-cyan-500/40 bg-zinc-950/60 backdrop-blur-sm
                 hover:border-white/[0.12] hover:border-l-cyan-400 hover:bg-white/[0.03]
                 transition-all duration-200 cursor-pointer no-underline"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-zinc-500 truncate">{item.fonte}</span>
        <span className="flex items-center gap-1 text-[11px] text-zinc-700 flex-shrink-0">
          <Clock size={10} />
          {ago}
        </span>
      </div>

      <div className="text-sm font-semibold text-zinc-200 leading-snug line-clamp-3 group-hover:text-white transition-colors">
        {item.titulo}
      </div>

      <div className="flex items-center justify-between mt-auto pt-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${catCls}`}>
            {catLabel}
          </span>
          {item.ticker && item.ticker !== "Mercado" && item.ticker !== "Investimentos" && item.ticker !== "Economia" && item.ticker !== "Câmbio" && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-500 border border-white/[0.08]">
              {item.ticker}
            </span>
          )}
        </div>
        <span className="text-[11px] text-zinc-700 group-hover:text-zinc-400 transition-colors flex items-center gap-1">
          Ler <ExternalLink size={10} />
        </span>
      </div>
    </a>
  );
}

// ─── Skeleton Cards ───────────────────────────────────────────────────────────

function SkeletonCards() {
  return (
    <div className="columns-1 md:columns-2 lg:columns-3 gap-3 space-y-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="break-inside-avoid p-4 rounded-2xl border border-white/[0.07] bg-zinc-950/60 animate-pulse"
        >
          <div className="h-2.5 w-2/5 bg-zinc-800 rounded mb-3" />
          <div className="h-3.5 w-full bg-zinc-800 rounded mb-2" />
          <div className="h-3.5 w-4/5 bg-zinc-800 rounded mb-2" />
          <div className="h-3.5 w-3/5 bg-zinc-800 rounded mb-3" />
          <div className="h-2 w-1/4 bg-zinc-800/60 rounded" />
        </div>
      ))}
    </div>
  );
}

// ─── Category filter tabs ─────────────────────────────────────────────────────

type Category = "all" | "mercado" | "portfolio" | "economia";

const CAT_TABS: { id: Category; label: string; icon: React.ReactNode }[] = [
  { id: "all", label: "Todas", icon: <Newspaper size={13} /> },
  { id: "mercado", label: "Mercado", icon: <BarChart2 size={13} /> },
  { id: "portfolio", label: "Portfólio", icon: <Briefcase size={13} /> },
  { id: "economia", label: "Economia", icon: <Globe size={13} /> },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NoticiasPage() {
  const { data: portfolio } = usePortfolio();
  const [articles, setArticles] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Get portfolio tickers for the ticker tape and news
  const portfolioTickers = useMemo(() => {
    if (!portfolio?.positions) return [];
    return portfolio.positions
      .filter((p: { quantidade: number }) => p.quantidade > 0)
      .slice(0, 20)
      .map((p: { ticker: string }) => p.ticker as string);
  }, [portfolio]);

  // Ticker tape data from portfolio positions
  const tickerTapeItems = useMemo((): TickerItem[] => {
    if (!portfolio?.positions) return [];
    return (portfolio.positions as Array<{
      ticker: string; quantidade: number; precoAtual: number | null; variacaoDia?: number; moeda?: string;
    }>)
      .filter(p => p.quantidade > 0 && (p.precoAtual ?? 0) > 0)
      .slice(0, 30)
      .map(p => ({
        ticker: p.ticker.replace(".SA", ""),
        price: p.precoAtual ?? 0,
        changePct: p.variacaoDia ?? 0,
        moeda: p.moeda ?? "BRL",
      }));
  }, [portfolio]);

  // Fetch news
  useEffect(() => {
    setLoading(true);
    setError(null);

    const tickersParam = portfolioTickers.slice(0, 8).join(",");
    const url = tickersParam
      ? `/api/noticias?tickers=${encodeURIComponent(tickersParam)}`
      : "/api/noticias";

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setArticles(data.articles ?? []);
        setLastUpdated(new Date());
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [portfolioTickers.join(","), refreshKey]); // eslint-disable-line

  const filtered = useMemo(() => {
    if (category === "all") return articles;
    return articles.filter(a => a.categoria === category);
  }, [articles, category]);

  // Counts per category
  const counts = useMemo(() => {
    return {
      all: articles.length,
      mercado: articles.filter(a => a.categoria === "mercado").length,
      portfolio: articles.filter(a => a.categoria === "portfolio").length,
      economia: articles.filter(a => a.categoria === "economia").length,
    };
  }, [articles]);

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <PageHeader title="Notícias" description="Feed de notícias financeiras do mercado e do portfólio" />
        <div className="flex items-center gap-3 mt-1">
          {lastUpdated && (
            <span className="text-xs text-zinc-700">
              {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]
                       text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.07] transition-all
                       disabled:opacity-50 disabled:cursor-wait"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Ticker tape */}
      <TickerTape items={tickerTapeItems} />

      {/* Category tabs */}
      <div className="flex gap-1.5 mb-5 bg-white/[0.03] p-1 rounded-2xl border border-white/[0.06] overflow-x-auto">
        {CAT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setCategory(tab.id)}
            className={`flex-shrink-0 flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
              category === tab.id
                ? "bg-accent/12 text-accent shadow-[inset_0_0_20px_rgba(212,165,116,0.05)]"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className="ml-0.5 text-[10px] opacity-50">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400">
          Erro ao carregar notícias: {error}. Tente atualizar.
        </div>
      )}

      {/* Loading skeleton */}
      {loading && <SkeletonCards />}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-20 text-zinc-700">
          <Newspaper size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma notícia encontrada para esta categoria.</p>
        </div>
      )}

      {/* News grid — masonry columns */}
      {!loading && filtered.length > 0 && (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-3 space-y-3">
          {filtered.map((item, i) => (
            <div key={i} className="break-inside-avoid">
              <NewsCard item={item} />
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {!loading && filtered.length > 0 && (
        <p className="text-center text-xs text-zinc-800 mt-6">
          {filtered.length} artigos · Fonte: Google News RSS · Atualizado a cada 5 minutos
        </p>
      )}
    </>
  );
}
