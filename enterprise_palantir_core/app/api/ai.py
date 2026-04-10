"""
AI API — the "beyond Palantir" tier.

Exposes:
  - Causal inference (Pearl do-calculus)
  - Knowledge graph embeddings (TransE)
  - Change point detection
  - Counterfactual explanations
  - Multi-agent reasoning debate
  - Bayesian beliefs
  - Reinforcement learning bandits
  - Autonomous AI Operator (self-driving platform)
  - Graph summarizer (executive briefing)
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.engines.autonomous_ai_operator import (
    OperatorConfig,
    OperatorPersonality,
    get_autonomous_operator,
)
from app.engines.bayesian_beliefs import get_bayesian_beliefs
from app.engines.causal_inference import CausalInferenceEngine, CausalQuery, Intervention
from app.engines.change_point_detection import ChangePointDetector, ChangePointMethod
from app.engines.counterfactual_explainer import CounterfactualExplainer
from app.engines.graph_summarizer import GraphSummarizer
from app.engines.kg_embeddings import KGEmbeddingEngine
from app.engines.multi_agent_reasoning import MultiAgentReasoning
from app.engines.rl_bandit import BanditAlgorithm, get_bandit_engine

router = APIRouter(prefix="/ai", tags=["ai"])


# ════════════════════════════════════════════════════════════════
# CAUSAL INFERENCE
# ════════════════════════════════════════════════════════════════

@router.post("/causal/build/{tenant_id}")
def build_causal_dag(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = CausalInferenceEngine(db)
    links = engine.build_dag_from_ontology(tenant_id)
    return {
        "tenant_id": tenant_id,
        "links_extracted": links,
        "stats": engine.stats(),
    }


class CausalQueryIn(BaseModel):
    tenant_id: str
    treatment: str
    outcome: str


@router.post("/causal/query")
def causal_query(body: CausalQueryIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = CausalInferenceEngine(db)
    engine.build_dag_from_ontology(body.tenant_id)
    query = CausalQuery(treatment=body.treatment, outcome=body.outcome)
    answer = engine.estimate_ate(query, tenant_id=body.tenant_id)
    return {
        "treatment": body.treatment,
        "outcome": body.outcome,
        "ate": answer.ate,
        "confidence_interval": answer.confidence_interval,
        "is_identifiable": answer.is_identifiable,
        "backdoor_set": answer.backdoor_set,
        "p_value_like": answer.p_value_like,
        "reasoning": answer.reasoning,
    }


class InterventionIn(BaseModel):
    tenant_id: str
    target_entity_id: str
    target_property: str
    new_value: Any


@router.post("/causal/intervene")
def causal_intervene(body: InterventionIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    engine = CausalInferenceEngine(db)
    engine.build_dag_from_ontology(body.tenant_id)
    intervention = Intervention(
        target_entity_id=body.target_entity_id,
        target_property=body.target_property,
        new_value=body.new_value,
    )
    result = engine.intervene(intervention, tenant_id=body.tenant_id)
    return {
        "target_entity_id": result.intervention.target_entity_id,
        "target_property": result.intervention.target_property,
        "new_value": str(result.intervention.new_value),
        "affected_entity_count": result.affected_entity_count,
        "predicted_downstream_changes": result.predicted_downstream_changes,
        "narrative": result.narrative,
    }


# ════════════════════════════════════════════════════════════════
# KG EMBEDDINGS
# ════════════════════════════════════════════════════════════════

_kg_engine: Optional[KGEmbeddingEngine] = None


class KGTrainIn(BaseModel):
    tenant_id: str
    dimension: int = 32
    epochs: int = 50


@router.post("/kg/train")
def kg_train(body: KGTrainIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    global _kg_engine
    _kg_engine = KGEmbeddingEngine(db, dimension=body.dimension)
    triple_count = _kg_engine.build_triples(body.tenant_id)
    stats = _kg_engine.train(epochs=body.epochs)
    return {
        "tenant_id": body.tenant_id,
        "triple_count": triple_count,
        "dimension": stats.dimension,
        "entity_count": stats.entity_count,
        "relation_count": stats.relation_count,
        "epochs_trained": stats.epochs_trained,
        "final_loss": stats.final_loss,
    }


@router.get("/kg/similar/{entity_id}")
def kg_similar(entity_id: str, top_k: int = 10) -> Dict[str, Any]:
    if _kg_engine is None:
        raise HTTPException(status_code=422, detail="KG not trained — call /ai/kg/train first")
    results = _kg_engine.find_similar(entity_id, top_k=top_k)
    return {
        "source": entity_id,
        "similar": [asdict(r) for r in results],
    }


class KGAnalogyIn(BaseModel):
    a: str
    b: str
    c: str
    top_k: int = 5


@router.post("/kg/analogy")
def kg_analogy(body: KGAnalogyIn) -> Dict[str, Any]:
    if _kg_engine is None:
        raise HTTPException(status_code=422, detail="KG not trained")
    results = _kg_engine.analogy(a=body.a, b=body.b, c=body.c, top_k=body.top_k)
    return {
        "query": f"{body.a} : {body.b} :: {body.c} : ?",
        "results": [asdict(r) for r in results],
    }


@router.get("/kg/stats")
def kg_stats() -> Dict[str, Any]:
    if _kg_engine is None:
        return {"trained": False}
    return {"trained": True, **_kg_engine.stats()}


# ════════════════════════════════════════════════════════════════
# CHANGE POINT DETECTION
# ════════════════════════════════════════════════════════════════

class ChangePointIn(BaseModel):
    values: List[float]
    method: str = "cusum"
    threshold: float = 2.0


@router.post("/change-points/detect")
def change_points_detect(body: ChangePointIn) -> Dict[str, Any]:
    detector = ChangePointDetector()
    try:
        method = ChangePointMethod(body.method)
    except ValueError:
        method = ChangePointMethod.CUSUM
    result = detector.detect(body.values, method=method, threshold=body.threshold)
    return {
        "method": result.method.value,
        "series_length": result.series_length,
        "regimes_detected": result.regimes_detected,
        "change_points": [asdict(p) for p in result.change_points],
        "variance_explained": result.total_variance_explained,
        "narrative": result.narrative,
    }


# ════════════════════════════════════════════════════════════════
# COUNTERFACTUAL EXPLAINER
# ════════════════════════════════════════════════════════════════

@router.get("/counterfactual/{tenant_id}/explain/{entity_id}")
def counterfactual_explain(
    tenant_id: str,
    entity_id: str,
    max_changes: int = 3,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    engine = CounterfactualExplainer(db)
    report = engine.explain(
        tenant_id=tenant_id,
        target_entity_id=entity_id,
        max_changes=max_changes,
    )
    minimal_dict = None
    if report.minimal_explanation:
        minimal_dict = {
            "target_entity_id": report.minimal_explanation.target_entity_id,
            "target_entity_name": report.minimal_explanation.target_entity_name,
            "current_status": report.minimal_explanation.current_status,
            "total_changes_required": report.minimal_explanation.total_changes_required,
            "predicted_new_status": report.minimal_explanation.predicted_new_status,
            "predicted_risk_reduction": report.minimal_explanation.predicted_risk_reduction,
            "required_changes": [asdict(c) for c in report.minimal_explanation.required_changes],
        }
    return {
        "target_entity_id": report.target_entity_id,
        "explanations_found": report.explanations_found,
        "minimal_explanation": minimal_dict,
        "narrative": report.narrative,
    }


# ════════════════════════════════════════════════════════════════
# MULTI-AGENT REASONING
# ════════════════════════════════════════════════════════════════

class DebateIn(BaseModel):
    tenant_id: str
    question: str
    context: Dict[str, Any] = {}


@router.post("/debate")
def run_debate(body: DebateIn, db: Session = Depends(get_db)) -> Dict[str, Any]:
    reasoner = MultiAgentReasoning(db)
    debate = asyncio.run(reasoner.debate(
        tenant_id=body.tenant_id,
        question=body.question,
        context=body.context,
    ))
    return {
        "debate_id": debate.debate_id,
        "question": debate.question,
        "verdict": debate.verdict.value,
        "verdict_reasoning": debate.verdict_reasoning,
        "conditions": debate.conditions,
        "blue_team": {
            "arguments": debate.blue_team_statement.arguments,
            "confidence": debate.blue_team_statement.confidence,
        },
        "red_team": {
            "arguments": debate.red_team_statement.arguments,
            "confidence": debate.red_team_statement.confidence,
        },
        "judge": {
            "arguments": debate.judge_statement.arguments,
            "confidence": debate.judge_statement.confidence,
        },
    }


# ════════════════════════════════════════════════════════════════
# BAYESIAN BELIEFS
# ════════════════════════════════════════════════════════════════

@router.get("/beliefs")
def list_beliefs() -> Dict[str, Any]:
    engine = get_bayesian_beliefs()
    return {
        "stats": engine.stats(),
        "beliefs": [
            {
                "subject": b.subject,
                "belief_type": b.belief_type,
                "mean": b.mean,
                "credible_interval_95": b.credible_interval_95,
                "parameters": b.parameters,
                "updated_count": b.updated_count,
                "last_updated": b.last_updated.isoformat(),
            }
            for b in engine.list_all()
        ],
    }


class BeliefUpdateIn(BaseModel):
    subject: str
    successes: int = 0
    failures: int = 0


@router.post("/beliefs/update")
def update_belief(body: BeliefUpdateIn) -> Dict[str, Any]:
    engine = get_bayesian_beliefs()
    updated = engine.update_beta(body.subject, successes=body.successes, failures=body.failures)
    return {
        "subject": body.subject,
        "alpha": updated.alpha,
        "beta": updated.beta,
        "mean": round(updated.mean, 4),
        "stdev": round(updated.stdev, 4),
        "credible_interval_95": updated.credible_interval(0.95),
    }


@router.get("/beliefs/predict/{subject}")
def predict_belief(subject: str) -> Dict[str, Any]:
    engine = get_bayesian_beliefs()
    # URL-decode the subject since it may contain ":"
    return engine.predict_probability(subject)


# ════════════════════════════════════════════════════════════════
# BANDIT (Reinforcement Learning)
# ════════════════════════════════════════════════════════════════

@router.get("/bandit/contexts")
def list_bandit_contexts() -> List[Dict[str, Any]]:
    engine = get_bandit_engine()
    return [
        {
            "context_id": c.context_id,
            "problem_description": c.problem_description,
            "arm_count": len(c.arms),
            "total_pulls": c.total_pulls,
        }
        for c in engine.all_contexts()
    ]


@router.get("/bandit/contexts/{context_id}")
def bandit_context_stats(context_id: str) -> Dict[str, Any]:
    engine = get_bandit_engine()
    stats = engine.context_stats(context_id)
    if not stats:
        raise HTTPException(status_code=404, detail="context not found")
    return stats


class BanditSelectIn(BaseModel):
    context_id: str
    algorithm: str = "thompson_sampling"
    epsilon: float = 0.1


@router.post("/bandit/select")
def bandit_select(body: BanditSelectIn) -> Dict[str, Any]:
    engine = get_bandit_engine()
    try:
        algo = BanditAlgorithm(body.algorithm)
    except ValueError:
        algo = BanditAlgorithm.THOMPSON_SAMPLING
    decision = engine.select(body.context_id, algorithm=algo, epsilon=body.epsilon)
    if decision is None:
        raise HTTPException(status_code=404, detail="context not found or no arms")
    return {
        "chosen_arm_id": decision.chosen_arm_id,
        "chosen_arm_name": decision.chosen_arm_name,
        "algorithm": decision.algorithm.value,
        "reason": decision.reason,
        "arm_scores": decision.arm_scores,
    }


class BanditRewardIn(BaseModel):
    context_id: str
    arm_id: str
    reward: float
    is_binary_success: bool = True


@router.post("/bandit/reward")
def bandit_reward(body: BanditRewardIn) -> Dict[str, Any]:
    engine = get_bandit_engine()
    arm = engine.record_reward(
        body.context_id,
        body.arm_id,
        reward=body.reward,
        is_binary_success=body.is_binary_success,
    )
    if arm is None:
        raise HTTPException(status_code=404, detail="context or arm not found")
    return {
        "arm_id": arm.arm_id,
        "pulls": arm.pulls,
        "total_reward": round(arm.total_reward, 3),
        "mean_reward": round(arm.mean_reward, 3),
        "alpha": arm.alpha,
        "beta": arm.beta,
    }


# ════════════════════════════════════════════════════════════════
# AUTONOMOUS AI OPERATOR — the self-driving brain
# ════════════════════════════════════════════════════════════════

@router.get("/operator/stats")
def operator_stats() -> Dict[str, Any]:
    return get_autonomous_operator().stats()


class OperatorConfigIn(BaseModel):
    personality: str = "balanced"
    tick_interval_seconds: int = 60
    enable_debate_for_critical: bool = True
    enable_auto_actions: bool = True
    max_auto_actions_per_tick: int = 3
    notify_on_every_decision: bool = False
    tenant_scope: Optional[List[str]] = None


@router.post("/operator/configure")
def operator_configure(body: OperatorConfigIn) -> Dict[str, Any]:
    try:
        personality = OperatorPersonality(body.personality)
    except ValueError:
        personality = OperatorPersonality.BALANCED
    op = get_autonomous_operator()
    op.config = OperatorConfig(
        personality=personality,
        tick_interval_seconds=body.tick_interval_seconds,
        enable_debate_for_critical=body.enable_debate_for_critical,
        enable_auto_actions=body.enable_auto_actions,
        max_auto_actions_per_tick=body.max_auto_actions_per_tick,
        notify_on_every_decision=body.notify_on_every_decision,
        tenant_scope=body.tenant_scope,
    )
    return {
        "ok": True,
        "config": {
            "personality": op.config.personality.value,
            "tick_interval_seconds": op.config.tick_interval_seconds,
            "enable_debate_for_critical": op.config.enable_debate_for_critical,
            "enable_auto_actions": op.config.enable_auto_actions,
            "max_auto_actions_per_tick": op.config.max_auto_actions_per_tick,
            "tenant_scope": op.config.tenant_scope,
        },
    }


@router.post("/operator/start")
async def operator_start() -> Dict[str, Any]:
    op = get_autonomous_operator()
    await op.start()
    return {"ok": True, "status": "started", "stats": op.stats()}


@router.post("/operator/stop")
async def operator_stop() -> Dict[str, Any]:
    op = get_autonomous_operator()
    await op.stop()
    return {"ok": True, "status": "stopped"}


@router.post("/operator/tick-now")
def operator_tick_now() -> Dict[str, Any]:
    """Run a single tick synchronously for debugging / on-demand trigger."""
    op = get_autonomous_operator()
    tick = asyncio.run(op.run_single_tick())
    return {
        "tick_id": tick.tick_id,
        "duration_ms": tick.duration_ms,
        "tenants_processed": tick.tenants_processed,
        "decisions_made": tick.decisions_made,
        "actions_executed": tick.actions_executed,
        "escalations": tick.escalations,
        "errors": tick.errors,
    }


@router.get("/operator/recent-decisions")
def operator_recent_decisions(limit: int = 20) -> List[Dict[str, Any]]:
    op = get_autonomous_operator()
    out: List[Dict[str, Any]] = []
    for d in op.recent_decisions(limit):
        out.append({
            "decision_id": d.decision_id,
            "tenant_id": d.tenant_id,
            "problem_statement": d.problem_statement,
            "chosen_action": d.chosen_action,
            "chosen_action_reason": d.chosen_action_reason,
            "confidence": d.confidence,
            "debate_verdict": d.debate_verdict,
            "phase_completed": d.phase_completed.value,
            "reward": d.reward,
            "actual_outcome": d.actual_outcome,
            "decision_at": d.decision_at.isoformat(),
            "perception": {
                "overall_health": d.perception.overall_health,
                "at_risk_count": d.perception.at_risk_count,
                "critical_alert_count": d.perception.critical_alert_count,
            },
        })
    return out


@router.get("/operator/recent-ticks")
def operator_recent_ticks(limit: int = 20) -> List[Dict[str, Any]]:
    op = get_autonomous_operator()
    return [
        {
            "tick_id": t.tick_id,
            "started_at": t.started_at.isoformat(),
            "duration_ms": t.duration_ms,
            "tenants_processed": t.tenants_processed,
            "decisions_made": t.decisions_made,
            "actions_executed": t.actions_executed,
            "escalations": t.escalations,
            "errors": t.errors,
        }
        for t in op.recent_ticks(limit)
    ]


# ════════════════════════════════════════════════════════════════
# GRAPH SUMMARIZER — executive briefing
# ════════════════════════════════════════════════════════════════

@router.get("/briefing/{tenant_id}")
def executive_briefing(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    summarizer = GraphSummarizer(db)
    briefing = asyncio.run(summarizer.build_briefing(tenant_id))
    return {
        "tenant_id": briefing.tenant_id,
        "overall_health": briefing.overall_health,
        "headline": briefing.headline,
        "bullet_points": briefing.bullet_points,
        "top_risks": briefing.top_risks,
        "top_wins": briefing.top_wins,
        "recommended_actions": briefing.recommended_actions,
        "financial_summary": briefing.financial_summary,
        "generated_at": briefing.generated_at.isoformat(),
    }


@router.get("/briefing/{tenant_id}/text")
def executive_briefing_text(tenant_id: str, db: Session = Depends(get_db)) -> Dict[str, str]:
    from fastapi.responses import JSONResponse
    summarizer = GraphSummarizer(db)
    briefing = asyncio.run(summarizer.build_briefing(tenant_id))
    return {"text": summarizer.format_as_text(briefing)}
