"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType } from "react";
import {
  Home,
  LayoutDashboard,
  TrendingUp,
  BarChart2,
  BarChart3,
  Landmark,
  Coins,
  Bitcoin,
  ArrowLeftRight,
  Receipt,
  Activity,
  Wallet,
  Settings,
  Bot,
  Newspaper,
  ListOrdered,
  Target,
  Globe,
  PieChart,
  Scale,
  Zap,
  Crosshair,
  BrainCircuit,
  Egg,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  mobileShow?: boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Home", icon: Home, mobileShow: true },
    ],
  },
  {
    label: "Portfólio",
    items: [
      { href: "/resumo",         label: "Resumo",         icon: LayoutDashboard, mobileShow: true },
      { href: "/renda-variavel", label: "Renda Variável", icon: BarChart2 },
      { href: "/renda-fixa",     label: "Renda Fixa",     icon: Landmark },
      { href: "/proventos",      label: "Proventos",      icon: Coins },
      { href: "/criptoativos",   label: "Criptoativos",   icon: Bitcoin },
      { href: "/opcoes",         label: "Opções",         icon: Crosshair },
    ],
  },
  {
    label: "Análise",
    items: [
      { href: "/performance",          label: "Performance",   icon: TrendingUp, mobileShow: true },
      { href: "/setores",              label: "Setores",       icon: PieChart },
      { href: "/evolucao",             label: "Evolução",       icon: Activity },
      { href: "/cambio",               label: "Câmbio",         icon: ArrowLeftRight },
      { href: "/simulacoes",           label: "Simulações",     icon: Target },
      { href: "/trades",               label: "Trades",         icon: Zap },
      { href: "/preditivo",            label: "Preditivo",      icon: BrainCircuit },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/impostos",      label: "Impostos",      icon: Receipt },
      { href: "/alavancagem",  label: "Alavancagem",   icon: Scale },
      { href: "/financas",     label: "Fin. Pessoais", icon: Wallet },
      { href: "/fluxos",       label: "Fluxos",        icon: ListOrdered },
    ],
  },
  {
    label: "Mais",
    items: [
      { href: "/moedas",        label: "Moedas",        icon: Globe },
      { href: "/bolsas",        label: "Bolsas",        icon: BarChart3 },
      { href: "/noticias",      label: "Notícias",     icon: Newspaper },
      { href: "/polymarket",    label: "Polymarket",   icon: BarChart2 },
      { href: "/agente-ia",     label: "Agente IA",    icon: Bot, mobileShow: true },
      { href: "/easter-eggs",  label: "Easter Eggs",  icon: Egg },
      { href: "/configuracoes", label: "Configurações", icon: Settings, mobileShow: true },
    ],
  },
];

const mobileItems = navGroups
  .flatMap((g) => g.items)
  .filter((i) => i.mobileShow);

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside
        className="sidebar-metallic hidden md:flex flex-col w-56 min-h-screen px-3 py-6 fixed left-0 top-0 z-30 backdrop-blur-md overflow-y-auto"
        style={{
          borderRight: "1px solid",
          borderImageSource:
            "linear-gradient(180deg, transparent 0%, #353748 20%, #353748 80%, transparent 100%)",
          borderImageSlice: 1,
        }}
      >
        {/* Logo */}
        <div className="px-3 mb-7">
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
          <p className="text-[10px] text-zinc-600 mt-0.5 tracking-widest uppercase">
            Dashboard Pessoal
          </p>
        </div>

        {/* Nav groups */}
        <nav className="flex flex-col gap-4 flex-1">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {/* Group label */}
              {group.label && (
                <p className="px-3 mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                  {group.label}
                </p>
              )}

              {/* Group separator (for groups without label) */}
              {!group.label && gi > 0 && (
                <div
                  className="mx-3 mb-3 h-px"
                  style={{ background: "linear-gradient(90deg, transparent, #35374850, transparent)" }}
                />
              )}

              <div className="flex flex-col gap-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
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
                      {active && (
                        <>
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                            style={{
                              background: "linear-gradient(180deg, #f5d49a, #d4a574, #c49060)",
                              boxShadow: "0 0 8px rgba(212,165,116,0.6)",
                            }}
                          />
                          <span
                            className="absolute inset-0 rounded-xl pointer-events-none"
                            style={{ boxShadow: "inset 0 0 0 1px rgba(212,165,116,0.18)" }}
                          />
                        </>
                      )}
                      <Icon
                        size={16}
                        strokeWidth={active ? 2.0 : 1.6}
                        style={
                          active
                            ? { filter: "drop-shadow(0 0 4px rgba(212,165,116,0.45))" }
                            : undefined
                        }
                      />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 pt-4">
          <div
            className="h-px w-full mb-3"
            style={{ background: "linear-gradient(90deg, transparent, #353748, transparent)" }}
          />
          <p className="text-[9px] text-zinc-600 tracking-wider text-center uppercase">
            v1.0 · Personal
          </p>
        </div>
      </aside>

      {/* ── Mobile floating glass bar ── */}
      <nav
        className="md:hidden fixed z-40 left-4 right-4 flex justify-around items-center h-14 rounded-2xl"
        style={{
          bottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
          background: "rgba(20,21,30,0.55)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {mobileItems.map(({ href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center justify-center flex-1 h-full"
            >
              <span
                className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 ease-out"
                style={
                  active
                    ? {
                        background: "rgba(212,165,116,0.15)",
                        boxShadow: "0 0 12px rgba(212,165,116,0.2)",
                      }
                    : { background: "transparent" }
                }
              >
                <Icon
                  size={24}
                  strokeWidth={active ? 2.2 : 1.4}
                  className="transition-all duration-300 ease-out"
                  style={{
                    color: active ? "#f5d49a" : "#6b7280",
                    transform: active ? "scale(1.1)" : "scale(1)",
                    filter: active
                      ? "drop-shadow(0 0 6px rgba(212,165,116,0.5))"
                      : "none",
                  }}
                />
              </span>
              <span
                className="absolute bottom-1.5 w-1 h-1 rounded-full transition-all duration-300 ease-out"
                style={{
                  background: active ? "#f5d49a" : "transparent",
                  boxShadow: active ? "0 0 6px rgba(212,165,116,0.6)" : "none",
                  transform: active ? "scale(1)" : "scale(0)",
                }}
              />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
