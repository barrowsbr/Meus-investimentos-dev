"use client";

import { Newspaper, ExternalLink, Loader2, Radio, LinkIcon, AlertCircle } from "lucide-react";
import type { CountryNewsResponse, SignalsResponse } from "@/lib/radar/types";
import { findPortfolioImpact } from "@/lib/polymarket";

const IMPACT_BADGE = {
  alto: { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "Alto" },
  medio: { color: "#facc15", bg: "rgba(250,204,21,0.12)", label: "Médio" },
  baixo: { color: "#71717a", bg: "rgba(113,113,122,0.12)", label: "Baixo" },
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "agora";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatVolume(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v}`;
}

interface Props {
  news: CountryNewsResponse | null;
  newsLoading: boolean;
  signals: SignalsResponse | null;
  signalsLoading: boolean;
}

export default function NoticiasTab({ news, newsLoading, signals, signalsLoading }: Props) {
  return (
    <div className="space-y-4 p-4">
      {/* Signals / Predictive Markets */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Radio size={13} className="text-cyan-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-cyan-300">Sinais Preditivos</span>
          <span className="text-[9px] text-zinc-600">via Polymarket</span>
        </div>
        {signalsLoading ? (
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <Loader2 size={14} className="animate-spin" /> Buscando sinais…
          </div>
        ) : signals && signals.signals.length > 0 ? (
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            {signals.signals.map((s, i) => {
              const impactedTickers = findPortfolioImpact(s.title);
              return (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  <p className="text-xs font-medium leading-snug text-zinc-200">{s.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {s.odds.length > 0 && (
                      <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-400">
                        {s.odds[0].outcome}: {s.odds[0].percent}%
                      </span>
                    )}
                    {s.volume > 0 && (
                      <span className="text-[10px] text-zinc-500">Vol. {formatVolume(s.volume)}</span>
                    )}
                    {s.daysLeft !== null && (
                      <span className="text-[10px] text-zinc-600">{s.daysLeft}d restantes</span>
                    )}
                  </div>
                  {/* Links evento → ativos do portfólio */}
                  {impactedTickers.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <LinkIcon size={9} className="shrink-0 text-amber-400" />
                      <div className="flex flex-wrap gap-1">
                        {impactedTickers.map(t => (
                          <span key={t} className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <AlertCircle size={13} className="shrink-0 text-zinc-600" />
            Sinais preditivos indisponíveis no momento.
          </div>
        )}
      </section>

      {/* Country News */}
      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <Newspaper size={13} className="text-blue-400" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-blue-300">Notícias</span>
        </div>
        {newsLoading ? (
          <div className="flex items-center gap-2 rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <Loader2 size={14} className="animate-spin" /> Buscando notícias…
          </div>
        ) : !news || news.articles.length === 0 ? (
          <div className="rounded-xl p-3 text-xs text-zinc-500" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            Sem notícias recentes para este país.
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            {news.articles.map((article, i) => {
              const badge = IMPACT_BADGE[article.impacto];
              return (
                <a
                  key={i}
                  href={article.link}
                  target="_blank"
                  rel="noreferrer"
                  className="group block px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-xs leading-snug text-zinc-200 group-hover:text-zinc-50">
                      {article.titulo}
                    </p>
                    <ExternalLink size={11} className="mt-0.5 shrink-0 text-zinc-600 group-hover:text-zinc-400" />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-zinc-600">{article.fonte}</span>
                    {article.data && (
                      <span className="text-[10px] text-zinc-600">{timeAgo(article.data)}</span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
