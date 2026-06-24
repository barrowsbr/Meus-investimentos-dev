import { describe, it, expect } from "vitest";
import { computeCountryAllocation } from "../ticker-country";
import { buildExposureHeat, ISO_NUM_TO_COUNTRY } from "../radar/geo";
import type { ExposureResponse } from "../radar/types";

// ─────────────────────────────────────────────────────────────────────────────
// Regressão da camada ETF do Radar: prova que o look-through usa o motor
// canônico (espalha por empresa/país) em vez de jogar tudo no país de listagem,
// e que buildExposureHeat mapeia ISO-2 → ISO-numérico do mapa-múndi.
// Sem rede: usa o caminho de pesos embutidos (VWRA factsheet) e single-country.
// ─────────────────────────────────────────────────────────────────────────────

describe("camada ETF do Radar — look-through canônico", () => {
  it("ETF global (VWRA) espalha por vários países, não só EUA", async () => {
    const alloc = await computeCountryAllocation(
      {
        // VWRA → pesos de factsheet embutidos (ETF_COUNTRY_WEIGHTS): EUA ~62%,
        // mas com Japão, UK, China, França, etc.
        "VWRA": {
          valor_brl: 100_000,
          components: [{ ativo: "AAPL", peso: 1 }], // ignorado: VWRA tem peso embutido
        },
      },
      [],
    );

    const byCode = Object.fromEntries(alloc.map(a => [a.country.code, a.value_brl]));

    // Espalha de verdade: mais de um punhado de países.
    expect(alloc.length).toBeGreaterThan(10);
    // EUA domina mas NÃO é 100%.
    expect(byCode["US"]).toBeGreaterThan(50_000);
    expect(byCode["US"]).toBeLessThan(70_000);
    // Outros países relevantes aparecem (o que NÃO acontecia antes).
    for (const code of ["JP", "GB", "CN", "FR", "CA"]) {
      expect(byCode[code], `país ${code} deveria ter exposição`).toBeGreaterThan(0);
    }
    // Soma preserva o valor do ETF (~100k, tolerância de arredondamento).
    const total = alloc.reduce((s, a) => s + a.value_brl, 0);
    expect(total).toBeGreaterThan(95_000);
    expect(total).toBeLessThanOrEqual(100_000 + 1);
  });

  it("ETF single-country (IVVB11) vai 100% para os EUA", async () => {
    const alloc = await computeCountryAllocation(
      { "IVVB11": { valor_brl: 50_000, components: [] } },
      [],
    );
    expect(alloc).toHaveLength(1);
    expect(alloc[0].country.code).toBe("US");
    expect(alloc[0].value_brl).toBeCloseTo(50_000, 0);
  });

  it("buildExposureHeat mapeia ISO-2 → ISO-numérico e aplica gamma (pinta exposição pequena)", () => {
    const resp: ExposureResponse = {
      exposure: [
        { countryPT: "EUA", iso2: "US", totalBRL: 60_000, pct: 60, tickers: ["VWRA"], directBRL: 0, etfBRL: 60_000, etfSources: ["VWRA"] },
        { countryPT: "Japão", iso2: "JP", totalBRL: 5_000, pct: 5, tickers: ["VWRA"], directBRL: 0, etfBRL: 5_000, etfSources: ["VWRA"] },
        { countryPT: "Brasil", iso2: "BR", totalBRL: 1_000, pct: 1, tickers: ["PETR4"], directBRL: 1_000, etfBRL: 0, etfSources: [] },
      ],
      totalBRL: 66_000,
    };
    const heat = buildExposureHeat(resp);

    // EUA = ISO numérico 840, Japão = 392, Brasil = 076 (do mapa-múndi).
    expect(heat.has("840")).toBe(true);
    expect(heat.has("392")).toBe(true);
    expect(heat.has("076")).toBe(true);

    // País mais exposto fica com intensidade 1 (azul mais forte).
    expect(heat.get("840")!.intensity).toBeCloseTo(1, 5);

    // Gamma 0.45: Japão (5/60 ≈ 0.083 linear) sobe para ~0.31 — visível, não apagado.
    const jp = heat.get("392")!.intensity;
    expect(jp).toBeGreaterThan(0.25);
    expect(jp).toBeLessThan(0.4);

    // O nome do país segue o padrão do Radar (casa com o dossiê).
    expect(heat.get("840")!.country).toBe(ISO_NUM_TO_COUNTRY["840"]); // "EUA"
    expect(heat.get("840")!.country).toBe("EUA");

    // valueText traz a origem (direta / ETFs).
    expect(heat.get("840")!.valueText).toContain("ETFs");
    expect(heat.get("076")!.valueText).toContain("direta");
  });

  it("exposição vazia não quebra (mapa vazio)", () => {
    expect(buildExposureHeat(null).size).toBe(0);
    expect(buildExposureHeat({ exposure: [] }).size).toBe(0);
  });
});
