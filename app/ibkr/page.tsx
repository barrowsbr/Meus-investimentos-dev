"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Wifi, AlertCircle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { pct, currency } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import type { IbkrOverview } from "@/lib/ibkr-overview";

const IBKR_RED = "#d6001c";
const cor = (v: number) => (v >= 0 ? "var(--pos)" : "var(--neg)");

const nf = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Formato compacto com símbolo (US$ / R$). */
function compact(v: number | null | undefined, sym: string): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `${sym} ${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sym} ${(v / 1e3).toFixed(1)}k`;
  return `${sym} ${nf(v, 2)}`;
}
const signed = (v: number | null | undefined, sym: string) => (v != null && v >= 0 ? "+" : "") + compact(v, sym);
const pctOr = (v: number | null | undefined) => (v == null ? "—" : pct(v));

function fmtDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// ── Hero (marca IBKR + patrimônio em US$ no topo) ─────────────────────────────

function IbkrHero({ data }: { data: IbkrOverview }) {
  const k = data.kpis;
  const dayPos = k.lucroDiaBRL >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 mb-5" style={{ background: `linear-gradient(135deg, ${IBKR_RED} 0%, #8c0012 100%)`, border: "1px solid rgba(255,255,255,0.12)" }}>
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 85% 20%, #fff 0, transparent 45%)" }} />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex items-center gap-4">
          <Image
            src="/midias/51q7eieUfKL.png"
            alt="Interactive Brokers"
            width={64}
            height={64}
            priority
            className="shrink-0 object-cover"
            style={{ borderRadius: 14, boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}
          />
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

        {/* Patrimônio — dólar em destaque, real abaixo, + lucro do dia */}
        <div className="text-left md:text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,.7)" }}>Patrimônio</div>
          <div className="font-mono font-extrabold text-white tnum" style={{ fontSize: 30, lineHeight: 1.05 }}>{compact(k.patrimonioUSD, "US$")}</div>
          <div className="font-mono text-sm" style={{ color: "rgba(255,255,255,.85)" }}>{compact(k.patrimonioBRL, "R$")}</div>
          <div className="inline-flex items-center gap-1 mt-1 font-mono text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,.22)", color: dayPos ? "#7cffb2" : "#ffb4ab" }}>
            {dayPos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            dia {signed(k.lucroDiaUSD, "US$")} · {signed(k.lucroDiaBRL, "R$")} · {pctOr(k.lucroDiaPct)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── KPI card (US$ em destaque, R$ abaixo) ─────────────────────────────────────

function Kpi({ label, usd, brl, sub, color }: { label: string; usd: string; brl: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col justify-center px-4 py-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <span className="font-mono text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>{label}</span>
      <span className="font-mono text-lg font-bold tnum" style={{ color: color ?? "var(--text)" }}>{usd}</span>
      <span className="font-mono text-[11px] tnum" style={{ color: "var(--muted)" }}>{brl}</span>
      {sub && <span className="font-mono text-[9px] mt-0.5" style={{ color: "var(--faint)" }}>{sub}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--line-strong)" }}>
        <span className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase" style={{ color: "var(--text-2)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ data }: { data: IbkrOverview }) {
  const k = data.kpis;
  return (
    <div className="animate-fade-in">
      <IbkrHero data={data} />

      {/* Métricas principais — US$ no topo de cada card, R$ abaixo */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px mb-5" style={{ background: "var(--line)", border: "1px solid var(--line)" }}>
        <Kpi label="Patrimônio" usd={compact(k.patrimonioUSD, "US$")} brl={compact(k.patrimonioBRL, "R$")} sub={`${k.posicoes} posições`} />
        <Kpi label="Custo" usd={compact(k.custoUSD, "US$")} brl={compact(k.custoBRL, "R$")} />
        <Kpi label="Resultado total" usd={signed(k.resultadoUSD, "US$")} brl={signed(k.resultadoBRL, "R$")} sub={pctOr(k.resultadoPct)} color={cor(k.resultadoBRL)} />
        <Kpi label="Lucro do dia" usd={signed(k.lucroDiaUSD, "US$")} brl={signed(k.lucroDiaBRL, "R$")} sub={pctOr(k.lucroDiaPct)} color={cor(k.lucroDiaBRL)} />
        <Kpi label="Dividendos líq." usd={compact(k.dividendosLiquidoUSD, "US$")} brl={compact(k.dividendosLiquidoBRL, "R$")} sub={`bruto ${compact(k.dividendosBRL, "R$")}`} color="var(--pos)" />
        <Kpi label="Imposto retido" usd={compact(k.impostosUSD, "US$")} brl={compact(k.impostosBRL, "R$")} color="var(--neg)" />
      </div>

      {/* Por moeda */}
      {data.byCurrency.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {data.byCurrency.map((c) => (
            <div key={c.moeda} className="px-3 py-2 rounded-lg" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <span className="font-mono text-[10px] font-bold" style={{ color: "var(--accent)" }}>{c.moeda}</span>
              <span className="font-mono text-xs ml-2" style={{ color: "var(--text)" }}>{currency(c.marketValue, c.moeda)}</span>
              <span className="font-mono text-[10px] ml-2" style={{ color: cor(c.pnl) }}>tot {c.pnl >= 0 ? "+" : ""}{nf(c.pnl, 0)}</span>
              <span className="font-mono text-[10px] ml-2" style={{ color: cor(c.dayPnl) }}>dia {c.dayPnl >= 0 ? "+" : ""}{nf(c.dayPnl, 0)}</span>
              <span className="font-mono text-[9px] ml-2" style={{ color: "var(--muted)" }}>· {c.count} pos.</span>
            </div>
          ))}
        </div>
      )}

      {/* Posições — valor em US$ e R$, com variação do dia e resultado total */}
      <Section title={`Posições (${data.positions.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Ativo", "Classe", "Qtd", "Preço atual", "Dia", "Valor US$", "Valor R$", "Result."].map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 2 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((p) => (
                <tr key={p.ticker} style={{ borderBottom: "1px solid var(--line)" }} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5 font-bold" style={{ color: "var(--text)" }}>{p.ticker}</td>
                  <td className="px-3 py-1.5" style={{ color: "var(--muted)" }}>{p.assetClass}</td>
                  <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                  <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{currency(p.markPrice, p.moeda)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium" style={{ color: cor(p.dayPnl) }}>{p.dayChangePct !== null ? pct(p.dayChangePct) : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{p.marketValueUSD !== null ? compact(p.marketValueUSD, "US$") : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium" style={{ color: "var(--text)" }}>{p.marketValueBRL !== null ? compact(p.marketValueBRL, "R$") : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: cor(p.pnl) }}>{p.pnlPct !== null ? pct(p.pnlPct) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Dividendos por ativo */}
      {data.dividendsByTicker.length > 0 && (
        <div className="mt-5">
          <Section title={`Dividendos por ativo (${data.dividendsByTicker.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    {["Ativo", "Moeda", "Dividendos", "Imposto", "Líquido"].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 2 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.dividendsByTicker.map((d) => (
                    <tr key={d.ticker} style={{ borderBottom: "1px solid var(--line)" }} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-1.5 font-bold" style={{ color: "var(--text)" }}>{d.ticker}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--muted)" }}>{d.moeda}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--pos)" }}>{currency(d.dividendos, d.moeda)}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--neg)" }}>{d.impostos > 0 ? currency(d.impostos, d.moeda) : "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: "var(--text)" }}>{currency(d.liquido, d.moeda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Proventos */}
        <Section title={`Proventos & impostos (${data.proventos.length})`}>
          <div className="overflow-x-auto" style={{ maxHeight: 360, overflowY: "auto" }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: "var(--panel)" }}>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  {["Data", "Ticker", "Tipo", "Valor"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i === 3 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
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
            </table>
          </div>
        </Section>

        {/* Trades */}
        <Section title={`Operações recentes (${data.trades.length})`}>
          <div className="overflow-x-auto" style={{ maxHeight: 360, overflowY: "auto" }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: "var(--panel)" }}>
                <tr style={{ borderBottom: "1px solid var(--line)" }}>
                  {["Data", "Tipo", "Ativo", "Qtd", "Preço"].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 3 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
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
            </table>
          </div>
        </Section>
      </div>

      {/* Câmbio */}
      {data.cambio.length > 0 && (
        <div className="mt-5">
          <Section title={`Câmbio (${data.cambio.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    {["Data", "De → Para", "Origem", "Destino", "Taxa"].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-bold uppercase ${i >= 2 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cambio.map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td className="px-3 py-1.5 font-mono" style={{ color: "var(--muted)" }}>{fmtDate(c.data)}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--text)" }}>{c.de} → {c.para}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{c.valorOrigem}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{c.valorDestino}</td>
                      <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{c.taxa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      <p className="text-[10px] mt-5" style={{ color: "var(--faint)" }}>
        Posições e custo do extrato IBKR Flex; preço atual e variação do dia via cotações ao vivo. Conversão US$/R$ via {data.meta.fxSource}.
      </p>
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
      <PageHeader title="IBKR" description="Visão gerencial · Interactive Brokers (via Flex Web Service)" />

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
