// ─────────────────────────────────────────────────────────────────────────────
// asset-brands.ts — nome amigável + domínio (p/ logo) por ticker.
//
// As LOGOS podem ser salvas no repositório em public/logos/<TICKER_SEM_SUFIXO>.png
// (prioritárias); sem arquivo, o resolver /api/logo usa o `domain` daqui como
// uma das fontes (logo.dev/favicon). O `name` alimenta os cards
// e o modal. Tickers não mapeados caem em: nome = ticker, logo = avatar de
// iniciais (AssetLogo). Para adicionar cobertura, basta acrescentar aqui e
// commitar o PNG correspondente.
//
// Chave = ticker normalizado (sem sufixo de bolsa, MAIÚSCULO). Ex: PETR4, TSM.
// ─────────────────────────────────────────────────────────────────────────────

export interface Brand {
  name: string;
  domain: string; // usado para buscar a logo por domínio (logo.dev/favicon) — não exibido
}

export const BRANDS: Record<string, Brand> = {
  // ── Brasil — B3 ──
  PETR4: { name: "Petrobras", domain: "petrobras.com.br" },
  PETR3: { name: "Petrobras", domain: "petrobras.com.br" },
  VALE3: { name: "Vale", domain: "vale.com" },
  ITUB4: { name: "Itaú Unibanco", domain: "itau.com.br" },
  ITSA4: { name: "Itaúsa", domain: "itausa.com.br" },
  BBDC4: { name: "Bradesco", domain: "bradesco.com.br" },
  BBAS3: { name: "Banco do Brasil", domain: "bb.com.br" },
  ABEV3: { name: "Ambev", domain: "ambev.com.br" },
  B3SA3: { name: "B3", domain: "b3.com.br" },
  WEGE3: { name: "WEG", domain: "weg.net" },
  MGLU3: { name: "Magazine Luiza", domain: "magazineluiza.com.br" },
  RENT3: { name: "Localiza", domain: "localiza.com" },
  RADL3: { name: "Raia Drogasil", domain: "rd.com.br" },
  PRIO3: { name: "PRIO", domain: "prio3.com.br" },
  SUZB3: { name: "Suzano", domain: "suzano.com.br" },
  ELET3: { name: "Eletrobras", domain: "eletrobras.com" },
  EQTL3: { name: "Equatorial", domain: "equatorialenergia.com.br" },
  BPAC11: { name: "BTG Pactual", domain: "btgpactual.com" },

  // ── ETFs negociados na B3 ──
  IVVB11: { name: "iShares S&P 500 (BRL)", domain: "ishares.com" },
  BOVA11: { name: "iShares Ibovespa", domain: "ishares.com" },
  SMAL11: { name: "iShares Small Cap", domain: "ishares.com" },
  HASH11: { name: "Hashdex Cripto", domain: "hashdex.com" },

  // ── EUA / ETFs internacionais ──
  AAPL: { name: "Apple", domain: "apple.com" },
  MSFT: { name: "Microsoft", domain: "microsoft.com" },
  GOOGL: { name: "Alphabet (Google)", domain: "abc.xyz" },
  GOOG: { name: "Alphabet (Google)", domain: "abc.xyz" },
  AMZN: { name: "Amazon", domain: "amazon.com" },
  NVDA: { name: "NVIDIA", domain: "nvidia.com" },
  META: { name: "Meta", domain: "meta.com" },
  TSLA: { name: "Tesla", domain: "tesla.com" },
  VOO: { name: "Vanguard S&P 500", domain: "vanguard.com" },
  VT: { name: "Vanguard Total World", domain: "vanguard.com" },
  VWRA: { name: "Vanguard FTSE All-World", domain: "vanguard.com" },
  SCHD: { name: "Schwab US Dividend", domain: "schwab.com" },
  QQQ: { name: "Invesco QQQ", domain: "invesco.com" },
  SPY: { name: "SPDR S&P 500", domain: "ssga.com" },

  // ── ADRs / exterior conhecidos ──
  TSM: { name: "TSMC", domain: "tsmc.com" },
  BABA: { name: "Alibaba", domain: "alibaba.com" },
};

export function brandFor(ticker: string): Brand | null {
  const key = (ticker ?? "").toUpperCase().replace(/\.[A-Z0-9]+$/, "").trim();
  return BRANDS[key] ?? null;
}

// Nome de exibição: marca conhecida → nome; senão o próprio ticker (sem sufixo).
export function displayName(ticker: string): string {
  const b = brandFor(ticker);
  if (b) return b.name;
  return (ticker ?? "").toUpperCase().replace(/\.[A-Z0-9]+$/, "").trim() || ticker;
}
