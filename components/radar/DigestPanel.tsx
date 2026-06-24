"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DigestPanel — resumo diário do Radar, PONDERADO PELA EXPOSIÇÃO REAL.
// Em vez de varrer o mundo (que listava quedas em países onde não há posição),
// os alertas partem da exposição do portfólio (look-through de ETFs incluso):
// para cada país onde há dinheiro, estima o impacto do dia em R$ usando o índice
// local como proxy (impacto = exposição_R$ × variação_do_índice). Ranqueia por
// R$ em movimento — não pelo % do índice — e some um headline de impacto total.
// Estimativa de mercado (não inclui o efeito câmbio do dia).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { FileText, X, Zap, TrendingDown, TrendingUp, Briefcase, AlertTriangle } from "lucide-react";
import type { BolsasResponse, ExposureResponse, IndexData } from "@/lib/radar/types";

interface Props {
  markets: BolsasResponse | null;
  exposure: ExposureResponse | null;
  onPickCountry: (name: string) => void;
}

function compactBRL(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}R$ ${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}R$ ${(abs / 1e3).toFixed(1)}K`;
  return `${sign}R$ ${abs.toFixed(0)}`;
}

// Impacto com sinal explícito (+/−) para o headline e as linhas.
function signedBRL(v: number): string {
  return `${v >= 0 ? "+" : ""}${compactBRL(v)}`;
}

// Índice mais representativo (maior |variação|) de um país, como proxy do dia.
function indexForCountry(countryPT: string, indices: IndexData[]): IndexData | null {
  let best: IndexData | null = null;
  for (const i of indices) {
    if (i.symbol === "^VIX" || i.country !== countryPT) continue;
    if (!best || Math.abs(i.changePct) > Math.abs(best.changePct)) best = i;
  }
  return best;
}

export default function DigestPanel({ markets, exposure, onPickCountry }: Props) {
  const [open, setOpen] = useState(false);

  const digest = useMemo(() => {
    const indices = markets?.indices ?? [];
    const all = exposure?.exposure ?? [];

    // Só países com exposição material (≥0,5% do portfólio) entram no radar de alertas.
    const enriched = all
      .filter(e => e.pct >= 0.5)
      .map(e => {
        const idx = indexForCountry(e.countryPT, indices);
        const changePct = idx ? idx.changePct : null;
        const impactBRL = changePct != null ? e.totalBRL * (changePct / 100) : 0;
        return { ...e, idx, changePct, impactBRL };
      });

    const withMarket = enriched.filter(e => e.changePct != null);
    const totalImpactBRL = withMarket.reduce((s, e) => s + e.impactBRL, 0);
    const portfolioBase = exposure?.totalBRL ?? all.reduce((s, e) => s + e.totalBRL, 0);
    const impactPct = portfolioBase > 0 ? (totalImpactBRL / portfolioBase) * 100 : 0;

    // Quedas: posição em país cujo índice caiu ≥1%, ranqueadas pelo R$ em risco.
    const quedas = withMarket
      .filter(e => (e.changePct as number) <= -1.0)
      .sort((a, b) => a.impactBRL - b.impactBRL)
      .slice(0, 6);

    // Altas: o lado verde, ranqueado pelo R$ ganho.
    const altas = withMarket
      .filter(e => (e.changePct as number) >= 1.0)
      .sort((a, b) => b.impactBRL - a.impactBRL)
      .slice(0, 5);

    // Exposição global (top por valor) para contexto.
    const exposureList = all.filter(e => e.pct >= 1).slice(0, 6);

    return { quedas, altas, totalImpactBRL, impactPct, portfolioBase, exposureList, hasMarket: withMarket.length > 0 };
  }, [markets, exposure]);

  if (!markets) return null;

  const { quedas, altas, totalImpactBRL, impactPct, exposureList, hasMarket } = digest;
  const alertsCount = quedas.length;
  const hasRisk = alertsCount > 0;
  const hasContent = quedas.length > 0 || altas.length > 0 || exposureList.length > 0;
  const impactColor = totalImpactBRL >= 0 ? "#4ade80" : "#f87171";

  const subtitle = hasRisk
    ? `${alertsCount} ${alertsCount === 1 ? "posição em queda" : "posições em queda"}`
    : hasMarket
      ? `Impacto ${signedBRL(totalImpactBRL)} hoje`
      : "Tudo tranquilo";

  return (
    <>
      {/* Botão no rail */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all"
        style={{
          background: hasRisk ? "rgba(251,146,60,0.08)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${hasRisk ? "rgba(251,146,60,0.2)" : "rgba(255,255,255,0.06)"}`,
        }}
      >
        <FileText size={15} className={hasRisk ? "text-orange-400" : "text-zinc-500"} />
        <div className="min-w-0">
          <p className={`text-xs font-semibold ${hasRisk ? "text-orange-200" : "text-zinc-300"}`}>Digest do Dia</p>
          <p className="truncate text-[10px] text-zinc-500">{subtitle}</p>
        </div>
        {hasRisk && (
          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/20 font-mono text-[10px] font-bold text-orange-400">
            {alertsCount}
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
              {/* Headline: impacto estimado no portfólio hoje */}
              {hasMarket && (
                <section
                  className="rounded-xl p-3"
                  style={{ background: `${impactColor}12`, border: `1px solid ${impactColor}28` }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                    Impacto estimado hoje
                  </p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-xl font-bold" style={{ color: impactColor }}>
                      {signedBRL(totalImpactBRL)}
                    </span>
                    <span className="font-mono text-sm font-semibold" style={{ color: impactColor }}>
                      {impactPct >= 0 ? "+" : ""}{impactPct.toFixed(2)}%
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-zinc-600">
                    estimativa via índices locais sobre sua exposição · não inclui câmbio
                  </p>
                </section>
              )}

              {/* Posições em queda — R$ em risco */}
              {quedas.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={12} className="text-red-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-red-300">
                      Posições em Queda · R$ em risco
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {quedas.map(exp => (
                      <button
                        key={exp.iso2}
                        onClick={() => { onPickCountry(exp.countryPT); setOpen(false); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
                        style={{ border: "1px solid rgba(248,113,113,0.12)" }}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200">{exp.countryPT}</p>
                          <p className="truncate text-[10px] text-zinc-500">
                            {compactBRL(exp.totalBRL)} · {exp.pct.toFixed(1)}% do portfólio
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-xs font-bold text-red-400">{signedBRL(exp.impactBRL)}</p>
                          <p className="font-mono text-[10px] text-red-300/70">{(exp.changePct as number).toFixed(2)}%</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Posições em alta — R$ a favor */}
              {altas.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-emerald-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
                      Posições em Alta · R$ a favor
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {altas.map(exp => (
                      <button
                        key={exp.iso2}
                        onClick={() => { onPickCountry(exp.countryPT); setOpen(false); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/5"
                        style={{ border: "1px solid rgba(74,222,128,0.12)" }}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-200">{exp.countryPT}</p>
                          <p className="truncate text-[10px] text-zinc-500">
                            {compactBRL(exp.totalBRL)} · {exp.pct.toFixed(1)}% do portfólio
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-xs font-bold text-emerald-400">{signedBRL(exp.impactBRL)}</p>
                          <p className="font-mono text-[10px] text-emerald-300/70">+{(exp.changePct as number).toFixed(2)}%</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Exposição global (contexto) */}
              {exposureList.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Briefcase size={12} className="text-blue-400" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">Sua Exposição Global</span>
                  </div>
                  <div className="space-y-1">
                    {exposureList.map(exp => (
                      <button
                        key={exp.iso2}
                        onClick={() => { onPickCountry(exp.countryPT); setOpen(false); }}
                        className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="text-xs text-zinc-300">{exp.countryPT}</span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          {compactBRL(exp.totalBRL)} · {exp.pct.toFixed(1)}%
                        </span>
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

              {hasContent && quedas.length === 0 && altas.length === 0 && (
                <div className="flex items-center justify-center gap-1.5 py-2 text-center text-[11px] text-zinc-500">
                  <TrendingDown size={12} className="text-zinc-600" />
                  Sem movimentos relevantes nas suas posições hoje.
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
