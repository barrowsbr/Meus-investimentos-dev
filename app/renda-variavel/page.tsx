"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, TrendingDown, Briefcase, Target, ArrowLeftRight,
  BarChart2, StickyNote,
} from "lucide-react";
import { usePortfolio, useSheetData } from "@/lib/hooks";
import { brl, compactBRL, pct } from "@/lib/format";
import { isRendaVariavel } from "@/lib/sectors";
import MetricCard from "@/components/MetricCard";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import NotesModal from "@/components/NotesModal";
import AssetLogo from "@/components/AssetLogo";
import AssetDetailModal from "@/components/AssetDetailModal";
import { displayName } from "@/lib/asset-brands";
import type { Position } from "@/lib/portfolio";

type ViewFilter = "carteira" | "todos" | "vendidos";

// Opções de ordenação da grade de cards (substitui os cabeçalhos clicáveis).
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "valorAtualBRL", label: "Valor atual" },
  { key: "lucroBRL", label: "Lucro" },
  { key: "lucroPct", label: "Valorização %" },
  { key: "retornoTotalPct", label: "Retorno total %" },
  { key: "dayChangePct", label: "Variação no dia %" },
  { key: "ticker", label: "Ticker (A–Z)" },
  { key: "setor", label: "Setor" },
];

type SortKey = "ticker" | "setor" | "valorAtualBRL" | "lucroBRL" | "lucroPct" | "retornoTotalPct" | "retornoAnualizadoPct" | "dayChangePct" | "dayChangeBRL" | "ganhoAtivoBRL" | "ganhoCambioBRL";
type SortDir = "asc" | "desc";

