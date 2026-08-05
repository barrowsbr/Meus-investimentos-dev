"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { spaceForPath, CONFIG_ITEM, INICIO_HREF, INICIO_ICON, LEGACY_MOBILE, type NavItem } from "./nav";
import { useHubAtivo } from "@/lib/use-hub";
import { getNavEstilo, NAV_ESTILO_EVENT, type NavEstilo } from "@/lib/nav-prefs";

const SHORT: Record<string, string> = {
  "/inicio": "Início",
  "/": "Home",
  "/resumo": "Resumo",
  "/performance": "Perf.",
  "/financas": "Finanças",
  "/fluxos": "Fluxos",
  "/barroots": "Baú",
  "/noticias": "Notícias",
  "/radar": "Radar",
  "/configuracoes": "Config",
};

function useNavEstilo(): NavEstilo {
  const [estilo, setEstilo] = useState<NavEstilo>("atual");
  useEffect(() => {
    setEstilo(getNavEstilo());
    const onChange = () => setEstilo(getNavEstilo());
    window.addEventListener(NAV_ESTILO_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(NAV_ESTILO_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return estilo;
}

export default function BottomNav() {
  const pathname = usePathname();
  const spacesMode = useHubAtivo();
  const estilo = useNavEstilo();
  const space = spaceForPath(pathname);
  // MODO ESPAÇOS: Início (hub) + páginas-chave da categoria + Configurações.
  // MODO ANTIGO: o conjunto clássico global.
  const items: NavItem[] = spacesMode
    ? [
        { href: INICIO_HREF, label: "Início", icon: INICIO_ICON },
        ...(space ? space.items.filter((i) => i.mobileShow) : []),
        { href: CONFIG_ITEM.href, label: CONFIG_ITEM.label, icon: CONFIG_ITEM.icon },
      ]
    : LEGACY_MOBILE;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  if (estilo === "playstation") {
    const n = items.length;
    const ativo = items.find((it) => isActive(it.href));
    return (
      <nav className="bottom-nav ps min-[1100px]:hidden fixed z-40">
        {/* superfície única — crista sólida no topo, abre pra transparente na base
            (sem véu: era ele que criava o "ombro" fosco na crista) */}
        <span className="ps-surface" aria-hidden />
        <div className="ps-row">
          {items.map(({ href, label, icon: Icon }, i) => {
            const active = isActive(href);
            // Os ícones acompanham a curva rasa: centro mais alto, pontas ~10px
            // mais baixas (parábola suave e delicada, calibrada contra o PS5).
            const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
            const dy = Math.round(10 * t * t);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="ps-item"
                style={{ transform: `translateY(${dy}px)` }}
              >
                {/* luz suave que nasce da borda inferior, subindo por trás do
                    ícone ativo (wash de baixa intensidade, não holofote) */}
                {active && <span className="ps-bloom" aria-hidden />}
                {active && <span className="ps-refl" aria-hidden />}
                <Icon
                  size={active ? 23 : 21}
                  strokeWidth={active ? 2 : 1.7}
                  className="relative z-[1] transition-all duration-300 ease-out"
                  style={{
                    color: active ? "#fff" : "#8f8f96",
                    filter: active ? "drop-shadow(0 1px 4px rgba(255,255,255,0.28))" : "none",
                  }}
                />
              </Link>
            );
          })}
        </div>
        {/* rótulo do item ATIVO, centralizado embaixo (como o "Jogar" do console) */}
        {ativo && (
          <span className="ps-label" aria-hidden>
            {SHORT[ativo.href] ?? ativo.label}
          </span>
        )}
      </nav>
    );
  }

  // ── Estilo ATUAL (pill clássica) ──
  return (
    <nav className="bottom-nav min-[1100px]:hidden fixed z-40 left-3 right-3 flex items-center justify-around">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
          >
            <span
              className="flex items-center justify-center rounded-xl transition-all duration-300 ease-out"
              style={{
                width: 36,
                height: 36,
                background: active ? "var(--accent-wash)" : "transparent",
                boxShadow: active ? "0 0 12px color-mix(in srgb, var(--accent) 30%, transparent)" : "none",
              }}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.1 : 1.4}
                className="transition-all duration-300 ease-out"
                style={{
                  color: active ? "var(--accent)" : "var(--muted)",
                  transform: active ? "scale(1.08)" : "scale(1)",
                  filter: active ? "drop-shadow(0 0 5px color-mix(in srgb, var(--accent) 50%, transparent))" : "none",
                }}
              />
            </span>
            <span
              className="font-mono leading-none transition-colors duration-200"
              style={{
                fontSize: 8,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: active ? "var(--accent)" : "var(--faint)",
              }}
            >
              {SHORT[href] ?? label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
