"use client";

// ─────────────────────────────────────────────────────────────────────────────
// JurosPanel — juros futuros do Brasil dentro do Radar. Abre no lugar do mapa
// (mesmo padrão do CommoditiesPanel/TransmissaoPanel).
//
// A leitura visual central: as curvas NOMINAL (Prefixado) e REAL (IPCA+) no
// MESMO eixo — a área entre elas É a inflação implícita. Assim você vê de uma
// vez o nível do juro, o formato da curva e o que o mercado precifica de IPCA.
// Toque/mouse no gráfico inspeciona o vértice mais próximo.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, LineChart, AlertTriangle, Loader2 } from "lucide-react";
import type { JurosResponse, Vertice } from "@/lib/juros/types";

const COR_NOMINAL = "#E8A33D"; // prefixado
const COR_REAL = "#38BDF8";    // IPCA+
const COR_SELIC = "#A78BFA";

const DARK: React.CSSProperties = {
  "--panel": "#0e0e12", "--line": "rgba(255,255,255,0.08)", "--text": "#e4e4e7",
  "--text-2": "#a1a1aa", "--muted": "#8b8b93", "--faint": "#6b6b73",
} as React.CSSProperties;

const f2 = (x: number) => x.toFixed(2).replace(".", ",");
const anoDe = (iso: string) => iso.slice(0, 4);

// ── Gráfico da curva ─────────────────────────────────────────────────────────

interface Pt { v: Vertice; x: number; y: number }

