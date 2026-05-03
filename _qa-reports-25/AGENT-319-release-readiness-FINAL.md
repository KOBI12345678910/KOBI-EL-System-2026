# AGENT-319 — Release Readiness FINAL (Go/No-Go)

**Agent:** 319 (Final synthesis — Release Gate)
**Date:** 2026-04-29
**Branch:** `claude/objective-merkle-40ff93`
**Owner:** kobi.ellkayam@technokoluzi.com
**Inputs synthesized:** `MASTER_QA_REPORT.md` + `AGENT-300-FINAL-readiness.md` + 198 deduped findings (`AGENT-195-aggregator.md`) + critical-path top-20 (`AGENT-196`) + effort budget (`AGENT-197`) + 200-series patches/wiring/QA agents (201–299) + originals (03, 04, 05, 09, 16, 19, 20, 21, 31, 79).

> **Note on scope:** The brief asked for "AGENT-25" + "AGENT-301..318". Files 301–318 were never written (the 300-series stops at 300; AGENT-25 was rolled into the 200-series numbering). This report substitutes the equivalent coverage by synthesizing the **62 written agent reports + 138 reports referenced by the aggregator**. No finding is fabricated — every line cites the source agent.

---

## 0. VERDICT — `NO-GO. RED.`

Production deploy is **blocked**. The system is structurally rich (200+ entities, 6 pipeline modules, 13+ state machines, 9 P0 360 pages, 231 public tables) but **operationally dark** on every revenue-critical and regulatory path. Hard floor to true GO: **6 weeks** with a 4-person squad, **10 weeks realistic** with a 2-dev pair + part-time accountant + part-time DBA, **12–14 weeks** for a single mid-senior dev.

Aggregated finding count: **14 CRIT / 53 HIGH / 75 MED / 47 LOW = 198 deduped issues** (AGENT-195). Critical-path unblock: **~44 hr**. Full P0 close: **~270 dev-hours** (~34 dev-days).

---

## 1. Severity classification — by blocker class

| Class | Count | Examples (blocker IDs) |
|------:|------:|---|
| **CRITICAL — release blockers** | 14 | B1 (RLS 318×USING(true)), B3 (onyx-ai 404s), B5 (orchestrator decorative), B6 (payroll IL 6 bugs), B8 (PCN874 missing), B9 (BKMVDATA missing), B14 (SQLi 4 routes), B19 (pipeline DDL missing) |
| **HIGH — must close ≤30 days** | 53 | B33 (workflow gap entities), B34 (naming drift), B35 (60 effect types unhandled), B36 (4 360 pages missing), B38 (20 RED tables) |
| **MEDIUM** | 75 | i18n codemod, RTL logical-properties, PWA wiring, p1 test coverage gaps |
| **LOW** | 47 | TS strict, lint, dark/light polish, FR/EN locales |

---

## 2. CRITICAL findings (Go/No-Go gates)

Each finding below is the absolute minimum to flip from RED to AMBER. Sources cited.

### CRIT-1 — Multi-tenant RLS effectively nonexistent
- **Title:** Books-of-record open across all tenants
- **Description:** **318 RLS policies use `USING (true)`** (fully open). **59 production tables have RLS DISABLED** including `api_keys`, `env_variables`, `webhooks`, `system_logs`, `tenant_integrations`. **5 tables have RLS enabled with ZERO policies** (locked-out). **57 tables lack `tenant_id`** despite multi-tenancy live since 2026-04-22. **29 `tenant_id` columns lack indexes**. **167 FK columns lack indexes** — sequence scans the moment policies tighten.
- **Steps to reproduce:** `select count(*) from pg_policies where qual='true' and schemaname='public';` returns 318. `select count(*) from pg_tables t where t.schemaname='public' and not exists (select 1 from pg_class c where c.relname=t.tablename and c.relrowsecurity);` returns 59.
- **Actual:** Any authenticated user can read/write any tenant's data. SOX/GDPR/ISO27001 unattainable.
- **Expected:** Per-tenant isolation enforced at the DB layer. `qual='true'` count = 0 in `public.*`.
- **Severity:** CRITICAL.
- **Module:** Supabase / DBA — all `public.*` tables.
- **Fix:** Apply migrations `00072_tenant_id_columns_and_indexes.sql` (drafted) **before** `00073_rls_hardening.sql` + follow-ups `00075`-`00080` (drafted). Effort: 28h. Source: AGENT-09, AGENT-213, AGENT-214, AGENT-220.

