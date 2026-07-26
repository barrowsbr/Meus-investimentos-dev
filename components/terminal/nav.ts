import {
  Home, LayoutDashboard, TrendingUp, BarChart2, Landmark, Coins,
  Bitcoin, ArrowLeftRight, Receipt, Activity, Wallet, Settings, Bot,
  Scale, Crosshair, Layers,
  Radar, ArrowUpDown, ArrowDownUp, FlaskConical, Building2, StickyNote,
  Rocket, Newspaper, Medal, Crown, Gamepad2, CalendarDays, Boxes, LayoutGrid, Smile,
} from "lucide-react";
import type { ComponentType } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IconType = ComponentType<any>;

export interface NavItem {
  href: string;
  label: string;
  icon: IconType;
  sub?: string;
  mobileShow?: boolean;
}

// ── Espaços (categorias) ─────────────────────────────────────────────────────
// A navegação é por ESPAÇO: ao entrar numa categoria (pela tela inicial /inicio),
// a sidebar mostra SÓ as páginas daquele espaço. O 1º item de cada espaço é a
// "home" dele. Configurações é página única (fora dos espaços).
export interface Space {
  id: "investimentos" | "financas" | "barroots";
  label: string;
  icon: IconType;
  home: string;
  items: NavItem[];
}

export const INICIO_HREF = "/inicio";

export const CONFIG_ITEM: NavItem = {
  href: "/configuracoes", label: "Configurações", icon: Settings,
  sub: "Preferências, dados e sincronização", mobileShow: true,
};

export const SPACES: Space[] = [
  {
    id: "investimentos", label: "Investimentos", icon: TrendingUp, home: "/",
    items: [
      { href: "/", label: "Home", icon: Home, sub: "Visão do dia", mobileShow: true },
      { href: "/resumo", label: "Resumo", icon: LayoutDashboard, sub: "Visão geral dos investimentos" },
      { href: "/renda-variavel", label: "Renda Variável", icon: BarChart2, sub: "Ações, ETFs, BDRs e FIIs" },
      { href: "/renda-fixa", label: "Renda Fixa", icon: Landmark, sub: "Tesouro, CDBs, LCI/LCA e debêntures" },
      { href: "/proventos", label: "Proventos", icon: Coins, sub: "Dividendos, JCP e rendimentos" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, sub: "Calendário de proventos — datas-ex, pagamentos e anúncios" },
      { href: "/criptoativos", label: "Criptoativos", icon: Bitcoin, sub: "Bitcoin e demais criptoativos" },
      { href: "/opcoes", label: "Opções", icon: Crosshair, sub: "Posições em opções e estruturas" },
      { href: "/performance", label: "Performance", icon: TrendingUp, sub: "Retorno (TWR), atribuição e risco", mobileShow: true },
      { href: "/radar", label: "Radar", icon: Radar, sub: "Mapa-múndi geoeconômico: índices, moedas e países", mobileShow: true },
      { href: "/noticias", label: "Notícias & Previsões", icon: Newspaper, sub: "Jornal do mercado + trabalho + mercados preditivos" },
      { href: "/evolucao", label: "Evolução", icon: Activity, sub: "Evolução patrimonial e aportes" },
      { href: "/cambio", label: "Câmbio", icon: ArrowLeftRight, sub: "Remessas, pares e PTAX" },
      { href: "/simulacoes", label: "Simulações", icon: FlaskConical, sub: "Cenários de compra/venda e rebalanceamento" },
      { href: "/trades", label: "Trades", icon: ArrowUpDown, sub: "Histórico de operações e desempenho" },
      { href: "/etf", label: "ETFs", icon: Layers, sub: "Composição, look-through e alocação" },
      { href: "/etf-cem", label: "ETF Cem", icon: Crown, sub: "As 100 maiores do mundo (via VOO)" },
      { href: "/impostos", label: "Impostos", icon: Receipt, sub: "Apuração de IR, DARFs e eventos" },
      { href: "/caixa", label: "Caixa & Margem", icon: Scale, sub: "Liquidez (caixa) e margem — automático via IBKR" },
      { href: "/ibkr", label: "IBKR", icon: Building2, sub: "Visão gerencial da conta Interactive Brokers (via Flex)" },
      { href: "/agente-ia", label: "Agente IA", icon: Bot, sub: "Assistente de carteira" },
    ],
  },
  {
    id: "financas", label: "Finanças", icon: Wallet, home: "/financas",
    items: [
      { href: "/financas", label: "Finanças", icon: Wallet, sub: "Contas, cartões e fluxo pessoal", mobileShow: true },
      { href: "/fluxos", label: "Fluxos", icon: ArrowDownUp, sub: "Entradas, saídas e movimentações", mobileShow: true },
    ],
  },
  {
    id: "barroots", label: "Baú", icon: Boxes, home: "/barroots",
    items: [
      { href: "/barroots", label: "Baú", icon: Boxes, sub: "O baú — coleções, observatório e diversão", mobileShow: true },
      { href: "/moedas", label: "Moedas", icon: Medal, sub: "Coleção numismática — fotos, valores e mapa", mobileShow: true },
      { href: "/nasa", label: "NASA", icon: Rocket, sub: "Observatório — APOD, asteroides, Terra (EPIC) e Marte", mobileShow: true },
      { href: "/expressoes", label: "Expressões", icon: Smile, sub: "Reconhecimento facial ao vivo — 100% no aparelho" },
      { href: "/anotacoes", label: "Anotações", icon: StickyNote, sub: "Comentários e lembretes — permanentes na planilha" },
      { href: "/gameboy", label: "Game Boy", icon: Gamepad2, sub: "Fliperama — emuladores embutidos" },
    ],
  },
];

// Ícone do atalho de volta à tela inicial (hub de categorias).
export const INICIO_ICON: IconType = LayoutGrid;

// Lista achatada de todos os itens (para resolução de rota).
const ALL_ITEMS: NavItem[] = [...SPACES.flatMap((s) => s.items), CONFIG_ITEM];

/** Espaço ativo para a rota atual. null = Configurações (página única). */
export function spaceForPath(pathname: string): Space | null {
  if (pathname === "/configuracoes" || pathname.startsWith("/configuracoes/")) return null;
  let best: { space: Space; len: number } | null = null;
  for (const s of SPACES) {
    for (const it of s.items) {
      const m = it.href === "/" ? pathname === "/" : pathname === it.href || pathname.startsWith(it.href + "/");
      if (m && (!best || it.href.length > best.len)) best = { space: s, len: it.href.length };
    }
  }
  return best ? best.space : SPACES[0]; // fallback: Investimentos
}

/** Resolve a rota atual para o item de nav correspondente (título da página). */
export function navItemForPath(pathname: string): NavItem | undefined {
  if (pathname === "/") return SPACES[0].items[0];
  const candidates = ALL_ITEMS.filter((i) => i.href !== "/" && pathname.startsWith(i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  );
  return candidates[0];
}

// Compat: itens marcados para a barra mobile.
export const MOBILE_ITEMS: NavItem[] = ALL_ITEMS.filter((i) => i.mobileShow);

// Barra mobile do MODO ANTIGO (espaços desligado): o conjunto clássico.
const byHref = (href: string): NavItem => ALL_ITEMS.find((i) => i.href === href)!;
export const LEGACY_MOBILE: NavItem[] = [
  byHref("/"), byHref("/resumo"), byHref("/performance"), byHref("/radar"), CONFIG_ITEM,
];
