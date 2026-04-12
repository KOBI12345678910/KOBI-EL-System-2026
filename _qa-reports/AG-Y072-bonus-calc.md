# AG-Y072 — Bonus Calculator (`BonusCalculator`)

**Agent**: Y-072
**Module**: `onyx-procurement/src/hr/bonus-calc.js`
**Tests**: `onyx-procurement/test/hr/bonus-calc.test.js`
**Date**: 2026-04-11
**House rule**: לא מוחקים רק משדרגים ומגדלים — Never delete, always upgrade and grow.

---

## 1. Scope

A pure-JavaScript, zero-dependency calculator for every bonus type used
by Techno-Kol Uzi's Israeli payroll:

| Bonus Type                  | Hebrew                 | English                |
| --------------------------- | ---------------------- | ---------------------- |
| `performance`               | בונוס ביצועים          | Performance Bonus      |
| `retention` (multi-tranche) | בונוס שימור            | Retention Bonus        |
| `signing` (with clawback)   | מענק חתימה             | Signing Bonus          |
| `holiday`                   | מתנה לחג               | Holiday Gift           |
| `13th_month`                | משכורת 13              | 13th Salary            |
| `project`                   | בונוס פרויקט           | Project Bonus          |
| `clawback` (counter-entry)  | החזר בונוס             | Clawback               |

Everything is exposed via a single class, `BonusCalculator`, plus a set
of frozen constants and tiny internal helpers for tests and
composition.

## 2. API surface

```
new BonusCalculator({
  holidayGiftCeiling?, marginalRate?, flatRate?,
  performanceCurve?, clawbackMonths?
})

calculatePerformanceBonus({employee, rating, targetPct, actualPct, period})
calculateRetentionBonus({employee, amount, vestingPeriod, payoutDates})
calculateSigningBonus({employee, amount, clawbackPeriod})
computeSigningClawback(signingRecord, monthsWorked)          // pure helper
calculateHolidayBonus({employee, period, amount})
calculate13thMonth({employee, eligibility})
calculateProjectBonus({project, team, budget})
applyTax({bonus, taxRate: 'marginal' | 'flat'})
payoutSchedule(bonusId)
clawback({employeeId, reason, amount, bonusId?})
communicateBonus(employeeId)                                  // bilingual letter
getLedger() / getBonus(id)                                    // read-only ledger
```

Each calculate* method returns a frozen-shape record with:
- `id` (monotonic, not cryptographic)
- `type`, `label: {he, en}`
- `employee_id`, `gross`, `currency: 'ILS'`
- `taxable`, `counts_as_salary` (booleans)
- `created_at` ISO timestamp
- type-specific fields (tranches, distribution, clawback_period_months,
  tax_free_portion, taxable_portion, etc.)

## 3. Tax treatment (Israeli 2026)

The calculator implements the Israeli payroll default: **a bonus is
ordinary salary**. It is subject to:

1. **Income tax** — either marginal (top bracket assumed 47% unless
   overridden) or a flat rate (35% default). Callers specify via
   `taxRate: 'marginal' | 'flat'`.
2. **Bituach Leumi (ביטוח לאומי)** — simplified 12% (real payroll
   module applies the full bracketed calculation).
3. **Pension contribution (פנסיה)** — 6% employee side.
4. **Health tax (מס בריאות)** — 5%.

Constants:
```
DEFAULT_MARGINAL_RATE = 0.47
DEFAULT_FLAT_BONUS_RATE = 0.35
SOCIAL_CHARGES = {
  BITUACH_LEUMI_EMPLOYEE: 0.12,
  PENSION_EMPLOYEE:      0.06,
  HEALTH_TAX:            0.05,
}
```

All four deductions are applied in `applyTax()` unless
`bonus.counts_as_salary === false` (the holiday-gift case), in which
case only income tax is charged on the overflow portion and social
charges are zero.

`applyTax()` is **additive**: it returns a new record that merges the
tax/net fields into the original, and upgrades the ledger in place —
it never deletes or mutates history.

## 4. Israeli holiday-gift (מתנות לחגים) rules

Per פקודת מס הכנסה and the ITA circulars for 2025/2026:

| Item                                        | Value                  |
| ------------------------------------------- | ---------------------- |
| Tax-free ceiling per event per employee     | **~228 ₪**             |
| Recognised tax-free events per year         | Up to 3                |
| Recognised holidays (this module)           | פורים, ראש השנה, פסח   |
| Excess above ceiling                        | Fully taxable as income |
| Counts as salary for BL / pension / severance | **No** (the statutory gift itself) |

