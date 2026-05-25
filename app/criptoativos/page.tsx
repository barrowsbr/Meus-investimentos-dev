"use client";

import React from "react";
import { Bitcoin, TrendingUp, TrendingDown, DollarSign, Coins } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import type { Position } from "@/lib/portfolio";

export default function CriptoativosPage() {
  const { data: portfolio, loading, error } = usePortfolio();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  const cripto: Position[] = (portfolio?.positions ?? []).filter(
    (p: Position) => p.setor === "Cripto"
  );

  if (cripto.length === 0) {
    return (
      <>
        <PageHeader title="Criptoativos" description="Posições em Bitcoin, Ethereum e outros tokens" />
        <div className="glass-card p-8 text-center">
          <Bitcoin size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Nenhum criptoativo encontrado na carteira.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Adicione transações com tickers BTC, ETH, SOL, etc. na aba <code>meus_ativos</code>.
          </p>
        </div>
      </>
    );
  }

  const totalBRL = cripto.reduce((s, p) => s + p.valorAtualBRL, 0);
  const custoBRL = cripto.reduce((s, p) => s + p.custoTotalBRL, 0);
  const lucroBRL = totalBRL - custoBRL;
  const lucroTotal = cripto.reduce((s, p) => s + (p.lucroBRL ?? 0), 0);
  const lucroPositivos = lucroBRL >= 0;

  const columns = [
    { key: "ticker", label: "Ticker" },
    {
      key: "quantidade",
      label: "Qtd",
      align: "right" as const,
      render: (v: unknown) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 }),
    },
    {
      key: "custoMedio",
      label: "PM (USD)",
      align: "right" as const,
      render: (v: unknown) => `$ ${Number(v).toFixed(2)}`,
    },
    {
      key: "precoAtual",
      label: "Preço Atual",
      align: "right" as const,
      render: (v: unknown) => v != null ? `$ ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—",
    },
    {
      key: "valorAtualBRL",
      label: "Valor (R$)",
      align: "right" as const,
      render: (v: unknown) => compactBRL(Number(v)),
    },
    {
      key: "lucroBRL",
      label: "P&L (R$)",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        const n = Number(v);
        if (!isFinite(n)) return "—";
        return React.createElement(
          "span",
          { className: n >= 0 ? "text-positive" : "text-negative" },
          brl(n)
        );
      },
    },
    {
      key: "lucroPct",
      label: "%",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        const n = Number(v);
        if (!isFinite(n)) return "—";
        return React.createElement(
          "span",
          { className: n >= 0 ? "text-positive" : "text-negative" },
          pct(n)
        );
      },
    },
    {
      key: "dayChangePct",
      label: "Dia",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        if (v == null) return "—";
        const n = Number(v);
        return React.createElement(
          "span",
          { className: n >= 0 ? "text-positive" : "text-negative" },
          pct(n)
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title="Criptoativos" description="Posições em Bitcoin, Ethereum e outros tokens" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="animate-fade-in">
          <MetricCard
            label="Total Cripto"
            value={compactBRL(totalBRL)}
            sub={`${cripto.length} ativo${cripto.length > 1 ? "s" : ""}`}
            icon={<Bitcoin size={18} />}
            glowColor="#f97316"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Custo Total"
            value={compactBRL(custoBRL)}
            icon={<DollarSign size={18} />}
            glowColor="#d4a574"
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="P&L Total"
            value={brl(lucroTotal)}
            icon={lucroPositivos ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            trend={lucroPositivos ? "up" : "down"}
            glowColor={lucroPositivos ? "#4ade80" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Rentabilidade"
            value={custoBRL > 0 ? pct((lucroBRL / custoBRL) * 100) : "—"}
            icon={<Coins size={18} />}
            trend={lucroPositivos ? "up" : "down"}
            glowColor={lucroPositivos ? "#4ade80" : "#f87171"}
          />
        </div>
      </div>

      <div className="animate-fade-in">
        <DataTable
          data={cripto as unknown as Record<string, unknown>[]}
          columns={columns}
        />
      </div>
    </>
  );
}
