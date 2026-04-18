// ============================================================================
// TechnoKoluzi ERP - AI Policy & Governance Engine
// Evaluates risk levels, enforces agent boundaries, and gates AI-driven
// actions based on configurable policy matrices.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AiPolicyDecision {
  riskLevel: RiskLevel;
  autoExecuteAllowed: boolean;
  requiresHumanReview: boolean;
  maxConfidenceThreshold: number;
  reason: string;
  requiredApprovalRole?: string;
}

export interface AgentBoundary {
  agentId: string;
  readScope: string[];
  writeScope: string[];
  blockedActions: string[];
  maxRiskLevel: RiskLevel;
  dailyActionLimit: number;
  requiresHumanForModules: string[];
}

export interface PolicyDecisionLog {
  id: string;
  timestamp: string;
  agentId: string;
  module: string;
  action: string;
  confidenceScore: number;
  decision: AiPolicyDecision;
  context: Record<string, unknown>;
  overriddenByHuman: boolean;
  overriddenBy?: string;
}

// ---------------------------------------------------------------------------
// Risk Matrix
// ---------------------------------------------------------------------------

const ACTION_RISK_MAP: Record<string, RiskLevel> = {
  // HIGH RISK actions
  delete: 'HIGH',
  reverse: 'HIGH',
  approve_finance: 'HIGH',
  change_price: 'HIGH',
  modify_master_data: 'HIGH',
  cancel_order: 'HIGH',
  void_invoice: 'HIGH',
  write_off: 'HIGH',
  change_bom: 'HIGH',
  modify_permissions: 'CRITICAL',
  bulk_delete: 'CRITICAL',
  export_all_data: 'CRITICAL',
  change_tax_rate: 'CRITICAL',
  modify_gl_account: 'HIGH',
  reverse_payment: 'HIGH',
  override_approval: 'CRITICAL',

  // MEDIUM RISK actions
  create_order: 'MEDIUM',
  schedule: 'MEDIUM',
  allocate_stock: 'MEDIUM',
  assign_resource: 'MEDIUM',
  send_notification: 'MEDIUM',
  create_invoice: 'MEDIUM',
  create_purchase_order: 'MEDIUM',
  update_record: 'MEDIUM',
  change_status: 'MEDIUM',
  submit_for_approval: 'MEDIUM',
  generate_report: 'MEDIUM',
  reschedule: 'MEDIUM',
  create_quote: 'MEDIUM',
  send_email: 'MEDIUM',

  // LOW RISK actions
  read: 'LOW',
  search: 'LOW',
  summarize: 'LOW',
  suggest: 'LOW',
  draft: 'LOW',
  classify: 'LOW',
  score: 'LOW',
  list: 'LOW',
  view: 'LOW',
  predict: 'LOW',
  analyze: 'LOW',
  calculate: 'LOW',
  preview: 'LOW',
  validate: 'LOW',
};

// Module-level risk overrides -- some modules are inherently more sensitive
const MODULE_RISK_OVERRIDES: Record<string, Partial<Record<string, RiskLevel>>> = {
  finance: {
    create_order: 'HIGH',
    update_record: 'HIGH',
    send_notification: 'HIGH',
  },
  hr: {
    update_record: 'HIGH',
    read: 'MEDIUM', // PII access
  },
  payroll: {
    create_order: 'CRITICAL',
    update_record: 'CRITICAL',
    read: 'HIGH',
  },
  security: {
    update_record: 'CRITICAL',
    read: 'HIGH',
  },
};

// ---------------------------------------------------------------------------
// Confidence Thresholds per Risk Level
// ---------------------------------------------------------------------------

const CONFIDENCE_THRESHOLDS: Record<RiskLevel, number> = {
  LOW: 0.6,
  MEDIUM: 0.75,
  HIGH: 0.9,
  CRITICAL: 0.98,
};

// Approval role requirements per risk level
const APPROVAL_ROLES: Record<RiskLevel, string | undefined> = {
  LOW: undefined,
  MEDIUM: undefined,
  HIGH: 'manager',
  CRITICAL: 'admin',
};

// ---------------------------------------------------------------------------
// Default Agent Boundaries
// ---------------------------------------------------------------------------

