"use client";

import { ArrowLeftRight, BarChart3 } from "lucide-react";
import type { IndexData, CurrencyData, TimelineResponse } from "@/lib/radar/types";
import { localFxMove } from "@/lib/radar/geo";
import RankingChart from "../charts/RankingChart";
import HorizonChart from "../charts/HorizonChart";

export default function MercadosTab({
  indices, currency, timeline,
}: {
  indices: IndexData[];
  currency: CurrencyData | null;
  timeline?: TimelineResponse | null;
}) {
  if (indices.length === 0 && !currency) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">Sem mercados monitorados para este país.</p>;
  }

  const hasTimeline = timeline && timeline.timeline.length > 0;

  return (
    <div className="space-y-4 p-4">
      {/* Ranking: índices ordenados por performance */}
      {indices.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <BarChart3 size={13} className="text-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">Ranking do Dia</span>
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <RankingChart
              items={indices.map((idx) => ({
                label: idx.name,
                flag: idx.flag,
                value: idx.price,
                changePct: idx.changePct,
              }))}
            />
          </div>
        </section>
      )}

      {/* Horizon: histórico compacto dos últimos dias */}
      {hasTimeline && (
        <section>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Últimos Dias</span>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <HorizonChart
              rows={[
                {
                  label: "Índice",
                  values: timeline!.timeline.map((d) => d.indexChangePct ?? 0),
                },
                ...(timeline!.timeline.some((d) => d.fxChangePct !== null)
                  ? [{
                      label: "Câmbio",
                      values: timeline!.timeline.map((d) => -(d.fxChangePct ?? 0)),
                    }]
                  : []),
              ]}
              dayLabels={timeline!.timeline.map((d) => {
                const dt = new Date(d.date + "T12:00:00");
                return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
              })}
            />
          </div>
        </section>
      )}

      {/* Moeda local */}
      {currency && (
        <section>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Moeda local</span>
          <div className="flex items-center justify-between rounded-xl px-3 py-3" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={14} className="text-zinc-500" />
              <div>
                <p className="text-xs font-semibold text-zinc-200">{currency.flag} {currency.code}</p>
                <p className="text-[10px] text-zinc-500">{currency.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-xs text-zinc-300">1 USD = {currency.rate < 1 ? currency.rate.toFixed(6) : currency.rate.toFixed(4)}</p>
              {(() => {
                const fx = localFxMove(currency.changePct);
                return (
                  <p className={`font-mono text-[11px] font-semibold ${fx >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {currency.code} {fx >= 0 ? "+" : ""}{fx.toFixed(2)}% vs USD
                  </p>
                );
              })()}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
