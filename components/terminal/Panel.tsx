import type { CSSProperties, ReactNode } from "react";

interface Props {
  title?: ReactNode;
  /** Slot à direita do header (badges, legendas, ações). */
  right?: ReactNode;
  children: ReactNode;
  /** Padding do corpo (px). 0 para tabelas que encostam na hairline. */
  pad?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Bloco-base do terminal: fundo --panel + hairline reta, sem raio/sombra.
 * Header opcional com micro-rótulo mono uppercase. Substitui o uso de .glass-card.
 */
export default function Panel({ title, right, children, pad = 16, className = "", style }: Props) {
  return (
    <div className={`flex flex-col min-h-0 ${className}`} style={{ background: "var(--panel)", border: "1px solid var(--line)", ...style }}>
      {title != null && (
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".14em", color: "var(--text-2)" }}
          >
            {title}
          </span>
          {right}
        </div>
      )}
      <div className="flex-1 min-h-0" style={{ padding: pad }}>
        {children}
      </div>
    </div>
  );
}
