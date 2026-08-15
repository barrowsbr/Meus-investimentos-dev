"use client";

// Cards "vitrine" da Renda Variável (do relatório PortfolioAnalyst da IBKR):
//   • ESG — nota de RISCO Sustainalytics via Yahoo (quanto MENOR, melhor),
//     média ponderada pelo tamanho das posições + cobertura honesta.
//   • Temas — a cascata LLM agrupa os papéis em temas; os pesos são somados
//     das posições reais (o LLM só agrupa, nunca inventa número).
// Ambos best-effort: sem dado, o card simplesmente não aparece.

import { useEffect, useState } from "react";
import { Leaf, Sparkles } from "lucide-react";
import { fetchJsonCached } from "@/lib/client-cache";

interface ItemEsg { ticker: string; pesoBRL: number; total: number; e: number | null; s: number | null; g: number | null }
interface PayloadEsg { itens: ItemEsg[]; mediaPonderada: number | null; coberturaPct: number; error?: string }
interface Tema { tema: string; descricao: string; tickers: string[]; pesoPct: number }
interface PayloadTemas { temas: Tema[]; error?: string }

// Faixas do risco Sustainalytics (0–40+): menor = melhor.
function faixaEsg(v: number): { rotulo: string; cor: string } {
  if (v < 10) return { rotulo: "risco desprezível", cor: "#34d399" };
  if (v < 20) return { rotulo: "risco baixo", cor: "#a3e635" };
  if (v < 30) return { rotulo: "risco médio", cor: "#fbbf24" };
  if (v < 40) return { rotulo: "risco alto", cor: "#fb923c" };
  return { rotulo: "risco severo", cor: "#f87171" };
}

const CORES_TEMA = ["#3b82f6", "#a855f7", "#E8A33D", "#34d399", "#ec4899", "#22d3ee", "#64748b"];

export default function EsgTemas() {
  const [esg, setEsg] = useState<PayloadEsg | null>(null);
  const [temas, setTemas] = useState<PayloadTemas | null>(null);

  useEffect(() => {
    fetchJsonCached<PayloadEsg>("/api/portfolio/esg", 6 * 60 * 60_000)
      .then(d => { if (!d.error) setEsg(d); }).catch(() => { /* card some */ });
    fetchJsonCached<PayloadTemas>("/api/portfolio/temas", 6 * 60 * 60_000)
      .then(d => { if (!d.error) setTemas(d); }).catch(() => { /* idem */ });
  }, []);

  const temEsg = !!esg && esg.itens.length > 0 && esg.mediaPonderada != null;
  const temTemas = !!temas && temas.temas.length > 0;
  if (!temEsg && !temTemas) return null;

  return (
    <div className={`grid grid-cols-1 ${temEsg && temTemas ? "lg:grid-cols-2" : ""} gap-4 mb-5`}>
      {temEsg && (() => {
        const media = esg!.mediaPonderada!;
        const fx = faixaEsg(media);
        return (
          <div className="glass-card p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="section-title"><Leaf size={15} />ESG da carteira</h2>
              <span className="text-[10px] text-zinc-600">{esg!.coberturaPct}% da carteira tem nota</span>
            </div>
            <p className="text-xs text-zinc-600 mb-3">
              Nota de <b>risco</b> ESG (Sustainalytics, via Yahoo) — quanto <b style={{ color: "var(--text)" }}>menor, melhor</b>. Papéis sem nota (comum na B3) ficam fora da média.
            </p>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-mono text-3xl font-extrabold" style={{ color: fx.cor }}>{media.toFixed(1).replace(".", ",")}</span>
              <span className="text-sm font-semibold" style={{ color: fx.cor }}>{fx.rotulo}</span>
              <span className="text-[10.5px] text-zinc-600">média ponderada pelo tamanho das posições</span>
            </div>
            <div className="flex flex-col gap-1">
              {esg!.itens.slice(0, 8).map(i => {
                const f = faixaEsg(i.total);
                return (
                  <div key={i.ticker} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-16 shrink-0 font-semibold text-zinc-200">{i.ticker}</span>
                    <div className="h-1.5 flex-1 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.min((i.total / 50) * 100, 100)}%`, background: f.cor }} />
                    </div>
                    <span className="w-9 shrink-0 text-right font-mono" style={{ color: f.cor }}>{i.total.toFixed(1).replace(".", ",")}</span>
                    <span className="hidden sm:block w-24 shrink-0 text-right font-mono text-[9.5px] text-zinc-600">
                      E {i.e?.toFixed(1) ?? "—"} · S {i.s?.toFixed(1) ?? "—"} · G {i.g?.toFixed(1) ?? "—"}
                    </span>
                  </div>
                );
              })}
              {esg!.itens.length > 8 && <p className="text-[10px] text-zinc-600 mt-0.5">+ {esg!.itens.length - 8} papéis com nota</p>}
            </div>
          </div>
        );
      })()}

      {temTemas && (
        <div className="glass-card p-5">
          <h2 className="section-title mb-1"><Sparkles size={15} />Temas da carteira</h2>
          <p className="text-xs text-zinc-600 mb-3">
            Onde suas apostas se concentram — papéis agrupados por tema (IA classifica, os pesos vêm das suas posições reais).
          </p>
          <div className="flex flex-col gap-2">
            {temas!.temas.slice(0, 7).map((t, i) => (
              <div key={t.tema}>
                <div className="flex items-center justify-between text-[11.5px] mb-0.5">
                  <span className="font-semibold text-zinc-200">{t.tema}</span>
                  <span className="font-mono font-bold" style={{ color: CORES_TEMA[i % CORES_TEMA.length] }}>{t.pesoPct.toFixed(1).replace(".", ",")}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full mb-0.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.min(t.pesoPct, 100)}%`, background: CORES_TEMA[i % CORES_TEMA.length] }} />
                </div>
                <p className="text-[10px] text-zinc-600 truncate">{t.descricao} · {t.tickers.slice(0, 6).join(", ")}{t.tickers.length > 6 ? "…" : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
