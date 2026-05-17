"use client";

import { useMemo, useState } from "react";
import { Wallet, CreditCard } from "lucide-react";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function FinancasPage() {
  const financas = useSheetData("financas");
  const pessoal = useSheetData("financas_pessoal");
  const [activeTab, setActiveTab] = useState<"financas" | "pessoal">(
    "financas"
  );

  const loading = financas.loading || pessoal.loading;

  const activeData = activeTab === "financas" ? financas.data : pessoal.data;

  const autoColumns = useMemo(() => {
    if (activeData.length === 0) return [];
    const keys = Object.keys(activeData[0]);
    return keys.map((key) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
      render: (v: unknown) => {
        const n = toNumber(v);
        if (n !== null && Math.abs(n) >= 10) return brl(n);
        return String(v ?? "—");
      },
    }));
  }, [activeData]);

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader
        title="Finanças"
        description="Controle financeiro pessoal"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard
          label="Registros Finanças"
          value={String(financas.data.length)}
          icon={<Wallet size={18} />}
        />
        <MetricCard
          label="Registros Pessoal"
          value={String(pessoal.data.length)}
          icon={<CreditCard size={18} />}
        />
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab("financas")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "financas"
              ? "bg-accent/15 text-accent"
              : "bg-white/5 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Finanças
        </button>
        <button
          onClick={() => setActiveTab("pessoal")}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "pessoal"
              ? "bg-accent/15 text-accent"
              : "bg-white/5 text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Pessoal
        </button>
      </div>

      <DataTable data={activeData} columns={autoColumns} />
    </>
  );
}
