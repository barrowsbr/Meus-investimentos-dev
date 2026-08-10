"use client";

// Painel de GRUPOS do índice mundo — agrega as 500 por SETOR (GICS, vindo do
// arquivo do índice) ou por PAÍS e mostra o termômetro de cada grupo:
//   · variação do dia PONDERADA pelo peso no índice (o "hoje")
//   · distância MEDIANA do topo histórico (o "estrutural")
//   · P/L e yield medianos, nº em desconto ≥20% e nº no topo
// Tocar num grupo FILTRA a lista de empresas; tocar de novo desfaz. Ordenado
// por peso (importância) — a cor conta quem está indo bem ou mal.

import { useMemo } from "react";
import { Layers } from "lucide-react";
import { nomePais, bandeiraPais } from "@/components/etfcem/paises";

export interface LinhaGrupo {
  setor: string;
  pais: string;
  pesoPct: number;
  varDiaPct: number | null;
  distAth: number | null;
  pe: number | null;
  yieldPct: number | null;
}

export type AgruparPor = "setor" | "pais";

const SETOR_PT: Record<string, string> = {
  "Information Technology": "Tecnologia",
  "Financials": "Financeiro",
  "Health Care": "Saúde",
  "Consumer Discretionary": "Consumo discricionário",
  "Consumer Staples": "Consumo básico",
  "Communication Services": "Comunicação",
  "Industrials": "Indústria",
  "Energy": "Energia",
  "Materials": "Materiais",
  "Utilities": "Utilidades",
  "Real Estate": "Imobiliário",
};

export function rotuloGrupo(por: AgruparPor, chave: string): string {
  if (por === "pais") return `${bandeiraPais(chave)} ${nomePais(chave)}`.trim();
  return SETOR_PT[chave] ?? chave;
}

interface Grupo {
  chave: string;
  n: number;
  pesoTotal: number;
  varDia: number | null;      // ponderada por peso
  distMed: number | null;     // mediana
  peMed: number | null;
  yieldMed: number | null;
  emDesconto: number;         // ≥20% abaixo do topo
  noTopo: number;             // < 5% do topo
}

const mediana = (vs: number[]): number | null => {
  if (vs.length === 0) return null;
  const s = [...vs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function agrupar(linhas: LinhaGrupo[], por: AgruparPor): Grupo[] {
  const mapa = new Map<string, LinhaGrupo[]>();
  for (const l of linhas) {
    const chave = (por === "setor" ? l.setor : l.pais) || "—";
    const arr = mapa.get(chave) ?? [];
    arr.push(l);
    mapa.set(chave, arr);
  }
  const grupos: Grupo[] = [];
  for (const [chave, ls] of mapa) {
    const pesoTotal = ls.reduce((s, l) => s + l.pesoPct, 0);
    const comVar = ls.filter((l) => l.varDiaPct !== null);
    const pesoVar = comVar.reduce((s, l) => s + l.pesoPct, 0);
    const varDia = pesoVar > 0 ? comVar.reduce((s, l) => s + l.varDiaPct! * l.pesoPct, 0) / pesoVar : null;
    const dists = ls.map((l) => l.distAth).filter((v): v is number => v !== null);
    grupos.push({
      chave,
      n: ls.length,
      pesoTotal,
      varDia,
      distMed: mediana(dists),
      peMed: mediana(ls.map((l) => l.pe).filter((v): v is number => v !== null && v > 0)),
      yieldMed: mediana(ls.map((l) => l.yieldPct).filter((v): v is number => v !== null)),
      emDesconto: dists.filter((d) => d <= -20).length,
      noTopo: dists.filter((d) => d > -5).length,
    });
  }
  return grupos.sort((a, b) => b.pesoTotal - a.pesoTotal);
}

const f1 = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export default function GruposPanel({
  linhas, agruparPor, aoMudarAgrupamento, grupoSel, aoSelecionar,
}: {
  linhas: LinhaGrupo[];
  agruparPor: AgruparPor;
  aoMudarAgrupamento: (por: AgruparPor) => void;
  grupoSel: string | null;
  aoSelecionar: (chave: string | null) => void;
}) {
  const grupos = useMemo(() => agrupar(linhas, agruparPor), [linhas, agruparPor]);
  const visiveis = grupos.slice(0, 12);
  const resto = grupos.length - visiveis.length;

  if (linhas.length === 0) return null;

  return (
    <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          <Layers size={12} /> Como vão os grupos
        </p>
        <div className="flex gap-1">
          {(["setor", "pais"] as const).map((por) => (
            <button
              key={por}
              onClick={() => { aoMudarAgrupamento(por); aoSelecionar(null); }}
              className="rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors"
              style={{
                background: agruparPor === por ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${agruparPor === por ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.1)"}`,
                color: agruparPor === por ? "#fbbf24" : "#a1a1aa",
              }}
            >
              {por === "setor" ? "Setor" : "País"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3">
        {visiveis.map((g) => {
          const on = grupoSel === g.chave;
          const varCor = g.varDia === null ? "#71717a" : g.varDia < 0 ? "#f87171" : "#34d399";
          const distCor = g.distMed === null ? "#71717a" : g.distMed <= -20 ? "#34d399" : g.distMed > -5 ? "#60a5fa" : "#fbbf24";
          return (
            <button
              key={g.chave}
              onClick={() => aoSelecionar(on ? null : g.chave)}
              className="rounded-xl p-2 text-left transition-colors hover:bg-white/[0.06]"
              style={{
                background: on ? "rgba(245,158,11,0.10)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.08)"}`,
              }}
              title={`${g.n} empresas · P/L mediano ${f1(g.peMed)} · yield ${f1(g.yieldMed)}% · ${g.emDesconto} em desconto ≥20% · ${g.noTopo} no topo`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <p className="truncate text-[11px] font-semibold text-zinc-200">{rotuloGrupo(agruparPor, g.chave)}</p>
                <p className="shrink-0 font-mono text-[9px] text-zinc-500">{g.pesoTotal.toFixed(1)}%</p>
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <p className="font-mono text-[11px] font-bold" style={{ color: varCor }}>
                  {g.varDia !== null ? `${g.varDia >= 0 ? "+" : ""}${g.varDia.toFixed(2)}% hoje` : "—"}
                </p>
                <p className="font-mono text-[10px]" style={{ color: distCor }}>
                  {g.distMed !== null ? (g.distMed > -5 ? "no topo" : `${g.distMed.toFixed(0)}% topo`) : "—"}
                </p>
              </div>
              {/* Barra: posição mediana do grupo em relação ao topo (100% = no topo). */}
              <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(4, 100 + Math.max(-100, g.distMed ?? -100))}%`, background: distCor }} />
              </div>
              <p className="mt-1 text-[9px] text-zinc-600">
                {g.n} empresas · P/L {f1(g.peMed)}{g.emDesconto > 0 ? ` · ${g.emDesconto} em desconto` : ""}
              </p>
            </button>
          );
        })}
      </div>
      {resto > 0 && <p className="mt-1.5 text-[9px] text-zinc-600">+{resto} grupos menores (peso somado &lt; {grupos.slice(12).reduce((s, g) => s + g.pesoTotal, 0).toFixed(1)}%)</p>}
      <p className="mt-1.5 text-[9px] text-zinc-600">
        "Hoje" = variação do dia ponderada pelo peso no índice · "topo" = distância mediana do topo histórico. Toque para filtrar a lista.
      </p>
    </div>
  );
}
