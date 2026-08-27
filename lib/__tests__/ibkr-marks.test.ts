import { describe, expect, it } from "vitest";
import { montarMarksParaGolden } from "../ibkr-marks";

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
