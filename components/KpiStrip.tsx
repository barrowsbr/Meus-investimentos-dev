interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

interface Props {
  items: KpiItem[];
}

export default function KpiStrip({ items }: Props) {
  return (
    <div className="kpi-strip">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-0.5 py-2 px-4 flex-1 min-w-[120px]"
        >
          <span className="stat-label text-zinc-500">{item.label}</span>
          <span
            className="text-base font-bold tracking-tight"
            style={{ color: item.color || "#f4f7ff" }}
          >
            {item.value}
          </span>
          {item.sub && (
            <span className="text-[10px] text-zinc-500 leading-relaxed">
              {item.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
