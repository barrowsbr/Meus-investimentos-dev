"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Wallet, Plus, Trash2, Save, Loader2, Scale, TrendingDown, TrendingUp,
  DollarSign, Building2, AlertTriangle, Landmark, Percent,
} from "lucide-react";
import { compactBRL, brl } from "@/lib/format";
import { bumpDataVersion } from "@/lib/data-version";
import { usePortfolio } from "@/lib/hooks";
import PageHeader from "@/components/PageHeader";
// lib/margin é PURO (sem deps server-only) — ok importar VALORES no client.
import { IBKR_SPREAD_TIERS } from "@/lib/margin";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface CaixaPos { ticker: string; atual: number; moeda: string }
interface IbkrCash { moeda: string; saldo: number }
interface MarginBal { moeda: string; saldo: number; jurosAcruados: number; initMargin: number; maintMargin: number }
interface FxRates { USDBRL: number; EURBRL: number; CADBRL: number; GBPBRL: number }
interface CaixaResponse { caixa: CaixaPos[]; ibkrCash: IbkrCash[]; margin: MarginBal[]; ibkrSynced: boolean }

// Payload de /api/alavancagem (motor lib/margin — benchmark vivo + tabela IBKR)
interface MarginAberta {
  id: string; corretora: string; moeda: string; valor: number;
  benchmark: string; spread: number; taxaBenchmark: number;
  taxaBenchmarkAtual: number | null; taxaTotal: number;
  valorBRL: number; jurosAcumBRL: number; custoAnualBRL: number;
}
interface AlavResponse {
  abertas: MarginAberta[];
  dividaBRL: number; jurosAcumBRL: number; custoAnualBRL: number;
  benchmarks: Record<string, { rate: number; source: "api" | "fallback" }>;
  benchmarkPorMoeda: Record<string, { code: string; label: string }>;
}

const pctBR = (v: number, dec = 2) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;

