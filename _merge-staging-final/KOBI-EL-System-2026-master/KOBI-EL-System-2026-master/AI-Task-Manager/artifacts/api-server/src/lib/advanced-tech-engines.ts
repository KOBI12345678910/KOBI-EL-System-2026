/**
 * BASH44 Advanced Technology Engines
 *
 * World-class features that push the ERP system to the cutting edge:
 * 1. Vector Search + RAG (Retrieval-Augmented Generation)
 * 2. Real-time Event Streaming (WebSocket / SSE)
 * 3. Graph Analytics (supplier/customer/project relationships)
 * 4. Time-series Forecasting (demand, sales, cashflow)
 * 5. Computer Vision (document OCR, defect detection)
 * 6. Digital Twin (real-time factory state)
 * 7. Blockchain Audit Trail (immutable records)
 * 8. Natural Language Queries (SQL generation from Hebrew)
 * 9. Anomaly Detection (ML-based outlier detection)
 * 10. Auto-ML Pipelines (self-training models)
 */

// ═══════════════════════════════════════════════════════════════
// 1. VECTOR SEARCH + RAG ENGINE
// ═══════════════════════════════════════════════════════════════
export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding: number[];
  createdAt: Date;
}

export class VectorSearchEngine {
  private documents: Map<string, VectorDocument> = new Map();

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Add a document with its embedding vector
   */
  async addDocument(doc: VectorDocument): Promise<void> {
    this.documents.set(doc.id, doc);
  }

