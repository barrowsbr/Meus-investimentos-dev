"use client";

import { useEffect, useState } from "react";
import { Loader2, Wifi, AlertCircle } from "lucide-react";
import { compactBRL, pct, currency } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import type { IbkrOverview } from "@/lib/ibkr-overview";

const IBKR_RED = "#d6001c";

const cor = (v: number) => (v >= 0 ? "var(--pos)" : "var(--neg)");

function fmtDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

// ── IBKR brand hero (logo destacada) ─────────────────────────────────────────

function IbkrHero({ meta }: { meta: IbkrOverview["meta"] }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 md:p-6 mb-5"
      style={{
        background: `linear-gradient(135deg, ${IBKR_RED} 0%, #8c0012 100%)`,
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(circle at 85% 20%, #fff 0, transparent 45%)" }} />
      <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Wordmark IBKR */}
          <div className="flex items-center justify-center shrink-0" style={{ width: 64, height: 64, background: "#fff", borderRadius: 14, boxShadow: "0 4px 18px rgba(0,0,0,.35)" }}>
            <span style={{ color: IBKR_RED, fontWeight: 900, fontSize: 22, letterSpacing: "-1px", fontFamily: "system-ui, sans-serif" }}>IBKR</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white" style={{ fontSize: 22, letterSpacing: "-.01em" }}>Interactive Brokers</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,.18)", color: "#fff" }}>
                <Wifi size={10} /> Conectado · Flex
              </span>
            </div>
            <p className="font-mono text-[11px] mt-1" style={{ color: "rgba(255,255,255,.78)" }}>
              Conta {meta.accountId || "—"} · período {fmtDate(meta.fromDate)} → {fmtDate(meta.toDate)}
            </p>
          </div>
        </div>
        <div className="text-left md:text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,.7)" }}>Câmbio</div>
          <div className="font-mono text-[11px]" style={{ color: "rgba(255,255,255,.9)" }}>fonte: {meta.fxSource}</div>
        </div>
      </div>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col justify-center px-4 py-3" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
      <span className="font-mono text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--faint)" }}>{label}</span>
      <span className="font-mono text-lg font-bold tnum" style={{ color: color ?? "var(--text)" }}>{value}</span>
      {sub && <span className="font-mono text-[9px] mt-0.5" style={{ color: "var(--muted)" }}>{sub}</span>}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ data }: { data: IbkrOverview }) {
  const k = data.kpis;
  return (
    <div className="animate-fade-in">
      <IbkrHero meta={data.meta} />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-5" style={{ background: "var(--line)", border: "1px solid var(--line)" }}>
        <Kpi label="Patrimônio (IBKR)" value={compactBRL(k.patrimonioBRL)} sub="valor de mercado" />
        <Kpi label="Custo" value={compactBRL(k.custoBRL)} />
        <Kpi label="Resultado" value={compactBRL(k.resultadoBRL)} sub={k.resultadoPct !== null ? pct(k.resultadoPct) : undefined} color={cor(k.resultadoBRL)} />
        <Kpi label="Posições" value={String(k.posicoes)} />
        <Kpi label="Dividendos (período)" value={compactBRL(k.dividendosBRL)} color="var(--pos)" />
        <Kpi label="Imposto retido" value={compactBRL(k.impostosBRL)} color="var(--neg)" />
        <Kpi label="Dividendo líquido" value={compactBRL(k.dividendosLiquidoBRL)} color={cor(k.dividendosLiquidoBRL)} />
        <Kpi label="Moedas" value={String(data.byCurrency.length)} sub={data.byCurrency.map((c) => c.moeda).join(" · ")} />
      </div>

      {/* Por moeda */}
      {data.byCurrency.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {data.byCurrency.map((c) => (
            <div key={c.moeda} className="px-3 py-2 rounded-lg" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
              <span className="font-mono text-[10px] font-bold" style={{ color: "var(--accent)" }}>{c.moeda}</span>
              <span className="font-mono text-xs ml-2" style={{ color: "var(--text)" }}>{currency(c.marketValue, c.moeda)}</span>
              <span className="font-mono text-[10px] ml-2" style={{ color: cor(c.pnl) }}>{c.pnl >= 0 ? "▲" : "▼"} {currency(c.pnl, c.moeda)}</span>
              <span className="font-mono text-[9px] ml-2" style={{ color: "var(--muted)" }}>· {c.count} pos.</span>
            </div>
          ))}
        </div>
      )}

      {/* Posições */}
      <Section title={`Posições (${data.positions.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Ativo", "Classe", "Qtd", "Preço médio", "Preço atual", "Valor", "Valor R$", "Result."].map((h, i) => (
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
                  <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{currency(p.custoPreco, p.moeda)}</td>
                  <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--muted)" }}>{currency(p.markPrice, p.moeda)}</td>
                  <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{currency(p.marketValue, p.moeda)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium" style={{ color: "var(--text)" }}>{p.marketValueBRL !== null ? compactBRL(p.marketValueBRL) : "—"}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: cor(p.pnl) }}>
                    {p.pnlPct !== null ? pct(p.pnlPct) : "—"}
                  </td>
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
        Dados do extrato IBKR Flex (Activity). Valores em moeda nativa; conversão R$ via {data.meta.fxSource}. Atualiza no máximo 1×/dia.
      </p>
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
          <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>Buscando o extrato da IBKR (pode levar alguns segundos)…</p>
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
