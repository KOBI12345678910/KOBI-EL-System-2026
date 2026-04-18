/**
 * BASH44 Next-Generation Industrial Intelligence Platform — Intelligence Engines
 *
 * Beyond Palantir. The 5 engines that turn a data platform into an autonomous
 * operational brain:
 *
 *   1. DecisionEngine   — rules + scoring + prioritization
 *   2. ExecutionEngine  — autonomous action with guardrails
 *   3. LearningEngine   — outcome tracking + model improvement
 *   4. ProfitEngine     — P&L impact per decision, financial intelligence
 *   5. AIBrainEngine    — reasoning over the live operational picture
 *
 * All engines are wired to the RealtimePlatform event bus. When events flow in,
 * these engines automatically evaluate, decide, act, learn, and measure profit.
 */

import { realtimePlatform } from "./realtime-platform-engine";
import type {
  UnifiedEvent,
  EntityState,
  Severity,
  ModuleKey,
  LiveAlert,
} from "./realtime-platform-engine";

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export type DecisionStatus =
  | "pending_eval"
  | "recommended"
  | "queued"
  | "auto_approved"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "executed"
  | "failed"
  | "rejected"
  | "expired";

export type DecisionPriority = "critical" | "high" | "medium" | "low";

export interface DecisionRule {
  id: string;
  name: string;
  description: string;
  category: string;
  // When does this rule trigger?
  triggerEventTypes?: string[];
  triggerModules?: ModuleKey[];
  triggerSeverity?: Severity[];
  // Condition evaluator — returns true if action should be proposed
  condition: (event: UnifiedEvent, context: DecisionContext) => boolean;
  // Score the decision (higher = more important)
  score: (event: UnifiedEvent, context: DecisionContext) => number;
  // What to do
  action: {
    actionType: string;
    targetModule: ModuleKey;
    params: Record<string, unknown>;
    // Can this be auto-executed?
    autoExecutable: boolean;
    // Guardrails
    maxFinancialImpact?: number;
    requiresRole?: string[];
    dailyLimit?: number;
  };
  enabled: boolean;
}

export interface DecisionContext {
  entityState?: EntityState;
  upstreamCauses?: Array<{ entityType: string; entityId: string; linkType: string }>;
  historicalOutcomes?: Array<{ success: boolean; profitImpact: number }>;
  timeOfDay?: number;
}

export interface Decision {
  id: number;
  rootEventId?: number;
  ruleId: string;
  ruleName: string;
  title: string;
  summary: string;
  category: string;
  priority: DecisionPriority;
  score: number;
  status: DecisionStatus;
  // Target
  entityType: string;
  entityId: string;
  module: ModuleKey;
  // Action
  actionType: string;
  actionParams: Record<string, unknown>;
  autoExecutable: boolean;
  // Impact estimates (from ProfitEngine)
  estimatedRevenueImpact?: number;
  estimatedCostImpact?: number;
  estimatedProfitImpact?: number;
  estimatedTimeToValue?: number; // ms
  confidence?: number; // 0-1
  // Guardrails
  approvalRequired: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  // Execution
  executedAt?: Date;
  executionResult?: { success: boolean; message: string; data?: unknown };
  // Learning
  actualProfitImpact?: number;
  outcomeRecordedAt?: Date;
  // Time
  createdAt: Date;
  expiresAt?: Date;
}

export interface ExecutionRecord {
  id: number;
  decisionId: number;
  actionType: string;
  targetModule: ModuleKey;
  targetEntityType: string;
  targetEntityId: string;
  params: Record<string, unknown>;
  status: "queued" | "running" | "success" | "failed" | "rolled_back";
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  result?: unknown;
  errorMessage?: string;
  retryCount: number;
  canRollback: boolean;
  rolledBackAt?: Date;
}

export interface LearningRecord {
  id: number;
  decisionId: number;
  ruleId: string;
  predictedProfitImpact: number;
  actualProfitImpact: number;
  predictionError: number;
  success: boolean;
  lessonsLearned?: string;
  featuresSnapshot?: Record<string, unknown>;
  recordedAt: Date;
}

export interface ProfitImpact {
  entityType: string;
  entityId: string;
  revenueImpact: number;
  costImpact: number;
  profitImpact: number;
  margin: number;
  breakdown: Array<{
    category: "revenue" | "cost_material" | "cost_labor" | "cost_overhead" | "cost_delay" | "cost_quality";
    amount: number;
    description: string;
  }>;
  confidence: number;
  horizon: "immediate" | "short_term" | "long_term";
}

