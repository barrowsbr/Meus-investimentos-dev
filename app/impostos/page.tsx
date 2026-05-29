"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Receipt, TrendingUp, TrendingDown, AlertCircle, Check,
  ChevronDown, ChevronUp, Calendar, Scale, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from "recharts";
import PageHeader from "@/components/PageHeader";
import MetricCard from "@/components/MetricCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { brl, compactBRL } from "@/lib/format";
import type { ImpostosResult, MonthSummary } from "@/app/api/impostos/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function shortMonth(m: string): string {
  const parts = m.split("-");
  if (parts.length === 2) {
    const idx = parseInt(parts[1], 10) - 1;
    return `${MONTHS_PT[idx]}/${parts[0].slice(2)}`;
  }
  return m;
}

function pctFmt(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

const TOOLTIP_STYLE = {
  background: "rgba(15,23,42,0.95)",
  border: "1px solid rgba(99,102,241,0.25)",
  borderRadius: "12px",
  color: "#e2e8f0",
  fontSize: "12px",
};

// ─── Year selector ────────────────────────────────────────────────────────────

function YearSelector({ year, onChange }: { year: number | null; onChange: (y: number | null) => void }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="flex gap-1.5">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          year === null
            ? "bg-accent/15 text-accent"
            : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
        }`}
      >
        Todos
      </button>
      {years.map(y => (
        <button
          key={y}
          onClick={() => onChange(y)}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            year === y
              ? "bg-accent/15 text-accent"
              : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

// ─── Monthly row ─────────────────────────────────────────────────────────────

function MonthRow({ s, defaultOpen = false }: { s: MonthSummary; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasActivity = Math.abs(s.gain_bruto) > 0.01 || s.acoes_sales > 0;
  if (!hasActivity) return null;

  const gainCls = s.gain_bruto >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 py-3 px-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        <div className="w-20 text-sm font-semibold text-zinc-300">{shortMonth(s.month)}</div>

        {/* Sales */}
        <div className="flex-1 text-xs text-zinc-500">
          {s.acoes_sales > 0 && (
            <span>
              Vendas: <span className="text-zinc-400">{brl(s.acoes_sales)}</span>
            </span>
          )}
        </div>

        {/* Gain/Loss */}
        <div className={`w-28 text-right text-sm font-bold ${gainCls}`}>
          {s.gain_bruto >= 0 ? "+" : ""}{brl(s.gain_bruto)}
        </div>

        {/* IR */}
        <div className="w-28 text-right">
          {s.ir_devido > 0.01 ? (
            <span className="text-sm font-bold text-red-400">{brl(s.ir_devido)}</span>
          ) : s.isenta ? (
            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Isenta</span>
          ) : (
            <span className="text-sm text-zinc-700">—</span>
          )}
        </div>

        {/* Expand */}
        <div className="w-6 flex-shrink-0 flex justify-end">
          {open ? <ChevronUp size={13} className="text-zinc-600" /> : <ChevronDown size={13} className="text-zinc-600" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white/[0.01]">
          {[
            { label: "Ações B3", value: s.acoes_gain, cat: true },
            { label: "FIIs", value: s.fiis_gain, cat: false },
            { label: "Internacional", value: s.intl_gain, cat: false },
            { label: "ETFs", value: s.etfs_gain, cat: false },
          ].filter(item => Math.abs(item.value) > 0.01).map(item => (
            <div key={item.label} className="bg-white/[0.03] rounded-xl p-3">
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{item.label}</div>
              <div className={`text-sm font-bold mt-1 ${item.value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {item.value >= 0 ? "+" : ""}{brl(item.value)}
              </div>
            </div>
          ))}
          {s.acc_loss_inicio > 0.01 && (
            <div className="col-span-2 md:col-span-4 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 flex items-center gap-3">
              <Scale size={14} className="text-amber-400 flex-shrink-0" />
              <div>
                <div className="text-[10px] text-zinc-600">Prejuízo compensado</div>
                <div className="text-xs font-semibold text-amber-400">
                  {brl(Math.min(s.acc_loss_inicio, s.gain_bruto > 0 ? s.gain_bruto : 0))} de {brl(s.acc_loss_inicio)} de saldo anterior
                </div>
              </div>
            </div>
          )}
          <div className="col-span-2 md:col-span-4 flex items-center justify-between text-xs">
            <span className="text-zinc-600">
              Alíquota: <span className="text-zinc-400 font-semibold">{pctFmt(s.ir_aliquota)}</span>
              {s.isenta && " · Isenta (vendas ≤ R$20k)"}
            </span>
            <span className="text-zinc-600">
              Prejuízo acumulado após mês: <span className="text-zinc-400 font-semibold">{brl(s.acc_loss_fim)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ImpostosPage() {
  const [data, setData] = useState<ImpostosResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(new Date().getFullYear());

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = year ? `/api/impostos?year=${year}` : "/api/impostos";
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d as ImpostosResult);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [year]);

  // Chart data
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.summaries
      .filter(s => Math.abs(s.gain_bruto) > 0.01 || s.ir_devido > 0.01)
      .map(s => ({
        month: shortMonth(s.month),
        ganho: s.gain_bruto > 0 ? s.gain_bruto : 0,
        perda: s.gain_bruto < 0 ? s.gain_bruto : 0,
        ir: s.ir_devido,
      }));
  }, [data]);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthSummary = data?.summaries.find(s => s.month === currentMonth);

  return (
    <>
      <div className="flex items-start justify-between mb-5">
        <PageHeader
          title="Impostos"
          description="Controle de IR sobre investimentos — ganho de capital, isenções e DARFs"
        />
        <div className="mt-1">
          <YearSelector year={year} onChange={setYear} />
        </div>
      </div>

      {/* Rule reminder */}
      <div className="glass-card p-3 mb-5 flex items-start gap-3 border-indigo-500/15">
        <AlertCircle size={15} className="text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-500 leading-relaxed">
          <span className="text-zinc-300 font-medium">Regras aplicadas:</span>{" "}
          Ações B3: 15% sobre ganhos em meses com vendas acima de R$20k (isenção para ≤ R$20k).
          {" "}FIIs: 20% sobre ganhos sem isenção. Internacional: 15%.
          {" "}Prejuízos compensam ganhos nos meses seguintes.
        </div>
      </div>

      {loading && <LoadingSpinner />}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm text-red-400 flex items-center gap-2 mb-4">
          <AlertCircle size={14} />{error}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="animate-fade-in">
              <MetricCard
                label="IR Total Devido"
                value={brl(data.total_ir)}
                sub={year ? `${year}` : "todos os anos"}
                icon={<Receipt size={18} />}
                glowColor="#6366f1"
              />
            </div>
            <div className="animate-fade-in animate-delay-1">
              <MetricCard
                label="Ganho de Capital"
                value={compactBRL(data.total_gain)}
                sub="total bruto"
                icon={<TrendingUp size={18} />}
                trend="up"
                glowColor="#34d399"
              />
            </div>
            <div className="animate-fade-in animate-delay-2">
              <MetricCard
                label="Prejuízo Realizado"
                value={compactBRL(data.total_loss)}
                sub="para compensação"
                icon={<TrendingDown size={18} />}
                glowColor="#f87171"
              />
            </div>
            <div className="animate-fade-in animate-delay-3">
              <MetricCard
                label="Prejuízo Acumulado"
                value={compactBRL(data.acc_loss_atual)}
                sub="saldo a compensar"
                icon={<Scale size={18} />}
                glowColor="#fbbf24"
              />
            </div>
          </div>

          {/* DARF do mês atual */}
          {currentMonthSummary && currentMonthSummary.ir_devido > 0.01 && (
            <div className="glass-card p-4 mb-5 border-red-500/15 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-sm font-semibold text-zinc-200">DARF a recolher — {shortMonth(currentMonthSummary.month)}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                  Código 6015
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-zinc-600">
                    Vencimento: último dia útil do mês seguinte
                  </div>
                  <div className="text-2xl font-black text-red-400 mt-1">
                    {brl(currentMonthSummary.ir_devido)}
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-600 space-y-1">
                  <div>Ganho tributável: <span className="text-zinc-400">{brl(currentMonthSummary.gain_bruto)}</span></div>
                  <div>Alíquota: <span className="text-zinc-400">{pctFmt(currentMonthSummary.ir_aliquota)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="glass-card p-5 mb-5">
              <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                <Calendar size={14} />
                Ganho/Perda por Mês
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#52525b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))}
                    width={40}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [
                      brl(Math.abs(v)),
                      name === "ganho" ? "Ganho" : name === "perda" ? "Perda" : "IR Devido",
                    ]}
                  />
                  <Bar dataKey="ganho" fill="#34d399" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                  <Bar dataKey="perda" fill="#f87171" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                  <Bar dataKey="ir" fill="#6366f1" radius={[3, 3, 0, 0]} fillOpacity={0.9} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-5 mt-2 text-xs text-zinc-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" /> Ganho</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" /> Perda</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" /> IR Devido</span>
              </div>
            </div>
          )}

          {/* Monthly table */}
          {data.summaries.length > 0 ? (
            <div className="glass-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                <h2 className="text-sm font-semibold text-zinc-300">Detalhamento Mensal</h2>
                <div className="hidden md:grid grid-cols-4 gap-3 text-[10px] font-semibold text-zinc-600 uppercase tracking-wide text-right">
                  <span className="w-20" />
                  <span className="w-32">Vendas Ações</span>
                  <span className="w-28">Ganho/Perda</span>
                  <span className="w-28">IR Devido</span>
                  <span className="w-6" />
                </div>
              </div>
              {[...data.summaries].reverse().map(s => (
                <MonthRow
                  key={s.month}
                  s={s}
                  defaultOpen={s.month === currentMonth}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card p-8 text-center text-zinc-600 text-sm">
              Nenhuma venda registrada{year ? ` em ${year}` : ""}. Registre transações em <span className="text-zinc-400">Portfólio → meus_ativos</span>.
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-zinc-800 text-center mt-6">
            Cálculo estimado com base em FIFO. Consulte um contador para declaração oficial.
            Não considera day-trade, operações no exterior com variação cambial, nem IR na fonte (IRRF).
          </p>
        </>
      )}
    </>
  );
}
