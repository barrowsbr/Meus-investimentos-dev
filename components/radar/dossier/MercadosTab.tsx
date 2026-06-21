"use client";

import { BarChart3, AlertCircle, Layers, ChevronRight, Loader2 } from "lucide-react";
import type { IndexData, TimelineResponse, SymbolTarget } from "@/lib/radar/types";
import { useConstituents } from "@/lib/radar/use-radar";
import HorizonChart from "../charts/HorizonChart";

function fmtNum(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Linha clicável de símbolo (índice ou ação) → abre o detalhe no lugar do mapa.
function SymbolRow({
  flag, name, sub, price, changePct, onClick,
}: {
  flag?: string; name: string; sub?: string; price: number; changePct: number; onClick: () => void;
}) {
  const pos = changePct >= 0;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
      style={{ border: "1px solid rgba(255,255,255,0.05)" }}
    >
      {flag && <span className="shrink-0 text-base leading-none">{flag}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-zinc-200">{name}</p>
        {sub && <p className="truncate text-[10px] text-zinc-600">{sub}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[11px] text-zinc-300">{fmtNum(price)}</p>
        <p className="font-mono text-[10px] font-semibold" style={{ color: pos ? "#4ade80" : "#f87171" }}>
          {pos ? "+" : ""}{changePct.toFixed(2)}%
        </p>
      </div>
      <ChevronRight size={13} className="shrink-0 text-zinc-600" />
    </button>
  );
}

export default function MercadosTab({
  indices, timeline, onOpenSymbol,
}: {
  indices: IndexData[];
  timeline?: TimelineResponse | null;
  onOpenSymbol: (t: SymbolTarget) => void;
}) {
  // Índice principal do país = primeiro da lista (catálogo já ordena pelo main).
  const primary = indices[0] ?? null;
  const { data: constituents, loading: constituentsLoading } = useConstituents(primary?.symbol ?? null);
  const stocks = constituents?.available ? constituents.constituents : [];

  if (indices.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">Sem mercados monitorados para este país.</p>;
  }

  const hasTimeline = timeline && timeline.timeline.length > 0;

  return (
    <div className="space-y-4 p-4">
      {/* Índices do país — clicáveis */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <BarChart3 size={13} className="text-emerald-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">Índices</span>
          <span className="text-[9px] text-zinc-600">clique para o gráfico</span>
        </div>
        <div className="space-y-1.5">
          {indices.map((idx) => (
            <SymbolRow
              key={idx.symbol}
              flag={idx.flag}
              name={idx.name}
              sub={idx.symbol}
              price={idx.price}
              changePct={idx.changePct}
              onClick={() => onOpenSymbol({ symbol: idx.symbol, name: idx.name, kind: "index", moeda: idx.currency, flag: idx.flag })}
            />
          ))}
        </div>
      </section>

      {/* Maiores ações do índice principal — clicáveis */}
      {primary && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Layers size={13} className="text-indigo-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">Maiores ações</span>
            <span className="text-[9px] text-zinc-600">{primary.name}</span>
          </div>
          {constituentsLoading && stocks.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <Loader2 size={13} className="animate-spin" /> Carregando ações…
            </div>
          ) : stocks.length > 0 ? (
            <div className="space-y-1.5">
              {stocks.map((c) => (
                <SymbolRow
                  key={c.ticker}
                  name={c.ticker.replace(/\.\w+$/, "")}
                  sub={c.name && c.name !== c.ticker ? c.name : undefined}
                  price={c.price}
                  changePct={c.changePct}
                  onClick={() => onOpenSymbol({ symbol: c.ticker, name: c.name || c.ticker, kind: "stock", moeda: c.currency || primary.currency })}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl p-3 text-[11px] text-zinc-600" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              Lista de ações indisponível para este índice.
            </p>
          )}
        </section>
      )}

      {/* Histórico compacto dos últimos dias */}
      {hasTimeline ? (
        <section>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Últimos Dias</span>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <HorizonChart
              rows={[
                { label: "Índice", values: timeline!.timeline.map((d) => d.indexChangePct ?? 0) },
                ...(timeline!.timeline.some((d) => d.fxChangePct !== null)
                  ? [{ label: "Câmbio", values: timeline!.timeline.map((d) => -(d.fxChangePct ?? 0)) }]
                  : []),
              ]}
              dayLabels={timeline!.timeline.map((d) => {
                const dt = new Date(d.date + "T12:00:00");
                return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
              })}
            />
          </div>
        </section>
      ) : timeline === null && (
        <section>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Últimos Dias</span>
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <AlertCircle size={13} className="shrink-0 text-zinc-600" />
            Histórico recente indisponível.
          </div>
        </section>
      )}
    </div>
  );
}
