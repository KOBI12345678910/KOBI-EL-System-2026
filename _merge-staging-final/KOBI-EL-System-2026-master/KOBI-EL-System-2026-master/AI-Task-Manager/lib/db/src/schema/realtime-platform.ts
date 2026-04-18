import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * BASH44 Real-Time Operational Intelligence Platform
 *
 * This is the FOUNDATION for the fully-integrated, live company picture.
 *
 * Core principle: NO silos. Every module publishes to a unified event stream,
 * every entity has a live state, every change propagates through the causal graph.
 *
 * Architecture:
 *  - unified_events    → central event bus (append-only log)
 *  - entity_states     → current live state of every entity across modules
 *  - causal_links      → dependency graph (what impacts what)
 *  - impact_chains     → cascading ripple effects (captured at event time)
 *  - state_transitions → full history of state changes
 *  - live_kpis         → real-time KPI values per tenant/unit
 *  - command_widgets   → command center dashboard config
 *  - live_alerts       → cross-system alerts tied to entities
 *  - operational_pulse → per-minute roll-ups of entire company state
 *  - module_heartbeats → health/liveness of each module
 */

// ════════════════════════════════════════════════════════════════
// UNIFIED EVENT STREAM — central bus for ALL company events
// ════════════════════════════════════════════════════════════════
export const unifiedEventsTable = pgTable(
  "unified_events",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    // Event identity
    eventType: varchar("event_type", { length: 100 }).notNull(),
    // e.g. "lead.created", "quote.approved", "production.delayed",
    //      "supplier.delivery.late", "payment.received", "stock.low"
    eventKey: varchar("event_key", { length: 200 }),
    // Source
    sourceModule: varchar("source_module", { length: 50 }).notNull(),
    // crm|sales|quotes|orders|projects|procurement|suppliers|inventory|
    // warehouse|production|qc|logistics|installations|service|billing|
    // payments|cashflow|hr|docs|alerts|ai|external
    sourceUserId: integer("source_user_id"),
    // Target entity
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }).notNull(),
    entityLabel: text("entity_label"),
    // Payload
    previousState: jsonb("previous_state"),
    newState: jsonb("new_state"),
    delta: jsonb("delta"),
    // Business impact
    severity: varchar("severity", { length: 20 }).notNull().default("info"),
    // info|success|warning|critical|blocker
    businessImpact: varchar("business_impact", { length: 20 }).default("none"),
    // none|low|medium|high|critical
    financialImpact: doublePrecision("financial_impact"),
    // Propagation
    causedByEventId: integer("caused_by_event_id"),
    correlationId: varchar("correlation_id", { length: 100 }),
    // Time
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    receivedAt: timestamp("received_at").notNull().defaultNow(),
    // Context
    metadata: jsonb("metadata").default({}),
    tags: jsonb("tags").$type<string[]>().default([]),
  },
  (table) => [
    index("idx_events_tenant_time").on(table.tenantId, table.occurredAt),
    index("idx_events_entity").on(table.entityType, table.entityId),
    index("idx_events_type").on(table.eventType),
    index("idx_events_module").on(table.sourceModule),
    index("idx_events_severity").on(table.severity),
    index("idx_events_correlation").on(table.correlationId),
  ]
);

// ════════════════════════════════════════════════════════════════
// ENTITY STATES — LIVE state of every entity across the company
// ════════════════════════════════════════════════════════════════
export const entityStatesTable = pgTable(
  "entity_states",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }).notNull(),
    entityLabel: text("entity_label"),
    module: varchar("module", { length: 50 }).notNull(),
    // Current state
    currentStatus: varchar("current_status", { length: 60 }).notNull(),
    // e.g. "active", "delayed", "at_risk", "completed", "blocked"
    statusColor: varchar("status_color", { length: 20 }),
    // green|yellow|orange|red|gray
    state: jsonb("state").default({}),
    // Risk & health
    healthScore: doublePrecision("health_score"),
    // 0-100, auto-computed from signals
    riskLevel: varchar("risk_level", { length: 20 }).default("none"),
    // none|low|medium|high|critical
    riskReasons: jsonb("risk_reasons").$type<string[]>().default([]),
    // Operational metrics
    progress: doublePrecision("progress"),
    // 0-100 where applicable
    value: doublePrecision("value"),
    // monetary or quantity value
    // Links to other entities (denormalized for fast reads)
    linkedEntities: jsonb("linked_entities").default([]),
    upstreamCount: integer("upstream_count").default(0),
    downstreamCount: integer("downstream_count").default(0),
    // Activity
    lastEventId: integer("last_event_id"),
    lastEventType: varchar("last_event_type", { length: 100 }),
    lastChangedAt: timestamp("last_changed_at").notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at").notNull().defaultNow(),
    // Flags
    needsAttention: boolean("needs_attention").default(false),
    isPinned: boolean("is_pinned").default(false),
    isArchived: boolean("is_archived").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_entity_state").on(table.tenantId, table.entityType, table.entityId),
    index("idx_entity_state_module").on(table.module),
    index("idx_entity_state_status").on(table.currentStatus),
    index("idx_entity_state_risk").on(table.riskLevel),
    index("idx_entity_state_attention").on(table.needsAttention),
    index("idx_entity_state_changed").on(table.lastChangedAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// CAUSAL LINKS — dependency graph across modules
// ════════════════════════════════════════════════════════════════
export const causalLinksTable = pgTable(
  "causal_links",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    fromEntityType: varchar("from_entity_type", { length: 80 }).notNull(),
    fromEntityId: varchar("from_entity_id", { length: 120 }).notNull(),
    toEntityType: varchar("to_entity_type", { length: 80 }).notNull(),
    toEntityId: varchar("to_entity_id", { length: 120 }).notNull(),
    // Relationship semantics
    linkType: varchar("link_type", { length: 60 }).notNull(),
    // "blocks", "depends_on", "produces", "consumes", "triggers",
    // "affects_cashflow", "affects_schedule", "affects_quality", etc.
    strength: doublePrecision("strength").default(1),
    // 0-1 — how strong the causal effect is
    propagationDelayMs: integer("propagation_delay_ms").default(0),
    // Metadata
    description: text("description"),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_causal_from").on(table.fromEntityType, table.fromEntityId),
    index("idx_causal_to").on(table.toEntityType, table.toEntityId),
    index("idx_causal_type").on(table.linkType),
  ]
);

