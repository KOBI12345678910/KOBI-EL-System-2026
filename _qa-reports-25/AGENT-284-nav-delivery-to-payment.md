# AGENT-284 — NAV #4: Delivery → Invoice → Receipt → Payment

**Agent:** 284
**Scope:** Trace the post-execution cash chain. Verify the four pages exist, are routed, and link to each other in both directions.
**Cross-ref:** Agent 159 reported these pages "do not exist." This audit confirms that claim is **partially false** — pages exist as files and routes — but the **navigation between them is largely missing**, which is what 159 was likely diagnosing.
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`

---

## TL;DR

| Stage | List page | 360/Detail page | Routed in App.tsx | Sidebar entry | Inbound link from prev | Outbound link to next |
|-------|-----------|-----------------|-------------------|---------------|------------------------|------------------------|
| Delivery | YES (list only) | NO 360 page | YES `/delivery-events` | NO direct entry | n/a | NO |
| Invoice  | YES | YES | YES `/finance/invoices`, `/invoices/:id` | YES | NO (from delivery) | NO (to receipt) |
| Receipt  | YES | NO 360 page | YES `/finance/receipts` | YES | YES (invoice picker) | NO (to payment) |
| Payment  | YES | YES | YES `/finance/payments`, `/payments/:id` | YES | YES (back-link to invoice) | n/a |

**Verdict: pages exist, the chain is BROKEN.** Each node is reachable individually from the sidebar, but the operator cannot walk forward from a delivery to its invoice to its receipt to its payment without leaving the entity context.

---

## 1. Page Inventory (canonical `erp-app/src/pages/`)

### 1.1 Delivery
- List: `erp-app/src/pages/execution/DeliveryEventsPage.tsx` — 31-line `GenericListPage` shell. Endpoint `/api/execution/delivery-events`. States: scheduled / in_transit / delivered / confirmed / cancelled.
- Sales-side companion: `erp-app/src/pages/sales/delivery-notes.tsx` — separate "תעודות משלוח" with own CRUD against `/api/delivery-notes`.
- **No DeliveryEvent360 / detail page exists.** Rows are not clickable into a 360.

### 1.2 Invoice
- List: `erp-app/src/pages/finance/invoices.tsx`.
- 360: `erp-app/src/pages/finance/Invoice360.tsx` — full Hebrew RTL page with header, KPIs, embedded lines editor, status timeline, issue/send/void actions. Solid.
- Sales companion: `erp-app/src/pages/sales/sales-invoicing.tsx` against `/api/sales/invoices`.

### 1.3 Receipt
- List: `erp-app/src/pages/finance/receipts.tsx` — searches/links invoices via dropdown picker. Endpoint `/api/finance/ar-receipts`.
- **No Receipt360 / detail page exists.** A side panel inside the list shows the selected receipt, but there is no `/receipts/:id` route.

### 1.4 Payment
- List: `erp-app/src/pages/finance/payments.tsx`.
- 360: `erp-app/src/pages/finance/Payment360.tsx` — header, KPIs, allocations panel, reconcile/refund. Includes back-link to its primary invoice (line 203, 308).

---

## 2. Routing in `erp-app/src/App.tsx`

Concrete `<Route>` entries found:

```
L1361  /delivery-events            → ExecDeliveryEventsPage
L1376  /invoices                   → Redirect to /finance/invoices
L1443  /finance/invoices           → InvoicesPage
L1444  /finance/receipts           → ReceiptsPage
L1923  /sales/delivery-notes       → DeliveryNotesPage
L1956  /finance/payments           → FinPaymentsPage
L2050  /invoices/:id               → FinanceInvoice360       (Tier-1 360)
L2051  /payments/:id               → FinancePayment360       (Tier-1 360)
L2150  /receipts                   → ReceiptsPage            (legacy alias)
```

So the four list/360 routes resolve. There is NO `/delivery-events/:id` route and NO `/receipts/:id` route — those are dead ends as far as deep-linking goes.

---

## 3. Sidebar Wiring (`erp-app/src/components/layout.tsx`)

```
L302  delivery-note         → entitySlug "delivery-note"   (Sales > מכירות)
L303  /sales/delivery-notes → "תעודות משלוח (מתקדם)"        (Sales > מכירות)
L348  /invoices             → "חשבוניות (כללי)"             (Sales)
L422  /finance/invoices     → "חשבוניות"                   (Finance > חייבים)
L423  /finance/receipts     → "קבלות"                      (Finance > חייבים)
L493  /finance/payments     → "תשלומים"                    (Finance > בנקים וקופה)
```

`/delivery-events` (the execution-side list with the state machine scheduled→in_transit→delivered→confirmed) is NOT in the sidebar. The user can only reach it by typing the URL or via the future row-click in WorkOrder360 (which itself does not link to it — see §4.2).

---

## 4. Cross-Link Audit (the actual nav chain)

### 4.1 Delivery → Invoice
- `DeliveryEventsPage.tsx` is a generic list with `state, project_id, work_order_id, delivered_at` columns. **No row click handler. No "Create Invoice" action. No invoice_id field rendered.**
- No outbound `Link`/`navigate` to `/invoices` or `/finance/invoices` anywhere in `DeliveryEventsPage.tsx` or in the sales-side `delivery-notes.tsx`.
- **Status: BROKEN.** Operator finishes a delivery and cannot proceed to billing from the page.

### 4.2 Project/WorkOrder → Delivery (upstream feeder)
- `Project360.tsx` tabs: phases, milestones, risks, blockers, tasks, work_orders. **No delivery / invoice / payment tabs.**
- `WorkOrder360.tsx`: grep for `delivery|invoice|payment|receipt|/finance|/sales` returns zero matches. Walled off.
- The wiring-spec promises `customer.has_many: ['invoice', 'payment', ...]` and `project.has_many: ['invoice', 'payment', ...]` (`onyx-procurement/src/pipeline/wiring-spec.js` L48, L54), but the UI tabs do not honor that.

### 4.3 Invoice → Receipt
- `Invoice360.tsx` actions: Issue, Send, Void. **No "Record Receipt" / "Register Payment" button.**
- Only outbound link is `<Link href="/invoices">` back to the list (L226).
- The wiring-spec defines `'invoice.register_payment'` action mapping to `POST /api/payments` (wiring-spec.js L208) — UI does not surface it.
- **Status: BROKEN.** No invoice → receipt nav.

### 4.4 Receipt → Payment
- `receipts.tsx` does an invoice-picker dropdown (line 336–349) so a receipt links *backward* to an invoice. There is **no link forward to `/payments` or `/finance/payments`**.
- Receipts and payments are modeled as parallel entities here, not sequential.
- **Status: BROKEN** for forward nav.

### 4.5 Payment → Invoice (the only working hop)
- `Payment360.tsx` L203: `<Link href={\`/invoices/${p.invoice_id}\`}>` — primary invoice link in header.
- `Payment360.tsx` L308: per-allocation row links each `invoice_id` to `/invoices/:id`.
- **Status: WORKS.** Backward navigation from payment to invoice is the single hop that is wired correctly.

---

## 5. Endpoint / Data Wiring

| Page | Endpoint | API verified |
|------|----------|--------------|
| Delivery list | `/api/execution/delivery-events` | (assumed; not verified in this audit) |
| Invoice 360 | `/api/v2/finance/invoices/:id`, `/api/v2/finance/invoices/:id/lines`, `.../issue`, `.../void` | matches wiring-spec |
| Receipt list | `/api/finance/ar-receipts` + `/api/finance/customer-invoices` | matches `'invoice.register_payment'` shape |
| Payment 360 | `/api/v2/finance/payments/:id`, `.../allocations`, `.../reconcile`, `.../refund`, `.../allocate` | matches wiring-spec |

API coverage looks complete. The gap is purely UX.

---

## 6. Compared to Master Flow Spec

`onyx-procurement/src/pipeline/pipeline-engine.js` declares the chain:

```
... → Execution → Delivery → Invoice → Payment → Closure
```

The spec lists `delivery, invoice, payment` as adjacent pipeline stages with explicit event triggers (`po_received`, `invoice_issued` — pipeline-engine.js L264-265). The UI honors none of those handoffs as buttons or auto-navigation.

Per CLAUDE.md "No Dead Pages Rule" (Where am I? What can I do? Next step? Related records?): **Delivery, Invoice, and Receipt pages all fail the "Next step" test** for the cash chain.

---

## 7. Reconciling Agent 159's claim

Agent 159 said "Delivery / Invoice / Receipt / Payment do not exist as pages." Strictly: **false** — all four files exist, four routes resolve, three sidebar entries land. What is true is:

- No `DeliveryEvent360` (just a list) → 159 may have meant the 360.
- No `Receipt360` (just a list with side-panel) → same.
- No edge connecting Delivery→Invoice or Invoice→Receipt or Receipt→Payment → operator cannot walk the chain.

So 159's diagnosis is best read as **"the navigation chain doesn't exist,"** not "the pages don't exist."

---

## 8. Recommended Fixes (P0)

1. Add a `/delivery-events/:id` route and a `DeliveryEvent360.tsx`. Include header (status, project_id, work_order_id, delivered_at, received_by_name), Related Records (project, work order, source PO/contract), and a primary action **"הפקת חשבונית"** that POSTs to `/api/invoices` with `{ fromDeliveryId }` and navigates to the new Invoice360.
2. In `Invoice360.tsx`, add primary action **"רישום קבלה"** (post to `/api/finance/ar-receipts`) and **"רישום תשלום"** (post to `/api/payments` per the wiring-spec orchestrator action). On success, navigate to the new receipt/payment 360.
3. In `receipts.tsx`, add a forward link from the side panel to the resulting `/payments/:id` once a payment is recorded.
4. Add `/delivery-events` and a separate "אירועי משלוח" entry under Logistics or Execution in `layout.tsx` so the page is reachable from the sidebar.
5. In `Project360.tsx` and `WorkOrder360.tsx`, add `deliveries`, `invoices`, `payments` tabs as the wiring-spec already declares (`project.has_many: ['invoice','payment',...]`).
6. Add a `Receipt360.tsx` with `/receipts/:id` route to make receipts deep-linkable; today the only way to view one is to scroll the list.

---

## 9. File evidence index

| Concern | File | Line |
|---------|------|------|
| Delivery list (no row-click, no actions) | `erp-app/src/pages/execution/DeliveryEventsPage.tsx` | 1–31 |
| Invoice360 outbound link only goes to list | `erp-app/src/pages/finance/Invoice360.tsx` | 226 |
| Invoice360 actions limited to issue/send/void | `erp-app/src/pages/finance/Invoice360.tsx` | 152–176, 209–224 |
| Payment360 → Invoice link (only working hop) | `erp-app/src/pages/finance/Payment360.tsx` | 203, 308 |
| Receipts list ↔ Invoices picker | `erp-app/src/pages/finance/receipts.tsx` | 336–349 |
| Routes for the four pages | `erp-app/src/App.tsx` | 1361, 1376, 1443, 1444, 1956, 2050–2052 |
| Sidebar wiring | `erp-app/src/components/layout.tsx` | 302–303, 348, 422–423, 493 |
| Pipeline contract (forward chain) | `onyx-procurement/src/pipeline/pipeline-engine.js` | 26–28, 263–275 |
| Action map (invoice→payment, etc.) | `onyx-procurement/src/pipeline/wiring-spec.js` | 184, 191, 206–212 |
