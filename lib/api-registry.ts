// ── Registro canônico das APIs externas (FONTE ÚNICA) ───────────────────────
// SERVER-ONLY: usa process.env (segredos) e faz chamadas de rede. NUNCA importe
// este módulo num componente client — o card de Configurações fala com ele
// apenas via /api/diag/apis.
//
// Toda API/serviço externo novo do projeto deve ser adicionado AQUI. Com isso:
//   1. aparece automaticamente no health-check (Configurações → APIs & Integrações);
//   2. deve ser documentado no CLAUDE.md (seção "APIs & Integrações externas").
//
// Cada probe é um teste LEVE (1 request barato, símbolo/endpoint fixo) só para
// dizer se a API responde. Não substitui o fluxo real do app.

export type ApiCategory =
  | "Mercado & Cotações"
  | "Câmbio & Juros"
  | "Corretora"
  | "Dados & Planilha"
  | "IA & LLM"
  | "Notícias"
  | "Predições"
  | "Observatório & Geo"
  | "Alertas & Logos";

export interface ApiEnvVar {
  name: string;
  required: boolean;
}

export interface ApiProbeResult {
  ok: boolean;
  detail: string;
}

export interface ApiDef {
  key: string;
  name: string;
  category: ApiCategory;
  host: string;
  purpose: string;
  envVars: ApiEnvVar[];
  docs?: string;
  probe: () => Promise<ApiProbeResult>;
}

const UA = "Mozilla/5.0 (compatible; MeusInvestimentos-HealthCheck/1.0)";
const TIMEOUT_MS = 8000;

