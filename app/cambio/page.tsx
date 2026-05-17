"use client";

import { useMemo } from "react";
import { ArrowLeftRight, DollarSign } from "lucide-react";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, usd, formatDate } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function CambioPage() {
  const { data, loading } = useSheetData("cambio");

  const metrics = useMemo(() => {
    let totalOrigem = 0;
    let totalDestino = 0;

    data.forEach((r) => {
      totalOrigem += Math.abs(toNumber(r["valor_origem"] || r["valor entrada"] || r["valor_entrada"]) || 0);
      totalDestino += Math.abs(toNumber(r["valor_destino"] || r["valor saída"] || r["valor_saida"]) || 0);
    });

    return { totalOrigem, totalDestino };
  }, [data]);

  const columns = [
    {
      key: "data",
      label: "Data",
      render: (v: unknown) => formatDate(v),
    },
    {
      key: "moeda_origem",
      label: "De",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["moeda_origem"] || row["moeda origem"] || "—"),
    },
    {
      key: "moeda_destino",
      label: "Para",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["moeda_destino"] || row["moeda destino"] || "—"),
    },
    {
      key: "valor_origem",
      label: "Valor Enviado",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        brl(row["valor_origem"] || row["valor entrada"] || row["valor_entrada"]),
    },
    {
      key: "valor_destino",
      label: "Valor Recebido",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        usd(row["valor_destino"] || row["valor saída"] || row["valor_saida"]),
    },
    {
      key: "taxa",
      label: "Taxa/VET",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) => {
        const t = toNumber(row["taxa"] || row["vet"]);
        return t ? t.toFixed(4) : "—";
      },
    },
    {
      key: "corretora",
      label: "Instituição",
      render: (_v: unknown, row: Record<string, unknown>) =>
        String(row["corretora"] || row["corretora destino"] || row["instituição"] || "—"),
    },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader
        title="Câmbio"
        description="Operações de câmbio realizadas"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard
          label="Total Enviado (BRL)"
          value={brl(metrics.totalOrigem)}
          sub={`${data.length} operações`}
          icon={<DollarSign size={18} />}
        />
        <MetricCard
          label="Total Recebido (USD)"
          value={usd(metrics.totalDestino)}
          icon={<ArrowLeftRight size={18} />}
        />
      </div>

      <DataTable data={data} columns={columns} />
    </>
  );
}
