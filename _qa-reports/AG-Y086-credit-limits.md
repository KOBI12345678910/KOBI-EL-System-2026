# AG-Y086 — Customer Credit Limit Manager (`CreditLimitManager`)

**Agent:** Y-086
**Swarm:** Mega-ERP Techno-Kol Uzi — Kobi EL (finance vertical)
**Date:** 2026-04-11
**Module:** `onyx-procurement/src/finance/credit-limits.js`
**Tests:**  `onyx-procurement/test/finance/credit-limits.test.js`
**Rule of the house:** **לא מוחקים — רק משדרגים ומגדלים.**

---

## 1. Summary

A zero-dependency, deterministic, bilingual (Hebrew / English) customer
credit-limit engine for the finance vertical of the Mega-ERP
(Techno-Kol Uzi / ONYX procurement layer).

The engine provides:

* Per-customer credit limits with segregation-of-duties approval
  (`setLimit`) — `requestedBy` MUST differ from `approvedBy`.
* Real-time available-credit calculation
  (`availableCredit` = limit − outstanding AR − pending orders).
* Order blocking with optional grace band + append-only override audit
  (`blockOrder`, `overrideBlock`).
* A/B/C/D/E customer credit rating from payment behaviour
  (`rating`) — weighted scorecard, deterministic.
* Limit-increase workflow: `requestIncrease` → `decideIncrease`
  (submit → approve/reject, segregation of duties enforced).
* Dun & Bradstreet Israel + BDI stub (`queryDNB`) with pluggable
  adapters for the injectable data-source layer.
* Collateral, guarantee and trade-credit-insurance registers
  (`collateralTracking`, `guaranteeRegister`, `insuranceRegister`).
* Annual review scheduler (`expireReview`, `markReviewed`).
* Concentration-risk analytics (`concentrationRisk`) — top-customer
  share, top-5 share, and the Herfindahl-Hirschman Index (HHI).
* Master event stream (`eventLog()`) — every mutation is timestamped
  and appended; **nothing is ever deleted**.

Test suite: **28 passing, 0 failing** (`node --test`, zero deps).

---

## 2. Run the tests

```bash
# from repo root
cd onyx-procurement
node --test test/finance/credit-limits.test.js
```

Expected output (abridged):

```
✔ CONSTANTS — enums cover the required domain values
✔ setLimit — creates an active record with Hebrew basis label
✔ setLimit — requestedBy must differ from approvedBy (segregation of duties)
✔ setLimit — supersedes prior active record (never deletes)
✔ availableCredit — limit minus outstanding minus pending
✔ availableCredit — unknown customer returns zero, hasActiveLimit=false
✔ blockOrder — allows when exposure <= limit
✔ blockOrder — blocks when exposure exceeds limit
✔ blockOrder — grace band lets small overages through
✔ blockOrder — unknown customer is blocked by default
✔ overrideBlock — appends a logged override entry (never deleted)
✔ overrideBlock — requires orderId, approver and reason
✔ rating — A grade for clean payment history
✔ rating — E grade for chronically bad payer
✔ rating — no history = E (score 0)
✔ rating — B/C grades are scaled linearly
✔ requestIncrease — workflow submit → decide approved
✔ requestIncrease — rejects when newLimit not above current
✔ queryDNB — returns shell when no adapter injected
✔ queryDNB — calls injected DNB + BDI adapters
✔ collateralTracking — persisted with Hebrew label
✔ guaranteeRegister — tracks personal/bank/insurance guarantees
✔ insuranceRegister — only approved insurers accepted
✔ expireReview — lists limits whose nextReview is overdue
✔ markReviewed — pushes nextReview forward, keeps history
✔ concentrationRisk — top customer share and HHI
✔ concentrationRisk — empty manager returns zero totals
✔ house rule — nothing is ever deleted
ℹ tests 28
ℹ pass  28
ℹ fail  0
```

---

## 3. Rating methodology — דירוג לקוחות

The rating function is a **deterministic weighted scorecard**. Inputs
arrive from the injected `getPaymentHistory(customerId)` adapter; every
sub-score is normalised to `0..100` and the weighted total maps to an
A..E grade.

### 3.1 Inputs

