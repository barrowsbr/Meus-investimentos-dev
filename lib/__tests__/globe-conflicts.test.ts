import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchAcledConflicts, FALLBACK_ZONES } from "@/lib/globe-conflicts";

function acledRow(country: string, event_type: string, fatalities: number, lat: number, lng: number) {
  return { country, event_type, fatalities: String(fatalities), latitude: String(lat), longitude: String(lng) };
}

function mockAcled(rows: unknown[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: rows }),
  }));
}

beforeEach(() => {
  process.env.ACLED_API_KEY = "k";
  process.env.ACLED_EMAIL = "e@e.com";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ACLED_API_KEY;
  delete process.env.ACLED_EMAIL;
});

describe("fetchAcledConflicts — agregação", () => {
  it("sem credenciais → [] (rota cai no fallback)", async () => {
    delete process.env.ACLED_API_KEY;
    const out = await fetchAcledConflicts();
    expect(out).toEqual([]);
  });

  it("agrega por país, aplica limiar e ranqueia por intensidade", async () => {
    const rows = [
      // Ucrânia: 10 batalhas letais → passa o limiar (>=8)
      ...Array.from({ length: 10 }, () => acledRow("Ukraine", "Battles", 3, 49, 32)),
      // Sudão: 9 eventos → passa
      ...Array.from({ length: 9 }, () => acledRow("Sudan", "Violence against civilians", 1, 15, 32)),
      // Brasil: 3 eventos → NÃO passa o limiar
      ...Array.from({ length: 3 }, () => acledRow("Brazil", "Battles", 0, -15, -47)),
    ];
    mockAcled(rows);

    const zones = await fetchAcledConflicts();
    const ids = zones.map(z => z.country);
    expect(ids).toContain("Ukraine");
    expect(ids).toContain("Sudan");
    expect(ids).not.toContain("Brazil");           // abaixo do limiar
    expect(zones[0].country).toBe("Ukraine");       // mais intenso primeiro
  });

  it("ignora tipos não-violentos (protesto pacífico)", async () => {
    const rows = Array.from({ length: 20 }, () => acledRow("Testland", "Protests", 0, 10, 10));
    mockAcled(rows);
    const zones = await fetchAcledConflicts();
    expect(zones).toHaveLength(0);
  });

  it("rótulo amigável + centroide + bolsas do país", async () => {
    const rows = [
      ...Array.from({ length: 8 }, () => acledRow("Ukraine", "Battles", 2, 48, 30)),
      ...Array.from({ length: 8 }, () => acledRow("Ukraine", "Battles", 2, 50, 34)),
    ];
    mockAcled(rows);
    const [uk] = await fetchAcledConflicts();
    expect(uk.name).toBe("Guerra Rússia–Ucrânia");
    expect(uk.lat).toBeCloseTo(49, 5);            // centroide (48+50)/2
    expect(uk.lng).toBeCloseTo(32, 5);            // (30+34)/2
    expect(uk.nearbyMarkets).toContain("^GDAXI");
    expect(uk.events).toBe(16);
    expect(uk.fatalities).toBe(32);
  });

  it("ACLED erro → [] (rota usará FALLBACK_ZONES)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, error: "bad key" }) }));
    expect(await fetchAcledConflicts()).toEqual([]);
    expect(FALLBACK_ZONES.length).toBeGreaterThan(0);
  });
});
