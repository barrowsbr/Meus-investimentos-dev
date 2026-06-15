"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { ArrowLeftRight, DollarSign, TrendingUp, TrendingDown, Scale, Layers, Zap, ShieldAlert, BarChart3 } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import type { PortfolioResponse } from "@/lib/hooks";
import { useSheetData } from "@/lib/hooks";
import { toNumber, brl, usd, formatDate, compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { getMoedaExposicao } from "@/lib/sectors";
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

const FX_COLORS: Record<string, string> = {
  USD: "#3b82f6", EUR: "#8b5cf6", CAD: "#f59e0b", GBP: "#10b981", CHF: "#06b6d4",
};

type Tab = "operacoes" | "exposicao";

export default function CambioPage() {
  const { data: portfolio, loading: portLoading } = usePortfolio();
  const { data: rawData, loading: sheetLoading, error } = useSheetData("cambio");
  const [stressCustom, setStressCustom] = useState<number>(0);
  const [tab, setTab] = useState<Tab>("operacoes");

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
        brl(row["valor_origem"] || row["valor total entrada"] || row["valor entrada"] || row["valor_entrada"]),
    },
    {
      key: "valor_destino",
      label: "Recebido",
      align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) =>
        usd(row["valor_destino"] || row["valor total saída"] || row["valor total saida"] || row["valor saída"] || row["valor_saida"] || row["valor saida"]),
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

      {/* ── Tab selector ── */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {([
          { id: "operacoes" as Tab, label: "Operações", icon: ArrowLeftRight },
          { id: "exposicao" as Tab, label: "Exposição Cambial", icon: ShieldAlert },
        ]).map(t => {
          const active = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
              style={active ? { background: "rgba(232,163,61,0.12)", boxShadow: "0 2px 8px rgba(232,163,61,0.08)" } : {}}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab: Exposição Cambial ── */}
      {tab === "exposicao" && portfolio && (
        <ExposicaoCambialTab portfolio={portfolio} />
      )}

      {/* ── Tab: Operações (conteúdo original) ── */}
      {tab === "operacoes" && cambio && (
        <>
          {/* ── Hero: Total em Reais ── */}
          <div className="glass-card p-6 mb-6 animate-fade-in">
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-1">
              Total em Reais (moeda de consumo)
            </div>
            <div className={`text-3xl font-extrabold mb-4 ${cambio.ganhoTotal_BRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {brl(cambio.totalValBRL)}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="stat-label block mb-1">BRL Investido</span>
                <span className="text-sm font-bold text-zinc-300">{brl(cambio.totalCustoBRL)}</span>
              </div>
              <div>
                <span className="stat-label block mb-1">Ganho Cambial</span>
                <span className={`text-sm font-bold ${cambio.ganhoTotal_BRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {cambio.ganhoTotal_BRL >= 0 ? "+" : ""}{brl(cambio.ganhoTotal_BRL)}
                </span>
                <span className={`text-xs ml-1 ${cambio.ganhoTotalPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {cambio.ganhoTotalPct >= 0 ? "+" : ""}{cambio.ganhoTotalPct.toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="stat-label block mb-1">Saldo USD</span>
                <span className="text-sm font-bold text-zinc-300">US$ {cambio.usdNet.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                {cambio.usdVendido > 0 && (
                  <span className="text-[10px] text-zinc-600 block">−US$ {cambio.usdVendido.toLocaleString("en-US", { maximumFractionDigits: 0 })} convertidos</span>
                )}
              </div>
              <div>
                <span className="stat-label block mb-1">Moedas</span>
                <span className="text-sm font-bold text-zinc-300">{cambio.numMoedas}</span>
              </div>
            </div>
          </div>

          {/* ── Cadeia de Conversão ── */}
          <div className="mb-6">
            <h2 className="section-title mb-1"><Layers size={15} />Cadeia de Conversão</h2>
            <p className="text-[10px] text-zinc-600 mb-4">USD é a moeda intermediária: recebe de BRL e distribui para outras moedas. Saldo USD = comprado − convertido.</p>

            {/* USD Card (Layer 1) */}
            <div className="glass-card p-5 mb-4 animate-fade-in" style={{ borderColor: "rgba(59,130,246,0.15)" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🇺🇸</span>
                  <div>
                    <div className="text-sm font-bold text-zinc-100">USD</div>
                    <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Conta intermediária · recebe BRL · distribui</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Ganho cambial (BRL)</div>
                  <div className={`text-xl font-extrabold ${cambio.ganhoUsdBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {cambio.ganhoUsdBRL >= 0 ? "+" : ""}R$ {Math.abs(cambio.ganhoUsdBRL).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  </div>
                  <div className={`text-xs ${cambio.ganhoUsdPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {cambio.ganhoUsdPct >= 0 ? "+" : ""}{cambio.ganhoUsdPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">PM compra (R$/USD)</div>
                  <div className="text-sm font-bold text-zinc-400">R$ {cambio.pmDolar.toFixed(4)}</div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Cotação hoje</div>
                  <div className="text-sm font-bold text-zinc-100">R$ {spot.toFixed(4)}</div>
                  <div className={`text-[10px] font-semibold ${cambio.deltaPmUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {cambio.deltaPmUsd >= 0 ? "+" : ""}{cambio.deltaPmUsd.toFixed(1)}% vs PM
                  </div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Valor em BRL</div>
                  <div className="text-sm font-bold text-zinc-100">R$ {cambio.valorUsdHoje.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div>
                  <div className="text-[10px] text-zinc-600">custo R$ {cambio.brlCustoUsdNet.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div>
                </div>
              </div>

              {/* Ledger: USD balance */}
              <div className="rounded-xl p-4 mb-3" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">Saldo USD — conta intermediária</div>
                <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                  <span className="text-xs text-zinc-500">＋ Comprado com BRL</span>
                  <span className="text-sm font-bold text-emerald-400">US$ {cambio.usdComprado.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {cambio.fx2.map(c => (
                  <div key={c.moeda} className="flex items-center justify-between py-1.5 border-b border-white/5">
                    <span className="text-xs text-zinc-500">− Convertido → {c.moeda}</span>
                    <span className="text-sm font-bold text-red-400">US$ {c.usdGasto.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-zinc-100">= Saldo disponível</span>
                  <span className="text-base font-extrabold text-zinc-100">US$ {cambio.usdNet.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* PM vs Spot bar */}
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-zinc-700">PM R$ {cambio.pmDolar.toFixed(4)} → Cotação R$ {spot.toFixed(4)}</span>
                <span className={`text-[10px] font-semibold ${cambio.deltaPmUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {cambio.deltaPmUsd >= 0 ? "+" : ""}{cambio.deltaPmUsd.toFixed(2)}%
                </span>
              </div>
              <div className="h-1 rounded-full relative overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div
                  className="absolute top-0 left-0 h-full rounded-full opacity-80"
                  style={{
                    width: `${Math.min(Math.max((cambio.deltaPmUsd / 20 + 0.5) * 100, 2), 98)}%`,
                    backgroundColor: cambio.deltaPmUsd >= 0 ? "#34d399" : "#f87171",
                  }}
                />
                <div className="absolute top-0 left-1/2 h-full w-px" style={{ background: "rgba(255,255,255,0.2)" }} />
              </div>
            </div>

            {/* Layer 2 cards: USD → other currencies */}
            {cambio.fx2.length > 0 && (
              <div className={`grid grid-cols-1 gap-4 mb-4 ${cambio.fx2.length === 1 ? "md:grid-cols-1" : cambio.fx2.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                {cambio.fx2.map(c => {
                  const color = FX_COLORS[c.moeda] ?? "#64748b";
                  const vc = c.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400";
                  const dc = c.deltaUSD >= 0 ? "text-emerald-400" : "text-red-400";
                  const fillPct = Math.min(Math.max((c.deltaUSD / 20 + 0.5) * 100, 2), 98);
                  return (
                    <div key={c.moeda} className="glass-card p-5 animate-fade-in" style={{ borderColor: `${color}20` }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{c.moeda === "EUR" ? "🇪🇺" : c.moeda === "GBP" ? "🇬🇧" : c.moeda === "CAD" ? "🇨🇦" : "🌐"}</span>
                          <div>
                            <div className="text-sm font-bold" style={{ color }}>{c.moeda}</div>
                            <div className="text-[9px] text-zinc-600 uppercase tracking-wider">via USD</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-base font-bold ${vc}`}>{c.ganhoBRL >= 0 ? "+" : ""}R$ {Math.abs(c.ganhoBRL).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div>
                          <div className={`text-xs ${vc}`}>{c.ganhoPct >= 0 ? "+" : ""}{c.ganhoPct.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                          <div className="text-[9px] text-zinc-600">PM (USD/{c.moeda})</div>
                          <div className="text-xs font-bold text-zinc-400">{c.pmUSD.toFixed(4)}</div>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                          <div className="text-[9px] text-zinc-600">Cotação (USD/{c.moeda})</div>
                          <div className="text-xs font-bold text-zinc-100">{c.cotUSD.toFixed(4)}</div>
                          <div className={`text-[9px] font-semibold ${dc}`}>{c.deltaUSD >= 0 ? "+" : ""}{c.deltaUSD.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                          <div className="text-[9px] text-zinc-600">PM (R$/{c.moeda})</div>
                          <div className="text-xs font-bold text-zinc-400">R$ {c.pmBRL.toFixed(4)}</div>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                          <div className="text-[9px] text-zinc-600">Posição</div>
                          <div className="text-xs font-bold text-zinc-100">{c.moeda === "EUR" ? "€" : c.moeda === "GBP" ? "£" : "C$"} {c.qtd.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="flex justify-between mb-1">
                        <span className="text-[9px] text-zinc-700">PM → Spot</span>
                        <span className={`text-[9px] font-semibold ${dc}`}>{c.deltaUSD >= 0 ? "+" : ""}{c.deltaUSD.toFixed(2)}%</span>
                      </div>
                      <div className="h-1 rounded-full relative overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <div className="absolute top-0 left-0 h-full rounded-full opacity-80" style={{ width: `${fillPct}%`, backgroundColor: c.deltaUSD >= 0 ? "#34d399" : "#f87171" }} />
                        <div className="absolute top-0 left-1/2 h-full w-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Metric Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            <div className="animate-fade-in">
              <MetricCard
                label="PM Dólar"
                value={`R$ ${cambio.pmDolar.toFixed(4)}`}
                sub={`Spot R$ ${spot.toFixed(4)} · ${cambio.deltaPmUsd >= 0 ? "+" : ""}${cambio.deltaPmUsd.toFixed(1)}%`}
                icon={<DollarSign size={18} />}
                glowColor="#E8A33D"
              />
            </div>
            <div className="animate-fade-in animate-delay-1">
              <MetricCard
                label="Ganho Total Câmbio"
                value={brl(cambio.ganhoTotal_BRL)}
                sub={`${cambio.operacoes} operações`}
                icon={cambio.ganhoTotal_BRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                trend={cambio.ganhoTotal_BRL >= 0 ? "up" : "down"}
                glowColor={cambio.ganhoTotal_BRL >= 0 ? "#4ade80" : "#f87171"}
              />
            </div>
            <div className="animate-fade-in animate-delay-2">
              <MetricCard
                label="Ganho USD (net)"
                value={brl(cambio.ganhoUsdBRL)}
                sub={`$ ${cambio.usdNet.toLocaleString("en-US", { maximumFractionDigits: 0 })} net · PM R$ ${cambio.pmDolar.toFixed(2)}`}
                icon={<ArrowLeftRight size={18} />}
                trend={cambio.ganhoUsdBRL >= 0 ? "up" : "down"}
                glowColor="#3b82f6"
                compact
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

          {/* ── Comparison Bars ── */}
          <div className="glass-card p-5 mb-6 animate-fade-in">
            <h2 className="section-title mb-5">Comparativo de Taxas</h2>
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: "PM Dólar", value: cambio.pmDolar, color: "#E8A33D" },
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

          {/* ── FX History Chart ── */}
          {fxHistory.length > 1 && (
            <div className="glass-card p-5 mb-6 animate-fade-in">
              <h2 className="section-title mb-4">Histórico de Taxas (VET)</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={fxHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                  <XAxis dataKey="data" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatDate(v).substring(0, 5)} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [`R$ ${v.toFixed(4)}`, "VET"]} labelFormatter={(l) => formatDate(l)} />
                  <ReferenceLine y={cambio.pmDolar} stroke="#E8A33D" strokeDasharray="5 5" label={{ value: `PM ${cambio.pmDolar.toFixed(2)}`, fill: "#E8A33D", fontSize: 10, position: "right" }} />
                  <Line type="monotone" dataKey="taxa" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 5, fill: "#3b82f6" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Stress Test ── */}
          {(() => {
            const totalForeignBRL = cambio.totalValBRL;
            const custoBRL = cambio.totalCustoBRL;
            const scenarios = [
              { label: "-20%", pct: -20 },
              { label: "-10%", pct: -10 },
              { label: "-5%", pct: -5 },
              { label: "Atual", pct: 0 },
              { label: "+5%", pct: 5 },
              { label: "+10%", pct: 10 },
              { label: "+20%", pct: 20 },
              ...(stressCustom !== 0 ? [{ label: `${stressCustom > 0 ? "+" : ""}${stressCustom}%`, pct: stressCustom }] : []),
            ].sort((a, b) => a.pct - b.pct);

            const stressData = scenarios.map(s => {
              const newVal = totalForeignBRL * (1 + s.pct / 100);
              const impactBRL = newVal - totalForeignBRL;
              const newUSD = spot * (1 + s.pct / 100);
              return {
                label: s.label,
                pct: s.pct,
                newVal,
                impactBRL,
                impactPct: totalForeignBRL > 0 ? (impactBRL / totalForeignBRL) * 100 : 0,
                newUSD,
                ganhoPct: custoBRL > 0 ? ((newVal - custoBRL) / custoBRL) * 100 : 0,
              };
            });

            return (
              <div className="glass-card p-5 mb-6 animate-fade-in">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="section-title"><Zap size={15} />Teste de Estresse Cambial</h2>
                  <span className="text-[10px] text-zinc-600">
                    Base: {compactBRL(totalForeignBRL)} em moeda estrangeira
                  </span>
                </div>
                <p className="text-[10px] text-zinc-600 mb-4">
                  Impacto de variações cambiais sobre <strong className="text-zinc-400">todo o patrimônio em moeda estrangeira</strong> (não só remessas).
                </p>

                <div className="mb-5">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={stressData} barCategoryGap="18%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{
                        background: "#18181b", border: "1px solid #27272a",
                        borderRadius: 12, color: "#fafafa", fontSize: 12,
                      }}
                        itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                        formatter={(v: number, name: string) => [
                          name === "impactBRL" ? brl(v) : `${v.toFixed(2)}%`,
                          name === "impactBRL" ? "Impacto BRL" : "Ganho vs Custo",
                        ]}
                        labelFormatter={l => `Cenário: ${l}`} />
                      <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
                      <Bar dataKey="impactBRL" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {stressData.map((entry, i) => (
                          <Cell key={i} fill={entry.pct === 0 ? "#6366f1" : entry.impactBRL >= 0 ? "#34d399" : "#f87171"} fillOpacity={entry.pct === 0 ? 0.9 : 0.75} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        {["Cenário", "USD/BRL", "Patrimônio", "Impacto", "vs Custo"].map(h => (
                          <th key={h} className="px-3 py-2 text-[9px] text-zinc-500 font-semibold uppercase tracking-wider text-right first:text-left">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stressData.map((s, i) => (
                        <tr key={i} className={`border-b border-zinc-900 ${s.pct === 0 ? "bg-indigo-500/5" : "hover:bg-white/[0.02]"}`}>
                          <td className={`px-3 py-2 font-semibold ${s.pct === 0 ? "text-indigo-400" : "text-zinc-400"}`}>{s.label}</td>
                          <td className="px-3 py-2 text-right text-zinc-300 font-mono">R$ {s.newUSD.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-zinc-200 font-mono">{compactBRL(s.newVal)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${s.impactBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {s.pct === 0 ? "—" : `${s.impactBRL >= 0 ? "+" : ""}${compactBRL(s.impactBRL)}`}
                          </td>
                          <td className={`px-3 py-2 text-right font-mono ${s.ganhoPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {s.ganhoPct >= 0 ? "+" : ""}{s.ganhoPct.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-zinc-500">Cenário customizado:</span>
                  <input
                    type="range"
                    min={-50} max={50} step={5}
                    value={stressCustom}
                    onChange={e => setStressCustom(Number(e.target.value))}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                    style={{ background: `linear-gradient(to right, #f87171, #3f3f46 50%, #34d399)` }}
                  />
                  <span className={`text-xs font-bold w-12 text-right ${stressCustom >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {stressCustom > 0 ? "+" : ""}{stressCustom}%
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Summary ── */}
          <div className="glass-card p-5 mb-6 animate-fade-in">
            <h2 className="section-title mb-4">Resumo</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              <div>
                <span className="stat-label block mb-1">Total Enviado (BRL)</span>
                <span className="stat-value">{compactBRL(cambio.totalEnviadoBRL)}</span>
              </div>
              <div>
                <span className="stat-label block mb-1">Total Comprado (USD)</span>
                <span className="stat-value">$ {cambio.usdComprado.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="stat-label block mb-1">USD Disponível (net)</span>
                <span className="stat-value">$ {cambio.usdNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span className="stat-label block mb-1">Valor USD Hoje</span>
                <span className="stat-value">{brl(cambio.valorUsdHoje)}</span>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "operacoes" && (
        <>
          <h2 className="section-title mb-3">Histórico de Operações</h2>
          <DataTable data={rawData} columns={columns} />
        </>
      )}
    </>
  );
}

// ── Exposição Cambial Tab ────────────────────────────────────────────────────

function ExposicaoCambialTab({ portfolio }: { portfolio: PortfolioResponse }) {
  const [stressCustom, setStressCustom] = useState(0);

  const spot = portfolio.usdbrl ?? 0;
  const positions = portfolio.positions ?? [];

  const analysis = useMemo(() => {
    // Canônico: exposicaoCambial do snapshot (inclui posições + caixa fixa_aberta,
    // usando getMoedaExposicao → cripto vai pra "Cripto", não "USD")
    const expo = portfolio.exposicaoCambial ?? {};
    const totalExpostoAtualBRL = Object.entries(expo)
      .filter(([k]) => k !== "BRL" && k !== "Cripto")
      .reduce((s, [, v]) => s + v, 0);

    // Posições FX (exclui BRL e Cripto) — para decomposição ativo × câmbio
    const foreignPositions = positions.filter(p => {
      const me = getMoedaExposicao(p.setor, p.moeda);
      return me !== "BRL" && me !== "Cripto" && p.valorAtualBRL > 0;
    });

    type PosArray = typeof foreignPositions;
    const byMoeda: Record<string, { valorAtualBRL: number; custoTotalBRL: number; valorAtualNativo: number; positions: PosArray }> = {};
    for (const p of foreignPositions) {
      const m = getMoedaExposicao(p.setor, p.moeda);
      if (!byMoeda[m]) byMoeda[m] = { valorAtualBRL: 0, custoTotalBRL: 0, valorAtualNativo: 0, positions: [] };
      byMoeda[m].valorAtualBRL += p.valorAtualBRL;
      byMoeda[m].custoTotalBRL += p.custoTotalBRL;
      byMoeda[m].valorAtualNativo += p.valorAtual ?? 0;
      byMoeda[m].positions.push(p);
    }

    // Inclui caixa FX (fixa_aberta) no byMoeda — diferença entre canônico e posições
    for (const [moeda, valCanonical] of Object.entries(expo)) {
      if (moeda === "BRL" || moeda === "Cripto") continue;
      const posVal = byMoeda[moeda]?.valorAtualBRL ?? 0;
      const caixa = valCanonical - posVal;
      if (caixa >= 1) {
        if (!byMoeda[moeda]) byMoeda[moeda] = { valorAtualBRL: 0, custoTotalBRL: 0, valorAtualNativo: 0, positions: [] };
        byMoeda[moeda].valorAtualBRL = valCanonical;
      }
    }

    const positionsOnlyBRL = foreignPositions.reduce((s, p) => s + p.valorAtualBRL, 0);
    const totalCustoBRL = foreignPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
    const ganhoAtivoPuro = foreignPositions.reduce((s, p) => s + (p.ganhoAtivoPuroBRL ?? 0), 0);
    const ganhoFXPrincipal = foreignPositions.reduce((s, p) => s + (p.ganhoFXPrincipalBRL ?? 0), 0);
    const ganhoCruzado = foreignPositions.reduce((s, p) => s + (p.ganhoCruzadoBRL ?? 0), 0);
    const ganhoAtivo = ganhoAtivoPuro + ganhoCruzado;
    const ganhoCambio = ganhoFXPrincipal;
    const lucroTotal = positionsOnlyBRL - totalCustoBRL;
    const caixaFxBRL = totalExpostoAtualBRL - positionsOnlyBRL;

    return { foreignPositions, byMoeda, totalExpostoAtualBRL, totalCustoBRL, ganhoAtivoPuro, ganhoFXPrincipal, ganhoCruzado, ganhoAtivo, ganhoCambio, lucroTotal, caixaFxBRL };
  }, [positions, portfolio.exposicaoCambial]);

  const stressScenarios = useMemo(() => {
    const scenarios = [
      { label: "-30%", pct: -30 },
      { label: "-20%", pct: -20 },
      { label: "-10%", pct: -10 },
      { label: "-5%", pct: -5 },
      { label: "Atual", pct: 0 },
      { label: "+5%", pct: 5 },
      { label: "+10%", pct: 10 },
      { label: "+20%", pct: 20 },
      { label: "+30%", pct: 30 },
      ...(stressCustom !== 0 ? [{ label: `${stressCustom > 0 ? "+" : ""}${stressCustom}%`, pct: stressCustom }] : []),
    ].sort((a, b) => a.pct - b.pct);

    return scenarios.map(s => {
      const fxFactor = 1 + s.pct / 100;
      const newSpot = spot * fxFactor;
      const novoValorAtual = analysis.totalExpostoAtualBRL * fxFactor;
      const impactoAtual = novoValorAtual - analysis.totalExpostoAtualBRL;
      return { label: s.label, pct: s.pct, newSpot, novoValorAtual, impactoAtual };
    });
  }, [spot, analysis, stressCustom]);

  const patrimonioBRL = portfolio.totalPatrimonioBRL ?? 0;
  const pctExpostoFx = patrimonioBRL > 0 ? (analysis.totalExpostoAtualBRL / patrimonioBRL) * 100 : 0;

  // Split proporcional entre os três fatores (por contribuição absoluta)
  const absPuro = Math.abs(analysis.ganhoAtivoPuro);
  const absPrincipal = Math.abs(analysis.ganhoFXPrincipal);
  const absCruzado = Math.abs(analysis.ganhoCruzado);
  const absSoma = absPuro + absPrincipal + absCruzado;
  const pctFatorPuro = absSoma > 0 ? (absPuro / absSoma) * 100 : 33;
  const pctFatorPrincipal = absSoma > 0 ? (absPrincipal / absSoma) * 100 : 34;
  const pctFatorCruzado = 100 - pctFatorPuro - pctFatorPrincipal;
  const sign = (v: number) => (v >= 0 ? "+" : "");

  return (
    <div className="animate-fade-in">
      {/* ── Hero: Exposição Total ── */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={16} className="text-amber-400" />
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Exposição a Moeda Estrangeira</span>
        </div>
        <div className="text-3xl font-extrabold text-zinc-100 mb-1">
          {compactBRL(analysis.totalExpostoAtualBRL)}
        </div>
        <div className="text-xs text-zinc-500 mb-5">
          {pctExpostoFx.toFixed(1)}% do patrimônio total ({compactBRL(patrimonioBRL)}) está exposto a variação cambial
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <span className="stat-label block mb-1">Custo Posições</span>
            <span className="text-sm font-bold text-zinc-300">{compactBRL(analysis.totalCustoBRL)}</span>
          </div>
          <div>
            <span className="stat-label block mb-1">Ativo Puro</span>
            <span className={`text-sm font-bold ${analysis.ganhoAtivoPuro >= 0 ? "text-blue-400" : "text-red-400"}`}>
              {sign(analysis.ganhoAtivoPuro)}{compactBRL(analysis.ganhoAtivoPuro)}
            </span>
          </div>
          <div>
            <span className="stat-label block mb-1">FX Principal</span>
            <span className={`text-sm font-bold ${analysis.ganhoFXPrincipal >= 0 ? "text-amber-400" : "text-red-400"}`}>
              {sign(analysis.ganhoFXPrincipal)}{compactBRL(analysis.ganhoFXPrincipal)}
            </span>
          </div>
          <div>
            <span className="stat-label block mb-1">Cruzado</span>
            <span className={`text-sm font-bold ${analysis.ganhoCruzado >= 0 ? "text-purple-400" : "text-red-400"}`}>
              {sign(analysis.ganhoCruzado)}{compactBRL(analysis.ganhoCruzado)}
            </span>
          </div>
          {analysis.caixaFxBRL > 0 && (
            <div>
              <span className="stat-label block mb-1">Caixa FX</span>
              <span className="text-sm font-bold text-zinc-300">{compactBRL(analysis.caixaFxBRL)}</span>
            </div>
          )}
          <div>
            <span className="stat-label block mb-1">Spot USD/BRL</span>
            <span className="text-sm font-bold text-zinc-100">R$ {spot.toFixed(4)}</span>
          </div>
        </div>
      </div>

      {/* ── Decomposição de Três Fatores (centro da aba) ── */}
      <div className="glass-card p-6 mb-6">
        <h2 className="section-title mb-1"><BarChart3 size={15} />Decomposição de Três Fatores</h2>
        <p className="text-[11px] text-zinc-500 mb-5 max-w-2xl leading-relaxed">
          O resultado em BRL das suas posições no exterior se separa em <strong className="text-blue-400">três fatores</strong>:
          quanto o <strong>ativo puro</strong> rendeu (ao câmbio de custo), quanto a <strong className="text-amber-400">variação do câmbio</strong> impactou
          sobre o capital aportado, e o <strong className="text-purple-400">efeito cruzado</strong> (câmbio aplicado sobre o lucro do ativo).
        </p>

        {/* Custo → Valor atual (posições — caixa FX não tem decomposição) */}
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Custo BRL</div>
            <div className="text-lg font-bold text-zinc-300">{compactBRL(analysis.totalCustoBRL)}</div>
          </div>
          <ArrowLeftRight size={16} className="text-zinc-700 shrink-0" />
          <div className="text-right">
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Valor Atual BRL</div>
            <div className="text-lg font-bold text-zinc-100">{compactBRL(analysis.totalExpostoAtualBRL)}</div>
            {analysis.caixaFxBRL > 0 && (
              <div className="text-[9px] text-zinc-600">inclui {compactBRL(analysis.caixaFxBRL)} em caixa FX</div>
            )}
          </div>
        </div>

        {/* Os três fatores */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="rounded-xl p-4" style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.15)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
              <span className="text-xs font-bold text-zinc-200">Ativo Puro</span>
            </div>
            <div className={`text-2xl font-extrabold ${analysis.ganhoAtivoPuro >= 0 ? "text-blue-400" : "text-red-400"}`}>
              {sign(analysis.ganhoAtivoPuro)}{compactBRL(analysis.ganhoAtivoPuro)}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">(V1−V0) × P0 — rendimento do ativo convertido ao câmbio de custo.</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "rgba(232,163,61,0.05)", border: "1px solid rgba(232,163,61,0.15)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span className="text-xs font-bold text-zinc-200">FX Principal</span>
            </div>
            <div className={`text-2xl font-extrabold ${analysis.ganhoFXPrincipal >= 0 ? "text-amber-400" : "text-red-400"}`}>
              {sign(analysis.ganhoFXPrincipal)}{compactBRL(analysis.ganhoFXPrincipal)}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">V0 × (P1−P0) — impacto do dólar sobre o capital aportado.</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.15)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
              <span className="text-xs font-bold text-zinc-200">Cruzado</span>
            </div>
            <div className={`text-2xl font-extrabold ${analysis.ganhoCruzado >= 0 ? "text-purple-400" : "text-red-400"}`}>
              {sign(analysis.ganhoCruzado)}{compactBRL(analysis.ganhoCruzado)}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">(V1−V0) × (P1−P0) — efeito do câmbio sobre o lucro do ativo.</p>
          </div>
        </div>

        {/* Barra de proporção entre os fatores */}
        <div className="h-2.5 w-full rounded-full overflow-hidden flex mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div style={{ width: `${pctFatorPuro}%`, background: "#3b82f6" }} />
          <div style={{ width: `${pctFatorPrincipal}%`, background: "#E8A33D" }} />
          <div style={{ width: `${pctFatorCruzado}%`, background: "#a855f7" }} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-4">
          <span>Ativo {pctFatorPuro.toFixed(0)}%</span>
          <span>FX {pctFatorPrincipal.toFixed(0)}%</span>
          <span>Cruzado {pctFatorCruzado.toFixed(0)}%</span>
        </div>

        {/* Identidade: soma dos fatores = lucro total */}
        <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
          <span className="text-xs text-zinc-400">
            Ativo <span className="text-blue-400 font-semibold">{sign(analysis.ganhoAtivoPuro)}{compactBRL(analysis.ganhoAtivoPuro)}</span>
            {" + "}FX <span className="text-amber-400 font-semibold">{sign(analysis.ganhoFXPrincipal)}{compactBRL(analysis.ganhoFXPrincipal)}</span>
            {" + "}Cruzado <span className="text-purple-400 font-semibold">{sign(analysis.ganhoCruzado)}{compactBRL(analysis.ganhoCruzado)}</span>
          </span>
          <span className="text-right">
            <span className="text-[9px] text-zinc-600 uppercase block">Resultado total</span>
            <span className={`text-base font-extrabold ${analysis.lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {sign(analysis.lucroTotal)}{compactBRL(analysis.lucroTotal)}
            </span>
          </span>
        </div>
      </div>

      {/* ── Decomposição por ativo ── */}
      <FxDecomposition positions={analysis.foreignPositions} />

      {/* ── Exposição por moeda ── */}
      {Object.keys(analysis.byMoeda).length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="section-title mb-4"><Layers size={15} />Exposição por Moeda</h2>
          <div className={`grid gap-4 ${Object.keys(analysis.byMoeda).length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
            {Object.entries(analysis.byMoeda)
              .sort((a, b) => b[1].valorAtualBRL - a[1].valorAtualBRL)
              .map(([moeda, info]) => {
                const color = FX_COLORS[moeda] ?? "#64748b";
                const posVal = info.positions.reduce((s, p) => s + p.valorAtualBRL, 0);
                const caixa = info.valorAtualBRL - posVal;
                const pctPortfolio = patrimonioBRL > 0 ? (info.valorAtualBRL / patrimonioBRL) * 100 : 0;
                const nAtivos = info.positions.length;
                const descParts = [nAtivos > 0 ? `${nAtivos} ativos` : null, caixa >= 1 ? "caixa" : null].filter(Boolean).join(" + ");
                return (
                  <div key={moeda} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}20` }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{moeda === "USD" ? "🇺🇸" : moeda === "EUR" ? "🇪🇺" : moeda === "GBP" ? "🇬🇧" : moeda === "CAD" ? "🇨🇦" : "🌐"}</span>
                        <div>
                          <span className="text-sm font-bold" style={{ color }}>{moeda}</span>
                          <span className="text-[10px] text-zinc-600 ml-2">{descParts} · {pctPortfolio.toFixed(1)}% do portfólio</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-zinc-100">{compactBRL(info.valorAtualBRL)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {info.positions
                        .sort((a, b) => b.valorAtualBRL - a.valorAtualBRL)
                        .slice(0, 10)
                        .map(p => (
                          <span key={p.ticker} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${color}15`, color: `${color}cc`, border: `1px solid ${color}25` }}>
                            {p.ticker.replace(/\.SA$/, "")} {compactBRL(p.valorAtualBRL)}
                          </span>
                        ))}
                      {caixa >= 1 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "#a1a1aa", border: "1px solid rgba(255,255,255,0.08)" }}>
                          Caixa {compactBRL(caixa)}
                        </span>
                      )}
                      {info.positions.length > 10 && (
                        <span className="text-[10px] px-2 py-0.5 text-zinc-600">+{info.positions.length - 10}</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Stress Test — sensibilidade da exposição ao câmbio ── */}
      <div className="glass-card p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title"><Zap size={15} />Teste de Estresse — Sensibilidade ao Câmbio</h2>
          <span className="text-[10px] text-zinc-600">
            Spot: R$ {spot.toFixed(2)} · Exposição: {compactBRL(analysis.totalExpostoAtualBRL)}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 mb-5">
          Quanto a sua <strong className="text-blue-400">exposição atual</strong> ({compactBRL(analysis.totalExpostoAtualBRL)})
          varia em BRL para cada movimento do dólar.
        </p>

        {/* Chart */}
        <div className="mb-5">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stressScenarios} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(v: number) => [compactBRL(v), "Impacto no valor atual"]}
                labelFormatter={l => `Cenário: ${l}`} />
              <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
              <Bar dataKey="impactoAtual" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {stressScenarios.map((entry, i) => (
                  <Cell key={i} fill={entry.pct === 0 ? "#6366f1" : entry.impactoAtual >= 0 ? "#3b82f6" : "#60a5fa"} fillOpacity={entry.pct === 0 ? 0.4 : 0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Cenário", "USD/BRL", "Valor Atual", "Δ Valor"].map(h => (
                  <th key={h} className="px-3 py-2 text-[9px] text-zinc-500 font-semibold uppercase tracking-wider text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stressScenarios.map((s, i) => (
                <tr key={i} className={`border-b border-zinc-900 ${s.pct === 0 ? "bg-indigo-500/5" : "hover:bg-white/[0.02]"}`}>
                  <td className={`px-3 py-2 font-semibold ${s.pct === 0 ? "text-indigo-400" : "text-zinc-400"}`}>{s.label}</td>
                  <td className="px-3 py-2 text-right text-zinc-300 font-mono">R$ {s.newSpot.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-zinc-200 font-mono">{compactBRL(s.novoValorAtual)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${s.impactoAtual >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {s.pct === 0 ? "—" : `${s.impactoAtual >= 0 ? "+" : ""}${compactBRL(s.impactoAtual)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Custom slider */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500">Cenário customizado:</span>
          <input
            type="range"
            min={-50} max={50} step={5}
            value={stressCustom}
            onChange={e => setStressCustom(Number(e.target.value))}
            className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
            style={{ background: "linear-gradient(to right, #f87171, #3f3f46 50%, #34d399)" }}
          />
          <span className={`text-xs font-bold w-12 text-right ${stressCustom >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {stressCustom > 0 ? "+" : ""}{stressCustom}%
          </span>
        </div>
      </div>

    </div>
  );
}

// ── Decomposição Ativo vs FX por posição ─────────────────────────────────────

function FxDecomposition({ positions }: {
  positions: { ticker: string; valorAtualBRL: number; ganhoAtivoPuroBRL: number | null; ganhoFXPrincipalBRL: number | null; ganhoCruzadoBRL: number | null }[];
}) {
  const sorted = useMemo(() =>
    [...positions]
      .filter(p => p.valorAtualBRL > 0)
      .sort((a, b) => b.valorAtualBRL - a.valorAtualBRL)
      .slice(0, 12),
    [positions]
  );

  if (sorted.length === 0) return null;

  const chartData = sorted.map(p => ({
    ticker: p.ticker.replace(/\.SA$/, "").replace(/-USD$/, ""),
    ativo: p.ganhoAtivoPuroBRL ?? 0,
    fx: p.ganhoFXPrincipalBRL ?? 0,
    cruzado: p.ganhoCruzadoBRL ?? 0,
    total: (p.ganhoAtivoPuroBRL ?? 0) + (p.ganhoFXPrincipalBRL ?? 0) + (p.ganhoCruzadoBRL ?? 0),
  }));

  const totalPuro = positions.reduce((s, p) => s + (p.ganhoAtivoPuroBRL ?? 0), 0);
  const totalFX = positions.reduce((s, p) => s + (p.ganhoFXPrincipalBRL ?? 0), 0);
  const totalCruzado = positions.reduce((s, p) => s + (p.ganhoCruzadoBRL ?? 0), 0);
  const totalGeral = totalPuro + totalFX + totalCruzado;

  return (
    <div className="glass-card p-5 mb-6">
      <h2 className="section-title mb-1"><BarChart3 size={15} />Decomposição por Ativo</h2>
      <p className="text-[10px] text-zinc-500 mb-4">
        Os mesmos três fatores, abertos por posição: ativo puro (azul), FX principal (dourado) e cruzado (roxo).
      </p>

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-zinc-500">Ativo puro</span>
            <span className={`text-xs font-bold ml-auto ${totalPuro >= 0 ? "text-blue-400" : "text-red-400"}`}>
              {totalPuro >= 0 ? "+" : ""}{compactBRL(totalPuro)}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] text-zinc-500">FX principal</span>
            <span className={`text-xs font-bold ml-auto ${totalFX >= 0 ? "text-amber-400" : "text-red-400"}`}>
              {totalFX >= 0 ? "+" : ""}{compactBRL(totalFX)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-[10px] text-zinc-500">Cruzado</span>
            <span className={`text-xs font-bold ml-auto ${totalCruzado >= 0 ? "text-purple-400" : "text-red-400"}`}>
              {totalCruzado >= 0 ? "+" : ""}{compactBRL(totalCruzado)}
            </span>
          </div>
        </div>
        <div className="text-right border-l border-white/5 pl-3">
          <div className="text-[9px] text-zinc-600 uppercase">Total</div>
          <div className={`text-sm font-bold ${totalGeral >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalGeral >= 0 ? "+" : ""}{compactBRL(totalGeral)}
          </div>
        </div>
      </div>

      {/* Stacked bar chart */}
      <ResponsiveContainer width="100%" height={Math.max(200, sorted.length * 28 + 40)}>
        <BarChart data={chartData} layout="vertical" barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={v => compactBRL(v)} />
          <YAxis type="category" dataKey="ticker" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
            formatter={(v: number, name: string) => [
              compactBRL(v),
              name === "ativo" ? "Ativo puro" : name === "fx" ? "FX principal" : "Cruzado",
            ]} />
          <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} />
          <Bar dataKey="ativo" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={18} />
          <Bar dataKey="fx" stackId="a" fill="#E8A33D" radius={[0, 0, 0, 0]} maxBarSize={18} />
          <Bar dataKey="cruzado" stackId="a" fill="#a855f7" radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

