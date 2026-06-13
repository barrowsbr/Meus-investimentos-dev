import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  glowColor?: string;
  borderGradient?: string;
  compact?: boolean;
}

export default function MetricCard({
  label,
  value,
  sub,
  icon,
  trend,
  glowColor,
  compact,
}: Props) {
  const trendColor =
    trend === "up" ? "text-positive" : trend === "down" ? "text-negative" : "";

  const color = glowColor || "#d4a574";

  return (
    <div
      className="py-2 px-3 flex flex-col gap-1 border-l-2"
      style={{ borderColor: color }}
    >
      <div className="flex items-center justify-between">
        <span className="stat-label text-zinc-500">{label}</span>
        {icon && (
          <span style={{ color: `${color}80` }}>{icon}</span>
        )}
      </div>

      <span
        className={`${
          compact ? "text-base sm:text-lg" : "text-lg sm:text-xl"
        } font-bold tracking-tight text-zinc-100 ${trendColor}`}
      >
        {value}
      </span>

      {sub && (
        <span className="text-[10px] md:text-xs text-zinc-400 leading-relaxed">
          {sub}
        </span>
      )}
    </div>
  );
}
