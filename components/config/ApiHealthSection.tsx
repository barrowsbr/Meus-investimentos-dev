"use client";

// Extraído de app/configuracoes/page.tsx — seção "APIs & Integrações (Diagnóstico)"
// (catálogo do lib/api-registry.ts com teste de saúde por serviço).

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, Play } from "lucide-react";

// ── APIs & Integrações (health-check) ───────────────────────────────────────

interface ApiMeta {
  key: string;
  name: string;
  category: string;
  host: string;
  purpose: string;
  keyState: "livre" | "configurada" | "opcional" | "incompleta";
  envVars: { name: string; required: boolean; present: boolean }[];
}
interface ApiResult { ok: boolean; ms: number; detail: string }

const KEY_CHIP: Record<ApiMeta["keyState"], { label: string; cls: string } | null> = {
  configurada: { label: "chave ✓", cls: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25" },
  opcional: { label: "opcional", cls: "bg-zinc-500/10 text-zinc-400 border-zinc-600/30" },
  incompleta: { label: "config incompleta", cls: "bg-red-500/12 text-red-300 border-red-500/25" },
  livre: { label: "público", cls: "bg-sky-500/10 text-sky-300/80 border-sky-500/20" },
};

function StatusDot({ state }: { state: "idle" | "loading" | "ok" | "fail" }) {
  if (state === "loading") return <Loader2 size={13} className="animate-spin text-zinc-400 shrink-0" />;
  const c = state === "ok" ? "#34d399" : state === "fail" ? "#f87171" : "#52525b";
  return <span className="shrink-0 rounded-full" style={{ width: 9, height: 9, background: c, boxShadow: state !== "idle" ? `0 0 7px ${c}88` : undefined }} />;
}

export default function ApiHealthSection() {
  const [apis, setApis] = useState<ApiMeta[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ApiResult>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testingAll, setTestingAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/diag/apis")
      .then(r => r.json())
      .then(d => { if (alive) { if (Array.isArray(d?.apis)) setApis(d.apis); else setErr("Falha ao carregar a lista de APIs."); } })
      .catch(() => { if (alive) setErr("Falha ao carregar a lista de APIs."); });
    return () => { alive = false; };
  }, []);

  const runOne = useCallback(async (key: string) => {
    setTesting(t => ({ ...t, [key]: true }));
    try {
      const r = await fetch(`/api/diag/apis?api=${encodeURIComponent(key)}`).then(r => r.json());
      setResults(res => ({ ...res, [key]: { ok: !!r.ok, ms: r.ms ?? 0, detail: r.detail ?? "" } }));
    } catch {
      setResults(res => ({ ...res, [key]: { ok: false, ms: 0, detail: "erro de rede" } }));
    } finally {
      setTesting(t => ({ ...t, [key]: false }));
    }
  }, []);

  const runAll = useCallback(async () => {
    if (!apis) return;
    setTestingAll(true);
    const queue = [...apis];
    const worker = async () => { while (queue.length) { const a = queue.shift(); if (a) await runOne(a.key); } };
    await Promise.all([worker(), worker(), worker(), worker()]); // pool de 4
    setTestingAll(false);
  }, [apis, runOne]);

  // Agrupa por categoria preservando a ordem do registro.
  const grupos = (() => {
    if (!apis) return [] as { categoria: string; itens: ApiMeta[] }[];
    const ordem: string[] = [];
    const mapa = new Map<string, ApiMeta[]>();
    for (const a of apis) {
      if (!mapa.has(a.category)) { mapa.set(a.category, []); ordem.push(a.category); }
      mapa.get(a.category)!.push(a);
    }
    return ordem.map(categoria => ({ categoria, itens: mapa.get(categoria)! }));
  })();

  const testadas = Object.keys(results).length;
  const okCount = Object.values(results).filter(r => r.ok).length;
  const falhaCount = testadas - okCount;

  if (err) return <p className="text-xs text-red-400">{err}</p>;
  if (!apis) return <div className="flex h-24 items-center justify-center"><Loader2 size={18} className="animate-spin text-zinc-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Barra de resumo + testar todas */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-zinc-400"><span className="font-semibold text-zinc-200">{apis.length}</span> integrações</span>
          {testadas > 0 && (
            <>
              <span className="flex items-center gap-1.5 text-emerald-300"><StatusDot state="ok" />{okCount} ok</span>
              {falhaCount > 0 && <span className="flex items-center gap-1.5 text-red-300"><StatusDot state="fail" />{falhaCount} falha</span>}
            </>
          )}
        </div>
        <button
          onClick={runAll}
          disabled={testingAll}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/16 disabled:opacity-50"
        >
          {testingAll ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {testingAll ? "Testando…" : "Testar todas"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Cada teste faz uma chamada leve à API (no servidor). Fonte única em <code className="rounded bg-zinc-800/60 px-1 text-[10px] text-zinc-400">lib/api-registry.ts</code> —
        toda API nova entra lá e aparece aqui automaticamente.
      </p>

      {grupos.map(({ categoria, itens }) => (
        <div key={categoria}>
          <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800/70" />
            {categoria}
            <span className="text-zinc-600">({itens.length})</span>
            <span className="h-px flex-1 bg-zinc-800/70" />
          </h3>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {itens.map(a => {
              const res = results[a.key];
              const isTesting = testing[a.key];
              const state = isTesting ? "loading" : res ? (res.ok ? "ok" : "fail") : "idle";
              const chip = KEY_CHIP[a.keyState];
              return (
                <div key={a.key} className="rounded-lg border border-zinc-800/60 bg-zinc-900/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <StatusDot state={state as "idle" | "loading" | "ok" | "fail"} />
                        <span className="truncate text-sm font-semibold text-zinc-200">{a.name}</span>
                        {chip && (
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${chip.cls}`}>{chip.label}</span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-500">{a.purpose}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">{a.host}</p>
                    </div>
                    <button
                      onClick={() => runOne(a.key)}
                      disabled={isTesting}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700/60 bg-zinc-800/40 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:bg-zinc-700/50 disabled:opacity-50"
                    >
                      {isTesting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Testar
                    </button>
                  </div>
                  {res && (
                    <div className={`mt-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${res.ok ? "bg-emerald-500/[0.06] text-emerald-200/90" : "bg-red-500/[0.06] text-red-200/90"}`}>
                      {res.ok ? <CheckCircle2 size={12} className="shrink-0 text-emerald-400" /> : <XCircle size={12} className="shrink-0 text-red-400" />}
                      <span className="min-w-0 flex-1 truncate">{res.detail || (res.ok ? "ok" : "falhou")}</span>
                      {res.ms > 0 && <span className="shrink-0 font-mono text-[10px] text-zinc-500">{res.ms}ms</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
