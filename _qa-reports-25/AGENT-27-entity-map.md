# AGENT-27 — Deep Audit: `onyx-procurement/src/pipeline/entity-map.js`

**Agent:** 27
**Scope:** ONLY `onyx-procurement/src/pipeline/entity-map.js`
**Date:** 2026-04-29
**File length:** 402 lines, 16 entities, 3 routes
**Reference contract (CLAUDE.md):** "16 entities with links, statuses, actions, fields, related sections"

---

## Status

**OVERALL: PASS WITH MINOR GAPS** — All 16 required entities are defined, every entity exposes the 5 mandatory keys (`links`, `statuses`, `actions` (via `actions` + `nextSteps`), `topFields`, `relatedSections`), and the 3 REST routes (`/api/entity-map`, `/api/entity-map/:type`, `/api/entity-map-types`) are correctly registered. No syntax errors, no missing entities, no duplicate keys. Minor gaps exist in action depth for supporting entities and in plural/singular consistency between `links` and `relatedSections`.

---

## Entities-coverage (16 / 16)

| # | Key | label | service | links | statuses | nextSteps | actions | topFields | relatedSections |
|---|-----|-------|---------|------:|---------:|----------:|--------:|----------:|----------------:|
| 1 | `lead` | ליד | ops | 6 | 6 | 4 | 6 | 8 | 4 |
| 2 | `customer` | לקוח | ops | 11 | 5 | 4 | 5 | 8 | 9 |
| 3 | `supplier` | ספק | procurement | 11 | 5 | 4 | 5 | 9 | 10 |
| 4 | `quote` | הצעת מחיר | procurement | 8 | 6 | 4 | 6 | 8 | 7 |
| 5 | `rfq` | בקשת הצעה | procurement | 6 | 5 | 4 | 3 | 7 | 6 |
| 6 | `po` | הזמנת רכש | procurement | 9 | 7 | 4 | 5 | 8 | 9 |
| 7 | `project` | פרויקט | ops | 18 | 8 | 6 | 8 | 9 | 16 |
| 8 | `work_order` | הזמנת עבודה | ops | 9 | 7 | 5 | 5 | 8 | 10 |
| 9 | `invoice` | חשבונית | procurement | 10 | 7 | 5 | 6 | 11 | 10 |
| 10 | `employee` | עובד | payroll | 10 | 4 | 4 | 6 | 9 | 10 |
| 11 | `contract` | חוזה | procurement | 7 | 5 | 3 | **2** | 7 | 7 |
| 12 | `material` | חומר | ops | 8 | 3 | 5 | **2** | 8 | 6 |
| 13 | `payment` | תשלום | procurement | 8 | 4 | 3 | **2** | 7 | 5 |
| 14 | `task` | משימה | ops | 7 | 5 | 4 | **2** | 7 | 5 |
| 15 | `document` | מסמך | procurement | 10 | 4 | 4 | **2** | 6 | 4 |
| 16 | `alert` | התראה | ai | 6 | 5 | 3 | **2** | 7 | 4 |

All 16 satisfy the contract structurally. **5 mandatory keys per entity = 16 × 5 = 80 / 80 present.**

---

## Missing-fields

Bold rows above (≤ 2 actions) indicate entities where the `actions` array is unusually thin compared to the 360-page contract ("primary actions, related records, documents, audit log, next recommended action"). The supporting-entities block at lines 273-369 collapses actions to 2 items each:

- **`contract`** (L287): only `edit` + `export_pdf`. Missing: `send_for_signature`, `terminate`, `renew`, `add_amendment`.
- **`material`** (L304): only `edit` + `scan_barcode`. Missing: `transfer_warehouse`, `adjust_stock`, `reorder`, `view_movements`.
- **`payment`** (L319): only `edit` + `export`. Missing: `void`, `refund`, `print_receipt`, `view_gl`.
- **`task`** (L335): only `edit` + `add_note`. Missing: `reassign`, `attach_document`, `link_to_entity`, `set_reminder`.
- **`document`** (L351): only `ocr_scan` + `download`. Missing: `share`, `replace_version`, `delete`, `request_signature`.
- **`alert`** (L366): only `add_note` + `dismiss`. Missing: `escalate`, `link_to_runbook`, `snooze`, `acknowledge` (currently in nextSteps only).

Other missing-field findings:

