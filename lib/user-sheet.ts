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

export function extraUsers(): ExtraUser[] {
  try {
    const raw = process.env.EXTRA_USERS_JSON;
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((u) => ({
        user: String(u?.user ?? "").trim().toUpperCase(),
        password: String(u?.password ?? ""),
        spreadsheetId: String(u?.spreadsheetId ?? u?.planilha ?? "").trim(),
      }))
      .filter((u) => u.user && u.password && u.spreadsheetId);
  } catch {
    return [];
  }
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
