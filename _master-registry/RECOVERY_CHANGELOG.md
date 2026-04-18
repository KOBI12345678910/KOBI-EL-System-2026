# RECOVERY CHANGELOG

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Scope | Every file modification performed as part of the multi-phase recovery. Phase 1 records only the creation of the 6 ledger files themselves. |
| Format | `id | date | task_id | file_changed | what_changed | why | risk | validation_performed | validation_result` |

---

## Phase 1 — Ledger initialization (C001–C006)

| id | date | task_id | file_changed | what_changed | why | risk | validation_performed | validation_result |
|---|---|---|---|---|---|---|---|---|
| C001 | 2026-04-18 | phase-1-init | `_master-registry/RECOVERY_MASTER_LEDGER.md` | Created system-of-record ledger with header, baseline counts, findings imported from 5 primary + 3 secondary reports, unresolved queues (25 queues populated), Phase 1–12 tracker | Phase 1 DoD — establish single source-of-truth for recovery state | low | File presence check; internal cross-references validated (E-ids, T-ids, D-ids all resolved within the 6 ledgers) | pass |
| C002 | 2026-04-18 | phase-1-init | `_master-registry/RECOVERY_TASK_BOARD.md` | Created task board with 325 tasks distilled from all audit findings, each with phase (1–12), status=todo, priority, evidence_refs, blocker, assigned_to | Phase 1 DoD — enumerate every action, no summarization | low | Phase counts reconciled; all evidence refs exist in Evidence Map | pass |
| C003 | 2026-04-18 | phase-1-init | `_master-registry/RECOVERY_DECISION_LOG.md` | Created decision log with 20 foundational architectural decisions (canonical schema, orphan ghost policy, source-of-truth rule, duplicate-zero-tolerance, menu discipline, etc.) | Phase 1 DoD — at least 15 decisions required; delivered 20 | low | All D-ids referenced from Task Board resolve to entries here | pass |
| C004 | 2026-04-18 | phase-1-init | `_master-registry/RECOVERY_EVIDENCE_MAP.md` | Created evidence map with 325 entries (core counts, hidden models, orphan tables x119, missing models x75, dead links x13, miscategorizations x6, RLS/import/SQL/pipeline drift, plus 21 invisible-model samples) | Phase 1 DoD — every claim must cite file:line | low | All E-ids referenced from Task Board / Master Ledger / Decision Log resolve to entries here | pass |
| C005 | 2026-04-18 | phase-1-init | `_master-registry/RECOVERY_CHANGELOG.md` | Created this changelog, initialized with C001–C006 for Phase 1 ledger-creation entries | Phase 1 DoD — changelog required, empty for future phases | low | Self-consistency | pass |
| C006 | 2026-04-18 | phase-1-init | `_master-registry/RECOVERY_FINAL_STATUS.json` | Created machine-readable status snapshot with baseline counts, findings_imported grouped by source, unresolved_queues counts, phase_tracker (1=in_progress→complete, 2–12=pending) | Phase 1 DoD — JSON status file required | low | JSON validates; counts match Master Ledger §1 and §3 | pass |

---

## Phase 2+ (empty, pending execution)

No entries. Phases 2–12 will append here as migrations / code edits / registry changes are performed.

---

## Rules for future entries

1. Every change = one row. Grouped changes may share a task_id but must have distinct file_changed.
2. `risk` = estimated blast radius (low = single file utility; medium = cross-service; high = schema / RLS / migration).
3. `validation_performed` must be a concrete action (`tsc --noEmit`, `npm test`, `pg_dump + diff`, integration run, manual page check). Not "looks good".
4. `validation_result` = `pass` / `fail` / `deferred`. A `fail` requires either rollback or a follow-up change row.
5. All entries must reference an existing task_id from RECOVERY_TASK_BOARD.md.

---

## phase_1_done

Changelog initialized with 6 entries covering Phase 1 ledger creation. Ready to receive Phase 2 entries on next execution.

---

## Phase 1b — Spec verification + gap discovery (C007–C012)

