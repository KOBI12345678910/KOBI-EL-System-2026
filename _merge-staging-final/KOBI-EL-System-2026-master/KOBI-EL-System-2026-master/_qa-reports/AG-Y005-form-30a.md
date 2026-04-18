# AG-Y005 — Form 30A / 30B (Self-Employed Quarterly Advance)

**Agent:** Y-005 — Swarm Tax-Forms
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/tax/form-30a.js`
**Test:** `onyx-procurement/test/tax/form-30a.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת הדוחות

Israeli self-employed taxpayers (עצמאים) and small businesses pay **advance
payments** (מקדמות) on account of the annual income-tax liability. The
payments are reported to רשות המסים on one of two forms:

| Form | Hebrew | Used when |
|---|---|---|
| **30א** | מקדמות לעצמאי | Regular quarterly advance. Rate comes from the **Tax Authority notice** issued each year based on the last annual return. |
| **30ב** | מקדמות מתואמות | Adjusted advance. Used when the current-year actuals diverge materially from the initial rate — the taxpayer proposes a new rate based on YTD performance and must provide a justification. |

Legal basis: פקודת מס הכנסה + תקנות מס הכנסה (מקדמות), התשל"א-1971.

---

## 2. Advance-Rate Formula — נוסחת אחוז המקדמות

The advance **rate** (אחוז מקדמות) is a simple ratio expressed as a decimal
(0.073 = 7.3%).

### 2.1 Regular rate (Form 30A)

```
rate = priorYearTax / priorYearRevenue
```

**Source of truth:** the latest Tax Authority notice (הודעת רשות המסים),
which itself is derived from the most recent annual return (דוח שנתי).

Worked example (construction-sector self-employed):

| Input | Value |
|---|---|
| prior-year tax (סך המס) | ₪73,000 |
| prior-year revenue (מחזור) | ₪1,000,000 |
| **derived rate** | **0.073 (7.3%)** |

### 2.2 Adjusted rate (Form 30B)

```
rate = actualTaxEstimate / actualRevenue          (current-year YTD)
```

Same formula, different inputs — pulled from the taxpayer's own
current-year books instead of the stale prior-year return. The form
**requires a reason** (`adjustment.reason`) so the Tax Authority can
review the request.

### 2.3 Applying the rate

```
base     = currentTurnover − deductions
advance  = round(base × rate, 2) − credits
```

- **Deductions** reduce the base **before** multiplying by the rate.
- **Credits** are subtracted **after** the multiplication (matches the
  booklet worksheet).
- Rounding is to the agora (2 decimals) via an EPSILON-bumped
  `Math.round` to avoid classic IEEE-754 drift.

Rate is **floored at 0** and **capped at 1** — no negative advances, no
rates above 100%. Negative turnover or negative rates yield `advance = 0`
(refunds are handled through the annual reconciliation, not here).

---

## 3. Quarter Dates — תאריכי הרבעונים

Israeli calendar quarters (UTC-normalized to avoid timezone drift):

| Quarter | Start | End | **Due Date** (15th of following month) |
|:-:|:-:|:-:|:-:|
| Q1 | 01-Jan | 31-Mar | **15-Apr** |
| Q2 | 01-Apr | 30-Jun | **15-Jul** |
| Q3 | 01-Jul | 30-Sep | **15-Oct** |
| Q4 | 01-Oct | 31-Dec | **15-Jan** (of the **following year**) |

Q4 correctly rolls into the next calendar year — a dedicated test
(`Q4 edge: year rollover correct for 2025 → 2026`) pins this behavior.

---

## 4. 30A vs 30B — Key Differences

| Aspect | **Form 30A** | **Form 30B** |
|---|---|---|
| Rate source | Tax Authority notice (prior year) | Taxpayer-proposed (current-year actuals) |
| Formula | `priorYearTax / priorYearRevenue` | `actualTaxEstimate / actualRevenue` |
| Required inputs | `priorYearTax`, `priorYearRevenue` | `actualRevenue`, `actualTaxEstimate` |
| Reason field | — (not required) | Required (`adjustment.reason`) captured on form |
| Form payload flag | `formType: '30a'` | `formType: '30b'`, plus `adjustment.basis = 'current_year_actuals'` |
| Typical use | Default quarterly filing | Mid-year adjustment when business conditions changed |

Both generators share:
- Same `computeAdvanceRate(tax, revenue)` helper — proven by the
  cross-check test `30a vs 30b use SAME computeAdvanceRate formula`.
- Same `applyAdvanceToTurnover(rate, turnover)` helper.
- Same `dueDateFor(q, y)` / `quarterWindow(q, y)` helpers.
- Same taxpayer validation (`normalizeTaxpayer`).
- Same return shape: `{ rate, base, advance, due, form }`.

