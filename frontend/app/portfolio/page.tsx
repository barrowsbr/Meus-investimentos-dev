"use client";
import { usePortfolioSnapshot } from "@/lib/hooks";
import MetricCard from "@/components/ui/MetricCard";
import DataTable from "@/components/ui/DataTable";
import type { Position } from "@/lib/api";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNative(n: number, moeda: string) {
  const currencies: Record<string, string> = { BRL: "BRL", USD: "USD", EUR: "EUR" };
  const currency = currencies[moeda.toUpperCase()] ?? "BRL";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function MoedaBadge({ moeda }: { moeda: string }) {
  if (moeda.toUpperCase() === "BRL") return null;
  return (
    <span className="ml-1 px-1 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 uppercase">
      {moeda}
    </span>
  );
}

export default function PortfolioPage() {
  const { data: snap, loading } = usePortfolioSnapshot();

  // Derive summary from snapshot — one single API call
  const positions = snap?.positions ?? [];
  const rvTotal = snap?.rv_total_brl ?? positions.reduce((s, p) => s + (p.market_value_brl ?? p.market_value), 0);
  const rfTotal = snap?.rf_total ?? 0;
  const patrimonio = rvTotal + rfTotal;
  const dayPnlR = snap?.day_pnl_r_brl ?? 0;
  const prevTotal = rvTotal - dayPnlR;
  const dayPnlPct = prevTotal > 0 ? (dayPnlR / prevTotal) * 100 : 0;

  // Sort positions by BRL market value descending
  const sortedPositions = [...positions].sort(
    (a, b) => (b.market_value_brl ?? b.market_value) - (a.market_value_brl ?? a.market_value)
  );

  const positionColumns = [
    {
      key: "ticker",
      header: "Ticker",
      render: (r: Position) => (
        <span className="font-semibold text-slate-100 flex items-center gap-1">
          {r.ticker}
          <MoedaBadge moeda={r.moeda} />
        </span>
      ),
    },
    {
      key: "setor",
      header: "Setor",
      render: (r: Position) => <span className="text-slate-400 text-xs">{r.setor}</span>,
    },
    {
      key: "qty",
      header: "Qtd",
      align: "right" as const,
      render: (r: Position) => r.qty.toLocaleString("pt-BR"),
    },
    {
      key: "pm",
      header: "P.M.",
      align: "right" as const,
      render: (r: Position) => (
        <span className="text-slate-300">
          {fmtNative(r.pm, r.moeda)}
        </span>
      ),
    },
    {
      key: "current_price",
      header: "Preço",
      align: "right" as const,
      render: (r: Position) =>
        r.current_price ? (
          <span>{fmtNative(r.current_price, r.moeda)}</span>
        ) : (
          <span className="text-slate-500">—</span>
        ),
    },
    {
      key: "market_value_brl",
      header: "Valor (BRL)",
      align: "right" as const,
      render: (r: Position) => (
        <span className="font-medium">
          {fmtBRL(r.market_value_brl ?? r.market_value)}
        </span>
      ),
    },
    {
      key: "day_pnl_pct",
      header: "P&L Dia",
      align: "right" as const,
      render: (r: Position) => (
        <span
          className={
            r.day_pnl_pct > 0
              ? "text-emerald-400"
              : r.day_pnl_pct < 0
              ? "text-red-400"
              : "text-slate-400"
          }
        >
          {pct(r.day_pnl_pct)}
        </span>
      ),
    },
    {
      key: "total_pnl_pct",
      header: "P&L Total",
      align: "right" as const,
      render: (r: Position) => (
        <div>
          <span
            className={
              r.total_pnl_pct > 0
                ? "text-emerald-400"
                : r.total_pnl_pct < 0
                ? "text-red-400"
                : "text-slate-400"
            }
          >
            {pct(r.total_pnl_pct)}
          </span>
          <div className="text-xs text-slate-500">
            {fmtBRL(r.total_pnl_r_brl ?? r.total_pnl_r)}
          </div>
        </div>
      ),
    },
  ];

  const rfColumns = snap?.rf_positions?.length
    ? Object.keys(snap.rf_positions[0]).map((k) => ({ key: k, header: k }))
    : [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-50">Investimentos</h1>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Patrimônio Total"
          value={snap ? fmtBRL(patrimonio) : "—"}
          loading={loading}
        />
        <MetricCard
          label="Renda Variável"
          value={snap ? fmtBRL(rvTotal) : "—"}
          loading={loading}
        />
        <MetricCard
          label="Renda Fixa"
          value={snap ? fmtBRL(rfTotal) : "—"}
          loading={loading}
        />
        <MetricCard
          label="P&L Hoje"
          value={snap ? fmtBRL(dayPnlR) : "—"}
          delta={snap ? dayPnlPct : undefined}
          deltaLabel="no dia"
          loading={loading}
        />
      </div>

      {/* FX Rates */}
      {snap?.fx_rates && Object.keys(snap.fx_rates).filter((k) => k !== "BRL").length > 0 && (
        <div className="flex gap-4 text-xs text-slate-500">
          {Object.entries(snap.fx_rates)
            .filter(([k]) => k !== "BRL")
            .map(([k, v]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="text-slate-400">{k}/BRL</span>
                <span className="font-medium text-slate-300">{fmtBRL(v as number).replace("R$", "").trim()}</span>
              </span>
            ))}
        </div>
      )}

      {/* Top Gainers / Losers */}
      {snap && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-wider">
              Top Altas
            </h3>
            {snap.top_gainers.map((p) => (
              <div key={p.ticker} className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="font-medium flex items-center gap-1">
                  {p.ticker}
                  <MoedaBadge moeda={p.moeda} />
                </span>
                <div className="text-right">
                  <div className="text-emerald-400 font-semibold">+{p.day_pnl_pct.toFixed(2)}%</div>
                  <div className="text-xs text-emerald-500/70">
                    +{fmtBRL(p.day_pnl_r_brl ?? p.day_pnl_r)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-red-400 mb-3 uppercase tracking-wider">
              Top Quedas
            </h3>
            {snap.top_losers.map((p) => (
              <div key={p.ticker} className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="font-medium flex items-center gap-1">
                  {p.ticker}
                  <MoedaBadge moeda={p.moeda} />
                </span>
                <div className="text-right">
                  <div className="text-red-400 font-semibold">{p.day_pnl_pct.toFixed(2)}%</div>
                  <div className="text-xs text-red-500/70">
                    {fmtBRL(p.day_pnl_r_brl ?? p.day_pnl_r)}
                  </div>
                </div>
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
          data={sortedPositions as unknown as Record<string, unknown>[]}
          loading={loading}
          emptyMessage="Nenhuma posição aberta"
        />
        {snap && (
          <p className="text-xs text-slate-500 mt-3 text-right">
            Atualizado às {snap.computed_at}
          </p>
        )}
      </div>

      {/* Renda Fixa */}
      {snap?.rf_positions && snap.rf_positions.length > 0 && (
        <div className="bg-[#0f1729]/60 border border-white/[0.07] rounded-xl p-4">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Renda Fixa</h2>
          <DataTable
            columns={rfColumns}
            data={snap.rf_positions as unknown as Record<string, unknown>[]}
          />
        </div>
      )}
    </div>
  );
}
