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
} from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
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
      <aside className="hidden md:flex flex-col w-56 min-h-screen border-r border-border bg-[#0c0c0e]/80 backdrop-blur-md px-3 py-6 gap-1 fixed left-0 top-0 z-30">
        <div className="px-3 mb-8">
          <h1 className="text-accent font-bold text-lg tracking-tight">
            Meus Investimentos
          </h1>
          <p className="text-[10px] text-zinc-600 mt-0.5 tracking-wide">DASHBOARD PESSOAL</p>
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
                    ? "bg-accent/12 text-accent shadow-[inset_0_0_20px_rgba(212,165,116,0.05)]"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent" />
                )}
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0c0c0e]/95 backdrop-blur-xl border-t border-border/60 flex justify-around py-1.5 px-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
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
              <Icon size={19} strokeWidth={active ? 2.2 : 1.6} />
              <span className={active ? "font-medium" : ""}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
