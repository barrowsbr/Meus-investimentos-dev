# Radar Geoeconômico — Documentação de Produto

**Meus Investimentos** · Versão atual · Junho 2026

---

## 1. Visão Geral

O **Radar** é um mapa-múndi interativo que funciona como um centro de comando geoeconômico. A página permite ao investidor visualizar, num único painel, o estado dos mercados globais, o risco por país, as notícias relevantes e como tudo isso se conecta ao seu portfólio pessoal.

A experiência gira em torno de três ações: **ver o mapa**, **clicar num país** e **explorar o dossiê**. O mapa é a interface principal — ele muda de cor conforme a camada ativa (mercados, câmbio ou risco), e clicar em qualquer país abre um painel lateral com seis abas de análise.

**Acesso:** Menu lateral → "Bolsas" (redireciona para `/radar`) ou diretamente `/radar`.

---

## 2. Layout e Navegação

### Desktop (≥768px)

```
┌──────────┬─────────────────────────────────────┐
│          │          Barra Superior              │
│  Rail    │  (título · busca · ⌘K · timestamp)   │
│  230px   ├─────────────────────────────────────┤
│          │                                     │
│ Camadas  │          MAPA-MÚNDI                 │
│ Regiões  │    (choropleth + marcadores)         │
│ Escala   │                                     │
│ Pulso    │                         ┌──────────┐│
│          │                         │ Dossiê   ││
│ Digest   │                         │  380px   ││
│          │                         │ (6 abas) ││
│          │                         └──────────┘│
└──────────┴─────────────────────────────────────┘
```

- **Rail esquerdo (230px):** Controles de camada, filtro de região, legenda de cores e resumo do dia (Digest).
- **Mapa central:** Ocupa todo o espaço restante. Zoom com scroll, arrastar para mover.
- **Dossiê direito (380px):** Desliza a partir da direita quando um país é selecionado.

### Mobile (<768px)

```
┌─────────────────────────┐
│   Barra Superior        │
├─────────────────────────┤
│ [Mercados][Câmbio][Risco]│  ← pills horizontais
├─────────────────────────┤
│                         │
│      MAPA-MÚNDI         │
│   (tela cheia)          │
│                         │
└─────────────────────────┘
     ↓ ao clicar país ↓
┌─────────────────────────┐
│ 🇧🇷 Brasil        [X]   │  ← header + fechar
│ [Resumo][Intel][Merc]...│  ← abas
├─────────────────────────┤
│                         │
│  Conteúdo da aba        │
│  (scroll vertical)      │
│                         │
└─────────────────────────┘
```

- Rail desaparece; controles viram **pills horizontais** acima do mapa.
- O dossiê abre como **modal de tela cheia** (não painel lateral).
- Botão de fechar: 44×44px com fundo visível, acessível abaixo do notch.
- Padding inferior para não ficar atrás da barra de navegação do app.

---

## 3. O Mapa

### Aparência

- Fundo: gradiente radial escuro (azul-marinho para quase-preto).
- Projeção Mercator centrada na Europa/África, mostrando todos os continentes.
- Países colorizados por **choropleth** — a cor muda conforme a camada ativa.

### Camadas disponíveis

| Camada | O que colore o mapa | Escala |
|--------|--------------------|----|
| **Mercados** | Variação % do principal índice do país | Vermelho (−4%) → Amarelo (0%) → Verde (+4%) |
| **Câmbio** | Força da moeda local vs USD | Vermelho (enfraquecendo) → Verde (fortalecendo) |
| **Instabilidade** | *Planejado mas ainda não implementado visualmente* | — |

### Marcadores

Sobre o mapa, cada praça financeira ganha um **ponto circular**:
- Cor externa = região geográfica (Américas = azul, Europa = roxo, Ásia = âmbar, etc.)
- Ponto central = verde se positivo, vermelho se negativo
- Na camada Câmbio, o código da moeda aparece como rótulo acima do ponto

### Interações

- **Hover:** Tooltip mostra bandeira, nome do país, índice/moeda e variação %.
- **Clique:** Abre o dossiê do país.
- **Scroll:** Zoom (1× a 8×).
- **Arrastar:** Pan livre.
- **Filtro de região:** Ao ativar, marcadores fora da região ficam com 10% de opacidade.

