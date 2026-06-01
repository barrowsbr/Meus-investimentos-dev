export function brl(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export function usd(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export function currency(value: unknown, moeda: string = "BRL"): string {
  return moeda === "USD" ? usd(value) : brl(value);
}

export function compactBRL(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return brl(value);
}

export function pct(value: number, decimals = 1): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const s = String(value).trim();
  let v: number;
  if (s.includes(",") && !s.includes(".")) {
    v = parseFloat(s.replace(",", "."));
  } else if (s.includes(",") && s.includes(".")) {
    v = parseFloat(s.replace(/\./g, "").replace(",", "."));
  } else {
    v = parseFloat(s);
  }
  return isNaN(v) ? null : v;
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  const s = String(value);
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return s;
}

export function shortMonth(dateStr: string): string {
  const meses = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  const match = String(dateStr).match(/^(\d{4})-(\d{2})/);
  if (!match) return String(dateStr);
  const monthIdx = parseInt(match[2], 10) - 1;
  return `${meses[monthIdx]}/${match[1].slice(2)}`;
}
