"""
Rate Limiter — token bucket + sliding window rate limiting.

Two algorithms implemented:

  1. TokenBucket — classic: each caller gets a bucket of N tokens that
     refills at R tokens/second. A request consumes 1 token. Perfect
     for steady-state rate control.

  2. SlidingWindow — tracks the last N seconds of requests in a deque.
     Blocks when the window contains >= limit requests. More fair
     under bursty traffic.

Scoped to a caller_id (usually api_key_id or tenant_id). The default
implementation is in-memory; a distributed deployment can swap in
Redis INCR + TTL.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Deque, Dict, Optional, Tuple


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class RateLimitDecision:
    allowed: bool
    remaining: int
    reset_in_seconds: float
    limit: int
    reason: Optional[str] = None


# ════════════════════════════════════════════════════════════════
# TOKEN BUCKET
# ════════════════════════════════════════════════════════════════

@dataclass
class TokenBucketState:
    tokens: float
    last_refill: float
    capacity: int
    refill_rate_per_sec: float


class TokenBucketRateLimiter:
    def __init__(self, default_capacity: int = 60, default_refill_rate: float = 1.0) -> None:
        self.default_capacity = default_capacity
        self.default_refill_rate = default_refill_rate
        self._buckets: Dict[str, TokenBucketState] = {}

    def consume(
        self,
        caller_id: str,
        *,
        capacity: Optional[int] = None,
        refill_rate_per_sec: Optional[float] = None,
        tokens: int = 1,
    ) -> RateLimitDecision:
        cap = capacity or self.default_capacity
        rate = refill_rate_per_sec or self.default_refill_rate
        now = time.time()
        bucket = self._buckets.get(caller_id)
        if bucket is None:
            bucket = TokenBucketState(
                tokens=float(cap),
                last_refill=now,
                capacity=cap,
                refill_rate_per_sec=rate,
            )
            self._buckets[caller_id] = bucket

        # Refill
        elapsed = now - bucket.last_refill
        bucket.tokens = min(float(cap), bucket.tokens + elapsed * rate)
        bucket.last_refill = now
        bucket.capacity = cap
        bucket.refill_rate_per_sec = rate

        if bucket.tokens >= tokens:
            bucket.tokens -= tokens
            return RateLimitDecision(
                allowed=True,
                remaining=int(bucket.tokens),
                reset_in_seconds=round((cap - bucket.tokens) / rate, 3) if rate > 0 else 0,
                limit=cap,
            )
        return RateLimitDecision(
            allowed=False,
            remaining=int(bucket.tokens),
            reset_in_seconds=round((tokens - bucket.tokens) / rate, 3) if rate > 0 else 0,
            limit=cap,
            reason=f"token_bucket_empty (tokens={bucket.tokens:.2f} < required={tokens})",
        )


# ════════════════════════════════════════════════════════════════
# SLIDING WINDOW
# ════════════════════════════════════════════════════════════════

class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        # caller_id -> deque of timestamps
        self._windows: Dict[str, Deque[float]] = defaultdict(deque)

    def check(
        self,
        caller_id: str,
        *,
        limit: int,
        window_seconds: int,
    ) -> RateLimitDecision:
        now = time.time()
        window = self._windows[caller_id]
        # Purge old entries
        cutoff = now - window_seconds
        while window and window[0] < cutoff:
            window.popleft()
        current = len(window)
        if current >= limit:
            # Time until the oldest entry falls out of the window
            reset = max(0.0, window[0] + window_seconds - now)
            return RateLimitDecision(
                allowed=False,
                remaining=0,
                reset_in_seconds=round(reset, 3),
                limit=limit,
                reason=f"sliding_window_exceeded ({current}/{limit} in {window_seconds}s)",
            )
        window.append(now)
        return RateLimitDecision(
            allowed=True,
            remaining=limit - current - 1,
            reset_in_seconds=window_seconds,
            limit=limit,
        )

    def reset(self, caller_id: str) -> None:
        self._windows.pop(caller_id, None)


# ════════════════════════════════════════════════════════════════
# GLOBAL INSTANCES
# ════════════════════════════════════════════════════════════════

_token_bucket: Optional[TokenBucketRateLimiter] = None
_sliding: Optional[SlidingWindowRateLimiter] = None


def get_token_bucket() -> TokenBucketRateLimiter:
    global _token_bucket
    if _token_bucket is None:
        _token_bucket = TokenBucketRateLimiter(default_capacity=60, default_refill_rate=2.0)
    return _token_bucket


def get_sliding_window() -> SlidingWindowRateLimiter:
    global _sliding
    if _sliding is None:
        _sliding = SlidingWindowRateLimiter()
    return _sliding
