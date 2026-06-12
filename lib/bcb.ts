// Banco Central do Brasil — API de séries temporais SGS.
// CDI diário = série 12 (% ao dia, somente dias úteis).
// Usado pelo benchmark CDI e pelo acrual de renda fixa manual — substitui a
// tabela SELIC hardcoded, que precisava de manutenção manual a cada COPOM.

const SGS_CDI = 12;
const TTL_MS = 6 * 60 * 60 * 1000;

let _cache: { key: string; data: Record<string, number>; at: number } | null = null;

function toBrDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// Retorna { "yyyy-mm-dd": taxa_decimal_ao_dia }. Em falha de rede/API retorna
// {} — o consumidor usa o fallback (tabela SELIC embutida) e reporta o aviso.
export async function fetchCdiDiario(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const key = `${startDate}:${endDate}`;
  if (_cache && _cache.key === key && Date.now() - _cache.at < TTL_MS) return _cache.data;

  const out: Record<string, number> = {};
  try {
    // Séries diárias do SGS aceitam no máximo 10 anos por requisição — fatiar.
    let chunkStart = new Date(startDate + "T12:00:00Z");
    const end = new Date(endDate + "T12:00:00Z");
    while (chunkStart <= end) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setUTCFullYear(chunkEnd.getUTCFullYear() + 9);
      const effEnd = chunkEnd < end ? chunkEnd : end;
      const url =
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SGS_CDI}/dados?formato=json` +
        `&dataInicial=${toBrDate(chunkStart.toISOString().slice(0, 10))}` +
        `&dataFinal=${toBrDate(effEnd.toISOString().slice(0, 10))}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`BCB SGS HTTP ${res.status}`);
        const rows: Array<{ data: string; valor: string }> = await res.json();
        for (const r of rows) {
          const [dd, mm, yyyy] = String(r.data).split("/");
          const rate = Number(String(r.valor).replace(",", ".")) / 100;
          if (isFinite(rate) && yyyy && mm && dd) out[`${yyyy}-${mm}-${dd}`] = rate;
        }
      } finally {
        clearTimeout(timer);
      }
      chunkStart = new Date(effEnd);
      chunkStart.setUTCDate(chunkStart.getUTCDate() + 1);
    }
  } catch {
    // Falha parcial invalida tudo: CDI faltando em parte do período acruaria
    // 0% nesses dias — pior que o fallback completo pela tabela SELIC.
    return {};
  }

  if (Object.keys(out).length > 0) _cache = { key, data: out, at: Date.now() };
  return out;
}
