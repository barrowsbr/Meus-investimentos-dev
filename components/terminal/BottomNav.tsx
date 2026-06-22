"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_ITEMS } from "./nav";

const SHORT: Record<string, string> = {
  "/": "Home",
  "/resumo": "Resumo",
  "/performance": "Perf.",
  "/radar": "Radar",
  "/configuracoes": "Config",
};

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="min-[1100px]:hidden fixed z-40 left-3 right-3 flex items-center justify-around rounded-2xl"
      style={{
        bottom: "max(0.5rem, env(safe-area-inset-bottom, 0.5rem))",
        height: 58,
        background: "color-mix(in srgb, var(--rail) 72%, transparent)",
        backdropFilter: "blur(20px) saturate(1.3)",
        WebkitBackdropFilter: "blur(20px) saturate(1.3)",
        border: "1px solid var(--line)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {MOBILE_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
            {active && (
              <span
                aria-hidden
                className="absolute bottom-1 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: 4,
                  height: 4,
                  background: "var(--accent)",
                  boxShadow: "0 0 6px color-mix(in srgb, var(--accent) 60%, transparent)",
                }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