### CRIT-2 — `onyx-ai` boots the wrong file; `dotenv` never imported
- **Title:** Procurement→AI bridge 404s in production; all API keys silently undefined.
- **Description:** `onyx-ai/src/index.ts` does `require('./onyx-platform')` but new endpoints live only in `index.ts`. Three platform copies coexist: `index.ts`, `onyx-platform.ts`, `onyx-integrations.ts`. `dotenv` is listed as a dependency but never imported, so `process.env.ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `WHATSAPP_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `VAULT_TOKEN` are all `undefined` at runtime. Port chaos: CLAUDE.md=3300, `.env.example`=3200, Dockerfile=3300, entrypoint listens on `PORT` and proxies to `PORT+1`.
- **Steps:** `curl onyx-ai:3300/api/score-vendor` → 404. Boot logs show no key-loaded confirmation.
- **Actual:** Every AI call from `onyx-procurement` 404s. Anomaly detector, vendor scoring, document classifier, churn predictor — all dark.
- **Expected:** `200 OK` from canonical platform endpoints; keys present.
- **Severity:** CRITICAL.
- **Module:** `onyx-ai/src/*.ts`.
- **Fix:** B3 — pick canonical `onyx-platform.ts`, port endpoints, delete competitors, add `import 'dotenv/config'` at boot. Pin port 3300 in 4 files. Effort: 5h. Source: AGENT-03, AGENT-218, AGENT-278.

### CRIT-3 — Orchestrator + state-machine engine is decorative
- **Title:** Effects logged, never executed; 0 of 12 listeners registered.
- **Description:** CLAUDE.md says 13 SMs / 91 transitions; actual is 15 / 115. **32 trigger blocks have no dispatcher** — no `POST /transition` handler. **12 listeners declared, 0 registered** with the event bus. `executeOrchestration` self-admits "simplified" — only logs. **~60 effect types referenced but unhandled** (`create`, `link`, `transition`, `notify`, `update_inventory`, `post_to_gl`, etc.). 3 invalid preconditions (`project.in_production`, `rfq.decided`, `work_order.done`) — **FIXED in this session**.
- **Steps:** `POST /api/orchestrator/execute {action:"quote.approve"}` → returns 200 with success but no DB row created/linked, no event emitted.
- **Actual:** Master Flow exists on paper only. State machines do not transition entities. No GL posting on action triggers.
- **Expected:** Each action mutates DB, transitions SM, emits event, fires listeners.
- **Severity:** CRITICAL.
- **Module:** `onyx-procurement/src/pipeline/orchestrator.js`, `event-bus.js`, `domain-events.js`, `state-machines.js`.
- **Fix:** B5 + B33 + B34 + B35 — implement transition executor, register 12 listeners, add missing entities (`material_request`, `inventory`, `bank_match`), reconcile naming drift (11 cases), implement top-10 effect handlers. Effort: 24h+8h+6h+4h = 42h. Source: AGENT-16, AGENT-31, AGENT-79, AGENT-211, AGENT-212, AGENT-252.

### CRIT-4 — Israeli payroll has 6 correctness bugs + ESTIMATED tax constants
- **Title:** Production payroll runs are blocked.
- **Description:** Sick pay flattened to 50% (statutory ladder is 0/50/100); income-tax annualisation naive — ignores YTD true-up despite loading YTD; all allowances treated as taxable (travel/meal exemption + שווי rules absent); `vacation_pay = hours × base_salary` — silent catastrophic over-pay if base is monthly; no negative-net-pay guard, no 25% deduction cap (חוק הגנת השכר ס׳ 25); BL rounding half-away-from-zero where btl.gov.il expects floor-to-agora — 1-agora drift per line in Form 102. Two parallel implementations: `onyx-procurement/src/payroll/*` AND `payroll-autonomous/src/*` are both wired. **All 2026 tax constants flagged ESTIMATED** — never verified against ילקוט פרסומים.
- **Steps:** Run sample payroll for an employee with sick days + bonus + travel reimbursement; compare to manual חישוב ידני or שלמה output.
- **Actual:** Drift of ₪1+ per payslip; tax remittances will not reconcile with btl.gov.il.
- **Expected:** ±₪0.01 vs manual; constants signed off by accountant.
- **Severity:** CRITICAL.
- **Module:** `onyx-procurement/src/payroll/wage-slip-calculator.js` (single source of truth) + `payroll-autonomous/src/*`.
- **Fix:** B6+B7+B22 — fix 6 bugs, verify constants against ילקוט, deprecate procurement copy. Effort: 16h+4h+6h = 26h. Source: AGENT-04, AGENT-293.

