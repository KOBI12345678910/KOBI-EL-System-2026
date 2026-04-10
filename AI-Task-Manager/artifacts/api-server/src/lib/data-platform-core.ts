/**
 * BASH44 Data Platform Core — Production-Grade Ingestion Orchestrator
 *
 * This is the upgrade of the user's Python reference architecture to
 * enterprise-grade TypeScript. It provides the canonical end-to-end
 * flow of record processing:
 *
 *   raw → validate → normalize → map → resolve → hydrate → emit event → update state
 *
 * Every step is explicit, observable, and composable.
 *
 * Components:
 *   - TypeRegistry      — types and interfaces
 *   - SchemaRegistry    — versioned schemas with evolution policy
 *   - DataQualityEngine — rules + validation
 *   - CanonicalMapper   — source → canonical transforms
 *   - IdentityResolver  — match/merge logic
 *   - RawStore          — append-only raw log
 *   - CuratedStore      — canonical entities
 *   - EventStore        — domain event log
 *   - QuarantineStore   — quarantined records with issues
 *   - LineageStore      — full provenance
 *   - StateStore        — live entity state (bridges to realtime platform)
 *   - OntologyStore     — ontology object hydration
 *   - EventBus          — pub/sub dispatcher
 *   - StateEngine       — event → state transition rules
 *   - ObservabilityStore — pipeline metrics
 *   - IngestionOrchestrator — end-to-end processor
 *   - LiveCompanySnapshot — unified snapshot builder
 *   - AIContextBuilder  — Claude-ready enterprise context
 *   - TenantIsolation   — multi-tenant boundaries
 */

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { realtimePlatform } from "./realtime-platform-engine";

// ════════════════════════════════════════════════════════════════
// CORE TYPES
// ════════════════════════════════════════════════════════════════

export type Severity = "info" | "warning" | "high" | "critical";
export type FreshnessStatus = "fresh" | "stale" | "unknown";
export type IngestionMode = "batch" | "incremental" | "cdc" | "stream" | "webhook" | "file_drop";
export type RecordDisposition = "accepted" | "rejected" | "quarantined";

export interface SourceDescriptor {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  ingestionMode: IngestionMode;
  owner: string;
  freshnessSlaSeconds: number;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface SchemaField {
  name: string;
  fieldType: string;
  nullable: boolean;
  description?: string;
  semanticType?: string;
}

export interface SchemaDefinition {
  schemaId: string;
  name: string;
  version: string;
  fields: SchemaField[];
  primaryKey?: string;
  compatibilityMode?: "backward" | "forward" | "full" | "none";
}

export interface RawRecord {
  recordId: string;
  tenantId: string;
  sourceId: string;
  sourceRecordId: string;
  schemaName: string;
  schemaVersion: string;
  payload: Record<string, unknown>;
  ingestedAt: Date;
  batchId?: string;
  correlationId?: string;
  sourceTimestamp?: Date;
  externalKeys?: Record<string, string>;
}

export interface CanonicalRecord {
  canonicalId: string;
  entityType: string;
  tenantId: string;
  sourceLinks: Array<{
    sourceId: string;
    sourceRecordId: string;
    sourceLabel?: string;
    matchScore?: number;
  }>;
  properties: Record<string, unknown>;
  updatedAt: Date;
  confidence: number;
}

export interface DomainEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  canonicalEntityId: string;
  entityType: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  sourceId?: string;
  sourceRecordId?: string;
  actor?: string;
  correlationId?: string;
  causationId?: string;
  severity: Severity;
  schemaVersion: string;
}

export interface QualityIssue {
  issueId: string;
  sourceId: string;
  tenantId: string;
  ruleName: string;
  severity: Severity;
  message: string;
  recordId?: string;
  field?: string;
  expectedValue?: string;
  actualValue?: string;
  createdAt: Date;
}

export interface ValidationResult {
  disposition: RecordDisposition;
  issues: QualityIssue[];
}

export interface LineageRecord {
  lineageId: string;
  tenantId: string;
  sourceId: string;
  rawRecordId?: string;
  canonicalId?: string;
  pipelineName: string;
  transformationStep: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface EntityStateRecord {
  canonicalId: string;
  entityType: string;
  tenantId: string;
  currentStatus: string;
  currentOwner?: string;
  workflowStep?: string;
  blockers: string[];
  dependencies: string[];
  riskScore: number;
  slaStatus?: string;
  financialExposure?: number;
  freshnessStatus: FreshnessStatus;
  lastEventAt?: Date;
  lastUpdatedAt: Date;
  properties: Record<string, unknown>;
}

export interface OntologyObject {
  objectId: string;
  tenantId: string;
  objectType: string;
  properties: Record<string, unknown>;
  relationships: Record<string, string[]>;
  state?: string;
  updatedAt: Date;
}

export interface PipelineMetrics {
  pipelineName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  acceptedRecords: number;
  quarantinedRecords: number;
  rejectedRecords: number;
  emittedEvents: number;
  avgDurationMs?: number;
  p95DurationMs?: number;
  lastRunAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastError?: string;
  healthScore: number;
}

// ════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function utcNow(): Date {
  return new Date();
}

