"use client";

// Resumo = a síntese (Princípio III: leitura antes do dado bruto). Junta numa
// frase o pulso local + câmbio, e destaca 2 indicadores macro estruturais.

import { Activity } from "lucide-react";
import type { IndexData, CurrencyData, CountryMacro } from "@/lib/radar/types";
import { localFxMove } from "@/lib/radar/geo";
import { formatMacro } from "./format-macro";

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold" style={{ color: color ?? "#e4e4e7" }}>{value}</p>
    </div>
  );
}

export default function ResumoTab({ indices, currency, macro }: {
  indices: IndexData[];
  currency: CurrencyData | null;
  macro: CountryMacro | null;
}) {
  const tradable = indices.filter((i) => i.symbol !== "^VIX");
  const avg = tradable.length ? tradable.reduce((s, i) => s + i.changePct, 0) / tradable.length : null;
  const lead = tradable.length ? tradable.reduce((a, b) => (Math.abs(b.changePct) > Math.abs(a.changePct) ? b : a)) : null;

  const gdpGrowth = macro?.indicators.find((i) => i.id === "NY.GDP.MKTP.KD.ZG");
  const inflation = macro?.indicators.find((i) => i.id === "FP.CPI.TOTL.ZG");

  // Frase de leitura — determinística, a partir dos dados já carregados.
  const parts: string[] = [];
  if (avg !== null) {
    const tone = avg > 0.3 ? "sessão positiva" : avg < -0.3 ? "sessão negativa" : "sessão estável";
    parts.push(`${tone} nos mercados locais (média ${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%)`);
    if (lead) parts.push(`destaque ${lead.name} (${lead.changePct >= 0 ? "+" : ""}${lead.changePct.toFixed(2)}%)`);
  }
  if (currency) {
    const fx = localFxMove(currency.changePct);
    parts.push(`${currency.code} ${fx >= 0 ? "valorizou" : "recuou"} ${Math.abs(fx).toFixed(2)}% vs USD`);
  }
  const leitura = parts.length ? `${parts.join("; ")}.` : "Sem mercados monitorados; veja o pano de fundo macro.";

  return (
    <div className="space-y-4 p-4">
      {/* Leitura sintética */}
      <div className="rounded-xl p-3" style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)" }}>
        <div className="mb-1 flex items-center gap-1.5">
          <Activity size={13} className="text-blue-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">Leitura do dia</span>
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-200">{leitura}</p>
      </div>

      {/* Chips de síntese */}
      <div className="grid grid-cols-2 gap-2">
        {avg !== null && (
          <StatChip label="Mercado local (média)" value={`${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`} color={avg >= 0 ? "#4ade80" : "#f87171"} />
        )}
        {currency && (() => {
          const fx = localFxMove(currency.changePct);
          return <StatChip label={`${currency.code} vs USD`} value={`${fx >= 0 ? "+" : ""}${fx.toFixed(2)}%`} color={fx >= 0 ? "#4ade80" : "#f87171"} />;
        })()}
        {gdpGrowth && <StatChip label="Cresc. PIB" value={formatMacro(gdpGrowth.value, gdpGrowth.format)} />}
        {inflation && <StatChip label="Inflação (CPI)" value={formatMacro(inflation.value, inflation.format)} />}
      </div>

      <p className="text-[10px] text-zinc-600">
        Explore as abas Intel e Notícias para leitura IA, índice de instabilidade e sinais preditivos.
      </p>
    </div>
  );
}
