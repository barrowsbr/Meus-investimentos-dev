"use client";

// Marcadores dos últimos pregões — barrinhas verde/vermelho mostrando como
// foi cada dia (variação de fechamento a fechamento do patrimônio total).
// Fica logo abaixo do "Σ Retorno do dia" na Home. Dados: a própria série
// `historico_patrimonio` (via lib/historico-daily). Discreto, sem valores.

import { useEffect, useState } from "react";
import { toDailySeries, ultimosResultados, type DiaResultado } from "@/lib/historico-daily";

const N = 7;

function fmtData(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}`;
  return iso;
}

export default function DayStreak({ className = "" }: { className?: string }) {
  const [dias, setDias] = useState<DiaResultado[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/sheets/historico_patrimonio")
      .then((r) => r.json())
      .then((x) => {
        if (!alive) return;
        setDias(ultimosResultados(toDailySeries(x), N));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!dias || dias.length < 2) return null;

  // Altura da barra proporcional à magnitude (clampada), com piso p/ ficar visível.
  const maxAbs = Math.max(0.4, ...dias.map((d) => Math.abs(d.pct)));
  const pos = dias.filter((d) => d.pct >= 0).length;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5" style={{ height: 22 }}>
        {dias.map((d, i) => {
          const up = d.pct >= 0;
          const h = 6 + Math.round((Math.min(Math.abs(d.pct), maxAbs) / maxAbs) * 14); // 6..20px
          return (
            <span
              key={i}
              title={`${fmtData(d.date)} · ${d.pct >= 0 ? "+" : ""}${d.pct.toFixed(2)}%`}
              className="rounded-[2px]"
              style={{
                width: 6,
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
