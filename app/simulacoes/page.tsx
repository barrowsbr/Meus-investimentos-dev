"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";
import {
  Target, Plus, Trash2, Save, FolderOpen, ArrowRight,
  ChevronDown, ChevronRight, X, RefreshCw, Loader2, Layers,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import type { PortfolioResponse } from "@/lib/hooks";
import { compactBRL } from "@/lib/format";
import { bumpDataVersion, withDataVersion } from "@/lib/data-version";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
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
  sector?: string;
  industry?: string;
  longName?: string;
  resolvedSymbol?: string;
  currency?: string;
}

interface Allocation {
  setor: Record<string, number>;
  moeda: Record<string, number>;
  classe: Record<string, number>;
  rfRv: Record<string, number>;
  tipo: Record<string, number>;
  custodia: Record<string, number>;
  setorEconomico: Record<string, number>;
  allPositions: { ticker: string; setor: string; valor: number; pct: number }[];
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

const RF_RV_COLORS: Record<string, string> = {
  "Renda Variável": "#3b82f6",
  "Renda Fixa": "#22c55e",
};

const CUSTODIA_COLORS: Record<string, string> = {
  Brasil: "#22c55e", Exterior: "#3b82f6", Cripto: "#f59e0b",
};

const CASH_TICKERS = new Set(["CAIXA", "SALDO", "CASH", "RESERVA"]);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Números vindos do Sheets chegam formatados pt-BR ("561,2") — Number() daria NaN.
function numBR(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return isNaN(n) ? 0 : n;
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

const EXCHANGE_CURRENCY: Record<string, string> = {
  ".SA": "BRL", ".L": "GBP", ".DE": "EUR", ".AS": "EUR",
  ".PA": "EUR", ".MI": "EUR", ".MC": "EUR", ".HE": "EUR",
  ".BR": "EUR", ".LS": "EUR", ".VI": "EUR", ".AT": "EUR",
  ".TO": "CAD", ".V": "CAD",
  ".T": "JPY", ".TYO": "JPY",
  ".HK": "HKD",
  ".SW": "CHF",
  ".AX": "AUD", ".NZ": "NZD",
  ".KS": "KRW", ".KQ": "KRW",
  ".TW": "TWD", ".TWO": "TWD",
  ".SI": "SGD",
  ".BO": "INR", ".NS": "INR",
  ".JK": "IDR",
  ".MX": "MXN",
  ".ST": "SEK", ".CO": "DKK", ".OL": "NOK",
  ".IS": "TRY",
};

function detectMoeda(ticker: string, setor: string): string {
  const t = ticker.toUpperCase();
  if (t.includes(".")) {
    for (const [suffix, currency] of Object.entries(EXCHANGE_CURRENCY)) {
      if (t.endsWith(suffix.toUpperCase())) return currency;
    }
    return "USD";
  }
  if (["Ações Brasil", "ETF", "FIIs", "BDRs", "Renda Fixa", "Caixa/Liquidez"].includes(setor)) return "BRL";
  return "USD";
}

function detectMoedaFromSymbol(resolvedSymbol: string): string | null {
  const t = resolvedSymbol.toUpperCase();
  for (const [suffix, currency] of Object.entries(EXCHANGE_CURRENCY)) {
    if (t.endsWith(suffix.toUpperCase())) return currency;
  }
  return null;
}

const TIPO_COLORS: Record<string, string> = {
  "Ações": "#3b82f6", "ETFs": "#8b5cf6", "FIIs": "#14b8a6",
  "BDRs": "#ec4899", "Cripto": "#f59e0b", "Commodities": "#d97706",
  "Renda Fixa": "#22c55e",
};

// ── Build Allocation from positions ──────────────────────────────────────────

function buildAllocation(
  positions: { ticker: string; setor: string; moeda: string; valorAtualBRL: number; fatorBRL: number }[],
  sectorCache?: Record<string, QuoteInfo>,
): Allocation {
  const setor: Record<string, number> = {};
  const moeda: Record<string, number> = {};
  const classe: Record<string, number> = {};
  const rfRv: Record<string, number> = {};
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

    // Visão binária: tudo que não é RF (incl. cripto/commodities) conta como RV
    const bin = cl === "Renda Fixa" ? "Renda Fixa" : "Renda Variável";
    rfRv[bin] = (rfRv[bin] ?? 0) + v;

    const tp = getTipo(p.setor);
    tipo[tp] = (tipo[tp] ?? 0) + v;

    const cust = getCustodia(p.setor, p.moeda);
    custodia[cust] = (custodia[cust] ?? 0) + v;

    const tClean = p.ticker.toUpperCase().replace(/\.SA$/, "");
    const apiSector = sectorCache?.[tClean]?.sector;
    const se = getSetorEconomico(p.ticker, p.setor, apiSector);
    setorEconomico[se] = (setorEconomico[se] ?? 0) + v;
  }

  const allPositions = positions
    .filter(p => p.valorAtualBRL > 0)
    .sort((a, b) => b.valorAtualBRL - a.valorAtualBRL)
    .map(p => ({ ticker: p.ticker.replace(/\.SA$/, ""), setor: p.setor, valor: p.valorAtualBRL, pct: total > 0 ? (p.valorAtualBRL / total) * 100 : 0 }));

  return { setor, moeda, classe, rfRv, tipo, custodia, setorEconomico, allPositions, total };
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
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => compactBRL(v)} />
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
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
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
            quantidade: numBR(r.quantidade),
            preco: numBR(r.preco),
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
    const name = scenarioName.trim();
    if (!name) {
      setSaveMsg({ type: "err", text: "Dê um nome ao cenário antes de salvar" });
      return;
    }
    if (ops.length === 0) {
      setSaveMsg({ type: "err", text: "Adicione ao menos uma operação antes de salvar" });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/simulacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cenario: name,
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
      const d = await res.json();
      if (res.ok && !d.error) {
        setSavedScenarios(prev => ({ ...prev, [name]: [...ops] }));
        setSaveMsg({ type: "ok", text: `Cenário "${name}" salvo (${d.saved} ops)` });
      } else {
        setSaveMsg({ type: "err", text: d.error ?? `Erro HTTP ${res.status}` });
      }
    } catch {
      setSaveMsg({ type: "err", text: "Erro de rede ao salvar" });
    }
    setSaving(false);
  }, [scenarioName, ops]);

  const loadScenario = useCallback((name: string) => {
    const scenario = savedScenarios[name];
    if (!scenario) return;
    setScenarioName(name);
    setOps(scenario.map(o => ({ ...o, id: uid() })));
    setLoadMenuOpen(false);
    setSaveMsg(null);
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
          setQuoteCache(prev => ({ ...prev, [t]: {
            price, changePct: chg, loading: false, error: false,
            sector: d.sector, industry: d.industry, longName: d.longName,
            resolvedSymbol: d.symbol, currency: d.currency,
          } }));
          setOps(prev => prev.map(o => {
            if (o.id !== opId || o.ticker.toUpperCase() !== t) return o;
            const updates: Partial<SimOp> = { preco: price };
            // Auto-detect currency from resolved symbol if different
            if (d.symbol && d.symbol !== t) {
              const symMoeda = detectMoedaFromSymbol(d.symbol);
              if (symMoeda && symMoeda !== o.moeda) updates.moeda = symMoeda;
            }
            if (d.currency) {
              const apiCurrency = d.currency.toUpperCase();
              if (apiCurrency !== o.moeda && apiCurrency.length === 3) updates.moeda = apiCurrency;
            }
            return { ...o, ...updates };
          }));
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

  const currentAlloc = useMemo(() => buildAllocation(currentPositions, quoteCache), [currentPositions, quoteCache]);

  // ── FX map (shared between simAlloc and ticker card display) ──────────────
  // Câmbio AO VIVO: busca taxas atuais no load e a cada 5 min — as operações
  // simuladas são reavaliadas com o câmbio mais recente, não o do momento em
  // que foram adicionadas.
  const [fxLive, setFxLive] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const fetchFx = () => {
      fetch("https://open.er-api.com/v6/latest/USD")
        .then(r => r.json())
        .then(d => {
          if (cancelled || !d?.rates?.BRL) return;
          const brlPerUsd = d.rates.BRL as number;
          const out: Record<string, number> = { BRL: 1, USD: brlPerUsd };
          for (const [code, rate] of Object.entries(d.rates as Record<string, number>)) {
            if (typeof rate === "number" && rate > 0) out[code] = brlPerUsd / rate;
          }
          setFxLive(out);
        })
        .catch(() => {});
    };
    fetchFx();
    const t = setInterval(fetchFx, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const fxMap = useMemo(() => {
    const usd = data?.usdbrl ?? 5.7;
    const base = {
      BRL: 1, USD: usd, EUR: data?.eurbrl ?? 6.4, CAD: data?.cadbrl ?? 4.1,
      GBP: data?.fx?.GBPBRL ?? 7.6, JPY: usd / 155, CHF: usd * 1.12,
      HKD: usd / 7.8, AUD: usd * 0.65, KRW: usd / 1380, TWD: usd / 32,
      SGD: usd * 0.74, INR: usd / 84, SEK: usd / 10.5, DKK: usd / 6.9,
      NOK: usd / 10.8, NZD: usd * 0.62, MXN: usd / 17.5, TRY: usd / 32,
      IDR: usd / 15700,
    } as Record<string, number>;
    return fxLive ? { ...base, ...fxLive } : base;
  }, [data, fxLive]);

  // ── Auto-refresh das cotações das operações ───────────────────────────────
  // Preço acompanha a cotação mais atual (no load do cenário e a cada 60s),
  // não fica congelado no momento em que a operação foi criada.
  const opsRef = useRef(ops);
  opsRef.current = ops;
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<Date | null>(null);

  const refreshQuotes = useCallback(() => {
    const current = opsRef.current;
    const tickers = [...new Set(current.map(o => o.ticker.trim().toUpperCase()).filter(t => t.length >= 2))];
    for (const t of tickers) {
      const setor = getSetor(t);
      if (isRendaFixa(setor) || CASH_TICKERS.has(t.split(/\s/)[0])) continue;
      if (fetchingRef.current.has(t)) continue;
      fetchingRef.current.add(t);
      const moeda = current.find(o => o.ticker.trim().toUpperCase() === t)?.moeda ?? detectMoeda(t, setor);
      fetch(`/api/market/ohlc?ticker=${encodeURIComponent(t)}&moeda=${moeda}&range=5d`)
        .then(r => r.json())
        .then(d => {
          if (!(d.data?.length > 0)) return;
          const last = d.data[d.data.length - 1];
          const prevDay = d.data.length > 1 ? d.data[d.data.length - 2] : last;
          const chg = prevDay.close > 0 ? ((last.close / prevDay.close) - 1) * 100 : 0;
          const price = Math.round(last.close * 100) / 100;
          setQuoteCache(prev => ({ ...prev, [t]: {
            price, changePct: chg, loading: false, error: false,
            sector: d.sector ?? prev[t]?.sector, industry: d.industry ?? prev[t]?.industry,
            longName: d.longName ?? prev[t]?.longName,
            resolvedSymbol: d.symbol ?? prev[t]?.resolvedSymbol,
            currency: d.currency ?? prev[t]?.currency,
          } }));
          setOps(prev => prev.map(o => o.ticker.trim().toUpperCase() === t ? { ...o, preco: price } : o));
          setQuotesUpdatedAt(new Date());
        })
        .catch(() => {})
        .finally(() => fetchingRef.current.delete(t));
    }
  }, []);

  const tickersKey = ops.map(o => o.ticker.trim().toUpperCase()).filter(t => t.length >= 2).sort().join(",");
  useEffect(() => {
    if (!tickersKey) return;
    refreshQuotes();
    const t = setInterval(refreshQuotes, 60_000);
    return () => clearInterval(t);
  }, [tickersKey, refreshQuotes]);

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

    for (const op of validOps) {
      const ticker = op.ticker.toUpperCase();
      const setor = getSetor(ticker);
      const fxRate = fxMap[op.moeda] ?? fxMap.USD ?? usd;
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

    return buildAllocation([...posMap.values()], quoteCache);
  }, [ops, currentPositions, data, fxMap, quoteCache]);

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
          <div className="glass-card p-4 mb-4 relative" style={{ zIndex: 10, overflow: "visible" }}>
            <div className="flex items-center gap-2 mb-3">
              <Target size={16} className="text-amber-400" />
              <input
                type="text"
                value={scenarioName}
                onChange={e => { setScenarioName(e.target.value); setSaveMsg(null); }}
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
                  <div className="absolute top-full left-0 mt-1 w-56 rounded-xl py-1 overflow-hidden" style={{ zIndex: 50, background: "#1a1b22", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
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
                onClick={() => { setOps([]); setScenarioName("Novo Cenário"); setSaveMsg(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-zinc-500 transition-all hover:text-zinc-300"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <Plus size={11} /> Novo
              </button>
            </div>
            {saveMsg && (
              <div className={`mt-2 text-[10px] font-semibold ${saveMsg.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                {saveMsg.text}
              </div>
            )}
          </div>

          {/* Operations list */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-zinc-400">
                Operações simuladas
                {quotesUpdatedAt && (
                  <span className="ml-2 text-[9px] text-zinc-600 font-normal">
                    · cotações/câmbio ao vivo · {quotesUpdatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </span>
              <button
                onClick={addOp}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all"
                style={{ background: "rgba(232,163,61,0.1)", border: "1px solid rgba(232,163,61,0.2)", color: "#E8A33D" }}
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
                        <option value="KRW">KRW</option>
                        <option value="TWD">TWD</option>
                        <option value="SGD">SGD</option>
                        <option value="INR">INR</option>
                        <option value="SEK">SEK</option>
                        <option value="DKK">DKK</option>
                        <option value="NOK">NOK</option>
                        <option value="NZD">NZD</option>
                        <option value="MXN">MXN</option>
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
                        const econSector = getSetorEconomico(t, setor, q.sector);
                        return (
                          <div className="flex flex-col gap-1 mt-2 px-2 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                            <div className="flex items-center gap-2">
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
                              <span className="text-[9px] text-zinc-600 ml-auto">{econSector}</span>
                            </div>
                            {(q.longName || q.resolvedSymbol) && (
                              <div className="flex items-center gap-2 text-[9px] text-zinc-600">
                                {q.longName && <span className="truncate">{q.longName}</span>}
                                {q.resolvedSymbol && q.resolvedSymbol !== t && (
                                  <span className="shrink-0 text-amber-400/50">({q.resolvedSymbol})</span>
                                )}
                                {q.industry && <span className="shrink-0 ml-auto">{q.industry}</span>}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                    {op.ticker && op.quantidade > 0 && op.preco > 0 && (() => {
                      const totalLocal = op.quantidade * op.preco;
                      const fx = fxMap[op.moeda] ?? 1;
                      const totalBRL = totalLocal * fx;
                      const isBRL = op.moeda === "BRL";
                      const currSym = op.moeda === "EUR" ? "€" : op.moeda === "GBP" ? "£" : op.moeda === "JPY" ? "¥" : "$";
                      return (
                        <div className="mt-2 text-[10px] text-zinc-500">
                          Total:{" "}
                          {!isBRL && (
                            <span className="text-zinc-400">{currSym} {totalLocal.toLocaleString("en-US", { maximumFractionDigits: 0 })} → </span>
                          )}
                          <strong className="text-zinc-300">{compactBRL(totalBRL)}</strong>
                          <span className="text-zinc-700 ml-1">· {getSetor(op.ticker)} · {getSetorEconomico(op.ticker, getSetor(op.ticker), quoteCache[op.ticker.trim().toUpperCase()]?.sector)}</span>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Allocation comparison ── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary cards — Patrimônio / Caixa USD / Novo Patrimônio */}
          {hasSim && (() => {
            const usdFx = data?.usdbrl ?? 5.7;

            const initialCaixaUSD = rfPositions
              .filter(r => r.isCaixa && r.moeda === "USD")
              .reduce((s, r) => s + r.atual, 0);
            const initialCaixaBRL = rfPositions
              .filter(r => r.isCaixa && r.moeda === "BRL")
              .reduce((s, r) => s + r.atual, 0);

            const validOps = ops.filter(o => o.ticker && o.quantidade > 0 && o.preco > 0);
            const consumedUSD = validOps
              .filter(o => o.moeda === "USD")
              .reduce((s, o) => s + (o.tipo === "compra" ? 1 : -1) * o.quantidade * o.preco, 0);
            const consumedBRL = validOps
              .filter(o => o.moeda === "BRL")
              .reduce((s, o) => s + (o.tipo === "compra" ? 1 : -1) * o.quantidade * o.preco, 0);

            const remainingUSD = initialCaixaUSD - consumedUSD;
            const remainingBRL = initialCaixaBRL - consumedBRL;
            const isMargin = remainingUSD < 0;

            const novoPatrimonio = simAlloc.total - consumedUSD * usdFx - consumedBRL;

            const fmtUSD = (v: number) =>
              `$ ${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

            // Somatório líquido (compras − vendas) por moeda nativa das operações
            const SYM: Record<string, string> = {
              BRL: "R$", USD: "US$", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF",
              CAD: "C$", AUD: "A$", HKD: "HK$", SGD: "S$", MXN: "MX$",
            };
            const porMoeda: Record<string, number> = {};
            for (const op of validOps) {
              const sign = op.tipo === "compra" ? 1 : -1;
              porMoeda[op.moeda] = (porMoeda[op.moeda] ?? 0) + sign * op.quantidade * op.preco;
            }
            const moedas = Object.entries(porMoeda)
              .filter(([, v]) => Math.abs(v) > 0.005)
              .sort((a, b) => Math.abs(b[1] * (fxMap[b[0]] ?? 1)) - Math.abs(a[1] * (fxMap[a[0]] ?? 1)));
            const totalOpsBRL = moedas.reduce((s, [m, v]) => s + v * (fxMap[m] ?? 1), 0);
            const totalOpsUSD = usdFx > 0 ? totalOpsBRL / usdFx : 0;
            const fmtNative = (m: string, v: number) =>
              `${SYM[m] ?? m} ${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 })}`;

            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Card 1: Patrimônio Atual */}
                <div className="glass-card p-4 text-center">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Patrimônio Atual</div>
                  <div className="text-lg font-bold text-zinc-100">{compactBRL(currentAlloc.total)}</div>
                </div>

                {/* Card 2: Caixa USD (IBKR) */}
                <div className="glass-card p-4 text-center">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
                    {isMargin ? "Margin Necessária · IBKR" : "Caixa USD · IBKR"}
                  </div>
                  <div className={`text-lg font-bold ${isMargin ? "text-red-400" : remainingUSD > 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                    {isMargin ? "−" : ""}{fmtUSD(remainingUSD)}
                  </div>
                  {consumedUSD !== 0 && (
                    <div className="text-[10px] text-zinc-600 mt-1 font-mono">
                      {fmtUSD(initialCaixaUSD)} → {isMargin ? "−" : ""}{fmtUSD(remainingUSD)}
                    </div>
                  )}
                </div>

                {/* Card 3: Operações por Moeda (somatório do que foi adicionado) */}
                <div className="glass-card p-4">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 text-center">Operações por Moeda</div>
                  <div className="space-y-0.5">
                    {moedas.length === 0 && <div className="text-xs text-zinc-600 text-center">—</div>}
                    {moedas.slice(0, 3).map(([m, v]) => (
                      <div key={m} className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500">{m}{v < 0 ? " (venda)" : ""}</span>
                        <span className={`font-bold font-mono ${v >= 0 ? "text-zinc-200" : "text-emerald-400"}`}>{fmtNative(m, v)}</span>
                      </div>
                    ))}
                    {moedas.length > 3 && <div className="text-[9px] text-zinc-600 text-center">+{moedas.length - 3} moedas</div>}
                  </div>
                  {moedas.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-white/5 text-[10px] text-center">
                      <span className="text-amber-400 font-bold font-mono">{compactBRL(totalOpsBRL)}</span>
                      <span className="text-zinc-600 mx-1">·</span>
                      <span className="text-sky-400 font-bold font-mono">{totalOpsUSD >= 0 ? "" : "−"}US$ {Math.abs(totalOpsUSD).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
                </div>

                {/* Card 4: Novo Patrimônio */}
                <div className="glass-card p-4 text-center">
                  <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">Novo Patrimônio</div>
                  <div className="text-lg font-bold text-amber-400">{compactBRL(novoPatrimonio)}</div>
                  <div className="text-[10px] text-zinc-600 mt-1">
                    {remainingBRL > 0 && <span>Caixa BR {compactBRL(remainingBRL)}</span>}
                    {isMargin && (
                      <span className={remainingBRL > 0 ? "ml-2" : ""}>
                        <span className="text-red-400/70">Margin {fmtUSD(Math.abs(remainingUSD))}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Impacto por setor — o que o cenário muda na alocação setorial */}
          {hasSim && (() => {
            const keys = [...new Set([...Object.keys(currentAlloc.setorEconomico), ...Object.keys(simAlloc.setorEconomico)])];
            const rows = keys
              .map(k => {
                const before = currentAlloc.total > 0 ? ((currentAlloc.setorEconomico[k] ?? 0) / currentAlloc.total) * 100 : 0;
                const after = simAlloc.total > 0 ? ((simAlloc.setorEconomico[k] ?? 0) / simAlloc.total) * 100 : 0;
                return { setor: k, before, after, delta: after - before };
              })
              .filter(r => Math.abs(r.delta) > 0.05)
              .sort((a, b) => b.delta - a.delta);
            if (rows.length === 0) return null;
            const top3 = (se: Record<string, number>, total: number) =>
              total > 0 ? Object.values(se).sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0) / total * 100 : 0;
            const concBefore = top3(currentAlloc.setorEconomico, currentAlloc.total);
            const concAfter = top3(simAlloc.setorEconomico, simAlloc.total);
            const maxAbs = Math.max(...rows.map(r => Math.abs(r.delta)), 0.1);
            return (
              <div className="glass-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-zinc-300">Impacto Setorial do Cenário</h2>
                  <span className="text-[10px] text-zinc-600">
                    Concentração top-3: <span className="text-zinc-400">{concBefore.toFixed(1)}%</span>
                    <ArrowRight size={9} className="inline mx-1 text-zinc-700" />
                    <span className={concAfter > concBefore + 0.1 ? "text-amber-400" : concAfter < concBefore - 0.1 ? "text-emerald-400" : "text-zinc-400"}>{concAfter.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  {rows.map(r => (
                    <div key={r.setor} className="flex items-center gap-2 text-xs">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SETOR_ECONOMICO_COLORS[r.setor] ?? "#64748b" }} />
                      <span className="text-zinc-400 w-36 truncate">{r.setor}</span>
                      <div className="flex-1 h-3 relative">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-700" />
                        <div
                          className="absolute inset-y-0.5 rounded-sm"
                          style={r.delta >= 0
                            ? { left: "50%", width: `${(r.delta / maxAbs) * 48}%`, background: "rgba(52,211,153,0.6)" }
                            : { right: "50%", width: `${(-r.delta / maxAbs) * 48}%`, background: "rgba(248,113,113,0.6)" }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono w-24 text-right">{r.before.toFixed(1)}% → {r.after.toFixed(1)}%</span>
                      <span className={`text-[10px] font-bold font-mono w-14 text-right ${r.delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {r.delta > 0 ? "+" : ""}{r.delta.toFixed(1)}pp
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Allocation grids */}
          {[
            { title: "Renda Fixa × Renda Variável", colors: RF_RV_COLORS, key: "rfRv" as const },
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

          {/* All positions */}
          {hasSim && (
            <div className="glass-card p-5">
              <h2 className="text-xs font-semibold text-zinc-300 mb-4">
                Todas as Posições — Simulado ({simAlloc.allPositions.length})
              </h2>
              <div className="space-y-1">
                {simAlloc.allPositions.map(p => (
                  <div key={p.ticker} className="flex items-center gap-2 py-1">
                    <span className="text-xs font-bold text-zinc-200 w-20 truncate">{p.ticker}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(p.pct * 2, 100)}%`, background: SETOR_ECONOMICO_COLORS[getSetorEconomico(p.ticker, p.setor, quoteCache[p.ticker.toUpperCase()]?.sector)] ?? "rgba(232,163,61,0.5)" }} />
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono w-12 text-right">{p.pct.toFixed(1)}%</span>
                    <span className="text-[10px] text-zinc-500 font-mono w-16 text-right">{compactBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ETF Look-Through */}
          <EtfLookThrough
            alloc={hasSim ? simAlloc : currentAlloc}
            positions={hasSim
              ? simAlloc.allPositions
              : currentAlloc.allPositions}
          />

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

// ── ETF Look-Through ────────────────────────────────────────────────────────

interface CompositionData {
  ticker: string;
  valor_brl: number;
  components: { ativo: string; name: string; peso: number }[];
}

function EtfLookThrough({ alloc, positions }: {
  alloc: Allocation;
  positions: { ticker: string; setor: string; valor: number; pct: number }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"por-etf" | "combinada" | "rv-completa" | "portfolio-completo">("combinada");
  const [compositions, setCompositions] = useState<Record<string, CompositionData> | null>(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [staleInfo, setStaleInfo] = useState<{ stale: boolean; updatedAt: string } | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);

  const etfPositions = useMemo(
    () => positions.filter(p => p.setor === "ETF" || p.setor === "ETF USA"),
    [positions],
  );

  const directRvPositions = useMemo(
    () => positions.filter(p =>
      !["ETF", "ETF USA", "Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"].includes(p.setor),
    ),
    [positions],
  );

  const totalEtfBRL = etfPositions.reduce((s, p) => s + p.valor, 0);

  useEffect(() => {
    if (!expanded || compositions !== null || etfPositions.length === 0) return;
    setLoadingComp(true);
    fetch(withDataVersion("/api/composicao/resumo"))
      .then(r => r.json())
      .then(d => {
        const lt = d.look_through;
        const comps: Record<string, CompositionData> = lt?.compositions ?? {};
        const srcs: Record<string, string> = lt?.sources ?? {};
        setCompositions(comps);
        setSources(srcs);
        setStaleInfo({ stale: lt?.stale ?? false, updatedAt: lt?.updated_at ?? "" });
      })
      .catch(() => setCompositions({}))
      .finally(() => setLoadingComp(false));
  }, [expanded, compositions, etfPositions.length]);

  const fetchedExtrasRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!compositions || etfPositions.length === 0) return;
    const missing = etfPositions
      .map(p => p.ticker.toUpperCase())
      .filter(t => {
        const found = compositions[t] || compositions[t + ".SA"];
        return !found && !fetchedExtrasRef.current.has(t);
      });
    if (missing.length === 0) return;
    for (const t of missing) fetchedExtrasRef.current.add(t);
    fetch(`/api/composicao/holdings?tickers=${missing.join(",")}`)
      .then(r => r.json())
      .then(d => {
        const extra = d.compositions as Record<string, { components: { ativo: string; name: string; peso: number }[]; source: string }> | undefined;
        if (!extra || Object.keys(extra).length === 0) return;
        setCompositions(prev => {
          const next = { ...prev };
          for (const [tk, data] of Object.entries(extra)) {
            next[tk] = { ticker: tk, valor_brl: 0, components: data.components };
          }
          return next;
        });
        setSources(prev => {
          const next = { ...prev };
          for (const [tk, data] of Object.entries(extra)) {
            next[tk] = data.source;
          }
          return next;
        });
      })
      .catch(() => {});
  }, [compositions, etfPositions]);

  const findComp = useCallback((ticker: string): CompositionData | null => {
    if (!compositions) return null;
    const t = ticker.toUpperCase();
    return compositions[t] ?? compositions[t + ".SA"] ?? compositions[ticker] ?? compositions[ticker + ".SA"] ?? null;
  }, [compositions]);

  const lookThrough = useMemo(() => {
    if (!compositions) return null;

    const perEtf: Record<string, {
      ticker: string; valorBRL: number; hasComp: boolean;
      components: { ativo: string; name: string; peso: number; valorBRL: number }[];
    }> = {};
    const sup: string[] = [];
    const unsup: string[] = [];

    for (const pos of etfPositions) {
      const comp = findComp(pos.ticker);
      if (comp && comp.components.length > 0) {
        sup.push(pos.ticker);
        perEtf[pos.ticker] = {
          ticker: pos.ticker,
          valorBRL: pos.valor,
          hasComp: true,
          components: comp.components.map(c => ({
            ativo: c.ativo,
            name: c.name,
            peso: c.peso,
            valorBRL: pos.valor * c.peso,
          })),
        };
      } else {
        unsup.push(pos.ticker);
        perEtf[pos.ticker] = { ticker: pos.ticker, valorBRL: pos.valor, hasComp: false, components: [] };
      }
    }

    const combined: Record<string, { name: string; valorBRL: number; etfs: string[] }> = {};
    for (const [etfTk, data] of Object.entries(perEtf)) {
      if (!data.hasComp) continue;
      for (const c of data.components) {
        if (!combined[c.ativo]) combined[c.ativo] = { name: c.name, valorBRL: 0, etfs: [] };
        combined[c.ativo].valorBRL += c.valorBRL;
        if (!combined[c.ativo].etfs.includes(etfTk)) combined[c.ativo].etfs.push(etfTk);
      }
    }
    const combinedList = Object.entries(combined)
      .map(([ativo, d]) => ({ ativo, ...d }))
      .sort((a, b) => b.valorBRL - a.valorBRL);
    const combinedTotal = combinedList.reduce((s, c) => s + c.valorBRL, 0);

    const rvMerged: Record<string, { directBRL: number; etfBRL: number; name: string; via: string[] }> = {};
    for (const pos of directRvPositions) {
      rvMerged[pos.ticker] = { directBRL: pos.valor, etfBRL: 0, name: "", via: [] };
    }
    for (const [ativo, d] of Object.entries(combined)) {
      if (rvMerged[ativo]) {
        rvMerged[ativo].etfBRL += d.valorBRL;
        if (d.name && !rvMerged[ativo].name) rvMerged[ativo].name = d.name;
        for (const e of d.etfs) if (!rvMerged[ativo].via.includes(e)) rvMerged[ativo].via.push(e);
      } else {
        rvMerged[ativo] = { directBRL: 0, etfBRL: d.valorBRL, name: d.name, via: [...d.etfs] };
      }
    }
    const rvList = Object.entries(rvMerged)
      .map(([ticker, d]) => ({
        ticker,
        name: d.name,
        valorBRL: d.directBRL + d.etfBRL,
        via: (d.directBRL > 0 ? ["Direta"] : []).concat(d.via).join(", ") || "—",
      }))
      .sort((a, b) => b.valorBRL - a.valorBRL);
    const rvTotal = rvList.reduce((s, c) => s + c.valorBRL, 0);

    const rfPositionsLT = positions
      .filter(p => isRendaFixa(p.setor) && p.valor > 0)
      .map(p => ({ ticker: p.ticker, name: "", valorBRL: p.valor, via: p.setor, macro: "Renda Fixa" as const }));
    const portfolioItems = [
      ...rvList.map(c => ({ ticker: c.ticker, name: c.name, valorBRL: c.valorBRL, via: c.via || "Direto", macro: "Renda Variável" as const })),
      ...rfPositionsLT,
    ].sort((a, b) => b.valorBRL - a.valorBRL);
    const portfolioTotal = portfolioItems.reduce((s, c) => s + c.valorBRL, 0);

    return { perEtf, sup, unsup, combinedList, combinedTotal, rvList, rvTotal, portfolioItems, portfolioTotal };
  }, [compositions, etfPositions, directRvPositions, findComp]);

  if (etfPositions.length === 0) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshWarning(null);
    try {
      const res = await fetch("/api/composicao/etf-refresh", { method: "POST" });
      if (res.ok) {
        const j = await res.json();
        if (!j.saved_to_sheets) {
          setRefreshWarning(j.warning ?? "Holdings atualizados mas não persistidos na planilha.");
        }
        bumpDataVersion();
        const fresh = await fetch(withDataVersion("/api/composicao/resumo"));
        if (fresh.ok) {
          const d = await fresh.json();
          if (d.look_through?.compositions) {
            setCompositions(d.look_through.compositions);
            setSources(d.look_through.sources ?? {});
            setStaleInfo({ stale: d.look_through.stale ?? false, updatedAt: d.look_through.updated_at ?? "" });
          }
        }
      }
    } catch { /* ignore */ }
    setRefreshing(false);
  };

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <Layers size={16} className="text-indigo-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-zinc-300">Composição ETFs — Look-Through</h2>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {etfPositions.length} ETF{etfPositions.length !== 1 ? "s" : ""} · {compactBRL(totalEtfBRL)}
          </p>
        </div>
        <ChevronRight
          size={14}
          className={`text-zinc-600 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          {loadingComp ? (
            <div className="flex items-center gap-2 py-6 justify-center text-zinc-500 text-xs">
              <Loader2 size={14} className="animate-spin text-indigo-400" />
              Carregando composições…
            </div>
          ) : lookThrough && (lookThrough.sup.length > 0 || lookThrough.unsup.length > 0) ? (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {lookThrough.sup.map(etf => (
                    <span key={etf} className="text-[10px] px-2 py-0.5 rounded-md" style={{ backgroundColor: "rgba(99,102,241,0.12)", color: "#818cf8" }}>
                      {etf}
                      {sources[etf] || sources[etf + ".SA"] ? (
                        <span className="text-zinc-600 ml-1">({sources[etf] ?? sources[etf + ".SA"]})</span>
                      ) : null}
                    </span>
                  ))}
                  {lookThrough.unsup.length > 0 && (
                    <span className="text-[10px] text-zinc-600">Sem composição: {lookThrough.unsup.join(", ")}</span>
                  )}
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all"
                  style={{ border: "1px solid rgba(99,102,241,0.2)", color: refreshing ? "#71717a" : "#818cf8" }}
                >
                  <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
                  {refreshing ? "…" : "Atualizar"}
                </button>
              </div>

              {(staleInfo?.stale || refreshWarning) && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[10px]" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                  <span className="shrink-0">⚠</span>
                  <span>
                    {refreshWarning ?? (
                      <>Composições desatualizadas{staleInfo?.updatedAt ? ` (última gravação: ${staleInfo.updatedAt})` : ""} ou de origem embutida — clique em &quot;Atualizar&quot; para buscar holdings atuais.</>
                    )}
                  </span>
                </div>
              )}

              <div className="flex gap-1 bg-zinc-900/60 p-1 rounded-lg w-fit">
                {([["por-etf", "Por ETF"], ["combinada", "Combinada"], ["rv-completa", "RV Completa"], ["portfolio-completo", "Portfólio Completo"]] as const).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${activeTab === id ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === "por-etf" && (
                <div className="space-y-4">
                  {Object.values(lookThrough.perEtf).filter(e => e.hasComp).map(etf => (
                    <div key={etf.ticker}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-zinc-200 text-sm">{etf.ticker}</span>
                        <span className="text-zinc-600 text-xs">{compactBRL(etf.valorBRL)}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Ativo</th>
                              <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Peso</th>
                              <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Valor BRL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {etf.components.slice(0, 30).map(c => (
                              <tr key={c.ativo} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                                <td className="py-1.5 px-2 text-zinc-300 font-medium">
                                  {c.ativo}
                                  {c.name && c.name !== c.ativo && <span className="text-zinc-600 ml-1 text-[10px] hidden sm:inline">{c.name}</span>}
                                </td>
                                <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">{(c.peso * 100).toFixed(2)}%</td>
                                <td className="py-1.5 px-2 text-right text-zinc-400 font-mono">{compactBRL(c.valorBRL)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "combinada" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">#</th>
                        <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Ativo</th>
                        <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Valor</th>
                        <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">%</th>
                        <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Via</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lookThrough.combinedList.slice(0, 30).map((c, i) => (
                        <tr key={c.ativo} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                          <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                          <td className="py-1.5 px-2">
                            <span className="text-zinc-200 font-semibold">{c.ativo}</span>
                            {c.name && c.name !== c.ativo && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                          <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">
                            {lookThrough.combinedTotal > 0 ? ((c.valorBRL / lookThrough.combinedTotal) * 100).toFixed(2) : "0"}%
                          </td>
                          <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{c.etfs.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === "rv-completa" && (
                <>
                  <p className="text-[10px] text-zinc-600">
                    Posições diretas + ETFs expandidos. ETFs sem composição mantidos como linha única.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">#</th>
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Ativo</th>
                          <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Valor</th>
                          <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">%</th>
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Via</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lookThrough.rvList.map((c, i) => (
                          <tr key={c.ticker} className={`border-b border-zinc-900 hover:bg-white/[0.02] ${c.via !== "Direta" && c.via !== "—" ? "opacity-85" : ""}`}>
                            <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                            <td className="py-1.5 px-2">
                              <span className="font-semibold" style={{ color: c.via !== "Direta" && c.via !== "—" ? "#a1a1aa" : "#f4f4f5" }}>{c.ticker}</span>
                              {c.name && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                            </td>
                            <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                            <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">
                              {lookThrough.rvTotal > 0 ? ((c.valorBRL / lookThrough.rvTotal) * 100).toFixed(2) : "0"}%
                            </td>
                            <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{c.via}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {activeTab === "portfolio-completo" && (
                <>
                  <p className="text-[10px] text-zinc-600 mb-3">
                    Tudo ranqueado: RV (ETFs expandidos) + renda fixa + caixa.
                  </p>
                  {lookThrough.portfolioItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">#</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Ativo</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Classe</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Valor</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">%</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Via</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lookThrough.portfolioItems.map((c, i) => {
                            const isRF = c.macro === "Renda Fixa";
                            return (
                              <tr key={`${c.ticker}-${i}`} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                                <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                                <td className="py-1.5 px-2">
                                  <span className="font-semibold text-zinc-100">{c.ticker}</span>
                                  {c.name && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                                </td>
                                <td className="py-1.5 px-2">
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: isRF ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)", color: isRF ? "#10b981" : "#3b82f6" }}>
                                    {isRF ? "RF" : "RV"}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                                <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">
                                  {lookThrough.portfolioTotal > 0 ? ((c.valorBRL / lookThrough.portfolioTotal) * 100).toFixed(2) : "0"}%
                                </td>
                                <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{c.via || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-zinc-800 font-semibold">
                            <td className="py-2 px-2 text-zinc-300" colSpan={3}>Total ({lookThrough.portfolioItems.length})</td>
                            <td className="py-2 px-2 text-right text-zinc-200 font-mono">{compactBRL(lookThrough.portfolioTotal)}</td>
                            <td className="py-2 px-2 text-right text-zinc-500 font-mono">100%</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : <p className="text-zinc-600 text-sm">Nenhuma posição disponível.</p>}
                </>
              )}
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-xs text-zinc-600 mb-3">Nenhuma composição de ETF disponível.</p>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ border: "1px solid rgba(99,102,241,0.3)", color: "#818cf8" }}
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Buscando composições…" : "Buscar Composições ao Vivo"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

