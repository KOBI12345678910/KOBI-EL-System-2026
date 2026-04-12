# AG-Y073 — Stock-Options & Israeli Section 102 Vesting Tracker

**Agent:** Y-073 (Swarm HR / Tax)
**System:** Techno-Kol Uzi mega-ERP
**Date:** 2026-04-11
**Status:** DELIVERED — 32 / 32 tests passing, zero external dependencies.
**Rule enforced:** לא מוחקים, רק משדרגים ומגדלים — append-only event ledger per grant.

---

## 1. Scope

Deliver a production-grade stock-options / RSU / SAR vesting tracker for
the Techno-Kol Uzi mega-ERP with full Israeli Section 102 / Section 3(i)
tax optimisation. Bilingual (Hebrew / English), zero third-party
dependencies, Node >= 18, pure JavaScript.

Israeli Section 102 is THE core optimisation — it is what every Israeli
tech company uses to reward employees at 25% capital-gains rates instead
of ~59% marginal + BL. This module puts that logic in code.

### Files produced

| Path | Purpose | LOC |
|---|---|---|
| `onyx-procurement/src/hr/options-vesting.js` | Core engine (`OptionsVesting` class + `CONSTANTS_2026` + `LABELS_HE`) | ~580 |
| `onyx-procurement/test/hr/options-vesting.test.js` | Unit test suite (32 tests) | ~360 |
| `_qa-reports/AG-Y073-options-vesting.md` | This report | — |

The `onyx-procurement/test/hr/` directory is **new**; it was created as an
additive upgrade to the existing `onyx-procurement/src/hr/` folder that
already hosts `analytics.js`. Nothing existing was deleted or renamed.

---

## 2. API surface — `OptionsVesting`

| Method | Purpose |
|---|---|
| `grantOption({ employeeId, type, shares, strike, grantDate, vestingSchedule, expiryDate, trackType, trustee, fmvAtGrant })` | Register a new grant, auto-build tranches, append `grant` event to ledger |
| `computeVested(grantId, asOfDate)` | Respect cliff + schedule, report vested / unvested / exercisable / cancelled |
| `exercise(grantId, shares, method, opts)` | `cash` / `cashless` / `swap` — handles broker-coverage math, appends `exercise` event |
| `computeTaxOnExercise({ grant, fmv, exerciseDate, shares, ...})` | Pure-function Israeli 102-capital / 102-ordinary / 3(i) tax math, including lockup check and מס יסף surtax |
| `trusteeTransfer(grantId, { depositDate, trustee })` | Mark grant as deposited at the 102 trustee and compute lockup-end date |
| `leaveAcceleration({ grantId, reason, cause, asOfDate, accelPct })` | `termination` / `death` / `change-of-control` accel rules, computes post-termination exercise deadline |
| `strike83b({ grantId, date })` | Israeli pre-IPO FMV declaration (US §83(b) equivalent) |
| `vestingSchedulePDF(grantId)` | Bilingual text-format grant agreement surrogate, ready for PDF renderer |
| `reportForForm161(employeeId)` | Equity row aggregate for טופס 161 severance form |
| `ledgerFor(grantId)` | Immutable copy of the grant's append-only event ledger |

All mutations append to a frozen ledger; reads never mutate. No
public `delete` / `remove`. The "ledger is frozen & append-only" test
guarantees this invariant.

---

## 3. Israeli Section 102 — the core tax optimisation

### 3.1 Why 102 matters

Without Section 102, equity awards to Israeli employees are taxed as
**employment income** at marginal rates (up to 47%) **plus** Bituach
Leumi (~12%) **plus** optional מס יסף (3%) — a blended 59-62% hit.

Section 102 of פקודת מס הכנסה (Income Tax Ordinance), added in the 2003
tax reform, lets the company route the award through a **trustee**
(`נאמן`) who holds the shares for a statutory lockup. If the lockup is
satisfied, the **post-grant appreciation** is taxed at a flat **25%**
capital-gains rate instead. This is the single biggest lever Israeli
startups have for employee comp, and it is precisely what this module
automates.

### 3.2 The three tracks implemented

| Track | Hebrew name | Trustee? | Lockup | Tax on gain | Notes |
|---|---|---|---|---|---|
| **`102-capital`** | מסלול רווח הון עם נאמן | Required | **24 months from grant** | **25% flat** on post-grant appreciation, ordinary on the FMV-at-grant portion | THE optimisation — default track for most Israeli employees |
| **`102-ordinary`** | מסלול הכנסה עם נאמן | Required | 12 months from grant | Marginal + BL | Company can deduct as wage expense (capital track cannot) |
| **`3(i)`** | סעיף 3(i) | Not allowed | — | Full marginal + BL | Consultants, board members, non-employees, >10% shareholders |

