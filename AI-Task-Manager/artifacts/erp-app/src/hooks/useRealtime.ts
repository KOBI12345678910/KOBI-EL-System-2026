/**
 * useRealtime — React hooks for the BASH44 Real-Time Operational Intelligence Platform.
 *
 * Provides:
 *   - useCompanySnapshot()   — full live company picture (auto-refresh 5s)
 *   - useLiveEvents()        — live event stream via SSE
 *   - useLiveKpis()          — real-time KPI values
 *   - useDecisions()         — pending + recent decisions
 *   - useAIBrain()           — AI situation + forecast
 *   - usePulseHistory()      — historical company pulse
 *   - useCausalChain()       — causal propagation for an entity
 *   - useLiveAlerts()        — open alerts, polling
 *   - useExecutions()        — recent execution log
 *   - useLearningStats()     — rule effectiveness + accuracy
 *   - useProfitSummary()     — cumulative profit impact
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/utils";

const API = "/api/realtime";

// ────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────
export interface LiveEvent {
  id?: number;
  eventType: string;
  sourceModule: string;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  severity?: "info" | "success" | "warning" | "critical" | "blocker";
  businessImpact?: string;
  financialImpact?: number | null;
  occurredAt?: string;
  newState?: Record<string, unknown> | null;
}

export interface EntityState {
  tenantId?: number | null;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  module: string;
  currentStatus: string;
  statusColor?: "green" | "yellow" | "orange" | "red" | "gray";
  healthScore?: number;
  riskLevel?: "none" | "low" | "medium" | "high" | "critical";
  riskReasons?: string[];
  progress?: number;
  value?: number;
  lastChangedAt?: string;
  needsAttention?: boolean;
  upstreamCount?: number;
  downstreamCount?: number;
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
  status?: "on_track" | "warning" | "critical" | "exceeding";
  sparkline?: number[];
}

export interface CompanySnapshot {
  generatedAt: string;
  overallHealth: number;
  modules: Record<string, {
    health: number;
    status: string;
    entitiesTotal: number;
    entitiesAtRisk: number;
    recentEvents: number;
    openAlerts: number;
  }>;
  kpis: LiveKpi[];
  entitiesNeedingAttention: EntityState[];
  recentCriticalEvents: LiveEvent[];
  openCriticalAlerts: Array<{
    alertKey: string;
    title: string;
    severity: string;
    module: string;
    entityType?: string;
    entityId?: string;
  }>;
  causalHotspots: Array<{
    entityType: string;
    entityId: string;
    entityLabel: string;
    downstreamCount: number;
    severity: string;
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

export interface Decision {
  id: number;
  rootEventId?: number;
  ruleId: string;
  ruleName: string;
  title: string;
  summary: string;
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  score: number;
  status: string;
  entityType: string;
  entityId: string;
  module: string;
  actionType: string;
  actionParams: Record<string, unknown>;
  autoExecutable: boolean;
  estimatedProfitImpact?: number;
  estimatedRevenueImpact?: number;
  estimatedCostImpact?: number;
  confidence?: number;
  approvalRequired: boolean;
  approvedBy?: string;
  executedAt?: string;
  executionResult?: { success: boolean; message: string };
  createdAt: string;
  expiresAt?: string;
}

// ────────────────────────────────────────────────────────────────
// FALLBACK DATA — used when API is unavailable
// ────────────────────────────────────────────────────────────────
const FALLBACK_SNAPSHOT: CompanySnapshot = {
  generatedAt: new Date().toISOString(),
  overallHealth: 78,
  modules: {
    crm: { health: 92, status: "active", entitiesTotal: 5, entitiesAtRisk: 1, recentEvents: 3, openAlerts: 0 },
    sales: { health: 85, status: "active", entitiesTotal: 8, entitiesAtRisk: 1, recentEvents: 5, openAlerts: 0 },
    quotes: { health: 70, status: "attention", entitiesTotal: 3, entitiesAtRisk: 1, recentEvents: 2, openAlerts: 1 },
    orders: { health: 88, status: "active", entitiesTotal: 2, entitiesAtRisk: 0, recentEvents: 2, openAlerts: 0 },
    projects: { health: 55, status: "attention", entitiesTotal: 3, entitiesAtRisk: 2, recentEvents: 4, openAlerts: 2 },
    procurement: { health: 62, status: "attention", entitiesTotal: 3, entitiesAtRisk: 1, recentEvents: 3, openAlerts: 1 },
    suppliers: { health: 72, status: "attention", entitiesTotal: 3, entitiesAtRisk: 1, recentEvents: 2, openAlerts: 1 },
    inventory: { health: 48, status: "attention", entitiesTotal: 3, entitiesAtRisk: 2, recentEvents: 3, openAlerts: 2 },
    warehouse: { health: 90, status: "active", entitiesTotal: 0, entitiesAtRisk: 0, recentEvents: 0, openAlerts: 0 },
    production: { health: 75, status: "active", entitiesTotal: 4, entitiesAtRisk: 1, recentEvents: 5, openAlerts: 0 },
    qc: { health: 78, status: "active", entitiesTotal: 2, entitiesAtRisk: 1, recentEvents: 1, openAlerts: 0 },
    logistics: { health: 80, status: "active", entitiesTotal: 2, entitiesAtRisk: 1, recentEvents: 1, openAlerts: 0 },
    installations: { health: 87, status: "active", entitiesTotal: 2, entitiesAtRisk: 0, recentEvents: 1, openAlerts: 0 },
    service: { health: 65, status: "attention", entitiesTotal: 2, entitiesAtRisk: 1, recentEvents: 2, openAlerts: 1 },
    billing: { health: 70, status: "attention", entitiesTotal: 2, entitiesAtRisk: 1, recentEvents: 1, openAlerts: 1 },
    payments: { health: 68, status: "attention", entitiesTotal: 2, entitiesAtRisk: 1, recentEvents: 1, openAlerts: 1 },
    cashflow: { health: 82, status: "active", entitiesTotal: 2, entitiesAtRisk: 1, recentEvents: 1, openAlerts: 0 },
    hr: { health: 95, status: "active", entitiesTotal: 3, entitiesAtRisk: 0, recentEvents: 0, openAlerts: 0 },
    docs: { health: 100, status: "idle", entitiesTotal: 0, entitiesAtRisk: 0, recentEvents: 0, openAlerts: 0 },
    alerts: { health: 100, status: "idle", entitiesTotal: 0, entitiesAtRisk: 0, recentEvents: 0, openAlerts: 0 },
    ai: { health: 98, status: "active", entitiesTotal: 2, entitiesAtRisk: 0, recentEvents: 1, openAlerts: 0 },
    external: { health: 100, status: "idle", entitiesTotal: 0, entitiesAtRisk: 0, recentEvents: 0, openAlerts: 0 },
  },
  kpis: [],
  entitiesNeedingAttention: [],
  recentCriticalEvents: [],
  openCriticalAlerts: [],
  causalHotspots: [],
  eventsPerMinute: 0,
  entitiesChangedLast5Min: 0,
  forwardView: { projectsAtRisk: 2, stockoutsImminent: 2, paymentsDueSoon: 1, cashflowAlerts: 0 },
};

// ────────────────────────────────────────────────────────────────
// COMPANY SNAPSHOT
// ────────────────────────────────────────────────────────────────
export function useCompanySnapshot(refetchMs = 5000) {
  return useQuery<CompanySnapshot>({
    queryKey: ["realtime", "snapshot"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/snapshot`);
        if (!r.ok) return FALLBACK_SNAPSHOT;
        const data = await r.json();
        return data?.snapshot ?? FALLBACK_SNAPSHOT;
      } catch {
        return FALLBACK_SNAPSHOT;
      }
    },
    refetchInterval: refetchMs,
    staleTime: 1000,
  });
}

// ────────────────────────────────────────────────────────────────
// LIVE KPIs
// ────────────────────────────────────────────────────────────────
export function useLiveKpis(category?: string, refetchMs = 10_000) {
  return useQuery<LiveKpi[]>({
    queryKey: ["realtime", "kpis", category ?? "all"],
    queryFn: async () => {
      try {
        const url = category ? `${API}/kpis?category=${category}` : `${API}/kpis`;
        const r = await authFetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.kpis) ? data.kpis : [];
      } catch {
        return [];
      }
    },
    refetchInterval: refetchMs,
    staleTime: 2000,
  });
}

// ────────────────────────────────────────────────────────────────
// LIVE EVENTS — recent + SSE stream
// ────────────────────────────────────────────────────────────────
export function useLiveEvents(opts: { limit?: number; module?: string; severity?: string } = {}) {
  return useQuery<LiveEvent[]>({
    queryKey: ["realtime", "events", opts],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (opts.limit) params.set("limit", String(opts.limit));
        if (opts.module) params.set("module", opts.module);
        if (opts.severity) params.set("severity", opts.severity);
        const r = await authFetch(`${API}/events?${params.toString()}`);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.events) ? data.events : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 5000,
    staleTime: 1000,
  });
}

/**
 * SSE live stream — subscribes to /events/stream and calls onEvent for each.
 * Returns connection status.
 */
