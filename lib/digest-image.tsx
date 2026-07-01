// Imagem do digest diário (next/og → PNG). Card retrato 1080×1350, estética
// dark/âmbar do app. Sem emojis dentro da imagem (Satori não renderiza glyphs
// de emoji sem twemoji) — os emojis ficam só na legenda do Telegram.

import { ImageResponse } from "next/og";
import type { DigestData, DigestMover } from "./digest";

const W = 1080;
const H = 1350;

const POS = "#34d399";
const NEG = "#f87171";
const AMBER = "#f59e0b";
const TEXT = "#fafafa";
const MUTED = "#a1a1aa";
const FAINT = "#52525b";
const PANEL = "rgba(255,255,255,0.035)";
const LINE = "rgba(255,255,255,0.08)";

function money(v: number, digits = 0): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits });
}
function signMoney(v: number): string {
  return `${v >= 0 ? "+" : ""}${money(v)}`;
}
function signPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function impactColor(i: "alto" | "medio" | "baixo"): string {
  return i === "alto" ? NEG : i === "medio" ? AMBER : FAINT;
}

function Chip({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 24px" }}>
      <div style={{ display: "flex", color: FAINT, fontSize: 20, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", color: valueColor ?? TEXT, fontSize: 40, fontWeight: 800, marginTop: 8 }}>{value}</div>
      {sub ? <div style={{ display: "flex", color: MUTED, fontSize: 22, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

function MoverRow({ m }: { m: DigestMover }) {
  const up = m.changePct >= 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
      <div style={{ display: "flex", color: TEXT, fontSize: 30, fontWeight: 700 }}>{m.ticker}</div>
      <div style={{ display: "flex", color: up ? POS : NEG, fontSize: 30, fontWeight: 800 }}>{signPct(m.changePct)}</div>
    </div>
  );
}

export function renderDigestImage(d: DigestData): ImageResponse {
  const up = d.dayBRL >= 0;
  const dayColor = up ? POS : NEG;

  return new ImageResponse(
    (
      <div
        style={{
          width: W, height: H, display: "flex", flexDirection: "column",
          background: "linear-gradient(160deg, #0c0c0e 0%, #0a0a0b 55%, #100c06 100%)",
          padding: 56, color: TEXT, fontFamily: "sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 14, height: 14, borderRadius: 4, background: AMBER, marginRight: 12 }} />
              <div style={{ display: "flex", color: AMBER, fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>MEUS INVESTIMENTOS</div>
            </div>
            <div style={{ display: "flex", color: MUTED, fontSize: 26, marginTop: 10 }}>{d.dateLabel}</div>
          </div>
          <div style={{ display: "flex", color: FAINT, fontSize: 24 }}>{d.timeLabel}</div>
        </div>

        {/* Hero — patrimônio + dia */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          <div style={{ display: "flex", color: FAINT, fontSize: 24, letterSpacing: 2, textTransform: "uppercase" }}>Patrimônio</div>
          <div style={{ display: "flex", color: TEXT, fontSize: 96, fontWeight: 800, marginTop: 6, lineHeight: 1 }}>{money(d.patrimonioBRL)}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 18 }}>
            <div style={{ display: "flex", background: up ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.14)", color: dayColor, fontSize: 34, fontWeight: 800, borderRadius: 12, padding: "8px 18px" }}>
              {signMoney(d.dayBRL)}  ·  {signPct(d.dayPct)}
            </div>
            {d.patrimonioUSD != null ? (
              <div style={{ display: "flex", color: MUTED, fontSize: 28, marginLeft: 20 }}>
                US$ {Math.round(d.patrimonioUSD).toLocaleString("pt-BR")}
              </div>
            ) : null}
          </div>
        </div>

        {/* Chips: IBKR · USD/BRL · Efeito câmbio */}
        <div style={{ display: "flex", marginTop: 40, gap: 18 }}>
          {d.ibkr ? (
            <Chip
              label="IBKR"
              value={d.ibkr.patrimonioUSD != null ? `US$ ${Math.round(d.ibkr.patrimonioUSD).toLocaleString("pt-BR")}` : money(d.ibkr.patrimonioBRL)}
              sub={`dia ${d.ibkr.lucroDiaUSD != null ? `${d.ibkr.lucroDiaUSD >= 0 ? "+" : ""}US$ ${Math.round(d.ibkr.lucroDiaUSD).toLocaleString("pt-BR")}` : signMoney(d.ibkr.lucroDiaBRL)}`}
              valueColor={TEXT}
            />
          ) : (
            <Chip label="Câmbio USD" value={d.usdbrl.toFixed(2)} sub={d.usdbrlDayPct != null ? signPct(d.usdbrlDayPct) : undefined} valueColor={TEXT} />
          )}
          <Chip
            label="USD / BRL"
            value={d.usdbrl.toFixed(2)}
            sub={d.usdbrlDayPct != null ? `hoje ${signPct(d.usdbrlDayPct)}` : undefined}
            valueColor={TEXT}
          />
          <Chip
            label="Efeito câmbio (dia)"
            value={signMoney(d.fxDayBRL)}
            sub="preço vs moeda"
            valueColor={d.fxDayBRL >= 0 ? POS : NEG}
          />
        </div>

        {/* Melhores e piores */}
        <div style={{ display: "flex", marginTop: 40, gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 26px" }}>
            <div style={{ display: "flex", color: POS, fontSize: 22, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Melhores</div>
            {d.gainers.length ? d.gainers.map((m) => <MoverRow key={m.ticker} m={m} />) : <div style={{ display: "flex", color: FAINT, fontSize: 26, marginTop: 12 }}>—</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 26px" }}>
            <div style={{ display: "flex", color: NEG, fontSize: 22, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>Piores</div>
            {d.losers.length ? d.losers.map((m) => <MoverRow key={m.ticker} m={m} />) : <div style={{ display: "flex", color: FAINT, fontSize: 26, marginTop: 12 }}>—</div>}
          </div>
        </div>

        {/* Manchetes */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40, flex: 1 }}>
          <div style={{ display: "flex", color: FAINT, fontSize: 24, letterSpacing: 2, textTransform: "uppercase" }}>Manchetes do dia</div>
          {d.headlines.slice(0, 4).map((h, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", marginTop: 18 }}>
              <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: impactColor(h.impacto), marginTop: 12, marginRight: 16 }} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ display: "flex", color: "#e4e4e7", fontSize: 27, fontWeight: 600, lineHeight: 1.25 }}>{h.titulo}</div>
                <div style={{ display: "flex", color: FAINT, fontSize: 20, marginTop: 3 }}>{h.fonte}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 22, borderTop: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", color: FAINT, fontSize: 22 }}>Gerado às {d.timeLabel} · horário de Brasília</div>
          <div style={{ display: "flex", color: AMBER, fontSize: 22, fontWeight: 700 }}>resumo do dia</div>
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}