// ════════════════════════════════════════════════════════════════
// STORES — in-memory implementation (swappable with Postgres)
// ════════════════════════════════════════════════════════════════

class RawStore {
  private records = new Map<string, RawRecord>();
  private maxRecords = 10_000;

  put(record: RawRecord): void {
    this.records.set(record.recordId, record);
    if (this.records.size > this.maxRecords) {
      const firstKey = this.records.keys().next().value;
      if (firstKey) this.records.delete(firstKey);
    }
  }

  get(recordId: string): RawRecord | undefined {
    return this.records.get(recordId);
  }

  recent(limit = 100): RawRecord[] {
    return Array.from(this.records.values()).slice(-limit).reverse();
  }

  count(): number {
    return this.records.size;
  }

  bySource(sourceId: string, limit = 100): RawRecord[] {
    return this.recent(1000).filter(r => r.sourceId === sourceId).slice(0, limit);
  }
}

class QuarantineStore {
  private records = new Map<string, { raw: RawRecord; issues: QualityIssue[]; storedAt: Date; status: string }>();
  private maxRecords = 2_000;

  put(raw: RawRecord, issues: QualityIssue[]): void {
    this.records.set(raw.recordId, {
      raw,
      issues,
      storedAt: utcNow(),
      status: "quarantined",
    });
    if (this.records.size > this.maxRecords) {
      const firstKey = this.records.keys().next().value;
      if (firstKey) this.records.delete(firstKey);
    }
  }

  recent(limit = 100): Array<{ raw: RawRecord; issues: QualityIssue[]; storedAt: Date; status: string }> {
    return Array.from(this.records.values()).slice(-limit).reverse();
  }

  count(): number {
    return this.records.size;
  }

  countByStatus(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of this.records.values()) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }

  release(recordId: string): boolean {
    const r = this.records.get(recordId);
    if (r) { r.status = "released"; return true; }
    return false;
  }

  discard(recordId: string): boolean {
    const r = this.records.get(recordId);
    if (r) { r.status = "discarded"; return true; }
    return false;
  }
}

class CanonicalStore {
  private records = new Map<string, CanonicalRecord>();

  upsert(record: CanonicalRecord): CanonicalRecord {
    const existing = this.records.get(record.canonicalId);
    if (existing) {
      // Merge properties and source links
      existing.properties = { ...existing.properties, ...record.properties };
      existing.sourceLinks = [...existing.sourceLinks, ...record.sourceLinks];
      existing.updatedAt = utcNow();
      existing.confidence = Math.max(existing.confidence, record.confidence);
      this.records.set(record.canonicalId, existing);
      return existing;
    }
    this.records.set(record.canonicalId, record);
    return record;
  }

  get(canonicalId: string): CanonicalRecord | undefined {
    return this.records.get(canonicalId);
  }

  all(): CanonicalRecord[] {
    return Array.from(this.records.values());
  }

  byType(entityType: string): CanonicalRecord[] {
    return this.all().filter(r => r.entityType === entityType);
  }

  findByExternalKey(key: string): CanonicalRecord | undefined {
    for (const record of this.records.values()) {
      if ((record.properties["canonical_external_key"] as string) === key) return record;
    }
    return undefined;
  }

  count(): number {
    return this.records.size;
  }
}

class EventStore {
  private events: DomainEvent[] = [];
  private maxEvents = 20_000;
  private sequenceNumber = 0;

  append(event: DomainEvent): void {
    this.sequenceNumber++;
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
  }

  recentForEntity(canonicalId: string, limit = 20): DomainEvent[] {
    return this.events
      .filter(e => e.canonicalEntityId === canonicalId)
      .slice(-limit)
      .reverse();
  }

  recentByType(eventType: string, limit = 50): DomainEvent[] {
    return this.events.filter(e => e.eventType === eventType).slice(-limit).reverse();
  }

  byCorrelation(correlationId: string): DomainEvent[] {
    return this.events.filter(e => e.correlationId === correlationId);
  }

  recent(limit = 100): DomainEvent[] {
    return this.events.slice(-limit).reverse();
  }

  count(): number {
    return this.events.length;
  }

