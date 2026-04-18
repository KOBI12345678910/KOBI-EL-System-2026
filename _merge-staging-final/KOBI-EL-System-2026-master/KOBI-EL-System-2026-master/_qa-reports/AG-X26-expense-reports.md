# Agent X-26 — Employee Expense Reports
**Swarm 3B • Techno-Kol Uzi mega-ERP • 2026-04-11**

## Summary

Agent X-26 delivers a complete, zero-dependency employee expense-report
pipeline for Kobi's mega-ERP. It covers the eight Israeli tax-deductible
categories, implements VAT auto-split, a historic-FX multi-currency
engine, mileage and per-diem calculators, approval workflow, OCR
integration stub, duplicate detection, Israeli-policy validation, and
PDF archive export — all wired together through a thin facade so
payroll-autonomous and onyx-procurement can drop it in without touching
their build systems.

## Files delivered

| Role                 | Path                                                                                           |
|----------------------|------------------------------------------------------------------------------------------------|
| Backend (facade+core) | `onyx-procurement/src/expenses/expense-manager.js`                                             |
| React UI (mobile-first RTL) | `payroll-autonomous/src/components/ExpenseSubmit.jsx`                                   |
| Unit tests            | `test/payroll/expense-manager.test.js`                                                         |
| This QA report        | `_qa-reports/AG-X26-expense-reports.md`                                                        |

## Rules compliance

- **Never delete** — all mutations are append-only. `updateLine`
  pushes the prior state into `line.revisions[]` instead of
  overwriting. Status transitions are one-directional (except
  `rejected → draft` / `submitted`) and enforced by `ALLOWED_TRANSITIONS`.
  There is no `removeLine` / `deleteReport` function on the backend.
- **Hebrew RTL bilingual** — every user-facing label in both the
  backend violation objects (`{he, en}`) and the React UI is paired
  Hebrew+English. `<div dir="rtl" lang="he">` wraps the form. Inline
  styles use a Palantir-dark theme with light fallback, matching the
  existing `AuditTrail.jsx` / `BIDashboard.jsx` aesthetic.
- **Israeli tax-deductible expense categories** — all eight required
  categories are modelled with `tax.vatDeductible`,
  `tax.incomeDeductible`, `tax.partial` flags:

  | id            | HE      | VAT deductible | Notes |
  |---------------|---------|----------------|-------|
  | `meals`       | אש"ל    | no             | employee per-diem rules |
  | `fuel`        | דלק     | yes            | with mileage log |
  | `travel`      | נסיעות  | yes            | taxi / bus / train |
  | `lodging`     | לינה    | yes            | local + abroad caps |
  | `equipment`   | ציוד    | yes            | |
  | `hospitality` | כיבוד   | no             | 80% income-deductible (חוזר 2/2020) |
  | `donation`    | תרומה   | no             | requires 46א certificate |
  | `other`       | אחר     | no             | catch-all |
- **Zero dependencies** — backend requires only `fs`, `path`,
  `crypto` (all node core). `pdfkit` is probed via `try { require }` and
  only used when the caller opts in; otherwise the PDF export writes a
  plain-text `.pdf.txt` stub. The React component has no imports
  outside of `react` itself — no Material UI, no Tailwind, no styled-
  components.

## Public API

### Facade (recommended entry point)
```js
const { createExpenseManager } = require('./onyx-procurement/src/expenses/expense-manager');
const mgr = createExpenseManager();
const rep = mgr.createReport('emp_001', 'Q2 נסיעות', { from: '2026-04-01', to: '2026-04-30' });
mgr.addLine(rep.id, { description: 'דלק בפז', amount: 200, currency: 'ILS', vendor: 'פז' });
mgr.submitReport(rep.id);
mgr.approveReport(rep.id, 'mgr_99', 'OK');
const reimb = mgr.computeReimbursement(rep.id);
```

### Exports (from `expense-manager.js`)
- Lifecycle: `createReport`, `addLine`, `updateLine`, `submitReport`,
  `approveReport`, `rejectReport`, `markReimbursed`, `getReport`,
  `listReports`
- Money / policy: `computeReimbursement`, `validatePolicy`,
  `splitVat`, `convertToIls`, `computeMileage`, `computePerDiem`
- Receipts / OCR: `attachReceipt`, `runOcr`, `findDuplicates`
- Export: `exportPdf` (sync text / async pdfkit)
- Helpers: `autoCategorize`
- Constants: `CATEGORIES`, `CATEGORY_IDS`, `STATUS`,
  `ALLOWED_TRANSITIONS`, `DEFAULT_POLICY`, `VAT_STANDARD`, `DEFAULT_FX`
