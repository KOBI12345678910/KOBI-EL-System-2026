import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean, date, uuid } from "drizzle-orm/pg-core";

// ============================================================
// AGENTS - Core entity
// ============================================================
export const crmAgentsTable = pgTable("crm_agents", {
  id: serial("id").primaryKey(),
  agentCode: text("agent_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  status: text("status").notNull().default("active"), // active | inactive | suspended | probation
  roleId: integer("role_id"),
  teamId: integer("team_id"),
  managerUserId: integer("manager_user_id"),
  hireDate: date("hire_date"),
  terminationDate: date("termination_date"),
  salaryBase: numeric("salary_base", { precision: 15, scale: 2 }),
  commissionPlanId: integer("commission_plan_id"),
  monthlyCostEstimate: numeric("monthly_cost_estimate", { precision: 15, scale: 2 }),
  targetRevenueMonthly: numeric("target_revenue_monthly", { precision: 15, scale: 2 }),
  targetMeetingsMonthly: integer("target_meetings_monthly"),
  targetClosuresMonthly: integer("target_closures_monthly"),
  isSalesAgent: boolean("is_sales_agent").notNull().default(true),
  isManager: boolean("is_manager").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// AGENT ROLES
// ============================================================
export const crmAgentRolesTable = pgTable("crm_agent_roles", {
  id: serial("id").primaryKey(),
  roleName: text("role_name").notNull().unique(),
  description: text("description"),
  canReceiveLeads: boolean("can_receive_leads").notNull().default(true),
  canCloseDeals: boolean("can_close_deals").notNull().default(true),
  canViewTeamMetrics: boolean("can_view_team_metrics").notNull().default(false),
  canViewProfitability: boolean("can_view_profitability").notNull().default(false),
  canManageAlertRules: boolean("can_manage_alert_rules").notNull().default(false),
});

// ============================================================
// AGENT TEAMS
// ============================================================
export const crmAgentTeamsTable = pgTable("crm_agent_teams", {
  id: serial("id").primaryKey(),
  teamName: text("team_name").notNull(),
  managerUserId: integer("manager_user_id"),
  departmentName: text("department_name"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// LEAD ASSIGNMENTS
// ============================================================
export const crmLeadAssignmentsTable = pgTable("crm_lead_assignments", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  assignedBy: integer("assigned_by"),
  sourceType: text("source_type").notNull().default("manual"), // manual | rule_engine | ai_assignment | round_robin | campaign
  priorityLevel: text("priority_level").notNull().default("medium"), // low | medium | high | critical
  firstResponseDueAt: timestamp("first_response_due_at"),
  firstResponseAt: timestamp("first_response_at"),
  followupDueAt: timestamp("followup_due_at"),
  lastFollowupAt: timestamp("last_followup_at"),
  assignmentStatus: text("assignment_status").notNull().default("open"), // open | in_progress | contacted | qualified | converted | lost | burned
  wasReassigned: boolean("was_reassigned").notNull().default(false),
  reassignedFromAgentId: integer("reassigned_from_agent_id"),
  reassignedReason: text("reassigned_reason"),
});

// ============================================================
// AGENT ACTIVITIES
// ============================================================
export const crmAgentActivitiesTable = pgTable("crm_agent_activities", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  leadId: integer("lead_id"),
  opportunityId: integer("opportunity_id"),
  customerId: integer("customer_id"),
  activityType: text("activity_type").notNull(), // call | meeting | whatsapp | email | sms | note | task | followup | proposal_sent | status_change
  activityDirection: text("activity_direction").notNull().default("outbound"), // outbound | inbound | internal
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  durationMinutes: numeric("duration_minutes", { precision: 10, scale: 2 }),
  outcomeStatus: text("outcome_status").notNull().default("pending"), // successful | unanswered | no_show | postponed | rejected | pending | completed
  summary: text("summary"),
  sentimentScore: numeric("sentiment_score", { precision: 10, scale: 4 }),
  nextActionDueAt: timestamp("next_action_due_at"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT CALLS
// ============================================================
export const crmAgentCallsTable = pgTable("crm_agent_calls", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => crmAgentActivitiesTable.id),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  leadId: integer("lead_id"),
  contactId: integer("contact_id"),
  callStartedAt: timestamp("call_started_at").notNull(),
  callEndedAt: timestamp("call_ended_at"),
  callDurationSeconds: integer("call_duration_seconds"),
  callResult: text("call_result").notNull().default("answered"), // answered | missed | voicemail | rejected | invalid_number | callback_requested | closed
  wasRecorded: boolean("was_recorded").notNull().default(false),
  transcriptUrl: text("transcript_url"),
  aiSummaryId: integer("ai_summary_id"),
  objectionDetected: boolean("objection_detected").notNull().default(false),
  interestScore: numeric("interest_score", { precision: 10, scale: 2 }),
});

// ============================================================
// AGENT MEETINGS
// ============================================================
export const crmAgentMeetingsTable = pgTable("crm_agent_meetings", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => crmAgentActivitiesTable.id),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  leadId: integer("lead_id"),
  opportunityId: integer("opportunity_id"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  actualStartAt: timestamp("actual_start_at"),
  actualEndAt: timestamp("actual_end_at"),
  meetingStatus: text("meeting_status").notNull().default("scheduled"), // scheduled | held | no_show | rescheduled | cancelled
  meetingType: text("meeting_type").notNull().default("office"), // phone | zoom | office | onsite | showroom
  attendeesCount: integer("attendees_count").default(1),
  resultedInOffer: boolean("resulted_in_offer").notNull().default(false),
  resultedInClosure: boolean("resulted_in_closure").notNull().default(false),
  meetingScore: numeric("meeting_score", { precision: 10, scale: 2 }),
  notes: text("notes"),
});

// ============================================================
// LEAD BURN EVENTS 🔥
// ============================================================
export const crmLeadBurnEventsTable = pgTable("crm_lead_burn_events", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  burnedAt: timestamp("burned_at").notNull().defaultNow(),
  burnReason: text("burn_reason").notNull(), // no_followup | late_response | low_quality_handling | ignored | disqualified_wrongly | duplicate_mishandled | customer_lost_interest | competitor_won | no_show_unmanaged
  estimatedLeadValue: numeric("estimated_lead_value", { precision: 15, scale: 2 }),
  recovered: boolean("recovered").notNull().default(false),
  recoveredAt: timestamp("recovered_at"),
  recoveredByAgentId: integer("recovered_by_agent_id"),
  notes: text("notes"),
});

// ============================================================
// LOST OPPORTUNITY EVENTS
// ============================================================
export const crmLostOpportunityEventsTable = pgTable("crm_lost_opportunity_events", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").notNull(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  lostAt: timestamp("lost_at").notNull().defaultNow(),
  lostReason: text("lost_reason").notNull(), // price | slow_response | competitor | trust_issue | proposal_quality | budget_issue | internal_failure | no_followup | qualification_error
  estimatedDealValue: numeric("estimated_deal_value", { precision: 15, scale: 2 }),
  preventableLossScore: numeric("preventable_loss_score", { precision: 10, scale: 2 }),
  notes: text("notes"),
});

// ============================================================
// AGENT PIPELINE SNAPSHOTS (daily)
// ============================================================
export const crmAgentPipelineSnapshotsTable = pgTable("crm_agent_pipeline_snapshots", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  snapshotDate: date("snapshot_date").notNull(),
  openLeadsCount: integer("open_leads_count").notNull().default(0),
  qualifiedLeadsCount: integer("qualified_leads_count").notNull().default(0),
  meetingsScheduledCount: integer("meetings_scheduled_count").notNull().default(0),
  offersSentCount: integer("offers_sent_count").notNull().default(0),
  openOpportunitiesCount: integer("open_opportunities_count").notNull().default(0),
  weightedPipelineValue: numeric("weighted_pipeline_value", { precision: 20, scale: 2 }),
  expectedRevenueValue: numeric("expected_revenue_value", { precision: 20, scale: 2 }),
  stuckDealsCount: integer("stuck_deals_count").notNull().default(0),
  highRiskDealsCount: integer("high_risk_deals_count").notNull().default(0),
  avgDaysInStage: numeric("avg_days_in_stage", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT COST PROFILES
// ============================================================
export const crmAgentCostProfilesTable = pgTable("crm_agent_cost_profiles", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  baseSalary: numeric("base_salary", { precision: 15, scale: 2 }).notNull(),
  commissionFixed: numeric("commission_fixed", { precision: 15, scale: 2 }).default("0"),
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).default("0"),
  monthlyOverheadCost: numeric("monthly_overhead_cost", { precision: 15, scale: 2 }).default("0"),
  technologyCost: numeric("technology_cost", { precision: 15, scale: 2 }).default("0"),
  leadCostAllocation: numeric("lead_cost_allocation", { precision: 15, scale: 2 }).default("0"),
  travelCost: numeric("travel_cost", { precision: 15, scale: 2 }).default("0"),
  trainingCost: numeric("training_cost", { precision: 15, scale: 2 }).default("0"),
  totalMonthlyCostEstimate: numeric("total_monthly_cost_estimate", { precision: 15, scale: 2 }),
  notes: text("notes"),
});

// ============================================================
// AGENT FINANCIAL PERFORMANCE
// ============================================================
export const crmAgentFinancialPerformanceTable = pgTable("crm_agent_financial_performance", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  periodType: text("period_type").notNull(), // daily | weekly | monthly | quarterly
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalRevenue: numeric("total_revenue", { precision: 20, scale: 2 }).notNull().default("0"),
  grossProfit: numeric("gross_profit", { precision: 20, scale: 2 }),
  netProfit: numeric("net_profit", { precision: 20, scale: 2 }),
  leadCostTotal: numeric("lead_cost_total", { precision: 15, scale: 2 }),
  salaryCostTotal: numeric("salary_cost_total", { precision: 15, scale: 2 }),
  commissionCostTotal: numeric("commission_cost_total", { precision: 15, scale: 2 }),
  overheadCostTotal: numeric("overhead_cost_total", { precision: 15, scale: 2 }),
  totalCostTotal: numeric("total_cost_total", { precision: 15, scale: 2 }),
  valuePerLead: numeric("value_per_lead", { precision: 15, scale: 2 }),
  valuePerMeeting: numeric("value_per_meeting", { precision: 15, scale: 2 }),
  valuePerClosedDeal: numeric("value_per_closed_deal", { precision: 15, scale: 2 }),
  wastedLeadsValue: numeric("wasted_leads_value", { precision: 15, scale: 2 }),
  lostOpportunityValue: numeric("lost_opportunity_value", { precision: 15, scale: 2 }),
  roiEmployee: numeric("roi_employee", { precision: 10, scale: 4 }),
  profitabilityRatio: numeric("profitability_ratio", { precision: 10, scale: 4 }),
  paybackRatio: numeric("payback_ratio", { precision: 10, scale: 4 }),
  isProfitable: boolean("is_profitable").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT PROFITABILITY SNAPSHOTS
// ============================================================
export const crmAgentProfitabilitySnapshotsTable = pgTable("crm_agent_profitability_snapshots", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  snapshotDate: date("snapshot_date").notNull(),
  trailing7dRevenue: numeric("trailing_7d_revenue", { precision: 20, scale: 2 }),
  trailing30dRevenue: numeric("trailing_30d_revenue", { precision: 20, scale: 2 }),
  trailing90dRevenue: numeric("trailing_90d_revenue", { precision: 20, scale: 2 }),
  trailing30dCost: numeric("trailing_30d_cost", { precision: 20, scale: 2 }),
  trailing30dProfit: numeric("trailing_30d_profit", { precision: 20, scale: 2 }),
  trailing30dRoi: numeric("trailing_30d_roi", { precision: 10, scale: 4 }),
  burnedValue30d: numeric("burned_value_30d", { precision: 15, scale: 2 }),
  lostValue30d: numeric("lost_value_30d", { precision: 15, scale: 2 }),
  agentWorthScore: numeric("agent_worth_score", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT ALERT RULES
// ============================================================
export const crmAgentAlertRulesTable = pgTable("crm_agent_alert_rules", {
  id: serial("id").primaryKey(),
  ruleName: text("rule_name").notNull(),
  scopeType: text("scope_type").notNull().default("global"), // global | team | agent
  scopeTeamId: integer("scope_team_id"),
  scopeAgentId: integer("scope_agent_id"),
  metricName: text("metric_name").notNull(),
  operator: text("operator").notNull(), // gt | gte | lt | lte | eq | between
  thresholdValue1: numeric("threshold_value_1", { precision: 20, scale: 4 }).notNull(),
  thresholdValue2: numeric("threshold_value_2", { precision: 20, scale: 4 }),
  severity: text("severity").notNull().default("warning"), // info | warning | critical
  actionType: text("action_type").notNull(), // notify_agent | notify_manager | create_task | escalate | reassign_lead | block_assignment
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT ALERTS (instances)
// ============================================================
export const crmAgentAlertsExtTable = pgTable("crm_agent_alerts_ext", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  relatedLeadId: integer("related_lead_id"),
  relatedOpportunityId: integer("related_opportunity_id"),
  alertRuleId: integer("alert_rule_id").references(() => crmAgentAlertRulesTable.id),
  alertType: text("alert_type").notNull(), // slow_response | missed_followup | high_burn_rate | low_conversion | no_activity | negative_roi | missed_target | deal_stuck | abnormal_drop | quality_issue
  severity: text("severity").notNull().default("warning"),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  metricValue: numeric("metric_value", { precision: 20, scale: 4 }),
  thresholdValue: numeric("threshold_value", { precision: 20, scale: 4 }),
  isOpen: boolean("is_open").notNull().default(true),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: integer("resolved_by"),
  resolutionNote: text("resolution_note"),
});

// ============================================================
// AGENT SCORECARDS
// ============================================================
export const crmAgentScorecardsTable = pgTable("crm_agent_scorecards", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  periodType: text("period_type").notNull(), // weekly | monthly | quarterly
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  revenueScore: numeric("revenue_score", { precision: 10, scale: 2 }),
  conversionScore: numeric("conversion_score", { precision: 10, scale: 2 }),
  efficiencyScore: numeric("efficiency_score", { precision: 10, scale: 2 }),
  wastePenaltyScore: numeric("waste_penalty_score", { precision: 10, scale: 2 }),
  disciplineScore: numeric("discipline_score", { precision: 10, scale: 2 }),
  profitabilityScore: numeric("profitability_score", { precision: 10, scale: 2 }),
  finalWeightedScore: numeric("final_weighted_score", { precision: 10, scale: 2 }),
  finalGrade: text("final_grade").notNull().default("C"), // A_plus | A | B | C | D | F
  rankPosition: integer("rank_position"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT RANKINGS
// ============================================================
export const crmAgentRankingsTable = pgTable("crm_agent_rankings", {
  id: serial("id").primaryKey(),
  rankingDate: date("ranking_date").notNull(),
  rankingScope: text("ranking_scope").notNull().default("company"), // company | team
  teamId: integer("team_id"),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  rankingType: text("ranking_type").notNull(), // revenue | conversion | efficiency | profitability | discipline | overall
  rankingPosition: integer("ranking_position").notNull(),
  rankingScore: numeric("ranking_score", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT PERFORMANCE REVIEWS
// ============================================================
export const crmAgentPerformanceReviewsTable = pgTable("crm_agent_performance_reviews", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  reviewerUserId: integer("reviewer_user_id").notNull(),
  reviewPeriodStart: date("review_period_start").notNull(),
  reviewPeriodEnd: date("review_period_end").notNull(),
  strengths: text("strengths"),
  weaknesses: text("weaknesses"),
  coachingActions: text("coaching_actions"),
  improvementRequired: boolean("improvement_required").notNull().default(false),
  promotionCandidate: boolean("promotion_candidate").notNull().default(false),
  terminationRisk: boolean("termination_risk").notNull().default(false),
  reviewScore: numeric("review_score", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT COMMISSIONS
// ============================================================
export const crmAgentCommissionsTable = pgTable("crm_agent_commissions", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => crmAgentsTable.id),
  dealId: integer("deal_id"),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  dealValue: numeric("deal_value", { precision: 20, scale: 2 }),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 4 }),
  commissionAmount: numeric("commission_amount", { precision: 15, scale: 2 }).notNull(),
  bonusAmount: numeric("bonus_amount", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("pending"), // pending | approved | paid | cancelled
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
