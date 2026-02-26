"""
gemini_client.py
================
Wrapper sobre o SDK do Gemini para o agente de investimentos.

Suporta dois SDKs em ordem de preferência:
  1. google-genai  (novo, ≥1.51.0) → Gemini 3 Flash Preview + modelos modernos
  2. google-generativeai (legado)   → Gemini 2.0 / 1.5

A chave de API é lida de:
  1. st.session_state["gemini_api_key_input"]  (digitada na UI)
  2. st.secrets["GEMINI_API_KEY"]               (secrets.toml)
  3. variável de ambiente GEMINI_API_KEY
"""

from __future__ import annotations

import os
from typing import Generator, Optional

# ── Detecção de SDK disponível ─────────────────────────────────────────────
_NEW_SDK = False   # google-genai  (novo)
_OLD_SDK = False   # google-generativeai (legado)

try:
    from google import genai as _new_genai
    from google.genai import types as _genai_types
    _NEW_SDK = True
except ImportError:
    pass

if not _NEW_SDK:
    try:
        import google.generativeai as _old_genai
        _OLD_SDK = True
    except ImportError:
        pass

_ANY_SDK = _NEW_SDK or _OLD_SDK


# ── Leitura da chave de API ────────────────────────────────────────────────
try:
    import streamlit as _st

    def _get_api_key() -> Optional[str]:
        # 1. Chave digitada na UI (session_state)
        try:
            k = _st.session_state.get("gemini_api_key_input", "").strip()
            if k:
                return k
        except Exception:
            pass
        # 2. secrets.toml
        try:
            k = _st.secrets.get("GEMINI_API_KEY", "")
            if k:
                return k
        except Exception:
            pass
        # 3. Variável de ambiente
        return os.getenv("GEMINI_API_KEY") or None

except ImportError:
    def _get_api_key() -> Optional[str]:
        return os.getenv("GEMINI_API_KEY") or None


# ── System Prompt ──────────────────────────────────────────────────────────
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

# ── Candidatos de modelo ───────────────────────────────────────────────────
# Novo SDK (google-genai) — prioridade para Gemini 3
_CANDIDATES_NEW_SDK = [
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-latest",
]

# SDK legado (google-generativeai)
_CANDIDATES_OLD_SDK = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
]


