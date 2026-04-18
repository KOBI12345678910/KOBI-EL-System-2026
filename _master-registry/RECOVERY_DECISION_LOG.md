# RECOVERY DECISION LOG

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | Architectural decisions (past + proposed) governing the Phase 2–12 recovery |
| Entry count | 50 decisions (20 foundational + 30 spec items from Phase 1b) |

Each row: `id | date | decision | rationale | evidence | impact | status`.

---

## Spec-item → D-id index (Phase 1b)

| spec_item | D-id |
|---|---|
| canonical_domain_map (11 domains) | D021 |
| business_capability_map (7 capabilities) | D022 |
| required_360_pages (13 pages) | D023 |
| menu_taxonomy (10 categories) | D024 |
| form_standards | D025 |
| field_binding_template | D026 |
| api_contract_standards | D027 |
| workflow_and_event_standards | D028 |
| permission_model (17 roles × 9 scopes) | D029 |
| rls_expansion_standard + critical_tables_first | D030 |
| build_priority_matrix (P0/P1/P2/P3) | D031 |
| build_decision_gate (8 Qs) | D032 |
| definition_of_done_per_entity | D033 |
| qa_test_matrix | D034 |
| enterprise_table_build_standard | D035 |
| mandatory_columns_standard | D036 |
| recommended_business_columns | D037 |
| status_lifecycle_standard + example_lifecycles | D038 |
| index_strategy_standard | D039 |
| unique_constraint_rules | D040 |
| enum_and_lookup_rules | D041 |
| audit_standard + high_audit_tables | D042 |
| security_standard (invoice_lines example) | D043 |
| api_binding_standard + endpoint_template | D044 |
| ui_binding_standard + page_contract | D045 |
| form_field_standard + forbidden_field_patterns | D046 |
| analytics_binding_standard | D047 |
| workflow_binding_standard | D048 |
| supabase_deployment_standard + supabase_proof_record | D049 |
| github_delivery_standard + table_build_checklist + table_definition_of_done | D050 |

---

## D001 — Ground-truth source: filesystem, not registry

| Field | Value |
|---|---|
| id | D001 |
| date | 2026-04-18 |
| decision | All audit counts and cross-checks treat `supabase/migrations/*.sql`, `erp-app/src/App.tsx`, `api-server/src/routes/*.ts`, `onyx-procurement/src/pipeline/*` as authoritative. Any `_master-registry/*.json` claim that disagrees is flagged as drift. |
| rationale | Registries were assembled over multiple partial scans and diverged from reality. Code on disk is the executable truth. |
| evidence | AUDIT_REAL.md:8-11, CONNECTIVITY_VALIDATION.md:3-4 |
| impact | Every subsequent registry fix uses migrations as the source-of-truth; 93-105 claimed models flagged as phantom. |
| status | approved |

## D002 — Registry delta (105 models) must be physically resolved

| Field | Value |
|---|---|
| id | D002 |
| date | 2026-04-18 |
| decision | The 105 delta between registry (342) and migrations (237) will be closed by (a) retargeting 30 hidden models, (b) building 75 truly-absent models, or (c) removing phantom entries. No intermediate state acceptable. |
| rationale | A registry that claims models that don't exist breaks dashboards, reports, search, field bindings, anti-duplicate rules. |
| evidence | AUDIT_REAL.md:17-18,44; DISCOVERY_RECOVERY_MAP.md:7-22; MISSING_MODELS_SCAN.md |
| impact | Drives Phases 3 and 7. |
| status | approved |

## D003 — Canonical schema naming: migrations win

| Field | Value |
|---|---|
| id | D003 |
| date | 2026-04-18 |
| decision | Adopt migration-layer schema names as canonical: `commercial`, `execution`, `workforce`, `intelligence`, `procurement`, `inventory`, `finance`, `docs`, `governance`, `comms`, `analytics`, `orchestration`, etc. Registry aliases (`crm/sales/projects/hr_workforce/production/engineering/installation/ai_automation`) will be rewritten to match. |
| rationale | Renaming migrations is a high-risk destructive change (FK cascades, RLS policies, trigger dependencies, indexes). Renaming registry JSON is cheap and reversible. |
| evidence | AUDIT_REAL.md:102-106; CONNECTIVITY_VALIDATION.md:46,57 |
| impact | Registries models/fields/source-of-truth/dashboards/reports/relationships will be rewritten. Pipeline entity-map.js will be reviewed for consistency. |
| status | approved |

