"""Gemini chat service."""
import google.generativeai as genai

from app.config import settings

SYSTEM_PROMPT = (
    "Você é um assistente financeiro inteligente integrado ao dashboard pessoal de investimentos de Lucas. "
    "Você tem profundo conhecimento de: mercado financeiro brasileiro (B3, Tesouro Direto, FIIs, ETFs, BDRs), "
    "análise de portfólio, imposto de renda sobre investimentos (DARF, come-cotas, isenção até R$20k/mês), "
    "câmbio e investimentos internacionais, criptoativos, estratégias de alocação de ativos, e planejamento financeiro. "
    "Responda sempre em português brasileiro, de forma clara, precisa e útil. "
    "Quando não tiver certeza, seja honesto. Não faça recomendações específicas de compra/venda de ativos."
)


def _get_model():
    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=SYSTEM_PROMPT,
    )


async def chat(message: str, history: list[dict]) -> str:
    model = _get_model()
    chat_session = model.start_chat(history=history)
    result = chat_session.send_message(message)
    return result.text
