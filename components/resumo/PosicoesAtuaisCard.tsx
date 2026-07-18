"use client";

// Extraído de app/resumo/page.tsx — tabela de Posições Atuais (snapshot da
// bolsa + RF manual de fixa_aberta), respeitando o filtro macro global.

import React from "react";
import { Briefcase } from "lucide-react";
import { brl, compactBRL, currency } from "@/lib/format";
import type { Position } from "@/lib/portfolio";
import { SECTOR_COLORS } from "@/components/resumo/shared";

// Shape derivado na página (posicoesRFManual) — RF manual de fixa_aberta
// enriquecida com a rentabilidade do /api/composicao/resumo.
export interface PosicaoRFManual {
  ticker: string;
  setor: string;
  moeda: string;
  valorBRL: number;
  proventosBRL: number;
  retornoPct: number | null;
  nrPct: number | null;
}

interface PosicoesAtuaisCardProps {
  filteredPositions: Position[];
  posicoesRFManual: PosicaoRFManual[];
  activeFilter: string;
}

export default function PosicoesAtuaisCard({ filteredPositions, posicoesRFManual, activeFilter }: PosicoesAtuaisCardProps) {
  return (
    <div className="glass-card p-5">
      <h2 className="section-title mb-4"><Briefcase size={15} />Posições Atuais{activeFilter !== "global" ? ` — ${activeFilter}` : ""}</h2>
      {(filteredPositions.length + posicoesRFManual.length) > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "#1E2028" }}>
                {["Ativo", "Setor", "Qtd", "Preço", "Valor", "Dividendos", "Retorno"].map((h, i) => (
                  <th key={h} className={`px-3 py-2.5 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider ${i > 1 ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPositions.map((p, i) => {
                // Fonte única: campos vêm do snapshot (lib/portfolio.ts).
                const dividendosBRL = p.proventosBRL;
                const realizadoBRL = p.lucroRealizadoBRL ?? 0;
                const naoRealizadoPct = p.lucroPct;                 // Valorização %
                const realizadoPct = p.custoTotalBRL > 0 ? (realizadoBRL / p.custoTotalBRL) * 100 : 0;
                const totalPct = p.retornoTotalPct;                 // Retorno Total %
                const corTotal = totalPct !== null ? (totalPct >= 0 ? "text-emerald-400" : "text-red-400") : "text-zinc-500";

                return (
                  <tr key={p.ticker} className={`border-b hover:bg-white/[0.025] transition-colors ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-zinc-200">{p.ticker}</span>
                      <span className="text-zinc-600 text-[10px] ml-1.5">{p.moeda}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[p.setor] || "#71717a"}15`, color: SECTOR_COLORS[p.setor] || "#71717a" }}>
                        {p.setor}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 font-mono text-xs">
                      {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400 text-xs">
                      {p.precoAtual !== null ? `${p.quoteCurrency ?? p.moeda} ${p.precoAtual.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-zinc-200">
                      {p.valorAtual !== null ? currency(p.valorAtual, p.moeda) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      {dividendosBRL > 0 ? (
                        <span className="text-amber-400 font-mono">{compactBRL(dividendosBRL)}</span>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className={`font-bold text-sm ${corTotal}`}>
                        {totalPct !== null
                          ? `${totalPct >= 0 ? "+" : ""}${totalPct.toFixed(1)}%`
                          : "—"}
                      </div>
                      <div className="text-[9px] text-zinc-600 font-mono mt-0.5">
                        <span title="Não realizado">
                          {naoRealizadoPct !== null
                            ? `NR ${naoRealizadoPct >= 0 ? "+" : ""}${naoRealizadoPct.toFixed(1)}%`
                            : "NR —"}
                        </span>
                        {" · "}
                        <span title="Realizado">
                          {`R ${realizadoPct >= 0 ? "+" : ""}${realizadoPct.toFixed(1)}%`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* RF manual (Tesouro/NTN/CDB/caixa) — só em fixa_aberta */}
              {posicoesRFManual.map((r, i) => (
                <tr key={`rf-${r.ticker}-${i}`} className={`border-b hover:bg-white/[0.025] transition-colors ${(filteredPositions.length + i) % 2 === 1 ? "bg-white/[0.01]" : ""}`} style={{ borderColor: "rgba(30,32,40,0.5)" }}>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-zinc-200">{r.ticker}</span>
                    <span className="text-zinc-600 text-[10px] ml-1.5">{r.moeda}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="tag" style={{ backgroundColor: `${SECTOR_COLORS[r.setor] || "#0f766e"}15`, color: SECTOR_COLORS[r.setor] || "#0f766e" }}>
                      {r.setor}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-700 font-mono text-xs">—</td>
                  <td className="px-3 py-2.5 text-right text-zinc-700 text-xs">—</td>
                  <td className="px-3 py-2.5 text-right font-medium text-zinc-200">{brl(r.valorBRL)}</td>
                  <td className="px-3 py-2.5 text-right text-xs">
                    {r.proventosBRL > 0 ? (
                      <span className="text-amber-400 font-mono">{compactBRL(r.proventosBRL)}</span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.retornoPct !== null ? (
                      <div className={`font-bold text-sm ${r.retornoPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {r.retornoPct >= 0 ? "+" : ""}{r.retornoPct.toFixed(1)}%
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-600">—</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-zinc-600 text-sm">Nenhuma posição.</p>}
    </div>
  );
}
