import { describe, expect, it } from "vitest";
import { montarMarksParaGolden, aplicarMarksNaGolden, type GoldenLike } from "../ibkr-marks";
import { checkGoldenGuard } from "../db-cotacoes";

const POS = [
  { ticker: "VOO", markPrice: 520.12 },
  { ticker: "DPM", markPrice: 12.34 },        // coluna histórica é DPM.TO
  { ticker: "VOW3.DE", markPrice: 108.9 },
  { ticker: "QUEBRADO", markPrice: 0 },        // inválido — fora
];
const GOLDEN = ["VOO", "DPM.TO", "CMIG4.SA", "^GSPC"];

describe("montarMarksParaGolden — marks oficiais IBKR na golden", () => {
  it("casa por base sem sufixo e cria coluna nova quando não existe", () => {
    const m = montarMarksParaGolden(POS, "2026-08-27", GOLDEN);
    expect(m).toEqual({
      date: "2026-08-27",
      valores: { "VOO": 520.12, "DPM.TO": 12.34, "VOW3.DE": 108.9 },
    });
  });

  it("fim de semana e data inválida → null (não polui a golden)", () => {
    expect(montarMarksParaGolden(POS, "2026-08-29", GOLDEN)).toBeNull(); // sábado
    expect(montarMarksParaGolden(POS, "29/08/2026", GOLDEN)).toBeNull();
  });

  it("sem nenhum mark válido → null", () => {
    expect(montarMarksParaGolden([{ ticker: "X", markPrice: -1 }], "2026-08-27", GOLDEN)).toBeNull();
  });
});

// ── Garantias de QUALIDADE DE DADOS do regime híbrido ───────────────────────
// Provas executáveis de que a golden não perde nem muta nada com os marks.

const goldenBase = (): GoldenLike => ({
  tickers: ["CMIG4.SA", "DPM.TO", "VOO", "^GSPC"],
  dates: ["2026-08-25", "2026-08-26"],
  prices: {
    "2026-08-25": { "CMIG4.SA": 10.1, "DPM.TO": 12.0, "VOO": 519.0, "^GSPC": 6400 },
    // 26/08: células de VOO/DPM.TO RESERVADAS (vazias) pelo cron de cotações.
    "2026-08-26": { "CMIG4.SA": 10.2, "^GSPC": 6410 },
  },
});

describe("aplicarMarksNaGolden — nenhuma perda, nenhuma mutação", () => {
  it("preenche SÓ as células vazias da linha; todo o resto fica bit a bit igual", () => {
    const golden = goldenBase();
    const antes = JSON.parse(JSON.stringify(golden));
    const { data, preenchidos } = aplicarMarksNaGolden(golden, {
      date: "2026-08-26", valores: { "VOO": 520.5, "DPM.TO": 12.4 },
    });
    expect(preenchidos).toBe(2);
    expect(data.prices["2026-08-26"]).toEqual({ "CMIG4.SA": 10.2, "^GSPC": 6410, "VOO": 520.5, "DPM.TO": 12.4 });
    expect(data.prices["2026-08-25"]).toEqual(antes.prices["2026-08-25"]); // passado intocado
    expect(golden).toEqual(antes); // entrada não é mutada (função pura)
  });

  it("célula JÁ preenchida nunca é sobrescrita (Yahoo chegou antes → fica)", () => {
    const { data, preenchidos } = aplicarMarksNaGolden(goldenBase(), {
      date: "2026-08-25", valores: { "VOO": 999 },
    });
    expect(preenchidos).toBe(0);
    expect(data.prices["2026-08-25"]["VOO"]).toBe(519.0);
  });

  it("o resultado SEMPRE passa no checkGoldenGuard (superset por construção)", () => {
    const golden = goldenBase();
    const { data } = aplicarMarksNaGolden(golden, {
      date: "2026-08-27", valores: { "VOO": 521, "NOVA": 10 }, // dia novo + coluna nova
    });
    expect(checkGoldenGuard(golden, data)).toEqual({ ok: true });
    expect(data.dates).toContain("2026-08-27");
    expect(data.tickers).toContain("NOVA");
  });

  it("contraprova: o gate RECUSA qualquer escrita que mutasse célula existente", () => {
    const golden = goldenBase();
    const mutado = JSON.parse(JSON.stringify(golden)) as GoldenLike;
    mutado.prices["2026-08-25"]["VOO"] = 555; // um 'mark' malicioso sobre célula cheia
    const guard = checkGoldenGuard(golden, mutado);
    expect(guard.ok).toBe(false);
    expect(guard.reason).toContain("VOO@2026-08-25");
  });
});
