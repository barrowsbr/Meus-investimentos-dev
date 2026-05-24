# Meus Investimentos — Instrução de Implementação para Nova Arquitetura

## ⚠️ LEIA ISTO PRIMEIRO

Este documento é uma **instrução de implementação** para uma IA construir uma **versão completamente nova** do projeto Meus Investimentos. 

**O projeto atual (Streamlit) será SUBSTITUÍDO integralmente por:**
- **Frontend:** React com componentes modernos (ShadcN UI / Tailwind), hospedado no Vercel
- **Backend:** Python (FastAPI ou similar), rodando como API separada
- **Database:** Mesma fonte (Google Sheets `gdados`), acessada via backend
- **Deploy:** Frontend em Vercel, Backend em render.com / railway / fly.io

**Este é um guia de construção, não um resumo.** Executar este documento significa iniciar o desenvolvimento do novo app do zero.

---

## 🎯 O Que o Projeto ATUAL Faz (Streamlit)

Aplicação Streamlit de gestão e análise de portfólio de investimentos pessoal. Centraliza todas as operações financeiras (ações, ETFs, FIIs, renda fixa, cripto, câmbio, proventos, impostos) e fornece dashboards de performance, patrimônio patrimonial, proventos e evolução histórica.

**Stack atual (será descontinuado):** Streamlit (frontend) + Python (backend monolítico) + Google Sheets (DB) + yFinance (preços ao vivo) + Gemini API (agente IA)

---

## 🏗️ ARQUITETURA DO NOVO PROJETO

### 1. Repository Frontend (React + Vercel)

**Nome sugerido:** `meus-investimentos-app`

```
meus-investimentos-app/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MainLayout.tsx
│   │   ├── cards/
│   │   │   ├── NavCard.tsx
│   │   │   ├── ExpandableCard.tsx
│   │   │   └── MetricCard.tsx
│   │   ├── charts/
│   │   │   ├── PortfolioRadar.tsx
│   │   │   ├── PerformanceChart.tsx
│   │   │   └── TickerTape.tsx
│   │   └── common/
│   │       ├── Loading.tsx
│   │       ├── ErrorBoundary.tsx
│   │       └── Badge.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Investimentos.tsx
│   │   ├── Performance.tsx
│   │   ├── PerformanceAdvanced.tsx
│   │   ├── Financas.tsx
│   │   ├── HistoricoPatrimonial.tsx
│   │   ├── Cambio.tsx
│   │   ├── Impostos.tsx
│   │   ├── Noticias.tsx
│   │   ├── Configuracoes.tsx
│   │   └── AgentIA.tsx
│   ├── hooks/
│   │   ├── usePortfolio.ts
│   │   ├── useMarketData.ts
│   │   └── usePerformance.ts
│   ├── context/
│   │   └── PortfolioContext.tsx
│   ├── services/
│   │   └── api.ts                    # Client HTTP para backend
│   ├── styles/
│   │   ├── globals.css
│   │   ├── theme.css                 # Tema dark + glassmorphism (migrado)
│   │   └── animations.css
│   ├── types/
│   │   └── index.ts                  # Types TypeScript
│   ├── utils/
│   │   ├── formatters.ts
│   │   └── calculations.ts
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── logos/
│   └── icons/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── vercel.json
```

**Tech Stack:**
- React 18+ com Vite
- TypeScript
- Tailwind CSS + ShadcN UI
- TanStack Query (React Query) para data fetching
- Zustand para state management
- Chart.js / Recharts para gráficos
- Deploy: Vercel (automatic CI/CD on push)

---

### 2. Repository Backend (Python + FastAPI)

**Nome sugerido:** `meus-investimentos-api`

