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
- New BUILD decisions: **15**
- Total tracked: **65**