| Field            | Source                                  | Notes |
|------------------|------------------------------------------|-------|
| `totalPayments`  | count of closed customer invoices         | integer, ≥ 0 |
| `onTimePayments` | how many were paid on/before due date     | integer |
| `avgDaysToPay`   | weighted mean days from invoice → paid    | number of days |
| `bouncedChecks`  | count of returned ("NSF") customer checks | integer |
| `openDisputes`   | active customer disputes over invoices    | integer |

Zero-history customers (`totalPayments <= 0`) short-circuit to grade
**E, score 0**, with a `noHistory: true` flag. A greenfield customer
is **not** a clean customer — the credit department MUST onboard them
through BDI / D&B / financial-statements channels before sales can
ship on terms.

### 3.2 Sub-scores

| Sub-score        | Weight | Formula                                               |
|------------------|-------:|--------------------------------------------------------|
| On-time ratio    |  40 %  | `min(100, (onTimePayments / totalPayments) * 100)`     |
| Days to pay      |  25 %  | `100` if ≤30d, `0` if ≥90d, linear between             |
| Bounced checks   |  20 %  | `max(0, 100 − bouncedChecks * 20)` (5+ bounces = 0)    |
| Open disputes    |  15 %  | `max(0, 100 − openDisputes * 33.33)` (3+ disputes = 0) |

### 3.3 Grades

| Grade | Total score | Hebrew label                    | Suggested policy             |
|:-----:|:-----------:|---------------------------------|------------------------------|
| **A** |     ≥ 85    | מצוין — סיכון נמוך              | Net-60, limit expansion OK   |
| **B** |     ≥ 70    | טוב — סיכון נמוך-בינוני         | Net-45, regular review       |
| **C** |     ≥ 55    | בינוני — סיכון בינוני           | Net-30, watch-list            |
| **D** |     ≥ 40    | חלש — סיכון גבוה                 | CAD or 50 % prepayment        |
| **E** |     < 40    | גרוע — סיכון קריטי              | No open terms; cash only      |

### 3.4 Why this methodology

1. Every sub-score is independently testable and has clear Hebrew
   operational meaning (e.g. *צ'קים חוזרים* ≡ bounced checks = deal
   killer for a construction-materials procurement ERP).
2. Weights bias the score toward **behaviour we actually observe**
   (on-time + DPO = 65 %), not external bureau data. Bureau data
   should instead drive the *`basis` field* when `setLimit` is called.
3. Thresholds match the Israeli practice of *policy bands*:
   grade-A customers get Net-60 (the "big box" retailer pattern);
   grade-E customers ship CAD (cash against documents) only.
4. The function is pure and deterministic — unit tests can lock
   exact scores, auditors can reproduce grades.

---

## 4. BDI / D&B Israel integration note

> **BDI** (Business Data Israel, `bi.co.il`) is the dominant Israeli
> commercial credit bureau. It is the de-facto source that local
> CFOs check before extending material terms to a new counterparty.
> **Dun & Bradstreet Israel** (`dbisrael.co.il`) is the local D&B
> franchise and is the international-facing equivalent.

### 4.1 What this module does *not* do

* **No network I/O.** The module has zero dependencies and never
  calls `fetch`, `http`, `https`, or any HTTP client. It will never
  leak a customer-id to a third-party endpoint on its own.

### 4.2 What it does instead

`queryDNB(customerId)` accepts an adapter contract through the
constructor:

```js
const mgr = new CreditLimitManager({
  dataSources: {
    dnb: { query: (customerId) => ({ paydex: 80, riskLevel: 'low' }) },
    bdi: { query: (customerId) => ({ rating: 3, openLiens: 0 }) },
  },
});
```

Each adapter MUST implement a single synchronous `query(customerId)`
method (promises are also acceptable if the caller awaits them in
the orchestration layer). The module:

* Calls both adapters when present and merges results into
  `{ dnb, bdi, source }`.
* Falls back to a deterministic stub `{ dnb: null, bdi: null, source: 'stub' }`
  when no adapter is injected — lets you unit-test the credit
  workflow without network.
* Writes a `dnb.query` event to the master event log each call, so
  a compliance audit can reconstruct who-asked-about-whom-and-when
  (important for GDPR/Israeli Privacy Protection Law, חוק הגנת הפרטיות).

### 4.3 How to wire a real BDI adapter

The recommended shape for the adapter lives in its own file,
outside this module (`src/integrations/bdi-client.js` in the
real system). It should:

1. Hold the BDI service credentials behind a secret-manager hook
   (never commit API keys — see `SECURITY_MODEL.md`).
2. Cache results per customer with a TTL (BDI queries cost money
   per look-up; daily/weekly cache is the norm).
3. Map BDI response codes → a normalised `{ rating, paydex,
   openLiens, commentaries: [...] }` envelope so the adapter can
   be swapped (BDI → D&B → Coface Globaliris) without touching
   this module.
4. Handle BDI's 3-digit rating (`AAA`, `AA`, `A`, `BBB` …) and
   convert it into our internal A..E banding only when used
   as the `basis` argument of `setLimit`.

---

## 5. Guarantee types — סוגי ערבויות

Israeli practice distinguishes three guarantee instruments, each
with different enforcement costs and realisation speed.

| Type (English) | Hebrew        | Issued by                    | Enforceability                      | Typical use |
|----------------|---------------|------------------------------|-------------------------------------|-------------|
| `personal`     | ערבות אישית   | owner / director personally  | Requires court — slow, messy, but cheap to obtain | Small family-owned customers; owner signs |
| `bank`         | ערבות בנקאית  | an Israeli commercial bank   | Unconditional on-demand = fastest cash; highest trust | Large contracts, long-tail exposure |
| `insurance`    | ערבות ביטוחית | a licensed insurer           | Similar to bank but cheaper for the customer to hold; realisation slower than bank | Medium contracts; construction projects |

**Collateral** types are separate (`deposit` / `guarantee` / `lien`)
and are tracked under `collateralTracking()`:

| Type       | Hebrew   | What it means |
|------------|----------|---------------|
| `deposit`  | פיקדון   | Cash held in escrow or bank |
| `guarantee`| ערבות    | Backing document (bank/personal/insurance) |
| `lien`     | שעבוד    | First-priority lien on an asset (שעבוד ראשון) |

**Trade-credit insurance** (ביטוח אשראי) is a third, independent
layer — handled by `insuranceRegister()`. Approved insurers (as of
2026): Euler Hermes, Atradius, Coface, Clal. All four are active
in the Israeli market; Clal is the largest local player.

---

## 6. Hebrew glossary — מילון עברי-אנגלי

| Hebrew              | Transliteration       | English                              |
|---------------------|-----------------------|--------------------------------------|
| מסגרת אשראי         | misgeret ashra'i      | Credit limit                         |
| ניצול מסגרת         | nitzul misgeret       | Credit utilization                   |
| אשראי פנוי          | ashra'i panui         | Available credit                     |
| יתרת חוב פתוחה      | yitrat khov ptukha    | Outstanding AR balance               |
| הזמנות ממתינות      | hazmanot mamtinot     | Pending orders                       |
| חסימת הזמנה         | khasimat hazmana      | Order block                          |
| עקיפת חסימה         | akifat khasima        | Block override                       |
| הנהלת חשבונות       | hanhalat kheshbonot   | Bookkeeping / accounting             |
| תנאי תשלום          | tnai tashlum          | Payment terms                        |
| שוטף + 30 / 60 / 90 | shotef + 30           | Net-30 / 60 / 90                     |
| צ'ק חוזר            | check khozer          | Bounced check (NSF)                  |
| מחלוקת              | makhloket             | Dispute                              |
| ימי אשראי ממוצעים   | yamei ashra'i         | DPO — days payable outstanding       |
| דירוג לקוח          | dirug lakoakh         | Customer rating                      |
| נתוני אשראי עסקיים  | netunei ashra'i       | BDI = Business Data Israel           |
| ערבות אישית         | arvut ishit           | Personal guarantee                   |
| ערבות בנקאית        | arvut bankait         | Bank guarantee                       |
| ערבות ביטוחית       | arvut bituhit         | Insurance guarantee                  |
| שעבוד ראשון         | shi'abud rishon       | First-priority lien                  |
| פיקדון              | pikadon               | Deposit                              |
| ביטוח אשראי         | bituah ashra'i        | Trade-credit insurance               |
| ריכוזיות לקוחות     | rikuziyut lakokhot    | Customer concentration (risk)        |
| סקירה שנתית         | skira shnatit         | Annual review                        |
| הפרדת סמכויות       | hafradat samkuyot     | Segregation of duties                |
| מסמכי תמיכה         | mismahei tmicha       | Supporting documents                 |

