import { cookies } from "next/headers";
import { toNumber } from "./format";

// ── Modo demonstração (showcase) ──────────────────────────────────────────────
// Login `test` / `test` entra na MESMA conta do dono, porém com todos os valores
// monetários e quantidades multiplicados por DEMO_FACTOR. Serve para mostrar o
// projeto a terceiros sem expor os números reais — não cria banco/dados novos.
//
// Regra de consistência: escalamos QUANTIDADE e VALORES (não o preço unitário,
// nem taxas de câmbio, nem percentuais). Assim patrimônio/investido/lucro/
// proventos escalam ×N, enquanto preços, cotações, alocação e rentabilidade %
// continuam reais — a carteira segue internamente coerente.
//
// Segurança: o modo é SOMENTE LEITURA. O cookie é HttpOnly (setado pelo servidor,
// o cliente não consegue forjar/remover) e toda escrita em planilha lança erro
// quando o cookie está presente (ver lib/gsheets.ts).

export const DEMO_USER = "TEST";
export const DEMO_PASS = "test";
export const DEMO_FACTOR = 15;
export const DEMO_COOKIE = "mi_demo";

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

// Colunas (chave normalizada) a multiplicar, por aba. O que NÃO está aqui fica
// intacto — em especial preço unitário, taxa/VET de câmbio, pesos da composição
// e as cotações (db_cotacoes), preservando preços e percentuais reais.
const TAB_SCALE: Record<string, string[]> = {
  "meus ativos": ["quantidade", "qtd", "quantity", "valor bruto", "valor liquido", "taxa de corretagem", "taxas"],
  "meus proventos": ["valor"],
  "renda fixa": ["valor"],
  "fixa aberta": ["atual", "valor atual", "saldo", "valor"],
  "cambio": ["valor origem", "valor entrada", "valor destino", "valor saida"],
  "financas pessoal": ["valor"],
  "financas assinaturas": ["valor"],
  "financas parcelamentos": ["valor total"],
  "lb historic": ["patrimonio", "total", "patrimonio total", "rv", "renda variavel", "rf", "renda fixa"],
  "historico patrimonio": [
    "patrimonio", "patrimonio total", "total", "valor", "saldo", "liquido", "patrimonio liquido",
    "rv", "renda variavel", "rf", "renda fixa", "exterior", "internacional", "cripto", "criptoativos",
    "caixa", "banco", "bancos", "previdencia", "imoveis",
  ],
};

export function isDemoRequest(): boolean {
  try {
    return cookies().get(DEMO_COOKIE)?.value === "1";
  } catch {
    // Fora do escopo de uma request (cron, scripts) → nunca é demo.
    return false;
  }
}

export function scaleRowsForTab(
  tabName: string,
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  const cols = TAB_SCALE[norm(tabName)];
  if (!cols) return rows; // aba não escalável (cotações, ptax, composição, config…)
  const want = new Set(cols.map(norm));
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const key of Object.keys(out)) {
      if (!want.has(norm(key))) continue;
      const n = toNumber(out[key]);
      if (n === null) continue;
      out[key] = n * DEMO_FACTOR;
    }
    return out;
  });
}
