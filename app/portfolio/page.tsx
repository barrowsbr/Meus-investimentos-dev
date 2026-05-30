"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Briefcase, Target, ArrowLeftRight, DollarSign } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct, currency } from "@/lib/format";
import { isRendaVariavel, isRendaFixa } from "@/lib/sectors";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const TOOLTIP_STYLE = {
  background: "rgba(13,14,20,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#e4e4e7",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
} as const;

const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#3b82f6",
  "Ações Internacional": "#8b5cf6",
  "ETF USA": "#06b6d4",
  "ETF": "#10b981",
  "FIIs": "#f59e0b",
  "Cripto": "#f97316",
  "Commodities": "#eab308",
  "BDRs": "#ec4899",
  "Renda Fixa": "#6366f1",
  "Renda Fixa USD": "#a78bfa",
};

export default function PortfolioPage() {
  const { data, loading, error } = usePortfolio();

  const metrics = useMemo(() => {
    if (!data) return null;
    const rv = data.positions.filter((p) => isRendaVariavel(p.setor));
    const rf = data.positions.filter((p) => isRendaFixa(p.setor));
    const posComLucro = rv.filter((p) => (p.lucroBRL ?? 0) > 0).length;
    const posSemLucro = rv.filter((p) => (p.lucroBRL ?? 0) < 0).length;
    const totalInvestido = rv.reduce((s, p) => s + p.custoTotalBRL, 0);
    const lucroRealizado = rv.reduce((s, p) => s + p.lucroRealizado * p.fatorBRL, 0);

    // Sector allocation (by current value)
    const bySector: Record<string, number> = {};
    for (const p of rv) {
      bySector[p.setor] = (bySector[p.setor] ?? 0) + p.valorAtualBRL;
    }
    const sectorPie = Object.entries(bySector)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value) }));

    // Top 10 positions by value
    const top10 = [...rv]
      .sort((a, b) => b.valorAtualBRL - a.valorAtualBRL)
      .slice(0, 10)
      .map(p => ({
        ticker: p.ticker,
        value: Math.round(p.valorAtualBRL),
        pct: data.rvPatrimonioBRL > 0 ? (p.valorAtualBRL / data.rvPatrimonioBRL) * 100 : 0,
        lucro: p.lucroBRL ?? 0,
        setor: p.setor,
      }));

    return { rv, rf, posComLucro, posSemLucro, totalInvestido, lucroRealizado, sectorPie, top10 };
  }, [data]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="cotacoes" />;
  if (!data || !metrics) return <ErrorAlert message="Dados não disponíveis" />;

  const lucroPctStr = pct(data.lucroPct);
  const hasUSD = metrics.rv.some((p) => p.moeda !== "BRL");

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Posições abertas — FIFO com PM do dólar e cotação em tempo real"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
        <div className="animate-fade-in">
          <MetricCard label="Investido (RV)" value={compactBRL(metrics.totalInvestido)} sub="Custo com PM do dólar" icon={<Briefcase size={18} />} glowColor="#d4a574" />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard label="Valor Atual (RV)" value={compactBRL(data.rvPatrimonioBRL)} sub={`${metrics.rv.length} ativos`} icon={<Target size={18} />} glowColor="#3b82f6" />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="Lucro Total"
            value={brl(data.lucroBRL)}
            sub={lucroPctStr}
            icon={data.lucroBRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            trend={data.lucroBRL >= 0 ? "up" : "down"}
            glowColor={data.lucroBRL >= 0 ? "#4ade80" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard label="Ganho Ativo" value={brl(data.ganhoAtivoTotalBRL)} sub="Valorização dos ativos" icon={<TrendingUp size={18} />} glowColor="#06b6d4" compact />
        </div>
        <div className="animate-fade-in animate-delay-4">
          <MetricCard label="Ganho Câmbio" value={brl(data.ganhoCambioTotalBRL)} sub="Variação cambial" icon={<ArrowLeftRight size={18} />} trend={data.ganhoCambioTotalBRL >= 0 ? "up" : "down"} glowColor="#10b981" compact />
        </div>
        <div className="animate-fade-in animate-delay-5">
          <MetricCard label="Lucro Realizado" value={brl(metrics.lucroRealizado)} sub={`${metrics.posComLucro} ganho, ${metrics.posSemLucro} perda`} icon={<DollarSign size={18} />} glowColor="#f59e0b" compact />
        </div>
      </div>

      {hasUSD && data.cambio && (
        <div className="glass-card p-4 mb-6 animate-fade-in">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div>
              <span className="text-zinc-500">Spot USD/BRL</span>
              <span className="text-zinc-200 font-semibold ml-2">R$ {data.usdbrl.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-zinc-500">PM Dólar</span>
              <span className="text-accent font-semibold ml-2">R$ {data.cambio.pmDolar.toFixed(4)}</span>
            </div>
            {data.ptax && (
              <div>
                <span className="text-zinc-500">PTAX ({data.ptax.data})</span>
                <span className="text-purple-400 font-semibold ml-2">R$ {data.ptax.USDBRL.toFixed(4)}</span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Fonte FX</span>
              <span className="text-zinc-300 font-medium ml-2">{data.fxSource}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Charts: Sector Allocation + Top 10 ── */}
      {metrics.sectorPie.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 animate-fade-in">
          {/* Donut — sector allocation */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4">Alocação por Setor</h2>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={metrics.sectorPie}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    strokeWidth={2}
                    stroke="rgba(0,0,0,0.4)"
                    dataKey="value"
                  >
                    {metrics.sectorPie.map((entry, i) => (
                      <Cell key={i} fill={SECTOR_COLORS[entry.name] || "#71717a"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [
                      `${compactBRL(v)} (${data.rvPatrimonioBRL > 0 ? ((v / data.rvPatrimonioBRL) * 100).toFixed(1) : 0}%)`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {metrics.sectorPie.slice(0, 6).map(s => {
                  const pctVal = data.rvPatrimonioBRL > 0 ? (s.value / data.rvPatrimonioBRL) * 100 : 0;
                  return (
                    <div key={s.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SECTOR_COLORS[s.name] || "#71717a" }} />
                      <span className="text-[11px] text-zinc-400 flex-1 truncate">{s.name}</span>
                      <span className="text-[11px] text-zinc-300 font-semibold tabular-nums">{pctVal.toFixed(1)}%</span>
                    </div>
                  );
                })}
                {metrics.sectorPie.length > 6 && (
                  <span className="text-[10px] text-zinc-600 mt-1">+{metrics.sectorPie.length - 6} outros</span>
                )}
              </div>
            </div>
          </div>

          {/* Bar — top 10 positions */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4">Top 10 Posições</h2>
            <ResponsiveContainer width="100%" height={185}>
              <BarChart data={metrics.top10} layout="vertical" barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, "dataMax + 2"]} />
                <YAxis type="category" dataKey="ticker" tick={{ fill: "#a1a1aa", fontSize: 10 }} axisLine={false} tickLine={false} width={56} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, _name: string, props: { payload?: { value: number; lucro: number } }) => [
                    `${v.toFixed(1)}% — ${compactBRL(props.payload?.value ?? 0)}`,
                    "Peso",
                  ]}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {metrics.top10.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.lucro >= 0 ? "#34d399" : "#f87171"}
                      fillOpacity={0.75 - i * 0.04}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="glass-card p-5 mb-6 animate-fade-in">
        <h2 className="section-title mb-4">Renda Variável</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Ativo</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Setor</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Qtd</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">PM</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Preço</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Investido</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Atual</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Lucro</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">%</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Prov.</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Ret. Total</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Dia %</th>
                {hasUSD && <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">G.Ativo</th>}
                {hasUSD && <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">G.Câmbio</th>}
              </tr>
            </thead>
            <tbody>
              {metrics.rv.map((p, i) => {
                const cor = (p.lucroBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const corAtivo = (p.ganhoAtivoBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const corCambio = (p.ganhoCambioBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const provBRL = data.proventosPorTicker?.[p.ticker] ?? 0;
                const realizadoBRL = p.lucroRealizadoBRL;
                const naoRealizadoBRL = p.lucroBRL ?? 0;
                const resultadoTotal = naoRealizadoBRL + realizadoBRL + provBRL;
                const retornoTotalPct = p.custoTotalBRL > 0 ? (resultadoTotal / p.custoTotalBRL) * 100 : (p.lucroPct ?? 0);
                const corTotal = resultadoTotal >= 0 ? "text-positive" : "text-negative";
                return (
                  <tr key={p.ticker} className={`border-b border-border/30 hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-zinc-200">{p.ticker}</span>
                      <span className="text-zinc-600 text-[10px] ml-1">{p.moeda}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[p.setor] || "#71717a"}15`, color: SECTOR_COLORS[p.setor] || "#71717a" }}>
                        {p.setor}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 font-mono text-xs">{p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">{currency(p.custoMedio, p.moeda)}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">
                      {p.precoAtual !== null ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">{brl(p.custoTotalBRL)}</td>
                    <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{brl(p.valorAtualBRL)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${cor}`}>{p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${cor}`}>{p.lucroPct !== null ? pct(p.lucroPct) : "—"}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-amber-400">
                      {provBRL > 0 ? compactBRL(provBRL) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold ${corTotal}`}>
                      {p.lucroBRL !== null ? pct(retornoTotalPct) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right text-xs ${p.dayChangePct !== null ? (p.dayChangePct >= 0 ? "text-positive" : "text-negative") : "text-zinc-600"}`}>
                      {p.dayChangePct !== null ? pct(p.dayChangePct) : "—"}
                    </td>
                    {hasUSD && <td className={`px-3 py-2.5 text-right text-xs ${corAtivo}`}>{p.ganhoAtivoBRL !== null ? brl(p.ganhoAtivoBRL) : "—"}</td>}
                    {hasUSD && <td className={`px-3 py-2.5 text-right text-xs ${corCambio}`}>{p.ganhoCambioBRL !== null && p.ganhoCambioBRL !== 0 ? brl(p.ganhoCambioBRL) : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {(() => {
                const totalProvRV = metrics.rv.reduce((s, p) => s + (data.proventosPorTicker?.[p.ticker] ?? 0), 0);
                const totalRealizadoRV = metrics.lucroRealizado;
                const totalResultado = data.lucroBRL + totalRealizadoRV + totalProvRV;
                const totalRetornoPct = metrics.totalInvestido > 0 ? (totalResultado / metrics.totalInvestido) * 100 : 0;
                return (
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-3 py-3 text-zinc-300" colSpan={5}>Total RV</td>
                    <td className="px-3 py-3 text-right text-zinc-300">{brl(metrics.totalInvestido)}</td>
                    <td className="px-3 py-3 text-right text-zinc-200">{brl(data.rvPatrimonioBRL)}</td>
                    <td className={`px-3 py-3 text-right ${data.lucroBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.lucroBRL)}</td>
                    <td className={`px-3 py-3 text-right ${data.lucroPct >= 0 ? "text-positive" : "text-negative"}`}>{pct(data.lucroPct)}</td>
                    <td className="px-3 py-3 text-right text-amber-400">{compactBRL(totalProvRV)}</td>
                    <td className={`px-3 py-3 text-right font-bold ${totalResultado >= 0 ? "text-positive" : "text-negative"}`}>{pct(totalRetornoPct)}</td>
                    <td className={`px-3 py-3 text-right text-xs ${(data.dayChangeTotalBRL ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>{pct(data.dayChangeTotalPct ?? 0)}</td>
                    {hasUSD && <td className={`px-3 py-3 text-right text-xs ${data.ganhoAtivoTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.ganhoAtivoTotalBRL)}</td>}
                    {hasUSD && <td className={`px-3 py-3 text-right text-xs ${data.ganhoCambioTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.ganhoCambioTotalBRL)}</td>}
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </div>

      {metrics.rf.length > 0 && (
        <div className="glass-card p-5 animate-fade-in">
          <h2 className="section-title mb-4">Renda Fixa (com cotação)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Ativo</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Setor</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Preço</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.rf.map((p, i) => (
                  <tr key={p.ticker} className={`border-b border-border/30 hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-zinc-200">{p.ticker}</span>
                      <span className="text-zinc-600 text-[10px] ml-1">{p.moeda}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[p.setor] || "#71717a"}15`, color: SECTOR_COLORS[p.setor] || "#71717a" }}>
                        {p.setor}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 font-mono text-xs">{p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">
                      {p.precoAtual !== null ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{brl(p.valorAtualBRL)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
