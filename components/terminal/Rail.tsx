"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

interface Props {
  /** Aberto como slide-over no mobile (< 1100px). */
  open?: boolean;
  onNavigate?: () => void;
}

export default function Rail({ open = false, onNavigate }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop no mobile */}
      <div
        aria-hidden
        onClick={onNavigate}
        className="fixed inset-0 z-30 bg-black/50 min-[1100px]:hidden"
        style={{ display: open ? "block" : "none" }}
      />

      <aside
        className={`fixed top-0 left-0 z-40 h-screen flex flex-col overflow-y-auto transition-transform duration-200 min-[1100px]:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          width: 206,
          background: "var(--rail)",
          borderRight: "1px solid var(--line)",
        }}
      >
        {/* Marca */}
        <div
          className="flex items-center gap-2.5 px-4 pt-4 pb-3.5"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <Image src="/barroots-mark.png" alt="Barroots" width={24} height={24} className="object-contain" />
          <span
            className="font-mono text-[12px] font-bold"
            style={{ letterSpacing: ".1em", color: "var(--text)" }}
          >
            BARROOTS
          </span>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-2 py-2.5">
          {NAV.map((sec, si) => (
            <div key={si} className="mb-2.5">
              {sec.label && (
                <div
                  className="px-2.5 pt-1.5 pb-1 font-mono"
                  style={{
                    fontSize: 8.5,
                    fontWeight: 600,
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                    color: "var(--faint)",
                  }}
                >
                  {sec.label}
                </div>
              )}
              {sec.items.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    data-active={active}
                    className="t-rail-item relative flex items-center gap-2.5 w-full px-2.5 py-[7px] text-left"
                    style={{
                      background: active ? "var(--accent-wash)" : "transparent",
                      color: active ? "var(--accent)" : "var(--muted)",
                      fontSize: 12.5,
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5"
                        style={{ width: 2, background: "var(--accent)" }}
                      />
                    )}
                    <Icon size={15} strokeWidth={active ? 2 : 1.6} />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          className="px-3.5 py-2.5 font-mono"
          style={{ borderTop: "1px solid var(--line)", fontSize: 9, color: "var(--faint)", letterSpacing: ".1em" }}
        >
          v2.0 · TERMINAL
        </div>
      </aside>
    </>
  );
}
