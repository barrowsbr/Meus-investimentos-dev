import { NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — o AuthGate pergunta se HÁ sessão de servidor válida (cookie HttpOnly).
// Usado para forçar re-login uma vez após o deploy que introduziu a sessão:
// quem estava "logado" só via sessionStorage não tem o cookie e precisa relogar.
export async function GET() {
  return NextResponse.json({ session: hasValidSession() });
}