function fxRate(fx: FxRates | undefined, moeda: string): number {
  const m: Record<string, number> = { BRL: 1, USD: fx?.USDBRL ?? 1, EUR: fx?.EURBRL ?? 1, CAD: fx?.CADBRL ?? 1, GBP: fx?.GBPBRL ?? 1 };
  return m[moeda] ?? 1;
}
const fmtMoeda = (v: number, moeda: string) => moeda === "BRL" ? brl(v) : `${moeda} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function gaugeFor(ratio: number, divida: number) {
  if (divida <= 0) return { color: "#22c55e", label: "1.00x", risk: "Sem alavancagem" };
  // Dívida maior que o bruto (net ≤ 0): o pior cenário — nunca mostrar "1.00x".
  if (ratio <= 0) return { color: "#ef4444", label: "∞", risk: "Net negativo" };
  if (ratio <= 1.2) return { color: "#22c55e", label: `${ratio.toFixed(2)}x`, risk: "Conservador" };
  if (ratio <= 1.5) return { color: "#f59e0b", label: `${ratio.toFixed(2)}x`, risk: "Moderado" };
  if (ratio <= 2.0) return { color: "#f97316", label: `${ratio.toFixed(2)}x`, risk: "Agressivo" };
  return { color: "#ef4444", label: `${ratio.toFixed(2)}x`, risk: "Alto Risco" };
}

// ── KPI ────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Kpi({ icon: Icon, label, value, sub, color }: { icon: React.ComponentType<any>; label: string; value: string; sub: string; color: string }) {
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

// ── Editor de caixa manual (BRL e o que a IBKR não cobre) ──────────────────────

function CaixaManual({ caixa, fx, onSaved }: { caixa: CaixaPos[]; fx?: FxRates; onSaved: () => void }) {
  const [positions, setPositions] = useState<CaixaPos[]>(caixa);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const update = (idx: number, field: keyof CaixaPos, value: string | number) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    setDirty(true); setMessage(null);
  };
  const add = () => { setPositions(prev => [...prev, { ticker: "CAIXA", atual: 0, moeda: "BRL" }]); setDirty(true); setMessage(null); };
  const remove = (idx: number) => { setPositions(prev => prev.filter((_, i) => i !== idx)); setDirty(true); setMessage(null); };

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      const res = await fetch("/api/renda-fixa/caixa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      const d = await res.json();
      if (res.ok) {
        setDirty(false);
        setMessage({ type: "ok", text: `Salvo — ${d.saved} posição(ões). Recalculando…` });
        bumpDataVersion();
        setTimeout(onSaved, 700);
      } else setMessage({ type: "err", text: d.error ?? "Erro ao salvar" });
    } catch { setMessage({ type: "err", text: "Erro de rede" }); }
    setSaving(false);
  };

  const totalBRL = positions.reduce((s, p) => s + p.atual * fxRate(fx, p.moeda), 0);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Caixa manual</h2>
          <span className="text-xs text-zinc-500">({positions.length})</span>
          <span className="text-[9px] text-zinc-600 px-1.5 py-0.5 rounded bg-white/[0.04]">o que a IBKR não cobre</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={add} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}>
            <Plus size={12} /> Adicionar
          </button>
          <button onClick={save} disabled={!dirty || saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-40" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-xs text-zinc-600">Nenhum caixa manual</p>
          <p className="text-[10px] text-zinc-700 mt-1">Use &quot;Adicionar&quot; para registrar seu caixa em BRL (fora da IBKR)</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-800">
              <th className="text-left py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Nome</th>
              <th className="text-left py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Moeda</th>
              <th className="text-right py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Valor</th>
              <th className="w-8" />
            </tr></thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={i} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                  <td className="py-2 px-2">
                    <input type="text" value={p.ticker} onChange={e => update(i, "ticker", e.target.value)} className="bg-transparent text-xs text-zinc-200 font-semibold outline-none border-b border-transparent focus:border-emerald-400/30 w-full transition-colors" placeholder="CAIXA" />
                  </td>
                  <td className="py-2 px-2">
                    <select value={p.moeda} onChange={e => update(i, "moeda", e.target.value)} className="bg-transparent text-xs text-zinc-400 outline-none cursor-pointer">
                      {["BRL", "USD", "EUR", "GBP", "CAD"].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <input type="number" value={p.atual || ""} onChange={e => update(i, "atual", Number(e.target.value))} className="bg-transparent text-xs text-zinc-200 font-mono text-right outline-none border-b border-transparent focus:border-emerald-400/30 w-full transition-colors" placeholder="0.00" min={0} step={0.01} />
                    {p.moeda !== "BRL" && p.atual > 0 && <div className="text-[9px] text-zinc-600 text-right mt-0.5">&asymp; {compactBRL(p.atual * fxRate(fx, p.moeda))}</div>}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button onClick={() => remove(i)} className="text-zinc-700 hover:text-red-400 transition-colors p-0.5"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-zinc-800 font-semibold">
              <td className="py-2.5 px-2 text-zinc-300" colSpan={2}>Total manual</td>
              <td className="py-2.5 px-2 text-right text-zinc-200 font-mono">{compactBRL(totalBRL)}</td>
              <td />
            </tr></tfoot>
          </table>
        </div>
      )}

      {message && (
        <div className={`mt-3 px-3 py-2 rounded-lg text-[10px] font-semibold ${message.type === "ok" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20" : "bg-red-400/10 text-red-400 border border-red-400/20"}`}>{message.text}</div>
      )}
    </div>
  );
}

// ── Painel automático IBKR (caixa + margem) ────────────────────────────────────

