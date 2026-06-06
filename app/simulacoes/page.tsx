"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  Target, Plus, Trash2, Save, FolderOpen, ArrowRight,
  ChevronDown, X, RefreshCw, Loader2,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import type { PortfolioResponse } from "@/lib/hooks";
import { compactBRL, pct } from "@/lib/format";
import { identificarSetor, getMoedaExposicao, isRendaFixa } from "@/lib/sectors";
import { getSetorEconomico, SETOR_ECONOMICO_COLORS } from "@/lib/gics-sectors";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";

// ── Types ────────────────────────────────────────────────────────────────────

interface SimOp {
  id: string;
  tipo: "compra" | "venda";
  ticker: string;
  quantidade: number;
  preco: number;
  moeda: string;
  notas: string;
}

interface QuoteInfo {
  price: number;
  changePct: number;
  loading: boolean;
  error: boolean;
}

interface Allocation {
  setor: Record<string, number>;
  moeda: Record<string, number>;
  classe: Record<string, number>;
  tipo: Record<string, number>;
  custodia: Record<string, number>;
  setorEconomico: Record<string, number>;
  topPositions: { ticker: string; valor: number; pct: number }[];
  total: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: "#18181b",
  border: "1px solid #27272a",
  borderRadius: 12,
  color: "#fafafa",
  fontSize: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const SETOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#3b82f6",
  "Ações Internacional": "#6366f1",
  "ETF": "#8b5cf6",
  "ETF USA": "#a855f7",
  "FIIs": "#14b8a6",
  "Cripto": "#f59e0b",
  "BDRs": "#ec4899",
  "Commodities": "#d97706",
  "Renda Fixa": "#22c55e",
  "Renda Fixa USD": "#10b981",
  "Caixa/Liquidez": "#6b7280",
};

const MOEDA_COLORS: Record<string, string> = {
  BRL: "#22c55e", USD: "#3b82f6", EUR: "#8b5cf6", CAD: "#f59e0b",
  GBP: "#14b8a6", Cripto: "#f59e0b",
};

const CLASSE_COLORS: Record<string, string> = {
  "Renda Variável": "#3b82f6",
  "Renda Fixa": "#22c55e",
  "Cripto": "#f59e0b",
  "Commodities": "#d97706",
};

const CUSTODIA_COLORS: Record<string, string> = {
  Brasil: "#22c55e", Exterior: "#3b82f6", Cripto: "#f59e0b",
};

const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function getSetor(ticker: string): string {
  const t = ticker.toUpperCase().trim();
  if (CASH_TICKERS.has(t.split(/\s/)[0])) return "Caixa/Liquidez";
  return identificarSetor(t);
}

function getClasse(setor: string): string {
  if (setor === "Cripto") return "Cripto";
  if (setor === "Commodities") return "Commodities";
  if (["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"].includes(setor)) return "Renda Fixa";
  return "Renda Variável";
}

function getTipo(setor: string): string {
  if (setor === "FIIs") return "FIIs";
  if (setor === "Cripto") return "Cripto";
  if (setor.includes("ETF")) return "ETFs";
  if (setor === "BDRs") return "BDRs";
  if (setor.includes("Ações")) return "Ações";
  if (setor === "Commodities") return "Commodities";
  return "Renda Fixa";
}

function getCustodia(setor: string, moeda: string): string {
  if (setor === "Cripto") return "Cripto";
  if (moeda !== "BRL") return "Exterior";
  return "Brasil";
}

function detectMoeda(ticker: string, setor: string): string {
  const t = ticker.toUpperCase();
  if (t.includes(".")) {
    if (t.endsWith(".SA")) return "BRL";
    if (t.endsWith(".L")) return "GBP";
    if (t.endsWith(".DE") || t.endsWith(".AS")) return "EUR";
    if (t.endsWith(".TO")) return "CAD";
    if (t.endsWith(".T")) return "JPY";
    if (t.endsWith(".HK")) return "HKD";
    if (t.endsWith(".SW")) return "CHF";
    if (t.endsWith(".AX")) return "AUD";
    return "USD";
  }
  if (["Ações Brasil", "ETF", "FIIs", "BDRs", "Renda Fixa", "Caixa/Liquidez"].includes(setor)) return "BRL";
  return "USD";
}

