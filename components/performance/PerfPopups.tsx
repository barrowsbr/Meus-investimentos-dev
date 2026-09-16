"use client";

// Extraído de app/performance/page.tsx — popups de detalhe da aba Retorno:
// Resumo do Período, TWR vs MWR (+ decomposição FX) e Decomposição por Moeda.

import React from "react";
import { DollarSign } from "lucide-react";
import PerfModal from "@/components/performance/PerfModal";
import { compactBRL, pct } from "@/lib/format";
import {
  formatDate, formatDuracao,
  type Summary, type PerformanceResponse, type DecomposicaoResponse, type GeInfo, type BenchKey,
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

// ── Metodologia: TWR × MWR ───────────────────────────────────────────────────
// Abre pelo clique no bloco TWR/MWR do hero. Aqui a prosa é PEDIDA (o dono
// quis as fórmulas e o critério de uso), ao contrário do corpo da página.

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono rounded-lg px-2.5 py-2 my-1.5 overflow-x-auto whitespace-nowrap"
       style={{ fontSize: 11, color: "var(--text)", background: "rgba(128,128,128,0.10)" }}>
      {children}
    </p>
  );
}

export function TwrMwrPopup({ data, s, isUsd, currSymbol, twrPct, mwrPct, totaisBench, onClose }: {
  data: PerformanceResponse;
  s: Summary;
  isUsd: boolean;
  currSymbol: string;
  twrPct: number;
  mwrPct: number;
  /** Acumulado de cada régua no período (mesma fonte do picker do gráfico). */
  totaisBench: Partial<Record<BenchKey, number>>;
  onClose: () => void;
}) {
  const anos = s.duracaoAnos;
  // Mesma conta do hero (FONTE ÚNICA da leitura): TIR anualizada → acumulado.
  const mwrTotal = anos > 0 ? (Math.pow(1 + s.mwr, anos) - 1) * 100 : mwrPct;
  const gapAA = mwrPct - s.twrAnualizado * 100;
  const fxD = isUsd && data.usdView?.fxDecomposition ? data.usdView.fxDecomposition : data.fxDecomposition;

  const num = (v: number | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
  const reguas: Array<{ label: string; twr?: number; mwr?: number }> = [
    { label: "CDI", twr: totaisBench.cdi, mwr: totaisBench.cdi_mwr },
    { label: "IBOV", twr: totaisBench.ibov, mwr: totaisBench.ibov_mwr },
    { label: "S&P 500", twr: totaisBench.sp500, mwr: totaisBench.sp500_mwr },
  ];

  return (
    <PerfModal title={`Metodologia — TWR × MWR (${currSymbol})`} onClose={onClose}>
    <div className="space-y-5">

      {/* ── Leitura do período ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { k: "TWR", v: pct(twrPct), sub: `${pct(s.twrAnualizado * 100)} a.a.`, c: "#60a5fa" },
          { k: "MWR", v: pct(mwrTotal), sub: `TIR ${pct(mwrPct)} a.a.`, c: "#a78bfa" },
          { k: "Timing", v: `${gapAA >= 0 ? "+" : ""}${gapAA.toFixed(2)} p.p.`, sub: gapAA >= 0 ? "aportes ajudaram" : "aportes atrapalharam", c: gapAA >= 0 ? "#34d399" : "#f87171" },
        ].map(x => (
          <div key={x.k} className="text-center p-3 rounded-xl bg-zinc-900/50">
            <p className="text-[10px] text-zinc-500 mb-1">{x.k}</p>
            <p className="text-lg font-bold" style={{ color: x.c }}>{x.v}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">{x.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── TWR ── */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3.5">
          <p className="text-xs font-bold text-blue-400 mb-1.5">TWR — Time-Weighted Return (GIPS)</p>
          <p className="text-[11px] text-zinc-400">
            Retorno do dia por <b>Dietz modificado</b>, com o fluxo entrando no início do dia
            (convenção quando o horário exato é desconhecido):
          </p>
          <Formula>B<sub>d</sub> = NAV<sub>d−1</sub> + fluxo<sub>d</sub></Formula>
          <Formula>r<sub>d</sub> = (NAV<sub>d</sub> + proventos<sub>d</sub> − B<sub>d</sub>) ÷ B<sub>d</sub></Formula>
          <p className="text-[11px] text-zinc-400">Os dias são encadeados geometricamente:</p>
          <Formula>TWR = Π (1 + r<sub>d</sub>) − 1</Formula>
          <Formula>CAGR = (1 + TWR)<sup>365/dias</sup> − 1</Formula>
          <p className="text-[10.5px] text-zinc-500 mt-2">
            O dia 0 é âncora (não tem retorno: o NAV dele não foi produzido pelo fluxo do dia) e um
            dia com base ≤ 0 fica sem retorno definido, sem teto nem piso artificiais. Preço bruto +
            proventos somados à parte — usar preço ajustado contaria dividendo duas vezes.
          </p>
          <p className="text-[11px] text-blue-300 mt-2 font-semibold">
            Serve para: julgar estratégia/gestão e comparar com índice.
          </p>
        </div>

        {/* ── MWR ── */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3.5">
          <p className="text-xs font-bold text-purple-400 mb-1.5">MWR / TIR — Money-Weighted Return (XIRR)</p>
          <p className="text-[11px] text-zinc-400">
            Taxa <i>r</i> que zera o valor presente dos seus fluxos, com o tempo em anos
            (dias ÷ 365,25) e o fluxo líquido = aporte − proventos recebidos:
          </p>
          <Formula>−NAV<sub>0</sub> − Σ F<sub>i</sub>/(1+r)<sup>t<sub>i</sub></sup> + NAV<sub>T</sub>/(1+r)<sup>T</sup> = 0</Formula>
          <p className="text-[11px] text-zinc-400">
            Resolvida por Newton-Raphson com bisseção de reserva; o acumulado exibido é:
          </p>
          <Formula>MWR<sub>acum</sub> = (1 + r)<sup>anos</sup> − 1</Formula>
          <ul className="text-[11px] text-zinc-400 mt-2 space-y-1.5 list-disc pl-4">
            <li><b>Mede a sua experiência</b>, não só a da carteira: é ponderada pelo valor e pelo momento de cada aporte. Aportou muito antes de uma alta, a TIR sobe; antes de uma queda, cai.</li>
            <li><b>Não serve para avaliar gestor ou estratégia</b> — para isso é o TWR, que elimina o efeito dos fluxos. Uma carteira pode ter TWR de 12% e MWR de 20% só por bons momentos de entrada.</li>
            <li><b>Compare com o benchmark certo</b>: a TIR que o CDI ou o Ibovespa teria gerado com os mesmos fluxos.</li>
          </ul>
        </div>
      </div>

      {/* ── A comparação certa ── */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-300 mb-1">O benchmark certo para cada régua</h3>
        <p className="text-[10.5px] text-zinc-500 mb-2.5">
          O acumulado de um índice é uma medida <b>TWR</b> (buy-and-hold). Confrontá-lo com o seu MWR
          mistura réguas: dá a você o crédito (ou a culpa) por um timing que o próprio índice teria
          capturado recebendo os mesmos aportes. A coluna da direita corrige isso.
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          <div className="grid grid-cols-3 text-[10px] uppercase tracking-wide font-semibold px-3 py-1.5"
               style={{ color: "var(--muted)", background: "rgba(128,128,128,0.08)" }}>
            <span>Régua</span><span className="text-right">Acumulado (TWR)</span><span className="text-right">Seus fluxos (TIR)</span>
          </div>
          <div className="grid grid-cols-3 px-3 py-2 text-[11.5px] font-semibold" style={{ borderTop: "1px solid var(--line)" }}>
            <span style={{ color: "var(--text)" }}>Sua carteira</span>
            <span className="text-right font-mono tnum" style={{ color: "#60a5fa" }}>{pct(twrPct)}</span>
            <span className="text-right font-mono tnum" style={{ color: "#a78bfa" }}>{pct(mwrTotal)}</span>
          </div>
          {reguas.map(r => (
            <div key={r.label} className="grid grid-cols-3 px-3 py-2 text-[11.5px]" style={{ borderTop: "1px solid var(--line)" }}>
              <span className="text-zinc-400">{r.label}</span>
              <span className="text-right font-mono tnum text-zinc-400">{num(r.twr)}</span>
              <span className="text-right font-mono tnum" style={{ color: r.mwr == null ? "var(--faint)" : "var(--text)" }}>{num(r.mwr)}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600 mt-2">
          Compare na horizontal da MESMA coluna: TWR com TWR, TIR com TIR. No gráfico, ligue a série
          MWR e escolha as réguas em <b>Benchmarks → Seus fluxos</b> (ficam travadas sem a série MWR).
        </p>
      </div>

      {/* ── Decomposição ativo × câmbio (já existente) ── */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-400 mb-2">
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
