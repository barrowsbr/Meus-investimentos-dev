"""Simple TTL in-memory cache."""
import time
from typing import Any, Optional


class TTLCache:
    def __init__(self, ttl_seconds: int = 900):
        self._store: dict[str, tuple[Any, float]] = {}
        self.ttl = ttl_seconds

    def get(self, key: str) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        ttl_s = ttl if ttl is not None else self.ttl
        self._store[key] = (value, time.monotonic() + ttl_s)

    def delete(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()


sheets_cache = TTLCache(ttl_seconds=900)   # 15 min
market_cache = TTLCache(ttl_seconds=300)   # 5 min
