"use client";

// Extraído de app/configuracoes/page.tsx — preferência "Home — pregões no termômetro"
// (quantos pregões aparecem nas barrinhas do Σ Retorno do dia).

import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { getStreakDays, setStreakDays, STREAK_DAYS_DEFAULT, STREAK_DAYS_MIN, STREAK_DAYS_MAX } from "@/lib/home-prefs";

// ── Home — indicadores (barrinhas de pregões) ────────────────────────────────

const STREAK_PRESETS = [7, 15, 30, 60];

export default function StreakDaysPref() {
  const [dias, setDias] = useState<number>(STREAK_DAYS_DEFAULT);

  useEffect(() => { setDias(getStreakDays()); }, []);

  const save = (n: number) => {
    setStreakDays(n);
    setDias(getStreakDays()); // relê já clampado (2..90)
  };

  return (
    <div className="pt-3 border-t border-zinc-800/50 space-y-2">
      <div className="flex items-center gap-2">
        <Activity size={13} className="text-emerald-400" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Home — pregões no termômetro</span>
      </div>
      <p className="text-xs text-zinc-500">
        Quantos pregões aparecem nas barrinhas verde/vermelho abaixo do &ldquo;Σ Retorno do dia&rdquo;. Vale na hora, sem recarregar
        (limitado ao que já existe no histórico patrimonial).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {STREAK_PRESETS.map((n) => {
          const active = dias === n;
          return (
            <button
              key={n}
              onClick={() => save(n)}
              className="font-mono text-xs rounded-lg px-3 py-1.5 transition-all"
              style={{
                border: active ? "2px solid rgba(63,185,80,0.6)" : "2px solid rgba(128,128,128,0.2)",
                background: active ? "rgba(63,185,80,0.10)" : "rgba(8,15,20,0.6)",
                color: active ? "#3FB950" : "#a1a1aa",
                fontWeight: 700,
              }}
            >
              {n} dias
            </button>
          );
        })}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={STREAK_DAYS_MIN}
            max={STREAK_DAYS_MAX}
            value={dias}
            onChange={(e) => save(parseInt(e.target.value, 10))}
            className="w-20 font-mono text-xs rounded-lg px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 focus:border-emerald-500 focus:outline-none"
          />
          <span className="text-[10px] text-zinc-600">personalizado ({STREAK_DAYS_MIN}–{STREAK_DAYS_MAX})</span>
        </div>
      </div>
    </div>
  );
}
