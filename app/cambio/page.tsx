"use client";

// Câmbio — reformulação total (ago/2026, pedido do dono): página única, sem
// abas, detalhe em POPUP (padrão das construções recentes: frase em português
// por número, chips, portal no body, bottom-sheet no celular).
//   1. Hero "a história do seu dólar" — PM real das remessas → spot → ganho;
//      popups: ledger da cadeia de conversão e PM × Spot × PTAX.
//   2. Cards por moeda (USD + 2ª camada) — clique abre o dossiê da moeda:
//      PM/cotação, remessas e as posições da carteira expostas a ela (com a
//      decomposição ativo × FX × cruzado por posição).
//   3. Exposição & risco — exposição por moeda no patrimônio, decomposição
//      de três fatores e UM teste de estresse (frase-resposta + slider).
//   4. Linha do tempo das remessas — VET por moeda (chips), linha do PM;
//      clique no ponto abre a remessa; tabela completa em popup.
// ZERO mudança de cálculo: tudo continua vindo do snapshot canônico
// (portfolio.cambio de lib/cambio.ts, exposicaoCambial, ganho*BRL por posição).

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, BarChart, Bar, Cell,
} from "recharts";
import { ArrowLeftRight, ArrowRight, BarChart3, Layers, Scale, X, Zap } from "lucide-react";
import { usePortfolio, useSheetData } from "@/lib/hooks";
import { fetchJsonCached } from "@/lib/client-cache";
import { toNumber, brl, formatDate, compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { getMoedaExposicao } from "@/lib/sectors";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const TOOLTIP_STYLE = {
  background: "#18181b", border: "1px solid #27272a", borderRadius: 12,
  color: "var(--text)", fontSize: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

const FX_COLORS: Record<string, string> = {
  USD: "#3b82f6", EUR: "#8b5cf6", CAD: "#f59e0b", GBP: "#10b981", CHF: "#06b6d4",
};
const FLAGS: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", CAD: "🇨🇦", CHF: "🇨🇭" };
const CCY_SYMBOL: Record<string, string> = { BRL: "R$", USD: "US$", EUR: "€", CAD: "C$", GBP: "£" };

const sign = (v: number) => (v >= 0 ? "+" : "");
const pct1 = (v: number) => `${sign(v)}${v.toFixed(1).replace(".", ",")}%`;

// Popup ativo (um por vez).
type Popup =
  | { t: "ledger" }
  | { t: "taxas" }
  | { t: "moeda"; m: string }
  | { t: "operacoes" }
  | { t: "remessa"; row: Record<string, unknown> }
  | null;

export default function CambioPage() {
  const { data: portfolio, loading: portLoading } = usePortfolio();
  const { data: rawData, loading: sheetLoading, error } = useSheetData("cambio");
  const [stressCustom, setStressCustom] = useState<number>(0);
  const [moedaGrafico, setMoedaGrafico] = useState<string>("USD");
  const [popup, setPopup] = useState<Popup>(null);
  // PTAX oficial na data de cada remessa (fase 2) — best-effort; sem ela os
  // popups só não mostram a linha do spread.
  const [ptaxRem, setPtaxRem] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetchJsonCached<{ porChave?: Record<string, number> }>("/api/cambio/ptax-remessas", 6 * 60 * 60_000)
      .then((d) => setPtaxRem(d?.porChave ?? {}))
      .catch(() => setPtaxRem({}));
  }, []);

  // Esc fecha o popup.
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPopup(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);

  // ── Leitura difusa das colunas da aba cambio (formatos variados) ──
  const fzGet = (row: Record<string, unknown>, ...keys: string[]): unknown => {
    for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    const rKeys = Object.keys(row);
    for (const p of keys) {
      const norm = p.replace(/[_\s]/g, "").toLowerCase();
      for (const k of rKeys) {
        if (k.replace(/[_\s]/g, "").toLowerCase() === norm && row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
      }
    }
    return null;
  };
  const rowOrigem = (r: Record<string, unknown>) => String(fzGet(r, "moeda_origem", "moeda origem", "de", "origem") ?? "BRL").toUpperCase();
  const rowDestino = (r: Record<string, unknown>) => String(fzGet(r, "moeda_destino", "moeda destino", "para", "destino") ?? "USD").toUpperCase();
  const rowTaxa = (r: Record<string, unknown>) => toNumber(fzGet(r, "taxa", "vet", "câmbio", "cambio", "rate"));
  const rowEnviado = (r: Record<string, unknown>) => fzGet(r, "valor_origem", "valor total entrada", "valor entrada", "valor_entrada", "valor enviado", "enviado");
  const rowRecebido = (r: Record<string, unknown>) => fzGet(r, "valor_destino", "valor total saída", "valor total saida", "valor saída", "valor_saida", "valor saida", "valor recebido", "recebido");
  const rowInstituicao = (r: Record<string, unknown>) => String(fzGet(r, "corretora", "corretora destino", "instituição", "instituicao") ?? "—");
  const rowDataISO = (r: Record<string, unknown>) => {
    const s = String(r["data"] ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : "";
  };
  // Spread da operação vs a PTAX oficial do dia (%; >0 = pagou acima da oficial).
  const spreadDe = (r: Record<string, unknown>): number | null => {
    if (!ptaxRem) return null;
    const taxa = rowTaxa(r);
    const oficial = ptaxRem[`${rowDataISO(r)}|${rowOrigem(r)}|${rowDestino(r)}`];
    return taxa && oficial && oficial > 0 ? (taxa / oficial - 1) * 100 : null;
  };

  const fmtVal = (val: unknown, moeda: string) => {
    const n = toNumber(val);
    if (n === null) return "—";
    const sym = CCY_SYMBOL[moeda] || moeda;
    return `${sym} ${Math.abs(n).toLocaleString(moeda === "BRL" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const columns = [
    { key: "data", label: "Data", render: (v: unknown) => formatDate(v) },
    { key: "moeda_origem", label: "De", render: (_v: unknown, row: Record<string, unknown>) => rowOrigem(row) },
    { key: "moeda_destino", label: "Para", render: (_v: unknown, row: Record<string, unknown>) => rowDestino(row) },
    { key: "valor_origem", label: "Enviado", align: "right" as const, render: (_v: unknown, row: Record<string, unknown>) => fmtVal(rowEnviado(row), rowOrigem(row)) },
    { key: "valor_destino", label: "Recebido", align: "right" as const, render: (_v: unknown, row: Record<string, unknown>) => fmtVal(rowRecebido(row), rowDestino(row)) },
    {
      key: "taxa", label: "Taxa/VET", align: "right" as const,
      render: (_v: unknown, row: Record<string, unknown>) => {
        const t = rowTaxa(row);
        if (!t) return "—";
        const sym = CCY_SYMBOL[rowOrigem(row)] || rowOrigem(row);
        return `${sym} ${t.toFixed(4)}/${rowDestino(row)}`;
      },
    },
    { key: "corretora", label: "Instituição", render: (_v: unknown, row: Record<string, unknown>) => rowInstituicao(row) },
  ];

  // ── Série VET por moeda de destino (linha do tempo) ──
  const fxSeries = useMemo(() => {
    const porMoeda = new Map<string, Array<{ data: string; taxa: number; row: Record<string, unknown> }>>();
    for (const r of rawData ?? []) {
      const dest = rowDestino(r);
      const taxa = rowTaxa(r) ?? 0;
      const data = String(r["data"] ?? "");
      if (dest === "BRL" || taxa <= 0 || !data) continue;
      const arr = porMoeda.get(dest) ?? [];
      arr.push({ data, taxa, row: r });
      porMoeda.set(dest, arr);
    }
    for (const arr of porMoeda.values()) arr.sort((a, b) => a.data.localeCompare(b.data));
    return porMoeda;
  }, [rawData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Exposição + 3 fatores (mesma conta canônica da antiga aba Exposição) ──
  const analysis = useMemo(() => {
    if (!portfolio) return null;
    const positions = portfolio.positions ?? [];
    const expo = portfolio.exposicaoCambial ?? {};
    const totalExpostoAtualBRL = Object.entries(expo)
      .filter(([k]) => k !== "BRL" && k !== "Cripto")
      .reduce((s, [, v]) => s + v, 0);

    const foreignPositions = positions.filter(p => {
      const me = getMoedaExposicao(p.setor, p.moeda);
      return me !== "BRL" && me !== "Cripto" && p.valorAtualBRL > 0;
    });

    type PosArray = typeof foreignPositions;
    const byMoeda: Record<string, { valorAtualBRL: number; custoTotalBRL: number; positions: PosArray }> = {};
    for (const p of foreignPositions) {
      const m = getMoedaExposicao(p.setor, p.moeda);
      if (!byMoeda[m]) byMoeda[m] = { valorAtualBRL: 0, custoTotalBRL: 0, positions: [] };
      byMoeda[m].valorAtualBRL += p.valorAtualBRL;
      byMoeda[m].custoTotalBRL += p.custoTotalBRL;
      byMoeda[m].positions.push(p);
    }
    for (const [moeda, valCanonical] of Object.entries(expo)) {
      if (moeda === "BRL" || moeda === "Cripto") continue;
      const posVal = byMoeda[moeda]?.valorAtualBRL ?? 0;
      if (valCanonical - posVal >= 1) {
        if (!byMoeda[moeda]) byMoeda[moeda] = { valorAtualBRL: 0, custoTotalBRL: 0, positions: [] };
        byMoeda[moeda].valorAtualBRL = valCanonical;
      }
    }

    const positionsOnlyBRL = foreignPositions.reduce((s, p) => s + p.valorAtualBRL, 0);
    const totalCustoBRL = foreignPositions.reduce((s, p) => s + p.custoTotalBRL, 0);
    const ganhoAtivoPuro = foreignPositions.reduce((s, p) => s + (p.ganhoAtivoPuroBRL ?? 0), 0);
    const ganhoFXPrincipal = foreignPositions.reduce((s, p) => s + (p.ganhoFXPrincipalBRL ?? 0), 0);
    const ganhoCruzado = foreignPositions.reduce((s, p) => s + (p.ganhoCruzadoBRL ?? 0), 0);
    const lucroTotal = positionsOnlyBRL - totalCustoBRL;
    const caixaFxBRL = totalExpostoAtualBRL - positionsOnlyBRL;

    return { foreignPositions, byMoeda, totalExpostoAtualBRL, totalCustoBRL, ganhoAtivoPuro, ganhoFXPrincipal, ganhoCruzado, lucroTotal, caixaFxBRL };
  }, [portfolio]);

  if (portLoading || sheetLoading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} tab="cambio" />;

  const cambio = portfolio?.cambio;
  const ptax = portfolio?.ptax;
  const spot = portfolio?.usdbrl ?? 0;
  if (!cambio || !analysis || !portfolio) return <LoadingSpinner />;

  const patrimonioBRL = portfolio.totalPatrimonioBRL ?? 0;
  const pctExpostoFx = patrimonioBRL > 0 ? (analysis.totalExpostoAtualBRL / patrimonioBRL) * 100 : 0;

  // Teste de estresse ÚNICO (sobre a exposição cambial total do patrimônio).
  const stressScenarios = [
    { label: "-30%", pctS: -30 }, { label: "-20%", pctS: -20 }, { label: "-10%", pctS: -10 },
    { label: "-5%", pctS: -5 }, { label: "Atual", pctS: 0 }, { label: "+5%", pctS: 5 },
    { label: "+10%", pctS: 10 }, { label: "+20%", pctS: 20 }, { label: "+30%", pctS: 30 },
    ...(stressCustom !== 0 ? [{ label: `${sign(stressCustom)}${stressCustom}%`, pctS: stressCustom }] : []),
  ]
    .sort((a, b) => a.pctS - b.pctS)
    .map(s => {
      const impacto = analysis.totalExpostoAtualBRL * (s.pctS / 100);
      return { ...s, newSpot: spot * (1 + s.pctS / 100), impacto, impactoPatrimonioPct: patrimonioBRL > 0 ? (impacto / patrimonioBRL) * 100 : 0 };
    });
  const cenarioFrase = stressScenarios.find(s => s.pctS === (stressCustom !== 0 ? stressCustom : -20));

  // Moedas do gráfico da linha do tempo (só as que têm remessa).
  const moedasGrafico = [...fxSeries.keys()].sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));
  const serieAtiva = fxSeries.get(moedaGrafico) ?? [];
  const pmDaMoeda = moedaGrafico === "USD" ? cambio.pmDolar : cambio.fx2.find(c => c.moeda === moedaGrafico)?.pmUSD ?? 0;
  const spotDaMoeda = moedaGrafico === "USD" ? spot : cambio.fx2.find(c => c.moeda === moedaGrafico)?.cotUSD ?? 0;
  const unidade = moedaGrafico === "USD" ? "R$/USD" : `USD/${moedaGrafico}`;

  // Fatores em % para a barra de proporção.
  const absPuro = Math.abs(analysis.ganhoAtivoPuro);
  const absFx = Math.abs(analysis.ganhoFXPrincipal);
  const absCz = Math.abs(analysis.ganhoCruzado);
  const absSoma = absPuro + absFx + absCz;
  const pctPuro = absSoma > 0 ? (absPuro / absSoma) * 100 : 33;
  const pctFx = absSoma > 0 ? (absFx / absSoma) * 100 : 34;
  const pctCz = 100 - pctPuro - pctFx;

  // Card de moeda (USD + fx2) — dados uniformes.
  const cardsMoeda = [
    {
      moeda: "USD", pm: cambio.pmDolar, cot: spot, delta: cambio.deltaPmUsd,
      posNativa: cambio.usdNet, ganhoBRL: cambio.ganhoUsdBRL, ganhoPct: cambio.ganhoUsdPct,
      unidade: "R$/USD", destaque: true,
    },
    ...cambio.fx2.map(c => ({
      moeda: c.moeda, pm: c.pmUSD, cot: c.cotUSD, delta: c.deltaUSD,
      posNativa: c.qtd, ganhoBRL: c.ganhoBRL, ganhoPct: c.ganhoPct,
      unidade: `USD/${c.moeda}`, destaque: false,
    })),
  ];

  // ── Popups (conteúdo) ──
  const renderPopup = () => {
    if (!popup) return null;
    let titulo = ""; let corpo: React.ReactNode = null;

    if (popup.t === "ledger") {
      titulo = "De onde vem o seu PM";
      corpo = (
        <div className="text-[12px]">
          <p className="text-zinc-500 mb-3 leading-relaxed">
            O USD é a conta intermediária: recebe os reais e distribui para as outras moedas. O PM de R$ {cambio.pmDolar.toFixed(4)} é o custo médio REAL de todas as remessas — é ele que o app usa como câmbio de custo (não a PTAX da data da compra).
          </p>
          <div className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-zinc-500">BRL enviado nas remessas</span>
              <span className="font-mono font-bold text-zinc-200">{brl(cambio.totalEnviadoBRL)}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <span className="text-zinc-500">＋ USD comprado</span>
              <span className="font-mono font-bold text-emerald-400">US$ {cambio.usdComprado.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            {cambio.fx2.map(c => (
              <div key={c.moeda} className="flex items-center justify-between py-1.5 border-b border-white/5">
                <span className="text-zinc-500">− Convertido → {c.moeda}</span>
                <span className="font-mono font-bold text-red-400">US$ {c.usdGasto.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <span className="font-bold text-zinc-100">= Saldo USD disponível</span>
              <span className="font-mono text-[14px] font-extrabold text-zinc-100">US$ {cambio.usdNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
          <p className="text-[10.5px] text-zinc-600 mt-3">
            Custo do saldo: {brl(cambio.brlCustoUsdNet)} · valor hoje: {brl(cambio.valorUsdHoje)} · {cambio.operacoes} operações em {cambio.numMoedas} moedas.
          </p>
        </div>
      );
    }

    if (popup.t === "taxas") {
      titulo = "PM × Spot × PTAX";
      const linhas = [
        { label: "Seu PM (custo real)", value: cambio.pmDolar, color: "#E8A33D" },
        { label: "Cotação agora", value: spot, color: "#3b82f6" },
        { label: `PTAX${ptax ? ` (${formatDate(ptax.data)})` : ""}`, value: ptax?.USDBRL ?? 0, color: "#8b5cf6" },
      ];
      const maxVal = Math.max(...linhas.map(l => l.value), 0.0001);
      corpo = (
        <div className="text-[12px]">
          <p className="text-zinc-500 mb-4 leading-relaxed">
            {cambio.deltaPmUsd >= 0
              ? <>Seu dólar médio custou <b className="text-amber-400">{cambio.deltaPmUsd.toFixed(1).replace(".", ",")}% menos</b> do que ele vale hoje — esse é o seu colchão cambial.</>
              : <>Seu dólar médio custou <b className="text-red-400">{Math.abs(cambio.deltaPmUsd).toFixed(1).replace(".", ",")}% mais</b> do que ele vale hoje.</>}
            {" "}A PTAX é a taxa oficial do BC usada na declaração de IR.
          </p>
          <div className="flex flex-col gap-3">
            {linhas.map(l => (
              <div key={l.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-zinc-500">{l.label}</span>
                  <span className="font-mono font-bold" style={{ color: l.color }}>{l.value > 0 ? `R$ ${l.value.toFixed(4)}` : "—"}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: `${l.color}20` }}>
                  <div className="h-full rounded-full" style={{ width: `${(l.value / maxVal) * 100}%`, background: l.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (popup.t === "moeda") {
      const m = popup.m;
      const card = cardsMoeda.find(c => c.moeda === m);
      const info = analysis.byMoeda[m];
      const remessas = (fxSeries.get(m) ?? []).slice().reverse();
      const color = FX_COLORS[m] ?? "#64748b";
      titulo = `${FLAGS[m] ?? "🌐"} ${m} — dossiê`;
      corpo = card && (
        <div className="text-[12px]">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[9.5px] text-zinc-600 uppercase tracking-wider mb-0.5">PM ({card.unidade})</div>
              <div className="font-mono font-bold text-zinc-300">{card.pm.toFixed(4)}</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[9.5px] text-zinc-600 uppercase tracking-wider mb-0.5">Cotação</div>
              <div className="font-mono font-bold text-zinc-100">{card.cot.toFixed(4)}</div>
              <div className={`text-[10px] font-semibold ${card.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct1(card.delta)} vs PM</div>
            </div>
            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="text-[9.5px] text-zinc-600 uppercase tracking-wider mb-0.5">Ganho cambial</div>
              <div className={`font-mono font-bold ${card.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{sign(card.ganhoBRL)}{compactBRL(card.ganhoBRL)}</div>
              <div className={`text-[10px] ${card.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct1(card.ganhoPct)}</div>
            </div>
          </div>

          {info && info.positions.length > 0 && (
            <>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">Posições expostas a {m}</p>
              <p className="text-[10.5px] text-zinc-600 mb-2">Ativo (azul) × câmbio (dourado) × cruzado (roxo) — a parte do resultado de cada papel que veio da moeda.</p>
              <div className="mb-4">
                <ResponsiveContainer width="100%" height={Math.max(120, Math.min(info.positions.length, 8) * 30 + 30)}>
                  <BarChart
                    data={info.positions.slice().sort((a, b) => b.valorAtualBRL - a.valorAtualBRL).slice(0, 8).map(p => ({
                      ticker: p.ticker.replace(/\.SA$/, ""),
                      ativo: p.ganhoAtivoPuroBRL ?? 0, fx: p.ganhoFXPrincipalBRL ?? 0, cruzado: p.ganhoCruzadoBRL ?? 0,
                    }))}
                    layout="vertical" barCategoryGap="24%">
                    <XAxis type="number" tick={{ fill: "#52525b", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => compactBRL(v)} />
                    <YAxis type="category" dataKey="ticker" tick={{ fill: "#a1a1aa", fontSize: 10 }} axisLine={false} tickLine={false} width={64} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                      formatter={(v: number, name: string) => [compactBRL(v), name === "ativo" ? "Ativo puro" : name === "fx" ? "Câmbio" : "Cruzado"]} />
                    <ReferenceLine x={0} stroke="#3f3f46" />
                    <Bar dataKey="ativo" stackId="a" fill="#3b82f6" maxBarSize={14} isAnimationActive={false} />
                    <Bar dataKey="fx" stackId="a" fill="#E8A33D" maxBarSize={14} isAnimationActive={false} />
                    <Bar dataKey="cruzado" stackId="a" fill="#a855f7" maxBarSize={14} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {remessas.length > 0 && (() => {
            // Spread médio vs PTAX, ponderado pelo tamanho de cada remessa.
            let somaPeso = 0, somaSpread = 0;
            for (const r of remessas) {
              const sp = spreadDe(r.row);
              const peso = toNumber(rowRecebido(r.row)) ?? 0;
              if (sp != null && peso > 0) { somaPeso += peso; somaSpread += sp * peso; }
            }
            const spreadMedio = somaPeso > 0 ? somaSpread / somaPeso : null;
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Remessas que formaram o PM</p>
                  {spreadMedio != null && (
                    <span className={`text-[10px] font-semibold ${spreadMedio <= 0.05 ? "text-emerald-400" : "text-amber-400"}`}>
                      custo médio vs PTAX: {sign(spreadMedio)}{spreadMedio.toFixed(1).replace(".", ",")}% (spread + IOF)
                    </span>
                  )}
                </div>
                <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
                  {remessas.map((r, i) => {
                    const sp = spreadDe(r.row);
                    return (
                      <li key={i}>
                        <button onClick={() => setPopup({ t: "remessa", row: r.row })}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                          style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                          <span className="text-zinc-400">{formatDate(r.data)}</span>
                          <span className="font-mono text-zinc-300">{fmtVal(rowRecebido(r.row), m)}</span>
                          <span className="font-mono" style={{ color }}>{r.taxa.toFixed(4)}</span>
                          {sp != null && (
                            <span className={`w-14 shrink-0 text-right font-mono text-[10px] ${sp <= 0.05 ? "text-emerald-400" : "text-amber-400"}`}>{sign(sp)}{sp.toFixed(1).replace(".", ",")}%</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            );
          })()}
        </div>
      );
    }

    if (popup.t === "operacoes") {
      titulo = `Todas as operações (${(rawData ?? []).length})`;
      corpo = <DataTable data={rawData} columns={columns} />;
    }

    if (popup.t === "remessa") {
      const r = popup.row;
      const orig = rowOrigem(r), dest = rowDestino(r);
      const taxa = rowTaxa(r);
      // Dois contextos: vs o SEU PM da moeda e vs a PTAX OFICIAL do dia.
      const pmRef = dest === "USD" ? cambio.pmDolar : cambio.fx2.find(c => c.moeda === dest)?.pmUSD ?? 0;
      const deltaPm = taxa && pmRef > 0 ? (taxa / pmRef - 1) * 100 : null;
      const oficial = ptaxRem?.[`${rowDataISO(r)}|${orig}|${dest}`] ?? null;
      const spread = taxa && oficial && oficial > 0 ? (taxa / oficial - 1) * 100 : null;
      titulo = `Remessa ${formatDate(String(r["data"] ?? ""))}`;
      corpo = (
        <div className="text-[12px]">
          <div className="mb-4 flex items-center justify-center gap-3 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-center">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">{orig}</div>
              <div className="font-mono text-[15px] font-bold text-zinc-200">{fmtVal(rowEnviado(r), orig)}</div>
            </div>
            <ArrowRight size={16} className="shrink-0 text-zinc-600" />
            <div className="text-center">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-0.5">{dest}</div>
              <div className="font-mono text-[15px] font-bold" style={{ color: FX_COLORS[dest] ?? "#e4e4e7" }}>{fmtVal(rowRecebido(r), dest)}</div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between"><span className="text-zinc-500">Taxa/VET</span><span className="font-mono font-bold text-zinc-200">{taxa ? `${(CCY_SYMBOL[orig] || orig)} ${taxa.toFixed(4)}/${dest}` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-zinc-500">Instituição</span><span className="text-zinc-300">{rowInstituicao(r)}</span></div>
            {oficial != null && (
              <div className="flex justify-between">
                <span className="text-zinc-500">PTAX oficial no dia</span>
                <span className="font-mono text-zinc-300">{oficial.toFixed(4)}</span>
              </div>
            )}
            {spread != null && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Custo da operação</span>
                <span className={`font-mono font-semibold ${spread <= 0.05 ? "text-emerald-400" : "text-amber-400"}`}>
                  {spread <= 0 ? `${Math.abs(spread).toFixed(2).replace(".", ",")}% ABAIXO da taxa oficial` : `${spread.toFixed(2).replace(".", ",")}% acima da oficial (spread + IOF)`}
                </span>
              </div>
            )}
            {deltaPm != null && (
              <div className="flex justify-between">
                <span className="text-zinc-500">vs seu PM de {dest}</span>
                <span className={`font-mono font-semibold ${deltaPm <= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {deltaPm <= 0 ? `${Math.abs(deltaPm).toFixed(1).replace(".", ",")}% mais barata que a sua média` : `${deltaPm.toFixed(1).replace(".", ",")}% mais cara que a sua média`}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }

    return createPortal(
      <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }} onClick={() => setPopup(null)}>
        <div className="flex w-full flex-col overflow-hidden shadow-2xl sm:max-w-lg"
          style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, maxHeight: "88vh", paddingBottom: "env(safe-area-inset-bottom)" }}
          onClick={ev => ev.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{titulo}</span>
            <button onClick={() => setPopup(null)} aria-label="Fechar" className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100" style={{ color: "var(--muted)" }}><X size={16} /></button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{corpo}</div>
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <>
      <PageHeader title="Câmbio" description="Remessas, preço médio do dólar e exposição cambial" />

      {/* ══ 1. Hero — a história do seu dólar ══ */}
      <div className="glass-card p-6 mb-5 animate-fade-in" style={{ borderColor: "rgba(59,130,246,0.12)" }}>
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-3">A história do seu dólar</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
          <span className="text-xl sm:text-2xl font-extrabold text-amber-400 font-mono">R$ {cambio.pmDolar.toFixed(2).replace(".", ",")}</span>
          <span className="text-zinc-600 text-sm">custo médio real</span>
          <ArrowRight size={18} className="text-zinc-600" />
          <span className="text-xl sm:text-2xl font-extrabold text-zinc-100 font-mono">R$ {spot.toFixed(2).replace(".", ",")}</span>
          <span className="text-zinc-600 text-sm">hoje</span>
          <span className={`text-xl sm:text-2xl font-extrabold font-mono ${cambio.deltaPmUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct1(cambio.deltaPmUsd)}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => setPopup({ t: "ledger" })} className="rounded-xl p-3 text-left transition-colors hover:bg-white/[0.05]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
            <span className="stat-label block mb-1">Enviado em remessas</span>
            <span className="text-sm font-bold text-zinc-200">{compactBRL(cambio.totalEnviadoBRL)}</span>
            <span className="block text-[10px] text-zinc-600 mt-0.5">{cambio.operacoes} operações · ver cadeia ›</span>
          </button>
          <button onClick={() => setPopup({ t: "ledger" })} className="rounded-xl p-3 text-left transition-colors hover:bg-white/[0.05]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
            <span className="stat-label block mb-1">Ganho cambial total</span>
            <span className={`text-sm font-bold ${cambio.ganhoTotal_BRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{sign(cambio.ganhoTotal_BRL)}{compactBRL(cambio.ganhoTotal_BRL)}</span>
            <span className="block text-[10px] text-zinc-600 mt-0.5">{pct1(cambio.ganhoTotalPct)} sobre o enviado ›</span>
          </button>
          <button onClick={() => setPopup({ t: "ledger" })} className="rounded-xl p-3 text-left transition-colors hover:bg-white/[0.05]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
            <span className="stat-label block mb-1">Saldo USD</span>
            <span className="text-sm font-bold text-zinc-200">US$ {cambio.usdNet.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
            <span className="block text-[10px] text-zinc-600 mt-0.5">comprado − convertido ›</span>
          </button>
          <button onClick={() => setPopup({ t: "taxas" })} className="rounded-xl p-3 text-left transition-colors hover:bg-white/[0.05]" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.2)" }}>
            <span className="stat-label block mb-1 flex items-center gap-1"><Scale size={11} /> PTAX{ptax ? ` (${formatDate(ptax.data).slice(0, 5)})` : ""}</span>
            <span className="text-sm font-bold text-purple-300">{ptax ? `R$ ${ptax.USDBRL.toFixed(4).replace(".", ",")}` : "—"}</span>
            <span className="block text-[10px] text-zinc-600 mt-0.5">PM × Spot × PTAX ›</span>
          </button>
        </div>
      </div>

      {/* ══ 2. Cards por moeda ══ */}
      <div className="mb-5">
        <h2 className="section-title mb-1"><Layers size={15} />Suas moedas</h2>
        <p className="text-[10.5px] text-zinc-600 mb-3">Toque numa moeda para o dossiê: remessas, PM e as posições da carteira expostas a ela.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cardsMoeda.map(c => {
            const color = FX_COLORS[c.moeda] ?? "#64748b";
            const fillPct = Math.min(Math.max((c.delta / 20 + 0.5) * 100, 2), 98);
            return (
              <button key={c.moeda} onClick={() => setPopup({ t: "moeda", m: c.moeda })}
                className={`glass-card p-4 text-left transition-transform hover:-translate-y-0.5 ${c.destaque ? "lg:col-span-2" : ""}`}
                style={{ borderColor: `${color}25` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{FLAGS[c.moeda] ?? "🌐"}</span>
                    <div>
                      <span className="text-sm font-bold" style={{ color }}>{c.moeda}</span>
                      <span className="block text-[9.5px] text-zinc-600">{c.destaque ? "conta intermediária" : "via USD"}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`block text-sm font-bold font-mono ${c.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{sign(c.ganhoBRL)}{compactBRL(c.ganhoBRL)}</span>
                    <span className={`text-[10px] ${c.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct1(c.ganhoPct)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10.5px] text-zinc-500 mb-1">
                  <span>PM {c.pm.toFixed(4)} → {c.cot.toFixed(4)} ({c.unidade})</span>
                  <span className={`font-semibold ${c.delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>{pct1(c.delta)}</span>
                </div>
                <div className="h-1 rounded-full relative overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="absolute top-0 left-0 h-full rounded-full opacity-80" style={{ width: `${fillPct}%`, backgroundColor: c.delta >= 0 ? "#34d399" : "#f87171" }} />
                  <div className="absolute top-0 left-1/2 h-full w-px" style={{ background: "rgba(255,255,255,0.2)" }} />
                </div>
                <div className="mt-2 text-[10px] text-zinc-600">
                  Posição: <span className="font-mono text-zinc-400">{(CCY_SYMBOL[c.moeda] || c.moeda)} {c.posNativa.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                  {analysis.byMoeda[c.moeda]?.positions.length ? ` · ${analysis.byMoeda[c.moeda].positions.length} ativos ›` : " ›"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══ 3. Exposição & risco ══ */}
      <div className="glass-card p-5 mb-5">
        <h2 className="section-title mb-1"><BarChart3 size={15} />Exposição & risco</h2>
        <p className="text-[11px] text-zinc-500 mb-4">
          <b className="text-zinc-300">{compactBRL(analysis.totalExpostoAtualBRL)}</b> — {pctExpostoFx.toFixed(1).replace(".", ",")}% do seu patrimônio ({compactBRL(patrimonioBRL)}) — está exposto a variação cambial{analysis.caixaFxBRL > 0 ? `, incluindo ${compactBRL(analysis.caixaFxBRL)} em caixa` : ""}.
        </p>

        {/* Barra de exposição por moeda */}
        {(() => {
          const entries = Object.entries(analysis.byMoeda).sort((a, b) => b[1].valorAtualBRL - a[1].valorAtualBRL);
          const totalFx = entries.reduce((s, [, v]) => s + v.valorAtualBRL, 0);
          const brlLivre = Math.max(patrimonioBRL - totalFx, 0);
          return (
            <div className="mb-5">
              <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                {entries.map(([m, v]) => (
                  <button key={m} onClick={() => setPopup({ t: "moeda", m })} title={`${m}: ${compactBRL(v.valorAtualBRL)}`}
                    style={{ width: `${patrimonioBRL > 0 ? (v.valorAtualBRL / patrimonioBRL) * 100 : 0}%`, background: FX_COLORS[m] ?? "#64748b" }} />
                ))}
                <div style={{ width: `${patrimonioBRL > 0 ? (brlLivre / patrimonioBRL) * 100 : 0}%`, background: "rgba(255,255,255,0.09)" }} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-zinc-500">
                {entries.map(([m, v]) => (
                  <span key={m} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: FX_COLORS[m] ?? "#64748b" }} />
                    {m} {patrimonioBRL > 0 ? ((v.valorAtualBRL / patrimonioBRL) * 100).toFixed(1).replace(".", ",") : 0}%
                  </span>
                ))}
                <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />BRL {patrimonioBRL > 0 ? ((brlLivre / patrimonioBRL) * 100).toFixed(1).replace(".", ",") : 0}%</span>
              </div>
            </div>
          );
        })()}

        {/* Três fatores */}
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5">De onde veio o resultado no exterior</p>
        <p className="text-[10.5px] text-zinc-600 mb-3">O lucro em reais se separa em três: o que o <b className="text-blue-400">ativo</b> rendeu (no câmbio de custo), o que o <b className="text-amber-400">câmbio</b> fez sobre o capital, e o <b className="text-purple-400">cruzado</b> (câmbio sobre o lucro do ativo).</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: "Ativo", v: analysis.ganhoAtivoPuro, cor: "#3b82f6" },
            { label: "Câmbio", v: analysis.ganhoFXPrincipal, cor: "#E8A33D" },
            { label: "Cruzado", v: analysis.ganhoCruzado, cor: "#a855f7" },
          ].map(f => (
            <div key={f.label} className="rounded-xl p-3" style={{ background: `color-mix(in srgb, ${f.cor} 5%, transparent)`, border: `1px solid color-mix(in srgb, ${f.cor} 18%, transparent)` }}>
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-0.5"><span className="h-2 w-2 rounded-full" style={{ background: f.cor }} />{f.label}</span>
              <span className="font-mono text-base font-extrabold" style={{ color: f.v >= 0 ? f.cor : "#f87171" }}>{sign(f.v)}{compactBRL(f.v)}</span>
            </div>
          ))}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full flex mb-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div style={{ width: `${pctPuro}%`, background: "#3b82f6" }} />
          <div style={{ width: `${pctFx}%`, background: "#E8A33D" }} />
          <div style={{ width: `${pctCz}%`, background: "#a855f7" }} />
        </div>
        <p className="text-[10.5px] text-zinc-500 mb-5">
          Somando: <b className={analysis.lucroTotal >= 0 ? "text-emerald-400" : "text-red-400"}>{sign(analysis.lucroTotal)}{compactBRL(analysis.lucroTotal)}</b> de resultado nas posições no exterior (custo {compactBRL(analysis.totalCustoBRL)}).
        </p>

        {/* Estresse único */}
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1.5 flex items-center gap-1.5"><Zap size={11} />E se o dólar mexer?</p>
        {cenarioFrase && (
          <p className="text-[11px] text-zinc-500 mb-3">
            Dólar a <b className="text-zinc-200">R$ {cenarioFrase.newSpot.toFixed(2).replace(".", ",")}</b> ({cenarioFrase.label}): seu patrimônio {cenarioFrase.impacto >= 0 ? "sobe" : "cai"} <b className={cenarioFrase.impacto >= 0 ? "text-emerald-400" : "text-red-400"}>{compactBRL(Math.abs(cenarioFrase.impacto))} ({Math.abs(cenarioFrase.impactoPatrimonioPct).toFixed(1).replace(".", ",")}% do total)</b>.
          </p>
        )}
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={stressScenarios} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2028" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v >= 0 ? "+" : ""}${(v / 1000).toFixed(0)}k`} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v: number) => [compactBRL(v), "Impacto no patrimônio"]} labelFormatter={l => `Cenário ${l}`} />
            <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />
            <Bar dataKey="impacto" radius={[4, 4, 0, 0]} maxBarSize={30}>
              {stressScenarios.map((entry, i) => (
                <Cell key={i} fill={entry.pctS === 0 ? "#6366f1" : entry.impacto >= 0 ? "#34d399" : "#f87171"} fillOpacity={entry.pctS === 0 ? 0.4 : 0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[10px] text-zinc-500 shrink-0">Cenário custom:</span>
          <input type="range" min={-50} max={50} step={5} value={stressCustom} onChange={e => setStressCustom(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
            style={{ background: "linear-gradient(to right, #f87171, #3f3f46 50%, #34d399)" }} />
          <span className={`w-12 shrink-0 text-right text-xs font-bold ${stressCustom >= 0 ? "text-emerald-400" : "text-red-400"}`}>{sign(stressCustom)}{stressCustom}%</span>
        </div>
      </div>

      {/* ══ 4. Linha do tempo das remessas ══ */}
      <div className="glass-card p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="section-title"><ArrowLeftRight size={15} />Linha do tempo das remessas</h2>
          <div className="flex items-center gap-1.5">
            {moedasGrafico.map(m => (
              <button key={m} onClick={() => setMoedaGrafico(m)}
                className="rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold transition-colors"
                style={{
                  border: `1px solid ${moedaGrafico === m ? (FX_COLORS[m] ?? "#64748b") : "var(--line)"}`,
                  color: moedaGrafico === m ? "var(--text)" : "var(--muted)",
                  background: moedaGrafico === m ? `color-mix(in srgb, ${FX_COLORS[m] ?? "#64748b"} 14%, transparent)` : "transparent",
                }}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10.5px] text-zinc-600 mb-3">Cada ponto é uma remessa ({unidade}); a linha dourada é o seu PM. Toque num ponto para os detalhes da operação.</p>
        {serieAtiva.length > 1 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={serieAtiva} onClick={(st) => {
              const idx = (st as { activeTooltipIndex?: number })?.activeTooltipIndex;
              if (idx != null && serieAtiva[idx]) setPopup({ t: "remessa", row: serieAtiva[idx].row });
            }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f23" />
              <XAxis dataKey="data" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => formatDate(v).substring(0, 5)} />
              <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false}
                domain={[
                  (dataMin: number) => Math.min(dataMin, pmDaMoeda > 0 ? pmDaMoeda : dataMin, spotDaMoeda > 0 ? spotDaMoeda : dataMin) * 0.995,
                  (dataMax: number) => Math.max(dataMax, pmDaMoeda, spotDaMoeda) * 1.005,
                ]} tickFormatter={(v: number) => v.toFixed(2)} />
              <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
                formatter={(v: number) => [`${v.toFixed(4)} (${unidade})`, "VET"]} labelFormatter={l => `${formatDate(l)} — toque p/ detalhes`} />
              {pmDaMoeda > 0 && <ReferenceLine y={pmDaMoeda} stroke="#E8A33D" strokeDasharray="5 5" label={{ value: `PM ${pmDaMoeda.toFixed(2)}`, fill: "#E8A33D", fontSize: 10, position: "right" }} />}
              {spotDaMoeda > 0 && <ReferenceLine y={spotDaMoeda} stroke="#34d399" strokeDasharray="2 4" label={{ value: `hoje ${spotDaMoeda.toFixed(2)}`, fill: "#34d399", fontSize: 10, position: "insideTopRight" }} />}
              <Line type="monotone" dataKey="taxa" stroke={FX_COLORS[moedaGrafico] ?? "#64748b"} strokeWidth={2}
                dot={{ r: 4, fill: FX_COLORS[moedaGrafico] ?? "#64748b", strokeWidth: 0, cursor: "pointer" }}
                activeDot={{ r: 6, fill: FX_COLORS[moedaGrafico] ?? "#64748b", cursor: "pointer" }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-[12px] text-zinc-600">Poucas remessas em {moedaGrafico} para desenhar a linha.</p>
        )}
        <div className="mt-3 border-t pt-3 text-right" style={{ borderColor: "var(--line)" }}>
          <button onClick={() => setPopup({ t: "operacoes" })} className="font-mono text-[11px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:text-zinc-200">
            Ver todas as operações ({(rawData ?? []).length}) ›
          </button>
        </div>
      </div>

      {renderPopup()}
    </>
  );
}
