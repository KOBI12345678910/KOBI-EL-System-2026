# AG-Y003 — Form 102 (טופס 102) Monthly Withholding Report

**Agent:** Y-003 / Swarm 4A
**Wave:** 2026
**Status:** Delivered — tests green (35/35)
**Rule:** לא מוחקים — רק משדרגים ומגדלים

---

## 1. What is Form 102?

טופס 102 is the **monthly employer-withholding report** that every Israeli
employer must file to:

| Authority | Portion reported |
|---|---|
| רשות המסים (Tax Authority) | מס הכנסה מנוכה ממשכורות (income tax withheld) |
| המוסד לביטוח לאומי | ביטוח לאומי — חלק עובד + חלק מעסיק |
| ביטוח בריאות ממלכתי | דמי בריאות — חלק עובד |

It is filed and paid together — one payment, one form, two authorities
(the Tax Authority acts as collection agent for Bituach Leumi).

## 2. Files delivered

| Path | Role |
|---|---|
| `onyx-procurement/src/tax/form-102.js` | Business-logic engine |
| `onyx-procurement/test/tax/form-102.test.js` | Unit tests (35 assertions) |
| `_qa-reports/AG-Y003-form-102.md` | This report |

**Existing support (not touched):**
- `onyx-procurement/src/tax-exports/form-102-xml.js` — lower-level XML serializer.
- `onyx-procurement/src/payroll/wage-slip-calculator.js` — upstream per-employee calc.

No files were deleted or mutated — only new files added.

## 3. Public API

```js
const { generate102, submitXML102 } = require('./src/tax/form-102');

const result = generate102(
  { year: 2026, month: 3, rows: [/* payroll rows */], adjustments: {} },
  { employerId: '513111111', employerName: '...' }
);

// result = { sections, total, payableBy, dueDate, xml, pdfFields, ... }

const submission = submitXML102(result);
// submission = { xml, envelope, headers, endpoint, status: 'prepared' }
```

### Helper exports (for tests + reuse)

| Export | Purpose |
|---|---|
| `CONSTANTS_2026` | Rates + thresholds table (frozen) |
| `SECTION_LABELS` | Hebrew/English labels + box codes |
| `computeBituachLeumi(row)` | Per-row BL (employee + employer) |
| `computeHealth(row)` | Per-row health insurance |
| `computeIncomeTax(row)` | Per-row income-tax pass-through |
| `aggregate(rows)` | Roll-up of all rows into sections |
| `dueDateFor(period)` | 15th of following month |
| `buildStubXml(result)` | XML serialization |
| `buildPdfFields(result)` | Flat field dict for PDF stamping |
| `FORM_CODE` | `'102'` |
| `MODULE_VERSION` | `'2026.1.0'` |

## 4. 2026 Rates & Thresholds Table

All values verified against `ISRAELI_TAX_CONSTANTS_2026.md` and
`wage-slip-calculator.js` (upstream source of truth).

### Bituach Leumi (National Insurance)

| Parameter | Value (2026) |
|---|---|
| Monthly threshold (60% of average wage) | **₪7,522 / month** |
| Maximum insurable earnings | **₪49,030 / month** |
| Employee rate — below threshold | **0.4%** (0.004) |
| Employee rate — above threshold (up to max) | **7%** (0.07) |
| Employer rate — below threshold | **3.55%** (0.0355) |
| Employer rate — above threshold (up to max) | **7.6%** (0.076) |

### Health Insurance (דמי בריאות)

| Parameter | Value (2026) |
|---|---|
| Monthly threshold | **₪7,522 / month** |
| Maximum insurable earnings | **₪49,030 / month** |
| Employee rate — below threshold | **3.1%** (0.031) |
| Employee rate — above threshold | **5%** (0.05) |

Note: there is **no employer** health-insurance portion — it's
employee-only under חוק ביטוח בריאות ממלכתי.

### Controlling Shareholder (בעל שליטה / מנהל בשיעור מיוחד)

Per 129א regulations, controlling shareholders use the **flat high-rate
table** with no low-bracket slice:

