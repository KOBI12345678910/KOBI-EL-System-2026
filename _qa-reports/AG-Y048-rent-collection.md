# AG-Y048 — Rent Collection System (גביית שכר דירה)

**Agent:** Y-048
**Swarm:** 3C — Real Estate Operations
**Wave:** 2026
**Module:** `onyx-procurement/src/realestate/rent-collection.js`
**Tests:** `onyx-procurement/test/realestate/rent-collection.test.js`
**Status:** IMPLEMENTED — 41 / 41 passing
**Rule of the house:** לא מוחקים רק משדרגים ומגדלים — file never to be deleted, only enhanced.

---

## 1. Purpose

End-to-end rent collection engine tailored to the Israeli residential and
commercial rental market. Implements:

- Month-by-month schedule generation from a `Lease`
- Payment capture across six methods (check / transfer / cash /
  standing-order / Paybox / Bit)
- Post-dated check bank (**בנק שיקים**) — the customary 12+ checks an
  Israeli tenant deposits at lease signing
- Bilingual late-payment notices with compounding default interest
  (**ריבית פיגורים**) per Israeli law
- Aging buckets (1-30 / 31-60 / 61-90 / 90+) per landlord
- Bounced-check handling per **חוק שיקים ללא כיסוי, התשמ"א-1981**
- Standing-order batch file suitable for Masav-compatible direct debit
- 1099-equivalent annual landlord income summary for the Israeli annual
  tax return (סעיף 2(6) / סעיף 122 — 10% regime)

Zero external dependencies. Pure functions where possible. Instance state
is stored inside the `RentCollection` instance (additive, never deletes);
every returned object is frozen so callers cannot corrupt the ledger.

Designed to plug into:
- the landlord portal (UI)
- the annual-tax package that aggregates rental income
- the reminders / SMS service that runs `generateLateNotice`
- the Masav exporter in `src/bank-files/`

---

## 2. Public API

```js
const {
  RentCollection,
  CONSTANTS,
  LAW_CITATIONS,
  LABELS,
  PAYMENT_METHODS,
  CHECK_STATUSES,
} = require('./src/realestate/rent-collection');

const engine = new RentCollection({ today: '2026-04-11' });
engine.addLease(lease);
const schedule = engine.scheduleRent(lease.id);
engine.checkBankRegister({ leaseId, checks });
engine.recordPayment({ leaseId, period, amount, method, reference, paymentDate });
const notice = engine.generateLateNotice(leaseId, period);
const report = engine.aging('Uzi Cohen');
const bounce = engine.bouncedCheckHandling(checkId);
const batch = engine.standingOrderFile('Leumi');
const annual = engine.tax1099('2026');
```

### Class `RentCollection(options?)`

| Option   | Type   | Meaning |
|----------|--------|---------|
| `today`  | string | ISO date used as "now" — makes reports deterministic for tests |
| `logger` | object | Optional structured logger (BYO — not called yet) |

### `addLease(lease)`
Registers a lease. Re-registering an existing ID upgrades the record in
place (rule of the house). Returns the frozen normalized lease.

### `scheduleRent(leaseId)`
Walks month-by-month from `startDate` → `endDate`, generating one row per
month. Applies annual `indexation` compounding on each anniversary year.
Due day is clamped to the month's last day when needed (`31 → 28/29/30`).
Returns a frozen array of `{ period, dueDate, amount, cumulative, index }`.

### `recordPayment(entry)`
Validates `method ∈ PAYMENT_METHODS`, `amount > 0`, presence of `leaseId`,
`period`, `paymentDate`. Stores a frozen payment record. When
`method === 'check'` and `reference` matches a registered check number,
the corresponding entry in the check bank is upgraded to `cleared`
(never deleted).

### `checkBankRegister({ leaseId, checks })`
Adds a batch of post-dated checks to the lease's ledger. Duplicate check
numbers are upgraded in place — the ledger count is monotonic
(never shrinks). Returns a frozen snapshot of the whole ledger, sorted
by `dueDate` ascending.

