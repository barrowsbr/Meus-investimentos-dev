"use client";

// Seção "Sobre o Sistema" — história do projeto, stack, motores de cálculo,
// módulos, integrações e notas de segurança.
//
// ⚠️ Esta seção é DOCUMENTAÇÃO VIVA: quando o projeto mudar, ela muda junto.
// Auditada em 30/08/2026 contra components/terminal/nav.ts (módulos),
// lib/api-registry.ts (integrações) e lib/ibkr-flex-sync.ts (dedup).

import { Shield, FileText, ExternalLink, GitBranch } from "lucide-react";
import { openEmbed } from "@/lib/embed-link";

// ── História: as 4 gerações do projeto (links preservados) ──────────────────
const HISTORIA = [
  {
    geracao: "1ª",
    nome: "Planilha Google Sheets",
    desc: "O começo de tudo: uma planilha com as transações e fórmulas. Ainda hoje a `gdados` é o banco de dados do app.",
    url: "https://docs.google.com/spreadsheets/d/1ecLN5y1E2_sdJjM5ohH7bSh4WOVMi_eB/edit?gid=1688292719#gid=1688292719",
    cta: "Abrir planilha original",
    cor: "#34a853",
  },
  {
    geracao: "2ª",
    nome: "Looker Studio (Data Studio)",
    desc: "Primeira camada visual: dashboards ligados na planilha, sem código.",
    url: "https://datastudio.google.com/reporting/d02ace64-0871-413f-bfb3-7d5f987afc01/page/p_ybi4rwmtmd",
    cta: "Abrir relatório",
    cor: "#4285f4",
  },
  {
    geracao: "3ª",
    nome: "Streamlit (V1)",
    desc: "Primeiro app de verdade, em Python — cálculo próprio em vez de fórmula de planilha.",
    url: "https://meus-investimentos-eeplqkozbtfcs8vzjsweqs.streamlit.app",
    cta: "Abrir V1",
    embed: true,
    cor: "#ff4b4b",
  },
  {
    geracao: "4ª",
    nome: "Este app — Next.js na Vercel",
    desc: "Motor canônico em TypeScript, ~50 rotas de API, TWR/MWR (GIPS), motor fiscal e integração direta com a corretora.",
    atual: true,
    cor: "#E8A33D",
  },
];

