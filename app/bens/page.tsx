"use client";

// Bens físicos — imóveis, carros e itens de alto valor (fora do mercado).
// Hoje o foco é CARROS: valor da tabela FIPE ao dia (API parallelum, cache
// diário) somado no topo, foto real via /api/bens/foto. Imóveis e Alto valor
// ficam preparados (empty state) para quando chegarem.

import { useEffect, useState } from "react";
import { Home as HomeIcon, Gem, Car } from "lucide-react";
import PageHeader from "@/components/PageHeader";

interface VeiculoFipe {
  id: string; nome: string; detalhe: string; ok: boolean;
  valor?: string; valorNum?: number; fipeModelo?: string; codigoFipe?: string; mesReferencia?: string; erro?: string;
}
interface FipeResp { veiculos: VeiculoFipe[]; total: number; mesReferencia: string | null; ok: boolean }

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function BensPage() {
  const [dados, setDados] = useState<FipeResp | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/bens/fipe")
      .then((r) => r.json())
      .then((d: FipeResp) => { if (vivo) setDados(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const total = dados?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Bens"
        description="Patrimônio físico — carros, imóveis e itens de alto valor, com valor de tabela ao dia."
      />

      {/* Total */}
      <div className="bns-hero">
        <span className="bns-hero-lbl">Total em bens</span>
        <span className="bns-hero-val">{carregando ? "…" : total > 0 ? fmtBRL(total) : "—"}</span>
        {dados?.mesReferencia && <span className="bns-hero-ref">Tabela FIPE · {dados.mesReferencia}</span>}
      </div>

      {/* Carros */}
      <section className="bns-sec">
        <h2 className="bns-h"><Car size={15} strokeWidth={1.7} /> Carros</h2>
        <div className="bns-grid">
          {(dados?.veiculos ?? [{ id: "tcross", nome: "VW T-Cross Highline 250 TSI", detalhe: "2025 · Cinza", ok: false }, { id: "onix", nome: "Chevrolet Onix Joy 1.0", detalhe: "2020 · Branco", ok: false }]).map((v) => (
            <article key={v.id} className="bns-card">
              <div className="bns-foto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/bens/foto?id=${v.id}`} alt={v.nome} loading="lazy" />
              </div>
              <div className="bns-body">
                <span className="bns-detalhe">{v.detalhe}</span>
                <h3 className="bns-nome">{v.nome}</h3>
                <div className="bns-rule" />
                <div className="bns-foot">
                  <div className="bns-valor-blk">
                    <span className="bns-valor">{carregando ? "…" : v.ok && v.valorNum ? fmtBRL(v.valorNum) : "—"}</span>
                    <span className="bns-valor-lbl">{v.ok ? "valor FIPE" : carregando ? "consultando FIPE…" : "FIPE indisponível agora"}</span>
                  </div>
                  {v.codigoFipe && <span className="bns-fipe-cod">FIPE {v.codigoFipe}</span>}
                </div>
                {v.ok && v.fipeModelo && <p className="bns-fipe-modelo">{v.fipeModelo}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Imóveis — preparado */}
      <section className="bns-sec">
        <h2 className="bns-h"><HomeIcon size={15} strokeWidth={1.7} /> Imóveis</h2>
        <div className="bns-empty">
          <span className="bns-empty-ico">🏠</span>
          <p>Nenhum imóvel ainda — espaço reservado.<br /><i>Quando chegar o primeiro, ele entra aqui com valor e valorização.</i></p>
        </div>
      </section>

      {/* Alto valor — preparado */}
      <section className="bns-sec">
        <h2 className="bns-h"><Gem size={15} strokeWidth={1.7} /> Alto valor</h2>
        <div className="bns-empty">
          <span className="bns-empty-ico">💎</span>
          <p>Relógios, joias, instrumentos, arte… — espaço reservado.<br /><i>Itens de alto valor entram aqui com valor estimado.</i></p>
        </div>
      </section>

      <style>{CSS}</style>
    </>
  );
}

const CSS = `
.bns-hero{display:flex;flex-direction:column;gap:2px;margin:2px 0 20px;padding:16px 20px;border-radius:16px;max-width:64rem;
  background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012));border:1px solid rgba(255,255,255,0.09);}
.bns-hero-lbl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);}
.bns-hero-val{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;font-size:clamp(26px,6vw,34px);
  font-weight:500;color:#f3f6f7;line-height:1.1;font-variant-numeric:tabular-nums;}
.bns-hero-ref{font-size:11px;color:var(--muted,#8b969b);}

.bns-sec{margin-bottom:24px;max-width:64rem;}
.bns-h{display:flex;align-items:center;gap:7px;margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
  font-weight:600;color:#c4ced2;}
.bns-h svg{color:#8fb8c9;}

.bns-grid{display:grid;grid-template-columns:1fr;gap:14px;}
@media(min-width:720px){.bns-grid{grid-template-columns:1fr 1fr;}}
.bns-card{border-radius:16px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012));
  border:1px solid rgba(255,255,255,0.09);box-shadow:0 22px 44px -30px rgba(0,0,0,0.85);}
.bns-foto{aspect-ratio:16/8.4;background:#0d1114;overflow:hidden;}
.bns-foto img{width:100%;height:100%;object-fit:cover;display:block;}
.bns-body{padding:14px 16px 13px;display:flex;flex-direction:column;gap:6px;}
.bns-detalhe{font-size:10px;letter-spacing:.15em;text-transform:uppercase;font-weight:600;color:var(--muted,#8b969b);}
.bns-nome{margin:0;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,ui-serif,serif;font-size:clamp(16px,4vw,20px);
  font-weight:500;color:#f3f6f7;line-height:1.1;}
.bns-rule{height:1px;background:rgba(255,255,255,0.08);margin-top:2px;}
.bns-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;}
.bns-valor-blk{display:flex;flex-direction:column;}
.bns-valor{font-size:clamp(17px,4.4vw,21px);font-weight:700;color:#7fd6a8;font-variant-numeric:tabular-nums;}
.bns-valor-lbl{font-size:10px;color:var(--muted,#8b969b);}
.bns-fipe-cod{font-family:ui-monospace,"SF Mono",monospace;font-size:10px;color:rgba(255,255,255,0.34);}
.bns-fipe-modelo{margin:0;font-size:10.5px;color:var(--muted,#8b969b);font-style:italic;}

.bns-empty{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:16px;
  background:rgba(255,255,255,0.018);border:1px dashed rgba(255,255,255,0.14);}
.bns-empty-ico{font-size:26px;filter:grayscale(0.4);opacity:.8;}
.bns-empty p{margin:0;font-size:12px;line-height:1.5;color:var(--muted,#8b969b);}
.bns-empty i{color:rgba(255,255,255,0.28);font-style:normal;font-size:11px;}
`;
