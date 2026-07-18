"use client";

// Extraído de app/performance/page.tsx — aba Mensal: heatmaps de retorno
// TWR (%) e MTM (R$), com meses travados (twr_mensal) e divergências.

import React from "react";
import { Calendar, DollarSign } from "lucide-react";

// ── Heatmap helpers (tema claro × escuro) ────────────────────────────────────

function heatmapColors(isPos: boolean, intensity: number, light: boolean) {
  if (light) {
    const bg = isPos
      ? `rgba(30,122,60,${0.06 + intensity * 0.22})`
      : `rgba(192,51,40,${0.06 + intensity * 0.22})`;
    const text = isPos ? "#1E7A3C" : "#C03328";
    return { bg, text };
  }
  const bg = isPos
    ? `rgba(52,211,153,${0.12 + intensity * 0.55})`
    : `rgba(248,113,113,${0.12 + intensity * 0.55})`;
  const text = isPos ? "#34d399" : "#f87171";
  return { bg, text };
}

function heatmapBorder(isPos: boolean, light: boolean) {
  if (light) return {
    borderColor: isPos ? "rgba(30,122,60,0.25)" : "rgba(192,51,40,0.25)",
    color: isPos ? "#1E7A3C" : "#C03328",
    background: isPos ? "rgba(30,122,60,0.06)" : "rgba(192,51,40,0.06)",
  };
  return {
    borderColor: isPos ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)",
    color: isPos ? "#34d399" : "#f87171",
    background: isPos ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
  };
}

