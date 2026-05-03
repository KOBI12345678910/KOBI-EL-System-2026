# AGENT-151 — Supabase Edge Functions Audit

**Scope:** `supabase/functions/` (Deno edge functions)
**Worktree:** `objective-merkle-40ff93` | **Branch:** `claude/objective-merkle-40ff93`
**Date:** 2026-04-29

## 1. Inventory (45 functions + `_shared/`)

| Category | Functions |
|---|---|
| **Commercial / Sales** | `approve-quote`, `reject-quote`, `send-quote`, `convert-quote-to-project`, `send-rfq`, `create-customer`, `create-supplier` |
| **Project / Execution** | `create-project`, `change-project-state`, `create-work-order` |
| **Procurement / Finance** | `approve-po`, `receive-po`, `issue-invoice`, `register-payment` |
| **Workforce** | `submit-attendance`, `approve-attendance` |
| **360 Reads** | `get-customer-360`, `get-employee-360`, `get-project-360` |
| **Orchestration / Jobs** | `enqueue-job`, `claim-job`, `complete-job`, `fail-job`, `retry-stuck-jobs`, `start-workflow-run`, `process-workflow-step` |
| **Inbox / Notifications** | `create-inbox-item`, `assign-inbox-item`, `resolve-inbox-item`, `reopen-inbox-item`, `create-notification`, `acknowledge-notification`, `resolve-notification`, `reopen-notification` |
| **Documents / AI** | `classify-document`, `extract-document-fields`, `generate-knowledge-card` |
| **Agents** | `restart-agent`, `requeue-agent-job` |
| **Platform / Admin** | `dispatch-domain-events`, `replay-dlq`, `refresh-read-models`, `save-kpi-definition`, `run-route-menu-permission-sync`, `get-route-menu-permission-sync-status` |

`_shared/`: `audit.ts`, `auth.ts`, `correlation.ts`, `env.ts`, `errors.ts`, `events.ts`, `idempotency.ts`, `logger.ts`, `permissions.ts`, `response.ts`, `state-history.ts`, `supabase-admin.ts`, `validators.ts`.

## 2. Two coexisting code generations (technical debt)

The codebase contains **two incompatible implementation styles**:

**Modern (39 files, std@0.224.0)** — `requireInternalUser(req, admin)`, `getAdminClient()`, `getCorrelationId`, `ok` / `failFromAppError`, `optionsResponse`, `requirePermission(actor, code, admin)` — this matches what `_shared/` actually exports.

**Legacy (6 files, std@0.177.0)** — `resolveAuth(req)`, `supabaseAdmin` (singleton), `resolveCorrelationId`, `fail(...)`, `created(...)`, `requirePermission(actor, code)` (2-arg), `requireValid`, `emitDomainEvent`, `requireEntityReadScope(actor, type, id)` (3-arg). Affected: `get-customer-360`, `get-employee-360`, `get-project-360`, `submit-attendance`, `receive-po`. **These will not compile** against the current `_shared/` because the symbols do not exist (e.g., `supabaseAdmin` is `getAdminClient`, `requirePermission` is 3-arg, `requireValid` is absent, `InvalidStateError` not exported, table refs use `.from("schema.table")` rather than `.schema(...).from(...)`).

## 3. Auth posture

`_shared/auth.ts::requireInternalUser` validates `Authorization: Bearer <jwt>` via `admin.auth.getUser(token)`, then resolves `governance.users_profile` by `auth_user_id`. Returns `{authUserId, userProfileId, email, fullName}`. Throws `UnauthorizedError` (401) on missing/invalid token or missing profile.

| Pattern | Functions |
|---|---|
| `requireInternalUser` only | `acknowledge-notification`, `assign-inbox-item`, `classify-document`, `extract-document-fields`, `generate-knowledge-card`, `enqueue-job`, `retry-stuck-jobs`, `restart-agent`, `requeue-agent-job`, `save-kpi-definition`, `start-workflow-run`, `run-route-menu-permission-sync`, `get-route-menu-permission-sync-status`, all `create-*`/`reopen-*`/`resolve-*` not listed below |
| `requireInternalUser` + `requirePermission(code)` | `approve-quote`, `reject-quote`, `send-quote`, `send-rfq`, `convert-quote-to-project`, `create-customer`, `create-supplier`, `create-work-order`, `create-project`, `change-project-state`, `approve-po`, `receive-po`, `issue-invoice`, `register-payment`, `submit-attendance`, `approve-attendance` |
| Legacy `resolveAuth` + `requireEntityReadScope` | `get-customer-360`, `get-employee-360`, `get-project-360` (broken — see §2) |
| **No auth (worker/cron)** | `claim-job`, `complete-job`, `fail-job`, `process-workflow-step`, `dispatch-domain-events`, `replay-dlq`, `refresh-read-models` |

The seven no-auth functions all use the service-role key directly and rely on Supabase's gateway-level JWT verification (default `verify_jwt=true` for non-OPTIONS) since there is no `config.toml` opt-out and no shared-secret check. Any holder of an anon JWT can invoke them and trigger admin-level mutations on `orchestration.*`, `governance.*`, and `analytics.*`. **High risk** — these should either require a service-role bearer, a shared `WORKER_SECRET` header, or be migrated to `pg_cron` invocations.