function IbkrPanel({ ibkrCash, margin, fx, synced }: { ibkrCash: IbkrCash[]; margin: MarginBal[]; fx?: FxRates; synced: boolean }) {
  const cashBRL = ibkrCash.reduce((s, c) => s + c.saldo * fxRate(fx, c.moeda), 0);
  const dividaBRL = margin.reduce((s, m) => s + m.saldo * fxRate(fx, m.moeda), 0);
  const jurosBRL = margin.reduce((s, m) => s + m.jurosAcruados * fxRate(fx, m.moeda), 0);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={16} style={{ color: "#d6001c" }} />
        <h2 className="text-sm font-semibold text-zinc-200">Automático · IBKR</h2>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${synced ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
          {synced ? "Flex conectado" : "IBKR indisponível"}
        </span>
      </div>

      {/* Caixa IBKR */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Caixa (liquidez)</span>
          <span className="text-xs font-bold text-emerald-400">{compactBRL(cashBRL)}</span>
        </div>
        {ibkrCash.length === 0 ? (
          <p className="text-[10px] text-zinc-600">Sem caixa na IBKR (ou Cash Report não habilitado na query Flex).</p>
        ) : (
          <div className="space-y-1">
            {ibkrCash.map(c => (
              <div key={c.moeda} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-white/[0.02]">
                <span className="font-semibold text-zinc-300">{c.moeda}</span>
                <span className="font-mono text-zinc-400">{fmtMoeda(c.saldo, c.moeda)} <span className="text-zinc-600">· {compactBRL(c.saldo * fxRate(fx, c.moeda))}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Margem IBKR */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Margem (dívida)</span>
          <span className="text-xs font-bold text-red-400">{dividaBRL > 0 ? `-${compactBRL(dividaBRL)}` : "R$ 0"}</span>
        </div>
        {margin.length === 0 ? (
          <p className="text-[10px] text-zinc-600">Sem margem aberta na IBKR.</p>
        ) : (
          <div className="space-y-1.5">
            {margin.map(m => (
              <div key={m.moeda} className="px-2.5 py-2 rounded-lg bg-red-500/[0.04] border border-red-500/10">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-300 text-xs">{m.moeda}</span>
                  <span className="font-mono text-xs text-red-400">-{fmtMoeda(m.saldo, m.moeda)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[9px] text-zinc-600">
                  {m.jurosAcruados > 0 && <span>juros acruados: <span className="text-amber-400">{fmtMoeda(m.jurosAcruados, m.moeda)}</span></span>}
                  {m.maintMargin > 0 && <span>manutenção: {fmtMoeda(m.maintMargin, m.moeda)}</span>}
                  {m.initMargin > 0 && <span>inicial: {fmtMoeda(m.initMargin, m.moeda)}</span>}
                </div>
              </div>
            ))}
            {jurosBRL > 0 && <div className="text-[10px] text-zinc-600 mt-1">Juros acruados no mês: <span className="text-amber-400 font-semibold">{compactBRL(jurosBRL)}</span></div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custo da margem (taxa IBKR = benchmark + spread da tabela de faixas) ──────

function CustoMargem({ alav }: { alav: AlavResponse | null }) {
  const abertas = alav?.abertas ?? [];
  const temDivida = abertas.length > 0 && (alav?.dividaBRL ?? 0) > 0;

  // Custos derivados da taxa: ACT/360 (convenção IBKR) — dia → mês → ano.
  const custoDiaBRL = abertas.reduce((s, e) => s + e.valorBRL * (e.taxaTotal / 100) / 360, 0);
  const custoMesBRL = custoDiaBRL * 30;
  const custoAnoBRL = custoDiaBRL * 365;

  // Tabela de faixas das moedas com dívida (destaca a faixa em uso).
  const moedasComDivida = [...new Set(abertas.map(e => e.moeda))];

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Percent size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Custo da margem</h2>
        <span className="text-[9px] text-zinc-600 px-1.5 py-0.5 rounded bg-white/[0.04]">tabela IBKR Pro · benchmark ao vivo</span>
      </div>

      {!temDivida ? (
        <p className="text-[10px] text-zinc-600">Sem margem aberta — custo zero. Quando houver dívida, a taxa (benchmark + spread IBKR), o custo diário e a projeção mensal aparecem aqui.</p>
      ) : (
        <>
          {/* Por empréstimo: taxa decomposta */}
          <div className="space-y-1.5 mb-4">
            {abertas.map(e => {
              const benchLabel = alav?.benchmarkPorMoeda?.[e.moeda]?.label ?? e.benchmark;
              const benchRate = e.taxaBenchmarkAtual ?? e.taxaBenchmark;
              const fonte = alav?.benchmarks?.[e.benchmark]?.source;
              const dia = e.valorBRL * (e.taxaTotal / 100) / 360;
              return (
                <div key={e.id} className="px-3 py-2.5 rounded-lg bg-amber-500/[0.04] border border-amber-500/10">
                  <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1">
                    <span className="text-xs font-semibold text-zinc-300">{e.moeda} · {e.corretora} <span className="text-zinc-600 font-normal">({fmtMoeda(e.valor, e.moeda)})</span></span>
                    <span className="text-xs font-bold text-amber-400">{pctBR(e.taxaTotal)} a.a.</span>
                  </div>
                  <div className="text-[9px] text-zinc-600 mt-1">
                    {e.benchmark} {pctBR(benchRate)}{fonte === "fallback" ? " (offline)" : ""} + spread IBKR {pctBR(e.spread)} <span className="text-zinc-700">· {benchLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-[10px]">
                    <span className="text-zinc-500">dia <span className="text-zinc-300 font-mono">{brl(dia)}</span></span>
                    <span className="text-zinc-500">mês <span className="text-zinc-300 font-mono">{brl(dia * 30)}</span></span>
                    <span className="text-zinc-500">ano <span className="text-zinc-300 font-mono">{brl(dia * 365)}</span></span>
                    {e.jurosAcumBRL > 0.005 && <span className="text-zinc-500">acruado <span className="text-amber-400 font-mono">{brl(e.jurosAcumBRL)}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totais */}
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            {[{ l: "custo/dia", v: custoDiaBRL }, { l: "custo/mês", v: custoMesBRL }, { l: "custo/ano", v: custoAnoBRL }].map(x => (
              <div key={x.l} className="px-2 py-2 rounded-lg bg-white/[0.03]">
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold">{x.l}</div>
                <div className="text-xs font-bold text-amber-400 font-mono mt-0.5">{brl(x.v)}</div>
              </div>
            ))}
          </div>

          {/* Tabela de faixas IBKR das moedas em uso */}
          {moedasComDivida.map(moeda => {
            const tiers = IBKR_SPREAD_TIERS[moeda];
            if (!tiers) return null;
            const saldo = abertas.filter(e => e.moeda === moeda).reduce((s, e) => s + e.valor, 0);
            let anterior = 0;
            return (
              <div key={moeda} className="mb-2">
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold mb-1">Faixas IBKR · {moeda} (spread sobre o benchmark)</div>
                <div className="flex flex-wrap gap-1">
                  {tiers.map((t, i) => {
                    const ativa = saldo > anterior;
                    const label = t.ate === Infinity
                      ? `acima de ${(anterior / 1e6).toLocaleString("pt-BR")} mi`
                      : `até ${t.ate >= 1e6 ? `${(t.ate / 1e6).toLocaleString("pt-BR")} mi` : `${(t.ate / 1e3).toLocaleString("pt-BR")} mil`}`;
                    anterior = t.ate;
                    return (
                      <span key={i} className={`text-[9px] px-2 py-1 rounded-md border ${ativa ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-white/[0.02] border-white/[0.06] text-zinc-600"}`}>
                        {label} · +{pctBR(t.spread, 2)}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <p className="text-[9px] text-zinc-700 mt-2">Juros ACT/360 (convenção IBKR), calculados sobre o saldo devedor do extrato Flex. Benchmark ao vivo (NY Fed / BCE / BCB); spread pela tabela pública da IBKR Pro (blended por faixa).</p>
        </>
      )}
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function CaixaPage() {
  const { data: portfolio } = usePortfolio();
  const [resp, setResp] = useState<CaixaResponse | null>(null);
  const [alav, setAlav] = useState<AlavResponse | null>(null);
  const [fx, setFx] = useState<FxRates | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/renda-fixa/caixa").then(r => r.json()).catch(() => null),
      fetch("/api/composicao/resumo").then(r => r.json()).catch(() => null),
      fetch("/api/alavancagem").then(r => r.json()).catch(() => null),
    ]).then(([c, comp, a]) => {
      if (c && !c.error) setResp({ caixa: c.caixa ?? [], ibkrCash: c.ibkrCash ?? [], margin: c.margin ?? [], ibkrSynced: !!c.ibkrSynced });
      if (comp?.fx) setFx(comp.fx);
      if (a && !a.error) setAlav(a);
    }).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const m = useMemo(() => {
    const ibkrCurrencies = new Set((resp?.ibkrCash ?? []).map(c => c.moeda));
    // Caixa manual = o que NÃO vem da IBKR (BRL e moedas sem saldo IBKR), p/ não duplicar.
    const manual = (resp?.caixa ?? []).filter(c => !ibkrCurrencies.has(c.moeda));
    const manualBRL = manual.reduce((s, c) => s + c.atual * fxRate(fx, c.moeda), 0);
    const ibkrCashBRL = (resp?.ibkrCash ?? []).reduce((s, c) => s + c.saldo * fxRate(fx, c.moeda), 0);
    const liquidezBRL = manualBRL + ibkrCashBRL;
    const dividaBRL = (resp?.margin ?? []).reduce((s, mb) => s + mb.saldo * fxRate(fx, mb.moeda), 0);
    const bruto = portfolio?.totalPatrimonioBRL ?? 0;
    const net = bruto - dividaBRL;
    const pct = bruto > 0 ? (dividaBRL / bruto) * 100 : 0;
    const ratio = net > 0 ? bruto / net : 0;
    return { manual, liquidezBRL, ibkrCashBRL, dividaBRL, bruto, net, pct, ratio };
  }, [resp, fx, portfolio]);

  const gauge = gaugeFor(m.ratio, m.dividaBRL);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="Caixa & Margem" description="Liquidez e dívida de margem — caixa em BRL manual, o resto automático via IBKR Flex" />

      {loading && !resp ? (
        <div className="glass-card p-8 text-center animate-fade-in"><Loader2 size={20} className="animate-spin text-zinc-500 mx-auto" /></div>
      ) : (
        <div className="space-y-5 animate-fade-in">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Wallet} label="Liquidez total" value={compactBRL(m.liquidezBRL)} sub={`IBKR ${compactBRL(m.ibkrCashBRL)} + manual`} color="#22c55e" />
            <Kpi icon={TrendingDown} label="Dívida margem" value={m.dividaBRL > 0 ? `-${compactBRL(m.dividaBRL)}` : "R$ 0"} sub={m.dividaBRL > 0 ? (alav && alav.custoAnualBRL > 0 ? `custa ~${brl(alav.custoAnualBRL / 12)}/mês` : "automático IBKR") : "sem margem"} color="#ef4444" />
            <Kpi icon={TrendingUp} label="Patrimônio net" value={compactBRL(m.net)} sub={`bruto ${compactBRL(m.bruto)} · ${m.pct.toFixed(1)}% alav.`} color="#3b82f6" />
            <Kpi icon={Scale} label="Alavancagem" value={gauge.label} sub={gauge.risk} color={gauge.color} />
          </div>

          {/* Caixa manual + IBKR automático */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CaixaManual caixa={m.manual} fx={fx} onSaved={load} />
            <IbkrPanel ibkrCash={resp?.ibkrCash ?? []} margin={resp?.margin ?? []} fx={fx} synced={!!resp?.ibkrSynced} />
          </div>

          {/* Custo da margem (taxa IBKR + custo dia/mês/ano) */}
          <CustoMargem alav={alav} />

          {/* Composição patrimonial bruto − dívida = net */}
          <div className="glass-card p-5">
            <h2 className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2"><Landmark size={13} className="text-zinc-500" /> Bruto − Dívida = Net</h2>
            <div className="h-3 w-full rounded-full overflow-hidden flex bg-white/[0.04] mb-2">
              <div style={{ width: `${m.bruto > 0 ? Math.max(0, (m.net / m.bruto) * 100) : 100}%`, background: "#22c55e" }} title={`Net ${compactBRL(m.net)}`} />
              <div style={{ width: `${m.bruto > 0 ? Math.min(100, (m.dividaBRL / m.bruto) * 100) : 0}%`, background: "#ef4444" }} title={`Dívida ${compactBRL(m.dividaBRL)}`} />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
              <span className="text-zinc-400"><span className="text-blue-400 font-semibold">Bruto</span> {compactBRL(m.bruto)}</span>
              <span className="text-zinc-400"><span className="text-emerald-400 font-semibold">Net</span> {compactBRL(m.net)}</span>
              <span className="text-zinc-400"><span className="text-red-400 font-semibold">Dívida</span> {m.dividaBRL > 0 ? `-${compactBRL(m.dividaBRL)}` : "R$ 0"}</span>
            </div>
          </div>

          {/* Alerta de risco */}
          {m.ratio > 1.5 && m.dividaBRL > 0 && (
            <div className="glass-card p-4 flex items-start gap-3" style={{ borderColor: "rgba(239,68,68,0.3)" }}>
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-400 mb-0.5">Alavancagem {gauge.label}</p>
                <p className="text-[10px] text-zinc-400">Uma queda de {(100 / m.ratio).toFixed(0)}% nos ativos zeraria o patrimônio net. Acompanhe os juros acruados da margem na IBKR.</p>
              </div>
            </div>
          )}

          <p className="text-[10px] text-zinc-600 flex items-center gap-1.5">
            <DollarSign size={11} /> Caixa em BRL é manual (aba <code className="text-zinc-500">fixa_aberta</code>). Caixa em outras moedas e a margem vêm automaticamente do extrato IBKR Flex.
          </p>
        </div>
      )}
    </main>
  );
}
