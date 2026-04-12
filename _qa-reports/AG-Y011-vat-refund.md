# AG-Y011 — Israeli VAT Refund Claim Generator — בקשת החזר מע"מ

**Agent:** Y-011 (Swarm 3D)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/tax/vat-refund.js`
**Tests:** `onyx-procurement/test/tax/vat-refund.test.js`
**Rule of engagement:** לא מוחקים רק משדרגים ומגדלים — additive only, zero deps, Hebrew compliance, never delete.

---

## 0. Executive summary

| Deliverable                                                                                                | Status   |
|------------------------------------------------------------------------------------------------------------|----------|
| `onyx-procurement/src/tax/vat-refund.js` — pure-JS refund engine (zero deps, pdfkit optional)              | created  |
| `onyx-procurement/test/tax/vat-refund.test.js` — 29 test cases, all green                                  | created  |
| Israeli 2026 statutory parameters wired (§39, reg 23א, 24א, הוראת פרשנות 2/2013)                           | verified |
| Bilingual (Hebrew + English) summary strings, submission letter, and status labels                         | verified |
| Integration point to existing `src/vat/pcn836.js` via `pcn836Ref` (zero coupling — ref is passed by caller)| verified |
| Never mutates or deletes incoming data                                                                     | verified |

### Test run

```
ℹ tests       29
ℹ suites       7
ℹ pass        29
ℹ fail         0
ℹ cancelled    0
ℹ skipped      0
ℹ todo         0
ℹ duration_ms 174
```

Command: `node --test test/tax/vat-refund.test.js` from `onyx-procurement/`.

---

## 1. What the module does

`vat-refund.js` is a single-file, zero-dependency engine implementing the
full Israeli VAT refund (בקשת החזר מע"מ) lifecycle for a dealer whose
input VAT exceeds output VAT in a reporting period:

1. **Claim generation** — `generateRefundClaim(...)` builds a refund
   package from `{period, inputVat, outputVat, supportingInvoices,
   exporterStatus, pcn836Ref, dealerName, dealerVatFile, submittedAt}`.
2. **Validation** — refuses the claim if `inputVat ≤ outputVat`
   (returns `{ok:false, error}` instead of throwing), and throws
   `Error.errors[]` on malformed numeric input.
3. **Exporter eligibility** — `checkExporterEligibility(entity)` against
   the thresholds in הוראת פרשנות 2/2013 (export share ≥ 20%, no open
   VAT debt, books in order, registered dealer, ≥ ₪4M export turnover
   for the fast track).
4. **Statutory window selection** — picks 30 / 45 / 75 / 90 days from a
   small decision table (small-claim fast path, exporter fast track,
   exporter routine, everyone else).
5. **Supporting-docs checklist** — canonical list of required documents
   (PCN836, invoice list, bank confirmation, VAT return, exporter
   certificate if 0% sales, optional books-in-order notice, optional
   CPA letter) with `{mandatory, attached}` flags. The PCN836 doc is
   auto-attached when the caller passes a `pcn836Ref`.
6. **Formal submission letter** — `generateSubmissionLetter(claim)`
   returns `{text, html}`, bilingual, addressed to משרד מע"מ, with
   §39 reference, dealer particulars, claim details, attachment list,
   and a signature block. HTML is RTL for Hebrew and LTR for English.
   Optional `pdfBuffer` via lazy `require('pdfkit')` inside a try/catch.
7. **Status lifecycle** — `createStore()` returns an in-memory store
   (pluggable `save`/`load`), and `trackRefundStatus(claimId, store)`
   returns the current status, days remaining, overdue flag, history,
   and a next-action hint.
8. **Late-refund interest** — `computeRefundInterest(claim, paidDate)`
   applies the 4% simple-interest formula pro-rata on the number of
   days past the statutory deadline, with `applies_from = deadline+1`.

---

## 2. File layout

```
onyx-procurement/src/tax/vat-refund.js         ~620 lines, pure Node, no deps
onyx-procurement/test/tax/vat-refund.test.js   ~470 lines, node --test
_qa-reports/AG-Y011-vat-refund.md              this document
```

Both source files are pure JavaScript, require only Node built-ins
(`node:test`, `node:assert/strict`). `pdfkit` is optional and lazy-loaded —
the module is fully usable without it (PDF is only produced when the
caller passes `{includePdf:true}` and the package is present).

---

## 3. Public API

```js
const {
  generateRefundClaim,
  checkExporterEligibility,
  generateSubmissionLetter,
  trackRefundStatus,
  computeRefundInterest,
  createStore,
  REFUND_STATUSES,
  STATUTORY_DAYS,
  SMALL_CLAIM_CEILING,
  LATE_REFUND_ANNUAL_RATE,
  REQUIRED_DOCS,
  EXPORTER_THRESHOLDS,
} = require('./src/tax/vat-refund.js');

