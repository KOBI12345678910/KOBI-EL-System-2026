# ONYX AI — Audit & Hardening Report

**Auditor:** Agent-16
**Date:** 2026-04-11
**Scope:** `onyx-ai` TypeScript platform
**Branch:** master
**Version audited:** package.json `2.0.1` / code banner `2.0.0`

---

## 1. Architecture Summary

ONYX AI is an institutional-grade, event-sourced autonomous-agent control plane. It is written in TypeScript (CommonJS, ES2022 target) and is organised as a single monolithic platform with the following layers, all wired together inside `OnyxPlatform`:

| Layer | File / Class | Purpose |
|---|---|---|
| Foundational primitives | `src/index.ts` (top section) | `uid`, `MonotonicClock`, `Result<T,E>`, `BackoffCalculator`, `RateLimiter` (token bucket), `CircuitBreaker`, `WorkerPool` |
| Event sourcing | `EventStore` | Append-only log with SHA-256 hash-chain tamper-evidence, subscribe/query/snapshots/WAL flush, `auditReport()` |
| Governance / Compliance | `Governor` | Policy engine (rate_limit / budget / approval_required / blacklist / whitelist / time_window / risk_limit), kill switch, `evaluate()`, `activateKillSwitch()`, `getComplianceReport()` |
| Knowledge graph | `KnowledgeGraph` | Entities, relationships, temporal versioning, simple search |
| Tool registry | `ToolRegistry` | Plugin system for tool invocations, cost/risk-aware |
| Agents | `AgentRuntime` | Agent manifest + lifecycle (start/suspend/terminate) |
| DAG orchestrator | `DAGOrchestrator` | Workflow DAG definition + execution, parallelism + backpressure |
| HTTP API | `APIServer` | Bare-bones `http.Server`, no Express, default port 3100 (bootstrap overrides to 3200) |
| Platform | `OnyxPlatform` (exported) | Boots all subsystems, `addPolicy/addAgent/addTool/defineWorkflow/runWorkflow/kill/shutdown/report` |
| Integrations | `src/integrations.ts` | `CredentialVault` (AES-256-CBC), `HttpClient`, webhook receivers (WhatsApp/Stripe/Twilio/Slack with HMAC verification), CRM/Payments/AI/LLM tool connectors |
| Domain modules | `src/modules/*.ts` | `procurement-engine`, `procurement-hyperintelligence`, `financial-autonomy-engine`, `hr-autonomy-engine`, `dms`, `data-flow-engine`, `intelligent-alert-system`, `situation-engine`, `subcontractor-decision-engine` |
| Duplicated platform | `src/onyx-platform.ts` | Near-identical duplicate of `src/index.ts`. Both export `OnyxPlatform`. Dead code/drift risk. |

Bootstrap (bottom of `src/index.ts`, guarded by `require.main === module`) reads env vars, constructs `OnyxPlatform`, adds a default "Daily Budget" policy, and calls `onyx.start({ apiPort: PORT })`. Default port is `3200`.

### Module exports (`src/index.ts` bottom)

- **Values:** `EventStore, Governor, KnowledgeGraph, ToolRegistry, AgentRuntime, DAGOrchestrator, CircuitBreaker, RateLimiter, WorkerPool, BackoffCalculator, Ok, Err, uid`
- **Types:** `DomainEvent, Policy, PolicyRule, GovernanceDecision, Entity, Relationship, AgentManifest, AgentState, ToolDefinition, DAGNode, DAGExecution, Result`
- `OnyxPlatform` is exported as a named class from both `src/index.ts` and `src/onyx-platform.ts`.

### Entry point / runtime

- `main` in `package.json` = `dist/index.js`
- `start` script = `node dist/index.js`
- `dev` script = `ts-node src/index.ts`
- Environment variables consumed by the bootstrap block:
  - `PORT` (default `3200`)
  - `ONYX_EVENT_STORE_PATH` (default `./data/events.jsonl`)
  - `ONYX_DAILY_BUDGET` (default `500`)
  - `ONYX_GLOBAL_BUDGET` (default `1000`)
- Dependencies declared but **not used** by `src/index.ts`: `express`, `cors`, `helmet`, `dotenv`. The current server uses the raw `http` module. These packages are only referenced in `src/integrations.ts`.

---

## 2. API Surface

All routes are served by `APIServer` inside `src/index.ts` (lines ~2261-2419) via raw `http.createServer`. There is **no framework** (no Express, no Fastify).

