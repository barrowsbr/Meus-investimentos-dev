"use client";

// Vista compartilhada do detector de divergência (usada pelo painel do Radar,
// components/radar/TransmissaoPanel). Só apresentação: recebe o relatório pronto
// (o fetch mora em useDivergence). Usa as CSS vars de tema — o painel do Radar
// força-as escuras no seu escopo.
//
// Design (pedido do dono): o CARD fala em português — badge + título + UMA frase
// do que aconteceu + rodapé curto. O jargão (choque, z-scores, tabela de efeitos,
// mecanismo, falsificação) mora no POPUP que abre ao tocar no card.

import { useState } from "react";
import { ArrowUp, ArrowDown, Check, X, AlertTriangle, Loader2, ChevronRight } from "lucide-react";
import type { DivergenceReport, RuleEvaluation, Estado, EffectOutcome, Efeito } from "@/lib/macro-map/types";

export const STATE: Record<Estado, { label: string; cor: string; alerta: boolean }> = {
  anomalo: { label: "Anômalo", cor: "#E8A33D", alerta: true },
  regime_rompido: { label: "Regime rompido", cor: "#F0504A", alerta: true },
  observando: { label: "Observando", cor: "#5BA8FF", alerta: false },
  confirmado: { label: "Confirmado", cor: "#3FB950", alerta: false },
  quiescente: { label: "Calmo", cor: "var(--faint)", alerta: false },
  sem_dados: { label: "Sem dados", cor: "var(--faint)", alerta: false },
};

const FAMILIA_LABEL: Record<string, string> = {
  energia: "Energia", juros: "Juros / Fed", fx: "Dólar / Câmbio", credito: "Crédito / Risco", brasil: "Brasil",
};

// Nomes em português dos símbolos — para as frases não falarem "BR_RISK_PREMIUM".
const SYMBOL_LABEL: Record<string, string> = {
  BRENT: "o petróleo Brent", GOLD: "o ouro", DXY: "o dólar (DXY)", USDBRL: "o dólar/real",
  US10Y: "o juro de 10 anos dos EUA", US02Y: "o juro de 2 anos dos EUA", US10Y_REAL: "o juro real de 10 anos dos EUA",
  SPX: "o S&P 500", IBOV: "o Ibovespa", US_SMALLCAP: "as small caps dos EUA", VIX: "o VIX",
  HY_SPREAD: "o spread de high yield", SELIC_EXP: "a expectativa de Selic", BR_10Y: "o juro longo do Brasil",
  BR_RISK_PREMIUM: "o prêmio de risco do Brasil",
};
const nome = (sym: string) => SYMBOL_LABEL[sym] ?? sym;
// versão para começo de frase (maiúscula) sem o artigo duplicado
const Nome = (sym: string) => {
  const s = nome(sym);
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

// ── leitura acionável do sinal ───────────────────────────────────────────────

// Onde a regra pega na carteira do dono, em rótulo curto.
const CARTEIRA_LABEL: Record<string, string> = {
  SHV: "RF US$", VWRA: "RV mundo", PATRIMONIO_BRL: "patrimônio R$",
};

// Efeito primário da regra (o mesmo critério do motor: alta confiança primeiro).
const efeitoPrimario = (efs: Efeito[] | undefined): Efeito | null =>
  efs?.length ? efs.find((e) => e.confianca === "alta") ?? efs[0] : null;

const janela = ([a, b]: [number, number]): string =>
  a <= 0 ? (b === 0 ? "no dia" : `até ${b} pregões`) : `${a}–${b} pregões`;

// "se disparar → o S&P 500 cai · 1–10 pregões" — o playbook do sinal, sempre
// visível (mesmo em dia calmo), porque antecipação é o produto do painel.
function playbook(a: RuleEvaluation): string | null {
  const p = efeitoPrimario(a.efeitosEsperados);
  if (!p) return null;
  const verbo = p.sinal > 0 ? "sobe" : "cai";
  return `se disparar → ${nome(p.ativo)} ${verbo} · ${janela(p.defasagem_dias)}`;
}

// Selo de confiabilidade HONESTO, derivado do histórico medido ao vivo.
// <35% com amostra decente é informação também: o efeito costuma vir ao contrário.
function selo(a: RuleEvaluation): { texto: string; cor: string } | null {
  if (a.taxaAcertoLive == null) return null;
  const x = Math.round(a.taxaAcertoLive * 100);
  const n = a.nEventos;
  if (n < 8) return { texto: `amostra curta · ${x}% ×${n}`, cor: "var(--faint)" };
  if (a.taxaAcertoLive >= 0.6) return { texto: `confiável · acertou ${x}% ×${n}`, cor: "#3FB950" };
  if (a.taxaAcertoLive <= 0.35) return { texto: `veio o contrário na maioria · ${x}% ×${n}`, cor: "#E8A33D" };
  return { texto: `moeda ao ar · ${x}% ×${n}`, cor: "var(--muted)" };
}

// ── frase em português do que está acontecendo hoje ──────────────────────────
function resumo(a: RuleEvaluation): string {
  const dir = a.choque.direcao === "alta" ? "subiu forte" : "caiu forte";
  if (a.estado === "sem_dados")
    return `Ainda sem fonte de dados para ${a.driversFaltando.map(nome).join(", ")} — a regra fica à espera.`;
  if (a.estado === "quiescente") {
    if (a.ultimoChoqueGeral) {
      const r = a.ultimoChoqueGeral.primarioConfirmado;
      const q = r == null ? "e a janela ainda não fechou" : r ? "e o efeito veio como esperado" : "e o efeito NÃO veio";
      return `Sem movimento relevante hoje. O último foi em ${a.ultimoChoqueGeral.date}, ${q}.`;
    }
    return `Sem movimento relevante — nada a sinalizar hoje.`;
  }
  if (a.estado === "observando")
    return `${Nome(a.choque.driver)} ${dir} hoje; aguardando a janela para ver a reação.`;
  const naoVeio = a.efeitos.filter((e) => !e.confirmado);
  const veio = a.efeitos.filter((e) => e.confirmado);
  if (a.estado === "confirmado")
    return `${Nome(a.choque.driver)} ${dir} e ${(veio.length ? veio : a.efeitos).map((e) => nome(e.ativo)).join(" e ")} reagiu como o mapa previa.`;
  // anomalo / regime_rompido
  const alvo = (naoVeio.length ? naoVeio : a.efeitos).map((e) => nome(e.ativo)).join(" e ");
  return `${Nome(a.choque.driver)} ${dir}, mas ${alvo} não reagiu como esperado — é a divergência.`;
}

function Badge({ estado }: { estado: Estado }) {
  const s = STATE[estado];
  return (
    <span
      className="font-mono shrink-0"
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
        padding: "2px 8px", borderRadius: 3,
        color: s.cor, background: `color-mix(in srgb, ${s.cor} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${s.cor} 40%, transparent)`,
      }}
    >
      {s.label}
    </span>
  );
}

