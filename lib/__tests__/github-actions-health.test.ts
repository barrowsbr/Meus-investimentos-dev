import { describe, it, expect } from "vitest";
import { arquivoDoLink, contarFalhasSeguidas } from "../github-actions-health";

// Contexto: histórico e backup ficaram ~1 mês quebrados em silêncio. O card só
// mostrava o interruptor ("deveria rodar"), nunca o resultado ("rodou?").

describe("arquivoDoLink", () => {
  it("extrai o arquivo do link do workflow", () => {
    expect(arquivoDoLink("https://github.com/barrowsbr/meus-investimentos-dev/actions/workflows/historico.yml")).toBe("historico.yml");
  });

  it("ignora query e hash", () => {
    expect(arquivoDoLink("https://github.com/x/y/actions/workflows/backup.yml?query=branch:main")).toBe("backup.yml");
    expect(arquivoDoLink("https://github.com/x/y/actions/workflows/backup.yml#topo")).toBe("backup.yml");
  });

  it("devolve null para link que não é de workflow (cron da Vercel, painel, etc.)", () => {
    expect(arquivoDoLink("https://vercel.com/dash/crons")).toBeNull();
    expect(arquivoDoLink("https://github.com/x/y/actions")).toBeNull();
  });

  it("tolera ausência de link (automações do app não têm)", () => {
    expect(arquivoDoLink(undefined)).toBeNull();
  });
});

describe("contarFalhasSeguidas", () => {
  it("zero quando a última passou", () => {
    expect(contarFalhasSeguidas([{ conclusion: "success" }, { conclusion: "failure" }])).toBe(0);
  });

  it("conta a sequência de falhas a partir da mais recente", () => {
    expect(contarFalhasSeguidas([
      { conclusion: "failure" }, { conclusion: "failure" }, { conclusion: "failure" }, { conclusion: "success" },
    ])).toBe(3);
  });

  it("para na primeira execução bem-sucedida (não soma falhas antigas)", () => {
    expect(contarFalhasSeguidas([
      { conclusion: "failure" }, { conclusion: "success" }, { conclusion: "failure" },
    ])).toBe(1);
  });

  it("execução em andamento não zera nem interrompe a contagem", () => {
    expect(contarFalhasSeguidas([
      { conclusion: null }, { conclusion: "failure" }, { conclusion: "failure" },
    ])).toBe(2);
  });

  it("cancelled/skipped interrompem — não são falha nem sucesso acumulável", () => {
    expect(contarFalhasSeguidas([{ conclusion: "cancelled" }, { conclusion: "failure" }])).toBe(0);
  });

  it("lista vazia (nunca executou) devolve zero", () => {
    expect(contarFalhasSeguidas([])).toBe(0);
  });
});
