#!/usr/bin/env python3
"""
Elite Dev Unit Orchestrator (v2) - Multi-agent development pipeline
Uses OpenAI ChatAPI with structured outputs + proper JSON validation
"""

import os
import json
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, asdict

import openai
from schemas import (
    CTODecision, ArchitectDecision, BackendPlan, DevOpsPlan, 
    QAPlan, SecurityReview, ProductInsight, TaskType, Status
)

# ============================================
# Configuration
# ============================================

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4-turbo")
ORG_NAME = os.environ.get("ORG_NAME", "HiTech")
TEAM_NAME = os.environ.get("TEAM_NAME", "Elite Dev Unit")

# Validate API key
if not os.environ.get("OPENAI_API_KEY"):
    raise RuntimeError("❌ Missing OPENAI_API_KEY environment variable")

client = openai.OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# ============================================
# Agent Definition
# ============================================

@dataclass
class Agent:
    """AI Agent configuration"""
    role: str
    mission: str
    expertise: List[str]
    output_format: str  # JSON schema name
    
    def system_prompt(self) -> str:
        expertise_text = ", ".join(self.expertise)
        return f"""You are the {self.role} of {TEAM_NAME} at {ORG_NAME}.

Mission: {self.mission}

Expertise areas: {expertise_text}

Guidelines:
- Return ONLY valid, well-formed JSON
- No markdown, no commentary outside JSON
- All fields must be present and properly typed
- Be decisive and clear in recommendations
- Flag risks and assumptions explicitly
- Assume enterprise-scale CRM+ERP platform
- Do not invent specific company data; use placeholders
- Always include timestamp and run_id in response
"""

def iso_utc() -> str:
    """ISO 8601 UTC timestamp"""
    return datetime.utcnow().isoformat() + "Z"

def call_agent_llm(agent: Agent, run_id: str, context: Dict[str, Any], request: str) -> Dict[str, Any]:
    """
    Call OpenAI LLM for agent analysis using chat.completions with JSON mode.
    Returns parsed JSON response.
    """
    messages = [
        {
            "role": "system",
            "content": agent.system_prompt()
        },
        {
            "role": "user",
            "content": f"""run_id: {run_id}
timestamp_utc: {iso_utc()}

CONTEXT:
{json.dumps(context, ensure_ascii=False, indent=2)}

REQUEST:
{request}

Return a JSON object with your analysis."""
        }
    ]
    
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.3,
            response_format={"type": "json_object"},  # Enforce JSON
        )
        
        result_text = response.choices[0].message.content.strip()
        data = json.loads(result_text)
        return data
        
    except json.JSONDecodeError as e:
        print(f"❌ {agent.role}: Invalid JSON response")
        print(f"   Error: {e}")
        raise
    except openai.APIError as e:
        print(f"❌ {agent.role}: API error - {e}")
        raise

# ============================================
# Agent Instances
# ============================================

AGENTS = {
    "cto": Agent(
        role="CTO",
        mission="Set technical direction, enforce architecture standards, make tradeoff decisions",
        expertise=["System Design", "Technology Strategy", "Team Leadership", "Enterprise Standards"],
        output_format="CTODecision"
    ),
    "product": Agent(
        role="Product Manager",
        mission="Turn requests into crisp specs, success metrics, and clear scope",
        expertise=["Requirements Gathering", "User Stories", "Success Metrics", "Scope Definition"],
        output_format="ProductInsight"
    ),
    "architect": Agent(
        role="Tech Architect",
        mission="Design scalable, secure architecture with clear service boundaries",
        expertise=["System Architecture", "Microservices", "Data Modeling", "Scalability"],
        output_format="ArchitectDecision"
    ),
    "backend": Agent(
        role="Backend Lead",
        mission="Translate architecture into implementation tasks and technical requirements",
        expertise=["Backend Systems", "APIs", "Databases", "Performance"],
        output_format="BackendPlan"
    ),
    "devops": Agent(
        role="DevOps Engineer",
        mission="Plan infrastructure, CI/CD, deployments, monitoring, and incident response",
        expertise=["Infrastructure as Code", "Kubernetes", "CI/CD Pipelines", "Observability"],
        output_format="DevOpsPlan"
    ),
    "qa": Agent(
        role="QA Lead",
        mission="Define test strategy: unit, integration, e2e, regression, and performance",
        expertise=["Test Strategy", "Quality Gates", "Test Automation", "Performance Testing"],
        output_format="QAPlan"
    ),
    "security": Agent(
        role="Security Engineer",
        mission="Threat model features and enforce security controls and compliance",
        expertise=["Security Architecture", "OWASP", "Compliance", "Encryption"],
        output_format="SecurityReview"
    ),
}

# ============================================
# Orchestrator
# ============================================

