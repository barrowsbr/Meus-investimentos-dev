"use client";

import React, { useMemo } from "react";
import { Landmark, PiggyBank, TrendingUp, Globe } from "lucide-react";
import { useSheetData, usePortfolio } from "@/lib/hooks";
import { toNumber, brl, currency, formatDate, compactBRL, pct } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";
import type { Position } from "@/lib/portfolio";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

export default function RendaFixaPage() {
  const transacoes = useSheetData("renda_fixa");
  const posicoes = useSheetData("fixa_aberta");
  const { data: portfolio, loading: portLoading } = usePortfolio();

  const loading = transacoes.loading || posicoes.loading || portLoading;

  const errors = [
    transacoes.error && `renda_fixa: ${transacoes.error}`,
    posicoes.error && `fixa_aberta: ${posicoes.error}`,
  ].filter((x): x is string => Boolean(x));

  // ── Posições RF de meus_ativos (SHV, BIL, etc.) ───────────────────────────
  const rfDeAtivos = useMemo((): Position[] => {
    if (!portfolio?.positions) return [];
    return portfolio.positions.filter((p: Position) => isRendaFixa(p.setor));
  }, [portfolio]);

  // ── Métricas ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const usdbrl = portfolio?.usdbrl ?? 5.7;
    const eurbrl = portfolio?.eurbrl ?? 6.4;

    const totalManualBRL = posicoes.data.reduce((sum: number, r) => {
      const val = toNumber(r["atual"] || r["valor_atual"] || r["saldo"] || r["valor atual"]) ?? 0;
      const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
      const fx = moeda === "USD" ? usdbrl : moeda === "EUR" ? eurbrl : 1;
      return sum + val * fx;
    }, 0);

    const totalAtivosBRL = rfDeAtivos.reduce((s: number, p: Position) => s + p.valorAtualBRL, 0);

    const totalCompras = transacoes.data.reduce((sum: number, r) => {
      const tipo = String(r["tipo"] || r["movimentacao"] || "").toLowerCase();
      if (tipo.includes("compra") || tipo.includes("aplica")) {
        return sum + Math.abs(toNumber(r["valor"]) ?? 0);
      }
      return sum;
    }, 0);

    const totalRF = totalManualBRL + totalAtivosBRL;
    const lucro = totalRF - totalCompras;
    const rent = totalCompras > 0 ? (lucro / totalCompras) * 100 : 0;

    return { totalManualBRL, totalAtivosBRL, totalRF, totalCompras, lucro, rent };
  }, [posicoes.data, transacoes.data, rfDeAtivos, portfolio]);

  // ── Colunas de posições manuais ───────────────────────────────────────────
  const posColumns = [
    {
      key: "ticker",
      label: "Título",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["ticker"] || row["ativo"] || "—"),
    },
    {
      key: "atual",
      label: "Valor Atual",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        currency(
          row["atual"] || row["valor_atual"] || row["saldo"] || row["valor atual"],
          String(row["moeda"] || "BRL")
        ),
    },
    {
      key: "tipo",
      label: "Tipo",
      render: (_v: unknown, row: Record<string, unknown>) => String(row["tipo"] || "—"),
    },
    {
      key: "moeda",
      label: "Moeda",
      render: (_v: unknown, row: Record<string, unknown>) => String(row["moeda"] || "BRL"),
    },
    {
      key: "data",
      label: "Atualizado",
      render: (_v: unknown, row: Record<string, unknown>) => formatDate(row["data"] || ""),
    },
  ];

  // ── Colunas de ativos RF (SHV/BIL) ────────────────────────────────────────
  const ativoRFCols = [
    { key: "ticker", label: "Ticker" },
    { key: "setor", label: "Setor" },
    {
      key: "quantidade",
      label: "Qtd",
      align: "right" as const,
      render: (v: unknown) =>
        Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }),
    },
    {
      key: "precoAtual",
      label: "Preço",
      align: "right" as const,
      render: (v: unknown, row: Record<string, unknown>) =>
        v != null ? `${row["moeda"]} ${Number(v).toFixed(2)}` : "—",
    },
    {
      key: "valorAtualBRL",
      label: "Valor (R$)",
      align: "right" as const,
      render: (v: unknown) => compactBRL(Number(v)),
    },
    {
      key: "lucroBRL",
      label: "P&L",
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
  ];

  // ── Colunas de transações ──────────────────────────────────────────────────
  const txColumns = [
    {
      key: "compra",
      label: "Data",
      render: (_v: unknown, row: Record<string, unknown>) =>
        formatDate(row["compra"] || row["data"]),
    },
    {
      key: "ticker",
      label: "Título",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["ticker"] || row["ativo"] || "—"),
    },
    { key: "tipo", label: "Tipo" },
    {
      key: "valor",
      label: "Valor",
      align: "right" as const,
      render: (v: unknown, row: Record<string, unknown>) =>
        currency(v, String(row["moeda"] || "BRL")),
    },
    {
      key: "moeda",
      label: "Moeda",
      render: (_v: unknown, row: Record<string, unknown>) => String(row["moeda"] || "BRL"),
    },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title="Renda Fixa" description="Posições em RF nacional, internacional e caixa" />

      {errors.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {errors.map((err, i) => <ErrorAlert key={i} message={err} />)}
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <div className="animate-fade-in">
          <MetricCard
            label="Total RF"
            value={compactBRL(metrics.totalRF)}
            sub={`Manual ${compactBRL(metrics.totalManualBRL)} + Ativos ${compactBRL(metrics.totalAtivosBRL)}`}
            icon={<PiggyBank size={18} />}
            glowColor="#8b5cf6"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Total Investido"
            value={compactBRL(metrics.totalCompras)}
            sub={`${transacoes.data.length} transações`}
            icon={<Landmark size={18} />}
            glowColor="#d4a574"
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="P&L RF"
            value={brl(metrics.lucro)}
            icon={<TrendingUp size={18} />}
            trend={metrics.lucro >= 0 ? "up" : "down"}
            glowColor={metrics.lucro >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Rentabilidade"
            value={pct(metrics.rent)}
            sub="desde o investimento"
            icon={<Globe size={18} />}
            trend={metrics.rent >= 0 ? "up" : "down"}
            glowColor={metrics.rent >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
      </div>

      {/* Ativos RF de meus_ativos (SHV, BIL, etc.) */}
      {rfDeAtivos.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <h2 className="section-title mb-3">Renda Fixa Internacional (via carteira RV)</h2>
          <DataTable
            data={rfDeAtivos as unknown as Record<string, unknown>[]}
            columns={ativoRFCols}
          />
        </div>
      )}

      {/* Posições manuais */}
      {posicoes.data.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <h2 className="section-title mb-3">Posições Abertas</h2>
          <DataTable data={posicoes.data} columns={posColumns} />
        </div>
      )}

      {/* Transações */}
      <h2 className="section-title mb-3">Histórico de Transações</h2>
      <DataTable data={transacoes.data} columns={txColumns} />
    </>
  );
}
