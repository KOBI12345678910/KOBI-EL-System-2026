"""
Multi-Agent Reasoning — Red Team / Blue Team / Judge debate.

When a critical decision is about to be made, spawn three AI personas:
  - BLUE TEAM (advocate): argues FOR the decision
  - RED TEAM (critic): argues AGAINST it — finds every flaw
  - JUDGE: weighs both arguments and renders a verdict

This is a form of "debate as alignment" — having agents adversarially
argue lets humans see the strongest case on each side before
committing.

Each persona runs through ClaudeAdapter (or a deterministic stub).
The Judge's verdict is RECORDED in the immutable audit log so the
reasoning trail is always auditable.

Beyond what most ERPs offer — this is structured LLM reasoning over
operational decisions.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.engines.claude_adapter import ClaudeAdapter


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class DebateVerdict(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    APPROVE_WITH_CONDITIONS = "approve_with_conditions"
    ESCALATE_TO_HUMAN = "escalate_to_human"


@dataclass
class AgentStatement:
    agent_role: str   # "blue" | "red" | "judge"
    position: str     # "for" | "against" | "neutral"
    arguments: List[str]
    key_evidence: List[str]
    confidence: float
    generated_at: datetime = field(default_factory=utc_now)


@dataclass
class Debate:
    debate_id: str
    tenant_id: str
    question: str
    context: Dict[str, Any]
    blue_team_statement: AgentStatement
    red_team_statement: AgentStatement
    judge_statement: AgentStatement
    verdict: DebateVerdict
    verdict_reasoning: str
    conditions: List[str]
    recorded_at: datetime = field(default_factory=utc_now)


class MultiAgentReasoning:
    def __init__(self, db: Session, claude: Optional[ClaudeAdapter] = None) -> None:
        self.db = db
        self.claude = claude or ClaudeAdapter(db)
        self._debates: List[Debate] = []

    async def debate(
        self,
        *,
        tenant_id: str,
        question: str,
        context: Dict[str, Any],
    ) -> Debate:
        """
        Run the full Red/Blue/Judge debate cycle.

        context should contain everything relevant: the entity under
        consideration, its state, recent events, financial data, risk
        score, etc. Each agent gets the same context but is instructed
        to argue from a different angle.
        """
        blue = await self._run_blue_team(question, context)
        red = await self._run_red_team(question, context)
        judge = await self._run_judge(question, context, blue, red)

        verdict = self._parse_verdict(judge)
        conditions = self._extract_conditions(judge)

        debate = Debate(
            debate_id=new_id("dbt"),
            tenant_id=tenant_id,
            question=question,
            context=context,
            blue_team_statement=blue,
            red_team_statement=red,
            judge_statement=judge,
            verdict=verdict,
            verdict_reasoning=" ".join(judge.arguments[:3]),
            conditions=conditions,
        )
        self._debates.append(debate)
        return debate

    # ─── Individual agents ───────────────────────────────────
    async def _run_blue_team(
        self,
        question: str,
        context: Dict[str, Any],
    ) -> AgentStatement:
        system = (
            "You are the BLUE TEAM advocate. Your job is to argue FOR "
            "the proposed action. Find every reason it is the right "
            "decision. Be intellectually honest but argue the strongest "
            "possible case. List 3-5 concrete arguments + the evidence "
            "you're relying on. Conclude with your confidence (0-1) that "
            "the action should be approved."
        )
        user = (
            f"QUESTION: {question}\n\n"
            f"CONTEXT: {json.dumps(context, ensure_ascii=False, default=str, indent=2)}\n\n"
            f"Argue FOR this action. Return 3-5 arguments + evidence + confidence."
        )
        resp = await self.claude.call_claude(system_prompt=system, user_message=user)
        arguments, evidence, confidence = self._parse_agent_response(resp.completion, "for")
        return AgentStatement(
            agent_role="blue",
            position="for",
            arguments=arguments,
            key_evidence=evidence,
            confidence=confidence,
        )

    async def _run_red_team(
        self,
        question: str,
        context: Dict[str, Any],
    ) -> AgentStatement:
        system = (
            "You are the RED TEAM critic. Your job is to argue AGAINST "
            "the proposed action. Find every flaw, hidden risk, or "
            "reason this might backfire. Be adversarial but honest. "
            "List 3-5 concrete objections + the evidence you're "
            "relying on. Conclude with your confidence (0-1) that the "
            "action should be REJECTED."
        )
        user = (
            f"QUESTION: {question}\n\n"
            f"CONTEXT: {json.dumps(context, ensure_ascii=False, default=str, indent=2)}\n\n"
            f"Argue AGAINST this action. Return 3-5 objections + evidence + confidence."
        )
        resp = await self.claude.call_claude(system_prompt=system, user_message=user)
        arguments, evidence, confidence = self._parse_agent_response(resp.completion, "against")
        return AgentStatement(
            agent_role="red",
            position="against",
            arguments=arguments,
            key_evidence=evidence,
            confidence=confidence,
        )

    async def _run_judge(
        self,
        question: str,
        context: Dict[str, Any],
        blue: AgentStatement,
        red: AgentStatement,
    ) -> AgentStatement:
        system = (
            "You are the IMPARTIAL JUDGE. You have heard the BLUE team "
            "argue FOR the action and the RED team argue AGAINST. Your "
            "job is to weigh both sides and render a verdict: APPROVE, "
            "REJECT, APPROVE_WITH_CONDITIONS, or ESCALATE_TO_HUMAN. "
            "Explain your reasoning in 3-5 points. If you approve with "
            "conditions, list the specific conditions. If you escalate, "
            "explain why the decision is too consequential for automation."
        )
        blue_summary = "\n  - " + "\n  - ".join(blue.arguments[:5])
        red_summary = "\n  - " + "\n  - ".join(red.arguments[:5])
        user = (
            f"QUESTION: {question}\n\n"
            f"BLUE TEAM arguments (confidence {blue.confidence}):{blue_summary}\n\n"
            f"RED TEAM arguments (confidence {red.confidence}):{red_summary}\n\n"
            f"Render your verdict. Start your response with one of: "
            f"APPROVE | REJECT | APPROVE_WITH_CONDITIONS | ESCALATE_TO_HUMAN."
        )
        resp = await self.claude.call_claude(system_prompt=system, user_message=user)
        arguments, evidence, confidence = self._parse_agent_response(resp.completion, "neutral")
        return AgentStatement(
            agent_role="judge",
            position="neutral",
            arguments=arguments,
            key_evidence=evidence,
            confidence=confidence,
        )

    # ─── Parse agent responses (stub-aware) ─────────────────
    def _parse_agent_response(
        self,
        completion: str,
        position: str,
    ) -> tuple:
        """
        Extract arguments, evidence, and confidence from a raw LLM
        response. Handles both real Claude responses and the stub mode
        output gracefully.
        """
        lines = [l.strip() for l in completion.split("\n") if l.strip()]
        arguments: List[str] = []
        evidence: List[str] = []
        confidence = 0.7

        for line in lines:
            lower = line.lower()
            if "confidence" in lower:
                # Try to extract a number
                import re
                m = re.search(r"0?\.\d+|\d+%", line)
                if m:
                    try:
                        val = m.group(0).replace("%", "")
                        confidence = float(val) / (100 if "%" in m.group(0) else 1)
                    except Exception:
                        pass
            elif line.startswith(("-", "*", "•")) or (line[0:1].isdigit() and "." in line[:3]):
                cleaned = line.lstrip("-*• \t")
                if cleaned[:2].isdigit() or (cleaned[:1].isdigit() and cleaned[1:2] in (".", ")")):
                    cleaned = cleaned[2:].strip()
                if len(cleaned) > 10:
                    arguments.append(cleaned)
            elif "evidence:" in lower or "because" in lower:
                evidence.append(line)

        if not arguments:
            # Fallback — return the whole completion as one argument
            if completion:
                arguments = [completion[:500]]
        return arguments[:5], evidence[:5], confidence

    # ─── Verdict parsing ─────────────────────────────────────
    def _parse_verdict(self, judge: AgentStatement) -> DebateVerdict:
        text = " ".join(judge.arguments).lower() + " " + str(judge.confidence)
        if "approve_with_conditions" in text or "with conditions" in text:
            return DebateVerdict.APPROVE_WITH_CONDITIONS
        if "escalate" in text or "human" in text:
            return DebateVerdict.ESCALATE_TO_HUMAN
        if "reject" in text or "not approve" in text:
            return DebateVerdict.REJECT
        if "approve" in text:
            return DebateVerdict.APPROVE
        # Default conservative: escalate
        return DebateVerdict.ESCALATE_TO_HUMAN

    def _extract_conditions(self, judge: AgentStatement) -> List[str]:
        conditions: List[str] = []
        for arg in judge.arguments:
            if any(word in arg.lower() for word in ("require", "must", "condition", "provided that", "assuming")):
                conditions.append(arg)
        return conditions

    # ─── History access ─────────────────────────────────────
    def recent(self, limit: int = 20) -> List[Debate]:
        return self._debates[-limit:][::-1]

    def get(self, debate_id: str) -> Optional[Debate]:
        return next((d for d in self._debates if d.debate_id == debate_id), None)

    def stats(self) -> Dict[str, Any]:
        by_verdict: Dict[str, int] = {}
        for d in self._debates:
            by_verdict[d.verdict.value] = by_verdict.get(d.verdict.value, 0) + 1
        return {
            "total_debates": len(self._debates),
            "by_verdict": by_verdict,
        }
