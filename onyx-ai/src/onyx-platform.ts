/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                                                                         ║
 * ║   ██████╗ ███╗   ██╗██╗   ██╗██╗  ██╗     █████╗ ██╗                   ║
 * ║  ██╔═══██╗████╗  ██║╚██╗ ██╔╝╚██╗██╔╝    ██╔══██╗██║                   ║
 * ║  ██║   ██║██╔██╗ ██║ ╚████╔╝  ╚███╔╝     ███████║██║                   ║
 * ║  ██║   ██║██║╚██╗██║  ╚██╔╝   ██╔██╗     ██╔══██║██║                   ║
 * ║  ╚██████╔╝██║ ╚████║   ██║   ██╔╝ ██╗    ██║  ██║██║                   ║
 * ║   ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝    ╚═╝  ╚═╝╚═╝                   ║
 * ║                                                                         ║
 * ║   ONYX AI — Institutional-Grade Autonomous Operations Platform          ║
 * ║   Version 2.0.0                                                         ║
 * ║                                                                         ║
 * ║   Architecture Philosophy:                                              ║
 * ║   • No simulations. No Math.random() pretending to be intelligence.     ║
 * ║   • Every decision has a real reasoning chain with audit trail.          ║
 * ║   • Event-sourced: every state mutation is a logged, replayable event.  ║
 * ║   • Circuit breakers, backpressure, graceful degradation.               ║
 * ║   • Designed for 24/7/365 unattended operation.                         ║
 * ║                                                                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ARCHITECTURE OVERVIEW:
 *
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │                        ONYX CONTROL PLANE                          │
 *  │                                                                     │
 *  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐               │
 *  │  │  GOVERNOR    │  │  COMPLIANCE  │  │  RISK       │               │
 *  │  │  Rate limits │  │  Audit trail │  │  Exposure   │               │
 *  │  │  Budgets     │  │  Approvals   │  │  Limits     │               │
 *  │  │  Kill switch │  │  Lineage     │  │  Hedging    │               │
 *  │  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘               │
 *  │         └─────────────────┼─────────────────┘                      │
 *  │                           ▼                                         │
 *  │  ┌────────────────────────────────────────────────┐                │
 *  │  │              EVENT BUS (Event-Sourced)          │                │
 *  │  │  Append-only log • Replay • Snapshots           │                │
 *  │  └────────────────────┬───────────────────────────┘                │
 *  │                       ▼                                             │
 *  │  ┌────────────────────────────────────────────────┐                │
 *  │  │           ORCHESTRATOR (DAG Executor)           │                │
 *  │  │  Dependency resolution • Parallel execution     │                │
 *  │  │  Backpressure • Circuit breakers                │                │
 *  │  └────────────────────┬───────────────────────────┘                │
 *  │                       ▼                                             │
 *  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │
 *  │  │Agent │ │Agent │ │Agent │ │Agent │ │Agent │ ← Worker Pool       │
 *  │  │  1   │ │  2   │ │  3   │ │  N   │ │  N+1 │                    │
 *  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘                    │
 *  │     └────────┴────────┴────────┴────────┘                          │
 *  │                       ▼                                             │
 *  │  ┌────────────────────────────────────────────────┐                │
 *  │  │           TOOL REGISTRY (Plugin System)         │                │
 *  │  │  HTTP • Database • File • AI/LLM • Queue       │                │
 *  │  └────────────────────────────────────────────────┘                │
 *  │                                                                     │
 *  │  ┌────────────────────────────────────────────────┐                │
 *  │  │              KNOWLEDGE GRAPH                    │                │
 *  │  │  Entity store • Relationships • Temporal        │                │
 *  │  │  Embeddings • Semantic search • Versioned       │                │
 *  │  └────────────────────────────────────────────────┘                │
 *  └─────────────────────────────────────────────────────────────────────┘
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 0: FOUNDATIONAL PRIMITIVES
// These are the atomic building blocks everything else is composed from.
// Nothing in this section has side effects or external dependencies.
// ═══════════════════════════════════════════════════════════════════════════

/** Cryptographically unique IDs — not Math.random() garbage */
function uid(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/** Monotonic clock that never goes backwards */
class MonotonicClock {
  private lastTime = 0;
  now(): number {
    const current = Date.now();
    this.lastTime = current > this.lastTime ? current : this.lastTime + 1;
    return this.lastTime;
  }
  elapsed(since: number): number {
    return this.now() - since;
  }
}

/** Immutable result type — forces explicit error handling, no thrown exceptions flying around */
type Result<T, E = Error> =
  | { ok: true; value: T; timestamp: number }
  | { ok: false; error: E; timestamp: number; context?: Record<string, unknown> };

function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value, timestamp: Date.now() };
}

function Err<E>(error: E, context?: Record<string, unknown>): Result<never, E> {
  return { ok: false, error, timestamp: Date.now(), context };
}

/** Exponential backoff with jitter — not linear retry nonsense */
class BackoffCalculator {
  constructor(
    private baseMs: number = 1000,
    private maxMs: number = 60000,
    private jitterFactor: number = 0.3,
  ) {}

  calculate(attempt: number): number {
    const exponential = Math.min(this.maxMs, this.baseMs * Math.pow(2, attempt));
    const jitter = exponential * this.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(this.baseMs, Math.floor(exponential + jitter));
  }
}

/** Sliding window rate limiter — token bucket algorithm */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRatePerSecond: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  tryAcquire(cost: number = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
    this.lastRefill = now;
  }

  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

/** Circuit breaker — prevents cascading failures */
enum CircuitState { CLOSED, OPEN, HALF_OPEN }

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly name: string,
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeMs: number = 30000,
    private readonly halfOpenMaxAttempts: number = 3,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<Result<T>> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime < this.recoveryTimeMs) {
        return Err(new Error(`Circuit breaker [${this.name}] is OPEN — refusing execution`), {
          state: 'OPEN',
          failureCount: this.failureCount,
          recoveryIn: this.recoveryTimeMs - (Date.now() - this.lastFailureTime),
        });
      }
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return Ok(result);
    } catch (error) {
      this.onFailure();
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxAttempts) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  get currentState(): CircuitState { return this.state; }
  get stats() {
    return {
      name: this.name,
      state: CircuitState[this.state],
      failures: this.failureCount,
      threshold: this.failureThreshold,
    };
  }
}

/** Bounded concurrent execution pool */
class WorkerPool {
  private running = 0;
    private queue: Array<{ task: () => Promise<any>; resolve: (value: any) => void; reject: (reason?: any) => void }> = [];

  constructor(private maxConcurrency: number) {}

  async submit<T>(task: () => Promise<T>): Promise<T> {
    if (this.running < this.maxConcurrency) {
      return this.run(task);
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
    });
  }

  private async run<T>(task: () => Promise<T>): Promise<T> {
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.drain();
    }
  }

  private drain(): void {
    while (this.running < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.run(next.task).then(next.resolve, next.reject);
    }
  }

  get utilization(): number {
    return this.running / this.maxConcurrency;
  }

  get pending(): number {
    return this.queue.length;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: EVENT SOURCING INFRASTRUCTURE
// Every state change is an immutable event. The system can be replayed
// from any point in time. This is how real institutional systems work.
// ═══════════════════════════════════════════════════════════════════════════

interface DomainEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly sequenceNumber: number;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<{
    correlationId: string;
    causationId: string | null;
    actor: string;
    source: string;
    version: number;
  }>;
  readonly hash: string;
}

