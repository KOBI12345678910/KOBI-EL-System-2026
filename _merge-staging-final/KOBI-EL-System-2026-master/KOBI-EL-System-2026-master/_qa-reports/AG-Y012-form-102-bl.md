# AG-Y012 — Israeli National Insurance (ביטוח לאומי) Form 102 BL Exporter

**Agent:** Y-012
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi (Israeli)
**Module:** `onyx-procurement/src/bl/form-102-bl.js`
**Tests:** `onyx-procurement/test/bl/form-102-bl.test.js`
**Rules of engagement:** לא מוחקים רק משדרגים ומגדלים — additive only, zero deps, bilingual.

---

## 0. Executive summary

| Deliverable                                                                                      | Status  |
|--------------------------------------------------------------------------------------------------|---------|
| `onyx-procurement/src/bl/form-102-bl.js` — pure-JS NII engine (zero deps, 2026 rates)            | created |
| `onyx-procurement/test/bl/form-102-bl.test.js` — 46 test cases, all green                        | created |
| Complements existing Y-003 `tax-exports/form-102-xml.js` (Income-Tax side)                       | yes     |
| Per-employee BL + Health calculation with threshold + ceiling handling                           | yes     |
| Status codes (בעל שליטה / עצמאי במעמד שכיר / עובד זר / אשרת ת.ז ביקור / נוער / גמלאי)            | yes     |
| Sectoral rates (קיבוץ / אבטחה / חקלאות)                                                          | yes     |
| Fixed-width payroll file (H / D / T records) per BL required format                              | yes     |
| `importBLResponse` — ACK / REJ / PARTIAL parser (text + JSON)                                    | yes     |
| `computeInterest` — ריבית פיגורים formula                                                         | yes     |
| Bilingual metadata (Hebrew + English)                                                            | yes     |
| Zero runtime dependencies                                                                         | yes     |

### Test run

```
ℹ tests 46
ℹ suites 0
ℹ pass 46
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~272
```

---

## 1. Purpose and scope

Form 102 (`טופס 102`) is the monthly employer remittance report that
accompanies the 15th-of-month payment to both:

1. **רשות המסים** — income tax withheld (already handled by Y-003 /
   `src/tax-exports/form-102-xml.js`).
2. **מוסד לביטוח לאומי (NII)** — דמי ביטוח לאומי + מס בריאות.

This agent delivers the **BL side** (item 2) as a dedicated business-logic
module so the employer can produce a per-employee breakdown, a fixed-width
payroll file in the format required by the NII gateway, and correctly
parse the ack/reject response returned after upload.

The module lives at `src/bl/` — a new folder added under Techno-Kol Uzi's
rule of **never delete, always grow** — and does NOT modify the existing
`tax-exports/form-102-xml.js`.

---

## 2. 2026 statutory rate table

All values are sourced from `CONSTANTS_2026` in
`src/payroll/wage-slip-calculator.js` (single source of truth) so the two
modules stay aligned.

### 2.1 Thresholds

| Parameter                      | Value (NIS)  | Notes                                                |
|-------------------------------|--------------|------------------------------------------------------|
| Monthly reduced-rate threshold | **7,522**    | 60% of average wage ≈ ₪12,536 × 60%                  |
| Monthly insurable ceiling      | **49,030**   | 5 × average wage; earnings above are NOT insurable   |

### 2.2 ביטוח לאומי (National Insurance) — employee

| Bracket                           | Rate      |
|----------------------------------|-----------|
| Up to threshold (≤ 7,522)         | **0.4%**  |
| Between threshold and ceiling     | **7.0%**  |

### 2.3 ביטוח לאומי (National Insurance) — employer

| Bracket                           | Rate       |
|----------------------------------|------------|
| Up to threshold                   | **3.55%**  |
| Between threshold and ceiling     | **7.60%**  |

### 2.4 מס בריאות (Health Tax) — employee only

| Bracket                           | Rate      |
|----------------------------------|-----------|
| Up to threshold                   | **3.1%**  |
| Between threshold and ceiling     | **5.0%**  |

### 2.5 Interest

| Parameter                    | Value    |
|------------------------------|----------|
| Annual interest rate         | **4%**   |
| Days in year                 | 365      |
| Formula                      | `interest = amount × rate × (daysLate / 365)` |

---

## 3. Status codes (סיווג מבוטח)

