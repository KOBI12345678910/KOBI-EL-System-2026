# BUILD TASK BOARD — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Source of T001–T368 | `RECOVERY_TASK_BOARD.md` (mirrored here with added build columns) |
| New B-ids | B001+ reserved for build-forward tasks created in Phases 2–15 |
| Statuses | `todo / in_progress / blocked / done / validated / superseded` |
| Default assignee | build-agent |

Columns (ALL tasks):
`id | title | phase | status | priority | evidence_refs | blocker | assigned_to | build_layer (1-10) | domain | api_needed | page_needed | supabase_deployed | github_committed`

Legend:
- `build_layer` — see `LAYER_10_ARCHITECTURE_MAP.md` (L1–L10)
- `domain` — one of 13 domains (`governance` | `commercial` | `execution` | `procurement` | `inventory` | `finance` | `workforce` | `docs` | `intelligence` | `analytics` | `orchestration` | `comms` | `support_schemas`)
- `api_needed` — Y/N/uncertain
- `page_needed` — Y/N/uncertain
- `supabase_deployed` — `pending | done` (all start `pending — Phase 11`)
- `github_committed` — `pending | done` (all start `pending — Phase 11`)

---

## 1. Mirrored RECOVERY tasks T001–T368

Rather than duplicate 368 table rows, this section declares the full mirror:

- **Source**: `RECOVERY_TASK_BOARD.md`, rows T001–T368
- **All mirrored rows inherit** `supabase_deployed = pending — Phase 11`, `github_committed = pending — Phase 11`
- **Layer/domain mapping rule**: see annotated groups below; individual rows re-tagged on activation.

### 1.1 Group tagging — T001–T368

| Task range | phase (RECOVERY) | build_layer | primary domain(s) | api_needed | page_needed | notes |
|---|---|---|---|---|---|---|
| T001–T035 | 2, 3, 5, 6, 8 | L3 / L4 / L5 | mixed (analytics, commercial, finance, governance, intelligence) | Y | partial | Schema reconciliation + orphan wire/drop |
| T036–T070 | 2, 5, 6, 8 | L3 / L7 / L9 | commercial, finance, procurement, governance | Y | Y | Duplicate elimination + menu/route cleanup |
| T071–T110 | 6, 7 | L3 / L4 | inventory, intelligence, orchestration, planning, pricing, quality | Y | Y | Orphan decisions + new table build-out |
| T111–T165 | 7 | L3 / L4 / L7 | finance, workforce, governance, docs, maintenance, service | Y | Y | Truly-missing model build-out (D012) |
| T166–T230 | 8, 9 | L7 | all (page/route reconciliation) | N | Y | 779 invisible menu + 455 invisible pages |
| T231–T300 | 4, 9 | L9 | all (RLS + broken pages/imports) | N | partial | 213–302 RLS drift + 30 broken imports |
| T301–T325 | 10, 11, 12 | L8 / L6 / L1 | analytics, orchestration | Y | Y | Dashboards 10 + Reports 17 + pipeline alignment |
| T326–T360 | 7 | L3 | 35 forgotten models (per PHASE_1B) | Y | uncertain | knowledge_cards, document_chunks, anomaly_feedback, recommendation_feedback, alert_subscriptions, command_logs, maintenance.*, planning.*, pricing.*, quality.*, routing.*, treasury.*, comms_threads, support_sla_tracking, portal_sessions, notification_deliveries, barcode_scans, material_lots, logistics_orders, project_risks, project_blockers, project_cost_plans |
| T361–T368 | 12 | L10 | governance | N | N | Final integrity audit (re-emit AUDIT_REAL etc.) |

All 368 rows retain their original phase/priority/evidence_refs from RECOVERY_TASK_BOARD. Status tracking continues there (authoritative). This board **adds** build metadata only.

---

## 2. New BUILD-specific tasks (B001+)

