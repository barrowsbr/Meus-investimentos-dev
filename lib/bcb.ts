// Banco Central do Brasil — API de séries temporais SGS.
// CDI diário = série 12 (% ao dia, somente dias úteis).
// IPCA mensal = série 433 (% ao mês) — benchmark de inflação da Performance.
// Usado pelo benchmark CDI e pelo acrual de renda fixa manual — substitui a
// tabela SELIC hardcoded, que precisava de manutenção manual a cada COPOM.

const SGS_CDI = 12;
const SGS_IPCA = 433;
const TTL_MS = 6 * 60 * 60 * 1000;

const _cache = new Map<string, { data: Record<string, number>; at: number }>();

function toBrDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

// Busca uma série SGS no intervalo, fatiada em janelas de ~10 anos (limite da
// API para séries diárias). Retorna { "yyyy-mm-dd": valor_decimal } (valor da
// API é %, dividido por 100). Em falha — inclusive parcial — retorna {}: uma
// série com buraco acruaria 0% nesses dias, pior que o fallback completo.
async function fetchSgsSerie(
  serie: number,
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const key = `${serie}:${startDate}:${endDate}`;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const out: Record<string, number> = {};
  try {
    let chunkStart = new Date(startDate + "T12:00:00Z");
    const end = new Date(endDate + "T12:00:00Z");
    while (chunkStart <= end) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setUTCFullYear(chunkEnd.getUTCFullYear() + 9);
      const effEnd = chunkEnd < end ? chunkEnd : end;
      const url =
        `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json` +
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
    return {};
  }

  if (Object.keys(out).length > 0) _cache.set(key, { data: out, at: Date.now() });
  return out;
}

// Retorna { "yyyy-mm-dd": taxa_decimal_ao_dia }. Em falha de rede/API retorna
// {} — o consumidor usa o fallback (tabela SELIC embutida) e reporta o aviso.
export async function fetchCdiDiario(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  return fetchSgsSerie(SGS_CDI, startDate, endDate);
}

// IPCA mensal → { "yyyy-mm": taxa_decimal_do_mês }. A série vem datada no dia
// 1º de cada mês; a chave é o mês. Em falha retorna {} (benchmark fica vazio).
export async function fetchIpcaMensal(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const porDia = await fetchSgsSerie(SGS_IPCA, startDate, endDate);
  const out: Record<string, number> = {};
  for (const [date, taxa] of Object.entries(porDia)) out[date.slice(0, 7)] = taxa;
  return out;
}
