/**
 * useDataPlatform — React hooks for the Data Platform Core.
 */

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

const API = "/api/platform";

// ────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────
export interface PlatformSnapshot {
  generatedAt: string;
  totalCanonical: number;
  totalObjects: number;
  totalLiveStates: number;
  atRiskEntities: number;
  blockedEntities: number;
  freshEntities: number;
  stateBreakdown: Record<string, number>;
  eventsTotal: number;
  pipelineHealth: Record<string, {
    acceptedRecords: number;
    quarantinedRecords: number;
    emittedEvents: number;
    lastRunAt: string | null;
    lastError: string | null;
    healthScore: number;
  }>;
}

export interface RawRecord {
  recordId: string;
  tenantId: string;
  sourceId: string;
  sourceRecordId: string;
  schemaName: string;
  schemaVersion: string;
  payload: Record<string, unknown>;
  ingestedAt: string;
  correlationId?: string;
}

export interface QuarantineRecord {
  raw: RawRecord;
  issues: Array<{
    ruleName: string;
    severity: string;
    message: string;
    field?: string;
  }>;
  storedAt: string;
  status: string;
}

export interface CanonicalRecord {
  canonicalId: string;
  entityType: string;
  tenantId: string;
  sourceLinks: Array<{ sourceId: string; sourceRecordId: string; matchScore?: number }>;
  properties: Record<string, unknown>;
  updatedAt: string;
  confidence: number;
}

export interface DomainEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  canonicalEntityId: string;
  entityType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  sourceId?: string;
  severity: string;
  correlationId?: string;
}

export interface LiveState {
  canonicalId: string;
  entityType: string;
  currentStatus: string;
  riskScore: number;
  blockers: string[];
  dependencies: string[];
  slaStatus?: string;
  freshnessStatus: string;
  lastEventAt?: string;
  lastUpdatedAt: string;
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
  lastRunAt?: string;
  lastError?: string;
  healthScore: number;
}

export interface SchemaDef {
  schemaId: string;
  name: string;
  version: string;
  fields: Array<{ name: string; fieldType: string; nullable?: boolean; semanticType?: string }>;
  primaryKey?: string;
  compatibilityMode?: string;
}

export interface AIEntityContext {
  entity: CanonicalRecord | null;
  state: LiveState | null;
  recentEvents: DomainEvent[];
  relationships: Array<{ relation: string; targetId: string; targetType?: string }>;
  freshness: { lastEventAt: string | null; lastUpdatedAt: string | null; status: string };
  riskContext: { riskScore: number; blockers: string[]; slaStatus?: string };
  financialContext: { exposure?: number; lastPaymentReceived?: string };
  tokenCountEstimate: number;
  generatedAt: string;
}

// ────────────────────────────────────────────────────────────────
// FALLBACKS
// ────────────────────────────────────────────────────────────────
const FALLBACK_SNAPSHOT: PlatformSnapshot = {
  generatedAt: new Date().toISOString(),
  totalCanonical: 0,
  totalObjects: 0,
  totalLiveStates: 0,
  atRiskEntities: 0,
  blockedEntities: 0,
  freshEntities: 0,
  stateBreakdown: {},
  eventsTotal: 0,
  pipelineHealth: {},
};

