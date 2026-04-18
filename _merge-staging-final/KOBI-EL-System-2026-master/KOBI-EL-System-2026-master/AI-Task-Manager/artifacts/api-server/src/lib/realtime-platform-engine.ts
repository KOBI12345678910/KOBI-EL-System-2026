/**
 * BASH44 Real-Time Operational Intelligence Platform — Core Engine
 *
 * This is the HEARTBEAT of the system. It provides:
 *
 *   1. EventBus          — central publish/subscribe for ALL company events
 *   2. StateStore        — live current state of every entity across modules
 *   3. CausalEngine      — dependency graph + cascading impact propagation
 *   4. KPIEngine         — real-time KPI computation
 *   5. SnapshotEngine    — assembles the full company picture
 *   6. PulseEngine       — per-minute company heartbeat
 *   7. AlertEngine       — cross-module alerting tied to entities
 *
 * Principles:
 *   - NO silos. Every module publishes through one bus.
 *   - Every event updates entity state + propagates through causal graph.
 *   - Every significant change becomes an alert + KPI recompute trigger.
 *   - The Snapshot = the single source of truth of "what is happening now".
 */

import { EventEmitter } from "node:events";

// ════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════

export type Severity = "info" | "success" | "warning" | "critical" | "blocker";
export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type StatusColor = "green" | "yellow" | "orange" | "red" | "gray";
export type ModuleKey =
  | "crm" | "sales" | "quotes" | "orders" | "projects"
  | "procurement" | "suppliers" | "inventory" | "warehouse"
  | "production" | "qc" | "logistics" | "installations" | "service"
  | "billing" | "payments" | "cashflow" | "hr" | "docs"
  | "alerts" | "ai" | "external";

export interface UnifiedEvent {
  id?: number;
  tenantId?: number | null;
  eventType: string;
  eventKey?: string;
  sourceModule: ModuleKey;
  sourceUserId?: number | null;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  delta?: Record<string, unknown> | null;
  severity?: Severity;
  businessImpact?: "none" | "low" | "medium" | "high" | "critical";
  financialImpact?: number | null;
  causedByEventId?: number | null;
  correlationId?: string;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface EntityState {
  tenantId?: number | null;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  module: ModuleKey;
  currentStatus: string;
  statusColor?: StatusColor;
  state?: Record<string, unknown>;
  healthScore?: number;
  riskLevel?: RiskLevel;
  riskReasons?: string[];
  progress?: number;
  value?: number;
  linkedEntities?: Array<{ type: string; id: string; relation: string }>;
  upstreamCount?: number;
  downstreamCount?: number;
  lastEventType?: string;
  lastChangedAt?: Date;
  needsAttention?: boolean;
  isPinned?: boolean;
}

export interface CausalLink {
  fromEntityType: string;
  fromEntityId: string;
  toEntityType: string;
  toEntityId: string;
  linkType: string;
  strength?: number;
  propagationDelayMs?: number;
  description?: string;
}

export interface ImpactNode {
  depth: number;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  impactType: string;
  severity: Severity;
  delayMs?: number;
}

export interface LiveKpi {
  kpiKey: string;
  kpiLabel: string;
  kpiCategory?: string;
  unit?: string;
  currentValue: number;
  previousValue?: number;
  deltaValue?: number;
  deltaPercent?: number;
  trend?: "up" | "down" | "flat" | "volatile";
  target?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  status?: "on_track" | "warning" | "critical" | "exceeding";
  sparkline?: number[];
  lastComputedAt?: Date;
}

export interface LiveAlert {
  alertKey: string;
  alertType: string;
  title: string;
  message?: string;
  severity: Severity;
  module: ModuleKey;
  entityType?: string;
  entityId?: string;
  status?: "open" | "acknowledged" | "snoozed" | "resolved" | "closed";
  suggestedActions?: Array<{ action: string; label: string }>;
  impactedEntities?: Array<{ type: string; id: string }>;
  financialImpact?: number;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  occurrenceCount?: number;
}

export interface ModuleHeartbeat {
  module: ModuleKey;
  status: "healthy" | "degraded" | "stalled" | "down";
  lastEventAt?: Date;
  lastEventType?: string;
  eventsPerMinute?: number;
  openAlerts?: number;
  entitiesTracked?: number;
  errorCount24h?: number;
}

export interface CompanySnapshot {
  generatedAt: Date;
  overallHealth: number;
  modules: Record<ModuleKey, {
    health: number;
    status: string;
    entitiesTotal: number;
    entitiesAtRisk: number;
    recentEvents: number;
    openAlerts: number;
  }>;
  kpis: LiveKpi[];
  entitiesNeedingAttention: EntityState[];
  recentCriticalEvents: UnifiedEvent[];
  openCriticalAlerts: LiveAlert[];
  causalHotspots: Array<{
    entityType: string;
    entityId: string;
    entityLabel: string;
    downstreamCount: number;
    severity: Severity;
  }>;
  eventsPerMinute: number;
  entitiesChangedLast5Min: number;
  forwardView: {
    projectsAtRisk: number;
    stockoutsImminent: number;
    paymentsDueSoon: number;
    cashflowAlerts: number;
  };
}

// ════════════════════════════════════════════════════════════════
// IN-MEMORY STORE — for fast access without hitting DB on every event
// ════════════════════════════════════════════════════════════════

class InMemoryStore {
  // Unified events (bounded ring buffer)
  events: UnifiedEvent[] = [];
  maxEvents = 5000;