export default function MonthlyTab({
  monthlyView, setMonthlyView, monthlyGrid, mtmGrid, lockedMonthsSet,
  monthlyDivergencias, currSymbol, fmtCurr, compactCurr, isLight,
}: {
  monthlyView: "twr" | "mtm";
  setMonthlyView: React.Dispatch<React.SetStateAction<"twr" | "mtm">>;
  monthlyGrid: { years: number[]; byYearMonth: Record<number, Record<number, number>> };
  mtmGrid: { years: number[]; byYearMonth: Record<number, Record<number, { gain: number; gainPct: number; navEnd: number }>> };
  lockedMonthsSet: Set<string>;
  monthlyDivergencias?: Array<{ month: string; locked: number; computado: number }>;
  currSymbol: string;
  fmtCurr: (v: number) => string;
  compactCurr: (v: number) => string;
  isLight: boolean;
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title"><Calendar size={15} />Retornos Mensais — Heatmap</h2>
        <div className="flex rounded-lg overflow-hidden border border-zinc-800/60">
          <button onClick={() => setMonthlyView("twr")}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              monthlyView === "twr"
                ? "bg-indigo-900/50 text-indigo-300"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}>
            TWR (%)
          </button>
          <button onClick={() => setMonthlyView("mtm")}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-zinc-800 ${
              monthlyView === "mtm"
                ? "bg-amber-900/50 text-amber-300"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
            }`}>
            <DollarSign size={11} className="inline -mt-0.5 mr-0.5" />MTM ({currSymbol})
          </button>
        </div>
      </div>
      <p className="text-xs text-zinc-600 mb-5">
        {monthlyView === "twr"
          ? "Cada célula representa o retorno TWR do portfólio naquele mês. Verde = positivo, vermelho = negativo."
          : "Cada célula representa o ganho absoluto (MTM) do mês, usando preços e câmbio do último dia útil do período — cenário fechado."}
      </p>

      {/* ── TWR (%) heatmap ── */}
      {monthlyView === "twr" && (
        <>
          {monthlyGrid.years.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left pr-3 pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] w-12">Ano</th>
                    {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                      <th key={m} className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] min-w-[52px]">{m}</th>
                    ))}
                    <th className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] pl-3 w-16">Ano</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyGrid.years.map(year => {
                    const mths = monthlyGrid.byYearMonth[year] ?? {};
                    const yearVals = Object.values(mths);
                    const yearTotal = yearVals.length > 0
                      ? yearVals.reduce((acc, v) => acc * (1 + v / 100), 1) * 100 - 100
                      : null;
                    return (
                      <tr key={year} className="group">
                        <td className="pr-3 py-1 text-zinc-400 font-bold text-[11px]">{year}</td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => {
                          const v = mths[mo];
                          if (v === undefined) {
                            return <td key={mo} className="py-1 px-0.5"><div className="rounded-md h-9 bg-zinc-900/40" /></td>;
                          }
                          const isPos = v >= 0;
                          const intensity = Math.min(Math.abs(v) / 5, 1);
                          const hm = heatmapColors(isPos, intensity, isLight);
                          const mesKey = `${year}-${String(mo).padStart(2, "0")}`;
                          const locked = lockedMonthsSet.has(mesKey);
                          return (
                            <td key={mo} className="py-1 px-0.5">
                              <div
                                className="relative rounded-md h-9 flex items-center justify-center font-semibold cursor-default transition-transform hover:scale-105"
                                style={{ background: hm.bg, color: hm.text }}
                                title={`${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][mo-1]}/${year}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%${locked ? " · 🔒 travado (imutável)" : " · dinâmico — ainda pode mudar"}`}
                              >
                                {v >= 0 ? "+" : ""}{v.toFixed(1)}%
                                {!locked && (
                                  <span
                                    className="absolute rounded-full"
                                    style={{ top: 3, right: 3, width: 4, height: 4, background: "currentColor", opacity: 0.55 }}
                                    aria-hidden
                                  />
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-1 pl-3">
                          {yearTotal !== null && (
                            <div
                              className="rounded-md h-9 flex items-center justify-center font-bold text-[11px] border"
                              style={heatmapBorder(yearTotal >= 0, isLight)}
                            >
                              {yearTotal >= 0 ? "+" : ""}{yearTotal.toFixed(1)}%
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-600 text-sm text-center py-8">Sem dados mensais disponíveis</p>
          )}

          {monthlyGrid.years.length > 0 && (() => {
            const all = Object.values(monthlyGrid.byYearMonth).flatMap(m => Object.values(m));
            const pos = all.filter(v => v >= 0).length;
            const neg = all.filter(v => v < 0).length;
            const avg = all.length > 0 ? all.reduce((s, v) => s + v, 0) / all.length : 0;
            const lockedCount = lockedMonthsSet.size;
            const dynCount = Math.max(0, all.length - lockedCount);
            return (
              <>
                <p className="text-xs text-zinc-600 mt-4">
                  Média mensal: <span className="text-zinc-400 font-semibold">{avg >= 0 ? "+" : ""}{avg.toFixed(2)}%</span>
                  {" · "}Positivos: <span className="text-emerald-400 font-semibold">{pos}</span>
                  {" · "}Negativos: <span className="text-red-400 font-semibold">{neg}</span>
                  {" · "}Hit rate: <span className="text-zinc-400 font-semibold">{all.length > 0 ? ((pos / all.length) * 100).toFixed(0) : 0}%</span>
                </p>
                {(monthlyDivergencias?.length ?? 0) > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-700/50 bg-amber-900/15 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-amber-300">
                      ⚠ {monthlyDivergencias!.length} mês(es) travado(s) DIVERGEM do recalculado — fotografia tirada na era de um bug ficou imutável com valor errado (é isso que infla o total do ano):
                    </p>
                    {monthlyDivergencias!.map(d => (
                      <div key={d.month} className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span className="text-zinc-300 font-bold">{d.month}</span>
                        <span className="text-red-400">travado {d.locked >= 0 ? "+" : ""}{d.locked.toFixed(2)}%</span>
                        <span className="text-zinc-500">→ recalculado</span>
                        <span className="text-emerald-400">{d.computado >= 0 ? "+" : ""}{d.computado.toFixed(2)}%</span>
                        <button
                          onClick={async () => {
                            const r = await fetch("/api/config/planilha/saude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "corrigir-twr-mes", month: d.month, pct: d.computado }) });
                            const j = await r.json();
                            if (j?.ok) window.location.reload();
                            else alert(j?.error ?? "Falha ao corrigir");
                          }}
                          className="rounded border border-amber-600/60 bg-amber-900/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-900/50"
                        >
                          Corrigir p/ {d.computado >= 0 ? "+" : ""}{d.computado.toFixed(2)}%
                        </button>
                      </div>
                    ))}
                    <p className="text-[10px] text-zinc-600">A correção reescreve a fotografia daquele mês na aba twr_mensal (com backup automático).</p>
                  </div>
                )}
                <p className="text-[11px] text-zinc-600 mt-2">
                  {lockedCount > 0 ? (
                    <>🔒 <span className="text-zinc-400 font-semibold">{lockedCount}</span> {lockedCount === 1 ? "mês travado" : "meses travados"} (fotografados na virada do mês — imutáveis)
                    {dynCount > 0 && <> · <span className="text-amber-400/80 font-semibold">{dynCount}</span> com ponto no canto = dinâmico (mês corrente, ainda muda)</>}</>
                  ) : (
                    <>Nenhum mês travado nesta vista — janelas de tempo e filtros recalculam tudo dinamicamente; o lock (🔒) só vale na vista completa &ldquo;Tudo&rdquo; sem filtros.</>
                  )}
                </p>
              </>
            );
          })()}
        </>
      )}

      {/* ── MTM (R$) heatmap — cenário fechado ── */}
      {monthlyView === "mtm" && (
        <>
          {mtmGrid.years.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left pr-3 pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] w-12">Ano</th>
                    {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map(m => (
                      <th key={m} className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] min-w-[60px]">{m}</th>
                    ))}
                    <th className="text-center pb-3 text-zinc-600 font-semibold uppercase tracking-wider text-[9px] pl-3 w-20">Ano</th>
                  </tr>
                </thead>
                <tbody>
                  {mtmGrid.years.map(year => {
                    const mths = mtmGrid.byYearMonth[year] ?? {};
                    const yearGain = Object.values(mths).reduce((s, v) => s + v.gain, 0);
                    const lastMonth = Math.max(...Object.keys(mths).map(Number));
                    const yearEndNav = mths[lastMonth]?.navEnd ?? 0;
                    return (
                      <tr key={year} className="group">
                        <td className="pr-3 py-1 text-zinc-400 font-bold text-[11px]">{year}</td>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(mo => {
                          const cell = mths[mo];
                          if (!cell) {
                            return <td key={mo} className="py-1 px-0.5"><div className="rounded-md h-11 bg-zinc-900/40" /></td>;
                          }
                          const v = cell.gain;
                          const pct = cell.gainPct;
                          const twrPctMonth = monthlyGrid.byYearMonth[year]?.[mo];
                          const isPos = v >= 0;
                          const absK = Math.abs(v) / 1000;
                          const intensity = Math.min(absK / 5, 1);
                          const hm = heatmapColors(isPos, intensity, isLight);
                          const label = absK >= 10
                            ? `${v >= 0 ? "+" : "-"}${(Math.abs(v) / 1000).toFixed(0)}k`
                            : `${v >= 0 ? "+" : "-"}${(Math.abs(v) / 1000).toFixed(1)}k`;
                          const moLabel = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][mo-1];
                          const tip = `${moLabel}/${year}: ${v >= 0 ? "+" : ""}${fmtCurr(v)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)${twrPctMonth != null ? ` · TWR ${twrPctMonth >= 0 ? "+" : ""}${twrPctMonth.toFixed(2)}%` : ""} · Patrimônio: ${fmtCurr(cell.navEnd)}`;
                          return (
                            <td key={mo} className="py-1 px-0.5">
                              <div
                                className="rounded-md h-11 flex flex-col items-center justify-center cursor-default transition-transform hover:scale-105"
                                style={{ background: hm.bg, color: hm.text }}
                                title={tip}
                              >
                                <span className="font-semibold text-[11px] leading-none">{label}</span>
                                <span className="text-[9px] leading-none mt-0.5 opacity-75">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-1 pl-3">
                          {(() => {
                            const yearPct = Object.values(mths).reduce((acc, c) => acc * (1 + c.gainPct / 100), 1) * 100 - 100;
                            return (
                              <div
                                className="rounded-md h-11 flex flex-col items-center justify-center font-bold text-[10px] border"
                                style={{ ...heatmapBorder(yearGain >= 0, isLight) }}
                                title={`Patrimônio fim/${year}: ${fmtCurr(yearEndNav)}`}
                              >
                                <span>{yearGain >= 0 ? "+" : ""}{compactCurr(yearGain)}</span>
                                <span className="text-[9px] opacity-75 mt-0.5">{yearPct >= 0 ? "+" : ""}{yearPct.toFixed(1)}%</span>
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-600 text-sm text-center py-8">Sem dados de MTM disponíveis</p>
          )}

          {mtmGrid.years.length > 0 && (() => {
            const all = Object.values(mtmGrid.byYearMonth).flatMap(m => Object.values(m).map(c => c.gain));
            const pos = all.filter(v => v >= 0).length;
            const neg = all.filter(v => v < 0).length;
            const total = all.reduce((s, v) => s + v, 0);
            const avg = all.length > 0 ? total / all.length : 0;
            return (
              <p className="text-xs text-zinc-600 mt-4">
                Média mensal: <span className="text-zinc-400 font-semibold">{avg >= 0 ? "+" : ""}{compactCurr(avg)}</span>
                {" · "}Total: <span className="text-zinc-400 font-semibold">{total >= 0 ? "+" : ""}{compactCurr(total)}</span>
                {" · "}Positivos: <span className="text-emerald-400 font-semibold">{pos}</span>
                {" · "}Negativos: <span className="text-red-400 font-semibold">{neg}</span>
                {" · "}Hit rate: <span className="text-zinc-400 font-semibold">{all.length > 0 ? ((pos / all.length) * 100).toFixed(0) : 0}%</span>
              </p>
            );
          })()}
        </>
      )}
    </div>
  );
}