```
meus-investimentos-api/
├── app/
│   ├── main.py                       # FastAPI app entry
│   ├── config.py                     # Environment, settings
│   ├── dependencies.py               # Injeções de dependência
│   ├── routers/
│   │   ├── portfolio.py              # GET /api/portfolio
│   │   ├── performance.py            # GET /api/performance
│   │   ├── market.py                 # GET /api/market/prices
│   │   ├── financas.py               # GET /api/financas
│   │   ├── cambio.py                 # GET /api/cambio
│   │   ├── proventos.py              # GET /api/proventos
│   │   ├── impostos.py               # GET /api/impostos
│   │   ├── historico.py              # GET /api/historico
│   │   ├── news.py                   # GET /api/news
│   │   └── agent.py                  # POST /api/agent/chat
│   ├── models/
│   │   ├── portfolio.py
│   │   ├── performance.py
│   │   ├── financas.py
│   │   └── schemas.py
│   ├── services/
│   │   ├── gsheets_service.py        # Leitor Google Sheets (mesmo código atual)
│   │   ├── market_service.py         # yFinance (mesmo código atual)
│   │   ├── portfolio_service.py      # Cálculos (migrado de computed.py)
│   │   ├── performance_service.py    # TWR, MWR, attribution
│   │   ├── financas_service.py       # Orçamento, assinaturas
│   │   ├── news_service.py           # Feed de notícias
│   │   └── gemini_service.py         # Chat com IA
│   ├── core/
│   │   ├── logic.py                  # Classificação setorial (migrado)
│   │   ├── finance.py                # Helpers financeiros
│   │   ├── utils.py
│   │   └── constants.py
│   └── utils/
│       ├── cache.py                  # In-memory cache com TTL
│       └── validators.py
├── tests/
│   ├── test_portfolio.py
│   ├── test_performance.py
│   └── test_market.py
├── requirements.txt
├── .env.example
├── docker-compose.yml                # Para desenvolvimento local
├── Dockerfile
└── Railway/Render config
```

**Tech Stack:**
- FastAPI (async Python web framework)
- Pydantic para validação
- gspread + google-auth para Sheets API
- yfinance para preços
- google-generativeai para Gemini API
- Redis (opcional) para cache
- Deploy: render.com / railway.app / fly.io (free tier)

---

### 3. Estrutura de Dados Compartilhada (Protobuf / JSON)

Ambas as aplicações (frontend e backend) usam a **mesma estrutura de dados**, definida em types/schemas compartilhados:

```typescript
// Frontend: src/types/index.ts
export interface Portfolio {
  totalPatrimonioBRL: number;
  rvPatrimonioBRL: number;
  rfPatrimonioBRL: number;
  posicoes: Posicao[];
  setores: SetorAlocacao[];
}

export interface Posicao {
  ticker: string;
  setor: string;
  qtd: number;
  pm: number;
  pmBRL: number;
  precoAtual: number;
  marketValue: number;
  marketValueBRL: number;
  dayPnLBRL: number;
  totalPnLBRL: number;
  moeda: string;
}

export interface Performance {
  retornoTotal: number;
  retornoAnualizado: number;
  drawdownMax: number;
  sharpeRatio: number;
  sortinoRatio: number;
}
```

```python
# Backend: app/models/portfolio.py
from pydantic import BaseModel

class Posicao(BaseModel):
    ticker: str
    setor: str
    qtd: float
    pm: float
    pm_brl: float
    preco_atual: float
    market_value: float
    market_value_brl: float
    day_pnl_brl: float
    total_pnl_brl: float
    moeda: str

class Portfolio(BaseModel):
    total_patrimonio_brl: float
    rv_patrimonio_brl: float
    rf_patrimonio_brl: float
    posicoes: List[Posicao]
    setores: List[SetorAlocacao]
```

---

## Fonte de Dados Única (IDÊNTICA AO PROJETO ATUAL)

