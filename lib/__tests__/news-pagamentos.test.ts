import { describe, it, expect } from "vitest";
import { classificarTema, ehPagamentos, ehRuido } from "@/lib/news/temas";
import { ehLenteInvestidorPura, escopoDe } from "@/lib/news/trabalho";
import type { NewsItem } from "@/lib/news/types";

function item(titulo: string, fonte = "Google News"): NewsItem {
  return { titulo, link: "https://x/" + titulo, data: "", fonte, imagem: null, categoria: "pagamentos", impacto: "baixo", tema: "pagamentos" };
}

// Cobre o núcleo da aba "Trabalho" (mercado de meios de pagamento + software de
// gestão): o classificador de tema e o filtro de relevância que decide o que
// entra na aba. É o ponto onde qualidade importa — assunto de trabalho do dono.

describe("classificarTema → pagamentos", () => {
  const positivos = [
    "Banco Central publica resolução sobre o Pix automático",
    "Open Finance avança e libera iniciação de pagamento",
    "Cielo e Stone disputam mercado de adquirência com nova maquininha",
    "Visa e Mastercard revisam taxas de intercâmbio no Brasil",
    "DREX entra em nova fase de testes com bancos",
    "Registradora de recebíveis muda regras de antecipação",
    "Nova plataforma de cobrança do Pix promete substituir o boleto",
  ];
  for (const t of positivos) {
    it(`classifica como pagamentos: "${t}"`, () => {
      expect(classificarTema(t)).toBe("pagamentos");
    });
  }

  it("pagamentos vence temas genéricos quando ambos batem (Pix > mercados)", () => {
    // "Pix" (pagamentos) e "Ibovespa" (mercados) no mesmo título: como
    // pagamentos está no topo do RX, ganha — a aba Trabalho é prioritária.
    expect(classificarTema("Ibovespa sobe enquanto Pix bate recorde de volume")).toBe("pagamentos");
  });
});

describe("ehPagamentos (filtro da aba Trabalho)", () => {
  it("aceita normativa, bandeira, adquirente, emissor e software de gestão", () => {
    expect(ehPagamentos("Bacen abre consulta pública sobre arranjos de pagamento")).toBe(true);
    expect(ehPagamentos("Elo lança cartão de benefício com novas regras")).toBe(true);
    expect(ehPagamentos("Adyen expande operação de adquirência")).toBe(true);
    expect(ehPagamentos("TOTVS integra ERP com emissão de NF-e")).toBe(true);
    expect(ehPagamentos("Omie e Conta Azul crescem entre PMEs")).toBe(true);
  });

  it("rejeita o que não é do nicho (evita ruído na aba)", () => {
    expect(ehPagamentos("TED talk sobre inteligência artificial viraliza")).toBe(false);
    expect(ehPagamentos("NASA lança telescópio para estudar exoplanetas")).toBe(false);
    expect(ehPagamentos("Novela estreia com recorde de audiência")).toBe(false);
  });

  it("tokens ambíguos não vazam (TED/NPC/DOC/STR isolados)", () => {
    expect(ehPagamentos("Personagem NPC ganha destaque em novo game")).toBe(false);
    expect(ehPagamentos("Documentário sobre a Amazônia estreia")).toBe(false);
  });
});

describe("ruído continua barrado na aba Trabalho", () => {
  it("listicle/oferta some mesmo citando pagamento", () => {
    // O motor combina ehPagamentos && !ehRuido — listicle não entra.
    expect(ehRuido("5 melhores maquininhas de cartão para comprar barato")).toBe(true);
  });
});

describe("segmentação investimento × trabalho (lente de investidor)", () => {
  it("barra matéria de PAPEL/cotação pura (vai pras abas de investimento)", () => {
    expect(ehLenteInvestidorPura("Ações da Cielo sobem 4% na bolsa após balanço")).toBe(true);
    expect(ehLenteInvestidorPura("PagSeguro: analistas elevam preço-alvo")).toBe(true);
    expect(ehLenteInvestidorPura("Stone shares jump 6% on earnings beat")).toBe(true);
  });

  it("mantém matéria com SUBSTÂNCIA setorial, mesmo citando a bolsa", () => {
    // Tem regra/produto/Bacen → é trabalho, fica na aba mesmo mencionando ação.
    expect(ehLenteInvestidorPura("Ações da Cielo sobem após Bacen cortar MDR do setor")).toBe(false);
    expect(ehLenteInvestidorPura("Stone lança maquininha e ação reage na bolsa")).toBe(false);
  });
});

describe("escopo: regulação × mercado", () => {
  it("normativa/Bacen/institucional → regulacao", () => {
    expect(escopoDe(item("Banco Central publica resolução do Pix automático"))).toBe("regulacao");
    expect(escopoDe(item("Open Finance ganha nova fase"))).toBe("regulacao");
    expect(escopoDe(item("Setor cresce 12% no trimestre", "ABECS"))).toBe("regulacao"); // fonte institucional
  });
  it("bandeira/adquirente/produto → mercado", () => {
    expect(escopoDe(item("Stone lança nova maquininha para PMEs"))).toBe("mercado");
    expect(escopoDe(item("Adyen expande operação de adquirência no Brasil"))).toBe("mercado");
  });
});
