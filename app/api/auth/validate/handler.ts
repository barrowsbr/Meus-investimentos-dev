import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";
import { DEMO_USER, DEMO_PASS, DEMO_COOKIE } from "@/lib/demo";
import { extraUsers, USER_COOKIE } from "@/lib/user-sheet";

export async function POST(req: NextRequest) {
  try {
    const store = getDataStore();
    const { user, password } = await req.json();
    if (!user || !password) {
      return NextResponse.json({ ok: false, error: "Campos obrigatórios" }, { status: 400 });
    }

    // Modo demonstração: mesma conta, valores ×15, somente leitura. Seta um
    // cookie HttpOnly (o cliente não consegue forjar) que liga o escalonamento
    // e bloqueia escritas no servidor.
    if (user.trim().toUpperCase() === DEMO_USER && password === DEMO_PASS) {
      const res = NextResponse.json({ ok: true, demo: true });
      res.cookies.set(DEMO_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
      return res;
    }

    // Conta extra (planilha própria — ex.: esposa): seta o cookie HttpOnly que
    // roteia TODA leitura/escrita para a planilha dela (lib/user-sheet.ts).
    const extra = extraUsers().find(
      (u) => u.user === user.trim().toUpperCase() && u.password === password,
    );
    if (extra) {
      const res = NextResponse.json({ ok: true, conta: extra.user.toLowerCase() });
      res.cookies.set(USER_COOKIE, extra.user, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      res.cookies.set(DEMO_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
      return res;
    }

    let validUser = "LBF";
    let validPass = process.env.APP_PASSWORD ?? "1015";

    try {
      const rows = await store.fetchTab("config");
      for (const row of rows) {
        const key = String(row["chave"] ?? row["key"] ?? "").toLowerCase().trim();
        const val = String(row["valor"] ?? row["value"] ?? "").trim();
        if (key === "usuario" || key === "user") validUser = val;
        if (key === "senha" || key === "password") validPass = val;
      }
    } catch {
      // config tab doesn't exist — use defaults
    }

    const ok = user.trim().toUpperCase() === validUser.toUpperCase() && password === validPass;
    const res = NextResponse.json({ ok });
    // Login do dono limpa qualquer cookie de demo/conta extra remanescente.
    if (ok) {
      res.cookies.set(DEMO_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
      res.cookies.set(USER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    }
    return res;
  } catch {
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}
