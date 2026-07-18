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
import { ExternalLink, Loader2, Send, Trash2, SearchCheck, RotateCcw } from "lucide-react";

interface Status { ativo: boolean; totalDistintas: number; totalExemplares: number; enviadas: number }
interface Casamento {
  idx: number; denominacao: string; pais: string; ano: string; krause: string;
  graduacao: string; qtd: number; typeId: number | null; issueId: number | null;
  titulo: string | null; url: string | null; confianca: "km" | "pais-ano" | "nenhuma";
  anoSuspeito?: boolean; faixaAnos?: string | null;
}

export default function NumistaSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [rodando, setRodando] = useState<"match" | "enviar" | "desfazer" | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [casamentos, setCasamentos] = useState<Casamento[] | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [incluirDuvida, setIncluirDuvida] = useState(false);

  const carregarStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/moedas-colecao/numista/match");
      if (r.ok) setStatus(await r.json());
    } catch { /* offline */ }
  }, []);
  useEffect(() => { carregarStatus(); }, [carregarStatus]);

  // Roda uma lista de índices em lotes, honrando `pendentes` (parciais por
  // orçamento de tempo do servidor) e parando com aviso se a cota da API
  // do Numista estourar (429) — melhor parar claro do que "não carregar".
  const rodarIndices = async (idxs: number[], aoReceber: (c: Casamento[]) => void): Promise<"ok" | "cota"> => {
    let fila = [...idxs];
    let feitos = 0;
    const totalAlvo = fila.length;
    while (fila.length > 0) {
      const lote = fila.slice(0, 8);
      fila = fila.slice(8);
      const r = await fetch(`/api/moedas-colecao/numista/match?idxs=${lote.join(",")}`);
      if (!r.ok) throw new Error(`lote: HTTP ${r.status}`);
      const d = (await r.json()) as { resultados?: Casamento[]; pendentes?: number[]; rateLimit?: boolean };
      const cs = d.resultados ?? [];
      if (cs.length === 0 && !d.pendentes?.length) throw new Error("resposta sem resultados — atualize a página (deploy novo?)");
      aoReceber(cs);
      feitos += cs.length;
      if (d.pendentes?.length) fila = [...d.pendentes, ...fila];
      setProgresso(Math.min(1, feitos / Math.max(1, totalAlvo)));
      if (d.rateLimit) return "cota";
      await new Promise((res) => setTimeout(res, 350)); // respiro anti rate-limit
    }
    return "ok";
  };

  const dryRun = async () => {
    if (!status) return;
    setRodando("match"); setProgresso(0); setCasamentos(null); setErros([]); setMsg(null);
    const todos = new Map<number, Casamento>();
    try {
      const idxs = Array.from({ length: status.totalDistintas }, (_, i) => i);
      const fim = await rodarIndices(idxs, (cs) => { for (const c of cs) todos.set(c.idx, c); });
      setCasamentos([...todos.values()].sort((a, b) => a.idx - b.idx));
      if (fim === "cota") {
        setErros(["Cota diária da API do Numista atingida — o resultado é PARCIAL. Volte mais tarde e use \"Recasar falhas\" para completar sem repetir os acertos."]);
      }
    } catch (e) {
      setErros([e instanceof Error ? e.message : "falha no dry-run"]);
      if (todos.size > 0) setCasamentos([...todos.values()].sort((a, b) => a.idx - b.idx));
    } finally { setRodando(null); }
  };

  const confiaveis = (casamentos ?? []).filter((c) => c.confianca === "km");
  const duvidosas = (casamentos ?? []).filter((c) => c.confianca === "pais-ano");
  const semMatch = (casamentos ?? []).filter((c) => c.confianca === "nenhuma");
  const paraEnvio = incluirDuvida ? [...confiaveis, ...duvidosas] : confiaveis;
  const repetidas = paraEnvio.reduce((s, c) => s + Math.max(0, c.qtd - 1), 0);

  // Refaz SÓ as que não casaram (falhas costumam ser rate-limit do Numista —
  // com o backoff, a segunda passada recupera a maioria).
  const recasarFalhas = async () => {
    if (semMatch.length === 0 || !casamentos) return;
    setRodando("match"); setProgresso(0); setErros([]); setMsg(null);
    const mapa = new Map(casamentos.map((c) => [c.idx, c]));
    const antes = casamentos.filter((c) => c.confianca !== "nenhuma").length;
    try {
      const fim = await rodarIndices(semMatch.map((c) => c.idx), (cs) => { for (const c of cs) mapa.set(c.idx, c); });
      const novo = [...mapa.values()].sort((a, b) => a.idx - b.idx);
      setCasamentos(novo);
      setMsg(`${novo.filter((c) => c.confianca !== "nenhuma").length - antes} recuperadas no recasamento.`);
      if (fim === "cota") setErros(["Cota da API do Numista atingida no meio — recasamento parcial; tente de novo mais tarde."]);
    } catch (e) {
      setErros([e instanceof Error ? e.message : "falha no recasamento"]);
    } finally { setRodando(null); }
  };

  const enviar = async () => {
    if (paraEnvio.length === 0) return;
    if (!window.confirm(
      `Enviar ${paraEnvio.length} moedas para a SUA coleção no Numista?\n` +
      `(${confiaveis.length} confiáveis${incluirDuvida ? ` + ${duvidosas.length} em dúvida` : ""} · ` +
      `${repetidas} repetidas marcadas "disponível para troca")\n\nDá para desfazer em lote depois.`,
    )) return;
    setRodando("enviar"); setProgresso(0); setErros([]); setMsg(null);
    let criados = 0;
    const falhas: string[] = [];
    try {
      for (let i = 0; i < paraEnvio.length; i += 6) {
        const lote = paraEnvio.slice(i, i + 6);
        const r = await fetch("/api/moedas-colecao/numista/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: lote }),
        });
        const d = (await r.json().catch(() => ({}))) as { criados?: number; erros?: string[]; error?: string };
        if (!r.ok) { falhas.push(d.error ?? `lote ${i}: HTTP ${r.status}`); break; }
        criados += d.criados ?? 0;
        if (d.erros?.length) falhas.push(...d.erros);
        setProgresso(Math.min(1, (i + 6) / paraEnvio.length));
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
        {semMatch.length > 0 && (
          <button
            onClick={recasarFalhas}
            disabled={rodando !== null}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}
          >
            {rodando === "match" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Recasar {semMatch.length} falhas
          </button>
        )}
        <button
          onClick={enviar}
          disabled={rodando !== null || paraEnvio.length === 0}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.4)", color: "#34d399" }}
        >
          {rodando === "enviar" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          2. Enviar {paraEnvio.length > 0 ? `${paraEnvio.length} moedas` : ""}
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
          {duvidosas.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
              <input type="checkbox" checked={incluirDuvida} onChange={(e) => setIncluirDuvida(e.target.checked)} className="accent-amber-400" />
              Incluir as {duvidosas.length} "em dúvida" no envio (confira algumas pelos links antes)
            </label>
          )}
          <Lista titulo="✓ Confiáveis (KM# exato) — vão no envio" itens={confiaveis} tom="#34d399" />
          {(() => {
            const suspeitas = confiaveis.filter((c) => c.anoSuspeito);
            return suspeitas.length === 0 ? null : (
              <details className="rounded-xl px-3 py-2" style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.3)" }}>
                <summary className="cursor-pointer text-[11px] font-semibold text-amber-300">
                  ⚠ Ano suspeito ({suspeitas.length}) — a moeda é essa, mas a DATA da ficha não existe no catálogo (provável erro de leitura do CoinSnap)
                </summary>
                <ul className="mt-1.5 max-h-48 space-y-1 overflow-y-auto text-[11px] text-zinc-400">
                  {suspeitas.map((c) => (
                    <li key={c.idx} className="flex items-center gap-1.5">
                      <span className="truncate">
                        {c.denominacao} · {c.pais}{c.krause ? ` · ${c.krause}` : ""} — sua ficha diz <span className="text-amber-300">{c.ano}</span>, o tipo existe em <span className="text-zinc-200">{c.faixaAnos}</span>
                      </span>
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 text-amber-400/80"><ExternalLink size={11} /></a>}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  Elas vão no envio mesmo assim (o TIPO está certo — só sem amarrar o ano). Para corrigir de vez:
                  ajuste a data no CoinSnap e me mande o CSV novo — a atualização regenera tudo.
                </p>
              </details>
            );
          })()}
          <Lista titulo={incluirDuvida ? "? Em dúvida (só país+ano) — INCLUÍDAS no envio" : "? Em dúvida (só país+ano) — ficam de fora, conferir na mão"} itens={duvidosas} tom="#fbbf24" />
          <Lista titulo="✗ Sem casamento — ficam de fora (use o Recasar)" itens={semMatch} tom="#f87171" />
        </div>
      )}
    </div>
  );
}