  // Replay events for an entity — time-travel
  replay(canonicalId: string, fromTime?: Date, toTime?: Date): DomainEvent[] {
    return this.events
      .filter(e => e.canonicalEntityId === canonicalId)
      .filter(e => !fromTime || e.timestamp >= fromTime)
      .filter(e => !toTime || e.timestamp <= toTime)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

class LineageStore {
  private records: LineageRecord[] = [];
  private maxRecords = 20_000;

  append(record: LineageRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxRecords) this.records.shift();
  }

  forCanonical(canonicalId: string): LineageRecord[] {
    return this.records.filter(r => r.canonicalId === canonicalId);
  }

  forPipeline(pipelineName: string, limit = 100): LineageRecord[] {
    return this.records.filter(r => r.pipelineName === pipelineName).slice(-limit).reverse();
  }

  recent(limit = 200): LineageRecord[] {
    return this.records.slice(-limit).reverse();
  }

  count(): number {
    return this.records.length;
  }
}

class CoreStateStore {
  private states = new Map<string, EntityStateRecord>();

  upsert(state: EntityStateRecord): void {
    this.states.set(state.canonicalId, state);
  }

  get(canonicalId: string): EntityStateRecord | undefined {
    return this.states.get(canonicalId);
  }

  all(): EntityStateRecord[] {
    return Array.from(this.states.values());
  }

  byType(entityType: string): EntityStateRecord[] {
    return this.all().filter(s => s.entityType === entityType);
  }

  atRisk(): EntityStateRecord[] {
    return this.all().filter(s => s.riskScore >= 0.6 || s.currentStatus === "at_risk" || s.currentStatus === "blocked");
  }

  count(): number {
    return this.states.size;
  }
}

class OntologyStore {
  private objects = new Map<string, OntologyObject>();

  upsertFromCanonical(record: CanonicalRecord): OntologyObject {
    const existing = this.objects.get(record.canonicalId);
    if (existing) {
      existing.properties = { ...existing.properties, ...record.properties };
      existing.updatedAt = utcNow();
      return existing;
    }
    const obj: OntologyObject = {
      objectId: record.canonicalId,
      tenantId: record.tenantId,
      objectType: record.entityType,
      properties: { ...record.properties },
      relationships: {},
      updatedAt: utcNow(),
    };
    this.objects.set(record.canonicalId, obj);
    return obj;
  }

  addRelationship(fromId: string, relation: string, toId: string): void {
    const obj = this.objects.get(fromId);
    if (!obj) return;
    if (!obj.relationships[relation]) obj.relationships[relation] = [];
    if (!obj.relationships[relation]!.includes(toId)) {
      obj.relationships[relation]!.push(toId);
    }
    obj.updatedAt = utcNow();
  }

  setState(objectId: string, state: string): void {
    const obj = this.objects.get(objectId);
    if (obj) {
      obj.state = state;
      obj.updatedAt = utcNow();
    }
  }

  get(objectId: string): OntologyObject | undefined {
    return this.objects.get(objectId);
  }

  byType(objectType: string): OntologyObject[] {
    return Array.from(this.objects.values()).filter(o => o.objectType === objectType);
  }

  all(): OntologyObject[] {
    return Array.from(this.objects.values());
  }

  count(): number {
    return this.objects.size;
  }
}

// ════════════════════════════════════════════════════════════════
// SCHEMA REGISTRY
// ════════════════════════════════════════════════════════════════

export class SchemaRegistry {
  private schemas = new Map<string, SchemaDefinition>();

  private key(name: string, version: string) {
    return `${name}:${version}`;
  }

  register(schema: SchemaDefinition): void {
    this.schemas.set(this.key(schema.name, schema.version), schema);
  }

  get(name: string, version: string): SchemaDefinition | undefined {
    return this.schemas.get(this.key(name, version));
  }

  all(): SchemaDefinition[] {
    return Array.from(this.schemas.values());
  }

  versionsOf(name: string): SchemaDefinition[] {
    return this.all().filter(s => s.name === name);
  }