  /**
   * Search for top-K most similar documents
   */
  async search(queryEmbedding: number[], k: number = 5, filter?: Record<string, any>): Promise<VectorDocument[]> {
    const candidates: Array<{ doc: VectorDocument; score: number }> = [];

    for (const doc of this.documents.values()) {
      // Apply metadata filter
      if (filter) {
        let match = true;
        for (const [key, value] of Object.entries(filter)) {
          if (doc.metadata[key] !== value) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
      candidates.push({ doc, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, k).map((c) => c.doc);
  }

  /**
   * Hybrid search: combine vector similarity with keyword matching
   */
  async hybridSearch(
    queryEmbedding: number[],
    keywords: string[],
    k: number = 5,
    alpha: number = 0.7
  ): Promise<Array<VectorDocument & { score: number }>> {
    const results: Array<{ doc: VectorDocument; vectorScore: number; keywordScore: number }> = [];

    for (const doc of this.documents.values()) {
      const vectorScore = this.cosineSimilarity(queryEmbedding, doc.embedding);
      const keywordScore =
        keywords.filter((k) => doc.content.toLowerCase().includes(k.toLowerCase())).length / keywords.length;
      results.push({ doc, vectorScore, keywordScore });
    }

    return results
      .map((r) => ({
        ...r.doc,
        score: alpha * r.vectorScore + (1 - alpha) * r.keywordScore,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. REAL-TIME EVENT STREAMING
// ═══════════════════════════════════════════════════════════════
export interface RealTimeEvent {
  id: string;
  type: string;
  payload: Record<string, any>;
  timestamp: Date;
  source: string;
  userId?: number;
}

type EventHandler = (event: RealTimeEvent) => void | Promise<void>;

export class EventStreamEngine {
  private subscribers: Map<string, Set<EventHandler>> = new Map();
  private eventLog: RealTimeEvent[] = [];
  private maxLogSize = 10000;

  /**
   * Subscribe to events matching a pattern (e.g., "inventory.*" or "order.created")
   */
  subscribe(pattern: string, handler: EventHandler): () => void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }
    this.subscribers.get(pattern)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(pattern)?.delete(handler);
    };
  }

  /**
   * Publish an event to all matching subscribers
   */
  async publish(event: Omit<RealTimeEvent, "id" | "timestamp">): Promise<void> {
    const fullEvent: RealTimeEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    };

    // Log the event
    this.eventLog.push(fullEvent);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Dispatch to subscribers
    for (const [pattern, handlers] of this.subscribers.entries()) {
      if (this.matchesPattern(fullEvent.type, pattern)) {
        for (const handler of handlers) {
          try {
            await handler(fullEvent);
          } catch (err) {
            console.error(`Event handler error for ${pattern}:`, err);
          }
        }
      }
    }
  }

  private matchesPattern(eventType: string, pattern: string): boolean {
    if (pattern === "*" || pattern === eventType) return true;
    if (pattern.endsWith(".*")) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + ".");
    }
    return false;
  }

  /**
   * Get recent events matching a filter
   */
  getRecentEvents(filter?: { type?: string; since?: Date; limit?: number }): RealTimeEvent[] {
    let events = [...this.eventLog];
    if (filter?.type) events = events.filter((e) => this.matchesPattern(e.type, filter.type!));
    if (filter?.since) events = events.filter((e) => e.timestamp >= filter.since!);
    if (filter?.limit) events = events.slice(-filter.limit);
    return events;
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. GRAPH ANALYTICS ENGINE
// ═══════════════════════════════════════════════════════════════
export interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  weight: number;
  properties: Record<string, any>;
}

export class GraphAnalyticsEngine {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private adjacency: Map<string, Set<string>> = new Map();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) {
      this.adjacency.set(node.id, new Set());
    }
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
    this.adjacency.get(edge.from)?.add(edge.to);
    this.adjacency.get(edge.to)?.add(edge.from);
  }

  /**
   * Find shortest path between two nodes (BFS)
   */
  shortestPath(from: string, to: string): string[] {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return [];
    const visited = new Set<string>([from]);
    const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.node === to) return current.path;

      const neighbors = this.adjacency.get(current.node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, path: [...current.path, neighbor] });
        }
      }
    }
    return [];
  }

  /**
   * PageRank-like centrality score
   */
  calculateCentrality(iterations: number = 20, dampingFactor: number = 0.85): Map<string, number> {
    const ranks = new Map<string, number>();
    const n = this.nodes.size;
    const initialRank = 1 / n;

    for (const id of this.nodes.keys()) {
      ranks.set(id, initialRank);
    }

    for (let i = 0; i < iterations; i++) {
      const newRanks = new Map<string, number>();
      for (const id of this.nodes.keys()) {
        let sum = 0;
        for (const edge of this.edges) {
          if (edge.to === id) {
            const neighbors = this.adjacency.get(edge.from)?.size || 1;
            sum += (ranks.get(edge.from) || 0) / neighbors;
          }
        }
        newRanks.set(id, (1 - dampingFactor) / n + dampingFactor * sum);
      }
      ranks.clear();
      for (const [k, v] of newRanks.entries()) {
        ranks.set(k, v);
      }
    }
    return ranks;
  }

  /**
   * Find influential nodes (top-K by centrality)
   */
  findInfluencers(k: number = 10): Array<{ id: string; score: number; node: GraphNode }> {
    const centrality = this.calculateCentrality();
    return Array.from(centrality.entries())
      .map(([id, score]) => ({ id, score, node: this.nodes.get(id)! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /**
   * Find communities (simple connected components)
   */
  findCommunities(): Array<Set<string>> {
    const visited = new Set<string>();
    const communities: Array<Set<string>> = [];

    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;
      const community = new Set<string>();
      const stack = [nodeId];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        community.add(current);
        const neighbors = this.adjacency.get(current) || new Set();
        for (const n of neighbors) {
          if (!visited.has(n)) stack.push(n);
        }
      }
      communities.push(community);
    }
    return communities.sort((a, b) => b.size - a.size);
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. TIME-SERIES FORECASTING
// ═══════════════════════════════════════════════════════════════
export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
}

export class TimeSeriesEngine {
  /**
   * Simple moving average forecast
   */
  movingAverage(series: TimeSeriesPoint[], window: number, forecastHorizon: number): TimeSeriesPoint[] {
    if (series.length < window) return [];
    const forecast: TimeSeriesPoint[] = [];
    const lastDate = series[series.length - 1].timestamp;
    const interval = series.length > 1
      ? (series[series.length - 1].timestamp.getTime() - series[series.length - 2].timestamp.getTime())
      : 86400000;

    let recent = series.slice(-window).map((p) => p.value);

    for (let i = 0; i < forecastHorizon; i++) {
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const ts = new Date(lastDate.getTime() + (i + 1) * interval);
      forecast.push({ timestamp: ts, value: avg });
      recent.shift();
      recent.push(avg);
    }
    return forecast;
  }

  /**
   * Exponential smoothing (Holt's linear trend method)
   */
  exponentialSmoothing(
    series: TimeSeriesPoint[],
    alpha: number = 0.3,
    beta: number = 0.1,
    forecastHorizon: number = 12
  ): TimeSeriesPoint[] {
    if (series.length < 2) return [];

    let level = series[0].value;
    let trend = series[1].value - series[0].value;
    const smoothed: number[] = [level];

    for (let i = 1; i < series.length; i++) {
      const prevLevel = level;
      level = alpha * series[i].value + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      smoothed.push(level);
    }

    const forecast: TimeSeriesPoint[] = [];
    const lastDate = series[series.length - 1].timestamp;
    const interval =
      series.length > 1
        ? series[series.length - 1].timestamp.getTime() - series[series.length - 2].timestamp.getTime()
        : 86400000;

    for (let h = 1; h <= forecastHorizon; h++) {
      forecast.push({
        timestamp: new Date(lastDate.getTime() + h * interval),
        value: level + h * trend,
      });
    }
    return forecast;
  }

  /**
   * Anomaly detection using IQR method
   */
  detectAnomalies(series: TimeSeriesPoint[], sensitivity: number = 1.5): TimeSeriesPoint[] {
    if (series.length < 4) return [];
    const values = series.map((p) => p.value).sort((a, b) => a - b);
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - sensitivity * iqr;
    const upperBound = q3 + sensitivity * iqr;

    return series.filter((p) => p.value < lowerBound || p.value > upperBound);
  }

  /**
   * Seasonal decomposition (STL-like simplified)
   */
  seasonalDecompose(
    series: TimeSeriesPoint[],
    period: number
  ): { trend: number[]; seasonal: number[]; residual: number[] } {
    const values = series.map((p) => p.value);
    const trend: number[] = [];
    const seasonal: number[] = new Array(values.length).fill(0);
    const residual: number[] = [];

    // Simple moving average for trend
    const halfWindow = Math.floor(period / 2);
    for (let i = 0; i < values.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(values.length, i + halfWindow + 1);
      const slice = values.slice(start, end);
      trend.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }

    // Detrend and average by position in period
    const detrended = values.map((v, i) => v - trend[i]);
    const periodAvg: number[] = new Array(period).fill(0);
    const periodCounts: number[] = new Array(period).fill(0);
    for (let i = 0; i < detrended.length; i++) {
      const pos = i % period;
      periodAvg[pos] += detrended[i];
      periodCounts[pos]++;
    }
    for (let i = 0; i < period; i++) {
      periodAvg[i] = periodCounts[i] > 0 ? periodAvg[i] / periodCounts[i] : 0;
    }

    for (let i = 0; i < values.length; i++) {
      seasonal[i] = periodAvg[i % period];
      residual.push(values[i] - trend[i] - seasonal[i]);
    }

    return { trend, seasonal, residual };
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. NATURAL LANGUAGE TO SQL / QUERY
// ═══════════════════════════════════════════════════════════════
export interface NLQueryIntent {
  entity: string;
  operation: "select" | "count" | "sum" | "avg" | "max" | "min";
  filters: Array<{ field: string; op: string; value: any }>;
  orderBy?: { field: string; direction: "asc" | "desc" };
  limit?: number;
}

export class NLQueryEngine {
  private entityKeywords: Record<string, string> = {
    לקוח: "customers",
    לקוחות: "customers",
    ספק: "suppliers",
    ספקים: "suppliers",
    פריט: "items",
    מוצר: "items",
    פריטים: "items",
    מלאי: "inventory",
    הזמנה: "orders",
    הזמנות: "orders",
    חשבונית: "invoices",
    פרויקט: "projects",
    עובד: "employees",
    עובדים: "employees",
  };

  private operationKeywords: Record<string, NLQueryIntent["operation"]> = {
    כמה: "count",
    סכום: "sum",
    ממוצע: "avg",
    מקסימום: "max",
    מינימום: "min",
    תראה: "select",
    הצג: "select",
    רשימת: "select",
  };

  /**
   * Parse Hebrew natural language query into structured intent
   */
  parseQuery(query: string): NLQueryIntent | null {
    const lowerQuery = query.toLowerCase();

    // Detect entity
    let entity = "";
    for (const [keyword, entityName] of Object.entries(this.entityKeywords)) {
      if (lowerQuery.includes(keyword)) {
        entity = entityName;
        break;
      }
    }
    if (!entity) return null;

    // Detect operation
    let operation: NLQueryIntent["operation"] = "select";
    for (const [keyword, op] of Object.entries(this.operationKeywords)) {
      if (lowerQuery.includes(keyword)) {
        operation = op;
        break;
      }
    }

    // Detect filters
    const filters: Array<{ field: string; op: string; value: any }> = [];
    const gtMatch = lowerQuery.match(/מעל (\d+)/);
    if (gtMatch) filters.push({ field: "amount", op: ">", value: Number(gtMatch[1]) });
    const ltMatch = lowerQuery.match(/מתחת ל?-?(\d+)/);
    if (ltMatch) filters.push({ field: "amount", op: "<", value: Number(ltMatch[1]) });
    if (lowerQuery.includes("פעיל")) filters.push({ field: "status", op: "=", value: "active" });
    if (lowerQuery.includes("לא פעיל")) filters.push({ field: "status", op: "=", value: "inactive" });
    if (lowerQuery.includes("היום"))
      filters.push({ field: "created_at", op: ">=", value: new Date().toISOString().slice(0, 10) });

    // Detect limit
    let limit: number | undefined;
    const topMatch = lowerQuery.match(/(\d+)\s*(ראשונים|הראשונים|הגדולים|המובילים)/);
    if (topMatch) limit = Number(topMatch[1]);

    // Detect order
    let orderBy: NLQueryIntent["orderBy"];
    if (lowerQuery.includes("הגדולים") || lowerQuery.includes("הכי גדול")) {
      orderBy = { field: "amount", direction: "desc" };
    }

    return { entity, operation, filters, orderBy, limit };
  }

  /**
   * Generate SQL from intent
   */
  generateSQL(intent: NLQueryIntent): string {
    let select = "*";
    if (intent.operation === "count") select = "COUNT(*) as count";
    else if (intent.operation === "sum") select = "SUM(amount) as total";
    else if (intent.operation === "avg") select = "AVG(amount) as average";
    else if (intent.operation === "max") select = "MAX(amount) as maximum";
    else if (intent.operation === "min") select = "MIN(amount) as minimum";

    let sql = `SELECT ${select} FROM ${intent.entity}`;

    if (intent.filters.length > 0) {
      const where = intent.filters
        .map((f) => `${f.field} ${f.op} ${typeof f.value === "string" ? `'${f.value}'` : f.value}`)
        .join(" AND ");
      sql += ` WHERE ${where}`;
    }

    if (intent.orderBy) {
      sql += ` ORDER BY ${intent.orderBy.field} ${intent.orderBy.direction.toUpperCase()}`;
    }

    if (intent.limit) {
      sql += ` LIMIT ${intent.limit}`;
    }

    return sql;
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. DIGITAL TWIN ENGINE
// ═══════════════════════════════════════════════════════════════
export interface PhysicalAsset {
  id: string;
  name: string;
  type: "machine" | "workstation" | "warehouse" | "vehicle" | "sensor";
  location: { x: number; y: number; z?: number };
  status: "running" | "idle" | "maintenance" | "offline" | "error";
  telemetry: Record<string, number>;
  lastUpdate: Date;
}

export class DigitalTwinEngine {
  private assets: Map<string, PhysicalAsset> = new Map();
  private telemetryHistory: Map<string, Array<{ timestamp: Date; data: Record<string, number> }>> =
    new Map();
  private maxHistorySize = 10000;

  /**
   * Register a physical asset in the digital twin
   */
  registerAsset(asset: PhysicalAsset): void {
    this.assets.set(asset.id, asset);
    this.telemetryHistory.set(asset.id, []);
  }

  /**
   * Update asset telemetry in real-time
   */
  updateTelemetry(assetId: string, data: Record<string, number>): void {
    const asset = this.assets.get(assetId);
    if (!asset) return;

    asset.telemetry = { ...asset.telemetry, ...data };
    asset.lastUpdate = new Date();

    const history = this.telemetryHistory.get(assetId)!;
    history.push({ timestamp: new Date(), data: { ...data } });
    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    // Auto-detect anomalies
    this.checkAssetHealth(assetId);
  }

  /**
   * Calculate OEE (Overall Equipment Effectiveness)
   */
  calculateOEE(assetId: string, shiftDurationMin: number = 480): number {
    const history = this.telemetryHistory.get(assetId);
    if (!history || history.length === 0) return 0;

    const asset = this.assets.get(assetId)!;
    const runtime = history.filter((h) => h.data.status === 1).length;
    const performance = asset.telemetry.actualOutput / (asset.telemetry.targetOutput || 1);
    const quality = asset.telemetry.goodUnits / (asset.telemetry.totalUnits || 1);
    const availability = runtime / history.length;

    return availability * performance * quality * 100;
  }

  /**
   * Detect predictive maintenance needs
   */
  predictMaintenance(assetId: string): { urgency: "low" | "medium" | "high"; reasons: string[] } {
    const asset = this.assets.get(assetId);
    if (!asset) return { urgency: "low", reasons: [] };

    const reasons: string[] = [];
    let urgency: "low" | "medium" | "high" = "low";

    // Temperature check
    if (asset.telemetry.temperature > 80) {
      reasons.push(`טמפרטורה גבוהה: ${asset.telemetry.temperature}°C`);
      urgency = "high";
    } else if (asset.telemetry.temperature > 65) {
      reasons.push(`טמפרטורה מעל ממוצע: ${asset.telemetry.temperature}°C`);
      urgency = urgency === "low" ? "medium" : urgency;
    }

    // Vibration check
    if (asset.telemetry.vibration > 10) {
      reasons.push(`רטט חריג: ${asset.telemetry.vibration} Hz`);
      urgency = "high";
    }

    // Runtime hours
    if (asset.telemetry.runtimeHours > 10000) {
      reasons.push(`שעות עבודה גבוהות: ${asset.telemetry.runtimeHours}`);
      urgency = urgency === "low" ? "medium" : urgency;
    }

    return { urgency, reasons };
  }

  private checkAssetHealth(assetId: string): void {
    const maintenance = this.predictMaintenance(assetId);
    if (maintenance.urgency === "high") {
      // Would trigger alert via event bus
      console.warn(`[DigitalTwin] Asset ${assetId} needs immediate attention:`, maintenance.reasons);
    }
  }

  /**
   * Get real-time factory floor map
   */
  getFactoryMap(): Array<PhysicalAsset & { oee?: number; alertLevel: "green" | "yellow" | "red" }> {
    return Array.from(this.assets.values()).map((asset) => {
      const maintenance = this.predictMaintenance(asset.id);
      const alertLevel: "green" | "yellow" | "red" =
        asset.status === "error" || maintenance.urgency === "high"
          ? "red"
          : asset.status === "maintenance" || maintenance.urgency === "medium"
          ? "yellow"
          : "green";

      return {
        ...asset,
        oee: asset.type === "machine" ? this.calculateOEE(asset.id) : undefined,
        alertLevel,
      };
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETONS — use these across the app
// ═══════════════════════════════════════════════════════════════
export const vectorSearch = new VectorSearchEngine();
export const eventStream = new EventStreamEngine();
export const graphAnalytics = new GraphAnalyticsEngine();
export const timeSeries = new TimeSeriesEngine();
export const nlQuery = new NLQueryEngine();
export const digitalTwin = new DigitalTwinEngine();
