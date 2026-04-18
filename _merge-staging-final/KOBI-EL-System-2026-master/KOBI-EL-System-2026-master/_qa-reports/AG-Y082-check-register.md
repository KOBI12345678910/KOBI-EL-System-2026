# AG-Y082 — Check Register / פנקס שיקים

**Agent:** Y-082 (Check Register — Finance Swarm)
**System:** Techno-Kol Uzi mega-ERP / Onyx Procurement
**Module:** `onyx-procurement/src/finance/check-register.js`
**Tests:** `onyx-procurement/test/finance/check-register.test.js`
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 28 / 28 tests passing
**Rule / כלל:** לא מוחקים רק משדרגים ומגדלים — Never delete, only upgrade & grow

---

## 1. Mission / משימה

Build a **unified check register** for both outgoing (paid-out) and incoming
(paid-in) checks, implementing the Israeli legal framework that governs
bounced checks, restricted customers, endorsement chains, post-dated cheques,
and dual-signature voids.

The register must:

1. Assign sequential check numbers per bank account (מונה רץ)
2. Record outgoing checks with authorizer / signer tracking
3. Record incoming checks with drawer metadata (bank-branch-account)
4. Maintain an **append-only endorsement chain** (שרשרת הסבות)
5. Track deposit → pending → cleared / bounced / returned lifecycle
6. Implement Israeli **restricted-customer ladder** at 10 / 15 bounces
7. Enforce **dual-signature void** (ביטול דו-חתימתי) with two distinct approvers
8. Surface a **post-dated aging list** for cash-flow planning (צ'קים דחויים)
9. Reconcile our outgoing checks against bank statements
10. Audit every mutation — never delete records

Zero runtime dependencies. Pure Node + browser JS. Bilingual errors.

---

## 2. Deliverables / תוצרים

| # | File | Purpose |
|---|---|---|
| 1 | `onyx-procurement/src/finance/check-register.js` | Engine — `CheckRegister` class + constants + in-memory store |
| 2 | `onyx-procurement/test/finance/check-register.test.js` | 28 unit tests covering every public method and legal edge case |
| 3 | `_qa-reports/AG-Y082-check-register.md` | This report — spec, legal citations, Hebrew glossary |

Zero files deleted. Zero existing code modified. Additive only.

---

## 3. Public API / ממשק ציבורי

```js
const { CheckRegister, CHECK_STATUS, BOUNCE_REASON } =
  require('./src/finance/check-register');

const reg = new CheckRegister({
  // store:              optional custom store (default: memory)
  // now:                () => ISO (for deterministic tests)
  // clearingDays:       default 2 (T+2 cross-bank Israel)
  // restrictedRegistry: { isRestricted(drawerAccount) -> bool|object }
});
```

### 3.1 Methods

| Method | Purpose |
|---|---|
| `recordIssuedCheck({...})` | Record an outgoing check we issue |
| `recordReceivedCheck({...})` | Record an incoming check from a payer |
| `endorseCheck(checkId, endorsee)` | Append to the endorsement chain |
| `depositCheck(checkId, accountId, date)` | Submit to our bank for clearance |
| `clearanceStatus(checkId)` | Current status (posted / pending / cleared / bounced / returned) |
| `markCleared(checkId, date)` | Mark successful settlement |
| `bouncedCheckRecord({...})` | Per חוק שיקים ללא כיסוי |
| `restrictedCustomerCheck(drawerAccount)` | Check BoI restricted-customer list |
| `nextAvailableNumber(accountId)` | Allocate next sequential number |
| `setStartingNumber(accountId, n)` | Align with pre-printed check book |
| `voidCheck(checkId, reason, requires2Sig)` | Dual-sig void |
| `postDatedCheckList({asOfDate, direction, accountId})` | Aging list |
| `reconcileWithBank(accountId, statement)` | Match against bank statement |
| `getCheck / listChecks / getAuditLog` | Read-only inspection |

---

## 4. Israeli Check Law / דיני שיקים בישראל

### 4.1 פקודת השטרות — Bills of Exchange Ordinance

Governs the **transferability** of checks. A check is a negotiable instrument.
Endorsement (הסבה / היסב) is appended on the back of the check; once it is
endorsed to a new payee, the previous endorser remains **jointly liable** if
the check bounces. The module keeps endorsements as an **append-only array**
with monotonic `sequence` numbers so the chain is always auditable.

### 4.2 חוק שיקים ללא כיסוי התשמ"א-1981 — Bounced Checks Law 1981

This is the core consumer-protection law that drives the restricted-customer
ladder. When a bank returns a check for lack of cover, an account-closed
reason, or because the drawer is already restricted, the bounce is **counted**.

| # Counting Bounces / 12 mo | Status | Duration |
|---|---|---|
| 0–9 | Normal | — |
| **10** | לקוח מוגבל — Restricted customer | 12 months |
| **15** | לקוח מוגבל חמור — Severely restricted | 24 months |

A **restricted customer** may not issue new checks from ANY of their accounts
for the duration. A **severely restricted customer** is additionally cut off
from credit-card issuance and loans (as of Reform amendment התשע"ח-2018).

### 4.3 What counts and what doesn't

The law is precise: only **"non-technical"** bounces bump the counter.

| Reason (He) | Code | Counts? |
|---|---|---|
| אין כיסוי | `no_cover` | YES |
| חשבון סגור | `account_closed` | YES |
| לקוח מוגבל | `restricted_customer` | YES |
| הוראת ביטול | `stop_payment` | no |
| חתימה לא תקינה | `signature_invalid` | no (technical) |
| סכום שגוי | `amount_mismatch` | no (technical) |
| תאריך שגוי / דחוי | `date_invalid` / `postdated` | no (technical) |
| מזויף | `forged` | no (criminal — separate track) |

The test suite explicitly verifies this: `SIGNATURE_INVALID` bounces do **not**
increment the counter, while `NO_COVER` bounces do.

### 4.4 הוראה 420 — Supervisor of Banks Proper Conduct Directive

The BoI publishes the restricted-customer list at
[`boi.org.il`](https://www.boi.org.il) under נוהל 420. Real integration would
pull the daily CSV and index drawer account numbers. The module exposes a
`restrictedRegistry` hook with `isRestricted(drawerAccount)` for this; the
default implementation uses **internal bounce history only**.

### 4.5 Post-dated checks / צ'קים דחויים

Post-dated checks are a **legitimate instrument** in Israeli commerce:

- Landlords collect 12 post-dated rent checks at lease signing
- Contractors receive partial payments in post-dated form (שלבי ביצוע)
- Suppliers grant B2B credit by accepting post-dated checks

A post-dated check **cannot legally be deposited** before its due date. The
module enforces this: `depositCheck(id, acc, date)` throws
`ERR_POSTDATED_EARLY_DEPOSIT` when `date < dueDate`.

The aging list (`postDatedCheckList`) surfaces seven buckets:

| Bucket | Range |
|---|---|
| `overdue` | `daysToDue < 0` |
| `due_0_7` | 0–7 days |
| `due_8_30` | 8–30 days |
| `due_31_60` | 31–60 days |
| `due_61_90` | 61–90 days |
| `due_90_plus` | 91+ days |

Each bucket carries `{count, total}` so finance can forecast cash inflow.

---

## 5. Dual-signature void / ביטול דו-חתימתי

A voided outgoing check is a **financial event**: funds are held on the
account, auditors will ask why, and a fraudster with access to a check-writing
workstation could cover their tracks by voiding just-issued checks. The module
requires **two distinct approver IDs** to commit a void when
`requires2Sig !== false`.

### 5.1 Flow

1. `voidCheck(id, reason, { approvers: ['emp-1'] })` → returns
   `{ voided: false, pendingApprovers: 1 }`
2. `voidCheck(id, reason, { approvers: ['emp-1'] })` again → still pending
   (same approver, no progress)
3. `voidCheck(id, reason, { approvers: ['emp-2'] })` → committed,
   `{ voided: true, status: 'voided', approvers: ['emp-1','emp-2'] }`

### 5.2 Soft state between approvals

Pending approvers are stored on the check record (`voidApprovers`). A
restart of the process never loses progress because the store is the
source of truth, not an ephemeral request.

### 5.3 Override for back-office

For low-value operational adjustments an administrator can pass
`requires2Sig: false`. This path is logged separately in the audit log
(`CHECK_VOIDED` event with `requires2Sig: false`) so auditors can review it.

---

## 6. Bank reconciliation / התאמת בנק

The reconciler walks a bank statement and, for each line, looks up our
outgoing check by `{accountId, number}`. Four outcomes:

| Outcome | Action |
|---|---|
| Number match + amount match + `cleared` | `markCleared()`, push to `matched` |
| Number match + `returned` / `bounced` | Fire `bouncedCheckRecord()` |
| Number match + amount mismatch | Push to `unmatched` with reason `amount_mismatch` |
| No number match | Push to `unmatched` / `bankOnly` |

Any of our checks NOT seen on the bank statement go to `ourUnmatched`
— these are outstanding checks that the payee has not yet cashed and
should be tracked for outstanding-check aging at month-end close.

The 1-agora (₪0.01) amount tolerance handles rounding in the bank file.

---

## 7. Status machine / מכונת מצבים

```
    DRAFT
      ↓
    ISSUED ──────────────→ CANCELLED  (handed back before deposit)
      ↓                          ↑
    POSTED                       │
      ↓                          │
    ENDORSED ─────────────→ VOIDED (2-sig only)
      ↓                          ↑
    DEPOSITED                    │
      ↓                          │
    PENDING ──────────────→ RETURNED  (technical bounce)
      ↓                          │
    CLEARED                      │
                                 │
      └────────────────→ BOUNCED (counting bounce → restriction ladder)
      
    EXPIRED  (180 days since issue per BoI default)
```

Notes:

- `CLEARED` is terminal and cannot transition further.
- `VOIDED`, `CANCELLED` and `EXPIRED` are terminal for check activity but
  remain queryable forever (rule #1 — never delete).
- `BOUNCED` and `RETURNED` are terminal for THAT check but do not end the
  drawer relationship — subsequent checks can still be received.

---

## 8. Test coverage / כיסוי בדיקות

**Total: 28 tests, all passing.**

```
✔ nextAvailableNumber — issues sequential, monotonic numbers
✔ setStartingNumber — aligns with pre-printed check book
✔ recordIssuedCheck — auto-assigns number and stores full record
✔ recordIssuedCheck — rejects duplicate explicit number on same account
✔ recordIssuedCheck — validates all required fields
✔ recordReceivedCheck — captures drawer info and postdated flag
✔ recordReceivedCheck — rejects missing drawer data
✔ endorseCheck — appends endorsement records and preserves chain
✔ endorseCheck — blocks after clearance
✔ depositCheck — moves to pending and forecasts clearance date
✔ depositCheck — rejects post-dated deposit before due date
✔ depositCheck — prevents double deposit
✔ bouncedCheckRecord — counts NO_COVER and transitions status
✔ bouncedCheckRecord — technical reasons do NOT count toward restriction
✔ restrictedCustomerCheck — ladder at 10 → regular, 15 → severe
✔ restrictedCustomerCheck — external BoI registry fallback
✔ recordReceivedCheck — flags restrictedDrawerWarning when drawer is on list
✔ voidCheck — dual signature requires two distinct approvers
✔ voidCheck — single-signature mode when requires2Sig=false
✔ voidCheck — reason required
✔ postDatedCheckList — aging buckets and totals
✔ postDatedCheckList — filter by direction
✔ reconcileWithBank — matches cleared checks and flags unmatched
✔ reconcileWithBank — statement-returned lines trigger bounce flow
✔ reconcileWithBank — ourUnmatched lists checks never seen on bank
✔ reconcileWithBank — amount mismatch is flagged, not auto-matched
✔ audit log — grows with every operation and is queryable by check
✔ listChecks — filter by direction and status
```

### Key scenarios exercised

- **Restricted ladder:** a synthetic scenario fires 15 bounces against the
  same drawer and asserts the status transitions at exactly 10 (regular) and
  exactly 15 (severe).
- **Technical vs. counting bounces:** a `SIGNATURE_INVALID` bounce leaves
  `bounceCount = 0` in the drawer history.
- **Post-dated early deposit:** a check with `dueDate: 2026-12-31` cannot be
  deposited on `2026-04-11`.
- **Dual-sig distinctness:** the same approver ID submitted twice leaves the
  void still pending — two distinct IDs are required.
- **Amount tolerance:** a ₪0.50 delta between our record and the bank line
  flags `amount_mismatch` rather than silently accepting.

---

## 9. Hebrew / English glossary — מונחון

| Hebrew | English | Module constant / term |
|---|---|---|
| שיק / צ'ק | Check / Cheque | — |
| פנקס שיקים | Check register / check book | `CheckRegister` |
| שיק יוצא | Outgoing (paid-out) check | `CHECK_DIRECTION.OUTGOING` |
| שיק נכנס | Incoming (paid-in) check | `CHECK_DIRECTION.INCOMING` |
| הסבה / היסב | Endorsement | `endorseCheck` |
| נסב | Endorsee | — |
| מוטב | Payee | `payee` |
| משלם / מושך | Drawer / payer | `payer`, `drawerAccount` |
| מחזיק | Holder | — |
| תאריך פירעון | Due date | `dueDate` |
| תאריך משיכה | Issue date | `issueDate` |
| צ'ק דחוי | Post-dated check | `postdated: true` |
| שיק חוזר | Bounced check | `CHECK_STATUS.BOUNCED` |
| אין כיסוי | No cover | `BOUNCE_REASON.NO_COVER` |
| לקוח מוגבל | Restricted customer | `level: 'regular'` |
| לקוח מוגבל חמור | Severely restricted | `level: 'severe'` |
| ביטול שיק | Check void | `voidCheck` |
| ביטול דו-חתימתי | Dual-signature void | `requires2Sig: true` |
| הוראת ביטול | Stop-payment order | `BOUNCE_REASON.STOP_PAYMENT` |
| הפקדה | Deposit | `depositCheck` |
| פירעון / נפרע | Clearance / cleared | `CHECK_STATUS.CLEARED` |
| מוסלקה / בהמתנה | In clearing / pending | `CHECK_STATUS.PENDING` |
| התאמת בנק | Bank reconciliation | `reconcileWithBank` |
| חוק שיקים ללא כיסוי | Bounced Checks Law 1981 | — |
| פקודת השטרות | Bills of Exchange Ordinance | — |
| הוראה 420 | BoI Directive 420 | `restrictedRegistry` |
| מונה שיקים | Check counter | `nextAvailableNumber` |
| חתימת מורשה | Authorised signatory | `authorizer` |
| מאשר | Approver | `approvers[]` |
| יומן ביקורת | Audit log | `getAuditLog` |

---

## 10. Zero-dep promise / הבטחת אפס תלויות

The module imports **nothing** outside what the JavaScript language provides:
no `require()` of npm packages, no Node-only APIs (runs in the browser too),
no dynamic imports, no file-system access, no network.

The only uses of `node:*` anywhere in the file are implicit — they come from
the surrounding Node runtime when tests run under `node --test`. The module
itself is pure JS.

---

## 11. Compliance checklist / רשימת תאימות

| Requirement | Status | Evidence |
|---|---|---|
| Sequential numbering per account | ✔ | `nextAvailableNumber` + counter Map |
| Issued check tracking | ✔ | `recordIssuedCheck` |
| Incoming check tracking with drawer metadata | ✔ | `recordReceivedCheck` |
| Endorsement chain (append-only) | ✔ | `endorseCheck` — `endorsements[]` |
| Deposit + clearance lifecycle | ✔ | `depositCheck`, `markCleared`, `clearanceStatus` |
| Bounce handling per חוק שיקים ללא כיסוי | ✔ | `bouncedCheckRecord` |
| 10/15 restricted ladder with 12-month window | ✔ | `_recordDrawerBounce` |
| Counting vs. technical bounces | ✔ | `COUNTING_BOUNCE_REASONS` |
| BoI restricted customer lookup hook | ✔ | `restrictedRegistry` option |
| Post-dated check list with aging buckets | ✔ | `postDatedCheckList` |
| Post-dated early-deposit blocker | ✔ | `ERR_POSTDATED_EARLY_DEPOSIT` |
| Dual-signature void | ✔ | `voidCheck` default behaviour |
| Bank reconciliation | ✔ | `reconcileWithBank` |
| Audit log never truncated | ✔ | `_audit` append-only |
| Bilingual errors | ✔ | `err(code, en, he)` helper |
| Zero npm dependencies | ✔ | No `require` of external packages |
| Rule #1 — never delete | ✔ | Soft transitions only; records are never removed from the Map |

---

## 12. Verdict / החלטה

**GREEN — ready for integration.**

The module drops into the Onyx Procurement finance layer at
`src/finance/check-register.js`. No existing files were touched; no data was
deleted. The module is additive, bilingual, zero-dep, and fully tested against
the Israeli legal framework governing checks.

**Per Rule #1: לא מוחקים רק משדרגים ומגדלים.**

---

## 13. Follow-ups / המשכיות (not blocking)

These are natural growth points — none are required to ship:

1. **Real BoI CSV ingestion** — implement a `BoiRestrictedRegistry` class
   that pulls the daily restricted-customer list from boi.org.il.
2. **GL posting hooks** — emit double-entry journal entries on issuance,
   deposit, clearance, and bounce to wire into the chart of accounts
   (currently the module is self-contained; GL is upstream).
3. **Printing integration** — pipe `recordIssuedCheck` into
   `src/payments/check-printer.js` to produce a PDF with MICR line + Hebrew
   amount-in-words.
4. **Endorsement liability graph** — surface a report listing every check
   where Techno-Kol Uzi sits in the endorsement chain (our contingent
   liability if the check bounces).
5. **Expiry sweep job** — nightly job that marks checks ≥180 days old as
   `EXPIRED` per BoI default; currently the state is defined but not
   automatically transitioned.
6. **Multi-currency revaluation** — the `currency` field is persisted but
   the module does not perform FX revaluation (that belongs in `src/fx`).

Each of these is an **upgrade path**, never a replacement.

---

*End of AG-Y082.*
