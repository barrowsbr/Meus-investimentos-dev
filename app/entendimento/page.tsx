"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, LabelList,
} from "recharts";
import {
  GraduationCap, TrendingUp, ArrowLeftRight, Layers,
  DollarSign, Sparkles, Info,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, usd } from "@/lib/format";
import type { Position } from "@/lib/portfolio";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const TOOLTIP_STYLE = {
  background: "rgba(13,14,20,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#e4e4e7",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
} as const;

const COLORS = {
  ativo: "#34d399",   // verde — ganho do ativo puro
  fx: "#f59e0b",      // âmbar — câmbio sobre o principal
  cruzado: "#8b5cf6", // roxo — efeito cruzado
  total: "#3b82f6",   // azul — resultado líquido
  neg: "#f87171",
};

function fmtBR(n: number, dec = 2): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function EntendimentoPage() {
  const { data, loading, error } = usePortfolio();

  // Posições estrangeiras (moeda funcional ≠ BRL, com cotação e decomposição).
  const fxPositions = useMemo(() => {
    if (!data) return [] as Position[];
    return data.positions.filter(
      p => p.moeda !== "BRL" && p.precoAtual !== null && p.ganhoFXPrincipalBRL !== null && p.custoTotalBRL > 0
    );
  }, [data]);

  const totals = useMemo(() => {
    const ativo = fxPositions.reduce((s, p) => s + (p.ganhoAtivoPuroBRL ?? 0), 0);
    const fx = fxPositions.reduce((s, p) => s + (p.ganhoFXPrincipalBRL ?? 0), 0);
    const cruzado = fxPositions.reduce((s, p) => s + (p.ganhoCruzadoBRL ?? 0), 0);
    const investido = fxPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
    const atual = fxPositions.reduce((s, p) => s + p.valorAtualBRL, 0);
    return { ativo, fx, cruzado, investido, atual, total: ativo + fx + cruzado };
  }, [fxPositions]);

  const [selTicker, setSelTicker] = useState<string>("");
  const selected = useMemo(() => {
    if (fxPositions.length === 0) return null;
    return fxPositions.find(p => p.ticker === selTicker)
      ?? [...fxPositions].sort((a, b) => b.valorAtualBRL - a.valorAtualBRL)[0];
  }, [fxPositions, selTicker]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="cotacoes" />;
  if (!data) return <ErrorAlert message="Dados não disponíveis" />;

  const chartData = [
    { name: "Ativo (puro)", value: totals.ativo, color: COLORS.ativo },
    { name: "Câmbio principal", value: totals.fx, color: COLORS.fx },
    { name: "Efeito cruzado", value: totals.cruzado, color: COLORS.cruzado },
    { name: "Resultado líquido", value: totals.total, color: COLORS.total, isTotal: true },
  ];

  return (
    <>
      <PageHeader
        title="Entendimento"
        description="Como o câmbio e o desempenho do ativo se combinam no seu retorno em Reais"
      />

      {/* ── Intro: moeda funcional vs moeda de relatório ── */}
      <div className="glass-card p-5 mb-5 animate-fade-in">
        <h2 className="section-title mb-3"><GraduationCap size={16} />Moeda funcional vs. moeda de relatório</h2>
        <p className="text-sm text-zinc-400 leading-relaxed mb-3">
          Seus ativos internacionais vivem em <strong className="text-zinc-200">dólar</strong> (a <em>moeda funcional</em>):
          é nela que a ação sobe ou cai. Mas você enxerga tudo em <strong className="text-zinc-200">reais</strong>
          {" "}(a <em>moeda de relatório</em>). Por isso o seu resultado em R$ é a combinação de <strong>duas forças</strong>:
          o desempenho do ativo lá fora <span className="text-zinc-500">e</span> a variação do dólar.
        </p>
        <div className="flex items-start gap-2 text-xs text-zinc-500 bg-white/[0.02] rounded-xl p-3">
          <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <span>
            Uma queda do dólar <strong className="text-zinc-300">não significa</strong> que você perdeu dinheiro de verdade
            se a ação performou bem — ela apenas reduz quanto desse ganho aparece quando convertido para reais.
            Esta página é <strong className="text-zinc-300">gerencial</strong> e não altera o cálculo de imposto
            (que segue a PTAX da data de cada liquidação, conforme a Receita).
          </span>
        </div>
      </div>

      {/* ── A matemática (3 fatores) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        {[
          { icon: <TrendingUp size={15} />, label: "Retorno do Ativo (puro)", color: COLORS.ativo,
            formula: "(V₁ − V₀) · P₀", desc: "O ganho em dólar, avaliado pelo câmbio que você pagou na compra." },
          { icon: <ArrowLeftRight size={15} />, label: "Câmbio sobre o Principal", color: COLORS.fx,
            formula: "V₀ · (P₁ − P₀)", desc: "A oscilação do dólar sobre o capital que você aportou." },
          { icon: <Layers size={15} />, label: "Efeito Cruzado (Y)", color: COLORS.cruzado,
            formula: "(V₁ − V₀) · (P₁ − P₀)", desc: "A variação do dólar incidindo sobre o lucro gerado pela ação." },
        ].map(item => (
          <div key={item.label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2" style={{ color: item.color }}>
              {item.icon}
              <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
            </div>
            <p className="font-mono text-sm text-zinc-200 mb-1.5">{item.formula}</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-zinc-600 mb-5 px-1">
        Onde <span className="font-mono text-zinc-400">V₀</span>/<span className="font-mono text-zinc-400">V₁</span> = capital
        em USD (inicial/atual) e <span className="font-mono text-zinc-400">P₀</span>/<span className="font-mono text-zinc-400">P₁</span> =
        câmbio de aquisição/atual. Soma dos três = retorno total em R$.
      </p>

      {fxPositions.length === 0 ? (
        <div className="glass-card p-8 text-center text-zinc-500 text-sm">
          Você ainda não tem posições internacionais em aberto — o efeito cambial aparece aqui quando houver ativos em dólar.
        </div>
      ) : (
        <>
          {/* ── Gráfico de decomposição ── */}
          <div className="glass-card p-5 mb-5 animate-fade-in">
            <h2 className="section-title mb-1"><DollarSign size={15} />Decomposição do seu resultado internacional</h2>
            <p className="text-[11px] text-zinc-500 mb-4">
              Lucro/prejuízo atual das posições em dólar ({brl(totals.investido)} investidos), quebrado por origem.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 24, right: 10, bottom: 0, left: 10 }}>
                <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => compactBRL(v)} width={56} />
                <ReferenceLine y={0} stroke="#3f3f46" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Valor"]} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={90}>
                  <LabelList dataKey="value" position="top" formatter={(v: number) => compactBRL(v)}
                    style={{ fill: "#e4e4e7", fontSize: 11, fontWeight: 600 }} />
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.value >= 0 ? d.color : COLORS.neg} fillOpacity={d.isTotal ? 1 : 0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabela didática (posição real) ── */}
          <div className="glass-card p-5 mb-5 animate-fade-in">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="section-title"><Sparkles size={15} />Desmistificando uma posição real</h2>
              <select value={selected?.ticker ?? ""} onChange={e => setSelTicker(e.target.value)}
                className="bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.06]">
                {[...fxPositions].sort((a, b) => b.valorAtualBRL - a.valorAtualBRL).map(p => (
                  <option key={p.ticker} value={p.ticker} className="bg-zinc-900">{p.ticker}</option>
                ))}
              </select>
            </div>
            {selected && (() => {
              const V0 = selected.custoTotal;
              const V1 = selected.valorAtual ?? 0;
              const P0 = selected.pmFxAquisicao ?? 0;
              const P1 = selected.fxAtualBRL ?? 0;
              const rows = [
                { metric: "Patrimônio Inicial", tela: `${brl(selected.custoTotalBRL)} (${usd(V0)})`,
                  sig: `Dinheiro que você converteu e aportou — ${selected.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} un. a US$ ${fmtBR(selected.custoMedio)}, dólar a R$ ${fmtBR(P0, 4)}.`,
                  val: null as number | null },
                { metric: "Performance das Ações", tela: brl(selected.ganhoAtivoPuroBRL ?? 0),
                  sig: `Quanto a ação rendeu de fato (US$ ${fmtBR(V1 - V0)}), avaliado ao dólar de compra (R$ ${fmtBR(P0, 4)}).`,
                  val: selected.ganhoAtivoPuroBRL ?? 0 },
                { metric: "Efeito Cambial no Principal", tela: brl(selected.ganhoFXPrincipalBRL ?? 0),
                  sig: `Variação do dólar (R$ ${fmtBR(P0, 4)} → R$ ${fmtBR(P1, 4)}) sobre o capital aportado.`,
                  val: selected.ganhoFXPrincipalBRL ?? 0 },
                { metric: "Efeito Cruzado (Y)", tela: brl(selected.ganhoCruzadoBRL ?? 0),
                  sig: "Variação do dólar sobre o lucro das ações. Você nunca \"perdeu\" esse valor — ele só ajusta o tamanho do lucro ao converter para reais.",
                  val: selected.ganhoCruzadoBRL ?? 0 },
                { metric: "Resultado Líquido Consolidado", tela: brl(selected.lucroBRL ?? 0),
                  sig: `O saldo real se você liquidasse hoje: ${usd(V1)} convertidos a R$ ${fmtBR(P1, 4)} = ${brl(selected.valorAtualBRL)}.`,
                  val: selected.lucroBRL ?? 0, isTotal: true },
              ];
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-left">
                        <th className="px-2 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Métrica Analítica</th>
                        <th className="px-2 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Valor</th>
                        <th className="px-2 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">O que significa na prática</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const cor = r.val === null ? "text-zinc-200"
                          : r.val >= 0 ? "text-emerald-400" : "text-red-400";
                        return (
                          <tr key={r.metric} className={`border-b border-border/20 ${r.isTotal ? "bg-white/[0.02]" : ""}`}>
                            <td className={`px-2 py-2.5 align-top ${r.isTotal ? "font-bold text-zinc-100" : "font-medium text-zinc-300"}`}>{r.metric}</td>
                            <td className={`px-2 py-2.5 text-right font-mono font-semibold whitespace-nowrap align-top ${cor}`}>
                              {r.val !== null && r.val >= 0 ? "+" : ""}{r.tela}
                            </td>
                            <td className="px-2 py-2.5 text-[11px] text-zinc-500 leading-relaxed">{r.sig}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* ── Sandbox interativo ── */}
          <Sandbox defaultP0={data.cambio?.pmDolar || data.usdbrl} />
        </>
      )}
    </>
  );
}

