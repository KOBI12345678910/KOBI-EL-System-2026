# AG-Y087 — AR / AP Aging Engine (דו"ח יישון חייבים וזכאים)

**Agent:** Y-087
**Swarm:** Finance / Techno-Kol Uzi Mega-ERP
**Wave:** 2026
**Module:** `onyx-procurement/src/finance/aging.js`
**Tests:** `onyx-procurement/test/finance/aging.test.js`
**Status:** IMPLEMENTED — 50 / 50 passing
**Rule of the house:** **לא מוחקים רק משדרגים ומגדלים** — this file is
permanent. Never to be deleted, only upgraded and grown.
**Date authored:** 2026-04-11
**Dependencies:** Zero (pure Node built-ins)

---

## 1. Purpose

A bilingual (Hebrew + English) accounts-receivable (חייבים) and
accounts-payable (זכאים) aging engine for the Techno-Kol Uzi Mega-ERP.
Supports as-of-any-date historical aging, customer and supplier
drilldowns, DSO/DPO, disputes, write-offs, concentration, trend
analysis, bucket movement, bilingual dunning reminders, bilingual PDF
reports (SVG chart + prose), and Hebrew-first statements of account.

Intended to be called from:
- the dunning workflow (AG-X48) — aging totals drive dunning stages
- the bank-reconciliation module (AG-X37) — payment matches feed
  `recordPayment`
- the cash-flow forecaster — uses AR aging to predict collections
- the BI dashboard — exposure, concentration, trend widgets
- the management PDF pipeline — consumes `generateARReport.svg`
- the customer portal — consumes `customerStatement()`
- the collections module — consumes `reminderGeneration()`

---

## 2. Public API

```js
const {
  Aging,
  DEFAULT_BUCKETS,
  REMINDER_TONES,
  STATUS,
  HEBREW_GLOSSARY,
  daysBetween,
  addDays,
  isoDate,
  parseDate,
  bucketFor,
  fmtILS,
  svgBarChart,
} = require('./src/finance/aging.js');
```

### class `Aging`

| Method | Purpose |
|---|---|
| `addCustomer(c)` / `addSupplier(s)` | Register master data (upsert, never delete). |
| `addARInvoice(inv)` / `addAPInvoice(inv)` | Append an invoice (upsert). |
| `recordPayment(p)` | Append a payment (AR receipt or AP disbursement). |
| `flagDispute(d)` | Append a dispute record. |
| `resolveDispute(id, r)` | Stamp the dispute with `resolvedAt` — record stays. |
| `writeOff(w)` | Append to the bad-debt ledger. |
| `captureSnapshot({asOfDate, note})` | Record a bucket snapshot for later trend/movement analysis. |
| `arAging({asOfDate, buckets})` | Full AR aging report. |
| `apAging(asOfDate)` | Full AP aging report. |
| `agingByCustomer(customerId, period)` | One customer drilldown. |
| `agingBySupplier(supplierId, period)` | One supplier drilldown. |
| `aveDaysToPay({customerId, period})` | Average days-to-collect for customer X. |
| `aveDaysToBeingPaid({supplierId, period})` | Average days-to-pay (our DPO) for supplier Y. |
| `disputedItems(period)` | AR + AP items currently or historically in dispute. |
| `writeOffs(period)` | Bad-debt ledger, filtered by period. |
| `concentrationAnalysis()` | Top-10 customers and top-10 suppliers by exposure. |
| `trendAnalysis(periods)` | Compare bucket totals over N period snapshots; classify improving / deteriorating / stable. |
| `bucketMovement({period})` | Track items rolling from one bucket into another over a period. |
| `reminderGeneration({customerId, bucket, language})` | Generate polite / firm / legal reminder letter (Hebrew + English). |
| `generateARReport(period)` | Bilingual AR report with SVG bar chart + prose. |
| `generateAPReport(period)` | Bilingual AP report. |
| `customerStatement(customerId, period)` | Hebrew-first statement of account with running balance. |
| `Aging.toneForBucket(bucket)` (static) | Classify bucket label → reminder tone. |

