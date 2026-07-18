"use client";

// Extraído de app/performance/page.tsx — popups de detalhe da aba Retorno:
// Resumo do Período, TWR vs MWR (+ decomposição FX) e Decomposição por Moeda.

import React from "react";
import { DollarSign } from "lucide-react";
import PerfModal from "@/components/performance/PerfModal";
import { compactBRL, pct } from "@/lib/format";
import {
  formatDate, formatDuracao,
  type Summary, type PerformanceResponse, type DecomposicaoResponse, type GeInfo,
} from "@/components/performance/shared";

export function ResumoPopup({
  s, isLight, isUsd, currSymbol, twrPct, mwrPct, trendColor, compactCurr,
  lookback, customMode, tickerFilter, geInfo, onClose,
}: {
  s: Summary;
  isLight: boolean;
  isUsd: boolean;
  currSymbol: string;
  twrPct: number;
  mwrPct: number;
  trendColor: string;
  compactCurr: (v: number) => string;
  lookback: number;
  customMode: boolean;
  tickerFilter: string;
  geInfo: GeInfo;
  onClose: () => void;
}) {
  return (
    <PerfModal title={`Resumo do Período (${currSymbol})`} onClose={onClose}>
    <div className="space-y-2">
      {[
        { label: "TWR acumulado", value: pct(twrPct), color: trendColor },
        { label: "TWR anualizado (CAGR)", value: pct(s.twrAnualizado * 100), color: trendColor },
        { label: "MWR / TIR anualizado", value: pct(mwrPct), color: mwrPct >= 0 ? "#a78bfa" : "#f87171" },
        { label: "CDI no período", value: pct(s.cdiTotal * 100), color: "#6366f1" },
        { label: "IBOV no período", value: pct(s.ibovTotal * 100), color: "#f59e0b" },
        ...(isUsd
          ? [{ label: "S&P 500 no período", value: pct((s.sp500Total ?? 0) * 100), color: "#ec4899" }]
          : [{ label: "S&P 500 (BRL)", value: pct((s.sp500BrlTotal ?? 0) * 100), color: "#ec4899" }]
        ),
        { label: isUsd ? "Alpha vs S&P 500" : "Alpha vs CDI", value: pct((isUsd ? (s.vsSP500 ?? s.vsCDI) : s.vsCDI) * 100), color: (isUsd ? (s.vsSP500 ?? s.vsCDI) : s.vsCDI) >= 0 ? "#34d399" : "#f87171" },
        { label: "Patrimônio inicial", value: compactCurr(s.navInicial) },
        { label: (lookback === 0 && !customMode) ? "Investido" : "NAV inicial", value: compactCurr((lookback === 0 && !customMode) ? ((tickerFilter && s.custoFIFOSnapshot) || s.custoPosicoesAtuais || s.totalInvestido) : s.navInicial) },
        { label: "Patrimônio final", value: compactCurr(s.navFinal) },
        ...(() => {
          // Mesma FONTE ÚNICA do headline (geInfo) — sem divergência entre
          // o card e a lista de detalhes.
          const ge = geInfo.value;
          return [{ label: "Ganho econômico", value: geInfo.loading ? "···" : `${ge >= 0 ? "+" : ""}${compactCurr(ge)}`, color: ge >= 0 ? "#34d399" : "#f87171" }];
        })(),
        { label: "Duração", value: formatDuracao(s.duracaoAnos) },
        { label: "Primeiro aporte", value: formatDate(s.primeiraData) },
        ...(s.ganhoDecomposicao ? [
          { label: "── Decomposição ──", value: "", color: "var(--muted)" },
          { label: "NAV final (engine)", value: compactCurr(s.ganhoDecomposicao.navFinal) },
          { label: "NAV inicial (engine)", value: compactCurr(s.ganhoDecomposicao.navInicial) },
          { label: "Fluxos no período", value: compactCurr(s.ganhoDecomposicao.flowsFromFirst) },
          { label: "Fluxo 1o dia (excluído)", value: compactCurr(s.ganhoDecomposicao.firstMeaningfulFlow) },
          { label: "Proventos no período", value: compactCurr(s.ganhoDecomposicao.incomeFromFirst) },
          { label: "Dias base ≤ 0", value: String(s.ganhoDecomposicao.forceZeroDays) },
        ] : []),
      ].map(row => (
        <div key={row.label} className="flex justify-between items-center text-sm border-b border-border/20 pb-1.5 last:border-0 last:pb-0">
          <span className="text-zinc-400">{row.label}</span>
          <span className="font-semibold" style={{ color: row.color ?? (isLight ? "var(--text)" : "#f1f5f9") }}>{row.value}</span>
        </div>
      ))}
    </div>
    </PerfModal>
  );
}

