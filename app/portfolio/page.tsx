"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Briefcase, Target } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, currency } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

export default function PortfolioPage() {
  const { data, loading, error } = usePortfolio();

  const metrics = useMemo(() => {
    if (!data) return null;
    const posComLucro = data.positions.filter((p) => (p.lucroBRL ?? 0) > 0).length;
    const posSemLucro = data.positions.filter((p) => (p.lucroBRL ?? 0) < 0).length;
    return { posComLucro, posSemLucro };
  }, [data]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="cotacoes" />;
  if (!data || !metrics) return <ErrorAlert message="Dados não disponíveis" />;

  const lucroPctStr = data.lucroPct >= 0
    ? `+${data.lucroPct.toFixed(1)}%`
    : `${data.lucroPct.toFixed(1)}%`;

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Posições abertas com cotação em tempo real"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Valor Investido"
          value={brl(data.totalInvestidoBRL)}
          icon={<Briefcase size={18} />}
        />
        <MetricCard
          label="Valor Atual"
          value={brl(data.totalAtualBRL)}
          sub={`${data.positions.length} ativos`}
          icon={<Target size={18} />}
        />
        <MetricCard
          label="Lucro/Prejuízo"
          value={brl(data.lucroBRL)}
          sub={lucroPctStr}
          icon={<TrendingUp size={18} />}
        />
        <MetricCard
          label="Ativos"
          value={`${metrics.posComLucro} +  / ${metrics.posSemLucro} -`}
          sub={`${metrics.posComLucro} no lucro, ${metrics.posSemLucro} no prejuízo`}
          icon={<TrendingDown size={18} />}
        />
      </div>

      <div className="glass-card p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Ativo</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Corretora</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Qtd</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Custo Médio</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Preço Atual</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Investido (R$)</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Atual (R$)</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Lucro (R$)</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Lucro (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => {
                const lucroCor = (p.lucroBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                return (
                  <tr key={p.ticker} className="border-b border-border/30">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{p.ticker}</span>
                      <span className="text-zinc-600 text-xs ml-2">{p.moeda}</span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs">{p.corretora}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">
                      {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">
                      {currency(p.custoMedio, p.moeda)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">
                      {p.precoAtual !== null
                        ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">{brl(p.custoTotalBRL)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{brl(p.valorAtualBRL)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${lucroCor}`}>
                      {p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-medium ${lucroCor}`}>
                      {p.lucroPct !== null
                        ? `${p.lucroPct >= 0 ? "+" : ""}${p.lucroPct.toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-3" colSpan={5}>Total</td>
                <td className="px-3 py-3 text-right">{brl(data.totalInvestidoBRL)}</td>
                <td className="px-3 py-3 text-right">{brl(data.totalAtualBRL)}</td>
                <td className={`px-3 py-3 text-right ${data.lucroBRL >= 0 ? "text-positive" : "text-negative"}`}>
                  {brl(data.lucroBRL)}
                </td>
                <td className={`px-3 py-3 text-right ${data.lucroPct >= 0 ? "text-positive" : "text-negative"}`}>
                  {data.lucroPct >= 0 ? "+" : ""}{data.lucroPct.toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