**Google Sheets `gdados`** — todas as transações e configurações em abas estruturadas:
- `meus_ativos` — compras/vendas de ações, ETFs, FIIs, cripto
- `meus_proventos` — dividendos, JCP, rendimentos
- `renda_fixa` — transações de títulos (Tesouro, CDB, LCI)
- `fixa_aberta` — snapshot manual do saldo atual de RF
- `cambio` — operações de câmbio / transferências internacionais
- `composicao` — alocação de ETFs (pesos)
- `lb_historic` — patrimônio histórico por instituição/ano
- `financas_pessoal` — orçamento mensal (receitas, despesas, cartão, poupança)
- `financas_assinaturas` — assinaturas recorrentes
- `financas_parcelamentos` — compras parceladas
- `p_tax` — cotações PTAX históricas (opcional)

---

## 📡 API Endpoints (Backend FastAPI)

Todas as rotas retornam JSON. Frontend faz chamadas via `fetch()` ou TanStack Query.

### Portfolio
- `GET /api/portfolio` → Portfolio completo (posições, totais, setores)
- `GET /api/portfolio/posicoes` → Apenas posições abertas
- `GET /api/portfolio/setores` → Alocação por setor

### Performance
- `GET /api/performance?period=1y` → TWR, MWR, sharpe, sortino
- `GET /api/performance/attribution` → Attribution por setor/ativo
- `GET /api/performance/drawdown` → Série de drawdown máximo

### Market Data
- `GET /api/market/prices?tickers=PETR4.SA,ITUB4.SA` → Preços ao vivo
- `GET /api/market/fx` → Taxas de câmbio atualizadas

### Investimentos
- `GET /api/investimentos/renda-variavel` → RV com performance
- `GET /api/investimentos/renda-fixa` → RF com taxas e prazos
- `GET /api/investimentos/proventos?limit=50` → Histórico de dividendos
- `GET /api/investimentos/cambio` → Exposição cambial + histórico

### Finanças Pessoais
- `GET /api/financas/orcamento` → Mês atual
- `GET /api/financas/assinaturas` → Recorrentes ativas
- `GET /api/financas/parcelamentos` → Em aberto

### Histórico e Impostos
- `GET /api/historico/patrimonial?anos=2020,2021,2022` → Evolução anual
- `GET /api/impostos/estimado?ano=2025` → IR estimado

### Notícias e IA
- `GET /api/news` → Feed de notícias financeiras
- `POST /api/agent/chat` → Chat com Gemini

**Exemplo de chamada:**
```typescript
// Frontend
const response = await fetch('/api/portfolio', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const portfolio = await response.json();
```

---

## 🎨 Interface do Novo Projeto (React)

### Home
- Header com nome do app + avatar do usuário
- Cards de navegação (ShadcN styled, não Streamlit)
- Patrimônio em destaque (grande metric card)
- Ticker tape animado com top gainers/losers
- Radar de alocação (Chart.js / Recharts)
- Últimos proventos recebidos
- Menu inferior fixo (ícones de navegação)

### Investimentos
- Abas: Carteira | RV | RF | Proventos | Câmbio | Importador
- Tabelas responsivas com sorting e filtragem
- Gráficos de performance por setor
- Modais para detalhe de posição

### Financas
- Cards de entrada/saída mês
- Gráfico de fluxo de caixa
- Lista de assinaturas com badge de ativa/inativa
- Tabela de parcelamentos com contador

### Performance
- Gráfico de curva de patrimônio acumulado
- Benchmark vs. carteira
- Métricas em cards: retorno, Sharpe, drawdown
- Attribution table por setor

### Histórico Patrimonial
- Gráfico stacked area (evolução anual por instituição)
- Tabela interativa com anos como colunas

### Configurações
- API key do Gemini (se aplicável)
- Preferência de moeda exibição
- Tema (dark só, por enquanto)
- Exportar/importar configurações

---

## 📋 Principais Seções (Referência do Projeto Atual)

### 1. **Home** (Dashboard Principal)
- Cards de navegação com glassmorphism e acentos temáticos (bege, creme)
- Patrimônio total (RV + RF)
- Ticker tape de top gainers/losers do dia
- Principais holdings (top 10)
- Radar de alocação setorial
- Últimos proventos