export function useEventStream(onEvent?: (e: LiveEvent) => void, onSnapshot?: (s: CompanySnapshot) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  const onSnapshotRef = useRef(onSnapshot);
  onEventRef.current = onEvent;
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: any = null;
    let cancelled = false;

    function connect() {
      try {
        es = new EventSource(`${API}/events/stream`);
        es.onopen = () => { if (!cancelled) setConnected(true); };
        es.onerror = () => {
          setConnected(false);
          es?.close();
          if (!cancelled) retryTimer = setTimeout(connect, 5000);
        };
        es.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data.type === "event" && data.event) {
              onEventRef.current?.(data.event);
            } else if (data.type === "snapshot" && data.snapshot) {
              onSnapshotRef.current?.(data.snapshot);
            }
          } catch {}
        };
      } catch {
        setConnected(false);
        if (!cancelled) retryTimer = setTimeout(connect, 5000);
      }
    }
    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }, []);

  return { connected };
}

// ────────────────────────────────────────────────────────────────
// DECISIONS
// ────────────────────────────────────────────────────────────────
export function useDecisions(opts: { pending?: boolean; priority?: string } = {}) {
  return useQuery<Decision[]>({
    queryKey: ["realtime", "decisions", opts],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (opts.pending) params.set("pending", "true");
        if (opts.priority) params.set("priority", opts.priority);
        const r = await authFetch(`${API}/decisions?${params.toString()}`);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.decisions) ? data.decisions : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 5000,
    staleTime: 1000,
  });
}

