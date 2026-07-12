"use client";

// O "jornal": aba de Notícias com sub-abas Para você / Mercado / Mundo / Cripto /
// Busca. Cada uma puxa de um endpoint diferente (o motor certo pra cada foco) e
// renderiza com NewsCard. Cache por aba (troca de aba não refaz fetch).

import { useState, useEffect, useCallback } from "react";
import { Loader2, Search, Sparkles, Newspaper, Globe2, Bitcoin, Landmark, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import NewsCard from "./NewsCard";
import type { NewsArticle } from "@/lib/news/ui";
import { getPerfilNoticias, perfilQuery, PERFIL_EVENT } from "@/lib/news/perfil";
import { TEMAS_PERFIL } from "@/lib/news/temas";

type Sub = "foryou" | "mercado" | "mundo" | "cripto" | "busca";

const SUBS: { id: Sub; label: string; icon: typeof Newspaper }[] = [
  { id: "foryou", label: "Para você", icon: Sparkles },
  { id: "mercado", label: "Mercado", icon: Landmark },
  { id: "mundo", label: "Mundo", icon: Globe2 },
  { id: "cripto", label: "Cripto", icon: Bitcoin },
  { id: "busca", label: "Busca", icon: Search },
];

const COUNTRIES = ["Estados Unidos", "China", "Japão", "Alemanha", "Reino Unido", "França", "Argentina"];

async function getArticles(url: string): Promise<NewsArticle[]> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    return Array.isArray(j?.articles) ? (j.articles as NewsArticle[]) : [];
  } catch {
    return [];
  }
}

function Loading() {
  return <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin" size={22} style={{ color: "var(--muted)" }} /></div>;
}
function Empty({ msg }: { msg: string }) {
  return <div className="py-16 text-center text-sm" style={{ color: "var(--faint)" }}>{msg}</div>;
}

// Layout "jornal": hero + 2 sub-destaques + grade (para as abas com foto).
function Jornal({ articles }: { articles: NewsArticle[] }) {
  if (articles.length === 0) return <Empty msg="Sem notícias no momento." />;
  const withImg = [...articles].sort((a, b) => (a.imagem ? 0 : 1) - (b.imagem ? 0 : 1));
  const hero = withImg[0];
  const subs = withImg.slice(1, 3);
  const rest = withImg.slice(3);
  return (
    <div className="space-y-4">
      <NewsCard a={hero} variant="hero" />
      {subs.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {subs.map((a, i) => <NewsCard key={a.link || i} a={a} variant="sub" />)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2 xl:grid-cols-3">
          {rest.map((a, i) => <NewsCard key={a.link || i} a={a} variant="grid" />)}
        </div>
      )}
    </div>
  );
}

