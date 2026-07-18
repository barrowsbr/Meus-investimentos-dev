import { describe, it, expect, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Regressão do MOTOR FISCAL (lib/tax) — o subsistema onde número errado vira
// imposto errado na declaração. Cobre:
//  • rules.ts    — rulesets datados (Lei 14.754/23), DARF, tabela regressiva RF
//  • engine.ts   — preço médio (não FIFO), taxas, dia-trade, eventos societários
//                  e EXTERIOR MULTI-MOEDA (PTAX da moeda certa — gap histórico)
//  • apurador.ts — isenção 20k só p/ ações, buckets isolados, carry de prejuízo,
//                  exterior anual (15% Lei 14.754/23)
//  • cambio-ir.ts— ganho cambial multi-moeda por PM, isenção espécie US$5k,
//                  FX→FX transfere custo, liquidação descoberta avisa
// Fixtures 100% sintéticas — sem rede, sem planilha.
// ─────────────────────────────────────────────────────────────────────────────

import { rfAliquotaRegressiva, vencimentoDarf, rulesetParaData, regra } from "@/lib/tax/rules";
import { classifyAsset, isCompra, isVenda, processarVendas, apurarGanhos, type RawTx, type PtaxLookup } from "@/lib/tax/engine";
import { apurar } from "@/lib/tax/apurador";
import { apurarCambioIr, aliquotaGcapProgressiva } from "@/lib/tax/cambio-ir";

const semFx: PtaxLookup = () => 1;

function tx(p: Partial<RawTx> & { date: string; tipo: string; ticker: string; quantidade: number; preco: number }): RawTx {
  return { taxas: 0, moeda: "BRL", corretora: "B3", ...p };
}

// ── rules.ts ─────────────────────────────────────────────────────────────────

describe("rules — tabela regressiva de RF", () => {
  it("degraus exatos: 22,5% → 20% → 17,5% → 15%", () => {
    expect(rfAliquotaRegressiva(1)).toBe(0.225);
    expect(rfAliquotaRegressiva(180)).toBe(0.225);
    expect(rfAliquotaRegressiva(181)).toBe(0.20);
    expect(rfAliquotaRegressiva(360)).toBe(0.20);
    expect(rfAliquotaRegressiva(361)).toBe(0.175);
    expect(rfAliquotaRegressiva(720)).toBe(0.175);
    expect(rfAliquotaRegressiva(721)).toBe(0.15);
    expect(rfAliquotaRegressiva(5000)).toBe(0.15);
  });
});

describe("rules — vencimento do DARF (último dia útil do mês seguinte)", () => {
  it("mês seguinte terminando em dia útil", () => {
    expect(vencimentoDarf("2025-01")).toBe("2025-02-28"); // sex
    expect(vencimentoDarf("2025-05")).toBe("2025-06-30"); // seg
  });
  it("recua quando o último dia cai no fim de semana", () => {
    // ago/2025: dia 31 é domingo → recua para sexta 29
    expect(vencimentoDarf("2025-07")).toBe("2025-08-29");
  });
});

describe("rules — rulesets datados (Lei 14.754/2023)", () => {
  it("até 2023: exterior MENSAL com isenção de R$35k", () => {
    const r = regra("exterior", "2023-06-15");
    expect(r.apuracao).toBe("mensal");
    expect(r.isencaoMensalVendas).toBe(35000);
    expect(r.isentavel).toBe(true);
  });
  it("de 2024 em diante: exterior ANUAL 15% SEM isenção", () => {
    const r = regra("exterior", "2024-01-01");
    expect(r.apuracao).toBe("anual");
    expect(r.aliquota).toBe(0.15);
    expect(r.isentavel).toBe(false);
    expect(r.isencaoMensalVendas).toBeUndefined();
  });
  it("B3 estável nos dois regimes: ações 15% (isenção 20k), FII 20%, day-trade 20%", () => {
    for (const data of ["2023-05-10", "2025-05-10"]) {
      expect(regra("acoes_swing", data).aliquota).toBe(0.15);
      expect(regra("acoes_swing", data).isencaoMensalVendas).toBe(20000);
      expect(regra("fii", data).aliquota).toBe(0.20);
      expect(regra("day_trade", data).aliquota).toBe(0.20);
      expect(regra("etf_acoes", data).isentavel).toBe(false); // ETF nunca isento
    }
    expect(rulesetParaData("2023-12-31").effectiveTo).toBe("2023-12-31");
  });
});

// ── engine.ts ────────────────────────────────────────────────────────────────

describe("engine — classificação e parsing", () => {
  it("classifica pela moeda/natureza, não pela corretora", () => {
    expect(classifyAsset("VALE3", "BRL")).toBe("acoes");
    expect(classifyAsset("VOO", "USD")).toBe("exterior");
    expect(classifyAsset("VOW3.DE", "EUR")).toBe("exterior"); // moeda estrangeira ⇒ exterior
  });
  it("compra/venda aceita as variações da planilha", () => {
    expect(isCompra("Compra")).toBe(true);
    expect(isCompra("buy")).toBe(true);
    expect(isCompra("Subscrição")).toBe(true);
    expect(isVenda("Venda")).toBe(true);
    expect(isVenda("sell")).toBe(true);
    expect(isVenda("Resgate")).toBe(true);
    expect(isVenda("aporte")).toBe(false);
  });
});

describe("engine — preço médio ponderado (regra RFB, não FIFO)", () => {
  it("PM pondera compras e permanece após a venda", () => {
    const { eventos, posicoes } = processarVendas([
      tx({ date: "2025-01-10", tipo: "Compra", ticker: "VALE3", quantidade: 100, preco: 10 }),
      tx({ date: "2025-02-10", tipo: "Compra", ticker: "VALE3", quantidade: 100, preco: 20 }),
      tx({ date: "2025-03-10", tipo: "Venda", ticker: "VALE3", quantidade: 50, preco: 30 }),
    ], [], semFx);
    // PM = (100×10 + 100×20) / 200 = 15 → ganho = 50 × (30 − 15) = 750
    expect(eventos).toHaveLength(1);
    expect(eventos[0].gainBRL).toBeCloseTo(750, 6);
    expect(eventos[0].modalidade).toBe("acoes_swing");
    // o PM dos remanescentes NÃO muda com a venda
    expect(posicoes[0].qty).toBeCloseTo(150, 6);
    expect(posicoes[0].pmNative).toBeCloseTo(15, 6);
  });

  it("taxas entram no custo da compra e saem do líquido da venda", () => {
    const { eventos } = processarVendas([
      tx({ date: "2025-01-10", tipo: "Compra", ticker: "ITUB4", quantidade: 100, preco: 10, taxas: 50 }),
      tx({ date: "2025-02-10", tipo: "Venda", ticker: "ITUB4", quantidade: 100, preco: 12, taxas: 30 }),
    ], [], semFx);
    // custo 1050, líquido 1170 → ganho 120
    expect(eventos[0].gainBRL).toBeCloseTo(120, 6);
  });

  it("dia-trade separa do swing (mesmo dia, mesmo ativo) e o excedente vira estoque", () => {
    const { eventos, posicoes } = processarVendas([
      tx({ date: "2025-01-10", tipo: "Compra", ticker: "PETR4", quantidade: 100, preco: 10 }),
      tx({ date: "2025-01-10", tipo: "Venda", ticker: "PETR4", quantidade: 60, preco: 12 }),
    ], [], semFx);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].modalidade).toBe("day_trade");
    expect(eventos[0].ehDayTrade).toBe(true);
    expect(eventos[0].quantidade).toBe(60);
    expect(eventos[0].gainBRL).toBeCloseTo(60 * 2, 6);
    expect(posicoes[0].qty).toBeCloseTo(40, 6); // excedente comprado fica em carteira
  });

  it("desdobramento ajusta qtd e PM sem gerar ganho", () => {
    const { eventos, posicoes } = processarVendas(
      [
        tx({ date: "2025-01-10", tipo: "Compra", ticker: "MGLU3", quantidade: 10, preco: 100 }),
        tx({ date: "2025-03-10", tipo: "Venda", ticker: "MGLU3", quantidade: 20, preco: 50 }),
      ],
      [{ date: "2025-02-01", ticker: "MGLU3", tipo: "desdobramento", fator: 2 }],
      semFx,
    );
    // 10 @100 → split 2:1 → 20 @50; venda a 50 = ganho ZERO
    expect(posicoes).toHaveLength(0);
    expect(eventos[0].gainBRL).toBeCloseTo(0, 6);
  });
});

