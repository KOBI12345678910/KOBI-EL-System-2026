# AG-Y090 — Deferred Revenue Tracker (`DeferredRevenue`)

**Agent:** Y-090
**Swarm:** Mega-ERP Techno-Kol Uzi — Kobi EL
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/finance/deferred-revenue.js`
**Tests:** `onyx-procurement/test/finance/deferred-revenue.test.js`
**Rule of the house:** **לא מוחקים — רק משדרגים ומגדלים.**

---

## 1. Summary

A zero-dependency, deterministic, bilingual (Hebrew / English)
deferred-revenue, contract-asset, and contract-liability tracker
for the ONYX / Techno-Kol Uzi Mega-ERP, built around IFRS 15
"Revenue from Contracts with Customers".

The tracker:

* Implements the **IFRS 15 five-step model** end-to-end.
* Supports both **point-in-time** (§38) and **over-time** (§35)
  recognition, including the four over-time measurement methods
  (output, input, cost-to-cost, units-delivered).
* Handles all three **contract modification** flavours
  (§18–§21): `separate`, `prospective`, `retrospective`.
* Tracks **billing** on a ledger separate from recognition, so
  Israeli VAT (מע"מ) can be reported on the date a tax invoice
  (חשבונית מס) is issued — regardless of when revenue is
  recognized.
* Returns a cumulative roll-forward
  (`opening + additions − recognized = closing`) per period.
* Emits a bilingual disclosure report matching IFRS 15 §110–§129.
* Supports a dual "accrual vs. cash-basis" mode for small
  Israeli service businesses (עסק פטור) whose tax authority
  preference is cash-basis income.
* **Never deletes** a contract, an obligation, or a recognition
  event — modifications append to `contract.history[]` and
  `contract.events[]`.
* All internal math is in **integer agorot** — no float drift.

Test suite: **37 passing, 0 failing** — `node --test`, zero external
dependencies.

---

## 2. Run the tests

```bash
# from onyx-procurement/
node --test test/finance/deferred-revenue.test.js
```

Expected output (abridged):

```
✔ CONSTANTS — exported and sane
✔ toAgorot / toShekels — round-trip
✔ createContract — validates required fields (bilingual)
✔ createContract — endDate before startDate rejected
✔ createContract — creates contract with auto-generated ID and event log
✔ allocatePrice — relative SSP, sum matches transaction price exactly
✔ allocatePrice — rounding residue absorbed on last obligation
✔ allocatePrice — zero total SSP falls back to even split
✔ allocatePrice — contract with discount (total < sum SSP)
✔ recognizeRevenue — output method with percentComplete
✔ recognizeRevenue — cost-to-cost method
✔ recognizeRevenue — units-delivered method
✔ recognizeRevenue — over-time rejects point-in-time obligation
✔ recognizeRevenue — cost-to-cost missing inputs throws bilingual error
✔ recognizeRevenue — cumulative recognition caps at allocated
✔ satisfyObligation — point-in-time recognizes full allocated amount
✔ satisfyObligation — rejects double satisfaction (bilingual error)
✔ satisfyObligation — rejects over-time obligations
✔ scheduleSubscription — monthly, 12 periods
✔ scheduleSubscription — quarterly, 4 periods
✔ scheduleSubscription — rejects invalid period
✔ modifyContract — SEPARATE adds new obligation, preserves old ones
✔ modifyContract — PROSPECTIVE re-allocates remaining + new obligations
✔ modifyContract — RETROSPECTIVE books cumulative catch-up
✔ modifyContract — invalid type rejected with bilingual error
✔ modifyContract — history[] is append-only (never delete)
✔ deferredBalance — unearned revenue outstanding
✔ contractLiability — when billing > recognition
✔ unbilledReceivable — when recognition > billing
✔ rolloForward — opening + additions − recognized = closing
✔ rolloForward — multiple contracts aggregate
✔ disclosureReport — bilingual keys + backlog + VAT reconciliation
✔ disclosureReport — cash-basis mode returns cashBasisTaxable
✔ VAT reconciliation — billed > recognized generates positive gap
✔ IFRS 15 five-step model — end-to-end integration
✔ getContract / listContracts — returns deep clones
✔ getContract — missing returns null; _mustGetContract throws bilingual
ℹ pass 37  fail 0
```

---

## 3. Public API

```js
const {
  DeferredRevenue,
  DeferredRevenueError,
  CONSTANTS,
  RECOGNITION_METHODS,   // output | input | cost-to-cost | units-delivered
  TIMING_TYPES,          // point | over-time
  MODIFICATION_TYPES,    // separate | prospective | retrospective
  EVENT_TYPES,
  MODES,                 // accrual | cash-basis
  toAgorot, toShekels, formatILS,
} = require('./src/finance/deferred-revenue.js');