const TIPO_COLORS: Record<string, string> = {
  "Ações": "#3b82f6", "ETFs": "#8b5cf6", "FIIs": "#14b8a6",
  "BDRs": "#ec4899", "Cripto": "#f59e0b", "Commodities": "#d97706",
  "Renda Fixa": "#22c55e",
};

// ── Build Allocation from positions ──────────────────────────────────────────

function buildAllocation(
  positions: { ticker: string; setor: string; moeda: string; valorAtualBRL: number; fatorBRL: number }[]
): Allocation {
  const setor: Record<string, number> = {};
  const moeda: Record<string, number> = {};
  const classe: Record<string, number> = {};
  const tipo: Record<string, number> = {};
  const custodia: Record<string, number> = {};
  const setorEconomico: Record<string, number> = {};
  let total = 0;

  for (const p of positions) {
    if (p.valorAtualBRL <= 0) continue;
    const v = p.valorAtualBRL;
    total += v;

    setor[p.setor] = (setor[p.setor] ?? 0) + v;

    const moedaExp = getMoedaExposicao(p.setor, p.moeda);
    moeda[moedaExp] = (moeda[moedaExp] ?? 0) + v;

    const cl = getClasse(p.setor);
    classe[cl] = (classe[cl] ?? 0) + v;

    const tp = getTipo(p.setor);
    tipo[tp] = (tipo[tp] ?? 0) + v;

    const cust = getCustodia(p.setor, p.moeda);
    custodia[cust] = (custodia[cust] ?? 0) + v;

    const se = getSetorEconomico(p.ticker, p.setor);
    setorEconomico[se] = (setorEconomico[se] ?? 0) + v;
  }

  const topPositions = positions
    .filter(p => p.valorAtualBRL > 0)
    .sort((a, b) => b.valorAtualBRL - a.valorAtualBRL)
    .slice(0, 15)
    .map(p => ({ ticker: p.ticker.replace(/\.SA$/, ""), valor: p.valorAtualBRL, pct: total > 0 ? (p.valorAtualBRL / total) * 100 : 0 }));

  return { setor, moeda, classe, tipo, custodia, setorEconomico, topPositions, total };
}

// ── DonutChart ───────────────────────────────────────────────────────────────

