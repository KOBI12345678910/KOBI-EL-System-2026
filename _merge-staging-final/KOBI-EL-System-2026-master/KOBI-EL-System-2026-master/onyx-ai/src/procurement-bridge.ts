// ═══════════════════════════════════════════════════════════════════════════
//  ONYX AI → ONYX PROCUREMENT Bridge
//  Agent-20 — Integration Bridge (AI side, mirror direction)
//
//  Purpose:
//    Read-only client used by onyx-ai (port 3200) to observe onyx-procurement
//    (port 3100). Never mutates procurement state — used purely for:
//      • fetching purchase orders to score/analyse
//      • reading saving analytics for budget dashboards
//
//  Design principles (mirror of ai-bridge.js):
//    1. Fail-open. onyx-ai must never crash because procurement is down.
//       Every method returns `null` on unreachable / error — never throws.
//    2. Bounded latency — 5s timeout per attempt via AbortController.
//    3. Retry transient errors (network + 5xx) up to 3 times with
//       exponential backoff (250ms, 500ms, 1000ms).
//    4. X-API-Key authentication using ONYX_PROCUREMENT_API_KEY env var.
//    5. No new runtime dependencies — relies on Node 20+ global fetch.
//
//  Environment variables:
//    ONYX_PROCUREMENT_URL      default 'http://localhost:3100'
//    ONYX_PROCUREMENT_API_KEY  required (fail-open if missing)
//
//  Usage:
//    import { OnyxProcurementClient, getDefaultClient } from './procurement-bridge';
//    const proc = getDefaultClient();
//    const pos = await proc?.getPurchaseOrders({ status: 'open' });
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

// ───────────────────────────────────────────────────────────────
// Types — public surface
// ───────────────────────────────────────────────────────────────

export interface PurchaseOrderFilters {
  status?: 'draft' | 'pending' | 'approved' | 'open' | 'closed' | 'cancelled';
  vendor_id?: string;
  from_date?: string;  // ISO-8601
  to_date?: string;    // ISO-8601
  min_amount?: number;
  max_amount?: number;
  limit?: number;
  offset?: number;
}

export interface PurchaseOrderSummary {
  id: string;
  po_number: string;
  vendor_id: string;
  vendor_name?: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: string;
  approved_at?: string | null;
}

export interface AnalyticsSavings {
  period_start: string;
  period_end: string;
  total_spend: number;
  baseline_spend: number;
  savings: number;
  savings_pct: number;
  by_vendor?: Record<string, number>;
  by_category?: Record<string, number>;
}

export interface ILogger {
  info(msg: string, meta?: any): void;
  warn(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
  debug(msg: string, meta?: any): void;
}

export interface OnyxProcurementClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  logger?: ILogger;
  fetchImpl?: typeof fetch;
}

type InternalResult<T> = { ok: true; status: number; body: T } | null;

// ───────────────────────────────────────────────────────────────
// Defaults
// ───────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'http://localhost:3100';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 250;

const RETRYABLE_STATUS = new Set<number>([408, 425, 429, 500, 502, 503, 504]);