### `generateLateNotice(leaseId, period)`
Computes `outstanding = principal − totalPaid(period)` and
`daysLate = today − (dueDate + graceDays)` (0 when not yet late).
Interest is **compounding daily**:
```
dailyRate = (1 + annualRate) ** (1/365) − 1
interest  = outstanding * ((1 + dailyRate) ** daysLate − 1)
```
Returns a frozen object with both Hebrew and English notice text in
`.text.he` / `.text.en`, plus the citation.

### `aging(landlord)`
Walks every registered lease belonging to `landlord`, then each scheduled
period whose `dueDate + graceDays < today`. Buckets outstanding balances
into:

| Bucket        | Days late range | Key              |
|---------------|-----------------|------------------|
| 1-30          | 1 ≤ d ≤ 30      | `bucket_1_30`    |
| 31-60         | 31 ≤ d ≤ 60     | `bucket_31_60`   |
| 61-90         | 61 ≤ d ≤ 90     | `bucket_61_90`   |
| 90+           | d > 90          | `bucket_90_plus` |

Returns `{ landlord, today, totals, bucket_*, details[] }` — all frozen.

### `bouncedCheckHandling(checkId)`
Finds the check (by `id = CHK-leaseId-number` or by bare number when the
number is globally unique), marks it `bounced`, appends an event to
`bouncedEvents`, then returns:

```js
{
  event, status: 'bounced',
  countInWindow,    // # of bounces for same tenant in last 12 months
  threshold: 10,
  restrictedRisk,   // true once countInWindow >= threshold
  restrictionPeriodMonths: 12,
  suggestedActions: [ {code, he, en}, ... ],
  legalCitation: { he: '...', en: '...' },
}
```

### `standingOrderFile(bank?)`
Assembles a batch of upcoming charges for the given bank (or all banks
when omitted). Priority: pending checks at that bank. When no pending
checks exist the helper falls back to the raw schedule so pure
standing-order leases are still covered. Emits:

- `rows[]`  — structured records (`leaseId`, `bank`, `dueDate`, `amount` …)
- `text`    — pipe-delimited, human-readable, bilingual header
- `count`, `totalAmount`, `generatedAt`

### `tax1099(period)`
`period` accepts `'YYYY'` or `'YYYY-MM'`. Walks all payments in scope,
groups by landlord, computes:

- `grossRental` — total received
- `byMethod`    — subtotals per payment method
- `byTenant[]`  — per-tenant breakdown
- `estimatedTaxSection122 = grossRental * 0.10`

The 10% regime in **פקודת מס הכנסה סעיף 122** is an optional path for
residential rental income, so this figure is only an **estimate** and is
labeled as such in the report.

---

## 3. Payment methods

| Method           | Code             | Hebrew         | Typical Israeli usage |
|------------------|------------------|----------------|------------------------|
| Check            | `check`          | שיק            | Post-dated bundle at signing |
| Bank transfer    | `transfer`       | העברה בנקאית   | Ad-hoc single payment  |
| Cash             | `cash`           | מזומן          | Short-term / informal  |
| Standing order   | `standing-order` | הוראת קבע      | Long-term residential  |
| Paybox           | `paybox`         | פייבוקס        | Peer-to-peer P2P       |
| Bit              | `bit`            | ביט            | Peer-to-peer P2P       |

Cash > 11,000 ILS per transaction is restricted by חוק צמצום השימוש
במזומן, התשע"ח-2018 — not enforced in this engine, but callers should
validate at the UI / API edge.

---

## 4. Israeli check law (חוק שיקים ללא כיסוי, התשמ"א-1981)

The classic Israeli rental scenario: the tenant deposits 12 post-dated
checks at signing. Each month the landlord deposits the next one. A
bounced check is not just a payment failure — it has legal consequences
under **חוק שיקים ללא כיסוי**:

- **Threshold:** once a tenant has **10 bounced checks in 12 months**
  (or 15 in 24 months) the bank must place them on the
  **"לקוח מוגבל"** (restricted customer) list.
- **Restriction period:** 12 months — the customer cannot open new
  checking accounts or draw new checks at any Israeli bank.
- **Enforcement:** a dishonored check is also a valid debt instrument
  for **הוצאה לפועל** (execution), without needing a judgment.

