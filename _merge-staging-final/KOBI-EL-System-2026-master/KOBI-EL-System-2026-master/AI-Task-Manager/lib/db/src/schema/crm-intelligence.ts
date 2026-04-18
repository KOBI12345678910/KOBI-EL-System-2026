import { pgTable, serial, text, integer, numeric, timestamp, jsonb, boolean, date } from "drizzle-orm/pg-core";

// ============================================================
// CUSTOMER INTELLIGENCE SCORES
// ============================================================
export const crmCustomerScoresTable = pgTable("crm_customer_scores", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  // Core scores (0-100)
  lifetimeValue: numeric("lifetime_value", { precision: 20, scale: 2 }),
  probabilityToClose: numeric("probability_to_close", { precision: 10, scale: 4 }),
  probabilityToChurn: numeric("probability_to_churn", { precision: 10, scale: 4 }),
  expectedRevenueFuture: numeric("expected_revenue_future", { precision: 20, scale: 2 }),
  riskScore: numeric("risk_score", { precision: 10, scale: 2 }),
  paymentBehaviorScore: numeric("payment_behavior_score", { precision: 10, scale: 2 }),
  engagementScore: numeric("engagement_score", { precision: 10, scale: 2 }),
  influenceScore: numeric("influence_score", { precision: 10, scale: 2 }),
  referralPotentialScore: numeric("referral_potential_score", { precision: 10, scale: 2 }),
  // Behavioral
  interestLevel: numeric("interest_level", { precision: 10, scale: 2 }),
  hesitationLevel: numeric("hesitation_level", { precision: 10, scale: 2 }),
  urgencyLevel: numeric("urgency_level", { precision: 10, scale: 2 }),
  buyingIntentScore: numeric("buying_intent_score", { precision: 10, scale: 2 }),
  // Health
  healthScore: numeric("health_score", { precision: 10, scale: 2 }),
  npsScore: integer("nps_score"),
  // AI outputs
  nextBestAction: text("next_best_action"),
  nextBestOffer: text("next_best_offer"),
  riskAlerts: jsonb("risk_alerts"),
  upsellOpportunities: jsonb("upsell_opportunities"),
  crossSellOpportunities: jsonb("cross_sell_opportunities"),
  // Meta
  lastComputedAt: timestamp("last_computed_at").notNull().defaultNow(),
  modelVersion: text("model_version").notNull().default("1.0"),
  inputDataJson: jsonb("input_data_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================
// LEAD SCORES
// ============================================================
export const crmLeadScoresTable = pgTable("crm_lead_scores", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(),
  score: numeric("score", { precision: 10, scale: 2 }).notNull(),
  grade: text("grade").notNull().default("C"), // A, B, C, D
  conversionProbability: numeric("conversion_probability", { precision: 10, scale: 4 }),
  expectedValue: numeric("expected_value", { precision: 20, scale: 2 }),
  temperature: text("temperature").notNull().default("warm"), // cold | warm | hot
  factors: jsonb("factors"), // { source_weight: 0.3, engagement: 0.8, fit: 0.6 }
  lastComputedAt: timestamp("last_computed_at").notNull().defaultNow(),
});

// ============================================================
// DEAL SCORES
// ============================================================
export const crmDealScoresTable = pgTable("crm_deal_scores", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").notNull(),
  winProbability: numeric("win_probability", { precision: 10, scale: 4 }).notNull(),
  predictedCloseDate: date("predicted_close_date"),
  predictedValue: numeric("predicted_value", { precision: 20, scale: 2 }),
  riskLevel: text("risk_level").notNull().default("medium"), // low | medium | high | critical
  stuckDays: integer("stuck_days"),
  velocityScore: numeric("velocity_score", { precision: 10, scale: 2 }),
  recommendedActions: jsonb("recommended_actions"), // ["schedule_demo", "offer_discount"]
  blockingFactors: jsonb("blocking_factors"), // ["no_budget", "competitor"]
  bestCase: numeric("best_case", { precision: 20, scale: 2 }),
  expectedCase: numeric("expected_case", { precision: 20, scale: 2 }),
  worstCase: numeric("worst_case", { precision: 20, scale: 2 }),
  lastComputedAt: timestamp("last_computed_at").notNull().defaultNow(),
});