### CRIT-5 — IL tax filings half-built; two regulatory blockers NOT IMPLEMENTED
- **Title:** PCN874, BKMVDATA, Form 856, Form 102, Masav all broken or absent.
- **Description:** **PCN874 monthly VAT summary: NOT IMPLEMENTED.** **BKMVDATA / מבנה אחיד (regulation 36): NOT IMPLEMENTED** — cannot serve a tax inspector audit. **PCN836** has byte-width Hebrew padding bug (`fmtText` vs `fmtTextBytes`). **Form 856** (annual freelancer withholding) — only DB enum stubs exist. **Form 102** has 3 surfaces with conflicting rounding & employer-rate logic; submission is `PLACEHOLDER`. **Masav** has 2 parallel exporters (120-byte custom vs 128-byte BoI-spec) — first will be rejected at bank ingestion. **Auto-numbering for invoices/POs/payslips is missing** — gap-free sequential numbering is a tax-authority hard requirement.
- **Steps:** Submit a sample PCN874 → endpoint absent. Submit Masav 120-byte file → bank rejects with "invalid record length".
- **Actual:** Cannot file VAT, cannot serve inspector audit, cannot pay salaries via bank.
- **Expected:** Sample PCN874 accepted by רשות המסים test endpoint; BKMVDATA byte-exact match for one fiscal year; Masav 128-byte format only.
- **Severity:** CRITICAL.
- **Module:** `onyx-procurement/src/vat/`, `src/tax-exports/`, `src/payroll/masav-exporter.js`, `migrations/0274_numbering.sql`.
- **Fix:** B8 (PCN874 8h NEW) + B9 (BKMVDATA 24h NEW) + B10 (Form 856 16h NEW) + B11 (Form 102 unify 8h) + B12 (Masav drop legacy 4h) + B13 (auto-numbering 16h NEW). Effort: 76h. Source: AGENT-19, AGENT-132, AGENT-133, AGENT-134, AGENT-135, AGENT-215, AGENT-216, AGENT-217, AGENT-274.

### CRIT-6 — Deploy infra has show-stoppers
- **Title:** Image can ship against unmigrated DB; secrets committed; healthchecks lie.
- **Description:** **CI branch filter was `[main]` only — repo uses `master`** → CI was never executing on default (FIXED). **No `timeout-minutes`** on GHA jobs (6h default risk) — partially FIXED for `ci.yml`. **GCP region drift** — `deploy.sh` defaults `europe-west3`, cloudbuild YAMLs use `me-west1` (Tel Aviv). **K8s `02-secret.yaml` has CHANGE_ME placeholders committed** — own banner says don't commit yet committed. **All 4 Cloud Run services use `--allow-unauthenticated`**. **Compose `/health` vs Dockerfile `/healthz`** — health probes silently fail. **Migrations not gated in CI** — image can ship against unmigrated DB. **No `pino.redact`** — PII (emails, JWTs, bank accounts) leaks to logs. **Sentry DSN in env but `@sentry/node` not in deps** — half-wired.
- **Steps:** Inspect `.github/workflows/deploy.yml` → no `supabase db push` step gating image build. Inspect `k8s/02-secret.yaml` → literal `CHANGE_ME` strings.
- **Actual:** Production can run against an out-of-sync schema. Internal services exposed publicly.
- **Expected:** Migrations are a CI gate; secrets via External Secrets Operator; Cloud Run authn enabled.
- **Severity:** CRITICAL.
- **Module:** `.github/workflows/deploy*.yml`, `k8s/*.yaml`, `cloudbuild*.yaml`, `compose*.yml`, `Dockerfile*`, `pino` initializers.
- **Fix:** B16+B20+B25+B26+B40 effort = 4h+1h+8h+4h+24h = 41h. Source: AGENT-20, AGENT-21, AGENT-141, AGENT-167, AGENT-270.

### CRIT-7 — Workspace install fragile; AI-Task-Manager won't boot
- **Title:** pnpm install fails on Windows; duplicate workspace name.
- **Description:** AI-Task-Manager has **two workspace packages with identical name `@workspace/integrations-anthropic-ai`** (one full, one stub) → pnpm v9+ should error. `erp-mobile` brings `@shopify/react-native-skia` which fails Windows pnpm with EPERM. Workaround documented as `--filter "!@workspace/erp-mobile"`. `techno-kol-ops` `npm start` requires pre-built `dist/` not committed — needs `prestart: "npm run build"`.
- **Steps:** `pnpm install` on Windows → EPERM on Skia or duplicate-name resolution failure.
- **Actual:** Cold boot fails on a new dev machine and in pristine CI runner.
- **Expected:** `pnpm install && pnpm build` succeeds on Windows + Linux CI.
- **Severity:** CRITICAL.
- **Module:** `pnpm-workspace.yaml`, `packages/integrations-anthropic-ai*/package.json`, `apps/erp-mobile/package.json`, `techno-kol-ops/package.json`.
- **Fix:** B27+B28 effort = 1h+0.5h. Source: AGENT-05, AGENT-258.

