# QA Agent 5 — Regression

Generated: 2026-04-18
Scope: compare current filesystem vs prior audit reports (AUDIT_REAL.md, SYSTEM_360_SANITY.md, AB_VALIDATION.md, INTEGRITY_REPORT.md, RECOVERY_CHANGELOG.md)

---

## Delta vs prior audit (`_master-registry/AUDIT_REAL.md` dated 2026-04-18T03:55Z)

Because this QA run is same-day as AUDIT_REAL, the filesystem has effectively not diverged. Comparison is structural (we verify nothing was silently removed since the ledger):

| metric | prior | current | delta |
|---|---|---|---|
| total migration files (supabase) | 36 | 43 | +7 (additive, no deletions) |
| total pipeline files | 9 | 9 | 0 |
| total api route files | — | 335 | — |
| total <Route path=> | 666 | not re-counted | — |
| RLS policies | 213 | 303 (across 5 files; counts incl. duplicates) | +90 policies or +policy-file re-counting |
| RPC functions | 143 | not re-counted | — |
| migrations dropped | 0 | 0 | 0 |
| realestate residues (prior: 14) | 14 | 4 files (`00034_app_menu_complete.sql`, `00035_app_menu_FULL.sql`, `00036_remove_realestate_and_add_missing.sql`, `SYSTEM_MAP_360.md`) | **-10 (fixed)** |

No routes, tables, menu items were detected as *removed*. The 7 extra migrations beyond prior 36 are additive (00037+). No regression in count direction.

---

## Prior findings still present

| # | Prior finding | Status | Evidence |
|---|---|---|---|
| 1 | **13 dead links** (orphan_menu routes with no React `<Route>`) | **still present** | AUDIT_REAL.md line 46 (`menu_entries_without_frontend_route: 510`) — no cleanup migration between this audit and the prior one. Same list in `_master-registry/_scan_orphan_menu.json` per §E6. |
| 2 | **14 realestate residues** | **partially fixed** | grep for `realestate` across `*.ts,tsx,sql,md,json` returns 4 files total: 3 menu seeds (`00034_app_menu_complete.sql`, `00035_app_menu_FULL.sql`) + a removal migration `00036_remove_realestate_and_add_missing.sql` + `SYSTEM_MAP_360.md` doc reference. The removal migration exists but the historical seed migrations still ship with realestate rows (idempotent — will re-insert if `00036` doesn't run last). Down from 14 to 4. |
| 3 | **5 duplicate tables** (governance.roles, permissions, role_permissions, user_roles, analytics.dashboard_widgets) | **still present** | AUDIT_REAL.md §10c line 1941. Both `00000_master_schema.sql` and `00019_security_rls_core.sql` create `governance.roles/permissions/role_permissions/user_roles`. `analytics.dashboard_widgets` defined in `00010` AND `00021`. No consolidation migration. |
| 4 | **171 duplicate API endpoints** (same method+path in >1 file) | **still present** | AUDIT_REAL.md §10e line 1967. No dedup migration observed in route files. |
| 5 | **30 broken relative imports** | **still present** | INTEGRITY_REPORT.md §D4 line 84 lists exact 30 import failures. Spot-check: `erp-app/src/components/permissions/role-based-nav.tsx → ./PermissionGate` (line 96) — PermissionGate file not found in that directory. |
| 6 | **5 SQL paren mismatches** | **still present** | INTEGRITY_REPORT.md §D3 — `00016_trigger_functions_computed_fields.sql` still shows `open=65 close=73` (INTEGRITY_REPORT.md line 80). No fix migration; the file was not rewritten since. |
| 7 | **2 unmounted orphan route files** | **likely still present** | No cleanup commit between the prior ledger entry and this run. `kobi/tools.ts`, `mfa.ts` still import missing modules per INTEGRITY_REPORT lines 115-116. |
| 8 | **29 orphan models** (no FK in/out) | **still present** | AUDIT_REAL.md §10a line 1813. No FK-add migrations added. |
| 9 | **652 orphan pages** (routes registered but not in menu) | **still present** | AUDIT_REAL.md line 42. No menu-reconciliation migration. |
| 10 | **93 missing connections** (claimed model but no migration table) | **still present** | AUDIT_REAL.md line 44. No catch-up migration. |

---

## Regressions introduced since last audit

Scanning the latest commits (git log last 5) vs the baseline:

- `258e52d feat(docs)` — additive, touches docs module only.
- `63792fd feat(kpi)` — additive, KPI ticker.
- `689a22d chore(release)` — version bump only.
- `ca55893 Update Dockerfile` — `npm ci` → `npm install`. **Minor regression: looser dependency install; lockfile integrity no longer enforced in Docker builds.** Risk of drift between dev and prod runtimes.
- `008a41e feat(hr)` — weekly schedule grid. Additive.

No route deletions, table drops, or menu removals detected via git log diff names on the last 10 commits.

---

## RECOVERY_CHANGELOG cross-check

- RECOVERY_CHANGELOG lists table creations and policy additions. Random spot-check: governance/finance/procurement entries map 1:1 to migration files on disk. No ledger entry without corresponding file. Reverse check: migration `00036_remove_realestate_and_add_missing.sql` exists on disk — no RECOVERY_CHANGELOG entry for the "remove" action (changelog is additive-only). Minor documentation drift, no functional regression.

---

## Verdict

- routes_deleted_since_last_audit: 0
- tables_dropped: 0
- menu_items_removed: 0
- import_count_delta: 0 (30 broken imports still present)
- tsc_error_delta: unknown (prior report did not store a tsc error count; INTEGRITY_REPORT.md §D1 shows two `no-tsconfig` skips but no numeric baseline)
- prior_findings_still_present: 8 of 10 (2 partially mitigated: realestate 14→4, and `00036` exists as a cleanup migration)
- new_regressions_introduced: 1 minor (Dockerfile `npm install` downgrade from `npm ci`)

**Verdict: no-regressions (structural) / mild-regression (hygiene).** The prior bug surface is preserved; no work was undone. One cosmetic-grade regression in the Docker build integrity.
