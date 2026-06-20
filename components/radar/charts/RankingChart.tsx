"use client";

interface RankItem {
  label: string;
  flag?: string;
  value: number;
  changePct: number;
}

interface Props {
  items: RankItem[];
}

function fmtVal(v: number): string {
  if (v >= 1e4) return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export default function RankingChart({ items }: Props) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => b.changePct - a.changePct);
  const maxAbs = Math.max(...sorted.map((i) => Math.abs(i.changePct)), 0.5);

  return (
    <div className="space-y-1">
      {sorted.map((item, i) => {
        const pct = item.changePct;
        const barW = Math.max((Math.abs(pct) / maxAbs) * 80, 12);
        const isPos = pct >= 0;
        const color = isPos ? "#4ade80" : "#f87171";
        const bgFrom = isPos ? "rgba(74,222,128,0.04)" : "rgba(248,113,113,0.04)";
        const bgTo = isPos ? "rgba(74,222,128,0.16)" : "rgba(248,113,113,0.16)";
        return (
          <div key={item.label} className="flex items-center gap-1.5">
            <span className="w-4 text-right font-mono text-[9px] text-zinc-600">{i + 1}</span>
            <span className="w-[70px] truncate text-[11px]" style={{ color: isPos ? "#86efac" : "#fca5a5" }}>
              {item.flag ?? ""} {item.label}
            </span>
            <div className="flex-1">
              <div
                className="flex items-center justify-between rounded-md px-2"
                style={{
                  width: `${barW}%`,
                  height: 22,
                  background: `linear-gradient(to right, ${bgFrom}, ${bgTo})`,
                }}
              >
                <span className="font-mono text-[10px] font-semibold" style={{ color }}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                </span>
                <span className="font-mono text-[9px] text-zinc-600">{fmtVal(item.value)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
