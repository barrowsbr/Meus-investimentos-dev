"use client";

// Corpo da página Patrimônio (histórico da série `historico_patrimonio`).
// Extraído para ser reutilizado tanto na rota /patrimonio quanto no popup
// aberto ao clicar em "Patrimônio total" na Home (PatrimonioModal).
// `embedded` = sem PageHeader (o modal já tem sua própria barra de título).

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, Layers } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { brl, compactBRL, pct } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { parseHistoricoPatrimonio, type SerieHistorico, type PontoHistorico } from "@/lib/historico-patrimonio";

const TOOLTIP_STYLE = { background: "#13141A", border: "1px solid #1E2028", borderRadius: 12, color: "var(--text)", fontSize: 12, padding: "8px 12px" };
const AXIS = { fill: "#52525b", fontSize: 10 };
const fmtK = (v: number) => Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v));
const PALETTE = ["#34d399", "#6366f1", "#ec4899", "#f59e0b", "#06b6d4", "#a78bfa", "#84cc16", "#f43f5e", "#14b8a6", "#eab308"];

// Nome legível das colunas de composição da série (a aba guarda "rv"/"rf"/"bens").
const NOME_PARTE: Record<string, string> = {
  rv: "Investimentos — variável",
  rf: "Renda fixa + caixa",
  bens: "Bens (carros)",
};
const nomeParte = (k: string) => NOME_PARTE[k] ?? k;

// Decomposição AO VIVO do patrimônio (mesma fonte do card da Home) — usada no
// card "Investimentos × Bens" para responder de cara o que compõe o número.
interface PartesVivas {
  ibkr_brl: number; brasil_brl: number; cripto_brl: number; rf_caixa_brl: number;
  divida_fora_ibkr_brl: number; bens_brl: number; total_brl: number;
}

interface PeriodoOpt { key: string; label: string; meses: number | "ytd" | "all" }

function periodosFor(formato: SerieHistorico["formato"]): PeriodoOpt[] {
  if (formato === "year") {
    return [
      { key: "5a", label: "5A", meses: 60 },
      { key: "10a", label: "10A", meses: 120 },
      { key: "all", label: "Tudo", meses: "all" },
    ];
  }
  return [
    { key: "3m", label: "3M", meses: 3 },
    { key: "6m", label: "6M", meses: 6 },
    { key: "12m", label: "12M", meses: 12 },
    { key: "ytd", label: "Ano", meses: "ytd" },
    { key: "all", label: "Tudo", meses: "all" },
  ];
}

