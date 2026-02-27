"""
gemini_client.py
================
Wrapper sobre o SDK do Gemini para o agente de investimentos.

Suporta dois SDKs em ordem de preferência:
  1. google-genai  (novo, ≥1.51.0) → Gemini 3 Flash Preview + modelos modernos
  2. google-generativeai (legado)   → Gemini 2.0 / 1.5

A chave de API é lida de:
  1. _HARDCODED_KEY  (edite manualmente abaixo)
  2. st.secrets["GEMINI_API_KEY"]  (secrets.toml)
  3. variável de ambiente GEMINI_API_KEY
"""

from __future__ import annotations

import os
from typing import Generator, Optional

# ── Chave de API (edite aqui manualmente) ─────────────────────────────────
# Obtenha sua chave gratuita em: https://aistudio.google.com/apikey
_HARDCODED_KEY: str = "AIzaSyDtlceSFQNzV7aWOxtw98COt6uDW9SvQX4"

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
        # 1. Chave hardcoded no código (edite _HARDCODED_KEY acima)
        if _HARDCODED_KEY.strip():
            return _HARDCODED_KEY.strip()
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
        if _HARDCODED_KEY.strip():
            return _HARDCODED_KEY.strip()
        return os.getenv("GEMINI_API_KEY") or None


# ── System Prompt ──────────────────────────────────────────────────────────
SYSTEM_PROMPT_BASE = """
Você é um assistente financeiro pessoal inteligente integrado a um dashboard de investimentos.

Sua missão:
1. Analisar o portfólio do usuário com base nos dados fornecidos no contexto.
2. Identificar oportunidades, riscos e desequilíbrios de alocação.
3. Resumir notícias relevantes e explicar o impacto nos ativos do portfólio.
4. Responder perguntas sobre finanças pessoais, estratégia e mercado.
5. Quando necessário, buscar informações atualizadas na internet (cotações, notícias, indicadores macroeconômicos).

Regras:
- Sempre responda em português do Brasil.
- Seja conciso e direto. Use bullet points e markdown para clareza.
- Para dados do portfólio, use exclusivamente o contexto fornecido.
- Para dados de mercado em tempo real (preços, taxas, notícias), use a busca na web quando disponível.
- Não dê recomendações de compra/venda como verdade absoluta — sempre inclua ressalvas.
- Use emojis com moderação para melhorar a legibilidade (📈 📉 ⚠️ ✅).
- Quando usar dados da web, indique a fonte brevemente.
"""

# ── Candidatos de modelo ───────────────────────────────────────────────────
# Novo SDK (google-genai) — prioridade para Gemini 3 > 2.5 > 2.0
_CANDIDATES_NEW_SDK = [
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-latest",
]

# SDK legado (google-generativeai) — prioridade para Gemini 2.5/2.0
_CANDIDATES_OLD_SDK = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro-latest",
]


