# LAYER-10 ARCHITECTURE MAP — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Layers | L1 Vision/Governance · L2 Domain · L3 Model · L4 Field/Schema · L5 Relationship · L6 Process/Flow · L7 Application/Page · L8 Analytics/Decision · L9 Security/Permissions · L10 Integrity/Runtime/Delivery |
| Evidence defaults | `B-E013` baseline, `B-E014` migrations, `B-E015` canonical verification, `B-E018` unresolved queues, `B-E019` SUMMARY v2, `B-E022` CLAUDE.md |

Each section below: **what exists** (counts + samples) / **what's missing** / **what's broken** / **completion %**.

---

## L1 — Vision / Governance

### What exists
| Item | Count / sample |
|---|---|
| Master 360 page spec (CLAUDE.md) | 9 priority pages declared (Customer360, Supplier360, Quote360, RFQ360, Project360, WorkOrder360, PO360, Finance360, Employee360) + 4 added by P1b = 13 |
| Wiring-spec | `onyx-procurement/src/pipeline/wiring-spec.js` — 19 route groups, 55 action→API mappings, 7 cross-service contracts |
| Pipeline engine | `pipeline-engine.js` — 13 Master Flow stages |
| Orchestrator | `orchestrator.js` — 18 executable actions |
| Governance docs | AUDIT_REAL, INTEGRITY_REPORT, SYSTEM_MAP_360, COMPLIANCE_CHECKLIST, SECURITY_MODEL, USER_GUIDE_HE |
| 4 services | TECHNO_KOL_OPS (3200), ONYX_PROCUREMENT (3100), PAYROLL_AUTONOMOUS (5173 /payroll), ONYX_AI (3300 /ai) |

### What's missing
- 8 of 13 required 360 pages (WorkOrder360, PO360, Invoice360, Material360, Payment360, Contract360, Task360, Alert360)
- End-to-end wiring of the Lead→Cash flow across the 4 services (partial)
- Vision doc for Phase 15 lock (immutable `FINAL_STATE.json`)

### What's broken
- `INTEGRITY_REPORT.md` reports TypeScript clean but 4 runtime-breaking pages remain
- `wiring-spec.js` lists 20 entity relationships; `entity-map.js` implies 190 — misalignment flagged by `CONNECTIVITY_VALIDATION.md`

### Completion
**60%** (5/13 360 pages present + governance docs + services wired)

---

## L2 — Domain Architecture

### What exists
| Item | Count / sample |
|---|---|
| Canonical domains declared | 12 (commercial, execution, procurement, inventory, finance, workforce, docs, comms, analytics, intelligence, orchestration, governance) |
| 13th bucket (support) | public, pricing, planning, quality, routing, compliance, maintenance, service, treasury, crm_legacy |
| Domain map file | `enterprise_domain_map.json` (part of registry v2) |
| Domain checklists | 13 files under `_master-registry/domains/*.md` (created by this phase) |
| Canonical entities enumerated | 181 (P1b) |

### What's missing
- 6 of 12 canonical domains are < 40% complete per `domain_completion` in `BUILD_FINAL_STATUS.json`
- Support-schema bucket (10 schemas) has no domain owner assigned

### What's broken
- 3 domain-naming conflicts pending D003 ratification (crm vs commercial, sales vs procurement-commercial, hr_workforce vs workforce)
- 12 wrong-schema pointers in registry (D009)

### Completion
**55%** (13 domain files created; 6/12 canonical domains < 40% complete)

---

## L3 — Model Architecture

### What exists
| Item | Count |
|---|--:|
| DB tables (`_all_tables.txt`) | 237 |
| Registry models (`models_registry.json`) | 342 |
| Pipeline entities (`entity-map.js`) | 16 |
| Zod schema files | 419 |
| MODEL_COVERAGE_MATRIX rows | 237 (Block A) + 16 (Block B) + 105 (Block C buckets) |
| `complete` status | 10 |
| `partial` status | 57 |
| `hidden` status | 156 |
| `broken` status | 11 |

