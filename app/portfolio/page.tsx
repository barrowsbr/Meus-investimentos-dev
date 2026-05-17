"use client";

import { useMemo } from "react";
import { Briefcase, TrendingUp, TrendingDown } from "lucide-react";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, currency, formatDate } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

export default function PortfolioPage() {
  const { data, loading, error } = useSheetData("meus_ativos");

  const metrics = useMemo(() => {
    let compras = 0;
    let vendas = 0;
    const corretoras = new Set<string>();

    data.forEach((r) => {
      const tipo = String(r["tipo de transação"] || r["tipo_de_transacao"] || "").toLowerCase();
      const val = Math.abs(toNumber(r["valor líquido"] || r["valor_liquido"] || r["valor bruto"] || r["valor_bruto"]) || 0);
      const corretora = String(r["corretora"] || "");
      if (corretora) corretoras.add(corretora);

      if (tipo.includes("compra") || tipo.includes("buy")) compras += val;
      else if (tipo.includes("venda") || tipo.includes("sell")) vendas += val;
    });

    return { compras, vendas, corretoras: corretoras.size };
  }, [data]);

  const columns = [
    { key: "data", label: "Data", render: (v: unknown) => formatDate(v) },
    {
      key: "símbolo",
      label: "Ticker",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["símbolo"] || row["simbolo"] || row["ticker"] || "—").toUpperCase(),
    },
    {
      key: "tipo de transação",
      label: "Tipo",
      render: (_v: unknown, row: Record<string, unknown>) => {
        const tipo = String(row["tipo de transação"] || row["tipo_de_transacao"] || "");
        const isCompra = tipo.toLowerCase().includes("compra") || tipo.toLowerCase().includes("buy");
        return (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isCompra ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
            }`}
          >
            {tipo}
          </span>
        );
      },
    },
    {
      key: "quantidade",
      label: "Qtd",
      align: "right" as const,
      render: (v: unknown) => toNumber(v)?.toLocaleString("pt-BR") ?? "—",
    },
    {
      key: "preço",
      label: "Preço",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        currency(row["preço"] || row["preco"], String(row["moeda"] || "BRL")),
    },
    {
      key: "valor líquido",
      label: "Total",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        currency(
          row["valor líquido"] || row["valor_liquido"] || row["valor bruto"] || row["valor_bruto"],
          String(row["moeda"] || "BRL")
        ),
    },
    { key: "moeda", label: "Moeda" },
    { key: "corretora", label: "Corretora" },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="meus_ativos" />;

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Todas as transações de ativos"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Total Compras"
          value={brl(metrics.compras)}
          icon={<TrendingUp size={18} />}
        />
        <MetricCard
          label="Total Vendas"
          value={brl(metrics.vendas)}
          icon={<TrendingDown size={18} />}
        />
        <MetricCard
          label="Corretoras"
          value={String(metrics.corretoras)}
          icon={<Briefcase size={18} />}
        />
      </div>

      <DataTable data={data} columns={columns} />
    </>
  );
}