Permission checks call PG RPC `current_user_has_permission(p_permission_code)` and `can_read/write_parent_entity` — these depend on DB-side `auth.uid()` mapping, but the edge functions use the service-role client which **bypasses RLS**, so `auth.uid()` will be NULL inside the RPC. This is a likely silent bug for permission/scope enforcement worth verifying against the SQL definitions.

## 4. Secrets handling

All secrets pulled exclusively from `Deno.env.get`:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENVIRONMENT` — read in `_shared/env.ts` (fail-fast at module load) and `_shared/supabase-admin.ts` (lazy, throws on use).
- No other secrets referenced in functions. No webhook signing secret used in `dispatch-domain-events` (deliveries POST raw payload without HMAC) — **integrity risk for webhook consumers**.
- No `.env` files committed; no hardcoded keys found in any `index.ts`.
- `getAdminClient` correctly uses `{ autoRefreshToken: false, persistSession: false }`.
- Service-role key is used in every function (including read paths), bypassing RLS.

## 5. Cross-cutting middleware

| Concern | Implementation |
|---|---|
| CORS | `_shared/response.ts` — `Access-Control-Allow-Origin: *` (broad), allows `authorization, x-correlation-id, x-request-id, content-type`. `OPTIONS` preflight via `optionsResponse()`. |
| Correlation | `getCorrelationId(req)` reads `x-correlation-id` / `x-request-id` else `crypto.randomUUID()`. Threaded into audit, events, state-history, log records. |
| Logging | `_shared/logger.ts` emits structured JSON to stdout (level, ts, event, ...payload). |
| Audit | `_shared/audit.ts::writeAudit` → `governance.audit_logs`. Errors swallowed (`console.error`). |
| Domain events | `_shared/events.ts::writeDomainEvent` → `governance.domain_events`. Errors swallowed. |
| State history | `_shared/state-history.ts::writeStateHistory` → `governance.state_history`. Throws on error. |
| Idempotency | `_shared/idempotency.ts::claimIdempotencyKey` / `setIdempotencyResult` — implemented but **not invoked by any function**. Dead code or pending wiring. |
| Validation | `_shared/validators.ts` (`requireString`, `requirePositiveNumber`, `requireDateString`, `optionalString`, `optionalNumber`). Used inconsistently — many functions use raw `Number()`/`String()` casts. |

## 6. Deployment

- **`supabase/config.toml`** — local-dev only (project ref `ponypxhushxeskxgrmha`, ports 543xx, schemas `public`, `graphql_public`). No `[functions.<name>]` blocks → all functions deploy with default `verify_jwt=true`.
- **No `deno.json` / `import_map.json`** — every file pins URLs inline (`https://deno.land/std@0.224.0/...`, `https://esm.sh/@supabase/supabase-js@2.45.0`). Two stragglers still on `std@0.177.0` and `@supabase/supabase-js@2` (no minor pin). **Inconsistency risk**.
- **No CI workflow for `supabase functions deploy`** found in this audit (separate from `dev/` artifacts). Deployment is manual via `supabase functions deploy <name>`.
- **No tests** — no `*.test.ts` colocated; no integration harness in `supabase/`.
- The legacy 6 functions (§2) **will fail at deploy-time type-check** unless the `_shared/` exports are restored or files are rewritten.

## 7. Findings summary

**Blockers (P0)**
1. 6 legacy 360 / receive-po / submit-attendance functions reference non-existent `_shared/` exports — broken.
2. 7 no-auth worker functions allow any authenticated client to drive admin-level state changes.
3. Permission RPCs called via service-role client lose `auth.uid()`; `requirePermission` may be vacuous unless RPCs accept actor id explicitly (not visible from edge code).

**High (P1)**
4. CORS `*` on mutating endpoints.
5. Webhooks dispatched without HMAC signing.
6. Audit/event writes swallow errors silently — possible governance gaps.
7. Idempotency module is unused — exactly-once semantics not enforced anywhere.

**Medium (P2)**
8. Two `std` versions and two `@supabase/supabase-js` pins coexist.
9. No `deno.json`, no test suite, no per-function `[functions.*]` config.
10. Legacy code uses `from("schema.table")` string-prefix syntax (likely 404s) vs modern `.schema("x").from("y")`.

## 8. Files referenced

- `supabase/functions/_shared/{auth,permissions,response,events,audit,idempotency,errors,validators,env,supabase-admin,correlation,logger,state-history}.ts`
- `supabase/functions/{approve-quote,register-payment,start-workflow-run,process-workflow-step,dispatch-domain-events,replay-dlq,refresh-read-models,claim-job,complete-job,fail-job,retry-stuck-jobs,classify-document,extract-document-fields,generate-knowledge-card,save-kpi-definition,restart-agent,enqueue-job,acknowledge-notification,run-route-menu-permission-sync,get-route-menu-permission-sync-status}/index.ts`
- Legacy: `supabase/functions/{get-customer-360,get-employee-360,get-project-360,submit-attendance,receive-po}/index.ts`
- Config: `supabase/config.toml`
