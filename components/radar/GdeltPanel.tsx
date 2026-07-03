"use client";

// Painel da visão GDELT do Radar: pulso do mundo pela notícia global —
// tom (sentimento) + buzz (volume) + focos de conflito por país. Indicadores
// coerentes com o resto do app (verde↔vermelho = tom, âmbar = volume).

import { useEffect, useState } from "react";
import { Activity, TrendingUp, TrendingDown, Flame } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface Hotspot { iso: string; country: string; countryPT: string; mentions: number }
interface World {
  tone: number; toneAvg: number;
  toneSeries: { date: string; value: number }[];
  volSeries: { date: string; value: number }[];
  volChangePct: number;
  hotspots: Hotspot[];
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
  if (t >= 2) return "Otimista";
  if (t >= 0.5) return "Levemente +";
  if (t > -0.5) return "Neutro";
  if (t > -2) return "Tenso";
  return "Pessimista";
}

export default function GdeltPanel({ onPickCountry }: { onPickCountry: (name: string) => void }) {
  const [world, setWorld] = useState<World | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gdelt/world")
      .then(r => r.json())
      .then((d: World) => { if (!cancelled) { setWorld(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const tCol = world ? toneColor(world.tone) : "#a1a1aa";
  const volUp = (world?.volChangePct ?? 0) >= 0;
  const volData = (world?.volSeries ?? []).map(p => ({ v: p.value }));
  // Posição do marcador de tom no medidor (-5..+5 → 0..100%).
  const tonePct = world ? Math.max(0, Math.min(100, ((Math.max(-5, Math.min(5, world.tone)) + 5) / 10) * 100)) : 50;
  const maxMentions = Math.max(1, ...(world?.hotspots ?? []).map(h => h.mentions));

  return (
    <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: "rgba(56,189,248,0.12)" }}>
          <Activity size={13} className="text-sky-400" />
        </span>
        <div>
          <p className="text-xs font-bold text-zinc-100">Pulso GDELT</p>
          <p className="text-[9px] text-zinc-500">notícia global · 30d · sem custo</p>
        </div>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-white/[0.03]" />
      ) : world ? (
        <div className="space-y-3">
          {/* Tom global — medidor */}
          <div className="rounded-lg p-2.5" style={{ background: `${tCol}0d`, border: `1px solid ${tCol}22` }}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Tom do mundo</span>
              <span className="font-mono text-[11px] font-bold" style={{ color: tCol }}>{toneLabel(world.tone)} · {world.tone.toFixed(1)}</span>
            </div>
            <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, #f87171, #a1a1aa 50%, #34d399)" }}>
              <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-900 shadow" style={{ left: `${tonePct}%`, background: tCol }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[8px] text-zinc-600"><span>negativo</span><span>positivo</span></div>
          </div>

          {/* Buzz global — volume de cobertura */}
          <div className="rounded-lg p-2.5" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.12)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Cobertura global</span>
              <span className="flex items-center gap-1 font-mono text-[11px] font-bold" style={{ color: AMBER }}>
                {volUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{volUp ? "+" : ""}{world.volChangePct.toFixed(0)}%
              </span>
            </div>
            <div className="-mx-1 h-9">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volData} margin={{ top: 3, right: 2, bottom: 0, left: 2 }}>
                  <defs>
                    <linearGradient id="gdeltVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AMBER} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke={AMBER} strokeWidth={1.4} fill="url(#gdeltVol)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Focos de conflito — ranking clicável */}
          {world.hotspots.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Flame size={11} className="text-red-400" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-red-300">Focos de conflito</span>
              </div>
              <div className="space-y-1">
                {world.hotspots.slice(0, 8).map(h => (
                  <button
                    key={h.iso}
                    onClick={() => onPickCountry(h.countryPT)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-white/5"
                  >
                    <span className="w-24 shrink-0 truncate text-[11px] text-zinc-300">{h.countryPT}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(6, (h.mentions / maxMentions) * 100)}%`, background: "linear-gradient(90deg, #fb923c, #f87171)" }} />
                    </span>
                    <span className="w-8 shrink-0 text-right font-mono text-[10px] text-zinc-500">{h.mentions}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-zinc-500">Sem dados do GDELT agora.</p>
      )}
    </div>
  );
}