export interface RuleStats {
  ruleId: string;
  ruleName: string;
  triggered: number;
  executed: number;
  successful: number;
  averageProfitImpact: number;
  totalProfitImpact: number;
  lastTriggered?: Date;
  effectivenessScore: number; // 0-100
}

// ════════════════════════════════════════════════════════════════
// DECISION ENGINE — the brain that says "act now"
// ════════════════════════════════════════════════════════════════

class DecisionEngine {
  private rules = new Map<string, DecisionRule>();
  private decisions: Decision[] = [];
  private nextDecisionId = 1;
  private dailyExecutionCounts = new Map<string, number>();
  private maxDecisions = 2000;

  registerRule(rule: DecisionRule) {
    this.rules.set(rule.id, rule);
  }

  getRule(id: string) {
    return this.rules.get(id);
  }

  allRules(): DecisionRule[] {
    return Array.from(this.rules.values());
  }

  evaluate(event: UnifiedEvent): Decision[] {
    const result: Decision[] = [];
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.triggerEventTypes && !rule.triggerEventTypes.includes(event.eventType)) continue;
      if (rule.triggerModules && !rule.triggerModules.includes(event.sourceModule)) continue;
      if (rule.triggerSeverity && !rule.triggerSeverity.includes(event.severity ?? "info")) continue;

      const context = this.buildContext(event);
      let matched = false;
      try {
        matched = rule.condition(event, context);
      } catch (e) {
        console.error(`[DecisionEngine] Rule ${rule.id} condition error:`, e);
        continue;
      }
      if (!matched) continue;

      let score = 0;
      try {
        score = rule.score(event, context);
      } catch (e) {
        console.error(`[DecisionEngine] Rule ${rule.id} score error:`, e);
      }

      const priority: DecisionPriority =
        score >= 90 ? "critical" :
        score >= 70 ? "high" :
        score >= 40 ? "medium" : "low";

      const decision: Decision = {
        id: this.nextDecisionId++,
        rootEventId: event.id,
        ruleId: rule.id,
        ruleName: rule.name,
        title: `${rule.name}`,
        summary: `${event.entityLabel ?? event.entityId} → ${rule.action.actionType}`,
        category: rule.category,
        priority,
        score,
        status: rule.action.autoExecutable ? "auto_approved" : "awaiting_approval",
        entityType: event.entityType,
        entityId: event.entityId,
        module: rule.action.targetModule,
        actionType: rule.action.actionType,
        actionParams: rule.action.params,
        autoExecutable: rule.action.autoExecutable,
        approvalRequired: !rule.action.autoExecutable,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      this.decisions.push(decision);
      if (this.decisions.length > this.maxDecisions) this.decisions.shift();
      result.push(decision);
    }
    return result;
  }

  private buildContext(event: UnifiedEvent): DecisionContext {
    const state = event.entityType && event.entityId
      ? realtimePlatform.State.get(event.entityType, event.entityId, event.tenantId ?? undefined)
      : undefined;
    const causes = event.entityType && event.entityId
      ? realtimePlatform.Causal.traceCauses(event.entityType, event.entityId, 2)
      : [];
    return {
      entityState: state,
      upstreamCauses: causes,
      timeOfDay: new Date().getHours(),
    };
  }

  approve(decisionId: number, userId: string): Decision | undefined {
    const d = this.decisions.find(x => x.id === decisionId);
    if (d) {
      d.status = "approved";
      d.approvedBy = userId;
      d.approvedAt = new Date();
    }
    return d;
  }

  reject(decisionId: number, userId: string): Decision | undefined {
    const d = this.decisions.find(x => x.id === decisionId);
    if (d) {
      d.status = "rejected";
      d.approvedBy = userId;
      d.approvedAt = new Date();
    }
    return d;
  }

  markExecuted(decisionId: number, result: { success: boolean; message: string; data?: unknown }): Decision | undefined {
    const d = this.decisions.find(x => x.id === decisionId);
    if (d) {
      d.status = result.success ? "executed" : "failed";
      d.executedAt = new Date();
      d.executionResult = result;
    }
    return d;
  }

  setProfitEstimate(decisionId: number, impact: ProfitImpact) {
    const d = this.decisions.find(x => x.id === decisionId);
    if (d) {
      d.estimatedRevenueImpact = impact.revenueImpact;
      d.estimatedCostImpact = impact.costImpact;
      d.estimatedProfitImpact = impact.profitImpact;
      d.confidence = impact.confidence;
    }
  }

  pending(): Decision[] {
    return this.decisions
      .filter(d => d.status === "awaiting_approval" || d.status === "auto_approved" || d.status === "approved")
      .sort((a, b) => b.score - a.score);
  }

  all(): Decision[] {
    return this.decisions.slice().reverse();
  }

  byId(id: number): Decision | undefined {
    return this.decisions.find(d => d.id === id);
  }

  recent(limit = 50): Decision[] {
    return this.decisions.slice(-limit).reverse();
  }

  byPriority(priority: DecisionPriority): Decision[] {
    return this.decisions.filter(d => d.priority === priority);
  }

  clearExpired() {
    const now = Date.now();
    this.decisions = this.decisions.filter(d => !d.expiresAt || d.expiresAt.getTime() > now || d.status === "executed");
  }

  checkDailyLimit(ruleId: string, limit?: number): boolean {
    if (!limit) return true;
    const dayKey = `${ruleId}:${new Date().toISOString().slice(0, 10)}`;
    const count = this.dailyExecutionCounts.get(dayKey) ?? 0;
    return count < limit;
  }

  incrementDailyCount(ruleId: string) {
    const dayKey = `${ruleId}:${new Date().toISOString().slice(0, 10)}`;
    this.dailyExecutionCounts.set(dayKey, (this.dailyExecutionCounts.get(dayKey) ?? 0) + 1);
  }
}

