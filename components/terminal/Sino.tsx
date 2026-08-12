"use client";

// Sino de notificações do cabeçalho — informação que "só importa de verdade
// se eu ver rápido" (pedido do dono). Duas fontes:
//   1. TRANSMISSÃO MACRO — /api/macro-map/divergence: regras em estado
//      anomalo / regime_rompido / confirmado.
//   2. AGENDA — /api/proventos/calendario: data-ex, pagamento e resultados
//      dos ativos da carteira nos PRÓXIMOS 7 dias.
// "Novo" = chave do episódio ainda não vista neste aparelho (localStorage;
// abrir o painel marca tudo como visto). Painel via PORTAL no <body>
// (ancestrais com transform quebram fixed).

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, CalendarDays, Radar as RadarIcon } from "lucide-react";
import { fetchJsonCached } from "@/lib/client-cache";

// ── Transmissão macro ──
interface Avaliacao {
  id: string;
  titulo: string;
  estado: string;
  canal: string;
  choqueAtivo: boolean;
  ultimoChoqueGeral: { date: string; primarioConfirmado: boolean | null } | null;
}
interface Relatorio { geradoEm: string; dataPregao: string | null; avaliacoes: Avaliacao[]; error?: string }

const RELEVANTES = new Set(["anomalo", "regime_rompido", "confirmado"]);
const ESTADO_UI: Record<string, { rotulo: string; cor: string; bg: string }> = {
  anomalo: { rotulo: "ANÔMALO", cor: "#f87171", bg: "rgba(239,68,68,0.14)" },
  regime_rompido: { rotulo: "REGIME ROMPIDO", cor: "#fb923c", bg: "rgba(249,115,22,0.14)" },
  confirmado: { rotulo: "CONFIRMADO", cor: "#34d399", bg: "rgba(16,185,129,0.12)" },
};

// ── Agenda (proventos/resultados) ──
type TipoAgenda = "ex" | "pagamento" | "anuncio";
interface EventoAgenda {
  ticker: string; tipo: TipoAgenda; date: string; moeda: string;
  dividendRate: number | null; dividendYield: number | null;
}
interface Calendario { eventos: EventoAgenda[]; error?: string }

const AGENDA_UI: Record<TipoAgenda, { rotulo: string; cor: string; bg: string }> = {
  ex: { rotulo: "DATA-EX", cor: "#E8A33D", bg: "rgba(232,163,61,0.14)" },
  pagamento: { rotulo: "PAGAMENTO", cor: "#3FB950", bg: "rgba(63,185,80,0.14)" },
  anuncio: { rotulo: "RESULTADOS", cor: "#22d3ee", bg: "rgba(34,211,238,0.12)" },
};
const JANELA_AGENDA_DIAS = 7;

// Mesma chave desde a 1ª versão (só macro) — o que já foi visto continua visto.
const LS_KEY = "macro_sino_visto";

function lerVistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function gravarVistos(s: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...s].slice(-200))); } catch { /* sem storage */ }
}