All returned records are plain objects; callers may inspect or copy
freely. Internal state is append-only — no method ever deletes.

---

## 3. Bucket definitions

| Label | Hebrew | Min days | Max days | Reminder tone |
|---|---|---|---|---|
| `0-30`    | 0-30 ימים      |   0 |  30 | polite (מנומסת) |
| `31-60`   | 31-60 ימים     |  31 |  60 | polite (מנומסת) |
| `61-90`   | 61-90 ימים     |  61 |  90 | firm (תקיפה)   |
| `91-120`  | 91-120 ימים    |  91 | 120 | firm (תקיפה)   |
| `120+`    | מעל 120 ימים   | 121 | ∞   | legal (משפטית) |

Rules:
- Boundaries are **inclusive** on both sides (a 30-day overdue sits in
  `0-30`; a 31-day overdue sits in `31-60`).
- Invoices that are **not yet due** (negative daysOverdue) fall into
  `0-30` — the bucket's semantic is "ages up to 30 from due", not
  "ages 0-30 past due".
- Buckets are overrideable per-call or via `constructor.opts.buckets`.
  A completely custom 3-bucket set is accepted for use cases like
  credit-risk-only reporting.
- Tests pin every boundary: `-5, 0, 30, 31, 60, 61, 90, 91, 120, 121, 9999`.

---

## 4. Reminder tones (נימות תזכורת)

| Tone | Hebrew | When used | Body character |
|---|---|---|---|
| `polite` | מנומסת | 0-30 / 31-60 | "שלום רב" opening, thank-you close. EN: "friendly reminder", "at your earliest convenience". |
| `firm`   | תקיפה  | 61-90 / 91-120 | "דרישה לתשלום", 7-day deadline, "במידה והתשלום בוצע, אנא התעלמו ממכתב זה". EN: "past due", "please remit full payment within 7 days". |
| `legal`  | משפטית | 120+ | "הודעה לפני נקיטת הליכים משפטיים", reference to **חוק ההוצאה לפועל תשכ"ז-1967**, 14-day deadline. EN: "final notice before legal action, referral to the Israeli Execution Office". |

Reminder letters always include:
1. A subject line (Hebrew + English or either alone via `language` param).
2. A salutation with the customer name (bilingual where available).
3. The total outstanding balance formatted `₪N,NNN.NN`.
4. A deadline appropriate to the tone.
5. A per-invoice table: id, due date, days overdue, amount.
6. A signature — `מחלקת גבייה` / `Accounts Receivable Department`.

The `language` parameter accepts:
- `'he'` — Hebrew only, `body` == `body_he`
- `'en'` — English only, `body` == `body_en`
- `'bi'` (default) — both, joined with `\n\n────────────────────────\n\n`

---

## 5. Statement-of-account format (דו"ח חשבון לקוח)

Hebrew-first, tabular, suitable for paper printing or email attachment.

```
דו"ח חשבון לקוח / Statement of Account
לקוח: Acme Ltd (C1)
תקופה: 2026-01-01 עד 2026-04-30

יתרת פתיחה / Opening balance: ₪0.00

תאריך      | סוג        | אסמכתה   | חובה        | זכות        | יתרה
------------|-----------|----------|-------------|-------------|-------------
2026-03-25 | חשבונית    | AR-07    | ₪2,000.00   |              | ₪2,000.00
2026-04-04 | תשלום      | AR-07    |              | ₪2,000.00   | ₪0.00
2026-04-05 | חשבונית    | AR-00    | ₪1,000.00   |              | ₪1,000.00
2026-02-20 | חשבונית    | AR-40    | ₪3,000.00   |              | ₪4,000.00
...

יתרת סגירה / Closing balance: ₪4,000.00
```

Columns:
- **תאריך / Date** — ISO YYYY-MM-DD
- **סוג / Type** — `חשבונית` (invoice) / `תשלום` (payment) / `מחיקת חוב` (write-off)
- **אסמכתה / Reference** — invoice id or payment reference
- **חובה / Debit** — invoices
- **זכות / Credit** — payments and write-offs
- **יתרה / Balance** — running balance

