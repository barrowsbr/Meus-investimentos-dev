"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { ArrowLeftRight, DollarSign, TrendingUp, TrendingDown, Scale, Layers, Zap, ShieldAlert, Crosshair, ShieldCheck, BarChart3 } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import type { PortfolioResponse } from "@/lib/hooks";
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
              style={active ? { background: "rgba(212,165,116,0.12)", boxShadow: "0 2px 8px rgba(212,165,116,0.08)" } : {}}
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
                glowColor="#d4a574"
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

          {/* ── FX History Chart ── */}
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
  const cambio = portfolio.cambio;
  const positions = portfolio.positions ?? [];

  const analysis = useMemo(() => {
    const foreignPositions = positions.filter(
      p => p.moeda !== "BRL" && p.valorAtualBRL > 0
    );

    const byMoeda: Record<string, { valorAtualBRL: number; custoTotalBRL: number; valorAtualNativo: number; positions: typeof foreignPositions }> = {};
    for (const p of foreignPositions) {
      const m = p.moeda || "USD";
      if (!byMoeda[m]) byMoeda[m] = { valorAtualBRL: 0, custoTotalBRL: 0, valorAtualNativo: 0, positions: [] };
      byMoeda[m].valorAtualBRL += p.valorAtualBRL;
      byMoeda[m].custoTotalBRL += p.custoTotalBRL;
      byMoeda[m].valorAtualNativo += p.valorAtual ?? 0;
      byMoeda[m].positions.push(p);
    }

    const totalExpostoAtualBRL = foreignPositions.reduce((s, p) => s + p.valorAtualBRL, 0);
    const totalCustoBRL = foreignPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
    const ganhoAtivo = foreignPositions.reduce((s, p) => s + (p.ganhoAtivoBRL ?? 0), 0);
    const ganhoCambio = foreignPositions.reduce((s, p) => s + (p.ganhoCambioBRL ?? 0), 0);

    const remessaCusto = cambio?.totalCustoBRL ?? 0;
    const remessaValorHoje = cambio?.totalValBRL ?? 0;
    const ganhoCambialRemessa = cambio?.ganhoTotal_BRL ?? 0;

    return {
      foreignPositions,
      byMoeda,
      totalExpostoAtualBRL,
      totalCustoBRL,
      ganhoAtivo,
      ganhoCambio,
      remessaCusto,
      remessaValorHoje,
      ganhoCambialRemessa,
    };
  }, [positions, cambio]);

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

      const novoValorRemessa = analysis.remessaValorHoje * fxFactor;
      const impactoRemessa = novoValorRemessa - analysis.remessaValorHoje;
      const ganhoPerdaVsCusto = novoValorRemessa - analysis.remessaCusto;

      return {
        label: s.label,
        pct: s.pct,
        newSpot,
        novoValorAtual,
        impactoAtual,
        impactoRemessa,
        ganhoPerdaVsCusto,
        ganhoPerdaVsCustoPct: analysis.remessaCusto > 0 ? (ganhoPerdaVsCusto / analysis.remessaCusto) * 100 : 0,
      };
    });
  }, [spot, analysis, stressCustom]);

  const breakEvenSpot = analysis.remessaCusto > 0 && analysis.remessaValorHoje > 0
    ? spot * (analysis.remessaCusto / analysis.remessaValorHoje)
    : null;

  const patrimonioBRL = portfolio.totalPatrimonioBRL ?? 0;
  const pctExpostoFx = patrimonioBRL > 0 ? (analysis.totalExpostoAtualBRL / patrimonioBRL) * 100 : 0;

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="stat-label block mb-1">Custo em BRL</span>
            <span className="text-sm font-bold text-zinc-300">{compactBRL(analysis.totalCustoBRL)}</span>
          </div>
          <div>
            <span className="stat-label block mb-1">Ganho dos Ativos</span>
            <span className={`text-sm font-bold ${analysis.ganhoAtivo >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {analysis.ganhoAtivo >= 0 ? "+" : ""}{compactBRL(analysis.ganhoAtivo)}
            </span>
          </div>
          <div>
            <span className="stat-label block mb-1">Efeito Câmbio</span>
            <span className={`text-sm font-bold ${analysis.ganhoCambio >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {analysis.ganhoCambio >= 0 ? "+" : ""}{compactBRL(analysis.ganhoCambio)}
            </span>
          </div>
          <div>
            <span className="stat-label block mb-1">Spot USD/BRL</span>
            <span className="text-sm font-bold text-zinc-100">R$ {spot.toFixed(4)}</span>
            {breakEvenSpot && (
              <span className="text-[10px] text-zinc-600 block">break-even R$ {breakEvenSpot.toFixed(2)}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Os dois conceitos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Conceito 1: O que mandei */}
        <div className="glass-card p-5" style={{ borderColor: "rgba(59,130,246,0.15)" }}>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-blue-400" />
            <div>
              <div className="text-sm font-bold text-zinc-100">Câmbio vs Remessas</div>
              <div className="text-[10px] text-zinc-500">Quanto ganhei ou perdi sobre o dinheiro que enviei ao exterior</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-zinc-500">BRL enviado (custo remessas)</span>
              <span className="text-sm font-bold text-zinc-300">{compactBRL(analysis.remessaCusto)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-zinc-500">Valor hoje (FX spot)</span>
              <span className="text-sm font-bold text-zinc-100">{compactBRL(analysis.remessaValorHoje)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-xs text-zinc-400 font-semibold">Resultado cambial</span>
              <div className="text-right">
                <span className={`text-base font-extrabold ${analysis.ganhoCambialRemessa >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {analysis.ganhoCambialRemessa >= 0 ? "+" : ""}{compactBRL(analysis.ganhoCambialRemessa)}
                </span>
                {analysis.remessaCusto > 0 && (
                  <span className={`text-xs ml-2 ${analysis.ganhoCambialRemessa >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                    {analysis.ganhoCambialRemessa >= 0 ? "+" : ""}{((analysis.ganhoCambialRemessa / analysis.remessaCusto) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.12)" }}>
            <p className="text-[10px] text-blue-300/80 leading-relaxed">
              Este é o ganho/perda <strong>puro do câmbio</strong> sobre as remessas. Se o dólar sobe, você ganha aqui.
              Se cai, perde — mas só sobre o que efetivamente mandou.
            </p>
          </div>
        </div>

        {/* Conceito 2: O que tenho hoje */}
        <div className="glass-card p-5" style={{ borderColor: "rgba(212,165,116,0.15)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Crosshair size={16} className="text-amber-400" />
            <div>
              <div className="text-sm font-bold text-zinc-100">Câmbio vs Valor Atual</div>
              <div className="text-[10px] text-zinc-500">Quanto perco ou ganho sobre TUDO que tenho lá fora hoje</div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-zinc-500">Custo BRL das posições</span>
              <span className="text-sm font-bold text-zinc-300">{compactBRL(analysis.totalCustoBRL)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-zinc-500">Valor atual em BRL</span>
              <span className="text-sm font-bold text-zinc-100">{compactBRL(analysis.totalExpostoAtualBRL)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-white/5">
              <span className="text-xs text-zinc-500">Lucro dos ativos em BRL</span>
              <span className={`text-sm font-bold ${analysis.ganhoAtivo >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {analysis.ganhoAtivo >= 0 ? "+" : ""}{compactBRL(analysis.ganhoAtivo)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-xs text-zinc-400 font-semibold">Exposição total ao FX</span>
              <span className="text-base font-extrabold text-amber-400">{compactBRL(analysis.totalExpostoAtualBRL)}</span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl" style={{ background: "rgba(212,165,116,0.06)", border: "1px solid rgba(212,165,116,0.12)" }}>
            <p className="text-[10px] text-amber-300/80 leading-relaxed">
              Seus ativos valorizaram e agora a <strong>exposição cambial é maior</strong> que o valor enviado.
              Uma queda de 10% no dólar afeta {compactBRL(analysis.totalExpostoAtualBRL * 0.1)}, não apenas {compactBRL(analysis.remessaCusto * 0.1)}.
            </p>
          </div>
        </div>
      </div>

      {/* ── Exposição por moeda ── */}
      {Object.keys(analysis.byMoeda).length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h2 className="section-title mb-4"><Layers size={15} />Exposição por Moeda</h2>
          <div className={`grid gap-4 ${Object.keys(analysis.byMoeda).length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
            {Object.entries(analysis.byMoeda)
              .sort((a, b) => b[1].valorAtualBRL - a[1].valorAtualBRL)
              .map(([moeda, info]) => {
                const color = FX_COLORS[moeda] ?? "#64748b";
                const lucroBRL = info.valorAtualBRL - info.custoTotalBRL;
                const pctPortfolio = patrimonioBRL > 0 ? (info.valorAtualBRL / patrimonioBRL) * 100 : 0;
                return (
                  <div key={moeda} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}20` }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{moeda === "USD" ? "🇺🇸" : moeda === "EUR" ? "🇪🇺" : moeda === "GBP" ? "🇬🇧" : moeda === "CAD" ? "🇨🇦" : "🌐"}</span>
                        <div>
                          <span className="text-sm font-bold" style={{ color }}>{moeda}</span>
                          <span className="text-[10px] text-zinc-600 ml-2">{info.positions.length} ativos · {pctPortfolio.toFixed(1)}% do portfólio</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-zinc-100">{compactBRL(info.valorAtualBRL)}</div>
                        <div className={`text-[10px] font-semibold ${lucroBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {lucroBRL >= 0 ? "+" : ""}{compactBRL(lucroBRL)}
                        </div>
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

      {/* ── Stress Test Comparativo ── */}
      <div className="glass-card p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="section-title"><Zap size={15} />Teste de Estresse — Dois Cenários</h2>
          <span className="text-[10px] text-zinc-600">
            Spot: R$ {spot.toFixed(2)} · Exposição: {compactBRL(analysis.totalExpostoAtualBRL)}
          </span>
        </div>
        <p className="text-[10px] text-zinc-500 mb-5">
          <strong className="text-blue-400">Azul</strong> = impacto sobre o <strong>valor atual</strong> (o que tenho) ·
          <strong className="text-amber-400 ml-1">Dourado</strong> = resultado vs <strong>custo das remessas</strong> (o que mandei)
        </p>

        {/* Chart */}
        <div className="mb-5">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stressScenarios} barCategoryGap="12%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [
                  compactBRL(v),
                  name === "impactoAtual" ? "Impacto no valor atual" : "Resultado vs custo",
                ]}
                labelFormatter={l => `Cenário: ${l}`} />
              <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
              <Bar dataKey="impactoAtual" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {stressScenarios.map((entry, i) => (
                  <Cell key={i} fill={entry.pct === 0 ? "#6366f1" : entry.impactoAtual >= 0 ? "#3b82f6" : "#60a5fa"} fillOpacity={entry.pct === 0 ? 0.4 : 0.75} />
                ))}
              </Bar>
              <Bar dataKey="ganhoPerdaVsCusto" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {stressScenarios.map((entry, i) => (
                  <Cell key={i} fill={entry.pct === 0 ? "#6366f1" : entry.ganhoPerdaVsCusto >= 0 ? "#d4a574" : "#f59e0b"} fillOpacity={entry.pct === 0 ? 0.4 : 0.65} />
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
                {["Cenário", "USD/BRL", "Valor Atual", "Δ Valor", "vs Custo Remessa", "vs Custo %"].map(h => (
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
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${s.ganhoPerdaVsCusto >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {s.ganhoPerdaVsCusto >= 0 ? "+" : ""}{compactBRL(s.ganhoPerdaVsCusto)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${s.ganhoPerdaVsCustoPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {s.ganhoPerdaVsCustoPct >= 0 ? "+" : ""}{s.ganhoPerdaVsCustoPct.toFixed(1)}%
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

      {/* ── Insight: diferença entre os dois ── */}
      {analysis.totalExpostoAtualBRL > analysis.remessaCusto && (
        <div className="glass-card p-5 mb-6" style={{ borderColor: "rgba(212,165,116,0.12)" }}>
          <h2 className="section-title mb-3"><TrendingUp size={15} />Por que a exposição é maior que as remessas?</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Remessas (custo BRL)</div>
              <div className="text-lg font-bold text-zinc-300">{compactBRL(analysis.remessaCusto)}</div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Valorização ativos + FX</div>
              <div className={`text-lg font-bold ${analysis.totalExpostoAtualBRL - analysis.remessaCusto >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                +{compactBRL(analysis.totalExpostoAtualBRL - analysis.remessaCusto)}
              </div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: "rgba(212,165,116,0.04)", border: "1px solid rgba(212,165,116,0.12)" }}>
              <div className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1">Exposição real ao FX</div>
              <div className="text-lg font-bold text-amber-400">{compactBRL(analysis.totalExpostoAtualBRL)}</div>
            </div>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Você enviou <strong className="text-zinc-300">{compactBRL(analysis.remessaCusto)}</strong> ao exterior,
            mas seus ativos cresceram para <strong className="text-zinc-300">{compactBRL(analysis.totalExpostoAtualBRL)}</strong>.
            Uma variação de 10% no câmbio agora afeta <strong className="text-amber-400">{compactBRL(analysis.totalExpostoAtualBRL * 0.1)}</strong> do
            seu patrimônio — {analysis.remessaCusto > 0 ? ((analysis.totalExpostoAtualBRL / analysis.remessaCusto) * 100 - 100).toFixed(0) : "∞"}% a mais
            do que afetaria sobre o valor remitido ({compactBRL(analysis.remessaCusto * 0.1)}).
          </p>
        </div>
      )}

      {/* ── Seção 1: Custo de Oportunidade do Hedge ── */}
      <HedgeOpportunity
        remessaCusto={analysis.remessaCusto}
        remessaValorHoje={analysis.remessaValorHoje}
        ganhoCambial={analysis.ganhoCambialRemessa}
        pmDolar={cambio?.pmDolar ?? 0}
        spot={spot}
      />

      {/* ── Seção 2: Decomposição Ativo vs Câmbio por posição ── */}
      <FxDecomposition positions={analysis.foreignPositions} total={analysis.totalExpostoAtualBRL} />

    </div>
  );
}

// ── Seção 1: Hedge Opportunity ───────────────────────────────────────────────

function HedgeOpportunity({ remessaCusto, remessaValorHoje, ganhoCambial, pmDolar, spot }: {
  remessaCusto: number; remessaValorHoje: number; ganhoCambial: number; pmDolar: number; spot: number;
}) {
  if (remessaCusto <= 0 || pmDolar <= 0) return null;

  const hedgeCost_pctYear = 4.5;
  const years = 3;
  const custoHedge = remessaCusto * (hedgeCost_pctYear / 100) * years;

  const cenarioHedge = remessaCusto;
  const cenarioAberto = remessaValorHoje;
  const diferencaVsHedge = cenarioAberto - cenarioHedge;

  const teriaPagoPct = remessaCusto > 0 ? (custoHedge / remessaCusto) * 100 : 0;

  return (
    <div className="glass-card p-5 mb-6" style={{ borderColor: "rgba(139,92,246,0.12)" }}>
      <h2 className="section-title mb-1"><ShieldCheck size={15} />Hedge: valia a pena proteger?</h2>
      <p className="text-[10px] text-zinc-500 mb-5">
        Comparação entre manter exposição aberta (o que você fez) vs ter hedgeado 100% no PM.
        Custo estimado do hedge: ~{hedgeCost_pctYear}% a.a. (NDF típico BRL/USD).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-4 rounded-xl" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.12)" }}>
          <div className="text-[10px] text-violet-400/80 uppercase tracking-wider mb-1">Se hedgeou 100% no PM</div>
          <div className="text-lg font-bold text-zinc-300">{compactBRL(cenarioHedge)}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Travou no PM R$ {pmDolar.toFixed(2)}</div>
          <div className="text-[10px] text-red-400/80 mt-0.5">Custo do hedge: −{compactBRL(custoHedge)} ({teriaPagoPct.toFixed(1)}%)</div>
          <div className="text-xs font-bold text-zinc-400 mt-1">Líquido: {compactBRL(cenarioHedge - custoHedge)}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.12)" }}>
          <div className="text-[10px] text-blue-400/80 uppercase tracking-wider mb-1">Exposição aberta (o que fez)</div>
          <div className="text-lg font-bold text-zinc-100">{compactBRL(cenarioAberto)}</div>
          <div className="text-[10px] text-zinc-500 mt-1">Spot atual R$ {spot.toFixed(2)}</div>
          <div className={`text-[10px] mt-0.5 ${ganhoCambial >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
            Ganho cambial: {ganhoCambial >= 0 ? "+" : ""}{compactBRL(ganhoCambial)}
          </div>
          <div className="text-xs font-bold text-zinc-200 mt-1">Líquido: {compactBRL(cenarioAberto)}</div>
        </div>
        <div className="p-4 rounded-xl" style={{ background: diferencaVsHedge >= 0 ? "rgba(34,197,94,0.05)" : "rgba(248,113,113,0.05)", border: `1px solid ${diferencaVsHedge >= 0 ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.15)"}` }}>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Veredito</div>
          <div className={`text-lg font-bold ${diferencaVsHedge >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {diferencaVsHedge >= 0 ? "+" : ""}{compactBRL(diferencaVsHedge)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            {diferencaVsHedge >= 0
              ? "Manter aberto foi melhor que hedgear"
              : "Teria sido melhor hedgear"}
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            vs hedge líquido: {compactBRL(cenarioAberto - (cenarioHedge - custoHedge))}
          </div>
        </div>
      </div>

      <div className="p-3 rounded-xl" style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.08)" }}>
        <p className="text-[10px] text-violet-300/70 leading-relaxed">
          Um NDF (Non-Deliverable Forward) BRL/USD de ~{hedgeCost_pctYear}% a.a. reflete o diferencial de juros (CDI − Fed Funds).
          Hedgear elimina o risco cambial mas custa caro. A decisão depende da sua visão de câmbio e tolerância ao risco.
        </p>
      </div>
    </div>
  );
}

// ── Seção 2: Decomposição Ativo vs FX por posição ────────────────────────────

function FxDecomposition({ positions, total }: {
  positions: { ticker: string; valorAtualBRL: number; ganhoAtivoBRL: number | null; ganhoCambioBRL: number | null }[];
  total: number;
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
    ativo: p.ganhoAtivoBRL ?? 0,
    cambio: p.ganhoCambioBRL ?? 0,
    total: (p.ganhoAtivoBRL ?? 0) + (p.ganhoCambioBRL ?? 0),
  }));

  const totalAtivo = positions.reduce((s, p) => s + (p.ganhoAtivoBRL ?? 0), 0);
  const totalCambio = positions.reduce((s, p) => s + (p.ganhoCambioBRL ?? 0), 0);

  return (
    <div className="glass-card p-5 mb-6">
      <h2 className="section-title mb-1"><BarChart3 size={15} />Decomposição: Ativo vs Câmbio</h2>
      <p className="text-[10px] text-zinc-500 mb-4">
        Quanto de cada posição veio de valorização do ativo e quanto veio da variação cambial.
      </p>

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-[10px] text-zinc-500">Ganho dos ativos</span>
            <span className={`text-xs font-bold ml-auto ${totalAtivo >= 0 ? "text-blue-400" : "text-red-400"}`}>
              {totalAtivo >= 0 ? "+" : ""}{compactBRL(totalAtivo)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[10px] text-zinc-500">Efeito câmbio</span>
            <span className={`text-xs font-bold ml-auto ${totalCambio >= 0 ? "text-amber-400" : "text-red-400"}`}>
              {totalCambio >= 0 ? "+" : ""}{compactBRL(totalCambio)}
            </span>
          </div>
        </div>
        <div className="text-right border-l border-white/5 pl-3">
          <div className="text-[9px] text-zinc-600 uppercase">Total</div>
          <div className={`text-sm font-bold ${totalAtivo + totalCambio >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalAtivo + totalCambio >= 0 ? "+" : ""}{compactBRL(totalAtivo + totalCambio)}
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
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              compactBRL(v),
              name === "ativo" ? "Ganho ativo" : "Efeito câmbio",
            ]} />
          <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} />
          <Bar dataKey="ativo" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={18} />
          <Bar dataKey="cambio" stackId="a" fill="#d4a574" radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

