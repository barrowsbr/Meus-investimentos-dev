// Renderizador do CÓDICE — lê os mesmos YAMLs que validam em CI (fonte única de
// verdade) e emite um documento no padrão editorial da casa: Fraunces (títulos),
// Instrument Sans (corpo), JetBrains Mono (dados/código), oxblood sobre creme.
// Um card por regra, campos fixos, sem texto corrido. Fontes embutidas em
// base64 → HTML 100% offline (o mesmo arquivo imprime igual em qualquer lugar).
//
//   node macro-map/render/codice.mjs        → macro-map/render/dist/codice.html
//
// O PDF sai de macro-map/render/pdf.mjs, que imprime este HTML.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";

const ROOT = join(process.cwd(), "macro-map");
const RULES_DIR = join(ROOT, "rules");
const FONTS_DIR = join(ROOT, "render", "fonts");
const OUT_DIR = join(ROOT, "render", "dist");

const FAMILIAS = [
  { id: "energia", nome: "Energia" },
  { id: "juros", nome: "Juros / Fed" },
  { id: "fx", nome: "Dólar / Câmbio" },
  { id: "credito", nome: "Crédito / Risco" },
  { id: "brasil", nome: "Brasil" },
];

const PRONTIDAO = {
  pronto: { label: "PRONTO", nota: "série já persistida (db_cotacoes)" },
  backfill: { label: "BACKFILL", nota: "Yahoo já sabe buscar; falta persistir" },
  integrado: { label: "INTEGRADO", nota: "fonte externa ligada (FRED/BCB/proxy)" },
  fonte_nova: { label: "FONTE NOVA", nota: "não existe no app — integrar" },
};

// ── leitura ──────────────────────────────────────────────────────────────────
function collectYaml(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...collectYaml(full));
    else if (e.name.endsWith(".yaml") || e.name.endsWith(".yml")) out.push(full);
  }
  return out;
}

const drivers = parse(readFileSync(join(ROOT, "drivers.yaml"), "utf8")).drivers;
const driverBySym = new Map(drivers.map((d) => [d.simbolo, d]));
const rules = collectYaml(RULES_DIR)
  .sort()
  .map((f) => ({ rel: relative(ROOT, f), ...parse(readFileSync(f, "utf8")) }));

// ── helpers de apresentação ──────────────────────────────────────────────────
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fontB64 = (file) => readFileSync(join(FONTS_DIR, file)).toString("base64");
const face = (family, weight, style, file) =>
  `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};font-display:swap;src:url(data:font/woff2;base64,${fontB64(file)}) format('woff2');}`;

const dirArrow = (d) => (d === "alta" ? "↑" : "↓");
const sinalCell = (s) =>
  s > 0
    ? `<span class="sig up">▲ +1</span>`
    : `<span class="sig down">▼ −1</span>`;
const lagCell = ([a, b]) => (a === b ? `${a}d` : `${a}–${b}d`);
const conf = (c) => `<span class="conf ${c}">${c}</span>`;
const quant = (v) => (v == null ? `<span class="naq">não quantificado</span>` : esc(String(v)));

function driverName(sym) {
  const d = driverBySym.get(sym);
  return d ? esc(d.nome) : esc(sym);
}
function prontidaoTag(sym) {
  const d = driverBySym.get(sym);
  if (!d) return "";
  const p = PRONTIDAO[d.prontidao] ?? { label: d.prontidao };
  return `<span class="rd ${d.prontidao}">${p.label}</span>`;
}

