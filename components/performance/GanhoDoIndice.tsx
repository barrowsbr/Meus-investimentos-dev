"use client";

// "Quem te fez ganhar (ou perder) do índice" — atribuição ativa POR PAPEL.
// Conta, papel a papel: contribuição real para o seu TWR (contribuicoesTicker
// do motor — identidade exata, Σ = TWR total) MENOS o que aquele mesmo
// dinheiro teria feito parado no índice (peso médio × retorno do índice).
// A soma das barras fecha exatamente na diferença carteira − índice.
// Substitui a atribuição Brinson por setor do relatório da IBKR (decisão do
// dono: com carteira cheia de ETFs, setor GICS vira abstração ilegível;
// por papel responde a pergunta real).
// Só na visão R$ — o motor por papel roda em BRL.

import { useMemo, useState } from "react";
import { Swords } from "lucide-react";
import type { AttributionTickerEntry, Summary } from "@/components/performance/shared";

const MAX_LINHAS = 6; // maiores ganhos e maiores perdas; o miolo vira "outros"

export default function GanhoDoIndice({ itens, s }: { itens: AttributionTickerEntry[]; s: Summary }) {
  const benches = useMemo(() => [
    ...(s.sp500BrlTotal != null ? [{ key: "sp500", rotulo: "S&P 500", total: s.sp500BrlTotal }] : []),
    ...(s.ibovTotal != null ? [{ key: "ibov", rotulo: "IBOV", total: s.ibovTotal }] : []),
  ], [s.sp500BrlTotal, s.ibovTotal]);
  const [benchSel, setBenchSel] = useState<string | null>(null);
  const bench = benches.find((b) => b.key === benchSel) ?? benches[0] ?? null;

  const calc = useMemo(() => {
    if (!bench || itens.length === 0) return null;
    const navTotal = itens.reduce((sum, i) => sum + i.nav_medio, 0);
    if (navTotal <= 0) return null;
    const benchPct = bench.total * 100;
    // ativa = contribuição real − (peso médio × retorno do índice)
    const linhas = itens
      .map((i) => ({
        rotulo: i.ticker === "Renda Fixa" ? "Renda Fixa" : i.ticker,
        setor: i.setor,
        ativa: i.contrib_pct - (i.nav_medio / navTotal) * benchPct,
        interno: i.ticker === "Ajustes",
      }))
      .sort((a, b) => b.ativa - a.ativa);
    const soma = linhas.reduce((sum, l) => sum + l.ativa, 0);

    const visiveis = linhas.filter((l) => !l.interno);
    const ganhos = visiveis.filter((l) => l.ativa > 0).slice(0, MAX_LINHAS);
    const perdas = visiveis.filter((l) => l.ativa < 0).slice(-MAX_LINHAS);
    const mostrados = new Set([...ganhos, ...perdas].map((l) => l.rotulo));
    const resto = linhas.filter((l) => l.interno || !mostrados.has(l.rotulo));
    const outros = resto.reduce((sum, l) => sum + l.ativa, 0);
    const exibir = [...ganhos, ...(resto.length > 0 ? [{ rotulo: `outros (${resto.length})`, setor: "", ativa: outros, interno: true }] : []), ...perdas]
      .sort((a, b) => b.ativa - a.ativa);
    const maxAbs = Math.max(...exibir.map((l) => Math.abs(l.ativa)), 0.0001);
    return { exibir, soma, maxAbs, benchPct };
  }, [itens, bench]);

  if (!calc || !bench) return null;
  const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")} p.p.`;
  const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")}%`;
  const ganhou = calc.soma >= 0;

  return (
    <div className="glass-card p-5 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="section-title"><Swords size={15} />{ganhou ? `Quem te fez ganhar do ${bench.rotulo}` : `Quem te fez perder do ${bench.rotulo}`}</h2>
        <div className="flex items-center gap-2">
          {benches.length > 1 && benches.map((b) => (
            <button key={b.key} onClick={() => setBenchSel(b.key)}
              className="rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors"
              style={{
                border: `1px solid ${bench.key === b.key ? "var(--accent, #E8A33D)" : "var(--line, rgba(255,255,255,0.1))"}`,
                color: bench.key === b.key ? "var(--text)" : "var(--muted)",
                background: bench.key === b.key ? "color-mix(in srgb, var(--accent, #E8A33D) 14%, transparent)" : "transparent",
              }}>
              {b.rotulo}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-zinc-600 mb-4">
        Você {pct(s.twrTotal * 100)} × {bench.rotulo} {pct(calc.benchPct)} → <b style={{ color: ganhou ? "#34d399" : "#f87171" }}>{pp(calc.soma)}</b>
      </p>

      <div className="flex flex-col gap-1">
        {calc.exibir.map((l) => {
          const pos = l.ativa >= 0;
          const w = Math.abs(l.ativa) / calc.maxAbs * 50; // % de meia-pista
          return (
            <div key={l.rotulo} className="flex items-center gap-2 text-[11.5px]">
              <span className={`w-24 shrink-0 truncate text-right ${l.interno ? "text-zinc-500" : "font-semibold text-zinc-200"}`}>{l.rotulo}</span>
              <div className="relative h-4 flex-1">
                <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "rgba(255,255,255,0.14)" }} />
                <div className="absolute inset-y-1" style={{
                  left: pos ? "50%" : `${50 - w}%`, width: `${w}%`,
                  background: pos ? "rgba(52,211,153,0.75)" : "rgba(248,113,113,0.75)",
                  borderRadius: 3,
                }} />
              </div>
              <span className={`w-20 shrink-0 font-mono text-[10.5px] ${pos ? "text-emerald-400" : "text-red-400"}`}>{pp(l.ativa)}</span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
