"""
State Cache abstraction — Redis-compatible interface.

Used as a hot layer in front of the Postgres state store. Falls back to
an in-memory dict when REDIS_URL is not set.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, Optional, Protocol


class StateCache(Protocol):
    async def get(self, key: str) -> Optional[Dict[str, Any]]: ...
    async def set(self, key: str, value: Dict[str, Any], ttl_seconds: Optional[int] = None) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def exists(self, key: str) -> bool: ...
    async def incr(self, key: str, amount: int = 1) -> int: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...


class InMemoryCache:
    def __init__(self) -> None:
        self._store: Dict[str, Dict[str, Any]] = {}
        self._ttls: Dict[str, float] = {}
        self._counters: Dict[str, int] = {}

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    def _is_expired(self, key: str) -> bool:
        exp = self._ttls.get(key)
        return exp is not None and time.time() > exp

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        if self._is_expired(key):
            self._store.pop(key, None)
            self._ttls.pop(key, None)
            return None
        return self._store.get(key)

    async def set(self, key: str, value: Dict[str, Any], ttl_seconds: Optional[int] = None) -> None:
        self._store[key] = value
        if ttl_seconds is not None:
            self._ttls[key] = time.time() + ttl_seconds
        else:
            self._ttls.pop(key, None)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)
        self._ttls.pop(key, None)

    async def exists(self, key: str) -> bool:
        return (key in self._store) and (not self._is_expired(key))

    async def incr(self, key: str, amount: int = 1) -> int:
        self._counters[key] = self._counters.get(key, 0) + amount
        return self._counters[key]


class RedisCache:
    def __init__(self, url: str) -> None:
        self.url = url
        self._client = None

    async def start(self) -> None:
        try:
            import redis.asyncio as aioredis
        except ImportError:
            return
        self._client = aioredis.from_url(self.url, decode_responses=True)

    async def stop(self) -> None:
        if self._client is not None:
            await self._client.close()

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        if self._client is None:
            return None
        raw = await self._client.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def set(self, key: str, value: Dict[str, Any], ttl_seconds: Optional[int] = None) -> None:
        if self._client is None:
            return
        data = json.dumps(value, default=str)
        if ttl_seconds:
            await self._client.set(key, data, ex=ttl_seconds)
        else:
            await self._client.set(key, data)

    async def delete(self, key: str) -> None:
        if self._client is None:
            return
        await self._client.delete(key)

    async def exists(self, key: str) -> bool:
        if self._client is None:
            return False
        return bool(await self._client.exists(key))

    async def incr(self, key: str, amount: int = 1) -> int:
        if self._client is None:
            return 0
        return int(await self._client.incrby(key, amount))


_cache: Optional[StateCache] = None


def get_state_cache() -> StateCache:
    global _cache
    if _cache is not None:
        return _cache
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        _cache = RedisCache(redis_url)  # type: ignore[assignment]
    else:
        _cache = InMemoryCache()  # type: ignore[assignment]
    return _cache
