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
  ajustePct?: number; valorFinalNum?: number;
}
interface FipeResp { veiculos: VeiculoFipe[]; total: number; minhaParte?: number; fracao?: number; mesReferencia: string | null; ok: boolean }
interface PontoHist { mes: string; valor: string; valorNum: number }

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Foto do carro: a LOCAL (real, do dono, fundo padronizado) tem prioridade;
// sem ela, cai no proxy do Wikimedia.
const fotoSrc = (id: string) => bemPorId(id)?.fotoLocal ?? `/api/bens/foto?id=${id}`;

// ── Mini-sparkline do CARD (grade) — 12 meses da tabela, discreta ────────────
function MiniSpark({ pontos }: { pontos: PontoHist[] }) {
  if (pontos.length < 2) return null;
  const W = 96, H = 26, PAD = 2;
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
    <div className="bns-mini" title={`Tabela FIPE nos últimos ${pontos.length} meses`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="bns-mini-svg" preserveAspectRatio="none" aria-hidden>
        <polyline points={pts} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        <circle cx={x(pontos.length - 1)} cy={y(vals[vals.length - 1])} r="2.2" fill={cor} />
      </svg>
      <span className="bns-mini-var" style={{ color: cor }}>
        {up ? "▲" : "▼"} {Math.abs(varPct).toFixed(1)}% <i>{pontos.length}m</i>
      </span>
    </div>
  );
}

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

// ── Ajuste % sobre a FIPE — mora DENTRO do card (persistido na planilha) ─────
function AjusteInline({ v, onAjuste }: { v: VeiculoFipe; onAjuste: (id: string, pct: number) => Promise<string | null> }) {
  const [pct, setPct] = useState<number>(v.ajustePct ?? 0);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setPct(v.ajustePct ?? 0); }, [v.ajustePct, v.id]);

  const salvar = async () => {
    setSalvando(true); setMsg(null);
    const erro = await onAjuste(v.id, Number.isFinite(pct) ? pct : 0);
    setSalvando(false);
    setMsg(erro ? `✗ ${erro}` : "✓ salvo na planilha");
    setTimeout(() => setMsg(null), 4000);
  };

  return (
    // stopPropagation: mexer no ajuste NÃO abre o popup do card
    <div className="bns-aj" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="bns-aj-row">
        <span className="bns-aj-lbl">Ajuste FIPE</span>
        <button className="bns-aj-btn" disabled={!v.ok} onClick={() => setPct((p) => Math.max(-90, Math.round((p - 1) * 100) / 100))} aria-label="Diminuir 1%">−</button>
        <div className="bns-aj-input">
          <input
            type="number" inputMode="decimal" step="0.5" min={-90} max={100} disabled={!v.ok}
            value={Number.isFinite(pct) ? pct : 0}
            onChange={(e) => setPct(Number(e.target.value))}
          />
          <span>%</span>
        </div>
        <button className="bns-aj-btn" disabled={!v.ok} onClick={() => setPct((p) => Math.min(100, Math.round((p + 1) * 100) / 100))} aria-label="Aumentar 1%">+</button>
        <button className="bns-aj-save" onClick={() => void salvar()} disabled={salvando || !v.ok || pct === (v.ajustePct ?? 0)}>
          {salvando ? "…" : "Salvar"}
        </button>
      </div>
      {msg
        ? <span className={`bns-aj-msg${msg.startsWith("✓") ? " ok" : ""}`}>{msg}</span>
        : v.ok && v.valorNum && Number.isFinite(pct) && pct !== (v.ajustePct ?? 0)
          ? <span className="bns-aj-hint">vira <b>{fmtBRL(Math.round(v.valorNum * (1 + pct / 100)))}</b> ao salvar</span>
          : null}
    </div>
  );
}

