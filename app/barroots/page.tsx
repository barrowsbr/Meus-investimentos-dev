"use client";

// Home do espaço "Barroots" — o resto (notícias, radar, coleções, observatório,
// diversão). Uma vitrine de cards que levam a cada página do espaço.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { SPACES } from "@/components/terminal/nav";

export default function BarrootsHome() {
  const space = SPACES.find((s) => s.id === "barroots");
  const items = (space?.items ?? []).filter((i) => i.href !== "/barroots");

  return (
    <>
      <PageHeader
        title="Barroots"
        description="O resto — notícias, radar, coleções, observatório e diversão."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl">
        {items.map(({ href, label, icon: Icon, sub }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex items-start gap-3 rounded-2xl p-4 transition-colors"
            style={{ background: "var(--surface, rgba(255,255,255,0.03))", border: "1px solid var(--line, rgba(255,255,255,0.08))" }}
          >
            <span
              className="grid place-items-center rounded-xl shrink-0"
              style={{ width: 40, height: 40, background: "var(--accent-wash)", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)", color: "var(--accent)" }}
            >
              <Icon size={19} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{label}</span>
                <ArrowRight size={13} className="opacity-0 -translate-x-1 transition-all group-hover:opacity-60 group-hover:translate-x-0" style={{ color: "var(--muted)" }} />
              </div>
              {sub && <p className="mt-0.5 text-xs leading-snug" style={{ color: "var(--muted)" }}>{sub}</p>}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