const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "hoje", "amanhã", "em 3d" — pra bater o olho e saber a urgência.
function quando(iso: string, hoje: string): string {
  const dias = Math.round((new Date(iso + "T12:00").getTime() - new Date(hoje + "T12:00").getTime()) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias}d`;
}

export default function Sino() {
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [cal, setCal] = useState<Calendario | null>(null);
  const [aberto, setAberto] = useState(false);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [hoje, setHoje] = useState("");

  useEffect(() => {
    setVistos(lerVistos());
    setHoje(isoLocal(new Date()));
    fetchJsonCached<Relatorio>("/api/macro-map/divergence", 15 * 60_000)
      .then((r) => { if (!r.error) setRel(r); })
      .catch(() => { /* sem rede — fonte fica quieta */ });
    fetchJsonCached<Calendario>("/api/proventos/calendario", 60 * 60_000)
      .then((c) => { if (!c.error) setCal(c); })
      .catch(() => { /* idem */ });
  }, []);

  // Acontecimentos macro, com chave estável por episódio (id + estado + data
  // do choque) — muda o episódio, o sino acende de novo.
  const evMacro = useMemo(() => {
    return (rel?.avaliacoes ?? [])
      .filter((a) => RELEVANTES.has(a.estado))
      .map((a) => ({ ...a, chave: `${a.id}|${a.estado}|${a.ultimoChoqueGeral?.date ?? rel?.dataPregao ?? ""}` }))
      .sort((x, y) => (x.estado === "confirmado" ? 1 : 0) - (y.estado === "confirmado" ? 1 : 0));
  }, [rel]);

  // Agenda: só a janela curta à frente (data-ex/pagamento/resultados chegando).
  const evAgenda = useMemo(() => {
    if (!hoje) return [];
    const teto = isoLocal(new Date(new Date(hoje + "T12:00").getTime() + JANELA_AGENDA_DIAS * 86400000));
    return (cal?.eventos ?? [])
      .filter((e) => e.date >= hoje && e.date <= teto)
      .map((e) => ({ ...e, chave: `ag|${e.ticker}|${e.tipo}|${e.date}` }));
  }, [cal, hoje]);

  const chaves = useMemo(() => [...evMacro, ...evAgenda].map((e) => e.chave), [evMacro, evAgenda]);
  const naoVistos = chaves.filter((c) => !vistos.has(c)).length;
  const carregado = rel !== null || cal !== null;

  const abrir = () => {
    const v = !aberto;
    setAberto(v);
    if (v && chaves.length > 0) {
      const s = new Set(vistos);
      for (const c of chaves) s.add(c);
      setVistos(s);
      gravarVistos(s);
    }
  };

  // Esc fecha o painel (clique fora = backdrop).
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  const cabecalho = (texto: string, extra?: string) => (
    <div className="flex items-center justify-between px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-zinc-500">{texto}</p>
      {extra && <p className="font-mono text-[9px] text-zinc-600">{extra}</p>}
    </div>
  );

  return (
    <>
      <button
        onClick={abrir}
        aria-label={naoVistos > 0 ? `Notificações (${naoVistos} novas)` : "Notificações"}
        className="relative shrink-0 grid place-items-center transition-opacity hover:opacity-80"
        style={{ width: 30, height: 30, color: naoVistos > 0 ? "#fbbf24" : "var(--muted)" }}
      >
        <Bell size={16} />
        {naoVistos > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 grid place-items-center rounded-full font-mono font-bold"
            style={{ minWidth: 15, height: 15, padding: "0 3px", fontSize: 9, background: "#f59e0b", color: "#111114" }}
          >
            {naoVistos > 9 ? "9+" : naoVistos}
          </span>
        )}
      </button>

      {aberto && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Notificações">
          <button className="absolute inset-0" onClick={() => setAberto(false)} aria-label="Fechar" style={{ background: "transparent" }} />
          <div
            className="absolute overflow-hidden rounded-2xl"
            style={{
              top: 58, right: 10, width: "min(360px, calc(100vw - 20px))",
              background: "#131318", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            }}
          >
            <div className="max-h-[62vh] overflow-y-auto">
              {!carregado && <p className="px-3 py-6 text-center text-[11px] text-zinc-500">Carregando…</p>}
              {carregado && evMacro.length === 0 && evAgenda.length === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-zinc-500">
                  Nada por agora — transmissão quieta e sem eventos de agenda nos próximos {JANELA_AGENDA_DIAS} dias.
                </p>
              )}

              {evMacro.length > 0 && (
                <>
                  {cabecalho("Transmissão macro", rel?.dataPregao ? `pregão ${dataBR(rel.dataPregao)}` : undefined)}
                  {evMacro.map((e) => {
                    const ui = ESTADO_UI[e.estado] ?? { rotulo: e.estado, cor: "#a1a1aa", bg: "rgba(255,255,255,0.05)" };
                    return (
                      <Link
                        key={e.chave}
                        href="/bolsas?transmissao=1"
                        onClick={() => setAberto(false)}
                        className="block px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold" style={{ background: ui.bg, color: ui.cor }}>
                            {ui.rotulo}
                          </span>
                          {e.ultimoChoqueGeral?.date && (
                            <span className="font-mono text-[9px] text-zinc-600">choque {dataBR(e.ultimoChoqueGeral.date)}</span>
                          )}
                        </div>
                        <p className="mt-1 text-[11.5px] leading-snug text-zinc-200">{e.titulo}</p>
                        {e.canal && <p className="mt-0.5 truncate text-[9.5px] text-zinc-600">{e.canal}</p>}
                      </Link>
                    );
                  })}
                </>
              )}

              {evAgenda.length > 0 && (
                <>
                  {cabecalho("Agenda", `próximos ${JANELA_AGENDA_DIAS} dias`)}
                  {evAgenda.map((e) => {
                    const ui = AGENDA_UI[e.tipo];
                    return (
                      <Link
                        key={e.chave}
                        href="/agenda"
                        onClick={() => setAberto(false)}
                        className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold" style={{ background: ui.bg, color: ui.cor }}>
                          {ui.rotulo}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-zinc-200">
                          {e.ticker}
                          {e.dividendYield != null && (
                            <span className="ml-1.5 font-mono text-[9.5px] font-normal text-zinc-500">yield {e.dividendYield.toFixed(1).replace(".", ",")}%</span>
                          )}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-[10px] font-bold" style={{ color: quando(e.date, hoje) === "hoje" ? "#fbbf24" : "#a1a1aa" }}>
                            {quando(e.date, hoje)}
                          </span>
                          <span className="block font-mono text-[8.5px] text-zinc-600">{dataBR(e.date).slice(0, 5)}</span>
                        </span>
                      </Link>
                    );
                  })}
                </>
              )}
            </div>

            <div className="flex" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <Link
                href="/bolsas?transmissao=1"
                onClick={() => setAberto(false)}
                className="flex flex-1 items-center justify-center gap-1.5 py-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <RadarIcon size={11} /> Transmissão
              </Link>
              <span style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
              <Link
                href="/agenda"
                onClick={() => setAberto(false)}
                className="flex flex-1 items-center justify-center gap-1.5 py-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-wide text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <CalendarDays size={11} /> Agenda
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