`bouncedCheckHandling(checkId)` returns a `countInWindow` based on the
tenant's own bounce history in the last 12 months, flips
`restrictedRisk` once the threshold is crossed, and adds a
`REPORT_RESTRICTED_CUSTOMER` suggested action. The engine never
actually files a report — it only flags the risk and records the state.

Suggested-action codes emitted:

| Code                         | Hebrew                                           | English                                          |
|------------------------------|--------------------------------------------------|--------------------------------------------------|
| `NOTIFY_TENANT`              | שלח הודעה רשמית לשוכר על החזרת השיק              | Send formal notice to tenant about bounced check |
| `RESUBMIT_OR_COLLECT`        | הצג את השיק שוב לבנק או דרוש תשלום חלופי         | Resubmit the check or demand alternative payment |
| `ADD_LATE_INTEREST`          | הוסף ריבית פיגורים מיום הפירעון המקורי           | Add late interest from original due date         |
| `CONSIDER_ENFORCEMENT`       | שקול פתיחת תיק הוצל"פ בגין שיק ללא כיסוי         | Consider opening a Hotzaa LaPoal execution file  |
| `REPORT_RESTRICTED_CUSTOMER` | לקוח עבר את רף 10 שיקים ב-12 חודשים              | Tenant eligible for "restricted customer" list   |

---

## 5. Late interest formula (ריבית פיגורים)

Based on **חוק פסיקת ריבית והצמדה, התשכ"א-1961** and customary market
practice for residential leases. The statutory default annual rate is
4% + CPI; this module uses a flat 4% (`CONSTANTS.LATE_INTEREST_ANNUAL`)
so tests are deterministic. Callers can override per-lease via
`lease.latePenaltyRate`.

**Compounding daily** (standard practice for long delay windows):

```
annualRate = 0.04               (or lease override)
dailyRate  = (1 + annualRate) ** (1/365) − 1
interest   = outstanding * ((1 + dailyRate) ** daysLate − 1)
totalDue   = outstanding + interest
```

Where:
- `outstanding = principal − totalPaid(period)`
- `daysLate    = today − (dueDate + graceDays)`, clamped to `≥ 0`
- `graceDays`  = customary Israeli grace period (default 7)

**Example** — 6,000 ILS principal, 30 days late, 4% annual:
```
interest ≈ 6000 * ((1.04) ** (30/365) − 1) ≈ 19.37 ILS
```

The test `interest compounds over 30 days` verifies the figure stays in
the 19–21 ILS window across Node versions.

**No interest on intra-grace-period lateness** — if a payment arrives
on or before `dueDate + graceDays`, the notice still generates (for
record-keeping) but `daysLate = 0` and `interest = 0`.

---

## 6. Aging bucket definition

```
daysLate = today − (dueDate + graceDays)

1-30   :  1 ≤ daysLate ≤ 30
31-60  : 31 ≤ daysLate ≤ 60
61-90  : 61 ≤ daysLate ≤ 90
90+    : daysLate > 90
```

Design notes:
- **Future periods are excluded** — no false positives.
- **Fully paid periods drop out** — partial payments roll into the
  first bucket that matches the remaining balance.
- **Landlord-scoped** — a single engine can hold multiple landlords'
  books without cross-contamination.
- **Deterministic via `today`** — every test constructs
  `new RentCollection({ today: '2026-04-11' })` so the aging math is
  reproducible.

The lead fixture in the test suite is engineered so that a tenant with
four missed periods (Jan / Feb / Mar / Apr of 2026 as of April 11) lands
exactly one period in each of the four buckets.

---

## 7. Standing-order file format