  // Check if newVersion is compatible with oldVersion under backward compatibility
  isBackwardCompatible(oldSchema: SchemaDefinition, newSchema: SchemaDefinition): boolean {
    // Every non-nullable field in old must still exist in new (as nullable or not)
    for (const oldField of oldSchema.fields) {
      if (!oldField.nullable) {
        const found = newSchema.fields.find(f => f.name === oldField.name);
        if (!found) return false;
        if (found.fieldType !== oldField.fieldType) return false;
      }
    }
    return true;
  }
}

// ════════════════════════════════════════════════════════════════
// DATA QUALITY ENGINE
// ════════════════════════════════════════════════════════════════

export class DataQualityEngine {
  validate(raw: RawRecord, schema: SchemaDefinition | undefined): ValidationResult {
    const issues: QualityIssue[] = [];

    if (!schema) {
      issues.push({
        issueId: newId("q"),
        sourceId: raw.sourceId,
        tenantId: raw.tenantId,
        ruleName: "schema_exists",
        severity: "critical",
        message: `Missing schema definition for ${raw.schemaName}:${raw.schemaVersion}`,
        recordId: raw.recordId,
        createdAt: utcNow(),
      });
      return { disposition: "quarantined", issues };
    }

    // Required field check
    for (const field of schema.fields) {
      if (!field.nullable && !(field.name in raw.payload)) {
        issues.push({
          issueId: newId("q"),
          sourceId: raw.sourceId,
          tenantId: raw.tenantId,
          ruleName: `required_field_${field.name}`,
          severity: "high",
          message: `Missing required field: ${field.name}`,
          recordId: raw.recordId,
          field: field.name,
          createdAt: utcNow(),
        });
      }
    }

    // Type validation (basic)
    for (const field of schema.fields) {
      const value = raw.payload[field.name];
      if (value === undefined || value === null) continue;
      if (field.fieldType === "string" && typeof value !== "string") {
        issues.push({
          issueId: newId("q"),
          sourceId: raw.sourceId,
          tenantId: raw.tenantId,
          ruleName: `type_${field.name}`,
          severity: "warning",
          message: `Field ${field.name} expected string, got ${typeof value}`,
          recordId: raw.recordId,
          field: field.name,
          actualValue: String(value),
          createdAt: utcNow(),
        });
      } else if (field.fieldType === "number" && typeof value !== "number") {
        const parsed = Number(value);
        if (Number.isNaN(parsed)) {
          issues.push({
            issueId: newId("q"),
            sourceId: raw.sourceId,
            tenantId: raw.tenantId,
            ruleName: `type_${field.name}`,
            severity: "warning",
            message: `Field ${field.name} expected number`,
            recordId: raw.recordId,
            field: field.name,
            actualValue: String(value),
            createdAt: utcNow(),
          });
        }
      }
    }

    // Determine disposition by severity
    const criticalOrHigh = issues.some(i => i.severity === "critical" || i.severity === "high");
    if (criticalOrHigh) return { disposition: "quarantined", issues };
    return { disposition: "accepted", issues };
  }
}

// ════════════════════════════════════════════════════════════════
// CANONICAL MAPPER
// ════════════════════════════════════════════════════════════════

export interface CanonicalMapper {
  canHandle(raw: RawRecord): boolean;
  map(raw: RawRecord): CanonicalRecord;
}

export class GenericCanonicalMapper implements CanonicalMapper {
  canHandle(_raw: RawRecord): boolean {
    return true;
  }

  map(raw: RawRecord): CanonicalRecord {
    const entityType = (raw.payload["entity_type"] as string) ?? "UnknownEntity";
    const externalKey = raw.payload["canonical_external_key"] as string | undefined;
    const canonicalId = externalKey ? `${entityType}:${externalKey}` : newId("entity");

    const properties = { ...raw.payload };
    properties["__raw_schema"] = `${raw.schemaName}:${raw.schemaVersion}`;
    properties["__ingested_at"] = raw.ingestedAt.toISOString();

    return {
      canonicalId,
      entityType,
      tenantId: raw.tenantId,
      sourceLinks: [{
        sourceId: raw.sourceId,
        sourceRecordId: raw.sourceRecordId,
      }],
      properties,
      updatedAt: utcNow(),
      confidence: 1.0,
    };
  }
}

// ════════════════════════════════════════════════════════════════
// IDENTITY RESOLVER
// ════════════════════════════════════════════════════════════════

export class CoreIdentityResolver {
  constructor(private store: CanonicalStore) {}

  resolve(record: CanonicalRecord): CanonicalRecord {
    // 1. Try to find by canonical_external_key
    const extKey = record.properties["canonical_external_key"] as string | undefined;
    if (extKey) {
      const existing = this.store.findByExternalKey(extKey);
      if (existing && existing.entityType === record.entityType) {
        return this.mergeRecords(existing, record);
      }
    }

    // 2. Try to find by email (for people/customers)
    const email = (record.properties["email"] as string | undefined)?.toLowerCase().trim();
    if (email && (record.entityType === "Customer" || record.entityType === "Contact" || record.entityType === "Employee")) {
      for (const candidate of this.store.all()) {
        if (candidate.entityType === record.entityType) {
          const candEmail = (candidate.properties["email"] as string | undefined)?.toLowerCase().trim();
          if (candEmail === email) {
            return this.mergeRecords(candidate, record);
          }
        }
      }
    }

    // 3. No match — return as new
    return record;
  }

  private mergeRecords(existing: CanonicalRecord, incoming: CanonicalRecord): CanonicalRecord {
    return {
      ...existing,
      properties: { ...existing.properties, ...incoming.properties },
      sourceLinks: [...existing.sourceLinks, ...incoming.sourceLinks],
      updatedAt: utcNow(),
      confidence: Math.max(existing.confidence, incoming.confidence),
    };
  }
}

// ════════════════════════════════════════════════════════════════
// EVENT BUS
// ════════════════════════════════════════════════════════════════

export class PlatformEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(1000);
  }

  publish(event: DomainEvent): void {
    this.emit(event.eventType, event);
    this.emit("*", event);
  }

  subscribe(eventType: string, handler: (event: DomainEvent) => void): () => void {
    this.on(eventType, handler);
    return () => this.off(eventType, handler);
  }

  subscribeAll(handler: (event: DomainEvent) => void): () => void {
    return this.subscribe("*", handler);
  }
}

