"use client";
import Link from "next/link";
import { usePortfolioSummary } from "@/lib/hooks";

const sections = [
  { href: "/portfolio",   icon: "◈", label: "Investimentos",   desc: "Posições, P&L e patrimônio" },
  { href: "/finance",     icon: "◆", label: "Finanças",        desc: "Entradas, saídas e cartões" },
  { href: "/performance", icon: "▲", label: "Performance",     desc: "TWR, NAV e histórico" },
  { href: "/news",        icon: "◉", label: "Notícias",        desc: "Mercado e portfólio" },
  { href: "/agent",       icon: "◎", label: "Agente IA",       desc: "Chat com Gemini" },
];

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

export default function Home() {
  const { data: summary } = usePortfolioSummary();

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="pt-8 pb-4">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-50">Command Center</h1>
        <p className="text-slate-400 mt-1">Dashboard de investimentos pessoais</p>
      </div>

      {/* Patrimônio quick metrics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Patrimônio Total", value: fmt(summary.patrimonio_total) },
            { label: "Renda Variável",   value: fmt(summary.rv_total) },
            { label: "Renda Fixa",       value: fmt(summary.rf_total) },
            {
              label: "P&L Hoje",
              value: `${summary.day_pnl_r >= 0 ? "+" : ""}${fmt(summary.day_pnl_r)}`,
              color: summary.day_pnl_r >= 0 ? "text-emerald-400" : "text-red-400",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#0f1729]/80 backdrop-blur border border-white/[0.07] rounded-xl p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-xl font-bold ${color ?? "text-slate-50"}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Navegação */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map(({ href, icon, label, desc }) => (
          <Link
            key={href}
            href={href}
            className="group bg-[#0f1729]/60 backdrop-blur border border-white/[0.07] rounded-2xl p-6
                       hover:bg-[#0f1729]/90 hover:border-indigo-500/30 transition-all duration-300
                       hover:shadow-[0_8px_32px_-8px_rgba(99,102,241,0.2)]"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-2xl text-indigo-400">{icon}</span>
                <h2 className="text-lg font-semibold text-slate-100 mt-2">{label}</h2>
                <p className="text-sm text-slate-400 mt-1">{desc}</p>
              </div>
              <span className="text-slate-600 group-hover:text-slate-300 group-hover:translate-x-1 transition-all">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
