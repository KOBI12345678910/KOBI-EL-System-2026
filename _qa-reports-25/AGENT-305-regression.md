# AGENT-305 — Regression Audit (Worked-before / Works-now / Broken / Drifted)

**Agent:** 305 — Regression Agent
**Date:** 2026-04-29
**Owner:** kobi.ellkayam@technokoluzi.com
**Branch:** `claude/objective-merkle-40ff93`
**Worktree:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`
**Method:** git-log diff vs current source + AGENT-291 (`2,094/2,102` payroll tests, 8 fail) + AGENT-289/290/292/295/297 cross-references.
**Scope:** All existing surfaces — old screens, business logic, permissions, API endpoints, reports, processes.

---

## 0. Executive Verdict

**AMBER**. The regression is dominated by **silent contract drift** (UI not consuming server filters, RBAC defined but unused, RLS enabled with zero policies) rather than hard breakage. Two payroll suites have **real assertion failures** (P0 release-blockers). Several pre-2026 features still ship with legacy constants (VAT 17% literals) despite the 2026-01-01 rate change. New code added in `phase-1b … phase-19` did not break the old test suite, but it widened the surface faster than the test surface.

| Bucket | Count | Highest severity |
|---|---:|---|
| **Worked → still works** (PASS unchanged) | 49 of 51 payroll suites + 45 FULL regression rows | — |
| **Worked → BROKEN** (real failures) | 2 suites, 8 cases (consolidator, dunning) | **P0** |
| **Worked → SILENTLY DRIFTED** (regressed in behavior) | 7 features (filters, RBAC, RLS, audit, period close, refund, agorot) | **P0/P1** |
| **Never worked** (false-positive feature) | 5 (Lead360, Order360, Delivery360, Payment360, Closure360) | **P1** |
| **New flake** | 1 (`check-printer` cold-start) | **P3** |

---

## 1. Methodology

1. `git log --oneline` walk from `7a02049` (today) back to `689a22d` (v1.0.0 release tag, 2025-Q4) — ~140 commits inspected.
2. Cross-reference with **AGENT-291** (51 payroll suites, 2,094/2,102 pass, 8 fail).
3. Cross-reference with **AGENT-297** (regression matrix per release: 45 FULL / 16 PART / 14 GAP across 7 categories).
4. Cross-reference with **AGENT-289** (filters/search) + **AGENT-290** (perm enforcement) + **AGENT-295** (pen-test) + **AGENT-292** (stale VAT tests).
5. For each finding: title + description + steps-to-reproduce + actual + expected + severity + module + fix.

---

## 2. Issues — Ranked by Severity

### REG-01 [P0 / Finance / Consolidator] — Group consolidation books out of balance by 1,312.50

- **Description:** 6 of 24 tests in `consolidator.test.js` fail. Single-leg eliminations (IC sales/COGS/interest/management fees) work. Equity-side eliminations (investment-vs-sub-equity, NCI, FV uplift) and FX-CTA balancing all fail. The full-stack regression case quantifies a `debitCreditDelta = -1312.5` and `balanceSheetDelta = -1312.5` — the consolidated trial balance does NOT balance.
- **Steps:** `cd onyx-procurement && node --test test/payroll/consolidator.test.js`
- **Actual:** exit 1, 6 fails, 1,312.50 imbalance.
- **Expected:** 24/24 pass, debit total = credit total.
- **Was working:** Yes — passing in v1.0.0 (commit `689a22d`); broke during `phase-2` finance/governance mega-batches (`fc13c81`, `af2838c`).
- **Severity:** **P0 release-blocker.**
- **Module:** `onyx-procurement/src/payroll/consolidator.js` (engine), `test/payroll/consolidator.test.js:267` (first fail).
- **Fix:** Audit equity-elimination JE generator. Likely a missing elimination JE or sign error in NCI/goodwill calc that propagates. Re-derive against IFRS 10 worked example and add unit test for each leg in isolation.

### REG-02 [P0 / Collections / Dunning] — Promise-to-pay lifecycle inverted

- **Description:** 2 of 45 tests in `dunning.test.js` fail. (a) Invoices in `promised` status are still being dunned, and the engine is not emitting the `:promised` skip-reason. (b) `reconcilePromises` flips `kept` → `broken` even when payment covered the promise amount.
- **Steps:** `node --test test/payroll/dunning.test.js`
- **Actual:** Line 224 `reasons.some(r === 'INV-30:promised')` is falsy; line 302 `'broken' !== 'kept'`.
- **Expected:** Promised invoices skipped with reason; kept promises tagged `kept`.
- **Was working:** Yes — feature shipped in `e37e1c9 feat(portal)` and was green in v1.0.0.
- **Severity:** **P0** — customer-visible billing bug; we are dunning customers who already promised payment.
- **Module:** `onyx-procurement/src/payroll/dunning.js`.
- **Fix:** One bug surface. (1) add `'promised'` to skip-list and emit `${invoiceId}:promised` reason. (2) In `reconcilePromises`, fix amount-comparison direction (`payment >= promiseAmount` → `kept`).

### REG-03 [P0 / Tenancy / RLS] — `platform_organizations` and `platform_invoices` have RLS enabled with ZERO policies

- **Description:** RLS is *on* on the two most sensitive platform tables but no `CREATE POLICY` statements exist. With RLS on + zero policies, in the default `restrictive` mode all rows are *blocked*, in `permissive` mode all are *visible*. Either way the contract is undefined and depends on a Supabase quirk we cannot rely on.
- **Steps:** Inspect Supabase advisors / `pg_policies` for these two tables.
- **Actual:** RLS enabled, 0 policies (confirmed in AGENT-124).
- **Expected:** RLS enabled, ≥1 policy that scopes by `org_id` to JWT.
- **Was working:** Never validated. RLS toggle was added in `8efbf94 fix(sec+d031): harden 24 RLS policies` but these two tables were missed.
- **Severity:** **P0** — regulatory + multi-tenant exposure.
- **Module:** `supabase/migrations/00069*` and the `platform.*` schema.
- **Fix:** Add policies `org_id = (SELECT org_id FROM tenant_users WHERE user_id = auth.uid())`. De-duplicate `public.tenant_users` vs `platform.tenant_users` (one is empty).

### REG-04 [P0 / API / Cross-tenant] — Routes do NOT scope by `tenant_id`

- **Description:** Grep across `techno-kol-ops/src/routes/*.ts` and `onyx-procurement/server.js` returns **zero hits** for `tenant_id|company_id|org_id`. Any authenticated user can read/edit any row by guessing the UUID.
- **Steps:** `GET /api/clients/<other-tenant-uuid>` while authed as tenant A.
- **Actual:** Returns row.
- **Expected:** 403/404.
- **Was working:** Never. The schema had `tenant_id` since `f8620fc feat(security)` but the API never started filtering on it.
- **Severity:** **P0** — IDOR + cross-tenant data leak.
- **Module:** `techno-kol-ops/src/routes/*.ts`, `onyx-procurement/server.js`.
- **Fix:** Mount a global `app.use((req,_,next)=>{req.tenantId=req.user.tenantId;next()})` and add `AND tenant_id = $N` to every SELECT/UPDATE/DELETE.

### REG-05 [P0 / VAT / Logic] — VAT 17% literals still resolved at runtime in `api-server`

- **Description:** Israel raised VAT to 18% on **2026-01-01**. The fix landed in `e5e038c fix(critical): VAT 18%` for `crm-ultimate.ts:266` and `:867`, and **AGENT-292** updated 3 stale tests in `expense-manager.test.js`. However, the `feat(phase-1b)` commit hint "VAT 18%" only updated *some* literals, and AGENT-271 + AGENT-292 confirm the audit is incomplete.
- **Steps:** `grep -rn "0\.17\|VAT.*17" --include='*.{js,ts,sql}' .` outside test fixtures.
- **Actual:** Several files still ship 17% in defaults / fallback paths.
- **Expected:** Single source of truth `VAT_STANDARD = 0.18` per `ISRAELI_TAX_CONSTANTS_2026.md`.
- **Was working:** Worked correctly *for 2025*. Drifted on `2026-01-01` because no migration plan.
- **Severity:** **P0** — VAT under-collected since 2026-01-01; PCN874 reconciliation will fail.
- **Module:** All files referenced by AGENT-271 + AGENT-292; `api-server/src/routes/crm-ultimate.ts` already partially patched.
- **Fix:** One constant, imported. Add CI grep-gate that fails build on `0.17` literal outside `__legacy__` test fixtures.

### REG-06 [P1 / Permissions / RBAC] — 850-line RBAC engine wired to only 5 of 39 routes

- **Description:** `onyx-procurement/src/auth/rbac.js` defines 11 roles × ~80 resources, but only 5 of 39 top-level Express routes call `requirePermission()`. In `techno-kol-ops`, RBAC reduces to one boolean check (`req.user?.role !== 'admin'`).
- **Steps:** Audit the route mounts in `server.js` and `index.ts` against the RBAC engine's resource list.
- **Actual:** 34/39 routes accept any authenticated request.
- **Expected:** Every state-changing route gated by `requirePermission(resource, action)`.
- **Was working:** Drifted. The RBAC engine landed in `f8620fc`; subsequent route additions in `phase-2 … phase-19` (1,371 → 1,425 routes) skipped wiring.
- **Severity:** **P1** — privilege escalation between authenticated roles.
- **Module:** `onyx-procurement/src/auth/rbac.js`, `server.js`, `techno-kol-ops/src/index.ts`.
- **Fix:** Sweep route registry, attach `requirePermission` middleware. Add lint rule that flags `app.post|put|delete` without a permission middleware on the same line.

### REG-07 [P1 / UX / Filters & Pagination] — UI never sends server-side filter or pagination params

- **Description:** Per AGENT-289, server endpoints support `status`, `material`, `client_id`, `from`, `to`, `limit`, `offset` query params with proper SQL `WHERE`. The UI calls `fetch()` bare. List pages silently truncate at the server-side default LIMIT (50, max 200), with **no UI paginator** — users see the first 50 rows only and have no signal more exist.
- **Steps:** Open `/clients` in `techno-kol-ops/client`, add 60 clients, observe 50 shown without "Next" button.
- **Actual:** First 50 only; silent.
- **Expected:** Client sends `?limit=&offset=`; UI shows page count.
- **Was working:** Never. Filter UI was wired client-side over the (truncated) server response from day one.
- **Severity:** **P1** — data appears to be missing without warning.
- **Module:** `techno-kol-ops/client/src/pages/Clients.tsx`, `Employees.tsx`, `WorkOrders.tsx`, `Materials.tsx`.
- **Fix:** Refactor `useApi` to accept `{filter, sort, page, pageSize}` and pass through to URL. Add `<Paginator>` component.

### REG-08 [P1 / Security / XSS] — 12 dashboard pages render via `innerHTML` with CSP disabled

- **Description:** `customer360.html`, `supplier360.html`, `quote360.html`, `po360.html`, `rfq360.html`, `entity360.html`, `bank-dashboard.html`, `vat-dashboard.html`, `pipeline-dashboard.html`, `onyx-dashboard.html`, `annual-tax-dashboard.html`, `status.html` all build rows via template strings and `tb.innerHTML = ...`. CSP is disabled at `server.js:110` (`contentSecurityPolicy: false`).
- **Steps:** `POST /api/suppliers {"name":"<script>alert(1)</script>"}` then load `/supplier360.html?id=...`.
- **Actual:** Script executes under admin session.
- **Expected:** Text-content escaping or strict CSP.
- **Was working:** Never validated. Pages added across `feat(phase-2)` mega-batches.
- **Severity:** **P1** (close to P0 if any of these is exposed to the internet).
- **Module:** all 12 HTML files in `onyx-procurement/web/`; `server.js:109-112`.
- **Fix:** Replace `innerHTML` with `textContent` or `escape(v)` helper. Enable CSP with hash-based `script-src 'self'` + `style-src 'unsafe-inline'`.

### REG-09 [P1 / Workflow / Master Flow gaps] — Lead, Order, Delivery, Payment, Closure 360 pages do not exist

- **Description:** CLAUDE.md prescribes 9 Master 360 pages and a Lead → Quote → Order → Project → ... → Closure flow. Per AGENT-204, **5 stages have no 360 page or route at all** (Lead, Order, Delivery, Payment, Closure). Navigation buttons for those stages are dead links.
- **Steps:** Click "Convert Lead" on customer360 — there is no Lead360 to land on.
- **Actual:** Nav broken / button hidden.
- **Expected:** Every Master Flow stage has a 360 page per CLAUDE.md "No Dead Pages Rule".
- **Was working:** Never. Drift between architecture spec and shipped pages.
- **Severity:** **P1** — feature contract violation.
- **Module:** `techno-kol-ops/client/src/pages/360/*`, `routeRegistry.ts`.
- **Fix:** Scaffold the 5 missing 360 pages from a template + register routes.

### REG-10 [P1 / GL / Period close] — No automated test for period-close lock

- **Description:** Per AGENT-297 GL-07, the period-close lock has no test. Without it, prior-period mutation breaks audit trail.
- **Steps:** `POST /api/journals` with `posted_at < period_close_date`.
- **Actual:** Insert succeeds (manual confirmation).
- **Expected:** 409 Conflict, `period_locked`.
- **Was working:** Unknown — no historical test.
- **Severity:** **P1**.
- **Module:** `onyx-procurement/src/finance/period-close.js` (likely missing).
- **Fix:** Add `test/finance/period-close.test.js`; enforce trigger at DB level.

### REG-11 [P1 / Payments / Refund flow] — No automated test for refund / reverse-posting

- **Description:** Per AGENT-297 PMT-11, refund flow has no automated test. Reversal is the highest-error-rate GL operation.
- **Severity:** **P1** — high-risk gap.
- **Fix:** Add `test/finance/refund-reverse-posting.test.js` covering full + partial + over-refund + already-refunded paths.

### REG-12 [P1 / Audit / Coverage] — Audit log spot-checks 3 of 18 orchestrator actions

- **Description:** AGENT-297 AUD-01 marks audit-log coverage as PART. Only 3 of the 18 executable actions in `orchestrator.js` are asserted.
- **Severity:** **P1** — silent regression risk on the other 15.
- **Fix:** Parametrize `qa-08-analytics-audit.test.js` over the full action list from `orchestrator.js`.

### REG-13 [P2 / VAT / Agorot rounding] — Banker's rounding not asserted

- **Description:** AGENT-297 VAT-10 — single-cent (agorot) drift fails PCN reconciliation. No automated rounding test.
- **Severity:** **P2** going-on-P1 because VAT filing is regulatory.
- **Fix:** Add `test/regression/qa-05-vat-rounding.test.js` with bankers-rounding fixtures.

### REG-14 [P2 / Payroll / Vacation, sick, maternity, calendar] — 4 GAP rows in PAY-* coverage

- **Description:** AGENT-297 PAY-06, PAY-07, PAY-08, PAY-14 are all `GAP` (vacation/sick accrual; maternity reimbursement; foreign worker tax; Hebrew calendar pay-date). Specs exist (QA-AGENT-93/94/136), tests don't.
- **Severity:** **P2** (legally mandated, but no current breakage).
- **Fix:** Wave-9 should pull each spec into a `test/payroll/*.test.js` file.

### REG-15 [P2 / Service / Test runners] — `onyx-procurement` `npm test` runs the wrong path

- **Description:** Per AGENT-158 §3, `onyx-procurement` `npm test` is `jest --testPathPattern='tests/.*\.test\.js$'` but 316 unit files live under `test/`, not `tests/`. The working invocation is `node --test test/**/*.test.js` (script `test:node`). `onyx-ai` `npm test` is literally `echo "tests coming soon" && exit 0` while 18 real tests sit on disk.
- **Severity:** **P2** — CI runs are not exercising the suites it claims to run.
- **Fix:** Switch `onyx-procurement` `test` script to `node --test "test/**/*.test.js"`. Replace `onyx-ai` placeholder with the real runner.

### REG-16 [P3 / Flake / `check-printer`] — Cold-start instability

- **Description:** `check-printer.test.js` failed exit 1 on the very first cold-start, then passed stably 4× in a row.
- **Severity:** **P3** — track only.
- **Fix:** Add to `flaky-test-watch.json`. If reproduces in CI, investigate filesystem / printer-mock warmup.

### REG-17 [P2 / Service / Health probe drift] — `/health` vs `/healthz`

- **Description:** `e5e038c` patched `docker-compose.prod.yml` from `/health` to `/healthz` for port 3100. Indicates path drift across services. Some agents still probe `/health`.
- **Severity:** **P2** — false-down alerts.
- **Fix:** Single canonical probe path `/healthz` on every service; bake into `qa-08-health-probes.test.js`.

### REG-18 [P2 / DB / Duplicate FKs and missing indexes] — `tenant_modules.tenant_id` declared 3×

- **Description:** Per AGENT-124, `tenant_modules.tenant_id` and `tenant_users.tenant_id` each have 3 FK constraints (mix of CASCADE / NO ACTION). FK indexes missing on `platform_subscriptions.org_id`, `platform_subscriptions.plan_id`, `platform_invoices.org_id`, `platform_invoices.subscription_id`.
- **Severity:** **P2** — performance + nondeterministic delete cascade.
- **Fix:** Drop dup FKs; add 6 missing FK indexes (migration `00072_*`).

### REG-19 [P3 / Auth / Default JWT secret committed] — Symbolic risk

- **Description:** `techno-kol-ops/.env.example` commits `JWT_SECRET=techno_kol_secret_2026_palantir`. Any deploy that didn't rotate the secret can be forged.
- **Severity:** **P3** locally (template), **P0** if any prod uses it.
- **Fix:** Replace with `CHANGE_ME` placeholder + boot-time check that refuses to start if equal to default.

### REG-20 [P2 / Service / `onyx-ai` & `techno-kol-ops` test scripts missing] — See REG-15

- **Description:** `techno-kol-ops` has no `test` script wired despite tests existing in `client/` and `src/`. Net effect: regressions in those packages do not block CI.
- **Severity:** **P2**.
- **Fix:** Add `"test": "vitest run"` (client) + `"test": "node --test 'src/**/*.test.js'"` (server).

---

## 3. Roll-up

| ID | Title | Sev | Module | Status |
|---|---|---|---|---|
| REG-01 | Consolidator imbalance 1,312.50 | P0 | finance | BROKEN |
| REG-02 | Dunning promise-to-pay inverted | P0 | collections | BROKEN |
| REG-03 | RLS on, 0 policies (platform_*) | P0 | tenancy | DRIFTED |
| REG-04 | API ignores tenant_id | P0 | API/security | DRIFTED |
| REG-05 | Stale VAT 17% literals | P0 | VAT | DRIFTED |
| REG-06 | RBAC engine unwired (5/39) | P1 | permissions | DRIFTED |
| REG-07 | Filters/pagination UI-only | P1 | UX | DRIFTED |
| REG-08 | XSS via innerHTML, CSP off | P1 | web | DRIFTED |
| REG-09 | 5 Master Flow 360 pages missing | P1 | navigation | NEVER-WORKED |
| REG-10 | Period-close lock untested | P1 | GL | GAP |
| REG-11 | Refund flow untested | P1 | payments | GAP |
| REG-12 | Audit covers 3/18 actions | P1 | audit | GAP |
| REG-13 | Agorot rounding untested | P2 | VAT | GAP |
| REG-14 | 4 payroll PAY-* gaps | P2 | payroll | GAP |
| REG-15 | `onyx-procurement` npm test wrong path | P2 | CI | DRIFTED |
| REG-16 | check-printer cold-start flake | P3 | payroll | FLAKY |
| REG-17 | /health vs /healthz drift | P2 | runtime | DRIFTED |
| REG-18 | Duplicate FKs / missing indexes | P2 | DB | DRIFTED |
| REG-19 | Default JWT secret committed | P3/P0 | auth | RISK |
| REG-20 | Test scripts missing in 2 packages | P2 | CI | DRIFTED |

**P0:** 5 issues — release blockers.
**P1:** 7 issues — must-fix-this-cycle.
**P2:** 6 issues — backlog with deadline.
**P3:** 2 issues — track.

---

## 4. Sign-off

Agent 305 confirms: regression posture is **AMBER**. Two test suites BROKEN (8 of 2,102 cases). Five P0 contract drifts must be patched before next release tag. The wave-2..wave-19 expansion (1,371 → 1,425 React routes, +30 migrations) outpaced the test/perm/RLS surface; pause feature work and run a clean-up wave to get back to P0=0.

**Reproduction one-liners:**
```
cd onyx-procurement && node --test test/payroll/consolidator.test.js
cd onyx-procurement && node --test test/payroll/dunning.test.js
grep -rn "0\\.17" --include='*.{js,ts}' onyx-procurement/src api-server/src
```

*End of AGENT-305 regression report.*
