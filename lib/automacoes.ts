// Registro central das AUTOMAÇÕES do projeto (Vercel Cron, GitHub Actions e
// rotinas do app) com liga/desliga. Fonte única para o card "Automações" em
// Configurações. Regras:
//
// - Toggles PRÓPRIOS vivem no escopo `automacoes` da aba app_config
//   (lib/app-config — a antiga `automacoes_config` vale como fallback de
//   leitura até a primeira gravação).
// - Toggles que JÁ EXISTEM em outros stores são proxy (fonte única preservada):
//   alertas/digest → lib/alertas-store; histórico patrimonial → lib/historico-store.
// - Desligar NÃO remove o agendamento (cron da Vercel/Action continua
//   disparando) — o ENDPOINT é quem pula quando desligado.

import { lerEscopo, gravarEscopo } from "./app-config";

export type AutomacaoTipo = "vercel" | "github" | "app";

export interface AutomacaoDef {
  chave: string;
  nome: string;
  descricao: string;
  agenda: string;
  tipo: AutomacaoTipo;
  link?: string; // workflow no GitHub, quando houver
}

const GH_WF = "https://github.com/barrowsbr/meus-investimentos-dev/actions/workflows";

export const AUTOMACOES: AutomacaoDef[] = [
  {
    chave: "cron_cotacoes", tipo: "vercel", agenda: "dias úteis · 20h BRT",
    nome: "Cotações — golden source",
    descricao: "Atualiza a db_cotacoes com o fechamento do dia (preços, câmbio e índices). É a base da Performance/TWR.",
  },
  {
    chave: "cron_ibkr", tipo: "vercel", agenda: "diário · 6h BRT",
    nome: "Sync IBKR Flex",
    descricao: "Importa trades e proventos da IBKR via Flex Web Service (dedup + backup — rodar de novo não duplica).",
  },
  {
    chave: "alertas", tipo: "vercel", agenda: "diário · 6h30 BRT",
    nome: "Alertas Telegram (chave geral)",
    descricao: "DARF, DIRPF e alavancagem no Telegram. Mesma chave geral do card Alertas — os sub-alertas continuam lá.",
  },
  {
    chave: "digest", tipo: "vercel", agenda: "diário · horários no card Alertas",
    nome: "Resumo do dia (imagem)",
    descricao: "Envia o resumo do dia em imagem no Telegram. Mesmo interruptor do card Alertas (\"Enviar resumo do dia\").",
  },
  {
    chave: "gh_historico", tipo: "github", agenda: "dias úteis · 10h/14h/18h BRT", link: `${GH_WF}/historico.yml`,
    nome: "Histórico patrimonial (3×/dia)",
    descricao: "Grava o patrimônio total na série historico_patrimonio (página Patrimônio). Mesmo interruptor do card Histórico.",
  },
  {
    chave: "gh_daily_report", tipo: "github", agenda: "dias úteis · 12h/18h BRT", link: `${GH_WF}/daily-report.yml`,
    nome: "Relatório diário por e-mail (V1 · legado)",
    descricao: "Action antiga do dashboard V1: envia relatório por e-mail (Gmail). Independente do app atual.",
  },
  {
    chave: "gh_backup", tipo: "github", agenda: "diário · 6h30 BRT", link: `${GH_WF}/backup.yml`,
    nome: "Backup diário da planilha (CSVs)",
    descricao: "Exporta todas as abas como CSV e sobrescreve os arquivos na branch `backups` do repositório — cópia FORA da planilha.",
  },
];

// ── Toggles próprios (escopo `automacoes` da app_config) ─────────────────────

const CHAVES_PROPRIAS = new Set(["cron_cotacoes", "cron_ibkr", "gh_daily_report", "gh_backup"]);

async function readProprias(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  try {
    for (const [k, v] of await lerEscopo("automacoes")) {
      map.set(k, v !== "false"); // default LIGADO
    }
  } catch { /* aba ainda não existe → tudo ligado */ }
  return map;
}

/** Gate para os endpoints de cron/rotina — default LIGADO em qualquer falha
 *  de leitura (uma indisponibilidade da planilha não pode parar as rotinas). */
export async function isAutomacaoAtiva(chave: string): Promise<boolean> {
  try {
    const map = await readProprias();
    return map.get(chave) !== false;
  } catch { return true; }
}

async function writePropria(chave: string, ativo: boolean): Promise<void> {
  const map = await readProprias();
  map.set(chave, ativo);
  await gravarEscopo("automacoes", [...map.entries()].map(([k, v]) => [k, v ? "true" : "false"]));
}

// ── Estado agregado (próprios + proxies) e escrita roteada ───────────────────

export async function readAutomacoes(): Promise<Array<AutomacaoDef & { ativo: boolean }>> {
  const [proprias, alertasCfg, histCfg] = await Promise.all([
    readProprias(),
    import("./alertas-store").then((m) => m.readAlertasConfig()).catch(() => null),
    import("./historico-store").then((m) => m.readHistoricoConfig()).catch(() => null),
  ]);
  return AUTOMACOES.map((a) => {
    let ativo = true;
    if (CHAVES_PROPRIAS.has(a.chave)) ativo = proprias.get(a.chave) !== false;
    else if (a.chave === "alertas") ativo = alertasCfg?.ativo !== false;
    else if (a.chave === "digest") ativo = alertasCfg?.resumoAtivo !== false;
    else if (a.chave === "gh_historico") ativo = histCfg?.ativo !== false;
    return { ...a, ativo };
  });
}

export async function setAutomacao(chave: string, ativo: boolean): Promise<void> {
  if (CHAVES_PROPRIAS.has(chave)) return writePropria(chave, ativo);
  if (chave === "alertas" || chave === "digest") {
    const store = await import("./alertas-store");
    const cfg = await store.readAlertasConfig();
    await store.writeAlertasConfig(chave === "alertas" ? { ...cfg, ativo } : { ...cfg, resumoAtivo: ativo });
    return;
  }
  if (chave === "gh_historico") {
    const store = await import("./historico-store");
    await store.writeHistoricoConfig({ ativo });
    return;
  }
  throw new Error(`Automação desconhecida: ${chave}`);
}
