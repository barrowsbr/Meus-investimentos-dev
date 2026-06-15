import type { ReactNode } from "react";

export interface BlotterColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** Largura fixa opcional (px). */
  width?: number;
  render: (row: T, index: number) => ReactNode;
}

interface Props<T> {
  columns: BlotterColumn<T>[];
  rows: T[];
  /** Chave única por linha. */
  rowKey: (row: T, index: number) => string;
  /** Linha de TOTAL opcional (<tfoot>). */
  foot?: ReactNode[];
  emptyLabel?: string;
}

/**
 * Tabela densa do terminal: divisórias de coluna (border-right), header
 * --line-strong, ticker mono, números mono à direita. Lê como planilha de mesa.
 */
export default function Blotter<T>({ columns, rows, rowKey, foot, emptyLabel = "Nenhum dado encontrado." }: Props<T>) {
  const cd = "1px solid var(--line)";
  if (!rows.length) {
    return (
      <div className="font-mono" style={{ padding: "20px 16px", color: "var(--muted)", fontSize: 12 }}>
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--line-strong)" }}>
            {columns.map((c, i) => (
              <th
                key={c.key}
                className="font-mono"
                style={{
                  padding: "8px 14px",
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: ".1em",
                  color: "var(--faint)",
                  textAlign: c.align === "right" ? "right" : "left",
                  whiteSpace: "nowrap",
                  width: c.width,
                  borderRight: i < columns.length - 1 ? cd : "none",
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={rowKey(row, ri)} className="t-blotter-row" style={{ borderBottom: cd }}>
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  style={{
                    padding: "8px 14px",
                    textAlign: c.align === "right" ? "right" : "left",
                    borderRight: ci < columns.length - 1 ? cd : "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.render(row, ri)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--line-strong)" }}>
              {foot.map((cell, i) => (
                <td
                  key={i}
                  className="font-mono"
                  style={{
                    padding: "8px 14px",
                    textAlign: i === 0 ? "left" : "right",
                    fontWeight: 700,
                    color: "var(--text)",
                    borderRight: i < foot.length - 1 ? cd : "none",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