### What's missing
- 75 truly-missing models flagged (MISSING_MODELS_SCAN.md) awaiting D012
- 35 forgotten models discovered in P1b (T326–T360)
- 30 hidden-existing-models (DB table present, no registry entry, no menu, no UI)

### What's broken
- 105-model registry↔DB delta
- 17 duplicate-model risks
- 29 orphan tables + 119 extended orphans
- 5 duplicate CREATE TABLE statements (D011)

### Completion
**58%** (237/342 targets have DB table; complete % per strict gate is 4.2%)

---

## L4 — Field / Schema

### What exists
| Item | Count |
|---|--:|
| Fields (registry v2, 10 per model × 342) | 3420 |
| CREATE TABLE statements | 235 (two tables reuse statements) |
| Zod schema files | 419 |
| Migrations on disk | 43 |
| Mandatory-column standard | D036 approved |
| Index strategy | D039 approved |
| Enum & lookup rules | D041 approved |

### What's missing
- Mandatory-column audit per-table not run (each table must be checked for id, created_at, updated_at, created_by, updated_by, org_id per D036)
- `category_name_he` label fill-in (Hebrew) incomplete on many orphan tables
- Field registry is registry-wide; not yet cross-checked with actual migration DDL

### What's broken
- 5 SQL paren-mismatch bugs flagged by CONNECTIVITY_VALIDATION
- Some tables miss canonical business columns per D037

### Completion
**62%** (mandatory columns likely present on canonical tables; unverified on 108 orphan tables)

---

## L5 — Relationship

### What exists
| Item | Count |
|---|--:|
| Foreign keys in DB | 385 |
| Registry relationships (`relationships_registry.json`) | 96 |
| Wiring-spec entity relationships | 20 |
| Pipeline entity-map relationship strings | 190 |
| Cross-service contracts | 7 |

### What's missing
- Reconciliation of 3 relationship sources (registry 96, wiring-spec 20, pipeline 190) into a single graph
- Foreign-key audit per table for the 29 primary orphans

### What's broken
- 3 pipeline-entity misalignments flagged by CONNECTIVITY_VALIDATION

### Completion
**65%** (FKs present at DB level; higher-level aggregation ambiguous)

---

## L6 — Process / Flow

### What exists
| Item | Count |
|---|--:|
| Workflow flows (`workflow-flows.js`) | 5 (Sales→Project, Project→Procurement, Procurement→Execution, Execution→Cash, Employee→Payroll) |
| State machines (`state-machines.js`) | 13 (min) — 15 max per audit drift |
| State transitions | 91 (min) — 115 (max) |
| Orchestrator actions (`orchestrator.js`) | 18 with preconditions/effects/events/listeners |
| Page contracts | 9 |
| Action→API mappings | 55 |
| Master Flow stages (`pipeline-engine.js`) | 13 |

### What's missing
- 8 flows tracked by SUMMARY v2 suggests 3 additional cross-domain flows beyond the 5 core — missing definitions
- Event triggers not all wired (per CONNECTIVITY_VALIDATION)

### What's broken
- Pipeline drift (3 misalignments)
- 127 dead-RPC candidates pending D014 confirmation

### Completion
**50%** (core flows declared, end-to-end wiring partial, dead RPC risk)

---

## L7 — Application / Page

### What exists
| Item | Count |
|---|--:|
| React Routes declared (`App.tsx`) | 1262 |
| Routes with elements | 629 |
| Unique route paths | 666 |
| Page files on filesystem | 1166 |
| Page files audit-scope | 658 |
| Menu insert rows | 1289 |
| Registered pages (`pages_registry.json`) | 402 |
| Menu seed migrations | 7 |
| P1b menu recategorizations | 130 |

### What's missing
- 458 menu-no-route
- 496 route-no-menu
- 535 pages-no-route
- 779 invisible menu items
- 455 invisible pages