The engine rejects a `trusteeTransfer` on a `3(i)` grant (test
`trusteeTransfer: refuses 3(i) grants`) and splits the 102-capital spread
into ordinary vs capital portions when the lockup is satisfied.

### 3.3 The trustee (נאמן)

The trustee is a licensed Israeli entity (banks, trust companies such as
ESOP, IBI Trust, Altshuler-Shaham, etc.) that holds the granted shares
in a blind Section 102 account for the statutory lockup. Key rules:

1. **Deposit must happen within 90 days** of the board resolution (not
   tracked by this module — tracked upstream in the board-minutes
   engine).
2. **Capital track = 24 months** of continuous trustee holding from
   the **grant date**, not the exercise date.
3. **Ordinary track = 12 months** of continuous trustee holding from
   the grant date.
4. During lockup the employee **cannot** sell, transfer or pledge the
   shares. They can exercise, but the shares flow back to the trustee.
5. **Selling before the lockup ends** disqualifies the 102 treatment
   and the entire spread becomes ordinary income + BL (tested by
   `computeTaxOnExercise: 102-capital DISQUALIFIED`).

`trusteeTransfer(grantId, { depositDate, trustee })` records the deposit
and returns the `lockupEnds` ISO date. The engine uses `diffMonths` from
the grant date (not the deposit date) to test lockup satisfaction — this
matches Israel Tax Authority guidance.

### 3.4 The FMV-at-grant split (the hidden ordinary slice)

