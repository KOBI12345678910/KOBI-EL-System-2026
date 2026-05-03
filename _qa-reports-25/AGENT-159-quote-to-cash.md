# AGENT-159 — Quote-to-Cash End-to-End Trace

**Date:** 2026-04-29
**Agent:** 159
**Scope:** Trace Lead → Quote → Order → Invoice → Receipt across all 4 services
**Verdict:** PARTIAL — every step has CRUD; no step automatically hands off to the next.

---

## Executive Summary

The Quote-to-Cash pipeline is **declared exhaustively in `onyx-procurement/src/pipeline/`** (state machines, orchestrator, workflow flows) but the **declared orchestrator is never mounted** in `server.js`, and the actual REST handlers in `api-server/src/routes/` do **not call the side-effects** the pipeline promises. Each entity exists as an isolated CRUD island; conversions are manual.

Worse: the system has **three parallel quote tables** (`crm_quotes`, public `quotes`, `commercial.quotes`) and **two parallel invoice tables** (`finance.invoices`, `accounts_receivable` / `customer_invoices`) that no route reconciles.

---

## Step-by-Step Trace

### STEP 1 — LEAD

| Aspect | Location |
|---|---|
| Schema | `supabase/migrations/00043_commercial_domain_complete.sql` (commercial.leads) + `crm_leads_ultimate` table |
| Create handler | `api-server/src/routes/crm-ultimate.ts:605` `POST /leads` |
| Read handler | `api-server/src/routes/crm-ultimate.ts:572` `GET /leads`, `:590` `GET /leads/:id` |
| Update handler | `api-server/src/routes/crm-ultimate.ts:629` `PUT /leads/:id` |
| Convert→Customer | `api-server/src/routes/crm-sales-pipeline.ts:1651` `POST /convert-lead/:leadId` |
| State machine | `onyx-procurement/src/pipeline/state-machines.js:14-30` (declared only) |

**Gaps**
- `POST /leads/:id/create-quote` does **not exist**. Workflow step `lead.create_quote` (`onyx-procurement/src/pipeline/orchestrator.js:24`) is declarative; no real route invokes it.
- `crm-ultimate.ts:572-587` builds `WHERE` from raw query params — **SQL injection** (status/source/city/search interpolated unescaped).
- The state-machine `lead → quoted` transition (`state-machines.js:19, 27`) lists `create_quote` as a trigger, but the trigger is never executed because `triggers` are only data — there is no executor wired into the lead PUT/PATCH path.

---

### STEP 2 — QUOTE

| Aspect | Location |
|---|---|
| Schema (CRM) | `crm_quotes` table — used by `crm-ultimate.ts` |
| Schema (commercial) | `commercial.quotes` — referenced by `commercial.sales_orders.quote_id` (`migrations/00043_commercial_domain_complete.sql:140`) |
| Schema (legacy) | public `quotes` (`reports-center.ts:475-478`) |
| Schema (procurement / supplier-side) | `supplier_quotes` (used by `onyx-procurement/server.js:852`) |
| Create handler | `api-server/src/routes/crm-ultimate.ts:843` `POST /quotes` (CRM table) |
| Approve | `api-server/src/routes/quote-builder.ts:395` `POST /quote-builder/discount-approvals/:id/approve` (discount only) |
| Approve→full quote | **MISSING** (no `POST /quotes/:id/approve` exists) |
| Convert→order | **MISSING** (no `POST /quotes/:id/convert-to-order` exists) |
| Convert→project | Declared in `orchestrator.js:62 quote.convert_to_project` — **no HTTP route** |
| State machine | `state-machines.js:32-53` (declared only) |

**Gaps**
- Three quote tables (`crm_quotes`, `quotes`, `commercial.quotes`) and zero migrations or routes that union them.
- Quote-create at `crm-ultimate.ts:886` writes back to lead status `quote_sent` but never updates the lead state machine and never inserts a row in `commercial.quotes` (the table the orders FK expects).
- VAT rate at `crm-ultimate.ts:867` is hardcoded `17` — Israel VAT is **18%** as of 2026 (`commercial.sales_orders.vat_rate` defaults to `0.18`). Inconsistent and a real money bug.
- **Broken handoff:** when a CRM quote is "approved", nothing inserts into `commercial.quotes` so the FK from `commercial.sales_orders.quote_id` is unusable from the CRM flow.