### Controles de Zoom

Três botões no canto superior direito: Aproximar, Afastar, Resetar. Fundo semi-transparente escuro.

---

## 4. Barra Superior

Exibe:
- Ícone do Radar e título "Radar"
- Subtítulo (desktop): "Mapa como produto · clique num país para o dossiê"
- **Horário da última atualização** com ponto verde pulsante
- **Campo de busca** de países (dropdown com até 8 resultados)
- **Botão ⌘K** para abrir o Command Palette

---

## 5. Command Palette (⌘K)

Modal de busca por teclado, inspirado no VS Code / Spotlight:

- **Atalho:** Cmd+K (Mac) ou Ctrl+K (Windows/Linux)
- **Busca fuzzy** por nome de país, camada ou ação
- **Navegação por teclado:** ↑↓ para navegar, Enter para selecionar, Esc para fechar
- **Categorias:** "Camadas" (3 opções) e "Países" (50+ opções)
- Máximo de 12 resultados visíveis por vez

---

## 6. Dossiê do País — As 6 Abas

Ao selecionar um país, o dossiê abre com as seguintes abas:

### 6.1 Resumo

A aba padrão. Oferece um panorama rápido:

1. **Alerta de Convergência** (se ativo + usuário tem exposição):
   - Caixa vermelha avisando que múltiplos sinais de risco convergem naquele país
   - Mostra o valor em R$ e % do portfólio exposto
   - Lista os tickers afetados

2. **Exposição** (se não há alerta):
   - Caixa verde mostrando quanto o usuário tem investido naquele país

3. **Leitura do Dia:**
   - Texto sintético gerado automaticamente: tom da sessão (positiva/negativa/estável), destaque do dia, variação cambial
   - Exemplo: *"sessão positiva nos mercados locais (média +1.84%); destaque PHLX Semiconductor (+6.42%); USD valorizou 0.00% vs USD"*

4. **Chips de Síntese:**
   - Mercado local (média %), Câmbio vs USD, Crescimento PIB, Inflação CPI
   - Cores: verde se positivo, vermelho se negativo

5. **Calendário de Performance (Heatmap):**
   - Grade 7×7 (seg a dom) com as últimas semanas
   - Cada célula colorida pela intensidade da variação (verde/vermelho)
   - Legenda de gradiente: −3% a +3%

6. **Contexto Global (Bubble Scatter):**
   - Gráfico de bolhas: eixo X = % do portfólio exposto, eixo Y = retorno do dia
   - Tamanho da bolha = valor em R$
   - País atual destacado com borda branca

### 6.2 Inteligência (Intel)

Aba de análise profunda com IA e índice de risco:

1. **Leitura IA:**
   - Briefing de 3-4 frases gerado por IA (Gemini/GPT/DeepSeek)
   - Cobre: conjuntura econômica, política/geopolítica, câmbio, fatores externos
   - Mostra o modelo usado (ex: "Gemini 2.5 Pro")
   - Cache: 12 horas

2. **Índice de Instabilidade:**
   - Score composto de 0 a 100, classificado em:
     - **Baixo** (<20) — verde
     - **Moderado** (20-45) — amarelo
     - **Elevado** (45-70) — laranja
     - **Crítico** (≥70) — vermelho

   - **Spider Chart:** Polígono radar mostrando 4 dimensões de risco
   - **Gauge Cluster:** Mini-gauges semicirculares para cada dimensão + total
   - Data da última atualização

3. **Sinais de Convergência** (se ≥2 sinais):
   - Lista de sinais ativos com ícone de intensidade
   - Exemplo: "Instabilidade elevada", "Moeda enfraquecendo", "Mercado em queda"

### 6.3 Mercados

Detalhes dos mercados financeiros do país:

1. **Ranking do Dia:**
   - Gráfico de barras horizontais, ordenado por performance
   - Cada barra: posição, bandeira, nome do índice, variação %, preço atual
   - Cores graduadas: verde intenso (>1.5%) até verde pálido, ou vermelho intenso até pálido

