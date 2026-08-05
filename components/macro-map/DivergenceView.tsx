"use client";

// Vista compartilhada do detector de divergência — usada pela página /macro-map
// E pelo painel do Radar (components/radar/TransmissaoPanel). Só apresentação:
// recebe o relatório pronto (o fetch mora em useDivergence). Usa as CSS vars de
// tema (--panel/--line/--text…), então o painel do Radar pode forçá-las escuras
// no seu escopo sem este componente saber de nada.

import { ArrowUp, ArrowDown, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import type { DivergenceReport, RuleEvaluation, Estado, EffectOutcome } from "@/lib/macro-map/types";

export const STATE: Record<Estado, { label: string; cor: string; alerta: boolean }> = {
  anomalo: { label: "Anômalo", cor: "#E8A33D", alerta: true },
  regime_rompido: { label: "Regime rompido", cor: "#F0504A", alerta: true },
  observando: { label: "Observando", cor: "#5BA8FF", alerta: false },
  confirmado: { label: "Confirmado", cor: "#3FB950", alerta: false },
  quiescente: { label: "Quiescente", cor: "var(--faint)", alerta: false },
  sem_dados: { label: "Sem dados", cor: "var(--faint)", alerta: false },
};

const FAMILIA_LABEL: Record<string, string> = {
  energia: "Energia", juros: "Juros / Fed", fx: "Dólar / Câmbio", credito: "Crédito / Risco", brasil: "Brasil",
};

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

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

function EfeitoRow({ e }: { e: EffectOutcome }) {
  const seta = e.esperado > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  const okCor = e.confirmado ? "#3FB950" : "#E8A33D";
  return (
    <div className="flex items-center gap-2 py-1" style={{ fontSize: 12 }}>
      <span className="font-mono font-bold" style={{ minWidth: 92, color: "var(--text)" }}>{e.ativo}</span>
      <span className="inline-flex items-center gap-0.5 font-mono" style={{ minWidth: 58, color: "var(--muted)" }}>
        espera {seta}
      </span>
      <span className="font-mono" style={{ minWidth: 74, color: e.retorno >= 0 ? "#3FB950" : "#F0504A" }}>{pct(e.retorno)}</span>
      <span className="inline-flex items-center gap-1 font-mono" style={{ color: okCor }}>
        {e.confirmado ? <Check size={13} /> : <X size={13} />}
        {e.confirmado ? "veio" : "não veio"}
      </span>
      <span className="font-mono ml-auto" style={{ fontSize: 10, color: "var(--faint)", textTransform: "uppercase" }}>{e.confianca}</span>
    </div>
  );
}

function RuleCard({ a }: { a: RuleEvaluation }) {
  const s = STATE[a.estado];
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderLeft: `3px solid ${s.alerta ? s.cor : "var(--line)"}` }}>
      <div className="flex items-start gap-3" style={{ padding: "12px 14px" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)" }}>
              {FAMILIA_LABEL[a.familia] ?? a.familia}
            </span>
          </div>
          <p className="font-semibold leading-tight" style={{ fontSize: 14, color: "var(--text)" }}>{a.titulo}</p>
        </div>
        <Badge estado={a.estado} />
      </div>

      <div style={{ padding: "0 14px 12px" }}>
        <div className="font-mono flex flex-wrap items-center gap-x-2 gap-y-1" style={{ fontSize: 11, color: "var(--text-2)" }}>
          <span style={{ color: "var(--muted)" }}>choque:</span>
          <span style={{ fontWeight: 700, color: "var(--text)" }}>{a.choque.driver}</span>
          <span>· {a.choque.metrica}</span>
          <span>· {a.choque.direcao} {a.choque.direcao === "alta" ? "↑" : "↓"}</span>
          <span>· ≥ {a.choque.limiar_sigma}σ</span>
          {a.ultimoChoque && (
            <span style={{ color: s.cor }}>· disparou {a.ultimoChoque.date} (z60 {a.ultimoChoque.z60}, z250 {a.ultimoChoque.z250})</span>
          )}
        </div>

        {a.estado === "quiescente" && a.ultimoChoqueGeral && (
          <div className="font-mono mt-1.5" style={{ fontSize: 10.5, color: "var(--faint)" }}>
            último disparo {a.ultimoChoqueGeral.date}{" "}
            {a.ultimoChoqueGeral.primarioConfirmado == null
              ? "· aguardando janela"
              : a.ultimoChoqueGeral.primarioConfirmado
                ? "· efeito veio ✓"
                : "· efeito não veio ✕"}
          </div>
        )}

        {a.estado === "sem_dados" ? (
          <div className="flex items-center gap-2 mt-2" style={{ fontSize: 11, color: "var(--faint)" }}>
            <AlertTriangle size={13} />
            <span>Fonte ainda não integrada — falta {a.driversFaltando.join(", ")}. Regra escrita e válida; fica inerte até a fonte existir.</span>
          </div>
        ) : (
          <>
            {a.efeitos.length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                {a.efeitos.map((e) => <EfeitoRow key={e.ativo} e={e} />)}
              </div>
            )}
            {a.efeitosNaoMedidos.length > 0 && (
              <div className="font-mono mt-1" style={{ fontSize: 10, color: "var(--faint)" }}>
                não medido (sem fonte): {a.efeitosNaoMedidos.join(", ")}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 mt-2 pt-2" style={{ borderTop: "1px solid var(--line)", fontSize: 11 }}>
              <span className="font-mono" style={{ color: "var(--muted)" }}>
                concordância de sinal (ao vivo):{" "}
                <span style={{ color: "var(--text)", fontWeight: 700 }}>
                  {a.taxaAcertoLive == null ? "—" : `${Math.round(a.taxaAcertoLive * 100)}%`}
                </span>{" "}
                <span style={{ color: "var(--faint)" }}>· n={a.nEventos}</span>
              </span>
              <span className="flex gap-1 shrink-0">
                {a.relevancia_portfolio.map((t) => (
                  <span key={t} className="font-mono" style={{ fontSize: 9, color: "var(--muted)", border: "1px solid var(--line)", padding: "1px 5px", borderRadius: 8 }}>{t}</span>
                ))}
              </span>
            </div>
          </>
        )}
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
        {report.avaliacoes.map((a) => <RuleCard key={a.id} a={a} />)}
      </div>

      {footnote && (
        <p style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.5 }}>
          z-score rolante 60/250d (disparo exige concordância das duas janelas); a concordância de sinal é medida ao vivo
          em 5 anos. Fontes: Yahoo (preços), FRED (yield real, spread de high yield), BCB Focus (expectativa de Selic) e
          proxy S&amp;P/EWZ (prêmio de risco BR). Falta só o juro longo BR (NTN-B/DI, sem fonte livre) — aparece como
          &ldquo;não medido&rdquo;. Detecção automática de &ldquo;regime rompido&rdquo; vem na próxima etapa.
        </p>
      )}
    </div>
  );
}