---

## 5. Public API

```js
const {
  generate30a,
  generate30b,
  computeAdvanceRate,
  applyAdvanceToTurnover,
  dueDateFor,
  quarterWindow,
  FORM_LABELS,
} = require('./src/tax/form-30a.js');
```

### `generate30a({ taxpayer, priorYearTax, priorYearRevenue, quarter, year, currentTurnover, adjustments })`
Returns `{ rate, base, advance, due, form }` — pure function.

### `generate30b({ taxpayer, quarter, year, actualRevenue, actualTaxEstimate, currentTurnover, adjustments, reason })`
Returns `{ rate, base, advance, due, form }` — pure function.

### `computeAdvanceRate(priorYearTax, priorYearRevenue)` → decimal rate
### `applyAdvanceToTurnover(rate, currentTurnover)` → rounded advance
### `dueDateFor(quarter, year)` → `YYYY-MM-DD`
### `quarterWindow(quarter, year)` → `{ start, end }` ISO dates
### `FORM_LABELS` — frozen bilingual label dictionary

---

## 6. Form Payload Shape

Both generators emit a structured `form` object with these sections:

```
form.formType          // '30a' | '30b'
form.formLabel.he / en // bilingual title
form.formVersion       // tax year as string
form.preparedAt        // ISO timestamp
form.taxpayer          // { tax_file_number, id_number, legal_name, … }
form.period            // { quarter, year, start, end, dueDate }
form.rateSource        // { formula, notes_he, notes_en, … rate inputs }
form.calculation       // { currentTurnover, deductions, credits, base,
                       //   grossAdvance, advance }
form.submission        // { dueDate, channel: 'online', status: 'draft' }
form.adjustment        // (30b only) { basis, reason }
```

Fully serializable — callers can persist it in `annual_tax_reports.payload`
or render it to PDF/XML without any further transformation.

---

## 7. Test Coverage

File: `test/tax/form-30a.test.js` — **53 tests, all passing**.

| Suite | Tests | Focus |
|---|:-:|---|
| `computeAdvanceRate` | 7 | rate math, edge cases, capping, realistic values |
| `applyAdvanceToTurnover` | 4 | multiplication, rounding, non-positive guards |
| `dueDateFor` | 7 | Q1-Q4 due dates, Q4 year rollover, invalid inputs |
| `quarterWindow` | 4 | Q1-Q4 start/end dates |
| `generate30a` | 19 | return shape, rate, base, advance, due date, deductions/credits, adjustments forms, bilingual labels, rate source, period, taxpayer validation, purity, zero cases |
| `generate30b` | 10 | return shape, proposed rate, advance, due date, reason capture, bilingual labels, rate source formula, 30a↔30b parity, validation, purity |
| `FORM_LABELS` | 2 | HE+EN completeness, frozen constant |

Run:
```bash
cd onyx-procurement
node --test test/tax/form-30a.test.js
```

Result: `tests 53 / pass 53 / fail 0`.

---

## 8. Purity & Non-Destructiveness (לא מוחקים רק משדרגים ומגדלים)

Both `generate30a` and `generate30b`:

1. **Never mutate inputs** — pinned by dedicated `JSON.stringify` snapshot tests.
2. **Never touch persistence** — they return a new `form` object; storage is the caller's concern.
3. **Never delete existing data** — there is no `delete` / `remove` path in this module.
4. **Zero external dependencies** — only Node.js built-ins (`Date`).

Upgrades (future waves) can add fields to the `form` payload **without**
breaking this interface: existing tests pin the shape-keys they care
about, not the full object.

---

## 9. Israeli Tax Constants Cross-Reference

- Quarter boundaries & due dates: `תקנות מס הכנסה (מקדמות), התשל"א-1971`, section 4 — 15-day rule.
- Rate formula: same regulations, section 2 — based on המס לפי הדוח השנתי האחרון.
- Reporting channel: `רשות המסים / שע"מ` online portal (`submission.channel = 'online'`).

All constants referenced here match **`ISRAELI_TAX_CONSTANTS_2026.md`** at
the repository root. Any future statutory change should be mirrored there
and the tests updated — **but this file and module are not to be deleted**.

---

## 10. Files

| Path | Role |
|---|---|
| `onyx-procurement/src/tax/form-30a.js` | Business logic — generators, helpers, labels. |
| `onyx-procurement/test/tax/form-30a.test.js` | Node `--test` suite, 53 tests. |
| `_qa-reports/AG-Y005-form-30a.md` | **This report — never delete.** |

---

**Status:** GREEN — all tests pass, no open issues.
**Signed-off:** Agent Y-005 — 2026-04-11.
