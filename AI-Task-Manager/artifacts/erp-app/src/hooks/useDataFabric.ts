/**
 * useDataFabric — React hooks for the BASH44 Data Fabric
 */

import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";

const API = "/api/fabric";

export interface DataSource {
  id: number;
  sourceKey: string;
  name: string;
  description?: string;
  sourceType: string;
  category?: string;
  vendor?: string;
  status: string;
  healthScore?: number;
  lastSyncAt?: string;
  sensitivityLevel?: string;
  tags?: string[];
}

export interface FabricDataset {
  id: number;
  datasetKey: string;
  name: string;
  description?: string;
  zone: string;
  domain?: string;
  rowCount?: number;
  sizeBytes?: number;
  qualityScore?: number;
  freshnessSlaMinutes?: number;
  lastRefreshedAt?: string;
  containsPii?: boolean;
}

export interface DataProduct {
  id: number;
  productKey: string;
  name: string;
  description?: string;
  domain?: string;
  teamName?: string;
  primaryDatasetKey?: string;
  freshnessSla?: string;
  availabilitySla?: number;
  qualitySla?: number;
  consumers?: string[];
  status: string;
  version?: string;
  tags?: string[];
}

export interface LineageEdge {
  id: number;
  fromType: string;
  fromId: string;
  fromLabel?: string;
  toType: string;
  toId: string;
  toLabel?: string;
  relationship: string;
  observedAt: string;
}

export interface IdentityCluster {
  id: number;
  canonicalEntity: string;
  canonicalId: string;
  canonicalAttributes: Record<string, unknown>;
  sourceCount: number;
  confidence?: number;
  resolutionMethod?: string;
  links: Array<{
    sourceId: number;
    sourceRecordId: string;
    sourceAttributes?: Record<string, unknown>;
    matchScore?: number;
  }>;
}

export interface FabricPipeline {
  id: number;
  pipelineKey: string;
  name: string;
  description?: string;
  domain?: string;
  dag?: {
    nodes: Array<{ id: string; type: string; name: string }>;
    edges: Array<{ from: string; to: string }>;
  };
  schedule?: string;
  status: string;
  successRate?: number;
  avgDurationMs?: number;
  lastRunAt?: string;
}

// ───────────────────────────────────────────────────────────────
const FALLBACK_OVERVIEW = {
  connectors: { total: 0, active: 0, failed: 0, paused: 0, avgHealth: 100 },
  ingestion: { total: 0, success: 0, failed: 0, running: 0, successRate: 0, totalRowsIngested: 0 },
  datasets: { total: 0, byZone: {}, totalRows: 0, avgQuality: 0, containsPii: 0 },
  identity: { totalClusters: 0, totalLinks: 0, multiSourceClusters: 0, avgConfidence: 0 },
  lineage: { nodes: 0, edges: 0 },
  quality: { totalChecks: 0, pass: 0, warn: 0, fail: 0, error: 0, passRate: 0, activeRules: 0 },
  freshness: { total: 0, fresh: 0, warning: 0, stale: 0, missing: 0 },
  changeEvents: { total: 0, byOperation: {} },
  products: { total: 0, ga: 0, beta: 0 },
};

export function useFabricOverview() {
  return useQuery({
    queryKey: ["fabric", "overview"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/overview`);
        if (!r.ok) return FALLBACK_OVERVIEW;
        const data = await r.json();
        return data?.overview ?? FALLBACK_OVERVIEW;
      } catch { return FALLBACK_OVERVIEW; }
    },
    refetchInterval: 10_000,
  });
}

export function useDataSources(filter?: { category?: string; type?: string }) {
  return useQuery<{ sources: DataSource[]; health: any }>({
    queryKey: ["fabric", "sources", filter],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (filter?.category) params.set("category", filter.category);
        if (filter?.type) params.set("type", filter.type);
        const r = await authFetch(`${API}/sources?${params.toString()}`);
        if (!r.ok) return { sources: [], health: FALLBACK_OVERVIEW.connectors };
        const data = await r.json();
        return { sources: data?.sources ?? [], health: data?.health ?? FALLBACK_OVERVIEW.connectors };
      } catch { return { sources: [], health: FALLBACK_OVERVIEW.connectors }; }
    },
    refetchInterval: 10_000,
  });
}

export function useFabricDatasets(filter?: { zone?: string; domain?: string }) {
  return useQuery<{ datasets: FabricDataset[]; summary: any }>({
    queryKey: ["fabric", "datasets", filter],
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (filter?.zone) params.set("zone", filter.zone);
        if (filter?.domain) params.set("domain", filter.domain);
        const r = await authFetch(`${API}/datasets?${params.toString()}`);
        if (!r.ok) return { datasets: [], summary: FALLBACK_OVERVIEW.datasets };
        const data = await r.json();
        return { datasets: data?.datasets ?? [], summary: data?.summary ?? FALLBACK_OVERVIEW.datasets };
      } catch { return { datasets: [], summary: FALLBACK_OVERVIEW.datasets }; }
    },
    refetchInterval: 10_000,
  });
}

export function useDataProducts(domain?: string) {
  return useQuery<DataProduct[]>({
    queryKey: ["fabric", "products", domain ?? "all"],
    queryFn: async () => {
      try {
        const url = domain ? `${API}/products?domain=${domain}` : `${API}/products`;
        const r = await authFetch(url);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.products) ? data.products : [];
      } catch { return []; }
    },
    refetchInterval: 15_000,
  });
}

export function useLineage() {
  return useQuery<{ edges: LineageEdge[]; summary: { nodes: number; edges: number } }>({
    queryKey: ["fabric", "lineage"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/lineage`);
        if (!r.ok) return { edges: [], summary: { nodes: 0, edges: 0 } };
        const data = await r.json();
        return { edges: data?.edges ?? [], summary: data?.summary ?? { nodes: 0, edges: 0 } };
      } catch { return { edges: [], summary: { nodes: 0, edges: 0 } }; }
    },
    refetchInterval: 15_000,
  });
}

