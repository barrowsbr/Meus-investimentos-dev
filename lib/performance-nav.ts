// Navegação da Performance — helpers PUROS (sem React/DOM) para duas decisões
// que precisam ficar travadas por teste:
//
//   1. Qual aba a URL pede (`?tab=`) e como escrevê-la de volta. A aba vive na
//      URL porque ao abrir um ativo em /renda-variavel a partir daqui, o fechar
//      do card faz `router.back()` — sem a aba na URL, a volta caía na aba
//      padrão em vez da que o dono estava vendo.
//   2. Quais ativos podem virar link para /renda-variavel. O gráfico de
//      rentabilidade mistura RV e RF (o dono vê NTN-B ao lado de NVDA), e
//      renda fixa não tem card de ativo lá.
//      ⚠️ O teste da classe é o campo `macro` que o /api/composicao/resumo já
//      devolve — NÃO `isRendaVariavel(setor)`. Verificado contra a produção
//      (04/09/2026): o setor real do NTN-B é "Tesouro Direto", que NÃO está em
//      RF_SETORES (só "Renda Fixa", "Renda Fixa USD", "Caixa/Liquidez"), então
//      aquele predicado o classificaria como renda VARIÁVEL. O `macro` do mesmo
//      payload diz "Renda Fixa" — é a classificação canônica de quem montou o
//      dado; reusar em vez de re-derivar.

export type PerfTab = "overview" | "drawdown" | "monthly" | "previsoes" | "rentabilidade";

const TABS: readonly PerfTab[] = ["overview", "drawdown", "monthly", "previsoes", "rentabilidade"];

/** Aba pedida pela query string, ou null se ausente/desconhecida. */
export function tabDaUrl(search: string): PerfTab | null {
  const t = new URLSearchParams(search).get("tab");
  return t && (TABS as readonly string[]).includes(t) ? (t as PerfTab) : null;
}

/** URL com a aba aplicada. `overview` é o default: sai da URL em vez de virar
 *  `?tab=overview` (link mais limpo e evita duas URLs para a mesma tela). */
export function urlComTab(href: string, tab: PerfTab): string {
  const url = new URL(href);
  if (tab === "overview") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  return url.toString();
}

/** Link para o card do ativo, ou null quando é renda fixa (sem card lá). */
export function hrefDoAtivo(item: { ticker: string; macro: string }): string | null {
  if (!item.ticker || item.macro !== "Renda Variável") return null;
  return `/renda-variavel?ticker=${encodeURIComponent(item.ticker)}`;
}