function DonutChart({ data, colors, title }: {
  data: Record<string, number>;
  colors: Record<string, string>;
  title: string;
}) {
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  if (chartData.length === 0) return null;

  return (
    <div>
      <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="flex items-center gap-4">
        <div className="w-[120px] h-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={32} outerRadius={55} dataKey="value" stroke="none" paddingAngle={1}>
                {chartData.map(e => <Cell key={e.name} fill={colors[e.name] ?? "#64748b"} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => compactBRL(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          {chartData.map(e => (
            <div key={e.name} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[e.name] ?? "#64748b" }} />
              <span className="text-zinc-400 truncate flex-1">{e.name}</span>
              <span className="text-zinc-300 font-mono tabular-nums shrink-0">{e.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CompareBar ───────────────────────────────────────────────────────────────

function CompareBar({ label, before, after, color }: {
  label: string; before: number; after: number; color: string;
}) {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-xs text-zinc-400 w-28 truncate">{label}</span>
      <span className="text-[10px] text-zinc-500 font-mono w-14 text-right">{before.toFixed(1)}%</span>
      <ArrowRight size={10} className="text-zinc-600 shrink-0" />
      <span className="text-xs text-zinc-200 font-mono font-semibold w-14 text-right">{after.toFixed(1)}%</span>
      <span className={`text-[10px] font-bold font-mono w-16 text-right ${delta > 0.1 ? "text-emerald-400" : delta < -0.1 ? "text-red-400" : "text-zinc-600"}`}>
        {Math.abs(delta) < 0.05 ? "—" : `${sign}${delta.toFixed(1)}pp`}
      </span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SimulacoesPage() {
  const { data, loading } = usePortfolio();
  const [ops, setOps] = useState<SimOp[]>([]);
  const [scenarioName, setScenarioName] = useState("Novo Cenário");
  const [savedScenarios, setSavedScenarios] = useState<Record<string, SimOp[]>>({});
  const [loadMenuOpen, setLoadMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [quoteCache, setQuoteCache] = useState<Record<string, QuoteInfo>>({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const [rfPositions, setRfPositions] = useState<{ ticker: string; atual: number; moeda: string; isCaixa: boolean }[]>([]);

  // Load RF positions from fixa_aberta
  useEffect(() => {
    fetch("/api/renda-fixa/posicoes")
      .then(r => r.json())
      .then(d => {
        const all = [
          ...(d.abertas ?? []).map((p: Record<string, unknown>) => ({
            ticker: String(p.ticker ?? ""),
            atual: Number(p.atual) || 0,
            moeda: String(p.moeda ?? "BRL"),
            isCaixa: false,
          })),
          ...(d.caixa ?? []).map((p: Record<string, unknown>) => ({
            ticker: String(p.ticker ?? ""),
            atual: Number(p.atual) || 0,
            moeda: String(p.moeda ?? "BRL"),
            isCaixa: true,
          })),
        ];
        setRfPositions(all);
      })
      .catch(() => {});
  }, []);

  // Load saved scenarios
  useEffect(() => {
    setLoadingScenarios(true);
    fetch("/api/simulacoes")
      .then(r => r.json())
      .then(d => {
        const raw = d.cenarios ?? {};
        const parsed: Record<string, SimOp[]> = {};
        for (const [name, rows] of Object.entries(raw)) {
          parsed[name] = (rows as Record<string, unknown>[]).map(r => ({
            id: uid(),
            tipo: (String(r.tipo ?? "compra").toLowerCase() as "compra" | "venda"),
            ticker: String(r.ticker ?? "").toUpperCase(),
            quantidade: Number(r.quantidade) || 0,
            preco: Number(r.preco) || 0,
            moeda: String(r.moeda ?? "BRL").toUpperCase(),
            notas: String(r.notas ?? ""),
          }));
        }
        setSavedScenarios(parsed);
      })
      .catch(() => {})
      .finally(() => setLoadingScenarios(false));
  }, []);

  const addOp = useCallback(() => {
    setOps(prev => [...prev, { id: uid(), tipo: "compra", ticker: "", quantidade: 0, preco: 0, moeda: "BRL", notas: "" }]);
  }, []);

  const removeOp = useCallback((id: string) => {
    setOps(prev => prev.filter(o => o.id !== id));
  }, []);

  const updateOp = useCallback((id: string, field: keyof SimOp, value: string | number) => {
    setOps(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
  }, []);

  const saveScenario = useCallback(async () => {
    if (!scenarioName.trim() || ops.length === 0) return;
    setSaving(true);
    try {
      await fetch("/api/simulacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cenario: scenarioName,
          operacoes: ops.map(o => ({
            tipo: o.tipo,
            ticker: o.ticker,
            quantidade: o.quantidade,
            preco: o.preco,
            moeda: o.moeda,
            notas: o.notas,
          })),
        }),
      });
      setSavedScenarios(prev => ({ ...prev, [scenarioName]: [...ops] }));
    } catch { /* ignore */ }
    setSaving(false);
  }, [scenarioName, ops]);

  const loadScenario = useCallback((name: string) => {
    const scenario = savedScenarios[name];
    if (!scenario) return;
    setScenarioName(name);
    setOps(scenario.map(o => ({ ...o, id: uid() })));
    setLoadMenuOpen(false);
  }, [savedScenarios]);

  const deleteScenario = useCallback(async (name: string) => {
    try {
      await fetch(`/api/simulacoes?cenario=${encodeURIComponent(name)}`, { method: "DELETE" });
      setSavedScenarios(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } catch { /* ignore */ }
  }, []);

  // ── Auto-fetch quote on ticker blur ──────────────────────────────────────
  const handleTickerBlur = useCallback((opId: string, ticker: string, currentMoeda: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t || t.length < 2) return;

    const setor = getSetor(t);
    const detectedMoeda = detectMoeda(t, setor);
    if (detectedMoeda !== currentMoeda) {
      setOps(prev => prev.map(o => o.id === opId ? { ...o, moeda: detectedMoeda } : o));
    }

    // RF tickers don't have market quotes — use fixa_aberta value or manual input
    if (isRendaFixa(setor) || CASH_TICKERS.has(t.split(/\s/)[0])) {
      const rfMatch = rfPositions.find(r => r.ticker.toUpperCase() === t);
      if (rfMatch && rfMatch.atual > 0) {
        const price = Math.round(rfMatch.atual * 100) / 100;
        setQuoteCache(prev => ({ ...prev, [t]: { price, changePct: 0, loading: false, error: false } }));
        setOps(prev => prev.map(o => o.id === opId && o.ticker.toUpperCase() === t
          ? { ...o, preco: price, quantidade: o.quantidade || 1 }
          : o));
      } else {
        setQuoteCache(prev => ({ ...prev, [t]: { price: 0, changePct: 0, loading: false, error: false } }));
        setOps(prev => prev.map(o => o.id === opId && o.ticker.toUpperCase() === t && !o.quantidade
          ? { ...o, quantidade: 1 }
          : o));
      }
      return;
    }

    if (fetchingRef.current.has(t)) return;

    const pos = data?.positions?.find(p =>
      p.ticker.replace(/\.SA$/, "").toUpperCase() === t && p.precoAtual != null && p.precoAtual > 0
    );
    if (pos) {
      const price = Math.round(pos.precoAtual! * 100) / 100;
      setQuoteCache(prev => ({ ...prev, [t]: { price, changePct: 0, loading: false, error: false } }));
      setOps(prev => prev.map(o => o.id === opId && o.ticker.toUpperCase() === t ? { ...o, preco: price } : o));
      return;
    }

    fetchingRef.current.add(t);
    setQuoteCache(prev => ({ ...prev, [t]: { price: 0, changePct: 0, loading: true, error: false } }));

    fetch(`/api/market/ohlc?ticker=${encodeURIComponent(t)}&moeda=${detectedMoeda}&range=5d`)
      .then(r => r.json())
      .then(d => {
        if (d.data?.length > 0) {
          const last = d.data[d.data.length - 1];
          const prevDay = d.data.length > 1 ? d.data[d.data.length - 2] : last;
          const chg = prevDay.close > 0 ? ((last.close / prevDay.close) - 1) * 100 : 0;
          const price = Math.round(last.close * 100) / 100;
          setQuoteCache(prev => ({ ...prev, [t]: { price, changePct: chg, loading: false, error: false } }));
          setOps(prev => prev.map(o => o.id === opId && o.ticker.toUpperCase() === t ? { ...o, preco: price } : o));
        } else {
          setQuoteCache(prev => ({ ...prev, [t]: { price: 0, changePct: 0, loading: false, error: true } }));
        }
      })
      .catch(() => {
        setQuoteCache(prev => ({ ...prev, [t]: { price: 0, changePct: 0, loading: false, error: true } }));
      })
      .finally(() => fetchingRef.current.delete(t));
  }, [data?.positions, rfPositions]);

  // ── Build current allocation from portfolio ────────────────────────────────
  const currentPositions = useMemo(() => {
    const positions = (data?.positions ?? [])
      .filter(p => p.quantidade > 0 && p.valorAtualBRL > 0)
      .map(p => ({
        ticker: p.ticker,
        setor: p.setor || identificarSetor(p.ticker),
        moeda: p.moeda || "BRL",
        valorAtualBRL: p.valorAtualBRL,
        precoAtual: p.precoAtual ?? 0,
        quantidade: p.quantidade,
        fatorBRL: p.fatorBRL,
      }));

    // Merge RF positions from fixa_aberta (NTN-B, CDB, Caixa, etc.)
    const usd = data?.usdbrl ?? 5.7;
    const rfFxMap: Record<string, number> = { BRL: 1, USD: usd };
    for (const rf of rfPositions) {
      if (rf.atual <= 0) continue;
      const setor = rf.isCaixa ? "Caixa/Liquidez" : "Renda Fixa";
      const fx = rfFxMap[rf.moeda] ?? 1;
      const valorBRL = rf.atual * fx;
      positions.push({
        ticker: rf.ticker,
        setor,
        moeda: rf.moeda,
        valorAtualBRL: valorBRL,
        precoAtual: rf.atual,
        quantidade: 1,
        fatorBRL: fx,
      });
    }

    return positions;
  }, [data, rfPositions]);

  const currentAlloc = useMemo(() => buildAllocation(currentPositions), [currentPositions]);

  // ── Build simulated allocation ─────────────────────────────────────────────
  const simAlloc = useMemo(() => {
    if (ops.length === 0) return null;
    const validOps = ops.filter(o => o.ticker && o.quantidade > 0 && o.preco > 0);
    if (validOps.length === 0) return null;

    const posMap = new Map<string, {
      ticker: string; setor: string; moeda: string; valorAtualBRL: number; fatorBRL: number;
    }>();
    for (const p of currentPositions) {
      posMap.set(p.ticker, { ...p });
    }

    const usd = data?.usdbrl ?? 5.7;
    const fxMap: Record<string, number> = {
      BRL: 1,
      USD: usd,
      EUR: data?.eurbrl ?? 6.4,
      CAD: data?.cadbrl ?? 4.1,
      GBP: data?.fx?.GBPBRL ?? 7.6,
      JPY: usd / 155,
      CHF: usd * 1.12,
      HKD: usd / 7.8,
      AUD: usd * 0.65,
    };

    for (const op of validOps) {
      const ticker = op.ticker.toUpperCase();
      const setor = getSetor(ticker);
      const fxRate = fxMap[op.moeda] ?? usd;
      const valorBRL = op.quantidade * op.preco * fxRate;

      const existing = posMap.get(ticker);
      if (op.tipo === "compra") {
        if (existing) {
          posMap.set(ticker, { ...existing, valorAtualBRL: existing.valorAtualBRL + valorBRL });
        } else {
          posMap.set(ticker, { ticker, setor, moeda: op.moeda, valorAtualBRL: valorBRL, fatorBRL: fxRate });
        }
      } else {
        if (existing) {
          const newVal = Math.max(0, existing.valorAtualBRL - valorBRL);
          if (newVal > 0) {
            posMap.set(ticker, { ...existing, valorAtualBRL: newVal });
          } else {
            posMap.delete(ticker);
          }
        }
      }
    }

    return buildAllocation([...posMap.values()]);
  }, [ops, currentPositions, data]);

  if (loading) return <LoadingSpinner />;

  const hasSim = simAlloc !== null;

  return (
    <>
      <PageHeader
        title="Simulações"
        description="Simule compras e vendas para visualizar o impacto na alocação"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Operation editor ── */}
        <div className="lg:col-span-1">
          {/* Scenario name + actions */}
          <div className="glass-card p-4 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Target size={16} className="text-amber-400" />
              <input
                type="text"
                value={scenarioName}
                onChange={e => setScenarioName(e.target.value)}
                className="flex-1 bg-transparent text-sm font-bold text-zinc-100 outline-none border-b border-transparent focus:border-amber-400/30 transition-colors"
                placeholder="Nome do cenário"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveScenario}
                disabled={saving || ops.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-40"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}
              >
                <Save size={12} /> {saving ? "Salvando..." : "Salvar"}
              </button>
              <div className="relative">
                <button
                  onClick={() => setLoadMenuOpen(!loadMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                  style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
                >
                  <FolderOpen size={12} /> Carregar <ChevronDown size={10} />
                </button>
                {loadMenuOpen && (
                  <div className="absolute top-full left-0 mt-1 w-56 rounded-xl z-20 py-1 overflow-hidden" style={{ background: "#1a1b22", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
                    {loadingScenarios ? (
                      <div className="px-3 py-4 text-center text-xs text-zinc-500">Carregando...</div>
                    ) : Object.keys(savedScenarios).length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-zinc-600">Nenhum cenário salvo</div>
                    ) : (
                      Object.entries(savedScenarios).map(([name, sOps]) => (
                        <div key={name} className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] transition-colors">
                          <button onClick={() => loadScenario(name)} className="flex-1 text-left text-xs text-zinc-300 truncate">
                            {name} <span className="text-zinc-600">({sOps.length} ops)</span>
                          </button>
                          <button onClick={() => deleteScenario(name)} className="text-zinc-600 hover:text-red-400 transition-colors p-0.5">
                            <Trash2 size={11} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setOps([]); setScenarioName("Novo Cenário"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-zinc-500 transition-all hover:text-zinc-300"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <RefreshCw size={11} /> Limpar
              </button>
            </div>
          </div>

          {/* Operations list */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-400">Operações simuladas</span>
              <button
                onClick={addOp}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={{ background: "rgba(212,165,116,0.1)", border: "1px solid rgba(212,165,116,0.2)", color: "#d4a574" }}
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>

            {ops.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-zinc-600 mb-2">Nenhuma operação ainda</p>
                <p className="text-[10px] text-zinc-700">Clique em &quot;Adicionar&quot; para simular compras e vendas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ops.map(op => (
                  <div key={op.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        value={op.tipo}
                        onChange={e => updateOp(op.id, "tipo", e.target.value)}
                        className="bg-transparent text-xs font-bold rounded-md px-2 py-1 outline-none cursor-pointer"
                        style={{
                          border: `1px solid ${op.tipo === "compra" ? "rgba(34,197,94,0.3)" : "rgba(248,113,113,0.3)"}`,
                          color: op.tipo === "compra" ? "#4ade80" : "#f87171",
                        }}
                      >
                        <option value="compra">Compra</option>
                        <option value="venda">Venda</option>
                      </select>
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={op.ticker}
                          onChange={e => updateOp(op.id, "ticker", e.target.value.toUpperCase())}
                          onBlur={() => handleTickerBlur(op.id, op.ticker, op.moeda)}
                          placeholder="TICKER"
                          className="w-full bg-transparent text-xs font-bold text-zinc-100 outline-none border-b border-zinc-800 focus:border-amber-400/30 px-1 py-1 uppercase"
                        />
                        {quoteCache[op.ticker.trim().toUpperCase()]?.loading && (
                          <Loader2 size={10} className="absolute right-0 top-1/2 -translate-y-1/2 text-amber-400 animate-spin" />
                        )}
                      </div>
                      <select
                        value={op.moeda}
                        onChange={e => updateOp(op.id, "moeda", e.target.value)}
                        className="bg-transparent text-[10px] text-zinc-400 rounded-md px-1.5 py-1 outline-none cursor-pointer"
                        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <option value="BRL">BRL</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="CAD">CAD</option>
                        <option value="JPY">JPY</option>
                        <option value="CHF">CHF</option>
                        <option value="HKD">HKD</option>
                        <option value="AUD">AUD</option>
                      </select>
                      <button onClick={() => removeOp(op.id)} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                        <X size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-zinc-600 uppercase tracking-wider">Qtd</label>
                        <input
                          type="number"
                          value={op.quantidade || ""}
                          onChange={e => updateOp(op.id, "quantidade", Number(e.target.value))}
                          className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-amber-400/30 py-0.5 font-mono"
                          placeholder="0"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-600 uppercase tracking-wider">Preço unit.</label>
                        <input
                          type="number"
                          value={op.preco || ""}
                          onChange={e => updateOp(op.id, "preco", Number(e.target.value))}
                          className="w-full bg-transparent text-xs text-zinc-200 outline-none border-b border-zinc-800 focus:border-amber-400/30 py-0.5 font-mono"
                          placeholder="0.00"
                          min={0}
                          step={0.01}
                        />
                      </div>
                    </div>
                    {/* Quote info bar */}
                    {(() => {
                      const t = op.ticker.trim().toUpperCase();
                      if (t.length < 2) return null;
                      const setor = getSetor(t);
                      const rfTicker = isRendaFixa(setor) || CASH_TICKERS.has(t.split(/\s/)[0]);
                      const q = quoteCache[t];

                      if (rfTicker && !q?.loading) {
                        const rfMatch = rfPositions.find(r => r.ticker.toUpperCase() === t);
                        return (
                          <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)" }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#22c55e" }} />
                            <span className="text-[10px] text-emerald-400/70">{setor}</span>
                            {rfMatch && rfMatch.atual > 0 && (
                              <span className="text-[10px] text-zinc-300 font-mono font-bold">
                                R$ {rfMatch.atual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                            {!rfMatch && <span className="text-[9px] text-zinc-600">Insira o valor manualmente</span>}
                            <span className="text-[9px] text-zinc-600 ml-auto">{getSetorEconomico(t, setor)}</span>
                          </div>
                        );
                      }

                      if (!q) return null;
                      if (q.loading) return (
                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-zinc-500">
                          <Loader2 size={10} className="animate-spin text-amber-400/60" />
                          Buscando cotação...
                        </div>
                      );
                      if (q.error) return (
                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-red-400/60">
                          <X size={9} />
                          Cotação não encontrada
                        </div>
                      );
                      if (q.price > 0) {
                        const ms = op.moeda === "BRL" ? "R$" : op.moeda === "EUR" ? "€" : "$";
                        const isUp = q.changePct >= 0;
                        return (
                          <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#4ade80" }} />
                            <span className="text-[10px] text-zinc-500">Cotação</span>
                            <span className="text-[10px] text-zinc-200 font-bold font-mono">
                              {ms} {q.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {q.changePct !== 0 && (
                              <span className={`text-[10px] font-bold font-mono ${isUp ? "text-emerald-400" : "text-red-400"}`}>
                                {isUp ? "+" : ""}{q.changePct.toFixed(2)}%
                              </span>
                            )}
                            <span className="text-[9px] text-zinc-600 ml-auto">{getSetorEconomico(t, setor)}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {op.ticker && op.quantidade > 0 && op.preco > 0 && (
                      <div className="mt-2 text-[10px] text-zinc-500">
                        Total: <strong className="text-zinc-300">{op.moeda === "BRL" ? compactBRL(op.quantidade * op.preco) : `$${(op.quantidade * op.preco).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</strong>
                        <span className="text-zinc-700 ml-1">· {getSetor(op.ticker)} · {getSetorEconomico(op.ticker, getSetor(op.ticker))}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Allocation comparison ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary cards */}
          {hasSim && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="Patrimônio Atual" value={compactBRL(currentAlloc.total)} />
              <SummaryCard label="Patrimônio Simulado" value={compactBRL(simAlloc.total)} accent />
              <SummaryCard
                label="Variação"
                value={`${simAlloc.total - currentAlloc.total >= 0 ? "+" : ""}${compactBRL(simAlloc.total - currentAlloc.total)}`}
                trend={simAlloc.total >= currentAlloc.total ? "up" : "down"}
              />
              <SummaryCard
                label="Δ %"
                value={currentAlloc.total > 0 ? `${simAlloc.total >= currentAlloc.total ? "+" : ""}${pct((simAlloc.total - currentAlloc.total) / currentAlloc.total * 100, 1)}` : "—"}
                trend={simAlloc.total >= currentAlloc.total ? "up" : "down"}
              />
            </div>
          )}

          {/* Allocation grids */}
          {[
            { title: "Setor Econômico", colors: SETOR_ECONOMICO_COLORS, key: "setorEconomico" as const },
            { title: "Tipo de Ativo", colors: SETOR_COLORS, key: "setor" as const },
            { title: "Moeda / Exposição Cambial", colors: MOEDA_COLORS, key: "moeda" as const },
            { title: "Classe", colors: CLASSE_COLORS, key: "classe" as const },
            { title: "Tipo", colors: TIPO_COLORS, key: "tipo" as const },
            { title: "Custódia", colors: CUSTODIA_COLORS, key: "custodia" as const },
          ].map(({ title, colors, key }) => (
            <div key={key} className="glass-card p-5">
              <h2 className="text-xs font-semibold text-zinc-300 mb-4">{title}</h2>
              {hasSim ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2 block">Atual</span>
                    <DonutChart data={currentAlloc[key]} colors={colors} title="" />
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-400/70 uppercase tracking-wider font-semibold mb-2 block">Simulado</span>
                    <DonutChart data={simAlloc[key]} colors={colors} title="" />
                  </div>
                </div>
              ) : (
                <DonutChart data={currentAlloc[key]} colors={colors} title="" />
              )}

              {/* Delta table */}
              {hasSim && (() => {
                const allKeys = [...new Set([...Object.keys(currentAlloc[key]), ...Object.keys(simAlloc[key])])];
                const totalBefore = currentAlloc.total;
                const totalAfter = simAlloc.total;
                return (
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2 block">Comparativo</span>
                    {allKeys
                      .sort((a, b) => (simAlloc[key][b] ?? 0) - (simAlloc[key][a] ?? 0))
                      .map(k => (
                        <CompareBar
                          key={k}
                          label={k}
                          before={totalBefore > 0 ? ((currentAlloc[key][k] ?? 0) / totalBefore) * 100 : 0}
                          after={totalAfter > 0 ? ((simAlloc[key][k] ?? 0) / totalAfter) * 100 : 0}
                          color={colors[k] ?? "#64748b"}
                        />
                      ))}
                  </div>
                );
              })()}
            </div>
          ))}

          {/* Top positions comparison */}
          {hasSim && (
            <div className="glass-card p-5">
              <h2 className="text-xs font-semibold text-zinc-300 mb-4">Top 15 Posições — Simulado</h2>
              <div className="space-y-1">
                {simAlloc.topPositions.map(p => (
                  <div key={p.ticker} className="flex items-center gap-2 py-1">
                    <span className="text-xs font-bold text-zinc-200 w-20 truncate">{p.ticker}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(p.pct * 2, 100)}%`, background: "rgba(212,165,116,0.5)" }} />
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono w-12 text-right">{p.pct.toFixed(1)}%</span>
                    <span className="text-[10px] text-zinc-500 font-mono w-16 text-right">{compactBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasSim && (
            <div className="glass-card p-8 text-center">
              <Target size={32} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 font-semibold mb-1">Adicione operações para simular</p>
              <p className="text-xs text-zinc-600">
                Veja como compras e vendas afetam sua alocação por setor, moeda, classe, tipo e custódia
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Small helper component ───────────────────────────────────────────────────

function SummaryCard({ label, value, accent, trend }: {
  label: string; value: string; accent?: boolean; trend?: "up" | "down";
}) {
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-zinc-100";
  return (
    <div className="glass-card p-3 text-center">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className={`text-sm font-bold ${accent ? "text-amber-400" : trend ? trendColor : "text-zinc-100"}`}>
        {value}
      </div>
    </div>
  );
}
