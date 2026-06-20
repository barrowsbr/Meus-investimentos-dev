"use client";

interface WaterfallItem {
  label: string;
  value: number;
}

interface Props {
  items: WaterfallItem[];
}

function fmtBRL(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "−";
  if (abs >= 1e6) return `${sign}R$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}R$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}R$${abs.toFixed(0)}`;
}

export default function WaterfallChart({ items }: Props) {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + i.value, 0);
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value)), Math.abs(total), 1);

  return (
    <div className="flex items-end gap-1" style={{ height: 120 }}>
      {items.map((item) => {
        const h = Math.max((Math.abs(item.value) / maxAbs) * 80, 4);
        const isPos = item.value >= 0;
        const color = isPos ? "#4ade80" : "#f87171";
        const bg = isPos
          ? "linear-gradient(to top, rgba(74,222,128,0.15), rgba(74,222,128,0.4))"
          : "linear-gradient(to top, rgba(248,113,113,0.15), rgba(248,113,113,0.4))";
        return (
          <div key={item.label} className="flex flex-1 flex-col items-center justify-end">
            <span className="mb-1 font-mono text-[8px] font-semibold" style={{ color }}>{fmtBRL(item.value)}</span>
            <div className="w-full rounded-t" style={{ height: h, background: bg }} />
            <span className="mt-1 truncate text-center text-[8px] text-zinc-500" style={{ maxWidth: "100%" }}>{item.label}</span>
          </div>
        );
      })}
      <div className="flex flex-1 flex-col items-center justify-end" style={{ borderLeft: "1px dashed rgba(255,255,255,0.1)", paddingLeft: 4 }}>
        <span className="mb-1 font-mono text-[8px] font-semibold text-blue-400">{fmtBRL(total)}</span>
        <div
          className="w-full rounded-t"
          style={{
            height: Math.max((Math.abs(total) / maxAbs) * 80, 4),
            background: "linear-gradient(to top, rgba(59,130,246,0.15), rgba(59,130,246,0.4))",
          }}
        />
        <span className="mt-1 text-[8px] font-semibold text-blue-400">Total</span>
      </div>
    </div>
  );
}
