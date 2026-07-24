"use client";

// Página de Configurações — orquestra os cards (as seções vivem em
// components/config/*, extraídas deste arquivo).

import { useState, useEffect } from "react";
import {
  Lock, Upload, XCircle, FileText, RefreshCw, Shield, Info,
  Database, Palette, ShieldCheck, Bell, Activity, History, Zap, Search, Newspaper, Gamepad2,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useTheme } from "@/components/terminal";
import PlanilhaCard from "@/components/config/PlanilhaCard";
import NoticiasPerfilCard from "@/components/config/NoticiasPerfilCard";
import { SectionCard, type CardChip } from "@/components/config/SectionCard";
import PasswordSection from "@/components/config/PasswordSection";
import AlertasSection from "@/components/config/AlertasSection";
import FlexSyncSection from "@/components/config/FlexSyncSection";
import ImportSection from "@/components/config/ImportSection";
import GoldenSourceSection from "@/components/config/GoldenSourceSection";
import TickerAuditSection from "@/components/config/TickerAuditSection";
import NumistaSection from "@/components/config/NumistaSection";
import ThemeSection from "@/components/config/ThemeSection";
import InicioSection from "@/components/config/InicioSection";
import AutomacoesSection from "@/components/config/AutomacoesSection";
import HistoricoSection from "@/components/config/HistoricoSection";
import ApiHealthSection from "@/components/config/ApiHealthSection";
import SobreSection from "@/components/config/SobreSection";

// ── Página — cards agrupados por domínio, com navegação e busca ──────────────
// Redesign UI/UX: NADA foi removido — os mesmos 12 cards de sempre, agora
// organizados em 5 grupos com cabeçalho, pills de navegação fixas no topo e
// busca por título/palavra-chave (estilo Settings de iOS/Android).

interface CardDef { id: string; grupo: string; title: string; desc: string; icon: React.ReactNode; keywords: string; el: React.ReactNode }

// Estado agregado dos cards (1 chamada — /api/config/resumo) → chips no cabeçalho.
interface ResumoConfig {
  alertas: { ativo: boolean; chatOk: boolean; resumoAtivo: boolean } | null;
  automacoes: { ativas: number; total: number; porChave: Record<string, boolean> } | null;
  historico: { ativo: boolean } | null;
  planilha: { abas: number } | null;
  senha: { senhaSet: boolean; loginEnabled: boolean } | null;
  apis: { total: number } | null;
}
interface GrupoDef { id: string; label: string; desc: string; icon: React.ReactNode; cor: string }

const GRUPOS: GrupoDef[] = [
  { id: "aparencia", label: "Aparência", desc: "Tema, HoloGlobo, privacidade e ajustes da Home", icon: <Palette size={14} />, cor: "#E8A33D" },
  { id: "dados", label: "Dados & Planilha", desc: "Editor da gdados, base de cotações e histórico patrimonial", icon: <Database size={14} />, cor: "#3FB950" },
  { id: "sync", label: "Importação & Sync", desc: "IBKR, B3 e verificação de tickers", icon: <RefreshCw size={14} />, cor: "#38BDF8" },
  { id: "automacoes", label: "Automações & Alertas", desc: "Crons, GitHub Actions e Telegram", icon: <Zap size={14} />, cor: "#A78BFA" },
  { id: "sistema", label: "Segurança & Sistema", desc: "Senha de acesso, diagnóstico de APIs e sobre", icon: <Shield size={14} />, cor: "#F0504A" },
];

