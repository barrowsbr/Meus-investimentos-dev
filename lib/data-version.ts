"use client";

// Cache-busting do CDN da Vercel.
//
// Os endpoints de leitura (/api/cotacoes, /api/composicao/resumo,
// /api/performance/advanced, /api/twr, /api/sheets/[tab]) respondem com
// `s-maxage` e ficam cacheados no edge por até 15 minutos. O cache é por URL
// e não pode ser purgado programaticamente — então, após qualquer escrita na
// planilha (salvar caixa, importar B3/IBKR, registrar margin), chamamos
// bumpDataVersion() e os fetchers anexam ?v=<timestamp> via withDataVersion().
// URL nova = cache MISS = dados recalculados na hora.

const KEY = "data-version";

export function bumpDataVersion(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch { /* localStorage indisponível (SSR/privado) — sem bust */ }
}

export function getDataVersion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function withDataVersion(url: string): string {
  const v = getDataVersion();
  if (!v) return url;
  return url + (url.includes("?") ? "&" : "?") + "v=" + v;
}
