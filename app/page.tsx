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
  Cripto: "#f97316",
};

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
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

  const currencyTotal = currencyData.reduce((s, c) => s + c.value, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral dos seus investimentos"
      />

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
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
            <h2 className="section-title mb-4">
              <ArrowUpRight size={15} />
              Evolução Patrimonial
            </h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolutionData}>
                <defs>
                  <linearGradient id="gradRV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                <XAxis dataKey="data" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name === "rv" ? "Renda Variável" : "Renda Fixa"]} />
                <Area type="monotone" dataKey="rv" stroke="#3b82f6" fill="url(#gradRV)" strokeWidth={2} name="rv" />
                <Area type="monotone" dataKey="rf" stroke="#8b5cf6" fill="url(#gradRF)" strokeWidth={2} name="rf" />
                <Legend formatter={(value) => value === "rv" ? "Renda Variável" : "Renda Fixa"} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
            <h2 className="section-title mb-4">
              <Coins size={15} />
              Proventos Mensais
            </h2>
            {monthlyDividends.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyDividends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                  <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
                  <Bar dataKey="total" fill="#d4a574" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-600 text-sm">Sem dados de proventos.</p>
            )}
          </div>
        )}

        <div className="glass-card p-5 animate-fade-in">
          <h2 className="section-title mb-4">
            <Globe size={15} />
            Alocação por Setor
          </h2>
          {sectorData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" stroke="none" paddingAngle={1}>
                    {sectorData.map((entry) => (
                      <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] || "#71717a"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {sectorData.map((s) => (
                  <span key={s.name} className="tag" style={{ backgroundColor: `${SECTOR_COLORS[s.name] || "#71717a"}18`, color: SECTOR_COLORS[s.name] || "#71717a" }}>
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
            <h2 className="section-title mb-4">
              <Coins size={15} />
              Proventos Mensais
            </h2>
            {monthlyDividends.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyDividends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
                  <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
                  <Bar dataKey="total" fill="#d4a574" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-600 text-sm">Sem dados.</p>
            )}
          </div>
        )}

        <div className={`glass-card p-5 animate-fade-in ${evolutionData.length === 0 ? "lg:col-span-3" : ""}`}>
          <h2 className="section-title mb-4">
            <DollarSign size={15} />
            Exposição Cambial
          </h2>
          {currencyData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={currencyData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" stroke="none" paddingAngle={1}>
                    {currencyData.map((entry) => (
                      <Cell key={entry.name} fill={CURRENCY_COLORS[entry.name] || "#71717a"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {currencyData.map((c) => {
                  const pctVal = currencyTotal > 0 ? ((c.value / currencyTotal) * 100).toFixed(1) : "0";
                  const color = CURRENCY_COLORS[c.name] || "#71717a";
                  return (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-zinc-400 font-medium">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-300">{compactBRL(c.value)}</span>
                        <span className="text-zinc-500 w-12 text-right font-mono">{pctVal}%</span>
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
          <h2 className="section-title mb-4">Resumo Cambial</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div>
              <span className="stat-label block mb-1">PM Dólar</span>
              <span className="stat-value">R$ {data.cambio.pmDolar.toFixed(4)}</span>
              <span className="text-xs text-zinc-500 block mt-0.5">Spot R$ {data.usdbrl.toFixed(4)}</span>
            </div>
            <div>
              <span className="stat-label block mb-1">Total Enviado</span>
              <span className="stat-value">{compactBRL(data.cambio.totalEnviadoBRL)}</span>
              <span className="text-xs text-zinc-500 block mt-0.5">{data.cambio.operacoes} operações</span>
            </div>
            <div>
              <span className="stat-label block mb-1">Total Recebido</span>
              <span className="stat-value">$ {data.cambio.totalRecebidoUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div>
              <span className="stat-label block mb-1">Ganho Cambial</span>
              <span className={`stat-value ${data.cambio.ganhoCambialUSD_BRL >= 0 ? "text-positive" : "text-negative"}`}>
                {brl(data.cambio.ganhoCambialUSD_BRL)}
              </span>
              {data.ptax && <span className="text-xs text-zinc-500 block mt-0.5">PTAX R$ {data.ptax.USDBRL.toFixed(4)}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Positions Table */}
      <div className="glass-card p-5 animate-fade-in">
        <h2 className="section-title mb-4">Posições — Renda Variável</h2>
        {rvPositions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Ativo</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Setor</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Qtd</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Preço</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Valor</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">Lucro</th>
                  <th className="px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {rvPositions.map((p, i) => {
                  const cor = (p.lucroBRL ?? 0) >= 0 ? "text-positive" : "text-negative";
                  return (
                    <tr key={p.ticker} className={`border-b border-border/30 hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-zinc-200">{p.ticker}</span>
                        <span className="text-zinc-600 text-[10px] ml-1.5">{p.moeda}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[p.setor] || "#71717a"}15`, color: SECTOR_COLORS[p.setor] || "#71717a" }}>
                          {p.setor}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 font-mono text-xs">
                        {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">
                        {p.precoAtual !== null
                          ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{compactBRL(p.valorAtualBRL)}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${cor}`}>
                        {p.lucroBRL !== null ? brl(p.lucroBRL) : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${cor}`}>
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
