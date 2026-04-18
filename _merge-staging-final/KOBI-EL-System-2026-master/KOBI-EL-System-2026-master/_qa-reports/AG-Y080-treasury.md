# AG-Y080 — Treasury Management (ניהול גזברות)

**Module**: `onyx-procurement/src/finance/treasury.js`
**Test**: `onyx-procurement/test/finance/treasury.test.js`
**Agent**: Y-080 / Onyx Procurement / Finance Suite
**Status**: PASS (25/25 tests green)
**Date**: 2026-04-11
**Rule**: **לא מוחקים — רק משדרגים ומגדלים** (never delete, only upgrade and grow)

---

## 1. Purpose / מטרה

A corporate-treasury plane for the Techno-Kol ERP. It gives the finance
team a single pane of glass over all bank accounts, FX exposure,
liquidity buffer, investment ladders, signatory matrices, bank-fee
analytics, and a Bank-of-Israel reporting packet builder — without
ever holding the authority to move money.

### Safety boundary (critical)

This module is **READ + PLAN only**. It explicitly:

- **Does NOT** execute wires, ACH, SWIFT, or any transfer of funds.
- **Does NOT** open accounts (only tracks the workflow; account opening
  still requires a human at a branch with physical KYC docs).
- **Does NOT** submit BOI reports (builds the packet only; transmission
  is manual or through a separate gateway).
- **Every** concentration plan and ladder carries a bilingual `warning`
  field. `Treasury.isReadOnly()` always returns `true`.

Execution of any treasury action MUST route through a separate payments
module (**Y-083**) that owns the approval workflow, dual control, and
the actual bank connectors.

---

## 2. Public API

```
class Treasury
  constructor({ baseCurrency='ILS', fxRates, clock })
  bankAccountRegister({ id, bank, branch, accountNumber, currency,
                        type, signatories[], dailyLimit, purpose })
  postBalance(accountId, amount, asOfDate, currency)   // data feed, not a transfer
  cashPosition(asOfDate)                               // consolidated, FX→base
  concentration({ sourceAccounts, targetAccount, rule,
                  targetBalance?, threshold? })        // PLAN only
  investmentLadder({ buckets[], startDate? })          // PLAN only
  liquidityBuffer({ required, current? })
  recordBankFee({ accountId, category, amount, ccy, date, description })
  bankFees(period)
  openAccount(application)                             // tracks human workflow
  mirrorAccounts(masterAccount, mirrors[])             // חשבון ראשי + משנה
  signatoryMatrix()
  alerts({ lowBalance, largeTransaction,
           afterHoursActivity, rateChanges })
  evaluateTransactionAlert(tx)                         // streaming check
  fxExposure()
  reportToBOI({ from, to })                            // build-only packet
  listAccounts() / listAlerts() / listLadders() /
  listConcentrationPlans() / auditTrail()
  isReadOnly() → true
```

Exports: `Treasury`, `ACCOUNT_TYPE`, `ACCOUNT_STATUS`,
`CONCENTRATION_RULE`, `BASE_CCY`, `DEFAULT_FX_RATES_TO_ILS`,
`BOI_LARGE_DEPOSIT_THRESHOLD_ILS`.

Zero runtime dependencies. CommonJS. Node + browser compatible.

---

## 3. Account types / סוגי חשבון

| Enum | Hebrew label | Use-case |
|---|---|---|
| `checking` | עו"ש | Day-to-day operations, payroll out, AR in |
| `savings` | חסכון / פק"מ | Short-term idle cash, shekel reserves |
| `escrow` | נאמנות פרויקטלי | Project-specific held funds (e.g. construction draws) |
| `trust` | נאמנות | General trust (lawyer/accountant/trustee) |
| `foreign` | חשבון מט"ח | Non-ILS operating balances (imports, subsidiaries) |

Account status lifecycle (status transitions only — no row is ever deleted):