| Method | Path | Handler | Notes |
|---|---|---|---|
| `GET` | `/api/status` | returns engine/version/status, agent reports, tools, KG stats, event count, compliance | Unauthenticated |
| `GET` | `/api/events?limit=&type=` | event query | Unauthenticated |
| `GET` | `/api/audit?since=` | `eventStore.auditReport()` | Unauthenticated |
| `POST` | `/api/knowledge/query` | body is `KnowledgeQuery` | Unauthenticated, no input validation |
| `POST` | `/api/knowledge/entity` | creates entity from raw body (`body as any`) | Unauthenticated, **unvalidated write** |
| `POST` | `/api/kill` | activates kill switch | **Unauthenticated kill switch** |
| `POST` | `/api/resume` | deactivates kill switch | **Unauthenticated resume** |
| `POST` | `/api/agent/:id/suspend` | suspends agent | Unauthenticated |
| `GET` | `/api/integrity` | hash-chain verification | Unauthenticated |
| `OPTIONS` | `*` | 204 CORS preflight | Allows `*` origin |

There are **no** `/health`, `/ready`, `/metrics`, or `/version` routes. Unknown routes return 404 with no correlation ID. Error responses use bare `{ error: message }` and `500` without logging or tracing.

---

## 3. Policy System Design

Policies live in `Governor` (`src/index.ts` lines ~603-945).

- A `Policy` has: `id, name, description, type, scope, scopeTarget?, rule, active, priority, createdAt, createdBy`.
- `PolicyRule` is a discriminated union over `rate_limit | budget | approval_required | blacklist | whitelist | time_window | risk_limit`.
- Scopes: `global | agent | task_type | tool | department`.
- `Governor.evaluate(action)`:
  1. Kill switch overrides everything.
  2. All active policies are sorted by priority DESC.
  3. For each policy whose scope matches, `evaluatePolicy()` runs and may return `violation | requiresApproval | approvers | riskContribution | reasoning`.
  4. Any `block`/`critical` severity → `allowed = false`.
  5. Every decision is appended as a `governance.decision` event.
- Kill switch is binary (`killSwitch: boolean`). `activateKillSwitch(actor, reason)` / `deactivateKillSwitch(actor)`.
- **Gaps:**
  - `whitelist` has a case in the type union but no case in `evaluatePolicy` switch (silent pass-through).
  - There is no persistence of rate-limit state across restarts (in-memory `RateLimiter`).
  - `evaluatePolicy` treats the `budget` rule's `currentSpent` separately from `budgetTrackers`, so the `rule.currentSpent` field is stale on read.
  - Approval queue (`approvalQueue`) is declared but no route currently drains it.
  - No policy-level `updatePolicy`/`removePolicy`/`deactivatePolicy` API — policies can only be added.

---

## 4. Budget System Design

Budget tracking is a side-effect of `Governor.evaluatePolicy` for rule type `budget`:

- `budgetTrackers: Map<string, { spent: number; resetAt: number }>` keyed by `budget:${policyId}`.
- Rolling 24-hour window: on first hit, `resetAt = now + 86_400_000`. If `Date.now() > resetAt`, the tracker resets to zero.
- Enforces two caps: `rule.maxCostPerTask` (per-call) and `rule.maxCostPerDay` (rolling 24h).
- On successful eval, the tracker is incremented **eagerly** (before the action actually runs), so a rejected action that still got past `evaluate` will still have consumed budget. There is no post-action reconcile / refund.
- `getComplianceReport()` surfaces `budgetUtilization` per policy-name with `{ spent, limit, percent }`.
- Bootstrap adds a default `"Daily Budget"` policy with `maxCostPerTask=50`, `maxCostPerDay=ONYX_DAILY_BUDGET (default 500)`. `ONYX_GLOBAL_BUDGET` is passed to `governorConfig.globalBudget` but the current `Governor` constructor only accepts `(eventStore)` — **this value is silently dropped**.
- No persistence of spent amounts across restarts.
- No currency handling beyond a string field.
- No per-agent budget enforcement — `AgentManifest.budgetPerDay` exists but there is no code path that consults it.

---

## 5. tsconfig.json Strictness Issues

Current `tsconfig.json` (`./tsconfig.json`):

```jsonc
{
  "strict": true,                 // GOOD — enables most strict flags
  "noImplicitAny": false,         // WEAKENED — overrides strict
  "noUnusedLocals": false,        // WEAKENED
  "noUnusedParameters": false,    // WEAKENED
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true
}
```

Specific issues:

1. **`noImplicitAny: false`** explicitly cancels one of the most important strict-mode checks. This is why `src/index.ts` has many `body as any`, `input.url as string`, and `action as Record<string, unknown>` casts that would have surfaced typing problems.
2. `noUnusedLocals` and `noUnusedParameters` disabled — dead variables hide.
3. Missing: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `useUnknownInCatchVariables` (default true from strict), `noImplicitOverride`.
4. `lib: ["ES2022", "DOM"]` — DOM is unused by a Node-only service and leaks browser globals.
5. `target: "ES2022"` + `module: "commonjs"` is fine for Node ≥ 20 but not `NodeNext` module resolution — ESM interop is fragile.
6. No `paths`/`baseUrl` tree — `baseUrl: "./src"` is declared but no path maps use it.
7. No project references even though there are effectively two platform files (`index.ts` and `onyx-platform.ts`).

---

## 6. Missing Tests

There are **no tests** in the repository:

- No `test/` or `tests/` directory.
- No `*.test.ts` / `*.spec.ts` files (also reflected by `tsconfig.json` excluding them).
- `npm test` in `package.json` is literally `"echo \"tests coming soon\" && exit 0"`.
- No test runner declared (no `jest`, `vitest`, `mocha`, `tap`, `node:test`).
- No CI config (`.github/workflows`, `.gitlab-ci.yml`, etc.).

Recommended coverage priorities:

1. `EventStore` — append, hash-chain integrity, tamper detection, snapshot/query, WAL round-trip.
2. `Governor.evaluate` — each rule type, priority ordering, kill switch, budget window reset, stale reset edge case.
3. `RateLimiter` — token-bucket refill, burst, `tryAcquire(cost)`.
4. `CircuitBreaker` — CLOSED→OPEN→HALF_OPEN→CLOSED state transitions.
5. `APIServer` — each route, 404 path, malformed JSON body, CORS preflight.
6. Bootstrap smoke test (spawn process, curl `/api/status`).
7. Integration: `OnyxPlatform.kill`, `.shutdown`, `.report`.

---

## 7. Missing Docs

- **No `README.md`** at project root.
- No `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`.
- No `docs/` directory.
- No OpenAPI / Swagger spec for the HTTP surface.
- No example `.env.example` file listing the environment variables the bootstrap consumes.
- No architecture diagram file (the ASCII diagram is embedded in the source file header).
- No operator runbook for kill-switch / resume / budget reset.
- The in-code USAGE example (lines ~2624-2681 of `src/index.ts`) is the **only** onboarding documentation.

---

## 8. Security Issues

| # | Severity | Issue | Location | Recommendation |
|---|---|---|---|---|
| S1 | **Critical** | `/api/kill` and `/api/resume` are unauthenticated — any reachable client can halt the platform | `APIServer.route` | Require API key or mTLS + audit actor |
| S2 | **Critical** | All `/api/*` routes are unauthenticated | `APIServer.route` | Apply `apiKeyMiddleware` (see `src/security.ts`) |
| S3 | High | `Access-Control-Allow-Origin: *` with no credential restriction, combined with mutating POSTs | `APIServer.start` | Lock CORS to explicit origins; use `cors` package already in deps |
| S4 | High | No rate limiting on the HTTP surface (only internal `RateLimiter` for policies) | `APIServer` | Add per-IP token bucket middleware |
| S5 | High | `POST /api/knowledge/entity` accepts `body as any` and writes to the graph without schema validation | `APIServer.route` | Validate with zod/ajv before `upsertEntity` |
| S6 | High | `JSON.parse` of request body has no size limit; request body is buffered unbounded | `APIServer.readBody` | Enforce `Content-Length` max (e.g., 1 MB) and stream timeout |
| S7 | Medium | `helmet` is a dependency but not applied anywhere (no `X-Frame-Options`, `Content-Security-Policy`, etc.) | `APIServer.start` | Set security headers manually or migrate server to Express + helmet |
| S8 | Medium | Event store on disk is plaintext JSONL — tamper-evident but not confidential. Payloads may contain PII | `EventStore.flushToDisk` | Encrypt at rest (reuse `CredentialVault` AES-256 from `integrations.ts`) |
| S9 | Medium | Bootstrap logs `✓ Event store: ${EVENT_STORE_PATH}` and banners but no structured logs. No correlation ID on HTTP responses. | `src/index.ts` bootstrap | Introduce structured logger, include `req.headers['x-correlation-id']` in responses |
| S10 | Medium | `process.on('uncaughtException', ...)` triggers shutdown, but `unhandledRejection` only logs — inconsistent | Bootstrap | Decide on single policy, document it |
| S11 | Low | `Math.random()` is used in `BackoffCalculator` jitter — acceptable, but the code header claims "No `Math.random()` pretending to be intelligence" which misleads readers | `BackoffCalculator.calculate` | Comment clarifying that jitter is intentional |
| S12 | Low | No cleartext secrets were found in source, but there is no `.env.example` — users may commit `.env` accidentally | root | Add `.gitignore` entry for `.env` (verify), ship `.env.example` |
| S13 | Low | `src/onyx-platform.ts` duplicates `src/index.ts`. Any fix applied to one must be mirrored — drift is almost guaranteed | root | Delete the duplicate or convert one to a re-export |
| S14 | Low | `noImplicitAny: false` hides type holes in governance-critical code paths | `tsconfig.json` | Enable and fix casts |