class GeminiAgent:
    """
    Agente de análise financeira baseado no Gemini.

    Detecta automaticamente o SDK disponível e seleciona o melhor modelo.
    Suporta streaming via generator.
    """

    MODEL = _CANDIDATES_NEW_SDK[0] if _NEW_SDK else (_CANDIDATES_OLD_SDK[0] if _OLD_SDK else "—")

    def __init__(self) -> None:
        self._api_key = _get_api_key()
        self._client = None    # Novo SDK: google.genai.Client
        self._old_model = None # Legado: GenerativeModel
        self._chat = None      # Novo SDK: Chat session
        self._history: list[dict] = []  # Legado: histórico manual
        self.MODEL = GeminiAgent.MODEL
        self._sdk_used = "none"

        if not _ANY_SDK or not self._api_key:
            return

        if _NEW_SDK:
            self._init_new_sdk()
        elif _OLD_SDK:
            self._init_old_sdk()

    # ── Inicialização ──────────────────────────────────────────────────────

    def _init_new_sdk(self) -> None:
        """Inicializa usando google-genai (novo SDK)."""
        try:
            client = _new_genai.Client(api_key=self._api_key)
            config = _genai_types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT_BASE,
            )
            for candidate in _CANDIDATES_NEW_SDK:
                try:
                    # Teste rápido: lista modelos disponíveis
                    client.models.generate_content(
                        model=candidate,
                        contents="ping",
                        config=_genai_types.GenerateContentConfig(max_output_tokens=1),
                    )
                    self._client = client
                    self._config = config
                    self.MODEL = candidate
                    self._sdk_used = "new"
                    self._new_chat()
                    break
                except Exception:
                    continue
        except Exception:
            pass

    def _init_old_sdk(self) -> None:
        """Inicializa usando google-generativeai (SDK legado)."""
        try:
            _old_genai.configure(api_key=self._api_key)
            for candidate in _CANDIDATES_OLD_SDK:
                try:
                    m = _old_genai.GenerativeModel(
                        model_name=candidate,
                        system_instruction=SYSTEM_PROMPT_BASE,
                    )
                    m.count_tokens("ping")
                    self._old_model = m
                    self.MODEL = candidate
                    self._sdk_used = "old"
                    break
                except Exception:
                    continue
        except Exception:
            pass

    def _new_chat(self) -> None:
        """Cria (ou recria) a sessão de chat no novo SDK."""
        if self._client:
            self._chat = self._client.chats.create(
                model=self.MODEL,
                config=self._config,
            )

    # ── Status ────────────────────────────────────────────────────────────

    def is_ready(self) -> bool:
        return self._sdk_used in ("new", "old")

    def missing_dependency(self) -> bool:
        return not _ANY_SDK

    def missing_key(self) -> bool:
        return _ANY_SDK and not self._api_key

    def sdk_label(self) -> str:
        labels = {
            "new": "google-genai (novo)",
            "old": "google-generativeai (legado)",
            "none": "não inicializado",
        }
        return labels.get(self._sdk_used, "desconhecido")

    # ── Chat ──────────────────────────────────────────────────────────────

    def chat(
        self,
        user_message: str,
        portfolio_context: str = "",
        news_context: str = "",
        stream: bool = True,
    ) -> Generator[str, None, None]:
        """Envia uma mensagem e retorna chunks de texto via generator."""
        if not self.is_ready():
            yield "⚠️ Agente não inicializado. Verifique a chave de API."
            return

        # Injeta contexto como prefixo na primeira mensagem
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

        try:
            if self._sdk_used == "new":
                yield from self._chat_new(full_message, stream)
            else:
                yield from self._chat_old(full_message, stream)
        except Exception as e:
            yield self._format_error(e)

    def _chat_new(self, message: str, stream: bool) -> Generator[str, None, None]:
        """Envia mensagem via novo SDK."""
        if stream:
            full_text = ""
            for chunk in self._chat.send_message_stream(message):
                text = chunk.text if hasattr(chunk, "text") else ""
                full_text += text
                yield text
        else:
            response = self._chat.send_message(message)
            yield response.text

    def _chat_old(self, message: str, stream: bool) -> Generator[str, None, None]:
        """Envia mensagem via SDK legado com histórico manual."""
        self._history.append({"role": "user", "parts": [message]})
        chat_session = self._old_model.start_chat(history=self._history[:-1])
        response = chat_session.send_message(message, stream=stream)

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

    def _format_error(self, e: Exception) -> str:
        err = str(e)
        if "404" in err or "not found" in err.lower():
            return (
                f"⚠️ Modelo `{self.MODEL}` não disponível.\n\n"
                "Verifique os modelos disponíveis em [Google AI Studio](https://aistudio.google.com)."
            )
        if "403" in err or "permission" in err.lower() or "api_key" in err.lower():
            return "⚠️ Chave de API inválida ou sem permissão. Verifique em [Google AI Studio](https://aistudio.google.com/apikey)."
        if "429" in err or "quota" in err.lower():
            return "⚠️ Limite de requisições atingido. Aguarde alguns instantes e tente novamente."
        return f"⚠️ Erro ao chamar Gemini: {e}"

    # ── Controles ─────────────────────────────────────────────────────────

    def clear_history(self) -> None:
        """Reinicia o histórico e cria nova sessão de chat."""
        self._history = []
        if self._sdk_used == "new":
            self._new_chat()

    def get_quick_analysis(self, portfolio_context: str, news_context: str = "") -> Generator[str, None, None]:
        """Gera análise automática do portfólio sem pergunta do usuário."""
        prompt = (
            "Faça uma análise completa do meu portfólio. "
            "Destaque: 1) Performance geral, 2) Principais posições, "
            "3) Riscos e concentrações, 4) Impacto das notícias recentes nos meus ativos. "
            "Seja objetivo e use no máximo 400 palavras."
        )
        yield from self.chat(prompt, portfolio_context, news_context, stream=True)