Constants:
```
HOLIDAY_GIFT_TAX_FREE_CEILING_ILS = 228
HOLIDAY_GIFT_MAX_EVENTS_PER_YEAR  = 3
HOLIDAY_PERIODS = { PURIM:'purim', ROSH_HASHANA:'rosh-hashana', PASSOVER:'passover' }
```

Because the ITA updates the figure annually, the constructor accepts
`{holidayGiftCeiling: <new number>}` to override without touching
source — honoring the "never delete, only upgrade" rule.

The split is computed as:
```
taxFree = min(gross, ceiling)
taxable = max(0, gross - ceiling)
```
and `applyTax({bonus})` taxes only the `taxable_portion`.

## 5. Clawback semantics

Signing-bonus clawback is linear pro-rata over `clawbackPeriod` months
(default 24):

```
vestedFraction  = min(1, monthsWorked / clawbackPeriod)
owed            = amount * (1 - vestedFraction)
owed            = clamp(owed, 0, amount)
```

`clawback()` records a **counter-entry** in the ledger
(`type: 'clawback'`) and appends an entry to the original signing
record's `clawback_history[]`. The original record's `gross` is never
decreased — the history is audit-visible.

## 6. 13th salary (משכורת 13)

`calculate13thMonth` pays **only when the employee is covered by a
collective agreement** (`eligibility.covered === true`). When not
covered, it returns a zero-amount record with `eligible: false` so the
UI can surface a clear message rather than silently paying nothing.

When eligible, the pro-rata formula is:
```
gross = base_salary * (months_worked / 12)
```

## 7. Retention multi-tranche

- If `payoutDates` is provided, one tranche per date; the last tranche
  absorbs any rounding drift so the sum equals the total exactly.
- If not provided, the schedule auto-generates quarterly tranches
  across `vestingPeriod`.
- Each tranche carries `{index, date, amount, vested, paid}` so the
  payroll runner can flip `vested` / `paid` over time without ever
  deleting history.

## 8. Project bonus

- Distributed across `team[]` by `weight` proportionally to `budget`.
- Rounding drift is absorbed on the last team member so the total
  equals `budget` exactly.
- `applyTax()` iterates the `distribution[]` and computes tax, BL,
  pension, health, and net for each team member.

## 9. Communication (bilingual letter)

`communicateBonus(employeeId)` returns `{he, en, records, employee_id}`
with:
- Hebrew block + English block, both plain-text, RTL-friendly.
- Lists only what was already approved in this run — no forward
  promises, no "guaranteed" language (asserted by the tests).
- Includes the payroll disclaimer:
  "The amounts above are estimates. Final calculation is performed by
  the payroll system per Israeli Income Tax Ordinance, Bituach Leumi,
  and pension rules."
- Signing bonuses disclose the pro-rata clawback obligation.
- 13th-month ineligibility is stated plainly.

## 10. Test plan (`test/hr/bonus-calc.test.js`)

Run: `node --test test/hr/bonus-calc.test.js`

| #  | Scenario                                                       |
| -- | -------------------------------------------------------------- |
| 01 | Performance: rating 3 at target pays exactly target            |
| 02 | Performance: rating 5 at 120% scales by full curve             |
| 03 | Performance: rating 1 pays zero                                |
| 04 | Performance: achievement capped at 2x                          |
| 05 | Retention: explicit payoutDates, drift absorbed on last        |
| 06 | Retention: auto-schedule when payoutDates omitted              |
| 07 | Signing: default clawback window stored                        |
| 08 | Clawback: linear pro-rata at 12/24 = 50%                       |
| 09 | Clawback: leaves at 0 → full amount owed                       |
| 10 | Clawback: leaves at/after window → 0 owed                      |
| 11 | Clawback(): non-destructive ledger entry linked to original    |
| 12 | Holiday gift: exactly at ceiling is fully tax-free             |
| 13 | Holiday gift: above ceiling → taxable overflow                 |
| 14 | Holiday gift: rejects unknown holiday key                      |
| 15 | Holiday gift: applyTax only taxes overflow, no social charges  |
| 16 | 13th salary: covered + full year                               |
| 17 | 13th salary: covered + partial year → pro-rata                 |
| 18 | 13th salary: NOT covered → zero gross + eligible:false         |
| 19 | Project: distributes by weight, absorbs drift                  |
| 20 | applyTax marginal: deducts tax + BL + pension + health         |
| 21 | applyTax flat: uses configured flat rate                       |
| 22 | payoutSchedule: retention returns tranche list                 |
| 23 | payoutSchedule: unknown id returns empty schedule              |
| 24 | communicateBonus: bilingual, no over-commitments, disclaimers  |
| 25 | Ledger preserves history — לא מוחקים רק משדרגים ומגדלים        |

