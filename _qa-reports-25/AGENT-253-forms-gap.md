# AGENT-253 — Forms Gap Inventory (CREATE / EDIT)

**Scope:** all client apps in the worktree (`erp-app`, `techno-kol-ops/client`, `payroll-autonomous`, `onyx-procurement/web`, `desktop-tutorial-client`).
**Method:** filesystem scan of `**/*Form*.tsx|jsx`, page-level `<form>` / `onSubmit=` usage, plus cross-check against `app.post('/api/...')` route registrations. Archive trees (`_merge-incoming`, `_merge-staging-final`) excluded.
**Date:** 2026-04-29.

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| Dedicated form components found (active code) | 13 |
| Inline page-level forms (active code) | ~12 |
| Master-Flow entities lacking a CREATE/EDIT form | **8 of 16** |
| Forms with client-side validation beyond `required` | 2 / 13 |
| Forms wired to a real save endpoint | 6 / 13 |
| Forms whose endpoint is **MISSING on the server** | 4 / 13 |

**Verdict:** the only fully-wired forms are in `erp-app` (Customer, Lead, Product, Project, Task) using the generic `entityCreate/entityUpdate` against `/api/:entity`. **Supplier, Employee, Quote, RFQ, Purchase Order, Work Order, Invoice (server-side persistence), and Payment have no working CREATE/EDIT UI** anywhere in the active code — list pages exist but the "+ New" buttons are dead (no `onClick`, no modal, no API call).

---

## 2. Per-Service Form Inventory

### 2.1 erp-app (the only app with a real form library)

Location: `erp-app/src/components/forms/`

| # | Form file | Modes | Save wiring | Endpoint | Endpoint exists? | Validation | Field-completeness vs. entity-map |
|---|---|---|---|---|---|---|---|
| 1 | `customer-form.tsx` | CREATE+EDIT (sheet) | `onSave(formData)` → caller invokes `entityCreate("customers", …)` (e.g. `pages/customer-management.tsx`) | `POST /api/customers`, `PATCH /api/customers/:id` | NOT in `onyx-procurement/server.js` (only `suppliers`, `quotes`, `rfq`, `purchase-orders`, `subcontractors`, `purchase-requests`); **relies on a generic `/api/:entity` handler that is not visible in the codebase** | `required` HTML attr only; no zod/yup; no email regex despite `type="email"`; no tax_id check (Israeli ח.פ. 9-digit) | name, company, email, phone, address, city, type, status, tax_id, payment_terms, credit_limit, notes, assigned_to. **MISSING per `entity-map.js`**: contact persons array, billing address vs. shipping address, currency, language, segmentation tags, parent customer, KYC docs |
| 2 | `lead-form.tsx` | CREATE+EDIT | same pattern; also `lead-creation-form.tsx` calls `entityCreate("leads", …)` directly | `POST /api/leads` | same generic-route gap | `required` only; no phone regex | name, company, email, phone, source, status, estimated_value, notes, assigned_to, next_followup. **MISSING**: lead score, qualification BANT fields, last touch, UTM/source detail, product interest |
| 3 | `product-form.tsx` | CREATE+EDIT (3 tabs) | `onSave(formData)` → `entityCreate/Update("products", …)` | `POST /api/products` | not on server.js (generic) | `required` only; no SKU uniqueness, no negative-stock guard | name, sku, description, category, type, unit_price, cost_price, qty_in_stock, min_stock_level, unit, tax_rate, is_active, image_url, supplier_id. **MISSING**: barcode/EAN, max_stock, lead_time, manufacturer, country_of_origin, HS code, weight/dims |
| 4 | `project-form.tsx` | CREATE+EDIT | `onSave(formData)` → `entityCreate/Update("projects", …)` | `POST /api/projects` | not on server.js (generic) | `required` only | name, description, customer_id, status, priority, start_date, end_date, budget, progress, manager. **MISSING per `entity-map.Project`**: site address, work_orders array, milestones, contract_value vs. budget, billing_type (T&M / fixed), profitability target, RAG status |
| 5 | `order-form.tsx` | CREATE+EDIT (line items array) | `onSave(formData)` | `POST /api/orders`? | not on server.js (no `/api/orders` route found anywhere) | `required` only; **no totals validation**; VAT computed client-side via `VAT_RATE` import | customer_id, customer_name, status, items[product_id, quantity, unit_price, discount], shipping_address, shipping_date, delivery_date, notes. **MISSING**: order_number, payment_terms, currency, tax_breakdown, related_quote_id |
| 6 | `invoice-form.tsx` | CREATE+EDIT (line items) | `onSave(formData)` | `POST /api/invoices` | not in server.js | `required` only; no due_date >= issue_date check; no line-total reconciliation | customer_id, type (invoice/receipt/credit_note), status, items[], due_date, payment_method, notes. **MISSING (legal!)**: invoice_number sequence, issue_date, VAT breakdown rows, allocation to PO/order, **דוח 6111** classification, אישור ניהול ספרים, withholding tax, currency+exchange rate |
| 7 | `customer-form-template.tsx` | template (read-only schema renderer) | n/a | n/a | — | — | — |
| 8 | `invoice-form-template.tsx` | template | n/a | n/a | — | — | — |
| 9 | `sales-order-form-template.tsx` | template | n/a | n/a | — | — | — |
| 10 | `image-uploader.tsx` | partial (file input) | uploads via prop callback | depends on caller | depends | mime/size? not enforced | n/a |
| 11 | `tasks/task-form.tsx` | CREATE+EDIT modal | calls `entityCreate("tasks")` / `entityUpdate("tasks", …)` directly | `POST /api/tasks` | not on server.js | only `if (!title) alert(…)` | title, description, priority, status, due_date, assigned_to, related_entity_type, related_entity_id, tags. Field set is reasonable. |
| 12 | `customfields/field-form.tsx` | CREATE+EDIT (admin) | `onSave` callback | unspecified | — | none | key, label, field_type, required, description, section, options.choices |
| 13 | `leads/lead-creation-form.tsx` | CREATE only | `entityCreate("leads", …)` + activity log | same `/api/leads` | same gap | name+phone required, no regex | smaller subset of `lead-form.tsx` (5 fields) |