function CurvaChart({
  nominal, reais, selicHoje, onPick, picked,
}: {
  nominal: Vertice[]; reais: Vertice[]; selicHoje: number | null;
  onPick: (v: Vertice | null) => void; picked: Vertice | null;
}) {
  const W = 720, H = 260;
  const PAD = { l: 40, r: 14, t: 16, b: 30 };
  const ref = useRef<SVGSVGElement>(null);

  const { pn, pr, xs, ys, yMin, yMax } = useMemo(() => {
    const todos = [...nominal, ...reais];
    if (!todos.length) return { pn: [] as Pt[], pr: [] as Pt[], xs: (n: number) => n, ys: (n: number) => n, yMin: 0, yMax: 1 };
    const xMin = 0;
    const xMax = Math.max(...todos.map((v) => v.anos)) * 1.04;
    const taxas = todos.map((v) => v.taxa).concat(selicHoje != null ? [selicHoje] : []);
    const lo = Math.min(...taxas), hi = Math.max(...taxas);
    const folga = Math.max(0.6, (hi - lo) * 0.18);
    const yMin = Math.max(0, lo - folga), yMax = hi + folga;
    const xs = (a: number) => PAD.l + ((a - xMin) / (xMax - xMin || 1)) * (W - PAD.l - PAD.r);
    const ys = (t: number) => PAD.t + (1 - (t - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
    const map = (arr: Vertice[]): Pt[] => arr.map((v) => ({ v, x: xs(v.anos), y: ys(v.taxa) }));
    return { pn: map(nominal), pr: map(reais), xs, ys, yMin, yMax };
  }, [nominal, reais, selicHoje]);

  if (!pn.length && !pr.length) {
    return <p className="font-mono py-10 text-center" style={{ fontSize: 11, color: "var(--faint)" }}>Sem curva disponível.</p>;
  }

  const linha = (p: Pt[]) => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");

  // Área entre as curvas = inflação implícita. SÓ vale no trecho em que as duas
  // curvas coexistem: a prefixada costuma terminar em ~10 anos e a IPCA+ ir até
  // 2060 — sem recorte, o polígono viraria uma cunha gigante ligando pontas que
  // não se comparam. Recorta em min(último prefixado, último IPCA+), com o ponto
  // final interpolado para a área encostar exatamente no limite.
  const clip = (p: Pt[], xMax: number): Pt[] => {
    const dentro = p.filter((q) => q.x <= xMax);
    const fora = p.find((q) => q.x > xMax);
    const ultimo = dentro[dentro.length - 1];
    if (fora && ultimo) {
      const t = (xMax - ultimo.x) / (fora.x - ultimo.x);
      dentro.push({ v: ultimo.v, x: xMax, y: ultimo.y + (fora.y - ultimo.y) * t });
    }
    return dentro;
  };
  let areaImplicita = "";
  if (pn.length > 1 && pr.length > 1) {
    const xComum = Math.min(pn[pn.length - 1].x, pr[pr.length - 1].x);
    const an = clip(pn, xComum);
    const ar = clip(pr, xComum);
    if (an.length > 1 && ar.length > 1) {
      areaImplicita = `${linha(an)} ${[...ar].reverse().map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")}`;
    }
  }

  const ticksY = 4;
  const gridY = Array.from({ length: ticksY + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / ticksY);

  const pick = (clientX: number, clientY: number) => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const y = ((clientY - r.top) / r.height) * H;
    let best: Pt | null = null, d = Infinity;
    for (const p of [...pn, ...pr]) {
      const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (dd < d) { d = dd; best = p; }
    }
    if (best && d < 60 * 60) onPick(best.v); else onPick(null);
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full touch-none select-none"
      style={{ height: 260 }}
      onMouseMove={(e) => pick(e.clientX, e.clientY)}
      onMouseLeave={() => onPick(null)}
      onTouchStart={(e) => { const t = e.touches[0]; if (t) pick(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches[0]; if (t) pick(t.clientX, t.clientY); }}
    >
      {/* grade + eixo Y */}
      {gridY.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} x2={W - PAD.r} y1={ys(t)} y2={ys(t)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
          <text x={PAD.l - 6} y={ys(t) + 3} textAnchor="end" fontSize="9" fill="#6b6b73" fontFamily="ui-monospace,monospace">{t.toFixed(1)}</text>
        </g>
      ))}
      {/* eixo X: prazos */}
      {[2, 5, 10, 15, 20, 25, 30].filter((a) => xs(a) < W - PAD.r).map((a) => (
        <text key={a} x={xs(a)} y={H - 10} textAnchor="middle" fontSize="9" fill="#6b6b73" fontFamily="ui-monospace,monospace">{a}a</text>
      ))}

      {/* Selic de hoje — âncora do curto prazo */}
      {selicHoje != null && selicHoje >= yMin && selicHoje <= yMax && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={ys(selicHoje)} y2={ys(selicHoje)} stroke={COR_SELIC} strokeWidth="1" strokeDasharray="4 4" opacity="0.75" />
          <text x={W - PAD.r} y={ys(selicHoje) - 5} textAnchor="end" fontSize="9" fill={COR_SELIC} fontFamily="ui-monospace,monospace">Selic {f2(selicHoje)}%</text>
        </g>
      )}

      {/* área = inflação implícita */}
      {areaImplicita && <polygon points={areaImplicita} fill={COR_NOMINAL} opacity="0.10" />}

      {/* curvas */}
      {pr.length > 1 && <polyline points={linha(pr)} fill="none" stroke={COR_REAL} strokeWidth="2" strokeLinejoin="round" />}
      {pn.length > 1 && <polyline points={linha(pn)} fill="none" stroke={COR_NOMINAL} strokeWidth="2" strokeLinejoin="round" />}

      {/* vértices */}
      {pr.map((p, i) => <circle key={`r${i}`} cx={p.x} cy={p.y} r={picked === p.v ? 5 : 3} fill={COR_REAL} />)}
      {pn.map((p, i) => <circle key={`n${i}`} cx={p.x} cy={p.y} r={picked === p.v ? 5 : 3} fill={COR_NOMINAL} />)}

      {/* guia do vértice selecionado */}
      {picked && [...pn, ...pr].filter((p) => p.v === picked).map((p, i) => (
        <line key={i} x1={p.x} x2={p.x} y1={PAD.t} y2={H - PAD.b} stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      ))}
    </svg>
  );
}

