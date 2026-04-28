# AGENT-217 — Form 856 Builder Implementation

**Agent:** 217 — Tax Compliance / Builder
**Date:** 2026-04-29
**Predecessor:** AGENT-133 (audit) — Form 856 = `RED — no dedicated implementation`
**Scope:** Implement `onyx-procurement/src/tax/form-856.js` — annual withholding-at-source for freelancers/contractors. Reference: `form-126.js`. Sources: `withholding_tax_certificates` table + `contractor-payment-engine.ts`.
**Verdict:** GREEN — module created, smoke-tested, round-trips, adapters wired to both source data shapes.

---

## 1. Definitional confirmation

Per AGENT-133:
- **Form 856** — annual report of payments to freelancers/contractors with withholding-at-source. Per `terminology.json:290-294` and ITA spec.
- **Form 857** — broader annual employer withholding return covering BOTH employees and contractors.
- 856 is the contractor-only subset, with its own root tag (`Report856`), form code (`856`), and per-row classification code (קוד סיווג) that 857 does not carry.

The new module deliberately does **not** call into `form-857.js` — they are siblings at the same architectural tier. This avoids the AGENT-19 conflation that the audit flagged (treating 856 as covered "via 857").

---

## 2. File created

| Path | Size | Status |
|---|---|---|
| `onyx-procurement/src/tax/form-856.js` | 746 lines (~25 KB) | NEW |

Zero runtime dependencies. CommonJS (`module.exports`), matching `form-126.js` and `form-857.js`.

---

## 3. Public API

```js
const F = require('./onyx-procurement/src/tax/form-856.js');

F.generate856({ year, payer, recipients?, payments, certificates? })
  // → { version, form_code:'856', generated_at, records, summary, electronicFile }

F.aggregateRecipient(recipient, payments, certificates, year)  // single row
F.buildPayerSummary(records, year, payer)                       // trailer totals
F.buildElectronicFile(records, summary, options)                // {fixedWidth, xml}
F.parseDataLine(line) / F.parseTrailerLine(line)                // round-trip parsers
F.classifyCode(key)                                              // 'PROF' → '01'

// Adapters from raw DB rows (the wiring requested by Agent 133):
F.rowsFromCertificateTable(rows)        // from withholding_tax_certificates
F.rowsFromContractorPayments(rows, profilesById)  // from contractor-payment-engine

// Constants:
F.CLASSIFICATION_CODES, F.FIELD_LAYOUT, F.TRAILER_LAYOUT,
F.RECORD_WIDTH (208), F.TRAILER_WIDTH (208)

F.createEngine()  // isolated factory for tests
```

---

## 4. What 856 carries that 857 does not

| Field | 856 | 857 |
|---|---|---|
| `RecipientClassificationCode` (קוד סיווג) | YES — 2-digit per row | absent |
| `CertificateValidFrom/To` (per-row) | YES — copied from cert table | absent |
| Distinct root tag | `Report856` | `Report857` |
| Distinct form code | `856` | `857` |
| Recipient pool | contractors / non-employees only | employees + contractors |
| Per-class breakdown in summary | YES (`by_classification`) | n/a |

The classification dimension (`PROF | CONSTRUCT | TRANSPORT | RENT | INTEREST | ROYALTY | OTHER`, codes `01..06,99`) maps to the ITA רשימת סיווגים for 856, mirrors what the recipient files in their own 1301, and lets Tax Authority cross-checks succeed.

---

## 5. Fixed-width line layout (208 chars)

| # | Field | Width | Type |
|---|---|---|---|
| 1 | `record_type` (=`856`) | 3 | N |
| 2 | `payer_id` | 9 | N |
| 3 | `tax_year` | 4 | N |
| 4 | `recipient_id` (ת.ז./ח.פ.) | 9 | N |
| 5 | `classification_code` | 2 | N |
| 6 | `recipient_name` | 50 | H (Hebrew) |
| 7 | `certificate_no` | 12 | A |
| 8 | `cert_valid_from` | 8 | D (YYYYMMDD) |
| 9 | `cert_valid_to` | 8 | D |
| 10 | `rate_bp` (basis-points) | 4 | N |
| 11 | `gross_total` (₪ whole) | 12 | N |
| 12 | `tax_withheld` | 12 | N |
| 13 | `bituach_leumi_wh` | 12 | N |
| 14 | `health_tax_wh` | 12 | N |
| 15 | `net_paid` | 12 | N |
| 16 | `payment_count` | 5 | N |
| 17 | `first_payment_date` | 8 | D |
| 18 | `last_payment_date` | 8 | D |
| 19 | `filler` | 18 | A |

Trailer (record_type `999`) is also 208 chars — same width as data rows for parser simplicity, with a wider record_count (7) and totals (14 each).

Header line is the same width, padded — see `buildElectronicFile`.

---

## 6. XML envelope

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Report856 version="2026.1">
  <Header>
    <FormCode>856</FormCode>
    <TaxYear>2026</TaxYear>
    <PayerId>...</PayerId>
    <PayerName>...</PayerName>
    <TaxFile>...</TaxFile>
    <SubmissionType>initial</SubmissionType>
    <GeneratedAt>...</GeneratedAt>
  </Header>
  <Recipients>
    <Recipient>
      <RecipientId>...</RecipientId>
      <RecipientName>...</RecipientName>
      <ClassificationCode>02</ClassificationCode>
      <ClassificationLabel>CONSTRUCT</ClassificationLabel>
      <CertificateNo>...</CertificateNo>
      <CertValidFrom>2026-04-01</CertValidFrom>
      <CertValidTo>2027-03-31</CertValidTo>
      <AverageRate>0.0700</AverageRate>
      <GrossTotal>150000</GrossTotal>
      <TaxWithheld>10500</TaxWithheld>
      <BituachLeumiWithheld>0</BituachLeumiWithheld>
      <HealthTaxWithheld>0</HealthTaxWithheld>
      <NetPaid>139500</NetPaid>
      <PaymentCount>2</PaymentCount>
      <FirstPaymentDate>2026-03-15</FirstPaymentDate>
      <LastPaymentDate>2026-09-01</LastPaymentDate>
    </Recipient>
    ...
  </Recipients>
  <Summary>
    <RecordCount>...</RecordCount>
    <PaymentCount>...</PaymentCount>
    <GrossTotal>...</GrossTotal>
    <TaxWithheld>...</TaxWithheld>
    <BituachLeumiWithheld>...</BituachLeumiWithheld>
    <HealthTaxWithheld>...</HealthTaxWithheld>
    <NetPaid>...</NetPaid>
  </Summary>
