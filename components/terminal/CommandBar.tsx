"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTerminal, type Periodo, type Moeda } from "./TerminalProvider";

const PERIODOS: Periodo[] = ["1D", "1S", "1M", "YTD", "12M", "Máx"];
const MOEDAS: Moeda[] = ["BRL", "USD"];

interface Props {
  title: string;
  onMenu?: () => void;
}

export default function CommandBar({ title, onMenu }: Props) {
  const { theme, setTheme, filters, setFilter } = useTerminal();
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date()
          .toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
          .replace(".", ""),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const cyclePeriodo = () =>
    setFilter("periodo", PERIODOS[(PERIODOS.indexOf(filters.periodo) + 1) % PERIODOS.length]);
  const toggleMoeda = () =>
    setFilter("moeda", MOEDAS[(MOEDAS.indexOf(filters.moeda) + 1) % MOEDAS.length]);

  return (
    <div
      className="flex items-center gap-3 md:gap-4 px-3 md:px-[18px] shrink-0"
      style={{ height: 46, borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
    >
      {/* Hamburger (mobile) */}
      <button
        onClick={onMenu}
        aria-label="Abrir navegação"
        className="min-[1100px]:hidden grid place-items-center"
        style={{ width: 30, height: 30, border: "1px solid var(--line)", color: "var(--muted)" }}
      >
        <Menu size={16} />
      </button>

      <span
        className="font-mono shrink-0"
        style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".16em", color: "var(--text)", textTransform: "uppercase" }}
      >
        {title}
      </span>

      {/* Barra de comando: filtros globais persistentes */}
      <div
        className="hidden sm:flex flex-1 items-center gap-2.5 px-3 font-mono"
        style={{ height: 30, border: "1px solid var(--line)", background: "var(--input)", maxWidth: 520, fontSize: 11.5 }}
      >
        <span style={{ color: "var(--accent)" }}>&gt;</span>
        <FilterChip k="período" v={filters.periodo} onClick={cyclePeriodo} />
        <FilterChip k="moeda" v={filters.moeda} onClick={toggleMoeda} />
        <FilterChip k="conta" v={filters.conta} />
        <span className="t-blink" style={{ width: 6, height: 13, background: "var(--accent)" }} />
      </div>

      <div className="flex-1 sm:hidden" />

      {/* Seletor de tema */}
      <div className="flex gap-[3px] p-[3px]" style={{ border: "1px solid var(--line)", background: "var(--input)" }}>
        {(["ambar", "grafite"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTheme(k)}
            className="font-mono"
            style={{
              padding: "4px 10px",
              fontSize: 10.5,
              fontWeight: 600,
              background: theme === k ? "var(--accent-wash)" : "transparent",
              color: theme === k ? "var(--accent)" : "var(--muted)",
            }}
          >
            {k === "ambar" ? "Âmbar" : "Grafite"}
          </button>
        ))}
      </div>

      {/* Relógio AO VIVO */}
      <span className="hidden md:flex items-center gap-1.5 font-mono shrink-0" style={{ fontSize: 10.5, color: "var(--muted)" }}>
        <span className="t-blink rounded-full" style={{ width: 6, height: 6, background: "var(--pos)" }} />
        {now || "—"}
      </span>
    </div>
  );
}

function FilterChip({ k, v, onClick }: { k: string; v: string; onClick?: () => void }) {
  const content = (
    <>
      <span style={{ color: "var(--muted)" }}>{k}:</span>
      <span style={{ color: "var(--accent)", fontWeight: 600 }}>{v}</span>
    </>
  );
  if (!onClick) return <span className="whitespace-nowrap">{content}</span>;
  return (
    <button onClick={onClick} className="whitespace-nowrap hover:opacity-80" style={{ font: "inherit" }} title={`Alternar ${k}`}>
      {content}
    </button>
  );
}