| Parameter | Value |
|---|---|
| BL — employee | 7% flat |
| BL — employer | 7.6% flat |
| Health — employee | 5% flat |
| Report bucket | `controlling_shareholder` (separate line on 102) |

The module tags CS rows into their own section so Form 126 (annual) can
reconcile at year-end without re-walking the whole payroll.

### Income Tax

Form 102 does **not** recompute progressive brackets. It only
**aggregates** what the wage-slip calculator already withheld.
Withholding brackets for 2026 (for reference only):

| Annual income | Marginal rate |
|---|---|
| up to ₪84,120 | 10% |
| ₪84,120 – ₪120,720 | 14% |
| ₪120,720 – ₪193,800 | 20% |
| ₪193,800 – ₪269,280 | 31% |
| ₪269,280 – ₪560,280 | 35% |
| ₪560,280 – ₪721,560 | 47% |
| above ₪721,560 | 50% (includes יסף) |

Nekudot zikui (tax-credit points): **₪248 / month = ₪2,976 / year**.

## 5. Threshold-boundary logic (test spec)

```
gross = 7,522                → entirely in LOW bracket (no high-rate slice)
gross = 7,523                → 7,522 × low-rate + 1 × high-rate
gross = 49,030               → everything up to max base, no cap hit
gross = 49,031+              → capped at MAX_BASE, bl.capped === true
isControllingShareholder     → flat 7%/7.6%/5% on min(gross, MAX_BASE)
blExempt                     → all BL + Health zero
blEmployeePortion supplied   → trusted, not recomputed
```

## 6. Due-date rules

Form 102 is due on the **15th of the month following the payroll period**:

| Payroll period | Due date |
|---|---|
| January 2026 | 2026-02-15 |
| March 2026 | 2026-04-15 |
| November 2026 | 2026-12-15 |
| **December 2026** | **2027-01-15** (year rollover) |

If the 15th falls on Shabbat / חג, the payment is effectively due the next
business day — but the **statutory** due date stays the 15th. Business-day
shifting is the payment runner's concern, not this module's.

`result.dueDate === result.payableBy` (identical string) is an
**intentional invariant**; `payableBy` is reserved as the future
business-day-adjusted alias, but for now both point at the 15th.

## 7. Output shape (`generate102` return)

```js
{
  period:   { year: 2026, month: 3 },                  // frozen
  employer: { employerId, employerName, ... },         // frozen

  sections: [
    { key: 'incomeTax',            label: {he, en, code:'042'}, amount, count, base },
    { key: 'bituachLeumiEmployee', label: {..., code:'052'},   amount, count, base },
    { key: 'bituachLeumiEmployer', label: {..., code:'053'},   amount, count, base },
    { key: 'healthEmployee',       label: {..., code:'054'},   amount, count, base },
    // present only if at least one CS row exists:
    { key: 'controllingShareholder', label, amount (roll-up), count, base, detail, note },
    // optional, from adjustments:
    { key: 'otherDeductions',      label, amount },
    { key: 'advances',             label, amount: -X, note },
    { key: 'priorCredit',          label, amount: -X, note },
  ],

  total:      <number>,        // sum of signed main-section amounts
  payableBy:  <ISO date>,      // same as dueDate for now
  dueDate:    <ISO date>,      // 15th of following month

  xml:        <string>,        // stub XML (Form 102 body)
  pdfFields:  { form_code, tax_year, ... },  // flat dict for PDF stamping

  meta: {
    formCode:      '102',
    constantsYear: 2026,
    generatedAt:   <ISO>,
    aggregation:   { /* raw aggregation output */ },
  },

  warnings: [ /* strings — validation issues + capped rows */ ],
}
```

**Important — controlling-shareholder section is a *detail roll-up*.**
Its `amount` is NOT added to `total`; the underlying numbers are already
in the four main sections. This is tested explicitly.

## 8. XML schema notes (STUB)

