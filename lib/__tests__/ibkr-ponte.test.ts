import { describe, expect, it } from "vitest";
import { parseFlexXml } from "../ibkr-flex";

// Campos e tipos conferidos contra o extrato REAL de produção (11/09/2026):
// a seção ChangeInNAV entrega 56 atributos e o parser lia 4; os tipos de
// CashTransaction que chegam são exatamente Broker Interest Paid,
// Deposits/Withdrawals, Dividends, Other Fees e Withholding Tax.

const XML = `<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1" fromDate="20250910" toDate="20260910">
<ChangeInNAV startingValue="15809.68" endingValue="29325.68" depositsWithdrawals="7852.15"
  twr="29.603929084" mtm="5200.50" realized="820.10" changeInUnrealized="4900.00"
  dividends="412.33" withholdingTax="-61.85" interest="-18.40" commissions="-45.20"
  otherFees="-3.10" brokerFees="0" clientFees="0" fxTranslation="-698.42"
  changeInDividendAccruals="12.05" changeInInterestAccruals="-1.20"
  fromDate="20250910" toDate="20260910" currency="USD" />
<CashTransaction type="Broker Interest Paid" amount="-18.40" currency="USD" fxRateToBase="1"
  reportDate="20260731" description="USD DEBIT INT FOR JUL-2026" levelOfDetail="DETAIL" />
<CashTransaction type="Other Fees" amount="-3.10" currency="USD" fxRateToBase="1"
  reportDate="20260805" description="ADR Fee" levelOfDetail="DETAIL" />
<CashTransaction type="Other Fees" amount="-3.10" currency="USD" fxRateToBase="1"
  reportDate="20260805" description="ADR Fee" levelOfDetail="DETAIL" />
<CashTransaction type="Dividends" amount="100.00" currency="USD" symbol="KO"
  reportDate="20260801" levelOfDetail="DETAIL" />
<CashTransaction type="Withholding Tax" amount="-15.00" currency="USD" symbol="KO"
  reportDate="20260801" levelOfDetail="DETAIL" />
<CashTransaction type="Deposits/Withdrawals" amount="1000" currency="USD" fxRateToBase="1"
  reportDate="20260601" levelOfDetail="DETAIL" />
<EquitySummaryByReportDateInBase reportDate="20260909" total="29000" cash="1200" stock="27500"
  funds="300" dividendAccruals="41.20" interestAccruals="2.10" brokerFeesAccrualsComponent="-0.80" />
<EquitySummaryByReportDateInBase reportDate="20260910" total="29325.68" cash="1150.68" stock="27875"
  funds="300" dividendAccruals="53.25" interestAccruals="0.90" brokerFeesAccrualsComponent="-1.10" />
</FlexStatement></FlexStatements></FlexQueryResponse>`;

describe("ChangeInNAV — a ponte do resultado", () => {
  const { changeInNav: c } = parseFlexXml(XML);

  it("lê as parcelas que explicam o resultado, não só os 4 campos antigos", () => {
    expect(c).not.toBeNull();
    expect(c!.mtm).toBe(5200.5);
    expect(c!.realized).toBe(820.1);
    expect(c!.dividendos).toBe(412.33);
    expect(c!.juros).toBe(-18.4);
    expect(c!.comissoes).toBe(-45.2);
    expect(c!.fxTranslation).toBe(-698.42);
  });

  it("preserva o SINAL da IBKR: saída é negativa", () => {
    // Inverter aqui faria a ponte fechar errado por 2× o valor.
    expect(c!.impostoRetido).toBeLessThan(0);
    expect(c!.comissoes).toBeLessThan(0);
    expect(c!.outrasTaxas).toBeLessThan(0);
  });

  it("agrega as taxas de corretora/cliente em 'outras taxas'", () => {
    expect(c!.outrasTaxas).toBe(-3.1); // otherFees + brokerFees + clientFees
  });

  it("o TWR oficial continua vindo junto", () => {
    expect(c!.twr).toBeCloseTo(29.6039, 3);
  });

  // A IBKR emite ~56 linhas no Change in NAV e nós mapeamos as 10 que explicam
  // o resultado de quem investe. As outras (ajuste de custo, evento corporativo,
  // imposto de transação, conta de assessor…) existem e podem ter valor. Por
  // isso a ponte expõe um RESÍDUO em vez de fingir que fecha na unha: um resíduo
  // grande é sinal honesto de que aconteceu algo fora do conjunto mapeado.
  const soma = (x: NonNullable<typeof c>) =>
    x.mtm + x.realized + x.dividendos + x.impostoRetido + x.juros
    + x.comissoes + x.outrasTaxas + x.fxTranslation
    + x.variacaoDividendosAReceber + x.variacaoJurosAReceber;

  it("o resultado do período é NAV final − inicial − aportes", () => {
    expect(c!.endingValue - c!.startingValue - c!.depositsWithdrawals).toBeCloseTo(5663.85, 2);
  });

  it("as parcelas mapeadas explicam o período, e a sobra vira RESÍDUO visível", () => {
    const resultado = c!.endingValue - c!.startingValue - c!.depositsWithdrawals;
    const residuo = resultado - soma(c!);
    // Neste extrato as parcelas explicam >99% do resultado; o resto é o resíduo.
    expect(Math.abs(residuo) / Math.abs(resultado)).toBeLessThan(0.01);
    expect(residuo).not.toBe(0); // e ele NÃO é escondido: a UI mostra
  });

  it("sem as linhas de custo, a ponte acusaria resultado MAIOR do que o real", () => {
    // Contraprova de por que as parcelas negativas entram: ignorá-las inflaria
    // o resultado explicado em ~128 (imposto + juros + comissão + taxas).
    const semCustos = c!.mtm + c!.realized + c!.dividendos + c!.fxTranslation
      + c!.variacaoDividendosAReceber + c!.variacaoJurosAReceber;
    expect(semCustos - soma(c!)).toBeCloseTo(128.55, 2);
  });
});

