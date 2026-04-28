# AGENT-204 — Page-to-Page Navigation Flow Audit

**Date:** 2026-04-29
**Scope:** Master Flow per CLAUDE.md
`Lead → Quote → Order → Project → WorkOrder → Procurement → Inventory → Execution → Delivery → Invoice → Payment → Closure`
**Method:** Static review of route registry, App.tsx, 360 pages and their `navigate(...)` calls.

---

## 1. Pages Audited

| Stage         | Route in App.tsx                | Component                                              |
|---------------|---------------------------------|--------------------------------------------------------|
| Lead          | (none)                          | **MISSING** — no Lead360, no `/lead/:id` route         |
| Customer      | `/360/customer/:id`             | `pages/360/Customer360` (also `features/customers/`)   |
| Quote         | `/360/quote/:id`                | `pages/360/Quote360` / `features/quotes/Quote360`      |
| Order         | (none)                          | **MISSING** — no Order360, no `/order/:id` route       |
| Project       | `/360/project/:id`, `/project360/:id` | `pages/360/Project360`, `features/projects/Project360` |
| WorkOrder     | `/360/work-order/:id`, `/work-order360/:id` | `WorkOrder360`                                |
| RFQ           | `/360/rfq/:id`                  | `RFQ360`                                               |
| PO            | `/360/po/:id`                   | `PO360`                                                |
| Supplier      | `/360/supplier/:id`             | `Supplier360`                                          |
| Inventory     | (no detail page)                | `Materials.tsx` list only                              |
| Delivery      | (none)                          | **MISSING** — no shipment/delivery 360 page            |
| Invoice       | `/360/finance/:id`              | `Finance360` (acts as Invoice360)                      |
| Payment       | (none)                          | **MISSING** — no payment 360 page or route             |
| Closure       | (none)                          | **MISSING** — handled via state, no dedicated page     |

Routes confirmed in `techno-kol-ops/client/src/App.tsx` (lines 100-151) and
`techno-kol-ops/client/src/router/routeRegistry.ts`.

---

## 2. Stage-by-Stage Audit

Legend: NAV = next-step button present · ID = next page accepts ID via `:id` or `?<entity>=` ·
BC = breadcrumb shown · REL = related-records section present.

### Lead → Quote
- **NAV:** N/A — no Lead page exists.
- **ID:** N/A.
- **BC:** N/A.
- **REL:** N/A.
- **Defined in flow spec** (`workflow-flows.js` step 2: `lead.create_quote`) but no UI implementation.
- **Gap:** Build `Lead360` with `+ הצעת מחיר חדשה` → `/quote/new?lead=:id`.

### Customer → Quote
- **NAV:** YES — `Customer360.tsx:54` button `הצעת מחיר חדשה` →
  `navigate('/quote/new?customer=' + id)`. Row click on quotes table →
  `/quote/${r.id}` (line 69).
- **ID:** YES (query string + URL param).
- **BC:** **NO** — no breadcrumb component anywhere; only `header` + `subtitle`.
- **REL:** YES — Quotes / Projects / Invoices / Documents tables.

### Quote → Order
- **NAV:** PARTIAL — `Quote360.tsx:36` shows `המר להזמנה` button but
  `onClick={() => {}}` is a stub.
- **ID:** N/A — order entity has no route.
- **BC:** **NO**.
- **REL:** Lines + Documents only. No "linked project" or "next step" panel.
- **Gap:** Wire convert action to call `POST /api/orchestrator/execute`
  with `quote.convert_to_project` (per `workflow-flows.js` step 4) and
  navigate to `/360/project/<new_id>`.

### Quote → Project (de-facto since no Order layer)
- **NAV:** **NO direct button.** Customer360 has `+ פרויקט חדש` but Quote360
  does not. The system's actual Master Flow per `workflow-flows.js` is
  Quote → Project (skipping Order), so the missing button is a real gap.
- **ID:** Customer-level link works (`/project/new?customer=:id`); quote-to-project
  link does not.
- **BC:** **NO**.
- **REL:** Quote shows no related project after conversion.

