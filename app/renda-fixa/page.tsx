"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Landmark, PiggyBank, TrendingUp, Globe, Zap } from "lucide-react";
import { useSheetData, usePortfolio } from "@/lib/hooks";
import { toNumber, brl, currency, formatDate, compactBRL, pct } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";
import type { Position } from "@/lib/portfolio";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface RFPosicao {
  ticker: string;
  moeda: string;
  tipo: string;
  valor_original: number;
  valor_capitalizado: number;
  valor_brl: number;
  data_referencia: string | null;
  dias_passados: number;
  rendimento_estimado_pct: number;
}

export default function RendaFixaPage() {
  const transacoes = useSheetData("renda_fixa");
  const posicoes = useSheetData("fixa_aberta");
  const { data: portfolio, loading: portLoading } = usePortfolio();
  const [rfSelic, setRfSelic] = useState<{ totalBrl: number; posicoes: RFPosicao[] } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/renda-fixa/posicoes`)
      .then(r => r.json())
      .then(body => setRfSelic(body))
      .catch(() => {});
  }, []);

  const loading = transacoes.loading || posicoes.loading || portLoading;

  const errors = [
    transacoes.error && `renda_fixa: ${transacoes.error}`,
    posicoes.error && `fixa_aberta: ${posicoes.error}`,
  ].filter((x): x is string => Boolean(x));

  // ── Posições RF de meus_ativos (SHV, BIL, etc.) ───────────────────────────
  const rfDeAtivos = useMemo((): Position[] => {
    if (!portfolio?.positions) return [];
    return portfolio.positions.filter((p: Position) => isRendaFixa(p.setor));
  }, [portfolio]);

  // ── Métricas ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalAtivosBRL = rfDeAtivos.reduce((s: number, p: Position) => s + p.valorAtualBRL, 0);
    // Prefer SELIC-capitalized total from API, fall back to raw sum
    const totalManualBRL = rfSelic?.totalBrl ?? posicoes.data.reduce((sum: number, r) => {
      const usdbrl = portfolio?.usdbrl ?? 5.7;
      const eurbrl = portfolio?.eurbrl ?? 6.4;
      const val = toNumber(r["atual"] || r["valor_atual"] || r["saldo"] || r["valor atual"]) ?? 0;
      const moeda = String(r["moeda"] ?? "BRL").toUpperCase();
      const fx = moeda === "USD" ? usdbrl : moeda === "EUR" ? eurbrl : 1;
      return sum + val * fx;
    }, 0);

    const totalCompras = transacoes.data.reduce((sum: number, r) => {
      const tipo = String(r["tipo"] || r["movimentacao"] || "").toLowerCase();
      if (tipo.includes("compra") || tipo.includes("aplica")) {
        return sum + Math.abs(toNumber(r["valor"]) ?? 0);
      }
      return sum;
    }, 0);

    const totalRF = totalManualBRL + totalAtivosBRL;
    const lucro = totalRF - totalCompras;
    const rent = totalCompras > 0 ? (lucro / totalCompras) * 100 : 0;

    return { totalManualBRL, totalAtivosBRL, totalRF, totalCompras, lucro, rent };
  }, [posicoes.data, transacoes.data, rfDeAtivos, portfolio, rfSelic]);

  // ── Colunas de posições manuais ───────────────────────────────────────────
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
        currency(
          row["atual"] || row["valor_atual"] || row["saldo"] || row["valor atual"],
          String(row["moeda"] || "BRL")
        ),
    },
    {
      key: "tipo",
      label: "Tipo",
      render: (_v: unknown, row: Record<string, unknown>) => String(row["tipo"] || "—"),
    },
    {
      key: "moeda",
      label: "Moeda",
      render: (_v: unknown, row: Record<string, unknown>) => String(row["moeda"] || "BRL"),
    },
    {
      key: "data",
      label: "Atualizado",
      render: (_v: unknown, row: Record<string, unknown>) => formatDate(row["data"] || ""),
    },
  ];

  // ── Colunas de ativos RF (SHV/BIL) ────────────────────────────────────────
  const ativoRFCols = [
    { key: "ticker", label: "Ticker" },
    { key: "setor", label: "Setor" },
    {
      key: "quantidade",
      label: "Qtd",
      align: "right" as const,
      render: (v: unknown) =>
        Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 }),
    },
    {
      key: "precoAtual",
      label: "Preço",
      align: "right" as const,
      render: (v: unknown, row: Record<string, unknown>) =>
        v != null ? `${row["moeda"]} ${Number(v).toFixed(2)}` : "—",
    },
    {
      key: "valorAtualBRL",
      label: "Valor (R$)",
      align: "right" as const,
      render: (v: unknown) => compactBRL(Number(v)),
    },
    {
      key: "lucroBRL",
      label: "P&L",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        const n = Number(v);
        if (!isFinite(n)) return "—";
        return React.createElement(
          "span",
          { className: n >= 0 ? "text-positive" : "text-negative" },
          brl(n)
        );
      },
    },
    {
      key: "lucroPct",
      label: "%",
      align: "right" as const,
      render: (v: unknown): React.ReactNode => {
        const n = Number(v);
        if (!isFinite(n)) return "—";
        return React.createElement(
          "span",
          { className: n >= 0 ? "text-positive" : "text-negative" },
          pct(n)
        );
      },
    },
  ];

  // ── Colunas de transações ──────────────────────────────────────────────────
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
      render: (_v: unknown, row: Record<string, unknown>) => String(row["moeda"] || "BRL"),
    },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <PageHeader title="Renda Fixa" description="Posições em RF nacional, internacional e caixa" />

      {errors.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {errors.map((err, i) => <ErrorAlert key={i} message={err} />)}
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <div className="animate-fade-in">
          <MetricCard
            label="Total RF"
            value={compactBRL(metrics.totalRF)}
            sub={`Manual ${compactBRL(metrics.totalManualBRL)} + Ativos ${compactBRL(metrics.totalAtivosBRL)}`}
            icon={<PiggyBank size={18} />}
           
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Total Investido"
            value={compactBRL(metrics.totalCompras)}
            sub={`${transacoes.data.length} transações`}
            icon={<Landmark size={18} />}
           
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="P&L RF"
            value={brl(metrics.lucro)}
            icon={<TrendingUp size={18} />}
            trend={metrics.lucro >= 0 ? "up" : "down"}
            glowColor={metrics.lucro >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Rentabilidade"
            value={pct(metrics.rent)}
            sub="desde o investimento"
            icon={<Globe size={18} />}
            trend={metrics.rent >= 0 ? "up" : "down"}
            glowColor={metrics.rent >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
      </div>

      {/* Ativos RF de meus_ativos (SHV, BIL, etc.) */}
      {rfDeAtivos.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <h2 className="section-title mb-3">Renda Fixa Internacional (via carteira RV)</h2>
          <DataTable
            data={rfDeAtivos as unknown as Record<string, unknown>[]}
            columns={ativoRFCols}
          />
        </div>
      )}

      {/* Posições manuais — SELIC capitalizado */}
      {rfSelic && rfSelic.posicoes.length > 0 ? (
        <div className="mb-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="section-title">Posições Abertas</h2>
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-700/30">
              <Zap size={10} />
              SELIC capitalizado
            </span>
          </div>
          <div className="glass-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  {["Título", "Tipo", "Moeda", "Atualizado", "Valor Orig.", "Valor Capitalizado", "Rendimento Est."].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfSelic.posicoes.map((p, i) => (
                  <tr key={i} className="border-b border-border/10 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-zinc-200 font-medium text-xs">{p.ticker}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{p.tipo || "—"}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{p.moeda}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">
                      {p.data_referencia ? formatDate(p.data_referencia) : "—"}
                      {p.dias_passados > 0 && <span className="text-zinc-700 ml-1">({p.dias_passados}d)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-zinc-400">{compactBRL(p.valor_original)}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-200">{compactBRL(p.valor_capitalizado)}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-400">
                      +{p.rendimento_estimado_pct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/30 bg-white/[0.02]">
                  <td colSpan={5} className="px-4 py-2.5 text-xs font-bold text-zinc-400">Total capitalizado</td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-zinc-100">{compactBRL(rfSelic.totalBrl)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : posicoes.data.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <h2 className="section-title mb-3">Posições Abertas</h2>
          <DataTable data={posicoes.data} columns={posColumns} />
        </div>
      )}

      {/* Transações */}
      <h2 className="section-title mb-3">Histórico de Transações</h2>
      <DataTable data={transacoes.data} columns={txColumns} />
    </>
  );
}
