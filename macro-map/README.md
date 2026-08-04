# Mapa de Transmissão Macro → Detector de Divergência

Um módulo do Radar (`/radar`). **Não é um gerador de insights — é um detector de
divergência.** O mapa estabelece o que *deveria* acontecer quando um driver macro
sofre um choque; o alerta dispara quando **não** acontece.

> "Brent caiu e o ouro subiu" é ruído. "Brent caiu 2σ e o ouro não reagiu — anomalia,
> 3º dia" é sinal. Todo o resto existe para viabilizar a segunda frase.

O objeto é um **grafo de transmissão de duas pernas — EUA e Brasil** — com sinal,
defasagem e regime de validade explícitos. O mesmo choque tem sinal oposto nas duas
economias (queda do Brent é desinflacionária para os EUA e choque negativo de termos
de troca para o Brasil), e o patrimônio de referência é contabilizado em BRL.

## Estado (Fase 1)

Esta sessão fecha a **fundação de dados e o códice v1**. Sem pipeline, sem front, sem
estatística — isso é Fase 2–3.

```
macro-map/
  INVENTARIO.md          Fase 0 — o que o Radar já fornece, o que falta, gaps de histórico
  drivers.yaml           vocabulário canônico de séries (símbolo → fonte + prontidão)
  rules/                 FONTE ÚNICA DE VERDADE — 1 arquivo YAML por regra
    energia/  juros/  fx/  credito/  brasil/
  schema/
    rule.schema.json     valida cada regra (JSON Schema draft-07)
    rules.test.ts        validação em CI (vitest): schema + vocabulário + invariantes
  render/
    codice.mjs           lê os YAMLs → HTML no padrão editorial da casa
    pdf.mjs              imprime o HTML em PDF (Chrome headless)
    fonts/               Fraunces / Instrument Sans / JetBrains Mono (OFL, embutidas)
    dist/                saída gerada (HTML + PDF)
```

O `.github/workflows/macro-map.yml` roda a validação em todo push/PR que toca `macro-map/`.

## Princípios não-negociáveis

1. **Fonte única de verdade.** As regras vivem em `rules/**/*.yaml`. O MESMO arquivo
   valida em CI, gera o PDF e (Fase 3) alimenta o runtime. Nunca duplicar as regras.
2. **Curadoria acima de volume.** Meta final: 25–40 regras. Regra sem mecanismo claro
   não entra.
3. **Toda regra é falsificável.** O campo `falsificacao` é obrigatório e concreto.
4. **Nada de causalidade implícita.** `canal` = mecanismo proposto (prosa). `evidencia`
   = coocorrência medida. Nunca se confundem.
5. **Regime é cidadão de primeira classe.** Regra sem `regime` é armadilha.

## Como adicionar uma regra nova

1. **Escolha a família** (`energia`, `juros`, `fx`, `credito`, `brasil`) e crie
   `rules/<familia>/<nome>.yaml`.
2. **Copie um card existente** como molde (ex.: `rules/energia/brent_queda_desinflacao_eua.yaml`).
3. **Preencha os campos** (schema completo em `schema/rule.schema.json`):
   - `id` — `familia.gatilho.desdobramento`, minúsculas e pontos (ex.: `fx.dxy_alta.emergentes_sofrem`).
   - `choque` — `driver`, `metrica`, `direcao` (`queda`/`alta`), `limiar_sigma`.
   - `canal` — o mecanismo econômico, em prosa.
   - `efeitos[]` — para cada ativo: `sinal` (**`+1`/`-1`, nunca palavra**),
     `defasagem_dias: [min, max]` (dias úteis, `min <= max`), `confianca`.
   - `regime` — `vale_quando`, `inverte_quando`, `proxy_de_regime`.
   - `evidencia` — `janela`, `metodo`, e **`taxa_acerto: null` / `n_eventos: null`**
     (NUNCA preencha à mão — são output da Fase 2).
   - `falsificacao` — a condição concreta que derruba a regra.
   - `relevancia_portfolio` — ex.: `[VWRA, SHV]`.
4. **Use só símbolos do vocabulário.** Todo `choque.driver` e `efeitos[].ativo` DEVE
   existir em `drivers.yaml`. Se precisar de uma série nova, **adicione-a lá primeiro**
   (com `fonte`, `simbolo_fonte` e `prontidao`) — senão a validação falha.
5. **Valide:**
   ```bash
   npx vitest run macro-map
   ```
6. **Regenere o códice:**
   ```bash
   node macro-map/render/codice.mjs     # → render/dist/codice.html
   node macro-map/render/pdf.mjs        # → render/dist/codice.pdf  (precisa de Chromium)
   ```

## Gerar o códice em PDF

O HTML (`render/dist/codice.html`) é **100% offline** — as fontes vêm embutidas em base64,
então imprime idêntico em qualquer lugar. O PDF sai imprimindo esse HTML:

```bash
node macro-map/render/codice.mjs
npm i -D playwright-core        # não é dependência do app (para não pesar o build)
node macro-map/render/pdf.mjs
```

Em ambiente com o browser pré-instalado, aponte `CHROMIUM_PATH` (ou `PLAYWRIGHT_BROWSERS_PATH`)
para o executável. Sem Chromium, abra o `codice.html` no navegador e imprima em PDF.

## `taxa_acerto` está sempre "não quantificado" — é de propósito

Na Fase 1 nenhuma regra tem estatística. O códice renderiza **"não quantificado"** em vez
de um número inventado — informação honesta, não lacuna. A Fase 2 preenche `taxa_acerto` e
`n_eventos` **programaticamente** (correlação rolante + event study + taxa de concordância
de sinal), reescrevendo os YAMLs. Até lá, escrever esses campos à mão é proibido (o teste
falha).

## Roadmap (fora desta sessão)

- **Fase 2 — Quantificação.** Para cada regra: correlação rolante, event study em choques
  ≥ 2σ, taxa de concordância de sinal em janela móvel. Preenche `evidencia`.
- **Fase 3 — Integração no Radar.** Job diário (ingestão → z-score → regras acionadas →
  checagem de regime → classificação) e 2–3 cards em `/radar`, cada um em um de três estados:
  **Confirmado** (baixa prioridade), **Anômalo** e **Regime rompido** (alta prioridade). Ver
  `INVENTARIO.md §5-6` para onde plugar.