  // Entity states by key "tenant:type:id"
  entityStates = new Map<string, EntityState>();

  // Causal graph
  outgoingLinks = new Map<string, CausalLink[]>(); // from → []
  incomingLinks = new Map<string, CausalLink[]>(); // to → []

  // Live KPIs
  kpis = new Map<string, LiveKpi>();

  // Live alerts
  alerts = new Map<string, LiveAlert>();

  // Module heartbeats
  heartbeats = new Map<ModuleKey, ModuleHeartbeat>();

  // Impact chains recent
  impactChains: Array<{
    rootEventId: number;
    rootEntityType: string;
    rootEntityId: string;
    chain: ImpactNode[];
    totalImpacted: number;
    maxSeverity: Severity;
    computedAt: Date;
  }> = [];
  maxChains = 500;

  // Per-minute pulse
  pulseBuckets = new Map<number, {
    bucketAt: Date;
    eventsTotal: number;
    eventsByModule: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    entitiesAtRisk: number;
    entitiesActive: number;
    alertsOpen: number;
    alertsCritical: number;
    moduleHealth: Record<string, number>;
    overallHealth: number;
  }>();
  maxPulseBuckets = 1440; // 24h worth of 1-min buckets

  private nextEventId = 1;
  nextId() { return this.nextEventId++; }

  key(entityType: string, entityId: string, tenantId?: number | null) {
    return `${tenantId ?? 0}:${entityType}:${entityId}`;
  }
}

// ════════════════════════════════════════════════════════════════
// EVENT BUS — central pub/sub
// ════════════════════════════════════════════════════════════════

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(500);
  }

  publish(event: UnifiedEvent) {
    this.emit("event", event);
    this.emit(`event:${event.eventType}`, event);
    this.emit(`module:${event.sourceModule}`, event);
    if (event.severity && (event.severity === "critical" || event.severity === "blocker")) {
      this.emit("critical", event);
    }
  }

  subscribeAll(handler: (e: UnifiedEvent) => void) {
    this.on("event", handler);
    return () => this.off("event", handler);
  }

  subscribeType(eventType: string, handler: (e: UnifiedEvent) => void) {
    this.on(`event:${eventType}`, handler);
    return () => this.off(`event:${eventType}`, handler);
  }

  subscribeModule(module: ModuleKey, handler: (e: UnifiedEvent) => void) {
    this.on(`module:${module}`, handler);
    return () => this.off(`module:${module}`, handler);
  }

  subscribeCritical(handler: (e: UnifiedEvent) => void) {
    this.on("critical", handler);
    return () => this.off("critical", handler);
  }
}

// ════════════════════════════════════════════════════════════════
// CAUSAL ENGINE — dependency graph + propagation
// ════════════════════════════════════════════════════════════════

class CausalEngine {
  constructor(private store: InMemoryStore) {}

  addLink(link: CausalLink) {
    const fromKey = `${link.fromEntityType}:${link.fromEntityId}`;
    const toKey = `${link.toEntityType}:${link.toEntityId}`;
    const outgoing = this.store.outgoingLinks.get(fromKey) ?? [];
    outgoing.push(link);
    this.store.outgoingLinks.set(fromKey, outgoing);
    const incoming = this.store.incomingLinks.get(toKey) ?? [];
    incoming.push(link);
    this.store.incomingLinks.set(toKey, incoming);
  }