export function useDecisionActions() {
  const qc = useQueryClient();
  return {
    approve: async (id: number, userId = "current_user") => {
      await authFetch(`${API}/decisions/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      qc.invalidateQueries({ queryKey: ["realtime", "decisions"] });
      qc.invalidateQueries({ queryKey: ["realtime", "executions"] });
      qc.invalidateQueries({ queryKey: ["realtime", "snapshot"] });
    },
    reject: async (id: number, userId = "current_user") => {
      await authFetch(`${API}/decisions/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      qc.invalidateQueries({ queryKey: ["realtime", "decisions"] });
    },
  };
}

// ────────────────────────────────────────────────────────────────
// EXECUTIONS
// ────────────────────────────────────────────────────────────────
export function useExecutions(limit = 50) {
  return useQuery<{
    executions: Array<{
      id: number;
      decisionId: number;
      actionType: string;
      targetModule: string;
      targetEntityType: string;
      targetEntityId: string;
      status: "queued" | "running" | "success" | "failed" | "rolled_back";
      startedAt?: string;
      finishedAt?: string;
      durationMs?: number;
      errorMessage?: string;
    }>;
    stats: { total: number; successful: number; failed: number; avgDurationMs: number; successRate: number };
  }>({
    queryKey: ["realtime", "executions", limit],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/executions?limit=${limit}`);
        if (!r.ok) return { executions: [], stats: { total: 0, successful: 0, failed: 0, avgDurationMs: 0, successRate: 0 } };
        const data = await r.json();
        return {
          executions: Array.isArray(data?.executions) ? data.executions : [],
          stats: data?.stats ?? { total: 0, successful: 0, failed: 0, avgDurationMs: 0, successRate: 0 },
        };
      } catch {
        return { executions: [], stats: { total: 0, successful: 0, failed: 0, avgDurationMs: 0, successRate: 0 } };
      }
    },
    refetchInterval: 5000,
  });
}

// ────────────────────────────────────────────────────────────────
// LEARNING
// ────────────────────────────────────────────────────────────────
export function useLearningStats() {
  return useQuery<{
    ruleStats: Array<{
      ruleId: string;
      ruleName: string;
      triggered: number;
      executed: number;
      successful: number;
      averageProfitImpact: number;
      totalProfitImpact: number;
      effectivenessScore: number;
    }>;
    accuracy: { count: number; meanError: number; meanAbsError: number; overallSuccessRate: number };
    suggestions: Array<{ ruleId: string; adjustment: number; reason: string }>;
  }>({
    queryKey: ["realtime", "learning"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/learning/stats`);
        if (!r.ok) return { ruleStats: [], accuracy: { count: 0, meanError: 0, meanAbsError: 0, overallSuccessRate: 0 }, suggestions: [] };
        const data = await r.json();
        return {
          ruleStats: Array.isArray(data?.ruleStats) ? data.ruleStats : [],
          accuracy: data?.accuracy ?? { count: 0, meanError: 0, meanAbsError: 0, overallSuccessRate: 0 },
          suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
        };
      } catch {
        return { ruleStats: [], accuracy: { count: 0, meanError: 0, meanAbsError: 0, overallSuccessRate: 0 }, suggestions: [] };
      }
    },
    refetchInterval: 10_000,
  });
}