export function TwrMwrPopup({ data, s, isUsd, currSymbol, twrPct, mwrPct, onClose }: {
  data: PerformanceResponse;
  s: Summary;
  isUsd: boolean;
  currSymbol: string;
  twrPct: number;
  mwrPct: number;
  onClose: () => void;
}) {
  return (
    <PerfModal title={`TWR vs MWR — Comparação (${currSymbol})`} onClose={onClose}>
    {(() => {
      const fxD = isUsd && data.usdView?.fxDecomposition
        ? data.usdView.fxDecomposition
        : data.fxDecomposition;
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-400 mb-1">TWR — Time-Weighted Return</p>
              <p className="text-xs text-zinc-500">Elimina o efeito dos aportes e resgates. Mede a qualidade das decisões de investimento independente do timing dos aportes.</p>
              <p className="text-sm font-bold text-blue-300 mt-2">{pct(twrPct)} total · {pct(s.twrAnualizado * 100)} a.a.</p>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
              <p className="text-xs font-bold text-purple-400 mb-1">MWR / IRR — Money-Weighted Return</p>
              <p className="text-xs text-zinc-500">Inclui o impacto do timing dos aportes. Reflete o retorno real do seu dinheiro investido.</p>
              <p className="text-sm font-bold text-purple-300 mt-2">{pct(mwrPct)} a.a.</p>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 mb-3">
              <DollarSign size={13} className="inline" /> Decomposição: Ativo vs Cambial {isUsd ? "(visão USD)" : ""}
            </h3>
            <p className="text-[10px] text-zinc-600 mb-3">
              R<sub>total</sub> = R<sub>ativo</sub> + R<sub>fx</sub> + (R<sub>ativo</sub> × R<sub>fx</sub>) — o último termo é o <span className="text-purple-400">efeito cruzado</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: `R. Total (${currSymbol})`, value: fxD.r_total * 100, color: "#60a5fa" },
                { label: "Ativo (puro)", value: fxD.r_ativo * 100, color: "#34d399" },
                { label: isUsd ? "Câmbio (BRL→USD)" : "Câmbio (USD→BRL)", value: fxD.r_fx * 100, color: "#f59e0b" },
                { label: "Efeito cruzado", value: fxD.r_combinado * 100, color: "#8b5cf6" },
              ].map(item => (
                <div key={item.label} className="text-center p-3 rounded-xl bg-zinc-900/50">
                  <p className="text-[10px] text-zinc-500 mb-1">{item.label}</p>
                  <p className="text-lg font-bold" style={{ color: item.color }}>
                    {item.value >= 0 ? "+" : ""}{item.value.toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    })()}
    </PerfModal>
  );
}

export function MoedaPopup({ decomp, onClose }: {
  decomp: DecomposicaoResponse;
  onClose: () => void;
}) {
  return (
    <PerfModal title="Decomposição por Moeda" onClose={onClose}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/30">
              {["Moeda", "Posições", "Valor BRL", "Ret. Ativo", "Ret. Câmbio", "Ret. Total"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {decomp.buckets.map(b => (
              <tr key={b.currency} className="border-b border-border/10 hover:bg-white/[0.02]">
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-zinc-200">{b.currency}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{b.num_positions}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-300">{compactBRL(b.valor_brl)}</td>
                <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: b.retorno_ativo_pct >= 0 ? "#34d399" : "#f87171" }}>
                  {b.retorno_ativo_pct >= 0 ? "+" : ""}{b.retorno_ativo_pct.toFixed(2)}%
                </td>
                <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: b.retorno_cambio_pct >= 0 ? "#34d399" : "#f87171" }}>
                  {b.retorno_cambio_pct >= 0 ? "+" : ""}{b.retorno_cambio_pct.toFixed(2)}%
                </td>
                <td className="px-3 py-2.5 text-xs font-bold" style={{ color: b.retorno_total_pct >= 0 ? "#34d399" : "#f87171" }}>
                  {b.retorno_total_pct >= 0 ? "+" : ""}{b.retorno_total_pct.toFixed(2)}%
                </td>
              </tr>
            ))}
            <tr className="border-t border-border/30 bg-white/[0.02]">
              <td className="px-3 py-2.5 text-xs font-bold text-zinc-200">Total</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-xs font-bold text-zinc-200">{compactBRL(decomp.total.valor_brl)}</td>
              <td className="px-3 py-2.5 text-xs font-bold" style={{ color: decomp.total.retorno_ativo_pct >= 0 ? "#34d399" : "#f87171" }}>
                {decomp.total.retorno_ativo_pct >= 0 ? "+" : ""}{decomp.total.retorno_ativo_pct.toFixed(2)}%
              </td>
              <td className="px-3 py-2.5 text-xs font-bold" style={{ color: decomp.total.retorno_cambio_pct >= 0 ? "#34d399" : "#f87171" }}>
                {decomp.total.retorno_cambio_pct >= 0 ? "+" : ""}{decomp.total.retorno_cambio_pct.toFixed(2)}%
              </td>
              <td className="px-3 py-2.5" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-600 mt-2">
        Ret. Ativo = retorno do ativo na moeda original · Ret. Câmbio = impacto do câmbio no BRL · Total = (1+Ativo)×(1+Câmbio)−1
      </p>
    </PerfModal>
  );
}