async function httpGet(
  url: string,
  opts: { headers?: Record<string, string>; method?: string; body?: string } = {},
): Promise<Response> {
  return fetch(url, {
    method: opts.method ?? "GET",
    headers: { "User-Agent": UA, ...(opts.headers ?? {}) },
    body: opts.body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

async function getJson(url: string, opts?: Parameters<typeof httpGet>[1]): Promise<{ status: number; ok: boolean; json: any }> {
  const res = await httpGet(url, opts);
  let json: any = null;
  try { json = await res.json(); } catch { /* corpo não-JSON */ }
  return { status: res.status, ok: res.ok, json };
}

const env = (name: string) => process.env[name];

// MM-DD-YYYY (formato exigido pela OLINDA/BCB PTAX).
function bcbDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;
}

// ── Registro ─────────────────────────────────────────────────────────────────

export const API_REGISTRY: ApiDef[] = [
  // ── Mercado & Cotações ─────────────────────────────────────────────────────
  {
    key: "yahoo", name: "Yahoo Finance", category: "Mercado & Cotações",
    host: "query1.finance.yahoo.com", purpose: "Cotações, histórico de preços, índices, moedas e metadados de ativos",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d");
      const p = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
      return p != null ? { ok: true, detail: `AAPL US$ ${p}` } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "brapi", name: "brapi.dev", category: "Mercado & Cotações",
    host: "brapi.dev", purpose: "Cotações de ações/FIIs da B3 (fonte alternativa ao Yahoo)",
    envVars: [{ name: "BRAPI_TOKEN", required: false }],
    probe: async () => {
      const t = env("BRAPI_TOKEN");
      const { status, json } = await getJson(`https://brapi.dev/api/quote/PETR4${t ? `?token=${t}` : ""}`);
      const p = json?.results?.[0]?.regularMarketPrice;
      return p != null ? { ok: true, detail: `PETR4 R$ ${p}${t ? " · com token" : " · sem token"}` } : { ok: false, detail: json?.message || `HTTP ${status}` };
    },
  },
  {
    key: "coingecko", name: "CoinGecko", category: "Mercado & Cotações",
    host: "api.coingecko.com", purpose: "Dados de criptomoedas (aba Bolsas)",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://api.coingecko.com/api/v3/ping");
      return json?.gecko_says ? { ok: true, detail: String(json.gecko_says) } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "mempool", name: "mempool.space", category: "Mercado & Cotações",
    host: "mempool.space", purpose: "Rede/blocos Bitcoin (visualização on-chain)",
    envVars: [],
    probe: async () => {
      const res = await httpGet("https://mempool.space/api/blocks/tip/height");
      const n = Number((await res.text()).trim());
      return Number.isFinite(n) ? { ok: true, detail: `bloco #${n}` } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },
  {
    key: "fmp", name: "Financial Modeling Prep", category: "Mercado & Cotações",
    host: "financialmodelingprep.com", purpose: "País do ativo, holdings de ETF e logos (fallback)",
    envVars: [{ name: "FMP_API_KEY", required: false }],
    probe: async () => {
      const k = env("FMP_API_KEY");
      if (!k) return { ok: false, detail: "sem FMP_API_KEY (opcional)" };
      const { status, json } = await getJson(`https://financialmodelingprep.com/api/v3/quote-short/AAPL?apikey=${k}`);
      const p = Array.isArray(json) ? json[0]?.price : undefined;
      return p != null ? { ok: true, detail: `AAPL US$ ${p}` } : { ok: false, detail: json?.["Error Message"] || `HTTP ${status}` };
    },
  },
  {
    key: "alphavantage", name: "Alpha Vantage", category: "Mercado & Cotações",
    host: "www.alphavantage.co", purpose: "Composição de ETFs (fallback secundário)",
    envVars: [{ name: "ALPHAVANTAGE_API_KEY", required: false }],
    probe: async () => {
      const k = env("ALPHAVANTAGE_API_KEY");
      if (!k) return { ok: false, detail: "sem ALPHAVANTAGE_API_KEY (opcional)" };
      const { status, json } = await getJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=${k}`);
      const p = json?.["Global Quote"]?.["05. price"];
      if (p) return { ok: true, detail: `IBM US$ ${p}` };
      if (json?.Note || json?.Information) return { ok: false, detail: "rate-limit / chave demo" };
      return { ok: false, detail: `HTTP ${status}` };
    },
  },

  // ── Câmbio & Juros ─────────────────────────────────────────────────────────
  {
    key: "bcb_ptax", name: "BCB PTAX (Olinda)", category: "Câmbio & Juros",
    host: "olinda.bcb.gov.br", purpose: "PTAX de venda (USD/EUR/CAD/GBP) — base do cálculo fiscal",
    envVars: [],
    probe: async () => {
      const end = new Date();
      const start = new Date(end.getTime() - 12 * 86400000);
      const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)?@di='${bcbDate(start)}'&@df='${bcbDate(end)}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
      const { status, json } = await getJson(url);
      const v = json?.value?.[0]?.cotacaoVenda;
      return v ? { ok: true, detail: `USD/BRL ${v}` } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "bcb_sgs", name: "BCB SGS", category: "Câmbio & Juros",
    host: "api.bcb.gov.br", purpose: "Séries econômicas (Selic, CDI) — margem e benchmarks",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json");
      const v = Array.isArray(json) ? json[0]?.valor : undefined;
      return v ? { ok: true, detail: `Selic meta ${v}%` } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "awesomeapi", name: "AwesomeAPI", category: "Câmbio & Juros",
    host: "economia.awesomeapi.com.br", purpose: "Câmbio USD/BRL (fonte primária do dólar)",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://economia.awesomeapi.com.br/last/USD-BRL");
      const bid = json?.USDBRL?.bid;
      return bid ? { ok: true, detail: `USD/BRL ${bid}` } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "openerapi", name: "Open Exchange Rates", category: "Câmbio & Juros",
    host: "open.er-api.com", purpose: "Câmbio (fallback de USD/BRL e cross-rates)",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://open.er-api.com/v6/latest/USD");
      const brl = json?.rates?.BRL;
      return brl ? { ok: true, detail: `USD/BRL ${brl}` } : { ok: false, detail: json?.["error-type"] || `HTTP ${status}` };
    },
  },
  {
    key: "nyfed", name: "NY Fed Markets", category: "Câmbio & Juros",
    host: "markets.newyorkfed.org", purpose: "Taxas de referência (EFFR/SOFR) — margem em dólar",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json");
      const v = json?.refRates?.[0]?.percentRate;
      return v != null ? { ok: true, detail: `EFFR ${v}%` } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "ecb", name: "ECB Data (BCE)", category: "Câmbio & Juros",
    host: "data-api.ecb.europa.eu", purpose: "Taxa €STR — margem em euro",
    envVars: [],
    probe: async () => {
      const res = await httpGet("https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?lastNObservations=1&format=csvdata");
      const txt = await res.text();
      return res.ok && txt.length > 0 ? { ok: true, detail: "€STR ok" } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },

  // ── Corretora ──────────────────────────────────────────────────────────────
  {
    key: "ibkr_flex", name: "IBKR Flex Web Service", category: "Corretora",
    host: "ndcdyn.interactivebrokers.com", purpose: "Extrato Flex (posições, trades, caixa) da Interactive Brokers",
    envVars: [{ name: "IBKR_FLEX_TOKEN", required: true }, { name: "IBKR_FLEX_QUERY_ID", required: true }],
    probe: async () => {
      const t = env("IBKR_FLEX_TOKEN"); const q = env("IBKR_FLEX_QUERY_ID");
      if (!t || !q) return { ok: false, detail: "IBKR_FLEX_TOKEN/QUERY_ID não configurados" };
      // Só o SendRequest (etapa leve, ~1s): valida o token e devolve um
      // ReferenceCode. NÃO faz o poll/download do extrato (isso é caro, ~38s).
      const res = await httpGet(`https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=${t}&q=${encodeURIComponent(q)}&v=3`);
      const xml = await res.text();
      const code = /<ReferenceCode>(\d+)<\/ReferenceCode>/.exec(xml)?.[1];
      if (code) return { ok: true, detail: `token válido (ref ${code})` };
      const err = /<ErrorMessage>([^<]+)<\/ErrorMessage>/.exec(xml)?.[1];
      return { ok: false, detail: err || `HTTP ${res.status}` };
    },
  },

  // ── Dados & Planilha ───────────────────────────────────────────────────────
  {
    key: "gsheets_read", name: "Google Sheets (leitura)", category: "Dados & Planilha",
    host: "sheets.googleapis.com", purpose: "Fonte principal de dados (carteira, cotações, config) via API key",
    envVars: [{ name: "GOOGLE_API_KEY", required: true }, { name: "SPREADSHEET_ID", required: true }],
    probe: async () => {
      const k = env("GOOGLE_API_KEY"); const id = env("SPREADSHEET_ID");
      if (!k || !id) return { ok: false, detail: "GOOGLE_API_KEY/SPREADSHEET_ID não configurados" };
      const { status, json } = await getJson(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=properties.title&key=${k}`);
      const title = json?.properties?.title;
      return title ? { ok: true, detail: `planilha "${title}"` } : { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },
  {
    key: "gsheets_write", name: "Google Sheets (escrita)", category: "Dados & Planilha",
    host: "service account", purpose: "Escrita/backup na planilha (sync, cron, notas) via service account",
    envVars: [{ name: "GOOGLE_SERVICE_ACCOUNT_JSON", required: true }],
    probe: async () => {
      const raw = env("GOOGLE_SERVICE_ACCOUNT_JSON");
      if (!raw) return { ok: false, detail: "GOOGLE_SERVICE_ACCOUNT_JSON não configurado" };
      try {
        const j = JSON.parse(raw);
        if (j.client_email && j.private_key) return { ok: true, detail: `SA: ${j.client_email}` };
        return { ok: false, detail: "JSON sem client_email/private_key" };
      } catch { return { ok: false, detail: "JSON inválido" }; }
    },
  },

  // ── IA & LLM ───────────────────────────────────────────────────────────────
  {
    key: "gemini", name: "Google Gemini", category: "IA & LLM",
    host: "generativelanguage.googleapis.com", purpose: "Provider primário da IA (chat, IR, comentário do dia)",
    envVars: [{ name: "GEMINI_API_KEY", required: false }, { name: "GOOGLE_API_KEY", required: false }],
    probe: async () => {
      const k = env("GEMINI_API_KEY") || env("GOOGLE_API_KEY");
      if (!k) return { ok: false, detail: "sem GEMINI_API_KEY / GOOGLE_API_KEY" };
      const { status, json } = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
      const n = Array.isArray(json?.models) ? json.models.length : 0;
      return n > 0 ? { ok: true, detail: `${n} modelos` } : { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },
  {
    key: "openai", name: "OpenAI", category: "IA & LLM",
    host: "api.openai.com", purpose: "Fallback da cascata de IA (gpt-4o)",
    envVars: [{ name: "OPENAI_API_KEY", required: false }],
    probe: async () => {
      const k = env("OPENAI_API_KEY");
      if (!k) return { ok: false, detail: "sem OPENAI_API_KEY (opcional)" };
      const { status, json } = await getJson("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${k}` } });
      const n = Array.isArray(json?.data) ? json.data.length : 0;
      return n > 0 ? { ok: true, detail: `${n} modelos` } : { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },
  {
    key: "deepseek", name: "DeepSeek", category: "IA & LLM",
    host: "api.deepseek.com", purpose: "Fallback da cascata de IA (deepseek-chat)",
    envVars: [{ name: "DEEPSEEK_API_KEY", required: false }],
    probe: async () => {
      const k = env("DEEPSEEK_API_KEY");
      if (!k) return { ok: false, detail: "sem DEEPSEEK_API_KEY (opcional)" };
      const { status, json } = await getJson("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${k}` } });
      const n = Array.isArray(json?.data) ? json.data.length : 0;
      return n > 0 ? { ok: true, detail: `${n} modelos` } : { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },
  {
    key: "groq", name: "Groq", category: "IA & LLM",
    host: "api.groq.com", purpose: "Fallback da cascata de IA (Llama 3.3 70B)",
    envVars: [{ name: "GROQ_API_KEY", required: false }],
    probe: async () => {
      const k = env("GROQ_API_KEY");
      if (!k) return { ok: false, detail: "sem GROQ_API_KEY (opcional)" };
      const { status, json } = await getJson("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${k}` } });
      const n = Array.isArray(json?.data) ? json.data.length : 0;
      return n > 0 ? { ok: true, detail: `${n} modelos` } : { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },
  {
    key: "xai", name: "xAI (Grok)", category: "IA & LLM",
    host: "api.x.ai", purpose: "Comentário narrativo do dia (\"Hoje\"), se houver chave",
    envVars: [{ name: "XAI_API_KEY", required: false }, { name: "GROK_API_KEY", required: false }],
    probe: async () => {
      const k = env("XAI_API_KEY") || env("GROK_API_KEY");
      if (!k) return { ok: false, detail: "sem XAI_API_KEY / GROK_API_KEY (opcional)" };
      const { status, json } = await getJson("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${k}` } });
      const n = Array.isArray(json?.data) ? json.data.length : 0;
      return n > 0 ? { ok: true, detail: `${n} modelos` } : { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },

  // ── Notícias ───────────────────────────────────────────────────────────────
  {
    key: "google_news", name: "Google News RSS", category: "Notícias",
    host: "news.google.com", purpose: "Agregação de manchetes por ativo/tema (notícias, radar)",
    envVars: [],
    probe: async () => {
      const res = await httpGet("https://news.google.com/rss/search?q=bolsa&hl=pt-BR&gl=BR&ceid=BR:pt-419");
      const txt = await res.text();
      const items = (txt.match(/<item>/g) || []).length;
      return res.ok && items > 0 ? { ok: true, detail: `${items} manchetes` } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },
  {
    key: "marketaux", name: "Marketaux", category: "Notícias",
    host: "api.marketaux.com", purpose: "Notícias financeiras estruturadas por ticker (com sentimento)",
    envVars: [{ name: "MARKETAUX_API_KEY", required: false }],
    probe: async () => {
      const k = env("MARKETAUX_API_KEY");
      if (!k) return { ok: false, detail: "sem MARKETAUX_API_KEY (opcional)" };
      const { status, json } = await getJson(`https://api.marketaux.com/v1/news/all?symbols=AAPL&limit=1&language=en&api_token=${k}`);
      if (Array.isArray(json?.data)) return { ok: true, detail: `${json?.meta?.found ?? json.data.length} resultados` };
      return { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },
  {
    key: "finnhub", name: "Finnhub", category: "Notícias",
    host: "finnhub.io", purpose: "Market news com imagem nativa (motor de notícias — feed Para você)",
    envVars: [{ name: "FINNHUB_API_KEY", required: false }],
    probe: async () => {
      const k = env("FINNHUB_API_KEY");
      if (!k) return { ok: false, detail: "sem FINNHUB_API_KEY (opcional)" };
      const { status, json } = await getJson(`https://finnhub.io/api/v1/news?category=general&token=${k}`);
      if (Array.isArray(json)) return { ok: true, detail: `${json.length} manchetes` };
      return { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "gnews", name: "GNews", category: "Notícias",
    host: "gnews.io", purpose: "Top-headlines por categoria (world/tech/science) com imagem (feed Para você)",
    envVars: [{ name: "GNEWS_API_KEY", required: false }],
    probe: async () => {
      const k = env("GNEWS_API_KEY");
      if (!k) return { ok: false, detail: "sem GNEWS_API_KEY (opcional)" };
      const { status, json } = await getJson(`https://gnews.io/api/v4/top-headlines?category=business&lang=pt&max=1&apikey=${k}`);
      if (Array.isArray(json?.articles)) return { ok: true, detail: `${json.articles.length} manchete(s)` };
      return { ok: false, detail: json?.errors?.[0] || `HTTP ${status}` };
    },
  },
  {
    key: "reddit", name: "Reddit", category: "Notícias",
    host: "reddit.com", purpose: "Sentimento/discussão de subreddits de investimento",
    envVars: [{ name: "REDDIT_CLIENT_ID", required: false }, { name: "REDDIT_CLIENT_SECRET", required: false }],
    probe: async () => {
      const id = env("REDDIT_CLIENT_ID"); const secret = env("REDDIT_CLIENT_SECRET");
      if (id && secret) {
        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const { status, json } = await getJson("https://www.reddit.com/api/v1/access_token", {
          method: "POST",
          headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials",
        });
        return json?.access_token ? { ok: true, detail: "OAuth ok" } : { ok: false, detail: json?.error || `HTTP ${status}` };
      }
      const { status, json } = await getJson("https://www.reddit.com/r/investimentos/hot.json?limit=1");
      const n = json?.data?.children?.length;
      return n != null ? { ok: true, detail: "JSON público ok (sem OAuth)" } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "youtube_tv", name: "YouTube (TV ao vivo)", category: "Notícias",
    host: "youtube.com / googleapis.com", purpose: "Transmissões 24/7 de canais de notícia (aba TV ao vivo). Com YOUTUBE_API_KEY resolve o vídeo ao vivo exato; sem ela, embed keyless",
    envVars: [{ name: "YOUTUBE_API_KEY", required: false }],
    probe: async () => {
      const key = env("YOUTUBE_API_KEY");
      if (key) {
        // Data API v3: resolve o live atual do DW News (valida a chave + cota).
        const { status, json } = await getJson(`https://www.googleapis.com/youtube/v3/search?part=id&channelId=UCknLrEdhRCp1aegoMqRaCZg&eventType=live&type=video&maxResults=1&key=${key}`);
        if (Array.isArray(json?.items)) return { ok: true, detail: `Data API v3 ok · ${json.items.length ? "ao vivo" : "sem live agora"}` };
        return { ok: false, detail: json?.error?.message || `HTTP ${status}` };
      }
      // Sem chave: valida que o embed keyless responde.
      const res = await httpGet("https://www.youtube.com/embed/live_stream?channel=UCknLrEdhRCp1aegoMqRaCZg");
      return res.ok ? { ok: true, detail: "embed keyless acessível (sem YOUTUBE_API_KEY)" } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },

  // ── Predições ──────────────────────────────────────────────────────────────
  {
    key: "polymarket", name: "Polymarket", category: "Predições",
    host: "gamma-api.polymarket.com", purpose: "Probabilidades de mercados preditivos",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://gamma-api.polymarket.com/markets?limit=1");
      return Array.isArray(json) && json.length > 0 ? { ok: true, detail: "mercados ok" } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "kalshi", name: "Kalshi", category: "Predições",
    host: "api.elections.kalshi.com", purpose: "Probabilidades de eventos (eleições/macro)",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://api.elections.kalshi.com/trade-api/v2/exchange/status");
      return json && typeof json.exchange_active === "boolean" ? { ok: true, detail: `exchange ${json.exchange_active ? "ativa" : "fechada"}` } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "metaculus", name: "Metaculus", category: "Predições",
    host: "www.metaculus.com", purpose: "Previsões comunitárias de eventos",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://www.metaculus.com/api2/questions/?limit=1");
      const n = json?.results?.length;
      return n != null ? { ok: true, detail: "questões ok" } : { ok: false, detail: `HTTP ${status}` };
    },
  },

  // ── Observatório & Geo ─────────────────────────────────────────────────────
  {
    key: "numista", name: "Numista", category: "Observatório & Geo",
    host: "api.numista.com", purpose: "Catálogo numismático — tiragem, dimensões e descrições no dossiê da página Moedas",
    envVars: [{ name: "NUMISTA_API_KEY", required: false }],
    docs: "https://pt.numista.com/api/doc/v3/index.php",
    probe: async () => {
      const k = env("NUMISTA_API_KEY");
      if (!k) return { ok: false, detail: "NUMISTA_API_KEY não configurada (bloco Numista fica oculto na página Moedas)" };
      const { status, json } = await getJson("https://api.numista.com/api/v3/types?q=KM%23652%20Brazil&count=1&category=coin", { headers: { "Numista-API-Key": k } });
      const n = json?.count ?? json?.types?.length;
      return status === 200 ? { ok: true, detail: `busca ok (${n ?? "?"} resultados p/ KM#652 Brazil)` } : { ok: false, detail: json?.error_message || `HTTP ${status}` };
    },
  },
  {
    key: "nasa", name: "NASA (api.nasa.gov)", category: "Observatório & Geo",
    host: "api.nasa.gov", purpose: "APOD, asteroides (NeoWs), EPIC, Mars — página NASA",
    envVars: [{ name: "NASA_API_KEY", required: false }],
    probe: async () => {
      const k = env("NASA_API_KEY") || "DEMO_KEY";
      const { status, json } = await getJson(`https://api.nasa.gov/planetary/apod?api_key=${k}`);
      return json?.title ? { ok: true, detail: `APOD: "${json.title}"${k === "DEMO_KEY" ? " · DEMO_KEY" : ""}` } : { ok: false, detail: json?.error?.message || `HTTP ${status}` };
    },
  },
  {
    key: "eonet", name: "NASA EONET", category: "Observatório & Geo",
    host: "eonet.gsfc.nasa.gov", purpose: "Eventos naturais (incêndios, tempestades, vulcões) no globo",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=1");
      return Array.isArray(json?.events) ? { ok: true, detail: "eventos ok" } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "usgs", name: "USGS Earthquakes", category: "Observatório & Geo",
    host: "earthquake.usgs.gov", purpose: "Terremotos M4.5+ (camada Desastres do globo)",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson");
      return Array.isArray(json?.features) ? { ok: true, detail: `${json.features.length} sismos (dia)` } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "gdelt_doc", name: "GDELT DOC 2.0", category: "Observatório & Geo",
    host: "api.gdeltproject.org", purpose: "Buzz e tom/sentimento de ativos (limite 1 req/5s)",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://api.gdeltproject.org/api/v2/doc/doc?query=markets&mode=artlist&maxrecords=1&format=json");
      return json ? { ok: true, detail: "DOC 2.0 ok" } : { ok: false, detail: `HTTP ${status}` };
    },
  },
  {
    key: "gdelt_events", name: "GDELT Events 2.0 (CSV)", category: "Observatório & Geo",
    host: "data.gdeltproject.org", purpose: "Focos de conflito/protesto (camada do HoloGlobe)",
    envVars: [],
    probe: async () => {
      const res = await httpGet("http://data.gdeltproject.org/gdeltv2/lastupdate.txt");
      const txt = await res.text();
      return res.ok && txt.includes("gdeltv2") ? { ok: true, detail: "CSV mais recente ok" } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },
  {
    key: "worldbank", name: "World Bank", category: "Observatório & Geo",
    host: "api.worldbank.org", purpose: "Indicadores de país (PIB, população) e instabilidade no Radar",
    envVars: [],
    probe: async () => {
      const { status, json } = await getJson("https://api.worldbank.org/v2/country/BR?format=json");
      const name = Array.isArray(json) ? json?.[1]?.[0]?.name : undefined;
      return name ? { ok: true, detail: name } : { ok: false, detail: `HTTP ${status}` };
    },
  },

  // ── Alertas & Logos ────────────────────────────────────────────────────────
  {
    key: "telegram", name: "Telegram Bot", category: "Alertas & Logos",
    host: "api.telegram.org", purpose: "Alertas (DARF/DIRPF/alavancagem) e resumo do dia",
    envVars: [{ name: "TELEGRAM_BOT_TOKEN", required: false }],
    probe: async () => {
      const t = env("TELEGRAM_BOT_TOKEN");
      if (!t) return { ok: false, detail: "sem TELEGRAM_BOT_TOKEN (ou salvo em Configurações → Alertas)" };
      const { status, json } = await getJson(`https://api.telegram.org/bot${t}/getMe`);
      const u = json?.result?.username;
      return u ? { ok: true, detail: `@${u}` } : { ok: false, detail: json?.description || `HTTP ${status}` };
    },
  },
  {
    key: "logodev", name: "Logo.dev", category: "Alertas & Logos",
    host: "img.logo.dev", purpose: "Logotipos de empresas/ativos",
    envVars: [{ name: "LOGO_DEV_TOKEN", required: false }],
    probe: async () => {
      const t = env("LOGO_DEV_TOKEN");
      if (!t) return { ok: false, detail: "sem LOGO_DEV_TOKEN (opcional)" };
      const res = await httpGet(`https://img.logo.dev/apple.com?token=${t}&size=32`);
      const ct = res.headers.get("content-type") || "";
      return res.ok && ct.startsWith("image/") ? { ok: true, detail: "logo ok" } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },
  // Clearbit Logo (logo.clearbit.com) foi REMOVIDA: sunset dez/2025, o DNS nem
  // resolve mais. Não reintroduzir. Substitutos no resolver /api/logo: FMP
  // images, brapi (B3), logo.dev, Parqet e favicon por domínio.
  {
    key: "fmpimg", name: "FMP Images", category: "Alertas & Logos",
    host: "images.financialmodelingprep.com", purpose: "Logotipos por ticker (sem chave) — fonte do /api/logo",
    envVars: [],
    probe: async () => {
      const res = await httpGet("https://images.financialmodelingprep.com/symbol/AAPL.png");
      const ct = res.headers.get("content-type") || "";
      return res.ok && ct.startsWith("image/") ? { ok: true, detail: "logo ok" } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },
  {
    key: "parqet", name: "Parqet Logos", category: "Alertas & Logos",
    host: "assets.parqet.com", purpose: "Logotipos por ticker (sem chave) — fallback do /api/logo",
    envVars: [],
    probe: async () => {
      const res = await httpGet("https://assets.parqet.com/logos/symbol/AAPL?format=png&size=32");
      const ct = res.headers.get("content-type") || "";
      return res.ok && ct.startsWith("image/") ? { ok: true, detail: "logo ok" } : { ok: false, detail: `HTTP ${res.status}` };
    },
  },
];

export function getApiDef(key: string): ApiDef | undefined {
  return API_REGISTRY.find((a) => a.key === key);
}
