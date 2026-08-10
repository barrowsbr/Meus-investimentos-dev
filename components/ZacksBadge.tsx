"use client";

// Badge do Zacks Rank (1 Strong Buy … 5 Strong Sell) — usado nos cards de
// detalhe do ETF Cem e da Renda Variável. Busca /api/zacks/<ticker> (cache
// 12h) e some em silêncio quando não há rank (B3, internacionais com sufixo
// de bolsa, fundos fora da cobertura). Ticker com sufixo nem é consultado.

import { useEffect, useState } from "react";
import { fetchJsonCached } from "@/lib/client-cache";

interface ZacksInfo { ticker: string; rank: number; texto: string; atualizado: string | null; error?: string }

const ROTULO_PT: Record<number, string> = {
  1: "compra forte", 2: "compra", 3: "neutro", 4: "venda", 5: "venda forte",
};
const COR: Record<number, { bg: string; border: string; color: string }> = {
  1: { bg: "rgba(16,185,129,0.16)", border: "rgba(16,185,129,0.5)", color: "#34d399" },
  2: { bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.35)", color: "#6ee7b7" },
  3: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", color: "#fbbf24" },
  4: { bg: "rgba(249,115,22,0.14)", border: "rgba(249,115,22,0.45)", color: "#fb923c" },
  5: { bg: "rgba(239,68,68,0.14)", border: "rgba(239,68,68,0.5)", color: "#f87171" },
};

export default function ZacksBadge({ ticker, className = "" }: { ticker: string; className?: string }) {
  const [info, setInfo] = useState<ZacksInfo | null>(null);

  useEffect(() => {
    setInfo(null);
    const t = (ticker ?? "").trim().toUpperCase();
    // Universo da Zacks = listagem nos EUA: sem sufixo de bolsa.
    if (!/^[A-Z]{1,6}(-[A-Z])?$/.test(t)) return;
    let vivo = true;
    fetchJsonCached<ZacksInfo>(`/api/zacks/${encodeURIComponent(t)}`, 12 * 60 * 60_000)
      .then((d) => { if (vivo && !d.error && d.rank) setInfo(d); })
      .catch(() => { /* sem rank — badge não aparece */ });
    return () => { vivo = false; };
  }, [ticker]);

  if (!info) return null;
  const cor = COR[info.rank] ?? COR[3];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold ${className}`}
      style={{ background: cor.bg, border: `1px solid ${cor.border}`, color: cor.color }}
      title={`Zacks Rank ${info.rank} (${info.texto})${info.atualizado ? ` · ${info.atualizado}` : ""} — classificação da Zacks Investment Research, baseada em revisões de estimativas de lucro`}
    >
      Zacks #{info.rank} · {ROTULO_PT[info.rank] ?? info.texto}
    </span>
  );
}
