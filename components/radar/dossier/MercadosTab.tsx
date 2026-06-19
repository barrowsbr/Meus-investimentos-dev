"use client";

import { TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react";
import type { IndexData, CurrencyData } from "@/lib/radar/types";
import { localFxMove } from "@/lib/radar/geo";

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  if (p >= 100) return p.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export default function MercadosTab({ indices, currency }: { indices: IndexData[]; currency: CurrencyData | null }) {
  if (indices.length === 0 && !currency) {
    return <p className="px-4 py-8 text-center text-sm text-zinc-500">Sem mercados monitorados para este país.</p>;
  }
  return (
    <div className="space-y-4 p-4">
      {indices.length > 0 && (
        <section>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Índices locais</h4>
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            {indices.map((idx) => {
              const up = idx.changePct >= 0;
              return (
                <div key={idx.symbol} className="flex items-center justify-between px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-zinc-200">{idx.name}</p>
                    <p className="font-mono text-[10px] text-zinc-500">{idx.symbol} · {idx.currency}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xs text-zinc-300">{fmtPrice(idx.price)}</p>
                    <p className={`flex items-center justify-end gap-0.5 font-mono text-[11px] font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
                      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {up ? "+" : ""}{idx.changePct.toFixed(2)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {currency && (
        <section>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Moeda local</h4>
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
              {/* força da moeda local: rate ↓ = local valorizou → verde */}
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
