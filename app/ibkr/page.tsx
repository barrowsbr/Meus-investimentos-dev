"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  Loader2, Wifi, AlertCircle, ArrowUpRight, ArrowDownRight, X,
  Wallet, TrendingUp, Layers, Coins, Receipt, ChevronRight,
} from "lucide-react";
import { pct, currency } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import AssetLogo from "@/components/AssetLogo";
import { displayName } from "@/lib/asset-brands";
import type { IbkrOverview, OverviewPosition } from "@/lib/ibkr-overview";

const IBKR_RED = "#d6001c";
const cor = (v: number) => (v >= 0 ? "var(--pos)" : "var(--neg)");
const nf = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Paleta para a barra de alocação (cores distintas, legíveis no dark).
const ALLOC_COLORS = ["#d6001c", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#eab308", "#64748b"];

function compact(v: number | null | undefined, sym: string): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (a >= 1e6) return `${s}${sym} ${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${s}${sym} ${(a / 1e3).toFixed(1)}k`;
  return `${s}${sym} ${nf(a, 2)}`;
}
const signed = (v: number | null | undefined, sym: string) => (v != null && v >= 0 ? "+" : "") + compact(v, sym);
// buildIbkrOverview entrega PROPORÇÕES (ex.: 0,0182 = 1,82%); pct() espera o
// número já em pontos percentuais (1,82). Por isso escalamos por 100 aqui —
// igual a Home faz (pct(lucroDiaPct * 100)). Sem isso, a variação do dia e o
// resultado saíam 100× menores (1,8% virava "0,0%").
const pctOr = (v: number | null | undefined) => (v == null ? "—" : pct(v * 100));
const pctR = (v: number) => pct(v * 100);

function fmtDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function IbkrHero({ data }: { data: IbkrOverview }) {
  const k = data.kpis;
  const dayPos = k.lucroDiaBRL >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 mb-5" style={{ background: `linear-gradient(135deg, ${IBKR_RED} 0%, #8c0012 100%)`, border: "1px solid rgba(255,255,255,0.12)" }}>
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 85% 20%, #fff 0, transparent 45%)" }} />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex items-center gap-4">
          <Image src="/midias/51q7eieUfKL.png" alt="Interactive Brokers" width={64} height={64} priority className="shrink-0 object-cover" style={{ borderRadius: 14, boxShadow: "0 4px 18px rgba(0,0,0,.35)" }} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white" style={{ fontSize: 22, letterSpacing: "-.01em" }}>Interactive Brokers</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>
                <Wifi size={10} /> Conectado · Flex
              </span>
            </div>
            <p className="font-mono text-[11px] mt-1" style={{ color: "rgba(255,255,255,.78)" }}>
              Conta {data.meta.accountId || "—"} · {fmtDate(data.meta.fromDate)} → {fmtDate(data.meta.toDate)}
              {data.meta.usdbrl ? ` · USD/BRL ${nf(data.meta.usdbrl, 3)}` : ""}
            </p>
          </div>
        </div>

        {/* Patrimônio TOTAL = posições + caixa */}
        <div className="text-left md:text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,.7)" }}>Patrimônio total</div>
          <div className="font-mono font-extrabold text-white tnum" style={{ fontSize: 30, lineHeight: 1.05 }}>{compact(k.patrimonioTotalUSD, "US$")}</div>
          <div className="font-mono text-sm" style={{ color: "rgba(255,255,255,.85)" }}>{compact(k.patrimonioTotalBRL, "R$")}</div>
          <div className="flex md:justify-end items-center gap-2 mt-1.5 flex-wrap">
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.20)", color: "rgba(255,255,255,.85)" }}>
              Posições {compact(k.patrimonioUSD, "US$")}
            </span>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: "rgba(0,0,0,.20)", color: "rgba(255,255,255,.85)" }}>
              <Wallet size={10} /> Caixa {compact(k.caixaUSD, "US$")}
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.22)", color: dayPos ? "#7cffb2" : "#ffb4ab" }}>
              {dayPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              dia {signed(k.lucroDiaUSD, "US$")} · {pctOr(k.lucroDiaPct)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function Kpi({ icon, label, usd, brl, sub, color }: { icon: React.ReactNode; label: string; usd: string; brl: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col justify-center px-4 py-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>{icon}{label}</span>
      <span className="font-mono text-lg font-bold tnum" style={{ color: color ?? "var(--text)" }}>{usd}</span>
      <span className="font-mono text-[11px] tnum" style={{ color: "var(--muted)" }}>{brl}</span>
      {sub && <span className="font-mono text-[9px] mt-0.5" style={{ color: "var(--faint)" }}>{sub}</span>}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--line-strong)" }}>
        <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Barra de alocação (por posição, em R$) ─────────────────────────────────────

function AllocationBar({ positions }: { positions: OverviewPosition[] }) {
  const withVal = positions
    .map((p) => ({ ticker: p.ticker, val: p.marketValueBRL ?? p.marketValue }))
    .filter((p) => p.val > 0)
    .sort((a, b) => b.val - a.val);
  const total = withVal.reduce((s, p) => s + p.val, 0);
  if (total <= 0) return null;

  const top = withVal.slice(0, 8);
  const outrosVal = withVal.slice(8).reduce((s, p) => s + p.val, 0);
  const segs = outrosVal > 0 ? [...top, { ticker: "Outros", val: outrosVal }] : top;

  return (
    <div className="px-4 py-3">
      <div className="h-3 w-full rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,0.04)" }}>
        {segs.map((s, i) => (
          <div key={s.ticker} title={`${s.ticker} · ${(s.val / total * 100).toFixed(1)}%`} style={{ width: `${(s.val / total) * 100}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
        {segs.map((s, i) => (
          <div key={s.ticker} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
            <span className="font-mono text-[10px]" style={{ color: "var(--text-2)" }}>{s.ticker}</span>
            <span className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>{(s.val / total * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal de detalhe da posição (popup) ────────────────────────────────────────

function PositionModal({ data, p, onClose }: { data: IbkrOverview; p: OverviewPosition; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const div = data.dividendsByTicker.find((d) => d.ticker === p.ticker);
  const txs = data.trades.filter((t) => t.ticker === p.ticker).slice(0, 12);
  const stats: Array<{ label: string; value: string; color?: string }> = [
    { label: "Quantidade", value: nf(p.quantidade, 4) },
    { label: "Preço médio", value: currency(p.custoPreco, p.moeda) },
    { label: "Preço atual", value: currency(p.markPrice, p.moeda) },
    { label: "Variação do dia", value: p.dayChangePct !== null ? pctR(p.dayChangePct) : "—", color: p.dayChangePct !== null ? cor(p.dayChange) : undefined },
    { label: "Valor (US$)", value: compact(p.marketValueUSD, "US$") },
    { label: "Valor (R$)", value: compact(p.marketValueBRL, "R$") },
    { label: "Custo", value: compact(p.cost, p.moeda === "USD" ? "US$" : "R$") },
    { label: "Resultado", value: `${p.pnl >= 0 ? "+" : ""}${nf(p.pnl)} ${p.moeda}`, color: cor(p.pnl) },
  ];

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="flex w-full flex-col overflow-hidden shadow-2xl sm:max-w-2xl" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <AssetLogo ticker={p.ticker} name={displayName(p.ticker)} size={44} />
            <div className="min-w-0">
              <div className="font-bold text-base" style={{ color: "var(--text)" }}>{displayName(p.ticker)}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-xs font-semibold" style={{ color: "var(--muted)" }}>{p.ticker}</span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>· {p.moeda} · {p.assetClass || "—"}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0" style={{ color: "var(--muted)" }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ overscrollBehavior: "contain" }}>
          {/* Hero do ativo */}
          <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted)" }}>Valor atual</div>
              <div className="text-2xl font-extrabold" style={{ color: "var(--text)" }}>{compact(p.marketValueBRL, "R$")}</div>
              <div className="text-xs font-semibold" style={{ color: cor(p.pnl) }}>{p.pnlPct !== null ? `${pctR(p.pnlPct)} resultado` : "—"}</div>
            </div>
            <div className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: p.dayChange >= 0 ? "rgba(63,185,80,0.12)" : "rgba(240,80,74,0.12)", color: cor(p.dayChange) }}>
              {p.dayChange >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              dia {p.dayChangePct !== null ? pctR(p.dayChangePct) : "—"} · {signed(p.dayPnlBRL, "R$")}
            </div>
          </div>

          {/* Grade de stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden mb-5" style={{ background: "var(--line)" }}>
            {stats.map((s) => (
              <div key={s.label} className="p-3" style={{ background: "var(--panel)" }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{s.label}</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: s.color ?? "var(--text)" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Dividendos do ativo */}
          {div && (
            <div className="rounded-xl px-4 py-3 mb-5 flex items-center justify-between" style={{ background: "rgba(63,185,80,0.06)", border: "1px solid rgba(63,185,80,0.15)" }}>
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--pos)" }}>Dividendos recebidos</span>
              <div className="text-right">
                <div className="font-mono text-sm font-bold" style={{ color: "var(--text)" }}>{currency(div.liquido, div.moeda)} líq.</div>
                <div className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>bruto {currency(div.dividendos, div.moeda)} · imposto {currency(div.impostos, div.moeda)}</div>
              </div>
            </div>
          )}

          {/* Operações do ativo */}
          <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
            Operações {txs.length > 0 && <span className="opacity-60">({txs.length})</span>}
          </h3>
          {txs.length === 0 ? (
            <p className="text-xs italic" style={{ color: "var(--muted)" }}>Sem operações no período do extrato.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--line)" }}>
              <table className="w-full text-xs">
                <thead><tr style={{ borderBottom: "1px solid var(--line)" }}>
                  {["Data", "Tipo", "Qtd", "Preço"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-semibold uppercase ${i >= 2 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {txs.map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td className="px-3 py-1.5 font-mono" style={{ color: "var(--muted)" }}>{fmtDate(t.data)}</td>
                      <td className="px-3 py-1.5 font-semibold" style={{ color: t.tipo === "Compra" ? "var(--pos)" : "var(--neg)" }}>{t.tipo}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{t.quantidade}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{t.moeda} {t.preco}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Atividade (abas) ───────────────────────────────────────────────────────────

type AbaAtividade = "operacoes" | "proventos" | "cambio";

function Atividade({ data }: { data: IbkrOverview }) {
  const [aba, setAba] = useState<AbaAtividade>("operacoes");
  const tabs: Array<{ id: AbaAtividade; label: string; count: number }> = [
    { id: "operacoes", label: "Operações", count: data.trades.length },
    { id: "proventos", label: "Proventos", count: data.proventos.length },
    { id: "cambio", label: "Câmbio", count: data.cambio.length },
  ];
  return (
    <Section
      title="Atividade recente"
      action={
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setAba(t.id)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wide transition-colors ${aba === t.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              style={aba === t.id ? { background: "rgba(214,0,28,0.22)", color: "#ff6b7a" } : undefined}>
              {t.label} <span className="opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto" style={{ maxHeight: 380, overflowY: "auto" }}>
        <table className="w-full text-xs">
          {aba === "operacoes" && (
            <>
              <thead className="sticky top-0" style={{ background: "var(--panel)" }}><tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Data", "Tipo", "Ativo", "Qtd", "Preço"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 3 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.trades.map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td className="px-3 py-1.5 font-mono" style={{ color: "var(--muted)" }}>{fmtDate(t.data)}</td>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: t.tipo === "Compra" ? "var(--pos)" : "var(--neg)" }}>{t.tipo}</td>
                    <td className="px-3 py-1.5" style={{ color: "var(--text)" }}>{t.ticker}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{t.quantidade}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{t.moeda} {t.preco}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
          {aba === "proventos" && (
            <>
              <thead className="sticky top-0" style={{ background: "var(--panel)" }}><tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Data", "Ticker", "Tipo", "Valor"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i === 3 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.proventos.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td className="px-3 py-1.5 font-mono" style={{ color: "var(--muted)" }}>{fmtDate(p.data)}</td>
                    <td className="px-3 py-1.5" style={{ color: "var(--text)" }}>{p.ticker}</td>
                    <td className="px-3 py-1.5 font-semibold" style={{ color: p.tipo === "Imposto" ? "var(--neg)" : "var(--pos)" }}>{p.tipo}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{p.moeda} {p.valor}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
          {aba === "cambio" && (
            <>
              <thead className="sticky top-0" style={{ background: "var(--panel)" }}><tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Data", "De → Para", "Origem", "Destino", "Taxa"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 2 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.cambio.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-xs italic" style={{ color: "var(--muted)" }}>Sem operações de câmbio no período.</td></tr>
                ) : data.cambio.map((c, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td className="px-3 py-1.5 font-mono" style={{ color: "var(--muted)" }}>{fmtDate(c.data)}</td>
                    <td className="px-3 py-1.5" style={{ color: "var(--text)" }}>{c.de} → {c.para}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{c.valorOrigem}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{c.valorDestino}</td>
                    <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{c.taxa}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </Section>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────────

function Dashboard({ data }: { data: IbkrOverview }) {
  const k = data.kpis;
  const [selected, setSelected] = useState<OverviewPosition | null>(null);
  const semCaixa = data.cashByCurrency.length === 0;

  return (
    <div className="animate-fade-in">
      <IbkrHero data={data} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px mb-5" style={{ background: "var(--line)", border: "1px solid var(--line)" }}>
        <Kpi icon={<Layers size={10} />} label="Posições" usd={compact(k.patrimonioUSD, "US$")} brl={compact(k.patrimonioBRL, "R$")} sub={`${k.posicoes} ativos`} />
        <Kpi icon={<Wallet size={10} />} label="Caixa" usd={compact(k.caixaUSD, "US$")} brl={compact(k.caixaBRL, "R$")} sub={semCaixa ? "ative Cash Report" : data.cashByCurrency.map((c) => `${c.moeda} ${nf(c.valor, 0)}`).join(" · ")} />
        <Kpi icon={<TrendingUp size={10} />} label="Resultado total" usd={signed(k.resultadoUSD, "US$")} brl={signed(k.resultadoBRL, "R$")} sub={pctOr(k.resultadoPct)} color={cor(k.resultadoBRL)} />
        <Kpi icon={<ArrowUpRight size={10} />} label="Lucro do dia" usd={signed(k.lucroDiaUSD, "US$")} brl={signed(k.lucroDiaBRL, "R$")} sub={pctOr(k.lucroDiaPct)} color={cor(k.lucroDiaBRL)} />
        <Kpi icon={<Coins size={10} />} label="Dividendos líq." usd={compact(k.dividendosLiquidoUSD, "US$")} brl={compact(k.dividendosLiquidoBRL, "R$")} sub={`bruto ${compact(k.dividendosBRL, "R$")}`} color="var(--pos)" />
        <Kpi icon={<Receipt size={10} />} label="Imposto retido" usd={compact(k.impostosUSD, "US$")} brl={compact(k.impostosBRL, "R$")} color="var(--neg)" />
      </div>

      {/* Alocação */}
      <div className="mb-5">
        <Section title="Alocação por ativo"><AllocationBar positions={data.positions} /></Section>
      </div>

      {/* Posições (clicáveis → popup) */}
      <Section title={`Posições (${data.positions.length})`} action={<span className="font-mono text-[9px]" style={{ color: "var(--faint)" }}>clique para detalhes</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ borderBottom: "1px solid var(--line)" }}>
              {["Ativo", "Qtd", "Preço", "Dia", "Valor R$", "Result."].map((h, i) => (
                <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 1 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
              ))}
              <th className="w-6" />
            </tr></thead>
            <tbody>
              {data.positions.map((p) => (
                <tr key={p.ticker} onClick={() => setSelected(p)} className="cursor-pointer hover:bg-white/[0.03] transition-colors" style={{ borderBottom: "1px solid var(--line)" }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <AssetLogo ticker={p.ticker} name={displayName(p.ticker)} size={22} />
                      <span className="font-bold" style={{ color: "var(--text)" }}>{p.ticker}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--text)" }}>{nf(p.quantidade, p.quantidade < 1 ? 4 : 0)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: "var(--muted)" }}>{currency(p.markPrice, p.moeda)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: cor(p.dayChange) }}>
                    <div className="font-medium">{p.dayChangePct !== null ? pctR(p.dayChangePct) : "—"}</div>
                    {p.dayPnlBRL != null && <div style={{ fontSize: 9, opacity: 0.7 }}>{signed(p.dayPnlBRL, "R$")}</div>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: "var(--text)" }}>{compact(p.marketValueBRL, "R$")}</td>
                  <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: cor(p.pnl) }}>{p.pnlPct !== null ? pctR(p.pnlPct) : "—"}</td>
                  <td className="px-2 text-right"><ChevronRight size={13} style={{ color: "var(--faint)" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Dividendos por ativo + Atividade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {data.dividendsByTicker.length > 0 ? (
          <Section title={`Dividendos por ativo (${data.dividendsByTicker.length})`}>
            <div className="overflow-x-auto" style={{ maxHeight: 380, overflowY: "auto" }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: "var(--panel)" }}><tr style={{ borderBottom: "1px solid var(--line)" }}>
                  {["Ativo", "Bruto", "Imposto", "Líquido"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 1 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.dividendsByTicker.map((d) => (
                    <tr key={d.ticker} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td className="px-3 py-1.5 font-bold" style={{ color: "var(--text)" }}>{d.ticker}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--pos)" }}>{currency(d.dividendos, d.moeda)}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--neg)" }}>{d.impostos > 0 ? currency(d.impostos, d.moeda) : "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: "var(--text)" }}>{currency(d.liquido, d.moeda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : <div />}
        <Atividade data={data} />
      </div>

      <p className="text-[10px] mt-5" style={{ color: "var(--faint)" }}>
        Posições, custo e caixa do extrato IBKR Flex; preço atual e variação do dia via cotações ao vivo. Conversão US$/R$ via {data.meta.fxSource}.
        {semCaixa && " · Saldo indisponível: inclua a seção Cash Report na sua query Flex para ver o caixa."}
      </p>

      {selected && <PositionModal data={data} p={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IbkrPage() {
  const [data, setData] = useState<IbkrOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ibkr/overview")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha ao buscar o extrato IBKR");
        return d as IbkrOverview;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader title="IBKR" description="Painel gerencial · Interactive Brokers (via Flex Web Service)" />

      {loading ? (
        <div className="p-10 text-center animate-fade-in" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
          <Loader2 size={22} className="animate-spin mx-auto" style={{ color: IBKR_RED }} />
          <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>Buscando o extrato da IBKR e cotações (pode levar alguns segundos)…</p>
        </div>
      ) : error ? (
        <div className="p-5 rounded-xl flex items-start gap-2" style={{ background: "rgba(214,0,28,0.08)", border: "1px solid rgba(214,0,28,0.25)" }}>
          <AlertCircle size={16} style={{ color: IBKR_RED }} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Não foi possível carregar</p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{error}</p>
            {error.includes("não configurados") && (
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Defina <code>IBKR_FLEX_TOKEN</code> e <code>IBKR_FLEX_QUERY_ID</code> nas variáveis de ambiente.</p>
            )}
          </div>
        </div>
      ) : data ? (
        <Dashboard data={data} />
      ) : null}
    </main>
  );
}