---

### STEP 3 — ORDER (Sales Order)

| Aspect | Location |
|---|---|
| Schema | `supabase/migrations/00043_commercial_domain_complete.sql:135-166` (`commercial.sales_orders`) |
| Mounted at | `api-server/src/routes/index.ts:144` → `router.use("/commercial", commercialRouter)` → `commercial/index.ts:15` `/sales-orders` |
| List | `api-server/src/routes/commercial/sales-orders.ts:55` |
| Create | `api-server/src/routes/commercial/sales-orders.ts:151-209` `POST /` |
| Update | `api-server/src/routes/commercial/sales-orders.ts:214` `PATCH /:id` |
| Transition | `api-server/src/routes/commercial/sales-orders.ts:277-320` `POST /:id/transition` |
| Status set | `draft → confirmed → in_fulfillment → shipped → invoiced → closed` (DB CHECK at `00043:142-143`) |
| State machine ref | NOT in `state-machines.js` (sales_order is missing from the 13 declared machines) |
| Side-effects on confirm | Defined in `api-server/src/lib/automations.ts:33-113` `automationOrderConfirmed` — **never called** (no caller in any route) |

**Gaps**
- **No quote→order conversion endpoint.** `commercial.sales_orders.quote_id` exists in schema but no route populates it. The CRM flow stops at quote-approved.
- `automationOrderConfirmed` (`automations.ts:62`) reserves inventory and creates a draft invoice in `accounts_receivable` — but this function is **dead code**; `grep` finds zero call-sites. Confirm transition in `sales-orders.ts:300` does nothing beyond status update.
- `sales_order` is **missing from `state-machines.js`** entirely (the 13 declared entities cover lead/quote/rfq/po/project/work_order/invoice/employee/attendance/payroll/contract/task/payment/document/alert — but not sales_order).
- The orchestrator never references `sales_order` either — there is no `quote.create_order` or `order.invoice` orchestration in `orchestrator.js`.

---

### STEP 4 — INVOICE

Two parallel implementations, neither linked to `commercial.sales_orders`:

#### Implementation A: `finance.invoices` (the documented schema)

| Aspect | Location |
|---|---|
| Schema | `supabase/migrations/00000_master_schema.sql:1401-1427` |
| FK columns | `customer_id`, `supplier_id`, `project_id`, `po_id` — **no `sales_order_id`** |
| Mount | `api-server/src/routes/finance/index.ts:17` → mounted via `routes/index.ts:806` `/api/v2/finance` |
| Create | `api-server/src/routes/finance/invoices.ts:182-232` `POST /` |
| Update | `api-server/src/routes/finance/invoices.ts:237` `PATCH /:id` |
| Issue | `api-server/src/routes/finance/invoices.ts:284-324` `POST /:id/issue` (draft → issued/sent) |
| Void | `api-server/src/routes/finance/invoices.ts:329` `POST /:id/void` |
| State machine | `state-machines.js:173-200` invoice (declared) — `draft → issued → sent → paid/overdue/in_collection/cancelled` |

#### Implementation B: `accounts_receivable` / `customer_invoices` (the legacy schema actually used by the AR page)

| Aspect | Location |
|---|---|
| Used by | `api-server/src/routes/ar-enterprise.ts` (the route that powers `/finance/invoices` UI) |
| Linked to orders via | `accounts_receivable.sales_order_id` — populated only by dead `automations.ts:71-85` |

