"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, LineChart, Line, ResponsiveContainer, ReferenceLine, YAxis } from "recharts";
import { Radio, TrendingUp, TrendingDown } from "lucide-react";

interface BuzzPoint { date: string; vol: number | null; tone: number | null }
interface Buzz {
  points: BuzzPoint[];
  volAvg: number; volChangePct: number;
  toneAvg: number; toneNow: number; toneChange: number;
  hasData: boolean;
}

const AMBER = "#f59e0b";
function toneColor(t: number): string {
  if (t >= 2) return "#34d399";
  if (t >= 0.5) return "#a3e635";
  if (t > -0.5) return "#a1a1aa";
  if (t > -2) return "#fb923c";
  return "#f87171";
}
function toneLabel(t: number): string {
  if (t >= 2) return "Positivo";
  if (t >= 0.5) return "Levemente +";
  if (t > -0.5) return "Neutro";
  if (t > -2) return "Levemente −";
  return "Negativo";
}

export default function AssetBuzz({ nome }: { nome: string }) {
  const [buzz, setBuzz] = useState<Buzz | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setFailed(false);
    fetch(`/api/gdelt/buzz?q=${encodeURIComponent(nome)}&days=30`)
      .then(r => r.json())
      .then((d: Buzz) => {
        if (cancelled) return;
        if (d?.hasData) setBuzz(d); else setFailed(true);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setFailed(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [nome]);

  if (!loading && (failed || !buzz)) return null; // sem dado → não polui o modal

  const tCol = buzz ? toneColor(buzz.toneNow) : "#a1a1aa";
  const volUp = (buzz?.volChangePct ?? 0) >= 0;
  const volData = buzz?.points.filter(p => p.vol != null).map(p => ({ v: p.vol as number })) ?? [];
  const toneData = buzz?.points.filter(p => p.tone != null).map(p => ({ t: p.tone as number })) ?? [];

  return (
    <div className="rounded-xl p-4 mt-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Radio size={14} className="text-amber-400" />
        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Buzz &amp; Sentimento</span>
        <span className="text-[9px] text-zinc-600 font-mono ml-auto">notícia global · 30d · GDELT</span>
      </div>

      {loading ? (
        <div className="h-[92px] rounded-lg bg-white/[0.03] animate-pulse" />
      ) : buzz ? (
        <div className="grid grid-cols-2 gap-3">
          {/* Cobertura (volume) */}
          <div className="rounded-lg p-3" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.12)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Cobertura</span>
              <span className="flex items-center gap-1 text-[11px] font-bold font-mono" style={{ color: AMBER }}>
                {volUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {volUp ? "+" : ""}{buzz.volChangePct.toFixed(0)}%
              </span>
            </div>
            <div className="h-[46px] -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volData} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <defs>
                    <linearGradient id="buzzVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AMBER} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke={AMBER} strokeWidth={1.6} fill="url(#buzzVol)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[9px] text-zinc-600 mt-0.5">vs 1ª metade do período</p>
          </div>

          {/* Tom (sentimento) */}
          <div className="rounded-lg p-3" style={{ background: `${tCol}0d`, border: `1px solid ${tCol}22` }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Tom</span>
              <span className="text-[11px] font-bold font-mono" style={{ color: tCol }}>{toneLabel(buzz.toneNow)}</span>
            </div>
            <div className="h-[46px] -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={toneData} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                  <Line type="monotone" dataKey="t" stroke={tCol} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[9px] text-zinc-600 mt-0.5">
              {buzz.toneChange >= 0 ? "melhorando" : "piorando"} · média {buzz.toneAvg.toFixed(1)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
