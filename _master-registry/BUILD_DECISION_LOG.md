# BUILD DECISION LOG — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| D001–D050 source | `RECOVERY_DECISION_LOG.md` (imported verbatim as references) |
| B-D001+ | New BUILD-phase decisions introduced by Phase 1 directive |

---

## 1. Imported RECOVERY decisions (D001–D050)

These are authoritative. Full text lives in `RECOVERY_DECISION_LOG.md`. One-line digest for cross-ref:

| ID | Topic | Status (RECOVERY) | Owner |
|---|---|---|---|
| D001 | Freeze baseline counts from RECOVERY_FINAL_STATUS | approved | architect |
| D002 | 93 claimed models w/o migration — validate vs build | pending | architect |
| D003 | Domain naming canon: commercial/execution/workforce (not crm/sales/hr) | pending | architect |
| D004 | Orphan table rule: wire-or-drop per-table with owner sign-off | approved | architect |
| D005 | 652 orphan pages — categorize route-missing / menu-missing / page-missing | pending | architect |
| D006 | Duplicate elimination: keep newest schema-qualified version | approved | architect |
| D007 | Source-of-truth conflicts (7) — arbitration matrix | pending | architect |
| D008 | 510 menu entries w/o route — convert vs drop | pending | architect |
| D009 | Wrong-schema pointers (12) — repoint registry, not migrate | approved | architect |
| D010 | No NULL-domain rows in app_menu | approved | architect |
| D011 | Duplicate CREATE TABLE across govern/analytics — drop the later | approved | architect |
| D012 | 75 truly-missing models — full-stack build in Phase 7 | approved | architect |
| D013 | 30 broken imports — fix in Phase 9 | approved | architect |
| D014 | 127 dead-RPC candidates — confirm before removal | approved | architect |
| D015 | 10 dashboards + 17 reports — rewire to real tables in P10 | approved | architect |
| D016 | RLS policy count drift (213 vs 302) — re-scan per-table | approved | architect |
| D017 | 4 runtime-breaking pages — repair before P15 | approved | architect |
| D018 | 285 duplicate endpoints — merge by route path normalization | approved | architect |
| D019 | 15 route duplicates in App.tsx — dedupe by element identity | approved | architect |
| D020 | Per-table permission + RLS decision required (17×9 matrix) | approved | architect |
| D021 | Canonical domain map (12 domains) ratified | approved | architect |
| D022 | Business capability map ratified | approved | architect |
| D023 | 13 mandatory 360 pages | approved | architect |
| D024 | Menu taxonomy standard | approved | architect |
| D025 | Form standards | approved | architect |
| D026 | Field-binding template | approved | architect |
| D027 | API contract standards | approved | architect |
| D028 | Workflow & event standards | approved | architect |
| D029 | Permission model 17×9 | approved | architect |
| D030 | RLS expansion standard | approved | architect |
| D031 | Build-priority matrix | approved | architect |
| D032 | Build-decision gate (8 questions) | approved | architect |
| D033 | Definition-of-done per entity | approved | architect |
| D034 | QA test matrix | approved | architect |
| D035 | Enterprise table build standard | approved | architect |
| D036 | Mandatory columns (id, created_at, updated_at, created_by, updated_by, org_id…) | approved | architect |
| D037 | Recommended business columns | approved | architect |
| D038 | Status lifecycle standard | approved | architect |
| D039 | Index strategy standard | approved | architect |
| D040 | Unique constraint rules | approved | architect |
| D041 | Enum & lookup rules | approved | architect |
| D042 | Audit standard (audit_log table) | approved | architect |
| D043 | Security standard (RLS default-deny) | approved | architect |
| D044 | API binding standard | approved | architect |
| D045 | UI binding standard | approved | architect |
| D046 | Form field standard | approved | architect |
| D047 | Analytics binding standard | approved | architect |
| D048 | Workflow binding standard | approved | architect |
| D049 | Supabase deployment standard (per-table verify) | approved | architect |
| D050 | GitHub delivery standard (per-layer commit gate) | approved | architect |

---

## 2. New BUILD-phase decisions (B-D001+)