```
applied → under_review → approved → active
                                        ├→ frozen    (hold)
                                        ├→ dormant   (>12 mo idle)
                                        └→ closed    (preserved for history)
```

---

## 4. Concentration rules / כללי ריכוז מזומנים

| Rule enum | Hebrew | Behaviour |
|---|---|---|
| `zero-balance` | סחיפה מלאה | Move the entire source balance to the target; source ends at 0. |
| `target-balance` | יתרת יעד | Sweep anything above `targetBalance`; leave the buffer behind. |
| `threshold` | סף מינימום | Sweep only the amount above `threshold`. If source ≤ threshold, nothing moves. |

The `concentration()` call **always** returns a plan with:

- `executed: false`, `status: 'planned'`
- A `warning` object containing Hebrew + English safety text
- An audit log entry `concentration.plan`

A plan never touches balances. It is persisted in `_concentrationPlans`
and can be re-read via `listConcentrationPlans()`.

---

## 5. Investment ladder / סולם השקעות

`investmentLadder({ buckets, startDate })` returns a sorted maturity
ladder with:

- `rungs[]` sorted by `maturityDays` ascending
- Per-rung `estInterest` using simple interest:
  `amount × minRate × (maturityDays / 365)`
- Weighted average rate (`avgRate`, 4 decimals)
- `totalAmount`, `totalEstInterest`, `longestDays`
- Bilingual planning warning

Like concentration, nothing is purchased. The ladder goes to the
investment committee and — if approved — into the payments module Y-083.

---

## 6. Liquidity buffer / כרית נזילות

`liquidityBuffer({ required, current? })`:

- If `current` is omitted, derived from `cashPosition()` total base.
- Returns `status: 'ok' | 'shortfall'`, `gap`, `coverageRatio`.
- A shortfall is written to the alert history as `liquidityShortfall`.

---

## 7. Alerts / התראות

Default thresholds (base ILS):

| Alert | Default | Bilingual note |
|---|---|---|
| `lowBalance` | 10,000 | יתרה נמוכה / Low balance |
| `largeTransaction` | 500,000 | עסקה גדולה / Large transaction |
| `afterHoursActivity` | 20:00–06:00 | פעילות מחוץ לשעות / After hours |
| `rateChanges.bpsThreshold` | 25 bps | שינוי ריבית חריג / Unusual rate move |

Thresholds are overridable via `alerts(rules)`. History is append-only
(`_alertHistory`, exposed via `listAlerts()`).

---

## 8. BOI reporting / דיווח לבנק ישראל

`reportToBOI({ from, to })` builds a packet containing:

- `totalBase` cash position as of the period end
- `largeAccounts` — any account whose base balance is at or above
  `BOI_LARGE_DEPOSIT_THRESHOLD_ILS` (50,000,000 ILS sample threshold)
- FX exposure breakdown
- A confirmations checklist — CPA sign-off, CFO sign-off, authorized
  officer sign-off — **all set to `done: false`** when generated
- A bilingual `safetyNote` stating the packet is build-only

Israeli regulatory context (for human reviewers):

- חוק בנק ישראל, תש"ע-2010
- הוראות הפיקוח על הבנקים — reporting obligations for large
  borrowers / large depositors (לווה גדול / מפקיד גדול)
- חוק איסור הלבנת הון, תש"ס-2000 — thresholds for reporting
- חוק צמצום השימוש במזומן, תשע"ח-2018 — cash caps

---

## 9. Safety note / הערת בטיחות

> This module does not execute transfers, wires, ACH, SWIFT, standing
> orders, direct debits, or any movement of funds. It does not hold
> bank credentials. It is a read-only, plan-only module.
>
> המודול אינו מבצע העברות, מסגרות אוטומטיות, או כל תנועת כספים.
> לא שומר סיסמאות לבנק. קוראים־בלבד / תכנון־בלבד.

Execution requires **Y-083** (payments module with dual approval).

---

## 10. Hebrew glossary / מילון מונחים