### Project → WorkOrder
- **NAV:** YES — `Project360.tsx:35` button `הזמנת עבודה` →
  `navigate('/work-order/new?project=' + id)`. Row click on work-orders table →
  `/work-order/${r.id}` (line 46).
- **ID:** YES via query + path param.
- **BC:** **NO**.
- **REL:** Work-orders, Purchase-orders, Documents.
- **Note:** App route is `/360/work-order/:id` but Project360 navigates to
  `/work-order/:id` (no `/360` prefix). Same pattern for `/po/:id` vs
  `/360/po/:id`. Likely **broken links** unless a redirect exists.

### Project → Procurement (PO)
- **NAV:** YES — `Project360.tsx:36` button `הזמנת רכש` →
  `navigate('/po/new?project=' + id)`. Row click on POs → `/po/${r.id}`.
- **ID:** YES.
- **BC:** **NO**.
- **REL:** YES (PO table on project).
- **Bug:** routes in App.tsx are `/360/po/:id`; Project360 links to `/po/:id`
  → 404 / NotFound page.

### WorkOrder → Procurement
- **NAV:** PARTIAL — `WorkOrder360.tsx:36` shows `בקשת חומרים` stub
  (`onClick={() => {}}`).
- **ID:** N/A.
- **BC:** **NO**.
- **REL:** Tasks, Materials, Documents.
- **Gap:** Wire to material-request → RFQ flow. The WorkOrder page also has
  no link to its parent `Project` or `Customer` (subtitle shows names but they
  are not clickable).

### Procurement → Inventory
- **NAV:** **NO button** on PO360 to navigate to inventory/receipt.
  `PO360.tsx:35-36` actions `אשר` and `שלח לספק` are both stubs.
- **ID:** N/A — no inventory item page.
- **BC:** **NO**.
- **REL:** Receipts table on PO360 (line 47-52) lists receipt rows but
  rows are not clickable (no `onRowClick` set).

### Inventory → Execution (WorkOrder consumption)
- **NAV:** N/A — no inventory item detail page exists.
- **ID:** N/A.
- **BC:** N/A.
- **REL:** Materials list page (`Materials.tsx`) is not entity-detail.
- **Gap:** Per `workflow-flows.js` flow 3, step 2 `inventory.reserve_for_project`
  needs a UI surface.

### Execution → Delivery
- **NAV:** **NO** — no delivery page at all.
- **ID:** N/A.
- **BC:** N/A.
- **REL:** N/A.
- **Gap:** Either build Delivery360 or fold into WorkOrder completion flow.

### Delivery → Invoice
- **NAV:** Indirect — Customer360 has `+ חשבונית חדשה` →
  `/finance/new?customer=:id`. Project360 has no "Create Invoice" button.
- **ID:** Customer link works.
- **BC:** **NO**.
- **REL:** Invoices on Customer360, but no link from Project to Invoice.
- **Gap:** Per `workflow-flows.js` flow 4 step 1 `project.mark_billable`
  should show on Project360.

### Invoice → Payment
- **NAV:** **NO action button** on Finance360 (`Finance360.tsx` has no
  `ActionBtn` at all — actions stripped out vs. other 360 pages).
- **ID:** N/A — no payment detail route.
- **BC:** **NO**.
- **REL:** Payments table on Finance360 (line 41) but rows not clickable
  (no `onRowClick`).
- **Gap:** Per spec, `payment.register` is a real action. UI is missing.

### Payment → Closure
- **NAV:** N/A.
- **ID:** N/A.
- **BC:** N/A.
- **REL:** N/A.
- **Gap:** Closure is implicit (state transitions on Project / Invoice).
  No "Close" button is wired on any 360 page; subsequent `bank_match.reconcile`
  per flow 4 step 4 has no UI either.

---

## 3. Cross-Cutting Findings

### 3.1 Breadcrumbs — UNIVERSAL GAP
No breadcrumb component exists in `techno-kol-ops/client/src/components/`
(grep for `Breadcrumb` returns only `DocumentManagement.tsx` text mention).
`Page360` wrapper (`shared360.tsx:8-25`) renders only header + subtitle + status —
no parent-trail. Subtitle on WorkOrder360 shows "ProjectName · CustomerName"
as plain text, **not as clickable links**. Same for PO360 (`supplier_name · order_date`)
and Quote360 (`customer_name · quote_date`).