  /**
   * BFS downstream from a source entity, up to maxDepth.
   * Returns the cascading impact chain.
   */
  propagate(
    sourceType: string,
    sourceId: string,
    rootSeverity: Severity,
    maxDepth = 5
  ): ImpactNode[] {
    const visited = new Set<string>();
    const chain: ImpactNode[] = [];
    const queue: Array<{ type: string; id: string; depth: number; severity: Severity }> = [
      { type: sourceType, id: sourceId, depth: 0, severity: rootSeverity },
    ];
    visited.add(`${sourceType}:${sourceId}`);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      const fromKey = `${current.type}:${current.id}`;
      const outgoing = this.store.outgoingLinks.get(fromKey) ?? [];

      for (const link of outgoing) {
        const toKey = `${link.toEntityType}:${link.toEntityId}`;
        if (visited.has(toKey)) continue;
        visited.add(toKey);

        // Severity attenuates with distance and link strength
        const attenuatedSeverity = this.attenuateSeverity(
          current.severity,
          link.strength ?? 1,
          current.depth + 1
        );

        const targetState = this.store.entityStates.get(
          this.store.key(link.toEntityType, link.toEntityId)
        );

        chain.push({
          depth: current.depth + 1,
          entityType: link.toEntityType,
          entityId: link.toEntityId,
          entityLabel: targetState?.entityLabel,
          impactType: link.linkType,
          severity: attenuatedSeverity,
          delayMs: link.propagationDelayMs,
        });

        queue.push({
          type: link.toEntityType,
          id: link.toEntityId,
          depth: current.depth + 1,
          severity: attenuatedSeverity,
        });
      }
    }

    return chain;
  }

  /**
   * Trace upstream causes of an entity's current state.
   */
  traceCauses(
    targetType: string,
    targetId: string,
    maxDepth = 3
  ): Array<{ depth: number; entityType: string; entityId: string; linkType: string }> {
    const visited = new Set<string>();
    const result: Array<{ depth: number; entityType: string; entityId: string; linkType: string }> = [];
    const queue: Array<{ type: string; id: string; depth: number }> = [
      { type: targetType, id: targetId, depth: 0 },
    ];
    visited.add(`${targetType}:${targetId}`);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;
      const toKey = `${current.type}:${current.id}`;
      const incoming = this.store.incomingLinks.get(toKey) ?? [];
      for (const link of incoming) {
        const fromKey = `${link.fromEntityType}:${link.fromEntityId}`;
        if (visited.has(fromKey)) continue;
        visited.add(fromKey);
        result.push({
          depth: current.depth + 1,
          entityType: link.fromEntityType,
          entityId: link.fromEntityId,
          linkType: link.linkType,
        });
        queue.push({
          type: link.fromEntityType,
          id: link.fromEntityId,
          depth: current.depth + 1,
        });
      }
    }
    return result;
  }

  private attenuateSeverity(src: Severity, strength: number, depth: number): Severity {
    const rank: Record<Severity, number> = {
      info: 0, success: 0, warning: 1, critical: 2, blocker: 3,
    };
    const score = rank[src] * strength * Math.max(0.3, 1 - depth * 0.15);
    if (score >= 2.5) return "blocker";
    if (score >= 1.8) return "critical";
    if (score >= 0.8) return "warning";
    return "info";
  }

  getDownstreamCount(type: string, id: string): number {
    const fromKey = `${type}:${id}`;
    return (this.store.outgoingLinks.get(fromKey) ?? []).length;
  }

  getUpstreamCount(type: string, id: string): number {
    const toKey = `${type}:${id}`;
    return (this.store.incomingLinks.get(toKey) ?? []).length;
  }
}

// ════════════════════════════════════════════════════════════════
// STATE STORE — entity state management
// ════════════════════════════════════════════════════════════════

class StateStore {
  constructor(private store: InMemoryStore, private causal: CausalEngine) {}

  upsert(state: EntityState) {
    const key = this.store.key(state.entityType, state.entityId, state.tenantId);
    const existing = this.store.entityStates.get(key);
    const merged: EntityState = {
      ...existing,
      ...state,
      lastChangedAt: new Date(),
      upstreamCount: this.causal.getUpstreamCount(state.entityType, state.entityId),
      downstreamCount: this.causal.getDownstreamCount(state.entityType, state.entityId),
    };
    // Auto-compute status color from risk level
    if (!merged.statusColor) {
      merged.statusColor = this.inferColor(merged.riskLevel, merged.currentStatus);
    }
    // Auto-flag needs attention
    if (merged.riskLevel === "high" || merged.riskLevel === "critical") {
      merged.needsAttention = true;
    }
    this.store.entityStates.set(key, merged);
    return merged;
  }