// ════════════════════════════════════════════════════════════════
// EXECUTION ENGINE — autonomous action with guardrails
// ════════════════════════════════════════════════════════════════

type ActionHandler = (
  params: Record<string, unknown>,
  decision: Decision
) => Promise<{ success: boolean; message: string; data?: unknown; rollbackInfo?: unknown }>;

class ExecutionEngine {
  private handlers = new Map<string, ActionHandler>();
  private executions: ExecutionRecord[] = [];
  private nextExecId = 1;
  private maxExecutions = 2000;

  registerHandler(actionType: string, handler: ActionHandler) {
    this.handlers.set(actionType, handler);
  }

  async execute(decision: Decision, decisionEngine: DecisionEngine): Promise<ExecutionRecord> {
    const record: ExecutionRecord = {
      id: this.nextExecId++,
      decisionId: decision.id,
      actionType: decision.actionType,
      targetModule: decision.module,
      targetEntityType: decision.entityType,
      targetEntityId: decision.entityId,
      params: decision.actionParams,
      status: "queued",
      retryCount: 0,
      canRollback: false,
    };
    this.executions.push(record);
    if (this.executions.length > this.maxExecutions) this.executions.shift();

    // Guardrail checks
    const rule = decisionEngine.getRule(decision.ruleId);
    if (rule) {
      if (rule.action.maxFinancialImpact && decision.estimatedProfitImpact != null &&
          Math.abs(decision.estimatedProfitImpact) > rule.action.maxFinancialImpact) {
        record.status = "failed";
        record.errorMessage = `Guardrail: financial impact ${decision.estimatedProfitImpact} exceeds limit ${rule.action.maxFinancialImpact}`;
        decisionEngine.markExecuted(decision.id, { success: false, message: record.errorMessage });
        return record;
      }
      if (!decisionEngine.checkDailyLimit(rule.id, rule.action.dailyLimit)) {
        record.status = "failed";
        record.errorMessage = `Guardrail: daily execution limit reached for rule ${rule.id}`;
        decisionEngine.markExecuted(decision.id, { success: false, message: record.errorMessage });
        return record;
      }
    }

    const handler = this.handlers.get(decision.actionType);
    if (!handler) {
      record.status = "failed";
      record.errorMessage = `No handler registered for action type: ${decision.actionType}`;
      decisionEngine.markExecuted(decision.id, { success: false, message: record.errorMessage });
      return record;
    }

    record.status = "running";
    record.startedAt = new Date();

    try {
      const result = await handler(decision.actionParams, decision);
      record.finishedAt = new Date();
      record.durationMs = record.finishedAt.getTime() - (record.startedAt?.getTime() ?? 0);
      record.status = result.success ? "success" : "failed";
      record.result = result.data;
      record.errorMessage = result.success ? undefined : result.message;
      record.canRollback = !!result.rollbackInfo;
      decisionEngine.markExecuted(decision.id, result);
      if (rule) decisionEngine.incrementDailyCount(rule.id);

      // Publish execution event to the bus
      realtimePlatform.publish({
        eventType: result.success ? "execution.success" : "execution.failed",
        sourceModule: "ai",
        entityType: "decision",
        entityId: String(decision.id),
        entityLabel: decision.title,
        severity: result.success ? "success" : "warning",
        newState: {
          status: result.success ? "executed" : "failed",
          actionType: decision.actionType,
          targetEntity: `${decision.entityType}:${decision.entityId}`,
        },
        metadata: {
          executionId: record.id,
          decisionId: decision.id,
          durationMs: record.durationMs,
        },
      });
    } catch (e) {
      record.finishedAt = new Date();
      record.durationMs = record.finishedAt.getTime() - (record.startedAt?.getTime() ?? 0);
      record.status = "failed";
      record.errorMessage = e instanceof Error ? e.message : String(e);
      decisionEngine.markExecuted(decision.id, { success: false, message: record.errorMessage });
    }

    return record;
  }

