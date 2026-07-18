import { describe, it, expect, afterEach, vi } from "vitest";

// O pipeline REAL usa GDELT Events 2.0 (CSVs zip de 15 min — lib/gdelt-events);
// a antiga API GEO 2.0 (GeoJSON) foi aposentada. Mockamos o módulo de eventos
// e o tradutor — o que se testa aqui é a AGREGAÇÃO por país, os rótulos, o
// centroide ponderado e o diagnóstico de fetchLiveConflicts/fetchGdeltEvents.
vi.mock("@/lib/gdelt-events", () => ({ fetchGdeltEventPoints: vi.fn() }));
vi.mock("@/lib/translate", () => ({ translateBatch: vi.fn(async (t: string[]) => t) }));

import { fetchLiveConflicts, FALLBACK_ZONES, type ConflictDiag } from "@/lib/globe-conflicts";
import { fetchGdeltEventPoints, type GdeltEventPoint } from "@/lib/gdelt-events";

const mocked = vi.mocked(fetchGdeltEventPoints);

// Ponto de evento GDELT (fullName = "Cidade, Região, País").
function pt(fullName: string, mentions: number, lng: number, lat: number, url = ""): GdeltEventPoint {
  return { code: "19", fullName, lat, lng, mentions, sourceUrl: url };
}

afterEach(() => mocked.mockReset());

describe("fetchLiveConflicts (GDELT Events 2.0) — agregação por país", () => {
  it("agrega menções por país, ranqueia por volume e corta ruído (piso + ≥2 eventos)", async () => {
    mocked.mockResolvedValue([
      pt("Kyiv, Kyiv, Ukraine", 300, 30, 50),
      pt("Kharkiv, Kharkivska, Ukraine", 200, 36, 50),
      pt("Khartoum, Khartoum, Sudan", 80, 32, 15),
      pt("Omdurman, Khartoum, Sudan", 60, 32.4, 15.6),
      pt("Small Town, DF, Brazil", 5, -47, -15),        // abaixo do piso (minMentions=20)
      pt("Lone City, Region, Chad", 500, 18, 12),        // 1 evento só — pico isolado não vira zona
    ]);
    const zones = await fetchLiveConflicts();
    const countries = zones.map(z => z.country);
    expect(countries).toContain("Ukraine");
    expect(countries).toContain("Sudan");
    expect(countries).not.toContain("Brazil");           // ruído cortado
    expect(countries).not.toContain("Chad");             // evCount < 2 cortado
    expect(zones[0].country).toBe("Ukraine");            // maior volume primeiro
    expect(zones[0].events).toBe(500);                   // 300 + 200 menções
  });

  it("rótulo amigável + centroide ponderado + bolsas do país", async () => {
    mocked.mockResolvedValue([
      pt("A, Reg, Ukraine", 100, 30, 48),
      pt("B, Reg, Ukraine", 100, 34, 50),
    ]);
    const [uk] = await fetchLiveConflicts();
    expect(uk.name).toBe("Guerra Rússia–Ucrânia");
    expect(uk.lat).toBeCloseTo(49, 5);                   // média ponderada (pesos iguais)
    expect(uk.lng).toBeCloseTo(32, 5);
    expect(uk.nearbyMarkets).toContain("^GDAXI");
  });

  it("normaliza variações de nome (Gaza → Palestine, Congo (Kinshasa) → RDC)", async () => {
    mocked.mockResolvedValue([
      pt("Gaza City, Gaza, Gaza", 200, 34.4, 31.5),
      pt("Rafah, Gaza, Gaza Strip", 150, 34.2, 31.3),
      pt("Goma, Nord-Kivu, Congo (Kinshasa)", 80, 29, -1.7),
      pt("Bukavu, Sud-Kivu, Congo (Kinshasa)", 40, 28.8, -2.5),
    ]);
    const zones = await fetchLiveConflicts();
    const countries = zones.map(z => z.country);
    expect(countries).toContain("Palestine");
    expect(countries).toContain("Democratic Republic of Congo");
  });

  it("país desconhecido vira 'Conflito — <país>' e sem bolsas", async () => {
    mocked.mockResolvedValue([
      pt("Somewhere, Region, Elbonia", 50, 10, 10),
      pt("Elsewhere, Region, Elbonia", 30, 11, 11),
    ]);
    const [z] = await fetchLiveConflicts();
    expect(z.name).toBe("Conflito — Elbonia");
    expect(z.nearbyMarkets).toEqual([]);
  });

  it("feed com erro → [] (a rota usa FALLBACK_ZONES)", async () => {
    mocked.mockRejectedValue(new Error("feed fora do ar"));
    const diag: ConflictDiag = { provider: "gdelt", zonesReturned: 0 };
    expect(await fetchLiveConflicts(diag)).toEqual([]);
    expect(diag.error).toContain("feed fora do ar");
    expect(FALLBACK_ZONES.length).toBeGreaterThan(0);
  });

  it("diagnóstico preenchido (?debug)", async () => {
    mocked.mockResolvedValue([
      pt("Kyiv, Kyiv, Ukraine", 100, 30, 50),
      pt("Lviv, Lvivska, Ukraine", 60, 24, 49.8),
    ]);
    const diag: ConflictDiag = { provider: "gdelt", zonesReturned: 0 };
    await fetchLiveConflicts(diag);
    expect(diag.featuresReturned).toBe(2);
    expect(diag.zonesReturned).toBe(1);
    expect(diag.top?.[0].country).toBe("Ukraine");
    expect(diag.top?.[0].mentions).toBe(160);
  });
});