</Report856>
```

UTF-8, no BOM. Paranoid `xmlEscape` (5-char subset) — zero injection risk.

---

## 7. Source-data wiring

### 7.1 `withholding_tax_certificates` table (cert-as-aggregate)

`api-server/src/routes/israeli-accounting-engine.ts:147-163` defines:
```sql
CREATE TABLE withholding_tax_certificates (
  certificate_number, vendor_id, vendor_name, vendor_tax_id,
  period, fiscal_year, total_payments, withholding_rate,
  withholding_amount, issued_date, sent_to_vendor, status
)
```

**Adapter:** `rowsFromCertificateTable(rows)` returns `{recipients, payments, certificates}` ready for `generate856(...)`. Each cert becomes one synthetic payment (cert_total = annual aggregate). Treats `withholding_rate > 1` as percent (`7` → `0.07`).

### 7.2 `contractor-payment-engine.ts` ledger (granular)

`api-server/src/routes/contractor-payment-engine.ts` writes per-project rows:
- `contractor_projects.final_amount` → gross
- `contractor_monthly_summary.withholding_tax` → withheld
- `contractor_profiles.tax_id`, `withholding_rate`, `contractor_type`

**Adapter:** `rowsFromContractorPayments(rows, profilesById)` rolls per-payment rows up. Maps `contractor_type` to a 856 classification:
- `painter | installer | production | construction` → `CONSTRUCT`
- `sales_agent | consultant | professional` → `PROF`
- `driver | transport` → `TRANSPORT`
- `landlord | rent` → `RENT`
- otherwise → `PROF`

### 7.3 Mixed-source flow

The aggregator never deletes data. Both adapters can be merged before `generate856`:
```js
const a = F.rowsFromCertificateTable(certRows);
const b = F.rowsFromContractorPayments(paymentRows, profiles);
F.generate856({
  year: 2026,
  payer: { ... },
  recipients: [...a.recipients, ...b.recipients],
  payments:   [...a.payments,   ...b.payments],
  certificates: [...a.certificates, ...b.certificates],
});
```

Empty-row suppression: `records.filter(r => r.payment_count > 0)` — vendors with zero in-year payments are dropped before serialization.

---

## 8. Smoke-test results

```
FORM: 856 version: 2026.1
records: 2 lines: 4 recordWidth: 208 trailerWidth: 208
summary.gross: 175000 withheld: 18000 net: 157000 paymentCount: 3
header.len: 208 data.len: 208 trailer.len: 208
XML[0..200]: <?xml version="1.0" encoding="UTF-8"?>
<Report856 version="2026.1"><Header><FormCode>856</FormCode>...
roundtrip first row: {"record_type":856,"recipient_id":300111222,
  "classification_code":2,"recipient_name":"Avi Painters Ltd",
  "certificate_no":"C-2026-001","gross_total":150000,
  "tax_withheld":10500,"net_paid":139500,"payment_count":2,...}
byClass: [{"code":"02","count":1,"gross":150000,"withheld":10500},
          {"code":"01","count":1,"gross":25000,"withheld":7500}]
adapter.cert: 1 1
adapter.pay: 1 CONSTRUCT
```

Verified:
- Aggregation: vendor `300111222` → 2 in-year payments → gross 150K, withheld 10.5K, count=2
- Trailer reconciles: 150K + 25K = 175K gross; 10.5K + 7.5K = 18K withheld
- All lines fixed at 208 chars (header, data, trailer)
- `parseDataLine` round-trips every numeric and string field
- `by_classification` correctly groups CONSTRUCT (`02`) and PROF (`01`)
- Both adapters return non-empty payments

---

## 9. Findings addressed (AGENT-133 carryover)

| # | Audit finding | Resolution |
|---|---|---|
| 1 | No `form-856.js` builder | **FIXED** — module created |
| 5 | `withholding_tax_certificates` has inputs but no aggregator | **FIXED** — `rowsFromCertificateTable` adapter |
| Source: `contractor-payment-engine.ts` ledger never aggregated | **FIXED** — `rowsFromContractorPayments` adapter |
| 856 vs 857 conflation | **FIXED** — distinct root (`Report856`), distinct form code, classification code field that 857 lacks |
| 8 | DB enum slot `'856'` reserved but never populated | Now ready — caller of `generate856()` can persist |

Out of scope (still pending, per AGENT-133):
- #2 — UI dead anchor (`href: "#"`) in `accounting-portal.tsx:1761` — NOT touched
- #3 — `tax-management.ts` `vat_856` mislabel — NOT touched
- #4 — windows-1255 encoder fallback — current XML is UTF-8; cp1255 fixed-width fallback can be added later via `iconv-lite` (already present in repo)
- #7 — actual SHAAM submission transport — system-wide gap

---

## 10. File path

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\onyx-procurement\src\tax\form-856.js`

---

*End of report — Agent 217 — 2026-04-29*
