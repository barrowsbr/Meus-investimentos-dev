"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MoedaTab — aba "Moeda" do dossiê. Mostra TUDO que temos sobre a moeda local:
// identidade, taxa ao vivo (1 USD = X), força vs USD, estatísticas de período
// (1S/1M/3M/6M/1A/YTD), faixa de 52 semanas e um gráfico de 12 meses.
// Para os EUA mostra o Índice do Dólar (DXY). Sem dados → mensagem amigável.
// ─────────────────────────────────────────────────────────────────────────────

import { ArrowLeftRight, Loader2, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { AreaChart, Area, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { CurrencyData, CurrencyDetail, CurrencyPeriods } from "@/lib/radar/types";
import { useCurrencyDetail } from "@/lib/radar/use-radar";

const GREEN = "#4ade80";
const RED = "#f87171";

function fmtRate(v: number): string {
  return v < 1 ? v.toFixed(6) : v.toFixed(4);
}

function PctBadge({ value, big = false }: { value: number | null; big?: boolean }) {
  if (value == null) return <span className="text-zinc-600">—</span>;
  const pos = value >= 0;
  return (
    <span className={`font-mono font-semibold ${big ? "text-sm" : "text-[11px]"}`} style={{ color: pos ? GREEN : RED }}>
      {pos ? "+" : ""}{value.toFixed(2)}%
    </span>
  );
}

function PeriodGrid({ periods, sign }: { periods: CurrencyPeriods; sign: number }) {
  const keys: (keyof CurrencyPeriods)[] = ["1S", "1M", "3M", "6M", "1A", "YTD"];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {keys.map((k) => {
        const raw = periods[k];
        const v = raw == null ? null : raw * sign;
        const pos = (v ?? 0) >= 0;
        return (
          <div key={k} className="rounded-lg px-2 py-2 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">{k}</div>
            <div className="mt-0.5 font-mono text-[12px] font-bold" style={{ color: v == null ? "#52525b" : pos ? GREEN : RED }}>
              {v == null ? "—" : `${pos ? "+" : ""}${v.toFixed(1)}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Range52({ rate, hi, lo }: { rate: number; hi: number; lo: number }) {
  const span = hi - lo;
  const posPct = span > 0 ? ((rate - lo) / span) * 100 : 50;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span className="font-mono">{fmtRate(lo)}</span>
        <span className="uppercase tracking-wider">Faixa 52 semanas</span>
        <span className="font-mono">{fmtRate(hi)}</span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, rgba(74,222,128,0.25), rgba(250,204,21,0.25), rgba(248,113,113,0.25))" }}>
        <div className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-white" style={{ left: `calc(${Math.max(0, Math.min(100, posPct))}% - 2px)`, boxShadow: "0 0 6px rgba(255,255,255,0.6)" }} />
      </div>
    </div>
  );
}

function YearChart({ detail, sign }: { detail: CurrencyDetail; sign: number }) {
  if (detail.history.length < 5) return null;
  const net = detail.periods?.["1A"] != null ? detail.periods["1A"] * sign : 0;
  const color = net >= 0 ? GREEN : RED;
  const data = detail.history;
  return (
    <div className="h-[120px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="moedaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={["dataMin", "dataMax"]} hide />
          <Tooltip
            contentStyle={{ background: "#12141f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(v: number) => [fmtRate(v), detail.isDollarIndex ? "DXY" : `1 USD`]}
          />
          <Area type="monotone" dataKey="close" stroke={color} strokeWidth={1.5} fill="url(#moedaGrad)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MoedaTab({ currency }: { currency: CurrencyData | null }) {
  const { data: detail, loading } = useCurrencyDetail(currency?.code ?? null);

  if (!currency) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 rounded-xl p-4 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <AlertCircle size={14} className="shrink-0 text-zinc-600" />
          Sem dados de moeda para este país.
        </div>
      </div>
    );
  }

  // Para moedas comuns, a taxa é "local por USD": se sobe, a moeda enfraquece.
  // Invertendo o sinal, "força da moeda" fica positiva quando ela se valoriza.
  // No DXY (USD) não inverte — DXY maior = dólar mais forte.
  const sign = detail?.isDollarIndex ? 1 : -1;
  const strengthDay = detail ? detail.changePct * sign : null;
  const dollarIndex = detail?.isDollarIndex;

  return (
    <div className="space-y-4 p-4">
      {/* Identidade */}
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none">{currency.flag}</span>
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-tight text-zinc-100">
            {currency.code} <span className="text-sm font-normal text-zinc-500">· {currency.name}</span>
          </h3>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600">{currency.region}</p>
        </div>
      </div>

      {loading && !detail ? (
        <div className="flex items-center gap-2 rounded-xl p-4 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <Loader2 size={14} className="animate-spin" /> Carregando histórico cambial…
        </div>
      ) : detail ? (
        <>
          {/* Card principal: taxa + força */}
          <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                  {dollarIndex ? "Índice do Dólar (DXY)" : "Cotação"}
                </p>
                <p className="mt-0.5 font-mono text-xl font-bold text-zinc-100">
                  {dollarIndex ? detail.rate.toFixed(2) : `1 USD = ${fmtRate(detail.rate)}`}
                  {!dollarIndex && <span className="ml-1 text-sm text-zinc-500">{currency.code}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {(strengthDay ?? 0) >= 0 ? <TrendingUp size={15} style={{ color: GREEN }} /> : <TrendingDown size={15} style={{ color: RED }} />}
                <PctBadge value={strengthDay} big />
              </div>
            </div>
            <p className="mt-2 text-[10px] text-zinc-600">
              <ArrowLeftRight size={9} className="mr-1 inline" />
              {dollarIndex
                ? "Variação do dia do índice do dólar (cesta de 6 moedas)."
                : `Força do ${currency.name} vs USD hoje (positivo = moeda se valorizando).`}
            </p>
          </div>

          {/* Estatísticas de período */}
          {detail.periods && (
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {dollarIndex ? "Força do dólar por período" : "Força da moeda por período"}
              </p>
              <PeriodGrid periods={detail.periods} sign={sign} />
            </section>
          )}

          {/* Faixa 52 semanas */}
          {detail.hi52 != null && detail.lo52 != null && detail.hi52 > detail.lo52 && (
            <Range52 rate={detail.rate} hi={detail.hi52} lo={detail.lo52} />
          )}

          {/* Gráfico 12 meses */}
          {detail.history.length >= 5 && (
            <section>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {dollarIndex ? "DXY · 12 meses" : `1 USD = ${currency.code} · 12 meses`}
              </p>
              <YearChart detail={detail} sign={sign} />
            </section>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 rounded-xl p-4 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <AlertCircle size={14} className="shrink-0 text-zinc-600" />
          Histórico cambial indisponível para {currency.code} no momento.
        </div>
      )}
    </div>
  );
}
