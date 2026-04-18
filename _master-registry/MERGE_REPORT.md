# Merge Report — Downloads Archives into Monorepo

**Date:** 2026-04-18
**Destination:** `C:\Users\kobi\Projects\techno-kol-uzi-2026\`
**Staging:** `C:\Users\kobi\Projects\techno-kol-uzi-2026\_merge-staging\`

---

## Top-Line

| Metric | Value |
|---|---|
| Sources processed | 9 |
| Files hashed (unique content after skip filters) | 5,990 |
| Unique hashes | 4,226 |
| Duplicates eliminated (same SHA-256 across sources) | 1,764 |
| CODE-NEW files added to destination | **1,727** |
| CODE-EXISTING (already present with same content) | 32 |
| CODE-CONFLICT (same path, different content) | **2,240** |
| CONFIG files copied | 80 |
| ASSET files copied | 21 |
| DOCS files copied | 38 |
| BINARY skipped | 55 |
| New pages discovered | 564 |
| New API route files discovered | 100 |
| New Supabase migrations brought in | 0 |
| New schema files | 222 |
| **New menu entries added** | **381** |
| Final project file count | 6,595 (excluding node_modules/.git/AI-Task-Manager/GPS-Connect) |
| Final project bytes | ~2.89 GB |
| Disk space used (staging) | ~0.6 GB |

---

## Per-Source Stats (after skip filters: node_modules, .git, .local, .cache, etc.)

| Source | Files hashed | Bytes | Skipped |
|---|--:|--:|--:|
| technokoluzi-erp | 1,045 | 23.9 MB | 1 |
| AI-Task-Manager (pre-extracted) | 2,883 | 55.8 MB | 4 |
| Location-Finder | 205 | 0.8 MB | 1 |
| GPS-Connect | 208 | 0.7 MB | 1 |
| Invoice-Ledger | 115 | 0.4 MB | 1 |
| erp-upload | 1,518 | 29.1 MB | 2 |
| files (2).zip | 6 | 0.09 MB | 0 |
| files (4).zip | 5 | 0.04 MB | 0 |
| files (5).zip | 5 | 0.04 MB | 0 |

---

## Sources SKIPPED (and why)

| Source | Reason |
|---|---|
| `GPS-Connect (1).zip` | Duplicate of `GPS-Connect.zip`; per-spec skip |
| `AI-Task-Manager.zip` | Already extracted to `AI-Task-Manager/` (constraint #1). Scanned the existing tree instead. |
| `AI-Task-Manager.zip` file itself | Left in `_external-backups/` (never re-extract) |
| Large historic invoices / loose PDFs in Downloads | Out of scope per spec section "Historic invoices" |
| `Cloud-IDE-Hub*.zip`, `Marketing-AI-Director*.zip`, `AI-Performance-Director.zip`, `Replit-Invoice-Tracker.zip`, `KOBI-EL-System-2026-master.zip`, `omega-platform-full-code.zip`, `technokoluzi-erp-main*.zip`, `location-finder (1).zip`, `Location-Finder (2).zip` | Not in the user's declared source list; deferred. |

---

## De-Duplication Notes

- De-dup was by **SHA-256 of file content**, not filename.
- When the same hash appeared in 2+ sources, the canonical copy was chosen by priority:
  `technokoluzi-erp → AI-Task-Manager → Location-Finder → GPS-Connect → Invoice-Ledger → erp-upload → files-*`.
- Lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) were dropped entirely.
- `node_modules/`, `.git/`, `.next/`, `dist/`, `build/`, `.local/`, `.cache/`, `.replit-artifact/`, `attached_assets/`, `logs/`, `backups/`, `uploads/` were all skipped.

---

## Classification Counts

| Class | Count |
|---|--:|
| CODE-NEW | 1,750 (copied: 1,727) |
| CODE-EXISTING | 32 |
| CODE-CONFLICT | 2,240 (archived under `_merge-staging/_conflicts/`) |
| CONFIG | 80 (copied; existing ones preserved with `.from-<source>` suffix) |
| ASSET | 21 |
| DOCS | 48 (copied: 38) |
| BINARY-SKIP | 55 |

---

## CODE-CONFLICT Top 30 (source : target : size)

These are files where the same relative path already exists in the destination with **different content**. Destination was left untouched; conflicting version was archived at `_merge-staging/_conflicts/<source>__<flat-path>`.

| Source | Target | Size |
|---|---|--:|
| technokoluzi-erp | api-server/src/app.ts | 41,725 |
| technokoluzi-erp | api-server/src/index.ts | 5,630 |
| technokoluzi-erp | api-server/src/seed-data.ts | 95,041 |
| technokoluzi-erp | api-server/src/lib/action-executors.ts | 26,181 |
| technokoluzi-erp | api-server/src/lib/admin-seed.ts | 2,023 |
| technokoluzi-erp | api-server/src/lib/ai-agents-system.ts | 32,665 |
| technokoluzi-erp | api-server/src/lib/ai-enrichment-service.ts | 15,059 |
| technokoluzi-erp | api-server/src/lib/ai-models-seed.ts | 6,246 |
| technokoluzi-erp | api-server/src/lib/ai-provider.ts | 2,403 |
| technokoluzi-erp | api-server/src/lib/ai-workflow-agent.ts | 17,339 |
| technokoluzi-erp | api-server/src/lib/audit-logger.ts | 5,550 |
| technokoluzi-erp | api-server/src/lib/audit-middleware.ts | 4,654 |
| technokoluzi-erp | api-server/src/lib/auth.ts | 19,869 |
| technokoluzi-erp | api-server/src/lib/auto-number-engine.ts | 2,980 |
| technokoluzi-erp | api-server/src/lib/automation-templates.ts | 17,464 |
| technokoluzi-erp | api-server/src/lib/automations.ts | 12,616 |
| technokoluzi-erp | api-server/src/lib/contractor-decision.ts | 2,224 |
| technokoluzi-erp | api-server/src/lib/cross-module-sync.ts | 37,164 |
| technokoluzi-erp | api-server/src/lib/data-flow-engine.ts | 88,596 |
| technokoluzi-erp | api-server/src/lib/data-flow-registry.ts | 22,877 |
| technokoluzi-erp | api-server/src/lib/data-flow-sync.ts | 52,328 |
| technokoluzi-erp | api-server/src/lib/data-sync.ts | 24,511 |
| technokoluzi-erp | api-server/src/lib/db-health.ts | 658 |
| technokoluzi-erp | api-server/src/lib/department-role-templates.ts | 11,976 |
| technokoluzi-erp | api-server/src/lib/document-sender.ts | 2,331 |
| technokoluzi-erp | api-server/src/lib/entity-linker.ts | 3,870 |
| technokoluzi-erp | api-server/src/lib/escalation-engine.ts | 9,257 |
| technokoluzi-erp | api-server/src/lib/event-bus.ts | 637 |
| technokoluzi-erp | api-server/src/lib/external-auth.ts | 6,729 |
| technokoluzi-erp | api-server/src/lib/formula-engine.ts | 17,262 |

Full list: see `_merge-staging/_plan.json` → `CODE-CONFLICT` array (2,240 entries).
Conflicting versions are archived at `_merge-staging/_conflicts/` for user review.

---

## Destination Layout — Where Merged Files Went

| Source subtree | Destination |
|---|---|
| `artifacts/erp-app/**` | `erp-app/**` |
| `artifacts/api-server/**` | `api-server/**` |
| `artifacts/erp-mobile/**` | `mobile-app/**` |
| `artifacts/kobi-agent/**` | `onyx-ai/agents/**` |
| `lib/db/**`, `lib/api-zod/**`, `lib/shared/**`, etc. | `lib-client/<subtree>/**` |
| `supabase/migrations/**` | `supabase/migrations/**` (preserved names) |
| `supabase/functions/**` | `supabase/functions/**` |
| `scripts/**` (from any source) | `packages/<source>/scripts/**` |
| `server/**` (legacy top-level) | `api-server/src-legacy/<source>/**` |
| top-level `.md` / `.txt` | `docs/merged/<source>/**` |
| Anything else | `packages/<source>/**` (isolated) |

---

## New Models, Pages, and Routes (from merged sources)

| Type | Count |
|---|--:|
| Pages (`erp-app/src/pages/**/*.tsx`) | 564 |
| API route files (`api-server/src/routes/**/*.ts`) | 100 |
| Supabase migrations (`supabase/migrations/*.sql`) | 0 |
| Schema / model files (`lib-client/db/**`) | 222 |

Full lists: `_merge-staging/_new-entities.json`.

### Sample new pages (first 20 of 564)

- `/ai-engine/ai-admin-settings`
- `/ai-engine/ai-anomaly-detection`
- `/ai-engine/ai-audit-log`
- `/ai-engine/ai-automated-reports`
- `/ai-engine/ai-customer-service`
- `/ai-engine/ai-customer-service-pro`
- `/ai-engine/ai-executive-insights`
- `/ai-engine/ai-follow-up`
- `/ai-engine/ai-lead-scoring-pro`
- `/ai-engine/ai-procurement-optimizer`
- `/ai-engine/ai-production-insights`
- `/ai-engine/ai-quotation-assistant`
- `/ai-engine/ai-recommendation-engine`
- `/ai-engine/ai-sales-assistant`
- `/ai-engine/bash44-agent-config`
- `/ai-engine/bash44-agent-runs`
- `/ai-engine/bash44-alerts-center`
- `/ai-engine/bash44-approval-queue`
- `/advanced/anomaly-detection`
- `/advanced/digital-twin-factory`

### Sample new API routes (first 20 of 100)

- `/api/accounting-export`
- `/api/admin-cron-triggers`
- `/api/ai-business-automation`
- `/api/ai-search-enhance`
- `/api/anomaly-detection`
- `/api/api-connection-hub`
- `/api/api-hub`
- `/api/api-keys`
- `/api/bi-adhoc-query`
- `/api/bi-comparative-analytics`
- `/api/bi-dashboards`
- `/api/bi-export`
- `/api/bi-scheduled-reports`
- `/api/contract-ai-analysis`
- `/api/contract-analytics`
- `/api/contract-lifecycle`
- `/api/contract-templates`
- `/api/contractor-payment-decision`
- `/api/contracts`
- `/api/crm-communications`

---

## Menu Entries Added — Migration 00038

`supabase/migrations/00038_merged_sources_menu_additions.sql`

**Total: 381 new entries.**

Distribution across the 15 existing categories:

| Category | Count |
|---|--:|
| 2 — מכירות ולקוחות | 11 |
| 3 — רכש וספקים | 32 |
| 4 — פרויקטים | 10 |
| 5 — מלאי ומחסן | 15 |
| 6 — כספים וחשבונאות | 16 |
| 8 — כוח אדם ושכר | 12 |
| 9 — תקשורת | 4 |
| 10 — מסמכים | 20 |
| 11 — AI & אינטליגנציה | 42 |
| 12 — רגולציה וציות | 9 |
| 14 — אינטגרציות | 9 |
| 15 — מערכת וניהול (includes misc utilities) | 201 |

The migration:
- Uses `delete ... where route in (...)` **before** insert to guarantee idempotence.
- Never touches routes already present (existing routes from 00034/00035/00036 were filtered out).
- Skips utility pages (`forbidden`, `forgot-password`, `reset-password`, `not-found`, `login`, etc.).
- Uses the same `(label, route, icon, parent_id, order_index)` schema as 00034–00036.

Detailed route-per-category mapping: `_merge-staging/_menu_additions.json`.

---

## Deliverables

| Deliverable | Path |
|---|---|
| Menu migration | `supabase/migrations/00038_merged_sources_menu_additions.sql` |
| Full merge report (this file) | `_master-registry/MERGE_REPORT.md` |
| Conflicting file versions (2,240) | `_merge-staging/_conflicts/` |
| Source plan (per-hash canonical+target) | `_merge-staging/_plan.json` |
| Full summary JSON | `_merge-staging/_summary.json` |
| New entities JSON | `_merge-staging/_new-entities.json` |
| Menu additions JSON | `_merge-staging/_menu_additions.json` |
| Run log | `_merge-staging/_run.log` |

---

## Files the parent conversation owns — NOT modified

- `AUDIT_REAL.md`
- `build-master-registry-v2.js`
- `supabase/migrations/00034_app_menu_complete.sql`
- `supabase/migrations/00036_remove_realestate_and_add_missing.sql`
- `supabase/migrations/00037_vat_rate_18_percent.sql`

---

## Next Steps for You (User)

1. **Review conflicts** in `_merge-staging/_conflicts/` — many overlap with the AI-Task-Manager tree that was pre-merged. Diff before accepting.
2. **Review the CONFIG `.from-<source>` copies** — working `package.json`, `tsconfig.json` etc. were NOT overwritten; source versions were saved alongside for manual merge.
3. **Run the migration** when ready: `supabase migration up` or apply `00038_merged_sources_menu_additions.sql` via your normal pipeline.
4. The 2,240 CODE-CONFLICTs are largely `artifacts/api-server/src/lib/*.ts` and `artifacts/erp-app/src/pages/*.tsx` files — the same relative paths already present in destination from the AI-Task-Manager pre-extraction. These are likely newer-vs-older copies of the same files. Use a diff tool per category.
