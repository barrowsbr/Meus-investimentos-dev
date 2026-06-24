"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle, RefreshCw, Scale, ChevronDown, ChevronUp,
  Globe, Calculator, FileText, Bot, Copy, CalendarPlus, ExternalLink,
  ArrowLeftRight, Check, Landmark, Calendar, Send, Trash2, Loader2, User, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import { brl, compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";

// ─── Tipos (espelham /api/ir) ──────────────────────────────────────────────────
type OffsetBucket = "swing" | "day" | "fii" | "exterior" | "rf";
interface BucketResult {
  bucket: OffsetBucket; resultado: number; isento: boolean;
  prejuizoAcumIni: number; baseTributavel: number; prejuizoAcumFim: number;
  aliquota: number; irDevido: number;
}
interface MesApuracao {
  mes: string; acoesVendas: number; acoesResultado: number; etfBdrResultado: number;
  fiiResultado: number; dayResultado: number; isencaoAcoes: boolean;
  buckets: BucketResult[]; irTotal: number; darfCodigo: string; vencimento: string;
  irrfDedoDuro: number;
}
interface AnoExterior {
  ano: string; resultado: number; prejuizoAcumIni: number; baseTributavel: number;
  prejuizoAcumFim: number; aliquota: number; irDevido: number;
}
interface Posicao {
  ticker: string; assetClass: string; modalidade: string; moeda: string;
  qty: number; pmNative: number; pmBRL: number; bucket: OffsetBucket;
  aliquota: number; isentavel: boolean; valorAtualBRL: number;
}
interface LiquidacaoBRL {
  data: string; usdAlienado: number; recebidoBRL: number; taxaEfetiva: number;
  pmDolarNaData: number; custoBRL: number; ganhoBRL: number;
}
interface AnoCambial {
  ano: string; usdAlienado: number; recebidoBRL: number; custoBRL: number; ganhoBRL: number;
  isentoEspecie: boolean; aliquotaEspecie: number; irEspecie: number; liquidacoes: LiquidacaoBRL[];
}
interface CambioIr {
  anos: AnoCambial[]; pmDolarFinal: number; usdEstoqueFinal: number; limiteIsencaoEspecieUSD: number;
}
interface IrResponse {
  year: number | null; meses: MesApuracao[]; exterior: AnoExterior[];
  prejuizoFinal: Record<OffsetBucket, number>; irTotalMensal: number; irTotalExterior: number;
  posicoes: Posicao[]; fxHoje: number; mesAtual: string;
  acoesVendasMesAtual: number; limiteIsencaoAcoes: number;
  cambioIr?: CambioIr;
}

interface BemDireito {
  ticker: string; assetClass: string; grupo: string; codigo: string; descricao: string;
  localizacao: "Brasil" | "Exterior"; qty: number; custoAno: number; custoAnoAnterior: number; moeda: string;
}
interface RendimentosAno {
  ano: string; isentosDividendosBR: number; isentosRendimentoFII: number;
  exclusivaJCP: number; tributavelExterior: number; irrfRetido: number;
}
interface RfRend { ticker: string; ano: string; rendimento: number; diasCorridos: number; aliquota: number; irRetido: number; moeda: string; }
interface DirpfResponse {
  year: number; bensDireitos: BemDireito[]; rendimentos: RendimentosAno | null;
  rfRendimentos: RfRend[]; rfPosicoes: { ticker: string; investido: number; atual: number; moeda: string }[];
  totais: { bensDireitosCusto: number; rfIrRetido: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
function shortMonth(m: string): string {
  const p = m.split("-");
  return p.length === 2 ? `${MONTHS_PT[parseInt(p[1], 10) - 1]}/${p[0].slice(2)}` : m;
}
const pctFmt = (v: number) => `${(v * 100).toFixed(0)}%`;
const BUCKET_LABEL: Record<OffsetBucket, string> = {
  swing: "Ações/ETF/BDR", day: "Day trade", fii: "FIIs", exterior: "Exterior", rf: "Renda Fixa",
};
const TOOLTIP_STYLE = {
  background: "rgba(15,23,42,0.95)", border: "1px solid rgba(99,102,241,0.25)",
  borderRadius: "12px", color: "var(--text)", fontSize: "12px",
};

// Temas por região — a identidade visual de cada aba.
const BR = { cor: "#34d399", borda: "border-emerald-500/15", chip: "bg-emerald-500/10 text-emerald-400" };
const EX = { cor: "#60a5fa", borda: "border-blue-500/15", chip: "bg-blue-500/10 text-blue-400" };

function YearSelector({ year, onChange }: { year: number | null; onChange: (y: number | null) => void }) {
  const cur = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => cur - i);
  return (
    <div className="flex gap-1.5">
      <button onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${year === null ? "bg-accent/15 text-accent" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"}`}>Todos</button>
      {years.map(y => (
        <button key={y} onClick={() => onChange(y)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${year === y ? "bg-accent/15 text-accent" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"}`}>{y}</button>
      ))}
    </div>
  );
}

// ─── Utilitários DARF (lembrete .ics + copiar dados + Sicalc) ─────────────────
function darfIcs(m: MesApuracao): string {
  const dt = m.vencimento.replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//meus-investimentos//impostos//PT",
    "BEGIN:VEVENT", `UID:darf-${m.mes}@meus-investimentos`,
    `DTSTART;VALUE=DATE:${dt}`,
    `SUMMARY:Pagar DARF ${m.darfCodigo} — ${brl(m.irTotal)} (apuração ${m.mes})`,
    `DESCRIPTION:Código da receita ${m.darfCodigo} · Período de apuração ${m.mes} · Valor ${brl(m.irTotal)} · Gerar guia no SicalcWeb.`,
    "BEGIN:VALARM", "TRIGGER:-P2D", "ACTION:DISPLAY", "DESCRIPTION:DARF vence em 2 dias", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function DarfActions({ m }: { m: MesApuracao }) {
  const [copied, setCopied] = useState(false);
  const ultimoDia = (() => {
    const [y, mm] = m.mes.split("-").map(Number);
    return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10).split("-").reverse().join("/");
  })();
  const copiar = async () => {
    const txt = [
      `Código da receita: ${m.darfCodigo}`,
      `Período de apuração: ${ultimoDia}`,
      `Vencimento: ${m.vencimento.split("-").reverse().join("/")}`,
      `Valor principal: ${m.irTotal.toFixed(2).replace(".", ",")}`,
    ].join("\n");
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard indisponível */ }
  };
  const baixarIcs = () => {
    const blob = new Blob([darfIcs(m)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `darf-${m.mes}.ics`; a.click();
    URL.revokeObjectURL(url);
  };
  const btn = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.05] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all border border-white/[0.06]";
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <button onClick={copiar} className={btn}>{copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}{copied ? "Copiado!" : "Copiar dados p/ Sicalc"}</button>
      <button onClick={baixarIcs} className={btn}><CalendarPlus size={12} />Lembrete (.ics)</button>
      <a href="https://sicalc.receita.economia.gov.br/sicalc/principal" target="_blank" rel="noopener noreferrer" className={btn}><ExternalLink size={12} />Emitir no SicalcWeb</a>
    </div>
  );
}

// ─── Termômetro da isenção de R$20k (ações, mês corrente) ─────────────────────
function IsencaoTracker({ vendas, limite, mes }: { vendas: number; limite: number; mes: string }) {
  const pct = limite > 0 ? Math.min(100, (vendas / limite) * 100) : 0;
  const cor = pct < 60 ? "#34d399" : pct < 90 ? "#fbbf24" : "#f87171";
  const restante = Math.max(0, limite - vendas);
  return (
    <div className={`glass-card p-4 mb-4 ${BR.borda}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-zinc-300">Isenção R$20k — vendas de ações em {shortMonth(mes)}</span>
        <span className="text-xs font-bold" style={{ color: cor }}>{brl(vendas)} <span className="text-zinc-600 font-normal">/ {compactBRL(limite)}</span></span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.05] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <p className="text-[10px] text-zinc-600 mt-2">
        {vendas <= limite
          ? <>Ainda pode vender <span className="text-zinc-300 font-semibold">{brl(restante)}</span> em ações este mês mantendo a isenção do ganho. ETF, BDR e FII não contam nem gozam da isenção.</>
          : <>Limite ultrapassado — todo o ganho com ações do mês é tributado a 15%.</>}
      </p>
    </div>
  );
}

// ─── Linha mensal expansível (Brasil) ─────────────────────────────────────────
function MonthRow({ m, defaultOpen }: { m: MesApuracao; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const resultado = m.acoesResultado + m.etfBdrResultado + m.fiiResultado + m.dayResultado;
  const hasActivity = Math.abs(resultado) > 0.01 || m.acoesVendas > 0;
  if (!hasActivity) return null;
  const gainCls = resultado >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 py-3 px-4 hover:bg-white/[0.02] transition-colors text-left">
        <div className="w-20 text-sm font-semibold text-zinc-300">{shortMonth(m.mes)}</div>
        <div className="flex-1 text-xs text-zinc-500">
          {m.acoesVendas > 0 && <span>Vendas ações: <span className="text-zinc-400">{brl(m.acoesVendas)}</span></span>}
        </div>
        <div className={`w-28 text-right text-sm font-bold ${gainCls}`}>{resultado >= 0 ? "+" : ""}{brl(resultado)}</div>
        <div className="w-28 text-right">
          {m.irTotal > 0.01 ? <span className="text-sm font-bold text-red-400">{brl(m.irTotal)}</span>
            : m.isencaoAcoes ? <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Isenta</span>
            : <span className="text-sm text-zinc-700">—</span>}
        </div>
        <div className="w-6 flex justify-end">{open ? <ChevronUp size={13} className="text-zinc-600" /> : <ChevronDown size={13} className="text-zinc-600" />}</div>
      </button>
      {open && (
        <div className="px-4 pb-3 bg-white/[0.01] space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            {[
              { label: "Ações", value: m.acoesResultado },
              { label: "ETF/BDR", value: m.etfBdrResultado },
              { label: "FIIs", value: m.fiiResultado },
              { label: "Day trade", value: m.dayResultado },
            ].filter(i => Math.abs(i.value) > 0.01).map(i => (
              <div key={i.label} className="bg-white/[0.03] rounded-xl p-3">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{i.label}</div>
                <div className={`text-sm font-bold mt-1 ${i.value >= 0 ? "text-emerald-400" : "text-red-400"}`}>{i.value >= 0 ? "+" : ""}{brl(i.value)}</div>
              </div>
            ))}
          </div>
          {m.buckets.filter(b => b.baseTributavel > 0.01 || b.prejuizoAcumIni > 0.01 || b.irDevido > 0.01).map(b => (
            <div key={b.bucket} className="flex items-center justify-between text-xs bg-white/[0.02] rounded-lg px-3 py-2">
              <span className="text-zinc-400 font-medium">{BUCKET_LABEL[b.bucket]}</span>
              <div className="flex items-center gap-4 text-zinc-600">
                {b.prejuizoAcumIni > 0.01 && <span>compensou prej. <span className="text-amber-400">{brl(Math.min(b.prejuizoAcumIni, Math.max(0, b.resultado)))}</span></span>}
                <span>base <span className="text-zinc-400">{brl(b.baseTributavel)}</span></span>
                <span>× {pctFmt(b.aliquota)}</span>
                <span className="text-red-400 font-semibold">{brl(b.irDevido)}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-zinc-600">DARF {m.darfCodigo} · venc. <span className="text-zinc-400">{m.vencimento}</span></span>
            {m.irrfDedoDuro > 0.01 && <span className="text-zinc-600">IRRF day-trade (dedutível): <span className="text-zinc-400">{brl(m.irrfDedoDuro)}</span></span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Saldo a compensar (genérico, tematizável) ────────────────────────────────
function SaldoCompensar({ prejuizo, buckets, cor, nota }: {
  prejuizo: Record<OffsetBucket, number>; buckets: OffsetBucket[]; cor: string; nota: string;
}) {
  const total = buckets.reduce((s, b) => s + (prejuizo[b] ?? 0), 0);
  return (
    <div className="glass-card overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
        <Scale size={14} style={{ color: cor }} />
        <h2 className="text-sm font-semibold text-zinc-300">Saldo a Compensar</h2>
        <span className="ml-auto text-sm font-bold" style={{ color: total > 0.01 ? "#fbbf24" : "#3f3f46" }}>{brl(total)}</span>
      </div>
      <div className={`p-4 grid grid-cols-2 ${buckets.length > 2 ? "md:grid-cols-3" : ""} gap-3`}>
        {buckets.map(b => (
          <div key={b} className={`rounded-xl p-3 ${(prejuizo[b] ?? 0) > 0.01 ? "bg-amber-500/[0.07] border border-amber-500/15" : "bg-white/[0.02]"}`}>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{BUCKET_LABEL[b]}</div>
            <div className={`text-base font-bold mt-1 ${(prejuizo[b] ?? 0) > 0.01 ? "text-amber-400" : "text-zinc-700"}`}>{brl(prejuizo[b] ?? 0)}</div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4 text-[11px] text-zinc-600 leading-relaxed">{nota}</div>
    </div>
  );
}

// ─── Exterior: cards anuais (Lei 14.754/23) ───────────────────────────────────
function ExteriorAnual({ anos }: { anos: AnoExterior[] }) {
  if (anos.length === 0) {
    return <div className="glass-card p-6 text-center text-zinc-600 text-sm mb-4">Nenhuma alienação no exterior no período.</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
      {[...anos].reverse().map(a => (
        <div key={a.ano} className={`glass-card p-4 ${EX.borda}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-lg font-extrabold text-zinc-200">{a.ano}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${EX.chip}`}>15% anual · DAA</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/[0.03] rounded-xl p-2.5">
              <div className="text-[9px] text-zinc-600 uppercase">Resultado (PTAX)</div>
              <div className={`text-sm font-bold mt-0.5 ${a.resultado >= 0 ? "text-emerald-400" : "text-red-400"}`}>{a.resultado >= 0 ? "+" : ""}{brl(a.resultado)}</div>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-2.5">
              <div className="text-[9px] text-zinc-600 uppercase">Prej. compensado</div>
              <div className="text-sm font-bold mt-0.5 text-amber-400">{brl(Math.min(a.prejuizoAcumIni, Math.max(0, a.resultado)))}</div>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-2.5">
              <div className="text-[9px] text-zinc-600 uppercase">Base tributável</div>
              <div className="text-sm font-bold mt-0.5 text-zinc-300">{brl(a.baseTributavel)}</div>
            </div>
            <div className={`rounded-xl p-2.5 ${a.irDevido > 0.01 ? "bg-red-500/10 border border-red-500/20" : "bg-white/[0.03]"}`}>
              <div className="text-[9px] text-zinc-600 uppercase">IR devido</div>
              <div className={`text-sm font-bold mt-0.5 ${a.irDevido > 0.01 ? "text-red-400" : "text-zinc-500"}`}>{brl(a.irDevido)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Câmbio: liquidações para BRL (Exterior) ─────────────────────────────────
function CambioIrSection({ cambio, year }: { cambio: CambioIr; year: number | null }) {
  const anos = year ? cambio.anos.filter(a => a.ano === String(year)) : cambio.anos;
  const [expandedAno, setExpandedAno] = useState<string | null>(null);
  if (anos.length === 0) return null;

  const fmtUsd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtTaxa = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

  return (
    <div className="glass-card overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={14} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-zinc-300">Câmbio — liquidações USD → R$ (ganho cambial)</h2>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <span>PM dólar final: <span className="text-zinc-300 font-semibold">{fmtTaxa(cambio.pmDolarFinal)}</span></span>
          <span>estoque: <span className="text-zinc-300 font-semibold">{fmtUsd(cambio.usdEstoqueFinal)}</span></span>
        </div>
      </div>

      {anos.map(a => {
        const isOpen = expandedAno === a.ano;
        return (
          <div key={a.ano} className="border-b border-white/[0.04] last:border-0">
            <button
              onClick={() => setExpandedAno(isOpen ? null : a.ano)}
              className="w-full px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronRight size={12} className={`text-zinc-600 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                <span className="font-semibold text-zinc-300">{a.ano}</span>
                <span className="text-[10px] text-zinc-600">({a.liquidacoes.length} liquidação{a.liquidacoes.length !== 1 ? "ões" : ""})</span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
                <span>alienado <span className="text-zinc-400">{fmtUsd(a.usdAlienado)}</span></span>
                <span>recebido <span className="text-zinc-400">{brl(a.recebidoBRL)}</span></span>
                <span>custo PM <span className="text-zinc-400">{brl(a.custoBRL)}</span></span>
                <span>ganho <span className={a.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400"}>{a.ganhoBRL >= 0 ? "+" : ""}{brl(a.ganhoBRL)}</span></span>
                {a.isentoEspecie
                  ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">≤ US$5k/ano → isento (espécie)</span>
                  : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">se espécie: {brl(a.irEspecie)} ({(a.aliquotaEspecie * 100).toFixed(1)}%)</span>}
              </div>
            </button>

            {isOpen && a.liquidacoes.length > 0 && (
              <div className="px-4 pb-3">
                <div className="bg-zinc-900/60 border-l-2 border-cyan-500/40 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="px-3 py-2 text-left text-[10px] text-zinc-500 font-semibold uppercase">Data</th>
                        <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">USD alienado</th>
                        <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">Taxa efetiva</th>
                        <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">PM dólar</th>
                        <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">Recebido R$</th>
                        <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">Custo R$</th>
                        <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">Ganho R$</th>
                        <th className="px-3 py-2 text-right text-[10px] text-zinc-500 font-semibold uppercase">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.liquidacoes.map((l, i) => {
                        const ganPct = l.custoBRL > 0 ? (l.ganhoBRL / l.custoBRL) : 0;
                        return (
                          <tr key={i} className="border-b border-zinc-800/50 hover:bg-white/[0.02]">
                            <td className="px-3 py-1.5 text-zinc-400 font-mono">{l.data.split("-").reverse().join("/")}</td>
                            <td className="px-3 py-1.5 text-right text-zinc-300 font-mono">{fmtUsd(l.usdAlienado)}</td>
                            <td className="px-3 py-1.5 text-right text-zinc-400">{fmtTaxa(l.taxaEfetiva)}</td>
                            <td className="px-3 py-1.5 text-right text-zinc-400">{fmtTaxa(l.pmDolarNaData)}</td>
                            <td className="px-3 py-1.5 text-right text-zinc-300">{brl(l.recebidoBRL)}</td>
                            <td className="px-3 py-1.5 text-right text-zinc-500">{brl(l.custoBRL)}</td>
                            <td className={`px-3 py-1.5 text-right font-semibold ${l.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {l.ganhoBRL >= 0 ? "+" : ""}{brl(l.ganhoBRL)}
                            </td>
                            <td className={`px-3 py-1.5 text-right font-medium ${ganPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {ganPct >= 0 ? "+" : ""}{(ganPct * 100).toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-700 font-semibold">
                        <td className="px-3 py-2 text-zinc-400">Total {a.ano}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">{fmtUsd(a.usdAlienado)}</td>
                        <td className="px-3 py-2" colSpan={2} />
                        <td className="px-3 py-2 text-right text-zinc-300">{brl(a.recebidoBRL)}</td>
                        <td className="px-3 py-2 text-right text-zinc-500">{brl(a.custoBRL)}</td>
                        <td className={`px-3 py-2 text-right ${a.ganhoBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {a.ganhoBRL >= 0 ? "+" : ""}{brl(a.ganhoBRL)}
                        </td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  </table>

                  <div className="px-3 py-2 bg-white/[0.02] text-[10px] text-zinc-600 leading-relaxed space-y-1">
                    <div><span className="text-zinc-500 font-medium">Como ler:</span> PM dólar = custo médio das suas remessas BRL→USD até aquela data. Taxa efetiva = BRL recebido ÷ USD vendido. Ganho = (taxa efetiva − PM) × USD.</div>
                    <div><span className="text-zinc-500 font-medium">Declaração:</span> se os dólares vieram de venda de ativo no exterior, o câmbio <strong>já está dentro</strong> dos 15% anuais — não declare aqui novamente. Se forem de moeda em espécie com alienações &gt; US$5k/ano, recolha via GCAP.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="px-4 py-3 text-[11px] text-zinc-600 leading-relaxed bg-white/[0.01]">
        <span className="text-zinc-400 font-medium">Três enquadramentos possíveis:</span>{" "}
        <strong>(a)</strong> Venda de aplicação financeira no exterior → câmbio <strong>já tributado</strong> nos 15% anuais (custo pela PTAX compra, venda pela PTAX venda) — a conversão USD→BRL não gera novo imposto.{" "}
        <strong>(b)</strong> Conta-corrente/cartão não remunerados → variação cambial <strong>isenta</strong> (Lei 14.754/23, art. 5º).{" "}
        <strong>(c)</strong> Moeda em espécie (incluindo saldo em conta remunerada) → isento até US$ {cambio.limiteIsencaoEspecieUSD.toLocaleString("pt-BR")} de alienações/ano; acima, tabela progressiva (15%–22,5%) via GCAP.
      </div>
    </div>
  );
}

// ─── Simulador de venda (com escopo Brasil/Exterior) ─────────────────────────
function Simulador({ data, scope }: { data: IrResponse; scope: "brasil" | "exterior" }) {
  const posicoes = useMemo(
    () => (data.posicoes ?? []).filter(p => scope === "exterior" ? p.bucket === "exterior" : p.bucket !== "exterior"),
    [data.posicoes, scope]
  );
  const [tk, setTk] = useState("");
  const sel = posicoes.find(p => p.ticker === tk) ?? posicoes[0];
  const [qtd, setQtd] = useState<string>("");
  const [preco, setPreco] = useState<string>("");

  useEffect(() => {
    if (sel) { setQtd(String(sel.qty)); setPreco(sel.pmNative.toFixed(sel.moeda === "BRL" ? 2 : 4)); }
  }, [sel?.ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  const sim = useMemo(() => {
    if (!sel) return null;
    const q = Math.min(parseFloat(qtd) || 0, sel.qty);
    const p = parseFloat(preco) || 0;
    if (q <= 0 || p <= 0) return null;
    const proceedsBRL = sel.moeda === "BRL" ? q * p : q * p * data.fxHoje;
    const costBRL = q * sel.pmBRL;
    const gainBRL = proceedsBRL - costBRL;
    const prejDisp = data.prejuizoFinal?.[sel.bucket] ?? 0;

    const isAcoes = sel.modalidade === "acoes_swing";
    const vendasProjetadas = data.acoesVendasMesAtual + (isAcoes ? proceedsBRL : 0);
    const isento = sel.isentavel && isAcoes && vendasProjetadas > 0 && vendasProjetadas <= data.limiteIsencaoAcoes;

    let base = 0, ir = 0, prejUsado = 0;
    if (!isento && gainBRL > 0) {
      prejUsado = Math.min(prejDisp, gainBRL);
      base = gainBRL - prejUsado;
      ir = base * sel.aliquota;
    }
    return { q, proceedsBRL, costBRL, gainBRL, isento, prejDisp, prejUsado, base, ir, vendasProjetadas, isAcoes };
  }, [sel, qtd, preco, data]);

  if (posicoes.length === 0) return null;
  const tema = scope === "exterior" ? EX : BR;

  return (
    <div className={`glass-card p-5 mb-4 ${tema.borda}`}>
      <h2 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2"><Calculator size={15} style={{ color: tema.cor }} />Simulador — quanto pago se vender agora?</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-[10px] text-zinc-600 uppercase tracking-wide">Ativo</label>
          <select value={sel?.ticker ?? ""} onChange={e => setTk(e.target.value)} className="w-full mt-1 bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.06]">
            {posicoes.map(p => <option key={p.ticker} value={p.ticker} className="bg-zinc-900">{p.ticker} · {p.qty.toLocaleString("pt-BR")} un · PM {p.moeda === "BRL" ? brl(p.pmBRL) : `$${p.pmNative.toFixed(2)}`}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-600 uppercase tracking-wide">Quantidade</label>
          <input value={qtd} onChange={e => setQtd(e.target.value)} type="number" className="w-full mt-1 bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.06]" />
        </div>
        <div>
          <label className="text-[10px] text-zinc-600 uppercase tracking-wide">Preço de venda {sel?.moeda !== "BRL" ? `(${sel?.moeda})` : "(R$)"}</label>
          <input value={preco} onChange={e => setPreco(e.target.value)} type="number" step="0.01" className="w-full mt-1 bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-zinc-200 outline-none border border-white/[0.06]" />
        </div>
      </div>
      {sim && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/[0.03] rounded-xl p-3">
            <div className="text-[10px] text-zinc-600 uppercase">Resultado</div>
            <div className={`text-base font-bold mt-1 ${sim.gainBRL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{sim.gainBRL >= 0 ? "+" : ""}{brl(sim.gainBRL)}</div>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <div className="text-[10px] text-zinc-600 uppercase">Prej. compensável</div>
            <div className="text-base font-bold mt-1 text-amber-400">{brl(sim.prejUsado)}<span className="text-[10px] text-zinc-600"> / {brl(sim.prejDisp)}</span></div>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <div className="text-[10px] text-zinc-600 uppercase">Base × {sel ? pctFmt(sel.aliquota) : ""}</div>
            <div className="text-base font-bold mt-1 text-zinc-300">{brl(sim.base)}</div>
          </div>
          <div className={`rounded-xl p-3 ${sim.isento ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
            <div className="text-[10px] text-zinc-600 uppercase">IR estimado</div>
            <div className={`text-base font-bold mt-1 ${sim.isento ? "text-emerald-400" : "text-red-400"}`}>{sim.isento ? "Isento" : brl(sim.ir)}</div>
          </div>
          <div className="col-span-2 md:col-span-4 text-[11px] text-zinc-600">
            {sim.isAcoes
              ? `Vendas de ações no mês projetadas: ${brl(sim.vendasProjetadas)} ${sim.isento ? `(≤ ${compactBRL(data.limiteIsencaoAcoes)} → isento)` : `(> ${compactBRL(data.limiteIsencaoAcoes)} → tributado)`}.`
              : scope === "exterior"
                ? `Exterior: 15% anual na DIRPF (Lei 14.754/23), câmbio já embutido. Conversão PTAX hoje: R$ ${data.fxHoje.toFixed(4)}.`
                : `${BUCKET_LABEL[sel!.bucket]} não goza da isenção de R$20k.`}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agente Tributarista (IA) — Chat completo com streaming ─────────────────

function r2(v: number): number { return Math.round(v * 100) / 100; }

interface TaxMessage { role: "user" | "assistant"; content: string; model?: string; }

const TAX_SUGGESTIONS = [
  "Faça a validação completa da minha apuração",
  "Preciso pagar DARF este mês?",
  "Qual meu saldo de prejuízo por bucket?",
  "Se eu vender todas minhas ações hoje, quanto pago de IR?",
  "Como funciona a isenção dos R$ 20 mil para ações?",
  "Me explique a tributação do exterior (Lei 14.754)",
];

function TaxMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children, ...props }) => (
          <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse" {...props}>{children}</table></div>
        ),
        thead: ({ children, ...props }) => <thead className="border-b border-zinc-700" {...props}>{children}</thead>,
        th: ({ children, ...props }) => <th className="px-2 py-1.5 text-left text-[10px] text-zinc-400 font-semibold uppercase tracking-wider" {...props}>{children}</th>,
        td: ({ children, ...props }) => <td className="px-2 py-1.5 text-zinc-300 border-b border-zinc-800/50" {...props}>{children}</td>,
        h1: ({ children, ...props }) => <h1 className="text-sm font-bold text-zinc-100 mt-3 mb-1.5" {...props}>{children}</h1>,
        h2: ({ children, ...props }) => <h2 className="text-xs font-bold text-zinc-200 mt-3 mb-1" {...props}>{children}</h2>,
        h3: ({ children, ...props }) => <h3 className="text-xs font-bold text-zinc-300 mt-2 mb-1" {...props}>{children}</h3>,
        p: ({ children, ...props }) => <p className="text-xs leading-relaxed mb-1.5 text-zinc-400" {...props}>{children}</p>,
        ul: ({ children, ...props }) => <ul className="list-disc list-inside space-y-0.5 my-1 text-xs text-zinc-400" {...props}>{children}</ul>,
        ol: ({ children, ...props }) => <ol className="list-decimal list-inside space-y-0.5 my-1 text-xs text-zinc-400" {...props}>{children}</ol>,
        li: ({ children, ...props }) => <li className="text-zinc-400" {...props}>{children}</li>,
        strong: ({ children, ...props }) => <strong className="font-bold text-zinc-200" {...props}>{children}</strong>,
        code: ({ children, className, ...props }) => {
          if (className?.includes("language-")) {
            return <pre className="bg-zinc-900/80 rounded-lg p-3 my-2 overflow-x-auto text-[11px] border border-zinc-800"><code className="text-zinc-300" {...props}>{children}</code></pre>;
          }
          return <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-[11px] text-cyan-300" {...props}>{children}</code>;
        },
        blockquote: ({ children, ...props }) => <blockquote className="border-l-2 border-cyan-500/30 pl-3 my-2 text-zinc-500 italic text-xs" {...props}>{children}</blockquote>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function TaxBubble({ msg }: { msg: TaxMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isUser ? "bg-amber-500/15" : "bg-cyan-500/15"}`}>
        {isUser ? <User size={13} className="text-amber-400" /> : <Scale size={13} className="text-cyan-400" />}
      </div>
      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${isUser
        ? "bg-amber-500/8 text-zinc-100 rounded-tr-sm border border-amber-500/10"
        : "bg-white/[0.03] text-zinc-200 rounded-tl-sm border border-white/[0.06]"
      }`}>
        {isUser
          ? <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          : <TaxMarkdown content={msg.content} />
        }
        {msg.model && <p className="text-[9px] text-zinc-600 mt-1.5 text-right">{msg.model}</p>}
      </div>
    </div>
  );
}

function AgenteTributarista({ data, year }: { data: IrResponse; year: number | null }) {
  const [messages, setMessages] = useState<TaxMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingModel, setStreamingModel] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingContent]);

  const [dirpfData, setDirpfData] = useState<DirpfResponse | null>(null);
  useEffect(() => {
    const anoBase = year ?? new Date().getFullYear() - 1;
    fetch(`/api/ir/dirpf?year=${anoBase}`).then(r => r.json())
      .then(x => { if (!x.error) setDirpfData(x as DirpfResponse); })
      .catch(() => {});
  }, [year]);

  const dossie = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const darfsVencidos = data.meses
      .filter(m => m.irTotal > 0.01 && m.mes !== data.mesAtual && m.vencimento < hoje)
      .map(m => ({ mes: m.mes, irDevido: r2(m.irTotal), vencimento: m.vencimento, codigo: m.darfCodigo }));

    const proventosSummary = dirpfData?.rendimentos ? {
      dividendosBR_isento: r2(dirpfData.rendimentos.isentosDividendosBR),
      rendimentoFII_isento: r2(dirpfData.rendimentos.isentosRendimentoFII),
      jcp_exclusivaFonte: r2(dirpfData.rendimentos.exclusivaJCP),
      dividendoExterior_tributavel: r2(dirpfData.rendimentos.tributavelExterior),
      irrfRetido: r2(dirpfData.rendimentos.irrfRetido),
    } : undefined;

    const dirpfSummary = dirpfData ? {
      anoBase: dirpfData.year,
      totalBensDireitos: r2(dirpfData.totais.bensDireitosCusto),
      rfIrRetido: r2(dirpfData.totais.rfIrRetido),
      qtdBens: dirpfData.bensDireitos.length,
      qtdRfPosicoes: dirpfData.rfPosicoes.length,
    } : undefined;

    return {
      anoFiltro: year, mesAtual: data.mesAtual, hoje, fxHoje: data.fxHoje,
      vendasAcoesMesAtual: r2(data.acoesVendasMesAtual),
      limiteIsencaoAcoes: data.limiteIsencaoAcoes,
      irTotalMensal: r2(data.irTotalMensal),
      irTotalExterior: r2(data.irTotalExterior),
      darfsVencidos: darfsVencidos.length > 0 ? darfsVencidos : undefined,
      proventos: proventosSummary,
      dirpf: dirpfSummary,
      meses: data.meses
        .filter(m => m.irTotal > 0.005 || m.acoesVendas > 0.005 || Math.abs(m.acoesResultado + m.etfBdrResultado + m.fiiResultado + m.dayResultado) > 0.005)
        .map(m => ({
          mes: m.mes, vendasAcoes: r2(m.acoesVendas), resAcoes: r2(m.acoesResultado),
          resEtfBdr: r2(m.etfBdrResultado), resFii: r2(m.fiiResultado), resDay: r2(m.dayResultado),
          isentoAcoes: m.isencaoAcoes, irDevido: r2(m.irTotal), vencimentoDarf: m.vencimento, irrfDedoDuro: r2(m.irrfDedoDuro),
          buckets: m.buckets.map(b => ({ bucket: b.bucket, resultado: r2(b.resultado), prejAnterior: r2(b.prejuizoAcumIni), base: r2(b.baseTributavel), aliq: b.aliquota, ir: r2(b.irDevido), prejFinal: r2(b.prejuizoAcumFim) })),
        })),
      exteriorAnual: data.exterior.map(a => ({ ano: a.ano, resultadoBRL: r2(a.resultado), prejAnterior: r2(a.prejuizoAcumIni), base: r2(a.baseTributavel), ir15pct: r2(a.irDevido) })),
      prejuizoAcumuladoPorBucket: Object.fromEntries(Object.entries(data.prejuizoFinal ?? {}).map(([k, v]) => [k, r2(v as number)])),
      cambioLiquidacoes: (data.cambioIr?.anos ?? []).map(a => ({ ano: a.ano, usdAlienado: r2(a.usdAlienado), recebidoBRL: r2(a.recebidoBRL), ganhoCambialBRL: r2(a.ganhoBRL), isentoSeEspecie: a.isentoEspecie })),
      posicoesAbertas: (data.posicoes ?? []).map(p => ({ ticker: p.ticker, classe: p.assetClass, qtd: r2(p.qty), pmBRL: r2(p.pmBRL), moeda: p.moeda, valorAtualBRL: r2(p.valorAtualBRL) })),
    };
  }, [data, year, dirpfData]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: TaxMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setStreamingContent("");
    setStreamingModel("");

    const history = messages.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    try {
      const res = await fetch("/api/ir/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history,
          dossie: messages.length === 0 ? dossie : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Erro na API");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Sem stream");

      const decoder = new TextDecoder();
      let fullText = "";
      let modelUsed = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.model) { modelUsed = parsed.model; setStreamingModel(parsed.model); }
            if (parsed.text) { fullText += parsed.text; setStreamingContent(fullText); }
            if (parsed.error) throw new Error(parsed.error);
          } catch (e) { if (e instanceof SyntaxError) continue; throw e; }
        }
      }

      setMessages([...newMessages, { role: "assistant", content: fullText, model: modelUsed }]);
      setStreamingContent("");
      setStreamingModel("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setMessages([...newMessages, { role: "assistant", content: `⚠️ Erro: ${msg}` }]);
      setStreamingContent("");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [messages, loading, dossie]);

  return (
    <div className="glass-card overflow-hidden mb-4 border-cyan-500/15 flex flex-col" style={{ height: "calc(100vh - 22rem)", minHeight: 400 }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Scale size={15} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-zinc-300">Tributarista IA</h2>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            carregado com sua apuração
          </span>
        </div>
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setStreamingContent(""); }}
            className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors" title="Limpar conversa">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Scale size={24} className="text-cyan-400" />
            </div>
            <div className="text-center max-w-md">
              <p className="text-zinc-200 font-semibold text-sm mb-1">Tributarista de investimentos</p>
              <p className="text-zinc-600 text-xs mb-4">
                Especialista em IR sobre investimentos PF. Já recebi sua apuração completa — meses, buckets, prejuízos, exterior, câmbio e posições abertas.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {TAX_SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)}
                    className="text-left px-3 py-2 rounded-xl text-[11px] text-zinc-500 hover:text-zinc-300
                      bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] hover:border-cyan-500/20
                      transition-all duration-200">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => <TaxBubble key={i} msg={msg} />)}

        {loading && streamingContent && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
              <Scale size={13} className="text-cyan-400" />
            </div>
            <div className="max-w-[88%] bg-white/[0.03] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3.5 py-2.5">
              <TaxMarkdown content={streamingContent} />
              {streamingModel && <p className="text-[9px] text-zinc-600 mt-1.5 text-right">{streamingModel}</p>}
            </div>
          </div>
        )}

        {loading && !streamingContent && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
              <Scale size={13} className="text-cyan-400" />
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2">
              <Loader2 size={12} className="text-cyan-400 animate-spin" />
              <span className="text-zinc-500 text-xs">Analisando sua situação fiscal…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.05] shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2 items-end">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Pergunte sobre impostos, DARF, isenções, prejuízos…"
            rows={1}
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-700 outline-none resize-none max-h-24 py-2 px-1"
            style={{ lineHeight: "1.5" }}
          />
          <button type="submit" disabled={!input.trim() || loading}
            className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
            <Send size={14} className="text-white" />
          </button>
        </form>
        <p className="text-zinc-800 text-[9px] mt-1.5 px-1">
          Apoio técnico — não substitui contador habilitado · Shift+Enter nova linha
        </p>
      </div>
    </div>
  );
}

// ─── Declaração anual (DIRPF) ─────────────────────────────────────────────────
function Declaracao({ ano }: { ano: number }) {
  const [d, setD] = useState<DirpfResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/ir/dirpf?year=${ano}`).then(r => r.json())
      .then(x => { if (!x.error) setD(x as DirpfResponse); })
      .finally(() => setLoading(false));
  }, [ano]);

  if (loading) return <div className="glass-card p-5 mb-4 text-sm text-zinc-600">Carregando declaração {ano}…</div>;
  if (!d) return null;
  const r = d.rendimentos;

  return (
    <div className="glass-card overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center gap-2">
        <FileText size={14} className="text-indigo-400" />
        <h2 className="text-sm font-semibold text-zinc-300">Declaração anual (DIRPF) — ano-base {ano}</h2>
      </div>

      {r && (
        <div className="p-4 border-b border-white/[0.04]">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Rendimentos</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { l: "Dividendos BR (isento)", v: r.isentosDividendosBR, c: "#34d399" },
              { l: "Rend. FII (isento)", v: r.isentosRendimentoFII, c: "#34d399" },
              { l: "JCP (excl. fonte)", v: r.exclusivaJCP, c: "#a78bfa" },
              { l: "Dividendos exterior", v: r.tributavelExterior, c: "#60a5fa" },
              { l: "IRRF retido", v: r.irrfRetido, c: "#f59e0b" },
            ].map(x => (
              <div key={x.l} className="bg-white/[0.03] rounded-xl p-2.5">
                <div className="text-[9px] text-zinc-600 leading-tight">{x.l}</div>
                <div className="text-sm font-bold mt-1" style={{ color: x.c }}>{brl(x.v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-4 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wide">Bens e Direitos (a custo)</div>
          <div className="text-[10px] text-zinc-600">Total {compactBRL(d.totais.bensDireitosCusto)}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] text-zinc-600 uppercase">
              <th className="text-left font-semibold py-1">Ativo</th>
              <th className="text-left font-semibold">Gr/Cód</th>
              <th className="text-left font-semibold">Local</th>
              <th className="text-right font-semibold">31/12/{ano - 1}</th>
              <th className="text-right font-semibold">31/12/{ano}</th>
            </tr></thead>
            <tbody>
              {d.bensDireitos.map(b => (
                <tr key={b.ticker} className="border-t border-white/[0.03]">
                  <td className="py-1.5 text-zinc-300 font-medium">{b.ticker}</td>
                  <td className="text-zinc-500">{b.grupo}/{b.codigo}</td>
                  <td className="text-zinc-500">{b.localizacao === "Exterior" ? "🌎" : "🇧🇷"}</td>
                  <td className="text-right text-zinc-500">{b.custoAnoAnterior > 0 ? brl(b.custoAnoAnterior) : "—"}</td>
                  <td className="text-right text-zinc-300 font-medium">{b.custoAno > 0 ? brl(b.custoAno) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(d.rfRendimentos.length > 0 || d.rfPosicoes.length > 0) && (
        <div className="p-4">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-2">Renda fixa (tributação exclusiva na fonte)</div>
          {d.rfRendimentos.map(r => (
            <div key={r.ticker} className="flex items-center justify-between text-xs py-1">
              <span className="text-zinc-400">{r.ticker}</span>
              <div className="flex gap-4 text-zinc-600">
                <span>rend. <span className="text-emerald-400">{brl(r.rendimento)}</span></span>
                <span>{r.diasCorridos}d · {(r.aliquota * 100).toFixed(1)}%</span>
                <span>IRRF <span className="text-amber-400">{brl(r.irRetido)}</span></span>
              </div>
            </div>
          ))}
          {d.rfPosicoes.length > 0 && (
            <div className="text-[11px] text-zinc-600 mt-2">
              {d.rfPosicoes.length} posição(ões) de RF em aberto — declarar em Bens e Direitos pelo valor aplicado.
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-zinc-700 px-4 pb-3">
        Grupo/código são orientação (leiaute varia por ano-base). RF retida na fonte é estimativa.
      </p>
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────────
type TabId = "brasil" | "exterior" | "declaracao" | "agente";

export default function ImpostosPage() {
  const [data, setData] = useState<IrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(new Date().getFullYear());
  const [tab, setTab] = useState<TabId>("brasil");
  const [ptaxStatus, setPtaxStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true); setError(null);
      try {
        const ptaxRes = await fetch("/api/ptax/update", { method: "POST" }).catch(() => null);
        if (!cancelled && ptaxRes?.ok) {
          const ptaxJson = await ptaxRes.json().catch(() => null);
          if (ptaxJson?.newRows > 0) setPtaxStatus(`PTAX atualizado (+${ptaxJson.newRows} dias até ${ptaxJson.latestDate})`);
        }
      } catch { /* non-blocking */ }
      try {
        const res = await fetch(year ? `/api/ir?year=${year}` : "/api/ir");
        const d = await res.json();
        if (d.error) throw new Error(d.error);
        if (!cancelled) setData(d as IrResponse);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro desconhecido");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, [year]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.meses
      .map(m => ({ mes: m.mes, resultado: m.acoesResultado + m.etfBdrResultado + m.fiiResultado + m.dayResultado, ir: m.irTotal }))
      .filter(x => Math.abs(x.resultado) > 0.01 || x.ir > 0.01)
      .map(x => ({ month: shortMonth(x.mes), ganho: x.resultado > 0 ? x.resultado : 0, perda: x.resultado < 0 ? x.resultado : 0, ir: x.ir }));
  }, [data]);

  const mesAtual = data?.mesAtual ?? new Date().toISOString().slice(0, 7);
  const darfMes = data?.meses.find(m => m.mes === mesAtual && m.irTotal > 0.01);
  const hoje = new Date().toISOString().slice(0, 10);
  const darfsVencidos = useMemo(() => {
    if (!data) return [];
    return data.meses.filter(m => m.irTotal > 0.01 && m.mes !== mesAtual && m.vencimento < hoje);
  }, [data, mesAtual, hoje]);
  const prejBR = data ? (data.prejuizoFinal?.swing ?? 0) + (data.prejuizoFinal?.day ?? 0) + (data.prejuizoFinal?.fii ?? 0) : 0;
  const prejEX = data?.prejuizoFinal?.exterior ?? 0;

  const TABS: { id: TabId; label: string; flag: string; icon: typeof Landmark; cor: string }[] = [
    { id: "brasil", label: "Brasil · B3", flag: "🇧🇷", icon: Landmark, cor: BR.cor },
    { id: "exterior", label: "Exterior", flag: "🌎", icon: Globe, cor: EX.cor },
    { id: "declaracao", label: "Declaração", flag: "", icon: FileText, cor: "#a78bfa" },
    { id: "agente", label: "Agente", flag: "", icon: Bot, cor: "#22d3ee" },
  ];

  return (
    <>
      <div className="flex items-start justify-between mb-5">
        <PageHeader title="Impostos" description="Dois regimes, duas apurações: Brasil (DARF mensal) e Exterior (15% anual — Lei 14.754/23)" />
        <div className="mt-1"><YearSelector year={year} onChange={setYear} /></div>
      </div>

      {ptaxStatus && (
        <div className="p-3 mb-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl text-xs text-emerald-400 flex items-center gap-2 animate-fade-in">
          <RefreshCw size={12} /> {ptaxStatus}
        </div>
      )}

      {loading && <LoadingSpinner />}
      {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400 flex items-center gap-2 mb-4"><AlertCircle size={14} />{error}</div>}

      {!loading && data && (
        <>
          {/* ── Faixa de resumo: os dois regimes lado a lado ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <button onClick={() => setTab("brasil")}
              className={`glass-card p-4 text-left transition-all hover:bg-white/[0.02] ${tab === "brasil" ? "border-emerald-500/30" : BR.borda}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🇧🇷</span>
                <span className="text-sm font-bold text-zinc-200">Brasil — B3</span>
                <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${BR.chip}`}>DARF mensal</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase">IR {year ?? "total"}</div>
                  <div className="text-2xl font-black" style={{ color: BR.cor }}>{brl(data.irTotalMensal ?? 0)}</div>
                </div>
                <div className="text-right text-[11px] text-zinc-600">
                  {darfsVencidos.length > 0 && <span className="text-amber-400 font-semibold">{darfsVencidos.length} DARF{darfsVencidos.length > 1 ? "s" : ""} vencido{darfsVencidos.length > 1 ? "s" : ""}</span>}
                  {darfsVencidos.length === 0 && (darfMes ? <span className="text-red-400 font-semibold">DARF {shortMonth(darfMes.mes)}: {brl(darfMes.irTotal)}</span> : "Nenhum DARF pendente")}
                  <div>Prej. a compensar: <span className="text-amber-400">{compactBRL(prejBR)}</span></div>
                </div>
              </div>
            </button>

            <button onClick={() => setTab("exterior")}
              className={`glass-card p-4 text-left transition-all hover:bg-white/[0.02] ${tab === "exterior" ? "border-blue-500/30" : EX.borda}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🌎</span>
                <span className="text-sm font-bold text-zinc-200">Exterior — Lei 14.754/23</span>
                <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${EX.chip}`}>15% anual · DAA</span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-zinc-600 uppercase">IR {year ?? "total"}</div>
                  <div className="text-2xl font-black" style={{ color: EX.cor }}>{brl(data.irTotalExterior ?? 0)}</div>
                </div>
                <div className="text-right text-[11px] text-zinc-600">
                  Apuração na declaração anual
                  <div>Prej. a compensar: <span className="text-amber-400">{compactBRL(prejEX)}</span></div>
                </div>
              </div>
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex mb-5 overflow-x-auto scrollbar-hide" style={{ borderBottom: "1px solid var(--line)" }}>
            {TABS.map(t => {
              const active = tab === t.id;
              const Icon = t.icon;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="flex items-center gap-1.5 font-mono uppercase whitespace-nowrap"
                  style={{ padding: "9px 14px", marginBottom: -1, borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`, color: active ? "var(--text)" : "var(--muted)", fontSize: 11, fontWeight: 600, letterSpacing: ".05em" }}>
                  {t.flag ? <span className="text-sm leading-none">{t.flag}</span> : <Icon size={13} />}
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* ════ 🇧🇷 BRASIL ════ */}
          {tab === "brasil" && (
            <>
              {darfsVencidos.length > 0 && (
                <div className="glass-card p-4 mb-4 border-amber-500/20 bg-amber-500/[0.03]">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertCircle size={14} className="text-amber-400" />
                    <span className="text-sm font-semibold text-amber-300">DARFs vencidos ({darfsVencidos.length})</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">Atenção</span>
                  </div>
                  <div className="space-y-2">
                    {darfsVencidos.map(m => (
                      <div key={m.mes} className="flex items-center justify-between bg-white/[0.03] rounded-xl p-3">
                        <div>
                          <div className="text-xs text-zinc-300 font-medium">Apuração {shortMonth(m.mes)}</div>
                          <div className="text-[11px] text-zinc-600">Venceu em {m.vencimento.split("-").reverse().join("/")} · Código {m.darfCodigo}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-amber-400">{brl(m.irTotal)}</div>
                          <div className="text-[10px] text-zinc-600">{m.buckets.filter(b => b.irDevido > 0.01).map(b => BUCKET_LABEL[b.bucket]).join(", ")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] text-zinc-600 mt-3 flex items-center gap-1.5">
                    <Scale size={11} />
                    Recolha via SicalcWeb com acréscimos legais (multa + Selic). O Sicalc calcula automaticamente.
                  </div>
                </div>
              )}

              {darfMes && (
                <div className="glass-card p-4 mb-4 border-red-500/15">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-sm font-semibold text-zinc-200">DARF a recolher — {shortMonth(darfMes.mes)}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">Código {darfMes.darfCodigo}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-zinc-600">Vencimento: {darfMes.vencimento}</div>
                      <div className="text-2xl font-black text-red-400 mt-1">{brl(darfMes.irTotal)}</div>
                    </div>
                    <div className="text-right text-xs text-zinc-600 space-y-1">
                      {darfMes.buckets.filter(b => b.irDevido > 0.01).map(b => (
                        <div key={b.bucket}>{BUCKET_LABEL[b.bucket]}: <span className="text-zinc-400">{brl(b.irDevido)}</span></div>
                      ))}
                    </div>
                  </div>
                  <DarfActions m={darfMes} />
                </div>
              )}

              <IsencaoTracker vendas={data.acoesVendasMesAtual} limite={data.limiteIsencaoAcoes} mes={mesAtual} />

              {chartData.length > 0 && (
                <div className="glass-card p-5 mb-4">
                  <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2"><Calendar size={14} />Ganho/Perda por Mês</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="month" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))} width={40} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} formatter={(v: number, n: string) => [brl(Math.abs(v)), n === "ganho" ? "Ganho" : n === "perda" ? "Perda" : "IR"]} />
                      <Bar dataKey="ganho" fill="#34d399" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                      <Bar dataKey="perda" fill="#f87171" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                      <Bar dataKey="ir" fill="#6366f1" radius={[3, 3, 0, 0]} fillOpacity={0.9} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {data.meses.length > 0 ? (
                <div className="glass-card overflow-hidden mb-4">
                  <div className="px-4 py-3 border-b border-white/[0.05]"><h2 className="text-sm font-semibold text-zinc-300">Apuração Mensal</h2></div>
                  {[...data.meses].reverse().map(m => <MonthRow key={m.mes} m={m} defaultOpen={m.mes === mesAtual} />)}
                </div>
              ) : (
                <div className="glass-card p-8 text-center text-zinc-600 text-sm mb-4">Nenhuma venda na B3{year ? ` em ${year}` : ""}.</div>
              )}

              <SaldoCompensar
                prejuizo={data.prejuizoFinal ?? { swing: 0, day: 0, fii: 0, exterior: 0, rf: 0 }}
                buckets={["swing", "day", "fii"]}
                cor={BR.cor}
                nota="O prejuízo não expira: carrega de mês a mês e de um ano para o outro, desde que registrado na DIRPF. Compensa somente dentro da mesma modalidade (swing ≠ day trade ≠ FII). Em mês isento de ações (vendas ≤ R$20k), o prejuízo das ações não gera saldo."
              />

              <Simulador data={data} scope="brasil" />

              <div className={`glass-card p-3 mb-4 flex items-start gap-3 ${BR.borda}`}>
                <AlertCircle size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-500 leading-relaxed">
                  <span className="text-zinc-300 font-medium">Regras Brasil:</span>{" "}
                  custo por preço médio ponderado. Ações 15% (isenção se vendas ≤ R$20k/mês); ETF/BDR 15% sem isenção; FII e day-trade 20%.
                  DARF 6015 até o último dia útil do mês seguinte. Dividendos isentos (até ano-base 2025) e JCP 15% na fonte.
                </div>
              </div>
            </>
          )}

          {/* ════ 🌎 EXTERIOR ════ */}
          {tab === "exterior" && (
            <>
              <ExteriorAnual anos={data.exterior ?? []} />

              {data.cambioIr && <CambioIrSection cambio={data.cambioIr} year={year} />}

              <SaldoCompensar
                prejuizo={data.prejuizoFinal ?? { swing: 0, day: 0, fii: 0, exterior: 0, rf: 0 }}
                buckets={["exterior"]}
                cor={EX.cor}
                nota="Perdas com aplicações financeiras no exterior compensam ganhos do mesmo período e carregam para períodos seguintes, desde que declaradas. Não cruzam com os buckets da B3."
              />

              <Simulador data={data} scope="exterior" />

              <div className={`glass-card p-3 mb-4 flex items-start gap-3 ${EX.borda}`}>
                <AlertCircle size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-500 leading-relaxed">
                  <span className="text-zinc-300 font-medium">Regras Exterior (Lei 14.754/23, desde 2024):</span>{" "}
                  15% anual na declaração, sem DARF mensal e sem isenção de pequeno valor. O ganho é apurado em reais — custo pela PTAX da compra,
                  venda pela PTAX da venda — então <strong>a variação cambial já está dentro</strong> do ganho tributado.
                  Converter os dólares para reais depois não gera novo imposto (ver seção Câmbio para os 3 enquadramentos). Dividendos no exterior: 15% anual na mesma ficha.
                </div>
              </div>
            </>
          )}

          {/* ════ 📋 DECLARAÇÃO ════ */}
          {tab === "declaracao" && <Declaracao ano={(year ?? new Date().getFullYear()) - 1} />}

          {/* ════ 🤖 AGENTE ════ */}
          {tab === "agente" && <AgenteTributarista data={data} year={year} />}

          <p className="text-xs text-zinc-800 text-center mt-6">
            Preço médio ponderado, day-trade, compensação por modalidade e PTAX no exterior — motor canônico lib/tax.
            Estimativa de apoio — confirme com seu contador antes de recolher/declarar.
          </p>
        </>
      )}
    </>
  );
}
