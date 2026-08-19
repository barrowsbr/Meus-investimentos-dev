import { describe, expect, it } from "vitest";
import { aplicarSpotHoje, hojeSaoPaulo } from "../spot-overlay";
import type { FxRates } from "../cotacoes";

const fx = (usd: number): FxRates => ({ USDBRL: usd, EURBRL: 6.4, CADBRL: 4.1, GBPBRL: 7.6 });

function grid() {
  return {
    dates: ["2026-08-17", "2026-08-18"],
    prices: {
      "VALE3.SA": [60, 61] as (number | null)[],
      "BTC-USD": [100000, 101000] as (number | null)[],
    },
    fxHistory: { "2026-08-17": fx(5.4), "2026-08-18": fx(5.45) } as Record<string, FxRates>,
    extras: {
      "^BVSP": [130000, 131000] as (number | null)[],
      "BTC-USD": [100000, 101000] as (number | null)[],
    },
    yahooToOrig: { "VALE3.SA": "VALE3.SA", "BTC-USD": "BTC-USD" },
  };
}

describe("aplicarSpotHoje — a perna provisória de hoje", () => {
  it("cria a linha de hoje herdando o FX de ontem e aplica os spots", () => {
    const g = grid();
    const r = aplicarSpotHoje({
      ...g, hoje: "2026-08-19",
      spots: { "VALE3.SA": 62.5, "^BVSP": 132500, "BRL=X": 5.5 },
    });
    expect(r).toEqual({ aplicado: true, novaLinha: true, precosAplicados: 2 });
    expect(g.dates).toEqual(["2026-08-17", "2026-08-18", "2026-08-19"]);
    expect(g.prices["VALE3.SA"]).toEqual([60, 61, 62.5]);
    expect(g.prices["BTC-USD"]).toEqual([100000, 101000, null]); // sem spot → null (motor ffilla)
    expect(g.extras["^BVSP"]).toEqual([130000, 131000, 132500]);
    expect(g.fxHistory["2026-08-19"].USDBRL).toBe(5.5);   // spot vence
    expect(g.fxHistory["2026-08-19"].EURBRL).toBe(6.4);   // herdado de ontem
  });

  it("sobrepõe na linha de hoje quando ela JÁ existe (pós-cron: spot ≈ fecho)", () => {
    const g = grid();
    g.dates.push("2026-08-19");
    g.prices["VALE3.SA"].push(62);
    g.prices["BTC-USD"].push(null);
    g.extras["^BVSP"].push(null);
    g.extras["BTC-USD"].push(null);
    g.fxHistory["2026-08-19"] = fx(5.48);
    const r = aplicarSpotHoje({ ...g, hoje: "2026-08-19", spots: { "VALE3.SA": 63 } });
    expect(r.novaLinha).toBe(false);
    expect(g.prices["VALE3.SA"][2]).toBe(63);
    expect(g.dates.length).toBe(3);
  });

  it("ticker que é posição E benchmark (BTC-USD) recebe o spot nos dois lugares", () => {
    const g = grid();
    aplicarSpotHoje({ ...g, hoje: "2026-08-19", spots: { "BTC-USD": 102500 } });
    expect(g.prices["BTC-USD"][2]).toBe(102500);
    expect(g.extras["BTC-USD"][2]).toBe(102500);
  });

  it("fim de semana não cria linha", () => {
    const g = grid();
    const r = aplicarSpotHoje({ ...g, hoje: "2026-08-22", spots: { "VALE3.SA": 62 } }); // sábado
    expect(r.aplicado).toBe(false);
    expect(g.dates.length).toBe(2);
  });

  it("sem nenhum spot aproveitável, a linha fantasma é desfeita", () => {
    const g = grid();
    const r = aplicarSpotHoje({ ...g, hoje: "2026-08-19", spots: { "DESCONHECIDO": 10 } });
    expect(r.aplicado).toBe(false);
    expect(g.dates.length).toBe(2);
    expect(g.fxHistory["2026-08-19"]).toBeUndefined();
  });

  it("spots inválidos (≤ 0) são ignorados", () => {
    const g = grid();
    const r = aplicarSpotHoje({ ...g, hoje: "2026-08-19", spots: { "VALE3.SA": 0 } });
    expect(r.aplicado).toBe(false);
    expect(g.dates.length).toBe(2);
  });
});

describe("hojeSaoPaulo", () => {
  it("devolve o dia civil de São Paulo (UTC−3): 01h UTC ainda é ontem em SP", () => {
    expect(hojeSaoPaulo(new Date("2026-08-20T01:00:00Z"))).toBe("2026-08-19");
    expect(hojeSaoPaulo(new Date("2026-08-19T15:00:00Z"))).toBe("2026-08-19");
  });
});