### CRIT-8 — Whole vertical domains MISSING from migrations (schema drift)
- **Title:** Hotel domain — 5 tables exist in prod DB with **zero CREATE TABLE in repo**.
- **Description:** Hotel: 5 tables in prod, 0 in repo — cannot rebuild a clean environment. Health/clinical: domain absent (only payroll-side BL health insurance). Automotive Service: 3 tables missing. Events/conference: domain absent.
- **Steps:** `git grep -r "create table.*hotel" supabase/migrations/` → 0 results, but `\dt hotel*` in production → 5 tables.
- **Actual:** Disaster recovery + dev seeding both broken for these domains.
- **Expected:** Every prod table has a corresponding migration file.
- **Severity:** CRITICAL.
- **Module:** `supabase/migrations/`.
- **Fix:** B24 — `00074_hotel_domain_complete.sql` (DRAFTED), `00077_health_domain.sql`, `00078_automotive_domain.sql`, `00079_events_domain.sql`, plus `00080_insurance`, `00081_sports`, `00082_food`, `00083_edu` (all DRAFTED). Apply + verify. Effort: 6h. Source: AGENT-112, AGENT-113, AGENT-114, AGENT-116, AGENT-117, AGENT-118, AGENT-120, AGENT-126, AGENT-128, AGENTS 219, 236–243.

### CRIT-9 — MFA enforcement is UI-only
- **Title:** Login pipeline bypasses role-based MFA gate; backup codes plaintext.
- **Description:** Two parallel TOTP implementations (one secure, one wired-but-regressed). Backup codes stored **plaintext** in `userMfaTable.backupCodes`. Login pipeline never consults `roleMfaRequirementsTable` → role can require MFA but session is privileged anyway.
- **Steps:** Authenticate as a role flagged `requires_mfa=true` without supplying a TOTP token → session granted.
- **Actual:** MFA is theatre. Stolen credentials = full compromise.
- **Expected:** TOTP+backup-code E2E test passes; backup codes hashed; role gate enforced at login.
- **Severity:** CRITICAL.
- **Module:** `auth/mfa/*`, `auth/login.ts`, `userMfaTable`, `roleMfaRequirementsTable`.
- **Fix:** B15 effort = 8h. Source: AGENT-147, AGENT-222.

### CRIT-10 — Toast/notification system silently broken
- **Title:** ~51 user-feedback toasts no-op silently.
- **Description:** 4 competing toast systems mounted; Sonner installed but not mounted; ~51 `toast.success/error` calls from 20 files no-op. `TOAST_REMOVE_DELAY = 1_000_000ms` (~16.6 min) — even when toasts fire, they never auto-dismiss.
- **Steps:** Open any 360 page, trigger an action with `toast.success(...)` after `await fetch(...)` → no UI feedback.
- **Actual:** Users see no confirmation/failure feedback.
- **Expected:** Single Sonner toaster mounted at root; 51 calls render visible toasts that dismiss in 5s.
- **Severity:** CRITICAL.
- **Module:** `erp-app/src/main.tsx`, `erp-app/src/lib/toast.ts`, 20 calling files.
- **Fix:** B29 effort = 3h. Source: AGENT-172, AGENT-221.

### CRIT-11 — Auto-numbering missing
- **Title:** No gap-free sequential numbering for fiscal documents.
- **Description:** Tax-authority hard requirement: per-tenant per-fiscal-year gap-free sequences for INV, CRN, RCT, PO, QT, RFQ, SO, DN, PSL, F106, JE. Currently absent — IDs are random/UUID.
- **Steps:** Issue 100 invoices, audit `invoice_number` sequence — non-sequential or has gaps.
- **Actual:** Audit failure during inspector audit; cannot ship invoices.
- **Expected:** `INV-2026-000001`, `INV-2026-000002`, ... no gaps, atomic per tenant.
- **Severity:** CRITICAL.
- **Module:** `onyx-procurement/migrations/0274_numbering.sql` + service + routes (NEW).
- **Fix:** B13 effort = 16h. Source: AGENT-274.

### CRIT-12 — Pipeline support DDL missing; routes reference non-existent tables
- **Title:** `pipeline_items`, `pipeline_transitions`, `pipeline_events` referenced by routes — no migration creates them.
- **Description:** Routes in `pipeline-routes.js` SELECT/INSERT into `pipeline_items`, `pipeline_transitions`, `pipeline_events` but no migration creates these tables. Live DB has them by accident from manual DDL → schema drift.
- **Steps:** Run `select * from pg_tables where tablename like 'pipeline_%';` against a freshly migrated environment → empty.
- **Actual:** Pipeline UI breaks on first request in any clean environment.
- **Expected:** Migration `00088_pipeline_support_tables.sql` creates all 3 tables.
- **Severity:** CRITICAL.
- **Module:** `supabase/migrations/00088_pipeline_support_tables.sql` (NEW).
- **Fix:** B19 effort = 4h. Source: AGENT-210, AGENT-256.

### CRIT-13 — SQL injection in 4 routes (CVE-class)
- **Title:** Dynamic SQL interpolation reaches user input.
- **Description:** 4 files / 4 routes have unparameterized SQL: `crm-ultimate.ts` (×2), `ar-enterprise.ts`, `finance/payments.ts`. Patches drafted in AGENT-205 using `sql\`\`` template tags.
- **Steps:** AGENT-159 SQLi scanner output + AGENT-205 patch list.
- **Actual:** Pre-auth or low-priv data exfiltration / DROP risk.
- **Expected:** `npm audit --audit-level=high` clean; AGENT-159 scanner clean; all 4 routes parameterized.
- **Severity:** CRITICAL.
- **Module:** 4 files in `onyx-procurement/src/routes/` and `techno-kol-ops/src/routes/`.
- **Fix:** B14 effort = 4h. Source: AGENT-205, AGENT-159, AGENT-295.

