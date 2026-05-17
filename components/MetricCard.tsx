import type { ReactNode } from "react";

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
}

export default function MetricCard({ label, value, sub, icon }: Props) {
  return (
    <div className="glass-card p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
          {label}
        </span>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <span className="text-2xl font-bold tracking-tight text-zinc-100">
        {value}
      </span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  );
}
