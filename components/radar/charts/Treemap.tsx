"use client";

interface TreemapItem {
  label: string;
  value: number;
  pct: number;
  changePct?: number;
  tickers?: string[];
}

interface Props {
  items: TreemapItem[];
}

function fmtBRL(v: number): string {
  if (v >= 1e6) return `R$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$${(v / 1e3).toFixed(0)}K`;
  return `R$${v.toFixed(0)}`;
}

export default function Treemap({ items }: Props) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  const restValue = rest.reduce((s, r) => s + r.value, 0);
  const restPct = rest.reduce((s, r) => s + r.pct, 0);

  const cellColor = (changePct?: number) => {
    if (changePct == null) return { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#a1a1aa" };
    if (changePct >= 0.5) return { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.2)", text: "#4ade80" };
    if (changePct > -0.5) return { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)", text: "#a1a1aa" };
    return { bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.18)", text: "#f87171" };
  };

  const bigCount = Math.min(top.length, 3);
  const smallCount = top.length - bigCount;

  return (
    <div className="space-y-1 overflow-hidden">
      {/* Top items */}
      <div className="grid gap-1" style={{ gridTemplateColumns: top.length === 1 ? "1fr" : top.length === 2 ? "1fr 1fr" : `${top[0].pct}fr ${top.slice(1, bigCount).reduce((s, t) => s + t.pct, 0)}fr` }}>
        {top.slice(0, bigCount).map((item, i) => {
          const c = cellColor(item.changePct);
          return (
            <div
              key={item.label}
              className="rounded-lg p-2.5"
              style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                gridRow: i === 0 && bigCount > 1 ? "1 / 3" : undefined,
              }}
            >
              <p className="text-[11px] font-semibold" style={{ color: c.text }}>{item.label}</p>
              <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{fmtBRL(item.value)} · {item.pct.toFixed(1)}%</p>
              {item.changePct != null && (
                <p className="mt-0.5 font-mono text-[10px] font-semibold" style={{ color: c.text }}>
                  {item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%
                </p>
              )}
            </div>
          );
        })}
      </div>
      {/* Smaller items in a row */}
      {smallCount > 0 && (
        <div className="flex gap-1">
          {top.slice(bigCount).map((item) => {
            const c = cellColor(item.changePct);
            return (
              <div key={item.label} className="flex-1 rounded-lg px-2 py-1.5" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                <p className="truncate text-[10px] font-medium" style={{ color: c.text }}>{item.label}</p>
                <p className="font-mono text-[9px] text-zinc-600">{item.pct.toFixed(1)}%</p>
              </div>
            );
          })}
          {restValue > 0 && (
            <div className="flex-1 rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="truncate text-[10px] text-zinc-500">+{rest.length} outros</p>
              <p className="font-mono text-[9px] text-zinc-600">{restPct.toFixed(1)}%</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
