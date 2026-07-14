"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ExternalLink, Newspaper, Clock, AlertTriangle, Wifi, ArrowUpRight, ArrowDownRight, Eye, EyeOff, Maximize2, Loader2 } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { fetchJsonCached, fetchJsonFresh } from "@/lib/client-cache";
import { compactBRL, pct } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";
import { openEmbed, openArticle } from "@/lib/embed-link";
import PatrimonioModal from "@/components/PatrimonioModal";
import RetornoDiaModal from "@/components/RetornoDiaModal";
import PatrimonioSparkline from "@/components/PatrimonioSparkline";
import DayStreak from "@/components/DayStreak";
import MascoteWalk from "@/components/MascoteWalk";
import NewsCard from "@/components/noticias/NewsCard";
import type { NewsArticle as HomeNewsArticle } from "@/lib/news/ui";

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

// ── LazyMount ─────────────────────────────────────────────────────────────────
// Só monta os filhos (e portanto só dispara os fetches deles) quando a seção
// chega perto da viewport. Libera o cold start da Home: as seções abaixo da
// dobra (Radar do dia, Mercado Preditivo, Notícias) deixam de brigar por
// lambdas com o painel de patrimônio no primeiro paint. `minHeight` reserva o
// espaço para não haver layout-shift quando o conteúdo entra.
function LazyMount({ children, minHeight = 260 }: { children: React.ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setShow(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); }
      },
      { rootMargin: "400px 0px" }, // começa a carregar ~400px antes de aparecer
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return <div ref={ref} style={show ? undefined : { minHeight }}>{show ? children : null}</div>;
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
  imagem?: string | null;
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
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
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

  // 2 melhores + 2 piores do dia (dedup — evita repetir quando há poucos ativos).
  const destaques = useMemo(() => {
    if (tickerItems.length === 0) return [] as TickerItem[];
    const best = tickerItems.slice(0, 2);
    const worst = tickerItems.slice(-2);
    const seen = new Set<string>();
    const out: TickerItem[] = [];
    for (const t of [...best, ...worst]) {
      if (t && !seen.has(t.ticker)) { seen.add(t.ticker); out.push(t); }
    }
    return out.slice(0, 4);
  }, [tickerItems]);

  const tickerStr = useMemo(() => destaques.map(t => t.ticker).join(","), [destaques]);

  // Busca fresca: 1 feed de notícias por ativo (scope=symbol) dos 4 destaques.
  useEffect(() => {
    if (!tickerStr) return;
    let cancelled = false;
    setNewsLoading(true);
    fetchJsonCached<{ articles?: unknown[] }>(`/api/noticias?scope=symbol&tickers=${encodeURIComponent(tickerStr)}`, 10 * 60_000)
      .then(d => { if (!cancelled) setArticles(Array.isArray(d?.articles) ? (d.articles as never[]) : []); })
      .catch(() => { if (!cancelled) setArticles([]); })
      .finally(() => { if (!cancelled) setNewsLoading(false); });
    return () => { cancelled = true; };
  }, [tickerStr]);

  // Match robusto: o endpoint marca o ticker SEM sufixo (PETR4, VOO…), então
  // comparamos por base; fallback = manchete que contém o código do ativo.
  const base = (t: string | null | undefined) => String(t ?? "").toUpperCase().replace(/\.\w+$/, "").replace(/-USD$/, "").replace(/=X$/, "");
  const articleFor = (item: TickerItem) => {
    const keys = [base(item.ticker), base(item.label)].filter(Boolean);
    return articles.find(a => keys.includes(base(a.ticker)))
      ?? articles.find(a => keys.some(k => base(a.titulo).includes(k)));
  };

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).toUpperCase().replace(".", "");

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--line-strong)" }}>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>
            Radar do Dia · Destaques
          </span>
        </div>
        <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{today}</span>
      </div>

      {destaques.map((item, idx) => {
        const article = articleFor(item);
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
              borderBottom: idx < destaques.length - 1 ? "1px solid var(--line)" : undefined,
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
            {article?.imagem && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyImg(article.imagem) ?? undefined}
                alt=""
                loading="lazy"
                className="shrink-0 object-cover"
                style={{ width: 56, height: 56, borderRadius: 10, border: "1px solid var(--line)" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </a>
        );
      })}
    </div>
  );
}

