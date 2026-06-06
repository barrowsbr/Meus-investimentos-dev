"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { ElementType } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";

const HoloGlobe = dynamic(() => import("@/components/HoloGlobe"), { ssr: false });
import {
  LayoutDashboard, TrendingUp, BarChart2, BarChart3, Landmark, Coins,
  Bitcoin, ArrowLeftRight, Receipt, Activity, Wallet,
  Settings, Newspaper, Bot, ListOrdered, ChevronDown,
  ArrowRight, TrendingDown, Globe, Radio, ChevronRight,
  ExternalLink, Target, Scale, Zap,
} from "lucide-react";
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
        <div className="rounded-2xl p-4 text-center" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
          <p className="text-xs text-red-400 font-semibold mb-1">Erro ao renderizar</p>
          <p className="text-[10px] text-zinc-500 break-all">{this.state.error.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconComponent = React.ComponentType<any>;
interface NavItem { href: string; label: string; icon: IconComponent }
interface NavGroup {
  id: string;
  label: string;
  desc: string;
  icon: IconComponent;
  accentColor: string;
  items: NavItem[];
}

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
  imagem?: string;
}

// ── Nav config ───────────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    id: "composicao",
    label: "Composição",
    desc: "Portfolio, alocação e posições",
    icon: LayoutDashboard,
    accentColor: "#d4a574",
    items: [
      { href: "/resumo",          label: "Resumo",         icon: LayoutDashboard },
      { href: "/renda-variavel",  label: "Renda Variável", icon: BarChart2 },
      { href: "/renda-fixa",      label: "Renda Fixa",     icon: Landmark },
      { href: "/proventos",       label: "Proventos",      icon: Coins },
      { href: "/criptoativos",    label: "Criptoativos",   icon: Bitcoin },
    ],
  },
  {
    id: "analise",
    label: "Análise",
    desc: "Performance, retorno e risco",
    icon: TrendingUp,
    accentColor: "#3b82f6",
    items: [
      { href: "/performance",  label: "Performance", icon: TrendingUp },
      { href: "/evolucao",     label: "Evolução",    icon: Activity },
      { href: "/cambio",       label: "Câmbio",      icon: ArrowLeftRight },
      { href: "/simulacoes",   label: "Simulações",  icon: Target },
      { href: "/trades",       label: "Trades",      icon: Zap },
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    desc: "Impostos, fluxos e finanças pessoais",
    icon: Receipt,
    accentColor: "#8b5cf6",
    items: [
      { href: "/impostos",      label: "Impostos",      icon: Receipt },
      { href: "/alavancagem",  label: "Alavancagem",  icon: Scale },
      { href: "/financas",     label: "Fin. Pessoais", icon: Wallet },
      { href: "/fluxos",       label: "Fluxos",        icon: ListOrdered },
    ],
  },
  {
    id: "mais",
    label: "Mais",
    desc: "Notícias, Polymarket, Agente IA e configurações",
    icon: Newspaper,
    accentColor: "#06b6d4",
    items: [
      { href: "/noticias",       label: "Notícias",       icon: Newspaper },
      { href: "/polymarket",     label: "Polymarket",     icon: BarChart2 },
      { href: "/moedas",         label: "Moedas",         icon: Globe },
      { href: "/bolsas",         label: "Bolsas",         icon: BarChart3 },
      { href: "/agente-ia",      label: "Agente IA",      icon: Bot },
      { href: "/configuracoes",  label: "Configurações",  icon: Settings },
    ],
  },
];

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

// ── AccordionGroup ───────────────────────────────────────────────────────────

