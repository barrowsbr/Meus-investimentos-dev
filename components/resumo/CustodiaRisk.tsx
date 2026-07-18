"use client";

// Extraído de app/resumo/page.tsx — Risco por Corretora & Jurisdição
// (concentração de patrimônio por corretora, com inferência de jurisdição).

import React, { useMemo } from "react";
import { Building2 } from "lucide-react";
import { compactBRL } from "@/lib/format";
import { isRendaVariavel } from "@/lib/sectors";

export default function CustodiaRisk({ positions, patrimonioBRL, macroFilter = "global" }: {
  positions: { ticker: string; setor: string; valorAtualBRL: number; quantidade: number; moeda: string; corretora?: string; macro?: string }[];
  patrimonioBRL: number;
  macroFilter?: string;
}) {
  // Usa o macro explícito quando vem (RF manual/caixa têm subsetor que não está
  // em RF_SETORES); senão deriva do setor.
  const macroOf = (p: { setor: string; macro?: string }) =>
    p.macro ?? (isRendaVariavel(p.setor) ? "Renda Variável" : "Renda Fixa");

  const filteredPositions = useMemo(() => {
    if (macroFilter === "global") return positions;
    return positions.filter(p => macroOf(p) === macroFilter);
  }, [positions, macroFilter]);

  const filteredTotal = useMemo(() =>
    macroFilter === "global" ? patrimonioBRL : filteredPositions.reduce((s, p) => s + p.valorAtualBRL, 0),
    [macroFilter, patrimonioBRL, filteredPositions]);

  const byCorretora = useMemo(() => {
    const map: Record<string, { valorBRL: number; moedas: Set<string>; tickers: string[]; count: number }> = {};
    for (const p of filteredPositions) {
      if (p.valorAtualBRL <= 0 || !p.quantidade) continue;
      const corr = (p.corretora || "Não informada").trim();
      if (!map[corr]) map[corr] = { valorBRL: 0, moedas: new Set(), tickers: [], count: 0 };
      map[corr].valorBRL += p.valorAtualBRL;
      map[corr].moedas.add(p.moeda || "BRL");
      map[corr].tickers.push(p.ticker.replace(/\.SA$/, ""));
      map[corr].count++;
    }
    return Object.entries(map)
      .map(([nome, info]) => ({
        nome,
        valorBRL: info.valorBRL,
        pct: filteredTotal > 0 ? (info.valorBRL / filteredTotal) * 100 : 0,
        moedas: [...info.moedas].join(", "),
        jurisdicao: inferJurisdicao(nome),
        count: info.count,
        topTickers: info.tickers.slice(0, 5),
      }))
      .sort((a, b) => b.valorBRL - a.valorBRL);
  }, [filteredPositions, filteredTotal]);

  if (byCorretora.length === 0) return null;

  const maxPct = Math.max(...byCorretora.map(c => c.pct));

  return (
    <div className="glass-card p-5 mb-6">
      <h2 className="section-title mb-1"><Building2 size={15} />Risco por Corretora & Jurisdição</h2>
      <p className="text-[10px] text-zinc-500 mb-5">
        Concentração de patrimônio por corretora. Diversificar custódia reduz risco de contraparte.
      </p>

      <div className="space-y-3">
        {byCorretora.map(c => {
          const jColor = c.jurisdicao === "Brasil" ? "#22c55e" : c.jurisdicao === "EUA" ? "#3b82f6" : "#8b5cf6";
          return (
            <div key={c.nome} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${jColor}15` }}>
                    <Building2 size={14} style={{ color: jColor }} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-zinc-100">{c.nome}</div>
                    <div className="text-[10px] text-zinc-600">
                      <span style={{ color: jColor }}>{c.jurisdicao}</span> · {c.count} ativos · {c.moedas}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-zinc-100">{compactBRL(c.valorBRL)}</div>
                  <div className="text-[10px] text-zinc-500">{c.pct.toFixed(1)}% do patrimônio</div>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${Math.min((c.pct / Math.max(maxPct, 1)) * 100, 100)}%`,
                  background: c.pct > 50 ? `linear-gradient(90deg, ${jColor}, #f87171)` : jColor,
                  opacity: 0.7,
                }} />
              </div>
              {c.pct > 60 && (
                <div className="text-[10px] text-amber-400/80 mb-1">
                  Concentração alta ({c.pct.toFixed(0)}%) — considere diversificar custódia
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {c.topTickers.map(t => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-md text-zinc-500" style={{ background: "rgba(255,255,255,0.04)" }}>{t}</span>
                ))}
                {c.count > 5 && <span className="text-[9px] text-zinc-700">+{c.count - 5}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function inferJurisdicao(corretora: string): string {
  const c = corretora.toLowerCase();
  if (c.includes("ibkr") || c.includes("interactive") || c.includes("td ") || c.includes("schwab") || c.includes("robinhood") || c.includes("fidelity")) return "EUA";
  if (c.includes("b3") || c.includes("xp") || c.includes("rico") || c.includes("btg") || c.includes("nuinvest") || c.includes("clear") || c.includes("inter") || c.includes("itaú") || c.includes("bradesco") || c.includes("avenue")) return "Brasil";
  if (c.includes("degiro") || c.includes("saxo") || c.includes("etoro")) return "Europa";
  if (c.includes("binance") || c.includes("coinbase") || c.includes("kraken") || c.includes("mercado bitcoin") || c.includes("bybit")) return "Cripto (global)";
  return "Outro";
}
