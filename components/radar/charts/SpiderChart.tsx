"use client";

interface Dimension {
  name: string;
  score: number;
}

interface Props {
  dimensions: Dimension[];
  size?: number;
}

export default function SpiderChart({ dimensions, size = 200 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const n = dimensions.length;
  if (n < 3) return null;

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, scale: number) => ({
    x: cx + Math.cos(angle(i)) * r * scale,
    y: cy + Math.sin(angle(i)) * r * scale,
  });

  const rings = [0.33, 0.66, 1];
  const dataPoints = dimensions.map((d, i) => point(i, d.score / 100));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  const scoreColor = (s: number) => {
    if (s >= 80) return "#ef4444";
    if (s >= 70) return "#f87171";
    if (s >= 60) return "#fb923c";
    if (s >= 50) return "#f59e0b";
    if (s >= 40) return "#facc15";
    if (s >= 30) return "#a3e635";
    if (s >= 20) return "#4ade80";
    return "#34d399";
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((scale) => {
        const pts = Array.from({ length: n }, (_, i) => point(i, scale));
        return (
          <polygon
            key={scale}
            points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="0.5"
          />
        );
      })}
      {dimensions.map((_, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={point(i, 1).x}
          y2={point(i, 1).y}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.5"
        />
      ))}
      <polygon points={dataPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(251,146,60,0.12)" stroke="#fb923c" strokeWidth="1.5" />
      {dimensions.map((d, i) => {
        const dp = dataPoints[i];
        const lp = point(i, 1.18);
        return (
          <g key={d.name}>
            <circle cx={dp.x} cy={dp.y} r={3} fill="#fb923c" />
            <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="central" fill="#a1a1aa" fontSize={9} fontWeight={600}>
              {d.name}
            </text>
            <text x={dp.x} y={dp.y - 8} textAnchor="middle" fill={scoreColor(d.score)} fontSize={8} fontWeight={700} fontFamily="monospace">
              {d.score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