The module emits a stub XML body that follows the structure of
`tax-exports/form-102-xml.js` but with a self-contained namespace
(`urn:il-tax:form-102:2026`).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- טופס 102 — דיווח חודשי על ניכויים — STUB XML -->
<Form102 xmlns="urn:il-tax:form-102:2026" version="2026.1">
  <Meta>
    <FormCode>102</FormCode>
    <TaxYear>2026</TaxYear>
    <TaxMonth>3</TaxMonth>
    <GeneratedAt>...</GeneratedAt>
    <GeneratorAgent>techno-kol-uzi/form-102@2026</GeneratorAgent>
  </Meta>
  <Employer>
    <EmployerId>513111111</EmployerId>
    <EmployerName>טכנו קול עוזי בע&quot;מ</EmployerName>
    <DeductionFileNumber>...</DeductionFileNumber>
    <BituachLeumiNumber>...</BituachLeumiNumber>
  </Employer>
  <Period>
    <Year>2026</Year>
    <Month>3</Month>
  </Period>
  <IncomeTax>
    <EmployeesCount>...</EmployeesCount>
    <TotalGrossWages>...</TotalGrossWages>
    <TotalTaxWithheld>...</TotalTaxWithheld>
  </IncomeTax>
  <BituachLeumi>
    <EmployeePortion>...</EmployeePortion>
    <EmployerPortion>...</EmployerPortion>
    <TotalRemitted>...</TotalRemitted>
  </BituachLeumi>
  <HealthInsurance>
    <EmployeePortion>...</EmployeePortion>
  </HealthInsurance>
  <ControllingShareholders>
    <Count>...</Count>
    <GrossWages>...</GrossWages>
    <IncomeTax>...</IncomeTax>
    <BlEmployee>...</BlEmployee>
    <BlEmployer>...</BlEmployer>
    <Health>...</Health>
    <Note>Included in main totals — do not double-count</Note>
  </ControllingShareholders>
  <Summary>
    <GrandTotal>...</GrandTotal>
    <DueDate>2026-04-15</DueDate>
    <PayableBy>2026-04-15</PayableBy>
  </Summary>
</Form102>
```

### `submitXML102` — online submission envelope (STUB)

Wraps the Form 102 body in a submission envelope that **structurally**
matches what an online (מקוון) submission would look like — but the
real portal schema, namespaces, digital signature algorithm, and auth
token format MUST be confirmed from the live portal documentation:

- https://www.gov.il/he/service/report-102-online-deduction
- רשות המסים / שע"מ webservice documentation
- ביטוח לאומי B2B channel for the social-security portion

The envelope currently emits `PLACEHOLDER` for `DigitalSignature` and
`AuthToken`, and `status: 'prepared'`. No network I/O is performed —
the actual POST is the transport layer's job. Integration tests should
wire up a signed mock server before flipping status to `'submitted'`.

```xml
<SubmissionEnvelope xmlns="urn:il-tax:envelope:2026" version="2026.1">
  <Header>
    <SubmitterId>513111111</SubmitterId>
    <SubmitterName>...</SubmitterName>
    <FormCode>102</FormCode>
    <Period>2026-03</Period>
    <Channel>online</Channel>
    <Timestamp>...</Timestamp>
    <DigitalSignature>PLACEHOLDER</DigitalSignature>
    <AuthToken>PLACEHOLDER</AuthToken>
  </Header>
  <Payload>
    <!-- embedded Form102 body -->
  </Payload>