| English | עברית |
|---|---|
| Treasury | גזברות / ניהול אוצר |
| Cash position | מצב מזומנים |
| Cash concentration | ריכוז מזומנים |
| Zero-balance sweep | סחיפה ליתרה 0 |
| Target-balance | יתרת יעד |
| Threshold sweep | סחיפה מסף |
| Investment ladder | סולם השקעות |
| Maturity | תאריך פדיון |
| Rung (of a ladder) | מדרגה |
| Liquidity buffer | כרית נזילות |
| Liquidity shortfall | חוסר נזילות |
| Bank fee | עמלת בנק |
| Signatory | בעל זכות חתימה |
| Dual control / pair required | חתימה בזוגות |
| Daily limit | מסגרת יומית |
| Escrow | נאמנות פרויקטלית |
| Trust account | חשבון נאמנות |
| Foreign currency account | חשבון מט"ח |
| Checking account | עו"ש |
| Savings / term deposit | חסכון / פק"מ |
| Mirror account / sub-account | חשבון משנה |
| Master account | חשבון ראשי |
| FX exposure | חשיפה מטבעית |
| Base currency | מטבע בסיס |
| Rate (interest / FX) | שער / ריבית |
| Bank of Israel reporting | דיווח לבנק ישראל |
| Regulator / Supervisor | פיקוח על הבנקים |
| Account opening application | בקשה לפתיחת חשבון |
| KYC (Know Your Customer) | הכרת הלקוח |
| AML (Anti-Money-Laundering) | איסור הלבנת הון |
| Board resolution | פרוטוקול דירקטוריון |
| Articles of incorporation | מזכר התאגדות |
| Low balance alert | התראת יתרה נמוכה |
| Large transaction | עסקה גדולה |
| After-hours activity | פעילות מחוץ לשעות |
| Audit trail | מסלול ביקורת |

---

## 11. Test summary

```
node --test test/finance/treasury.test.js

tests: 25
pass: 25
fail: 0
duration: ~150 ms
```

Coverage spans:

- Cash position across currencies (FX→ILS)
- Grouping by currency and by account type
- `asOfDate` latest-on-or-before resolution
- Concentration: zero-balance / target-balance / threshold
- Concentration error paths (invalid rule, unregistered target)
- Investment ladder: sort, weighted average rate, est. interest
- Ladder error paths (empty buckets, bad amount)
- Liquidity buffer: surplus, shortfall, explicit current, errors
- Signatory matrix aggregation by account and by person
- Mirror accounts consolidated balance
- FX exposure shares and base flag
- Open-account workflow: under_review and approved
- Alert threshold configuration and low-balance triggering
- BOI packet structure, confirmations, safety note
- `isReadOnly()` invariant
- Account upgrade versioning (never delete)

---

## 12. Never-delete guarantee

The module keeps append-only stores for:

- `_accounts` — versioned upserts (`bankAccountRegister` bumps `version`)
- `_balances` — time-series of observations
- `_signatories` — appended, never removed
- `_openAccountWorkflows` — every application preserved
- `_bankFees` — append-only ledger
- `_investmentLadders` — every plan preserved
- `_concentrationPlans` — every plan preserved
- `_alertHistory` — full alert history
- `_boiReports` — every generated packet preserved
- `_audit` — mutation log for auditors

There is no method that deletes a record. Status transitions
(`active → frozen`, `active → dormant`, `active → closed`) are the
only way to mark a record inactive.

---

## 13. Integration hooks (future work)

- **Y-083** payments executor (receives approved plans, holds real bank creds)
- **AG-X11** demand-forecaster (feeds `liquidityBuffer.required`)
- **AG-100** anomaly detector (augments `alerts`)
- **fx/** daily rate loader (replaces injected `fxRates`)
- **bank/** bank-statement parsers (feed `postBalance`)
- **vat/** + **tax/** (reports bank-fee VAT)

---

*Report generated 2026-04-11 by Agent Y-080. Never delete, only upgrade.*