- **`task.parent_entity`** is used as a `topField` and a `relatedSection`, but no enum/type for parent kinds is defined; downstream UI cannot render a typed link.
- **`document.parent_entity`** — same issue. The 360 contract requires a typed parent.
- **`employee`** lacks `manager` / `direct_reports` fields and `id_number` is shared with `customer` without prefix — risk of namespace collision in shared search.
- **`alert`** lacks a `severity` enum (referenced as `topField` but not in `statuses`). `severity` and `status` are conflated.
- **`invoice.direction`** is a `topField` but no enum (`incoming` / `outgoing`) is declared on the entity.
- **None** of the 16 entities exposes a `kpis` or `metrics` block — 360 pages on `Customer360`, `Supplier360`, `Project360` will need synthetic computation.

---

## Broken-links

Cross-checking every value in every `links: [...]` array against the 16 declared entity keys, the following references point to entities NOT defined in this file (they are external concepts — likely owned by other pipeline modules, but **not declared here**, so any UI that follows a link will 404 against `/api/entity-map/:type`):

| Source entity | Broken link target | Where |
|---|---|---|
| `lead` | `crm_activity`, `message`, `sales_opportunity` | L20 |
| `customer` | `collection`, `customer_portal`, `support_ticket`, `message` | L46 |
| `supplier` | `supplier_quote`, `supplier_invoice`, `return`, `warranty`, `supplier_portal`, `performance_score` | L71 |
| `quote` | `pricing`, `approval`, `tax_export` | L96 |
| `rfq` | `pricing`, `approval`, `supplier_quote` | L122 |
| `po` | `approval`, `inventory_receipt`, `supplier_invoice`, `return`, `warranty`, `costing` | L145 |
| `project` | `inventory_reservation`, `material_request`, `expense`, `employee_assignment`, `logistics_order`, `report`, `forecast`, `audit_log` | L170 |
| `work_order` | `material_request`, `inventory_reservation`, `employee_assignment`, `attendance`, `quality_check`, `signature`, `expense` | L200 |
| `invoice` | `collection`, `vat`, `tax`, `bank_match` | L226 |
| `employee` | `hr_profile`, `attendance`, `payroll`, `pension`, `expense`, `employer` | L253 |
| `contract` | `signature` | L280 |
| `material` | `inventory`, `warehouse`, `material_request`, `costing`, `barcode_scan` | L295 |
| `payment` | `bank_match`, `cashflow`, `gl`, `vat`, `tax` | L312 |
| `task` | `message` | L327 |
| `document` | `ocr`, `signature` | L343 |
| `alert` | `cashflow`, `ai_insight` | L359 |

These are **not necessarily wrong** (most are sub-entities owned by other modules), but the file does not flag them as external. The route `/api/entity-map/:type` will return 404 for every one, breaking 360-page navigation.

Plural/singular drift in `relatedSections` vs `links` (UI joiner risk, not a hard break):

- `lead.relatedSections.tasks` ↔ link `task` (singular)
- `customer.relatedSections.{leads, quotes, projects, invoices, payments, support_tickets}` — all pluralized vs singular link names
- `project.relatedSections.{work_orders, pos, materials, tasks, employees, expenses, logistics, invoices, payments, reports, alerts}` — same drift; `logistics` has no matching link (`logistics_order` instead)
- `supplier.relatedSections.performance` ↔ link `performance_score`

---

## Fixes (recommended, not applied — read-only audit)

1. **Add an `external: true` flag** (or a sibling `EXTERNAL_ENTITY_REFS` const) for the 70+ link targets that resolve outside this file, so the route handler can return a typed stub instead of 404.
2. **Bring the 6 thin entities up to ≥ 4 actions** — `contract`, `material`, `payment`, `task`, `document`, `alert` (specifics in Missing-fields above).
3. **Normalize `relatedSections` to match link keys** — drop the plural form, or maintain a `pluralOf` map so the UI can resolve `tasks` → `task`.
4. **Add `severity` enum to `alert`** (e.g. `['info', 'warning', 'critical']`) and to `topFields`.
5. **Add `direction` enum to `invoice`** (`['incoming', 'outgoing']`).
6. **Add typed `parent_entity` schema** (allowed types) to `task`, `document`, `alert` — required for the 360 "Where am I?" rule.
7. **Fix `project` link `logistics_order`** ↔ `relatedSections.logistics` mismatch — pick one.
8. **Add a per-entity `kpis: []` block** (even empty) so 360 dashboards have a contract.
9. **Add `__contractVersion` field** at the top of `ENTITY_MAP` to enable downstream cache busting / migrations.
10. **Validation:** add a unit test that asserts every `links[i]` is either a key in `ENTITY_MAP` or in an explicit `EXTERNAL_REFS` allow-list — would have caught all broken-links rows above.

---

**End of report. 16/16 entities present and structurally complete; 6 entities under-specified on actions; ~70 links reference entities not defined in this file.**
