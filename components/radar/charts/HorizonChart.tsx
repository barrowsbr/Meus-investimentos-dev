"use client";

interface HorizonRow {
  label: string;
  values: number[];
}

interface Props {
  rows: HorizonRow[];
  dayLabels?: string[];
}

function heatColor(v: number): string {
  if (v >= 2.5) return "#4ade80";
  if (v >= 1.5) return "#22c55e";
  if (v >= 0.8) return "#16a34a";
  if (v >= 0.3) return "#15803d";
  if (v >= 0.05) return "#1a4d2e";
  if (v > -0.05) return "rgba(255,255,255,0.05)";
  if (v > -0.3) return "#4c1919";
  if (v > -0.8) return "#7f1d1d";
  if (v > -1.5) return "#b91c1c";
  if (v > -2.5) return "#dc2626";
  return "#ef4444";
}

export default function HorizonChart({ rows, dayLabels }: Props) {
  if (!rows.length) return null;

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-right text-[10px] text-zinc-500">{row.label}</span>
          <div className="flex flex-1 gap-px overflow-hidden rounded">
            {row.values.map((v, i) => (
              <div
                key={i}
                className="flex-1"
                style={{ height: 18, background: heatColor(v) }}
                title={`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
              />
            ))}
          </div>
        </div>
      ))}
      {dayLabels && dayLabels.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-12 shrink-0" />
          <div className="flex flex-1 justify-between px-0.5">
            <span className="text-[8px] text-zinc-600">{dayLabels[0]}</span>
            <span className="text-[8px] text-zinc-600">{dayLabels[dayLabels.length - 1]}</span>
          </div>
        </div>
      )}
    </div>
  );
}