  get(entityType: string, entityId: string, tenantId?: number | null): EntityState | undefined {
    return this.store.entityStates.get(this.store.key(entityType, entityId, tenantId));
  }

  all(): EntityState[] {
    return Array.from(this.store.entityStates.values());
  }

  byModule(module: ModuleKey): EntityState[] {
    return this.all().filter(s => s.module === module);
  }

  needingAttention(): EntityState[] {
    return this.all()
      .filter(s => s.needsAttention)
      .sort((a, b) => {
        const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
        return (rank[b.riskLevel ?? "none"] ?? 0) - (rank[a.riskLevel ?? "none"] ?? 0);
      });
  }

  changedSince(sinceMs: number): EntityState[] {
    const cutoff = Date.now() - sinceMs;
    return this.all().filter(s => (s.lastChangedAt?.getTime() ?? 0) >= cutoff);
  }

  private inferColor(risk?: RiskLevel, status?: string): StatusColor {
    if (risk === "critical") return "red";
    if (risk === "high") return "orange";
    if (risk === "medium") return "yellow";
    if (risk === "low") return "green";
    if (status === "completed" || status === "done" || status === "active") return "green";
    if (status === "blocked" || status === "failed") return "red";
    if (status === "delayed" || status === "at_risk") return "orange";
    return "gray";
  }
}

// ════════════════════════════════════════════════════════════════
// KPI ENGINE — live KPI computation
// ════════════════════════════════════════════════════════════════

class KpiEngine {
  constructor(private store: InMemoryStore) {}

  set(kpi: LiveKpi) {
    const existing = this.store.kpis.get(kpi.kpiKey);
    const delta = existing ? kpi.currentValue - existing.currentValue : 0;
    const deltaPercent = existing && existing.currentValue !== 0
      ? (delta / Math.abs(existing.currentValue)) * 100
      : 0;
    const sparkline = (existing?.sparkline ?? []).concat([kpi.currentValue]).slice(-30);
    const trend: LiveKpi["trend"] =
      Math.abs(deltaPercent) < 1 ? "flat"
      : delta > 0 ? "up"
      : "down";
    const status = this.computeStatus(kpi);
    const merged: LiveKpi = {
      ...existing,
      ...kpi,
      previousValue: existing?.currentValue,
      deltaValue: delta,
      deltaPercent,
      trend,
      status,
      sparkline,
      lastComputedAt: new Date(),
    };
    this.store.kpis.set(kpi.kpiKey, merged);
    return merged;
  }

  get(key: string): LiveKpi | undefined {
    return this.store.kpis.get(key);
  }

  all(): LiveKpi[] {
    return Array.from(this.store.kpis.values());
  }

  byCategory(category: string): LiveKpi[] {
    return this.all().filter(k => k.kpiCategory === category);
  }

  private computeStatus(kpi: LiveKpi): LiveKpi["status"] {
    if (kpi.criticalThreshold != null && kpi.currentValue >= kpi.criticalThreshold) return "critical";
    if (kpi.warningThreshold != null && kpi.currentValue >= kpi.warningThreshold) return "warning";
    if (kpi.target != null && kpi.currentValue >= kpi.target) return "exceeding";
    return "on_track";
  }
}

// ════════════════════════════════════════════════════════════════
// ALERT ENGINE — cross-module alert management
// ════════════════════════════════════════════════════════════════

class AlertEngine {
  constructor(private store: InMemoryStore) {}

  raise(alert: LiveAlert) {
    const existing = this.store.alerts.get(alert.alertKey);
    if (existing && existing.status === "open") {
      existing.lastSeenAt = new Date();
      existing.occurrenceCount = (existing.occurrenceCount ?? 1) + 1;
      this.store.alerts.set(alert.alertKey, existing);
      return existing;
    }
    const newAlert: LiveAlert = {
      ...alert,
      status: "open",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      occurrenceCount: 1,
    };
    this.store.alerts.set(alert.alertKey, newAlert);
    return newAlert;
  }

  acknowledge(alertKey: string, userId?: number) {
    const a = this.store.alerts.get(alertKey);
    if (a) { a.status = "acknowledged"; this.store.alerts.set(alertKey, a); }
    return a;
  }

