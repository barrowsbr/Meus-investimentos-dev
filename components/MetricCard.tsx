import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  glowColor?: string;
  compact?: boolean;
}

export default function MetricCard({ label, value, sub, icon, trend, glowColor, compact }: Props) {
  const trendColor = trend === "up" ? "text-positive" : trend === "down" ? "text-negative" : "";

  return (
    <div
      className="glass-card metric-glow p-4 md:p-5 flex flex-col gap-1.5 group transition-transform duration-200 hover:scale-[1.01]"
      style={{ "--glow-color": glowColor || "#d4a574" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">{icon}</span>}
      </div>
      <span className={`${compact ? "text-lg md:text-xl" : "text-xl md:text-2xl"} font-bold tracking-tight text-zinc-100 ${trendColor}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] md:text-xs text-zinc-500 leading-relaxed">{sub}</span>}
    </div>
  );
}
