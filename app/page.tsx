"use client";

import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart2,
  Landmark,
  Coins,
  Bitcoin,
  ArrowLeftRight,
  Receipt,
  Activity,
  Wallet,
  Settings,
  ArrowRight,
} from "lucide-react";

const sections = [
  {
    href: "/resumo",
    label: "Resumo",
    description: "Patrimônio total, alocação e posições",
    icon: LayoutDashboard,
    color: "#d4a574",
    gradient: "linear-gradient(135deg, #d4a574 0%, #f5c842 100%)",
    ready: true,
  },
  {
    href: "/performance",
    label: "Performance",
    description: "TWR, retorno acumulado e benchmarks",
    icon: TrendingUp,
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
    ready: true,
  },
  {
    href: "/renda-variavel",
    label: "Renda Variável",
    description: "Ações, ETFs, FIIs e BDRs",
    icon: BarChart2,
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
    ready: true,
  },
  {
    href: "/renda-fixa",
    label: "Renda Fixa",
    description: "CDBs, Tesouro Direto e posições abertas",
    icon: Landmark,
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #c084fc 100%)",
    ready: true,
  },
  {
    href: "/proventos",
    label: "Proventos",
    description: "Dividendos, JCP e rendimentos recebidos",
    icon: Coins,
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)",
    ready: true,
  },
  {
    href: "/criptoativos",
    label: "Criptoativos",
    description: "Bitcoin, Ethereum e ativos digitais",
    icon: Bitcoin,
    color: "#f97316",
    gradient: "linear-gradient(135deg, #f97316 0%, #fbbf24 100%)",
    ready: false,
  },
  {
    href: "/cambio",
    label: "Câmbio",
    description: "Operações de câmbio e VET médio",
    icon: ArrowLeftRight,
    color: "#10b981",
    gradient: "linear-gradient(135deg, #10b981 0%, #4ade80 100%)",
    ready: true,
  },
  {
    href: "/impostos",
    label: "Impostos",
    description: "DARFs, declaração IR e isenções",
    icon: Receipt,
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    ready: false,
  },
  {
    href: "/evolucao",
    label: "Evolução",
    description: "Histórico patrimonial e projeções",
    icon: Activity,
    color: "#60a5fa",
    gradient: "linear-gradient(135deg, #60a5fa 0%, #818cf8 100%)",
    ready: false,
  },
  {
    href: "/financas",
    label: "Fin. Pessoais",
    description: "Receitas, despesas e controle financeiro",
    icon: Wallet,
    color: "#ec4899",
    gradient: "linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)",
    ready: true,
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    description: "Preferências e integrações",
    icon: Settings,
    color: "#71717a",
    gradient: "linear-gradient(135deg, #71717a 0%, #a1a1aa 100%)",
    ready: false,
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen">
      {/* Background video with transparency */}
      <div className="fixed inset-0 overflow-hidden z-0 pointer-events-none">
        <video
          autoPlay
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: 0.12,
            filter: "blur(1px)",
          }}
        >
          <source src="/midias/video2.mp4" type="video/mp4" />
        </video>
        {/* Overlay gradient for better text readability */}
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 50%, rgba(13,14,17,0) 0%, rgba(13,14,17,0.8) 100%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl">
        {/* Hero */}
        <div className="mb-12 animate-fade-in">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image
              src="/midias/carregamento.png"
              alt="Meus Investimentos"
              width={120}
              height={120}
              className="h-20 w-auto"
              priority
            />
          </div>

          <div
            className="inline-flex items-center gap-2 text-[11px] px-3 py-1 rounded-full font-medium mb-6"
            style={{
              background: "rgba(74,222,128,0.08)",
              color: "#4ade80",
              border: "1px solid rgba(74,222,128,0.2)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
            Sistema operacional
          </div>

          <h1
            className="text-4xl md:text-5xl font-bold mb-4 leading-tight"
            style={{
              background: "linear-gradient(135deg, #f4f4f5 0%, #a1a1aa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Olá, Lucas
          </h1>
          <p className="text-zinc-500 text-base md:text-lg max-w-lg leading-relaxed">
            Seu painel de controle financeiro pessoal. Todas as suas informações de
            investimento em um só lugar.
          </p>
        </div>

        {/* Sections grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 animate-fade-in animate-delay-1">
          {sections.map(({ href, label, description, icon: Icon, color, gradient, ready }) => (
            <Link key={href} href={href} className="group block">
              <div
                className="rounded-2xl p-px transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${color}40 0%, ${color}12 50%, ${color}28 100%)`,
                  boxShadow: `0 2px 16px ${color}10`,
                }}
              >
                <div
                  className="rounded-[calc(1rem-1px)] p-4 h-full flex flex-col gap-3 backdrop-blur-md"
                  style={{ background: "rgba(19,20,26,0.92)" }}
                >
                  {/* Icon + status */}
                  <div className="flex items-start justify-between">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${color}14`, color }}
                    >
                      <Icon size={17} strokeWidth={1.7} />
                    </div>
                    {!ready && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide"
                        style={{
                          background: "rgba(113,113,122,0.12)",
                          color: "#71717a",
                          border: "1px solid rgba(113,113,122,0.2)",
                        }}
                      >
                        Em breve
                      </span>
                    )}
                    {ready && (
                      <ArrowRight
                        size={13}
                        className="text-zinc-700 group-hover:text-zinc-400 transition-colors mt-1"
                      />
                    )}
                  </div>

                  {/* Text */}
                  <div>
                    <p className="text-sm font-semibold text-zinc-200 mb-0.5">{label}</p>
                    <p className="text-[11px] text-zinc-600 leading-relaxed">{description}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 flex items-center gap-3 animate-fade-in animate-delay-2">
          <div
            className="h-px flex-1"
            style={{ background: "linear-gradient(90deg, #1E2028, transparent)" }}
          />
          <span className="text-[11px] text-zinc-700 font-medium tracking-wider uppercase">
            Dashboard Pessoal · v1.0
          </span>
          <div
            className="h-px flex-1"
            style={{ background: "linear-gradient(90deg, transparent, #1E2028)" }}
          />
        </div>
      </div>
    </div >
  );
}
