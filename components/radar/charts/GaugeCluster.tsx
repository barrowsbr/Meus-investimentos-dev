"use client";

interface GaugeItem {
  label: string;
  score: number;
}

interface Props {
  items: GaugeItem[];
  total?: { label: string; score: number };
}

function color(s: number) {
  if (s >= 80) return "#ef4444";
  if (s >= 70) return "#f87171";
  if (s >= 60) return "#fb923c";
  if (s >= 50) return "#f59e0b";
  if (s >= 40) return "#facc15";
  if (s >= 30) return "#a3e635";
  if (s >= 20) return "#4ade80";
  return "#34d399";
}

function MiniGauge({ label, score }: GaugeItem) {
  const c = color(score);
  const arcLen = 100.5;
  const offset = arcLen * (1 - score / 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="64" height="38" viewBox="0 0 80 46">
        <path d="M 8 42 A 32 32 0 0 1 72 42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M 8 42 A 32 32 0 0 1 72 42" fill="none" stroke={c} strokeWidth="4.5" strokeLinecap="round" strokeDasharray={String(arcLen)} strokeDashoffset={String(offset)} />
        <text x="40" y="40" textAnchor="middle" fill={c} fontSize="13" fontWeight="700" fontFamily="monospace">{score}</text>
      </svg>
      <span className="text-[9px] text-zinc-500">{label}</span>
    </div>
  );
}

export default function GaugeCluster({ items, total }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-2 sm:gap-3">
      {items.map((g) => (
        <MiniGauge key={g.label} {...g} />
      ))}
      {total && (
        <>
          <div className="mx-1 hidden h-8 w-px bg-white/10 sm:block" />
          <div className="flex flex-col items-center gap-1">
            <svg width="64" height="38" viewBox="0 0 80 46">
              <path d="M 8 42 A 32 32 0 0 1 72 42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" strokeLinecap="round" />
              <path d="M 8 42 A 32 32 0 0 1 72 42" fill="none" stroke={color(total.score)} strokeWidth="5" strokeLinecap="round" strokeDasharray="100.5" strokeDashoffset={String(100.5 * (1 - total.score / 100))} />
              <text x="40" y="40" textAnchor="middle" fill={color(total.score)} fontSize="14" fontWeight="800" fontFamily="monospace">{total.score}</text>
            </svg>
            <span className="text-[9px] font-semibold" style={{ color: color(total.score) }}>{total.label}</span>
          </div>
        </>
      )}
    </div>
  );
}