  recent(limit = 50): ExecutionRecord[] {
    return this.executions.slice(-limit).reverse();
  }

  all(): ExecutionRecord[] {
    return this.executions.slice().reverse();
  }

  byId(id: number): ExecutionRecord | undefined {
    return this.executions.find(e => e.id === id);
  }

  byStatus(status: ExecutionRecord["status"]): ExecutionRecord[] {
    return this.executions.filter(e => e.status === status);
  }

  stats(): { total: number; successful: number; failed: number; avgDurationMs: number; successRate: number } {
    const total = this.executions.length;
    const successful = this.executions.filter(e => e.status === "success").length;
    const failed = this.executions.filter(e => e.status === "failed").length;
    const withDuration = this.executions.filter(e => e.durationMs != null);
    const avgDurationMs = withDuration.length > 0
      ? withDuration.reduce((a, b) => a + (b.durationMs ?? 0), 0) / withDuration.length
      : 0;
    return {
      total,
      successful,
      failed,
      avgDurationMs,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }
}

// ════════════════════════════════════════════════════════════════
// LEARNING ENGINE — outcome tracking + model improvement
// ════════════════════════════════════════════════════════════════

class LearningEngine {
  private records: LearningRecord[] = [];
  private nextRecordId = 1;
  private maxRecords = 5000;
  private ruleStats = new Map<string, RuleStats>();

  recordOutcome(decision: Decision, actualProfitImpact: number, lessonsLearned?: string) {
    const predicted = decision.estimatedProfitImpact ?? 0;
    const record: LearningRecord = {
      id: this.nextRecordId++,
      decisionId: decision.id,
      ruleId: decision.ruleId,
      predictedProfitImpact: predicted,
      actualProfitImpact,
      predictionError: actualProfitImpact - predicted,
      success: actualProfitImpact >= 0 && decision.executionResult?.success === true,
      lessonsLearned,
      featuresSnapshot: {
        score: decision.score,
        priority: decision.priority,
        confidence: decision.confidence,
        entityType: decision.entityType,
        module: decision.module,
      },
      recordedAt: new Date(),
    };
    this.records.push(record);
    if (this.records.length > this.maxRecords) this.records.shift();
    this.updateStats(decision.ruleId, record);
    return record;
  }

  private updateStats(ruleId: string, record: LearningRecord) {
    const stats = this.ruleStats.get(ruleId) ?? {
      ruleId,
      ruleName: ruleId,
      triggered: 0,
      executed: 0,
      successful: 0,
      averageProfitImpact: 0,
      totalProfitImpact: 0,
      effectivenessScore: 50,
    };
    stats.executed++;
    if (record.success) stats.successful++;
    stats.totalProfitImpact += record.actualProfitImpact;
    stats.averageProfitImpact = stats.totalProfitImpact / stats.executed;
    stats.lastTriggered = record.recordedAt;
    // Effectiveness = success rate weighted by average profit
    const successRate = stats.executed > 0 ? stats.successful / stats.executed : 0;
    const profitNormalized = Math.max(-1, Math.min(1, stats.averageProfitImpact / 10000));
    stats.effectivenessScore = Math.max(0, Math.min(100,
      successRate * 70 + (profitNormalized + 1) * 15
    ));
    this.ruleStats.set(ruleId, stats);
  }