// ── Notícias na Home — REGRA: só notícia COM imagem ─────────────────────────
// Reescrita sobre o motor personalizado (o mesmo do "Para você" em /noticias):
// perfil de interesses + anti-briga + curadoria IA + ranking com bônus de foto.
// Sem imagem real, a notícia NÃO entra na Home — nada de placeholder aqui.

function proxyImg(url: string | null): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes("google") || h.endsWith("gstatic.com") || h.endsWith("googleusercontent.com") || h.endsWith("ggpht.com")) return null;
  } catch { return null; }
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

function NoticiasDestaques() {
  const [articles, setArticles] = useState<HomeNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Perfil do dono (localStorage) — mesmo feed do "Para você".
        const { getPerfilNoticias, perfilQuery } = await import("@/lib/news/perfil");
        const d = await fetchJsonCached<{ articles?: HomeNewsArticle[] }>(
          `/api/noticias?${perfilQuery(getPerfilNoticias())}`, 10 * 60_000);
        const comFoto = ((d.articles ?? []) as HomeNewsArticle[]).filter(a => !!a.imagem && proxyImg(a.imagem));
        if (alive) setArticles(comFoto.slice(0, 9));
      } catch { /* sem notícias → a seção não aparece */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="overflow-hidden" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14 }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <Newspaper size={14} style={{ color: "var(--accent)" }} />
          <span className="font-mono uppercase" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "var(--muted)" }}>Notícias · Para você</span>
        </div>
        <div className="p-4 animate-pulse space-y-3">
          <div className="rounded-xl" style={{ height: 180, background: "var(--hover)" }} />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl" style={{ height: 90, background: "var(--hover)" }} />
            <div className="rounded-xl" style={{ height: 90, background: "var(--hover)" }} />
          </div>
        </div>
      </div>
    );
  }

  if (articles.length === 0) return null; // regra: sem foto, sem seção

  const hero = articles[0];
  const subs = articles.slice(1, 3);
  const grid = articles.slice(3, 9);

  return (
    <div className="overflow-hidden" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "0 18px 40px -28px rgba(0,0,0,0.75)" }}>
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
        <Newspaper size={14} style={{ color: "var(--accent)" }} />
        <span className="font-mono uppercase" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".18em", color: "var(--muted)" }}>Notícias · Para você</span>
        <Link href="/noticias" className="ml-auto inline-flex items-center gap-1 font-mono transition-opacity hover:opacity-80" style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
          Ver tudo <ChevronRight size={12} />
        </Link>
      </div>

      <div className="p-4 space-y-3">
        <NewsCard a={hero} variant="hero" />
        {subs.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {subs.map((a, i) => <NewsCard key={a.link || i} a={a} variant="sub" />)}
          </div>
        )}
        {grid.length > 0 && (
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3">
            {grid.map((a, i) => <NewsCard key={a.link || i} a={a} variant="grid" />)}
          </div>
        )}
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
// com % e R$ de apoio + patrimônio de contexto. Recebe o overview via prop (do
// /api/home consolidado); enquanto não há dado (carregando, não configurado ou
// erro) NÃO renderiza nada — nunca quebra a Home nem deixa espaço vazio.
function IbkrDayStrip({ data, priv }: { data: IbkrStripData | null; priv: boolean }) {
  if (!data) return null;
  const k = data.kpis;
  const up = (k.lucroDiaUSD ?? k.lucroDiaBRL ?? 0) >= 0;
  const dayColor = up ? "var(--pos)" : "var(--neg)";

  return (
    <Link
      href="/ibkr"
      className="group block"
      style={{ borderLeft: "3px solid var(--line-strong)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
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
                style={{ background: "var(--hover)", border: "1px solid var(--line-strong)", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}
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

// Placeholder da faixa IBKR — enquanto o book Flex não chega (cold start ~até
// 38s) mostra "carregando"; se o /api/home resolveu sem o book, mostra
// "indisponível". Evita a faixa simplesmente sumir (parecia removida).
function IbkrStripPlaceholder({ loaded }: { loaded: boolean }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderLeft: "3px solid var(--line-strong)", borderBottom: "1px solid var(--line)" }}
    >
      <Image src="/midias/51q7eieUfKL.png" alt="Interactive Brokers" width={40} height={40} className="shrink-0 object-cover" style={{ borderRadius: 10, opacity: 0.55 }} />
      <div className="min-w-0">
        <span className="font-bold" style={{ color: "var(--text-2)", fontSize: 14 }}>Interactive Brokers</span>
        <p className="font-mono mt-0.5 flex items-center gap-1.5" style={{ color: "var(--muted)", fontSize: 10 }}>
          {loaded
            ? "book indisponível no momento — recarregue a página"
            : <><Loader2 size={11} className="animate-spin" /> carregando book da IBKR…</>}
        </p>
      </div>
      {!loaded && <div className="ml-auto animate-pulse rounded" style={{ width: 88, height: 22, background: "var(--line)" }} />}
    </div>
  );
}

// ── BrDayStrip / BtcDayStrip — mesma identidade visual da faixa IBKR ─────────
// Brasil (verde, bandeira) = variação do dia dos ativos em REAL (B3, sem RF e
// sem cripto). Bitcoin (laranja, ₿) = variação do dia dos criptoativos.
// Mesma regra da IBKR: sem dado → não renderiza nada.

const BR_GREEN = "#009C3B";
const BTC_ORANGE = "#F7931A";

const signedBRLc = (v: number | null | undefined) => (v != null && v >= 0 ? "+" : "") + compactBRL(v ?? 0);

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
      style={{ borderLeft: "3px solid var(--line-strong)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/midias/b3.jpg" alt="B3" width={40} height={40} className="shrink-0 object-cover" style={{ borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate" style={{ color: "var(--text)", fontSize: 14 }}>Brasil</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono shrink-0"
                style={{ background: "var(--hover)", border: "1px solid var(--line-strong)", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}
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
      style={{ borderLeft: "3px solid var(--line-strong)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/midias/cambio.jpg" alt="Câmbio" width={40} height={40} className="shrink-0 object-cover" style={{ borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate" style={{ color: "var(--text)", fontSize: 14 }}>Câmbio</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono shrink-0"
                style={{ background: "var(--hover)", border: "1px solid var(--line-strong)", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}
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

// Parcelas do patrimônio (servidor) — alimentam os 4 cartões de decomposição
// (IBKR / Brasil / Cripto / RF + Caixa). Vêm do /api/home (campo `detalhe`),
// mesma fórmula canônica das parcelas.
interface AuditData {
  usdbrl: number;
  partes: { ibkr_brl: number; brasil_brl: number; cripto_brl: number; rf_caixa_brl: number; total_brl: number };
  ibkr: { ok: boolean; patrimonioTotalUSD?: number; posicoes_brl?: number; caixa_brl?: number; erro?: string };
}

function DayStripsTotal({ brl, pctVal, patrimonioBRL, usdbrl, priv, onOpenRetorno }: {
  brl: number | null;
  pctVal: number | null;
  patrimonioBRL: number | null;
  usdbrl: number | null;
  priv: boolean;
  onOpenRetorno: () => void;
}) {
  const [patrOpen, setPatrOpen] = useState(false);
  if (brl == null && patrimonioBRL == null) return null;
  const color = (brl ?? 0) >= 0 ? "var(--pos)" : "var(--neg)";
  return (
    <div className="overflow-hidden" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "0 18px 40px -28px rgba(0,0,0,0.75)" }}>
      <PatrimonioModal open={patrOpen} onClose={() => setPatrOpen(false)} />

      {/* HERO — Patrimônio total (com mini-histórico) + Σ retorno do dia */}
      <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr]" style={{ gap: 1, background: "var(--line)" }}>
        {/* Patrimônio total */}
        <div className="px-5 py-4" style={{ background: "var(--panel)" }}>
          {patrimonioBRL != null && patrimonioBRL > 0 ? (
            <button type="button" onClick={() => setPatrOpen(true)} title="Ver histórico patrimonial" className="group block w-full text-left">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="font-mono uppercase" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700, letterSpacing: ".2em" }}>Patrimônio total</span>
                <Maximize2 size={9} className="opacity-40 transition-opacity group-hover:opacity-90" style={{ color: "var(--muted)" }} />
              </div>
              <div className="font-mono font-extrabold tnum truncate group-hover:underline decoration-1 underline-offset-4" style={{ color: "var(--text)", fontSize: "clamp(26px,5.4vw,38px)", lineHeight: 0.98, letterSpacing: "-.02em" }}>
                {maskIf(priv, compactBRL(patrimonioBRL))}
              </div>
              <div className="font-mono tnum truncate" style={{ color: "var(--muted)", fontSize: 10.5, marginTop: 8 }}>
                {maskIf(priv, compactUSD(usdbrl && usdbrl > 0 ? patrimonioBRL / usdbrl : null))}
                {usdbrl && usdbrl > 0 ? ` · US$/R$ ${usdbrl.toFixed(3)}` : ""}
              </div>
            </button>
          ) : (
            <>
              <div className="font-mono uppercase mb-2" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700, letterSpacing: ".2em" }}>Patrimônio total</div>
              <div className="animate-pulse rounded" style={{ width: 150, height: 34, background: "var(--line)" }} />
            </>
          )}
          {!priv && patrimonioBRL != null && patrimonioBRL > 0 && (
            <div className="mt-3"><PatrimonioSparkline height={52} /></div>
          )}
        </div>

        {/* Σ retorno do dia + marcadores dos últimos pregões */}
        {brl != null ? (
          <div className="flex flex-col justify-center px-5 py-4" style={{ background: "var(--panel)" }}>
            <button type="button" onClick={onOpenRetorno} title="Ver o retorno do dia por book" className="group text-left">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="font-mono uppercase" style={{ color: "var(--faint)", fontSize: 9, fontWeight: 700, letterSpacing: ".2em" }}>Σ Retorno do dia</span>
                <Maximize2 size={9} className="opacity-40 transition-opacity group-hover:opacity-90" style={{ color: "var(--muted)" }} />
              </div>
              <div className="font-mono font-extrabold tnum group-hover:underline decoration-1 underline-offset-4" style={{ color, fontSize: "clamp(22px,4.4vw,30px)", lineHeight: 1, letterSpacing: "-.02em" }}>
                {maskIf(priv, signedBRLc(brl))}
              </div>
              {pctVal != null && (
                <div className="font-mono tnum" style={{ color, fontSize: 11, opacity: 0.85, marginTop: 6 }}>{pct(pctVal)} no dia</div>
              )}
            </button>
            <DayStreak className="mt-3" />
          </div>
        ) : (
          <div style={{ background: "var(--panel)" }} />
        )}
      </div>
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
      style={{ borderLeft: "3px solid var(--line-strong)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Image src="/midias/bitcoin.jpg" alt="Bitcoin" width={40} height={40} className="shrink-0 object-cover" style={{ borderRadius: 10, boxShadow: "0 2px 10px rgba(0,0,0,.3)" }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate" style={{ color: "var(--text)", fontSize: 14 }}>Bitcoin</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-mono shrink-0"
                style={{ background: "var(--hover)", border: "1px solid var(--line-strong)", color: "var(--muted)", fontSize: 9, fontWeight: 700 }}
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
  const [ibkrLoaded, setIbkrLoaded] = useState(false); // /api/home resolveu (com ou sem book)
  const [retornoOpen, setRetornoOpen] = useState(false); // popup "Retorno do dia · por book"
  const [patrimonioDia, setPatrimonioDia] = useState<number | null>(null);
  const [mascoteOn, setMascoteOn] = useState(false); // easter-egg: mascote andando (clique na logo)

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

  // Painel do dia num ÚNICO endpoint consolidado (/api/home): faixa IBKR +
  // patrimônio do dia + auditoria das parcelas. Antes eram 3 fetches paralelos
  // (/api/ibkr/overview, /api/patrimonio-dia, /api/patrimonio-dia/detalhe), cada
  // um subindo um lambda frio e REGERANDO o extrato Flex da IBKR (~até 38s) —
  // 3-4 gerações concorrentes no cold start. Agora roda tudo UMA vez.
  // Uma tentativa extra após 2,5s: em cold start a geração do Flex pode estourar
  // o tempo da 1ª chamada; a 2ª normalmente acerta o cache (memória ou CDN).
  const [detalhe, setDetalhe] = useState<AuditData | "loading" | "erro">("loading");
  useEffect(() => {
    let cancelled = false;
    // Cache de sessão (TTL 5 min): voltar à Home não refaz o /api/home.
    const tryFetch = (fresco = false) => (
      fresco
        ? fetchJsonFresh<Record<string, any>>(`/api/home?_t=${Date.now()}`, "/api/home")
        : fetchJsonCached<Record<string, any>>("/api/home", 5 * 60_000)
    ).then((d) => (d && !d.error ? d : null)).catch(() => null);
    (async () => {
      let d = await tryFetch();
      if (!cancelled && !(d && d.overview && d.overview.kpis)) {
        await new Promise((r) => setTimeout(r, 2500));
        if (!cancelled) { const d2 = await tryFetch(true); if (d2) d = d2; }
      }
      if (cancelled) return;
      setIbkrLoaded(true);
      if (!d) { setDetalhe((s) => (s === "loading" ? "erro" : s)); return; }
      if (d.overview && d.overview.kpis) setIbkrOverview(d.overview as IbkrStripData);
      const pd = d.patrimonioDia;
      if (pd?.ibkr_ok === true && typeof pd?.patrimonio_dia_brl === "number" && pd.patrimonio_dia_brl > 0) {
        setPatrimonioDia(pd.patrimonio_dia_brl);
      }
      setDetalhe(d.detalhe && d.detalhe.partes ? (d.detalhe as AuditData) : "erro");
    })();
    return () => { cancelled = true; };
  }, []);
  const detalheData = typeof detalhe === "object" ? detalhe : null;

  // (patrimonioDia agora vem do /api/home consolidado acima — SÓ é usado quando
  // ibkr_ok, senão uma falha do Flex devolveria um valor parcial só-BR+cripto.)

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
            <button
              type="button"
              onClick={() => setMascoteOn(true)}
              aria-label="Barroots"
              title="Barroots"
              className="shrink-0 transition-transform hover:scale-105 active:scale-95"
            >
              <Image
                src="/midias/carregamento.png"
                alt="Meus Investimentos"
                width={72}
                height={72}
                className="object-contain"
                priority
              />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "var(--text)", letterSpacing: "-.01em" }}>
                  Olá, Lucas
                </h1>
                <button
                  type="button"
                  onClick={() => openEmbed("https://meus-investimentos-eeplqkozbtfcs8vzjsweqs.streamlit.app", "Meus Investimentos · V1", "versão anterior (Streamlit)")}
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
                </button>
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

        {/* ── Patrimônio total + gráfico — logo abaixo do painel rolante ── */}
        {!loading && (
          <ErrorBoundary fallback={null}>
            <div className="mt-4 animate-fade-in">
              <DayStripsTotal
                brl={dayBRLfinal}
                pctVal={dayPctFinal}
                // Só valores baseados no book REAL da IBKR (detalhe do servidor →
                // client ao vivo → patrimonio-dia). null = ainda carregando → skeleton.
                patrimonioBRL={totalPartes ?? patrimonioDiaClient ?? patrimonioDia}
                usdbrl={usdbrl}
                priv={priv}
                onOpenRetorno={() => setRetornoOpen(true)}
              />
            </div>
          </ErrorBoundary>
        )}

        {/* ── Skeleton do painel do dia enquanto o snapshot carrega ── */}
        {loading && (
          <div className="mt-4 animate-pulse" style={{ height: 300, border: "1px solid var(--line)", background: "var(--panel)", borderRadius: 14 }} />
        )}

        {/* ── Retorno do dia · por book — agora só no popup (aberto pelo Σ) ── */}
        <RetornoDiaModal open={retornoOpen} onClose={() => setRetornoOpen(false)}>
          {ibkrOverview ? <IbkrDayStrip data={ibkrOverview} priv={priv} /> : <IbkrStripPlaceholder loaded={ibkrLoaded} />}
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
        </RetornoDiaModal>

        {/* ── Row 4: Radar do dia — largura cheia (Mercado Preditivo removido) ── */}
        {!loading && data && tickerItems.length > 0 && (
          <ErrorBoundary>
            <LazyMount minHeight={320}>
              <div className="mt-4 animate-fade-in">
                <RadarDoDia tickerItems={tickerItems} />
              </div>
            </LazyMount>
          </ErrorBoundary>
        )}

        {/* ── Row 5: Notícias Destaques — lazy (abaixo da dobra) ── */}
        {!loading && (
          <ErrorBoundary>
            <LazyMount minHeight={320}>
              <div className="mt-4 animate-fade-in">
                <NoticiasDestaques />
              </div>
            </LazyMount>
          </ErrorBoundary>
        )}

      </div>

      {/* Easter-egg: mascote Barroots caminhando (clique na logo do topo) */}
      <MascoteWalk show={mascoteOn} onDone={() => setMascoteOn(false)} />
    </div>
    </ErrorBoundary>
  );
}
