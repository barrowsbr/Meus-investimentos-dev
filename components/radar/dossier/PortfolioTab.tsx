"use client";

import { Briefcase, Loader2, TrendingDown, AlertCircle, Layers } from "lucide-react";
import type { ExposureResponse, IndexData } from "@/lib/radar/types";
import Treemap from "../charts/Treemap";
import WaterfallChart from "../charts/WaterfallChart";

function formatBRL(v: number): string {
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
}

interface Props {
  countryName: string;
  exposure: ExposureResponse | null;
  exposureLoading: boolean;
  indices?: IndexData[];
}

export default function PortfolioTab({ countryName, exposure, exposureLoading, indices }: Props) {
  if (exposureLoading) {
    return (
      <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" /> Carregando portfólio…
      </div>
    );
  }

  if (!exposure || exposure.exposure.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-zinc-500">
        <AlertCircle size={16} className="text-zinc-600" />
        Não foi possível calcular a exposição do portfólio. Verifique se a planilha está acessível.
      </div>
    );
  }

  const countryEntry = exposure.exposure.find(e => e.countryPT === countryName);

  const waterfallItems = exposure.exposure
    .filter(e => e.pct >= 1)
    .slice(0, 6)
    .map(e => {
      const idx = indices?.find(i => i.country === e.countryPT && i.symbol !== "^VIX");
      const dayChangeBRL = idx ? e.totalBRL * (idx.changePct / 100) : 0;
      return { label: e.countryPT.length > 6 ? e.countryPT.slice(0, 5) + "." : e.countryPT, value: dayChangeBRL };
    })
    .filter(w => w.value !== 0);

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
                  <circle cx="18" cy="18" r="14" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(countryEntry.pct / 100) * 88} 88`} />
                </svg>
                <span className="absolute font-mono text-xs font-bold text-emerald-400">{countryEntry.pct.toFixed(0)}%</span>
              </div>
            </div>

            {/* Breakdown: direct vs ETF */}
            {countryEntry.etfBRL > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Direta</span>
                  <span className="font-mono text-zinc-300">{formatBRL(countryEntry.directBRL)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1 text-zinc-400">
                    <Layers size={10} className="text-blue-400" /> Via ETFs
                  </span>
                  <span className="font-mono text-blue-300">{formatBRL(countryEntry.etfBRL)}</span>
                </div>
                {/* Proportion bar */}
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${(countryEntry.directBRL / countryEntry.totalBRL) * 100}%` }}
                  />
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${(countryEntry.etfBRL / countryEntry.totalBRL) * 100}%` }}
                  />
                </div>
                {countryEntry.etfSources && countryEntry.etfSources.length > 0 && (
                  <p className="text-[9px] text-zinc-600">
                    via {countryEntry.etfSources.join(", ")}
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1">
              {countryEntry.tickers.map(t => (
                <span key={t} className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">{t}</span>
              ))}
              {countryEntry.etfSources && countryEntry.etfSources.map(etf => (
                <span key={`etf-${etf}`} className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">{etf}</span>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-zinc-600">
              posição atual · {countryEntry.etfBRL > 0 ? "inclui look-through de ETFs" : "dados da planilha"}
            </p>
          </div>
        </section>
      ) : (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Briefcase size={13} className="text-zinc-500" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Sem Exposição — {countryName}</span>
          </div>
          <div className="rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            Você não tem posições neste país (direta ou via ETF).
          </div>
        </section>
      )}

      {/* Treemap: alocação geográfica visual */}
      <section>
        <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-blue-300">Alocação Geográfica</span>
        <Treemap
          items={exposure.exposure.filter(e => e.pct >= 0.5).map(e => ({
            label: e.countryPT,
            value: e.totalBRL,
            pct: e.pct,
            tickers: e.tickers,
          }))}
        />
        {exposure.totalBRL != null && (
          <p className="mt-2 text-[10px] text-zinc-600">
            Patrimônio mapeado: {formatBRL(exposure.totalBRL)}
            {exposure.etfDecomposed && " · inclui composição de ETFs"}
          </p>
        )}
      </section>

      {/* ETF decomposition info */}
      {exposure.etfDecomposed && exposure.etfSupported && exposure.etfSupported.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Layers size={13} className="text-blue-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">ETFs Decompostos</span>
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.12)" }}>
            <div className="flex flex-wrap gap-1.5">
              {exposure.etfSupported.map(etf => (
                <span key={etf} className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                  {etf.replace(".SA", "")}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[9px] text-zinc-600">
              A exposição geográfica considera a composição real dos ETFs acima
            </p>
          </div>
        </section>
      )}

      {/* Waterfall: contribuição ao resultado do dia */}
      {waterfallItems.length > 1 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingDown size={13} className="text-amber-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-300">Contribuição do Dia</span>
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <WaterfallChart items={waterfallItems} />
          </div>
        </section>
      )}
    </div>
  );
}
