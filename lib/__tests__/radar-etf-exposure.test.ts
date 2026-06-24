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

    // Split canônico: tudo veio via ETF (etf_brl), nada direto, fonte = VWRA.
    const us = alloc.find(a => a.country.code === "US")!;
    expect(us.etf_brl).toBeCloseTo(us.value_brl, 5);
    expect(us.direct_brl).toBe(0);
    expect(us.etf_sources).toContain("VWRA");
  });

  it("posição direta entra como direct_brl (não etf_brl)", async () => {
    const alloc = await computeCountryAllocation(
      {},
      [{ ticker: "PETR4.SA", setor: "Ações Brasil", valorAtualBRL: 10_000, macro: "Renda Variável" }],
    );
    const br = alloc.find(a => a.country.code === "BR")!;
    expect(br.direct_brl).toBeCloseTo(10_000, 0);
    expect(br.etf_brl).toBe(0);
    expect(br.etf_sources).toHaveLength(0);
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

    // Piso de visibilidade (0.32): TODO país com exposição fica claramente azul,
    // mesmo o menor (Brasil 1%) — não some no fundo.
    expect(heat.get("076")!.intensity).toBeGreaterThanOrEqual(0.32);

    // Japão (5%) fica nitidamente mais forte que o piso e abaixo do topo.
    const jp = heat.get("392")!.intensity;
    expect(jp).toBeGreaterThan(0.45);
    expect(jp).toBeLessThan(0.65);

    // Ordenação preservada: mais exposto = mais intenso.
    expect(heat.get("840")!.intensity).toBeGreaterThan(jp);
    expect(jp).toBeGreaterThan(heat.get("076")!.intensity);

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

  it("ETF sem holdings mas com ETF_SINGLE_COUNTRY não some (SHV → US)", async () => {
    const alloc = await computeCountryAllocation(
      { "SHV": { valor_brl: 20_000, components: [] } },
      [],
    );
    expect(alloc).toHaveLength(1);
    expect(alloc[0].country.code).toBe("US");
    expect(alloc[0].value_brl).toBeCloseTo(20_000, 0);
    expect(alloc[0].etf_brl).toBeCloseTo(20_000, 0);
  });

  it("OUTROS bucket não perde valor (normaliza por holdings reais)", async () => {
    const alloc = await computeCountryAllocation(
      {
        "TEST_ETF": {
          valor_brl: 100_000,
          components: [
            { ativo: "AAPL", peso: 0.10 },
            { ativo: "7203.T", peso: 0.05 },
            { ativo: "OUTROS.TEST_ETF", peso: 0.85 },
          ],
        },
      },
      [],
    );
    const total = alloc.reduce((s, a) => s + a.value_brl, 0);
    // Sem o fix, total seria ~15k (só os 15% não-OUTROS). Com o fix, 100k.
    expect(total).toBeGreaterThan(99_000);
    expect(total).toBeLessThanOrEqual(100_001);
    // AAPL → US (10/15 ≈ 66.7%), 7203.T → JP (5/15 ≈ 33.3%)
    const us = alloc.find(a => a.country.code === "US");
    const jp = alloc.find(a => a.country.code === "JP");
    expect(us).toBeDefined();
    expect(jp).toBeDefined();
    expect(us!.value_brl).toBeCloseTo(66_667, -2);
    expect(jp!.value_brl).toBeCloseTo(33_333, -2);
  });
});