// ════════════════════════════════════════════════════════════════
// IMPACT CHAINS — ripple effects captured at event time
// ════════════════════════════════════════════════════════════════
export const impactChainsTable = pgTable(
  "impact_chains",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    rootEventId: integer("root_event_id").notNull(),
    rootEntityType: varchar("root_entity_type", { length: 80 }).notNull(),
    rootEntityId: varchar("root_entity_id", { length: 120 }).notNull(),
    // The full chain of impacted entities
    chain: jsonb("chain").$type<
      Array<{
        depth: number;
        entityType: string;
        entityId: string;
        entityLabel?: string;
        impactType: string;
        severity: string;
        delayMs?: number;
      }>
    >().notNull(),
    // Aggregates
    totalImpacted: integer("total_impacted").notNull().default(0),
    maxSeverity: varchar("max_severity", { length: 20 }).default("info"),
    financialImpactTotal: doublePrecision("financial_impact_total"),
    // Time
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_impact_root_event").on(table.rootEventId),
    index("idx_impact_tenant").on(table.tenantId),
  ]
);

// ════════════════════════════════════════════════════════════════
// STATE TRANSITIONS — history of state changes
// ════════════════════════════════════════════════════════════════
export const stateTransitionsTable = pgTable(
  "state_transitions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }).notNull(),
    fromStatus: varchar("from_status", { length: 60 }),
    toStatus: varchar("to_status", { length: 60 }).notNull(),
    transitionType: varchar("transition_type", { length: 60 }),
    // "user_action"|"auto"|"system"|"ai"|"external"
    triggeredBy: varchar("triggered_by", { length: 100 }),
    eventId: integer("event_id"),
    reason: text("reason"),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_transitions_entity").on(table.entityType, table.entityId),
    index("idx_transitions_time").on(table.occurredAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// LIVE KPIs — real-time KPI values
// ════════════════════════════════════════════════════════════════
export const liveKpisTable = pgTable(
  "live_kpis",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    kpiKey: varchar("kpi_key", { length: 100 }).notNull(),
    // sales.mtd|orders.open|projects.at_risk|cashflow.30d|
    // stockouts.count|production.oee|collection.overdue|...
    kpiLabel: text("kpi_label").notNull(),
    kpiCategory: varchar("kpi_category", { length: 50 }),
    // sales|operations|finance|inventory|hr|risk
    unit: varchar("unit", { length: 20 }),
    // currency|count|percent|days|hours
    // Current value
    currentValue: doublePrecision("current_value").notNull(),
    previousValue: doublePrecision("previous_value"),
    deltaValue: doublePrecision("delta_value"),
    deltaPercent: doublePrecision("delta_percent"),
    trend: varchar("trend", { length: 20 }),
    // up|down|flat|volatile
    // Targets & thresholds
    target: doublePrecision("target"),
    warningThreshold: doublePrecision("warning_threshold"),
    criticalThreshold: doublePrecision("critical_threshold"),
    status: varchar("status", { length: 20 }),
    // on_track|warning|critical|exceeding
    // History sparkline
    sparkline: jsonb("sparkline").$type<number[]>().default([]),
    // Meta
    lastComputedAt: timestamp("last_computed_at").notNull().defaultNow(),
    computeIntervalSec: integer("compute_interval_sec").default(60),
    metadata: jsonb("metadata").default({}),
  },
  (table) => [
    uniqueIndex("uq_live_kpi").on(table.tenantId, table.kpiKey),
    index("idx_live_kpi_category").on(table.kpiCategory),
    index("idx_live_kpi_status").on(table.status),
  ]
);

// ════════════════════════════════════════════════════════════════
// COMMAND CENTER WIDGETS — dashboard configuration
// ════════════════════════════════════════════════════════════════
export const commandWidgetsTable = pgTable(
  "command_widgets",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    widgetKey: varchar("widget_key", { length: 100 }).notNull(),
    widgetType: varchar("widget_type", { length: 50 }).notNull(),
    // kpi_card|mini_chart|entity_grid|alert_feed|heatmap|pulse|map
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    category: varchar("category", { length: 50 }),
    positionRow: integer("position_row").notNull().default(0),
    positionCol: integer("position_col").notNull().default(0),
    width: integer("width").notNull().default(4),
    height: integer("height").notNull().default(2),
    dataSource: varchar("data_source", { length: 100 }),
    // references kpiKey or a query name
    config: jsonb("config").default({}),
    refreshIntervalSec: integer("refresh_interval_sec").default(30),
    visibleRoles: jsonb("visible_roles").$type<string[]>().default([]),
    enabled: boolean("enabled").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_command_widget").on(table.tenantId, table.widgetKey),
    index("idx_command_widget_type").on(table.widgetType),
  ]
);

