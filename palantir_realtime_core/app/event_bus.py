from __future__ import annotations

from collections import defaultdict
from typing import Awaitable, Callable, Dict, List

from app.models import DomainEvent

AsyncHandler = Callable[[DomainEvent], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self.subscribers: Dict[str, List[AsyncHandler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: AsyncHandler) -> None:
        self.subscribers[event_type].append(handler)

    async def publish(self, event: DomainEvent) -> None:
        for handler in self.subscribers.get(event.event_type.value, []):
            await handler(event)

        for handler in self.subscribers.get("*", []):
            await handler(event)


event_bus = EventBus()
