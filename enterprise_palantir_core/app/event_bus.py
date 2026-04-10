"""
In-process async event bus.

Every domain event goes through here. Subscribers receive events by
exact type match or via the wildcard "*" channel.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Awaitable, Callable, Dict, List

AsyncEventHandler = Callable[[Dict[str, Any]], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._subs: Dict[str, List[AsyncEventHandler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: AsyncEventHandler) -> None:
        self._subs[event_type].append(handler)

    def subscribe_all(self, handler: AsyncEventHandler) -> None:
        self._subs["*"].append(handler)

    async def publish(self, event_type: str, event: Dict[str, Any]) -> None:
        for h in self._subs.get(event_type, []):
            try:
                await h(event)
            except Exception:
                pass
        for h in self._subs.get("*", []):
            try:
                await h(event)
            except Exception:
                pass


event_bus = EventBus()
