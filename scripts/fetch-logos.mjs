#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// fetch-logos.mjs — baixa as logos do RESOLVER da app (/api/logo/<ticker>) e
// salva em public/logos/<TICKER>.png, para virarem PERMANENTES no repositório
// (offline, sem depender do resolver em runtime).
//
// Reusa a MESMA resolução do endpoint (brapi/FMP/logo.dev/Parqet), então é a fonte
// única. Rode onde a internet é aberta (sua máquina, CI) — não no sandbox.
//
// Uso:
//   node scripts/fetch-logos.mjs <baseUrl> <TICKER> [TICKER...]
// Exemplos:
//   node scripts/fetch-logos.mjs https://meus-investimentos.vercel.app PETR4.SA VALE3 TSM VOO
//   node scripts/fetch-logos.mjs http://localhost:3000 ITUB4 BBAS3
//
// Depois: git add public/logos && git commit -m "logos" && git push
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, existsSync, mkdirSync } from "fs";

const [, , base, ...tickers] = process.argv;

if (!base || tickers.length === 0) {
  console.error("Uso: node scripts/fetch-logos.mjs <baseUrl> <TICKER> [TICKER...]");
  process.exit(1);
}

const slug = (t) => t.toUpperCase().replace(/\.[A-Z0-9]+$/, "").trim();

mkdirSync("public/logos", { recursive: true });

let ok = 0, skip = 0, fail = 0;
for (const ticker of tickers) {
  const s = slug(ticker);
  const path = `public/logos/${s}.png`;
  if (existsSync(path)) { console.log(`• ${s}: já existe`); skip++; continue; }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/logo/${encodeURIComponent(ticker)}`);
    if (!res.ok) { console.log(`✗ ${s}: HTTP ${res.status} (sem logo — usará iniciais)`); fail++; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) { console.log(`✗ ${s}: imagem vazia`); fail++; continue; }
    writeFileSync(path, buf);
    console.log(`✓ ${s}: salva (${(buf.length / 1024).toFixed(1)} KB)`);
    ok++;
  } catch (e) {
    console.log(`✗ ${s}: ${e.message}`); fail++;
  }
}

console.log(`\n=== ${ok} salvas · ${skip} já existiam · ${fail} sem logo ===`);
