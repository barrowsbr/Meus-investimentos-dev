"""
cache.py
========
Cache com TTL para o backend FastAPI.
Substitui @st.cache_data do Streamlit.

Uso:
    from app.cache import ttl_cache

    @ttl_cache(ttl=120)
    def minha_funcao():
        ...
"""
from __future__ import annotations

import time
import threading
from typing import Any, Callable, Dict, Tuple
from functools import wraps


_SENTINEL = object()  # definido aqui para uso no get() antes do ttl_cache


class TTLCache:
    """Cache thread-safe com expiração por TTL (segundos)."""

    def __init__(self):
        self._store: Dict[str, Tuple[Any, float]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any:
        """Retorna o valor cacheado ou _SENTINEL se não existir/expirado."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return _SENTINEL
            value, expires_at = entry
            if time.time() > expires_at:
                del self._store[key]
                return _SENTINEL
            return value

    def set(self, key: str, value: Any, ttl: int):
        with self._lock:
            self._store[key] = (value, time.time() + ttl)

    def clear(self):
        with self._lock:
            self._store.clear()

    def invalidate(self, key: str):
        with self._lock:
            self._store.pop(key, None)


_global_cache = TTLCache()


def ttl_cache(ttl: int = 300):
    """
    Decorator que cacheia o retorno de uma função por `ttl` segundos.
    A chave de cache inclui o nome da função + argumentos.
    Suporta corretamente funções que retornam None, [], {}, 0, False.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = f"{func.__module__}.{func.__qualname__}:{args}:{sorted(kwargs.items())}"
            cached = _global_cache.get(key)
            if cached is not _SENTINEL:
                return cached
            result = func(*args, **kwargs)
            _global_cache.set(key, result, ttl)
            return result
        wrapper.cache_clear = lambda: _global_cache.clear()
        return wrapper
    return decorator
