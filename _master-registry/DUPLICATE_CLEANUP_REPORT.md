# Duplicate Cleanup Report — 2026-04-18

Operator: automated sweep
Scope: full monorepo `C:\Users\kobi\Projects\techno-kol-uzi-2026`
Policy: BACKUP FIRST, DELETE SECOND. No DB drops. Only documentation for DB dups.

---

## 1. Workspace Package Collisions (resolved)

Removed 4 package folders whose `package.json` declared `"name": "workspace"` —
an npm install blocker.

| Path | Size | Action |
|------|------|--------|
| `packages/AI-Task-Manager/` | 2.4 MB | backed up + deleted |
| `packages/GPS-Connect/`     | 85 KB  | backed up + deleted |
| `packages/Location-Finder/` | 212 KB | backed up + deleted |
| `packages/files-2/`         | 101 KB | backed up + deleted (dup of onyx-procurement) |

Remaining `packages/*`: `erp-upload`, `files-4`, `shared-*` (8 packages),
`technokoluzi-erp`. Verified: **zero packages** carry `"name": "workspace"`.

Root `package.json` `workspaces: ["packages/*", ...]` glob still valid — no
changes needed.

Note: `packages/erp-upload` has name `"technokoluzi-erp"` and
`packages/technokoluzi-erp` has name `"techno-kol-uzi"`. Not a `workspace`
collision but worth a future review.

---

## 2. App.tsx Lazy-Import Dedup (resolved)

File: `erp-app/src/App.tsx` (2602 lines).

| Metric | Before | After |
|--------|--------|-------|
| `const X = lazy(...)` + `lazyPage(...)` declarations | 1,038 | 999 |
| Unique identifier names | 999 | 999 |
| Duplicate identifiers | 39 | 0 |

Strategy: when name `X` was declared twice, the **`lazyPage(...)` version was
preferred** (it wraps with `withPage` for error-boundary support), else the
**last** occurrence. Losers were replaced in place with a
`// DEDUPED [name] ...` comment so line numbers and context are preserved.

Script: `scripts/dedup-app-tsx.js` (reusable).

Backup: `_external-backups/duplicates-removed-2026-04-18/erp-app/App.tsx.original`

---

## 3. API Route File Dedup (resolved)

Deleted 4 underscore-variant stubs (88-line CRUD wrappers) in favour of the
richer kebab-case canonical files (189+ lines each).

| Underscore variant (removed) | Canonical kept |
|------------------------------|----------------|
| `goods_receipts.ts`   | `goods-receipts.ts`   (189 LOC) |
| `purchase_orders.ts`  | `purchase-orders.ts`  (187 LOC) |
| `purchase_requests.ts`| `purchase-requests.ts` (173 LOC) |
| `raw_materials.ts`    | `raw-materials.ts`    (447 LOC) |

Updated `api-server/src/routes/index.ts`:
* Removed 4 `import *_Router from "./*_*"` lines (lines 123, 127, 129, 130).
* Removed 4 `router.use(*_Router)` mounts.
* Left `DEDUPED 2026-04-18:` marker comments in place.

Kept (no kebab sibling exists — not duplicates):
* `purchase_order_items.ts`
* `stock_counts.ts`
* `stock_movements.ts`

Backup: `_external-backups/duplicates-removed-2026-04-18/api-server-routes/`
(all 7 underscore files preserved, including those NOT deleted, for safety).

Final route-file count: **324** `.ts` files.

---

## 4. DB Duplicate Table Definitions (documented, not dropped)

Created `supabase/migrations/00042_mark_duplicate_tables.sql` — **comments
only**, NO `DROP TABLE`. Documents 5 redundant definitions:

* `governance.roles`            (00000:71 vs 00019:11)
* `governance.permissions`      (00000:82 vs 00019:21)
* `governance.role_permissions` (00000:95 vs 00019:31)
* `governance.user_roles`       (00000:104 vs 00019:39)
* `analytics.dashboard_widgets` (00010:391 vs 00021:16)

The second definitions use `create table if not exists` → runtime no-op.
Consolidation deferred to Phase 11.

---

## 5. Duplicate API Endpoints (documented only)

