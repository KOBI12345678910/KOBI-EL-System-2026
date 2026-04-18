"""
סכמות JSON מובנות לכל תפקיד בחוליה העלית
Structured Outputs לאוטומציה מלאה
"""

from typing import Any, List, Dict, Optional
from dataclasses import dataclass
from enum import Enum

# ============================================
# Enums
# ============================================

class TaskType(str, Enum):
    FEATURE = "feature"
    BUG = "bug"
    INCIDENT = "incident"
    REFACTOR = "refactor"
    INFRASTRUCTURE = "infrastructure"
    SECURITY = "security"

class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class Status(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"

# ============================================
# Agent Output Schemas
# ============================================

@dataclass
class CTODecision:
    """CTO/Head of R&D - החלטות אסטרטגיות"""
    task_id: str
    priority: Severity
    architecture_alignment: str
    tech_recommendations: List[str]
    blockers: List[str]
    approval_status: bool
    reasoning: str
    estimated_impact: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "priority": self.priority.value,
            "architecture_alignment": self.architecture_alignment,
            "tech_recommendations": self.tech_recommendations,
            "blockers": self.blockers,
            "approval_status": self.approval_status,
            "reasoning": self.reasoning,
            "estimated_impact": self.estimated_impact
        }

@dataclass
class ArchitectDecision:
    """Tech Architect - ארכיטקטורה וסקייל"""
    task_id: str
    architecture_pattern: str
    microservices_required: List[str]
    database_changes: Optional[str]
    scalability_score: int  # 1-10
    dependencies: List[str]
    risks: List[str]
    deployment_strategy: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "architecture_pattern": self.architecture_pattern,
            "microservices_required": self.microservices_required,
            "database_changes": self.database_changes,
            "scalability_score": self.scalability_score,
            "dependencies": self.dependencies,
            "risks": self.risks,
            "deployment_strategy": self.deployment_strategy
        }

@dataclass
class BackendPlan:
    """Backend Lead - תכנית יישום"""
    task_id: str
    modules_to_modify: List[str]
    new_endpoints: List[Dict[str, str]]
    database_queries: List[str]
    estimated_hours: float
    dependencies: List[str]
    test_coverage_plan: str
    performance_impact: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "modules_to_modify": self.modules_to_modify,
            "new_endpoints": self.new_endpoints,
            "database_queries": self.database_queries,
            "estimated_hours": self.estimated_hours,
            "dependencies": self.dependencies,
            "test_coverage_plan": self.test_coverage_plan,
            "performance_impact": self.performance_impact
        }

@dataclass
class FrontendPlan:
    """Frontend Lead - ממשק משתמש"""
    task_id: str
    components_to_create: List[str]
    components_to_modify: List[str]
    ui_changes: str
    accessibility_notes: str
    estimated_hours: float
    design_system_usage: List[str]
    responsive_breakpoints: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "components_to_create": self.components_to_create,
            "components_to_modify": self.components_to_modify,
            "ui_changes": self.ui_changes,
            "accessibility_notes": self.accessibility_notes,
            "estimated_hours": self.estimated_hours,
            "design_system_usage": self.design_system_usage,
            "responsive_breakpoints": self.responsive_breakpoints
        }

@dataclass
class DevOpsPlan:
    """DevOps/Platform Lead - תשתיות וסקייל"""
    task_id: str
    infrastructure_changes: List[str]
    kubernetes_manifests_required: bool
    terraform_modules: List[str]
    monitoring_metrics: List[str]
    ci_cd_pipeline_changes: str
    rollback_strategy: str
    estimated_deployment_time_minutes: int
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "infrastructure_changes": self.infrastructure_changes,
            "kubernetes_manifests_required": self.kubernetes_manifests_required,
            "terraform_modules": self.terraform_modules,
            "monitoring_metrics": self.monitoring_metrics,
            "ci_cd_pipeline_changes": self.ci_cd_pipeline_changes,
            "rollback_strategy": self.rollback_strategy,
            "estimated_deployment_time_minutes": self.estimated_deployment_time_minutes
        }

