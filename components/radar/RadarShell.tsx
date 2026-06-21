"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RadarShell — orquestra o Radar V2: dados (hooks), estado (camada, país, filtro)
// e layout (top bar · rail · mapa+dossiê). Fase 2 adiciona: instability index,
// AI brief, country news e predictive signals ao dossiê.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, ArrowLeftRight, Shield, Smartphone } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { REGION_COLORS, COUNTRY_TO_ISO_NUM } from "@/lib/world-map";
import {
  ISO_NUM_TO_COUNTRY, buildMarketHeat, buildCurrencyHeat, buildRiskHeat, currencyForCountry, type HeatEntry,
} from "@/lib/radar/geo";
import {
  useMarkets, useCurrencies, useCountryMacro,
  useInstability, useBrief, useCountryNews, useSignals,
  useTimeline, useExposure,
} from "@/lib/radar/use-radar";
import type { RadarLayer, SelectedCountry, SymbolTarget } from "@/lib/radar/types";
import { RadarMap } from "./RadarMap";
import LayersRail from "./LayersRail";
import RadarTopBar from "./RadarTopBar";
import CountryDossier from "./CountryDossier";
import SymbolDetail from "./SymbolDetail";
import CommandPalette from "./CommandPalette";
import DigestPanel from "./DigestPanel";

