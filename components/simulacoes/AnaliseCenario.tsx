"use client";

import { useMemo, useState } from "react";
import { Sliders, RotateCcw, TrendingUp, Activity, Gauge, Shield, Stethoscope, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Minus } from "lucide-react";
import {
  type Bucket, type BucketCMA, type RiskProfile, type Insight,
  ALL_BUCKETS, BUCKET_LABELS, BUCKET_COLORS, DEFAULT_CMA, DEFAULT_RF_RATE,
  computeProfile, computeConcentration, scoreDiversificacao, gerarDiagnostico,
} from "@/lib/simulacao-metrics";

// Estrutura mínima da alocação que o componente consome (espelha Allocation da página).
interface AllocLike {
  setor: Record<string, number>;
  setorEconomico: Record<string, number>;
  moeda: Record<string, number>;
  allPositions: { ticker: string; valor: number }[];
  total: number;
}

interface Props {
  current: AllocLike;
  sim: AllocLike | null;
}

const pctA = (v: number) => `${(v * 100).toFixed(1)}%`;

// ── Mapa Risco × Retorno (SVG custom) ──────────────────────────────────────────

function RiskReturnMap({ atual, simulado }: { atual: RiskProfile; simulado: RiskProfile | null }) {
  const W = 320, H = 200, padL = 38, padB = 28, padT = 14, padR = 14;
  const pts = [atual, ...(simulado ? [simulado] : [])];

  const vols = pts.map(p => p.vol);
  const rets = pts.map(p => p.retorno);
  const volMin = Math.max(0, Math.min(...vols) - 0.03);
  const volMax = Math.max(...vols) + 0.03;
  const retMin = Math.min(...rets) - 0.02;
  const retMax = Math.max(...rets) + 0.02;

  const x = (v: number) => padL + ((v - volMin) / Math.max(1e-6, volMax - volMin)) * (W - padL - padR);
  const y = (r: number) => H - padB - ((r - retMin) / Math.max(1e-6, retMax - retMin)) * (H - padB - padT);

  const ax = x(atual.vol), ay = y(atual.retorno);
  const sx = simulado ? x(simulado.vol) : 0, sy = simulado ? y(simulado.retorno) : 0;

  // Direção da seta (melhor = ↖ menos risco / mais retorno)
  const melhor = simulado ? (simulado.sharpe >= atual.sharpe) : true;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 210 }}>
      {/* grid */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={`h${f}`} x1={padL} x2={W - padR} y1={padT + f * (H - padB - padT)} y2={padT + f * (H - padB - padT)} stroke="rgba(255,255,255,0.05)" />
      ))}
      {/* eixos */}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="rgba(255,255,255,0.15)" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="rgba(255,255,255,0.15)" />
      <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="8" fill="#71717a" className="font-mono">{pctA(retMax)}</text>
      <text x={padL - 6} y={H - padB} textAnchor="end" fontSize="8" fill="#71717a" className="font-mono">{pctA(retMin)}</text>
      <text x={W - padR} y={H - padB + 12} textAnchor="end" fontSize="8" fill="#71717a" className="font-mono">{pctA(volMax)} vol</text>
      <text x={padL} y={H - padB + 12} textAnchor="start" fontSize="8" fill="#71717a" className="font-mono">{pctA(volMin)}</text>
      <text x={(padL + W - padR) / 2} y={H - 2} textAnchor="middle" fontSize="8" fill="#52525b" className="font-mono uppercase tracking-wider">Risco (volatilidade) →</text>

      {/* seta atual → simulado */}
      {simulado && (Math.abs(sx - ax) > 1 || Math.abs(sy - ay) > 1) && (
        <line x1={ax} y1={ay} x2={sx} y2={sy} stroke={melhor ? "#34d399" : "#fbbf24"} strokeWidth="1.5" strokeDasharray="3 2" markerEnd="url(#arrowSim)" />
      )}
      <defs>
        <marker id="arrowSim" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={melhor ? "#34d399" : "#fbbf24"} />
        </marker>
      </defs>

      {/* ponto atual */}
      <circle cx={ax} cy={ay} r="5" fill="#3b82f6" stroke="#0b0c10" strokeWidth="1.5" />
      {/* ponto simulado */}
      {simulado && <circle cx={sx} cy={sy} r="5" fill="#f59e0b" stroke="#0b0c10" strokeWidth="1.5" />}
    </svg>
  );
}

// ── Tile de métrica antes → depois ─────────────────────────────────────────────

