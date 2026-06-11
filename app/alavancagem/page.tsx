"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";
import {
  Scale, TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  Landmark, ShieldAlert, Plus, Trash2, CheckCircle2, RefreshCw, History,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { bumpDataVersion } from "@/lib/data-version";
import { brl, compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";

const TOOLTIP_STYLE = {
  background: "#18181b", border: "1px solid #27272a", borderRadius: 12,
  color: "#fafafa", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

// ─── Tipos (espelham /api/alavancagem) ────────────────────────────────────────
interface MarginEntryMetrics {
  id: string; data: string; corretora: string; moeda: string; valor: number;
  benchmark: string; taxaBenchmark: number; spread: number;
  status: "aberta" | "fechada"; dataFechamento: string; valorFechamento: number; obs: string;
  taxaBenchmarkAtual: number | null; taxaTotal: number; dias: number;
  valorBRL: number; jurosAcumNative: number; jurosAcumBRL: number; custoAnualBRL: number;
}
interface AlavancagemResponse {
  entradas: MarginEntryMetrics[];
  abertas: MarginEntryMetrics[];
  fechadas: MarginEntryMetrics[];
  dividaBRL: number; jurosAcumBRL: number; dividaComJurosBRL: number; custoAnualBRL: number;
  benchmarks: Record<string, { rate: number; source: "api" | "fallback" }>;
  benchmarkPorMoeda: Record<string, { code: string; label: string }>;
  fx: Record<string, number>;
}

const MOEDAS = ["USD", "CHF", "EUR", "JPY", "GBP", "CAD", "BRL"];

function fmtMoeda(v: number, moeda: string): string {
  if (moeda === "BRL") return brl(v);
  return `${moeda} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtData(d: string): string {
  return d ? d.split("-").reverse().join("/") : "—";
}

// ─── Formulário de nova margem ────────────────────────────────────────────────
function NovaMargem({ resp, onSaved }: { resp: AlavancagemResponse; onSaved: () => void }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [corretora, setCorretora] = useState("IBKR");
  const [moeda, setMoeda] = useState("USD");
  const [valor, setValor] = useState("");
  const [spread, setSpread] = useState("1.5");
  const [taxaBench, setTaxaBench] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bench = resp.benchmarkPorMoeda[moeda];
  const benchLive = bench ? resp.benchmarks[bench.code] : undefined;

  // Pré-preenche a taxa do benchmark com a da API ao trocar a moeda.
  useEffect(() => {
    if (benchLive) setTaxaBench(benchLive.rate.toFixed(2));
  }, [moeda]); // eslint-disable-line react-hooks/exhaustive-deps

  const taxaTotal = (parseFloat(taxaBench) || 0) + (parseFloat(spread) || 0);

  const salvar = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await fetch("/api/alavancagem", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data, corretora, moeda,
          valor: parseFloat(valor) || 0,
          spread: parseFloat(spread) || 0,
          taxaBenchmark: parseFloat(taxaBench) || 0,
          obs,
        }),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setValor(""); setObs("");
      bumpDataVersion();
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const inp = "w-full mt-1 bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.06]";
  const lbl = "text-[10px] text-zinc-600 uppercase tracking-wide";

  return (
    <div className="glass-card p-4 mb-5 border-red-500/10">
      <div className="flex items-center gap-2 mb-3">
        <Plus size={14} className="text-red-400" />
        <span className="text-sm font-semibold text-zinc-200">Nova margem</span>
        {bench && (
          <span className="ml-auto text-[10px] text-zinc-600">
            {bench.label}: <span className={benchLive?.source === "api" ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
              {benchLive ? `${benchLive.rate.toFixed(2)}%` : "—"}
            </span> {benchLive?.source === "api" ? "(ao vivo)" : "(referência — confira)"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div><label className={lbl}>Data</label><input type="date" value={data} onChange={e => setData(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Corretora</label><input value={corretora} onChange={e => setCorretora(e.target.value)} className={inp} /></div>
        <div>
          <label className={lbl}>Moeda</label>
          <select value={moeda} onChange={e => setMoeda(e.target.value)} className={inp}>
            {MOEDAS.map(m => <option key={m} value={m} className="bg-zinc-900">{m}</option>)}
          </select>
        </div>
        <div><label className={lbl}>Valor ({moeda})</label><input type="number" value={valor} onChange={e => setValor(e.target.value)} placeholder="100000" className={inp} /></div>
        <div><label className={lbl}>Benchmark % a.a.</label><input type="number" step="0.01" value={taxaBench} onChange={e => setTaxaBench(e.target.value)} className={inp} /></div>
        <div><label className={lbl}>Spread % a.a.</label><input type="number" step="0.1" value={spread} onChange={e => setSpread(e.target.value)} className={inp} /></div>
      </div>
      <div className="flex flex-col md:flex-row md:items-center gap-3 mt-3">
        <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)" className={`${inp} mt-0 flex-1`} />
        <div className="text-xs text-zinc-500 whitespace-nowrap">
          Taxa total: <span className="text-red-400 font-bold">{taxaTotal.toFixed(2)}% a.a.</span>
        </div>
        <button onClick={salvar} disabled={saving || !(parseFloat(valor) > 0)}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-red-500/15 text-red-300 border border-red-500/25 hover:bg-red-500/25 transition-all disabled:opacity-40 whitespace-nowrap">
          {saving ? "Salvando…" : "Registrar margem"}
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
      <p className="text-[10px] text-zinc-700 mt-2">
        Salvo na aba <code className="text-zinc-500">alavancagem</code> da planilha (criada automaticamente). Juros: benchmark + spread, ACT/360 (convenção IBKR), benchmark flutuante atualizado a cada visita.
      </p>
    </div>
  );
}

// ─── Card de uma margem aberta ────────────────────────────────────────────────
function MargemCard({ e, onChanged }: { e: MarginEntryMetrics; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmando, setConfirmando] = useState<"fechar" | "apagar" | null>(null);
  const [valorFech, setValorFech] = useState("");

  const acao = async (metodo: "PATCH" | "DELETE", body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/alavancagem", {
        method: metodo, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      bumpDataVersion();
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); setConfirmando(null); }
  };

  return (
    <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.05]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold text-zinc-200">{fmtMoeda(e.valor, e.moeda)}</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{e.corretora}</span>
        <span className="text-[10px] text-zinc-600">{fmtData(e.data)} · {e.dias}d</span>
        <div className="ml-auto flex gap-1">
          <button title="Fechar margem (registra como quitada)" onClick={() => setConfirmando("fechar")} disabled={busy}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">
            <CheckCircle2 size={14} />
          </button>
          <button title="Apagar entrada (remove da planilha)" onClick={() => setConfirmando("apagar")} disabled={busy}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="bg-white/[0.02] rounded-lg p-2">
          <div className="text-[9px] text-zinc-600 uppercase">Em BRL</div>
          <div className="font-bold text-zinc-300">{brl(e.valorBRL)}</div>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <div className="text-[9px] text-zinc-600 uppercase">Taxa ({e.benchmark} + spread)</div>
          <div className="font-bold text-zinc-300">
            {(e.taxaBenchmarkAtual ?? e.taxaBenchmark).toFixed(2)}% + {e.spread.toFixed(2)}% = <span className="text-red-400">{e.taxaTotal.toFixed(2)}%</span>
          </div>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <div className="text-[9px] text-zinc-600 uppercase">Juros acumulados</div>
          <div className="font-bold text-amber-400">{fmtMoeda(e.jurosAcumNative, e.moeda)}</div>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <div className="text-[9px] text-zinc-600 uppercase">Custo anual</div>
          <div className="font-bold text-zinc-300">{brl(e.custoAnualBRL)}</div>
        </div>
      </div>
      {e.obs && <div className="text-[10px] text-zinc-600 mt-2">{e.obs}</div>}

      {confirmando === "fechar" && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 flex flex-col md:flex-row md:items-center gap-2">
          <span className="text-xs text-zinc-400">Fechar esta margem? Valor pago (principal + juros, em {e.moeda}):</span>
          <input type="number" value={valorFech} onChange={ev => setValorFech(ev.target.value)}
            placeholder={(e.valor + e.jurosAcumNative).toFixed(2)}
            className="bg-white/[0.04] rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none border border-white/[0.06] w-36" />
          <div className="flex gap-2 ml-auto">
            <button onClick={() => acao("PATCH", { id: e.id, valorFechamento: parseFloat(valorFech) || e.valor + e.jurosAcumNative })}
              className="px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">Confirmar fechamento</button>
            <button onClick={() => setConfirmando(null)} className="px-3 py-1 rounded-lg text-[11px] text-zinc-500">Cancelar</button>
          </div>
        </div>
      )}
      {confirmando === "apagar" && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/15 flex items-center gap-2">
          <span className="text-xs text-zinc-400 flex-1">Apagar definitivamente esta entrada da planilha? (use Fechar se a margem foi quitada)</span>
          <button onClick={() => acao("DELETE", { id: e.id })}
            className="px-3 py-1 rounded-lg text-[11px] font-bold bg-red-500/15 text-red-300 border border-red-500/25">Apagar</button>
          <button onClick={() => setConfirmando(null)} className="px-3 py-1 rounded-lg text-[11px] text-zinc-500">Cancelar</button>
        </div>
      )}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function AlavancagemPage() {
  const { data: portfolio, loading: portLoading } = usePortfolio();
  const [resp, setResp] = useState<AlavancagemResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFechadas, setShowFechadas] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/alavancagem")
      .then(r => r.json())
      .then(j => { if (j.error) throw new Error(j.error); setResp(j); setError(null); })
      .catch(e => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const metrics = useMemo(() => {
    const bruto = portfolio?.totalPatrimonioBRL ?? 0;
    const divida = resp?.dividaBRL ?? 0;
    const net = bruto - divida;
    const pct = bruto > 0 ? (divida / bruto) * 100 : 0;
    const ratio = net > 0 ? bruto / net : 0;
    return { bruto, divida, net, pct, ratio };
  }, [portfolio, resp]);

  const gauge = useMemo(() => {
    const lev = metrics.ratio;
    if (lev <= 0 || metrics.divida <= 0) return { color: "#22c55e", label: "1.00x", risk: "Sem alavancagem" };
    if (lev <= 1.2) return { color: "#22c55e", label: `${lev.toFixed(2)}x`, risk: "Conservador" };
    if (lev <= 1.5) return { color: "#f59e0b", label: `${lev.toFixed(2)}x`, risk: "Moderado" };
    if (lev <= 2.0) return { color: "#f97316", label: `${lev.toFixed(2)}x`, risk: "Agressivo" };
    return { color: "#ef4444", label: `${lev.toFixed(2)}x`, risk: "Alto Risco" };
  }, [metrics]);

  if (portLoading || (loading && !resp)) return <LoadingSpinner />;

  return (
    <>
      <PageHeader
        title="Alavancagem & Margin"
        description="Net = bruto − dívida de margin (o dinheiro que realmente é seu). Juros = benchmark do BC + spread"
      />

      {error && (
        <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle size={13} /> {error}
          <button onClick={reload} className="ml-auto flex items-center gap-1 text-zinc-400 hover:text-zinc-200"><RefreshCw size={11} />Tentar de novo</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard icon={DollarSign} label="Patrimônio Bruto" value={compactBRL(metrics.bruto)} sub="Ativos (inclui comprados na margin)" color="#3b82f6" />
        <KpiCard icon={TrendingDown} label="Dívida Margin" value={metrics.divida > 0 ? `-${compactBRL(metrics.divida)}` : "R$ 0"}
          sub={resp && resp.jurosAcumBRL > 0 ? `+${compactBRL(resp.jurosAcumBRL)} juros acruados` : "Sem margem aberta"} color="#ef4444" />
        <KpiCard icon={TrendingUp} label="Net (Patrimônio Real)" value={compactBRL(metrics.net)} sub={`${metrics.pct.toFixed(1)}% alavancado`} color="#22c55e" />
        <KpiCard icon={Scale} label="Alavancagem" value={gauge.label} sub={gauge.risk} color={gauge.color} />
      </div>

      {resp && <NovaMargem resp={resp} onSaved={reload} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Margens abertas */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Landmark size={14} className="text-red-400" />
            <span className="text-sm font-semibold text-zinc-300">Margens abertas</span>
            {resp && resp.abertas.length > 0 && (
              <span className="text-[10px] text-zinc-600">custo anual {brl(resp.custoAnualBRL)} ({metrics.divida > 0 ? ((resp.custoAnualBRL / metrics.divida) * 100).toFixed(2) : 0}% a.a. médio)</span>
            )}
          </div>
          {!resp || resp.abertas.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <ShieldAlert size={26} className="text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-600">Nenhuma margem aberta — patrimônio 100% desalavancado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {resp.abertas.map(e => <MargemCard key={e.id} e={e} onChanged={reload} />)}
            </div>
          )}

          {/* Histórico de fechadas */}
          {resp && resp.fechadas.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowFechadas(!showFechadas)} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                <History size={12} /> {resp.fechadas.length} margem(ns) fechada(s) {showFechadas ? "▾" : "▸"}
              </button>
              {showFechadas && (
                <div className="mt-2 space-y-2">
                  {resp.fechadas.map(e => (
                    <div key={e.id} className="rounded-xl px-3 py-2 bg-white/[0.02] border border-white/[0.04] flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-semibold text-zinc-400">{fmtMoeda(e.valor, e.moeda)}</span>
                      <span className="text-zinc-600">{fmtData(e.data)} → {fmtData(e.dataFechamento)} ({e.dias}d)</span>
                      <span className="text-zinc-600">{e.benchmark} + {e.spread}%</span>
                      {e.valorFechamento > 0 && <span className="text-zinc-500">pago: <span className="text-amber-400">{fmtMoeda(e.valorFechamento, e.moeda)}</span></span>}
                      <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Fechada</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dashboard direito */}
        <div className="space-y-5">
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-300 mb-4">Composição: Bruto − Dívida = Net</h2>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: "Bruto", value: metrics.bruto, fill: "#3b82f6" },
                    { name: "Dívida", value: -metrics.divida, fill: "#ef4444" },
                    { name: "Net", value: metrics.net, fill: "#22c55e" },
                  ]}
                  layout="vertical" margin={{ left: 50, right: 10, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => compactBRL(Math.abs(v))} tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => compactBRL(Math.abs(v))} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {["#3b82f6", "#ef4444", "#22c55e"].map((fill, i) => <Cell key={i} fill={fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Benchmarks ao vivo */}
          {resp && (
            <div className="glass-card p-4">
              <h2 className="text-xs font-semibold text-zinc-300 mb-3">Benchmarks (juros base por moeda)</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(resp.benchmarkPorMoeda).map(([moeda, b]) => {
                  const live = resp.benchmarks[b.code];
                  return (
                    <div key={moeda} className="bg-white/[0.02] rounded-lg p-2.5">
                      <div className="text-[9px] text-zinc-600 uppercase">{moeda} · {b.code}</div>
                      <div className="text-sm font-bold mt-0.5" style={{ color: live?.source === "api" ? "#34d399" : "#fbbf24" }}>
                        {live ? `${live.rate.toFixed(2)}%` : "—"}
                      </div>
                      <div className="text-[9px] text-zinc-700">{live?.source === "api" ? "API oficial" : "referência"}</div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-zinc-700 mt-2">
                EFFR (NY Fed), €STR (BCE) e Selic (BCB) ao vivo. SARON/TONAR/SONIA/CORRA: editáveis no formulário.
              </p>
            </div>
          )}

          {/* Alerta de risco */}
          {metrics.ratio > 1.5 && metrics.divida > 0 && (
            <div className="glass-card p-4 flex items-start gap-3" style={{ borderColor: "rgba(239,68,68,0.3)" }}>
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-400 mb-0.5">Alavancagem {gauge.label}</p>
                <p className="text-[10px] text-zinc-400">
                  Uma queda de {(100 / metrics.ratio).toFixed(0)}% nos ativos zeraria o patrimônio net.
                  Custo de carregamento: {brl(resp?.custoAnualBRL ?? 0)}/ano — o retorno dos ativos comprados precisa superar isso.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ComponentType<any>;
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} style={{ color }} />
        <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
    </div>
  );
}
