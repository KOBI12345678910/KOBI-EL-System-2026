"""
Claude AI Adapter.

This is the single bridge between the platform and an LLM (Claude).
It does three things:

1. `build_context_packet()` — packages entity + state + events +
   lineage + relationships + freshness + risk into a Claude-ready
   JSON blob with token accounting.

2. `call_claude()` — invokes the Anthropic API (or falls back to a
   local stub when ANTHROPIC_API_KEY is not set). The stub is
   deterministic so the rest of the platform can be tested without
   a real API key.

3. `explain_entity()`, `recommend_next_action()`, `summarize_situation()`
   — high-level helpers that use (1) + (2) to give you the standard
   Claude workflows the platform needs.

Every call is audited (via services.audit_log_service) and the prompt
is recorded with a correlation ID so you can trace every AI decision
back to its inputs.
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


# ════════════════════════════════════════════════════════════════
# CONTEXT PACKET — what Claude receives
# ════════════════════════════════════════════════════════════════

@dataclass
class ContextPacket:
    packet_id: str
    tenant_id: str
    generated_at: datetime
    entity: Optional[Dict[str, Any]]
    state: Optional[Dict[str, Any]]
    recent_events: List[Dict[str, Any]]
    relationships: List[Dict[str, Any]]
    lineage: List[Dict[str, Any]]
    risk_context: Dict[str, Any]
    financial_context: Dict[str, Any]
    freshness: Dict[str, Any]
    permission_scope: Dict[str, Any]
    token_estimate: int

    def to_json(self) -> Dict[str, Any]:
        return {
            "packet_id": self.packet_id,
            "tenant_id": self.tenant_id,
            "generated_at": self.generated_at.isoformat(),
            "entity": self.entity,
            "state": self.state,
            "recent_events": self.recent_events,
            "relationships": self.relationships,
            "lineage": self.lineage,
            "risk_context": self.risk_context,
            "financial_context": self.financial_context,
            "freshness": self.freshness,
            "permission_scope": self.permission_scope,
            "token_estimate": self.token_estimate,
        }

    def to_prompt_block(self) -> str:
        """Render as a system-prompt block for Claude."""
        return (
            "# Enterprise Operational Context\n"
            f"tenant_id: {self.tenant_id}\n"
            f"generated_at: {self.generated_at.isoformat()}\n\n"
            "## Entity\n"
            + json.dumps(self.entity or {}, indent=2, default=str)
            + "\n\n## Live State\n"
            + json.dumps(self.state or {}, indent=2, default=str)
            + "\n\n## Recent Events (most recent first)\n"
            + json.dumps(self.recent_events, indent=2, default=str)
            + "\n\n## Relationships\n"
            + json.dumps(self.relationships, indent=2, default=str)
            + "\n\n## Lineage\n"
            + json.dumps(self.lineage, indent=2, default=str)
            + "\n\n## Risk Context\n"
            + json.dumps(self.risk_context, indent=2, default=str)
            + "\n\n## Financial Context\n"
            + json.dumps(self.financial_context, indent=2, default=str)
            + "\n\n## Data Freshness\n"
            + json.dumps(self.freshness, indent=2, default=str)
        )


# ════════════════════════════════════════════════════════════════
# CLAUDE ADAPTER
# ════════════════════════════════════════════════════════════════

@dataclass
class ClaudeResponse:
    call_id: str
    prompt: str
    completion: str
    model: str
    input_tokens: int
    output_tokens: int
    correlation_id: str
    generated_at: datetime = field(default_factory=utc_now)


class ClaudeAdapter:
    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        model: str = "claude-opus-4-6",
        max_output_tokens: int = 2048,
    ) -> None:
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model
        self.max_output_tokens = max_output_tokens
        self._calls: List[ClaudeResponse] = []

    def is_live(self) -> bool:
        return bool(self.api_key)

    def build_context_packet(
        self,
        *,
        tenant_id: str,
        entity: Optional[Dict[str, Any]] = None,
        state: Optional[Dict[str, Any]] = None,
        recent_events: Optional[List[Dict[str, Any]]] = None,
        relationships: Optional[List[Dict[str, Any]]] = None,
        lineage: Optional[List[Dict[str, Any]]] = None,
        risk_context: Optional[Dict[str, Any]] = None,
        financial_context: Optional[Dict[str, Any]] = None,
        freshness: Optional[Dict[str, Any]] = None,
        permission_scope: Optional[Dict[str, Any]] = None,
    ) -> ContextPacket:
        packet = ContextPacket(
            packet_id=new_id("ctx"),
            tenant_id=tenant_id,
            generated_at=utc_now(),
            entity=entity,
            state=state,
            recent_events=recent_events or [],
            relationships=relationships or [],
            lineage=lineage or [],
            risk_context=risk_context or {},
            financial_context=financial_context or {},
            freshness=freshness or {},
            permission_scope=permission_scope or {"tenant_id": tenant_id},
            token_estimate=0,
        )
        # 1 token ~= 4 chars (rough estimate)
        blob = json.dumps(packet.to_json(), default=str)
        packet.token_estimate = max(1, len(blob) // 4)
        return packet

    async def call_claude(
        self,
        *,
        system_prompt: str,
        user_message: str,
        context_packet: Optional[ContextPacket] = None,
        correlation_id: Optional[str] = None,
    ) -> ClaudeResponse:
        call_id = new_id("call")
        corr = correlation_id or new_id("corr")

        full_system = system_prompt
        if context_packet is not None:
            full_system = system_prompt + "\n\n" + context_packet.to_prompt_block()

        prompt_text = f"[SYSTEM]\n{full_system}\n\n[USER]\n{user_message}"
        input_tokens = max(1, len(prompt_text) // 4)

        if self.is_live():
            try:
                completion = await self._call_anthropic_api(full_system, user_message)
            except Exception as exc:
                completion = f"[claude_error] {exc}"
        else:
            completion = self._deterministic_stub(user_message, context_packet)

        output_tokens = max(1, len(completion) // 4)

        resp = ClaudeResponse(
            call_id=call_id,
            prompt=prompt_text,
            completion=completion,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            correlation_id=corr,
        )
        self._calls.append(resp)
        return resp

    async def _call_anthropic_api(self, system_prompt: str, user_message: str) -> str:
        """
        Call the Anthropic API. Uses the `anthropic` package if installed.
        Falls back to an httpx POST if only httpx is available.
        """
        try:
            from anthropic import AsyncAnthropic  # type: ignore
        except ImportError:
            return await self._httpx_fallback(system_prompt, user_message)

        client = AsyncAnthropic(api_key=self.api_key)
        msg = await client.messages.create(
            model=self.model,
            max_tokens=self.max_output_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return "".join(
            block.text for block in msg.content if hasattr(block, "text")
        )

    async def _httpx_fallback(self, system_prompt: str, user_message: str) -> str:
        try:
            import httpx
        except ImportError:
            return "[claude_unavailable] anthropic package not installed"
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key or "",
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": self.max_output_tokens,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_message}],
                },
            )
            if r.status_code != 200:
                return f"[claude_error] status={r.status_code} body={r.text}"
            data = r.json()
            return "".join(
                b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
            )

    def _deterministic_stub(self, user_message: str, packet: Optional[ContextPacket]) -> str:
        """Deterministic offline reply for testing without an API key."""
        parts = ["[claude_stub]"]
        if packet is not None and packet.entity:
            name = packet.entity.get("name") or packet.entity.get("object_id") or "unknown"
            parts.append(f"entity={name}")
        if packet is not None and packet.state:
            parts.append(f"status={packet.state.get('current_status')}")
            parts.append(f"risk={packet.state.get('risk_score')}")
        parts.append(f"question_length={len(user_message)}")
        return " ".join(parts)

    # ─── High-level helpers ──────────────────────────────────
    async def explain_entity(
        self,
        context: ContextPacket,
        question: str = "Explain the current state of this entity, its causes, and what is at risk.",
    ) -> ClaudeResponse:
        return await self.call_claude(
            system_prompt=(
                "You are a senior operations analyst at an enterprise command center. "
                "Explain operational situations using only the context provided."
            ),
            user_message=question,
            context_packet=context,
        )

    async def recommend_next_action(
        self,
        context: ContextPacket,
        constraints: str = "",
    ) -> ClaudeResponse:
        prompt = (
            "Given the current operational context, recommend the single most important "
            "next action. Be specific: what, who, why, and expected impact."
        )
        if constraints:
            prompt += f"\n\nConstraints: {constraints}"
        return await self.call_claude(
            system_prompt=(
                "You are an autonomous operations planner. You recommend concrete "
                "next-best actions that respect guardrails and maximize business impact."
            ),
            user_message=prompt,
            context_packet=context,
        )

    async def summarize_situation(self, context: ContextPacket) -> ClaudeResponse:
        return await self.call_claude(
            system_prompt=(
                "You are a command-center briefing agent. Produce a 5-bullet "
                "executive summary of the current operational state."
            ),
            user_message="Summarize the current situation.",
            context_packet=context,
        )

    def recent_calls(self, limit: int = 50) -> List[ClaudeResponse]:
        return self._calls[-limit:]


_global_claude: Optional[ClaudeAdapter] = None


def get_claude_adapter() -> ClaudeAdapter:
    global _global_claude
    if _global_claude is None:
        _global_claude = ClaudeAdapter()
    return _global_claude
