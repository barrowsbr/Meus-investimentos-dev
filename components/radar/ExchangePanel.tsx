"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ExchangePanel — painel da "visão Bolsas". Lista as praças onde há posição,
// AGRUPADAS por país. País com mais de uma bolsa ganha um cabeçalho com badge
// "N bolsas" e as praças aninhadas — deixando o multi-bolsa visualmente claro.
// ─────────────────────────────────────────────────────────────────────────────

import { Building2 } from "lucide-react";
import type { ExchangeAlloc } from "@/lib/radar/exchanges";
import { ISO2_TO_RADAR_PT } from "@/lib/radar/geo";

const fmtBRLk = (v: number) =>
  `R$ ${v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0)}`;

// ISO-2 → bandeira emoji (regional indicator symbols).
function flagOf(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return "🏳️";
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

interface Props {
  allocation: ExchangeAlloc[];
  onPickCountry: (name: string) => void;
}

export default function ExchangePanel({ allocation, onPickCountry }: Props) {
  if (allocation.length === 0) return null;

  // Agrupa por país (iso2), somando e preservando as praças.
  const byCountry = new Map<string, { iso2: string; brl: number; pct: number; exchanges: ExchangeAlloc[] }>();
  for (const a of allocation) {
    const iso2 = a.exchange.iso2;
    const cur = byCountry.get(iso2) ?? { iso2, brl: 0, pct: 0, exchanges: [] };
    cur.brl += a.brl;
    cur.pct += a.pct;
    cur.exchanges.push(a);
    byCountry.set(iso2, cur);
  }
  const countries = [...byCountry.values()].sort((a, b) => b.brl - a.brl);

  return (
    <div
      className="absolute left-3 top-3 z-20 w-[220px] max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl p-3"
      style={{ background: "rgba(8,10,18,0.86)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Building2 size={13} className="text-sky-400" />
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Bolsas</h3>
      </div>

      <div className="flex flex-col gap-2.5">
        {countries.map((c) => {
          const ptName = ISO2_TO_RADAR_PT[c.iso2] ?? c.iso2;
          const multi = c.exchanges.length > 1;
          return (
            <div key={c.iso2}>
              <button
                onClick={() => onPickCountry(ptName)}
                className="flex w-full items-center gap-1.5 text-left"
              >
                <span className="text-sm">{flagOf(c.iso2)}</span>
                <span className="truncate text-[11px] font-semibold text-zinc-200">{ptName}</span>
                {multi && (
                  <span
                    className="ml-1 rounded-full px-1.5 py-px text-[8px] font-bold uppercase"
                    style={{ background: "rgba(56,189,248,0.18)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,0.4)" }}
                  >
                    {c.exchanges.length} bolsas
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-zinc-400">{c.pct.toFixed(0)}%</span>
              </button>

              {/* Praças do país. Se houver +1, aninha com guia à esquerda. */}
              <div className={`mt-1 flex flex-col gap-1 ${multi ? "border-l border-sky-500/25 pl-2 ml-1.5" : ""}`}>
                {c.exchanges.map((e) => (
                  <div key={e.exchange.code} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                    <span className="truncate text-[10px] text-zinc-300">{e.exchange.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-zinc-500">{fmtBRLk(e.brl)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
