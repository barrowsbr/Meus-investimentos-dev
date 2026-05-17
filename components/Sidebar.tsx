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
      <aside className="hidden md:flex flex-col w-56 min-h-screen border-r border-border bg-card/50 backdrop-blur-sm px-3 py-6 gap-1 fixed left-0 top-0 z-30">
        <h1 className="text-accent font-bold text-lg px-3 mb-6 tracking-tight">
          Meus Investimentos
        </h1>
        <nav className="flex flex-col gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-md border-t border-border flex justify-around py-2 px-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 text-[10px] px-2 py-1 rounded-lg transition-colors ${
                active ? "text-accent" : "text-zinc-500"
              }`}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