export default function PatrimonioContent({ embedded = false }: { embedded?: boolean }) {
  const [serie, setSerie] = useState<SerieHistorico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<string>("all");
  const [composicao, setComposicao] = useState(false);
  const [partesVivas, setPartesVivas] = useState<PartesVivas | null>(null);

  useEffect(() => {
    fetch("/api/sheets/historico_patrimonio")
      .then((r) => r.json())
      .then((x) => {
        if (x?.error) throw new Error(x.error);
        setSerie(parseHistoricoPatrimonio(Array.isArray(x) ? x : []));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // Decomposição ao vivo (best-effort; o card some se a chamada falhar).
    fetch("/api/patrimonio-dia/detalhe")
      .then((r) => r.json())
      .then((d) => { if (d?.partes && d.partes.total_brl > 0) setPartesVivas(d.partes as PartesVivas); })
      .catch(() => { /* sem o card */ });
  }, []);

  const periodos = useMemo(() => periodosFor(serie?.formato ?? "month"), [serie]);

  const filtrado = useMemo<PontoHistorico[]>(() => {
    if (!serie || serie.pontos.length === 0) return [];
    const opt = periodos.find((p) => p.key === periodo) ?? periodos[periodos.length - 1];
    if (opt.meses === "all") return serie.pontos;
    const ultimo = serie.pontos[serie.pontos.length - 1];
    let cutoff: number;
    if (opt.meses === "ytd") {
      cutoff = Date.UTC(new Date(ultimo.ts).getUTCFullYear(), 0, 1);
    } else {
      const d = new Date(ultimo.ts);
      cutoff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - opt.meses, d.getUTCDate());
    }
    const sub = serie.pontos.filter((p) => p.ts >= cutoff);
    return sub.length >= 2 ? sub : serie.pontos.slice(-2);
  }, [serie, periodo, periodos]);

  const m = useMemo(() => {
    if (!serie || serie.pontos.length === 0) return null;
    const todos = serie.pontos;
    const atual = todos[todos.length - 1];
    const inicio = todos[0];
    const max = todos.reduce((a, b) => (b.total > a.total ? b : a), todos[0]);
    const crescTotal = inicio.total > 0 ? atual.total / inicio.total - 1 : 0;

    const pPrim = filtrado[0];
    const pUlt = filtrado[filtrado.length - 1];
    const varPctPer = pPrim && pPrim.total > 0 ? pUlt.total / pPrim.total - 1 : 0;
    const varAbsPer = pPrim ? pUlt.total - pPrim.total : 0;

    return { atual, inicio, max, crescTotal, varPctPer, varAbsPer };
  }, [serie, filtrado]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!serie || !m || serie.pontos.length === 0) {
    return (
      <div className="glass-card p-8 text-center text-zinc-600 text-sm mt-4">
        Sem dados na aba <span className="text-zinc-400">historico_patrimonio</span>.
      </div>
    );
  }

  const periodoLabel = periodos.find((p) => p.key === periodo)?.label ?? "período";
  const verComposicao = composicao && serie.partesKeys.length > 0;
  const chartData = filtrado.map((p) => ({ label: p.label, total: p.total, ...p.partes }));

  return (
    <>
      {embedded && (
        <p className="mb-4 text-xs text-zinc-500">
          Histórico do patrimônio total · aba <span className="text-zinc-400">historico_patrimonio</span> · {serie.pontos.length} registros
        </p>
      )}

      {/* Resumo */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 ${embedded ? "" : "mt-4"}`}>
        <MetricCard label="Patrimônio atual" value={compactBRL(m.atual.total)} sub={m.atual.label} icon={<Wallet size={18} />} />
        <MetricCard
          label={`Variação · ${periodoLabel}`}
          value={pct(m.varPctPer * 100)}
          sub={`${m.varAbsPer >= 0 ? "+" : ""}${compactBRL(m.varAbsPer)}`}
          icon={m.varPctPer >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          trend={m.varPctPer >= 0 ? "up" : "down"}
        />
        <MetricCard label="Máxima histórica" value={compactBRL(m.max.total)} sub={m.max.label} icon={<ArrowUpRight size={18} />} />
        <MetricCard
          label="Crescimento total"
          value={pct(m.crescTotal * 100)}
          sub={`desde ${m.inicio.label}`}
          icon={<TrendingUp size={18} />}
          trend={m.crescTotal >= 0 ? "up" : "down"}
        />
      </div>

      {/* ── Investimentos × Bens — o que compõe o número, AGORA ────────────── */}
      {partesVivas && (() => {
        const p = partesVivas;
        const investimentos = p.ibkr_brl + p.brasil_brl + p.cripto_brl + p.rf_caixa_brl - p.divida_fora_ibkr_brl;
        const bens = p.bens_brl;
        const total = investimentos + bens;
        if (!(total > 0)) return null;
        const pctInv = (investimentos / total) * 100;
        const pctBens = (bens / total) * 100;
        const chips: Array<[string, number]> = [
          ["IBKR", p.ibkr_brl], ["Brasil", p.brasil_brl], ["Cripto", p.cripto_brl], ["RF + caixa", p.rf_caixa_brl],
          ...(p.divida_fora_ibkr_brl > 0 ? [["− dívida", -p.divida_fora_ibkr_brl] as [string, number]] : []),
        ];
        return (
          <div className="glass-card p-4 mb-5">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2.5">
              <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2"><Layers size={14} /> Investimentos × Bens</h2>
              <span className="text-[10.5px] text-zinc-600">decomposição de agora — mesma conta do card da Home</span>
            </div>
            {/* Barra segmentada */}
            <div className="flex h-3 w-full overflow-hidden rounded-full mb-3" role="img"
              aria-label={`Investimentos ${pctInv.toFixed(0)}%, bens ${pctBens.toFixed(0)}%`}>
              <div style={{ width: `${pctInv}%`, background: "#34d399" }} />
              <div style={{ width: `${pctBens}%`, background: "#f59e0b" }} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.25)" }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#34d399" }}>Investimentos</span>
                  <span className="font-mono text-[11px] text-zinc-500">{pctInv.toFixed(1)}%</span>
                </div>
                <p className="font-mono text-lg font-extrabold text-zinc-100 leading-tight">{compactBRL(investimentos)}</p>
                <p className="text-[10.5px] text-zinc-500 mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
                  {chips.map(([nome, v]) => (
                    <span key={nome}>{nome} <span className="text-zinc-400 font-mono">{compactBRL(v)}</span></span>
                  ))}
                </p>
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#f59e0b" }}>Bens</span>
                  <span className="font-mono text-[11px] text-zinc-500">{pctBens.toFixed(1)}%</span>
                </div>
                <p className="font-mono text-lg font-extrabold text-zinc-100 leading-tight">{compactBRL(bens)}</p>
                <p className="text-[10.5px] text-zinc-500 mt-1">Carros pela tabela FIPE · metade do valor (divisão de bens)</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-1.5">
          {periodos.map((p) => {
            const on = p.key === periodo;
            return (
              <button
                key={p.key}
                onClick={() => setPeriodo(p.key)}
                className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-md transition-colors"
                style={{
                  background: on ? "var(--accent-soft, rgba(52,211,153,0.12))" : "var(--panel)",
                  border: `1px solid ${on ? "var(--pos)" : "var(--line)"}`,
                  color: on ? "var(--pos)" : "var(--muted)",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {serie.partesKeys.length > 0 && (
          <button
            onClick={() => setComposicao((v) => !v)}
            className="flex items-center gap-1.5 font-mono text-[11px] font-bold px-3 py-1.5 rounded-md transition-colors"
            style={{
              background: verComposicao ? "rgba(99,102,241,0.12)" : "var(--panel)",
              border: `1px solid ${verComposicao ? "#6366f1" : "var(--line)"}`,
              color: verComposicao ? "#818cf8" : "var(--muted)",
            }}
          >
            <Layers size={13} />
            Composição
          </button>
        )}
      </div>

      {/* Gráfico */}
      <div className="glass-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <TrendingUp size={14} />
          {verComposicao ? "Composição do patrimônio" : "Patrimônio total"}
          <span className="text-[11px] text-zinc-600 font-normal">· {periodoLabel}</span>
        </h2>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gPatr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} interval="preserveStartEnd" />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v: number, n: string) => [brl(v), n === "total" ? "Patrimônio" : nomeParte(n)]}
            />
            {verComposicao ? (
              <>
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {serie.partesKeys.map((k, i) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={nomeParte(k)}
                    stackId="comp"
                    stroke={PALETTE[i % PALETTE.length]}
                    fill={PALETTE[i % PALETTE.length]}
                    fillOpacity={0.25}
                    strokeWidth={1.5}
                  />
                ))}
              </>
            ) : (
              <Area type="monotone" dataKey="total" stroke="#34d399" fill="url(#gPatr)" strokeWidth={2.5} dot={chartData.length <= 24 ? { r: 2.5, fill: "#34d399" } : false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
        {verComposicao && serie.partesKeys.includes("bens") && (
          <p className="text-[10.5px] text-zinc-600 mt-2">
            "Bens (carros)" é registrado separado desde ago/2026 — nos pontos anteriores o valor está embutido em investimentos.
          </p>
        )}
      </div>

      {/* Tabela dos registros recentes */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <h2 className="text-sm font-semibold text-zinc-300">Registros — {periodoLabel}</h2>
        </div>
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ background: "var(--panel)" }}>
              <tr className="text-[10px] text-zinc-600 uppercase">
                <th className="text-left font-semibold py-2 px-4">Período</th>
                <th className="text-right font-semibold px-4">Patrimônio</th>
                <th className="text-right font-semibold px-4">Δ vs anterior</th>
              </tr>
            </thead>
            <tbody>
              {[...filtrado].reverse().map((p, i, arr) => {
                const prev = arr[i + 1];
                const delta = prev ? p.total - prev.total : 0;
                const up = delta >= 0;
                return (
                  <tr key={`${p.ts}-${i}`} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="py-2 px-4 text-zinc-300 font-medium whitespace-nowrap">{p.label}</td>
                    <td className="text-right px-4 text-zinc-300 font-mono">{brl(p.total)}</td>
                    <td className="text-right px-4 font-mono" style={{ color: prev ? (up ? "var(--pos)" : "var(--neg)") : "var(--faint)" }}>
                      {prev ? `${up ? "+" : ""}${compactBRL(delta)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-zinc-700 text-center mt-6">Fonte: aba historico_patrimonio.</p>
    </>
  );
}
