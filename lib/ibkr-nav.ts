// TWR OFICIAL da conta IBKR, calculado do NAV DIÁRIO da própria corretora
// (seção "Equity Summary in Base by Report Date" do Flex) + fluxos externos
// (depósitos/retiradas). É a MESMA conta do PortfolioAnalyst:
//   r_t = nav_t / (nav_{t-1} + fluxo_t) − 1   (fluxo entra no início do dia)
//   TWR = Π(1 + r_t) − 1
// Nada é reconstruído por preço — só número da própria IBKR, então o gráfico
// bate com o da corretora por construção. Módulo PURO client-safe (testado).

export interface NavPonto {
  date: string;  // YYYY-MM-DD
  nav: number;   // NAV em moeda base (US$)
  fluxo: number; // depósitos(+) / retiradas(−) do dia, em moeda base
}

export interface TwrNavPonto { date: string; twr: number; nav: number }

export interface TwrNavResult {
  pontos: TwrNavPonto[];
  twrTotal: number;
  twrAnualizado: number;
  mensal: Array<{ mes: string; ret: number }>; // YYYY-MM → retorno do mês
  primeiraData: string;
  ultimaData: string;
  navInicial: number;
  navFinal: number;
  fluxoTotal: number;
}

/** Junta a série persistida (planilha) com a do Flex — Flex vence na
 *  interseção (mais fresco), dedup por data, ordenado. */
export function mesclarNav(planilha: NavPonto[], flex: NavPonto[]): NavPonto[] {
  const porData = new Map<string, NavPonto>();
  for (const p of planilha) if (p.date && p.nav > 0) porData.set(p.date, p);
  for (const p of flex) if (p.date && p.nav > 0) porData.set(p.date, p);
  return [...porData.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Anexa os fluxos externos à série de NAV (por data; fluxo em dia sem NAV é
 *  atribuído ao PRÓXIMO dia com NAV — o depósito só aparece no saldo lá). */
export function anexarFluxos(
  nav: Array<{ date: string; nav: number }>,
  fluxos: Array<{ date: string; valor: number }>,
): NavPonto[] {
  const pontos: NavPonto[] = nav.map((n) => ({ date: n.date, nav: n.nav, fluxo: 0 }));
  if (!pontos.length) return pontos;
  const ordenados = [...fluxos].sort((a, b) => a.date.localeCompare(b.date));
  for (const f of ordenados) {
    // primeiro ponto com date >= f.date (busca binária simples)
    let lo = 0, hi = pontos.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pontos[mid].date >= f.date) { idx = mid; hi = mid - 1; } else lo = mid + 1;
    }
    if (idx >= 0) pontos[idx].fluxo += f.valor;
    // fluxo depois do último NAV: ainda não refletiu no saldo — fica fora.
  }
  return pontos;
}

export interface AparaInicio {
  pontos: NavPonto[];
  cortados: number;      // pregões removidos do início
  dataInicio: string | null; // primeiro pregão mantido
}

/** Apara o "período de teste" do INÍCIO da série: pregões iniciais em que o
 *  NAV era irrisório (< fração do NAV máximo da série) — tipicamente o teste
 *  de câmbio/depósito simbólico de abertura da conta, cujo retorno sobre base
 *  minúscula polui a curva inteira (o mesmo defeito do PortfolioAnalyst).
 *  Corta APENAS o prefixo — depois que o capital real entra, nada é removido. */
export function apararInicioIrrisorio(pontos: NavPonto[], fracMinima = 0.01): AparaInicio {
  if (pontos.length === 0) return { pontos, cortados: 0, dataInicio: null };
  const navMax = Math.max(...pontos.map((p) => p.nav));
  const limiar = navMax * fracMinima;
  let i = 0;
  while (i < pontos.length && pontos[i].nav < limiar) i++;
  // Nunca corta a série inteira (se tudo é "irrisório", não há o que aparar).
  if (i >= pontos.length) return { pontos, cortados: 0, dataInicio: pontos[0].date };
  const mantidos = pontos.slice(i);
  return { pontos: mantidos, cortados: i, dataInicio: mantidos[0].date };
}

export function calcularTwrNav(pontos: NavPonto[]): TwrNavResult {
  const validos = pontos.filter((p) => p.nav > 0);
  const VAZIO: TwrNavResult = {
    pontos: [], twrTotal: 0, twrAnualizado: 0, mensal: [],
    primeiraData: "", ultimaData: "", navInicial: 0, navFinal: 0, fluxoTotal: 0,
  };
  if (validos.length < 2) return VAZIO;

  const serie: TwrNavPonto[] = [{ date: validos[0].date, twr: 0, nav: validos[0].nav }];
  const mensalMap = new Map<string, number>(); // mes → fator acumulado
  let acumulado = 1;
  let fluxoTotal = validos[0].fluxo;

  for (let i = 1; i < validos.length; i++) {
    const prev = validos[i - 1];
    const cur = validos[i];
    const base = prev.nav + cur.fluxo;
    const r = base > 0 ? cur.nav / base - 1 : 0;
    acumulado *= 1 + r;
    fluxoTotal += cur.fluxo;
    serie.push({ date: cur.date, twr: acumulado - 1, nav: cur.nav });

    const mes = cur.date.slice(0, 7);
    mensalMap.set(mes, (mensalMap.get(mes) ?? 1) * (1 + r));
  }

  const primeira = validos[0].date;
  const ultima = validos[validos.length - 1].date;
  const anos = Math.max(
    (Date.parse(ultima + "T12:00:00Z") - Date.parse(primeira + "T12:00:00Z")) / (365.25 * 86400000),
    1 / 365.25,
  );
  const twrTotal = acumulado - 1;

  return {
    pontos: serie,
    twrTotal,
    twrAnualizado: anos >= 0.5 ? Math.pow(acumulado, 1 / anos) - 1 : twrTotal,
    mensal: [...mensalMap.entries()].map(([mes, f]) => ({ mes, ret: f - 1 })).sort((a, b) => a.mes.localeCompare(b.mes)),
    primeiraData: primeira,
    ultimaData: ultima,
    navInicial: validos[0].nav,
    navFinal: validos[validos.length - 1].nav,
    fluxoTotal,
  };
}