// ── card de uma regra ────────────────────────────────────────────────────────
function ruleCard(r) {
  const efeitos = r.efeitos
    .map(
      (e) => `<tr>
        <td class="mono ativo">${esc(e.ativo)} <span class="an">${driverName(e.ativo)}</span></td>
        <td>${sinalCell(e.sinal)}</td>
        <td class="mono lag">${lagCell(e.defasagem_dias)}</td>
        <td>${conf(e.confianca)}</td>
        <td>${prontidaoTag(e.ativo)}</td>
      </tr>`
    )
    .join("");

  return `<article class="card ${esc(r.familia)}">
    <header class="card-h">
      <div class="card-h-top">
        <span class="fam">${esc(r.familia)}</span>
        <span class="mono id">${esc(r.id)}</span>
        <span class="mono ver">v${esc(r.version)}</span>
      </div>
      <h3 class="titulo">${esc(r.titulo)}</h3>
    </header>

    <div class="choque">
      <span class="lbl">CHOQUE</span>
      <span class="mono chq">
        <b>${esc(r.choque.driver)}</b> <span class="an">${driverName(r.choque.driver)}</span>
        · ${esc(r.choque.metrica)}
        · ${esc(r.choque.direcao)} ${dirArrow(r.choque.direcao)}
        · ≥ ${esc(r.choque.limiar_sigma)}σ
      </span>
      ${prontidaoTag(r.choque.driver)}
    </div>

    <div class="canal">
      <span class="lbl">CANAL <em>(mecanismo)</em></span>
      <p>${esc(r.canal)}</p>
    </div>

    <div class="efeitos">
      <span class="lbl">EFEITOS ESPERADOS</span>
      <table>
        <thead><tr><th>ativo</th><th>sinal</th><th>defasagem</th><th>confiança</th><th>dado</th></tr></thead>
        <tbody>${efeitos}</tbody>
      </table>
    </div>

    <div class="regime">
      <span class="lbl">REGIME</span>
      <dl>
        <dt>vale quando</dt><dd>${esc(r.regime.vale_quando)}</dd>
        <dt>inverte quando</dt><dd>${esc(r.regime.inverte_quando)}</dd>
        <dt>proxy de regime</dt><dd class="mono">${esc(r.regime.proxy_de_regime)}</dd>
      </dl>
    </div>

    <div class="rodape">
      <div class="evid">
        <span class="lbl">EVIDÊNCIA</span>
        <span class="mono">janela ${esc(r.evidencia.janela)} · taxa de acerto ${quant(r.evidencia.taxa_acerto)} · n ${quant(r.evidencia.n_eventos)}</span>
        <span class="metodo">${esc(r.evidencia.metodo)}</span>
      </div>
      <div class="fals">
        <span class="lbl">FALSIFICAÇÃO</span>
        <p>${esc(r.falsificacao)}</p>
      </div>
      <div class="relev">
        <span class="lbl">PORTFÓLIO</span>
        ${r.relevancia_portfolio.map((t) => `<span class="chip mono">${esc(t)}</span>`).join("")}
      </div>
    </div>
  </article>`;
}

