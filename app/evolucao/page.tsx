"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { TrendingUp, Landmark, Globe, Bitcoin, Wallet, Users } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { brl, compactBRL, pct } from "@/lib/format";

interface ContaPatrimonio {
  nome: string; instituicao: string; pessoa: string; tipo: string; valores: Record<string, number>;
}
interface Evolucao {
  anos: string[];
  totalPorAno: { ano: string; valor: number }[];
  contas: ContaPatrimonio[];
  porTipo: Record<string, Record<string, number>>;
  porPessoa: Record<string, Record<string, number>>;
  porInstituicao: Record<string, Record<string, number>>;
}

const TOOLTIP_STYLE = { background: "#13141A", border: "1px solid #1E2028", borderRadius: 12, color: "#fafafa", fontSize: 12, padding: "8px 12px" };
const AXIS = { fill: "#52525b", fontSize: 10 };
const TIPO_COR: Record<string, string> = {
  "Banco/Caixa": "#64748b", "Investimentos BR": "#6366f1", "Exterior": "#ec4899", "Cripto": "#f59e0b", "Outros": "#a1a1aa",
};
const TIPO_ICON: Record<string, React.ReactNode> = {
  "Banco/Caixa": <Wallet size={14} />, "Investimentos BR": <Landmark size={14} />, "Exterior": <Globe size={14} />, "Cripto": <Bitcoin size={14} />,
};
const PESSOA_COR: Record<string, string> = { Lucas: "#34d399", Maria: "#a78bfa", "—": "#71717a" };
const fmtK = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v));