### 3.2 Route Prefix Mismatch — LIKELY BUG
App.tsx registers `/360/<entity>/:id` (line 136-144) but every 360 page
navigates with the un-prefixed form: `/quote/${id}`, `/project/${id}`,
`/work-order/${id}`, `/po/${id}`, `/supplier/${id}`. The `routeRegistry.ts`
file uses the un-prefixed paths (`/quote/:id`, etc.) but `App.tsx`
hand-rolls the routes with the `/360` prefix and never reads
`appRouteRegistry`. Result: every cross-page link in 360 components
hits the `*` NotFound route.

### 3.3 Stub Actions
Across PO360, Quote360, WorkOrder360, Employee360, Supplier360, RFQ360,
Finance360 — primary action buttons are `onClick={() => {}}` empty stubs.
None call `POST /api/orchestrator/execute` from the spec. Only Customer360,
Project360, and Supplier360 have real `navigate(...)` actions.

### 3.4 Missing 360 Pages vs CLAUDE.md
CLAUDE.md lists 9 P0 360 pages; all 9 exist. But the Master Flow contains
**Lead, Order, Inventory, Delivery, Payment, Closure** stages with **no
detail pages**. Either the flow needs to compress those stages or new
360 pages are required.

### 3.5 Related-Records Coverage
| Page         | Related Records Present                                         |
|--------------|------------------------------------------------------------------|
| Customer360  | Quotes, Projects, Invoices, Documents, Insights, Audit          |
| Quote360     | Lines, Documents, Audit (no Customer link, no derived Project)  |
| Project360   | Work Orders, Purchase Orders, Documents, Audit (no Quote, no Invoices) |
| WorkOrder360 | Tasks, Materials, Documents, Audit (no Project link, no PO link) |
| PO360        | Lines, Receipts, Documents, Audit (no Project link, no Supplier link) |
| RFQ360       | Suppliers, Documents, Audit                                     |
| Supplier360  | POs, Documents, Audit                                           |
| Employee360  | Wage slips, Attendance, Leave, Documents, Audit                 |
| Finance360   | Lines, Payments, Documents, Audit (no Customer link, no Project link) |

Most pages omit upstream parent links (Quote→Project, Project→Quote, PO→Project, Invoice→Project).

---

## 4. Severity Summary

| Severity | Count | Items                                                                |
|----------|-------|----------------------------------------------------------------------|
| Critical | 1     | Route prefix mismatch (`/quote/:id` vs `/360/quote/:id`) breaks all cross-360 navigation. |
| High     | 5     | Missing Lead360, Order360, Payment360, Delivery360 pages; no breadcrumbs anywhere. |
| Medium   | 7     | Stub action buttons on 6 pages; missing upstream parent links on 4 pages. |
| Low      | 3     | Receipt rows / Payment rows / Quote-converted-to-project not clickable. |

---

## 5. Recommended Fixes (priority order)

1. **Fix route prefix** — choose either `/360/<entity>/:id` (App.tsx) or
   `/<entity>/:id` (routeRegistry.ts) and rewrite navigate calls to match.
   Wire App.tsx to consume `appRouteRegistry` instead of inlining routes.
2. **Add `<Breadcrumb>` to `Page360`** — render parents from `subtitle` props
   as `<Link>`s, e.g. WorkOrder360 → Project → Customer.
3. **Build Lead360 + `/lead/:id` route** — first stage of pipeline.
4. **Wire stub actions** to `POST /api/orchestrator/execute` per
   `orchestrator.js` (18 actions defined).
5. **Add upstream-parent related blocks** — every child page should link
   back to its creator (Quote → Customer, Project → Quote, PO → Project,
   Invoice → Project, WorkOrder → Project).
6. **Add Payment360, Delivery/Shipment360** — or fold into Finance360 /
   WorkOrder360 with a clear sub-tab.
7. **Make all related-table rows clickable** where target page exists.

---

**End of report.**
