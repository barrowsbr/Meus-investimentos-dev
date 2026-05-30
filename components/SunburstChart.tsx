"use client";

import React, { useMemo, useState, useCallback } from "react";
import { compactBRL } from "@/lib/format";

interface Segment {
  name: string;
  value: number;
  pct: number;
  color: string;
  parentName?: string;
  glow?: string;
}

interface SunburstProps {
  level1: Segment[];
  level2: Segment[];
  level3: Segment[];
  size?: number;
  onSelectClass?: (name: string | null) => void;
  onSelectSector?: (name: string | null) => void;
  selectedClass?: string | null;
  selectedSector?: string | null;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(
  cx: number, cy: number,
  r1: number, r2: number,
  a1: number, a2: number,
): string {
  const span = a2 - a1;
  if (span <= 0.01) return "";
  if (span >= 359.99) {
    const m = a1 + span / 2;
    return [
      arcPath(cx, cy, r1, r2, a1, m),
      arcPath(cx, cy, r1, r2, m, a2),
    ].join(" ");
  }
  const p1 = polar(cx, cy, r2, a2);
  const p2 = polar(cx, cy, r2, a1);
  const p3 = polar(cx, cy, r1, a1);
  const p4 = polar(cx, cy, r1, a2);
  const lg = span > 180 ? 1 : 0;
  return `M${p1.x},${p1.y} A${r2},${r2},0,${lg},0,${p2.x},${p2.y} L${p3.x},${p3.y} A${r1},${r1},0,${lg},1,${p4.x},${p4.y}Z`;
}

interface ArcInfo {
  name: string;
  value: number;
  pct: number;
  color: string;
  parentName?: string;
  startAngle: number;
  endAngle: number;
  innerR: number;
  outerR: number;
  level: number;
}

function layoutArcs(
  segments: Segment[],
  innerR: number,
  outerR: number,
  startAngle: number,
  totalAngle: number,
  level: number,
  gapDeg: number,
): ArcInfo[] {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return [];

  const arcs: ArcInfo[] = [];
  let angle = startAngle;

  for (const seg of segments) {
    const span = (seg.value / total) * totalAngle - gapDeg;
    if (span < 0.3) { angle += (seg.value / total) * totalAngle; continue; }
    arcs.push({
      name: seg.name,
      value: seg.value,
      pct: seg.pct,
      color: seg.color,
      parentName: seg.parentName,
      startAngle: angle + gapDeg / 2,
      endAngle: angle + gapDeg / 2 + span,
      innerR,
      outerR,
      level,
    });
    angle += span + gapDeg;
  }
  return arcs;
}

export default function SunburstChart({
  level1, level2, level3, size = 560,
  onSelectClass, onSelectSector,
  selectedClass, selectedSector,
}: SunburstProps) {
  const [hovered, setHovered] = useState<ArcInfo | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const scale = size / 560;

  const R = useMemo(() => ({
    l1: { inner: 70 * scale, outer: 125 * scale },
    l2: { inner: 132 * scale, outer: 195 * scale },
    l3: { inner: 202 * scale, outer: 260 * scale },
  }), [scale]);

  const filteredL2 = useMemo(() => {
    if (!selectedClass) return level2;
    return level2.filter(s => s.parentName === selectedClass);
  }, [level2, selectedClass]);

  const filteredL3 = useMemo(() => {
    if (selectedSector) return level3.filter(a => a.parentName === selectedSector);
    if (selectedClass) {
      const sectorNames = new Set(
        level2.filter(s => s.parentName === selectedClass).map(s => s.name)
      );
      return level3.filter(a => sectorNames.has(a.parentName ?? ""));
    }
    return level3;
  }, [level3, level2, selectedClass, selectedSector]);

  const arcs1 = useMemo(() => layoutArcs(level1, R.l1.inner, R.l1.outer, 0, 360, 1, 3), [level1, R]);
  const arcs2 = useMemo(() => {
    if (!selectedClass) return layoutArcs(filteredL2, R.l2.inner, R.l2.outer, 0, 360, 2, 1.5);
    const parent = arcs1.find(a => a.name === selectedClass);
    if (!parent) return layoutArcs(filteredL2, R.l2.inner, R.l2.outer, 0, 360, 2, 1.5);
    return layoutArcs(filteredL2, R.l2.inner, R.l2.outer, 0, 360, 2, 1.5);
  }, [filteredL2, arcs1, selectedClass, R]);

  const arcs3 = useMemo(() => {
    if (selectedSector) {
      return layoutArcs(filteredL3, R.l3.inner, R.l3.outer, 0, 360, 3, 0.5);
    }
    if (selectedClass) {
      return layoutArcs(filteredL3, R.l3.inner, R.l3.outer, 0, 360, 3, 0.5);
    }
    return layoutArcs(filteredL3, R.l3.inner, R.l3.outer, 0, 360, 3, 0.5);
  }, [filteredL3, selectedClass, selectedSector, R]);

  const handleClick = useCallback((arc: ArcInfo) => {
    if (arc.level === 1) {
      onSelectClass?.(selectedClass === arc.name ? null : arc.name);
      onSelectSector?.(null);
    } else if (arc.level === 2) {
      onSelectClass?.(arc.parentName ?? null);
      onSelectSector?.(selectedSector === arc.name ? null : arc.name);
    }
  }, [selectedClass, selectedSector, onSelectClass, onSelectSector]);

  function renderArc(arc: ArcInfo, idx: number) {
    let opacity = 1;
    if (arc.level === 1) {
      opacity = selectedClass && selectedClass !== arc.name ? 0.15 : 1;
    } else if (arc.level === 2) {
      opacity = selectedSector && selectedSector !== arc.name ? 0.2 : 0.9;
    } else {
      opacity = 0.75;
    }

    const isHovered = hovered?.name === arc.name && hovered?.level === arc.level;

    return (
      <path
        key={`arc-${arc.level}-${idx}`}
        d={arcPath(cx, cy, arc.innerR, arc.outerR, arc.startAngle, arc.endAngle)}
        fill={arc.color}
        opacity={opacity}
        stroke={isHovered ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.6)"}
        strokeWidth={isHovered ? 2 : arc.level <= 2 ? 1.5 : 0.5}
        style={{ cursor: arc.level <= 2 ? "pointer" : "default", transition: "opacity 0.3s, stroke 0.2s" }}
        onClick={() => handleClick(arc)}
        onMouseEnter={() => setHovered(arc)}
        onMouseLeave={() => setHovered(null)}
      />
    );
  }

  function renderLabel(arc: ArcInfo) {
    const midAngle = (arc.startAngle + arc.endAngle) / 2;
    const span = arc.endAngle - arc.startAngle;
    const midR = (arc.innerR + arc.outerR) / 2;
    const p = polar(cx, cy, midR, midAngle);

    if (arc.level === 1) {
      const abbrev = arc.name === "Renda Variável" ? "RV" : arc.name === "Renda Fixa" ? "RF" : arc.name;
      return (
        <g key={`lbl-${arc.level}-${arc.name}`} style={{ pointerEvents: "none" }}>
          <text x={p.x} y={p.y - 7 * scale} textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.6)" fontSize={9 * scale} fontWeight={600}>
            {abbrev}
          </text>
          <text x={p.x} y={p.y + 9 * scale} textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={14 * scale} fontWeight={800}>
            {arc.pct.toFixed(0)}%
          </text>
        </g>
      );
    }

    if (arc.level === 2 && span > 20) {
      const radAngle = midAngle - 90;
      const flip = radAngle > 90 && radAngle < 270;
      const rotation = flip ? radAngle + 180 : radAngle;

      return (
        <g key={`lbl-${arc.level}-${arc.name}`} style={{ pointerEvents: "none" }}>
          <text
            x={p.x} y={p.y}
            textAnchor="middle" dominantBaseline="middle"
            fill="rgba(255,255,255,0.85)" fontSize={8.5 * scale} fontWeight={600}
            transform={`rotate(${rotation}, ${p.x}, ${p.y})`}
          >
            {arc.name.length > 14 ? arc.name.slice(0, 12) + "…" : arc.name}
          </text>
          {span > 30 && (
            <text
              x={p.x} y={p.y + 11 * scale}
              textAnchor="middle" dominantBaseline="middle"
              fill="rgba(255,255,255,0.45)" fontSize={7.5 * scale} fontWeight={500}
              transform={`rotate(${rotation}, ${p.x}, ${p.y + 11 * scale})`}
            >
              {arc.pct.toFixed(1)}%
            </text>
          )}
        </g>
      );
    }

    if (arc.level === 2 && span > 12) {
      return (
        <text key={`lbl-${arc.level}-${arc.name}`} x={p.x} y={p.y}
          textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.5)" fontSize={7.5 * scale}
          style={{ pointerEvents: "none" }}>
          {arc.pct.toFixed(0)}%
        </text>
      );
    }

