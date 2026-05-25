"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
  ComposedChart, Line, Scatter, ScatterChart, ZAxis, Treemap,
  ReferenceLine,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, Landmark, Coins, DollarSign,
  BarChart3, ArrowUpRight, Globe, Home, Award, AlertTriangle,
  Layers, Target, PieChart as PieIcon,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { brl, compactBRL, pct, shortMonth, currency } from "@/lib/format";
import { isRendaVariavel } from "@/lib/sectors";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Performer { ticker: string; lucro_pct: number; setor: string }
interface ParetoItem { ticker: string; setor: string; macro: string; valor_brl: number; pct: number; acumulado_pct: number }
interface RentabilidadeItem { ticker: string; setor: string; macro: string; valor_atual_brl: number; lucro_nao_realizado_brl: number; lucro_realizado_brl: number; retorno_total_pct: number }
interface RiscoRetornoItem { ticker: string; setor: string; macro: string; valor_atual_brl: number; retorno_acumulado: number }
interface LookThroughComp { ativo: string; peso: number }
interface LookThroughETF { ticker: string; valor_brl: number; components: LookThroughComp[] }
interface TreeNode { name: string; value: number; pct: number; children?: TreeNode[] }

interface ComposicaoData {
  computed_at: string;
  fx: { USDBRL: number; EURBRL: number; CADBRL: number; GBPBRL: number };
  resumo: { total_portfolio: number; rv_value: number; rf_value: number; total_proventos: number; top_performer: Performer | null; bottom_performer: Performer | null };
  estrutura_carteira: TreeNode[];
  exposicao_cambial: Record<string, number>;
  custodia: { brasil: number; exterior: number; brasil_pct: number; exterior_pct: number };
  rentabilidade: RentabilidadeItem[];
  risco_retorno: RiscoRetornoItem[];
  pareto: ParetoItem[];
  look_through: { supported: string[]; unsupported: string[]; compositions: Record<string, LookThroughETF>; total_look_through_brl: number };
  errors: string[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MACRO_MAP: Record<string, string> = {
  "Ações Brasil": "Brasil", "FIIs": "Brasil", "BDRs": "Brasil", "ETF": "Brasil",
  "Ações Internacional": "Exterior", "ETF USA": "Exterior",
  "Renda Fixa": "Renda Fixa", "Renda Fixa USD": "Renda Fixa",
  "Commodities": "Commodities", "Cripto": "Cripto",
};

const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#3b82f6", "Ações Internacional": "#8b5cf6", "ETF USA": "#06b6d4",
  "ETF": "#10b981", "FIIs": "#f59e0b", "Cripto": "#f97316",
  "Commodities": "#eab308", "BDRs": "#ec4899", "Renda Fixa": "#6366f1", "Renda Fixa USD": "#a78bfa",
};

const MACRO_COLORS: Record<string, string> = {
  "Brasil": "#3b82f6", "Exterior": "#8b5cf6", "Renda Fixa": "#6366f1",
  "Commodities": "#eab308", "Cripto": "#f97316", "Outros": "#52525b",
};

const CURRENCY_COLORS: Record<string, string> = {
  BRL: "#3b82f6", USD: "#10b981", EUR: "#8b5cf6", GBP: "#f59e0b", CAD: "#ef4444", Cripto: "#f97316",
};

const TOOLTIP_STYLE = {
  background: "#13141A", border: "1px solid #1E2028", borderRadius: 12,
  color: "#fafafa", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const CARD_GRADIENTS = {
  patrimonio: "linear-gradient(135deg, #d4a574 0%, #f5c842 50%, #b8860b 100%)",
  rv: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 55%, #3b82f6 100%)",
  rf: "linear-gradient(135deg, #8b5cf6 0%, #c084fc 55%, #6366f1 100%)",
  proventos: "linear-gradient(135deg, #f59e0b 0%, #fb923c 55%, #f59e0b 100%)",
  dolar: "linear-gradient(135deg, #10b981 0%, #4ade80 55%, #059669 100%)",
  lucroUp: "linear-gradient(135deg, #10b981 0%, #34d399 55%, #059669 100%)",
  lucroDown: "linear-gradient(135deg, #f87171 0%, #ef4444 55%, #dc2626 100%)",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMacro(setor: string): string {
  return MACRO_MAP[setor] || "Outros";
}

function formatComputedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// ── Custom Treemap Content ─────────────────────────────────────────────────────

const TreemapContent = (props: any) => {
  const { depth, x, y, width, height, name, value } = props;
  if (width < 2 || height < 2) return null;
  const color = depth === 1 ? (MACRO_COLORS[name] || "#52525b")
    : depth === 2 ? (SECTOR_COLORS[name] || "#3f3f46")
      : "#1a1a2e";
  const showLabel = width > 35 && height > 22;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height}
        style={{ fill: color, stroke: "#0d0e11", strokeWidth: depth <= 2 ? 2 : 1, opacity: depth === 3 ? 0.75 : 1 }}
      />
      {showLabel && depth <= 2 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - (depth === 1 && height > 40 ? 8 : 0)}
            textAnchor="middle" dominantBaseline="middle"
            style={{ fill: "#f4f4f5", fontSize: depth === 1 ? 12 : 10, fontWeight: depth === 1 ? 700 : 500, pointerEvents: "none" }}
          >
            {name}
          </text>
          {depth === 1 && height > 40 && (
            <text x={x + width / 2} y={y + height / 2 + 10}
              textAnchor="middle" style={{ fill: "rgba(255,255,255,0.45)", fontSize: 9, pointerEvents: "none" }}
            >
              {compactBRL(value)}
            </text>
          )}
        </>
      )}
      {showLabel && depth === 3 && width > 50 && (
        <text x={x + width / 2} y={y + height / 2}
          textAnchor="middle" dominantBaseline="middle"
          style={{ fill: "rgba(255,255,255,0.6)", fontSize: 9, pointerEvents: "none" }}
        >
          {name}
        </text>
      )}
    </g>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResumoPage() {
  const { data, loading: portLoading, error } = usePortfolio();
  const [composicao, setComposicao] = useState<ComposicaoData | null>(null);
  const [compLoading, setCompLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("global");
  const [hoveredNode, setHoveredNode] = useState<{ name: string; value: number; pct: number } | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/composicao/resumo`)
      .then(r => r.json())
      .then(setComposicao)
      .catch(() => { })
      .finally(() => setCompLoading(false));
  }, []);

  const loading = portLoading || compLoading;

  // ── Derived from portfolio hook ──────────────────────────────────────────
  const monthlyDividends = useMemo(() => {
    if (!data?.proventosMensais) return [];
    return Object.entries(data.proventosMensais)
      .sort(([a], [b]) => a.localeCompare(b)).slice(-12)
      .map(([month, total]) => ({ month: shortMonth(month), total }));
  }, [data]);

  const avgMonthlyDividend = useMemo(() =>
    monthlyDividends.length === 0 ? 0
      : monthlyDividends.reduce((s, m) => s + m.total, 0) / monthlyDividends.length,
    [monthlyDividends]);

  const sectorData = useMemo(() =>
    Object.entries(data?.setorAlocacao ?? {}).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value),
    [data]);

  const currencyData = useMemo(() =>
    Object.entries(data?.exposicaoCambial ?? {}).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value),
    [data]);

  const evolutionData = useMemo(() =>
    (data?.lbHistoric ?? []).slice(-24).map(p => ({ data: shortMonth(p.data), patrimonio: p.patrimonio, rv: p.rv, rf: p.rf })),
    [data]);

  // ── Derived from composicao API ───────────────────────────────────────────
  const macros = useMemo(() => {
    if (!composicao?.estrutura_carteira) return [];
    return composicao.estrutura_carteira.map(m => m.name);
  }, [composicao]);

  const filteredPareto = useMemo(() => {
    if (!composicao?.pareto) return [];
    if (activeFilter === "global") return composicao.pareto.slice(0, 20);
    return composicao.pareto.filter(p => p.macro === activeFilter).slice(0, 20);
  }, [composicao, activeFilter]);

  const filteredRentabilidade = useMemo(() => {
    if (!composicao?.rentabilidade) return [];
    const items = activeFilter === "global"
      ? composicao.rentabilidade
      : composicao.rentabilidade.filter(r => r.macro === activeFilter);
    return items.slice(0, 15);
  }, [composicao, activeFilter]);

  const filteredRiscoRetorno = useMemo(() => {
    if (!composicao?.risco_retorno) return [];
    if (activeFilter === "global") return composicao.risco_retorno;
    return composicao.risco_retorno.filter(r => r.macro === activeFilter);
  }, [composicao, activeFilter]);

  const filteredExposicao = useMemo(() => {
    if (!composicao) return currencyData;
    if (activeFilter === "global") {
      return Object.entries(composicao.exposicao_cambial).map(([name, value]) => ({ name, value }));
    }
    return currencyData;
  }, [composicao, activeFilter, currencyData]);

  const currencyTotal = useMemo(() =>
    filteredExposicao.reduce((s, c) => s + c.value, 0),
    [filteredExposicao]);

  const treemapData = useMemo(() => {
    if (!composicao?.estrutura_carteira?.length) return [];
    return composicao.estrutura_carteira;
  }, [composicao]);

  const sunburstData = useMemo(() => {
    if (!composicao?.estrutura_carteira?.length) return null;

    const totalPortfolio = composicao.resumo.total_portfolio;

    const level1: any[] = [];
    const level2: any[] = [];
    const level3: any[] = [];

    const sectorStyles: Record<string, { h: number; s: number; l: number }> = {
      "Ações Internacional": { h: 260, s: 65, l: 45 },
      "ETF USA": { h: 235, s: 60, l: 50 },
      "ETF": { h: 215, s: 65, l: 52 },
      "Ações Brasil": { h: 330, s: 75, l: 48 },
      "FIIs": { h: 25, s: 80, l: 50 },
      "BDRs": { h: 295, s: 65, l: 45 },
      "Cripto": { h: 42, s: 85, l: 52 },
      "Commodities": { h: 80, s: 55, l: 48 },
      "Renda Fixa": { h: 170, s: 70, l: 38 },
      "Renda Fixa USD": { h: 220, s: 75, l: 45 },
      "Caixa": { h: 210, s: 15, l: 48 },
      "Tesouro Direto": { h: 150, s: 65, l: 42 },
    };

    let rvValueSum = 0;
    let rfValueSum = 0;

    const checkIsRendaFixa = (sector: string) => {
      return sector === "Renda Fixa" || sector === "Renda Fixa USD" || sector === "Caixa" || sector === "Tesouro Direto";
    };

    composicao.estrutura_carteira.forEach((macroNode: any) => {
      macroNode.children.forEach((sectorNode: any) => {
        const isRF = checkIsRendaFixa(sectorNode.name);
        if (isRF) {
          rfValueSum += sectorNode.value;
        } else {
          rvValueSum += sectorNode.value;
        }
      });
    });

    if (rvValueSum > 0) {
      level1.push({
        name: "Renda Variável",
        value: rvValueSum,
        pct: (rvValueSum / totalPortfolio) * 100,
        color: "rgba(109, 40, 217, 0.9)",
        glow: "#8b5cf6",
      });
    }
    if (rfValueSum > 0) {
      level1.push({
        name: "Renda Fixa",
        value: rfValueSum,
        pct: (rfValueSum / totalPortfolio) * 100,
        color: "rgba(13, 148, 136, 0.9)",
        glow: "#10b981",
      });
    }

    const processGroup = (isRFGroup: boolean) => {
      composicao.estrutura_carteira.forEach((macroNode: any) => {
        macroNode.children.forEach((sectorNode: any) => {
          const isRF = checkIsRendaFixa(sectorNode.name);
          if (isRF !== isRFGroup) return;

          const baseColor = sectorStyles[sectorNode.name] || { h: 200, s: 40, l: 50 };
          const sectorColor = `hsl(${baseColor.h}, ${baseColor.s}%, ${baseColor.l}%)`;

          level2.push({
            name: sectorNode.name,
            value: sectorNode.value,
            pct: sectorNode.pct,
            parentName: isRFGroup ? "Renda Fixa" : "Renda Variável",
            color: sectorColor,
          });

          if (sectorNode.children && sectorNode.children.length > 0) {
            sectorNode.children.forEach((assetNode: any, idx: number) => {
              const totalChildren = sectorNode.children.length;
              const lightnessShift = totalChildren > 1
                ? ((idx - (totalChildren - 1) / 2) * (15 / totalChildren))
                : 0;
              const assetColor = `hsl(${baseColor.h}, ${baseColor.s}%, ${Math.min(90, Math.max(25, baseColor.l + lightnessShift))}%)`;

              level3.push({
                name: assetNode.name,
                value: assetNode.value,
                pct: assetNode.pct,
                parentName: sectorNode.name,
                color: assetColor,
              });
            });
          }
        });
      });
    };

    processGroup(false);
    processGroup(true);

    return { level1, level2, level3 };
  }, [composicao]);

  const nestedOuter = useMemo(() => {
    if (!sunburstData) return [];
    if (!selectedClass) return sunburstData.level2;
    return sunburstData.level2.filter((s: any) => s.parentName === selectedClass);
  }, [sunburstData, selectedClass]);

  if (loading) return <LoadingSpinner />;
  if (error && !data) return <ErrorAlert message={error} />;
  if (!data) return <ErrorAlert message="Dados não disponíveis" />;

  const rvPositions = data.positions.filter(p => isRendaVariavel(p.setor));
  const lucroPctStr = pct(data.lucroPct);
  const pmVsSpot = data.cambio?.pmDolar ? (data.usdbrl / data.cambio.pmDolar - 1) * 100 : 0;

  const top = composicao?.resumo.top_performer;
  const bot = composicao?.resumo.bottom_performer;

  return (
    <>
      <PageHeader
        title="Resumo"
        description={composicao?.computed_at ? `Atualizado às ${formatComputedAt(composicao.computed_at)}` : "Visão geral dos seus investimentos"}
      />

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-8">
        <div className="animate-fade-in">
          <MetricCard label="Patrimônio Total" value={compactBRL(data.totalPatrimonioBRL)}
            sub={`RV ${compactBRL(data.rvPatrimonioBRL)} + RF ${compactBRL(data.rfPatrimonioBRL)}`}
            icon={<Wallet size={17} strokeWidth={1.6} />} glowColor="#d4a574" borderGradient={CARD_GRADIENTS.patrimonio} />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard label="Renda Variável" value={compactBRL(data.rvPatrimonioBRL)}
            sub={`${rvPositions.length} ativos`}
            icon={<BarChart3 size={17} strokeWidth={1.6} />} glowColor="#3b82f6" borderGradient={CARD_GRADIENTS.rv} />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard label="Renda Fixa" value={compactBRL(data.rfPatrimonioBRL)}
            icon={<Landmark size={17} strokeWidth={1.6} />} glowColor="#8b5cf6" borderGradient={CARD_GRADIENTS.rf} />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard label="Lucro RV" value={brl(data.lucroBRL)}
            sub={`${lucroPctStr} | Ativo ${compactBRL(data.ganhoAtivoTotalBRL)} | Câmbio ${compactBRL(data.ganhoCambioTotalBRL)}`}
            icon={data.lucroBRL >= 0 ? <TrendingUp size={17} strokeWidth={1.6} /> : <TrendingDown size={17} strokeWidth={1.6} />}
            trend={data.lucroBRL >= 0 ? "up" : "down"}
            glowColor={data.lucroBRL >= 0 ? "#10b981" : "#f87171"}
            borderGradient={data.lucroBRL >= 0 ? CARD_GRADIENTS.lucroUp : CARD_GRADIENTS.lucroDown} />
        </div>
        <div className="animate-fade-in animate-delay-4">
          <MetricCard label="Proventos" value={compactBRL(data.totalProventosBRL)}
            icon={<Coins size={17} strokeWidth={1.6} />} glowColor="#f59e0b" borderGradient={CARD_GRADIENTS.proventos} />
        </div>
        <div className="animate-fade-in animate-delay-5">
          <MetricCard label="Dólar" value={`R$ ${data.usdbrl.toFixed(2)}`}
            sub={`PM R$ ${data.cambio?.pmDolar?.toFixed(2) ?? "—"} (${pmVsSpot >= 0 ? "+" : ""}${pmVsSpot.toFixed(1)}%) · EUR ${data.eurbrl.toFixed(2)}`}
            icon={<DollarSign size={17} strokeWidth={1.6} />}
            trend={pmVsSpot >= 0 ? "up" : "down"} glowColor="#10b981" borderGradient={CARD_GRADIENTS.dolar} />
        </div>
      </div>

      {/* ── Top / Bottom Performer (se disponível) ── */}
      {(top || bot) && (
        <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-in">
          {top && (
            <div className="glass-card p-4 flex items-center gap-4">
              <span className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)" }}>
                <Award size={18} className="text-emerald-400" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-0.5">Top Performer</p>
                <p className="font-bold text-zinc-100">{top.ticker} <span className="text-emerald-400 font-semibold">+{top.lucro_pct.toFixed(1)}%</span></p>
                <p className="text-[10px] text-zinc-600">{top.setor}</p>
              </div>
            </div>
          )}
          {bot && (
            <div className="glass-card p-4 flex items-center gap-4">
              <span className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(248,113,113,0.12)" }}>
                <AlertTriangle size={18} className="text-red-400" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-0.5">Bottom Performer</p>
                <p className="font-bold text-zinc-100">{bot.ticker} <span className="text-red-400 font-semibold">{bot.lucro_pct.toFixed(1)}%</span></p>
                <p className="text-[10px] text-zinc-600">{bot.setor}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Evolução + Setor ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {evolutionData.length > 0 ? (
          <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
            <h2 className="section-title mb-4"><ArrowUpRight size={15} />Evolução Patrimonial</h2>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={evolutionData}>
                <defs>
                  <linearGradient id="gradRV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
                <XAxis dataKey="data" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [brl(v), name === "rv" ? "Renda Variável" : "Renda Fixa"]} />
                <Area type="monotone" dataKey="rv" stroke="#3b82f6" fill="url(#gradRV)" strokeWidth={1.8} name="rv" />
                <Area type="monotone" dataKey="rf" stroke="#8b5cf6" fill="url(#gradRF)" strokeWidth={1.8} name="rf" />
                <Legend formatter={v => v === "rv" ? "Renda Variável" : "Renda Fixa"} wrapperStyle={{ fontSize: 11, color: "#71717a" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
            <h2 className="section-title mb-4"><Coins size={15} />Proventos Mensais</h2>
            {monthlyDividends.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyDividends} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
                  <Bar dataKey="total" fill="#d4a574" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-zinc-600 text-sm">Sem dados de proventos.</p>}
          </div>
        )}
        <div className="glass-card p-5 animate-fade-in flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <h2 className="section-title"><Globe size={15} />Alocação por Classe</h2>
            {selectedClass && (
              <button
                onClick={() => setSelectedClass(null)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ← Tudo
              </button>
            )}
          </div>
          <p className="text-[10px] text-zinc-600 mb-2">
            {selectedClass
              ? `Setores de ${selectedClass}`
              : "Clique no anel interno para detalhar"}
          </p>

          {sunburstData && sunburstData.level1.length > 0 ? (
            <>
              <div className="relative">
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    {/* Inner ring — RV vs RF */}
                    <Pie
                      data={sunburstData.level1}
                      cx="50%" cy="50%"
                      innerRadius={38} outerRadius={68}
                      dataKey="value"
                      stroke="none"
                      paddingAngle={3}
                      onClick={(d: any) =>
                        setSelectedClass(prev => prev === d.name ? null : d.name)
                      }
                      style={{ cursor: "pointer" }}
                    >
                      {sunburstData.level1.map((entry: any) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          opacity={selectedClass && selectedClass !== entry.name ? 0.22 : 1}
                        />
                      ))}
                    </Pie>

                    {/* Outer ring — sectors */}
                    <Pie
                      data={nestedOuter}
                      cx="50%" cy="50%"
                      innerRadius={73} outerRadius={98}
                      dataKey="value"
                      stroke="none"
                      paddingAngle={1}
                    >
                      {nestedOuter.map((entry: any, i: number) => (
                        <Cell key={`${entry.name}-${i}`} fill={entry.color} opacity={0.82} />
                      ))}
                    </Pie>

                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as {
                          name: string; value: number; pct: number;
                        };
                        return (
                          <div style={TOOLTIP_STYLE} className="px-3 py-2 rounded-xl">
                            <p className="font-semibold text-zinc-200 text-xs">{d.name}</p>
                            <p className="text-zinc-400 text-[11px]">{d.pct?.toFixed(1)}%</p>
                            <p className="text-zinc-300 text-[11px]">{compactBRL(d.value)}</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    {selectedClass ? (
                      <>
                        <p className="text-[11px] font-bold text-zinc-200 leading-tight">
                          {selectedClass === "Renda Variável" ? "RV" : "RF"}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          {sunburstData.level1
                            .find((d: any) => d.name === selectedClass)
                            ?.pct.toFixed(0)}%
                        </p>
                      </>
                    ) : (
                      <p className="text-[9px] text-zinc-700 max-w-[52px] text-center leading-tight">
                        toque p/ detalhar
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-1 mt-1">
                {(selectedClass ? nestedOuter : sunburstData.level1).map((s: any) => (
                  <span
                    key={s.name}
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-medium transition-opacity"
                    style={{
                      backgroundColor: `${s.color}20`,
                      color: s.color,
                      border: `1px solid ${s.color}30`,
                    }}
                  >
                    {s.name.replace("Renda ", "")} {s.pct.toFixed(0)}%
                  </span>
                ))}
              </div>
            </>
          ) : sectorData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" stroke="none" paddingAngle={1}>
                    {sectorData.map(entry => <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] || "#71717a"} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {sectorData.map(s => (
                  <span key={s.name} className="tag" style={{ backgroundColor: `${SECTOR_COLORS[s.name] || "#71717a"}18`, color: SECTOR_COLORS[s.name] || "#71717a" }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>
      </div>

      {/* ── Proventos + Exposição Cambial ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {evolutionData.length > 0 && (
          <div className="glass-card p-5 lg:col-span-2 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title"><Coins size={15} />Proventos Mensais</h2>
              {avgMonthlyDividend > 0 && (
                <span className="text-[10px] px-2.5 py-1 rounded-full font-medium border"
                  style={{ background: "rgba(212,165,116,0.08)", color: "#d4a574", borderColor: "rgba(212,165,116,0.22)" }}>
                  Média: {compactBRL(avgMonthlyDividend)}/mês
                </span>
              )}
            </div>
            {monthlyDividends.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyDividends} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [brl(v), "Total"]} />
                  <Bar dataKey="total" fill="#d4a574" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
          </div>
        )}
        <div className={`glass-card p-5 animate-fade-in ${evolutionData.length === 0 ? "lg:col-span-3" : ""}`}>
          <h2 className="section-title mb-4"><DollarSign size={15} />Exposição Cambial</h2>
          {filteredExposicao.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={filteredExposicao} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" stroke="none" paddingAngle={1}>
                    {filteredExposicao.map(entry => <Cell key={entry.name} fill={CURRENCY_COLORS[entry.name] || "#71717a"} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {filteredExposicao.map(c => {
                  const pctVal = currencyTotal > 0 ? ((c.value / currencyTotal) * 100).toFixed(1) : "0";
                  const color = CURRENCY_COLORS[c.name] || "#71717a";
                  return (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
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
          ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
        </div>
      </div>

      {/* ── Custódia (Brasil vs Exterior) ── */}
      {composicao?.custodia && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <h2 className="section-title mb-4"><Home size={15} />Custódia</h2>
          <div className="grid grid-cols-2 gap-6">
            {[
              { label: "Brasil", value: composicao.custodia.brasil, pct: composicao.custodia.brasil_pct, color: "#3b82f6" },
              { label: "Exterior", value: composicao.custodia.exterior, pct: composicao.custodia.exterior_pct, color: "#8b5cf6" },
            ].map(c => (
              <div key={c.label}>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-sm font-semibold text-zinc-300">{c.label}</span>
                  <span className="text-xs text-zinc-500 font-mono">{c.pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-2">
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                </div>
                <span className="text-lg font-bold" style={{ color: c.color }}>{compactBRL(c.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Estrutura da Carteira (Treemap) ── */}
      {treemapData.length > 0 && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <h2 className="section-title mb-4"><Layers size={15} />Estrutura da Carteira</h2>
          <ResponsiveContainer width="100%" height={320}>
            <Treemap
              data={treemapData}
              dataKey="value"
              aspectRatio={4 / 3}
              stroke="#0d0e11"
              content={<TreemapContent />}
            >
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [compactBRL(v), name]}
              />
            </Treemap>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-4">
            {treemapData.map(m => (
              <span key={m.name} className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: `${MACRO_COLORS[m.name] || "#52525b"}18`, color: MACRO_COLORS[m.name] || "#71717a", border: `1px solid ${MACRO_COLORS[m.name] || "#52525b"}30` }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: MACRO_COLORS[m.name] || "#71717a" }} />
                {m.name} {m.pct.toFixed(1)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Filtro por Macro ── */}
      {composicao && macros.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6 animate-fade-in">
          {["global", ...macros].map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${activeFilter === f
                  ? "border-transparent text-zinc-900"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                }`}
              style={activeFilter === f ? {
                background: f === "global" ? "#d4a574" : (MACRO_COLORS[f] || "#d4a574"),
              } : undefined}
            >
              {f === "global" ? "Global" : f}
            </button>
          ))}
        </div>
      )}

      {/* ── Rentabilidade por Ativo ── */}
      {filteredRentabilidade.length > 0 && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <h2 className="section-title mb-4"><Target size={15} />Rentabilidade por Ativo</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, filteredRentabilidade.length * 32)}>
            <BarChart layout="vertical" data={filteredRentabilidade} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v.toFixed(0)}%`} />
              <YAxis type="category" dataKey="ticker" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [
                  `${v.toFixed(2)}%`,
                  name === "lucro_nao_realizado_brl" ? "Não realizado" : name === "lucro_realizado_brl" ? "Realizado" : "Retorno",
                ]} />
              <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} />
              <Bar dataKey="retorno_total_pct" radius={[0, 4, 4, 0]} maxBarSize={20}>
                {filteredRentabilidade.map((entry, i) => (
                  <Cell key={i} fill={entry.retorno_total_pct >= 0 ? "#10b981" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-zinc-700 mt-2">* Inclui P&L não realizado + lucro de vendas anteriores (em BRL)</p>
        </div>
      )}

      {/* ── Risco x Retorno ── */}
      {filteredRiscoRetorno.length > 0 && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <h2 className="section-title mb-4"><PieIcon size={15} />Risco x Retorno</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
              <XAxis dataKey="retorno_acumulado" name="Retorno" unit="%" type="number"
                tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                label={{ value: "Retorno Acumulado (%)", position: "insideBottom", offset: -5, fill: "#52525b", fontSize: 10 }} />
              <YAxis dataKey="valor_atual_brl" name="Valor" type="number"
                tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => compactBRL(v)} />
              <ZAxis dataKey="valor_atual_brl" range={[40, 600]} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as RiscoRetornoItem;
                  return (
                    <div style={TOOLTIP_STYLE} className="px-3 py-2 rounded-xl">
                      <p className="font-bold text-zinc-200">{d.ticker}</p>
                      <p className="text-zinc-400 text-[11px]">{d.setor}</p>
                      <p className="text-zinc-300 text-xs mt-1">{compactBRL(d.valor_atual_brl)}</p>
                      <p className={`text-xs font-semibold ${d.retorno_acumulado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {d.retorno_acumulado >= 0 ? "+" : ""}{d.retorno_acumulado.toFixed(2)}%
                      </p>
                    </div>
                  );
                }} />
              <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} strokeDasharray="4 4" />
              <Scatter
                data={filteredRiscoRetorno}
                fill="#8b5cf6"
              >
                {filteredRiscoRetorno.map((entry, i) => (
                  <Cell key={i} fill={SECTOR_COLORS[entry.setor] || "#8b5cf6"} fillOpacity={0.85} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[...new Set(filteredRiscoRetorno.map(r => r.setor))].map(s => (
              <span key={s} className="tag" style={{ backgroundColor: `${SECTOR_COLORS[s] || "#71717a"}18`, color: SECTOR_COLORS[s] || "#71717a" }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Pareto Global ── */}
      {filteredPareto.length > 0 && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <h2 className="section-title mb-4"><BarChart3 size={15} />Pareto — Concentração do Portfólio</h2>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={filteredPareto} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
              <XAxis dataKey="ticker" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                interval={0} angle={-35} textAnchor="end" height={50} />
              <YAxis yAxisId="left" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => compactBRL(v)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string) => [
                  name === "valor_brl" ? compactBRL(v) : `${v.toFixed(1)}%`,
                  name === "valor_brl" ? "Valor" : "Acumulado",
                ]} />
              <Bar yAxisId="left" dataKey="valor_brl" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {filteredPareto.map((entry, i) => (
                  <Cell key={i} fill={SECTOR_COLORS[entry.setor] || "#3b82f6"} fillOpacity={0.85} />
                ))}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="acumulado_pct" stroke="#d4a574" strokeWidth={2}
                dot={{ fill: "#d4a574", r: 3 }} name="acumulado_pct" />
            </ComposedChart>
          </ResponsiveContainer>
          {composicao?.pareto && composicao.pareto.length > 0 && (
            <p className="text-[10px] text-zinc-600 mt-2">
              Top {Math.min(filteredPareto.length, 10)} ativos representam{" "}
              <span className="text-zinc-400 font-semibold">
                {filteredPareto[Math.min(9, filteredPareto.length - 1)]?.acumulado_pct.toFixed(1)}%
              </span>{" "}
              do portfólio
            </p>
          )}
        </div>
      )}

      {/* ── Câmbio Summary ── */}
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

      {/* ── Look-through ETFs ── */}
      {composicao?.look_through && composicao.look_through.supported.length > 0 && (
        <div className="glass-card p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title"><Layers size={15} />Look-through de ETFs</h2>
            <span className="text-[10px] text-zinc-500">{compactBRL(composicao.look_through.total_look_through_brl)} sujeito a look-through</span>
          </div>
          <div className="space-y-4">
            {Object.values(composicao.look_through.compositions).map(etf => (
              <div key={etf.ticker}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-zinc-200 text-sm">{etf.ticker}</span>
                  <span className="text-zinc-600 text-xs">{compactBRL(etf.valor_brl)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Ativo</th>
                        <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Peso</th>
                        <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Valor BRL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {etf.components.map(c => (
                        <tr key={c.ativo} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                          <td className="py-1.5 px-2 text-zinc-300 font-medium">{c.ativo}</td>
                          <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">{(c.peso * 100).toFixed(2)}%</td>
                          <td className="py-1.5 px-2 text-right text-zinc-400">{compactBRL(etf.valor_brl * c.peso)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          {composicao.look_through.unsupported.length > 0 && (
            <p className="text-[10px] text-zinc-600 mt-3">
              Sem composição: {composicao.look_through.unsupported.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* ── Posições RV ── */}
      <div className="glass-card p-5 animate-fade-in">
        <h2 className="section-title mb-4">Posições — Renda Variável</h2>
        {rvPositions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "#1E2028" }}>
                  {["Ativo", "Setor", "Qtd", "Preço", "Valor", "Lucro", "%"].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 1 ? "text-right" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rvPositions.map((p, i) => {
                  const cor = (p.valorAtual !== null ? (p.valorAtual - p.custoTotal) : (p.lucroBRL ?? 0)) >= 0 ? "text-positive" : "text-negative";
                  const lucroNaMoeda = p.valorAtual !== null ? p.valorAtual - p.custoTotal : null;
                  return (
                    <tr key={p.ticker} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
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
                        {p.precoAtual !== null ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{p.valorAtual !== null ? currency(p.valorAtual, p.moeda) : "—"}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${cor}`}>{lucroNaMoeda !== null ? currency(lucroNaMoeda, p.moeda) : "—"}</td>
                      <td className={`px-3 py-2.5 text-right font-semibold ${cor}`}>{p.lucroPct !== null ? pct(p.lucroPct) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-zinc-600 text-sm">Nenhuma posição.</p>}
      </div>
    </>
  );
}
