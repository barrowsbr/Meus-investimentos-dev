"use client";

// Aba RISCO (ex-Drawdown) da Performance: (1) você vs o mercado — beta/alfa/
// correlação vs benchmark, no espírito do PortfolioAnalyst da IBKR mas com
// frases em português dizendo o que cada número significa; (2) drawdown +
// tempo de recuperação; (3) histograma de dias verdes × vermelhos; (4)
// volatilidade rolling. Matemática em lib/risco-metricas.ts (módulo puro);
// tudo derivado da série que a página já carrega — obedece período/corretora/
// moeda dos filtros, zero API nova.

import React, { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { AlertTriangle, Activity, Scale, BarChart2 } from "lucide-react";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { TOOLTIP_STYLE, formatDateShort, type Summary, type ChartPoint } from "@/components/performance/shared";
import { histogramaRetornos, recuperacaoDrawdown, vsMercado, MIN_PREGOES, type PontoRisco } from "@/lib/risco-metricas";

const BENCHES_RISCO = [
  { key: "sp500_twr" as const, rotulo: "S&P 500" },
  { key: "ibov_twr" as const, rotulo: "IBOV" },
];

export default function DrawdownTab({ s, isLight, drawdownData, volData, volStats, serie }: {
  s: Summary;
  isLight: boolean;
  drawdownData: Array<{ date: string; drawdown: number }>;
  volData: Array<{ date: string; vol: number }>;
  volStats: { atual: number; media: number; max: number } | null;
  serie: ChartPoint[];
}) {
  // Benchmarks com série suficiente no período filtrado.
  const benchesDisponiveis = useMemo(
    () => BENCHES_RISCO.filter((b) => serie.filter((p) => p[b.key] != null).length >= MIN_PREGOES),
    [serie],
  );
  const [benchSel, setBenchSel] = useState<string | null>(null);
  const bench = benchesDisponiveis.find((b) => b.key === benchSel) ?? benchesDisponiveis[0] ?? null;

  const vm = useMemo(() => {
    if (!bench) return null;
    const pontos: PontoRisco[] = serie.map((p) => ({
      date: p.date, ret: p.ret ?? null, twr: p.twr,
      bench: p[bench.key] ?? null, rf: p.cdi_twr ?? null,
    }));
    return vsMercado(pontos);
  }, [serie, bench]);

  const hist = useMemo(() => histogramaRetornos(serie.map((p) => p.ret ?? null)), [serie]);
  const rec = useMemo(
    () => recuperacaoDrawdown(serie.map((p) => ({ date: p.date, twr: p.twr })), s.peakDate, s.troughDate),
    [serie, s.peakDate, s.troughDate],
  );

  // Frases em português — o número sem a frase não entra no app (regra do dono).
  const fraseBeta = vm
    ? vm.beta >= 0
      ? `Quando o ${bench!.rotulo} cai 1%, sua carteira tende a cair ${Math.abs(vm.beta).toFixed(2).replace(".", ",")}%`
      : `Quando o ${bench!.rotulo} cai 1%, sua carteira tende a SUBIR ${Math.abs(vm.beta).toFixed(2).replace(".", ",")}%`
    : null;
  const tagBeta = vm ? (vm.beta > 1.05 ? "mais agressiva que o índice" : vm.beta < 0.95 ? "mais defensiva que o índice" : "anda colada no índice") : "";
  const corBeta = vm ? (vm.beta > 1.05 ? "text-amber-400" : vm.beta < 0.95 ? "text-emerald-400" : "text-zinc-300") : "text-zinc-500";
  const corAlfa = vm ? (vm.alfaAA >= 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-500";
  const corrPct = vm ? Math.round(vm.correlacao * 100) : null;

  return (
    <div className="space-y-4">
      {/* ── Você vs o mercado ── */}
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="section-title"><Scale size={15} />Você vs o mercado</h2>
          {benchesDisponiveis.length > 1 && (
            <div className="flex gap-1.5">
              {benchesDisponiveis.map((b) => (
                <button key={b.key} onClick={() => setBenchSel(b.key)}
                  className="rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors"
                  style={{
                    border: `1px solid ${bench?.key === b.key ? "var(--accent, #E8A33D)" : "var(--line, rgba(255,255,255,0.1))"}`,
                    color: bench?.key === b.key ? "var(--text)" : "var(--muted)",
                    background: bench?.key === b.key ? "color-mix(in srgb, var(--accent, #E8A33D) 14%, transparent)" : "transparent",
                  }}>
                  {b.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-600 mb-4">
          Como a carteira se move em relação ao índice — mesma metodologia do relatório da IBKR (CAPM sobre retornos diários; alfa anualizado; taxa livre de risco = CDI).
        </p>
        {vm && bench ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass-card p-4">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Beta vs {bench.rotulo}</p>
                <p className={`text-2xl font-bold font-mono ${corBeta}`}>{vm.beta.toFixed(2).replace(".", ",")}</p>
                <p className={`text-[11px] font-semibold mt-0.5 ${corBeta}`}>{tagBeta}</p>
                <p className="text-xs text-zinc-600 mt-1.5 leading-snug">{fraseBeta}</p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Alfa (anualizado)</p>
                <p className={`text-2xl font-bold font-mono ${corAlfa}`}>{vm.alfaAA >= 0 ? "+" : ""}{(vm.alfaAA * 100).toFixed(1).replace(".", ",")}% a.a.</p>
                <p className="text-xs text-zinc-600 mt-1.5 leading-snug">
                  {vm.alfaAA >= 0 ? "Retorno ALÉM do que a exposição ao mercado explica — o que suas escolhas adicionaram." : "Retorno ABAIXO do que a exposição ao mercado explica."}
                </p>
              </div>
              <div className="glass-card p-4">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Correlação</p>
                <p className="text-2xl font-bold font-mono text-zinc-200">{corrPct}%</p>
                <div className="mt-2 h-1 w-full rounded-full" style={{ background: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)" }}>
                  <div className="h-1 rounded-full" style={{ width: `${Math.max(0, corrPct ?? 0)}%`, background: "#60a5fa" }} />
                </div>
                <p className="text-xs text-zinc-600 mt-1.5 leading-snug">
                  {(corrPct ?? 0) >= 0 ? `${corrPct}% dos seus movimentos acompanham o ${bench.rotulo}.` : `Seus movimentos vão na direção OPOSTA ao ${bench.rotulo}.`}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-zinc-600 mt-3">Calculado sobre {vm.pregoes} pregões em comum com o índice, no período filtrado.</p>
          </>
        ) : (
          <p className="text-xs text-zinc-500 py-4">
            Ainda sem dados suficientes — precisa de {MIN_PREGOES}+ pregões em comum com o índice no período filtrado. Alargue o período para ver beta, alfa e correlação.
          </p>
        )}
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title"><AlertTriangle size={15} />Drawdown — Recuo do Pico</h2>
          <span className="text-xs text-red-400 font-semibold">Máx: {s.maxDrawdown.toFixed(2)}%</span>
        </div>
        <p className="text-xs text-zinc-600 mb-4">Mostra quanto o portfólio caiu em relação ao seu valor máximo histórico a cada ponto no tempo.</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={drawdownData}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "#1E2028"} />
            <XAxis dataKey="date" tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
              interval={Math.floor(drawdownData.length / 8)} />
            <YAxis tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${v.toFixed(0)}%`} />
            <Tooltip contentStyle={isLight ? { background: "#FDFAF1", border: "1px solid rgba(96,72,40,0.2)", borderRadius: 10, color: "#2B2117", fontSize: 12 } : TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]} />
            <ReferenceLine y={0} stroke={isLight ? "rgba(0,0,0,0.12)" : "#3f3f46"} strokeWidth={1} />
            <Area type="monotone" dataKey="drawdown" stroke={isLight ? "#7F1D1D" : "#f87171"} fill={isLight ? "none" : "url(#ddGrad)"} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Máximo Drawdown", value: `${s.maxDrawdown.toFixed(2)}%`, color: "text-red-400", desc: "Maior recuo observado" },
          { label: "Data do Pico", value: formatDateShort(s.peakDate ?? ""), color: "text-emerald-400", desc: `TWR máximo: +${((s.peakTwr ?? 0) * 100).toFixed(2)}%` },
          { label: "Data do Vale", value: formatDateShort(s.troughDate ?? ""), color: "text-amber-400", desc: `TWR mínimo: ${((s.troughTwr ?? 0) * 100).toFixed(2)}%` },
          rec
            ? rec.recuperado
              ? { label: "Recuperação", value: `${rec.dias} dias`, color: "text-emerald-400", desc: `voltou ao pico em ${formatDateShort(rec.ate ?? "")}` }
              : { label: "Recuperação", value: `${rec.dias} dias`, color: "text-amber-400", desc: "ainda abaixo do pico — em recuperação" }
            : { label: "Recuperação", value: "—", color: "text-zinc-500", desc: "sem episódio de queda no período" },
        ].map(item => (
          <div key={item.label} className="glass-card p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-zinc-600 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Dias verdes × dias vermelhos ── */}
      {hist.total >= 20 && (
        <div className="glass-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="section-title"><BarChart2 size={15} />Dias verdes × dias vermelhos</h2>
            <span className="text-xs font-semibold" style={{ color: hist.positivos / hist.total >= 0.5 ? "#34d399" : "#f87171" }}>
              {Math.round((hist.positivos / hist.total) * 100)}% dos pregões positivos ({hist.positivos} de {hist.total})
            </span>
          </div>
          <p className="text-xs text-zinc-600 mb-4">
            Quantos pregões a carteira fechou em cada faixa de retorno diário, no período filtrado. Barras concentradas no centro = carteira comportada; caudas gordas = dias extremos frequentes.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hist.faixas} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "#1E2028"} vertical={false} />
              <XAxis dataKey="faixa" tick={{ fill: isLight ? "#555" : "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip cursor={{ fill: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)" }}
                contentStyle={isLight ? { background: "#FDFAF1", border: "1px solid rgba(96,72,40,0.2)", borderRadius: 10, color: "#2B2117", fontSize: 12 } : TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(v: number) => [`${v} pregões`, "Dias"]} />
              <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                {hist.faixas.map((f) => (
                  <Cell key={f.faixa} fill={f.neg ? (isLight ? "#B91C1C" : "#f87171") : (isLight ? "#047857" : "#34d399")} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Volatilidade rolling — logo depois do drawdown (card IA 16/07) */}
      {volData.length > 0 && volStats && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="section-title"><Activity size={15} />Volatilidade — Janela de 30 pregões (anualizada)</h2>
            <span className="text-xs text-amber-400 font-semibold">Agora: {volStats.atual.toFixed(1)}% a.a.</span>
          </div>
          <p className="text-xs text-zinc-600 mb-4">Desvio-padrão dos retornos diários do portfólio nos últimos 30 pregões, anualizado (√252). Mede o quão nervosa a carteira anda — sobe em crises, cai em mares calmos.</p>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={volData}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "#1E2028"} />
              <XAxis dataKey="date" tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                interval={Math.floor(volData.length / 8)} />
              <YAxis tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={isLight ? { background: "#FDFAF1", border: "1px solid rgba(96,72,40,0.2)", borderRadius: 10, color: "#2B2117", fontSize: 12 } : TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`${v.toFixed(2)}% a.a.`, "Volatilidade"]} />
              <ReferenceLine y={volStats.media} stroke={isLight ? "rgba(0,0,0,0.2)" : "#52525b"} strokeDasharray="4 4" strokeWidth={1} label={{ value: `média ${volStats.media.toFixed(1)}%`, position: "insideTopRight", fill: isLight ? "#555" : "#71717a", fontSize: 10 }} />
              <Area type="monotone" dataKey="vol" stroke={isLight ? "#92600A" : "#fbbf24"} fill={isLight ? "none" : "url(#volGrad)"} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[
              { label: "Volatilidade atual", value: `${volStats.atual.toFixed(1)}% a.a.`, color: "text-amber-400", desc: "últimos 30 pregões" },
              { label: "Média do período", value: `${volStats.media.toFixed(1)}% a.a.`, color: "text-zinc-300", desc: "toda a série" },
              { label: "Pico de volatilidade", value: `${volStats.max.toFixed(1)}% a.a.`, color: "text-red-400", desc: "janela mais nervosa" },
            ].map(item => (
              <div key={item.label} className="glass-card p-4">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-zinc-600 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