    return null;
  }

  return (
    <div className="relative">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-full h-auto">
        <defs>
          <filter id="sun-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Level 3 - outer ring (assets) */}
        {arcs3.map((arc, i) => renderArc(arc, i))}
        {/* Level 2 - middle ring (sectors) */}
        {arcs2.map((arc, i) => renderArc(arc, i))}
        {/* Level 1 - inner ring (macro class) */}
        {arcs1.map((arc, i) => renderArc(arc, i))}

        {/* Labels */}
        {arcs1.map(a => renderLabel(a))}
        {arcs2.map(a => renderLabel(a))}
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center" style={{ marginTop: -2 }}>
          {hovered ? (
            <>
              {hovered.parentName && (
                <p className="text-[9px] text-zinc-600 mb-0.5">{hovered.parentName}</p>
              )}
              <p className="text-xs font-bold text-zinc-200 max-w-[90px] leading-tight">{hovered.name}</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">{hovered.pct.toFixed(1)}%</p>
              <p className="text-[9px] text-zinc-500">{compactBRL(hovered.value)}</p>
            </>
          ) : selectedSector ? (
            <>
              <p className="text-xs font-bold text-zinc-200">{selectedSector}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {level2.find(s => s.name === selectedSector)?.pct?.toFixed(1)}%
              </p>
            </>
          ) : selectedClass ? (
            <>
              <p className="text-xs font-bold text-zinc-200">
                {selectedClass === "Renda Variável" ? "RV" : "RF"}
              </p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {level1.find(d => d.name === selectedClass)?.pct?.toFixed(0)}%
              </p>
            </>
          ) : (
            <p className="text-[9px] text-zinc-700 max-w-[60px] text-center leading-snug">
              Hover p/ detalhes
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
