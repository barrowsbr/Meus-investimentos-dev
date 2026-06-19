"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RadarShell — orquestra o Radar V2: dados (hooks), estado (camada, país, filtro)
// e layout (top bar · rail · mapa+dossiê). O page.tsx é só a casca; a lógica e o
// render vivem em módulos por responsabilidade — fim do monólito de ~2.800 linhas.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, ArrowLeftRight } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { REGION_COLORS, COUNTRY_TO_ISO_NUM } from "@/lib/world-map";
import {
  ISO_NUM_TO_COUNTRY, buildMarketHeat, buildCurrencyHeat, currencyForCountry, type HeatEntry,
} from "@/lib/radar/geo";
import { useMarkets, useCurrencies, useCountryMacro } from "@/lib/radar/use-radar";
import type { RadarLayer, SelectedCountry } from "@/lib/radar/types";
import { RadarMap, type MarkerPoint } from "./RadarMap";
import LayersRail from "./LayersRail";
import RadarTopBar from "./RadarTopBar";
import CountryDossier from "./CountryDossier";

export default function RadarShell() {
  const searchParams = useSearchParams();
  const { data: markets, loading, error } = useMarkets();
  const moedas = useCurrencies();

  const [layer, setLayer] = useState<RadarLayer>("mercados");
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCountry | null>(null);

  const { data: macro, loading: macroLoading } = useCountryMacro(selected?.name ?? null);

  // ── Camada ativa → calor + marcadores ──────────────────────────────────────
  const heat = useMemo<Map<string, HeatEntry>>(() => {
    if (layer === "mercados") return markets ? buildMarketHeat(markets.indices) : new Map();
    return moedas ? buildCurrencyHeat(moedas.currencies) : new Map();
  }, [layer, markets, moedas]);

  const markers = useMemo<MarkerPoint[]>(() => {
    if (layer === "mercados") {
      if (!markets) return [];
      return markets.indices
        .filter((i) => i.symbol !== "^VIX")
        .map((i) => ({ id: i.symbol, lat: i.lat, lng: i.lng, changePct: i.changePct, region: i.region, label: i.name, country: i.country }));
    }
    if (!moedas) return [];
    // changePct = força da moeda local (rate invertido), p/ o ponto verde/vermelho.
    return moedas.currencies.map((c) => ({ id: c.code, lat: c.lat, lng: c.lng, changePct: -c.changePct, region: c.region, label: c.code, country: c.name }));
  }, [layer, markets, moedas]);

  const regions = useMemo(() => {
    const src = layer === "mercados" ? markets?.indices : moedas?.currencies;
    if (!src) return [];
    return [...new Set(src.map((x) => x.region))].sort();
  }, [layer, markets, moedas]);

  // ── Dossiê: índices e moeda locais do país selecionado ─────────────────────
  const localIndices = useMemo(() => {
    if (!selected || !markets) return [];
    return markets.indices.filter((i) => i.country === selected.name && i.symbol !== "^VIX");
  }, [selected, markets]);

  const localCurrency = useMemo(() => {
    if (!selected || !moedas) return null;
    return currencyForCountry(selected.name, moedas.currencies);
  }, [selected, moedas]);

  // ── Seleção por ISO (clique no mapa) ou por nome (busca/deep-link) ─────────
  const selectByName = (name: string) => {
    const iso = COUNTRY_TO_ISO_NUM[name];
    if (!iso) return;
    const idx = markets?.indices.find((i) => i.country === name);
    const cur = moedas ? currencyForCountry(name, moedas.currencies) : null;
    setSelected({
      name,
      iso,
      flag: idx?.flag ?? cur?.flag ?? "🏳️",
      region: idx?.region ?? cur?.region ?? "—",
    });
  };

  const selectByIso = (iso: string) => {
    const name = ISO_NUM_TO_COUNTRY[iso];
    if (name) selectByName(name);
  };

  // ── Deep-link: ?country=Brasil ou ?symbol=^BVSP ────────────────────────────
  const [didDeepLink, setDidDeepLink] = useState(false);
  useEffect(() => {
    if (didDeepLink || !markets) return;
    const country = searchParams.get("country");
    const symbol = searchParams.get("symbol");
    if (country && COUNTRY_TO_ISO_NUM[country]) {
      selectByName(country);
      setDidDeepLink(true);
    } else if (symbol) {
      const match = markets.indices.find((i) => i.symbol === symbol);
      if (match) { selectByName(match.country); setDidDeepLink(true); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, didDeepLink]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><LoadingSpinner /></div>;
  }
  if (error) {
    return <ErrorAlert message={error} />;
  }

  return (
    <div className="flex h-[calc(100dvh-2rem-64px)] flex-col gap-3 md:h-[calc(100dvh-2.5rem)]">
      <RadarTopBar lastUpdate={markets?.lastUpdate} onPickCountry={selectByName} />

      {/* Controles compactos no mobile */}
      <div className="flex items-center gap-2 overflow-x-auto md:hidden">
        {([
          { key: "mercados", label: "Mercados", icon: BarChart3 },
          { key: "cambio", label: "Câmbio", icon: ArrowLeftRight },
        ] as const).map(({ key, label, icon: Icon }) => {
          const active = layer === key;
          return (
            <button
              key={key}
              onClick={() => setLayer(key)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs"
              style={{
                background: active ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: active ? "#fff" : "#a1a1aa",
              }}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
        <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        {regions.map((r) => {
          const c = REGION_COLORS[r] ?? "#888";
          const active = regionFilter === r;
          return (
            <button
              key={r}
              onClick={() => setRegionFilter(active ? null : r)}
              className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px]"
              style={{ background: active ? `${c}30` : "rgba(255,255,255,0.04)", border: `1px solid ${active ? `${c}60` : "rgba(255,255,255,0.08)"}`, color: active ? c : "#888" }}
            >
              {r}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Rail (desktop) */}
        <div className="hidden w-[230px] shrink-0 overflow-y-auto pr-1 md:block">
          <LayersRail
            layer={layer}
            setLayer={setLayer}
            regions={regions}
            regionFilter={regionFilter}
            setRegionFilter={setRegionFilter}
            markets={markets}
          />
        </div>

        {/* Mapa + dossiê */}
        <div className="relative min-h-0 min-w-0 flex-1">
          <RadarMap
            layer={layer}
            heat={heat}
            markers={markers}
            selectedIso={selected?.iso ?? null}
            regionFilter={regionFilter}
            onSelectCountry={selectByIso}
          />
          <CountryDossier
            selected={selected}
            indices={localIndices}
            currency={localCurrency}
            macro={macro}
            macroLoading={macroLoading}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>
    </div>
  );
}
