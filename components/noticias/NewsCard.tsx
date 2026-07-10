"use client";

// Cartões de notícia reutilizáveis — estilo "jornal". Variantes:
//  - "hero": foto grande + overlay + título grande (a manchete principal)
//  - "sub":  cartão médio com foto
//  - "grid": thumb + texto (grade)
//  - "row":  linha compacta (feeds "Para você" / regional, sem foto grande)

import { useState } from "react";
import { Newspaper, Clock, ExternalLink, AlertTriangle, Languages, MapPin } from "lucide-react";
import { type NewsArticle, timeAgo, proxyImg, catGradient, IMPACT_STYLE } from "@/lib/news/ui";

function NewsThumb({ a, className, rounded = "rounded-lg" }: { a: NewsArticle; className?: string; rounded?: string }) {
  const [err, setErr] = useState(false);
  if (a.imagem && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={proxyImg(a.imagem)} alt="" onError={() => setErr(true)} className={`${className} ${rounded} object-cover`} loading="lazy" />;
  }
  return (
    <div className={`${className} ${rounded} flex items-center justify-center`} style={{ background: catGradient(a.categoria) }}>
      <Newspaper size={18} className="text-white/70" />
    </div>
  );
}

function ImpactBadge({ impacto, categoria }: { impacto?: NewsArticle["impacto"]; categoria?: string }) {
  const s = impacto ? IMPACT_STYLE[impacto] : null;
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ background: s?.bg ?? "rgba(255,255,255,0.08)", color: s?.text ?? "var(--muted)" }}>
      {impacto === "alto" && <AlertTriangle size={9} />}
      {s?.label ?? ""}{categoria ? `${s ? " · " : ""}${categoria}` : ""}
    </span>
  );
}

function Meta({ a }: { a: NewsArticle }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--faint)" }}>
      <span className="truncate">{a.fonte}</span>
      {a.local && <span className="inline-flex items-center gap-0.5 rounded px-1 text-[9px] font-semibold" style={{ background: "rgba(34,197,94,0.14)", color: "#4ade80" }}><MapPin size={8} />local</span>}
      {a.idioma && <span title={a.original ? `Original: ${a.original}` : undefined} className="inline-flex items-center gap-0.5"><Languages size={9} />{a.idioma}</span>}
      {a.data && <><span>·</span><Clock size={9} /><span>{timeAgo(a.data)}</span></>}
    </div>
  );
}

export default function NewsCard({ a, variant = "grid" }: { a: NewsArticle; variant?: "hero" | "sub" | "grid" | "row" }) {
  const clickable = !!a.link;
  const Wrapper = ({ children, className }: { children: React.ReactNode; className?: string }) =>
    clickable
      ? <a href={a.link} target="_blank" rel="noopener noreferrer"
          className={`${className} no-underline`}>{children}</a>
      : <div className={className}>{children}</div>;

  if (variant === "hero") {
    return (
      <Wrapper className="group relative block overflow-hidden rounded-2xl">
        <NewsThumb a={a} className="h-48 w-full sm:h-56" rounded="rounded-2xl" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)" }} />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5"><ImpactBadge impacto={a.impacto} categoria={a.categoria} /></div>
          <h3 className="mb-1.5 text-lg font-bold leading-snug text-white line-clamp-3 group-hover:underline">{a.titulo}</h3>
          <Meta a={a} />
        </div>
      </Wrapper>
    );
  }

  if (variant === "sub") {
    return (
      <Wrapper className="group block overflow-hidden rounded-xl" >
        <div className="relative">
          <NewsThumb a={a} className="h-32 w-full" rounded="rounded-t-xl" />
          <div className="absolute left-2 top-2"><ImpactBadge impacto={a.impacto} categoria={a.categoria} /></div>
        </div>
        <div className="p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
          <h4 className="mb-1.5 text-sm font-semibold leading-snug line-clamp-2 group-hover:underline" style={{ color: "var(--text)" }}>{a.titulo}</h4>
          <Meta a={a} />
        </div>
      </Wrapper>
    );
  }

  if (variant === "row") {
    return (
      <Wrapper className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]">
        {a.ticker && <span className="mt-0.5 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold" style={{ color: "var(--muted)" }}>{a.ticker.replace(/\.SA$/, "")}</span>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug line-clamp-2 group-hover:underline" style={{ color: "var(--text)" }}>{a.titulo}</p>
            {a.impacto && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: IMPACT_STYLE[a.impacto].text }} />}
          </div>
          <div className="mt-0.5"><Meta a={a} /></div>
        </div>
        {clickable && <ExternalLink size={12} className="mt-0.5 shrink-0" style={{ color: "var(--faint)" }} />}
      </Wrapper>
    );
  }

  // grid
  return (
    <Wrapper className="group flex gap-3 rounded-xl p-2.5 transition-colors hover:bg-white/[0.03]">
      <NewsThumb a={a} className="h-16 w-24 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mb-1"><ImpactBadge impacto={a.impacto} categoria={a.categoria} /></div>
        <h4 className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:underline" style={{ color: "var(--text)" }}>{a.titulo}</h4>
        <div className="mt-1"><Meta a={a} /></div>
      </div>
    </Wrapper>
  );
}
