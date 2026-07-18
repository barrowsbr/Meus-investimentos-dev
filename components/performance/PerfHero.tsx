"use client";

// Extraído de app/performance/page.tsx — Hero Performance Command Center
// (headline TWR/MWR/MTM + benchmarks), incluindo os helpers do layout claro.

import React from "react";
import { pct } from "@/lib/format";
import { formatDate, formatDuracao, type Summary, type GeInfo } from "@/components/performance/shared";

// ── Helpers do layout claro (tema creme) ────────────────────────────────────

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-3">
      <span
        className="font-mono shrink-0"
        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--muted)" }}
      >
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: "var(--line-strong)" }} />
    </div>
  );
}

function EditorialBar({ label, value, maxAbs }: { label: string; value: number; maxAbs: number }) {
  const pos = value >= 0;
  const w = Math.min(100, (Math.abs(value) / maxAbs) * 100);
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: "110px 1fr auto", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line-strong)" }}
    >
      <span className="font-mono truncate" style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
        {label}
      </span>
      <div className="flex items-center" style={{ height: 12 }}>
        <div className="flex-1 flex justify-end">
          {!pos && <div style={{ width: `${w}%`, height: 8, background: "var(--neg)" }} />}
        </div>
        <div style={{ width: 1, height: 12, background: "var(--line-strong)" }} />
        <div className="flex-1 flex justify-start">
          {pos && <div style={{ width: `${w}%`, height: 8, background: "var(--pos)" }} />}
        </div>
      </div>
      <span className="font-mono tnum text-right" style={{ fontSize: 12, fontWeight: 700, color: pos ? "var(--pos)" : "var(--neg)", minWidth: 60 }}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)}%
      </span>
    </div>
  );
}

// ── Hero Performance Command Center ──

