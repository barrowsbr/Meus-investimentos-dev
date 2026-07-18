"use client";

// Extraído de app/resumo/page.tsx — Mapa de Alocação Setorial (treemap) e o
// renderer customizado SectorTreemapContent.

import React from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { compactBRL } from "@/lib/format";
import { TOOLTIP_ITEM_STYLE, TOOLTIP_LABEL_STYLE } from "@/lib/chart-theme";
import { TOOLTIP_STYLE, sectorEconColor } from "@/components/resumo/shared";

interface MapaSetorialCardProps {
  data: { name: string; value: number; pctVal: number; fill: string }[];
  sectorConsolidated: boolean;
}

export default function MapaSetorialCard({ data, sectorConsolidated }: MapaSetorialCardProps) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3">
        Mapa de Alocação Setorial{sectorConsolidated ? " · ETFs abertos" : ""}
      </h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap data={data} dataKey="value" nameKey="name" stroke="none" animationDuration={500}
            content={<SectorTreemapContent />}>
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(v: number) => compactBRL(v)} labelFormatter={(l: string) => l} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectorTreemapContent(props: any) {
  const { x, y, width, height, name, pctVal, depth } = props;
  if (depth === 0 || !name || width < 40 || height < 25) return null;
  const safeName = String(name);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: sectorEconColor(safeName), stroke: "#09090b", strokeWidth: 2, opacity: 0.85 }} />
      {width > 55 && height > 30 && (
        <>
          <text x={x + 5} y={y + 13} fontSize={10} fontWeight={700} fill="#fafafa"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
            {safeName.length > Math.floor(width / 7) ? safeName.slice(0, Math.floor(width / 7)) + "…" : safeName}
          </text>
          <text x={x + 5} y={y + 25} fontSize={9} fill="rgba(255,255,255,0.7)">
            {pctVal?.toFixed(1)}%
          </text>
        </>
      )}
    </g>
  );
}