function sortPositions(positions: Position[], key: SortKey, dir: SortDir): Position[] {
  return [...positions].sort((a, b) => {
    const av = (a[key] ?? 0) as number | string;
    const bv = (b[key] ?? 0) as number | string;
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

interface Transaction {
  data: string;
  tipo: string;
  ticker: string;
  quantidade: number;
  preco: number;
  valorBruto: number;
  moeda: string;
  corretora: string;
  taxas?: number;
}

function parseTransactions(rows: Record<string, unknown>[]): Transaction[] {
  return rows.map(row => {
    const dataRaw = String(row["data"] ?? row["Data"] ?? "");
    const tipo = String(row["tipo de transação"] ?? row["tipo de transacao"] ?? row["tipo_transacao"] ?? row["Tipo de transação"] ?? "");
    const ticker = String(row["símbolo"] ?? row["simbolo"] ?? row["ticker"] ?? row["Símbolo"] ?? "").toUpperCase().trim();
    const quantidade = Number(String(row["quantidade"] ?? row["Quantidade"] ?? "0").replace(",", ".")) || 0;
    const preco = Number(String(row["preço"] ?? row["preco"] ?? row["Preço"] ?? "0").replace(",", ".")) || 0;
    const valorBruto = Number(String(row["valor bruto"] ?? row["valor_bruto"] ?? row["Valor bruto"] ?? "0").replace(",", ".")) || 0;
    const taxas = Number(String(row["taxa de corretagem"] ?? row["taxas"] ?? row["taxa"] ?? "0").replace(",", ".")) || 0;
    const moeda = String(row["moeda"] ?? row["Moeda"] ?? "BRL").toUpperCase().trim();
    const corretora = String(row["corretora"] ?? row["Corretora"] ?? "");
    return { data: dataRaw, tipo, ticker, quantidade, preco, valorBruto: valorBruto || quantidade * preco, moeda, corretora, taxas };
  }).filter(t => t.ticker && t.quantidade > 0);
}

// Preço na moeda nativa do ativo (para "preço atual" e "preço médio" nos cards).
const MOEDA_SYM: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€", CAD: "C$", GBP: "£" };
function fmtMoeda(v: number | null | undefined, moeda: string): string {
  if (v == null || !isFinite(v)) return "—";
  const sym = MOEDA_SYM[moeda] ?? `${moeda} `;
  const dec = Math.abs(v) >= 1000 ? 0 : 2;
  return `${sym} ${v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

// País do ativo — inferido pelo sufixo de bolsa (estilo Yahoo) e pela moeda.
const PAIS_POR_SUFIXO: Record<string, string> = {
  SA: "Brasil", TO: "Canadá", DE: "Alemanha", AS: "Holanda", PA: "França",
  MI: "Itália", MC: "Espanha", LS: "Portugal", L: "Reino Unido",
};
function paisDoAtivo(ticker: string, setor: string, moeda: string): string {
  if (setor === "Cripto") return "Global";
  const t = ticker.toUpperCase().trim();
  const suf = t.match(/\.([A-Z]{1,2})$/)?.[1] ?? "";
  if (PAIS_POR_SUFIXO[suf]) return PAIS_POR_SUFIXO[suf];
  if (moeda === "BRL" || /^[A-Z]{4}\d{1,2}$/.test(t)) return "Brasil";
  return "EUA";
}

function parseDateSort(raw: string): number {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(raw).getTime();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}`).getTime();
  return 0;
}

export default function RendaVariavelPage() {
  const { data, loading, error } = usePortfolio();
  const { data: rawTx } = useSheetData("meus_ativos");
  const [sortKey, setSortKey] = useState<SortKey>("valorAtualBRL");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const router = useRouter();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [view, setView] = useState<ViewFilter>("carteira");
  // Rastreia se o card foi aberto via deep-link da Home: nesse caso, ao fechar,
  // volta pra Home (router.back). Se foi aberto clicando na própria RV, só fecha.
  const openedFromHome = useRef(false);
  // Deep-link: /renda-variavel?ticker=XXXX abre o card do ativo direto (vindo da Home).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("ticker");
    if (t) { setSelectedTicker(t); openedFromHome.current = true; }
  }, []);
  const closeAssetModal = () => {
    if (openedFromHome.current) { openedFromHome.current = false; router.back(); }
    else setSelectedTicker(null);
  };
  const [notesTicker, setNotesTicker] = useState<string | null>(null);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  const metrics = useMemo(() => {
    if (!data) return null;
    const rv = data.positions.filter((p) => isRendaVariavel(p.setor));

    const totalInvestido = rv.reduce((s, p) => s + p.custoTotalBRL, 0);
    const totalAtual = data.rvPatrimonioBRL;
    const dayChangeBRL = data.dayChangeTotalBRL ?? 0;
    const ganhoAtivoPuro = data.ganhoAtivoPuroTotalBRL ?? 0;
    const fxPrincipal = data.ganhoFXPrincipalTotalBRL ?? 0;
    const fxCruzado = data.ganhoCruzadoTotalBRL ?? 0;
    const ganhoCambio = fxPrincipal + fxCruzado;

    // Daily P&L summary
    const posGanhadoras = rv.filter(p => (p.dayChangePct ?? 0) > 0).length;
    const posPerdedoras = rv.filter(p => (p.dayChangePct ?? 0) < 0).length;

    return {
      rv, totalInvestido, totalAtual, dayChangeBRL, ganhoAtivoPuro, ganhoCambio,
      fxPrincipal, fxCruzado, posGanhadoras, posPerdedoras,
    };
  }, [data]);

  // Posições encerradas (vendidas) de RV — vêm separadas do snapshot p/ não
  // poluir patrimônio/métricas. Só aparecem na tabela nos filtros Todos/Vendidos.
  const closedRV = useMemo(
    () => (data?.closedPositions ?? []).filter((p) => isRendaVariavel(p.setor)),
    [data]
  );

  // Filtros da grade: setor/segmento, moeda e país (inferido do ticker).
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroMoeda, setFiltroMoeda] = useState("todos");
  const [filtroPais, setFiltroPais] = useState("todos");

  const viewRows = useMemo(() => {
    if (!metrics) return [];
    if (view === "vendidos") return closedRV;
    if (view === "todos") return [...metrics.rv, ...closedRV];
    return metrics.rv;
  }, [metrics, closedRV, view]);

  const filtroOpcoes = useMemo(() => {
    const setores = new Map<string, number>();
    const moedas = new Map<string, number>();
    const paises = new Map<string, number>();
    for (const p of viewRows) {
      setores.set(p.setor, (setores.get(p.setor) ?? 0) + 1);
      const m = p.moeda ?? "BRL";
      moedas.set(m, (moedas.get(m) ?? 0) + 1);
      const pais = paisDoAtivo(p.ticker, p.setor, m);
      paises.set(pais, (paises.get(pais) ?? 0) + 1);
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { setores: sorted(setores), moedas: sorted(moedas), paises: sorted(paises) };
  }, [viewRows]);

  const tableRows = useMemo(() => {
    const filtered = viewRows.filter((p) => {
      if (filtroSetor !== "todos" && p.setor !== filtroSetor) return false;
      if (filtroMoeda !== "todos" && (p.moeda ?? "BRL") !== filtroMoeda) return false;
      if (filtroPais !== "todos" && paisDoAtivo(p.ticker, p.setor, p.moeda ?? "BRL") !== filtroPais) return false;
      return true;
    });
    return sortPositions(filtered, sortKey, sortDir);
  }, [viewRows, filtroSetor, filtroMoeda, filtroPais, sortKey, sortDir]);

  // Contagem de anotações por ticker (1 fetch) — para o badge no botão.
  useEffect(() => {
    let alive = true;
    fetch("/api/notas")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { ticker: string }[]) => {
        if (!alive || !Array.isArray(list)) return;
        const counts: Record<string, number> = {};
        for (const n of list) {
          const t = String(n.ticker ?? "").toUpperCase();
          if (t) counts[t] = (counts[t] ?? 0) + 1;
        }
        setNoteCounts(counts);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Memoizado: passado como prop ao modal. Sem isso, mudaria a cada render e
  // dispararia o useEffect de carga do modal em loop infinito (travava a UI).
  const handleNoteCount = React.useCallback((ticker: string, count: number) => {
    setNoteCounts((prev) => ({ ...prev, [ticker.toUpperCase()]: count }));
  }, []);
  const closeNotes = React.useCallback(() => setNotesTicker(null), []);

  const txByTicker = useMemo(() => {
    const map: Record<string, Transaction[]> = {};
    for (const tx of parseTransactions(rawTx)) {
      if (!map[tx.ticker]) map[tx.ticker] = [];
      map[tx.ticker].push(tx);
    }
    for (const arr of Object.values(map)) {
      arr.sort((a, b) => parseDateSort(b.data) - parseDateSort(a.data));
    }
    return map;
  }, [rawTx]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="cotacoes" />;
  if (!data || !metrics) return <ErrorAlert message="Dados não disponíveis" />;

  const hasUSD = metrics.rv.some(p => p.moeda !== "BRL");
  const selected = selectedTicker ? tableRows.find(p => p.ticker === selectedTicker) ?? null : null;

  return (
    <>
      <PageHeader
        title="Renda Variável"
        description="Análise completa de posições RV — variação diária, FX e setores"
      />

      {/* Net = bruto − dívida margin: contexto de alavancagem quando houver margem aberta */}
      {data.alavancagem.dividaBRL > 0 && (
        <div className="glass-card px-4 py-2.5 mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs border-amber-500/15">
          <span className="text-zinc-500">Net (patrimônio real): <span className="text-emerald-400 font-bold">{compactBRL(data.alavancagem.netBRL)}</span></span>
          <span className="text-zinc-500">Bruto: <span className="text-zinc-300 font-semibold">{compactBRL(data.totalPatrimonioBRL)}</span></span>
          <span className="text-zinc-500">Margin: <span className="text-red-400 font-semibold">−{compactBRL(data.alavancagem.dividaBRL)}</span></span>
          <span className="text-zinc-500">Alavancagem: <span className="text-amber-400 font-semibold">{data.alavancagem.alavancagemPct.toFixed(1)}%</span></span>
        </div>
      )}

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="animate-fade-in">
          <MetricCard
            label="Investido (RV)"
            value={compactBRL(metrics.totalInvestido)}
            sub={`${metrics.rv.length} ativos · PM do dólar`}
            icon={<Briefcase size={18} />}
            glowColor="#E8A33D"
          />
        </div>
        <div className="animate-fade-in animate-delay-1">
          <MetricCard
            label="Valor Atual"
            value={compactBRL(metrics.totalAtual)}
            sub={pct(data.lucroPct)}
            icon={<Target size={18} />}
            trend={data.lucroBRL >= 0 ? "up" : "down"}
            glowColor="#3b82f6"
          />
        </div>
        <div className="animate-fade-in animate-delay-2">
          <MetricCard
            label="Lucro Não Realizado"
            value={brl(data.lucroBRL)}
            sub={`Valoriz. ${pct(data.lucroPct)} · Ret.Tot. ${pct(data.retornoTotalRVPct ?? 0)}`}
            icon={data.lucroBRL >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
            trend={data.lucroBRL >= 0 ? "up" : "down"}
            glowColor={data.lucroBRL >= 0 ? "#4ade80" : "#f87171"}
          />
        </div>
        <div className="animate-fade-in animate-delay-3">
          <MetricCard
            label="Variação Hoje"
            value={brl(metrics.dayChangeBRL)}
            sub={`${pct(data.dayChangeTotalPct ?? 0)} · ${metrics.posGanhadoras}↑ ${metrics.posPerdedoras}↓`}
            icon={<BarChart2 size={18} />}
            trend={metrics.dayChangeBRL >= 0 ? "up" : "down"}
            glowColor={metrics.dayChangeBRL >= 0 ? "#4ade80" : "#f87171"}
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-4">
          <MetricCard
            label="Ganho Ativo (ex-câmbio)"
            value={brl(metrics.ganhoAtivoPuro)}
            sub="Valorização ao câmbio de compra"
            icon={<TrendingUp size={18} />}
            trend={metrics.ganhoAtivoPuro >= 0 ? "up" : "down"}
            glowColor="#06b6d4"
            compact
          />
        </div>
        <div className="animate-fade-in animate-delay-5">
          <MetricCard
            label="Efeito Câmbio"
            value={brl(metrics.ganhoCambio)}
            sub={`Principal ${brl(metrics.fxPrincipal)} · Cruzado ${brl(metrics.fxCruzado)}`}
            icon={<ArrowLeftRight size={18} />}
            trend={metrics.ganhoCambio >= 0 ? "up" : "down"}
            glowColor="#10b981"
            compact
          />
        </div>
      </div>

      {/* FX bar when has USD */}
      {hasUSD && data.cambio && (
        <div className="glass-card p-4 mb-6 animate-fade-in">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div>
              <span className="text-zinc-500">Spot USD/BRL</span>
              <span className="text-zinc-200 font-semibold ml-2">R$ {data.usdbrl.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-zinc-500">PM Dólar</span>
              <span className="text-accent font-semibold ml-2">R$ {data.cambio.pmDolar.toFixed(4)}</span>
            </div>
            {data.ptax && (
              <div>
                <span className="text-zinc-500">PTAX ({data.ptax.data})</span>
                <span className="text-purple-400 font-semibold ml-2">R$ {data.ptax.USDBRL.toFixed(4)}</span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Fonte FX</span>
              <span className="text-zinc-300 font-medium ml-2">{data.fxSource}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Position Table ── */}
      <div className="glass-card p-5 animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="section-title mb-0">Posições — Renda Variável</h2>
          {/* Filtro: em carteira (padrão) · todos os ativos já comprados · só vendidos */}
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--line)" }}>
            {([
              { id: "carteira" as ViewFilter, label: "Em carteira", count: metrics.rv.length },
              { id: "todos" as ViewFilter, label: "Todos", count: metrics.rv.length + closedRV.length },
              { id: "vendidos" as ViewFilter, label: "Vendidos", count: closedRV.length },
            ]).map((opt) => {
              const active = view === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setView(opt.id)}
                  className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#0a0a0a" : "var(--muted)",
                  }}
                >
                  {opt.label}
                  <span className="ml-1.5 opacity-70 font-mono">{opt.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Resumo da carteira (substitui o antigo rodapé da tabela) + ordenação */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs mb-4 pb-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <span style={{ color: "var(--muted)" }}>Total RV <span className="font-bold" style={{ color: "var(--text)" }}>{brl(data.rvPatrimonioBRL)}</span></span>
          <span style={{ color: "var(--muted)" }}>Lucro <span className={`font-bold ${data.lucroBRL >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.lucroBRL)} ({pct(data.lucroPct)})</span></span>
          <span style={{ color: "var(--muted)" }}>Ret. total <span className={`font-bold ${(data.retornoTotalRVPct ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>{pct(data.retornoTotalRVPct ?? 0)}</span></span>
          <span style={{ color: "var(--muted)" }}>Hoje <span className={`font-bold ${(data.dayChangeTotalBRL ?? 0) >= 0 ? "text-positive" : "text-negative"}`}>{brl(data.dayChangeTotalBRL ?? 0)} ({pct(data.dayChangeTotalPct ?? 0)})</span></span>
          <div className="ml-auto flex items-center gap-1.5">
            <span style={{ color: "var(--muted)" }}>Ordenar</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="rounded-md px-2 py-1 text-xs outline-none"
              style={{ background: "var(--input, rgba(255,255,255,0.04))", border: "1px solid var(--line)", color: "var(--text)" }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="rounded-md px-2 py-1 text-xs font-bold"
              style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
              title={sortDir === "asc" ? "Crescente" : "Decrescente"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {/* Filtros — segmento, moeda e país (contagem em cada opção) */}
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
          {([
            { label: "Segmento", value: filtroSetor, set: setFiltroSetor, opts: filtroOpcoes.setores },
            { label: "Moeda", value: filtroMoeda, set: setFiltroMoeda, opts: filtroOpcoes.moedas },
            { label: "País", value: filtroPais, set: setFiltroPais, opts: filtroOpcoes.paises },
          ] as const).map((f) => (
            <label key={f.label} className="inline-flex items-center gap-1.5">
              <span style={{ color: "var(--muted)" }}>{f.label}</span>
              <select
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="rounded-md px-2 py-1 text-xs outline-none"
                style={{
                  background: "var(--input, rgba(255,255,255,0.04))",
                  border: `1px solid ${f.value !== "todos" ? "var(--accent)" : "var(--line)"}`,
                  color: f.value !== "todos" ? "var(--accent)" : "var(--text)",
                }}
              >
                <option value="todos">Todos</option>
                {f.opts.map(([nome, n]) => <option key={nome} value={nome}>{nome} ({n})</option>)}
              </select>
            </label>
          ))}
          {(filtroSetor !== "todos" || filtroMoeda !== "todos" || filtroPais !== "todos") && (
            <button
              onClick={() => { setFiltroSetor("todos"); setFiltroMoeda("todos"); setFiltroPais("todos"); }}
              className="rounded-md px-2 py-1 text-xs font-semibold"
              style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
            >
              Limpar × <span className="font-mono">{tableRows.length} de {viewRows.length}</span>
            </button>
          )}
        </div>

        {/* Grade de cards — logo + nome. Clicar abre o modal com TODAS as infos. */}
        {tableRows.length === 0 ? (
          <p className="text-sm italic py-8 text-center" style={{ color: "var(--muted)" }}>Nenhum ativo neste filtro.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {tableRows.map((p) => {
              const vendido = p.vendido === true;
              const nNotes = noteCounts[p.ticker.toUpperCase()] ?? 0;
              const dia = p.dayChangePct;
              return (
                <button
                  key={`${p.ticker}-${vendido ? "x" : "o"}`}
                  onClick={() => { setSelectedTicker(p.ticker); openedFromHome.current = false; }}
                  className={`group flex flex-col gap-2.5 p-3 rounded-xl text-left transition-all hover:-translate-y-0.5 ${vendido ? "opacity-75" : ""}`}
                  style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
                >
                  <div className="flex items-center gap-2.5 w-full min-w-0">
                    <AssetLogo ticker={p.ticker} name={displayName(p.ticker)} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate" style={{ color: "var(--text)" }}>{displayName(p.ticker)}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{p.ticker.replace(/\.SA$/, "")}</span>
                        {vendido && <span className="tag" style={{ backgroundColor: "rgba(113,113,122,0.18)", color: "#a1a1aa", fontSize: 9 }}>Vendido</span>}
                        {nNotes > 0 && <StickyNote size={10} style={{ color: "var(--accent)" }} />}
                      </div>
                    </div>
                  </div>
                  {/* Preço atual × preço médio, na moeda nativa do ativo */}
                  {!vendido && (
                    <div className="flex items-center justify-between w-full font-mono tabular-nums" style={{ fontSize: 10, color: "var(--muted)" }}>
                      <span className="inline-flex items-center gap-1" title="Preço atual">
                        {p.precoFonte && (
                          <span
                            title={p.precoFonte === "vivo" ? "Cotação ao vivo" : "Último fechamento (cotação ao vivo indisponível)"}
                            style={{
                              width: 6, height: 6, borderRadius: 9999, flexShrink: 0,
                              background: p.precoFonte === "vivo" ? "#22c55e" : "#f59e0b",
                              boxShadow: p.precoFonte === "vivo" ? "0 0 4px #22c55e88" : "none",
                            }}
                          />
                        )}
                        {fmtMoeda(p.precoAtual, p.quoteCurrency ?? p.moeda ?? "BRL")}
                      </span>
                      <span title="Preço médio de compra" style={{ color: "var(--faint)" }}>PM {fmtMoeda(p.custoMedio, p.moeda ?? "BRL")}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {vendido ? "Resultado" : brl(p.valorAtualBRL)}
                    </span>
                    <span className={`text-[11px] font-bold ${
                      vendido
                        ? ((p.lucroRealizadoBRL ?? 0) >= 0 ? "text-positive" : "text-negative")
                        : (dia !== null ? (dia >= 0 ? "text-positive" : "text-negative") : "text-zinc-500")
                    }`}>
                      {vendido ? brl(p.lucroRealizadoBRL) : (dia !== null ? pct(dia) : "—")}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <AssetDetailModal
          position={selected}
          txs={txByTicker[selected.ticker] ?? []}
          hasUSD={hasUSD}
          noteCount={noteCounts[selected.ticker.toUpperCase()] ?? 0}
          onOpenNotes={(t) => setNotesTicker(t)}
          onClose={closeAssetModal}
        />
      )}

      {notesTicker && (
        <NotesModal
          ticker={notesTicker}
          onClose={closeNotes}
          onCountChange={handleNoteCount}
        />
      )}
    </>
  );
}
