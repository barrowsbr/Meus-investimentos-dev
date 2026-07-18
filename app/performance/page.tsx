"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart2, Activity, Calendar, DollarSign, RefreshCw, BarChart3,
} from "lucide-react";
import CarteiraNaDataDrawer from "@/components/performance/CarteiraNaDataDrawer";
import PerfHero from "@/components/performance/PerfHero";
import { RetornoChart, NavChart } from "@/components/performance/OverviewCharts";
import { ResumoPopup, TwrMwrPopup, MoedaPopup } from "@/components/performance/PerfPopups";
import { SeriesToggle, LegendGroupLabel } from "@/components/performance/LegendControls";
import DrawdownTab from "@/components/performance/DrawdownTab";
import PrevisoesTab from "@/components/performance/PrevisoesTab";
import MonthlyTab from "@/components/performance/MonthlyTab";
import RentabilidadeTab from "@/components/performance/RentabilidadeTab";
import { PRED_API, PRED_METHODS, type PredResult } from "@/components/performance/PredicaoCharts";
import {
  formatDate, formatDateShort, formatDuracao,
  type PerformanceResponse, type DecomposicaoResponse,
  type RentabilidadeItem, type RiscoRetornoItem,
} from "@/components/performance/shared";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { brl, compactBRL } from "@/lib/format";
import { usePortfolio } from "@/lib/hooks";
import { bumpDataVersion, withDataVersion } from "@/lib/data-version";
import { useTheme } from "@/components/terminal/TerminalProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Constants ─────────────────────────────────────────────────────────────────

function computeYTDDays(): number {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - jan1.getTime()) / (1000 * 60 * 60 * 24));
}

const WINDOWS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "YTD", days: computeYTDDays() },
  { label: "1A", days: 365 },
  { label: "3A", days: 1095 },
  { label: "5A", days: 1825 },
  { label: "Início", days: 0 },
];

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "overview" | "drawdown" | "monthly" | "previsoes" | "rentabilidade";
const TAB_LABELS: Record<Tab, string> = {
  overview: "Retorno",
  drawdown: "Drawdown",
  monthly: "Mensal",
  previsoes: "Previsões",
  rentabilidade: "Rentab.",
};

