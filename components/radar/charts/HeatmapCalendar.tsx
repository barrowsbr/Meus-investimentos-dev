"use client";

interface DayData {
  date: string;
  changePct: number | null;
}

interface Props {
  days: DayData[];
}

function heatBg(v: number): string {
  const abs = Math.abs(v);
  const t = Math.min(abs / 2.5, 1);
  const alpha = 0.08 + t * 0.45;
  if (v >= 0) return `rgba(74,222,128,${alpha.toFixed(2)})`;
  return `rgba(248,113,113,${alpha.toFixed(2)})`;
}

function heatText(v: number): string {
  const abs = Math.abs(v);
  if (v >= 0) {
    if (abs >= 1.5) return "#4ade80";
    if (abs >= 0.5) return "#86efac";
    return "#a7f3d0";
  }
  if (abs >= 1.5) return "#f87171";
  if (abs >= 0.5) return "#fca5a5";
  return "#fecaca";
}

const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export default function HeatmapCalendar({ days }: Props) {
  if (!days.length) return null;

  const first = new Date(days[0].date + "T12:00:00");
  const startDow = (first.getDay() + 6) % 7;

  const cells: (DayData | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (const d of days) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-center text-[8px] font-semibold text-zinc-600">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell || cell.changePct === null) {
            return (
              <div
                key={i}
                className="flex items-center justify-center rounded text-[8px] text-zinc-700"
                style={{ aspectRatio: "1", background: "rgba(255,255,255,0.02)" }}
              >
                {cell ? "—" : ""}
              </div>
            );
          }
          const v = cell.changePct;
          const isToday = i === cells.length - 1 - (cells.length - days.length - startDow);
          return (
            <div
              key={i}
              className="flex items-center justify-center rounded font-mono text-[8px] font-semibold"
              style={{
                aspectRatio: "1",
                background: heatBg(v),
                color: heatText(v),
                border: isToday ? "1px solid rgba(59,130,246,0.4)" : "none",
              }}
              title={`${cell.date}: ${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
            >
              {v >= 0 ? "+" : ""}{v.toFixed(1)}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        <span className="text-[8px] text-zinc-600">−3%</span>
        <div className="h-1.5 w-16 rounded-full" style={{ background: "linear-gradient(to right, #7f1d1d, #991b1b, rgba(255,255,255,0.04), #166534, #22c55e)" }} />
        <span className="text-[8px] text-zinc-600">+3%</span>
      </div>
    </div>
  );
}
