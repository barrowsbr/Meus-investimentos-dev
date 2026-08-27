"use client";

// Aba "E se?" da Transmissão Macro — cenários POR EVENTO (decisão do dono
// 27/08): "estourou a notícia / mexeu o petróleo → o que segue?". Chips por
// cenário com barra de PROXIMIDADE do gatilho (z atual ÷ limiar) e, ao tocar,
// a cadeia de transmissão: ativo → sobe/cai · janela · selo do histórico.
// Direção sem regra própria aparece ESPELHADA e marcada — leitura assumida,
// nunca vendida como histórico medido. Dados: mesmos do detector (sem fetch novo).

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Loader2, Zap } from "lucide-react";
import type { DivergenceReport } from "@/lib/macro-map/types";
import { construirCenarios, type Cenario } from "@/lib/macro-map/cenarios";
import { Nome, janela, seloHistorico, CARTEIRA_LABEL } from "./DivergenceView";

function corProximidade(p: number | null): string {
  if (p == null) return "var(--faint)";
  if (p >= 1) return "#F0504A";
  if (p >= 0.6) return "#E8A33D";
  return "#5BA8FF";
}

function BarraProximidade({ c }: { c: Cenario }) {
  const p = c.proximidade;
  return (
    <div className="mt-1.5">
      <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min((p ?? 0) / 1, 1) * 100}%`, background: corProximidade(p) }} />
      </div>
      <div className="flex items-center justify-between mt-1" style={{ fontSize: 9 }}>
        <span className="font-mono" style={{ color: corProximidade(p) }}>
          {p == null ? "sem leitura" : p >= 1 ? "gatilho atingido" : `${Math.round(p * 100)}% do gatilho`}
        </span>
        {c.zRef && <span className="font-mono" style={{ color: "var(--faint)" }}>z {c.zRef.z60} / {c.zRef.limiar}σ</span>}
      </div>
    </div>
  );
}

function Chip({ c, ativo, onClick }: { c: Cenario; ativo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left transition-colors"
      style={{
        padding: "10px 12px", background: ativo ? "rgba(91,168,255,0.08)" : "var(--panel)",
        border: `1px solid ${ativo ? "rgba(91,168,255,0.45)" : "var(--line)"}`,
        borderLeft: `3px solid ${corProximidade(c.proximidade)}`,
      }}
    >
      <p className="font-semibold leading-tight" style={{ fontSize: 12.5, color: "var(--text)" }}>
        {c.titulo}{c.espelhado && <span className="font-mono ml-1.5" style={{ fontSize: 9, color: "var(--faint)" }}>espelhado</span>}
      </p>
      <BarraProximidade c={c} />
    </button>
  );
}

function Detalhe({ c }: { c: Cenario }) {
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: "14px 16px" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-bold" style={{ fontSize: 15, color: "var(--text)" }}>{c.titulo}</h3>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{c.exemplos}</span>
      </div>

      {c.espelhado && (
        <p className="font-mono mt-2" style={{ fontSize: 10.5, color: "#E8A33D" }}>
          leitura espelhada — as regras foram medidas na direção oposta; os sinais abaixo são o inverso assumido, sem histórico próprio
        </p>
      )}

      <p className="font-mono mt-2" style={{ fontSize: 11, color: corProximidade(c.proximidade) }}>
        <Zap size={11} className="inline -mt-0.5 mr-1" />
        {c.proximidade == null
          ? "sem leitura do driver hoje"
          : c.proximidade >= 1
            ? "gatilho ATINGIDO — cenário em curso"
            : `hoje: ${Math.round(c.proximidade * 100)}% do caminho até o gatilho${c.zRef ? ` (z ${c.zRef.z60} de ${c.zRef.limiar}σ)` : ""}`}
      </p>

      {/* a cadeia: o que segue, em quanto tempo, quanto confiar */}
      <div className="mt-3" style={{ borderTop: "1px solid var(--line)" }}>
        {c.efeitos.map((e) => {
          const s = seloHistorico(e.taxaAcerto, e.nEventos);
          return (
            <div key={e.ativo} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2" style={{ fontSize: 12, borderBottom: "1px solid var(--line)" }}>
              <span className="min-w-0" style={{ color: "var(--text)", flex: "1 1 150px" }}>{Nome(e.ativo)}</span>
              <span className="inline-flex items-center gap-1 font-mono shrink-0 font-bold" style={{ minWidth: 58, color: e.sinal > 0 ? "#3FB950" : "#F0504A" }}>
                {e.sinal > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{e.sinal > 0 ? "sobe" : "cai"}
              </span>
              <span className="font-mono shrink-0" style={{ minWidth: 92, color: "var(--muted)" }}>{janela(e.defasagem_dias)}</span>
              {s && (
                <span className="font-mono shrink-0" style={{ fontSize: 10.5, color: e.espelhado ? "var(--faint)" : s.cor }}>
                  {e.espelhado ? `regra-mãe: ${s.texto}` : s.texto}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2.5" style={{ fontSize: 10.5 }}>
        <span className="font-mono" style={{ color: "var(--faint)" }}>
          na carteira: {c.carteira.map((t) => CARTEIRA_LABEL[t] ?? t).join(" · ")}
        </span>
        {c.ultimoEpisodio && (
          <span className="font-mono" style={{ color: "var(--faint)" }}>
            último episódio real: {c.ultimoEpisodio.date}
            {c.ultimoEpisodio.veio == null ? "" : c.ultimoEpisodio.veio ? " — efeito veio" : " — efeito NÃO veio"}
          </span>
        )}
      </div>
    </div>
  );
}

export function CenariosView({
  report, loading, erro,
}: {
  report: DivergenceReport | null;
  loading: boolean;
  erro: string | null;
}) {
  const { nativos, espelhados } = useMemo(
    () => construirCenarios(report?.avaliacoes ?? []),
    [report],
  );
  const [key, setKey] = useState<string | null>(null);
  const [verEspelhados, setVerEspelhados] = useState(false);

  if (erro) return <p style={{ fontSize: 13, color: "#F0504A" }}>Falha ao carregar: {erro}</p>;
  if (!report && loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "var(--muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Montando os cenários com os dados do último pregão…</span>
      </div>
    );
  }
  if (!report) return null;

  const selecionado =
    [...nativos, ...espelhados].find((c) => c.key === key) ?? nativos[0] ?? espelhados[0] ?? null;

  return (
    <div className="space-y-3">
      <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
        Estourou a notícia? Toque no evento e veja o que costuma seguir. A barra mostra o quão perto o driver está de disparar HOJE.
      </p>

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {nativos.map((c) => <Chip key={c.key} c={c} ativo={selecionado?.key === c.key} onClick={() => setKey(c.key)} />)}
      </div>

      {espelhados.length > 0 && (
        <button onClick={() => setVerEspelhados((v) => !v)} className="font-mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>
          {verEspelhados ? "▾" : "▸"} cenários espelhados ({espelhados.length}) — direção sem histórico próprio
        </button>
      )}
      {verEspelhados && (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {espelhados.map((c) => <Chip key={c.key} c={c} ativo={selecionado?.key === c.key} onClick={() => setKey(c.key)} />)}
        </div>
      )}

      {selecionado && <Detalhe c={selecionado} />}
    </div>
  );
}