export default function NoticiasPanel() {
  const [sub, setSub] = useState<Sub>("mercado");
  const [loading, setLoading] = useState(false);

  const [mercado, setMercado] = useState<NewsArticle[] | null>(null);
  const [foryou, setForyou] = useState<NewsArticle[] | null>(null);
  const [cripto, setCripto] = useState<NewsArticle[] | null>(null);
  const [mundo, setMundo] = useState<Record<string, NewsArticle[]>>({});
  const [pais, setPais] = useState(COUNTRIES[0]);

  const [busca, setBusca] = useState("");
  const [buscaQ, setBuscaQ] = useState("");
  const [buscaRes, setBuscaRes] = useState<NewsArticle[] | null>(null);

  // Perfil mudou (card em Configurações) → refaz o "Para você" na próxima visita.
  useEffect(() => {
    const onPerfil = () => setForyou(null);
    window.addEventListener(PERFIL_EVENT, onPerfil);
    return () => window.removeEventListener(PERFIL_EVENT, onPerfil);
  }, []);

  // Carrega o dado da aba ativa (lazy + cache).
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (sub === "mercado" && mercado === null) {
        setLoading(true);
        const a = await getArticles("/api/noticias/destaques");
        if (alive) { setMercado(a); setLoading(false); }
      } else if (sub === "foryou" && foryou === null) {
        setLoading(true);
        // Feed personalizado: o perfil de interesses (localStorage) vai por
        // query e o MOTOR ranqueia no servidor (interesse+impacto+recência+foto).
        const a = await getArticles(`/api/noticias?${perfilQuery(getPerfilNoticias())}`);
        if (alive) { setForyou(a); setLoading(false); }
      } else if (sub === "cripto" && cripto === null) {
        setLoading(true);
        const a = await getArticles(`/api/noticias/busca?q=${encodeURIComponent("bitcoin ethereum criptomoedas mercado cripto")}`);
        if (alive) { setCripto(a.map(x => ({ ...x, categoria: x.categoria ?? "Cripto" }))); setLoading(false); }
      } else if (sub === "mundo" && !mundo[pais]) {
        setLoading(true);
        const a = await getArticles(`/api/radar/news?country=${encodeURIComponent(pais)}`);
        if (alive) { setMundo(m => ({ ...m, [pais]: a })); setLoading(false); }
      }
    };
    run();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, pais]);

  const doSearch = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) return;
    setBuscaQ(t);
    setLoading(true);
    const a = await getArticles(`/api/noticias/busca?q=${encodeURIComponent(t)}`);
    setBuscaRes(a);
    setLoading(false);
  }, []);

  return (
    <div>
      {/* Sub-abas */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {SUBS.map(({ id, label, icon: Icon }) => {
          const active = sub === id;
          return (
            <button key={id} onClick={() => setSub(id)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: active ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${active ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: active ? "#93c5fd" : "var(--muted)",
              }}>
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      {/* Seletor de país (só na aba Mundo) */}
      {sub === "mundo" && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {COUNTRIES.map(c => (
            <button key={c} onClick={() => setPais(c)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: pais === c ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${pais === c ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)"}`,
                color: pais === c ? "var(--text)" : "var(--faint)",
              }}>{c}</button>
          ))}
        </div>
      )}

      {/* Barra de busca (só na aba Busca) */}
      {sub === "busca" && (
        <form onSubmit={e => { e.preventDefault(); doSearch(busca); }} className="mb-4 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <Search size={15} style={{ color: "var(--faint)" }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Busque por ativo, tema ou país (ex.: Petrobras, juros Fed, China)…"
              className="w-full bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} />
          </div>
          <button type="submit" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "rgba(96,165,250,0.16)", border: "1px solid rgba(96,165,250,0.4)", color: "#93c5fd" }}>Buscar</button>
        </form>
      )}

      {/* Conteúdo */}
      {loading ? <Loading /> : (
        <>
          {sub === "mercado" && <Jornal articles={mercado ?? []} />}
          {sub === "cripto" && <Jornal articles={cripto ?? []} />}
          {sub === "mundo" && <Jornal articles={mundo[pais] ?? []} />}
          {sub === "foryou" && (
            (foryou && foryou.length > 0)
              ? (
                <div>
                  {/* Perfil aplicado + atalho para personalizar */}
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    {getPerfilNoticias().interesses.map(t => {
                      const def = TEMAS_PERFIL.find(x => x.id === t);
                      return def ? (
                        <span key={t} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.25)", color: "#93c5fd" }}>
                          {def.label}
                        </span>
                      ) : null;
                    })}
                    <Link href="/configuracoes#aparencia" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors hover:bg-white/5" style={{ border: "1px solid var(--line-strong)", color: "var(--muted)" }}>
                      <SlidersHorizontal size={10} /> Personalizar
                    </Link>
                  </div>
                  <Jornal articles={foryou} />
                </div>
              )
              : <Empty msg="Montando seu feed personalizado…" />
          )}
          {sub === "busca" && (
            buscaRes === null
              ? <Empty msg="Digite um termo e busque — por ativo, tema ou país." />
              : buscaRes.length === 0
                ? <Empty msg={`Nada encontrado para “${buscaQ}”.`} />
                : <Jornal articles={buscaRes} />
          )}
        </>
      )}
    </div>
  );
}