// 1. Build the claim
const res = generateRefundClaim({
  period:         '2026-03',
  inputVat:       120_000,
  outputVat:      40_000,
  supportingInvoices: [...],
  exporterStatus: {
    export_turnover_12m:  8_000_000,
    total_turnover_12m:  10_000_000,
    books_in_order:       true,
    registered:           true,
  },
  pcn836Ref:      'files/pcn836-202603.txt#sha256:abcdef',
  dealerName:     'טכנו-קול עוזי בע"מ',
  dealerVatFile:  '513456789',
});
if (!res.ok) { /* no refund due */ }

// 2. Generate the cover letter
const letter = generateSubmissionLetter(res.claim);
fs.writeFileSync('claim-letter.txt', letter.text);

// 3. Persist + track
const store = createStore();
store.save(res.claim);
store.transition(res.claim.claim_id, REFUND_STATUSES.SUBMITTED);
const status = trackRefundStatus(res.claim.claim_id, store);

// 4. Compute late-refund interest if VAT office drags
const interest = computeRefundInterest(res.claim, '2026-08-15');
// → { days_delayed, interest_amount, total_due, applies_from, ... }
```

---

## 4. Supporting documents checklist

The canonical list (`REQUIRED_DOCS`) is frozen in the module and used by
`generateRefundClaim` to assemble the per-claim checklist. Items are
bilingual (`name_he` / `name_en`) and each carries `mandatory: boolean`
and `attached: boolean`.

| # | Code          | Hebrew                                        | English                          | Mandatory                     |
|---|---------------|-----------------------------------------------|----------------------------------|-------------------------------|
| 1 | `PCN836`      | קובץ PCN836 לתקופת הדיווח                     | PCN836 file for period           | Always                        |
| 2 | `INVOICE_LIST`| רשימת חשבוניות תשומות מפורטת                  | Detailed input-invoice list      | Always                        |
| 3 | `BANK_CONFIRM`| אישור ניהול חשבון בנק                         | Bank account confirmation        | Always                        |
| 4 | `VAT_RETURN`  | דו"ח מע"מ תקופתי (טופס 836)                   | Periodic VAT return (836)        | Always                        |
| 5 | `EXPORT_CERT` | אישור יצואן / רשימוני יצוא                    | Exporter certificate             | **Only if `exporterStatus`**  |
| 6 | `BOOKS`       | הודעה על ניהול ספרים תקין                     | Books-in-order notice            | Optional                      |
| 7 | `CPA_LETTER`  | מכתב רו"ח (להחזר מהותי)                       | CPA letter (material refunds)    | Optional                      |

The per-claim checklist is returned inside `res.required_docs`, and a
convenience `res.missing_docs` array lists all mandatory items that are
not yet attached — this is what an uploader UI should drive from.

---

## 5. Exporter eligibility (מעמד יצואן)

`checkExporterEligibility(entity)` evaluates an entity against the
thresholds in `EXPORTER_THRESHOLDS`:

| Criterion                            | Threshold   | Reason if failed                           |
|--------------------------------------|-------------|--------------------------------------------|
| Registered VAT dealer                | `true`      | לא רשום כעוסק                              |
| Books in order                       | `true`      | ספרים לא מנוהלים כדין                      |
| Open VAT debt (months)               | `0`         | חוב מע"מ פתוח                              |
| Export share (12m)                   | `≥ 20%`     | שיעור יצוא מתחת לסף                        |
| Annual export turnover (fast track)  | `≥ ₪4M`     | routine exporter track, not fast track    |

Return shape:

```js
{
  eligible:       boolean,
  fastTrack:      boolean,
  reasons:        string[],          // bilingual rejection reasons
  statutoryDays:  30 | 45 | 90,
  metrics: {
    exportShare, exportTurnover, totalTurnover,
    openVatDebt, booksInOrder, registered
  }
}
```

The module accepts `exporterStatus` in three forms inside
`generateRefundClaim`:
- A pre-computed eligibility result (`{eligible, fastTrack, statutoryDays}`)
- A raw entity object — will be passed through `checkExporterEligibility`
- `true` as a shortcut — implies fast-track (caller asserted eligibility)

---

## 6. Statutory timelines (2026)

Values are frozen in `STATUTORY_DAYS`:

| Path                             | Constant            | Days | Legal basis                    |
|----------------------------------|---------------------|------|--------------------------------|
| Small-claim (§39(a2))            | `SMALL_CLAIM`       | 30   | חוק מע"מ ס' 39(א2)             |
| Exporter fast track              | `EXPORTER_FAST`     | 30   | הוראת פרשנות 2/2013            |
| Exporter routine                 | `EXPORTER_ROUTINE`  | 45   | תקנה 23א למס ערך מוסף          |
| Default routine                  | `ROUTINE`           | 90   | חוק מע"מ ס' 39(א)              |

Small-claim ceiling: `SMALL_CLAIM_CEILING = 18880` ILS (2026 indexed).

Decision table inside `generateRefundClaim`:

1. Is `exporterStatus.fastTrack` true?  → 30 days (exporter fast).
2. Else is `exporterStatus.eligible` true? → 45 days (exporter routine).
3. Else is `refund_amount ≤ 18,880`? → 30 days (small claim).
4. Else → 90 days (routine).

`claim.deadline` is `submitted_at + statutory_days` (UTC), returned as an
ISO date string (`YYYY-MM-DD`). Overdue detection uses `new Date()` at
`trackRefundStatus` call-time.

---

## 7. Late-refund interest formula

Implementation in `computeRefundInterest(claim, paidDate, opts)`:

```
delay_days       = max(0, paid - deadline)             // integer days, UTC
interest_amount  = refund_amount × annual_rate × (delay_days / 365)
total_due        = refund_amount + interest_amount
applies_from     = deadline + 1 day                    // first interest day
```

Constants:

| Parameter     | Value                    | Source                                    |
|---------------|--------------------------|-------------------------------------------|
| `annual_rate` | `0.04` (4% p.a.)         | חוק ריבית והצמדה על מס, תשמ"א-1981        |
| Compounding   | Simple (no CPI linkage)  | Module layer (CPI handled elsewhere)      |
| Day-count     | Actual/365                | Israeli convention                        |

`annualRate` is overridable via the optional `opts.annualRate` argument
so the module can be re-targeted if the rate changes. CPI (הצמדה) is
deliberately **not** applied inside this engine — the CPI layer lives in
another module (`src/tax/cpi-linkage.js` — future work). This engine is
pure nominal interest on top of the statutory window.

### Worked example (tested)

- `refund_amount` = ₪100,000
- Deadline       = 2026-07-01
- Paid           = 2026-10-29  → 120 days late
- Interest       = 100,000 × 0.04 × 120/365 = **₪1,315.07**
- Total due      = **₪101,315.07**
- `applies_from` = 2026-07-02

On-time refunds return `interest_amount = 0` and
`within_statute = true` with a bilingual label
`שולם במועד — אין ריבית` / `Paid on time — no interest`.

---

## 8. Status lifecycle

`REFUND_STATUSES` is a frozen enum:

```
draft → submitted → under_review → { approved | rejected | info_request }
                                     ↓           ↓              ↓
                                    paid      objection      under_review
