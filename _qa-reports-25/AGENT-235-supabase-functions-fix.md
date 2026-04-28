# AGENT-235 — Supabase Edge Functions Fix Plan

**Agent:** 235 | **Date:** 2026-04-29 | **Branch:** `claude/objective-merkle-40ff93`
**Predecessor:** Agent 151 (flagged 6 broken legacy + 7 auth-less workers)
**Scope:** Repair / harden 13 edge functions under
`_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/imported-from-github/kobi-erp-ops/supabase/functions/`
**Status:** PLAN — patches specified, ready for apply.

---

## 1. Root Cause: Two Incompatible Shared-Module Generations

The `supabase/functions/_shared/` directory contains the **current generation**:

| Module | Exports |
|--------|---------|
| `supabase-admin.ts` | `getAdminClient()` (function, lazy) |
| `auth.ts` | `requireInternalUser(req, admin)` returning `ActorIdentity { authUserId, userProfileId, email, fullName }` |
| `correlation.ts` | `getCorrelationId(req)` |
| `response.ts` | `optionsResponse`, `ok`, `failFromAppError` |
| `errors.ts` | `AppError`, `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`, `normalizeError` |
| `events.ts` | `writeDomainEvent(admin, event)` — needs `partitionKey`, `causationId`, `metadata` |
| `idempotency.ts` | `claimIdempotencyKey(key, ttl)`, `setIdempotencyResult(key, result)` |
| `logger.ts` | `logInfo`, `logError` |

The 6 legacy functions import a **non-existent older generation**:

| Legacy import | Reality |
|---|---|
| `supabaseAdmin` (named const) from `supabase-admin.ts` | only `getAdminClient()` exists |
| `resolveAuth(req)` from `auth.ts` | only `requireInternalUser(req, admin)` exists |
| `requireEntityReadScope`, `requirePermission` from `permissions.ts` | **`permissions.ts` does not exist** |
| `requireValid` from `validators.ts` | **`validators.ts` does not exist** |
| `writeAudit` from `audit.ts` | **`audit.ts` does not exist** |
| `emitDomainEvent` from `events.ts` | only `writeDomainEvent` exists, different signature |
| `writeStateHistory` from `state-history.ts` | **`state-history.ts` does not exist** |
| `resolveCorrelationId` from `correlation.ts` | only `getCorrelationId` exists |
| `log` from `logger.ts` | only `logInfo`/`logError` exist |
| `actor.profileId` field | actor uses `userProfileId` |
| `created`, `fail` from `response.ts` | only `ok`, `failFromAppError`, `optionsResponse` |
| `InvalidStateError` from `errors.ts` | not exported |
| `AppError` constructor signature `("CODE: msg")` | constructor is `(msg, status, code, details)` |

Result: every one of the 6 functions fails at **deploy / cold-start** with `TS2305` / module-not-found. They never run.

**Decision:** rewrite all 6 against the current `_shared` API rather than re-introduce the dead older generation.

---

## 2. Fix List (4 sub-deliverables)

### A. Six legacy functions — full rewrite

| # | Function | Action |
|---|---|---|
| 1 | `get-customer-360` | rewrite — RPC `commercial_get_customer_360` |
| 2 | `get-employee-360` | rewrite — RPC `workforce_get_employee_360` |
| 3 | `get-project-360` | rewrite — RPC `execution_get_project_360` |
| 4 | `submit-attendance` | rewrite — insert into `workforce.attendance`, emit `attendance.submitted` |
| 5 | `receive-po` | rewrite — receipt loop, PO state recompute, emit `inventory.received_from_po` + `po.fully_received`/`po.partially_received` |
| 6 | `approve-po`, `approve-quote`, `convert-quote-to-project`, `change-project-state`, `issue-invoice`, `register-payment`, `send-quote`, `send-rfq`, `create-customer`, `create-supplier`, `create-project`, `create-work-order`, `reject-quote` | audit confirmed they share the same broken legacy import shape — same rewrite template |

> Agent 151 listed only 6 explicitly, but the full set carrying the legacy import header is ~17. Phase 1 below ships the named 6; Phase 2 sweeps the rest.

#### Canonical replacement template (used for all 6)

```ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { claimIdempotencyKey, setIdempotencyResult } from "../_shared/idempotency.ts";
import { logInfo } from "../_shared/logger.ts";
import { normalizeError, AppError, NotFoundError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();
  try {
    const actor = await requireInternalUser(req, admin);
    const idemKey = req.headers.get("Idempotency-Key") ?? "";
    const claim = await claimIdempotencyKey(idemKey);
    if (!claim.claimed) return ok(claim.existingResult, correlationId);

    /* per-function body — uses actor.userProfileId, admin.schema("...").from(...) */

    if (idemKey) await setIdempotencyResult(idemKey, result);
    return ok(result, correlationId);
  } catch (err) {
    return failFromAppError(normalizeError(err), correlationId);
  }
});
```

Field-level substitutions per function:

| Old (legacy) | New (current) |
|---|---|
| `actor.profileId` | `actor.userProfileId` |
| `from("workforce.attendance")` | `.schema("workforce").from("attendance")` |
| `from("procurement.purchase_orders")` | `.schema("procurement").from("purchase_orders")` |
| `from("inventory.inventory_receipts")` | `.schema("inventory").from("inventory_receipts")` |
| `emitDomainEvent({ ... })` | `writeDomainEvent(admin, { ..., partitionKey: \`${EntityType}:${id}\`, causationId: null, metadata: null })` |
| `requireEntityReadScope(actor, "Customer", id)` | drop — RLS + service-role + RPC enforces; if needed, add a `governance_check_entity_scope` RPC call |
| `requirePermission(actor, "...")` | replace with RPC `governance.check_permission(p_user_id, p_permission_code)` returning bool, throw `ForbiddenError` if false |
| `requireValid(body, schema)` | inline `if (!body.x || typeof body.x !== "number") throw new AppError("Invalid x", 400, "VALIDATION_ERROR")` |
| `writeAudit({ ... })` | `await admin.schema("governance").from("audit_log").insert({ ... })` (fields: entity_type, entity_id, action_name, source_service, source_module, old_values, new_values, performed_by_user_id, correlation_id) |
| `writeStateHistory({ ... })` | `await admin.schema("governance").from("state_history").insert({ ... })` |
| `created(data, cid)` | `ok(data, cid)` (HTTP 200; if 201 needed, add a small `created()` to `response.ts`) |
| `InvalidStateError(...)` | `new AppError(\`Invalid state: ${state}\`, 409, "INVALID_STATE", { allowed })` |

`receive-po` and `submit-attendance` keep their full business logic as-is in the original file — only the imports, auth, error classes, and event emission shape change.

---

### B. Shared-secret check on 7 worker functions

The seven functions below are invoked **only by Supabase cron / pg_net / internal jobs**, never by browser users. They currently accept any unauthenticated request — anyone with the function URL can dequeue jobs, force-fail jobs, or trigger DLQ replay.

**Fix:** require header `X-Worker-Secret: $WORKER_SHARED_SECRET` (env var) on every request; reject with 401 if missing/wrong.

#### New shared module: `_shared/worker-auth.ts`

```ts
import { UnauthorizedError } from "./errors.ts";

export function requireWorkerSecret(req: Request): void {
  const expected = Deno.env.get("WORKER_SHARED_SECRET");
  if (!expected) {
    throw new UnauthorizedError("Worker secret not configured on server");
  }
  const provided = req.headers.get("x-worker-secret") ?? "";
  // constant-time compare
  if (provided.length !== expected.length) {
    throw new UnauthorizedError("Invalid worker secret");
  }
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  if (mismatch !== 0) throw new UnauthorizedError("Invalid worker secret");
}
```

#### Patch: insert one line right after `if (req.method === "OPTIONS") return optionsResponse();`

| Function | File |
|---|---|
| 1 | `claim-job/index.ts` |
| 2 | `complete-job/index.ts` |
| 3 | `fail-job/index.ts` |
| 4 | `process-workflow-step/index.ts` |
| 5 | `dispatch-domain-events/index.ts` |
| 6 | `replay-dlq/index.ts` |
| 7 | `refresh-read-models/index.ts` |

```ts
import { requireWorkerSecret } from "../_shared/worker-auth.ts";  // add import

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();
  if (req.method === "OPTIONS") return optionsResponse();
  try {
    requireWorkerSecret(req);   // ← NEW LINE
    /* existing body unchanged */
```

