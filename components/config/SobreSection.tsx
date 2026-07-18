"use client";

// Extraído de app/configuracoes/page.tsx — seção "Sobre o Sistema"
// (stack, motores de cálculo, módulos, integrações e notas de segurança).

import { Shield, FileText } from "lucide-react";

export default function SobreSection() {
  return (
          <div className="space-y-5">
            {/* Stack técnica */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Stack Técnica</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Framework", value: "Next.js 14 (App Router)" },
                  { label: "Estilo", value: "Tailwind CSS 3" },
                  { label: "Gráficos", value: "Recharts + lightweight-charts" },
                  { label: "Dados", value: "Google Sheets API" },
                  { label: "Deploy", value: "Vercel (auto-deploy)" },
                  { label: "IA", value: "Gemini / GPT-4o / DeepSeek" },
                  { label: "3D Globe", value: "React Three Fiber" },
                  { label: "Mapas", value: "react-simple-maps" },
                ].map(s => (
                  <div key={s.label} className="rounded-lg bg-zinc-800/40 px-3 py-2">
                    <p className="text-[10px] text-zinc-600 uppercase">{s.label}</p>
                    <p className="text-xs text-zinc-300">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Motores de cálculo */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Motores de Cálculo</h3>
              <div className="space-y-2">
                <div className="rounded-lg bg-blue-500/8 border border-blue-500/15 px-4 py-3">
                  <p className="text-xs text-blue-300 font-semibold mb-1">Portfólio (fonte única)</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    TypeScript é o <strong className="text-zinc-300">único motor</strong>. Patrimônio, investido (FIFO), lucro, proventos e câmbio vivem em{" "}
                    <code className="bg-zinc-800 px-1 rounded text-zinc-300">calcularSnapshot</code>.
                    Python serve apenas preditivo/ML e agente IA.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">Performance TWR/MWR</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Modified Dietz (GIPS) com base de cotações golden source. Decompõe preço vs. dividendos.</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">Câmbio & PM Dólar</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">PM real das remessas (não PTAX). Suporta USD, EUR, CAD, GBP. PTAX multi-moeda via BCB.</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">Impostos (IR)</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Apuração DARF mensal com isenção, compensação de prejuízo, day-trade vs. swing. PTAX multi-moeda para ativos no exterior.</p>
                  </div>
                  <div className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                    <p className="text-[11px] text-zinc-300 font-semibold">ETF Look-Through</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">Abertura de composição de ETFs com fontes em cascata (FMP, Alpha Vantage, Yahoo). Bucket {'"'}Outros · diversificação{'"'} para cobertura honesta.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Módulos / Páginas */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Módulos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
                {[
                  { group: "Portfólio", items: ["Resumo geral", "Renda variável", "Renda fixa (manual)", "Proventos & dividendos", "Criptoativos", "Opções"] },
                  { group: "Análise", items: ["Performance (TWR/MWR)", "Setores & composição", "Evolução patrimonial", "Câmbio & remessas", "Simulações (Monte Carlo)", "Trades & operações", "ETFs (look-through + mapa)", "Radar de mercado (globo 3D)"] },
                  { group: "Gestão & Mais", items: ["Impostos (DARF + DIRPF)", "Alavancagem & margem", "Finanças pessoais", "Fluxos de caixa", "Inteligência (notícias + Reddit)", "Preditivos (Polymarket, Kalshi)", "Agente IA (multi-LLM)", "5 temas visuais"] },
                ].map(g => (
                  <div key={g.group}>
                    <p className="text-zinc-400 font-semibold mb-1">{g.group}</p>
                    <ul className="space-y-0.5">
                      {g.items.map(item => (
                        <li key={item} className="text-zinc-500 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {/* Integrações & API */}
            <div>
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Integrações</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "Google Sheets", desc: "Leitura + escrita com backup" },
                  { label: "Yahoo Finance", desc: "Cotações e histórico" },
                  { label: "Banco Central", desc: "PTAX multi-moeda (BCB)" },
                  { label: "IBKR", desc: "Flex API + CSV (sync diário)" },
                  { label: "B3", desc: "Import CSV idempotente" },
                  { label: "FMP / AlphaVantage", desc: "Holdings de ETFs" },
                  { label: "Polymarket / Kalshi", desc: "Mercados preditivos" },
                  { label: "Reddit", desc: "Inteligência de mercado" },
                  { label: "Vercel Cron", desc: "Cotações 20h · IBKR 6h (BRT)" },
                ].map(s => (
                  <div key={s.label} className="rounded-lg bg-zinc-800/40 px-3 py-2">
                    <p className="text-[10px] text-zinc-600 uppercase">{s.label}</p>
                    <p className="text-[11px] text-zinc-500">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notas de segurança */}
            <div className="space-y-2 text-xs text-zinc-500 leading-relaxed">
              <div className="flex items-start gap-2">
                <Shield size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                <p>Leitura via API Key. Escrita/sync requer Service Account com permissão de Editora na planilha. Toda escrita faz backup automático da aba.</p>
              </div>
              <div className="flex items-start gap-2">
                <FileText size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
                <p>Importações idempotentes — sem risco de duplicatas. O sync diário do IBKR (6h BRT) é <strong className="text-zinc-400">append-only</strong>: só grava o que tem data posterior ao último dado, nunca apaga nem reescreve. Modo demo (login test/test) escala valores ×15 sem expor números reais.</p>
              </div>
            </div>
          </div>
  );
}
