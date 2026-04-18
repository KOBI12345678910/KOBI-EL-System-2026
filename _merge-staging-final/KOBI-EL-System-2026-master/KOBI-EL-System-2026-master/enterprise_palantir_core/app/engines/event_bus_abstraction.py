"""
Event Bus Abstraction — Kafka-compatible interface with an in-process
fallback. Every part of the platform publishes through `get_event_bus()`;
whether the backend is Kafka, NATS, or an in-process dict is transparent.

Production: set KAFKA_BOOTSTRAP_SERVERS (and install aiokafka) or
NATS_URL (and install nats-py) — the factory picks the matching adapter.

Local / Replit: no env vars needed → InProcessBus is used automatically.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections import defaultdict
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol


Handler = Callable[[Dict[str, Any]], Awaitable[None]]


class EventBus(Protocol):
    async def publish(self, topic: str, payload: Dict[str, Any], *, key: Optional[str] = None) -> None: ...
    async def subscribe(self, topic: str, handler: Handler) -> None: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...


# ════════════════════════════════════════════════════════════════
# IN-PROCESS FALLBACK
# ════════════════════════════════════════════════════════════════

class InProcessBus:
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
        for h in self._handlers.get(topic, []):
            try:
                await h(envelope)
            except Exception:
                pass
        for h in self._handlers.get("*", []):
            try:
                await h(envelope)
            except Exception:
                pass

    async def subscribe(self, topic: str, handler: Handler) -> None:
        self._handlers[topic].append(handler)

    def subscribe_all(self, handler: Handler) -> None:
        self._handlers["*"].append(handler)

    def history(self, topic: str, limit: int = 100) -> List[Dict[str, Any]]:
        return list(self._history.get(topic, []))[-limit:]


# ════════════════════════════════════════════════════════════════
# KAFKA ADAPTER (aiokafka) — optional
# ════════════════════════════════════════════════════════════════

class KafkaBus:
    def __init__(self, bootstrap_servers: str, client_id: str = "palantir-core") -> None:
        self.bootstrap_servers = bootstrap_servers
        self.client_id = client_id
        self._producer = None
        self._consumers: Dict[str, Any] = {}
        self._handlers: Dict[str, List[Handler]] = defaultdict(list)
        self._started = False

    async def start(self) -> None:
        try:
            from aiokafka import AIOKafkaProducer  # type: ignore
        except ImportError:
            return
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap_servers,
            client_id=self.client_id,
            value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
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
            from aiokafka import AIOKafkaConsumer  # type: ignore
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
                for h in self._handlers.get(topic, []):
                    try:
                        await h(envelope)
                    except Exception:
                        pass
        except Exception:
            pass


# ════════════════════════════════════════════════════════════════
# NATS ADAPTER (nats-py) — optional
# ════════════════════════════════════════════════════════════════

class NATSBus:
    def __init__(self, url: str) -> None:
        self.url = url
        self._nc = None
        self._handlers: Dict[str, List[Handler]] = defaultdict(list)
        self._subs: Dict[str, Any] = {}

    async def start(self) -> None:
        try:
            import nats  # type: ignore
        except ImportError:
            return
        self._nc = await nats.connect(self.url)

    async def stop(self) -> None:
        if self._nc is not None:
            await self._nc.drain()

    async def publish(self, topic: str, payload: Dict[str, Any], *, key: Optional[str] = None) -> None:
        if self._nc is None:
            return
        data = json.dumps(payload, default=str).encode("utf-8")
        await self._nc.publish(topic, data)

    async def subscribe(self, topic: str, handler: Handler) -> None:
        self._handlers[topic].append(handler)
        if self._nc is None:
            return
        async def _cb(msg: Any) -> None:
            try:
                payload = json.loads(msg.data.decode("utf-8"))
            except Exception:
                payload = {"raw": msg.data.decode("utf-8", errors="replace")}
            envelope = {"topic": topic, "key": None, "payload": payload}
            for h in self._handlers.get(topic, []):
                try:
                    await h(envelope)
                except Exception:
                    pass
        sub = await self._nc.subscribe(topic, cb=_cb)
        self._subs[topic] = sub


# ════════════════════════════════════════════════════════════════
# FACTORY
# ════════════════════════════════════════════════════════════════

_bus: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    global _bus
    if _bus is not None:
        return _bus
    kafka_url = os.environ.get("KAFKA_BOOTSTRAP_SERVERS")
    nats_url = os.environ.get("NATS_URL")
    if kafka_url:
        _bus = KafkaBus(kafka_url)  # type: ignore[assignment]
    elif nats_url:
        _bus = NATSBus(nats_url)  # type: ignore[assignment]
    else:
        _bus = InProcessBus()  # type: ignore[assignment]
    return _bus
