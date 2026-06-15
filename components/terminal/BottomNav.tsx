"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_ITEMS } from "./nav";

// Rótulos curtos para caber na barra inferior.
const SHORT: Record<string, string> = {
  "/": "Home",
  "/resumo": "Resumo",
  "/performance": "Perf.",
  "/agente-ia": "Agente",
  "/configuracoes": "Config",
};

/**
 * Barra de navegação inferior — só no mobile/tablet (< 1100px), substituindo a
 * StatusBar (desktop). Acesso rápido aos itens principais; o Rail completo
 * continua acessível pelo menu (hambúrguer) da CommandBar. Estilo terminal:
 * chapado, hairline no topo, ícone + micro-rótulo mono, ativo em âmbar.
 */
export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="min-[1100px]:hidden fixed bottom-0 left-0 right-0 z-40 flex"
      style={{
        background: "var(--rail)",
        borderTop: "1px solid var(--line-strong)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {MOBILE_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="relative flex-1 flex flex-col items-center justify-center gap-1 py-2"
            style={{ color: active ? "var(--accent)" : "var(--muted)" }}
          >
            {active && (
              <span aria-hidden className="absolute top-0 left-0 right-0" style={{ height: 2, background: "var(--accent)" }} />
            )}
            <Icon size={19} strokeWidth={active ? 2 : 1.6} />
            <span
              className="font-mono leading-none"
              style={{ fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase" }}
            >
              {SHORT[href] ?? label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