describe("engine — exterior MULTI-MOEDA (o gap que motivou esta suíte)", () => {
  it("usa a PTAX da MOEDA DO ATIVO (EUR, não USD) na compra e na venda", () => {
    const chamadas: Array<[string, string]> = [];
    const ptax: PtaxLookup = (moeda, data) => {
      chamadas.push([moeda, data]);
      if (moeda === "EUR") return data === "2024-02-01" ? 5.0 : 6.0;
      return 1; // BRL
    };
    const { eventos } = processarVendas([
      tx({ date: "2024-02-01", tipo: "Compra", ticker: "VOW3.DE", quantidade: 10, preco: 100, moeda: "EUR", corretora: "IBKR" }),
      tx({ date: "2024-08-01", tipo: "Venda", ticker: "VOW3.DE", quantidade: 10, preco: 110, moeda: "EUR", corretora: "IBKR" }),
    ], [], ptax);

    // O motor TEM que consultar a PTAX do EUR — nunca assumir USD.
    expect(chamadas.some(([m]) => m === "EUR")).toBe(true);
    expect(chamadas.some(([m]) => m === "USD")).toBe(false);

    const ev = eventos[0];
    expect(ev.modalidade).toBe("exterior");
    expect(ev.gainNative).toBeCloseTo(100, 6);            // 10 × (110 − 100) em EUR
    expect(ev.costBRL).toBeCloseTo(10 * 100 * 5.0, 6);    // PTAX da AQUISIÇÃO
    expect(ev.proceedsBRL).toBeCloseTo(10 * 110 * 6.0, 6);// PTAX da ALIENAÇÃO
    expect(ev.gainBRL).toBeCloseTo(6600 - 5000, 6);       // câmbio DENTRO do ganho
    expect(ev.ptaxVenda).toBe(6.0);
  });

  it("flat na moeda nativa ainda gera ganho em BRL se o câmbio subiu (Lei 14.754/23)", () => {
    const ptax: PtaxLookup = (_m, data) => (data === "2024-02-01" ? 5.0 : 5.5);
    const eventos = apurarGanhos([
      tx({ date: "2024-02-01", tipo: "Compra", ticker: "IBM", quantidade: 10, preco: 200, moeda: "USD", corretora: "IBKR" }),
      tx({ date: "2024-09-01", tipo: "Venda", ticker: "IBM", quantidade: 10, preco: 200, moeda: "USD", corretora: "IBKR" }),
    ], [], ptax);
    expect(eventos[0].gainNative).toBeCloseTo(0, 6);
    expect(eventos[0].gainBRL).toBeCloseTo(2000 * 0.5, 6); // só variação cambial
  });
});

