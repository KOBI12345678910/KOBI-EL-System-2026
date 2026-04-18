// ============================================================================
// TechnoKoluzi ERP - Workflow State Machine Engine v2
// Declarative workflow engine with role-based transitions, approval gates,
// and auto-action triggers for all ERP modules.
// ============================================================================

export interface WorkflowTransition {
  from: string;
  to: string;
  action: string;
  requiresApproval?: boolean;
  allowedRoles?: string[];
  validationFn?: string;
  autoActions?: string[];
}

export interface WorkflowDefinition {
  name: string;
  initialState: string;
  terminalStates: string[];
  transitions: WorkflowTransition[];
}

export interface TransitionValidationResult {
  valid: boolean;
  reason?: string;
}

export interface AvailableAction {
  action: string;
  nextState: string;
  requiresApproval: boolean;
  allowedRoles?: string[];
}

export interface TransitionEvent {
  workflowName: string;
  fromState: string;
  toState: string;
  action: string;
  triggeredBy?: string;
  userRole?: string;
  timestamp: string;
  autoActions: string[];
}

// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------

export class WorkflowEngine {
  public readonly name: string;
  private readonly transitions: WorkflowTransition[];
  private readonly definition: WorkflowDefinition;
  private readonly transitionLog: TransitionEvent[] = [];

  constructor(definition: WorkflowDefinition) {
    this.name = definition.name;
    this.definition = definition;
    this.transitions = definition.transitions;
  }

  /** Get the initial state of this workflow */
  getInitialState(): string {
    return this.definition.initialState;
  }

  /** Check whether a given state is terminal (no further transitions out) */
  isTerminalState(state: string): boolean {
    return this.definition.terminalStates.includes(state);
  }

  /** Get all unique states in this workflow */
  getAllStates(): string[] {
    const states = new Set<string>();
    states.add(this.definition.initialState);
    for (const t of this.transitions) {
      states.add(t.from);
      states.add(t.to);
    }
    return Array.from(states);
  }

  /** Check if transition is structurally possible (ignoring role) */
  canTransition(currentStatus: string, action: string, userRole?: string): boolean {
    const result = this.validateTransition(currentStatus, action, userRole);
    return result.valid;
  }

  /** Resolve the next state for a given (status, action) pair */
  getNextState(currentStatus: string, action: string): string | null {
    const match = this.transitions.find(
      (t) => t.from === currentStatus && t.action === action,
    );
    return match ? match.to : null;
  }

  /** List every action available from a given state, optionally filtered by role */
  getAvailableActions(currentStatus: string, userRole?: string): AvailableAction[] {
    return this.transitions
      .filter((t) => t.from === currentStatus)
      .filter((t) => {
        if (!userRole) return true;
        if (!t.allowedRoles || t.allowedRoles.length === 0) return true;
        return t.allowedRoles.includes(userRole);
      })
      .map((t) => ({
        action: t.action,
        nextState: t.to,
        requiresApproval: t.requiresApproval ?? false,
        allowedRoles: t.allowedRoles,
      }));
  }

  /** Full validation including role check */
  validateTransition(
    currentStatus: string,
    action: string,
    userRole?: string,
  ): TransitionValidationResult {
    const match = this.transitions.find(
      (t) => t.from === currentStatus && t.action === action,
    );

    if (!match) {
      return {
        valid: false,
        reason: `No transition found from "${currentStatus}" with action "${action}" in workflow "${this.name}".`,
      };
    }

    if (match.allowedRoles && match.allowedRoles.length > 0) {
      if (!userRole) {
        return {
          valid: false,
          reason: `Transition "${action}" requires one of roles [${match.allowedRoles.join(', ')}] but no role was provided.`,
        };
      }
      if (!match.allowedRoles.includes(userRole)) {
        return {
          valid: false,
          reason: `Role "${userRole}" is not permitted for action "${action}". Allowed: [${match.allowedRoles.join(', ')}].`,
        };
      }
    }

    return { valid: true };
  }

