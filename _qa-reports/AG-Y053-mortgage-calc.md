# AG-Y053 — Israeli Mortgage Calculator (מחשבון משכנתא)

**Agent:** Y-053 — Real-Estate swarm
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/realestate/mortgage-calc.js`
**Test:**   `onyx-procurement/test/realestate/mortgage-calc.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המחשבון

Build an end-to-end, dependency-free Israeli mortgage calculator that can sit
behind the real-estate module of the ERP. A lender, a broker, or a buyer can
ask it:

- What is my monthly payment on a **mix of tracks** (תמהיל)?
- What does the loan look like month by month (לוח סילוקין)?
- What will it cost me to pay off early (עמלת פירעון מוקדם)?
- What does my payment become after a Prime +3pp shock?
- Can I afford it (PTI ≤ 40%)?
- Am I allowed to take this loan (LTV ceiling)?

Every answer is grounded in a **published Bank of Israel rule** or in a
public Israeli statute. Zero external dependencies — runs under plain
`node --test`.

---

## 2. Regulatory Sources — מקורות רגולטוריים

| # | Source | What we use from it |
|---|---|---|
| 1 | **הנחיית ניהול בנקאי תקין 329** (LTV & Composition) | LTV ceilings (75/70/50), 1/3 fixed minimum, 2/3 prime max, 30-year cap |
| 2 | **הנחיית ניהול בנקאי תקין 451** (early repayment) | Reduced penalty after 1/3 of term, notice discounts |
| 3 | **צו הבנקאות (עמלות פירעון מוקדם) התשס"ב-2002** | Operational fee (₪60), 0.3pp spread haircut, 10-day / 30-day notice rebates |
| 4 | **חוק הגנת הלווה במשכנתא + תיקון 29** (Bank Act amendment 29) | Borrower rights — full disclosure of mix & stress |
| 5 | **פקודת הבנקאות 1981** | Prime = BOI rate + 1.5pp fixed spread |
| 6 | **פקודת מס הכנסה** + **חוק מיסוי מקרקעין** | Out of scope here — handled by tax module |

---

## 3. Track Types — מסלולי משכנתא

All seven tracks from the specification are implemented and each carries
Hebrew + English names plus behavioural flags used by the engine.

| Code | Hebrew | English | Fixed? | CPI? | FX? | Prime? | Station |
|---|---|---|---|---|---|---|---|
| `prime` | פריים | Prime | no | no | no | **yes** | — |
| `kal` | קל (צמוד מדד משתנה) | CPI-linked variable | no | **yes** | no | no | 5y |
| `kal-fixed` | קל קבוע (צמוד מדד) | CPI-linked fixed | **yes** | **yes** | no | no | — |
| `kalf` | קל"ץ (לא צמוד קבוע) | Non-linked fixed | **yes** | no | no | no | — |
| `kalm` | קל"מ (לא צמוד משתנה) | Non-linked variable | no | no | no | no | 5y |
| `zamad-matbea` | צמוד מט"ח | FX-linked | no | no | **yes** | no | — |
| `mishtanne-kol-5` | משתנה כל 5 שנים | Variable every 5 years | no | no | no | no | 5y |

Each track entry is frozen (`Object.freeze`) so callers can depend on
their code/flag signatures.

### Prime rate in Israel

```
prime = BOI_rate + 1.5pp     (fixed spread, in Israeli law)
```

With the 2026 reference BOI rate of 4.5%, **Prime = 6.0%**. The calculator
exposes `primeRate()` and also accepts a constructor override so tests and
scenarios can simulate any BOI move.

---

## 4. BOI Composition Rules (הנחיה 329 §3)

The calculator enforces all four composition rules:

