# AG-X44 — Petty Cash / Imprest Fund Management

**Agent**: X-44
**Swarm**: 3C
**Date**: 2026-04-11
**Target**: `onyx-procurement` — Techno-Kol Uzi mega-ERP
**Task**: Multi-fund petty cash manager with full imprest-system controls, voucher ledger, replenishment workflow, daily cash count, variance investigation, auto-GL posting and Israeli cash-law compliance
**Rules respected**: never delete (soft status only), Hebrew bilingual, zero dependencies

---

## 1. Summary

Agent X-44 delivered a complete **imprest petty cash** module for Techno-Kol.
The module lets finance run any number of location-based cash floats
(e.g. HQ, warehouse, branch), enforces every standard internal-control
safeguard (segregation of duties, sequential voucher numbering, receipt &
tax-invoice thresholds, surprise audits), and auto-posts balanced journal
entries on replenishment.

All Israeli legal constraints are wired in:

- **Receipt** required above **₪50** (internal policy)
- **Tax invoice** (חשבונית מס) required above **₪300** for VAT deduction
- **Cash-Law 2018** (חוק צמצום השימוש במזומן) hard cap at **₪6,000** per
  transaction for business-to-anyone payments
- **17% VAT** auto-derived from gross when a tax invoice is present

Delivered as zero-dep vanilla JS that runs under plain Node ESM or can be
consumed via CommonJS / Jest. Passing **20/20** tests.

---

## 2. Deliverables

| # | File | Purpose | LOC |
|---|------|---------|-----|
| 1 | `onyx-procurement/src/cash/petty-cash.js` | Imprest fund engine | ~780 |
| 2 | `test/payroll/petty-cash.test.js` | 20 test cases, zero-dep harness | ~420 |
| 3 | `_qa-reports/AG-X44-petty-cash.md` | This report | — |

---

## 3. Domain model

### 3.1 Fund (קופה)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string `FND-00001` | sequential |
| `name`, `nameHe` | string | bilingual |
| `floatAmount` | number (ILS) | fixed imprest |
| `currentBalance` | number | DR float → disbursements → replenish |
| `custodianId` | string | responsible employee |
| `approverIds` | string[] | must exclude custodian |
| `location` | string | HQ / warehouse / branch |
| `currency` | string | default ILS |
| `categories` | array | GL-coded expense buckets |
| `status` | enum | `active` / `suspended` / `closed` |
| `lastCountAt`, `lastReplenishAt` | ISO | for surprise-audit SLA |
| `totalDisbursed`, `totalReplenished` | number | aggregates |

### 3.2 Voucher (תלוש)

| Field | Notes |
|-------|-------|
| `id` | `FND-00001-V000007` — sequential per fund |
| `sequenceNo` | integer, monotone, per fund |
| `payee`, `amount`, `category`, `date` | standard |
| `net`, `vatAmount`, `vatRate`, `vatRecoverable` | VAT split |
| `receiptRef` | mandatory > ₪50 |
| `taxInvoiceRef` | mandatory > ₪300 |
| `issuedBy`, `approverId`, `custodianSig` | audit trail |
| `status` | `draft / issued / paid / replenished / voided / rejected` |

### 3.3 Replenishment (חידוש קופה)

| Field | Notes |
|-------|-------|
| `id` | `REP-00001` |
| `fundId`, `requesterId`, `approverId`, `issuedAt` | workflow |
| `vouchersBatch[]` | ids of PAID vouchers absorbed |
| `amount` | sum of batch |
| `allocation{categoryCode: {amount, net, vat}}` | for JE lines |
| `status` | `requested → approved → issued → posted` (or `rejected`) |
| `journalEntry{lines, totalDebit, totalCredit}` | balanced DE |

### 3.4 Count (ספירה)