// ── CARD (repouso): só o essencial em português ──────────────────────────────
function RuleCard({ a, onOpen }: { a: RuleEvaluation; onOpen: (a: RuleEvaluation) => void }) {
  const s = STATE[a.estado];
  return (
    <button
      onClick={() => onOpen(a)}
      className="w-full text-left transition-colors"
      style={{ background: "var(--panel)", border: "1px solid var(--line)", borderLeft: `3px solid ${s.alerta ? s.cor : "var(--line)"}` }}
    >
      <div className="flex items-start gap-3" style={{ padding: "12px 14px 10px" }}>
        <div className="min-w-0 flex-1">
          <span className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>
            {FAMILIA_LABEL[a.familia] ?? a.familia}
          </span>
          <p className="font-semibold leading-snug mt-1" style={{ fontSize: 14, color: "var(--text)" }}>{a.titulo}</p>
        </div>
        <Badge estado={a.estado} />
      </div>
      <div style={{ padding: "0 14px 12px" }}>
        {/* a FRASE — o que está acontecendo, em português */}
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: a.estado === "anomalo" || a.estado === "regime_rompido" ? "var(--text)" : "var(--text-2)" }}>
          {resumo(a)}
        </p>
        {/* o playbook: o que esperar quando o gatilho dispara */}
        {playbook(a) && (
          <p className="font-mono mt-2" style={{ fontSize: 11, color: "var(--text-2)" }}>{playbook(a)}</p>
        )}
        {/* rodapé: selo de confiabilidade + onde pega na carteira + detalhes */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2" style={{ fontSize: 10.5 }}>
          {(() => {
            const s2 = selo(a);
            if (a.estado === "sem_dados") return <span style={{ color: "var(--faint)" }}>aguardando fonte</span>;
            if (!s2) return <span style={{ color: "var(--faint)" }}>sem histórico ainda</span>;
            return <span className="font-mono" style={{ color: s2.cor, fontWeight: 700 }}>{s2.texto}</span>;
          })()}
          <span className="font-mono" style={{ color: "var(--faint)" }}>
            {a.relevancia_portfolio.map((t) => CARTEIRA_LABEL[t] ?? t).join(" · ")}
          </span>
          <span className="inline-flex items-center gap-0.5 shrink-0 ml-auto" style={{ color: "var(--muted)" }}>
            detalhes <ChevronRight size={13} />
          </span>
        </div>
      </div>
    </button>
  );
}