| Code | Key            | Hebrew                | English                      | BL adjustments                                   |
|------|----------------|-----------------------|------------------------------|--------------------------------------------------|
| 01   | REGULAR        | שכיר רגיל             | Regular employee             | none                                             |
| 02   | CONTROLLING    | בעל שליטה              | Controlling shareholder      | employer BL = 0                                  |
| 03   | SELF_AS_EMP    | עצמאי במעמד שכיר      | Self-employed as employee    | standard (status flag for audit trail)           |
| 04   | FOREIGN        | עובד זר                | Foreign worker               | health tax = 0                                   |
| 05   | VISITOR_VISA   | אשרת ת.ז ביקור         | Visitor visa (B-1)           | health tax = 0                                   |
| 06   | YOUTH          | נוער                   | Youth (under 18)             | employer BL at low rate only                     |
| 07   | RETIREE        | גמלאי                  | Retiree / pensioner          | employee BL = 0 (health still applies)           |

Hebrew aliases (e.g. `'בעל שליטה'`, `'עובד זר'`, `'גמלאי'`, `'נוער'`) are
resolved automatically by `normalizeStatusCode`. An `exemptFromBL: true`
flag zeros out all three portions unconditionally.

---

## 4. Sectoral rates

Israeli BL law allows certain sectors a reduced or augmented employer tariff.
The module models them as multipliers / additive surcharges applied on top
of the statutory rates:

| Code | Hebrew    | English     | employerMul | employeeMul | Extra                        |
|------|-----------|-------------|-------------|-------------|------------------------------|
| STD  | רגיל      | Standard    | 1.00        | 1.00        | —                            |
| KIB  | קיבוץ     | Kibbutz     | **0.93**    | 1.00        | —                            |
| SEC  | אבטחה     | Security    | 1.00        | 1.00        | employer +**0.2%** surcharge |
| AGR  | חקלאות    | Agriculture | **0.85**    | 1.00        | —                            |

Hebrew aliases (`'קיבוץ'`, `'מושב'`, `'אבטחה'`, `'שמירה'`, `'חקלאות'`)
auto-resolve through `resolveSector`.

---

## 5. File format (BL fixed-width payroll file)

Lines separated by `CRLF`. Encoded UTF-8. File name:
`BL102_<tikNikuyim>_<YYYYMM>.txt`.

### 5.1 Header record — 80 chars, type `H`

| Pos  | Len | Field               | Format                  |
|------|-----|---------------------|-------------------------|
|  1   |  1  | record type         | `H`                     |
|  2   |  9  | tik nikuyim         | 9 digits zero-padded    |
| 11   |  6  | period              | `YYYYMM`                |
| 17   | 50  | employer legal name | right-padded spaces     |
| 67   |  8  | generation date     | `YYYYMMDD`              |
| 75   |  6  | filler              | spaces                  |

### 5.2 Detail record — 100 chars, type `D`

| Pos  | Len | Field               | Format                    |
|------|-----|---------------------|---------------------------|
|  1   |  1  | record type         | `D`                       |
|  2   |  9  | employee tz         | 9 digits zero-padded      |
| 11   |  2  | status code         | `01`..`07`                |
| 13   |  3  | sector code         | `STD` / `KIB` / `SEC` / `AGR` |
| 16   | 30  | employee name       | right-padded spaces       |
| 46   | 12  | gross wage (agorot) | zero-padded               |
| 58   | 12  | employee BL (agorot)| zero-padded               |
| 70   | 12  | employer BL (agorot)| zero-padded               |
| 82   | 12  | health tax (agorot) | zero-padded               |
| 94   |  2  | work days           | zero-padded 00..99        |
| 96   |  5  | filler              | spaces                    |

### 5.3 Footer record — 80 chars, type `T`

| Pos  | Len | Field                      | Format                  |
|------|-----|----------------------------|-------------------------|
|  1   |  1  | record type                | `T`                     |
|  2   |  6  | record count               | zero-padded             |
|  8   | 14  | total gross (agorot)       | zero-padded             |
| 22   | 14  | total employee BL (agorot) | zero-padded             |
| 36   | 14  | total employer BL (agorot) | zero-padded             |
| 50   | 14  | total health tax (agorot)  | zero-padded             |
| 64   | 14  | grand total to remit       | zero-padded             |
| 78   |  3  | filler                     | spaces                  |

All monetary fields are stored as **agorot** (NIS × 100) rounded to the
nearest integer, matching the NII gateway convention.

---

## 6. Public API

