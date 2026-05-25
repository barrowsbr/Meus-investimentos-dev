from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agent, cambio, composicao, financas, fluxos, historico, market, performance, portfolio, proventos, sheets

app = FastAPI(
    title="Meus Investimentos API",
    version="1.0.0",
    description="FastAPI backend para o dashboard de investimentos pessoal.",
)

_origins = [
    settings.frontend_url,
    "http://localhost:3000",
    "http://localhost:5173",
]
# Accept any *.vercel.app subdomain for preview deployments
_origin_regex = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(composicao.router)
app.include_router(performance.router)
app.include_router(sheets.router)
app.include_router(market.router)
app.include_router(proventos.router)
app.include_router(cambio.router)
app.include_router(financas.router)
app.include_router(historico.router)
app.include_router(agent.router)
app.include_router(fluxos.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