| Field | Notes |
|-------|-------|
| `id` | `CNT-00001` |
| `countedAmount`, `breakdown`, `expected`, `variance` | reconciliation |
| `tolerance` | max(1 ILS, 0.1% of float) |
| `status` | `ok / minor_variance / major_variance` |
| `surprise` | unannounced flag |
| `investigation{rootCause, writeOff, suspenseEntry}` | closure |

---

## 4. Public API

```js
import petty from 'onyx-procurement/src/cash/petty-cash.js';

// Create a fund (finance only)
const fundId = petty.createFund({
  name: 'HQ Petty Cash', nameHe: 'קופה קטנה מטה',
  floatAmount: 3000,
  custodianId: 'emp-042',
  approverIds: ['emp-finance-1', 'emp-finance-2'],
  location: 'Tel Aviv HQ'
});

// Disburse against a voucher
const voucherId = petty.disburse(fundId, {
  payee: 'שופרסל', amount: 120, category: 'MEALS',
  receiptRef: 'rcpt-20260411-001',
  custodianPin: '****',
  issuedBy: 'emp-042'
});

// Replenishment workflow
const replId = petty.replenish(fundId, 'emp-042');
petty.approveReplenishment(replId, 'emp-finance-1');
const posted = petty.issueReplenishmentCash(replId, 'emp-finance-1');
// → posted.journalEntry is a balanced double-entry

// Daily count / variance
const c = petty.dailyCount(fundId, 2900, { auditorId: 'emp-internal-audit' });
// → { variance, status, surprise, ... }

petty.investigateVariance(c.countId, {
  rootCause: 'till shortage', investigator: 'emp-internal-audit',
  writeOff: true
});

// Reporting
const report = petty.reconcile(fundId, { from: '2026-04-01', to: '2026-04-30' });
const events = petty.auditTrail(fundId, { from: '2026-04-01', to: '2026-04-30' });
```

### Exports (matches task spec)

| Export | Task requirement |
|--------|------------------|
| `createFund(fields) → fundId` | ✔ |
| `disburse(fundId, voucherData) → voucherId` | ✔ |
| `replenish(fundId, requesterId) → replId` (triggers approval flow) | ✔ |
| `dailyCount(fundId, counted) → {variance, status}` | ✔ |
| `reconcile(fundId, period) → report` | ✔ |
| `auditTrail(fundId, period) → events[]` | ✔ |

Plus supporting calls: `getFund`, `listFunds`, `getVoucher`,
`listVouchersByFund`, `voidVoucher`, `approveReplenishment`,
`rejectReplenishment`, `issueReplenishmentCash`, `investigateVariance`,
`scheduleSurpriseAudits`, `needsReplenishment`.

---

## 5. Internal controls — how each is enforced

| Control | Mechanism |
|---------|-----------|
| **Fixed float** | `fund.floatAmount` immutable; `currentBalance` floats between spends & replenishes. Reconcile invariant: `balance + pendingPaid == floatAmount`. |
| **Segregation of duties** | `createFund` rejects if `custodianId ∈ approverIds`. `disburse`, `approveReplenishment`, `voidVoucher` all re-check identity. |
| **Sequential voucher numbering** | `store.voucherSeq` is a per-fund counter; `sequenceNo` is assigned inside the disburse transaction — gaps imply voids. |
| **Cannot exceed float** | `disburse` rejects with `ERR_INSUFFICIENT_BALANCE` if `amount > currentBalance`. `createFund` rejects `floatAmount > CASH_LAW_LIMIT_ILS`. |
| **All disbursements traceable** | Every operation appends to an immutable `store.audits[]` log, bilingual, with actor + timestamp. `auditTrail(fundId, period)` filters by fund/day. |
| **Surprise audits** | `scheduleSurpriseAudits(fundId, {year, count})` — deterministic PRNG seeded by `fundId+year` so tests reproduce, distribution aims roughly quarterly. The `dailyCount` call accepts `surprise: true` flag, recorded in the audit log. |
| **Receipt threshold** | `disburse` rejects `ERR_RECEIPT_REQUIRED` above `RECEIPT_THRESHOLD_ILS = 50`. |
| **Tax invoice threshold** | Above `TAX_INVOICE_THRESHOLD_ILS = 300`, a `taxInvoiceRef` is mandatory and `vatRecoverable = true`. |
| **Over-threshold approval** | Above `OVER_THRESHOLD_APPROVAL_ILS = 1000`, a second authorised approver is required and cannot be the custodian. |
| **Double-entry auto GL** | `issueReplenishmentCash` builds a balanced JE: `DR expense (net per category) + DR VAT Input` ↔ `CR Cash in Bank`. Imbalance raises `ERR_JE_IMBALANCE`. |
| **Never delete** | Vouchers go to `voided` not `undefined`, funds go to `closed` not removed, counts and audits are append-only. |

