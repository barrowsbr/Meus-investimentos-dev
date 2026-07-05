import { NextRequest, NextResponse } from "next/server";

// ── Cache do CDN por CONTA ─────────────────────────────────────────────────────
// As rotas de leitura (/api/cotacoes, /api/composicao/resumo, /api/twr, …)
// respondem com `s-maxage` e o edge da Vercel cacheia POR URL — sem isto, a
// resposta cacheada do dono seria servida para a conta extra (esposa) e para o
// modo demo (e vice-versa), porque o cookie não entra na chave de cache.
//
// O middleware roda ANTES do cache (mesmo mecanismo dos A/B tests da Vercel):
// quando há cookie de conta extra (mi_user) ou de demo (mi_demo), reescreve a
// request de /api/* acrescentando `?__acct=<conta>` — cada conta ganha a sua
// própria entrada de cache, sem tocar em nenhum call site do cliente.
// Sem cookie (dono, cron) a URL fica intacta — cache atual preservado.

export function middleware(req: NextRequest) {
  const user = req.cookies.get("mi_user")?.value?.trim();
  const demo = req.cookies.get("mi_demo")?.value === "1";
  const acct = demo ? "demo" : user ? user.toLowerCase() : null;
  if (!acct) return NextResponse.next();

  const url = req.nextUrl.clone();
  if (url.searchParams.get("__acct") === acct) return NextResponse.next();
  url.searchParams.set("__acct", acct);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/api/:path*"],
};
