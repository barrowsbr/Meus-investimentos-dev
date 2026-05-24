# Novo Projeto: Meus Investimentos (React + FastAPI)

**Status:** 🚀 Pronto para desenvolvimento  
**Autor do briefing:** Lucas (proprietário)  
**Data:** Maio 2026

---

## Executive Summary

**Objetivo:** Substituir aplicação Streamlit por **React (frontend) + FastAPI (backend)** hospedado em **Vercel + render.com**.

**Resultado final:** Aplicação web moderna, responsiva, com mesma funcionalidade do projeto atual mas arquitetura separada, código mais limpo e deployment profissional.

**Reutilização:** ~95% da lógica Python pode ser reutilizada com refatoração mínima.

---

## Stack

| Layer | Tecnologia | Detalhe |
|-------|------------|--------|
| **Frontend** | React 18 + Vite | Single Page App, TypeScript |
| **UI Framework** | Tailwind CSS + ShadcN UI | Componentes prontos |
| **State** | Zustand + TanStack Query | State management simples |
| **Deploy Frontend** | Vercel | Auto CI/CD no push |
| **Backend** | FastAPI (Python) | REST API async |
| **Deploy Backend** | render.com / railway | Dyno free tier |
| **Database** | Google Sheets (mesma) | Via gspread API |
| **Market Data** | yFinance | Preços ao vivo |
| **IA** | Gemini API | Chat (mesmo que antes) |

---

## Funcionalidades Principais (11 abas)

1. **Home** — Dashboard de patrimônio + top gainers + radar
2. **Investimentos** — Carteira, RV, RF, Proventos, Câmbio
3. **Performance** — Retorno total, attribution, benchmark
4. **Performance Advanced** — Drawdown, rolling returns, Sharpe
5. **Finanças Pessoais** — Orçamento, assinaturas, parcelamentos
6. **Histórico Patrimonial** — Evolução anual de patrimônio
7. **Impostos** — IR estimado (mês/ano)
8. **Câmbio** — Exposição de moedas, histórico de operações
9. **Notícias** — Feed de notícias financeiras
10. **Agente IA** — Chat com Gemini
11. **Configurações** — Preferências, theme, export/import

---

## Arquitetura em Alto Nível

```
                ┌─────────────────┐
                │  React App      │ (Vercel)
                │  Vite + Tailwind│
                └────────┬────────┘
                         │
                    HTTP API
                         │
        ┌────────────────┴────────────────┐
        │                                 │
   ┌────▼────────┐             ┌─────────▼──┐
   │  FastAPI    │             │ yFinance   │
   │  (render)   │────────────▶│ (live)     │
   └────┬────────┘             └────────────┘
        │
        │ ┌─────────────────┐
        │ │ Google Sheets   │
        └─│ (gdados)        │
          │ (mesma de antes)│
          └─────────────────┘
```

---

## Fases de Desenvolvimento

### FASE 1: Setup (2-3 dias)
- [ ] Criar repo `meus-investimentos-app` (React)
- [ ] Criar repo `meus-investimentos-api` (Python)
- [ ] Setup Vercel e render.com
- [ ] Configurar .env e secrets
- [ ] GitHub Actions CI/CD

### FASE 2: Backend Core (1-2 semanas)
- [ ] Modelos Pydantic (Posicao, Portfolio, Performance, etc.)
- [ ] Migrar `core/logic.py` (setores)
- [ ] Migrar `core/computed.py` (cálculos)
- [ ] Implementar `services/gsheets_service.py`
- [ ] Implementar `services/market_service.py`
- [ ] Rotas básicas: `/api/portfolio`, `/api/performance`

### FASE 3: Frontend Setup (3-5 dias)
- [ ] Vite + React + TypeScript
- [ ] Tailwind + ShadcN componentes
- [ ] Router (React Router v6)
- [ ] Context + Zustand para state
- [ ] Cliente HTTP (fetch wrapper)

### FASE 4: Páginas (2-3 semanas)
- [ ] Home.tsx
- [ ] Investimentos.tsx (com abas)
- [ ] Performance.tsx
- [ ] Financas.tsx
- [ ] HistoricoPatrimonial.tsx
- [ ] Demais páginas

### FASE 5: Backend Rotas Completas (1 semana)
- [ ] Todas as 15+ rotas
- [ ] Cache com TTL
- [ ] Error handling
- [ ] Testes unitários

### FASE 6: Integração & Deploy (1 semana)
- [ ] Testes E2E
- [ ] Otimizações performance
- [ ] Deploy staging
- [ ] Deploy produção

---

## Código a Reutilizar (Backend)

Copiar direto, com ajustes mínimos:

```
✅ core/logic.py                    → backend/app/core/logic.py
✅ core/computed.py                 → backend/app/services/portfolio_service.py
✅ core/performance/*.py            → backend/app/services/performance_service.py
✅ core/data/gsheets.py            → backend/app/services/gsheets_service.py
✅ core/data/market.py             → backend/app/services/market_service.py
✅ core/agent/gemini_client.py     → backend/app/services/gemini_service.py
```

**Remover:**
```
❌ Home.py, pages/*.py
❌ core/theme.py
❌ core/ui.py, core/ui_config.py
```

---

## Endpoints API (Backend)

### Portfolio
```
GET /api/portfolio                    # Portfolio completo
GET /api/portfolio/posicoes           # Posições abertas
GET /api/portfolio/setores            # Alocação por setor
```

