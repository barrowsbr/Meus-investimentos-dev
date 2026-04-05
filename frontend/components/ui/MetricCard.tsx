interface MetricCardProps {
  loading?: boolean;
  label: string;
  value: string;
  delta?: number;      // positivo = verde, negativo = vermelho
  deltaLabel?: string;
  sub?: string;
}

export default function MetricCard({ label, value, delta, deltaLabel, sub, loading }: MetricCardProps) {
  if (loading) return <div className="bg-[#0f1729]/80 border border-white/[0.07] rounded-xl p-5 animate-pulse h-24" />;
  const deltaColor =
    delta === undefined ? "" :
    delta > 0 ? "text-emerald-400" :
    delta < 0 ? "text-red-400" :
    "text-slate-400";

  return (
    <div className="bg-[#0f1729]/80 backdrop-blur border border-white/[0.07] rounded-xl p-5 flex flex-col gap-1">
      <span className="text-slate-400 text-xs font-medium tracking-widest uppercase">{label}</span>
      <span className="text-2xl font-bold text-slate-50">{value}</span>
      {delta !== undefined && (
        <span className={`text-sm font-semibold ${deltaColor}`}>
          {delta > 0 ? "+" : ""}{delta?.toFixed(2)}%
          {deltaLabel && <span className="text-slate-500 font-normal ml-1">{deltaLabel}</span>}
        </span>
      )}
      {sub && <span className="text-xs text-slate-500 mt-1">{sub}</span>}
    </div>
  );
}
