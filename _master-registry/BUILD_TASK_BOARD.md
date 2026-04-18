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