// ── Popup de detalhes ────────────────────────────────────────────────────────
function DetalheModal({ v, histPronto, onClose, onAjuste }: { v: VeiculoFipe; histPronto?: PontoHist[] | null; onClose: () => void; onAjuste: (id: string, pct: number) => Promise<string | null> }) {
  const bem = bemPorId(v.id);
  const [hist, setHist] = useState<PontoHist[] | null>(histPronto ?? null);
  const [histLoading, setHistLoading] = useState(false);
  // Janela do gráfico/tabela: 6 ou 12 meses (fatia client-side, sem refetch).
  const [janela, setJanela] = useState<6 | 12>(12);

  useEffect(() => {
    // A grade já buscou o histórico (compartilhado via prop) — só busca aqui
    // se o card ainda não tinha (ex.: rede falhou na carga da página).
    if (histPronto && histPronto.length >= 2) { setHist(histPronto); return; }
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
  }, [v.codigoFipe, v.id, bem, histPronto]);

  const histJanela = hist && hist.length >= 2 ? hist.slice(-janela) : null;

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
          <img src={fotoSrc(v.id)} alt={v.nome} />
        </div>
        <div className="bns-md-body">
          <span className="bns-detalhe">{v.detalhe}</span>
          <h3 className="bns-md-nome">{v.nome}</h3>
          {v.fipeModelo && <p className="bns-md-fipenome">{v.fipeModelo}</p>}

          <div className="bns-md-valor">
            <div>
              <span className="bns-valor">{v.ok ? fmtBRL(v.valorFinalNum ?? v.valorNum ?? 0) : "—"}</span>
              <span className="bns-valor-lbl">
                {(v.ajustePct ?? 0) !== 0 && v.valorNum
                  ? `FIPE ${fmtBRL(v.valorNum)} ${v.ajustePct! > 0 ? "+" : "−"}${Math.abs(v.ajustePct!)}%`
                  : "valor FIPE"}
                {v.mesReferencia ? ` · ${v.mesReferencia.trim()}` : ""}
              </span>
            </div>
            {v.codigoFipe && <span className="bns-fipe-cod">FIPE {v.codigoFipe}</span>}
          </div>

          {/* Ajuste % sobre a tabela — persistido na planilha (app_config, escopo bens) */}
          <AjusteInline v={v} onAjuste={onAjuste} />

          {histLoading && <p className="bns-md-hint">carregando histórico…</p>}
          {histJanela && (
            <>
              <div className="bns-hist-toggle" role="tablist" aria-label="Janela do histórico">
                {([6, 12] as const).map((m) => (
                  <button key={m} role="tab" aria-selected={janela === m}
                    className={`bns-hist-tg${janela === m ? " on" : ""}`}
                    onClick={(e) => { e.stopPropagation(); setJanela(m); }}>
                    {m} meses
                  </button>
                ))}
              </div>
              <Sparkline pontos={histJanela} />
              {/* Tabela mês a mês (como a consulta FIPE do Webmotors): preço e
                  variação sobre o mês anterior. */}
              <table className="bns-hist-tab">
                <thead>
                  <tr><th>Mês</th><th>Preço FIPE</th><th>Δ mês</th></tr>
                </thead>
                <tbody>
                  {[...histJanela].reverse().map((p, i, arr) => {
                    const ant = arr[i + 1]; // reverso: o seguinte é o mês anterior
                    const dpct = ant ? ((p.valorNum - ant.valorNum) / ant.valorNum) * 100 : null;
                    return (
                      <tr key={p.mes}>
                        <td>{p.mes.trim()}</td>
                        <td>{fmtBRL(p.valorNum)}</td>
                        <td style={{ color: dpct == null ? undefined : dpct >= 0 ? "#7fd6a8" : "#f0a3a3" }}>
                          {dpct == null ? "—" : `${dpct >= 0 ? "+" : ""}${dpct.toFixed(2)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

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
  // Histórico FIPE por carro (12 meses) — buscado UMA vez para a grade e
  // reaproveitado pelo popup (best-effort: sem rede, o card fica sem spark).
  const [histMap, setHistMap] = useState<Record<string, PontoHist[]>>({});
  const fechar = useCallback(() => setDetalhe(null), []);

  useEffect(() => {
    const carros = dados?.veiculos ?? [];
    let vivo = true;
    for (const v of carros) {
      const bem = bemPorId(v.id);
      if (!v.codigoFipe || !bem || histMap[v.id]) continue;
      fetch(`/api/bens/fipe/historico?codigo=${encodeURIComponent(v.codigoFipe)}&ano=${bem.anoModelo}`)
        .then((r) => r.json())
        .then((d: { pontos?: PontoHist[] }) => {
          if (vivo && d.pontos && d.pontos.length >= 2) {
            setHistMap((m) => ({ ...m, [v.id]: d.pontos! }));
          }
        })
        .catch(() => { /* sem spark no card */ });
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/bens/fipe")
      .then((r) => r.json())
      .then((d: FipeResp) => { if (vivo) setDados(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  // Salva o ajuste na planilha e recarrega os valores FRESCOS (fura o cache
  // CDN com ?_t=). Devolve null no sucesso, ou a mensagem de erro.
  const salvarAjuste = useCallback(async (id: string, pct: number): Promise<string | null> => {
    try {
      const r = await fetch("/api/bens/ajuste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pct }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) return d.error ?? `HTTP ${r.status}`;
      const fresco = (await (await fetch(`/api/bens/fipe?_t=${Date.now()}`)).json()) as FipeResp;
      setDados(fresco);
      const novo = fresco.veiculos?.find((x) => x.id === id);
      if (novo) setDetalhe(novo);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "falha ao salvar";
    }
  }, []);

  const total = dados?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Bens"
        description="Patrimônio físico — carros, imóveis e itens de alto valor, com valor de tabela ao dia."
      />

      {/* Total — a visão é a MINHA parte (divisão de bens ÷2); a tabela cheia
          fica como referência. É a metade que soma no patrimônio da Home. */}
      <div className="bns-hero">
        <span className="bns-hero-lbl">Minha parte nos bens (÷2)</span>
        <span className="bns-hero-val">{carregando ? "…" : (dados?.minhaParte ?? 0) > 0 ? fmtBRL(dados!.minhaParte!) : "—"}</span>
        <span className="bns-hero-ref">
          {total > 0 ? <>Tabela cheia: {fmtBRL(total)}{dados?.mesReferencia ? <> · FIPE {dados.mesReferencia.trim()}</> : null} · entra no patrimônio da Home</> : "consultando FIPE…"}
        </span>
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
                <img src={fotoSrc(v.id)} alt={v.nome} loading="lazy" />
              </div>
              <div className="bns-body">
                <span className="bns-detalhe">{v.detalhe}</span>
                <h3 className="bns-nome">{v.nome}</h3>
                <div className="bns-rule" />
                {histMap[v.id] && <MiniSpark pontos={histMap[v.id]} />}
                <div className="bns-foot">
                  <div className="bns-valor-blk">
                    <span className="bns-valor">{carregando ? "…" : v.ok ? fmtBRL(v.valorFinalNum ?? v.valorNum ?? 0) : "—"}</span>
                    <span className="bns-valor-lbl">
                      {v.ok
                        ? (v.ajustePct ?? 0) !== 0
                          ? `FIPE ${v.ajustePct! > 0 ? "+" : "−"}${Math.abs(v.ajustePct!)}%`
                          : "valor FIPE"
                        : carregando ? "consultando FIPE…" : `FIPE indisponível${v.erro ? ` — ${v.erro}` : ""}`}
                    </span>
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

      {detalhe && <DetalheModal v={detalhe} histPronto={histMap[detalhe.id] ?? null} onClose={fechar} onAjuste={salvarAjuste} />}

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

/* Ajuste % sobre a FIPE — compacto, DENTRO do card (clicar aqui não abre o popup) */
.bns-aj{margin-top:8px;padding:8px 10px;border-radius:11px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);
  display:flex;flex-direction:column;gap:5px;cursor:default;}
.bns-aj-lbl{font-size:9px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);margin-right:auto;}
.bns-aj-row{display:flex;align-items:center;gap:6px;}
.bns-aj-btn{width:28px;height:28px;flex:none;display:grid;place-items:center;border-radius:8px;font-size:15px;line-height:1;cursor:pointer;
  color:#e6edef;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14);}
.bns-aj-btn:active{background:rgba(255,255,255,0.12);}
.bns-aj-btn:disabled{opacity:.35;cursor:default;}
.bns-aj-input{display:flex;align-items:center;gap:2px;width:74px;flex:none;padding:0 8px;border-radius:8px;background:#0a0d10;border:1px solid rgba(255,255,255,0.12);}
.bns-aj-input input{width:100%;font:inherit;font-size:13px;font-weight:700;color:#e9f2f4;background:transparent;border:none;outline:none;
  padding:6px 0;text-align:right;font-variant-numeric:tabular-nums;-moz-appearance:textfield;appearance:textfield;}
.bns-aj-input input::-webkit-outer-spin-button,.bns-aj-input input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
.bns-aj-input input:disabled{opacity:.4;}
.bns-aj-input span{font-size:11px;color:var(--muted,#8b969b);}
.bns-aj-save{font:inherit;font-size:11px;font-weight:700;color:#04121a;cursor:pointer;
  background:linear-gradient(180deg,#7fd6a8,#4aa87b);border:none;padding:7px 13px;border-radius:999px;}
.bns-aj-save:disabled{opacity:.4;cursor:default;}
.bns-aj-hint{font-size:10px;color:var(--muted,#8b969b);}
.bns-aj-hint b{color:#a9e6c8;}
.bns-aj-msg{font-size:10.5px;color:#ffb3b3;}
.bns-aj-msg.ok{color:#8ff0bf;}

.bns-hist{margin-top:6px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);}
.bns-hist-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.bns-hist-lbl{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);}
.bns-hist-var{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;}
.bns-hist-svg{width:100%;height:64px;display:block;}
.bns-hist-eixo{display:flex;justify-content:space-between;margin-top:3px;font-size:9px;color:rgba(255,255,255,0.32);}
/* Mini-sparkline do CARD (grade): linha discreta + variação do período */
.bns-mini{display:flex;align-items:center;gap:10px;margin:2px 0 6px;}
.bns-mini-svg{width:96px;height:26px;flex-shrink:0;}
.bns-mini-var{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;}
.bns-mini-var i{font-style:normal;font-weight:600;font-size:9.5px;color:rgba(255,255,255,0.35);margin-left:2px;}
/* Toggle 6/12 meses do popup */
.bns-hist-toggle{display:flex;gap:6px;margin-top:10px;}
.bns-hist-tg{font-size:10.5px;font-weight:600;padding:3px 10px;border-radius:999px;color:var(--muted,#8b969b);
  background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);cursor:pointer;transition:all .15s;}
.bns-hist-tg.on{color:#0d1214;background:#8fb8c9;border-color:#8fb8c9;}
/* Tabela mês a mês (estilo consulta FIPE) */
.bns-hist-tab{width:100%;margin-top:8px;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums;}
.bns-hist-tab th{font-size:9px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);
  text-align:left;padding:3px 6px;border-bottom:1px solid rgba(255,255,255,0.1);}
.bns-hist-tab td{padding:3.5px 6px;border-bottom:1px solid rgba(255,255,255,0.05);color:rgba(255,255,255,0.78);}
.bns-hist-tab th:last-child,.bns-hist-tab td:last-child{text-align:right;}
.bns-hist-tab th:nth-child(2),.bns-hist-tab td:nth-child(2){text-align:right;}
.bns-hist-tab tr:last-child td{border-bottom:none;}
`;
