"use client";

// Extraído de app/resumo/page.tsx — DRE (Demonstrativo de Resultado): card
// expansível com patrimônio, resultado acumulado, decomposição de fatores,
// indicadores macro, top/bottom e posições encerradas.

import React from "react";
import { ChevronDown, ChevronRight, Award, AlertTriangle } from "lucide-react";
import { compactBRL, pct } from "@/lib/format";
import { identificarSetor, isRendaFixa, isRendaVariavel } from "@/lib/sectors";
import type { Position } from "@/lib/portfolio";
import type { PortfolioResponse } from "@/lib/hooks";
import { formatComputedAt, type ComposicaoData } from "@/components/resumo/shared";

interface DreCardProps {
  data: PortfolioResponse;
  rfData: { lucroNaoRealizado: number; lucroRealizado: number; totalInvestidoAberto: number } | null;
  composicao: ComposicaoData | null;
  dreExpanded: boolean;
  setDreExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  rvLens: "natureza" | "fator";
  setRvLens: (l: "natureza" | "fator") => void;
  avgMonthlyDividend: number;
  totalInvestidoRV: number;
  rvPositions: Position[];
}

export default function DreCard({
  data, rfData, composicao, dreExpanded, setDreExpanded, rvLens, setRvLens,
  avgMonthlyDividend, totalInvestidoRV, rvPositions,
}: DreCardProps) {
  const top = composicao?.resumo.top_performer;
  const bot = composicao?.resumo.bottom_performer;

  // ── DRE 100% CANÔNICA (ver CANONICO.md) ──
  // RV ← snapshot (lib/portfolio.ts). RF ← motor canônico de RF
  // (/api/renda-fixa/posicoes, idem página /renda-fixa) + RF-como-posições do
  // snapshot. Proventos/decomposição/exposição/patrimônio ← snapshot.
  const patrimonioAtual = data.totalPatrimonioBRL;
  const rvPatrimonio = data.rvPatrimonioBRL;
  const rfPatrimonio = data.rfPatrimonioBRL;
  // Lista de posições ENCERRADAS (vendidas) — dado de listagem do route; o
  // snapshot não rastreia posições já zeradas. Não é cálculo canônico duplicado.
  const rent = composicao?.rentabilidade ?? [];

  // RV — snapshot
  const rvNaoReal = data.lucroBRL;                                       // valorização (preço+câmbio)
  // Realizado RV CANÔNICO = posições ABERTAS + ENCERRADAS (100% vendidas).
  // Bug anterior: somava só `data.positions` (abertas), perdendo o lucro
  // realizado das posições já zeradas (que vivem em `closedPositions`) —
  // o que podia jogar o realizado pra negativo. Usa o campo canônico do
  // snapshot, com fallback robusto a abertas+encerradas (cache antigo).
  const rvClosed = (data.closedPositions ?? []).filter(p => isRendaVariavel(p.setor));
  const rvReal = data.realizadoRVBRL || (
    rvPositions.reduce((s, p) => s + (p.lucroRealizadoBRL ?? 0), 0)
    + rvClosed.reduce((s, p) => s + (p.lucroRealizadoBRL ?? 0), 0)
  );
  const rvGanho = rvNaoReal + rvReal;

  // RF — motor canônico de RF (manual) + RF-como-posições (snapshot: SHV/BIL...)
  const rfPositions = data.positions.filter(p => isRendaFixa(p.setor));
  const rfPosNaoReal = rfPositions.reduce((s, p) => s + (p.lucroBRL ?? 0), 0);
  const rfPosReal = rfPositions.reduce((s, p) => s + (p.lucroRealizadoBRL ?? 0), 0);
  const rfPosInvestido = rfPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
  const rfNaoReal = (rfData?.lucroNaoRealizado ?? 0) + rfPosNaoReal;
  const rfReal = (rfData?.lucroRealizado ?? 0) + rfPosReal;
  const rfGanho = rfNaoReal + rfReal;

  // Proventos — snapshot (split RV/RF por classificação)
  const proventosTotal = data.totalProventosBRL;
  let proventosRV = 0, proventosRF = 0;
  for (const [ticker, val] of Object.entries(data.proventosPorTicker ?? {})) {
    if (isRendaFixa(identificarSetor(ticker))) proventosRF += val;
    else proventosRV += val;
  }

  // Decomposição de 3 fatores (puro + principal + cruzado = lucro RV não realizado).
  // "Efeito cambial" agrupa Principal + Cruzado, então a linha "Retorno do ativo"
  // tem de ser o ganho PURO (sem cruzado) — senão o cruzado é contado 2x.
  const fxPrincipal = data.ganhoFXPrincipalTotalBRL ?? 0;
  const fxCruzado = data.ganhoCruzadoTotalBRL ?? 0;
  // Câmbio FANTASMA da fatia comprada com MARGEM: dívida em moeda forte
  // compensa o câmbio do ativo (exposição líquida ~zero) — separado do
  // efeito cambial "de verdade" (capital próprio remetido).
  const fxMargem = data.alavancagem?.ajusteCambioMargemBRL ?? 0;
  const temFxMargem = Math.abs(fxMargem) >= 0.5;
  const ganhoCambio = fxPrincipal + fxCruzado - fxMargem;
  const ganhoAtivo = ((data.ganhoAtivoPuroTotalBRL ?? 0) || (rvNaoReal - fxPrincipal - fxCruzado));

  // Lente "por fator" do RV: junta o realizado (decomposto, câmbio da venda)
  // ao não realizado. ativoLente + cambioLente = rvGanho (reconcilia com a
  // lente "por natureza": não realizado + realizado).
  const realizadoAtivoRV = data.realizadoAtivoRVBRL ?? 0;
  const realizadoCambioRV = data.realizadoCambioRVBRL ?? 0;
  const ativoLente = ganhoAtivo + realizadoAtivoRV;
  const cambioLente = ganhoCambio + realizadoCambioRV;

  // Resultado total
  const resultadoTotal = rvGanho + rfGanho + proventosTotal;

  // Investido — snapshot (RV, FIFO) + motor de RF (manual) + RF-posições
  const investidoRV = totalInvestidoRV;
  const investidoRF = (rfData?.totalInvestidoAberto ?? 0) + rfPosInvestido;

  const fmt = (v: number) => v >= 0 ? `+${compactBRL(v)}` : compactBRL(v);
  const clr = (v: number) => v >= 0 ? "text-emerald-400" : "text-red-400";
  const clrSub = (v: number) => v >= 0 ? "text-emerald-400/70" : "text-red-400/70";

  const dayChg = data.dayChangeTotalBRL ?? 0;
  const dayPct = data.dayChangeTotalPct ?? 0;

  // ── Métricas macro derivadas (sem matemática nova — só agrega campos do snapshot) ──
  const investidoTotal = investidoRV + investidoRF;
  const retornoAcumPct = investidoTotal > 0 ? (resultadoTotal / investidoTotal) * 100 : 0;
  // Alocação (% do patrimônio)
  const rvPct = patrimonioAtual > 0 ? (rvPatrimonio / patrimonioAtual) * 100 : 0;
  const rfPct = patrimonioAtual > 0 ? (rfPatrimonio / patrimonioAtual) * 100 : 0;
  // Exposição cambial = valor em moeda estrangeira ÷ PATRIMÔNIO TOTAL.
  // exposicaoCambial (snapshot) já inclui posições + RF manual + caixa (fixa_aberta),
  // inclusive caixa em dólar. Divide-se pelo patrimônio total (que inclui o caixa
  // em real) para o % refletir toda a carteira.
  const expo = data.exposicaoCambial ?? {};
  const totalExpo = Object.values(expo).reduce((s, v) => s + v, 0);
  const brlExpo = expo["BRL"] ?? 0;
  const foreignExpoBRL = totalExpo - brlExpo;
  const foreignPct = patrimonioAtual > 0 ? (foreignExpoBRL / patrimonioAtual) * 100 : 0;
  // Yield de proventos anualizado (carrego) sobre o patrimônio
  const yieldAnualPct = patrimonioAtual > 0 ? ((avgMonthlyDividend * 12) / patrimonioAtual) * 100 : 0;
  // Proventos brutos = líquidos + IR retido (para a leitura de DRE)
  const irProventos = data.totalImpostoProventosBRL ?? 0;
  const proventosBrutos = proventosTotal + irProventos;

  return (
    <div className="glass-card p-4 sm:p-5 mb-3 animate-fade-in">
      {/* Header — clique para expandir/recolher */}
      <button
        onClick={() => setDreExpanded(v => !v)}
        aria-expanded={dreExpanded}
        className="w-full flex items-center justify-between gap-3 text-left"
        style={{ marginBottom: dreExpanded ? 16 : 0 }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {dreExpanded
            ? <ChevronDown size={14} className="text-zinc-500 shrink-0" />
            : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Demonstrativo de Resultado</h2>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Resumo sempre visível quando recolhido: patrimônio + resultado */}
          {!dreExpanded && (
            <span className="flex items-baseline gap-2">
              <span className="text-[11px] text-zinc-500">{compactBRL(data.alavancagem.netBRL)}</span>
              <span className={`text-[11px] font-bold ${clr(resultadoTotal)}`}>{fmt(resultadoTotal)}</span>
            </span>
          )}
          <span className="text-[10px] text-zinc-600 hidden sm:inline">{composicao?.computed_at ? formatComputedAt(composicao.computed_at) : ""}</span>
        </div>
      </button>

      {dreExpanded && (<>
      {/* ── 1. Patrimônio (AUM) & Alocação ── */}
      {/* Net = bruto − dívida de margin: o "Net liq" da corretora, o dinheiro que é meu. */}
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-bold text-zinc-100">Patrimônio Atual{data.alavancagem.dividaBRL > 0 ? " (Net)" : ""}</span>
        <span className="text-xl font-extrabold text-zinc-100">{compactBRL(data.alavancagem.netBRL)}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] mb-3">
        {data.alavancagem.dividaBRL > 0 ? (
          <span className="text-zinc-600">
            Bruto {compactBRL(patrimonioAtual)} · <span className="text-red-400/80">Margin −{compactBRL(data.alavancagem.dividaBRL)}</span> · <span className="text-amber-400/80">{data.alavancagem.alavancagemPct.toFixed(1)}% alavancado</span>
          </span>
        ) : <span />}
        <span className={dayChg >= 0 ? "text-emerald-400/80" : "text-red-400/80"}>
          Hoje {fmt(dayChg)} ({pct(dayPct)})
        </span>
      </div>

      {/* Barra de alocação RV / RF */}
      <div className="h-2 w-full rounded-full overflow-hidden flex mb-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div style={{ width: `${rvPct}%`, background: "#3b82f6" }} />
        <div style={{ width: `${rfPct}%`, background: "#2dd4bf" }} />
      </div>
      <div className="flex items-center justify-between text-[10px] mb-4">
        <span className="text-blue-400">RV {rvPct.toFixed(0)}% · {compactBRL(rvPatrimonio)}</span>
        <span className="text-zinc-600">🌐 {foreignPct.toFixed(0)}% câmbio</span>
        <span className="text-teal-400">RF {rfPct.toFixed(0)}% · {compactBRL(rfPatrimonio)}</span>
      </div>

      <div className="h-px bg-zinc-800/60 mb-3" />

      {/* ── Investido ── */}
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] font-semibold text-zinc-400">Total Investido</span>
        <span className="text-sm font-bold text-zinc-300">{compactBRL(investidoRV + investidoRF)}</span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-3">
        <span>RV {compactBRL(investidoRV)}</span>
        <span>RF {compactBRL(investidoRF)}</span>
      </div>

      <div className="h-px bg-zinc-800/60 mb-3" />

      {/* ── 2. Resultado Acumulado (por fonte) ── */}
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Resultado Acumulado</span>
        <div className="flex items-baseline gap-2">
          <span className={`text-[11px] font-semibold ${clr(resultadoTotal)}`}>{pct(retornoAcumPct)}</span>
          <span className={`text-base font-bold ${clr(resultadoTotal)}`}>{fmt(resultadoTotal)}</span>
        </div>
      </div>

      {/* Renda Variável — ganho de capital, com duas lentes (natureza / fator) */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-blue-400">Renda Variável</span>
            <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              {(["natureza", "fator"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setRvLens(l)}
                  className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide transition-colors ${rvLens === l ? "bg-blue-500/20 text-blue-300" : "text-zinc-600 hover:text-zinc-400"}`}
                >
                  {l === "natureza" ? "Natureza" : "Fator"}
                </button>
              ))}
            </div>
          </div>
          <span className={`text-[12px] font-bold ${clr(rvGanho)}`}>{fmt(rvGanho)}</span>
        </div>
        <div className="pl-3 space-y-0.5">
          {rvLens === "natureza" ? (
            <>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Não realizado</span>
                <span className={clrSub(rvNaoReal)}>{fmt(rvNaoReal)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Realizado <span className="text-zinc-700">(vendas)</span></span>
                <span className={clrSub(rvReal)}>{fmt(rvReal)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Ativo <span className="text-zinc-700">(ex-câmbio)</span></span>
                <span className={clrSub(ativoLente)}>{fmt(ativoLente)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Efeito câmbio <span className="text-zinc-700">(capital próprio)</span></span>
                <span className={clrSub(cambioLente)}>{fmt(cambioLente)}</span>
              </div>
              {temFxMargem && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Câmbio s/ margem <span className="text-zinc-700">(compensado pela dívida)</span></span>
                  <span className="text-zinc-500">{fmt(fxMargem)}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Renda Fixa */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-teal-400">Renda Fixa</span>
          <span className={`text-[12px] font-bold ${clr(rfGanho)}`}>{fmt(rfGanho)}</span>
        </div>
        <div className="pl-3 space-y-0.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">Não realizado</span>
            <span className={clrSub(rfNaoReal)}>{fmt(rfNaoReal)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">Realizado</span>
            <span className={clrSub(rfReal)}>{fmt(rfReal)}</span>
          </div>
        </div>
      </div>

      {/* Proventos (carrego) — líquidos de IR */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-amber-400">Proventos (líq.)</span>
          <span className="text-[12px] font-bold text-amber-400">{fmt(proventosTotal)}</span>
        </div>
        <div className="pl-3 space-y-0.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">Dividendos / JCP (RV)</span>
            <span className="text-amber-400/70">{compactBRL(proventosRV)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-zinc-500">Rendimentos (RF)</span>
            <span className="text-amber-400/70">{compactBRL(proventosRF)}</span>
          </div>
          {irProventos > 0.01 && (
            <div className="flex justify-between text-[10px]">
              <span className="text-zinc-600">Bruto {compactBRL(proventosBrutos)} · IR retido</span>
              <span className="text-red-400/70">−{compactBRL(irProventos)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-zinc-800/60 mb-3" />

      {/* ── Decomposição Cambial ── */}
      <div className="mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Decomposição de Fatores</span>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-400">Retorno do ativo (preço)</span>
            <span className={`font-semibold ${clr(ganhoAtivo)}`}>{fmt(ganhoAtivo)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-400">Efeito cambial (FX{temFxMargem ? " — capital próprio" : ""})</span>
            <span className={`font-semibold ${clr(ganhoCambio)}`}>{fmt(ganhoCambio)}</span>
          </div>
          {(fxPrincipal !== 0 || fxCruzado !== 0) && (
            <div className="pl-3 space-y-0.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Principal (USD/BRL)</span>
                <span className={clrSub(fxPrincipal)}>{fmt(fxPrincipal)}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-zinc-500">Cruzado (ativo × FX)</span>
                <span className={clrSub(fxCruzado)}>{fmt(fxCruzado)}</span>
              </div>
              {temFxMargem && (
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">(−) Principal emprestado (margem)</span>
                  <span className={clrSub(-fxMargem)}>{fmt(-fxMargem)}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {temFxMargem && (
          <p className="text-[9px] text-zinc-700 mt-1.5">
            A fatia comprada com margem tem exposição cambial ~neutra: a dívida na mesma moeda
            compensa o câmbio do ativo. O efeito ({fmt(fxMargem)}) fica fora do FX de capital próprio.
          </p>
        )}
      </div>

      <div className="h-px bg-zinc-800/60 mb-3" />

      {/* ── 3. Indicadores-chave (macro) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Retorno acum.</p>
          <p className={`text-sm font-bold ${clr(resultadoTotal)}`}>{pct(retornoAcumPct)}</p>
          <p className="text-[9px] text-zinc-600">lucro ÷ investido</p>
        </div>
        <div>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Yield proventos</p>
          <p className="text-sm font-bold text-amber-400">{yieldAnualPct.toFixed(1)}% a.a.</p>
          <p className="text-[9px] text-zinc-600">{compactBRL(avgMonthlyDividend)}/mês</p>
        </div>
        <div>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Exposição câmbio</p>
          <p className="text-sm font-bold text-zinc-200">{foreignPct.toFixed(0)}%</p>
          <p className="text-[9px] text-zinc-600">{compactBRL(foreignExpoBRL)}</p>
        </div>
        <div>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Dólar</p>
          <p className="text-sm font-bold text-zinc-200">R$ {data.usdbrl.toFixed(2)}</p>
          <p className="text-[9px] text-zinc-600">PM R$ {data.cambio?.pmDolar?.toFixed(2) ?? "—"}</p>
        </div>
      </div>

      {/* ── Top / Bottom ── */}
      {(top || bot) && (
        <>
          <div className="h-px bg-zinc-800/60 my-3" />
          <div className="grid grid-cols-2 gap-3">
            {top && (
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)" }}>
                  <Award size={12} className="text-emerald-400" />
                </span>
                <div>
                  <p className="text-[9px] text-zinc-600 uppercase">Top</p>
                  <p className="text-[11px] font-bold text-zinc-200">{top.ticker} <span className="text-emerald-400">+{top.lucro_pct.toFixed(1)}%</span></p>
                </div>
              </div>
            )}
            {bot && (
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(248,113,113,0.12)" }}>
                  <AlertTriangle size={12} className="text-red-400" />
                </span>
                <div>
                  <p className="text-[9px] text-zinc-600 uppercase">Bottom</p>
                  <p className="text-[11px] font-bold text-zinc-200">{bot.ticker} <span className="text-red-400">{bot.lucro_pct.toFixed(1)}%</span></p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Posições Encerradas ── */}
      {(() => {
        const vendidos = rent.filter(r => r.status === "Vendido").sort((a, b) => b.resultado_total_brl - a.resultado_total_brl);
        if (vendidos.length === 0) return null;
        const totalImpostoVend = vendidos.reduce((s, r) => s + (r.imposto_brl ?? 0), 0);
        const hasImposto = totalImpostoVend > 0.01;
        return (
          <>
            <div className="h-px bg-zinc-800/60 my-3" />
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Posições encerradas ({vendidos.length})
              </h3>
              <span className="text-[10px] text-zinc-500">
                Total {compactBRL(vendidos.reduce((s, r) => s + r.resultado_total_brl, 0))}
              </span>
            </div>
            <div className="max-h-[180px] overflow-y-auto -mx-1 px-1">
              <table className="w-full text-[11px]">
                <thead className="text-zinc-600">
                  <tr className="border-b border-zinc-800/40">
                    <th className="text-left font-medium py-1">Ativo</th>
                    <th className="text-right font-medium py-1">Custo</th>
                    {hasImposto && <th className="text-right font-medium py-1">IR</th>}
                    <th className="text-right font-medium py-1">Resultado</th>
                    <th className="text-right font-medium py-1">%</th>
                  </tr>
                </thead>
                <tbody>
                  {vendidos.map(r => (
                    <tr key={r.ticker} className="border-b border-zinc-900/40">
                      <td className="text-left py-1 font-mono text-zinc-300">{r.ticker}</td>
                      <td className="text-right py-1 text-zinc-500 font-mono">{compactBRL(r.custo_brl)}</td>
                      {hasImposto && (
                        <td className="text-right py-1 text-amber-500/70 font-mono">
                          {(r.imposto_brl ?? 0) > 0.01 ? `−${compactBRL(r.imposto_brl)}` : "—"}
                        </td>
                      )}
                      <td className={`text-right py-1 font-mono font-semibold ${r.resultado_total_brl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {r.resultado_total_brl >= 0 ? "+" : ""}{compactBRL(r.resultado_total_brl)}
                      </td>
                      <td className={`text-right py-1 font-mono ${r.retorno_total_pct >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                        {r.retorno_total_pct >= 0 ? "+" : ""}{r.retorno_total_pct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
      </>)}
    </div>
  );
}
