"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DigestPanel — resumo do dia do Radar. FATOS DE MERCADO, sem número inventado.
// A versão anterior estimava um "impacto em R$" = exposição × variação do índice
// mais volátil do país — o que fabricava um P&L que não batia com o resultado
// real do dia (e superestimava, usando Nasdaq p/ EUA etc.). Removido.
//
// Agora mostra só o que é verdade e útil num radar de mercados:
//  • Clima do dia: VIX + amplitude (quantos mercados subindo/caindo).
//  • Maiores altas e quedas do mundo (1 índice representativo por país;
//    EUA = S&P 500). % real do dia.
//  • Sua exposição global por país (R$/%), marcando nos movers onde você tem
//    posição — sem estimar impacto.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { FileText, X, Briefcase, TrendingUp, TrendingDown, Activity } from "lucide-react";
import type { BolsasResponse, ExposureResponse, IndexData } from "@/lib/radar/types";

interface Props {
  markets: BolsasResponse | null;
  exposure: ExposureResponse | null;
  onPickCountry: (name: string) => void;
}

const VIX_SYMBOL = "^VIX";
// Índice representativo por país (consistente com o mapa de calor). EUA = S&P 500.
const PREFERRED_INDEX: Record<string, string> = { EUA: "^GSPC" };

function compactBRL(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}R$ ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}R$ ${(abs / 1e3).toFixed(1)}K`;
  return `${sign}R$ ${abs.toFixed(0)}`;
}
function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// Um índice representativo por país: o preferido (ex.: EUA→S&P 500) ou, na
// falta dele, o de maior |variação|.
function representativeByCountry(indices: IndexData[]): IndexData[] {
  const best = new Map<string, IndexData>();
  const locked = new Set<string>();
  for (const i of indices) {
    if (i.symbol === VIX_SYMBOL || !i.country) continue;
    if (locked.has(i.country)) continue;
    const pref = PREFERRED_INDEX[i.country];
    if (pref) {
      if (i.symbol === pref) { best.set(i.country, i); locked.add(i.country); continue; }
      if (!best.has(i.country)) best.set(i.country, i); // provisório até o preferido aparecer
      continue;
    }
    const cur = best.get(i.country);
    if (!cur || Math.abs(i.changePct) > Math.abs(cur.changePct)) best.set(i.country, i);
  }
  return [...best.values()];
}

// Clima pelo VIX (índice do medo).
function vixMood(price: number): { label: string; color: string } {
  if (price < 15) return { label: "Calmo", color: "#4ade80" };
  if (price < 20) return { label: "Normal", color: "#a3e635" };
  if (price < 27) return { label: "Tenso", color: "#fbbf24" };
  if (price < 35) return { label: "Estresse", color: "#fb923c" };
  return { label: "Pânico", color: "#f87171" };
}

export default function DigestPanel({ markets, exposure, onPickCountry }: Props) {
  const [open, setOpen] = useState(false);

  const digest = useMemo(() => {
    const indices = markets?.indices ?? [];
    const reps = representativeByCountry(indices);

    const altas = reps.filter(i => i.changePct > 0.01).sort((a, b) => b.changePct - a.changePct).slice(0, 5);
    const quedas = reps.filter(i => i.changePct < -0.01).sort((a, b) => a.changePct - b.changePct).slice(0, 5);
    const upCount = reps.filter(i => i.changePct > 0).length;
    const downCount = reps.filter(i => i.changePct < 0).length;
    const vix = indices.find(i => i.symbol === VIX_SYMBOL) ?? null;

    const exp = exposure?.exposure ?? [];
    const exposedCountries = new Set(exp.filter(e => e.pct >= 0.5).map(e => e.countryPT));
    const exposureList = [...exp].filter(e => e.pct >= 1).sort((a, b) => b.totalBRL - a.totalBRL).slice(0, 6);

    return { altas, quedas, upCount, downCount, vix, exposedCountries, exposureList, hasMarket: reps.length > 0 };
  }, [markets, exposure]);

  if (!markets) return null;

  const { altas, quedas, upCount, downCount, vix, exposedCountries, exposureList, hasMarket } = digest;
  const risky = downCount > upCount;
  const mood = vix ? vixMood(vix.price) : null;
  const subtitle = hasMarket ? `${upCount} em alta · ${downCount} em queda` : "Sem dados de mercado";

  const MoverRow = ({ i, color }: { i: IndexData; color: string }) => (
    <button
      onClick={() => { onPickCountry(i.country); setOpen(false); }}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
      style={{ border: `1px solid ${color}1f` }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-base leading-none">{i.flag}</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-200">{i.name}</p>
          <p className="flex items-center gap-1 truncate text-[10px] text-zinc-500">
            {i.country}
            {exposedCountries.has(i.country) && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-300/80">
                · <Briefcase size={8} /> carteira
              </span>
            )}
          </p>
        </div>
      </div>
      <span className="shrink-0 font-mono text-xs font-bold" style={{ color }}>{pct(i.changePct)}</span>
    </button>
  );

  return (
    <>
      {/* Botão no rail */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all"
        style={{
          background: risky ? "rgba(251,146,60,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${risky ? "rgba(251,146,60,0.2)" : "rgba(255,255,255,0.06)"}`,
        }}
      >
        <FileText size={15} className={risky ? "text-orange-400" : "text-zinc-500"} />
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${risky ? "text-orange-200" : "text-zinc-300"}`}>Digest do Dia</p>
          <p className="truncate text-[10px] text-zinc-500">{subtitle}</p>
        </div>
        {mood && (
          <span className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold" style={{ background: `${mood.color}1f`, color: mood.color }}>
            VIX {vix!.price.toFixed(0)}
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
              {/* Clima do mercado — VIX + amplitude */}
              <section className="rounded-xl p-3" style={{ background: `${mood?.color ?? "#64748b"}12`, border: `1px solid ${mood?.color ?? "#64748b"}28` }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Clima do mercado hoje</p>
                <div className="mt-1 flex items-baseline gap-2">
                  {vix ? (
                    <>
                      <span className="font-mono text-xl font-bold" style={{ color: mood!.color }}>{mood!.label}</span>
                      <span className="font-mono text-sm font-semibold text-zinc-400">VIX {vix.price.toFixed(1)} <span style={{ color: vix.changePct >= 0 ? "#f87171" : "#4ade80" }}>({pct(vix.changePct)})</span></span>
                    </>
                  ) : (
                    <span className="font-mono text-lg font-bold text-zinc-300">{upCount} em alta · {downCount} em queda</span>
                  )}
                </div>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-zinc-500">
                  <Activity size={10} /> {upCount} mercados em alta · {downCount} em queda
                </p>
              </section>

              {/* Maiores altas */}
              {altas.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-emerald-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">Maiores altas do dia</span>
                  </div>
                  <div className="space-y-1.5">
                    {altas.map(i => <MoverRow key={i.symbol} i={i} color="#4ade80" />)}
                  </div>
                </section>
              )}

              {/* Maiores quedas */}
              {quedas.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <TrendingDown size={12} className="text-red-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-red-300">Maiores quedas do dia</span>
                  </div>
                  <div className="space-y-1.5">
                    {quedas.map(i => <MoverRow key={i.symbol} i={i} color="#f87171" />)}
                  </div>
                </section>
              )}

              {/* Sua exposição global (contexto real) */}
              {exposureList.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Briefcase size={12} className="text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">Sua exposição global</span>
                  </div>
                  <div className="space-y-1">
                    {exposureList.map(exp => (
                      <button
                        key={exp.iso2}
                        onClick={() => { onPickCountry(exp.countryPT); setOpen(false); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="text-xs text-zinc-300">{exp.countryPT}</span>
                        <span className="font-mono text-[11px] text-zinc-400">{compactBRL(exp.totalBRL)} · {exp.pct.toFixed(1)}%</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {!hasMarket && (
                <div className="py-6 text-center text-sm text-zinc-500">Sem dados de mercado agora.</div>
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
