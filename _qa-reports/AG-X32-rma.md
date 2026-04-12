# AG-X32 — Returns & RMA Engine
**Agent:** X-32 | **Swarm:** 3B | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 33 / 33 tests green

---

## 1. Scope

A zero-dependency RMA engine that implements the full 9-step
Return Merchandise Authorization workflow for Techno-Kol Uzi, with
baked-in compliance for Israeli consumer law (חוק הגנת הצרכן,
התשמ"א-1981). Built entirely with Node's built-ins — only
`node:crypto` is imported from the standard library.

**Delivered files**

| Path | Purpose |
|---|---|
| `onyx-procurement/src/returns/rma.js` | The library (750+ lines, commented) |
| `onyx-procurement/test/payroll/rma.test.js` | 33 test cases |
| `_qa-reports/AG-X32-rma.md` | This report |

**Rules respected**

- Zero dependencies — only `node:crypto`
- Hebrew bilingual labels on every reason / status / audit event
- NEVER deletes — audit trail is append-only; there is no purge API
- Real code, fully exercised by the test suite
- In-memory store is pluggable so the server can wire Postgres later

---

## 2. Public API

```js
const {
  // constants
  REASON_CODES, STATUS, DISPOSITION, CONDITION,
  REFUND_TYPES, EXCLUDED_CATEGORIES, DEFAULT_POLICY,
  LEGAL_TRANSITIONS,

  // public workflow API
  createRma,        // (customerId, invoiceId, items[], reason, opts)          → rmaId
  approveRma,       // (rmaId, approverId, opts)                                → void
  receiveReturn,    // (rmaId, receivedItems[], opts)                           → void
  inspectItems,     // (rmaId, inspections[], opts)                             → void
  processRefund,    // (rmaId, refundType, opts)                                → creditNoteId
  closeRma,         // (rmaId, opts)                                            → void
  rejectRma,        // (rmaId, reason, opts)                                    → void
  getRmaStats,      // (period, opts)                                           → {count, top_reasons, avg_resolution_days, by_status}

  // helpers
  getRma, listRmas, getAuditTrail, getShipBackInstructions,
  computeRestockingFee, isItemExcludedByConsumerLaw, resolveReason,

  // store + hooks
  createStore, setInvoiceGenerator, setInventoryHook,

  // introspection
  _internal,
} = require('./src/returns/rma.js');
```

---

## 3. Data Model

### RMA

| Field | Type | Notes |
|---|---|---|
| `id` | string | `rma-<12 hex>` |
| `customer_id` | string | caller-supplied |
| `invoice_id` | string | caller-supplied |
| `rma_number` | string | `RMA-YYYYMM-NNNN`, zero-padded, monthly sequence |
| `status` | enum | see §4 |
| `reason` | string | one of 6 canonical codes |
| `reason_label_he` / `reason_label_en` | string | bilingual |
| `created_at` / `approved_at` / `received_at` / `closed_at` / `rejected_at` | ISO-8601 | lifecycle timestamps |
| `policy` | object | snapshot of DEFAULT_POLICY at creation time |
| `invoice_snapshot` | object | `{customer_type, issued_at, total_ils}` |
| `refund_subtotal_ils` / `refund_restocking_fee_ils` / `refund_net_ils` | number | populated on processRefund |
| `refund_type` | enum | `credit_note`/`refund`/`replacement` |
| `credit_note_id` | string | set when a credit note is issued |

### Line

| Field | Type | Notes |
|---|---|---|
| `id` / `rma_id` | string | |
| `item_id` / `description` / `category` | string | |
| `qty_requested` / `qty_received` | number | guarded: received ≤ requested |
| `unit_price_ils` | number | round2 |
| `condition` | enum | `new` / `open_box` / `used` / `damaged` / `defective` |
| `disposition` | enum | `restock` / `scrap` / `repair` / `replace` |
| `refund_amount` | number | derived on processRefund |
| `excluded_consumer_law` | boolean | flagged for mixed-cart awareness |

### AuditEvent (append-only)

`{ id, rma_id, event, label_he, label_en, meta, at }`

There is **no** `deleteAuditTrail`, `clearAudit`, or any method that
mutates past events — enforced by test #27.

---

## 4. State Machine

```
        ┌───────────┐
        │   draft   │
        └─────┬─────┘
              │
              ├────────────► pending_approval ───► approved
              │                        │              │
              │                        └──────┐       │
              │                               ▼       ▼
              │                           rejected    │
              │                                       │
              │                                       ▼
              │                          ┌────► shipped_back ────►
              │                          │                        │
              │                          │                        ▼
              │                          └──────────────────► received
              │                                                    │
              │                                                    ▼
              │                                               inspected
              │                                                    │
              │                                                    ▼
              │                                               processed
              │                                                    │
              │                                                    ▼
              │                                                 closed
              │                                                    │
              └──── (any non-terminal) ──► rejected ◄───────────────┘
```

Transitions are validated by `LEGAL_TRANSITIONS`. Illegal moves
throw — test #25 verifies that you cannot skip straight from
`approved` to `closed`.

Terminal states (`closed`, `rejected`) have empty successor arrays —
test #31 asserts this.

---

## 5. Reason Codes

| Code | label_he | label_en | auto_approvable |
|---|---|---|---|
| `defective` | פגום / לא תקין | Defective | yes |
| `wrong_item` | פריט שגוי נשלח | Wrong item shipped | yes |
| `wrong_qty` | כמות שגויה | Wrong quantity | yes |
| `damaged_in_transit` | נפגם במשלוח | Damaged in transit | yes |
| `customer_changed_mind` | הלקוח התחרט | Customer changed mind | yes (within window) |
| `warranty_claim` | תביעת אחריות | Warranty claim | **no** — always manual |

---

## 6. Israeli Consumer-Law Compliance

The module enforces חוק הגנת הצרכן, התשמ"א-1981 out of the box:

### 6.1 Return window

- **B2C (consumer):** 14 days from receipt — `CONSUMER_WINDOW_DAYS`
- **B2B (business):** 30 days default — `B2B_WINDOW_DAYS`

`_shouldAutoApprove` reads `invoice.customer_type` + `invoice.issued_at`
to decide. Anything older than the applicable window routes to
manual approval (test #10, #11, #33).

### 6.2 Restocking fee

- **5%** of the line subtotal, **capped at ₪100**
- **Waived** for defective / wrong-item / wrong-qty / damaged-in-transit / warranty
- Applied only when the customer changed their mind

Implemented in `computeRestockingFee(reason, totalIls, policy)` and
verified by tests #15 and #16:

```
customer_changed_mind   500  → 25      (5%)
customer_changed_mind  1999  → 99.95   (5%, still under cap)
customer_changed_mind  5000  → 100     (capped)
defective               any  → 0       (waived)
```

### 6.3 Excluded categories

```
perishable       — food, flowers, medical
custom           — made-to-order
opened_software  — once the seal is broken
digital_download — DLC, licence keys
intimate         — swimwear, underwear, earrings
newspaper        — time-sensitive printed matter
```

Any item tagged `excluded: true` is also blocked. Test #13 verifies
that an RMA whose line items are **all** excluded is rejected at
creation time. Test #14 verifies mixed carts: the eligible line is
created, and the excluded line is flagged with
`excluded_consumer_law: true` for the UI.

---

## 7. Workflow Walkthrough (happy path)

```js
const rma = require('./src/returns/rma.js');

// 1. Customer requests return
const rmaId = rma.createRma(
  'cust-42',
  'inv-2026-0007',
  [
    { item_id: 'sku-laptop', qty: 1, unit_price_ils: 4200 },
    { item_id: 'sku-mouse',  qty: 1, unit_price_ils: 150  },
  ],
  'defective',
  { invoice: { customer_type: 'business', issued_at: '2026-04-02', total_ils: 4350 } }
);
// → 'rma-<hex>', rma_number 'RMA-202604-0001', status 'approved' (auto)

// 2. Receive at the warehouse
rma.receiveReturn(rmaId, [
  { item_id: 'sku-laptop', qty_received: 1, condition: 'defective' },
  { item_id: 'sku-mouse',  qty_received: 1, condition: 'new' },
]);

// 3. Inspect and set disposition
rma.inspectItems(rmaId, [
  { item_id: 'sku-laptop', disposition: 'repair' },
  { item_id: 'sku-mouse',  disposition: 'restock' },
]);

// 4. Issue credit note (repair lines do not refund)
const creditNoteId = rma.processRefund(rmaId, 'credit_note');
// → 'CN-RMA-202604-0001', refund_net_ils = 150

// 5. Close
rma.closeRma(rmaId);
```

---

## 8. Integration Seams

### 8.1 Credit note generator

`setInvoiceGenerator((rma, amount) => {id, ...})` injects the real
invoice module. Default stub returns `CN-<rma_number>` so tests can
work offline. The generator MUST return an object with an `id`
field or `processRefund` throws.

### 8.2 Inventory hook

`setInventoryHook((op) => { ... })` is invoked for every inspected
line with:

```js
{ action: 'restock'|'scrap'|'repair'|'replace',
  item_id, qty, rma_id, rma_number }
```

Hook errors are swallowed but appended to the audit trail as
`inventory_hook_error` so the warehouse can retry manually. Test #20
asserts the hook is called with the correct disposition per line.

### 8.3 Pluggable store

`createStore()` returns an isolated in-memory persistence unit.
Every public function accepts `{store}` in `opts` so the test suite
can stay parallel-safe, and the server bootstrap can replace the
default with a Postgres-backed store without touching call sites.

---

## 9. Test Matrix

Run with:

```
node --test onyx-procurement/test/payroll/rma.test.js
```

| # | Scenario | Area |
|---|---|---|
| 01 | `RMA-YYYYMM-NNNN` zero-padded format | formatter |
| 02 | `toYearMonth` UTC correctness | formatter |
| 03 | 6 canonical reason codes, all bilingual | constants |
| 04 | `resolveReason` accepts / rejects | validation |
| 05 | Happy-path create for B2B invoice | createRma |
| 06 | Monthly sequence increments | sequence |
| 07 | Create rejects missing ids + empty items | validation |
| 08 | Auto-approve defective B2B within window | auto-approval |
| 09 | Warranty never auto-approves | auto-approval |
| 10 | Invoices older than 30 d → pending | auto-approval |
| 11 | B2C past 14-day window → pending | consumer law |
| 12 | `isItemExcludedByConsumerLaw` category map | consumer law |
| 13 | All-excluded consumer RMA rejected at create | consumer law |
| 14 | Mixed cart flags excluded lines | consumer law |
| 15 | Restocking fee: 5% + waived for seller fault | fee math |
| 16 | Restocking fee cap at ₪100 | fee math |
| 17 | receiveReturn sets qty + state | lifecycle |
| 18 | Guard: received > requested throws | lifecycle |
| 19 | inspectItems validates condition + disposition | lifecycle |
| 20 | Inventory hook called with correct dispositions | hook |
| 21 | processRefund issues credit note via injected generator | refund |
| 22 | Restocking fee applied for changed-mind | refund |
| 23 | REPAIR lines excluded from refund | refund |
| 24 | Replacement type → no credit note | refund |
| 25 | Illegal transition guard | state machine |
| 26 | rejectRma from pending_approval (terminal) | state machine |
| 27 | Audit trail append-only + bilingual | audit |
| 28 | Ship-back packet bilingual (Hebrew + English) | docs |
| 29 | `getRmaStats` count / top_reasons / avg_days | stats |
| 30 | `listRmas` filter by status / customer | query |
| 31 | LEGAL_TRANSITIONS terminal-state invariant | state machine |
| 32 | `daysBetween` + `round2` utilities | math |
| 33 | `_shouldAutoApprove` full decision matrix | auto-approval |

### Test run output

```
ℹ tests 33
ℹ suites 0
ℹ pass 33
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~169
```

---

## 10. Risk Register / Known Limits

| Risk | Mitigation |
|---|---|
| RMA number sequence is per-store, not cluster-wide | Wire a DB sequence when the Postgres store is implemented |
| In-memory store loses data on process restart | Replace default store with Postgres adapter on production boot |
| Restocking-fee cap is hard-coded in policy | `DEFAULT_POLICY` is frozen but each call accepts an override via `opts.policy` |
| Invoice-age calculation assumes `invoice.issued_at` is accurate | If absent, falls back to `created_at` (no silent failure) |
| Customer type inference depends on invoice flag | Missing flag → treated as B2B (30-day window, safer default) |
| Audit trail not yet persisted to WORM storage | Designed append-only; wire to WORM in QA-AGENT-50 follow-up |

No secrets are logged. No PII is written to the audit trail beyond
what the caller explicitly supplies via `meta`.

---

## 11. Compliance Checklist

- [x] `חוק הגנת הצרכן`, התשמ"א-1981 §14A — 14-day right of return
- [x] `תקנות הגנת הצרכן` — 5% restocking fee cap ₪100
- [x] Excluded categories (perishable / custom / opened software)
- [x] B2B 30-day courtesy window
- [x] Bilingual UI-facing strings (Hebrew + English)
- [x] Append-only audit trail (NEVER delete rule)
- [x] Zero third-party dependencies
- [x] All state transitions guarded and auditable

---

## 12. Sign-off

All 33 tests green on Node v18+. Module is production-ready and
can be imported into `onyx-procurement/server.js` by requiring
`./src/returns/rma.js`. The invoice-generator and inventory hooks
must be wired at bootstrap via `setInvoiceGenerator` /
`setInventoryHook` — default stubs work for tests and dev mode.

**Agent X-32 — task complete.**
