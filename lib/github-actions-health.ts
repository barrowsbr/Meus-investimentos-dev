// Saúde real das automações do GitHub Actions — SERVER-ONLY.
//
// Por que existe: o histórico patrimonial e o backup diário ficaram QUEBRADOS
// por quase um mês em silêncio (o CRON_SECRET nunca chegou ao job, então todo
// run abortava). O card de Automações mostrava "ON" porque o interruptor do app
// estava ligado — mas o interruptor só diz "deveria rodar", não "rodou". Aqui
// buscamos o resultado REAL da última execução.
//
// O repositório é PÚBLICO, então a API do GitHub responde sem autenticação
// (limite de 60 req/h por IP). Com 3 workflows e revalidação de 15 min dá ~12
// req/h — folgado. Se o limite estourar, devolvemos `indisponivel` em vez de
// fingir que está tudo bem.

const REPO = "barrowsbr/Meus-investimentos-dev";
const REVALIDATE_S = 900; // 15 min

export interface SaudeWorkflow {
  arquivo: string;
  /** "success" | "failure" | "cancelled" | "skipped" | null (nunca executou) */
  conclusao: string | null;
  /** "completed" | "in_progress" | "queued" | null */
  status: string | null;
  /** ISO da última execução */
  em: string | null;
  url: string | null;
  /** Quantas das últimas execuções falharam em sequência (0 = a última passou). */
  falhasSeguidas: number;
  /** true quando não deu para consultar (rate limit/rede) — NÃO é "está ok". */
  indisponivel?: boolean;
}

interface RunApi { conclusion: string | null; status: string | null; created_at: string; html_url: string }

/** O limite de 60/h é POR IP, e o IP de saída da Vercel é compartilhado — se o
 *  dono definir GITHUB_TOKEN (read-only basta), o limite vira 5.000/h. Opcional. */
function cabecalhos(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "meus-investimentos/1.0",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const tok = process.env.GITHUB_TOKEN?.trim();
  if (tok) h.Authorization = `Bearer ${tok}`;
  return h;
}

/** PURA: extrai o arquivo do workflow a partir do link do card. */
export function arquivoDoLink(link: string | undefined): string | null {
  if (!link) return null;
  // Sem âncora no fim: o link do GitHub pode vir com ?query=branch:main ou #hash.
  const m = link.match(/\/workflows\/([^/?#]+)/);
  return m ? m[1] : null;
}

/** PURA: conta falhas consecutivas a partir da execução mais recente. */
export function contarFalhasSeguidas(runs: Array<{ conclusion: string | null }>): number {
  let n = 0;
  for (const r of runs) {
    if (r.conclusion === "failure") n++;
    else if (r.conclusion === null) continue; // em andamento não interrompe a contagem
    else break;
  }
  return n;
}

async function buscarRuns(arquivo: string): Promise<RunApi[] | null> {
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${encodeURIComponent(arquivo)}/runs?per_page=8`;
  try {
    const r = await fetch(url, {
      headers: cabecalhos(),
      next: { revalidate: REVALIDATE_S },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null; // 403 = rate limit, 404 = workflow removido
    const j = (await r.json()) as { workflow_runs?: RunApi[] };
    return Array.isArray(j.workflow_runs) ? j.workflow_runs : [];
  } catch {
    return null;
  }
}

export async function saudeDoWorkflow(arquivo: string): Promise<SaudeWorkflow> {
  const runs = await buscarRuns(arquivo);
  if (runs == null) {
    return { arquivo, conclusao: null, status: null, em: null, url: null, falhasSeguidas: 0, indisponivel: true };
  }
  const ultima = runs[0];
  return {
    arquivo,
    conclusao: ultima?.conclusion ?? null,
    status: ultima?.status ?? null,
    em: ultima?.created_at ?? null,
    url: ultima?.html_url ?? null,
    falhasSeguidas: contarFalhasSeguidas(runs),
  };
}

/** Saúde de vários workflows em paralelo, indexada pelo arquivo. */
export async function saudeDosWorkflows(arquivos: string[]): Promise<Record<string, SaudeWorkflow>> {
  const unicos = [...new Set(arquivos.filter(Boolean))];
  const res = await Promise.all(unicos.map((a) => saudeDoWorkflow(a)));
  const out: Record<string, SaudeWorkflow> = {};
  unicos.forEach((a, i) => (out[a] = res[i]));
  return out;
}
