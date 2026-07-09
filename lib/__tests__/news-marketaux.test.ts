import { describe, it, expect } from "vitest";
import { parseMarketaux, fetchMarketaux } from "@/lib/news/providers/marketaux";
import { dedupeNews } from "@/lib/news/engine";

const SAMPLE = {
  data: [
    {
      title: "Ibovespa sobe com Vale e Petrobras",
      url: "https://exemplo.com/ibov",
      published_at: "2026-07-09T12:00:00.000000Z",
      source: "infomoney.com",
      image_url: "https://img/ibov.jpg",
      language: "pt",
      entities: [
        { symbol: "VALE3.SA", sentiment_score: 0.4, country: "br" },
        { symbol: "PETR4.SA", sentiment_score: 0.2, country: "br" },
      ],
    },
    {
      title: "Fed holds rates",
      url: "https://ex.com/fed",
      published_at: "2026-07-09T13:00:00Z",
      source: "cnbc.com",
      language: "en",
      entities: [],
    },
  ],
};

describe("parseMarketaux", () => {
  it("mapeia artigos → NewsItem com entidades e sentimento médio", () => {
    const items = parseMarketaux(SAMPLE);
    expect(items).toHaveLength(2);
    const ibov = items[0];
    expect(ibov.titulo).toBe("Ibovespa sobe com Vale e Petrobras");
    expect(ibov.link).toBe("https://exemplo.com/ibov");
    expect(ibov.fonte).toBe("infomoney.com");
    expect(ibov.imagem).toBe("https://img/ibov.jpg");
    expect(ibov.entidades).toEqual(["VALE3.SA", "PETR4.SA"]);
    expect(ibov.sentimento).toBeCloseTo(0.3, 5); // (0.4+0.2)/2
    expect(ibov.pais).toBe("br");
    expect(ibov.idioma).toBe("pt");
  });

  it("artigo sem entidades → sem sentimento/país, sem imagem vira null", () => {
    const fed = parseMarketaux(SAMPLE)[1];
    expect(fed.entidades).toBeUndefined();
    expect(fed.sentimento).toBeUndefined();
    expect(fed.pais).toBeUndefined();
    expect(fed.imagem).toBeNull();
  });

  it("resposta inválida/vazia → []", () => {
    expect(parseMarketaux(null)).toEqual([]);
    expect(parseMarketaux({})).toEqual([]);
    expect(parseMarketaux({ data: "x" })).toEqual([]);
  });

  it("descarta itens sem título ou url", () => {
    const items = parseMarketaux({ data: [{ title: "sem url" }, { url: "sem-titulo" }] });
    expect(items).toEqual([]);
  });
});

describe("fetchMarketaux (gate por env)", () => {
  it("sem MARKETAUX_API_KEY → no-op ([]), não faz rede", async () => {
    const prev = process.env.MARKETAUX_API_KEY;
    delete process.env.MARKETAUX_API_KEY;
    expect(await fetchMarketaux({ symbols: ["VALE3"] })).toEqual([]);
    if (prev !== undefined) process.env.MARKETAUX_API_KEY = prev;
  });
});

describe("dedupeNews", () => {
  it("remove títulos/links repetidos e respeita limit", () => {
    const base = parseMarketaux(SAMPLE);
    const dup = dedupeNews([...base, ...base]);
    expect(dup).toHaveLength(2);
    expect(dedupeNews(base, 1)).toHaveLength(1);
  });
});