## D004 — Orphan-table ghost policy: explicit wire-or-drop

| Field | Value |
|---|---|
| id | D004 |
| date | 2026-04-18 |
| decision | Every orphan table (29 primary, 119 extended) must be either (a) wired to an FK + API + UI by end of Phase 6, or (b) removed via a destructive migration. No table may remain in production with zero FK-in and zero code reference past Phase 6. |
| rationale | Ghost tables accumulate tech debt, confuse agents/devs, inflate backup sizes, and risk silent data rot. |
| evidence | AUDIT_REAL.md:41; DISCOVERY_RECOVERY_MAP.md:257-379 |
| impact | Triggers T003–T031 + T094. Analytics `rm_*` read-models are prime candidates for either refresh-job wiring or removal. |
| status | approved |

## D005 — Dead-menu policy: every menu entry must resolve

| Field | Value |
|---|---|
| id | D005 |
| date | 2026-04-18 |
| decision | Every row in `app_menu` must either (a) resolve to a `<Route>` in `erp-app/src/App.tsx` with a real page component, or (b) be removed. Silent 404s are forbidden. |
| rationale | "No Dead Pages" rule from CLAUDE.md. 458 menu rows currently fail this. |
| evidence | SYSTEM_360_SANITY.md:21; CONNECTIVITY_VALIDATION.md:38; AUDIT_REAL.md:46 |
| impact | Phase 8. Drives bulk wiring PR + pruning migration. |
| status | approved |

## D006 — Duplicate-declaration zero-tolerance

| Field | Value |
|---|---|
| id | D006 |
| date | 2026-04-18 |
| decision | No duplicate CREATE TABLE, no duplicate Express `router.<method>(path, ...)` at the same mount, no duplicate App.tsx `<Route path>` literal, no duplicate `app_menu.route` value. Add DB unique index on `app_menu.route`. |
| rationale | Duplicates produce non-deterministic behavior and make recovery audits unreliable. |
| evidence | AUDIT_REAL.md:43; CONNECTIVITY_VALIDATION.md:44,54 |
| impact | Phase 5. New migration `00041_remove_duplicates.sql` anticipated. |
| status | approved |

## D007 — Source-of-truth: one primary table per controlled meaning

| Field | Value |
|---|---|
| id | D007 |
| date | 2026-04-18 |
| decision | `_master-registry/source_of_truth_registry.json` must declare exactly one primary physical table per business meaning (customer, lead, quote, project, employee, invoice, supplier, permission, ticket, etc.). All secondary tables must be marked `secondary` and linked to the primary. |
| rationale | 7 controlled meanings currently point at phantom tables; anti-duplicate rules cannot fire. |
| evidence | AUDIT_REAL.md:45; CONNECTIVITY_VALIDATION.md:48 |
| impact | Phase 2. Requires resolving duplicates (D009) first. |
| status | approved |

## D008 — Menu seed discipline: idempotent + FK to routes

| Field | Value |
|---|---|
| id | D008 |
| date | 2026-04-18 |
| decision | Menu seed migrations must use `DELETE + INSERT` or `INSERT ... ON CONFLICT DO UPDATE` patterns (as 00034+ do), and a post-seed validation step must fail the migration if any inserted `route` has no matching React `<Route path>`. |
| rationale | 510 menu rows currently point nowhere. Need enforcement mechanism. |
| evidence | AUDIT_REAL.md:46; SYSTEM_360_SANITY.md:21 |
| impact | Phase 8. Introduce `scripts/validate-menu-routes.mjs` in CI. |
| status | proposed |

## D009 — Duplicate-model resolution rules

| Field | Value |
|---|---|
| id | D009 |
| date | 2026-04-18 |
| decision | For the 17 duplicate models (leads, customers, opportunities, quotes, approvals, projects, project_phases, suppliers, employees, documents, document_versions, signatures, attachments, forecast_models, notifications, work_orders, workflow_steps), the migration-layer version is canonical. Other versions are either dropped or replaced by views for backward compatibility. |
| rationale | D003 implies this; also reduces FK ambiguity. |
| evidence | DISCOVERY_RECOVERY_MAP.md:237-254; AUDIT_REAL.md:130-140 |
| impact | Phase 5 + Phase 2. Destructive migrations required for cleanup. |
| status | approved |