const tracker = new DeferredRevenue({ mode: 'accrual', vatRate: 0.18 });
```

### Methods

| Method | Purpose |
|---|---|
| `createContract(input)` | Step 1 + Step 4 — identify the contract and auto-allocate the transaction price on relative SSP. |
| `allocatePrice({transactionPrice, obligations})` | Pure Step 4 helper — returns allocations without persisting. |
| `recognizeRevenue(input)` | Step 5 for **over-time** obligations. Supports `output`, `input`, `cost-to-cost`, `units-delivered`. |
| `satisfyObligation({contractId, obligationId, date, proof})` | Step 5 for **point-in-time** obligations. |
| `scheduleSubscription({contractId, obligationId, period, amount, recurring, startDate})` | SaaS / subscription — creates the monthly / quarterly / annual recognition schedule. |
| `modifyContract({contractId, modificationType, impact})` | IFRS 15 §18–§21 modification. Never deletes the old version. |
| `recordBilling({contractId, obligationId, amount, date, invoice, vatRate})` | Records an issued tax invoice on a ledger separate from recognition. |
| `deferredBalance(contractId, asOfDate)` | Unearned revenue outstanding = Σ (allocated − recognized) as of date. |
| `unbilledReceivable(contractId)` | Contract asset (recognized > billed). |
| `contractLiability(contractId)` | Contract liability (billed > recognized). |
| `rolloForward(period)` | Opening + additions − recognized = closing, aggregated across all contracts. |
| `disclosureReport(period)` | IFRS 15 §110–§129 report with bilingual text + VAT reconciliation + cash-basis figure. |
| `getContract(id)` / `listContracts()` | Returns deep clones (no external mutation). |

---

## 4. IFRS 15 five-step model

| Step | Name (en) | Name (he) | Implementation |
|---|---|---|---|
| 1 | Identify the contract with a customer | זיהוי החוזה עם הלקוח | `createContract()` — input validation, `customerId`, `total`, terms, dates, unique auto-ID. |
| 2 | Identify the performance obligations | זיהוי מחויבויות הביצוע | `performanceObligations[]` — each with `id`, `description`, `standaloneSSP`, `timing`. |
| 3 | Determine the transaction price | קביעת מחיר העסקה | `input.total` — fixed consideration. Variable consideration is the caller's responsibility (constraint under §56 is out-of-scope). |
| 4 | Allocate the transaction price | הקצאת מחיר העסקה | `allocatePrice()` — relative standalone-selling-price method (§74–§80). Sum of allocations equals the transaction price exactly (rounding residue on the last obligation). |
| 5 | Recognize revenue when each obligation is satisfied | הכרה בהכנסה עם קיום המחויבות | `satisfyObligation()` for point-in-time (§38), `recognizeRevenue()` for over-time (§35–§45). |

---

## 5. Recognition methods (over-time)

| Method | IFRS 15 ref | Inputs | Cumulative formula |
|---|---|---|---|
| `output`          | §B15 | `amount` or `percentComplete` | `floor(allocated × percentComplete)` |
| `input`           | §B18 | `amount` or `percentComplete` | same — caller converts input into percent |
| `cost-to-cost`    | §B19 | `incurredCost`, `totalExpectedCost` | `floor(allocated × incurred / total)` |
| `units-delivered` | custom | `unitsDelivered`, `totalUnits`    | `floor(allocated × delivered / total)` |

All methods:

* Cap cumulative recognition at `allocated` (§B19 — ratio ≤ 1).
* Store the delta into `po.recognitions[]` as an append-only entry.
* Auto-mark the obligation as `satisfied` when cumulative hits
  allocated.
* Clamp `percentComplete > 1.0` to 1.0.

---

## 6. Contract modifications (§18–§21)

| Type | IFRS 15 ref | Effect on existing POs | Effect on new POs | Revenue adjustment |
|---|---|---|---|---|
| `separate`      | §20  | Untouched | Appended at their SSP | None |
| `prospective`   | §21(a) | Remaining POs re-allocated together with new POs on relative SSP, over the pool of `(unrecognized + additionalPrice)` | Added to the pool | Affects **future** recognition only |
| `retrospective` | §21(b) | All POs re-allocated on relative SSP over `revisedTotal`; cumulative recognized on each over-time PO is re-based to preserve the progress ratio | — | **Cumulative catch-up** booked as a new `recognitions[]` entry with method `retrospective-catch-up` |

Every modification:

* Snapshots the full contract into `history[]`.
* Bumps `contract.version`.
* Appends a `contract.modified` entry to `events[]` AND
  `modifications[]`.
* Never deletes anything — if a prospective mod re-allocates a
  remaining PO, the old allocation is still in the history
  snapshot.

---

## 7. Balance functions

### 7.1 `deferredBalance(contractId, asOfDate)`

Unearned revenue — the amount the entity still owes the customer in
goods or services.

```
Σ over obligations: (allocated − Σ recognitions with at ≤ asOfDate)
```

### 7.2 `unbilledReceivable(contractId)` — Contract asset (§107)

```
max(0, cumulativeRecognized − cumulativeBilled)
```

### 7.3 `contractLiability(contractId)` — Contract liability (§106)

```
max(0, cumulativeBilled − cumulativeRecognized)
```

Both functions consume the `billings[]` ledger on each obligation +
any contract-level billings — this is what makes the Israeli VAT
reconciliation work (see §9 below).

---

## 8. Roll-forward

`rolloForward('2026-Q1')` (or `'2026-01'`, or `'2026'`) returns:

```
{
  period:   '2026-01',
  opening:  <₪>,   // billed − recognized, as of (period start − 1)
  additions:<₪>,   // billings inside the period
  recognized:<₪>,  // recognitions inside the period
  modifications: <count>,
  closing:  <₪>,   // billed − recognized, as of period end (always ≥ 0)
  byContract: [ { contractId, opening, additions, recognized, closing, modifications } ],
  formula_he: 'פתיחה + תוספות − הוכר = סגירה',
  formula_en: 'opening + additions − recognized = closing'
}
```

---

## 9. Israeli specifics — VAT and cash-basis

Israeli tax law diverges from IFRS 15 in two important ways:

### 9.1 VAT (חוק מע"מ — Israeli VAT Law)

> **מע"מ מדווח על מועד הוצאת חשבונית המס, ללא קשר למועד ההכרה
> בהכנסה לפי IFRS 15.**
>
> *"VAT is reported on the date of tax-invoice issuance,
> regardless of the IFRS 15 recognition date."*

The tracker therefore keeps **two ledgers**:

* `po.recognitions[]` — when revenue is recognized (IFRS 15).
* `po.billings[]` + `contract.contractBillings[]` — when a tax
  invoice (חשבונית מס) is issued (Israeli VAT).

`disclosureReport().vatReconciliation` surfaces the gap
(`billed − recognized`) so the month's VAT report (דיווח מע"מ) is
always consistent with the tax invoices issued, even if revenue has
not yet been recognized. The report exposes:

| Field | Meaning |
|---|---|
| `billed` | Σ billings in the period |
| `recognized` | Σ recognitions in the period |
| `gap` | `billed − recognized` (can be negative if recognition leads billing) |
| `vatRate` | Default 18% for 2026 (`CONSTANTS.VAT_RATE_2026`) |
| `vatPayable` | `billed × vatRate` — this is what goes to the VAT authority |
| `note_he / note_en` | Bilingual note explaining the gap |

**Typical Israeli case:** one-year SaaS contract billed upfront for
₪12,000 in January 2026. Under IFRS 15 only ₪1,000 is recognized
in January; but the VAT authority expects 18% × ₪12,000 = ₪2,160
to be paid in January (the invoice is a binding, non-refundable
tax document). The tracker correctly reports both figures and
the ₪11,000 gap.

### 9.2 Cash-basis (מזומן) — small business option

The Israeli Tax Ordinance (פקודת מס הכנסה) permits certain small
service businesses (עסק פטור — turnover below a threshold, stored
in `CONSTANTS.CASH_BASIS_THRESHOLD_ILS` for reference only) to
report income on a cash basis.

When the tracker is instantiated with `mode: 'cash-basis'`:

* All IFRS-15 recognition, disclosure, roll-forward, and balance
  calculations remain untouched. Financial statements stay
  IFRS-compliant.
* `disclosureReport().cashBasisTaxable` returns the
  cash-collected / billed figure the tax authority uses for the
  annual declaration (**dual-track** accounting — הנהלת חשבונות לפי
  IFRS, ודיווח מס הכנסה לפי מזומן).

---

## 10. "Never delete" semantics

| Operation | Effect |
|---|---|
| `createContract` | Creates a fresh contract with `version:1, history:[], events:[created, price-allocated]`. |
| `satisfyObligation` | Flips `po.satisfied=true`, appends to `po.recognitions[]` and `contract.events[]`. Original allocation preserved. |
| `recognizeRevenue` | Appends to `po.recognitions[]` and `contract.events[]`. Never mutates prior entries. |
| `recordBilling` | Appends to `po.billings[]` and `contract.events[]`. |
| `modifyContract` | Snapshots the full contract into `contract.history[]` as `{version, snapshot, replacedAt, modificationType, impact}`, then applies the modification. The snapshot is a deep clone — no aliasing. |
| (No `deleteContract`) | By design — there is no delete. The closest operation is `status='cancelled'` (reserved; not wired in this release). |

This satisfies the house rule: **לא מוחקים — רק משדרגים ומגדלים.**

---

## 11. Integer-agorot arithmetic

All internal math is in integer agorot (`₪ × 100`) via `toAgorot()` /
`toShekels()`. This guarantees:

* `allocatePrice()` — sum of allocations is **exactly** the
  transaction price (rounding residue settles on the last line).
* `rolloForward()` — opening + additions − recognized = closing
  is exact to the agora.
* No `0.1 + 0.2 = 0.30000000000000004` drift anywhere.

---

## 12. Hebrew glossary (מילון עברי)

| Hebrew | English | Module symbol |
|---|---|---|
| הכרה בהכנסה | Revenue recognition | `recognizeRevenue` |
| מחויבות ביצוע | Performance obligation | `performanceObligation` / `po` |
| מחיר עסקה | Transaction price | `transactionPrice` / `total` |
| הקצאת מחיר | Price allocation | `allocatePrice` |
| מחיר מכירה עצמאי | Standalone selling price (SSP) | `standaloneSSP` |
| חוזה | Contract | `contract` |
| חשבונית מס | Tax invoice (VAT instrument) | `billing` / `invoice` |
| הכנסות מראש | Deferred revenue / unearned | `deferredBalance` |
| נכס חוזי | Contract asset (unbilled receivable) | `unbilledReceivable` |
| התחייבות חוזית | Contract liability | `contractLiability` |
| הכרה בנקודת זמן | Point-in-time | `TIMING_TYPES.POINT` |
| הכרה לאורך זמן | Over-time | `TIMING_TYPES.OVER_TIME` |
| שיטת תפוקה | Output method | `RECOGNITION_METHODS.OUTPUT` |
| שיטת תשומה | Input method | `RECOGNITION_METHODS.INPUT` |
| יחס עלויות | Cost-to-cost | `RECOGNITION_METHODS.COST_TO_COST` |
| יחידות שנמסרו | Units delivered | `RECOGNITION_METHODS.UNITS_DELIVERED` |
| שינוי חוזה | Contract modification | `modifyContract` |
| שינוי חוזה נפרד | Separate contract | `MODIFICATION_TYPES.SEPARATE` |
| שינוי פרוספקטיבי | Prospective | `MODIFICATION_TYPES.PROSPECTIVE` |
| שינוי רטרוספקטיבי | Retrospective | `MODIFICATION_TYPES.RETROSPECTIVE` |
| תיקון מצטבר | Cumulative catch-up | `retrospective-catch-up` entry |
| גליון תנועה | Roll-forward | `rolloForward` |
| דוח גילוי | Disclosure report | `disclosureReport` |
| יתרת מחויבויות לא מומשות | Remaining obligations (backlog) | `totals.backlog` |
| מנוי / SaaS | Subscription / SaaS | `scheduleSubscription` |
| בסיס מזומן | Cash basis | `MODES.CASH_BASIS` |
| בסיס צבירה | Accrual basis | `MODES.ACCRUAL` |
| עסק פטור | Small exempt business | `CASH_BASIS_THRESHOLD_ILS` |
| מע"מ | VAT | `vatReconciliation` |
| פקודת מס הכנסה | Income Tax Ordinance | §9.2 |
| חוק מע"מ | VAT Law | §9.1 |

---

## 13. Test coverage map

| Scenario | Test |
|---|---|
| Constants + exports sanity | `CONSTANTS — exported and sane` |
| Agorot math | `toAgorot / toShekels — round-trip` |
| Input validation (bilingual) | `createContract — validates required fields (bilingual)` |
| Start/end date order | `createContract — endDate before startDate rejected` |
| Auto-ID + event log | `createContract — creates contract with auto-generated ID and event log` |
| **Step 4 relative SSP** | `allocatePrice — relative SSP, sum matches transaction price exactly` |
| Rounding residue absorbed | `allocatePrice — rounding residue absorbed on last obligation` |
| Zero-SSP fallback | `allocatePrice — zero total SSP falls back to even split` |
| Bundle discount allocation | `allocatePrice — contract with discount (total < sum SSP)` |
| **Over-time output/%** | `recognizeRevenue — output method with percentComplete` |
| **Cost-to-cost** | `recognizeRevenue — cost-to-cost method` |
| **Units delivered** | `recognizeRevenue — units-delivered method` |
| Wrong timing rejected | `recognizeRevenue — over-time rejects point-in-time obligation` |
| Cost-to-cost missing inputs | `recognizeRevenue — cost-to-cost missing inputs throws bilingual error` |
| Recognition cap | `recognizeRevenue — cumulative recognition caps at allocated` |
| **Point-in-time satisfy** | `satisfyObligation — point-in-time recognizes full allocated amount` |
| Double-satisfy rejected | `satisfyObligation — rejects double satisfaction (bilingual error)` |
| Wrong timing rejected | `satisfyObligation — rejects over-time obligations` |
| **SaaS monthly** | `scheduleSubscription — monthly, 12 periods` |
| SaaS quarterly | `scheduleSubscription — quarterly, 4 periods` |
| Invalid period rejected | `scheduleSubscription — rejects invalid period` |
| **Modification: SEPARATE** | `modifyContract — SEPARATE adds new obligation, preserves old ones` |
| **Modification: PROSPECTIVE** | `modifyContract — PROSPECTIVE re-allocates remaining + new obligations` |
| **Modification: RETROSPECTIVE** | `modifyContract — RETROSPECTIVE books cumulative catch-up` |
| Invalid mod type rejected | `modifyContract — invalid type rejected with bilingual error` |
| **History is append-only** | `modifyContract — history[] is append-only (never delete)` |
| `deferredBalance` | `deferredBalance — unearned revenue outstanding` |
| `contractLiability` | `contractLiability — when billing > recognition` |
| `unbilledReceivable` | `unbilledReceivable — when recognition > billing` |
| **Roll-forward formula** | `rolloForward — opening + additions − recognized = closing` |
| Multi-contract aggregation | `rolloForward — multiple contracts aggregate` |
| **Bilingual disclosure** | `disclosureReport — bilingual keys + backlog + VAT reconciliation` |
| Cash-basis mode | `disclosureReport — cash-basis mode returns cashBasisTaxable` |
| **Israeli VAT gap** | `VAT reconciliation — billed > recognized generates positive gap` |
| **Full five-step end-to-end** | `IFRS 15 five-step model — end-to-end integration` |
| Deep-clone safety | `getContract / listContracts — returns deep clones` |
| Missing contract errors | `getContract — missing returns null; _mustGetContract throws bilingual` |

Total: **37 tests, 37 passing, 0 failing.**

---

## 14. Files

* **Tracker:** `onyx-procurement/src/finance/deferred-revenue.js`
* **Tests:**   `onyx-procurement/test/finance/deferred-revenue.test.js`
* **Report:**  `_qa-reports/AG-Y090-deferred-revenue.md` ← this file

---

## 15. Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-04-11 | Initial tracker — IFRS 15 five steps, over-time + point-in-time, three modification flavours, SaaS scheduling, Israeli VAT reconciliation, cash-basis dual track, 37-test suite, bilingual errors and disclosure. |
| 1.1.0 | 2026-04-11 | **Spec-aligned upgrade (additive only):** `identifyContract`, `identifyPerformanceObligations`, `determineTransactionPrice`, `allocateTransactionPrice` (relative-SSP + residual), `straightLineRecognition`, `percentageOfCompletion`, `milestoneRecognition`, `contractModification` (spec alias), `billingSchedule`, `deferredRevenueRollforward`, `journalEntry` (double-entry DR/CR), `reconcile` (identity check), `exportForAudit` (bilingual audit payload with glossary). 23 additional tests. **Total: 60 passing, 0 failing.** Zero behaviour lost — all v1.0 API still works. |

---

## 16. v1.1 — Spec-aligned API (upgrade)

The v1.1 upgrade is **additive only**. It provides the spec-required
method names on top of the v1.0 surface. No method is removed, no
behaviour is changed, no storage is reorganised. Old callers using
`createContract`, `allocatePrice`, `recognizeRevenue`, `modifyContract`,
`rolloForward`, `disclosureReport`, etc. continue to work unchanged.

### 16.1 New methods — spec surface

| Spec method | Maps to | New behaviour |
|---|---|---|
| `identifyContract({customerId, totalAmount, signedDate, startDate, endDate, performanceObligations})` | `createContract` + stores `signedDate` + `step1_identified=true` | IFRS 15 Step 1 — Identify the contract |
| `identifyPerformanceObligations(contractId)` | Reads `contract.performanceObligations` | IFRS 15 Step 2 — returns projection of distinct POs |
| `determineTransactionPrice(contractId, {variableConsideration, financingComponent})` | New — appends to `contract.priceAdjustments[]`, re-allocates on relative SSP | IFRS 15 Step 3 — variable consideration + financing adjustments |
| `allocateTransactionPrice(contractId, 'relative-SSP'|'residual')` | Wraps `allocatePrice` + residual fallback | IFRS 15 Step 4 — adds residual method (§79(c)) |
| `recognizeRevenue({contractId, poId, asOfDate})` | v1.0 still accepts same name | IFRS 15 Step 5 (over-time / cost-to-cost / units-delivered) |
| `straightLineRecognition(poRef, period)` | Computes per-month share, calls `recognizeRevenue` with explicit amount | Time-based (licenses, subscriptions) — §B14 |
| `percentageOfCompletion(poRef, costs)` | Wraps `recognizeRevenue` with `method='cost-to-cost'` | Construction / long-term — §B19 |
| `milestoneRecognition(poRef, milestones)` | Walks milestones, calls `recognizeRevenue` per complete milestone | Project-based — milestones carry `amount` or `weight` |
| `contractModification({contractId, change})` | Wraps `modifyContract` | Unifies `change.type` + `change.impact` |
| `billingSchedule(contractId)` | Reads `billings[]` + `subscriptionSchedule.schedule[]` | Tax-invoice schedule independent of recognition |
| `deferredRevenueRollforward({period})` | Alias to `rolloForward(period)` | Same output |
| `journalEntry(contractId, 'billing'|'recognition'|'all')` | New — walks `billings[]` + `recognitions[]` and emits balanced double-entry entries | Self-balancing DR=CR, VAT line on billing, bilingual memos |
| `reconcile(period)` | New — wraps `rolloForward` + identity check + exceptions scan | Asserts opening + additions − recognized = closing |
| `exportForAudit(period)` | New — combines `disclosureReport` + `reconcile` + full contract dump + bilingual glossary | Audit-ready payload |

### 16.2 IFRS 15 five-step model — spec mapping

| Step | Spec method | Reference |
|---|---|---|
| **1. Identify contract** (זיהוי החוזה) | `identifyContract()` | IFRS 15 §9 |
| **2. Identify performance obligations** (זיהוי מחויבויות הביצוע) | `identifyPerformanceObligations()` | IFRS 15 §22 |
| **3. Determine transaction price** (קביעת מחיר העסקה) | `determineTransactionPrice()` | IFRS 15 §47–§72 |
| **4. Allocate transaction price** (הקצאת מחיר העסקה) | `allocateTransactionPrice()` | IFRS 15 §73–§86 |
| **5. Recognize revenue when satisfied** (הכרה בהכנסה) | `recognizeRevenue()`, `satisfyObligation()`, `straightLineRecognition()`, `percentageOfCompletion()`, `milestoneRecognition()` | IFRS 15 §31–§45 |

### 16.3 Allocation methods (Step 4)

| Method | Reference | When to use | Formula |
|---|---|---|---|
| `relative-SSP` (יחסי SSP — default) | IFRS 15 §74 | Standard case: all POs have observable standalone selling prices | `allocated_i = totalPrice × (SSP_i / Σ SSP)` — residue on last line |
| `residual` (שיטת השארית) | IFRS 15 §79(c) | One or more POs have highly variable / uncertain SSP | `allocated_observable = SSP_observable`; residual PO gets `totalPrice − Σ observable` |

Rounding residues are always absorbed on the last obligation so the
sum of allocations is **exactly** the transaction price (integer
agorot).

### 16.4 Recognition methods (Step 5) — timing × method

| Timing | Method | Spec fn | IFRS 15 ref |
|---|---|---|---|
| Point-in-time | Instant | `satisfyObligation()` | §38 |
| Over-time | Straight-line (time-based) | `straightLineRecognition()` | §B14 |
| Over-time | Percentage-of-completion / cost-to-cost | `percentageOfCompletion()` | §B19 |
| Over-time | Milestone (output) | `milestoneRecognition()` | §B15 |
| Over-time | Custom (output / input / cost-to-cost / units-delivered) | `recognizeRevenue()` with `method:` | §35–§45 |

### 16.5 Contract modification treatment table (§18–§21)

| Type (he) | Type (en) | IFRS ref | When it applies | Accounting effect | Catch-up? |
|---|---|---|---|---|---|
| שינוי נפרד (`separate`) | Separate contract | §20 | (i) New distinct goods/services added; AND (ii) price increases by the standalone selling price of those new goods/services | Treated as a **brand new contract**. The old contract is untouched. Existing allocations unchanged. | No |
| שינוי פרוספקטיבי (`prospective`) | Prospective | §21(a) | Remaining goods/services are **distinct** from those already transferred, but the conditions for `separate` are not met | **Termination + creation**: unrecognized consideration + additional price is re-allocated across remaining + new POs on relative SSP. Affects **future** recognition only. | No — past recognition preserved |
| שינוי רטרוספקטיבי (`retrospective`) | Retrospective | §21(b) | Remaining goods/services are **NOT distinct** from those transferred (the obligation is effectively one ongoing promise) | **Cumulative catch-up**: treated as if the modification existed from day 1. Re-allocates total across all POs on relative SSP; for each partially-recognized over-time PO, recognized-to-date is re-based to preserve the progress ratio; a `retrospective-catch-up` entry is booked for the delta. | **Yes** — new `recognitions[]` entry with method `retrospective-catch-up` |

All three flavours are **append-only**: the prior version of the
contract is snapshotted into `contract.history[]`, `version` is
bumped, and a `contract.modified` event is emitted. **Nothing is
ever deleted** — house rule.

### 16.6 Journal entries (double-entry)

`journalEntry(contractId, type)` emits self-balancing DR=CR entries:

**Billing (tax invoice issued):**

```
DR  AR / חייבים                  (net + VAT)
    CR  Deferred Revenue / הכנסות מראש   (net)
    CR  VAT Output / מע"מ עסקאות          (VAT)
