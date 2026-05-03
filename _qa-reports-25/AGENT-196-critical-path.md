# AGENT-196 — Critical Path: Top 20 Production-Blockers

**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Inputs:** `_qa-reports-25/AGENT-{03,04,05,09,10,15,16,17,19,20,21,26-31,48,60,79,167}.md` + `git log` + `CLAUDE.md`
**Scope:** Cross-cut every audit, rank by leverage (blast radius x effort to ship), drop noise.
**Verdict:** **AMBER -> RED.** Repo has the right shape; runtime contracts and tenant isolation are not honored.

---

## Ranking method

Leverage = `(P0_severity_count_referencing_item) x (downstream_features_unblocked)` divided by `(hours_to_fix)`.
Top 20 are the items where one fix removes 5+ user-visible 404s, plugs a CRITICAL data-leak class, or unblocks an entire downstream batch (CI gate, tenant-RLS rollout, etc.).

| # | Item | Severity | Source agents |
|---|------|----------|---------------|
| 1 | Wire 6 pipeline APIs in `onyx-procurement/server.js` | P0 BLOCKER | 15, 16, 31, 79 |
| 2 | Fix tenant-RLS: 318 `USING(true)` policies + 59 disabled tables | P0 SECURITY | 09 |
| 3 | onyx-ai: collapse 3 platform files; require `./onyx-platform`; port endpoints | P0 BLOCKER | 03, 15 |
| 4 | onyx-ai: load `dotenv` at boot (every API key currently undefined) | P0 BLOCKER | 03 |
| 5 | Port collision: ONYX_AI on 3200 collides with techno-kol-ops | P0 | 15, 21, 03 |
| 6 | Add `tenant_id` indexes (29) before flipping any RLS predicate | P0 PERF | 09 |
| 7 | Add migrations gate to `deploy.yml` (no image without applied migration) | P0 | 20, 167 |
| 8 | Standardize healthcheck path `/healthz` everywhere; kill `/health` from compose | P0 | 20, 21 |
| 9 | Wire transition executor + 12 missing event-bus listeners | P1 | 16, 79, 31 |
| 10 | Fix 3 orchestrator preconditions referencing dead statuses | P0 RUNTIME | 16, 31 |
| 11 | Decide payroll ownership (`payroll-autonomous` OR `onyx-procurement/src/payroll`) | P0 | 15, 04 |
| 12 | Wire `vite-plugin-pwa` into `erp-app` + `techno-kol-ops/client` (dead PWA deps) | P1 | 17 |
| 13 | Add `dir="rtl"` to `<html>` in `erp-app/index.html` | P0 RTL | 17, 10 |
| 14 | onyx-ai: wrap Anthropic SDK calls with try/catch + retry + circuit-breaker | P1 | 03 |
| 15 | Add `pino.redact` paths to all 3 Node services (PII leak in logs) | P0 PRIVACY | 20 |
| 16 | Add `.dockerignore` discipline (currently leaks audit artifacts into images) | P0 | 20 |
| 17 | Build `pcn874.js` legacy flat-file fallback for VAT monthly | P1 IL | 19 |
| 18 | AI-Task-Manager: dedupe `@workspace/integrations-anthropic-ai` (pnpm install fails) | P0 BUILD | 05 |
| 19 | techno-kol-ops `start` requires pre-built `dist/` not committed; add `prestart` | P0 BOOT | 21 |
| 20 | Add 167 missing FK indexes (cascade-delete table-scan storm) | P1 PERF | 09 |

---

## #1 Wire 6 pipeline APIs (BLOCKS WHOLE 360-PAGE SUITE)

CLAUDE.md promises 6 pipeline endpoints. **Zero are mounted on Express.** `WorkOrder360.tsx:308` already POSTs to `/api/orchestrator/execute` -> 404 today.
- `GET /api/wiring/spec`
- `GET /api/entity-map/:type`
- `GET /api/state-machines/:type/transitions`
- `POST /api/orchestrator/execute`
- `GET /api/pipeline/stages`
- `GET /api/workflows/:id`

Modules under `onyx-procurement/src/pipeline/*` (6 files) export the data; `server.js:184` only requires `state-enforcement`. Mount the 6 routes -> unblocks all 9 360 pages, the WorkOrder action button, and the entire P0 build priority.

## #2 Tenant-RLS: 318 `USING(true)` + 59 disabled tables

Multi-tenant ERP with **none of the customer-data surface filtering by `tenant_id`**. Books-of-record (`gl_journal_entries`, `ap_invoices`, `ar_receipts`) read with literal `true`. `api_keys`, `env_variables`, `webhooks`, `tenant_integrations`, `system_logs` have **RLS DISABLED** -> wide open to anon.