### CRIT-14 — Test runners are dark (~349 tests orphaned)
- **Title:** CI is green because almost nothing runs.
- **Description:** `onyx-procurement` has `tests/.*\.test\.js$` pattern that **excludes ~349 of 351 tests** (orphaned). `onyx-ai` test script is `echo "tests coming soon"`. `techno-kol-ops` has no test script at all. Of the 51 payroll suites that DO run, **2 fail** (`consolidator` 6/24, `dunning` 2/45) — books out of balance by ₪1,312.50 in the consolidator full-stack regression case.
- **Steps:** `npm test --workspaces` → reports 2 tests pass; manual `node --test test/payroll/*.js` → 2,094/2,102 cases pass with 8 failures.
- **Actual:** CI is a security blanket. Coverage unknown. Money flows have known balance bugs.
- **Expected:** ≥600 tests run via `npm test --workspaces`; coverage ≥70% on pipeline/auth/finance.
- **Severity:** CRITICAL.
- **Module:** 3 `package.json` files + Vitest/Jest config.
- **Fix:** B17 (1h) + B18 (4h) + fix consolidator + dunning bugs (4h). Source: AGENT-198, AGENT-291, AGENT-158.

---

## 3. HIGH findings (≤30 days post go-live)

| ID | Title | Module | Source agent | Effort |
|---|---|---|---|---|
| H1 | Workflow gap entities (`material_request`, `inventory`, `bank_match`) — referenced by Master Flow but absent from SM + orchestrator | `state-machines.js`, `orchestrator.js` | 252 | 6h |
| H2 | Workflow naming drift — 11 cases (`po.send_and_receive` vs `send`+`receive`, `quote.convert` vs `convert_to_project`, payroll composite) | `workflow-flows.js` ↔ `state-machines.js` ↔ `orchestrator.js` | 252 | 4h |
| H3 | 60 effect types unhandled — `create`, `link`, `transition`, `notify`, `update_inventory`, `post_to_gl`, etc. | `executeOrchestration` | 252 | 24h |
| H4 | Lead360, Order360, Payment360, Delivery360 pages MISSING from Master Flow UI | `App.tsx`, new pages | 261, 281, 282, 283, 284 | 8h |
| H5 | Route prefix mismatch (`/360/<entity>/:id` vs `/<entity>/:id`) breaks every cross-360 link | `App.tsx`, breadcrumb component | 262, 263 | 2h |
| H6 | Stub action buttons in PO360/Quote360/WorkOrder360/Employee360/Supplier360/RFQ360/Finance360 — `onClick={()=>{}}` empty stubs | 7 360 pages | 264, 286 | 8h |
| H7 | 20 RED tables in DB-API audit; 6 with writes but no reads + no RLS (`bom_headers`, `drawings`, `production_orders`, `punch_lists`, `site_visits`, `labor_logs`) | DDL + routes | 202 | 6h |
| H8 | Sentry SDK not installed but DSN present; External Secrets Operator + canary lane absent | `deploy.yml` + k8s | 270, 269 | 24h |
| H9 | Reflected/stored XSS via `innerHTML` in 12 dashboards (`customer360`, `supplier360`, `quote360`, `po360`, `rfq360`, `entity360`, `bank-dashboard`, `vat-dashboard`, `pipeline-dashboard`, `onyx-dashboard`, `annual-tax-dashboard`, `status`) | `onyx-procurement/web/*.html` | 295 | 8h |
| H10 | CSP disabled site-wide (`server.js:109` — `helmet({ contentSecurityPolicy: false })`) | `onyx-procurement/server.js` | 295 | 2h |
| H11 | Workspace install fragility — Windows EPERM on Skia | `pnpm-workspace.yaml`, docs | 05 | 2h |
| H12 | Consolidator + dunning real assertion failures (8 failing cases — IC AR/AP, NCI, goodwill, FX-CTA; promise-to-pay lifecycle) | `consolidator.test.js`, `dunning.test.js` | 291 | 4h |
| H13 | Finance360 — 8 missing tabs; 5 primary actions; `/api/finance/{gl,ap-summary,cashflow,budget,costing,exports}` | `Finance360.tsx`, server routes | 48 | 16h |
| H14 | Hours register / timesheet engine — required for חוק שעות עבודה ומנוחה | new module | 186 | 12h |
| H15 | Section 14 enforcement — boolean `section_14` on employees + contract-side enforcement | DB + routes | 04 | 4h |
| H16 | Stale `vat-rate` references — 17 spots; rate is now centralized in `vat-config.js` | 17 files | 292 | 4h |
| H17 | Forecaster anomaly detector wiring — model trained but no caller paths | `onyx-ai`, `onyx-procurement` | 182, 224 | 6h |
| H18 | Vendor scoring wiring — endpoint exists, FE never calls it | `Supplier360.tsx` | 183, 223 | 4h |
| H19 | PDF parser wiring — exists, not in invoice ingest pipeline | `ap-invoice` flow | 194, 225 | 4h |
| H20 | Bank reconciliation wiring — dead end at the action button | `bank-recon.ts` | 184, 227 | 4h |
| H21 | Asset manager FE wiring missing | `Asset.tsx` | 191, 226 | 4h |
| H22 | PM engine DB schema vs `projects/pm-engine.js` (971 LOC) drift | DDL | 130, 228 | 6h |
| H23 | Year-end close DDL + flow gaps | `year-end-close.ts` | 163, 229, 248 | 6h |
| H24 | Storage adapter inconsistencies (Supabase Storage vs S3 vs local) | `storage.ts` | 142, 232 | 4h |
| H25 | Notification provider gaps (SMS/WhatsApp/Email fallback chain) | `comms-providers.ts` | 139, 233 | 4h |
| H26 | Feature flags FE-only, no server gate | `feature-flags.ts` | 121, 234 | 4h |
| H27 | Supabase Edge Functions vs Express routes split — both wired, contracts diverge | `supabase/functions/*` | 151, 235 | 6h |
| H28 | A11y — 4/58 aria-label coverage; missing `<h1>` on 9 pages | erp-app pages | 177, 298 | 8h |
| H29 | i18n — 250+ inline-Hebrew literals not in `locales/he.json` | erp-app + techno-kol-ops | 137, 299 | 16h |
| H30 | RTL logical-properties codemod (border/margin/padding/textAlign/inset) — 15+ erp-app, 23+ techno-kol-ops | erp-app + techno-kol-ops | 10, 17 | 8h |

