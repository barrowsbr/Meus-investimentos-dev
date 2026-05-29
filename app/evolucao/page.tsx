"use client";

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar, Cell,
} from "recharts";
import { Activity, TrendingUp, Calendar, Landmark } from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct } from "@/lib/format";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const TOOLTIP_STYLE = {
  background: "#13141A",
  border: "1px solid #1E2028",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
};

function shortLabel(data: string) {
  const m = data.match(/^(\d{4})-(\d{2})/);
  if (!m) return data;
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m[2]) - 1]}/${m[1].slice(2)}`;
}

export default function EvolucaoPage() {
  const { data: portfolio, loading, error } = usePortfolio();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;

  const historico = portfolio?.lbHistoric ?? [];

  if (historico.length === 0) {
    return (
      <>
        <PageHeader title="Evolução Patrimonial" description="Histórico de patrimônio ao longo do tempo" />
        <div className="glass-card p-8 text-center">
          <Activity size={32} className="text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm">Sem dados históricos.</p>
          <p className="text-zinc-600 text-xs mt-1">Preencha a aba <code>lb_historic</code> na planilha gdados.</p>
        </div>
      </>
    );
  }

  const chartData = historico.map((p) => ({
    label: shortLabel(p.data),
    data: p.data,
    patrimonio: p.patrimonio,
    rv: p.rv,
    rf: p.rf,
  }));

  const first = historico[0];
  const last = historico[historico.length - 1];
  const crescimento = first.patrimonio > 0 ? ((last.patrimonio / first.patrimonio - 1) * 100) : 0;
  const peakValue = Math.max(...historico.map((p) => p.patrimonio));

  // Annual returns
  const anuais: { ano: string; retorno: number }[] = [];
  const byYear: Record<string, number[]> = {};
  historico.forEach((p) => {
    const ano = p.data.slice(0, 4);
    if (!byYear[ano]) byYear[ano] = [];
    byYear[ano].push(p.patrimonio);
  });
  Object.entries(byYear).forEach(([ano, vals]) => {
    if (vals.length < 2) return;
    const ret = ((vals[vals.length - 1] / vals[0] - 1) * 100);
    anuais.push({ ano, retorno: +ret.toFixed(1) });
  });

  return (
    <>
      <PageHeader title="Evolução Patrimonial" description="Histórico completo do patrimônio ao longo do tempo" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="animate-fade-in">
          <MetricCard
            label="Patrimônio Atual"
            value={compactBRL(last.patrimonio)}
            sub={`Desde ${shortLabel(first.data)}`}
            icon={<Landmark size={18} />}
            glowColor="#d4a574"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Crescimento Total"
            value={pct(crescimento)}
            sub={`${historico.length} meses registrados`}
            icon={<TrendingUp size={18} />}
            trend={crescimento >= 0 ? "up" : "down"}
            glowColor={crescimento >= 0 ? "#4ade80" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="Pico Histórico"
            value={compactBRL(peakValue)}
            icon={<Activity size={18} />}
            glowColor="#6366f1"
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Período"
            value={`${first.data.slice(0, 7)}`}
            sub={`até ${last.data.slice(0, 7)}`}
            icon={<Calendar size={18} />}
            glowColor="#06b6d4"
          />
        </div>
      </div>

      {/* Patrimônio total */}
      <div className="glass-card p-5 mb-4 animate-fade-in">
        <h2 className="section-title mb-4">Patrimônio Total (R$)</h2>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="gradPatr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#d4a574" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#d4a574" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
            <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => compactBRL(v)} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Patrimônio"]} />
            <Area type="monotone" dataKey="patrimonio" stroke="#d4a574" fill="url(#gradPatr)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* RV vs RF */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="glass-card p-5 animate-fade-in">
          <h2 className="section-title mb-4">RV vs RF ao longo do tempo</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="gradRV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradRF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
              <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => compactBRL(v)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name === "rv" ? "Renda Variável" : "Renda Fixa"]} />
              <Legend formatter={(v) => v === "rv" ? "Renda Variável" : "Renda Fixa"} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
              <Area type="monotone" dataKey="rv" stroke="#06b6d4" fill="url(#gradRV)" strokeWidth={2} dot={false} stackId="a" />
              <Area type="monotone" dataKey="rf" stroke="#8b5cf6" fill="url(#gradRF)" strokeWidth={2} dot={false} stackId="a" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {anuais.length > 0 && (
          <div className="glass-card p-5 animate-fade-in">
            <h2 className="section-title mb-4">Retorno Anual (%)</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={anuais} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
                <XAxis dataKey="ano" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}%`, "Retorno"]} />
                <Bar dataKey="retorno" radius={[4, 4, 0, 0]}>
                  {anuais.map((entry, i) => (
                    <Cell key={i} fill={entry.retorno >= 0 ? "#4ade80" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </>
  );
}
