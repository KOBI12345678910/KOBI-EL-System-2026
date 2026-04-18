"""
Request Tracer — per-request distributed tracing.

Every inbound HTTP request gets a trace_id. Every internal operation
(DB query, engine call, external call) is wrapped in a Span. The
tracer collects spans and returns a Trace object that can be visualized.

Not OpenTelemetry-compatible yet (no OTLP exporter), but the data model
is OTel-shaped so a future adapter can emit spans to Jaeger / Tempo /
Datadog with no code changes.

FastAPI middleware wraps every request in a trace. Individual engine
calls can create child spans via `with tracer.span("ontology.upsert"):`.

Zero dependencies.
"""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex[:16]


@dataclass
class Span:
    span_id: str
    trace_id: str
    parent_span_id: Optional[str]
    operation: str
    started_at: float
    finished_at: Optional[float] = None
    duration_ms: Optional[float] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    status: str = "ok"  # ok | error
    error_message: Optional[str] = None


@dataclass
class Trace:
    trace_id: str
    root_operation: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    total_duration_ms: Optional[float] = None
    span_count: int = 0
    spans: List[Span] = field(default_factory=list)
    attributes: Dict[str, Any] = field(default_factory=dict)


class RequestTracer:
    def __init__(self, max_traces: int = 500) -> None:
        self._traces: Dict[str, Trace] = {}
        self._active_trace_id: Optional[str] = None
        self._active_span_stack: List[str] = []
        self._max_traces = max_traces

    def start_trace(self, operation: str, attributes: Optional[Dict[str, Any]] = None) -> str:
        trace_id = new_id()
        trace = Trace(
            trace_id=trace_id,
            root_operation=operation,
            started_at=utc_now(),
            attributes=dict(attributes or {}),
        )
        self._traces[trace_id] = trace
        self._active_trace_id = trace_id
        # Create the root span
        root_span = Span(
            span_id=new_id(),
            trace_id=trace_id,
            parent_span_id=None,
            operation=operation,
            started_at=time.time(),
        )
        trace.spans.append(root_span)
        self._active_span_stack.append(root_span.span_id)
        self._gc()
        return trace_id

    def finish_trace(
        self,
        trace_id: str,
        *,
        status: str = "ok",
        error_message: Optional[str] = None,
    ) -> Optional[Trace]:
        trace = self._traces.get(trace_id)
        if trace is None:
            return None
        # Finish the root span
        if trace.spans:
            root = trace.spans[0]
            now = time.time()
            root.finished_at = now
            root.duration_ms = (now - root.started_at) * 1000
            root.status = status
            root.error_message = error_message
        trace.finished_at = utc_now()
        if trace.spans and trace.spans[0].duration_ms is not None:
            trace.total_duration_ms = trace.spans[0].duration_ms
        trace.span_count = len(trace.spans)
        self._active_trace_id = None
        self._active_span_stack = []
        return trace

    @contextmanager
    def span(
        self,
        operation: str,
        *,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Iterator[Span]:
        """Context manager for a child span."""
        trace_id = self._active_trace_id
        if trace_id is None:
            # Auto-start a trace if none exists
            trace_id = self.start_trace(operation, attributes)
            yield self._traces[trace_id].spans[0]
            self.finish_trace(trace_id)
            return

        parent_span_id = self._active_span_stack[-1] if self._active_span_stack else None
        span = Span(
            span_id=new_id(),
            trace_id=trace_id,
            parent_span_id=parent_span_id,
            operation=operation,
            started_at=time.time(),
            attributes=dict(attributes or {}),
        )
        trace = self._traces.get(trace_id)
        if trace is None:
            yield span
            return
        trace.spans.append(span)
        self._active_span_stack.append(span.span_id)
        try:
            yield span
        except Exception as exc:
            span.status = "error"
            span.error_message = str(exc)
            raise
        finally:
            now = time.time()
            span.finished_at = now
            span.duration_ms = round((now - span.started_at) * 1000, 3)
            if self._active_span_stack and self._active_span_stack[-1] == span.span_id:
                self._active_span_stack.pop()

    def get(self, trace_id: str) -> Optional[Trace]:
        return self._traces.get(trace_id)

    def recent(self, limit: int = 50) -> List[Trace]:
        traces = list(self._traces.values())
        traces.sort(key=lambda t: t.started_at, reverse=True)
        return traces[:limit]

    def slowest(self, limit: int = 10) -> List[Trace]:
        traces = [t for t in self._traces.values() if t.total_duration_ms is not None]
        traces.sort(key=lambda t: -(t.total_duration_ms or 0))
        return traces[:limit]

    def stats(self) -> Dict[str, Any]:
        done = [t for t in self._traces.values() if t.total_duration_ms is not None]
        if not done:
            return {"total": len(self._traces), "finished": 0, "p50_ms": 0, "p95_ms": 0, "p99_ms": 0}
        durations = sorted(t.total_duration_ms for t in done)
        def _percentile(p: float) -> float:
            idx = max(0, min(len(durations) - 1, int(len(durations) * p / 100)))
            return round(durations[idx], 3)
        return {
            "total": len(self._traces),
            "finished": len(done),
            "p50_ms": _percentile(50),
            "p95_ms": _percentile(95),
            "p99_ms": _percentile(99),
            "max_ms": round(max(durations), 3),
        }

    def _gc(self) -> None:
        if len(self._traces) <= self._max_traces:
            return
        # Drop the oldest traces
        sorted_ids = sorted(
            self._traces.keys(),
            key=lambda tid: self._traces[tid].started_at,
        )
        to_drop = len(self._traces) - self._max_traces
        for tid in sorted_ids[:to_drop]:
            self._traces.pop(tid, None)


_tracer: Optional[RequestTracer] = None


def get_tracer() -> RequestTracer:
    global _tracer
    if _tracer is None:
        _tracer = RequestTracer()
    return _tracer
