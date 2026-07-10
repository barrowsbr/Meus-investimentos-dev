import { NextResponse } from "next/server";
import { API_REGISTRY, getApiDef, type ApiDef } from "@/lib/api-registry";

// ── Diagnóstico das APIs externas (health-check) ─────────────────────────────
// GET /api/diag/apis            → metadados + estado da chave (SEM valores).
// GET /api/diag/apis?api=<key>  → roda a probe leve da API e devolve {ok,ms,detail}.
//
// Fonte única: lib/api-registry.ts. Toda API nova entra lá e aparece aqui.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type KeyState = "livre" | "configurada" | "opcional" | "incompleta";

function keyState(def: ApiDef): KeyState {
  if (def.envVars.length === 0) return "livre";
  const requiredMissing = def.envVars.filter((v) => v.required && !process.env[v.name]);
  if (requiredMissing.length > 0) return "incompleta";
  const anyRequired = def.envVars.some((v) => v.required);
  if (anyRequired) return "configurada"; // todas as obrigatórias presentes
  return def.envVars.some((v) => process.env[v.name]) ? "configurada" : "opcional";
}

function meta(def: ApiDef) {
  return {
    key: def.key,
    name: def.name,
    category: def.category,
    host: def.host,
    purpose: def.purpose,
    docs: def.docs,
    keyState: keyState(def),
    envVars: def.envVars.map((v) => ({ name: v.name, required: v.required, present: !!process.env[v.name] })),
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout após ${ms / 1000}s`)), ms)),
  ]);
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("api");

  // Sem ?api → lista (nenhuma chamada de rede, nenhum segredo exposto).
  if (!key) {
    return NextResponse.json(
      { apis: API_REGISTRY.map(meta), count: API_REGISTRY.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const def = getApiDef(key);
  if (!def) return NextResponse.json({ error: `API desconhecida: ${key}` }, { status: 404 });

  const started = Date.now();
  try {
    const result = await withTimeout(def.probe(), 12000);
    return NextResponse.json(
      { key, ...result, ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { key, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