  /** Execute a transition and return the event (does NOT persist -- caller handles that) */
  executeTransition(
    currentStatus: string,
    action: string,
    triggeredBy?: string,
    userRole?: string,
  ): TransitionEvent | null {
    const validation = this.validateTransition(currentStatus, action, userRole);
    if (!validation.valid) return null;

    const match = this.transitions.find(
      (t) => t.from === currentStatus && t.action === action,
    )!;

    const event: TransitionEvent = {
      workflowName: this.name,
      fromState: currentStatus,
      toState: match.to,
      action,
      triggeredBy,
      userRole,
      timestamp: new Date().toISOString(),
      autoActions: match.autoActions ?? [],
    };

    this.transitionLog.push(event);
    return event;
  }

  /** Get the audit trail of transitions executed through this instance */
  getTransitionLog(): TransitionEvent[] {
    return [...this.transitionLog];
  }

  /** Get the raw transition that requires approval for a given action */
  requiresApproval(currentStatus: string, action: string): boolean {
    const match = this.transitions.find(
      (t) => t.from === currentStatus && t.action === action,
    );
    return match?.requiresApproval ?? false;
  }

  /** Serialize the workflow definition (useful for UI rendering) */
  toJSON(): WorkflowDefinition {
    return { ...this.definition };
  }
}

// ============================================================================
// WORKFLOW REGISTRIES
// ============================================================================

// ---------------------------------------------------------------------------
// 1. QUOTE WORKFLOW
// ---------------------------------------------------------------------------
export const QUOTE_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'QUOTE_WORKFLOW',
  initialState: 'DRAFT',
  terminalStates: ['ACCEPTED', 'EXPIRED', 'REJECTED'],
  transitions: [
    { from: 'DRAFT', to: 'SUBMITTED', action: 'submit', allowedRoles: ['sales_rep', 'sales_manager', 'admin'] },
    { from: 'SUBMITTED', to: 'PENDING_APPROVAL', action: 'request_approval', allowedRoles: ['sales_rep', 'sales_manager', 'admin'] },
    { from: 'SUBMITTED', to: 'DRAFT', action: 'return_to_draft', allowedRoles: ['sales_rep', 'sales_manager', 'admin'] },
    { from: 'PENDING_APPROVAL', to: 'APPROVED', action: 'approve', requiresApproval: true, allowedRoles: ['sales_manager', 'finance_manager', 'admin'], autoActions: ['notify_sales_rep'] },
    { from: 'PENDING_APPROVAL', to: 'DRAFT', action: 'reject_to_draft', allowedRoles: ['sales_manager', 'finance_manager', 'admin'], autoActions: ['notify_sales_rep'] },
    { from: 'APPROVED', to: 'SENT', action: 'send_to_customer', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['send_email', 'log_activity'] },
    { from: 'SENT', to: 'ACCEPTED', action: 'customer_accept', autoActions: ['create_sales_order', 'notify_operations'] },
    { from: 'SENT', to: 'REJECTED', action: 'customer_reject', autoActions: ['log_lost_reason'] },
    { from: 'SENT', to: 'EXPIRED', action: 'expire', autoActions: ['notify_sales_rep'] },
    { from: 'SENT', to: 'DRAFT', action: 'revise', allowedRoles: ['sales_rep', 'sales_manager', 'admin'] },
  ],
};

