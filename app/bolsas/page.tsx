import { redirect } from "next/navigation";

// O Scanner foi reformulado como Radar V2 (mapa-centro + dossiê por país).
// /bolsas agora redireciona para /radar, PRESERVANDO TODOS os deep-links.
//
// ⚠️ Antes esta rota tinha uma allowlist (só `symbol` e `country`) e engolia em
// silêncio qualquer outro parâmetro. Foi assim que o sino de alertas quebrou:
// ele aponta para `/bolsas?transmissao=1`, o `transmissao` era descartado no
// caminho e o Radar abria sem a Transmissão Macro. Repassar TUDO evita que o
// próximo deep-link novo repita o mesmo bug.
export default function BolsasRedirect({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(searchParams)) {
    if (valor == null) continue;
    // Um mesmo parâmetro pode vir repetido (?a=1&a=2) — o Next entrega array.
    for (const v of Array.isArray(valor) ? valor : [valor]) p.append(chave, v);
  }
  const qs = p.toString();
  redirect(qs ? `/radar?${qs}` : "/radar");
}