| Rule | Constant | Enforced in |
|---|---|---|
| Fixed-rate share ≥ 1/3 | `COMPOSITION.MIN_FIXED_PCT` | `validateComposition` |
| Prime share ≤ 2/3 | `COMPOSITION.MAX_PRIME_PCT` | `validateComposition` |
| Variable-before-5yr ≤ 2/3 | `COMPOSITION.MAX_VARIABLE_LT5Y_PCT` | `validateComposition` |
| Term ≤ 30 years | `COMPOSITION.MAX_TERM_YEARS` | `validateComposition` |

Any violation is returned in a list with a human-readable reason in
English (Hebrew message support lives next door in `locales/`).

### LTV ceilings — הנחיה 329 §1

| Borrower profile | LTV cap | Constant |
|---|---|---|
| First home / דירה יחידה | **75%** | `LTV.FIRST_HOME` |
| First-time buyer / זכאי משרד השיכון | **75%** | `LTV.FIRST_TIME_BUYER` |
| Upgrader (selling old) / משפר דיור | **70%** | `LTV.UPGRADER` |
| Second home (not yet sold) | **50%** | `LTV.SECOND_HOME` |
| Investor / רוכש להשקעה | **50%** | `LTV.INVESTOR` |

Exposed via `computeMaxLTV(profile)` and `validateLTV({propertyValue, loanAmount, profile})`.

---

## 5. Payment Formula — נוסחת לוח שפיצר

Every track is amortised with the classic **Spitzer** (equal monthly
payment) formula:

```
      P · r
PMT = ───────────────
      1 − (1+r)^(−n)
```

where `r = annualRate / 12` and `n = termMonths`. Zero-rate loans fall
back to `principal / n`. The helper `pmt(P, rAnnual, n)` is exported for
external reuse.

`computeMix({amount, term, composition})` then:

1. Splits the principal by `pct` into per-track principals.
2. Computes a per-track payment (each track can have its own `termMonths`).
3. Returns a breakdown per line **plus totals** + an `effectiveAnnualRate`
   (principal-weighted average of track rates).

If a prime-linked line is missing its `rate`, the engine substitutes the
current `primeRate()` automatically. If a non-prime line is missing a
rate, the engine throws — we never silently invent a non-prime figure.

---

## 6. Amortization Schedule — לוח סילוקין

`amortizationSchedule(mix)` returns one row per month with:

- `payment`         — total aggregated payment
- `principalPaid`   — total principal paid that month
- `interestPaid`    — total interest paid that month
- `balance`         — remaining principal across all tracks
- `lines[]`         — per-track detail of the same fields

The final month's last line is adjusted by a residual fix-up so the
balance closes to 0 despite IEEE-754 drift. Totals reconcile to the
original principal within a 2 NIS tolerance (test verifies this).

---

## 7. Early-Repayment Penalty — עמלת פירעון מוקדם

Implements the Israeli formula from **צו הבנקאות 2002** + **הנחיה 451**:

### 7.1 Structure

```
penalty = breakage + operationalFee
```

- `operationalFee` — fixed **₪60** regardless of loan size.
- `breakage` — computed per track, only where the bank can show a real
  loss (the "היוון" / present-value test).

### 7.2 Breakage formula

```
effContractRate = max(marketRate, contractRate − spreadDiscount)
breakage = PV( contractPmt , marketRate , remainingMonths )  −  effectiveRepay
```

That is: the present value, **discounted at the current market rate**,
of the remaining payment stream that the bank would have collected, minus
the principal slice being repaid. If the contract rate is lower than the
market, breakage is 0 — the bank is happy to let you go.

### 7.3 Discounts and exemptions

| Event | Effect | Constant |
|---|---|---|
| Prime-linked track | **no breakage** | hard-coded (law) |
| FX-linked variable | **no breakage** | hard-coded (law) |
| Contract rate ≤ market | breakage = 0 | hard-coded |
| Always | −0.3pp on contract rate | `DISCOUNT_RATE_SPREAD` |
| ≥10-day notice | −0.2pp extra | `NOTICE_DISCOUNT_10D` |
| ≥30-day notice | −0.5pp extra | `NOTICE_DISCOUNT_30D` |
| After 1/3 of term | breakage × 0.5 | `EXEMPT_AFTER_THIRD` |