- Errors: `ExpenseError` (with `.code` for programmatic matching)

## Features — spec vs. delivery

| Spec # | Feature                   | Delivered in                                                             |
|--------|---------------------------|--------------------------------------------------------------------------|
| 1      | Receipt upload            | `attachReceipt(reportId, lineId, filePath)` — file-path only, no blob store |
| 2      | OCR stub                  | `runOcr(...)` auto-resolves `onyx-procurement/src/ocr/invoice-ocr.js` Agent 88 when available; caller may inject bridge |
| 3      | VAT auto-split            | `splitVat(gross, rate)` — 17% default inclusive; stored per line and aggregated per report |
| 4      | Mileage calculator        | `computeMileage(km, engineCc, policy)` — 2.50 ₪/km ≤1600cc, 3.00 ₪/km >1600cc, daily cap 600 km |
| 5      | Per-diem for travel days  | `computePerDiem(days, { abroad })` — 200 ₪/day local, 450 ₪/day abroad, 60-day cap |
| 6      | Multi-currency → ILS      | `convertToIls(amount, ccy, date)` — historic FX lookup (ILS/USD/EUR/GBP seeded 2020–2026) |
| 7      | Duplicate check           | `findDuplicates(store, employeeId, candidate)` — matches employee + category + vendor + ±1 day + ±1% amount |
| 8      | Over-policy flags         | `validatePolicy(report)` — lodging cap, meals daily cap, mileage daily km, 46א missing, receipt missing > 325 ₪, backdate > 180d, future-dated |
| 9      | Auto-categorization       | `autoCategorize(description)` — Hebrew + English keyword map, falls back to `other` |
| 10     | PDF export for archive    | `exportPdf(reportId, outDir)` — text fallback by default; `{usePdfKit:true}` returns Promise with binary PDF |

## Israeli-policy defaults baked in

```
meals.dailyCapIls          = 150
lodging.localNightCapIls   = 600
lodging.abroadNightCapIls  = 1200
mileage.smallEngineRate    = 2.50   // ≤1600cc
mileage.largeEngineRate    = 3.00   // >1600cc
mileage.engineCutoffCc     = 1600
mileage.dailyKmCap         = 600
perDiem.localDailyIls      = 200
perDiem.abroadDailyIls     = 450
perDiem.maxDays            = 60
donation.requires46A       = true
general.requireReceiptAboveIls = 325
general.maxBackdateDays    = 180
```

## UI — `ExpenseSubmit.jsx`

- Mobile-first, single-column layout (`max-width: 760px`).
- Camera receipt capture hook via `<input type="file" accept="image/*" capture="environment">`.
- File upload via secondary `<input>` with `accept="image/*,application/pdf"`.
- Category picker with Hebrew + English labels (auto-categorizes on
  description blur, with a "אותר אוטומטית" tag when the picker is
  populated by the classifier).
- Quick-add sub-sections for per-diem (days + abroad flag) and
  mileage (km + engine cc), each rendering a computed ILS line into
  the report on a single tap.
- Running total displayed in a sticky footer with net / VAT / gross
  breakdown and `שלח לאישור` / `ייצוא PDF` buttons.
- Policy violation panel (warn + error severities) that updates
  reactively whenever lines change.
- Duplicate hint chip on any line that `api.findDuplicates` flagged.
- Accepts an injected `api` prop so the component stays
  dependency-free and trivially mockable for tests / storybook.

## Tests — `test/payroll/expense-manager.test.js`

**Run:** `node --test test/payroll/expense-manager.test.js`

**Result (2026-04-11 14:xx):**
```
ℹ tests 41
ℹ suites 0
ℹ pass 41
ℹ fail 0
ℹ duration_ms 138
```

