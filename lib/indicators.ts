// ─────────────────────────────────────────────────────────────────────────────
// indicators.ts — indicadores técnicos calculados no cliente a partir do OHLC.
// Tudo retorna arrays alinhados com a série de entrada (null até haver dados).
// ─────────────────────────────────────────────────────────────────────────────

export type Series = (number | null)[];

// Média móvel simples (SMA).
export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Média móvel exponencial (EMA), semeada com a SMA do primeiro período.
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      let s = 0;
      for (let j = 0; j < period; j++) s += values[j];
      prev = s / period;
      out[i] = prev;
    } else if (i >= period && prev != null) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// EMA sobre uma série que pode ter nulls no início (para o MACD signal).
function emaNullable(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seen = 0;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    seen++;
    if (seen < period) { seed += v; }
    else if (seen === period) { seed += v; prev = seed / period; out[i] = prev; }
    else if (prev != null) { prev = v * k + prev * (1 - k); out[i] = prev; }
  }
  return out;
}

// Bandas de Bollinger (média + N desvios-padrão).
export function bollinger(values: number[], period = 20, mult = 2): { mid: Series; upper: Series; lower: Series } {
  const mid = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i]!;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - m) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

// Índice de Força Relativa (RSI), método de Wilder.
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(0, ch), l = Math.max(0, -ch);
    if (i <= period) {
      gain += g; loss += l;
      if (i === period) {
        gain /= period; loss /= period;
        out[i] = 100 - 100 / (1 + (loss === 0 ? 100 : gain / loss));
      }
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out[i] = 100 - 100 / (1 + (loss === 0 ? 100 : gain / loss));
    }
  }
  return out;
}

// MACD (linha, sinal e histograma).
export function macd(closes: number[], fast = 12, slow = 26, signalP = 9): { macd: Series; signal: Series; hist: Series } {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line: Series = closes.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i]! - es[i]!) : null));
  const signal = emaNullable(line, signalP);
  const hist: Series = line.map((m, i) => (m != null && signal[i] != null ? m - signal[i]! : null));
  return { macd: line, signal, hist };
}
