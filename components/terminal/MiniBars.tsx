export interface MiniBarItem {
  k: string;
  v: number;
  c?: string;
}

/** Barras horizontais rotuladas (mono). Largura relativa ao maior valor. */
export default function MiniBars({ items, suffix = "%" }: { items: MiniBarItem[]; suffix?: string }) {
  const max = Math.max(...items.map((i) => i.v), 0) || 1;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => (
        <div key={it.k} className="flex items-center gap-2.5">
          <span className="font-mono truncate" style={{ width: 96, fontSize: 12, color: "var(--text-2)" }}>
            {it.k}
          </span>
          <div className="flex-1 overflow-hidden" style={{ height: 7, background: "var(--bar-track)" }}>
            <div style={{ width: `${(it.v / max) * 100}%`, height: "100%", background: it.c || "var(--accent)" }} />
          </div>
          <span className="font-mono tnum text-right" style={{ width: 56, fontSize: 12, color: "var(--text)" }}>
            {String(it.v).replace(".", ",")}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}
