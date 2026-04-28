# AGENT 278 — CONNECTIONS #3: Procurement → AI Bridge (silent 404)

**Auditor:** Agent 278 — Connections
**Date:** 2026-04-29
**Scope:** procurement-side `ai-bridge.js` ↔ onyx-ai HTTP surface
**Verdict:** **CONFIRMED.** Bridge silently 404s on every business call. The bridge is fail-open by design, so callers see `null` and continue — but every policy check, audit event, and budget probe is silently dropped.
**Severity:** CRIT (R1 in AGENT-03)
**Fix size:** ~30 lines, single file (`onyx-ai/src/onyx-platform.ts`).

---

## 1. Files audited

| File | Path | Role |
|---|---|---|
| Caller | `onyx-procurement/src/ai-bridge.js` | Outbound HTTP client (procurement side) |
| Loader | `onyx-ai/src/index.ts:2993` | Bootstrap — `require('./onyx-platform')` |
| Live runtime | `onyx-ai/src/onyx-platform.ts` | Server actually serving traffic on `:3200` |
| Dead twin | `onyx-ai/src/index.ts` (lines 2360–2693) | Has the four shim endpoints — **never executed** |
| Prior audit | `_qa-reports-25/AGENT-03-runtime-onyx-ai.md` §7 | Identifies same root cause |

---

## 2. Bridge route map (what procurement actually calls)

Every call originates in `OnyxAiClient` (lines 79–282 of `ai-bridge.js`) and is routed through `_request(method, path, body)` (line 114). Base URL defaults to `http://localhost:3200` (line 58).

| # | Bridge method | HTTP | Path | Caller code | Sends body | Expects body |
|---|---|---|---|---|---|---|
| 1 | `evaluatePolicy(req)` | POST | `/evaluate` | line 228 | `{action, po_id?, vendor_id?, amount, currency, metadata?}` | `{allow, reason, cost}` |
| 2 | `recordEvent(ev)` | POST | `/events` | line 256 | `{type, actor, timestamp, subject, payload?}` | enqueue OK (boolean) |
| 3 | `getBudgetStatus()` | GET | `/budget` | line 269 | — | `{daily_spent, daily_limit, remaining}` |
| 4 | `healthCheck()` | GET | `/health` | line 279 | — | HTTP 200 = alive |

Auth: `X-API-Key: $ONYX_AI_API_KEY` header on every call (line 117).
Timeout: 5s per attempt, 3 retries with `250/500/1000ms` backoff (lines 56–57).
Soft-miss handling: `RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}` retries; `SOFT_MISS_STATUS = {404, 501}` returns `null` **without warning** (lines 61–67, 159–164).

The `SOFT_MISS_STATUS` set is the trap: the bridge was patched in BUG-01 to treat 404 as "endpoint not wired on this deployment" and stay silent. That patch is **why this bug has been invisible** — every `/evaluate`, `/events`, `/budget`, `/health` call returns 404, the bridge sees a soft-miss, returns `null`, and the procurement caller logs nothing.

---

## 3. onyx-ai routing reality (what's actually wired)

The bootstrap in `index.ts:2993` does `require('./onyx-platform')`, so `onyx-platform.ts` is what serves traffic. Every shim added to `index.ts` (lines 2334–2693) is dead code.

### 3a. Routes present in `onyx-platform.ts` (the LIVE file)

| Method | Path | Line | Status |
|---|---|---|---|
| GET | `/api/status` | 2373 | OK |
| GET | `/api/events` | 2390 | OK |
| GET | `/api/audit` | 2405 | OK |
| POST | `/api/knowledge/query` | 2415 | OK |
| POST | `/api/knowledge/entity` | 2424 | OK (unauth — see AGENT-03 R3) |
| POST | `/api/kill` | 2430 | OK (unauth) |
| POST | `/api/resume` | 2438 | OK (unauth) |
| POST | `/api/agent/:id/suspend` | 2444 | OK |
| GET | `/api/integrity` | 2453 | OK |
| **fallback** | * | **2464** | **`return { status: 404, body: { error: 'Not found' } }`** |

### 3b. Routes the bridge needs — **ALL MISSING from `onyx-platform.ts`**

```
POST /evaluate   → 404 (caught by line 2464 fallback)
POST /events     → 404
GET  /budget     → 404
GET  /health     → 404
GET  /healthz    → 404
GET  /livez      → 404
GET  /readyz     → 404
```