**Result**: 25/25 pass, duration ≈ 286 ms on Node's built-in test runner.

## 11. Hebrew glossary

| Hebrew                | Translit.            | English                        | Used as                   |
| --------------------- | -------------------- | ------------------------------ | ------------------------- |
| בונוס ביצועים         | Bonus Bitsu'im       | Performance bonus              | `LABELS.PERFORMANCE`      |
| בונוס שימור           | Bonus Shimur         | Retention bonus                | `LABELS.RETENTION`        |
| מענק חתימה            | Ma'anak Khatima      | Signing bonus                  | `LABELS.SIGNING`          |
| מתנה לחג / מתנות לחגים | Matana LaKhag        | Holiday gift                   | `LABELS.HOLIDAY`          |
| משכורת 13            | Maskoret Shlosh Esre  | 13th month salary              | `LABELS.THIRTEENTH`       |
| בונוס פרויקט         | Bonus Proyekt        | Project completion bonus       | `LABELS.PROJECT`          |
| הסכם קיבוצי          | Heskem Kibutzi       | Collective labour agreement    | 13th-month eligibility    |
| פורים                | Purim                | Purim                          | Holiday period            |
| ראש השנה             | Rosh HaShana         | Jewish New Year                | Holiday period            |
| פסח                  | Pesakh               | Passover                       | Holiday period            |
| פקודת מס הכנסה       | Pkudat Mas Hakhnasa  | Income Tax Ordinance           | Tax authority             |
| ביטוח לאומי          | Bituakh Le'umi       | National Insurance             | Social-charge line        |
| מס בריאות            | Mas Bri'ut           | Health tax                     | Social-charge line        |
| פנסיה                | Pensia               | Pension                        | Social-charge line        |
| פיצויי פיטורים       | Pitsuyei Piturim     | Severance pay                  | Israeli labor law         |
| סכום ברוטו           | Skhum Bruto          | Gross amount                   | Record field              |
| סכום נטו             | Skhum Neto           | Net amount                     | Record field              |
| החזר בונוס           | Hekhzer Bonus        | Clawback                       | `LABELS.CLAWBACK`         |
| הבשלה                | Hab'shala            | Vesting                        | Retention tranches        |
| פעימה                | Pe'ima               | Tranche (of a payout)          | Retention tranches        |
| מובטח                | Muvtakh              | Guaranteed                     | Forbidden word (letter)   |
| יחסי / pro-rata      | Yakhasi              | Pro-rata                       | Clawback disclosure       |

## 12. Non-deletion guarantee

This module:
- Writes **new** files (`bonus-calc.js`, `bonus-calc.test.js`, this
  report). It does not modify any pre-existing file.
- `applyTax()` and `clawback()` return upgraded record shapes but
  never remove or overwrite prior fields.
- The in-memory ledger is append-only; `getLedger()` and `getBonus()`
  are read-only views.
- The holiday ceiling can be bumped next year via the constructor
  (`new BonusCalculator({ holidayGiftCeiling: 240 })`) without editing
  the source — future-proof upgrade path.

## 13. Known limits / follow-ups

- Bituach Leumi bracket logic is simplified — the authoritative
  payroll module applies the real bracketed calc; this module's
  `net` is always labelled "estimated" in the communication letter.
- Marginal-rate default is a conservative 47%; callers should pass the
  employee's actual marginal rate when precision matters.
- Holiday-gift ceiling tracks the commonly-cited 228 ₪ figure; the ITA
  publishes the exact number each year — override via constructor as
  soon as the 2026 final figure is published.
- No persistence layer — caller is responsible for saving ledger
  records to the DB / file system.

---

**Status**: GREEN — 25/25 tests passing, zero deps, bilingual,
Israeli-payroll-aware, non-destructive.
