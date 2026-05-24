"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Coins,
  Landmark,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/performance", label: "Performance", icon: TrendingUp },
  { href: "/proventos", label: "Proventos", icon: Coins },
  { href: "/renda-fixa", label: "Renda Fixa", icon: Landmark },
  { href: "/cambio", label: "Câmbio", icon: ArrowLeftRight },
  { href: "/financas", label: "Finanças", icon: Wallet },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop */}
      <aside
        className="sidebar-metallic hidden md:flex flex-col w-56 min-h-screen px-3 py-6 gap-1 fixed left-0 top-0 z-30 backdrop-blur-md"
        style={{
          borderRight: "1px solid",
          borderImageSource: "linear-gradient(180deg, transparent 0%, #2D2F3A 25%, #2D2F3A 75%, transparent 100%)",
          borderImageSlice: 1,
        }}
      >
        {/* Logo */}
        <div className="px-3 mb-8">
          <h1
            className="font-bold text-lg tracking-tight"
            style={{
              background: "linear-gradient(135deg, #d4a574 0%, #f5d49a 50%, #c49060 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Meus Investimentos
          </h1>
          <p className="text-[10px] text-zinc-600 mt-0.5 tracking-widest uppercase">Dashboard Pessoal</p>
        </div>

        <nav className="flex flex-col gap-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  active
                    ? "nav-active"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
                }`}
              >
                {/* Active accent bar */}
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{
                      background: "linear-gradient(180deg, #f5d49a, #d4a574, #c49060)",
                      boxShadow: "0 0 8px rgba(212,165,116,0.6)",
                    }}
                  />
                )}
                {/* Active outer glow ring */}
                {active && (
                  <span
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    style={{
                      boxShadow: "inset 0 0 0 1px rgba(212,165,116,0.18)",
                    }}
                  />
                )}
                <Icon
                  size={17}
                  strokeWidth={active ? 2.0 : 1.7}
                  style={active ? { filter: "drop-shadow(0 0 4px rgba(212,165,116,0.5))" } : undefined}
                />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom decoration line */}
        <div className="mt-auto px-3 pt-6">
          <div
            className="h-px w-full"
            style={{ background: "linear-gradient(90deg, transparent, #2D2F3A, transparent)" }}
          />
          <p className="text-[9px] text-zinc-700 mt-3 tracking-wider text-center uppercase">
            v1.0 · Personal
          </p>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 backdrop-blur-xl border-t flex justify-around py-1.5 px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
        style={{
          background: "rgba(13,14,17,0.95)",
          borderColor: "rgba(30,32,40,0.8)",
        }}
      >
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 text-[9px] px-2 py-1.5 rounded-lg transition-colors ${
                active ? "text-accent" : "text-zinc-600"
              }`}
            >
              <Icon
                size={19}
                strokeWidth={active ? 2.0 : 1.6}
                style={active ? { filter: "drop-shadow(0 0 4px rgba(212,165,116,0.5))" } : undefined}
              />
              <span className={active ? "font-medium" : ""}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
