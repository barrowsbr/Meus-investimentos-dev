"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DigestPanel — resumo diário do Radar. Mostra os países com convergência
// ativa, maiores variações do dia, e exposição do portfólio em risco.
// Fase 4: "Daily Digest".
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { FileText, X, Zap, TrendingDown, Briefcase, AlertTriangle } from "lucide-react";
import type { BolsasResponse, ExposureResponse } from "@/lib/radar/types";

interface Props {
  markets: BolsasResponse | null;
  exposure: ExposureResponse | null;
  onPickCountry: (name: string) => void;
}

export default function DigestPanel({ markets, exposure, onPickCountry }: Props) {
  const [open, setOpen] = useState(false);

  if (!markets) return null;

  const falling = markets.indices
    .filter(i => i.symbol !== "^VIX" && i.changePct < -1.5)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 5);

  const exposureCountries = exposure?.exposure.filter(e => e.pct >= 1).slice(0, 6) ?? [];

  const riskyExposure = exposureCountries.filter(exp => {
    const idx = markets.indices.find(i => i.country === exp.countryPT && i.symbol !== "^VIX");
    return idx && idx.changePct < -1.5;
  });

  const hasContent = falling.length > 0 || riskyExposure.length > 0;

  return (
    <>
      {/* Botão no rail */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all"
        style={{
          background: hasContent ? "rgba(251,146,60,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${hasContent ? "rgba(251,146,60,0.2)" : "rgba(255,255,255,0.06)"}`,
        }}
      >
        <FileText size={15} className={hasContent ? "text-orange-400" : "text-zinc-500"} />
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${hasContent ? "text-orange-200" : "text-zinc-300"}`}>Digest do Dia</p>
          <p className="truncate text-[10px] text-zinc-500">
            {hasContent ? `${falling.length + riskyExposure.length} alertas` : "Tudo tranquilo"}
          </p>
        </div>
        {hasContent && (
          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20 font-mono text-[10px] font-bold text-orange-400">
            {falling.length + riskyExposure.length}
          </span>
        )}
      </button>

      {/* Modal digest */}
      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative mx-2 w-full max-w-sm overflow-hidden rounded-2xl shadow-2xl"
            style={{ background: "rgba(14,16,24,0.98)", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-orange-400" />
                <span className="text-sm font-bold text-zinc-100">Digest do Dia</span>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
              {/* Exposição em risco */}
              {riskyExposure.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-red-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-red-300">Portfólio em Risco</span>
                  </div>
                  <div className="space-y-1.5">
                    {riskyExposure.map(exp => {
                      const idx = markets.indices.find(i => i.country === exp.countryPT && i.symbol !== "^VIX");
                      return (
                        <button
                          key={exp.iso2}
                          onClick={() => { onPickCountry(exp.countryPT); setOpen(false); }}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
                          style={{ border: "1px solid rgba(248,113,113,0.12)" }}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-200">{exp.countryPT}</p>
                            <p className="text-[10px] text-zinc-500">
                              {exp.tickers.slice(0, 3).join(", ")} · {exp.pct.toFixed(1)}% do portfólio
                            </p>
                          </div>
                          {idx && (
                            <span className="shrink-0 font-mono text-xs font-semibold text-red-400">
                              {idx.changePct.toFixed(2)}%
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Maiores quedas */}
              {falling.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <TrendingDown size={12} className="text-red-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-red-300">Maiores Quedas</span>
                  </div>
                  <div className="space-y-1">
                    {falling.map(idx => (
                      <button
                        key={idx.symbol}
                        onClick={() => { onPickCountry(idx.country); setOpen(false); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-200">{idx.flag} {idx.name}</p>
                          <p className="text-[10px] text-zinc-500">{idx.country}</p>
                        </div>
                        <span className="shrink-0 font-mono text-xs font-semibold text-red-400">
                          {idx.changePct.toFixed(2)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Portfólio global */}
              {exposureCountries.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Briefcase size={12} className="text-emerald-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">Sua Exposição Global</span>
                  </div>
                  <div className="space-y-1">
                    {exposureCountries.map(exp => (
                      <button
                        key={exp.iso2}
                        onClick={() => { onPickCountry(exp.countryPT); setOpen(false); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="text-xs text-zinc-300">{exp.countryPT}</span>
                        <span className="font-mono text-[11px] text-zinc-400">{exp.pct.toFixed(1)}%</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {!hasContent && (
                <div className="py-6 text-center text-sm text-zinc-500">
                  <Zap size={20} className="mx-auto mb-2 text-zinc-600" />
                  Nenhum alerta relevante hoje. Mercados estáveis.
                </div>
              )}
            </div>

            <div className="border-t border-white/5 px-4 py-2 text-[10px] text-zinc-600">
              Clique num país para abrir o dossiê completo.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