// ════════════════════════════════════════════════════════════════
// STATE ENGINE — event → state transitions
// ════════════════════════════════════════════════════════════════

export class CoreStateEngine {
  constructor(
    private stateStore: CoreStateStore,
    private canonicalStore: CanonicalStore,
  ) {}

  handleEvent(event: DomainEvent): void {
    const canonical = this.canonicalStore.get(event.canonicalEntityId);
    if (!canonical) return;

    let current = this.stateStore.get(event.canonicalEntityId);
    if (!current) {
      current = {
        canonicalId: canonical.canonicalId,
        entityType: canonical.entityType,
        tenantId: canonical.tenantId,
        currentStatus: "active",
        blockers: [],
        dependencies: [],
        riskScore: 0,
        freshnessStatus: "fresh",
        lastUpdatedAt: utcNow(),
        properties: {},
      };
    }

    // Apply state transition rules
    this.applyTransition(current, event);

    current.lastEventAt = event.timestamp;
    current.lastUpdatedAt = utcNow();
    current.freshnessStatus = "fresh";

    this.stateStore.upsert(current);
  }

  private applyTransition(state: EntityStateRecord, event: DomainEvent): void {
    switch (event.eventType) {
      case "supplier_delayed":
      case "delivery.delayed":
        state.currentStatus = "at_risk";
        state.riskScore = Math.max(state.riskScore, 0.8);
        if (!state.blockers.includes("supplier_delay")) state.blockers.push("supplier_delay");
        break;

      case "inventory_below_threshold":
      case "stock.low":
        state.currentStatus = "at_risk";
        state.riskScore = Math.max(state.riskScore, 0.7);
        if (!state.blockers.includes("inventory_shortage")) state.blockers.push("inventory_shortage");
        break;

      case "stock.critical":
        state.currentStatus = "blocked";
        state.riskScore = Math.max(state.riskScore, 0.95);
        if (!state.blockers.includes("stockout")) state.blockers.push("stockout");
        break;

      case "quality_issue_opened":
      case "qc.failed":
        state.currentStatus = "at_risk";
        state.riskScore = Math.max(state.riskScore, 0.6);
        if (!state.blockers.includes("quality_issue")) state.blockers.push("quality_issue");
        break;

      case "payment_received":
        state.properties["last_payment_received"] = event.timestamp.toISOString();
        state.blockers = state.blockers.filter(b => b !== "overdue_payment");
        if (state.blockers.length === 0) state.currentStatus = "active";
        break;

      case "invoice_overdue":
      case "invoice.overdue":
        state.currentStatus = "at_risk";
        state.riskScore = Math.max(state.riskScore, 0.5);
        if (!state.blockers.includes("overdue_payment")) state.blockers.push("overdue_payment");
        break;

      case "workflow_completed":
        state.currentStatus = "completed";
        state.blockers = [];
        state.riskScore = 0;
        break;

      case "risk_escalated":
        state.riskScore = Math.min(1.0, state.riskScore + 0.2);
        break;

      case "entity_upserted":
        // Keep current status, just update timestamp (already done above)
        break;
    }

    // SLA check
    if (state.riskScore >= 0.8) state.slaStatus = "breach_imminent";
    else if (state.riskScore >= 0.5) state.slaStatus = "at_risk";
    else state.slaStatus = "on_track";
  }
}

// ════════════════════════════════════════════════════════════════
// OBSERVABILITY
// ════════════════════════════════════════════════════════════════

export class ObservabilityStore {
  private metrics = new Map<string, PipelineMetrics>();
  private durations = new Map<string, number[]>();

  getOrCreate(pipelineName: string): PipelineMetrics {
    let m = this.metrics.get(pipelineName);
    if (!m) {
      m = {
        pipelineName,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        acceptedRecords: 0,
        quarantinedRecords: 0,
        rejectedRecords: 0,
        emittedEvents: 0,
        healthScore: 100,
      };
      this.metrics.set(pipelineName, m);
    }
    return m;
  }

  recordRun(pipelineName: string, success: boolean, durationMs: number, error?: string): void {
    const m = this.getOrCreate(pipelineName);
    m.totalRuns++;
    if (success) { m.successfulRuns++; m.lastSuccessAt = utcNow(); }
    else { m.failedRuns++; m.lastFailureAt = utcNow(); m.lastError = error; }
    m.lastRunAt = utcNow();

    // Track durations
    const durs = this.durations.get(pipelineName) ?? [];
    durs.push(durationMs);
    if (durs.length > 100) durs.shift();
    this.durations.set(pipelineName, durs);

    m.avgDurationMs = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
    const sorted = durs.slice().sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    m.p95DurationMs = sorted[p95Index] ?? durationMs;

    // Health score
    const successRate = m.totalRuns > 0 ? m.successfulRuns / m.totalRuns : 1;
    m.healthScore = Math.round(successRate * 100);
  }

