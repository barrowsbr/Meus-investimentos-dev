import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
}

export default function MetricCard({ label, value, sub, icon, trend }: Props) {
  const trendColor = trend === "up" ? "text-positive" : trend === "down" ? "text-negative" : "";

  return (
    <div className="metric-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium leading-none">
          {label}
        </span>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <span className={`text-xl md:text-2xl font-bold tracking-tight leading-none ${trendColor || "text-zinc-100"}`}>
        {value}
      </span>
      {sub && <span className="text-[11px] text-zinc-500 mt-2 block leading-snug">{sub}</span>}
    </div>
  );
}
