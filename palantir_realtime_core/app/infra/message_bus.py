"""
Message Bus abstraction — Kafka-compatible interface.

Provides a single Protocol (`MessageBus`) that both the in-process
EventBus and a real Kafka cluster can satisfy. The rest of the
platform never imports Kafka directly — it imports `get_message_bus()`
and gets whichever implementation is configured.

Production: set KAFKA_BOOTSTRAP_SERVERS and install aiokafka.
Replit / in-process: no env var needed, falls back to InProcessBus.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol


Handler = Callable[[Dict[str, Any]], Awaitable[None]]


class MessageBus(Protocol):
    async def publish(self, topic: str, payload: Dict[str, Any], *, key: Optional[str] = None) -> None: ...
    async def subscribe(self, topic: str, handler: Handler) -> None: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...


# ════════════════════════════════════════════════════════════════
# IN-PROCESS FALLBACK
# ════════════════════════════════════════════════════════════════

class InProcessBus:
    """
    Lock-free in-process message bus.
    - O(1) publish
    - async handler fan-out
    - keeps a bounded buffer per topic for replay via `history()`
    """

    def __init__(self, history_limit: int = 1000) -> None:
        self._handlers: Dict[str, List[Handler]] = defaultdict(list)
        self._history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self._history_limit = history_limit
        self._running = False

    async def start(self) -> None:
        self._running = True

    async def stop(self) -> None:
        self._running = False

    async def publish(self, topic: str, payload: Dict[str, Any], *, key: Optional[str] = None) -> None:
        envelope = {"topic": topic, "key": key, "payload": payload}
        hist = self._history[topic]
        hist.append(envelope)
        if len(hist) > self._history_limit:
            hist.pop(0)
        tasks = [asyncio.create_task(h(envelope)) for h in self._handlers[topic]]
        for t in tasks:
            try:
                await t
            except Exception:
                pass
        wildcard = [asyncio.create_task(h(envelope)) for h in self._handlers["*"]]
        for t in wildcard:
            try:
                await t
            except Exception:
                pass

    async def subscribe(self, topic: str, handler: Handler) -> None:
        self._handlers[topic].append(handler)

    def history(self, topic: str, limit: int = 100) -> List[Dict[str, Any]]:
        return list(self._history.get(topic, []))[-limit:]

    def topics(self) -> List[str]:
        return list(self._handlers.keys())


# ════════════════════════════════════════════════════════════════
# KAFKA ADAPTER (aiokafka) — optional, only used when configured
# ════════════════════════════════════════════════════════════════

class KafkaBus:
    """
    Production Kafka adapter using aiokafka.

    Falls back silently if aiokafka is not installed, so the platform
    still boots in environments without Kafka.
    """

    def __init__(self, bootstrap_servers: str, client_id: str = "palantir-core") -> None:
        self.bootstrap_servers = bootstrap_servers
        self.client_id = client_id
        self._producer = None
        self._consumers: Dict[str, Any] = {}
        self._handlers: Dict[str, List[Handler]] = defaultdict(list)
        self._started = False

    async def start(self) -> None:
        try:
            from aiokafka import AIOKafkaProducer
        except ImportError:
            # aiokafka not installed — KafkaBus is a no-op
            return
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap_servers,
            client_id=self.client_id,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda k: k.encode("utf-8") if k else None,
        )
        await self._producer.start()
        self._started = True

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
        for c in self._consumers.values():
            await c.stop()
        self._started = False

    async def publish(self, topic: str, payload: Dict[str, Any], *, key: Optional[str] = None) -> None:
        if not self._started or self._producer is None:
            return
        await self._producer.send_and_wait(topic, value=payload, key=key)

    async def subscribe(self, topic: str, handler: Handler) -> None:
        self._handlers[topic].append(handler)
        if not self._started:
            return
        try:
            from aiokafka import AIOKafkaConsumer
        except ImportError:
            return
        if topic in self._consumers:
            return
        consumer = AIOKafkaConsumer(
            topic,
            bootstrap_servers=self.bootstrap_servers,
            client_id=f"{self.client_id}-{topic}",
            group_id=f"{self.client_id}-group",
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            auto_offset_reset="latest",
        )
        await consumer.start()
        self._consumers[topic] = consumer
        asyncio.create_task(self._consume_loop(topic, consumer))

    async def _consume_loop(self, topic: str, consumer: Any) -> None:
        try:
            async for msg in consumer:
                envelope = {"topic": topic, "key": msg.key, "payload": msg.value}
                for h in self._handlers[topic]:
                    try:
                        await h(envelope)
                    except Exception:
                        pass
        except Exception:
            pass


# ════════════════════════════════════════════════════════════════
# FACTORY
# ════════════════════════════════════════════════════════════════

_bus: Optional[MessageBus] = None


def get_message_bus() -> MessageBus:
    global _bus
    if _bus is not None:
        return _bus
    kafka_url = os.environ.get("KAFKA_BOOTSTRAP_SERVERS")
    if kafka_url:
        _bus = KafkaBus(kafka_url)  # type: ignore[assignment]
    else:
        _bus = InProcessBus()  # type: ignore[assignment]
    return _bus