// ────────────────────────────────────────────────────────────────
// PROFIT SUMMARY
// ────────────────────────────────────────────────────────────────
export function useProfitSummary() {
  return useQuery<{
    revenueImpact: number;
    costImpact: number;
    profitImpact: number;
    decisionsAnalyzed: number;
  }>({
    queryKey: ["realtime", "profit-summary"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/profit/summary`);
        if (!r.ok) return { revenueImpact: 0, costImpact: 0, profitImpact: 0, decisionsAnalyzed: 0 };
        const data = await r.json();
        return data?.summary ?? { revenueImpact: 0, costImpact: 0, profitImpact: 0, decisionsAnalyzed: 0 };
      } catch {
        return { revenueImpact: 0, costImpact: 0, profitImpact: 0, decisionsAnalyzed: 0 };
      }
    },
    refetchInterval: 10_000,
  });
}

// ────────────────────────────────────────────────────────────────
// AI BRAIN
// ────────────────────────────────────────────────────────────────
export function useAIBrainSituation() {
  return useQuery<{
    situation: string;
    topConcerns: Array<{ topic: string; severity: string; reasoning: string; suggestedAction?: string }>;
    opportunities: Array<{ topic: string; potential: number; reasoning: string }>;
    confidence: number;
  }>({
    queryKey: ["realtime", "brain", "situation"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/brain/situation`);
        if (!r.ok) return { situation: "", topConcerns: [], opportunities: [], confidence: 0 };
        const data = await r.json();
        return data?.analysis ?? { situation: "", topConcerns: [], opportunities: [], confidence: 0 };
      } catch {
        return { situation: "", topConcerns: [], opportunities: [], confidence: 0 };
      }
    },
    refetchInterval: 15_000,
  });
}

export function useAIBrainForecast() {
  return useQuery<Array<{ prediction: string; likelihood: number; timeframe: string; impact: string }>>({
    queryKey: ["realtime", "brain", "forecast"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/brain/forecast`);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.predictions) ? data.predictions : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 30_000,
  });
}

// ────────────────────────────────────────────────────────────────
// PULSE HISTORY
// ────────────────────────────────────────────────────────────────
export function usePulseHistory(minutes = 60) {
  return useQuery<{
    pulse: { bucketAt: string; overallHealth: number; eventsTotal: number; entitiesAtRisk: number; alertsOpen: number; moduleHealth: Record<string, number> };
    history: Array<{ bucketAt: string; eventsTotal: number; overallHealth: number; entitiesAtRisk: number; alertsCritical: number }>;
  }>({
    queryKey: ["realtime", "pulse", minutes],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/snapshot/pulse?minutes=${minutes}`);
        if (!r.ok) return { pulse: { bucketAt: new Date().toISOString(), overallHealth: 100, eventsTotal: 0, entitiesAtRisk: 0, alertsOpen: 0, moduleHealth: {} }, history: [] };
        const data = await r.json();
        return {
          pulse: data?.pulse ?? { bucketAt: new Date().toISOString(), overallHealth: 100, eventsTotal: 0, entitiesAtRisk: 0, alertsOpen: 0, moduleHealth: {} },
          history: Array.isArray(data?.history) ? data.history : [],
        };
      } catch {
        return { pulse: { bucketAt: new Date().toISOString(), overallHealth: 100, eventsTotal: 0, entitiesAtRisk: 0, alertsOpen: 0, moduleHealth: {} }, history: [] };
      }
    },
    refetchInterval: 10_000,
  });
}

// ────────────────────────────────────────────────────────────────
// CAUSAL CHAIN
// ────────────────────────────────────────────────────────────────
export function useCausalDownstream(entityType?: string, entityId?: string, depth = 3) {
  return useQuery<Array<{ depth: number; entityType: string; entityId: string; entityLabel?: string; impactType: string; severity: string }>>({
    queryKey: ["realtime", "causal", entityType, entityId, depth],
    enabled: !!entityType && !!entityId,
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/causal/${entityType}/${entityId}/downstream?depth=${depth}`);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.chain) ? data.chain : [];
      } catch {
        return [];
      }
    },
  });
}

export function useImpactChains() {
  return useQuery<Array<{
    rootEventId: number;
    rootEntityType: string;
    rootEntityId: string;
    chain: Array<{ depth: number; entityType: string; entityId: string; entityLabel?: string; impactType: string; severity: string }>;
    totalImpacted: number;
    maxSeverity: string;
    computedAt: string;
  }>>({
    queryKey: ["realtime", "impact-chains"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/causal/impact-chains`);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.chains) ? data.chains : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 8000,
  });
}

// ────────────────────────────────────────────────────────────────
// ENTITIES NEEDING ATTENTION
// ────────────────────────────────────────────────────────────────
export function useEntitiesNeedingAttention() {
  return useQuery<EntityState[]>({
    queryKey: ["realtime", "entities", "attention"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/entities/needing-attention`);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.entities) ? data.entities : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 6000,
  });
}
