"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
  ComposedChart, Line, Scatter, ScatterChart, ZAxis,
  ReferenceLine,
} from "recharts";
import SunburstChart from "@/components/SunburstChart";
import {
  TrendingUp, TrendingDown, Coins, DollarSign,
  BarChart3, ArrowUpRight, Globe,
  Award, AlertTriangle, RefreshCw,
  Target, PieChart as PieIcon,
  Briefcase, Layers,
  Building2, Wallet, Plus, Trash2, Save, Loader2,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { bumpDataVersion, withDataVersion } from "@/lib/data-version";
import { brl, compactBRL, pct, shortMonth, currency } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { identificarSetor, isRendaFixa, isRendaVariavel } from "@/lib/sectors";
import type { CountryAllocation } from "@/lib/ticker-country";
import InvestmentWorldMap from "@/components/InvestmentWorldMap";
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
  color: "#fafafa", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "alocacao" | "custodia" | "rentabilidade" | "posicoes" | "composicao-etf" | "caixa";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "alocacao", label: "Alocação", icon: <PieIcon size={14} /> },
  { id: "custodia", label: "Corretoras", icon: <Building2 size={14} /> },
  { id: "rentabilidade", label: "Rentab.", icon: <Target size={14} /> },
  { id: "posicoes", label: "Posições", icon: <Briefcase size={14} /> },
  { id: "composicao-etf", label: "ETFs", icon: <Layers size={14} /> },
  { id: "caixa", label: "Caixa", icon: <Wallet size={14} /> },
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
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [lookThroughTab, setLookThroughTab] = useState<"por-etf" | "combinada" | "rv-completa" | "portfolio-completo">("por-etf");
  const [activeTab, setActiveTab] = useState<Tab>("alocacao");
  const [rentStatusFilter, setRentStatusFilter] = useState<"Todos" | "Ativo" | "Vendido">("Todos");
  const [etfRefreshing, setEtfRefreshing] = useState(false);

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

  const filteredRentabilidade = useMemo(() => {
    if (!composicao?.rentabilidade) return [];
    let items = composicao.rentabilidade as RentabilidadeItem[];
    if (activeFilter !== "global") items = items.filter(r => r.macro === activeFilter);
    if (rentStatusFilter !== "Todos") items = items.filter(r => r.status === rentStatusFilter);
    return items;
  }, [composicao, activeFilter, rentStatusFilter]);

  const filteredRiscoRetorno = useMemo(() => {
    if (!composicao?.risco_retorno) return [];
    if (activeFilter === "global") return composicao.risco_retorno;
    return composicao.risco_retorno.filter(r => r.macro === activeFilter);
  }, [composicao, activeFilter]);

  // Mapa reage ao filtro macro: RV usa rv_brl, RF usa rf_brl, global usa o total.
  const mapAllocation = useMemo(() => {
    const raw = composicao?.country_allocation ?? [];
    if (activeFilter === "global") return raw;
    const pick = (c: CountryAllocation) => activeFilter === "Renda Fixa" ? c.rf_brl : c.rv_brl;
    const filtered = raw
      .map(c => ({ ...c, value_brl: pick(c) }))
      .filter(c => c.value_brl > 0);
    const total = filtered.reduce((s, c) => s + c.value_brl, 0);
    return filtered
      .map(c => ({ ...c, pct: total > 0 ? (c.value_brl / total) * 100 : 0 }))
      .sort((a, b) => b.value_brl - a.value_brl);
  }, [composicao, activeFilter]);

  const mapTotal = useMemo(() => {
    if (!composicao) return 0;
    if (activeFilter === "Renda Variável") return composicao.resumo.rv_value;
    if (activeFilter === "Renda Fixa") return composicao.resumo.rf_value;
    return composicao.resumo.total_portfolio;
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
        const rvReal = rvPositions.reduce((s, p) => s + (p.lucroRealizadoBRL ?? 0), 0);
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

            {/* Renda Variável — ganho de capital */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-blue-400">Renda Variável</span>
                <span className={`text-[12px] font-bold ${clr(rvGanho)}`}>{fmt(rvGanho)}</span>
              </div>
              <div className="pl-3 space-y-0.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Não realizado</span>
                  <span className={clrSub(rvNaoReal)}>{fmt(rvNaoReal)}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-zinc-500">Realizado</span>
                  <span className={clrSub(rvReal)}>{fmt(rvReal)}</span>
                </div>
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
           TAB: CUSTÓDIA / CORRETORAS
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "custodia" && (
        <div className="space-y-5 animate-fade-in">
          <CustodiaRisk positions={custodiaPositions} patrimonioBRL={custodiaTotal} macroFilter={activeFilter} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: RENTABILIDADE
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "rentabilidade" && (
        <div className="space-y-5 animate-fade-in">
          {/* Status filter */}
          <div className="flex gap-1.5">
            {(["Todos", "Ativo", "Vendido"] as const).map(s => (
              <button key={s} onClick={() => setRentStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${rentStatusFilter === s
                  ? "border-emerald-600/50 bg-emerald-600/15 text-emerald-400"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                }`}>
                {s}
              </button>
            ))}
          </div>

          {/* Horizontal bar chart — stacked unrealized + realized/proventos */}
          {filteredRentabilidade.filter(r => r.status === "Ativo").length > 0 && (() => {
            const activeItems = filteredRentabilidade
              .filter(r => r.status === "Ativo" && r.retorno_total_pct !== 0)
              .sort((a, b) => b.retorno_total_pct - a.retorno_total_pct);
            const chartHeight = Math.max(320, activeItems.length * 28);
            return (
              <div className="glass-card p-5">
                <h2 className="section-title mb-4"><Target size={15} />Rentabilidade por Ativo</h2>
                <ResponsiveContainer width="100%" height={chartHeight}>
                  <BarChart layout="vertical" data={activeItems} barCategoryGap="18%" margin={{ left: 10, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `${v.toFixed(0)}%`} />
                    <YAxis type="category" dataKey="ticker" width={70} tick={{ fill: "#a1a1aa", fontSize: 11, fontWeight: 600 }}
                      axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(v: number, name: string) => [
                        `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
                        name === "retorno_nao_realizado_pct" ? "Não Realizado" : "Realiz. + Prov.",
                      ]}
                      labelFormatter={(label) => {
                        const item = activeItems.find(r => r.ticker === label);
                        return item ? `${label} (${item.moeda})` : label;
                      }}
                    />
                    <ReferenceLine x={0} stroke="#3f3f46" strokeWidth={1} />
                    <Bar dataKey="retorno_nao_realizado_pct" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={18} name="retorno_nao_realizado_pct">
                      {activeItems.map((entry, i) => (
                        <Cell key={i} fill={entry.retorno_total_pct >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.85} />
                      ))}
                    </Bar>
                    <Bar dataKey="retorno_realizado_proventos_pct" stackId="a" radius={[0, 4, 4, 0]} maxBarSize={18} name="retorno_realizado_proventos_pct"
                      label={(props: Record<string, unknown>) => {
                        const { x, y, width, height, index } = props as { x: number; y: number; width: number; height: number; index: number };
                        const item = activeItems[index];
                        if (!item) return <text />;
                        const total = item.retorno_total_pct;
                        const isRight = total >= 0;
                        return (
                          <text
                            x={isRight ? x + width + 4 : x + width - 4}
                            y={y + height / 2}
                            textAnchor={isRight ? "start" : "end"}
                            dominantBaseline="central"
                            fill={total >= 0 ? "#34d399" : "#f87171"}
                            fontSize={10}
                            fontWeight={600}
                            fontFamily="ui-monospace, monospace"
                          >
                            {total >= 0 ? "+" : ""}{total.toFixed(1)}%
                          </text>
                        );
                      }}
                    >
                      {activeItems.map((entry, i) => (
                        <Cell key={i} fill={entry.retorno_total_pct >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.3} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-3 text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm" style={{ background: "#34d399", opacity: 0.85 }} />
                    Não Realizado
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm" style={{ background: "#34d399", opacity: 0.3 }} />
                    Realizado + Proventos
                  </div>
                  <span className="text-zinc-600 ml-auto">Retorno em moeda nativa</span>
                </div>
              </div>
            );
          })()}

          {/* Detailed P&L table */}
          {filteredRentabilidade.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-4"><BarChart3 size={15} />Detalhamento P&L</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                      {["Ativo", "Setor", "Status", "Valor Atual", "Não Real.", "Real.+Prov.", "Total", "Ret %"].map((h, i) => (
                        <th key={h} className={`px-2 py-2 text-[9px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 1 ? "text-right" : "text-left"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRentabilidade.map((r, i) => {
                      const fmtVal = (v: number) => {
                        if (r.moeda === "USD") return `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`;
                        return compactBRL(v);
                      };
                      return (
                        <tr key={r.ticker} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                          <td className="px-2 py-2">
                            <span className="font-semibold text-zinc-200">{r.ticker}</span>
                            <span className="text-zinc-600 text-[9px] ml-1">{r.moeda}</span>
                          </td>
                          <td className="px-2 py-2">
                            <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[r.setor] || "#71717a"}15`, color: SECTOR_COLORS[r.setor] || "#71717a" }}>
                              {r.setor}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span className={`text-[10px] font-semibold ${r.status === "Ativo" ? "text-emerald-500" : "text-zinc-600"}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right text-zinc-400 font-mono">{fmtVal(r.valor_atual_brl)}</td>
                          <td className={`px-2 py-2 text-right font-mono ${r.lucro_nao_realizado_brl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {r.lucro_nao_realizado_brl !== 0 ? `${r.lucro_nao_realizado_brl >= 0 ? "+" : ""}${fmtVal(r.lucro_nao_realizado_brl)}` : "—"}
                          </td>
                          <td className={`px-2 py-2 text-right font-mono ${(r.lucro_realizado_brl + r.proventos_brl) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {(Math.abs(r.lucro_realizado_brl) + r.proventos_brl) > 0.01 ? `${(r.lucro_realizado_brl + r.proventos_brl) >= 0 ? "+" : ""}${fmtVal(r.lucro_realizado_brl + r.proventos_brl)}` : "—"}
                          </td>
                          <td className={`px-2 py-2 text-right font-mono font-semibold ${r.resultado_total_brl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {r.resultado_total_brl >= 0 ? "+" : ""}{fmtVal(r.resultado_total_brl)}
                          </td>
                          <td className={`px-2 py-2 text-right font-bold ${r.retorno_total_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {r.retorno_total_pct >= 0 ? "+" : ""}{r.retorno_total_pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t" style={{ borderColor: "#3f3f46" }}>
                      <td className="px-2 py-2 font-bold text-zinc-200" colSpan={3}>Total</td>
                      <td className="px-2 py-2 text-right font-mono text-zinc-300">{compactBRL(filteredRentabilidade.reduce((s, r) => s + r.valor_atual_brl, 0))}</td>
                      <td colSpan={2} className="px-2 py-2 text-right text-zinc-500">—</td>
                      <td className="px-2 py-2 text-right font-mono font-semibold text-zinc-300">{compactBRL(filteredRentabilidade.reduce((s, r) => s + r.resultado_total_brl, 0))}</td>
                      <td className="px-2 py-2 text-right text-zinc-500">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[9px] text-zinc-700 mt-2">Valores em moeda do ativo (USD ativos em dólar, demais em BRL). Retorno % calculado em moeda nativa.</p>
            </div>
          )}

          {/* Risco x Retorno */}
          {filteredRiscoRetorno.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="section-title mb-4"><PieIcon size={15} />Risco x Retorno</h2>
              <ResponsiveContainer width="100%" height={340}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" />
                  <XAxis dataKey="retorno_acumulado" name="Retorno" unit="%" type="number"
                    tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    label={{ value: "Retorno Acumulado (%)", position: "insideBottom", offset: -5, fill: "#52525b", fontSize: 10 }} />
                  <YAxis dataKey="valor_atual_brl" name="Valor" type="number"
                    tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => compactBRL(v)} />
                  <ZAxis dataKey="valor_atual_brl" range={[40, 600]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
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
                  <Scatter data={filteredRiscoRetorno} fill="#8b5cf6">
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
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: POSIÇÕES
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "posicoes" && (
        <div className="space-y-5 animate-fade-in">
          {/* Positions table */}
          <div className="glass-card p-5">
            <h2 className="section-title mb-4"><Briefcase size={15} />Posições{activeFilter !== "global" ? ` — ${activeFilter}` : ""}</h2>
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

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: COMPOSIÇÃO ETF
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "composicao-etf" && (
        <div className="space-y-4 animate-fade-in">
          {/* Header with refresh button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-200">Composição Look-Through</h2>
              {composicao?.look_through?.updated_at && (
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  Atualizado {formatComputedAt(composicao.look_through.updated_at)}
                  {composicao.look_through.sources && Object.values(composicao.look_through.sources).length > 0 && (
                    <> · Fontes: {[...new Set(Object.values(composicao.look_through.sources))].join(", ")}</>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={async () => {
                setEtfRefreshing(true);
                try {
                  const res = await fetch(`${API_URL}/api/composicao/etf-refresh`, { method: "POST" });
                  if (res.ok) {
                    const j = await res.json();
                    if (!j.saved_to_sheets) alert(j.warning ?? "Holdings atualizados mas não persistidos na planilha.");
                    bumpDataVersion();
                    const fresh = await fetch(withDataVersion(`${API_URL}/api/composicao/resumo`));
                    if (fresh.ok) setComposicao(await fresh.json());
                  }
                } catch { /* ignore */ }
                setEtfRefreshing(false);
              }}
              disabled={etfRefreshing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                etfRefreshing
                  ? "border-zinc-700 text-zinc-600 cursor-wait"
                  : "border-emerald-700/50 text-emerald-400 hover:bg-emerald-600/10"
              }`}
            >
              <RefreshCw size={13} className={etfRefreshing ? "animate-spin" : ""} />
              {etfRefreshing ? "Atualizando…" : "Atualizar ao Vivo"}
            </button>
          </div>

          {/* World Map — geographic distribution (reage ao filtro RV/RF) */}
          {mapAllocation.length > 0 && (
            <div className="glass-card p-4 sm:p-5">
              <h2 className="section-title mb-3">
                <Globe size={15} />Distribuição Geográfica
                {activeFilter !== "global" && <span className="text-[10px] text-zinc-500 font-normal ml-2">· {activeFilter}</span>}
              </h2>
              <InvestmentWorldMap data={mapAllocation} totalBRL={mapTotal} />
            </div>
          )}

          {composicao?.look_through && composicao.look_through.supported.length > 0 && (() => {
            const lt = composicao.look_through;

            const combined: Record<string, { ativo: string; name?: string; valorBRL: number; etfs: string[] }> = {};
            for (const etf of Object.values(lt.compositions)) {
              for (const c of etf.components) {
                if (!combined[c.ativo]) combined[c.ativo] = { ativo: c.ativo, name: c.name, valorBRL: 0, etfs: [] };
                combined[c.ativo].valorBRL += etf.valor_brl * c.peso;
                if (!combined[c.ativo].etfs.includes(etf.ticker)) combined[c.ativo].etfs.push(etf.ticker);
              }
            }
            const combinedList = Object.values(combined).sort((a, b) => b.valorBRL - a.valorBRL);
            const combinedTotal = combinedList.reduce((s, c) => s + c.valorBRL, 0);

            const rvComplete: { ticker: string; name: string; valorBRL: number; source: string; isExpanded: boolean }[] = [];
            for (const p of rvPositions) {
              if (lt.compositions[p.ticker]) {
                for (const c of lt.compositions[p.ticker].components) {
                  rvComplete.push({ ticker: c.ativo, name: c.name ?? "", valorBRL: p.valorAtualBRL * c.peso, source: p.ticker, isExpanded: true });
                }
              } else {
                rvComplete.push({ ticker: p.ticker, name: "", valorBRL: p.valorAtualBRL, source: "", isExpanded: false });
              }
            }
            const rvMerged: Record<string, { valorBRL: number; name: string; sources: string[] }> = {};
            for (const item of rvComplete) {
              if (!rvMerged[item.ticker]) rvMerged[item.ticker] = { valorBRL: 0, name: item.name, sources: [] };
              rvMerged[item.ticker].valorBRL += item.valorBRL;
              if (item.name && !rvMerged[item.ticker].name) rvMerged[item.ticker].name = item.name;
              if (item.source && !rvMerged[item.ticker].sources.includes(item.source))
                rvMerged[item.ticker].sources.push(item.source);
            }
            const rvCompleteList = Object.entries(rvMerged)
              .map(([ticker, d]) => ({ ticker, name: d.name, valorBRL: d.valorBRL, via: d.sources.join(", ") }))
              .sort((a, b) => b.valorBRL - a.valorBRL);
            const rvCompleteTotal = rvCompleteList.reduce((s, c) => s + c.valorBRL, 0);

            // Portfólio completo: RV (ETFs expandidos) + RF da bolsa (SHV/BIL) +
            // RF manual (Tesouro, CDBs, caixa). Ranqueia tudo e respeita o filtro.
            const rfBolsa = data.positions
              .filter(p => !isRendaVariavel(p.setor) && p.valorAtualBRL > 0)
              .map(p => ({ ticker: p.ticker, name: "", valorBRL: p.valorAtualBRL, via: p.setor, macro: "Renda Fixa" }));
            const rfManual = (composicao.rf_posicoes ?? []).map(r => ({
              ticker: r.ticker, name: "", valorBRL: r.valor_brl, via: r.is_caixa ? "Caixa" : r.setor, macro: "Renda Fixa",
            }));
            const portfolioItems = [
              ...rvCompleteList.map(c => ({ ticker: c.ticker, name: c.name, valorBRL: c.valorBRL, via: c.via || "Direto", macro: "Renda Variável" })),
              ...rfBolsa,
              ...rfManual,
            ];
            const portfolioCompletoList = portfolioItems
              .filter(i => activeFilter === "global" || i.macro === activeFilter)
              .sort((a, b) => b.valorBRL - a.valorBRL);
            const portfolioCompletoTotal = portfolioCompletoList.reduce((s, c) => s + c.valorBRL, 0);

            return (
              <div className="glass-card p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {lt.supported.map(etf => (
                      <span key={etf} className="tag text-[10px] px-2 py-0.5" style={{ backgroundColor: "rgba(99,102,241,0.12)", color: "#818cf8" }}>
                        {etf} {lt.sources?.[etf] && <span className="text-zinc-600 ml-1">({lt.sources[etf]})</span>}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-zinc-500 whitespace-nowrap ml-2">{compactBRL(lt.total_look_through_brl)}</span>
                </div>

                <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 mb-3">
                  <div className="flex gap-1 bg-zinc-900/60 p-1 rounded-lg w-fit">
                    {([
                      ["por-etf", "Por ETF"],
                      ["combinada", "Combinada"],
                      ["rv-completa", "RV Completa"],
                      ["portfolio-completo", "Portfólio Completo"],
                    ] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setLookThroughTab(id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${lookThroughTab === id ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {lookThroughTab === "por-etf" && (
                  <div className="space-y-4">
                    {Object.values(lt.compositions).map(etf => (
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
                                  <td className="py-1.5 px-2 text-zinc-300 font-medium">
                                    {c.ativo}
                                    {c.name && c.name !== c.ativo && <span className="text-zinc-600 ml-1 text-[10px] hidden sm:inline">{c.name}</span>}
                                  </td>
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
                )}

                {lookThroughTab === "combinada" && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800">
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">#</th>
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Ativo</th>
                          <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Valor</th>
                          <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">%</th>
                          <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Via</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combinedList.slice(0, 30).map((c, i) => (
                          <tr key={c.ativo} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                            <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                            <td className="py-1.5 px-2">
                              <span className="text-zinc-200 font-semibold">{c.ativo}</span>
                              {c.name && c.name !== c.ativo && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                            </td>
                            <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                            <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">
                              {combinedTotal > 0 ? ((c.valorBRL / combinedTotal) * 100).toFixed(2) : "0"}%
                            </td>
                            <td className="py-1.5 px-2 text-zinc-600">{c.etfs.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {lookThroughTab === "rv-completa" && (
                  <>
                    <p className="text-[10px] text-zinc-600 mb-3">
                      Posições diretas + ETFs expandidos. ETFs sem composição mantidos como linha única.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800">
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">#</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Ativo</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Valor</th>
                            <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">%</th>
                            <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Via</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rvCompleteList.map((c, i) => (
                            <tr key={c.ticker} className={`border-b border-zinc-900 hover:bg-white/[0.02] ${c.via ? "opacity-85" : ""}`}>
                              <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                              <td className="py-1.5 px-2">
                                <span className="font-semibold" style={{ color: c.via ? "#a1a1aa" : "#f4f4f5" }}>{c.ticker}</span>
                                {c.name && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                              </td>
                              <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                              <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">
                                {rvCompleteTotal > 0 ? ((c.valorBRL / rvCompleteTotal) * 100).toFixed(2) : "0"}%
                              </td>
                              <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{c.via || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {lookThroughTab === "portfolio-completo" && (
                  <>
                    <p className="text-[10px] text-zinc-600 mb-3">
                      Tudo ranqueado: RV (ETFs expandidos) + renda fixa (ETFs de RF, Tesouro, CDBs) + caixa.
                      {activeFilter !== "global" && <span className="text-zinc-500"> Filtro: {activeFilter}.</span>}
                    </p>
                    {portfolioCompletoList.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800">
                              <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">#</th>
                              <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Ativo</th>
                              <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Classe</th>
                              <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Valor</th>
                              <th className="text-right py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">%</th>
                              <th className="text-left py-1.5 px-2 text-zinc-600 font-semibold uppercase tracking-wider">Via</th>
                            </tr>
                          </thead>
                          <tbody>
                            {portfolioCompletoList.map((c, i) => {
                              const isRF = c.macro === "Renda Fixa";
                              return (
                                <tr key={`${c.ticker}-${i}`} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                                  <td className="py-1.5 px-2 text-zinc-700 font-mono">{i + 1}</td>
                                  <td className="py-1.5 px-2">
                                    <span className="font-semibold text-zinc-100">{c.ticker}</span>
                                    {c.name && <span className="text-zinc-600 ml-1.5 text-[10px]">{c.name}</span>}
                                  </td>
                                  <td className="py-1.5 px-2">
                                    <span className="tag text-[9px] px-1.5 py-0.5" style={{ backgroundColor: isRF ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)", color: isRF ? "#10b981" : "#3b82f6" }}>
                                      {isRF ? "RF" : "RV"}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-right text-zinc-300 font-mono">{compactBRL(c.valorBRL)}</td>
                                  <td className="py-1.5 px-2 text-right text-zinc-500 font-mono">
                                    {portfolioCompletoTotal > 0 ? ((c.valorBRL / portfolioCompletoTotal) * 100).toFixed(2) : "0"}%
                                  </td>
                                  <td className="py-1.5 px-2 text-zinc-600 text-[10px]">{c.via || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-zinc-800 font-semibold">
                              <td className="py-2 px-2 text-zinc-300" colSpan={3}>Total ({portfolioCompletoList.length})</td>
                              <td className="py-2 px-2 text-right text-zinc-200 font-mono">{compactBRL(portfolioCompletoTotal)}</td>
                              <td className="py-2 px-2 text-right text-zinc-500 font-mono">100%</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : <p className="text-zinc-600 text-sm">Nenhuma posição para o filtro {activeFilter}.</p>}
                  </>
                )}

                {lt.unsupported.length > 0 && (
                  <p className="text-[10px] text-zinc-600 mt-3">
                    Sem composição: {lt.unsupported.join(", ")}
                  </p>
                )}
              </div>
            );
          })()}

          {(!composicao?.look_through || composicao.look_through.supported.length === 0) && (
            <div className="glass-card p-5 text-center">
              <p className="text-zinc-500 text-sm mb-3">Nenhuma composição de ETF disponível.</p>
              <button
                onClick={async () => {
                  setEtfRefreshing(true);
                  try {
                    const res = await fetch(`${API_URL}/api/composicao/etf-refresh`, { method: "POST" });
                    if (res.ok) {
                      const j = await res.json();
                      if (!j.saved_to_sheets) alert(j.warning ?? "Holdings atualizados mas não persistidos na planilha.");
                      bumpDataVersion();
                      const fresh = await fetch(withDataVersion(`${API_URL}/api/composicao/resumo`));
                      if (fresh.ok) setComposicao(await fresh.json());
                    }
                  } catch { /* ignore */ }
                  setEtfRefreshing(false);
                }}
                disabled={etfRefreshing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-emerald-700/50 text-emerald-400 hover:bg-emerald-600/10 transition-all"
              >
                <RefreshCw size={13} className={etfRefreshing ? "animate-spin" : ""} />
                {etfRefreshing ? "Buscando composições…" : "Buscar Composições ao Vivo"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
           TAB: CAIXA
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "caixa" && (
        <CaixaManager fx={composicao?.fx} />
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

function inferJurisdicao(corretora: string): string {
  const c = corretora.toLowerCase();
  if (c.includes("ibkr") || c.includes("interactive") || c.includes("td ") || c.includes("schwab") || c.includes("robinhood") || c.includes("fidelity")) return "EUA";
  if (c.includes("b3") || c.includes("xp") || c.includes("rico") || c.includes("btg") || c.includes("nuinvest") || c.includes("clear") || c.includes("inter") || c.includes("itaú") || c.includes("bradesco") || c.includes("avenue")) return "Brasil";
  if (c.includes("degiro") || c.includes("saxo") || c.includes("etoro")) return "Europa";
  if (c.includes("binance") || c.includes("coinbase") || c.includes("kraken") || c.includes("mercado bitcoin") || c.includes("bybit")) return "Cripto (global)";
  return "Outro";
}

// ── Caixa Manager ───────────────────────────────────────────────────────────

interface CaixaPos {
  ticker: string;
  atual: number;
  moeda: string;
}

function CaixaManager({ fx }: { fx?: { USDBRL: number; EURBRL: number; CADBRL: number; GBPBRL: number } }) {
  const [positions, setPositions] = useState<CaixaPos[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/renda-fixa/caixa")
      .then(r => r.json())
      .then(d => setPositions(d.caixa ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const update = (idx: number, field: keyof CaixaPos, value: string | number) => {
    setPositions(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    setDirty(true);
    setMessage(null);
  };

  const add = () => {
    setPositions(prev => [...prev, { ticker: "CAIXA", atual: 0, moeda: "BRL" }]);
    setDirty(true);
    setMessage(null);
  };

  const remove = (idx: number) => {
    setPositions(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/renda-fixa/caixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      const d = await res.json();
      if (res.ok) {
        setDirty(false);
        setMessage({ type: "ok", text: `Salvo — ${d.saved} posição(ões) de caixa. Recalculando…` });
        // Invalida o CDN cache (cotacoes/composicao/performance) e recarrega
        // para o novo caixa entrar nos cálculos imediatamente.
        bumpDataVersion();
        setTimeout(() => window.location.reload(), 900);
      } else {
        setMessage({ type: "err", text: d.error ?? "Erro ao salvar" });
      }
    } catch {
      setMessage({ type: "err", text: "Erro de rede" });
    }
    setSaving(false);
  };

  const fxRates: Record<string, number> = {
    BRL: 1,
    USD: fx?.USDBRL ?? 1,
    EUR: fx?.EURBRL ?? 1,
    CAD: fx?.CADBRL ?? 1,
    GBP: fx?.GBPBRL ?? 1,
  };
  const toBRL = (val: number, moeda: string) => val * (fxRates[moeda] ?? 1);
  const totalBRL = positions.reduce((s, p) => s + toBRL(p.atual, p.moeda), 0);

  if (loading) {
    return (
      <div className="glass-card p-8 text-center animate-fade-in">
        <Loader2 size={20} className="animate-spin text-zinc-500 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Caixa / Liquidez</h2>
            <span className="text-xs text-zinc-500">({positions.length})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={add}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", color: "#4ade80" }}
            >
              <Plus size={12} /> Adicionar
            </button>
            <button
              onClick={save}
              disabled={!dirty || saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-40"
              style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-zinc-600">Nenhuma posição de caixa</p>
            <p className="text-[10px] text-zinc-700 mt-1">Clique em &quot;Adicionar&quot; para criar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Nome</th>
                  <th className="text-left py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Moeda</th>
                  <th className="text-right py-2 px-2 text-zinc-600 font-semibold uppercase tracking-wider text-[9px]">Valor</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p, i) => (
                  <tr key={i} className="border-b border-zinc-900 hover:bg-white/[0.02]">
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={p.ticker}
                        onChange={e => update(i, "ticker", e.target.value)}
                        className="bg-transparent text-xs text-zinc-200 font-semibold outline-none border-b border-transparent focus:border-emerald-400/30 w-full transition-colors"
                        placeholder="CAIXA"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={p.moeda}
                        onChange={e => update(i, "moeda", e.target.value)}
                        className="bg-transparent text-xs text-zinc-400 outline-none cursor-pointer"
                      >
                        <option value="BRL">BRL</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                        <option value="CAD">CAD</option>
                        <option value="JPY">JPY</option>
                        <option value="CHF">CHF</option>
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        value={p.atual || ""}
                        onChange={e => update(i, "atual", Number(e.target.value))}
                        className="bg-transparent text-xs text-zinc-200 font-mono text-right outline-none border-b border-transparent focus:border-emerald-400/30 w-full transition-colors"
                        placeholder="0.00"
                        min={0}
                        step={0.01}
                      />
                      {p.moeda !== "BRL" && p.atual > 0 && (
                        <div className="text-[9px] text-zinc-600 text-right mt-0.5">≈ {compactBRL(toBRL(p.atual, p.moeda))}</div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <button onClick={() => remove(i)} className="text-zinc-700 hover:text-red-400 transition-colors p-0.5">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-800 font-semibold">
                  <td className="py-2.5 px-2 text-zinc-300" colSpan={2}>Total</td>
                  <td className="py-2.5 px-2 text-right text-zinc-200 font-mono">{compactBRL(totalBRL)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {message && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-[10px] font-semibold ${message.type === "ok" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20" : "bg-red-400/10 text-red-400 border border-red-400/20"}`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="glass-card p-4">
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Posições de caixa são lidas da aba <strong className="text-zinc-500">fixa_aberta</strong> da planilha.
          Tickers reconhecidos como caixa: CAIXA, SALDO, CASH, RESERVA.
          Ao salvar, apenas as linhas de caixa são atualizadas — posições de renda fixa não são alteradas.
        </p>
      </div>
    </div>
  );
}