### What's broken
- 4 runtime-breaking pages
- 30 broken imports
- 13 dead links
- 43 orphan pages
- 15 duplicate App.tsx routes
- 32 duplicate menu rows

### Completion
**42%** (routing present at scale but coverage gaps dominate)

---

## L8 — Analytics / Decision

### What exists
| Item | Count |
|---|--:|
| Reports | 20 |
| Dashboards | 10 |
| Read models (`analytics.rm_*`) | 6 (ai/executive/finance/operations/procurement/workforce summary) |
| KPI snapshots / dashboard_boards | 4 tables present |
| AI insights table | 1 (intelligence.ai_insights) |

### What's missing
- Business-readiness KPIs per domain (14 — per P1b invisible_reports)
- Analytics menu coverage — 0 items (P1b report)

### What's broken
- 10 broken dashboards
- 17 broken reports (wired to non-existent tables or outdated RPCs)

### Completion
**35%** (read models present; dashboards widely broken; menu exposure = 0)

---

## L9 — Security / Permissions

### What exists
| Item | Count |
|---|--:|
| Roles (`roles_registry.json`) | 18 |
| Permissions model (D029) | 17×9 matrix declared |
| RLS helper migrations | 00001, 00004, 00005, 00019 |
| RLS policies (drift) | 213–302 |
| Object permissions table | governance.object_permissions |
| Permission RPC | `get_my_permissions` (00020) |

### What's missing
- Per-table permission row in 17×9 matrix — 218 of 237 tables not decided (`permission_decided = N`)
- Per-table RLS decision — 221 of 237 tables not decided (`rls_decision = N`)

### What's broken
- 89-policy drift between 213 and 302 (RECOVERY drift range)
- Duplicate roles/permissions/role_permissions/user_roles CREATE TABLE (D011)

### Completion
**45%** (framework present; per-table coverage sparse)

---

## L10 — Integrity / Runtime / Delivery

### What exists
| Item | Count |
|---|--:|
| Integrity report | PASS (SUMMARY v2, INTEGRITY_REPORT.md) |
| Migrations on disk | 43 |
| RPCs | 143 |
| Views | 15 |
| API route files | 328 |
| API endpoints (unique) | 5313 |
| Automations | 12 |
| Crons | 5 |
| Lifecycles | 7 |
| Dockerfile / k8s / compose | present (Dockerfile, k8s/, docker-compose.*.yml) |
| Deployment runbooks | DEPLOY.md, DEPLOY-PRODUCTION.md, DEPLOYMENT-RUNBOOK.md, DEPLOYMENT-RUNBOOK-VERCEL.md |

### What's missing
- Live Supabase deployment-verify gate (Phase 11 has not run)
- Per-layer GitHub commit tags (0 of 10 applied — per `BUILD_FINAL_STATUS.github_counts`)
- Immutable `FINAL_STATE.json` (Phase 15)
- Final re-emission of AUDIT_REAL / INTEGRITY_REPORT / CONNECTIVITY_VALIDATION with zero broken (Phase 13)

### What's broken
- 30 broken imports (code-level)
- 285 duplicate endpoint definitions
- 171 duplicate API handlers
- 5 SQL paren-mismatch bugs
- 127 dead-RPC candidates

### Completion
**55%** (shipping skeleton present; verification gates unexecuted)

---

## Summary table — layer completion %

| Layer | Completion % | Blocking phase |
|---|--:|---|
| L1 Vision | 60 | P14 |
| L2 Domain | 55 | P2–P7 |
| L3 Model | 58 | P3, P6, P7 |
| L4 Field/Schema | 62 | P4, P7 |
| L5 Relationship | 65 | P5, P12 |
| L6 Process/Flow | 50 | P9, P12 |
| L7 Application/Page | 42 | P8, P9 |
| L8 Analytics | 35 | P10 |
| L9 Security | 45 | P4 |
| L10 Integrity/Delivery | 55 | P11, P13, P15 |
| **Average (unweighted)** | **52.7%** | — |
