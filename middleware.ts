import { NextRequest, NextResponse } from "next/server";

// ── Cache do CDN por CONTA (só demo) ───────────────────────────────────────────
// As rotas de leitura (/api/cotacoes, /api/composicao/resumo, /api/twr, …)
// respondem com `s-maxage` e o edge da Vercel cacheia POR URL. O modo demo
// (test/test) escala os valores ×15 na leitura — sem separar a chave de cache, a
// resposta cacheada do dono vazaria para o demo (e vice-versa), porque o cookie
// não entra na chave.
//
// O middleware roda ANTES do cache: com o cookie de demo (mi_demo) reescreve
// /api/* acrescentando `?__acct=demo` (entrada de cache própria). Sem cookie, a
// URL fica intacta — MAS um `?__acct` forjado pelo cliente é REMOVIDO, senão uma
// request anônima com `?__acct=demo` gravaria dados reais do dono sob a chave do
// demo (envenenamento de cache). (Multiusuário removido — não há mais mi_user.)

export function middleware(req: NextRequest) {
  const demo = req.cookies.get("mi_demo")?.value === "1";
  const url = req.nextUrl.clone();

  if (demo) {
    if (url.searchParams.get("__acct") === "demo") return NextResponse.next();
    url.searchParams.set("__acct", "demo");
    return NextResponse.rewrite(url);
  }

  // Sem cookie: nunca deixar um __acct vindo do cliente entrar na chave de cache.
  if (url.searchParams.has("__acct")) {
    url.searchParams.delete("__acct");
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