| ID | Topic | Decision | Status | Rationale | Owner | Date |
|---|---|---|---|---|---|---|
| B-D001 | Should BUILD duplicate RECOVERY ledger or reference it? | Reference only. BUILD files import by ID (T-, E-, D-, C-), add `B-` prefix for new items. | approved | No drift, single source of truth, lower maintenance. | architect | 2026-04-18 |
| B-D002 | Phase count: 12 (RECOVERY) vs 15 (BUILD) | Adopt 15-phase model: 1 baseline, 2–12 RECOVERY-origin, 13 integrity audit, 14 business readiness, 15 lock/release. | approved | Ultra-enterprise directive requires explicit deployment + readiness + lock phases. | architect | 2026-04-18 |
| B-D003 | Layer model: 10-layer (L1–L10) | Approved per directive. L1 Vision → L10 Integrity/Delivery. | approved | Matches Palantir-grade OS model; tracks completion % per layer. | architect | 2026-04-18 |
| B-D004 | Supabase deployment checkpoint | Gate in Phase 11. No table is considered "deployed" until `mcp__supabase__list_tables` verifies presence. All B/T tasks carry `supabase_deployed=pending — Phase 11` until then. | approved | Prevents false-positive completion; real source of truth = live DB. | architect | 2026-04-18 |
| B-D005 | GitHub commit gate | Gate in Phase 11. Per layer (not per file). Commits tagged `build/layer-L<n>`. | approved | Enables bisect per-layer if a layer breaks integrity. | architect | 2026-04-18 |
| B-D006 | Domain completion % formula | `completion_percent = fully_present_models / expected_models × 100`. A model is "fully_present" if DB + registry + API + page + menu all = Y. | approved | Strict: prevents greenwashing. Partial coverage shown separately. | architect | 2026-04-18 |
| B-D007 | 13th domain (support_schemas) scope | Covers: `public`, `pricing`, `planning`, `quality`, `routing`, `compliance`, `maintenance`, `service`, `treasury`, `crm_legacy`. Each evaluated as a sub-group with its own completion %. | approved | Avoids orphaning 10 legacy schemas; 12 canonical + 1 meta = 13. | architect | 2026-04-18 |
| B-D008 | Uncertainty handling in matrices | Use literal `uncertain` (not Y/N) when evidence is ambiguous. Do not guess. | approved | Matches rule 10 of directive. | architect | 2026-04-18 |
| B-D009 | Hebrew usage | `category_name_he` + all user-facing labels in Hebrew; technical IDs/fields in English. | approved | Matches rule 8; consistent with `menu_categorize` migration. | architect | 2026-04-18 |
| B-D010 | MODEL_COVERAGE_MATRIX granularity | One row per DB table (237). Registry-only entries without DB table (105 delta) appended as separate block with `found_in_db=N`. Pipeline entities (16) inlined when they map to tables; the 16th generic "entity" is referenced, not duplicated. | approved | Keeps matrix linear and reconcilable against migrations. | architect | 2026-04-18 |
| B-D011 | MENU_ROUTE_COVERAGE_MATRIX scale | ~2000 rows total would bloat this text phase. Phase 1 emits a **summary-plus-sampled** matrix (≥ 50 illustrative rows + aggregates + pointer to source files). Full 2000-row expansion in Phase 8. | approved | Phase 1 is a lock, not an exhaustive listing; source files remain authoritative. | architect | 2026-04-18 |
| B-D012 | `completion_status` enum in MODEL_COVERAGE_MATRIX | Exactly one of: `complete | partial | hidden | missing | broken`. `complete` = all 14 checks Y. `partial` = DB+registry present, ≥ 1 of {api,page,menu,flow,report,dashboard} missing. `hidden` = DB present but 0 UI touchpoints. `missing` = no DB table. `broken` = at least one runtime failure / broken import tied to model. | approved | Matches directive; enum is closed. | architect | 2026-04-18 |
| B-D013 | Definition of "deployment_verified" | `true` iff a Phase-11 run recorded success via `mcp__supabase__list_tables` OR `list_migrations`. All rows default to `false` at Phase 1. | approved | No row can be `true` until P11 runs. | architect | 2026-04-18 |
| B-D014 | 360 pages (13) canonical list | Customer360, Supplier360, Quote360, RFQ360, Project360, WorkOrder360, PO360, Finance360, Employee360, Invoice360, Material360, Payment360, Task360. (Alert360/Contract360 are optional stretch.) | approved | Matches CLAUDE.md + Phase 1b list. | architect | 2026-04-18 |
| B-D015 | Phase 1 read-only scope | Zero writes outside `_master-registry/`. No migrations, no code edits. Verified at end of Phase 1. | approved | Matches directive rule 1. | architect | 2026-04-18 |

---

## 3. Decision index summary
- Imported from RECOVERY: **50**
- New BUILD decisions: **21** (B-D001–B-D016 + B-D030–B-D035, one pre-existing B-D033)
- Total tracked: **71**

---

## 4. Security hardening decisions

| ID | Topic | Decision | Status | Rationale | Owner | Date |
|---|---|---|---|---|---|---|
| B-D033 | SQLi-safe query pattern for commercial routers | All future route files must use parameterized `sql` template bindings, never `sql.raw()` with user input. Commercial `sales-orders.ts` LIST handler fixed (C021). Identifier slots (`order_by`, `order_dir`, column names in dynamic SET clauses) must be gated by an explicit whitelist before any `sql.raw` splice. Apply same review to other commercial routes where `sql.raw` was detected: `customer-segments.ts`, `pricing-rules.ts`, `lead-sources.ts` — each has the same unsafe LIST-handler pattern and must be remediated in a follow-up pass. | approved | Hand-rolled quote escaping (`.replace(/'/g, "''")`) breaks under backslash handling, non-UTF-8 sequences, and does nothing for numeric/identifier positions — classic SQLi footgun. Parameterized bindings delegate escaping to the driver. | architect | 2026-04-18 |

