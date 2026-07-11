"use client";

// Marcadores dos últimos pregões — barrinhas verde/vermelho mostrando como
// foi cada dia (variação de fechamento a fechamento do patrimônio total).
// Fica logo abaixo do "Σ Retorno do dia" na Home. Dados: a própria série
// `historico_patrimonio` (via lib/historico-daily). Discreto, sem valores.
//
// Quantidade de pregões configurável em Configurações → Preferências
// (lib/home-prefs, localStorage) — a Home reage na hora via evento.

import { useEffect, useState } from "react";
import { toDailySeries, ultimosResultados, type DiaResultado } from "@/lib/historico-daily";
import { getStreakDays, STREAK_DAYS_EVENT, STREAK_DAYS_MAX } from "@/lib/home-prefs";

function fmtData(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}`;
  return iso;
}

export default function DayStreak({ className = "" }: { className?: string }) {
  const [todos, setTodos] = useState<DiaResultado[] | null>(null);
  const [n, setN] = useState(30);

  useEffect(() => {
    setN(getStreakDays());
    const onChange = () => setN(getStreakDays());
    window.addEventListener(STREAK_DAYS_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => { window.removeEventListener(STREAK_DAYS_EVENT, onChange); window.removeEventListener("storage", onChange); };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/sheets/historico_patrimonio")
      .then((r) => r.json())
      .then((x) => {
        if (!alive) return;
        setTodos(ultimosResultados(toDailySeries(x), STREAK_DAYS_MAX));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const dias = todos ? todos.slice(-n) : null;
  if (!dias || dias.length < 2) return null;

  // Altura da barra proporcional à magnitude (clampada), com piso p/ ficar visível.
  const maxAbs = Math.max(0.4, ...dias.map((d) => Math.abs(d.pct)));
  const pos = dias.filter((d) => d.pct >= 0).length;

  return (
    <div className={className}>
      <div className="flex items-end" style={{ height: 22, gap: dias.length > 14 ? 2 : 5 }}>
        {dias.map((d, i) => {
          const up = d.pct >= 0;
          const h = 6 + Math.round((Math.min(Math.abs(d.pct), maxAbs) / maxAbs) * 14); // 6..20px
          return (
            <span
              key={i}
              title={`${fmtData(d.date)} · ${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(2)}%`}
              className="rounded-[2px]"
              style={{
                flex: "1 1 0",
                minWidth: 2,
                maxWidth: 7,
                height: h,
                background: up ? "var(--pos)" : "var(--neg)",
                opacity: 0.55 + 0.45 * (Math.min(Math.abs(d.pct), maxAbs) / maxAbs),
              }}
            />
          );
        })}
      </div>
      <div className="font-mono uppercase" style={{ color: "var(--faint)", fontSize: 9, letterSpacing: ".12em", marginTop: 5 }}>
        {dias.length} pregões · {pos}↑ {dias.length - pos}↓
      </div>
    </div>
  );
}
