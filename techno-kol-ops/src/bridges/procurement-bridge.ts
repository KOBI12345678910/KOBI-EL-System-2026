// ═══════════════════════════════════════════════════════════════════════════
//  TECHNO-KOL OPS → ONYX PROCUREMENT Bridge
//  BUG-07 fix — Agent QA-03 integration audit
//
//  Purpose:
//    HTTP client allowing techno-kol-ops (port 3200/5000) to read from
//    onyx-procurement (port 3100) for:
//      - Purchase orders linked to projects / work-orders
//      - Invoices & payments for project financials
//      - Supplier data for supply-chain views
//      - Health check for circuit-breaker readiness
//
//  Design principles (same as existing ai-bridge / procurement-bridge):
//    1. Fail-open. Ops is mission-critical; if procurement is down,
//       every method returns `null` — NEVER throws.
//    2. Bounded latency — 5s timeout per attempt (AbortController).
//    3. Retry transient (network + 5xx) up to 3 attempts with
//       exponential backoff (250ms, 500ms, 1000ms).
//    4. X-API-Key authentication via ONYX_PROCUREMENT_API_KEY env var.
//    5. No new runtime deps — Node 20+ global fetch.
//
//  Environment variables:
//    ONYX_PROCUREMENT_URL       default 'http://localhost:3100'
//    ONYX_PROCUREMENT_API_KEY   shared secret (fail-open if missing)
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Types ─────────────────────────────────────────────────────

export interface ProcurementBridgeOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
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
}

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  customer_id?: string;
  supplier_id?: string;
  status: string;
  total_amount: number;
  currency: string;
  due_date: string;
}

export interface SupplierSummary {
  id: string;
  name: string;
  status: string;
  rating?: number;
}

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'http://localhost:3100';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 250;
const RETRYABLE_STATUS = new Set([502, 503, 504, 408, 429]);

// ── Logger fallback ───────────────────────────────────────────

const log = {
  info:  (...a: any[]) => console.log('[ops→procurement]', ...a),
  warn:  (...a: any[]) => console.warn('[ops→procurement]', ...a),
  error: (...a: any[]) => console.error('[ops→procurement]', ...a),
  debug: (..._a: any[]) => {},
};

// ── Client ────────────────────────────────────────────────────

export class ProcurementBridgeClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private maxRetries: number;
  private backoffBaseMs: number;

  constructor(opts: ProcurementBridgeOptions = {}) {
    this.baseUrl = (opts.baseUrl || process.env.ONYX_PROCUREMENT_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.apiKey = opts.apiKey || process.env.ONYX_PROCUREMENT_API_KEY || '';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;

    if (!this.apiKey) {
      log.warn('ONYX_PROCUREMENT_API_KEY not set — bridge calls will lack auth (fail-open)');
    }
  }

  // ── Core fetch with retry ─────────────────────────────────

  private async request<T>(method: string, path: string, body?: any): Promise<T | null> {
    const url = `${this.baseUrl}${path}`;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        };
        if (this.apiKey) headers['X-API-Key'] = this.apiKey;

        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: ac.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          return data as T;
        }

        if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
          const delay = this.backoffBaseMs * Math.pow(2, attempt);
          log.warn(`${method} ${path} → ${res.status}, retry ${attempt + 1}/${this.maxRetries} in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        log.error(`${method} ${path} → ${res.status} (non-retryable)`);
        return null;
      } catch (err: any) {
        clearTimeout(timer);
        if (attempt < this.maxRetries) {
          const delay = this.backoffBaseMs * Math.pow(2, attempt);
          log.warn(`${method} ${path} network error, retry ${attempt + 1}/${this.maxRetries} in ${delay}ms: ${err.message}`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        log.error(`${method} ${path} failed after ${this.maxRetries + 1} attempts: ${err.message}`);
        return null;
      }
    }
    return null;
  }

  // ── Public API ────────────────────────────────────────────

  /** Fetch purchase orders, optionally filtered by project or status */
  async getPurchaseOrders(filters?: { status?: string; project_id?: string; limit?: number }): Promise<PurchaseOrderSummary[] | null> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    const data = await this.request<any>('GET', `/api/purchase-orders${qs ? '?' + qs : ''}`);
    // procurement returns { orders: [...] } — normalise
    if (data && Array.isArray(data.orders)) return data.orders;
    if (data && Array.isArray(data.data)) return data.data;
    if (Array.isArray(data)) return data;
    return null;
  }

  /** Fetch invoices for a specific project or customer */
  async getInvoices(filters?: { project_id?: string; customer_id?: string; status?: string }): Promise<InvoiceSummary[] | null> {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.customer_id) params.set('customer_id', filters.customer_id);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return this.request<InvoiceSummary[]>('GET', `/api/invoices${qs ? '?' + qs : ''}`);
  }

  /** Fetch supplier list or a single supplier by ID */
  async getSuppliers(filters?: { status?: string; limit?: number }): Promise<SupplierSummary[] | null> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return this.request<SupplierSummary[]>('GET', `/api/suppliers${qs ? '?' + qs : ''}`);
  }

  /** Fetch a single supplier by ID */
  async getSupplier(id: string): Promise<SupplierSummary | null> {
    return this.request<SupplierSummary>('GET', `/api/suppliers/${encodeURIComponent(id)}`);
  }

  /** Health check — returns true if procurement /healthz responds 200 */
  async healthCheck(): Promise<boolean> {
    try {
      const data = await this.request<{ ok?: boolean }>('GET', '/healthz');
      return data?.ok === true;
    } catch {
      return false;
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────

let _defaultClient: ProcurementBridgeClient | null = null;

export function getDefaultProcurementClient(): ProcurementBridgeClient {
  if (!_defaultClient) {
    _defaultClient = new ProcurementBridgeClient();
  }
  return _defaultClient;
}
