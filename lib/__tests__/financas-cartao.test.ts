import { describe, it, expect } from "vitest";
import { parseOfx, pareceOfx } from "../financas/ofx";
import {
  categorizarAuto, categoriaEfetiva, normalizarEstabelecimento,
  detectarAssinaturas, detectarParcelamentos,
} from "../financas/categorias";
import type { TransacaoCartao } from "../financas/ofx";

// Trecho REAL (anonimizado) do OFX do Nubank — inclui a pegadinha verdadeira:
// FITID repetido entre o IOF e a compra internacional que o gerou.
const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<CCSTMTRS>
<CURDEF>BRL</CURDEF>
<BANKTRANLIST>
<DTSTART>20260727000000[-3:BRT]</DTSTART>
<DTEND>20260827000000[-3:BRT]</DTEND>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260802000000[-3:BRT]</DTPOSTED>
<TRNAMT>-19.94</TRNAMT>
<FITID>mesmo-id</FITID>
<MEMO>IOF de compra internacional</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260802000000[-3:BRT]</DTPOSTED>
<TRNAMT>-569.75</TRNAMT>
<FITID>mesmo-id</FITID>
<MEMO>Anthropic* Claude Sub</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260727000000[-3:BRT]</DTPOSTED>
<TRNAMT>-73.53</TRNAMT>
<FITID>id-pichau</FITID>
<MEMO>Pichau Informatica - NuPay - Parcela 4/12</MEMO>
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260803000000[-3:BRT]</DTPOSTED>
<TRNAMT>6588.39</TRNAMT>
<FITID>id-pag</FITID>
<MEMO>Pagamento recebido</MEMO>
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</OFX>`;

describe("parseOfx", () => {
  const r = parseOfx(OFX);

  it("reconhece OFX e extrai todos os lançamentos", () => {
    expect(pareceOfx(OFX)).toBe(true);
    expect(pareceOfx("data,valor\n1,2")).toBe(false);
    expect(r.transacoes).toHaveLength(4);
    expect(r.periodo).toEqual({ inicio: "2026-07-27", fim: "2026-08-27" });
    expect(r.moeda).toBe("BRL");
  });

  it("FITID repetido gera CHAVES diferentes (dedup por fitid+valor)", () => {
    const chaves = r.transacoes.map((t) => t.chave);
    expect(new Set(chaves).size).toBe(4);
    expect(chaves).toContain("mesmo-id:-19.94");
    expect(chaves).toContain("mesmo-id:-569.75");
  });

  it("extrai parcela do memo e tipo de crédito", () => {
    const pichau = r.transacoes.find((t) => t.fitid === "id-pichau")!;
    expect(pichau.parcela).toEqual({ n: 4, total: 12 });
    const pag = r.transacoes.find((t) => t.fitid === "id-pag")!;
    expect(pag.tipo).toBe("CREDIT");
    expect(pag.valor).toBeCloseTo(6588.39);
  });
});

describe("categorização automática", () => {
  it("classifica os estabelecimentos reais do extrato", () => {
    expect(categorizarAuto("Carrefour 358 Sbk")).toBe("Mercado");
    expect(categorizarAuto("Ifd*Santa Barbara Come")).toBe("Alimentação");
    expect(categorizarAuto("Auto Posto A B")).toBe("Combustível");
    expect(categorizarAuto("Uber - NuPay")).toBe("Transporte");
    expect(categorizarAuto("NuTag*TMJ2A17")).toBe("Transporte");
    expect(categorizarAuto("Petz Digital")).toBe("Pets");
    expect(categorizarAuto("Drogasil1042")).toBe("Saúde");
    expect(categorizarAuto("Anthropic* Claude Sub")).toBe("Assinaturas");
    expect(categorizarAuto("Google Youtubepremium")).toBe("Assinaturas");
    expect(categorizarAuto("Barbearia Ferrero Cape")).toBe("Beleza & Cuidados");
    expect(categorizarAuto("IOF de compra internacional")).toBe("Tarifas & IOF");
    expect(categorizarAuto("Pagamento recebido")).toBe("Pagamento");
    expect(categorizarAuto("Ebn *Playstation - Parcela 1/4")).toBe("Lazer");
  });

  it("regra manual do dono vence a automática (por estabelecimento normalizado)", () => {
    const regras = new Map([[normalizarEstabelecimento("Mp *Bestpawsskinc"), "Compras"]]);
    expect(categoriaEfetiva("Mp *Bestpawsskinc", regras)).toBe("Compras");
    expect(categoriaEfetiva("Petz Digital", regras)).toBe("Pets"); // sem regra → auto
  });

  it("normaliza prefixos de adquirente e sufixo de parcela", () => {
    expect(normalizarEstabelecimento("Ifd*Fabrica da Esfiha")).toBe("fabrica da esfiha");
    expect(normalizarEstabelecimento("Pichau Informatica - NuPay - Parcela 4/12")).toBe("pichau informatica");
  });
});

const t = (over: Partial<TransacaoCartao>): TransacaoCartao => ({
  chave: Math.random().toString(36), fitid: "x", data: "2026-08-01", valor: -10,
  descricao: "Loja", tipo: "DEBIT", parcela: null, ...over,
});

describe("detectarAssinaturas", () => {
  it("recorrência: mesmo lugar, 2 meses, valor estável", () => {
    const r = detectarAssinaturas([
      t({ descricao: "Academia Fit", data: "2026-07-05", valor: -120 }),
      t({ descricao: "Academia Fit", data: "2026-08-05", valor: -120 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe("academia fit");
    expect(r[0].meses).toBe(2);
  });

  it("serviço conhecido entra com 1 cobrança; loja avulsa não", () => {
    const r = detectarAssinaturas([
      t({ descricao: "Google One", valor: -24.99 }),
      t({ descricao: "Restaurante Leggero", valor: -60.22 }),
    ]);
    expect(r.map((a) => a.nome)).toEqual(["google one"]);
  });

  it("parcelas e valores instáveis não viram assinatura", () => {
    const r = detectarAssinaturas([
      t({ descricao: "Amazon - Parcela 6/6", parcela: { n: 6, total: 6 } }),
      t({ descricao: "Carrefour 358 Sbk", data: "2026-07-02", valor: -163.13 }),
      t({ descricao: "Carrefour 358 Sbk", data: "2026-08-02", valor: -28.47 }),
    ]);
    expect(r).toHaveLength(0);
  });
});

describe("detectarParcelamentos", () => {
  it("calcula progresso, restante e fim previsto", () => {
    const r = detectarParcelamentos([
      t({ descricao: "Pichau Informatica - NuPay - Parcela 4/12", data: "2026-07-27", valor: -73.53, parcela: { n: 4, total: 12 } }),
      t({ descricao: "Pichau Informatica - NuPay - Parcela 3/12", data: "2026-06-27", valor: -73.53, parcela: { n: 3, total: 12 } }),
      t({ descricao: "Amazon - Parcela 6/6", data: "2026-07-27", valor: -54.99, parcela: { n: 6, total: 6 } }),
    ]);
    const pichau = r.find((p) => p.nome === "pichau informatica")!;
    expect(pichau.parcelaAtual).toBe(4);
    expect(pichau.restantes).toBe(8);
    expect(pichau.valorTotal).toBeCloseTo(73.53 * 12);
    expect(pichau.fimPrevisto).toBe("2027-03"); // jul/26 + 8 meses
    const amazon = r.find((p) => p.nome === "amazon")!;
    expect(amazon.restantes).toBe(0);
  });
});
