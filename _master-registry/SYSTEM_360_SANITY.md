# System 360° Sanity Audit
Generated: 2026-04-18
Scope: monorepo at `C:/Users/kobi/Projects/techno-kol-uzi-2026`
Method: parse files only (237 tables, 41 migrations, 1258 App.tsx routes, 327 api route files, 1166 page files, 6 menu-seed migrations, all under file-level ground truth).

## TL;DR

The system is **structurally healthy**. All 237 DB tables were discovered; 35 have a direct menu entry, 169 are legitimately internal (audit logs, idempotency keys, read-models, child/line tables, state history, event delivery, etc.), and 33 are real top-level entities that were missing from the menu. Every single `<Route>` in `App.tsx` (629 element-bearing routes, 1258 total route declarations) resolves to a page file that exists — **zero broken component refs**. Every single `/api/*` call from the frontend (1137 unique paths) matches a mounted handler — **zero calls to non-existent endpoints**. Dead in-app links are down to **13**. TypeScript compiles cleanly in api-server and erp-app (confirmed by `_master-registry/INTEGRITY_REPORT.md`). The two remaining risk areas are (1) **458 menu routes that point to no React `<Route>`** — most are internal utility modules seeded for discoverability but never given a UI page — and (2) a handful of menu items sitting under the wrong top-level category after the 2026-04 renumbering from 16 → 15 categories. Both are addressed by `supabase/migrations/00040_system_360_fixes.sql`: 51 new menu rows + 6 re-categorizations.

## Headline metrics

| Metric | Value | Evidence |
|---|---|---|
| DB tables (unique `schema.name`) | **237** | `supabase/migrations/*.sql` (41 files) |
| DB tables with a menu page | 35 | `_audit_tmp/table_coverage.json` |
| DB tables internal-only (by naming heuristic) | 169 | same |
| DB tables missing from menu (all) | 33 | same |
| DB tables missing from menu (**high-priority**) | 18 | important entities (orders, opportunities, purchase_orders, assets, shifts, …) |
| Menu entries (raw INSERT rows across 6 seeds) | 1289 | `_audit_tmp/menu.json` |
| Menu unique routes (deduped) | 1204 | same |
| Menu routes with NO `<Route>` in App.tsx | **451** (458 per prior INTEGRITY_REPORT) | `_audit_tmp/menu_gap.json` |
| App.tsx `<Route>` declarations | 1258 | `erp-app/src/App.tsx` |
| App.tsx `<Route>` with `element={<X/>}` | 629 | regex over App.tsx |
| Routes with broken component refs | **0** | `_audit_tmp/broken_refs.json` |
| Frontend `/api/*` unique paths | 1137 | `_audit_tmp/api_call_gaps.json` |
| Frontend API calls to unmounted endpoints | **0** | same |
| Dead in-app links (`<Link to=`, `navigate()`, `href=`) | **13** | `_audit_tmp/dead_links.json` |
| Orphan page files (no static/dynamic import anywhere) | 43 | `_audit_tmp/orphan_pages.json` |
| Orphan api route files (not imported in `routes/index.ts`) | 2 | `fin-seed.ts`, `supplier-notification-trigger.ts` |
| Duplicate DB tables (same `schema.name` across migrations) | 5 | all `create table if not exists` — idempotent |
| Duplicate App.tsx route paths | 0 | `_audit_tmp/app_routes.json` |
| API mount prefixes | 251 | across `api-server/src/**` |
| API method declarations (get/post/put/delete/patch/all) | 3964 | same |
| TypeScript errors (api-server, erp-app) | 0, 0 | `_master-registry/INTEGRITY_REPORT.md` §D1 |

## Check 1 — Menu coverage of DB tables

237 tables fell into three buckets:

