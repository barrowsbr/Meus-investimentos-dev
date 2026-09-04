"use client";

// Marcadores dos últimos pregões — barrinhas verde/vermelho mostrando como
// foi cada dia. O retorno vem do campo CANÔNICO `variacao_dia_pct` da aba
// (= snapshot.dayChangeTotalPct, calculado sobre PREÇOS). Já foi derivado de
// patrimônio_hoje/patrimônio_ontem e isso contava APORTE como lucro — ver a
// nota em lib/historico-daily.
// Fica logo abaixo do "Σ Retorno do dia" na Home. Dados: a própria série
// `historico_patrimonio` (via lib/historico-daily). Discreto, sem valores.
//
// Quantidade de pregões configurável em Configurações → Preferências
// (lib/home-prefs, localStorage) — a Home reage na hora via evento.

import { useEffect, useState } from "react";
import { toDailySeries, ultimosResultados, escalaBarras, type DiaResultado } from "@/lib/historico-daily";
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

  // Escala pelo PERCENTIL 90, não pelo máximo: um único dia atípico puxava a
  // referência e achatava todo o resto no piso (92% das barras iguais).
  const ref = escalaBarras(dias.map((d) => d.pct));
  const pos = dias.filter((d) => d.pct > 0).length;
  const neg = dias.filter((d) => d.pct < 0).length;

  return (
    <div className={className}>
      <div className="flex items-end" style={{ height: 22, gap: dias.length > 14 ? 2 : 5 }}>
        {dias.map((d, i) => {
          const intensidade = Math.min(Math.abs(d.pct), ref) / ref; // 0..1 (satura no p90)
          const h = 6 + Math.round(intensidade * 14); // 6..20px
          // 0,00% exato é dia SEM movimento — pintar de verde sugeria alta.
          const cor = d.pct > 0 ? "var(--pos)" : d.pct < 0 ? "var(--neg)" : "var(--faint)";
          return (
            <span
              key={i}
              title={`${fmtData(d.date)} · ${d.pct > 0 ? "+" : ""}${d.pct.toFixed(2)}%`}
              className="rounded-[2px]"
              style={{
                flex: "1 1 0",
                minWidth: 2,
                maxWidth: 7,
                height: h,
                background: cor,
                opacity: 0.55 + 0.45 * intensidade,
              }}
            />
          );
        })}
      </div>
      <div className="font-mono uppercase" style={{ color: "var(--faint)", fontSize: 9, letterSpacing: ".12em", marginTop: 5 }}>
        {dias.length} pregões · {pos}↑ {neg}↓
      </div>
    </div>
  );
}
