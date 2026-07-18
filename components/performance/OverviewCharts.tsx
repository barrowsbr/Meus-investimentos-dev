"use client";

// Extraído de app/performance/page.tsx — gráficos da aba Retorno (overview):
// Rentabilidade Acumulada (TWR/MWR + benchmarks + decomposição câmbio) e NAV.

import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { TrendingUp, Calendar, MousePointerClick } from "lucide-react";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import {
  TOOLTIP_STYLE, formatDate, formatDuracao,
  type Summary, type ChartRow, type ChartPalette,
} from "@/components/performance/shared";

export function RetornoChart({
  s, isLight, chartData, C,
  showTwr, showMwr, showCdi, showIbov, showSp500, showFxDecomp,
  carteiraMode, setCarteiraMode, carteiraDatas, setCarteiraDatas, pickCarteiraDate,
}: {
  s: Summary;
  isLight: boolean;
  chartData: ChartRow[];
  C: ChartPalette;
  showTwr: boolean;
  showMwr: boolean;
  showCdi: boolean;
  showIbov: boolean;
  showSp500: boolean;
  showFxDecomp: boolean;
  carteiraMode: boolean;
  setCarteiraMode: React.Dispatch<React.SetStateAction<boolean>>;
  carteiraDatas: string[];
  setCarteiraDatas: React.Dispatch<React.SetStateAction<string[]>>;
  pickCarteiraDate: (full: string) => void;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title"><TrendingUp size={15} />Rentabilidade Acumulada (%)</h2>
          {showFxDecomp && (
            <div
              className="flex items-center gap-3 text-[10.5px] flex-wrap"
              style={{ color: "var(--muted)" }}
              title="Decomposição multiplicativa: (1 + Ativo) × (1 + Câmbio) = 1 + retorno. O efeito câmbio da carteira é comum ao TWR e ao MWR; cada um tem seu 'Ativo (moeda local)'."
            >
              {showTwr && (
                <span className="inline-flex items-center gap-1.5">
                  <span style={{ width: 14, borderTop: `2px dashed ${C.ativo}`, display: "inline-block" }} />
                  Ativo — TWR
                </span>
              )}
              {showMwr && (
                <span className="inline-flex items-center gap-1.5">
                  <span style={{ width: 14, borderTop: `2px dotted ${C.ativoMwr}`, display: "inline-block" }} />
                  Ativo — MWR
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span style={{ width: 14, borderTop: `2px dashed ${C.fx}`, display: "inline-block" }} />
                Efeito câmbio
              </span>
              <span style={{ color: "var(--faint)" }}>
                Ativo × Câmbio = retorno
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Calendar size={12} />
          <span>{formatDate(s.primeiraData)} — {formatDate(s.ultimaData)}</span>
          <span className="text-zinc-600">·</span>
          <span>{formatDuracao(s.duracaoAnos)}</span>
        </div>
      </div>
      <div className="mb-1 flex items-center gap-2">
        <button
          onClick={() => { setCarteiraMode(m => !m); if (carteiraMode) setCarteiraDatas([]); }}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
          style={{
            background: carteiraMode ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${carteiraMode ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.1)"}`,
            color: carteiraMode ? "#93c5fd" : "var(--muted)",
          }}
          title="Ativa o clique no gráfico para abrir a carteira de uma data"
        >
          <MousePointerClick size={12} />
          {carteiraMode ? "Modo carteira ativo — clique numa data" : "Ver carteira por data"}
        </button>
        {carteiraMode && (
          <span className="text-[10.5px]" style={{ color: "var(--faint)" }}>fixe uma 2ª data para comparar</span>
        )}
      </div>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}
            style={carteiraMode ? { cursor: "pointer" } : undefined}
            onClick={carteiraMode ? (e: { activePayload?: Array<{ payload?: { fullDate?: string } }> }) => {
              const full = e?.activePayload?.[0]?.payload?.fullDate;
              if (full) pickCarteiraDate(full);
            } : undefined}>
            <defs>
              {/* Só a carteira (TWR) recebe preenchimento — o herói.
                  As demais séries são linhas puras, p/ leitura limpa. */}
              <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.twr} stopOpacity={0.22} />
                <stop offset="95%" stopColor={C.twr} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "#18181b"} vertical={false} />
            <ReferenceLine y={0} stroke={isLight ? "rgba(0,0,0,0.18)" : "#3f3f46"} strokeWidth={1} />
            {/* Marcadores das datas fixadas para o painel de carteira */}
            {carteiraDatas.map((fd, idx) => {
              const pt = chartData.find(p => p.fullDate === fd);
              if (!pt) return null;
              return (
                <ReferenceLine key={fd} x={pt.date} stroke={idx === 0 ? "#60a5fa" : "#f472b6"}
                  strokeWidth={1.4} strokeDasharray="4 3" />
              );
            })}
            <XAxis dataKey="date" tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
            <YAxis tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} width={44}
              tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
            <Tooltip contentStyle={isLight ? { background: "#FDFAF1", border: "1px solid rgba(96,72,40,0.2)", borderRadius: 10, color: "#2B2117", fontSize: 12 } : TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v: number, name: string) => [
                `${v > 0 ? "+" : ""}${v.toFixed(2)}%`,
                name === "portfolio" ? "Carteira (TWR)" : name === "mwr" ? "Carteira (MWR)" : name === "ativo" ? "Ativo — TWR (moeda local)" : name === "ativoMwr" ? "Ativo — MWR (moeda local)" : name === "fx" ? "Efeito câmbio" : name === "cdi" ? "CDI" : name === "ibov" ? "IBOV" : "S&P 500",
              ]}
              labelFormatter={label => `Data: ${label}`} />
            {/* Benchmarks primeiro (camada de trás), carteira por cima. */}
            {/* CDI */}
            {showCdi && (
              <Area type="monotone" dataKey="cdi" name="cdi" stroke={C.cdi} fill="none"
                strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            )}
            {/* IBOV */}
            {showIbov && (
              <Area type="monotone" dataKey="ibov" name="ibov" stroke={C.ibov} fill="none"
                strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            )}
            {/* S&P 500 */}
            {showSp500 && (
              <Area type="monotone" dataKey="sp500" name="sp500" stroke={C.sp500} fill="none"
                strokeWidth={1.4} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            )}
            {/* Decomposição câmbio: ativo (do TWR) + efeito cambial (comum) */}
            {showFxDecomp && showTwr && (
              <Area type="monotone" dataKey="ativo" name="ativo" stroke={C.ativo} fill="none"
                strokeWidth={1.6} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
            )}
            {/* Decomposição câmbio do MWR: ativo (do MWR) */}
            {showFxDecomp && showMwr && (
              <Area type="monotone" dataKey="ativoMwr" name="ativoMwr" stroke={C.ativoMwr} fill="none"
                strokeWidth={1.6} strokeDasharray="2 3" dot={false} connectNulls isAnimationActive={false} />
            )}
            {/* Efeito câmbio (mesma série para TWR e MWR — efeito da carteira) */}
            {showFxDecomp && (
              <Area type="monotone" dataKey="fx" name="fx" stroke={C.fx} fill="none"
                strokeWidth={1.6} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
            )}
            {/* MWR — linha sólida da carteira (sem preenchimento) */}
            {showMwr && (
              <Area type="monotone" dataKey="mwr" name="mwr" stroke={C.mwr} fill="none"
                strokeWidth={1.8} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
            )}
            {/* TWR — linha herói, sólida e mais grossa, com preenchimento */}
            {showTwr && (
              <Area type="monotone" dataKey="portfolio" name="portfolio" stroke={C.twr} fill={isLight ? "none" : "url(#gradPortfolio)"}
                strokeWidth={2.6} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-zinc-500 text-sm">Sem dados para o período selecionado.</p>
      )}
    </div>
  );
}

export function NavChart({ chartData, isLight, currSymbol, fmtCurr, compactCurr }: {
  chartData: ChartRow[];
  isLight: boolean;
  currSymbol: string;
  fmtCurr: (v: number) => string;
  compactCurr: (v: number) => string;
}) {
  return (
    <div className="glass-card p-5">
      <h2 className="section-title mb-4">Evolução do Patrimônio ({currSymbol})</h2>
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gradNav" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E8A33D" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#E8A33D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "#18181b"} />
            <XAxis dataKey="date" tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => compactCurr(v)} />
            <Tooltip contentStyle={isLight ? { background: "#FDFAF1", border: "1px solid rgba(96,72,40,0.2)", borderRadius: 10, color: "#2B2117", fontSize: 12 } : TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [fmtCurr(v), `NAV ${currSymbol}`]} />
            <Area type="monotone" dataKey="nav" stroke={isLight ? "#000" : "#E8A33D"} fill={isLight ? "none" : "url(#gradNav)"} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-zinc-500 text-sm">Sem dados.</p>
      )}
    </div>
  );
}
