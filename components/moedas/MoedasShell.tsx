"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Moedas — coleção numismática ESTÁTICA (lib/moedas-data.ts, gerada do export
// do CoinSnap; o dono envia o CSV no chat para atualizar). Mapa-múndi da
// coleção, filtros (país/metal/graduação/busca), cards com foto que VIRAM no
// hover (anverso ⇄ reverso) e dossiê por moeda. Moedas de prata ganham valor
// de derretimento ao preço spot de HOJE (SI=F via /api/moedas-colecao).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, Coins, Globe2, Gem, BadgeDollarSign, ArrowUpDown, Maximize2, RotateCw, Library, Loader2, ExternalLink, Layers } from "lucide-react";
import { COUNTRY_TO_ISO_NUM } from "@/lib/world-map";
import { ISO_NUM_TO_ISO2, flagEmoji } from "@/lib/radar/countries";
import { GRAD_LABEL, gradTone, conjuntoMonetario, type Moeda } from "@/lib/moedas";
import { MOEDAS_COLECAO, COLECAO_ATUALIZADA_EM } from "@/lib/moedas-data";
import { fetchJsonCached } from "@/lib/client-cache";
import type { PaisStat } from "@/components/moedas/MoedasMapa";

import MoedasMapa from "@/components/moedas/MoedasMapa";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function bandeira(pais: string): string {
  const iso = COUNTRY_TO_ISO_NUM[pais];
  return flagEmoji(iso ? ISO_NUM_TO_ISO2[iso] : null) || "🏳️";
}

// ── Moeda "física": foto redonda que vira no hover/toque ─────────────────────

function CoinFace({ src, alt, size }: { src: string; alt: string; size: number }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="rounded-full object-cover"
      style={{ width: size, height: size, boxShadow: "0 4px 18px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.12)" }}
    />
  );
}