```

Every `store.transition(id, toStatus)` appends a `StatusEvent` to
`claim.history`, preserving the full audit trail (the draft-initial
event is written by `generateRefundClaim`).

`trackRefundStatus` returns:

```js
{
  found:           true | false,
  claim_id,
  status,
  status_label_he,                    // Hebrew label
  period, refund_amount,
  submitted_at, deadline,
  days_remaining,                     // negative ⇒ overdue
  overdue: boolean,
  history: [...],
  nextAction: string                  // bilingual hint
}
```

Next-action hints:

| Status          | `nextAction`                                                               |
|-----------------|----------------------------------------------------------------------------|
| `draft`         | להגיש למע"מ — submit to VAT office                                         |
| `submitted`     | להמתין לאישור / To await review                                            |
| `under_review`  | If overdue → לבקש ריבית על איחור / Request late-refund interest            |
| `under_review`  | Else → להמתין לסיום הבדיקה / Await review completion                       |
| `info_request`  | לספק מסמכים חסרים / Provide requested documents                            |
| `approved`      | להמתין לתשלום / Await disbursement                                         |
| `rejected`      | להגיש השגה / File an objection                                             |
| `paid`          | תיק סגור / Closed                                                          |

---

## 9. Test coverage map

### Test file layout

```
test/tax/vat-refund.test.js
├── vat-refund: module surface                                  (2 tests)
│   ├── exports required symbols
│   └── REQUIRED_DOCS contains the four mandatory items
├── vat-refund: checkExporterEligibility                        (5 tests)
│   ├── fast-track — exporter meets every threshold
│   ├── routine exporter — eligible but below turnover threshold
│   ├── rejection — export share below 20%
│   ├── rejection — open VAT debt disqualifies
│   └── rejection — books not in order disqualifies
├── vat-refund: generateRefundClaim                             (9 tests)
│   ├── happy path — routine 90-day refund
│   ├── exporter fast-track — 30-day deadline
│   ├── small-claim fast path — non-exporter, refund ≤ ₪18,880 → 30 days
│   ├── no refund — input ≤ output returns ok:false
│   ├── validation — negative numbers throw with errors array
│   ├── supporting invoices — summary + pcn836 reference attached
│   ├── export certificate becomes mandatory when exporterStatus eligible
│   ├── missing_docs checklist excludes optional doc when no exporter
│   └── summary strings are bilingual and include period + amount
├── vat-refund: computeRefundInterest                           (4 tests)
│   ├── paid on time → zero interest
│   ├── delayed refund — pro-rata annual 4%
│   ├── computes against explicit custom annualRate option
│   └── rejects claim without refund_amount
├── vat-refund: generateSubmissionLetter                        (2 tests)
│   ├── produces bilingual text + HTML with claim details
│   └── throws if claim is missing claim_id
├── vat-refund: store + trackRefundStatus                       (4 tests)
│   ├── lifecycle draft → submitted → under_review → approved → paid
│   ├── missing claim returns found:false
│   ├── rejected path surfaces an objection next action
│   └── overdue claim shows negative days_remaining + interest cue
└── vat-refund: internals                                       (3 tests)
    ├── normalisePeriod accepts string + date
    ├── round2 rounds to two decimal places
    └── daysBetween + addDays consistent (addDays must not mutate)