  resolve(alertKey: string) {
    const a = this.store.alerts.get(alertKey);
    if (a) { a.status = "resolved"; this.store.alerts.set(alertKey, a); }
    return a;
  }

  open(): LiveAlert[] {
    return Array.from(this.store.alerts.values()).filter(a => a.status === "open");
  }

  critical(): LiveAlert[] {
    return this.open().filter(a => a.severity === "critical" || a.severity === "blocker");
  }

  byModule(module: ModuleKey): LiveAlert[] {
    return this.open().filter(a => a.module === module);
  }
}

// ════════════════════════════════════════════════════════════════
// PULSE ENGINE — per-minute company heartbeat
// ════════════════════════════════════════════════════════════════

class PulseEngine {
  constructor(
    private store: InMemoryStore,
    private state: StateStore,
    private alerts: AlertEngine,
  ) {}

  recordEvent(event: UnifiedEvent) {
    const bucketKey = this.bucketKey(new Date());
    const bucket = this.store.pulseBuckets.get(bucketKey) ?? this.emptyBucket(bucketKey);
    bucket.eventsTotal++;
    bucket.eventsByModule[event.sourceModule] = (bucket.eventsByModule[event.sourceModule] ?? 0) + 1;
    bucket.eventsBySeverity[event.severity ?? "info"] = (bucket.eventsBySeverity[event.severity ?? "info"] ?? 0) + 1;
    this.store.pulseBuckets.set(bucketKey, bucket);
    this.enforceLimit();
  }

  snapshot(): { bucketAt: Date; overallHealth: number; eventsTotal: number; entitiesAtRisk: number; alertsOpen: number; moduleHealth: Record<string, number> } {
    const bucketKey = this.bucketKey(new Date());
    const bucket = this.store.pulseBuckets.get(bucketKey) ?? this.emptyBucket(bucketKey);
    const entitiesAtRisk = this.state.all().filter(s =>
      s.riskLevel === "high" || s.riskLevel === "critical"
    ).length;
    const alertsOpen = this.alerts.open().length;
    const moduleHealth = this.computeModuleHealth();
    const overallHealth = this.computeOverallHealth(moduleHealth, entitiesAtRisk, alertsOpen);
    bucket.entitiesAtRisk = entitiesAtRisk;
    bucket.entitiesActive = this.state.all().length;
    bucket.alertsOpen = alertsOpen;
    bucket.alertsCritical = this.alerts.critical().length;
    bucket.moduleHealth = moduleHealth;
    bucket.overallHealth = overallHealth;
    this.store.pulseBuckets.set(bucketKey, bucket);
    return {
      bucketAt: bucket.bucketAt,
      overallHealth,
      eventsTotal: bucket.eventsTotal,
      entitiesAtRisk,
      alertsOpen,
      moduleHealth,
    };
  }

  history(minutes = 60): Array<{ bucketAt: Date; eventsTotal: number; overallHealth: number; entitiesAtRisk: number; alertsCritical: number }> {
    const now = Date.now();
    const cutoff = now - minutes * 60_000;
    return Array.from(this.store.pulseBuckets.values())
      .filter(b => b.bucketAt.getTime() >= cutoff)
      .sort((a, b) => a.bucketAt.getTime() - b.bucketAt.getTime())
      .map(b => ({
        bucketAt: b.bucketAt,
        eventsTotal: b.eventsTotal,
        overallHealth: b.overallHealth,
        entitiesAtRisk: b.entitiesAtRisk,
        alertsCritical: b.alertsCritical,
      }));
  }

  private computeModuleHealth(): Record<string, number> {
    const modules: ModuleKey[] = [
      "crm", "sales", "quotes", "orders", "projects", "procurement",
      "suppliers", "inventory", "warehouse", "production", "qc",
      "logistics", "installations", "service", "billing", "payments",
      "cashflow", "hr", "docs", "alerts", "ai",
    ];
    const out: Record<string, number> = {};
    for (const m of modules) {
      const entities = this.state.byModule(m);
      if (entities.length === 0) { out[m] = 100; continue; }
      const atRisk = entities.filter(e => e.riskLevel === "high" || e.riskLevel === "critical").length;
      const openAlerts = this.alerts.byModule(m).length;
      const risk = (atRisk / entities.length) * 100;
      const alertPenalty = Math.min(40, openAlerts * 5);
      out[m] = Math.max(0, Math.min(100, 100 - risk - alertPenalty));
    }
    return out;
  }

