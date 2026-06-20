"use client";

import { Activity, AlertTriangle, Briefcase, Calendar } from "lucide-react";
import type { IndexData, CurrencyData, CountryMacro, TimelineResponse, ExposureResponse } from "@/lib/radar/types";
import type { ConvergenceResult } from "@/lib/radar/convergence";
import { localFxMove } from "@/lib/radar/geo";
import { formatMacro } from "./format-macro";
import HeatmapCalendar from "../charts/HeatmapCalendar";
import BubbleScatter from "../charts/BubbleScatter";

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold" style={{ color: color ?? "#e4e4e7" }}>{value}</p>
    </div>
  );
}

function formatBRL(v: number): string {
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
}

interface Props {
  indices: IndexData[];
  currency: CurrencyData | null;
  macro: CountryMacro | null;
  countryName?: string;
  timeline?: TimelineResponse | null;
  timelineLoading?: boolean;
  convergence?: ConvergenceResult | null;
  exposure?: ExposureResponse | null;
}

export default function ResumoTab({
  indices, currency, macro, countryName,
  timeline, timelineLoading,
  convergence, exposure,
}: Props) {
  const tradable = indices.filter((i) => i.symbol !== "^VIX");
  const avg = tradable.length ? tradable.reduce((s, i) => s + i.changePct, 0) / tradable.length : null;
  const lead = tradable.length ? tradable.reduce((a, b) => (Math.abs(b.changePct) > Math.abs(a.changePct) ? b : a)) : null;

  const gdpGrowth = macro?.indicators.find((i) => i.id === "NY.GDP.MKTP.KD.ZG");
  const inflation = macro?.indicators.find((i) => i.id === "FP.CPI.TOTL.ZG");

  const parts: string[] = [];
  if (avg !== null) {
    const tone = avg > 0.3 ? "sessão positiva" : avg < -0.3 ? "sessão negativa" : "sessão estável";
    parts.push(`${tone} nos mercados locais (média ${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%)`);
    if (lead) parts.push(`destaque ${lead.name} (${lead.changePct >= 0 ? "+" : ""}${lead.changePct.toFixed(2)}%)`);
  }
  if (currency) {
    const fx = localFxMove(currency.changePct);
    parts.push(`${currency.code} ${fx >= 0 ? "valorizou" : "recuou"} ${Math.abs(fx).toFixed(2)}% vs USD`);
  }
  const leitura = parts.length ? `${parts.join("; ")}.` : "Sem mercados monitorados; veja o pano de fundo macro.";

  const exposureEntry = countryName && exposure
    ? exposure.exposure.find(e => e.countryPT === countryName)
    : null;

  return (
    <div className="space-y-4 p-4">
      {/* Alerta: convergência + exposição */}
      {convergence?.active && exposureEntry && (
        <div className="rounded-xl p-3" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
          <div className="mb-1 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-red-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-red-300">
              Alerta de Convergência
            </span>
          </div>
          <p className="text-xs leading-relaxed text-zinc-200">
            {convergence.count} sinais de risco convergem em {countryName} e você tem{" "}
            <span className="font-semibold text-red-300">{formatBRL(exposureEntry.totalBRL)}</span>{" "}
            ({exposureEntry.pct.toFixed(1)}% do portfólio) exposto neste país.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {exposureEntry.tickers.slice(0, 6).map(t => (
              <span key={t} className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Exposição sem convergência */}
      {!convergence?.active && exposureEntry && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.12)" }}>
          <Briefcase size={13} className="shrink-0 text-emerald-400" />
          <p className="text-xs text-zinc-300">
            Você tem <span className="font-semibold text-emerald-300">{formatBRL(exposureEntry.totalBRL)}</span>{" "}
            ({exposureEntry.pct.toFixed(1)}%) exposto aqui
          </p>
        </div>
      )}

      {/* Leitura sintética */}
      <div className="rounded-xl p-3" style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)" }}>
        <div className="mb-1 flex items-center gap-1.5">
          <Activity size={13} className="text-blue-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">Leitura do dia</span>
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-200">{leitura}</p>
      </div>

      {/* Chips de síntese */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {avg !== null && (
          <StatChip label="Mercado local (média)" value={`${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`} color={avg >= 0 ? "#4ade80" : "#f87171"} />
        )}
        {currency && (() => {
          const fx = localFxMove(currency.changePct);
          return <StatChip label={`${currency.code} vs USD`} value={`${fx >= 0 ? "+" : ""}${fx.toFixed(2)}%`} color={fx >= 0 ? "#4ade80" : "#f87171"} />;
        })()}
        {gdpGrowth && <StatChip label="Cresc. PIB" value={formatMacro(gdpGrowth.value, gdpGrowth.format)} />}
        {inflation && <StatChip label="Inflação (CPI)" value={formatMacro(inflation.value, inflation.format)} />}
      </div>

      {/* Heatmap calendário — substitui a timeline de barras */}
      {timeline && timeline.timeline.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Calendar size={13} className="text-indigo-400" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">Calendário de Performance</span>
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <HeatmapCalendar
              days={timeline.timeline.map((d) => ({
                date: d.date,
                changePct: d.indexChangePct,
              }))}
            />
          </div>
        </section>
      )}

      {/* Bolhas risco × retorno — contexto visual rápido */}
      {tradable.length >= 2 && exposure && exposure.exposure.length > 0 && (
        <section>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Contexto Global</span>
          <div className="rounded-xl p-2" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <BubbleScatter
              bubbles={exposure.exposure.filter(e => e.pct >= 1).slice(0, 8).map(e => ({
                label: e.countryPT,
                x: e.pct,
                y: tradable.find(t => t.country === e.countryPT)?.changePct ?? 0,
                size: e.totalBRL,
                highlight: e.countryPT === countryName,
              }))}
              xLabel="Exposição →"
              yLabel="Retorno →"
            />
          </div>
        </section>
      )}
    </div>
  );
}
