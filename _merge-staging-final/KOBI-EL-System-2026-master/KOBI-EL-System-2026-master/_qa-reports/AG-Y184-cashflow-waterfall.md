# AG-Y184 — Cash Flow Waterfall Visualizer (תזרים מזומנים מדורג)

**Module**: `onyx-procurement/src/reporting/cashflow-waterfall.js`
**Tests**: `onyx-procurement/test/reporting/cashflow-waterfall.test.js`
**Status**: Implemented — **26 / 26 tests passing** (`node --test`)
**Rule**: לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade/grow)
**Dependencies**: Zero external — Node built-ins only
**Bilingual**: Hebrew + English throughout (labels, titles, legend, errors, SVG)
**Palette**: Palantir dark — `#0b0d10` background, `#13171c` surface, `#4a9eff` accent
**Agent**: Y-184
**Date**: 2026-04-11

---

## 1. Purpose / מטרה

**EN**: A deterministic cash-flow waterfall visualizer. Given a period with
opening balance and cash-flow components, the module produces an ordered list
of waterfall "steps" and renders them as a self-contained SVG chart for
dashboards, management reports, and board decks. Supports both the **direct
method** (line-item receipts/disbursements) and the **indirect method** (net
income → non-cash adjustments → working-capital changes → Israeli tax items).

**HE**: רכיב לייצור גרף תזרים מזומנים מדורג (waterfall) באופן דטרמיניסטי. בהינתן
תקופה (יתרת פתיחה + רכיבי תזרים), הרכיב מייצר רשימת שלבים מסודרת ומרנדר אותה
לקובץ SVG עצמאי לשימוש בלוחות מחוונים, דוחות ניהוליים ומצגות דירקטוריון. תומך
ב**שיטה הישירה** (שורות תקבולים/תשלומים) וב**שיטה העקיפה** (רווח נטו → התאמות
לא-מזומניות → שינויי הון חוזר → פריטי מס ישראליים).

The module is deliberately **deterministic**: no `Date.now`, no `Math.random`,
no non-sorted map iteration. Identical inputs produce identical output — this
is enforced by test #22.

---

## 2. Public API / ממשק ציבורי

Exported from `src/reporting/cashflow-waterfall.js`:

| Export               | Kind     | Purpose                                                  |
| -------------------- | -------- | -------------------------------------------------------- |
| `CashFlowWaterfall`  | class    | Main waterfall builder + SVG renderer                    |
| `PALETTE`            | const    | Palantir dark palette (frozen)                           |
| `STEP_KIND`          | enum     | Step-kind tags (`opening / operating / ... / closing`)   |
| `LABELS`             | const    | Built-in bilingual label dictionary (frozen)             |
| `_internals`         | object   | Helpers exposed for unit tests (`formatNIS`, `money`, …) |

### 2.1 Constructor / בנאי

```js
const { CashFlowWaterfall } = require('./reporting/cashflow-waterfall');

const wf = new CashFlowWaterfall({
  method: 'indirect',          // 'direct' | 'indirect'  (default: 'indirect')
  labelOrder: 'he-en',         // 'he-en' | 'en-he'      (default: 'he-en')
  width: 960,                  // SVG viewport width
  height: 540,                 // SVG viewport height
  palette: { accent: '#...' }, // optional palette override
  labels: { /* ... */ },       // optional label override
});
```

### 2.2 `build(period)` / `build(תקופה)`

Computes the ordered list of waterfall steps. Each step is shaped as:

```js
{
  kind: 'opening' | 'operating' | 'adjustment' | 'working_capital'
      | 'israeli_tax' | 'investing' | 'financing' | 'subtotal' | 'closing',
  key: 'unique-key',
  label_en: 'English label',
  label_he: 'תווית עברית',
  amount: number,              // money(x) — 2-decimal
  running_before: number,      // running cash balance before this step
  running_after: number,       // running cash balance after this step
  section: 'opening' | 'operating' | 'investing' | 'financing' | 'closing',
  delta_direction: 'up' | 'down' | 'flat',
}
```

Subtotals are inserted **inline** at the end of each section so the chart can
draw connector lines. The final "closing" step is always present.

### 2.3 `generateSVG(report)` / `generateSVG(דוח)`

Produces a self-contained SVG document string. No external CSS, no external
fonts, no external images — safe to drop into an HTML page or base64-encode as
a `data:image/svg+xml;...` URI.

### 2.4 `buildAndRender(period)` — one-shot

Equivalent to `generateSVG(build(period))`.

### 2.5 `history()` — append-only

