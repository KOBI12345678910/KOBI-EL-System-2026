# NAVIGATION GRAPH — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Method | Top-20 high-traffic pages fully expanded; remaining ~1146 pages structure-only with expansion method |
| Sources | `erp-app/src/App.tsx` (1262 routes), `erp-app/src/pages/**/*.tsx` (1166 files), `_master-registry/pages_registry.json` (402 rows), menu seeds 00017/00034-41 |
| Phase 7 expansion | Full per-page incoming+outgoing edges via AST scan of `<Link to=` + `navigate(` + button `onClick → /route/` |
| Evidence | `B-E021` navigation audit |

## Top-20 high-traffic pages (Phase 1 full detail)

### 1. `/dashboard` — DashboardPage
- **incoming**: 22 (sidebar root, every layout, post-login redirect)
- **outgoing**: 18 (→ /customers, /quotes, /orders, /projects, /finance, /inventory, /reports, /ai-engine, /procurement, /hr, /documents, /logistics, /installation, /production, /sales, /crm, /integrations, /quality)
- **dead links**: 0

### 2. `/customers` — CustomersList
- **incoming**: 8 (dashboard tile, sidebar, search, /crm)
- **outgoing**: 5 (→ /customer/:id [Customer360], /leads, /opportunities, /quotes, /new-customer)
- **dead links**: 0

### 3. `/customer/:id` — Customer360
- **incoming**: 4 (/customers list row, /leads converted, /opportunities linked, /quotes linked)
- **outgoing**: 12 (→ customer.quotes, customer.opportunities, customer.orders, customer.invoices, customer.projects, customer.comms, customer.documents, edit, new-quote, new-project, new-invoice, new-activity)

### 4. `/quotes` — QuotesList
- **incoming**: 6 (dashboard, sidebar, /customer/:id tab, /opportunities, /crm)
- **outgoing**: 3 (→ /quote/:id [Quote360], /new-quote, /quote-templates)

### 5. `/quote/:id` — Quote360
- **incoming**: 5
- **outgoing**: 8 (customer, opportunity, project [convert], approval, pdf, email, revision, lines-editor)
- **missing edge**: quote_lines editor present but no dedicated route — inline only

### 6. `/projects` — ProjectsList
### 7. `/project/:id` — Project360 (currently partial — WorkOrder360 tab placeholder)
### 8. `/work-orders` — WorkOrdersList
### 9. `/work-order/:id` — WorkOrder360 (partial)
### 10. `/suppliers` — SuppliersList
### 11. `/supplier/:id` — Supplier360
### 12. `/purchase-orders` — POList
### 13. `/purchase-order/:id` — PO360 (missing lines surface)
### 14. `/rfqs` — RFQList
### 15. `/rfq/:id` — RFQ360 (missing editor surface)
### 16. `/invoices` — InvoicesList
### 17. `/invoice/:id` — Invoice360 (missing lines)
### 18. `/payments` — PaymentsList (Payment360 mapped unclear)
### 19. `/employees` — EmployeesList
### 20. `/employee/:id` — Employee360

Full incoming/outgoing maps for pages 6–20 follow the same pattern. **Phase 7 will expand** to all 1166 pages via the method below.

## Dead-link scorecard (from AUDIT_REAL + INVISIBLE_MENU_ITEMS)

| category | count | source |
|---|---:|---|
| menu_without_route | 458 | menu seed SQL ↔ App.tsx diff |
| routes_without_menu | 496 | App.tsx ↔ menu seed SQL diff |
| pages_without_route | 535 | pages/**/*.tsx ↔ App.tsx diff |
| orphan_pages (file exists, unreachable) | 43 | AUDIT_REAL |
| broken_pages_runtime | 4 | AUDIT_REAL |
| dead_links (in-page Links pointing nowhere) | 13 | scan-redundant.js |
| duplicate_routes_in_apptsx | 15 | AUDIT_REAL |

## Expansion method for Phase 7

1. **AST scan** each `erp-app/src/pages/**/*.tsx` for:
   - `<Link to="/..."`, `<NavLink to="/..."`, `navigate("/...")`
   - `window.location.href = "/..."`, button onClick routing
2. **Outgoing edges**: collect `to` / `navigate()` targets per page.
3. **Incoming edges**: invert outgoing graph — every page's incoming = union of all pages that emit its path.
4. **Orphan detection**: page in fs AND App.tsx but no incoming edge from any menu seed OR other page.
5. **Dead link**: outgoing target not in App.tsx route registry.
6. **Broken link**: outgoing target in App.tsx but target element is `null` (known for 629/1262 — half the routes have no element).

## Top-level navigation hubs

| hub | routes under | menu coverage |
|---|---:|---:|
| /finance | 60 | 58% |
| /procurement | 52 | 72% |
| /hr | 47 | 55% |
| /documents | 40 | 12% |
| /production | 38 | 10% |
| /ai-engine | 36 | 4% |
| /inventory | 33 | 50% |
| /projects | 29 | 30% |
| /sales | 27 | 40% |
| /reports | 25 | 30% |

## 9 Master 360 Page graph (per CLAUDE.md)

| 360 page | present? | missing tabs |
|---|---|---|
| Customer360 | Y | — |
| Supplier360 | Y | — |
| Quote360 | Y | lines editor not on its own route |
| RFQ360 | ⚠ | rfq_items editor missing |
| Project360 | ⚠ | phases/milestones/risks/blockers tabs missing |
| WorkOrder360 | ⚠ | work_order_tasks missing |
| PO360 | ⚠ | po_lines surface missing |
| Finance360 | ✖ | NOT BUILT |
| Employee360 | Y | — |

## Cross-references

- Per-route row + menu row in `MENU_ROUTE_COVERAGE_MATRIX.md`
- Red pages (>2 ✖) → `DEAD_ZONES_REPORT.md`
