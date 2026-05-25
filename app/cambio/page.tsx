"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
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

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
            <div className="animate-fade-in">
              <MetricCard
                label="PM Dólar"
                value={`R$ ${cambio.pmDolar.toFixed(4)}`}
                sub={`${cambio.operacoes} operações`}
                icon={<DollarSign size={18} />}
                glowColor="#d4a574"
              />
            </div>
            <div className="animate-fade-in animate-delay-1">
              <MetricCard
                label="Spot Atual"
                value={`R$ ${spot.toFixed(4)}`}
                sub={`${pmVsSpot >= 0 ? "+" : ""}${pmVsSpot.toFixed(1)}% vs PM`}
                icon={<ArrowLeftRight size={18} />}
                trend={pmVsSpot >= 0 ? "up" : "down"}
                glowColor="#3b82f6"
              />
            </div>
            <div className="animate-fade-in animate-delay-2">
              <MetricCard
                label="Ganho Cambial"
                value={brl(cambio.ganhoCambialUSD_BRL)}
                sub={`Sobre $${cambio.totalRecebidoUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                icon={cambio.ganhoCambialUSD_BRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                trend={cambio.ganhoCambialUSD_BRL >= 0 ? "up" : "down"}
                glowColor={cambio.ganhoCambialUSD_BRL >= 0 ? "#4ade80" : "#f87171"}
              />
            </div>
            <div className="animate-fade-in animate-delay-3">
              <MetricCard
                label={ptax ? `PTAX (${ptax.data.substring(5)})` : "PTAX"}
                value={ptax ? `R$ ${ptax.USDBRL.toFixed(4)}` : "—"}
                sub={ptax ? `Diferença: R$ ${(spot - ptax.USDBRL).toFixed(4)}` : "Sem dados PTAX"}
                icon={<Scale size={18} />}
                glowColor="#8b5cf6"
              />
            </div>
          </div>

          {/* Comparison Bars */}
          <div className="glass-card p-5 mb-6 animate-fade-in">
            <h2 className="section-title mb-5">Comparativo de Taxas</h2>
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: "PM Dólar", value: cambio.pmDolar, color: "#d4a574" },
                { label: "Spot", value: spot, color: "#3b82f6" },
                { label: "PTAX", value: ptax?.USDBRL ?? 0, color: "#8b5cf6" },
              ].map((item) => {
                const maxVal = Math.max(cambio.pmDolar, spot, ptax?.USDBRL ?? 0);
                const pctWidth = maxVal > 0 ? (item.value / maxVal) * 100 : 0;
                return (
                  <div key={item.label} className="text-center">
                    <span className="stat-label block mb-2">{item.label}</span>
                    <div className="h-2 rounded-full mb-3" style={{ backgroundColor: `${item.color}20` }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(pctWidth, 100)}%`, backgroundColor: item.color }} />
                    </div>
                    <span className="text-xl font-bold" style={{ color: item.color }}>
                      {item.value > 0 ? `R$ ${item.value.toFixed(2)}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FX History Chart */}
          {fxHistory.length > 1 && (
            <div className="glass-card p-5 mb-6 animate-fade-in">
              <h2 className="section-title mb-4">Histórico de Taxas (VET)</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={fxHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                  <XAxis dataKey="data" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatDate(v).substring(0, 5)} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`R$ ${v.toFixed(4)}`, "VET"]} labelFormatter={(l) => formatDate(l)} />
                  <ReferenceLine y={cambio.pmDolar} stroke="#d4a574" strokeDasharray="5 5" label={{ value: `PM ${cambio.pmDolar.toFixed(2)}`, fill: "#d4a574", fontSize: 10, position: "right" }} />
                  <Line type="monotone" dataKey="taxa" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#3b82f6" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary */}
          <div className="glass-card p-5 mb-6 animate-fade-in">
            <h2 className="section-title mb-4">Resumo</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <div>
                <span className="stat-label block mb-1">Total Enviado (BRL)</span>
                <span className="stat-value">{compactBRL(cambio.totalEnviadoBRL)}</span>
              </div>
              <div>
                <span className="stat-label block mb-1">Total Recebido (USD)</span>
                <span className="stat-value">$ {cambio.totalRecebidoUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="stat-label block mb-1">PM Euro</span>
                <span className="stat-value">R$ {cambio.pmEuro.toFixed(4)}</span>
              </div>
              <div>
                <span className="stat-label block mb-1">Valor USD Hoje</span>
                <span className="stat-value">{brl(cambio.totalRecebidoUSD * spot)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <h2 className="section-title mb-3">Histórico de Operações</h2>
      <DataTable data={rawData} columns={columns} />
    </>
  );
}
