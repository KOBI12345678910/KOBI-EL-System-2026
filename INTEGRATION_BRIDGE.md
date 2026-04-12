# Onyx Procurement ↔ Onyx AI — Integration Bridge

**Owner:** Agent-20 (Integration Bridge Wave)
**Status:** Stub / design contract — wire-up pending in server.js / index.ts
**Last updated:** 2026-04-11

This document describes the two-way HTTP bridge that lets `onyx-procurement`
(Express, port 3100) and `onyx-ai` (TypeScript, port 3200) cooperate without
tight coupling. Both services are independently deployable, independently
restartable, and each one must stay fully functional when the other is down.

---

## 1. Architecture

```
  ┌─────────────────────────────┐                 ┌─────────────────────────────┐
  │   onyx-procurement :3100    │                 │        onyx-ai :3200        │
  │   (Express / Node / JS)     │                 │     (Express / TS / Node)   │
  │                             │                 │                             │
  │   server.js                 │                 │   src/index.ts              │
  │   src/ai-bridge.js  ────────┼────POST /evaluate───▶  /evaluate route       │
  │   [OnyxAiClient]    ────────┼────POST /events  ───▶  /events   route       │
  │                     ────────┼────GET  /budget  ───▶  /budget   route       │
  │                     ────────┼────GET  /health  ───▶  /health   route       │
  │                             │                 │                             │
  │                             │◀─GET /api/purchase-orders ──── [Procurement   │
  │                             │◀─GET /api/analytics/savings ─    Client]     │
  │                             │                 │  src/procurement-bridge.ts │
  └─────────────────────────────┘                 └─────────────────────────────┘
         ▲                                                     ▲
         │     both sides authenticate with                    │
         └──────── X-API-Key (shared secret, env vars) ────────┘
```

**Key property:** the arrows are unidirectional per call, but both sides
hold a client. Procurement initiates policy/audit calls; AI initiates
observational read-only calls for dashboards and scoring. Neither side
exposes a mutating endpoint to the other beyond its normal public API.

---

## 2. Authentication Flow

Both services use pre-shared keys delivered via environment variables.
There is **no** interactive OAuth, no JWT exchange, no session state.

1. Ops provisions two secrets (one per direction) and deploys them as env
   vars on **both** hosts:
   - `ONYX_AI_API_KEY`         — secret that procurement sends to onyx-ai
   - `ONYX_PROCUREMENT_API_KEY` — secret that onyx-ai sends to procurement
2. Each outbound request includes a single header:
   ```
   X-API-Key: <shared-secret>
   ```
3. The receiving service validates the header against its own env var in a
   constant-time comparison and returns `401 Unauthorized` on mismatch.
4. Keys are rotated by deploying the new value to both sides and
   restarting each service. There is no hot-reload; short downtime on a
   key rotation is acceptable because the bridge is fail-open (§4).

**Secrets are never logged.** The procurement logger module already
redacts `req.headers["x-api-key"]` at the pino level (see
`onyx-procurement/src/logger.js`, `REDACT_PATHS`).

---

## 3. Environment Variables

Required on **both** services so either can reach the other:

| Variable                     | Used by           | Default                | Required |
|------------------------------|-------------------|------------------------|----------|
| `ONYX_AI_URL`                | onyx-procurement  | `http://localhost:3200`| no       |
| `ONYX_AI_API_KEY`            | onyx-procurement  | —                      | **yes**  |
| `ONYX_PROCUREMENT_URL`       | onyx-ai           | `http://localhost:3100`| no       |
| `ONYX_PROCUREMENT_API_KEY`   | onyx-ai           | —                      | **yes**  |

If the API key is missing on either side, `getDefaultClient()` returns
`null` and logs a warning. Callers must treat a null client as
"bridge disabled" and continue without AI assistance / without procurement
observability. **The service must not crash.**

---

## 4. Error-Handling Philosophy — Fail-Open, Never Block

Procurement handles real money. If the AI service returns an error or
times out, the procurement flow cannot be interrupted. The bridge
enforces this with four rules:

1. **No throws.** Every public method (`evaluatePolicy`, `recordEvent`,
   `getBudgetStatus`, `healthCheck`, `getPurchaseOrders`,
   `getAnalyticsSavings`) returns `null` / `false` on failure and logs a
   structured warning. Exceptions never bubble up to the Express layer.
2. **Bounded latency.** 5 s per attempt via `AbortController`; the whole
   retry envelope is bounded by `timeoutMs × (maxRetries + 1) +
   Σ backoff`, which is ≈ 21.75 s worst case with the defaults.
3. **Retry only transient failures.** Network errors and HTTP status codes
   408, 425, 429, 500, 502, 503, 504 are retried up to 3 times with
   exponential backoff `250 ms → 500 ms → 1000 ms`. All 4xx responses are
   considered client errors and are NOT retried.
4. **Callers decide the local policy.** A null response from
   `evaluatePolicy` means "no AI verdict"; the caller must fall back to
   its own local rules (usually: allow and flag for human review).

Symmetric rules apply to the onyx-ai → procurement direction: if
procurement is unreachable, AI dashboards show "data unavailable" instead
of erroring out, and scoring jobs skip the batch silently.