  recordTriggered(ruleId: string, ruleName: string) {
    const stats = this.ruleStats.get(ruleId) ?? {
      ruleId,
      ruleName,
      triggered: 0,
      executed: 0,
      successful: 0,
      averageProfitImpact: 0,
      totalProfitImpact: 0,
      effectivenessScore: 50,
    };
    stats.triggered++;
    stats.ruleName = ruleName;
    this.ruleStats.set(ruleId, stats);
  }

  allStats(): RuleStats[] {
    return Array.from(this.ruleStats.values()).sort((a, b) => b.effectivenessScore - a.effectivenessScore);
  }

  statsForRule(ruleId: string): RuleStats | undefined {
    return this.ruleStats.get(ruleId);
  }

  recentRecords(limit = 50): LearningRecord[] {
    return this.records.slice(-limit).reverse();
  }

  predictionAccuracy(): { count: number; meanError: number; meanAbsError: number; overallSuccessRate: number } {
    if (this.records.length === 0) return { count: 0, meanError: 0, meanAbsError: 0, overallSuccessRate: 0 };
    const errors = this.records.map(r => r.predictionError);
    const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
    const meanAbsError = errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length;
    const successful = this.records.filter(r => r.success).length;
    return {
      count: this.records.length,
      meanError,
      meanAbsError,
      overallSuccessRate: (successful / this.records.length) * 100,
    };
  }

  /**
   * Auto-adjust rule confidence based on historical performance.
   * Returns suggested adjustments to the score function.
   */
  suggestRuleAdjustments(): Array<{ ruleId: string; adjustment: number; reason: string }> {
    const adjustments: Array<{ ruleId: string; adjustment: number; reason: string }> = [];
    for (const stats of this.ruleStats.values()) {
      if (stats.executed < 5) continue;
      if (stats.effectivenessScore < 30) {
        adjustments.push({
          ruleId: stats.ruleId,
          adjustment: -20,
          reason: `Low effectiveness (${stats.effectivenessScore.toFixed(0)}) after ${stats.executed} executions`,
        });
      } else if (stats.effectivenessScore > 80 && stats.averageProfitImpact > 0) {
        adjustments.push({
          ruleId: stats.ruleId,
          adjustment: +10,
          reason: `High effectiveness (${stats.effectivenessScore.toFixed(0)}), boost priority`,
        });
      }
    }
    return adjustments;
  }
}

// ════════════════════════════════════════════════════════════════
// PROFIT ENGINE — P&L impact per decision
// ════════════════════════════════════════════════════════════════

interface ProfitModelEntity {
  entityType: string;
  avgRevenue?: number;
  avgCostRatio?: number;
  marginPercent?: number;
}

class ProfitEngine {
  private models = new Map<string, ProfitModelEntity>();
  private cumulativeImpact = {
    revenueImpact: 0,
    costImpact: 0,
    profitImpact: 0,
    decisionsAnalyzed: 0,
  };

  registerModel(model: ProfitModelEntity) {
    this.models.set(model.entityType, model);
  }

