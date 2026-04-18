# BUILD EVIDENCE MAP — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| E001–E368 source | `RECOVERY_EVIDENCE_MAP.md` (imported by reference, not duplicated) |
| B-E001+ | New BUILD-phase evidence collected during Phase 1 creation |

---

## 1. RECOVERY evidence (E001–E368) — cross-reference

Each `E<n>` entry retains its original file, line ref, and date. Authoritative text: `RECOVERY_EVIDENCE_MAP.md`. Usage in BUILD:

| Evidence block | Range | Used by BUILD artifact |
|---|---|---|
| Baseline counts | E001–E020 | `MODEL_COVERAGE_MATRIX`, `LAYER_10_ARCHITECTURE_MAP`, `BUILD_FINAL_STATUS.baseline` |
| Schema / domain conflicts | E021–E060 | `domains/commercial.md`, `execution.md`, `procurement.md`, `finance.md` |
| Orphan / hidden tables | E061–E120 | `TABLE_DEPLOYMENT_MATRIX`, `domains/*` (GAPS) |
| Registry delta | E121–E180 | `MODEL_COVERAGE_MATRIX` (missing-db block) |
| Menu / route coverage | E181–E240 | `MENU_ROUTE_COVERAGE_MATRIX` |
| Broken imports / pages | E241–E290 | `LAYER_10_ARCHITECTURE_MAP.L7` |
| Permissions / RLS | E291–E320 | `LAYER_10_ARCHITECTURE_MAP.L9` |
| Dashboards / reports | E321–E340 | `LAYER_10_ARCHITECTURE_MAP.L8` |
| Pipeline / entity-map | E341–E368 | `LAYER_10_ARCHITECTURE_MAP.L6`, `domains/intelligence.md` |

**Count**: 368 entries cross-referenced. None duplicated here.

---

## 2. New BUILD evidence (B-E001+)

Evidence collected during Phase 1 file creation. Each row cites the artifact or filesystem location used.

| ID | Source | Artifact | Claim supported | Date |
|---|---|---|---|---|
| B-E001 | `_master-registry/BUILD_MASTER_LEDGER.md` | self | BUILD ledger created, 15 phases + 10 layers declared | 2026-04-18 |
| B-E002 | `_master-registry/BUILD_TASK_BOARD.md` | self | 368 mirrored + 17 new tasks declared | 2026-04-18 |
| B-E003 | `_master-registry/BUILD_DECISION_LOG.md` | self | 50 imported + 15 new decisions | 2026-04-18 |
| B-E004 | `_master-registry/BUILD_EVIDENCE_MAP.md` | self | Evidence cross-reference completed | 2026-04-18 |
| B-E005 | `_master-registry/BUILD_CHANGELOG.md` | self | B-C001–B-C012 Phase 1 entries created | 2026-04-18 |
| B-E006 | `_master-registry/BUILD_FINAL_STATUS.json` | self | JSON with phase_tracker + layer_completion + domain_completion emitted | 2026-04-18 |
| B-E007 | `_master-registry/MODEL_COVERAGE_MATRIX.md` | self | ≥ 237 rows covering all migration tables | 2026-04-18 |
| B-E008 | `_master-registry/MENU_ROUTE_COVERAGE_MATRIX.md` | self | Summary + sample rows; full listing deferred to P8 per B-D011 | 2026-04-18 |
| B-E009 | `_master-registry/TABLE_DEPLOYMENT_MATRIX.md` | self | 237 rows declared with `deployed_to_supabase=pending` | 2026-04-18 |
| B-E010 | `_master-registry/LAYER_10_ARCHITECTURE_MAP.md` | self | 10 layer sections emitted with counts | 2026-04-18 |
| B-E011 | `_master-registry/domains/*.md` | folder listing | 13 domain checklist files created | 2026-04-18 |
| B-E012 | `_master-registry/PHASE_1_ENTERPRISE_SUMMARY.md` | self | Phase 1 summary published | 2026-04-18 |
| B-E013 | `_master-registry/RECOVERY_FINAL_STATUS.json` lines 7–50 | file | Baseline counts imported: 237 tables, 342 registry, 1262 routes, 1289 menu rows, 1166 page files, 419 Zod schemas, 20 reports, 10 dashboards, 18 roles, 43 migrations (42 in RECOVERY + 00041 + 00042 existing) | 2026-04-18 |
| B-E014 | `supabase/migrations/` directory listing | filesystem | 43 migration files present (00000–00042 — from filesystem ls) | 2026-04-18 |
| B-E015 | `_master-registry/CANONICAL_DOMAIN_VERIFICATION.md` section 1.1–1.5 | file | Canonical entities per 5 domains enumerated with db/registry/menu status | 2026-04-18 |
| B-E016 | `_master-registry/PHASE_1B_VERIFICATION_SUMMARY.md` section 2 | file | 35 forgotten models listed (T326–T360) | 2026-04-18 |
| B-E017 | `_master-registry/PHASE_1B_VERIFICATION_SUMMARY.md` section 4 | file | 5 of 13 360-pages present (Customer, Supplier, Quote, Project, Employee); 8 missing | 2026-04-18 |
| B-E018 | `_master-registry/RECOVERY_FINAL_STATUS.json` `unresolved_queues` | file | Unresolved queue totals (hidden 30, orphans 29+119, truly_missing 75, invisible_menu 779, invisible_pages 455, invisible_engines 223, duplicate endpoints 285…) | 2026-04-18 |
| B-E019 | `_master-registry/SUMMARY.txt` | file | Registry v2 declares 342 models, 96 relationships, 402 pages, 8 flows, 236 orphans; `INTEGRITY=PASS` | 2026-04-18 |
| B-E020 | `_master-registry/PHASE_1B_VERIFICATION_SUMMARY.md` section 3 | file | 181 canonical entities enumerated; 11 full / 170 partial / 0 absent | 2026-04-18 |
| B-E021 | User directive Phase 1 | directive | 13 domains × expected_models verbatim (commercial 18, execution 29, procurement 18, inventory 18, finance 24, workforce 13, docs 15, intelligence 15, governance 32) | 2026-04-18 |
| B-E022 | `CLAUDE.md` | file | 9 master 360 pages + 4 services + 13 Master Flow stages + 16 pipeline entities + 13 state machines + 91 transitions + 5 workflow flows + 18 orchestrator actions | 2026-04-18 |
| B-E023 | `_master-registry/RECOVERY_TASK_BOARD.md` header | file | Task board = 325-row (headline) / 368 individual tasks (per FINAL_STATUS); entries T001–T368 | 2026-04-18 |
| B-E024 | `_master-registry/RECOVERY_DECISION_LOG.md` | file | 50 decisions D001–D050 | 2026-04-18 |
| B-E025 | `_master-registry/RECOVERY_CHANGELOG.md` | file | 14 changelog entries C001–C014 | 2026-04-18 |

**New evidence count (B-E)**: 25 entries. Cumulative tracked evidence: 368 + 25 = **393**.

---

## 3. Evidence retention rules

- Every row in the 3 matrix files (MODEL_COVERAGE, MENU_ROUTE_COVERAGE, TABLE_DEPLOYMENT) cites ≥ 1 evidence ID.
- Every claim in a domain checklist `DISCOVERY` section cites ≥ 1 evidence ID.
- When running Phase 11 deployment checks, append new `B-E026+` rows keyed to `mcp__supabase__list_tables` output timestamps.
