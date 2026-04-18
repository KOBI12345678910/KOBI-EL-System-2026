# BUILD MASTER LEDGER — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Mode | BUILD (forward-building, 15 phases, 10 layers) |
| Complement to | `RECOVERY_MASTER_LEDGER.md` (backward-looking recovery) |
| Scope | `C:/Users/kobi/Projects/techno-kol-uzi-2026` |
| Directive | ULTRA ENTERPRISE SYSTEM COMPLETION |
| Read-only | api-server/, erp-app/, supabase/migrations/, registries (*.json) |
| Current phase | Phase 1 (baseline lock for build mode) |

---

## 1. Relationship to RECOVERY_*

This ledger **does not duplicate** RECOVERY. It cross-references:

| RECOVERY file | Role in BUILD |
|---|---|
| `RECOVERY_MASTER_LEDGER.md` | Baseline of discovered state (237 tables, 342 registry models, 1262 React routes, 1289 menu rows) |
| `RECOVERY_TASK_BOARD.md` | Source of T001–T368 (368 tasks) — mirrored into `BUILD_TASK_BOARD.md` with 6 new columns |
| `RECOVERY_DECISION_LOG.md` | Source of D001–D050 — imported verbatim into `BUILD_DECISION_LOG.md`; new BUILD decisions appended as `B-D001+` |
| `RECOVERY_EVIDENCE_MAP.md` | Source of E001–E368 — cross-referenced by `BUILD_EVIDENCE_MAP.md`; new BUILD evidence appended as `B-E001+` |
| `RECOVERY_CHANGELOG.md` | C001–C014 recovery entries (historical). `BUILD_CHANGELOG.md` starts a new forward-looking stream (B-C001+) |
| `RECOVERY_FINAL_STATUS.json` | Baseline machine state — imported as `baseline` block of `BUILD_FINAL_STATUS.json` |
| `CANONICAL_DOMAIN_VERIFICATION.md` | Source of 181 canonical entities enumeration used by `MODEL_COVERAGE_MATRIX.md` |
| `PHASE_1B_VERIFICATION_SUMMARY.md` | Source of 30 approved standards / 35 forgotten models / 130 menu re-categorizations |
| `AUDIT_REAL.md`, `DISCOVERY_RECOVERY_MAP.md`, `INVISIBLE_MENU_ITEMS.md`, `SYSTEM_360_SANITY.md`, `CONNECTIVITY_VALIDATION.md`, `INTEGRITY_REPORT.md`, `MISSING_MODELS_SCAN.md`, `VAT_18_UPDATE.md`, `MERGE_REPORT.md`, `FINAL_MERGE_REPORT.md`, `AB_VALIDATION.md` | Used as evidence sources for per-domain DISCOVERY sections |

---

## 2. 15-Phase Tracker

| # | Phase | Status | Deliverables / Focus |
|---|---|---|---|
| 1 | **Ultra-Enterprise Baseline Lock** | in_progress (this document) | 10 control files + 13 domain checklists + summary |
| 2 | Canonical Schema Resolution | pending | Fix 12 wrong-schema pointers; align registry domains with migration schemas (D003/D009) |
| 3 | Registry Reconciliation | pending | Close 105-model delta (registry 342 ↔ DB 237) |
| 4 | RLS & Permissions Audit | pending | Resolve 213↔302 RLS drift; per-table permission decision (D020) |
| 5 | Duplicate Elimination | pending | 5 duplicate tables + 285 endpoint duplicates + 32 menu + 15 routes (App.tsx) |
| 6 | Orphan Table Decision | pending | Wire-or-drop 29 primary + 119 extended orphans (D004) |
| 7 | Truly-Missing Build-Out | pending | 75 net-new tables full stack (D012) |
| 8 | Menu/Route/Page Reconciliation | pending | 458 menu-no-route + 496 route-no-menu + 535 pages-no-route + 779 invisible menu items |
| 9 | Broken Import/Page Repair | pending | 4 runtime-breaking + 30 broken imports + 5 SQL paren bugs + 13 dead links + 43 orphan pages |
| 10 | Dashboard & Report Rewiring | pending | 10 dashboards + 17 reports → real tables (D015) |
| 11 | **Supabase Deployment + GitHub Commit Gate** | pending | Per-table supabase verify + per-layer commit (D049/D050) |
| 12 | Pipeline/Entity Alignment | pending | entity-map.js, wiring-spec.js; dead RPC confirm (D014) |
| 13 | Final Integrity Audit | pending | Re-emit AUDIT_REAL, INTEGRITY_REPORT, CONNECTIVITY_VALIDATION — all counts zero for broken |
| 14 | Business Readiness QA | pending | 13 domain gates (completion % ≥ target); end-to-end 5 flows |
| 15 | Enterprise Lock & Release | pending | v2.0.0 tag; immutable `FINAL_STATE.json`; handoff |

