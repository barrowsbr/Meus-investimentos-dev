import { describe, it, expect } from "vitest";
import { parseTesouro, parseTrajetoriaSelic } from "../fontes";

const HOJE = "2026-08-05";

// Formato real do JSON do Tesouro Direto (nomes abreviados, aninhado em TrsrBd).
const tdReal = {
  responseStatus: 200,
  response: {
    TrsrBdMkt: { opngDtTm: "2026-08-05T09:30:00", clsgDtTm: "2026-08-05T18:00:00" },
    TrsrBdTradgList: [
      { TrsrBd: { nm: "Tesouro Prefixado 2029", mtrtyDt: "2029-01-01T00:00:00", anulInvstmtRate: 13.2, anulRedRate: 13.3, untrInvstmtVal: 723.45, semiAnlIntrstInd: false, FinIndxs: { nm: "PREFIXADO" } } },
      { TrsrBd: { nm: "Tesouro Prefixado 2033", mtrtyDt: "2033-01-01T00:00:00", anulInvstmtRate: 13.9, anulRedRate: 14.0, untrInvstmtVal: 480.1, semiAnlIntrstInd: false, FinIndxs: { nm: "PREFIXADO" } } },
      { TrsrBd: { nm: "Tesouro IPCA+ 2029", mtrtyDt: "2029-05-15T00:00:00", anulInvstmtRate: 7.1, untrInvstmtVal: 3200.0, FinIndxs: { nm: "IPCA" } } },
      { TrsrBd: { nm: "Tesouro Selic 2031", mtrtyDt: "2031-03-01T00:00:00", anulInvstmtRate: 0.0432, FinIndxs: { nm: "SELIC" } } },
      { TrsrBd: { nm: "Tesouro Renda+ Aposentadoria Extra 2065", mtrtyDt: "2065-12-15T00:00:00", anulInvstmtRate: 7.4, FinIndxs: { nm: "IPCA" } } },
      { TrsrBd: { nm: "Tesouro Prefixado 2024", mtrtyDt: "2024-01-01T00:00:00", anulInvstmtRate: 11.0, FinIndxs: { nm: "PREFIXADO" } } },
    ],
  },
};

describe("parseTesouro", () => {
  const r = parseTesouro(tdReal, HOJE);

  it("extrai os vértices da curva", () => {
    expect(r.ok).toBe(true);
    expect(r.vertices.map((v) => v.titulo)).toEqual([
      "Tesouro Prefixado 2029",
      "Tesouro IPCA+ 2029",
      "Tesouro Prefixado 2033",
    ]);
  });

  it("EXCLUI Tesouro Selic (LFT não tem taxa de curva)", () => {
    expect(r.vertices.some((v) => v.indexador === "SELIC")).toBe(false);
  });

  it("EXCLUI Renda+/Educa+ (anuidades distorcem a curva)", () => {
    expect(r.vertices.some((v) => /renda\+/i.test(v.titulo))).toBe(false);
  });

  it("EXCLUI título já vencido", () => {
    expect(r.vertices.some((v) => v.titulo.includes("2024"))).toBe(false);
  });

  it("ordena por prazo e calcula os anos", () => {
    const anos = r.vertices.map((v) => v.anos);
    expect([...anos]).toEqual([...anos].sort((a, b) => a - b));
    expect(r.vertices[0].anos).toBeCloseTo(2.4, 0);
  });

  it("lê taxa, preço e vencimento normalizado", () => {
    const p = r.vertices[0];
    expect(p.taxa).toBe(13.2);
    expect(p.precoUnitario).toBe(723.45);
    expect(p.vencimento).toBe("2029-01-01");
  });

  it("captura a data de fechamento do mercado", () => {
    expect(r.fechamento).toBe("2026-08-05");
  });

  // ── tolerância: o parser não pode quebrar se a B3 renomear campos ──
  it("TOLERA nomes alternativos de campo e lista não aninhada", () => {
    const alt = {
      data: [
        { name: "Tesouro Prefixado 2030", maturityDate: "2030-01-01", investmentRate: 13.0, unitInvestmentValue: 690 },
        { name: "Tesouro IPCA+ 2030", maturityDate: "2030-05-15", investmentRate: 7.0 },
      ],
    };
    const alt_r = parseTesouro(alt, HOJE);
    expect(alt_r.ok).toBe(true);
    expect(alt_r.vertices).toHaveLength(2);
    expect(alt_r.vertices[0].indexador).toBe("PREFIXADO"); // inferido pelo NOME
    expect(alt_r.vertices[1].indexador).toBe("IPCA");
  });

  it("TOLERA taxa com vírgula decimal", () => {
    const br = { lista: [{ nm: "Tesouro Prefixado 2031", mtrtyDt: "2031-01-01", anulInvstmtRate: "13,75" }] };
    expect(parseTesouro(br, HOJE).vertices[0].taxa).toBe(13.75);
  });

  it("degrada com honestidade em lixo/vazio (ok=false, sem inventar)", () => {
    expect(parseTesouro({}, HOJE)).toEqual({ vertices: [], fechamento: null, ok: false });
    expect(parseTesouro({ response: { TrsrBdTradgList: [] } }, HOJE).ok).toBe(false);
    expect(parseTesouro(null, HOJE).ok).toBe(false);
  });
});

describe("parseTrajetoriaSelic", () => {
  const rows = [
    { Data: "2026-08-01", Reuniao: "R1/2027", Mediana: 11.5, Minimo: 11, Maximo: 12 },
    { Data: "2026-08-04", Reuniao: "R1/2027", Mediana: 11.25, Minimo: 11, Maximo: 12 }, // coleta mais nova
    { Data: "2026-08-04", Reuniao: "R7/2026", Mediana: 12.5, Minimo: 12, Maximo: 13 },
    { Data: "2026-08-04", Reuniao: "R2/2027", Mediana: 11.0, Minimo: null, Maximo: null },
  ];
  const t = parseTrajetoriaSelic(rows);

  it("mantém só a coleta mais recente de cada reunião", () => {
    const r1 = t.find((p) => p.reuniao === "R1/2027");
    expect(r1?.mediana).toBe(11.25);
    expect(t.filter((p) => p.reuniao === "R1/2027")).toHaveLength(1);
  });

  it("ordena cronologicamente por ano e número da reunião", () => {
    expect(t.map((p) => p.reuniao)).toEqual(["R7/2026", "R1/2027", "R2/2027"]);
  });

  it("ignora linhas sem mediana ou reunião", () => {
    expect(parseTrajetoriaSelic([{ Data: "2026-08-04", Reuniao: "R1/2027" }, {}])).toEqual([]);
  });
});
