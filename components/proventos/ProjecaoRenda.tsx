"use client";

// Renda projetada — próximos 12 meses (página Proventos). Método, na ordem:
//   1. taxa anual de dividendo declarada no Yahoo × cotas de HOJE (mapa
//      `taxas` do /api/proventos/calendario — mesmo método do relatório
//      PortfolioAnalyst da IBKR), distribuída nos MESES em que o papel
//      historicamente pagou (proporcional aos últimos 12m recebidos);
//   2. sem taxa declarada → repete o que o papel pagou nos últimos 12 meses;
//   3. sem histórico de meses → distribui uniforme no ano (marcado
//      "distribuição estimada" na tabela).
// Só papéis DETIDOS entram (vendeu, saiu da projeção). Não é promessa —
// empresas cortam e mudam datas; o método fica escrito na própria seção.

import { useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { CalendarClock } from "lucide-react";
import { fetchJsonCached } from "@/lib/client-cache";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";

interface Posicao { ticker: string; setor: string; quantidade: number; valorAtualBRL: number }
interface TaxaDividendo { rate: number; yield: number | null; moeda: string; ySym: string }
interface Calendario { taxas?: Record<string, TaxaDividendo>; error?: string }

const NAO_PAGA = new Set(["Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez", "Cripto"]);
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const TOOLTIP_STYLE = { background: "#131318", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 };

const base = (t: string) => t.toUpperCase().trim().replace(/\.SA$/, "");
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : null;
}