(53 HIGH total — table abridged; see AGENT-195 for full list.)

---

## 4. MEDIUM findings (75 — summary)

- 89 missing CHECK constraints (status enums + non-negative money) — AGENT-09
- 63 orphaned/duplicate tables to clean (drop or wire `inventory`, `invoices` singulars; merge `_temp_file_transfer`)
- Per-service test coverage tooling (`c8`) not adopted — AGENT-198
- Form 106 distribution automation missing — AGENT-04
- Allocation-number per-period override (Invoice Reform 2024) — AGENT-19
- Logger PII redaction missing in 3 services — AGENT-269
- Real-time subscriptions wired but rarely used — AGENT-280
- Webhook secrets rotation absent — AGENT-279
- ID validators (תז/ח״פ/ע״מ) inconsistent across 3 forms — AGENT-146
- Hebrew calendar offsets in payroll (חגים) — AGENT-136
- PWA wiring (`vite-plugin-pwa`) absent in `erp-app` + `techno-kol-ops/client` — AGENT-149
- Time-tracking persistence layer thin — AGENT-186
- Audit log v2 not migrated — AGENT-250
- SAP integration gaps — AGENT-201, AGENT-251
- Reports gap — AGENT-180, AGENT-254
- Dashboards gap — AGENT-122, AGENT-255
- Forms gap — AGENT-253
- Mock data still rendered in 5 places — AGENT-265
- Breadcrumbs missing or hard-coded — AGENT-263
- Real CRUD persistence — 6 entities use mock state — AGENT-288
- Real filters non-functional on 4 list pages — AGENT-289
- Permissions read but not enforced for 3 routes — AGENT-290
- ESM/CJS interop friction — AGENT-164
- TS strict not progressed past step 1 — AGENT-165
- Lint rules disabled in 4 packages — AGENT-166
- (50+ remaining — see AGENT-195 master CSV.)

---

## 5. LOW findings (47)

- Dark/light theme polish; FR/EN locales; advanced NLQ; deep ML modules; experimentation modules (per CLAUDE.md P2 priority); `noImplicitAny`/`noUnusedLocals` in onyx-ai; minor doc cleanup; `_merge-staging*/`, `docs/merged-final/CLAUDE.md` duplicate cleanup; nexus_engine/paradigm_engine parked workspaces reconcile.

---

## 6. Already-FIXED in this session (don't re-do)

| File | Change | Source |
|---|---|---|
| `payroll-autonomous/vite.config.js` | port 5174 → 5173 | AGENT-300 |
| `onyx-procurement/src/pipeline/orchestrator.js:82` | `in_production` → `in_procurement` | this session |
| `orchestrator.js:122` | `decided` → `approved` | this session |
| `orchestrator.js:164` | `done` → `completed` | this session |
| `.github/workflows/ci.yml` | `[main]` → `[main, master]` + 3 timeouts | this session |
| `.github/workflows/security.yml` | branches fix + audit-level=high | this session |
| `.github/workflows/deploy-preview.yml` | branches fix | this session |
| `00072_tenant_id_columns_and_indexes.sql` | drafted | AGENT-213 |
| `00073_rls_hardening.sql` | drafted | AGENT-214 |
| `00074_hotel_domain_complete.sql` | drafted | AGENT-219 |
| `00075_fk_indexes.sql` | drafted | AGENT-220 |
| `00076_logistics_schema.sql` … `00083_edu_domain.sql` | drafted | AGENTS 236-243 |
| `00084_payment_anomalies_persist.sql`, `00086_year_end_close.sql`, `00087_analytics_views.sql` | drafted | this session |

