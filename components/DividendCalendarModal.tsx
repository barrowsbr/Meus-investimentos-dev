"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, CalendarDays, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

interface EventoDividendo {
  ticker: string;
  tipo: "ex" | "pagamento";
  date: string; // YYYY-MM-DD
  moeda: string;
  dividendRate: number | null;
  dividendYield: number | null;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function DividendCalendarModal({ onClose }: { onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [eventos, setEventos] = useState<EventoDividendo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ym, setYm] = useState<{ y: number; m: number }>(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });
  const [selDate, setSelDate] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/proventos/calendario")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) { setErro(d.error); setEventos([]); return; }
        const evs: EventoDividendo[] = Array.isArray(d?.eventos) ? d.eventos : [];
        setEventos(evs);
        // Abre no mês do próximo evento e já seleciona esse dia.
        const prox = evs.find((e) => e.date >= todayISO()) ?? evs[0];
        if (prox) {
          const [y, m] = prox.date.split("-").map(Number);
          setYm({ y, m: m - 1 });
          setSelDate(prox.date);
        }
      })
      .catch((e) => { if (alive) { setErro(e instanceof Error ? e.message : "Erro"); setEventos([]); } });
    return () => { alive = false; };
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, EventoDividendo[]>();
    for (const e of eventos ?? []) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [eventos]);

  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const start = first.getDay(); // 0=domingo
    const dias = new Date(ym.y, ym.m + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < start; i++) out.push(null);
    for (let d = 1; d <= dias; d++) out.push(d);
    return out;
  }, [ym]);

  const prevMonth = () => setYm(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }));
  const nextMonth = () => setYm(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }));

  const selEvents = selDate ? (byDate.get(selDate) ?? []) : [];
  const hoje = todayISO();

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl flex flex-col overflow-hidden shadow-2xl"
        style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, maxHeight: "90vh", paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} style={{ color: "var(--accent)" }} />
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text-2)" }}>
              Agenda de Dividendos
            </span>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="p-1 rounded-md transition-opacity opacity-70 hover:opacity-100" style={{ color: "var(--muted)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {/* Navegação do mês */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]" style={{ color: "var(--muted)" }} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{MESES[ym.m]} {ym.y}</span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.05]" style={{ color: "var(--muted)" }} aria-label="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </div>

          {eventos === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: "var(--muted)" }}>
              <Loader2 size={16} className="animate-spin" /> Buscando próximos dividendos…
            </div>
          ) : (
            <>
              {/* Grade do calendário */}
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[9px] font-mono uppercase tracking-wider py-1" style={{ color: "var(--faint)" }}>{w}</div>
                ))}
                {cells.map((d, i) => {
                  if (d === null) return <div key={`b${i}`} />;
                  const iso = isoOf(ym.y, ym.m, d);
                  const evs = byDate.get(iso);
                  const hasEx = evs?.some((e) => e.tipo === "ex");
                  const hasPay = evs?.some((e) => e.tipo === "pagamento");
                  const isToday = iso === hoje;
                  const isSel = iso === selDate;
                  return (
                    <button
                      key={iso}
                      onClick={() => evs && setSelDate(iso)}
                      className="relative aspect-square rounded-lg flex flex-col items-center justify-center transition-colors"
                      style={{
                        background: isSel ? "var(--accent-wash, rgba(232,163,61,.14))" : evs ? "rgba(255,255,255,0.04)" : "transparent",
                        border: `1px solid ${isSel ? "var(--accent)" : isToday ? "var(--line-strong)" : "transparent"}`,
                        cursor: evs ? "pointer" : "default",
                      }}
                    >
                      <span className="text-[11px] font-mono" style={{ color: evs ? "var(--text)" : "var(--faint)", fontWeight: isToday ? 700 : 400 }}>{d}</span>
                      {evs && (
                        <span className="flex gap-0.5 mt-0.5">
                          {hasEx && <span className="w-1 h-1 rounded-full" style={{ background: "var(--accent)" }} />}
                          {hasPay && <span className="w-1 h-1 rounded-full" style={{ background: "var(--pos, #3FB950)" }} />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Legenda */}
              <div className="flex items-center gap-4 mt-3 text-[10px]" style={{ color: "var(--muted)" }}>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} /> Data-ex</span>
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--pos, #3FB950)" }} /> Pagamento</span>
              </div>

              {/* Detalhes do dia */}
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                {selEvents.length > 0 ? (
                  <>
                    <p className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--faint)" }}>
                      {selDate?.split("-").reverse().join("/")}
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {selEvents.map((e, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)" }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.tipo === "ex" ? "var(--accent)" : "var(--pos, #3FB950)" }} />
                            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{e.ticker}</span>
                            <span className="text-[11px]" style={{ color: "var(--muted)" }}>{e.tipo === "ex" ? "Data-ex" : "Pagamento"}</span>
                          </div>
                          {e.dividendYield != null && (
                            <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--muted)" }}>
                              yield {e.dividendYield.toFixed(1).replace(".", ",")}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-center text-[11px] py-2" style={{ color: "var(--faint)" }}>
                    {erro ? `Erro ao buscar: ${erro}` : (eventos.length === 0 ? "Nenhum dividendo anunciado para os próximos dias." : "Toque num dia marcado para ver os dividendos.")}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
