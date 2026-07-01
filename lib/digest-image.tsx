// Imagem do digest diário (next/og → PNG). Card vertical 1080×1920 (9:16),
// estética dark/âmbar do app. REGRA: só conteúdo NUMÉRICO de tamanho previsível
// — nada de texto variável (manchetes vivem na LEGENDA, como links clicáveis),
// então o layout nunca estoura. Sem emojis dentro da imagem (Satori não
// renderiza glyphs de emoji sem twemoji) — emojis só na legenda do Telegram.

import { ImageResponse } from "next/og";
import type { DigestData, DigestMover, DigestExposure, DigestMercado } from "./digest";

const W = 1080;
const H = 1920;

const POS = "#34d399";
const NEG = "#f87171";
const AMBER = "#f59e0b";
const BLUE = "#3b82f6";
const TEAL = "#2dd4bf";
const TEXT = "#fafafa";
const MUTED = "#a1a1aa";
const FAINT = "#52525b";
const PANEL = "rgba(255,255,255,0.035)";
const LINE = "rgba(255,255,255,0.08)";

const CCY_COLOR: Record<string, string> = {
  USD: "#38bdf8", EUR: "#a78bfa", CAD: "#f472b6", GBP: "#fb923c", Cripto: AMBER,
};

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function signMoney(v: number): string {
  return `${v >= 0 ? "+" : ""}${money(v)}`;
}
function signPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function compact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return money(v);
}

function SectionTitle({ children, color }: { children: string; color?: string }) {
  return (
    <div style={{ display: "flex", color: color ?? FAINT, fontSize: 22, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>
      {children}
    </div>
  );
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
  const c = up ? POS : NEG;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 15 }}>
      <div style={{ display: "flex", color: TEXT, fontSize: 29, fontWeight: 700 }}>{m.ticker}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ display: "flex", color: MUTED, fontSize: 21 }}>{signMoney(m.changeBRL)}</div>
        <div style={{ display: "flex", color: c, fontSize: 29, fontWeight: 800 }}>{signPct(m.changePct)}</div>
      </div>
    </div>
  );
}

function ExposureRow({ e }: { e: DigestExposure }) {
  const color = CCY_COLOR[e.moeda] ?? MUTED;
  const width = Math.max(2, Math.min(100, e.pct));
  return (
    <div style={{ display: "flex", alignItems: "center", marginTop: 18, gap: 18 }}>
      <div style={{ display: "flex", width: 115, color: TEXT, fontSize: 26, fontWeight: 700 }}>{e.moeda}</div>
      <div style={{ display: "flex", flex: 1, height: 16, borderRadius: 8, background: "rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", width: `${width}%`, borderRadius: 8, background: `linear-gradient(90deg, ${color}cc, ${color})` }} />
      </div>
      <div style={{ display: "flex", width: 240, justifyContent: "flex-end", color: MUTED, fontSize: 25 }}>
        {compact(e.valorBRL)} · {e.pct.toFixed(0)}%
      </div>
    </div>
  );
}

function MercadoChip({ m }: { m: DigestMercado }) {
  const up = m.changePct >= 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "20px 24px", alignItems: "center" }}>
      <div style={{ display: "flex", color: FAINT, fontSize: 21, letterSpacing: 1, textTransform: "uppercase" }}>{m.label}</div>
      <div style={{ display: "flex", color: up ? POS : NEG, fontSize: 36, fontWeight: 800, marginTop: 6 }}>{signPct(m.changePct)}</div>
    </div>
  );
}