## D010 — API-route-without-table: build the table, don't remove the route

| Field | Value |
|---|---|
| id | D010 |
| date | 2026-04-18 |
| decision | For 14 models that have an API route but no DB table (contacts, activities, meetings, milestones, items, reservations, schedules, contractors, assignments, templates, dashboards, reports, scorecards, users) — the default action is to build the table and wire FKs, not to remove the route. Exception: map to an existing equivalent where one exists (e.g., activities → commercial.crm_activities). |
| rationale | Routes represent user demand. Removing them breaks FE pages. |
| evidence | DISCOVERY_RECOVERY_MAP.md:96-112 |
| impact | Phase 7. |
| status | approved |

## D011 — FE-page-without-table: backfill DB + route

| Field | Value |
|---|---|
| id | D011 |
| date | 2026-04-18 |
| decision | For 4 models visible only at the FE layer (dependencies, drawings, raw_materials, teams) — build migration, API route, and register the route in `api-server/src/routes/index.ts`. |
| rationale | FE indicates UX demand and partial implementation. |
| evidence | DISCOVERY_RECOVERY_MAP.md:116-122 |
| impact | Phase 7. |
| status | approved |

## D012 — Truly-missing models: build with full stack (DB+API+FE+registry+menu)

| Field | Value |
|---|---|
| id | D012 |
| date | 2026-04-18 |
| decision | Each of the 75 truly-absent models is added to Phase 7 with required deliverables: migration + RLS + API route + Zod schema + FE page + menu entry + registry entry + pipeline entity wiring (where relevant). |
| rationale | Partial builds cause the same dead-page problem the audit is trying to eliminate. |
| evidence | DISCOVERY_RECOVERY_MAP.md:475; §B truly_absent rows |
| impact | Phase 7, largest work package. |
| status | approved |

## D013 — Unmounted routers: mount or delete

| Field | Value |
|---|---|
| id | D013 |
| date | 2026-04-18 |
| decision | `dashboardRouter`, `finRouterRouter`, `savedPlacesRouter` are imported but not mounted. Review each: if redundant with existing dashboard-*/fin-* routers, delete the file. If unique, mount it under an appropriate prefix in `api-server/src/routes/index.ts`. |
| rationale | Import-without-mount is bug-prone dead code. |
| evidence | DISCOVERY_RECOVERY_MAP.md:385-389 |
| impact | Phase 5. |
| status | approved |

## D014 — Dead RPCs: audit before delete

| Field | Value |
|---|---|
| id | D014 |
| date | 2026-04-18 |
| decision | 127 of 128 RPCs have no literal-name reference in api-server source. Before deleting any, verify they're not invoked via (a) dynamic RPC names, (b) Supabase-managed triggers, (c) migration-time seeds, (d) edge functions. Only delete after confirmed unused. |
| rationale | RPC invocation can be obfuscated by indirection. Removing a called RPC silently breaks features. |
| evidence | DISCOVERY_RECOVERY_MAP.md:17,381-393 |
| impact | Phase 11. |
| status | approved |

## D015 — Dashboard/Report sources must reference real tables

| Field | Value |
|---|---|
| id | D015 |
| date | 2026-04-18 |
| decision | Every dashboard widget source and every report source field in `dashboards_registry.json` / `reports_registry.json` must reference a table that exists in migrations. Add a CI script that fails on any dangling reference. |
| rationale | 10/10 dashboards and 17/20 reports currently reference phantom schemas. |
| evidence | CONNECTIVITY_VALIDATION.md:42-43 |
| impact | Phase 10. |
| status | approved |

## D016 — Dead links: fix by routing, not by removal

| Field | Value |
|---|---|
| id | D016 |
| date | 2026-04-18 |
| decision | For the 13 dead in-app links, prefer adding the missing `<Route>` or remapping to an existing equivalent (e.g., `/ai-engine/chatbot-settings` → `/ai-engine/ai-chatbot-settings`). Do not simply delete the link. |
| rationale | Each dead link implies a user-expected feature. Removal hides demand. |
| evidence | SYSTEM_360_SANITY.md:113-129 |
| impact | Phase 9. |
| status | approved |