function MetricTile({ label, icon, atual, simulado, fmt, betterUp, suffixDelta }: {
  label: string;
  icon: React.ReactNode;
  atual: number;
  simulado: number | null;
  fmt: (v: number) => string;
  betterUp: boolean;
  suffixDelta?: string;
}) {
  const delta = simulado !== null ? simulado - atual : 0;
  const hasDelta = simulado !== null && Math.abs(delta) > 1e-6;
  const good = betterUp ? delta > 0 : delta < 0;
  return (
    <div className="glass-card p-3.5">
      <div className="flex items-center gap-1.5 mb-2 text-zinc-500">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-zinc-100 font-mono tabular-nums">{fmt(simulado ?? atual)}</span>
      </div>
      {hasDelta && (
        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono">
          <span className="text-zinc-600">{fmt(atual)}</span>
          <ChevronRight size={9} className="text-zinc-700" />
          <span className={good ? "text-emerald-400" : "text-amber-400"}>
            {delta > 0 ? "+" : "−"}{fmt(Math.abs(delta)).replace(/^[+−-]/, "")}{suffixDelta ?? ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function AnaliseCenario({ current, sim }: Props) {
  const hasSim = sim !== null;
  const [cma, setCma] = useState<Record<Bucket, BucketCMA>>(() => structuredClone(DEFAULT_CMA));
  const [rfRate] = useState(DEFAULT_RF_RATE);
  const [openPrem, setOpenPrem] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  // Perfis
  const profAtual = useMemo(() => computeProfile(current.setor, current.total, cma, rfRate), [current.setor, current.total, cma, rfRate]);
  const profSim = useMemo(() => sim ? computeProfile(sim.setor, sim.total, cma, rfRate) : null, [sim, cma, rfRate]);

  // Concentração
  const concAtual = useMemo(() => computeConcentration(current.allPositions), [current.allPositions]);
  const concSim = useMemo(() => sim ? computeConcentration(sim.allPositions) : null, [sim]);

  const scoreAtual = useMemo(() => scoreDiversificacao(concAtual, profAtual.weights), [concAtual, profAtual.weights]);
  const scoreSim = useMemo(() => (concSim && profSim) ? scoreDiversificacao(concSim, profSim.weights) : null, [concSim, profSim]);

  // Buckets visíveis nos sliders (presentes em qualquer alocação)
  const activeBuckets = useMemo(() => {
    const set = new Set<Bucket>();
    for (const b of ALL_BUCKETS) {
      if (profAtual.weights[b] > 0.001 || (profSim && profSim.weights[b] > 0.001)) set.add(b);
    }
    return ALL_BUCKETS.filter(b => set.has(b));
  }, [profAtual.weights, profSim]);

  // Diagnóstico
  const insights: Insight[] = useMemo(() => {
    if (!sim || !profSim || !concSim) return [];
    return gerarDiagnostico({
      patrimAntes: current.total, patrimDepois: sim.total,
      profAntes: profAtual, profDepois: profSim,
      concAntes: concAtual, concDepois: concSim,
      setorEcoAntes: current.setorEconomico, setorEcoDepois: sim.setorEconomico,
      totalAntes: current.total, totalDepois: sim.total,
      moedaAntes: current.moeda, moedaDepois: sim.moeda,
    });
  }, [sim, profSim, concSim, profAtual, concAtual, current]);

  function setBucketRet(b: Bucket, v: number) {
    setCma(prev => ({ ...prev, [b]: { ...prev[b], retorno: v } }));
  }
  function setBucketVol(b: Bucket, v: number) {
    setCma(prev => ({ ...prev, [b]: { ...prev[b], vol: v } }));
  }
  function reset() { setCma(structuredClone(DEFAULT_CMA)); }

  const insightIcon = (t: Insight["tipo"]) =>
    t === "positivo" ? <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
    : t === "alerta" ? <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
    : t === "negativo" ? <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
    : <Minus size={13} className="text-zinc-500 shrink-0 mt-0.5" />;

  return (
    <div className="space-y-4">
      {/* ── Perfil de Risco & Retorno ── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
            <Gauge size={14} className="text-amber-400" /> Perfil de Risco & Retorno
          </h2>
          <span className="text-[9px] text-zinc-600 uppercase tracking-wider">premissas por classe · blend</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Tiles + sliders */}
          <div>
            <div className="grid grid-cols-3 gap-3">
              <MetricTile label="Retorno esperado" icon={<TrendingUp size={12} />} atual={profAtual.retorno} simulado={profSim?.retorno ?? null} fmt={pctA} betterUp suffixDelta="pp" />
              <MetricTile label="Volatilidade" icon={<Activity size={12} />} atual={profAtual.vol} simulado={profSim?.vol ?? null} fmt={pctA} betterUp={false} suffixDelta="pp" />
              <MetricTile label="Sharpe" icon={<Gauge size={12} />} atual={profAtual.sharpe} simulado={profSim?.sharpe ?? null} fmt={(v) => v.toFixed(2)} betterUp />
            </div>

            {/* Premissas (sliders) */}
            <div className="mt-4">
              <button onClick={() => setOpenPrem(o => !o)} className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider font-semibold">
                {openPrem ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Sliders size={11} /> Ajustar premissas
              </button>

              {openPrem && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer select-none">
                      <input type="checkbox" checked={advanced} onChange={e => setAdvanced(e.target.checked)} className="accent-amber-500" />
                      Mostrar volatilidade
                    </label>
                    <button onClick={reset} className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                      <RotateCcw size={10} /> Padrão
                    </button>
                  </div>

                  {activeBuckets.map(b => (
                    <div key={b}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                          <span className="w-2 h-2 rounded-full" style={{ background: BUCKET_COLORS[b] }} />
                          {BUCKET_LABELS[b]}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          μ {pctA(cma[b].retorno)}{advanced ? ` · σ ${pctA(cma[b].vol)}` : ""}
                        </span>
                      </div>
                      <input
                        type="range" min={0} max={0.4} step={0.005}
                        value={cma[b].retorno}
                        onChange={e => setBucketRet(b, parseFloat(e.target.value))}
                        className="w-full h-1 accent-amber-500 cursor-pointer"
                      />
                      {advanced && (
                        <input
                          type="range" min={0.01} max={0.9} step={0.005}
                          value={cma[b].vol}
                          onChange={e => setBucketVol(b, parseFloat(e.target.value))}
                          className="w-full h-1 accent-blue-500 cursor-pointer mt-1"
                        />
                      )}
                    </div>
                  ))}
                  <p className="text-[9px] text-zinc-600 leading-relaxed">
                    Retorno/volatilidade anuais por classe (premissas de mercado). A vol da carteira usa matriz de correlação — por isso fica abaixo da média ponderada (benefício da diversificação).
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Mapa Risco × Retorno */}
          <div>
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-semibold mb-1 block">Mapa Risco × Retorno</span>
            <RiskReturnMap atual={profAtual} simulado={profSim} />
            <div className="flex items-center gap-4 mt-1 justify-center">
              <span className="flex items-center gap-1 text-[9px] text-zinc-500"><span className="w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} /> Atual</span>
              {hasSim && <span className="flex items-center gap-1 text-[9px] text-zinc-500"><span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} /> Simulado</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Saúde da Carteira ── */}
      <div className="glass-card p-5">
        <h2 className="text-xs font-semibold text-zinc-300 flex items-center gap-2 mb-4">
          <Shield size={14} className="text-emerald-400" /> Saúde da Carteira
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricTile label="Nº efetivo de ativos" icon={<Activity size={12} />} atual={concAtual.nEff} simulado={concSim?.nEff ?? null} fmt={(v) => v.toFixed(1)} betterUp />
          <MetricTile label="Top-5 concentração" icon={<Gauge size={12} />} atual={concAtual.top5} simulado={concSim?.top5 ?? null} fmt={(v) => `${v.toFixed(0)}%`} betterUp={false} suffixDelta="pp" />
          <MetricTile label="Maior posição" icon={<TrendingUp size={12} />} atual={concAtual.top1} simulado={concSim?.top1 ?? null} fmt={(v) => `${v.toFixed(0)}%`} betterUp={false} suffixDelta="pp" />
          <MetricTile label="Score diversificação" icon={<Shield size={12} />} atual={scoreAtual} simulado={scoreSim} fmt={(v) => `${v.toFixed(0)}`} betterUp />
        </div>
      </div>

      {/* ── Diagnóstico do Cenário ── */}
      {hasSim && insights.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="text-xs font-semibold text-zinc-300 flex items-center gap-2 mb-4">
            <Stethoscope size={14} className="text-sky-400" /> Diagnóstico do Cenário
          </h2>
          <div className="space-y-2.5">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2.5">
                {insightIcon(ins.tipo)}
                <span className="text-xs text-zinc-300 leading-relaxed">{ins.texto}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