  private computeOverallHealth(moduleHealth: Record<string, number>, entitiesAtRisk: number, alertsOpen: number): number {
    const values = Object.values(moduleHealth);
    if (values.length === 0) return 100;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const riskPenalty = Math.min(20, entitiesAtRisk * 0.5);
    const alertPenalty = Math.min(20, alertsOpen * 0.7);
    return Math.max(0, Math.min(100, avg - riskPenalty - alertPenalty));
  }

  private bucketKey(d: Date): number {
    return Math.floor(d.getTime() / 60_000);
  }

  private emptyBucket(bucketKey: number) {
    return {
      bucketAt: new Date(bucketKey * 60_000),
      eventsTotal: 0,
      eventsByModule: {},
      eventsBySeverity: {},
      entitiesAtRisk: 0,
      entitiesActive: 0,
      alertsOpen: 0,
      alertsCritical: 0,
      moduleHealth: {},
      overallHealth: 100,
    };
  }

  private enforceLimit() {
    if (this.store.pulseBuckets.size <= this.store.maxPulseBuckets) return;
    const keys = Array.from(this.store.pulseBuckets.keys()).sort((a, b) => a - b);
    const toRemove = keys.slice(0, keys.length - this.store.maxPulseBuckets);
    for (const k of toRemove) this.store.pulseBuckets.delete(k);
  }
}

// ════════════════════════════════════════════════════════════════
// SNAPSHOT ENGINE — the full live company picture
// ════════════════════════════════════════════════════════════════

class SnapshotEngine {
  constructor(
    private store: InMemoryStore,
    private state: StateStore,
    private kpis: KpiEngine,
    private alerts: AlertEngine,
    private pulse: PulseEngine,
  ) {}

  getCompanySnapshot(): CompanySnapshot {
    const now = new Date();
    const pulseSnap = this.pulse.snapshot();
    const modules: ModuleKey[] = [
      "crm", "sales", "quotes", "orders", "projects", "procurement",
      "suppliers", "inventory", "warehouse", "production", "qc",
      "logistics", "installations", "service", "billing", "payments",
      "cashflow", "hr", "docs", "alerts", "ai", "external",
    ];
    const moduleData: CompanySnapshot["modules"] = {} as any;
    for (const m of modules) {
      const entities = this.state.byModule(m);
      const atRisk = entities.filter(e => e.riskLevel === "high" || e.riskLevel === "critical").length;
      const moduleEvents = this.store.events.filter(e =>
        e.sourceModule === m &&
        (e.occurredAt?.getTime() ?? 0) >= now.getTime() - 5 * 60_000
      );
      moduleData[m] = {
        health: pulseSnap.moduleHealth[m] ?? 100,
        status: atRisk > 0 ? "attention" : entities.length > 0 ? "active" : "idle",
        entitiesTotal: entities.length,
        entitiesAtRisk: atRisk,
        recentEvents: moduleEvents.length,
        openAlerts: this.alerts.byModule(m).length,
      };
    }

    // Causal hotspots — entities with many downstream dependencies that are at risk
    const causalHotspots = this.state.all()
      .filter(s => (s.downstreamCount ?? 0) >= 2 && (s.riskLevel === "high" || s.riskLevel === "critical"))
      .sort((a, b) => (b.downstreamCount ?? 0) - (a.downstreamCount ?? 0))
      .slice(0, 10)
      .map(s => ({
        entityType: s.entityType,
        entityId: s.entityId,
        entityLabel: s.entityLabel ?? s.entityId,
        downstreamCount: s.downstreamCount ?? 0,
        severity: (s.riskLevel === "critical" ? "critical" : "warning") as Severity,
      }));

    // Forward view — predictive counts
    const forwardView = {
      projectsAtRisk: this.state.byModule("projects").filter(e => e.riskLevel === "high" || e.riskLevel === "critical").length,
      stockoutsImminent: this.state.byModule("inventory").filter(e => e.currentStatus === "low" || e.currentStatus === "critical").length,
      paymentsDueSoon: this.state.byModule("payments").filter(e => e.currentStatus === "due_soon" || e.currentStatus === "overdue").length,
      cashflowAlerts: this.alerts.byModule("cashflow").length,
    };

    return {
      generatedAt: now,
      overallHealth: pulseSnap.overallHealth,
      modules: moduleData,
      kpis: this.kpis.all(),
      entitiesNeedingAttention: this.state.needingAttention().slice(0, 50),
      recentCriticalEvents: this.store.events
        .filter(e => e.severity === "critical" || e.severity === "blocker")
        .slice(-20)
        .reverse(),
      openCriticalAlerts: this.alerts.critical(),
      causalHotspots,
      eventsPerMinute: pulseSnap.eventsTotal,
      entitiesChangedLast5Min: this.state.changedSince(5 * 60_000).length,
      forwardView,
    };
  }
}