---

## 5. Foundation Fix — BLOCKED items (2026-04-18)

### B-D030 — authMiddleware global mount — BLOCKED
- **Status:** `blocked_pending_human_review`
- **Reason:** Mounting `authMiddleware` at the global `/api/*` router would fail-close every endpoint currently reachable anonymously. Per `QA_AGENT_12_PERMISSIONS.md` this is **4,128 endpoints**.
- **Required before unblock:**
  - Audit of every service-to-service caller (mobile-app, erp-app, external webhooks, CI smoke tests).
  - Final approval of the exemption allow-list (health checks, public catalogue, signed-webhook receivers, OAuth callbacks, etc.).
  - Staging rollout plan with a shadow/report-only mode for >= 48 h.
  - Rollback procedure (feature-flag + router unmount + cache invalidation).
- **Current mitigation:** Per-router `authMiddleware` is already applied on the new `commercial`, `execution`, `procurement` route trees. Legacy routes remain unauthenticated pending full-mount.
- **Blockers to lift:** human sign-off from security owner **and** ops owner.
- **Do not auto-mount.** Requires explicit human approval.

### B-D031 — 30 hardcoded VAT literal replacements — BLOCKED
- **Status:** `blocked_pending_accounting_review`
- **Reason:** Replacing `* 0.18` / `* 0.17` / `/ 1.18` with `getVatRateForDate(date)` changes financial computation. Any existing booked record whose posting date yields a rate different from what was persisted will cause historical reports to diverge from posted ledger entries.
- **Scope:** ~30 files under `api-server/src/routes/` — discover via `grep -rE '\* 0\.18|/ 1\.18|\* 0\.17' api-server/src/routes/`.
- **Required before unblock:**
  - Accounting owner sign-off on the canonical VAT-rate resolution function.
  - Audit of `getVatRateForDate()` behaviour for **all** historical dates in the ledger (especially the 17%→18% transition cutover).
  - Migration plan for in-flight invoices (quotes created pre-cutover, invoiced post-cutover).
  - Reconciliation plan for already-posted journal entries (re-state vs. grandfather).
- **Safe workaround in place:** New code paths under `commercial`, `execution`, `procurement`, and `finance` already consume `getVatRateForDate()` correctly.

### B-D032 — AR/AP VAT gross/net asymmetry — BLOCKED
- **Status:** `blocked_pending_accounting_review`
- **Reason:** `api-server/src/routes/finance/ar-enterprise.ts:92` treats the `amount` field as **gross** (VAT-inclusive). `api-server/src/routes/finance/ap-enterprise.ts:90` treats it as **net** (VAT-exclusive). Normalising either side changes the semantic meaning of `amount` in persisted rows.
- **Required before unblock:**
  - Chart-of-accounts owner decision on the canonical interpretation (gross vs. net, per domain).
  - Data migration plan for existing rows (backfill `amount_net` / `amount_gross` columns, or transform in place).
  - Report-regeneration plan for VAT-returns, AR-aging, AP-aging, and trial-balance reports that key on `amount`.
- **Interim guard:** New Zod schemas in `commercial`, `execution`, `procurement`, `finance` explicitly document `amount` semantics (`amount_net` + `vat_amount` + `amount_gross` where all three exist).
- **Blockers to lift:** accounting owner + data owner sign-off.

---

## 6. Foundation Fix — decisions applied (2026-04-18)

| ID | Topic | Decision | Status | Rationale | Owner | Date |
|---|---|---|---|---|---|---|
| B-D034 | `tsconfig.base.json` at repo root | Created shared strict base (`target ES2022`, `strict:true`, `noImplicitReturns:true`, `allowSyntheticDefaultImports:true`) at `C:/Users/kobi/Projects/techno-kol-uzi-2026/tsconfig.base.json`. Note: `api-server/tsconfig.json` references `../../tsconfig.base.json` which from `api-server/` resolves to `C:/Users/kobi/Projects/tsconfig.base.json` — one level **outside** the repo root. Pre-existing path drift. Not changed this pass per directive. Follow-up: flip the extends path to `../tsconfig.base.json` (single `../`). | approved | Unblocks intent of shared config; documents relative-path drift for separate remediation. | architect | 2026-04-18 |
| B-D035 | JWT / ENCRYPTION_KEY fail-fast | Removed `\|\|` insecure-default fallbacks in `api-server/src/lib/security-upgrade.ts` (lines 16, 22). Server now throws at module import time if either env var is missing. | approved | Eliminates boot-with-default-secret footgun. The previous fallbacks `"default_jwt_secret_change_in_production_2026"` / `"default_encryption_key_32chars!!"` would otherwise silently sign tokens and encrypt 2FA secrets with shipped constants. | architect | 2026-04-18 |
