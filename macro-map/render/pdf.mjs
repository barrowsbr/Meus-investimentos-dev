// Imprime o códice (macro-map/render/dist/codice.html) em PDF via Chrome headless.
//
//   node macro-map/render/codice.mjs   # gera o HTML primeiro
//   node macro-map/render/pdf.mjs      # → macro-map/render/dist/codice.pdf
//
// O HTML é 100% offline (fontes embutidas), então o PDF sai idêntico em qualquer
// lugar. Requer um Chromium acessível ao Playwright — NÃO é dependência do app
// (para não pesar o build da Vercel). Instale sob demanda:
//   npm i -D playwright-core   (usa o Chromium do sistema/ambiente)
// Em ambientes com o browser pré-instalado, defina PLAYWRIGHT_BROWSERS_PATH ou
// CHROMIUM_PATH apontando para o executável.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const OUT_DIR = join(process.cwd(), "macro-map", "render", "dist");
const htmlPath = join(OUT_DIR, "codice.html");
const pdfPath = join(OUT_DIR, "codice.pdf");

let chromium;
try {
  ({ chromium } = await import("playwright-core"));
} catch {
  console.error(
    "playwright-core não encontrado. Instale com:  npm i -D playwright-core\n" +
      "O HTML do códice já está pronto em macro-map/render/dist/codice.html — abra-o no navegador e imprima em PDF se preferir."
  );
  process.exit(1);
}

const executablePath =
  process.env.CHROMIUM_PATH ||
  (process.env.PLAYWRIGHT_BROWSERS_PATH
    ? join(process.env.PLAYWRIGHT_BROWSERS_PATH, "chromium")
    : undefined);

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage();
// carrega o arquivo local; as fontes já vêm embutidas, sem rede
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
});
await browser.close();

const kb = (readFileSync(pdfPath).length / 1024).toFixed(0);
console.log(`✓ PDF: macro-map/render/dist/codice.pdf (${kb} KB)`);