---

## 6. Israeli compliance matrix

| Regulation | Constant | Enforcement point |
|------------|----------|-------------------|
| חוק צמצום השימוש במזומן 2018 — ₪6,000 per-transaction cap | `CASH_LAW_LIMIT_ILS = 6000` | `createFund` (float) + `disburse` (amount) |
| חשבונית מס לצורך ניכוי מע"מ תשומות | `TAX_INVOICE_THRESHOLD_ILS = 300` | `disburse` blocks ≥₪301 without `taxInvoiceRef` |
| שיעור מע"מ 17% (2026) | `DEFAULT_VAT_RATE = 0.17` | Auto net/VAT split on voucher |
| חובת קבלה לביקורת פנימית | `RECEIPT_THRESHOLD_ILS = 50` | `disburse` blocks > ₪50 without `receiptRef` |

---

## 7. Replenishment workflow (step by step)

```
1. Custodian drains fund to below ~20%.
2. needsReplenishment(fundId) → true.
3. replenish(fundId, custodianId):
   - Collects ALL vouchers in PAID state,
   - Sums + allocates by category,
   - Creates REP-xxxxx with status=requested.
4. approveReplenishment(replId, financeId):
   - financeId ∈ fund.approverIds AND ≠ custodianId AND ≠ requesterId,
   - status → approved.
5. issueReplenishmentCash(replId, issuerId):
   - Builds balanced JE:
       DR each expense GL (net per category)
       DR 1510 VAT Input (sum vatRecoverable)
       CR 1100 Cash in Bank (gross)
   - Marks all batched vouchers as REPLENISHED,
   - Restores currentBalance → floatAmount,
   - Stamps fund.lastReplenishAt,
   - status → posted.
```

Rejection path: `rejectReplenishment(replId, approverId, reason)` sets
`status=rejected`, preserves the PAID vouchers so they can be batched into
a later request.

---

## 8. Test suite

Run: `node --input-type=module -e "import('./test/payroll/petty-cash.test.js')"`

Result: **20 / 20 passing**

```
petty-cash.test.js — Techno-Kol ERP imprest fund
----------------------------------------------------
  ok  - 01 createFund happy path returns id and sets balance=float
  ok  - 02 createFund rejects invalid float / missing custodian / cash-law excess
  ok  - 03 createFund enforces segregation of duties
  ok  - 04 disburse happy path + sequential voucher numbering
  ok  - 05 disburse rejects over current balance
  ok  - 06 disburse requires receipt above ₪50
  ok  - 07 disburse requires tax invoice over ₪300 and derives VAT
  ok  - 08 disburse blocks over cash law limit ₪6,000
  ok  - 09 disburse requires second approver over ₪1,000 — cannot be custodian
  ok  - 10 disburse requires custodian PIN and issuer id
  ok  - 11 replenish: gathers PAID vouchers, full workflow → JE double-entry
  ok  - 12 replenish: self-approval blocked, rejection leaves vouchers PAID
  ok  - 13 voidVoucher returns cash; custodian cannot self-void
  ok  - 14 dailyCount computes variance + ok/minor/major statuses
  ok  - 15 investigateVariance records root cause + suspense entry
  ok  - 16 reconcile returns imprest invariant + totals by category
  ok  - 17 auditTrail is append-only and never deleted
  ok  - 18 scheduleSurpriseAudits deterministic + count respected
  ok  - 19 needsReplenishment triggers at ≤20% threshold
  ok  - 20 multiple funds isolated — sequential numbering per fund
----------------------------------------------------
Total: 20  Passed: 20  Failed: 0
```