**Form builder** at `erp-app/src/pages/builder/{form-builder.tsx, dynamic-form-renderer.tsx, form-field-components.tsx}` is admin-only — not a business CREATE/EDIT form, just a tool to construct them.

### 2.2 techno-kol-ops/client (the operational hub at port 3200)

Forms found in active code:

| # | Form / Page | Modes | Save wiring | Endpoint | Endpoint exists in `techno-kol-ops/src/routes/`? | Validation | Status |
|---|---|---|---|---|---|---|---|
| 1 | `components/VacationRequestForm.tsx` | CREATE only (employee absence request) | `AbsenceStore` (in-memory engine in `engines/hoursAttendanceEngine`); **no HTTP POST** | none | n/a (local store) | reason required for vacation/sick/personal, dates checked, working-days computed | works in-process, **does not persist to server** |
| 2 | `pages/HoursAttendance.tsx` (inline "הוספת רישום שעות חדש" panel) | CREATE only | also via `AbsenceStore`/engine | none | n/a | required-marked fields | local-only |
| 3 | `pages/HoursAttendance.tsx` ("הגשת בקשה חדשה") | CREATE only | local engine | none | n/a | partial | local-only |
| 4 | `pages/Documents.tsx` | upload form (signed contract) | calls `/api/signatures/documents/...` | `routes/signatures.ts` POST `/documents`, `/documents/client-contract`, `/documents/employee-contract` | YES | type-pick required | wired |
| 5 | `pages/DocumentManagement.tsx` ("העלאת מסמך חדש") | upload | calls `/api/documents` | `documents` route exists in server | partial | partial | wired (upload only — no metadata required) |
| 6 | `pages/360/Customer360.tsx` action bar | navigation only (`/quote/new?customer=…`, `/project/new?customer=…`, `/finance/new?customer=…`) | the destination routes **do not exist** in the React router | — | — | — | **dead links** |
| 7 | `pages/Clients.tsx` "+ לקוח חדש" button | **no `onClick`** | none | `POST /api/clients` exists in `routes/clients.ts` | — | — | **dead button** — endpoint exists, no UI to reach it |
| 8 | `pages/Employees.tsx` "+ עובד חדש" button | **no `onClick`** | none | `POST /api/employees` exists in `routes/employees.ts` | — | — | **dead button** |
| 9 | `pages/WorkOrders.tsx` | list + detail modal, **no create form** | n/a | `POST /api/work-orders` exists | — | — | **endpoint orphaned** |
| 10 | `pages/Materials.tsx` | inline form | `POST /api/materials` (exists in `routes/materials.ts`) | yes | partial | wired |
| 11 | `pages/Schedule.tsx` | inline form (task scheduling) | `POST /api/tasks` (exists in `routes/tasks.ts`) | yes | partial | wired |
| 12 | `pages/Pipeline.tsx` | inline | `POST /api/pipeline` (exists) | yes | partial | wired |