### 2. **Investimentos** (1_Investimentos.py)
- **Carteira**: posições abertas com PM, variação do dia, PnL total
- **Renda Variável**: ações, ETFs, FIIs, cripto — agrupados por setor
- **Renda Fixa**: títulos, CDBs, aplicações (com taxa de juros)
- **Proventos**: histórico de dividendos, JCP, rendimentos
- **Câmbio**: exposição cambial atual + histórico de operações
- **Importador B3**: sincroniza com notas de corretagem

### 3. **Finanças Pessoais** (2_Finanças.py)
- Orçamento mensal: entrada vs. saída
- Assinaturas recorrentes
- Parcelamentos em aberto
- Fluxo de caixa previsto

### 4. **Performance** (3_Performance.py)
- Retorno total desde inception
- Benchmark vs. IBOV/S&P500
- Decomposição de retorno (preço, dividendo, câmbio, taxa)
- Attribution analysis por setor/ativo
- Cálculo de TWR (True Weighted Return) e MWR (Money Weighted Return)

### 5. **Performance Advanced** (10_Performance_Advanced.py)
- Análise de drawdown
- Rolling returns
- Risco/retorno por período
- Cálculos de Sharpe, Sortino

### 6. **Histórico Patrimonial** (6_Historico_Patrimonial.py)
- Evolução anual do patrimônio por instituição
- Gráfico de stacked area

### 7. **Arquitetura** (7_Arquitetura.py)
- Diagrama de fluxo de dados
- Documentação de estrutura

### 8. **Notícias** (11_Noticias.py)
- Feed de notícias financeiras relevantes
- Agente IA que comenta portfólio vs. notícias

### 9. **Agente IA** (9_Agente_IA.py)
- Chat com Gemini sobre a carteira
- Contexto: snapshot em tempo real + histórico de transações
- Cálculos de alocação, IR, projeções

---

---

## 🚀 CHECKLIST DE IMPLEMENTAÇÃO

### FASE 1: Setup Inicial

- [ ] Criar repositório `meus-investimentos-app` (frontend)
- [ ] Criar repositório `meus-investimentos-api` (backend)
- [ ] Setup environment variables (.env para ambos)
- [ ] Configurar Vercel para frontend
- [ ] Configurar render.com/railway/fly.io para backend
- [ ] Setup GitHub Actions para CI/CD
- [ ] Criar Google Sheets service account (reusar do projeto atual)
- [ ] Registrar Gemini API key (reusar do projeto atual)

### FASE 2: Backend Core (FastAPI)

- [ ] Setup FastAPI + Pydantic
- [ ] Implementar modelos de dados (Portfolio, Posicao, Performance, etc.)
- [ ] Migrar `core/logic.py` (classificação setorial)
- [ ] Migrar `core/computed.py` (cálculos de patrimônio)
- [ ] Migrar `core/performance/*` (TWR, MWR, attribution)
- [ ] Implementar `services/gsheets_service.py` (com cache)
- [ ] Implementar `services/market_service.py` (yFinance)
- [ ] Implementar `services/portfolio_service.py` (orquestrador)
- [ ] Implementar rotas básicas: `/api/portfolio`, `/api/performance`
- [ ] Adicionar CORS para frontend em desenvolvimento
- [ ] Testes unitários dos serviços

### FASE 3: Frontend Setup (React + Vite)

- [ ] Criar projeto Vite com React + TypeScript
- [ ] Configurar Tailwind + ShadcN UI
- [ ] Criar layout base: Header, Sidebar, MainLayout
- [ ] Setup context/hooks para state management (Zustand)
- [ ] Implementar cliente HTTP (fetch wrapper com erro handling)
- [ ] Setup TanStack Query para caching/sincronização
- [ ] Criar base de tipos TypeScript (espelhando backend)

### FASE 4: Páginas Frontend

- [ ] **Home.tsx** — Dashboard principal
  - Patrimônio em cards
  - Ticker tape (animado)
  - Radar de alocação
  - Links para seções principais
  