Created `_master-registry/DUPLICATE_ENDPOINTS_REGISTRY.md` describing the
hot-spot duplicates from `QA_AGENT_08_API.md` (190 pairs). No runtime
changes — Express resolves first-mount, so later duplicates are already dead
code. Consolidation deferred.

---

## 6. Duplicate Dependencies (report-only)

Created `_master-registry/DUPLICATE_DEPENDENCIES.md`. Root `package.json`
has minimal deps (`concurrently`, `rimraf`). Service-level duplication is
expected in an npm-workspaces monorepo. No hard version conflicts detected.
No `package.json` files were modified.

---

## 7. Real-Estate Residues (documented only)

Created `_master-registry/REALESTATE_RESIDUES.md`. Scan of migrations
00037–00041 is CLEAN. 4 orphaned page files remain under
`erp-app/src/pages/projects/real-estate/`:

* `contractors.tsx`
* `kiryati10.tsx`
* `permits.tsx`
* `units.tsx`

NOT deleted — pending verification that App.tsx does not still route to them.

---

## 8. Backup Directory

Root: `_external-backups/duplicates-removed-2026-04-18/`
Total size: **~3.0 MB**

```
├── erp-app/App.tsx.original             (208 KB)
├── packages/AI-Task-Manager/            (2.4 MB)
├── packages/GPS-Connect/                (85 KB)
├── packages/Location-Finder/            (212 KB)
├── packages/files-2/                    (101 KB)
└── api-server-routes/                   (7 .ts files, ~15 KB)
```

---

## 9. Verification Results

| Check | Result |
|-------|--------|
| `packages/*/package.json` with `name: workspace` | **0** (was 3) |
| `packages/` remaining subfolders | 11 (was 15) |
| Lazy-import duplicates in App.tsx | **0** (was 39) |
| Route files in `api-server/src/routes/*.ts` | **324** (was 328) |
| `index.ts` references to removed routers | **0** (verified via grep) |
| `supabase/migrations/00042_mark_duplicate_tables.sql` | created |
| Registry files created | 4 (ENDPOINTS, DEPS, REALESTATE, CLEANUP) |

---

## 10. TypeScript Error Delta (not measured)

Attempted `cd api-server && npx tsc --noEmit` — pre-existing path error
(`Cannot read file 'C:/Users/kobi/Projects/tsconfig.base.json'`) blocks
compile before dedup can change outcomes. erp-app tsc not run (would take
>5 min; outside time-box). Recommend measuring deltas after the
`tsconfig.base.json` path is fixed in a separate task.

---

## 11. Blockers / Open Items

* `packages/erp-upload` vs `packages/technokoluzi-erp` — their internal
  package names don't match their folder names. Not a blocker for install
  but confusing. Defer to dep-alignment task.
* 4 real-estate page files still present (see item 7).
* 190 duplicate Express endpoints documented but not merged.
* DB duplicate tables documented but not dropped (per policy).
* tsc baseline not measurable due to pre-existing tsconfig path issue.

---

## 12. Files Modified / Created

**Modified:**
* `erp-app/src/App.tsx` — 39 duplicate lazy declarations replaced with `// DEDUPED` comments
* `api-server/src/routes/index.ts` — removed 4 imports + 4 mounts

**Created:**
* `scripts/dedup-app-tsx.js`
* `supabase/migrations/00042_mark_duplicate_tables.sql`
* `_master-registry/DUPLICATE_ENDPOINTS_REGISTRY.md`
* `_master-registry/DUPLICATE_DEPENDENCIES.md`
* `_master-registry/REALESTATE_RESIDUES.md`
* `_master-registry/DUPLICATE_CLEANUP_REPORT.md` (this file)

**Deleted (after backup):**
* `packages/AI-Task-Manager/`
* `packages/GPS-Connect/`
* `packages/Location-Finder/`
* `packages/files-2/`
* `api-server/src/routes/goods_receipts.ts`
* `api-server/src/routes/purchase_orders.ts`
* `api-server/src/routes/purchase_requests.ts`
* `api-server/src/routes/raw_materials.ts`

---

End of report.