**Gaps**
- **Two invoice tables, no route bridges them.** `finance.invoices` has clean state-machine code but the front-end `/finance/invoices` page reads `customer_invoices` (see `global-search.ts:48`, `module-path-aliases.ts:207`).
- `finance.invoices` **has no `sales_order_id` column** — orders cannot be invoiced through the canonical schema without a migration.
- `POST /:id/issue` in `finance/invoices.ts:303` does **not** post to GL or VAT (the state-machine trigger `draft→issued` lists `post_to_gl`/`post_to_vat` at `state-machines.js:186-189` but the route just updates `state`).
- Issuing an invoice does not back-fill `commercial.sales_orders.status = 'invoiced'` despite the order schema's status enum supporting it.
- VAT rate is read from `getVatRateForDate(issueDate)` only in audit notes (`invoices.ts:317`), never applied to the inserted totals — caller is trusted blindly.

---

### STEP 5 — RECEIPT / PAYMENT

Three parallel implementations:

#### A — `finance.payments` (canonical)
| Aspect | Location |
|---|---|
| Schema | `supabase/migrations/00000_master_schema.sql:1461-1481` (FK to `finance.invoices(id)` REQUIRED — `not null`) |
| Mount | `/api/v2/finance/payments` (via `finance/index.ts:18`) |
| Create | `api-server/src/routes/finance/payments.ts:158-200` `POST /` |
| Reconcile | `api-server/src/routes/finance/payments.ts:249-279` `POST /:id/reconcile` (writes `finance.bank_matches`) |
| Allocations | `finance/payments.ts:139-153` `GET /:id/allocations` |
| State machine | `state-machines.js:272-284` `draft → posted → reconciled` (declared) |

#### B — `ar_receipts` (the table the UI actually writes to)
| Aspect | Location |
|---|---|
| Schema | `ar_receipts` (legacy, unmigrated location) |
| List | `api-server/src/routes/ar-enterprise.ts:152` `GET /ar-receipts` |
| Create | `api-server/src/routes/ar-enterprise.ts:166` `POST /ar-receipts` |
| Update / Delete | `ar-enterprise.ts:176, 190` |
| Collect (per AR) | `ar-enterprise.ts:200-217` `POST /ar/:id/collect` — updates `accounts_receivable.paid_amount` and recomputes status |

#### C — `finance.receipts` (orphan)
| Aspect | Location |
|---|---|
| Schema | `supabase/migrations/00000_master_schema.sql:1448-1459` |
| Routes | **NONE** — table exists, zero handlers, dead schema. |

**Gaps**
- `finance.payments` requires `invoice_id NOT NULL` referencing `finance.invoices`, but the live UI writes to `ar_receipts` linked to `accounts_receivable`. The two ledgers never merge.
- **SQL injection in `ar-enterprise.ts:166-217`** — string concatenation in INSERT/UPDATE/DELETE with raw user fields (`amount`, `bankAccount`, `checkNumber`, `notes`).
- `payments.ts:79-115` also string-concatenates in `LIST` query (`q`, `state`, `payment_method`, etc.) — even after Zod parsing, the WHERE clause is built via `sql.raw` with manual `'g/'` escaping at line 86. SQL-injection-adjacent.
- `POST /:id/reconcile` at `payments.ts:269-271` writes `finance.bank_matches` but does NOT update `finance.invoices.paid_total` or `balance_due` — invoice balance is not reduced by reconciled payments.
- `automationInvoicePaid` (`automations.ts:126-169`) creates an `ar_receipts` row when an AR invoice is marked paid — but it's **never called** (no route emits the `invoice:paid` event). The "create cash receipt" promise is unfulfilled.

---

## Service Mapping vs Reality

CLAUDE.md declares 4 services. Actual ownership of Quote-to-Cash:

| Service | Declared role | Reality |
|---|---|---|
| TECHNO_KOL_OPS (3200) | Operational hub | Only 11 routes total in `techno-kol-ops/src/index.ts` — none for leads/quotes/orders/invoices/payments. **Empty hub.** |
| ONYX_PROCUREMENT (3100) | Finance & Procurement | Owns supplier-side RFQ/PO/supplier_invoice. The 6 pipeline modules under `src/pipeline/*.js` are **declarative only** — never `require()`d by `server.js`. |
| api-server (separate Express app) | (undeclared in CLAUDE.md) | Actually owns leads/quotes/orders/invoices/payments. Single point of truth for Quote-to-Cash. |

