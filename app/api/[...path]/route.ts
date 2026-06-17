import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type Handler = (req: NextRequest, ctx?: unknown) => Promise<Response> | Response;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Module = Record<string, any>;

async function loadHandler(path: string): Promise<Module | null> {
  switch (path) {
    case "alavancagem": return import("@/app/api/alavancagem/handler");
    case "auth/password": return import("@/app/api/auth/password/handler");
    case "auth/validate": return import("@/app/api/auth/validate/handler");
    case "backup": return import("@/app/api/backup/handler");
    case "bolsas/constituents": return import("@/app/api/bolsas/constituents/handler");
    case "bolsas/country": return import("@/app/api/bolsas/country/handler");
    case "bolsas/crypto": return import("@/app/api/bolsas/crypto/handler");
    case "bolsas/history": return import("@/app/api/bolsas/history/handler");
    case "bolsas/ohlc": return import("@/app/api/bolsas/ohlc/handler");
    case "bolsas/profile": return import("@/app/api/bolsas/profile/handler");
    case "bolsas/sectors": return import("@/app/api/bolsas/sectors/handler");
    case "bolsas/yields": return import("@/app/api/bolsas/yields/handler");
    case "composicao/etf-refresh": return import("@/app/api/composicao/etf-refresh/handler");
    case "composicao/holdings": return import("@/app/api/composicao/holdings/handler");
    case "config/background": return import("@/app/api/config/background/handler");
    case "cotacoes/refresh": return import("@/app/api/cotacoes/refresh/handler");
    case "crypto/history": return import("@/app/api/crypto/history/handler");
    case "debug": return import("@/app/api/debug/handler");
    case "debug/audit-cotacoes": return import("@/app/api/debug/audit-cotacoes/handler");
    case "debug/auditoria": return import("@/app/api/debug/auditoria/handler");
    case "debug/cobertura": return import("@/app/api/debug/cobertura/handler");
    case "debug/mtm-recon": return import("@/app/api/debug/mtm-recon/handler");
    case "evolucao": return import("@/app/api/evolucao/handler");
    case "financas": return import("@/app/api/financas/handler");
    case "health": return import("@/app/api/health/handler");
    case "hoje/comentario": return import("@/app/api/hoje/comentario/handler");
    case "ir": return import("@/app/api/ir/handler");
    case "ir/agente": return import("@/app/api/ir/agente/handler");
    case "ir/dirpf": return import("@/app/api/ir/dirpf/handler");
    case "market/ohlc": return import("@/app/api/market/ohlc/handler");
    case "moedas": return import("@/app/api/moedas/handler");
    case "portfolio/sectors": return import("@/app/api/portfolio/sectors/handler");
    case "preditivos/kalshi": return import("@/app/api/preditivos/kalshi/handler");
    case "preditivos/metaculus": return import("@/app/api/preditivos/metaculus/handler");
    case "preditivos/polymarket": return import("@/app/api/preditivos/polymarket/handler");
    case "ptax/update": return import("@/app/api/ptax/update/handler");
    case "rebuild-cotacoes": return import("@/app/api/rebuild-cotacoes/handler");
    case "reddit": return import("@/app/api/reddit/handler");
    case "renda-fixa/caixa": return import("@/app/api/renda-fixa/caixa/handler");
    case "simulacoes": return import("@/app/api/simulacoes/handler");
    case "sync/b3": return import("@/app/api/sync/b3/handler");
    case "sync/cotacoes": return import("@/app/api/sync/cotacoes/handler");
    case "sync/ibkr": return import("@/app/api/sync/ibkr/handler");
    case "sync/import": return import("@/app/api/sync/import/handler");
    case "twr/debug": return import("@/app/api/twr/debug/handler");
    case "twr/decomposicao": return import("@/app/api/twr/decomposicao/handler");
    case "videos": return import("@/app/api/videos/handler");
    default: return null;
  }
}

async function dispatch(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const route = path.join("/");
  const mod = await loadHandler(route);
  if (!mod) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const method = req.method.toUpperCase();
  const handler = mod[method] as Handler | undefined;
  if (!handler) {
    return NextResponse.json({ error: `Method ${method} not allowed` }, { status: 405 });
  }
  return handler(req);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, ctx);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, ctx);
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, ctx);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return dispatch(req, ctx);
}
