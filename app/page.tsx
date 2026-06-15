"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { usePortfolio } from "@/lib/hooks";
import { compactBRL } from "@/lib/format";
import { isRendaFixa } from "@/lib/sectors";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import PageHeader from "@/components/PageHeader";
import { Panel, KpiStrip, Blotter, MiniBars, usePalette, useFilters } from "@/components/terminal";
import type { Kpi, BlotterColumn, MiniBarItem } from "@/components/terminal";

const cleanTicker = (t?: string | null) =>
  !t ? "—" : t.replace(/\.SA$/, "").replace(/-USD$/, "").replace(/-BRL$/, "").replace(/=X$/, "");

const signPct = (v: number | null | undefined, d = 2) =>
  typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%` : "—";

interface PosRow {
  ticker: string;
  setor: string;
  moeda: string;
  valorBRL: number;
  peso: number;
  dia: number | null;
  retorno: number | null;
}

const TT_STYLE = {
  background: "var(--panel)",
  border: "1px solid var(--line-strong)",
  borderRadius: 0,
  fontSize: 11,
  fontFamily: "var(--font-mono)",
} as const;

export default function HomePage() {
  const { data, loading } = usePortfolio();
  const palette = usePalette();
  const { filters } = useFilters();

  const totalBRL = typeof data?.totalPatrimonioBRL === "number" ? data.totalPatrimonioBRL : null;
  const usdbrl = typeof data?.usdbrl === "number" && data.usdbrl > 0 ? data.usdbrl : null;
  const totalUSD = totalBRL !== null && usdbrl ? totalBRL / usdbrl : null;
  const dayPct = typeof data?.dayChangeTotalPct === "number" ? data.dayChangeTotalPct : null;
  const dayBRL = typeof data?.dayChangeTotalBRL === "number" ? data.dayChangeTotalBRL : null;

  // Maiores posições (RV+RF), por valor de mercado.
  const positions = useMemo<PosRow[]>(() => {
    const total = totalBRL ?? 0;
    return (data?.positions ?? [])
      .filter((p) => (p.valorAtualBRL ?? 0) > 1)
      .map((p) => ({
        ticker: cleanTicker(p.ticker),
        setor: p.setor ?? "—",
        moeda: p.moeda ?? "BRL",
        valorBRL: p.valorAtualBRL ?? 0,
        peso: total > 0 ? ((p.valorAtualBRL ?? 0) / total) * 100 : 0,
        dia: typeof p.dayChangePct === "number" ? p.dayChangePct : null,
        retorno: typeof p.retornoTotalPct === "number" ? p.retornoTotalPct : null,
      }))
      .sort((a, b) => b.valorBRL - a.valorBRL);
  }, [data, totalBRL]);

  // Contribuição do dia (top movimentos por |P&L do dia|).
  const contrib = useMemo<MiniBarItem[]>(() => {
    return (data?.positions ?? [])
      .filter((p) => typeof p.dayChangePct === "number" && (p.valorAtualBRL ?? 0) > 1 && !isRendaFixa(p.setor ?? ""))
      .map((p) => ({ ticker: cleanTicker(p.ticker), pct: p.dayChangePct as number, pnl: p.dayChangeBRL ?? 0 }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 6)
      .map((p) => ({ k: p.ticker, v: Number(p.pct.toFixed(2)), c: p.pct >= 0 ? palette.pos : palette.neg }));
  }, [data, palette]);

  // Pares de câmbio (radar) — dados reais do snapshot.
  const fxPairs = useMemo(() => {
    const fx = data?.fx;
    const chg = data?.fxDayChange ?? {};
    if (!fx) return [];
    const rows: { k: string; v: number; d: number | null }[] = [];
    const add = (label: string, val: unknown, code: string) => {
      if (typeof val === "number" && val > 0)
        rows.push({ k: label, v: val, d: typeof chg[code]?.changePct === "number" ? chg[code].changePct : null });
    };
    add("USD/BRL", fx.USDBRL, "USD");
    add("EUR/BRL", fx.EURBRL, "EUR");
    add("GBP/BRL", fx.GBPBRL, "GBP");
    add("CAD/BRL", fx.CADBRL, "CAD");
    return rows;
  }, [data]);

  // Série patrimonial (12m) do histórico (lb_historic).
  const curve = useMemo(() => {
    return (data?.lbHistoric ?? [])
      .filter((p) => p && typeof p.patrimonio === "number" && p.patrimonio > 0)
      .map((p) => ({ data: p.data, patrimonio: p.patrimonio }));
  }, [data]);

  const showUSD = filters.moeda === "USD";

  const kpis: Kpi[] = [
    {
      label: "Patrimônio",
      value: loading || totalBRL === null ? "—" : showUSD && totalUSD !== null ? `US$ ${Math.round(totalUSD).toLocaleString("pt-BR")}` : compactBRL(totalBRL),
      sub: totalUSD !== null ? (showUSD ? compactBRL(totalBRL ?? 0) : `US$ ${Math.round(totalUSD).toLocaleString("pt-BR")}`) : undefined,
    },
    {
      label: "Δ Dia",
      value: dayPct === null ? "—" : signPct(dayPct),
      tone: (dayPct ?? 0) >= 0 ? "pos" : "neg",
      sub: dayBRL !== null ? `${dayBRL >= 0 ? "+" : ""}${compactBRL(dayBRL)}` : undefined,
    },
    {
      label: "Retorno RV",
      value: typeof data?.retornoTotalRVPct === "number" ? signPct(data.retornoTotalRVPct, 1) : "—",
      tone: (data?.retornoTotalRVPct ?? 0) >= 0 ? "pos" : "neg",
      sub: "total c/ proventos",
    },
    {
      label: "Proventos 12m",
      value: typeof data?.totalProventosBRL === "number" ? compactBRL(data.totalProventosBRL) : "—",
    },
    {
      label: "Dólar",
      value: usdbrl !== null ? `R$ ${usdbrl.toFixed(3).replace(".", ",")}` : "—",
      sub: typeof data?.fxDayChange?.USD?.changePct === "number" ? signPct(data.fxDayChange.USD.changePct) : undefined,
      tone: (data?.fxDayChange?.USD?.changePct ?? 0) >= 0 ? "pos" : "neg",
    },
    {
      label: "Ativos",
      value: positions.length || "—",
    },
  ];

  const cols: BlotterColumn<PosRow>[] = [
    { key: "ticker", header: "Ativo", render: (r) => <span className="font-mono font-bold" style={{ color: "var(--text)" }}>{r.ticker}</span> },
    { key: "setor", header: "Classe", render: (r) => <span style={{ color: "var(--muted)", fontSize: 11 }}>{r.setor}</span> },
    { key: "moeda", header: "Moeda", render: (r) => <span className="font-mono" style={{ color: "var(--muted)" }}>{r.moeda}</span> },
    { key: "valor", header: "Valor (BRL)", align: "right", render: (r) => <span className="font-mono tnum" style={{ color: "var(--text-2)" }}>{Math.round(r.valorBRL).toLocaleString("pt-BR")}</span> },
    {
      key: "peso",
      header: "Peso",
      align: "right",
      render: (r) => (
        <div className="flex items-center gap-2 justify-end">
          <div style={{ width: 40, height: 4, background: "var(--bar-track)", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, r.peso)}%`, height: "100%", background: "var(--accent)" }} />
          </div>
          <span className="font-mono tnum" style={{ color: "var(--text-2)", width: 38, textAlign: "right" }}>{r.peso.toFixed(1).replace(".", ",")}</span>
        </div>
      ),
    },
    { key: "dia", header: "Δ Dia", align: "right", render: (r) => <span className="font-mono tnum" style={{ color: (r.dia ?? 0) >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>{signPct(r.dia)}</span> },
    { key: "retorno", header: "Retorno", align: "right", render: (r) => <span className="font-mono tnum" style={{ color: (r.retorno ?? 0) >= 0 ? "var(--pos)" : "var(--neg)" }}>{signPct(r.retorno, 1)}</span> },
  ];

  return (
    <>
      <PageHeader title="Home" description="Visão do dia" />
      <KpiStrip kpis={kpis} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 mt-3.5">
        <Panel
          title="Patrimônio · 12m"
          right={
            typeof data?.retornoTotalRVPct === "number" ? (
              <span className="font-mono" style={{ fontSize: 10.5, color: "var(--pos)" }}>{signPct(data.retornoTotalRVPct, 1)} RV</span>
            ) : null
          }
        >
          {curve.length > 1 ? (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={curve} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="patrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={palette.accent} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="data" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  contentStyle={TT_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(v: number | string) => [compactBRL(Number(v)), "Patrimônio"]}
                />
                <Area type="monotone" dataKey="patrimonio" stroke={palette.accent} strokeWidth={2} fill="url(#patrFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid place-items-center font-mono" style={{ height: 170, color: "var(--muted)", fontSize: 12 }}>
              {loading ? "Carregando…" : "Sem histórico patrimonial — preencha lb_historic."}
            </div>
          )}
        </Panel>

        <Panel title="Radar de mercado" pad={0}>
          {fxPairs.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <tbody>
                {fxPairs.map((p, i) => (
                  <tr key={p.k} style={{ borderBottom: i < fxPairs.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <td className="font-mono font-bold" style={{ padding: "11px 16px", color: "var(--text)" }}>{p.k}</td>
                    <td className="font-mono tnum" style={{ padding: "11px 16px", textAlign: "right", color: "var(--text-2)" }}>
                      {p.v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 4 })}
                    </td>
                    <td
                      className="font-mono tnum"
                      style={{ padding: "11px 16px", textAlign: "right", width: 84, fontWeight: 600, color: (p.d ?? 0) >= 0 ? "var(--pos)" : "var(--neg)" }}
                    >
                      {p.d === null ? "—" : `${(p.d ?? 0) >= 0 ? "▲" : "▼"} ${signPct(p.d)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="font-mono" style={{ padding: "20px 16px", color: "var(--muted)", fontSize: 12 }}>{loading ? "Carregando…" : "—"}</div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 mt-3.5">
        <Panel title="Maiores posições" pad={0}>
          <Blotter columns={cols} rows={positions.slice(0, 6)} rowKey={(r) => r.ticker} emptyLabel={loading ? "Carregando…" : "Sem posições."} />
        </Panel>
        <Panel title="Contribuição do dia · %">
          {contrib.length ? <MiniBars items={contrib} /> : <div className="font-mono" style={{ color: "var(--muted)", fontSize: 12 }}>{loading ? "Carregando…" : "—"}</div>}
        </Panel>
      </div>
    </>
  );
}