---

## 5. Endpoint Contracts

### 5.1 `POST /evaluate` (onyx-ai)

Ask AI whether a procurement action is permitted.

**Request body:**
```json
{
  "action": "create_po",
  "po_id": "po-42",
  "vendor_id": "vendor-7",
  "amount": 15000.00,
  "currency": "ILS",
  "metadata": { "category": "materials", "urgency": "normal" }
}
```

| Field      | Type   | Required | Notes                                       |
|------------|--------|----------|---------------------------------------------|
| `action`   | string | yes      | `create_po` \| `approve_po` \| `release_payment` |
| `po_id`    | string | no       | present for existing-PO actions             |
| `vendor_id`| string | no       | required when a vendor is known             |
| `amount`   | number | yes      | positive, money amount                      |
| `currency` | string | yes      | ISO-4217 code                               |
| `metadata` | object | no       | free-form, forwarded to the policy engine   |

**Response `200`:**
```json
{ "allow": true, "reason": "within budget and vendor approved", "cost": 0.0012 }
```

| Field    | Type    | Notes                                           |
|----------|---------|-------------------------------------------------|
| `allow`  | boolean | `true` to proceed, `false` to block             |
| `reason` | string  | human-readable explanation (shown in audit log) |
| `cost`   | number  | cost of the AI evaluation in USD (for budget)   |

**Error responses:** `401` (bad API key), `429` (rate limited),
`5xx` (transient). All retryable except `401`.

---

### 5.2 `POST /events` (onyx-ai)

Fire-and-forget audit event ingest.

**Request body:**
```json
{
  "type": "po.created",
  "actor": "user-17",
  "timestamp": "2026-04-11T09:30:00.000Z",
  "subject": "po-42",
  "payload": { "amount": 15000, "currency": "ILS", "vendor": "vendor-7" }
}
```

| Field       | Type   | Required | Notes                                            |
|-------------|--------|----------|--------------------------------------------------|
| `type`      | string | yes      | dotted event name                                |
| `actor`     | string | yes      | user id or service id                            |
| `timestamp` | string | no       | ISO-8601; auto-filled by the bridge if missing   |
| `subject`   | string | yes      | resource id the event is about                   |
| `payload`   | object | no       | free-form event-specific data                    |

**Response `202`:** `{ "queued": true }`. The procurement client ignores
the body and only cares whether the enqueue succeeded (returns a boolean).

---

### 5.3 `GET /budget` (onyx-ai)

Daily AI-spend budget counter.

**Response `200`:**
```json
{ "daily_spent": 4.27, "daily_limit": 50.00, "remaining": 45.73 }
```

All values in USD. The procurement UI uses this to warn when AI calls are
approaching the daily cap so human operators can intervene before the
cap is hit and `evaluatePolicy` starts returning `{ allow: false }`.

---

### 5.4 `GET /health` (onyx-ai)

Liveness probe. Any `2xx` response means "reachable". No auth required
beyond the standard `X-API-Key` header.

**Response `200`:** `{ "status": "ok", "uptime_s": 1234 }`

---

### 5.5 `GET /api/purchase-orders` (onyx-procurement)

Used by onyx-ai for observational analysis. Read-only.

**Query params (all optional):**
`status`, `vendor_id`, `from_date`, `to_date`, `min_amount`,
`max_amount`, `limit`, `offset`.

**Response `200`:**
```json
[
  {
    "id": "po-42",
    "po_number": "PO-2026-00042",
    "vendor_id": "vendor-7",
    "vendor_name": "Acme Industries Ltd",
    "status": "approved",
    "total_amount": 15000.00,
    "currency": "ILS",
    "created_at": "2026-04-10T08:15:00.000Z",
    "approved_at": "2026-04-10T09:20:00.000Z"
  }
]
```

The client also accepts `{ data: [...] }` so procurement can wrap the
payload in an envelope later without breaking onyx-ai.

---

### 5.6 `GET /api/analytics/savings` (onyx-procurement)

Used by onyx-ai dashboards.

**Response `200`:**
```json
{
  "period_start": "2026-04-01",
  "period_end":   "2026-04-11",
  "total_spend":    812340.55,
  "baseline_spend": 905500.00,
  "savings":         93159.45,
  "savings_pct":     10.29,
  "by_vendor":   { "vendor-7": 42000.00, "vendor-12": 18500.00 },
  "by_category": { "materials": 56000.00, "logistics": 22000.00 }
}
```

---

## 6. Files

| Path                                                 | Role                          |
|------------------------------------------------------|-------------------------------|
| `onyx-procurement/src/ai-bridge.js`                  | OnyxAiClient (JS, CJS)        |
| `onyx-procurement/src/ai-bridge.test.js`             | node:test unit tests          |
| `onyx-ai/src/procurement-bridge.ts`                  | OnyxProcurementClient (TS)    |
| `INTEGRATION_BRIDGE.md`                              | This document                 |

**Not modified by Agent-20:** `onyx-procurement/server.js`,
`onyx-ai/src/index.ts`, and all `package.json` files. Wire-up of the
bridges into the Express apps is a follow-up task for Agent-21.
