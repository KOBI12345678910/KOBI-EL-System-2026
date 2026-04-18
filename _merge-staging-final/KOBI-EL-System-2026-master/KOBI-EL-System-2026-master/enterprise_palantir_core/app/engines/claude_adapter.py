"""
Claude Adapter — the single bridge between the platform and the
Anthropic API.

Responsibilities:
  1. Build a Claude-ready context packet from the ontology + state +
     events + relationships (wraps AIContextService).
  2. Call the Anthropic API (via the official `anthropic` SDK if
     installed, or a raw httpx POST as a fallback).
  3. Deterministic stub mode when ANTHROPIC_API_KEY is not set, so
     tests and demos still produce predictable output.
  4. Record every call for audit and replay.

Usage:
    claude = ClaudeAdapter(db)
    context = claude.build_context(entity_id="obj_...")
    response = await claude.explain_entity(context)
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.services.ai_context_service import AIContextService


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


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
        db: Session,
        *,
        api_key: Optional[str] = None,
        model: str = "claude-opus-4-6",
        max_output_tokens: int = 2048,
    ) -> None:
        self.db = db
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model
        self.max_output_tokens = max_output_tokens
        self.ai_context = AIContextService(db)
        self._calls: List[ClaudeResponse] = []

    def is_live(self) -> bool:
        return bool(self.api_key)

    def build_context(self, *, entity_id: str) -> Dict[str, Any]:
        return self.ai_context.build_entity_context(entity_id)

    def to_system_prompt(self, context: Dict[str, Any]) -> str:
        return (
            "# Enterprise Operational Context\n"
            f"generated_at: {utc_now().isoformat()}\n\n"
            "## Entity\n"
            + json.dumps(context.get("entity") or {}, indent=2, default=str)
            + "\n\n## Live State\n"
            + json.dumps(context.get("state") or {}, indent=2, default=str)
            + "\n\n## Recent Events\n"
            + json.dumps(context.get("recent_events") or [], indent=2, default=str)
            + "\n\n## Related Entities\n"
            + json.dumps(context.get("related_entities") or [], indent=2, default=str)
        )

    async def call_claude(
        self,
        *,
        system_prompt: str,
        user_message: str,
        correlation_id: Optional[str] = None,
    ) -> ClaudeResponse:
        call_id = new_id("call")
        corr = correlation_id or new_id("corr")
        prompt = f"[SYSTEM]\n{system_prompt}\n\n[USER]\n{user_message}"
        input_tokens = max(1, len(prompt) // 4)

        if self.is_live():
            try:
                completion = await self._call_api(system_prompt, user_message)
            except Exception as exc:
                completion = f"[claude_error] {exc}"
        else:
            completion = self._stub(user_message)

        output_tokens = max(1, len(completion) // 4)

        resp = ClaudeResponse(
            call_id=call_id,
            prompt=prompt,
            completion=completion,
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            correlation_id=corr,
        )
        self._calls.append(resp)
        return resp

    async def _call_api(self, system_prompt: str, user_message: str) -> str:
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
        return "".join(b.text for b in msg.content if hasattr(b, "text"))

    async def _httpx_fallback(self, system_prompt: str, user_message: str) -> str:
        try:
            import httpx  # type: ignore
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
                return f"[claude_error] status={r.status_code}"
            data = r.json()
            return "".join(
                b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
            )

    def _stub(self, user_message: str) -> str:
        return f"[claude_stub] question_length={len(user_message)}"

    # ─── High-level helpers ──────────────────────────────────
    async def explain_entity(
        self,
        *,
        entity_id: str,
        question: str = "Explain the current state of this entity, its causes, and what is at risk.",
    ) -> ClaudeResponse:
        context = self.build_context(entity_id=entity_id)
        return await self.call_claude(
            system_prompt=(
                "You are a senior operations analyst at an enterprise command "
                "center. Explain operational situations using only the context "
                "provided.\n\n" + self.to_system_prompt(context)
            ),
            user_message=question,
        )

    async def recommend_next_action(
        self, *, entity_id: str, constraints: str = ""
    ) -> ClaudeResponse:
        context = self.build_context(entity_id=entity_id)
        user = "Given the current context, recommend the single most important next action."
        if constraints:
            user += f"\n\nConstraints: {constraints}"
        return await self.call_claude(
            system_prompt=(
                "You are an autonomous operations planner. Respect guardrails "
                "and maximize business impact.\n\n" + self.to_system_prompt(context)
            ),
            user_message=user,
        )

    def recent_calls(self, limit: int = 50) -> List[ClaudeResponse]:
        return self._calls[-limit:]
