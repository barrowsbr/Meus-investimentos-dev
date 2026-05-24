# Meus Investimentos — Guia de Design e UX

Projeto Streamlit com tema dark + glassmorphism e acentos quentes (bege/creme).
Todas as páginas ficam em `app/` (Home.py) e `app/pages/`.

---

## Linguagem Visual

**Filosofia central:**
- Dark slate como base, acentos em tons bege/creme quentes
- Glassmorphism como linguagem visual principal (backdrop-filter em tudo)
- Cores sempre em `rgba()` — nunca hex sólido em backgrounds
- Micro-interações: hover eleva, escurece fundo, revela seta
- Verde `#34d399` = positivo, Vermelho `#f87171` = negativo, Ciano `#06b6d4` = ao vivo/ativo, Índigo `#6366f1` = foco/destaque

---

## Paleta de Cores

### Backgrounds
```
Dark slate principal:  rgba(15, 23, 42, 0.6)    → cards base
Dark slate hover:      rgba(15, 23, 42, 0.75)   → cards hover
Dark slate forte:      rgba(15, 23, 42, 0.8)    → metrics card
Dark slate máximo:     rgba(15, 23, 42, 0.95)   → metrics hover
Radar:                 rgba(8, 13, 26, 0.82)
Expander Streamlit:    rgba(10, 18, 35, 0.4)
```

### Acentos Quentes (por card/seção)
```
Patrimônio:   rgba(245, 222, 179, ...)   → bege dourado (#f5deb3)
Finanças:     rgba(222, 184, 135, ...)   → tan dourado (#deb887)
Performance:  rgba(250, 240, 230, ...)   → creme claro (#faf0e6)
Legado:       rgba(255, 228, 196, ...)   → bisque (#ffe4c4)
Editor:       rgba(240, 230, 220, ...)   → bege acinzentado (#f0e6dc)
Notícias:     rgba(6, 182, 212, ...)     → ciano (#06b6d4)
```

### Texto
```
Principal:    #ffffff / #f1f5f9
Secundário:   #94a3b8
Terciário:    #64748b / #475569
```

### Semânticas
```
Positivo:  #34d399
Negativo:  #f87171
Ciano:     #06b6d4, #22d3ee
Índigo:    #6366f1, #818cf8
Roxo:      #a78bfa
Laranja:   #fb923c
```

---

## Glassmorphism

Sempre incluir `-webkit-backdrop-filter` junto com `backdrop-filter`.

```css
/* Padrão de card */
background: rgba(15, 23, 42, 0.6);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
border: 1px solid transparent;  /* borda via ::before */
border-radius: 20px;
```

**Níveis de blur por componente:**
- `blur(12px)` — metrics card, elementos menores
- `blur(16px)` — nav-card, expandable-card, ticker, radar-card
- `blur(18px)` — expanders Streamlit nas páginas internas

---

## Tipografia

**Fonte:** `'Outfit', sans-serif` (Google Fonts)

| Elemento         | Tamanho  | Peso | Letter-spacing |
|------------------|----------|------|----------------|
| Hero title       | 7.2rem   | 800  | 6px            |
| Hero subtitle    | 1.5rem   | 500  | 3px            |
| Card title       | 1.5rem   | 600  | 2px            |
| Card desc        | 0.85rem  | 400  | 1px            |
| Badge/label      | 0.75rem  | 600  | 1px            |
| Micro dado       | 0.57rem  | 800  | 2px            |

**Mobile (`max-width: 768px`):**
- Hero title: 2.8rem, letter-spacing: 2px
- Card title: 1.2rem
- Card desc: 0.75rem

> Compensar letter-spacing com `margin-right: -Xpx` quando centralizado (evita desvio visual).

---

## Espaçamentos e Layout

**Border-radius:**
- `20px` — cards principais (nav-card, expandable-card, metrics, radar)
- `16px` — ticker, expanders Streamlit
- `12px` — sub-items, badges médios
- `8px` — icon boxes
- `5px` — pills/badges pequenos
- `50%` — avatares, dots

**Padding de cards:**
- Grande: `25px 40px` (metrics-card)
- Padrão: `18px 30px` (nav-card, expandable-card)
- Médio: `20px 30px`, `16px`
- Compacto: `12px 20px`

**Gaps:**
- Seção: `40px`
- Cards: `14px` (coluna home)
- Sub-items: `10px`
- Ícone+texto: `8px`

---

## Sombras

