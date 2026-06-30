import {
  Home, LayoutDashboard, TrendingUp, BarChart2, Landmark, Coins,
  Bitcoin, ArrowLeftRight, Receipt, Activity, Wallet, Settings, Bot,
  Scale, Crosshair, Sunrise, Layers,
  Radar, ArrowUpDown, ArrowDownUp, Gauge, FlaskConical, Building2,
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
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

// Ordem e rótulos conforme README §8 do handoff Barroots Terminal.
export const NAV: NavGroup[] = [
  { items: [{ href: "/", label: "Home", icon: Home, sub: "Visão do dia", mobileShow: true }] },
  {
    label: "Portfólio",
    items: [
      { href: "/resumo", label: "Resumo", icon: LayoutDashboard, sub: "Visão geral dos seus investimentos", mobileShow: true },
      { href: "/renda-variavel", label: "Renda Variável", icon: BarChart2, sub: "Ações, ETFs, BDRs e FIIs" },
      { href: "/renda-fixa", label: "Renda Fixa", icon: Landmark, sub: "Tesouro, CDBs, LCI/LCA e debêntures" },
      { href: "/proventos", label: "Proventos", icon: Coins, sub: "Dividendos, JCP e rendimentos" },
      { href: "/criptoativos", label: "Criptoativos", icon: Bitcoin, sub: "Bitcoin e demais criptoativos" },
      { href: "/opcoes", label: "Opções", icon: Crosshair, sub: "Posições em opções e estruturas" },
    ],
  },
  {
    label: "Análise",
    items: [
      { href: "/hoje", label: "Hoje", icon: Sunrise, sub: "O que está acontecendo hoje e de onde vem o resultado" },
      { href: "/performance", label: "Performance", icon: TrendingUp, sub: "Retorno (TWR), atribuição e risco", mobileShow: true },
      { href: "/evolucao", label: "Evolução", icon: Activity, sub: "Evolução patrimonial e aportes" },
      { href: "/cambio", label: "Câmbio", icon: ArrowLeftRight, sub: "Remessas, pares e PTAX" },
      { href: "/simulacoes", label: "Simulações", icon: FlaskConical, sub: "Projeções e cenários de carteira" },
      { href: "/trades", label: "Trades", icon: ArrowUpDown, sub: "Histórico de operações e desempenho" },
      { href: "/etf", label: "ETFs", icon: Layers, sub: "Composição, look-through e alocação" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { href: "/impostos", label: "Impostos", icon: Receipt, sub: "Apuração de IR, DARFs e eventos" },
      { href: "/caixa", label: "Caixa & Margem", icon: Scale, sub: "Liquidez (caixa) e margem — automático via IBKR" },
      { href: "/financas", label: "Finanças", icon: Wallet, sub: "Contas, cartões e fluxo pessoal" },
      { href: "/fluxos", label: "Fluxos", icon: ArrowDownUp, sub: "Entradas, saídas e movimentações" },
    ],
  },
  {
    label: "Mais",
    items: [
      { href: "/radar", label: "Radar", icon: Radar, sub: "Mapa-múndi geoeconômico: índices, moedas e países", mobileShow: true },
      { href: "/ibkr", label: "IBKR", icon: Building2, sub: "Visão gerencial da conta Interactive Brokers (via Flex)" },
      { href: "/polymarket", label: "Preditivos", icon: Gauge, sub: "Mercados preditivos relacionados à carteira" },
      { href: "/agente-ia", label: "Agente IA", icon: Bot, sub: "Assistente de carteira" },
      { href: "/configuracoes", label: "Configurações", icon: Settings, sub: "Preferências, dados e sincronização", mobileShow: true },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

export const MOBILE_ITEMS = ALL_ITEMS.filter((i) => i.mobileShow);

/** Resolve a rota atual (pathname) para o item de nav correspondente. */
export function navItemForPath(pathname: string): NavItem | undefined {
  if (pathname === "/") return ALL_ITEMS[0];
  // match mais longo primeiro (ex.: /performance-avancada → /performance)
  const candidates = ALL_ITEMS.filter((i) => i.href !== "/" && pathname.startsWith(i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  );
  return candidates[0];
}