Rules:
- Rows are sorted chronologically ascending.
- Opening balance = sum of invoices before `period.from` minus sum of
  payments before `period.from`.
- Closing balance = opening + Σ debits − Σ credits for the period.
- Write-offs appear as credits so closing balance drops accordingly, but
  the original invoice record remains in memory and in any future audit.

---

## 6. Append-only invariants (לא מוחקים)

| Entity | "Delete" operation | What actually happens |
|---|---|---|
| Invoice paid in full | `recordPayment` | `status` moves to `PAID`, invoice stays in `arInvoices` / `apInvoices`. |
| Invoice partially paid | `recordPayment` | `status` moves to `PARTIAL`, outstanding drops. |
| Invoice written off | `writeOff` | `status` moves to `WRITTEN_OFF`, a row is appended to `writeOffsLog`. Invoice stays. |
| Dispute flagged | `flagDispute` | Invoice `status` moves to `DISPUTED`; dispute row appended to `disputes`. |
| Dispute resolved | `resolveDispute` | Dispute row is stamped with `resolvedAt` and `resolution`. **Record stays.** |
| Customer/supplier "removed" | `addCustomer`/`addSupplier` | There is no delete. Upsert only. |

Test `write-off followed by dispute-resolve keeps both records` (line 473)
pins this invariant explicitly.

---

## 7. As-of-date semantics

All aging reports accept an `asOfDate` (defaulting to
`opts.asOfDefault` or **today**) and honor it properly:

1. `_existedAt(inv, asOf)` — an invoice only appears in a snapshot if
   its `issueDate <= asOf`. This is what allows `trendAnalysis` and
   `bucketMovement` to reconstruct a historical view.
2. `_outstanding(inv, asOf)` — payments applied *after* `asOf` are
   ignored; write-offs dated *after* `asOf` are ignored. This means a
   historical snapshot will show the debt as it existed at that date,
   not as it looks today.
3. Days-overdue is computed from `dueDate` to `asOf`, never to `now`.

Example:
- Invoice AR-X issued 2025-10-01, due 2025-11-01, amount 10,000.
- Payment recorded 2026-02-01, 10,000.
- `arAging({asOfDate: '2026-01-01'})` → AR-X is in 120+ (61 days overdue,
  actually in 61-90 since 2026-01-01 - 2025-11-01 = 61 days).
- `arAging({asOfDate: '2026-04-11'})` → AR-X is **gone** (paid).

---

## 8. Trend classification

`trendAnalysis([{asOfDate, label}, ...])` compares consecutive snapshots
and classifies each delta:

| Change in `oldBucketsPct` (≥61 days) | Classification | Hebrew |
|---|---|---|
| Dropped by > 0.5 pp | `improving` | משתפרת |
| Rose by > 0.5 pp | `deteriorating` | מידרדרת |
| ±0.5 pp or less | `stable` | יציבה |

`oldBucketsPct` is the fraction of total outstanding that is in the
61-90, 91-120, and 120+ buckets. A shrinking fraction means older debt
is being collected faster than new debt is becoming old — i.e. health
is improving.

The 0.5 pp deadband prevents rounding noise from flipping the verdict.

---

## 9. Bucket movement (`bucketMovement`)

Takes a period `{from, to}` and returns five disjoint lists:

- `moved` — items whose bucket changed between start and end.
- `worsened` — subset of `moved` where `toIdx > fromIdx` (aged further out).
- `improved` — subset of `moved` where `toIdx < fromIdx` (jumped back).
- `newcomers` — items present in the end snapshot but not the start.
- `cleared` — items present in the start snapshot but not the end
  (paid, written off, or resolved-and-paid).

Use cases:
- Weekly collections standup: "what rolled from 0-30 to 31-60 this week".
- Bad-debt review: items that moved from 91-120 to 120+.
- Customer success: items that improved (partial payment cleared a bucket).