### Coverage highlights

- **Positive paths**: create → disburse → replenish → post → balance restored.
- **Negative paths**: every error code in the module has at least one
  negative-case assertion (14 distinct error codes tested).
- **Boundary cases**: exactly ₪50 (allowed, no receipt), ₪51 (blocked),
  ₪300 (allowed), ₪301 (requires tax invoice), ₪1000 (triggers second
  approver), ₪6001 (cash-law blocked), 20% of float (replenish trigger).
- **Workflow states**: `requested → approved → posted`, plus the rejection
  branch preserving PAID vouchers.
- **Double-entry balance**: asserts `totalDebit === totalCredit` and that
  the VAT Input line appears only when a tax-invoice voucher is in the batch.
- **Isolation**: two funds share the engine but have independent
  `sequenceNo` counters.

---

## 9. Non-functional properties

| Property | Value |
|----------|-------|
| Dependencies | **0** |
| Runtime | Plain Node (ESM + CommonJS compatible via dual export) |
| Bundle impact | ~25 KB raw, ~7 KB gzipped |
| Storage | In-memory `Map` store (pluggable — swap via `setStore()` to persist in Postgres / IDB / file) |
| I18n | Every error carries `.en`, `.he`, `.code`; audit log payload has `en` + `he` strings |
| Concurrency | Synchronous store ops guarantee sequential voucher numbering for single-process use; wrap `store` in a mutex when sharing across workers |
| Precision | All money rounded via `round2()` to avoid 0.30000000000000004 drift |

---

## 10. Integration notes

- **GL account codes** (`petty-cash`, `cash-in-bank`, `vat-input`,
  `suspense`) default to 4-digit placeholders (1110 / 1100 / 1510 / 1900).
  Replace with the client's chart of accounts via fund `categories` override
  on `createFund`.
- **Persistence**: call `setStore(myStore)` with an object that exposes the
  same `Map`-like interface for long-term storage. The in-memory store keeps
  monotonically-increasing sequence counters.
- **Connection to `bank/` and `invoices/` modules**: the replenishment JE is
  a shaped object — hand it off to the existing journal poster via the
  standard `{lines, totalDebit, totalCredit}` contract.
- **RTL UI**: all returned payloads include `*He` fields so the React front
  end can render cards/receipts in Hebrew without translation lookups.

---

## 11. Rules respected

| Rule | Evidence |
|------|----------|
| **Never delete** | No `.delete(...)` calls on store maps. Void = status change, reject = status change, counts + audits are append-only. |
| **Hebrew bilingual** | Every error carries `.he`; every audit event has `en` + `he` payload; fund/voucher records include `nameHe`/`descriptionHe`/`categoryHe`. |
| **Zero deps** | No `require`/`import` of third-party packages in either the module or the test harness. |

---

## 12. Recommended follow-ups (out of scope but easy wins)

1. **Cryptographic PIN / HMAC voucher signatures** — today the PIN is
   non-empty; future swap to `crypto.subtle.verify` for custodian sig.
2. **IMA reporting adapter** — the `reconcile()` output already contains
   per-category totals in the format the monthly PCN-874 report expects.
3. **Mobile camera receipt capture** — `receiptRef` is a string pointer;
   wire it to the existing OCR pipeline in `src/ocr/` for auto-fill.
4. **Push alerts** — when `needsReplenishment(fundId)` flips true or a
   count returns `major_variance`, fan out to `src/notifications/`.

---

**Status**: Complete, tests green, no blockers.
**Delivered by**: Agent X-44, Swarm 3C.