```css
/* Card base */
box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);

/* Hover com acento temático — exemplo Editor */
box-shadow: 0 20px 50px -10px rgba(240, 230, 220, 0.2);

/* Metrics hover com índigo */
box-shadow: 0 25px 50px -12px rgba(99, 102, 241, 0.25), inset 0 0 30px rgba(255,255,255,0.05);

/* Radar */
box-shadow: 0 14px 48px -10px rgba(0, 0, 0, 0.55);
```

**Sombras de hover por seção:**
```
Patrimônio:  0 20px 50px -10px rgba(245, 222, 179, 0.2)
Finanças:    0 20px 50px -10px rgba(222, 184, 135, 0.2)
Performance: 0 20px 50px -10px rgba(250, 240, 230, 0.2)
Legado:      0 20px 50px -10px rgba(255, 228, 196, 0.2)
Editor:      0 20px 50px -10px rgba(240, 230, 220, 0.2)
Notícias:    0 20px 50px -10px rgba(6, 182, 212, 0.2)
```

---

## Gradientes

**Borda de card via `::before` (padrão base):**
```css
background: linear-gradient(135deg,
    rgba(255,255,255,0.1) 0%,
    rgba(255,255,255,0.05) 50%,
    rgba(255,255,255,0.1) 100%
);
-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
mask-composite: exclude;
```

**Hover no `::before` por seção:**
```
Editor:  linear-gradient(135deg, rgba(240,230,220,0.4) 0%, rgba(200,190,180,0.2) 100%)
Notícias: linear-gradient(135deg, rgba(6,182,212,0.4) 0%, rgba(8,145,178,0.2) 100%)
```

**Borda esquerda de sub-item (hover):**
```css
background: linear-gradient(to bottom,
    rgba(245, 222, 179, 0.6),
    rgba(210, 180, 140, 0.3)
);
```

---

## Animações e Transições

**Easing padrão:** `cubic-bezier(0.4, 0, 0.2, 1)`

**Durações:**
- `0.4s` — transforms principais (card hover, max-height)
- `0.3s` — interações padrão (opacity, cor)
- `0.25s` — sub-items, ícones
- `0.55s` — preenchimento de barras

**Keyframes relevantes:**
```css
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
}

@keyframes skeletonPulse {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.8; }
}

@keyframes pulseDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.35; transform: scale(0.65); }
}
```

---

## Tipos de Card

### nav-card — Navegação Direta
Usado quando clicar deve navegar para uma página sem expandir.
```html
<a href="NomePagina" target="_self" class="nav-card card-[tema]">
    <div class="card-title"><i class="card-icon">[símbolo]</i> Título</div>
    <div class="card-desc">Descrição curta</div>
    <span class="card-arrow">→</span>
</a>
```
- `card-arrow` aparece deslizando da esquerda no hover (opacity 0→1, translateX -10px→0)
- **Preferência UX:** usar `nav-card` por padrão. Só usar `expandable-card` quando houver múltiplos destinos realmente distintos que justifiquem.

### expandable-card — Expansão com Sub-itens
Usado apenas quando há múltiplos destinos distintos (ex: abas diferentes).
```html
<div class="expandable-wrapper">
    <input type="checkbox" id="[id]-toggle" class="expand-toggle [id]-toggle">
    <div class="expandable-card card-[tema]-exp">
        <label for="[id]-toggle" class="expandable-header">
            <div class="card-title"><i class="card-icon">[símbolo]</i> Título</div>
            <div class="card-desc">Descrição</div>
            <span class="expand-icon">▼</span>
        </label>
        <div class="expandable-content">
            <div class="divider-line"></div>
            <div class="sub-items">
                <a href="Pagina?tab=0" target="_self" class="sub-item">
                    <span class="sub-item-icon">[emoji/svg]</span>
                    <span class="sub-item-text">Nome</span>
                    <span class="sub-item-arrow">→</span>
                </a>
            </div>
        </div>
    </div>
</div>
```

---

## Símbolos/Ícones por Seção

| Seção       | Símbolo |
|-------------|---------|
| Composição  | `◈`     |
| Finanças    | `◆`     |
| Editor      | `▣`     |
| Notícias    | `◉`     |
| Seta (card) | `→`     |
| Expandir    | `▼`     |

---

## Padrões Streamlit (Overrides CSS)

```css
/* Input fields */
border-radius: 10px !important;
background: rgba(15, 23, 42, 0.5) !important;
border: 1px solid rgba(255,255,255,0.08) !important;

/* Focus */
border-color: rgba(99,102,241,0.4) !important;
box-shadow: 0 0 0 2px rgba(99,102,241,0.1) !important;

/* Expanders */
background: rgba(10, 18, 35, 0.4) !important;
backdrop-filter: blur(18px) !important;
border: 1px solid rgba(99, 102, 241, 0.08) !important;
border-radius: 16px !important;
```

