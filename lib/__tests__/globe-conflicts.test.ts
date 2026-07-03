import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchLiveConflicts, FALLBACK_ZONES, type ConflictDiag } from "@/lib/globe-conflicts";

// Monta um "feature" GeoJSON do GDELT (properties.name = "Cidade, Região, País").
function feat(name: string, count: number, lng: number, lat: number) {
  return { properties: { name, count }, geometry: { type: "Point", coordinates: [lng, lat] } };
}

function mockGdelt(features: unknown[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ type: "FeatureCollection", features }),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchLiveConflicts (GDELT) — agregação por país", () => {
  it("agrega menções por país (última parte do nome) e ranqueia por volume", async () => {
    mockGdelt([
      feat("Kyiv, Kyiv, Ukraine", 300, 30, 50),
      feat("Kharkiv, Ukraine", 200, 36, 50),
      feat("Khartoum, Sudan", 120, 32, 15),
      feat("Small Town, Brazil", 3, -47, -15),   // abaixo do piso (MIN_MENTIONS=10)
    ]);
    const zones = await fetchLiveConflicts();
    const countries = zones.map(z => z.country);
    expect(countries).toContain("Ukraine");
    expect(countries).toContain("Sudan");
    expect(countries).not.toContain("Brazil");       // ruído cortado
    expect(zones[0].country).toBe("Ukraine");          // maior volume primeiro
    expect(zones[0].events).toBe(500);                 // 300 + 200 menções
  });

  it("rótulo amigável + centroide ponderado + bolsas do país", async () => {
    mockGdelt([
      feat("A, Ukraine", 100, 30, 48),
      feat("B, Ukraine", 100, 34, 50),
    ]);
    const [uk] = await fetchLiveConflicts();
    expect(uk.name).toBe("Guerra Rússia–Ucrânia");
    expect(uk.lat).toBeCloseTo(49, 5);                 // (48+50)/2 ponderado igual
    expect(uk.lng).toBeCloseTo(32, 5);
    expect(uk.nearbyMarkets).toContain("^GDAXI");
    expect(uk.periodDias).toBe(7);
  });

  it("normaliza variações de nome (Gaza → Palestine, Congo (Kinshasa) → RDC)", async () => {
    mockGdelt([
      feat("Gaza", 200, 34.4, 31.5),
      feat("Goma, Congo (Kinshasa)", 80, 29, -1.7),
    ]);
    const zones = await fetchLiveConflicts();
    const countries = zones.map(z => z.country);
    expect(countries).toContain("Palestine");
    expect(countries).toContain("Democratic Republic of Congo");
  });

  it("país desconhecido vira 'Conflito — <país>' e sem bolsas", async () => {
    mockGdelt([feat("Somewhere, Elbonia", 50, 10, 10)]);
    const [z] = await fetchLiveConflicts();
    expect(z.name).toBe("Conflito — Elbonia");
    expect(z.nearbyMarkets).toEqual([]);
  });

  it("GDELT com erro → [] (rota usa FALLBACK_ZONES)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" }));
    expect(await fetchLiveConflicts()).toEqual([]);
    expect(FALLBACK_ZONES.length).toBeGreaterThan(0);
  });

  it("diagnóstico preenchido (?debug)", async () => {
    mockGdelt([feat("Kyiv, Ukraine", 100, 30, 50)]);
    const diag: ConflictDiag = { provider: "gdelt", zonesReturned: 0 };
    await fetchLiveConflicts(diag);
    expect(diag.featuresReturned).toBe(1);
    expect(diag.zonesReturned).toBe(1);
    expect(diag.top?.[0].country).toBe("Ukraine");
  });
});
