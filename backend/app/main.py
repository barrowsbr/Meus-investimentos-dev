from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agent, cambio, financas, historico, market, portfolio, proventos

app = FastAPI(
    title="Meus Investimentos API",
    version="1.0.0",
    description="FastAPI backend para o dashboard de investimentos pessoal.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(market.router)
app.include_router(proventos.router)
app.include_router(cambio.router)
app.include_router(financas.router)
app.include_router(historico.router)
app.include_router(agent.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