// ════════════════════════════════════════════════════════════════
// REALTIME PLATFORM — the orchestrator
// ════════════════════════════════════════════════════════════════

export class RealtimePlatform {
  private store = new InMemoryStore();
  private bus = new EventBus();
  private causal = new CausalEngine(this.store);
  private state = new StateStore(this.store, this.causal);
  private kpis = new KpiEngine(this.store);
  private alerts = new AlertEngine(this.store);
  private pulse = new PulseEngine(this.store, this.state, this.alerts);
  private snapshot = new SnapshotEngine(this.store, this.state, this.kpis, this.alerts, this.pulse);

  constructor() {
    // Auto-wire: every published event updates state + records pulse
    this.bus.subscribeAll((event) => {
      this.handleEvent(event);
    });
  }

  // ─── Event publishing ─────────────────────────────────────────
  publish(event: Omit<UnifiedEvent, "id" | "occurredAt"> & { occurredAt?: Date }): UnifiedEvent {
    const enriched: UnifiedEvent = {
      ...event,
      id: this.store.nextId(),
      occurredAt: event.occurredAt ?? new Date(),
      severity: event.severity ?? "info",
    };
    this.store.events.push(enriched);
    if (this.store.events.length > this.store.maxEvents) {
      this.store.events.shift();
    }
    this.bus.publish(enriched);
    return enriched;
  }

  private handleEvent(event: UnifiedEvent) {
    // 1. Update module heartbeat
    const hb: ModuleHeartbeat = this.store.heartbeats.get(event.sourceModule) ?? {
      module: event.sourceModule,
      status: "healthy",
      entitiesTracked: 0,
      openAlerts: 0,
      errorCount24h: 0,
    };
    hb.lastEventAt = event.occurredAt;
    hb.lastEventType = event.eventType;
    this.store.heartbeats.set(event.sourceModule, hb);

    // 2. Auto-upsert entity state from event newState if present
    if (event.newState) {
      const currentStatus = (event.newState["status"] as string) ?? "active";
      const riskLevel = (event.newState["riskLevel"] as RiskLevel) ?? this.severityToRisk(event.severity);
      this.state.upsert({
        tenantId: event.tenantId,
        entityType: event.entityType,
        entityId: event.entityId,
        entityLabel: event.entityLabel ?? (event.newState["label"] as string) ?? event.entityId,
        module: event.sourceModule,
        currentStatus,
        state: event.newState,
        riskLevel,
        riskReasons: (event.newState["riskReasons"] as string[]) ?? [],
        progress: event.newState["progress"] as number | undefined,
        value: event.newState["value"] as number | undefined,
        lastEventType: event.eventType,
      });
    }

    // 3. Record in pulse
    this.pulse.recordEvent(event);

    // 4. Auto-raise alert for critical events
    if (event.severity === "critical" || event.severity === "blocker") {
      this.alerts.raise({
        alertKey: `auto:${event.eventType}:${event.entityType}:${event.entityId}`,
        alertType: event.eventType,
        title: `${event.eventType.replace(/\./g, " → ")}`,
        message: `${event.entityLabel ?? event.entityId} — ${event.severity}`,
        severity: event.severity,
        module: event.sourceModule,
        entityType: event.entityType,
        entityId: event.entityId,
        financialImpact: event.financialImpact ?? undefined,
      });
    }

    // 5. Propagate through causal graph and store impact chain
    if (event.severity === "critical" || event.severity === "warning" || event.severity === "blocker") {
      const chain = this.causal.propagate(
        event.entityType,
        event.entityId,
        event.severity,
        5
      );
      if (chain.length > 0) {
        this.store.impactChains.push({
          rootEventId: event.id!,
          rootEntityType: event.entityType,
          rootEntityId: event.entityId,
          chain,
          totalImpacted: chain.length,
          maxSeverity: this.maxSeverity(chain),
          computedAt: new Date(),
        });
        if (this.store.impactChains.length > this.store.maxChains) {
          this.store.impactChains.shift();
        }
        // Flag downstream entities as needing attention
        for (const node of chain) {
          const existing = this.state.get(node.entityType, node.entityId, event.tenantId);
          if (existing) {
            this.state.upsert({
              ...existing,
              needsAttention: true,
              riskReasons: [...(existing.riskReasons ?? []), `caused by ${event.entityType}:${event.entityId}`].slice(-5),
            });
          }
        }
      }
    }
  }