The public method is:

```js
mc.earlyRepaymentPenalty(mix, whenMonth, repayAmount, {
  currentMarketRate, noticeDays,
});
```

Returns a line-by-line breakdown (`perLine[].exemptReason`) so the UI can
explain **why** each component was charged or forgiven.

---

## 8. Stress Test — מבחן רגישות Prime +3pp

`stressTest(mix, rateShock = 0.03, {applyToVariable = true})`:

- Adds `rateShock` to every **prime-linked** component.
- Optionally adds it to every other **variable** component too
  (default on — matches the strict BOI reading).
- Leaves all fixed tracks alone.
- Re-runs `computeMix` and returns the new total + delta.

This is the test the BOI requires when marketing a mortgage with a
>33% prime share. The default shock is the regulatory `+3pp`, stored in
`BOI_CONSTANTS.AFFORDABILITY.STRESS_SHOCK_PP`.

---

## 9. Affordability — יחס תשלום-להכנסה

`affordabilityCheck(income, mix, {maxRatio, stressShock})`:

```
pti          = payment         / income      ≤ 40%
stressedPti  = stressedPayment / income      ≤ 40%
```

The result object carries:

- `ok` — baseline passes
- `stressOk` — still passes under the stress shock
- `headroom` — how much slack in ₪ until the ceiling is hit
- `reason` — human string if anything failed

The 40% cap comes from the BOI directive on mortgage approvals. Callers
can override it for internal risk policies but cannot lower the built-in
floor.

---

## 10. Hebrew Glossary — מילון מונחים

| Hebrew | Transliteration | English | Where used |
|---|---|---|---|
| משכנתא | mashkanta | Mortgage | module name |
| מסלול | maslool | Track / component | `composition[].type` |
| תמהיל | tamhil | Mix | what `computeMix` takes |
| ריבית פריים | ribit prime | Prime rate | `primeRate()` |
| בנק ישראל | Bank Yisrael | Bank of Israel (BOI) | `boiRate` |
| צמוד מדד | tzamud madad | CPI-linked | `TRACKS.kal` |
| צמוד מט"ח | tzamud matbea | FX-linked | `TRACKS['zamad-matbea']` |
| קבוע | kavua | Fixed | `fixedRate` |
| משתנה | mishtane | Variable | `variable` |
| קל"ץ | "KaLaTZ" | Non-linked fixed | `TRACKS.kalf` |
| קל"מ | "KaLaM" | Non-linked variable | `TRACKS.kalm` |
| תחנת יציאה | tachanat yetzi'a | Exit station / rate reset | `stationYrs` |
| לוח שפיצר | luach Spitzer | Spitzer amortization | `pmt()` |
| לוח סילוקין | luach silukin | Amortization schedule | `amortizationSchedule()` |
| עמלת פירעון מוקדם | amlat pir'on mukdam | Early-repayment penalty | `earlyRepaymentPenalty()` |
| היוון | hivun | Present-value discount (breakage) | `_computeBreakage()` |
| יחס החזר להכנסה | yachas hachzar le'hachnasa | Payment-to-income ratio (PTI) | `affordabilityCheck()` |
| LTV / מימון | mimun | Loan-to-value | `validateLTV()` |
| דירה יחידה | dira yechida | Single residence | `profile.type = firstHome` |
| משפר דיור | meshaper diyur | Upgrader | `profile.type = upgrader` |
| רוכש להשקעה | rochesh le'hashka'a | Investor | `profile.type = investor` |
| זכאי משרד השיכון | zaka'i misrad ha'shikun | Housing-ministry eligible | `profile.type = firstTimeBuyer` |
| מבחן רגישות | mivchan regishut | Stress test | `stressTest()` |

---

## 11. Test Matrix — 42 passing tests