export default function ProjecaoRenda({ positions, historico, fx }: {
  positions: Posicao[];
  historico: Array<Record<string, unknown>>;
  fx: Record<string, number>; // {usdbrl, eurbrl, ...} minúsculo
}) {
  const [taxas, setTaxas] = useState<Record<string, TaxaDividendo> | null>(null);

  useEffect(() => {
    fetchJsonCached<Calendario>("/api/proventos/calendario", 60 * 60_000)
      .then((c) => setTaxas(c?.taxas ?? {}))
      .catch(() => setTaxas({})); // sem Yahoo → projeta só pelo histórico
  }, []);

  const fxRate = (moeda: string) => (moeda.toUpperCase() === "BRL" ? 1 : fx[moeda.toLowerCase() + "brl"] ?? 1);

  const proj = useMemo(() => {
    if (taxas === null) return null;

    // ── Histórico dos últimos 12 meses fechados, por ticker ──
    const hoje = new Date();
    const piso = new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1); // 12 meses cheios
    const hist = new Map<string, { totalBRL: number; porMes: number[] }>();
    for (const r of historico) {
      const decisao = String(r["decisao"] ?? r["lancamento"] ?? "").toLowerCase();
      if (decisao.includes("imposto")) continue;
      const t = base(String(r["ticker"] ?? ""));
      if (!t) continue;
      const dRaw = String(r["data"] ?? "");
      const d = dRaw.includes("/") ? new Date(dRaw.split("/").reverse().join("-") + "T12:00") : new Date(dRaw + "T12:00");
      if (isNaN(d.getTime()) || d < piso || d > hoje) continue;
      const v = (toNumber(r["valor"]) ?? 0) * fxRate(String(r["moeda"] ?? "BRL"));
      if (v <= 0) continue;
      const h = hist.get(t) ?? { totalBRL: 0, porMes: Array(12).fill(0) };
      h.totalBRL += v;
      h.porMes[d.getMonth()] += v;
      hist.set(t, h);
    }

    // ── Projeção por papel detido ──
    interface Item { ticker: string; anualBRL: number; meses: number[]; metodo: "taxa" | "historico"; estimado: boolean }
    const itens: Item[] = [];
    for (const p of positions) {
      if ((p.quantidade ?? 0) <= 0 || (p.valorAtualBRL ?? 0) <= 0 || NAO_PAGA.has(p.setor)) continue;
      const t = base(p.ticker);
      const tx = taxas[t];
      const h = hist.get(t);
      const anualBRL = tx ? tx.rate * p.quantidade * fxRate(tx.moeda) : h?.totalBRL ?? 0;
      if (anualBRL <= 1) continue;
      // Pesos mensais: proporcional ao histórico; sem histórico → uniforme.
      const pesos = h && h.totalBRL > 0 ? h.porMes.map((v) => v / h.totalBRL) : Array(12).fill(1 / 12);
      itens.push({ ticker: t, anualBRL, meses: pesos, metodo: tx ? "taxa" : "historico", estimado: !h });
    }
    itens.sort((a, b) => b.anualBRL - a.anualBRL);

    // ── Próximos 12 meses ──
    const chart: Array<{ mes: string; valor: number; tops: string }> = [];
    for (let k = 1; k <= 12; k++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + k, 1);
      const m = d.getMonth();
      const doMes = itens
        .map((it) => ({ ticker: it.ticker, v: it.anualBRL * it.meses[m] }))
        .filter((x) => x.v >= 1)
        .sort((a, b) => b.v - a.v);
      chart.push({
        mes: `${MESES_CURTOS[m]}/${String(d.getFullYear()).slice(2)}`,
        valor: doMes.reduce((s, x) => s + x.v, 0),
        tops: doMes.slice(0, 3).map((x) => `${x.ticker} ${brl(x.v)}`).join(" · "),
      });
    }

    const total = itens.reduce((s, i) => s + i.anualBRL, 0);
    const recebido12m = [...hist.values()].reduce((s, h) => s + h.totalBRL, 0);
    return { itens, chart, total, recebido12m };
  }, [taxas, positions, historico, fx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!proj || proj.itens.length === 0) return null;
  const delta = proj.recebido12m > 0 ? (proj.total / proj.recebido12m - 1) * 100 : null;

  return (
    <div className="glass-card overflow-hidden mb-5 animate-fade-in" style={{ borderColor: "rgba(45,212,191,0.1)" }}>
      <div className="px-5 pt-5 pb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <CalendarClock size={15} className="text-teal-400" /> Renda projetada — próximos 12 meses
        </h2>
        <div className="text-right">
          <span className="text-lg font-bold text-teal-400 font-mono">{brl(proj.total)}</span>
          <span className="ml-2 text-[11px] text-zinc-500">≈ {brl(proj.total / 12)}/mês</span>
          {delta != null && (
            <span className={`ml-2 text-[11px] font-semibold ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(0)}% vs recebido nos últimos 12m
            </span>
          )}
        </div>
      </div>
      <p className="px-5 text-xs text-zinc-600 mb-3">
        Taxa anual de dividendo declarada × suas cotas de hoje, distribuída nos meses em que cada papel historicamente paga (sem taxa declarada, repete os últimos 12 meses). Não é promessa — empresas cortam e mudam datas.
      </p>
      <div className="px-5 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={proj.chart} barCategoryGap="22%">
            <defs>
              <linearGradient id="projRenda" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
            <XAxis dataKey="mes" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => brl(v)} width={70} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v: number, _n, item) => [`${brl(v)}${item?.payload?.tops ? ` — ${item.payload.tops}` : ""}`, "Projetado"]} />
            <Bar dataKey="valor" fill="url(#projRenda)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Top contribuintes, com o método de cada um à mostra */}
        <div className="mt-3 border-t border-zinc-800/40 pt-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Quem paga essa renda</p>
          <div className="flex flex-col gap-1">
            {proj.itens.slice(0, 8).map((it) => (
              <div key={it.ticker} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-16 shrink-0 font-semibold text-zinc-200">{it.ticker}</span>
                <span className="w-20 shrink-0 font-mono text-teal-400">{brl(it.anualBRL)}</span>
                <span className="hidden sm:flex gap-0.5">
                  {it.meses.map((w, m) => w > 0.01 ? (
                    <span key={m} className="rounded px-1 py-px font-mono text-[8.5px] bg-teal-500/10 text-teal-400/80">{MESES_CURTOS[m]}</span>
                  ) : null)}
                </span>
                <span className="ml-auto shrink-0 text-[9.5px] text-zinc-600">
                  {it.metodo === "taxa" ? "taxa declarada × cotas" : "repete últimos 12m"}{it.estimado ? " · distribuição estimada" : ""}
                </span>
              </div>
            ))}
            {proj.itens.length > 8 && (
              <p className="text-[10px] text-zinc-600 mt-1">+ {proj.itens.length - 8} papéis menores somando {brl(proj.itens.slice(8).reduce((s, i) => s + i.anualBRL, 0))}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
