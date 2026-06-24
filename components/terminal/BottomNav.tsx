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
      className="bottom-nav min-[1100px]:hidden fixed z-40 left-3 right-3 flex items-center justify-around"
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

          </Link>
        );
      })}
    </nav>
  );
}