const normaliza = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function ConfiguracoesPage() {
  const [grupo, setGrupo] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [resumo, setResumo] = useState<ResumoConfig | null>(null);
  const { theme } = useTheme();

  // Deep-link: /configuracoes#dados abre direto no grupo.
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (GRUPOS.some((g) => g.id === h)) setGrupo(h);
  }, []);
  const irPara = (id: string) => {
    setGrupo(id);
    try { history.replaceState(null, "", id === "todos" ? "#" : `#${id}`); } catch { /* ignore */ }
  };

  // Estado dos cards em 1 chamada (best-effort — sem chips enquanto carrega).
  useEffect(() => {
    fetch("/api/config/resumo").then((r) => r.json()).then(setResumo).catch(() => {});
  }, []);

  const chips = (id: string): CardChip[] => {
    if (!resumo) return [];
    switch (id) {
      case "preferencias":
        return [{ label: `tema ${theme}`, tone: "muted" }];
      case "senha": {
        const s = resumo.senha; if (!s) return [];
        if (!s.loginEnabled) return [{ label: "login OFF", tone: "off" }];
        return s.senhaSet ? [{ label: "protegido", tone: "ok" }] : [{ label: "sem senha", tone: "warn" }];
      }
      case "alertas": {
        const a = resumo.alertas; if (!a) return [];
        const out: CardChip[] = [a.ativo ? { label: "ON", tone: "ok" } : { label: "OFF", tone: "off" }];
        if (a.ativo && !a.chatOk) out.push({ label: "sem chat_id", tone: "warn" });
        return out;
      }
      case "automacoes": {
        const a = resumo.automacoes; if (!a) return [];
        return [{ label: `${a.ativas}/${a.total} ativas`, tone: a.ativas === a.total ? "ok" : "warn" }];
      }
      case "historico": {
        const h = resumo.historico; if (!h) return [];
        return h.ativo ? [{ label: "gravando 3×/dia", tone: "ok" }] : [{ label: "desligado", tone: "off" }];
      }
      case "cotacoes": {
        const on = resumo.automacoes?.porChave?.["cron_cotacoes"];
        return on == null ? [] : on ? [{ label: "cron 20h ON", tone: "ok" }] : [{ label: "cron OFF", tone: "off" }];
      }
      case "flexsync": {
        const on = resumo.automacoes?.porChave?.["cron_ibkr"];
        return on == null ? [] : on ? [{ label: "sync 6h ON", tone: "ok" }] : [{ label: "sync OFF", tone: "off" }];
      }
      case "planilha":
        return resumo.planilha ? [{ label: `${resumo.planilha.abas} abas`, tone: "muted" }] : [];
      case "apis":
        return resumo.apis ? [{ label: `${resumo.apis.total} registradas`, tone: "muted" }] : [];
      default:
        return [];
    }
  };

  const cards: CardDef[] = [
    { id: "preferencias", grupo: "aparencia", title: "Preferências do Sistema", desc: "Tema visual, HoloGlobo, privacidade da Home e termômetro de pregões", icon: <Palette size={16} />, keywords: "tema dark light matrix cores hologlobo globo privacidade olho pregoes termometro home fonte", el: <ThemeSection /> },
    { id: "noticias", grupo: "aparencia", title: "Notícias — Perfil de interesses", desc: "Temas que o feed \"Para você\" prioriza e filtro de briga política", icon: <Newspaper size={16} />, keywords: "noticias interesses macro geopolitica tecnologia ciencia cripto briga politica feed personalizado", el: <NoticiasPerfilCard /> },
    { id: "inicio", grupo: "aparencia", title: "Tela inicial (Game Select)", desc: "Hub pós-login estilo cartucho de Game Boy — 4 botões sobre fundo 3D", icon: <Gamepad2 size={16} />, keywords: "tela inicial inicio hub game select cartucho game boy pos login pagina abertura categorias fundo 3d profundidade", el: <InicioSection /> },
    { id: "planilha", grupo: "dados", title: "Planilha (gdados) — Editor", desc: "Editar abas sem abrir o Google · saúde dos dados · backup CSV e restauração", icon: <FileText size={16} />, keywords: "editor abas linhas editar apagar buscar csv backup restaurar saude teste compactar twr", el: <PlanilhaCard /> },
    { id: "cotacoes", grupo: "dados", title: "Base de Cotações (Golden Source)", desc: "db_cotacoes — preços de fechamento que alimentam a Performance/TWR", icon: <Database size={16} />, keywords: "db_cotacoes precos golden source yahoo atualizar fechamento auditoria", el: <GoldenSourceSection /> },
    { id: "historico", grupo: "dados", title: "Histórico patrimonial (GitHub Action)", desc: "Série da página Patrimônio — gravada 3×/dia em dias úteis", icon: <History size={16} />, keywords: "patrimonio evolucao serie 3x dia registrar workflow", el: <HistoricoSection /> },
    { id: "importar", grupo: "sync", title: "Importar Dados (IBKR / B3)", desc: "Upload de CSV das corretoras — importação idempotente, sem duplicatas", icon: <Upload size={16} />, keywords: "importar csv arquivo corretora b3 ibkr trades proventos upload", el: <ImportSection /> },
    { id: "flexsync", grupo: "sync", title: "Sincronizar IBKR (API · sem arquivo)", desc: "Flex Web Service — trades, proventos e câmbio direto da IBKR", icon: <RefreshCw size={16} />, keywords: "flex web service token sync trades proventos automatico", el: <FlexSyncSection /> },
    { id: "tickers", grupo: "sync", title: "Tickers × Yahoo (Verificador)", desc: "Valida a grafia dos símbolos contra o Yahoo e unifica variações", icon: <ShieldCheck size={16} />, keywords: "ticker grafia sufixo .sa validar unificar simbolo", el: <TickerAuditSection /> },
    { id: "numista", grupo: "sync", title: "Exportar coleção para o Numista", desc: "Dry-run de casamento com o catálogo, envio (repetidas para troca) e desfazer", icon: <Upload size={16} />, keywords: "numista moedas colecao exportar troca swap catalogo km enviar desfazer", el: <NumistaSection /> },
    { id: "automacoes", grupo: "automacoes", title: "Automações (Cron & GitHub Actions)", desc: "Tudo que roda sozinho — com liga/desliga individual", icon: <Zap size={16} />, keywords: "cron vercel github actions ligar desligar backup cotacoes ibkr relatorio", el: <AutomacoesSection /> },
    { id: "alertas", grupo: "automacoes", title: "Alertas (Telegram)", desc: "DARF, DIRPF, alavancagem e o resumo do dia em imagem", icon: <Bell size={16} />, keywords: "telegram bot darf dirpf alavancagem resumo do dia chat_id notificacao", el: <AlertasSection /> },
    { id: "senha", grupo: "sistema", title: "Segurança — Senha de Acesso", desc: "Senha do app e quais páginas exigem login", icon: <Lock size={16} />, keywords: "senha password login protecao paginas bloquear", el: <PasswordSection /> },
    { id: "apis", grupo: "sistema", title: "APIs & Integrações (Diagnóstico)", desc: "Catálogo de todas as APIs externas, com teste de saúde por serviço", icon: <Activity size={16} />, keywords: "api health teste probe chave env yahoo bcb gemini telegram diagnostico", el: <ApiHealthSection /> },
    { id: "sobre", grupo: "sistema", title: "Sobre o Sistema", desc: "Stack, motores de cálculo, módulos e integrações", icon: <Info size={16} />, keywords: "stack versao motores modulos integracoes seguranca", el: <SobreSection /> },
  ];

  const q = normaliza(busca.trim());
  const filtrados = q
    ? cards.filter((c) => normaliza(c.title).includes(q) || normaliza(c.keywords).includes(q))
    : grupo === "todos" ? cards : cards.filter((c) => c.grupo === grupo);

  const gruposVisiveis = GRUPOS.filter((g) => filtrados.some((c) => c.grupo === g.id));

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Aparência, dados, sincronização, automações e segurança — tudo num lugar só."
      />

      <div className="max-w-4xl">
        {/* Barra fixa: busca + navegação por grupo */}
        <div className="sticky top-0 z-30 -mt-2 mb-4 py-3 space-y-2.5" style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter: "blur(8px)" }}>
          <div className="relative max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar configuração… (ex.: tema, backup, telegram, senha)"
              className="w-full bg-zinc-900/80 border border-zinc-700/80 rounded-xl pl-9 pr-8 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
            />
            {busca && (
              <button onClick={() => setBusca("")} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                <XCircle size={14} />
              </button>
            )}
          </div>

          {!q && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              <button
                onClick={() => irPara("todos")}
                className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
                style={grupo === "todos"
                  ? { background: "var(--text)", color: "var(--bg)" }
                  : { border: "1px solid var(--line-strong)", color: "var(--muted)" }}
              >
                Tudo
              </button>
              {GRUPOS.map((g) => {
                const ativo = grupo === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => irPara(g.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors"
                    style={ativo
                      ? { background: `${g.cor}1f`, border: `1px solid ${g.cor}80`, color: g.cor }
                      : { border: "1px solid var(--line-strong)", color: "var(--muted)" }}
                  >
                    {g.icon} {g.label}
                    <span className="font-mono opacity-60">{cards.filter((c) => c.grupo === g.id).length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {q && (
          <p className="mb-3 text-xs font-mono text-zinc-500">
            {filtrados.length === 0 ? "Nada encontrado — tente outra palavra" : `${filtrados.length} resultado(s) para “${busca.trim()}”`}
          </p>
        )}

        {gruposVisiveis.map((g) => (
          <section key={g.id} className="mb-6">
            {/* Cabeçalho do grupo */}
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="grid place-items-center rounded-lg" style={{ width: 28, height: 28, background: `${g.cor}14`, border: `1px solid ${g.cor}40`, color: g.cor }}>
                {g.icon}
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: g.cor }}>{g.label}</p>
                <p className="text-[11px] text-zinc-600">{g.desc}</p>
              </div>
            </div>
            {filtrados.filter((c) => c.grupo === g.id).map((c) => (
              <SectionCard key={c.id} id={c.id} title={c.title} desc={c.desc} icon={c.icon} chips={chips(c.id)}>
                {c.el}
              </SectionCard>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