</SubmissionEnvelope>
```

### HTTP headers template

```
Content-Type: application/xml; charset=utf-8
X-Form-Code: 102
X-Channel: online
X-Submitter-Id: <employerId>
```

Real portal likely additionally requires:
```
Authorization: Bearer <otp-token>
X-Digital-Signature: <PKCS#7 over payload>
```

## 9. Test coverage

File: `onyx-procurement/test/tax/form-102.test.js`

**35 tests, all passing.** Categories:

| Category | # tests |
|---|---|
| BL threshold boundary (exactly 7,522 / +1 / cap / exempt / pre-supplied) | 6 |
| Health insurance brackets (exact / +1 / below / cap) | 4 |
| Controlling-shareholder special rates + section | 3 |
| Total reconciliation (main / adjustments / CS non-double-count) | 3 |
| Due date (March / Dec→rollover / Jan / invalid / payableBy) | 5 |
| XML + submission envelope + Hebrew escaping + validation | 5 |
| pdfFields | 1 |
| Warnings / validation / empty payroll / aggregate edge cases | 5 |
| Constants sanity (ensure 2026 values are in place) | 4 |

Key test invariants:
- `gross = 7,522` → **entirely low bracket** (no high-rate slice leaks)
- `gross = 7,523` → split `(7522 × low) + (1 × high)`
- Controlling shareholder → flat `0.07 / 0.076 / 0.05`
- `sum(main 4 sections) + advances + priorCredit === result.total`
- CS section amount is NOT added to `result.total` (no double-count)
- `dueDateFor({y:2026,m:12}) === '2027-01-15'` (year rollover)

Run:
```
cd onyx-procurement
node --test test/tax/form-102.test.js
```

## 10. Design decisions

1. **Zero dependencies.** Matches the house rule and keeps the module
   trivially portable. Everything (XML escaping, rounding, date math)
   is implemented locally.

2. **Pure — never mutates input.** `generate102`, `aggregate`,
   `computeBituachLeumi`, etc. all accept frozen-or-not input and
   return new objects. The `employer` and `period` on the result are
   `Object.freeze`-d.

3. **Trust wage-slip calculator output when supplied.** If a row ships
   with `blEmployeePortion` / `blEmployerPortion` / `healthPortion`
   pre-computed, we trust those numbers instead of re-deriving — this
   keeps Form 102 consistent with whatever the wage-slip calc produced
   (including any edge cases we haven't coded up yet).

4. **Controlling-shareholder roll-up is NOT double-counted.** The CS
   section is a *visibility* line — its totals are already in the four
   main sections. The `amount` field exists for UI/report rendering,
   but the grand-total sum explicitly skips `s.key === 'controllingShareholder'`.
   This is covered by the test `controlling-shareholder section NOT
   double-counted`.

5. **Negative-signed section amounts for advances / prior credit.**
   Instead of a separate `deductions` bag, advances and prior-month
   credits appear as sections with `amount < 0`. This keeps the
   sum-then-reconcile invariant clean.

6. **No network I/O in `submitXML102`.** The function is a pure
   envelope builder. Real submission must plug into a transport layer
   (with HMAC signing, OTP auth, and mock server for integration tests)
   that is out of scope for this agent.

7. **Due-date alias `payableBy`.** Kept distinct from `dueDate` so we
   can later add business-day shifting without breaking consumers who
   care about the statutory date vs. the effective payment date.

## 11. Open items / next steps (non-blocking)

- **Real submission schema.** Confirm XML namespace, digital-signature
  format, and auth-token type from the live portal. Update
  `submitXML102` to produce the exact envelope.
- **Business-day shifting.** When `payableBy` needs to move off of
  Shabbat / חג, wire up an Israeli-calendar helper and update
  `payableBy` (leave `dueDate` as statutory).
- **Form 126 reconciliation.** At year-end, pull all 12 monthly 102s
  and reconcile to Form 126. The `controllingShareholder.detail`
  roll-up on each result is designed for this handoff.
- **Bank-reference generator.** The printed 102 carries a payment
  reference string that הבנק reads for automatic posting to the
  employer's Tax Authority account. Not yet implemented.
- **Multi-entity mode.** Group companies file 102s per deduction file
  number (תיק ניכויים); a group-level wrapper should iterate `generate102`
  per entity and consolidate.

## 12. Compliance / house-rules checklist

- [x] לא מוחקים — רק משדרגים ומגדלים (no deletions)
- [x] Zero dependencies
- [x] Bilingual (Hebrew + English labels, Hebrew comments throughout)
- [x] Pure — no input mutation
- [x] Test boundary cases (threshold ±1, max base, year rollover)
- [x] 2026 rates verified against `ISRAELI_TAX_CONSTANTS_2026.md`
- [x] Stub XML clearly documented as STUB with upstream doc pointers
- [x] 35/35 tests green

---

**Module version:** `2026.1.0`
**Last verified:** 2026-04-11 (תאריך נוכחי)
**Next review:** before 2026-05-15 filing deadline (April 2026 payroll)
