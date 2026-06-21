"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SymbolDetail — abre NO LUGAR DO MAPA quando se clica num índice ou ação no
// dossiê. Mostra candlestick (CandleChart), cabeçalho com preço/variação/market
// cap/faixa 52s, descrição (/api/bolsas/profile) e notícias (ações).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Newspaper, Info, ExternalLink, BarChart3 } from "lucide-react";
import CandleChart from "@/components/CandleChart";
import type { SymbolTarget, CountryNewsItem } from "@/lib/radar/types";

interface OhlcInfo {
  data: { date: string; close: number }[];
  longName?: string;
  sector?: string;
  industry?: string;
  currency?: string;
  marketCap?: number;
  pe?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

interface NewsArticle {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  impacto: CountryNewsItem["impacto"];
}

function fmtBig(v: number, currency: string): string {
  const sym = currency === "USD" ? "$" : currency === "BRL" ? "R$" : currency === "EUR" ? "€" : `${currency} `;
  if (v >= 1e12) return `${sym}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${sym}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${sym}${(v / 1e6).toFixed(1)}M`;
  return `${sym}${v.toLocaleString("en-US")}`;
}

function fmtPrice(v: number, currency: string): string {
  const sym = currency === "USD" ? "$" : currency === "BRL" ? "R$" : currency === "EUR" ? "€" : "";
  const locale = currency === "BRL" ? "pt-BR" : "en-US";
  return `${sym}${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SymbolDetail({ target, onClose }: { target: SymbolTarget; onClose: () => void }) {
  const [info, setInfo] = useState<OhlcInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [description, setDescription] = useState<string | null>(null);
  const [news, setNews] = useState<NewsArticle[] | null>(null);

  const moeda = target.moeda || info?.currency || "USD";

  // ── Cabeçalho: preço/variação/market cap via OHLC (range curto) ────────────
  useEffect(() => {
    let cancelled = false;
    setInfo(null); setInfoLoading(true);
    fetch(`/api/market/ohlc?ticker=${encodeURIComponent(target.symbol)}&moeda=${encodeURIComponent(target.moeda)}&range=1mo`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && !d.error) setInfo(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setInfoLoading(false); });
    return () => { cancelled = true; };
  }, [target.symbol, target.moeda]);

  // ── Descrição (índice/ação) ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setDescription(null);
    fetch(`/api/bolsas/profile?symbol=${encodeURIComponent(target.symbol)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.description) setDescription(d.description); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [target.symbol]);

  // ── Notícias (apenas ações) ────────────────────────────────────────────────
  useEffect(() => {
    if (target.kind !== "stock") { setNews(null); return; }
    let cancelled = false;
    setNews(null);
    const clean = target.symbol.replace(/\.\w+$/, "");
    fetch(`/api/noticias?tickers=${encodeURIComponent(clean)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && Array.isArray(d.articles)) setNews(d.articles.slice(0, 6)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [target.symbol, target.kind]);

  const closes = info?.data ?? [];
  const price = closes.length ? closes[closes.length - 1].close : null;
  const prev = closes.length > 1 ? closes[closes.length - 2].close : null;
  const dayChange = price != null && prev != null && prev > 0 ? ((price / prev) - 1) * 100 : null;
  const dayPos = (dayChange ?? 0) >= 0;

  return (
    <div className="fixed inset-0 z-[65] flex flex-col overflow-hidden md:absolute md:inset-y-0 md:left-0 md:right-[380px] md:z-30 md:rounded-2xl" style={{ background: "radial-gradient(120% 100% at 50% 0%, #0d1018 0%, #070912 70%)", paddingTop: "env(safe-area-inset-top)" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          onClick={onClose}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/10"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <ArrowLeft size={14} /> Mapa
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {target.flag && <span className="text-lg leading-none">{target.flag}</span>}
            <h2 className="truncate text-sm font-bold text-zinc-100">{info?.longName || target.name}</h2>
            <span className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ background: target.kind === "index" ? "rgba(59,130,246,0.15)" : "rgba(139,92,246,0.15)", color: target.kind === "index" ? "#60a5fa" : "#a78bfa" }}>
              {target.kind === "index" ? "Índice" : "Ação"}
            </span>
          </div>
          <p className="font-mono text-[10px] text-zinc-500">{target.symbol}</p>
        </div>
        {price != null && (
          <div className="text-right">
            <p className="font-mono text-sm font-bold text-zinc-100">{fmtPrice(price, moeda)}</p>
            {dayChange != null && (
              <p className="font-mono text-[11px] font-semibold" style={{ color: dayPos ? "#4ade80" : "#f87171" }}>
                {dayPos ? "+" : ""}{dayChange.toFixed(2)}%
              </p>
            )}
          </div>
        )}
      </div>

      {/* Scroll body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ overscrollBehavior: "contain" }}>
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Stats grid */}
          {(info?.marketCap || info?.pe || info?.fiftyTwoWeekHigh || info?.sector) && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {info?.marketCap != null && (
                <Stat label="Market Cap" value={fmtBig(info.marketCap, moeda)} />
              )}
              {info?.pe != null && (
                <Stat label="P/L" value={info.pe.toFixed(1)} />
              )}
              {info?.fiftyTwoWeekHigh != null && info?.fiftyTwoWeekLow != null && (
                <Stat label="Faixa 52s" value={`${fmtPrice(info.fiftyTwoWeekLow, moeda)} – ${fmtPrice(info.fiftyTwoWeekHigh, moeda)}`} />
              )}
              {info?.sector && (
                <Stat label="Setor" value={info.sector} />
              )}
            </div>
          )}

          {/* Candlestick */}
          <CandleChart ticker={target.symbol} moeda={moeda} purchases={[]} />

          {/* Descrição */}
          {description && (
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Info size={12} className="text-sky-400" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-sky-300">Sobre</span>
              </div>
              <p className="text-[13px] leading-relaxed text-zinc-300">{description}</p>
              {info?.industry && <p className="mt-2 text-[10px] text-zinc-600">{info.sector} · {info.industry}</p>}
            </div>
          )}

          {/* Notícias (ações) */}
          {target.kind === "stock" && (
            <section>
              <div className="mb-2 flex items-center gap-1.5">
                <Newspaper size={12} className="text-amber-400" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Notícias</span>
              </div>
              {news == null ? (
                <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <Loader2 size={13} className="animate-spin" /> Buscando notícias…
                </div>
              ) : news.length === 0 ? (
                <p className="rounded-xl p-3 text-xs text-zinc-600" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>Sem notícias recentes.</p>
              ) : (
                <div className="space-y-1.5">
                  {news.map((n, i) => (
                    <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 rounded-lg p-2.5 transition-colors hover:bg-white/[0.03]" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: n.impacto === "alto" ? "#f87171" : n.impacto === "medio" ? "#facc15" : "#52525b" }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug text-zinc-200">{n.titulo}</p>
                        <p className="mt-0.5 text-[10px] text-zinc-600">{n.fonte} · {n.data}</p>
                      </div>
                      <ExternalLink size={11} className="mt-0.5 shrink-0 text-zinc-600" />
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}

          {infoLoading && !info && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-500">
              <BarChart3 size={14} className="text-zinc-600" /> Carregando dados de mercado…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 truncate text-xs font-bold text-zinc-200">{value}</div>
    </div>
  );
}