## D017 — Orphan source files: delete only with replacement proof

| Field | Value |
|---|---|
| id | D017 |
| date | 2026-04-18 |
| decision | The 43 orphan page files and 2 orphan API route files may be deleted only after each has a confirmed current replacement (e.g., `purchase-orders.tsx` → `pages/procurement/purchase-orders.tsx`). Deletion PR must list the replacement per file. |
| rationale | Prevent accidental loss of business logic. |
| evidence | SYSTEM_360_SANITY.md:143-153 |
| impact | Phase 9. |
| status | approved |

## D018 — SQL integrity gate: parens must balance

| Field | Value |
|---|---|
| id | D018 |
| date | 2026-04-18 |
| decision | 5 migrations (00010, 00011, 00012, 00015, 00016) have unbalanced parens. Must be fixed before any production deploy. Add CI step to parse every migration with a SQL parser (e.g., `pglast` or `pg-query`). |
| rationale | Migrations silently fail or apply partially; production risk. |
| evidence | INTEGRITY_REPORT.md:75-80; CONNECTIVITY_VALIDATION.md:55 |
| impact | Phase 9. Blocks Phase 12 sign-off. |
| status | approved |

## D019 — Broken-import repair policy

| Field | Value |
|---|---|
| id | D019 |
| date | 2026-04-18 |
| decision | All 30 broken relative imports (including the 4 runtime-breaking pages goods-receipt / purchase-requests / raw-materials / suppliers → `../../lib/utils`) must be fixed by resolving path or creating missing util; no `@ts-ignore` allowed. |
| rationale | Builds compile but runtime fails — classic deployment trap. |
| evidence | INTEGRITY_REPORT.md:84-116; CONNECTIVITY_VALIDATION.md:56 |
| impact | Phase 9. |
| status | approved |

## D020 — RLS authoritative count

| Field | Value |
|---|---|
| id | D020 |
| date | 2026-04-18 |
| decision | Resolve the 213 vs 302 RLS-policy count drift by regenerating a per-table RLS inventory via a single canonical script. Update both AUDIT_REAL.md and CONNECTIVITY_VALIDATION.md to cite the same number. Every `public.*` table must have RLS enabled and at least one policy. |
| rationale | Two scans produced different counts, meaning the audit artifacts are stale in at least one. |
| evidence | AUDIT_REAL.md:36; CONNECTIVITY_VALIDATION.md:22 |
| impact | Phase 4. |
| status | approved |

---

## phase_1_done

20 foundational decisions logged. Status: 18 approved, 2 proposed (D008 enforcement mechanism, D014 exec ordering). These decisions govern the Phase 2–12 execution plan defined in RECOVERY_MASTER_LEDGER.md §4.

---

# PHASE 1b — Spec verification decisions (D021–D050)

Every entry below captures one user spec item with status `approved-by-user`.

## D021 — Canonical domain map

| Field | Value |
|---|---|
| id | D021 |
| date | 2026-04-18 |
| decision | Adopt 11 canonical domains: commercial / execution / procurement / inventory / finance / workforce / docs (+documents) / comms / analytics / intelligence / orchestration / governance. Each domain has an explicit `core_entities` list (see CANONICAL_DOMAIN_VERIFICATION.md). |
| rationale | Canonical taxonomy eliminates legacy crm/sales/projects/hr_workforce names and aligns with migration schemas. |
| evidence | User spec message; CANONICAL_DOMAIN_VERIFICATION.md §1.1-§1.12 |
| impact | Drives Phase 2 rename; governs all future registry entries. |
| status | approved-by-user |

## D022 — Business capability map (7)

| Field | Value |
|---|---|
| id | D022 |
| date | 2026-04-18 |
| decision | 7 capabilities: sales_to_cash, source_to_pay, plan_to_execute, stock_to_trace, hire_to_payroll, document_to_knowledge, monitor_to_decide. Every workflow must be linkable to at least one capability. |
| rationale | Capability framing is the top-level cross-domain orchestration unit. |
| evidence | User spec |
| impact | Phase 11 pipeline alignment; adds `capability` field to flows_registry. |
| status | approved-by-user |