const DEFAULT_AGENT_BOUNDARIES: Record<string, AgentBoundary> = {
  kimi_assistant: {
    agentId: 'kimi_assistant',
    readScope: ['*'],
    writeScope: ['quotes', 'leads', 'contacts', 'activities', 'notes', 'tasks', 'service_tickets'],
    blockedActions: ['delete', 'reverse', 'modify_permissions', 'bulk_delete', 'export_all_data', 'override_approval'],
    maxRiskLevel: 'MEDIUM',
    dailyActionLimit: 500,
    requiresHumanForModules: ['finance', 'hr', 'payroll', 'security'],
  },
  scheduling_agent: {
    agentId: 'scheduling_agent',
    readScope: ['projects', 'resources', 'work_orders', 'installations', 'calendar'],
    writeScope: ['schedules', 'assignments', 'work_orders'],
    blockedActions: ['delete', 'reverse', 'approve_finance', 'modify_permissions', 'bulk_delete', 'export_all_data'],
    maxRiskLevel: 'MEDIUM',
    dailyActionLimit: 200,
    requiresHumanForModules: ['finance', 'hr'],
  },
  procurement_agent: {
    agentId: 'procurement_agent',
    readScope: ['inventory', 'suppliers', 'purchase_orders', 'price_lists'],
    writeScope: ['purchase_orders', 'purchase_requests'],
    blockedActions: ['delete', 'approve_finance', 'modify_master_data', 'modify_permissions', 'bulk_delete'],
    maxRiskLevel: 'MEDIUM',
    dailyActionLimit: 100,
    requiresHumanForModules: ['finance'],
  },
  quality_agent: {
    agentId: 'quality_agent',
    readScope: ['work_orders', 'inspections', 'ncrs', 'ecrs', 'bom'],
    writeScope: ['inspections', 'ncrs', 'ecrs'],
    blockedActions: ['delete', 'approve_finance', 'modify_permissions', 'change_bom', 'bulk_delete'],
    maxRiskLevel: 'MEDIUM',
    dailyActionLimit: 150,
    requiresHumanForModules: ['finance', 'production'],
  },
  reporting_agent: {
    agentId: 'reporting_agent',
    readScope: ['*'],
    writeScope: ['reports', 'dashboards'],
    blockedActions: ['delete', 'reverse', 'approve_finance', 'modify_permissions', 'bulk_delete', 'export_all_data', 'update_record', 'create_order'],
    maxRiskLevel: 'LOW',
    dailyActionLimit: 1000,
    requiresHumanForModules: [],
  },
};

// ---------------------------------------------------------------------------
// AiPolicyEngine
// ---------------------------------------------------------------------------

export class AiPolicyEngine {
  private decisionLog: PolicyDecisionLog[] = [];
  private agentActionCounts: Record<string, { date: string; count: number }> = {};
  private customBoundaries: Record<string, AgentBoundary> = {};

  constructor(customBoundaries?: Record<string, AgentBoundary>) {
    if (customBoundaries) {
      this.customBoundaries = { ...customBoundaries };
    }
  }

  // -----------------------------------------------------------------------
  // Core evaluation
  // -----------------------------------------------------------------------