function AccordionGroup({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const Icon = group.icon;
  const c = group.accentColor;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: "rgba(17,19,28,0.72)",
        border: `1px solid ${open ? c + "30" : "rgba(255,255,255,0.08)"}`,
        boxShadow: open ? `0 8px 32px ${c}10` : "none",
      }}
    >
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
        style={{ background: open ? `${c}06` : "transparent" }}
        onClick={() => setOpen(!open)}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${c}12`, boxShadow: open ? `0 0 12px ${c}20` : "none" }}
        >
          <Icon size={18} style={{ color: c }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-100">{group.label}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{group.desc}</p>
        </div>
        <ChevronDown
          size={15}
          className="shrink-0 transition-transform duration-300 text-zinc-500"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: open ? c : undefined }}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? `${group.items.length * 56}px` : "0px" }}
      >
        <div className="px-4 pb-3 flex flex-col gap-1">
          {group.items.map(({ href, label, icon: SubIcon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = `${c}0a`;
                (e.currentTarget as HTMLElement).style.borderColor = `${c}20`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.04)";
              }}
            >
              <SubIcon size={15} className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" strokeWidth={1.6} />
              <span className="flex-1 text-[12px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">{label}</span>
              <ArrowRight size={12} className="text-zinc-600 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TickerTape ───────────────────────────────────────────────────────────────

function TickerTape({ items }: { items: TickerItem[] }) {
  const [expanded, setExpanded] = useState(false);

  const best5 = useMemo(() => items.slice(0, 5), [items]);
  const worst5 = useMemo(() => [...items].reverse().slice(0, 5), [items]);
  const duration = Math.max(18, items.length * 4);

  if (items.length === 0) return null;

  return (
    <div className="w-full max-w-lg">
      {/* Scrolling tape */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-stretch overflow-hidden h-[44px] transition-all"
        style={{
          background: "rgba(17,19,28,0.72)",
          backdropFilter: "blur(16px)",
          border: `1px solid ${expanded ? "rgba(212,165,116,0.25)" : "rgba(255,255,255,0.10)"}`,
          borderRadius: expanded ? "16px 16px 0 0" : "16px",
          boxShadow: expanded ? "0 8px 32px rgba(212,165,116,0.08)" : "0 4px 20px rgba(0,0,0,0.25)",
        }}
      >
        {/* Badge */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 border-r border-white/[0.06]"
          style={{ background: "rgba(212,165,116,0.06)" }}>
          <span className="w-[5px] h-[5px] rounded-full animate-pulse" style={{ background: "#d4a574" }} />
          <span className="text-[0.52rem] font-extrabold tracking-[2px] whitespace-nowrap" style={{ color: "#d4a574" }}>AO VIVO</span>
        </div>

        {/* Viewport */}
        <div className="flex-1 overflow-hidden flex items-center"
          style={{ maskImage: "linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%)" }}>
          <div
            className="inline-flex items-center whitespace-nowrap"
            style={{ animation: `tickerScroll ${duration}s linear infinite` }}
          >
            {[...items, ...items].map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-4">
                <span className="text-[0.73rem] font-extrabold text-zinc-200 tracking-[0.5px]">{p.label}</span>
                <span className="text-[0.66rem] font-medium text-zinc-500">{fmtPrice(p.price, p.moeda)}</span>
                <span className={`text-[0.7rem] font-bold ${(p.changePct ?? 0) > 0 ? "text-emerald-400" : (p.changePct ?? 0) < 0 ? "text-red-400" : "text-zinc-500"}`}>
                  {(p.changePct ?? 0) > 0 ? "▲" : (p.changePct ?? 0) < 0 ? "▼" : "▬"} {(p.changePct ?? 0) >= 0 ? "+" : ""}{(p.changePct ?? 0).toFixed(2)}%
                </span>
                {i < items.length * 2 - 1 && <span className="text-white/[0.05] text-[0.85rem] pl-1">|</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 flex items-center pr-3">
          <ChevronDown size={11} className={`text-white/25 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Expandable performers grid */}
      <div
        className="overflow-hidden transition-all duration-400"
        style={{
          maxHeight: expanded ? "400px" : "0px",
          background: "rgba(17,19,28,0.72)",
          backdropFilter: "blur(16px)",
          border: expanded ? "1px solid rgba(212,165,116,0.12)" : "1px solid transparent",
          borderTop: "none",
          borderRadius: "0 0 16px 16px",
        }}
      >
        <div className="p-3 grid grid-cols-2 gap-2">
          {/* Best */}
          <div className="rounded-xl overflow-hidden min-w-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="px-2.5 py-2 text-[0.52rem] font-extrabold tracking-[2px] text-emerald-400 flex items-center gap-1.5 border-b border-emerald-400/10" style={{ background: "rgba(52,211,153,0.04)" }}>
              ▲ MELHORES
            </div>
            <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto" }}>
              {best5.map(p => (
                <React.Fragment key={p.ticker}>
                  <span className="text-[0.7rem] font-bold text-zinc-200 truncate px-2.5 py-[6px] border-b border-white/[0.03]">{p.label}</span>
                  <span className="text-[0.6rem] font-medium text-zinc-600 text-right truncate px-1 py-[6px] border-b border-white/[0.03] tabular-nums">{fmtPrice(p.price, p.moeda)}</span>
                  <span className="text-[0.6rem] font-bold text-emerald-400 text-right whitespace-nowrap pr-2.5 py-[6px] border-b border-white/[0.03] tabular-nums">{(p.changePct ?? 0) >= 0 ? "+" : ""}{(p.changePct ?? 0).toFixed(1)}%</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          {/* Worst */}
          <div className="rounded-xl overflow-hidden min-w-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div className="px-2.5 py-2 text-[0.52rem] font-extrabold tracking-[2px] text-red-400 flex items-center gap-1.5 border-b border-red-400/10" style={{ background: "rgba(248,113,113,0.04)" }}>
              ▼ PIORES
            </div>
            <div className="grid" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto" }}>
              {worst5.map(p => (
                <React.Fragment key={p.ticker}>
                  <span className="text-[0.7rem] font-bold text-zinc-200 truncate px-2.5 py-[6px] border-b border-white/[0.03]">{p.label}</span>
                  <span className="text-[0.6rem] font-medium text-zinc-600 text-right truncate px-1 py-[6px] border-b border-white/[0.03] tabular-nums">{fmtPrice(p.price, p.moeda)}</span>
                  <span className="text-[0.6rem] font-bold text-red-400 text-right whitespace-nowrap pr-2.5 py-[6px] border-b border-white/[0.03] tabular-nums">{(p.changePct ?? 0).toFixed(1)}%</span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RadarDoDia ───────────────────────────────────────────────────────────────

function RadarDoDia({ data, tickerItems }: { data: PortfolioResponse; tickerItems: TickerItem[] }) {
  const [news, setNews] = useState<{ best: NewsArticle | null; worst: NewsArticle | null }>({ best: null, worst: null });
  const [polyEvents, setPolyEvents] = useState<PolyEvent[]>([]);
  const [polyIdx, setPolyIdx] = useState(0);
  const [polyLoading, setPolyLoading] = useState(true);

  const best = tickerItems[0] ?? null;
  const worst = tickerItems.length > 0 ? tickerItems[tickerItems.length - 1] : null;

  const bestTicker = best?.ticker ?? "";
  const worstTicker = worst?.ticker ?? "";

  useEffect(() => {
    if (!bestTicker && !worstTicker) return;
    const tickers = [bestTicker, worstTicker].filter((t, i, a) => t && a.indexOf(t) === i);

    fetch(`/api/noticias?tickers=${tickers.join(",")}`)
      .then(r => r.json())
      .then(d => {
        const articles: NewsArticle[] = d.articles ?? [];
        setNews({
          best: bestTicker ? articles.find(a => a.ticker === bestTicker) ?? null : null,
          worst: worstTicker ? articles.find(a => a.ticker === worstTicker) ?? null : null,
        });
      })
      .catch(() => {});
  }, [bestTicker, worstTicker]);

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
      .then(({ fetchPolymarket }) => {
        const tickers = positionTickers.split(",");
        return fetchPolymarket(tickers);
      })
      .then(resp => {
        if (cancelled) return;
        const cats = resp?.categories;
        if (!cats || typeof cats !== "object") return;
        const all = Object.values(cats).flat();
        const filtered = all.filter(e => e && Array.isArray(e.odds) && e.odds.length > 0 && (e.volume ?? 0) >= 100);
        const shuffled = filtered.sort(() => Math.random() - 0.5).slice(0, 12);
        setPolyEvents(shuffled);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPolyLoading(false); });
    return () => { cancelled = true; };
  }, [positionTickers]);

  const nextPoly = useCallback(() => {
    setPolyIdx(i => polyEvents.length > 0 ? (i + 1) % polyEvents.length : 0);
  }, [polyEvents.length]);

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

  return (
    <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{
      background: "rgba(17,19,28,0.72)",
      backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.09)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-[11px] border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <span className="w-[6px] h-[6px] rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[0.68rem] font-extrabold tracking-[1.6px] uppercase text-zinc-400">Radar do Dia</span>
        </div>
        <span className="text-[0.63rem] text-zinc-600">{today}</span>
      </div>

      {/* News row: best vs worst */}
      {(best || worst) && (
        <div className="grid grid-cols-2 h-[120px] border-b border-white/[0.05]">
          <NewsCard article={news.best} ticker={best?.label ?? ""} changePct={best?.changePct ?? 0} isBest />
          <NewsCard article={news.worst} ticker={worst?.label ?? ""} changePct={worst?.changePct ?? 0} isBest={false} />
        </div>
      )}

      {/* Polymarket section */}
      <div className="flex items-center gap-2.5 px-4 py-2 border-b border-white/[0.04]">
        <div className="flex-1 h-px bg-white/[0.04]" />
        <span className="text-[0.6rem] font-extrabold tracking-[1.2px] uppercase text-cyan-400/80 whitespace-nowrap">Mercado Preditivo</span>
        <div className="flex-1 h-px bg-white/[0.04]" />
      </div>

      {polyLoading ? (
        <div className="px-4 py-6 text-center">
          <span className="text-[0.75rem] text-zinc-600 animate-pulse">Carregando eventos...</span>
        </div>
      ) : polyEvents.length === 0 ? (
        <div className="px-4 py-4 flex items-center gap-3 opacity-55">
          <span className="text-xl">🔌</span>
          <div>
            <p className="text-[0.78rem] font-semibold text-zinc-400">Polymarket indisponível</p>
            <p className="text-[0.68rem] text-zinc-600">Dados voltarão automaticamente</p>
          </div>
        </div>
      ) : (
        <>
          {polyEvents.map((ev, i) => (
            <a
              key={ev.id}
              href={ev.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-3 border-b border-white/[0.04] hover:bg-cyan-400/[0.03] transition-colors"
              style={{ display: i === polyIdx ? "block" : "none" }}
            >
              <p className="text-[0.87rem] font-semibold text-zinc-200 leading-[1.42] mb-2.5">{ev.title}</p>
              <div className="flex flex-col gap-[5px] mb-2">
                {(Array.isArray(ev.odds) ? ev.odds : []).slice(0, 3).map((o, j) => {
                  if (!o) return null;
                  const colorMap = {
                    0: { bg: "rgba(212,165,116,0.14)", border: "rgba(212,165,116,0.4)", text: "text-amber-400" },
                    1: { bg: "rgba(99,102,241,0.12)", border: "rgba(99,102,241,0.35)", text: "text-indigo-400" },
                    2: { bg: "rgba(167,139,250,0.10)", border: "rgba(167,139,250,0.3)", text: "text-violet-400" },
                  } as const;
                  const barColors = colorMap[j as 0 | 1 | 2] ?? colorMap[2];
                  const pct = typeof o.percent === "number" ? o.percent : 0;
                  return (
                    <div key={j} className="relative flex items-center gap-2 py-[5px] px-[9px] rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="absolute left-0 top-0 bottom-0 rounded-lg" style={{
                        width: `${pct}%`,
                        background: barColors.bg,
                        borderRight: `2px solid ${barColors.border}`,
                      }} />
                      <span className={`relative z-[1] text-[0.75rem] text-zinc-300 flex-1 truncate ${j === 0 ? "font-bold" : ""}`}>
                        {String(o.outcome ?? "").slice(0, 35)}
                      </span>
                      <span className={`relative z-[1] text-[0.77rem] font-bold shrink-0 ${barColors.text}`}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[0.67rem] text-zinc-600">
                <span>
                  Vol <b className="text-zinc-500">
                    {(ev.volume ?? 0) >= 1_000_000 ? `$${((ev.volume ?? 0) / 1_000_000).toFixed(1)}M`
                      : (ev.volume ?? 0) >= 1_000 ? `$${((ev.volume ?? 0) / 1_000).toFixed(0)}k`
                      : `$${ev.volume ?? 0}`}
                  </b>
                  {ev.days_left != null && (
                    ev.days_left === 0 ? " · resolve hoje"
                      : ev.days_left <= 7 ? ` · ${ev.days_left}d restantes`
                      : ` · resolve em ${ev.days_left}d`
                  )}
                </span>
                <span className="font-semibold" style={{ color: "#d4a574" }}>Ver no Polymarket →</span>
              </div>
            </a>
          ))}

          {/* Nav */}
          <div className="flex items-center justify-between px-4 py-[7px]">
            <span className="text-[0.63rem] text-zinc-600">{polyIdx + 1} / {polyEvents.length}</span>
            <button
              onClick={nextPoly}
              className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-zinc-400 px-3 py-1 rounded-full transition-all hover:border-[#d4a574]/30 hover:bg-[#d4a574]/[0.06]"
              style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "rgba(212,165,116,0.7)" }}
            >
              <ChevronRight size={11} />
              Próximo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NewsCard({ article, ticker, changePct, isBest }: {
  article: NewsArticle | null; ticker: string; changePct: number; isBest: boolean;
}) {
  const badge = isBest ? "bg-emerald-400/[0.18] text-emerald-400 border-emerald-400/[0.28]" : "bg-red-400/[0.18] text-red-400 border-red-400/[0.28]";
  const arr = isBest ? "▲" : "▼";
  const sign = (changePct ?? 0) >= 0 ? "+" : "";
  const overlay = isBest
    ? "linear-gradient(to top,rgba(4,14,8,0.96) 0%,rgba(4,14,8,0.55) 55%,rgba(4,14,8,0.15) 100%)"
    : "linear-gradient(to top,rgba(20,4,4,0.96) 0%,rgba(20,4,4,0.55) 55%,rgba(20,4,4,0.15) 100%)";

  const inner = (
    <div className="relative h-full flex flex-col justify-end overflow-hidden group">
      {article?.imagem && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.06]"
          style={{ backgroundImage: `url(${article.imagem})`, filter: "brightness(0.38) saturate(0.6)" }}
        />
      )}
      <div className="absolute inset-0" style={{ background: overlay }} />
      <div className="relative z-[2] p-[10px_12px] flex flex-col gap-1">
        <span className={`inline-flex items-center gap-1 self-start text-[0.6rem] font-extrabold uppercase tracking-[0.8px] px-1.5 py-0.5 rounded-[5px] border ${badge}`}>
          {arr} {ticker} {sign}{(changePct ?? 0).toFixed(1)}%
        </span>
        {article?.titulo && (
          <p className="text-[0.76rem] font-semibold text-zinc-100 leading-[1.35] line-clamp-2" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
            {article.titulo}
          </p>
        )}
        {article?.fonte && (
          <p className="text-[0.6rem] text-zinc-600 font-medium">{article.fonte}</p>
        )}
      </div>
    </div>
  );

  if (article?.link) {
    return (
      <a href={article.link} target="_blank" rel="noopener noreferrer"
        className={`block h-full transition-all ${!isBest ? "" : "border-r border-white/[0.05]"}`}>
        {inner}
      </a>
    );
  }
  return <div className={`h-full ${!isBest ? "" : "border-r border-white/[0.05]"}`}>{inner}</div>;
}

// ── FxExpandCard (Dollar) ────────────────────────────────────────────────────

function FxDollarButton({ usdbrl, usdDayChangePct, expanded, onToggle }: {
  usdbrl: number | null; usdDayChangePct: number | null; expanded: boolean; onToggle: () => void;
}) {
  const isUsdUp = (usdDayChangePct ?? 0) >= 0;
  return (
    <button
      onClick={onToggle}
      className="rounded-2xl p-4 flex flex-col items-center text-center transition-transform hover:scale-[1.02] cursor-pointer w-full h-full"
      style={{
        background: "rgba(17,19,28,0.75)",
        border: `1px solid ${isUsdUp ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)"}`,
        boxShadow: `0 4px 24px ${isUsdUp ? "rgba(16,185,129,0.06)" : "rgba(248,113,113,0.06)"}, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">Dólar</span>
      {usdbrl === null ? (
        <span className="text-sm font-bold text-zinc-500 animate-pulse">—</span>
      ) : (
        <span className="text-sm font-bold text-zinc-100">R$ {Number(usdbrl).toFixed(3)}</span>
      )}
      {usdDayChangePct !== null && (
        <div className="flex items-center gap-1 mt-1">
          <span className={`text-[9px] font-semibold ${isUsdUp ? "text-emerald-400" : "text-red-400"}`}>
            {isUsdUp ? "+" : ""}{Number(usdDayChangePct).toFixed(2)}%
          </span>
          <ChevronDown size={9} className={`text-white/25 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
        </div>
      )}
    </button>
  );
}

function FxExpandPanel({ data, expanded }: { data: PortfolioResponse; expanded: boolean }) {
  const fxPairs = useMemo(() => {
    const fx = data?.fx;
    if (!fx || typeof fx !== "object") return [];
    const pairs: { label: string; value: number; prefix: string; decimals: number }[] = [];
    if (typeof fx.EURBRL === "number") pairs.push({ label: "EUR/BRL", value: fx.EURBRL, prefix: "R$", decimals: 4 });
    if (typeof fx.CADBRL === "number") pairs.push({ label: "CAD/BRL", value: fx.CADBRL, prefix: "R$", decimals: 4 });
    if (typeof fx.GBPBRL === "number") pairs.push({ label: "GBP/BRL", value: fx.GBPBRL, prefix: "R$", decimals: 4 });
    return pairs;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.fx?.EURBRL, data?.fx?.CADBRL, data?.fx?.GBPBRL]);

  return (
    <div
      className="w-full overflow-hidden transition-all duration-300 rounded-2xl"
      style={{
        maxHeight: expanded ? "200px" : "0px",
        marginTop: expanded ? "8px" : "0px",
        opacity: expanded ? 1 : 0,
      }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(17,19,28,0.75)",
          border: "1px solid rgba(255,255,255,0.09)",
        }}
      >
        <div className="grid grid-cols-3 divide-x divide-white/[0.05]">
          {fxPairs.map(pair => (
            <div key={pair.label} className="flex flex-col items-center py-2.5 px-2">
              <span className="text-[0.52rem] font-bold text-zinc-500 uppercase tracking-[1px] mb-1">{pair.label}</span>
              <span className="text-[0.8rem] font-bold text-zinc-200">
                {pair.prefix} {Number(pair.value).toFixed(pair.decimals)}
              </span>
            </div>
          ))}
        </div>
        <Link href="/moedas" className="flex items-center justify-center gap-1.5 px-3 py-2 border-t border-white/[0.05] hover:bg-white/[0.02] transition-colors">
          <Globe size={11} style={{ color: "#d4a574" }} />
          <span className="text-[0.6rem] font-semibold" style={{ color: "#d4a574" }}>Ver todas as moedas</span>
        </Link>
      </div>
    </div>
  );
}

// ── MetricCard ──────────────────────────────────────────────────────────────

function MetricCard({ children, borderColor }: { children: React.ReactNode; borderColor: string }) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col items-center text-center transition-transform hover:scale-[1.02]"
      style={{
        background: "rgba(17,19,28,0.75)",
        border: `1px solid ${borderColor}`,
        boxShadow: `0 4px 24px ${borderColor.replace(/[^,]+\)$/, "0.06)")}, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {children}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { data, loading } = usePortfolio();
  const [fxExpanded, setFxExpanded] = useState(false);
  const [holoMode, setHoloMode] = useState<"off" | "globe" | "blackhole">("off");

  const totalBRL = typeof data?.totalPatrimonioBRL === "number" ? data.totalPatrimonioBRL : null;
  const usdbrl = typeof data?.usdbrl === "number" && data.usdbrl > 0 ? data.usdbrl : null;
  const totalUSD = totalBRL !== null && usdbrl ? totalBRL / usdbrl : null;
  const dayChangeBRL = typeof data?.dayChangeTotalBRL === "number" ? data.dayChangeTotalBRL : null;
  const dayChangePct = typeof data?.dayChangeTotalPct === "number" ? data.dayChangeTotalPct : null;
  const isDayUp = (dayChangeBRL ?? 0) >= 0;

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
    } catch {
      // Silently handle any unexpected data shape
    }
    return items;
  }, [data?.positions]);

  const handleLogoClick = useCallback(() => {
    setHoloMode(prev => prev === "off" ? "globe" : prev === "globe" ? "blackhole" : "off");
  }, []);

  return (
    <ErrorBoundary>
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(28,32,50,0.7) 0%, rgba(12,14,20,0.97) 100%)" }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 30% 60%, rgba(212,165,116,0.035) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(99,102,241,0.035) 0%, transparent 50%)",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg px-4 py-10 flex flex-col items-center">

        {/* ── Hero ── */}
        <div className="text-center mb-6 pt-16 animate-fade-in flex flex-col items-center w-full">
          {/* Clickable logo */}
          <button
            onClick={handleLogoClick}
            className="relative group cursor-pointer transition-all duration-300 mb-1"
            aria-label="Abrir globo de mercados"
          >
            <Image
              src="/midias/carregamento.png"
              alt="Meus Investimentos"
              width={96}
              height={96}
              className="h-20 w-auto drop-shadow-lg transition-all duration-300 group-hover:drop-shadow-[0_0_16px_rgba(212,165,116,0.3)] group-hover:scale-105"
              priority
            />
          </button>

          {/* ── 3D Globe — inline below logo ── */}
          <HoloGlobe mode={holoMode} />

          <h1
            className="text-3xl md:text-4xl font-bold mb-1.5 leading-tight mt-4"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #e4e4e7 45%, #b4b4bc 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Olá, Lucas
          </h1>

          <div className="flex items-center justify-center gap-2.5 mt-1.5">
            <p className="text-zinc-500 text-sm">Gestão integrada de investimentos</p>
            <a
              href="https://meus-investimentos-eeplqkozbtfcs8vzjsweqs.streamlit.app"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all hover:scale-105 group"
              style={{
                background: "rgba(255,75,75,0.06)",
                border: "1px solid rgba(255,75,75,0.14)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/midias/streamlit-logo.svg" alt="" width={14} height={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-red-400/60 group-hover:text-red-400 transition-colors">v1</span>
              <ExternalLink size={8} className="text-red-400/30 group-hover:text-red-400/60 transition-colors" />
            </a>
          </div>
        </div>

        {/* ── Live Metrics ── */}
        <div className="w-full grid grid-cols-3 gap-3 mb-4 animate-fade-in animate-delay-1">
          {/* Patrimônio Total */}
          <MetricCard borderColor="rgba(212,165,116,0.15)">
            <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">Patrimônio</span>
            {loading || totalBRL === null ? (
              <span className="text-sm font-bold text-zinc-600 animate-pulse">—</span>
            ) : (
              <>
                <span className="text-sm font-bold text-zinc-100">{compactBRL(totalBRL)}</span>
                {totalUSD !== null && (
                  <span className="text-[9px] text-zinc-500 mt-1">
                    US$ {totalUSD >= 1000 ? `${(totalUSD / 1000).toFixed(1)}k` : Number(totalUSD).toFixed(0)}
                  </span>
                )}
              </>
            )}
          </MetricCard>

          {/* Retorno dia */}
          <MetricCard borderColor={isDayUp ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}>
            <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">Retorno Dia</span>
            {loading || dayChangePct === null ? (
              <span className="text-sm font-bold text-zinc-600 animate-pulse">—</span>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  {isDayUp
                    ? <TrendingUp size={12} className="text-emerald-400" />
                    : <TrendingDown size={12} className="text-red-400" />}
                  <span className={`text-sm font-bold ${isDayUp ? "text-emerald-400" : "text-red-400"}`}>
                    {pct(dayChangePct)}
                  </span>
                </div>
                {dayChangeBRL !== null && (
                  <span className={`text-[9px] font-semibold mt-1 ${isDayUp ? "text-emerald-400/60" : "text-red-400/60"}`}>
                    {isDayUp ? "+" : ""}{compactBRL(dayChangeBRL)}
                  </span>
                )}
              </>
            )}
          </MetricCard>

          {/* Dólar */}
          {loading || !data ? (
            <MetricCard borderColor="rgba(255,255,255,0.10)">
              <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider mb-1.5">Dólar</span>
              <span className="text-sm font-bold text-zinc-500 animate-pulse">—</span>
            </MetricCard>
          ) : (
            <FxDollarButton
              usdbrl={usdbrl}
              usdDayChangePct={typeof data.fxDayChange?.USD?.changePct === "number" ? data.fxDayChange.USD.changePct : null}
              expanded={fxExpanded}
              onToggle={() => setFxExpanded(e => !e)}
            />
          )}
        </div>

        {/* FX expand panel */}
        {!loading && data && (
          <FxExpandPanel data={data} expanded={fxExpanded} />
        )}

        {/* ── Ticker Tape ── */}
        {!loading && tickerItems.length > 0 && (
          <ErrorBoundary>
            <div className="w-full flex justify-center mb-4 animate-fade-in animate-delay-1">
              <TickerTape items={tickerItems} />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Radar do Dia ── */}
        {!loading && data && tickerItems.length > 0 && (
          <ErrorBoundary>
            <div className="w-full flex justify-center mb-5 animate-fade-in animate-delay-2">
              <RadarDoDia data={data} tickerItems={tickerItems} />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Section label ── */}
        <div className="w-full flex items-center gap-3 mb-3 animate-fade-in animate-delay-2">
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(212,165,116,0.22))" }} />
          <span className="text-[9px] font-extrabold tracking-[2px] uppercase text-zinc-600">Navegação</span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(212,165,116,0.22), transparent)" }} />
        </div>

        {/* ── Navigation Groups ── */}
        <div className="w-full flex flex-col gap-2.5 animate-fade-in animate-delay-2">
          {NAV_GROUPS.map(group => (
            <AccordionGroup key={group.id} group={group} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 flex items-center gap-4 w-full animate-fade-in animate-delay-2">
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(45,47,58,0.5))" }} />
          <span className="text-[9px] text-zinc-600 font-medium tracking-widest uppercase">
            v1.0 · Personal
          </span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, rgba(45,47,58,0.5), transparent)" }} />
        </div>
      </div>

    </div>
    </ErrorBoundary>
  );
}