// ─── Sandbox teórico ─────────────────────────────────────────────────────────
function Sandbox({ defaultP0 }: { defaultP0: number }) {
  const [aporte, setAporte] = useState("10000");
  const [varAcao, setVarAcao] = useState("20");
  const [varDolar, setVarDolar] = useState("-10");
  const [p0, setP0] = useState(defaultP0 > 0 ? defaultP0.toFixed(2) : "5.00");

  const sim = useMemo(() => {
    const A = parseFloat(aporte) || 0;     // aporte em BRL
    const a = (parseFloat(varAcao) || 0) / 100;   // variação ação
    const d = (parseFloat(varDolar) || 0) / 100;  // variação dólar
    // Fórmulas fechadas: ativoPuro = A·a ; fxPrincipal = A·d ; cruzado = A·a·d
    const ativoPuro = A * a;
    const fxPrincipal = A * d;
    const cruzado = A * a * d;
    const total = ativoPuro + fxPrincipal + cruzado;
    const finalBRL = A * (1 + a) * (1 + d);
    return { A, ativoPuro, fxPrincipal, cruzado, total, finalBRL };
  }, [aporte, varAcao, varDolar]);

  const blocks = [
    { label: "Ganho Puro do Ativo", value: sim.ativoPuro, color: COLORS.ativo },
    { label: "Efeito Cambial (principal)", value: sim.fxPrincipal, color: COLORS.fx },
    { label: "Efeito Cruzado (Y)", value: sim.cruzado, color: COLORS.cruzado },
  ];
  const maxAbs = Math.max(...blocks.map(b => Math.abs(b.value)), 1);

  return (
    <div className="glass-card p-5 mb-5 animate-fade-in border-purple-500/15">
      <h2 className="section-title mb-1"><Sparkles size={15} className="text-purple-400" />Simulador — brinque com os números</h2>
      <p className="text-[11px] text-zinc-500 mb-4">
        Mude o aporte, a variação da ação e a do dólar para ver os três efeitos se recalcularem em tempo real.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Aporte (R$)", value: aporte, set: setAporte, step: "100" },
          { label: "Câmbio de entrada (R$/US$)", value: p0, set: setP0, step: "0.01" },
          { label: "Variação da ação (%)", value: varAcao, set: setVarAcao, step: "1" },
          { label: "Variação do dólar (%)", value: varDolar, set: setVarDolar, step: "1" },
        ].map(f => (
          <div key={f.label}>
            <label className="text-[10px] text-zinc-600 uppercase tracking-wide block mb-1">{f.label}</label>
            <input type="number" step={f.step} value={f.value} onChange={e => f.set(e.target.value)}
              className="w-full bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.06] focus:border-purple-500/40" />
          </div>
        ))}
      </div>

      <div className="space-y-2.5 mb-4">
        {blocks.map(b => (
          <div key={b.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-zinc-400">{b.label}</span>
              <span className="text-sm font-bold font-mono" style={{ color: b.value >= 0 ? b.color : COLORS.neg }}>
                {b.value >= 0 ? "+" : ""}{brl(b.value)}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min((Math.abs(b.value) / maxAbs) * 100, 100)}%`, background: b.value >= 0 ? b.color : COLORS.neg, opacity: 0.75 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800/60">
        <div className="bg-white/[0.03] rounded-xl p-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Resultado em R$</p>
          <p className={`text-lg font-bold ${sim.total >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {sim.total >= 0 ? "+" : ""}{brl(sim.total)}
          </p>
        </div>
        <div className="bg-white/[0.03] rounded-xl p-3">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Patrimônio final</p>
          <p className="text-lg font-bold text-zinc-100">{brl(sim.finalBRL)}</p>
        </div>
      </div>
      <p className="text-[10px] text-zinc-600 mt-3">
        Repare: mesmo com a ação subindo {varAcao}% em dólar, um dólar caindo {varDolar}% corrói parte do ganho —
        mas o ganho do ativo em si continua existindo (você só recebe menos reais ao converter).
      </p>
    </div>
  );
}
