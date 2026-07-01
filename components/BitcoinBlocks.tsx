"use client";

import { useEffect, useState } from "react";
import { Pickaxe, Boxes } from "lucide-react";

interface BitcoinBlock {
  height: number;
  id: string;
  timestamp: number;
  txCount: number;
  sizeMB: number;
  medianFee: number;
  feeMin: number;
  feeMax: number;
  totalFeesBTC: number;
  rewardBTC: number;
  pool: string;
}

// Tempo relativo curto em pt-BR (ex.: "agora", "3m", "1h 12m").
function timeAgo(tsSec: number, nowMs: number): string {
  const diffMin = Math.max(0, Math.floor((nowMs - tsSec * 1000) / 60000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Cor do bloco pela taxa mediana (sat/vB): baixo = âmbar, alto = laranja/vermelho.
// Fiel ao espírito do mempool.space, mas na paleta âmbar da página de cripto.
function blockColors(medianFee: number): { top: string; face: string; edge: string; glow: string } {
  if (medianFee <= 3) return { top: "#fcd34d", face: "#f59e0b", edge: "#b45309", glow: "rgba(245,158,11,.35)" };
  if (medianFee <= 10) return { top: "#fbbf24", face: "#ea9612", edge: "#a2560a", glow: "rgba(234,150,18,.38)" };
  if (medianFee <= 25) return { top: "#fb923c", face: "#ea580c", edge: "#9a3412", glow: "rgba(234,88,12,.42)" };
  return { top: "#f87171", face: "#dc2626", edge: "#7f1d1d", glow: "rgba(220,38,38,.45)" };
}

function Block({ b, nowMs, isNewest }: { b: BitcoinBlock; nowMs: number; isNewest: boolean }) {
  const c = blockColors(b.medianFee);
  return (
    <div className="flex flex-col items-center shrink-0" style={{ width: 118 }}>
      {/* Cubo 3D — face + bisel (inset) + pilha atrás (box-shadow em camadas) */}
      <div
        className="relative"
        style={{
          width: 92,
          height: 92,
          borderRadius: 12,
          background: `linear-gradient(150deg, ${c.top} 0%, ${c.face} 45%, ${c.edge} 100%)`,
          boxShadow: `
            inset 0 2px 3px rgba(255,255,255,.35),
            inset 0 -6px 10px rgba(0,0,0,.25),
            3px 4px 0 ${c.edge},
            6px 8px 0 rgba(0,0,0,.28),
            0 10px 22px ${c.glow}`,
          animation: isNewest ? "btcblock-pop .5s ease-out" : undefined,
        }}
      >
        {/* brilho superior */}
        <div className="absolute inset-x-2 top-1.5 h-2 rounded-full" style={{ background: "rgba(255,255,255,.30)", filter: "blur(2px)" }} />
        {/* conteúdo do bloco */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-1" style={{ color: "#1c1408" }}>
          <span className="font-mono font-extrabold leading-none" style={{ fontSize: 11, opacity: .7 }}>
            {b.medianFee > 0 ? `~${b.medianFee}` : "—"}
          </span>
          <span className="font-mono font-black leading-tight tracking-tight" style={{ fontSize: 16 }}>
            {b.height.toLocaleString("pt-BR")}
          </span>
          <span className="font-mono leading-none" style={{ fontSize: 8.5, opacity: .72 }}>sat/vB</span>
          <span className="font-mono leading-none mt-1" style={{ fontSize: 8.5, opacity: .82 }}>
            {b.feeMin}–{b.feeMax}
          </span>
        </div>
      </div>

      {/* metadados abaixo do bloco */}
      <div className="mt-2 text-center w-full px-0.5">
        <p className="font-mono truncate" style={{ fontSize: 10, color: "#e4b062", fontWeight: 700 }}>{b.pool}</p>
        <p className="font-mono" style={{ fontSize: 9.5, color: "#71717a" }}>
          {b.txCount.toLocaleString("pt-BR")} tx · {b.sizeMB.toFixed(2)} MB
        </p>
        <p className="font-mono" style={{ fontSize: 9.5, color: "#52525b" }}>{timeAgo(b.timestamp, nowMs)}</p>
      </div>
    </div>
  );
}

export default function BitcoinBlocks() {
  const [blocks, setBlocks] = useState<BitcoinBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/bitcoin/blocks")
        .then(r => r.json())
        .then((d: { blocks?: BitcoinBlock[] }) => {
          if (cancelled) return;
          const arr = Array.isArray(d.blocks) ? d.blocks : [];
          setBlocks(arr);
          setFailed(arr.length === 0);
          setLoading(false);
        })
        .catch(() => { if (!cancelled) { setFailed(true); setLoading(false); } });
    };
    load();
    const refresh = setInterval(load, 60_000);           // novos blocos ~10min
    const tick = setInterval(() => !cancelled && setNowMs(Date.now()), 30_000); // "há Xm" vivo
    return () => { cancelled = true; clearInterval(refresh); clearInterval(tick); };
  }, []);

  if (!loading && failed) return null; // não polui a página se a API falhar

  const latest = blocks[0]?.height;

  return (
    <div className="glass-card p-4 md:p-5 border-amber-500/10 mb-6 overflow-hidden">
      <style>{`@keyframes btcblock-pop{0%{transform:translateY(-10px) scale(.9);opacity:0}60%{transform:translateY(2px) scale(1.02)}100%{transform:translateY(0) scale(1);opacity:1}}
        @keyframes btcblock-pulse{0%,100%{opacity:.35}50%{opacity:.85}}`}</style>

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Boxes size={16} className="text-amber-400" />
          </div>
          <div>
            <h3 className="font-mono uppercase tracking-wider font-bold flex items-center gap-2" style={{ fontSize: 12, color: "#fef3c7" }}>
              Blocos minerados
              <span className="inline-flex items-center gap-1" style={{ fontSize: 9, color: "#a1a1aa" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "btcblock-pulse 2s infinite" }} />
                ao vivo
              </span>
            </h3>
            <p className="font-mono" style={{ fontSize: 10, color: "#71717a" }}>
              Rede Bitcoin{latest ? ` · altura ${latest.toLocaleString("pt-BR")}` : ""} · via mempool.space
            </p>
          </div>
        </div>
        <Pickaxe size={16} className="text-amber-500/40 hidden sm:block" />
      </div>

      {/* Faixa de blocos */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shrink-0 rounded-xl bg-amber-500/5 animate-pulse" style={{ width: 92, height: 92 }} />
          ))}
        </div>
      ) : (
        <div className="relative">
          {/* "corrente" ligando os blocos */}
          <div className="absolute left-0 right-0 pointer-events-none" style={{ top: 45, height: 2, background: "linear-gradient(90deg, transparent, rgba(245,158,11,.18) 8%, rgba(245,158,11,.18) 92%, transparent)" }} />
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
            {blocks.map((b, i) => (
              <Block key={b.id} b={b} nowMs={nowMs} isNewest={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