2. **Últimos Dias (Horizon Chart):**
   - Faixas compactas de cor para os últimos 7 dias
   - Uma linha para o índice, outra para o câmbio
   - Cores de verde (alta) a vermelho (queda), com intensidade proporcional

3. **Moeda Local:**
   - Código e nome da moeda
   - Taxa: 1 USD = X
   - Variação vs USD (verde se valorizou, vermelho se recuou)

### 6.4 Notícias

Duas seções de informação em tempo real:

1. **Sinais Preditivos (Polymarket):**
   - Eventos de mercados de previsão relevantes ao país
   - Cada sinal: título, probabilidade do outcome principal, volume negociado, dias restantes
   - **Linkagem com portfólio:** se o evento pode afetar tickers do usuário, eles aparecem em badges âmbar

2. **Notícias do País:**
   - Artigos recentes do Google News
   - Classificados por impacto: **Alto** (vermelho), **Médio** (amarelo), **Baixo** (cinza)
   - Fonte e tempo desde publicação (ex: "Reuters · 3h")
   - Clique abre o artigo original

### 6.5 Macro

Indicadores macroeconômicos do Banco Mundial:

- Grade de cards: PIB, Inflação, Dívida/PIB, Conta Corrente, etc.
- Cada card: nome do indicador, valor formatado, ano da medição
- Taxa de câmbio local vs BRL (se disponível)
- Link para Trading Economics
- Fonte: World Bank (valor mais recente disponível)

### 6.6 Portfólio

Exposição do portfólio pessoal ao país selecionado:

1. **Card de Exposição:**
   - Valor em R$ e % do portfólio
   - Gráfico circular (arc gauge) mostrando a proporção
   - Tickers investidos naquele país
   - Se sem exposição: mensagem "Você não tem posições neste país"

2. **Treemap (Alocação Geográfica):**
   - Retângulos proporcionais ao valor investido em cada país
   - Top 6 países com tamanhos relativos
   - Cores: verde se performance positiva, vermelho se negativa, neutro se sem dados
   - Total do patrimônio mapeado

3. **Waterfall (Contribuição do Dia):**
   - Barras verticais mostrando quanto cada país contribuiu ao resultado do dia (em R$)
   - Verde para ganhos, vermelho para perdas
   - Barra azul de total com separador tracejado

---

## 7. Digest do Dia (Desktop)

Painel colapsável no rail esquerdo que resume alertas do dia:

1. **Portfólio em Risco:** Países com convergência ativa onde o usuário tem exposição
2. **Maiores Quedas:** Índices que caíram mais de 1.5% no dia
3. **Exposição Global:** Top 6 países por % do portfólio

Clicar num país no Digest abre seu dossiê.

---

## 8. Fontes de Dados e APIs

### APIs Externas

| Fonte | O que fornece | Atualização | Autenticação |
|-------|--------------|-------------|--------------|
| **Yahoo Finance** | Cotações de índices e moedas, histórico de preços | Tempo real (~15min delay) | Sem chave |
| **Google News RSS** | Notícias por país | A cada acesso (cache 30min) | Sem chave |
| **World Bank** | Indicadores macro (PIB, inflação, dívida/PIB) | Anual (cache 24h) | Sem chave |
| **Polymarket** | Eventos de mercados preditivos | A cada acesso | Sem chave |
| **Google Gemini** | Briefing de IA por país | Cache 12h | `GEMINI_API_KEY` |
| **Google Sheets** | Portfólio do usuário (transações, proventos) | Ao abrir a página | `GOOGLE_API_KEY` |

### Cascata de Modelos IA (para o Briefing)

O sistema tenta os modelos na seguinte ordem, pulando para o próximo se houver erro ou rate limit:

1. Gemini 2.5 Pro
2. GPT-4o (OpenAI)
3. Gemini 2.5 Flash
4. DeepSeek V3
5. Gemini 2.5 Flash Lite
6. Llama 3.3 70B (Groq)
7. Gemini 2.0 Flash / Flash Lite

### Rotas Internas do Radar