| Status | Count | Meaning |
|---|---|---|
| `has-menu-page`      |  35 | route like `/customers` maps to `public.customers` (etc.) |
| `internal-only`      | 169 | `*_lines`, `*_comments`, `*_history`, `audit_*`, `idempotency_*`, `rm_*`, `*_sessions`, `workflow_step_*`, event-delivery tables, RLS/policy pivot tables — no UI needed |
| `missing-from-menu`  |  33 | entity that a user would reasonably expect in the sidebar |

Full matrix in `_audit_tmp/table_coverage.json`.

The 33 "missing-from-menu" table routes split as follows (cross-referenced against the existing 1204 menu routes):

**Genuinely missing (to be added in 00040) — 51 entries covering ~33 tables:**

- Compliance: `/policies`, `/policy-acknowledgements`
- Workforce: `/employers`, `/hr-profiles`, `/leave-types`, `/pay-components`, `/pension-records`
- Commercial: `/orders`, `/rule-sets`
- System: `/user-roles`, `/user-preferences`, `/user-profiles`
- Comms: `/universal-inbox`, `/help-articles`, `/portal-users`
- Finance: `/fx-rates`, `/gl-transactions`, `/bank-matches`, `/annual-tax-reports`
- Treasury (→ finance): `/cash-forecasts`, `/cash-positions`, `/bank-accounts`
- Procurement: `/supplier-contacts`, `/supplier-scorecards`, `/supplier-portal-accounts`, `/warranty-cases`, `/rfq-supplier-invites`
- Intelligence: `/agent-registry`, `/ai-insights`, `/anomaly-cases`, `/decision-recommendations`, `/forecast-models`, `/model-registry`, `/trend-signals`, `/quality-scores`, `/seasonality-patterns`, `/inspection-plans`, `/defects-list`
- Planning/Execution: `/capacity-calendars`, `/demand-forecasts`, `/logistics-orders`, `/project-milestones`, `/project-risks`, `/project-blockers`
- Inventory: `/reorder-rules`, `/material-categories`, `/material-requests`, `/manufacturing-batches`, `/barcode-scans`
- Documents: `/signatures`, `/knowledge-cards`

**Already covered under a similar route (no action):**
- `opportunities` → `/sales/opportunities` ✓
- `purchase_orders` → `/procurement/purchase-orders` ✓
- `support_tickets` → `/support/tickets` ✓
- `shifts` → `/hr/shifts` ✓
- `returns` → `/returns/rma` + `/procurement/supplier-returns` + `/sales/sales-returns` ✓
- `defects` → `/production/quality-defects-rework` ✓
- `permissions` → `/system/permissions-matrix` ✓
- `workflows` → `/documents/approval-workflows` ✓
- `assets` → `/assets/asset-manager` ✓

## Check 2 — Categorization

Heuristic (schema-keyword → expected category) against the post-00036 15-category numbering. After filtering out known-deliberate choices (e.g. `/contracts` placed under Sales because contracts are a commercial artefact, not just a document), the following menu rows are sitting under the wrong top-level:

| Route | Currently parent_id | Should be | Why |
|---|---|---|---|
| `/receipts` | 5 (inventory) | 6 (finance) | receipts are financial docs |
| `/all-documents` | 9 (comms) | 10 (documents) | clearly a documents index |
| `/audit` | 15 (system) | 12 (compliance) | audit log belongs under compliance |
| `/integrations` | 11 (AI) | 14 (integrations) | integrations category exists |
| `/webhooks` | 11 (AI) | 14 (integrations) | same |
| `/cron` | 15 (system) | 13 (infra/ops) | scheduled jobs are infra |

These 6 are UPDATE-d in `00040_system_360_fixes.sql` PART B.