export const QUOTE_WORKFLOW = new WorkflowEngine(QUOTE_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 2. PROJECT WORKFLOW
// ---------------------------------------------------------------------------
export const PROJECT_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'PROJECT_WORKFLOW',
  initialState: 'DRAFT',
  terminalStates: ['ARCHIVED'],
  transitions: [
    { from: 'DRAFT', to: 'SUBMITTED', action: 'submit', allowedRoles: ['project_manager', 'admin'] },
    { from: 'SUBMITTED', to: 'IN_PROGRESS', action: 'start', requiresApproval: true, allowedRoles: ['project_manager', 'operations_manager', 'admin'], autoActions: ['allocate_resources', 'create_schedule'] },
    { from: 'SUBMITTED', to: 'DRAFT', action: 'return_to_draft', allowedRoles: ['project_manager', 'admin'] },
    { from: 'IN_PROGRESS', to: 'ON_HOLD', action: 'put_on_hold', allowedRoles: ['project_manager', 'operations_manager', 'admin'], autoActions: ['notify_team', 'pause_billing'] },
    { from: 'ON_HOLD', to: 'IN_PROGRESS', action: 'resume', allowedRoles: ['project_manager', 'operations_manager', 'admin'], autoActions: ['notify_team', 'resume_billing'] },
    { from: 'IN_PROGRESS', to: 'COMPLETED', action: 'complete', allowedRoles: ['project_manager', 'admin'], validationFn: 'validateAllTasksClosed', autoActions: ['generate_final_report', 'trigger_invoicing'] },
    { from: 'COMPLETED', to: 'ARCHIVED', action: 'archive', allowedRoles: ['project_manager', 'admin'], autoActions: ['archive_documents'] },
    { from: 'COMPLETED', to: 'IN_PROGRESS', action: 'reopen', allowedRoles: ['project_manager', 'admin'] },
  ],
};

export const PROJECT_WORKFLOW = new WorkflowEngine(PROJECT_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 3. PURCHASE ORDER WORKFLOW
// ---------------------------------------------------------------------------
export const PURCHASE_ORDER_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'PURCHASE_ORDER_WORKFLOW',
  initialState: 'DRAFT',
  terminalStates: ['CLOSED'],
  transitions: [
    { from: 'DRAFT', to: 'SUBMITTED', action: 'submit', allowedRoles: ['procurement_officer', 'warehouse_manager', 'admin'] },
    { from: 'SUBMITTED', to: 'APPROVED', action: 'approve', requiresApproval: true, allowedRoles: ['procurement_manager', 'finance_manager', 'admin'], validationFn: 'validateBudgetAvailable', autoActions: ['notify_vendor'] },
    { from: 'SUBMITTED', to: 'DRAFT', action: 'reject_to_draft', allowedRoles: ['procurement_manager', 'finance_manager', 'admin'] },
    { from: 'APPROVED', to: 'SENT', action: 'send_to_vendor', allowedRoles: ['procurement_officer', 'admin'], autoActions: ['send_po_email', 'log_activity'] },
    { from: 'SENT', to: 'PARTIALLY_RECEIVED', action: 'partial_receive', allowedRoles: ['warehouse_manager', 'admin'], autoActions: ['update_inventory', 'create_grn'] },
    { from: 'SENT', to: 'RECEIVED', action: 'receive_full', allowedRoles: ['warehouse_manager', 'admin'], autoActions: ['update_inventory', 'create_grn', 'trigger_ap_invoice'] },
    { from: 'PARTIALLY_RECEIVED', to: 'RECEIVED', action: 'receive_remaining', allowedRoles: ['warehouse_manager', 'admin'], autoActions: ['update_inventory', 'create_grn', 'trigger_ap_invoice'] },
    { from: 'PARTIALLY_RECEIVED', to: 'CLOSED', action: 'close_short', allowedRoles: ['procurement_manager', 'admin'], autoActions: ['adjust_po_quantity'] },
    { from: 'RECEIVED', to: 'CLOSED', action: 'close', allowedRoles: ['procurement_officer', 'finance_manager', 'admin'], autoActions: ['reconcile_invoice'] },
    { from: 'DRAFT', to: 'CLOSED', action: 'cancel', allowedRoles: ['procurement_manager', 'admin'] },
    { from: 'SUBMITTED', to: 'CLOSED', action: 'cancel', allowedRoles: ['procurement_manager', 'admin'] },
  ],
};

