// MWR (Money-Weighted Return / TIR) — série diária da carteira e a régua certa
// para compará-la: o MESMO benchmark submetido aos MESMOS fluxos.
//
// Por que este arquivo existe (defeito real que ele corrige): o gráfico
// comparava a linha MWR da carteira com benchmarks TWR (CDI/IBOV acumulado
// buy-and-hold). São medidas de naturezas diferentes — o MWR embute o tamanho
// e o momento de cada aporte, o TWR expurga exatamente isso. Uma carteira pode
// "ganhar do CDI" no MWR só porque aportou antes de uma alta, sem que isso
// diga nada sobre a comparação. A régua honesta é a TIR que o benchmark teria
// produzido com os mesmos fluxos (mesma data, mesmo valor) — é o que
// `mwrBenchmarkDiario` calcula.

export interface PontoFluxo {
  date: string;
  /** Patrimônio no fim do dia. */
  nav: number;
  /** Fluxo do investidor no dia (aporte > 0, resgate < 0). */
  flow: number;
  /** Proventos recebidos em dinheiro (saem da carteira para o investidor). */
  income: number;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const anosDesde = (base: number, date: string) =>
  (new Date(date + "T12:00:00Z").getTime() - base) / MS_PER_YEAR;

// ── MWR diário acumulado (estilo IBKR PortfolioAnalyst) ──────────────────────
// Para cada dia t resolve o XIRR dos fluxos do investidor até t — NAV inicial
// e aportes líquidos (flow − income) como saídas, NAV_t como entrada — e
// converte a taxa anualizada em retorno ACUMULADO do período: (1+r)^anos − 1.
// Mesma convenção do MWR total do twr-engine (fluxos após o dia-âncora; o NAV
// do dia 0 já embute os fluxos desse dia). Warm-start na taxa do dia anterior
// mantém o Newton em poucas iterações por ponto.
export function calcularMWRDiario(points: PontoFluxo[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  if (points.length === 0) return out;

  const baseMs = new Date(points[0].date + "T12:00:00Z").getTime();
  const cf: Array<[number, number]> = [];
  if (points[0].nav > 0) cf.push([0, -points[0].nav]);
  out.set(points[0].date, 0);

  let warm = 0.05;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const t = anosDesde(baseMs, p.date);
    const netFlow = p.flow - p.income;
    if (t > 0 && Math.abs(netFlow) > 0.01) cf.push([t, -netFlow]);
    if (p.nav <= 0 || t <= 0) {
      out.set(p.date, null);
      continue;
    }

    const navT = p.nav;
    const npv = (r: number): number => {
      if (r <= -0.999) return Infinity;
      let s = navT / Math.pow(1 + r, t);
      for (const [tt, amt] of cf) s += amt / Math.pow(1 + r, tt);
      return s;
    };
    const npvDeriv = (r: number): number => {
      let s = -t * navT / Math.pow(1 + r, t + 1);
      for (const [tt, amt] of cf) s -= tt * amt / Math.pow(1 + r, tt + 1);
      return s;
    };

    let r = warm;
    let ok = false;
    for (const guess of [warm, 0.05, 0, 0.3, -0.3]) {
      r = guess;
      for (let k = 0; k < 80; k++) {
        const f = npv(r);
        const df = npvDeriv(r);
        if (!isFinite(f) || !isFinite(df) || Math.abs(df) < 1e-14) break;
        let step = f / df;
        if (Math.abs(step) > 1.0) step = Math.sign(step);
        const rNew = Math.max(-0.999, Math.min(100, r - step));
        if (Math.abs(rNew - r) < 1e-9) { r = rNew; ok = true; break; }
        r = rNew;
      }
      if (ok && Math.abs(npv(r)) < Math.max(1, navT) * 1e-6) break;
      ok = false;
    }

    if (ok && isFinite(r)) {
      warm = r;
      out.set(p.date, Math.pow(1 + r, t) - 1);
    } else {
      out.set(p.date, null);
    }
  }
  return out;
}

// ── Carteira hipotética: os SEUS fluxos aplicados no benchmark ───────────────
// `benchTwr` é o retorno ACUMULADO normalizado do benchmark por data (o mesmo
// que alimenta a linha tracejada do gráfico). O nível do índice é 1 + retorno.
//
// Compra-se "cotas" do benchmark a cada fluxo: cotas += fluxoLíquido / nível.
// O NAV simulado no dia é cotas × nível. Dia sem cotação do benchmark repete o
// último nível conhecido (feriado/pregão sem dado não deve criar fluxo fantasma).
//
// Devolve null quando o benchmark não cobre o início da janela — sem nível no
// dia-âncora não existe comparação honesta, e inventar um base 1 distorceria
// todos os fluxos seguintes.
export function navSimuladoBenchmark(
  points: PontoFluxo[],
  benchTwr: ReadonlyMap<string, number | null>,
): PontoFluxo[] | null {
  if (points.length === 0) return null;

  const nivelDe = (date: string, anterior: number | null): number | null => {
    const v = benchTwr.get(date);
    if (v == null || !isFinite(v)) return anterior;
    const n = 1 + v;
    return n > 0 ? n : anterior;
  };

  let nivel = nivelDe(points[0].date, null);
  if (nivel == null) return null;

  const nav0 = Math.max(0, points[0].nav);
  let cotas = nav0 / nivel;
  const out: PontoFluxo[] = [{ ...points[0], nav: cotas * nivel }];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    nivel = nivelDe(p.date, nivel)!;
    const netFlow = p.flow - p.income;
    if (Math.abs(netFlow) > 0.01) cotas += netFlow / nivel;
    out.push({ ...p, nav: cotas * nivel });
  }
  return out;
}

/**
 * TIR que o benchmark teria produzido com os MESMOS fluxos, dia a dia,
 * acumulada — diretamente comparável à série MWR da carteira.
 */
export function mwrBenchmarkDiario(
  points: PontoFluxo[],
  benchTwr: ReadonlyMap<string, number | null>,
): Map<string, number | null> {
  const simulado = navSimuladoBenchmark(points, benchTwr);
  if (!simulado) return new Map();
  return calcularMWRDiario(simulado);
}