export default function PerfHero({
  s, isLight, isUsd, twrPct, mwrPct, trendColor, compactCurr, geInfo, patrimonioCanon,
  lookback, customMode, classe, setores, tickerFilter, corretoraFilter,
}: {
  s: Summary;
  isLight: boolean;
  isUsd: boolean;
  twrPct: number;
  mwrPct: number;
  trendColor: string;
  compactCurr: (v: number) => string;
  geInfo: GeInfo;
  patrimonioCanon: { total: number; net: number; divida: number; alavancagemPct: number; usdbrl: number } | null;
  lookback: number;
  customMode: boolean;
  classe: "tudo" | "rv" | "rf";
  setores: string[];
  tickerFilter: string;
  corretoraFilter: string;
}) {
  const mwrTotal = s.duracaoAnos > 0 ? (Math.pow(1 + s.mwr, s.duracaoAnos) - 1) * 100 : mwrPct;
  const navAtual = s.patrimonio?.total ?? s.navFinal;
  // Patrimônio ATUAL não depende do período — só dos filtros de ativo.
  // Sem filtros: usa o canônico (cotações ao vivo, bate com o Resumo).
  // Com filtro: mantém o patrimônio da fatia filtrada (golden source).
  const assetUnfiltered = classe === "tudo" && setores.length === 0 && !tickerFilter && !corretoraFilter;
  const patCanon = assetUnfiltered && patrimonioCanon ? patrimonioCanon : null;
  const patToCurr = (v: number) => patCanon && isUsd && patCanon.usdbrl > 0 ? v / patCanon.usdbrl : v;
  const patDivida = patCanon ? patCanon.divida : (s.patrimonio?.divida ?? 0);
  const patNet = patCanon ? patToCurr(patCanon.net) : (s.patrimonio?.net ?? navAtual);
  const patBruto = patCanon ? patToCurr(patCanon.total) : navAtual;
  const patAlavPct = patCanon ? patCanon.alavancagemPct : (s.patrimonio?.alavancagemPct ?? 0);
  const isAllTime = lookback === 0 && !customMode;
  const useSnapshot = !!tickerFilter && isAllTime && s.resultadoTotal != null;
  // FONTE ÚNICA (geInfo): sem pulo entre golden e canônico. Enquanto o
  // canônico não resolve, geLoading é true e o MTM mostra "···".
  const ge = geInfo.value;
  const geLoading = geInfo.loading;
  const custoFIFO = (tickerFilter && isAllTime && s.custoFIFOSnapshot) || s.custoPosicoesAtuais || s.totalInvestido;
  const pctBase = isAllTime ? custoFIFO : s.navInicial;
  const retornoTotalPct = useSnapshot && s.resultadoTotalPct != null
    ? s.resultadoTotalPct
    : pctBase > 0 ? (ge / pctBase) * 100 : 0;

  const benchmarks = [
    { label: isUsd ? "S&P 500" : "CDI", value: isUsd ? (s.sp500Total ?? 0) : s.cdiTotal, alpha: isUsd ? (s.vsSP500 ?? s.vsCDI) : s.vsCDI, color: isUsd ? "#ec4899" : "#6366f1" },
    { label: "IBOV", value: s.ibovTotal, alpha: s.vsIBOV, color: "#f59e0b" },
    ...(!isUsd && s.sp500BrlTotal != null ? [{ label: "S&P 500", value: s.sp500BrlTotal, alpha: s.vsSP500BRL ?? 0, color: "#ec4899" }] : []),
  ];

  if (isLight) {
    /* ── CREME: layout claro plano (números grandes em tinta café) ── */
    const twrColor = twrPct >= 0 ? "var(--pos)" : "var(--neg)";
    const mwrColor = mwrTotal >= 0 ? "var(--pos)" : "var(--neg)";
    const geColor = ge >= 0 ? "var(--pos)" : "var(--neg)";
    const benchMaxAbs = Math.max(...benchmarks.map(b => Math.abs(b.value * 100)), 1);

    return (
      <div className="mb-6">
        {/* ── Headline: TWR ── */}
        <section>
          <Kicker>Retorno Acumulado</Kicker>
          <div className="flex items-baseline flex-wrap gap-x-6 gap-y-1 mt-1">
            <div>
              <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--muted)" }}>TWR</span>
              <div className="font-mono tnum" style={{ fontSize: "clamp(2.2rem, 10vw, 3.8rem)", fontWeight: 800, lineHeight: 1, letterSpacing: "-.02em", color: twrColor }}>
                {twrPct >= 0 ? "+" : ""}{twrPct.toFixed(2)}%
              </div>
              <span className="font-mono" style={{ fontSize: 11, color: "var(--muted)" }}>CAGR {pct(s.twrAnualizado * 100)}</span>
            </div>
            <div>
              <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--muted)" }}>MWR</span>
              <div className="font-mono tnum" style={{ fontSize: "clamp(1.4rem, 6vw, 2rem)", fontWeight: 800, lineHeight: 1.1, color: mwrColor }}>
                {mwrTotal >= 0 ? "+" : ""}{mwrTotal.toFixed(2)}%
              </div>
              <span className="font-mono" style={{ fontSize: 11, color: "var(--muted)" }}>TIR {pct(mwrPct)}</span>
            </div>
            <div>
              <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--muted)" }}>MTM</span>
              <div className="font-mono tnum" style={{ fontSize: "clamp(1.4rem, 6vw, 2rem)", fontWeight: 800, lineHeight: 1.1, color: geColor }}>
                {geLoading ? "···" : `${ge >= 0 ? "+" : ""}${compactCurr(ge)}`}
              </div>
              <span className="font-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                {geLoading ? " " : `${retornoTotalPct >= 0 ? "+" : ""}${retornoTotalPct.toFixed(1)}% / ${compactCurr(pctBase)}`}
              </span>
            </div>
          </div>
          <p className="font-mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
            {formatDuracao(s.duracaoAnos)} · {formatDate(s.primeiraData)} → {formatDate(s.ultimaData)}
            {" · "}Patrimônio {compactCurr(patNet)}
          </p>
        </section>

        {/* ── Benchmarks as divergent bars ── */}
        <Kicker>Contra Benchmarks</Kicker>
        {benchmarks.map(b => (
          <EditorialBar key={b.label} label={`${b.label} ${pct(b.value * 100)}`} value={b.alpha * 100} maxAbs={benchMaxAbs} />
        ))}
        <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 6 }}>
          Cada barra é o alpha (excesso de retorno TWR sobre o benchmark). Direita = superou, esquerda = ficou abaixo.
        </p>

      </div>
    );
  }

  return (
    <div className="relative mb-4 animate-fade-in">
      <div className="perf-hero-card" style={{
        boxShadow: `0 0 120px -40px ${trendColor}10, 0 30px 60px -15px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`
      }}>
        {/* ─ Animated shimmer accent ─ */}
        <div className="h-[2px] perf-accent" style={{
          background: `linear-gradient(90deg, transparent 0%, ${trendColor}30 20%, ${trendColor}aa 50%, ${trendColor}30 80%, transparent 100%)`,
        }} />

        {/* ─ Ambient radial glow ─ */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-44 pointer-events-none perf-glow" style={{
          background: `radial-gradient(ellipse at 50% -30%, ${trendColor}0c, transparent 70%)`
        }} />

        <div className="relative px-4 pt-5 pb-4 sm:px-6">
          {/* ── Primary Metrics ── */}
          <div className="flex items-center justify-center gap-0 mb-4">
            {/* MWR — left wing */}
            <div className="flex-1 text-right pr-4 sm:pr-6" title="Money-Weighted Return (XIRR): retorno ponderado pelo dinheiro investido. MWR > TWR = aportes bem-timed; MWR < TWR = o contrário">
              <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] font-bold text-purple-400/60 mb-1">MWR</p>
              <p className={`text-lg sm:text-2xl font-extrabold tracking-tight leading-none ${mwrTotal >= 0 ? "text-purple-300" : "text-red-400"}`}>
                {mwrTotal >= 0 ? "+" : ""}{mwrTotal.toFixed(2)}%
              </p>
              <p className="text-[9px] text-zinc-600 mt-0.5">TIR {pct(mwrPct)}</p>
            </div>

            {/* TWR — hero centerpiece */}
            <div className="flex-shrink-0 text-center px-4 sm:px-8 relative" title="Time-Weighted Return: encadeia os retornos diários neutralizando o efeito do tamanho e timing dos aportes — é a métrica comparável a índices">
              <div className="absolute inset-0 rounded-2xl" style={{
                background: `radial-gradient(circle at 50% 60%, ${trendColor}06, transparent 70%)`
              }} />
              <p className="relative text-[8px] sm:text-[9px] uppercase tracking-[0.3em] font-bold mb-1.5" style={{ color: `${trendColor}80` }}>TWR</p>
              <p className="relative text-4xl sm:text-5xl font-black tracking-tighter leading-none" style={{
                background: `linear-gradient(180deg, #ffffff 20%, ${trendColor}cc 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: `drop-shadow(0 4px 24px ${trendColor}20)`,
              }}>
                {twrPct >= 0 ? "+" : ""}{twrPct.toFixed(2)}%
              </p>
              <p className="relative text-[10px] text-zinc-500 mt-1.5 font-medium tracking-wide">CAGR {pct(s.twrAnualizado * 100)}</p>
            </div>

            {/* MTM — right wing */}
            <div className="flex-1 pl-4 sm:pl-6" title="MTM (mark-to-market): variação de preço + proventos">
              <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.2em] font-bold text-amber-400/60 mb-1">MTM</p>
              <p className={`text-lg sm:text-2xl font-extrabold tracking-tight leading-none ${ge >= 0 ? "text-amber-300" : "text-red-400"}`}>
                {geLoading ? "···" : `${ge >= 0 ? "+" : ""}${compactCurr(ge)}`}
              </p>
              <p className="text-[9px] text-zinc-600 mt-0.5">
                {geLoading ? " " : `${retornoTotalPct >= 0 ? "+" : ""}${retornoTotalPct.toFixed(1)}% / ${compactCurr(pctBase)}`}
              </p>
            </div>
          </div>

          {/* ── Gradient separator ── */}
          <div className="h-px bg-gradient-to-r from-transparent via-zinc-600/25 to-transparent" />

          {/* ── Context strip ── */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
            <span className="text-[10px] text-zinc-500 font-medium">
              {formatDuracao(s.duracaoAnos)} · {formatDate(s.primeiraData)} → {formatDate(s.ultimaData)}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {benchmarks.map(b => (
                <span key={b.label} className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] backdrop-blur-sm" style={{
                  background: `linear-gradient(135deg, ${b.color}0a, ${b.color}04)`,
                  border: `1px solid ${b.color}18`,
                  boxShadow: `0 0 12px ${b.color}06`,
                }}>
                  <span className="text-zinc-400 font-medium">{b.label}</span>
                  <span className="font-bold" style={{ color: b.color }}>{pct(b.value * 100)}</span>
                  <span className={`font-bold ${b.alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    α{b.alpha >= 0 ? "+" : ""}{(b.alpha * 100).toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2" title={`Patrimônio${patDivida > 0 ? " líquido (bruto " + compactCurr(patBruto) + " − margin " + compactCurr(patToCurr(patDivida)) + ")" : ""}`}>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">
                {patDivida > 0 ? "Net" : "Patrimônio"}
              </span>
              <span className="text-sm font-bold text-zinc-100">{compactCurr(patNet)}</span>
              {patDivida > 0 && (
                <span className="text-[9px] text-amber-400/70 font-medium">({patAlavPct.toFixed(1)}%)</span>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