## D023 — Required 360 pages (13)

| Field | Value |
|---|---|
| id | D023 |
| date | 2026-04-18 |
| decision | 13 mandatory 360 pages: Customer360, Supplier360, Quote360, Project360, WorkOrder360, PurchaseOrder360, Invoice360, Employee360, Material360, Payment360, Contract360, Task360, Alert360. 5 present, 8 missing. |
| rationale | Every core business entity must have a unified 360 view per CLAUDE.md "No Dead Pages". |
| evidence | User spec; CANONICAL_DOMAIN_VERIFICATION.md §3 |
| impact | Phase 7 build-out for 8 missing pages (T361–T368). |
| status | approved-by-user |

## D024 — Menu taxonomy (10 top-level categories)

| Field | Value |
|---|---|
| id | D024 |
| date | 2026-04-18 |
| decision | Menu has 10 canonical top-level categories plus tax/compliance/infra/integrations/system = 15 total (as already seeded post-00036/00040). Each category has a spec-defined `visible_surfaces` list. |
| rationale | Discoverability + topic cohesion. |
| evidence | User spec; migration 00041 header |
| impact | Phase 8 menu reconciliation; 00041 recategorization migration. |
| status | approved-by-user |

## D025 — Form standards

| Field | Value |
|---|---|
| id | D025 |
| date | 2026-04-18 |
| decision | Every form must declare entity_ref, field_binding_template compliant fields, validation, and lifecycle status. |
| rationale | Forms without standards produce inconsistent UX and audit gaps. |
| evidence | User spec |
| impact | Phase 8 / 9 form refactors. |
| status | approved-by-user |

## D026 — Field binding template

| Field | Value |
|---|---|
| id | D026 |
| date | 2026-04-18 |
| decision | Every field binds via `{entity, column, label_he, label_en, type, enum?, ref?, required, validation, readonly?, pii?}`. |
| rationale | Enables auto-generation of forms, lists, reports, and API schemas from a single definition. |
| evidence | User spec |
| impact | fields_registry schema upgrade. |
| status | approved-by-user |

## D027 — API contract standards

| Field | Value |
|---|---|
| id | D027 |
| date | 2026-04-18 |
| decision | API endpoints follow REST verb + resource; POST for actions; response always wraps `{data, meta, errors}`; errors use problem+json. |
| rationale | Predictable FE integration. |
| evidence | User spec `api_contract_standards` |
| impact | Phase 5 dedup; new endpoints built to this standard. |
| status | approved-by-user |

## D028 — Workflow and event standards

| Field | Value |
|---|---|
| id | D028 |
| date | 2026-04-18 |
| decision | Workflows emit domain events with `{event_name, entity_ref, payload, occurred_at, correlation_id}`. State transitions side-effect via event listeners only. |
| rationale | Decouples state machines from imperative side-effects. |
| evidence | User spec |
| impact | Phase 11 orchestrator alignment. |
| status | approved-by-user |

## D029 — Permission model (17 roles × 9 scopes)

| Field | Value |
|---|---|
| id | D029 |
| date | 2026-04-18 |
| decision | 17 roles (admin, ops_lead, sales_manager, buyer, warehouse, accountant, hr_manager, employee, auditor, etc.) × 9 scopes (read, write, approve, delete, export, admin, own_only, team_only, all). |
| rationale | Existing roles_registry has 18; align to spec 17 with scoped RLS. |
| evidence | User spec; roles_registry.json |
| impact | Phase 4 RLS expansion. |
| status | approved-by-user |

## D030 — RLS expansion standard + critical tables first

| Field | Value |
|---|---|
| id | D030 |
| date | 2026-04-18 |
| decision | RLS policies follow tenant-id + owner + role-based scope. Critical tables first: customers, invoices, payroll_entries, quotes, purchase_orders, contracts, employees, audit_logs. |
| rationale | Highest-impact data gets strongest controls first. |
| evidence | User spec |
| impact | Phase 4 RLS audit (T325). |
| status | approved-by-user |

## D031 — Build priority matrix P0/P1/P2/P3

