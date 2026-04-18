/**
 * TechnoKoluzi ERP - Prometheus Metrics Engine
 * מנוע מטריקות עם תמיכה ב-Prometheus ו-Dashboard JSON
 *
 * Features:
 * - 14 counters + 11 gauges למעקב מקיף
 * - היסטוריית בקשות עם חישוב percentiles
 * - פלט Prometheus text format
 * - Dashboard JSON מפורט
 * - Express middleware לרישום אוטומטי
 * - פונקציות עזר: recordRequest, recordAIUsage, incrementCounter, setGauge
 */

import type { Request, Response, NextFunction } from "express";

// ============== Types ==============

interface CounterMetric {
  name: string;
  help: string;
  value: number;
  labels: Record<string, Record<string, number>>; // label_key -> { label_value -> count }
}

interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}

interface RequestRecord {
  method: string;
  path: string;
  statusCode: number;
  duration: number;    // ms
  timestamp: number;
}

// ============== Counters - 14 מונים ==============

const counters: Record<string, CounterMetric> = {
  http_requests_total: {
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    value: 0,
    labels: { method: {}, status: {}, path: {} },
  },
  http_errors_total: {
    name: "http_errors_total",
    help: "Total number of HTTP errors (4xx/5xx)",
    value: 0,
    labels: { status: {}, path: {} },
  },
  ai_requests_total: {
    name: "ai_requests_total",
    help: "Total AI provider requests",
    value: 0,
    labels: { provider: {}, model: {} },
  },
  ai_tokens_used: {
    name: "ai_tokens_used",
    help: "Total AI tokens consumed",
    value: 0,
    labels: { type: {} }, // prompt, completion
  },
  ai_cost_usd: {
    name: "ai_cost_usd",
    help: "Total AI cost in USD",
    value: 0,
    labels: { provider: {} },
  },
  db_queries_total: {
    name: "db_queries_total",
    help: "Total database queries executed",
    value: 0,
    labels: { operation: {} }, // select, insert, update, delete
  },
  ws_connections_total: {
    name: "ws_connections_total",
    help: "Total WebSocket connections (cumulative)",
    value: 0,
    labels: {},
  },
  ws_messages_total: {
    name: "ws_messages_total",
    help: "Total WebSocket messages sent/received",
    value: 0,
    labels: { direction: {} }, // inbound, outbound
  },
  cache_hits_total: {
    name: "cache_hits_total",
    help: "Total cache hit count",
    value: 0,
    labels: {},
  },
  cache_misses_total: {
    name: "cache_misses_total",
    help: "Total cache miss count",
    value: 0,
    labels: {},
  },
  workflow_executions_total: {
    name: "workflow_executions_total",
    help: "Total workflow executions",
    value: 0,
    labels: { status: {} }, // success, failure, timeout
  },
  agent_actions_total: {
    name: "agent_actions_total",
    help: "Total AI agent actions performed",
    value: 0,
    labels: { action_type: {} },
  },
  documents_processed_total: {
    name: "documents_processed_total",
    help: "Total documents processed (OCR, parsing, etc.)",
    value: 0,
    labels: { type: {} },
  },
  voice_transcriptions_total: {
    name: "voice_transcriptions_total",
    help: "Total voice transcriptions completed",
    value: 0,
    labels: { language: {} },
  },
};

// ============== Gauges - 11 מדדים ==============

const gauges: Record<string, GaugeMetric> = {
  http_active_connections: {
    name: "http_active_connections",
    help: "Number of active HTTP connections",
    value: 0,
  },
  ws_active_connections: {
    name: "ws_active_connections",
    help: "Number of active WebSocket connections",
    value: 0,
  },
  db_pool_active: {
    name: "db_pool_active",
    help: "Active database pool connections",
    value: 0,
  },
  db_pool_idle: {
    name: "db_pool_idle",
    help: "Idle database pool connections",
    value: 0,
  },
  cache_entries: {
    name: "cache_entries",
    help: "Current number of cache entries",
    value: 0,
  },
  uptime_seconds: {
    name: "uptime_seconds",
    help: "Server uptime in seconds",
    value: 0,
  },
  memory_rss_bytes: {
    name: "memory_rss_bytes",
    help: "Resident Set Size memory in bytes",
    value: 0,
  },
  memory_heap_used_bytes: {
    name: "memory_heap_used_bytes",
    help: "V8 heap used memory in bytes",
    value: 0,
  },
  active_users: {
    name: "active_users",
    help: "Number of currently active users",
    value: 0,
  },
  pending_approvals: {
    name: "pending_approvals",
    help: "Number of pending approval items",
    value: 0,
  },
  overdue_tasks: {
    name: "overdue_tasks",
    help: "Number of overdue tasks",
    value: 0,
  },
};

// ============== היסטוריית בקשות ==============

