// ─────────────────────────────────────────────────────────────────────────────
// Cache de fetch NO CLIENTE (memória + sessionStorage) com TTL.
// Problema que resolve: no App Router, voltar para uma página REMONTA os
// componentes e cada useEffect dispara fetch de novo — a Home refazia
// /api/cotacoes, /api/home e notícias a cada visita, queimando as APIs.
// Dentro do TTL a resposta vem do cache (instantâneo, zero rede); o
// sessionStorage segura reloads na mesma aba. A chave é a URL — como os
// fetchers já anexam ?v=<data-version> (bumpDataVersion), qualquer escrita
// de dados invalida naturalmente o cache trocando a URL.
// ─────────────────────────────────────────────────────────────────────────────

interface Entry { t: number; data: unknown }

const memoria = new Map<string, Entry>();
const SS_PREFIX = "fjc:";

function lerSession(key: string): Entry | null {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch { return null; }
}

function gravar(key: string, entry: Entry): void {
  memoria.set(key, entry);
  try { sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry)); } catch { /* quota/SSR */ }
}

async function baixar(fetchUrl: string, cacheKey: string): Promise<unknown> {
  const r = await fetch(fetchUrl);
  let data: unknown = null;
  try { data = await r.json(); } catch { /* corpo não-JSON */ }
  if (!r.ok && data && typeof data === "object" && !(data as { error?: string }).error) {
    (data as { error?: string }).error = `HTTP ${r.status}`;
  }
  // Só respostas saudáveis entram no cache — erro sempre re-tenta na próxima.
  if (r.ok && data != null && !(data as { error?: string })?.error) {
    gravar(cacheKey, { t: Date.now(), data });
  }
  return data;
}

/**
 * fetch + json com cache por TTL. Erros NÃO são cacheados.
 * Retorna o body (que pode conter `.error`, como nos fetchers atuais).
 */
export async function fetchJsonCached<T = unknown>(url: string, ttlMs = 5 * 60_000): Promise<T> {
  const now = Date.now();
  const hit = memoria.get(url);
  if (hit && now - hit.t < ttlMs) return hit.data as T;
  const ss = lerSession(url);
  if (ss && now - ss.t < ttlMs) {
    memoria.set(url, ss);
    return ss.data as T;
  }
  return baixar(url, url) as Promise<T>;
}

/**
 * Busca SEMPRE fresca (ex.: botão "atualizar" com ?_t=): baixa de `fetchUrl`
 * e grava o resultado sob `cacheKey` (a URL base), aquecendo o cache.
 */
export async function fetchJsonFresh<T = unknown>(fetchUrl: string, cacheKey: string): Promise<T> {
  return baixar(fetchUrl, cacheKey) as Promise<T>;
}

/** Invalida entradas cujo cacheKey começe com o prefixo (default: tudo). */
export function invalidateFetchCache(prefixo = ""): void {
  for (const k of [...memoria.keys()]) if (k.startsWith(prefixo)) memoria.delete(k);
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_PREFIX) && k.slice(SS_PREFIX.length).startsWith(prefixo)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch { /* SSR */ }
}
