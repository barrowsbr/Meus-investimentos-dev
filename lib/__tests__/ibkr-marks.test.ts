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
      rejeitados: [],
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


// ── Gate de divergência: o que NÃO pode entrar na golden ────────────────────
// O TWR é o core do projeto; um mark em unidade/moeda errada corromperia a
// série de forma silenciosa (um dia de −99% ou +9900%). Cada cenário abaixo é
// um modo de falha real da integração IBKR→golden.

const historico = (col: string, preco: number): GoldenLike => ({
  tickers: [col],
  dates: ["2026-08-25", "2026-08-26"],
  prices: { "2026-08-25": { [col]: preco * 0.99 }, "2026-08-26": { [col]: preco } },
});

describe("montarMarksParaGolden — gate de divergência (unidade/moeda/coluna)", () => {
  it("mark coerente com o histórico ENTRA", () => {
    const m = montarMarksParaGolden([{ ticker: "VOO", markPrice: 522 }], "2026-08-27", ["VOO"], historico("VOO", 520));
    expect(m!.valores).toEqual({ VOO: 522 });
    expect(m!.rejeitados).toEqual([]);
  });

  it("PENCE × LIBRA (LSE, fator ~100) é BARRADO", () => {
    // Yahoo guarda a coluna em pence (1.234); a IBKR manda libras (12,34).
    const m = montarMarksParaGolden([{ ticker: "CSPX.L", markPrice: 12.34 }], "2026-08-27", ["CSPX.L"], historico("CSPX.L", 1234));
    expect(m!.valores).toEqual({});
    expect(m!.rejeitados).toEqual([{ coluna: "CSPX.L", fator: 0.01 }]);
  });

  it("moeda trocada (mark em US$ numa coluna CAD) é BARRADO", () => {
    const m = montarMarksParaGolden([{ ticker: "DPM.TO", markPrice: 8.9 }], "2026-08-27", ["DPM.TO"], historico("DPM.TO", 12.34));
    expect(m!.valores).toEqual({});
    expect(m!.rejeitados[0].coluna).toBe("DPM.TO");
  });

  it("split (>25%) é BARRADO — o Yahoo, que ajusta split, preenche em T−2", () => {
    const m = montarMarksParaGolden([{ ticker: "NVDA", markPrice: 60 }], "2026-08-27", ["NVDA"], historico("NVDA", 600));
    expect(m!.valores).toEqual({});
  });

  it("oscilação normal (±10%) NÃO é barrada", () => {
    for (const preco of [468, 572]) { // −10% / +10%
      const m = montarMarksParaGolden([{ ticker: "VOO", markPrice: preco }], "2026-08-27", ["VOO"], historico("VOO", 520));
      expect(m!.valores).toEqual({ VOO: preco });
    }
  });

  it("ticker NOVO (sem histórico) entra — não há com o que comparar", () => {
    const m = montarMarksParaGolden([{ ticker: "NOVO", markPrice: 42 }], "2026-08-27", ["VOO"], historico("VOO", 520));
    expect(m!.valores).toEqual({ NOVO: 42 });
  });

  it("a referência é o PASSADO — o próprio dia não serve de âncora", () => {
    const g = historico("VOO", 520);
    g.dates.push("2026-08-27");
    g.prices["2026-08-27"] = { VOO: 9999 }; // lixo no próprio dia não vira referência
    const m = montarMarksParaGolden([{ ticker: "VOO", markPrice: 522 }], "2026-08-27", ["VOO"], g);
    expect(m!.valores).toEqual({ VOO: 522 });
  });

  it("sem golden (chamada legada) aceita tudo — compatibilidade", () => {
    const m = montarMarksParaGolden([{ ticker: "VOO", markPrice: 1 }], "2026-08-27", ["VOO"]);
    expect(m!.valores).toEqual({ VOO: 1 });
  });
});