/** שמירת 1000 בקשות אחרונות לחישוב percentiles */
const MAX_REQUEST_HISTORY = 1000;
const requestHistory: RequestRecord[] = [];
const startTime = Date.now();

// ============== פונקציות ראשיות ==============

/**
 * הגדלת מונה
 */
export function incrementCounter(
  name: string,
  amount: number = 1,
  labels?: Record<string, string>
): void {
  const counter = counters[name];
  if (!counter) return;

  counter.value += amount;

  // עדכון labels
  if (labels) {
    for (const [key, val] of Object.entries(labels)) {
      if (!counter.labels[key]) counter.labels[key] = {};
      counter.labels[key][val] = (counter.labels[key][val] || 0) + amount;
    }
  }
}

/**
 * הגדרת ערך gauge
 */
export function setGauge(name: string, value: number): void {
  const gauge = gauges[name];
  if (!gauge) return;
  gauge.value = value;
}

/**
 * רישום בקשת HTTP
 */
export function recordRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number
): void {
  // עדכון מונים
  incrementCounter("http_requests_total", 1, {
    method,
    status: String(statusCode),
    path: normalizePath(path),
  });

  if (statusCode >= 400) {
    incrementCounter("http_errors_total", 1, {
      status: String(statusCode),
      path: normalizePath(path),
    });
  }

  // שמירה בהיסטוריה
  requestHistory.push({
    method,
    path: normalizePath(path),
    statusCode,
    duration: durationMs,
    timestamp: Date.now(),
  });

  // גזירת היסטוריה
  if (requestHistory.length > MAX_REQUEST_HISTORY) {
    requestHistory.splice(0, requestHistory.length - MAX_REQUEST_HISTORY);
  }
}

/**
 * רישום שימוש ב-AI
 */
export function recordAIUsage(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  costUsd: number
): void {
  incrementCounter("ai_requests_total", 1, { provider, model });
  incrementCounter("ai_tokens_used", promptTokens, { type: "prompt" });
  incrementCounter("ai_tokens_used", completionTokens, { type: "completion" });
  incrementCounter("ai_cost_usd", costUsd, { provider });
}

// ============== נרמול נתיבים ==============

/** נרמול נתיב - הסרת ID-ים דינמיים */
function normalizePath(path: string): string {
  return path
    .replace(/\/\d+/g, "/:id")
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:uuid")
    .split("?")[0]; // הסרת query params
}

// ============== חישוב Percentiles ==============

function calculatePercentiles(): Record<string, number> {
  if (requestHistory.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0, max: 0, min: 0 };
  }

  const durations = requestHistory.map((r) => r.duration).sort((a, b) => a - b);
  const len = durations.length;

  const percentile = (p: number) => {
    const idx = Math.ceil((p / 100) * len) - 1;
    return durations[Math.max(0, idx)];
  };

  const sum = durations.reduce((a, b) => a + b, 0);

  return {
    p50: percentile(50),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    avg: Math.round(sum / len),
    max: durations[len - 1],
    min: durations[0],
  };
}

// ============== עדכון gauges דינמיים ==============

function refreshSystemGauges(): void {
  const mem = process.memoryUsage();
  setGauge("memory_rss_bytes", mem.rss);
  setGauge("memory_heap_used_bytes", mem.heapUsed);
  setGauge("uptime_seconds", Math.floor((Date.now() - startTime) / 1000));
}

// ============== Prometheus Output ==============

/**
 * פלט בפורמט Prometheus text exposition
 */
export function getPrometheusMetrics(): string {
  refreshSystemGauges();

  const lines: string[] = [];

  // מונים
  for (const counter of Object.values(counters)) {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);

    // אם יש labels, פירוט לפי label
    const hasLabelData = Object.values(counter.labels).some(
      (v) => Object.keys(v).length > 0
    );

    if (hasLabelData) {
      // פלט מפורט לפי label ראשון
      const firstLabelKey = Object.keys(counter.labels).find(
        (k) => Object.keys(counter.labels[k]).length > 0
      );
      if (firstLabelKey) {
        for (const [labelVal, count] of Object.entries(counter.labels[firstLabelKey])) {
          lines.push(`${counter.name}{${firstLabelKey}="${labelVal}"} ${count}`);
        }
      }
    } else {
      lines.push(`${counter.name} ${counter.value}`);
    }

    lines.push("");
  }

  // מדדים (gauges)
  for (const gauge of Object.values(gauges)) {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    lines.push(`${gauge.name} ${gauge.value}`);
    lines.push("");
  }

  // היסטוגרמת latency
  const perc = calculatePercentiles();
  lines.push("# HELP http_request_duration_ms HTTP request duration in milliseconds");
  lines.push("# TYPE http_request_duration_ms summary");
  lines.push(`http_request_duration_ms{quantile="0.5"} ${perc.p50}`);
  lines.push(`http_request_duration_ms{quantile="0.9"} ${perc.p90}`);
  lines.push(`http_request_duration_ms{quantile="0.95"} ${perc.p95}`);
  lines.push(`http_request_duration_ms{quantile="0.99"} ${perc.p99}`);
  lines.push(`http_request_duration_ms_count ${requestHistory.length}`);
  lines.push(`http_request_duration_ms_sum ${requestHistory.reduce((a, r) => a + r.duration, 0)}`);
  lines.push("");

  return lines.join("\n");
}