// ── Trajetória da Selic (Focus) ──────────────────────────────────────────────

function SelicChart({ pontos, selicHoje }: { pontos: JurosResponse["trajetoriaSelic"]; selicHoje: number | null }) {
  const W = 720, H = 230;
  const PAD = { l: 40, r: 14, t: 16, b: 38 };
  if (!pontos.length) return <p className="font-mono py-10 text-center" style={{ fontSize: 11, color: "var(--faint)" }}>Trajetória indisponível.</p>;

  const vals = pontos.map((p) => p.mediana).concat(selicHoje != null ? [selicHoje] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const folga = Math.max(0.5, (hi - lo) * 0.25);
  const yMin = lo - folga, yMax = hi + folga;
  const bw = (W - PAD.l - PAD.r) / pontos.length;
  const ys = (t: number) => PAD.t + (1 - (t - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);

  // degraus (step) — a Selic muda em saltos por reunião, não em rampa
  const steps: string[] = [];
  pontos.forEach((p, i) => {
    const x0 = PAD.l + i * bw, x1 = x0 + bw, y = ys(p.mediana);
    steps.push(`${x0},${y} ${x1},${y}`);
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 230 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
        const t = yMin + (yMax - yMin) * f;
        return (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={ys(t)} y2={ys(t)} stroke="rgba(255,255,255,0.07)" />
            <text x={PAD.l - 6} y={ys(t) + 3} textAnchor="end" fontSize="9" fill="#6b6b73" fontFamily="ui-monospace,monospace">{t.toFixed(1)}</text>
          </g>
        );
      })}
      {selicHoje != null && selicHoje >= yMin && selicHoje <= yMax && (
        <>
          <line x1={PAD.l} x2={W - PAD.r} y1={ys(selicHoje)} y2={ys(selicHoje)} stroke="#fff" strokeWidth="1" strokeDasharray="4 4" opacity="0.45" />
          {/* à DIREITA: no início colidia com o rótulo do 1º ponto */}
          <text x={W - PAD.r} y={ys(selicHoje) - 5} textAnchor="end" fontSize="9" fill="#d4d4d8" fontFamily="ui-monospace,monospace">hoje {f2(selicHoje)}%</text>
        </>
      )}
      <polyline points={steps.join(" ")} fill="none" stroke={COR_SELIC} strokeWidth="2.5" strokeLinejoin="round" />
      {pontos.map((p, i) => {
        const x = PAD.l + i * bw + bw / 2;
        return (
          <g key={p.reuniao}>
            <circle cx={x} cy={ys(p.mediana)} r="3" fill={COR_SELIC} />
            <text x={x} y={ys(p.mediana) - 9} textAnchor="middle" fontSize="9" fill="#e4e4e7" fontFamily="ui-monospace,monospace">{f2(p.mediana)}</text>
            <text x={x} y={H - 20} textAnchor="middle" fontSize="8.5" fill="#8b8b93" fontFamily="ui-monospace,monospace">{p.reuniao.replace("/", "/​")}</text>
          </g>
        );
      })}
      <text x={PAD.l} y={H - 5} fontSize="8.5" fill="#6b6b73" fontFamily="ui-monospace,monospace">mediana esperada por reunião do Copom · Focus/BCB</text>
    </svg>
  );
}

// ── Tile de métrica ──────────────────────────────────────────────────────────
function Tile({ label, valor, sub, cor }: { label: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div className="px-3 py-2.5" style={{ border: "1px solid var(--line)", background: "rgba(255,255,255,0.03)" }}>
      <p className="font-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: "var(--muted)" }}>{label}</p>
      <p className="font-mono" style={{ fontSize: 18, fontWeight: 800, color: cor ?? "var(--text)", marginTop: 3 }}>{valor}</p>
      {sub && <p className="font-mono" style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 1 }}>{sub}</p>}
    </div>
  );
}

// ── Painel ───────────────────────────────────────────────────────────────────