@dataclass
class QAPlan:
    """QA Lead - בדיקות ואיכות"""
    task_id: str
    test_types_required: List[str]
    test_cases: List[str]
    coverage_target: int  # %
    performance_benchmarks: Dict[str, Any]
    regression_areas: List[str]
    test_data_requirements: str
    estimated_qa_hours: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "test_types_required": self.test_types_required,
            "test_cases": self.test_cases,
            "coverage_target": self.coverage_target,
            "performance_benchmarks": self.performance_benchmarks,
            "regression_areas": self.regression_areas,
            "test_data_requirements": self.test_data_requirements,
            "estimated_qa_hours": self.estimated_qa_hours
        }

@dataclass
class SecurityReview:
    """Security Lead - אבטחה ותקיפה"""
    task_id: str
    security_risks: List[str]
    owasp_top_10_check: Dict[str, bool]
    data_exposure_risk: str
    authentication_required: bool
    encryption_requirements: List[str]
    compliance_checks: List[str]
    penetration_test_needed: bool
    security_score: int  # 1-10
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "security_risks": self.security_risks,
            "owasp_top_10_check": self.owasp_top_10_check,
            "data_exposure_risk": self.data_exposure_risk,
            "authentication_required": self.authentication_required,
            "encryption_requirements": self.encryption_requirements,
            "compliance_checks": self.compliance_checks,
            "penetration_test_needed": self.penetration_test_needed,
            "security_score": self.security_score
        }

@dataclass
class ProductInsight:
    """Product Manager - רעיונות וכיוון"""
    task_id: str
    user_impact: str
    business_value: int  # 1-10
    customer_feedback_integration: List[str]
    metrics_to_track: List[str]
    success_criteria: List[str]
    competitor_analysis: Optional[str]
    go_to_market_plan: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "user_impact": self.user_impact,
            "business_value": self.business_value,
            "customer_feedback_integration": self.customer_feedback_integration,
            "metrics_to_track": self.metrics_to_track,
            "success_criteria": self.success_criteria,
            "competitor_analysis": self.competitor_analysis,
            "go_to_market_plan": self.go_to_market_plan
        }

@dataclass
class TechWriterDoc:
    """Tech Writer - תיעוד"""
    task_id: str
    documentation_sections: List[str]
    api_docs_needed: bool
    user_guide_needed: bool
    video_script_needed: bool
    architecture_diagram_needed: bool
    estimated_doc_hours: float
    localization_languages: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "documentation_sections": self.documentation_sections,
            "api_docs_needed": self.api_docs_needed,
            "user_guide_needed": self.user_guide_needed,
            "video_script_needed": self.video_script_needed,
            "architecture_diagram_needed": self.architecture_diagram_needed,
            "estimated_doc_hours": self.estimated_doc_hours,
            "localization_languages": self.localization_languages
        }

@dataclass
class ReleaseCoordinatorPlan:
    """Release Manager - שחרור לפרודקשן"""
    task_id: str
    feature_flags_required: List[str]
    canary_release_percentage: int
    rollout_schedule: str
    monitoring_plan: List[str]
    rollback_criteria: str
    customer_communication: str
    stakeholder_sign_offs: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "feature_flags_required": self.feature_flags_required,
            "canary_release_percentage": self.canary_release_percentage,
            "rollout_schedule": self.rollout_schedule,
            "monitoring_plan": self.monitoring_plan,
            "rollback_criteria": self.rollback_criteria,
            "customer_communication": self.customer_communication,
            "stakeholder_sign_offs": self.stakeholder_sign_offs
        }

@dataclass
class EliteSquadSummary:
    """סיכום התאום מכל הסוכנים"""
    task_id: str
    task_type: TaskType
    overall_status: Status
    timeline_days: float
    total_effort_hours: float
    critical_risks: List[str]
    dependencies_on_other_squads: List[str]
    go_no_go_decision: bool
    next_steps: List[str]
    responsible_squad: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "task_type": self.task_type.value,
            "overall_status": self.overall_status.value,
            "timeline_days": self.timeline_days,
            "total_effort_hours": self.total_effort_hours,
            "critical_risks": self.critical_risks,
            "dependencies_on_other_squads": self.dependencies_on_other_squads,
            "go_no_go_decision": self.go_no_go_decision,
            "next_steps": self.next_steps,
            "responsible_squad": self.responsible_squad
        }