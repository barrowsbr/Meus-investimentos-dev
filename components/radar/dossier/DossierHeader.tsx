"use client";

import { X, Shield, Zap } from "lucide-react";
import { REGION_COLORS } from "@/lib/world-map";
import type { SelectedCountry, InstabilityData } from "@/lib/radar/types";
import type { ConvergenceResult } from "@/lib/radar/convergence";

const LEVEL_COLOR: Record<string, string> = {
  baixo: "#4ade80",
  moderado: "#facc15",
  elevado: "#fb923c",
  crítico: "#f87171",
};

const LEVEL_LABEL: Record<string, string> = {
  baixo: "Baixo",
  moderado: "Moderado",
  elevado: "Elevado",
  crítico: "Crítico",
};

export default function DossierHeader({
  country, instability, convergence, onClose,
}: {
  country: SelectedCountry;
  instability?: InstabilityData | null;
  convergence?: ConvergenceResult | null;
  onClose: () => void;
}) {
  const color = REGION_COLORS[country.region] ?? "#888";

  return (
    <div className="flex items-start justify-between gap-2 border-b border-white/10 px-3 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative shrink-0">
          <span className="text-2xl leading-none">{country.flag}</span>
          {convergence?.active && (
            <span
              className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full"
              style={{ background: "rgba(251,146,60,0.3)", boxShadow: "0 0 8px rgba(251,146,60,0.5)" }}
            >
              <span
                className="h-2 w-2 animate-pulse rounded-full"
                style={{ background: "#fb923c" }}
              />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold leading-tight text-zinc-50">{country.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span
              className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: `${color}1f`, color }}
            >
              {country.region}
            </span>
            {instability && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: `${LEVEL_COLOR[instability.level]}15`,
                  color: LEVEL_COLOR[instability.level],
                }}
              >
                <Shield size={9} />
                {instability.score} · {LEVEL_LABEL[instability.level]}
              </span>
            )}
            {convergence?.active && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(251,146,60,0.12)", color: "#fb923c" }}
              >
                <Zap size={9} />
                {convergence.count} sinais
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-300 transition-colors active:scale-95"
        style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
        aria-label="Fechar dossiê"
      >
        <X size={20} />
      </button>
    </div>
  );
}
