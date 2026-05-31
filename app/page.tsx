"use client";

import { useState } from "react";
import type { ElementType } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard, TrendingUp, BarChart2, Landmark, Coins,
  Bitcoin, ArrowLeftRight, Receipt, Activity, Wallet,
  Settings, Newspaper, Bot, ListOrdered, ChevronDown,
  ArrowRight, TrendingDown,
} from "lucide-react";
import { usePortfolio } from "@/lib/hooks";
import { compactBRL, pct } from "@/lib/format";

interface NavItem { href: string; label: string; icon: ElementType }
interface NavGroup {
  id: string;
  label: string;
  desc: string;
  icon: ElementType;
  accentColor: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "composicao",
    label: "Composição",
    desc: "Portfolio, alocação e posições",
    icon: LayoutDashboard,
    accentColor: "#d4a574",
    items: [
      { href: "/resumo",          label: "Resumo",         icon: LayoutDashboard },
      { href: "/renda-variavel",  label: "Renda Variável", icon: BarChart2 },
      { href: "/renda-fixa",      label: "Renda Fixa",     icon: Landmark },
      { href: "/proventos",       label: "Proventos",      icon: Coins },
      { href: "/criptoativos",    label: "Criptoativos",   icon: Bitcoin },
    ],
  },
  {
    id: "analise",
    label: "Análise",
    desc: "Performance, retorno e risco",
    icon: TrendingUp,
    accentColor: "#3b82f6",
    items: [
      { href: "/performance",  label: "Performance", icon: TrendingUp },
      { href: "/evolucao",     label: "Evolução",    icon: Activity },
      { href: "/cambio",       label: "Câmbio",      icon: ArrowLeftRight },
    ],
  },
  {
    id: "gestao",
    label: "Gestão",
    desc: "Impostos, fluxos e finanças pessoais",
    icon: Receipt,
    accentColor: "#8b5cf6",
    items: [
      { href: "/impostos", label: "Impostos",      icon: Receipt },
      { href: "/financas", label: "Fin. Pessoais", icon: Wallet },
      { href: "/fluxos",   label: "Fluxos",        icon: ListOrdered },
    ],
  },
  {
    id: "mais",
    label: "Mais",
    desc: "Notícias, Polymarket, Agente IA e configurações",
    icon: Newspaper,
    accentColor: "#06b6d4",
    items: [
      { href: "/noticias",       label: "Notícias",       icon: Newspaper },
      { href: "/polymarket",     label: "Polymarket",     icon: BarChart2 },
      { href: "/agente-ia",      label: "Agente IA",      icon: Bot },
      { href: "/configuracoes",  label: "Configurações",  icon: Settings },
    ],
  },
];

