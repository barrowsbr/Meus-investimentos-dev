"""
routers/agent.py
================
Endpoints do Agente de IA (Gemini).
Replica a funcionalidade de 9_Agente_IA.py.

Endpoints:
  POST /api/agent/chat   — envia mensagem e recebe resposta do agente
  GET  /api/agent/context — contexto atual do portfólio para debug
"""
from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.cache import ttl_cache

logger = logging.getLogger("uvicorn")
router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


class ChatResponse(BaseModel):
    reply: str
    model_used: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers com cache
# ---------------------------------------------------------------------------

@ttl_cache(ttl=120)
def _get_context() -> dict:
    from core.agent.context_builder import build_agent_context
    return build_agent_context()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """
    Envia uma mensagem ao agente Gemini com contexto completo do portfólio.
    O histórico de conversa é opcional para manter contexto multi-turno.
    """
    try:
        from core.agent.gemini_client import GeminiAgent

        context = _get_context()
        agent = GeminiAgent(portfolio_context=context)

        # Constrói histórico em formato compatível com o GeminiAgent
        history_dicts = [
            {"role": msg.role, "content": msg.content}
            for msg in (req.history or [])
        ]

        reply, model_used = agent.chat(
            message=req.message,
            history=history_dicts,
        )

        return ChatResponse(reply=reply, model_used=model_used)

    except Exception as exc:
        logger.exception("Erro em /agent/chat")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/context")
def get_context() -> dict:
    """Retorna o contexto de portfólio usado pelo agente (útil para debug)."""
    try:
        ctx = _get_context()
        # Remove DataFrames não serializáveis
        import pandas as pd
        return {k: v for k, v in ctx.items() if not isinstance(v, pd.DataFrame)}
    except Exception as exc:
        logger.exception("Erro em /agent/context")
        raise HTTPException(status_code=500, detail=str(exc))
