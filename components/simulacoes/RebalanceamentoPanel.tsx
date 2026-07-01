"use client";

import { useState, useEffect, useMemo } from "react";
import { Save, Loader2, Wand2, TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react";
import { compactBRL } from "@/lib/format";
import { bumpDataVersion, withDataVersion } from "@/lib/data-version";
import {
  classesFromEstrutura, computeRebalance, type RebalanceMeta,
} from "@/lib/rebalance";

interface EstruturaNode { name: string; value: number; pct: number; children?: EstruturaNode[] }
interface ComposicaoResp { estrutura_carteira?: EstruturaNode[] }
interface MetaInput { alvo: string; banda: string }

const clr = (v: number) => (v >= 0 ? "var(--pos)" : "var(--neg)");
const MACRO_COLOR: Record<string, string> = { "Renda Variável": "#3b82f6", "Renda Fixa": "#2dd4bf" };

/**
 * Painel de Rebalanceamento — vive dentro da página Simulações (aba
 * "Rebalanceamento"). Metas por classe, desvio (drift) vs alvo e ações
 * sugeridas. Alocação atual vem da árvore canônica `estrutura_carteira`.
 */
export default function RebalanceamentoPanel() {
  const [estrutura, setEstrutura] = useState<EstruturaNode[] | null>(null);
  const [inputs, setInputs] = useState<Record<string, MetaInput>>({});
  const [aporte, setAporte] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const classes = useMemo(() => classesFromEstrutura(estrutura ?? undefined), [estrutura]);
  const totalBRL = useMemo(() => classes.reduce((s, c) => s + c.valorBRL, 0), [classes]);

  // Carrega alocação (canônica) + metas salvas; default de alvo = alocação atual.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(withDataVersion("/api/composicao/resumo")).then((r) => r.json() as Promise<ComposicaoResp>).catch(() => null),
      fetch("/api/rebalanceamento").then((r) => r.json()).catch(() => null),
    ]).then(([comp, reb]) => {
      if (cancelled) return;
      const est = comp?.estrutura_carteira ?? [];
      setEstrutura(est);
      const cls = classesFromEstrutura(est);
      const total = cls.reduce((s, c) => s + c.valorBRL, 0);
      const saved: RebalanceMeta[] = Array.isArray(reb?.metas) ? reb.metas : [];
      const savedMap = new Map(saved.map((m) => [m.classe, m]));
      const init: Record<string, MetaInput> = {};
      for (const c of cls) {
        const s = savedMap.get(c.classe);
        const atualPct = total > 0 ? (c.valorBRL / total) * 100 : 0;
        init[c.classe] = {
          alvo: s ? String(s.pesoAlvoPct) : atualPct.toFixed(1),
          banda: s ? String(s.bandaPct) : "5",
        };
      }
      setInputs(init);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const metas: RebalanceMeta[] = useMemo(
    () => classes.map((c) => ({
      classe: c.classe,
      pesoAlvoPct: Number(inputs[c.classe]?.alvo ?? "0") || 0,
      bandaPct: Number(inputs[c.classe]?.banda ?? "5") || 5,
    })),
    [classes, inputs],
  );

  const result = useMemo(
    () => computeRebalance(classes, metas, { aporteBRL: Number(aporte) || 0 }),
    [classes, metas, aporte],
  );

  const setInput = (classe: string, field: keyof MetaInput, value: string) => {
    setInputs((prev) => ({ ...prev, [classe]: { ...prev[classe], [field]: value } }));
    setDirty(true); setMsg(null);
  };

  const normalizar = () => {
    const soma = metas.reduce((s, m) => s + m.pesoAlvoPct, 0);
    if (soma <= 0) return;
    setInputs((prev) => {
      const next = { ...prev };
      for (const c of classes) {
        const cur = Number(prev[c.classe]?.alvo ?? "0") || 0;
        next[c.classe] = { ...prev[c.classe], alvo: ((cur / soma) * 100).toFixed(1) };
      }
      return next;
    });
    setDirty(true); setMsg(null);
  };

  const salvar = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch("/api/rebalanceamento", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metas }),
      });
      const d = await res.json();
      if (res.ok) { setDirty(false); setMsg({ ok: true, text: `Metas salvas (${d.saved}).` }); bumpDataVersion(); }
      else setMsg({ ok: false, text: d.error ?? "Erro ao salvar" });
    } catch { setMsg({ ok: false, text: "Erro de rede" }); }
    setSaving(false);
  };

  const somaOk = Math.abs(result.somaAlvosPct - 100) <= 0.5;
  const precisaRebalancear = result.rows.some((r) => r.status === "aportar" || r.status === "reduzir");

  if (loading) {
    return <div className="glass-card p-8 text-center animate-fade-in"><Loader2 size={20} className="animate-spin text-zinc-500 mx-auto" /></div>;
  }
  if (classes.length === 0) {
    return <div className="glass-card p-8 text-center text-sm text-zinc-500">Sem alocação para exibir.</div>;
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-5xl">
      {/* Cabeçalho de saúde */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${precisaRebalancear ? "bg-amber-500/12 text-amber-400" : "bg-emerald-500/12 text-emerald-400"}`}>
            {precisaRebalancear ? "Rebalancear" : "Dentro do alvo"}
          </span>
          <span className="text-[11px] text-zinc-500">Patrimônio {compactBRL(totalBRL)} · Caixa {compactBRL(result.caixaBRL)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-mono ${somaOk ? "text-zinc-500" : "text-red-400 font-bold"}`}>Σ alvos {result.somaAlvosPct.toFixed(1)}%</span>
          <button onClick={normalizar} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold" style={{ background: "rgba(232,163,61,0.1)", border: "1px solid rgba(232,163,61,0.25)", color: "var(--accent)" }}>
            <Wand2 size={12} /> Normalizar 100%
          </button>
          <button onClick={salvar} disabled={!dirty || saving} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold disabled:opacity-40" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {saving ? "Salvando…" : "Salvar metas"}
          </button>
        </div>
      </div>
      {!somaOk && <p className="text-[11px] text-amber-400 flex items-center gap-1 -mt-2"><AlertTriangle size={12} /> A soma dos alvos é {result.somaAlvosPct.toFixed(1)}% — use &quot;Normalizar 100%&quot; para bater 100%.</p>}
      {msg && <p className={`text-[11px] font-semibold ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}

      {/* Tabela alvo vs atual */}
      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800" style={{ background: "var(--panel)" }}>
                {["Classe", "Atual", "Alvo %", "Banda ±", "Desvio", ""].map((h, i) => (
                  <th key={h} className={`py-2 px-3 text-[9px] font-bold uppercase tracking-wider text-zinc-600 ${i === 0 ? "text-left" : i >= 4 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => {
                const maxDrift = 20; // escala visual da barra de drift
                const w = Math.min(100, (Math.abs(r.driftPct ?? 0) / maxDrift) * 100);
                return (
                  <tr key={r.classe} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: MACRO_COLOR[r.macro] ?? "#71717a" }} />
                        <span className="font-semibold text-zinc-200">{r.classe}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-zinc-400">
                      {compactBRL(r.atualBRL)}<div className="text-[9px] text-zinc-600">{r.atualPct.toFixed(1)}%</div>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input type="number" value={inputs[r.classe]?.alvo ?? ""} onChange={(e) => setInput(r.classe, "alvo", e.target.value)}
                        className="w-14 bg-transparent text-right font-mono text-zinc-200 outline-none border-b border-transparent focus:border-blue-400/40" min={0} max={100} step={0.5} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input type="number" value={inputs[r.classe]?.banda ?? ""} onChange={(e) => setInput(r.classe, "banda", e.target.value)}
                        className="w-10 bg-transparent text-right font-mono text-zinc-500 outline-none border-b border-transparent focus:border-blue-400/40" min={0} max={50} step={1} />
                    </td>
                    <td className="py-2 px-3" colSpan={2}>
                      {r.driftPct === null ? (
                        <span className="text-[10px] text-zinc-600 italic">sem alvo</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 60, background: "rgba(255,255,255,0.05)" }}>
                            <div className="h-full rounded-full" style={{ width: `${w}%`, background: r.status === "manter" ? "var(--pos)" : (r.driftPct >= 0 ? "#f59e0b" : "#ef4444") }} />
                          </div>
                          <span className="font-mono text-[10px]" style={{ color: r.status === "manter" ? "var(--muted)" : clr(-(r.driftPct)) }}>
                            {r.driftPct >= 0 ? "+" : ""}{r.driftPct.toFixed(1)}%
                          </span>
                          {r.status !== "manter" && (
                            <span className="text-[9px] font-semibold" style={{ color: r.status === "aportar" ? "var(--pos)" : "var(--neg)" }}>
                              {r.status === "aportar" ? "▲ aportar" : "▼ reduzir"}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aporte planejado */}
      <div className="glass-card p-4 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold text-zinc-400">Aporte planejado (R$)</span>
        <input type="number" value={aporte} onChange={(e) => setAporte(e.target.value)} placeholder="0"
          className="w-32 bg-white/[0.04] rounded-lg px-3 py-1.5 text-sm text-zinc-200 font-mono outline-none border border-white/[0.06]" min={0} step={100} />
        <span className="text-[10px] text-zinc-600">Dinheiro novo é usado primeiro nos déficits — reduz o que precisa ser vendido.</span>
      </div>

      {/* Ações sugeridas */}
      <div className="glass-card p-5">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Plano de ação</h2>
        {result.actions.length === 0 ? (
          <p className="text-sm text-emerald-400/90 flex items-center gap-2"><TrendingUp size={15} /> Tudo dentro das bandas — nada a fazer.</p>
        ) : (
          <div className="space-y-2">
            {result.vendasEvitadasPorAporte && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1.5"><Info size={12} /> Seu aporte cobre o déficit — dá pra rebalancear <b>sem vender nada</b>.</p>
            )}
            {result.actions.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={{ background: a.tipo === "aportar" ? "rgba(63,185,80,0.05)" : "rgba(240,80,74,0.05)", border: `1px solid ${a.tipo === "aportar" ? "rgba(63,185,80,0.15)" : "rgba(240,80,74,0.15)"}` }}>
                <div className="flex items-center gap-2">
                  {a.tipo === "aportar" ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
                  <span className="text-sm font-semibold text-zinc-200">{a.tipo === "aportar" ? "Aportar em" : "Reduzir"} {a.classe}</span>
                  {a.avisoImposto && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400" title="Vender pode gerar ganho tributável — priorize aporte/caixa. Confira em Impostos.">⚠ IR</span>}
                </div>
                <span className="font-mono text-sm font-bold" style={{ color: a.tipo === "aportar" ? "var(--pos)" : "var(--neg)" }}>{compactBRL(a.valorBRL)}</span>
              </div>
            ))}
            <p className="text-[10px] text-zinc-600 mt-2 flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 shrink-0" /> Sugestões por CLASSE (não por ativo). A venda de renda variável pode gerar ganho tributável — priorize aporte/caixa e confira em Impostos antes.
            </p>
          </div>
        )}
      </div>

      <p className="text-[10px] text-zinc-600">
        Alocação atual = árvore canônica (Composição ETFs / Resumo). Metas salvas na aba <code className="bg-zinc-800 px-1 rounded">rebalanceamento</code> da planilha. Não recalcula patrimônio.
      </p>
    </div>
  );
}