**Server-side routes WITHOUT a UI form:** `/api/clients`, `/api/employees`, `/api/work-orders`, `/api/suppliers` (POST in `routes/suppliers.ts`), `/api/financials`, `/api/leads`. The backend is ahead of the UI by ~6 endpoints.

### 2.3 payroll-autonomous (port 5173 — Workforce & Salary)

Forms found:

| # | Form | Modes | Save | Endpoint | Validation | Notes |
|---|---|---|---|---|---|---|
| 1 | `components/ExpenseSubmit.jsx` | CREATE+EDIT (expense report with line items, OCR, mileage, per-diem) | injected `api` prop (e.g. `api.createReport`, `api.addLine`, `api.submitReport`, `api.attachReceipt`) → ultimately `onyx-procurement/src/expenses/expense-manager.js` | depends on caller wiring | line-level VAT split, policy-violation panel, duplicate hint, multi-currency conversion | The most complete form in the whole repo. But `api` must be injected — there is no default wire-up so calls **work only when host provides it**. |
| 2 | `components/FormulaBuilder.tsx` | builder UI (admin) | callback | n/a | formula-syntax check | not a business CREATE form |
| 3 | `components/SupplierPortal.jsx`, `CustomerPortal.jsx`, `TenantPortal.jsx` | self-service portals (login + minimal forms) | `<form onSubmit>` to portal API | unverified | partial | demo-grade |
| 4 | `components/AdminPanel.tsx` | admin form | `<form onSubmit>` | unverified | partial | admin only |

**No CREATE form for**: Employee profile, payroll entry adjustment, tax-form-101 wizard, garnishment, severance calc input, bonus, vacation balance correction. The engine logic exists in `src/admin/`, `agents/`, etc., but UI to feed it is missing.

### 2.4 onyx-procurement/web (static dashboards)

`web/` contains **dashboards only** (`po360.html`, `rfq360.html`, `quote360.html`, `supplier360.html`, `customer360.html`, `entity360.html`, `pipeline-dashboard.html`, `vat-dashboard.html`, `bank-dashboard.html`, `annual-tax-dashboard.html`, `onyx-dashboard.html`). **Zero CREATE/EDIT forms.**

Server endpoints that have no form anywhere in the system:
- `POST /api/suppliers` (server.js:605)
- `POST /api/suppliers/:id/products` (server.js:623)
- `POST /api/purchase-requests` (server.js:652)
- `POST /api/quotes` (server.js:852)
- `POST /api/subcontractors` (server.js:1400)
- `POST /api/rfq/send`, `/api/rfq/:id/decide` — wired only via `pages/procurement/po-approval-workflow.tsx` and `po-approvals.tsx` in `erp-app`.

### 2.5 desktop-tutorial-client (legacy)

Pages: `Suppliers.jsx`, `Invoices.jsx`, `Categories.jsx`, etc. — list views with `Modal.jsx` shell but no dedicated form components for entity CRUD. Not part of the production stack per `CLAUDE.md` (the 4 services are Ops/Procurement/Payroll/AI).

---

## 3. Master-Flow Entity Coverage

`pipeline/entity-map.js` declares 16 entities. Form coverage:

| Entity | CREATE form | EDIT form | Save endpoint | Verdict |
|---|---|---|---|---|
| Customer | erp-app `customer-form.tsx` | yes | wired (generic) | OK in erp-app, **dead button** in techno-kol-ops |
| Lead | erp-app `lead-form.tsx` + `lead-creation-form.tsx` | yes | wired | OK |
| Quote | — | — | server `POST /api/quotes` exists; UI navigates to `/quote/new` route that does not exist | **MISSING** |
| RFQ | — | — | server route exists | **MISSING** |
| Purchase Order | partial via `po-approval-workflow.tsx` (approve action only — not create) | — | server routes exist | **MISSING create UI** |
| Project | erp-app `project-form.tsx` | yes | wired (generic) | OK |
| Work Order | — | — | server route exists | **MISSING** |
| Supplier | — (no `supplier-form.tsx` in active tree) | — | server route exists | **MISSING** |
| Inventory item / Product | erp-app `product-form.tsx` | yes | wired | OK |
| Goods Receipt | inline page only (`goods-receipt.tsx`) — list, no form | — | — | **MISSING** |
| Invoice | erp-app `invoice-form.tsx` | yes | wired | OK shape, **legal fields missing** (sequence, withholding, 6111 code) |
| Payment | — | — | — | **MISSING** |
| Employee | — | — | server route exists | **MISSING** |
| Order (sales) | erp-app `order-form.tsx` | yes | endpoint not on server | **endpoint gap** |
| Task (cross-cutting) | erp-app `task-form.tsx`, techno-kol-ops Schedule | yes | wired in TKO | OK |
| Document | techno-kol-ops upload modal | partial | wired | OK |