---

## 7. House-rule audit — "לא מוחקים, רק משדרגים ומגדלים"

The engine contains **zero** `delete` / `splice` / `shift` / `pop`
operations on any store. The house rule is enforced structurally:

* `setLimit` on an existing customer **supersedes** the prior
  record (`active = false`, `supersededAt` stamped). The prior
  record stays in `limitHistory(customerId)` with its full
  history array intact. Tested in
  `setLimit — supersedes prior active record (never deletes)`.
* `overrideBlock` **appends** to `_overrides[]`. Tested in
  `overrideBlock — appends a logged override entry (never deleted)`.
* `collateralTracking` / `guaranteeRegister` / `insuranceRegister`
  **append** to `_collaterals[] / _guarantees[] / _insurances[]`.
  When queried, *expiry-based `status`* is re-evaluated lazily into
  a clone — the underlying stored record is never mutated.
* `markReviewed` pushes a new history event and updates the review
  frequency pointer — the pre-review frozen state is still
  reconstructible from `history[]`.
* The master `eventLog()` is append-only and covers every mutation.
  Tested in the `house rule — nothing is ever deleted` assertion.

---

## 8. Data-source contract

The manager is **agnostic to the backing store**. To plug it into
the real ERP, inject the four adapters at construction:

```js
const mgr = new CreditLimitManager({
  clock: () => Date.now(),
  gracePct: 5,
  reviewMonths: 12,
  dataSources: {
    getOutstandingAR:  (customerId) => arLedger.openBalanceFor(customerId),
    getPendingOrders:  (customerId) => salesOrders.pendingTotalFor(customerId),
    getPaymentHistory: (customerId) => arHistory.summaryFor(customerId),
    dnb: require('../integrations/dnb-client'),
    bdi: require('../integrations/bdi-client'),
  },
});
```

All four adapters are **optional** — the module falls back to safe
defaults (outstanding=0, pending=0, history={}, no bureau look-up)
so it can be unit-tested in isolation and so a staging environment
with no real AR ledger still runs end-to-end.

---

## 9. Concentration-risk formulas

`concentrationRisk()` walks every known customer and returns:

* `totalAR` — sum of outstanding AR across all customers
* `top[]`   — descending list of the top 10 customers with
  `{ customerId, outstanding, share, limit }`
* `top1Share` — share of the single biggest customer (0..1)
* `top5Share` — cumulative share of the top five customers (0..1)
* `hhi`     — the Herfindahl-Hirschman Index, computed as the sum
  of squared shares expressed as percentages:
  `HHI = Σ(shareᵢ × 100)²`, range `0..10_000`
* `concentrated` — boolean flag raised when **any** of:
  * `top1Share > 0.20` (single customer > 20 %)
  * `top5Share > 0.50` (top-5 > 50 %)
  * `hhi > 2500`      (DOJ/FTC "highly concentrated" threshold)

The DOJ/FTC benchmark (`hhi > 2500 → highly concentrated`) is the
same one used for antitrust analysis and translates well to
customer-base health: a receivables book with HHI > 2500 is a
*fragile* book — losing one or two customers would take down
working capital.

---

## 10. Open questions / next agents

* **Y-087 — cash-application matcher.** The `getPaymentHistory`
  adapter needs a real feeder. A downstream agent should walk the
  bank reconciliation module and aggregate `paid / bounced / dpo`
  per customer.
* **Y-088 — BDI REST client.** Stand up the actual
  `src/integrations/bdi-client.js` behind the adapter contract
  documented in §4.3.
* **Y-089 — credit-committee UI.** The workflow state-machine
  exists (`requestIncrease` → `decideIncrease`) but needs a
  thin UI route at `/finance/credit/committee`.
* **Y-090 — email alerts.** `expireReview()` returns overdue
  records; a daily job should email the credit officer and page
  the CFO when the overdue list exceeds five customers or ten
  million ILS aggregated limit.

---

## 11. Sign-off

* Module file:  `onyx-procurement/src/finance/credit-limits.js` — 646 lines, zero deps
* Test file:    `onyx-procurement/test/finance/credit-limits.test.js` — 28 tests, all passing
* House rule:   **enforced & tested**
* Hebrew/English: **bilingual throughout**
* Ready for:    Y-087 cash-application matcher + Y-088 BDI REST client wiring