export function renderDigestImage(d: DigestData): ImageResponse {
  const up = d.dayBRL >= 0;
  const dayColor = up ? POS : NEG;
  const alocTotal = d.rvBRL + d.rfBRL;
  const rvPct = alocTotal > 0 ? (d.rvBRL / alocTotal) * 100 : 0;
  const rfPct = alocTotal > 0 ? 100 - rvPct : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: W, height: H, display: "flex", flexDirection: "column",
          background: "linear-gradient(165deg, #0c0c0e 0%, #0a0a0b 55%, #100c06 100%)",
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
          <div style={{ display: "flex", color: TEXT, fontSize: 100, fontWeight: 800, marginTop: 6, lineHeight: 1 }}>{money(d.patrimonioBRL)}</div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 20 }}>
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

        {/* Alocação RV / RF */}
        {alocTotal > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 38 }}>
            <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", width: `${rvPct}%`, background: BLUE }} />
              <div style={{ display: "flex", width: `${rfPct}%`, background: TEAL }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
              <div style={{ display: "flex", color: BLUE, fontSize: 24, fontWeight: 700 }}>RV {rvPct.toFixed(0)}% · {compact(d.rvBRL)}</div>
              <div style={{ display: "flex", color: TEAL, fontSize: 24, fontWeight: 700 }}>RF {rfPct.toFixed(0)}% · {compact(d.rfBRL)}</div>
            </div>
          </div>
        ) : null}

        {/* Chips: IBKR · USD/BRL · Efeito câmbio */}
        <div style={{ display: "flex", marginTop: 38, gap: 18 }}>
          {d.ibkr ? (
            <Chip
              label="IBKR"
              value={d.ibkr.patrimonioUSD != null ? `US$ ${Math.round(d.ibkr.patrimonioUSD).toLocaleString("pt-BR")}` : money(d.ibkr.patrimonioBRL)}
              sub={`dia ${d.ibkr.lucroDiaUSD != null ? `${d.ibkr.lucroDiaUSD >= 0 ? "+" : ""}US$ ${Math.round(d.ibkr.lucroDiaUSD).toLocaleString("pt-BR")}` : signMoney(d.ibkr.lucroDiaBRL)}`}
              valueColor={TEXT}
            />
          ) : null}
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

        {/* Mercados hoje: IBOV / S&P 500 / BTC */}
        {d.mercados.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 38 }}>
            <SectionTitle>Mercados hoje</SectionTitle>
            <div style={{ display: "flex", marginTop: 14, gap: 18 }}>
              {d.mercados.slice(0, 3).map((m) => <MercadoChip key={m.label} m={m} />)}
            </div>
          </div>
        ) : null}

        {/* Melhores e piores (até 5 cada, com R$ do dia) */}
        <div style={{ display: "flex", marginTop: 38, gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 26px" }}>
            <SectionTitle color={POS}>Melhores</SectionTitle>
            {d.gainers.length ? d.gainers.map((m) => <MoverRow key={m.ticker} m={m} />) : <div style={{ display: "flex", color: FAINT, fontSize: 26, marginTop: 15 }}>—</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 26px" }}>
            <SectionTitle color={NEG}>Piores</SectionTitle>
            {d.losers.length ? d.losers.map((m) => <MoverRow key={m.ticker} m={m} />) : <div style={{ display: "flex", color: FAINT, fontSize: 26, marginTop: 15 }}>—</div>}
          </div>
        </div>

        {/* Exposição cambial — barras (tamanho fixo, máx. 4 moedas) */}
        {d.exposicao.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 38, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 26px" }}>
            <SectionTitle>Exposição cambial</SectionTitle>
            {d.exposicao.slice(0, 4).map((e) => <ExposureRow key={e.moeda} e={e} />)}
          </div>
        ) : null}

        {/* Proventos — carrego */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 38, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: "22px 26px" }}>
          <SectionTitle color={AMBER}>Proventos</SectionTitle>
          <div style={{ display: "flex", marginTop: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", color: FAINT, fontSize: 20, textTransform: "uppercase", letterSpacing: 1 }}>No mês</div>
              <div style={{ display: "flex", color: AMBER, fontSize: 36, fontWeight: 800, marginTop: 6 }}>{compact(d.proventosMesBRL)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", color: FAINT, fontSize: 20, textTransform: "uppercase", letterSpacing: 1 }}>Média 12m</div>
              <div style={{ display: "flex", color: TEXT, fontSize: 36, fontWeight: 800, marginTop: 6 }}>{compact(d.proventosMedia12mBRL)}<span style={{ color: MUTED, fontSize: 22, fontWeight: 400 }}>/mês</span></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", color: FAINT, fontSize: 20, textTransform: "uppercase", letterSpacing: 1 }}>Acumulado</div>
              <div style={{ display: "flex", color: TEXT, fontSize: 36, fontWeight: 800, marginTop: 6 }}>{compact(d.proventosTotalBRL)}</div>
            </div>
          </div>
        </div>

        {/* Spacer — ancora o footer no fundo, sem sobreposição */}
        <div style={{ display: "flex", flex: 1 }} />

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 22, borderTop: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", color: FAINT, fontSize: 22 }}>Gerado às {d.timeLabel} · horário de Brasília</div>
          <div style={{ display: "flex", color: AMBER, fontSize: 22, fontWeight: 700 }}>resumo do dia</div>
        </div>
      </div>
    ),
    { width: W, height: H },
  );
}
