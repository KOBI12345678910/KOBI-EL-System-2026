# AG-X33 — Warranty Tracker
**Agent:** X-33 | **Swarm:** 3B | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 30/30 tests green

---

## 1. Scope

A zero-dependency warranty tracking engine for the Techno-Kol Uzi ERP. It covers
the two directions in which a metal-fab shop cares about warranties:

1. **Outbound** — warranties we give customers on sold products
2. **Inbound** — warranties we receive on equipment/tools bought from suppliers

The module is a pure, non-deleting in-memory store with a clean export surface
so the host ERP can swap its own repository in later without touching the API.

Delivered files
- `onyx-procurement/src/warranty/warranty-tracker.js` — the library (650 LOC)
- `onyx-procurement/test/payroll/warranty-tracker.test.js` — 30 tests
- `_qa-reports/AG-X33-warranty.md` — this report

RULES respected
- **Zero dependencies** — only `node:test` and `node:assert/strict` in tests; the
  library itself has no `require` at all
- **Hebrew bilingual** — every label/reason/note has both `_he` and `_en` fields
- **Never deletes** — history arrays are append-only; duplicate serials append a
  chronological marker list instead of overwriting; reimbursements accumulate
- **Israeli consumer protection** — `legalFloor` constant hard-codes
  חוק הגנת הצרכן minimums and is enforced on every `createWarranty` call

---

## 2. Public API

```js
const W = require('./src/warranty/warranty-tracker.js');

W.createWarranty(productSale)              // → warrantyId
W.registerEquipment(equipmentReceipt)      // → warrantyId (owned=true)

W.findBySerialNo(serialNo)                 // → warranty | null
W.findByWarrantyId(id)                     // → warranty | null
W.findByCustomer(customerId)               // → warranty[]
W.findByProduct(productId)                 // → warranty[]

W.checkCoverage(warrantyId, date?)         // → {covered, days_remaining, alert}

W.createClaim(warrantyId, claimData)       // → claimId
W.updateClaimStatus(id, status, res?)      // → claim
W.getClaim(id)                             // → claim | null
W.listClaims(warrantyId?)                  // → claim[]

W.linkRMA(claimId, rmaId)                  // → claim
W.vendorReimbursement(claimId, amount)     // → claim

W.failureRateReport(productId, period?)    // → {count, mtbf_days, top_failures}
W.expiringWarranties(daysAhead?)           // → warranty[]
W.lemonCheck(warrantyId)                   // → {is_lemon, qualifying_failures}
W.upsellCandidates(daysBeforeExpiry?)      // → candidate[]

// Constants
W.WARRANTY_TYPES    // MANUFACTURER, EXTENDED, SERVICE, STATUTORY
W.COVERAGE_KINDS    // PARTS_ONLY, LABOR_ONLY, COMPREHENSIVE
W.CLAIM_STATUSES    // REPORTED, IN_REVIEW, APPROVED, REJECTED, IN_REPAIR,
                    // REPAIRED, REPLACED, REFUNDED, CLOSED
W.PRODUCT_CLASSES   // METAL, APPLIANCE, BUILDING, ELECTRONICS, CONSUMABLE, OTHER
W.legalFloor        // statutory minimum days per class
W.DEFAULTS
```

---

## 3. Data Model

### Warranty
```js
{
  id: 'W-000001',
  product_id, product_class, serial_no, customer_id,
  owned: false,              // true = inbound equipment we purchased
  invoice_id,
  start_date, end_date, days,
  type: 'MANUFACTURER' | 'EXTENDED' | 'SERVICE' | 'STATUTORY',
  terms: { coverage: 'COMPREHENSIVE' | 'PARTS_ONLY' | 'LABOR_ONLY', notes, ... },
  vendor,                    // external warranty provider (extended warranty)
  cost,                      // cost paid by the customer for the warranty
  statutory_uplift: boolean, // true when the statutory floor raised our length
  created_at,
  label_he, label_en,
}
```

### Claim
```js
{
  id: 'CL-000001',
  warranty_id,
  reported_at,
  description,
  severity,
  status,
  resolution,
  photos: ['photo-ref-...'],  // stub references only, no binary storage
  reporter,
  cost,
  reimbursed,                  // running total of vendor payback
  rma_id,                      // X-32 integration reference
  history: [{ at, status, note_he, note_en, resolution? }],
  created_at,
}
```

---

## 4. Israeli Consumer Protection

