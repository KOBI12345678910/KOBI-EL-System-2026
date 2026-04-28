# AGENT-300 — FINAL Go-Live Readiness Synthesis

**Date:** 2026-04-29
**Author:** Agent 300 (QA #10 FINAL)
**Inputs:** 137 prior agent reports in `_qa-reports-25/AGENT-*.md` + `MASTER_QA_REPORT.md`
**Branch:** `claude/objective-merkle-40ff93`
**Platform:** kobi-el-system-2026 (Supabase `ponypxhushxeskxgrmha`) — 60+/87 migrations applied, 231 public tables, 4 services
**Verdict at top:** **NO-GO. RED. ~10–14 weeks of focused engineering to true production-ready (single mid-senior dev). With 2-dev pair: ~6–8 weeks.**

---

## 1. Executive verdict

The codebase is **structurally rich** (200+ entities, 6 pipeline modules, 13+ state machines, 9 P0 360 pages, 138 QA reports, 231 tables). It is **operationally dark** on the critical paths:

- Multi-tenant isolation **does not exist** in production (318 `USING(true)` policies + 59 RLS-disabled tables including `api_keys`, `env_variables`, `webhooks`).
- The orchestrator + state machine engine is **decorative** — effects logged, never executed; 12 listeners declared, 0 registered.
- The procurement→AI bridge **404s at runtime** because the wrong file boots and `dotenv` is never imported (every API key undefined).
- Israeli payroll has **6 correctness bugs** plus all 2026 tax constants flagged ESTIMATED — production payroll runs are blocked.
- Two regulatory blockers are **NOT IMPLEMENTED**: PCN874 (monthly VAT summary) and BKMVDATA / מבנה אחיד (regulation 36 — required for tax-inspector audit).
- **CI runs on `main`, but the repo's default branch is `master`** (FIXED in this session) — workflows were never executing.
- **Test runners are dark**: ~349 of 351 tests in onyx-procurement orphaned by a wrong path pattern; `onyx-ai` test script is `echo "tests coming soon"`; `techno-kol-ops` has no test script at all.
- **Auto-numbering for invoices/POs/payslips is missing** — gap-free sequential numbering is a tax-authority hard requirement (AGENT-274).

Aggregator (AGENT-195) finalized: **14 CRIT / 53 HIGH / 75 MED / 47 LOW = 198 deduped findings**. Critical-path top-20 sequenced in AGENT-196. Effort budget: **~860 dev-hours / ~108 dev-days** with **~44 hr critical-path unblock**.

---

## 2. P0 Blocker register (must close before go-live)

| ID  | Blocker | Severity | Owner | Effort | Migration / file |
|-----|---------|----------|-------|--------|------------------|
| B1  | Tenant RLS hardening — replace 318 `USING(true)`, enable RLS on 59 disabled tables | CRIT | DBA + backend lead | L (16h) | `00072` (drafted), `00073` (drafted), `00075`, follow-ups 00077–00080 |
| B2  | Add `tenant_id` to 57 child tables + index 29 unindexed columns + 167 FK indexes — must land BEFORE B1 | CRIT | DBA | L (12h) | `00072_tenant_id_columns_and_indexes.sql` (drafted), `00075_fk_indexes.sql` (drafted) |
| B3  | onyx-ai consolidation: pick canonical `onyx-platform.ts`, port endpoints, delete `index.ts`/`onyx-integrations.ts`, add `import 'dotenv/config'` | CRIT | Backend lead | M (5h) | `onyx-ai/src/*.ts` |
| B4  | Wire 6 pipeline APIs in `onyx-procurement/server.js` (`/api/wiring/spec`, `/api/entity-map/:type`, `/api/state-machines/:type/transitions`, `POST /api/orchestrator/execute`, `/api/pipeline/stages`, `/api/workflows/:id`) | CRIT | Backend lead | M (5h) | `onyx-procurement/server.js` + `src/pipeline/*` |
| B5  | Transition executor + register 12 event-bus listeners — orchestrator effects currently only logged | CRIT | Backend lead | M (8h) | `orchestrator.js`, `event-bus.js`, `domain-events.js` |
| B6  | Payroll IL correctness: sick-pay 0/50/100 ladder, YTD income-tax true-up, allowance שווי / נסיעות exemptions, BL floor-to-agora rounding, deduction cap §25, non-negative net-pay guard | CRIT | Payroll lead + finance | L (16h) | `onyx-procurement/src/payroll/wage-slip-calculator.js` (single source of truth) |
| B7  | Verify all 2026 tax constants (income brackets, BL thresholds, נקודת זיכוי) against ילקוט פרסומים — currently flagged ESTIMATED | CRIT | Finance / accountant | S (4h) | constants module + scheduled re-verify job |
| B8  | PCN874 monthly VAT summary builder — regulatory blocker | CRIT | Compliance dev | M (8h) | `onyx-procurement/src/vat/pcn874.js` (NEW) |
| B9  | BKMVDATA / מבנה אחיד (regulation 36) — full transaction archive for tax-inspector audit | CRIT | Compliance dev | L (24h) | `onyx-procurement/src/tax-exports/bkmvdata.js` (NEW) |
| B10 | Form 856 (annual freelancer withholding) — currently DB enum stubs only | CRIT | Compliance dev | L (16h) | new module |
| B11 | Form 102 unify — 3 surfaces with conflicting rounding/employer-rate logic; submission stuck on `PLACEHOLDER` | CRIT | Payroll lead | M (8h) | unified module |
| B12 | Masav exporter — drop 120-byte custom variant, ship 128-byte BoI-spec only | CRIT | Compliance dev | S (4h) | `onyx-procurement/src/payroll/masav-exporter.js` |
| B13 | Auto-numbering service (AGENT-274 LOGIC #4) — per-tenant per-fiscal-year gap-free sequences for INV/CRN/RCT/PO/QT/RFQ/SO/DN/PSL/F106/JE | CRIT | Backend lead | L (16h) | `onyx-procurement/migrations/0274_numbering.sql` + service + routes (NEW) |
| B14 | SQL injection patches — 4 files, 4 routes (crm-ultimate.ts × 2, ar-enterprise.ts, finance/payments.ts) | CRIT | Backend lead | S (4h) | parameterized via `sql\`\`` template tags (AGENT-205 has full patches) |
| B15 | MFA enforcement — 2 parallel TOTP impls, plaintext backup codes, login pipeline bypasses `roleMfaRequirementsTable` | CRIT | Security lead | M (8h) | consolidate to one impl, hash backup codes, wire role-based MFA gate |
| B16 | Migrations gate in `deploy.yml` — image can ship against unmigrated DB today | CRIT | DevOps | S (3h) | `.github/workflows/deploy.yml` |
| B17 | onyx-procurement test path pattern fix — `tests/.*\\.test\\.js$` excludes ~349 tests; wire root `npm test --workspaces` to fail-fast | CRIT | QA / Build | XS (1h) | `onyx-procurement/package.json` |
| B18 | onyx-ai + techno-kol-ops `test` script — currently stubs / absent; wire Vitest/Jest with coverage gate at 70% changed-files | CRIT | QA / Build | S (4h) | both `package.json` |
| B19 | Pipeline support DDL — `pipeline_items`, `pipeline_transitions`, `pipeline_events` referenced by routes but no migration creates them | CRIT | DBA + backend | S (4h) | new migration `00088_pipeline_support_tables.sql` |
| B20 | Healthcheck path drift — compose uses `/health`, Dockerfiles + Railway use `/healthz`; only procurement exposes both | CRIT | DevOps | XS (1h) | standardize on `/healthz`; add `/livez` + `/readyz` split |
| B21 | onyx-ai port: pin 3300 in `src/index.ts`, `.env.example`, `Dockerfile`, `entrypoint.js`, `ONYX_AI_URL` (currently 3200, collides with OPS) | CRIT | Backend / DevOps | XS (0.5h) | 4 files |
| B22 | Payroll dual-implementation — `onyx-procurement/src/payroll/*` AND `payroll-autonomous/src/*` both wired; pick `payroll-autonomous` canonical, deprecate procurement copy | CRIT | Architecture | M (6h) | `onyx-procurement/server.js:1556` + cleanup |
| B23 | RTL root direction — add `dir="rtl"` to `erp-app/index.html`; without it Radix portals/popovers render LTR | CRIT | Frontend | XS (0.5h) | `erp-app/index.html` |
| B24 | Hotel/Health/Auto/Events DDL drift — Hotel had 5 tables in prod with **zero CREATE TABLE in repo** | CRIT | DBA | M (6h) | `00074_hotel_domain_complete.sql` (DRAFTED), `00077`, `00078`, `00079`, `00080`, `00081`, `00082`, `00083` |
| B25 | k8s `02-secret.yaml` has CHANGE_ME placeholders committed; all 4 Cloud Run services use `--allow-unauthenticated` | CRIT | DevOps + Security | M (8h) | k8s manifests + Cloud Run authn |
| B26 | `dotenv` import + `pino.redact` global config + Sentry SDK install — PII leaks to logs across 3 Node services; SENTRY_DSN read but `@sentry/node` not in deps | CRIT | Backend | S (4h) | logger init in 3 services |
| B27 | AI-Task-Manager pnpm install fails — duplicate workspace `@workspace/integrations-anthropic-ai` (full + stub); blocks api-server boot | CRIT | Build | XS (1h) | choose one, delete other |
| B28 | techno-kol-ops boot — `npm start` requires pre-built `dist/` not committed; add `prestart: "npm run build"` | CRIT | DevOps | XS (0.5h) | `techno-kol-ops/package.json` |
| B29 | Toast/notification system — 4 competing systems, Sonner installed but not mounted; ~51 toast calls no-op silently; `TOAST_REMOVE_DELAY = 1_000_000ms` | CRIT | Frontend | S (3h) | mount Sonner; remove competitors |
| B30 | 3 orchestrator preconditions reference dead statuses — **FIXED in this session** (`in_production`→`in_procurement`, `decided`→`approved`, `done`→`completed`) | DONE | — | — | `orchestrator.js` |
| B31 | CI branch filter `[main]` — repo's default is `master`; CI never ran on default — **FIXED in this session** | DONE | — | — | 3 GHA workflow files |
| B32 | `timeout-minutes` on GHA jobs — 6h default risk — partially **FIXED** (ci.yml 3 jobs); finish on security.yml + deploy*.yml | HIGH | DevOps | XS (0.5h) | remaining workflows |
| B33 | Workflow gap entities — `material_request`, `inventory`, `bank_match` referenced by Master Flow but absent from state machines AND orchestrator | CRIT | Backend | M (6h) | `state-machines.js` + `orchestrator.js` |
| B34 | Workflow naming drift — 11 cases (`po.send_and_receive` vs `send`+`receive`, `payroll.approve_and_export` composite, `quote.convert` vs `convert_to_project`, etc.) | HIGH | Backend | S (4h) | `workflow-flows.js` ↔ `state-machines.js` ↔ `orchestrator.js` reconcile |
| B35 | Effects executor — `~60 effect types referenced but unhandled` (`create`, `link`, `transition`, `notify`, `update_inventory`, `post_to_gl`, etc.) | HIGH | Backend | L (24h) | `executeOrchestration` real handlers |
| B36 | Lead360, Order360, Payment360, Delivery360 pages MISSING from Master Flow UI; route prefix mismatch (`/360/<entity>/:id` vs `/<entity>/:id`) breaks every cross-360 link | HIGH | Frontend | M (8h) | `App.tsx`, new pages, breadcrumb component |
| B37 | Stub action buttons across PO360/Quote360/WorkOrder360/Employee360/Supplier360/RFQ360/Finance360 — `onClick={() => {}}` empty stubs; none call `POST /api/orchestrator/execute` | HIGH | Frontend | M (8h) | wire to `orchestrator.execute` |
| B38 | RED tables in DB-API audit (AGENT-202): 20 tables have neither read route nor RLS; 6 of these (`bom_headers`, `drawings`, `production_orders`, `punch_lists`, `site_visits`, `labor_logs`) have **writes** but no reads + no RLS | HIGH | DBA + backend | M (6h) | new migration + route review |
| B39 | Workspace install fragility — `erp-mobile` brings `@shopify/react-native-skia` which fails Windows pnpm with EPERM; document workaround `--filter "!@workspace/erp-mobile"` | HIGH | Build | S (2h) | docs + CI matrix |
| B40 | Sentry SDK decision + External Secrets Operator + canary lane | HIGH | DevOps | L (24h) | `deploy.yml` + k8s |

**Total P0 blocker effort:** ~270 dev-hours after subtracting items already FIXED (B30, B31, B32 partial). Approximately **34 dev-days** by a single mid-senior dev.

---

## 3. P1 hardening (must close ≤30 days post go-live)

| Area | Items |
|------|-------|
| Auth/RBAC | `auth/rbac.test.js` + `auth/totp.test.js` covering full role × permission matrix; middleware tests |
| Pipeline tests | Unit test 9 `pipeline/*.js` modules — every SM transition (allowed + rejected), every orchestrator action precondition, every entity action mapping |
| Money tests | `po/approval-matrix.js` (1,119 LOC threshold gate), `projects/pm-engine.js` (971 LOC), `inventory/optimizer.js` (692 LOC), `gl/*`, `budget`, `consolidation`, `intercompany`, `costing` |
| RTL/a11y | Logical-properties codemod (border/margin/padding/textAlign/inset) — 15+ erp-app pages, 23+ techno-kol-ops files; `<Bdi>` helper for Hebrew+Latin text; aria-label coverage 4/58 → 100%; add `<h1>` to 9 pages |
| i18n | react-i18next + `locales/he.json` codemod across 250+ inline-Hebrew literals |
| PWA | Wire `vite-plugin-pwa` in `erp-app` + `techno-kol-ops/client`; viewport-fit=cover; browserslist pin |
| State machines | Add `material`, `inventory`, `bank_match`, `customer`, `supplier` machines; add guards layer; transition audit/persist helper |
| Workflow flows | Add Order, Delivery, Closure stages; entry/exits/errorStates; map every step to orchestrator action (13 missing) |
| Entity-map | 6 thin entities → ≥4 actions; fix ~70 broken cross-references; add per-entity `kpis:[]` block |
| Finance360 | Implement 8 missing tabs; 5 primary actions; `/api/finance/{gl,ap-summary,cashflow,budget,costing,exports}` |
| Time tracking | Hours register / timesheet engine — required for חוק שעות עבודה ומנוחה inspection |
| Section 14 enforcement | Add boolean `section_14` on employees + contract-side enforcement |
| Image security | SBOM (syft) + cosign signatures + Trivy/Grype scan in `deploy.yml` |
| Multi-region | Documented warm-standby in second IL AZ (single me-west1 acceptable for v1; not a blocker) |
| Coverage tooling | Adopt `c8` per service; per-file thresholds at 90% on pipeline/auth/finance directories |
| Docs cleanup | Remove `_merge-staging*/`, `docs/merged-final/CLAUDE.md` duplicate; reconcile `nexus_engine`/`paradigm_engine` parked workspaces |

---

## 4. P2 (nice-to-have / next quarter)

- Strict TS migration in onyx-ai (`noImplicitAny`, `noUnusedLocals` — TYPESCRIPT_STRICT_PLAN.md steps 1-7)
- 89 missing CHECK constraints (status enums + non-negative money)
- 63 orphaned table cleanup (drop or wire `inventory`, `invoices` singulars; merge `_temp_file_transfer`)
- Form 106 distribution automation (currently manual)
- Allocation-number per-period override (Invoice Reform 2024)
- NLQ engine, deep ML modules, experimentation modules (P2 in CLAUDE.md build priority)
- Dark/light theme polish, FR/EN locales

---

## 5. Recommended sprint sequence

**Sprint 1 (week 1) — Runtime unblock (~24h):**
B23 RTL root · B21 onyx-ai port · B27 pnpm dedupe · B28 techno-kol-ops prestart · B3 onyx-ai consolidate + dotenv · B30 ✓ · B31 ✓ · B32 finish · B17/B18 wire test runners · B14 SQLi patches · B26 dotenv/pino.redact/Sentry

**Sprint 2 (week 2) — Mount the system (~30h):**
B4 pipeline APIs · B5 transition executor + 12 listeners · B19 pipeline support tables · B20 healthcheck standardize · B22 payroll ownership · B33 missing entities (material_request/inventory/bank_match) · B34 naming drift reconcile · B16 migrations gate

**Sprint 3 (weeks 3–4) — Tenant isolation, order-critical (~36h):**
B2 tenant_id columns + 167 FK indexes (`00072` + `00075`) → verify → B1 RLS hardening (`00073` + follow-ups 00076–00080) → B38 close 20 RED tables → audit replay

**Sprint 4 (week 5) — IL compliance (~70h):**
B6 payroll 6 bugs · B7 tax constants verification · B8 PCN874 · B9 BKMVDATA · B10 Form 856 · B11 Form 102 unify · B12 Masav drop legacy variant · B13 auto-numbering service

**Sprint 5 (week 6) — Security + UX polish (~40h):**
B15 MFA · B25 k8s secrets + Cloud Run authn · B29 toast consolidation · B36 missing 360 pages + route prefix · B37 wire stub action buttons · B24 finish remaining domain DDL · B40 Sentry/External-Secrets/canary

**Sprint 6 (week 7–8) — Effects executor + tests (~60h):**
B35 implement top-10 effect handlers · P1 auth/RBAC tests · P1 pipeline tests · P1 money tests · QA replay full 138-agent battery

**Sprint 7–10 (weeks 9–14) — Hardening, P1 items, regulatory re-verification, soak test, parallel-run with manual processes**

---

## 6. Time-to-true-production calculus

| Scenario | Calendar weeks | Notes |
|----------|----------------|-------|
| **Single mid-senior full-stack dev**, no rework | 12–14 weeks | Critical-path 270h ≈ 34 days, P1 hardening + tests 200h ≈ 25 days, regulatory soak/UAT/parallel run ~3 weeks |
| **2-dev pair (backend + frontend)** | 7–9 weeks | Sprints parallelisable except Sprint 3 (RLS — must serialize) |
| **3-dev squad** (backend + frontend + DBA/compliance) | 5–6 weeks | Compliance work (B6–B13) parallelises with B1–B5 once B2 indexes land |
| Plus 1 week regulatory verification window (B7) and 1 week production-parallel run | +2 weeks all scenarios | Tax-authority constants must be verified against ילקוט פרסומים before any payroll run |

**Realistic answer: 10 weeks to true production-ready** assuming a 2-dev pair with a part-time accountant for B6–B12 and a part-time DBA for B1–B2. Compress to 6 weeks only with a 4-person squad and pre-existing IL tax-compliance familiarity.

**Hard floor: 6 weeks** — because B1 (RLS hardening across 244 tables) requires sequential migrations 00072 → 00075 → 00073 → 00076–00080 with verification windows between each, and B6–B12 cannot ship without IL accounting/legal sign-off cycles.

---

## 7. Already-fixed in this audit cycle (don't re-do)

| File | Change |
|------|--------|
| `payroll-autonomous/vite.config.js` | port 5174 → 5173 |
| `onyx-procurement/src/pipeline/orchestrator.js:82` | precondition `in_production` → `in_procurement` |
| `onyx-procurement/src/pipeline/orchestrator.js:122` | precondition `decided` → `approved` |
| `onyx-procurement/src/pipeline/orchestrator.js:164` | precondition `done` → `completed` |
| `.github/workflows/ci.yml` | branches `[main]` → `[main, master]` + 3 `timeout-minutes` |
| `.github/workflows/security.yml` | branches fix + `--audit-level=high` (was inconsistent with step name) |
| `.github/workflows/deploy-preview.yml` | branches fix |
| `supabase/migrations/00072_tenant_id_columns_and_indexes.sql` | drafted (AGENT-213) |
| `supabase/migrations/00073_rls_hardening.sql` | drafted (AGENT-214) |
| `supabase/migrations/00074_hotel_domain_complete.sql` | drafted (AGENT-219) |
| `supabase/migrations/00075_fk_indexes.sql` | drafted (AGENT-220) |
| `supabase/migrations/00076_logistics_schema.sql`, `00077_health_domain.sql`, `00078_automotive_domain.sql`, `00079_events_domain.sql`, `00080_insurance_domain.sql`, `00081_sports_domain.sql`, `00082_food_domain.sql`, `00083_edu_domain.sql` | DDL drafted (AGENTS 236–243) |
| `00084_payment_anomalies_persist.sql`, `00084_sales_order_state_machine.sql`, `00086_year_end_close.sql`, `00087_analytics_views.sql` | drafted |

The drafted migrations exist but **need to be applied** to canonical Supabase (`ponypxhushxeskxgrmha`) and verified. AGENT-09 reports 60/73 migrations applied as of audit start; the new files raise the disk count to 87.

---

## 8. Final Go/No-Go criteria

**GO when ALL of these are true (gate checklist):**

- [ ] B1+B2 deployed to canonical Supabase; `pg_policies` query for `qual='true'` returns 0 in `public.*`; `pg_tables` for `relrowsecurity=false` returns 0
- [ ] B3+B4+B5 deployed; `curl /api/wiring/spec`, `/api/orchestrator/execute`, `/api/state-machines/quote/transitions` all return 200
- [ ] B6+B7 — payroll re-run for sample population matches שלמה / חישוב ידני to ±0.01₪, all 2026 constants signed off by accountant against ילקוט פרסומים
- [ ] B8+B9 — PCN874 sample submission accepted by רשות המסים test endpoint; BKMVDATA sample byte-exact match for one fiscal year
- [ ] B14 — `npm audit --audit-level=high` clean; AGENT-159 SQLi scanner clean
- [ ] B15 — TOTP+backup-code flow end-to-end test passes; backup codes hashed in DB; role MFA gate enforced at login
- [ ] B16+B20 — `deploy.yml` migration step gates image push; `/healthz` returns 200 from all 4 services in compose+Cloud Run
- [ ] B17+B18 — `npm test --workspaces` runs ≥600 tests; coverage ≥70% on pipeline/auth/finance directories
- [ ] B23 — `<html dir="rtl">` confirmed in DOM; Radix dropdowns flip correctly on first paint
- [ ] B25 — no CHANGE_ME in committed manifests; Cloud Run authn enabled; secrets via External Secrets / Secret Manager
- [ ] Production-parallel run for one full month-end close cycle (close + payroll + VAT + bank reconciliation) with zero discrepancies vs incumbent system

**Sign-off requires:** Backend lead, Frontend lead, DBA, Security lead, Compliance/Accountant, Product owner.

---

## 9. Files referenced

- `_qa-reports-25/MASTER_QA_REPORT.md` — top-level summary
- `_qa-reports-25/AGENT-195-aggregator.md` — 198 deduped findings master CSV
- `_qa-reports-25/AGENT-196-critical-path.md` — top-20 sequenced
- `_qa-reports-25/AGENT-197-effort.md` — 860-hour budget
- `_qa-reports-25/AGENT-198-coverage-gap.md` — test execution gap
- `_qa-reports-25/AGENT-202-db-api-contracts.md` — 20 RED + 100 AMBER tables
- `_qa-reports-25/AGENT-204-navigation-flow.md` — Master Flow UI gap
- `_qa-reports-25/AGENT-205-sql-injection-patches.md` — 4 SQLi patches
- `_qa-reports-25/AGENT-213-tenant-migration.md` — `00072` drafted
- `_qa-reports-25/AGENT-214-rls-hardening.md` — `00073` drafted
- `_qa-reports-25/AGENT-220-fk-indexes.md` — `00075` drafted
- `_qa-reports-25/AGENT-252-workflow-gaps.md` — 22-step workflow drift, 60 unhandled effect types
- `_qa-reports-25/AGENT-274-logic-numbering.md` — auto-numbering spec
- `supabase/migrations/00072..00087` — drafted corrective migrations on disk

---

**End AGENT-300-FINAL-readiness.md.**