function CoinFlip({ m, size, flipOnHover = true }: { m: Moeda; size: number; flipOnHover?: boolean }) {
  const [flipped, setFlipped] = useState(false);
  const temVerso = !!m.fotoReverso;
  return (
    <div
      className="group/coin relative select-none"
      style={{ width: size, height: size, perspective: 800 }}
      onClick={(e) => { if (temVerso) { e.stopPropagation(); setFlipped((v) => !v); } }}
      title={temVerso ? "Clique para virar" : undefined}
    >
      <div
        className={`relative h-full w-full transition-transform duration-500 ${flipOnHover && temVerso && !flipped ? "md:group-hover/coin:[transform:rotateY(180deg)]" : ""}`}
        style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : undefined }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          {m.fotoAnverso
            ? <CoinFace src={m.fotoAnverso} alt={`${m.denominacao} — anverso`} size={size} />
            : <div className="flex items-center justify-center rounded-full bg-white/5 text-2xl" style={{ width: size, height: size }}>🪙</div>}
        </div>
        {temVerso && (
          <div className="absolute inset-0 [backface-visibility:hidden]" style={{ transform: "rotateY(180deg)" }}>
            <CoinFace src={m.fotoReverso} alt={`${m.denominacao} — reverso`} size={size} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Card da grade ─────────────────────────────────────────────────────────────

function CoinCard({ m, onOpen }: { m: Moeda; onOpen: () => void }) {
  const tone = gradTone(m.graduacao);
  return (
    <button
      onClick={onOpen}
      className="flex flex-col items-center gap-2 rounded-2xl p-3 text-center transition-colors hover:bg-white/[0.05]"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="relative">
        <CoinFlip m={m} size={96} />
        {m.qtd > 1 && (
          <span className="absolute -right-1 -top-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-950" style={{ background: "#fbbf24" }}>
            ×{m.qtd}
          </span>
        )}
      </div>
      <div className="w-full min-w-0">
        <p className="truncate text-xs font-semibold text-zinc-100">{m.denominacao} · {m.ano || "—"}</p>
        <p className="truncate text-[10px] text-zinc-500">{bandeira(m.pais)} {m.pais}{m.assunto && m.assunto !== "Séries comuns" ? ` · ${m.assunto}` : ""}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs font-bold text-emerald-400">{fmtBRL(m.valorBrl)}</span>
        {m.graduacao && (
          <span className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold" style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}>
            {m.graduacao}
          </span>
        )}
        {m.metal === "Prata" && <Gem size={11} className="text-sky-300" />}
      </div>
    </button>
  );
}

// ── Tela cheia: foto grande com zoom (toque amplia, arrasta para explorar) ────

function CoinZoom({ m, onClose }: { m: Moeda; onClose: () => void }) {
  const [face, setFace] = useState<"anverso" | "reverso">("anverso");
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const temVerso = !!m.fotoReverso;
  const src = face === "anverso" ? m.fotoAnverso : m.fotoReverso;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: "rgba(2,3,8,0.98)", paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-100">{m.denominacao} · {m.ano || "—"}</p>
          <p className="text-[10px] text-zinc-500">{face === "anverso" ? "Anverso" : "Reverso"} · toque na moeda para {zoom ? "reduzir" : "ampliar"}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10" style={{ background: "rgba(255,255,255,0.07)" }}><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }}>
        <div className="flex min-h-full min-w-full items-center justify-center p-4">
          <img
            src={src}
            alt={`${m.denominacao} — ${face}`}
            referrerPolicy="no-referrer"
            onClick={() => setZoom((z) => !z)}
            className="cursor-zoom-in rounded-full"
            style={{
              width: zoom ? "185vw" : "min(92vw, 70vh, 620px)",
              maxWidth: "none",
              cursor: zoom ? "zoom-out" : "zoom-in",
              boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
              transition: "width 0.22s ease",
            }}
          />
        </div>
      </div>
      {temVerso && (
        <div className="flex justify-center gap-2 px-4 py-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <button
            onClick={() => { setFace((f) => (f === "anverso" ? "reverso" : "anverso")); setZoom(false); }}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-zinc-200"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <RotateCw size={13} /> Ver {face === "anverso" ? "reverso" : "anverso"}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Dossiê (modal) ────────────────────────────────────────────────────────────

interface NumistaInfo {
  titulo: string; emissor: string | null; anos: string | null; composicao: string | null;
  pesoG: number | null; diametroMm: number | null; espessuraMm: number | null;
  anverso: string | null; reverso: string | null; gravadores: string | null;
  tiragem: number | null; url: string | null;
  precos: Array<{ grau: string; brl: number }> | null;
}
interface InfoExtra { numista: NumistaInfo | null; numistaAtivo: boolean }

function CoinModal({ m, prataBrlPorGrama, onClose }: { m: Moeda; prataBrlPorGrama: number | null; onClose: () => void }) {
  const [telaCheia, setTelaCheia] = useState(false);
  // Cada exemplar físico tem a própria foto (estado real DAQUELA moeda) —
  // o seletor troca as fotos do flip e da tela cheia.
  const [exemplar, setExemplar] = useState(0);
  const fotos = m.fotos?.length ? m.fotos : [{ anverso: m.fotoAnverso, reverso: m.fotoReverso }];
  const fotoAtiva = fotos[Math.min(exemplar, fotos.length - 1)];
  const mExibida: Moeda = { ...m, fotoAnverso: fotoAtiva.anverso, fotoReverso: fotoAtiva.reverso };
  const [extra, setExtra] = useState<InfoExtra | null>(null);
  const [extraLoading, setExtraLoading] = useState(true);

  // Dossiê estendido: história por IA + catálogo Numista (cache 24h no cliente,
  // 7 dias no CDN — moeda é dado parado).
  useEffect(() => {
    let vivo = true;
    setExemplar(0);
    setExtra(null); setExtraLoading(true);
    const q = new URLSearchParams({
      krause: m.krause, pais: m.pais, ano: m.ano,
      denominacao: m.denominacao, assunto: m.assunto, composicao: m.composicao,
      v: "2", // versão do matching Numista — bust do CDN/cache quando o algoritmo muda
    });
    fetchJsonCached<InfoExtra>(`/api/moedas-colecao/info?${q}`, 24 * 60 * 60 * 1000)
      .then((d) => { if (vivo && d && !(d as { error?: string } & InfoExtra).error) setExtra(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setExtraLoading(false); });
    return () => { vivo = false; };
  }, [m]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Trava o scroll da página enquanto o dossiê está aberto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const tone = gradTone(m.graduacao);
  const meltHoje = m.pesoMetalG && prataBrlPorGrama ? m.pesoMetalG * prataBrlPorGrama : null;
  const linhas: Array<[string, string]> = [
    ["Emissor", m.emissor !== m.pais ? m.emissor : ""],
    ["Assunto", m.assunto],
    ["Catálogo", m.krause],
    ["Ano", m.ano],
    ["Casa da moeda", m.marca === "Sem marca da casa da moeda" ? "" : m.marca],
    ["Composição", m.composicao],
    ["Série", m.serie],
    ["Nota", m.nota],
  ];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 md:rounded-2xl"
        style={{ background: "radial-gradient(120% 100% at 50% 0%, #10131c 0%, #090b12 70%)", border: "1px solid rgba(255,255,255,0.1)", paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-zinc-100">{m.denominacao} · {m.ano || "—"}</h2>
            <p className="text-xs text-zinc-500">{bandeira(m.pais)} {m.pais}{m.qtd > 1 ? ` · ${m.qtd} exemplares` : ""}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="mb-1 flex justify-center">
          <CoinFlip key={exemplar} m={mExibida} size={228} flipOnHover={false} />
        </div>
        {fotos.length > 1 && (
          <div className="mb-2 flex items-center justify-center gap-1.5">
            {fotos.map((_, i) => (
              <button
                key={i}
                onClick={() => setExemplar(i)}
                className="rounded-full px-2.5 py-1 font-mono text-[10px] font-bold"
                style={{
                  background: i === exemplar ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${i === exemplar ? "rgba(245,158,11,0.5)" : "rgba(255,255,255,0.12)"}`,
                  color: i === exemplar ? "#fbbf24" : "#a1a1aa",
                }}
              >
                Exemplar {i + 1}
              </button>
            ))}
          </div>
        )}
        <div className="mb-4 flex items-center justify-center gap-3">
          <p className="text-center text-[10px] text-zinc-600">toque na moeda para virar</p>
          <button
            onClick={() => setTelaCheia(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-amber-300"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}
          >
            <Maximize2 size={12} /> Tela cheia
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl p-3" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}>
            <p className="text-[10px] uppercase tracking-wider text-emerald-500/80">Valor (catálogo)</p>
            <p className="font-mono text-lg font-bold text-emerald-400">{fmtBRL(m.valorBrl)}</p>
            {m.qtd > 1 && <p className="text-[10px] text-zinc-500">{fmtBRL(m.valorBrl * m.qtd)} nos {m.qtd} exemplares</p>}
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
              <span className="rounded px-1 font-mono text-[9px] font-bold" style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}>{m.graduacao || "—"}</span>
              Graduação
            </p>
            <p className="mt-0.5 text-xs font-semibold text-zinc-300">{GRAD_LABEL[m.graduacao] ?? "—"}</p>
          </div>
        </div>

        {m.pesoMetalG != null && (
          <div className="mb-4 rounded-xl p-3" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }}>
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-sky-400"><Gem size={11} /> Prata — {m.pesoMetalG} g finas</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {meltHoje != null && <span className="font-mono text-sm font-bold text-sky-300">{fmtBRL(meltHoje)} <span className="text-[10px] font-normal text-zinc-500">derretimento hoje</span></span>}
              {m.derretimentoBrl != null && <span className="font-mono text-[11px] text-zinc-500">{fmtBRL(m.derretimentoBrl)} no export</span>}
            </div>
          </div>
        )}

        {/* Catálogo Numista (aparece quando NUMISTA_API_KEY está configurada) */}
        {extraLoading && (
          <p className="mb-4 flex items-center gap-1.5 text-[11px] text-zinc-500"><Loader2 size={11} className="animate-spin" /> consultando o catálogo…</p>
        )}
        {extra?.numista && (
          <div className="mb-4 rounded-xl p-3" style={{ background: "rgba(56,189,248,0.05)", border: "1px solid rgba(56,189,248,0.18)" }}>
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-sky-300"><Library size={11} /> Catálogo Numista</p>

            {/* Preços estimados por graduação (BRL) — o estado da SUA moeda em destaque */}
            {extra.numista.precos && extra.numista.precos.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] text-zinc-500">Preço de mercado estimado (por estado de conservação)</p>
                <div className="flex flex-wrap gap-1.5">
                  {extra.numista.precos.map((x) => {
                    const meu = x.grau === m.graduacao || (m.graduacao === "MS" && x.grau === "UNC");
                    return (
                      <div
                        key={x.grau}
                        className="rounded-lg px-2 py-1 text-center"
                        style={{
                          background: meu ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${meu ? "rgba(16,185,129,0.45)" : "rgba(255,255,255,0.08)"}`,
                        }}
                      >
                        <p className={`font-mono text-[9px] font-bold ${meu ? "text-emerald-300" : "text-zinc-500"}`}>{x.grau}{meu ? " · sua" : ""}</p>
                        <p className={`font-mono text-[11px] font-semibold ${meu ? "text-emerald-300" : "text-zinc-300"}`}>{fmtBRL(x.brl)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {extra.numista.tiragem != null && (
                <div><p className="text-[10px] text-zinc-500">Tiragem ({m.ano.slice(0, 4)})</p><p className="font-mono font-semibold text-zinc-200">{extra.numista.tiragem.toLocaleString("pt-BR")}</p></div>
              )}
              {extra.numista.diametroMm != null && (
                <div><p className="text-[10px] text-zinc-500">Diâmetro</p><p className="font-mono text-zinc-200">{extra.numista.diametroMm} mm</p></div>
              )}
              {extra.numista.pesoG != null && (
                <div><p className="text-[10px] text-zinc-500">Peso</p><p className="font-mono text-zinc-200">{extra.numista.pesoG} g</p></div>
              )}
              {extra.numista.espessuraMm != null && (
                <div><p className="text-[10px] text-zinc-500">Espessura</p><p className="font-mono text-zinc-200">{extra.numista.espessuraMm} mm</p></div>
              )}
              {extra.numista.anos && (
                <div><p className="text-[10px] text-zinc-500">Período de emissão</p><p className="text-zinc-200">{extra.numista.anos}</p></div>
              )}
              {extra.numista.gravadores && (
                <div><p className="text-[10px] text-zinc-500">Gravador</p><p className="truncate text-zinc-200" title={extra.numista.gravadores}>{extra.numista.gravadores}</p></div>
              )}
            </div>
            {extra.numista.anverso && (
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400"><span className="text-zinc-500">Anverso:</span> {extra.numista.anverso}</p>
            )}
            {extra.numista.reverso && (
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400"><span className="text-zinc-500">Reverso:</span> {extra.numista.reverso}</p>
            )}
            {extra.numista.url && (
              <a href={extra.numista.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 hover:underline">
                Ficha completa no Numista <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {linhas.filter(([, v]) => !!v).map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4 border-b border-white/5 pb-1.5 text-xs">
              <span className="shrink-0 text-zinc-500">{k}</span>
              <span className="text-right text-zinc-200">{v}</span>
            </div>
          ))}
        </div>
        {telaCheia && <CoinZoom m={mExibida} onClose={() => setTelaCheia(false)} />}
      </div>
    </div>,
    document.body,
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

type Ordem = "valor-desc" | "valor-asc" | "ano-asc" | "ano-desc";

export default function MoedasShell() {
  const moedas = MOEDAS_COLECAO;
  const [spot, setSpot] = useState<{ prataBrlPorGrama: number | null }>({ prataBrlPorGrama: null });

  const [busca, setBusca] = useState("");
  const [pais, setPais] = useState<string | null>(null);
  const [metal, setMetal] = useState<string | null>(null);
  const [grad, setGrad] = useState<string | null>(null);
  const [conjunto, setConjunto] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<Ordem>("valor-desc");
  const [aberta, setAberta] = useState<Moeda | null>(null);

  useEffect(() => {
    fetch("/api/moedas-colecao")
      .then((r) => r.json())
      .then((d) => setSpot({ prataBrlPorGrama: d.prataBrlPorGrama ?? null }))
      .catch(() => {});
  }, []);

  const porPais = useMemo<PaisStat[]>(() => {
    const map = new Map<string, PaisStat>();
    for (const m of moedas ?? []) {
      const e = map.get(m.pais) ?? { pais: m.pais, qtd: 0, valor: 0 };
      e.qtd += m.qtd; e.valor += m.valorBrl * m.qtd;
      map.set(m.pais, e);
    }
    return [...map.values()].sort((a, b) => b.qtd - a.qtd);
  }, [moedas]);

  const metais = useMemo(() => [...new Set((moedas ?? []).map((m) => m.metal))].sort(), [moedas]);
  const grads = useMemo(() => [...new Set((moedas ?? []).map((m) => m.graduacao).filter(Boolean))].sort(), [moedas]);

  // ── Conjuntos (padrões monetários) — a "alocação" da coleção ───────────────
  // Cada era brasileira (Réis, Cruzeiro, Cruzado, Real…) e cada unidade
  // estrangeira vira um conjunto, com contagem, valor e fatia do total.
  const CORES_CONJUNTO = ["#fbbf24", "#34d399", "#60a5fa", "#f472b6", "#a78bfa", "#f87171", "#2dd4bf", "#fb923c", "#e879f9", "#a3e635", "#facc15", "#94a3b8", "#38bdf8", "#fda4af"];
  const conjuntos = useMemo(() => {
    const map = new Map<string, { nome: string; periodo?: string; ordem: number; exemplares: number; distintas: number; valor: number; anoMin: number | null; anoMax: number | null }>();
    let valorColecao = 0;
    for (const m of moedas ?? []) {
      const c = conjuntoMonetario(m);
      const e = map.get(c.nome) ?? { nome: c.nome, periodo: c.periodo, ordem: c.ordem, exemplares: 0, distintas: 0, valor: 0, anoMin: null, anoMax: null };
      e.exemplares += m.qtd;
      e.distintas += 1;
      e.valor += m.valorBrl * m.qtd;
      valorColecao += m.valorBrl * m.qtd;
      if (m.anoNum) {
        e.anoMin = e.anoMin === null ? m.anoNum : Math.min(e.anoMin, m.anoNum);
        e.anoMax = e.anoMax === null ? m.anoNum : Math.max(e.anoMax, m.anoNum);
      }
      map.set(c.nome, e);
    }
    return [...map.values()]
      .sort((a, b) => a.ordem - b.ordem || b.valor - a.valor || a.nome.localeCompare(b.nome))
      .map((c, i) => ({ ...c, pct: valorColecao > 0 ? (c.valor / valorColecao) * 100 : 0, cor: CORES_CONJUNTO[i % CORES_CONJUNTO.length] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moedas]);

  const filtradas = useMemo(() => {
    let out = moedas ?? [];
    if (pais) out = out.filter((m) => m.pais === pais);
    if (metal) out = out.filter((m) => m.metal === metal);
    if (grad) out = out.filter((m) => m.graduacao === grad);
    if (conjunto) out = out.filter((m) => conjuntoMonetario(m).nome === conjunto);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      out = out.filter((m) =>
        `${m.denominacao} ${m.assunto} ${m.pais} ${m.ano} ${m.krause} ${m.composicao}`.toLowerCase().includes(q));
    }
    const cmp: Record<Ordem, (a: Moeda, b: Moeda) => number> = {
      "valor-desc": (a, b) => b.valorBrl - a.valorBrl,
      "valor-asc": (a, b) => a.valorBrl - b.valorBrl,
      "ano-asc": (a, b) => (a.anoNum ?? 9999) - (b.anoNum ?? 9999),
      "ano-desc": (a, b) => (b.anoNum ?? 0) - (a.anoNum ?? 0),
    };
    return [...out].sort(cmp[ordem]);
  }, [moedas, pais, metal, grad, conjunto, busca, ordem]);

  const st = useMemo(() => {
    let valorTotal = 0, exemplares = 0, prataGramas = 0, meltCsv = 0;
    const paises = new Set<string>();
    for (const m of moedas) {
      exemplares += m.qtd;
      valorTotal += m.valorBrl * m.qtd;
      if (m.pais) paises.add(m.pais);
      if (m.pesoMetalG) {
        prataGramas += m.pesoMetalG * m.qtd;
        meltCsv += (m.derretimentoBrl ?? 0) * m.qtd;
      }
    }
    return {
      exemplares,
      unicas: moedas.length,
      paises: paises.size,
      valorTotal,
      prataGramas: Math.round(prataGramas * 100) / 100,
      meltCsv,
      meltHoje: spot.prataBrlPorGrama != null ? prataGramas * spot.prataBrlPorGrama : null,
    };
  }, [moedas, spot]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header + stats */}
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-100"><Coins size={18} className="text-amber-400" /> Coleção de Moedas</h1>
        <p className="text-xs text-zinc-500">Catálogo CoinSnap · {st.exemplares} exemplares</p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { icon: <Coins size={13} />, label: "Exemplares", valor: `${st.exemplares}`, sub: `${st.unicas} moedas distintas` },
          { icon: <BadgeDollarSign size={13} />, label: "Valor de catálogo", valor: fmtBRL(st.valorTotal), sub: "CoinSnap" },
          { icon: <Globe2 size={13} />, label: "Países", valor: `${st.paises}`, sub: porPais.slice(0, 4).map((p) => bandeira(p.pais)).join(" ") },
          {
            icon: <Gem size={13} />, label: "Prata na coleção", valor: st.prataGramas > 0 ? `${st.prataGramas.toLocaleString("pt-BR")} g` : "—",
            sub: st.meltHoje != null && st.prataGramas > 0 ? `${fmtBRL(st.meltHoje)} ao spot de hoje` : (st.prataGramas > 0 ? `${fmtBRL(st.meltCsv)} no export` : "sem moedas de prata"),
          },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">{c.icon} {c.label}</p>
            <p className="mt-1 font-mono text-base font-bold text-zinc-100">{c.valor}</p>
            <p className="truncate text-[10px] text-zinc-500">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Mapa */}
      <MoedasMapa porPais={porPais} selecionado={pais} onSelect={setPais} />

      {/* Conjuntos — alocação por padrão monetário (Réis, Cruzeiro, Real, …) */}
      <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
            <Layers size={13} /> Conjuntos — alocação por padrão monetário
          </p>
          {conjunto && (
            <button onClick={() => setConjunto(null)} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
              {conjunto} <X size={10} />
            </button>
          )}
        </div>

        {/* Barra de alocação (fatia do valor de catálogo) */}
        <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
          {conjuntos.map((c) => (
            <div
              key={c.nome}
              title={`${c.nome} — ${fmtBRL(c.valor)} (${c.pct.toFixed(1)}%)`}
              style={{ width: `${c.pct}%`, background: c.cor, opacity: conjunto && conjunto !== c.nome ? 0.22 : 1, transition: "opacity .2s" }}
            />
          ))}
        </div>

        {/* Cards dos conjuntos (clique filtra a grade) */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {conjuntos.map((c) => {
            const ativo = conjunto === c.nome;
            const anos = c.anoMin !== null ? (c.anoMin === c.anoMax ? `${c.anoMin}` : `${c.anoMin}–${c.anoMax}`) : null;
            return (
              <button
                key={c.nome}
                onClick={() => setConjunto(ativo ? null : c.nome)}
                className="rounded-xl p-2 text-left transition-colors"
                style={{
                  background: ativo ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${ativo ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold" style={{ color: ativo ? "#fbbf24" : "#e4e4e7" }}>
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c.cor }} />
                  {c.nome}
                </p>
                <p className="mt-0.5 truncate text-[9px] text-zinc-500">
                  {c.periodo ?? anos ?? "—"} · {c.exemplares} exemplar{c.exemplares !== 1 ? "es" : ""}{c.distintas !== c.exemplares ? ` (${c.distintas} distintas)` : ""}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-200">
                  {fmtBRL(c.valor)} <span className="text-zinc-500">· {c.pct.toFixed(1)}%</span>
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar denominação, assunto, KM#, ano…"
              className="w-full rounded-lg bg-white/[0.05] py-2 pl-8 pr-3 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-amber-500/50"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>
          <select value={metal ?? ""} onChange={(e) => setMetal(e.target.value || null)} className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-200" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            <option value="">Metal: todos</option>
            {metais.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={grad ?? ""} onChange={(e) => setGrad(e.target.value || null)} className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-200" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            <option value="">Graduação: todas</option>
            {grads.map((v) => <option key={v} value={v}>{v} — {GRAD_LABEL[v] ?? v}</option>)}
          </select>
          <button
            onClick={() => setOrdem((o) => (o === "valor-desc" ? "valor-asc" : o === "valor-asc" ? "ano-asc" : o === "ano-asc" ? "ano-desc" : "valor-desc"))}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-2 text-xs text-zinc-300"
            style={{ border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <ArrowUpDown size={12} />
            {ordem === "valor-desc" ? "Maior valor" : ordem === "valor-asc" ? "Menor valor" : ordem === "ano-asc" ? "Mais antiga" : "Mais recente"}
          </button>
        </div>

        {/* Chips de país */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: "touch" }}>
          <button
            onClick={() => setPais(null)}
            className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-medium"
            style={{ background: !pais ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)", border: `1px solid ${!pais ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.1)"}`, color: !pais ? "#fbbf24" : "#a1a1aa" }}
          >
            Todos ({st.exemplares})
          </button>
          {porPais.map((p) => {
            const ativo = pais === p.pais;
            return (
              <button
                key={p.pais}
                onClick={() => setPais(ativo ? null : p.pais)}
                className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-medium"
                style={{ background: ativo ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.05)", border: `1px solid ${ativo ? "rgba(245,158,11,0.45)" : "rgba(255,255,255,0.1)"}`, color: ativo ? "#fbbf24" : "#a1a1aa" }}
              >
                {bandeira(p.pais)} {p.pais} ({p.qtd})
              </button>
            );
          })}
        </div>
      </div>

      {/* Grade */}
      {filtradas.length === 0 ? (
        <p className="py-10 text-center text-xs text-zinc-600">Nenhuma moeda com esses filtros.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtradas.map((m, i) => (
            <CoinCard key={`${m.krause}-${m.ano}-${m.graduacao}-${i}`} m={m} onOpen={() => setAberta(m)} />
          ))}
        </div>
      )}

      <p className="pt-2 text-[10px] text-zinc-600">
        Coleção CoinSnap · atualizada em {COLECAO_ATUALIZADA_EM}. Para atualizar, envie o novo CSV ao assistente.
      </p>

      {aberta && <CoinModal m={aberta} prataBrlPorGrama={spot.prataBrlPorGrama} onClose={() => setAberta(null)} />}
    </div>
  );
}
