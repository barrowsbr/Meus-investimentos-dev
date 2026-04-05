"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/",            label: "Home" },
  { href: "/portfolio",   label: "Investimentos" },
  { href: "/finance",     label: "Finanças" },
  { href: "/performance", label: "Performance" },
  { href: "/news",        label: "Notícias" },
  { href: "/agent",       label: "Agente IA" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="border-b border-white/10 bg-[#0d1526]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
        <span className="font-bold text-lg tracking-wider text-slate-100">◈ Command Center</span>
        <div className="flex gap-1 ml-4">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                path === href
                  ? "bg-indigo-500/20 text-indigo-300 font-medium"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