type CurrencyView = "BRL" | "USD";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const { theme } = useTheme();
  const isLight = theme === "creme";
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookback, setLookback] = useState(0);
  const [classe, setClasse] = useState<"tudo" | "rv" | "rf">("tudo");
  const [setores, setSetores] = useState<string[]>([]);
  const setorQuery = setores.join(",");
  const [tickerFilter, setTickerFilter] = useState("");
  const [corretoraFilter, setCorretoraFilter] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showTwr, setShowTwr] = useState(true);
  const [showMwr, setShowMwr] = useState(false);
  const [showCdi, setShowCdi] = useState(true);
  const [showIbov, setShowIbov] = useState(true);
  const [showSp500, setShowSp500] = useState(false);
  const [showFxDecomp, setShowFxDecomp] = useState(false);
  // Carteira nesta data: só arma o clique quando o modo está ativo (senão
  // qualquer clique no gráfico abriria o painel).
  const [carteiraMode, setCarteiraMode] = useState(false);
  const [carteiraDatas, setCarteiraDatas] = useState<string[]>([]);
  // Detalhes da Performance em popup (botões): Resumo, TWR vs MWR, Decomposição.
  const [perfPopup, setPerfPopup] = useState<"resumo" | "twrmwr" | "moeda" | null>(null);
  const pickCarteiraDate = (full: string) => {
    if (!full) return;
    setCarteiraDatas(prev => {
      if (prev.includes(full)) return prev;        // já fixada → ignora
      if (prev.length === 0) return [full];         // 1ª data
      if (prev.length === 1) return [prev[0], full]; // 2ª data → comparar
      return [prev[1], full];                        // já tem 2 → desliza a janela
    });
  };
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [decomp, setDecomp] = useState<DecomposicaoResponse | null>(null);
  const [ganhoCanonical, setGanhoCanonical] = useState<number | null>(null);
  // "Settled" = a busca do ganho canônico (/api/composicao/resumo) já resolveu
  // (com dado ou falha). Enquanto NÃO resolveu, o MTM sem filtro fica em estado
  // de carregamento em vez de mostrar o número da golden source e depois PULAR
  // para o canônico — era o "MTM às vezes muda / às vezes errado".
  const [ganhoCanonicalSettled, setGanhoCanonicalSettled] = useState(false);
  // Patrimônio CANÔNICO — MESMA fonte do Resumo (usePortfolio → /api/cotacoes,
  // cotações ao vivo), para o número bater byte a byte entre as páginas. O
  // snapshot do /api/performance/advanced usa preços da golden source (último
  // fechamento), que diverge intraday. Sem filtros de ativo, o display usa este.
  const { data: canonData } = usePortfolio();
  const patrimonioCanon = useMemo(() => {
    if (!canonData || !(canonData.totalPatrimonioBRL > 0)) return null;
    const alav = canonData.alavancagem;
    return {
      total: canonData.totalPatrimonioBRL,
      net: alav?.netBRL ?? canonData.totalPatrimonioBRL,
      divida: alav?.dividaBRL ?? 0,
      alavancagemPct: alav?.alavancagemPct ?? 0,
      usdbrl: canonData.usdbrl ?? 0,
    };
  }, [canonData]);
  const [currencyView, setCurrencyView] = useState<CurrencyView>("BRL");
  const [monthlyView, setMonthlyView] = useState<"twr" | "mtm">("twr");
  const [predMethod, setPredMethod] = useState(PRED_METHODS[0].id);
  const [predResult, setPredResult] = useState<PredResult>(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predError, setPredError] = useState<string | null>(null);
  const [rentStatusFilter, setRentStatusFilter] = useState<"Todos" | "Ativo" | "Vendido">("Todos");
  const [composicaoRent, setComposicaoRent] = useState<{ rentabilidade: RentabilidadeItem[]; risco_retorno: RiscoRetornoItem[] } | null>(null);

  const isUsd = currencyView === "USD";
  const currSymbol = isUsd ? "US$" : "R$";
  const fmtCurr = isUsd ? (v: number) => `US$ ${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : brl;
  const compactCurr = isUsd ? (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `US$ ${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `US$ ${(v / 1e3).toFixed(1)}k`;
    return `US$ ${v.toFixed(0)}`;
  } : compactBRL;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const useCustom = customMode && customFrom && customTo;
    const rangeQuery = useCustom
      ? `from=${customFrom}&to=${customTo}`
      : `lookback=${lookback}`;
    const tickerQ = tickerFilter ? `&ticker=${encodeURIComponent(tickerFilter)}` : "";
    const corretoraQ = corretoraFilter ? `&corretora=${encodeURIComponent(corretoraFilter)}` : "";
    fetch(withDataVersion(`${API_URL}/api/performance/advanced?${rangeQuery}&classe=${classe}&setor=${encodeURIComponent(setorQuery)}${tickerQ}${corretoraQ}`))
      .then(r => r.json())
      .then(body => {
        if (cancelled) return;
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lookback, classe, setorQuery, tickerFilter, corretoraFilter, customMode, customFrom, customTo]);

  useEffect(() => {
    fetch(withDataVersion(`${API_URL}/api/twr/decomposicao`))
      .then(r => r.json())
      .then(body => setDecomp(body))
      .catch(() => {});
    fetch(withDataVersion(`${API_URL}/api/composicao/resumo`))
      .then(r => r.json())
      .then(body => {
        if (body.resumo && body.rentabilidade) {
          const rent = body.rentabilidade as Array<{ lucro_nao_realizado_brl: number; lucro_realizado_brl: number }>;
          const gains = rent.reduce((s, r) => s + r.lucro_nao_realizado_brl + r.lucro_realizado_brl, 0);
          const proventos = body.resumo.total_proventos ?? 0;
          setGanhoCanonical(gains + proventos);
          setComposicaoRent({
            rentabilidade: body.rentabilidade as RentabilidadeItem[],
            risco_retorno: (body.risco_retorno ?? []) as RiscoRetornoItem[],
          });
        }
      })
      .catch(() => {})
      .finally(() => setGanhoCanonicalSettled(true));
  }, []);

  // Active summary/chart based on currency view
  const activeSummary = useMemo(() => {
    if (!data) return null;
    return isUsd && data.usdView ? data.usdView.summary : data.summary;
  }, [data, isUsd]);

  // ── Ganho econômico / MTM — FONTE ÚNICA, sem pulo ──────────────────────────
  // O headline "MTM" tinha 3 fontes possíveis e trocava conforme qual fetch
  // chegava (golden do /performance/advanced → canônico do /composicao/resumo),
  // então o valor "às vezes aparecia certo, às vezes não, e às vezes mudava".
  // Aqui centralizamos: sem filtro e em BRL, a fonte de verdade é o canônico
  // (bate com o Resumo). Enquanto ele não resolve, `loading:true` (mostra "···"),
  // NUNCA o número da golden que depois pularia. Com filtro/USD, usa o snapshot.
  const geInfo = useMemo((): { value: number; loading: boolean } => {
    const s = activeSummary;
    if (!s) return { value: 0, loading: true };
    const isUnfiltered = lookback === 0 && classe === "tudo" && setores.length === 0
      && !tickerFilter && !corretoraFilter && !customMode;
    if (isUnfiltered && !isUsd) {
      if (ganhoCanonical != null) return { value: ganhoCanonical, loading: false };
      if (!ganhoCanonicalSettled) return { value: 0, loading: true };
      return { value: s.ganhoEconomico, loading: false }; // canônico falhou → golden
    }
    const isAllTime = lookback === 0 && !customMode;
    const useSnapshot = !!tickerFilter && isAllTime && s.resultadoTotal != null;
    return { value: useSnapshot ? s.resultadoTotal! : s.ganhoEconomico, loading: false };
  }, [activeSummary, lookback, classe, setores, tickerFilter, corretoraFilter, customMode, isUsd, ganhoCanonical, ganhoCanonicalSettled]);

  const activeChart = useMemo(() => {
    if (!data) return [];
    return isUsd && data.usdView ? data.usdView.chart : data.chart;
  }, [data, isUsd]);

  const activeMonthly = useMemo(() => {
    if (!data) return [];
    return isUsd && data.usdView ? data.usdView.monthlyReturns : data.monthlyReturns;
  }, [data, isUsd]);

  // Meses com valor TRAVADO (aba twr_mensal) — imutáveis no heatmap all-time.
  const lockedMonthsSet = useMemo(() => {
    const list = isUsd && data?.usdView ? data.usdView.monthlyLocked : data?.monthlyLocked;
    return new Set(list ?? []);
  }, [data, isUsd]);

  const chartData = useMemo(() => {
    return activeChart.map(p => ({
      date: formatDateShort(p.date),
      fullDate: p.date,
      portfolio: +(p.twr * 100).toFixed(2),
      mwr: p.mwr_twr != null ? +(p.mwr_twr * 100).toFixed(2) : null,
      cdi: p.cdi_twr != null ? +(p.cdi_twr * 100).toFixed(2) : null,
      ibov: p.ibov_twr != null ? +(p.ibov_twr * 100).toFixed(2) : null,
      sp500: p.sp500_twr != null ? +(p.sp500_twr * 100).toFixed(2) : null,
      nav: p.nav,
      ret: p.ret != null ? +(p.ret * 100).toFixed(2) : null,
      fx: p.fx_twr != null ? +(p.fx_twr * 100).toFixed(2) : null,
      ativo: p.ativo_twr != null ? +(p.ativo_twr * 100).toFixed(2) : null,
      ativoMwr: p.ativo_mwr != null ? +(p.ativo_mwr * 100).toFixed(2) : null,
    }));
  }, [activeChart]);

  const drawdownData = useMemo(() =>
    (data?.drawdownData ?? []).map(d => ({ date: formatDateShort(d.date), drawdown: d.drawdown })),
  [data]);

  // Volatilidade ROLLING (janela 30 pregões, anualizada √252) sobre os retornos
  // diários do NAV — a régua de "quão nervosa" a carteira anda, par do drawdown.
  const volData = useMemo(() => {
    const pts = data?.drawdownData ?? [];
    if (pts.length < 36) return [] as Array<{ date: string; vol: number }>;
    const rets: number[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1].nav, b = pts[i].nav;
      rets.push(a > 0 ? b / a - 1 : 0);
    }
    const W = 30;
    const out: Array<{ date: string; vol: number }> = [];
    for (let i = W; i <= rets.length; i++) {
      const win = rets.slice(i - W, i);
      const mu = win.reduce((s, v) => s + v, 0) / W;
      const sd = Math.sqrt(win.reduce((s, v) => s + (v - mu) ** 2, 0) / (W - 1));
      out.push({ date: formatDateShort(pts[i].date), vol: +(sd * Math.sqrt(252) * 100).toFixed(2) });
    }
    return out;
  }, [data]);
  const volStats = useMemo(() => {
    if (volData.length === 0) return null;
    const vals = volData.map(v => v.vol);
    return {
      atual: vals[vals.length - 1],
      media: vals.reduce((s, v) => s + v, 0) / vals.length,
      max: Math.max(...vals),
    };
  }, [volData]);

  const filteredRentabilidade = useMemo(() => {
    if (!composicaoRent?.rentabilidade) return [];
    let items = composicaoRent.rentabilidade;
    if (rentStatusFilter !== "Todos") items = items.filter(r => r.status === rentStatusFilter);
    return items;
  }, [composicaoRent, rentStatusFilter]);

  const filteredRiscoRetorno = useMemo(() => {
    if (!composicaoRent?.risco_retorno) return [];
    return composicaoRent.risco_retorno;
  }, [composicaoRent]);

  const runPrediction = async () => {
    setPredLoading(true);
    setPredError(null);
    setPredResult(null);
    try {
      const res = await fetch(`${PRED_API}/api/preditivo/${predMethod}`);
      const json = await res.json();
      if (json.error) setPredError(json.error);
      else setPredResult(json);
    } catch (e) {
      setPredError(e instanceof Error ? e.message : "Erro de conexão");
    } finally {
      setPredLoading(false);
    }
  };

  const monthlyGrid = useMemo(() => {
    if (activeMonthly.length === 0) return { years: [] as number[], byYearMonth: {} as Record<number, Record<number, number>> };
    const byYearMonth: Record<number, Record<number, number>> = {};
    for (const m of activeMonthly) {
      const [y, mo] = m.month.split("-").map(Number);
      if (!byYearMonth[y]) byYearMonth[y] = {};
      byYearMonth[y][mo] = m.return_pct;
    }
    const years = Object.keys(byYearMonth).map(Number).sort((a, b) => a - b);
    return { years, byYearMonth };
  }, [activeMonthly]);

  const activeMTM = useMemo(() => {
    if (!data) return [];
    return isUsd && data.usdView?.monthlyMTM ? data.usdView.monthlyMTM : (data.monthlyMTM ?? []);
  }, [data, isUsd]);

  const mtmGrid = useMemo(() => {
    if (activeMTM.length === 0) return { years: [] as number[], byYearMonth: {} as Record<number, Record<number, { gain: number; gainPct: number; navEnd: number }>> };
    const byYearMonth: Record<number, Record<number, { gain: number; gainPct: number; navEnd: number }>> = {};
    for (const m of activeMTM) {
      const [y, mo] = m.month.split("-").map(Number);
      if (!byYearMonth[y]) byYearMonth[y] = {};
      byYearMonth[y][mo] = { gain: m.gain, gainPct: m.gainPct, navEnd: m.navEnd };
    }
    const years = Object.keys(byYearMonth).map(Number).sort((a, b) => a - b);
    return { years, byYearMonth };
  }, [activeMTM]);

  const handleRefresh = () => {
    setLoading(true);
    setData(null);
    bumpDataVersion();
    fetch(withDataVersion(`${API_URL}/api/performance/advanced?lookback=${lookback}`))
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  if (loading && !data) return <LoadingSpinner />; // só a animação, fundo direto
  if (error) return (<><PageHeader title="Performance" description="" /><ErrorAlert message={error} /></>);
  if (!data || !activeSummary) return null;

  const s = activeSummary;
  const twrPct = s.twrTotal * 100;
  const mwrPct = s.mwr * 100;
  const isPositive = twrPct >= 0;
  const trendColor = isLight
    ? (isPositive ? "var(--pos)" : "var(--neg)")
    : (isPositive ? "#34d399" : "#f87171");

  // Paleta canônica das linhas do gráfico — hex sólido (necessário p/ os
  // swatches da legenda-filtro, que concatenam alpha). Uma cor por série, sem
  // colisões entre as séries exibidas simultaneamente.
  const C = {
    twr:   isLight ? (isPositive ? "#1E7A3C" : "#C03328") : (isPositive ? "#34d399" : "#f87171"),
    mwr:   isLight ? "#5B21B6" : "#a78bfa",
    cdi:   isLight ? "#1E40AF" : "#6366f1",
    ibov:  isLight ? "#9A3412" : "#f59e0b",
    sp500: isLight ? "#9D174D" : "#ec4899",
    ativo: isLight ? "#0369A1" : "#38bdf8",
    ativoMwr: isLight ? "#7C3AED" : "#c4b5fd",
    fx:    isLight ? "#92400E" : "#fbbf24",
  };

  return (
    <div className={`transition-[padding] duration-300 ${carteiraDatas.length === 2 ? "xl:pr-[800px]" : carteiraDatas.length === 1 ? "xl:pr-[480px]" : ""}`}>
      {/* ── Header — hero centrado no tema claro, padrão nos escuros ── */}
      {isLight ? (
        <header className="text-center pt-1 mb-6" style={{ maxWidth: 760, margin: "0 auto" }}>
          <div className="flex items-center gap-4">
            <div className="h-px flex-1" style={{ background: "var(--line-strong)" }} />
            <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".34em", textTransform: "uppercase", color: "var(--muted)" }}>
              Análise de Retorno · GIPS
            </span>
            <div className="h-px flex-1" style={{ background: "var(--line-strong)" }} />
          </div>
          <h1 className="font-mono" style={{ fontSize: "clamp(2.2rem, 10vw, 3.6rem)", fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1, color: "var(--text)", marginTop: 10 }}>
            Performance
          </h1>
          <p className="font-mono" style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)", marginTop: 10 }}>
            {formatDate(s.primeiraData)} → {formatDate(s.ultimaData)} · {formatDuracao(s.duracaoAnos)}
          </p>
          <div style={{ marginTop: 12, borderTop: "3px double var(--line-strong)" }} />
        </header>
      ) : (
        <PageHeader
          title="Performance"
          description={`${formatDate(s.primeiraData)} → ${formatDate(s.ultimaData)} · ${formatDuracao(s.duracaoAnos)} · Metodologia GIPS`}
        />
      )}

      {/* ── Currency View Toggle ── */}
      {isLight ? (
        <div className="flex items-center gap-3 mb-5">
          {(["BRL", "USD"] as CurrencyView[]).map(cv => (
            <button key={cv} onClick={() => setCurrencyView(cv)}
              className="font-mono"
              style={{
                fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
                padding: "6px 12px",
                borderBottom: currencyView === cv ? "2px solid var(--text)" : "2px solid transparent",
                color: currencyView === cv ? "var(--text)" : "var(--faint)",
              }}>
              {cv === "BRL" ? "R$ Real" : "US$ Dólar"}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1 mb-6 bg-zinc-900/60 rounded-xl p-1 w-fit border border-zinc-800/50">
          {(["BRL", "USD"] as CurrencyView[]).map(cv => (
            <button key={cv} onClick={() => setCurrencyView(cv)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                currencyView === cv
                  ? cv === "BRL"
                    ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                    : "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}>
              {cv === "BRL" ? "R$ Real" : "US$ Dólar"}
            </button>
          ))}
          <span className="text-[10px] text-zinc-600 px-2">
            {isUsd ? "Patrimônio em dólar" : "Patrimônio em real"}
          </span>
        </div>
      )}

      {/* ── Filtro por classe / setor / ativo / corretora ── */}
      {(() => {
        const f = data?.summary.filtros;
        if (!f) return null;
        const classes: { id: typeof classe; label: string; show: boolean }[] = [
          { id: "tudo", label: "Tudo", show: true },
          { id: "rv", label: "Renda Variável", show: f.rvSetores.length > 0 },
          { id: "rf", label: "Renda Fixa", show: f.temRF },
        ];
        const ts = f.tickerSectors;
        const filteredTickers = (f.tickers ?? []).filter(t => {
          if (!ts) return true;
          const setor = ts[t];
          if (!setor) return true;
          const isRF = ["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"].includes(setor);
          const isRFPrec = setor === "Renda Fixa USD";
          if (classe === "rf") return isRFPrec;
          if (classe === "rv") {
            if (isRF) return false;
            if (setores.length > 0) return setores.includes(setor);
            return true;
          }
          if (setores.length > 0) return setores.includes(setor);
          return true;
        });
        return (
          <div className="mb-6 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {classes.filter(c => c.show).map(c => (
                <button key={c.id} onClick={() => { setClasse(c.id); setSetores([]); setTickerFilter(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    classe === c.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-zinc-800/50"
                  }`}>
                  {c.label}
                </button>
              ))}
              <span className="text-zinc-700 mx-1">|</span>
              <select
                value={tickerFilter}
                onChange={e => setTickerFilter(e.target.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-all ${
                  tickerFilter
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    : "bg-zinc-900/60 text-zinc-400 border border-zinc-800/50"
                }`}
              >
                <option value="">Todos os ativos</option>
                {filteredTickers.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(f.corretoras ?? []).length > 1 && (
                <>
                  <span className="text-zinc-700 mx-1">|</span>
                  <select
                    value={corretoraFilter}
                    onChange={e => setCorretoraFilter(e.target.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold outline-none transition-all ${
                      corretoraFilter
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                        : "bg-zinc-900/60 text-zinc-400 border border-zinc-800/50"
                    }`}
                  >
                    <option value="">Todas corretoras</option>
                    {f.corretoras.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </>
              )}
            </div>
            {classe === "rv" && !tickerFilter && f.rvSetores.length > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                {["", ...f.rvSetores].map(st => {
                  const active = st === "" ? setores.length === 0 : setores.includes(st);
                  return (
                    <button key={st || "todos"}
                      onClick={() => {
                        if (st === "") { setSetores([]); return; }
                        setSetores(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st]);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] transition-all ${
                        active ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"
                      }`}>
                      {st || "Todos"}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Window selector (period filters) ── */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap">
        {WINDOWS.map(w => (
          <button key={w.label} onClick={() => { setCustomMode(false); setLookback(w.days); }}
            className={isLight ? "font-mono" : `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              !customMode && lookback === w.days
                ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
            }`}
            style={isLight ? {
              padding: "6px 12px",
              fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
              borderBottom: (!customMode && lookback === w.days) ? "2px solid var(--text)" : "2px solid transparent",
              color: (!customMode && lookback === w.days) ? "var(--text)" : "var(--faint)",
            } as React.CSSProperties : undefined}>
            {w.label}
          </button>
        ))}
        <button onClick={() => setCustomMode(v => !v)}
          className={isLight ? "font-mono inline-flex items-center gap-1.5" : `px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border inline-flex items-center gap-1.5 ${
            customMode
              ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
              : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
          }`}
          style={isLight ? {
            padding: "6px 12px",
            fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
            borderBottom: customMode ? "2px solid var(--text)" : "2px solid transparent",
            color: customMode ? "var(--text)" : "var(--faint)",
          } as React.CSSProperties : undefined}>
          <Calendar size={12} /> Personalizado
        </button>
      </div>

      {/* ── Intervalo personalizado ── */}
      {customMode && (
        <div className="flex flex-wrap items-end gap-3 mb-6 p-3 rounded-xl bg-zinc-900/40 border border-zinc-800/50 animate-fade-in">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">De</span>
            <input type="date" value={customFrom} max={customTo || undefined}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Até</span>
            <input type="date" value={customTo} min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500/50" />
          </label>
          {data?.summary.filtros && (
            <span className="text-[10px] text-zinc-600 pb-2">
              {customFrom && customTo
                ? `Intervalo aplicado · ${formatDate(s.primeiraData)} → ${formatDate(s.ultimaData)}`
                : "Escolha as datas de início e fim"}
            </span>
          )}
        </div>
      )}

      {/* ── Hero Performance Command Center ── */}
      <PerfHero
        s={s}
        isLight={isLight}
        isUsd={isUsd}
        twrPct={twrPct}
        mwrPct={mwrPct}
        trendColor={trendColor}
        compactCurr={compactCurr}
        geInfo={geInfo}
        patrimonioCanon={patrimonioCanon}
        lookback={lookback}
        customMode={customMode}
        classe={classe}
        setores={setores}
        tickerFilter={tickerFilter}
        corretoraFilter={corretoraFilter}
      />

      {/* ── Sub-tabs + chart toggles ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex">
          {(Object.keys(TAB_LABELS) as Tab[]).map(tab => {
            const on = activeTab === tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="font-mono uppercase whitespace-nowrap"
                style={{
                  padding: "8px 14px",
                  borderBottom: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  color: on ? "var(--text)" : "var(--muted)",
                  fontSize: 11, fontWeight: 600, letterSpacing: ".05em",
                }}>
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-x-3 gap-y-2 flex-wrap">
          {activeTab === "overview" && (
            <>
              {/* Carteira: TWR / MWR — linhas sólidas (o seu retorno) */}
              <div className="flex items-center gap-1">
                <LegendGroupLabel>Carteira</LegendGroupLabel>
                <SeriesToggle
                  active={showTwr} color={C.twr} label="TWR"
                  title="Time-Weighted Return: encadeia retornos diários neutralizando o tamanho/timing dos aportes. É a métrica comparável a índices (GIPS)."
                  onClick={() => setShowTwr(v => (v && !showMwr) ? true : !v)} />
                <SeriesToggle
                  active={showMwr} color={C.mwr} label="MWR"
                  title="Money-Weighted Return (TIR/XIRR): retorno ponderado pelo dinheiro investido — reflete o timing dos seus aportes."
                  onClick={() => setShowMwr(v => (v && !showTwr) ? true : !v)} />
              </div>

              <span style={{ width: 1, height: 18, background: "var(--line-strong)" }} />

              {/* Comparar: benchmarks individuais — linhas tracejadas */}
              <div className="flex items-center gap-1">
                <LegendGroupLabel>Comparar</LegendGroupLabel>
                <SeriesToggle
                  active={showCdi} color={C.cdi} label="CDI" dashed
                  title="Taxa livre de risco (CDI acumulado no período)."
                  onClick={() => { setShowFxDecomp(false); setShowCdi(v => !v); }} />
                <SeriesToggle
                  active={showIbov} color={C.ibov} label="IBOV" dashed
                  title="Ibovespa acumulado no período."
                  onClick={() => { setShowFxDecomp(false); setShowIbov(v => !v); }} />
                <SeriesToggle
                  active={showSp500} color={C.sp500} label="S&P 500" dashed
                  title="S&P 500 acumulado no período."
                  onClick={() => { setShowFxDecomp(false); setShowSp500(v => !v); }} />
              </div>

              <span style={{ width: 1, height: 18, background: "var(--line-strong)" }} />

              {/* Decompor: modo câmbio (ativo vs moeda) — exclui benchmarks */}
              <SeriesToggle
                active={showFxDecomp} color={C.fx} label="Câmbio" icon={DollarSign}
                title="Decompõe o retorno em efeito do ativo (moeda local) vs efeito do câmbio. Substitui os benchmarks enquanto ativo."
                onClick={() => setShowFxDecomp(v => {
                  const nv = !v;
                  if (nv) { setShowCdi(false); setShowIbov(false); setShowSp500(false); }
                  return nv;
                })} />
            </>
          )}
          <button onClick={handleRefresh} title="Recarregar" className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: RETORNO (overview)
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* TWR chart */}
          <RetornoChart
            s={s}
            isLight={isLight}
            chartData={chartData}
            C={C}
            showTwr={showTwr}
            showMwr={showMwr}
            showCdi={showCdi}
            showIbov={showIbov}
            showSp500={showSp500}
            showFxDecomp={showFxDecomp}
            carteiraMode={carteiraMode}
            setCarteiraMode={setCarteiraMode}
            carteiraDatas={carteiraDatas}
            setCarteiraDatas={setCarteiraDatas}
            pickCarteiraDate={pickCarteiraDate}
          />

          {/* NAV (largura cheia) */}
          <div className="space-y-4">
            <NavChart
              chartData={chartData}
              isLight={isLight}
              currSymbol={currSymbol}
              fmtCurr={fmtCurr}
              compactCurr={compactCurr}
            />

            {perfPopup === "resumo" && (
              <ResumoPopup
                s={s}
                isLight={isLight}
                isUsd={isUsd}
                currSymbol={currSymbol}
                twrPct={twrPct}
                mwrPct={mwrPct}
                trendColor={trendColor}
                compactCurr={compactCurr}
                lookback={lookback}
                customMode={customMode}
                tickerFilter={tickerFilter}
                geInfo={geInfo}
                onClose={() => setPerfPopup(null)}
              />
            )}
          </div>

          {/* Botões — abrem os detalhes em popup */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button onClick={() => setPerfPopup("resumo")} className="glass-card flex items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.05]">
              <BarChart3 size={18} className="shrink-0" style={{ color: "var(--accent)" }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Resumo do Período</p>
                <p className="truncate text-[11px]" style={{ color: "var(--faint)" }}>TWR, MWR, benchmarks, ganho econômico…</p>
              </div>
            </button>
            <button onClick={() => setPerfPopup("twrmwr")} className="glass-card flex items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.05]">
              <Activity size={18} className="shrink-0" style={{ color: "#a78bfa" }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>TWR vs MWR</p>
                <p className="truncate text-[11px]" style={{ color: "var(--faint)" }}>Comparação + decomposição ativo × câmbio</p>
              </div>
            </button>
            {!isUsd && decomp && decomp.buckets.length > 1 && (
              <button onClick={() => setPerfPopup("moeda")} className="glass-card flex items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.05]">
                <BarChart2 size={18} className="shrink-0" style={{ color: "#34d399" }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Decomposição por Moeda</p>
                  <p className="truncate text-[11px]" style={{ color: "var(--faint)" }}>Retorno ativo × câmbio por moeda</p>
                </div>
              </button>
            )}
          </div>

          {/* TWR vs MWR + FX Decomposition (popup) */}
          {perfPopup === "twrmwr" && (
            <TwrMwrPopup
              data={data}
              s={s}
              isUsd={isUsd}
              currSymbol={currSymbol}
              twrPct={twrPct}
              mwrPct={mwrPct}
              onClose={() => setPerfPopup(null)}
            />
          )}

          {/* Currency decomposition (BRL only) — popup */}
          {perfPopup === "moeda" && !isUsd && decomp && decomp.buckets.length > 1 && (
            <MoedaPopup decomp={decomp} onClose={() => setPerfPopup(null)} />
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: DRAWDOWN
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "drawdown" && (
        <DrawdownTab
          s={s}
          isLight={isLight}
          drawdownData={drawdownData}
          volData={volData}
          volStats={volStats}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: PREVISÕES
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "previsoes" && (
        <PrevisoesTab
          predMethod={predMethod}
          setPredMethod={setPredMethod}
          predResult={predResult}
          setPredResult={setPredResult}
          predLoading={predLoading}
          predError={predError}
          setPredError={setPredError}
          runPrediction={runPrediction}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: MONTHLY HEATMAP
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "monthly" && (
        <MonthlyTab
          monthlyView={monthlyView}
          setMonthlyView={setMonthlyView}
          monthlyGrid={monthlyGrid}
          mtmGrid={mtmGrid}
          lockedMonthsSet={lockedMonthsSet}
          monthlyDivergencias={data?.monthlyDivergencias}
          currSymbol={currSymbol}
          fmtCurr={fmtCurr}
          compactCurr={compactCurr}
          isLight={isLight}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
           TAB: RENTABILIDADE
         ══════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "rentabilidade" && (
        <RentabilidadeTab
          rentStatusFilter={rentStatusFilter}
          setRentStatusFilter={setRentStatusFilter}
          filteredRentabilidade={filteredRentabilidade}
          filteredRiscoRetorno={filteredRiscoRetorno}
        />
      )}

      {/* ── Data quality warnings ── */}
      {data.errors.length > 0 && (
        <div className="glass-card p-4 border-l-2 border-yellow-600/40 mt-6">
          <p className="text-xs font-semibold text-yellow-500 mb-1">Avisos de dados</p>
          <ul className="space-y-0.5">
            {data.errors.map((e, i) => (
              <li key={i} className="text-xs text-zinc-400">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Carteira nesta data (drawer) ── */}
      <CarteiraNaDataDrawer
        datas={carteiraDatas}
        classe={classe}
        setor={setorQuery}
        ticker={tickerFilter}
        corretora={corretoraFilter}
        chartPoints={chartData}
        onClose={() => setCarteiraDatas([])}
        onRemoveDate={(d) => setCarteiraDatas(prev => prev.filter(x => x !== d))}
        onAddDate={pickCarteiraDate}
      />
    </div>
  );
}