// ════════════════════════════════════════════════════════════════
// LIVE ALERTS — cross-system alerts tied to entities
// ════════════════════════════════════════════════════════════════
export const liveAlertsTable = pgTable(
  "live_alerts",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    alertKey: varchar("alert_key", { length: 200 }).notNull(),
    alertType: varchar("alert_type", { length: 60 }).notNull(),
    // stock_out|delayed|overdue|risk|threshold|anomaly|incident
    title: text("title").notNull(),
    message: text("message"),
    severity: varchar("severity", { length: 20 }).notNull(),
    module: varchar("module", { length: 50 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }),
    entityId: varchar("entity_id", { length: 120 }),
    // State
    status: varchar("status", { length: 20 }).notNull().default("open"),
    // open|acknowledged|snoozed|resolved|closed
    acknowledgedBy: integer("acknowledged_by"),
    acknowledgedAt: timestamp("acknowledged_at"),
    resolvedAt: timestamp("resolved_at"),
    snoozeUntil: timestamp("snooze_until"),
    // Actions
    suggestedActions: jsonb("suggested_actions").default([]),
    // Impact
    impactedEntities: jsonb("impacted_entities").default([]),
    financialImpact: doublePrecision("financial_impact"),
    // Time
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    occurrenceCount: integer("occurrence_count").default(1),
  },
  (table) => [
    uniqueIndex("uq_live_alert").on(table.tenantId, table.alertKey),
    index("idx_live_alert_status").on(table.status),
    index("idx_live_alert_severity").on(table.severity),
    index("idx_live_alert_module").on(table.module),
  ]
);

// ════════════════════════════════════════════════════════════════
// OPERATIONAL PULSE — per-minute roll-ups of entire company
// ════════════════════════════════════════════════════════════════
export const operationalPulseTable = pgTable(
  "operational_pulse",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    bucketAt: timestamp("bucket_at").notNull(),
    // 1-minute buckets
    eventsTotal: integer("events_total").notNull().default(0),
    eventsByModule: jsonb("events_by_module").default({}),
    eventsBySeverity: jsonb("events_by_severity").default({}),
    entitiesAtRisk: integer("entities_at_risk").default(0),
    entitiesActive: integer("entities_active").default(0),
    alertsOpen: integer("alerts_open").default(0),
    alertsCritical: integer("alerts_critical").default(0),
    // Module health scores 0-100
    moduleHealth: jsonb("module_health").default({}),
    // Overall company pulse 0-100
    overallHealth: doublePrecision("overall_health"),
  },
  (table) => [
    uniqueIndex("uq_pulse_bucket").on(table.tenantId, table.bucketAt),
    index("idx_pulse_time").on(table.bucketAt),
  ]
);

// ════════════════════════════════════════════════════════════════
// MODULE HEARTBEATS — liveness of each module
// ════════════════════════════════════════════════════════════════
export const moduleHeartbeatsTable = pgTable(
  "module_heartbeats",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id"),
    module: varchar("module", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("healthy"),
    // healthy|degraded|stalled|down
    lastEventAt: timestamp("last_event_at"),
    lastEventType: varchar("last_event_type", { length: 100 }),
    eventsPerMinute: doublePrecision("events_per_minute").default(0),
    openAlerts: integer("open_alerts").default(0),
    entitiesTracked: integer("entities_tracked").default(0),
    errorCount24h: integer("error_count_24h").default(0),
    metadata: jsonb("metadata").default({}),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_module_heartbeat").on(table.tenantId, table.module),
    index("idx_module_heartbeat_status").on(table.status),
  ]
);