function AccordionGroup({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const Icon = group.icon;
  const c = group.accentColor;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: "rgba(13,14,20,0.75)",
        border: `1px solid ${open ? c + "35" : "rgba(255,255,255,0.05)"}`,
        boxShadow: open ? `0 12px 40px ${c}12` : "none",
      }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
        style={{ background: open ? `${c}08` : "transparent" }}
        onClick={() => setOpen(!open)}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${c}18`, boxShadow: open ? `0 0 16px ${c}25` : "none" }}
        >
          <Icon size={18} style={{ color: c }} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-100">{group.label}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{group.desc}</p>
        </div>
        <ChevronDown
          size={15}
          className="shrink-0 transition-transform duration-300 text-zinc-600"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", color: open ? c : undefined }}
        />
      </button>

      {/* Sub-items */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? `${group.items.length * 56}px` : "0px" }}
      >
        <div className="px-4 pb-3 flex flex-col gap-1">
          {group.items.map(({ href, label, icon: SubIcon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = `${c}0d`;
                (e.currentTarget as HTMLElement).style.borderColor = `${c}25`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.04)";
              }}
            >
              <SubIcon size={15} className="text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" strokeWidth={1.6} />
              <span className="flex-1 text-[12px] font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">{label}</span>
              <ArrowRight size={12} className="text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data, loading } = usePortfolio();

  const totalBRL = data?.totalPatrimonioBRL ?? null;
  const usdbrl = data?.usdbrl ?? null;
  const totalUSD = totalBRL !== null && usdbrl ? totalBRL / usdbrl : null;
  const dayChangeBRL = data?.dayChangeTotalBRL ?? null;
  const dayChangePct = data?.dayChangeTotalPct ?? null;
  const isDayUp = (dayChangeBRL ?? 0) >= 0;
  const usdDayChangePct = data?.fxDayChange?.USD?.changePct ?? null;
  const isUsdUp = (usdDayChangePct ?? 0) >= 0;

  return (
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(20,22,35,0.7) 0%, rgba(10,11,15,0.97) 100%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-lg px-4 py-10 flex flex-col items-center">

        {/* ── Hero ── */}
        <div className="text-center mb-8 pt-16 animate-fade-in">
          <div className="flex justify-center mb-5">
            <Image
              src="/midias/carregamento.png"
              alt="Meus Investimentos"
              width={96}
              height={96}
              className="h-20 w-auto drop-shadow-lg"
              priority
            />
          </div>
          <h1
            className="text-3xl md:text-4xl font-bold mb-2 leading-tight"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #d4d4d8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Olá, Lucas
          </h1>
          <p className="text-zinc-500 text-sm">Sistema integrado de gestão de investimentos</p>
        </div>

        {/* ── Live Metrics ── */}
        <div className="w-full grid grid-cols-3 gap-3 mb-7 animate-fade-in animate-delay-1">
          {/* Patrimônio Total */}
          <div
            className="rounded-2xl p-4 flex flex-col items-center text-center transition-transform hover:scale-[1.02]"
            style={{
              background: "rgba(13,14,20,0.8)",
              border: "1px solid rgba(212,165,116,0.15)",
              boxShadow: "0 4px 20px rgba(212,165,116,0.05)",
            }}
          >
            <span className="text-[9px] text-zinc-600 font-semibold uppercase tracking-wider mb-1.5">Patrimônio</span>
            {loading || totalBRL === null ? (
              <span className="text-sm font-bold text-zinc-600 animate-pulse">—</span>
            ) : (
              <>
                <span className="text-sm font-bold text-zinc-100">{compactBRL(totalBRL)}</span>
                {totalUSD !== null && (
                  <span className="text-[9px] text-zinc-500 mt-1">
                    US$ {totalUSD >= 1000 ? `${(totalUSD / 1000).toFixed(1)}k` : totalUSD.toFixed(0)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Retorno dia */}
          <div
            className="rounded-2xl p-4 flex flex-col items-center text-center transition-transform hover:scale-[1.02]"
            style={{
              background: "rgba(13,14,20,0.8)",
              border: `1px solid ${isDayUp ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`,
              boxShadow: `0 4px 20px ${isDayUp ? "rgba(74,222,128,0.04)" : "rgba(248,113,113,0.04)"}`,
            }}
          >
            <span className="text-[9px] text-zinc-600 font-semibold uppercase tracking-wider mb-1.5">Retorno Dia</span>
            {loading || dayChangePct === null ? (
              <span className="text-sm font-bold text-zinc-600 animate-pulse">—</span>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  {isDayUp
                    ? <TrendingUp size={12} className="text-emerald-400" />
                    : <TrendingDown size={12} className="text-red-400" />}
                  <span className={`text-sm font-bold ${isDayUp ? "text-emerald-400" : "text-red-400"}`}>
                    {pct(dayChangePct)}
                  </span>
                </div>
                {dayChangeBRL !== null && (
                  <span className={`text-[9px] font-semibold mt-1 ${isDayUp ? "text-emerald-400/70" : "text-red-400/70"}`}>
                    {isDayUp ? "+" : ""}{compactBRL(dayChangeBRL)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Dólar — links to currencies page */}
          <Link
            href="/moedas"
            className="rounded-2xl p-4 flex flex-col items-center text-center transition-transform hover:scale-[1.02] cursor-pointer"
            style={{
              background: "rgba(13,14,20,0.8)",
              border: `1px solid ${isUsdUp ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)"}`,
              boxShadow: `0 4px 20px ${isUsdUp ? "rgba(16,185,129,0.04)" : "rgba(248,113,113,0.04)"}`,
            }}
          >
            <span className="text-[9px] text-zinc-600 font-semibold uppercase tracking-wider mb-1.5">Dólar</span>
            {loading || usdbrl === null ? (
              <span className="text-sm font-bold text-zinc-600 animate-pulse">—</span>
            ) : (
              <span className="text-sm font-bold text-zinc-100">R$ {usdbrl.toFixed(3)}</span>
            )}
            {!loading && usdDayChangePct !== null && (
              <span className={`text-[9px] font-semibold mt-1 ${isUsdUp ? "text-emerald-400" : "text-red-400"}`}>
                {isUsdUp ? "+" : ""}{usdDayChangePct.toFixed(2)}%
              </span>
            )}
          </Link>
        </div>

        {/* ── Navigation Groups ── */}
        <div className="w-full flex flex-col gap-3 animate-fade-in animate-delay-2">
          {NAV_GROUPS.map(group => (
            <AccordionGroup key={group.id} group={group} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 flex items-center gap-4 w-full animate-fade-in animate-delay-2">
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, #2d2f3a)" }} />
          <span className="text-[9px] text-zinc-700 font-medium tracking-widest uppercase">
            v1.0 · Personal
          </span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, #2d2f3a, transparent)" }} />
        </div>
      </div>
    </div>
  );
}