export const PURCHASE_ORDER_WORKFLOW = new WorkflowEngine(PURCHASE_ORDER_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 4. WORK ORDER WORKFLOW
// ---------------------------------------------------------------------------
export const WORK_ORDER_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'WORK_ORDER_WORKFLOW',
  initialState: 'DRAFT',
  terminalStates: ['CLOSED'],
  transitions: [
    { from: 'DRAFT', to: 'RELEASED', action: 'release', allowedRoles: ['production_planner', 'production_manager', 'admin'], validationFn: 'validateBomAvailable', autoActions: ['reserve_materials'] },
    { from: 'RELEASED', to: 'IN_PROGRESS', action: 'start', allowedRoles: ['production_operator', 'production_manager', 'admin'], autoActions: ['issue_materials', 'start_time_tracking'] },
    { from: 'RELEASED', to: 'DRAFT', action: 'unrelease', allowedRoles: ['production_planner', 'admin'], autoActions: ['unreserve_materials'] },
    { from: 'IN_PROGRESS', to: 'PAUSED', action: 'pause', allowedRoles: ['production_operator', 'production_manager', 'admin'], autoActions: ['pause_time_tracking', 'log_pause_reason'] },
    { from: 'PAUSED', to: 'IN_PROGRESS', action: 'resume', allowedRoles: ['production_operator', 'production_manager', 'admin'], autoActions: ['resume_time_tracking'] },
    { from: 'IN_PROGRESS', to: 'COMPLETED', action: 'complete', allowedRoles: ['production_operator', 'production_manager', 'admin'], validationFn: 'validateQcPassed', autoActions: ['receive_finished_goods', 'calculate_actual_cost'] },
    { from: 'COMPLETED', to: 'CLOSED', action: 'close', allowedRoles: ['production_manager', 'admin'], autoActions: ['post_production_variance', 'archive_work_order'] },
    { from: 'COMPLETED', to: 'IN_PROGRESS', action: 'reopen', allowedRoles: ['production_manager', 'admin'] },
    { from: 'DRAFT', to: 'CLOSED', action: 'cancel', allowedRoles: ['production_manager', 'admin'] },
  ],
};

export const WORK_ORDER_WORKFLOW = new WorkflowEngine(WORK_ORDER_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 5. ECR (Engineering Change Request) WORKFLOW
// ---------------------------------------------------------------------------
export const ECR_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'ECR_WORKFLOW',
  initialState: 'DRAFT',
  terminalStates: ['CLOSED', 'REJECTED'],
  transitions: [
    { from: 'DRAFT', to: 'SUBMITTED', action: 'submit', allowedRoles: ['engineer', 'engineering_manager', 'admin'] },
    { from: 'SUBMITTED', to: 'UNDER_REVIEW', action: 'start_review', allowedRoles: ['engineering_manager', 'admin'], autoActions: ['notify_review_board'] },
    { from: 'SUBMITTED', to: 'DRAFT', action: 'return_to_draft', allowedRoles: ['engineering_manager', 'admin'] },
    { from: 'UNDER_REVIEW', to: 'APPROVED', action: 'approve', requiresApproval: true, allowedRoles: ['engineering_manager', 'admin'], autoActions: ['create_eco', 'notify_affected_departments'] },
    { from: 'UNDER_REVIEW', to: 'REJECTED', action: 'reject', allowedRoles: ['engineering_manager', 'admin'], autoActions: ['notify_requester'] },
    { from: 'UNDER_REVIEW', to: 'DRAFT', action: 'request_changes', allowedRoles: ['engineering_manager', 'admin'], autoActions: ['notify_requester'] },
    { from: 'APPROVED', to: 'IMPLEMENTED', action: 'implement', allowedRoles: ['engineer', 'engineering_manager', 'admin'], validationFn: 'validateEcoComplete', autoActions: ['update_bom', 'update_routing', 'notify_production'] },
    { from: 'IMPLEMENTED', to: 'CLOSED', action: 'close', allowedRoles: ['engineering_manager', 'admin'], autoActions: ['archive_ecr'] },
  ],
};