describe("custosCorretora — o que antes era descartado", () => {
  const { custosCorretora, proventos } = parseFlexXml(XML);

  it("captura juros de margem e taxas (antes morriam no `continue`)", () => {
    expect(custosCorretora.map((c) => c.tipo).sort()).toEqual(["Broker Interest Paid", "Other Fees"]);
  });

  it("NÃO engole dividendo, imposto nem depósito no caminho", () => {
    // Regressão: o novo ramo roda ANTES do `if (!symbol) continue`.
    expect(custosCorretora.some((c) => /dividend|withholding|deposit/i.test(c.tipo))).toBe(false);
    expect(proventos).toHaveLength(2); // o dividendo da KO e o imposto dele
  });

  it("deduplica o lançamento repetido (a Flex emite em dobro)", () => {
    expect(custosCorretora.filter((c) => c.tipo === "Other Fees")).toHaveLength(1);
  });

  it("converte para a moeda base pelo fxRateToBase", () => {
    const juros = custosCorretora.find((c) => c.tipo === "Broker Interest Paid")!;
    expect(juros.valorBase).toBe(-18.4);
    expect(juros.descricao).toContain("DEBIT INT");
  });
});

describe("navComposicao — as ~100 colunas da linha de NAV", () => {
  const { navComposicao, navDiario } = parseFlexXml(XML);

  it("extrai as partes do dia, não só o total", () => {
    expect(navComposicao).toHaveLength(2);
    const hoje = navComposicao[1];
    expect(hoje.caixa).toBe(1150.68);
    expect(hoje.acoes).toBe(27875);
    expect(hoje.fundos).toBe(300);
  });

  it("traz o que está declarado e ainda não foi pago", () => {
    expect(navComposicao[1].dividendosAReceber).toBe(53.25);
    expect(navComposicao[1].jurosAReceber).toBe(0.9);
  });

  it("fica em ordem cronológica e não quebra o NAV diário que já existia", () => {
    expect(navComposicao.map((c) => c.date)).toEqual(["2026-09-09", "2026-09-10"]);
    expect(navDiario).toHaveLength(2);
    expect(navDiario[1].nav).toBe(29325.68);
  });

  it("as partes batem com o total do dia", () => {
    const c = navComposicao[1];
    expect(c.caixa + c.acoes + c.fundos).toBeCloseTo(c.total, 1);
  });
});

describe("extrato sem as seções novas não quebra o que já funcionava", () => {
  it("XML antigo (só NAV) segue parseando, com campos novos vazios", () => {
    const antigo = `<FlexQueryResponse><FlexStatements><FlexStatement accountId="U1">
      <EquitySummaryByReportDateInBase reportDate="20260910" total="100" />
      </FlexStatement></FlexStatements></FlexQueryResponse>`;
    const r = parseFlexXml(antigo);
    expect(r.changeInNav).toBeNull();
    expect(r.custosCorretora).toEqual([]);
    expect(r.navDiario).toHaveLength(1);
    expect(r.navComposicao[0].caixa).toBe(0); // ausente = 0, não NaN
  });
});
