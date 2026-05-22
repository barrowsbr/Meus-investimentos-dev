"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Landmark,
  Coins,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  Globe,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct, shortMonth } from "@/lib/format";
import { isRendaVariavel } from "@/lib/sectors";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const COLORS = [
  "#d4a574", "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316",
];

const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#3b82f6",
  "Ações Internacional": "#8b5cf6",
  "ETF USA": "#06b6d4",
  "ETF": "#10b981",
  "FIIs": "#f59e0b",
  "Cripto": "#f97316",
  "Commodities": "#eab308",
  "BDRs": "#ec4899",
  "Renda Fixa": "#6366f1",
  "Renda Fixa USD": "#a78bfa",
};

const CURRENCY_COLORS: Record<string, string> = {
  BRL: "#3b82f6",
  USD: "#10b981",
  EUR: "#8b5cf6",
  GBP: "#f59e0b",
  CAD: "#ef4444",
};

export default function Dashboard() {
  const { data, loading, error } = usePortfolio();

  const monthlyDividends = useMemo(() => {
    if (!data?.proventosMensais) return [];
    return Object.entries(data.proventosMensais)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, total]) => ({ month: shortMonth(month), total }));
  }, [data]);

  const sectorData = useMemo(() => {
    if (!data?.setorAlocacao) return [];
    return Object.entries(data.setorAlocacao)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const currencyData = useMemo(() => {
    if (!data?.exposicaoCambial) return [];
    return Object.entries(data.exposicaoCambial)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const evolutionData = useMemo(() => {
    if (!data?.lbHistoric || data.lbHistoric.length === 0) return [];
    return data.lbHistoric.slice(-24).map((p) => ({
      data: shortMonth(p.data),
      patrimonio: p.patrimonio,
      rv: p.rv,
      rf: p.rf,
    }));
  }, [data]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return <ErrorAlert message="Dados não disponíveis" />;

  const rvPositions = data.positions.filter((p) => isRendaVariavel(p.setor));
  const lucroPctStr = pct(data.lucroPct);
  const pmVsSpot = data.cambio?.pmDolar
    ? ((data.usdbrl / data.cambio.pmDolar - 1) * 100)
    : 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos seus investimentos"
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="animate-fade-in">
          <MetricCard
            label="Patrimônio Total"
            value={compactBRL(data.totalPatrimonioBRL)}
            sub={`RV ${compactBRL(data.rvPatrimonioBRL)} + RF ${compactBRL(data.rfPatrimonioBRL)}`}
            icon={<Wallet size={18} />}
            glowColor="#d4a574"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Renda Variável"
            value={compactBRL(data.rvPatrimonioBRL)}
            sub={`${rvPositions.length} ativos`}
            icon={<BarChart3 size={18} />}
            glowColor="#3b82f6"
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="Renda Fixa"
            value={compactBRL(data.rfPatrimonioBRL)}
            icon={<Landmark size={18} />}
            glowColor="#8b5cf6"
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Lucro RV"
            value={brl(data.lucroBRL)}
            sub={`${lucroPctStr} | Ativo ${compactBRL(data.ganhoAtivoTotalBRL)} | Câmbio ${compactBRL(data.ganhoCambioTotalBRL)}`}
            icon={data.lucroBRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            trend={data.lucroBRL >= 0 ? "up" : "down"}
            glowColor={data.lucroBRL >= 0 ? "#4ade80" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-4">
          <MetricCard
            label="Proventos"
            value={compactBRL(data.totalProventosBRL)}
            icon={<Coins size={18} />}
            glowColor="#f59e0b"
          />
        </div>
        <div className="animate-fade-in animate-delay-5">
          <MetricCard
            label="Dólar"
            value={`R$ ${data.usdbrl.toFixed(2)}`}
            sub={`PM R$ ${data.cambio?.pmDolar?.toFixed(2) ?? "—"} (${pmVsSpot >= 0 ? "+" : ""}${pmVsSpot.toFixed(1)}%) | EUR ${data.eurbrl.toFixed(2)}`}
            icon={<DollarSign size={18} />}
            trend={pmVsSpot >= 0 ? "up" : "down"}
            glowColor="#10b981"
          />
        </div>
      </div>

      {/* Evolution + Sector Allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {evolutionData.length > 0 ? (
          <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
            <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
              <ArrowUpRight size={14} />
              Evolução Patrimonial
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolutionData}>
                <defs>
                  <linearGradient id="gradRV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="data" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa", fontSize: 12 }}
                  formatter={(v: number, name: string) => [brl(v), name === "rv" ? "Renda Variável" : "Renda Fixa"]}
                />
                <Area type="monotone" dataKey="rv" stroke="#3b82f6" fill="url(#gradRV)" strokeWidth={2} name="rv" />
                <Area type="monotone" dataKey="rf" stroke="#8b5cf6" fill="url(#gradRF)" strokeWidth={2} name="rf" />
                <Legend formatter={(value) => value === "rv" ? "Renda Variável" : "Renda Fixa"} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
            <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
              <Coins size={14} />
              Proventos Mensais (últimos 12 meses)
            </h2>
            {monthlyDividends.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyDividends}>
                  <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa", fontSize: 13 }} formatter={(v: number) => [brl(v), "Total"]} />
                  <Bar dataKey="total" fill="#d4a574" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-600 text-sm">Sem dados de proventos.</p>
            )}
          </div>
        )}

        <div className="glass-card p-5 animate-fade-in">
          <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
            <Globe size={14} />
            Alocação por Setor
          </h2>
          {sectorData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                    {sectorData.map((entry) => (
                      <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] || COLORS[0]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa", fontSize: 12 }} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sectorData.map((s) => (
                  <span key={s.name} className="tag" style={{ backgroundColor: `${SECTOR_COLORS[s.name] || COLORS[0]}20`, color: SECTOR_COLORS[s.name] || COLORS[0] }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-zinc-600 text-sm">Sem dados.</p>
          )}
        </div>
      </div>

      {/* Proventos + Currency Exposure */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {evolutionData.length > 0 && (
          <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
            <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
              <Coins size={14} />
              Proventos Mensais (últimos 12 meses)
            </h2>
            {monthlyDividends.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyDividends}>
                  <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa", fontSize: 13 }} formatter={(v: number) => [brl(v), "Total"]} />
                  <Bar dataKey="total" fill="#d4a574" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-600 text-sm">Sem dados.</p>
            )}
          </div>
        )}

        <div className={`glass-card p-5 animate-fade-in ${evolutionData.length === 0 ? "lg:col-span-3" : ""}`}>
          <h2 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
            <DollarSign size={14} />
            Exposição Cambial
          </h2>
          {currencyData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={currencyData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none">
                    {currencyData.map((entry) => (
                      <Cell key={entry.name} fill={CURRENCY_COLORS[entry.name] || "#71717a"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 12, color: "#fafafa", fontSize: 12 }} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {currencyData.map((c) => {
                  const total = currencyData.reduce((s, x) => s + x.value, 0);
                  const pctVal = total > 0 ? ((c.value / total) * 100).toFixed(1) : "0";
                  return (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CURRENCY_COLORS[c.name] || "#71717a" }} />
                        <span className="text-zinc-400">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-300 font-medium">{compactBRL(c.value)}</span>
                        <span className="text-zinc-500 w-10 text-right">{pctVal}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-zinc-600 text-sm">Sem dados.</p>
          )}
        </div>
      </div>

      {/* Câmbio Summary */}
      {data.cambio && data.cambio.operacoes > 0 && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">Resumo Cambial</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-zinc-500 text-xs block">PM Dólar</span>
              <span className="text-lg font-bold text-zinc-100">R$ {data.cambio.pmDolar.toFixed(4)}</span>
              <span className="text-xs text-zinc-500 block">Spot R$ {data.usdbrl.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block">Total Enviado</span>
              <span className="text-lg font-bold text-zinc-100">{compactBRL(data.cambio.totalEnviadoBRL)}</span>
              <span className="text-xs text-zinc-500 block">{data.cambio.operacoes} operações</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block">Total Recebido</span>
              <span className="text-lg font-bold text-zinc-100">$ {data.cambio.totalRecebidoUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="text-zinc-500 text-xs block">Ganho Cambial</span>
              <span className={`text-lg font-bold ${data.cambio.ganhoCambialUSD_BRL >= 0 ? "text-positive" : "text-negative"}`}>
                {brl(data.cambio.ganhoCambialUSD_BRL)}
              </span>
              {data.ptax && <span className="text-xs text-zinc-500 block">PTAX R$ {data.ptax.USDBRL.toFixed(4)}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Positions Table */}
      <div className="glass-card p-5 animate-fade-in">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Posições — Renda Variável</h2>
        {rvPositions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Ativo</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium">Setor</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Qtd</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Preço</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Valor</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">Lucro</th>
                  <th className="px-3 py-2 text-xs text-zinc-500 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {rvPositions.map((p) => {
                  const cor = (p.lucroBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                  return (
                    <tr key={p.ticker} className="border-b border-border/30 hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5">
                        <span className="font-medium">{p.ticker}</span>
                        <span className="text-zinc-600 text-xs ml-2">{p.moeda}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[p.setor] || COLORS[0]}15`, color: SECTOR_COLORS[p.setor] || COLORS[0] }}>
                          {p.setor}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400">
                        {p.precoAtual !== null
                          ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">{compactBRL(p.valorAtualBRL)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${cor}`}>
                        {p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-medium ${cor}`}>
                        {p.lucroPct !== null ? pct(p.lucroPct) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-zinc-600 text-sm">Nenhuma posição.</p>
        )}
      </div>
    </>
  );
}
