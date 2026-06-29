"use client";

import { useEffect, useState } from "react";
import { Newspaper, Clock } from "lucide-react";

interface AssetNewsItem {
  titulo: string;
  link: string;
  data: string;
  fonte: string;
  imagem: string | null;
}

// Proxy de imagem (mesma regra da Home): nunca renderiza host Google direto.
function proxyImg(url: string | null): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes("google") || h.endsWith("gstatic.com") || h.endsWith("googleusercontent.com") || h.endsWith("ggpht.com")) return null;
  } catch { return null; }
  return `/api/img-proxy?url=${encodeURIComponent(url)}`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const diffH = Math.floor((Date.now() - d.getTime()) / 3600000);
    if (diffH < 1) return "agora";
    if (diffH < 24) return `há ${diffH}h`;
    return `há ${Math.floor(diffH / 24)}d`;
  } catch { return ""; }
}

// Thumbnail: imagem real (não-Google) com fallback para bloco com ícone de jornal.
function NewsThumb({ imagem }: { imagem: string | null }) {
  const [err, setErr] = useState(false);
  const src = proxyImg(imagem);
  if (src && !err) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        onError={() => setErr(true)}
      />
    );
  }
  return (
    <div className="h-full w-full flex items-center justify-center" style={{ background: "var(--hover)" }}>
      <Newspaper size={16} style={{ color: "var(--muted)" }} />
    </div>
  );
}

export default function AssetNews({ ticker, nome, moeda }: { ticker: string; nome?: string; moeda?: string }) {
  const [articles, setArticles] = useState<AssetNewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ ticker });
    if (nome) qs.set("nome", nome);
    if (moeda) qs.set("moeda", moeda);
    fetch(`/api/noticias/ativo?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setArticles(Array.isArray(d.articles) ? d.articles : []); })
      .catch(() => { if (!cancelled) setArticles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, nome, moeda]);

  return (
    <div className="mt-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
        <Newspaper size={12} /> Notícias relacionadas
        {articles.length > 0 && <span className="opacity-60">({articles.length})</span>}
      </h3>

      {loading ? (
        <p className="text-xs animate-pulse" style={{ color: "var(--muted)" }}>Buscando notícias sobre {ticker}…</p>
      ) : articles.length === 0 ? (
        <p className="text-xs italic" style={{ color: "var(--muted)" }}>Sem notícias recentes para {ticker}.</p>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--line)" }}>
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 p-3 transition-colors hover:bg-white/[0.03]"
              style={{ borderBottom: i < articles.length - 1 ? "1px solid var(--line)" : undefined }}
            >
              <div className="relative h-[60px] w-[84px] shrink-0 overflow-hidden rounded" style={{ background: "var(--hover)" }}>
                <NewsThumb imagem={a.imagem} />
              </div>
              <div className="flex flex-1 flex-col justify-between min-w-0">
                <p className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:underline decoration-1 underline-offset-2" style={{ color: "var(--text)" }}>
                  {a.titulo}
                </p>
                <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px]" style={{ color: "var(--faint)" }}>
                  <span className="truncate" style={{ maxWidth: 160 }}>{a.fonte}</span>
                  {a.data && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1 shrink-0"><Clock size={9} /> {timeAgo(a.data)}</span>
                    </>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
