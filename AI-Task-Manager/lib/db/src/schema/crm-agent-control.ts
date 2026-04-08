import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean, date } from "drizzle-orm/pg-core";

// ============================================================
// AGENT (SALES REP) SCORES - "כל סוכן = יחידת השקעה"
// ============================================================
export const crmAgentScoresTable = pgTable("crm_agent_scores", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(), // employee_id
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),

  // Volume metrics
  totalLeadsReceived: integer("total_leads_received").notNull().default(0),
  leadsHandled: integer("leads_handled").notNull().default(0),
  leadsIgnored: integer("leads_ignored").notNull().default(0),
  leadsLost: integer("leads_lost").notNull().default(0),
  leadsBurned: integer("leads_burned").notNull().default(0), // 🔥 הכי חשוב

  // Activity metrics
  callsMade: integer("calls_made").notNull().default(0),
  callsAnswered: integer("calls_answered").notNull().default(0),
  meetingsSet: integer("meetings_set").notNull().default(0),
  meetingsHeld: integer("meetings_held").notNull().default(0),
  followupsDone: integer("followups_done").notNull().default(0),
  responseTimeAvgMinutes: numeric("response_time_avg_minutes", { precision: 10, scale: 2 }),

  // Conversion metrics
  leadToMeetingRatio: numeric("lead_to_meeting_ratio", { precision: 10, scale: 4 }),
  meetingToOfferRatio: numeric("meeting_to_offer_ratio", { precision: 10, scale: 4 }),
  offerToCloseRatio: numeric("offer_to_close_ratio", { precision: 10, scale: 4 }),
  leadToCloseRatio: numeric("lead_to_close_ratio", { precision: 10, scale: 4 }),
  pipelineConversionRate: numeric("pipeline_conversion_rate", { precision: 10, scale: 4 }),

  // Financial metrics
  totalRevenueGenerated: numeric("total_revenue_generated", { precision: 20, scale: 2 }).notNull().default("0"),
  averageDealSize: numeric("average_deal_size", { precision: 20, scale: 2 }),
  revenuePerLead: numeric("revenue_per_lead", { precision: 20, scale: 2 }),
  revenuePerMeeting: numeric("revenue_per_meeting", { precision: 20, scale: 2 }),
  revenuePerDay: numeric("revenue_per_day", { precision: 20, scale: 2 }),
  revenuePerAgentHour: numeric("revenue_per_agent_hour", { precision: 20, scale: 2 }),

  // Efficiency metrics
  timeToFirstResponseMinutes: numeric("time_to_first_response_minutes", { precision: 10, scale: 2 }),
  timeToCloseDays: numeric("time_to_close_days", { precision: 10, scale: 2 }),
  dealsPerDay: numeric("deals_per_day", { precision: 10, scale: 4 }),
  meetingsPerDay: numeric("meetings_per_day", { precision: 10, scale: 4 }),
  tasksCompletionRate: numeric("tasks_completion_rate", { precision: 10, scale: 4 }),

  // Waste metrics 🔥
  burnedLeadsRatio: numeric("burned_leads_ratio", { precision: 10, scale: 4 }),
  noFollowupRatio: numeric("no_followup_ratio", { precision: 10, scale: 4 }),
  missedOpportunities: integer("missed_opportunities").notNull().default(0),
  abandonedLeads: integer("abandoned_leads").notNull().default(0),
  slowResponsePenalty: numeric("slow_response_penalty", { precision: 10, scale: 2 }),
  wastedLeadsValue: numeric("wasted_leads_value", { precision: 20, scale: 2 }), // leads_burned * avg_lead_value

  // Quality metrics
  customerSatisfactionScore: numeric("customer_satisfaction_score", { precision: 10, scale: 2 }),
  callQualityScore: numeric("call_quality_score", { precision: 10, scale: 2 }),
  complianceScore: numeric("compliance_score", { precision: 10, scale: 2 }),

  // Critical ratios
  leadBurnRate: numeric("lead_burn_rate", { precision: 10, scale: 4 }), // leads_lost / total_leads
  meetingRatio: numeric("meeting_ratio", { precision: 10, scale: 4 }), // meetings_set / leads_handled
  meetingShowRate: numeric("meeting_show_rate", { precision: 10, scale: 4 }), // meetings_held / meetings_set
  closingRatio: numeric("closing_ratio", { precision: 10, scale: 4 }), // closed / meetings_held

  // Composite scores
  agentScore: numeric("agent_score", { precision: 10, scale: 2 }), // 0-100 overall
  efficiencyScore: numeric("efficiency_score", { precision: 10, scale: 2 }),
  wasteScore: numeric("waste_score", { precision: 10, scale: 2 }), // higher = more waste
  profitabilityScore: numeric("profitability_score", { precision: 10, scale: 2 }),
  riskScoreEmployee: numeric("risk_score_employee", { precision: 10, scale: 2 }),

  // Agent worth: revenue - (salary + cost + wasted_leads_value)
  agentCost: numeric("agent_cost", { precision: 20, scale: 2 }), // salary + overhead
  agentWorth: numeric("agent_worth", { precision: 20, scale: 2 }), // revenue - cost - waste
  roi: numeric("roi", { precision: 10, scale: 4 }), // agent_worth / agent_cost

  computedAt: timestamp("computed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT DAILY SNAPSHOT - Real-time tracking
// ============================================================
export const crmAgentDailyTable = pgTable("crm_agent_daily", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  date: date("date").notNull(),
  leadsReceived: integer("leads_received").notNull().default(0),
  leadsHandled: integer("leads_handled").notNull().default(0),
  leadsBurned: integer("leads_burned").notNull().default(0),
  callsMade: integer("calls_made").notNull().default(0),
  callsAnswered: integer("calls_answered").notNull().default(0),
  meetingsHeld: integer("meetings_held").notNull().default(0),
  followupsDone: integer("followups_done").notNull().default(0),
  dealsWon: integer("deals_won").notNull().default(0),
  dealsLost: integer("deals_lost").notNull().default(0),
  revenueGenerated: numeric("revenue_generated", { precision: 20, scale: 2 }).notNull().default("0"),
  avgResponseMinutes: numeric("avg_response_minutes", { precision: 10, scale: 2 }),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// LEAD BURN LOG - Track every burned lead 🔥
// ============================================================
export const crmLeadBurnLogTable = pgTable("crm_lead_burn_log", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  agentId: integer("agent_id").notNull(),
  burnReason: text("burn_reason").notNull(), // no_response | too_slow | missed_followup | bad_qualification | dropped | competitor_won
  leadValue: numeric("lead_value", { precision: 20, scale: 2 }), // estimated value lost
  responseTimeMinutes: numeric("response_time_minutes", { precision: 10, scale: 2 }),
  daysSinceLastContact: integer("days_since_last_contact"),
  wasPreventable: boolean("was_preventable").notNull().default(true),
  preventionAction: text("prevention_action"), // what should have been done
  burnedAt: timestamp("burned_at").notNull().defaultNow(),
});

// ============================================================
// AGENT ALERTS
// ============================================================
export const crmAgentAlertsTable = pgTable("crm_agent_alerts", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  alertType: text("alert_type").notNull(), // lead_burn | slow_response | low_conversion | missed_followup | inactivity | below_target
  severity: text("severity").notNull().default("medium"), // low | medium | high | critical
  message: text("message").notNull(),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  isRead: boolean("is_read").notNull().default(false),
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// AGENT TARGETS
// ============================================================
export const crmAgentTargetsTable = pgTable("crm_agent_targets", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  revenueTarget: numeric("revenue_target", { precision: 20, scale: 2 }),
  leadsTarget: integer("leads_target"),
  meetingsTarget: integer("meetings_target"),
  dealsTarget: integer("deals_target"),
  callsTarget: integer("calls_target"),
  maxBurnRate: numeric("max_burn_rate", { precision: 10, scale: 4 }).default("0.15"), // 15% max
  minResponseTimeMinutes: numeric("min_response_time_minutes", { precision: 10, scale: 2 }).default("30"),
  minConversionRate: numeric("min_conversion_rate", { precision: 10, scale: 4 }).default("0.10"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
