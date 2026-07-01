"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RadarShell — orquestra o Radar V2: dados (hooks), estado (camada, país, filtro)
// e layout (top bar · rail · mapa+dossiê). Fase 2 adiciona: instability index,
// AI brief, country news e predictive signals ao dossiê.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, ArrowLeftRight, Shield, Layers } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { REGION_COLORS, COUNTRY_TO_ISO_NUM } from "@/lib/world-map";
import {
  ISO_NUM_TO_COUNTRY, buildMarketHeat, buildCurrencyHeat, buildRiskHeat, buildExposureHeat, currencyForCountry, type HeatEntry,
} from "@/lib/radar/geo";
import { ISO_NUM_TO_ISO2, resolveCountryMeta } from "@/lib/radar/countries";
import {
  useMarkets, useCurrencies, useCountryMacro,
  useInstability, useBrief, useCountryNews, useSignals,
  useTimeline, useExposure,
} from "@/lib/radar/use-radar";
import { usePortfolio } from "@/lib/hooks";
import { isRendaVariavel } from "@/lib/sectors";
import { buildExchangeAllocation } from "@/lib/radar/exchanges";
import type { RadarLayer, SelectedCountry, SymbolTarget, ExposureMode } from "@/lib/radar/types";
import { RadarMap, type ExchangeMarker } from "./RadarMap";
import ExchangePanel from "./ExchangePanel";
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
  // Sub-modo da camada Alocação: por país (alocação direta) ou por bolsa (pins).
  const [exposureMode, setExposureMode] = useState<ExposureMode>("alocacao");

  const { data: portfolio } = usePortfolio();

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

  // ── Camada ativa → calor + marcadores ──────────────────────────────────────
  const heat = useMemo<Map<string, HeatEntry>>(() => {
    if (layer === "mercados") return markets ? buildMarketHeat(markets.indices) : new Map();
    if (layer === "cambio") return moedas ? buildCurrencyHeat(moedas.currencies) : new Map();
    if (layer === "instabilidade") {
      return buildRiskHeat(markets?.indices ?? [], moedas?.currencies ?? null);
    }
    if (layer === "etf") return buildExposureHeat(exposure);
    return new Map();
  }, [layer, markets, moedas, exposure]);

  // ── Visão Bolsas: alocação por praça (fonte canônica = posições do snapshot) ──
  const exchangeAlloc = useMemo(() => {
    const rv = (portfolio?.positions ?? []).filter((p) => isRendaVariavel(p.setor) && p.valorAtualBRL > 0);
    return buildExchangeAllocation(
      rv.map((p) => ({ ticker: p.ticker, moeda: p.moeda, setor: p.setor, valorAtualBRL: p.valorAtualBRL })),
    );
  }, [portfolio]);

  const markers = useMemo<ExchangeMarker[]>(() => {
    // País com +1 bolsa → marca todas as praças daquele país como "multi".
    const perCountry = new Map<string, number>();
    for (const e of exchangeAlloc) perCountry.set(e.exchange.iso2, (perCountry.get(e.exchange.iso2) ?? 0) + 1);
    return exchangeAlloc.map((e) => ({
      code: e.exchange.code,
      name: e.exchange.name,
      city: e.exchange.city,
      coords: e.exchange.coords,
      brl: e.brl,
      pct: e.pct,
      count: e.tickers.length,
      multi: (perCountry.get(e.exchange.iso2) ?? 0) > 1,
    }));
  }, [exchangeAlloc]);

  const bolsasView = layer === "etf" && exposureMode === "bolsas";

  const regions = useMemo(() => {
    if (layer === "instabilidade") return Object.keys(REGION_COLORS).sort();
    if (layer === "etf") {
      const r = new Set<string>();
      for (const e of heat.values()) if (e.region) r.add(e.region);
      return [...r].sort();
    }
    const src = layer === "mercados" ? markets?.indices : moedas?.currencies;
    if (!src) return [];
    return [...new Set(src.map((x) => x.region))].sort();
  }, [layer, markets, moedas, heat]);

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
      <RadarTopBar lastUpdate={markets?.lastUpdate} onPickCountry={selectByName} />

      {/* Controles compactos no mobile */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-0.5 pb-1 md:hidden" style={{ overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}>
        {([
          { key: "mercados" as const, label: "Mercados", icon: BarChart3 },
          { key: "cambio" as const, label: "Câmbio", icon: ArrowLeftRight },
          { key: "instabilidade" as const, label: "Risco", icon: Shield },
          { key: "etf" as const, label: "Alocação", icon: Layers },
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
        {layer === "etf" && (
          <>
            <div className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />
            {([
              { id: "alocacao" as ExposureMode, label: "Alocação" },
              { id: "bolsas" as ExposureMode, label: "Bolsas" },
            ]).map(({ id, label }) => {
              const on = exposureMode === id;
              return (
                <button
                  key={id}
                  onClick={() => setExposureMode(id)}
                  className="shrink-0 rounded-full px-3 py-2 text-[11px] font-medium"
                  style={{ background: on ? "rgba(56,189,248,0.22)" : "rgba(255,255,255,0.08)", border: `1px solid ${on ? "rgba(56,189,248,0.5)" : "rgba(255,255,255,0.15)"}`, color: on ? "#fff" : "#a1a1aa" }}
                >
                  {label}
                </button>
              );
            })}
          </>
        )}
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
            exposureMode={exposureMode}
            setExposureMode={setExposureMode}
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
            markers={bolsasView ? markers : undefined}
          />
          {bolsasView && <ExchangePanel allocation={exchangeAlloc} onPickCountry={selectByName} />}
          <CommandPalette onPickCountry={selectByName} onSetLayer={setLayer} onOpenSymbol={setDetailTarget} />
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
