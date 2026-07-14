"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MoedasCard (Configurações) — upload do CSV exportado pelo CoinSnap.
// O arquivo SOBRESCREVE a aba `moedas_colecao` (com backup automático antes)
// e a página /moedas atualiza na hora.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

export default function MoedasCard() {
  const [status, setStatus] = useState<{ exemplares: number; unicas: number; paises: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const carregarStatus = () => {
    fetch("/api/moedas")
      .then((r) => r.json())
      .then((d) => { if (d.stats) setStatus(d.stats); })
      .catch(() => {});
  };
  useEffect(carregarStatus, []);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setEnviando(true);
    setMsg(null);
    try {
      const csv = await f.text();
      const res = await fetch("/api/moedas/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || `HTTP ${res.status}`);
      setMsg({ ok: true, texto: `${d.moedas} moedas importadas — a página Moedas já está atualizada.` });
      carregarStatus();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Falha no upload" });
    } finally {
      setEnviando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-400">
        Suba o CSV exportado pelo <strong className="text-zinc-300">CoinSnap</strong> (Coleção → Exportar → CSV).
        O arquivo substitui a coleção inteira na aba <code className="rounded bg-white/5 px-1">moedas_colecao</code> —
        com backup automático da versão anterior — e a página <Link href="/moedas" className="text-amber-400 underline underline-offset-2">Moedas</Link> atualiza na hora.
      </p>

      {status && status.exemplares > 0 && (
        <p className="text-[11px] text-zinc-500">
          Coleção atual: <strong className="text-zinc-300">{status.exemplares} exemplares</strong> ({status.unicas} distintas, {status.paises} países).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${enviando ? "opacity-50" : "hover:bg-amber-500/20"}`}
          style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "#fbbf24" }}
        >
          {enviando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {enviando ? "Importando…" : "Subir CSV do CoinSnap"}
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" disabled={enviando} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <Link href="/moedas" className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-zinc-300 hover:bg-white/10" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
          Abrir a coleção <ExternalLink size={11} />
        </Link>
      </div>

      {msg && (
        <p className={`flex items-start gap-1.5 text-xs ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>
          {msg.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
          {msg.texto}
        </p>
      )}
    </div>
  );
}
