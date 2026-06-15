"use client";

const HOTKEYS: [string, string][] = [
  ["F2", "FILTRAR"],
  ["F3", "EXPORTAR"],
  ["/", "BUSCAR"],
  ["⌘K", "COMANDOS"],
];

export default function StatusBar() {
  return (
    <div
      className="flex items-center gap-3 md:gap-[18px] px-4 shrink-0 overflow-hidden"
      style={{ height: 28, borderTop: "1px solid var(--line-strong)", background: "var(--rail)" }}
    >
      {HOTKEYS.map(([k, l]) => (
        <span key={k} className="flex items-center gap-1.5 font-mono shrink-0" style={{ fontSize: 9.5 }}>
          <span style={{ padding: "1px 5px", border: "1px solid var(--line)", color: "var(--accent)", fontWeight: 600 }}>{k}</span>
          <span className="hidden sm:inline" style={{ color: "var(--muted)", letterSpacing: ".06em" }}>{l}</span>
        </span>
      ))}
      <div className="flex-1" />
      <span
        className="font-mono whitespace-nowrap truncate"
        style={{ fontSize: 9.5, color: "var(--faint)", letterSpacing: ".08em" }}
      >
        ● CONECTADO · FONTE db_cotacoes
      </span>
    </div>
  );
}