---

## 10. Concentration & exposure

`concentrationAnalysis()` returns, at current as-of:

```js
{
  topCustomers: [ { customerId, name, total, pctOfAR }, ... up to 10 ],
  topSuppliers: [ { supplierId, name, total, pctOfAP }, ... up to 10 ],
  totalAR,
  totalAP,
  topCustomerShare, // % of AR concentrated in top-10 customers
  topSupplierShare, // % of AP concentrated in top-10 suppliers
}
```

Lending covenants in Israel routinely require the top-customer share
to remain below e.g. 15% or 25%. Feeding `topCustomerShare` into the
BI dashboard surfaces this risk early.

---

## 11. Bilingual PDF report (SVG + text)

Because the module is zero-deps, it does **not** emit binary PDF here.
It produces a structured object that a downstream PDF writer
(e.g. `invoice-pdf-generator.js` or `management-dashboard-pdf.js`) can
consume without further processing:

```js
{
  asOf: '2026-04-11',
  totals: { count, total, buckets: { '0-30': {...}, ... } },
  buckets: [...],
  byCustomer: [...],       // or bySupplier for AP
  svg: '<svg ...>...</svg>',
  text_he: '...',          // Hebrew-only report prose
  text_en: '...',          // English-only report prose
  text: '<HE>\n\n──...──\n\n<EN>', // bilingual combined
}
```

The SVG chart is a pure-string bar chart (no DOM dependencies) with:
- Title (e.g. `AR Aging / יישון חייבים`)
- X-axis bucket labels (`0-30`, `31-60`, …, `120+`)
- Y-axis implicit; bar heights scaled to max
- Numeric labels above each bar
- Black axes, blue bars (`#4a90e2`)
- `viewBox` for scalable embedding
- Every piece of text is XML-escaped

---

## 12. Hebrew glossary

Exposed as `HEBREW_GLOSSARY` for UI localization. Every term that
appears in reports, letters, or statements has a glossary entry:

| Key | Hebrew |
|---|---|
| `ar` | חייבים |
| `ap` | זכאים |
| `customer` / `customers` | לקוח / לקוחות |
| `supplier` / `suppliers` | ספק / ספקים |
| `receivable` / `payable` | חוב ללקוח / חוב לספק |
| `invoice` | חשבונית |
| `amount` | סכום |
| `dueDate` | תאריך פירעון |
| `issueDate` | תאריך הפקה |
| `daysOverdue` | ימי פיגור |
| `bucket` | שכבה |
| `aging` | יישון |
| `agingReport` | דו"ח יישון |
| `arAgingReport` | דו"ח יישון חייבים |
| `apAgingReport` | דו"ח יישון זכאים |
| `currentPeriod` | תקופה נוכחית |
| `previousPeriod` | תקופה קודמת |
| `total` | סה"כ |
| `outstanding` | פתוח |
| `paid` | שולם |
| `disputed` | במחלוקת |
| `writeOff` / `writeOffs` | מחיקה / מחיקות |
| `badDebt` | חוב אבוד |
| `concentration` | ריכוזיות |
| `exposure` | חשיפה |
| `trend` | מגמה |
| `improving` / `deteriorating` / `stable` | משתפרת / מידרדרת / יציבה |
| `polite` / `firm` / `legal` | מנומסת / תקיפה / משפטית |
| `reminder` | תזכורת |
| `statement` | דו"ח חשבון |
| `statementOfAccount` | דו"ח חשבון לקוח |
| `asOf` | נכון ליום |
| `openingBalance` | יתרת פתיחה |
| `closingBalance` | יתרת סגירה |
| `debit` | חובה |
| `credit` | זכות |
| `balance` | יתרה |
| `dso` | ימי גבייה ממוצעים (DSO) |
| `dpo` | ימי תשלום ממוצעים (DPO) |

---

## 13. Israeli legal / format anchors

