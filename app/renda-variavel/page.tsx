"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Briefcase, Target, ArrowLeftRight,
  DollarSign, BarChart2, ChevronUp, ChevronDown, ChevronRight,
} from "lucide-react";
import { usePortfolio, useSheetData } from "@/lib/hooks";
import { brl, compactBRL, pct, currency } from "@/lib/format";
import { isRendaVariavel } from "@/lib/sectors";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import CandleChart from "@/components/CandleChart";
import type { Position } from "@/lib/portfolio";

const TOOLTIP_STYLE = {
  background: "rgba(13,14,20,0.95)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "10px",
  fontSize: "12px",
  color: "#e4e4e7",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
} as const;

const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#3b82f6",
  "Ações Internacional": "#8b5cf6",
  "ETF USA": "#06b6d4",
  "ETF": "#10b981",
  "FIIs": "#f59e0b",
  "Cripto": "#f97316",
  "Commodities": "#eab308",
  "BDRs": "#ec4899",
};

type SortKey = "ticker" | "setor" | "valorAtualBRL" | "lucroBRL" | "lucroPct" | "dayChangePct" | "dayChangeBRL" | "ganhoAtivoBRL" | "ganhoCambioBRL";
type SortDir = "asc" | "desc";

function sortPositions(positions: Position[], key: SortKey, dir: SortDir): Position[] {
  return [...positions].sort((a, b) => {
    const av = (a[key] ?? 0) as number | string;
    const bv = (b[key] ?? 0) as number | string;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

interface Transaction {
  data: string;
  tipo: string;
  ticker: string;
  quantidade: number;
  preco: number;
  valorBruto: number;
  moeda: string;
  corretora: string;
}

function parseTransactions(rows: Record<string, unknown>[]): Transaction[] {
  return rows.map(row => {
    const dataRaw = String(row["data"] ?? row["Data"] ?? "");
    const tipo = String(row["tipo de transação"] ?? row["tipo de transacao"] ?? row["tipo_transacao"] ?? row["Tipo de transação"] ?? "");
    const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? row["Símbolo"] ?? "").toUpperCase().trim();
    const quantidade = Number(String(row["quantidade"] ?? row["Quantidade"] ?? "0").replace(",", ".")) || 0;
    const preco = Number(String(row["preço"] ?? row["preco"] ?? row["Preço"] ?? "0").replace(",", ".")) || 0;
    const valorBruto = Number(String(row["valor bruto"] ?? row["valor_bruto"] ?? row["Valor bruto"] ?? "0").replace(",", ".")) || 0;
    const moeda = String(row["moeda"] ?? row["Moeda"] ?? "BRL").toUpperCase().trim();
    const corretora = String(row["corretora"] ?? row["Corretora"] ?? "");
    return { data: dataRaw, tipo, ticker, quantidade, preco, valorBruto: valorBruto || quantidade * preco, moeda, corretora };
  }).filter(t => t.ticker && t.quantidade > 0);
}

function formatTxDate(raw: string): string {
  if (!raw) return "—";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return raw.slice(0, 10);
  return raw.slice(0, 10);
}

function parseDateSort(raw: string): number {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(raw).getTime();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}`).getTime();
  return 0;
}

export default function RendaVariavelPage() {
  const { data, loading, error } = usePortfolio();
  const { data: rawTx } = useSheetData("meus_ativos");
  const [sortKey, setSortKey] = useState<SortKey>("valorAtualBRL");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const metrics = useMemo(() => {
    if (!data) return null;
    const rv = data.positions.filter((p) => isRendaVariavel(p.setor));

    const totalInvestido = rv.reduce((s, p) => s + p.custoTotalBRL, 0);
    const totalAtual = data.rvPatrimonioBRL;
    const dayChangeBRL = data.dayChangeTotalBRL ?? 0;
    const ganhoAtivo = data.ganhoAtivoTotalBRL ?? 0;
    const ganhoCambio = data.ganhoCambioTotalBRL ?? 0;

    // Sector breakdown
    const bySector: Record<string, { value: number; invested: number; count: number }> = {};
    for (const p of rv) {
      if (!bySector[p.setor]) bySector[p.setor] = { value: 0, invested: 0, count: 0 };
      bySector[p.setor].value += p.valorAtualBRL;
      bySector[p.setor].invested += p.custoTotalBRL;
      bySector[p.setor].count += 1;
    }
    const sectorData = Object.entries(bySector)
      .sort(([, a], [, b]) => b.value - a.value)
      .map(([name, d]) => ({
        name,
        value: d.value,
        invested: d.invested,
        retorno: d.invested > 0 ? ((d.value / d.invested - 1) * 100) : 0,
        count: d.count,
        pct: totalAtual > 0 ? (d.value / totalAtual) * 100 : 0,
      }));

    // Daily P&L summary
    const posGanhadoras = rv.filter(p => (p.dayChangePct ?? 0) > 0).length;
    const posPerdedoras = rv.filter(p => (p.dayChangePct ?? 0) < 0).length;

    return {
      rv, totalInvestido, totalAtual, dayChangeBRL, ganhoAtivo, ganhoCambio,
      sectorData, posGanhadoras, posPerdedoras,
    };
  }, [data]);

  const sortedPositions = useMemo(() => {
    if (!metrics) return [];
    return sortPositions(metrics.rv, sortKey, sortDir);
  }, [metrics, sortKey, sortDir]);

  const txByTicker = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    for (const tx of parseTransactions(rawTx)) {
      if (!map[tx.ticker]) map[tx.ticker] = [];
      map[tx.ticker].push(tx);
    }
    for (const arr of Object.values(map)) {
      arr.sort((a, b) => parseDateSort(b.data) - parseDateSort(a.data));
    }
    return map;
  }, [rawTx]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="cotacoes" />;
  if (!data || !metrics) return <ErrorAlert message="Dados não disponíveis" />;

  const hasUSD = metrics.rv.some(p => p.moeda !== "BRL");

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-zinc-700 ml-0.5">↕</span>;
    return sortDir === "asc"
      ? <ChevronUp size={10} className="inline ml-0.5 text-accent" />
      : <ChevronDown size={10} className="inline ml-0.5 text-accent" />;
  }

  function SortTh({ col, label, right }: { col: SortKey; label: string; right?: boolean }) {
    return (
      <th
        className={`px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider cursor-pointer hover:text-zinc-300 select-none ${right ? "text-right" : ""}`}
        onClick={() => handleSort(col)}
      >
        {label}<SortIcon col={col} />
      </th>
    );
  }

  return (
    <>
      <PageHeader
        title="Renda Variável"
        description="Análise completa de posições RV — variação diária, FX e setores"
      />

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="animate-fade-in">
          <MetricCard
            label="Investido (RV)"
            value={compactBRL(metrics.totalInvestido)}
            sub={`${metrics.rv.length} ativos · PM do dólar`}
            icon={<Briefcase size={18} />}
            glowColor="#d4a574"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Valor Atual"
            value={compactBRL(metrics.totalAtual)}
            sub={pct(data.lucroPct)}
            icon={<Target size={18} />}
            trend={data.lucroBRL >= 0 ? "up" : "down"}
            glowColor="#3b82f6"
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="Lucro Total"
            value={brl(data.lucroBRL)}
            sub={pct(data.lucroPct)}
            icon={data.lucroBRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            trend={data.lucroBRL >= 0 ? "up" : "down"}
            glowColor={data.lucroBRL >= 0 ? "#4ade80" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Variação Hoje"
            value={brl(metrics.dayChangeBRL)}
            sub={`${pct(data.dayChangeTotalPct ?? 0)} · ${metrics.posGanhadoras}↑ ${metrics.posPerdedoras}↓`}
            icon={<BarChart2 size={18} />}
            trend={metrics.dayChangeBRL >= 0 ? "up" : "down"}
            glowColor={metrics.dayChangeBRL >= 0 ? "#4ade80" : "#f87171"}
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-4">
          <MetricCard
            label="Ganho Ativo"
            value={brl(metrics.ganhoAtivo)}
            sub="Valorização dos ativos (vs PM)"
            icon={<TrendingUp size={18} />}
            trend={metrics.ganhoAtivo >= 0 ? "up" : "down"}
            glowColor="#06b6d4"
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-5">
          <MetricCard
            label="Ganho Câmbio"
            value={brl(metrics.ganhoCambio)}
            sub="Variação cambial (spot vs PM)"
            icon={<ArrowLeftRight size={18} />}
            trend={metrics.ganhoCambio >= 0 ? "up" : "down"}
            glowColor="#10b981"
            compact
          />
        </div>
      </div>

      {/* FX bar when has USD */}
      {hasUSD && data.cambio && (
        <div className="glass-card p-4 mb-6 animate-fade-in">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div>
              <span className="text-zinc-500">Spot USD/BRL</span>
              <span className="text-zinc-200 font-semibold ml-2">R$ {data.usdbrl.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-zinc-500">PM Dólar</span>
              <span className="text-accent font-semibold ml-2">R$ {data.cambio.pmDolar.toFixed(4)}</span>
            </div>
            {data.ptax && (
              <div>
                <span className="text-zinc-500">PTAX ({data.ptax.data})</span>
                <span className="text-purple-400 font-semibold ml-2">R$ {data.ptax.USDBRL.toFixed(4)}</span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Fonte FX</span>
              <span className="text-zinc-300 font-medium ml-2">{data.fxSource}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Sector Analysis ── */}
      {metrics.sectorData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 animate-fade-in">
          {/* Pie */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4">Alocação por Setor</h2>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={metrics.sectorData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={75}
                    strokeWidth={2} stroke="rgba(0,0,0,0.4)"
                    dataKey="value"
                  >
                    {metrics.sectorData.map((s, i) => (
                      <Cell key={i} fill={SECTOR_COLORS[s.name] || "#71717a"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, _n: string, props: { payload?: { name: string; pct: number } }) => [
                      `${compactBRL(v)} (${(props.payload?.pct ?? 0).toFixed(1)}%)`,
                      props.payload?.name ?? "",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {metrics.sectorData.map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SECTOR_COLORS[s.name] || "#71717a" }} />
                    <span className="text-[11px] text-zinc-400 flex-1 truncate">{s.name}</span>
                    <span className="text-[11px] text-zinc-300 font-semibold tabular-nums">{s.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sector returns bar */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4">Retorno por Setor (%)</h2>
            <ResponsiveContainer width="100%" height={185}>
              <BarChart data={metrics.sectorData} layout="vertical" barCategoryGap="22%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, _n: string, props: { payload?: { name: string; value: number; invested: number; count: number } }) => [
                    `${v >= 0 ? "+" : ""}${v.toFixed(1)}% · ${compactBRL(props.payload?.value ?? 0)} · ${props.payload?.count} ativos`,
                    props.payload?.name ?? "",
                  ]}
                />
                <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} />
                <Bar dataKey="retorno" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {metrics.sectorData.map((s, i) => (
                    <Cell key={i} fill={s.retorno >= 0 ? "#34d399" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Position Table ── */}
      <div className="glass-card p-5 animate-fade-in">
        <h2 className="section-title mb-4">Posições — Renda Variável</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <SortTh col="ticker" label="Ativo" />
                <SortTh col="setor" label="Setor" />
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Qtd</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">PM</th>
                <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Preço</th>
                <SortTh col="valorAtualBRL" label="Atual" right />
                <SortTh col="lucroBRL" label="Lucro" right />
                <SortTh col="lucroPct" label="%" right />
                <SortTh col="dayChangePct" label="Dia%" right />
                <SortTh col="dayChangeBRL" label="Dia R$" right />
                {hasUSD && <SortTh col="ganhoAtivoBRL" label="G.Ativo" right />}
                {hasUSD && <SortTh col="ganhoCambioBRL" label="G.Câmbio" right />}
              </tr>
            </thead>
            <tbody>
              {sortedPositions.map((p, i) => {
                const corLucro = (p.lucroBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const corDia = (p.dayChangePct ?? 0) >= 0 ? "text-positive" : "text-negative";
                const corAtivo = (p.ganhoAtivoBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const corCambio = (p.ganhoCambioBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                const isExpanded = expandedTicker === p.ticker;
                const txs = txByTicker[p.ticker] ?? [];
                const colCount = 10 + (hasUSD ? 2 : 0);
                return (
                  <React.Fragment key={p.ticker}>
                    <tr
                      className={`border-b border-border/30 hover:bg-white/[0.025] transition-colors cursor-pointer ${i % 2 === 1 ? "bg-white/[0.01]" : ""} ${isExpanded ? "bg-white/[0.03]" : ""}`}
                      onClick={() => setExpandedTicker(isExpanded ? null : p.ticker)}
                    >
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1">
                          <ChevronRight size={12} className={`text-zinc-600 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          <span className="font-semibold text-zinc-200">{p.ticker}</span>
                        </span>
                        <span className="text-zinc-600 text-[10px] ml-1">{p.moeda}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[p.setor] || "#71717a"}15`, color: SECTOR_COLORS[p.setor] || "#71717a" }}>
                          {p.setor}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 font-mono text-xs">
                        {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">{currency(p.custoMedio, p.moeda)}</td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">
                        {p.precoAtual !== null
                          ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{brl(p.valorAtualBRL)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${corLucro}`}>
                        {p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${corLucro}`}>
                        {p.lucroPct !== null ? pct(p.lucroPct) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-xs font-semibold ${p.dayChangePct !== null ? corDia : "text-zinc-600"}`}>
                        {p.dayChangePct !== null ? pct(p.dayChangePct) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-xs ${p.dayChangeBRL !== null ? corDia : "text-zinc-600"}`}>
                        {p.dayChangeBRL !== null ? brl(p.dayChangeBRL) : "—"}
                      </td>
                      {hasUSD && (
                        <td className={`px-3 py-2.5 text-right text-xs ${p.ganhoAtivoBRL !== null ? corAtivo : "text-zinc-600"}`}>
                          {p.ganhoAtivoBRL !== null ? brl(p.ganhoAtivoBRL) : "—"}
                        </td>
                      )}
                      {hasUSD && (
                        <td className={`px-3 py-2.5 text-right text-xs ${p.ganhoCambioBRL !== null && p.ganhoCambioBRL !== 0 ? corCambio : "text-zinc-600"}`}>
                          {p.ganhoCambioBRL !== null && p.ganhoCambioBRL !== 0 ? brl(p.ganhoCambioBRL) : "—"}
                        </td>
                      )}
                    </tr>
                    {isExpanded && txs.length > 0 && (
                      <tr>
                        <td colSpan={colCount} className="p-0">
                          <div className="bg-zinc-900/60 border-l-2 border-indigo-500/40 mx-3 mb-2 rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-zinc-800">
                                  <th className="px-3 py-2 text-left text-[10px] text-zinc-500 font-semibold uppercase">Data</th>
                                  <th className="px-3 py-2 text-left text-[10px] text-zinc-500 font-semibold uppercase">Tipo</th>
                                  <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">Qtd</th>
                                  <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">Preço</th>
                                  <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">Total</th>
                                  <th className="px-3 py-2 text-left text-[10px] text-zinc-500 font-semibold uppercase">Corretora</th>
                                </tr>
                              </thead>
                              <tbody>
                                {txs.map((tx, j) => {
                                  const isCompra = tx.tipo.toLowerCase().includes("compra") || tx.tipo.toLowerCase().includes("buy");
                                  return (
                                    <tr key={j} className="border-b border-zinc-800/50 hover:bg-white/[0.02]">
                                      <td className="px-3 py-1.5 text-zinc-400 font-mono">{formatTxDate(tx.data)}</td>
                                      <td className="px-3 py-1.5">
                                        <span className={`font-semibold ${isCompra ? "text-emerald-400" : "text-red-400"}`}>
                                          {tx.tipo || (isCompra ? "Compra" : "Venda")}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">
                                        {tx.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-zinc-400">
                                        {currency(tx.preco, tx.moeda)}
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-zinc-300 font-medium">
                                        {currency(tx.valorBruto, tx.moeda)}
                                      </td>
                                      <td className="px-3 py-1.5 text-zinc-500">{tx.corretora}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && (
                      <tr>
                        <td colSpan={colCount} className="p-0">
                          <div className="mx-3 mb-3">
                            <CandleChart
                              ticker={p.ticker}
                              moeda={p.moeda}
                              corretora={txs[0]?.corretora ?? ""}
                              precoAtual={p.precoAtual}
                              purchases={txs
                                .filter((tx) => tx.tipo.toLowerCase().includes("compra") || tx.tipo.toLowerCase().includes("buy"))
                                .map((tx) => ({ date: tx.data, price: tx.preco, quantidade: tx.quantidade, moeda: tx.moeda }))}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                    {isExpanded && txs.length === 0 && (
                      <tr>
                        <td colSpan={colCount} className="px-6 py-3 text-xs text-zinc-600 italic">
                          Nenhuma transação encontrada para {p.ticker}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="px-3 py-3 text-zinc-300" colSpan={5}>Total RV</td>
                <td className="px-3 py-3 text-right text-zinc-200">{brl(data.rvPatrimonioBRL)}</td>
                <td className={`px-3 py-3 text-right ${data.lucroBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.lucroBRL)}</td>
                <td className={`px-3 py-3 text-right ${data.lucroPct >= 0 ? "text-positive" : "text-negative"}`}>{pct(data.lucroPct)}</td>
                <td className={`px-3 py-3 text-right text-xs ${(data.dayChangeTotalBRL ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                  {pct(data.dayChangeTotalPct ?? 0)}
                </td>
                <td className={`px-3 py-3 text-right text-xs ${(data.dayChangeTotalBRL ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>
                  {brl(data.dayChangeTotalBRL ?? 0)}
                </td>
                {hasUSD && (
                  <td className={`px-3 py-3 text-right text-xs ${data.ganhoAtivoTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>
                    {brl(data.ganhoAtivoTotalBRL)}
                  </td>
                )}
                {hasUSD && (
                  <td className={`px-3 py-3 text-right text-xs ${data.ganhoCambioTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>
                    {brl(data.ganhoCambioTotalBRL)}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* FX decomposition summary */}
      {hasUSD && (
        <div className="glass-card p-5 mt-4 animate-fade-in">
          <h2 className="section-title mb-4"><DollarSign size={15} />Decomposição FX</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Separa o lucro total entre o que veio da valorização do ativo em si e o que veio da variação cambial (spot vs PM do dólar pago).
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div>
              <span className="stat-label block mb-1">Lucro Total (BRL)</span>
              <span className={`stat-value ${data.lucroBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.lucroBRL)}</span>
            </div>
            <div>
              <span className="stat-label block mb-1">Ganho Ativo</span>
              <span className={`stat-value ${data.ganhoAtivoTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.ganhoAtivoTotalBRL)}</span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">Valorização intrínseca</span>
            </div>
            <div>
              <span className="stat-label block mb-1">Ganho Câmbio</span>
              <span className={`stat-value ${data.ganhoCambioTotalBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.ganhoCambioTotalBRL)}</span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">Spot R$ {data.usdbrl.toFixed(2)} vs PM R$ {data.cambio?.pmDolar.toFixed(2)}</span>
            </div>
            <div>
              <span className="stat-label block mb-1">Cambial / Total</span>
              <span className="stat-value text-zinc-300">
                {data.lucroBRL !== 0
                  ? `${((data.ganhoCambioTotalBRL / data.lucroBRL) * 100).toFixed(1)}%`
                  : "—"}
              </span>
              <span className="text-[10px] text-zinc-500 block mt-0.5">% do lucro via câmbio</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