Order matters: M2 (FK indexes) -> M4 (tenant_id indexes) -> M3 (add tenant_id to 57 child tables) -> M5/M77 (replace `true` policies) -> M78 (enable RLS on the 59).
Migrations 00072-00082 already drafted in Agent-09. Apply.

## #3 onyx-ai: 3 platform files, drift between them

`src/index.ts` (3045 lines) and `src/onyx-platform.ts` (2744 lines) and `src/onyx-integrations.ts` both export `OnyxPlatform`. Bootstrap at `index.ts:2990` does `require('./onyx-platform')` -> the file ACTUALLY loaded at boot is **missing every endpoint that procurement's `ai-bridge.js` calls**: `/evaluate`, `/events`, `/budget`, `/healthz`, `/livez`, `/readyz`, `/api/notifications/*`. Container looks alive (entrypoint.js shadows `/livez` with canned reply) while bridge 404s in production.

Fix: keep `onyx-platform.ts` as canonical, port the 7+ endpoints in, delete `index.ts` body and `onyx-integrations.ts`. 30-minute job, unblocks the entire procurement -> AI integration.

## #4 onyx-ai: dotenv never loaded

`dotenv` is in `package.json` but **zero imports** in `src/`. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `WHATSAPP_TOKEN`, `SUPABASE_*`, `ONYX_VAULT_KEY` all `undefined` unless shell-exported. `IntegrationRegistry.fromEnv` returns empty config; `createAITools` returns `[]`. The platform starts with **zero AI tools** and no warning. Add `import 'dotenv/config'` at the top of canonical bootstrap.

## #5 Port collision

`techno-kol-ops/src/index.ts:2979` defaults `PORT` to **`3200`** but logs `"ONYX AI listening on port..."`. CLAUDE.md says ONYX_AI = 3300, OPS = 3200 -> **second service to start hits EADDRINUSE**. `onyx-procurement/server.js:294,321` defaults `ONYX_AI_URL` to `http://localhost:3200`. Both wrong. Fix all three to 3300.

## #6 Add tenant_id indexes BEFORE flipping policies

29 tables have a `tenant_id` column but no index. Once #2 lands, every RLS predicate forces a seq-scan; OLTP latency dies. `CREATE INDEX CONCURRENTLY` on all 29 first. Migration M4 (00075) drafted.

## #7 Migrations gate in `deploy.yml`

`migrate.js` is solid (SHA-256 checksums, advisory lock, drift detection). But **no migration step in any GHA workflow**. Image can ship against unmigrated DB. Add `migrate` job: `--dry-run` on PR, real apply on merge to main, blocks `build-push` until success.

## #8 Healthcheck path drift

`docker-compose.prod.yml` queries `/health`; Dockerfiles + Railway query `/healthz`. Both work for procurement (it exposes both); **techno-kol-ops + onyx-ai + payroll are not guaranteed to expose `/health`**. Pick `/healthz` everywhere, delete `/health`. Add `/livez` + `/readyz` split for k8s probes.

## #9 Transition executor + 12 listeners

`state-machines.js` exposes only **read** endpoints. The 32 trigger entries and 12 orchestrator listener names (`ai.margin_and_risk_review`, `ops.try_allocate_received_stock`, etc.) are **decorative strings**. `bus.publish` is never called by `executeOrchestration`. The "listeners_notified" field in API responses is a lie. Add `POST /api/state-machines/:type/transition` + actual `bus.subscribe()` registrations for all 12.

## #10 Three orchestrator preconditions reference dead statuses

These will always fail at runtime:
- `project.create_work_order` checks `in_production` -> should be `in_procurement`
- `rfq.convert_to_po` checks `decided` -> should be `approved`
- `work_order.signoff` checks `done` -> should be `completed`

Trivial 6-character renames in `orchestrator.js`.

## #11 Payroll lives in 2 services

`onyx-procurement/src/payroll/*` AND `payroll-autonomous/src/*` are both wired and reachable simultaneously. Two parallel implementations = two sources of bugs, divergent constants, drift on every legal change. Decide ownership now (recommend `payroll-autonomous` canonical, deprecate procurement copy + the `registerPayrollRoutes` mount at line 1556).

## #12 Wire vite-plugin-pwa

`erp-app/vite.config.ts` does NOT import `vite-plugin-pwa`; `src/sw-custom.ts` is dead code. `techno-kol-ops/client` declares the dep but never invokes it. **Both apps ship without service workers despite intent.** Field workers on weak cellular get nothing.

## #13 Missing `dir="rtl"` on `<html>` in erp-app

