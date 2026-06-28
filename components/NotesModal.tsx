"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Trash2, StickyNote, Loader2, Plus } from "lucide-react";

interface Nota {
  id: string;
  ticker: string;
  data: string;
  texto: string;
}

function formatStamp(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function NotesModal({
  ticker,
  onClose,
  onCountChange,
}: {
  ticker: string;
  onClose: () => void;
  onCountChange?: (ticker: string, count: number) => void;
}) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // onCountChange via ref: se entrasse nas deps de `load`, um pai que recria a
  // função a cada render dispararia o efeito em loop infinito (travava a UI).
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => { onCountChangeRef.current = onCountChange; }, [onCountChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notas?ticker=${encodeURIComponent(ticker)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar");
      const list: Nota[] = Array.isArray(json) ? json : [];
      setNotas(list);
      onCountChangeRef.current?.(ticker, list.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar anotações");
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { load(); }, [load]);

  // Portal para o body: o overlay `fixed` precisa cobrir a viewport inteira
  // (dentro do <main>, que tem transform, ele se prenderia só à 1ª tela).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Fecha com ESC; trava o scroll do body enquanto aberto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  async function addNota() {
    const t = texto.trim();
    if (!t || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, texto: t }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao salvar");
      setTexto("");
      const next = [json.nota as Nota, ...notas];
      setNotas(next);
      onCountChangeRef.current?.(ticker, next.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function removeNota(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch("/api/notas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao apagar");
      const next = notas.filter((n) => n.id !== id);
      setNotas(next);
      onCountChangeRef.current?.(ticker, next.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao apagar");
    } finally {
      setDeletingId(null);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          maxHeight: "88vh",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{ background: "var(--accent-wash, rgba(232,163,61,.12))", color: "var(--accent)" }}
            >
              <StickyNote size={16} />
            </span>
            <div className="min-w-0">
              <div className="font-bold text-sm" style={{ color: "var(--text)" }}>
                Anotações · {ticker}
              </div>
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                Rascunhos vinculados ao ativo
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "var(--muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Composer */}
        <div className="px-5 pt-4 pb-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addNota(); }
            }}
            placeholder={`Escreva um rascunho sobre ${ticker}…  (Ctrl/⌘+Enter para salvar)`}
            rows={3}
            className="w-full resize-y rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
            style={{
              background: "var(--input, rgba(255,255,255,0.03))",
              border: "1px solid var(--line)",
              color: "var(--text)",
              minHeight: 72,
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px]" style={{ color: "var(--muted)" }}>
              {texto.length > 0 ? `${texto.length} caracteres` : "Permanente na planilha"}
            </span>
            <button
              onClick={addNota}
              disabled={!texto.trim() || saving}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#0a0a0a" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Adicionar
            </button>
          </div>
          {error && (
            <div className="mt-2 text-[11px] px-2.5 py-1.5 rounded-md" style={{ background: "rgba(240,80,74,0.12)", color: "#F0504A" }}>
              {error}
            </div>
          )}
        </div>

        {/* Lista de notas */}
        <div className="flex-1 overflow-y-auto px-5 py-3" style={{ overscrollBehavior: "contain" }}>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: "var(--muted)" }}>
              <Loader2 size={16} className="animate-spin" /> Carregando…
            </div>
          ) : notas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <StickyNote size={26} style={{ color: "var(--faint, #3D4E5F)" }} />
              <span className="text-sm" style={{ color: "var(--muted)" }}>Nenhuma anotação ainda.</span>
              <span className="text-[11px]" style={{ color: "var(--faint, #3D4E5F)" }}>
                Use o campo acima para registrar sua tese, alvo de preço, lembrete…
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {notas.map((n) => (
                <div
                  key={n.id}
                  className="group rounded-lg px-3.5 py-2.5 transition-colors"
                  style={{ background: "var(--input, rgba(255,255,255,0.03))", border: "1px solid var(--line)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[10px] font-mono tracking-wide" style={{ color: "var(--muted)" }}>
                      {formatStamp(n.data)}
                    </span>
                    <button
                      onClick={() => removeNota(n.id)}
                      disabled={deletingId === n.id}
                      aria-label="Apagar anotação"
                      className="p-1 rounded-md transition-all opacity-60 hover:opacity-100 disabled:opacity-30"
                      style={{ color: "#F0504A" }}
                    >
                      {deletingId === n.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words" style={{ color: "var(--text)" }}>
                    {n.texto}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