// ── apurador.ts ──────────────────────────────────────────────────────────────

const mk = (over: Partial<import("@/lib/tax/engine").RealizedEvent>): import("@/lib/tax/engine").RealizedEvent => ({
  date: "2025-03-10", month: "2025-03", year: "2025",
  ticker: "XXXX", assetClass: "acoes", modalidade: "acoes_swing",
  quantidade: 1, proceedsNative: 0, costNative: 0, gainNative: 0,
  proceedsBRL: 0, costBRL: 0, gainBRL: 0, moeda: "BRL", ehDayTrade: false,
  ...over,
});

describe("apurador — isenção de R$20k (só ações à vista)", () => {
  it("vendas de ações ≤ 20k no mês: ganho isento, IR zero", () => {
    const ap = apurar([mk({ proceedsBRL: 15000, gainBRL: 3000 })]);
    expect(ap.meses[0].isencaoAcoes).toBe(true);
    expect(ap.meses[0].irTotal).toBe(0);
  });
  it("vendas acima de 20k: 15% sobre o ganho", () => {
    const ap = apurar([mk({ proceedsBRL: 30000, gainBRL: 4000 })]);
    expect(ap.meses[0].isencaoAcoes).toBe(false);
    expect(ap.meses[0].irTotal).toBeCloseTo(600, 6);
  });
  it("ETF NÃO goza da isenção mesmo com vendas pequenas", () => {
    const ap = apurar([mk({ modalidade: "etf_acoes", assetClass: "etf_acoes", proceedsBRL: 5000, gainBRL: 1000 })]);
    expect(ap.meses[0].irTotal).toBeCloseTo(150, 6);
  });
  it("prejuízo em mês isento é DESCARTADO (não vira crédito)", () => {
    const ap = apurar([
      mk({ month: "2025-01", date: "2025-01-10", proceedsBRL: 10000, gainBRL: -2000 }), // isento → descartado
      mk({ month: "2025-02", date: "2025-02-10", proceedsBRL: 30000, gainBRL: 3000 }),
    ]);
    expect(ap.meses[1].buckets[0].prejuizoAcumIni).toBe(0);
    expect(ap.meses[1].irTotal).toBeCloseTo(450, 6);
  });
});

