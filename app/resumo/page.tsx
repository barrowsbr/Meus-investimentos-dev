"use client";

// Página Resumo — orquestração (estado, fetches e memos). Os blocos de UI
// foram extraídos para components/resumo/* (refatoração mecânica, sem mudança
// de comportamento).

import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  PieChart as PieIcon,
  Briefcase,
  Building2, Loader2,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { withDataVersion } from "@/lib/data-version";
import { shortMonth } from "@/lib/format";
import { isRendaVariavel } from "@/lib/sectors";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import {
  sectorEconColor, formatComputedAt,
  type ComposicaoData, type SetoresApiData, type HistoricoData,
} from "@/components/resumo/shared";
import DreCard from "@/components/resumo/DreCard";
import AlocacaoHeaderCard from "@/components/resumo/AlocacaoHeaderCard";
import MapaCarteiraCard from "@/components/resumo/MapaCarteiraCard";
import MapaSetorialCard from "@/components/resumo/MapaSetorialCard";
import DetalhamentoSetorCard from "@/components/resumo/DetalhamentoSetorCard";
import CambioCustodiaRow from "@/components/resumo/CambioCustodiaRow";
import TopPosicoesIndustriasRow from "@/components/resumo/TopPosicoesIndustriasRow";
import ParetoCard from "@/components/resumo/ParetoCard";
import CustodiaRisk from "@/components/resumo/CustodiaRisk";
import PosicoesHistoricasCard from "@/components/resumo/PosicoesHistoricasCard";
import PosicoesAtuaisCard from "@/components/resumo/PosicoesAtuaisCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "alocacao" | "custodia" | "posicoes";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "alocacao", label: "Alocação", icon: <PieIcon size={14} /> },
  { id: "custodia", label: "Corretoras", icon: <Building2 size={14} /> },
  { id: "posicoes", label: "Posições", icon: <Briefcase size={14} /> },
];

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
  const [dreExpanded, setDreExpanded] = useState(false);
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
  const [histData, setHistData] = useState<HistoricoData | null>(null);
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

  // Setores agora vive DENTRO da aba Alocação (fusão) — carrega junto com ela.
  useEffect(() => {
    if (activeTab === "alocacao" && !setoresData && !setoresLoading) {
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

  // (A pizza "Setores" da aba Alocação saiu na fusão — o treemap e o
  //  Detalhamento por Setor, canônicos via /api/portfolio/sectors, a substituem.)

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

  // Estatísticas setoriais (concentração, HHI) — compartilhadas pelos blocos da
  // aba Alocação fundida.
  const setoresStats = useMemo(() => {
    if (!activeSetoresData) return null;
    const sorted = [...activeSetoresData.sectors].sort((a, b) => b.pct - a.pct);
    const top3 = sorted.slice(0, 3).reduce((s, x) => s + x.pct, 0);
    const top5 = sorted.slice(0, 5).reduce((s, x) => s + x.pct, 0);
    const hhi = sorted.reduce((s, x) => s + (x.pct / 100) ** 2, 0);
    return { sorted, top3, top5, effN: hhi > 0 ? 1 / hhi : 0 };
  }, [activeSetoresData]);

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

  return (
    <>
      <PageHeader
        title="Resumo"
        description={composicao?.computed_at ? `Atualizado ${formatComputedAt(composicao.computed_at)}` : "Visão geral dos seus investimentos"}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
           DRE — Demonstrativo de Resultados
         ═══════════════════════════════════════════════════════════════════════ */}
      <DreCard
        data={data}
        rfData={rfData}
        composicao={composicao}
        dreExpanded={dreExpanded}
        setDreExpanded={setDreExpanded}
        rvLens={rvLens}
        setRvLens={setRvLens}
        avgMonthlyDividend={avgMonthlyDividend}
        totalInvestidoRV={totalInvestidoRV}
        rvPositions={rvPositions}
      />

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
          {/* ── Cabeçalho da alocação: lente Padrão × ETFs abertos + métricas ── */}
          {(setoresLoading || (sectorConsolidated && setoresLtLoading)) && !activeSetoresData && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
              <Loader2 size={14} className="animate-spin" /> Carregando visão setorial…
            </div>
          )}
          {activeSetoresData && setoresStats && (
            <AlocacaoHeaderCard
              sd={activeSetoresData}
              setoresStats={setoresStats}
              sectorConsolidated={sectorConsolidated}
              setSectorConsolidated={setSectorConsolidated}
              setoresLtLoading={setoresLtLoading}
              ltMeta={setoresLtData?.lookthrough}
            />
          )}

          {/* Sunburst + Sidebar */}
          {sunburstData && sunburstData.level1.length > 0 && (
            <MapaCarteiraCard
              sunburstData={sunburstData}
              nestedMiddle={nestedMiddle}
              nestedOuter={nestedOuter}
              selectedClass={selectedClass}
              selectedSector={selectedSector}
              setSelectedClass={setSelectedClass}
              setSelectedSector={setSelectedSector}
            />
          )}

          {/* ── Mapa setorial (treemap) — respeita a lente ETFs abertos ── */}
          {sectorTreemapData.length > 0 && (
            <MapaSetorialCard data={sectorTreemapData} sectorConsolidated={sectorConsolidated} />
          )}

          {/* ── Detalhamento por setor (expande até o ativo) ── */}
          {activeSetoresData && (
            <DetalhamentoSetorCard
              sd={activeSetoresData}
              expandedSectors={expandedSectors}
              setExpandedSectors={setExpandedSectors}
            />
          )}

          {/* Currency + Custody row */}
          <CambioCustodiaRow
            filteredExposicao={filteredExposicao}
            currencyTotal={currencyTotal}
            custodia={composicao?.custodia}
          />

          {/* ── Top posições + Top indústrias ── */}
          {activeSetoresData && (
            <TopPosicoesIndustriasRow sd={activeSetoresData} sectorIndustryBreakdown={sectorIndustryBreakdown} />
          )}

          {/* Pareto */}
          {filteredPareto.length > 0 && (
            <ParetoCard
              filteredPareto={filteredPareto}
              pareto={composicao?.pareto}
              setoresStats={setoresStats}
              activeSetoresData={activeSetoresData}
            />
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
           TAB: POSIÇÕES
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "posicoes" && (
        <div className="space-y-5 animate-fade-in">

          {/* ── Posições Históricas — Consulta por Data ── */}
          <PosicoesHistoricasCard
            histDate={histDate}
            setHistDate={setHistDate}
            histLoading={histLoading}
            histData={histData}
            histError={histError}
            fetchHistorico={fetchHistorico}
          />

          {/* Positions table */}
          <PosicoesAtuaisCard
            filteredPositions={filteredPositions}
            posicoesRFManual={posicoesRFManual}
            activeFilter={activeFilter}
          />

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
