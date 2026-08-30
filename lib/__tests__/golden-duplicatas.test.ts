// Regressão do incidente de 08/2026: a aba db_cotacoes ficou com um bloco de
// dias DUPLICADO (escrita concorrente) e parou de receber dias novos.
//
// Mecanismo do congelamento: countPoints() percorre `dates`; com datas
// repetidas, cada dia duplicado era contado 2× e inflava o total do estado
// EXISTENTE. O próximo merge (que deduplica por Set) tinha menos "pontos" que
// esse total inflado → a regra 4 do gate ("total não pode diminuir") RECUSAVA
// toda escrita. Nada era corrompido — a golden simplesmente congelava.
//
// Correção: readGoldenSource devolve datas ÚNICAS (+ physicalDates para a
// escrita saber se a aba está saudável) e a escrita cai em rewrite quando a
// ordem física diverge da lógica — o que higieniza a aba sozinho.

import { describe, expect, it } from "vitest";
import { checkGoldenGuard, abaSaudavel, type GoldenSourceData } from "../db-cotacoes";

const golden = (dates: string[], tickers = ["VOO", "CMIG4.SA"]): GoldenSourceData => ({
  tickers,
  dates,
  prices: Object.fromEntries(dates.map((d) => [d, { VOO: 500, "CMIG4.SA": 10 }])),
});

describe("golden source — duplicatas de linha (incidente 08/2026)", () => {
  // Fiel ao incidente: um BLOCO de 5 dias veio duplicado (21→26 repetidos) e o
  // cron tentava anexar 2 dias novos (27 e 28). Como as duplicatas (5) superam
  // os dias novos (2), o total "encolhia" aos olhos do gate.
  const uteis = ["2026-08-21", "2026-08-24", "2026-08-25", "2026-08-26"];
  const duplicados = [...uteis, ...uteis.slice(1)]; // bloco repetido, como na aba
  const novos = ["2026-08-27", "2026-08-28"];

  it("MECANISMO: com o bloco duplicado, o gate recusava o merge deduplicado", () => {
    // Estado como era lido ANTES da correção (duplicatas preservadas).
    const existenteComoEraLido = golden(duplicados);
    // Merge normal do cron: datas únicas + os dias novos.
    const proximo = golden([...uteis, ...novos]);
    const guard = checkGoldenGuard(existenteComoEraLido, proximo);
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("diminuiria"); // ← a golden congelava aqui
  });

  it("CORREÇÃO: com datas únicas (leitura nova), o mesmo merge passa", () => {
    const existente = golden(uteis); // deduplicado na leitura
    const proximo = golden([...uteis, ...novos]);
    expect(checkGoldenGuard(existente, proximo)).toEqual({ ok: true });
  });

  it("o gate segue protegendo o histórico (nada some, nada muda)", () => {
    const existente = golden(["2026-08-25", "2026-08-26"]);
    const semUmDia = golden(["2026-08-26"]);
    expect(checkGoldenGuard(existente, semUmDia).ok).toBe(false);

    const mutado = golden(["2026-08-25", "2026-08-26"]);
    mutado.prices["2026-08-25"].VOO = 999;
    expect(checkGoldenGuard(existente, mutado).ok).toBe(false);
  });
});

describe("abaSaudavel — quando a escrita incremental é segura", () => {
  const dates = ["2026-08-25", "2026-08-26"];

  it("ordem física == lógica → saudável (incremental liberado)", () => {
    expect(abaSaudavel(["2026-08-25", "2026-08-26"], dates)).toBe(true);
    expect(abaSaudavel(undefined, dates)).toBe(true); // sem info → assume ok
  });

  it("linha duplicada → NÃO saudável (força rewrite, que higieniza)", () => {
    expect(abaSaudavel(["2026-08-25", "2026-08-26", "2026-08-26"], dates)).toBe(false);
  });

  it("linhas fora de ordem → NÃO saudável (update por índice acertaria a linha errada)", () => {
    expect(abaSaudavel(["2026-08-26", "2026-08-25"], dates)).toBe(false);
  });
});
