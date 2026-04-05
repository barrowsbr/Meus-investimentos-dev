"""
main.py
=======
Ponto de entrada do backend FastAPI — Command Center.

Inicia o stub do Streamlit ANTES de qualquer import de core/ para que todos
os módulos de negócio sejam reutilizados sem modificação.
"""
from __future__ import annotations

import sys
import os

# ---------------------------------------------------------------------------
# 1. Injeta stub do Streamlit ANTES de qualquer import de core/
#    Isso neutraliza todas as dependências de UI do Streamlit nos módulos core.
# ---------------------------------------------------------------------------
import app.st_stub as _st_stub

sys.modules["streamlit"] = _st_stub                        # type: ignore
sys.modules["streamlit.components"] = _st_stub             # type: ignore
sys.modules["streamlit.components.v1"] = _st_stub          # type: ignore
sys.modules["streamlit.runtime"] = _st_stub                # type: ignore
sys.modules["streamlit.runtime.scriptrunner"] = _st_stub   # type: ignore

# ---------------------------------------------------------------------------
# 2. Adiciona backend/ ao sys.path para que 'import core.*' funcione
#    core/ agora é parte do backend (não mais referenciado via legado/)
# ---------------------------------------------------------------------------
_HERE    = os.path.dirname(os.path.abspath(__file__))   # backend/app/
_BACKEND = os.path.dirname(_HERE)                       # backend/

if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

# ---------------------------------------------------------------------------
# 3. FastAPI app + CORS
# ---------------------------------------------------------------------------
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import portfolio, finance, performance, news, agent

app = FastAPI(
    title="Command Center API",
    description="Backend FastAPI do sistema de investimentos pessoais.",
    version="1.0.0",
)

# CORS — permite frontend Vercel + localhost dev
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    os.environ.get("FRONTEND_URL", ""),          # ex: https://meus-investimentos-dev.vercel.app
    os.environ.get("VERCEL_URL", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in ALLOWED_ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# 4. Routers
# ---------------------------------------------------------------------------
app.include_router(portfolio.router,   prefix="/api/portfolio",   tags=["portfolio"])
app.include_router(finance.router,     prefix="/api/finance",     tags=["finance"])
app.include_router(performance.router, prefix="/api/performance", tags=["performance"])
app.include_router(news.router,        prefix="/api/news",        tags=["news"])
app.include_router(agent.router,       prefix="/api/agent",       tags=["agent"])


@app.get("/health")
def health():
    return {"status": "ok"}
