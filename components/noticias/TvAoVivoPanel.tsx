"use client";

// TV ao vivo — transmissões 24/7 de canais de notícia via embed do YouTube.
// Não existe uma "API de TV" gratuita e limpa; o caminho robusto e SEM chave é
// o embed `live_stream?channel=<CHANNEL_ID>`, que o YouTube resolve para o vídeo
// que estiver ao vivo naquele canal no momento. Se o canal não estiver ao vivo,
// o player mostra "indisponível" — por isso priorizamos canais 24/7.
//
// Para adicionar/trocar um canal: basta o CHANNEL_ID (UC...) do canal no YouTube.

import { useState, useEffect } from "react";
import { Tv, ExternalLink, Radio } from "lucide-react";

interface Canal {
  id: string;
  nome: string;
  grupo: "Negócios" | "Mundo" | "Brasil";
  channelId: string;
  cor: string;
}

// Canais com transmissão contínua (24/7) no YouTube.
const CANAIS: Canal[] = [
  // Negócios & Mercados
  { id: "bloomberg", nome: "Bloomberg TV", grupo: "Negócios", channelId: "UCIALMKvObZNtJ6AmdCLP7Lg", cor: "#000000" },
  { id: "yahoofin", nome: "Yahoo Finance", grupo: "Negócios", channelId: "UCEAZeGqb5Fb_MDaNL8dRQdw", cor: "#6001d2" },
  { id: "cnbc", nome: "CNBC", grupo: "Negócios", channelId: "UCvJJ_dzjViJCoLf5uKUTwoA", cor: "#005594" },
  // Mundo
  { id: "dw", nome: "DW News", grupo: "Mundo", channelId: "UCknLrEdhRCp1aegoMqRaCZg", cor: "#0a3a5a" },
  { id: "aljazeera", nome: "Al Jazeera English", grupo: "Mundo", channelId: "UCNye-wNBqNL5ZzHSJj3l8Bg", cor: "#a68a3d" },
  { id: "france24", nome: "France 24", grupo: "Mundo", channelId: "UCQfwfsi5VrQ8yKZ-UWmAEFg", cor: "#1a4a8a" },
  { id: "sky", nome: "Sky News", grupo: "Mundo", channelId: "UCoMdktPbSTixAyNGwb-UYkQ", cor: "#c8102e" },
  // Brasil
  { id: "cnnbr", nome: "CNN Brasil", grupo: "Brasil", channelId: "UCG1QNnL7s6MYqHSof83M9tw", cor: "#cc0000" },
  { id: "jovempan", nome: "Jovem Pan News", grupo: "Brasil", channelId: "UCLE2CS0Owd4EdmVKV7dmZjg", cor: "#e30613" },
];

const GRUPOS: Canal["grupo"][] = ["Negócios", "Mundo", "Brasil"];

export default function TvAoVivoPanel() {
  const [ativo, setAtivo] = useState<Canal>(CANAIS[0]);
  // Se houver YOUTUBE_API_KEY no servidor, /api/tv/live resolve o vídeo ao vivo
  // exato do canal (mais confiável). Sem a chave, videoId=null e usamos o embed
  // keyless `live_stream?channel=` (que já funciona pra streams 24/7).
  const [videoId, setVideoId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setVideoId(null); // volta ao keyless enquanto resolve o novo canal
    fetch(`/api/tv/live?channel=${encodeURIComponent(ativo.channelId)}`)
      .then((r) => r.json())
      .then((d) => { if (alive && d?.videoId) setVideoId(d.videoId); })
      .catch(() => { /* mantém keyless */ });
    return () => { alive = false; };
  }, [ativo.channelId]);

  const src = videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`
    : `https://www.youtube.com/embed/live_stream?channel=${ativo.channelId}&autoplay=1&mute=1`;

  return (
    <div className="space-y-4">
      {/* Player 16:9 */}
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "#000" }}>
        <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--line)", background: "var(--panel)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "rgba(239,68,68,0.16)", color: "#f87171" }}>
              <Radio size={10} /> ao vivo
            </span>
            <span className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{ativo.nome}</span>
          </div>
          <a
            href={`https://www.youtube.com/channel/${ativo.channelId}/live`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium transition-colors hover:underline"
            style={{ color: "var(--muted)" }}
          >
            YouTube <ExternalLink size={11} />
          </a>
        </div>
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          <iframe
            key={src}
            src={src}
            title={`${ativo.nome} — ao vivo`}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </div>

      {/* Seletor de canais por grupo */}
      {GRUPOS.map((grupo) => {
        const itens = CANAIS.filter((c) => c.grupo === grupo);
        if (itens.length === 0) return null;
        return (
          <div key={grupo}>
            <h3 className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--faint)" }}>
              <Tv size={11} /> {grupo}
            </h3>
            <div className="flex flex-wrap gap-2">
              {itens.map((c) => {
                const on = c.id === ativo.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setAtivo(c)}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: on ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${on ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.08)"}`,
                      color: on ? "#93c5fd" : "var(--muted)",
                    }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: c.cor, boxShadow: `0 0 0 1px rgba(255,255,255,0.15)` }} />
                    {c.nome}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--faint)" }}>
        Transmissões 24/7 dos canais no YouTube. Se um canal não estiver ao vivo no momento, o player mostra indisponível — abra no YouTube pelo link acima.
      </p>
    </div>
  );
}
