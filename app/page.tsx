"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ExternalLink, Newspaper, Clock, AlertTriangle, Wifi, ArrowUpRight, ArrowDownRight, Eye, EyeOff } from "lucide-react";
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
  marketState?: string;
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

// Modo privacidade (olho no topo da Home): esconde VALORES ABSOLUTOS (R$/US$)
// do painel do dia — retornos por book, Σ do dia e patrimônio total. Percentuais
// e cotações de mercado continuam visíveis (não revelam o tamanho da carteira).
const MASK = "•••••";
const maskIf = (priv: boolean, s: string) => (priv ? MASK : s);

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
  // Persiste o estado estendido: ao clicar num ativo do Top/Baixas e voltar
  // (router.back da RV), a Home restaura a barra estendida como estava.
  useEffect(() => {
    if (sessionStorage.getItem("home-tape-expanded") === "1") setExpanded(true);
  }, []);
  const toggleExpanded = () => setExpanded((v) => {
    const n = !v;
    try { sessionStorage.setItem("home-tape-expanded", n ? "1" : "0"); } catch { /* ignore */ }
    return n;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const moved = useRef(false);
  const startX = useRef(0);
  const startScroll = useRef(0);
  const pauseUntil = useRef(0);
  const pos = useRef(0); // acumulador float (scrollLeft é inteiro → precisa acumular)

  // Auto-scroll suave via rAF (loop contínuo — conteúdo duplicado). Pausa
  // enquanto o usuário arrasta e por 2,5s depois, para dar controle manual.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const step = () => {
      const node = scrollRef.current;
      if (node && !dragging.current && performance.now() >= pauseUntil.current) {
        const half = node.scrollWidth / 2;
        if (half > 0) {
          pos.current = (pos.current + 0.6) % half; // ~36px/s
          node.scrollLeft = pos.current;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [items.length]);

  const onDown = (e: React.PointerEvent) => {
    const el = scrollRef.current; if (!el) return;
    dragging.current = true; moved.current = false;
    startX.current = e.clientX; startScroll.current = el.scrollLeft;
  };
  const onMove = (e: React.PointerEvent) => {
    const el = scrollRef.current; if (!el || !dragging.current) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > 4) moved.current = true;
    const half = el.scrollWidth / 2;
    let s = startScroll.current - dx;
    if (half > 0) { s = ((s % half) + half) % half; }
    el.scrollLeft = s;
    pos.current = s; // mantém o acumulador em sincronia com o arrasto
  };
  const onUp = () => { dragging.current = false; pauseUntil.current = performance.now() + 2500; };
  const onItemClick = (e: React.MouseEvent) => { if (moved.current) e.preventDefault(); };

  if (items.length === 0) return null;
  const best5 = items.slice(0, 5);
  const worst5 = [...items].reverse().slice(0, 5);

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div className="flex items-stretch" style={{ height: 38 }}>
        <div
          ref={scrollRef}
          className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
          style={{ maskImage: "linear-gradient(to right, transparent 0%, black 2%, black 98%, transparent 100%)", cursor: dragging.current ? "grabbing" : "grab", touchAction: "pan-y", overscrollBehaviorX: "contain" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => { if (dragging.current) onUp(); }}
        >
          <div className="inline-flex items-center whitespace-nowrap">
            {[...items, ...items].map((p, i) => {
              const ext = p.marketState === "PRE" || p.marketState === "PREPRE" ? "PRÉ"
                : p.marketState === "POST" || p.marketState === "POSTPOST" ? "PÓS" : null;
              return (
                <Link
                  key={i}
                  href={`/renda-variavel?ticker=${encodeURIComponent(p.ticker)}`}
                  onClick={onItemClick}
                  draggable={false}
                  className="inline-flex items-center gap-1.5 px-4 font-mono transition-colors hover:bg-white/[0.05]"
                  style={{ fontSize: 12 }}
                >
                  <span className="font-bold" style={{ color: "var(--text)" }}>{p.label}</span>
                  {ext && <span style={{ fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: ".06em" }}>{ext}</span>}
                  <span className="tnum" style={{ color: "var(--muted)" }}>{fmtPrice(p.price, p.moeda)}</span>
                  <span className="font-bold tnum" style={{ color: (p.changePct ?? 0) >= 0 ? "var(--pos)" : "var(--neg)" }}>
                    {(p.changePct ?? 0) > 0 ? "▲" : (p.changePct ?? 0) < 0 ? "▼" : "▬"} {(p.changePct ?? 0) >= 0 ? "+" : ""}{(p.changePct ?? 0).toFixed(2)}%
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
        <button
          onClick={toggleExpanded}
          className="shrink-0 px-2.5 flex items-center justify-center transition-colors hover:bg-white/[0.03]"
          style={{ borderLeft: "1px solid var(--line)", color: "var(--muted)", fontSize: 11 }}
          aria-label="Top altas e baixas"
        >
          {expanded ? "▴" : "▾"}
        </button>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-0" style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ borderRight: "1px solid var(--line)" }}>
            <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--line)", background: "rgba(63,185,80,0.06)" }}>
              <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--pos)" }}>Top 5 Altas</span>
            </div>
            {best5.map((p) => (
              <Link key={p.ticker} href={`/renda-variavel?ticker=${encodeURIComponent(p.ticker)}`} className="flex items-center justify-between px-3 py-1.5 font-mono transition-colors hover:bg-white/[0.03]" style={{ fontSize: 11, borderBottom: "1px solid var(--line)" }}>
                <span className="font-bold" style={{ color: "var(--text)" }}>{p.label}</span>
                <span className="font-bold tnum" style={{ color: "var(--pos)" }}>+{(p.changePct).toFixed(2)}%</span>
              </Link>
            ))}
          </div>
          <div>
            <div className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--line)", background: "rgba(240,80,74,0.06)" }}>
              <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--neg)" }}>Top 5 Baixas</span>
            </div>
            {worst5.map((p) => (
              <Link key={p.ticker} href={`/renda-variavel?ticker=${encodeURIComponent(p.ticker)}`} className="flex items-center justify-between px-3 py-1.5 font-mono transition-colors hover:bg-white/[0.03]" style={{ fontSize: 11, borderBottom: "1px solid var(--line)" }}>
                <span className="font-bold" style={{ color: "var(--text)" }}>{p.label}</span>
                <span className="font-bold tnum" style={{ color: "var(--neg)" }}>{(p.changePct).toFixed(2)}%</span>
              </Link>
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
  const [newsLoading, setNewsLoading] = useState(true);

  const top3 = useMemo(() => {
    if (tickerItems.length === 0) return [];
    const best = tickerItems.slice(0, 2);
    const worst = tickerItems.slice(-1);
    return [...best, ...worst].slice(0, 3);
  }, [tickerItems]);

  const tickerStr = useMemo(() => top3.map(t => t.ticker).join(","), [top3]);

  // scope=symbol = caminho LEVE (1 feed por ticker, 3 no total) — o modo geral
  // buscava ~20 feeds de mercado/macro/setor só para achar 3 manchetes aqui.
  useEffect(() => {
    if (!tickerStr) return;
    let cancelled = false;
    setNewsLoading(true);
    fetch(`/api/noticias?scope=symbol&tickers=${tickerStr}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setArticles(d.articles ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNewsLoading(false); });
    return () => { cancelled = true; };
  }, [tickerStr]);

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).toUpperCase().replace(".", "");

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line-strong)" }}>
        <div className="flex items-center gap-2">
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
              {/* Skeleton enquanto as notícias carregam — o fallback textual só
                  entra quando o fetch TERMINA sem artigo (antes ele piscava e
                  era substituído pela manchete real). */}
              {!article && newsLoading ? (
                <div className="animate-pulse">
                  <div className="rounded" style={{ height: 13, width: "92%", background: "var(--hover)" }} />
                  <div className="rounded mt-1.5" style={{ height: 13, width: "60%", background: "var(--hover)" }} />
                </div>
              ) : (
                <>
                  <p className="font-semibold leading-snug line-clamp-2" style={{ fontSize: 14, color: "var(--text)" }}>
                    {article?.titulo ?? `${item.label} ${isUp ? "em alta" : "em queda"} no pregão`}
                  </p>
                  {article && (
                    <p className="font-mono text-[10px] mt-1" style={{ color: "var(--faint)" }}>
                      {article.fonte}{article.data ? ` · ${timeAgo(article.data)}` : ""}
                    </p>
                  )}
                </>
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
      .then(({ fetchPolymarket, PRECO_ATIVOS_CAT }) => fetchPolymarket(positionTickers.split(",")).then(resp => ({ resp, PRECO_ATIVOS_CAT })))
      .then(({ resp, PRECO_ATIVOS_CAT }) => {
        if (cancelled) return;
        const cats = resp?.categories;
        if (!cats || typeof cats !== "object") return;
        const ok = (e: PolyEvent) => e && Array.isArray(e.odds) && e.odds.length > 0;
        // Preditivos de PREÇO dos ativos primeiro (sem piso de volume — são o
        // ponto do card); o resto embaralhado atrás.
        const preco = (cats[PRECO_ATIVOS_CAT] ?? []).filter(ok);
        const outros = Object.entries(cats)
          .filter(([k]) => k !== PRECO_ATIVOS_CAT)
          .flatMap(([, v]) => v)
          .filter(e => ok(e) && (e.volume ?? 0) >= 100);
        setPolyEvents([...preco, ...outros.sort(() => Math.random() - 0.5)].slice(0, 12));
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

function proxyImg(url: string | null): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes("google") || h.endsWith("gstatic.com") || h.endsWith("googleusercontent.com") || h.endsWith("ggpht.com")) return null;
  } catch { return null; }
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

// Gradiente por categoria — placeholder editorial quando não há imagem real.
function catGradient(cat: string): string {
  const map: Record<string, [string, string]> = {
    "Mercado": ["#1f6feb", "#0d2f6b"],
    "Economia": ["#238636", "#13491f"],
    "Global": ["#8957e5", "#3a2065"],
    "Câmbio": ["#bf8700", "#5c4100"],
    "Investimentos": ["#1f6feb", "#3a2065"],
    "Macro": ["#da3633", "#5e1513"],
    "Commodities": ["#bb8009", "#4d3206"],
    "Tech": ["#1f6feb", "#8957e5"],
    "Cripto": ["#F7931A", "#7a4200"],
  };
  const c = map[cat] ?? ["#30363d", "#161b22"];
  return `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 100%)`;
}

// Thumbnail de notícia: imagem real (não-Google) com fallback para um bloco
// com gradiente da categoria. NUNCA renderiza logo remoto — se a imagem falhar
// ou for de host Google, cai no placeholder colorido.
function NewsThumb({ imagem, categoria, size }: { imagem: string | null; categoria: string; size: "lg" | "sm" }) {
  const [err, setErr] = useState(false);
  const src = proxyImg(imagem);
  if (src && !err) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={`h-full w-full object-cover transition-transform group-hover:scale-105 ${size === "lg" ? "duration-500" : "duration-300"}`}
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-1.5" style={{ background: catGradient(categoria) }}>
      <Newspaper size={size === "lg" ? 30 : 16} style={{ color: "rgba(255,255,255,0.88)" }} />
      {size === "lg" && (
        <span className="font-mono font-bold uppercase" style={{ fontSize: 9, letterSpacing: "2px", color: "rgba(255,255,255,0.88)" }}>
          {categoria}
        </span>
      )}
    </div>
  );
}

function NoticiasDestaques() {
  const [articles, setArticles] = useState<DestaqueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/noticias/destaques", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setArticles(d.articles ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    const copy = [...articles];
    if (copy.length > 1) {
      const [first, ...tail] = copy;
      tail.sort((a, b) => {
        const ai = a.imagem ? 0 : 1;
        const bi = b.imagem ? 0 : 1;
        return ai - bi;
      });
      return [first, ...tail];
    }
    return copy;
  }, [articles]);

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

  const featured = sorted[0];
  // Sub-destaques: as 2 manchetes seguintes COM imagem ganham cards grandes;
  // o restante cai na grade compacta.
  const tail = sorted.slice(1);
  const subs: DestaqueItem[] = [];
  const rest: DestaqueItem[] = [];
  for (const a of tail) {
    if (subs.length < 2 && a.imagem) subs.push(a);
    else rest.push(a);
  }

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
            <NewsThumb imagem={featured.imagem} categoria={featured.categoria} size="lg" />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%)" }} />
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

      {/* Sub-destaques — 2 manchetes com imagem grande */}
      {subs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ borderBottom: "1px solid var(--line)" }}>
          {subs.map((article, i) => {
            const sty = IMPACTO_STYLE[article.impacto];
            return (
              <a
                key={i}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block transition-colors hover:bg-white/[0.02]"
                style={{ borderRight: i === 0 && subs.length > 1 ? "1px solid var(--line)" : undefined }}
              >
                <div className="relative h-[130px] overflow-hidden flex items-center justify-center" style={{ background: "var(--hover)" }}>
                  <NewsThumb imagem={article.imagem} categoria={article.categoria} size="lg" />
                  <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)" }} />
                  <span
                    className="absolute left-2.5 bottom-2 inline-flex items-center gap-1 px-1.5 py-0.5 font-mono text-[8px] font-bold"
                    style={{ background: "rgba(0,0,0,0.55)", border: `1px solid ${sty.border}`, color: sty.color === "var(--muted)" ? "#ddd" : sty.color, backdropFilter: "blur(4px)" }}
                  >
                    {article.impacto === "alto" && <AlertTriangle size={8} />}
                    {sty.label} · {article.categoria.toUpperCase()}
                  </span>
                </div>
                <div className="p-3">
                  <p className="text-[14px] font-semibold leading-snug line-clamp-2 group-hover:underline decoration-1 underline-offset-2" style={{ color: "var(--text)" }}>
                    {article.titulo}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[9px]" style={{ color: "var(--faint)" }}>
                    <span className="font-semibold" style={{ color: "var(--muted)" }}>{article.fonte}</span>
                    {article.data && (<><span>·</span><span>{timeAgo(article.data)}</span></>)}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

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
                <NewsThumb imagem={article.imagem} categoria={article.categoria} size="sm" />
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

// ── IbkrDayStrip (faixa IBKR — retorno do dia em US$) ───────────────────────

const IBKR_RED = "#d6001c";

function compactUSD(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}US$ ${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}US$ ${(a / 1e3).toFixed(1)}k`;
  return `${sign}US$ ${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const signedUSD = (v: number | null | undefined) => (v != null && v >= 0 ? "+" : "") + compactUSD(v);

interface IbkrStripData {
  meta: { accountId: string; toDate: string; usdbrl: number | null };
  kpis: {
    patrimonioUSD: number | null;
    patrimonioBRL: number;
    patrimonioTotalBRL?: number;   // posições + caixa (real IBKR) — base do quadro Patrimônio
    patrimonioTotalUSD?: number | null;
    lucroDiaUSD: number | null;
    lucroDiaBRL: number;
    lucroDiaPct: number | null;
    posicoes?: number;
  };
}

// Faixa enxuta da Interactive Brokers: marca + retorno do dia em US$ (destaque),
// com % e R$ de apoio + patrimônio de contexto. Lê /api/ibkr/overview de forma
// assíncrona; enquanto não há dado (carregando, não configurado ou erro) NÃO
// renderiza nada — nunca quebra a Home nem deixa espaço vazio.
function IbkrDayStrip({ data, priv }: { data: IbkrStripData | null; priv: boolean }) {
  if (!data) return null;
  const k = data.kpis;
  const up = (k.lucroDiaUSD ?? k.lucroDiaBRL ?? 0) >= 0;
  const dayColor = up ? "var(--pos)" : "var(--neg)";

  return (
    <Link
      href="/ibkr"
      className="group block"
      style={{ borderLeft: `3px solid ${IBKR_RED}`, borderBottom: "1px solid var(--line)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(214,0,28,0.10) 0%, transparent 42%)` }}
      >
        {/* Marca IBKR */}
        <div className="flex items-center gap-3 min-w-0">
          <Image
            src="/midias/51q7eieUfKL.png"
            alt="Interactive Brokers"
            width={40}
            height={40}
            className="shrink-0 object-cover"
            style={{ borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate" style={{ color: "var(--text)", fontSize: 14 }}>Interactive Brokers</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono shrink-0"
                style={{ background: "rgba(214,0,28,0.12)", color: IBKR_RED, fontSize: 9, fontWeight: 700 }}
              >
                <Wifi size={9} /> Flex
              </span>
            </div>
            <p className="font-mono mt-0.5 truncate" style={{ color: "var(--muted)", fontSize: 10 }}>
              Conta {data.meta.accountId || "—"}{data.meta.usdbrl ? ` · USD/BRL ${data.meta.usdbrl.toFixed(3)}` : ""}
            </p>
          </div>
        </div>

        {/* Retorno do dia em US$ (destaque) + patrimônio de contexto */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>
              Retorno do dia
            </div>
            <div className="flex items-center justify-end gap-1">
              {up ? <ArrowUpRight size={16} style={{ color: dayColor }} /> : <ArrowDownRight size={16} style={{ color: dayColor }} />}
              <span className="font-mono font-extrabold tnum" style={{ color: dayColor, fontSize: 20, lineHeight: 1 }}>
                {maskIf(priv, signedUSD(k.lucroDiaUSD))}
              </span>
            </div>
            <div className="font-mono mt-0.5 tnum" style={{ color: dayColor, fontSize: 10, opacity: 0.85 }}>
              {k.lucroDiaPct != null ? `${pct(k.lucroDiaPct * 100)} · ` : ""}
              {maskIf(priv, (k.lucroDiaBRL >= 0 ? "+" : "") + compactBRL(k.lucroDiaBRL))}
            </div>
          </div>

          {/* Patrimônio — contexto, oculto em telas pequenas */}
          <div className="text-right hidden md:block pl-4" style={{ borderLeft: "1px solid var(--line)" }}>
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>Patrimônio</div>
            <div className="font-mono font-bold tnum" style={{ color: "var(--text)", fontSize: 16, lineHeight: 1.1 }}>{maskIf(priv, compactUSD(k.patrimonioUSD))}</div>
            <div className="font-mono mt-0.5 tnum" style={{ color: "var(--muted)", fontSize: 10 }}>{maskIf(priv, compactBRL(k.patrimonioBRL))}</div>
          </div>

          <ChevronRight size={16} className="hidden sm:block transition-transform group-hover:translate-x-0.5" style={{ color: "var(--faint)" }} />
        </div>
      </div>
    </Link>
  );
}

// ── BrDayStrip / BtcDayStrip — mesma identidade visual da faixa IBKR ─────────
// Brasil (verde, bandeira) = variação do dia dos ativos em REAL (B3, sem RF e
// sem cripto). Bitcoin (laranja, ₿) = variação do dia dos criptoativos.
// Mesma regra da IBKR: sem dado → não renderiza nada.

const BR_GREEN = "#009C3B";
const BTC_ORANGE = "#F7931A";

const signedBRLc = (v: number | null | undefined) => (v != null && v >= 0 ? "+" : "") + compactBRL(v ?? 0);

function BrFlagIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" className="shrink-0" style={{ borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }} aria-label="Brasil">
      <rect width="40" height="40" fill="#009C3B" />
      <path d="M20 7 L35 20 L20 33 L5 20 Z" fill="#FFDF00" />
      <circle cx="20" cy="20" r="6.5" fill="#002776" />
      <path d="M14.2 18.6 C 18 17.4 23.5 18.6 25.6 21.6" stroke="#fff" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

function BtcIcon() {
  return (
    <div
      className="shrink-0 grid place-items-center"
      style={{ width: 40, height: 40, borderRadius: 10, background: BTC_ORANGE, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }}
      aria-label="Bitcoin"
    >
      <span style={{ color: "#fff", fontSize: 24, fontWeight: 800, lineHeight: 1, transform: "rotate(12deg)", fontFamily: "var(--font-sans)" }}>₿</span>
    </div>
  );
}

interface DayStripProps {
  dayBRL: number;
  dayPct: number | null;
  patrimonioBRL: number;
  count: number;
}

function BrDayStrip({ dayBRL, dayPct, patrimonioBRL, count, sessao, priv }: DayStripProps & { sessao: { text: string; color: string }; priv: boolean }) {
  if (count === 0) return null;
  const up = dayBRL >= 0;
  const dayColor = up ? "var(--pos)" : "var(--neg)";
  return (
    <Link
      href="/renda-variavel"
      className="group block"
      style={{ borderLeft: `3px solid ${BR_GREEN}`, borderBottom: "1px solid var(--line)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(0,156,59,0.10) 0%, transparent 42%)` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <BrFlagIcon />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate" style={{ color: "var(--text)", fontSize: 14 }}>Brasil</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono shrink-0"
                style={{ background: "rgba(0,156,59,0.14)", color: BR_GREEN, fontSize: 9, fontWeight: 700 }}
              >
                B3
              </span>
            </div>
            <p className="font-mono mt-0.5 truncate" style={{ color: "var(--muted)", fontSize: 10 }}>
              {count} ativo{count === 1 ? "" : "s"} em real · <span style={{ color: sessao.color }}>{sessao.text}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>
              Retorno do dia
            </div>
            <div className="flex items-center justify-end gap-1">
              {up ? <ArrowUpRight size={16} style={{ color: dayColor }} /> : <ArrowDownRight size={16} style={{ color: dayColor }} />}
              <span className="font-mono font-extrabold tnum" style={{ color: dayColor, fontSize: 20, lineHeight: 1 }}>
                {maskIf(priv, signedBRLc(dayBRL))}
              </span>
            </div>
            <div className="font-mono mt-0.5 tnum" style={{ color: dayColor, fontSize: 10, opacity: 0.85 }}>
              {dayPct != null ? `${pct(dayPct)} no dia` : "—"}
            </div>
          </div>

          <div className="text-right hidden md:block pl-4" style={{ borderLeft: "1px solid var(--line)" }}>
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>Patrimônio</div>
            <div className="font-mono font-bold tnum" style={{ color: "var(--text)", fontSize: 16, lineHeight: 1.1 }}>{maskIf(priv, compactBRL(patrimonioBRL))}</div>
            <div className="font-mono mt-0.5 tnum" style={{ color: "var(--muted)", fontSize: 10 }}>ações · FIIs · ETFs</div>
          </div>

          <ChevronRight size={16} className="hidden sm:block transition-transform group-hover:translate-x-0.5" style={{ color: "var(--faint)" }} />
        </div>
      </div>
    </Link>
  );
}

const FX_BLUE = "#3B82F6";

function FxIcon() {
  return (
    <div
      className="shrink-0 grid place-items-center"
      style={{ width: 40, height: 40, borderRadius: 10, background: FX_BLUE, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }}
      aria-label="Câmbio"
    >
      <span style={{ color: "#fff", fontSize: 22, fontWeight: 800, lineHeight: 1 }}>$</span>
    </div>
  );
}

// Câmbio — efeito da variação do dólar do dia sobre a exposição estrangeira
// (principal em moeda forte, sem cripto — a faixa Bitcoin já embute o câmbio).
function FxDayStrip({ efeitoBRL, usdPct, exposicaoBRL, usdbrl, priv }: {
  efeitoBRL: number;
  usdPct: number | null;
  exposicaoBRL: number;
  usdbrl: number | null;
  priv: boolean;
}) {
  if (exposicaoBRL <= 0) return null;
  const up = efeitoBRL >= 0;
  const dayColor = up ? "var(--pos)" : "var(--neg)";
  return (
    <Link
      href="/cambio"
      className="group block"
      style={{ borderLeft: `3px solid ${FX_BLUE}`, borderBottom: "1px solid var(--line)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(59,130,246,0.10) 0%, transparent 42%)` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <FxIcon />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate" style={{ color: "var(--text)", fontSize: 14 }}>Câmbio</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono shrink-0"
                style={{ background: "rgba(59,130,246,0.14)", color: FX_BLUE, fontSize: 9, fontWeight: 700 }}
              >
                USD/BRL
              </span>
            </div>
            <p className="font-mono mt-0.5 truncate" style={{ color: "var(--muted)", fontSize: 10 }}>
              {usdbrl ? `Dólar R$ ${usdbrl.toFixed(3)}` : "Dólar"}
              {usdPct != null ? (
                <span style={{ color: usdPct >= 0 ? "var(--pos)" : "var(--neg)" }}>{` · ${usdPct >= 0 ? "+" : ""}${usdPct.toFixed(2)}% hoje`}</span>
              ) : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>
              Efeito do dia
            </div>
            <div className="flex items-center justify-end gap-1">
              {up ? <ArrowUpRight size={16} style={{ color: dayColor }} /> : <ArrowDownRight size={16} style={{ color: dayColor }} />}
              <span className="font-mono font-extrabold tnum" style={{ color: dayColor, fontSize: 20, lineHeight: 1 }}>
                {maskIf(priv, signedBRLc(efeitoBRL))}
              </span>
            </div>
            <div className="font-mono mt-0.5 tnum" style={{ color: dayColor, fontSize: 10, opacity: 0.85 }}>
              {exposicaoBRL > 0 ? `${pct((efeitoBRL / exposicaoBRL) * 100)} da exposição` : "—"}
            </div>
          </div>

          <div className="text-right hidden md:block pl-4" style={{ borderLeft: "1px solid var(--line)" }}>
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>Exposição</div>
            <div className="font-mono font-bold tnum" style={{ color: "var(--text)", fontSize: 16, lineHeight: 1.1 }}>{maskIf(priv, compactBRL(exposicaoBRL))}</div>
            <div className="font-mono mt-0.5 tnum" style={{ color: "var(--muted)", fontSize: 10 }}>principal estrangeiro</div>
          </div>

          <ChevronRight size={16} className="hidden sm:block transition-transform group-hover:translate-x-0.5" style={{ color: "var(--faint)" }} />
        </div>
      </div>
    </Link>
  );
}

// Rodapé do card, estilo total de fatura: Patrimônio TOTAL ao vivo (IBKR real ×
// dólar de agora + BR + cripto + RF + caixa — o mesmo totalBRL da Home) à
// esquerda, o Σ retorno do dia à direita e, embaixo, a decomposição por
// modalidade — as MESMAS parcelas que formam o total, para auditar a soma.
interface PatrimonioParte {
  label: string;
  color: string;
  brl: number | null;
}

// Detalhe de auditoria — /api/patrimonio-dia/detalhe (verdade do servidor,
// mesma fórmula das parcelas). Aberto ao tocar na faixa de decomposição.
interface AuditItem {
  origem?: string;
  ticker: string;
  setor?: string;
  tipo?: string;
  moeda?: string;
  quantidade?: number;
  valorAtualBRL?: number;
  valorBRL?: number;
  alerta?: string;
  motivo?: string;
}
interface AuditData {
  usdbrl: number;
  partes: { ibkr_brl: number; brasil_brl: number; cripto_brl: number; rf_caixa_brl: number; total_brl: number };
  ibkr: { ok: boolean; patrimonioTotalUSD?: number; posicoes_brl?: number; caixa_brl?: number; erro?: string };
  brasil_itens: AuditItem[];
  cripto_itens: AuditItem[];
  rf_caixa_itens: AuditItem[];
  ibkr_caixa_conciliado?: AuditItem[];
  fora_da_soma: AuditItem[];
}

function AuditRow({ item, priv }: { item: AuditItem; priv: boolean }) {
  const v = item.valorAtualBRL ?? item.valorBRL ?? 0;
  const nota = item.alerta ?? item.motivo ?? (item.origem === "fixa_aberta" ? item.tipo : item.setor);
  return (
    <div className="flex items-baseline justify-between gap-2 px-4 py-1" style={{ borderTop: "1px solid var(--line)" }}>
      <span className="font-mono truncate" style={{ fontSize: 10.5, color: item.alerta ? "var(--neg)" : "var(--text-2)" }}>
        {cleanTicker(item.ticker)}
        {nota && <span style={{ color: item.alerta ? "var(--neg)" : "var(--faint)", fontSize: 9 }}> · {nota}</span>}
      </span>
      <span className="font-mono font-bold tnum shrink-0" style={{ fontSize: 10.5, color: item.alerta ? "var(--neg)" : "var(--text)" }}>
        {maskIf(priv, compactBRL(v))}
      </span>
    </div>
  );
}

function AuditPanel({ audit, priv }: { audit: AuditData | "loading" | "erro"; priv: boolean }) {
  if (audit === "loading") {
    return (
      <div className="px-4 py-3 text-center font-mono animate-pulse" style={{ fontSize: 10, color: "var(--muted)", borderTop: "1px solid var(--line)" }}>
        Auditando parcelas no servidor…
      </div>
    );
  }
  if (audit === "erro") {
    return (
      <div className="px-4 py-3 text-center font-mono" style={{ fontSize: 10, color: "var(--neg)", borderTop: "1px solid var(--line)" }}>
        Falha ao carregar o detalhe — tente de novo.
      </div>
    );
  }
  const grupos: { titulo: string; color: string; itens: AuditItem[]; soma: number }[] = [
    { titulo: "Brasil", color: BR_GREEN, itens: audit.brasil_itens, soma: audit.partes.brasil_brl },
    { titulo: "Cripto", color: BTC_ORANGE, itens: audit.cripto_itens, soma: audit.partes.cripto_brl },
    { titulo: "RF + Caixa", color: "var(--accent)", itens: audit.rf_caixa_itens, soma: audit.partes.rf_caixa_brl },
  ];
  return (
    <div style={{ borderTop: "1px solid var(--line-strong)", background: "var(--panel)" }}>
      <div className="flex items-baseline justify-between px-4 pt-2.5 pb-1.5">
        <span className="font-mono uppercase tracking-wider" style={{ fontSize: 9, fontWeight: 700, color: "var(--faint)" }}>
          Auditoria · item a item (servidor)
        </span>
        <span className="font-mono tnum" style={{ fontSize: 9.5, color: "var(--muted)" }}>
          IBKR {maskIf(priv, compactBRL(audit.partes.ibkr_brl))}
          {typeof audit.ibkr.caixa_brl === "number" && audit.ibkr.caixa_brl >= 1 && (
            <span style={{ color: "var(--faint)" }}> · caixa {maskIf(priv, compactBRL(audit.ibkr.caixa_brl))}</span>
          )}
          {!audit.ibkr.ok && <span style={{ color: "var(--neg)" }}> · indisponível</span>}
        </span>
      </div>
      {grupos.map((g) => (
        <div key={g.titulo}>
          <div className="flex items-baseline justify-between px-4 py-1.5" style={{ borderTop: "1px solid var(--line)", background: "var(--hover)" }}>
            <span className="flex items-center gap-1.5 font-mono uppercase tracking-wider" style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)" }}>
              <span className="rounded-full" style={{ width: 5, height: 5, background: g.color }} />
              {g.titulo} · {g.itens.length} {g.itens.length === 1 ? "item" : "itens"}
            </span>
            <span className="font-mono font-bold tnum" style={{ fontSize: 10, color: "var(--text)" }}>
              {maskIf(priv, compactBRL(g.soma))}
            </span>
          </div>
          {g.itens.map((item, i) => <AuditRow key={`${item.ticker}-${i}`} item={item} priv={priv} />)}
          {g.itens.length === 0 && (
            <div className="px-4 py-1 font-mono" style={{ fontSize: 10, color: "var(--faint)", borderTop: "1px solid var(--line)" }}>—</div>
          )}
        </div>
      ))}
      {(audit.ibkr_caixa_conciliado?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-4 py-1.5 font-mono uppercase tracking-wider" style={{ fontSize: 9, fontWeight: 700, color: "var(--pos, #3FB950)", borderTop: "1px solid var(--line)", background: "var(--hover)" }}>
            <span className="rounded-full" style={{ width: 5, height: 5, background: "var(--pos, #3FB950)" }} />
            Caixa na IBKR · já contabilizado acima
          </div>
          {audit.ibkr_caixa_conciliado!.map((item, i) => <AuditRow key={`conc-${item.ticker}-${i}`} item={item} priv={priv} />)}
        </div>
      )}
      {audit.fora_da_soma.length > 0 && (
        <div>
          <div className="px-4 py-1.5 font-mono uppercase tracking-wider" style={{ fontSize: 9, fontWeight: 700, color: "var(--neg)", borderTop: "1px solid var(--line)", background: "var(--hover)" }}>
            Fora da soma (conferir)
          </div>
          {audit.fora_da_soma.map((item, i) => <AuditRow key={`${item.ticker}-${i}`} item={item} priv={priv} />)}
        </div>
      )}
    </div>
  );
}

function DayStripsTotal({ brl, pctVal, patrimonioBRL, usdbrl, partes, detalhe, priv }: {
  brl: number | null;
  pctVal: number | null;
  patrimonioBRL: number | null;
  usdbrl: number | null;
  partes: PatrimonioParte[] | null;
  detalhe: AuditData | "loading" | "erro";
  priv: boolean;
}) {
  const [auditOpen, setAuditOpen] = useState(false);
  if (brl == null && patrimonioBRL == null) return null;
  const color = (brl ?? 0) >= 0 ? "var(--pos)" : "var(--neg)";
  const somaPartes = (partes ?? []).reduce((s, p) => s + (p.brl ?? 0), 0);
  const toggleAudit = () => setAuditOpen((v) => !v);
  return (
    <div style={{ background: "var(--hover)", borderTop: "1px solid var(--line-strong)" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* Patrimônio total — a carteira inteira, ao vivo */}
        {patrimonioBRL != null && patrimonioBRL > 0 ? (
          <div className="min-w-0">
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>
              Patrimônio total
            </div>
            <div className="font-mono font-extrabold tnum truncate" style={{ color: "var(--text)", fontSize: 19, lineHeight: 1 }}>
              {maskIf(priv, compactBRL(patrimonioBRL))}
            </div>
            <div className="font-mono mt-1 tnum truncate" style={{ color: "var(--muted)", fontSize: 10 }}>
              {maskIf(priv, compactUSD(usdbrl && usdbrl > 0 ? patrimonioBRL / usdbrl : null))}
              {usdbrl && usdbrl > 0 ? ` · US$/R$ ${usdbrl.toFixed(3)}` : ""}
            </div>
          </div>
        ) : <div />}

        {/* Σ retorno do dia */}
        {brl != null && (
          <div className="text-right shrink-0">
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>
              Σ Retorno do dia
            </div>
            <div className="font-mono font-extrabold tnum" style={{ color, fontSize: 19, lineHeight: 1 }}>
              {maskIf(priv, signedBRLc(brl))}
            </div>
            {pctVal != null && (
              <div className="font-mono mt-1 tnum" style={{ color, fontSize: 10, opacity: 0.85 }}>{pct(pctVal)} no dia</div>
            )}
          </div>
        )}
      </div>

      {/* Decomposição por modalidade — parcelas exatas do total. Toque para
          abrir a auditoria item a item (verdade do servidor). */}
      {partes && partes.length > 0 && (
        <>
          <div
            className="grid grid-cols-2 sm:grid-cols-4"
            style={{ gap: 1, background: "var(--line)", borderTop: "1px solid var(--line)" }}
          >
            {partes.map((p) => {
              const share = p.brl != null && somaPartes > 0 ? (p.brl / somaPartes) * 100 : null;
              return (
                <button
                  key={p.label}
                  onClick={toggleAudit}
                  className="px-4 py-2 text-left transition-colors hover:bg-white/[0.03]"
                  style={{ background: "var(--panel)" }}
                  aria-label={`Auditar ${p.label}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="shrink-0 rounded-full" style={{ width: 6, height: 6, background: p.color, boxShadow: `0 0 6px ${p.color}66` }} />
                    <span className="font-mono uppercase tracking-wider truncate" style={{ color: "var(--faint)", fontSize: 8.5, fontWeight: 700 }}>
                      {p.label}
                    </span>
                  </div>
                  <div className="font-mono tnum" style={{ fontSize: 12, lineHeight: 1.2 }}>
                    <span className="font-bold" style={{ color: p.brl != null ? "var(--text)" : "var(--faint)" }}>
                      {p.brl != null ? maskIf(priv, compactBRL(p.brl)) : "—"}
                    </span>
                    {share != null && (
                      <span style={{ color: "var(--muted)", fontSize: 9.5 }}> · {share.toFixed(1)}%</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {auditOpen && <AuditPanel audit={detalhe} priv={priv} />}
        </>
      )}
    </div>
  );
}

function BtcDayStrip({ dayBRL, dayPct, patrimonioBRL, count, btc, priv }: DayStripProps & { btc: { priceUSD: number; dayPct: number | null } | null; priv: boolean }) {
  if (count === 0) return null;
  const up = dayBRL >= 0;
  const dayColor = up ? "var(--pos)" : "var(--neg)";
  return (
    <Link
      href="/criptoativos"
      className="group block"
      style={{ borderLeft: `3px solid ${BTC_ORANGE}`, borderBottom: "1px solid var(--line)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(247,147,26,0.10) 0%, transparent 42%)` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <BtcIcon />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate" style={{ color: "var(--text)", fontSize: 14 }}>Bitcoin</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono shrink-0"
                style={{ background: "rgba(247,147,26,0.14)", color: BTC_ORANGE, fontSize: 9, fontWeight: 700 }}
              >
                24/7
              </span>
            </div>
            <p className="font-mono mt-0.5 truncate" style={{ color: "var(--muted)", fontSize: 10 }}>
              {btc ? `BTC ${compactUSD(btc.priceUSD)}${btc.dayPct != null ? ` · ${btc.dayPct >= 0 ? "+" : ""}${btc.dayPct.toFixed(1)}%` : ""}` : `${count} criptoativo${count === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>
              Retorno do dia
            </div>
            <div className="flex items-center justify-end gap-1">
              {up ? <ArrowUpRight size={16} style={{ color: dayColor }} /> : <ArrowDownRight size={16} style={{ color: dayColor }} />}
              <span className="font-mono font-extrabold tnum" style={{ color: dayColor, fontSize: 20, lineHeight: 1 }}>
                {maskIf(priv, signedBRLc(dayBRL))}
              </span>
            </div>
            <div className="font-mono mt-0.5 tnum" style={{ color: dayColor, fontSize: 10, opacity: 0.85 }}>
              {dayPct != null ? `${pct(dayPct)} no dia` : "—"}
            </div>
          </div>

          <div className="text-right hidden md:block pl-4" style={{ borderLeft: "1px solid var(--line)" }}>
            <div className="font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700 }}>Patrimônio</div>
            <div className="font-mono font-bold tnum" style={{ color: "var(--text)", fontSize: 16, lineHeight: 1.1 }}>{maskIf(priv, compactBRL(patrimonioBRL))}</div>
            <div className="font-mono mt-0.5 tnum" style={{ color: "var(--muted)", fontSize: 10 }}>preço + câmbio</div>
          </div>

          <ChevronRight size={16} className="hidden sm:block transition-transform group-hover:translate-x-0.5" style={{ color: "var(--faint)" }} />
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { data, loading } = usePortfolio();
  const [ibkrOverview, setIbkrOverview] = useState<IbkrStripData | null>(null);
  const [patrimonioDia, setPatrimonioDia] = useState<number | null>(null);

  // Modo privacidade — FECHADO (valores ocultos) por padrão; o padrão é
  // configurável em Configurações → Preferências ("home-privacy-default").
  // O clique no olho vale só para a sessão do navegador (sessionStorage) —
  // ao abrir de novo, volta ao padrão configurado.
  const [priv, setPriv] = useState(true);
  useEffect(() => {
    try {
      const sess = sessionStorage.getItem("home-privacy");
      if (sess === "0") setPriv(false);
      else if (sess === "1") setPriv(true);
      else setPriv(localStorage.getItem("home-privacy-default") !== "aberto");
    } catch { /* mantém fechado */ }
  }, []);
  const togglePriv = () => setPriv((v) => {
    const n = !v;
    try { sessionStorage.setItem("home-privacy", n ? "1" : "0"); } catch { /* ignore */ }
    return n;
  });

  // Fonte âncora do retorno do dia: API da IBKR (book internacional, sem erro).
  // Uma tentativa extra após 2,5s: em cold start a geração do Flex pode estourar
  // o tempo da 1ª chamada; a 2ª normalmente acerta o cache (memória ou CDN).
  useEffect(() => {
    let cancelled = false;
    const tryFetch = () => fetch("/api/ibkr/overview").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      let d = await tryFetch();
      if (!cancelled && !(d && d.kpis)) {
        await new Promise((r) => setTimeout(r, 2500));
        if (!cancelled) d = await tryFetch();
      }
      if (!cancelled && d && d.kpis) setIbkrOverview(d as IbkrStripData);
    })();
    return () => { cancelled = true; };
  }, []);

  // Fonte de verdade das PARCELAS do patrimônio (marcador = auditor, sempre):
  // /api/patrimonio-dia/detalhe lê a planilha fresca (no-store) e decompõe as
  // parcelas exatas. O cálculo client (snapshot do /api/cotacoes, cache CDN de
  // 15 min) vira só fallback enquanto isto carrega — era ele que fazia o
  // marcador divergir do auditor após uma atualização na planilha.
  const [detalhe, setDetalhe] = useState<AuditData | "loading" | "erro">("loading");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/patrimonio-dia/detalhe")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setDetalhe(d && d.partes ? (d as AuditData) : "erro"); })
      .catch(() => { if (!cancelled) setDetalhe("erro"); });
    return () => { cancelled = true; };
  }, []);
  const detalheData = typeof detalhe === "object" ? detalhe : null;

  // Patrimônio do dia (só para o quadro da Home) — endpoint dedicado.
  // SÓ usa quando o IBKR entrou de verdade na conta (ibkr_ok): sem isso, uma
  // falha do Flex devolvia um valor PARCIAL (só BR+cripto) que tomava o lugar
  // do canônico no card.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/patrimonio-dia")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.ibkr_ok === true && typeof d?.patrimonio_dia_brl === "number" && d.patrimonio_dia_brl > 0) {
          setPatrimonioDia(d.patrimonio_dia_brl);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const totalBRLCanon = typeof data?.totalPatrimonioBRL === "number" ? data.totalPatrimonioBRL : null;
  const usdbrl = typeof data?.usdbrl === "number" && data.usdbrl > 0 ? data.usdbrl : null;
  // Patrimônio do DIA (quadro da Home) = CONSEQUÊNCIA DIRETA do book IBKR da faixa
  // abaixo. Reusa o MESMO `ibkrOverview` que a faixa renderiza (posições + caixa,
  // dado real da IBKR) + BR (real) + Cripto do snapshot — sem dupla contagem com
  // USD/EUR/CAD (que já vêm da IBKR). Assim, quando a IBKR se move, o quadro se
  // move junto. Ordem de preferência:
  //   1) client (IBKR ao vivo da faixa) — o normal quando a IBKR responde
  //   2) /api/patrimonio-dia — mesma fórmula no servidor (fallback)
  //   3) canônico do snapshot — só quando a IBKR está indisponível de todo
  const expo = data?.exposicaoCambial ?? {};
  const brBRL = typeof expo["BRL"] === "number" ? expo["BRL"] : 0;
  const criptoBRL = typeof expo["Cripto"] === "number" ? expo["Cripto"] : 0;
  const ibkrTotalBRL = ibkrOverview?.kpis?.patrimonioTotalBRL ?? null;
  // Só usa o cálculo client quando IBKR E snapshot já chegaram (evita "piscar"
  // um valor só-IBKR antes do BR/Cripto entrarem).
  const patrimonioDiaClient = ibkrTotalBRL != null && data ? ibkrTotalBRL + brBRL + criptoBRL : null;
  const totalBRL = patrimonioDiaClient ?? patrimonioDia ?? totalBRLCanon;
  const dayChangeBRL = typeof data?.dayChangeTotalBRL === "number" ? data.dayChangeTotalBRL : null;
  const dayChangePct = typeof data?.dayChangeTotalPct === "number" ? data.dayChangeTotalPct : null;
  const usdDayChangePct = typeof data?.fxDayChange?.USD?.changePct === "number" ? data.fxDayChange.USD.changePct : null;

  // ── Retorno do dia (modelo IBKR-âncora) ───────────────────────────────────
  // Internacional vem da IBKR (lucro do dia em US$ × câmbio — só preço do ativo).
  // BR vem do snapshot (B3). Soma o efeito do dólar do dia sobre o principal
  // estrangeiro (IBKR). Fallback: dayChange do snapshot se a IBKR indisponível.
  const brDayBRL = useMemo(() => {
    if (!data?.positions) return 0;
    return data.positions
      .filter((p) => (p.moeda ?? "BRL") === "BRL" && !isRendaFixa(p.setor ?? "") && p.setor !== "Cripto" && (p.quantidade ?? 0) > 0)
      .reduce((s, p) => s + (p.dayChangeBRL ?? 0), 0);
  }, [data?.positions]);

  // Cripto: fora da IBKR e em USD → entra separado. O dayChangeBRL do snapshot
  // já inclui preço + câmbio (consistente com o resultado real em R$).
  const cryptoDayBRL = useMemo(() => {
    if (!data?.positions) return 0;
    return data.positions
      .filter((p) => p.setor === "Cripto" && (p.quantidade ?? 0) > 0)
      .reduce((s, p) => s + (p.dayChangeBRL ?? 0), 0);
  }, [data?.positions]);

  // Stats das faixas Brasil e Bitcoin (mesma identidade visual da IBKR).
  const brStats = useMemo(() => {
    const vazio = { count: 0, valueBRL: 0, sessao: { text: "FECHADO", color: "var(--muted)" } };
    if (!data?.positions) return vazio;
    const ps = data.positions.filter((p) => (p.moeda ?? "BRL") === "BRL" && !isRendaFixa(p.setor ?? "") && p.setor !== "Cripto" && (p.quantidade ?? 0) > 0);
    const states = new Set(ps.map((p) => p.marketState).filter(Boolean));
    const sessao = states.has("REGULAR") ? { text: "AO VIVO", color: "var(--pos)" }
      : states.has("PRE") || states.has("PREPRE") ? { text: "PRÉ-MERCADO", color: "var(--accent)" }
      : states.has("POST") || states.has("POSTPOST") ? { text: "PÓS-MERCADO", color: "var(--accent)" }
      : { text: "FECHADO", color: "var(--muted)" };
    return { count: ps.length, valueBRL: ps.reduce((s, p) => s + (p.valorAtualBRL ?? 0), 0), sessao };
  }, [data?.positions]);

  const cryptoStats = useMemo(() => {
    const vazio = { count: 0, valueBRL: 0, btc: null as { priceUSD: number; dayPct: number | null } | null };
    if (!data?.positions) return vazio;
    const ps = data.positions.filter((p) => p.setor === "Cripto" && (p.quantidade ?? 0) > 0);
    const btcPos = ps.find((p) => (p.ticker ?? "").toUpperCase().startsWith("BTC"));
    return {
      count: ps.length,
      valueBRL: ps.reduce((s, p) => s + (p.valorAtualBRL ?? 0), 0),
      btc: btcPos && typeof btcPos.precoAtual === "number" ? { priceUSD: btcPos.precoAtual, dayPct: btcPos.dayChangePct ?? null } : null,
    };
  }, [data?.positions]);

  // Efeito do dólar do dia sobre o principal estrangeiro (sem cripto — a faixa
  // Bitcoin já embute o câmbio). Preferência: book IBKR (mesmo número que entra
  // no somatório); fallback: campos canônicos do snapshot.
  const fxDia = useMemo(() => {
    const k = ibkrOverview?.kpis;
    if (k && usdbrl) {
      const fxFrac = (usdDayChangePct ?? 0) / 100;
      const principalBRL = (k.patrimonioUSD ?? 0) * usdbrl;
      const efeitoBRL = fxFrac !== 0 ? principalBRL * (fxFrac / (1 + fxFrac)) : 0;
      return { efeitoBRL, principalBRL };
    }
    // Fallback canônico: fx do dia das posições não-cripto + exposição em moeda forte.
    if (!data?.positions) return null;
    const efeitoBRL = data.positions
      .filter((p) => p.setor !== "Cripto" && (p.quantidade ?? 0) > 0)
      .reduce((s, p) => s + (p.dayChangeFxBRL ?? 0), 0);
    const principalBRL = Object.entries(data.exposicaoCambial ?? {})
      .filter(([k2]) => k2 !== "BRL" && k2 !== "Cripto")
      .reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
    return { efeitoBRL, principalBRL };
  }, [ibkrOverview, usdbrl, usdDayChangePct, data]);

  const dayReturn = useMemo(() => {
    const k = ibkrOverview?.kpis;
    if (!k || !usdbrl) return null; // sem IBKR → usa o fallback do snapshot
    const intlAssetBRL = k.lucroDiaBRL ?? 0;                          // internacional (IBKR, só ativo)
    const fxPrincipalBRL = fxDia?.efeitoBRL ?? 0;                     // efeito do dólar do dia
    const brl = intlAssetBRL + brDayBRL + cryptoDayBRL + fxPrincipalBRL;
    const base = totalBRL != null ? totalBRL - brl : null;          // patrimônio de ontem
    const pct = base && base > 0 ? (brl / base) * 100 : null;
    return { brl, pct };
  }, [ibkrOverview, usdbrl, fxDia, brDayBRL, cryptoDayBRL, totalBRL]);

  const dayBRLfinal = dayReturn?.brl ?? dayChangeBRL;
  const dayPctFinal = dayReturn?.pct ?? dayChangePct;

  // Decomposição do patrimônio total. Fonte primária: /api/patrimonio-dia/
  // detalhe (planilha fresca — o MESMO dado do painel de auditoria, então
  // marcador e auditor nunca divergem). IBKR: prefere o detalhe; se o Flex
  // falhou lá, usa o da faixa (client). Fallback total: parcelas do snapshot
  // client (cache CDN) enquanto o detalhe carrega.
  const patrimonioPartes = useMemo<PatrimonioParte[] | null>(() => {
    if (detalheData) {
      const ibkr = detalheData.ibkr.ok ? detalheData.partes.ibkr_brl : ibkrTotalBRL;
      return [
        { label: "IBKR", color: IBKR_RED, brl: ibkr },
        { label: "Brasil", color: BR_GREEN, brl: detalheData.partes.brasil_brl },
        { label: "Cripto", color: BTC_ORANGE, brl: detalheData.partes.cripto_brl },
        { label: "RF + Caixa", color: "var(--accent)", brl: detalheData.partes.rf_caixa_brl },
      ];
    }
    if (!data) return null;
    const acoesBR = brStats.valueBRL;
    const rfCaixa = Math.max(0, brBRL - acoesBR);
    return [
      { label: "IBKR", color: IBKR_RED, brl: ibkrTotalBRL },
      { label: "Brasil", color: BR_GREEN, brl: acoesBR },
      { label: "Cripto", color: BTC_ORANGE, brl: criptoBRL },
      { label: "RF + Caixa", color: "var(--accent)", brl: rfCaixa },
    ];
  }, [detalheData, data, brStats.valueBRL, brBRL, ibkrTotalBRL, criptoBRL]);

  // Total exibido = soma dos marcadores quando o detalhe está disponível
  // (Σ dos blocos bate com o número grande, centavo a centavo).
  const totalPartes = useMemo(() => {
    if (!patrimonioPartes || !detalheData) return null;
    const soma = patrimonioPartes.reduce((s, p) => s + (p.brl ?? 0), 0);
    return soma > 0 ? soma : null;
  }, [patrimonioPartes, detalheData]);

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
          marketState: p.marketState,
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

        {/* ── Row 1: Hero (logo + saudação + olho de privacidade) ── */}
        <div className="animate-fade-in flex items-center justify-between gap-3">
          {/* Logo + greeting */}
          <div className="flex items-center gap-4 min-w-0">
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

          {/* Olho de privacidade — esconde/mostra os valores do painel do dia */}
          <button
            onClick={togglePriv}
            aria-label={priv ? "Mostrar valores" : "Esconder valores"}
            title={priv ? "Mostrar valores" : "Esconder valores"}
            className="shrink-0 grid place-items-center transition-colors hover:bg-white/[0.06]"
            style={{
              width: 38,
              height: 38,
              border: "1px solid var(--line)",
              background: priv ? "rgba(232,163,61,0.10)" : "var(--panel)",
              color: priv ? "var(--accent)" : "var(--muted)",
              borderRadius: 10,
            }}
          >
            {priv ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        {/* ── Row 2: Cotações rolantes — primeira coisa depois da saudação ── */}
        {!loading && tickerItems.length > 0 && (
          <ErrorBoundary>
            <div className="mt-3 animate-fade-in">
              <TickerTape items={tickerItems} />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Skeleton do painel do dia enquanto o snapshot carrega ── */}
        {loading && (
          <div className="mt-4 animate-pulse" style={{ height: 300, border: "1px solid var(--line)", background: "var(--panel)" }} />
        )}

        {/* ── Row 3: painel do dia — UM card com as linhas IBKR · Brasil ·
               Bitcoin · Câmbio (divisórias internas) e o Σ como rodapé ── */}
        {!loading && (
          <ErrorBoundary fallback={null}>
            <div className="mt-4 animate-fade-in overflow-hidden" style={{ border: "1px solid var(--line)", background: "var(--panel)" }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--line-strong)" }}>
                <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>
                  Retorno do dia
                </span>
                <span className="font-mono text-[9px]" style={{ color: "var(--faint)" }}>por book · toque para abrir</span>
              </div>
              <IbkrDayStrip data={ibkrOverview} priv={priv} />
              <BrDayStrip
                dayBRL={brDayBRL}
                dayPct={brStats.valueBRL > 0 ? (brDayBRL / brStats.valueBRL) * 100 : null}
                patrimonioBRL={brStats.valueBRL}
                count={brStats.count}
                sessao={brStats.sessao}
                priv={priv}
              />
              <BtcDayStrip
                dayBRL={cryptoDayBRL}
                dayPct={cryptoStats.valueBRL > 0 ? (cryptoDayBRL / cryptoStats.valueBRL) * 100 : null}
                patrimonioBRL={cryptoStats.valueBRL}
                count={cryptoStats.count}
                btc={cryptoStats.btc}
                priv={priv}
              />
              {fxDia && (
                <FxDayStrip
                  efeitoBRL={fxDia.efeitoBRL}
                  usdPct={usdDayChangePct}
                  exposicaoBRL={fxDia.principalBRL}
                  usdbrl={usdbrl}
                  priv={priv}
                />
              )}
              <DayStripsTotal
                brl={dayBRLfinal}
                pctVal={dayPctFinal}
                patrimonioBRL={totalPartes ?? totalBRL}
                usdbrl={usdbrl}
                partes={patrimonioPartes}
                detalhe={detalhe}
                priv={priv}
              />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Row 4: Radar + Polymarket (two columns) ── */}
        {!loading && data && tickerItems.length > 0 && (
          <ErrorBoundary>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 animate-fade-in animate-delay-2">
              <RadarDoDia tickerItems={tickerItems} />
              <MercadoPreditivo data={data} />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Row 5: Notícias Destaques ── */}
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