| Product class | Statutory minimum | Source |
|---|---|---|
| METAL       | 365 days         | תקנות הגנת הצרכן (אחריות ושירות לאחר מכירה), התשס"ו-2006 |
| APPLIANCE   | 365 days         | תקנות הגנת הצרכן |
| ELECTRONICS | 365 days         | תקנות הגנת הצרכן |
| BUILDING    | 3650 days (10y)  | אחריות קונסטרוקטיבית |
| CONSUMABLE  | 0 days           | לא חל |
| OTHER       | 365 days         | ברירת־מחדל שמרנית |

`createWarranty` always honours `max(requested_days, legal_minimum)`, and sets
`statutory_uplift = true` when the floor raised the length. A host system
trying to write a 90-day warranty on a metal product will silently get 365.

### Lemon rule

`lemonCheck(warrantyId)` groups claims by normalized description and flags the
unit as a lemon when the same defect was reported **≥ 3 times**. When triggered
the host system should offer replacement or refund per consumer-protection
practice.

---

## 5. Feature Coverage vs. Requirements

| # | Requirement | Implemented in |
|---|---|---|
| 1 | Auto-create warranty on product sale | `createWarranty` (invoice_id + product_class + warranty_days) |
| 2 | Serial number linking | `bySerial` index, `findBySerialNo` |
| 3 | Expiry alerts (30/60) | `checkCoverage` returns `alert: '30d' \| '60d' \| 'EXPIRED'`; `expiringWarranties(days)` |
| 4 | Claim intake with photos | `createClaim({ photos: [...] })` — stub refs |
| 5 | RMA integration (Agent X-32) | `linkRMA(claimId, rmaId)` writes history entry |
| 6 | Vendor cost recovery | `vendorReimbursement(claimId, amount)` (never subtracts) |
| 7 | Failure rate per product | `failureRateReport(productId, period?)` |
| 8 | Lemon law | `lemonCheck(warrantyId)` |
| 9 | Upsell reminders | `upsellCandidates(daysBeforeExpiry)` — filters to manufacturer/statutory with customer + clean claims |

---

## 6. Test Results

Test runner: Node built-in `node --test`.

```
node --test test/payroll/warranty-tracker.test.js
```

```
tests      30
suites     0
pass       30
fail       0
cancelled  0
skipped    0
todo       0
duration   175ms
```

### Coverage map

| Area | Tests |
|---|---|
| Exports / constants       | 1, 2 |
| Warranty creation         | 3, 4, 5, 6, 7, 8 |
| Lookups                   | 9, 10 |
| Coverage math / alerts    | 11, 12, 13, 14, 15 |
| Claim lifecycle           | 16, 17, 18, 19 |
| RMA integration           | 20 |
| Vendor reimbursement      | 21 |
| Failure-rate analytics    | 22, 23 |
| Expiry alerts             | 24 |
| Lemon law                 | 25, 26 |
| Upsell candidates         | 27, 28 |
| coverageFromTerms infer   | 29 |
| Never-delete invariant    | 30 |

---

## 7. Integration Notes

### Invoice module → warranty auto-create
The host `invoices` module should call `createWarranty({ invoice_id, sale_date,
product_id, product_class, warranty_days, serial_no, customer_id })` once per
invoiced line item where the product is warrantable. Product class + default
warranty days should come from the product master.

### RMA module (Agent X-32) → warranty claim
When Customer Service logs an RMA, call `createClaim(warrantyId, ...)` first
and then `linkRMA(claimId, rmaId)` to keep both records cross-referenced.

### Notifications
`expiringWarranties(60)` and `expiringWarranties(30)` drive the nightly alert
job. `upsellCandidates(45)` drives the extended-warranty CRM campaign.

### Quality dashboard
`failureRateReport(productId, { from, to })` feeds the monthly quality review.
Any product whose `claim_rate > 0.2` is flagged for supplier escalation.

---

## 8. Invariants enforced

1. `createWarranty` never writes a warranty shorter than `legalFloor[class]`.
2. `vendorReimbursement` never accepts a negative amount — it is a
   monotonic-non-decreasing counter.
3. `updateClaimStatus` only appends history entries — earlier records survive.
4. Duplicate serial numbers are chained, not overwritten.
5. `_resetStore()` is the ONLY mutation point that removes data and is only
   exported for tests — prod code must not call it.

---

## 9. Known follow-ups (future tickets)

- Persist to the host ERP's SQL store via a pluggable repository interface
- Wire the 30/60 day alerts into the notifications module
- Surface `upsellCandidates` in the CRM dashboard
- Add i18n-complete Hebrew localisation for claim description templates
- Feed `failureRateReport` into the supplier-scoring module for vendor KPIs
