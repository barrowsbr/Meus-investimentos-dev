"use client";

// Extraído de app/performance/page.tsx — aba Drawdown: recuo do pico,
// cards de pico/vale e volatilidade rolling (janela de 30 pregões).

import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from "recharts";
import { AlertTriangle, Activity } from "lucide-react";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { TOOLTIP_STYLE, formatDateShort, type Summary } from "@/components/performance/shared";

export default function DrawdownTab({ s, isLight, drawdownData, volData, volStats }: {
  s: Summary;
  isLight: boolean;
  drawdownData: Array<{ date: string; drawdown: number }>;
  volData: Array<{ date: string; vol: number }>;
  volStats: { atual: number; media: number; max: number } | null;
}) {
  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Máximo Drawdown", value: `${s.maxDrawdown.toFixed(2)}%`, color: "text-red-400", desc: "Maior recuo observado" },
          { label: "Data do Pico", value: formatDateShort(s.peakDate ?? ""), color: "text-emerald-400", desc: `TWR máximo: +${((s.peakTwr ?? 0) * 100).toFixed(2)}%` },
          { label: "Data do Vale", value: formatDateShort(s.troughDate ?? ""), color: "text-amber-400", desc: `TWR mínimo: ${((s.troughTwr ?? 0) * 100).toFixed(2)}%` },
        ].map(item => (
          <div key={item.label} className="glass-card p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{item.label}</p>
            <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-zinc-600 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

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
