"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, StickyNote, ExternalLink } from "lucide-react";
import type { Position } from "@/lib/portfolio";
import { brl, currency, pct } from "@/lib/format";
import { displayName } from "@/lib/asset-brands";
import { yahooTicker } from "@/lib/yahoo-symbol";
import AssetLogo from "@/components/AssetLogo";
import CandleChart from "@/components/CandleChart";
import AssetNews from "@/components/AssetNews";
import AssetBuzz from "@/components/AssetBuzz";

export interface AssetTx {
  data: string;
  tipo: string;
  ticker: string;
  quantidade: number;
  preco: number;
  valorBruto: number;
  moeda: string;
  corretora: string;
}

const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#3b82f6",
  "Ações Internacional": "#8b5cf6",
  "ETF USA": "#06b6d4",
  "ETF": "#10b981",
  "FIIs": "#f59e0b",
  "Cripto": "#f97316",
  "Commodities": "#eab308",
  "BDRs": "#ec4899",
};

function formatTxDate(raw: string): string {
  if (!raw) return "—";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return raw.slice(0, 10);
  return raw.slice(0, 10);
}

const pos = (v: number | null | undefined) => (v ?? 0) >= 0;

export default function AssetDetailModal({
  position: p,
  txs,
  hasUSD,
  noteCount,
  onOpenNotes,
  onClose,
}: {
  position: Position;
  txs: AssetTx[];
  hasUSD: boolean;
  noteCount: number;
  onOpenNotes: (ticker: string) => void;
  onClose: () => void;
}) {
  const vendido = p.vendido === true;
  const sectorColor = SECTOR_COLORS[p.setor] || "#71717a";

  // Portal para o body: o overlay `fixed` precisa cobrir a VIEWPORT inteira.
  // Renderizado dentro do <main> (que tem transform via animate-fade-in), o
  // `position: fixed` se prenderia ao <main> e cobriria só a 1ª tela.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Métrica resumo do herói: valor atual (em carteira) ou resultado realizado (vendido).
  const heroValue = vendido ? brl(p.lucroRealizadoBRL) : brl(p.valorAtualBRL);
  const heroLabel = vendido ? "Resultado realizado" : "Valor atual";
  const retTotPct = p.retornoTotalPct;

  // ── Catálogo de stats — NADA do que a tabela mostrava é perdido ──
  const cor = (ok: boolean) => (ok ? "text-positive" : "text-negative");
  type Stat = { label: string; value: string; className?: string };
  const stats: Stat[] = [
    { label: "Quantidade", value: vendido ? "—" : p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) },
    { label: "Preço médio", value: vendido ? "—" : currency(p.custoMedio, p.moeda) },
    {
      label: "Preço atual",
      value: p.precoAtual !== null
        ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "—",
    },
    { label: "Investido (custo)", value: brl(p.custoTotalBRL) },
    { label: vendido ? "Valor atual" : "Valor atual", value: vendido ? "—" : brl(p.valorAtualBRL) },
    {
      label: vendido ? "Lucro realizado" : "Lucro não realizado",
      value: vendido ? brl(p.lucroRealizadoBRL) : (p.lucroBRL !== null ? brl(p.lucroBRL) : "—"),
      className: cor(vendido ? pos(p.lucroRealizadoBRL) : pos(p.lucroBRL)),
    },
    {
      label: "Valorização %",
      value: vendido ? "—" : (p.lucroPct !== null ? pct(p.lucroPct) : "—"),
      className: vendido ? "" : cor(pos(p.lucroPct)),
    },
    {
      label: "Retorno total %",
      value: retTotPct !== null ? pct(retTotPct) : "—",
      className: retTotPct !== null ? cor(pos(retTotPct)) : "",
    },
    {
      label: "Retorno anualizado %",
      value: p.retornoAnualizadoPct !== null ? pct(p.retornoAnualizadoPct) : "—",
      className: p.retornoAnualizadoPct !== null ? cor(pos(p.retornoAnualizadoPct)) : "",
    },
    { label: "Proventos recebidos", value: brl(p.proventosBRL), className: cor(pos(p.proventosBRL)) },
    { label: "Lucro realizado (vendas)", value: brl(p.lucroRealizadoBRL), className: cor(pos(p.lucroRealizadoBRL)) },
    {
      // VIDA TODA no ticker (não realizado + realizado + proventos, sobre o
      // capital total que já passou por ele) — o "Retorno total %" acima é só
      // da POSIÇÃO ATUAL (ciclos anteriores não a contaminam).
      label: "Resultado histórico do ativo",
      value: p.resultadoHistBRL !== null
        ? `${brl(p.resultadoHistBRL)}${p.resultadoHistPct !== null ? ` (${pct(p.resultadoHistPct)})` : ""}`
        : "—",
      className: p.resultadoHistBRL !== null ? cor(pos(p.resultadoHistBRL)) : "",
    },
    {
      label: "Variação no dia %",
      value: p.dayChangePct !== null ? pct(p.dayChangePct) : "—",
      className: p.dayChangePct !== null ? cor(pos(p.dayChangePct)) : "",
    },
    {
      label: "Variação no dia R$",
      value: p.dayChangeBRL !== null ? brl(p.dayChangeBRL) : "—",
      className: p.dayChangeBRL !== null ? cor(pos(p.dayChangeBRL)) : "",
    },
  ];
  if (hasUSD) {
    stats.push(
      {
        label: "Ganho do ativo (ex-câmbio)",
        value: p.ganhoAtivoBRL !== null ? brl(p.ganhoAtivoBRL) : "—",
        className: p.ganhoAtivoBRL !== null ? cor(pos(p.ganhoAtivoBRL)) : "",
      },
      {
        label: "Efeito câmbio",
        value: p.ganhoCambioBRL !== null ? brl(p.ganhoCambioBRL) : "—",
        className: p.ganhoCambioBRL !== null && p.ganhoCambioBRL !== 0 ? cor(pos(p.ganhoCambioBRL)) : "",
      },
    );
  }

  const purchases = txs
    .filter((tx) => tx.tipo.toLowerCase().includes("compra") || tx.tipo.toLowerCase().includes("buy"))
    .map((tx) => ({ date: tx.data, price: tx.preco, quantidade: tx.quantidade, moeda: tx.moeda }));

  // Link para a página do ativo no Yahoo Finance — usa a MESMA conversão canônica
  // que busca as cotações (ticker interno → símbolo Yahoo, ex.: PETR4 → PETR4.SA,
  // BTC → BTC-USD), garantindo que o link aponte pro mesmo ativo do gráfico.
  const yfUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(yahooTicker(p.ticker, p.moeda, ""))}`;

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col overflow-hidden shadow-2xl sm:max-w-3xl"
        style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, maxHeight: "92vh", paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <AssetLogo ticker={p.ticker} name={displayName(p.ticker)} size={48} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-base" style={{ color: "var(--text)" }}>{displayName(p.ticker)}</span>
                {vendido && (
                  <span className="tag" style={{ backgroundColor: "rgba(113,113,122,0.18)", color: "#a1a1aa" }}>Vendido</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-xs font-semibold" style={{ color: "var(--muted)" }}>{p.ticker}</span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>· {p.moeda}</span>
                <span className="tag" style={{ backgroundColor: `${sectorColor}15`, color: sectorColor }}>{p.setor}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0" style={{ color: "var(--muted)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ overscrollBehavior: "contain" }}>
          {/* Hero + ação de anotações */}
          <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted)" }}>{heroLabel}</div>
              <div className={`text-2xl font-extrabold ${vendido ? cor(pos(p.lucroRealizadoBRL)) : "text-zinc-100"}`}>{heroValue}</div>
              {retTotPct !== null && (
                <div className={`text-xs font-semibold ${cor(pos(retTotPct))}`}>Retorno total {pct(retTotPct)}</div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={yfUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Abrir ${p.ticker} no Yahoo Finance`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-white/5"
                style={{ border: "1px solid var(--line)", color: "var(--muted)" }}
              >
                <ExternalLink size={13} />
                Yahoo Finance
              </a>
              <button
                onClick={() => onOpenNotes(p.ticker)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}
              >
                <StickyNote size={13} />
                Rascunhos & anotações
                {noteCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold" style={{ background: "var(--accent)", color: "#0a0a0a" }}>
                    {noteCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Grade de métricas — tudo que a tabela mostrava (e mais) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-px rounded-xl overflow-hidden mb-5" style={{ background: "var(--line)" }}>
            {stats.map((s) => (
              <div key={s.label} className="p-3" style={{ background: "var(--panel)" }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{s.label}</div>
                <div className={`text-sm font-bold mt-0.5 ${s.className ?? ""}`} style={s.className ? undefined : { color: "var(--text)" }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Gráfico de velas com marcadores de compra */}
          {purchases.length > 0 && (
            <div className="mb-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>Histórico de preço</h3>
              <CandleChart
                ticker={p.ticker}
                moeda={p.moeda}
                corretora={txs[0]?.corretora ?? ""}
                precoAtual={p.precoAtual}
                purchases={purchases}
                showPurchaseList={false}
              />
            </div>
          )}

          {/* Transações */}
          <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
            Transações {txs.length > 0 && <span className="opacity-60">({txs.length})</span>}
          </h3>
          {txs.length === 0 ? (
            <p className="text-xs italic" style={{ color: "var(--muted)" }}>Nenhuma transação encontrada para {p.ticker}.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--line)" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--line)" }}>
                    {["Data", "Tipo", "Qtd", "Preço", "Total", "Lucro Lote", "%", "Corretora"].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-semibold uppercase ${i >= 2 && i <= 6 ? "text-right" : "text-left"}`} style={{ color: "var(--muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txs.map((tx, j) => {
                    const isCompra = tx.tipo.toLowerCase().includes("compra") || tx.tipo.toLowerCase().includes("buy");
                    const lotProfit = isCompra && p.precoAtual !== null ? (p.precoAtual - tx.preco) * tx.quantidade : null;
                    const lotPct = isCompra && p.precoAtual !== null && tx.preco > 0 ? (p.precoAtual - tx.preco) / tx.preco : null;
                    return (
                      <tr key={j} style={{ borderBottom: "1px solid var(--line)" }} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-1.5 font-mono" style={{ color: "var(--muted)" }}>{formatTxDate(tx.data)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`font-semibold ${isCompra ? "text-positive" : "text-negative"}`}>{tx.tipo || (isCompra ? "Compra" : "Venda")}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono" style={{ color: "var(--text)" }}>{tx.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: "var(--muted)" }}>{currency(tx.preco, tx.moeda)}</td>
                        <td className="px-3 py-1.5 text-right font-medium" style={{ color: "var(--text)" }}>{currency(tx.valorBruto, tx.moeda)}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${lotProfit !== null ? (lotProfit >= 0 ? "text-positive" : "text-negative") : ""}`} style={lotProfit === null ? { color: "var(--muted)" } : undefined}>
                          {lotProfit !== null ? currency(lotProfit, tx.moeda) : "—"}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-medium ${lotPct !== null ? (lotPct >= 0 ? "text-positive" : "text-negative") : ""}`} style={lotPct === null ? { color: "var(--muted)" } : undefined}>
                          {lotPct !== null ? pct(lotPct) : "—"}
                        </td>
                        <td className="px-3 py-1.5" style={{ color: "var(--muted)" }}>{tx.corretora}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Buzz & Sentimento (GDELT) — cobertura + tom da notícia global */}
          <AssetBuzz nome={displayName(p.ticker)} />

          {/* Notícias relacionadas ao ativo — imagens preferenciais (estilo Home) */}
          <AssetNews ticker={p.ticker} nome={displayName(p.ticker)} moeda={p.moeda} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
