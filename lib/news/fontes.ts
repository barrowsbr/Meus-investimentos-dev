// Feeds RSS DIRETOS por tema — a fonte primária do motor de notícias.
// Regra de produto: feed direto de veículo > Google News, porque traz IMAGEM
// real embutida (media:content/enclosure) e link canônico. Google News entra
// só como complemento de cauda (sem foto nativa).
//
// Todos RSS 2.0 (<item>) — o parser não lê Atom (<entry>); não adicionar
// feeds Atom aqui. Falha de feed individual é tolerada (allSettled no provider).

import type { Tema } from "./temas";

export interface FonteFeed {
  url: string;
  fonte: string;      // nome exibido
  tema: Tema;         // tema default dos itens (classificador pode refinar)
  lang: "pt" | "en";
  max?: number;       // itens por feed (default 6)
}

export const FEEDS_DIRETOS: FonteFeed[] = [
  // ── Macro / economia ──
  { url: "https://www.infomoney.com.br/economia/feed/", fonte: "InfoMoney", tema: "macro", lang: "pt" },
  { url: "https://g1.globo.com/rss/g1/economia/", fonte: "G1 Economia", tema: "macro", lang: "pt" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", fonte: "CNBC Economy", tema: "macro", lang: "en" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", fonte: "MarketWatch", tema: "mercados", lang: "en" },

  // ── Mercados ──
  { url: "https://www.infomoney.com.br/mercados/feed/", fonte: "InfoMoney", tema: "mercados", lang: "pt" },
  { url: "https://www.moneytimes.com.br/feed/", fonte: "Money Times", tema: "mercados", lang: "pt" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", fonte: "CNBC", tema: "mercados", lang: "en" },

  // ── Geopolítica / mundo ──
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", fonte: "BBC World", tema: "geopolitica", lang: "en" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", fonte: "Al Jazeera", tema: "geopolitica", lang: "en" },
  { url: "https://rss.dw.com/xml/rss-br-news", fonte: "DW Brasil", tema: "geopolitica", lang: "pt" },
  { url: "https://www.rfi.fr/pt/rss", fonte: "RFI", tema: "geopolitica", lang: "pt" },

  // ── Tecnologia ──
  { url: "https://techcrunch.com/feed/", fonte: "TechCrunch", tema: "tech", lang: "en" },
  { url: "https://feeds.arstechnica.com/arstechnica/index", fonte: "Ars Technica", tema: "tech", lang: "en" },
  { url: "https://canaltech.com.br/rss/", fonte: "Canaltech", tema: "tech", lang: "pt" },
  { url: "https://olhardigital.com.br/feed/", fonte: "Olhar Digital", tema: "tech", lang: "pt" },

  // ── Ciência ──
  { url: "https://www.sciencedaily.com/rss/all.xml", fonte: "ScienceDaily", tema: "ciencia", lang: "en" },
  { url: "https://phys.org/rss-feed/", fonte: "Phys.org", tema: "ciencia", lang: "en" },
  { url: "https://agencia.fapesp.br/rss/", fonte: "Agência FAPESP", tema: "ciencia", lang: "pt" },

  // ── Commodities & Energia ──
  { url: "https://oilprice.com/rss/main", fonte: "OilPrice", tema: "commodities", lang: "en" },
  { url: "https://www.mining.com/feed/", fonte: "Mining.com", tema: "commodities", lang: "en" },

  // ── Saúde & Biotech ──
  { url: "https://www.statnews.com/feed/", fonte: "STAT News", tema: "saude_bio", lang: "en" },

  // ── Negócios & Startups ──
  { url: "https://exame.com/feed/", fonte: "Exame", tema: "negocios", lang: "pt" },

  // ── Cripto ──
  { url: "https://cointelegraph.com.br/rss", fonte: "Cointelegraph", tema: "cripto", lang: "pt" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", fonte: "CoinDesk", tema: "cripto", lang: "en" },

  // ── Empresas (BR) ──
  { url: "https://braziljournal.com/feed/", fonte: "Brazil Journal", tema: "empresas", lang: "pt" },
  { url: "https://neofeed.com.br/feed/", fonte: "NeoFeed", tema: "empresas", lang: "pt" },

  // ── Pagamentos & fintech (TRABALHO do dono) ──
  // Veículos especializados em meios de pagamento, fintechs, adquirência,
  // regulação Bacen e o ecossistema de software de gestão. Fonte primária da
  // aba Trabalho — o classificador ainda refina por keyword.
  { url: "https://www.mobiletime.com.br/feed/", fonte: "Mobile Time", tema: "pagamentos", lang: "pt", max: 12 },
  { url: "https://finsidersbrasil.com.br/feed/", fonte: "Finsiders Brasil", tema: "pagamentos", lang: "pt", max: 12 },
  { url: "https://panoramaabecs.com.br/feed/", fonte: "Panorama ABECS", tema: "pagamentos", lang: "pt", max: 12 },
  { url: "https://www.pymnts.com/feed/", fonte: "PYMNTS", tema: "pagamentos", lang: "en", max: 12 },
  { url: "https://www.finextra.com/rss/headlines.aspx", fonte: "Finextra", tema: "pagamentos", lang: "en", max: 12 },
  { url: "https://thepaypers.com/rss", fonte: "The Paypers", tema: "pagamentos", lang: "en", max: 10 },
];

export function feedsPorTemas(temas: Tema[]): FonteFeed[] {
  const set = new Set(temas);
  return FEEDS_DIRETOS.filter((f) => set.has(f.tema));
}
