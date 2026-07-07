"use client";

import { useEffect, useMemo, useState } from "react";
import { StickyNote, Loader2, Plus, Trash2, Search, Tag, Check, Bot } from "lucide-react";
import PageHeader from "@/components/PageHeader";

// Página de anotações gerais — reusa a API /api/notas (aba `ativos_notas`).
// Notas sem ativo usam a etiqueta GERAL; notas criadas no modal de ativo
// (NotesModal) aparecem aqui também, filtráveis pela etiqueta/ticker.
// Etiqueta IA = fila de tarefas para o agente (ver anotacoes.md no repo):
// o card ganha ✓ quando a tarefa é executada. Sem edição — só acrescentar.
const TAG_GERAL = "GERAL";
const TAG_IA = "IA";

interface Nota {
  id: string;
  ticker: string;
  data: string;
  texto: string;
  feito?: string;
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

export default function AnotacoesPage() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [texto, setTexto] = useState("");
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [filtroTag, setFiltroTag] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/notas");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Falha ao carregar");
        if (alive) setNotas(Array.isArray(json) ? json : []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro ao carregar anotações");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of notas) {
      const t = n.ticker || TAG_GERAL;
      count.set(t, (count.get(t) ?? 0) + 1);
    }
    // GERAL primeiro, depois por quantidade
    return [...count.entries()].sort((a, b) => {
      if (a[0] === TAG_GERAL) return -1;
      if (b[0] === TAG_GERAL) return 1;
      return b[1] - a[1];
    });
  }, [notas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return notas.filter((n) => {
      if (filtroTag && (n.ticker || TAG_GERAL) !== filtroTag) return false;
      if (q && !n.texto.toLowerCase().includes(q) && !n.ticker.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notas, filtroTag, busca]);

  async function addNota() {
    const t = texto.trim();
    if (!t || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: tag.trim() || TAG_GERAL, texto: t }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao salvar");
      setTexto("");
      setTag("");
      setNotas((prev) => [json.nota as Nota, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const [togglingId, setTogglingId] = useState<string | null>(null);
  async function toggleFeito(n: Nota) {
    if (togglingId) return;
    setTogglingId(n.id);
    setError(null);
    try {
      const res = await fetch("/api/notas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: n.id, feito: !n.feito }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Falha ao atualizar");
      setNotas((prev) => prev.map((x) => (x.id === n.id ? { ...x, feito: json.nota?.feito ?? "" } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setTogglingId(null);
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
      setNotas((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao apagar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Anotações"
        description="Comentários e lembretes — permanentes na planilha"
      />

      {/* Composer */}
      <div
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); addNota(); }
          }}
          placeholder="Escreva um lembrete, ideia, tese…  (Ctrl/⌘+Enter para salvar)"
          rows={3}
          className="w-full resize-y rounded-lg px-3 py-2.5 text-sm outline-none"
          style={{
            background: "var(--input, rgba(255,255,255,0.03))",
            border: "1px solid var(--line)",
            color: "var(--text)",
            minHeight: 72,
          }}
        />
        <div className="flex items-center gap-2 mt-2">
          <div
            className="flex items-center gap-1.5 rounded-lg px-2.5"
            style={{ background: "var(--input, rgba(255,255,255,0.03))", border: "1px solid var(--line)" }}
          >
            <Tag size={12} style={{ color: "var(--muted)" }} />
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              placeholder={TAG_GERAL}
              className="w-24 bg-transparent py-2 text-xs font-mono outline-none uppercase"
              style={{ color: "var(--text)" }}
            />
          </div>
          <button
            onClick={() => setTag(tag === TAG_IA ? "" : TAG_IA)}
            title="Tarefa para o agente IA executar (fluxo anotacoes.md)"
            className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2.5 py-2 rounded-lg transition-colors"
            style={{
              background: tag === TAG_IA ? "var(--accent-wash, rgba(232,163,61,.12))" : "transparent",
              border: `1px solid ${tag === TAG_IA ? "var(--accent)" : "var(--line)"}`,
              color: tag === TAG_IA ? "var(--accent)" : "var(--muted)",
            }}
          >
            <Bot size={12} /> {TAG_IA}
          </button>
          <span className="text-[11px] flex-1" style={{ color: "var(--muted)" }}>
            Etiqueta opcional — vazio salva como {TAG_GERAL}; {TAG_IA} = tarefa p/ o agente
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

      {/* Busca + filtro por etiqueta */}
      {notas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: "var(--input, rgba(255,255,255,0.03))", border: "1px solid var(--line)" }}
          >
            <Search size={13} style={{ color: "var(--muted)" }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar…"
              className="w-36 bg-transparent text-xs outline-none"
              style={{ color: "var(--text)" }}
            />
          </div>
          {tags.map(([t, count]) => {
            const on = filtroTag === t;
            return (
              <button
                key={t}
                onClick={() => setFiltroTag(on ? null : t)}
                className="text-[11px] font-mono px-2.5 py-1.5 rounded-lg transition-colors"
                style={{
                  background: on ? "var(--accent-wash, rgba(232,163,61,.12))" : "transparent",
                  border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  color: on ? "var(--accent)" : "var(--muted)",
                }}
              >
                {t} <span style={{ opacity: 0.6 }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: "var(--muted)" }}>
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <StickyNote size={28} style={{ color: "var(--faint, #3D4E5F)" }} />
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {notas.length === 0 ? "Nenhuma anotação ainda." : "Nada encontrado com esse filtro."}
          </span>
          {notas.length === 0 && (
            <span className="text-[11px]" style={{ color: "var(--faint, #3D4E5F)" }}>
              Use o campo acima para registrar lembretes, ideias e teses.
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visiveis.map((n) => {
            const isIA = (n.ticker || "") === TAG_IA;
            const feito = Boolean(n.feito);
            return (
              <div
                key={n.id}
                className="rounded-xl px-4 py-3"
                style={{
                  background: "var(--panel)",
                  border: `1px solid ${feito ? "rgba(63,185,80,0.35)" : "var(--line)"}`,
                  opacity: feito ? 0.75 : 1,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--accent-wash, rgba(232,163,61,.12))",
                        color: "var(--accent)",
                      }}
                    >
                      {isIA && <Bot size={10} />}
                      {n.ticker || TAG_GERAL}
                    </span>
                    {feito && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(63,185,80,0.14)", color: "var(--pos, #3FB950)" }}
                        title={`Concluído em ${formatStamp(n.feito!)}`}
                      >
                        <Check size={10} /> FEITO
                      </span>
                    )}
                    <span className="text-[10px] font-mono tracking-wide" style={{ color: "var(--muted)" }}>
                      {formatStamp(n.data)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleFeito(n)}
                      disabled={togglingId === n.id}
                      aria-label={feito ? "Desmarcar conclusão" : "Marcar como feito"}
                      title={feito ? "Desmarcar conclusão" : "Marcar como feito"}
                      className="p-1 rounded-md transition-all opacity-60 hover:opacity-100 disabled:opacity-30"
                      style={{ color: feito ? "var(--pos, #3FB950)" : "var(--muted)" }}
                    >
                      {togglingId === n.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    </button>
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
                </div>
                <p
                  className="text-sm mt-1.5 whitespace-pre-wrap break-words"
                  style={{ color: "var(--text)", textDecoration: feito ? "line-through" : "none", textDecorationColor: "rgba(63,185,80,0.5)" }}
                >
                  {n.texto}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
