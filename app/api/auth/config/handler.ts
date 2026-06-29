import { NextRequest, NextResponse } from "next/server";
import { getDataStore } from "@/lib/data-store";

const TAB = "config";
const HEADERS = ["chave", "valor"];

type Row = Record<string, unknown>;

function val(row: Row): string {
  return String(row["valor"] ?? row["value"] ?? "").trim();
}
function key(row: Row): string {
  return String(row["chave"] ?? row["key"] ?? "").toLowerCase().trim();
}

/** GET — returns current user, masked password, and protected pages list. */
export async function GET() {
  try {
    const store = getDataStore();
    let rows: Row[] = [];
    try { rows = await store.fetchTab(TAB); } catch { /* tab missing */ }

    let usuario = "";
    let senhaSet = false;
    let protectedPages: string[] = [];
    // Interruptor mestre do login. Ausente = ON (preserva o comportamento atual).
    let loginEnabled = true;

    for (const r of rows) {
      const k = key(r);
      if (k === "usuario" || k === "user") usuario = val(r);
      if (k === "senha" || k === "password") senhaSet = !!val(r);
      if (k === "paginas_protegidas" || k === "protected_pages") {
        const raw = val(r);
        protectedPages = raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
      }
      if (k === "exigir_login" || k === "login_habilitado" || k === "require_login") {
        const v = val(r).toLowerCase();
        loginEnabled = !(v === "0" || v === "false" || v === "nao" || v === "não" || v === "off");
      }
    }

    return NextResponse.json({ usuario, senhaSet, protectedPages, loginEnabled });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST — update password and/or protected pages in the config tab. */
export async function POST(req: NextRequest) {
  try {
    const store = getDataStore();
    const body = await req.json();
    const { currentPassword, newPassword, protectedPages, loginEnabled } = body as {
      currentPassword?: string;
      newPassword?: string;
      protectedPages?: string[];
      loginEnabled?: boolean;
    };

    await store.ensureTab(TAB, HEADERS);
    let rows: Row[] = [];
    try { rows = await store.fetchTab(TAB); } catch { /* empty */ }

    // Build a key→value map from existing rows (preserve unknown keys).
    const configMap = new Map<string, string>();
    for (const r of rows) {
      const k = key(r);
      const v = val(r);
      if (k) configMap.set(k, v);
    }

    // Password change: validate current password first.
    if (newPassword !== undefined) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Senha atual obrigatória" }, { status: 400 });
      }
      const storedPass = configMap.get("senha") ?? configMap.get("password") ?? process.env.APP_PASSWORD ?? "1015";
      if (currentPassword !== storedPass) {
        return NextResponse.json({ error: "Senha atual incorreta" }, { status: 403 });
      }
      if (!newPassword || newPassword.length < 3) {
        return NextResponse.json({ error: "Nova senha deve ter pelo menos 3 caracteres" }, { status: 400 });
      }
      configMap.set("senha", newPassword);
    }

    // Protected pages update.
    if (protectedPages !== undefined) {
      if (protectedPages.length === 0) {
        configMap.delete("paginas_protegidas");
      } else {
        configMap.set("paginas_protegidas", protectedPages.join(","));
      }
    }

    // Interruptor mestre do login (página de login opcional).
    if (loginEnabled !== undefined) {
      configMap.set("exigir_login", loginEnabled ? "1" : "0");
    }

    // Write back to sheet.
    const outRows = [...configMap.entries()].map(([k, v]) => [k, v]);
    await store.writeTab(TAB, HEADERS, outRows);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