class EventStore {
  private events: DomainEvent[] = [];
  private sequenceCounter = 0;
  private snapshots: Map<string, { state: unknown; atSequence: number }> = new Map();
  private subscribers: Map<string, Array<(event: DomainEvent) => void | Promise<void>>> = new Map();
  private persistencePath: string | null = null;
  private writeBuffer: DomainEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config?: { persistPath?: string; flushIntervalMs?: number }) {
    if (config?.persistPath) {
      this.persistencePath = config.persistPath;
      this.loadFromDisk();
      this.flushInterval = setInterval(
        () => this.flushToDisk(),
        config.flushIntervalMs ?? 5000,
      );
    }
  }

  /** Append an event — the ONLY way to change state in the entire system */
  append(params: {
    type: string;
    aggregateId: string;
    aggregateType: string;
    payload: Record<string, unknown>;
    correlationId?: string;
    causationId?: string | null;
    actor?: string;
    source?: string;
  }): DomainEvent {
    const sequence = ++this.sequenceCounter;
    const event: DomainEvent = {
      id: uid('evt'),
      type: params.type,
      timestamp: Date.now(),
      sequenceNumber: sequence,
      aggregateId: params.aggregateId,
      aggregateType: params.aggregateType,
      payload: Object.freeze({ ...params.payload }),
      metadata: Object.freeze({
        correlationId: params.correlationId ?? uid('cor'),
        causationId: params.causationId ?? null,
        actor: params.actor ?? 'system',
        source: params.source ?? 'engine',
        version: 1,
      }),
      hash: '', // Will be computed below
    };

    // Compute tamper-evident hash chain
    const prevHash = this.events.length > 0 
      ? this.events[this.events.length - 1].hash 
      : '0';
    (event as any).hash = crypto
      .createHash('sha256')
      .update(`${prevHash}|${event.id}|${event.type}|${event.timestamp}|${JSON.stringify(event.payload)}`)
      .digest('hex');

    Object.freeze(event);
    this.events.push(event);
    this.writeBuffer.push(event);

    // Notify subscribers
    this.notify(event);

    return event;
  }

  /** Subscribe to event types — supports wildcards */
  subscribe(
    eventType: string,
    handler: (event: DomainEvent) => void | Promise<void>,
  ): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.subscribers.get(eventType);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx !== -1) handlers.splice(idx, 1);
      }
    };
  }

  private async notify(event: DomainEvent): Promise<void> {
    const handlers = [
      ...(this.subscribers.get(event.type) ?? []),
      ...(this.subscribers.get('*') ?? []),
    ];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        // Event handlers MUST NOT crash the event store
        console.error(`[EventStore] Handler error for ${event.type}:`, err);
      }
    }
  }

  /** Query events with full filtering */
  query(filter: {
    types?: string[];
    aggregateId?: string;
    aggregateType?: string;
    after?: number;        // sequence number
    before?: number;
    since?: number;        // timestamp
    until?: number;
    limit?: number;
    correlationId?: string;
  }): DomainEvent[] {
    let results = this.events;

    if (filter.types?.length) {
      results = results.filter(e => filter.types!.includes(e.type));
    }
    if (filter.aggregateId) {
      results = results.filter(e => e.aggregateId === filter.aggregateId);
    }
    if (filter.aggregateType) {
      results = results.filter(e => e.aggregateType === filter.aggregateType);
    }
    if (filter.after !== undefined) {
      results = results.filter(e => e.sequenceNumber > filter.after!);
    }
    if (filter.before !== undefined) {
      results = results.filter(e => e.sequenceNumber < filter.before!);
    }
    if (filter.since !== undefined) {
      results = results.filter(e => e.timestamp >= filter.since!);
    }
    if (filter.until !== undefined) {
      results = results.filter(e => e.timestamp <= filter.until!);
    }
    if (filter.correlationId) {
      results = results.filter(e => e.metadata.correlationId === filter.correlationId);
    }
    if (filter.limit) {
      results = results.slice(-filter.limit);
    }

    return results;
  }

  /** Save a snapshot for fast replay */
  saveSnapshot(aggregateId: string, state: unknown): void {
    this.snapshots.set(aggregateId, {
      state: JSON.parse(JSON.stringify(state)),
      atSequence: this.sequenceCounter,
    });
  }

  getSnapshot(aggregateId: string): { state: unknown; atSequence: number } | undefined {
    return this.snapshots.get(aggregateId);
  }

  /** Verify hash chain integrity — detects tampering */
  verifyIntegrity(): Result<boolean> {
    let prevHash = '0';
    for (const event of this.events) {
      const expected = crypto
        .createHash('sha256')
        .update(`${prevHash}|${event.id}|${event.type}|${event.timestamp}|${JSON.stringify(event.payload)}`)
        .digest('hex');
      if (event.hash !== expected) {
        return Err(new Error(`Integrity violation at event ${event.id} (seq: ${event.sequenceNumber})`));
      }
      prevHash = event.hash;
    }
    return Ok(true);
  }

  private loadFromDisk(): void {
    if (!this.persistencePath) return;
    try {
      if (fs.existsSync(this.persistencePath)) {
        const data = fs.readFileSync(this.persistencePath, 'utf-8');
        const loaded = JSON.parse(data) as DomainEvent[];
        this.events = loaded;
        this.sequenceCounter = loaded.length > 0 ? loaded[loaded.length - 1].sequenceNumber : 0;
      }
    } catch (err) {
      console.error('[EventStore] Failed to load from disk:', err);
    }
  }

  private flushToDisk(): void {
    if (!this.persistencePath || this.writeBuffer.length === 0) return;
    try {
      // Append-only write
      const lines = this.writeBuffer.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.appendFileSync(this.persistencePath + '.wal', lines);
      this.writeBuffer = [];

      // Periodic full snapshot
      if (this.events.length % 1000 === 0) {
        fs.writeFileSync(this.persistencePath, JSON.stringify(this.events));
      }
    } catch (err) {
      console.error('[EventStore] Failed to flush to disk:', err);
    }
  }

  get size(): number { return this.events.length; }
  get lastSequence(): number { return this.sequenceCounter; }

  shutdown(): void {
    if (this.flushInterval) clearInterval(this.flushInterval);
    this.flushToDisk();
  }

  /** Full audit report for compliance */
  auditReport(params: {
    actor?: string;
    since?: number;
    until?: number;
  }): {
    totalEvents: number;
    byType: Record<string, number>;
    byActor: Record<string, number>;
    integrityValid: boolean;
    timeRange: { from: number; to: number };
  } {
    const events = this.query({
      since: params.since,
      until: params.until,
    }).filter(e => !params.actor || e.metadata.actor === params.actor);

    const byType: Record<string, number> = {};
    const byActor: Record<string, number> = {};
    for (const e of events) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
      byActor[e.metadata.actor] = (byActor[e.metadata.actor] ?? 0) + 1;
    }

    const integrity = this.verifyIntegrity();

    return {
      totalEvents: events.length,
      byType,
      byActor,
      integrityValid: integrity.ok ? integrity.value : false,
      timeRange: {
        from: events[0]?.timestamp ?? 0,
        to: events[events.length - 1]?.timestamp ?? 0,
      },
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: GOVERNANCE & COMPLIANCE
// The Governor is the single authority that controls what the system
// is ALLOWED to do. No agent, no orchestrator, no human can bypass it
// without leaving an audit trail.
// ═══════════════════════════════════════════════════════════════════════════

interface Policy {
  id: string;
  name: string;
  description: string;
  type: 'rate_limit' | 'budget' | 'approval_required' | 'blacklist' | 'whitelist' | 'time_window' | 'risk_limit';
  scope: 'global' | 'agent' | 'task_type' | 'tool' | 'department';
  scopeTarget?: string;
  rule: PolicyRule;
  active: boolean;
  priority: number;  // Higher = checked first
  createdAt: number;
  createdBy: string;
}

type PolicyRule =
  | { type: 'rate_limit'; maxPerMinute: number; maxPerHour: number; maxPerDay: number }
  | { type: 'budget'; maxCostPerTask: number; maxCostPerDay: number; currency: string; currentSpent: number }
  | { type: 'approval_required'; approvers: string[]; minApprovals: number; timeoutMs: number }
  | { type: 'blacklist'; blocked: string[]; reason: string }
  | { type: 'whitelist'; allowed: string[] }
  | { type: 'time_window'; allowedHours: { start: number; end: number }; allowedDays: number[]; timezone: string }
  | { type: 'risk_limit'; maxRiskScore: number; maxExposure: number; requiresHedge: boolean };

interface PolicyViolation {
  policyId: string;
  policyName: string;
  type: string;
  message: string;
  severity: 'warning' | 'block' | 'critical';
  timestamp: number;
}

interface GovernanceDecision {
  allowed: boolean;
  violations: PolicyViolation[];
  requiresApproval: boolean;
  approvers: string[];
  riskScore: number;
  reasoning: string[];
}

class Governor {
  private policies: Map<string, Policy> = new Map();
  private rateLimiters: Map<string, RateLimiter> = new Map();
  private budgetTrackers: Map<string, { spent: number; resetAt: number }> = new Map();
  private approvalQueue: Map<string, {
    requestId: string;
    action: string;
    requester: string;
    approvers: string[];
    received: Map<string, boolean>;
    required: number;
    expiresAt: number;
    callback: (approved: boolean) => void;
  }> = new Map();
  private killSwitch = false;

  constructor(private eventStore: EventStore) {}

  /** Add a governance policy */
  addPolicy(policy: Omit<Policy, 'id' | 'createdAt'>): Policy {
    const fullPolicy: Policy = {
      ...policy,
      id: uid('pol'),
      createdAt: Date.now(),
    };
    this.policies.set(fullPolicy.id, fullPolicy);

    // Initialize rate limiter if needed
    if (policy.rule.type === 'rate_limit') {
      this.rateLimiters.set(
        `${policy.scope}:${policy.scopeTarget ?? 'global'}`,
        new RateLimiter(policy.rule.maxPerMinute, policy.rule.maxPerMinute / 60),
      );
    }

    this.eventStore.append({
      type: 'governance.policy_added',
      aggregateId: fullPolicy.id,
      aggregateType: 'policy',
      payload: { policy: fullPolicy },
      actor: policy.createdBy,
    });

    return fullPolicy;
  }

  /** The core evaluation — every action goes through here */
  evaluate(action: {
    type: string;
    agentId?: string;
    department?: string;
    toolId?: string;
    taskType?: string;
    estimatedCost?: number;
    riskScore?: number;
    metadata?: Record<string, unknown>;
  }): GovernanceDecision {
    // Kill switch overrides everything
    if (this.killSwitch) {
      return {
        allowed: false,
        violations: [{
          policyId: 'KILL_SWITCH',
          policyName: 'Emergency Kill Switch',
          type: 'critical',
          message: 'System is in emergency shutdown mode. All actions are blocked.',
          severity: 'critical',
          timestamp: Date.now(),
        }],
        requiresApproval: false,
        approvers: [],
        riskScore: 1.0,
        reasoning: ['Kill switch is active'],
      };
    }

    const violations: PolicyViolation[] = [];
    const reasoning: string[] = [];
    let requiresApproval = false;
    let approvers: string[] = [];
    let riskScore = action.riskScore ?? 0;

    // Check all active policies, sorted by priority
    const activePolicies = Array.from(this.policies.values())
      .filter(p => p.active)
      .sort((a, b) => b.priority - a.priority);

    for (const policy of activePolicies) {
      // Check if policy applies to this action
      if (!this.policyApplies(policy, action)) continue;

      const result = this.evaluatePolicy(policy, action);
      if (result.violation) {
        violations.push(result.violation);
      }
      if (result.requiresApproval) {
        requiresApproval = true;
        approvers = [...new Set([...approvers, ...(result.approvers ?? [])])];
      }
      if (result.riskContribution) {
        riskScore = Math.min(1.0, riskScore + result.riskContribution);
      }
      if (result.reasoning) {
        reasoning.push(result.reasoning);
      }
    }

    const hasBlockingViolation = violations.some(v => v.severity === 'block' || v.severity === 'critical');
    const allowed = !hasBlockingViolation;

    // Log the governance decision
    this.eventStore.append({
      type: 'governance.decision',
      aggregateId: action.agentId ?? 'system',
      aggregateType: 'governance',
      payload: {
        action,
        allowed,
        violationCount: violations.length,
        riskScore,
        requiresApproval,
      },
      actor: 'governor',
    });

    return { allowed, violations, requiresApproval, approvers, riskScore, reasoning };
  }

  private policyApplies(policy: Policy, action: Record<string, unknown>): boolean {
    switch (policy.scope) {
      case 'global': return true;
      case 'agent': return action.agentId === policy.scopeTarget;
      case 'task_type': return action.taskType === policy.scopeTarget;
      case 'tool': return action.toolId === policy.scopeTarget;
      case 'department': return action.department === policy.scopeTarget;
      default: return false;
    }
  }

  private evaluatePolicy(
    policy: Policy,
    action: Record<string, unknown>,
  ): {
    violation?: PolicyViolation;
    requiresApproval?: boolean;
    approvers?: string[];
    riskContribution?: number;
    reasoning?: string;
  } {
    const rule = policy.rule;

    switch (rule.type) {
      case 'rate_limit': {
        const key = `${policy.scope}:${policy.scopeTarget ?? 'global'}`;
        const limiter = this.rateLimiters.get(key);
        if (limiter && !limiter.tryAcquire()) {
          return {
            violation: {
              policyId: policy.id,
              policyName: policy.name,
              type: 'rate_limit',
              message: `Rate limit exceeded: ${policy.name}. Available: ${limiter.available}`,
              severity: 'block',
              timestamp: Date.now(),
            },
            reasoning: `Rate limit [${policy.name}] exceeded`,
          };
        }
        return { reasoning: `Rate limit [${policy.name}] check passed` };
      }

      case 'budget': {
        const cost = (action.estimatedCost as number) ?? 0;
        const key = `budget:${policy.id}`;
        const tracker = this.budgetTrackers.get(key) ?? { spent: 0, resetAt: Date.now() + 86400000 };
        
        if (Date.now() > tracker.resetAt) {
          tracker.spent = 0;
          tracker.resetAt = Date.now() + 86400000;
        }

        if (cost > rule.maxCostPerTask) {
          return {
            violation: {
              policyId: policy.id,
              policyName: policy.name,
              type: 'budget',
              message: `Task cost ${cost} exceeds max per-task budget ${rule.maxCostPerTask}`,
              severity: 'block',
              timestamp: Date.now(),
            },
          };
        }

        if (tracker.spent + cost > rule.maxCostPerDay) {
          return {
            violation: {
              policyId: policy.id,
              policyName: policy.name,
              type: 'budget',
              message: `Daily budget would be exceeded: ${tracker.spent + cost}/${rule.maxCostPerDay}`,
              severity: 'block',
              timestamp: Date.now(),
            },
          };
        }

        tracker.spent += cost;
        this.budgetTrackers.set(key, tracker);
        return { reasoning: `Budget check passed: ${tracker.spent}/${rule.maxCostPerDay}` };
      }

      case 'approval_required': {
        return {
          requiresApproval: true,
          approvers: rule.approvers,
          reasoning: `Requires approval from ${rule.minApprovals} of: ${rule.approvers.join(', ')}`,
        };
      }

      case 'blacklist': {
        const actionType = action.type as string;
        const toolId = action.toolId as string;
        if (rule.blocked.includes(actionType) || rule.blocked.includes(toolId)) {
          return {
            violation: {
              policyId: policy.id,
              policyName: policy.name,
              type: 'blacklist',
              message: `Action blocked by policy: ${rule.reason}`,
              severity: 'block',
              timestamp: Date.now(),
            },
          };
        }
        return {};
      }

      case 'time_window': {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        if (!rule.allowedDays.includes(day) || hour < rule.allowedHours.start || hour >= rule.allowedHours.end) {
          return {
            violation: {
              policyId: policy.id,
              policyName: policy.name,
              type: 'time_window',
              message: `Action not allowed outside business hours (${rule.allowedHours.start}-${rule.allowedHours.end})`,
              severity: 'warning',
              timestamp: Date.now(),
            },
          };
        }
        return {};
      }

      case 'risk_limit': {
        const risk = (action.riskScore as number) ?? 0;
        if (risk > rule.maxRiskScore) {
          return {
            violation: {
              policyId: policy.id,
              policyName: policy.name,
              type: 'risk_limit',
              message: `Risk score ${risk} exceeds limit ${rule.maxRiskScore}`,
              severity: risk > rule.maxRiskScore * 1.5 ? 'critical' : 'block',
              timestamp: Date.now(),
            },
            riskContribution: risk - rule.maxRiskScore,
          };
        }
        return { riskContribution: risk * 0.1 };
      }

      default:
        return {};
    }
  }

  /** Emergency kill switch */
  activateKillSwitch(actor: string, reason: string): void {
    this.killSwitch = true;
    this.eventStore.append({
      type: 'governance.kill_switch_activated',
      aggregateId: 'system',
      aggregateType: 'governance',
      payload: { reason, activatedAt: Date.now() },
      actor,
    });
  }

  deactivateKillSwitch(actor: string): void {
    this.killSwitch = false;
    this.eventStore.append({
      type: 'governance.kill_switch_deactivated',
      aggregateId: 'system',
      aggregateType: 'governance',
      payload: { deactivatedAt: Date.now() },
      actor,
    });
  }

  get isKilled(): boolean { return this.killSwitch; }

  getPolicies(): Policy[] {
    return Array.from(this.policies.values());
  }

  getComplianceReport(): {
    totalPolicies: number;
    activePolicies: number;
    killSwitchActive: boolean;
    budgetUtilization: Record<string, { spent: number; limit: number; percent: number }>;
    rateLimitUtilization: Record<string, { available: number }>;
  } {
    const budgetUtilization: Record<string, { spent: number; limit: number; percent: number }> = {};
    for (const [key, tracker] of this.budgetTrackers) {
      const policyId = key.replace('budget:', '');
      const policy = this.policies.get(policyId);
      if (policy && policy.rule.type === 'budget') {
        budgetUtilization[policy.name] = {
          spent: tracker.spent,
          limit: policy.rule.maxCostPerDay,
          percent: (tracker.spent / policy.rule.maxCostPerDay) * 100,
        };
      }
    }

    const rateLimitUtilization: Record<string, { available: number }> = {};
    for (const [key, limiter] of this.rateLimiters) {
      rateLimitUtilization[key] = { available: limiter.available };
    }

    return {
      totalPolicies: this.policies.size,
      activePolicies: Array.from(this.policies.values()).filter(p => p.active).length,
      killSwitchActive: this.killSwitch,
      budgetUtilization,
      rateLimitUtilization,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: KNOWLEDGE GRAPH
// Not a key-value store with "associations". A real entity-relationship
// graph with temporal versioning, semantic search, and inference.
// ═══════════════════════════════════════════════════════════════════════════

interface Entity {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  version: number;
  tags: Set<string>;
  confidence: number;
  source: string;
  history: Array<{
    version: number;
    timestamp: number;
    properties: Record<string, unknown>;
    reason: string;
  }>;
}

interface Relationship {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  properties: Record<string, unknown>;
  weight: number;         // -1.0 to 1.0
  confidence: number;     // 0 to 1
  bidirectional: boolean;
  createdAt: number;
  expiresAt?: number;
}

interface KnowledgeQuery {
  entityType?: string;
  tags?: string[];
  properties?: Record<string, unknown>;
  relatedTo?: string;
  relationshipType?: string;
  minConfidence?: number;
  fullText?: string;
  limit?: number;
}

class KnowledgeGraph {
  private entities: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();        // type → entity IDs
  private tagIndex: Map<string, Set<string>> = new Map();         // tag → entity IDs
  private adjacencyList: Map<string, Set<string>> = new Map();    // entityId → relationship IDs
  private textIndex: Map<string, Set<string>> = new Map();        // word → entity IDs

  constructor(private eventStore: EventStore) {}

  /** Add or update an entity */
  upsertEntity(params: {
    id?: string;
    type: string;
    properties: Record<string, unknown>;
    tags?: string[];
    confidence?: number;
    source?: string;
    reason?: string;
  }): Entity {
    const existing = params.id ? this.entities.get(params.id) : undefined;

    if (existing) {
      // Version the update
      existing.history.push({
        version: existing.version,
        timestamp: existing.updatedAt,
        properties: { ...existing.properties },
        reason: params.reason ?? 'update',
      });
      existing.properties = { ...existing.properties, ...params.properties };
      existing.updatedAt = Date.now();
      existing.version++;
      if (params.confidence !== undefined) existing.confidence = params.confidence;
      if (params.tags) params.tags.forEach(t => existing.tags.add(t));

      this.updateTextIndex(existing);
      this.eventStore.append({
        type: 'knowledge.entity_updated',
        aggregateId: existing.id,
        aggregateType: 'entity',
        payload: { entityId: existing.id, changes: params.properties, version: existing.version },
      });
      return existing;
    }

    const entity: Entity = {
      id: params.id ?? uid('ent'),
      type: params.type,
      properties: { ...params.properties },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      tags: new Set(params.tags ?? []),
      confidence: params.confidence ?? 1.0,
      source: params.source ?? 'system',
      history: [],
    };

    this.entities.set(entity.id, entity);

    // Update indices
    if (!this.typeIndex.has(entity.type)) this.typeIndex.set(entity.type, new Set());
    this.typeIndex.get(entity.type)!.add(entity.id);

    entity.tags.forEach(tag => {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set());
      this.tagIndex.get(tag)!.add(entity.id);
    });

    this.updateTextIndex(entity);

    this.eventStore.append({
      type: 'knowledge.entity_created',
      aggregateId: entity.id,
      aggregateType: 'entity',
      payload: { entityId: entity.id, entityType: entity.type },
    });

    return entity;
  }

  /** Create a relationship between entities */
  relate(params: {
    fromId: string;
    toId: string;
    type: string;
    properties?: Record<string, unknown>;
    weight?: number;
    confidence?: number;
    bidirectional?: boolean;
    expiresAt?: number;
  }): Result<Relationship> {
    if (!this.entities.has(params.fromId)) return Err(new Error(`Entity ${params.fromId} not found`));
    if (!this.entities.has(params.toId)) return Err(new Error(`Entity ${params.toId} not found`));

    const rel: Relationship = {
      id: uid('rel'),
      fromId: params.fromId,
      toId: params.toId,
      type: params.type,
      properties: params.properties ?? {},
      weight: params.weight ?? 1.0,
      confidence: params.confidence ?? 1.0,
      bidirectional: params.bidirectional ?? false,
      createdAt: Date.now(),
      expiresAt: params.expiresAt,
    };

    this.relationships.set(rel.id, rel);

    // Update adjacency
    if (!this.adjacencyList.has(params.fromId)) this.adjacencyList.set(params.fromId, new Set());
    this.adjacencyList.get(params.fromId)!.add(rel.id);
    if (rel.bidirectional) {
      if (!this.adjacencyList.has(params.toId)) this.adjacencyList.set(params.toId, new Set());
      this.adjacencyList.get(params.toId)!.add(rel.id);
    }

    this.eventStore.append({
      type: 'knowledge.relationship_created',
      aggregateId: rel.id,
      aggregateType: 'relationship',
      payload: { fromId: params.fromId, toId: params.toId, relType: params.type },
    });

    return Ok(rel);
  }

  /** Query the knowledge graph */
  query(q: KnowledgeQuery): Entity[] {
    let candidateIds: Set<string> | null = null;

    // Filter by type
    if (q.entityType) {
      candidateIds = new Set(this.typeIndex.get(q.entityType) ?? []);
    }

    // Filter by tags
    if (q.tags?.length) {
      const tagMatches = q.tags
        .map(tag => this.tagIndex.get(tag) ?? new Set<string>())
        .reduce((acc, set) => {
          const intersection = new Set<string>();
          for (const id of acc) if (set.has(id)) intersection.add(id);
          return intersection;
        });
      candidateIds = candidateIds
        ? new Set([...candidateIds].filter(id => tagMatches.has(id)))
        : tagMatches;
    }

    // Filter by relationship
    if (q.relatedTo) {
      const relIds = this.adjacencyList.get(q.relatedTo) ?? new Set();
      const relatedEntityIds = new Set<string>();
      for (const relId of relIds) {
        const rel = this.relationships.get(relId);
        if (!rel) continue;
        if (q.relationshipType && rel.type !== q.relationshipType) continue;
        relatedEntityIds.add(rel.fromId === q.relatedTo ? rel.toId : rel.fromId);
      }
      candidateIds = candidateIds
        ? new Set([...candidateIds].filter(id => relatedEntityIds.has(id)))
        : relatedEntityIds;
    }

    // Full text search
    if (q.fullText) {
      const words = q.fullText.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const textMatches = new Map<string, number>(); // entityId → match count
      for (const word of words) {
        for (const [indexed, entityIds] of this.textIndex) {
          if (indexed.includes(word)) {
            for (const id of entityIds) {
              textMatches.set(id, (textMatches.get(id) ?? 0) + 1);
            }
          }
        }
      }
      const matchingIds = new Set(
        Array.from(textMatches.entries())
          .filter(([_, count]) => count >= Math.min(2, words.length))
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => id)
      );
      candidateIds = candidateIds
        ? new Set([...candidateIds].filter(id => matchingIds.has(id)))
        : matchingIds;
    }

    // Materialize results
    let results: Entity[];
    if (candidateIds) {
      results = Array.from(candidateIds).map(id => this.entities.get(id)!).filter(Boolean);
    } else {
      results = Array.from(this.entities.values());
    }

    // Property filters
    if (q.properties) {
      results = results.filter(e =>
        Object.entries(q.properties!).every(([k, v]) => e.properties[k] === v)
      );
    }

    // Confidence filter
    if (q.minConfidence !== undefined) {
      results = results.filter(e => e.confidence >= q.minConfidence!);
    }

    // Sort by relevance (confidence × recency)
    results.sort((a, b) => {
      const scoreA = a.confidence * (1 + a.updatedAt / Date.now());
      const scoreB = b.confidence * (1 + b.updatedAt / Date.now());
      return scoreB - scoreA;
    });

    return results.slice(0, q.limit ?? 100);
  }

  /** Get all relationships for an entity */
  getRelationships(entityId: string, type?: string): Relationship[] {
    const relIds = this.adjacencyList.get(entityId);
    if (!relIds) return [];
    return Array.from(relIds)
      .map(id => this.relationships.get(id)!)
      .filter(r => r && (!type || r.type === type))
      .filter(r => !r.expiresAt || r.expiresAt > Date.now());
  }

  /** Traverse the graph — BFS from a starting entity */
  traverse(
    startId: string,
    maxDepth: number = 3,
    filter?: { relationshipType?: string; entityType?: string },
  ): Map<string, { entity: Entity; depth: number; path: string[] }> {
    const visited = new Map<string, { entity: Entity; depth: number; path: string[] }>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [{ id: startId, depth: 0, path: [startId] }];

    while (queue.length > 0) {
      const { id, depth, path } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;

      const entity = this.entities.get(id);
      if (!entity) continue;
      if (filter?.entityType && entity.type !== filter.entityType && id !== startId) continue;

      visited.set(id, { entity, depth, path });

      for (const rel of this.getRelationships(id, filter?.relationshipType)) {
        const nextId = rel.fromId === id ? rel.toId : rel.fromId;
        if (!visited.has(nextId)) {
          queue.push({ id: nextId, depth: depth + 1, path: [...path, nextId] });
        }
      }
    }

    return visited;
  }

  /** Infer relationships based on shared properties or transitive relationships */
  inferRelationships(params: {
    minSharedProperties?: number;
    transitiveTypes?: string[];
  }): Relationship[] {
    const inferred: Relationship[] = [];
    const entities = Array.from(this.entities.values());

    // Shared property inference
    if (params.minSharedProperties) {
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const a = entities[i];
          const b = entities[j];
          const sharedKeys = Object.keys(a.properties).filter(k =>
            b.properties[k] !== undefined && a.properties[k] === b.properties[k]
          );
          if (sharedKeys.length >= params.minSharedProperties) {
            const result = this.relate({
              fromId: a.id,
              toId: b.id,
              type: 'inferred:shared_properties',
              properties: { sharedKeys },
              weight: sharedKeys.length / Math.max(Object.keys(a.properties).length, Object.keys(b.properties).length),
              confidence: 0.6,
              bidirectional: true,
            });
            if (result.ok) inferred.push(result.value);
          }
        }
      }
    }

    return inferred;
  }

  private updateTextIndex(entity: Entity): void {
    // Remove old entries
    for (const [word, ids] of this.textIndex) {
      ids.delete(entity.id);
    }

    // Index all text values
    const text = [
      entity.type,
      ...Array.from(entity.tags),
      ...Object.values(entity.properties).filter(v => typeof v === 'string'),
    ].join(' ').toLowerCase();

    const words = text.split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      if (!this.textIndex.has(word)) this.textIndex.set(word, new Set());
      this.textIndex.get(word)!.add(entity.id);
    }
  }

  get stats() {
    return {
      entities: this.entities.size,
      relationships: this.relationships.size,
      types: Array.from(this.typeIndex.keys()),
      tags: Array.from(this.tagIndex.keys()),
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: TOOL REGISTRY — Plugin System for External Integrations
// Every external interaction goes through a registered, governed, metered
// tool. No direct HTTP calls, no raw database access.
// ═══════════════════════════════════════════════════════════════════════════

interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'http' | 'database' | 'filesystem' | 'ai' | 'queue' | 'notification' | 'custom';
  version: string;
  inputSchema: Record<string, { type: string; required: boolean; description: string }>;
  outputSchema: Record<string, { type: string; description: string }>;
  costPerInvocation: number;
  riskScore: number;          // 0-1 inherent risk
  circuitBreaker: CircuitBreaker;
  rateLimiter: RateLimiter;
  timeout: number;            // ms
  retryable: boolean;
  handler: (input: Record<string, unknown>, context: ToolContext) => Promise<Record<string, unknown>>;
  healthCheck?: () => Promise<boolean>;
}

interface ToolContext {
  correlationId: string;
  agentId: string;
  taskId: string;
  attempt: number;
  deadline: number;
}

interface ToolInvocation {
  id: string;
  toolId: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  cost: number;
  context: ToolContext;
  success: boolean;
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private invocationLog: ToolInvocation[] = [];
  private backoff = new BackoffCalculator();

  constructor(
    private eventStore: EventStore,
    private governor: Governor,
  ) {}

  /** Register a tool — must have explicit schema and governance metadata */
  register(tool: Omit<ToolDefinition, 'circuitBreaker' | 'rateLimiter'> & {
    maxPerMinute?: number;
    failureThreshold?: number;
    recoveryTimeMs?: number;
  }): void {
    const fullTool: ToolDefinition = {
      ...tool,
      circuitBreaker: new CircuitBreaker(
        tool.id,
        tool.failureThreshold ?? 5,
        tool.recoveryTimeMs ?? 30000,
      ),
      rateLimiter: new RateLimiter(
        tool.maxPerMinute ?? 60,
        (tool.maxPerMinute ?? 60) / 60,
      ),
    };
    this.tools.set(tool.id, fullTool);

    this.eventStore.append({
      type: 'tool.registered',
      aggregateId: tool.id,
      aggregateType: 'tool',
      payload: { toolId: tool.id, name: tool.name, category: tool.category },
    });
  }

  /** Invoke a tool — goes through governance, circuit breaker, rate limiter, retry */
  async invoke(
    toolId: string,
    input: Record<string, unknown>,
    context: Omit<ToolContext, 'attempt'>,
  ): Promise<Result<Record<string, unknown>>> {
    const tool = this.tools.get(toolId);
    if (!tool) return Err(new Error(`Tool [${toolId}] not found`));

    // 1. Governance check
    const decision = this.governor.evaluate({
      type: 'tool_invocation',
      toolId: tool.id,
      estimatedCost: tool.costPerInvocation,
      riskScore: tool.riskScore,
    });

    if (!decision.allowed) {
      this.eventStore.append({
        type: 'tool.invocation_blocked',
        aggregateId: toolId,
        aggregateType: 'tool',
        payload: { reason: decision.violations.map(v => v.message).join('; ') },
        source: context.agentId,
      });
      return Err(new Error(`Tool invocation blocked: ${decision.violations.map(v => v.message).join('; ')}`));
    }

    // 2. Rate limit check
    if (!tool.rateLimiter.tryAcquire()) {
      return Err(new Error(`Rate limit exceeded for tool [${tool.name}]`));
    }

    // 3. Input validation
    const validationError = this.validateInput(tool, input);
    if (validationError) return Err(new Error(`Input validation failed: ${validationError}`));

    // 4. Execute with circuit breaker and retry
    const maxAttempts = tool.retryable ? 3 : 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const invocation: ToolInvocation = {
        id: uid('inv'),
        toolId,
        input,
        startedAt: Date.now(),
        cost: tool.costPerInvocation,
        context: { ...context, attempt },
        success: false,
      };

      const result = await tool.circuitBreaker.execute(async () => {
        // Timeout wrapper
        return Promise.race([
          tool.handler(input, { ...context, attempt }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool [${tool.name}] timed out after ${tool.timeout}ms`)), tool.timeout)
          ),
        ]);
      });

      invocation.completedAt = Date.now();
      invocation.durationMs = invocation.completedAt - invocation.startedAt;

      if (result.ok) {
        invocation.success = true;
        invocation.output = result.value;
        this.invocationLog.push(invocation);

        this.eventStore.append({
          type: 'tool.invocation_success',
          aggregateId: toolId,
          aggregateType: 'tool',
          payload: {
            invocationId: invocation.id,
            durationMs: invocation.durationMs,
            attempt,
          },
          source: context.agentId,
          correlationId: context.correlationId,
        });

        return Ok(result.value);
      }

      // Failed
      lastError = result.error;
      invocation.error = result.error.message;
      this.invocationLog.push(invocation);

      this.eventStore.append({
        type: 'tool.invocation_failed',
        aggregateId: toolId,
        aggregateType: 'tool',
        payload: {
          invocationId: invocation.id,
          error: result.error.message,
          attempt,
          willRetry: attempt < maxAttempts && tool.retryable,
        },
        source: context.agentId,
        correlationId: context.correlationId,
      });

      if (attempt < maxAttempts && tool.retryable) {
        const delay = this.backoff.calculate(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return Err(lastError ?? new Error('Unknown error'));
  }

  private validateInput(tool: ToolDefinition, input: Record<string, unknown>): string | null {
    for (const [key, schema] of Object.entries(tool.inputSchema)) {
      if (schema.required && !(key in input)) {
        return `Missing required field: ${key}`;
      }
      if (key in input) {
        const actualType = typeof input[key];
        if (schema.type === 'number' && actualType !== 'number') return `${key} must be a number`;
        if (schema.type === 'string' && actualType !== 'string') return `${key} must be a string`;
        if (schema.type === 'boolean' && actualType !== 'boolean') return `${key} must be a boolean`;
        if (schema.type === 'array' && !Array.isArray(input[key])) return `${key} must be an array`;
      }
    }
    return null;
  }

  /** Health check all tools */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [id, tool] of this.tools) {
      if (tool.healthCheck) {
        try {
          results.set(id, await tool.healthCheck());
        } catch {
          results.set(id, false);
        }
      } else {
        results.set(id, tool.circuitBreaker.currentState !== CircuitState.OPEN);
      }
    }
    return results;
  }

  getTool(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  listTools(): Array<{ id: string; name: string; category: string; circuitState: string }> {
    return Array.from(this.tools.values()).map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      circuitState: CircuitState[t.circuitBreaker.currentState],
    }));
  }

  getInvocationStats(toolId?: string): {
    total: number;
    successful: number;
    failed: number;
    avgDurationMs: number;
    totalCost: number;
    p95DurationMs: number;
  } {
    const invocations = toolId
      ? this.invocationLog.filter(i => i.toolId === toolId)
      : this.invocationLog;

    const successful = invocations.filter(i => i.success);
    const durations = successful.map(i => i.durationMs ?? 0).sort((a, b) => a - b);

    return {
      total: invocations.length,
      successful: successful.length,
      failed: invocations.length - successful.length,
      avgDurationMs: durations.length > 0 ? durations.reduce((s, d) => s + d, 0) / durations.length : 0,
      totalCost: invocations.reduce((s, i) => s + i.cost, 0),
      p95DurationMs: durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: AGENT RUNTIME
// An agent is not an object with a performanceScore field.
// An agent is a supervised execution context with its own governance
// boundary, circuit breaker, capability set, and audit trail.
// ═══════════════════════════════════════════════════════════════════════════

interface AgentManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  department: string;
  capabilities: string[];         // Tool IDs this agent can use
  autonomyLevel: number;          // 0-10
  maxConcurrentTasks: number;
  budgetPerDay: number;           // Cost units
  riskTolerance: number;          // 0-1
  escalationTarget: string | null;
  schedule?: {
    expression: string;           // cron
    timezone: string;
  };
  directives: string[];           // Natural language instructions
  constraints: string[];          // Hard rules
}

interface AgentState {
  status: 'initializing' | 'idle' | 'busy' | 'degraded' | 'suspended' | 'terminated';
  activeTasks: Map<string, { taskId: string; startedAt: number }>;
  metrics: {
    tasksCompleted: number;
    tasksFailed: number;
    totalCostConsumed: number;
    avgResponseTimeMs: number;
    lastActivityAt: number;
    uptimeMs: number;
    circuitBreakerTrips: number;
  };
  health: {
    consecutive_failures: number;
    last_error: string | null;
    last_success_at: number | null;
    degradation_reason: string | null;
  };
}

class AgentRuntime {
  readonly id: string;
  private state: AgentState;
  private circuitBreaker: CircuitBreaker;
  private workerPool: WorkerPool;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private startedAt: number;

  constructor(
    readonly manifest: AgentManifest,
    private eventStore: EventStore,
    private governor: Governor,
    private toolRegistry: ToolRegistry,
    private knowledgeGraph: KnowledgeGraph,
  ) {
    this.id = manifest.id;
    this.startedAt = Date.now();
    this.circuitBreaker = new CircuitBreaker(
      `agent:${manifest.id}`,
      manifest.maxConcurrentTasks * 2,  // Trip after 2x max concurrent failures
      30000,
    );
    this.workerPool = new WorkerPool(manifest.maxConcurrentTasks);
    this.state = {
      status: 'initializing',
      activeTasks: new Map(),
      metrics: {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalCostConsumed: 0,
        avgResponseTimeMs: 0,
        lastActivityAt: Date.now(),
        uptimeMs: 0,
        circuitBreakerTrips: 0,
      },
      health: {
        consecutive_failures: 0,
        last_error: null,
        last_success_at: null,
        degradation_reason: null,
      },
    };
  }

  /** Start the agent runtime */
  start(): void {
    this.state.status = 'idle';
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 10000);

    this.eventStore.append({
      type: 'agent.started',
      aggregateId: this.id,
      aggregateType: 'agent',
      payload: { name: this.manifest.name, capabilities: this.manifest.capabilities },
      actor: this.id,
    });

    // Register in knowledge graph
    this.knowledgeGraph.upsertEntity({
      id: this.id,
      type: 'agent',
      properties: {
        name: this.manifest.name,
        department: this.manifest.department,
        autonomyLevel: this.manifest.autonomyLevel,
        status: 'active',
      },
      tags: ['agent', this.manifest.department],
      source: 'agent_runtime',
    });
  }

  /** Execute a task within this agent's governance boundary */
  async executeTask(task: {
    id: string;
    type: string;
    input: Record<string, unknown>;
    tools: string[];
    correlationId: string;
    deadline?: number;
  }): Promise<Result<Record<string, unknown>>> {
    // Pre-flight checks
    if (this.state.status === 'suspended' || this.state.status === 'terminated') {
      return Err(new Error(`Agent [${this.manifest.name}] is ${this.state.status}`));
    }

    // Governance check
    const decision = this.governor.evaluate({
      type: 'task_execution',
      agentId: this.id,
      department: this.manifest.department,
      taskType: task.type,
    });

    if (!decision.allowed) {
      this.eventStore.append({
        type: 'agent.task_blocked',
        aggregateId: this.id,
        aggregateType: 'agent',
        payload: { taskId: task.id, violations: decision.violations },
        actor: this.id,
      });
      return Err(new Error(`Task blocked by governance: ${decision.violations.map(v => v.message).join('; ')}`));
    }

    // Execute within worker pool (backpressure)
    return this.workerPool.submit(async () => {
      this.state.activeTasks.set(task.id, { taskId: task.id, startedAt: Date.now() });
      this.state.status = 'busy';
      this.state.metrics.lastActivityAt = Date.now();

      this.eventStore.append({
        type: 'agent.task_started',
        aggregateId: this.id,
        aggregateType: 'agent',
        payload: { taskId: task.id, taskType: task.type },
        actor: this.id,
        correlationId: task.correlationId,
      });

      try {
        // Execute through circuit breaker
        const result = await this.circuitBreaker.execute(async () => {
          return this.runTaskLogic(task);
        });

        if (result.ok) {
          this.onTaskSuccess(task.id, result.value);
          return Ok(result.value);
        } else {
          this.onTaskFailure(task.id, result.error.message);
          return Err(result.error);
        }
      } catch (error: any) {
        this.onTaskFailure(task.id, error.message);
        return Err(error);
      } finally {
        this.state.activeTasks.delete(task.id);
        if (this.state.activeTasks.size === 0) {
          this.state.status = this.state.health.consecutive_failures > 3 ? 'degraded' : 'idle';
        }
      }
    });
  }

  private async runTaskLogic(task: {
    id: string;
    type: string;
    input: Record<string, unknown>;
    tools: string[];
    correlationId: string;
    deadline?: number;
  }): Promise<Record<string, unknown>> {
    // 1. Gather context from knowledge graph
    const relatedKnowledge = this.knowledgeGraph.query({
      fullText: task.type,
      limit: 5,
      minConfidence: 0.5,
    });

    // 2. Execute tool chain
    const results: Record<string, unknown> = {};
    for (const toolId of task.tools) {
      // Check capability
      if (!this.manifest.capabilities.includes(toolId)) {
        throw new Error(`Agent [${this.manifest.name}] lacks capability for tool [${toolId}]`);
      }

      const toolResult = await this.toolRegistry.invoke(toolId, task.input, {
        correlationId: task.correlationId,
        agentId: this.id,
        taskId: task.id,
        deadline: task.deadline ?? Date.now() + 300000,
      });

      if (!toolResult.ok) {
        throw toolResult.error;
      }

      results[toolId] = toolResult.value;
    }

    // 3. Store results in knowledge graph
    this.knowledgeGraph.upsertEntity({
      type: 'task_result',
      properties: {
        taskId: task.id,
        taskType: task.type,
        agentId: this.id,
        results,
        completedAt: Date.now(),
      },
      tags: ['task_result', task.type],
      source: this.id,
    });

    return results;
  }

  private onTaskSuccess(taskId: string, output: unknown): void {
    this.state.metrics.tasksCompleted++;
    this.state.health.consecutive_failures = 0;
    this.state.health.last_success_at = Date.now();
    this.state.health.last_error = null;

    this.eventStore.append({
      type: 'agent.task_completed',
      aggregateId: this.id,
      aggregateType: 'agent',
      payload: { taskId, success: true },
      actor: this.id,
    });
  }

  private onTaskFailure(taskId: string, error: string): void {
    this.state.metrics.tasksFailed++;
    this.state.health.consecutive_failures++;
    this.state.health.last_error = error;

    if (this.state.health.consecutive_failures >= this.manifest.maxConcurrentTasks) {
      this.state.status = 'degraded';
      this.state.health.degradation_reason = `${this.state.health.consecutive_failures} consecutive failures`;

      this.eventStore.append({
        type: 'agent.degraded',
        aggregateId: this.id,
        aggregateType: 'agent',
        payload: {
          reason: this.state.health.degradation_reason,
          consecutiveFailures: this.state.health.consecutive_failures,
        },
        actor: this.id,
      });
    }

    this.eventStore.append({
      type: 'agent.task_failed',
      aggregateId: this.id,
      aggregateType: 'agent',
      payload: { taskId, error },
      actor: this.id,
    });
  }

  private heartbeat(): void {
    this.state.metrics.uptimeMs = Date.now() - this.startedAt;

    this.eventStore.append({
      type: 'agent.heartbeat',
      aggregateId: this.id,
      aggregateType: 'agent',
      payload: {
        status: this.state.status,
        activeTasks: this.state.activeTasks.size,
        poolUtilization: this.workerPool.utilization,
        metrics: { ...this.state.metrics },
        health: { ...this.state.health },
        circuitBreaker: this.circuitBreaker.stats,
      },
      actor: this.id,
    });
  }

  suspend(reason: string, actor: string): void {
    this.state.status = 'suspended';
    this.eventStore.append({
      type: 'agent.suspended',
      aggregateId: this.id,
      aggregateType: 'agent',
      payload: { reason },
      actor,
    });
  }

  resume(actor: string): void {
    if (this.state.status === 'suspended') {
      this.state.status = 'idle';
      this.state.health.consecutive_failures = 0;
      this.eventStore.append({
        type: 'agent.resumed',
        aggregateId: this.id,
        aggregateType: 'agent',
        payload: {},
        actor,
      });
    }
  }

  terminate(actor: string): void {
    this.state.status = 'terminated';
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.eventStore.append({
      type: 'agent.terminated',
      aggregateId: this.id,
      aggregateType: 'agent',
      payload: { finalMetrics: { ...this.state.metrics } },
      actor,
    });
  }

  getState(): Readonly<AgentState> {
    return Object.freeze({ ...this.state });
  }

  getFullReport() {
    return {
      manifest: this.manifest,
      state: this.getState(),
      circuitBreaker: this.circuitBreaker.stats,
      poolUtilization: this.workerPool.utilization,
      poolPending: this.workerPool.pending,
      uptimeMs: Date.now() - this.startedAt,
      successRate: this.state.metrics.tasksCompleted + this.state.metrics.tasksFailed > 0
        ? this.state.metrics.tasksCompleted / (this.state.metrics.tasksCompleted + this.state.metrics.tasksFailed)
        : 1,
    };
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: DAG ORCHESTRATOR
// Not a FIFO queue. A directed acyclic graph executor that understands
// dependencies, parallelism, and failure propagation.
// ═══════════════════════════════════════════════════════════════════════════

interface DAGNode {
  id: string;
  taskType: string;
  input: Record<string, unknown>;
  tools: string[];
  agentSelector: (agents: AgentRuntime[]) => AgentRuntime | null;
  dependencies: string[];     // Node IDs that must complete first
  timeout: number;
  retryPolicy: { maxRetries: number; backoff: BackoffCalculator };
  onSuccess?: (output: Record<string, unknown>) => void;
  onFailure?: (error: Error) => void;
}

interface DAGExecution {
  id: string;
  dagId: string;
  nodes: Map<string, {
    node: DAGNode;
    status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';
    output?: Record<string, unknown>;
    error?: string;
    assignedAgent?: string;
    startedAt?: number;
    completedAt?: number;
    retryCount: number;
  }>;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  correlationId: string;
}

class DAGOrchestrator {
  private agents: Map<string, AgentRuntime> = new Map();
  private executions: Map<string, DAGExecution> = new Map();
  private dagDefinitions: Map<string, DAGNode[]> = new Map();

  constructor(
    private eventStore: EventStore,
    private governor: Governor,
  ) {}

  registerAgent(agent: AgentRuntime): void {
    this.agents.set(agent.id, agent);
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /** Define a DAG (reusable workflow template) */
  defineDAG(dagId: string, nodes: DAGNode[]): Result<void> {
    // Validate: no cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return false;
      for (const dep of node.dependencies) {
        if (!visited.has(dep)) {
          if (hasCycle(dep)) return true;
        } else if (recursionStack.has(dep)) {
          return true;
        }
      }
      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id) && hasCycle(node.id)) {
        return Err(new Error(`Cycle detected in DAG [${dagId}] involving node [${node.id}]`));
      }
    }

    this.dagDefinitions.set(dagId, nodes);
    this.eventStore.append({
      type: 'dag.defined',
      aggregateId: dagId,
      aggregateType: 'dag',
      payload: { dagId, nodeCount: nodes.length },
    });
    return Ok(undefined);
  }

  /** Execute a DAG — resolve dependencies, execute in parallel where possible */
  async executeDAG(dagId: string, inputOverrides?: Record<string, unknown>): Promise<Result<DAGExecution>> {
    const nodes = this.dagDefinitions.get(dagId);
    if (!nodes) return Err(new Error(`DAG [${dagId}] not found`));

    // Governance check
    const decision = this.governor.evaluate({
      type: 'dag_execution',
      taskType: dagId,
    });
    if (!decision.allowed) {
      return Err(new Error(`DAG execution blocked: ${decision.violations.map(v => v.message).join('; ')}`));
    }

    const correlationId = uid('dag_exec');
    const execution: DAGExecution = {
      id: uid('exec'),
      dagId,
      nodes: new Map(),
      status: 'running',
      startedAt: Date.now(),
      correlationId,
    };

    // Initialize node states
    for (const node of nodes) {
      execution.nodes.set(node.id, {
        node: { ...node, input: { ...node.input, ...inputOverrides } },
        status: node.dependencies.length === 0 ? 'ready' : 'pending',
        retryCount: 0,
      });
    }

    this.executions.set(execution.id, execution);

    this.eventStore.append({
      type: 'dag.execution_started',
      aggregateId: execution.id,
      aggregateType: 'dag_execution',
      payload: { dagId, totalNodes: nodes.length },
      correlationId,
    });

    // Execute the DAG
    await this.runDAG(execution);

    return Ok(execution);
  }

  private async runDAG(execution: DAGExecution): Promise<void> {
    while (true) {
      // Find ready nodes
      const readyNodes = Array.from(execution.nodes.entries())
        .filter(([_, state]) => state.status === 'ready');

      if (readyNodes.length === 0) {
        // Check if we're done or stuck
        const hasRunning = Array.from(execution.nodes.values()).some(s => s.status === 'running');
        if (!hasRunning) {
          // All done or failed
          const hasFailed = Array.from(execution.nodes.values()).some(s => s.status === 'failed');
          execution.status = hasFailed ? 'failed' : 'completed';
          execution.completedAt = Date.now();
          break;
        }
        // Wait for running tasks to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Execute all ready nodes in parallel
      const promises = readyNodes.map(([nodeId, state]) =>
        this.executeNode(execution, nodeId, state)
      );

      await Promise.allSettled(promises);

      // Update dependency status — mark newly ready nodes
      for (const [nodeId, state] of execution.nodes) {
        if (state.status === 'pending') {
          const allDepsCompleted = state.node.dependencies.every(depId => {
            const dep = execution.nodes.get(depId);
            return dep?.status === 'completed';
          });
          const anyDepFailed = state.node.dependencies.some(depId => {
            const dep = execution.nodes.get(depId);
            return dep?.status === 'failed';
          });

          if (anyDepFailed) {
            state.status = 'skipped';
          } else if (allDepsCompleted) {
            state.status = 'ready';
          }
        }
      }
    }

    this.eventStore.append({
      type: `dag.execution_${execution.status}`,
      aggregateId: execution.id,
      aggregateType: 'dag_execution',
      payload: {
        duration: (execution.completedAt ?? Date.now()) - execution.startedAt,
        nodeResults: Object.fromEntries(
          Array.from(execution.nodes.entries()).map(([id, s]) => [id, s.status])
        ),
      },
      correlationId: execution.correlationId,
    });
  }

  private async executeNode(
    execution: DAGExecution,
    nodeId: string,
    state: DAGExecution['nodes'] extends Map<string, infer V> ? V : never,
  ): Promise<void> {
    state.status = 'running';
    state.startedAt = Date.now();

    // Collect outputs from dependencies as input
    const depOutputs: Record<string, unknown> = {};
    for (const depId of state.node.dependencies) {
      const dep = execution.nodes.get(depId);
      if (dep?.output) {
        depOutputs[depId] = dep.output;
      }
    }

    const mergedInput = { ...state.node.input, _dependencies: depOutputs };

    // Find agent
    const availableAgents = Array.from(this.agents.values());
    const agent = state.node.agentSelector(availableAgents);
    if (!agent) {
      state.status = 'failed';
      state.error = 'No suitable agent available';
      return;
    }

    state.assignedAgent = agent.id;

    // Execute
    const result = await agent.executeTask({
      id: uid('task'),
      type: state.node.taskType,
      input: mergedInput,
      tools: state.node.tools,
      correlationId: execution.correlationId,
      deadline: Date.now() + state.node.timeout,
    });

    if (result.ok) {
      state.status = 'completed';
      state.output = result.value;
      state.completedAt = Date.now();
      state.node.onSuccess?.(result.value);
    } else {
      // Retry logic
      if (state.retryCount < state.node.retryPolicy.maxRetries) {
        state.retryCount++;
        const delay = state.node.retryPolicy.backoff.calculate(state.retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        state.status = 'ready'; // Will be picked up in next iteration
      } else {
        state.status = 'failed';
        state.error = result.error.message;
        state.completedAt = Date.now();
        state.node.onFailure?.(result.error);
      }
    }
  }

  getExecution(executionId: string): DAGExecution | undefined {
    return this.executions.get(executionId);
  }

  cancelExecution(executionId: string, actor: string): void {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'cancelled';
      execution.completedAt = Date.now();
      // Cancel running nodes
      for (const [_, state] of execution.nodes) {
        if (state.status === 'running' || state.status === 'ready' || state.status === 'pending') {
          state.status = 'skipped';
        }
      }
      this.eventStore.append({
        type: 'dag.execution_cancelled',
        aggregateId: executionId,
        aggregateType: 'dag_execution',
        payload: { cancelledBy: actor },
        actor,
      });
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: HTTP API SERVER
// RESTful API for external integration. No frontend needed to operate.
// ═══════════════════════════════════════════════════════════════════════════

class APIServer {
  private server: http.Server | null = null;

  constructor(
    private eventStore: EventStore,
    private governor: Governor,
    private toolRegistry: ToolRegistry,
    private knowledgeGraph: KnowledgeGraph,
    private orchestrator: DAGOrchestrator,
    private agents: Map<string, AgentRuntime>,
  ) {}

  start(port: number = 3100): void {
    this.server = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        const body = req.method !== 'GET' ? await this.readBody(req) : {};
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const response = await this.route(req.method ?? 'GET', url.pathname, body, url.searchParams);
        res.writeHead(response.status);
        res.end(JSON.stringify(response.body, null, 2));
      } catch (error: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });

    this.server.listen(port, () => {
      console.log(`\n🌐 ONYX API Server running on port ${port}`);
    });
  }

  private async route(
    method: string,
    path: string,
    body: Record<string, unknown>,
    params: URLSearchParams,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    // System status
    if (method === 'GET' && path === '/api/status') {
      return {
        status: 200,
        body: {
          engine: 'ONYX AI',
          version: '2.0.0',
          status: this.governor.isKilled ? 'KILLED' : 'OPERATIONAL',
          agents: Array.from(this.agents.values()).map(a => a.getFullReport()),
          tools: this.toolRegistry.listTools(),
          knowledge: this.knowledgeGraph.stats,
          events: this.eventStore.size,
          compliance: this.governor.getComplianceReport(),
        },
      };
    }

    // Event stream
    if (method === 'GET' && path === '/api/events') {
      const limit = parseInt(params.get('limit') ?? '50');
      const type = params.get('type') ?? undefined;
      return {
        status: 200,
        body: {
          events: this.eventStore.query({
            types: type ? [type] : undefined,
            limit,
          }),
        },
      };
    }

    // Audit report
    if (method === 'GET' && path === '/api/audit') {
      return {
        status: 200,
        body: this.eventStore.auditReport({
          since: parseInt(params.get('since') ?? '0') || undefined,
        }),
      };
    }

    // Knowledge graph
    if (method === 'POST' && path === '/api/knowledge/query') {
      return {
        status: 200,
        body: {
          results: this.knowledgeGraph.query(body as KnowledgeQuery),
        },
      };
    }

    if (method === 'POST' && path === '/api/knowledge/entity') {
      const entity = this.knowledgeGraph.upsertEntity(body as any);
      return { status: 201, body: { entity } };
    }

    // Kill switch
    if (method === 'POST' && path === '/api/kill') {
      this.governor.activateKillSwitch(
        (body.actor as string) ?? 'api',
        (body.reason as string) ?? 'API kill switch activated',
      );
      return { status: 200, body: { killed: true } };
    }

    if (method === 'POST' && path === '/api/resume') {
      this.governor.deactivateKillSwitch((body.actor as string) ?? 'api');
      return { status: 200, body: { killed: false } };
    }

    // Agent control
    if (method === 'POST' && path.startsWith('/api/agent/') && path.endsWith('/suspend')) {
      const agentId = path.split('/')[3];
      const agent = this.agents.get(agentId);
      if (!agent) return { status: 404, body: { error: 'Agent not found' } };
      agent.suspend((body.reason as string) ?? 'API suspension', 'api');
      return { status: 200, body: { suspended: true } };
    }

    // Integrity check
    if (method === 'GET' && path === '/api/integrity') {
      const result = this.eventStore.verifyIntegrity();
      return {
        status: result.ok ? 200 : 500,
        body: {
          valid: result.ok ? result.value : false,
          error: !result.ok ? result.error.message : undefined,
        },
      };
    }

    return { status: 404, body: { error: 'Not found' } };
  }

  private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try { resolve(data ? JSON.parse(data) : {}); }
        catch { reject(new Error('Invalid JSON body')); }
      });
      req.on('error', reject);
    });
  }

  stop(): void {
    this.server?.close();
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: ONYX PLATFORM — The Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════

export class OnyxPlatform {
  readonly eventStore: EventStore;
  readonly governor: Governor;
  readonly knowledgeGraph: KnowledgeGraph;
  readonly toolRegistry: ToolRegistry;
  readonly orchestrator: DAGOrchestrator;
  readonly agents: Map<string, AgentRuntime> = new Map();
  private apiServer: APIServer;
  private clock = new MonotonicClock();
  private started = false;

  constructor(config?: {
    persistPath?: string;
    apiPort?: number;
  }) {
    // Bootstrap in dependency order
    this.eventStore = new EventStore({
      persistPath: config?.persistPath,
      flushIntervalMs: 5000,
    });
    this.governor = new Governor(this.eventStore);
    this.knowledgeGraph = new KnowledgeGraph(this.eventStore);
    this.toolRegistry = new ToolRegistry(this.eventStore, this.governor);
    this.orchestrator = new DAGOrchestrator(this.eventStore, this.governor);
    this.apiServer = new APIServer(
      this.eventStore, this.governor, this.toolRegistry,
      this.knowledgeGraph, this.orchestrator, this.agents,
    );

    this.eventStore.append({
      type: 'platform.initialized',
      aggregateId: 'onyx',
      aggregateType: 'platform',
      payload: { version: '2.0.0', timestamp: this.clock.now() },
    });
  }

  /** Start the platform */
  start(options?: { apiPort?: number }): void {
    if (this.started) return;
    this.started = true;

    // Start all agents
    for (const agent of this.agents.values()) {
      agent.start();
    }

    // Start API server
    this.apiServer.start(options?.apiPort ?? 3100);

    this.eventStore.append({
      type: 'platform.started',
      aggregateId: 'onyx',
      aggregateType: 'platform',
      payload: {
        agents: this.agents.size,
        tools: this.toolRegistry.listTools().length,
        policies: this.governor.getPolicies().length,
      },
    });

    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ██████╗ ███╗   ██╗██╗   ██╗██╗  ██╗                      ║
║  ██╔═══██╗████╗  ██║╚██╗ ██╔╝╚██╗██╔╝                      ║
║  ██║   ██║██╔██╗ ██║ ╚████╔╝  ╚███╔╝                       ║
║  ██║   ██║██║╚██╗██║  ╚██╔╝   ██╔██╗                       ║
║  ╚██████╔╝██║ ╚████║   ██║   ██╔╝ ██╗                      ║
║   ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝                      ║
║                                                              ║
║   ONYX AI Platform v2.0.0                                    ║
║   Institutional-Grade Autonomous Operations                  ║
║                                                              ║
║   Agents: ${String(this.agents.size).padEnd(5)}                                       ║
║   Tools:  ${String(this.toolRegistry.listTools().length).padEnd(5)}                                       ║
║   Policies: ${String(this.governor.getPolicies().length).padEnd(5)}                                     ║
║   Event Store: Tamper-evident hash chain                     ║
║   Governance: Active                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  }

  /** Register an agent */
  addAgent(manifest: AgentManifest): AgentRuntime {
    const agent = new AgentRuntime(
      manifest,
      this.eventStore,
      this.governor,
      this.toolRegistry,
      this.knowledgeGraph,
    );
    this.agents.set(agent.id, agent);
    this.orchestrator.registerAgent(agent);
    if (this.started) agent.start();
    return agent;
  }

  /** Register a tool */
  addTool(tool: Parameters<ToolRegistry['register']>[0]): void {
    this.toolRegistry.register(tool);
  }

  /** Add a governance policy */
  addPolicy(policy: Parameters<Governor['addPolicy']>[0]): Policy {
    return this.governor.addPolicy(policy);
  }

  /** Define a workflow DAG */
  defineWorkflow(id: string, nodes: DAGNode[]): Result<void> {
    return this.orchestrator.defineDAG(id, nodes);
  }

  /** Execute a workflow */
  async runWorkflow(id: string, input?: Record<string, unknown>): Promise<Result<DAGExecution>> {
    return this.orchestrator.executeDAG(id, input);
  }

  /** Emergency shutdown */
  kill(actor: string, reason: string): void {
    this.governor.activateKillSwitch(actor, reason);
    for (const agent of this.agents.values()) {
      agent.suspend('Emergency kill switch', actor);
    }
  }

  /** Full system report */
  report() {
    return {
      platform: { version: '2.0.0', uptime: this.clock.now() },
      governance: this.governor.getComplianceReport(),
      agents: Array.from(this.agents.values()).map(a => a.getFullReport()),
      tools: {
        registered: this.toolRegistry.listTools(),
        invocationStats: this.toolRegistry.getInvocationStats(),
      },
      knowledge: this.knowledgeGraph.stats,
      eventStore: {
        totalEvents: this.eventStore.size,
        auditReport: this.eventStore.auditReport({}),
      },
    };
  }

  shutdown(): void {
    for (const agent of this.agents.values()) {
      agent.terminate('platform');
    }
    this.apiServer.stop();
    this.eventStore.shutdown();

    this.eventStore.append({
      type: 'platform.shutdown',
      aggregateId: 'onyx',
      aggregateType: 'platform',
      payload: { shutdownAt: Date.now() },
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: EXPORT & USAGE EXAMPLE
// ═══════════════════════════════════════════════════════════════════════════

export {
  EventStore,
  Governor,
  KnowledgeGraph,
  ToolRegistry,
  AgentRuntime,
  DAGOrchestrator,
  CircuitBreaker,
  RateLimiter,
  WorkerPool,
  BackoffCalculator,
  Ok,
  Err,
  uid,
};

export type {
  DomainEvent,
  Policy,
  PolicyRule,
  GovernanceDecision,
  Entity,
  Relationship,
  AgentManifest,
  AgentState,
  ToolDefinition,
  DAGNode,
  DAGExecution,
  Result,
};

/**
 * USAGE:
 *
 * const onyx = new OnyxPlatform({ persistPath: './data/events.json' });
 *
 * // 1. Add governance policies FIRST — nothing works without governance
 * onyx.addPolicy({
 *   name: 'API Budget',
 *   description: 'Limit daily API spending',
 *   type: 'budget',
 *   scope: 'global',
 *   rule: { type: 'budget', maxCostPerTask: 10, maxCostPerDay: 1000, currency: 'USD', currentSpent: 0 },
 *   active: true,
 *   priority: 100,
 *   createdBy: 'kobi',
 * });
 *
 * // 2. Register tools
 * onyx.addTool({
 *   id: 'http_fetch',
 *   name: 'HTTP Fetch',
 *   description: 'Fetch data from HTTP endpoints',
 *   category: 'http',
 *   version: '1.0',
 *   inputSchema: { url: { type: 'string', required: true, description: 'URL to fetch' } },
 *   outputSchema: { body: { type: 'string', description: 'Response body' } },
 *   costPerInvocation: 0.01,
 *   riskScore: 0.2,
 *   timeout: 30000,
 *   retryable: true,
 *   handler: async (input) => {
 *     const res = await fetch(input.url as string);
 *     return { body: await res.text(), status: res.status };
 *   },
 * });
 *
 * // 3. Add agents
 * onyx.addAgent({
 *   id: 'agent_analyst',
 *   name: 'Data Analyst',
 *   version: '1.0',
 *   description: 'Analyzes data and generates reports',
 *   department: 'analytics',
 *   capabilities: ['http_fetch'],
 *   autonomyLevel: 7,
 *   maxConcurrentTasks: 5,
 *   budgetPerDay: 100,
 *   riskTolerance: 0.3,
 *   escalationTarget: null,
 *   directives: ['Focus on actionable insights', 'Always cite data sources'],
 *   constraints: ['Never access external APIs without governance approval'],
 * });
 *
 * // 4. Define workflows
 * onyx.defineWorkflow('daily_report', [ ... ]);
 *
 * // 5. Start
 * onyx.start({ apiPort: 3100 });
 */
