// Baixa as fotos da coleção de moedas (CDN do CoinSnap) para
// public/colecao-moedas/ e reescreve lib/moedas-data.ts para apontar para os
// arquivos LOCAIS — se o CDN sair do ar, as fotos sobrevivem no repositório.
// Uso: node scripts/baixar-moedas.mjs  (rodar de novo após regenerar
// moedas-data.ts com um CSV novo — URLs já locais são ignoradas).

import fs from "node:fs";
import path from "node:path";

const DATA = "lib/moedas-data.ts";
const DIR = "public/colecao-moedas";

const src = fs.readFileSync(DATA, "utf8");
const urls = [...new Set([...src.matchAll(/https:\/\/static\.coinidentifierai\.com\/[^"\s]+/g)].map((m) => m[0]))];
if (urls.length === 0) {
  console.log("nenhuma URL remota no moedas-data.ts — nada a baixar");
  process.exit(0);
}
fs.mkdirSync(DIR, { recursive: true });

let ok = 0, falha = 0, bytes = 0;
const mapa = new Map();

async function baixar(url) {
  const nome = path.basename(new URL(url).pathname);
  const destino = path.join(DIR, nome);
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
    mapa.set(url, `/colecao-moedas/${nome}`);
    ok++;
    return;
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200) throw new Error("resposta suspeita (muito pequena)");
    fs.writeFileSync(destino, buf);
    bytes += buf.length;
    mapa.set(url, `/colecao-moedas/${nome}`);
    ok++;
  } catch (e) {
    // Falhou → mantém a URL remota para essa foto (melhor que quebrar o card).
    falha++;
    console.warn(`FALHOU ${url}: ${e.message}`);
  }
}

// Concorrência 8
for (let i = 0; i < urls.length; i += 8) {
  await Promise.all(urls.slice(i, i + 8).map(baixar));
}

let out = src;
for (const [url, local] of mapa) out = out.split(url).join(local);
fs.writeFileSync(DATA, out);

console.log(`${ok}/${urls.length} fotos locais (${(bytes / 1e6).toFixed(1)} MB baixados agora, ${falha} falhas)`);
if (falha > 0) process.exitCode = 0; // parcial ainda é progresso; as restantes ficam remotas