#### Caller-side update

Cron/pg_net invocations must add the header. Example for the existing pg_cron job that hits `dispatch-domain-events`:

```sql
select cron.schedule(
  'dispatch-domain-events',
  '*/1 * * * *',
  $$ select net.http_post(
       url := 'https://<project>.functions.supabase.co/dispatch-domain-events',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'X-Worker-Secret', current_setting('app.worker_shared_secret')
       ),
       body := '{}'::jsonb
     ) $$
);
```

`app.worker_shared_secret` is set once via
`alter database postgres set app.worker_shared_secret = '<random-32-byte-base64>';`
and the same value must be set as `WORKER_SHARED_SECRET` in edge-function secrets.

---

### C. HMAC signing on `dispatch-domain-events` webhook deliveries

Today, outbound webhooks have no signature — the receiver cannot prove the call came from us, and a leaked `target_url` is fully replayable.

**Fix:** add `X-Signature-256: sha256=<hex>` and `X-Signature-Timestamp: <unix>` headers, computed per-endpoint.

#### Schema change (DB) — additive

```sql
alter table governance.webhook_endpoints
  add column if not exists hmac_secret text;        -- per-endpoint shared secret
comment on column governance.webhook_endpoints.hmac_secret is
  'HMAC-SHA256 secret used to sign outbound webhook bodies. Treat as confidential.';
```

#### New shared helper: `_shared/hmac.ts`

```ts
const enc = new TextEncoder();

export async function signHmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}
```

#### Patch in `dispatch-domain-events/index.ts`

Replace the existing `fetch(endpoint.target_url, { ... })` block:

```ts
const ts = Math.floor(Date.now() / 1000).toString();
const bodyJson = JSON.stringify({
  event_id: event.id, event_name: event.event_name, topic: event.topic_name,
  entity_type: event.entity_type, entity_id: event.entity_id,
  payload: event.payload, emitted_at: event.emitted_at,
});

const signedHeaders: Record<string,string> = {
  "Content-Type": "application/json",
  "X-Event-Name": event.event_name,
  "X-Event-Id": String(event.id),
  "X-Correlation-Id": event.correlation_id ?? correlationId,
  "X-Signature-Timestamp": ts,
};
if (endpoint.hmac_secret) {
  const sig = await signHmacSha256(endpoint.hmac_secret, `${ts}.${bodyJson}`);
  signedHeaders["X-Signature-256"] = `sha256=${sig}`;
}

const response = await fetch(endpoint.target_url, {
  method: "POST", headers: signedHeaders, body: bodyJson, signal: controller.signal,
});
```

Receivers verify by recomputing `hmac_sha256(secret, "${X-Signature-Timestamp}.${rawBody}")` and rejecting if `|now - ts| > 300s` (replay window).

The `replay-dlq` function must apply the same header construction when retrying webhook deliveries — currently it only sends `X-Retry-Attempt` and `X-Correlation-Id`. Same code block, lifted into a helper `signedFetch(endpoint, bodyJson, extraHeaders)` in `_shared/webhook.ts`.

---

### D. Idempotency module wiring

`_shared/idempotency.ts` already exists (claim/set against `governance.idempotency_keys`) but **no function imports it.** Wiring it makes write-mutating endpoints safe to retry.

#### Pattern (template above already shows it)

```ts
const idemKey = req.headers.get("Idempotency-Key") ?? "";
const claim = await claimIdempotencyKey(idemKey);
if (!claim.claimed) return ok(claim.existingResult, correlationId);
/* … do the work, build `result` … */
if (idemKey) await setIdempotencyResult(idemKey, result);
return ok(result, correlationId);
```

#### Where to wire (write-side functions only — never on `get-*-360`)

| Function | Reason |
|---|---|
| `submit-attendance` | retried mobile clients can otherwise create duplicate timesheet rows |
| `receive-po` | re-tap by user double-clicking would double-receive inventory |
| `approve-po`, `approve-quote`, `reject-quote`, `send-quote`, `send-rfq` | duplicate state transitions / external sends |
| `create-customer`, `create-supplier`, `create-project`, `create-work-order` | duplicate entities |
| `convert-quote-to-project`, `change-project-state`, `issue-invoice`, `register-payment` | duplicate financial postings |
| `complete-job`, `fail-job` | worker retry under network blip otherwise double-emits domain events |

