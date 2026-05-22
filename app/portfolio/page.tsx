"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Briefcase, Target, ArrowLeftRight, DollarSign } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct, currency } from "@/lib/format";
import { isRendaVariavel, isRendaFixa } from "@/lib/sectors";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

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
    return { rv, rf, posComLucro, posSemLucro, totalInvestido, lucroRealizado };
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

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
        <MetricCard label="Investido (RV)" value={compactBRL(metrics.totalInvestido)} sub="Custo com PM do dólar" icon={<Briefcase size={18} />} glowColor="#d4a574" />
        <MetricCard label="Valor Atual (RV)" value={compactBRL(data.rvPatrimonioBRL)} sub={`${metrics.rv.length} ativos`} icon={<Target size={18} />} glowColor="#3b82f6" />
        <MetricCard
          label="Lucro Total"
          value={brl(data.lucroBRL)}
          sub={lucroPctStr}
          icon={data.lucroBRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          trend={data.lucroBRL >= 0 ? "up" : "down"}
          glowColor={data.lucroBRL >= 0 ? "#4ade80" : "#f87171"}
        />
        <MetricCard label="Ganho Ativo" value={brl(data.ganhoAtivoTotalBRL)} sub="Valorização dos ativos" icon={<TrendingUp size={18} />} glowColor="#06b6d4" compact />
        <MetricCard label="Ganho Câmbio" value={brl(data.ganhoCambioTotalBRL)} sub="Variação cambial" icon={<ArrowLeftRight size={18} />} trend={data.ganhoCambioTotalBRL >= 0 ? "up" : "down"} glowColor="#10b981" compact />
        <MetricCard label="Lucro Realizado" value={brl(metrics.lucroRealizado)} sub={`${metrics.posComLucro} ganho, ${metrics.posSemLucro} perda`} icon={<DollarSign size={18} />} glowColor="#f59e0b" compact />
      </div>

      {hasUSD && data.cambio && (
        <div className="glass-card p-4 mb-6 flex flex-wrap gap-6 text-xs">
          <div>
            <span className="text-zinc-500">Spot USD/BRL</span>
            <span className="text-zinc-200 font-medium ml-2">R$ {data.usdbrl.toFixed(4)}</span>
          </div>
          <div>
            <span className="text-zinc-500">PM Dólar</span>
            <span className="text-zinc-200 font-medium ml-2">R$ {data.cambio.pmDolar.toFixed(4)}</span>
          </div>
          {data.ptax && (
            <div>
              <span className="text-zinc-500">PTAX ({data.ptax.data})</span>
              <span className="text-zinc-200 font-medium ml-2">R$ {data.ptax.USDBRL.toFixed(4)}</span>
            </div>
          )}
          <div>
            <span className="text-zinc-500">Fonte FX</span>
            <span className="text-zinc-200 font-medium ml-2">{data.fxSource}</span>
          </div>
        </div>
      )}

      <div className="glass-card p-5 mb-6">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Renda Variável</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Ativo</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Setor</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Qtd</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">PM</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Preço</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Investido</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Atual</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Lucro</th>
                <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">%</th>
                {hasUSD && <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">G.Ativo</th>}
                {hasUSD && <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">G.Câmbio</th>}
              </tr>
            </thead>
            <tbody>
              {metrics.rv.map((p) => {
                const cor = (p.lucroBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const corAtivo = (p.ganhoAtivoBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const corCambio = (p.ganhoCambioBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                return (
                  <tr key={p.ticker} className="border-b border-border/30 hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{p.ticker}</span>
                      <span className="text-zinc-600 text-xs ml-1">{p.moeda}</span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs">{p.setor}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">{p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">{currency(p.custoMedio, p.moeda)}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">
                      {p.precoAtual !== null ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">{brl(p.custoTotalBRL)}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{brl(p.valorAtualBRL)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${cor}`}>{p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${cor}`}>{p.lucroPct !== null ? pct(p.lucroPct) : "—"}</td>
                    {hasUSD && <td className={`px-3 py-2.5 text-right text-xs ${corAtivo}`}>{p.ganhoAtivoBRL !== null ? brl(p.ganhoAtivoBRL) : "—"}</td>}
                    {hasUSD && <td className={`px-3 py-2.5 text-right text-xs ${corCambio}`}>{p.ganhoCambioBRL !== null && p.ganhoCambioBRL !== 0 ? brl(p.ganhoCambioBRL) : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-3" colSpan={5}>Total RV</td>
                <td className="px-3 py-3 text-right">{brl(metrics.totalInvestido)}</td>
                <td className="px-3 py-3 text-right">{brl(data.rvPatrimonioBRL)}</td>
                <td className={`px-3 py-3 text-right ${data.lucroBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.lucroBRL)}</td>
                <td className={`px-3 py-3 text-right ${data.lucroPct >= 0 ? "text-positive" : "text-negative"}`}>{pct(data.lucroPct)}</td>
                {hasUSD && <td className={`px-3 py-3 text-right text-xs ${data.ganhoAtivoTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.ganhoAtivoTotalBRL)}</td>}
                {hasUSD && <td className={`px-3 py-3 text-right text-xs ${data.ganhoCambioTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.ganhoCambioTotalBRL)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {metrics.rf.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Renda Fixa (com cotação)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Ativo</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Setor</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Qtd</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Preço</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody>
                {metrics.rf.map((p) => (
                  <tr key={p.ticker} className="border-b border-border/30 hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{p.ticker}</span>
                      <span className="text-zinc-600 text-xs ml-1">{p.moeda}</span>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs">{p.setor}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">{p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">
                      {p.precoAtual !== null ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{brl(p.valorAtualBRL)}</td>
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