Verified by `grep '/evaluate|/events|/budget|/health|/healthz|/livez|/readyz'` against `onyx-platform.ts` — **0 matches**. Same grep against `index.ts` — **9 matches** (lines 2289, 2334, 2348, 2361, 2367, 2379, 2447, 2479, 2496).

### 3c. The dead twin in `index.ts`

`index.ts` has the exact handlers the bridge expects, with the right shapes:

| Bridge call | Handler in `index.ts` | Returns |
|---|---|---|
| POST `/evaluate` | line 2379 | `{allow, reason, reason_he, cost, decision_id, event_id, threshold, action}` ✓ |
| POST `/events` | line 2447 | `{accepted: true, id, received_at}` ✓ |
| GET `/budget` | line 2479 | `{daily_spent, daily_limit, remaining, currency, report_snapshot}` ✓ |
| GET `/health` | line 2361 | `{ok: true, service, alias_of: '/healthz', uptime}` ✓ |
| GET `/healthz` | line 2334 | `{ok, service, version, uptime}` ✓ |
| GET `/livez` | line 2348 | `{alive: true}` ✓ |
| GET `/readyz` | line 2496 | 200 if Supabase up, else 503 ✓ |

These shapes exactly match what `ai-bridge.js` expects. They just live in the wrong file.

---

## 4. End-to-end failure trace

```
procurement.createPO()
  → ai.evaluatePolicy({action:'create_po', amount:50000, ...})
    → OnyxAiClient._request('POST', '/evaluate', body)
      → fetch('http://localhost:3200/evaluate', {headers:{'X-API-Key':...}})
        → onyx-ai (onyx-platform.ts) hits fallback at line 2464
        → returns 404 {error:'Not found'}
      → SOFT_MISS_STATUS.has(404) === true
      → log.debug('onyx-ai.soft_miss', ...)   ← debug, not warn
      → return null
    → ai-bridge returns null
  → procurement caller: `if (verdict && verdict.allow === false)` → false branch skipped
  → procurement proceeds as if AI said yes
```

Net effect: **every PO is auto-approved without policy check, no audit event lands in the EventStore from procurement, and the daily budget counter never increments.** Procurement `recordEvent()` calls fire-and-forget into the void. The Governor's kill-switch is unreachable from procurement.

---

## 5. Proposed fix — port endpoints into `onyx-platform.ts`

Two-step minimal patch. No new files, no new deps.

### 5a. Add the four shim endpoints to `onyx-platform.ts`'s `route()` method