**8 of 16 master entities have no functional CREATE/EDIT form.**

---

## 4. Cross-Cutting Quality Gaps

1. **Validation:** No schema library (zod/yup/joi/valibot) is imported by any form file, despite `@hookform/resolvers` being present in `node_modules`. Validation is HTML-`required` only. No regex for: Israeli ID/ח.פ., IBAN, phone (`05X-XXXXXXX`), email beyond `type=email`, tax_id length (9 digits), date ranges (`end >= start`), positive money, line-total reconciliation.
2. **Optimistic ↔ pessimistic:** all forms call `onSave` and close — no error handler if the API rejects. Only `tasks/task-form.tsx` and `leads/lead-creation-form.tsx` actually try/catch and show an alert.
3. **Audit-log fields:** no form populates `created_by`, `updated_by`, `tenant_id`. Server must inject — but per `CLAUDE.md` there is no visible middleware doing it.
4. **State machine integration:** none of the CREATE forms call `state-machines.js` transitions or `orchestrator.execute(action)` — they write raw entities. This bypasses the 91 declared transitions.
5. **i18n:** all labels hard-coded Hebrew. No `i18n` keys despite `lib/i18n-strings.ts` and `locales/` existing.
6. **Empty-state buttons that go nowhere:** `techno-kol-ops/client/src/pages/{Clients, Employees, WorkOrders}.tsx` and the action buttons inside every `pages/360/*.tsx` declare a "+ New" action but the target form is not implemented (no `onClick`, no `navigate` target reachable, or `navigate('/quote/new')` to a route that has no route entry).
7. **No Supplier form anywhere** — despite Supplier360 being one of the 9 P0 master pages.

---

## 5. Concrete Missing Forms (Priority List)

P0 (block the Master Flow):
1. **SupplierForm** — name, tax_id, contact, terms, bank, products, certifications, KYC.
2. **QuoteForm** — customer, items, validity, terms, currency, attached PDFs, state=draft.
3. **RFQForm** — items, target suppliers, deadline, evaluation criteria.
4. **PurchaseOrderForm** — supplier, items, ship-to, payment terms, linked PR/RFQ.
5. **WorkOrderForm** — project, scope, scheduled dates, assigned crew, materials reservation.
6. **EmployeeForm** — id (תז), bank, pension fund, kupat-gemel, deductions, Form-101 fields.
7. **PaymentForm** — invoice link, method, amount, date, withholding, attachments.
8. **GoodsReceiptForm** — PO link, lines received, condition, photo, signature.

P1:
9. Employee absence approval (manager side) — counterpart to `VacationRequestForm`.
10. Quote → Order conversion confirmation modal.
11. Invoice "from project actuals" wizard.
12. Bank reconciliation match form.

---

## 6. Files Worth Re-reading

- `erp-app/src/components/forms/` (10 files)
- `erp-app/src/lib/entity-api.ts` (the generic `/api/:entity` wrapper — server side of this is the unverified gap)
- `techno-kol-ops/client/src/pages/{Clients,Employees,WorkOrders,Pipeline,Materials,Documents,HoursAttendance}.tsx`
- `techno-kol-ops/client/src/components/VacationRequestForm.tsx`
- `techno-kol-ops/client/src/pages/360/*.tsx` (action bars with dead navigates)
- `techno-kol-ops/src/routes/{clients,suppliers,employees,workOrders,leads,materials,tasks,financials,signatures,pipeline}.ts`
- `payroll-autonomous/src/components/ExpenseSubmit.jsx`
- `onyx-procurement/server.js` lines 605, 623, 652, 688, 852, 942, 1212, 1267, 1400, 1432
- `onyx-procurement/src/pipeline/entity-map.js` (definition of every required field)

---

## 7. Bottom Line

The system has **list views and 360 dashboards everywhere, but data entry is mostly missing**. Of 16 declared master entities, only 5 have a working CREATE/EDIT path (Customer, Lead, Product, Project, Task, all in `erp-app`). The hub service (techno-kol-ops) has the **server endpoints in place** but not the React forms — every "+ New" button on its list pages is wired to nothing. Payroll has only one real form (ExpenseSubmit) and procurement has zero. Even the wired forms ship without a validation library, without state-machine integration, and without audit-stamping — meaning that "save" and "save correctly" are still two different things.
