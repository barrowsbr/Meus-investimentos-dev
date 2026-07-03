// ─────────────────────────────────────────────────────────────────────────────
// Porta ÚNICA para o GDELT. O GDELT limita a 1 requisição a cada ~5 segundos por
// IP — e, ao estourar, responde 200 com um AVISO EM TEXTO ("Please limit requests
// to one every 5 seconds…") em vez de JSON. Como as funções serverless da Vercel
// compartilham IP de saída, disparar chamadas em paralelo (Promise.all) trip­a o
// limite: várias voltam como aviso, o JSON.parse falha e o app trata como erro
// → caía no fallback / "404". (Foi exatamente o bug das camadas do globo.)
//
// Este wrapper resolve na raiz:
//   1. SERIALIZA — toda chamada entra numa fila com espaçamento mínimo de 5s,
//      não importa quantas features disparem "ao mesmo tempo".
//   2. DETECTA O THROTTLE — reconhece o aviso em texto e re-tenta (backoff).
//   3. CACHEIA por URL — o GDELT só atualiza a cada ~15 min, então repetir a
//      mesma query é desperdício; o cache também serve resposta "velha" quando
//      o throttle persiste, em vez de devolver vazio.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_GAP_MS = 5200; // 1 req / 5s + folga
const DEFAULT_CACHE_MS = 15 * 60_000; // cadência de atualização do GDELT
const MAX_RETRIES = 2;

interface CacheEntry { ts: number; data: unknown }
const cache = new Map<string, CacheEntry>();

// Fila serial no processo: cada chamada aguarda a anterior liberar + o gap.
let chain: Promise<void> = Promise.resolve();
let lastCallTs = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function throttledFetch(url: string): Promise<Response> {
  // Encadeia para garantir espaçamento mesmo entre chamadas concorrentes.
  const gate = chain.then(async () => {
    const wait = lastCallTs + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallTs = Date.now();
  });
  chain = gate.catch(() => {});
  await gate;
  return fetch(url, {
    headers: { "User-Agent": "meus-investimentos (dashboard pessoal)" },
    signal: AbortSignal.timeout(18_000),
  });
}

// Aviso de throttle vem como 200 + texto simples (não JSON).
function isThrottleNotice(text: string): boolean {
  return /limit requests|please limit|one every|high-traffic/i.test(text.slice(0, 400));
}

/**
 * GET no GDELT com serialização, cache e re-tentativa em caso de throttle.
 * Devolve o JSON (T) ou `null` se falhar após as re-tentativas (sem cache).
 * Quando há cache "velho", ele é preferido a devolver null durante um throttle.
 */
export async function gdeltJson<T = unknown>(url: string, cacheMs = DEFAULT_CACHE_MS): Promise<T | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.ts < cacheMs) return hit.data as T;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await throttledFetch(url);
      const text = await res.text();

      if (isThrottleNotice(text)) {
        if (attempt < MAX_RETRIES) { await sleep(MIN_GAP_MS); continue; }
        return (hit?.data as T) ?? null; // serve cache velho se houver
      }
      if (!res.ok) {
        if (attempt < MAX_RETRIES) { await sleep(1500); continue; }
        return (hit?.data as T) ?? null;
      }
      let json: T;
      try {
        json = JSON.parse(text) as T;
      } catch {
        // JSON malformado normalmente é throttle disfarçado — re-tenta.
        if (attempt < MAX_RETRIES) { await sleep(MIN_GAP_MS); continue; }
        return (hit?.data as T) ?? null;
      }
      cache.set(url, { ts: Date.now(), data: json });
      return json;
    } catch {
      if (attempt < MAX_RETRIES) { await sleep(1500); continue; }
      return (hit?.data as T) ?? null;
    }
  }
  return (hit?.data as T) ?? null;
}
