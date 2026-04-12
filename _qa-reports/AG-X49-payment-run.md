# AG-X49 — Payment Run Engine / מנוע רצף תשלומים

**Agent:** X-49 | **Swarm:** 3C | **Project:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** PASS — 29/29 tests green

---

## 1. Scope

End-to-end batch payment engine for vendor AP disbursements inside the
Techno-Kol ERP, written in plain JavaScript against `node:crypto` only.
The engine supports the full run lifecycle: proposal → review → approval
→ execute → Masav export → confirm / reject → retry loop → remittance
advice → bank reconciliation.

Delivered files:

| Path | LOC | Purpose |
|---|---|---|
| `onyx-procurement/src/payments/payment-run.js`  | ~800 | Engine + Masav builder + store |
| `test/payroll/payment-run.test.js`              | ~525 | 29 test cases, zero framework |
| `_qa-reports/AG-X49-payment-run.md`             | —    | This report |

RULES respected:

- **Zero dependencies** — only `node:crypto`. The test runner uses
  `node:assert`, `node:fs`, `node:path`. No npm packages.
- **Hebrew bilingual** — every state, reject reason, exclusion reason,
  subject/body field on remittance advice carries `he` + `en`.
- **Never deletes** — exclusions flip an `included` flag, rejections append
  to `rejectHistory`, bills move through status `open → scheduled → paid /
  exception / retry_queued`. No `delete`, `splice` (except on a statement
  clone during reconcile) or truncation anywhere in the engine.
- **Real code, tested** — 29 cases, all passing under plain Node.

---

## 2. Public API

```js
const {
  createPaymentRunEngine,
  createMemoryDb,
  buildMasav,
  validateMasavParticipant,
  toAgorot, fromAgorot, formatIls,
  scoreBill, resolveMethod,
  PAYMENT_METHODS, STATES, REJECT_REASONS, PRIORITY,
  MASAV_PARTICIPANTS,
} = require('./src/payments/payment-run.js');

const engine = createPaymentRunEngine({
  db,           // optional — in-memory store is bundled
  clock,        // optional — () => new Date()
  glPost,       // optional — journal-entry sink
  eventBus,     // optional — engine emits 6 event types
  logger,       // optional
  cashFloor,    // optional — min cash buffer (agorot)
  institute,    // optional — Masav institute code
  payerId,      // optional — payer tax id
  payerName,    // optional — payer display name
});
```

| Engine method | Returns | Notes |
|---|---|---|
| `proposeRun({dateRange, maxAmount, methods})` | `{proposalId, bills[], summary}` | Runs priority scoring, cash cap, method assignment |
| `includeExclude(proposalId, billIds, decision)` | proposal snapshot | `'include'` \| `'exclude'`, appends to audit trail |
| `calculateTotal(proposalId)` | summary | Totals per method + grand + discount captured |
| `approveRun(proposalId, approverId)` | `runId` | Blocks self-approval, re-checks cash |
| `execute(runId)` | `{runId, bills_count, files, reservedAgorot}` | Generates Masav / wire / check / ACH / credit files, posts GL reservation |
| `exportMasav(runId)` | `{bytes, text, checksum, recordCount, header, totals}` | Fixed-width 128-byte records, SHA-256 checksum |
| `confirmPayment(paymentId, bankRef)` | payment | Posts final GL, marks bill paid |
| `rejectPayment(paymentId, reason)` | payment | Retriable ⇒ bill `retry_queued`; non-retriable ⇒ `exception` |
| `remittanceAdvice(runId)` | notifications[] | Grouped per vendor, bilingual subject/body |
| `reconcileWithBank(runId, statement)` | `{matched, unmatchedPayments, unmatchedStmt}` | Matches by `{amountAgorot, reference}` / `bankRef` — Agent X-37 surface |

---

## 3. Masav output (מס"ב)

Fixed-width 128-byte records per Bank of Israel spec:

| Type | Prefix | Layout |
|---|---|---|
| `1` Header | `'1'` | 9 institute, 2 serial, 6 created YYMMDD, 6 exec YYMMDD, 9 payer id, 30 payer name, 65 reserved |
| `5` Detail | `'5'` | 8 seq, 2 bank, 3 branch, 9 account, 9 payee id, 30 payee name, 12 amount (agorot), 20 reference, 34 reserved |
| `9` Trailer | `'9'` | 8 record count, 15 total amount, 104 reserved |

Safety nets:

1. Every generated line is asserted to be exactly 128 bytes — `buildMasav`
   throws on width mismatch. (Test 03, 04, 05, 06.)
2. Every participant code is validated against `MASAV_PARTICIPANTS`
   (20 active codes) before the detail record is emitted. Unknown
   participants throw a hard error inside `exportMasav`.
3. Output bytes are hashed with SHA-256 and the checksum is stored on the
   run record, so a round-trip to the bank can be verified before and
   after the file is transmitted.
4. Foreign currency bills are excluded from the Masav batch automatically
   (they are routed to the wire CSV), because Masav is ILS-only.

---

## 4. State machine

