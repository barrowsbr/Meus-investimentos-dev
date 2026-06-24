"use client";

import { useMemo, useState, useEffect } from "react";
import { Globe, RefreshCw } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { bumpDataVersion, withDataVersion } from "@/lib/data-version";
import { compactBRL } from "@/lib/format";
import { isRendaVariavel } from "@/lib/sectors";
import type { CountryAllocation } from "@/lib/ticker-country";
import InvestmentWorldMap from "@/components/InvestmentWorldMap";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LookThroughComp { ativo: string; name?: string; peso: number }
interface LookThroughETF { ticker: string; valor_brl: number; components: LookThroughComp[] }
interface RfPosicao { ticker: string; setor: string; macro: string; valor_brl: number; moeda: string; corretora: string; pais: string; is_caixa: boolean }

interface ComposicaoData {
  computed_at: string;
  fx: { USDBRL: number; EURBRL: number; CADBRL: number; GBPBRL: number };
  resumo: { total_portfolio: number; rv_value: number; rf_value: number; total_proventos: number; lucro_total_brl: number; top_performer: unknown; bottom_performer: unknown };
  estrutura_carteira: { name: string; value: number; pct: number; children?: unknown[] }[];
  exposicao_cambial: Record<string, number>;
  custodia: { brasil: number; exterior: number; brasil_pct: number; exterior_pct: number };
  rentabilidade: unknown[];
  risco_retorno: unknown[];
  pareto: unknown[];
  look_through: { supported: string[]; unsupported: string[]; compositions: Record<string, LookThroughETF>; total_look_through_brl: number; sources?: Record<string, string>; updated_at?: string };
  country_allocation?: CountryAllocation[];
  rf_posicoes?: RfPosicao[];
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatComputedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// Bucket "Outros · diversificação" — o restante do ETF além dos top holdings.
const isOutros = (ativo: string) => ativo.startsWith("OUTROS.");
const outrosEtf = (ativo: string) => ativo.replace(/^OUTROS\./, "");

// Célula de % com mini-barra (ranking visual): a barra é proporcional ao
// maior valor da lista, então o líder fica cheio e o resto é comparável.
function PctCell({ pct, max, color = "#6366f1" }: { pct: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (pct / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden hidden sm:block" style={{ width: 44 }}>
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="text-zinc-400 font-mono tabular-nums w-[3.2rem] text-right">{pct.toFixed(2)}%</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ETFPage() {
  const { data, loading: portLoading, error } = usePortfolio();
  const [composicao, setComposicao] = useState<ComposicaoData | null>(null);
  const [compLoading, setCompLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("global");
  const [lookThroughTab, setLookThroughTab] = useState<"por-etf" | "combinada" | "rv-completa" | "portfolio-completo">("por-etf");
  const [etfRefreshing, setEtfRefreshing] = useState(false);

  useEffect(() => {
    fetch(withDataVersion(`${API_URL}/api/composicao/resumo`))
      .then(r => r.json())
      .then(setComposicao)
      .catch(() => {})
      .finally(() => setCompLoading(false));
  }, []);

  const loading = portLoading || compLoading;

  const macros = useMemo(() => {
    if (!composicao?.estrutura_carteira) return [];
    return composicao.estrutura_carteira.map(m => m.name);
  }, [composicao]);

  // Mapa reage ao filtro macro: RV usa rv_brl, RF usa rf_brl, global usa o total.
  const mapAllocation = useMemo(() => {
    const raw = composicao?.country_allocation ?? [];
    if (activeFilter === "global") return raw;
    const pick = (c: CountryAllocation) => activeFilter === "Renda Fixa" ? c.rf_brl : c.rv_brl;
    const filtered = raw
      .map(c => ({ ...c, value_brl: pick(c) }))
      .filter(c => c.value_brl > 0);
    const total = filtered.reduce((s, c) => s + c.value_brl, 0);
    return filtered
      .map(c => ({ ...c, pct: total > 0 ? (c.value_brl / total) * 100 : 0 }))
      .sort((a, b) => b.value_brl - a.value_brl);
  }, [composicao, activeFilter]);

  const mapTotal = useMemo(() => {
    if (!composicao) return 0;
    if (activeFilter === "Renda Variável") return composicao.resumo.rv_value;
    if (activeFilter === "Renda Fixa") return composicao.resumo.rf_value;
    return composicao.resumo.total_portfolio;
  }, [composicao, activeFilter]);

  if (loading) return <LoadingSpinner />;
  if (error && !data) return <ErrorAlert message={error} />;
  if (!data) return <ErrorAlert message="Dados não disponíveis" />;

  const rvPositions = data.positions.filter(p => isRendaVariavel(p.setor));

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Composição ETFs"
        description="Look-through, alocação geográfica e setorial"
      />

      {/* ── Macro filter ── */}
      {composicao && macros.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {["global", ...macros].map(f => {
            const on = activeFilter === f;
            return (
              <button key={f} onClick={() => setActiveFilter(f)}
                className="font-mono uppercase"
                style={{
                  padding: "5px 12px", fontSize: 10.5, fontWeight: 600, letterSpacing: ".04em",
                  border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  background: on ? "var(--accent-wash)" : "transparent",
                  color: on ? "var(--accent)" : "var(--muted)",
                }}
              >
                {f === "global" ? "Global" : f}
              </button>
            );
          })}
        </div>
      )}

      {/* ── ETF Composition content ── */}
      <div className="space-y-4 animate-fade-in">
        {/* Header with refresh button */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-zinc-200">Composição Look-Through</h2>
            {composicao?.look_through?.updated_at && (
              <p className="text-[10px] text-zinc-600 mt-0.5">
                Atualizado {formatComputedAt(composicao.look_through.updated_at)}
                {composicao.look_through.sources && Object.values(composicao.look_through.sources).length > 0 && (
                  <> · Fontes: {[...new Set(Object.values(composicao.look_through.sources))].join(", ")}</>
                )}
              </p>
            )}
          </div>
          <button
            onClick={async () => {
              setEtfRefreshing(true);
              try {
                const res = await fetch(`${API_URL}/api/composicao/etf-refresh`, { method: "POST" });
                if (res.ok) {
                  const j = await res.json();
                  if (!j.saved_to_sheets) alert(j.warning ?? "Holdings atualizados mas não persistidos na planilha.");
                  bumpDataVersion();
                  const fresh = await fetch(withDataVersion(`${API_URL}/api/composicao/resumo`));
                  if (fresh.ok) setComposicao(await fresh.json());
                }
              } catch { /* ignore */ }
              setEtfRefreshing(false);
            }}
            disabled={etfRefreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              etfRefreshing
                ? "border-zinc-700 text-zinc-600 cursor-wait"
                : "border-emerald-700/50 text-emerald-400 hover:bg-emerald-600/10"
            }`}
          >
            <RefreshCw size={13} className={etfRefreshing ? "animate-spin" : ""} />
            {etfRefreshing ? "Atualizando…" : "Atualizar ao Vivo"}
          </button>
        </div>

        {/* World Map — geographic distribution (reage ao filtro RV/RF) */}
        {mapAllocation.length > 0 && (
          <div className="glass-card p-4 sm:p-5">
            <h2 className="section-title mb-3">
              <Globe size={15} />Distribuição Geográfica
              {activeFilter !== "global" && <span className="text-[10px] text-zinc-500 font-normal ml-2">· {activeFilter}</span>}
            </h2>
            <InvestmentWorldMap data={mapAllocation} totalBRL={mapTotal} />
          </div>
        )}

        {composicao?.look_through && composicao.look_through.supported.length > 0 && (() => {
          const lt = composicao.look_through;

          const combined: Record<string, { ativo: string; name?: string; valorBRL: number; etfs: string[] }> = {};
          for (const etf of Object.values(lt.compositions)) {
            for (const c of etf.components) {
              if (!combined[c.ativo]) combined[c.ativo] = { ativo: c.ativo, name: c.name, valorBRL: 0, etfs: [] };
              combined[c.ativo].valorBRL += etf.valor_brl * c.peso;
              if (!combined[c.ativo].etfs.includes(etf.ticker)) combined[c.ativo].etfs.push(etf.ticker);
            }
          }
          const combinedList = Object.values(combined).sort((a, b) => b.valorBRL - a.valorBRL);
          const combinedTotal = combinedList.reduce((s, c) => s + c.valorBRL, 0);

          const rvComplete: { ticker: string; name: string; valorBRL: number; source: string; isExpanded: boolean }[] = [];
          for (const p of rvPositions) {
            if (lt.compositions[p.ticker]) {
              for (const c of lt.compositions[p.ticker].components) {
                rvComplete.push({ ticker: c.ativo, name: c.name ?? "", valorBRL: p.valorAtualBRL * c.peso, source: p.ticker, isExpanded: true });
              }
            } else {
              rvComplete.push({ ticker: p.ticker, name: "", valorBRL: p.valorAtualBRL, source: "", isExpanded: false });
            }
          }
          const rvMerged: Record<string, { valorBRL: number; name: string; sources: string[] }> = {};
          for (const item of rvComplete) {
            if (!rvMerged[item.ticker]) rvMerged[item.ticker] = { valorBRL: 0, name: item.name, sources: [] };
            rvMerged[item.ticker].valorBRL += item.valorBRL;
            if (item.name && !rvMerged[item.ticker].name) rvMerged[item.ticker].name = item.name;
            if (item.source && !rvMerged[item.ticker].sources.includes(item.source))
              rvMerged[item.ticker].sources.push(item.source);
          }
          const rvCompleteList = Object.entries(rvMerged)
            .map(([ticker, d]) => ({ ticker, name: d.name, valorBRL: d.valorBRL, via: d.sources.join(", ") }))
            .sort((a, b) => b.valorBRL - a.valorBRL);
          const rvCompleteTotal = rvCompleteList.reduce((s, c) => s + c.valorBRL, 0);

          // Portfólio completo: RV (ETFs expandidos) + RF da bolsa (SHV/BIL) +
          // RF manual (Tesouro, CDBs, caixa). Ranqueia tudo e respeita o filtro.
          const rfBolsa = data.positions
            .filter(p => !isRendaVariavel(p.setor) && p.valorAtualBRL > 0)
            .map(p => ({ ticker: p.ticker, name: "", valorBRL: p.valorAtualBRL, via: p.setor, macro: "Renda Fixa" }));
          const rfManual = (composicao.rf_posicoes ?? []).map(r => ({
            ticker: r.ticker, name: "", valorBRL: r.valor_brl, via: r.is_caixa ? "Caixa" : r.setor, macro: "Renda Fixa",
          }));
          const portfolioItems = [
            ...rvCompleteList.map(c => ({ ticker: c.ticker, name: c.name, valorBRL: c.valorBRL, via: c.via || "Direto", macro: "Renda Variável" })),
            ...rfBolsa,
            ...rfManual,
          ];
          const portfolioCompletoList = portfolioItems
            .filter(i => activeFilter === "global" || i.macro === activeFilter)
            .sort((a, b) => b.valorBRL - a.valorBRL);
          const portfolioCompletoTotal = portfolioCompletoList.reduce((s, c) => s + c.valorBRL, 0);

          return (
            <div className="glass-card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {lt.supported.map(etf => (
                    <span key={etf} className="tag text-[10px] px-2 py-0.5" style={{ backgroundColor: "rgba(99,102,241,0.12)", color: "#818cf8" }}>
                      {etf} {lt.sources?.[etf] && <span className="text-zinc-600 ml-1">({lt.sources[etf]})</span>}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-zinc-500 whitespace-nowrap ml-2">{compactBRL(lt.total_look_through_brl)}</span>
              </div>

              <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 mb-3">
                <div className="flex gap-1 bg-zinc-900/60 p-1 rounded-lg w-fit">
                  {([
                    ["por-etf", "Por ETF"],
                    ["combinada", "Combinada"],
                    ["rv-completa", "RV Completa"],
                    ["portfolio-completo", "Portfólio Completo"],
                  ] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setLookThroughTab(id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${lookThroughTab === id ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {lookThroughTab === "por-etf" && (
                <div className="space-y-3">
                  {Object.values(lt.compositions).map(etf => {
                    const maxPeso = etf.components.reduce((m, c) => Math.max(m, c.peso), 0.0001);
                    return (
                      <div key={etf.ticker} className="rounded-xl border border-zinc-800/80 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50 border-b border-zinc-800/80">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-100 text-sm">{etf.ticker}</span>
                            <span className="text-[10px] text-zinc-600">{etf.components.length} ativos</span>
                          </div>
                          <span className="text-zinc-400 text-xs font-mono">{compactBRL(etf.valor_brl)}</span>
                        </div>
                        <div className="divide-y divide-zinc-900/70">
                          {etf.components.map(c => {
                            const outros = isOutros(c.ativo);
                            return (
                              <div key={c.ativo} className="relative flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-white/[0.02]">
                                <div className={`absolute inset-y-0 left-0 pointer-events-none ${outros ? "bg-zinc-500/[0.06]" : "bg-indigo-500/[0.07]"}`}
                                  style={{ width: `${(c.peso / maxPeso) * 100}%` }} />
                                <div className="relative flex items-baseline gap-1.5 min-w-0">
                                  {outros ? (
                                    <span className="text-zinc-400 font-medium text-xs italic">Outros · diversificação</span>
                                  ) : (
                                    <>
                                      <span className="text-zinc-200 font-medium text-xs">{c.ativo}</span>
                                      {c.name && c.name !== c.ativo && (
                                        <span className="text-zinc-600 text-[10px] truncate hidden sm:inline">{c.name}</span>
                                      )}
                                    </>
                                  )}
                                </div>
                                <div className="relative flex items-center gap-3 flex-shrink-0 font-mono tabular-nums">
                                  <span className={`text-[11px] w-14 text-right ${outros ? "text-zinc-500" : "text-zinc-500"}`}>{(c.peso * 100).toFixed(2)}%</span>
                                  <span className={`text-[11px] w-16 text-right ${outros ? "text-zinc-400" : "text-zinc-300"}`}>{compactBRL(etf.valor_brl * c.peso)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {lookThroughTab === "combinada" && (() => {
                const maxPct = combinedTotal > 0 ? (combinedList[0]?.valorBRL ?? 0) / combinedTotal * 100 : 0;
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider w-6">#</th>
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Ativo</th>
                          <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Valor</th>
                          <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">%</th>
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Via</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combinedList.slice(0, 30).map((c, i) => {
                          const outros = isOutros(c.ativo);
                          return (
                            <tr key={c.ativo} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                              <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                              <td className="py-1.5 px-2">
                                {outros ? (
                                  <span className="text-zinc-400 font-medium italic">Outros · diversificação <span className="text-zinc-600 not-italic">({outrosEtf(c.ativo)})</span></span>
                                ) : (
                                  <>
                                    <span className="text-zinc-200 font-semibold">{c.ativo}</span>
                                    {c.name && c.name !== c.ativo && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                                  </>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                              <td className="py-1.5 px-2">
                                <PctCell pct={combinedTotal > 0 ? (c.valorBRL / combinedTotal) * 100 : 0} max={maxPct} color={outros ? "#71717a" : "#6366f1"} />
                              </td>
                              <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{outros ? "—" : c.etfs.join(", ")}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {lookThroughTab === "rv-completa" && (() => {
                const maxPct = rvCompleteTotal > 0 ? (rvCompleteList[0]?.valorBRL ?? 0) / rvCompleteTotal * 100 : 0;
                return (
                  <>
                    <p className="text-[10px] text-zinc-600 mb-3">
                      Posições diretas + ETFs expandidos. ETFs sem composição mantidos como linha única.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider w-6">#</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Ativo</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Valor</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">%</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Via</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rvCompleteList.map((c, i) => {
                            const outros = isOutros(c.ticker);
                            return (
                              <tr key={c.ticker} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                                <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                                <td className="py-1.5 px-2">
                                  {outros ? (
                                    <span className="text-zinc-400 font-medium italic">Outros · diversificação <span className="text-zinc-600 not-italic">({outrosEtf(c.ticker)})</span></span>
                                  ) : (
                                    <>
                                      <span className="font-semibold" style={{ color: c.via ? "#a1a1aa" : "#f4f4f5" }}>{c.ticker}</span>
                                      {c.name && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                                    </>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                                <td className="py-1.5 px-2">
                                  <PctCell pct={rvCompleteTotal > 0 ? (c.valorBRL / rvCompleteTotal) * 100 : 0} max={maxPct} color={outros ? "#71717a" : "#6366f1"} />
                                </td>
                                <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{c.via || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}

              {lookThroughTab === "portfolio-completo" && (
                <>
                  <p className="text-[10px] text-zinc-600 mb-3">
                    Tudo ranqueado: RV (ETFs expandidos) + renda fixa (ETFs de RF, Tesouro, CDBs) + caixa.
                    {activeFilter !== "global" && <span className="text-zinc-500"> Filtro: {activeFilter}.</span>}
                  </p>
                  {portfolioCompletoList.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">#</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Ativo</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Classe</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Valor</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">%</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Via</th>
                          </tr>
                        </thead>
                        <tbody>
                          {portfolioCompletoList.map((c, i) => {
                            const isRF = c.macro === "Renda Fixa";
                            const maxPct = portfolioCompletoTotal > 0 ? (portfolioCompletoList[0]?.valorBRL ?? 0) / portfolioCompletoTotal * 100 : 0;
                            return (
                              <tr key={`${c.ticker}-${i}`} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                                <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                                <td className="py-1.5 px-2">
                                  {isOutros(c.ticker) ? (
                                    <span className="text-zinc-400 font-medium italic">Outros · diversificação <span className="text-zinc-600 not-italic">({outrosEtf(c.ticker)})</span></span>
                                  ) : (
                                    <>
                                      <span className="font-semibold text-zinc-100">{c.ticker}</span>
                                      {c.name && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                                    </>
                                  )}
                                </td>
                                <td className="py-1.5 px-2">
                                  <span className="tag text-[9px] px-1.5 py-0.5" style={{ backgroundColor: isRF ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)", color: isRF ? "#10b981" : "#3b82f6" }}>
                                    {isRF ? "RF" : "RV"}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                                <td className="py-1.5 px-2">
                                  <PctCell
                                    pct={portfolioCompletoTotal > 0 ? (c.valorBRL / portfolioCompletoTotal) * 100 : 0}
                                    max={maxPct}
                                    color={isRF ? "#10b981" : "#3b82f6"}
                                  />
                                </td>
                                <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{c.via || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-zinc-800 font-semibold">
                            <td className="py-2 px-2 text-zinc-300" colSpan={3}>Total ({portfolioCompletoList.length})</td>
                            <td className="py-2 px-2 text-right text-zinc-200 font-mono">{compactBRL(portfolioCompletoTotal)}</td>
                            <td className="py-2 px-2 text-right text-zinc-500 font-mono">100%</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : <p className="text-zinc-600 text-sm">Nenhuma posição para o filtro {activeFilter}.</p>}
                </>
              )}

              {lt.unsupported.length > 0 && (
                <p className="text-[10px] text-zinc-600 mt-3">
                  Sem composição: {lt.unsupported.join(", ")}
                </p>
              )}
            </div>
          );
        })()}

        {(!composicao?.look_through || composicao.look_through.supported.length === 0) && (
          <div className="glass-card p-5 text-center">
            <p className="text-zinc-500 text-sm mb-3">Nenhuma composição de ETF disponível.</p>
            <button
              onClick={async () => {
                setEtfRefreshing(true);
                try {
                  const res = await fetch(`${API_URL}/api/composicao/etf-refresh`, { method: "POST" });
                  if (res.ok) {
                    const j = await res.json();
                    if (!j.saved_to_sheets) alert(j.warning ?? "Holdings atualizados mas não persistidos na planilha.");
                    bumpDataVersion();
                    const fresh = await fetch(withDataVersion(`${API_URL}/api/composicao/resumo`));
                    if (fresh.ok) setComposicao(await fresh.json());
                  }
                } catch { /* ignore */ }
                setEtfRefreshing(false);
              }}
              disabled={etfRefreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-emerald-700/50 text-emerald-400 hover:bg-emerald-600/10 transition-all"
            >
              <RefreshCw size={13} className={etfRefreshing ? "animate-spin" : ""} />
              {etfRefreshing ? "Buscando composições…" : "Buscar Composições ao Vivo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
