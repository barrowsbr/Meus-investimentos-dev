"""
gemini_client.py
================
Wrapper simples sobre o SDK google-generativeai para o agente de investimentos.
A chave de API é lida de st.secrets["GEMINI_API_KEY"] com fallback em variável
de ambiente GEMINI_API_KEY.
"""

from __future__ import annotations

import os
from typing import Generator, Optional

try:
    import google.generativeai as genai
    _GENAI_AVAILABLE = True
except ImportError:
    _GENAI_AVAILABLE = False

try:
    import streamlit as st
    def _get_api_key() -> Optional[str]:
        # 1. Chave digitada pelo usuário na UI (session_state)
        try:
            ui_key = st.session_state.get("gemini_api_key_input", "").strip()
            if ui_key:
                return ui_key
        except Exception:
            pass
        # 2. secrets.toml
        try:
            key = st.secrets.get("GEMINI_API_KEY", "")
            if key:
                return key
        except Exception:
            pass
        # 3. Variável de ambiente
        return os.getenv("GEMINI_API_KEY") or None
except ImportError:
    def _get_api_key() -> Optional[str]:
        return os.getenv("GEMINI_API_KEY") or None


SYSTEM_PROMPT_BASE = """
Você é um assistente financeiro pessoal inteligente integrado a um dashboard de investimentos.

Sua missão:
1. Analisar o portfólio do usuário com base nos dados fornecidos no contexto.
2. Identificar oportunidades, riscos e desequilíbrios de alocação.
3. Resumir notícias relevantes e explicar o impacto nos ativos do portfólio.
4. Responder perguntas sobre finanças pessoais, estratégia e mercado.

Regras:
- Sempre responda em português do Brasil.
- Seja conciso e direto. Use bullet points e markdown para clareza.
- Nunca invente dados — use apenas o que está no contexto fornecido.
- Se o contexto não tiver informação suficiente, diga claramente.
- Não dê recomendações de compra/venda como verdade absoluta — sempre inclua ressalvas.
- Use emojis com moderação para melhorar a legibilidade (📈 📉 ⚠️ ✅).
"""


class GeminiAgent:
    """
    Agente de análise financeira baseado no Gemini.

    Uso:
        agent = GeminiAgent()
        if agent.is_ready():
            response = agent.chat("Como está minha carteira?", portfolio_context)
    """

    # Modelos em ordem de preferência (tenta o primeiro, cai para o próximo)
    _MODEL_CANDIDATES = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-exp",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro-latest",
    ]
    MODEL = "gemini-2.0-flash"

    def __init__(self) -> None:
        self._api_key = _get_api_key()
        self._model = None
        self._history: list[dict] = []

        if _GENAI_AVAILABLE and self._api_key:
            genai.configure(api_key=self._api_key)
            # Tenta cada modelo em ordem até um funcionar
            for candidate in self._MODEL_CANDIDATES:
                try:
                    m = genai.GenerativeModel(
                        model_name=candidate,
                        system_instruction=SYSTEM_PROMPT_BASE,
                    )
                    # Teste rápido para verificar se o modelo existe
                    m.count_tokens("ping")
                    self._model = m
                    self.MODEL = candidate
                    break
                except Exception:
                    continue

    def is_ready(self) -> bool:
        return self._model is not None

    def missing_dependency(self) -> bool:
        return not _GENAI_AVAILABLE

    def missing_key(self) -> bool:
        return _GENAI_AVAILABLE and not self._api_key

    def chat(
        self,
        user_message: str,
        portfolio_context: str = "",
        news_context: str = "",
        stream: bool = True,
    ) -> Generator[str, None, None] | str:
        """
        Envia uma mensagem e retorna a resposta.
        Se stream=True, retorna um generator de chunks de texto.
        """
        if not self.is_ready():
            yield "⚠️ Agente não inicializado. Verifique a chave de API."
            return

        # Monta a mensagem completa com contexto na primeira mensagem
        full_message = user_message
        if portfolio_context or news_context:
            ctx_parts = []
            if portfolio_context:
                ctx_parts.append(portfolio_context)
            if news_context:
                ctx_parts.append(news_context)
            ctx_block = "\n\n".join(ctx_parts)
            full_message = (
                f"<contexto_portfólio>\n{ctx_block}\n</contexto_portfólio>\n\n"
                f"**Pergunta:** {user_message}"
            )

        self._history.append({"role": "user", "parts": [full_message]})

        try:
            chat_session = self._model.start_chat(history=self._history[:-1])
            response = chat_session.send_message(
                full_message,
                stream=stream,
            )

            if stream:
                full_text = ""
                for chunk in response:
                    text = chunk.text if hasattr(chunk, "text") else ""
                    full_text += text
                    yield text
                self._history.append({"role": "model", "parts": [full_text]})
            else:
                text = response.text
                self._history.append({"role": "model", "parts": [text]})
                yield text

        except Exception as e:
            err = str(e)
            if "404" in err or "not found" in err.lower():
                error_msg = (
                    f"⚠️ Modelo `{self.MODEL}` não disponível para esta chave de API.\n\n"
                    "Verifique em [Google AI Studio](https://aistudio.google.com) quais modelos "
                    "estão disponíveis para sua conta."
                )
            elif "403" in err or "permission" in err.lower():
                error_msg = "⚠️ Chave de API inválida ou sem permissão. Verifique em [Google AI Studio](https://aistudio.google.com/apikey)."
            elif "429" in err or "quota" in err.lower():
                error_msg = "⚠️ Limite de requisições atingido (quota). Aguarde alguns instantes e tente novamente."
            else:
                error_msg = f"⚠️ Erro ao chamar Gemini: {e}"
            # Remove do histórico a mensagem que gerou erro
            if self._history and self._history[-1]["role"] == "user":
                self._history.pop()
            yield error_msg

    def clear_history(self) -> None:
        """Limpa o histórico da conversa."""
        self._history = []

    def get_quick_analysis(self, portfolio_context: str, news_context: str = "") -> Generator[str, None, None]:
        """Gera uma análise automática do portfólio sem pergunta do usuário."""
        prompt = (
            "Faça uma análise completa do meu portfólio. "
            "Destaque: 1) Performance geral, 2) Principais posições, "
            "3) Riscos e concentrações, 4) Impacto das notícias recentes nos meus ativos. "
            "Seja objetivo e use no máximo 400 palavras."
        )
        yield from self.chat(prompt, portfolio_context, news_context, stream=True)