export const ECR_WORKFLOW = new WorkflowEngine(ECR_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 6. LEAD WORKFLOW (CRM)
// ---------------------------------------------------------------------------
export const LEAD_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'LEAD_WORKFLOW',
  initialState: 'NEW',
  terminalStates: ['WON', 'LOST'],
  transitions: [
    { from: 'NEW', to: 'CONTACTED', action: 'contact', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['log_activity'] },
    { from: 'NEW', to: 'LOST', action: 'disqualify', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['log_lost_reason'] },
    { from: 'CONTACTED', to: 'QUALIFIED', action: 'qualify', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['create_opportunity'] },
    { from: 'CONTACTED', to: 'LOST', action: 'disqualify', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['log_lost_reason'] },
    { from: 'QUALIFIED', to: 'PROPOSAL', action: 'send_proposal', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['create_quote'] },
    { from: 'QUALIFIED', to: 'LOST', action: 'disqualify', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['log_lost_reason'] },
    { from: 'PROPOSAL', to: 'NEGOTIATION', action: 'negotiate', allowedRoles: ['sales_rep', 'sales_manager', 'admin'] },
    { from: 'PROPOSAL', to: 'LOST', action: 'lose', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['log_lost_reason'] },
    { from: 'NEGOTIATION', to: 'WON', action: 'win', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['convert_to_customer', 'create_project', 'notify_operations'] },
    { from: 'NEGOTIATION', to: 'LOST', action: 'lose', allowedRoles: ['sales_rep', 'sales_manager', 'admin'], autoActions: ['log_lost_reason'] },
    { from: 'NEGOTIATION', to: 'PROPOSAL', action: 'revise_proposal', allowedRoles: ['sales_rep', 'sales_manager', 'admin'] },
  ],
};

export const LEAD_WORKFLOW = new WorkflowEngine(LEAD_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 7. SERVICE TICKET WORKFLOW
// ---------------------------------------------------------------------------
export const SERVICE_TICKET_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'SERVICE_TICKET_WORKFLOW',
  initialState: 'OPEN',
  terminalStates: ['CLOSED'],
  transitions: [
    { from: 'OPEN', to: 'ASSIGNED', action: 'assign', allowedRoles: ['service_coordinator', 'service_manager', 'admin'], autoActions: ['notify_technician'] },
    { from: 'ASSIGNED', to: 'IN_PROGRESS', action: 'start_work', allowedRoles: ['technician', 'service_manager', 'admin'], autoActions: ['start_sla_clock'] },
    { from: 'ASSIGNED', to: 'OPEN', action: 'unassign', allowedRoles: ['service_coordinator', 'service_manager', 'admin'] },
    { from: 'IN_PROGRESS', to: 'WAITING_PARTS', action: 'wait_for_parts', allowedRoles: ['technician', 'service_manager', 'admin'], autoActions: ['pause_sla_clock', 'create_purchase_request'] },
    { from: 'WAITING_PARTS', to: 'IN_PROGRESS', action: 'parts_received', allowedRoles: ['technician', 'warehouse_manager', 'admin'], autoActions: ['resume_sla_clock'] },
    { from: 'IN_PROGRESS', to: 'RESOLVED', action: 'resolve', allowedRoles: ['technician', 'service_manager', 'admin'], autoActions: ['stop_sla_clock', 'notify_customer'] },
    { from: 'RESOLVED', to: 'CLOSED', action: 'close', allowedRoles: ['service_coordinator', 'service_manager', 'admin'], autoActions: ['send_satisfaction_survey', 'archive_ticket'] },
    { from: 'RESOLVED', to: 'REOPENED', action: 'reopen', allowedRoles: ['service_coordinator', 'service_manager', 'admin', 'customer'], autoActions: ['restart_sla_clock', 'notify_technician'] },
    { from: 'REOPENED', to: 'IN_PROGRESS', action: 'start_work', allowedRoles: ['technician', 'service_manager', 'admin'] },
    { from: 'REOPENED', to: 'ASSIGNED', action: 'reassign', allowedRoles: ['service_coordinator', 'service_manager', 'admin'], autoActions: ['notify_technician'] },
  ],
};

