"use client";

interface Bubble {
  label: string;
  flag?: string;
  x: number;
  y: number;
  size: number;
  highlight?: boolean;
}

interface Props {
  bubbles: Bubble[];
  xLabel?: string;
  yLabel?: string;
}

export default function BubbleScatter({ bubbles, xLabel = "Risco →", yLabel = "Retorno →" }: Props) {
  if (!bubbles.length) return null;

  const maxX = Math.max(...bubbles.map((b) => Math.abs(b.x)), 1);
  const maxY = Math.max(...bubbles.map((b) => Math.abs(b.y)), 1);
  const maxSize = Math.max(...bubbles.map((b) => b.size), 1);

  const W = 300;
  const H = 180;
  const pad = 28;

  const toSvgX = (x: number) => pad + ((x / maxX + 1) / 2) * (W - pad * 2);
  const toSvgY = (y: number) => H - pad - ((y / maxY + 1) / 2) * (H - pad * 2);
  const toR = (s: number) => 6 + (s / maxSize) * 18;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Axes */}
      <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3 3" />
      <line x1={W / 2} y1={pad} x2={W / 2} y2={H - pad} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="3 3" />
      <text x={W / 2} y={H - 4} textAnchor="middle" fill="#3f3f46" fontSize="7">{xLabel}</text>
      <text x={6} y={H / 2} textAnchor="middle" fill="#3f3f46" fontSize="7" transform={`rotate(-90, 6, ${H / 2})`}>{yLabel}</text>

      {/* Bubbles */}
      {bubbles.map((b) => {
        const sx = toSvgX(b.x);
        const sy = toSvgY(b.y);
        const r = toR(b.size);
        const isPos = b.y >= 0;
        const fillColor = isPos ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)";
        const strokeColor = isPos ? "#4ade80" : "#f87171";
        return (
          <g key={b.label}>
            <circle cx={sx} cy={sy} r={r} fill={fillColor} stroke={b.highlight ? "#fff" : strokeColor} strokeWidth={b.highlight ? 1.5 : 1} opacity={b.highlight ? 1 : 0.8} />
            <text x={sx} y={sy + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={r > 12 ? 9 : 7} fontWeight="600">
              {b.flag ?? b.label.slice(0, 2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