| id | date | task_id | file_changed | what_changed | why | risk | validation_performed | validation_result |
|---|---|---|---|---|---|---|---|---|
| C007 | 2026-04-18 | phase-1b-spec-verify | `_master-registry/RECOVERY_DECISION_LOG.md` | Added spec-item → D-id index table (30 items) + D021–D050 decision entries (canonical_domain_map, business_capability_map, 360 pages, menu_taxonomy, form/field/api/workflow/permission/RLS/build standards, DoD, QA matrix, table build + columns + lifecycle + index + unique + enum + audit + security + api + ui + form + analytics + workflow + supabase + github standards) | Phase 1b DoD — capture every spec item in the ledger with status `approved-by-user` | low | D021–D050 all resolve in-file; index table reconciled | pass |
| C008 | 2026-04-18 | phase-1b-domain-verify | `_master-registry/CANONICAL_DOMAIN_VERIFICATION.md` (new) | Created domain × core_entities verification: 181 entities enumerated across 11 domains; 11 full, 170 partial, 0 absent. 13 360 pages verified: 5 present, 8 missing. Forgotten-model discovery enumerates 35 new entries. Menu taxonomy delta table included. | Phase 1b task B, C, D, E | low | Each row cites grep / file search; 237 DB tables confirmed from `supabase/migrations/*.sql` | pass |
| C009 | 2026-04-18 | phase-1b-menu-recategorize | `supabase/migrations/00041_menu_categorize_by_business_topic.sql` (new) | Created idempotent recategorization migration: UPDATEs `parent_id` on ~130 existing `public.app_menu` rows to align with canonical taxonomy (categories 2–15). No INSERT, no DELETE. Guarded with `do $$ if not exists (...) return end $$`. Sanity notice at end. | Phase 1b task F — menu taxonomy alignment without data loss | medium | Migration parses clean syntactically; guards prevent destructive edits; categories 1–15 already seeded by 00017/00036/00040 | deferred (apply in Phase 8) |
| C010 | 2026-04-18 | phase-1b-task-board | `_master-registry/RECOVERY_TASK_BOARD.md` | Appended 43 new tasks T326–T368 for forgotten model registration (T326–T360) + 8 missing 360 pages (T361–T368); added phase marker: Phase 1 → done, Phase 1b → done, Phase 2 → ready | Phase 1b task G.2 | low | Task IDs unique; evidence refs resolve to E326–E368 | pass |
| C011 | 2026-04-18 | phase-1b-evidence | `_master-registry/RECOVERY_EVIDENCE_MAP.md` | Appended E326–E368 evidence entries for forgotten models and missing 360 pages with file:line / grep references | Phase 1b task G.4 | low | Every E-id in T326–T368 resolves here | pass |
| C012 | 2026-04-18 | phase-1b-status | `_master-registry/RECOVERY_FINAL_STATUS.json` | Updated: phase_1 = done, phase_1b = done, phase_2 = ready, tasks_created = 368, evidence_entries = 368, decisions_logged = 50, spec_completeness = 1.0 | Phase 1b task G.6 | low | JSON validates | pass |
| C013 | 2026-04-18 | phase-1b-summary | `_master-registry/PHASE_1B_VERIFICATION_SUMMARY.md` (new) | Created summary doc with spec coverage, forgotten-model count, 360 page coverage, menu recategorization count, top 30 gaps, spec_completeness, next phase readiness | Phase 1b task H | low | Numbers reconciled with CANONICAL_DOMAIN_VERIFICATION.md and RECOVERY_FINAL_STATUS.json | pass |
| C014 | 2026-04-18 | phase-1b-ledger-update | `_master-registry/RECOVERY_MASTER_LEDGER.md` | Added §5 Phase 1b verification section summarizing spec coverage, 360 gaps, forgotten models, menu recategorization | Phase 1b task G.1 | low | Cross-references to companion ledgers resolved | pass |

---

## phase_1b_done

8 entries logged (C007–C014) covering Phase 1b verification. Ready for Phase 2 execution.
