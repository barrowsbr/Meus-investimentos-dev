"use client";
import { usePortfolioSummary, usePositions, useFixedIncome } from "@/lib/hooks";
import MetricCard from "@/components/ui/MetricCard";
import DataTable from "@/components/ui/DataTable";
import type { Position } from "@/lib/api";

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("pt-BR", {
    style: "currency", currency: "BRL",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default function PortfolioPage() {
  const { data: summary, loading: sumLoading }   = usePortfolioSummary();
  const { data: positions, loading: posLoading } = usePositions();
  const { data: rf }                             = useFixedIncome();

  const positionColumns = [
    { key: "ticker",       header: "Ticker",       render: (r: Position) => <span className="font-semibold text-slate-100">{r.ticker}</span> },
    { key: "setor",        header: "Setor",        render: (r: Position) => <span className="text-slate-400 text-xs">{r.setor}</span> },
    { key: "qty",          header: "Qtd",          align: "right" as const, render: (r: Position) => r.qty.toLocaleString("pt-BR") },
    { key: "pm",           header: "P.M.",         align: "right" as const, render: (r: Position) => fmt(r.pm) },
    { key: "current_price",header: "Preço Atual",  align: "right" as const, render: (r: Position) => r.current_price ? fmt(r.current_price) : "—" },
    { key: "market_value", header: "Market Value", align: "right" as const, render: (r: Position) => fmt(r.market_value) },
    {
      key: "day_pnl_pct",
      header: "P&L Dia",
      align: "right" as const,
      render: (r: Position) => (
        <span className={r.day_pnl_pct > 0 ? "text-emerald-400" : r.day_pnl_pct < 0 ? "text-red-400" : "text-slate-400"}>
          {pct(r.day_pnl_pct)}
        </span>
      ),
    },
    {
      key: "total_pnl_pct",
      header: "P&L Total",
      align: "right" as const,
      render: (r: Position) => (
        <span className={r.total_pnl_pct > 0 ? "text-emerald-400" : r.total_pnl_pct < 0 ? "text-red-400" : "text-slate-400"}>
          {pct(r.total_pnl_pct)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-50">Investimentos</h1>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Patrimônio Total"
          value={summary ? fmt(summary.patrimonio_total) : "—"}
          loading={sumLoading}
        />
        <MetricCard
          label="Renda Variável"
          value={summary ? fmt(summary.rv_total) : "—"}
        />
        <MetricCard
          label="Renda Fixa"
          value={summary ? fmt(summary.rf_total) : "—"}
        />
        <MetricCard
          label="P&L Hoje"
          value={summary ? fmt(summary.day_pnl_r) : "—"}
          delta={summary?.day_pnl_pct}
          deltaLabel="no dia"
        />
      </div>

      {/* Top Gainers / Losers */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-wider">Top Altas</h3>
            {summary.top_gainers.map((p) => (
              <div key={p.ticker} className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="font-medium">{p.ticker}</span>
                <span className="text-emerald-400 font-semibold">+{p.day_pnl_pct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
          <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-red-400 mb-3 uppercase tracking-wider">Top Quedas</h3>
            {summary.top_losers.map((p) => (
              <div key={p.ticker} className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="font-medium">{p.ticker}</span>
                <span className="text-red-400 font-semibold">{p.day_pnl_pct.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de posições */}
      <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Posições Abertas</h2>
        <DataTable
          columns={positionColumns}
          data={(positions ?? []) as unknown as Record<string, unknown>[]}
          loading={posLoading}
          emptyMessage="Nenhuma posição aberta"
        />
        {summary && (
          <p className="text-xs text-slate-500 mt-3 text-right">
            Atualizado às {summary.computed_at}
          </p>
        )}
      </div>

      {/* Renda Fixa */}
      {rf && rf.length > 0 && (
        <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Renda Fixa</h2>
          <DataTable
            columns={Object.keys(rf[0]).map((k) => ({ key: k, header: k }))}
            data={rf as unknown as Record<string, unknown>[]}
          />
        </div>
      )}
    </div>
  );
}
