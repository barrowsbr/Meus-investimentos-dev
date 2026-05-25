"use client";

import { useMemo, useState } from "react";
import { Wallet, CreditCard, RefreshCw } from "lucide-react";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

export default function FinancasPage() {
  const financas = useSheetData("financas");
  const pessoal = useSheetData("financas_pessoal");
  const [activeTab, setActiveTab] = useState<"financas" | "pessoal">("financas");

  const loading = financas.loading || pessoal.loading;
  const errors = [
    financas.error && `financas: ${financas.error}`,
    pessoal.error && `financas_pessoal: ${pessoal.error}`,
  ].filter(Boolean) as string[];

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

  const bothEmpty = financas.data.length === 0 && pessoal.data.length === 0;
  const allErrors = errors.length === 2;

  return (
    <>
      <PageHeader
        title="Finanças"
        description="Controle financeiro pessoal"
      />

      {errors.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {errors.map((err) => (
            <ErrorAlert key={err} message={err} />
          ))}
        </div>
      )}

      {allErrors && (
        <div className="glass-card p-6 text-center mb-6 animate-fade-in">
          <RefreshCw size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm mb-1">
            Não foi possível carregar os dados financeiros.
          </p>
          <p className="text-zinc-600 text-xs">
            Verifique se as abas &quot;financas&quot; e &quot;financas_pessoal&quot; existem na planilha
            e se os nomes estão corretos.
          </p>
        </div>
      )}

      {!allErrors && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-6">
            <div className="animate-fade-in">
              <MetricCard
                label="Registros Finanças"
                value={String(financas.data.length)}
                sub={financas.error ? "Erro ao carregar" : undefined}
                icon={<Wallet size={18} />}
               
              />
            </div>
            <div className="animate-fade-in animate-delay-1">
              <MetricCard
                label="Registros Pessoal"
                value={String(pessoal.data.length)}
                sub={pessoal.error ? "Erro ao carregar" : undefined}
                icon={<CreditCard size={18} />}
               
              />
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab("financas")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === "financas"
                  ? "bg-accent/12 text-accent shadow-[inset_0_0_20px_rgba(212,165,116,0.05)]"
                  : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              Finanças
              {financas.data.length > 0 && (
                <span className="ml-2 text-[10px] opacity-60">{financas.data.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("pessoal")}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === "pessoal"
                  ? "bg-accent/12 text-accent shadow-[inset_0_0_20px_rgba(212,165,116,0.05)]"
                  : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06]"
              }`}
            >
              Pessoal
              {pessoal.data.length > 0 && (
                <span className="ml-2 text-[10px] opacity-60">{pessoal.data.length}</span>
              )}
            </button>
          </div>

          {bothEmpty && !allErrors && (
            <div className="glass-card p-8 text-center text-zinc-600 text-sm">
              Nenhum dado encontrado nas abas de finanças.
            </div>
          )}

          {activeData.length > 0 && (
            <DataTable data={activeData} columns={autoColumns} />
          )}
        </>
      )}
    </>
  );
}