describe("apurador — compensação de prejuízo em buckets isolados", () => {
  it("prejuízo swing carrega e abate o ganho do mês seguinte", () => {
    const ap = apurar([
      mk({ month: "2025-01", date: "2025-01-10", proceedsBRL: 30000, gainBRL: -1000 }),
      mk({ month: "2025-02", date: "2025-02-10", proceedsBRL: 30000, gainBRL: 5000 }),
    ]);
    expect(ap.meses[0].irTotal).toBe(0);
    const fev = ap.meses[1].buckets.find(b => b.bucket === "swing")!;
    expect(fev.prejuizoAcumIni).toBeCloseTo(1000, 6);
    expect(fev.baseTributavel).toBeCloseTo(4000, 6);
    expect(ap.meses[1].irTotal).toBeCloseTo(600, 6);
  });
  it("prejuízo de FII NÃO compensa ganho de ações (buckets isolados)", () => {
    const ap = apurar([
      mk({ month: "2025-01", date: "2025-01-10", modalidade: "fii", assetClass: "fii", proceedsBRL: 10000, gainBRL: -3000 }),
      mk({ month: "2025-02", date: "2025-02-10", proceedsBRL: 30000, gainBRL: 2000 }),
    ]);
    expect(ap.meses[1].irTotal).toBeCloseTo(300, 6);        // 15% cheio — sem abater FII
    expect(ap.prejuizoFinal.fii).toBeCloseTo(3000, 6);      // segue acumulado no bucket dele
  });
  it("FII paga 20% e day-trade 20% com dedo-duro de 1%", () => {
    const ap = apurar([
      mk({ modalidade: "fii", assetClass: "fii", proceedsBRL: 10000, gainBRL: 1000 }),
      mk({ modalidade: "day_trade", ehDayTrade: true, proceedsBRL: 8000, gainBRL: 500 }),
    ]);
    const m = ap.meses[0];
    expect(m.buckets.find(b => b.bucket === "fii")!.irDevido).toBeCloseTo(200, 6);
    expect(m.buckets.find(b => b.bucket === "day")!.irDevido).toBeCloseTo(100, 6);
    expect(m.irrfDedoDuro).toBeCloseTo(5, 6);
  });
});

describe("apurador — exterior anual (Lei 14.754/23)", () => {
  it("consolida por ano a 15% e carrega prejuízo entre anos", () => {
    const ap = apurar([
      mk({ modalidade: "exterior", assetClass: "exterior", year: "2024", month: "2024-05", date: "2024-05-10", moeda: "USD", gainBRL: -2000 }),
      mk({ modalidade: "exterior", assetClass: "exterior", year: "2025", month: "2025-04", date: "2025-04-10", moeda: "USD", gainBRL: 10000 }),
    ]);
    expect(ap.meses).toHaveLength(0); // exterior não entra na apuração mensal
    expect(ap.exterior[0].irDevido).toBe(0);
    expect(ap.exterior[0].prejuizoAcumFim).toBeCloseTo(2000, 6);
    expect(ap.exterior[1].baseTributavel).toBeCloseTo(8000, 6);
    expect(ap.exterior[1].irDevido).toBeCloseTo(1200, 6);
    expect(ap.irTotalExterior).toBeCloseTo(1200, 6);
  });
});

// ── cambio-ir.ts ─────────────────────────────────────────────────────────────