export default function SobreSection() {
  return (
    <div className="space-y-5">
      {/* ── História do projeto ── */}
      <div>
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
          <GitBranch size={11} /> História do projeto
        </h3>
        <div className="space-y-1.5">
          {HISTORIA.map((h) => (
            <div
              key={h.geracao}
              className="rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5"
              style={{
                background: h.atual ? "rgba(232,163,61,0.07)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${h.atual ? "rgba(232,163,61,0.22)" : "rgba(255,255,255,0.06)"}`,
                borderLeft: `3px solid ${h.cor}`,
              }}
            >
              <span className="font-mono text-[10px] font-bold shrink-0" style={{ color: h.cor }}>{h.geracao}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-200">
                  {h.nome}
                  {h.atual && (
                    <span className="ml-2 rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(52,211,153,0.14)", color: "#34d399" }}>você está aqui</span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{h.desc}</p>
              </div>
              {h.url && (
                h.embed ? (
                  <button
                    type="button"
                    onClick={() => openEmbed(h.url!, "Meus Investimentos · V1", "versão anterior (Streamlit)")}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-zinc-300 transition-colors hover:bg-white/10"
                    style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    {h.cta} <ExternalLink size={9} />
                  </button>
                ) : (
                  <a
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-zinc-300 no-underline transition-colors hover:bg-white/10"
                    style={{ border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    {h.cta} <ExternalLink size={9} />
                  </a>
                )
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stack técnica */}
      <div>
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Stack Técnica</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Framework", value: "Next.js 14 (App Router)" },
            { label: "Estilo", value: "Tailwind CSS 3 · 6 temas" },
            { label: "Gráficos", value: "Recharts + lightweight-charts" },
            { label: "Dados", value: "Google Sheets (gdados)" },
            { label: "Deploy", value: "Vercel (auto-deploy da main)" },
            { label: "IA", value: "Cascata Gemini → OpenAI → DeepSeek → Groq → xAI" },
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
            {[
              { t: "Performance TWR/MWR", d: "Modified Dietz (GIPS) sobre a golden source, com o spot de hoje como perna provisória — o número se move durante o pregão." },
              { t: "TWR oficial da IBKR", d: "Calculado do NAV diário da própria corretora (aportes fora do retorno) — a mesma conta do PortfolioAnalyst. A Performance mostra a divergência para o nosso motor." },
              { t: "Câmbio & PM Dólar", d: "PM real das remessas (não PTAX). USD, EUR, CAD, GBP. PTAX multi-moeda via BCB." },
              { t: "Impostos (IR)", d: "DARF mensal com isenção, compensação de prejuízo, day-trade vs. swing. PTAX multi-moeda para ativos no exterior." },
              { t: "ETF Look-Through", d: "Composição de ETFs em cascata (FMP, Alpha Vantage, Yahoo), com bucket \"Outros\" preservado para não sumir patrimônio." },
              { t: "O Acerto (finanças)", d: "Contas do mês = fixas + fatura (consumo do mês anterior). Separa meu gasto de parcelas e assinaturas; sobra vira poupança incremental." },
            ].map(m => (
              <div key={m.t} className="rounded-lg bg-zinc-800/30 border border-zinc-700/40 px-3 py-2.5">
                <p className="text-[11px] text-zinc-300 font-semibold">{m.t}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{m.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Módulos / Páginas — espelha components/terminal/nav.ts */}
      <div>
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Módulos</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
          {[
            { group: "Investimentos", items: ["Home", "Resumo", "Renda variável", "Renda fixa", "Proventos", "Agenda", "Criptoativos", "Opções", "ETFs", "ETF Cem", "Bens"] },
            { group: "Análise & Corretora", items: ["Performance (TWR/MWR)", "Radar (globo 3D + macro)", "Notícias & Previsões", "Evolução patrimonial", "Câmbio & remessas", "Simulações", "Trades", "IBKR (extrato Flex)", "Caixa & Margem", "Impostos", "Agente IA"] },
            { group: "Finanças & Baú", items: ["Finanças (O Acerto)", "Fluxos de caixa", "Moedas (coleção)", "Precificador", "Anotações", "NASA", "Expressões", "Morse"] },
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

      {/* Integrações — o catálogo vivo é lib/api-registry.ts (card "APIs & Integrações") */}
      <div>
        <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">Integrações</h3>
        <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">
          <strong className="text-zinc-300">47 serviços externos</strong> registrados em 9 categorias (mercado, câmbio &amp; juros,
          corretora, planilha, IA, notícias, predições, geo, alertas). O card <strong className="text-zinc-400">APIs &amp; Integrações</strong> testa
          cada um ao vivo e mostra o estado da chave.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Google Sheets", desc: "Leitura + escrita com backup" },
            { label: "Yahoo / brapi", desc: "Cotações e histórico" },
            { label: "IBKR Flex", desc: "Trades, proventos, NAV e marks" },
            { label: "Banco Central", desc: "PTAX, SGS e Focus" },
            { label: "FMP / AlphaVantage", desc: "Holdings de ETFs" },
            { label: "Polymarket / Kalshi", desc: "Mercados preditivos" },
            { label: "GDELT / NASA / USGS", desc: "Eventos no globo" },
            { label: "Telegram", desc: "Alertas e resumo do dia" },
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
          <p>Leitura via API Key. Escrita/sync requer Service Account com permissão de Editor na planilha. Toda escrita faz backup automático da aba, e o backup diário exporta os CSVs para <strong className="text-zinc-400">fora</strong> da planilha.</p>
        </div>
        <div className="flex items-start gap-2">
          <FileText size={13} className="text-zinc-400 mt-0.5 flex-shrink-0" />
          <p>
            Importações idempotentes: o guardião contra duplicata é a <strong className="text-zinc-400">assinatura</strong> do
            lançamento (ticker + tipo + quantidade + preço), não a data — assim uma linha apagada por engano pode voltar. O cron
            do IBKR tem trava de volume (máx. 40 linhas novas por rodada). A golden source recusa qualquer escrita que apague ou
            altere um valor já validado. Modo demo (login test/test) escala valores ×15 sem expor números reais.
          </p>
        </div>
      </div>
    </div>
  );
}
