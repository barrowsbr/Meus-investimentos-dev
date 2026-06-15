"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Column {
  key: string;
  label: string;
  render?: (val: unknown, row: Record<string, unknown>) => React.ReactNode;
  align?: "left" | "right" | "center";
}

interface Props {
  data: Record<string, unknown>[];
  columns: Column[];
  pageSize?: number;
}

/**
 * Tabela densa do terminal: divisórias de coluna, header --line-strong, números
 * mono. Mantém a API (data/columns/render/align) das páginas existentes.
 */
export default function DataTable({ data, columns, pageSize = 20 }: Props) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [data, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const rows = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
    setPage(0);
  }

  if (data.length === 0) {
    return (
      <div className="t-panel p-8 text-center font-mono text-sm" style={{ color: "var(--muted)" }}>
        Nenhum dado encontrado.
      </div>
    );
  }

  const cd = "1px solid var(--line)";

  return (
    <div className="t-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--line-strong)" }}>
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="font-mono cursor-pointer select-none whitespace-nowrap"
                  style={{
                    padding: "8px 14px",
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: ".1em",
                    color: "var(--faint)",
                    textAlign: col.align === "right" ? "right" : col.align === "center" ? "center" : "left",
                    borderRight: i < columns.length - 1 ? cd : "none",
                  }}
                >
                  {col.label}
                  {sortKey === col.key && <span style={{ marginLeft: 4, color: "var(--accent)" }}>{sortAsc ? "↑" : "↓"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="t-blotter-row" style={{ borderBottom: cd }}>
                {columns.map((col, ci) => (
                  <td
                    key={col.key}
                    className="whitespace-nowrap"
                    style={{
                      padding: "8px 14px",
                      color: "var(--text-2)",
                      textAlign: col.align === "right" ? "right" : col.align === "center" ? "center" : "left",
                      borderRight: ci < columns.length - 1 ? cd : "none",
                    }}
                  >
                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div
          className="flex items-center justify-between px-4 py-2.5 font-mono"
          style={{ borderTop: cd, fontSize: 11, color: "var(--muted)" }}
        >
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} de {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ border: cd }}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2" style={{ color: "var(--text-2)" }}>
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ border: cd }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
