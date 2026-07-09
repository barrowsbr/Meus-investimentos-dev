"use client";

// ─────────────────────────────────────────────────────────────────────────────
// NASA — Observatório. Um mashup dos endpoints abertos da NASA num só painel:
//   • APOD          → imagem/vídeo astronômico do dia (com data navegável)
//   • Asteroides    → NeoWs: objetos próximos da Terra na semana (viz + tabela)
//   • Terra (EPIC)  → disco inteiro do planeta pela câmera do DSCOVR
//   • Marte         → últimas fotos dos rovers Perseverance/Curiosity
// Todas as chamadas passam por /api/nasa/* (a API key vive só no servidor).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Rocket, Orbit, Globe2, Camera, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight, Sparkles,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Tab = "apod" | "asteroides" | "terra" | "marte";
const TABS = [
  { id: "apod", label: "Imagem do dia" },
  { id: "asteroides", label: "Asteroides" },
  { id: "terra", label: "Terra" },
  { id: "marte", label: "Marte" },
];

const nf = (n: number) => n.toLocaleString("pt-BR");
const nf1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
function fmtData(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function hoje(): string {
  return new Date().toISOString().split("T")[0];
}

export default function NasaPage() {
  const [tab, setTab] = useState<Tab>("apod");
  return (
    <>
      <PageHeader
        title="NASA"
        description="Observatório — dados abertos da NASA em tempo quase real"
        tabs={TABS}
        activeTab={tab}
        onTab={(id) => setTab(id as Tab)}
        right={
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Sparkles size={13} className="text-indigo-400" /> api.nasa.gov
          </span>
        }
      />
      {tab === "apod" && <ApodView />}
      {tab === "asteroides" && <AsteroidesView />}
      {tab === "terra" && <TerraView />}
      {tab === "marte" && <MarteView />}
    </>
  );
}

// ─── Hook de fetch simples ────────────────────────────────────────────────────

function useNasa<T>(url: string | null): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancel = false;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}${url}`)
      .then((r) => r.json())
      .then((body) => {
        if (cancel) return;
        if (body?.error) throw new Error(body.error);
        setData(body);
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [url]);
  return { data, loading, error };
}

// ─── APOD ─────────────────────────────────────────────────────────────────────

interface Apod {
  date: string; title: string; explanation: string;
  mediaType: string; url: string; hdurl: string; thumbnailUrl: string | null; copyright: string | null;
}

function ApodView() {
  const [date, setDate] = useState(hoje());
  const { data, loading, error } = useNasa<Apod>(`/api/nasa/apod?date=${date}`);

  const shift = (days: number) => {
    const d = new Date(date + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    const next = d.toISOString().split("T")[0];
    if (next <= hoje()) setDate(next);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => shift(-1)} className="glass-card p-2 hover:bg-white/[0.06] transition-colors" aria-label="Dia anterior">
          <ChevronLeft size={16} />
        </button>
        <input
          type="date" value={date} max={hoje()}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="glass-card px-3 py-2 text-sm bg-transparent text-zinc-200 [color-scheme:dark]"
        />
        <button onClick={() => shift(1)} disabled={date >= hoje()}
          className="glass-card p-2 hover:bg-white/[0.06] transition-colors disabled:opacity-30" aria-label="Próximo dia">
          <ChevronRight size={16} />
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorAlert message={error} />}
      {data && !loading && (
        <div className="glass-card overflow-hidden">
          <div className="relative bg-black flex items-center justify-center" style={{ minHeight: 240 }}>
            {data.mediaType === "video" ? (
              <iframe src={data.url} title={data.title} allow="autoplay; encrypted-media; fullscreen" allowFullScreen className="w-full" style={{ aspectRatio: "16/9" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.hdurl || data.url} alt={data.title} className="w-full h-auto max-h-[70vh] object-contain" />
            )}
          </div>
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-zinc-100">{data.title}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {fmtData(data.date)}{data.copyright ? ` · © ${data.copyright.trim()}` : ""}
                </p>
              </div>
              <a href={data.hdurl || data.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200">
                Abrir em alta resolução <ExternalLink size={12} />
              </a>
            </div>
            <p className="text-sm leading-relaxed text-zinc-400 mt-3">{data.explanation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Asteroides (NeoWs) ───────────────────────────────────────────────────────

interface NeoObjeto {
  id: string; nome: string; data: string;
  diametroMinM: number; diametroMaxM: number;
  distanciaKm: number; distanciaLunar: number; velocidadeKmh: number;
  perigoso: boolean; sentry: boolean; jplUrl: string;
}
interface NeoResp {
  inicio: string; fim: string; total: number; perigosos: number;
  maiorDiametroM: number; maisProximo: NeoObjeto | null; objetos: NeoObjeto[];
}

function AsteroidesView() {
  const { data, loading, error } = useNasa<NeoResp>(`/api/nasa/neows`);

  const scatterData = useMemo(
    () => (data?.objetos ?? []).map((o) => ({
      x: o.distanciaLunar,
      y: o.diametroMaxM,
      z: o.velocidadeKmh,
      nome: o.nome,
      perigoso: o.perigoso,
    })),
    [data],
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Objetos próximos à Terra entre {fmtData(data.inicio)} e {fmtData(data.fim)} · fonte NeoWs.
        Distância em <b className="text-zinc-400">LD</b> (distância lunar ≈ 384.400 km).
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Objetos na semana" value={nf(data.total)} tone="neutral" />
        <Kpi label="Potencialmente perigosos" value={nf(data.perigosos)} tone={data.perigosos > 0 ? "warn" : "good"} />
        <Kpi label="Maior diâmetro" value={`${nf(data.maiorDiametroM)} m`} tone="neutral" />
        <Kpi
          label="Passagem mais próxima"
          value={data.maisProximo ? `${nf1(data.maisProximo.distanciaLunar)} LD` : "—"}
          sub={data.maisProximo?.nome}
          tone="neutral"
        />
      </div>

      {/* Scatter: distância × tamanho, cor = periculosidade, bolha = velocidade */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-1 flex items-center gap-2">
          <Orbit size={15} className="text-indigo-400" /> Distância × tamanho
        </h3>
        <p className="text-[11px] text-zinc-500 mb-3">
          Cada ponto é um objeto. Eixo X = distância em LD (mais à esquerda = mais perto).
          Eixo Y = diâmetro máximo estimado (m). Bolhas maiores = maior velocidade. Vermelho = potencialmente perigoso.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              type="number" dataKey="x" name="Distância (LD)"
              tick={{ fontSize: 11, fill: "#71717a" }}
              label={{ value: "Distância (LD)", position: "insideBottom", offset: -12, fontSize: 11, fill: "#71717a" }}
            />
            <YAxis
              type="number" dataKey="y" name="Diâmetro (m)" scale="log" domain={["auto", "auto"]} allowDataOverflow
              tick={{ fontSize: 11, fill: "#71717a" }}
              label={{ value: "Diâmetro (m)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#71717a" }}
            />
            <ZAxis type="number" dataKey="z" range={[40, 400]} name="Velocidade (km/h)" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, fontSize: 12 }}
              formatter={(val: number | string, name: string) => [typeof val === "number" ? nf(val) : val, name]}
              labelFormatter={() => ""}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as (typeof scatterData)[0] | undefined;
                if (!p) return null;
                return (
                  <div style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 10, padding: "8px 10px", fontSize: 12 }}>
                    <div className="font-semibold text-zinc-100">{p.nome}</div>
                    <div className="text-zinc-400">Distância: {nf1(p.x)} LD</div>
                    <div className="text-zinc-400">Diâmetro: {nf(p.y)} m</div>
                    <div className="text-zinc-400">Velocidade: {nf(p.z)} km/h</div>
                    {p.perigoso && <div className="text-red-400 mt-0.5">⚠ Potencialmente perigoso</div>}
                  </div>
                );
              }}
            />
            <Scatter data={scatterData}>
              {scatterData.map((p, i) => (
                <Cell key={i} fill={p.perigoso ? "#ef4444" : "#6366f1"} fillOpacity={0.72} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Tabela — mais próximos primeiro */}
      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
                <th className="px-3 py-2.5 font-semibold">Objeto</th>
                <th className="px-3 py-2.5 font-semibold">Data</th>
                <th className="px-3 py-2.5 font-semibold text-right">Diâmetro (m)</th>
                <th className="px-3 py-2.5 font-semibold text-right">Distância</th>
                <th className="px-3 py-2.5 font-semibold text-right">Velocidade</th>
                <th className="px-3 py-2.5 font-semibold text-center">Risco</th>
              </tr>
            </thead>
            <tbody>
              {data.objetos.slice(0, 20).map((o) => (
                <tr key={o.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5">
                    <a href={o.jplUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-200 hover:text-indigo-300 inline-flex items-center gap-1">
                      {o.nome} <ExternalLink size={11} className="text-zinc-600" />
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500">{fmtData(o.data)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{nf(o.diametroMinM)}–{nf(o.diametroMaxM)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {nf1(o.distanciaLunar)} LD
                    <span className="block text-[10px] text-zinc-600">{nf(o.distanciaKm)} km</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{nf(o.velocidadeKmh)} km/h</td>
                  <td className="px-3 py-2.5 text-center">
                    {o.perigoso ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 text-red-400 px-2 py-0.5 text-[10px] font-semibold">
                        <AlertTriangle size={10} /> Sim
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Terra (EPIC) ─────────────────────────────────────────────────────────────

interface EpicImagem { id: string; legenda: string; data: string; url: string; lat: number | null; lon: number | null; }
interface EpicResp { tipo: string; data: string | null; total: number; imagens: EpicImagem[]; }

function TerraView() {
  const [tipo, setTipo] = useState<"natural" | "enhanced">("natural");
  const { data, loading, error } = useNasa<EpicResp>(`/api/nasa/epic?tipo=${tipo}`);
  const [sel, setSel] = useState(0);

  useEffect(() => { setSel(0); }, [tipo, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-zinc-500">
          Disco inteiro da Terra visto pela câmera EPIC do satélite DSCOVR, a ~1,5 milhão de km.
          {data?.data ? ` Último conjunto: ${fmtData(data.data)}.` : ""}
        </p>
        <div className="flex gap-1.5">
          {(["natural", "enhanced"] as const).map((t) => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                tipo === t ? "bg-indigo-500/15 text-indigo-300" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
              }`}>
              {t === "natural" ? "Cor natural" : "Realçada"}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorAlert message={error} />}
      {data && !loading && data.imagens.length > 0 && (
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
          <div className="glass-card overflow-hidden bg-black flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.imagens[sel]?.url} alt={data.imagens[sel]?.legenda || "Terra"} className="w-full h-auto object-contain" loading="lazy" />
          </div>
          <div>
            <div className="glass-card p-4 mb-3">
              <p className="text-xs text-zinc-500">Horário (UTC)</p>
              <p className="text-lg font-bold text-zinc-100">{data.imagens[sel]?.data?.split(" ")[1] ?? "—"}</p>
              {data.imagens[sel]?.lat != null && (
                <p className="text-xs text-zinc-500 mt-1">
                  Centro: {nf1(data.imagens[sel].lat!)}°, {nf1(data.imagens[sel].lon!)}°
                </p>
              )}
              <p className="text-[11px] text-zinc-600 mt-2">{data.total} imagens neste dia — o ponto de vista gira com a Terra.</p>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-1.5 max-h-[46vh] overflow-y-auto">
              {data.imagens.map((im, i) => (
                <button key={im.id} onClick={() => setSel(i)}
                  className={`relative rounded-lg overflow-hidden border transition-all ${
                    i === sel ? "border-indigo-400" : "border-transparent opacity-70 hover:opacity-100"
                  }`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.url} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {data && !loading && data.imagens.length === 0 && (
        <p className="text-sm text-zinc-500">Sem imagens EPIC disponíveis no momento.</p>
      )}
    </div>
  );
}

// ─── Marte (Rover Photos) ─────────────────────────────────────────────────────

interface MarsFoto { id: number; url: string; camera: string; cameraSigla: string; dataTerra: string; sol: number; }
interface MarsResp {
  rover: string; roverNome: string; roverStatus: string;
  dataTerra: string | null; sol: number | null; total: number; cameras: string[]; fotos: MarsFoto[];
}

function MarteView() {
  const [rover, setRover] = useState<"perseverance" | "curiosity">("perseverance");
  const { data, loading, error } = useNasa<MarsResp>(`/api/nasa/mars?rover=${rover}`);
  const [cam, setCam] = useState<string | null>(null);

  useEffect(() => { setCam(null); }, [rover, data]);

  const fotos = useMemo(
    () => (data?.fotos ?? []).filter((f) => !cam || f.cameraSigla === cam),
    [data, cam],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {(["perseverance", "curiosity"] as const).map((r) => (
            <button key={r} onClick={() => setRover(r)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                rover === r ? "bg-orange-500/15 text-orange-300" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
              }`}>
              {r}
            </button>
          ))}
        </div>
        {data && (
          <p className="text-xs text-zinc-500">
            Sol {data.sol} · {data.dataTerra ? fmtData(data.dataTerra) : "—"} · {data.total} fotos
            {data.roverStatus ? ` · rover ${data.roverStatus === "active" ? "ativo" : data.roverStatus}` : ""}
          </p>
        )}
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorAlert message={error} />}
      {data && !loading && (
        <>
          {data.cameras.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCam(null)}
                className={`px-2.5 py-1 rounded-full text-[11px] transition-all ${!cam ? "bg-white/[0.12] text-white" : "bg-white/[0.04] text-zinc-500"}`}>
                Todas
              </button>
              {data.cameras.map((c) => (
                <button key={c} onClick={() => setCam(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] transition-all ${cam === c ? "bg-orange-500/20 text-orange-300" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"}`}>
                  {c}
                </button>
              ))}
            </div>
          )}
          {fotos.length === 0 ? (
            <p className="text-sm text-zinc-500">Sem fotos para este filtro.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {fotos.map((f) => (
                <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                  className="glass-card overflow-hidden group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.camera} className="w-full aspect-square object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-[10px] text-zinc-300 font-medium truncate flex items-center gap-1">
                      <Camera size={10} /> {f.cameraSigla}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "neutral" | "good" | "warn" }) {
  const color = tone === "warn" ? "#f87171" : tone === "good" ? "#34d399" : "#e4e4e7";
  return (
    <div className="glass-card p-3.5">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums leading-none" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-1 truncate">{sub}</p>}
    </div>
  );
}