```js
const BL = require('./src/bl/form-102-bl');

// 1. Compute the monthly report
const report = BL.generate102BL({
  period: { year: 2026, month: 4 },
  employer: { employerId: '513579246', employerName: 'Techno-Kol Uzi בע"מ' },
  employees: [
    { id: 'e1', tz: '012345678', name: 'Alice', grossWage: 8500, statusCode: '01', workDays: 22 },
    { id: 'e2', tz: '023456789', name: 'בוב',    grossWage: 18000, statusCode: 'בעל שליטה' },
    // ...
  ],
});
// report.totals.totalToRemit  ← NIS to send to BL

// 2. Build the BL-format fixed-width file
const file = BL.buildPayrollFile(report);
// file.filename = 'BL102_513579246_202604.txt'
// file.content  = header + details + footer (CRLF-separated)

// 3. After uploading, parse the response file
const ack = BL.importBLResponse(responseText);
// ack.status = 'ACK' | 'REJ' | 'PARTIAL' | 'UNKNOWN'
// ack.errors / ack.warnings / ack.records

// 4. Late payment
const late = BL.computeInterest(50000, 30);
// { amount, daysLate, annualRate: 0.04, interest, total }
```

Also exported: `computeEmployeeBL` (single-employee compute),
`BL_CONSTANTS_2026`, `STATUS_CODES`, `SECTORS`, `FILE_FORMAT`, `validate`
and an `_internal` namespace with helpers for direct unit testing.

---

## 7. Test coverage — 46 tests, all passing

Grouped by concern:

| Block                      | Tests | Focus                                                  |
|---------------------------|------:|--------------------------------------------------------|
| 1. Constants               |   4   | threshold, ceiling, all four rate pairs                |
| 2. Threshold boundary      |   4   | below, at (7522), just-above (7523), mid (20000)       |
| 3. Ceiling cap             |   3   | at ceiling (49030), above (100000), zero wage          |
| 4. Status codes            |   6   | controlling, foreign, visitor, youth, retiree, aliases |
| 5. Sectors                 |   4   | kibbutz, security, agriculture, Hebrew aliases         |
| 6. generate102BL           |   4   | totals, period string, bilingual titles, invalid input |
| 7. File format             |   6   | widths, header content, agorot, footer, filename, UTF-8|
| 8. importBLResponse        |   5   | ACK, REJ, JSON, Buffer, empty                          |
| 9. computeInterest         |   5   | zero, formula, full-year, custom rate, bad input       |
| 10. validate               |   4   | missing period, missing employerId, neg wage, happy    |
| 11. Round-trip             |   1   | complete 5-employee mixed-status file                   |

**Total: 46 pass / 0 fail / ~272 ms.**

Run locally with:

```
cd onyx-procurement
node --test test/bl/form-102-bl.test.js
```

---

## 8. Compliance notes

- **Rule respected:** nothing deleted. New folder `src/bl/` and new test
  folder `test/bl/` added. `tax-exports/form-102-xml.js` (Y-003) is
  untouched and continues to serve the Income-Tax XML side.
- **Zero runtime deps:** only `node:test` and `node:assert/strict` at
  test time, only `Buffer` at runtime.
- **Bilingual:** form title, status labels, sector labels all provided in
  Hebrew + English. Hebrew aliases accepted as input.
- **Rate table sync:** BL_CONSTANTS_2026 matches
  `src/payroll/wage-slip-calculator.js:CONSTANTS_2026.BITUACH_LEUMI` and
  `HEALTH_TAX` exactly — editing one without the other would surface as a
  failing threshold-boundary test in both modules.
- **Round-trip tested:** the 5-employee mixed scenario (regular, controlling,
  kibbutz, foreign over ceiling, youth) produces a 7-line file and all
  status/sector adjustments are verified end-to-end.

---

## 9. Files touched / added

```
+ onyx-procurement/src/bl/                          (new folder)
+ onyx-procurement/src/bl/form-102-bl.js            (new, ~600 lines)
+ onyx-procurement/test/bl/                         (new folder)
+ onyx-procurement/test/bl/form-102-bl.test.js      (new, 46 tests)
+ _qa-reports/AG-Y012-form-102-bl.md                (this report)
```

No existing files were modified.

---

## 10. Follow-ups (non-blocking)

1. Wire `generate102BL` into the monthly close job so the BL file is
   auto-generated alongside the tax XML on the 10th of each month.
2. Connect `importBLResponse` to the NII gateway webhook so the ack
   automatically updates the remittance status in `remittances` table.
3. Add optional CSV preview next to the fixed-width file for ops review
   (one-liner — already trivial via `employees` array).
4. When the 2027 rates publish (מדד 2027), copy `BL_CONSTANTS_2026` to
   `BL_CONSTANTS_2027` — do NOT edit the 2026 block (audit trail rule).

---

**Never delete this report.** — Agent Y-012, 2026-04-11.
