/* eslint-disable @typescript-eslint/no-explicit-any */
interface Column {
  key: string;
  header: string;
  render?: (row: any) => React.ReactNode;
  align?: "left" | "right" | "center";
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  loading?: boolean;
  emptyMessage?: string;
}

export default function DataTable({ columns, data, loading, emptyMessage = "Sem dados" }: DataTableProps) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return <p className="text-slate-500 text-sm py-4 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.07]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`pb-2 font-semibold text-slate-400 text-xs tracking-wider uppercase
                  ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`py-2.5 ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
                >
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