const consoleLogger: ILogger = {
  info:  (m, meta) => console.info('[onyx-procurement-bridge]', m, meta ?? ''),
  warn:  (m, meta) => console.warn('[onyx-procurement-bridge]', m, meta ?? ''),
  error: (m, meta) => console.error('[onyx-procurement-bridge]', m, meta ?? ''),
  debug: () => {},
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildQueryString(params: Record<string, any> | undefined): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// ───────────────────────────────────────────────────────────────
// OnyxProcurementClient
// ───────────────────────────────────────────────────────────────

export class OnyxProcurementClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly log: ILogger;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, apiKey: string, opts: OnyxProcurementClientOptions = {}) {
    if (!baseUrl || typeof baseUrl !== 'string') {
      throw new Error('OnyxProcurementClient: baseUrl is required and must be a string');
    }
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('OnyxProcurementClient: apiKey is required and must be a string');
    }

    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.log = opts.logger ?? consoleLogger;
    this.fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  // ───────────────────────────────────────────────────────────
  // Low-level request with timeout + retry.
  // Always returns { ok, status, body } | null. Never throws.
  // ───────────────────────────────────────────────────────────
  private async request<T>(method: string, path: string): Promise<InternalResult<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Accept': 'application/json',
      'User-Agent': 'onyx-ai/2.0.1 (procurement-bridge)',
    };

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await this.fetchImpl(url, {
          method,
          headers,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          this.log.warn('procurement.retryable_status', {
            url,
            status: res.status,
            attempt: attempt + 1,
          });
          await sleep(this.backoffBaseMs * Math.pow(2, attempt));
          continue;
        }

        let parsed: any = null;
        try {
          const text = await res.text();
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = null;
        }

        if (!res.ok) {
          this.log.warn('procurement.non_ok', {
            url,
            status: res.status,
            body: parsed,
          });
          return null;
        }

        return { ok: true, status: res.status, body: parsed as T };
      } catch (err: any) {
        clearTimeout(timer);
        lastError = err;
        const isAbort = err?.name === 'AbortError' || err?.code === 'ABORT_ERR';
        this.log.warn(
          isAbort ? 'procurement.timeout' : 'procurement.network_error',
          { url, attempt: attempt + 1, error: err?.message },
        );
        if (attempt >= this.maxRetries) break;
        await sleep(this.backoffBaseMs * Math.pow(2, attempt));
      }
    }

    this.log.warn('procurement.unreachable', {
      url,
      error: (lastError as any)?.message,
    });
    return null;
  }

  // ───────────────────────────────────────────────────────────
  // Public API — READ ONLY
  // Every method returns `null` on failure. Callers MUST handle null.
  // ───────────────────────────────────────────────────────────

  /**
   * getPurchaseOrders — list purchase orders matching the given filters.
   *
   * Observational only — does NOT mutate procurement state.
   * Returns `null` if onyx-procurement is unreachable.
   */
  async getPurchaseOrders(filters: PurchaseOrderFilters = {}): Promise<PurchaseOrderSummary[] | null> {
    const path = `/api/purchase-orders${buildQueryString(filters as any)}`;
    // Agent-Y-QA03 FIX (BUG-03): procurement's real /api/purchase-orders
    // route returns `{ orders: [...] }`, but this client previously only
    // understood `[...]` and `{ data: [...] }`, so every call silently
    // returned null. Accept all three shapes (and `purchase_orders` as
    // an extra-defensive alias).
    const res = await this.request<
      PurchaseOrderSummary[]
      | { data: PurchaseOrderSummary[] }
      | { orders: PurchaseOrderSummary[] }
      | { purchase_orders: PurchaseOrderSummary[] }
    >('GET', path);
    if (!res) return null;
    const body = res.body as any;
    if (Array.isArray(body)) return body as PurchaseOrderSummary[];
    if (body && Array.isArray(body.orders)) return body.orders as PurchaseOrderSummary[];
    if (body && Array.isArray(body.purchase_orders)) return body.purchase_orders as PurchaseOrderSummary[];
    if (body && Array.isArray(body.data)) return body.data as PurchaseOrderSummary[];
    return null;
  }

  /**
   * getAnalyticsSavings — fetch the procurement savings report for
   * dashboards and AI-driven budget recommendations.
   *
   * Agent-Y-QA03 FIX (BUG-03b): the real /api/analytics/savings route
   * returns `{ period, total_savings, procurement: {...}, subcontractor: {...} }`,
   * which only overlaps with this client's `AnalyticsSavings` interface
   * on the `savings` field. We now normalise both shapes so legacy
   * consumers that read `period_start/period_end/total_spend/savings_pct`
   * still get the data they expect, and new consumers can reach the
   * rich `by_source` / `raw` sub-objects.
   *
   * Returns `null` if onyx-procurement is unreachable.
   */
  async getAnalyticsSavings(): Promise<AnalyticsSavings | null> {
    const res = await this.request<any>('GET', '/api/analytics/savings');
    if (!res) return null;
    const body = res.body as any;
    if (!body) return null;
    // Legacy canonical shape — return as-is.
    if (
      typeof body.period_start === 'string' &&
      typeof body.period_end === 'string' &&
      typeof body.total_spend === 'number'
    ) {
      return body as AnalyticsSavings;
    }
    // Real procurement shape — normalise into the declared interface.
    const period = (body.period || {}) as { start?: string; end?: string };
    const totalSavings = Number(body.total_savings || 0);
    const procSpend = Number((body.procurement && body.procurement.total_spend) || 0);
    const subSpend = Number((body.subcontractor && body.subcontractor.total_spend) || 0);
    const totalSpend = procSpend + subSpend;
    const baselineSpend = Number(body.baseline_spend || (totalSpend + totalSavings));
    const savingsPct = baselineSpend > 0 ? (totalSavings / baselineSpend) * 100 : 0;
    const byVendor =
      (body.procurement && body.procurement.by_vendor) ||
      (body.by_vendor as Record<string, number>) ||
      undefined;
    const byCategory =
      (body.procurement && body.procurement.by_category) ||
      (body.by_category as Record<string, number>) ||
      undefined;
    const normalised: AnalyticsSavings & { raw?: unknown } = {
      period_start: period.start || (typeof body.period_start === 'string' ? body.period_start : ''),
      period_end: period.end || (typeof body.period_end === 'string' ? body.period_end : ''),
      total_spend: totalSpend,
      baseline_spend: baselineSpend,
      savings: totalSavings,
      savings_pct: savingsPct,
      by_vendor: byVendor,
      by_category: byCategory,
      raw: body,
    };
    return normalised;
  }

  /**
   * healthCheck — liveness probe against procurement.
   * Agent-Y-QA03 FIX (BUG-04): procurement exposes `/healthz` and
   * `/api/health`, but NOT `/health`. Previously this method hit the
   * non-existent `/health`, so it permanently returned false and any
   * circuit breaker depending on it blocked all traffic. We now hit
   * `/healthz` (the Kubernetes-style probe wired in Agent 41).
   * Returns true on HTTP 200, false otherwise.
   */
  async healthCheck(): Promise<boolean> {
    const res = await this.request<unknown>('GET', '/healthz');
    return res !== null;
  }
}

// ───────────────────────────────────────────────────────────────
// Lazy singleton from env vars
// ───────────────────────────────────────────────────────────────

let defaultClient: OnyxProcurementClient | null = null;

/**
 * getDefaultClient — lazy env-driven singleton.
 *   ONYX_PROCUREMENT_URL      default http://localhost:3100
 *   ONYX_PROCUREMENT_API_KEY  required — returns null if missing
 *
 * Returns `null` if the API key is missing so callers naturally fail-open.
 */
export function getDefaultClient(): OnyxProcurementClient | null {
  if (defaultClient) return defaultClient;
  const url = process.env.ONYX_PROCUREMENT_URL || DEFAULT_BASE_URL;
  const key = process.env.ONYX_PROCUREMENT_API_KEY || '';
  if (!key) {
    consoleLogger.warn('procurement.bridge.disabled', {
      reason: 'ONYX_PROCUREMENT_API_KEY not set — bridge disabled (fail-open)',
    });
    return null;
  }
  defaultClient = new OnyxProcurementClient(url, key);
  return defaultClient;
}

/** Reset the cached singleton — used by tests. */
export function _resetDefaultClient(): void {
  defaultClient = null;
}

export const _internal = {
  RETRYABLE_STATUS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BASE_URL,
};