```

**Recognition (obligation satisfied or progress made):**

```
DR  Deferred Revenue / הכנסות מראש   (amount)
    CR  Revenue / הכנסות                (amount)
```

Every entry is validated — if DR ≠ CR, a `JE_IMBALANCED` error is
thrown (bilingual). Entries are sorted by date and include bilingual
memos.

### 16.7 v1.1 test coverage map

| Scenario | Test |
|---|---|
| **Step 1** — `identifyContract` with signedDate | `v1.1 Step 1 — identifyContract creates contract with signedDate` |
| **Step 2** — `identifyPerformanceObligations` | `v1.1 Step 2 — identifyPerformanceObligations lists distinct POs` |
| **Step 3** — variable consideration + financing | `v1.1 Step 3 — determineTransactionPrice adjusts for variable consideration` |
| **Step 4** — relative-SSP | `v1.1 Step 4 — allocateTransactionPrice relative-SSP method` |
| **Step 4** — residual | `v1.1 Step 4 — allocateTransactionPrice residual method` |
| Allocation — invalid method | `v1.1 Step 4 — allocateTransactionPrice rejects invalid method bilingually` |
| **Step 5 — straight-line** | `v1.1 Step 5 — straightLineRecognition for 12-month license` |
| Straight-line — out-of-range | `v1.1 straightLineRecognition rejects out-of-range period` |
| **Step 5 — percentage-of-completion** | `v1.1 Step 5 — percentageOfCompletion for construction project` |
| **Step 5 — milestone (explicit amounts)** | `v1.1 Step 5 — milestoneRecognition with explicit amounts` |
| **Step 5 — milestone (by weight)** | `v1.1 milestoneRecognition by weight` |
| **Modification: SEPARATE** (spec alias) | `v1.1 contractModification — separate alias` |
| **Modification: PROSPECTIVE** (spec alias) | `v1.1 contractModification — prospective alias` |
| **Modification: RETROSPECTIVE** (spec alias, with catch-up) | `v1.1 contractModification — retrospective alias with catch-up` |
| Billing schedule independent of recognition | `v1.1 billingSchedule — invoices independent of recognition` |
| Roll-forward (spec alias) | `v1.1 deferredRevenueRollforward — spec alias` |
| **Journal entry — billing (DR AR / CR deferred + VAT)** | `v1.1 journalEntry — billing leg DR AR / CR deferred + VAT` |
| **Journal entry — recognition (DR deferred / CR revenue)** | `v1.1 journalEntry — recognition leg DR deferred / CR revenue` |
| JE double-entry balance | `v1.1 journalEntry — all entries are double-entry balanced` |
| **Reconcile — identity holds** | `v1.1 reconcile — identity holds opening+additions−recognized=closing` |
| **Audit export — bilingual** | `v1.1 exportForAudit — bilingual audit payload` |
| House rule: append-only history | `v1.1 house rule — modifications are append-only, nothing deleted` |
| Five-step end-to-end (spec API) | `v1.1 IFRS 15 five-step model — all spec methods chained` |

Total v1.1 tests: **23 passing, 0 failing.**
Total combined: **60 passing, 0 failing.**

### 16.8 Extended Hebrew glossary (v1.1)

| Hebrew | English | v1.1 symbol |
|---|---|---|
| קווי יישר | Straight-line | `straightLineRecognition` |
| אחוז השלמה | Percentage-of-completion | `percentageOfCompletion` |
| אבן דרך | Milestone | `milestoneRecognition` |
| תמורה משתנה | Variable consideration | `determineTransactionPrice({variableConsideration})` |
| רכיב מימון | Financing component | `determineTransactionPrice({financingComponent})` |
| שיטת השארית | Residual method | `allocateTransactionPrice(_, 'residual')` |
| שיטת SSP יחסי | Relative SSP method | `allocateTransactionPrice(_, 'relative-SSP')` |
| לוח חיוב | Billing schedule | `billingSchedule` |
| פקודת יומן | Journal entry | `journalEntry` |
| חוב וזכות | Debit and credit (DR/CR) | `{dr, cr}` on journal lines |
| חייבים (לקוחות) | AR / Accounts Receivable | `'AR / חייבים'` account label |
| הכנסות מראש | Deferred revenue | `'Deferred Revenue / הכנסות מראש'` |
| מע"מ עסקאות | Output VAT | `'VAT Output / מע"מ עסקאות'` |
| התאמה | Reconciliation | `reconcile` |
| יצוא לביקורת | Audit export | `exportForAudit` |
| זהות היסוד | Fundamental identity (opening + additions − recognized = closing) | `reconcile().identity` |

---

**Never delete — only upgrade and grow.**
לא מוחקים — רק משדרגים ומגדלים.
