"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RadarShell — orquestra o Radar V2: dados (hooks), estado (camada, país, filtro)
// e layout (top bar · rail · mapa+dossiê). Fase 2 adiciona: instability index,
// AI brief, country news e predictive signals ao dossiê.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, ArrowLeftRight, Shield, Landmark, Coins } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { REGION_COLORS, COUNTRY_TO_ISO_NUM } from "@/lib/world-map";
import {
  ISO_NUM_TO_COUNTRY, buildMarketHeat, buildCurrencyHeat, buildRiskHeat, buildExposureHeat,
  buildExposureMarkers, currencyForCountry, type HeatEntry,
} from "@/lib/radar/geo";
import { ISO_NUM_TO_ISO2, resolveCountryMeta } from "@/lib/radar/countries";
import {
  useMarkets, useCurrencies, useCountryMacro,
  useInstability, useBrief, useCountryNews, useSignals,
  useTimeline, useExposure,
} from "@/lib/radar/use-radar";
import type { RadarLayer, SelectedCountry, SymbolTarget, ExposureResponse } from "@/lib/radar/types";
import { RadarMap } from "./RadarMap";
import LayersRail from "./LayersRail";
import RadarTopBar from "./RadarTopBar";
import CountryDossier from "./CountryDossier";
import SymbolDetail from "./SymbolDetail";
import CommandPalette from "./CommandPalette";
import CommoditiesPanel from "./CommoditiesPanel";
import DigestPanel from "./DigestPanel";

export default function RadarShell() {
  const searchParams = useSearchParams();
  const { data: markets, loading, error } = useMarkets();
  const moedas = useCurrencies();

  const [layer, setLayer] = useState<RadarLayer>("mercados");
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCountry | null>(null);
  const [detailTarget, setDetailTarget] = useState<SymbolTarget | null>(null);
  const [showCommodities, setShowCommodities] = useState(false);

  // Trocar de país fecha o detalhe de símbolo (que cobre o mapa).
  useEffect(() => { setDetailTarget(null); }, [selected?.iso]);

  // ISO-2 do país selecionado → destrava indicadores do World Bank mesmo para
  // países não monitorados (que não estão nos mapas internos dos handlers).
  const selectedIso2 = selected ? (ISO_NUM_TO_ISO2[selected.iso] ?? null) : null;
  const { data: macro, loading: macroLoading } = useCountryMacro(selected?.name ?? null, selectedIso2);
  const { data: instability, loading: instabilityLoading } = useInstability(selected?.name ?? null, selectedIso2);
  const { data: brief, loading: briefLoading } = useBrief(selected?.name ?? null);
  const { data: news, loading: newsLoading } = useCountryNews(selected?.name ?? null);
  const { data: signals, loading: signalsLoading } = useSignals(selected?.name ?? null);
  const { data: timeline, loading: timelineLoading } = useTimeline(selected?.name ?? null);
  const { data: exposure, loading: exposureLoading } = useExposure();

  // Exposição por BOLSA de listagem (onde o papel é negociado) — base da camada
  // "Minhas bolsas". Diferente de `exposure` (país de origem, que credita ADR à
  // origem e decompõe ETFs); aqui TSM entra nos EUA (NYSE), VWRA.L em Londres.
  const exchangeExposure = useMemo<ExposureResponse | null>(
    () => (exposure ? { exposure: exposure.exchanges ?? [] } : null),
    [exposure],
  );

  // ── Camada ativa → calor ────────────────────────────────────────────────────
  const heat = useMemo<Map<string, HeatEntry>>(() => {
    if (layer === "mercados") return markets ? buildMarketHeat(markets.indices) : new Map();
    if (layer === "cambio") return moedas ? buildCurrencyHeat(moedas.currencies) : new Map();
    if (layer === "instabilidade") {
      return buildRiskHeat(markets?.indices ?? [], moedas?.currencies ?? null);
    }
    if (layer === "exposicao") return buildExposureHeat(exchangeExposure);
    return new Map();
  }, [layer, markets, moedas, exchangeExposure]);

  // Marcadores das praças (só na camada Minhas bolsas): pino na bolsa de listagem.
  const markers = useMemo(
    () => (layer === "exposicao" ? buildExposureMarkers(exchangeExposure) : []),
    [layer, exchangeExposure],
  );

  const regions = useMemo(() => {
    if (layer === "exposicao") return []; // filtro de região não se aplica à minha carteira
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
    const meta = resolveCountryMeta(iso, name);
    setSelected({
      name,
      iso,
      flag: idx?.flag ?? cur?.flag ?? meta?.flag ?? "🏳️",
      region: idx?.region ?? cur?.region ?? meta?.region ?? "—",
    });
  };

  // Clique no mapa: monitorado segue o caminho rico; qualquer outro país é
  // resolvido pela identidade completa (bandeira/nome/região) — todos clicáveis.
  const selectByIso = (iso: string, fallbackName?: string) => {
    const ptName = ISO_NUM_TO_COUNTRY[iso];
    if (ptName) { selectByName(ptName); return; }
    const meta = resolveCountryMeta(iso, fallbackName);
    if (!meta) return;
    setSelected({ name: meta.name, iso, flag: meta.flag, region: meta.region });
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
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-2 overflow-hidden md:h-[calc(100dvh-5rem)]">
      <RadarTopBar lastUpdate={markets?.lastUpdate} />

      {/* Controles compactos no mobile */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-0.5 pb-1 md:hidden" style={{ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}>
        {([
          { key: "mercados" as const, label: "Mercados", icon: BarChart3 },
          { key: "cambio" as const, label: "Câmbio", icon: ArrowLeftRight },
          { key: "instabilidade" as const, label: "Risco", icon: Shield },
          { key: "exposicao" as const, label: "Minhas bolsas", icon: Landmark },
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
        <button
          onClick={() => setShowCommodities(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium"
          style={{
            background: showCommodities ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${showCommodities ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.15)"}`,
            color: showCommodities ? "#fff" : "#d4d4d8",
          }}
        >
          <Coins size={13} /> Commodities
        </button>
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
            commoditiesOpen={showCommodities}
            onToggleCommodities={() => setShowCommodities(v => !v)}
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
            markers={markers}
            selectedIso={selected?.iso ?? null}
            regionFilter={regionFilter}
            onSelectCountry={selectByIso}
          />
          <CommandPalette onPickCountry={selectByName} onSetLayer={setLayer} onOpenSymbol={setDetailTarget} />
          {showCommodities && (
            <CommoditiesPanel
              onOpenSymbol={setDetailTarget}
              onClose={() => setShowCommodities(false)}
              dossierOpen={!!selected}
            />
          )}
          {detailTarget && (
            <SymbolDetail target={detailTarget} dossierOpen={!!selected} onClose={() => setDetailTarget(null)} />
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