// ────────────────────────────────────────────────────────────────
// HOOKS
// ────────────────────────────────────────────────────────────────
export function usePlatformSnapshot(refetchMs = 5000) {
  return useQuery<PlatformSnapshot>({
    queryKey: ["platform", "snapshot"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/snapshot`);
        if (!r.ok) return FALLBACK_SNAPSHOT;
        const data = await r.json();
        return data?.snapshot ?? FALLBACK_SNAPSHOT;
      } catch { return FALLBACK_SNAPSHOT; }
    },
    refetchInterval: refetchMs,
  });
}

export function useRawRecords(sourceId?: string, limit = 100) {
  return useQuery<{ records: RawRecord[]; count: number }>({
    queryKey: ["platform", "raw", sourceId ?? "all", limit],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (sourceId) params.set("sourceId", sourceId);
        const r = await authFetch(`${API}/raw?${params.toString()}`);
        if (!r.ok) return { records: [], count: 0 };
        const data = await r.json();
        return { records: data?.records ?? [], count: data?.count ?? 0 };
      } catch { return { records: [], count: 0 }; }
    },
    refetchInterval: 8000,
  });
}

export function useQuarantineRecords(limit = 100) {
  return useQuery<{ records: QuarantineRecord[]; count: number; byStatus: Record<string, number> }>({
    queryKey: ["platform", "quarantine", limit],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/quarantine?limit=${limit}`);
        if (!r.ok) return { records: [], count: 0, byStatus: {} };
        const data = await r.json();
        return {
          records: data?.records ?? [],
          count: data?.count ?? 0,
          byStatus: data?.byStatus ?? {},
        };
      } catch { return { records: [], count: 0, byStatus: {} }; }
    },
    refetchInterval: 10_000,
  });
}

export function useCanonicalRecords(entityType?: string) {
  return useQuery<CanonicalRecord[]>({
    queryKey: ["platform", "canonical", entityType ?? "all"],
    queryFn: async () => {
      try {
        const url = entityType ? `${API}/canonical?type=${entityType}` : `${API}/canonical`;
        const r = await authFetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        return data?.records ?? [];
      } catch { return []; }
    },
    refetchInterval: 10_000,
  });
}

export function useDomainEvents(limit = 100) {
  return useQuery<DomainEvent[]>({
    queryKey: ["platform", "events", limit],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/events?limit=${limit}`);
        if (!r.ok) return [];
        const data = await r.json();
        return data?.events ?? [];
      } catch { return []; }
    },
    refetchInterval: 5000,
  });
}

export function useEntityTimeline(entityId?: string) {
  return useQuery<DomainEvent[]>({
    queryKey: ["platform", "timeline", entityId ?? "none"],
    enabled: !!entityId,
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/events/entity/${entityId}`);
        if (!r.ok) return [];
        const data = await r.json();
        return data?.events ?? [];
      } catch { return []; }
    },
    refetchInterval: 5000,
  });
}

export function useLiveStates(entityType?: string, onlyAtRisk = false) {
  return useQuery<LiveState[]>({
    queryKey: ["platform", "states", entityType ?? "all", onlyAtRisk],
    queryFn: async () => {
      try {
        const url = onlyAtRisk
          ? `${API}/states/at-risk`
          : entityType ? `${API}/states?type=${entityType}` : `${API}/states`;
        const r = await authFetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        return data?.states ?? [];
      } catch { return []; }
    },
    refetchInterval: 6000,
  });
}

export function usePipelineMetrics() {
  return useQuery<PipelineMetrics[]>({
    queryKey: ["platform", "pipeline-metrics"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/pipelines/metrics`);
        if (!r.ok) return [];
        const data = await r.json();
        return data?.metrics ?? [];
      } catch { return []; }
    },
    refetchInterval: 8000,
  });
}

export function useSchemaRegistry() {
  return useQuery<SchemaDef[]>({
    queryKey: ["platform", "schemas"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/schemas`);
        if (!r.ok) return [];
        const data = await r.json();
        return data?.schemas ?? [];
      } catch { return []; }
    },
    refetchInterval: 30_000,
  });
}

export function useAIEntityContext(entityId?: string) {
  return useQuery<AIEntityContext | null>({
    queryKey: ["platform", "ai-context", entityId ?? "none"],
    enabled: !!entityId,
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/ai-context/entity/${entityId}`);
        if (!r.ok) return null;
        const data = await r.json();
        return data?.context ?? null;
      } catch { return null; }
    },
    refetchInterval: 10_000,
  });
}

export function useAISituationContext() {
  return useQuery({
    queryKey: ["platform", "ai-context", "situation"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/ai-context/situation`);
        if (!r.ok) return null;
        const data = await r.json();
        return data?.context ?? null;
      } catch { return null; }
    },
    refetchInterval: 10_000,
  });
}