Insert **before** line 2373 (`/api/status`) so probes/bridge endpoints win against any future wildcard. The handler bodies copy verbatim from `index.ts:2334–2542` (already vetted, matching shape, already use `this.eventStore.append({type, actor, aggregateId, aggregateType, payload})` which is the strict signature `onyx-platform.ts`'s EventStore actually requires — see AGENT-03 §2d).

```ts
// === BRIDGE COMPAT (Agent 278 / replaces Agent-Y-QA03) ============
// Procurement's onyx-procurement/src/ai-bridge.js calls these. They
// must live in this file because index.ts's APIServer is dead code
// (bootstrap at index.ts:2993 loads ./onyx-platform).
// ====================================================================

// GET /healthz, /livez, /health, /readyz — k8s probes + legacy alias
if (method === 'GET' && path === '/healthz') {
  const pkg = require('../package.json');
  return { status: 200, body: { ok: true, service: pkg.name, version: pkg.version, uptime: process.uptime() } };
}
if (method === 'GET' && path === '/livez') {
  return { status: 200, body: { alive: true } };
}
if (method === 'GET' && path === '/health') {
  return { status: 200, body: { ok: true, service: 'onyx-ai', alias_of: '/healthz', uptime: process.uptime() } };
}
// /readyz — copy lines 2496–2542 of index.ts as-is

// POST /evaluate — bridge policy check (copy lines 2379–2442 of index.ts)
// POST /events   — bridge audit ingest (copy lines 2447–2474 of index.ts)
// GET  /budget   — bridge budget status (copy lines 2479–2494 of index.ts)
```

### 5b. Confirm or add the root probe early in the request handler

`onyx-platform.ts` does **not** short-circuit `GET /` the way `index.ts:2289` does. Add at the top of the `http.createServer` callback (after CORS, before route()):

```ts
if (req.method === 'GET' && (req.url === '/' || req.url === '/healthz' || req.url === '/livez')) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'onyx-ai', version: '2.0.0', status: 'running' }));
  return;
}
```

This matches what `entrypoint.js` already returns canned (AGENT-03 R10), so once the platform serves it directly, the proxy can be retired.

### 5c. Verification steps

After the patch:

```
$ ONYX_AI_API_KEY=test curl -X POST http://localhost:3200/evaluate \
    -H 'X-API-Key: test' -H 'Content-Type: application/json' \
    -d '{"action":"create_po","amount":1000,"currency":"ILS"}'
→ 200 {"allow":true, "reason":"...", "decision_id":"eval-...", ...}

$ curl http://localhost:3200/budget -H 'X-API-Key: test'
→ 200 {"daily_spent":0,"daily_limit":500,"remaining":500,...}

$ curl -X POST http://localhost:3200/events -H 'X-API-Key: test' \
    -H 'Content-Type: application/json' \
    -d '{"type":"po.created","actor":"test","subject":"po-1"}'
→ 201 {"accepted":true,"id":"...","received_at":"..."}

$ curl http://localhost:3200/health -H 'X-API-Key: test'
→ 200 {"ok":true,"service":"onyx-ai","alias_of":"/healthz",...}
```

All four bridge methods now return non-null and behave as documented. EventStore size grows on each `recordEvent`. Governor's compliance report reflects evaluations.

### 5d. Alternative (riskier, larger blast radius)

Per AGENT-03 §9.1: delete `onyx-platform.ts`, change bootstrap to `require('./index')`. This would also fix the bug, but trades the missing endpoints for the missing rate-limiter, helmet headers, CORS allowlist, and strict EventStore signature that `onyx-platform.ts` carries. **Do not take this route** — port the endpoints instead.

---

## 6. Why the bug stayed invisible

1. **`SOFT_MISS_STATUS = {404, 501}`** in `ai-bridge.js:67` was added in "Agent-Y-QA03 BUG-01". It demoted 404 from a warn-log to a debug-log specifically to "stay quiet when the endpoint is not wired on this deployment". That patch made the wrong call: it should have been a one-time deploy-time warning, not a permanent silencer for a production bridge.
2. **Procurement is fail-open.** Bridge returning `null` is documented as "no answer — follow your local fail-open policy (usually: allow)" (lines 220–221). Net result: every check passes, no exception bubbles up.
3. **`entrypoint.js` shadows `/`, `/healthz`, `/livez`** with canned `{service:'onyx-ai',version:'2.0.0',status:'running'}` (AGENT-03 R10). So liveness/readiness checks **look healthy** even when the platform is broken. Container orchestrator never restarts the pod.
4. **Two parallel platform files** drift in opposite directions: `index.ts` gets the new endpoints, `onyx-platform.ts` gets the new security. Neither file is complete on its own.

---

## 7. Recommendation

| # | Action | Priority | Effort |
|---|---|---|---|
| 1 | Port endpoints from `index.ts` into `onyx-platform.ts` (§5a + §5b) | **P0** | 30 min |
| 2 | Re-tighten `SOFT_MISS_STATUS` to log a one-time WARN at startup if `/evaluate` 404s | P1 | 15 min |
| 3 | Make `entrypoint.js` proxy real `/healthz` from the platform instead of canned response | P1 | 10 min |
| 4 | Add smoke test that boots platform + asserts all four bridge endpoints return non-null | P1 | 30 min |
| 5 | Delete `onyx-integrations.ts` (third-copy duplicate, AGENT-03 §9.10) | P2 | 5 min |

Item 1 alone closes the silent 404. Items 2–4 prevent regression.

---

## 8. Bottom line

The procurement→AI bridge code itself is solid (clean fail-open semantics, X-API-Key, AbortController timeouts, exponential backoff, retry classification). The endpoints it calls were authored correctly **but landed in the wrong file**. Bootstrap loads `onyx-platform.ts`; the four shims sit unreachable in `index.ts`. Every business call from procurement to onyx-ai has been silently 404ing since BUG-01 added the `SOFT_MISS_STATUS` demotion. Fix is mechanical: copy seven handlers (200 lines) from `index.ts` into `onyx-platform.ts` and add a root-probe short-circuit.

Static audit only — no code was executed.

---
*End of AGENT-278-connections-ai-bridge.md*
