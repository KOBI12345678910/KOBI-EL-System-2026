# AG-X47 — Israeli Withholding-Tax Form 857 (אישור ניכוי במקור) Processing Engine

**Agent:** X-47 (Swarm 3C)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/tax/form-857.js`
**Tests:** `test/payroll/form-857.test.js`
**Rules of engagement:** additive — nothing deleted, zero dependencies, Hebrew compliance.

---

## 0. Executive summary

| Deliverable                                                                                     | Status   |
|-------------------------------------------------------------------------------------------------|----------|
| `onyx-procurement/src/tax/form-857.js` — pure-JS withholding engine (zero deps)                 | created  |
| `test/payroll/form-857.test.js` — 35 test cases, all green                                      | created  |
| Integration with existing `onyx-procurement/src/tax-exports/form-857-xml.js`                    | delegates, fallback included |
| Hebrew compliance, zero deps, additive only                                                     | verified |
| Israeli 2026 statutory rates wired in                                                           | verified |

### Test run

```
ℹ tests 35
ℹ suites 0
ℹ pass 35
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~255
```

---

## 1. What the module does

`form-857.js` is a single-file, zero-dependency business-logic layer that
implements the full Israeli withholding-tax (ניכוי במקור) lifecycle for
non-employee payments:

1. **Certificate registry** — import, validate, and list per-vendor
   withholding certificates (`אישור ניכוי במקור`) with their
   `valid_from`/`valid_to` window.
2. **Rate resolution** — given `(vendor_id, service_type, date)` return
   the applicable rate, preferring a valid certificate over the statutory
   default.
3. **Payment computation** — compute `gross → withheld → net` per
   payment, with a derivation trail (`rule` enum) so an auditor can see
   *why* the rate was picked.
4. **Annual 857 aggregation** — group recorded payments by vendor and
   return per-vendor totals ready for filing.
5. **XML export** — delegate to the existing low-level
   `tax-exports/form-857-xml.js` generator when present, else emit a
   schema-compatible fallback XML (BOM + prolog + `<Report857>` + rows).
6. **Form 102 tie-in** — compute the monthly total of contractor
   withholding and emit a row ready to be merged into the 102 payload.
7. **Certificate expiry tracking** — list certificates expiring within
   `daysAhead` days, sorted ascending; already-expired certs are
   excluded.
8. **API stub for tax authority** — an async `validateCertificateViaApi`
   that can be swapped for a real endpoint; default implementation
   answers from the local registry.

The module sits **on top of** (not in place of) the existing
`src/tax-exports/form-857-xml.js` serializer — that file is untouched.
Loading is done via lazy `require` with a try/catch fallback so the
business-logic module also works standalone.

---

## 2. File layout

```
onyx-procurement/src/tax/form-857.js         710 lines, pure Node, no deps
test/payroll/form-857.test.js                490 lines, node --test
```

Both files are pure JavaScript, require only Node built-ins (`node:test`,
`node:assert/strict`, `path`), and pass `node --test` under Node 18+.

---

## 3. Public API

All exports are attached to the default module singleton; a
`createEngine({ logger?, apiVerify? })` factory is re-exported for
isolated instances (used in every test):

```js
const f857 = require('onyx-procurement/src/tax/form-857');

// Constants
f857.SERVICE_TYPES             // 13-entry enum
f857.DEFAULT_RATES             // statutory 2026 rates (decimals)
f857.RULES                     // derivation-trail enum
f857.SMALL_AMOUNT_THRESHOLD_NIS // 5200

// Certificates
f857.importCertificate(vendorId, certData)          // stores cert
f857.validateCertificate(certData)                  // { valid, reason, errors }
f857.listCertificates([vendorId])                   // read-out
f857.expiringCerts(daysAhead [, fromDate])          // [{..., days_until_expiry}]
f857.validateCertificateViaApi(vendorId)            // Promise, stubbed

// Payments
f857.getWithholdingRate(vendorId, serviceType, date) // → number
f857.computeWithholding(payment)                     // → {gross, withheld, net, rate, rule}
f857.recordPayment(payment)                          // stored ledger row
f857.listPayments({vendor_id?, year?, type?})

// Annual
f857.annualReport(year [, vendorId])                 // 857 object | list
f857.exportXmlTaxAuthority(year, options)            // XML string

// Form 102
f857.tieInto102(year, month)                         // monthly remittance row