// ── linha de efeito (no popup) ───────────────────────────────────────────────
function EfeitoRow({ e }: { e: EffectOutcome }) {
  const seta = e.esperado > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  const okCor = e.confirmado ? "#3FB950" : "#E8A33D";
  return (
    <div className="flex items-center gap-2 py-1.5" style={{ fontSize: 12 }}>
      <span className="min-w-0 flex-1" style={{ color: "var(--text)" }}>{Nome(e.ativo)}</span>
      <span className="inline-flex items-center gap-0.5 font-mono shrink-0" style={{ minWidth: 44, color: "var(--muted)" }}>{seta}</span>
      <span className="font-mono shrink-0" style={{ minWidth: 70, textAlign: "right", color: e.retorno >= 0 ? "#3FB950" : "#F0504A" }}>{pct(e.retorno)}</span>
      <span className="inline-flex items-center gap-1 font-mono shrink-0" style={{ minWidth: 76, color: okCor }}>
        {e.confirmado ? <Check size={13} /> : <X size={13} />}
        {e.confirmado ? "veio" : "não veio"}
      </span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono mb-1.5" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>{titulo}</p>
      {children}
    </div>
  );
}

// ── POPUP de detalhes ────────────────────────────────────────────────────────
function DetailModal({ a, onClose }: { a: RuleEvaluation; onClose: () => void }) {
  const s = STATE[a.estado];
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: "var(--panel)", border: "1px solid var(--line)", paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* cabeçalho */}
        <div className="sticky top-0 flex items-start gap-3 px-4 py-3" style={{ background: "var(--panel)", borderBottom: "1px solid var(--line)" }}>
          <div className="min-w-0 flex-1">
            <span className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>
              {FAMILIA_LABEL[a.familia] ?? a.familia}
            </span>
            <p className="font-semibold leading-snug mt-1" style={{ fontSize: 15, color: "var(--text)" }}>{a.titulo}</p>
          </div>
          <Badge estado={a.estado} />
          <button onClick={onClose} className="shrink-0 -mr-1 -mt-1 p-1" style={{ color: "var(--muted)" }} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* o que aconteceu */}
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text)" }}>{resumo(a)}</p>

          {/* mecanismo — o PORQUÊ */}
          <Secao titulo="Por que essa relação existe">
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-2)" }}>{a.canal}</p>
          </Secao>

          {/* o gatilho */}
          <Secao titulo="O gatilho">
            <p className="font-mono" style={{ fontSize: 12, lineHeight: 1.6, color: "var(--text-2)" }}>
              {Nome(a.choque.driver)} · {a.choque.metrica} · {a.choque.direcao} {a.choque.direcao === "alta" ? "↑" : "↓"} · ≥ {a.choque.limiar_sigma}σ
              {a.ultimoChoque && <span style={{ color: s.cor }}> · disparou {a.ultimoChoque.date} (z60 {a.ultimoChoque.z60}, z250 {a.ultimoChoque.z250})</span>}
            </p>
          </Secao>

          {/* o playbook completo: cada efeito que a regra espera */}
          {a.efeitosEsperados?.length > 0 && (
            <Secao titulo="O que esperar quando dispara">
              <div style={{ borderTop: "1px solid var(--line)" }}>
                {a.efeitosEsperados.map((e) => (
                  <div key={e.ativo} className="flex items-center gap-2 py-1.5" style={{ fontSize: 12 }}>
                    <span className="min-w-0 flex-1" style={{ color: "var(--text)" }}>{Nome(e.ativo)}</span>
                    <span className="inline-flex items-center gap-1 font-mono shrink-0" style={{ color: e.sinal > 0 ? "#3FB950" : "#F0504A" }}>
                      {e.sinal > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      {e.sinal > 0 ? "sobe" : "cai"}
                    </span>
                    <span className="font-mono shrink-0" style={{ minWidth: 92, textAlign: "right", color: "var(--muted)" }}>{janela(e.defasagem_dias)}</span>
                    <span className="font-mono shrink-0" style={{ minWidth: 52, textAlign: "right", color: "var(--faint)", fontSize: 10 }}>{e.confianca}</span>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          {/* efeitos esperados vs. observados */}
          {a.estado !== "sem_dados" && a.efeitos.length > 0 && (
            <Secao titulo="Esperado × observado">
              <div style={{ borderTop: "1px solid var(--line)" }}>
                {a.efeitos.map((e) => <EfeitoRow key={e.ativo} e={e} />)}
              </div>
            </Secao>
          )}
          {a.efeitosNaoMedidos.length > 0 && (
            <p className="flex items-start gap-2" style={{ fontSize: 11.5, color: "var(--faint)" }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Sem fonte para medir {a.efeitosNaoMedidos.map(nome).join(", ")} — não entra na conta.</span>
            </p>
          )}

          {/* histórico */}
          <Secao titulo="Histórico (últimos 5 anos)">
            <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--text-2)" }}>
              {a.taxaAcertoLive == null
                ? "Ainda sem episódios suficientes para medir."
                : `Quando esse gatilho disparou, o efeito principal veio no sentido esperado em ${Math.round(a.taxaAcertoLive * 100)}% dos ${a.nEventos} ${a.nEventos === 1 ? "caso" : "casos"}.`}
            </p>
          </Secao>

          {/* falsificação */}
          <Secao titulo="O que derrubaria essa regra">
            <p style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text-2)" }}>{a.falsificacao}</p>
          </Secao>

          {/* relevância */}
          {a.relevancia_portfolio.length > 0 && (
            <Secao titulo="Afeta na carteira">
              <div className="flex flex-wrap gap-1.5">
                {a.relevancia_portfolio.map((t) => (
                  <span key={t} className="font-mono" style={{ fontSize: 10, color: "var(--muted)", border: "1px solid var(--line)", padding: "2px 7px", borderRadius: 8 }}>{t}</span>
                ))}
              </div>
            </Secao>
          )}
        </div>
      </div>
    </div>
  );
}

export function DivergenceView({
  report, loading, erro, footnote = true,
}: {
  report: DivergenceReport | null;
  loading: boolean;
  erro: string | null;
  footnote?: boolean;
}) {
  const [aberta, setAberta] = useState<RuleEvaluation | null>(null);

  if (erro) return <p style={{ fontSize: 13, color: "#F0504A" }}>Falha ao carregar: {erro}</p>;
  if (!report && loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "var(--muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Rodando o pipeline com os dados do último pregão…</span>
      </div>
    );
  }
  if (!report) return null;
  const r = report.resumo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 12 }}>
        {([
          ["anomalo", r.anomalo, "#E8A33D"],
          ["confirmado", r.confirmado, "#3FB950"],
          ["observando", r.observando, "#5BA8FF"],
          ["quiescente", r.quiescente, "var(--faint)"],
          ["sem dados", r.semDados, "var(--faint)"],
        ] as const).map(([label, n, cor]) => (
          <span key={label} className="font-mono inline-flex items-center gap-1.5" style={{ padding: "3px 9px", border: "1px solid var(--line)", background: "var(--panel)" }}>
            <span style={{ fontWeight: 700, color: cor }}>{n}</span>
            <span style={{ color: "var(--muted)", textTransform: "uppercase", fontSize: 10, letterSpacing: ".06em" }}>{label}</span>
          </span>
        ))}
        <span className="font-mono ml-auto" style={{ color: "var(--faint)", fontSize: 11 }}>
          {report.dataPregao ? `pregão ${report.dataPregao}` : "sem pregão"}
        </span>
      </div>

      <div className="grid gap-2.5">
        {/* Alertas primeiro; no resto, os sinais com histórico mais confiável no topo. */}
        {[...report.avaliacoes]
          .sort((a, b) => {
            const prio = (x: RuleEvaluation) =>
              x.estado === "anomalo" || x.estado === "regime_rompido" ? 0
                : x.estado === "observando" ? 1 : x.estado === "confirmado" ? 2
                : x.estado === "quiescente" ? 3 : 4;
            const pa = prio(a), pb = prio(b);
            if (pa !== pb) return pa - pb;
            return (b.taxaAcertoLive ?? -1) - (a.taxaAcertoLive ?? -1);
          })
          .map((a) => <RuleCard key={a.id} a={a} onOpen={setAberta} />)}
      </div>

      {footnote && (
        <p style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.5 }}>
          Toque num card para ver o mecanismo e os números. O detector compara o que <em>deveria</em> acontecer
          quando um driver dá um choque grande com o que <em>de fato</em> aconteceu — o alerta é a divergência.
        </p>
      )}

      {aberta && <DetailModal a={aberta} onClose={() => setAberta(null)} />}
    </div>
  );
}
