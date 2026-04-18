"""
סוכני AI עלית - כל תפקיד בחוליה (Squad)
שימוש ב-OpenAI Responses API עם Structured Outputs
"""

import json
import os
import re
from typing import Optional, Dict, Any
from abc import ABC, abstractmethod
from schemas import (
    CTODecision, ArchitectDecision, BackendPlan, FrontendPlan,
    DevOpsPlan, QAPlan, SecurityReview, ProductInsight, 
    TechWriterDoc, ReleaseCoordinatorPlan, EliteSquadSummary
)

# ============================================
# Base Agent Class
# ============================================

class EliteAgent(ABC):
    """בסיס לכל סוכן בחוליה העלית"""
    
    def __init__(self, role: str, squad: str):
        self.role = role
        self.squad = squad
        self.api_key = os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise RuntimeError("Missing OPENAI_API_KEY")
    
    @abstractmethod
    def analyze(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """ניתוח משימה וחזרה של JSON מובנה"""
        pass
    
    def call_llm(self, system_prompt: str, user_message: str, json_schema: Optional[Dict] = None) -> str:
        """קריאה ל-OpenAI Responses API"""
        import urllib.request
        
        payload = {
            "model": "gpt-4-mini",
            "input": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "temperature": 0.7
        }
        
        if json_schema:
            payload["output_schema"] = json_schema
        
        req = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return self._extract_output_text(data)
        except Exception as e:
            raise RuntimeError(f"LLM call failed: {str(e)}")
    
    def _extract_output_text(self, responses_json: dict) -> str:
        """חילוץ טקסט מ-response"""
        out_text = ""
        for item in responses_json.get("output", []):
            if item.get("type") == "message":
                for c in item.get("content", []):
                    if c.get("type") == "output_text":
                        out_text += c.get("text", "")
        return out_text.strip()

# ============================================
# Specialized Agents
# ============================================

class CTOAgent(EliteAgent):
    """CTO/Head of R&D - החלטות אסטרטגיות וכיוון"""
    
    def __init__(self):
        super().__init__("CTO", "leadership")
    
    def analyze(self, task_data: Dict[str, Any]) -> CTODecision:
        system = """אתה CTO של חברת הטכנולוגיה המובילה בעולם.
        החלטותיך מכוונות את כל הפיתוח וקובעות את הכיוון הטכנולוגי.
        החזר החלטה אסטרטגית עם סדר עדיפויות ודרישות ארכיטקטורה."""
        
        user = f"""משימה: {task_data.get('description')}
        Type: {task_data.get('type')}
        זמן עד להשלמה: {task_data.get('deadline')}
        
        אנא בחן את ההשלכות הטכנולוגיות וקבל החלטה."""
        
        result = self.call_llm(system, user)
        try:
            data = json.loads(result)
            return CTODecision(
                task_id=task_data.get("id"),
                priority=data.get("priority", "medium"),
                architecture_alignment=data.get("architecture_alignment", ""),
                tech_recommendations=data.get("tech_recommendations", []),
                blockers=data.get("blockers", []),
                approval_status=data.get("approval_status", False),
                reasoning=data.get("reasoning", ""),
                estimated_impact=data.get("estimated_impact", {})
            )
        except:
            return CTODecision(
                task_id=task_data.get("id"),
                priority="high",
                architecture_alignment="requires_review",
                tech_recommendations=[],
                blockers=["Unable to parse LLM response"],
                approval_status=False,
                reasoning=result,
                estimated_impact={}
            )

class ArchitectAgent(EliteAgent):
    """Tech Architect - ארכיטקטורה וסקייל"""
    
    def __init__(self):
        super().__init__("Architect", "architecture")
    
    def analyze(self, task_data: Dict[str, Any]) -> ArchitectDecision:
        system = """אתה Architect בחוליה העלית.
        מטלתך: ספק ארכיטקטורה מעקלטה, סקיילית וביטוחית.
        התחשב במיקרוסרוויסים, מסדי נתונים וביצועים."""
        
        user = f"""משימה טכנית: {task_data.get('description')}
        דרישות ביצוע: {task_data.get('performance_requirements')}
        סקייל צפוי: {task_data.get('expected_scale')}"""
        
        result = self.call_llm(system, user)
        try:
            data = json.loads(result)
            return ArchitectDecision(
                task_id=task_data.get("id"),
                architecture_pattern=data.get("architecture_pattern", "microservices"),
                microservices_required=data.get("microservices", []),
                database_changes=data.get("database_changes"),
                scalability_score=data.get("scalability_score", 5),
                dependencies=data.get("dependencies", []),
                risks=data.get("risks", []),
                deployment_strategy=data.get("deployment_strategy", "canary")
            )
        except:
            return ArchitectDecision(
                task_id=task_data.get("id"),
                architecture_pattern="tbd",
                microservices_required=[],
                database_changes=None,
                scalability_score=0,
                dependencies=[],
                risks=["Parse error"],
                deployment_strategy="tbd"
            )

class BackendAgent(EliteAgent):
    """Backend Lead - תכנית יישום"""
    
    def __init__(self):
        super().__init__("Backend", "backend")
    
    def analyze(self, task_data: Dict[str, Any]) -> BackendPlan:
        system = """אתה Backend Lead.
        חזר עם תכנית יישום ברורה: מודולים, endpoints, שאילתות מסד נתונים."""
        
        user = f"""משימה backend: {task_data.get('description')}
        ארכיטקטורה: {task_data.get('architecture')}"""
        
        result = self.call_llm(system, user)
        try:
            data = json.loads(result)
            return BackendPlan(
                task_id=task_data.get("id"),
                modules_to_modify=data.get("modules", []),
                new_endpoints=data.get("endpoints", []),
                database_queries=data.get("queries", []),
                estimated_hours=data.get("hours", 40),
                dependencies=data.get("dependencies", []),
                test_coverage_plan=data.get("coverage", "80%"),
                performance_impact=data.get("performance", "neutral")
            )
        except:
            return BackendPlan(
                task_id=task_data.get("id"),
                modules_to_modify=[],
                new_endpoints=[],
                database_queries=[],
                estimated_hours=0,
                dependencies=[],
                test_coverage_plan="tbd",
                performance_impact="tbd"
            )

class DevOpsAgent(EliteAgent):
    """DevOps/Platform Lead - תשתיות וסקייל"""
    
    def __init__(self):
        super().__init__("DevOps", "infrastructure")
    
    def analyze(self, task_data: Dict[str, Any]) -> DevOpsPlan:
        system = """אתה DevOps Engineer בחוליה העלית.
        ספק תוכנית למטן, Kubernetes, Terraform, ניטור."""
        
        user = f"""משימת infra: {task_data.get('description')}
        סקייל: {task_data.get('scale')}"""
        
        result = self.call_llm(system, user)
        try:
            data = json.loads(result)
            return DevOpsPlan(
                task_id=task_data.get("id"),
                infrastructure_changes=data.get("infra_changes", []),
                kubernetes_manifests_required=data.get("k8s", True),
                terraform_modules=data.get("terraform", []),
                monitoring_metrics=data.get("metrics", []),
                ci_cd_pipeline_changes=data.get("ci_cd", ""),
                rollback_strategy=data.get("rollback", "blue-green"),
                estimated_deployment_time_minutes=data.get("deployment_time", 30)
            )
        except:
            return DevOpsPlan(
                task_id=task_data.get("id"),
                infrastructure_changes=[],
                kubernetes_manifests_required=False,
                terraform_modules=[],
                monitoring_metrics=[],
                ci_cd_pipeline_changes="tbd",
                rollback_strategy="manual",
                estimated_deployment_time_minutes=0
            )

class QAAgent(EliteAgent):
    """QA Lead - בדיקות ואיכות"""
    
    def __init__(self):
        super().__init__("QA", "quality")
    
    def analyze(self, task_data: Dict[str, Any]) -> QAPlan:
        system = """אתה QA Lead.
        חזור עם תוכנית בדיקות: יחידות, integration, e2e, ביצועים."""
        
        user = f"""משימה: {task_data.get('description')}"""
        
        result = self.call_llm(system, user)
        try:
            data = json.loads(result)
            return QAPlan(
                task_id=task_data.get("id"),
                test_types_required=data.get("test_types", ["unit", "integration"]),
                test_cases=data.get("test_cases", []),
                coverage_target=data.get("coverage", 80),
                performance_benchmarks=data.get("benchmarks", {}),
                regression_areas=data.get("regression", []),
                test_data_requirements=data.get("test_data", ""),
                estimated_qa_hours=data.get("qa_hours", 20)
            )
        except:
            return QAPlan(
                task_id=task_data.get("id"),
                test_types_required=[],
                test_cases=[],
                coverage_target=0,
                performance_benchmarks={},
                regression_areas=[],
                test_data_requirements="",
                estimated_qa_hours=0
            )

class SecurityAgent(EliteAgent):
    """Security Lead - אבטחה ותקיפה"""
    
    def __init__(self):
        super().__init__("Security", "security")
    
    def analyze(self, task_data: Dict[str, Any]) -> SecurityReview:
        system = """אתה Security Lead.
        בדוק OWASP, encryption, data exposure, compliance."""
        
        user = f"""משימה: {task_data.get('description')}
        סוג נתונים: {task_data.get('data_type')}"""
        
        result = self.call_llm(system, user)
        try:
            data = json.loads(result)
            return SecurityReview(
                task_id=task_data.get("id"),
                security_risks=data.get("risks", []),
                owasp_top_10_check=data.get("owasp", {}),
                data_exposure_risk=data.get("exposure", "low"),
                authentication_required=data.get("auth", False),
                encryption_requirements=data.get("encryption", []),
                compliance_checks=data.get("compliance", []),
                penetration_test_needed=data.get("pen_test", False),
                security_score=data.get("score", 5)
            )
        except:
            return SecurityReview(
                task_id=task_data.get("id"),
                security_risks=[],
                owasp_top_10_check={},
                data_exposure_risk="unknown",
                authentication_required=False,
                encryption_requirements=[],
                compliance_checks=[],
                penetration_test_needed=False,
                security_score=0
            )

class ProductAgent(EliteAgent):
    """Product Manager - רעיונות וכיוון"""
    
    def __init__(self):
        super().__init__("Product", "product")
    
    def analyze(self, task_data: Dict[str, Any]) -> ProductInsight:
        system = """אתה Product Manager.
        חזור עם הערכת ערך עסקי, השפעה על משתמש, מדדי הצלחה."""
        
        user = f"""פיצ'ר/משימה: {task_data.get('description')}"""
        
        result = self.call_llm(system, user)
        try:
            data = json.loads(result)
            return ProductInsight(
                task_id=task_data.get("id"),
                user_impact=data.get("impact", ""),
                business_value=data.get("value", 5),
                customer_feedback_integration=data.get("feedback", []),
                metrics_to_track=data.get("metrics", []),
                success_criteria=data.get("success", []),
                competitor_analysis=data.get("competitors"),
                go_to_market_plan=data.get("gtm", "")
            )
        except:
            return ProductInsight(
                task_id=task_data.get("id"),
                user_impact="tbd",
                business_value=0,
                customer_feedback_integration=[],
                metrics_to_track=[],
                success_criteria=[],
                competitor_analysis=None,
                go_to_market_plan="tbd"
            )