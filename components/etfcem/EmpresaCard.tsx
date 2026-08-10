"use client";

// Card de detalhe de uma empresa do ETF Cem — abre ao tocar na linha.
// Bottom-sheet no celular, diálogo centrado no desktop. Busca
// /api/etf-cem/detalhe (cache 6h) e mostra o que houver: gráfico mensal
// desde 2010, valuation, dividendos com histórico anual, analistas e perfil.
// Tudo best-effort: campo sem dado vira "—", nunca erro.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ExternalLink, Star, Landmark, CalendarDays, Users } from "lucide-react";
import { fetchJsonCached } from "@/lib/client-cache";
import AssetLogo from "@/components/AssetLogo";

interface Detalhe {
  sym: string; nome: string | null; moeda: string; preco: number | null; varDiaPct: number | null;
  setor: string | null; industria: string | null; funcionarios: number | null; resumo: string | null;
  mcap: number | null; pe: number | null; peForward: number | null; peg: number | null; pb: number | null;
  ps: number | null; eps: number | null; beta: number | null; roePct: number | null;
  margemLiqPct: number | null; crescReceitaPct: number | null;
  yieldPct: number | null; divTaxaAnual: number | null; payoutPct: number | null;
  mediaYield5aPct: number | null; exDiv: string | null; proximoBalanco: string | null;
  rating: string | null; ratingNota: number | null; analistas: number | null; alvoMedio: number | null;
  w52High: number | null; w52Low: number | null;
  serie: Array<{ t: string; c: number }>;
  dividendosAno: Array<{ ano: number; total: number }>;
  error?: string;
}

export interface EmpresaResumo {
  sym: string; nome: string; moeda: string;
  distAth: number | null; athEff: number | null; athAno: number | null; athReal: boolean;
}

