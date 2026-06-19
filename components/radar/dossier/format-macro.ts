// Formatação dos indicadores macro (World Bank) para o dossiê.
export function formatMacro(value: number | null, format: "pct" | "usd" | "num" | "ratio"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (format) {
    case "pct":
      return `${value.toFixed(1)}%`;
    case "ratio":
      return value.toFixed(2);
    case "usd":
    case "num": {
      const abs = Math.abs(value);
      const prefix = format === "usd" ? "US$ " : "";
      if (abs >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)} tri`;
      if (abs >= 1e9) return `${prefix}${(value / 1e9).toFixed(1)} bi`;
      if (abs >= 1e6) return `${prefix}${(value / 1e6).toFixed(1)} mi`;
      if (abs >= 1e3) return `${prefix}${(value / 1e3).toFixed(1)} mil`;
      return `${prefix}${value.toFixed(0)}`;
    }
    default:
      return String(value);
  }
}