Masav (**מס"ב** — Israeli Bank Clearing) is the national direct-debit
clearing system. Rather than emit a real Masav fixed-width payload
(which requires live bank codes and clearing dates the caller controls),
this module emits a portable pipe-delimited representation plus a
typed `rows[]` array. Callers in `src/bank-files/` convert to whichever
real format (Masav fixed-width, ISO 20022 pain.008, SWIFT MT, etc.)
their landing bank requires.

**Row columns:**
```
leaseId | tenant | bank | branch | account | period | dueDate |
amount | currency | reference | type
```

- `type = 'check'` when the row comes from a registered post-dated check
- `type = 'standing-order'` when the row is a pure standing-order charge
  derived from the schedule

The header block is bilingual and includes the filter bank, row count,
and generation date.

---

## 8. 1099 equivalent — Israeli landlord tax report

Israel has no form literally called "1099", but a residential landlord
must declare rental income on their annual return. Two regimes:

| Path | Citation | Rate | Notes |
|------|----------|------|-------|
| Normal marginal | סעיף 2(6) | Marginal (10–50%) | Itemized deductions allowed |
| 10% regime      | סעיף 122  | 10% on gross      | No deductions; residential only |

`tax1099(period)` returns:

```js
{
  period,
  periodType: 'year' | 'month',
  count: N,
  reports: [{
    landlord,
    period,
    periodType,
    grossRental,
    byMethod:  { check, transfer, cash, 'standing-order', paybox, bit },
    byTenant:  [{ tenant, leaseId, property, amount, count }],
    paymentCount,
    estimatedTaxSection122,
    citation,
    generatedAt,
  }],
}
```

`estimatedTaxSection122` is intentionally labeled "estimated" — the real
choice between the 10% regime and the marginal path depends on the
landlord's total income and deductions and must be finalized in the
annual-tax package, not here.

---

## 9. Hebrew glossary

| Hebrew                  | English                          | Used by                           |
|-------------------------|----------------------------------|-----------------------------------|
| שכר דירה                | Rent                             | `scheduleRent`, `recordPayment`   |
| חוזה שכירות             | Lease agreement                  | `addLease`                        |
| משכיר                   | Landlord                         | `aging`, `tax1099`                |
| שוכר                    | Tenant                           | `aging`, `bouncedCheckHandling`   |
| בנק שיקים               | Check bank (ledger)              | `checkBankRegister`               |
| שיק דחוי                | Post-dated check                 | `checkBankRegister`               |
| הוראת קבע               | Standing order                   | `standingOrderFile`, `recordPayment` |
| העברה בנקאית            | Bank transfer                    | `recordPayment`                   |
| מזומן                   | Cash                             | `recordPayment`                   |
| פייבוקס                 | Paybox                           | `recordPayment`                   |
| ביט                     | Bit                              | `recordPayment`                   |
| ריבית פיגורים           | Late interest                    | `generateLateNotice`              |
| תקופת חסד               | Grace period                     | `generateLateNotice`, `aging`     |
| שיק ללא כיסוי           | Bounced check                    | `bouncedCheckHandling`            |
| לקוח מוגבל              | Restricted customer              | `bouncedCheckHandling`            |
| הוצאה לפועל             | Execution (collection proceedings)| `bouncedCheckHandling`           |
| הוצל"פ                  | Execution (acronym)              | `bouncedCheckHandling`            |
| דירת מגורים מזכה        | Qualifying residence             | referenced by `tax1099` path      |
| מס הכנסה                | Income tax                       | `tax1099`                         |
| פקודת מס הכנסה          | Income Tax Ordinance             | `tax1099`                         |
| דוח שנתי                | Annual return                    | `tax1099`                         |
| מדד המחירים לצרכן       | Consumer Price Index (CPI)       | `indexation` in `scheduleRent`    |
| מס"ב                    | Masav (bank clearing)            | `standingOrderFile`               |
| התראת פיגור             | Late notice                      | `generateLateNotice`              |

---

## 10. Test coverage — `test/realestate/rent-collection.test.js`

**41 tests / 11 suites / all passing.**

| Suite                   | Tests | Scope                                                        |
|-------------------------|-------|--------------------------------------------------------------|
| constants               | 5     | `PAYMENT_METHODS`, `CHECK_STATUSES`, `CONSTANTS`, citations  |
| _internals              | 4     | `round2`, `addDays`, `addMonths` clamp, `daysBetween`        |
| addLease + scheduleRent | 4     | 12-month schedule, indexation, errors, frozen output        |
| recordPayment           | 4     | 6 methods, invalid method, invalid amount, check→cleared    |
| checkBankRegister       | 4     | 12 post-dated checks, sort, dup upgrade, validation         |
| generateLateNotice      | 6     | Grace, 1-day, 30-day compounding, partial, bilingual, err   |
| aging                   | 4     | 4 buckets, payments drop, landlord filter, future excluded  |
| bouncedCheckHandling    | 3     | First bounce, threshold flip, not-found                     |
| standingOrderFile       | 3     | Per-bank filter, all banks, fallback to schedule            |
| tax1099                 | 3     | Year aggregation, month scope, malformed period             |
| end-to-end smoke        | 1     | Full flow: 12 checks → partial clear/bounce → notice → 1099 |

Run locally:
```bash
cd onyx-procurement
node --test test/realestate/rent-collection.test.js
```

---

## 11. Rule-of-the-house audit

- [x] **Zero external dependencies** — only `node:test` + `node:assert` in the
      test file, both Node built-ins.
- [x] **Never deletes** — `checkBankRegister` upgrades in place; payments
      and bounced events append only; `Map` state is additive throughout.
- [x] **Never mutates caller data** — inputs are normalized/cloned; all
      returned objects are frozen.
- [x] **Bilingual** — every user-facing surface (late notice, suggested
      actions, citations, labels) is in Hebrew AND English.
- [x] **Deterministic** — `today` is injectable for tests; no `Date.now()`
      calls inside the hot paths once the engine is constructed.
- [x] **Israeli tax compliance** — cites חוק השכירות והשאילה, חוק שיקים
      ללא כיסוי, חוק פסיקת ריבית והצמדה, and פקודת מס הכנסה ס' 2(6)/122.
- [x] **Additive-only file** — this module is to be upgraded, never
      deleted. Future additions should extend `RentCollection` via new
      methods or augment `CONSTANTS` / `LAW_CITATIONS`.

---

## 12. Next-wave upgrade backlog (never delete — only grow)

Ideas for successor agents:

1. **CPI linking** — swap the flat `indexation` factor for a real CPI
   table from `src/tax/betterment-tax.js#CPI_TABLE`. Same input
   signature.
2. **Masav emitter** — wrap `standingOrderFile()` in a real
   fixed-width Masav writer in `src/bank-files/masav.js`.
3. **Reminders integration** — wire `generateLateNotice` into
   `src/notifications/` to fire SMS + email at Day 1 / Day 7 / Day 30.
4. **Security deposits (פיקדון)** — track deposit receipt, interest
   accrual, and end-of-lease deductions; new method `deposit(leaseId)`.
5. **Partial-allocation FIFO** — when a payment doesn't reference a
   period, auto-allocate to the oldest outstanding period first.
6. **Multi-currency** — USD/EUR leases (common for short-term furnished
   apartments); plug into `src/fx/`.
7. **Hoa / Va'ad bayit** — building committee fees alongside rent, same
   schedule engine.
8. **Form 5329 generator** — turn `tax1099()` into a printable
   attachment to the annual return.

---

## 13. Law citations — quick reference

| Reference                                          | Covers                                    |
|----------------------------------------------------|-------------------------------------------|
| חוק השכירות והשאילה, התשל"א-1971                   | Lease terms, tenant/landlord obligations  |
| חוק שיקים ללא כיסוי, התשמ"א-1981                   | Bounced checks, restricted-customer list  |
| חוק פסיקת ריבית והצמדה, התשכ"א-1961                | Default interest (ריבית פיגורים)          |
| פקודת מס הכנסה [נוסח חדש], התשכ"א-1961, סעיף 2(6) | Rental income as taxable income           |
| פקודת מס הכנסה, סעיף 122                            | 10% regime for residential rental income  |
| חוק צמצום השימוש במזומן, התשע"ח-2018               | Cash transaction ceilings (≥11,000 ILS)   |
| חוק ההוצאה לפועל, התשכ"ז-1967                       | Execution proceedings for dishonored checks |

---

**Generated:** 2026-04-11
**File:** `_qa-reports/AG-Y048-rent-collection.md`
**Status:** IMPLEMENTED — 41 / 41 passing
**Never delete — only upgrade and grow.**