const usd = (v: number | null, casas = 2) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
// Valor na moeda de negociação da empresa (índice mundo: nem tudo é USD).
const dinheiro = (v: number | null, moeda: string) => {
  if (v === null) return "—";
  const cur = moeda === "GBp" || moeda === "GBX" ? "GBP" : moeda;
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: cur, maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
  } catch {
    return `${cur} ${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
  }
};
const f1 = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const compactUsd = (v: number | null) => {
  if (v === null) return "—";
  if (v >= 1e12) return `US$ ${(v / 1e12).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} tri`;
  if (v >= 1e9) return `US$ ${(v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} bi`;
  return `US$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mi`;
};
const dataBR = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};
const RATING_PT: Record<string, string> = {
  strong_buy: "compra forte", buy: "compra", hold: "manter", underperform: "abaixo do mercado", sell: "venda",
};

// Sparkline mensal (SVG puro — sem lib de gráfico no bundle da página).
function Sparkline({ serie, moeda }: { serie: Array<{ t: string; c: number }>; moeda: string }) {
  const geom = useMemo(() => {
    if (serie.length < 2) return null;
    const W = 640, H = 120, PAD = 4;
    const vals = serie.map((p) => p.c);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const x = (i: number) => PAD + (i / (serie.length - 1)) * (W - PAD * 2);
    const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
    const d = serie.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(" ");
    const area = `${d} L${x(serie.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
    const subiu = vals[vals.length - 1] >= vals[0];
    return { W, H, d, area, min, max, subiu };
  }, [serie]);
  if (!geom) return null;
  const cor = geom.subiu ? "#34d399" : "#f87171";
  return (
    <div>
      <svg viewBox={`0 0 ${geom.W} ${geom.H}`} className="w-full" style={{ height: 96 }} preserveAspectRatio="none" role="img" aria-label="Preço mensal desde 2010">
        <path d={geom.area} fill={cor} opacity={0.12} />
        <path d={geom.d} fill="none" stroke={cor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between font-mono text-[9px] text-zinc-600">
        <span>{serie[0].t.replace("-", "/")}</span>
        <span>mín {usd(geom.min, geom.min < 10 ? 2 : 0)} · máx {usd(geom.max, geom.max < 10 ? 2 : 0)} {moeda}</span>
        <span>{serie[serie.length - 1].t.replace("-", "/")}</span>
      </div>
    </div>
  );
}

// Barras anuais de dividendo por ação (SVG puro).
function BarrasDividendos({ anos, moeda }: { anos: Array<{ ano: number; total: number }>; moeda: string }) {
  if (anos.length === 0) return null;
  const max = Math.max(...anos.map((a) => a.total)) || 1;
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 64 }}>
        {anos.map((a) => (
          <div key={a.ano} className="flex flex-1 flex-col items-center justify-end gap-0.5" title={`${a.ano}: ${usd(a.total)} ${moeda}/ação`}>
            <span className="w-full rounded-t" style={{ height: `${Math.max(6, (a.total / max) * 100)}%`, background: "rgba(52,211,153,0.55)" }} />
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex gap-1">
        {anos.map((a) => (
          <span key={a.ano} className="flex-1 text-center font-mono text-[8px] text-zinc-600">{String(a.ano).slice(2)}</span>
        ))}
      </div>
    </div>
  );
}

function Metrica({ label, valor, bom }: { label: string; valor: string; bom?: boolean }) {
  return (
    <div className="rounded-xl p-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`font-mono text-xs font-bold ${bom ? "text-emerald-400" : "text-zinc-100"}`}>{valor}</p>
    </div>
  );
}

export default function EmpresaCard({
  empresa, observada, aoAlternarWatch, aoFechar,
}: {
  empresa: EmpresaResumo;
  observada: boolean;
  aoAlternarWatch: (sym: string) => void;
  aoFechar: () => void;
}) {
  const [det, setDet] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setDet(null); setErro(null);
    fetchJsonCached<Detalhe>(`/api/etf-cem/detalhe?symbol=${encodeURIComponent(empresa.sym)}`, 6 * 60 * 60_000)
      .then((d) => { if (d.error) throw new Error(d.error); setDet(d); })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"));
  }, [empresa.sym]);

  // Esc fecha; trava o scroll do fundo enquanto o card está aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [aoFechar]);

  const upside = det?.alvoMedio != null && det?.preco != null && det.preco > 0
    ? ((det.alvoMedio / det.preco) - 1) * 100 : null;

  // PORTAL no <body>: o layout tem ancestrais com transform/backdrop-filter,
  // que viram o "containing block" de position:fixed — sem o portal, o card
  // ancorava no fim da LISTA (o usuário tinha que rolar até lá embaixo) em
  // vez de sobrepor a tela.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={`Detalhes de ${empresa.nome}`}>
      <button className="absolute inset-0" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }} onClick={aoFechar} aria-label="Fechar" />
      <div
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl p-4 md:max-w-lg md:rounded-3xl"
        style={{ background: "#111114", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 -12px 48px rgba(0,0,0,0.5)" }}
      >
        {/* Cabeçalho */}
        <div className="flex items-start gap-3">
          <AssetLogo ticker={empresa.sym} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-zinc-100">{det?.nome ?? empresa.nome}</p>
            <p className="truncate text-[10px] text-zinc-500">
              {empresa.sym}{det?.setor ? ` · ${det.setor}` : ""}{det?.industria ? ` · ${det.industria}` : ""}
            </p>
          </div>
          <button
            onClick={() => aoAlternarWatch(empresa.sym)}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
            style={{ color: observada ? "#fbbf24" : "#52525b" }}
            aria-label={observada ? "Deixar de observar" : "Observar"}
          >
            <Star size={16} fill={observada ? "currentColor" : "none"} />
          </button>
          <button onClick={aoFechar} className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        {/* Preço + distância do topo */}
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="font-mono text-xl font-bold text-zinc-100">{dinheiro(det?.preco ?? null, det?.moeda ?? empresa.moeda)}</p>
            <p className={`font-mono text-[11px] ${det?.varDiaPct != null && det.varDiaPct < 0 ? "text-red-400" : "text-emerald-400"}`}>
              {det?.varDiaPct != null ? `${det.varDiaPct >= 0 ? "+" : ""}${det.varDiaPct.toFixed(2)}% hoje` : " "}
            </p>
          </div>
          {empresa.distAth !== null && (
            <div className="text-right">
              <p className="font-mono text-sm font-bold" style={{ color: empresa.distAth <= -15 ? "#34d399" : empresa.distAth > -5 ? "#60a5fa" : "#fbbf24" }}>
                {empresa.distAth > -5 ? "no topo" : `${empresa.distAth.toFixed(0)}% do topo`}
              </p>
              <p className="text-[9px] text-zinc-600">
                {empresa.athReal ? "topo histórico" : "máx. 52 semanas"}: {dinheiro(empresa.athEff, empresa.moeda)}{empresa.athAno ? ` (${empresa.athAno})` : ""}
              </p>
            </div>
          )}
        </div>

        {erro && <p className="mt-4 text-center text-xs text-red-400">{erro}</p>}
        {!det && !erro && <p className="mt-4 animate-pulse text-center text-xs text-zinc-500">Carregando detalhes…</p>}

        {det && (
          <>
            {det.serie.length > 1 && <div className="mt-3"><Sparkline serie={det.serie} moeda={det.moeda} /></div>}

            {/* Valuation */}
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Valuation</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <Metrica label="P/L" valor={f1(det.pe)} />
              <Metrica label="P/L proj." valor={f1(det.peForward)} />
              <Metrica label="PEG" valor={f1(det.peg)} />
              <Metrica label="P/VP" valor={f1(det.pb)} />
              <Metrica label="P/Receita" valor={f1(det.ps)} />
              <Metrica label="LPA (EPS)" valor={dinheiro(det.eps, det.moeda)} />
              <Metrica label="ROE" valor={det.roePct != null ? `${f1(det.roePct)}%` : "—"} bom={det.roePct != null && det.roePct >= 15} />
              <Metrica label="Margem líq." valor={det.margemLiqPct != null ? `${f1(det.margemLiqPct)}%` : "—"} />
              <Metrica label="Cresc. receita" valor={det.crescReceitaPct != null ? `${det.crescReceitaPct >= 0 ? "+" : ""}${f1(det.crescReceitaPct)}%` : "—"} bom={det.crescReceitaPct != null && det.crescReceitaPct > 0} />
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-500">
              <Landmark size={10} /> {compactUsd(det.mcap)}
              {det.beta != null && <span className="ml-2">beta {f1(det.beta)}</span>}
            </p>

            {/* Dividendos */}
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Dividendos</p>
            {det.yieldPct == null && det.dividendosAno.length === 0 ? (
              <p className="mt-1 text-[11px] text-zinc-600">Não paga dividendos.</p>
            ) : (
              <>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <Metrica label="Yield" valor={det.yieldPct != null ? `${f1(det.yieldPct)}%` : "—"} bom={det.yieldPct != null && det.yieldPct >= 3} />
                  <Metrica label="Por ação/ano" valor={dinheiro(det.divTaxaAnual, det.moeda)} />
                  <Metrica label="Payout" valor={det.payoutPct != null ? `${f1(det.payoutPct)}%` : "—"} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-zinc-500">
                  {det.mediaYield5aPct != null && <span>média 5 anos: <span className="font-mono text-zinc-300">{f1(det.mediaYield5aPct)}%</span></span>}
                  {det.exDiv && <span>ex-dividendo: <span className="font-mono text-zinc-300">{dataBR(det.exDiv)}</span></span>}
                </div>
                {det.dividendosAno.length > 1 && (
                  <div className="mt-2">
                    <BarrasDividendos anos={det.dividendosAno} moeda={det.moeda} />
                    <p className="mt-0.5 text-[9px] text-zinc-600">Dividendo por ação, por ano (o ano corrente é parcial).</p>
                  </div>
                )}
              </>
            )}

            {/* Analistas */}
            {(det.rating || det.alvoMedio != null) && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Analistas</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  <Metrica label="Consenso" valor={det.rating ? (RATING_PT[det.rating] ?? det.rating) : "—"} bom={det.rating === "buy" || det.rating === "strong_buy"} />
                  <Metrica label="Preço-alvo" valor={dinheiro(det.alvoMedio, det.moeda)} />
                  <Metrica label="Potencial" valor={upside != null ? `${upside >= 0 ? "+" : ""}${f1(upside)}%` : "—"} bom={upside != null && upside > 0} />
                </div>
                <p className="mt-1 text-[10px] text-zinc-600">
                  {det.analistas != null ? `${det.analistas} analistas` : ""}{det.ratingNota != null ? ` · nota ${f1(det.ratingNota)} (1 = compra forte, 5 = venda)` : ""}
                </p>
              </>
            )}

            {/* Perfil */}
            {(det.resumo || det.funcionarios != null || det.proximoBalanco) && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Sobre</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-zinc-500">
                  {det.funcionarios != null && <span className="flex items-center gap-1"><Users size={10} /> {det.funcionarios.toLocaleString("pt-BR")} funcionários</span>}
                  {det.proximoBalanco && <span className="flex items-center gap-1"><CalendarDays size={10} /> próximo balanço: {dataBR(det.proximoBalanco)}</span>}
                </div>
                {det.resumo && <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{det.resumo} <span className="text-zinc-600">(descrição do Yahoo, em inglês)</span></p>}
              </>
            )}
          </>
        )}

        <a
          href={`https://finance.yahoo.com/quote/${encodeURIComponent(empresa.sym)}`}
          target="_blank" rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08]"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          Abrir no Yahoo Finance <ExternalLink size={12} />
        </a>
      </div>
    </div>,
    document.body,
  );
}
