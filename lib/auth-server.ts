// ── Sessão de servidor (cookie HttpOnly assinado) ──────────────────────────────
// O AuthGate é client-side (sessionStorage) e não protege as rotas de API — que
// ficam abertas a quem tiver a URL de produção. Este módulo emite, no login do
// dono, um cookie HttpOnly ASSINADO (HMAC) e permite às rotas mutantes/perigosas
// exigirem-no no servidor.
//
// FILOSOFIA FAIL-OPEN (app pessoal, sem banco): o gate só devolve 401 quando tem
// CERTEZA de que o login está habilitado E não há sessão válida. Qualquer
// incerteza (erro ao ler a config, runtime sem cookie) LIBERA — nunca travar o
// dono é mais importante do que a segurança marginal.

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

export const SESSION_COOKIE = "mi_sess";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 dias

function secret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.CRON_SECRET ||
    process.env.APP_PASSWORD ||
    "mi-sessao-fallback-secret"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Valor do cookie de sessão: `<emitidoEmMs>.<hmac>`. */
export function makeSessionValue(nowMs: number): string {
  const ts = String(nowMs);
  return `${ts}.${sign(ts)}`;
}

/** Verifica assinatura e validade (≤ 30 dias). */
export function verifySessionValue(value: string | undefined, nowMs: number): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const ts = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(ts);
  if (mac.length !== expected.length) return false;
  let ok = false;
  try {
    ok = timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
  if (!ok) return false;
  const emitido = Number(ts);
  if (!Number.isFinite(emitido)) return false;
  return nowMs - emitido <= MAX_AGE_S * 1000;
}

/** Seta o cookie de sessão numa NextResponse (chamado no login do dono). */
export function setSession(res: NextResponse, nowMs: number): void {
  res.cookies.set(SESSION_COOKIE, makeSessionValue(nowMs), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export function clearSession(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** Há sessão válida do dono nesta request? */
export function hasValidSession(): boolean {
  try {
    const v = cookies().get(SESSION_COOKIE)?.value;
    return verifySessionValue(v, Date.now());
  } catch {
    return false;
  }
}

/** O login está habilitado? (flag `exigir_login` na aba config; default ON.)
 *  Em QUALQUER erro devolve `null` = indeterminado → o gate libera (fail-open). */
async function loginHabilitado(): Promise<boolean | null> {
  try {
    const rows = await getDataStore().fetchTab("config");
    for (const r of rows) {
      const k = String(r["chave"] ?? r["key"] ?? "").toLowerCase().trim();
      if (k === "exigir_login" || k === "login_habilitado" || k === "require_login") {
        const v = String(r["valor"] ?? r["value"] ?? "").toLowerCase().trim();
        return !(v === "0" || v === "false" || v === "nao" || v === "não" || v === "off");
      }
    }
    return true; // flag ausente = login ON (comportamento atual)
  } catch {
    return null; // indeterminado → fail-open
  }
}

/**
 * Guard para rotas mutantes/perigosas. Retorna `null` quando a request pode
 * prosseguir e uma resposta 401 quando deve ser barrada.
 * Barra SOMENTE quando: sem sessão válida E login comprovadamente habilitado.
 */
export async function requireOwner(): Promise<NextResponse | null> {
  try {
    if (hasValidSession()) return null;             // logado → ok
    const enabled = await loginHabilitado();
    if (enabled !== true) return null;              // login off ou indeterminado → ok (fail-open)
    return NextResponse.json({ error: "Não autorizado — faça login" }, { status: 401 });
  } catch {
    return null; // qualquer imprevisto → fail-open (nunca travar o dono)
  }
}