// ============== Dashboard JSON ==============

/**
 * פלט Dashboard בפורמט JSON
 */
export function getMetricsDashboard(): Record<string, any> {
  refreshSystemGauges();

  const mem = process.memoryUsage();
  const percentiles = calculatePercentiles();

  // בקשות אחרונות 5 דקות
  const fiveMinAgo = Date.now() - 5 * 60_000;
  const recentRequests = requestHistory.filter((r) => r.timestamp > fiveMinAgo);
  const recentErrors = recentRequests.filter((r) => r.statusCode >= 400);

  // חלוקה לפי נתיב - 10 נתיבים הכי פעילים
  const pathCounts: Record<string, number> = {};
  for (const req of recentRequests) {
    pathCounts[req.path] = (pathCounts[req.path] || 0) + 1;
  }
  const topPaths = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  return {
    // מידע כללי
    server: {
      uptime: gauges.uptime_seconds.value,
      startedAt: new Date(startTime).toISOString(),
      nodeVersion: process.version,
    },

    // זיכרון
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      rssFormatted: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
      heapUsedFormatted: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
    },

    // בקשות HTTP
    http: {
      totalRequests: counters.http_requests_total.value,
      totalErrors: counters.http_errors_total.value,
      activeConnections: gauges.http_active_connections.value,
      recentRequests: recentRequests.length,
      recentErrors: recentErrors.length,
      errorRate: recentRequests.length > 0
        ? (recentErrors.length / recentRequests.length * 100).toFixed(2) + "%"
        : "0%",
      latency: percentiles,
      topPaths,
    },

    // AI
    ai: {
      totalRequests: counters.ai_requests_total.value,
      totalTokens: counters.ai_tokens_used.value,
      totalCostUsd: counters.ai_cost_usd.value,
      byProvider: counters.ai_requests_total.labels.provider,
      byModel: counters.ai_requests_total.labels.model,
      tokensByType: counters.ai_tokens_used.labels.type,
    },

    // WebSocket
    websocket: {
      activeConnections: gauges.ws_active_connections.value,
      totalConnections: counters.ws_connections_total.value,
      totalMessages: counters.ws_messages_total.value,
    },

    // מסד נתונים
    database: {
      totalQueries: counters.db_queries_total.value,
      poolActive: gauges.db_pool_active.value,
      poolIdle: gauges.db_pool_idle.value,
      byOperation: counters.db_queries_total.labels.operation,
    },

    // קאש
    cache: {
      entries: gauges.cache_entries.value,
      hits: counters.cache_hits_total.value,
      misses: counters.cache_misses_total.value,
      hitRate:
        counters.cache_hits_total.value + counters.cache_misses_total.value > 0
          ? (
              (counters.cache_hits_total.value /
                (counters.cache_hits_total.value + counters.cache_misses_total.value)) *
              100
            ).toFixed(2) + "%"
          : "0%",
    },

    // workflows ו-agents
    workflows: {
      totalExecutions: counters.workflow_executions_total.value,
      byStatus: counters.workflow_executions_total.labels.status,
    },
    agents: {
      totalActions: counters.agent_actions_total.value,
      byType: counters.agent_actions_total.labels.action_type,
    },

    // מסמכים וקול
    documents: {
      totalProcessed: counters.documents_processed_total.value,
      byType: counters.documents_processed_total.labels.type,
    },
    voice: {
      totalTranscriptions: counters.voice_transcriptions_total.value,
      byLanguage: counters.voice_transcriptions_total.labels.language,
    },

    // משתמשים ומשימות
    business: {
      activeUsers: gauges.active_users.value,
      pendingApprovals: gauges.pending_approvals.value,
      overdueTasks: gauges.overdue_tasks.value,
    },

    // חותמת זמן
    generatedAt: new Date().toISOString(),
  };
}

// ============== Express Middleware ==============

/**
 * Middleware לרישום אוטומטי של בקשות HTTP
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    // עדכון חיבורים פעילים
    gauges.http_active_connections.value++;

    // רישום בסיום התגובה
    res.on("finish", () => {
      const duration = Date.now() - start;
      gauges.http_active_connections.value--;

      recordRequest(req.method, req.path, res.statusCode, duration);
    });

    next();
  };
}