export function useIdentityClusters(entity?: string) {
  return useQuery<{ clusters: IdentityCluster[]; stats: any }>({
    queryKey: ["fabric", "identity", entity ?? "all"],
    queryFn: async () => {
      try {
        const url = entity ? `${API}/identity/clusters?entity=${entity}` : `${API}/identity/clusters`;
        const r = await authFetch(url);
        if (!r.ok) return { clusters: [], stats: {} };
        const data = await r.json();
        return { clusters: data?.clusters ?? [], stats: data?.stats ?? {} };
      } catch { return { clusters: [], stats: {} }; }
    },
    refetchInterval: 15_000,
  });
}

export function useFabricPipelines() {
  return useQuery<FabricPipeline[]>({
    queryKey: ["fabric", "pipelines"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/pipelines`);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data?.pipelines) ? data.pipelines : [];
      } catch { return []; }
    },
    refetchInterval: 10_000,
  });
}

export function useQualityResults(limit = 100) {
  return useQuery<{
    results: Array<{
      id: number;
      ruleId: number;
      datasetKey: string;
      status: "pass" | "warn" | "fail" | "error";
      rowsChecked?: number;
      rowsFailed?: number;
      failurePercent?: number;
      message?: string;
      executedAt: string;
    }>;
    summary: any;
  }>({
    queryKey: ["fabric", "quality", limit],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/quality/results?limit=${limit}`);
        if (!r.ok) return { results: [], summary: FALLBACK_OVERVIEW.quality };
        const data = await r.json();
        return { results: data?.results ?? [], summary: data?.summary ?? FALLBACK_OVERVIEW.quality };
      } catch { return { results: [], summary: FALLBACK_OVERVIEW.quality }; }
    },
    refetchInterval: 8000,
  });
}

export function useFreshness() {
  return useQuery<{
    measurements: Array<{ datasetKey: string; slaMinutes?: number; actualLagSeconds?: number; status: string; measuredAt: string }>;
    summary: { total: number; fresh: number; warning: number; stale: number; missing: number };
  }>({
    queryKey: ["fabric", "freshness"],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/freshness`);
        if (!r.ok) return { measurements: [], summary: FALLBACK_OVERVIEW.freshness };
        const data = await r.json();
        return { measurements: data?.measurements ?? [], summary: data?.summary ?? FALLBACK_OVERVIEW.freshness };
      } catch { return { measurements: [], summary: FALLBACK_OVERVIEW.freshness }; }
    },
    refetchInterval: 10_000,
  });
}

export function useChangeEvents(limit = 100) {
  return useQuery<{
    events: Array<{
      id: number;
      sourceKey: string;
      datasetKey?: string;
      operation: string;
      recordId?: string;
      changedFields?: string[];
      receivedAt: string;
    }>;
    stats: { total: number; byOperation: Record<string, number> };
  }>({
    queryKey: ["fabric", "change-events", limit],
    queryFn: async () => {
      try {
        const r = await authFetch(`${API}/change-events?limit=${limit}`);
        if (!r.ok) return { events: [], stats: { total: 0, byOperation: {} } };
        const data = await r.json();
        return { events: data?.events ?? [], stats: data?.stats ?? { total: 0, byOperation: {} } };
      } catch { return { events: [], stats: { total: 0, byOperation: {} } }; }
    },
    refetchInterval: 6000,
  });
}