  evaluate(module: string, action: string, confidenceScore: number): AiPolicyDecision {
    const riskLevel = this.resolveRiskLevel(module, action);
    const threshold = CONFIDENCE_THRESHOLDS[riskLevel];
    const belowThreshold = confidenceScore < threshold;

    const autoExecuteAllowed =
      (riskLevel === 'LOW' || (riskLevel === 'MEDIUM' && !belowThreshold)) &&
      !belowThreshold;

    const requiresHumanReview =
      riskLevel === 'HIGH' ||
      riskLevel === 'CRITICAL' ||
      belowThreshold;

    let reason: string;
    if (riskLevel === 'CRITICAL') {
      reason = `Action "${action}" on module "${module}" is CRITICAL risk and always requires human approval.`;
    } else if (riskLevel === 'HIGH') {
      reason = `Action "${action}" on module "${module}" is HIGH risk. Human review required before execution.`;
    } else if (belowThreshold) {
      reason = `Confidence score ${confidenceScore.toFixed(2)} is below threshold ${threshold.toFixed(2)} for ${riskLevel} risk. Human review required.`;
    } else {
      reason = `Action "${action}" on module "${module}" is ${riskLevel} risk with sufficient confidence. Auto-execute allowed.`;
    }

    return {
      riskLevel,
      autoExecuteAllowed,
      requiresHumanReview,
      maxConfidenceThreshold: threshold,
      reason,
      requiredApprovalRole: requiresHumanReview ? APPROVAL_ROLES[riskLevel] : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Agent-level checks
  // -----------------------------------------------------------------------

  isActionAllowed(agentId: string, module: string, action: string): boolean {
    const boundary = this.getAgentBoundaries(agentId);

    // Check blocked actions
    if (boundary.blockedActions.includes(action)) return false;

    // Check write scope
    const isWriteAction = !['read', 'search', 'list', 'view', 'summarize', 'analyze', 'predict', 'calculate', 'preview', 'validate'].includes(action);
    if (isWriteAction) {
      if (!boundary.writeScope.includes('*') && !boundary.writeScope.includes(module)) {
        return false;
      }
    } else {
      // Read scope
      if (!boundary.readScope.includes('*') && !boundary.readScope.includes(module)) {
        return false;
      }
    }

    // Check module-level human requirement
    if (boundary.requiresHumanForModules.includes(module)) {
      const riskLevel = this.resolveRiskLevel(module, action);
      if (riskLevel !== 'LOW') return false;
    }

    // Check risk ceiling
    const riskLevel = this.resolveRiskLevel(module, action);
    if (!this.isRiskWithinCeiling(riskLevel, boundary.maxRiskLevel)) return false;

    // Check daily limit
    if (!this.checkDailyLimit(agentId, boundary.dailyActionLimit)) return false;

    return true;
  }

  getAgentBoundaries(agentId: string): AgentBoundary {
    // Custom overrides first, then defaults, then a fallback restrictive boundary
    if (this.customBoundaries[agentId]) return this.customBoundaries[agentId];
    if (DEFAULT_AGENT_BOUNDARIES[agentId]) return DEFAULT_AGENT_BOUNDARIES[agentId];

    // Unknown agents get a very restrictive default
    return {
      agentId,
      readScope: [],
      writeScope: [],
      blockedActions: ['delete', 'reverse', 'approve_finance', 'modify_permissions', 'bulk_delete', 'export_all_data', 'override_approval'],
      maxRiskLevel: 'LOW',
      dailyActionLimit: 10,
      requiresHumanForModules: ['*'],
    };
  }

  /** Register or update custom boundaries for an agent */
  setAgentBoundaries(agentId: string, boundary: AgentBoundary): void {
    this.customBoundaries[agentId] = boundary;
  }

  // -----------------------------------------------------------------------
  // Decision logging
  // -----------------------------------------------------------------------

  logDecision(
    decision: AiPolicyDecision,
    agentId: string,
    context: Record<string, unknown>,
  ): PolicyDecisionLog {
    const entry: PolicyDecisionLog = {
      id: `pol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      agentId,
      module: (context.module as string) ?? 'unknown',
      action: (context.action as string) ?? 'unknown',
      confidenceScore: (context.confidenceScore as number) ?? 0,
      decision,
      context,
      overriddenByHuman: false,
    };

    this.decisionLog.push(entry);

    // Increment daily counter
    this.incrementDailyCount(agentId);

    return entry;
  }

  /** Mark a logged decision as overridden by a human */
  overrideDecision(logId: string, overriddenBy: string): boolean {
    const entry = this.decisionLog.find((e) => e.id === logId);
    if (!entry) return false;
    entry.overriddenByHuman = true;
    entry.overriddenBy = overriddenBy;
    return true;
  }

  /** Get recent decision log (last N entries) */
  getDecisionLog(limit = 100): PolicyDecisionLog[] {
    return this.decisionLog.slice(-limit);
  }

  /** Get decisions for a specific agent */
  getAgentDecisions(agentId: string, limit = 50): PolicyDecisionLog[] {
    return this.decisionLog
      .filter((e) => e.agentId === agentId)
      .slice(-limit);
  }

  // -----------------------------------------------------------------------
  // Bulk evaluation helpers
  // -----------------------------------------------------------------------

  /** Evaluate a batch of intended actions and return a summary */
  evaluateBatch(
    agentId: string,
    actions: { module: string; action: string; confidenceScore: number }[],
  ): { decisions: AiPolicyDecision[]; blockedCount: number; reviewCount: number; autoCount: number } {
    let blockedCount = 0;
    let reviewCount = 0;
    let autoCount = 0;

    const decisions = actions.map(({ module, action, confidenceScore }) => {
      const allowed = this.isActionAllowed(agentId, module, action);
      if (!allowed) {
        blockedCount++;
        return {
          riskLevel: 'CRITICAL' as RiskLevel,
          autoExecuteAllowed: false,
          requiresHumanReview: true,
          maxConfidenceThreshold: 1,
          reason: `Agent "${agentId}" is not permitted to perform "${action}" on module "${module}".`,
          requiredApprovalRole: 'admin',
        };
      }

      const decision = this.evaluate(module, action, confidenceScore);
      if (decision.requiresHumanReview) reviewCount++;
      if (decision.autoExecuteAllowed) autoCount++;
      return decision;
    });

    return { decisions, blockedCount, reviewCount, autoCount };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private resolveRiskLevel(module: string, action: string): RiskLevel {
    // Check module-specific override first
    const moduleOverrides = MODULE_RISK_OVERRIDES[module];
    if (moduleOverrides && moduleOverrides[action]) {
      return moduleOverrides[action]!;
    }

    // Fall back to global action risk map
    return ACTION_RISK_MAP[action] ?? 'HIGH'; // Unknown actions default to HIGH
  }

  private isRiskWithinCeiling(actual: RiskLevel, ceiling: RiskLevel): boolean {
    const order: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return order.indexOf(actual) <= order.indexOf(ceiling);
  }

  private checkDailyLimit(agentId: string, limit: number): boolean {
    const today = new Date().toISOString().slice(0, 10);
    const counter = this.agentActionCounts[agentId];
    if (!counter || counter.date !== today) return true;
    return counter.count < limit;
  }

  private incrementDailyCount(agentId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const counter = this.agentActionCounts[agentId];
    if (!counter || counter.date !== today) {
      this.agentActionCounts[agentId] = { date: today, count: 1 };
    } else {
      counter.count++;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export for convenience
// ---------------------------------------------------------------------------

export const aiPolicyEngine = new AiPolicyEngine();