---

## Estrutura das Planilhas Google Sheets

**Planilha:** `gdados` (única, acessada via service account)

O código usa `get_all_values(value_render_option='UNFORMATTED_VALUE')` — linha 1 é o cabeçalho, dados a partir da linha 2. Células vazias viram `None`. Números vêm como float nativo do Sheets (sem formatação de texto).

---

### `meus_ativos` — Transações de Ativos

Colunas obrigatórias (o código aceita variações mas estes são os nomes canônicos):

| Coluna | Tipo | Notas |
|--------|------|-------|
| `ticker` | texto | Símbolo em maiúsculas. Aceita também `símbolo` |
| `data` | data | Formato DD/MM/AAAA ou ISO |
| `tipo` | texto | `Compra` ou `Venda`. Aceita `tipo de transação` |
| `quantidade` | número | Decimal ponto ou vírgula |
| `preco` | número | Preço unitário. Aceita `preço` |
| `taxas` | número | Corretagem. Aceita `taxa de corretagem` |
| `total` | número | Valor líquido. Aceita `valor líquido` |
| `valor_bruto` | número | Opcional. Aceita `valor bruto` |
| `moeda` | texto | Opcional. Default `BRL` |

Tipo normalizado no código: qualquer variante de "compra/buy/aporte" → `Compra`; "venda/sell/resgate" → `Venda`.

---

### `meus_proventos` — Proventos e Dividendos

| Coluna | Tipo | Notas |
|--------|------|-------|
| `ticker` | texto | Aceita `símbolo` |
| `data` | data | Data de pagamento. Aceita `pagamento` |
| `valor` | número | Valor líquido recebido. Aceita `valor líquido` |
| `lançamento` | texto | `Dividendo`, `JCP`, `Rendimento`, `IMPOSTO`. Aceita `tipo`, `evento` |
| `decisao` | texto | Opcional. Para sincronização IBKR: `Dividendo` ou `IMPOSTO` |
| `categoria` | texto | Ex: `Ação Nacional`, `Ação Internacional`, `FII` |
| `moeda` | texto | Opcional. Default `BRL`. Aceita `currency` |

---

### `renda_fixa` — Transações de Renda Fixa

| Coluna | Tipo | Notas |
|--------|------|-------|
| `Compra` | data | **Nome exato preferido** (maiúsculo). É o campo de data principal. Fallback: `data` |
| `Ticker` | texto | Nome/código do ativo RF. Aceita `ativo`, `papel` |
| `Tipo` | texto | `Compra`, `Venda`, `Imposto`, `Resgate`. Aceita `movimentacao` |
| `Valor` | número | Valor da transação |
| `Moeda` | texto | Opcional. Default `BRL` |
| `Valor Atual` | número | Opcional. Saldo atual. Aceita `atual`, `saldo`, `posicao` |

---

### `fixa_aberta` — Saldo Manual de Renda Fixa

Snapshot manual do saldo atual de cada produto de RF (sem histórico de transações).

| Coluna | Tipo | Notas |
|--------|------|-------|
| `Ticker` | texto | Nome/código do produto. Aceita `ativo` |
| `Atual` | número | Saldo atual. Aceita `valor atual` |
| `Data` | data | Opcional. Data da última atualização |
| `Moeda` | texto | Opcional. Default `BRL` |
| `Tipo` | texto | Opcional |

---

### `cambio` — Transferências Internacionais / Câmbio

| Coluna | Tipo | Notas |
|--------|------|-------|
| `data` | data | Data da operação |
| `moeda origem` | texto | Ex: `BRL`, `USD` |
| `moeda destino` | texto | Ex: `USD`, `BRL` |
| `valor entrada` | número | Valor enviado (moeda origem) |
| `valor saida` | número | Valor recebido (moeda destino). Aceita `valor saída` |
| `vet` | número | Opcional. Taxa/VET da operação. Aceita `taxa` |
| `corretora destino` | texto | Opcional. Instituição de destino |

---

### `composicao` — Composição de ETFs / Ativos

Estrutura livre, mas deve ter ao menos:

| Coluna | Tipo | Notas |
|--------|------|-------|
| `ativo` | texto | Ticker ou nome do componente. Aceita `ticker`, `symbol` |
| `peso` | número | % de alocação. Aceita `percentual`, `%`, `pl`, `part %` |