Returns a shallow copy of the append-only build history. **No delete / clear /
reset methods exist** (enforced by test #17).

---

## 3. Period Shape / מבנה תקופה

```js
{
  label: 'Q2 2026 / רבעון 2 2026',
  opening_balance: 1000000,
  method: 'indirect',

  // Indirect-method inputs
  net_income: 250000,                   // רווח נטו
  adjustments: {
    depreciation: 80000,                // פחת
    amortization: 20000,                // הפחתות
    stock_compensation: 10000,          // תגמול מבוסס מניות
    other_noncash: 0,
  },
  working_capital: {
    ar_change: -60000,                  // Δ לקוחות
    inventory_change: -40000,           // Δ מלאי
    ap_change: 30000,                   // Δ ספקים
    prepaid_change: -5000,
    accrued_change: 8000,
  },
  israeli_tax: {
    income_tax_payable: -45000,         // מס הכנסה — שלילי = תשלום
    bituach_leumi: -12000,              // ביטוח לאומי
    vat_payable: -18000,                // מע"מ — נטו ששולם
  },

  // Direct-method operating inputs (used when method === 'direct')
  operating: [
    { label_en: 'Customer Receipts', label_he: 'תקבולי לקוחות', amount: 900000 },
    // …
  ],

  // Investing + financing — applied to both methods
  investing: [
    { label_en: 'CapEx Equipment', label_he: 'השקעות בציוד', amount: -150000 },
  ],
  financing: [
    { label_en: 'New Loan', label_he: 'הלוואה חדשה', amount: 200000 },
  ],
}
```

All fields are optional — missing values degrade gracefully to `0` and the
corresponding step is skipped (zero-amount steps are not drawn to avoid visual
noise).

---

## 4. Design Decisions / החלטות עיצוב

### 4.1 Palantir Dark Palette

| Role           | Hex         | Usage                                    |
| -------------- | ----------- | ---------------------------------------- |
| background     | `#0b0d10`   | SVG outer background (gradient top)      |
| surface        | `#13171c`   | Plot area + gradient bottom              |
| surfaceRaised  | `#1a2028`   | Raised surface accents                   |
| grid           | `#232a33`   | Dashed horizontal gridlines              |
| axis           | `#3a4553`   | Plot border + bar strokes                |
| text           | `#e6edf3`   | Primary text                             |
| textMuted      | `#8b95a3`   | Secondary labels, footer                 |
| **accent**     | `#4a9eff`   | Opening / closing bar fill + connectors  |
| accentDim      | `#2d6bc4`   | Accent gradient bottom                   |
| **positive**   | `#4ade80`   | Positive delta bar gradient top          |
| positiveDim    | `#2c9d5c`   | Positive gradient bottom                 |
| **negative**   | `#f87171`   | Negative delta bar gradient top          |
| negativeDim    | `#c14545`   | Negative gradient bottom                 |
| balance        | `#4a9eff`   | Alias of accent — opening/closing bars   |
| warning        | `#fbbf24`   | Zero baseline (when chart crosses 0)     |

### 4.2 Rendering Contract

- **No external references** — zero `<link>`, zero `<script>`, zero remote fonts
- **Gradient defs** — three `<linearGradient>` definitions (`bar-pos`, `bar-neg`, `bar-bal`) plus a background gradient (`bg-grad`)
- **XML escaping** — all user-supplied text is run through `xmlEscape` (test #20)
- **Bilingual axis labels** — Hebrew row on top (RTL), English row below (LTR), both rotated -40° to avoid overlap
- **Zero baseline** — drawn in `#fbbf24` dashed only when the plot crosses zero
- **Legend** — 3 swatches (Positive / Negative / Balance) with bilingual captions

### 4.3 Determinism

- No `Date.now()` or `Math.random()` in the build path
- Adjustment / working-capital / tax keys are iterated in a **fixed order** (not `Object.keys`)
- Numeric rounding: `money(x) = Math.round(x * 100) / 100` — 2-decimal stable
- Test #22 confirms byte-for-byte reproducibility

### 4.4 Never Delete / לא מוחקים

- `history()` is an append-only log
- No `delete`, `clear`, `reset`, `truncate` methods exist on the class
- Enforced by test #17 via `typeof wf.delete === 'undefined'`

---

## 5. Step Ordering / סדר השלבים

For the **indirect method**, the canonical step order is:

```
1.  Opening Balance               יתרת פתיחה          (accent blue)
2.  Net Income                    רווח נטו
3.  + Depreciation                + פחת
4.  + Amortization                + הפחתות
5.  + Stock Compensation          + תגמול מבוסס מניות
6.  + Other Non-Cash              + אחר לא-מזומן
7.  Δ Accounts Receivable         שינוי לקוחות
8.  Δ Inventory                   שינוי מלאי
9.  Δ Accounts Payable            שינוי ספקים
10. Δ Prepaid Expenses            שינוי הוצ׳ מראש
11. Δ Accrued Expenses            שינוי הוצ׳ לשלם
12. Income Tax Payable            מס הכנסה לשלם
13. Bituach Leumi                 ביטוח לאומי
14. VAT Payable                   מע״מ לשלם
15. → Operating Subtotal          תזרים מפעילות       (subtotal)
16. Investing items …             פריטי השקעות
17. → Investing Subtotal          תזרים מהשקעות       (subtotal)
18. Financing items …             פריטי מימון
19. → Financing Subtotal          תזרים מימון         (subtotal)
20. Closing Balance               יתרת סגירה          (accent blue)
```

Zero-amount steps are **skipped** from the chart (they still appear in logs).

---

## 6. Israeli Tax Items / פריטי מס ישראליים

Three statutory Israeli tax categories are first-class step kinds in the
indirect-method waterfall:

| Key                    | Hebrew          | English              | Authority |
| ---------------------- | --------------- | -------------------- | --------- |
| `income_tax_payable`   | מס הכנסה לשלם   | Income Tax Payable   | מס הכנסה  |
| `bituach_leumi`        | ביטוח לאומי     | Bituach Leumi (BL)   | המל"ל     |
| `vat_payable`          | מע״מ לשלם       | VAT Payable          | מע"מ      |

**Sign convention**: negative values represent **outflows** (tax remitted),
positive values represent **inflows** (refund or accrual without payment).
Dashboards should pass `vat_payable` as the net of (input VAT – output VAT)
actually remitted during the period.

Test #6 validates that all three appear as step kind `israeli_tax` with their
bilingual labels attached.

---

## 7. Test Matrix / מטריצת בדיקות

Run:

```bash
cd onyx-procurement
node --test test/reporting/cashflow-waterfall.test.js
```

All **26 tests pass**:

| #  | Test                                                                  | Validates                                        |
| -- | --------------------------------------------------------------------- | ------------------------------------------------ |
| 1  | Default construction uses indirect method + Palantir palette          | constructor defaults, palette constants          |
| 2  | Indirect build produces opening → op → inv → fin → closing order      | step ordering, section layout                    |
| 3  | Closing balance equals opening + net change                           | arithmetic correctness                           |
| 4  | Includes non-cash adjustments (depreciation / amortization)           | `STEP_KIND.ADJUSTMENT` inclusion                 |
| 5  | Expands working-capital changes with signs                            | `STEP_KIND.WORKING_CAPITAL`, direction tags      |
| 6  | Includes Israeli tax items with bilingual labels                      | `income_tax_payable`, `bituach_leumi`, `vat`     |
| 7  | Subtotal steps reflect per-section totals                             | subtotal insertion + math                        |
| 8  | Direct method consumes `operating[]` line items                       | direct-method path                               |
| 9  | `running_before` + `amount` === `running_after` chain consistency     | waterfall integrity                              |
| 10 | `generateSVG` returns valid self-contained SVG string                 | XML decl, no `<script>` / `<link>`               |
| 11 | SVG uses Palantir dark palette (`#0b0d10`, `#13171c`, `#4a9eff`)      | palette constants inlined                        |
| 12 | SVG contains green positive (`#4ade80`) + red negative (`#f87171`)   | conditional fills                                |
| 13 | Bilingual title + Hebrew Israeli-tax labels appear                    | `תזרים מזומנים מדורג`, `מס הכנסה`, `ביטוח לאומי` |
| 14 | Exactly one `<rect class="wf-bar">` per step                          | bar count = step count                           |
| 15 | Legend contains positive / negative / balance swatches                | bilingual legend                                 |
| 16 | `formatNIS` emits ₪ glyph + he-IL grouping                            | NIS formatting                                   |
| 17 | `history()` is append-only — no `delete` / `clear` / `reset`          | never-delete rule                                |
| 18 | `build` throws `TypeError` on non-object period                       | input validation                                 |
| 19 | `generateSVG` throws `TypeError` on invalid report                    | output validation                                |
| 20 | Minimal period (opening only) still produces opening + 3 subs + close | degenerate case                                  |
| 21 | XML escaping for `<`, `>`, `&`, `"`, `'`                              | security / well-formedness                       |
| 22 | `buildAndRender` one-shot returns SVG                                 | convenience API                                  |
| 23 | Determinism — same input yields identical output                      | reproducibility                                  |
| 24 | Direct-method operating items preserve labels                         | label passthrough                                |
| 25 | Custom palette override is applied                                    | palette extensibility                            |
| 26 | Single `<svg>` root + well-formed viewBox                             | SVG root cardinality                             |

### Test run output / פלט הרצת הבדיקות

```
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~123
```

---

## 8. Usage Examples / דוגמאות שימוש

### 8.1 Indirect method / שיטה עקיפה

```js
const { CashFlowWaterfall } = require('./reporting/cashflow-waterfall');

const wf = new CashFlowWaterfall({ method: 'indirect' });
const svg = wf.buildAndRender({
  label: 'Q2 2026',
  opening_balance: 1_000_000,
  net_income: 250_000,
  adjustments: { depreciation: 80_000, amortization: 20_000 },
  working_capital: {
    ar_change: -60_000,
    inventory_change: -40_000,
    ap_change: 30_000,
  },
  israeli_tax: {
    income_tax_payable: -45_000,
    bituach_leumi: -12_000,
    vat_payable: -18_000,
  },
  investing: [
    { label_en: 'CapEx', label_he: 'השקעות הוניות', amount: -150_000 },
  ],
  financing: [
    { label_en: 'New Loan', label_he: 'הלוואה חדשה', amount: 200_000 },
    { label_en: 'Dividends', label_he: 'דיבידנדים', amount: -80_000 },
  ],
});

fs.writeFileSync('q2-2026-waterfall.svg', svg, 'utf8');
```

### 8.2 Direct method / שיטה ישירה

```js
const wf = new CashFlowWaterfall({ method: 'direct' });
const svg = wf.buildAndRender({
  label: 'Q2 2026 — Direct',
  opening_balance: 500_000,
  operating: [
    { label_en: 'Customer Receipts', label_he: 'תקבולי לקוחות', amount: 900_000 },
    { label_en: 'Supplier Payments', label_he: 'תשלומי ספקים', amount: -450_000 },
    { label_en: 'Payroll', label_he: 'שכר', amount: -200_000 },
    { label_en: 'VAT Remittance', label_he: 'תשלום מע"מ', amount: -30_000 },
  ],
  investing: [{ label_en: 'CapEx', label_he: 'השקעות', amount: -100_000 }],
  financing: [{ label_en: 'Credit Line', label_he: 'מסגרת אשראי', amount: 50_000 }],
});
```

### 8.3 Append-only history / היסטוריה משורשרת

```js
const wf = new CashFlowWaterfall();
wf.build(q1);
wf.build(q2);
wf.build(q3);
wf.build(q4);

// All 4 reports retained — no delete path exists.
console.log(wf.history().length); // 4
```

---

## 9. File Inventory / רשימת קבצים

| File                                                                | Purpose                 | Size      |
| ------------------------------------------------------------------- | ----------------------- | --------- |
| `onyx-procurement/src/reporting/cashflow-waterfall.js`              | Module implementation   | ~21 KB    |
| `onyx-procurement/test/reporting/cashflow-waterfall.test.js`        | 26 unit tests           | ~14 KB    |
| `_qa-reports/AG-Y184-cashflow-waterfall.md`                         | This QA report          | ~12 KB    |

---

## 10. Compliance Checklist / רשימת בקרה

- [x] Zero external dependencies (Node built-ins only)
- [x] Never delete — `history()` is append-only, no `delete/clear/reset` API
- [x] Bilingual throughout (labels, titles, legend, errors, axis, footer)
- [x] Palantir dark palette (`#0b0d10`, `#13171c`, `#4a9eff`) used in SVG
- [x] Positive = green (`#4ade80`), negative = red (`#f87171`)
- [x] NIS formatting with ₪ glyph and he-IL grouping
- [x] Indirect method: net income → adjustments → working capital → Israeli tax
- [x] Israeli tax items: income tax payable, Bituach Leumi, VAT payable
- [x] Deterministic build (test #22)
- [x] 15+ unit tests (actually **26 tests**, 100% passing)
- [x] SVG is self-contained (no `<script>`, no `<link>`, no external fonts)
- [x] XML-escaped label content (test #20)

---

## 11. Future Upgrades / שדרוגים עתידיים (never-delete path)

These are **additive** only — none of them mutate or remove existing exports:

1. **Animation layer** — Add an optional `animated: true` mode that emits
   `<animate>` elements so bars ease in from the baseline over 600 ms.
2. **Interactive tooltips** — Emit per-bar `<title>` elements so native SVG
   tooltips show the running balance + amount on hover.
3. **PNG export** — Add `generatePNG(report)` via built-in `zlib` + a tiny
   SVG-to-PNG rasterizer, keeping the zero-dep contract.
4. **Multi-period overlay** — Accept `period[]` and render a stacked
   comparison waterfall.
5. **Drill-down links** — Accept `{ href }` on operating/investing/financing
   line items and wrap the corresponding `<rect>` in `<a>` for dashboard
   drill-down.

None of the above require deleting or altering the current `build()` or
`generateSVG()` contracts — the rule לא מוחקים רק משדרגים ומגדלים is preserved.

---

**End of AG-Y184 report / סוף דוח**
