"use client";

import { Briefcase, Loader2, PieChart } from "lucide-react";
import type { ExposureResponse } from "@/lib/radar/types";

function formatBRL(v: number): string {
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
}

interface Props {
  countryName: string;
  exposure: ExposureResponse | null;
  exposureLoading: boolean;
}

export default function PortfolioTab({ countryName, exposure, exposureLoading }: Props) {
  if (exposureLoading) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" /> Carregando portfólio…
      </div>
    );
  }

  if (!exposure || exposure.exposure.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-zinc-500">
        Sem dados de portfólio disponíveis.
      </div>
    );
  }

  const countryEntry = exposure.exposure.find(e => e.countryPT === countryName);
  const otherCountries = exposure.exposure.filter(e => e.countryPT !== countryName).slice(0, 6);

  return (
    <div className="space-y-4 p-4">
      {/* Exposure in this country */}
      {countryEntry ? (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Briefcase size={13} className="text-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
              Sua Exposição — {countryName}
            </span>
          </div>
          <div
            className="rounded-xl p-4"
            style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.18)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-lg font-bold text-emerald-400">{formatBRL(countryEntry.totalBRL)}</p>
                <p className="text-[11px] text-zinc-400">{countryEntry.pct.toFixed(1)}% do portfólio</p>
              </div>
              <div className="relative flex h-14 w-14 items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="14" fill="none"
                    stroke="#4ade80" strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${(countryEntry.pct / 100) * 88} 88`}
                  />
                </svg>
                <span className="absolute font-mono text-xs font-bold text-emerald-400">
                  {countryEntry.pct.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {countryEntry.tickers.map(t => (
                <span
                  key={t}
                  className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Briefcase size={13} className="text-zinc-500" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Sem Exposição — {countryName}
            </span>
          </div>
          <div className="rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            Você não tem posições neste país.
          </div>
        </section>
      )}

      {/* Global allocation overview */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <PieChart size={13} className="text-blue-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">
            Alocação Geográfica
          </span>
        </div>
        <div
          className="divide-y divide-white/[0.06] overflow-hidden rounded-xl"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {(countryEntry ? [countryEntry, ...otherCountries] : otherCountries).map((e) => {
            const isThis = e.countryPT === countryName;
            return (
              <div
                key={e.iso2}
                className="flex items-center justify-between px-3 py-2"
                style={{ background: isThis ? "rgba(74,222,128,0.04)" : "transparent" }}
              >
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${isThis ? "text-emerald-300" : "text-zinc-300"}`}>
                    {e.countryPT}
                  </p>
                  <p className="truncate text-[10px] text-zinc-600">
                    {e.tickers.slice(0, 4).join(", ")}
                    {e.tickers.length > 4 ? ` +${e.tickers.length - 4}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-xs text-zinc-300">{formatBRL(e.totalBRL)}</p>
                  <p className="font-mono text-[10px] text-zinc-500">{e.pct.toFixed(1)}%</p>
                </div>
              </div>
            );
          })}
        </div>
        {exposure.totalBRL != null && (
          <p className="mt-2 text-[10px] text-zinc-600">
            Patrimônio total mapeado: {formatBRL(exposure.totalBRL)}
          </p>
        )}
      </section>
    </div>
  );
}