Demais colunas descritivas são ignoradas pelo código.

---

### `p_tax` — Taxas PTAX (Opcional)

Aba opcional com cotações históricas PTAX para cálculo de IR.

| Coluna | Tipo | Notas |
|--------|------|-------|
| `data` | data | Data da cotação (primeira coluna detectada com "data") |
| `taxa` | número | Cotação PTAX USD/BRL (segunda coluna; detectada por palavra-chave: `taxa`, `ptax`, `cotacao`, `valor`, `usd`, `rate`) |

Se a aba não existir, o código continua sem erros.

---

### `lb_historic` — Histórico Patrimonial por Ano

Estrutura matricial: linhas = instituições, colunas = anos.

| Estrutura | Notas |
|-----------|-------|
| Coluna 1 | Nome da instituição (qualquer header, ex: `Instituição`) |
| Colunas 2..N | Anos como strings numéricas: `2020`, `2021`, ..., `2025` |
| Última linha | Linha com valor `total` na coluna 1 (opcional — calculada automaticamente se ausente) |

Valores numéricos em formato BR (vírgula decimal) ou float nativo do Sheets.

---

### `financas_pessoal` — Orçamento Mensal Pessoal

**Headers exatos (case-sensitive):** `Categoria`, `Nome`, `Valor`

| `Categoria` | Significado |
|-------------|-------------|
| `entrada` | Receitas (salário, benefícios) |
| `saida` | Despesas fixas (luz, condomínio, aluguel) |
| `cartao` | Faturas de cartão de crédito |
| `poupanca` | Meta de poupança |

---

### `financas_assinaturas` — Assinaturas Recorrentes

**Headers exatos:** `Nome`, `Valor`, `Dia`, `Ativa`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `Nome` | texto | Nome do serviço |
| `Valor` | número | Custo mensal |
| `Dia` | inteiro | Dia do mês em que é cobrado (0 se não aplicável) |
| `Ativa` | booleano | Se a assinatura está ativa |

---

### `financas_parcelamentos` — Compras Parceladas

**Headers exatos:** `Nome`, `Valor_Total`, `Parcelas`, `Data_Compra`

| Coluna | Tipo | Notas |
|--------|------|-------|
| `Nome` | texto | Descrição da compra |
| `Valor_Total` | número | Valor total do parcelamento |
| `Parcelas` | inteiro | Número de parcelas |
| `Data_Compra` | data | Data da compra |

---

### Regras Gerais de Formatação

- **Números:** vírgula como decimal e ponto como milhar (formato BR: `1.234,56`) **ou** float nativo do Sheets — ambos funcionam. O `parse_decimal_br()` normaliza automaticamente.
- **Datas:** `DD/MM/AAAA`, `AAAA-MM-DD`, ou serial numérico do Sheets — o `parse_date_br()` trata todos.
- **Moeda ausente:** qualquer coluna `moeda` vazia assume `BRL` automaticamente.
- **Células vazias:** tratadas como `None` pelo provider; o código não falha em colunas opcionais ausentes.

---

## Classificação de Ativos

### Setores definidos em `app/core/logic.py` → `identificar_setor_ativo()`

| Setor | Exemplos |
|-------|---------|
| `Ações Brasil` | PETR4.SA, ITUB4.SA, CMIG4.SA |
| `Ações Internacional` | KO, NVDA, MSFT, META, GOOGL |
| `ETF USA` | SPY, QQQ, VWRA.L |
| `ETF` | IVVB11, BOVA11, SMAL11 |
| `FIIs` | KNCR11.SA (código terminado em 11, exceto units) |
| `Commodities` | IAU, SIVR, SLV, GLD |
| `Cripto` | BTC-USD, ETH-USD |
| **`Renda Fixa USD`** | **SHV, BIL** — ETFs de T-Bills/bonds americanos |
| `Renda Fixa` | TESOURO*, CDB*, NTN*, LCI*, LCA* |

**Regra importante — SHV e BIL são `Renda Fixa USD`:**
- SHV (iShares Short Treasury Bond ETF) e BIL são ETFs de renda fixa em dólar
- **Não aparecem** na seção "Renda Variável (Hoje)" da Home
- **Não aparecem** no ticker tape / performers do dia
- **Contam como RF** no cálculo de patrimônio total
- **Não entram** em top_gainers / top_losers do snapshot
- Para adicionar novos ETFs de renda fixa USD ao grupo: editar `renda_fixa_usd` em `logic.py` e `_RF_SETORES` em `Home.py`

---

## Decisões UX Registradas