- [ ] **Investimentos.tsx** — Com abas
  - Carteira (tabela responsiva)
  - Renda Variável (agrupado por setor)
  - Renda Fixa (com taxas)
  - Proventos (histórico)
  - Câmbio (exposição + histórico)
  
- [ ] **Performance.tsx**
  - Gráfico de curva de patrimônio
  - Benchmark vs. carteira
  - Attribution table
  - Métricas em cards
  
- [ ] **PerformanceAdvanced.tsx**
  - Drawdown máximo (série temporal)
  - Rolling returns
  - Sharpe / Sortino
  
- [ ] **Financas.tsx**
  - Orçamento mensal (entrada vs. saída)
  - Assinaturas recorrentes
  - Parcelamentos em aberto
  
- [ ] **HistoricoPatrimonial.tsx**
  - Gráfico stacked area
  - Tabela interativa (anos como colunas)
  
- [ ] **Cambio.tsx**
  - Exposição cambial (USD, EUR, CAD)
  - Histórico de operações
  
- [ ] **Impostos.tsx**
  - IR estimado (mês/ano)
  - Detalhamento por ativo
  
- [ ] **Noticias.tsx**
  - Feed de notícias
  - Tags/filtros por setor
  
- [ ] **AgentIA.tsx**
  - Chat interface
  - Histórico de conversas
  
- [ ] **Configuracoes.tsx**
  - Preferências de tema/moeda
  - API keys (se aplicável)
  - Export/import

### FASE 5: Rotas Backend Completas

- [ ] `POST /api/portfolio` — Atualizar (admin)
- [ ] `GET /api/market/prices` — Preços ao vivo
- [ ] `GET /api/market/fx` — Câmbio atualizado
- [ ] `GET /api/investimentos/renda-variavel`
- [ ] `GET /api/investimentos/renda-fixa`
- [ ] `GET /api/investimentos/proventos`
- [ ] `GET /api/investimentos/cambio`
- [ ] `GET /api/financas/orcamento`
- [ ] `GET /api/financas/assinaturas`
- [ ] `GET /api/financas/parcelamentos`
- [ ] `GET /api/historico/patrimonial`
- [ ] `GET /api/impostos/estimado`
- [ ] `GET /api/news`
- [ ] `POST /api/agent/chat` (Gemini)

### FASE 6: Integração e Deploy

- [ ] Testes E2E (Playwright / Cypress)
- [ ] Deploy backend (render.com / railway)
- [ ] Deploy frontend (Vercel)
- [ ] Testes de carga / performance
- [ ] Otimização de imagens e assets
- [ ] Setup de monitoramento (Sentry, LogRocket)
- [ ] Documentação de deployment

### FASE 7: Melhorias Pós-Lançamento

- [ ] Mobile-first refinement
- [ ] PWA (offline mode)
- [ ] Notificações push (dividendos, alerts)
- [ ] Export PDF / Excel
- [ ] Backtesting UI
- [ ] Multi-usuário / compartilhamento
- [ ] Dark/Light theme toggle (se desejado)

---

## 🔄 Reutilização do Código Atual

**Código a ser MIGRADO (reutilizável):**
- ✅ `core/logic.py` → `backend/app/core/logic.py` (sem mudanças)
- ✅ `core/computed.py` → `backend/app/services/portfolio_service.py` (refatorado em métodos)
- ✅ `core/performance/*` → `backend/app/services/performance_service.py`
- ✅ `core/data/gsheets.py` → `backend/app/services/gsheets_service.py`
- ✅ `core/data/market.py` → `backend/app/services/market_service.py`
- ✅ `core/agent/gemini_client.py` → `backend/app/services/gemini_service.py`
- ✅ `core/agent/context_builder.py` → `backend/app/services/context_builder.py`

**Código a ser DESCARTADO:**
- ❌ `Home.py` (UI Streamlit)
- ❌ `pages/*.py` (UI Streamlit)
- ❌ `core/theme.py` (substituto: Tailwind + CSS)
- ❌ `core/ui.py`, `core/ui_config.py` (ShadcN em vez disso)