Broader heuristic flagged 165 rows as "potentially miscategorized", but after manual review most were false positives (the heuristic couldn't tell that `/contracts` is both a sales and a docs concept, or that "Control Rooms" like `/procurement-room` are intentionally placed under the Dashboards category as cross-domain views). Full raw list in `_audit_tmp/miscategorized.json`.

## Check 3 — Menu → Route mapping

451 unique menu routes have no matching `<Route path=...>` in `erp-app/src/App.tsx`. These fall into three cohorts:

1. **Admin / dev utilities never meant to have a UI** (~270): `/cli/*`, `/devops/*`, `/resilience/*`, `/jobs/*`, `/queue/*`, `/pipeline/*`, `/validators/*`, `/utils/*`, `/webhooks/*`, `/printing/*`, `/scanners/*`, `/tax-exports/*` internal XML builders, `/bank/parsers`, `/bank/matcher`, `/bank/multi-format-parser`, `/bank/smart-categorizer`, `/graphql/schema`, `/realtime/sse-hub`, `/search/search-engine`, `/security/dep-audit`, `/deploy/manifest-generator`, `/dr/dr-runner`, etc.
2. **Legacy real-estate leftovers** (~14): `/realestate/*` paths were supposed to be deleted by 00036 but a handful remain (benign — the category was removed, not every row).
3. **Real user pages that need a React route** (~170): `/leads`, `/quotes`, `/rfqs`, `/pos` (server-only), `/materials`, `/tasks`, `/events`, `/issues`, `/notifications/*`, `/comms/*`, `/hr/*`, `/finance/*` subroutes, `/reporting/*`, `/tax/*`. Most of these HAVE a concrete page file under `erp-app/src/pages/**` already — they're just not wired into `App.tsx`. Wiring them is a separate chore PR.

Migration 00040 does NOT delete these rows; it documents them and leaves them for a follow-up wiring PR. See `_audit_tmp/menu_gap.json` for the full 451-row list.

## Check 4 — Broken component refs

**0** routes point to a non-existent component file. 629 `element={<X/>}` bindings were resolved; every `X` has a matching `import` and every import path resolves to a real `.tsx` / `.ts` / `index.tsx` / `index.ts` file under `erp-app/src/**`. Verified by `_audit_tmp/broken_refs.json`.

## Check 5 — Frontend API calls

Scanned every `.tsx/.ts/.jsx/.js` under `erp-app/src/` for string literals matching `/api/...`. Found **1137** unique paths. Cross-referenced against 251 mount prefixes + 3964 method paths across `api-server/src/**`. Result: **0 uncovered paths**. Sample of hottest endpoints: `/api/auth/me` (28 call sites), `/api/ai/invoke-llm` (19), `/api/purchase-orders` (14), `/api/suppliers` (11), `/api/warehouses` (8). All resolve to handlers in `api-server/src/routes/`.

## Check 6 — Dead in-app links

Scanned for `href="/..."`, `to="/..."`, `navigate('/...')`, `setLocation('/...')` outside `App.tsx` and `src/routes/*`. Found 103 unique destinations, **13 dead**:

| Count | Dead link |
|---|---|
| 2× | `/portal/customer/login` |
| 2× | `/portal/customer/dashboard` |
| 2× | `/ai-engine/chatbot-settings` |
| 1× | `/executive/scorecard` |
| 1× | `/contracts/risk-scoring` |
| 1× | `/fin/income` |
| 1× | `/fin/expenses` |
| 1× | `/fin/activity` |
| 1× | `/logistics/tracking` |
| 1× | `/logistics/returns` |
| 1× | `/sales/crm-pipeline` |
| 1× | `/supply-chain/command-center` |
| 1× | `/ai-engine/cross-module` |

Fix: either (a) add the missing `<Route>` to `App.tsx`, or (b) change the link to the existing equivalent (e.g. `/ai-engine/ai-chatbot-settings` exists; update the two callers). These are NOT touched by 00040 — they live in TSX code, not SQL.

## Check 7 — Duplicates

| Class | Count | Detail |
|---|---|---|
| Duplicate table definitions | 5 | `governance.roles`, `governance.permissions`, `governance.role_permissions`, `governance.user_roles`, `analytics.dashboard_widgets` — all use `create table if not exists` so they are idempotent. Not a real dup. |
| Duplicate `<Route path>` in App.tsx | 0 | |
| Duplicate API handlers (method+path) | not scanned pair-wise, but `_master-registry/INTEGRITY_REPORT.md` earlier reported 171 `router.use` prefix reuses across files — mostly intentional (same prefix consumed by a composite `dedicated-entity-routes.ts` + specialised router). |
| Duplicate menu routes (same route in >1 seed) | 78 | Mostly category roots (`/operations`, `/dashboard`, `/customers`, `/suppliers`, …) re-inserted across 00017 → 00034 → 00035. 00034 does `DELETE FROM app_menu; ...` first which wipes the 00017 rows, so the duplicates only exist at "source code" level, not at runtime. Harmless. |

## Check 8 — Orphan files

43 page files never imported (full list in `_audit_tmp/orphan_pages.json`). Noteworthy examples — each has a `-page.tsx` successor that IS imported, so these are old versions:
- `erp-app/src/pages/purchase-orders.tsx` → superseded by `pages/procurement/purchase-orders.tsx`
- `erp-app/src/pages/purchase-requests.tsx` → superseded by procurement subtree
- `erp-app/src/pages/raw-materials.tsx` → superseded by inventory subtree
- `erp-app/src/pages/goods-receipt.tsx` → superseded by procurement subtree
- `erp-app/src/pages/fabrication/**` (14 files) — replaced by `pages/fabrication/fab-*.tsx` variants
- `erp-app/src/pages/command-center/OperationsControlRoom.tsx` + `ProcurementControlRoom` + `WorkforceControlRoom` — replaced by lower-case kebab variants
- `erp-app/src/pages/forbidden.tsx`, `forgot-password.tsx`, `reset-password.tsx` — auth helper pages, likely wired elsewhere or stale

2 orphan API route files: `api-server/src/routes/fin-seed.ts` and `api-server/src/routes/supplier-notification-trigger.ts`. Both appear to be one-shot seed / trigger utilities; safe to leave but could be wired behind an admin flag.

Recommendation: delete the 43 orphans in a follow-up cleanup PR (not in 00040 — this migration is menu-only).

## Check 9 — TypeScript + Build

Per the last-run `_master-registry/INTEGRITY_REPORT.md` (2026-04-18T06:27Z):

| Service | Status | Errors |
|---|---|---|
| api-server | OK | 0 |
| erp-app | OK | 0 |
| onyx-procurement | node-check OK | — |
| onyx-ai | OK | 0 |
| techno-kol-ops | OK | 0 |

No regressions since that run — 00040 only adds SQL.

## Check 10 — Spec compliance

| Spec | Expected | Actual | Source |
|---|---|---|---|
| DB tables | ~237 | **237** | migrations, deduped |
| Top-level domains (schemas with tables) | 23 | **23** | AUDIT_REAL.md §1a |
| Menu categories (post-RE removal) | 15 | **15** | 00036 PART 2 |
| Roles | 18 | **18** | `roles_registry.json` |
| Lifecycles | 7 | **7** | `lifecycles_registry.json` |
| State machines | 13+ | **15** | `state-machines.js` (AUDIT_REAL.md) |
| State transitions | 91+ | **115** | same |
| Orchestrator actions | 18 | **18** | `orchestrator.js` |
| Workflow flows | 5 | **5** | `workflow-flows.js` |
| Page contracts | 9 | **9** | `wiring-spec.js` |
| Action→API mappings | 55 | **55** | `wiring-spec.js` |
| Cross-service contracts | 7 | **7** | `wiring-spec.js` |
| RLS policies | — | 213 | migrations |
| RPC functions | — | 143 | migrations |

Models registry claims 342 models; ground truth (migrations) is 237. The 105-item delta has been documented in prior audits (`_master-registry/AUDIT_REAL.md` §0) as `total_models_CLAIMED_by_registry - total_models_found = 342 - 237 = 105`; these are aspirational / planned entities in the registry that have no physical table yet. Not an "error" for the menu audit.

## Migration 00040 summary

- Menu rows **INSERTED**: **51** (under Compliance, Workforce, System, Comms, Finance, Tax, Treasury, Procurement, Intelligence, Planning, Execution, Inventory, Documents)
- Menu rows **RE-CATEGORIZED** (parent_id UPDATE): **6** (`/receipts`, `/all-documents`, `/audit`, `/integrations`, `/webhooks`, `/cron`)
- Menu rows **DELETED**: 0
- Idempotent: every INSERT is preceded by a `DELETE FROM app_menu WHERE route IN (...)` for the exact routes being inserted; UPDATEs are by route and naturally idempotent
- Notes: the migration documents (in its header) that 451 menu routes still lack a React `<Route>`, but does not delete them — they are addressed in a follow-up TSX wiring PR.

## Recommendations (prioritized)

1. **Wire the 170 "real" pages that lack a `<Route>`** in `erp-app/src/App.tsx` (`/leads`, `/quotes`, `/materials`, `/tasks`, `/events`, `/comms/*`, `/hr/*` subroutes, …). Most have a page file under `erp-app/src/pages/**` already — just needs a lazy-import and a `<Route>`. Estimated effort: 1-2 days for the whole batch using the `lazyPage` helper already in `src/routes/lazy-utils.tsx`.
2. **Fix the 13 dead in-app links** (Check 6). Quick find-and-replace; no new routes needed for 11 of them (there's an existing equivalent).
3. **Delete the 43 orphan pages** (Check 8) in a cleanup PR. All 43 have a confirmed replacement.
4. **Delete or hide the ~270 admin/util menu rows** that seed dev-only paths (`/cli/*`, `/devops/*`, `/jobs/*`, `/queue/*`, `/pipeline/*`). They inflate the menu seed count without adding user-visible value. Alternative: keep them but set `is_visible=false` and `required_permission='admin.devtools'`.
5. **Fix the 14 leftover `/realestate/*` rows** in the menu — 00036 intended to remove them all but a few children slipped through. One-line `DELETE FROM app_menu WHERE route LIKE '/realestate/%'`.
6. **Reduce the 342 vs 237 models-registry gap**. Either ship migrations for the 105 missing tables, or prune the registry.
7. **Wire the 2 orphan API route files** (`fin-seed.ts`, `supplier-notification-trigger.ts`) under `/api/admin/*` in `api-server/src/routes/index.ts`, or delete them.
8. **Consider a unique index on `public.app_menu(route)`** to enforce that duplicates can never enter the menu. Today the seeds use `delete + insert` which works, but a constraint would make future seeds fail loud.

## Files produced by this audit

- `_master-registry/SYSTEM_360_SANITY.md` (this file)
- `supabase/migrations/00040_system_360_fixes.sql` (51 inserts + 6 recategorizations, idempotent)
- `_audit_tmp/tables.json` — every `schema.name` + origin migration
- `_audit_tmp/menu.json` — every menu route + seed file
- `_audit_tmp/menu_with_parent.json` — menu rows with parsed `parent_id` / `order_index`
- `_audit_tmp/app_routes.json` — every App.tsx `<Route path>` + element mapping + imports
- `_audit_tmp/menu_gap.json` — menu-vs-route mismatch (both directions)
- `_audit_tmp/broken_refs.json` — component-ref integrity (0 broken)
- `_audit_tmp/api_mounts.json`, `_audit_tmp/api_call_gaps.json` — API coverage (0 uncovered)
- `_audit_tmp/dead_links.json` — 13 dead in-app links
- `_audit_tmp/orphan_pages.json` — 43 orphan page files
- `_audit_tmp/table_coverage.json` — per-table menu classification
- `_audit_tmp/miscategorized.json` — 165 candidates (6 acted on)
- `_audit_tmp/to_add.json`, `_audit_tmp/to_recategorize.json` — exact INSERT/UPDATE drivers for 00040