### Performance
```
GET /api/performance?period=1y        # Retorno, sharpe, sortino
GET /api/performance/attribution      # Attribution por setor
GET /api/performance/drawdown         # Série de drawdown
```

### Investimentos
```
GET /api/investimentos/renda-variavel # RV com performance
GET /api/investimentos/renda-fixa     # RF com taxas
GET /api/investimentos/proventos      # Histórico dividendos
GET /api/investimentos/cambio         # Exposição + histórico
```

### Finanças Pessoais
```
GET /api/financas/orcamento           # Mês atual
GET /api/financas/assinaturas         # Ativas
GET /api/financas/parcelamentos       # Em aberto
```

### Histórico
```
GET /api/historico/patrimonial?anos=2020,2021   # Evolução anual
GET /api/impostos/estimado?ano=2025             # IR estimado
```

### Notícias & IA
```
GET /api/news                         # Feed de notícias
POST /api/agent/chat                  # Chat com Gemini
```

---

## Estrutura de Dados Principal

### Frontend Types
```typescript
interface Posicao {
  ticker: string;
  setor: string;
  qtd: number;
  pm: number;
  precoAtual: number;
  marketValueBRL: number;
  dayPnLBRL: number;
  totalPnLBRL: number;
  moeda: string;
}

interface Portfolio {
  totalPatrimonioBRL: number;
  rvPatrimonioBRL: number;
  rfPatrimonioBRL: number;
  posicoes: Posicao[];
  setores: SetorAlocacao[];
}
```

### Backend Models (Pydantic)
```python
class Posicao(BaseModel):
    ticker: str
    setor: str
    qtd: float
    pm: float
    preco_atual: float
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

## Planejamento de Migraçõ

### Durante Desenvolvimento
- App Streamlit continua rodando (backup)
- Novo app (React) em staging

### Após Lançamento Beta
- Ambas as versões rodam em paralelo (opcional)
- Usuário pode testar React
- Feedback coletado

### Descontinuação Streamlit
- Após 2-4 semanas de estabilidade, descontinuar Streamlit
- Dados já estão em Google Sheets (não há perda)

---

## Dependências Principais

### Backend (`requirements.txt`)
```
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
gspread==5.12.0
google-auth==2.25.2
yfinance==0.2.32
google-generativeai==0.3.1
python-dotenv==1.0.0
aiohttp==3.9.1
```

### Frontend (`package.json`)
```json
"react": "^18.2.0",
"react-router-dom": "^6.20.0",
"@tanstack/react-query": "^5.25.0",
"zustand": "^4.4.0",
"@shadcn/ui": "latest",
"tailwindcss": "^3.3.6",
"recharts": "^2.10.0",
"axios": "^1.6.0"
```

---

## Deploy

### Frontend
- **Repositório:** meus-investimentos-app
- **Host:** Vercel
- **CI/CD:** Automático no push (branch main)
- **URL:** `https://meus-investimentos.vercel.app`

### Backend
- **Repositório:** meus-investimentos-api
- **Host:** render.com (ou railway.app, fly.io)
- **CI/CD:** Automático no push (branch main)
- **URL:** `https://api.meus-investimentos.com` (custom domain)
- **Plano:** Free tier (suficiente para uso pessoal)

### Environment Variables
```
BACKEND:
- GOOGLE_CREDENTIALS_JSON (service account JSON)
- GEMINI_API_KEY
- FRONTEND_URL (para CORS)

FRONTEND:
- VITE_API_URL (https://api.meus-investimentos.com)
```

---

## Próximas Melhorias (Pós-Lançamento)

1. Mobile app nativo (React Native / Flutter)
2. PWA (offline mode)
3. Notificações push (dividendos)
4. Export PDF / Excel automático
5. Multi-usuário com compartilhamento
6. Backtesting UI interativo
7. Migração para PostgreSQL (se scale necessário)

---

## Observações Importantes

### Performance
- Cache em memória para preços (5-10 min)
- Cache para Sheets (15-30 min)
- Bundle React < 200KB gzip
- API response time < 200ms

### Segurança
- HTTPS everywhere
- Validação com Pydantic
- Rate limiting
- Secrets em variáveis de ambiente

### Escalabilidade
- Backend preparado para multi-usuário (add user_id nas tabelas)
- Frontend com code-splitting por rota
- Database Sheets pode ser migrada para PostgreSQL depois

---

## Checklist de Pré-Desenvolvimento

- [ ] Confirmação de stack (React + FastAPI)
- [ ] Confirmação de deploy (Vercel + render.com)
- [ ] Google Sheets API ativa
- [ ] Gemini API key obtida
- [ ] GitHub repos criados
- [ ] CI/CD pipelines configurados
- [ ] .env templates prontos

---

## Estimativa de Esforço

- **Setup:** 2-3 dias
- **Backend:** 10-12 dias
- **Frontend:** 12-14 dias
- **Integração/Deploy:** 5-7 dias
- **Ajustes/Testes:** 5-7 dias

**Total:** 4-6 semanas de desenvolvimento contínuo

---

## Contato

Dúvidas sobre o projeto? Consulte:
1. `PROJETO_RESUMO.md` (documentação detalhada)
2. Código atual em `app/` (referência)
3. `CLAUDE.md` (design system visual)

---

**Pronto para começar? Siga a FASE 1 do `PROJETO_RESUMO.md`**
