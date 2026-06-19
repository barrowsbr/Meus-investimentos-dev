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
    <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <span className="text-3xl leading-none">{country.flag}</span>
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
        <div>
          <h2 className="text-lg font-bold leading-tight text-zinc-50">{country.name}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${color}1f`, color }}
            >
              {country.region}
            </span>
            {instability && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
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
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(251,146,60,0.12)", color: "#fb923c" }}
              >
                <Zap size={9} />
                Convergência ({convergence.count} sinais)
              </span>
            )}
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        aria-label="Fechar dossiê"
      >
        <X size={18} />
      </button>
    </div>
  );
}