// ── tabela de prontidão dos drivers (o achado da Fase 0, no próprio códice) ────
function readinessTable() {
  const order = { pronto: 0, backfill: 1, integrado: 2, fonte_nova: 3 };
  const rows = [...drivers]
    .sort((a, b) => (order[a.prontidao] - order[b.prontidao]) || a.simbolo.localeCompare(b.simbolo))
    .map(
      (d) => `<tr>
        <td class="mono"><b>${esc(d.simbolo)}</b></td>
        <td>${esc(d.nome)}</td>
        <td class="mono">${esc(d.simbolo_fonte)}</td>
        <td>${prontidaoTag(d.simbolo)}</td>
      </tr>`
    )
    .join("");
  return `<table class="readiness">
    <thead><tr><th>símbolo</th><th>série</th><th>fonte</th><th>prontidão (Fase 0)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ── documento ────────────────────────────────────────────────────────────────
const geradoEm = new Date().toISOString().slice(0, 10);
const nRegras = rules.length;
const porFamilia = FAMILIAS.map((f) => ({
  ...f,
  regras: rules.filter((r) => r.familia === f.id),
})).filter((f) => f.regras.length);

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Mapa de Transmissão Macro — Códice v1</title>
<style>
${face("Fraunces", 600, "normal", "fraunces-600.woff2")}
${face("Fraunces", 400, "italic", "fraunces-400italic.woff2")}
${face("Instrument Sans", 400, "normal", "instrument-sans-400.woff2")}
${face("Instrument Sans", 600, "normal", "instrument-sans-600.woff2")}
${face("JetBrains Mono", 400, "normal", "jetbrains-mono-400.woff2")}
${face("JetBrains Mono", 700, "normal", "jetbrains-mono-700.woff2")}

:root{
  --paper:#F4EBDD; --paper-2:#EFE4D2; --ink:#2A2018; --ink-2:#5A4B3B;
  --oxblood:#5B1216; --oxblood-2:#7A1C1E; --muted:#8A7A64; --line:#D8C9B2;
  --up:#1E6E38; --down:#A3231C; --wash:#EDE0CC;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--paper);color:var(--ink);
  font-family:'Instrument Sans',system-ui,sans-serif;font-size:11px;line-height:1.5;
  -webkit-font-smoothing:antialiased;}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace;}
.page{max-width:820px;margin:0 auto;padding:44px 40px;}

/* Capa */
.cover{padding:60px 40px 34px;border-bottom:2px solid var(--oxblood);margin-bottom:0;}
.cover .kicker{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.28em;
  text-transform:uppercase;color:var(--oxblood);font-weight:700;}
.cover h1{font-family:'Fraunces',serif;font-weight:600;font-size:40px;line-height:1.05;
  color:var(--oxblood);margin:14px 0 6px;letter-spacing:-.01em;}
.cover .sub{font-family:'Fraunces',serif;font-style:italic;font-size:16px;color:var(--ink-2);margin:0 0 20px;}
.cover .meta{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);
  display:flex;gap:18px;flex-wrap:wrap;}
.cover .meta b{color:var(--ink);font-weight:700;}

.tese{background:var(--wash);border-left:3px solid var(--oxblood);padding:16px 20px;margin:26px 0;}
.tese p{margin:0;font-family:'Fraunces',serif;font-size:15px;line-height:1.45;color:var(--ink);}
.tese p em{color:var(--oxblood);font-style:italic;}

.legenda{margin:22px 0 8px;}
.legenda h2,.readbox h2,.fam-sec h2{font-family:'Fraunces',serif;font-weight:600;
  font-size:17px;color:var(--oxblood);margin:0 0 10px;}
.legenda ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;}
.legenda li{font-size:10.5px;color:var(--ink-2);}
.legenda .k{font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--ink);}

.readbox{margin:20px 0 6px;}
table{border-collapse:collapse;width:100%;}
table.readiness{font-size:10px;}
table.readiness th{text-align:left;font-family:'JetBrains Mono',monospace;font-size:9px;
  text-transform:uppercase;letter-spacing:.1em;color:var(--muted);border-bottom:1px solid var(--line);padding:5px 8px;}
table.readiness td{padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:middle;}

/* Seção de família */
.fam-sec{margin-top:30px;}
.fam-sec > h2{border-bottom:1px solid var(--line);padding-bottom:6px;
  display:flex;justify-content:space-between;align-items:baseline;}
.fam-sec > h2 .cnt{font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);font-weight:400;}

/* Card de regra */
.card{border:1px solid var(--line);border-top:3px solid var(--oxblood);background:#FBF5EA;
  padding:16px 18px 14px;margin:14px 0;break-inside:avoid;page-break-inside:avoid;}
.card-h-top{display:flex;align-items:baseline;gap:10px;margin-bottom:4px;}
.fam{font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:#fff;background:var(--oxblood);padding:2px 7px;border-radius:2px;}
.id{font-size:9.5px;color:var(--muted);}
.ver{font-size:9.5px;color:var(--muted);margin-left:auto;}
.titulo{font-family:'Fraunces',serif;font-weight:600;font-size:18px;line-height:1.2;
  color:var(--ink);margin:2px 0 12px;}

.lbl{display:block;font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;
  letter-spacing:.16em;text-transform:uppercase;color:var(--oxblood);margin-bottom:4px;}
.lbl em{color:var(--muted);font-style:normal;font-weight:400;}
.an{color:var(--muted);font-style:italic;font-family:'Instrument Sans',sans-serif;}

.choque{background:var(--wash);border:1px solid var(--line);padding:8px 10px;
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:11px;}
.choque .lbl{margin:0;}
.chq{font-size:11px;}
.chq b{color:var(--oxblood);font-weight:700;}

.canal{margin-bottom:11px;}
.canal p{margin:0;font-size:11px;line-height:1.5;color:var(--ink-2);}

.efeitos{margin-bottom:11px;}
.efeitos table{font-size:10.5px;}
.efeitos th{text-align:left;font-family:'JetBrains Mono',monospace;font-size:8.5px;
  text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:3px 8px 3px 0;border-bottom:1px solid var(--line);}
.efeitos td{padding:5px 8px 5px 0;border-bottom:1px solid var(--line);vertical-align:middle;}
.efeitos td.ativo b{font-weight:700;}
.efeitos .an{font-size:9.5px;}
.sig{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:10px;white-space:nowrap;}
.sig.up{color:var(--up);} .sig.down{color:var(--down);}
.lag{color:var(--ink);}
.conf{font-family:'JetBrains Mono',monospace;font-size:8.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;padding:1px 6px;border-radius:9px;}
.conf.alta{color:var(--up);background:rgba(30,110,56,.12);}
.conf.media{color:#9A6412;background:rgba(154,100,18,.12);}
.conf.baixa{color:var(--muted);background:rgba(138,122,100,.15);}

.rd{font-family:'JetBrains Mono',monospace;font-size:8px;font-weight:700;letter-spacing:.06em;
  padding:1px 5px;border-radius:2px;white-space:nowrap;}
.rd.pronto{color:var(--up);border:1px solid rgba(30,110,56,.4);}
.rd.backfill{color:#9A6412;border:1px solid rgba(154,100,18,.4);}
.rd.integrado{color:#1F6F8C;border:1px solid rgba(31,111,140,.45);}
.rd.fonte_nova{color:var(--down);border:1px solid rgba(163,35,28,.4);}

.regime{margin-bottom:11px;}
.regime dl{margin:0;display:grid;grid-template-columns:104px 1fr;gap:3px 12px;}
.regime dt{font-family:'JetBrains Mono',monospace;font-size:8.5px;text-transform:uppercase;
  letter-spacing:.06em;color:var(--muted);}
.regime dd{margin:0;font-size:10.5px;color:var(--ink-2);}
.regime dd.mono{font-size:10px;color:var(--ink);}

.rodape{border-top:1px solid var(--line);padding-top:9px;display:grid;gap:9px;}
.rodape .metodo{display:block;font-size:9.5px;color:var(--muted);font-style:italic;margin-top:2px;}
.rodape .evid .mono{font-size:10px;color:var(--ink);}
.fals p{margin:0;font-size:10px;color:var(--ink-2);line-height:1.45;}
.naq{color:var(--muted);font-style:italic;font-family:'Instrument Sans',sans-serif;}
.relev .chip{display:inline-block;font-size:9px;font-weight:700;color:var(--oxblood);
  border:1px solid var(--line);background:var(--wash);padding:1px 7px;border-radius:9px;margin-right:5px;}

.foot{margin-top:34px;padding-top:14px;border-top:2px solid var(--oxblood);
  font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--muted);text-align:center;letter-spacing:.05em;}

@page{size:A4;margin:14mm 12mm;}
@media print{.cover,.page{max-width:none;}}
</style></head>
<body>

<section class="cover">
  <div class="kicker">Meus Investimentos · módulo do Radar</div>
  <h1>Mapa de Transmissão Macro</h1>
  <p class="sub">Códice v1 — um detector de divergência, não um gerador de insights</p>
  <div class="meta">
    <span><b>${nRegras}</b> regras semente</span>
    <span><b>${porFamilia.length}</b> famílias</span>
    <span><b>${drivers.length}</b> séries no vocabulário</span>
    <span>gerado em <b>${geradoEm}</b></span>
    <span>fonte única: <b>macro-map/rules/**.yaml</b></span>
  </div>
</section>

<div class="page">
  <div class="tese">
    <p>O mapa estabelece o que <em>deveria</em> acontecer. O alerta dispara quando <em>não</em> acontece.
    &ldquo;Brent caiu e o ouro subiu&rdquo; é ruído — confirma o óbvio. &ldquo;Brent caiu 2σ e o ouro
    não reagiu — anomalia, 3º dia&rdquo; é sinal. Duas pernas, EUA e Brasil, com sinal oposto no
    mesmo choque: um mapa de uma perna só produz conclusão errada para um patrimônio em BRL.</p>
  </div>

  <section class="legenda">
    <h2>Como ler um card</h2>
    <ul>
      <li><span class="k">CHOQUE</span> — o gatilho: driver, métrica, direção e limiar em σ (z-score rolante).</li>
      <li><span class="k">CANAL</span> — o mecanismo econômico proposto. Nunca se confunde com a estatística.</li>
      <li><span class="k">EFEITOS</span> — cada ativo com sinal (+1/−1), defasagem em dias úteis e confiança a priori.</li>
      <li><span class="k">REGIME</span> — quando a regra vale, quando inverte, e o proxy que classifica o estado.</li>
      <li><span class="k">EVIDÊNCIA</span> — coocorrência medida. <span class="naq">não quantificado</span> = output da Fase 2, nunca escrito à mão.</li>
      <li><span class="k">FALSIFICAÇÃO</span> — a condição concreta que derruba a regra. Sem ela, é narrativa.</li>
    </ul>
  </section>

  <section class="readbox">
    <h2>Prontidão dos dados <span style="font:400 11px 'Instrument Sans';color:var(--muted)">— o que a Fase 0 encontrou</span></h2>
    ${readinessTable()}
  </section>

  ${porFamilia
    .map(
      (f) => `<section class="fam-sec">
        <h2>${esc(f.nome)} <span class="cnt">${f.regras.length} regra(s)</span></h2>
        ${f.regras.map(ruleCard).join("")}
      </section>`
    )
    .join("")}

  <div class="foot">MAPA DE TRANSMISSÃO MACRO · CÓDICE V1 · ${geradoEm} · gerado dos YAMLs em macro-map/rules/</div>
</div>
</body></html>`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "codice.html"), html, "utf8");
console.log(`✓ códice: ${nRegras} regras, ${drivers.length} séries → macro-map/render/dist/codice.html (${(html.length / 1024).toFixed(0)} KB)`);
