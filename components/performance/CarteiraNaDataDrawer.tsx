"use client";

// ─────────────────────────────────────────────────────────────────────────────
// CarteiraNaDataDrawer — painel lateral (bottom-sheet no mobile) que mostra a
// composição EXATA da carteira numa data clicada no gráfico de Performance.
// Os números vêm do próprio motor TWR (via /api/performance/carteira-em, que usa
// calcularTWR com capturePositions) → batem com a linha do gráfico. Aceita 1 ou
// 2 datas: com 2, entra em modo comparação lado a lado.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { brl, compactBRL } from "@/lib/format";

interface Position {
  ticker: string;
  setor: string;
  quantidade: number;
  preco: number;
  moeda: string;
  valorBRL: number;
  gainDiaBRL: number;
  pesoPct: number;
  gainDiaPct: number;
  aoCusto: boolean;
}
interface SetorSlice { setor: string; valorBRL: number; pesoPct: number }
interface Carteira {
  pedida: string;
  encontrada: string | null;
  navTotal?: number;
  navRV?: number;
  navRF?: number;
  positions: Position[];
  setores: SetorSlice[];
}
interface ChartPoint {
  fullDate: string;
  portfolio: number;           // TWR acum %
  cdi: number | null;
  ibov: number | null;
  ret: number | null;          // retorno do dia %
}

interface Props {
  datas: string[];
  classe: string;
  setor: string;
  ticker: string;
  corretora: string;
  chartPoints: ChartPoint[];
  onClose: () => void;
  onRemoveDate: (d: string) => void;
}

const SECTOR_COLORS: Record<string, string> = {
  "Ações Brasil": "#22c55e", "FIIs": "#14b8a6", "BDRs": "#84cc16", "ETF": "#10b981",
  "Ações Internacional": "#60a5fa", "ETF USA": "#818cf8", "Cripto": "#f59e0b",
  "Renda Fixa": "#a78bfa", "Renda Fixa USD": "#c084fc", "Commodities": "#eab308",
};
const sectorColor = (s: string) => SECTOR_COLORS[s] ?? "#71717a";

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function pctStr(v: number | null | undefined, dec = 2): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

