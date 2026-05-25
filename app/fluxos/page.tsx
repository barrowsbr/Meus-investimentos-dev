"use client";

import { useState, useEffect, useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import MetricCard from "@/components/MetricCard";
import { brl, compactBRL } from "@/lib/format";
import { Banknote, TrendingUp, TrendingDown, ArrowLeftRight, Filter } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowEntry {
  date: string;
  amount: number;
  currency: string;
  flow_type: string;
  amount_brl: number;
  ticker: string | null;
  fx_rate: number | null;
  notes: string;
}

interface FluxosResponse {
  summary: {
    totalAportesBrl: number;
    totalDividendosBrl: number;
    totalTaxasBrl: number;
    porTipo: Record<string, number>;
    totalFluxos: number;
  };
  fluxos: FlowEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FLOW_LABELS: Record<string, string> = {
  compra_ativo:  "Compra",
  venda_ativo:   "Venda",
  dividendo:     "Dividendo",
  taxa:          "Taxa",
  conversao_fx:  "Câmbio FX",
  aporte_brl:    "Aporte BRL",
  entrada_rf:    "Entrada RF",
  saida_rf:      "Saída RF",
};

const FLOW_COLORS: Record<string, string> = {
  compra_ativo:  "#6366f1",
  venda_ativo:   "#f59e0b",
  dividendo:     "#34d399",
  taxa:          "#f87171",
  conversao_fx:  "#a78bfa",
  aporte_brl:    "#60a5fa",
  entrada_rf:    "#94a3b8",
  saida_rf:      "#f97316",
};

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const TIPO_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "compra_ativo", label: "Compras" },
  { value: "venda_ativo", label: "Vendas" },
  { value: "dividendo", label: "Dividendos" },
  { value: "taxa", label: "Taxas" },
  { value: "conversao_fx", label: "Câmbio FX" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FluxosPage() {
  const [data, setData] = useState<FluxosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoFilter, setTipoFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const url = tipoFilter
      ? `${API_URL}/api/fluxos?tipo=${tipoFilter}`
      : `${API_URL}/api/fluxos`;

    fetch(url)
      .then(r => r.json())
      .then(body => { if (!cancelled) setData(body); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tipoFilter]);

  const filtered = useMemo(() => {
    if (!data?.fluxos) return [];
    const q = search.toLowerCase();
    if (!q) return data.fluxos;
    return data.fluxos.filter(f =>
      f.ticker?.toLowerCase().includes(q) ||
      f.notes?.toLowerCase().includes(q) ||
      FLOW_LABELS[f.flow_type]?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const s = data?.summary;

  return (
    <>
      <PageHeader
        title="Fluxos de Caixa"
        description="Registro auditável de todas as entradas e saídas"
      />

      {/* Summary cards */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <MetricCard
            label="Total Aportes"
            value={compactBRL(s.totalAportesBrl)}
            icon={<TrendingUp size={18} />}
            glowColor="#6366f1"
          />
          <MetricCard
            label="Dividendos"
            value={compactBRL(s.totalDividendosBrl)}
            icon={<Banknote size={18} />}
            glowColor="#34d399"
          />
          <MetricCard
            label="Taxas Pagas"
            value={compactBRL(s.totalTaxasBrl)}
            icon={<TrendingDown size={18} />}
            glowColor="#f87171"
          />
          <MetricCard
            label="Total Fluxos"
            value={String(s.totalFluxos)}
            icon={<ArrowLeftRight size={18} />}
            glowColor="#d4a574"
          />
        </div>
      )}

      {/* Por tipo breakdown */}
      {s?.porTipo && Object.keys(s.porTipo).length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="section-title mb-4">Por Tipo de Fluxo</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(s.porTipo)
              .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
              .map(([tipo, valor]) => (
                <div
                  key={tipo}
                  className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2 text-sm"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: FLOW_COLORS[tipo] ?? "#71717a" }}
                  />
                  <span className="text-zinc-400">{FLOW_LABELS[tipo] ?? tipo}</span>
                  <span
                    className="font-semibold"
                    style={{ color: valor >= 0 ? "#f1f5f9" : "#f87171" }}
                  >
                    {compactBRL(valor)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex items-center gap-1.5 text-zinc-500">
          <Filter size={14} />
          <span className="text-xs">Filtrar:</span>
        </div>
        {TIPO_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setTipoFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tipoFilter === opt.value
                ? "bg-zinc-700 text-white"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar ticker, nota..."
          className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-zinc-900 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-48"
        />
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorAlert message={error} />}

      {!loading && !error && (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  {["Data", "Tipo", "Ticker", "Valor Orig.", "Valor BRL", "Notas"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 text-sm">
                      Nenhum fluxo encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((f, i) => (
                    <tr
                      key={i}
                      className="border-b border-border/10 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-2.5 text-zinc-400 text-xs">{formatDate(f.date)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{
                            background: `${FLOW_COLORS[f.flow_type] ?? "#71717a"}22`,
                            color: FLOW_COLORS[f.flow_type] ?? "#71717a",
                          }}
                        >
                          {FLOW_LABELS[f.flow_type] ?? f.flow_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                        {f.ticker || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <span style={{ color: f.amount >= 0 ? "#f1f5f9" : "#f87171" }}>
                          {f.amount >= 0 ? "+" : ""}{f.amount.toFixed(2)} {f.currency}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold">
                        <span style={{ color: f.amount_brl >= 0 ? "#f1f5f9" : "#f87171" }}>
                          {f.amount_brl >= 0 ? "+" : ""}{brl(f.amount_brl)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 text-xs max-w-48 truncate">
                        {f.notes || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border/20 text-xs text-zinc-600">
              {filtered.length} fluxo{filtered.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </>
  );
}
