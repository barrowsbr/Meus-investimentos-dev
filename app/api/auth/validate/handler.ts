import { NextRequest, NextResponse } from "next/server";
import { fetchTab } from "@/lib/gsheets";

export async function POST(req: NextRequest) {
  try {
    const { user, password } = await req.json();
    if (!user || !password) {
      return NextResponse.json({ ok: false, error: "Campos obrigatórios" }, { status: 400 });
    }

    let validUser = "LBF";
    let validPass = process.env.APP_PASSWORD ?? "1015";

    try {
      const rows = await fetchTab("config");
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
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json({ ok: false, error: "Erro interno" }, { status: 500 });
  }
}