  addCounts(pipelineName: string, accepted: number, quarantined: number, rejected: number, events: number): void {
    const m = this.getOrCreate(pipelineName);
    m.acceptedRecords += accepted;
    m.quarantinedRecords += quarantined;
    m.rejectedRecords += rejected;
    m.emittedEvents += events;
  }

  all(): PipelineMetrics[] {
    return Array.from(this.metrics.values());
  }

  get(pipelineName: string): PipelineMetrics | undefined {
    return this.metrics.get(pipelineName);
  }
}

// ════════════════════════════════════════════════════════════════
// INGESTION ORCHESTRATOR — the end-to-end flow
// ════════════════════════════════════════════════════════════════

export class IngestionOrchestrator {
  constructor(
    public schemaRegistry: SchemaRegistry,
    public rawStore: RawStore,
    public quarantineStore: QuarantineStore,
    public canonicalStore: CanonicalStore,
    public eventStore: EventStore,
    public lineageStore: LineageStore,
    public ontologyStore: OntologyStore,
    public qualityEngine: DataQualityEngine,
    public mapper: CanonicalMapper,
    public identityResolver: CoreIdentityResolver,
    public eventBus: PlatformEventBus,
    public observability: ObservabilityStore,
  ) {}

  async processRecords(pipelineName: string, records: RawRecord[]): Promise<{
    accepted: number;
    quarantined: number;
    rejected: number;
    events: number;
    durationMs: number;
    runId: string;
  }> {
    const runId = newId("run");
    const start = Date.now();
    let accepted = 0;
    let quarantined = 0;
    let rejected = 0;
    let events = 0;
    let lastError: string | undefined;

    for (const raw of records) {
      try {
        // Step 1: Store raw
        this.rawStore.put(raw);
        this.appendLineage(raw, pipelineName, "raw_ingestion", undefined, runId);

        // Step 2: Validate against schema
        const schema = this.schemaRegistry.get(raw.schemaName, raw.schemaVersion);
        const validation = this.qualityEngine.validate(raw, schema);

        if (validation.disposition !== "accepted") {
          this.quarantineStore.put(raw, validation.issues);
          this.appendLineage(raw, pipelineName, "quarantined", undefined, runId, { issueCount: validation.issues.length });
          quarantined++;
          continue;
        }

        // Step 3: Map to canonical
        const canonical = this.mapper.map(raw);
        this.appendLineage(raw, pipelineName, "canonical_mapping", canonical.canonicalId, runId, { entityType: canonical.entityType });

        // Step 4: Identity resolution
        const resolved = this.identityResolver.resolve(canonical);
        this.canonicalStore.upsert(resolved);
        this.appendLineage(raw, pipelineName, "identity_resolution", resolved.canonicalId, runId);

        // Step 5: Ontology hydration
        this.ontologyStore.upsertFromCanonical(resolved);
        this.appendLineage(raw, pipelineName, "ontology_hydration", resolved.canonicalId, runId);

        // Step 6: Emit domain event
        const event: DomainEvent = {
          eventId: newId("evt"),
          eventType: (raw.payload["event_type"] as string) ?? "entity_upserted",
          tenantId: raw.tenantId,
          canonicalEntityId: resolved.canonicalId,
          entityType: resolved.entityType,
          timestamp: utcNow(),
          payload: resolved.properties,
          sourceId: raw.sourceId,
          sourceRecordId: raw.sourceRecordId,
          correlationId: raw.correlationId,
          severity: "info",
          schemaVersion: "1.0",
        };
        this.eventStore.append(event);
        this.eventBus.publish(event);
        this.appendLineage(raw, pipelineName, "event_emission", resolved.canonicalId, runId, { eventId: event.eventId });

        // Step 7: Bridge to real-time platform (for Command Center)
        realtimePlatform.publish({
          eventType: event.eventType,
          sourceModule: "ai",
          entityType: event.entityType.toLowerCase(),
          entityId: event.canonicalEntityId,
          entityLabel: (event.payload["name"] as string) ?? event.canonicalEntityId,
          severity: "info",
          newState: event.payload,
          metadata: { pipelineName, runId },
        });

        accepted++;
        events++;
      } catch (e) {
        rejected++;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    const durationMs = Date.now() - start;
    this.observability.recordRun(pipelineName, rejected === 0, durationMs, lastError);
    this.observability.addCounts(pipelineName, accepted, quarantined, rejected, events);

    return { accepted, quarantined, rejected, events, durationMs, runId };
  }

  private appendLineage(
    raw: RawRecord,
    pipelineName: string,
    step: string,
    canonicalId?: string,
    runId?: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.lineageStore.append({
      lineageId: newId("lin"),
      tenantId: raw.tenantId,
      sourceId: raw.sourceId,
      rawRecordId: raw.recordId,
      canonicalId,
      pipelineName,
      transformationStep: step,
      timestamp: utcNow(),
      metadata: { sourceRecordId: raw.sourceRecordId, runId, ...metadata },
    });
  }
}

// ════════════════════════════════════════════════════════════════
// LIVE COMPANY SNAPSHOT
// ════════════════════════════════════════════════════════════════

export class LiveCompanySnapshot {
  constructor(
    private stateStore: CoreStateStore,
    private canonicalStore: CanonicalStore,
    private ontologyStore: OntologyStore,
    private eventStore: EventStore,
    private observability: ObservabilityStore,
  ) {}

  build() {
    const states = this.stateStore.all();
    const totalObjects = this.ontologyStore.count();
    const totalCanonical = this.canonicalStore.count();
    const atRisk = states.filter(s => s.currentStatus === "at_risk").length;
    const blocked = states.filter(s => s.currentStatus === "blocked").length;
    const fresh = states.filter(s => s.freshnessStatus === "fresh").length;

    const stateBreakdown: Record<string, number> = {};
    for (const s of states) {
      stateBreakdown[s.entityType] = (stateBreakdown[s.entityType] ?? 0) + 1;
    }

    const pipelineHealth: Record<string, {
      acceptedRecords: number;
      quarantinedRecords: number;
      emittedEvents: number;
      lastRunAt: string | null;
      lastError: string | null;
      healthScore: number;
    }> = {};
    for (const m of this.observability.all()) {
      pipelineHealth[m.pipelineName] = {
        acceptedRecords: m.acceptedRecords,
        quarantinedRecords: m.quarantinedRecords,
        emittedEvents: m.emittedEvents,
        lastRunAt: m.lastRunAt?.toISOString() ?? null,
        lastError: m.lastError ?? null,
        healthScore: m.healthScore,
      };
    }

    return {
      generatedAt: utcNow().toISOString(),
      totalCanonical,
      totalObjects,
      totalLiveStates: states.length,
      atRiskEntities: atRisk,
      blockedEntities: blocked,
      freshEntities: fresh,
      stateBreakdown,
      eventsTotal: this.eventStore.count(),
      pipelineHealth,
    };
  }
}

// ════════════════════════════════════════════════════════════════
// AI CONTEXT BUILDER — Claude-ready enterprise context
// ════════════════════════════════════════════════════════════════

export class AIContextBuilder {
  constructor(
    private stateStore: CoreStateStore,
    private canonicalStore: CanonicalStore,
    private eventStore: EventStore,
    private ontologyStore: OntologyStore,
    private lineageStore: LineageStore,
  ) {}

  /**
   * Build a rich context packet for a specific entity.
   * This is what Claude receives as enterprise context.
   */
  buildEntityContext(canonicalId: string): {
    entity: CanonicalRecord | null;
    state: EntityStateRecord | null;
    ontology: OntologyObject | null;
    recentEvents: DomainEvent[];
    lineage: LineageRecord[];
    relationships: Array<{ relation: string; targetId: string; targetType?: string }>;
    freshness: { lastEventAt: string | null; lastUpdatedAt: string | null; status: FreshnessStatus };
    riskContext: { riskScore: number; blockers: string[]; slaStatus?: string };
    financialContext: { exposure?: number; lastPaymentReceived?: string };
    permissionScope: { tenantId: string | null };
    tokenCountEstimate: number;
    generatedAt: string;
  } {
    const entity = this.canonicalStore.get(canonicalId) ?? null;
    const state = this.stateStore.get(canonicalId) ?? null;
    const ontology = this.ontologyStore.get(canonicalId) ?? null;
    const recentEvents = this.eventStore.recentForEntity(canonicalId, 20);
    const lineage = this.lineageStore.forCanonical(canonicalId).slice(-30);

    // Expand relationships
    const relationships: Array<{ relation: string; targetId: string; targetType?: string }> = [];
    if (ontology) {
      for (const [rel, targetIds] of Object.entries(ontology.relationships)) {
        for (const tid of targetIds) {
          const target = this.ontologyStore.get(tid);
          relationships.push({ relation: rel, targetId: tid, targetType: target?.objectType });
        }
      }
    }

    const freshness: { lastEventAt: string | null; lastUpdatedAt: string | null; status: FreshnessStatus } = {
      lastEventAt: state?.lastEventAt?.toISOString() ?? null,
      lastUpdatedAt: state?.lastUpdatedAt?.toISOString() ?? null,
      status: state?.freshnessStatus ?? "unknown",
    };

    const riskContext = {
      riskScore: state?.riskScore ?? 0,
      blockers: state?.blockers ?? [],
      slaStatus: state?.slaStatus,
    };

    const financialContext = {
      exposure: state?.financialExposure,
      lastPaymentReceived: state?.properties["last_payment_received"] as string | undefined,
    };

    const packet = {
      entity,
      state,
      ontology,
      recentEvents,
      lineage,
      relationships,
      freshness,
      riskContext,
      financialContext,
      permissionScope: { tenantId: entity?.tenantId ?? null },
      tokenCountEstimate: 0,
      generatedAt: utcNow().toISOString(),
    };
    // Rough token estimate: 1 token per 4 chars
    packet.tokenCountEstimate = Math.ceil(JSON.stringify(packet).length / 4);
    return packet;
  }

  /**
   * Build a situation-level context for AI reasoning over the whole company.
   */
  buildSituationContext() {
    const states = this.stateStore.all();
    const atRisk = states.filter(s => s.riskScore >= 0.6);
    const blocked = states.filter(s => s.currentStatus === "blocked");
    const recentCriticalEvents = this.eventStore.recent(100).filter(e => e.severity === "critical" || e.severity === "high");

    return {
      totalEntities: this.canonicalStore.count(),
      totalLiveStates: states.length,
      atRisk: atRisk.slice(0, 20).map(s => ({
        id: s.canonicalId,
        type: s.entityType,
        status: s.currentStatus,
        risk: s.riskScore,
        blockers: s.blockers,
      })),
      blocked: blocked.slice(0, 10).map(s => ({
        id: s.canonicalId,
        type: s.entityType,
        blockers: s.blockers,
      })),
      recentCriticalEvents: recentCriticalEvents.slice(0, 20).map(e => ({
        id: e.eventId,
        type: e.eventType,
        entityId: e.canonicalEntityId,
        time: e.timestamp.toISOString(),
        severity: e.severity,
      })),
      generatedAt: utcNow().toISOString(),
    };
  }
}

// ════════════════════════════════════════════════════════════════
// TENANT ISOLATION
// ════════════════════════════════════════════════════════════════

export class TenantIsolation {
  /**
   * Enforce tenant boundaries on any query.
   */
  filterByTenant<T extends { tenantId: string }>(items: T[], tenantId: string): T[] {
    if (!tenantId) return [];
    return items.filter(i => i.tenantId === tenantId);
  }

  /**
   * Check if a user has permission to access a resource in a tenant.
   */
  canAccess(userTenantId: string, resourceTenantId: string, userRoles: string[] = [], _requiredRoles: string[] = []): boolean {
    if (userTenantId !== resourceTenantId) {
      // Cross-tenant access requires explicit permission
      return userRoles.includes("platform_admin");
    }
    return true;
  }
}

// ════════════════════════════════════════════════════════════════
// DATA PLATFORM — the top-level facade
// ════════════════════════════════════════════════════════════════

export class DataPlatform {
  schemaRegistry = new SchemaRegistry();
  rawStore = new RawStore();
  quarantineStore = new QuarantineStore();
  canonicalStore = new CanonicalStore();
  eventStore = new EventStore();
  lineageStore = new LineageStore();
  ontologyStore = new OntologyStore();
  stateStore = new CoreStateStore();
  qualityEngine = new DataQualityEngine();
  mapper = new GenericCanonicalMapper();
  identityResolver = new CoreIdentityResolver(this.canonicalStore);
  eventBus = new PlatformEventBus();
  observability = new ObservabilityStore();

  stateEngine = new CoreStateEngine(this.stateStore, this.canonicalStore);
  orchestrator = new IngestionOrchestrator(
    this.schemaRegistry,
    this.rawStore,
    this.quarantineStore,
    this.canonicalStore,
    this.eventStore,
    this.lineageStore,
    this.ontologyStore,
    this.qualityEngine,
    this.mapper,
    this.identityResolver,
    this.eventBus,
    this.observability,
  );
  liveSnapshot = new LiveCompanySnapshot(
    this.stateStore,
    this.canonicalStore,
    this.ontologyStore,
    this.eventStore,
    this.observability,
  );
  aiContextBuilder = new AIContextBuilder(
    this.stateStore,
    this.canonicalStore,
    this.eventStore,
    this.ontologyStore,
    this.lineageStore,
  );
  tenantIsolation = new TenantIsolation();

  constructor() {
    // Wire state engine to event bus — every published event updates state
    this.eventBus.subscribeAll((event) => this.stateEngine.handleEvent(event));
  }

  // Convenience: process a single record
  async ingest(pipelineName: string, raw: RawRecord) {
    return this.orchestrator.processRecords(pipelineName, [raw]);
  }

  async ingestBatch(pipelineName: string, records: RawRecord[]) {
    return this.orchestrator.processRecords(pipelineName, records);
  }
}

export const dataPlatform = new DataPlatform();