export const SERVICE_TICKET_WORKFLOW = new WorkflowEngine(SERVICE_TICKET_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 8. INSTALLATION WORKFLOW
// ---------------------------------------------------------------------------
export const INSTALLATION_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'INSTALLATION_WORKFLOW',
  initialState: 'PLANNED',
  terminalStates: ['SIGNED_OFF'],
  transitions: [
    { from: 'PLANNED', to: 'SITE_READY', action: 'confirm_site', allowedRoles: ['installation_manager', 'project_manager', 'admin'], validationFn: 'validateSiteChecklist', autoActions: ['notify_installation_crew'] },
    { from: 'SITE_READY', to: 'IN_PROGRESS', action: 'start_installation', allowedRoles: ['installation_lead', 'installation_manager', 'admin'], autoActions: ['dispatch_crew', 'start_time_tracking'] },
    { from: 'SITE_READY', to: 'PLANNED', action: 'site_not_ready', allowedRoles: ['installation_lead', 'installation_manager', 'admin'], autoActions: ['notify_customer', 'reschedule'] },
    { from: 'IN_PROGRESS', to: 'PAUSED', action: 'pause', allowedRoles: ['installation_lead', 'installation_manager', 'admin'], autoActions: ['pause_time_tracking', 'log_pause_reason'] },
    { from: 'PAUSED', to: 'IN_PROGRESS', action: 'resume', allowedRoles: ['installation_lead', 'installation_manager', 'admin'], autoActions: ['resume_time_tracking'] },
    { from: 'IN_PROGRESS', to: 'COMPLETED', action: 'complete', allowedRoles: ['installation_lead', 'installation_manager', 'admin'], validationFn: 'validateInstallationChecklist', autoActions: ['stop_time_tracking', 'generate_completion_report'] },
    { from: 'COMPLETED', to: 'SIGNED_OFF', action: 'sign_off', requiresApproval: true, allowedRoles: ['customer', 'installation_manager', 'project_manager', 'admin'], autoActions: ['create_warranty', 'trigger_final_invoice', 'notify_service_team'] },
    { from: 'COMPLETED', to: 'IN_PROGRESS', action: 'rework', allowedRoles: ['installation_manager', 'admin'], autoActions: ['log_rework_reason'] },
  ],
};

export const INSTALLATION_WORKFLOW = new WorkflowEngine(INSTALLATION_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 9. INVOICE WORKFLOW
// ---------------------------------------------------------------------------
export const INVOICE_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'INVOICE_WORKFLOW',
  initialState: 'DRAFT',
  terminalStates: ['PAID', 'VOID'],
  transitions: [
    { from: 'DRAFT', to: 'SENT', action: 'send', allowedRoles: ['accountant', 'finance_manager', 'admin'], autoActions: ['send_invoice_email', 'start_payment_terms_clock'] },
    { from: 'DRAFT', to: 'VOID', action: 'void', allowedRoles: ['finance_manager', 'admin'] },
    { from: 'SENT', to: 'PARTIALLY_PAID', action: 'record_partial_payment', allowedRoles: ['accountant', 'finance_manager', 'admin'], autoActions: ['post_payment_journal', 'update_ar_balance'] },
    { from: 'SENT', to: 'PAID', action: 'record_full_payment', allowedRoles: ['accountant', 'finance_manager', 'admin'], autoActions: ['post_payment_journal', 'update_ar_balance', 'send_receipt'] },
    { from: 'SENT', to: 'OVERDUE', action: 'mark_overdue', autoActions: ['send_overdue_reminder', 'notify_sales_rep'] },
    { from: 'SENT', to: 'VOID', action: 'void', requiresApproval: true, allowedRoles: ['finance_manager', 'admin'], autoActions: ['reverse_journal', 'notify_customer'] },
    { from: 'PARTIALLY_PAID', to: 'PAID', action: 'record_full_payment', allowedRoles: ['accountant', 'finance_manager', 'admin'], autoActions: ['post_payment_journal', 'update_ar_balance', 'send_receipt'] },
    { from: 'PARTIALLY_PAID', to: 'OVERDUE', action: 'mark_overdue', autoActions: ['send_overdue_reminder', 'notify_sales_rep'] },
    { from: 'PARTIALLY_PAID', to: 'VOID', action: 'void', requiresApproval: true, allowedRoles: ['finance_manager', 'admin'], autoActions: ['reverse_journal', 'refund_partial', 'notify_customer'] },
    { from: 'OVERDUE', to: 'PAID', action: 'record_full_payment', allowedRoles: ['accountant', 'finance_manager', 'admin'], autoActions: ['post_payment_journal', 'update_ar_balance', 'send_receipt'] },
    { from: 'OVERDUE', to: 'PARTIALLY_PAID', action: 'record_partial_payment', allowedRoles: ['accountant', 'finance_manager', 'admin'], autoActions: ['post_payment_journal', 'update_ar_balance'] },
    { from: 'OVERDUE', to: 'VOID', action: 'write_off', requiresApproval: true, allowedRoles: ['finance_manager', 'admin'], autoActions: ['post_write_off_journal'] },
  ],
};