---

## 🔗 Fluxo de Dados (Novo Projeto)

```
[Google Sheets]
     ↓ (via gspread API)
[Backend FastAPI - gsheets_service]
     ↓ (cache em memória / Redis)
[Backend - portfolio_service]
     ↓ (executa cálculos, chama yFinance)
[Backend - market_service] ← yFinance (preços ao vivo)
     ↓ (JSON)
[Frontend React] ← TanStack Query (caching local)
     ↓
[UI Components - React/Tailwind]
     ↓ (user action: /api/agent/chat)
[Backend - gemini_service] ← Gemini API
     ↓
[Frontend - AgentIA page]
```

**Importante:** Adicionar **cache com TTL** para:
- Preços de mercado (5-10 minutos)
- Dados do Sheets (15-30 minutos)
- Câmbio (10 minutos)
- Performance calculada (30 minutos)

---

## 🎨 Decisões de Design (Novo Projeto)

### Visual (Tailwind + ShadcN)
- **Dark slate** background (via Tailwind: `bg-slate-900`)
- **Glassmorphism** via CSS backdrop-filter
- **Acentos quentes** (bege, creme) em cards temáticos
- **Tipografia Outfit** (Google Fonts) — mesmo que antes
- **Transições 0.4s** cubic-bezier(0.4, 0, 0.2, 1)
- **Responsive first** — mobile, tablet, desktop
- **ShadcN UI** para componentes (Dialog, Tabs, Table, etc.)

### Dados
- **Moedas suportadas:** BRL, USD, EUR, CAD (sem mudanças)
- **Setores definidos:** Ações Brasil, Ações Intl, ETF, FIIs, RF USD, RF, Cripto (sem mudanças)
- **SHV/BIL** = Renda Fixa USD, não contam como RV (sem mudanças)
- **Cripto** não entram em exposição cambial (sem mudanças)

### Performance
- **API response time:** < 200ms (com cache)
- **Frontend bundle:** < 200KB gzip
- **Lighthouse score:** 85+ (performance + accessibility)
- **Carregamento de dados:** Progressive, com skeletons/loaders

### Segurança
- **HTTPS obrigatório** (Vercel + render.com oferecem)
- **CORS configurado** (frontend domain)
- **Rate limiting** no backend (prevent abuse)
- **Input validation** (Pydantic no backend)
- **Não armazenar secrets** no frontend (vars de ambiente)

---

## 📊 Planilhas Google Sheets (SEM MUDANÇAS)

**Planilha:** `gdados` (mesma do projeto atual)

O backend acessa via `gspread` + service account (mesmo que Streamlit atual):

- `meus_ativos` — Transações (compra/venda) de ações, ETFs, FIIs, cripto
- `meus_proventos` — Dividendos, JCP, rendimentos
- `renda_fixa` — Transações de títulos (Tesouro, CDB, LCI)
- `fixa_aberta` — Snapshot manual do saldo RF
- `cambio` — Operações de câmbio / transferências
- `composicao` — Alocação de ETFs (pesos)
- `lb_historic` — Patrimônio histórico por instituição/ano
- `financas_pessoal` — Orçamento mensal
- `financas_assinaturas` — Assinaturas recorrentes
- `financas_parcelamentos` — Compras parceladas
- `p_tax` — Cotações PTAX históricas (opcional)

**Nenhuma mudança estrutural nas abas.** O backend faz o parse e normalização, exatamente como o código Streamlit faz hoje.

---

## 🔧 Configuração Backend

**`app/config.py`**: 
- Google Sheets credentials (reusar service_account.json)
- Gemini API key (reusar do projeto atual)
- Nomes das abas (SHEETS_NAMES)
- CORS origins (frontend URL)
- Cache TTL settings

