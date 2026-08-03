// ── Multiusuário REMOVIDO (decisão do dono) ────────────────────────────────────
// O app tem UMA conta (o dono). As antigas contas extras (EXTRA_USERS_JSON /
// cookie mi_user, roteando leitura/escrita para outra planilha) foram retiradas.
//
// Estas funções permanecem como no-ops para os call sites existentes seguirem
// compilando e se comportando corretamente:
//   - activeUserKey()       → sempre null  (não há conta extra ativa)
//   - activeSpreadsheetId()  → sempre a planilha principal (SPREADSHEET_ID)
// Assim os guards espalhados (ex.: `if (activeUserKey()) …`, `skipIbkr =
// !!activeUserKey()`) deixam de bloquear/rotear — o dono vê tudo, como deve.
//
// O modo demonstração (test/test) é INDEPENDENTE disto (lib/demo.ts, cookie
// mi_demo) e segue funcionando: escala a leitura ×15 e bloqueia escrita.

// Mantido só para o login e o middleware limparem qualquer cookie legado.
export const USER_COOKIE = "mi_user";

/** Não há mais conta extra — sempre null. */
export function activeUserKey(): string | null {
  return null;
}

/** Planilha da request — sempre a principal (dono). */
export function activeSpreadsheetId(): string {
  return process.env.SPREADSHEET_ID!;
}
