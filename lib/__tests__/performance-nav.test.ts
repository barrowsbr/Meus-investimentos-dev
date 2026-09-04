import { describe, expect, it } from "vitest";
import { tabDaUrl, urlComTab, hrefDoAtivo } from "../performance-nav";

const BASE = "https://app.exemplo/performance";

describe("tabDaUrl — a aba pedida pela URL", () => {
  it("lê a aba do deep-link", () => {
    expect(tabDaUrl("?tab=rentabilidade")).toBe("rentabilidade");
    expect(tabDaUrl("?lookback=90&tab=monthly")).toBe("monthly");
  });

  it("sem tab, ou com aba inventada, devolve null (cai no default da página)", () => {
    expect(tabDaUrl("")).toBeNull();
    expect(tabDaUrl("?lookback=90")).toBeNull();
    expect(tabDaUrl("?tab=xpto")).toBeNull();
    expect(tabDaUrl("?tab=")).toBeNull();
  });
});

describe("urlComTab — escreve a aba de volta na URL", () => {
  it("grava a aba escolhida", () => {
    expect(urlComTab(BASE, "rentabilidade")).toBe(`${BASE}?tab=rentabilidade`);
  });

  it("overview é o default: SAI da URL (não vira ?tab=overview)", () => {
    expect(urlComTab(`${BASE}?tab=monthly`, "overview")).toBe(BASE);
  });

  it("preserva os outros parâmetros da tela (lookback, filtros)", () => {
    const url = new URL(urlComTab(`${BASE}?lookback=90&classe=acoes`, "drawdown"));
    expect(url.searchParams.get("lookback")).toBe("90");
    expect(url.searchParams.get("classe")).toBe("acoes");
    expect(url.searchParams.get("tab")).toBe("drawdown");
  });

  it("trocar de aba duas vezes não acumula parâmetro", () => {
    const uma = urlComTab(BASE, "monthly");
    expect(urlComTab(uma, "rentabilidade")).toBe(`${BASE}?tab=rentabilidade`);
  });

  it("ida e volta: o que escrevo é o que leio", () => {
    for (const tab of ["drawdown", "monthly", "previsoes", "rentabilidade"] as const) {
      expect(tabDaUrl(new URL(urlComTab(BASE, tab)).search)).toBe(tab);
    }
  });
});

// Os pares (setor, macro) abaixo são os REAIS de /api/composicao/resumo, lidos
// da produção em 04/09/2026 — não inventados.
describe("hrefDoAtivo — só linka ativo que TEM card em /renda-variavel", () => {
  it("renda variável vira link", () => {
    for (const [ticker, macro] of [["GOOGL", "Renda Variável"], ["KNCR11.SA", "Renda Variável"],
                                   ["BTC-USD", "Renda Variável"], ["IAU", "Renda Variável"]] as const) {
      expect(hrefDoAtivo({ ticker, macro })).toBe(`/renda-variavel?ticker=${ticker}`);
    }
  });

  it("renda fixa NÃO vira link — inclusive a que engana o isRendaVariavel", () => {
    // ⚠️ Regressão real: o setor do NTN-B é "Tesouro Direto", que NÃO está em
    // RF_SETORES — isRendaVariavel() o daria como renda VARIÁVEL e o link
    // apontaria para uma tela sem esse ativo. O `macro` do payload acerta.
    expect(hrefDoAtivo({ ticker: "NTN-B", macro: "Renda Fixa" })).toBeNull();
    expect(hrefDoAtivo({ ticker: "CDB X", macro: "Renda Fixa" })).toBeNull();
    expect(hrefDoAtivo({ ticker: "SALDO", macro: "Renda Fixa" })).toBeNull();
  });

  it("contraprova: o predicado por SETOR erraria o NTN-B", async () => {
    const { isRendaVariavel } = await import("../sectors");
    // Documenta por que hrefDoAtivo NÃO usa isRendaVariavel(setor).
    expect(isRendaVariavel("Tesouro Direto")).toBe(true);   // erraria
    expect(hrefDoAtivo({ ticker: "NTN-B", macro: "Renda Fixa" })).toBeNull(); // acerta
  });

  it("ticker com caractere especial é escapado", () => {
    expect(hrefDoAtivo({ ticker: "BRK.B", macro: "Renda Variável" })).toBe("/renda-variavel?ticker=BRK.B");
    expect(hrefDoAtivo({ ticker: "A&B", macro: "Renda Variável" })).toBe("/renda-variavel?ticker=A%26B");
  });

  it("ticker vazio não vira link", () => {
    expect(hrefDoAtivo({ ticker: "", macro: "Renda Variável" })).toBeNull();
  });
});
