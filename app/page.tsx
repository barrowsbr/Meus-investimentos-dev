"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ExternalLink, Newspaper, Clock, AlertTriangle } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import type { PortfolioResponse } from "@/lib/hooks";
import { compactBRL, pct } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";
import type { PolyEvent } from "@/lib/polymarket";

// ── Error Boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="p-4 text-center" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
          <p className="text-xs text-red-400 font-semibold mb-1">Erro ao renderizar</p>
          <p className="text-[10px] text-zinc-500 break-all">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface TickerItem {
  ticker: string;
  label: string;
  price: number;
  changePct: number;
  moeda: string;
}

interface NewsArticle {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  ticker: string;
  categoria: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanTicker(t: string | null | undefined): string {
  if (!t) return "—";
  return t.replace(/\.SA$/, "").replace(/-USD$/, "").replace(/-BRL$/, "").replace(/=X$/, "");
}

function fmtPrice(price: number, moeda: string): string {
  if (!isFinite(price)) return "—";
  if (moeda === "BRL") {
    return `R$${price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const decimals = price >= 1000 ? 0 : 2;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
    if (diffH < 1) return "agora";
    if (diffH < 24) return `há ${diffH}h`;
    return `há ${Math.floor(diffH / 24)}d`;
  } catch { return ""; }
}

// ── TickerTape ───────────────────────────────────────────────────────────────

function TickerTape({ items }: { items: TickerItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const duration = Math.max(18, items.length * 4);
  if (items.length === 0) return null;

  const best5 = items.slice(0, 5);
  const worst5 = [...items].reverse().slice(0, 5);

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-stretch overflow-hidden"
        style={{ height: 38, cursor: "pointer" }}
      >
        <div className="shrink-0 flex items-center gap-1.5 px-3 border-r"
          style={{ borderColor: "var(--line)", background: "rgba(232,163,61,0.06)" }}>
          <span className="w-[5px] h-[5px] rounded-full animate-pulse" style={{ background: "var(--pos)" }} />
          <span className="text-[9px] font-extrabold tracking-[2px] whitespace-nowrap font-mono" style={{ color: "var(--accent)" }}>
            {expanded ? "▼" : "▶"}
          </span>
        </div>

        <div className="flex-1 overflow-hidden flex items-center"
          style={{ maskImage: "linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%)" }}>
          <div
            className="inline-flex items-center whitespace-nowrap"
            style={{ animation: `tickerScroll ${duration}s linear infinite` }}
          >
            {[...items, ...items].map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-4 font-mono" style={{ fontSize: 12 }}>
                <span className="font-bold" style={{ color: "var(--text)" }}>{p.label}</span>
                <span className="tnum" style={{ color: "var(--muted)" }}>{fmtPrice(p.price, p.moeda)}</span>
                <span className="font-bold tnum" style={{ color: (p.changePct ?? 0) >= 0 ? "var(--pos)" : "var(--neg)" }}>
                  {(p.changePct ?? 0) > 0 ? "▲" : (p.changePct ?? 0) < 0 ? "▼" : "▬"} {(p.changePct ?? 0) >= 0 ? "+" : ""}{(p.changePct ?? 0).toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-0" style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ borderRight: "1px solid var(--line)" }}>
            <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--line)", background: "rgba(63,185,80,0.06)" }}>
              <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--pos)" }}>Top 5 Altas</span>
            </div>
            {best5.map((p) => (
              <div key={p.ticker} className="flex items-center justify-between px-3 py-1.5 font-mono" style={{ fontSize: 11, borderBottom: "1px solid var(--line)" }}>
                <span className="font-bold" style={{ color: "var(--text)" }}>{p.label}</span>
                <span className="font-bold tnum" style={{ color: "var(--pos)" }}>+{(p.changePct).toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div>
            <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--line)", background: "rgba(240,80,74,0.06)" }}>
              <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--neg)" }}>Top 5 Baixas</span>
            </div>
            {worst5.map((p) => (
              <div key={p.ticker} className="flex items-center justify-between px-3 py-1.5 font-mono" style={{ fontSize: 11, borderBottom: "1px solid var(--line)" }}>
                <span className="font-bold" style={{ color: "var(--text)" }}>{p.label}</span>
                <span className="font-bold tnum" style={{ color: "var(--neg)" }}>{(p.changePct).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── RadarDoDia (left column) ────────────────────────────────────────────────

function RadarDoDia({ tickerItems }: { tickerItems: TickerItem[] }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);

  const top3 = useMemo(() => {
    if (tickerItems.length === 0) return [];
    const best = tickerItems.slice(0, 2);
    const worst = tickerItems.slice(-1);
    return [...best, ...worst].slice(0, 3);
  }, [tickerItems]);

  const tickerStr = useMemo(() => top3.map(t => t.ticker).join(","), [top3]);

  useEffect(() => {
    if (!tickerStr) return;
    fetch(`/api/noticias?tickers=${tickerStr}`)
      .then(r => r.json())
      .then(d => setArticles(d.articles ?? []))
      .catch(() => {});
  }, [tickerStr]);

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).toUpperCase().replace(".", "");

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line-strong)" }}>
        <div className="flex items-center gap-2">
          <span className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: "var(--pos)" }} />
          <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>
            Radar do Dia · Destaques
          </span>
        </div>
        <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{today}</span>
      </div>

      {top3.map((item, idx) => {
        const article = articles.find(a => a.ticker === item.ticker || a.ticker === item.label);
        const isUp = (item.changePct ?? 0) >= 0;
        return (
          <a
            key={item.ticker}
            href={article?.link || undefined}
            target={article?.link ? "_blank" : undefined}
            rel={article?.link ? "noopener noreferrer" : undefined}
            onClick={article?.link ? undefined : (e) => e.preventDefault()}
            className="flex items-start gap-3 px-4 py-3 transition-colors"
            style={{
              borderBottom: idx < top3.length - 1 ? "1px solid var(--line)" : undefined,
              cursor: article?.link ? "pointer" : "default",
            }}
          >
            <span
              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 font-mono text-[10px] font-bold tracking-wide"
              style={{
                background: isUp ? "rgba(63,185,80,0.12)" : "rgba(240,80,74,0.12)",
                color: isUp ? "var(--pos)" : "var(--neg)",
                border: `1px solid ${isUp ? "rgba(63,185,80,0.25)" : "rgba(240,80,74,0.25)"}`,
                marginTop: 2,
              }}
            >
              {isUp ? "▲" : "▼"} {item.label} {(item.changePct ?? 0) >= 0 ? "+" : ""}{(item.changePct ?? 0).toFixed(1)} %
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold leading-snug line-clamp-2" style={{ fontSize: 14, color: "var(--text)" }}>
                {article?.titulo ?? `${item.label} ${isUp ? "em alta" : "em queda"} no pregão`}
              </p>
              {article && (
                <p className="font-mono text-[10px] mt-1" style={{ color: "var(--faint)" }}>
                  {article.fonte}{article.data ? ` · ${timeAgo(article.data)}` : ""}
                </p>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ── MercadoPreditivo (right column) ─────────────────────────────────────────

function MercadoPreditivo({ data }: { data: PortfolioResponse }) {
  const [polyEvents, setPolyEvents] = useState<PolyEvent[]>([]);
  const [polyIdx, setPolyIdx] = useState(0);
  const [polyLoading, setPolyLoading] = useState(true);

  const positionCount = data?.positions?.length ?? 0;
  const positionTickers = useMemo(
    () => {
      try {
        return (data?.positions ?? []).map(p => p?.ticker ?? "").filter(Boolean).join(",");
      } catch { return ""; }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [positionCount]
  );

  useEffect(() => {
    if (!positionTickers) return;
    let cancelled = false;
    import("@/lib/polymarket")
      .then(({ fetchPolymarket }) => fetchPolymarket(positionTickers.split(",")))
      .then(resp => {
        if (cancelled) return;
        const cats = resp?.categories;
        if (!cats || typeof cats !== "object") return;
        const all = Object.values(cats).flat();
        const filtered = all.filter(e => e && Array.isArray(e.odds) && e.odds.length > 0 && (e.volume ?? 0) >= 100);
        setPolyEvents(filtered.sort(() => Math.random() - 0.5).slice(0, 12));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPolyLoading(false); });
    return () => { cancelled = true; };
  }, [positionTickers]);

  const nextPoly = useCallback(() => {
    setPolyIdx(i => polyEvents.length > 0 ? (i + 1) % polyEvents.length : 0);
  }, [polyEvents.length]);

  const ev = polyEvents[polyIdx] ?? null;

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line-strong)" }}>
        <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>
          Mercado Preditivo
        </span>
        <span className="font-mono text-[10px] font-bold tracking-wider uppercase" style={{ color: "var(--accent)" }}>
          POLYMARKET
        </span>
      </div>

      {polyLoading ? (
        <div className="px-4 py-8 text-center">
          <span className="text-xs font-mono animate-pulse" style={{ color: "var(--muted)" }}>Carregando eventos...</span>
        </div>
      ) : !ev ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>Polymarket indisponível</p>
        </div>
      ) : (
        <div className="px-4 py-4">
          <p className="font-semibold leading-snug mb-3" style={{ fontSize: 15, color: "var(--text)" }}>
            {ev.title}
          </p>
          <div className="flex flex-col gap-[6px] mb-3">
            {(Array.isArray(ev.odds) ? ev.odds : []).slice(0, 3).map((o, j) => {
              if (!o) return null;
              const barColors = [
                { bg: "rgba(232,163,61,0.14)", border: "rgba(232,163,61,0.4)", text: "var(--accent)" },
                { bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.35)", text: "#818cf8" },
                { bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.3)", text: "#a78bfa" },
              ];
              const c = barColors[j] ?? barColors[2];
              const p = typeof o.percent === "number" ? o.percent : 0;
              return (
                <div key={j} className="relative flex items-center gap-2 py-[6px] px-3 font-mono" style={{ background: "var(--hover)", fontSize: 12 }}>
                  <div className="absolute left-0 top-0 bottom-0" style={{
                    width: `${p}%`,
                    background: c.bg,
                    borderRight: `2px solid ${c.border}`,
                  }} />
                  <span className={`relative z-[1] flex-1 truncate ${j === 0 ? "font-bold" : ""}`} style={{ color: "var(--text)" }}>
                    {String(o.outcome ?? "").slice(0, 35)}
                  </span>
                  <span className="relative z-[1] font-bold shrink-0" style={{ color: c.text }}>
                    {p.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between font-mono" style={{ fontSize: 10, color: "var(--muted)" }}>
            <span>
              Vol <b style={{ color: "var(--text-2)" }}>
                {(ev.volume ?? 0) >= 1_000_000 ? `$${((ev.volume ?? 0) / 1_000_000).toFixed(1)}M`
                  : (ev.volume ?? 0) >= 1_000 ? `$${((ev.volume ?? 0) / 1_000).toFixed(0)}k`
                  : `$${ev.volume ?? 0}`}
              </b>
              {ev.days_left != null && (
                ev.days_left === 0 ? " · resolve hoje"
                  : ev.days_left <= 7 ? ` · ${ev.days_left}d restantes`
                  : ` · resolve ${ev.days_left}d`
              )}
            </span>
            <span className="font-semibold" style={{ color: "var(--accent)" }}>Ver no Polymarket →</span>
          </div>
        </div>
      )}

      {polyEvents.length > 1 && (
        <div className="flex items-center justify-between px-4 py-2" style={{ borderTop: "1px solid var(--line)" }}>
          <span className="font-mono text-[10px]" style={{ color: "var(--faint)" }}>{polyIdx + 1} / {polyEvents.length}</span>
          <button
            onClick={nextPoly}
            className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-2 py-1 transition-colors"
            style={{ color: "var(--accent)", border: "1px solid var(--line)" }}
          >
            <ChevronRight size={10} />
            Próximo
          </button>
        </div>
      )}
    </div>
  );
}

// ── NoticiasDestaques (news panel with images) ─────────────────────────────

interface DestaqueItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem: string | null;
  categoria: string;
  impacto: "alto" | "medio" | "baixo";
}

const IMPACTO_STYLE = {
  alto: { bg: "rgba(240,80,74,0.10)", border: "rgba(240,80,74,0.3)", color: "var(--neg)", label: "ALTO" },
  medio: { bg: "rgba(232,163,61,0.10)", border: "rgba(232,163,61,0.3)", color: "var(--accent)", label: "MÉDIO" },
  baixo: { bg: "var(--hover)", border: "var(--line)", color: "var(--muted)", label: "BAIXO" },
};

function NoticiasDestaques() {
  const [articles, setArticles] = useState<DestaqueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/noticias/destaques")
      .then(r => r.json())
      .then(d => setArticles(d.articles ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line-strong)" }}>
          <div className="flex items-center gap-2">
            <Newspaper size={13} style={{ color: "var(--accent)" }} />
            <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>
              Notícias · Destaques
            </span>
          </div>
        </div>
        <div className="px-4 py-10 text-center">
          <span className="text-xs font-mono animate-pulse" style={{ color: "var(--muted)" }}>Buscando notícias...</span>
        </div>
      </div>
    );
  }

  if (articles.length === 0) return null;

  const featured = articles[0];
  const rest = articles.slice(1, 7);

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line-strong)" }}>
        <div className="flex items-center gap-2">
          <Newspaper size={13} style={{ color: "var(--accent)" }} />
          <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>
            Notícias · Destaques
          </span>
        </div>
        <Link
          href="/noticias"
          className="font-mono text-[10px] font-semibold transition-opacity hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          Ver tudo →
        </Link>
      </div>

      {/* Featured article */}
      <a
        href={featured.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group block transition-colors hover:bg-white/[0.02]"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex flex-col md:flex-row">
          <div
            className="relative h-[180px] md:h-auto md:w-[280px] shrink-0 overflow-hidden flex items-center justify-center"
            style={{ background: "var(--hover)" }}
          >
            {featured.imagem ? (
              <img
                src={featured.imagem}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <Newspaper size={32} style={{ color: "var(--muted)", opacity: 0.3 }} />
            )}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%)" }} />
          </div>
          <div className="flex flex-1 flex-col justify-between p-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {(() => { const s = IMPACTO_STYLE[featured.impacto]; return (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
                    {featured.impacto === "alto" && <AlertTriangle size={8} />}
                    {s.label}
                  </span>
                ); })()}
                <span className="font-mono text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  {featured.categoria}
                </span>
              </div>
              <h3 className="font-semibold leading-snug line-clamp-3 group-hover:underline decoration-1 underline-offset-2" style={{ fontSize: 18, color: "var(--text)" }}>
                {featured.titulo}
              </h3>
            </div>
            <div className="flex items-center gap-2 mt-3 font-mono text-[10px]" style={{ color: "var(--faint)" }}>
              <span className="font-semibold" style={{ color: "var(--muted)" }}>{featured.fonte}</span>
              {featured.data && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock size={9} /> {timeAgo(featured.data)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </a>

      {/* Grid of remaining articles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {rest.map((article, i) => {
          const sty = IMPACTO_STYLE[article.impacto];
          const isLast = i === rest.length - 1;
          const isRightEdge = (i + 1) % 3 === 0;
          return (
            <a
              key={i}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 p-3 transition-colors hover:bg-white/[0.02]"
              style={{
                borderBottom: isLast ? undefined : "1px solid var(--line)",
                borderRight: isRightEdge ? undefined : "1px solid var(--line)",
              }}
            >
              <div
                className="relative h-[64px] w-[88px] shrink-0 overflow-hidden rounded-sm flex items-center justify-center"
                style={{ background: "var(--hover)" }}
              >
                {article.imagem ? (
                  <img
                    src={article.imagem}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Newspaper size={16} style={{ color: "var(--muted)", opacity: 0.3 }} />
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between min-w-0">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-mono text-[8px] font-bold px-1 py-0.5" style={{ background: sty.bg, border: `1px solid ${sty.border}`, color: sty.color }}>
                      {sty.label}
                    </span>
                    <span className="font-mono text-[8px] font-semibold uppercase tracking-wider" style={{ color: "var(--faint)" }}>
                      {article.categoria}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:underline decoration-1 underline-offset-2" style={{ color: "var(--text)" }}>
                    {article.titulo}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[9px]" style={{ color: "var(--faint)" }}>
                  <span>{article.fonte}</span>
                  {article.data && (
                    <>
                      <span>·</span>
                      <span>{timeAgo(article.data)}</span>
                    </>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

interface IndexQuote {
  price: number;
  changePct: number;
}

export default function HomePage() {
  const { data, loading } = usePortfolio();
  const [nasdaq, setNasdaq] = useState<IndexQuote | null>(null);

  useEffect(() => {
    fetch("/api/bolsas")
      .then((r) => r.json())
      .then((d) => {
        const ndx = (d?.indices ?? []).find((i: { symbol: string }) => i.symbol === "^NDX");
        if (ndx) setNasdaq({ price: ndx.price, changePct: ndx.changePct });
      })
      .catch(() => {});
  }, []);

  const totalBRL = typeof data?.totalPatrimonioBRL === "number" ? data.totalPatrimonioBRL : null;
  const usdbrl = typeof data?.usdbrl === "number" && data.usdbrl > 0 ? data.usdbrl : null;
  const totalUSD = totalBRL !== null && usdbrl ? totalBRL / usdbrl : null;
  const dayChangeBRL = typeof data?.dayChangeTotalBRL === "number" ? data.dayChangeTotalBRL : null;
  const dayChangePct = typeof data?.dayChangeTotalPct === "number" ? data.dayChangeTotalPct : null;
  const isDayUp = (dayChangeBRL ?? 0) >= 0;
  const usdDayChangePct = typeof data?.fxDayChange?.USD?.changePct === "number" ? data.fxDayChange.USD.changePct : null;

  const weekday = new Date().toLocaleDateString("pt-BR", { weekday: "short" }).toUpperCase().replace(".", "");
  const dateStr = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase().replace(".", "");

  const tickerItems = useMemo<TickerItem[]>(() => {
    if (!data?.positions || !Array.isArray(data.positions)) return [];
    const items: TickerItem[] = [];
    try {
      for (const p of data.positions) {
        if (!p || typeof p !== "object") continue;
        if (!p.ticker) continue;
        if ((p.quantidade ?? 0) <= 0) continue;
        if (isRendaFixa(p.setor ?? "")) continue;
        if (!p.precoAtual || p.precoAtual <= 0) continue;
        if (p.dayChangePct == null || typeof p.dayChangePct !== "number") continue;
        items.push({
          ticker: p.ticker,
          label: cleanTicker(p.ticker),
          price: p.precoAtual,
          changePct: p.dayChangePct,
          moeda: p.moeda ?? "BRL",
        });
      }
      items.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    } catch { /* */ }
    return items;
  }, [data?.positions]);

  return (
    <ErrorBoundary>
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ overscrollBehavior: "none" }}>
      <div className="w-full space-y-0">

        {/* ── Row 1: Hero + Metrics ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-0 animate-fade-in">
          {/* Left: Logo + greeting */}
          <div className="flex items-center gap-4">
            <Image
              src="/midias/carregamento.png"
              alt="Meus Investimentos"
              width={72}
              height={72}
              className="shrink-0 object-contain"
              priority
            />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "var(--text)", letterSpacing: "-.01em" }}>
                  Olá, Lucas
                </h1>
                <a
                  href="https://meus-investimentos-eeplqkozbtfcs8vzjsweqs.streamlit.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 transition-opacity hover:opacity-80"
                  style={{
                    background: "rgba(63,185,80,0.10)",
                    border: "1px solid rgba(63,185,80,0.25)",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--pos)",
                  }}
                >
                  V1 <ExternalLink size={8} />
                </a>
              </div>
              <p className="font-mono text-[11px] mt-1" style={{ color: "var(--muted)" }}>
                {weekday} · {dateStr} · Gestão integrada de investimentos
              </p>
            </div>
          </div>

          {/* Right: Metrics strip — 2x2 on mobile, 4 inline on desktop */}
          <div
            className="grid grid-cols-2 md:grid-cols-4"
            style={{ border: "1px solid var(--line)", background: "var(--panel)" }}
          >
            {/* Patrimônio */}
            <Link href="/patrimonio" className="flex flex-col items-center justify-center px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors" style={{ borderRight: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>Patrimônio</span>
              {loading || totalBRL === null ? (
                <span className="font-mono text-lg font-bold animate-pulse" style={{ color: "var(--muted)" }}>—</span>
              ) : (
                <>
                  <span className="font-mono text-lg font-bold tnum" style={{ color: "var(--text)" }}>{compactBRL(totalBRL)}</span>
                  {totalUSD !== null && (
                    <span className="font-mono text-[9px] mt-0.5" style={{ color: "var(--muted)" }}>
                      US$ {totalUSD >= 1000 ? `${(totalUSD / 1000).toFixed(0)}k` : Number(totalUSD).toFixed(0)}
                    </span>
                  )}
                </>
              )}
            </Link>

            {/* Retorno Dia */}
            <Link href="/hoje" className="flex flex-col items-center justify-center px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors" style={{ borderBottom: "1px solid var(--line)" }}>
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>Retorno Dia</span>
              {loading || dayChangePct === null ? (
                <span className="font-mono text-lg font-bold animate-pulse" style={{ color: "var(--muted)" }}>—</span>
              ) : (
                <>
                  <span className="font-mono text-lg font-bold tnum" style={{ color: isDayUp ? "var(--pos)" : "var(--neg)" }}>
                    {pct(dayChangePct)}
                  </span>
                  {dayChangeBRL !== null && (
                    <span className="font-mono text-[9px] mt-0.5" style={{ color: isDayUp ? "var(--pos)" : "var(--neg)", opacity: 0.7 }}>
                      {isDayUp ? "+" : ""}{compactBRL(dayChangeBRL)}
                    </span>
                  )}
                </>
              )}
            </Link>

            {/* Dólar */}
            <div className="flex flex-col items-center justify-center px-4 py-3" style={{ borderRight: "1px solid var(--line)" }}>
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>Dólar</span>
              {loading || usdbrl === null ? (
                <span className="font-mono text-lg font-bold animate-pulse" style={{ color: "var(--muted)" }}>—</span>
              ) : (
                <>
                  <span className="font-mono text-lg font-bold tnum" style={{ color: "var(--text)" }}>
                    R$ {Number(usdbrl).toFixed(3)}
                  </span>
                  {usdDayChangePct !== null && (
                    <span className="font-mono text-[9px] mt-0.5" style={{ color: (usdDayChangePct ?? 0) >= 0 ? "var(--pos)" : "var(--neg)", opacity: 0.7 }}>
                      {(usdDayChangePct ?? 0) >= 0 ? "+" : ""}{Number(usdDayChangePct).toFixed(2)}%
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Nasdaq 100 */}
            <div className="flex flex-col items-center justify-center px-4 py-3">
              <span className="font-mono text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>Nasdaq 100</span>
              {!nasdaq ? (
                <span className="font-mono text-lg font-bold animate-pulse" style={{ color: "var(--muted)" }}>—</span>
              ) : (
                <>
                  <span className="font-mono text-lg font-bold tnum" style={{ color: "var(--text)" }}>
                    {nasdaq.price >= 10000 ? `${(nasdaq.price / 1000).toFixed(1)}k` : nasdaq.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                  <span className="font-mono text-[9px] mt-0.5" style={{ color: nasdaq.changePct >= 0 ? "var(--pos)" : "var(--neg)", opacity: 0.7 }}>
                    {nasdaq.changePct >= 0 ? "+" : ""}{nasdaq.changePct.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Ticker Tape ── */}
        {!loading && tickerItems.length > 0 && (
          <ErrorBoundary>
            <div className="mt-4 animate-fade-in animate-delay-1">
              <TickerTape items={tickerItems} />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Row 3: Radar + Polymarket (two columns) ── */}
        {!loading && data && tickerItems.length > 0 && (
          <ErrorBoundary>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 animate-fade-in animate-delay-2">
              <RadarDoDia tickerItems={tickerItems} />
              <MercadoPreditivo data={data} />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Row 4: Notícias Destaques ── */}
        {!loading && (
          <ErrorBoundary>
            <div className="mt-4 animate-fade-in animate-delay-3">
              <NoticiasDestaques />
            </div>
          </ErrorBoundary>
        )}

      </div>
    </div>
    </ErrorBoundary>
  );
}