export default function JurosPanel({ onClose, dossierOpen = false }: { onClose: () => void; dossierOpen?: boolean }) {
  const [data, setData] = useState<JurosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"curva" | "selic">("curva");
  const [picked, setPicked] = useState<Vertice | null>(null);

  const carregar = () => {
    setLoading(true); setErro(null);
    fetch("/api/radar/juros")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setErro(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  };
  useEffect(carregar, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const a = data?.analise;
  const beDoPicked = useMemo(() => {
    if (!picked || !data) return null;
    return data.breakevens.find((b) => b.vencimentoNominal === picked.vencimento || b.vencimentoReal === picked.vencimento) ?? null;
  }, [picked, data]);

  return (
    <div
      className={`fixed inset-0 z-[65] flex flex-col overflow-hidden md:absolute md:inset-y-0 md:left-0 md:z-[64] md:rounded-2xl ${dossierOpen ? "md:right-[380px]" : "md:right-0"}`}
      style={{ ...DARK, background: "radial-gradient(120% 100% at 50% 0%, #0d1018 0%, #070912 70%)", paddingTop: "env(safe-area-inset-top)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button onClick={onClose} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/10" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <ArrowLeft size={14} /> Mapa
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <LineChart size={15} className="shrink-0 text-amber-400" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-zinc-100">Juros futuros · Brasil</h2>
            <p className="truncate text-[10px] text-zinc-500">
              Curva do Tesouro Direto e trajetória da Selic (Focus){data?.fechamento ? ` · ${data.fechamento}` : ""}
            </p>
          </div>
        </div>
        <button onClick={carregar} disabled={loading} className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 disabled:opacity-40" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} title="Atualizar">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-4">
        <div className="mx-auto max-w-3xl space-y-3">

          {loading && !data && (
            <div className="flex items-center gap-2 py-10 justify-center" style={{ color: "var(--muted)" }}>
              <Loader2 size={16} className="animate-spin" /><span style={{ fontSize: 13 }}>Buscando a curva de juros…</span>
            </div>
          )}
          {erro && <p style={{ fontSize: 13, color: "#F0504A" }}>Falha ao carregar: {erro}</p>}

          {data && (
            <>
              {/* leitura em português */}
              {a && (
                <div className="px-3.5 py-3" style={{ background: "var(--panel)", border: "1px solid var(--line)", borderLeft: `3px solid ${COR_NOMINAL}` }}>
                  <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text)" }}>{a.leitura}</p>
                </div>
              )}

              {/* métricas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Tile label="Selic hoje" valor={data.selicHoje != null ? `${f2(data.selicHoje)}%` : "—"} sub="meta Copom" cor={COR_SELIC} />
                <Tile label="Juro longo" valor={a?.longo ? `${f2(a.longo.taxa)}%` : "—"} sub={a?.longo ? `venc. ${anoDe(a.longo.vencimento)}` : undefined} cor={COR_NOMINAL} />
                <Tile label="Juro real longo" valor={a?.juroRealLongo != null ? `${f2(a.juroRealLongo)}%` : "—"} sub="acima do IPCA" cor={COR_REAL} />
                <Tile
                  label="Inclinação"
                  valor={a ? `${a.inclinacaoBps > 0 ? "+" : ""}${a.inclinacaoBps} bps` : "—"}
                  sub={a?.formato}
                  cor={a?.formato === "invertida" ? "#F0504A" : a?.formato === "inclinada" ? "#3FB950" : "var(--text)"}
                />
              </div>

              {/* abas */}
              <div className="flex gap-1.5">
                {([["curva", "Curva de juros"], ["selic", "Trajetória da Selic"]] as const).map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setAba(k)}
                    className="font-mono rounded-full px-3 py-1.5"
                    style={{
                      fontSize: 11, fontWeight: 600,
                      background: aba === k ? "rgba(232,163,61,0.16)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${aba === k ? "rgba(232,163,61,0.5)" : "var(--line)"}`,
                      color: aba === k ? COR_NOMINAL : "var(--muted)",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="px-2 py-2" style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
                {aba === "curva" ? (
                  <>
                    <div className="flex items-center gap-4 px-2 pt-1 pb-2 flex-wrap" style={{ fontSize: 10.5 }}>
                      <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                        <span style={{ width: 12, height: 2.5, background: COR_NOMINAL, display: "inline-block" }} /> Prefixado (nominal)
                      </span>
                      <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                        <span style={{ width: 12, height: 2.5, background: COR_REAL, display: "inline-block" }} /> IPCA+ (real)
                      </span>
                      <span className="inline-flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
                        <span style={{ width: 12, height: 8, background: COR_NOMINAL, opacity: 0.18, display: "inline-block" }} /> área = inflação implícita
                      </span>
                    </div>
                    <CurvaChart nominal={data.prefixados} reais={data.reais} selicHoje={data.selicHoje} onPick={setPicked} picked={picked} />
                    {/* inspetor do vértice */}
                    <div className="px-2 pb-1" style={{ minHeight: 40 }}>
                      {picked ? (
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: "var(--text)" }}>{picked.titulo}</span>
                          <span className="font-mono" style={{ color: picked.indexador === "IPCA" ? COR_REAL : COR_NOMINAL, fontWeight: 700 }}>
                            {f2(picked.taxa)}% a.a.{picked.indexador === "IPCA" ? " + IPCA" : ""}
                          </span>
                          <span className="font-mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                            venc. {picked.vencimento} · {picked.anos.toFixed(1)} anos
                            {picked.precoUnitario ? ` · R$ ${f2(picked.precoUnitario)}` : ""}
                            {picked.juroSemestral ? " · juros semestrais" : ""}
                          </span>
                          {beDoPicked && (
                            <span className="font-mono" style={{ color: "var(--text-2)", fontSize: 11 }}>
                              → inflação implícita {f2(beDoPicked.implicita)}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="font-mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>Toque (ou passe o mouse) num ponto para inspecionar o título.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <SelicChart pontos={data.trajetoriaSelic} selicHoje={data.selicHoje} />
                )}
              </div>

              {/* tabela de vértices */}
              {aba === "curva" && data.breakevens.length > 0 && (
                <div style={{ background: "var(--panel)", border: "1px solid var(--line)" }}>
                  <p className="font-mono px-3 pt-2.5 pb-1" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>
                    Inflação implícita por prazo
                  </p>
                  <div className="px-3 pb-2.5">
                    {data.breakevens.map((b) => (
                      <div key={b.vencimentoNominal} className="flex items-center gap-3 py-1.5" style={{ borderTop: "1px solid var(--line)", fontSize: 11.5 }}>
                        <span className="font-mono" style={{ minWidth: 54, color: "var(--text-2)" }}>{b.anos.toFixed(1)}a</span>
                        <span className="font-mono" style={{ color: COR_NOMINAL, minWidth: 62 }}>{f2(b.nominal)}%</span>
                        <span className="font-mono" style={{ color: "var(--faint)" }}>−</span>
                        <span className="font-mono" style={{ color: COR_REAL, minWidth: 58 }}>{f2(b.real)}%</span>
                        <span className="font-mono ml-auto" style={{ fontWeight: 700, color: "var(--text)" }}>{f2(b.implicita)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.avisos.length > 0 && (
                <div className="flex items-start gap-2" style={{ fontSize: 11, color: "var(--faint)" }}>
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>{data.avisos.join(" ")}</span>
                </div>
              )}

              <p style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5 }}>
                Fontes gratuitas: curva do <strong>Tesouro Direto</strong> (taxas ao vivo dos títulos públicos — é a melhor
                referência aberta de juros futuros; o DI Futuro da B3 não tem API pública) e <strong>Focus/BCB</strong> para a
                Selic esperada. Inflação implícita = (1+nominal)/(1+real)−1 (Fisher), casando prazos próximos.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