### 2.analytics — Analytics Domain Mega Batch (2026-04-18)

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to | build_layer | domain | api_needed | page_needed | supabase_deployed | github_committed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B-ANL-001 | Migration 00061 — analytics domain complete (ALTERs + 4 new tables + CHECK + RLS + indexes + seeds) | 7 | done | P0 | B-E021 | none | build-agent | L3/L4 | analytics | Y | N | pending — Phase 11 | pending — Phase 11 |
| B-ANL-002 | Migration 00062 — analytics menu wiring (9 routes under "דשבורד") | 7 | done | P0 | B-E022 | none | build-agent | L7 | analytics | N | N | pending — Phase 11 | pending — Phase 11 |
| B-ANL-003 | Zod — 9 analytics modules + barrel + package.json subpath export | 7 | done | P0 | B-E023 | none | build-agent | L4 | analytics | Y | Y | pending — Phase 11 | pending — Phase 11 |
| B-ANL-004 | API — 9 analytics routers + aggregator mounted `/api/analytics` (uses _safe-list-helpers) | 7 | done | P0 | B-E024 | none | build-agent | L7 | analytics | Y | N | pending — Phase 11 | pending — Phase 11 |
| B-ANL-005 | Pages — 8 analytics pages + shared helper + App.tsx wiring (Hebrew RTL) | 7 | done | P0 | B-E025 | none | build-agent | L7 | analytics | N | Y | pending — Phase 11 | pending — Phase 11 |
| B-ANL-006 | Permission matrix — analytics_permission_matrix.md (4 roles × 9 modules) | 7 | done | P1 | B-E026 | none | build-agent | L9 | analytics | N | N | pending — Phase 11 | pending — Phase 11 |


Tasks created during Phase 1 that do not exist in RECOVERY:

| id | title | phase | status | priority | evidence_refs | blocker | assigned_to | build_layer | domain | api_needed | page_needed | supabase_deployed | github_committed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| B001 | Create `BUILD_MASTER_LEDGER.md` | 1 | done | critical | B-E001 | none | build-agent | L1 | governance | N | N | N/A | pending — Phase 11 |
| B002 | Create `BUILD_TASK_BOARD.md` (this file) | 1 | done | critical | B-E002 | none | build-agent | L1 | governance | N | N | N/A | pending — Phase 11 |
| B003 | Create `BUILD_DECISION_LOG.md` with D001–D050 imported + B-D001+ | 1 | done | critical | B-E003 | none | build-agent | L1 | governance | N | N | N/A | pending — Phase 11 |
| B004 | Create `BUILD_EVIDENCE_MAP.md` cross-referencing E001–E368 + B-E001+ | 1 | done | critical | B-E004 | none | build-agent | L1 | governance | N | N | N/A | pending — Phase 11 |
| B005 | Create `BUILD_CHANGELOG.md` (forward-looking) | 1 | done | high | B-E005 | none | build-agent | L1 | governance | N | N | N/A | pending — Phase 11 |
| B006 | Create `BUILD_FINAL_STATUS.json` (15-phase + 10-layer + domain %) | 1 | done | critical | B-E006 | none | build-agent | L1 | governance | N | N | N/A | pending — Phase 11 |
| B007 | Create `MODEL_COVERAGE_MATRIX.md` (237 tables + 16 entities + 342 registry) | 1 | done | critical | B-E007 | none | build-agent | L3 | governance | N | N | N/A | pending — Phase 11 |
| B008 | Create `MENU_ROUTE_COVERAGE_MATRIX.md` (union routes/menu/pages ≈ 2000 rows) | 1 | done | critical | B-E008 | none | build-agent | L7 | governance | N | N | N/A | pending — Phase 11 |
| B009 | Create `TABLE_DEPLOYMENT_MATRIX.md` (237 tables) | 1 | done | critical | B-E009 | none | build-agent | L4 | governance | N | N | N/A | pending — Phase 11 |
| B010 | Create `LAYER_10_ARCHITECTURE_MAP.md` | 1 | done | critical | B-E010 | none | build-agent | L1–L10 | governance | N | N | N/A | pending — Phase 11 |
| B011 | Create 13 domain checklists under `domains/` | 1 | done | critical | B-E011 | none | build-agent | L2 | all | N | N | N/A | pending — Phase 11 |
| B012 | Create `PHASE_1_ENTERPRISE_SUMMARY.md` | 1 | done | critical | B-E012 | none | build-agent | L1 | governance | N | N | N/A | pending — Phase 11 |
| B013 | Phase 2 kickoff — Canonical schema resolution plan | 2 | todo | critical | E003,E016,E083 | D003 decision | build-agent | L3 | all | N | N | pending — Phase 11 | pending — Phase 11 |
| B014 | Phase 11 kickoff — Supabase deployment verification (per-table) | 11 | todo | critical | RECOVERY_FINAL_STATUS | none | build-agent | L4 | all | N | N | pending | pending |
| B015 | Phase 11 kickoff — GitHub commit gate (per-layer) | 11 | todo | critical | RECOVERY_FINAL_STATUS | none | build-agent | L10 | all | N | N | N/A | pending |
| B016 | Phase 14 — Per-domain business-readiness gate (13 gates) | 14 | todo | high | domains/*.md | B013–B015 | build-agent | L2 | all | N | N | pending — Phase 11 | pending — Phase 11 |
| B017 | Phase 15 — v2.0.0 release + `FINAL_STATE.json` lock | 15 | todo | critical | CHANGELOG.md | B016 | build-agent | L10 | governance | N | N | done (by P11) | done (by P11) |

**Task count**: 368 mirrored (T001–T368) + 17 new (B001–B017) = **385 entries** under BUILD control.

---

## 3. Phase tracker summary

| Phase | Open tasks | Blocked tasks | Notes |
|---|--:|--:|---|
| 1 | 0 | 0 | All B001–B012 done |
| 2 | ~70 (T001–T035, B013) | pending D003 ratification | |
| 3 | ~25 | pending D002 ratification | |
| 4 | ~25 | pending D020 | |
| 5 | ~20 | pending D006 | |
| 6 | ~50 | pending D004 (per-table decision) | |
| 7 | ~42 (T111–T165 partial, T326–T360) | pending D012 | Commercial Mega Batch 01 (2026-04-18): 4/75 tables. Execution Mega Batch (2026-04-18): 29/29 execution entities full-stack delivered (10 new tables + 19 enhanced; 29 Zod, 29 API routers, 22 pages, menu + audit + permission matrix). Project360 + WorkOrder360 gates passed. |
| 8 | ~100 | pending D005, D008 | |
| 9 | ~45 | pending D014, D017 | |
| 10 | ~27 | pending D015 | |
| 11 | 2 (B014, B015) | none | Deployment gate |
| 12 | 8 (T361–T368) | after P2–P10 | |
| 13 | pending | after P12 | |
| 14 | 1 (B016) | after P13 | |
| 15 | 1 (B017) | after P14 | |

---

## Phase 7 — Mega Batch: Procurement Domain (2026-04-18) — DONE

| ID | Task | Phase | Status | Priority | Evidence | Depends | Notes |
|---|---|---|---|---|---|---|---|
| B-PROC-01 | Emit `supabase/migrations/00047_procurement_domain_complete.sql` | 7 | done | critical | B-E015 | D014 | 7 new tables + po_receipts view + ALTERs + seeds + RLS + triggers |
| B-PROC-02 | Emit `supabase/migrations/00048_procurement_menu_wiring.sql` | 7 | done | critical | B-E016 | B-PROC-01 | 16 idempotent menu entries |
| B-PROC-03 | Emit 18 Zod schemas `lib-client/api-zod/src/procurement/*.ts` + barrel | 7 | done | critical | B-E017 | B-PROC-01 | zod + _shared + index |
| B-PROC-04 | Emit 18 API routes `api-server/src/routes/procurement/*.ts` + aggregator | 7 | done | critical | B-E018 | B-PROC-03 | mounted at `/api/procurement/*` in routes/index.ts |
| B-PROC-05 | Emit 14 Hebrew RTL pages `erp-app/src/pages/procurement/v2/*.tsx` | 7 | done | critical | B-E019 | B-PROC-04 | wouter lazy-load wired into App.tsx |
| B-PROC-06 | Emit permission matrix `_master-registry/domains/procurement_permission_matrix.md` | 7 | done | high | B-E020 | B-PROC-01..05 | 10 roles × 18 models |
| B-PROC-07 | Emit evidence log `_master-registry/procurement_evidence_log.md` | 7 | done | high | — | — | 13 sections |
| B-PROC-08 | Update `BUILD_CHANGELOG.md` (B-C015..B-C020) | 7 | done | high | — | all | Phase 7 section extended |
| B-PROC-09 | Update `BUILD_FINAL_STATUS.json` (procurement completion_percent 17→85, procurement_mega_batch_metadata) | 7 | done | high | — | all | domain_completion_average 6.8→12.8 |

---

## Phase 7 — Mega Batch: Execution Domain (2026-04-18) — DONE

| ID | Task | Phase | Status | Priority | Evidence | Depends | Notes |
|---|---|---|---|---|---|---|---|
| B-EXEC-01 | Emit `supabase/migrations/00045_execution_domain_complete.sql` | 7 | done | critical | execution_evidence_log.md §3 §4 | D014 | 10 new tables + ALTER IF NOT EXISTS on 19 existing tables + state lifecycle CHECK constraints + audit triggers + seed (work_centers, installation_teams) |
| B-EXEC-02 | Emit `supabase/migrations/00046_execution_menu_wiring.sql` | 7 | done | critical | — | B-EXEC-01 | 18 idempotent menu entries (projects/production/installation/engineering) |
| B-EXEC-03 | Emit 29 Zod schemas `lib-client/api-zod/src/execution/*.ts` + `_shared.ts` + barrel | 7 | done | critical | — | B-EXEC-01 | 29 entities with Create/Update/Read/List query schemas |
| B-EXEC-04 | Emit 29 API routes `api-server/src/routes/execution/*.ts` + `_shared.ts` + `_crud-factory.ts` + aggregator | 7 | done | critical | — | B-EXEC-03 | mounted at `/api/execution/*` in routes/index.ts; CRUD + state-transition endpoints |
| B-EXEC-05 | Emit 22 Hebrew RTL pages `erp-app/src/pages/execution/*.tsx` (Project360 + WorkOrder360 + Task360 + Contract360 + Alert360 + 17 list pages) | 7 | done | critical | — | B-EXEC-04 | Project360 + WorkOrder360 completion gates passed |
| B-EXEC-06 | Wire lazy imports + Route entries in `erp-app/src/App.tsx` | 7 | done | critical | — | B-EXEC-05 | 25 lazy imports, 29 `<Route>` entries placed above legacy redirects |
| B-EXEC-07 | Emit permission matrix `_master-registry/domains/execution_permission_matrix.md` | 7 | done | high | — | B-EXEC-01..06 | endpoint → capability + role grants |
| B-EXEC-08 | Emit evidence log `_master-registry/execution_evidence_log.md` | 7 | done | high | — | — | 12 sections |
| B-EXEC-09 | Update `BUILD_CHANGELOG.md` (B-C080..B-C087) | 7 | done | high | — | all | Phase 7 section extended |
| B-EXEC-10 | Update `BUILD_FINAL_STATUS.json` (execution completion_percent 3→92, execution_mega_batch_executed=true) | 7 | done | high | — | all | Project360 + WorkOrder360 gates passed |


---

## Phase 7 — Finance Tier 1 (Option 1 — Tight Deliverable, 2026-04-18)

Batch: `B-BATCH-FINANCE-TIER1-01`. Scope: Invoice360 + Payment360 completion gate,
core VAT route, +6 missing finance tables. Remaining finance entities
(receipts, expenses, GL, bank, collection, dunning, budget, cashflow,
costing, FX admin, consolidation, annual tax) are deferred to Tier 2.

| ID | Task | Phase | Status | Priority | Evidence | Depends | Notes |
|---|---|---|---|---|---|---|---|
| B-FIN-01 | P1 — Export `getVatRateForDate` + VAT constants from `israeli-accounting-engine.ts` | 7 | done | critical | BUILD_CHANGELOG B-F001 | — | Unblocks route compilation |
| B-FIN-02 | Emit `supabase/migrations/00051_finance_domain_complete.sql` | 7 | done | critical | BUILD_CHANGELOG B-F002 | B-FIN-01 | ALTER 18 tables + CREATE 6 new + CHECK constraints + RLS + audit triggers + FX seed |
| B-FIN-03 | Emit `supabase/migrations/00052_finance_menu_wiring.sql` | 7 | done | critical | BUILD_CHANGELOG B-F003 | B-FIN-02 | 23 idempotent entries under category 6 |
| B-FIN-04 | Emit 6 Zod schemas + barrel + `./finance` sub-path export | 7 | done | critical | BUILD_CHANGELOG B-F004 | B-FIN-02 | invoice math invariant enforced |
| B-FIN-05 | Emit 3 API route files (`invoices.ts`, `payments.ts`, `vat-records.ts`) + aggregator | 7 | done | critical | BUILD_CHANGELOG B-F005 | B-FIN-04 | issue/void/reconcile/allocate/refund/export |
| B-FIN-06 | Mount finance aggregator at `/api/v2/finance` in `routes/index.ts` | 7 | done | critical | BUILD_CHANGELOG B-F006 | B-FIN-05 | legacy `/finance` preserved untouched |
| B-FIN-07 | Emit Invoice360 page w/ embedded line editor | 7 | done | critical | BUILD_CHANGELOG B-F007 | B-FIN-05 | Finance completion gate requirement |
| B-FIN-08 | Emit Payment360 page w/ allocation interface | 7 | done | critical | BUILD_CHANGELOG B-F008 | B-FIN-05 | |
| B-FIN-09 | Wire lazy imports + Route entries in `erp-app/src/App.tsx` | 7 | done | critical | BUILD_CHANGELOG B-F009 | B-FIN-07, B-FIN-08 | 2 lazy imports, 2 `<Route>` entries, APPEND-only |
| B-FIN-10 | Emit `finance_permission_matrix.md` | 7 | done | high | BUILD_CHANGELOG B-F010 | B-FIN-05 | RACI per endpoint + state-transition RACI |
| B-FIN-11 | Ledger updates (changelog + task board + FINAL_STATUS) | 7 | done | high | this entry | B-FIN-01..10 | completion bumped 8 → ~40 |

### Deferred to Tier 2 (still `in_progress`)

| ID | Task | Phase | Status | Priority | Depends | Notes |
|---|---|---|---|---|---|---|
| B-FIN-T2-01 | Receipts — Zod + API + page | 7 | in_progress | high | B-FIN-02 | Table exists (00051 ALTER) |
| B-FIN-T2-02 | Expenses — Zod + API + page | 7 | in_progress | high | B-FIN-02 | |
| B-FIN-T2-03 | GL transactions — Zod + API + page | 7 | in_progress | high | B-FIN-02 | |
| B-FIN-T2-04 | Bank files + bank matches — Zod + API + page | 7 | in_progress | high | B-FIN-02 | |
| B-FIN-T2-05 | Reconciliation exceptions — Zod + API + page | 7 | in_progress | high | B-FIN-02 | Table CREATE'd in 00051 |
| B-FIN-T2-06 | Collection cases + collection actions — Zod + API + page | 7 | in_progress | high | B-FIN-02 | |
| B-FIN-T2-07 | Dunning campaigns + dunning steps + reminder schedules — Zod + API + page | 7 | in_progress | high | B-FIN-02 | 3 tables CREATE'd in 00051 |
| B-FIN-T2-08 | Budget entries + cashflow entries + costing entries — Zod + API + page | 7 | in_progress | normal | B-FIN-02 | |
| B-FIN-T2-09 | FX rates admin — Zod already shipped (B-FIN-04); API + page | 7 | in_progress | normal | B-FIN-04 | |
| B-FIN-T2-10 | Consolidation entries + annual tax reports — Zod + API + page | 7 | in_progress | normal | B-FIN-02 | |
| B-FIN-T2-11 | Tax exports browser page (PCN836/874 archive) | 7 | in_progress | normal | B-FIN-05 | Export endpoint exists; UI pending |

## Docs Mega Batch (2026-04-18)

| id | title | phase | status | priority | build_layer | domain | api_needed | page_needed |
|---|---|---|---|---|---|---|---|---|
| B-DO001 | Migration 00055 — docs domain complete (ALTER 6 + CREATE 9 tables + RLS + audit) | 7 | done | P0 | L3 | docs | N | N |
| B-DO002 | Migration 00056 — docs menu wiring (11 entries) | 7 | done | P0 | L7 | docs | N | N |
| B-DO003 | Zod schemas — 15 docs models + _shared + barrel + package.json sub-path | 7 | done | P0 | L4 | docs | Y | Y |
| B-DO004 | API routes — 15 docs route files + _helpers + aggregator + business endpoints + mount | 7 | done | P0 | L5 | docs | Y | N |
| B-DO005 | React pages — 10 v2 pages + _shared + App.tsx wiring | 7 | done | P0 | L7 | docs | N | Y |
| B-DO006 | Docs permission matrix | 7 | done | P1 | L9 | docs | N | N |

## Intelligence Mega Batch (2026-04-18)

| id | title | phase | status | priority | build_layer | domain | api_needed | page_needed |
|---|---|---|---|---|---|---|---|---|
| B-IN001 | Migration 00057 — intelligence domain complete (ALTER 13 + CREATE 2 + RLS + CHECK lifecycles + audit triggers + seeds) | 7 | done | P0 | L3 | intelligence | N | N |
| B-IN002 | Migration 00058 — intelligence menu wiring (11 entries under "בינה מלאכותית") | 7 | done | P0 | L7 | intelligence | N | N |
| B-IN003 | Zod schemas — 15 intelligence models + _shared + barrel + package.json sub-path | 7 | done | P0 | L4 | intelligence | Y | Y |
| B-IN004 | API routes — 15 intelligence route files + _helpers + aggregator + business endpoints + mount at /api/intelligence/* (legacy flat files preserved) | 7 | done | P0 | L5 | intelligence | Y | N |
| B-IN005 | React pages — 9 intelligence pages + _shared + App.tsx wiring (9 lazy imports + 9 Routes) | 7 | done | P0 | L7 | intelligence | N | Y |
| B-IN006 | Intelligence permission matrix (3 roles × all endpoints) | 7 | done | P1 | L9 | intelligence | N | N |