For a **pre-IPO** 102-capital grant, the Israel Tax Authority defines
FMV as the **30-trading-day average closing price** preceding grant.
Any spread **up to that FMV** is treated as ordinary income ("המחיר
המוגדר" / "the defined price"); any appreciation **beyond** the FMV
falls under the 25% capital track.

The engine stores `fmvAtGrant` on every grant. The split math (see
`computeTaxOnExercise` for `102-capital`, lockup-satisfied branch):

    ordinaryPortion = max(0, (fmvAtGrant - strike)) * shares
    capitalPortion  = max(0, totalSpread - ordinaryPortion)

    ordinaryTax = ordinaryPortion * marginalRate
    ordinaryBL  = ordinaryPortion * 0.12
    capitalTax  = capitalPortion  * 0.25

    grossTax    = ordinaryTax + ordinaryBL + capitalTax

Worked example (from the
`computeTaxOnExercise: 102-capital satisfied → 25%` test):

```
 strike      = 5 ₪
 fmvAtGrant  = 8 ₪
 fmvAtSale   = 50 ₪
 shares      = 1000
 monthsHeld  = 30  (> 24mo lockup → satisfied)

 totalSpread     = (50 - 5) * 1000 = 45_000
 ordinaryPortion = (8  - 5) * 1000 =  3_000
 capitalPortion  = 45_000 - 3_000  = 42_000

 ordinaryTax     = 3_000  * 0.47   =  1_410
 ordinaryBL      = 3_000  * 0.12   =    360
 capitalGainsTax = 42_000 * 0.25   = 10_500
 grossTax        = 12_270
 effectiveRate   ≈ 27 %  (vs ≈59 % if disqualified!)
```

### 3.5 מס יסף — the 3% surtax

High earners (annual income > **721,560 ₪** in 2026) pay an additional
3% surtax on the equity spread. Enabled by passing `annualIncome` to
`computeTaxOnExercise`; validated by the
`computeTaxOnExercise: high earner surtax applied` test.

---

## 4. Vesting-schedule interpreter

Two input modes, both tested:

### 4.1 Declarative

```js
vestingSchedule: {
  totalMonths: 48,
  cliffMonths: 12,
  frequency: 'monthly' | 'quarterly' | 'yearly',
}
```

The interpreter:

1. Splits `shares` into equal per-step tranches.
2. Rolls all pre-cliff steps into one cliff tranche at month `cliff`.
3. Dumps any rounding remainder onto the final tranche so total
   always equals `shares` exactly (regression protection).

The canonical 4-year / 1-year-cliff / monthly schedule:
- cliff at month 12 → 25% release
- months 13-48 → 1/48 per month
- fully vested at month 48

### 4.2 Explicit

```js
vestingSchedule: {
  tranches: [
    { date: '2024-12-31', shares: 500 },
    { date: '2025-12-31', shares: 500 },
    { date: '2026-12-31', shares: 500 },
  ],
}
```

Explicit tranches win over the declarative form, allowing custom
performance-based or milestone-based schedules (e.g. "30% on Series B
close, 30% on ARR > $10M, 40% on IPO"). Tested via
`computeVested: explicit tranches override`.

### 4.3 Cliff math

`computeVested` returns `beforeCliff: true` and `vested: 0` for any
asOfDate strictly before the cliff (tested). At the cliff the full
accumulated chunk releases in a single transaction (tested).

---

## 5. Exercise methods

| Method | Cash outlay | Shares received | Use case |
|---|---|---|---|
| `cash` | `strike × shares` | all `shares` | employee has capital, wants full position |
| `cashless` | 0 | `shares − ⌈cost/fmv⌉` | broker immediately sells enough to cover strike; zero out-of-pocket |
| `swap` | 0 | all `shares` (but surrenders `⌈cost/fmv⌉` owned shares) | employee has existing stock, wants to avoid tax events on sale |

All three are exercised via the `exercise` method and tested. Each
emits an immutable `exercise` event to the ledger with the full
payload (shares, fmv, strike, cost, spread, cashOutlay, sharesReceived,
surrenderedShares) so downstream payroll / BL reporting can pick it up
verbatim.

---

## 6. Acceleration rules

`leaveAcceleration({ grantId, reason, cause?, asOfDate?, accelPct? })`

| Reason | Cause | Default accel | Post-termination exercise window |
|---|---|---|---|
| `termination` | `for-cause` | 0% (everything unvested is cancelled) | 90 days |
| `termination` | other | 0% (override via `accelPct`) | 90 days |
| `death` | — | 100% | until original expiry |
| `change-of-control` | — | 100% (single-trigger) | until original expiry |

All constants live in `CONSTANTS_2026` and are overrideable per-call
via `accelPct` (tested). When acceleration fires, the engine rewrites
future tranches to vest at `asOfDate` and increments `cancelledShares`
for the un-accelerated remainder. The grant transitions to
`status: 'closed'` for termination / death.

---

## 7. Section 83(b) — the Israeli surrogate

Israeli tax law has **no literal §83(b) election**. For pre-IPO
102-capital grants, however, the Israel Tax Authority accepts a
**documented 30-day-avg FMV declaration** at grant date. This freezes
the ordinary-income slice and converts all subsequent appreciation to
capital-gains treatment — functionally equivalent to a US §83(b)
election.

`strike83b({ grantId, date })` records this declaration on the ledger
with `mechanism: 'israeli-pre-ipo-fmv-declaration'` and the notes
explaining the divergence from US practice. Tested.

---

## 8. Form 161 integration

`reportForForm161(employeeId)` aggregates every grant owned by the
departing employee into a structured row set for the existing
`AG-Y015 severance-tracker` → טופס 161 pipeline. Each row carries
`trackHe` (Hebrew track name), `trustee`, `vested`, `exercised`,
`strike`, `fmvAtGrant` — exactly the columns required by the Israel
Tax Authority's equity addendum to Form 161.

Tested by `reportForForm161: aggregates grants per employee`.

---

## 9. Append-only guarantee

| Invariant | Mechanism |
|---|---|
| No public delete | Neither `OptionsVesting` nor the module exports a delete method |
| Ledger entries frozen | `_append` wraps every event in `Object.freeze({ ..., payload: Object.freeze({...}) })` |
| Snapshot isolation | `ledgerFor(grantId)` returns a `slice()` copy so caller mutations don't leak |
| Cancellation is additive | `cancelledShares` is an incremented counter; original `shares` is never reduced |
| Exercise is additive | `exercisedShares` counter only ever increases |

Verified by test `ledger: grant entries are frozen & append-only`:

```js
assert.throws(() => { ledger[0].payload.employeeId = 'hacker'; }, TypeError);
ledger.push({ fake: true });
assert.equal(eng.ledgerFor(g.id).length, 3); // still 3, not 4
```

---

## 10. Test matrix (32 / 32 passing)

| # | Test | Area |
|---|---|---|
| 1 | rejects unknown type | validation |
| 2 | rejects unknown trackType | validation |
| 3 | requires positive shares | validation |
| 4 | produces id and ledger entry | registration |
| 5 | pre-cliff returns 0 | vesting |
| 6 | at cliff releases 1/4 | vesting |
| 7 | mid-vest returns half | vesting |
| 8 | fully vested after totalMonths | vesting |
| 9 | quarterly schedule | vesting |
| 10 | explicit tranches override | vesting |
| 11 | rejects beyond vested | exercise |
| 12 | cash outlay matches strike × shares | exercise |
| 13 | cashless keeps net shares only | exercise |
| 14 | swap surrenders owned shares | exercise |
| 15 | 102-capital satisfied → 25% | **tax** |
| 16 | 102-capital disqualified → ordinary | **tax** |
| 17 | 102-ordinary → marginal + BL | **tax** |
| 18 | 3(i) → full marginal + BL | **tax** |
| 19 | high earner surtax | **tax** |
| 20 | trustee 24-month lockup | trustee |
| 21 | trustee 12-month lockup | trustee |
| 22 | trustee refuses 3(i) | trustee |
| 23 | termination cancels by default | acceleration |
| 24 | change-of-control full accel | acceleration |
| 25 | death full accel | acceleration |
| 26 | custom accelPct honoured | acceleration |
| 27 | strike83b FMV note | 83b |
| 28 | PDF surrogate Hebrew labels | PDF |
| 29 | form 161 aggregation | form161 |
| 30 | ledger frozen & append-only | ledger |
| 31 | constants sanity | constants |
| 32 | diffMonths round-trip | internals |

Run with:

    node --test onyx-procurement/test/hr/options-vesting.test.js

```
ℹ tests 32
ℹ pass 32
ℹ fail 0
ℹ duration_ms 129.042
```

---

## 11. Hebrew glossary (LABELS_HE surface)

| English term | Hebrew | Module key |
|---|---|---|
| Option grant | הקצאת אופציות | `grant` |
| Grant date | תאריך הקצאה | `grantDate` |
| Vested | הבשלו | `vested` |
| Unvested | לא הבשילו | `unvested` |
| Exercised | מומשו | `exercised` |
| Strike price | תוספת מימוש | `strike` |
| Fair market value | שווי הוגן | `fmv` |
| Taxable spread | מרווח חייב במס | `spread` |
| Capital gain | רווח הון | `capitalGain` |
| Ordinary income | הכנסת עבודה | `ordinaryIncome` |
| Trustee | נאמן | `trustee` |
| Lockup period | תקופת חסימה | `lockup` |
| Section 102 capital | סעיף 102 מסלול רווח הון | `section102capital` |
| Section 102 ordinary | סעיף 102 מסלול הכנסה | `section102ordinary` |
| Section 3(i) | סעיף 3(i) | `section3i` |
| Cliff | תקופת מחסום | `cliff` |
| Acceleration | האצה | `acceleration` |
| Termination | סיום העסקה | `termination` |
| Change of control | שינוי שליטה | `changeOfControl` |
| Death | פטירה | `death` |
| Form 161 | טופס 161 | `form161` |
| National insurance | ביטוח לאומי | `bituachLeumi` |
| Surtax (מס יסף) | מס יסף | `surtax` |

---

## 12. Integration points

- **AG-Y015 severance-tracker** — consumes `reportForForm161()` output
  as the equity addendum to Form 161 rows.
- **AG-Y012 form-102-bl** — consumes `exercise` ledger events so BL on
  the spread is reported on the ordinary track.
- **AG-Y006 capital-gains** — consumes `computeTaxOnExercise` output
  when the 102-capital lockup is satisfied to roll the 25% slice into
  the annual capital-gains return.
- **Payroll engine (`onyx-procurement/src/hr/analytics.js`)** —
  `totalComp` can import `OptionsVesting.computeVested` for equity-at-
  last-price contribution to total comp calculations.

None of these consumers require changes for this module to ship; they
will pick it up additively through the existing ledger reader pattern.

---

## 13. Compliance checklist

- [x] Zero third-party dependencies (only Node stdlib)
- [x] Node >= 18 supported (uses `node:test`, `node:assert/strict`)
- [x] Bilingual Hebrew / English labels
- [x] Append-only ledger — no delete / remove
- [x] Pure functions for all tax math — safe to embed in batch jobs
- [x] 32 / 32 tests passing
- [x] Israeli Section 102 capital track 24-month lockup verified
  (both satisfied and disqualified branches)
- [x] Israeli Section 102 ordinary track 12-month lockup verified
- [x] Israeli Section 3(i) full marginal + BL verified
- [x] מס יסף surtax applied above 2026 threshold
- [x] Acceleration rules cover termination / death / change-of-control
- [x] Post-termination exercise window computed (90-day default)
- [x] Form 161 equity addendum producer in place
- [x] Docs (this report) frozen for the 2026 tax year

— END AG-Y073 —
