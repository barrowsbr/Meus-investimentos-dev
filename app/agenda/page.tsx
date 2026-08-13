"use client";

// Agenda de proventos — calendário dedicado (datas-ex, pagamentos e possíveis
// anúncios) dos ativos de renda variável da carteira. Lê /api/proventos/
// calendario (Yahoo: calendarEvents + summaryDetail, cache 6h). Só LEITURA de
// mercado — não toca no motor nem na planilha.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { EVENTOS_MACRO, MACRO_INFO, type TipoMacro } from "@/lib/agenda-macro";

type Tipo = "ex" | "pagamento" | "anuncio" | "macro";
interface Evento {
  ticker: string; tipo: Tipo; date: string; moeda: string;
  dividendRate: number | null; dividendYield: number | null;
  detalhe?: string;    // eventos macro: linha de apoio (horário/descrição)
  macroTipo?: TipoMacro; // eventos macro: chave do dossiê (MACRO_INFO)
  ySym?: string;       // proventos: símbolo Yahoo (link "ver no Yahoo")
}

// Copom, FOMC e Payroll — datas oficiais fixas (lib/agenda-macro.ts).
const MACRO_COMO_EVENTOS: Evento[] = EVENTOS_MACRO.map((m) => ({
  ticker: m.rotulo, tipo: "macro", date: m.date, moeda: "",
  dividendRate: null, dividendYield: null, detalhe: m.detalhe, macroTipo: m.tipo,
}));

// Explicação curta de cada tipo de evento de provento (popup).
const EXPLICA_PROVENTO: Record<Exclude<Tipo, "macro">, string> = {
  ex: "Último dia com direito ao provento foi o pregão anterior — a partir desta data o papel negocia \"ex\" (quem comprar agora não recebe este provento).",
  pagamento: "Dia em que o provento declarado cai na conta da corretora.",
  anuncio: "Data (aproximada) da divulgação de resultados da empresa — proventos costumam ser anunciados junto ou perto dela.",
};

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().join("/");

const COR: Record<Tipo, string> = { ex: "var(--accent, #E8A33D)", pagamento: "var(--pos, #3FB950)", anuncio: "#22d3ee", macro: "#a78bfa" };
const ROTULO: Record<Tipo, string> = { ex: "Data-ex", pagamento: "Pagamento", anuncio: "Anúncio (resultados)", macro: "Macro" };