export default function RadarShell() {
  const searchParams = useSearchParams();
  const { data: markets, loading, error } = useMarkets();
  const moedas = useCurrencies();

  const [layer, setLayer] = useState<RadarLayer>("mercados");
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCountry | null>(null);
  const [detailTarget, setDetailTarget] = useState<SymbolTarget | null>(null);

  // Trocar de país fecha o detalhe de símbolo (que cobre o mapa).
  useEffect(() => { setDetailTarget(null); }, [selected?.iso]);

  const { data: macro, loading: macroLoading } = useCountryMacro(selected?.name ?? null);
  const { data: instability, loading: instabilityLoading } = useInstability(selected?.name ?? null);
  const { data: brief, loading: briefLoading } = useBrief(selected?.name ?? null);
  const { data: news, loading: newsLoading } = useCountryNews(selected?.name ?? null);
  const { data: signals, loading: signalsLoading } = useSignals(selected?.name ?? null);
  const { data: timeline, loading: timelineLoading } = useTimeline(selected?.name ?? null);
  const { data: exposure, loading: exposureLoading } = useExposure();

  // ── Camada ativa → calor + marcadores ──────────────────────────────────────
  const heat = useMemo<Map<string, HeatEntry>>(() => {
    if (layer === "mercados") return markets ? buildMarketHeat(markets.indices) : new Map();
    if (layer === "cambio") return moedas ? buildCurrencyHeat(moedas.currencies) : new Map();
    if (layer === "instabilidade") {
      // Ancorado no risco estrutural: pinta mesmo sem dados de mercado/câmbio,
      // que apenas ajustam o score ao redor da base.
      return buildRiskHeat(markets?.indices ?? [], moedas?.currencies ?? null);
    }
    return new Map();
  }, [layer, markets, moedas]);

  const regions = useMemo(() => {
    // Risco é pintado a partir do risco estrutural (cobre todas as regiões),
    // então oferecemos todas as regiões como filtro.
    if (layer === "instabilidade") return Object.keys(REGION_COLORS).sort();
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

  const [showLandscapeHint, setShowLandscapeHint] = useState(false);
  const [hintDismissing, setHintDismissing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.innerWidth < 768;
    const alreadySeen = sessionStorage.getItem("radar-landscape-hint");
    if (isMobile && !alreadySeen) setShowLandscapeHint(true);
  }, []);

  const dismissHint = useCallback(() => {
    setHintDismissing(true);
    sessionStorage.setItem("radar-landscape-hint", "1");
    setTimeout(() => setShowLandscapeHint(false), 350);
  }, []);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><LoadingSpinner /></div>;
  }
  if (error) {
    return <ErrorAlert message={error} />;
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-2 overflow-hidden md:h-[calc(100dvh-5rem)]">
      {/* Landscape hint — mobile only, once per session */}
      {showLandscapeHint && (
        <div
          className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${hintDismissing ? "opacity-0" : "opacity-100"}`}
          onClick={dismissHint}
        >
          <div
            className={`mx-6 max-w-xs rounded-2xl border border-white/10 bg-zinc-900 p-6 text-center shadow-2xl transition-all duration-300 ${hintDismissing ? "scale-90 opacity-0" : "scale-100 opacity-100"}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex justify-center">
              <div className="relative">
                <Smartphone
                  size={48}
                  className="text-blue-400"
                  style={{
                    animation: "radar-rotate-phone 2s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
            <p className="mb-1 text-sm font-semibold text-zinc-100">
              Gire o celular
            </p>
            <p className="mb-5 text-xs leading-relaxed text-zinc-400">
              A experiência desta página é melhor com o celular na horizontal.
            </p>
            <button
              onClick={dismissHint}
              className="rounded-full bg-blue-500 px-6 py-2.5 text-xs font-semibold text-white transition-all active:scale-95 hover:bg-blue-400"
            >
              Entendi
            </button>
          </div>
          <style>{`
            @keyframes radar-rotate-phone {
              0%, 100% { transform: rotate(0deg); }
              30%, 70% { transform: rotate(-90deg); }
            }
          `}</style>
        </div>
      )}
      <RadarTopBar lastUpdate={markets?.lastUpdate} onPickCountry={selectByName} />

      {/* Controles compactos no mobile */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-0.5 pb-1 md:hidden" style={{ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}>
        {([
          { key: "mercados" as const, label: "Mercados", icon: BarChart3 },
          { key: "cambio" as const, label: "Câmbio", icon: ArrowLeftRight },
          { key: "instabilidade" as const, label: "Risco", icon: Shield },
        ]).map(({ key, label, icon: Icon }) => {
          const active = layer === key;
          return (
            <button
              key={key}
              onClick={() => setLayer(key)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium"
              style={{
                background: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.08)",
                border: `1px solid ${active ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.15)"}`,
                color: active ? "#fff" : "#d4d4d8",
              }}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
        <div className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />
        {regions.map((r) => {
          const c = REGION_COLORS[r] ?? "#888";
          const active = regionFilter === r;
          return (
            <button
              key={r}
              onClick={() => setRegionFilter(active ? null : r)}
              className="shrink-0 rounded-full px-2.5 py-2 text-[11px] font-medium"
              style={{ background: active ? `${c}30` : "rgba(255,255,255,0.08)", border: `1px solid ${active ? `${c}60` : "rgba(255,255,255,0.15)"}`, color: active ? c : "#a1a1aa" }}
            >
              {r}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 gap-0 md:gap-3">
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
          <div className="mt-3">
            <DigestPanel markets={markets} exposure={exposure} onPickCountry={selectByName} />
          </div>
        </div>

        {/* Mapa + dossiê */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <RadarMap
            layer={layer}
            heat={heat}
            selectedIso={selected?.iso ?? null}
            regionFilter={regionFilter}
            onSelectCountry={selectByIso}
          />
          <CommandPalette onPickCountry={selectByName} onSetLayer={setLayer} />
          {detailTarget && (
            <SymbolDetail target={detailTarget} onClose={() => setDetailTarget(null)} />
          )}
          <CountryDossier
            selected={selected}
            indices={localIndices}
            currency={localCurrency}
            macro={macro}
            macroLoading={macroLoading}
            instability={instability}
            instabilityLoading={instabilityLoading}
            brief={brief}
            briefLoading={briefLoading}
            news={news}
            newsLoading={newsLoading}
            signals={signals}
            signalsLoading={signalsLoading}
            timeline={timeline}
            timelineLoading={timelineLoading}
            exposure={exposure}
            exposureLoading={exposureLoading}
            onOpenSymbol={setDetailTarget}
            symbolDetailOpen={!!detailTarget}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>
    </div>
  );
}
