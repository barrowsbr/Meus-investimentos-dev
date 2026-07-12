"use client";

// Editor da planilha (gdados) DENTRO do app — Configurações → "Planilha".
// Ver/buscar/ordenar/editar/apagar/adicionar linhas de qualquer aba sem abrir
// o Google. Toda alteração passa pelo backend (/api/config/planilha), que
// confere a linha antes de gravar (lock otimista) e faz backup automático
// (bkp_<aba>) antes de qualquer sobrescrita.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, HeartPulse, History, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, X } from "lucide-react";

interface Grid { headers: string[]; rows: string[][] }
type Msg = { ok: boolean; text: string } | null;

const PAGE = 100;

// ── Saúde & Backup (CSVs fora da planilha) ────────────────────────────────────

interface AbaSaude { tab: string; linhas: number; colunas: number; erros: string[]; avisos: string[] }
interface Relatorio { geradoEm: string; totalErros: number; totalAvisos: number; abas: AbaSaude[] }

const BACKUPS_BRANCH_URL = "https://github.com/barrowsbr/meus-investimentos-dev/tree/backups";
const BACKUP_WORKFLOW_URL = "https://github.com/barrowsbr/meus-investimentos-dev/actions/workflows/backup.yml";

function SaudeBackup({ tab, soLeitura, onAfterRollback }: { tab: string; soLeitura: boolean; onAfterRollback: () => void }) {
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [testando, setTestando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csvPendente, setCsvPendente] = useState<{ nome: string; texto: string; linhas: number } | null>(null);

  const testar = async () => {
    setTestando(true); setMsg(null); setRel(null);
    try {
      const r = await fetch("/api/config/planilha/saude");
      const d = await r.json();
      if (d?.error) setMsg({ ok: false, text: d.error });
      else setRel(d);
    } catch { setMsg({ ok: false, text: "Falha ao rodar o teste" }); }
    finally { setTestando(false); }
  };

  const escolherCsv = async (f: File | null) => {
    if (!f) return;
    const texto = await f.text();
    const linhas = Math.max(0, texto.split(/\r?\n/).filter((l) => l.trim() !== "").length - 1);
    setCsvPendente({ nome: f.name, texto, linhas });
    setMsg(null);
  };

  const restaurarCsv = async () => {
    if (!csvPendente) return;
    setRestaurando(true); setMsg(null);
    try {
      // Cópia de segurança local do estado ATUAL antes de sobrescrever.
      window.open(`/api/config/planilha/backup?csv=${encodeURIComponent(tab)}`, "_blank");
      const r = await fetch("/api/config/planilha/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore-csv", tab, csv: csvPendente.texto }),
      });
      const d = await r.json();
      if (!r.ok || d?.error) setMsg({ ok: false, text: d?.error ?? `Erro ${r.status}` });
      else { setMsg({ ok: true, text: `"${tab}" restaurada de ${csvPendente.nome} (${d.linhas} linhas) ✓ — o estado anterior foi baixado como CSV` }); onAfterRollback(); }
    } catch { setMsg({ ok: false, text: "Falha na restauração" }); }
    finally { setRestaurando(false); setCsvPendente(null); }
  };

  const [compactando, setCompactando] = useState(false);
  const compactarTwr = async () => {
    setCompactando(true); setMsg(null);
    try {
      const r = await fetch("/api/config/planilha/saude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "compactar-twr" }) });
      const d = await r.json();
      if (d?.error) setMsg({ ok: false, text: d.error });
      else { setMsg({ ok: true, text: `twr_mensal compactada: ${d.antes} → ${d.depois} linhas (${d.removidas} removidas, com backup) ✓` }); testar(); }
    } catch { setMsg({ ok: false, text: "Falha na compactação" }); }
    finally { setCompactando(false); }
  };

  const comProblema = rel?.abas.filter((a) => a.erros.length > 0 || a.avisos.length > 0) ?? [];
  const saudaveis = rel ? rel.abas.length - comProblema.length : 0;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          <HeartPulse size={13} className="text-emerald-400" /> Saúde &amp; Backup (CSV)
        </span>
        <a href={BACKUPS_BRANCH_URL} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-cyan-400/80 hover:text-cyan-300">
          ver CSVs no GitHub ↗
        </a>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button onClick={testar} disabled={testando} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-300 transition-colors">
            {testando ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />} Testar saúde
          </button>
          <a
            href={`/api/config/planilha/backup?csv=${encodeURIComponent(tab)}`}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-300 transition-colors"
            title={`Baixa a aba "${tab}" como CSV`}
          >
            <Download size={11} /> Baixar CSV da aba
          </a>
          {csvPendente ? (
            <button onClick={restaurarCsv} disabled={restaurando} className="inline-flex items-center gap-1 rounded-lg border border-red-700/60 bg-red-900/30 px-2 py-1 text-[11px] font-bold text-red-300">
              {restaurando ? <Loader2 size={11} className="animate-spin" /> : <History size={11} />} Sobrescrever &ldquo;{tab}&rdquo; com {csvPendente.nome} ({csvPendente.linhas} linhas)?
            </button>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!tab || soLeitura}
              title={soLeitura ? "Selecione uma aba de dados para restaurar" : `Restaura "${tab}" a partir de um arquivo CSV (do GitHub ou baixado antes)`}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-amber-500/60 hover:text-amber-300 transition-colors"
            >
              <History size={11} /> Restaurar CSV…
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { escolherCsv(e.target.files?.[0] ?? null); e.target.value = ""; }}
          />
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 leading-relaxed">
        Backup DIÁRIO fora da planilha: uma <a href={BACKUP_WORKFLOW_URL} target="_blank" rel="noreferrer" className="text-cyan-400/80 hover:text-cyan-300">GitHub Action</a> exporta
        todas as abas como CSV e sobrescreve os arquivos na branch <span className="font-mono">backups</span> do repositório (versões antigas ficam no
        histórico de commits). Para restaurar: baixe o CSV lá (ou use um baixado aqui) e clique em &ldquo;Restaurar CSV…&rdquo; com a aba selecionada —
        antes de sobrescrever, o estado atual é baixado como CSV automaticamente.
      </p>

      {rel && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-mono">
            {rel.totalErros === 0 && rel.totalAvisos === 0
              ? <span className="text-emerald-400 font-bold">✓ Planilha saudável — {rel.abas.length} abas verificadas, nenhum problema</span>
              : <>
                  <span className={rel.totalErros > 0 ? "text-red-400 font-bold" : "text-zinc-500"}>{rel.totalErros} erro(s)</span>
                  {" · "}
                  <span className={rel.totalAvisos > 0 ? "text-amber-400 font-bold" : "text-zinc-500"}>{rel.totalAvisos} aviso(s)</span>
                  {" · "}
                  <span className="text-emerald-400">{saudaveis} aba(s) ok</span>
                </>}
          </p>
          {comProblema.map((a) => (
            <div key={a.tab} className="rounded border border-zinc-800 bg-black/20 px-2.5 py-1.5">
              <p className="text-[11px] font-mono font-bold text-zinc-300">
                {a.erros.length > 0 ? "✖" : "⚠"} {a.tab} <span className="text-zinc-600 font-normal">({a.linhas} linhas)</span>
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {a.erros.map((e, i) => <li key={`e${i}`} className="text-[10px] text-red-400/90 font-mono">• {e}</li>)}
                {a.avisos.map((w, i) => <li key={`w${i}`} className="text-[10px] text-amber-400/80 font-mono">• {w}</li>)}
              </ul>
              {a.tab.trim().toLowerCase() === "twr_mensal" && (
                <button
                  onClick={compactarTwr}
                  disabled={compactando}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-amber-700/50 bg-amber-900/20 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-900/40 transition-colors"
                >
                  {compactando ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />} Compactar twr_mensal (remove corrompidas/duplicadas, com backup)
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {msg && <p className={`text-[11px] font-medium ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}

// Comparação ciente de números pt-BR ("1.234,56") e datas dd/mm/yyyy.
function cmpVal(a: string, b: string): number {
  const num = (s: string) => {
    const t = s.trim().replace(/\./g, "").replace(",", ".");
    return t !== "" && /^-?\d+(\.\d+)?%?$/.test(t) ? parseFloat(t) : null;
  };
  const dt = (s: string) => {
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    return m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  };
  const na = num(a), nb = num(b);
  if (na != null && nb != null) return na - nb;
  const da = dt(a), db = dt(b);
  if (da && db) return da < db ? -1 : da > db ? 1 : 0;
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

interface TabInfo { name: string; ro: boolean }

export default function PlanilhaCard() {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [tab, setTab] = useState<string>("");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(false);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draftNew, setDraftNew] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const delTimer = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/config/planilha")
      .then((r) => r.json())
      .then((d) => {
        const raw = Array.isArray(d?.tabs) ? d.tabs : [];
        // Compat: aceita tanto [{name,ro}] quanto ["nome"] (resposta antiga em cache).
        const list: TabInfo[] = raw.map((t: unknown) =>
          typeof t === "string" ? { name: t, ro: false } : (t as TabInfo),
        ).filter((t: TabInfo) => t?.name);
        setTabs(list);
        if (list.length > 0) setTab(list.some((t) => t.name === "meus_ativos") ? "meus_ativos" : list[0].name);
        if (d?.error) setMsg({ ok: false, text: d.error });
      })
      .catch(() => setMsg({ ok: false, text: "Falha ao listar as abas" }));
  }, []);

  const carregar = useCallback((t: string) => {
    if (!t) return;
    setLoading(true);
    setGrid(null);
    setEditIdx(null); setAdding(false); setConfirmDel(null); setSort(null); setLimit(PAGE);
    fetch(`/api/config/planilha?tab=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setMsg({ ok: false, text: d.error }); return; }
        setGrid({ headers: d.headers ?? [], rows: d.rows ?? [] });
      })
      .catch(() => setMsg({ ok: false, text: "Falha ao carregar a aba" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(tab); }, [tab, carregar]);

  const soLeitura = useMemo(() => tabs.find((t) => t.name === tab)?.ro ?? false, [tabs, tab]);

  // Linhas com o índice ORIGINAL preservado (o backend endereça por ele).
  const visiveis = useMemo(() => {
    if (!grid) return [];
    let list = grid.rows.map((cells, idx) => ({ idx, cells }));
    const q = busca.trim().toLowerCase();
    if (q) list = list.filter((r) => r.cells.some((c) => c.toLowerCase().includes(q)));
    if (sort) list = [...list].sort((a, b) => sort.dir * cmpVal(a.cells[sort.col] ?? "", b.cells[sort.col] ?? ""));
    return list;
  }, [grid, busca, sort]);

  const post = async (body: Record<string, unknown>, okText: string) => {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/config/planilha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab, ...body }),
      });
      const d = await r.json();
      if (!r.ok || d?.error) { setMsg({ ok: false, text: d?.error ?? `Erro ${r.status}` }); return false; }
      setMsg({ ok: true, text: okText });
      return true;
    } catch {
      setMsg({ ok: false, text: "Falha de rede ao gravar" });
      return false;
    } finally { setSaving(false); }
  };

  const salvarEdicao = async () => {
    if (editIdx == null || !grid) return;
    const ok = await post({ action: "update", rowIndex: editIdx, values: draft, expect: grid.rows[editIdx] }, "Linha atualizada ✓");
    if (ok) { setEditIdx(null); carregar(tab); }
  };

  const apagar = async (idx: number) => {
    if (!grid) return;
    const ok = await post({ action: "delete", rowIndex: idx, expect: grid.rows[idx] }, "Linha apagada ✓");
    setConfirmDel(null);
    if (ok) carregar(tab);
  };

  const adicionar = async () => {
    if (draftNew.every((v) => !v.trim())) { setMsg({ ok: false, text: "Preencha ao menos um campo" }); return; }
    const ok = await post({ action: "add", values: draftNew }, "Linha adicionada ✓");
    if (ok) { setAdding(false); carregar(tab); }
  };

  const pedirConfirmDel = (idx: number) => {
    setConfirmDel(idx);
    if (delTimer.current) window.clearTimeout(delTimer.current);
    delTimer.current = window.setTimeout(() => setConfirmDel(null), 3500);
  };

  const inputCls = "w-full min-w-[70px] bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-[11px] font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none";

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 leading-relaxed">
        A planilha <span className="font-mono text-zinc-400">gdados</span> sem sair do app: busque, ordene (clique no cabeçalho),
        edite (✎), apague e adicione linhas. Antes de qualquer alteração é feito <span className="text-zinc-400">backup automático</span> da aba
        (<span className="font-mono">bkp_&lt;aba&gt;</span>), e a gravação confere se a linha não mudou por baixo.
      </p>

      <SaudeBackup tab={tab} soLeitura={soLeitura} onAfterRollback={() => carregar(tab)} />

      {/* Barra: aba + busca + ações */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <select
            value={tab}
            onChange={(e) => setTab(e.target.value)}
            className="appearance-none bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <optgroup label="Dados (editável)">
              {tabs.filter((t) => !t.ro).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
            </optgroup>
            {tabs.some((t) => t.ro) && (
              <optgroup label="Backups & consulta (somente leitura)">
                {tabs.filter((t) => t.ro).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>

        {soLeitura && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-700/50 bg-amber-900/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            somente leitura
          </span>
        )}

        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setLimit(PAGE); }}
            placeholder="Buscar em todas as colunas…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <button
          onClick={() => carregar(tab)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Recarregar
        </button>

        {!soLeitura && (
          <button
            onClick={() => { setAdding(true); setDraftNew(Array(grid?.headers.length ?? 0).fill("")); setEditIdx(null); }}
            disabled={!grid || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-900/20 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40 transition-colors"
          >
            <Plus size={12} /> Nova linha
          </button>
        )}
      </div>

      {grid && (
        <p className="text-[10px] font-mono text-zinc-600">
          {grid.rows.length} linhas × {grid.headers.length} colunas
          {busca.trim() && <> · {visiveis.length} após a busca</>}
          {sort && <> · ordenado por &ldquo;{grid.headers[sort.col]}&rdquo; {sort.dir === 1 ? "↑" : "↓"}</>}
        </p>
      )}

      {/* Tabela */}
      {loading && <div className="flex items-center gap-2 py-8 justify-center text-zinc-500 text-xs"><Loader2 size={14} className="animate-spin" /> Carregando aba…</div>}

      {!loading && grid && (
        <div className="overflow-auto rounded-lg border border-zinc-800" style={{ maxHeight: "58vh" }}>
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 z-10">
              <tr className="bg-zinc-900">
                <th className="px-2 py-2 text-left text-[9px] text-zinc-600 w-10">#</th>
                {grid.headers.map((h, i) => (
                  <th
                    key={i}
                    onClick={() => setSort((s) => (s?.col !== i ? { col: i, dir: 1 } : s.dir === 1 ? { col: i, dir: -1 } : null))}
                    className="px-2 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-400 cursor-pointer select-none whitespace-nowrap hover:text-zinc-200"
                    title="Clique para ordenar"
                  >
                    {h || <span className="text-zinc-700">(vazio)</span>}
                    {sort?.col === i && <span className="ml-1 text-emerald-400">{sort.dir === 1 ? "↑" : "↓"}</span>}
                  </th>
                ))}
                <th className="px-2 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {/* Linha nova */}
              {adding && (
                <tr className="bg-emerald-900/10 border-b border-emerald-800/30">
                  <td className="px-2 py-1.5 text-emerald-500 text-[9px]">novo</td>
                  {grid.headers.map((_, i) => (
                    <td key={i} className="px-1 py-1.5">
                      <input
                        value={draftNew[i] ?? ""}
                        onChange={(e) => setDraftNew((d) => { const n = [...d]; n[i] = e.target.value; return n; })}
                        onKeyDown={(e) => { if (e.key === "Enter") adicionar(); if (e.key === "Escape") setAdding(false); }}
                        className={inputCls}
                        placeholder={grid.headers[i]}
                        autoFocus={i === 0}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <button onClick={adicionar} disabled={saving} title="Salvar (Enter)" className="text-emerald-400 hover:text-emerald-300 mr-2">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</button>
                    <button onClick={() => setAdding(false)} title="Cancelar (Esc)" className="text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
                  </td>
                </tr>
              )}

              {visiveis.slice(0, limit).map(({ idx, cells }) => {
                const emEdicao = editIdx === idx;
                return (
                  <tr key={idx} className="border-b border-zinc-800/60 hover:bg-white/[0.02] group">
                    <td className="px-2 py-1.5 text-zinc-600 text-[9px]">{idx + 2}</td>
                    {grid.headers.map((_, i) => (
                      <td key={i} className="px-2 py-1.5 whitespace-nowrap max-w-[260px] overflow-hidden text-ellipsis text-zinc-300">
                        {emEdicao ? (
                          <input
                            value={draft[i] ?? ""}
                            onChange={(e) => setDraft((d) => { const n = [...d]; n[i] = e.target.value; return n; })}
                            onKeyDown={(e) => { if (e.key === "Enter") salvarEdicao(); if (e.key === "Escape") setEditIdx(null); }}
                            className={inputCls}
                          />
                        ) : (cells[i] ?? "")}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      {emEdicao ? (
                        <>
                          <button onClick={salvarEdicao} disabled={saving} title="Salvar (Enter)" className="text-emerald-400 hover:text-emerald-300 mr-2">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</button>
                          <button onClick={() => setEditIdx(null)} title="Cancelar (Esc)" className="text-zinc-500 hover:text-zinc-300"><X size={13} /></button>
                        </>
                      ) : confirmDel === idx ? (
                        <button onClick={() => apagar(idx)} disabled={saving} className="text-[10px] font-bold text-red-400 hover:text-red-300">
                          {saving ? <Loader2 size={13} className="animate-spin inline" /> : "Confirmar?"}
                        </button>
                      ) : soLeitura ? null : (
                        <span className="opacity-30 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditIdx(idx); setDraft(Array.from({ length: grid.headers.length }, (_, i) => cells[i] ?? "")); setAdding(false); }}
                            title="Editar linha" className="text-zinc-400 hover:text-emerald-300 mr-2"
                          ><Pencil size={12} /></button>
                          <button onClick={() => pedirConfirmDel(idx)} title="Apagar linha" className="text-zinc-400 hover:text-red-400"><Trash2 size={12} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {visiveis.length === 0 && !adding && (
                <tr><td colSpan={grid.headers.length + 2} className="px-3 py-6 text-center text-zinc-600 text-xs">
                  {busca.trim() ? "Nada encontrado para a busca" : "Aba vazia"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && grid && visiveis.length > limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="w-full rounded-lg border border-zinc-800 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors">
          Mostrar mais ({visiveis.length - limit} restantes)
        </button>
      )}

      {msg && (
        <p className={`text-xs font-medium ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}
    </div>
  );
}
