"use client";

// Bens físicos — imóveis, carros e itens de alto valor (fora do mercado).
// Hoje o foco é CARROS: valor da tabela FIPE ao dia (API parallelum, cache
// diário) somado no topo, foto real via /api/bens/foto. Clicar num carro abre
// o POPUP de detalhes: foto grande, ficha técnica, valor FIPE e o histórico
// dos últimos meses da tabela (sparkline). Imóveis e Alto valor preparados.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Home as HomeIcon, Gem, Car, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { bemPorId } from "@/lib/bens";

interface VeiculoFipe {
  id: string; nome: string; detalhe: string; ok: boolean;
  valor?: string; valorNum?: number; fipeModelo?: string; codigoFipe?: string; mesReferencia?: string; erro?: string;
}
interface FipeResp { veiculos: VeiculoFipe[]; total: number; mesReferencia: string | null; ok: boolean }
interface PontoHist { mes: string; valor: string; valorNum: number }

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ── Sparkline do histórico FIPE ──────────────────────────────────────────────
function Sparkline({ pontos }: { pontos: PontoHist[] }) {
  if (pontos.length < 2) return null;
  const W = 280, H = 72, PAD = 6;
  const vals = pontos.map((p) => p.valorNum);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (pontos.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const pts = pontos.map((p, i) => `${x(i)},${y(p.valorNum)}`).join(" ");
  const varPct = ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100;
  const up = varPct >= 0;
  const cor = up ? "#7fd6a8" : "#f0a3a3";
  return (
    <div className="bns-hist">
      <div className="bns-hist-head">
        <span className="bns-hist-lbl">Histórico FIPE · {pontos.length} meses</span>
        <span className="bns-hist-var" style={{ color: cor }}>{up ? "▲" : "▼"} {Math.abs(varPct).toFixed(1)}%</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bns-hist-svg" preserveAspectRatio="none">
        <polygon points={`${PAD},${H - PAD} ${pts} ${W - PAD},${H - PAD}`} fill={cor} opacity="0.1" />
        <polyline points={pts} fill="none" stroke={cor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {pontos.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.valorNum)} r={i === pontos.length - 1 ? 3 : 1.8} fill={cor} />)}
      </svg>
      <div className="bns-hist-eixo">
        <span>{pontos[0].mes.trim()}</span>
        <span>{pontos[pontos.length - 1].mes.trim()}</span>
      </div>
    </div>
  );
}