export default function CarteiraNaDataDrawer({
  datas, classe, setor, ticker, corretora, chartPoints, onClose, onRemoveDate,
}: Props) {
  const [carteiras, setCarteiras] = useState<Carteira[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Portal só depois de montar (evita mismatch no SSR) — e escapa de qualquer
  // ancestral com transform/filter que "prende" o position:fixed no documento
  // em vez da viewport (era por isso que o painel caía lá pro fim da página).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const open = datas.length > 0;
  const compare = datas.length === 2;
  const key = datas.join(",");

  useEffect(() => {
    if (!open) { setCarteiras([]); setError(null); return; }
    const params = new URLSearchParams({ datas: key });
    if (classe && classe !== "tudo") params.set("classe", classe);
    if (setor) params.set("setor", setor);
    if (ticker) params.set("ticker", ticker);
    if (corretora) params.set("corretora", corretora);
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/performance/carteira-em?${params.toString()}`)
      .then(r => r.json())
      .then(j => {
        if (!alive) return;
        if (j.error) { setError(j.error); setCarteiras([]); }
        else setCarteiras(j.carteiras ?? []);
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Erro"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, classe, setor, ticker, corretora]);

  const pointByDate = useMemo(() => {
    const m = new Map<string, ChartPoint>();
    for (const p of chartPoints) m.set(p.fullDate, p);
    return m;
  }, [chartPoints]);

  if (!open || !mounted) return null;

  const drawer = (
    <>
      {/* Backdrop — escurece e desfoca o gráfico atrás */}
      <div
        className="fixed inset-0 z-[100] backdrop-blur-sm"
        style={{ background: "rgba(0,0,0,0.72)" }}
        onClick={onClose}
      />
      {/* Painel: lateral direita no desktop, bottom-sheet alto no mobile */}
      <div
        className="fixed z-[101] flex flex-col overflow-hidden shadow-2xl
                   inset-x-0 bottom-0 h-[90dvh] rounded-t-2xl
                   md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:h-auto md:rounded-none md:rounded-l-2xl"
        style={{
          background: "var(--surface, #0b0d14)",
          border: "1px solid rgba(255,255,255,0.1)",
          width: "100%",
          maxWidth: compare ? 760 : 460,
        }}
      >
        {/* Header do painel */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              {compare ? "Comparar carteiras" : "Carteira nesta data"}
            </h3>
            <p className="text-[11px]" style={{ color: "var(--faint)" }}>
              {compare ? "Duas datas lado a lado" : "Composição e retorno do dia"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 transition-colors hover:bg-white/10" title="Fechar">
            <X size={18} style={{ color: "var(--muted)" }} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 md:pb-3">
          {loading && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="animate-spin" size={22} style={{ color: "var(--muted)" }} />
            </div>
          )}
          {error && !loading && (
            <p className="p-4 text-sm text-red-400">{error}</p>
          )}
          {!loading && !error && (
            <div className={compare ? "grid grid-cols-1 gap-3 md:grid-cols-2" : ""}>
              {datas.map((d, idx) => {
                const cart = carteiras.find(c => c.pedida === d);
                const pt = pointByDate.get(d);
                return (
                  <CarteiraColumn
                    key={d}
                    accent={idx === 0 ? "#60a5fa" : "#f472b6"}
                    cart={cart}
                    point={pt}
                    removable={compare}
                    onRemove={() => onRemoveDate(d)}
                  />
                );
              })}
            </div>
          )}
          {!loading && !error && !compare && (
            <p className="mt-3 px-1 text-[11px]" style={{ color: "var(--faint)" }}>
              Dica: clique em outra data do gráfico para comparar as duas.
            </p>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}

function CarteiraColumn({
  cart, point, accent, removable, onRemove,
}: {
  cart: Carteira | undefined;
  point: ChartPoint | undefined;
  accent: string;
  removable: boolean;
  onRemove: () => void;
}) {
  if (!cart || cart.encontrada == null) {
    return (
      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs" style={{ color: "var(--faint)" }}>Sem dados para esta data.</p>
      </div>
    );
  }
  const nav = cart.navTotal ?? 0;

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Cabeçalho da coluna */}
      <div className="flex items-start justify-between px-3 pt-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{fmtDate(cart.encontrada)}</p>
            {cart.pedida !== cart.encontrada && (
              <p className="text-[10px]" style={{ color: "var(--faint)" }}>preço de fechamento mais próximo</p>
            )}
          </div>
        </div>
        {removable && (
          <button onClick={onRemove} className="rounded p-1 transition-colors hover:bg-white/10" title="Remover data">
            <X size={14} style={{ color: "var(--muted)" }} />
          </button>
        )}
      </div>

      {/* Métricas do dia (vêm do mesmo ponto do gráfico) */}
      <div className="grid grid-cols-2 gap-2 px-3 py-3">
        <Metric label="Patrimônio" value={compactBRL(nav)} />
        <Metric label="Retorno do dia" value={pctStr(point?.ret)} color={colorForPct(point?.ret)} />
        <Metric label="TWR acumulado" value={pctStr(point?.portfolio)} color={colorForPct(point?.portfolio)} />
        <Metric
          label="vs CDI / IBOV"
          value={`${deltaVs(point?.portfolio, point?.cdi)} / ${deltaVs(point?.portfolio, point?.ibov)}`}
        />
      </div>

      {/* Composição por setor: barra 100% + legenda */}
      {cart.setores.length > 0 && (
        <div className="px-3 pb-3">
          <div className="mb-1.5 flex h-2.5 w-full overflow-hidden rounded-full">
            {cart.setores.map(s => (
              <div key={s.setor} style={{ width: `${s.pesoPct}%`, background: sectorColor(s.setor) }} title={`${s.setor} ${s.pesoPct.toFixed(1)}%`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {cart.setores.map(s => (
              <span key={s.setor} className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--muted)" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: sectorColor(s.setor) }} />
                {s.setor} <span style={{ color: "var(--faint)" }}>{s.pesoPct.toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de posições */}
      <div className="border-t px-1 py-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--faint)" }}>
          <span>Ativo</span>
          <span className="text-right">Peso · Valor</span>
          <span className="text-right">Δ dia</span>
        </div>
        {cart.positions.map(p => (
          <div key={p.ticker} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sectorColor(p.setor) }} />
                <span className="truncate text-xs font-medium" style={{ color: "var(--text)" }}>{p.ticker}</span>
                {p.aoCusto && <span className="text-[9px]" style={{ color: "#f59e0b" }} title="Sem cotação de mercado nesta data — valorado ao custo">≈custo</span>}
              </div>
              {p.quantidade > 0 && (
                <p className="pl-3.5 text-[10px]" style={{ color: "var(--faint)" }}>
                  {p.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} × {p.moeda === "BRL" ? "R$" : p.moeda === "USD" ? "US$" : p.moeda} {p.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs font-medium" style={{ color: "var(--text)" }}>{p.pesoPct.toFixed(1)}%</p>
              <p className="text-[10px]" style={{ color: "var(--faint)" }}>{brl(p.valorBRL)}</p>
            </div>
            <div className="text-right text-xs font-medium" style={{ color: colorForPct(p.gainDiaPct) }}>
              {pctStr(p.gainDiaPct)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.03)" }}>
      <p className="text-[10px]" style={{ color: "var(--faint)" }}>{label}</p>
      <p className="text-sm font-semibold" style={{ color: color ?? "var(--text)" }}>{value}</p>
    </div>
  );
}

function colorForPct(v: number | null | undefined): string {
  if (v == null || v === 0) return "var(--text)";
  return v > 0 ? "#4ade80" : "#f87171";
}

function deltaVs(port: number | null | undefined, bench: number | null | undefined): string {
  if (port == null || bench == null) return "—";
  const d = port - bench;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}pp`;
}