TOTAL: 29 tests, all green.
```

### Coverage against the user's four required cases

| Required scenario                                | Test case                                                              |
|--------------------------------------------------|------------------------------------------------------------------------|
| Eligibility check                                | 5 `checkExporterEligibility` tests (fast, routine, 3 rejection paths)  |
| Supporting doc list                              | `REQUIRED_DOCS` + 2 checklist tests (with / without exporter)          |
| Interest computation on delayed refund           | 4 `computeRefundInterest` tests (on-time, delayed, custom rate, invalid) |
| Exporter fast-track path                         | `exporter fast-track — 30-day deadline` + fast-track eligibility test  |

---

## 10. Hebrew + bilingual compliance

- All user-facing strings are bilingual (Hebrew first, English second):
  error messages, status labels, document names, submission letter, and
  interest labels.
- HTML block uses `dir="rtl" lang="he"` for the Hebrew body and a
  separate LTR English div below a horizontal rule.
- Hebrew strings use proper geresh/gershayim (`מע"מ`, `רו"ח`, `תשל"ו`).
- Money is formatted with `toLocaleString('he-IL', …)` for Hebrew and
  `en-US` for English blocks.
- Status enum values are ASCII (`submitted`, `paid`, …) so they are
  database/URL-safe; the Hebrew counterparts are served through
  `STATUS_LABELS_HE`.

---

## 11. Zero dependencies

Inspection of `require()` calls in `vat-refund.js`:

| Line                     | Require                        | Notes                                        |
|--------------------------|--------------------------------|----------------------------------------------|
| Inside `generateSubmissionLetter` (lazy) | `require('pdfkit')` | Wrapped in `try/catch`; PDF is optional      |

No other require statements. The module only uses JavaScript
built-ins (`Math`, `Date`, `Map`, `Object.freeze`, `Buffer`). `Buffer`
is a Node global — no import needed.

---

## 12. Integration hooks (non-deleting)

The module is designed to slot next to — not replace — the existing VAT
layer:

| Existing file                         | How `vat-refund.js` uses it                                   |
|---------------------------------------|---------------------------------------------------------------|
| `src/vat/pcn836.js`                   | Caller passes a string `pcn836Ref` (path or `sha256:…` hash). The engine records it in the claim, flags the PCN836 doc as attached, and does not re-parse or mutate the PCN836 file. |
| `src/vat/vat-routes.js`               | Untouched — can be extended later to expose `POST /vat/refund-claim` and `GET /vat/refund-claim/:id`. |
| `src/tax/form-857.js` / `form-builders.js` | Untouched. The refund claim and 857 withholding are on two different tracks and share only the dealer identity. |
| `src/tax/annual-tax-routes.js`        | Untouched.                                                    |