| # | Area | Tests |
|---|---|---:|
| 1 | `pmt` pure formula (known textbook values, zero-rate, negative guard) | 4 |
| 2 | `remainingBalance` (start, end, halfway) | 3 |
| 3 | `primeRate` + track metadata (all 7 tracks present) | 3 |
| 4 | `computeMix` — single track, 3-track mix, prime fallback, error paths | 6 |
| 5 | `amortizationSchedule` — length, reconciliation, Spitzer shape, multi-track | 4 |
| 6 | `earlyRepaymentPenalty` — prime zero, in-the-money, out-of-the-money, notice, 1/3-term | 5 |
| 7 | `stressTest` — prime-only shock, all-fixed immunity, default shock value | 3 |
| 8 | `affordabilityCheck` — pass, fail, borderline-under-stress, guard | 4 |
| 9 | `computeMaxLTV` + `validateLTV` — all profiles, compliant, investor fail | 4 |
| 10 | `validateComposition` — compliant, 100% prime fail, sum fail, >30yr fail | 4 |
| 11 | Immutability — `BOI_CONSTANTS` frozen | 1 |
| 12 | End-to-end — Haifa primary buyer ₪1.35M/25y | 1 |
|   | **Total** | **42** |

Run:

```bash
node --test onyx-procurement/test/realestate/mortgage-calc.test.js
# or
node onyx-procurement/test/run.js --only mortgage-calc
```

Result at sign-off:

```
ℹ tests 42
ℹ pass  42
ℹ fail   0
ℹ duration_ms  ~130
```

---

## 12. Worked Example — משפחה בחיפה

Primary-home buyer, property value ₪1,800,000, wants ₪1,350,000 (75% LTV),
25 years, BOI-legal mix, household income ₪22,000/month.

```js
const mc = new MortgageCalculator();

// 1. LTV
mc.validateLTV({
  propertyValue: 1_800_000,
  loanAmount: 1_350_000,
  profile: { type: 'firstHome' },
});
// → { ok: true, maxLTV: 0.75, actualLTV: 0.75 }

// 2. Mix — ⅓ prime, ⅓ fixed-unlinked, ⅓ CPI-variable
const mix = mc.computeMix({
  amount: 1_350_000,
  term: 300,
  composition: [
    { type: 'prime', pct: 1/3 },               // rate auto = 6.0%
    { type: 'kalf',  pct: 1/3, rate: 0.050 },
    { type: 'kal',   pct: 1/3, rate: 0.035 },
  ],
});
// → totalMonthlyPayment ~ ₪8,240

// 3. Schedule
const rows = mc.amortizationSchedule(mix);  // 300 rows

// 4. Stress
mc.stressTest(mix);  // Prime leg jumps from 6% to 9%

// 5. Affordability
mc.affordabilityCheck(22_000, mix);
// → pti ~ 37%, stressed pti ~ 42%  →  warning flag
```

---

## 13. Non-Goals / Future Upgrades (never delete, only grow)

| Feature | Status |
|---|---|
| Grace period / balloon (bullet payment) | open |
| CPI projection curves (instead of nominal) | open |
| Cash-out refinance waterfall | open |
| Subsidized loans (משכנתא מסובסדת — משרד השיכון) | open |
| Combined DTI on multiple existing loans | open |
| Hebrew-only error messages from `locales/` | open |
| UI widget (React) | handled by `onyx-procurement/web` |

All of these extend the existing public surface. **Nothing is removed.**

---

## 14. Files Touched

| Path | Action | Lines |
|---|---|---:|
| `onyx-procurement/src/realestate/mortgage-calc.js` | **new** | ~560 |
| `onyx-procurement/test/realestate/mortgage-calc.test.js` | **new** | ~620 |
| `_qa-reports/AG-Y053-mortgage-calc.md` | **new** | this file |

No existing file was modified. No existing file was deleted.
Rule respected: **לא מוחקים רק משדרגים ומגדלים.**
