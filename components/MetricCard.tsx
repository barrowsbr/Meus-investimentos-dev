import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  /** Aceitos por compatibilidade com chamadas existentes; ignorados no terminal. */
  glowColor?: string;
  borderGradient?: string;
  compact?: boolean;
}

/**
 * Card de métrica no idioma terminal: painel reto + hairline, valor mono/tnum,
 * rótulo micro-uppercase. Sem gradiente/brilho/raio. Mantém a API antiga
 * (glowColor/borderGradient são aceitos, mas não pintam mais a borda).
 */
export default function MetricCard({ label, value, sub, icon, trend, compact }: Props) {
  const valueColor = trend === "up" ? "var(--pos)" : trend === "down" ? "var(--neg)" : "var(--text)";
  return (
    <div
      className="flex flex-col gap-1.5 h-full"
      style={{ background: "var(--panel)", border: "1px solid var(--line)", padding: compact ? "10px 12px" : "12px 16px" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="t-label">{label}</span>
        {icon && <span style={{ color: "var(--muted)" }}>{icon}</span>}
      </div>
      <span
        className="font-mono tnum font-bold"
        style={{ fontSize: compact ? 16 : 18, color: valueColor, lineHeight: 1.1, letterSpacing: "-.01em" }}
      >
        {value}
      </span>
      {sub && (
        <span className="leading-snug" style={{ fontSize: 10, color: "var(--muted)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}
