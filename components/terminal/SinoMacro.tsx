"use client";

// Sino de notificações do cabeçalho — acontecimentos da TRANSMISSÃO MACRO.
// Pedido do dono: esse tipo de informação "só importa de verdade se eu ver
// rápido" — então o sino acende (badge âmbar) quando o detector de
// divergência tem algo NOVO em estado relevante:
//   anomalo / regime_rompido (alta prioridade) e confirmado (choque recente).
// "Novo" = chave id|estado|data do choque ainda não vista neste aparelho
// (localStorage; abrir o painel marca como visto). Fonte: /api/macro-map/
// divergence (CDN 30 min — o detector é diário, não precisa de tempo real).
// Painel via PORTAL no <body> (ancestrais com transform quebram fixed).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, Radar as RadarIcon } from "lucide-react";
import { fetchJsonCached } from "@/lib/client-cache";

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

export default function SinoMacro() {
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [aberto, setAberto] = useState(false);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setVistos(lerVistos());
    fetchJsonCached<Relatorio>("/api/macro-map/divergence", 15 * 60_000)
      .then((r) => { if (!r.error) setRel(r); })
      .catch(() => { /* sem rede — sino fica quieto */ });
  }, []);

  // Acontecimentos relevantes de agora, com chave estável por episódio
  // (id + estado + data do choque) — muda o episódio, o sino acende de novo.
  const eventos = useMemo(() => {
    return (rel?.avaliacoes ?? [])
      .filter((a) => RELEVANTES.has(a.estado))
      .map((a) => ({ ...a, chave: `${a.id}|${a.estado}|${a.ultimoChoqueGeral?.date ?? rel?.dataPregao ?? ""}` }))
      .sort((x, y) => (x.estado === "confirmado" ? 1 : 0) - (y.estado === "confirmado" ? 1 : 0));
  }, [rel]);

  const naoVistos = eventos.filter((e) => !vistos.has(e.chave)).length;

  const abrir = () => {
    const v = !aberto;
    setAberto(v);
    if (v && eventos.length > 0) {
      const s = new Set(vistos);
      for (const e of eventos) s.add(e.chave);
      setVistos(s);
      gravarVistos(s);
    }
  };

  // Esc / clique fora fecham o painel.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={abrir}
        aria-label={naoVistos > 0 ? `Notificações da transmissão macro (${naoVistos} novas)` : "Notificações da transmissão macro"}
        className="relative shrink-0 grid place-items-center transition-opacity hover:opacity-80"
        style={{ width: 30, height: 30, border: "1px solid var(--line)", color: naoVistos > 0 ? "#fbbf24" : "var(--muted)" }}
      >
        <Bell size={15} />
        {naoVistos > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 grid place-items-center rounded-full font-mono font-bold"
            style={{ minWidth: 15, height: 15, padding: "0 3px", fontSize: 9, background: "#f59e0b", color: "#111114" }}
          >
            {naoVistos > 9 ? "9+" : naoVistos}
          </span>
        )}
      </button>

      {aberto && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Notificações da transmissão macro">
          <button className="absolute inset-0" onClick={() => setAberto(false)} aria-label="Fechar" style={{ background: "transparent" }} />
          <div
            className="absolute overflow-hidden rounded-2xl"
            style={{
              top: 58, right: 10, width: "min(360px, calc(100vw - 20px))",
              background: "#131318", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            }}
          >
            <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">Transmissão macro</p>
              {rel?.dataPregao && <p className="font-mono text-[9px] text-zinc-600">pregão {dataBR(rel.dataPregao)}</p>}
            </div>

            <div className="max-h-[55vh] overflow-y-auto">
              {!rel && <p className="px-3 py-6 text-center text-[11px] text-zinc-500">Carregando…</p>}
              {rel && eventos.length === 0 && (
                <p className="px-3 py-6 text-center text-[11px] text-zinc-500">
                  Sem acontecimentos — todas as regras quiescentes ou em observação.
                </p>
              )}
              {eventos.map((e) => {
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
            </div>

            <Link
              href="/bolsas?transmissao=1"
              onClick={() => setAberto(false)}
              className="flex items-center justify-center gap-1.5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-zinc-300 transition-colors hover:bg-white/[0.06]"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
            >
              <RadarIcon size={11} /> Abrir transmissão no Radar
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