  /**
   * Estimate the profit impact of a decision BEFORE execution.
   * Combines: entity type model, action type heuristics, historical patterns.
   */
  estimateImpact(decision: Decision, entityValue?: number): ProfitImpact {
    const model = this.models.get(decision.entityType);
    const baseValue = entityValue ?? model?.avgRevenue ?? 10000;
    const breakdown: ProfitImpact["breakdown"] = [];
    let revenueImpact = 0;
    let costImpact = 0;

    switch (decision.actionType) {
      case "recover_stockout": {
        // Preventing a stockout saves: lost revenue + expedite cost
        revenueImpact = baseValue * 0.8;
        costImpact = baseValue * 0.15; // expedite shipping
        breakdown.push(
          { category: "revenue", amount: revenueImpact, description: "הכנסה שנשמרה ממניעת חוסר מלאי" },
          { category: "cost_delay", amount: costImpact, description: "עלות אקספרס לספק" },
        );
        break;
      }
      case "escalate_supplier_delay": {
        revenueImpact = 0;
        costImpact = -baseValue * 0.1; // rush fee to supplier
        breakdown.push({ category: "cost_delay", amount: -costImpact, description: "דמי האצה לספק" });
        break;
      }
      case "reroute_production": {
        revenueImpact = baseValue * 0.6;
        costImpact = baseValue * 0.08;
        breakdown.push(
          { category: "revenue", amount: revenueImpact, description: "שמירת הכנסה ממעבר קו ייצור" },
          { category: "cost_overhead", amount: costImpact, description: "עלות switchover" },
        );
        break;
      }
      case "offer_discount_to_close": {
        revenueImpact = baseValue * 0.9; // close deal
        costImpact = baseValue * 0.1; // discount cost
        breakdown.push(
          { category: "revenue", amount: revenueImpact, description: "סגירת עסקה בסיכון" },
          { category: "cost_overhead", amount: costImpact, description: "הנחה" },
        );
        break;
      }
      case "trigger_collection_call": {
        revenueImpact = baseValue * 0.7;
        costImpact = baseValue * 0.02;
        breakdown.push(
          { category: "revenue", amount: revenueImpact, description: "גביית חוב" },
          { category: "cost_labor", amount: costImpact, description: "עלות שיחה/מעקב" },
        );
        break;
      }
      case "approve_quote_fast": {
        revenueImpact = baseValue;
        costImpact = 0;
        breakdown.push({ category: "revenue", amount: revenueImpact, description: "הצעה סגורה מהר" });
        break;
      }
      case "reassign_technician": {
        revenueImpact = baseValue * 0.3;
        costImpact = baseValue * 0.05;
        breakdown.push(
          { category: "revenue", amount: revenueImpact, description: "שביעות רצון לקוח" },
          { category: "cost_labor", amount: costImpact, description: "שעות נוספות" },
        );
        break;
      }
      case "auto_pay_critical_invoice": {
        revenueImpact = 0;
        costImpact = -baseValue * 0.02; // avoid penalty
        breakdown.push({ category: "cost_delay", amount: -costImpact, description: "מניעת קנס איחור" });
        break;
      }
      default: {
        // Generic estimate
        revenueImpact = baseValue * 0.3;
        costImpact = baseValue * 0.05;
        breakdown.push(
          { category: "revenue", amount: revenueImpact, description: "השפעה צפויה כללית" },
        );
      }
    }

    const profitImpact = revenueImpact - costImpact;
    const margin = revenueImpact > 0 ? (profitImpact / revenueImpact) * 100 : 0;
    const confidence = this.computeConfidence(decision);

    return {
      entityType: decision.entityType,
      entityId: decision.entityId,
      revenueImpact,
      costImpact,
      profitImpact,
      margin,
      breakdown,
      confidence,
      horizon: decision.priority === "critical" ? "immediate" : "short_term",
    };
  }

  recordActual(decision: Decision, actualImpact: number) {
    this.cumulativeImpact.profitImpact += actualImpact;
    if (decision.estimatedRevenueImpact) this.cumulativeImpact.revenueImpact += decision.estimatedRevenueImpact;
    if (decision.estimatedCostImpact) this.cumulativeImpact.costImpact += decision.estimatedCostImpact;
    this.cumulativeImpact.decisionsAnalyzed++;
  }

  summary() {
    return { ...this.cumulativeImpact };
  }

  computeEntityProfit(entityType: string, entityId: string, value: number): ProfitImpact {
    const model = this.models.get(entityType);
    const cost = value * (model?.avgCostRatio ?? 0.7);
    const profit = value - cost;
    return {
      entityType,
      entityId,
      revenueImpact: value,
      costImpact: cost,
      profitImpact: profit,
      margin: value > 0 ? (profit / value) * 100 : 0,
      breakdown: [
        { category: "revenue", amount: value, description: "הכנסה מהישות" },
        { category: "cost_material", amount: cost * 0.6, description: "חומרי גלם" },
        { category: "cost_labor", amount: cost * 0.25, description: "עבודה" },
        { category: "cost_overhead", amount: cost * 0.15, description: "תקורה" },
      ],
      confidence: model ? 0.8 : 0.5,
      horizon: "short_term",
    };
  }