export default function AgendaPage() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ym, setYm] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [selDate, setSelDate] = useState<string | null>(null);
  const [ativos, setAtivos] = useState<Record<Tipo, boolean>>({ ex: true, pagamento: true, anuncio: true, macro: true });
  const [det, setDet] = useState<Evento | null>(null); // evento aberto no popup de detalhes

  // Esc fecha o popup.
  useEffect(() => {
    if (!det) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setDet(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [det]);

  useEffect(() => {
    let alive = true;
    setEventos(null); setErro(null);
    fetch("/api/proventos/calendario")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) { setErro(d.error); setEventos(MACRO_COMO_EVENTOS); return; }
        const evs: Evento[] = Array.isArray(d?.eventos) ? d.eventos : [];
        const todos = [...evs, ...MACRO_COMO_EVENTOS].sort((a, b) => a.date.localeCompare(b.date));
        setEventos(todos);
        const prox = todos.find((e) => e.date >= todayISO()) ?? todos[0];
        if (prox) { const [y, m] = prox.date.split("-").map(Number); setYm({ y, m: m - 1 }); }
      })
      .catch((e) => { if (alive) { setErro(e instanceof Error ? e.message : "Erro"); setEventos(MACRO_COMO_EVENTOS); } });
    return () => { alive = false; };
  }, []);

  const visiveis = useMemo(() => (eventos ?? []).filter((e) => ativos[e.tipo]), [eventos, ativos]);

  const byDate = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const e of visiveis) { const a = map.get(e.date) ?? []; a.push(e); map.set(e.date, a); }
    return map;
  }, [visiveis]);

  const cells = useMemo(() => {
    const start = new Date(ym.y, ym.m, 1).getDay();
    const dias = new Date(ym.y, ym.m + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < start; i++) out.push(null);
    for (let d = 1; d <= dias; d++) out.push(d);
    return out;
  }, [ym]);

  // Próximos eventos (de hoje em diante), para a lista-agenda.
  const proximos = useMemo(() => visiveis.filter((e) => e.date >= todayISO()).slice(0, 40), [visiveis]);

  // Contagem por tipo dentro do mês visível.
  const doMes = useMemo(() => {
    const pref = `${ym.y}-${pad(ym.m + 1)}`;
    const c: Record<Tipo, number> = { ex: 0, pagamento: 0, anuncio: 0, macro: 0 };
    for (const e of visiveis) if (e.date.startsWith(pref)) c[e.tipo]++;
    return c;
  }, [visiveis, ym]);

  const prevMonth = () => setYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const nextMonth = () => setYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));
  const irHoje = () => { const n = new Date(); setYm({ y: n.getFullYear(), m: n.getMonth() }); setSelDate(todayISO()); };

  const hoje = todayISO();
  const selEvents = selDate ? (byDate.get(selDate) ?? []) : [];
  const toggle = (t: Tipo) => setAtivos((s) => ({ ...s, [t]: !s[t] }));

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Agenda"
        description="Calendário de proventos das suas empresas"
        leading={<CalendarDays size={18} style={{ color: "var(--accent)" }} />}
        right={
          <button onClick={irHoje} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] transition-colors hover:bg-white/[0.05]" style={{ color: "var(--muted)", border: "1px solid var(--line)" }}>
            <RefreshCw size={12} /> Hoje
          </button>
        }
      />

      {/* filtros por tipo */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["ex", "pagamento", "anuncio", "macro"] as Tipo[]).map((t) => {
          const on = ativos[t];
          return (
            <button key={t} onClick={() => toggle(t)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide transition-all"
              style={{ background: on ? `color-mix(in srgb, ${COR[t]} 16%, transparent)` : "transparent", border: `1px solid ${on ? COR[t] : "var(--line)"}`, color: on ? "var(--text)" : "var(--faint)", opacity: on ? 1 : 0.6 }}>
              <span className="h-2 w-2 rounded-full" style={{ background: COR[t] }} /> {ROTULO[t]}
            </button>
          );
        })}
      </div>

      {eventos === null ? (
        <div className="flex items-center justify-center gap-2 py-24 text-sm" style={{ color: "var(--muted)" }}>
          <Loader2 size={16} className="animate-spin" /> Buscando os próximos proventos…
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* ── Calendário ── */}
          <section className="rounded-2xl p-4" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
            <div className="mb-3 flex items-center justify-between">
              <button onClick={prevMonth} className="rounded-lg p-1.5 transition-colors hover:bg-white/[0.05]" style={{ color: "var(--muted)" }} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{MESES[ym.m]} {ym.y}</span>
              <button onClick={nextMonth} className="rounded-lg p-1.5 transition-colors hover:bg-white/[0.05]" style={{ color: "var(--muted)" }} aria-label="Próximo mês"><ChevronRight size={18} /></button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1 text-center font-mono text-[9px] uppercase tracking-wider" style={{ color: "var(--faint)" }}>{w}</div>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <div key={`b${i}`} />;
                const iso = isoOf(ym.y, ym.m, d);
                const evs = byDate.get(iso);
                const tipos = new Set(evs?.map((e) => e.tipo));
                const isToday = iso === hoje, isSel = iso === selDate;
                return (
                  <button key={iso} onClick={() => setSelDate(iso === selDate ? null : iso)}
                    className="relative flex aspect-square flex-col items-center justify-center rounded-lg transition-colors"
                    style={{
                      background: isSel ? "color-mix(in srgb, var(--accent) 16%, transparent)" : evs ? "rgba(255,255,255,0.04)" : "transparent",
                      border: `1px solid ${isSel ? "var(--accent)" : isToday ? "var(--line-strong, rgba(255,255,255,.25))" : "transparent"}`,
                      cursor: evs ? "pointer" : "default",
                    }}>
                    <span className="font-mono text-[12px]" style={{ color: evs ? "var(--text)" : "var(--faint)", fontWeight: isToday ? 700 : 400 }}>{d}</span>
                    {evs && (
                      <span className="mt-0.5 flex gap-0.5">
                        {(["ex", "pagamento", "anuncio", "macro"] as Tipo[]).filter((t) => tipos.has(t)).map((t) => (
                          <span key={t} className="h-1 w-1 rounded-full" style={{ background: COR[t] }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* resumo do mês */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-[11px]" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
              {(["ex", "pagamento", "anuncio", "macro"] as Tipo[]).map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR[t] }} />
                  {doMes[t]} {ROTULO[t].split(" ")[0].toLowerCase()}{doMes[t] === 1 ? "" : "s"}
                </span>
              ))}
            </div>
          </section>

          {/* ── Agenda / detalhe ── */}
          <section className="rounded-2xl p-4" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
            <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-2, var(--muted))" }}>
              {selDate ? brDate(selDate) : "Próximos eventos"}
            </h2>

            {(selDate ? selEvents : proximos).length === 0 ? (
              <p className="py-10 text-center text-[12px]" style={{ color: "var(--faint)" }}>
                {erro ? `Erro ao buscar: ${erro}` : (eventos.length === 0 ? "Nenhum provento anunciado por enquanto. Volto a checar sozinho (cache de 6h)." : selDate ? "Nada marcado nesse dia." : "Sem eventos futuros nos filtros ativos.")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(selDate ? selEvents : proximos).map((e, i) => (
                  <li key={`${e.ticker}-${e.tipo}-${e.date}-${i}`} onClick={() => setDet(e)} role="button" tabIndex={0}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setDet(e); } }}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: COR[e.tipo] }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{e.ticker}</span>
                        <span className="rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide" style={{ background: `color-mix(in srgb, ${COR[e.tipo]} 18%, transparent)`, color: COR[e.tipo] }}>{ROTULO[e.tipo]}</span>
                      </div>
                      {e.detalhe && (
                        <span className="mt-0.5 block font-mono text-[10.5px]" style={{ color: "var(--muted)" }}>{e.detalhe}</span>
                      )}
                      {e.dividendYield != null && (
                        <span className="mt-0.5 block font-mono text-[10.5px]" style={{ color: "var(--muted)" }}>
                          yield {e.dividendYield.toFixed(1).replace(".", ",")}%{e.dividendRate != null ? ` · ${e.moeda === "USD" ? "US$" : e.moeda} ${e.dividendRate.toFixed(2)}/ano` : ""}
                        </span>
                      )}
                    </div>
                    {!selDate && <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--muted)" }}>{brDate(e.date).slice(0, 5)}</span>}
                    <ChevronRight size={13} className="shrink-0" style={{ color: "var(--faint)" }} />
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 border-t pt-3 text-[10.5px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--faint)" }}>
              <b style={{ color: "var(--muted)" }}>Anúncio</b> = próxima data de <b>resultados</b> da empresa (aproximada) — costumam anunciar proventos junto/perto. <b style={{ color: "var(--muted)" }}>Data-ex</b> e <b style={{ color: "var(--muted)" }}>pagamento</b> só aparecem quando o provento já foi declarado. <b style={{ color: "var(--muted)" }}>Macro</b> = Copom, FOMC e Payroll — datas oficiais (BCB, Fed e BLS), decisão/divulgação no dia marcado. Toque num evento para ver detalhes e <b style={{ color: "var(--muted)" }}>onde acompanhar o resultado</b>.
            </p>
          </section>
        </div>
      )}

      {/* ── Popup de detalhes do evento ── */}
      {/* Portal no body: o shell (sidebar z-40 + terminal-root) cria stacking
          context próprio e engoliria um fixed renderizado aqui dentro. Só
          renderiza após clique (client), então document existe. */}
      {det && createPortal((() => {
        const info = det.tipo === "macro" && det.macroTipo ? MACRO_INFO[det.macroTipo] : null;
        const fontes = info
          ? info.fontes
          : [
              { rotulo: `${det.ticker} no Yahoo Finance`, href: `https://finance.yahoo.com/quote/${encodeURIComponent(det.ySym || det.ticker)}` },
              { rotulo: "Proventos recebidos (no app)", href: "/proventos" },
            ];
        return (
          <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4 animate-fade-in"
            style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }} onClick={() => setDet(null)}>
            <div className="flex w-full flex-col overflow-hidden shadow-2xl sm:max-w-md"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, maxHeight: "85vh", paddingBottom: "env(safe-area-inset-bottom)" }}
              onClick={(ev) => ev.stopPropagation()}>
              {/* header */}
              <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: COR[det.tipo] }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold" style={{ color: "var(--text)" }}>{info ? info.titulo : det.ticker}</span>
                      <span className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide" style={{ background: `color-mix(in srgb, ${COR[det.tipo]} 18%, transparent)`, color: COR[det.tipo] }}>{ROTULO[det.tipo]}</span>
                    </div>
                    <span className="font-mono text-[10.5px]" style={{ color: "var(--muted)" }}>{brDate(det.date)}{det.detalhe ? ` · ${det.detalhe}` : ""}</span>
                  </div>
                </div>
                <button onClick={() => setDet(null)} aria-label="Fechar" className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100" style={{ color: "var(--muted)" }}><X size={16} /></button>
              </div>

              {/* corpo */}
              <div className="overflow-y-auto px-5 py-4">
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text)" }}>
                  {info ? info.oQueE : EXPLICA_PROVENTO[det.tipo as Exclude<Tipo, "macro">]}
                </p>
                {info && (
                  <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>{info.comoLer}</p>
                )}
                {!info && det.dividendYield != null && (
                  <p className="mt-2 font-mono text-[11px]" style={{ color: "var(--muted)" }}>
                    yield {det.dividendYield.toFixed(1).replace(".", ",")}%{det.dividendRate != null ? ` · ${det.moeda === "USD" ? "US$" : det.moeda} ${det.dividendRate.toFixed(2)}/ano` : ""}
                  </p>
                )}

                <h3 className="mb-1.5 mt-4 font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-2, var(--muted))" }}>
                  {info ? "Onde ver o resultado" : "Ver mais"}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {fontes.map((f) => (
                    <li key={f.href}>
                      <a href={f.href} target={f.href.startsWith("/") ? undefined : "_blank"} rel="noreferrer noopener"
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] transition-colors hover:bg-white/[0.06]"
                        style={{ border: "1px solid var(--line)", color: "var(--text)" }}>
                        <ExternalLink size={12} className="shrink-0" style={{ color: COR[det.tipo] }} />
                        <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        );
      })(), document.body)}
    </div>
  );
}
