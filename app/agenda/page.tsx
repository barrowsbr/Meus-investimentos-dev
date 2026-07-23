"use client";

// Agenda de proventos — calendário dedicado (datas-ex, pagamentos e possíveis
// anúncios) dos ativos de renda variável da carteira. Lê /api/proventos/
// calendario (Yahoo: calendarEvents + summaryDetail, cache 6h). Só LEITURA de
// mercado — não toca no motor nem na planilha.

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import PageHeader from "@/components/PageHeader";

type Tipo = "ex" | "pagamento" | "anuncio";
interface Evento {
  ticker: string; tipo: Tipo; date: string; moeda: string;
  dividendRate: number | null; dividendYield: number | null;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const brDate = (iso: string) => iso.split("-").reverse().join("/");

const COR: Record<Tipo, string> = { ex: "var(--accent, #E8A33D)", pagamento: "var(--pos, #3FB950)", anuncio: "#22d3ee" };
const ROTULO: Record<Tipo, string> = { ex: "Data-ex", pagamento: "Pagamento", anuncio: "Anúncio (resultados)" };

export default function AgendaPage() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ym, setYm] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [selDate, setSelDate] = useState<string | null>(null);
  const [ativos, setAtivos] = useState<Record<Tipo, boolean>>({ ex: true, pagamento: true, anuncio: true });

  useEffect(() => {
    let alive = true;
    setEventos(null); setErro(null);
    fetch("/api/proventos/calendario")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) { setErro(d.error); setEventos([]); return; }
        const evs: Evento[] = Array.isArray(d?.eventos) ? d.eventos : [];
        setEventos(evs);
        const prox = evs.find((e) => e.date >= todayISO()) ?? evs[0];
        if (prox) { const [y, m] = prox.date.split("-").map(Number); setYm({ y, m: m - 1 }); }
      })
      .catch((e) => { if (alive) { setErro(e instanceof Error ? e.message : "Erro"); setEventos([]); } });
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
    const c: Record<Tipo, number> = { ex: 0, pagamento: 0, anuncio: 0 };
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
        {(["ex", "pagamento", "anuncio"] as Tipo[]).map((t) => {
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
                        {(["ex", "pagamento", "anuncio"] as Tipo[]).filter((t) => tipos.has(t)).map((t) => (
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
              {(["ex", "pagamento", "anuncio"] as Tipo[]).map((t) => (
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
                  <li key={`${e.ticker}-${e.tipo}-${e.date}-${i}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: COR[e.tipo] }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{e.ticker}</span>
                        <span className="rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide" style={{ background: `color-mix(in srgb, ${COR[e.tipo]} 18%, transparent)`, color: COR[e.tipo] }}>{ROTULO[e.tipo]}</span>
                      </div>
                      {e.dividendYield != null && (
                        <span className="mt-0.5 block font-mono text-[10.5px]" style={{ color: "var(--muted)" }}>
                          yield {e.dividendYield.toFixed(1).replace(".", ",")}%{e.dividendRate != null ? ` · ${e.moeda === "USD" ? "US$" : e.moeda} ${e.dividendRate.toFixed(2)}/ano` : ""}
                        </span>
                      )}
                    </div>
                    {!selDate && <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: "var(--muted)" }}>{brDate(e.date).slice(0, 5)}</span>}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 border-t pt-3 text-[10.5px] leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--faint)" }}>
              <b style={{ color: "var(--muted)" }}>Anúncio</b> = próxima data de <b>resultados</b> da empresa (aproximada) — costumam anunciar proventos junto/perto. <b style={{ color: "var(--muted)" }}>Data-ex</b> e <b style={{ color: "var(--muted)" }}>pagamento</b> só aparecem quando o provento já foi declarado. Valores exatos por ação vêm depois do anúncio.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
