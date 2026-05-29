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
  Newspaper,
  Bot,
  ListOrdered,
  Zap,
} from "lucide-react";

const sections = [
  {
    href: "/resumo",
    label: "Resumo",
    description: "Patrimônio total, alocação e posições",
    icon: LayoutDashboard,
    color: "#d4a574",
  },
  {
    href: "/performance",
    label: "Performance",
    description: "TWR, retorno acumulado e benchmarks",
    icon: TrendingUp,
    color: "#3b82f6",
  },
  {
    href: "/performance-avancada",
    label: "Perf. Avançada",
    description: "Sharpe, Sortino, drawdown e atribuição",
    icon: Zap,
    color: "#a78bfa",
  },
  {
    href: "/renda-variavel",
    label: "Renda Variável",
    description: "Ações, ETFs, FIIs e BDRs",
    icon: BarChart2,
    color: "#06b6d4",
  },
  {
    href: "/renda-fixa",
    label: "Renda Fixa",
    description: "CDBs, Tesouro Direto e posições abertas",
    icon: Landmark,
    color: "#8b5cf6",
  },
  {
    href: "/proventos",
    label: "Proventos",
    description: "Dividendos, JCP e rendimentos recebidos",
    icon: Coins,
    color: "#f59e0b",
  },
  {
    href: "/criptoativos",
    label: "Criptoativos",
    description: "Bitcoin, Ethereum e ativos digitais",
    icon: Bitcoin,
    color: "#f97316",
  },
  {
    href: "/cambio",
    label: "Câmbio",
    description: "Operações de câmbio e VET médio",
    icon: ArrowLeftRight,
    color: "#10b981",
  },
  {
    href: "/impostos",
    label: "Impostos",
    description: "FIFO, DARFs e isenção mensal",
    icon: Receipt,
    color: "#6366f1",
  },
  {
    href: "/evolucao",
    label: "Evolução",
    description: "Histórico patrimonial ao longo do tempo",
    icon: Activity,
    color: "#60a5fa",
  },
  {
    href: "/financas",
    label: "Fin. Pessoais",
    description: "Receitas, despesas e controle financeiro",
    icon: Wallet,
    color: "#ec4899",
  },
  {
    href: "/fluxos",
    label: "Fluxos",
    description: "Registro auditável de entradas e saídas",
    icon: ListOrdered,
    color: "#a78bfa",
  },
  {
    href: "/noticias",
    label: "Notícias",
    description: "Feed financeiro e mercado em tempo real",
    icon: Newspaper,
    color: "#34d399",
  },
  {
    href: "/agente-ia",
    label: "Agente IA",
    description: "Assistente financeiro com Gemini AI",
    icon: Bot,
    color: "#818cf8",
  },
  {
    href: "/configuracoes",
    label: "Configurações",
    description: "Senha, sincronização e integrações",
    icon: Settings,
    color: "#71717a",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen flex flex-col items-center">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden z-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 40%, rgba(25,26,35,0.6) 0%, rgba(13,14,17,0.95) 100%)",
          }}
        />
      </div>

      {/* Content — centered */}
      <div className="relative z-10 w-full max-w-4xl px-4 py-10 flex flex-col items-center">
        {/* Hero */}
        <div className="text-center mb-14 animate-fade-in pt-20">
          <div className="flex justify-center mb-6">
            <Image
              src="/midias/carregamento.png"
              alt="Meus Investimentos"
              width={144}
              height={144}
              className="h-24 w-auto"
              priority
            />
          </div>

          <h1
            className="text-4xl md:text-5xl font-bold mb-3 leading-tight"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #d4d4d8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Olá, Lucas
          </h1>
          <p className="text-zinc-400 text-base md:text-lg max-w-md mx-auto leading-relaxed">
            Seu painel de controle financeiro pessoal
          </p>
        </div>

        {/* Sections grid — symmetric 3 columns */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full animate-fade-in animate-delay-1">
          {sections.map(({ href, label, description, icon: Icon, color }) => (
            <Link key={href} href={href} className="group block">
              <div
                className="rounded-2xl p-px transition-all duration-250 hover:scale-[1.03]"
                style={{
                  background: `linear-gradient(145deg, ${color}60 0%, ${color}20 50%, ${color}40 100%)`,
                  boxShadow: `0 4px 24px ${color}15, 0 0 1px ${color}30`,
                }}
              >
                <div
                  className="rounded-[calc(1rem-1px)] p-5 flex flex-col gap-3 h-[140px]"
                  style={{ background: "rgba(17,18,24,0.88)" }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{
                        background: `${color}18`,
                        boxShadow: `0 0 12px ${color}20`,
                      }}
                    >
                      <Icon size={18} strokeWidth={1.8} style={{ color }} />
                    </div>
                    <ArrowRight
                      size={14}
                      className="text-zinc-700 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all mt-0.5"
                    />
                  </div>

                  <div className="mt-auto">
                    <p className="text-[13px] font-semibold text-zinc-100 mb-1">{label}</p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">{description}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 flex items-center gap-4 w-full max-w-sm animate-fade-in animate-delay-2">
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, #2d2f3a)" }} />
          <span className="text-[10px] text-zinc-600 font-medium tracking-widest uppercase">
            v1.0 · Personal
          </span>
          <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, #2d2f3a, transparent)" }} />
        </div>
      </div>
    </div>
  );
}