**`app/.env`** (não commitar):
```
GOOGLE_CREDENTIALS_JSON=<conteúdo completo do JSON>
GEMINI_API_KEY=<key>
FRONTEND_URL=https://meus-investimentos.vercel.app
BACKEND_URL=https://api.meus-investimentos.com
```

**`requirements.txt`** (backend):
```
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
python-dotenv==1.0.0
gspread==5.12.0
google-auth==2.25.2
google-auth-oauthlib==1.2.0
google-auth-httplib2==0.2.0
yfinance==0.2.32
google-generativeai==0.3.1
aiohttp==3.9.1
redis==5.0.0
pytest==7.4.3
```

**`package.json`** (frontend):
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.25.0",
    "zustand": "^4.4.0",
    "@shadcn/ui": "latest",
    "tailwindcss": "^3.3.6",
    "recharts": "^2.10.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "typescript": "^5.3.3",
    "@vitejs/plugin-react": "^4.2.0",
    "@types/react": "^18.2.0"
  }
}
```

---

## 📈 Métricas de Performance (Novo Projeto)

- **Patrimônio Total = RV + RF** (em BRL)
- **Performance Anualizada** (TWR)
- **Drawdown Máximo** desde inception
- **Sharpe / Sortino** (vs. risk-free rate)
- **Alocação por Setor** (%)
- **Exposição Cambial** (USD, EUR, CAD vs. BRL)
- **Proventos Acumulados** (ano/total)
- **IR Estimado** (mês/ano)

---

## 🚀 Timeline de Desenvolvimento Esperado

- **Semana 1-2:** Setup inicial (repos, envs, GitHub Actions)
- **Semana 2-3:** Backend core (models, services, 5 rotas principais)
- **Semana 3-4:** Frontend setup (Vite, Tailwind, ShadcN, context)
- **Semana 4-6:** Implementar páginas principais (Home, Investimentos, Performance)
- **Semana 6-7:** Rotas backend completas
- **Semana 7-8:** Integração, testes E2E, otimizações
- **Semana 8:** Deploy beta (render + Vercel)
- **Semana 9+:** Feedback, ajustes, melhorias pós-lançamento

---

## ⚠️ Notas Importantes

### 1. Reutilização de Código
**99% da lógica de cálculo (Python)** pode ser reutilizada do projeto atual. A maior mudança é:
- Refatorar de "Streamlit UI + lógica monolítica" → "FastAPI routes + serviços desacoplados"
- Migrar de "CSS via st.markdown()" → "Tailwind + ShadcN"
- Remover dependências Streamlit

### 2. Testing
- Backend: testes unitários com `pytest` (cobertura > 80%)
- Frontend: testes com Vitest + React Testing Library
- E2E: Playwright para fluxos críticos

### 3. Observabilidade
- Sentry para error tracking (ambos frontend e backend)
- LogRocket para UX (frontend)
- Vercel analytics (frontend)
- Prometheus metrics (backend, opcional)

### 4. Segurança
- Validação com Pydantic em todas as rotas
- Rate limiting (FastAPI + slowapi)
- CORS restritivo (apenas frontend origin)
- Secrets nunca em código (sempre via .env)

### 5. Escalabilidade Futura
- Backend preparado para multi-usuário (adicionar user_id)
- Frontend: code-splitting por rota (Vite)
- Database: migração de Sheets → PostgreSQL (se necessário)
- Cache: Redis (se load aumentar muito)

---

## 📞 Após Implementação

1. Manter ambos projetos (Streamlit + React) em paralelo durante fase de transição
2. Gradualmente migrar dados/features para novo projeto
3. Descontinuar Streamlit após confirmação de estabilidade
4. Manter documentação atualizada
5. Planejar futuras features (mobile app nativo, PWA, etc.)

---

**Este é um guia de construção. Comece pelo FASE 1 (Setup Inicial) e siga a ordem das fases.**
**Não pule etapas. Cada fase depende da anterior.**

Desenvolvido para gestão pessoal de investimentos. Não é aconselhador financeiro.