export default function EvolucaoPage() {
  const [d, setD] = useState<Evolucao | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evolucao").then(r => r.json())
      .then(x => { if (x.error) throw new Error(x.error); setD(x as Evolucao); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const m = useMemo(() => {
    if (!d || d.anos.length === 0) return null;
    const totais = d.totalPorAno.filter(t => t.valor > 0);
    if (totais.length === 0) return null;
    const ultimo = totais[totais.length - 1];
    const primeiro = totais[0];
    const anosDecorridos = parseInt(ultimo.ano) - parseInt(primeiro.ano) || 1;
    const cagr = primeiro.valor > 0 ? Math.pow(ultimo.valor / primeiro.valor, 1 / anosDecorridos) - 1 : 0;
    const anoAnterior = totais[totais.length - 2];
    const yoy = anoAnterior && anoAnterior.valor > 0 ? ultimo.valor / anoAnterior.valor - 1 : 0;
    const crescTotal = primeiro.valor > 0 ? ultimo.valor / primeiro.valor - 1 : 0;

    const tipos = ["Banco/Caixa", "Investimentos BR", "Exterior", "Cripto", "Outros"]
      .filter(t => d.anos.some(a => (d.porTipo[a]?.[t] ?? 0) > 0));
    const stackedTipo = d.anos.map(a => ({ ano: a.slice(2), ...d.porTipo[a] }));
    const stackedPessoa = d.anos.map(a => ({ ano: a.slice(2), ...d.porPessoa[a] }));
    const donutTipo = Object.entries(d.porTipo[ultimo.ano] ?? {}).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
    const areaTotal = d.totalPorAno.map(t => ({ ano: t.ano.slice(2), valor: t.valor }));

    return { ultimo, primeiro, cagr, yoy, crescTotal, tipos, stackedTipo, stackedPessoa, donutTipo, areaTotal };
  }, [d]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!d || !m) return <div className="glass-card p-8 text-center text-zinc-600 text-sm">Sem histórico patrimonial na aba <span className="text-zinc-400">lb_historic</span>.</div>;

  const ultimoAno = m.ultimo.ano;

  return (
    <>
      <PageHeader title="Evolução Patrimonial" description="Histórico do patrimônio por ano, instituição, tipo e titular" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 mt-4">
        <div className="animate-fade-in"><MetricCard label={`Patrimônio ${ultimoAno}`} value={compactBRL(m.ultimo.valor)} sub={`${m.yoy >= 0 ? "+" : ""}${pct(m.yoy * 100)} vs ${parseInt(ultimoAno) - 1}`} icon={<TrendingUp size={18} />} trend={m.yoy >= 0 ? "up" : "down"} glowColor="#34d399" /></div>
        <div className="animate-fade-in animate-delay-1"><MetricCard label="Crescimento total" value={`${m.crescTotal >= 0 ? "+" : ""}${pct(m.crescTotal * 100)}`} sub={`desde ${m.primeiro.ano}`} icon={<TrendingUp size={18} />} glowColor="#6366f1" /></div>
        <div className="animate-fade-in animate-delay-2"><MetricCard label="CAGR" value={pct(m.cagr * 100)} sub="ao ano (composto)" icon={<TrendingUp size={18} />} glowColor="#a78bfa" /></div>
        <div className="animate-fade-in animate-delay-3"><MetricCard label="Variação total" value={compactBRL(m.ultimo.valor - m.primeiro.valor)} sub={`${m.primeiro.ano}–${ultimoAno}`} icon={<Wallet size={18} />} glowColor="#ec4899" /></div>
      </div>

      <div className="glass-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2"><TrendingUp size={14} />Patrimônio total por ano</h2>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={m.areaTotal}>
            <defs><linearGradient id="gTot" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.3} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
            <XAxis dataKey="ano" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Patrimônio"]} labelFormatter={l => `20${l}`} />
            <Area type="monotone" dataKey="valor" stroke="#34d399" fill="url(#gTot)" strokeWidth={2.5} dot={{ r: 3, fill: "#34d399" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="glass-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2"><Landmark size={14} />Composição por tipo ao longo dos anos</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={m.stackedTipo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
              <XAxis dataKey="ano" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [brl(v), n]} labelFormatter={l => `20${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {m.tipos.map(t => <Bar key={t} dataKey={t} stackId="a" fill={TIPO_COR[t]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-2">Composição {ultimoAno}</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={m.donutTipo} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {m.donutTipo.map(e => <Cell key={e.name} fill={TIPO_COR[e.name] ?? "#a1a1aa"} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => brl(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {[...m.donutTipo].sort((a, b) => b.value - a.value).map(e => (
              <div key={e.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-zinc-400"><span className="w-2 h-2 rounded-sm" style={{ background: TIPO_COR[e.name] }} />{e.name}</span>
                <span className="text-zinc-300 font-medium">{compactBRL(e.value)} <span className="text-zinc-600">{pct(e.value / m.ultimo.valor * 100)}</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2"><Users size={14} />Patrimônio por titular</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={m.stackedPessoa}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
            <XAxis dataKey="ano" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [brl(v), n]} labelFormatter={l => `20${l}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {Object.keys(PESSOA_COR).filter(p => d.anos.some(a => (d.porPessoa[a]?.[p] ?? 0) > 0)).map(p => (
              <Bar key={p} dataKey={p} stackId="p" fill={PESSOA_COR[p]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05]"><h2 className="text-sm font-semibold text-zinc-300">Detalhe por conta</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] text-zinc-600 uppercase">
              <th className="text-left font-semibold py-2 px-4">Conta</th>
              <th className="text-left font-semibold">Instituição</th>
              {d.anos.map(a => <th key={a} className="text-right font-semibold px-2">{a.slice(2)}</th>)}
            </tr></thead>
            <tbody>
              {d.contas.map(c => (
                <tr key={c.nome} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="py-2 px-4 text-zinc-300 font-medium whitespace-nowrap">
                    {c.nome}<span className="ml-2 text-[10px]" style={{ color: PESSOA_COR[c.pessoa] }}>{c.pessoa}</span>
                  </td>
                  <td><span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${TIPO_COR[c.tipo]}18`, color: TIPO_COR[c.tipo] }}>{TIPO_ICON[c.tipo]}{c.instituicao}</span></td>
                  {d.anos.map(a => (
                    <td key={a} className={`text-right px-2 ${c.valores[a] > 0 ? "text-zinc-400" : "text-zinc-700"}`}>{c.valores[a] > 0 ? compactBRL(c.valores[a]) : "—"}</td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-white/[0.08] font-semibold">
                <td className="py-2 px-4 text-zinc-200" colSpan={2}>Total</td>
                {d.totalPorAno.map(t => <td key={t.ano} className="text-right px-2 text-zinc-200">{t.valor > 0 ? compactBRL(t.valor) : "—"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-zinc-700 text-center mt-6">Fonte: aba lb_historic (snapshot anual por conta). Totais recalculados pela soma das contas.</p>
    </>
  );
}
