"use strict";
// ═══════════════════════════════════════════════════════════════════════════
//  TECHNO-KOL OPS → ONYX AI Bridge
//  BUG-07 fix — Agent QA-03 integration audit
//
//  Purpose:
//    HTTP client allowing techno-kol-ops (port 3200/5000) to consume
//    onyx-ai (port 3300) intelligence services:
//      - Work-order / project anomaly detection
//      - Forecast queries for capacity planning
//      - AI insight retrieval for operational dashboards
//      - Quality scoring for execution QA
//      - Health check for circuit-breaker readiness
//
//  Design principles (identical to procurement-bridge):
//    1. Fail-open — ops never crashes because AI is down.
//    2. Bounded latency — 5s timeout.
//    3. Retry transient (network + 5xx) up to 3 times, exp backoff.
//    4. X-API-Key auth via ONYX_AI_API_KEY env var.
//    5. No new deps — Node 20+ global fetch.
//
//  Environment variables:
//    ONYX_AI_URL       default 'http://localhost:3300'
//    ONYX_AI_API_KEY   shared secret (fail-open if missing)
// ═══════════════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiBridgeClient = void 0;
exports.getDefaultAiClient = getDefaultAiClient;
// ── Constants ─────────────────────────────────────────────────
const DEFAULT_BASE_URL = 'http://localhost:3300';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 250;
const RETRYABLE_STATUS = new Set([502, 503, 504, 408, 429]);
// ── Logger fallback ───────────────────────────────────────────
const log = {
    info: (...a) => console.log('[ops→ai]', ...a),
    warn: (...a) => console.warn('[ops→ai]', ...a),
    error: (...a) => console.error('[ops→ai]', ...a),
    debug: (..._a) => { },
};
// ── Client ────────────────────────────────────────────────────
class AiBridgeClient {
    constructor(opts = {}) {
        this.baseUrl = (opts.baseUrl || process.env.ONYX_AI_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.apiKey = opts.apiKey || process.env.ONYX_AI_API_KEY || '';
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
        if (!this.apiKey) {
            log.warn('ONYX_AI_API_KEY not set — bridge calls will lack auth (fail-open)');
        }
    }
    // ── Core fetch with retry ─────────────────────────────────
    async request(method, path, body) {
        const url = `${this.baseUrl}${path}`;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), this.timeoutMs);
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                };
                if (this.apiKey)
                    headers['X-API-Key'] = this.apiKey;
                const res = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: ac.signal,
                });
                clearTimeout(timer);
                if (res.ok) {
                    const data = await res.json();
                    return data;
                }
                if (RETRYABLE_STATUS.has(res.status) && attempt < this.maxRetries) {
                    const delay = this.backoffBaseMs * Math.pow(2, attempt);
                    log.warn(`${method} ${path} → ${res.status}, retry ${attempt + 1}/${this.maxRetries} in ${delay}ms`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                log.error(`${method} ${path} → ${res.status} (non-retryable)`);
                return null;
            }
            catch (err) {
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
    /** Detect anomalies for an entity (project, work-order, employee) */
    async detectAnomalies(entityType, entityId) {
        return this.request('POST', '/api/anomaly/detect', {
            entity_type: entityType,
            entity_id: entityId,
        });
    }
    /** Get a forecast for a metric (capacity, cost, schedule) */
    async getForecast(metric, horizonDays = 30, context) {
        return this.request('POST', '/api/forecast/query', {
            metric,
            horizon_days: horizonDays,
            context,
        });
    }
    /** Retrieve AI insights for a specific entity or domain */
    async getInsights(params) {
        const qs = new URLSearchParams();
        if (params?.entity_type)
            qs.set('entity_type', params.entity_type);
        if (params?.entity_id)
            qs.set('entity_id', params.entity_id);
        if (params?.category)
            qs.set('category', params.category);
        if (params?.limit)
            qs.set('limit', String(params.limit));
        const q = qs.toString();
        return this.request('GET', `/api/insights${q ? '?' + q : ''}`);
    }
    /** Get quality score for a work-order or project */
    async getQualityScore(entityType, entityId) {
        return this.request('GET', `/api/quality/score/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
    }
    /** Health check — returns true if onyx-ai /healthz responds 200 */
    async healthCheck() {
        try {
            const data = await this.request('GET', '/healthz');
            return data?.ok === true;
        }
        catch {
            return false;
        }
    }
}
exports.AiBridgeClient = AiBridgeClient;
// ── Singleton ─────────────────────────────────────────────────
let _defaultClient = null;
function getDefaultAiClient() {
    if (!_defaultClient) {
        _defaultClient = new AiBridgeClient();
    }
    return _defaultClient;
}