No hard-coded credentials were found in the two platform files.

---

## 9. Integration with `onyx-procurement`

**Can `onyx-procurement` call `onyx-ai` today?** *Technically yes, but only as an unauthenticated peer.*

- `onyx-ai` exposes a plain HTTP interface on port `3200` via the built-in `APIServer`. There is **no client library**, no SDK, no OpenAPI spec, no HMAC, no API key middleware.
- Searching `onyx-procurement/src` for `onyx-ai`, `ONYX_AI`, `localhost:3200`, `HMAC`, `X-API-Key` returns **no references**. `onyx-procurement` has no code calling `onyx-ai`.
- `onyx-procurement` is a separate JavaScript project (`server.js`, `src/*.js`) — not TypeScript, not importing `onyx-ai` as a package.
- `onyx-ai/src/modules/procurement-engine.ts` and `procurement-hyperintelligence.ts` are **local**, in-process engines inside onyx-ai — not integration clients for the external `onyx-procurement` project.
- `onyx-ai/src/integrations.ts` provides full HMAC-based webhook verification for WhatsApp / Stripe / Twilio / Slack (`verifyHubSignature`, `verifyStripeSignature`, `verifyTwilioSignature`, `verifySlackSignature`), and an AES-256-CBC `CredentialVault`. These facilities are **not yet wired into `APIServer`**, so the HTTP surface does not benefit from them.

**Protocol recommendation** for a production `onyx-procurement → onyx-ai` link:

1. **Auth:** Shared-secret HMAC over request body (timestamp + path + body) in header `X-ONYX-Signature: t=<ts>,v1=<hex>`, plus `X-API-Key` from `ONYX_AI_API_KEYS`. Reject if timestamp drift > 5 min.
2. **Transport:** HTTPS (terminate at reverse proxy). mTLS is ideal for internal-only.
3. **Idempotency:** Require `Idempotency-Key` header on POSTs; dedupe in event store.
4. **Schema:** Publish a zod/JSON-schema contract for each endpoint (`/api/knowledge/entity`, `/api/events`, etc.).
5. **Budget awareness:** Procurement calls should pass `estimatedCost` so the Governor can enforce budgets end-to-end.
6. **Correlation:** Require `X-Correlation-Id`; echo in response; include in every event payload.
7. **Rate limits:** Per-API-key token bucket at the edge; 429 on exhaustion.
8. **Circuit breaking:** Procurement side should wrap the onyx-ai call in the existing `CircuitBreaker` primitive.

The new `src/security.ts` and `src/health.ts` files created alongside this audit are the first two bricks for step 1 and steps 6/7.

---

## 10. Summary of Recommended Next Steps (in order)

1. Wire `src/security.ts` `apiKeyMiddleware` into `APIServer` so `/api/kill`, `/api/resume`, `/api/knowledge/entity` are authenticated.
2. Wire `src/health.ts` `registerHealthRoutes` for `/health` and `/ready`.
3. Delete or collapse `src/onyx-platform.ts` into a re-export.
4. Turn on `noImplicitAny` + `noUnusedLocals` + `noUnusedParameters` and fix the fallout.
5. Add a minimal `vitest` or `node:test` suite starting with `EventStore` + `Governor`.
6. Add `README.md`, `.env.example`, and a `docs/api.md` (OpenAPI).
7. Replace the raw `http` server with Express + `helmet` + `cors` (both already in deps).
8. Persist `budgetTrackers` and approval queue state to the event store for crash-safe recovery.
9. Define and publish the onyx-procurement ↔ onyx-ai HMAC protocol (see Section 9).
10. Decide whether `ONYX_GLOBAL_BUDGET` should actually enforce a cap or be removed from the bootstrap (currently a no-op).

---
*End of audit-report.md*