### Coverage map
| # | Test                                                            | Area                  |
|---|-----------------------------------------------------------------|-----------------------|
| 01 | categories contain all 8 Israeli expense types                 | constants             |
| 02 | VAT standard rate is 17%                                        | constants             |
| 03 | status enum exposes full lifecycle                              | constants             |
| 04 | DEFAULT_POLICY matches Israeli defaults                         | policy                |
| 05 | splitVat — 117 ILS gross = 100 net + 17 VAT                     | VAT math              |
| 06 | splitVat — 0% rate returns all net                              | VAT math              |
| 07 | splitVat — default rate = 17%                                   | VAT math              |
| 08 | convertToIls — ILS identity                                     | FX                    |
| 09 | convertToIls — USD 100 → ~365 ILS                               | FX                    |
| 10 | convertToIls — unknown currency throws `FX_UNKNOWN_CURRENCY`    | FX                    |
| 11 | computeMileage — small engine 100km = 250 ILS                   | mileage               |
| 12 | computeMileage — large engine 100km = 300 ILS                   | mileage               |
| 13 | computeMileage — negative km throws `BAD_KM`                    | mileage               |
| 14 | computePerDiem — 3 local days = 600 ILS                         | per-diem              |
| 15 | computePerDiem — abroad 2 days = 900 ILS                        | per-diem              |
| 16 | autoCategorize — "מסעדה אבו חסן" → meals                         | classifier Hebrew     |
| 17 | autoCategorize — "דלק בפז" → fuel                                | classifier Hebrew     |
| 18 | autoCategorize — "taxi to client" → travel                      | classifier English    |
| 19 | autoCategorize — empty / unknown → other                        | classifier fallback   |
| 20 | createReport validates employeeId / title / period              | lifecycle validation  |
| 21 | addLine with FX + VAT split + audit entry                       | addLine + audit       |
| 22 | addLine refuses negative amount + unknown category              | addLine validation    |
| 23 | submit → approve → reimburse lifecycle + illegal transitions    | state machine         |
| 24 | reject requires reason and stores approval record               | state machine         |
| 25 | cannot submit empty report                                      | state machine         |
| 26 | reimbursement with VAT-invoice claims VAT back                  | reimbursement         |
| 27 | reimbursement without tax invoice does NOT deduct VAT           | reimbursement         |
| 28 | validatePolicy flags lodging over cap                           | policy                |
| 29 | validatePolicy flags meals daily cap (aggregated per date)      | policy                |
| 30 | validatePolicy blocks donation without 46A                      | policy                |
| 31 | clean donation with 46A certificate passes                      | policy                |
| 32 | validatePolicy flags NO_RECEIPT over threshold                  | policy                |
| 33 | findDuplicates catches same-day same-vendor near-amount         | dedup                 |
| 34 | findDuplicates ignores different vendor / category              | dedup                 |
| 35 | addLine in USD stores historic ILS conversion                   | multi-currency        |
| 36 | attachReceipt + runOcr bridge fills extracted fields            | OCR                   |
| 37 | runOcr without receipt throws NO_RECEIPT                        | OCR                   |
| 38 | exportPdf writes archive file (pdfkit or text fallback)         | export                |
| 39 | updateLine appends revision, never deletes history              | append-only rule      |
| 40 | updateLine refused after submission                             | append-only rule      |
| 41 | listReports filters by employee and status                      | query                 |

### Assertion count
41 test cases contain ~80 individual `assert` / `assert.throws`
calls, exceeding the "20+ cases" floor in the Agent X-26 brief.

## Integration notes

- **Agent 88 wiring** — `_tryResolveOcrBridge()` lazy-requires
  `../ocr/invoice-ocr.js` and calls `scanInvoice({path, backend:'mock'})`
  when available. If Agent 88 is not on disk the call is silently
  swapped for a zero-confidence echo so the pipeline still resolves.
- **FX feed** — `DEFAULT_FX` holds hard-coded rates for
  ILS/USD/EUR/GBP. Replace with a Bank of Israel feed adapter at
  runtime by passing `{ fxTable }` to `createExpenseManager`.
- **Persistent store** — the in-memory `createStore()` can be swapped
  for a `{reports:Map, put, get}` adapter backed by SQLite or Postgres
  without touching any of the business logic.
- **Locale** — all Hebrew strings live inside the module (no JSON
  resource files) so the bundle stays 100% self-contained; if the
  wider ERP standardises on i18next the HE strings can be moved to
  `locales/he.json` without changing function signatures.

## Open / deferred

- Real OCR quality for Hebrew receipts is delegated to Agent 88 —
  this module only provides the hook and stub confidence.
- Receipt binary storage is intentionally out of scope — only paths
  are tracked per the zero-blob rule.
- PDF pdfkit path returns a Promise because pdfkit emits chunks
  asynchronously; the default text fallback is synchronous for
  archive workflows that run inline.

## Sign-off

- Backend compiles and loads under Node 24.14.1 (Windows 11).
- All 41 unit tests pass (0 fail, 0 cancelled, 0 skipped).
- No external npm dependencies added.
- No existing files modified or deleted.
