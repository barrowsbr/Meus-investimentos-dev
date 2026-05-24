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
  borderGradient,
  compact,
}: Props) {
  const trendColor =
    trend === "up" ? "text-positive" : trend === "down" ? "text-negative" : "";

  const color = glowColor || "#d4a574";
  // Derive a subtle gradient border from glowColor when no explicit gradient is given
  const gradient =
    borderGradient ||
    `linear-gradient(135deg, ${color}55 0%, ${color}18 45%, ${color}38 100%)`;

  return (
    <div
      className="rounded-2xl p-px transition-transform duration-200 hover:scale-[1.01] group"
      style={{
        background: gradient,
        boxShadow: `0 4px 28px ${color}18, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      <div
        className="metric-glow rounded-[calc(1rem-1px)] p-4 md:p-5 flex flex-col gap-1.5 h-full backdrop-blur-md"
        style={{
          background: "rgba(19, 20, 26, 0.90)",
          "--glow-color": color,
        } as React.CSSProperties}
      >
        <div className="flex items-center justify-between">
          <span className="stat-label">{label}</span>
          {icon && (
            <span
              className="transition-colors duration-200"
              style={{ color: `${color}80` }}
            >
              {icon}
            </span>
          )}
        </div>

        <span
          className={`${
            compact ? "text-lg md:text-xl" : "text-xl md:text-2xl"
          } font-bold tracking-tight text-zinc-100 ${trendColor}`}
        >
          {value}
        </span>

        {sub && (
          <span className="text-[10px] md:text-xs text-zinc-500 leading-relaxed">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
