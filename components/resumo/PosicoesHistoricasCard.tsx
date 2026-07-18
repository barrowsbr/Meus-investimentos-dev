"use client";

// Extraído de app/resumo/page.tsx — Posições em Data Específica: consulta de
// posições históricas por data (RV com preço histórico + RF por valor investido).

import React from "react";
import { Calendar, Search, Loader2 } from "lucide-react";
import { brl, currency } from "@/lib/format";
import type { HistoricoData } from "@/components/resumo/shared";

interface PosicoesHistoricasCardProps {
  histDate: string;
  setHistDate: (v: string) => void;
  histLoading: boolean;
  histData: HistoricoData | null;
  histError: string | null;
  fetchHistorico: (date: string) => void;
}

export default function PosicoesHistoricasCard({
  histDate, setHistDate, histLoading, histData, histError, fetchHistorico,
}: PosicoesHistoricasCardProps) {
  return (
    <div className="glass-card p-5">
      <h2 className="section-title mb-4"><Calendar size={15} />Posições em Data Específica</h2>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Data</label>
          <input
            type="date"
            value={histDate}
            onChange={e => setHistDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            className="px-3 py-2 rounded-lg text-sm font-mono bg-zinc-900/80 border border-zinc-700/50 text-zinc-200 focus:border-amber-500/50 focus:outline-none transition-colors"
          />
        </div>
        <button
          onClick={() => fetchHistorico(histDate)}
          disabled={!histDate || histLoading}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
            !histDate || histLoading
              ? "border-zinc-700 text-zinc-600 cursor-not-allowed"
              : "border-amber-600/50 text-amber-400 hover:bg-amber-600/10"
          }`}
        >
          {histLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {histLoading ? "Consultando…" : "Consultar"}
        </button>
        {histData && (
          <span className="text-[10px] text-zinc-600">
            Cotações de {histData.priceDate ?? "—"}{histData.fxRate ? ` · USD/BRL ${histData.fxRate.toFixed(2)}` : ""}
          </span>
        )}
      </div>

      {histError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">{histError}</div>
      )}

      {histData && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Renda Variável", value: histData.resumo.totalRV_BRL, color: "text-blue-400" },
              { label: "Renda Fixa", value: histData.resumo.totalRF_BRL, color: "text-teal-400" },
              { label: "Total", value: histData.resumo.totalBRL, color: "text-amber-400" },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-3 border border-zinc-800/50" style={{ background: "rgba(19,20,26,0.6)" }}>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{c.label}</div>
                <div className={`text-lg font-bold ${c.color}`}>{brl(c.value)}</div>
              </div>
            ))}
          </div>

          {/* RV table */}
          {histData.rendaVariavel.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Renda Variável · {histData.rendaVariavel.length} ativos</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                      {["Ativo", "Qtd", "PM", "Preço Hist.", "Valor", "Moeda"].map((h, i) => (
                        <th key={h} className={`px-3 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 0 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {histData.rendaVariavel
                      .sort((a, b) => (b.valorHistorico ?? 0) - (a.valorHistorico ?? 0))
                      .map((p, i) => (
                      <tr key={p.ticker} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-zinc-200">{p.ticker}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-400 font-mono text-xs">
                          {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-500 text-xs">
                          {p.custoMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-400 text-xs">
                          {p.precoHistorico !== null ? p.precoHistorico.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-zinc-200">
                          {p.valorHistorico !== null ? currency(p.valorHistorico, p.moeda) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-500 text-[10px]">{p.moeda}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* RF table */}
          {histData.rendaFixa.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Renda Fixa · {histData.rendaFixa.length} títulos</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                      {["Título", "Valor Investido", "Moeda"].map((h, i) => (
                        <th key={h} className={`px-3 py-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 0 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {histData.rendaFixa
                      .sort((a, b) => b.valorInvestido - a.valorInvestido)
                      .map((r, i) => (
                      <tr key={`${r.ticker}-${i}`} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-zinc-200">{r.ticker}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-zinc-200">{brl(r.valorInvestido)}</td>
                        <td className="px-3 py-2 text-right text-zinc-500 text-[10px]">{r.moeda}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {histData.rendaVariavel.length === 0 && histData.rendaFixa.length === 0 && (
            <p className="text-zinc-600 text-sm">Nenhuma posição encontrada nesta data.</p>
          )}
        </div>
      )}
    </div>
  );
}