| Field | Value |
|---|---|
| id | D031 |
| date | 2026-04-18 |
| decision | P0 = core + 360 + state machines + audit; P1 = dashboards + forecasting + AI; P2 = NLQ + deep ML; P3 = experimental. |
| rationale | Matches CLAUDE.md Build Priority. |
| evidence | User spec; CLAUDE.md |
| impact | Phase 7 ordering. |
| status | approved-by-user |

## D032 — Build decision gate (8 questions)

| Field | Value |
|---|---|
| id | D032 |
| date | 2026-04-18 |
| decision | Before creating any new model, answer 8 questions: business need? canonical domain? existing overlap? lifecycle? permissions? audit? analytics? workflow trigger? All 8 must pass. |
| rationale | Prevents registry bloat and phantom models. |
| evidence | User spec |
| impact | All Phase 7 builds. |
| status | approved-by-user |

## D033 — Definition of Done per entity

| Field | Value |
|---|---|
| id | D033 |
| date | 2026-04-18 |
| decision | DoD covers model (schema + RLS + audit + mandatory columns), page (list/detail/create/edit + 360 where applicable), dashboard_or_report (source binding + permission-gated). |
| rationale | Partial builds cause dead pages. |
| evidence | User spec |
| impact | Phase 7 acceptance criteria. |
| status | approved-by-user |

## D034 — QA test matrix

| Field | Value |
|---|---|
| id | D034 |
| date | 2026-04-18 |
| decision | 4 test tiers: smoke (happy path), integration (cross-entity), analytics (data correctness), security (RLS + permission). |
| rationale | Layered coverage. |
| evidence | User spec |
| impact | Phase 12 final audit. |
| status | approved-by-user |

## D035 — Enterprise table build standard

| Field | Value |
|---|---|
| id | D035 |
| date | 2026-04-18 |
| decision | Each table has a `table_design_record` with domain, purpose, mandatory_columns, business_columns, indexes, uniques, lifecycle, RLS, audit_level, API binding, UI binding, analytics binding, supabase_proof. |
| rationale | Palantir-grade consistency. |
| evidence | User spec |
| impact | Schema of models_registry upgraded. |
| status | approved-by-user |

## D036 — Mandatory columns standard

| Field | Value |
|---|---|
| id | D036 |
| date | 2026-04-18 |
| decision | Every table must have: id UUID PK, created_at, updated_at, created_by, updated_by, is_deleted boolean, is_active boolean. |
| rationale | Consistent audit surface. |
| evidence | User spec |
| impact | Phase 7 builds; retrofit audit on critical tables. |
| status | approved-by-user |

## D037 — Recommended business columns

| Field | Value |
|---|---|
| id | D037 |
| date | 2026-04-18 |
| decision | Recommend record_code, status, notes, metadata_json per business table. |
| rationale | Supports search/filter/extension without schema churn. |
| evidence | User spec |
| impact | Phase 7 builds. |
| status | approved-by-user |

## D038 — Status lifecycle standard

| Field | Value |
|---|---|
| id | D038 |
| date | 2026-04-18 |
| decision | Example lifecycles defined for: quote (draft→sent→approved→won/lost), project (initiated→planning→in_progress→completed/cancelled), purchase_order (draft→submitted→approved→received→closed), payroll_run (calculated→approved→exported→paid). |
| rationale | Matches existing state_machines count (13–15). |
| evidence | User spec; state-machines.js |
| impact | Phase 11 alignment. |
| status | approved-by-user |

## D039 — Index strategy standard

| Field | Value |
|---|---|
| id | D039 |
| date | 2026-04-18 |
| decision | Indexes on all FK columns, status + created_at composite where query patterns demand it, partial indexes for is_deleted=false. |
| rationale | Query performance. |
| evidence | User spec |
| impact | Phase 7 builds; retrofit where needed. |
| status | approved-by-user |

## D040 — Unique constraint rules

| Field | Value |
|---|---|
| id | D040 |
| date | 2026-04-18 |
| decision | Every business entity has a unique `record_code` (e.g., INV-2026-00001). Composite uniques for junction tables. |
| rationale | Eliminates duplicate business records. |
| evidence | User spec |
| impact | Phase 5 dedup; Phase 7 builds. |
| status | approved-by-user |

## D041 — Enum + lookup rules