describe("cambio-ir — alíquota progressiva de ganho de capital", () => {
  it("faixas 15% / 17,5% / 20% / 22,5%", () => {
    expect(aliquotaGcapProgressiva(1_000)).toBe(0.15);
    expect(aliquotaGcapProgressiva(5_000_000)).toBe(0.15);
    expect(aliquotaGcapProgressiva(5_000_001)).toBe(0.175);
    expect(aliquotaGcapProgressiva(10_000_001)).toBe(0.20);
    expect(aliquotaGcapProgressiva(30_000_001)).toBe(0.225);
  });
});

describe("cambio-ir — multi-moeda por preço médio", () => {
  const remessas = [
    { data: "2024-01-10", moeda_origem: "BRL", moeda_destino: "USD", valor_origem: 25000, valor_destino: 5000 }, // PM 5,00
    { data: "2024-02-10", moeda_origem: "BRL", moeda_destino: "EUR", valor_origem: 6000, valor_destino: 1000 },  // PM 6,00
  ];

  it("liquidação parcial USD→BRL: ganho contra o PM, estoques separados por moeda", () => {
    const r = apurarCambioIr([
      ...remessas,
      { data: "2024-06-10", moeda_origem: "USD", moeda_destino: "BRL", valor_origem: 1000, valor_destino: 5500 },
    ]);
    const usd2024 = r.anos.find(a => a.ano === "2024" && a.moeda === "USD")!;
    expect(usd2024.ganhoBRL).toBeCloseTo(500, 6);           // 5500 − 1000×5,00
    expect(usd2024.isentoEspecie).toBe(true);               // 1000 ≤ US$5k/ano
    expect(usd2024.irEspecie).toBe(0);
    // estoques: USD baixou, EUR intacto — moedas NUNCA se misturam
    expect(r.usdEstoqueFinal).toBeCloseTo(4000, 6);
    expect(r.pmDolarFinal).toBeCloseTo(5.0, 6);
    expect(r.estoques.find(e => e.moeda === "EUR")!.estoque).toBeCloseTo(1000, 6);
    expect(r.estoques.find(e => e.moeda === "EUR")!.pmBRL).toBeCloseTo(6.0, 6);
  });

  it("alienação acima de US$5k/ano: perde a isenção espécie (15%)", () => {
    const r = apurarCambioIr([
      { data: "2024-01-10", moeda_origem: "BRL", moeda_destino: "USD", valor_origem: 30000, valor_destino: 6000 },
      { data: "2024-07-10", moeda_origem: "USD", moeda_destino: "BRL", valor_origem: 6000, valor_destino: 33000 },
    ]);
    const ano = r.anos[0];
    expect(ano.isentoEspecie).toBe(false);
    expect(ano.ganhoBRL).toBeCloseTo(3000, 6);
    expect(ano.irEspecie).toBeCloseTo(3000 * 0.15, 6);
  });

  it("FX→FX (USD→EUR) transfere custo proporcional SEM fato gerador", () => {
    const r = apurarCambioIr([
      { data: "2024-01-10", moeda_origem: "BRL", moeda_destino: "USD", valor_origem: 25000, valor_destino: 5000 },
      { data: "2024-03-10", moeda_origem: "USD", moeda_destino: "EUR", valor_origem: 1000, valor_destino: 900 },
    ]);
    expect(r.anos).toHaveLength(0); // nenhuma liquidação para BRL
    expect(r.usdEstoqueFinal).toBeCloseTo(4000, 6);
    const eur = r.estoques.find(e => e.moeda === "EUR")!;
    expect(eur.estoque).toBeCloseTo(900, 6);
    expect(eur.pmBRL).toBeCloseTo((1000 * 5.0) / 900, 6);   // custo transferido 1:1
  });

  it("liquidação MAIOR que o estoque rastreado gera aviso (margem/remessa faltante)", () => {
    const r = apurarCambioIr([
      { data: "2024-01-10", moeda_origem: "BRL", moeda_destino: "USD", valor_origem: 5000, valor_destino: 1000 },
      { data: "2024-05-10", moeda_origem: "USD", moeda_destino: "BRL", valor_origem: 1500, valor_destino: 8000 },
    ]);
    const liq = r.anos[0].liquidacoes[0];
    expect(liq.aviso).toBeTruthy();
    expect(liq.aviso).toContain("sem estoque rastreado");
  });
});