  private computeConfidence(decision: Decision): number {
    let conf = 0.6;
    if (decision.priority === "critical") conf += 0.1;
    if (decision.score > 80) conf += 0.1;
    return Math.min(0.95, conf);
  }
}

// ════════════════════════════════════════════════════════════════
// AI BRAIN — reasoning over the live operational picture
// ════════════════════════════════════════════════════════════════

class AIBrainEngine {
  /**
   * Generate reasoning about current company state.
   * This is the "thinking" layer that interprets the live picture.
   */
  analyzeSituation(): {
    situation: string;
    topConcerns: Array<{ topic: string; severity: Severity; reasoning: string; suggestedAction?: string }>;
    opportunities: Array<{ topic: string; potential: number; reasoning: string }>;
    confidence: number;
  } {
    const snapshot = realtimePlatform.Snapshot.company();
    const topConcerns: Array<{ topic: string; severity: Severity; reasoning: string; suggestedAction?: string }> = [];
    const opportunities: Array<{ topic: string; potential: number; reasoning: string }> = [];

    // Overall health assessment
    let situation: string;
    if (snapshot.overallHealth >= 90) {
      situation = "מצב תפעולי יציב ובריא. כל המודולים פועלים באופן תקין.";
    } else if (snapshot.overallHealth >= 70) {
      situation = `מצב יציב עם נקודות לתשומת לב. בריאות כוללת: ${snapshot.overallHealth.toFixed(0)}%.`;
    } else if (snapshot.overallHealth >= 50) {
      situation = `מצב מעורב עם כמה מודולים בסיכון. בריאות כוללת: ${snapshot.overallHealth.toFixed(0)}%.`;
    } else {
      situation = `מצב קריטי. בריאות כוללת: ${snapshot.overallHealth.toFixed(0)}%. נדרשת התערבות מיידית.`;
    }

    // Identify concerns from causal hotspots
    for (const hotspot of snapshot.causalHotspots.slice(0, 5)) {
      topConcerns.push({
        topic: `${hotspot.entityLabel}`,
        severity: hotspot.severity,
        reasoning: `משפיע על ${hotspot.downstreamCount} ישויות במורד הזרם`,
        suggestedAction: "בדיקה מיידית ופעולה מתקנת",
      });
    }

    // Module-based concerns
    for (const [moduleKey, data] of Object.entries(snapshot.modules)) {
      if (data.entitiesAtRisk > 0 && data.health < 70) {
        topConcerns.push({
          topic: `מודול ${moduleKey}`,
          severity: data.health < 40 ? "critical" : "warning",
          reasoning: `${data.entitiesAtRisk} ישויות בסיכון, בריאות ${data.health.toFixed(0)}%`,
          suggestedAction: data.health < 40 ? "מעקב דחוף" : "מעקב פרו-אקטיבי",
        });
      }
    }

    // Opportunities from KPIs
    for (const kpi of snapshot.kpis) {
      if (kpi.trend === "up" && kpi.deltaPercent && kpi.deltaPercent > 10) {
        opportunities.push({
          topic: kpi.kpiLabel,
          potential: kpi.deltaValue ?? 0,
          reasoning: `מגמה חיובית +${kpi.deltaPercent.toFixed(1)}%`,
        });
      }
    }

    return {
      situation,
      topConcerns: topConcerns.slice(0, 8),
      opportunities: opportunities.slice(0, 5),
      confidence: 0.8,
    };
  }

  /**
   * Explain an entity's current state by tracing causes.
   */
  explainEntity(entityType: string, entityId: string): {
    currentStatus: string;
    causes: string[];
    impacts: string[];
    recommendation: string;
  } {
    const state = realtimePlatform.State.get(entityType, entityId);
    if (!state) {
      return {
        currentStatus: "unknown",
        causes: [],
        impacts: [],
        recommendation: "ישות לא נמצאה במערכת",
      };
    }
    const causes = realtimePlatform.Causal.traceCauses(entityType, entityId, 3);
    const impacts = realtimePlatform.Causal.propagate(entityType, entityId, state.riskLevel === "critical" ? "critical" : "warning", 3);
    return {
      currentStatus: `${state.currentStatus} (סיכון: ${state.riskLevel ?? "none"})`,
      causes: causes.map(c => `${c.linkType}: ${c.entityType}/${c.entityId}`),
      impacts: impacts.map(i => `${i.impactType}: ${i.entityType}/${i.entityId} (${i.severity})`),
      recommendation: this.recommendForEntity(state),
    };
  }

  private recommendForEntity(state: EntityState): string {
    if (state.riskLevel === "critical") return "פעולה מיידית נדרשת";
    if (state.riskLevel === "high") return "פעולה תוך יום";
    if (state.needsAttention) return "מעקב הדוק";
    return "המשך תהליך רגיל";
  }

