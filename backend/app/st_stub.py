"""
st_stub.py
==========
Substituto de compatibilidade para Streamlit.

Injeta este módulo como sys.modules['streamlit'] ANTES de importar qualquer
módulo de core/. Isso permite reutilizar toda a lógica de negócios do core/
sem nenhuma modificação — apenas as dependências de UI do Streamlit são
neutralizadas.

Uso (em main.py):
    import sys
    import app.st_stub as _st_stub
    sys.modules['streamlit'] = _st_stub
    sys.modules['streamlit.components.v1'] = _st_stub
"""
from __future__ import annotations

import os
import json
import logging
from functools import wraps
from typing import Any, Callable, Optional

logger = logging.getLogger("uvicorn")

# ---------------------------------------------------------------------------
# Cache stubs — @st.cache_data e @st.cache_resource viram no-ops.
# O FastAPI gerencia seu próprio cache via TTLCache em cache.py.
# ---------------------------------------------------------------------------

def _make_cache_decorator(func=None, **kwargs):
    """Suporta tanto @st.cache_data quanto @st.cache_data(ttl=120)."""
    if func is not None:
        # Usado como @st.cache_data sem parênteses
        return func
    # Usado como @st.cache_data(ttl=120, ...)
    def decorator(f):
        return f
    return decorator

cache_data = _make_cache_decorator
cache_resource = _make_cache_decorator


class _CacheDataNamespace:
    """Substituto para st.cache_data.clear()"""
    def __call__(self, func=None, **kwargs):
        return _make_cache_decorator(func, **kwargs)
    def clear(self):
        pass  # No-op — FastAPI usa TTLCache separado


cache_data = _CacheDataNamespace()


# ---------------------------------------------------------------------------
# Secrets — lê de variáveis de ambiente
# ---------------------------------------------------------------------------

class _Secrets:
    """
    Substituto para st.secrets.
    Lê de variáveis de ambiente ou de service_account.json.
    """

    def get(self, key: str, default=None):
        return os.environ.get(key, default)

    def __contains__(self, key: str) -> bool:
        return key in os.environ

    def __getitem__(self, key: str):
        val = os.environ.get(key)
        if val is None:
            raise KeyError(key)
        return val

    def __getattr__(self, key: str):
        """Suporta st.secrets.gcp_service_account como atributo."""
        val = os.environ.get(key)
        if val is None:
            raise AttributeError(key)
        # Se o valor parece JSON, parseia
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val


secrets = _Secrets()

# ---------------------------------------------------------------------------
# Logging — st.error/warning/info viram logs uvicorn
# ---------------------------------------------------------------------------

def error(msg: Any, *args, **kwargs):
    logger.error(str(msg))

def warning(msg: Any, *args, **kwargs):
    logger.warning(str(msg))

def info(msg: Any, *args, **kwargs):
    logger.info(str(msg))

def write(*args, **kwargs):
    pass

def success(msg: Any, *args, **kwargs):
    logger.info(str(msg))

def spinner(*args, **kwargs):
    """Context manager no-op."""
    class _Noop:
        def __enter__(self): return self
        def __exit__(self, *a): pass
    return _Noop()

# ---------------------------------------------------------------------------
# Components stub — streamlit.components.v1
# ---------------------------------------------------------------------------

class _Components:
    def html(self, *args, **kwargs): pass
    def iframe(self, *args, **kwargs): pass

components = _Components()

# ---------------------------------------------------------------------------
# Misc stubs necessários para módulos core/
# ---------------------------------------------------------------------------

def set_page_config(*args, **kwargs): pass
def rerun(*args, **kwargs): pass
def stop(*args, **kwargs): pass
def experimental_rerun(*args, **kwargs): pass

class _SessionState(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError:
            return None
    def __setattr__(self, key, value):
        self[key] = value

session_state = _SessionState()

class _QueryParams(dict):
    def __getattr__(self, key):
        return self.get(key)

query_params = _QueryParams()
experimental_get_query_params = lambda: {}
experimental_set_query_params = lambda **kw: None

# Permitir 'import streamlit.components.v1 as components'
# (tratado em main.py via sys.modules)