The whole pipeline-engine framework in `onyx-procurement/src/pipeline/` (orchestrator, workflow-flows, state-machines, entity-map, wiring-spec) is **architectural documentation rendered as JS code** — not executed at runtime.

---

## Broken Handoffs Summary

| From → To | Promised by | Actually wired? |
|---|---|---|
| Lead → Quote | `orchestrator.js:24 lead.create_quote` | NO route. Manual `POST /quotes` with `lead_id`. |
| Quote (CRM) → Quote (commercial) | (implicit by FK `sales_orders.quote_id → commercial.quotes`) | NO. Three quote tables, zero sync. |
| Quote → Order | `orchestrator.js:62 quote.convert_to_project` (project, not order) | NO. `commercial.sales_orders.quote_id` populated only manually. |
| Order confirmed → AR draft | `automations.ts:33 automationOrderConfirmed` | NO. Function never called. |
| Order → Invoice | `state-machines.js:104-147 project.in_delivery→completed` triggers `create_invoice` | NO. `finance.invoices` has no `sales_order_id` FK; `automations.ts:67` writes to `accounts_receivable` instead. |
| Invoice issued → GL/VAT post | `state-machines.js:186-189 invoice.draft→issued` | NO. `finance/invoices.ts:303-312` only flips state. |
| Invoice paid → Receipt | `automations.ts:126 automationInvoicePaid` | NO. Never called. |
| Payment → Invoice balance | `state-machines.js:192-197 invoice.sent→paid` | NO. `payments.ts:269` does not update `invoices.paid_total`. |
| Payment reconcile → cashflow | `orchestrator.js:203 payment.reconcile` | PARTIAL. Writes `bank_matches` but no cashflow side-effect. |

---

## Recommendations (P0)

1. **Add a real conversion route**: `POST /commercial/quotes/:id/convert-to-order` — single transaction that inserts into `commercial.sales_orders` with `quote_id` set, copies line items, transitions quote.
2. **Add `sales_order_id` to `finance.invoices`** + `POST /sales-orders/:id/invoice` route that creates the invoice header/lines and sets order status to `invoiced`.
3. **Wire `automations.ts`** — call `automationOrderConfirmed` from `sales-orders.ts:300` when transition target is `confirmed`; call `automationInvoicePaid` from `payments.ts:reconcile`.
4. **Reconcile the dual ledgers** — pick `finance.invoices` OR `accounts_receivable`/`customer_invoices` and migrate the other away. Currently both UIs and APIs write to different tables.
5. **Fix SQL injection** in `crm-ultimate.ts` (`/leads`, `/quotes` LIST), `ar-enterprise.ts` (`/ar-receipts` writes), and `payments.ts:79-115` LIST.
6. **Fix VAT rate**: `crm-ultimate.ts:867` hardcodes `17` — should use `getVatRateForDate()` like `finance/invoices.ts:317` references.
7. **Mount the pipeline modules** in `onyx-procurement/server.js` or remove them — currently they're misleading dead architecture.

---

## Files Touched in This Trace

- `onyx-procurement/src/pipeline/workflow-flows.js`
- `onyx-procurement/src/pipeline/state-machines.js`
- `onyx-procurement/src/pipeline/orchestrator.js`
- `onyx-procurement/src/pipeline/entity-map.js`
- `onyx-procurement/server.js`
- `techno-kol-ops/src/index.ts`
- `api-server/src/routes/crm-ultimate.ts`
- `api-server/src/routes/crm-sales-pipeline.ts`
- `api-server/src/routes/quote-builder.ts`
- `api-server/src/routes/commercial/sales-orders.ts`
- `api-server/src/routes/commercial/index.ts`
- `api-server/src/routes/finance/invoices.ts`
- `api-server/src/routes/finance/payments.ts`
- `api-server/src/routes/finance/index.ts`
- `api-server/src/routes/ar-enterprise.ts`
- `api-server/src/routes/index.ts`
- `api-server/src/lib/automations.ts`
- `supabase/migrations/00000_master_schema.sql`
- `supabase/migrations/00043_commercial_domain_complete.sql`
