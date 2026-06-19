"use client";

import { X } from "lucide-react";
import { REGION_COLORS } from "@/lib/world-map";
import type { SelectedCountry } from "@/lib/radar/types";

export default function DossierHeader({ country, onClose }: { country: SelectedCountry; onClose: () => void }) {
  const color = REGION_COLORS[country.region] ?? "#888";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none">{country.flag}</span>
        <div>
          <h2 className="text-lg font-bold leading-tight text-zinc-50">{country.name}</h2>
          <span
            className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: `${color}1f`, color }}
          >
            {country.region}
          </span>
        </div>
      </div>
      <button
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
        aria-label="Fechar dossiê"
      >
        <X size={18} />
      </button>
    </div>
  );
}
