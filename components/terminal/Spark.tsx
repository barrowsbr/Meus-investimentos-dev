interface Props {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
  sw?: number;
}

/** Sparkline SVG leve (sem dependência de gráfico) para linhas de blotter. */
export default function Spark({ data, color = "var(--accent)", w = 72, h = 22, sw = 1.5 }: Props) {
  if (!data || data.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / span) * (h - 3) - 1.5]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
