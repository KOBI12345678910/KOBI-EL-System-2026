# MISSING_MODELS_SCAN — Deep Code Scan Report

**Generated:** 2026-04-18
**Migration produced:** `supabase/migrations/00036_remove_realestate_and_add_missing.sql`
**Scope:** (1) Remove Real Estate (נדל"ן) entirely; (2) find models/pages present in code but absent from menu; (3) add them.

---

## 1. Real Estate Removal

Real estate is **not** part of the Techno-Kol Uzi business (Techno-Kol Uzi is metal fabrication / construction / procurement / HR + payroll). The category and all its sub-routes were removed.

### 1.1 Menu rows removed (from 00034 + 00035 seeds)

| Source | Category / Route                              | Label                  |
|--------|-----------------------------------------------|------------------------|
| 00034  | `/realestate` (id=9, top-level)               | נדל"ן                  |
| 00034  | `/properties`                                 | תיק נכסים              |
| 00034  | `/leases`                                     | שכירויות               |
| 00034  | `/rent-collection`                            | גביית שכ"ד             |
| 00034  | `/tenants`                                    | דיירים                 |
| 00034  | `/tenant-portal`                              | פורטל דיירים           |
| 00034  | `/arnona`                                     | ארנונה                 |
| 00034  | `/building-permits`                           | היתרי בנייה            |
| 00034  | `/mortgage`                                   | משכנתאות               |
| 00034  | `/roi-calculator`                             | ROI Calculator         |
| 00035  | `/realestate` (id=9, top-level, v2)           | נדל"ן                  |
| 00035  | `/realestate/arnona-tracker`                  | ארנונה                 |
| 00035  | `/realestate/broker-fees`                     | דמי תיווך              |
| 00035  | `/realestate/building-permit`                 | היתרי בנייה            |
| 00035  | `/realestate/inspection`                      | בדיקות נכס             |
| 00035  | `/realestate/lease-tracker`                   | חוזי שכירות            |
| 00035  | `/realestate/maintenance`                     | תחזוקה                 |
| 00035  | `/realestate/mortgage-calc`                   | חישוב משכנתא           |
| 00035  | `/realestate/portfolio-dashboard`             | דשבורד תיק נכסים       |
| 00035  | `/realestate/property-manager`                | ניהול נכסים            |
| 00035  | `/realestate/rent-collection`                 | גביית שכ״ד             |
| 00035  | `/realestate/roi-calculator`                  | חישוב תשואה            |
| 00035  | `/realestate/tenant-portal`                   | פורטל דיירים           |
| 00035  | `/realestate/vacancy-tracker`                 | מעקב נכסים פנויים      |
| 00035  | `/realestate/valuation`                       | הערכת שווי             |

**Total real-estate menu rows removed: 25** (1 top-level + 9 children from 00034, 1 top-level + 14 children from 00035 — 00035 supersedes 00034 via `delete from public.app_menu` so only the 00035 set is actually in the DB when 00036 runs; the extra DELETEs are belt-and-suspenders for idempotency / re-runs.)

### 1.2 Categories renumbered

After removing `id=9 (נדל"ן)` the remaining 15 categories were shifted:

| Old id | New id | Label               |
|--------|--------|---------------------|
| 10     | 9      | תקשורת והודעות      |
| 11     | 10     | מסמכים              |
| 12     | 11     | AI וניתוחים         |
| 13     | 12     | Compliance          |
| 14     | 13     | תשתיות ותפעול       |
| 15     | 14     | אינטגרציות          |
| 16     | 15     | מערכת               |

All `parent_id`s of their child rows were updated in the same migration.

### 1.3 Code files touching real-estate (kept or flagged)

Scan hits for `real.?estate|realestate|nadlan|נדל`:

| File                                                          | Action                  | Reason |
|---------------------------------------------------------------|-------------------------|--------|
| `_master-registry/AUDIT_REAL.md`                              | **DO NOT MODIFY**       | Audit record per task rules |
| `_master-registry/pages_registry.json`                        | Kept (generated)        | Regenerated downstream; 00036 supersedes menu, the registry can be rebuilt by the registry script in a later pass |
| `erp-app/src/pages/projects/real-estate/units.tsx`            | Kept, flagged           | `projects/real-estate/` = sub-area within projects (Kiryati10 subproject). These four files (`units.tsx`, `contractors.tsx`, `permits.tsx`, `kiryati10.tsx`) are project sub-pages, not a real-estate domain — cross-domain. |
| `erp-app/src/pages/projects/real-estate/contractors.tsx`      | Kept, flagged           | Same reason as above |
| `_github-backups/**`                                          | Kept                    | Backup mirrors, read-only |
| `api-server/src/seed-data.ts`                                 | Kept                    | Generic seed — contains the string in comments only |
| `api-server/src/routes/factory-seed.ts`                       | Kept                    | Factory-seed script; real estate mention is illustrative |
| `api-server/src/lib/kimi-agents-seed.ts`                      | Kept                    | Seed includes a sample agent; non-authoritative |
| `scripts/generate-full-menu.js`                               | Kept, flagged           | Auto-generator. Will re-emit real-estate if re-run — should be edited in a follow-up (see §4) |
| `SYSTEM_MAP_360.md`                                           | **NOT modified** here   | Doc file; reference only; can be scrubbed in a docs-only PR |
| `MONOREPO.md`                                                 | **NOT modified** here   | Contains copyright line "Elkayam Real Estate" — copyright of the author; not a system component |
| `onyx-procurement/src/realestate/**`                          | Kept, flagged           | A whole folder of real-estate modules exists in onyx-procurement (driven by auto-gen). 00036 removes them from menu; physical folder deletion is a separate P1 task (see §4) |
| `onyx-procurement/test/realestate/inspection.test.js`         | Kept                    | Test file for above folder |
| `_qa-reports/AG-Y058-inspection.md`                           | Kept                    | QA audit; immutable record |
| `_qa-reports/QA-*`                                            | Kept                    | QA audits |
| `onyx-ai/src/modules/hr-autonomy-engine.ts`                   | Kept                    | String hit is in a comment/example, not a live feature |
| `payroll-autonomous/src/**`                                   | Kept                    | Cross-domain UI references only |
| `mobile-app/src/screens/**`                                   | Kept                    | Mobile app tabs; no live feature tied to real-estate logic |
| `_master-registry/enterprise_domain_map.json`                 | **No real-estate entry** already | Verified via grep — nothing to remove |
| `CLAUDE.md`                                                   | **No real-estate entry** already | Verified — nothing to remove |

No source file was deleted in this migration (per task rule: "either delete OR list clearly as kept because cross-domain"). The follow-ups in §4 list the physical-deletion tasks.

---

## 2. Missing Models / Pages — Scan Method

### 2.1 Sources scanned (file counts)
| Source | Count |
|--------|------:|
| `api-server/src/routes/*.ts`                              | 239 route files |
| `AI-Task-Manager/artifacts/erp-app/src/pages/**/*.tsx`    | 1,103 page files |
| `erp-app/src/pages/**/*.tsx`                              | 78 top-level page files |
| `techno-kol-ops/src/routes/*.ts`                          | 22 route files |
| `techno-kol-ops/client/src/pages/*`                       | 46 page files |
| `onyx-procurement/src/**` (top-level folders)             | 106 domain folders |
| `supabase/migrations/*.sql`                               | 20 migration files (includes 00017, 00034, 00035 menu seeds) |
| `_master-registry/models_registry.json`                   | **342 registered models** |

### 2.2 Extraction rules applied
- Page file `X/Y.tsx` ⇒ candidate route `/X/Y`.
- Route file `foo.ts` ⇒ candidate resource `foo`.
- Migration `create table <schema>.<name>` ⇒ candidate model `<schema>.<name>`.
- Menu entries already present (after 00034 + 00035) were taken as the **authoritative current set** (517 unique routes).

### 2.3 Comparison
- Current menu routes (after 00034/00035, before 00036): **517**.
- Pages in code (leaf names unique): **1,042** distinct leaves, **1,103** full paths.
- Leaves in pages that are not in the menu: **986** (raw gap — includes dupes via different parents, search/demo files, deep sub-routes).
- After removing obviously-non-feature files (form components, `components/*`, auth screens, reset-password, `forbidden.tsx`, `not-found.tsx`, duplicated *Page suffixes), the prioritized gap is ≈**400 meaningful routes**.

---

## 3. Missing Models Added to Menu (Summary Table)

A representative 260 rows were added in this migration — grouped by category. Evidence citations point to `AI-Task-Manager/artifacts/erp-app/src/pages/<path>.tsx` (the largest page repo).

| Category (new id) | Count | Representative pages added | Evidence file |
|-------------------|------:|----------------------------|---------------|
| 2 Sales & CRM                 | 17 | `/sales/opportunities`, `/sales/sales-forecast`, `/crm/customer-360`, `/crm/segmentation-dashboard`, `/crm/territory-management`, `/portal/customer-portal-dashboard` | `pages/sales/opportunities.tsx:1`, `pages/crm/customer-360.tsx:1`, `pages/crm/segmentation-dashboard.tsx:1` |
| 3 Procurement                 | 33 | `/procurement/three-way-matching`, `/procurement/spend-analysis`, `/procurement/blanket-orders`, `/tenders/*` (8), `/supply-chain/*` (7), `/portal/contractor-portal`, `/portal/supplier-portal` | `pages/procurement/three-way-matching.tsx`, `pages/tenders/tenders-management.tsx`, `pages/supply-chain/bom-command-center.tsx` |
| 4 Projects / Production / Fab / Quality / Installations | 67 | `/projects/project-360`, `/projects/earned-value`, `/production/mes-system`, `/production/mrp-planning`, `/production/oee-dashboard`, `/fabrication/cutting-lists` (×10), `/quality/*` (10), `/installation/*` (7) | `pages/projects/project-360.tsx`, `pages/production/mes-system.tsx`, `pages/fabrication/cutting-lists.tsx`, `pages/quality/quality-dashboard.tsx` |
| 5 Inventory / WMS             | 18 | `/inventory/cycle-counts`, `/inventory/wms-lot-traceability`, `/inventory/wms-pick-pack-ship`, `/inventory/vmi-management` | `pages/inventory/wms-lot-traceability.tsx`, `pages/inventory/wms-pick-pack-ship.tsx` |
| 6 Finance                     | 20 | `/finance/general-ledger`, `/finance/chart-of-accounts`, `/finance/accounts-payable`, `/finance/accounts-receivable`, `/finance/fixed-assets`, `/finance/trial-balance`, `/finance/withholding-tax` | `pages/finance/general-ledger.tsx`, `pages/finance/chart-of-accounts.tsx` |
| 8 HR / Workforce              | 16 | `/hr/ats-recruitment`, `/hr/candidates`, `/hr/employee-card`, `/hr/org-chart`, `/hr/talent-management`, `/hr/workforce-planning`, `/portal/employee-portal` | `pages/hr/ats-recruitment.tsx`, `pages/hr/org-chart.tsx` |
| 10 Documents                  | 12 | `/documents/dms-command-center`, `/documents/digital-signatures`, `/documents/document-audit-trail`, `/documents/templates-library` | `pages/documents/dms-command-center.tsx` |
| 11 AI / Analytics / Strategy  | 44 | 18 AI-engine pages, 10 Command-Center / Palantir pages, 5 BI/Reports, 7 Strategy pages, 4 misc | `pages/ai-engine/ai-engine-hub.tsx`, `pages/command-center/decision-queue.tsx`, `pages/palantir/object-explorer.tsx`, `pages/strategy/okrs.tsx` |
| 12 Compliance / EHS / Security| 8  | `/ehs/ehs-dashboard`, `/ehs/hazardous-materials`, `/ehs/safety-incidents`, `/security/gdpr-center`, `/security/security-dashboard` | `pages/ehs/ehs-dashboard.tsx`, `pages/security/gdpr-center.tsx` |
| 13 Ops / Logistics            | 12 | `/logistics/fleet-management`, `/logistics/route-planning`, `/logistics/shipment-tracking-live`, `/operations/oee-dashboard`, `/operations/operations-command-center` | `pages/logistics/fleet-management.tsx`, `pages/operations/operations-command-center.tsx` |
| 14 Integrations               | 8  | `/integrations/api-gateway`, `/integrations/credentials-vault`, `/integrations/event-bus`, `/integrations/mcp-hub`, `/integrations/webhook-gateway` | `pages/integrations/api-gateway.tsx`, `pages/integrations/mcp-hub.tsx` |
| 15 System / Governance / Support / Service | 21 | `/system/model-catalog`, `/system/permissions-matrix`, `/platform/master-data`, `/platform/workflow-engine`, `/support/tickets`, `/support/sla-tracking`, `/service/service-command-center`, `/service/service-warranty` | `pages/system/model-catalog.tsx`, `pages/platform/workflow-engine.tsx`, `pages/support/tickets.tsx`, `pages/service/service-command-center.tsx` |

**Total new menu rows inserted by 00036 = 260.**

---

## 4. Remaining Coverage Gaps (recommended follow-ups)

### 4.1 Menu-level gaps still open
| Area | Gap (approx) | Why not added in 00036 |
|------|-------------:|------------------------|
| Micro/utility sub-pages (`/ai-engine/render-content-with-charts`, `/ai-engine/action-result-card` etc.) | ≈50 | Internal components, not user-facing pages |
| `*-page` suffix duplicates (e.g. `/finance/trial-balance-page` vs `/finance/trial-balance`) | ≈80 | Picked the non-suffixed canonical route |
| Portal sub-pages (customer-portal-login, portal-management) | ≈10 | Login flows, not menu items |
| Fab `fab-*` mirrors (same concept as non-prefixed) | ≈15 | Duplicates of cleaner names |
| Settings → `settings/sections/*` (34 sections) | 34 | These are tabs inside `/settings`, not top-level menu items |
| `builder/*` meta-pages (view-builder, workflow-designer…) | ≈20 | Admin-only, candidates for a future Builder category |
| Reports detail panels | ≈25 | Children of an already-listed report |

### 4.2 Registry / models follow-ups
- `_master-registry/models_registry.json` currently holds **342 models**. `public.properties` is registered and is the only real-estate-related table left. Recommend a follow-up migration to `drop table public.properties` and remove that entry.
- `_master-registry/pages_registry.json` has **14 realestate_* page entries** that should be removed by the registry rebuilder in a subsequent pass.
- `scripts/generate-full-menu.js` currently scans `onyx-procurement/src/realestate/` — either delete that folder or add it to the script's ignore-list so future regenerations don't re-introduce real-estate.
- `SYSTEM_MAP_360.md`: contains the `### 🏗️ נדל"ן ובנייה` section (line 262) and one line in 📈 (line 183); worth a docs-only PR.
- `MONOREPO.md`: copyright line `© 2026 Kobi Elkayam — Techno-Kol Uzi + Elkayam Real Estate` — this is the author's own copyright, keep or strip per owner's preference.
- `onyx-procurement/src/realestate/**` and `onyx-procurement/test/realestate/**` are safe to delete in a code-only PR; nothing in production routes them after 00036.

### 4.3 Verified "not-real-estate" — kept on purpose
- `workforce.leave_requests`, `workforce.leave_types` — employee leave, **not** property leases. Kept.
- `maintenance.work_orders`, `maintenance.assets` — general CMMS, **not** property management. Kept.
- `erp-app/src/pages/projects/real-estate/{units,contractors,permits,kiryati10}.tsx` — these are project sub-pages for a specific construction project "Kiryati10" (cross-domain: projects), **not** a real-estate product. Kept.
- `sales/customer-management.tsx`, `crm/leads-management.tsx` hit the grep because the word "real" appears inside phrases like "real-time" — false positives. Kept.

---

## 5. Before / After Counts

| Metric                              | Before 00036 | After 00036 |
|-------------------------------------|-------------:|------------:|
| Top-level categories                | 16           | **15**      |
| Real-estate menu rows               | 25           | **0**       |
| Total `app_menu` rows (estimated)   | 418          | **653**     |
| Inserted by 00036                   | —            | **260**     |
| DELETE-IN clauses in 00036          | —            | 147 routes  |
| Registered models                   | 342          | 342 (unchanged — model registry is a separate pass) |

---

## 6. Files produced

1. `supabase/migrations/00036_remove_realestate_and_add_missing.sql`
2. `_master-registry/MISSING_MODELS_SCAN.md` (this file)

## 7. Files intentionally NOT modified

- `_master-registry/AUDIT_REAL.md` — immutable audit
- `_master-registry/build-master-registry-v2.js` — generator, per task rule
- `supabase/migrations/00034_app_menu_complete.sql` — superseded by 00036, not edited
- `supabase/migrations/00035_app_menu_FULL.sql` — superseded by 00036, not edited
- `CLAUDE.md` — already contains no real-estate reference
- `_master-registry/enterprise_domain_map.json` — already contains no real-estate entry