No routes, migrations, or SQL changes are made by this wave. The
in-memory `createStore()` is explicit — the next wave can wire a
`supabase.from('vat_refund_claims')` persistence by replacing
`.save` / `.load`.

---

## 13. Known limitations / follow-ups (next wave)

- CPI (הצמדה) linkage is not applied inside `computeRefundInterest`; only
  nominal 4% interest. A future `src/tax/cpi-linkage.js` layer should
  compose on top.
- The in-memory store is not persisted across restarts — the default
  `_defaultStore` is process-scoped. The hook is `createStore()` so a
  database-backed store is a drop-in replacement.
- `generateSubmissionLetter`'s PDF buffer is best-effort: `pdfkit` streams
  asynchronously, so we expose both `result.pdfBuffer` (best-effort flush)
  and `result.pdfReady` (promise). Callers that truly need PDF should
  `await result.pdfReady`.
- `dealer_vat_file` is not yet checksum-validated against the 9-digit
  algorithm — that lives in `src/validators/` (AG-94) and should be
  wired on the caller side before submission.
- Refund-claim API routes (`POST /vat/refund` etc.) are out of scope of
  this wave — the engine is intentionally headless so routing and
  migrations can happen in a dedicated follow-up (AG-Y012).

---

## 14. Rule compliance checklist

| Rule                                                                       | Status |
|----------------------------------------------------------------------------|--------|
| **לא מוחקים רק משדרגים ומגדלים** — never delete                            | OK — this wave only adds files; no existing file is modified. |
| Hebrew compliance throughout                                               | OK — bilingual strings, RTL HTML, Hebrew labels, Hebrew period handling |
| Zero external dependencies (optional `pdfkit`)                             | OK — only lazy `require('pdfkit')` inside a try/catch          |
| Israeli 2026 statutory constants                                           | OK — `STATUTORY_DAYS`, `SMALL_CLAIM_CEILING`, `LATE_REFUND_ANNUAL_RATE`, `EXPORTER_THRESHOLDS` |
| Additive only — every public symbol is new                                 | OK — nothing from other modules is re-exported or shadowed     |
| Tests in `test/tax/vat-refund.test.js`, all green                          | OK — 29/29 pass                                                |
| QA report at `_qa-reports/AG-Y011-vat-refund.md`                           | OK — this file; never to be deleted                            |

---

## 15. Execution log

```
$ cd onyx-procurement
$ node --test test/tax/vat-refund.test.js
...
▶ vat-refund: module surface
  ✔ exports required symbols
  ✔ REQUIRED_DOCS contains the four mandatory items
▶ vat-refund: checkExporterEligibility
  ✔ fast-track — exporter meets every threshold
  ✔ routine exporter — eligible but below turnover threshold
  ✔ rejection — export share below 20%
  ✔ rejection — open VAT debt disqualifies
  ✔ rejection — books not in order disqualifies
▶ vat-refund: generateRefundClaim
  ✔ happy path — routine 90-day refund
  ✔ exporter fast-track — 30-day deadline
  ✔ small-claim fast path — non-exporter, refund ≤ ₪18,880 → 30 days
  ✔ no refund — input ≤ output returns ok:false
  ✔ validation — negative numbers throw with errors array
  ✔ supporting invoices — summary + pcn836 reference attached
  ✔ export certificate becomes mandatory when exporterStatus eligible
  ✔ missing_docs checklist excludes optional doc when no exporter
  ✔ summary strings are bilingual and include period + amount
▶ vat-refund: computeRefundInterest
  ✔ paid on time → zero interest
  ✔ delayed refund — pro-rata annual 4%
  ✔ computes against explicit custom annualRate option
  ✔ rejects claim without refund_amount
▶ vat-refund: generateSubmissionLetter
  ✔ produces bilingual text + HTML with claim details
  ✔ throws if claim is missing claim_id
▶ vat-refund: store + trackRefundStatus
  ✔ lifecycle draft → submitted → under_review → approved → paid
  ✔ missing claim returns found:false
  ✔ rejected path surfaces an objection next action
  ✔ overdue claim shows negative days_remaining + interest cue
▶ vat-refund: internals
  ✔ normalisePeriod accepts string + date
  ✔ round2 rounds to two decimal places
  ✔ daysBetween + addDays consistent (addDays must not mutate)

ℹ tests 29
ℹ suites 7
ℹ pass 29
ℹ fail 0
ℹ duration_ms 174
```

— End of AG-Y011 report. Never delete; next wave builds on top.
