"use client";

// Card "Exportar coleção para o Numista" (Configurações → Importação & Sync).
// Fluxo em 3 tempos, sem sustos:
//  1. DRY-RUN — casa as moedas distintas com o catálogo (lotes de 8, barra de
//     progresso), sem escrever NADA; relatório: confiáveis (KM# exato),
//     em dúvida (só país+ano) e sem casamento.
//  2. ENVIAR — só as CONFIÁVEIS: 1 exemplar guardado + repetidas marcadas
//     PARA TROCA (decisão do dono). Cada item criado fica registrado na aba
//     `numista_envio` da planilha.
//  3. DESFAZER — apaga no Numista tudo que NÓS criamos (pela aba), em lotes.

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Send, Trash2, SearchCheck } from "lucide-react";

interface Status { ativo: boolean; totalDistintas: number; totalExemplares: number; enviadas: number }
interface Casamento {
  idx: number; denominacao: string; pais: string; ano: string; krause: string;
  graduacao: string; qtd: number; typeId: number | null; issueId: number | null;
  titulo: string | null; url: string | null; confianca: "km" | "pais-ano" | "nenhuma";
}

export default function NumistaSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rodando, setRodando] = useState<"match" | "enviar" | "desfazer" | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [casamentos, setCasamentos] = useState<Casamento[] | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const carregarStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/moedas-colecao/numista/match");
      if (r.ok) setStatus(await r.json());
    } catch { /* offline */ }
  }, []);
  useEffect(() => { carregarStatus(); }, [carregarStatus]);

  const dryRun = async () => {
    if (!status) return;
    setRodando("match"); setProgresso(0); setCasamentos(null); setErros([]); setMsg(null);
    const todos: Casamento[] = [];
    try {
      for (let offset = 0; offset < status.totalDistintas; offset += 8) {
        const r = await fetch(`/api/moedas-colecao/numista/match?offset=${offset}&count=8`);
        if (!r.ok) throw new Error(`lote ${offset}: HTTP ${r.status}`);
        const d = (await r.json()) as { resultados: Casamento[] };
        todos.push(...d.resultados);
        setProgresso(Math.min(1, (offset + 8) / status.totalDistintas));
      }
      setCasamentos(todos);
      setMsg(null);
    } catch (e) {
      setErros([e instanceof Error ? e.message : "falha no dry-run"]);
      if (todos.length > 0) setCasamentos(todos); // parcial ainda informa
    } finally { setRodando(null); }
  };

  const confiaveis = (casamentos ?? []).filter((c) => c.confianca === "km");
  const duvidosas = (casamentos ?? []).filter((c) => c.confianca === "pais-ano");
  const semMatch = (casamentos ?? []).filter((c) => c.confianca === "nenhuma");
  const repetidas = confiaveis.reduce((s, c) => s + Math.max(0, c.qtd - 1), 0);

  const enviar = async () => {
    if (confiaveis.length === 0) return;
    if (!window.confirm(
      `Enviar ${confiaveis.length} moedas para a SUA coleção no Numista?\n` +
      `(${repetidas} repetidas serão marcadas "disponível para troca")\n\nDá para desfazer em lote depois.`,
    )) return;
    setRodando("enviar"); setProgresso(0); setErros([]); setMsg(null);
    let criados = 0;
    const falhas: string[] = [];
    try {
      for (let i = 0; i < confiaveis.length; i += 6) {
        const lote = confiaveis.slice(i, i + 6);
        const r = await fetch("/api/moedas-colecao/numista/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: lote }),
        });
        const d = (await r.json().catch(() => ({}))) as { criados?: number; erros?: string[]; error?: string };
        if (!r.ok) { falhas.push(d.error ?? `lote ${i}: HTTP ${r.status}`); break; }
        criados += d.criados ?? 0;
        if (d.erros?.length) falhas.push(...d.erros);
        setProgresso(Math.min(1, (i + 6) / confiaveis.length));
      }
      setMsg(`${criados} itens criados no Numista.`);
      setErros(falhas);
      await carregarStatus();
    } finally { setRodando(null); }
  };

  const desfazer = async () => {
    if (!status?.enviadas) return;
    if (!window.confirm(`Apagar do Numista os ${status.enviadas} itens que o app criou?`)) return;
    setRodando("desfazer"); setProgresso(0); setErros([]); setMsg(null);
    let removidos = 0;
    try {
      for (let guarda = 0; guarda < 40; guarda++) {
        const r = await fetch("/api/moedas-colecao/numista/desfazer", { method: "POST" });
        const d = (await r.json().catch(() => ({}))) as { removidos?: number; restantes?: number; falhas?: number; error?: string };
        if (!r.ok) { setErros([d.error ?? `HTTP ${r.status}`]); break; }
        removidos += d.removidos ?? 0;
        if (!d.restantes) break;
        if ((d.falhas ?? 0) > 0 && (d.removidos ?? 0) === 0) { setErros([`${d.restantes} itens não removidos — tentar de novo`]); break; }
        setProgresso(Math.min(1, removidos / Math.max(1, status.enviadas)));
      }
      setMsg(`${removidos} itens removidos do Numista.`);
      await carregarStatus();
    } finally { setRodando(null); }
  };

  const Lista = ({ titulo, itens, tom }: { titulo: string; itens: Casamento[]; tom: string }) => (
    itens.length === 0 ? null : (
      <details className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <summary className="cursor-pointer text-[11px] font-semibold" style={{ color: tom }}>{titulo} ({itens.length})</summary>
        <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto text-[11px] text-zinc-400">
          {itens.map((c) => (
            <li key={c.idx} className="flex items-center gap-1.5">
              <span className="truncate">{c.denominacao} · {c.ano} · {c.pais}{c.qtd > 1 ? ` ×${c.qtd}` : ""}{c.krause ? ` · ${c.krause}` : ""}</span>
              {c.url && (
                <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 text-amber-400/80 hover:text-amber-300">
                  <ExternalLink size={11} />
                </a>
              )}
              {c.confianca === "km" && c.issueId == null && <span className="shrink-0 text-[9px] text-zinc-600">(sem o ano no catálogo)</span>}
            </li>
          ))}
        </ul>
      </details>
    )
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Exporta a coleção para a sua conta no <span className="text-zinc-300">Numista</span> (via API, conta do dono
        da chave). Repetidas vão como <span className="text-amber-300">disponível para troca</span> (1 exemplar
        guardado + o excedente para troca). Nada é enviado sem o dry-run: primeiro o casamento com o catálogo,
        você confere, depois envia — e dá para desfazer em lote.
      </p>

      {status && (
        <p className="font-mono text-[11px] text-zinc-400">
          {status.ativo ? "chave OK" : "⚠️ NUMISTA_API_KEY ausente"} · {status.totalDistintas} moedas distintas ·{" "}
          {status.totalExemplares} exemplares{status.enviadas > 0 ? ` · ${status.enviadas} itens já enviados` : ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={dryRun}
          disabled={rodando !== null || !status?.ativo}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.4)", color: "#7dd3fc" }}
        >
          {rodando === "match" ? <Loader2 size={13} className="animate-spin" /> : <SearchCheck size={13} />}
          1. Conferir casamento (dry-run)
        </button>
        <button
          onClick={enviar}
          disabled={rodando !== null || confiaveis.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.4)", color: "#34d399" }}
        >
          {rodando === "enviar" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          2. Enviar {confiaveis.length > 0 ? `${confiaveis.length} confiáveis` : ""}
        </button>
        {(status?.enviadas ?? 0) > 0 && (
          <button
            onClick={desfazer}
            disabled={rodando !== null}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.35)", color: "#f87171" }}
          >
            {rodando === "desfazer" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Desfazer envio
          </button>
        )}
      </div>

      {rodando && (
        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(progresso * 100)}%`, background: "#38bdf8" }} />
        </div>
      )}

      {msg && <p className="text-[11px] font-semibold text-emerald-400">{msg}</p>}
      {erros.length > 0 && (
        <div className="rounded-xl p-2.5 text-[11px] text-red-300" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)" }}>
          {erros.slice(0, 6).map((e, i) => <p key={i}>{e}</p>)}
          {erros.length > 6 && <p>… +{erros.length - 6} erros</p>}
        </div>
      )}

      {casamentos && (
        <div className="space-y-1.5">
          <Lista titulo="✓ Confiáveis (KM# exato) — vão no envio" itens={confiaveis} tom="#34d399" />
          <Lista titulo="? Em dúvida (só país+ano) — ficam de fora, conferir na mão" itens={duvidosas} tom="#fbbf24" />
          <Lista titulo="✗ Sem casamento — não existem no envio" itens={semMatch} tom="#f87171" />
        </div>
      )}
    </div>
  );
}
