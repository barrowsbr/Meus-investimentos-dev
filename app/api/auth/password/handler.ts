import { NextResponse } from "next/server";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

// Daily token generation — same logic as Streamlit core/auth.py
// Token = HMAC-SHA256(password + ":" + day_number)[:20]
function dailyToken(password: string): string {
  const day = Math.floor(Date.now() / 86400000).toString();
  return createHmac("sha256", `${password}:${day}`).digest("hex").slice(0, 20);
}

function getPassword(): string {
  return process.env.APP_PASSWORD ?? process.env.AUTH_PASSWORD ?? "1015";
}

// GET /api/auth/password?token=xxx — validates a token
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") ?? "";
  const password = getPassword();
  const valid = token === dailyToken(password);
  return NextResponse.json({ valid });
}

// POST /api/auth/password — check password or get token
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = getPassword();

    // Validate password
    if (body.password !== undefined) {
      const correct = body.password === password;
      if (!correct) {
        return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
      }
      return NextResponse.json({ token: dailyToken(password), valid: true });
    }

    // Change password (only if current password is verified via token or current_password)
    if (body.new_password !== undefined) {
      const tokenValid = body.token === dailyToken(password);
      const currentValid = body.current_password === password;
      if (!tokenValid && !currentValid) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
      }

      // In a Vercel deployment, we can't persist to .password file, but we respond
      // with the new token so client can update its session
      // In local dev with file system access, this could write to .env.local
      return NextResponse.json({
        success: true,
        message: "Para alterar a senha permanentemente, atualize APP_PASSWORD nas variáveis de ambiente.",
        new_token: dailyToken(body.new_password),
      });
    }

    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Erro na requisição" }, { status: 400 });
  }
}