| Rota | Função | Cache | Timeout |
|------|--------|-------|---------|
| `GET /api/radar/instability?country=X` | Score de instabilidade (0-100) com 4 dimensões | 6h (memória) | — |
| `GET /api/radar/brief?country=X` | Briefing de IA (3-4 frases) | 12h (memória) | 20s |
| `GET /api/radar/news?country=X` | Notícias classificadas por impacto | 30min (ISR) | 15s |
| `GET /api/radar/signals?country=X` | Eventos preditivos do Polymarket | Sem cache | 20s |
| `GET /api/radar/timeline?country=X` | Histórico de 7 dias (índice + câmbio) | 30min | 15s |
| `GET /api/radar/exposure` | Exposição geográfica do portfólio | 15min | 30s |
| `GET /api/bolsas` | Índices globais (140+ praças) | — | — |
| `GET /api/moedas` | Moedas globais (50+ pares) | — | — |

---

## 9. Sistema de Convergência

O Radar monitora automaticamente **5 tipos de sinais de risco** por país. Quando **3 ou mais** sinais estão ativos simultaneamente, o sistema declara uma **"Convergência Ativa"** — alerta visual no dossiê com pulsação laranja.

### Os 5 sinais monitorados:

| Sinal | Condição de ativação | Peso |
|-------|---------------------|------|
| Instabilidade elevada | Score ≥ 45 | — |
| Moeda enfraquecendo | Variação > 1% negativa vs USD | — |
| Mercado em queda | Pior índice do país < −1.5% | — |
| Notícias de alto impacto | ≥ 2 artigos com impacto "alto" | — |
| Sinais preditivos de risco | Evento Polymarket com keywords: war, conflict, sanction, crisis, default | — |

### Visualização:

- **Pulsação laranja** no canto superior da bandeira no header do dossiê
- **Badge "Convergência (N sinais)"** ao lado da região
- **Caixa de alerta vermelha** no Resumo (se o usuário tem exposição ao país)
- **Lista detalhada** na aba Inteligência

---

## 10. Índice de Instabilidade — Como é Calculado

Score composto de 0 a 100, média ponderada de 4 dimensões:

### Dimensão 1: Política / Notícias (25%)
- Fonte: Google News RSS
- Busca keywords de risco: crise, guerra, golpe, sanção, default, inflação recorde
- Score baseado na densidade de keywords encontradas

### Dimensão 2: Fiscal / Macro (30%)
- Fonte: World Bank
- **Dívida/PIB:** >120% = 40pts, >90% = 30pts, >60% = 15pts, senão 5pts
- **Inflação:** >50% = 35pts, >15% = 25pts, >8% = 15pts, >4% = 8pts, senão 3pts
- **Conta Corrente:** < −8% = 25pts, < −4% = 15pts, < 0% = 5pts, senão 0pts
- Total: soma dos três (máx ~100)

### Dimensão 3: Mercado / Volatilidade (25%)
- Fonte: Dados de índices e câmbio
- Combina volatilidade do índice (60%) + volatilidade do câmbio (40%)

### Dimensão 4: Externa / Preditivos (20%)
- Fonte: Polymarket
- Busca eventos com keywords de risco (war, conflict, sanction, crisis, default)
- Score baseado em quantidade de sinais × probabilidade

### Classificação Final:

| Score | Nível | Cor |
|-------|-------|-----|
| 0-19 | Baixo | Verde |
| 20-44 | Moderado | Amarelo |
| 45-69 | Elevado | Laranja |
| 70-100 | Crítico | Vermelho |

---

## 11. Integração com Portfólio

O Radar cruza dados do mapa com o portfólio pessoal do usuário:

### Como a exposição por país é inferida

O sistema lê as transações do Google Sheets e infere o país de cada ativo:

1. **Sufixo do ticker:** `.SA` = Brasil, `.L` = Reino Unido, `.T` = Japão, `.DE` = Alemanha, etc.
2. **ADRs conhecidos:** BABA/PDD/JD = China, TSM = Taiwan, SONY = Japão, ASML = Holanda, etc.
3. **Setor:** "Ações Brasil", "FIIs", "Tesouro" = Brasil; "ETF USA" = EUA
4. **Fallback:** Se nada bater, assume EUA

### Onde a exposição aparece