The drafted migrations exist on disk but **need to be applied** to canonical Supabase (`ponypxhushxeskxgrmha`).

---

## 7. What MUST land before release (blocking gate)

Apply in strict order — failure of any one gate = NO-GO:

1. **B17/B18** — wire test runners (`npm test --workspaces` runs ≥600 tests with 70% coverage gate). 5h.
2. **B27/B28** — fix pnpm install + techno-kol-ops prestart. 1.5h.
3. **B23** — `<html dir="rtl">` in `erp-app/index.html`. 0.5h.
4. **B21** — pin `onyx-ai` port 3300 in 4 files. 0.5h.
5. **B3** — onyx-ai consolidate + `import 'dotenv/config'`. 5h.
6. **B14** — apply 4 SQLi patches from AGENT-205. 4h.
7. **B26** — `dotenv` + `pino.redact` + `@sentry/node` install. 4h.
8. **B19** — apply `00088_pipeline_support_tables.sql`. 4h.
9. **B4** — wire 6 pipeline APIs. 5h.
10. **B5** — transition executor + register 12 listeners. 8h.
11. **B22** — pick `payroll-autonomous` canonical, deprecate procurement copy. 6h.
12. **B33** — add `material_request`, `inventory`, `bank_match` SMs. 6h.
13. **B34** — reconcile naming drift (11 cases). 4h.
14. **B16** — migrations gate in `deploy.yml`. 3h.
15. **B20** — standardize healthchecks on `/healthz` + add `/livez` + `/readyz`. 1h.
16. **B2** — apply tenant_id + 167 FK indexes (`00072` + `00075`). 12h.
17. **B1** — apply RLS hardening (`00073` + 00076–00080). VERIFY `qual='true'` count = 0. 16h.
18. **B38** — close 20 RED tables. 6h.
19. **B6** — payroll 6 bugs. 16h.
20. **B7** — verify 2026 tax constants against ילקוט פרסומים. 4h.
21. **B8** — PCN874. 8h.
22. **B9** — BKMVDATA. 24h.
23. **B10** — Form 856. 16h.
24. **B11** — Form 102 unify. 8h.
25. **B12** — Masav drop legacy variant. 4h.
26. **B13** — auto-numbering service. 16h.
27. **B15** — MFA enforcement. 8h.
28. **B25** — k8s secrets + Cloud Run authn. 8h.
29. **B29** — toast consolidation (mount Sonner). 3h.
30. **B36** — missing 360 pages + route prefix. 8h.
31. **B37** — wire stub action buttons to `orchestrator.execute`. 8h.
32. **B24** — apply remaining domain DDL (Hotel, Health, Auto, Events, Insurance, Sports, Food, Edu). 6h.
33. **Production-parallel run** for one full month-end close (close + payroll + VAT + bank reconciliation) with **zero discrepancies** vs incumbent system. ~1 week.

**Total P0 effort:** ~270 dev-hours = ~34 dev-days for one mid-senior. Plus regulatory + parallel-run windows.

---

## 8. What CAN be deferred (post-launch, ≤90 days)

