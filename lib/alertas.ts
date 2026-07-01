// ─────────────────────────────────────────────────────────────────────────────
// Alertas determinísticos (SEM monitorar preço em tempo real): DARF a vencer/
// vencido, prazo da DIRPF e alavancagem acima do limite. Lógica pura — o cron
// (app/api/cron/alertas/route.ts) resolve os inputs reais e envia via Telegram.
// ─────────────────────────────────────────────────────────────────────────────

import type { MesApuracao } from "./tax/apurador";

export interface AlertaTrigger {
  chave: string;         // identifica o alerta p/ throttle (não repetir todo dia)
  texto: string;          // mensagem (Markdown do Telegram)
  throttleDias: number;   // intervalo mínimo entre reenvios do mesmo `chave`
}

function diffDias(a: string, b: string): number {
  const ta = new Date(a + "T00:00:00Z").getTime();
  const tb = new Date(b + "T00:00:00Z").getTime();
  return Math.round((tb - ta) / 86400000);
}

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── DARF ──────────────────────────────────────────────────────────────────────
export function computeDarfAlertas(
  meses: Pick<MesApuracao, "mes" | "irTotal" | "vencimento" | "darfCodigo">[],
  mesAtual: string,
  hoje: string,
): AlertaTrigger[] {
  const out: AlertaTrigger[] = [];
  for (const m of meses) {
    if (m.irTotal <= 0.01 || m.mes === mesAtual) continue; // mês corrente ainda não fechou
    const dias = diffDias(hoje, m.vencimento); // > 0 = vence no futuro
    if (dias >= 0 && dias <= 3) {
      out.push({
        chave: `darf_aviso_${m.mes}`,
        texto: `🟡 *DARF a vencer* — código ${m.darfCodigo}, mês ${m.mes}: *${fmtBRL(m.irTotal)}*, vence ${dias === 0 ? "hoje" : `em ${dias} dia(s)`} (${m.vencimento}).`,
        throttleDias: 1,
      });
    } else if (dias < 0) {
      out.push({
        chave: `darf_vencido_${m.mes}`,
        texto: `🔴 *DARF vencido* — código ${m.darfCodigo}, mês ${m.mes}: *${fmtBRL(m.irTotal)}*, venceu há ${-dias} dia(s) (${m.vencimento}).`,
        throttleDias: 7,
      });
    }
  }
  return out;
}

// ── DIRPF (prazo fixo: 31/05) ─────────────────────────────────────────────────
export function computeDirpfAlerta(hoje: string): AlertaTrigger | null {
  const year = hoje.slice(0, 4);
  const inicio = `${year}-04-01`;
  const prazo = `${year}-05-31`;
  const fimJanela = `${year}-06-30`; // até quando lembrar do atraso

  if (hoje < inicio || hoje > fimJanela) return null;

  if (hoje > prazo) {
    return {
      chave: `dirpf_${year}_atrasado`,
      texto: `🔴 *DIRPF ${year} em atraso* — o prazo era ${prazo} (há ${diffDias(prazo, hoje)} dia(s)). Regularize o quanto antes (multa mínima R$165,74).`,
      throttleDias: 3,
    };
  }

  const diasRestantes = diffDias(hoje, prazo);
  if (diasRestantes <= 7) {
    return {
      chave: `dirpf_${year}_urgente`,
      texto: `🟠 *DIRPF ${year}* — faltam ${diasRestantes} dia(s) para o prazo (${prazo}).`,
      throttleDias: 1,
    };
  }
  return {
    chave: `dirpf_${year}_lembrete`,
    texto: `🟡 *DIRPF ${year}* — prazo em ${prazo} (${diasRestantes} dias). Comece a reunir os dados.`,
    throttleDias: 7,
  };
}

// ── Alavancagem ───────────────────────────────────────────────────────────────
export function computeAlavancagemAlerta(alavancagemPct: number, limitePct: number): AlertaTrigger | null {
  if (limitePct <= 0 || alavancagemPct <= limitePct) return null;
  return {
    chave: "alavancagem_acima_limite",
    texto: `🔴 *Alavancagem acima do limite* — atual ${alavancagemPct.toFixed(1)}%, limite ${limitePct.toFixed(1)}%.`,
    throttleDias: 3,
  };
}

// ── Consolidado ───────────────────────────────────────────────────────────────
export function computeAlertas(input: {
  meses: Pick<MesApuracao, "mes" | "irTotal" | "vencimento" | "darfCodigo">[];
  mesAtual: string;
  hoje: string;
  alavancagemPct: number;
  limiteAlavancagemPct: number;
}): AlertaTrigger[] {
  const out = computeDarfAlertas(input.meses, input.mesAtual, input.hoje);
  const dirpf = computeDirpfAlerta(input.hoje);
  if (dirpf) out.push(dirpf);
  const alav = computeAlavancagemAlerta(input.alavancagemPct, input.limiteAlavancagemPct);
  if (alav) out.push(alav);
  return out;
}

// ── Throttle (não reenviar o mesmo alerta com muita frequência) ──────────────
export function shouldSend(trigger: AlertaTrigger, ultimoEnvio: Record<string, string>, hoje: string): boolean {
  const last = ultimoEnvio[trigger.chave];
  if (!last) return true;
  return diffDias(last, hoje) >= trigger.throttleDias;
}
