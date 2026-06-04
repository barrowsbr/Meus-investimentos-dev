/**
 * admin-auth.ts — Proteção simples para as rotas administrativas do banco.
 * Aceita o segredo via header `Authorization: Bearer <segredo>` ou `?key=<segredo>`.
 * Usa ADMIN_SECRET; cai para CRON_SECRET se não houver.
 */
export function checkAdminAuth(request: Request): { ok: boolean; error?: string } {
  const secret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, error: "ADMIN_SECRET (ou CRON_SECRET) não configurado no servidor" };
  }
  const auth = request.headers.get("authorization");
  const key = new URL(request.url).searchParams.get("key");
  if (auth === `Bearer ${secret}` || key === secret) return { ok: true };
  return { ok: false, error: "Não autorizado" };
}
