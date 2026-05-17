"use client";

import { useMemo } from "react";
import { Landmark, PiggyBank } from "lucide-react";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, currency, formatDate } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function RendaFixaPage() {
  const transacoes = useSheetData("renda_fixa");
  const posicoes = useSheetData("fixa_aberta");

  const loading = transacoes.loading || posicoes.loading;

  const metrics = useMemo(() => {
    const totalPosicao = posicoes.data.reduce((sum, r) => {
      return sum + (toNumber(r["atual"] || r["valor_atual"] || r["saldo"] || r["valor atual"]) || 0);
    }, 0);

    const totalCompras = transacoes.data.reduce((sum, r) => {
      const tipo = String(r["tipo"] || r["movimentacao"] || "").toLowerCase();
      if (tipo.includes("compra") || tipo.includes("aplica")) {
        return sum + Math.abs(toNumber(r["valor"]) || 0);
      }
      return sum;
    }, 0);

    return { totalPosicao, totalCompras };
  }, [transacoes.data, posicoes.data]);

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
        currency(row["atual"] || row["valor_atual"] || row["saldo"] || row["valor atual"], String(row["moeda"] || "BRL")),
    },
    {
      key: "tipo",
      label: "Tipo",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["tipo"] || "—"),
    },
    {
      key: "moeda",
      label: "Moeda",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["moeda"] || "BRL"),
    },
  ];

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
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["moeda"] || "BRL"),
    },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader
        title="Renda Fixa"
        description="Posições e transações de renda fixa"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard
          label="Posição Atual"
          value={brl(metrics.totalPosicao)}
          sub={`${posicoes.data.length} títulos`}
          icon={<PiggyBank size={18} />}
        />
        <MetricCard
          label="Total Investido"
          value={brl(metrics.totalCompras)}
          sub={`${transacoes.data.length} transações`}
          icon={<Landmark size={18} />}
        />
      </div>

      {posicoes.data.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">
            Posições Abertas
          </h2>
          <DataTable data={posicoes.data} columns={posColumns} />
        </div>
      )}

      <h2 className="text-sm font-medium text-zinc-400 mb-3">
        Histórico de Transações
      </h2>
      <DataTable data={transacoes.data} columns={txColumns} />
    </>
  );
}