CSS sets `body { direction: rtl }` but Radix UI checks `document.dir` for `Direction.Provider` defaults. Without `<html dir="rtl">`, dropdowns/popovers flip wrong on first render. Plus screen readers and a11y tools read from root.

## #14 Wrap Anthropic SDK calls

`agents/src/llm/client.ts` -> `anthropic.messages.create(...)` 4 times with **no try/catch, no retry, no circuit-breaker**. A 429 becomes unhandled rejection -> only logged. The `RateLimiter` + `CircuitBreaker` + `BackoffCalculator` primitives already exist in `index.ts`/`onyx-platform.ts` -- import and use them.

## #15 pino.redact for PII

`src/utils/sanitize.js` exists at tracker level only. **No global `pino.redact` config** in any of the 3 Node services. Ad-hoc `req.body` logs leak emails, JWTs, ID numbers. Add to logger init: `redact: ['req.headers.authorization', 'req.body.password', '*.email', '*.idNumber', '*.bankAccount']`.

## #16 .dockerignore

Without disciplined `.dockerignore`, build contexts leak `node_modules`, `.git`, `_qa-reports*/`, `_delivery/`, `_audit_tmp/`, `_merge-staging*/`, `*.env` into images. Bloats CI minutes AND can leak audit artifacts (PII, secrets) to anyone with `docker pull` access.

## #17 Build pcn874.js

PCN874 (monthly VAT summary, legacy flat-file) is **MISSING**. Only PCN836 (transaction detail) + the modern XML quarterly exist. If רשות המסים rejects XML for any month, fallback path is gone. ~200 LOC mirror of `pcn836.js`.

## #18 AI-Task-Manager: duplicate workspace package

`@workspace/integrations-anthropic-ai` declared in **two** folders. pnpm install will either fail or non-deterministically pick one. Blocks the api-server boot path entirely. Pick one; delete the other.

## #19 techno-kol-ops boot

`npm start` requires pre-built `dist/`; not committed. Either deploy from compiled artifact or add `prestart: "npm run build"` (matches onyx-ai's pattern). Without this, container builds that skip the build stage will fail.

## #20 167 missing FK indexes

Highest-traffic offenders are AP/AR books (`ap_invoice_lines.gl_account_id`, `ar_invoices.gl_account_id`, `ap_payment_allocations.invoice_id`), procurement (all `proc_*` tables), inventory (`inv_count_lines`, `inv_transactions`). Cascading deletes and JOIN queries scan whole tables today. Migration M2 (00073) drafted in Agent-09; uses `CREATE INDEX CONCURRENTLY`.

---

## Recommended sequence (5 sprints)

**Sprint 1 (week 1) - unblock runtime:**
- #3 onyx-ai consolidation + #4 dotenv + #5 port + #19 dist boot + #10 status renames

**Sprint 2 - mount the system:**
- #1 pipeline APIs + #8 healthcheck + #9 transition executor + 12 listeners + #11 payroll ownership

**Sprint 3 - tenant isolation (sequential, order-critical):**
- #6 tenant_id indexes -> #20 FK indexes -> #2 RLS hardening (M5/M77/M78) -> verify

**Sprint 4 - platform hygiene:**
- #7 migrations gate + #16 .dockerignore + #15 pino.redact + #14 SDK error handling + #18 pnpm dedupe

**Sprint 5 - UX polish + IL compliance:**
- #12 PWA wiring + #13 RTL fix + #17 pcn874 + cleanup of `_merge-staging*/`, dual CLAUDE.md, dead pipeline modules

---

## Out of scope for v1

Items deliberately deferred (not on the top-20):
- Multi-region (single IL region acceptable for v1)
- Sentry SDK wire-up (self-hosted tracker is functional)
- SBOM / cosign image signing
- 89 missing CHECK constraints (data validation, not isolation)
- 63 orphaned tables (catalog cleanup, not safety)
- Dark/light theme polish, i18n FR/EN expansion
- Agent-04 sick-pay ladder, allowance taxability nuances (legal-correctness P1, not deploy-blocker)

---

## Cross-references

- `_qa-reports-25/AGENT-09-db-integrity.md` - migrations 00072-00082 drafted
- `_qa-reports-25/AGENT-15-architecture.md` - service boundary drift map
- `_qa-reports-25/AGENT-03-runtime-onyx-ai.md` - onyx-ai 11-issue triage
- `_qa-reports-25/AGENT-16-state-machines.md` + `AGENT-79-event-bus.md` - listener gap proof
- `_qa-reports-25/AGENT-20-deploy.md` + `AGENT-167-ci-workflows.md` - CI/CD gates
- `_qa-reports-25/AGENT-19-il-compliance.md` - PCN874 + tax bracket verification

---

*End of AGENT-196-critical-path.md - 220 lines, under 300 target.*