  private severityToRisk(sev?: Severity): RiskLevel {
    switch (sev) {
      case "blocker": return "critical";
      case "critical": return "critical";
      case "warning": return "medium";
      case "info":
      case "success":
      default: return "low";
    }
  }

  private maxSeverity(chain: ImpactNode[]): Severity {
    const rank: Record<Severity, number> = { info: 0, success: 0, warning: 1, critical: 2, blocker: 3 };
    let max: Severity = "info";
    for (const n of chain) {
      if (rank[n.severity] > rank[max]) max = n.severity;
    }
    return max;
  }

  // ─── Public accessors ─────────────────────────────────────────
  get Events() {
    return {
      recent: (limit = 50) => this.store.events.slice(-limit).reverse(),
      byModule: (module: ModuleKey, limit = 50) =>
        this.store.events.filter(e => e.sourceModule === module).slice(-limit).reverse(),
      byType: (type: string, limit = 50) =>
        this.store.events.filter(e => e.eventType === type).slice(-limit).reverse(),
      critical: (limit = 50) =>
        this.store.events.filter(e => e.severity === "critical" || e.severity === "blocker").slice(-limit).reverse(),
      forEntity: (entityType: string, entityId: string) =>
        this.store.events.filter(e => e.entityType === entityType && e.entityId === entityId),
    };
  }

  get State() {
    return {
      get: (type: string, id: string, tenantId?: number) => this.state.get(type, id, tenantId),
      byModule: (m: ModuleKey) => this.state.byModule(m),
      needingAttention: () => this.state.needingAttention(),
      changedSince: (ms: number) => this.state.changedSince(ms),
      all: () => this.state.all(),
      upsert: (s: EntityState) => this.state.upsert(s),
    };
  }

  get Causal() {
    return {
      addLink: (link: CausalLink) => this.causal.addLink(link),
      propagate: (type: string, id: string, sev: Severity, depth?: number) =>
        this.causal.propagate(type, id, sev, depth),
      traceCauses: (type: string, id: string, depth?: number) =>
        this.causal.traceCauses(type, id, depth),
      recentImpactChains: (limit = 20) => this.store.impactChains.slice(-limit).reverse(),
    };
  }

  get KPIs() {
    return {
      set: (kpi: LiveKpi) => this.kpis.set(kpi),
      get: (key: string) => this.kpis.get(key),
      all: () => this.kpis.all(),
      byCategory: (c: string) => this.kpis.byCategory(c),
    };
  }

  get Alerts() {
    return {
      raise: (a: LiveAlert) => this.alerts.raise(a),
      acknowledge: (key: string, userId?: number) => this.alerts.acknowledge(key, userId),
      resolve: (key: string) => this.alerts.resolve(key),
      open: () => this.alerts.open(),
      critical: () => this.alerts.critical(),
      byModule: (m: ModuleKey) => this.alerts.byModule(m),
    };
  }

  get Pulse() {
    return {
      snapshot: () => this.pulse.snapshot(),
      history: (minutes = 60) => this.pulse.history(minutes),
    };
  }

  get Snapshot() {
    return {
      company: () => this.snapshot.getCompanySnapshot(),
    };
  }

  get Bus() {
    return {
      subscribeAll: (h: (e: UnifiedEvent) => void) => this.bus.subscribeAll(h),
      subscribeType: (t: string, h: (e: UnifiedEvent) => void) => this.bus.subscribeType(t, h),
      subscribeModule: (m: ModuleKey, h: (e: UnifiedEvent) => void) => this.bus.subscribeModule(m, h),
      subscribeCritical: (h: (e: UnifiedEvent) => void) => this.bus.subscribeCritical(h),
    };
  }

  get Heartbeats() {
    return {
      all: () => Array.from(this.store.heartbeats.values()),
      get: (m: ModuleKey) => this.store.heartbeats.get(m),
    };
  }
}

// ════════════════════════════════════════════════════════════════
// SINGLETON — the global real-time platform instance
// ════════════════════════════════════════════════════════════════
export const realtimePlatform = new RealtimePlatform();
