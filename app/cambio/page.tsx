"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine,
} from "recharts";
import { ArrowLeftRight, DollarSign, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, usd, formatDate, compactBRL } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

export default function CambioPage() {
  const { data: portfolio, loading: portLoading } = usePortfolio();
  const { data: rawData, loading: sheetLoading, error } = useSheetData("cambio");

  const loading = portLoading || sheetLoading;

  const fxHistory = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    return rawData
      .map((r) => {
        const data = String(r["data"] ?? "");
        const taxa = toNumber(r["taxa"] || r["vet"]) ?? 0;
        const moedaDest = String(r["moeda_destino"] || r["moeda destino"] || "USD").toUpperCase();
        if (moedaDest !== "USD" || taxa === 0) return null;
        return { data, taxa };
      })
      .filter(Boolean) as { data: string; taxa: number }[];
  }, [rawData]);

  const pmVsSpot = useMemo(() => {
    if (!portfolio?.cambio?.pmDolar || !portfolio?.usdbrl) return 0;
    return ((portfolio.usdbrl / portfolio.cambio.pmDolar - 1) * 100);
  }, [portfolio]);

  const columns = [
    { key: "data", label: "Data", render: (v: unknown) => formatDate(v) },
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
      label: "Enviado",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        brl(row["valor_origem"] || row["valor entrada"] || row["valor_entrada"]),
    },
    {
      key: "valor_destino",
      label: "Recebido",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        usd(row["valor_destino"] || row["valor saída"] || row["valor_saida"] || row["valor saida"]),
    },
    {
      key: "taxa",
      label: "Taxa/VET",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) => {
        const t = toNumber(row["taxa"] || row["vet"]);
        return t ? `R$ ${t.toFixed(4)}` : "—";
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
  if (error) return <ErrorAlert message={error} tab="cambio" />;

  const cambio = portfolio?.cambio;
  const ptax = portfolio?.ptax;
  const spot = portfolio?.usdbrl ?? 0;

  return (
    <>
      <PageHeader
        title="Câmbio"
        description="Preço médio do dólar, PTAX e análise cambial"
      />

      {cambio && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            <MetricCard
              label="PM Dólar"
              value={`R$ ${cambio.pmDolar.toFixed(4)}`}
              sub={`${cambio.operacoes} operações`}
              icon={<DollarSign size={18} />}
              glowColor="#d4a574"
            />
            <MetricCard
              label="Spot Atual"
              value={`R$ ${spot.toFixed(4)}`}
              sub={`${pmVsSpot >= 0 ? "+" : ""}${pmVsSpot.toFixed(1)}% vs PM`}
              icon={<ArrowLeftRight size={18} />}
              trend={pmVsSpot >= 0 ? "up" : "down"}
              glowColor="#3b82f6"
            />
            <MetricCard
              label="Ganho Cambial"
              value={brl(cambio.ganhoCambialUSD_BRL)}
              sub={`Sobre $${cambio.totalRecebidoUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
              icon={cambio.ganhoCambialUSD_BRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
              trend={cambio.ganhoCambialUSD_BRL >= 0 ? "up" : "down"}
              glowColor={cambio.ganhoCambialUSD_BRL >= 0 ? "#4ade80" : "#f87171"}
            />
            <MetricCard
              label={ptax ? `PTAX (${ptax.data.substring(5)})` : "PTAX"}
              value={ptax ? `R$ ${ptax.USDBRL.toFixed(4)}` : "—"}
              sub={ptax ? `Diferença: R$ ${(spot - ptax.USDBRL).toFixed(4)}` : "Sem dados PTAX"}
              icon={<Scale size={18} />}
              glowColor="#8b5cf6"
            />
          </div>

          {/* Comparison Bar */}
          <div className="glass-card p-5 mb-6">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">Comparativo de Taxas</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <span className="text-zinc-500 text-xs block mb-1">PM Dólar</span>
                <div className="h-2 bg-accent/30 rounded-full mb-2">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min((cambio.pmDolar / Math.max(spot, cambio.pmDolar, ptax?.USDBRL ?? 0)) * 100, 100)}%` }} />
                </div>
                <span className="text-lg font-bold text-accent">R$ {cambio.pmDolar.toFixed(2)}</span>
              </div>
              <div className="text-center">
                <span className="text-zinc-500 text-xs block mb-1">Spot</span>
                <div className="h-2 bg-blue-500/30 rounded-full mb-2">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((spot / Math.max(spot, cambio.pmDolar, ptax?.USDBRL ?? 0)) * 100, 100)}%` }} />
                </div>
                <span className="text-lg font-bold text-blue-400">R$ {spot.toFixed(2)}</span>
              </div>
              <div className="text-center">
                <span className="text-zinc-500 text-xs block mb-1">PTAX</span>
                <div className="h-2 bg-purple-500/30 rounded-full mb-2">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: ptax ? `${Math.min((ptax.USDBRL / Math.max(spot, cambio.pmDolar, ptax.USDBRL)) * 100, 100)}%` : "0%" }} />
                </div>
                <span className="text-lg font-bold text-purple-400">{ptax ? `R$ ${ptax.USDBRL.toFixed(2)}` : "—"}</span>
              </div>
            </div>
          </div>

          {/* FX History Chart */}
          {fxHistory.length > 1 && (
            <div className="glass-card p-5 mb-6">
              <h2 className="text-sm font-medium text-zinc-400 mb-4">Histórico de Taxas (VET)</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={fxHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="data" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatDate(v).substring(0, 5)} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa", fontSize: 12 }}
                    formatter={(v: number) => [`R$ ${v.toFixed(4)}`, "VET"]}
                    labelFormatter={(l) => formatDate(l)}
                  />
                  <ReferenceLine y={cambio.pmDolar} stroke="#d4a574" strokeDasharray="5 5" label={{ value: `PM ${cambio.pmDolar.toFixed(2)}`, fill: "#d4a574", fontSize: 10 }} />
                  <Line type="monotone" dataKey="taxa" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary */}
          <div className="glass-card p-5 mb-6">
            <h2 className="text-sm font-medium text-zinc-400 mb-3">Resumo</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-zinc-500 text-xs block">Total Enviado (BRL)</span>
                <span className="text-zinc-100 font-bold">{compactBRL(cambio.totalEnviadoBRL)}</span>
              </div>
              <div>
                <span className="text-zinc-500 text-xs block">Total Recebido (USD)</span>
                <span className="text-zinc-100 font-bold">$ {cambio.totalRecebidoUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="text-zinc-500 text-xs block">PM Euro</span>
                <span className="text-zinc-100 font-bold">R$ {cambio.pmEuro.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-zinc-500 text-xs block">Valor USD Hoje</span>
                <span className="text-zinc-100 font-bold">{brl(cambio.totalRecebidoUSD * spot)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <h2 className="text-sm font-medium text-zinc-400 mb-3">Histórico de Operações</h2>
      <DataTable data={rawData} columns={columns} />
    </>
  );
}