// ============================================================
// PORTFOLIO SNAPSHOTS
// ============================================================
export const crmPortfolioSnapshotsTable = pgTable("crm_portfolio_snapshots", {
  id: serial("id").primaryKey(),
  snapshotDate: date("snapshot_date").notNull(),
  totalCustomers: integer("total_customers"),
  activeCustomers: integer("active_customers"),
  totalPipelineValue: numeric("total_pipeline_value", { precision: 20, scale: 2 }),
  weightedPipelineValue: numeric("weighted_pipeline_value", { precision: 20, scale: 2 }),
  totalLtv: numeric("total_ltv", { precision: 20, scale: 2 }),
  concentrationTop5: numeric("concentration_top5", { precision: 10, scale: 4 }),
  concentrationTop10: numeric("concentration_top10", { precision: 10, scale: 4 }),
  avgRiskScore: numeric("avg_risk_score", { precision: 10, scale: 2 }),
  avgHealthScore: numeric("avg_health_score", { precision: 10, scale: 2 }),
  churnRiskCount: integer("churn_risk_count"),
  segmentBreakdownJson: jsonb("segment_breakdown_json"),
  stageBreakdownJson: jsonb("stage_breakdown_json"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// COMMUNICATION ANALYSIS
// ============================================================
export const crmCommunicationAnalysisTable = pgTable("crm_communication_analysis", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // customer | lead | contact
  entityId: integer("entity_id").notNull(),
  channel: text("channel").notNull(), // call | whatsapp | email | meeting
  direction: text("direction").notNull(), // inbound | outbound
  timestamp: timestamp("timestamp").notNull(),
  // NLP analysis
  sentimentScore: numeric("sentiment_score", { precision: 10, scale: 4 }), // -1 to +1
  sentimentLabel: text("sentiment_label"), // positive | neutral | negative
  intentDetected: text("intent_detected"), // buy | inquire | complain | negotiate | cancel
  objectionDetected: text("objection_detected"), // price | timing | competitor | authority
  urgencyLevel: text("urgency_level"), // low | medium | high | critical
  // Outputs
  riskFlag: boolean("risk_flag").notNull().default(false),
  opportunityFlag: boolean("opportunity_flag").notNull().default(false),
  followupRecommendation: text("followup_recommendation"),
  aiSummary: text("ai_summary"),
  // Raw
  rawContentRef: text("raw_content_ref"), // reference to stored content
  duration: integer("duration_seconds"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// RELATIONSHIP GRAPH
// ============================================================
export const crmRelationshipEdgesTable = pgTable("crm_relationship_edges", {
  id: serial("id").primaryKey(),
  sourceType: text("source_type").notNull(), // customer | contact | employee | deal
  sourceId: integer("source_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  edgeType: text("edge_type").notNull(), // works_with | influences | decides | connected_to | reports_to | referred_by
  strength: numeric("strength", { precision: 10, scale: 2 }).default("50"), // 0-100
  isDecisionMaker: boolean("is_decision_maker").notNull().default(false),
  isInfluencer: boolean("is_influencer").notNull().default(false),
  notes: text("notes"),
  discoveredBy: text("discovered_by").notNull().default("manual"), // manual | ai | import
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// DECISION ENGINE LOG
// ============================================================
export const crmDecisionLogTable = pgTable("crm_decision_log", {
  id: serial("id").primaryKey(),
  triggerType: text("trigger_type").notNull(), // lead_created | deal_stuck | no_activity | risk_increase | payment_delay | negative_interaction
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  conditionsMet: jsonb("conditions_met").notNull(),
  decisionMade: text("decision_made").notNull(), // create_task | send_message | escalate | change_priority | suggest_discount | block_deal | notify_manager | auto_reassign
  decisionDetails: jsonb("decision_details"),
  aiConfidence: numeric("ai_confidence", { precision: 10, scale: 4 }),
  wasOverridden: boolean("was_overridden").notNull().default(false),
  overriddenBy: text("overridden_by"),
  executedAt: timestamp("executed_at"),
  status: text("status").notNull().default("executed"), // pending | executed | overridden | failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================
// PREDICTIVE FORECASTS
// ============================================================
export const crmForecastsTable = pgTable("crm_forecasts", {
  id: serial("id").primaryKey(),
  forecastType: text("forecast_type").notNull(), // revenue | pipeline | churn | growth
  periodLabel: text("period_label").notNull(), // "2026-Q2", "2026-04"
  bestCase: numeric("best_case", { precision: 20, scale: 2 }),
  expectedCase: numeric("expected_case", { precision: 20, scale: 2 }),
  worstCase: numeric("worst_case", { precision: 20, scale: 2 }),
  riskAdjusted: numeric("risk_adjusted", { precision: 20, scale: 2 }),
  confidenceLevel: numeric("confidence_level", { precision: 10, scale: 4 }),
  inputsJson: jsonb("inputs_json"),
  modelUsed: text("model_used"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