class GeminiAgent:
    """
    Agente de análise financeira baseado no Gemini.

    Detecta automaticamente o SDK disponível e seleciona o melhor modelo.
    Suporta streaming via generator e Google Search grounding opcional.
    """

    MODEL = _CANDIDATES_NEW_SDK[0] if _NEW_SDK else (_CANDIDATES_OLD_SDK[0] if _OLD_SDK else "—")

    def __init__(self, enable_web_search: bool = True) -> None:
        self._api_key = _get_api_key()
        self._client = None    # Novo SDK: google.genai.Client
        self._old_model = None # Legado: GenerativeModel
        self._chat = None      # Novo SDK: Chat session
        self._history: list[dict] = []  # Legado: histórico manual
        self.MODEL = GeminiAgent.MODEL
        self._sdk_used = "none"
        self.enable_web_search = enable_web_search
        self._web_search_active = False  # True quando a tool foi aceita pelo modelo

        if not _ANY_SDK or not self._api_key:
            return

        if _NEW_SDK:
            self._init_new_sdk()
        elif _OLD_SDK:
            self._init_old_sdk()

    # ── Helpers de ferramentas ─────────────────────────────────────────────

    def _new_sdk_tools(self) -> list:
        """Retorna lista de tools para o novo SDK (google-genai)."""
        if not self.enable_web_search:
            return []
        try:
            tool = _genai_types.Tool(google_search=_genai_types.GoogleSearch())
            return [tool]
        except (AttributeError, Exception):
            return []

    def _old_sdk_tools(self) -> list:
        """Retorna lista de tools para o SDK legado (google-generativeai)."""
        if not self.enable_web_search:
            return []
        try:
            tool = _old_genai.protos.Tool(
                google_search_retrieval=_old_genai.protos.GoogleSearchRetrieval()
            )
            return [tool]
        except (AttributeError, Exception):
            return []

    # ── Inicialização ──────────────────────────────────────────────────────

    def _init_new_sdk(self) -> None:
        """Inicializa usando google-genai (novo SDK)."""
        try:
            client = _new_genai.Client(api_key=self._api_key)
            tools = self._new_sdk_tools()
            config = _genai_types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT_BASE,
                tools=tools or None,
            )
            for candidate in _CANDIDATES_NEW_SDK:
                try:
                    client.models.generate_content(
                        model=candidate,
                        contents="ping",
                        config=_genai_types.GenerateContentConfig(max_output_tokens=1),
                    )
                    self._client = client
                    self._config = config
                    self.MODEL = candidate
                    self._sdk_used = "new"
                    self._web_search_active = bool(tools)
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
            tools = self._old_sdk_tools()
            for candidate in _CANDIDATES_OLD_SDK:
                try:
                    m = _old_genai.GenerativeModel(
                        model_name=candidate,
                        system_instruction=SYSTEM_PROMPT_BASE,
                        tools=tools or None,
                    )
                    m.count_tokens("ping")
                    self._old_model = m
                    self.MODEL = candidate
                    self._sdk_used = "old"
                    self._web_search_active = bool(tools)
                    break
                except Exception:
                    continue
        except Exception:
            pass

    def _new_chat(self, history: list | None = None) -> None:
        """Cria (ou recria) a sessão de chat no novo SDK, opcionalmente com histórico."""
        if self._client:
            kwargs: dict = {"model": self.MODEL, "config": self._config}
            if history:
                kwargs["history"] = history
            self._chat = self._client.chats.create(**kwargs)

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
        label = labels.get(self._sdk_used, "desconhecido")
        if self._web_search_active:
            label += " · 🌐 web"
        return label

    def web_search_status(self) -> str:
        """Retorna status da busca na web como string legível."""
        if not self.enable_web_search:
            return "desativada"
        return "ativa" if self._web_search_active else "não suportada pelo modelo"

    # ── Contexto do portfólio ─────────────────────────────────────────────

    def set_context(
        self,
        portfolio_context: str,
        news_context: str = "",
        chat_history: list[dict] | None = None,
    ) -> None:
        """
        Atualiza o system instruction com os dados do portfólio e recria a
        sessão de chat preservando o histórico de conversa existente.

        chat_history: lista de {"role": "user"|"assistant", "content": str}
        """
        if not self.is_ready():
            return

        ctx_parts = [SYSTEM_PROMPT_BASE]
        if portfolio_context.strip():
            ctx_parts.append(portfolio_context)
        if news_context.strip():
            ctx_parts.append(f"## Notícias Relevantes para os seus ativos\n{news_context}")

        full_system = "\n\n---\n\n".join(ctx_parts)

        if self._sdk_used == "new":
            tools = self._new_sdk_tools()
            self._config = _genai_types.GenerateContentConfig(
                system_instruction=full_system,
                tools=tools or None,
            )
            self._web_search_active = bool(tools)
            # Reconstrói histórico no formato do SDK
            history = None
            if chat_history:
                history = [
                    _genai_types.Content(
                        role="user" if msg["role"] == "user" else "model",
                        parts=[_genai_types.Part(text=msg["content"])],
                    )
                    for msg in chat_history
                    if msg.get("content", "").strip()
                ]
            self._new_chat(history=history)

        elif self._sdk_used == "old":
            try:
                tools = self._old_sdk_tools()
                self._old_model = _old_genai.GenerativeModel(
                    model_name=self.MODEL,
                    system_instruction=full_system,
                    tools=tools or None,
                )
                self._web_search_active = bool(tools)
                # Reconstrói histórico no formato legado
                if chat_history:
                    self._history = [
                        {"role": "user" if m["role"] == "user" else "model",
                         "parts": [m["content"]]}
                        for m in chat_history if m.get("content", "").strip()
                    ]
                else:
                    self._history = []
            except Exception:
                pass

    # ── Chat ──────────────────────────────────────────────────────────────

    def chat(
        self,
        user_message: str,
        stream: bool = True,
    ) -> Generator[str, None, None]:
        """
        Envia uma mensagem e retorna chunks de texto via generator.
        O contexto do portfólio já deve ter sido injetado via set_context().
        """
        if not self.is_ready():
            yield "⚠️ Agente não inicializado. Verifique a chave de API."
            return

        try:
            if self._sdk_used == "new":
                yield from self._chat_new(user_message, stream)
            else:
                yield from self._chat_old(user_message, stream)
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

    # ── Fallback em cascata ────────────────────────────────────────────────

    def _is_quota_error(self, e: Exception) -> bool:
        """Retorna True para erros de rate-limit / quota que justificam fallback."""
        s = str(e).lower()
        return (
            "429" in str(e)
            or "quota" in s
            or "rate" in s
            or "resource_exhausted" in s
            or "too many requests" in s
            or "503" in str(e)        # overloaded — vale tentar modelo menor
        )

    def _fallback_to_next(self) -> bool:
        """
        Muda para o próximo modelo mais leve na cascata.
        Preserva o histórico de conversa.
        Retorna True se o fallback foi bem-sucedido.
        """
        candidates = _CANDIDATES_NEW_SDK if self._sdk_used == "new" else _CANDIDATES_OLD_SDK
        try:
            current_idx = candidates.index(self.MODEL)
        except ValueError:
            current_idx = -1

        for candidate in candidates[current_idx + 1 :]:
            try:
                if self._sdk_used == "new":
                    # Testa se o modelo está disponível
                    self._client.models.generate_content(
                        model=candidate,
                        contents="ping",
                        config=_genai_types.GenerateContentConfig(max_output_tokens=1),
                    )
                    # Preserva system instruction atual
                    prev_system = getattr(self._config, "system_instruction", SYSTEM_PROMPT_BASE)
                    self.MODEL = candidate
                    tools = self._new_sdk_tools()
                    self._config = _genai_types.GenerateContentConfig(
                        system_instruction=prev_system,
                        tools=tools or None,
                    )
                    # Preserva histórico da sessão atual (turns anteriores ao erro)
                    history = getattr(self._chat, "history", None)
                    self._new_chat(history=history if history else None)
                    self._web_search_active = bool(tools)
                    return True

                elif self._sdk_used == "old":
                    tools = self._old_sdk_tools()
                    prev_system = getattr(self._old_model, "_system_instruction", SYSTEM_PROMPT_BASE)
                    m = _old_genai.GenerativeModel(
                        model_name=candidate,
                        system_instruction=prev_system,
                        tools=tools or None,
                    )
                    m.count_tokens("ping")
                    self._old_model = m
                    self.MODEL = candidate
                    self._web_search_active = bool(tools)
                    return True

            except Exception:
                continue  # esse candidato também falhou — tenta o próximo

        return False  # esgotou a cascata

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
            return "⚠️ Todos os modelos disponíveis atingiram o limite de quota. Aguarde alguns instantes e tente novamente."
        return f"⚠️ Erro ao chamar Gemini: {e}"

    # ── Controles ─────────────────────────────────────────────────────────

    def clear_history(self) -> None:
        """Reinicia o histórico e cria nova sessão de chat."""
        self._history = []
        if self._sdk_used == "new":
            self._new_chat()

    def get_quick_analysis(self) -> Generator[str, None, None]:
        """Gera análise automática do portfólio (contexto já em set_context())."""
        prompt = (
            "Faça uma análise completa do meu portfólio. "
            "Destaque: 1) Performance geral, 2) Principais posições, "
            "3) Riscos e concentrações, 4) Impacto das notícias recentes nos meus ativos. "
            "Seja objetivo e use no máximo 400 palavras."
        )
        yield from self.chat(prompt, stream=True)
