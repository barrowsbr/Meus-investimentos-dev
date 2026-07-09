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
  Orbit, Camera, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight, Sparkles,
  ShieldAlert, Sun, Search, MapPin, Play, Pause, Loader2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorAlert from "@/components/ErrorAlert";
import { openEmbed } from "@/lib/embed-link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Tab = "apod" | "asteroides" | "sentinela" | "terra" | "localizar" | "marte" | "clima" | "biblioteca";
const TABS = [
  { id: "apod", label: "Imagem do dia" },
  { id: "asteroides", label: "Asteroides" },
  { id: "sentinela", label: "Sentinela" },
  { id: "terra", label: "Terra" },
  { id: "localizar", label: "Localizar" },
  { id: "marte", label: "Marte" },
  { id: "clima", label: "Clima espacial" },
  { id: "biblioteca", label: "Biblioteca" },
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
      {tab === "sentinela" && <SentinelaView />}
      {tab === "terra" && <TerraView />}
      {tab === "localizar" && <LocalizarView />}
      {tab === "marte" && <MarteView />}
      {tab === "clima" && <ClimaView />}
      {tab === "biblioteca" && <BibliotecaView />}
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

      {!loading && data && <NesteDia date={date} onPick={setDate} />}
    </div>
  );
}

// "Neste dia" — a APOD do mesmo dia/mês em anos anteriores.
interface ApodHist { date: string; title: string; url: string; mediaType: string; }
function NesteDia({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const { data } = useNasa<{ itens: ApodHist[] }>(`/api/nasa/apod-historico?date=${date}&anos=8`);
  if (!data || data.itens.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
        <Sparkles size={14} className="text-indigo-400" /> Neste dia, em outros anos
      </h3>
      <div className="flex gap-2.5 overflow-x-auto pb-2">
        {data.itens.map((it) => (
          <button key={it.date} onClick={() => onPick(it.date)}
            className="shrink-0 w-32 group text-left" title={it.title}>
            <div className="rounded-lg overflow-hidden border border-white/[0.06] group-hover:border-indigo-400/60 transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.url} alt={it.title} className="w-full aspect-video object-cover" loading="lazy" />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">{it.date.slice(0, 4)}</p>
            <p className="text-[11px] text-zinc-300 leading-tight line-clamp-2">{it.title}</p>
          </button>
        ))}
      </div>
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
                    <a href={o.jplUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); openEmbed(o.jplUrl, `${o.nome} · JPL`); }} className="text-zinc-200 hover:text-indigo-300 inline-flex items-center gap-1">
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
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setSel(0); setPlaying(false); }, [tipo, data]);

  // Time-lapse: avança as imagens do dia em loop (a Terra girando).
  useEffect(() => {
    if (!playing || !data || data.imagens.length < 2) return;
    const id = setInterval(() => {
      setSel((s) => (s + 1) % data.imagens.length);
    }, 450);
    return () => clearInterval(id);
  }, [playing, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-zinc-500">
          Disco inteiro da Terra visto pela câmera EPIC do satélite DSCOVR, a ~1,5 milhão de km.
          {data?.data ? ` Último conjunto: ${fmtData(data.data)}.` : ""}
        </p>
        <div className="flex gap-1.5">
          <button onClick={() => setPlaying((p) => !p)} disabled={!data || data.imagens.length < 2}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5 disabled:opacity-30 ${
              playing ? "bg-emerald-500/15 text-emerald-300" : "bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
            }`}>
            {playing ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Time-lapse</>}
          </button>
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

interface MarsFoto { id: number | string; url: string; camera: string; cameraSigla: string; dataTerra: string; sol: number; }
interface MarsResp {
  rover: string; roverNome: string; roverStatus: string;
  dataTerra: string | null; sol: number | null; total: number;
  cameras: string[]; camerasLabel?: Record<string, string>; fotos: MarsFoto[];
}

const ROVERS: { id: string; label: string }[] = [
  { id: "curiosity", label: "Curiosity" },
  { id: "perseverance", label: "Perseverance" },
  { id: "opportunity", label: "Opportunity" },
  { id: "spirit", label: "Spirit" },
];

function MarteView() {
  const [rover, setRover] = useState("curiosity");
  const { data, loading, error } = useNasa<MarsResp>(`/api/nasa/mars?rover=${rover}`);
  const [cam, setCam] = useState<string | null>(null);

  useEffect(() => { setCam(null); }, [rover, data]);

  const fotos = useMemo(
    () => (data?.fotos ?? []).filter((f) => !cam || f.cameraSigla === cam),
    [data, cam],
  );
  const camLabel = (sigla: string) => data?.camerasLabel?.[sigla] ?? sigla;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {ROVERS.map((r) => (
            <button key={r.id} onClick={() => setRover(r.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                rover === r.id ? "bg-orange-500/15 text-orange-300" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
              }`}>
              {r.label}
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
                  {camLabel(c)}
                </button>
              ))}
            </div>
          )}
          {fotos.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhuma foto recente disponível para este rover no momento.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {fotos.map((f) => (
                <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer"
                  className="glass-card overflow-hidden group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.camera} className="w-full aspect-square object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-[10px] text-zinc-300 font-medium truncate flex items-center gap-1">
                      <Camera size={10} /> {f.camera}
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

// ─── Sentinela (JPL Sentry — risco de impacto) ────────────────────────────────

interface SentryObj {
  des: string; nome: string; probImpacto: number; palermo: number; torino: number | null;
  diametroKm: number; velocidadeKms: number; anos: string; nImpactos: number; energiaMt: number; ultimaObs: string;
}
interface SentryResp { total: number; maiorProb: SentryObj | null; objetos: SentryObj[]; }

function chanceEmN(p: number): string {
  if (!p || p <= 0) return "—";
  const n = Math.round(1 / p);
  return `1 em ${nf(n)}`;
}

function SentinelaView() {
  const { data, loading, error } = useNasa<SentryResp>(`/api/nasa/sentry`);
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Sistema <b className="text-zinc-400">Sentry</b> (JPL/NASA): objetos com probabilidade
        NÃO-ZERO de impacto nos próximos ~100 anos. Probabilidades são baixíssimas e mudam com novas
        observações — isto é monitoramento de rotina, não alarme.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Objetos monitorados" value={nf(data.total)} tone="neutral" />
        <Kpi label="Maior probabilidade" value={data.maiorProb ? chanceEmN(data.maiorProb.probImpacto) : "—"} sub={data.maiorProb?.nome} tone="warn" />
        <Kpi label="Maior objeto" value={data.objetos.length ? `${nf1(Math.max(...data.objetos.map(o => o.diametroKm)) * 1000)} m` : "—"} tone="neutral" />
        <Kpi label="Torino máx" value={String(data.objetos.reduce((m, o) => Math.max(m, o.torino ?? 0), 0))} sub="escala 0–10" tone="good" />
      </div>

      <div className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
                <th className="px-3 py-2.5 font-semibold">Objeto</th>
                <th className="px-3 py-2.5 font-semibold text-right">Prob. impacto</th>
                <th className="px-3 py-2.5 font-semibold text-right">Janela</th>
                <th className="px-3 py-2.5 font-semibold text-right">Diâmetro</th>
                <th className="px-3 py-2.5 font-semibold text-right">Energia</th>
                <th className="px-3 py-2.5 font-semibold text-center">Torino</th>
              </tr>
            </thead>
            <tbody>
              {data.objetos.slice(0, 30).map((o) => (
                <tr key={o.des} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5">
                    <a href={`https://cneos.jpl.nasa.gov/sentry/details.html#?des=${encodeURIComponent(o.des)}`} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => { e.preventDefault(); openEmbed(`https://cneos.jpl.nasa.gov/sentry/details.html#?des=${encodeURIComponent(o.des)}`, `${o.nome} · CNEOS Sentry`); }}
                      className="text-zinc-200 hover:text-indigo-300 inline-flex items-center gap-1">
                      {o.nome} <ExternalLink size={11} className="text-zinc-600" />
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">{chanceEmN(o.probImpacto)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{o.anos || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">
                    {o.diametroKm >= 1 ? `${nf1(o.diametroKm)} km` : `${nf(Math.round(o.diametroKm * 1000))} m`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-400">{o.energiaMt >= 1 ? `${nf(Math.round(o.energiaMt))} Mt` : "<1 Mt"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      (o.torino ?? 0) >= 1 ? "bg-red-500/12 text-red-400" : "bg-white/[0.05] text-zinc-500"
                    }`}>{o.torino ?? 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-zinc-600 flex items-center gap-1.5">
        <ShieldAlert size={13} className="text-zinc-500" /> &quot;1 em N&quot; = chance de impacto. Torino 0 = risco desprezível.
      </p>
    </div>
  );
}

// ─── Localizar (Earth Imagery / Landsat) ──────────────────────────────────────

const LUGARES: { nome: string; lat: number; lon: number }[] = [
  { nome: "São Paulo", lat: -23.55, lon: -46.63 },
  { nome: "Rio de Janeiro", lat: -22.91, lon: -43.17 },
  { nome: "Brasília", lat: -15.79, lon: -47.88 },
  { nome: "Amazônia (Manaus)", lat: -3.12, lon: -60.02 },
  { nome: "Nova York", lat: 40.71, lon: -74.01 },
  { nome: "Deserto do Saara", lat: 23.42, lon: 25.66 },
];

function LocalizarView() {
  const [lat, setLat] = useState("-23.55");
  const [lon, setLon] = useState("-46.63");
  const [src, setSrc] = useState<string | null>(null);
  const [imgState, setImgState] = useState<"idle" | "loading" | "ok" | "err">("idle");

  const buscar = (la: string, lo: string) => {
    const laN = Number(la), loN = Number(lo);
    if (!isFinite(laN) || !isFinite(loN)) return;
    setImgState("loading");
    setSrc(`${API_URL}/api/nasa/earth?lat=${laN}&lon=${loN}&dim=0.12`);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-xs text-zinc-500">
        Imagem de satélite (Landsat 8) de qualquer ponto da Terra. Informe latitude e longitude
        ou escolha um lugar. A cobertura varia — nem todo ponto/data tem imagem.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {LUGARES.map((l) => (
          <button key={l.nome} onClick={() => { setLat(String(l.lat)); setLon(String(l.lon)); buscar(String(l.lat), String(l.lon)); }}
            className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all inline-flex items-center gap-1">
            <MapPin size={11} /> {l.nome}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-zinc-500">
          Latitude
          <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal"
            className="block glass-card px-3 py-2 text-sm bg-transparent text-zinc-200 w-32 mt-1" />
        </label>
        <label className="text-xs text-zinc-500">
          Longitude
          <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal"
            className="block glass-card px-3 py-2 text-sm bg-transparent text-zinc-200 w-32 mt-1" />
        </label>
        <button onClick={() => buscar(lat, lon)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 transition-all inline-flex items-center gap-1.5">
          <Search size={14} /> Buscar
        </button>
      </div>

      {src && (
        <div className="glass-card overflow-hidden bg-black max-w-md">
          <div className="relative flex items-center justify-center" style={{ minHeight: 200 }}>
            {imgState === "loading" && <Loader2 className="animate-spin text-zinc-600 absolute" size={28} />}
            {imgState === "err" ? (
              <p className="text-sm text-zinc-500 p-8 text-center">Sem imagem Landsat disponível para este ponto. Tente outro local.</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="Landsat" className="w-full h-auto"
                onLoad={() => setImgState("ok")} onError={() => setImgState("err")} />
            )}
          </div>
          {imgState === "ok" && (
            <p className="text-[11px] text-zinc-500 p-2.5">Landsat 8 · {lat}, {lon}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Clima espacial (DONKI) ───────────────────────────────────────────────────

interface EventoClima { tipo: "flare" | "storm" | "cme"; rotulo: string; data: string; detalhe: string; intensidade: string; link: string; }
interface DonkiResp {
  inicio: string; fim: string; total: number;
  contagem: { flares: number; tempestades: number; cmes: number };
  eventos: EventoClima[];
}
const CLIMA_COR: Record<EventoClima["tipo"], string> = { flare: "#f59e0b", storm: "#ef4444", cme: "#8b5cf6" };

function ClimaView() {
  const { data, loading, error } = useNasa<DonkiResp>(`/api/nasa/donki?dias=30`);
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorAlert message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Clima espacial dos últimos 30 dias (base DONKI/NASA): atividade do Sol que pode afetar
        satélites, GPS, redes elétricas e comunicações.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Erupções solares" value={nf(data.contagem.flares)} tone="warn" />
        <Kpi label="Tempestades geomag." value={nf(data.contagem.tempestades)} tone="warn" />
        <Kpi label="Ejeções de massa (CME)" value={nf(data.contagem.cmes)} tone="neutral" />
      </div>

      {data.eventos.length === 0 ? (
        <p className="text-sm text-zinc-500">Nenhum evento de clima espacial no período.</p>
      ) : (
        <div className="glass-card p-0 overflow-hidden divide-y divide-white/[0.04]">
          {data.eventos.map((ev, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.02]">
              <Sun size={16} style={{ color: CLIMA_COR[ev.tipo] }} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 truncate">
                  {ev.rotulo} <span className="text-zinc-500">· {ev.detalhe}</span>
                </p>
                <p className="text-[11px] text-zinc-500">{fmtDataHora(ev.data)}</p>
              </div>
              <span className="text-xs font-mono font-semibold shrink-0" style={{ color: CLIMA_COR[ev.tipo] }}>{ev.intensidade}</span>
              {ev.link && (
                <a href={ev.link} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.preventDefault(); openEmbed(ev.link, ev.rotulo); }} className="text-zinc-600 hover:text-zinc-300 shrink-0">
                  <ExternalLink size={13} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Biblioteca (NASA Image Library) ──────────────────────────────────────────

interface MidiaItem { id: string; titulo: string; descricao: string; data: string; centro: string; thumb: string; }
interface BibliotecaResp { q: string; total: number; itens: MidiaItem[]; }
const SUGESTOES = ["Nebulosa", "Saturno", "Apollo 11", "Buraco negro", "Aurora", "Marte", "Galáxia"];

function BibliotecaView() {
  const [q, setQ] = useState("Nebulosa");
  const [busca, setBusca] = useState("Nebulosa");
  const { data, loading, error } = useNasa<BibliotecaResp>(`/api/nasa/biblioteca?q=${encodeURIComponent(busca)}`);
  const [lightbox, setLightbox] = useState<MidiaItem | null>(null);

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) setBusca(q.trim()); }} className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no acervo da NASA…"
            className="w-full glass-card pl-9 pr-3 py-2 text-sm bg-transparent text-zinc-200" />
        </div>
        <button type="submit" className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 transition-all">
          Buscar
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SUGESTOES.map((s) => (
          <button key={s} onClick={() => { setQ(s); setBusca(s); }}
            className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.04] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all">
            {s}
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorAlert message={error} />}
      {data && !loading && (
        data.itens.length === 0 ? (
          <p className="text-sm text-zinc-500">Nada encontrado para &quot;{data.q}&quot;.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {data.itens.map((it) => (
              <button key={it.id} onClick={() => setLightbox(it)} className="glass-card overflow-hidden group text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.thumb} alt={it.titulo} className="w-full aspect-square object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
                <p className="text-[11px] text-zinc-300 p-2 line-clamp-2 leading-tight">{it.titulo}</p>
              </button>
            ))}
          </div>
        )
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="glass-card max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.thumb} alt={lightbox.titulo} className="w-full h-auto" />
            <div className="p-4">
              <h3 className="text-base font-bold text-zinc-100">{lightbox.titulo}</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{lightbox.centro}{lightbox.data ? ` · ${fmtData(lightbox.data)}` : ""}</p>
              {lightbox.descricao && <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{lightbox.descricao}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function fmtDataHora(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2})?:?(\d{2})?/);
  if (!m) return s;
  const hora = m[4] ? ` ${m[4]}:${m[5] ?? "00"}` : "";
  return `${m[3]}/${m[2]}/${m[1]}${hora}`;
}

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