---

## 3. 10-Layer Architecture

| # | Layer | Owner artifact |
|---|---|---|
| L1 | Vision / Governance | `wiring-spec.js`, `orchestration-flows`, 9 master 360 pages (CLAUDE.md) |
| L2 | Domain Architecture | 13 domains (`domains/*.md`), `enterprise_domain_map.json` |
| L3 | Model Architecture | `models_registry.json`, `pipeline/entity-map.js`, `MODEL_COVERAGE_MATRIX.md` |
| L4 | Field / Schema | `fields_registry.json` (3420 fields), Zod schemas (419 files), `TABLE_DEPLOYMENT_MATRIX.md` |
| L5 | Relationship | `relationships_registry.json` (96), wiring-spec `entity_relationships` (20), pipeline strings (190) |
| L6 | Process / Flow | `workflow-flows.js` (5), `state-machines.js` (13, 91 transitions), `orchestrator.js` (18 actions) |
| L7 | Application / Page | `App.tsx` (1262 routes), `pages_registry.json` (402), 1166 page files, `MENU_ROUTE_COVERAGE_MATRIX.md` |
| L8 | Analytics / Decision | `reports_registry.json` (20), `dashboards_registry.json` (10), read models `analytics.rm_*` |
| L9 | Security / Permissions | `permissions_registry.json`, `roles_registry.json` (18 roles), RLS policies (213–302) |
| L10 | Integrity / Runtime / Delivery | `INTEGRITY_REPORT.md`, supabase migrations (43), CI/CD, Dockerfile, deployment manifests |

---

## 4. Phase 1 Section (this phase — active)

### 4.1 Inputs consumed
- RECOVERY ledger (6 files)
- PHASE_1B_VERIFICATION_SUMMARY + CANONICAL_DOMAIN_VERIFICATION
- `RECOVERY_FINAL_STATUS.json` baseline block
- Filesystem re-scan: 43 migrations, `_master-registry/` directory listing

### 4.2 Deliverables (24 new files)
**Control files (10):**
1. `BUILD_MASTER_LEDGER.md` (this file)
2. `BUILD_TASK_BOARD.md`
3. `BUILD_DECISION_LOG.md`
4. `BUILD_EVIDENCE_MAP.md`
5. `BUILD_CHANGELOG.md`
6. `BUILD_FINAL_STATUS.json`
7. `MODEL_COVERAGE_MATRIX.md`
8. `MENU_ROUTE_COVERAGE_MATRIX.md`
9. `TABLE_DEPLOYMENT_MATRIX.md`
10. `LAYER_10_ARCHITECTURE_MAP.md`

**Domain checklists (13):** `domains/commercial.md`, `execution.md`, `procurement.md`, `inventory.md`, `finance.md`, `workforce.md`, `docs.md`, `intelligence.md`, `governance.md`, `analytics.md`, `orchestration.md`, `comms.md`, `support_schemas.md`

**Summary (1):** `PHASE_1_ENTERPRISE_SUMMARY.md`

### 4.3 Phase 1 DoD
- [x] 24 new files created
- [x] MODEL_COVERAGE_MATRIX ≥ 237 rows
- [x] All 13 domains have completion %
- [x] LAYER_10_ARCHITECTURE_MAP has one section per layer with counts
- [x] BUILD_FINAL_STATUS.json parses as JSON with phase_tracker / layer_completion / domain_completion
- [x] No duplicates vs RECOVERY (cross-references)
- [x] No code changes

### 4.4 Next phase gate
Phase 2 starts after Phase 1 summary signs off. Blockers: `none`.

---

## 5. Placeholders for Phases 2–15

Each phase gets its own section below when activated. Format:

```
### Phase N — <title>
- started: YYYY-MM-DD
- completed: YYYY-MM-DD
- inputs: <files>
- deliverables: <list>
- evidence: <B-E ids>
- decisions: <B-D ids>
- tasks: <B ids>
- exit_gate_met: Y/N
```

Phases 2–15 are currently `pending` — no section populated.