export const INVOICE_WORKFLOW = new WorkflowEngine(INVOICE_WORKFLOW_DEF);

// ---------------------------------------------------------------------------
// 10. VARIATION ORDER WORKFLOW
// ---------------------------------------------------------------------------
export const VARIATION_ORDER_WORKFLOW_DEF: WorkflowDefinition = {
  name: 'VARIATION_ORDER_WORKFLOW',
  initialState: 'DRAFT',
  terminalStates: ['IMPLEMENTED', 'REJECTED'],
  transitions: [
    { from: 'DRAFT', to: 'SUBMITTED', action: 'submit', allowedRoles: ['project_manager', 'site_engineer', 'admin'], autoActions: ['notify_approvers', 'calculate_cost_impact'] },
    { from: 'SUBMITTED', to: 'APPROVED', action: 'approve', requiresApproval: true, allowedRoles: ['project_manager', 'operations_manager', 'finance_manager', 'admin'], autoActions: ['update_project_budget', 'notify_customer', 'update_contract_value'] },
    { from: 'SUBMITTED', to: 'REJECTED', action: 'reject', allowedRoles: ['project_manager', 'operations_manager', 'finance_manager', 'admin'], autoActions: ['notify_requester'] },
    { from: 'SUBMITTED', to: 'DRAFT', action: 'return_to_draft', allowedRoles: ['project_manager', 'operations_manager', 'admin'] },
    { from: 'APPROVED', to: 'IMPLEMENTED', action: 'implement', allowedRoles: ['project_manager', 'site_engineer', 'admin'], validationFn: 'validateVoTasksComplete', autoActions: ['update_project_progress', 'trigger_additional_invoice'] },
    { from: 'APPROVED', to: 'DRAFT', action: 'revise', allowedRoles: ['project_manager', 'admin'] },
  ],
};

export const VARIATION_ORDER_WORKFLOW = new WorkflowEngine(VARIATION_ORDER_WORKFLOW_DEF);

// ============================================================================
// WORKFLOW REGISTRY -- lookup any workflow by name
// ============================================================================

export const WORKFLOW_REGISTRY: Record<string, WorkflowEngine> = {
  QUOTE_WORKFLOW: QUOTE_WORKFLOW,
  PROJECT_WORKFLOW: PROJECT_WORKFLOW,
  PURCHASE_ORDER_WORKFLOW: PURCHASE_ORDER_WORKFLOW,
  WORK_ORDER_WORKFLOW: WORK_ORDER_WORKFLOW,
  ECR_WORKFLOW: ECR_WORKFLOW,
  LEAD_WORKFLOW: LEAD_WORKFLOW,
  SERVICE_TICKET_WORKFLOW: SERVICE_TICKET_WORKFLOW,
  INSTALLATION_WORKFLOW: INSTALLATION_WORKFLOW,
  INVOICE_WORKFLOW: INVOICE_WORKFLOW,
  VARIATION_ORDER_WORKFLOW: VARIATION_ORDER_WORKFLOW,
};

/** Look up a workflow engine by registry key */
export function getWorkflow(name: string): WorkflowEngine | undefined {
  return WORKFLOW_REGISTRY[name];
}

/** List all registered workflow names */
export function listWorkflows(): string[] {
  return Object.keys(WORKFLOW_REGISTRY);
}
