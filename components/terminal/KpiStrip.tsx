import type { ReactNode } from "react";

export type Tone = "pos" | "neg" | "info" | "default";

export interface Kpi {
  label: string;
  value: ReactNode;
  tone?: Tone;
  sub?: ReactNode;
}

const toneColor = (t?: Tone) =>
  t === "pos" ? "var(--pos)" : t === "neg" ? "var(--neg)" : t === "info" ? "var(--info)" : "var(--text)";

/**
 * Faixa única de KPIs dividida por hairline. Valor 18px/700 mono.
 * Substitui o uso de <MetricCard>. Grade 2-col no mobile, linha única no desktop.
 * Divisórias via "gap 1px" sobre fundo --line (funciona em qualquer layout).
 */
export default function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  if (!kpis.length) return null;
  return (
    <div
      className="grid grid-cols-2 gap-px sm:grid-cols-none sm:grid-flow-col sm:auto-cols-fr"
      style={{ background: "var(--line)", border: "1px solid var(--line)" }}
    >
      {kpis.map((k, i) => (
        <div key={i} style={{ background: "var(--panel)", padding: "12px 16px" }}>
          <div
            className="font-mono"
            style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".13em", color: "var(--faint)", marginBottom: 6 }}
          >
            {k.label}
          </div>
          <div className="font-mono tnum" style={{ fontSize: 18, fontWeight: 700, color: toneColor(k.tone), lineHeight: 1.1 }}>
            {k.value}
          </div>
          {k.sub != null && (
            <div className="font-mono" style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>
              {k.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