- **Cards de navegação única** devem ser `nav-card` com link direto — sem expandir.
- **Expandable** apenas quando há 2+ destinos funcionalmente distintos (ex: abas diferentes da mesma página).
- Hover em cards sempre combina: elevação (`translateY`), escurecimento de fundo, sombra colorida temática e revelação da seta.
- Sub-items usam `translateX(4px)` + borda esquerda gradiente no hover.
- Ticker tape tem duração dinâmica: `max(18, len(items) * 4)` segundos.
- Cores semânticas (verde/vermelho) nunca usadas como acento decorativo — apenas para dados financeiros.
- **Sem botão "Voltar para Home" nas páginas** — a navegação é feita exclusivamente pela barra de menu inferior (FAB). Nunca adicionar `render_back_button()` ou botões de voltar no topo das páginas. **Exceção:** `8_Easter_Eggs.py` — página isolada onde o menu inferior não funciona; os botões de voltar internos são necessários e devem ser mantidos.

---

## Agente IA — Contexto e Cálculos

### Arquitetura do Contexto

O agente recebe dois blocos de dados via `set_context()`:

1. **`build_portfolio_context()`** — dados brutos das abas do Google Sheets (transações, RF manual, proventos). Limitado às últimas N linhas para economizar tokens.

2. **`build_market_snapshot()`** — snapshot calculado por `core/computed.py` com preços ao vivo do yfinance. **Este é o bloco de verdade financeira** — use sempre os valores deste bloco, nunca tente recalcular somando as tabelas.

### Valores de Câmbio

O snapshot usa taxas ao vivo (yfinance: `BRL=X`, `EURBRL=X`, `CADBRL=X`). Moedas suportadas: BRL, USD, EUR, CAD. O contexto inclui a tabela "💱 Câmbio do Dia" com todas as taxas usadas.

### Regra de Ouro: nunca some colunas das tabelas

O contexto inclui o bloco **"💼 Resumo Patrimonial"** com o total, RV e RF já calculados e corretos. O agente deve usar esses valores, não tentar recalcular somando linhas das tabelas (isso causa double-count de SHV, confusão de moeda etc.).

### Campos por Posição no Snapshot

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `pm` | nativo | Preço médio na moeda original do ativo (USD, EUR, BRL…) |
| `pm_brl` | BRL | Preço médio convertido para BRL pelo câmbio do dia |
| `market_value` | nativo | Qtd × preço atual, na moeda original |
| `market_value_brl` | BRL | Valor da posição em BRL (use este para totais) |
| `day_pnl_r` | nativo | Variação do dia na moeda original |
| `day_pnl_brl` | BRL | Variação do dia em BRL (use este) |
| `total_pnl_brl` | BRL | PnL total desde a compra, em BRL |
| `fator_brl` | float | Taxa de conversão moeda→BRL aplicada |

### Composição do Patrimônio Total

```
total_patrimonio_brl = rv_patrimonio_brl + rf_patrimonio_brl

rf_patrimonio_brl = soma(fixa_aberta, status=Ativo) × câmbio
                  + soma(posições com setor ∈ {Renda Fixa USD, Renda Fixa})

rv_patrimonio_brl = soma(posições com setor ∉ RF, market_value_brl > 1)
```

**Componentes de Renda Fixa:**
- Tesouro Direto, CDBs, LCIs, LCAs → aba `fixa_aberta`
- Caixa manual → aba `fixa_aberta` (Tipo = Caixa ou similar)
- SHV, BIL (ETFs de T-Bills USD) → aba `meus_ativos`, setor `Renda Fixa USD`

### Ao Criar Funcionalidades que Envolvem Cálculo Financeiro

1. **Sempre use `get_portfolio_snapshot()`** de `core/computed.py` como fonte — nunca recalcule patrimônio do zero.
2. **Novos campos de moeda**: se precisar de uma nova moeda (ex: GBP), adicionar em `_fator()` em `computed.py` E nas taxas do yfinance (ex: `GBPBRL=X`).
3. **Novos ETFs de RF em USD**: adicionar o ticker em `renda_fixa_usd` em `logic.py` E em `_RF_SETORES` em `Home.py` E em `_RF_SETORES` em `computed.py`.
4. **O contexto do agente usa `market_value_brl` e `day_pnl_brl`** — não use `market_value` ou `day_pnl_r` no contexto (eles estão em moeda nativa, não BRL).
5. **`build_market_snapshot()`** em `core/agent/context_builder.py` é o único lugar que formata dados para o Gemini — qualquer ajuste de como o agente vê os números vai aqui.
