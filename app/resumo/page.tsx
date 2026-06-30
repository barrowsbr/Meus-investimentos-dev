"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
  ComposedChart, Line,
  ReferenceLine, Treemap,
} from "recharts";
import SunburstChart from "@/components/SunburstChart";
import {
  TrendingUp, TrendingDown, DollarSign,
  BarChart3, Globe,
  Award, AlertTriangle,
  PieChart as PieIcon,
  Briefcase, Layers,
  Building2, Loader2,
  Calendar, Search, ChevronDown, ChevronRight, Eye,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { withDataVersion } from "@/lib/data-version";
import { brl, compactBRL, pct, shortMonth, currency } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { identificarSetor, isRendaFixa, isRendaVariavel } from "@/lib/sectors";
import { SETOR_ECONOMICO_COLORS } from "@/lib/gics-sectors";
import type { CountryAllocation } from "@/lib/ticker-country";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Performer { ticker: string; lucro_pct: number; setor: string }
interface ParetoItem { ticker: string; setor: string; macro: string; valor_brl: number; pct: number; acumulado_pct: number }
interface RentabilidadeItem { ticker: string; setor: string; macro: string; moeda: string; status: string; valor_atual_brl: number; custo_brl: number; lucro_nao_realizado_brl: number; lucro_realizado_brl: number; proventos_brl: number; resultado_total_brl: number; imposto_brl: number; retorno_nao_realizado_pct: number; retorno_realizado_proventos_pct: number; retorno_total_pct: number }
interface RiscoRetornoItem { ticker: string; setor: string; macro: string; valor_atual_brl: number; retorno_acumulado: number }
interface LookThroughComp { ativo: string; name?: string; peso: number }
interface LookThroughETF { ticker: string; valor_brl: number; components: LookThroughComp[] }
interface TreeNode { name: string; value: number; pct: number; children?: TreeNode[] }
interface RfPosicao { ticker: string; setor: string; macro: string; valor_brl: number; moeda: string; corretora: string; pais: string; is_caixa: boolean }

interface SetorPosition { ticker: string; nome: string; setor: string; setorEconomico: string; industry: string; valorBRL: number; custoTotalBRL: number; lucroBRL: number; lucroPct: number; retornoTotalPct: number; moeda: string; tipo: string }
interface SetorAgg { setor: string; valorBRL: number; pct: number; posicoes: SetorPosition[] }
interface SetoresApiData { totalBRL: number; rvBRL: number; rfBRL: number; sectors: SetorAgg[]; positions: SetorPosition[]; lookthrough?: { supported: string[]; unsupported: string[]; sources: Record<string, string> } }

interface ComposicaoData {
  computed_at: string;
  fx: { USDBRL: number; EURBRL: number; CADBRL: number; GBPBRL: number };
  resumo: { total_portfolio: number; rv_value: number; rf_value: number; total_proventos: number; lucro_total_brl: number; top_performer: Performer | null; bottom_performer: Performer | null };
  estrutura_carteira: TreeNode[];
  exposicao_cambial: Record<string, number>;
  custodia: { brasil: number; exterior: number; brasil_pct: number; exterior_pct: number };
  rentabilidade: RentabilidadeItem[];
  risco_retorno: RiscoRetornoItem[];
  pareto: ParetoItem[];
  look_through: { supported: string[]; unsupported: string[]; compositions: Record<string, LookThroughETF>; total_look_through_brl: number; sources?: Record<string, string>; updated_at?: string };
  country_allocation?: CountryAllocation[];
  rf_posicoes?: RfPosicao[];
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
  "Ações Brasil": "#db2777", "Ações Internacional": "#8b5cf6", "Ações EUA": "#8b5cf6", "Ações Mundo": "#a78bfa",
  "ETF USA": "#06b6d4", "ETFs": "#6366f1", "ETF": "#6366f1",
  "FIIs": "#f97316", "Cripto": "#eab308",
  "Commodities": "#84cc16", "BDRs": "#a855f7", "Renda Fixa": "#0f766e", "Renda Fixa USD": "#1d4ed8",
  "Tesouro Direto": "#10b981", "CDBs": "#0ea5e9", "LCI/LCA": "#06b6d4", "Debêntures": "#3b82f6", "Caixa": "#64748b",
};

const CURRENCY_COLORS: Record<string, string> = {
  BRL: "#3b82f6", USD: "#10b981", "USD (RF)": "#1d4ed8", EUR: "#8b5cf6", GBP: "#f59e0b", CAD: "#ef4444", Cripto: "#f97316",
};

const TOOLTIP_STYLE = {
  background: "#13141A", border: "1px solid #1E2028", borderRadius: 12,
  color: "var(--text)", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const SECTOR_FALLBACK = "#64748b";
function sectorEconColor(name: string): string { return SETOR_ECONOMICO_COLORS[name] ?? SECTOR_FALLBACK; }

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "alocacao" | "setores" | "custodia" | "posicoes";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "alocacao", label: "Alocação", icon: <PieIcon size={14} /> },
  { id: "setores", label: "Setores", icon: <PieIcon size={14} /> },
  { id: "custodia", label: "Corretoras", icon: <Building2 size={14} /> },
  { id: "posicoes", label: "Posições", icon: <Briefcase size={14} /> },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatComputedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResumoPage() {
  const { data, loading: portLoading, error } = usePortfolio();
  const [composicao, setComposicao] = useState<ComposicaoData | null>(null);
  const [compLoading, setCompLoading] = useState(true);
  // Motor canônico de RF manual (mesma fonte da página /renda-fixa) — usado na DRE.
  const [rfData, setRfData] = useState<{ lucroNaoRealizado: number; lucroRealizado: number; totalInvestidoAberto: number } | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("global");
  // Lente do bloco de Renda Variável: "natureza" (não realizado/realizado) ou
  // "fator" (ativo ex-câmbio / efeito câmbio). Ambas somam o mesmo ganho de RV.
  const [rvLens, setRvLens] = useState<"natureza" | "fator">("natureza");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("alocacao");

  // ── Setores ──
  const [setoresData, setSetoresData] = useState<SetoresApiData | null>(null);
  const [setoresLtData, setSetoresLtData] = useState<SetoresApiData | null>(null);
  const [setoresLoading, setSetoresLoading] = useState(false);
  const [setoresLtLoading, setSetoresLtLoading] = useState(false);
  const [sectorConsolidated, setSectorConsolidated] = useState(false);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  // ── Posições Históricas ──
  const [histDate, setHistDate] = useState("");
  const [histLoading, setHistLoading] = useState(false);
  const [histData, setHistData] = useState<{
    date: string;
    priceDate: string | null;
    fxRate: number | null;
    rendaVariavel: { ticker: string; quantidade: number; custoMedio: number; moeda: string; precoHistorico: number | null; valorHistorico: number | null }[];
    rendaFixa: { ticker: string; tipo: string; valorInvestido: number; moeda: string }[];
    resumo: { totalRV_BRL: number; totalRF_BRL: number; totalBRL: number };
  } | null>(null);
  const [histError, setHistError] = useState<string | null>(null);

  const fetchHistorico = useCallback(async (date: string) => {
    if (!date) return;
    setHistLoading(true);
    setHistError(null);
    setHistData(null);
    try {
      const res = await fetch(`${API_URL}/api/portfolio/historico?date=${date}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao buscar posições");
      setHistData(json);
    } catch (e) {
      setHistError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(withDataVersion(`${API_URL}/api/composicao/resumo`))
      .then(r => r.json())
      .then(setComposicao)
      .catch(() => {})
      .finally(() => setCompLoading(false));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/renda-fixa/posicoes`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) setRfData(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "setores" && !setoresData && !setoresLoading) {
      setSetoresLoading(true);
      fetch(`${API_URL}/api/portfolio/sectors`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(d => { if (!d.error) setSetoresData(d); })
        .catch(() => {})
        .finally(() => setSetoresLoading(false));
    }
  }, [activeTab, setoresData, setoresLoading]);

  useEffect(() => {
    if (!sectorConsolidated || setoresLtData) return;
    setSetoresLtLoading(true);
    fetch(`${API_URL}/api/portfolio/sectors?lookthrough=true`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (!d.error) setSetoresLtData(d); })
      .catch(() => {})
      .finally(() => setSetoresLtLoading(false));
  }, [sectorConsolidated, setoresLtData]);

  useEffect(() => {
    if (activeFilter === "Renda Variável" || activeFilter === "Renda Fixa") {
      setSelectedClass(activeFilter);
      setSelectedSector(null);
    } else if (activeFilter === "global") {
      setSelectedClass(null);
      setSelectedSector(null);
    }
  }, [activeFilter]);

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

  const RF_SECTORS_SET = useMemo(() => new Set(["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez", "Caixa", "Tesouro Direto", "CDBs", "LCI/LCA", "Debêntures"]), []);

  // Setores: bolsa (meus_ativos) + RF manual (Tesouro/CDB/caixa de fixa_aberta),
  // que vivem só em rf_posicoes. Sem isso, a RF some e as % inflam.
  const sectorData = useMemo(() => {
    const map: Record<string, number> = { ...(data?.setorAlocacao ?? {}) };
    for (const r of (composicao?.rf_posicoes ?? [])) {
      map[r.setor] = (map[r.setor] ?? 0) + r.valor_brl;
    }
    const raw = Object.entries(map).map(([name, value]) => ({ name, value }));
    if (activeFilter === "Renda Variável") return raw.filter(s => !RF_SECTORS_SET.has(s.name)).sort((a, b) => b.value - a.value);
    if (activeFilter === "Renda Fixa") return raw.filter(s => RF_SECTORS_SET.has(s.name)).sort((a, b) => b.value - a.value);
    return raw.sort((a, b) => b.value - a.value);
  }, [data, composicao, activeFilter, RF_SECTORS_SET]);

  // Exposição cambial pela MESMA base completa (bolsa por moeda + RF manual por
  // moeda), respeitando o filtro — assim bate com o Setores e com o patrimônio.
  const currencyData = useMemo(() => {
    // Renda fixa em dólar (SHV/BIL na bolsa + RF manual em USD) ganha fatia
    // própria "USD (RF)", separada do dólar de ações.
    const moedaKey = (moeda: string, setor: string) => {
      if (setor === "Cripto") return "Cripto";
      if (moeda === "USD" && !isRendaVariavel(setor)) return "USD (RF)";
      return moeda;
    };
    const map: Record<string, number> = {};
    for (const p of (data?.positions ?? [])) {
      if (p.valorAtualBRL < 1) continue;
      if (activeFilter === "Renda Variável" && !isRendaVariavel(p.setor)) continue;
      if (activeFilter === "Renda Fixa" && isRendaVariavel(p.setor)) continue;
      const key = moedaKey(p.moeda, p.setor);
      map[key] = (map[key] ?? 0) + p.valorAtualBRL;
    }
    if (activeFilter !== "Renda Variável") {
      for (const r of (composicao?.rf_posicoes ?? [])) {
        const key = r.moeda === "USD" ? "USD (RF)" : r.moeda;
        map[key] = (map[key] ?? 0) + r.valor_brl;
      }
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data, composicao, activeFilter]);

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

  // Custódia: junta posições da bolsa (meus_ativos) + RF manual/caixa (fixa_aberta).
  const custodiaPositions = useMemo(() => {
    const fromBolsa = (data?.positions ?? [])
      .filter(p => p.valorAtualBRL > 0)
      .map(p => ({
        ticker: p.ticker, setor: p.setor, valorAtualBRL: p.valorAtualBRL,
        quantidade: p.quantidade, moeda: p.moeda, corretora: p.corretora,
        macro: isRendaVariavel(p.setor) ? "Renda Variável" : "Renda Fixa",
      }));
    const fromRF = (composicao?.rf_posicoes ?? []).map(r => ({
      ticker: r.ticker, setor: r.setor, valorAtualBRL: r.valor_brl,
      quantidade: 1, moeda: r.moeda, corretora: r.corretora, macro: "Renda Fixa",
    }));
    return [...fromBolsa, ...fromRF];
  }, [data, composicao]);

  const custodiaTotal = useMemo(() =>
    custodiaPositions.reduce((s, p) => s + p.valorAtualBRL, 0),
    [custodiaPositions]);

  const filteredExposicao = currencyData;

  const currencyTotal = useMemo(() =>
    filteredExposicao.reduce((s, c) => s + c.value, 0),
    [filteredExposicao]);

  const sunburstData = useMemo(() => {
    const sectorStyles: Record<string, { h: number; s: number; l: number }> = {
      "Ações EUA": { h: 260, s: 65, l: 48 },
      "Ações Mundo": { h: 280, s: 55, l: 52 },
      "Ações Internacional": { h: 260, s: 65, l: 48 },
      "ETFs": { h: 240, s: 60, l: 52 },
      "ETF USA": { h: 240, s: 60, l: 52 },
      "ETF": { h: 240, s: 65, l: 55 },
      "Ações Brasil": { h: 330, s: 75, l: 48 },
      "FIIs": { h: 25, s: 85, l: 52 },
      "BDRs": { h: 295, s: 65, l: 48 },
      "Cripto": { h: 42, s: 88, l: 52 },
      "Commodities": { h: 75, s: 60, l: 48 },
      "Renda Fixa": { h: 170, s: 70, l: 38 },
      "Renda Fixa USD": { h: 220, s: 70, l: 48 },
      "Tesouro Direto": { h: 160, s: 72, l: 42 },
      "CDBs": { h: 200, s: 68, l: 50 },
      "LCI/LCA": { h: 185, s: 70, l: 46 },
      "Debêntures": { h: 220, s: 65, l: 52 },
      "Caixa": { h: 210, s: 15, l: 48 },
    };

    const RF_SECTORS = new Set(["Renda Fixa", "Renda Fixa USD", "Caixa", "Tesouro Direto", "CDBs", "LCI/LCA", "Debêntures"]);
    const checkIsRendaFixa = (sector: string) => RF_SECTORS.has(sector);

    if (composicao?.estrutura_carteira?.length) {
      const totalPortfolio = composicao.resumo.total_portfolio;
      const level1: any[] = [];
      const level2: any[] = [];
      const level3: any[] = [];

      let rvValueSum = 0;
      let rfValueSum = 0;

      composicao.estrutura_carteira.forEach((macroNode: any) => {
        macroNode.children.forEach((sectorNode: any) => {
          if (checkIsRendaFixa(sectorNode.name)) rfValueSum += sectorNode.value;
          else rvValueSum += sectorNode.value;
        });
      });

      if (rvValueSum > 0) {
        level1.push({ name: "Renda Variável", value: rvValueSum, pct: (rvValueSum / totalPortfolio) * 100, color: "rgba(109, 40, 217, 0.9)", glow: "#8b5cf6" });
      }
      if (rfValueSum > 0) {
        level1.push({ name: "Renda Fixa", value: rfValueSum, pct: (rfValueSum / totalPortfolio) * 100, color: "rgba(13, 148, 136, 0.9)", glow: "#10b981" });
      }

      const processGroup = (isRFGroup: boolean) => {
        composicao.estrutura_carteira.forEach((macroNode: any) => {
          macroNode.children.forEach((sectorNode: any) => {
            if (checkIsRendaFixa(sectorNode.name) !== isRFGroup) return;
            const baseColor = sectorStyles[sectorNode.name] || { h: 200, s: 40, l: 50 };
            const sectorColor = `hsl(${baseColor.h}, ${baseColor.s}%, ${baseColor.l}%)`;
            level2.push({ name: sectorNode.name, value: sectorNode.value, pct: sectorNode.pct, parentName: isRFGroup ? "Renda Fixa" : "Renda Variável", color: sectorColor });
            if (sectorNode.children?.length) {
              sectorNode.children.forEach((assetNode: any, idx: number) => {
                const n = sectorNode.children.length;
                const shift = n > 1 ? ((idx - (n - 1) / 2) * (15 / n)) : 0;
                level3.push({ name: assetNode.name, value: assetNode.value, pct: assetNode.pct, parentName: sectorNode.name, color: `hsl(${baseColor.h}, ${baseColor.s}%, ${Math.min(90, Math.max(25, baseColor.l + shift))}%)` });
              });
            }
          });
        });
      };
      processGroup(false);
      processGroup(true);
      return { level1, level2, level3 };
    }

    if (!data?.positions?.length) return null;

    const positions = data.positions.filter(p => p.valorAtualBRL > 1);
    const totalPortfolio = data.totalPatrimonioBRL || positions.reduce((s, p) => s + p.valorAtualBRL, 0);
    if (totalPortfolio <= 0) return null;

    const level1: any[] = [];
    const level2: any[] = [];
    const level3: any[] = [];

    const sectors: Record<string, { value: number; isRF: boolean; assets: { name: string; value: number }[] }> = {};
    for (const p of positions) {
      const setor = p.setor;
      if (!sectors[setor]) sectors[setor] = { value: 0, isRF: checkIsRendaFixa(setor), assets: [] };
      sectors[setor].value += p.valorAtualBRL;
      sectors[setor].assets.push({ name: p.ticker, value: p.valorAtualBRL });
    }

    let rvSum = 0;
    let rfSum = 0;
    for (const s of Object.values(sectors)) {
      if (s.isRF) rfSum += s.value;
      else rvSum += s.value;
    }

    const rfExtra = (data.rfPatrimonioBRL ?? 0) - rfSum;
    if (rfExtra > 1) {
      if (!sectors["Renda Fixa"]) sectors["Renda Fixa"] = { value: 0, isRF: true, assets: [] };
      sectors["Renda Fixa"].value += rfExtra;
      sectors["Renda Fixa"].assets.push({ name: "RF Manual", value: rfExtra });
      rfSum += rfExtra;
    }

    if (rvSum > 0) level1.push({ name: "Renda Variável", value: rvSum, pct: (rvSum / totalPortfolio) * 100, color: "rgba(109, 40, 217, 0.9)", glow: "#8b5cf6" });
    if (rfSum > 0) level1.push({ name: "Renda Fixa", value: rfSum, pct: (rfSum / totalPortfolio) * 100, color: "rgba(13, 148, 136, 0.9)", glow: "#10b981" });

    const sortedSectors = Object.entries(sectors).sort((a, b) => b[1].value - a[1].value);
    for (const [false_, true_] of [[false, "Renda Variável"], [true, "Renda Fixa"]] as [boolean, string][]) {
      for (const [name, sec] of sortedSectors) {
        if (sec.isRF !== false_) continue;
        const baseColor = sectorStyles[name] || { h: 200, s: 40, l: 50 };
        level2.push({ name, value: sec.value, pct: (sec.value / totalPortfolio) * 100, parentName: true_, color: `hsl(${baseColor.h}, ${baseColor.s}%, ${baseColor.l}%)` });
        sec.assets.sort((a, b) => b.value - a.value).forEach((a, idx) => {
          const n = sec.assets.length;
          const shift = n > 1 ? ((idx - (n - 1) / 2) * (15 / n)) : 0;
          level3.push({ name: a.name, value: a.value, pct: (a.value / totalPortfolio) * 100, parentName: name, color: `hsl(${baseColor.h}, ${baseColor.s}%, ${Math.min(90, Math.max(25, baseColor.l + shift))}%)` });
        });
      }
    }

    return level1.length > 0 ? { level1, level2, level3 } : null;
  }, [composicao, data]);

  const nestedMiddle = useMemo(() => {
    if (!sunburstData) return [];
    if (!selectedClass) return sunburstData.level2;
    return sunburstData.level2.filter((s: any) => s.parentName === selectedClass);
  }, [sunburstData, selectedClass]);

  const nestedOuter = useMemo(() => {
    if (!sunburstData) return [];
    if (selectedSector) return sunburstData.level3.filter((a: any) => a.parentName === selectedSector);
    if (selectedClass) {
      const classSectorNames = new Set(
        sunburstData.level2.filter((s: any) => s.parentName === selectedClass).map((s: any) => s.name)
      );
      return sunburstData.level3.filter((a: any) => classSectorNames.has(a.parentName));
    }
    return sunburstData.level3;
  }, [sunburstData, selectedClass, selectedSector]);

  const activeSetoresData = sectorConsolidated && setoresLtData ? setoresLtData : setoresData;

  const sectorTreemapData = useMemo(() => {
    if (!activeSetoresData) return [];
    return activeSetoresData.sectors.map(s => ({
      name: s.setor, value: s.valorBRL, pctVal: s.pct, fill: sectorEconColor(s.setor),
    }));
  }, [activeSetoresData]);

  const sectorIndustryBreakdown = useMemo(() => {
    if (!activeSetoresData) return [];
    const map = new Map<string, { industry: string; setor: string; valorBRL: number; count: number }>();
    for (const p of activeSetoresData.positions) {
      if (!p.industry) continue;
      const key = `${p.setorEconomico}|${p.industry}`;
      const existing = map.get(key);
      if (existing) { existing.valorBRL += p.valorBRL; existing.count++; }
      else map.set(key, { industry: p.industry, setor: p.setorEconomico, valorBRL: p.valorBRL, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.valorBRL - a.valorBRL);
  }, [activeSetoresData]);

  if (loading) return <LoadingSpinner />;
  if (error && !data) return <ErrorAlert message={error} />;
  if (!data) return <ErrorAlert message="Dados não disponíveis" />;

  const rvPositions = data.positions.filter(p => isRendaVariavel(p.setor));
  const totalInvestidoRV = rvPositions.reduce((s, p) => s + p.custoTotalBRL, 0);

  const filteredPositions = activeFilter === "Renda Fixa"
    ? data.positions.filter(p => !isRendaVariavel(p.setor))
    : activeFilter === "Renda Variável"
      ? rvPositions
      : data.positions.filter(p => p.valorAtualBRL > 1);

  // RF manual (Tesouro/NTN/CDB/caixa) vive só em fixa_aberta — nunca em
  // meus_ativos. Entram nas Posições quando o filtro é global ou Renda Fixa.
  const posicoesRFManual = (() => {
    if (activeFilter === "Renda Variável") return [];
    const rent = composicao?.rentabilidade ?? [];
    const norm = (t: string) => t.trim().toUpperCase().replace(/\s+/g, " ");
    const rentMap = new Map(
      rent.filter(r => r.macro === "Renda Fixa" && r.status === "Ativo").map(r => [norm(r.ticker), r])
    );
    return (composicao?.rf_posicoes ?? [])
      .map(r => {
        const m = rentMap.get(norm(r.ticker));
        return {
          ticker: r.ticker, setor: r.setor, moeda: r.moeda, valorBRL: r.valor_brl,
          proventosBRL: m?.proventos_brl ?? 0,
          retornoPct: m && m.custo_brl > 0 ? m.retorno_total_pct : null,
          nrPct: m && m.custo_brl > 0 ? m.retorno_nao_realizado_pct : null,
        };
      })
      .sort((a, b) => b.valorBRL - a.valorBRL);
  })();

  const dayChange = data.dayChangeTotalBRL ?? 0;
  const dayChangePct = data.dayChangeTotalPct ?? 0;

  const top = composicao?.resumo.top_performer;
  const bot = composicao?.resumo.bottom_performer;

  return (
    <>
      <PageHeader
        title="Resumo"
        description={composicao?.computed_at ? `Atualizado ${formatComputedAt(composicao.computed_at)}` : "Visão geral dos seus investimentos"}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
           DRE — Demonstrativo de Resultados
         ═══════════════════════════════════════════════════════════════════════ */}
      {(() => {
        // ── DRE 100% CANÔNICA (ver CANONICO.md) ──
        // RV ← snapshot (lib/portfolio.ts). RF ← motor canônico de RF
        // (/api/renda-fixa/posicoes, idem página /renda-fixa) + RF-como-posições do
        // snapshot. Proventos/decomposição/exposição/patrimônio ← snapshot.
        const patrimonioAtual = data.totalPatrimonioBRL;
        const rvPatrimonio = data.rvPatrimonioBRL;
        const rfPatrimonio = data.rfPatrimonioBRL;
        // Lista de posições ENCERRADAS (vendidas) — dado de listagem do route; o
        // snapshot não rastreia posições já zeradas. Não é cálculo canônico duplicado.
        const rent = composicao?.rentabilidade ?? [];

        // RV — snapshot
        const rvNaoReal = data.lucroBRL;                                       // valorização (preço+câmbio)
        // Realizado RV CANÔNICO = posições ABERTAS + ENCERRADAS (100% vendidas).
        // Bug anterior: somava só `data.positions` (abertas), perdendo o lucro
        // realizado das posições já zeradas (que vivem em `closedPositions`) —
        // o que podia jogar o realizado pra negativo. Usa o campo canônico do
        // snapshot, com fallback robusto a abertas+encerradas (cache antigo).
        const rvClosed = (data.closedPositions ?? []).filter(p => isRendaVariavel(p.setor));
        const rvReal = data.realizadoRVBRL || (
          rvPositions.reduce((s, p) => s + (p.lucroRealizadoBRL ?? 0), 0)
          + rvClosed.reduce((s, p) => s + (p.lucroRealizadoBRL ?? 0), 0)
        );
        const rvGanho = rvNaoReal + rvReal;

        // RF — motor canônico de RF (manual) + RF-como-posições (snapshot: SHV/BIL...)
        const rfPositions = data.positions.filter(p => isRendaFixa(p.setor));
        const rfPosNaoReal = rfPositions.reduce((s, p) => s + (p.lucroBRL ?? 0), 0);
        const rfPosReal = rfPositions.reduce((s, p) => s + (p.lucroRealizadoBRL ?? 0), 0);
        const rfPosInvestido = rfPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
        const rfNaoReal = (rfData?.lucroNaoRealizado ?? 0) + rfPosNaoReal;
        const rfReal = (rfData?.lucroRealizado ?? 0) + rfPosReal;
        const rfGanho = rfNaoReal + rfReal;

        // Proventos — snapshot (split RV/RF por classificação)
        const proventosTotal = data.totalProventosBRL;
        let proventosRV = 0, proventosRF = 0;
        for (const [ticker, val] of Object.entries(data.proventosPorTicker ?? {})) {
          if (isRendaFixa(identificarSetor(ticker))) proventosRF += val;
          else proventosRV += val;
        }

        // Decomposição de 3 fatores (puro + principal + cruzado = lucro RV não realizado).
        // "Efeito cambial" agrupa Principal + Cruzado, então a linha "Retorno do ativo"
        // tem de ser o ganho PURO (sem cruzado) — senão o cruzado é contado 2x.
        const fxPrincipal = data.ganhoFXPrincipalTotalBRL ?? 0;
        const fxCruzado = data.ganhoCruzadoTotalBRL ?? 0;
        const ganhoCambio = fxPrincipal + fxCruzado;
        const ganhoAtivo = (data.ganhoAtivoPuroTotalBRL ?? 0) || (rvNaoReal - ganhoCambio);

        // Lente "por fator" do RV: junta o realizado (decomposto, câmbio da venda)
        // ao não realizado. ativoLente + cambioLente = rvGanho (reconcilia com a
        // lente "por natureza": não realizado + realizado).
        const realizadoAtivoRV = data.realizadoAtivoRVBRL ?? 0;
        const realizadoCambioRV = data.realizadoCambioRVBRL ?? 0;
        const ativoLente = ganhoAtivo + realizadoAtivoRV;
        const cambioLente = ganhoCambio + realizadoCambioRV;

        // Resultado total
        const resultadoTotal = rvGanho + rfGanho + proventosTotal;

        // Investido — snapshot (RV, FIFO) + motor de RF (manual) + RF-posições
        const investidoRV = totalInvestidoRV;
        const investidoRF = (rfData?.totalInvestidoAberto ?? 0) + rfPosInvestido;

        const fmt = (v: number) => v >= 0 ? `+${compactBRL(v)}` : compactBRL(v);
        const clr = (v: number) => v >= 0 ? "text-emerald-400" : "text-red-400";
        const clrSub = (v: number) => v >= 0 ? "text-emerald-400/70" : "text-red-400/70";

        const dayChg = data.dayChangeTotalBRL ?? 0;
        const dayPct = data.dayChangeTotalPct ?? 0;

        // ── Métricas macro derivadas (sem matemática nova — só agrega campos do snapshot) ──
        const investidoTotal = investidoRV + investidoRF;
        const retornoAcumPct = investidoTotal > 0 ? (resultadoTotal / investidoTotal) * 100 : 0;
        // Alocação (% do patrimônio)
        const rvPct = patrimonioAtual > 0 ? (rvPatrimonio / patrimonioAtual) * 100 : 0;
        const rfPct = patrimonioAtual > 0 ? (rfPatrimonio / patrimonioAtual) * 100 : 0;
        // Exposição cambial = valor em moeda estrangeira ÷ PATRIMÔNIO TOTAL.
        // exposicaoCambial (snapshot) já inclui posições + RF manual + caixa (fixa_aberta),
        // inclusive caixa em dólar. Divide-se pelo patrimônio total (que inclui o caixa
        // em real) para o % refletir toda a carteira.
        const expo = data.exposicaoCambial ?? {};
        const totalExpo = Object.values(expo).reduce((s, v) => s + v, 0);
        const brlExpo = expo["BRL"] ?? 0;
        const foreignExpoBRL = totalExpo - brlExpo;
        const foreignPct = patrimonioAtual > 0 ? (foreignExpoBRL / patrimonioAtual) * 100 : 0;
        // Yield de proventos anualizado (carrego) sobre o patrimônio
        const yieldAnualPct = patrimonioAtual > 0 ? ((avgMonthlyDividend * 12) / patrimonioAtual) * 100 : 0;
        // Proventos brutos = líquidos + IR retido (para a leitura de DRE)
        const irProventos = data.totalImpostoProventosBRL ?? 0;
        const proventosBrutos = proventosTotal + irProventos;

        return (
          <div className="glass-card p-4 sm:p-5 mb-3 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Demonstrativo de Resultado</h2>
              <span className="text-[10px] text-zinc-600">{composicao?.computed_at ? formatComputedAt(composicao.computed_at) : ""}</span>
            </div>

            {/* ── 1. Patrimônio (AUM) & Alocação ── */}
            {/* Net = bruto − dívida de margin: o "Net liq" da corretora, o dinheiro que é meu. */}
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-bold text-zinc-100">Patrimônio Atual{data.alavancagem.dividaBRL > 0 ? " (Net)" : ""}</span>
              <span className="text-xl font-extrabold text-zinc-100">{compactBRL(data.alavancagem.netBRL)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] mb-3">
              {data.alavancagem.dividaBRL > 0 ? (
                <span className="text-zinc-600">
                  Bruto {compactBRL(patrimonioAtual)} · <span className="text-red-400/80">Margin −{compactBRL(data.alavancagem.dividaBRL)}</span> · <span className="text-amber-400/80">{data.alavancagem.alavancagemPct.toFixed(1)}% alavancado</span>
                </span>
              ) : <span />}
              <span className={dayChg >= 0 ? "text-emerald-400/80" : "text-red-400/80"}>
                Hoje {fmt(dayChg)} ({pct(dayPct)})
              </span>
            </div>

            {/* Barra de alocação RV / RF */}
            <div className="h-2 w-full rounded-full overflow-hidden flex mb-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div style={{ width: `${rvPct}%`, background: "#3b82f6" }} />
              <div style={{ width: `${rfPct}%`, background: "#2dd4bf" }} />
            </div>
            <div className="flex items-center justify-between text-[10px] mb-4">
              <span className="text-blue-400">RV {rvPct.toFixed(0)}% · {compactBRL(rvPatrimonio)}</span>
              <span className="text-zinc-600">🌐 {foreignPct.toFixed(0)}% câmbio</span>
              <span className="text-teal-400">RF {rfPct.toFixed(0)}% · {compactBRL(rfPatrimonio)}</span>
            </div>

            <div className="h-px bg-zinc-800/60 mb-3" />

            {/* ── Investido ── */}
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] font-semibold text-zinc-400">Total Investido</span>
              <span className="text-sm font-bold text-zinc-300">{compactBRL(investidoRV + investidoRF)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-3">
              <span>RV {compactBRL(investidoRV)}</span>
              <span>RF {compactBRL(investidoRF)}</span>
            </div>

            <div className="h-px bg-zinc-800/60 mb-3" />

            {/* ── 2. Resultado Acumulado (por fonte) ── */}
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Resultado Acumulado</span>
              <div className="flex items-baseline gap-2">
                <span className={`text-[11px] font-semibold ${clr(resultadoTotal)}`}>{pct(retornoAcumPct)}</span>
                <span className={`text-base font-bold ${clr(resultadoTotal)}`}>{fmt(resultadoTotal)}</span>
              </div>
            </div>

            {/* Renda Variável — ganho de capital, com duas lentes (natureza / fator) */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-blue-400">Renda Variável</span>
                  <div className="flex rounded-md overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                    {(["natureza", "fator"] as const).map((l) => (
                      <button
                        key={l}
                        onClick={() => setRvLens(l)}
                        className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide transition-colors ${rvLens === l ? "bg-blue-500/20 text-blue-300" : "text-zinc-600 hover:text-zinc-400"}`}
                      >
                        {l === "natureza" ? "Natureza" : "Fator"}
                      </button>
                    ))}
                  </div>
                </div>
                <span className={`text-[12px] font-bold ${clr(rvGanho)}`}>{fmt(rvGanho)}</span>
              </div>
              <div className="pl-3 space-y-0.5">
                {rvLens === "natureza" ? (
                  <>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Não realizado</span>
                      <span className={clrSub(rvNaoReal)}>{fmt(rvNaoReal)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Realizado <span className="text-zinc-700">(vendas)</span></span>
                      <span className={clrSub(rvReal)}>{fmt(rvReal)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Ativo <span className="text-zinc-700">(ex-câmbio)</span></span>
                      <span className={clrSub(ativoLente)}>{fmt(ativoLente)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Efeito câmbio</span>
                      <span className={clrSub(cambioLente)}>{fmt(cambioLente)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Renda Fixa */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-teal-400">Renda Fixa</span>
                <span className={`text-[12px] font-bold ${clr(rfGanho)}`}>{fmt(rfGanho)}</span>
              </div>
              <div className="pl-3 space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Não realizado</span>
                  <span className={clrSub(rfNaoReal)}>{fmt(rfNaoReal)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Realizado</span>
                  <span className={clrSub(rfReal)}>{fmt(rfReal)}</span>
                </div>
              </div>
            </div>

            {/* Proventos (carrego) — líquidos de IR */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-amber-400">Proventos (líq.)</span>
                <span className="text-[12px] font-bold text-amber-400">{fmt(proventosTotal)}</span>
              </div>
              <div className="pl-3 space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Dividendos / JCP (RV)</span>
                  <span className="text-amber-400/70">{compactBRL(proventosRV)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Rendimentos (RF)</span>
                  <span className="text-amber-400/70">{compactBRL(proventosRF)}</span>
                </div>
                {irProventos > 0.01 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-zinc-600">Bruto {compactBRL(proventosBrutos)} · IR retido</span>
                    <span className="text-red-400/70">−{compactBRL(irProventos)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-zinc-800/60 mb-3" />

            {/* ── Decomposição Cambial ── */}
            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Decomposição de Fatores</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Retorno do ativo (preço)</span>
                  <span className={`font-semibold ${clr(ganhoAtivo)}`}>{fmt(ganhoAtivo)}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400">Efeito cambial (FX)</span>
                  <span className={`font-semibold ${clr(ganhoCambio)}`}>{fmt(ganhoCambio)}</span>
                </div>
                {(fxPrincipal !== 0 || fxCruzado !== 0) && (
                  <div className="pl-3 space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Principal (USD/BRL)</span>
                      <span className={clrSub(fxPrincipal)}>{fmt(fxPrincipal)}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-zinc-500">Cruzado (ativo × FX)</span>
                      <span className={clrSub(fxCruzado)}>{fmt(fxCruzado)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-zinc-800/60 mb-3" />

            {/* ── 3. Indicadores-chave (macro) ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Retorno acum.</p>
                <p className={`text-sm font-bold ${clr(resultadoTotal)}`}>{pct(retornoAcumPct)}</p>
                <p className="text-[9px] text-zinc-600">lucro ÷ investido</p>
              </div>
              <div>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Yield proventos</p>
                <p className="text-sm font-bold text-amber-400">{yieldAnualPct.toFixed(1)}% a.a.</p>
                <p className="text-[9px] text-zinc-600">{compactBRL(avgMonthlyDividend)}/mês</p>
              </div>
              <div>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Exposição câmbio</p>
                <p className="text-sm font-bold text-zinc-200">{foreignPct.toFixed(0)}%</p>
                <p className="text-[9px] text-zinc-600">{compactBRL(foreignExpoBRL)}</p>
              </div>
              <div>
                <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Dólar</p>
                <p className="text-sm font-bold text-zinc-200">R$ {data.usdbrl.toFixed(2)}</p>
                <p className="text-[9px] text-zinc-600">PM R$ {data.cambio?.pmDolar?.toFixed(2) ?? "—"}</p>
              </div>
            </div>

            {/* ── Top / Bottom ── */}
            {(top || bot) && (
              <>
                <div className="h-px bg-zinc-800/60 my-3" />
                <div className="grid grid-cols-2 gap-3">
                  {top && (
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(52,211,153,0.12)" }}>
                        <Award size={12} className="text-emerald-400" />
                      </span>
                      <div>
                        <p className="text-[9px] text-zinc-600 uppercase">Top</p>
                        <p className="text-[11px] font-bold text-zinc-200">{top.ticker} <span className="text-emerald-400">+{top.lucro_pct.toFixed(1)}%</span></p>
                      </div>
                    </div>
                  )}
                  {bot && (
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(248,113,113,0.12)" }}>
                        <AlertTriangle size={12} className="text-red-400" />
                      </span>
                      <div>
                        <p className="text-[9px] text-zinc-600 uppercase">Bottom</p>
                        <p className="text-[11px] font-bold text-zinc-200">{bot.ticker} <span className="text-red-400">{bot.lucro_pct.toFixed(1)}%</span></p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Posições Encerradas ── */}
            {(() => {
              const vendidos = rent.filter(r => r.status === "Vendido").sort((a, b) => b.resultado_total_brl - a.resultado_total_brl);
              if (vendidos.length === 0) return null;
              const totalImpostoVend = vendidos.reduce((s, r) => s + (r.imposto_brl ?? 0), 0);
              const hasImposto = totalImpostoVend > 0.01;
              return (
                <>
                  <div className="h-px bg-zinc-800/60 my-3" />
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Posições encerradas ({vendidos.length})
                    </h3>
                    <span className="text-[10px] text-zinc-500">
                      Total {compactBRL(vendidos.reduce((s, r) => s + r.resultado_total_brl, 0))}
                    </span>
                  </div>
                  <div className="max-h-[180px] overflow-y-auto -mx-1 px-1">
                    <table className="w-full text-[11px]">
                      <thead className="text-zinc-600">
                        <tr className="border-b border-zinc-800/40">
                          <th className="text-left font-medium py-1">Ativo</th>
                          <th className="text-right font-medium py-1">Custo</th>
                          {hasImposto && <th className="text-right font-medium py-1">IR</th>}
                          <th className="text-right font-medium py-1">Resultado</th>
                          <th className="text-right font-medium py-1">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendidos.map(r => (
                          <tr key={r.ticker} className="border-b border-zinc-900/40">
                            <td className="text-left py-1 font-mono text-zinc-300">{r.ticker}</td>
                            <td className="text-right py-1 text-zinc-500 font-mono">{compactBRL(r.custo_brl)}</td>
                            {hasImposto && (
                              <td className="text-right py-1 text-amber-500/70 font-mono">
                                {(r.imposto_brl ?? 0) > 0.01 ? `−${compactBRL(r.imposto_brl)}` : "—"}
                              </td>
                            )}
                            <td className={`text-right py-1 font-mono font-semibold ${r.resultado_total_brl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {r.resultado_total_brl >= 0 ? "+" : ""}{compactBRL(r.resultado_total_brl)}
                            </td>
                            <td className={`text-right py-1 font-mono ${r.retorno_total_pct >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
                              {r.retorno_total_pct >= 0 ? "+" : ""}{r.retorno_total_pct.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB NAVIGATION
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="overflow-x-auto -mx-4 px-4 mb-5 scrollbar-hide" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="flex min-w-fit">
          {TABS.map(tab => {
            const on = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 font-mono whitespace-nowrap uppercase"
                style={{
                  padding: "9px 14px", marginBottom: -1,
                  borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
                  color: on ? "var(--text)" : "var(--muted)",
                  fontSize: 11, fontWeight: 600, letterSpacing: ".05em",
                }}>
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
           GLOBAL MACRO FILTER — applies to all tabs
         ═══════════════════════════════════════════════════════════════════════ */}
      {composicao && macros.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {["global", ...macros].map(f => {
            const on = activeFilter === f;
            return (
              <button key={f} onClick={() => setActiveFilter(f)}
                className="font-mono uppercase"
                style={{
                  padding: "5px 12px", fontSize: 10.5, fontWeight: 600, letterSpacing: ".04em",
                  border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  background: on ? "var(--accent-wash)" : "transparent",
                  color: on ? "var(--accent)" : "var(--muted)",
                }}
              >
                {f === "global" ? "Global" : f}
              </button>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: ALOCAÇÃO
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "alocacao" && (
        <div className="space-y-5 animate-fade-in">
          {/* Sunburst + Sidebar */}
          {sunburstData && sunburstData.level1.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title"><PieIcon size={15} />Mapa da Carteira</h2>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  {selectedSector && (
                    <button onClick={() => setSelectedSector(null)}
                      className="px-2 py-1 rounded-md border border-zinc-700 hover:text-zinc-300 transition-colors">
                      ← {selectedSector}
                    </button>
                  )}
                  {selectedClass && (
                    <button onClick={() => { setSelectedClass(null); setSelectedSector(null); }}
                      className="px-2 py-1 rounded-md border border-zinc-700 hover:text-zinc-300 transition-colors">
                      ← Todos
                    </button>
                  )}
                  {!selectedClass && <span>Clique nos anéis para filtrar</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 flex justify-center">
                  <SunburstChart
                    level1={sunburstData.level1}
                    level2={nestedMiddle}
                    level3={nestedOuter}
                    size={560}
                    selectedClass={selectedClass}
                    selectedSector={selectedSector}
                    onSelectClass={setSelectedClass}
                    onSelectSector={setSelectedSector}
                  />
                </div>

                {/* Unified sidebar: Class + Sector + Assets */}
                <div className="lg:col-span-2 flex flex-col gap-5">
                  {/* Class breakdown */}
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2.5">Classe</p>
                    <div className="space-y-2.5">
                      {sunburstData.level1.map((s: any) => (
                        <div key={s.name} className="cursor-pointer group"
                          onClick={() => { setSelectedClass(selectedClass === s.name ? null : s.name); setSelectedSector(null); }}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-opacity"
                                style={{ backgroundColor: s.color, opacity: selectedClass && selectedClass !== s.name ? 0.25 : 1 }} />
                              <span className="text-xs text-zinc-300 group-hover:text-zinc-100 font-medium transition-colors"
                                style={{ opacity: selectedClass && selectedClass !== s.name ? 0.35 : 1 }}>{s.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-zinc-400">{compactBRL(s.value)}</span>
                              <span className="text-xs font-mono font-bold tabular-nums transition-opacity"
                                style={{ color: s.color, opacity: selectedClass && selectedClass !== s.name ? 0.25 : 1 }}>
                                {s.pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-1 rounded-full bg-zinc-800/60 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${s.pct}%`, backgroundColor: s.color, opacity: selectedClass && selectedClass !== s.name ? 0.2 : 0.7 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

                  {/* Sector breakdown */}
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2">
                      Setores{selectedClass ? ` · ${selectedClass === "Renda Variável" ? "RV" : "RF"}` : ""}
                    </p>
                    <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 200 }}>
                      {nestedMiddle.map((s: any) => (
                        <div key={s.name} className="flex items-center justify-between cursor-pointer group py-0.5"
                          onClick={() => { setSelectedClass(s.parentName); setSelectedSector(selectedSector === s.name ? null : s.name); }}>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0 transition-opacity"
                              style={{ backgroundColor: s.color, opacity: selectedSector && selectedSector !== s.name ? 0.25 : 1 }} />
                            <span className="text-[11px] text-zinc-500 group-hover:text-zinc-300 transition-colors"
                              style={{ opacity: selectedSector && selectedSector !== s.name ? 0.35 : 1 }}>{s.name}</span>
                          </div>
                          <span className="text-[11px] font-mono tabular-nums transition-opacity"
                            style={{ color: s.color, opacity: selectedSector && selectedSector !== s.name ? 0.25 : 1 }}>
                            {s.pct.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Assets */}
                  {nestedOuter.length > 0 && (
                    <>
                      <div className="h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />
                      <div>
                        <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-2">
                          Ativos{selectedSector ? ` · ${selectedSector}` : ""}
                        </p>
                        <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 160 }}>
                          {nestedOuter.map((s: any, i: number) => (
                            <div key={`leg-out-${i}`} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                                <span className="text-[10px] text-zinc-600">{s.name}</span>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 tabular-nums">{s.pct.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Currency + Custody row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Currency exposure */}
            <div className="glass-card p-5">
              <h2 className="section-title mb-4"><DollarSign size={15} />Exposição Cambial</h2>
              {filteredExposicao.length > 0 ? (
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 w-44">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={filteredExposicao} cx="50%" cy="50%" innerRadius={42} outerRadius={70} dataKey="value" stroke="none" paddingAngle={1}>
                          {filteredExposicao.map(entry => <Cell key={entry.name} fill={CURRENCY_COLORS[entry.name] || "#71717a"} />)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2.5 pt-2">
                    {filteredExposicao.map(c => {
                      const pctVal = currencyTotal > 0 ? (c.value / currencyTotal) * 100 : 0;
                      const color = CURRENCY_COLORS[c.name] || "#71717a";
                      return (
                        <div key={c.name}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-xs text-zinc-300 font-medium">{c.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-zinc-400">{compactBRL(c.value)}</span>
                              <span className="text-xs font-mono font-semibold tabular-nums" style={{ color }}>{pctVal.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="h-0.5 rounded-full bg-zinc-800/60 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pctVal}%`, backgroundColor: color, opacity: 0.6 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
            </div>

            {/* Sector pie */}
            <div className="glass-card p-5">
              <h2 className="section-title mb-4"><Globe size={15} />Setores</h2>
              {sectorData.length > 0 ? (
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 w-44">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={sectorData} cx="50%" cy="50%" innerRadius={42} outerRadius={70} dataKey="value" stroke="none" paddingAngle={1}>
                          {sectorData.map(entry => <Cell key={entry.name} fill={SECTOR_COLORS[entry.name] || "#71717a"} />)}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number) => [compactBRL(v), "Valor"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 overflow-y-auto pt-2" style={{ maxHeight: 160 }}>
                    <div className="space-y-1.5">
                      {sectorData.map(s => {
                        const total = sectorData.reduce((a, b) => a + b.value, 0);
                        const p = total > 0 ? (s.value / total) * 100 : 0;
                        return (
                          <div key={s.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SECTOR_COLORS[s.name] || "#71717a" }} />
                              <span className="text-[11px] text-zinc-500">{s.name}</span>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums" style={{ color: SECTOR_COLORS[s.name] || "#71717a" }}>{p.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : <p className="text-zinc-600 text-sm">Sem dados.</p>}
            </div>
          </div>

          {/* Custody (Brasil vs Exterior) */}
          {composicao?.custodia && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-4"><Globe size={15} />Custódia</h2>
              <div className="grid grid-cols-2 gap-8">
                {[
                  { label: "Brasil", value: composicao.custodia.brasil, pct: composicao.custodia.brasil_pct, color: "#3b82f6", icon: "🇧🇷" },
                  { label: "Exterior", value: composicao.custodia.exterior, pct: composicao.custodia.exterior_pct, color: "#8b5cf6", icon: "🌐" },
                ].map(c => (
                  <div key={c.label}>
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm font-semibold text-zinc-300">{c.label}</span>
                      <span className="text-xl font-bold" style={{ color: c.color }}>{c.pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-zinc-800/60 overflow-hidden mb-2">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${c.pct}%`, backgroundColor: c.color, boxShadow: `0 0 12px ${c.color}40` }} />
                    </div>
                    <span className="text-sm text-zinc-400">{compactBRL(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pareto */}
          {filteredPareto.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-4"><BarChart3 size={15} />Pareto — Concentração</h2>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={filteredPareto} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
                  <XAxis dataKey="ticker" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    interval={0} angle={-35} textAnchor="end" height={50} />
                  <YAxis yAxisId="left" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => compactBRL(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `${v.toFixed(0)}%`} domain={[0, 100]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(v: number, name: string) => [
                      name === "valor_brl" ? compactBRL(v) : `${v.toFixed(1)}%`,
                      name === "valor_brl" ? "Valor" : "Acumulado",
                    ]} />
                  <Bar yAxisId="left" dataKey="valor_brl" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {filteredPareto.map((entry, i) => (
                      <Cell key={i} fill={SECTOR_COLORS[entry.setor] || "#3b82f6"} fillOpacity={0.85} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="acumulado_pct" stroke="#E8A33D" strokeWidth={2}
                    dot={{ fill: "#E8A33D", r: 3 }} name="acumulado_pct" />
                  <ReferenceLine yAxisId="right" y={80} stroke="#E8A33D" strokeDasharray="6 3" strokeOpacity={0.45}
                    label={{ value: "80%", position: "right", fontSize: 9, fill: "#E8A33D" }} />
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
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: SETORES
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "setores" && (
        <div className="space-y-4 animate-fade-in">
          {(setoresLoading || (sectorConsolidated && setoresLtLoading)) && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
              <Loader2 size={14} className="animate-spin" /> Carregando dados setoriais…
            </div>
          )}

          {activeSetoresData && (() => {
            const sd = activeSetoresData;
            const rvP = sd.totalBRL > 0 ? (sd.rvBRL / sd.totalBRL) * 100 : 0;
            const rfP = sd.totalBRL > 0 ? (sd.rfBRL / sd.totalBRL) * 100 : 0;
            const sorted = [...sd.sectors].sort((a, b) => b.pct - a.pct);
            const top3 = sorted.slice(0, 3).reduce((s, x) => s + x.pct, 0);
            const hhi = sorted.reduce((s, x) => s + (x.pct / 100) ** 2, 0);
            const effN = hhi > 0 ? 1 / hhi : 0;
            const ltMeta = setoresLtData?.lookthrough;

            const toggleSector = (setor: string) => {
              setExpandedSectors(prev => {
                const next = new Set(prev);
                if (next.has(setor)) next.delete(setor); else next.add(setor);
                return next;
              });
            };

            return (
              <>
                {/* View toggle + summary strip */}
                <div className="glass-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                      <button onClick={() => setSectorConsolidated(false)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                        style={{ background: !sectorConsolidated ? "var(--accent-wash)" : "transparent", color: !sectorConsolidated ? "var(--accent)" : "var(--muted)" }}>
                        <Eye size={11} /> Padrão
                      </button>
                      <button onClick={() => setSectorConsolidated(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors"
                        style={{ background: sectorConsolidated ? "rgba(139,92,246,0.12)" : "transparent", color: sectorConsolidated ? "#a78bfa" : "var(--muted)" }}>
                        <Layers size={11} /> Consolidada
                      </button>
                    </div>
                    {sectorConsolidated && ltMeta && (
                      <span className="text-[10px] text-zinc-600">
                        {ltMeta.supported.length} ETF{ltMeta.supported.length !== 1 ? "s" : ""} decompostos
                        {ltMeta.unsupported.length > 0 && ` · ${ltMeta.unsupported.length} sem dados`}
                      </span>
                    )}
                  </div>

                  {/* Compact metrics strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Patrimônio</div>
                      <div className="text-sm font-bold text-zinc-100">{compactBRL(sd.totalBRL)}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Alocação</div>
                      <div className="text-sm font-bold">
                        <span className="text-blue-400">{rvP.toFixed(0)}% RV</span>
                        <span className="text-zinc-600 mx-1">·</span>
                        <span className="text-teal-400">{rfP.toFixed(0)}% RF</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Diversificação</div>
                      <div className="text-sm font-bold text-zinc-200">{sd.sectors.length} setores · {sd.positions.length} ativos</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-zinc-600 uppercase tracking-wider mb-0.5">Concentração</div>
                      <div className="text-sm font-bold text-zinc-200">
                        Top 3 {top3.toFixed(0)}%
                        <span className="text-[10px] text-zinc-600 ml-1">N eff {effN.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {sectorConsolidated && ltMeta && (
                  <div className="rounded-lg px-3 py-2.5 flex items-start gap-2" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                    <Layers size={12} className="text-violet-400 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      ETFs decompostos nos ativos subjacentes.
                      {ltMeta.supported.length > 0 && <> <b className="text-zinc-400">{ltMeta.supported.join(", ")}</b>.</>}
                      {ltMeta.unsupported.length > 0 && <> Sem dados: <b className="text-zinc-400">{ltMeta.unsupported.join(", ")}</b>.</>}
                    </p>
                  </div>
                )}

                {/* Treemap */}
                {sectorTreemapData.length > 0 && (
                  <div className="glass-card p-4">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Mapa de Alocação Setorial</h3>
                    <div className="h-[260px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap data={sectorTreemapData} dataKey="value" nameKey="name" stroke="none" animationDuration={500}
                          content={<SectorTreemapContent />}>
                          <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                            formatter={(v: number) => compactBRL(v)} labelFormatter={(l: string) => l} />
                        </Treemap>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Sector breakdown table */}
                <div className="glass-card p-4">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">
                    Detalhamento por Setor ({sd.sectors.length})
                  </h3>
                  <div className="space-y-0.5">
                    {sd.sectors.map(s => {
                      const isExpanded = expandedSectors.has(s.setor);
                      return (
                        <div key={s.setor}>
                          <button onClick={() => toggleSector(s.setor)}
                            className="w-full flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                            {isExpanded ? <ChevronDown size={10} className="text-zinc-500 shrink-0" /> : <ChevronRight size={10} className="text-zinc-500 shrink-0" />}
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sectorEconColor(s.setor) }} />
                            <span className="text-xs font-semibold text-zinc-200 flex-1 text-left truncate">{s.setor}</span>
                            <span className="text-[10px] text-zinc-600 font-mono shrink-0 w-6 text-right">{s.posicoes.length}</span>
                            <span className="text-xs text-zinc-300 font-mono font-bold shrink-0 w-20 text-right">{compactBRL(s.valorBRL)}</span>
                            <div className="w-14 shrink-0">
                              <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                <div className="h-full rounded-full" style={{ width: `${Math.min(s.pct, 100)}%`, background: sectorEconColor(s.setor) }} />
                              </div>
                            </div>
                            <span className="text-xs text-zinc-400 font-mono shrink-0 w-12 text-right">{s.pct.toFixed(1)}%</span>
                          </button>
                          {isExpanded && (
                            <div className="ml-7 mr-1 mb-1.5">
                              {s.posicoes.map(p => {
                                const retTotal = p.retornoTotalPct ?? p.lucroPct;
                                const pos = retTotal >= 0;
                                return (
                                  <div key={p.ticker} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/[0.02] transition-colors">
                                    <span className="text-[11px] font-bold text-zinc-300 w-16 truncate">{p.ticker}</span>
                                    <span className="text-[10px] text-zinc-600 flex-1 truncate">{p.nome !== p.ticker ? p.nome : p.industry}</span>
                                    <span className="text-[10px] text-zinc-500 font-mono w-14 text-right">{compactBRL(p.valorBRL)}</span>
                                    <span className="text-[10px] text-zinc-600 font-mono w-10 text-right">
                                      {sd.totalBRL > 0 ? ((p.valorBRL / sd.totalBRL) * 100).toFixed(1) : "0.0"}%
                                    </span>
                                    {p.tipo === "RV" && (
                                      <span className={`text-[10px] font-mono font-bold w-14 text-right flex items-center justify-end gap-0.5 ${pos ? "text-emerald-400" : "text-red-400"}`}>
                                        {pos ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
                                        {retTotal !== 0 ? `${pos ? "+" : ""}${retTotal.toFixed(1)}%` : "—"}
                                      </span>
                                    )}
                                    {p.tipo !== "RV" && (
                                      <span className="text-[10px] text-zinc-600 w-14 text-right">{p.moeda}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom row: Top Positions + Industry */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Top 15 */}
                  <div className="glass-card p-4">
                    <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Top 15 Posições</h3>
                    <div className="space-y-0.5">
                      {sd.positions.slice(0, 15).map((p, i) => {
                        const posPct = sd.totalBRL > 0 ? (p.valorBRL / sd.totalBRL) * 100 : 0;
                        return (
                          <div key={p.ticker} className="flex items-center gap-2 py-1">
                            <span className="text-[10px] text-zinc-700 font-mono w-4 text-right">{i + 1}</span>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sectorEconColor(p.setorEconomico) }} />
                            <span className="text-[11px] font-bold text-zinc-200 w-16 truncate">{p.ticker}</span>
                            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(posPct * 2.5, 100)}%`, background: sectorEconColor(p.setorEconomico), opacity: 0.6 }} />
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono w-10 text-right">{posPct.toFixed(1)}%</span>
                            <span className="text-[10px] text-zinc-500 font-mono w-14 text-right">{compactBRL(p.valorBRL)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Industry breakdown */}
                  {sectorIndustryBreakdown.length > 0 && (
                    <div className="glass-card p-4">
                      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Top Indústrias</h3>
                      <div className="space-y-0.5">
                        {sectorIndustryBreakdown.slice(0, 15).map(ind => (
                          <div key={`${ind.setor}|${ind.industry}`} className="flex items-center gap-2 py-1 px-1">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sectorEconColor(ind.setor) }} />
                            <span className="text-[11px] text-zinc-300 flex-1 truncate">{ind.industry}</span>
                            <span className="text-[9px] text-zinc-700 shrink-0">{ind.count}</span>
                            <span className="text-[11px] text-zinc-300 font-mono font-bold shrink-0 w-16 text-right">{compactBRL(ind.valorBRL)}</span>
                            <span className="text-[10px] text-zinc-500 font-mono shrink-0 w-10 text-right">
                              {sd.totalBRL > 0 ? ((ind.valorBRL / sd.totalBRL) * 100).toFixed(1) : "0.0"}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Concentration bar */}
                <div className="glass-card p-4">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Concentração</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: "Top 1 setor", value: sorted[0]?.pct ?? 0 },
                      { label: "Top 3 setores", value: top3 },
                      { label: "Top 5 setores", value: sorted.slice(0, 5).reduce((s, x) => s + x.pct, 0) },
                      { label: "# Efetivo (1/HHI)", value: effN, isCount: true },
                    ].map(c => (
                      <div key={c.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-zinc-500">{c.label}</span>
                          <span className="text-xs text-zinc-300 font-mono font-bold">
                            {c.isCount ? c.value.toFixed(1) : `${c.value.toFixed(1)}%`}
                          </span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min(c.isCount ? (c.value / sd.sectors.length) * 100 : c.value, 100)}%`,
                            background: (!c.isCount && c.value > 60) ? "#f59e0b" : "#3b82f6",
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: CUSTÓDIA / CORRETORAS
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "custodia" && (
        <div className="space-y-5 animate-fade-in">
          <CustodiaRisk positions={custodiaPositions} patrimonioBRL={custodiaTotal} macroFilter={activeFilter} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: POSIÇÕES
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "posicoes" && (
        <div className="space-y-5 animate-fade-in">

          {/* ── Posições Históricas — Consulta por Data ── */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4"><Calendar size={15} />Posições em Data Específica</h2>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Data</label>
                <input
                  type="date"
                  value={histDate}
                  onChange={e => setHistDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="px-3 py-2 rounded-lg text-sm font-mono bg-zinc-900/80 border border-zinc-700/50 text-zinc-200 focus:border-amber-500/50 focus:outline-none transition-colors"
                />
              </div>
              <button
                onClick={() => fetchHistorico(histDate)}
                disabled={!histDate || histLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  !histDate || histLoading
                    ? "border-zinc-700 text-zinc-600 cursor-not-allowed"
                    : "border-amber-600/50 text-amber-400 hover:bg-amber-600/10"
                }`}
              >
                {histLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {histLoading ? "Consultando…" : "Consultar"}
              </button>
              {histData && (
                <span className="text-[10px] text-zinc-600">
                  Cotações de {histData.priceDate ?? "—"}{histData.fxRate ? ` · USD/BRL ${histData.fxRate.toFixed(2)}` : ""}
                </span>
              )}
            </div>

            {histError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{histError}</div>
            )}

            {histData && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Renda Variável", value: histData.resumo.totalRV_BRL, color: "text-blue-400" },
                    { label: "Renda Fixa", value: histData.resumo.totalRF_BRL, color: "text-teal-400" },
                    { label: "Total", value: histData.resumo.totalBRL, color: "text-amber-400" },
                  ].map(c => (
                    <div key={c.label} className="rounded-xl p-3 border border-zinc-800/50" style={{ background: "rgba(19,20,26,0.6)" }}>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{c.label}</div>
                      <div className={`text-lg font-bold ${c.color}`}>{brl(c.value)}</div>
                    </div>
                  ))}
                </div>

                {/* RV table */}
                {histData.rendaVariavel.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Renda Variável · {histData.rendaVariavel.length} ativos</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                            {["Ativo", "Qtd", "PM", "Preço Hist.", "Valor", "Moeda"].map((h, i) => (
                              <th key={h} className={`px-3 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 0 ? "text-right" : "text-left"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {histData.rendaVariavel
                            .sort((a, b) => (b.valorHistorico ?? 0) - (a.valorHistorico ?? 0))
                            .map((p, i) => (
                            <tr key={p.ticker} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                              <td className="px-3 py-2">
                                <span className="font-semibold text-zinc-200">{p.ticker}</span>
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-400 font-mono text-xs">
                                {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-500 text-xs">
                                {p.custoMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-400 text-xs">
                                {p.precoHistorico !== null ? p.precoHistorico.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-zinc-200">
                                {p.valorHistorico !== null ? currency(p.valorHistorico, p.moeda) : "—"}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-500 text-[10px]">{p.moeda}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* RF table */}
                {histData.rendaFixa.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Renda Fixa · {histData.rendaFixa.length} títulos</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                            {["Título", "Valor Investido", "Moeda"].map((h, i) => (
                              <th key={h} className={`px-3 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 0 ? "text-right" : "text-left"}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {histData.rendaFixa
                            .sort((a, b) => b.valorInvestido - a.valorInvestido)
                            .map((r, i) => (
                            <tr key={`${r.ticker}-${i}`} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                              <td className="px-3 py-2">
                                <span className="font-semibold text-zinc-200">{r.ticker}</span>
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-zinc-200">{brl(r.valorInvestido)}</td>
                              <td className="px-3 py-2 text-right text-zinc-500 text-[10px]">{r.moeda}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {histData.rendaVariavel.length === 0 && histData.rendaFixa.length === 0 && (
                  <p className="text-zinc-600 text-sm">Nenhuma posição encontrada nesta data.</p>
                )}
              </div>
            )}
          </div>

          {/* Positions table */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4"><Briefcase size={15} />Posições Atuais{activeFilter !== "global" ? ` — ${activeFilter}` : ""}</h2>
            {(filteredPositions.length + posicoesRFManual.length) > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                      {["Ativo", "Setor", "Qtd", "Preço", "Valor", "Dividendos", "Retorno"].map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 1 ? "text-right" : "text-left"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.map((p, i) => {
                      // Fonte única: campos vêm do snapshot (lib/portfolio.ts).
                      const dividendosBRL = p.proventosBRL;
                      const realizadoBRL = p.lucroRealizadoBRL ?? 0;
                      const naoRealizadoPct = p.lucroPct;                 // Valorização %
                      const realizadoPct = p.custoTotalBRL > 0 ? (realizadoBRL / p.custoTotalBRL) * 100 : 0;
                      const totalPct = p.retornoTotalPct;                 // Retorno Total %
                      const corTotal = totalPct !== null ? (totalPct >= 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-500";

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
                          <td className="px-3 py-2.5 text-right font-medium text-zinc-200">
                            {p.valorAtual !== null ? currency(p.valorAtual, p.moeda) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs">
                            {dividendosBRL > 0 ? (
                              <span className="text-amber-400 font-mono">{compactBRL(dividendosBRL)}</span>
                            ) : (
                              <span className="text-zinc-700">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className={`font-bold text-sm ${corTotal}`}>
                              {totalPct !== null
                                ? `${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%`
                                : "—"}
                            </div>
                            <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                              <span title="Não realizado">
                                {naoRealizadoPct !== null
                                  ? `NR ${naoRealizadoPct >= 0 ? "+" : ""}${naoRealizadoPct.toFixed(1)}%`
                                  : "NR —"}
                              </span>
                              {" · "}
                              <span title="Realizado">
                                {`R ${realizadoPct >= 0 ? "+" : ""}${realizadoPct.toFixed(1)}%`}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {/* RF manual (Tesouro/NTN/CDB/caixa) — só em fixa_aberta */}
                    {posicoesRFManual.map((r, i) => (
                      <tr key={`rf-${r.ticker}-${i}`} className={`border-b hover:bg-white/[0.025] transition-colors ${(filteredPositions.length + i) % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-zinc-200">{r.ticker}</span>
                          <span className="text-zinc-600 text-[10px] ml-1.5">{r.moeda}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[r.setor] || "#0f766e"}15`, color: SECTOR_COLORS[r.setor] || "#0f766e" }}>
                            {r.setor}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-zinc-700 font-mono text-xs">—</td>
                        <td className="px-3 py-2.5 text-right text-zinc-700 text-xs">—</td>
                        <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{brl(r.valorBRL)}</td>
                        <td className="px-3 py-2.5 text-right text-xs">
                          {r.proventosBRL > 0 ? (
                            <span className="text-amber-400 font-mono">{compactBRL(r.proventosBRL)}</span>
                          ) : (
                            <span className="text-zinc-700">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {r.retornoPct !== null ? (
                            <div className={`font-bold text-sm ${r.retornoPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {r.retornoPct >= 0 ? "+" : ""}{r.retornoPct.toFixed(1)}%
                            </div>
                          ) : (
                            <div className="text-sm text-zinc-600">—</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-zinc-600 text-sm">Nenhuma posição.</p>}
          </div>

        </div>
      )}

      {/* ── Data quality warnings ── */}
      {composicao?.errors && composicao.errors.length > 0 && (
        <div className="glass-card p-4 border-l-2 border-yellow-600/40 mt-6">
          <p className="text-xs font-semibold text-yellow-500 mb-1">Avisos</p>
          <ul className="space-y-0.5">
            {composicao.errors.map((e, i) => (
              <li key={i} className="text-xs text-zinc-400">{e}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ── Risco por Corretora & Jurisdição ────────────────────────────────────────

function CustodiaRisk({ positions, patrimonioBRL, macroFilter = "global" }: {
  positions: { ticker: string; setor: string; valorAtualBRL: number; quantidade: number; moeda: string; corretora?: string; macro?: string }[];
  patrimonioBRL: number;
  macroFilter?: string;
}) {
  // Usa o macro explícito quando vem (RF manual/caixa têm subsetor que não está
  // em RF_SETORES); senão deriva do setor.
  const macroOf = (p: { setor: string; macro?: string }) =>
    p.macro ?? (isRendaVariavel(p.setor) ? "Renda Variável" : "Renda Fixa");

  const filteredPositions = useMemo(() => {
    if (macroFilter === "global") return positions;
    return positions.filter(p => macroOf(p) === macroFilter);
  }, [positions, macroFilter]);

  const filteredTotal = useMemo(() =>
    macroFilter === "global" ? patrimonioBRL : filteredPositions.reduce((s, p) => s + p.valorAtualBRL, 0),
    [macroFilter, patrimonioBRL, filteredPositions]);

  const byCorretora = useMemo(() => {
    const map: Record<string, { valorBRL: number; moedas: Set<string>; tickers: string[]; count: number }> = {};
    for (const p of filteredPositions) {
      if (p.valorAtualBRL <= 0 || !p.quantidade) continue;
      const corr = (p.corretora || "Não informada").trim();
      if (!map[corr]) map[corr] = { valorBRL: 0, moedas: new Set(), tickers: [], count: 0 };
      map[corr].valorBRL += p.valorAtualBRL;
      map[corr].moedas.add(p.moeda || "BRL");
      map[corr].tickers.push(p.ticker.replace(/\.SA$/, ""));
      map[corr].count++;
    }
    return Object.entries(map)
      .map(([nome, info]) => ({
        nome,
        valorBRL: info.valorBRL,
        pct: filteredTotal > 0 ? (info.valorBRL / filteredTotal) * 100 : 0,
        moedas: [...info.moedas].join(", "),
        jurisdicao: inferJurisdicao(nome),
        count: info.count,
        topTickers: info.tickers.slice(0, 5),
      }))
      .sort((a, b) => b.valorBRL - a.valorBRL);
  }, [filteredPositions, filteredTotal]);

  if (byCorretora.length === 0) return null;

  const maxPct = Math.max(...byCorretora.map(c => c.pct));

  return (
    <div className="glass-card p-5 mb-6">
      <h2 className="section-title mb-1"><Building2 size={15} />Risco por Corretora & Jurisdição</h2>
      <p className="text-[10px] text-zinc-500 mb-5">
        Concentração de patrimônio por corretora. Diversificar custódia reduz risco de contraparte.
      </p>

      <div className="space-y-3">
        {byCorretora.map(c => {
          const jColor = c.jurisdicao === "Brasil" ? "#22c55e" : c.jurisdicao === "EUA" ? "#3b82f6" : "#8b5cf6";
          return (
            <div key={c.nome} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${jColor}15` }}>
                    <Building2 size={14} style={{ color: jColor }} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-zinc-100">{c.nome}</div>
                    <div className="text-[10px] text-zinc-600">
                      <span style={{ color: jColor }}>{c.jurisdicao}</span> · {c.count} ativos · {c.moedas}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-zinc-100">{compactBRL(c.valorBRL)}</div>
                  <div className="text-[10px] text-zinc-500">{c.pct.toFixed(1)}% do patrimônio</div>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${Math.min((c.pct / Math.max(maxPct, 1)) * 100, 100)}%`,
                  background: c.pct > 50 ? `linear-gradient(90deg, ${jColor}, #f87171)` : jColor,
                  opacity: 0.7,
                }} />
              </div>
              {c.pct > 60 && (
                <div className="text-[10px] text-amber-400/80 mb-1">
                  Concentração alta ({c.pct.toFixed(0)}%) — considere diversificar custódia
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {c.topTickers.map(t => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-md text-zinc-500" style={{ background: "rgba(255,255,255,0.04)" }}>{t}</span>
                ))}
                {c.count > 5 && <span className="text-[9px] text-zinc-700">+{c.count - 5}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectorTreemapContent(props: any) {
  const { x, y, width, height, name, pctVal, depth } = props;
  if (depth === 0 || !name || width < 40 || height < 25) return null;
  const safeName = String(name);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: sectorEconColor(safeName), stroke: "#09090b", strokeWidth: 2, opacity: 0.85 }} />
      {width > 55 && height > 30 && (
        <>
          <text x={x + 5} y={y + 13} fontSize={10} fontWeight={700} fill="#fafafa"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
            {safeName.length > Math.floor(width / 7) ? safeName.slice(0, Math.floor(width / 7)) + "…" : safeName}
          </text>
          <text x={x + 5} y={y + 25} fontSize={9} fill="rgba(255,255,255,0.7)">
            {pctVal?.toFixed(1)}%
          </text>
        </>
      )}
    </g>
  );
}

function inferJurisdicao(corretora: string): string {
  const c = corretora.toLowerCase();
  if (c.includes("ibkr") || c.includes("interactive") || c.includes("td ") || c.includes("schwab") || c.includes("robinhood") || c.includes("fidelity")) return "EUA";
  if (c.includes("b3") || c.includes("xp") || c.includes("rico") || c.includes("btg") || c.includes("nuinvest") || c.includes("clear") || c.includes("inter") || c.includes("itaú") || c.includes("bradesco") || c.includes("avenue")) return "Brasil";
  if (c.includes("degiro") || c.includes("saxo") || c.includes("etoro")) return "Europa";
  if (c.includes("binance") || c.includes("coinbase") || c.includes("kraken") || c.includes("mercado bitcoin") || c.includes("bybit")) return "Cripto (global)";
  return "Outro";
}