```
bills:           open ─┬─> scheduled ─┬─> paid
                       │              ├─> retry_queued ──> (next run)
                       │              └─> exception       (rejected, non-retriable)
                       └─> (propose skips if blocked vendor)

proposals:       draft ─> approved ─> (archived via run)
                       └─> rejected

runs:            executing ─> executed ─> confirmed
                                        ├─> partial
                                        └─> failed

payments:        scheduled ─> confirmed
                          ├─> retry_queued ──> (requeued into next proposal)
                          └─> rejected
```

All transitions are append-only: the `rejectHistory` array on a payment
keeps every attempt, the `exclusions` array on a proposal keeps every
include/exclude toggle, and the GL ledger is also append-only.

---

## 5. Cash constraints

1. At propose-time the engine reads `db.getCash()`, subtracts the optional
   `cashFloor`, and fills the run greedily in priority order. Bills that
   would break the cap are flagged `excludeReason = 'cash_cap_exceeded'`
   (`'חריגה ממסגרת המזומן'`) but are **not** removed — the user can still
   include them manually if a top-up is coming.
2. At approve-time the engine re-reads the cash balance. Even if propose
   was within the cap, a cash outflow between propose and approve will
   trip the check and throw `'proposal exceeds cash limit'`. (Test 19.)
3. At execute-time the GL reservation entry debits `2100-AP` and credits
   `1020-CashInTransit`; the cash in `db.cashPosition.balance` is also
   decremented so subsequent runs see the already-reserved funds.
4. On confirmation, `1020-CashInTransit` is cleared to `1010-Bank`. On
   rejection, the reservation is reversed and the cash is credited back,
   so the retry machinery sees fresh headroom.

---

## 6. Integration with Agent X-37 (bank statement reconciliation)

`reconcileWithBank(runId, statement)` is the integration surface for the
Agent X-37 bank-statement parser. It accepts

```js
{ rows: [{ amountAgorot, reference, bankRef }, ...] }
```

matches each row against the run's payments on `(amountAgorot, reference)`
or `bankRef`, and auto-confirms any matching payment that is still in the
`scheduled` state. Unmatched payments (possibly in-flight) and unmatched
statement rows (possibly legacy entries) are returned to the caller for
manual review. Test 28 exercises the happy path end-to-end.

---

## 7. Test suite

`test/payroll/payment-run.test.js` — 29 cases, all passing under plain
Node with zero extra deps:

```
PASS  01 money conversions round-trip
PASS  02 Masav participants validator
PASS  03 Masav header is exactly 128 bytes
PASS  04 Masav detail is 128 bytes and amount is zero-padded 12 wide
PASS  05 buildMasav trailer totals match detail sum
PASS  06 buildMasav throws if a record is not 128 wide
PASS  07 scoreBill EARLY_DISCOUNT inside window
PASS  08 scoreBill OVERDUE after due date
PASS  09 resolveMethod → MASAV for ILS + valid bank code
PASS  10 resolveMethod → WIRE for USD regardless of vendor
PASS  11 resolveMethod falls back to CHECK when bank is not a Masav participant
PASS  12 proposeRun sorts bills by priority descending
PASS  13 proposeRun respects cash-position cap
PASS  14 proposeRun respects maxAmount
PASS  15 proposeRun skips blocked vendors
PASS  16 includeExclude toggles flag and never deletes rows
PASS  17 calculateTotal sums only included bills
PASS  18 approveRun blocks self-approval
PASS  19 approveRun rejects when run exceeds cash limit
PASS  20 approveRun produces a run in EXECUTING state
PASS  21 execute reserves cash, posts GL, creates payment rows
PASS  22 execute generates per-method files
PASS  23 exportMasav returns bytes + checksum + correct record count
PASS  24 confirmPayment posts final GL, marks bill paid, advances run
PASS  25 rejectPayment retriable → bill is re-queued
PASS  26 rejectPayment non-retriable → exception, attempts++
PASS  27 remittanceAdvice groups by vendor with bilingual text
PASS  28 reconcileWithBank matches payments via bank statement rows
PASS  29 module has zero third-party deps (node:* only)

29 passed, 0 failed, 29 total
```

Test 29 greps the source of `payment-run.js` and asserts every `require()`
call loads a `node:*` builtin, so the zero-dependency guarantee is baked
into the test suite itself — a future contributor adding an `npm install`
dependency will turn the build red on the spot.

---

## 8. Follow-ups / not in scope

- Actual filesystem writes — `execute()` returns in-memory buffers; the
  caller mounts them on `/runs/<runId>/…` via the storage adapter of
  choice. This keeps the engine pure.
- PGP signing of the Masav file — the Masav clearing system currently
  accepts files over SFTP with signed envelopes. When the production
  bank integration lands, wrap `exportMasav()` with the signer module.
- Multi-currency pooling — the engine routes foreign-currency bills to
  wire and emits the CSV, but does not yet consolidate same-day FX to
  one wire instruction per currency. Nice-to-have for v2.
- HTML / PDF remittance rendering — `remittanceAdvice()` already produces
  bilingual subject + body strings, the HTML rendering is delegated to
  the `emails/` pipeline.

---

**Bottom line:** AG-X49 is shippable. Zero deps, never-delete,
Hebrew-bilingual, 29 green tests covering every public entry point.
