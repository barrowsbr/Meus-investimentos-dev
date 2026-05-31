"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  PiggyBank, TrendingUp, TrendingDown,
  ChevronDown, ChevronUp, Wallet,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct, currency, formatDate } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";
import type { Position } from "@/lib/portfolio";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface RFOpenPos {
  ticker: string;
  moeda: string;
  atual: number;
  investido: number;
  lucro: number;
  rentabilidade: number;
  proventos: number;
  resultadoTotal: number;
  isCaixa: boolean;
}

interface RFClosedPos {
  ticker: string;
  moeda: string;
  compra: number;
  venda: number;
  imposto: number;
  lucro: number;
  rentabilidade: number;
  proventos: number;
  resultadoTotal: number;
}

interface RFTx {
  date: string;
  ticker: string;
  tipo: string;
  valor: number;
  moeda: string;
}

interface RFData {
  abertas: RFOpenPos[];
  caixa: RFOpenPos[];
  encerradas: RFClosedPos[];
  transacoes: RFTx[];
  totalAtual: number;
  totalCaixa: number;
  totalInvestidoAberto: number;
  lucroNaoRealizado: number;
  lucroRealizado: number;
  totalProventosRF: number;
  rentMedia: number;
  patrimonio: number;
}

type SortKey = "ticker" | "investido" | "atual" | "lucro" | "rentabilidade" | "resultadoTotal" | "compra" | "venda";
type SortDir = "asc" | "desc";