- **Resumo:** Alerta de convergência mostra R$ expostos + tickers afetados
- **Portfólio:** Card com valor, %, gauge circular, treemap e waterfall
- **Bubble Scatter:** Visualização de exposição × retorno por país
- **Digest:** Lista países em risco onde o usuário tem dinheiro

---

## 12. Gráficos Customizados (SVG Puro)

Todos os gráficos do Radar são **SVG puro em React**, sem dependências de bibliotecas de gráficos:

| Gráfico | Onde aparece | O que mostra |
|---------|-------------|-------------|
| **Spider Chart** | Inteligência | Perfil multidimensional de risco (polígono radar) |
| **Gauge Cluster** | Inteligência | Mini-gauges semicirculares por dimensão + total |
| **Heatmap Calendar** | Resumo | Calendário de performance diária (7×7 grid) |
| **Bubble Scatter** | Resumo | Exposição × retorno por país (bolhas) |
| **Ranking Chart** | Mercados | Barras horizontais dos índices, ordenados por performance |
| **Horizon Chart** | Mercados | Faixas de cor compactas dos últimos 7 dias |
| **Treemap** | Portfólio | Retângulos proporcionais à alocação geográfica |
| **Waterfall** | Portfólio | Contribuição de cada país ao resultado do dia |

### Escala de cores dos gráficos

Os gráficos usam uma escala de 8 degraus (não binária), para que variações pequenas sejam visíveis:

**Para scores (0-100):**
- ≥80: vermelho forte (#ef4444)
- ≥70: vermelho (#f87171)
- ≥60: laranja (#fb923c)
- ≥50: âmbar (#f59e0b)
- ≥40: amarelo (#facc15)
- ≥30: lima (#a3e635)
- ≥20: verde (#4ade80)
- <20: esmeralda (#34d399)

**Para variações %:**
- Alpha contínuo proporcional à magnitude (não degraus discretos)
- Zona neutra estreita (±0.05%) para que valores próximos de zero tenham cor mínima visível

---

## 13. Problemas Conhecidos e Limitações

### Funcionalidades incompletas

| Problema | Descrição | Impacto |
|----------|-----------|---------|
| **Camada de Instabilidade não colore o mapa** | O seletor "Risco" existe, mas o choropleth não repinta com as cores de instabilidade | Alto — a terceira camada é visual mas vazia |
| **Países sem índice não aparecem na camada Mercados** | Só países com índices monitorados no Yahoo Finance têm marcadores | Médio — ~50 países cobertos de 195 |
| **Eurozona sem dados de câmbio na timeline** | Países do Euro não têm par FX separado, então a linha de câmbio fica vazia | Baixo |

### Problemas técnicos

| Problema | Descrição | Impacto |
|----------|-----------|---------|
| **Cache apenas em memória** | Caches de instabilidade e brief vivem na RAM do servidor; reiniciar a instância perde tudo | Médio — causará refetch em cold starts |
| **Self-fetch na instabilidade** | O endpoint de instabilidade chama `/api/bolsas` e `/api/moedas` internamente via HTTP; pode falhar em produção se o servidor estiver sobrecarregado | Médio |
| **Dados macro defasados** | World Bank publica com 1-2 anos de atraso; indicadores mostram dados antigos | Baixo — inevitável pela fonte |
| **Inferência de país limitada** | ADRs e tickers OTC não mapeados caem no fallback "EUA" | Baixo |
| **Parsing de RSS frágil** | Google News RSS é parseado via regex; mudanças no formato podem quebrar silenciosamente | Baixo |

### Limitações de UX

| Problema | Descrição |
|----------|-----------|
| **Sem offline** | Nenhum dado é persistido localmente; tudo depende de conexão |
| **Sem notificações push** | Convergência ativa não gera alerta fora da página |
| **Sem comparação entre países** | Não é possível abrir dois dossiês lado a lado |
| **Sem histórico de instabilidade** | Só mostra o score atual; não há gráfico de evolução do score |

---

## 14. Cobertura de Países

O Radar cobre **50+ países** com dados de mercado e/ou câmbio:

**Américas:** Brasil, EUA, Canadá, México, Argentina, Chile, Colômbia, Peru
**Europa:** Alemanha, Reino Unido, França, Itália, Espanha, Holanda, Suíça, Suécia, Noruega, Dinamarca, Finlândia, Polônia, Portugal, Bélgica, Áustria, Grécia, Irlanda, República Tcheca
**Ásia-Pacífico:** China, Japão, Coreia do Sul, Índia, Taiwan, Hong Kong, Singapura, Indonésia, Malásia, Tailândia, Filipinas, Vietnã, Paquistão
**Oriente Médio:** Arábia Saudita, Israel, Turquia, Catar, Emirados Árabes
**África:** África do Sul, Nigéria, Egito
**Oceania:** Austrália, Nova Zelândia

---

## 15. Paleta de Cores e Design Visual

### Tema

Dark mode exclusivo. Fundos quase-pretos com glassmorphism sutil (bordas brancas 5-10% de opacidade, backgrounds 2-8%).

### Cores por função

| Função | Cor | Hex |
|--------|-----|-----|
| Interativo / Selecionado | Azul | #3b82f6 |
| Positivo / Ganho | Verde | #4ade80 |
| Negativo / Perda | Vermelho | #f87171 |
| Alerta / Convergência | Laranja | #fb923c |
| Moderado | Amarelo | #facc15 |
| Dados / Sinais | Ciano | #06b6d4 |
| IA / Inteligência | Roxo | #9333ea |

### Cores por região geográfica

| Região | Cor |
|--------|-----|
| Américas | Azul (#3b82f6) |
| Europa | Roxo (#8b5cf6) |
| Ásia-Pacífico | Âmbar (#f59e0b) |
| Oriente Médio | Vermelho (#ef4444) |
| África | Teal (#10b981) |
| Oceania | Ciano (#06b6d4) |

---

## 16. Dependências Externas

| Pacote | Uso no Radar |
|--------|-------------|
| `react-simple-maps` | Mapa interativo (choropleth + marcadores) |
| `world-atlas` (CDN) | GeoJSON dos países (110m resolution) |
| `yahoo-finance2` | Cotações e histórico de preços |
| `googleapis` | Leitura do portfólio (Google Sheets) |
| `@google/generative-ai` | API do Gemini para briefings de IA |
| `lucide-react` | Ícones em todo o Radar |
| `tailwindcss` | Sistema de estilos |

Todos os **8 gráficos são SVG customizado** — não usam Recharts nem nenhuma lib de charts.

---

## 17. Fluxo Completo do Usuário

```
1. Usuário abre /radar
   └─ Mapa carrega com camada "Mercados" ativa
   └─ Choropleth pinta países por variação dos índices
   └─ Rail esquerdo mostra controles + Digest (desktop)
   └─ Pills horizontais mostram camadas (mobile)

2. Usuário explora o mapa
   └─ Troca camada: Câmbio mostra força das moedas
   └─ Filtra região: "Europa" destaca só marcadores europeus
   └─ Hover: tooltip com bandeira + nome + variação

3. Usuário seleciona país (clique no mapa, busca, ou ⌘K)
   └─ Dossiê desliza da direita (desktop) ou sobe fullscreen (mobile)
   └─ Aba "Resumo" abre por padrão
   └─ Dados de todas as abas carregam em paralelo em background

4. Usuário navega pelas abas
   └─ Resumo: panorama rápido + calendário + bolhas
   └─ Intel: IA + spider chart + gauges + convergência
   └─ Mercados: ranking + horizon + câmbio
   └─ Notícias: sinais preditivos + manchetes
   └─ Macro: indicadores do World Bank
   └─ Portfólio: exposição + treemap + waterfall

5. Usuário fecha o dossiê
   └─ Clica X, clica fora, ou pressiona Escape
   └─ Dossiê desliza para fora
   └─ Mapa volta ao foco completo

6. Usuário abre Digest (desktop)
   └─ Vê alertas do dia, maiores quedas, exposição global
   └─ Clica num país → abre dossiê daquele país
```

---

*Documento gerado em junho de 2026. Reflete o estado atual da implementação do Radar V2 (Fases 1-4).*
