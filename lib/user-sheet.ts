import { cookies } from "next/headers";

// ── Multiusuário por planilha (sem banco de dados) ─────────────────────────────
// A esposa (ou qualquer conta extra) tem a PRÓPRIA planilha Google. O login de
// uma conta extra seta um cookie HttpOnly (`mi_user`) e TODA leitura/escrita do
// gsheets passa a apontar para a planilha daquela conta; sem cookie (dono, cron,
// scripts) vale a planilha principal (SPREADSHEET_ID).
//
// Configuração: env EXTRA_USERS_JSON — array JSON, ex.:
//   [{"user":"maria","password":"...","spreadsheetId":"1AbC..."}]
// Requisitos da planilha extra: compartilhada por link como Leitor (leitura via
// GOOGLE_API_KEY) e com o e-mail do service account como Editor (escrita).
//
// Segurança: o cookie carrega só o NOME da conta — o ID da planilha vem do env
// no servidor. Cookie forjado com nome desconhecido cai na planilha principal.
// (Mesmo modelo de confiança do APP_PASSWORD: separação de conveniência.)
//
// Exceções que NÃO seguem o cookie:
//   - db_cotacoes (golden source de preços) — fixa na planilha principal
//     (lib/db-cotacoes.ts tem o próprio SPREADSHEET_ID): preço é dado de
//     mercado, igual para todos; contas extras herdam o histórico.
//   - Sync IBKR Flex — usa o token da conta principal; bloqueado para extras.

export const USER_COOKIE = "mi_user";

export interface ExtraUser {
  user: string;          // nome de login (case-insensitive)
  password: string;
  spreadsheetId: string; // planilha própria da conta
}

// Parse TOLERANTE do env (erros comuns de colar JSON no painel da Vercel):
// aspas curvas de editor de texto, objeto único sem colchetes, aspas simples,
// e nomes de campo em PT (usuario/senha/planilha).
export function parseExtraUsers(raw: string | undefined): { users: ExtraUser[]; error: string | null } {
  if (!raw || !raw.trim()) return { users: [], error: "env vazio/ausente" };
  let s = raw.trim()
    .replace(/[“”„]/g, '"')   // aspas duplas curvas → retas
    .replace(/[‘’]/g, "'");        // aspas simples curvas → retas
  if (!s.startsWith("[")) s = `[${s}]`;       // objeto único sem colchetes
  let arr: unknown;
  try {
    arr = JSON.parse(s);
  } catch {
    // segunda chance: JSON escrito com aspas simples
    if (s.includes("'") && !s.includes('"')) {
      try { arr = JSON.parse(s.replace(/'/g, '"')); } catch { /* segue nulo */ }
    }
  }
  if (!Array.isArray(arr)) return { users: [], error: "JSON inválido — esperado um array de contas" };
  const users = (arr as Record<string, unknown>[])
    .map((u) => ({
      user: String(u?.user ?? u?.usuario ?? u?.["usuário"] ?? u?.login ?? "").trim().toUpperCase(),
      password: String(u?.password ?? u?.senha ?? u?.pass ?? ""),
      spreadsheetId: String(u?.spreadsheetId ?? u?.planilha ?? u?.sheetId ?? u?.sheet ?? u?.id ?? "").trim(),
    }))
    .filter((u) => u.user && u.password && u.spreadsheetId);
  if (users.length === 0) return { users: [], error: "JSON parseado, mas nenhuma conta com user + password + spreadsheetId" };
  return { users, error: null };
}

export function extraUsers(): ExtraUser[] {
  return parseExtraUsers(process.env.EXTRA_USERS_JSON).users;
}

/** Nome da conta extra ativa nesta request, ou null (dono / cron / cookie inválido). */
export function activeUserKey(): string | null {
  try {
    const v = cookies().get(USER_COOKIE)?.value?.trim().toUpperCase();
    if (!v) return null;
    return extraUsers().some((u) => u.user === v) ? v : null;
  } catch {
    return null; // fora do escopo de request (cron, scripts) → conta principal
  }
}

/** Planilha ativa da request: a da conta extra logada, senão a principal. */
export function activeSpreadsheetId(): string {
  const key = activeUserKey();
  if (key) {
    const u = extraUsers().find((x) => x.user === key);
    if (u) return u.spreadsheetId;
  }
  return process.env.SPREADSHEET_ID!;
}
