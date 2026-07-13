"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CommoditiesPanel — monitoramento de commodities no Radar. Abre no lugar do
// mapa (mesmo posicionamento do SymbolDetail): cotações dos futuros contínuos
// (Yahoo) agrupadas por categoria; clique numa linha abre o SymbolDetail com
// candlestick completo do contrato.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import type { SymbolTarget } from "@/lib/radar/types";
import { COMMODITY_CATEGORIAS, type CommoditiesResponse, type CommodityQuote } from "@/lib/radar/commodities";
import CommodityIcon from "./CommodityIcon";

function fmtPrice(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Mini-gráfico do último mês — vai ANTES do valor, colorido pela tendência da
// janela (não pela variação do dia, que já tem o próprio número ao lado).
function Sparkline({ data, id }: { data: number[]; id: string }) {
  if (data.length < 2) return <div style={{ width: 64 }} />;
  const W = 64, H = 26;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - 2 - ((v - min) / span) * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = data[data.length - 1] >= data[0];
  const cor = up ? "#34d399" : "#f87171";
  const gid = `spk-${id.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={W} height={H} className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.28" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill={`url(#${gid})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={cor} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Row({ c, onOpen }: { c: CommodityQuote; onOpen: (t: SymbolTarget) => void }) {
  const pos = c.changePct >= 0;
  return (
    <button
      onClick={() => onOpen({ symbol: c.symbol, name: c.name, kind: "commodity", moeda: "USD" })}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <CommodityIcon symbol={c.symbol} emoji={c.emoji} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-zinc-200">{c.name}</p>
        <p className="text-[10px] text-zinc-500">
          {c.unidade}
          {c.sparkPct != null && (
            <span className={`ml-1.5 font-mono font-semibold ${c.sparkPct >= 0 ? "text-emerald-500/80" : "text-red-400/80"}`}>
              {c.sparkPct >= 0 ? "+" : ""}{c.sparkPct.toFixed(1)}% no mês
            </span>
          )}
        </p>
      </div>
      <Sparkline data={c.spark} id={c.symbol} />
      <div className="w-[74px] shrink-0 text-right">
        <p className="font-mono text-xs font-semibold text-zinc-100">{fmtPrice(c.price)}</p>
        <p className={`font-mono text-[11px] font-semibold ${pos ? "text-emerald-400" : "text-red-400"}`}>
          {pos ? "+" : ""}{c.changePct.toFixed(2)}%
        </p>
      </div>
    </button>
  );
}

export default function CommoditiesPanel({
  onOpenSymbol,
  onClose,
  dossierOpen = false,
}: {
  onOpenSymbol: (t: SymbolTarget) => void;
  onClose: () => void;
  dossierOpen?: boolean;
}) {
  const [data, setData] = useState<CommoditiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch("/api/bolsas/commodities")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Falha ao carregar cotações"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-[65] flex flex-col overflow-hidden md:absolute md:inset-y-0 md:left-0 md:z-[64] md:rounded-2xl ${dossierOpen ? "md:right-[380px]" : "md:right-0"}`}
      style={{ background: "radial-gradient(120% 100% at 50% 0%, #0d1018 0%, #070912 70%)", paddingTop: "env(safe-area-inset-top)" }}
      onClick={(e) => e.stopPropagation()}
    >
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
          <h2 className="text-sm font-bold text-zinc-100">Commodities</h2>
          <p className="text-[10px] text-zinc-500">Futuros contínuos · Yahoo Finance · clique para abrir o gráfico</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 disabled:opacity-40"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && !data && (
          <div className="flex h-40 items-center justify-center text-zinc-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}
        {error && !data && (
          <p className="py-8 text-center text-xs text-red-400">{error}</p>
        )}

        {data && (
          <>
            {/* Destaques do dia */}
            {data.best && data.worst && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl p-2.5" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                    <TrendingUp size={11} /> Maior alta
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-zinc-200">
                    <CommodityIcon symbol={data.best.symbol} emoji={data.best.emoji} size={18} /> {data.best.name}
                  </p>
                  <p className="font-mono text-sm font-bold text-emerald-400">+{data.best.changePct.toFixed(2)}%</p>
                </div>
                <div className="rounded-xl p-2.5" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    <TrendingDown size={11} /> Maior queda
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-zinc-200">
                    <CommodityIcon symbol={data.worst.symbol} emoji={data.worst.emoji} size={18} /> {data.worst.name}
                  </p>
                  <p className="font-mono text-sm font-bold text-red-400">{data.worst.changePct.toFixed(2)}%</p>
                </div>
              </div>
            )}

            {/* Grupos por categoria */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {COMMODITY_CATEGORIAS.map((cat) => {
                const items = data.commodities.filter((c) => c.categoria === cat);
                if (items.length === 0) return null;
                return (
                  <section key={cat}>
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{cat}</h3>
                    <div className="flex flex-col gap-1.5">
                      {items.map((c) => (
                        <Row key={c.symbol} c={c} onOpen={onOpenSymbol} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
