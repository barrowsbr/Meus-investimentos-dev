import { NextResponse } from "next/server";
import { parseExtraUsers } from "@/lib/user-sheet";

export const dynamic = "force-dynamic";

// Diagnóstico do multiusuário: mostra se a env EXTRA_USERS_JSON chegou ao
// deploy e como foi interpretada — SEM expor senha nem o ID completo da
// planilha. Se "envPresente" vier false, a env não existe NESTE deploy
// (criar/editar env na Vercel exige um redeploy para valer).
export async function GET(): Promise<NextResponse> {
  const raw = process.env.EXTRA_USERS_JSON;
  const { users, error } = parseExtraUsers(raw);
  return NextResponse.json({
    envPresente: !!(raw && raw.trim()),
    tamanhoEnv: raw?.length ?? 0,
    erro: error,
    contas: users.map((u) => ({
      user: u.user,
      senha: "•".repeat(Math.min(u.password.length, 8)),
      planilha: u.spreadsheetId.length > 10 ? `${u.spreadsheetId.slice(0, 6)}…${u.spreadsheetId.slice(-4)}` : u.spreadsheetId,
    })),
    dica: !raw
      ? "Env ausente: confira se EXTRA_USERS_JSON foi criada no ambiente Production e faça um novo deploy (env só vale no próximo build)."
      : error
        ? "Env presente mas mal formatada — formato esperado: [{\"user\":\"maria\",\"password\":\"...\",\"spreadsheetId\":\"1AbC...\"}]"
        : "Tudo certo — o login dessas contas deve funcionar.",
  });
}