- **חוק ההוצאה לפועל תשכ"ז-1967** — cited in legal reminder letters.
- **חוק ההתיישנות תשי"ח-1958** — 7-year statute of limitations is
  the backstop for any debt that ages into `120+` indefinitely. The
  dunning pipeline (AG-X48) consults this before referral; the aging
  module just reports the raw age.
- **Hebrew RTL** — the statement-of-account rendering orders columns
  for visual LTR readability while using RTL Hebrew labels. Downstream
  PDF writers must set `direction=rtl` on the body text.
- **ILS formatting** — `₪` prefix, comma thousands separators, two
  decimal places. Currency is hard-coded to ILS for reports; individual
  invoices carry an optional `currency` field for multi-currency
  environments (FX handling is in AG-X36).

---

## 14. Test matrix (50 tests)

| # | Group | Test |
|---|---|---|
| 1-12 | `bucketFor` | Every boundary: -5, 0, 30, 31, 60, 61, 90, 91, 120, 121, 9999; custom buckets. |
| 13-15 | Date primitives | `daysBetween` fwd/back, `addDays` non-mutating. |
| 16-20 | `arAging` | totals, bucket assignment, paid excluded, written-off excluded, byCustomer aggregation. |
| 21 | `apAging` | totals + bySupplier aggregation. |
| 22-23 | Drilldowns | `agingByCustomer`, `agingBySupplier`. |
| 24-25 | DSO/DPO | `aveDaysToPay`, `aveDaysToBeingPaid`. |
| 26 | Disputes | flagged and resolved both persist. |
| 27-28 | Write-offs | append-only; period filter. |
| 29-30 | Concentration | sort order + pctOfAR computation. |
| 31-33 | Trend | improving, deteriorating, stable. |
| 34-36 | Bucket movement | moved/worsened, cleared, newcomers. |
| 37-41 | Reminders | polite, firm, legal, HE-only, invoice-detail. |
| 42-44 | Reports | AR report, AP report, all five buckets embedded. |
| 45-47 | Statement | opening/closing, prior-period opening, chronological ordering. |
| 48 | Formatter | `fmtILS` edge cases. |
| 49 | Glossary | essential keys present. |
| 50 | Invariant | write-off + dispute-resolve keeps both records. |

Run: `node --test test/finance/aging.test.js` — 50 pass, 0 fail.

---

## 15. Zero-deps audit

```
$ grep -E "^(const|var|let|import) .+ = require" onyx-procurement/src/finance/aging.js
(no matches — pure module, no imports)
```

The only side-effect is internal state on the `Aging` instance.
Strict-mode throughout. Every function is either a method of `Aging`
or a pure utility.

---

## 16. Integration hooks (pending — future wave)

Not yet wired but designed for:

- `onyx-procurement/server.js` routes:
  - `GET /api/finance/aging/ar?asOf=YYYY-MM-DD`
  - `GET /api/finance/aging/ap?asOf=YYYY-MM-DD`
  - `GET /api/finance/aging/customer/:id/statement`
  - `POST /api/finance/aging/reminders/:customerId`
  - `GET /api/finance/aging/reports/ar.pdf` — via management-pdf pipeline
- Dashboard card `aging-summary` — reads `concentrationAnalysis()`
  and the top-bucket totals.
- Nightly job `finance:aging-snapshot` — calls `captureSnapshot()` so
  that `trendAnalysis()` and `bucketMovement()` can replay without
  re-scanning history.

---

## 17. House rule

**לא מוחקים רק משדרגים ומגדלים.** This report, the module, the tests,
and every invoice/payment/dispute/write-off record are **append-only**.
Future waves will extend the class with:

- Multi-currency FX normalization via AG-X36
- Credit-limit enforcement (pre-invoice)
- Customer credit score feeding into `reminderGeneration` tone selection
- SMS and WhatsApp channels in addition to email
- Promise-to-pay ledger (owned by AG-X48 dunning module; this module
  just consumes the promises in its live outstanding calculation)
- Branching bucket schemes per customer segment

**Never delete.** Growth only.