**Skip** for read-only (`get-*-360`) and idempotent workers (`claim-job`, `dispatch-domain-events`, `replay-dlq`, `refresh-read-models`) — those are naturally idempotent on the queue/state.

#### DB note

`governance.idempotency_keys` table is referenced by the module. If the migration that creates it is not yet applied, ship:

```sql
create table if not exists governance.idempotency_keys (
  key text primary key,
  result jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);
create index if not exists ix_idempotency_keys_expires on governance.idempotency_keys(expires_at);
```

---

## 3. Apply Order

1. Migration: `idempotency_keys` table + `webhook_endpoints.hmac_secret` column.
2. Edge-function secret: set `WORKER_SHARED_SECRET` (32-byte random base64) on the project.
3. New shared modules: `_shared/worker-auth.ts`, `_shared/hmac.ts`, optional `_shared/webhook.ts`.
4. Patch 7 worker functions (one-line `requireWorkerSecret(req)` insert each).
5. Patch `dispatch-domain-events` + `replay-dlq` for HMAC headers.
6. Rewrite the 6 named legacy functions against current `_shared`.
7. Update pg_cron jobs to send the `X-Worker-Secret` header.
8. Set `hmac_secret` on each row in `governance.webhook_endpoints` and notify subscribers.
9. Sweep remaining ~11 functions still carrying the dead legacy header (Phase 2).

## 4. Verification Checklist

- [ ] `deno check supabase/functions/**/*.ts` — zero unresolved imports.
- [ ] `curl` to each worker function without `X-Worker-Secret` returns 401.
- [ ] `curl` with correct secret returns 200.
- [ ] Webhook receiver script verifies `X-Signature-256` against shared secret — passes.
- [ ] Same `Idempotency-Key` POSTed twice to `submit-attendance` produces one DB row, second response equals first.
- [ ] All 6 rewritten functions return 200 for happy-path, correct HTTP code (400/401/403/404/409) for error paths.
- [ ] `governance.audit_log` contains a row per write call.
- [ ] `governance.domain_events` contains the expected event with non-null `partition_key`.

## 5. Files Touched (absolute paths)

Rewrites:
- `_merge-incoming/techno-uzi-erp/Techno-Uzi-Erp/imported-from-github/kobi-erp-ops/supabase/functions/get-customer-360/index.ts`
- `.../get-employee-360/index.ts`
- `.../get-project-360/index.ts`
- `.../submit-attendance/index.ts`
- `.../receive-po/index.ts`
- `.../approve-po/index.ts` (Phase 1 sixth — same broken header)

Patches (one-line auth + HMAC):
- `.../claim-job/index.ts`
- `.../complete-job/index.ts`
- `.../fail-job/index.ts`
- `.../process-workflow-step/index.ts`
- `.../dispatch-domain-events/index.ts`
- `.../replay-dlq/index.ts`
- `.../refresh-read-models/index.ts`

New shared modules:
- `.../supabase/functions/_shared/worker-auth.ts`
- `.../supabase/functions/_shared/hmac.ts`
- `.../supabase/functions/_shared/webhook.ts` (optional helper)

Migration:
- `dev/migrations/2026-04-29-agent-235-functions-fix.sql` (idempotency_keys + webhook_endpoints.hmac_secret)

---

## 6. Risk & Rollback

- **Worker secret rollout** is the only breaking change. Mitigation: deploy functions and update cron in the **same maintenance window**; the old behaviour was unauthenticated, so if rollback is needed, redeploy prior tag — no data corruption either way.
- **HMAC** is additive (only sent when `hmac_secret` is set); existing webhook receivers keep working until you populate the column.
- **Idempotency** is opt-in (header-driven); old clients unaffected.
- **Legacy rewrites** restore functions that are currently 100% broken — net-positive, but verify each RPC (`commercial_get_customer_360`, `workforce_get_employee_360`, `execution_get_project_360`) actually exists in the current DB before deploying. If any RPC is missing, that function should land alongside the migration.

---

**End of report.** Apply via Phase 1 in this order: migration → secrets → shared modules → 7 worker patches → 6 rewrites → cron updates.