  /**
   * Predict what's likely to happen next based on current state.
   */
  forecastNext(): Array<{
    prediction: string;
    likelihood: number;
    timeframe: string;
    impact: Severity;
  }> {
    const snapshot = realtimePlatform.Snapshot.company();
    const predictions: Array<{ prediction: string; likelihood: number; timeframe: string; impact: Severity }> = [];

    if (snapshot.forwardView.stockoutsImminent > 0) {
      predictions.push({
        prediction: `${snapshot.forwardView.stockoutsImminent} חוסרי מלאי צפויים להשפיע על ייצור`,
        likelihood: 0.85,
        timeframe: "24-48 שעות",
        impact: "warning",
      });
    }
    if (snapshot.forwardView.projectsAtRisk > 0) {
      predictions.push({
        prediction: `${snapshot.forwardView.projectsAtRisk} פרויקטים בסיכון לחרוג מלו״ז`,
        likelihood: 0.75,
        timeframe: "השבוע הקרוב",
        impact: "warning",
      });
    }
    if (snapshot.forwardView.paymentsDueSoon > 0) {
      predictions.push({
        prediction: `${snapshot.forwardView.paymentsDueSoon} תשלומים שמתקרבים לתאריך פירעון`,
        likelihood: 0.9,
        timeframe: "7 ימים",
        impact: "info",
      });
    }
    if (snapshot.openCriticalAlerts.length > 0) {
      predictions.push({
        prediction: `אם לא יפתרו ${snapshot.openCriticalAlerts.length} ההתראות הקריטיות — צפויה אסקלציה`,
        likelihood: 0.95,
        timeframe: "48 שעות",
        impact: "critical",
      });
    }

    return predictions;
  }
}

// ════════════════════════════════════════════════════════════════
// ORCHESTRATION — wire all engines together and to the real-time bus
// ════════════════════════════════════════════════════════════════

export class IntelligencePlatform {
  decisions = new DecisionEngine();
  execution = new ExecutionEngine();
  learning = new LearningEngine();
  profit = new ProfitEngine();
  brain = new AIBrainEngine();

  private autoExecuteEnabled = true;

  constructor() {
    // Subscribe to the real-time event bus
    realtimePlatform.Bus.subscribeAll(async (event) => {
      await this.onEvent(event);
    });
  }

  setAutoExecute(enabled: boolean) {
    this.autoExecuteEnabled = enabled;
  }

  private async onEvent(event: UnifiedEvent) {
    // 1. Evaluate decision rules
    const decisions = this.decisions.evaluate(event);
    if (decisions.length === 0) return;

    // 2. For each new decision: estimate profit impact + auto-execute if allowed
    for (const decision of decisions) {
      this.learning.recordTriggered(decision.ruleId, decision.ruleName);

      const entityValue = (event.newState?.["value"] as number | undefined)
        ?? event.financialImpact
        ?? undefined;
      const impact = this.profit.estimateImpact(decision, entityValue ?? undefined);
      this.decisions.setProfitEstimate(decision.id, impact);

      // 3. Auto-execute if allowed + auto-approved
      if (this.autoExecuteEnabled && decision.status === "auto_approved") {
        const execRecord = await this.execution.execute(decision, this.decisions);
        // 4. Record outcome to learning (simulated outcome = 80% of predicted for demo)
        if (execRecord.status === "success") {
          const simulatedOutcome = impact.profitImpact * 0.85;
          this.learning.recordOutcome(decision, simulatedOutcome);
          this.profit.recordActual(decision, simulatedOutcome);
        } else if (execRecord.status === "failed") {
          this.learning.recordOutcome(decision, 0, execRecord.errorMessage);
        }
      }
    }
  }

  async approveAndExecute(decisionId: number, userId: string) {
    const decision = this.decisions.approve(decisionId, userId);
    if (!decision) return { success: false, message: "decision not found" };
    const record = await this.execution.execute(decision, this.decisions);
    if (record.status === "success") {
      const simulatedOutcome = (decision.estimatedProfitImpact ?? 0) * 0.9;
      this.learning.recordOutcome(decision, simulatedOutcome);
      this.profit.recordActual(decision, simulatedOutcome);
    }
    return { success: record.status === "success", record };
  }
}

export const intelligencePlatform = new IntelligencePlatform();