// Maintenance
f857.reset()                                         // clears registry + ledger
f857.stats()
f857.createEngine({logger?, apiVerify?})
```

---

## 4. Israeli 2026 statutory rates used

Values are decimals (0.30 = 30%) and come from the Agent-34
`ISRAELI_TAX_CONSTANTS_2026.md` reference plus the underlying
`תקנות מס הכנסה (ניכוי משירותים…)` regulations:

| Service type (`SERVICE_TYPES.*`)          | Default rate | Source / note |
|-------------------------------------------|--------------|---------------|
| `PROFESSIONAL` — עו"ד, רו"ח, רופא          | **30%**      | תקנות הניכוי — default professional |
| `CONSTRUCTION` — עבודות בנייה             | **5%**        | תקנות הניכוי — with valid cert → 3% |
| `CONSTRUCTION_SMALL`                      | **3%**        | small scope |
| `TRANSPORTATION` — הובלות                 | **5%**        | תקנות הניכוי |
| `LOTTERY` — זכיות                         | **25%**       | סעיף 124 |
| `RENT` — דמי שכירות                       | **20%**       | תקנות הניכוי |
| `DIVIDENDS` — לתושב                        | **25%**       | סעיף 125ב |
| `DIVIDENDS_FOREIGN` — לתושב חוץ            | **25%**       | pre-treaty, may be reduced |
| `INTEREST` — ריבית                         | **25%**       | סעיף 125ג |
| `ROYALTIES` — תמלוגים                     | **25%**       | סעיף 170 |
| `AGRICULTURE` — תוצרת חקלאית               | **5%**        | תקנות הניכוי |
| `ASSETS` — מכירת נכסים                    | **30%**       | fallback |
| `OTHER`                                   | **30%**       | final fallback |

Small-amount exemption threshold: **NIS 5,200** (approximated from
תקנה 3; callers may override via `small_amount_exempt: true` on the
payment). Statutory types (lottery/dividends/rent/interest/royalties)
are **not** eligible for the small-amount exemption even with the flag.

---

## 5. Derivation trail (`rule` enum)

Every `computeWithholding` result carries a `rule` string — a compact,
grep-able code explaining exactly which branch of the decision tree
fired:

| Rule                            | Meaning |
|---------------------------------|---------|
| `no_certificate_default_rate`   | no cert found → statutory default |
| `valid_certificate_reduced_rate`| active cert, rate < default |
| `valid_certificate_zero_rate`   | active cert, rate = 0 (exemption) |
| `certificate_expired_default_rate` | cert found but payment date > `valid_to` |
| `certificate_not_yet_valid_default_rate` | cert found but payment date < `valid_from` |
| `certificate_type_mismatch_default_rate` | cert for a different service type |
| `small_amount_exempt`           | `small_amount_exempt: true` flag applied |
| `statutory_override`            | reserved — for future legislative carve-outs |

This gives an auditor a one-glance explanation for any historical payment
and is unit-tested for the main branches (tests 11, 12, 13).

---

## 6. Data model

### 6.1 VendorCertificate

```js
{
  vendor_id:      '514444442',      // 9-digit business ID
  certificate_no: 'CRT-0012345',    // מספר אישור ניכוי במקור
  rate:           0.05,             // 0.00 – 0.50
  valid_from:     '2026-04-01',     // ISO date
  valid_to:       '2027-03-31',     // ISO date (Israeli fiscal year)
  type:           'professional',   // SERVICE_TYPES enum
  issuer:         'פקיד שומה ת"א 1',
  notes:          '',
  imported_at:    '2026-04-11T12:00:00.000Z'
}
```

### 6.2 PaymentWithholding (ledger row)

```js
{
  payment_id: 'INV-2026-00012',
  vendor_id:  '514444442',
  date:       '2026-06-15',
  gross:      20000,
  withheld:    1000,   // 5%
  net:        19000,
  rate:       0.05,
  type:       'professional',
  rule:       'valid_certificate_reduced_rate',
  certificate_no: 'CRT-0012345',  // only when a cert was used
  recorded_at: '2026-04-11T12:00:00.000Z'
}
```

### 6.3 Annual857

```js
{
  year: 2026,
  vendor_id: '514444442',
  certificate_no: 'CRT-0012345',
  total_paid:     28000,
  total_withheld:  1400,
  total_net:      26600,
  payment_count:     2,
  average_rate:    0.05,
  payments: [ ...PaymentWithholding ]
}
```

---

## 7. Integration points

| Touch point                                              | Direction   | How |
|----------------------------------------------------------|-------------|-----|
| `onyx-procurement/src/tax-exports/form-857-xml.js`       | consumes    | `require('../tax-exports/form-857-xml')` inside `exportXmlTaxAuthority`. Lazy, wrapped in try/catch — if unavailable, falls back to an inline schema-compatible XML builder so the module remains standalone. |
| `onyx-procurement/src/tax-exports/form-102-xml.js`       | feeds       | `tieInto102(year, month)` returns a `form_102_row` object in exactly the shape the 102 XML generator expects inside `data.incomeTax`. |
| `ISRAELI_TAX_CONSTANTS_2026.md`                          | references  | All default rates cross-checked against this document. |
| `onyx-procurement/src/validators/tax-file.js`            | consumes    | Optional — engine uses its own regex check for 7-9 digit IDs but can be swapped to the full Luhn-style Israeli ID checker provided by the existing validator. |

No files were modified, renamed, or deleted. The new module is purely
additive and lives in `src/tax/`, alongside the existing
`annual-tax-routes.js` and `form-builders.js`.

---

## 8. Test coverage — 35 cases, all passing

```
✔  1. getWithholdingRate defaults to 30% for professional
✔  2. getWithholdingRate returns 5% transportation / 25% lottery / 20% rent
✔  3. getWithholdingRate uses a valid certificate rate
✔  4. getWithholdingRate falls back to default when cert expired
✔  5. getWithholdingRate falls back when cert is not yet valid
✔  6. getWithholdingRate ignores cert when service type mismatches
✔  7. computeWithholding: arithmetic correct (gross / withheld / net)
✔  8. computeWithholding: small_amount_exempt flag → 0 withholding
✔  9. computeWithholding: throws on missing vendor_id
✔ 10. computeWithholding: throws on negative gross
✔ 11. computeWithholding: rule CERT_VALID_REDUCED + carries cert number
✔ 12. computeWithholding: rule CERT_EXPIRED after valid_to
✔ 13. computeWithholding: rule CERT_TYPE_MISMATCH
✔ 14. computeWithholding: rounds to 2 decimal places
✔ 15. validateCertificate: rejects missing fields
✔ 16. validateCertificate: rejects rate > 0.5
✔ 17. validateCertificate: rejects valid_to < valid_from
✔ 18. validateCertificate: accepts a well-formed record
✔ 19. importCertificate: stores and lists back
✔ 20. importCertificate: throws on invalid input
✔ 21. expiringCerts: returns certs expiring within window
✔ 22. expiringCerts: excludes already-expired certificates
✔ 23. expiringCerts: sorted ascending by days_until_expiry
✔ 24. annualReport(year): aggregates multi-vendor totals
✔ 25. annualReport(year, vendor): filters to one vendor
✔ 26. annualReport returns empty skeleton for unknown vendor
✔ 27. exportXmlTaxAuthority: produces BOM + <Report857>
✔ 28. exportXmlTaxAuthority: XML contains recipient ids
✔ 29. tieInto102: sums gross + withheld for given month
✔ 30. tieInto102: counts unique vendors
✔ 31. validateCertificateViaApi: returns valid=true on active cert
✔ 32. validateCertificateViaApi: returns valid=false when no cert
✔ 33. DEFAULT_RATES match Israeli 2026 reference values
✔ 34. SMALL_AMOUNT_THRESHOLD_NIS is set
✔ 35. reset() clears all engine state
```

Run command:

```
node --test test/payroll/form-857.test.js
```

---

## 9. Hebrew compliance

- Doc comments, field labels, and enum notes all reference the Hebrew
  statutory names (`אישור ניכוי במקור`, `תקנות מס הכנסה`, service-type
  descriptions in Hebrew).
- XML output preserves UTF-8 BOM + explicit UTF-8 prolog so Hebrew
  recipient names survive round-trip to the רשות המסים portal.
- Error messages are English (by convention of the existing tax code
  under `src/tax-exports/`), but each error corresponds to a Hebrew
  regulatory concept documented in this report.

---

## 10. Zero-deps attestation

| File                                       | Dependencies |
|--------------------------------------------|--------------|
| `onyx-procurement/src/tax/form-857.js`     | none (only optional lazy `require` of a sibling file in the same repo) |
| `test/payroll/form-857.test.js`            | `node:test`, `node:assert/strict`, `path` (Node built-ins only) |

`package.json` was **not** touched.

---

## 11. Known limitations / TODO for a real-world deployment

1. **`apiVerify` stub** — the tax-authority API is stubbed to return the
   local registry. In production, wire it to the real endpoint at
   `https://www.misim.gov.il/` and memoize responses with a short TTL.
2. **Persistence** — the registry + ledger are in-memory. Production
   should inject a `store` object (Postgres / SQLite) via `createEngine`.
3. **Treaty-reduced rates** — foreign dividends/interest/royalties
   currently use the un-reduced statutory rate. When the ERP wires in
   the treaty-lookup table, plug it into `getWithholdingRate` behind a
   new `jurisdiction` parameter.
4. **VAT interaction** — withholding is computed on the pre-VAT gross,
   matching the Israeli convention. The payment object can carry a
   `vat` field for bookkeeping; it is echoed back but not re-computed.
5. **Leap-year March 31** — certificate validity currently uses literal
   dates, so a cert spanning a leap-year February is handled correctly
   by the Date-based comparison logic.

---

## 12. Sign-off

- **Never deleted** — verified via `git status` before commit.
- **Zero deps** — verified via explicit audit of `require()` calls.
- **35/35 tests green** — verified via `node --test` run above.
- **Hebrew compliance** — verified via manual review of doc comments
  and the UTF-8 XML fallback output.

— Agent X-47 / Swarm 3C — 2026-04-11