class DevUnitOrchestrator:
    """Manages the multi-agent development pipeline"""
    
    def __init__(self, org: str = ORG_NAME):
        self.org = org
        self.runs: Dict[str, Dict[str, Any]] = {}
    
    def process_feature(self, feature_request: str) -> Dict[str, Any]:
        """
        Process feature request through entire squad pipeline
        Returns comprehensive development plan
        """
        run_id = f"RUN-{uuid.uuid4().hex[:8].upper()}"
        print(f"\n🚀 Starting Elite Dev Unit Pipeline - {run_id}")
        print(f"📋 Request: {feature_request[:60]}...")
        print("=" * 70)
        
        context: Dict[str, Any] = {
            "org": self.org,
            "team": TEAM_NAME,
            "feature_request": feature_request,
            "timestamp_utc": iso_utc(),
            "assumptions": [
                "Enterprise-scale CRM+ERP platform",
                "Multi-tenant with RBAC",
                "Modern tech stack (Python/Go + React)",
                "Kubernetes + GitOps deployment",
            ],
        }
        
        outputs: Dict[str, Dict[str, Any]] = {}
        
        # 1. Product spec
        print("\n1️⃣  Product Manager - crafting specification...")
        try:
            outputs["product"] = call_agent_llm(
                AGENTS["product"],
                run_id,
                context,
                request="Write comprehensive product spec: problem statement, user stories, scope in/out, acceptance criteria, success metrics"
            )
            context["product_spec"] = outputs["product"]
            print("   ✅ Spec complete")
        except Exception as e:
            print(f"   ⚠️  Spec skipped: {e}")
        
        # 2. Architecture design
        print("\n2️⃣  Tech Architect - designing system...")
        try:
            outputs["architect"] = call_agent_llm(
                AGENTS["architect"],
                run_id,
                context,
                request="Design architecture: service boundaries, data model, APIs, scalability approach, security considerations"
            )
            context["architecture"] = outputs["architect"]
            print("   ✅ Architecture complete")
        except Exception as e:
            print(f"   ⚠️  Architecture skipped: {e}")
        
        # 3. CTO decision
        print("\n3️⃣  CTO - setting direction...")
        try:
            outputs["cto"] = call_agent_llm(
                AGENTS["cto"],
                run_id,
                context,
                request="Review proposal and make final decisions: tech stack, architecture approval, key standards, risk assessment, go/no-go recommendation"
            )
            context["cto_decision"] = outputs["cto"]
            print("   ✅ CTO decision complete")
        except Exception as e:
            print(f"   ⚠️  CTO decision skipped: {e}")
        
        # 4. Backend tasks
        print("\n4️⃣  Backend Lead - planning implementation...")
        try:
            outputs["backend"] = call_agent_llm(
                AGENTS["backend"],
                run_id,
                context,
                request="Create detailed backend implementation plan: modules, endpoints, database changes, estimated hours, dependencies, performance impact"
            )
            context["backend_plan"] = outputs["backend"]
            print("   ✅ Backend plan complete")
        except Exception as e:
            print(f"   ⚠️  Backend plan skipped: {e}")
        
        # 5. DevOps infrastructure
        print("\n5️⃣  DevOps Engineer - planning infrastructure...")
        try:
            outputs["devops"] = call_agent_llm(
                AGENTS["devops"],
                run_id,
                context,
                request="Plan infrastructure: CI/CD changes, Kubernetes manifests needed, Terraform modules, monitoring setup, rollout strategy, rollback procedure"
            )
            context["devops_plan"] = outputs["devops"]
            print("   ✅ DevOps plan complete")
        except Exception as e:
            print(f"   ⚠️  DevOps plan skipped: {e}")
        
        # 6. QA testing strategy
        print("\n6️⃣  QA Lead - defining test strategy...")
        try:
            outputs["qa"] = call_agent_llm(
                AGENTS["qa"],
                run_id,
                context,
                request="Define test strategy: test types, test cases, coverage target, performance benchmarks, regression areas, release gates"
            )
            context["qa_plan"] = outputs["qa"]
            print("   ✅ QA plan complete")
        except Exception as e:
            print(f"   ⚠️  QA plan skipped: {e}")
        
        # 7. Security review
        print("\n7️⃣  Security Engineer - threat modeling...")
        try:
            outputs["security"] = call_agent_llm(
                AGENTS["security"],
                run_id,
                context,
                request="Perform security review: identify risks, required security controls, OWASP concerns, data protection needs, compliance requirements, security score"
            )
            context["security_review"] = outputs["security"]
            print("   ✅ Security review complete")
        except Exception as e:
            print(f"   ⚠️  Security review skipped: {e}")
        
        # Build final summary
        summary = {
            "run_id": run_id,
            "timestamp_utc": iso_utc(),
            "feature_request": feature_request,
            "organization": self.org,
            "team": TEAM_NAME,
            "status": "READY_FOR_DEVELOPMENT",
            "outputs": outputs,
            "next_steps": [
                "Review all agent outputs",
                "Prioritize by risk and effort",
                "Create development sprints",
                "Assign squad leads",
                "Track execution",
            ]
        }
        
        self.runs[run_id] = summary
        
        print("\n" + "=" * 70)
        print(f"✅ Pipeline complete - {run_id}")
        print(f"📊 Generated outputs from {len(outputs)} agents")
        return summary
    
    def export_report(self, run_id: str, filename: str = "run_output.json") -> str:
        """Export run report to JSON file"""
        if run_id not in self.runs:
            raise ValueError(f"Run {run_id} not found")
        
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(self.runs[run_id], f, ensure_ascii=False, indent=2)
        
        print(f"📄 Report exported: {filename}")
        return filename

# ============================================
# Main CLI
# ============================================

def main():
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Elite Dev Unit - Multi-agent feature development pipeline"
    )
    parser.add_argument(
        "--request", 
        required=True,
        help="Feature request or development initiative"
    )
    parser.add_argument(
        "--out",
        default="elite_run_output.json",
        help="Output JSON file"
    )
    
    args = parser.parse_args()
    
    orchestrator = DevUnitOrchestrator()
    result = orchestrator.process_feature(args.request)
    orchestrator.export_report(result["run_id"], args.out)
    
    print(f"\n✨ Output: {args.out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())