function sortBy<T extends Record<string, unknown>>(arr: T[], key: string, dir: SortDir): T[] {
  return [...arr].sort((a, b) => {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (typeof av === "string" && typeof bv === "string")
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

export default function RendaFixaPage() {
  const { data: portfolio, loading: portLoading } = usePortfolio();
  const [rfData, setRfData] = useState<RFData | null>(null);
  const [rfLoading, setRfLoading] = useState(true);
  const [rfError, setRfError] = useState<string | null>(null);
  const [sortKeyOpen, setSortKeyOpen] = useState<SortKey>("atual");
  const [sortDirOpen, setSortDirOpen] = useState<SortDir>("desc");
  const [sortKeyClosed, setSortKeyClosed] = useState<SortKey>("resultadoTotal");
  const [sortDirClosed, setSortDirClosed] = useState<SortDir>("desc");
  const [showClosed, setShowClosed] = useState(true);
  const [showTx, setShowTx] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/renda-fixa/posicoes`)
      .then(async r => {
        const body = await r.json();
        if (!r.ok || body.error) throw new Error(body.error || `HTTP ${r.status}`);
        return body;
      })
      .then(setRfData)
      .catch(e => setRfError(e.message))
      .finally(() => setRfLoading(false));
  }, []);

  const loading = portLoading || rfLoading;

  const rfDeAtivos = useMemo((): Position[] => {
    if (!portfolio?.positions) return [];
    return portfolio.positions.filter((p: Position) => isRendaFixa(p.setor));
  }, [portfolio]);

  const metrics = useMemo(() => {
    if (!rfData) return null;
    const totalAtivosBRL = rfDeAtivos.reduce((s, p) => s + p.valorAtualBRL, 0);
    const lucroAtivos = rfDeAtivos.reduce((s, p) => s + (p.lucroBRL ?? 0), 0);
    const totalRF = rfData.patrimonio + totalAtivosBRL;
    const lucroTotal = rfData.lucroNaoRealizado + rfData.lucroRealizado + rfData.totalProventosRF + lucroAtivos;
    const investidoAtivos = rfDeAtivos.reduce((s, p) => s + p.custoTotalBRL, 0);

    return {
      totalRF,
      totalAtivosBRL,
      totalManualBRL: rfData.patrimonio,
      lucroTotal,
      lucroNaoRealizado: rfData.lucroNaoRealizado + lucroAtivos,
      lucroRealizado: rfData.lucroRealizado,
      totalProventosRF: rfData.totalProventosRF,
      totalInvestido: rfData.totalInvestidoAberto + investidoAtivos,
      rentMedia: rfData.rentMedia,
    };
  }, [rfData, rfDeAtivos]);

  const sortedOpen = useMemo(() => {
    if (!rfData) return [];
    return sortBy(rfData.abertas as unknown as Record<string, unknown>[], sortKeyOpen, sortDirOpen) as unknown as RFOpenPos[];
  }, [rfData, sortKeyOpen, sortDirOpen]);

  const sortedClosed = useMemo(() => {
    if (!rfData) return [];
    return sortBy(rfData.encerradas as unknown as Record<string, unknown>[], sortKeyClosed, sortDirClosed) as unknown as RFClosedPos[];
  }, [rfData, sortKeyClosed, sortDirClosed]);

  const txSorted = useMemo(() => {
    if (!rfData) return [];
    return [...rfData.transacoes].sort((a, b) => parseDate(b.date) - parseDate(a.date));
  }, [rfData]);

  if (loading) return <LoadingSpinner />;
  if (rfError && !rfData) return <ErrorAlert message={rfError} />;
  if (!rfData || !metrics) return <ErrorAlert message="Dados de renda fixa não disponíveis" />;

  function handleSortOpen(key: SortKey) {
    if (sortKeyOpen === key) setSortDirOpen(d => d === "asc" ? "desc" : "asc");
    else { setSortKeyOpen(key); setSortDirOpen("desc"); }
  }
  function handleSortClosed(key: SortKey) {
    if (sortKeyClosed === key) setSortDirClosed(d => d === "asc" ? "desc" : "asc");
    else { setSortKeyClosed(key); setSortDirClosed("desc"); }
  }

  function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return <span className="text-zinc-700 ml-0.5">↕</span>;
    return dir === "asc"
      ? <ChevronUp size={10} className="inline ml-0.5 text-accent" />
      : <ChevronDown size={10} className="inline ml-0.5 text-accent" />;
  }

  return (
    <>
      <PageHeader title="Renda Fixa" description="Posições abertas, encerradas, proventos e transações" />

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="animate-fade-in">
          <MetricCard
            label="Total RF"
            value={compactBRL(metrics.totalRF)}
            sub={`Manual ${compactBRL(metrics.totalManualBRL)} + Bolsa ${compactBRL(metrics.totalAtivosBRL)}`}
            icon={<PiggyBank size={18} />}
            glowColor="#8b5cf6"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Lucro Não Realizado"
            value={brl(metrics.lucroNaoRealizado)}
            sub="Posições abertas"
            icon={metrics.lucroNaoRealizado >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            trend={metrics.lucroNaoRealizado >= 0 ? "up" : "down"}
            glowColor={metrics.lucroNaoRealizado >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="Lucro Realizado"
            value={brl(metrics.lucroRealizado)}
            sub={`${rfData.encerradas.length} títulos encerrados`}
            icon={metrics.lucroRealizado >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            trend={metrics.lucroRealizado >= 0 ? "up" : "down"}
            glowColor={metrics.lucroRealizado >= 0 ? "#34d399" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Proventos RF"
            value={brl(metrics.totalProventosRF)}
            sub="Juros, cupons e rendimentos"
            icon={<Wallet size={18} />}
            glowColor="#f59e0b"
          />
        </div>
      </div>

      {/* ── Secondary metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        <div className="glass-card p-3">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Resultado Total</p>
          <p className={`text-base font-bold ${metrics.lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {brl(metrics.lucroTotal)}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">NR + Realizado + Proventos</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Rentab. Média</p>
          <p className={`text-base font-bold ${metrics.rentMedia >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {pct(metrics.rentMedia)}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">Posições abertas</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Caixa</p>
          <p className="text-base font-bold text-zinc-200">{compactBRL(rfData.totalCaixa)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">{rfData.caixa.length} posição(ões)</p>
        </div>
        <div className="glass-card p-3">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Total Investido</p>
          <p className="text-base font-bold text-zinc-200">{compactBRL(metrics.totalInvestido)}</p>
          <p className="text-[10px] text-zinc-600 mt-0.5">{txSorted.length} transações</p>
        </div>
      </div>

      {/* ── Posições Abertas ── */}
      {sortedOpen.length > 0 && (
        <div className="glass-card p-5 mb-5 animate-fade-in">
          <h2 className="section-title mb-4">Posições Abertas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <SortTh label="Título" sortKey="ticker" currentKey={sortKeyOpen} dir={sortDirOpen} onSort={handleSortOpen} />
                  <th className="px-3 py-2.5 text-left text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Moeda</th>
                  <SortTh label="Investido" sortKey="investido" currentKey={sortKeyOpen} dir={sortDirOpen} onSort={handleSortOpen} right />
                  <SortTh label="Valor Atual" sortKey="atual" currentKey={sortKeyOpen} dir={sortDirOpen} onSort={handleSortOpen} right />
                  <SortTh label="Lucro" sortKey="lucro" currentKey={sortKeyOpen} dir={sortDirOpen} onSort={handleSortOpen} right />
                  <SortTh label="Rent. %" sortKey="rentabilidade" currentKey={sortKeyOpen} dir={sortDirOpen} onSort={handleSortOpen} right />
                  <th className="px-3 py-2.5 text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Proventos</th>
                  <SortTh label="Resultado" sortKey="resultadoTotal" currentKey={sortKeyOpen} dir={sortDirOpen} onSort={handleSortOpen} right />
                </tr>
              </thead>
              <tbody>
                {sortedOpen.map((p, i) => (
                  <tr key={p.ticker} className={`border-b border-border/20 hover:bg-white/[0.025] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                    <td className="px-3 py-2.5 font-semibold text-zinc-200 text-xs">{p.ticker}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs">{p.moeda}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">
                      {p.investido > 0 ? currency(p.investido, p.moeda) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-200 font-medium text-xs">{currency(p.atual, p.moeda)}</td>
                    <td className={`px-3 py-2.5 text-right font-semibold text-xs ${p.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.investido > 0 ? currency(p.lucro, p.moeda) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold text-xs ${p.rentabilidade >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.investido > 0 ? pct(p.rentabilidade) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      {p.proventos > 0 ? <span className="text-amber-400">{brl(p.proventos)}</span> : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold text-xs ${p.resultadoTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {p.investido > 0 ? currency(p.resultadoTotal, p.moeda) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-3 text-zinc-300 text-xs" colSpan={2}>Total Abertas</td>
                  <td className="px-3 py-3 text-right text-zinc-400 text-xs">{brl(rfData.totalInvestidoAberto)}</td>
                  <td className="px-3 py-3 text-right text-zinc-200 text-xs">{brl(rfData.totalAtual)}</td>
                  <td className={`px-3 py-3 text-right text-xs ${rfData.lucroNaoRealizado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {brl(rfData.lucroNaoRealizado)}
                  </td>
                  <td className={`px-3 py-3 text-right text-xs ${rfData.rentMedia >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {pct(rfData.rentMedia)}
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-amber-400">
                    {brl(sortedOpen.reduce((s, p) => s + p.proventos, 0))}
                  </td>
                  <td className={`px-3 py-3 text-right text-xs font-bold ${sortedOpen.reduce((s, p) => s + p.resultadoTotal, 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {brl(sortedOpen.reduce((s, p) => s + p.resultadoTotal, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Caixa/Liquidez ── */}
      {rfData.caixa.length > 0 && (
        <div className="glass-card p-5 mb-5 animate-fade-in">
          <h2 className="section-title mb-3">Caixa / Liquidez</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="px-3 py-2.5 text-left text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Título</th>
                  <th className="px-3 py-2.5 text-left text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Moeda</th>
                  <th className="px-3 py-2.5 text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Valor</th>
                </tr>
              </thead>
              <tbody>
                {rfData.caixa.map((p, i) => (
                  <tr key={p.ticker} className={`border-b border-border/20 hover:bg-white/[0.025] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                    <td className="px-3 py-2.5 font-semibold text-zinc-200 text-xs">{p.ticker}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs">{p.moeda}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-200 font-medium text-xs">{currency(p.atual, p.moeda)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-3 text-zinc-300 text-xs" colSpan={2}>Total Caixa</td>
                  <td className="px-3 py-3 text-right text-zinc-200 text-xs">{brl(rfData.totalCaixa)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── RF via Bolsa (SHV, BIL, etc.) ── */}
      {rfDeAtivos.length > 0 && (
        <div className="glass-card p-5 mb-5 animate-fade-in">
          <h2 className="section-title mb-3">Renda Fixa Internacional (via carteira RV)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/30">
                  {["Ticker", "Setor", "Qtd", "PM", "Preço", "Investido", "Valor Atual", "Lucro", "%"].map(h => (
                    <th key={h} className={`px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${h !== "Ticker" && h !== "Setor" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfDeAtivos.map((p, i) => {
                  const cor = (p.lucroPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
                  return (
                    <tr key={p.ticker} className={`border-b border-border/20 hover:bg-white/[0.025] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                      <td className="px-3 py-2.5 font-semibold text-zinc-200 text-xs">{p.ticker} <span className="text-zinc-600 text-[10px]">{p.moeda}</span></td>
                      <td className="px-3 py-2.5 text-zinc-500 text-xs">{p.setor}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 font-mono text-xs">{p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">{currency(p.custoMedio, p.moeda)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">
                        {p.precoAtual !== null ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">{brl(p.custoTotalBRL)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-200 font-medium text-xs">{brl(p.valorAtualBRL)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold text-xs ${cor}`}>{p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold text-xs ${cor}`}>{p.lucroPct !== null ? pct(p.lucroPct) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Posições Encerradas ── */}
      {sortedClosed.length > 0 && (
        <div className="glass-card p-5 mb-5 animate-fade-in">
          <button
            onClick={() => setShowClosed(v => !v)}
            className="flex items-center gap-2 w-full text-left mb-3"
          >
            <h2 className="section-title">Posições Encerradas</h2>
            <span className="text-[10px] text-zinc-500 font-medium">{sortedClosed.length} títulos</span>
            {showClosed ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
          </button>
          {showClosed && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30">
                    <SortTh label="Título" sortKey="ticker" currentKey={sortKeyClosed} dir={sortDirClosed} onSort={handleSortClosed} />
                    <th className="px-3 py-2.5 text-left text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Moeda</th>
                    <SortTh label="Compra" sortKey="compra" currentKey={sortKeyClosed} dir={sortDirClosed} onSort={handleSortClosed} right />
                    <SortTh label="Venda" sortKey="venda" currentKey={sortKeyClosed} dir={sortDirClosed} onSort={handleSortClosed} right />
                    <th className="px-3 py-2.5 text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Imposto</th>
                    <SortTh label="Lucro" sortKey="lucro" currentKey={sortKeyClosed} dir={sortDirClosed} onSort={handleSortClosed} right />
                    <SortTh label="Rent. %" sortKey="rentabilidade" currentKey={sortKeyClosed} dir={sortDirClosed} onSort={handleSortClosed} right />
                    <th className="px-3 py-2.5 text-right text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Proventos</th>
                    <SortTh label="Total" sortKey="resultadoTotal" currentKey={sortKeyClosed} dir={sortDirClosed} onSort={handleSortClosed} right />
                  </tr>
                </thead>
                <tbody>
                  {sortedClosed.map((p, i) => (
                    <tr key={p.ticker} className={`border-b border-border/20 hover:bg-white/[0.025] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                      <td className="px-3 py-2.5 font-semibold text-zinc-200 text-xs">{p.ticker}</td>
                      <td className="px-3 py-2.5 text-zinc-500 text-xs">{p.moeda}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">{currency(p.compra, p.moeda)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-300 text-xs">{currency(p.venda, p.moeda)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-400/70 text-xs">
                        {p.imposto > 0 ? currency(p.imposto, p.moeda) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold text-xs ${p.lucro >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {currency(p.lucro, p.moeda)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold text-xs ${p.rentabilidade >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {pct(p.rentabilidade)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">
                        {p.proventos > 0 ? <span className="text-amber-400">{brl(p.proventos)}</span> : <span className="text-zinc-700">—</span>}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold text-xs ${p.resultadoTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {currency(p.resultadoTotal, p.moeda)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="px-3 py-3 text-zinc-300 text-xs" colSpan={2}>Total Encerradas</td>
                    <td className="px-3 py-3 text-right text-zinc-400 text-xs">{brl(rfData.encerradas.reduce((s, p) => s + p.compra, 0))}</td>
                    <td className="px-3 py-3 text-right text-zinc-300 text-xs">{brl(rfData.encerradas.reduce((s, p) => s + p.venda, 0))}</td>
                    <td className="px-3 py-3 text-right text-amber-400/70 text-xs">{brl(rfData.encerradas.reduce((s, p) => s + p.imposto, 0))}</td>
                    <td className={`px-3 py-3 text-right text-xs ${rfData.lucroRealizado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {brl(rfData.lucroRealizado)}
                    </td>
                    <td />
                    <td className="px-3 py-3 text-right text-xs text-amber-400">
                      {brl(sortedClosed.reduce((s, p) => s + p.proventos, 0))}
                    </td>
                    <td className={`px-3 py-3 text-right text-xs font-bold ${sortedClosed.reduce((s, p) => s + p.resultadoTotal, 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {brl(sortedClosed.reduce((s, p) => s + p.resultadoTotal, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Histórico de Transações ── */}
      {txSorted.length > 0 && (
        <div className="glass-card p-5 animate-fade-in">
          <button
            onClick={() => setShowTx(v => !v)}
            className="flex items-center gap-2 w-full text-left mb-3"
          >
            <h2 className="section-title">Histórico de Transações</h2>
            <span className="text-[10px] text-zinc-500 font-medium">{txSorted.length} registros</span>
            {showTx ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
          </button>
          {showTx && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/30">
                    {["Data", "Título", "Tipo", "Valor", "Moeda"].map(h => (
                      <th key={h} className={`px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${h === "Valor" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txSorted.map((tx, i) => {
                    const isCompra = tx.tipo.toLowerCase().includes("compra");
                    const isImposto = tx.tipo.toLowerCase().includes("imposto");
                    return (
                      <tr key={i} className={`border-b border-border/20 hover:bg-white/[0.025] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                        <td className="px-3 py-2 text-zinc-400 text-xs font-mono">{formatDate(tx.date)}</td>
                        <td className="px-3 py-2 text-zinc-200 text-xs font-medium">{tx.ticker}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={isCompra ? "text-emerald-400" : isImposto ? "text-amber-400" : "text-red-400"}>
                            {tx.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-zinc-300 font-mono">{currency(tx.valor, tx.moeda)}</td>
                        <td className="px-3 py-2 text-zinc-500 text-xs">{tx.moeda}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function SortTh({ label, sortKey, currentKey, dir, onSort, right }: {
  label: string; sortKey: SortKey; currentKey: SortKey; dir: SortDir;
  onSort: (key: SortKey) => void; right?: boolean;
}) {
  return (
    <th
      className={`px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none ${right ? "text-right" : "text-left"}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {currentKey === sortKey
        ? (dir === "asc" ? <ChevronUp size={10} className="inline ml-0.5 text-accent" /> : <ChevronDown size={10} className="inline ml-0.5 text-accent" />)
        : <span className="text-zinc-700 ml-0.5">↕</span>
      }
    </th>
  );
}

function parseDate(raw: string): number {
  if (!raw) return 0;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(raw).getTime();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}`).getTime();
  return 0;
}