- All MEDIUM (75) + LOW (47) items.
- P1 hardening: auth/RBAC tests, full pipeline unit tests, money-tests for 5 high-LOC modules.
- A11y polish (aria-label 4/58 → 100%, `<h1>` on 9 pages).
- i18n codemod (250+ Hebrew literals).
- RTL logical-properties codemod.
- PWA wiring.
- Strict TS migration in onyx-ai.
- 89 missing CHECK constraints (do not affect correctness if app-layer guards hold).
- 63 orphaned-table cleanup.
- NLQ engine, deep ML, experimentation (P2 in CLAUDE.md).
- Multi-region (single me-west1 acceptable for v1).
- SBOM / cosign / Trivy / Grype scans (HIGH, but won't block first launch).
- Form 106 distribution automation.
- Dark/light polish, FR/EN locales.
- AI-Task-Manager (parked — boot fails; treat as separate workstream).

---

## 9. Final Go/No-Go gate checklist (sign-off form)

**GO requires ALL boxes checked AND signed by Backend lead, Frontend lead, DBA, Security lead, Compliance/Accountant, Product owner.**

- [ ] B1+B2 deployed; `pg_policies` for `qual='true'` returns **0** in `public.*`; `pg_tables` for `relrowsecurity=false` returns **0**.
- [ ] B3+B4+B5 deployed; `curl /api/wiring/spec`, `/api/orchestrator/execute`, `/api/state-machines/quote/transitions` all return 200 with non-stub payloads.
- [ ] B6+B7 — payroll re-run for sample population matches שלמה / חישוב ידני to **±₪0.01**, all 2026 constants signed off by accountant against ילקוט פרסומים.
- [ ] B8+B9 — PCN874 sample submission accepted by רשות המסים test endpoint; BKMVDATA sample byte-exact match for one fiscal year.
- [ ] B14 — `npm audit --audit-level=high` clean; AGENT-159 SQLi scanner clean; 4 patched routes verified.
- [ ] B15 — TOTP+backup-code flow E2E test passes; backup codes hashed in DB; role MFA gate enforced at login.
- [ ] B16+B20 — `deploy.yml` migration step gates image push; `/healthz` returns 200 from all 4 services in compose + Cloud Run.
- [ ] B17+B18 — `npm test --workspaces` runs **≥600 tests**; coverage **≥70%** on pipeline/auth/finance directories; consolidator + dunning failures resolved.
- [ ] B23 — `<html dir="rtl">` confirmed in DOM; Radix dropdowns flip correctly on first paint.
- [ ] B25 — no `CHANGE_ME` in committed manifests; Cloud Run authn enabled; secrets via External Secrets / Secret Manager.
- [ ] B29 — single Sonner mounted; 51 toast calls render visible; auto-dismiss = 5s.
- [ ] **Production-parallel run for one full month-end close cycle (close + payroll + VAT + bank reconciliation) with zero discrepancies vs incumbent system.**

---

## 10. Realistic time-to-true-production

| Scenario | Calendar weeks |
|---|---|
| 1 mid-senior full-stack dev, no rework | **12–14 weeks** |
| 2-dev pair (backend + frontend) | **7–9 weeks** |
| 3-dev squad (+ DBA/compliance) | **5–6 weeks** |
| **+ 1 wk regulatory verification + 1 wk parallel run** | **+2 weeks all scenarios** |

**Realistic answer: 10 weeks** with a 2-dev pair + part-time accountant + part-time DBA. **Hard floor: 6 weeks** because B1 (RLS hardening across 244 tables) requires sequential migrations 00072 → 00075 → 00073 → 00076–00080 with verification windows, and B6–B12 cannot ship without IL accounting/legal sign-off cycles.

---

## 11. Decision

**NO-GO. RED.**

The system has the bones of a Palantir-grade ERP. It does not yet have the muscle. Tenant isolation, orchestrator execution, AI bridge, payroll math, two regulatory tax filings, healthchecks, secrets, MFA, and test coverage are all simultaneously broken. Any one of CRIT-1, CRIT-3, CRIT-4, CRIT-5, CRIT-6, CRIT-9, CRIT-13 alone justifies a NO-GO.

Recommend executing Sprint 1 (week 1, ~24 hr runtime unblock) immediately to flip from RED to AMBER on most-visible issues, then Sprint 2 (mount the system, ~30 hr), then Sprint 3 (tenant isolation, ~36 hr — must serialize), then Sprint 4 (IL compliance, ~70 hr), then Sprint 5 (security + UX, ~40 hr), then Sprint 6 (effects executor + tests, ~60 hr), and finally Sprints 7–10 hardening + parallel-run.

---

## 12. References (every claim cited)

- `MASTER_QA_REPORT.md`
- `AGENT-300-FINAL-readiness.md`
- `AGENT-195-aggregator.md` — 198 deduped findings master CSV
- `AGENT-196-critical-path.md` — top-20 sequenced
- `AGENT-197-effort.md` — 860-hour budget
- `AGENT-198-coverage-gap.md` — test execution gap
- `AGENT-202-db-api-contracts.md` — 20 RED + 100 AMBER tables
- `AGENT-204-navigation-flow.md` — Master Flow UI gap
- `AGENT-205-sql-injection-patches.md` — 4 SQLi patches
- `AGENT-213-tenant-migration.md` — `00072` drafted
- `AGENT-214-rls-hardening.md` — `00073` drafted
- `AGENT-220-fk-indexes.md` — `00075` drafted
- `AGENT-252-workflow-gaps.md` — 22-step workflow drift, 60 unhandled effect types
- `AGENT-274-logic-numbering.md` — auto-numbering spec
- `AGENT-291-qa-all-tests.md` — 51 suites, 2 failing, 8 cases
- `AGENT-295-qa-pentest.md` — pentest checklist
- `AGENT-296-qa-load.md` — k6/autocannon load profile
- `supabase/migrations/00072..00088` — drafted corrective migrations on disk
- Originals: AGENTS 03, 04, 05, 09, 10, 16, 19, 20, 21, 31, 79, 147, 167, 172, 218, 274.

---

**End AGENT-319-release-readiness-FINAL.md.**