| Field | Value |
|---|---|
| id | D041 |
| date | 2026-04-18 |
| decision | Low-cardinality enums as CHECK constraints; high-cardinality or user-configurable as lookup tables with FK. |
| rationale | Balance simplicity and flexibility. |
| evidence | User spec |
| impact | Phase 7 builds. |
| status | approved-by-user |

## D042 — Audit standard + high-audit tables

| Field | Value |
|---|---|
| id | D042 |
| date | 2026-04-18 |
| decision | Every write-capable table emits to governance.audit_logs. High-audit (full payload): invoices, payments, payroll_*, contracts, permissions, user_roles. |
| rationale | Compliance + traceability. |
| evidence | User spec |
| impact | Phase 4 + Phase 12. |
| status | approved-by-user |

## D043 — Security standard (invoice_lines example)

| Field | Value |
|---|---|
| id | D043 |
| date | 2026-04-18 |
| decision | Row-level security: tenant_id filter always; additional per-entity rules (e.g., invoice_lines visible only to invoice's tenant + assigned accountant). |
| rationale | Least privilege. |
| evidence | User spec |
| impact | Phase 4 RLS. |
| status | approved-by-user |

## D044 — API binding standard + endpoint template

| Field | Value |
|---|---|
| id | D044 |
| date | 2026-04-18 |
| decision | Each entity exposes GET /resource, GET /resource/:id, POST /resource, PUT /resource/:id, DELETE (soft), POST /resource/:id/actions/:action. Template codified. |
| rationale | Uniform FE consumption. |
| evidence | User spec |
| impact | Phase 5 dedup + Phase 7 builds. |
| status | approved-by-user |

## D045 — UI binding standard + page contract

| Field | Value |
|---|---|
| id | D045 |
| date | 2026-04-18 |
| decision | Each page answers: where am I, what is this, current status, what can I do, next step, related records. Page contract codified. |
| rationale | CLAUDE.md No Dead Pages. |
| evidence | User spec; CLAUDE.md |
| impact | Phase 8/9. |
| status | approved-by-user |

## D046 — Form field standard + forbidden patterns

| Field | Value |
|---|---|
| id | D046 |
| date | 2026-04-18 |
| decision | No free-form text where enum applies; no currency-as-float; no dates-as-strings; no secrets in plain text. |
| rationale | Data quality floor. |
| evidence | User spec |
| impact | All new forms. |
| status | approved-by-user |

## D047 — Analytics binding standard

| Field | Value |
|---|---|
| id | D047 |
| date | 2026-04-18 |
| decision | Every entity lists `analytics_sources` (tables/views it feeds) and `dashboards_consuming`. Dashboard widget sources must reference real tables (D015). |
| rationale | Eliminates phantom dashboards. |
| evidence | User spec; D015 |
| impact | Phase 10. |
| status | approved-by-user |

## D048 — Workflow binding standard

| Field | Value |
|---|---|
| id | D048 |
| date | 2026-04-18 |
| decision | Each entity lists `workflows_participating`. Workflows reference entity_ref + state_machine_id. |
| rationale | Drives orchestrator wiring. |
| evidence | User spec |
| impact | Phase 11. |
| status | approved-by-user |

## D049 — Supabase deployment standard + proof record

| Field | Value |
|---|---|
| id | D049 |
| date | 2026-04-18 |
| decision | Every migration produces a `supabase_proof_record`: migration filename, applied_at, advisor_check_result, rls_check_result, view_dependencies_ok. |
| rationale | Production deploy traceability. |
| evidence | User spec |
| impact | Phase 9 + Phase 12. |
| status | approved-by-user |

## D050 — GitHub delivery standard + 22-item build checklist + 11-condition DoD

| Field | Value |
|---|---|
| id | D050 |
| date | 2026-04-18 |
| decision | Every new table PR must pass the 22-item `table_build_checklist` and satisfy all 11 conditions in `table_definition_of_done`, and produce a "NEW TABLE BUILD REPORT" in the PR body. |
| rationale | Quality gate. |
| evidence | User spec |
| impact | All Phase 7 PRs. |
| status | approved-by-user |

---

## phase_1b_done

30 spec-item decisions (D021–D050) logged, index table added at top, all status `approved-by-user`. Total decisions: 50. Ready for Phase 2 execution.
