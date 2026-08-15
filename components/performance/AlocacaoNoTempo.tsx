"use client";

// "Como sua alocação mudou" — área empilhada 100% da fatia de cada setor no
// patrimônio (RV + RF) ao fim de cada mês. Série vem do motor TWR
// (alocacaoMensal: NAV por setor no último pregão do mês) — obedece o período
// e os filtros da página. Do relatório PortfolioAnalyst (Allocation over
// time), adaptado: setores demais viram ruído, então top 6 + "Outros".

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Layers } from "lucide-react";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { TOOLTIP_STYLE, type AlocacaoMes } from "@/components/performance/shared";

const CORES = ["#3b82f6", "#E8A33D", "#a855f7", "#34d399", "#ec4899", "#22d3ee", "#64748b"];
const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${MESES_PT[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

export default function AlocacaoNoTempo({ serie, isLight }: { serie: AlocacaoMes[]; isLight: boolean }) {
  const calc = useMemo(() => {
    if (serie.length < 3) return null;
    // Rank de setores pela fatia média — top 6 nomeados, resto vira "Outros".
    const somaPorSetor = new Map<string, number>();
    for (const m of serie) {
      const total = Object.values(m.porSetor).reduce((s, v) => s + v, 0);
      if (total <= 0) continue;
      for (const [setor, v] of Object.entries(m.porSetor)) {
        somaPorSetor.set(setor, (somaPorSetor.get(setor) ?? 0) + v / total);
      }
    }
    const rank = [...somaPorSetor.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    const top = rank.slice(0, 6);
    const temOutros = rank.length > top.length;

    const rows = serie.map(m => {
      const total = Object.values(m.porSetor).reduce((s, v) => s + v, 0);
      const row: Record<string, number | string> = { mes: rotuloMes(m.mes) };
      let resto = 0;
      for (const [setor, v] of Object.entries(m.porSetor)) {
        const pct = total > 0 ? (v / total) * 100 : 0;
        if (top.includes(setor)) row[setor] = +pct.toFixed(2);
        else resto += pct;
      }
      for (const s of top) if (row[s] === undefined) row[s] = 0;
      if (temOutros) row["Outros"] = +resto.toFixed(2);
      return row;
    });

    const chaves = temOutros ? [...top, "Outros"] : top;

    // Frase da migração: a maior mudança de fatia da primeira para a última.
    const fatia = (row: Record<string, number | string>, s: string) => (typeof row[s] === "number" ? (row[s] as number) : 0);
    let maiorMudanca: { setor: string; de: number; para: number } | null = null;
    for (const s of chaves) {
      const de = fatia(rows[0], s), para = fatia(rows[rows.length - 1], s);
      if (!maiorMudanca || Math.abs(para - de) > Math.abs(maiorMudanca.para - maiorMudanca.de)) {
        maiorMudanca = { setor: s, de, para };
      }
    }
    return { rows, chaves, maiorMudanca };
  }, [serie]);

  if (!calc) return null;
  const pt = (v: number) => v.toFixed(0);

  return (
    <div className="glass-card p-5 mb-4">
      <h2 className="section-title mb-1"><Layers size={15} />Como sua alocação mudou</h2>
      {calc.maiorMudanca && Math.abs(calc.maiorMudanca.para - calc.maiorMudanca.de) >= 3 ? (
        <p className="text-xs text-zinc-600 mb-4">
          Maior migração: <b style={{ color: "var(--text)" }}>{calc.maiorMudanca.setor}</b> {pt(calc.maiorMudanca.de)}% → {pt(calc.maiorMudanca.para)}%
        </p>
      ) : <div className="mb-3" />}
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={calc.rows} stackOffset="expand">
          <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "#1E2028"} vertical={false} />
          <XAxis dataKey="mes" tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
            interval={Math.max(0, Math.floor(calc.rows.length / 10) - 1)} />
          <YAxis tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: isLight ? "#555" : "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={isLight ? { background: "#FDFAF1", border: "1px solid rgba(96,72,40,0.2)", borderRadius: 10, color: "#2B2117", fontSize: 12 } : TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: number, name: string) => [`${v.toFixed(1).replace(".", ",")}%`, name]} />
          {calc.chaves.map((s, i) => (
            <Area key={s} type="monotone" dataKey={s} stackId="1"
              stroke={CORES[i % CORES.length]} fill={CORES[i % CORES.length]} fillOpacity={0.55} strokeWidth={1} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px]" style={{ color: "var(--muted)" }}>
        {calc.chaves.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: CORES[i % CORES.length] }} />{s}
          </span>
        ))}
      </div>
    </div>
  );
}
