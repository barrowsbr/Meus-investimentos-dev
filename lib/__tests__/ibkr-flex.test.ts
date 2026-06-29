import { describe, it, expect } from "vitest";
import { parseFlexXml } from "../ibkr-flex";

// XML de exemplo no formato Activity Flex Query (datas yyyyMMdd, como configurado).
const SAMPLE = `<FlexQueryResponse queryName="Dashboard Sync" type="AF">
 <FlexStatements count="1">
  <FlexStatement accountId="U14836620" fromDate="20260101" toDate="20260628">
   <Trades>
     <Trade currency="USD" symbol="AAPL" tradeDate="20260601" dateTime="20260601;101010" quantity="10" tradePrice="190.50" tradeMoney="1905.00" ibCommission="-1.00" ibCommissionCurrency="USD" netCash="-1906.00" buySell="BUY" assetCategory="STK" levelOfDetail="EXECUTION" />
     <Trade currency="USD" symbol="VOO" tradeDate="20260602" quantity="-5" tradePrice="500.00" tradeMoney="-2500.00" ibCommission="-1.00" netCash="2499.00" buySell="SELL" assetCategory="STK" levelOfDetail="EXECUTION" />
     <Trade currency="USD" symbol="AAPL" quantity="999" tradePrice="0" buySell="BUY" levelOfDetail="SYMBOL_SUMMARY" />
   </Trades>
   <CashTransactions>
     <CashTransaction type="Dividends" currency="USD" symbol="AAPL" amount="12.34" reportDate="20260610" description="AAPL CASH DIVIDEND" levelOfDetail="DETAIL" />
     <CashTransaction type="Withholding Tax" currency="USD" symbol="AAPL" amount="-1.85" reportDate="20260610" description="AAPL WHT" levelOfDetail="DETAIL" />
     <CashTransaction type="Broker Interest Received" currency="USD" symbol="" amount="0.50" reportDate="20260611" levelOfDetail="DETAIL" />
   </CashTransactions>
   <OpenPositions>
     <OpenPosition currency="USD" symbol="AAPL" position="10" markPrice="195.00" costBasisPrice="190.50" costBasisMoney="1905.00" assetCategory="STK" />
   </OpenPositions>
  </FlexStatement>
 </FlexStatements>
</FlexQueryResponse>`;

describe("parseFlexXml", () => {
  const { trades, proventos, positions } = parseFlexXml(SAMPLE);

  it("mapeia trades BUY/SELL e ignora linhas de Symbol Summary", () => {
    expect(trades).toHaveLength(2);

    const buy = trades[0];
    expect(buy.Símbolo).toBe("AAPL");
    expect(buy["Tipo de transação"]).toBe("Compra");
    expect(buy.Data).toBe("2026-06-01"); // yyyyMMdd → yyyy-MM-dd
    expect(buy.Quantidade).toBe("10");
    expect(buy.Preço).toBe("190,5");
    expect(buy.Moeda).toBe("USD");
    expect(buy.Corretora).toBe("IBKR");
    expect(buy["Valor líquido"]).toBe("1906,00"); // compra: bruto + comissão

    const sell = trades[1];
    expect(sell.Símbolo).toBe("VOO");
    expect(sell["Tipo de transação"]).toBe("Venda");
    expect(sell["Valor líquido"]).toBe("2499,00"); // venda: bruto − comissão
  });

  it("separa dividendo de imposto e ignora juros/linhas sem símbolo", () => {
    expect(proventos).toHaveLength(2);

    const div = proventos.find((p) => p.decisao === "Dividendo")!;
    expect(div.ticker).toBe("AAPL");
    expect(div.valor).toBe("12,34");
    expect(div.data).toBe("2026-06-10");
    expect(div.mes).toBe("jun/26");
    expect(div.ano).toBe("2026");

    const tax = proventos.find((p) => p.decisao === "IMPOSTO")!;
    expect(tax.valor).toBe("1,85"); // valor absoluto
    expect(tax.lancamento).toBe("IMPOSTO");
  });

  it("lê a foto das posições abertas", () => {
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("AAPL");
    expect(positions[0].quantidade).toBe(10);
    expect(positions[0].markPrice).toBe(195);
    expect(positions[0].custoTotal).toBe(1905);
  });
});