// ── Popup de detalhes ────────────────────────────────────────────────────────
function DetalheModal({ v, onClose }: { v: VeiculoFipe; onClose: () => void }) {
  const bem = bemPorId(v.id);
  const [hist, setHist] = useState<PontoHist[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    const codigo = v.codigoFipe;
    if (!codigo || !bem) return;
    let vivo = true;
    setHistLoading(true);
    fetch(`/api/bens/fipe/historico?codigo=${encodeURIComponent(codigo)}&ano=${bem.anoModelo}`)
      .then((r) => r.json())
      .then((d: { pontos?: PontoHist[] }) => { if (vivo) setHist(d.pontos ?? []); })
      .catch(() => { if (vivo) setHist([]); })
      .finally(() => { if (vivo) setHistLoading(false); });
    return () => { vivo = false; };
  }, [v.codigoFipe, v.id, bem]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return createPortal(
    <div className="bns-md-back" onClick={onClose}>
      <div className="bns-md" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={v.nome}>
        <button className="bns-md-x" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        <div className="bns-md-foto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/bens/foto?id=${v.id}`} alt={v.nome} />
        </div>
        <div className="bns-md-body">
          <span className="bns-detalhe">{v.detalhe}</span>
          <h3 className="bns-md-nome">{v.nome}</h3>
          {v.fipeModelo && <p className="bns-md-fipenome">{v.fipeModelo}</p>}

          <div className="bns-md-valor">
            <div>
              <span className="bns-valor">{v.ok && v.valorNum ? fmtBRL(v.valorNum) : "—"}</span>
              <span className="bns-valor-lbl">valor FIPE{v.mesReferencia ? ` · ${v.mesReferencia.trim()}` : ""}</span>
            </div>
            {v.codigoFipe && <span className="bns-fipe-cod">FIPE {v.codigoFipe}</span>}
          </div>

          {histLoading && <p className="bns-md-hint">carregando histórico…</p>}
          {hist && hist.length >= 2 && <Sparkline pontos={hist} />}

          {bem && (
            <>
              <div className="bns-md-rule" />
              <h4 className="bns-md-sec">Ficha técnica</h4>
              <dl className="bns-specs">
                {bem.specs.map(([k, val]) => (
                  <div className="bns-spec" key={k}><dt>{k}</dt><dd>{val}</dd></div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function BensPage() {
  const [dados, setDados] = useState<FipeResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<VeiculoFipe | null>(null);
  const fechar = useCallback(() => setDetalhe(null), []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/bens/fipe")
      .then((r) => r.json())
      .then((d: FipeResp) => { if (vivo) setDados(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const total = dados?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Bens"
        description="Patrimônio físico — carros, imóveis e itens de alto valor, com valor de tabela ao dia."
      />

      {/* Total */}
      <div className="bns-hero">
        <span className="bns-hero-lbl">Total em bens</span>
        <span className="bns-hero-val">{carregando ? "…" : total > 0 ? fmtBRL(total) : "—"}</span>
        {dados?.mesReferencia && <span className="bns-hero-ref">Tabela FIPE · {dados.mesReferencia}</span>}
      </div>

      {/* Carros */}
      <section className="bns-sec">
        <h2 className="bns-h"><Car size={15} strokeWidth={1.7} /> Carros</h2>
        <div className="bns-grid">
          {(dados?.veiculos ?? [{ id: "tcross", nome: "VW T-Cross Highline 250 TSI", detalhe: "2025 · Cinza", ok: false }, { id: "onix", nome: "Chevrolet Onix Joy 1.0", detalhe: "2020 · Branco", ok: false }]).map((v) => (
            <article key={v.id} className="bns-card" onClick={() => setDetalhe(v)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetalhe(v); } }}>
              <div className="bns-foto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/bens/foto?id=${v.id}`} alt={v.nome} loading="lazy" />
              </div>
              <div className="bns-body">
                <span className="bns-detalhe">{v.detalhe}</span>
                <h3 className="bns-nome">{v.nome}</h3>
                <div className="bns-rule" />
                <div className="bns-foot">
                  <div className="bns-valor-blk">
                    <span className="bns-valor">{carregando ? "…" : v.ok && v.valorNum ? fmtBRL(v.valorNum) : "—"}</span>
                    <span className="bns-valor-lbl">{v.ok ? "valor FIPE" : carregando ? "consultando FIPE…" : `FIPE indisponível${v.erro ? ` — ${v.erro}` : ""}`}</span>
                  </div>
                  <span className="bns-mais">detalhes →</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Imóveis — preparado */}
      <section className="bns-sec">
        <h2 className="bns-h"><HomeIcon size={15} strokeWidth={1.7} /> Imóveis</h2>
        <div className="bns-empty">
          <span className="bns-empty-ico">🏠</span>
          <p>Nenhum imóvel ainda — espaço reservado.<br /><i>Quando chegar o primeiro, ele entra aqui com valor e valorização.</i></p>
        </div>
      </section>

      {/* Alto valor — preparado */}
      <section className="bns-sec">
        <h2 className="bns-h"><Gem size={15} strokeWidth={1.7} /> Alto valor</h2>
        <div className="bns-empty">
          <span className="bns-empty-ico">💎</span>
          <p>Relógios, joias, instrumentos, arte… — espaço reservado.<br /><i>Itens de alto valor entram aqui com valor estimado.</i></p>
        </div>
      </section>

      {detalhe && <DetalheModal v={detalhe} onClose={fechar} />}

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.bns-hero{display:flex;flex-direction:column;gap:2px;margin:2px 0 20px;padding:16px 20px;border-radius:16px;max-width:64rem;
  background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012));border:1px solid rgba(255,255,255,0.09);}
.bns-hero-lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);}
.bns-hero-val{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;font-size:clamp(26px,6vw,34px);
  font-weight:500;color:#f3f6f7;line-height:1.1;font-variant-numeric:tabular-nums;}
.bns-hero-ref{font-size:11px;color:var(--muted,#8b969b);}

.bns-sec{margin-bottom:24px;max-width:64rem;}
.bns-h{display:flex;align-items:center;gap:7px;margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  font-weight:600;color:#c4ced2;}
.bns-h svg{color:#8fb8c9;}

.bns-grid{display:grid;grid-template-columns:1fr;gap:14px;}
@media(min-width:720px){.bns-grid{grid-template-columns:1fr 1fr;}}
.bns-card{border-radius:16px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012));
  border:1px solid rgba(255,255,255,0.09);box-shadow:0 22px 44px -30px rgba(0,0,0,0.85);cursor:pointer;
  transition:transform .25s cubic-bezier(.2,.7,.2,1),border-color .25s,box-shadow .25s;}
.bns-card:hover{transform:translateY(-3px);border-color:rgba(143,184,201,0.35);
  box-shadow:0 30px 54px -30px rgba(0,0,0,0.9),0 0 30px -16px rgba(143,184,201,0.5);}
.bns-card:focus-visible{outline:1px solid rgba(143,184,201,0.6);outline-offset:2px;}
.bns-foto{aspect-ratio:16/8.4;background:#0d1114;overflow:hidden;}
.bns-foto img{width:100%;height:100%;object-fit:cover;display:block;}
.bns-body{padding:14px 16px 13px;display:flex;flex-direction:column;gap:6px;}
.bns-detalhe{font-size:10px;letter-spacing:.15em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);}
.bns-nome{margin:0;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;font-size:clamp(16px,4vw,20px);
  font-weight:500;color:#f3f6f7;line-height:1.1;}
.bns-rule{height:1px;background:rgba(255,255,255,0.08);margin-top:2px;}
.bns-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;}
.bns-valor-blk{display:flex;flex-direction:column;}
.bns-valor{font-size:clamp(17px,4.4vw,21px);font-weight:700;color:#7fd6a8;font-variant-numeric:tabular-nums;}
.bns-valor-lbl{font-size:10px;color:var(--muted,#8b969b);}
.bns-fipe-cod{font-family:ui-monospace,"SF Mono",monospace;font-size:10px;color:rgba(255,255,255,0.34);}
.bns-mais{font-size:10.5px;color:var(--muted,#8b969b);opacity:.7;white-space:nowrap;}
.bns-card:hover .bns-mais{color:#8fb8c9;opacity:1;}

.bns-empty{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:16px;
  background:rgba(255,255,255,0.018);border:1px dashed rgba(255,255,255,0.14);}
.bns-empty-ico{font-size:26px;filter:grayscale(0.4);opacity:.8;}
.bns-empty p{margin:0;font-size:12px;line-height:1.5;color:var(--muted,#8b969b);}
.bns-empty i{color:rgba(255,255,255,0.28);font-style:normal;font-size:11px;}

/* ── Popup de detalhes ── */
.bns-md-back{position:fixed;inset:0;z-index:80;background:rgba(4,7,9,0.66);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  display:flex;align-items:flex-end;justify-content:center;animation:bns-fade .2s ease;}
@media(min-width:640px){.bns-md-back{align-items:center;padding:24px;}}
@keyframes bns-fade{from{opacity:0;}to{opacity:1;}}
.bns-md{position:relative;width:100%;max-width:480px;max-height:92dvh;overflow-y:auto;border-radius:20px 20px 0 0;
  background:linear-gradient(180deg,#12171b,#0b0f12);border:1px solid rgba(255,255,255,0.1);
  box-shadow:0 -20px 60px rgba(0,0,0,0.6);animation:bns-up .28s cubic-bezier(.2,.7,.2,1);}
@media(min-width:640px){.bns-md{border-radius:20px;animation:bns-pop .24s cubic-bezier(.2,.7,.2,1);}}
@keyframes bns-up{from{transform:translateY(48px);opacity:.4;}to{transform:translateY(0);opacity:1;}}
@keyframes bns-pop{from{transform:scale(.96);opacity:.4;}to{transform:scale(1);opacity:1;}}
.bns-md-x{position:absolute;top:10px;right:10px;z-index:2;width:32px;height:32px;display:grid;place-items:center;border-radius:50%;
  color:#e7eef0;background:rgba(6,10,13,0.6);border:1px solid rgba(255,255,255,0.16);cursor:pointer;backdrop-filter:blur(8px);}
.bns-md-foto{aspect-ratio:16/8.6;background:#0d1114;}
.bns-md-foto img{width:100%;height:100%;object-fit:cover;display:block;}
.bns-md-body{padding:16px 18px calc(18px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:7px;}
.bns-md-nome{margin:0;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;
  font-size:clamp(20px,5.4vw,24px);font-weight:500;color:#f3f6f7;line-height:1.08;}
.bns-md-fipenome{margin:0;font-size:11px;color:var(--muted,#8b969b);font-style:italic;}
.bns-md-valor{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;margin-top:4px;
  padding:10px 12px;border-radius:12px;background:rgba(127,214,168,0.05);border:1px solid rgba(127,214,168,0.16);}
.bns-md-valor .bns-valor{font-size:clamp(20px,5.4vw,24px);}
.bns-md-valor > div{display:flex;flex-direction:column;}
.bns-md-hint{margin:2px 0 0;font-size:11px;color:var(--muted,#8b969b);}
.bns-md-rule{height:1px;background:rgba(255,255,255,0.08);margin:8px 0 2px;}
.bns-md-sec{margin:0;font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;font-weight:600;color:#c4ced2;}
.bns-specs{margin:2px 0 0;display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;}
.bns-spec{display:flex;flex-direction:column;gap:1px;}
.bns-spec dt{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#8b969b);}
.bns-spec dd{margin:0;font-size:12.5px;font-weight:600;color:#e6edef;}

.bns-hist{margin-top:6px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);}
.bns-hist-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.bns-hist-lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);}
.bns-hist-var{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;}
.bns-hist-svg{width:100%;height:64px;display:block;}
.bns-hist-eixo{display:flex;justify-content:space-between;margin-top:3px;font-size:9px;color:rgba(255,255,255,0.32);}
`;
