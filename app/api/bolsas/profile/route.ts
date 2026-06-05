import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const INDEX_DESCRIPTIONS: Record<string, string> = {
  "^GSPC": "O S&P 500 acompanha as 500 maiores empresas dos EUA, ponderadas por capitalização de mercado. É o principal termômetro do mercado acionário americano.",
  "^DJI": "O Dow Jones Industrial Average reúne 30 grandes empresas americanas blue-chip, sendo um dos índices mais antigos e acompanhados do mundo.",
  "^IXIC": "O Nasdaq Composite é composto por mais de 3.000 empresas listadas na bolsa Nasdaq, com forte concentração em tecnologia e inovação.",
  "^RUT": "O Russell 2000 rastreia 2.000 empresas de pequena capitalização dos EUA, sendo referência para o segmento de small caps americanas.",
  "^BVSP": "O Ibovespa é o principal índice da B3 (bolsa brasileira), composto pelas ações mais negociadas, ponderadas por liquidez e volume.",
  "^STOXX50E": "O Euro Stoxx 50 reúne as 50 maiores blue-chips da zona do euro, cobrindo empresas líderes de 8 países europeus.",
  "^FTSE": "O FTSE 100 agrupa as 100 maiores empresas listadas na Bolsa de Londres por capitalização de mercado.",
  "^GDAXI": "O DAX acompanha as 40 maiores empresas da Bolsa de Frankfurt, refletindo a economia alemã — a maior da Europa.",
  "^FCHI": "O CAC 40 reúne as 40 maiores empresas da Euronext Paris, representando os principais setores da economia francesa.",
  "^N225": "O Nikkei 225 é o principal índice do Japão, composto por 225 empresas selecionadas da Bolsa de Tóquio.",
  "^HSI": "O Hang Seng Index rastreia as maiores empresas da Bolsa de Hong Kong, servindo como indicador-chave dos mercados asiáticos.",
  "^KS11": "O KOSPI é o índice da Bolsa da Coreia do Sul, acompanhando todas as ações ordinárias listadas na Korea Exchange.",
  "^TWII": "O TAIEX é o índice ponderado da Bolsa de Taiwan, com destaque para o setor de semicondutores.",
  "^BSESN": "O BSE Sensex rastreia as 30 maiores empresas da Bolsa de Bombaim, sendo o índice mais antigo da Índia.",
  "^AXJO": "O ASX 200 acompanha as 200 maiores empresas da Australian Securities Exchange.",
  "^GSPTSE": "O S&P/TSX Composite é o principal índice da Bolsa de Toronto, representando o mercado acionário canadense.",
  "^MXX": "O IPC (Índice de Precios y Cotizaciones) é o principal índice da Bolsa Mexicana de Valores.",
  "^MERV": "O MERVAL é o índice da Bolsa de Buenos Aires, representando as ações mais negociadas da Argentina.",
  "^IPSA": "O IPSA é o principal índice da Bolsa de Santiago, composto por 30 ações chilenas com maior liquidez.",
  "^AEX": "O AEX reúne as 25 maiores empresas da Euronext Amsterdam, representando a economia holandesa.",
  "^IBEX": "O IBEX 35 é o índice de referência da Bolsa de Madrid, composto pelas 35 empresas mais líquidas da Espanha.",
  "^SSMI": "O SMI (Swiss Market Index) acompanha as 20 maiores empresas da Bolsa da Suíça.",
  "^OMX": "O OMX Stockholm 30 reúne as 30 ações mais negociadas da Bolsa de Estocolmo.",
  "^BFX": "O BEL 20 é o índice de referência da Euronext Brussels, com as 20 maiores empresas da Bélgica.",
  "^SSEC": "O Shanghai Composite rastreia todas as ações listadas na Bolsa de Xangai, refletindo a economia chinesa continental.",
  "^STI": "O Straits Times Index acompanha as 30 maiores empresas da Bolsa de Singapura.",
  "^KLSE": "O FTSE Bursa Malaysia KLCI é o índice de referência da Bolsa da Malásia, com as 30 maiores empresas.",
  "^JKSE": "O Jakarta Composite rastreia todas as ações da Bolsa da Indonésia.",
  "^SET.BK": "O SET Index é o índice da Bolsa da Tailândia, representando todas as ações ordinárias listadas.",
  "^PSI20": "O PSI 20 é o principal índice da Euronext Lisbon, com as 20 maiores empresas de Portugal.",
  "^NSEI": "O Nifty 50 rastreia as 50 maiores empresas da National Stock Exchange da Índia.",
  "^VIX": "O VIX mede a volatilidade implícita esperada do S&P 500 nos próximos 30 dias. É conhecido como o \"índice do medo\" — valores altos indicam incerteza e valores baixos, complacência.",
  "^TA125.TA": "O TA-125 é o principal índice da Bolsa de Tel Aviv, com as 125 maiores empresas de Israel.",
  "^CASE30": "O EGX 30 é o índice de referência da Bolsa do Egito, com as 30 empresas mais ativas.",
  "^JN0U.JO": "O FTSE/JSE Top 40 acompanha as 40 maiores empresas da Bolsa de Joanesburgo, África do Sul.",
  "^NGS30": "O NGX 30 rastreia as 30 maiores empresas da Nigerian Exchange.",
};

async function fetchYahooProfile(ticker: string): Promise<string | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=assetProfile,summaryProfile`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json, */*",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      const desc =
        result?.assetProfile?.longBusinessSummary ??
        result?.summaryProfile?.longBusinessSummary;
      if (desc && typeof desc === "string") {
        const trimmed = desc.length > 500 ? desc.slice(0, 497) + "..." : desc;
        return trimmed;
      }
    } catch {
      // try next host
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const local = INDEX_DESCRIPTIONS[symbol];
  if (local) {
    return NextResponse.json(
      { symbol, description: local, source: "local" },
      { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } },
    );
  }

  try {
    const desc = await fetchYahooProfile(symbol);
    if (desc) {
      return NextResponse.json(
        { symbol, description: desc, source: "yahoo" },
        { headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=3600" } },
      );
    }
    return NextResponse.json({ symbol, description: null, source: "none" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
