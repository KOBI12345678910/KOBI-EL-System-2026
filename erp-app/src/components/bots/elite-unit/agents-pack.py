#!/usr/bin/env python3
"""
Elite Pack Agents - Strategic Constraints & Design
Executes BEFORE Backend/Frontend/QA to define guardrails
"""

from dataclasses import dataclass
from typing import Any, Dict, List

@dataclass
class PackAgent:
    name: str
    role: str
    system_prompt: str
    output_schema: Dict[str, Any]

SCHEMA_COMMON = {
    "type": "object",
    "properties": {
        "agent": {"type": "string"},
        "summary": {"type": "string"},
        "decisions": {"type": "array", "items": {"type": "string"}},
        "risks": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "array", "items": {"type": "string"}},
        "artifacts": {"type": "object"},
    },
    "required": ["summary", "decisions", "risks", "actions"],
}

SCHEMA_ROADMAP = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "north_star": {"type": "string"},
                "quarterly_milestones": {"type": "array", "items": {"type": "string"}},
                "monthly_outcomes": {"type": "array", "items": {"type": "string"}},
                "kill_list": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}

SCHEMA_RAG = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "files_to_read": {"type": "array", "items": {"type": "string"}},
                "questions_to_answer": {"type": "array", "items": {"type": "string"}},
                "codebase_notes": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}

SCHEMA_STYLE = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "style_rules": {"type": "array", "items": {"type": "string"}},
                "lint_config": {"type": "object"},
            },
        },
    },
}

SCHEMA_PERF = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "perf_budget": {"type": "array", "items": {"type": "string"}},
                "benchmarks": {"type": "array", "items": {"type": "string"}},
                "monitoring_metrics": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}

SCHEMA_DATA = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "entities": {"type": "array", "items": {"type": "string"}},
                "events": {"type": "array", "items": {"type": "string"}},
                "metrics": {"type": "array", "items": {"type": "string"}},
                "retention_days": {"type": "number"},
            },
        },
    },
}

SCHEMA_COMPLIANCE = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "policies": {"type": "array", "items": {"type": "string"}},
                "data_handling": {"type": "array", "items": {"type": "string"}},
                "audit_requirements": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}

SCHEMA_UX = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "key_screens": {"type": "array", "items": {"type": "string"}},
                "ux_principles": {"type": "array", "items": {"type": "string"}},
                "accessibility_rules": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}

SCHEMA_GROWTH = {
    **SCHEMA_COMMON,
    "properties": {
        **SCHEMA_COMMON["properties"],
        "artifacts": {
            "type": "object",
            "properties": {
                "activation_metrics": {"type": "array", "items": {"type": "string"}},
                "retention_loops": {"type": "array", "items": {"type": "string"}},
                "growth_experiments": {"type": "array", "items": {"type": "string"}},
            },
        },
    },
}

PACK_AGENTS: List[PackAgent] = [
    PackAgent(
        name="RoadmapCommander",
        role="Roadmap Commander",
        system_prompt=(
            "You are ROADMAP COMMANDER (elite strategy). "
            "Define north-star vision, quarterly milestones, and WHAT NOT TO BUILD. "
            "Be strategic and specific. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_ROADMAP,
    ),
    PackAgent(
        name="RAGNavigator",
        role="RAG Navigator",
        system_prompt=(
            "You are RAG NAVIGATOR (elite). "
            "Given current context, decide what code files MUST be read BEFORE generating new code. "
            "Specify questions to answer about codebase. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_RAG,
    ),
    PackAgent(
        name="CodeStyleGuardian",
        role="Code Style Guardian",
        system_prompt=(
            "You are CODE STYLE GUARDIAN (elite). "
            "Define style rules, linting configs, code quality gates. "
            "Be prescriptive. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_STYLE,
    ),
    PackAgent(
        name="PerformanceEngineer",
        role="Performance Engineer",
        system_prompt=(
            "You are PERFORMANCE ENGINEER (elite). "
            "Set performance budgets, benchmarks, latency requirements, monitoring metrics. "
            "Be measurable. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_PERF,
    ),
    PackAgent(
        name="DataPlatformLead",
        role="Data Platform Lead",
        system_prompt=(
            "You are DATA PLATFORM LEAD (elite). "
            "Define data entities, analytics events, metrics, retention policies. "
            "Be comprehensive. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_DATA,
    ),
    PackAgent(
        name="ComplianceOfficer",
        role="Compliance Officer",
        system_prompt=(
            "You are COMPLIANCE OFFICER (elite). "
            "Define policies, data handling rules, audit requirements, security constraints. "
            "Be strict. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_COMPLIANCE,
    ),
    PackAgent(
        name="UXStrategist",
        role="UX Strategist",
        system_prompt=(
            "You are UX STRATEGIST (elite). "
            "Define key screens, UX principles, accessibility rules, user flows. "
            "Be user-centric. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_UX,
    ),
    PackAgent(
        name="GrowthEngineer",
        role="Growth Engineer",
        system_prompt=(
            "You are GROWTH ENGINEER (elite). "
            "Define activation metrics, retention loops, growth experiments for CRM+ERP system. "
            "Be data-driven. Output ONLY valid JSON."
        ),
        output_schema=SCHEMA_GROWTH,
    ),
]

def get_pack_agent_by_name(name: str) -> PackAgent:
    """Get pack agent by name"""
    for agent in PACK_AGENTS:
        if agent.name == name:
            return agent
    raise ValueError(f"Pack agent not found: {name}")

if __name__ == "__main__":
    print("🎯 Elite Pack Agents")
    print("=" * 70)
    for agent in PACK_AGENTS:
        print(f"  • {agent.name:.<30} {agent.role}")
    print(f"{'=' * 70}")
    print(f"Total: {len(PACK_AGENTS)} agents")