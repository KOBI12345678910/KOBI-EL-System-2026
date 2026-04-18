# AG-Y047 — Lease Tracker (חוזי שכירות)

**Module**: `onyx-procurement/src/realestate/lease-tracker.js`
**Tests**:  `onyx-procurement/test/realestate/lease-tracker.test.js`
**Status**: Implemented — 24 / 24 tests passing (Node `--test`)
**Rule**: לא מוחקים רק משדרגים ומגדלים (never delete — only upgrade/grow)
**Wave**: Y — Real Estate / Construction / Israeli Lease Law
**Dependencies**: Zero external — pure Node built-ins only
**Bilingual**: Hebrew + English throughout (errors, API docs, PDF output)

---

## 1. Purpose

Tracks Israeli residential and commercial lease agreements (חוזי שכירות) across
their full life-cycle: creation, CPI / dollar / fixed indexation of monthly rent
(תוספת הצמדה), guarantor and guarantee management, early termination, renewal,
protected-tenancy / key-money tracking (דיירות מוגנת / דמי מפתח), Fair Rental Law
compliance (חוק שכירות הוגנת), statutory notice periods, and Hebrew-RTL lease
PDF generation.

Every mutation is **append-only**. Terminations, renewals, and Fair-Rental-Law
adjustments are stored in arrays that are never pruned. A separate audit log
(`history`) captures every action with timestamp. No method deletes records —
only upgrades them.

---

## 2. Public API

Exported from `src/realestate/lease-tracker.js`:

| Export                | Kind     | Purpose                                            |
| --------------------- | -------- | -------------------------------------------------- |
| `LeaseTracker`        | class    | Main tracker; the default export as well           |
| `LEASE_STATUS`        | enum     | `draft / active / renewed / expired / terminated_early / protected_tenancy` |
| `INDEXATION_TYPES`    | enum     | `cpi / fixed / dollar-linked / none`              |
| `GUARANTEE_TYPES`     | enum     | `check / bank-guarantee / promissory-note / deposit` |
| `FAIR_RENTAL_LAW`     | consts   | Statutory caps & notice-day thresholds            |

### Constructor options

```js
new LeaseTracker({
  cpiProvider: (yyyyMm) => number,        // optional; default uses internal table
  fxProvider:  (ccy, yyyyMm) => number,   // optional
  cpiTable:    { 'YYYY-MM': number },     // initial seed for CPI
  fxTable:     { 'USD:YYYY-MM': number }, // initial seed for FX
  defaults:    { currency, indexation },
});
```

### Methods

| Method                                         | Contract                                       |
| ---------------------------------------------- | ---------------------------------------------- |
| `createLease(spec)`                            | Validate & store a new lease                   |
| `computeRent(leaseId, month)`                  | Return indexed rent for a given month          |
| `registerGuarantee({leaseId,type,amount,…})`   | Attach guarantee; enforces Fair Rental cap     |
| `renewLease(leaseId, newEndDate, newRent)`     | Append a renewal; rebases indexation           |
| `terminateEarly(leaseId, reason, penalty)`     | Mark terminated; lease record is NOT deleted   |
| `noticePeriod(leaseId)`                        | Days of notice per contract + Israeli law      |
| `keyMoneyTracking({leaseId, keyMoney, …})`     | Protected-tenancy key-money record             |
| `sheltermaxLaw(leaseId, adjustment)`           | Append Fair Rental Law adjustment              |
| `generateLeaseHebrewPDF(leaseId)`              | Build minimal PDF 1.4 buffer                   |
| `getLease(id) / listLeases() / getHistory()`   | Read-only accessors (defensive copies)         |

---

## 3. Indexation formulas (תוספת הצמדה)

### 3.1  CPI (הצמדה למדד המחירים לצרכן)

```
newRent_t  =  baseRent  ×  (CPI_t  /  CPI_base)
```

Where:
- `baseRent` = the nominal rent agreed at contract signing (שקלי בסיס).
- `CPI_base` = מדד המחירים לצרכן at the contract start month.
- `CPI_t`    = מדד המחירים לצרכן at the billing month `t`.

The tracker captures `CPI_base` as `lease.indexBase = {type:'cpi', yyyyMm, value}`
at `createLease` time, so a later change in any external CPI feed cannot
retroactively falsify historical billings.

**Israeli convention**: most residential leases lock the CPI base to the
"מדד הידוע ביום חתימת החוזה" (the CPI known on signing day), which in practice
lags by one month. Clients can pass `indexBase` explicitly to override.

### 3.2  Dollar-linked (הצמדה לדולר)

```
newRent_t  =  baseRent  ×  (USDILS_t  /  USDILS_base)         // ILS lease
newRent_t  =  baseRent                                         // USD lease (nominal)
```

For **ILS leases linked to USD**, the nominal rent paid in shekels tracks the
shekel-dollar exchange-rate change since signing. For **USD leases**, the rent
stays nominal in USD and the tracker reports an `ilsEquivalent` using the
current FX rate — useful for GL postings and VAT reports.

### 3.3  Fixed / none

```
newRent_t  =  baseRent
```

Flat contract — typically used for short-term leases (<12 months) where
indexation is legally unnecessary.

### 3.4  Fair-Rental-Law adjustments

After the basic indexed rent is computed, `computeRent` applies any
`sheltermaxLaw` adjustments whose `effectiveFrom <= month` by adding their
signed `delta`. This allows for:

- **habitability-credit** — rent reduction while a defect is unrepaired past
  the 30-day statutory grace period (ליקוי לא מתוקן).
- **defect-repair** — one-off deduction for tenant-paid urgent repairs
  (סעיף 25ו — תיקון דחוף תוך 3 ימים).
- **rent-reduction** — ongoing reduction per arbitrator ruling.
- **compliance-fine** — landlord penalty for non-disclosure.
- **deposit-refund** — post-vacate adjustment.
- **notice-cure** — cure period credit.

Adjustments are append-only; each includes a compliance report snapshot.

---

## 4. Israeli tenant-law notes

### 4.1  Applicable statutes

| Statute                                                      | Shorthand              | Scope                          |
| ------------------------------------------------------------ | ---------------------- | ------------------------------ |
| חוק השכירות והשאילה, התשל"א-1971                           | Rental & Loan 1971     | Base rental framework          |
| חוק הגנת הדייר [נוסח משולב], התשל"ב-1972                   | Protected Tenancy 1972 | Old contracts / דמי מפתח       |
| חוק השכירות והשאילה (תיקון מס' 2) התשע"ז-2017              | Fair Rental 2017       | Residential caps & habitability |
| תקנות מס הכנסה – הנחות בשכר דירה                            | Tax regulations        | Income exemption ceilings      |

### 4.2  Fair Rental Law caps (residential only, non-protected)

Encoded in the `FAIR_RENTAL_LAW` constant:

| Parameter                             | Value                                  |
| ------------------------------------- | -------------------------------------- |
| `MAX_DEPOSIT_MONTHS`                  | 3 × monthly rent (פיקדון ≤ 3 חודשים)   |
| `MAX_GUARANTEE_MONTHS`                | 3 × monthly rent (סך בטחונות)          |
| `MIN_NOTICE_DAYS_RESIDENTIAL`         | 60 days before end-of-lease            |
| `MIN_NOTICE_DAYS_COMMERCIAL`          | 90 days (practice + common law)        |
| `HABITABILITY_DEFECT_REPAIR_DAYS`     | 30 days to cure ordinary defect        |
| `URGENT_DEFECT_REPAIR_DAYS`           | 3 days to cure urgent defect           |

Validation:
- `createLease` rejects residential leases with `deposit > 3 × monthlyRent`.
- `registerGuarantee` rejects if cumulative `deposit + active guarantees`
  would exceed the 3-month cap.
- Protected-tenancy leases are exempt from these caps (statutory override).

### 4.3  Protected tenancy / key money (דיירות מוגנת / דמי מפתח)

Tenants on pre-1972 contracts (or post-1972 commercial protected tenancies)
paid key money up front and enjoy statutory rent protection. On vacating, the
landlord keeps a regulated share (default 1/3) and refunds the remainder:

```
tenantRefund    =  keyMoney  ×  (1 − landlordShare)
landlordRetain  =  keyMoney  ×  landlordShare
```

Shares differ by contract type (residential vs commercial) and between
original tenant and successive sub-tenants (דייר משנה). The tracker accepts
a custom `landlordShare` between 0 and 1 for flexibility.

### 4.4  Notice period — `noticePeriod(leaseId)`

Returns `max(contractual notice, statutory minimum)`, reflecting the Israeli
rule that contractual terms can **extend** notice periods but cannot shorten
them below the statutory floor for residential leases.

---

## 5. Test coverage

Test file: `onyx-procurement/test/realestate/lease-tracker.test.js`
Total: **24 tests**, all passing.

| # | Suite area          | Test                                                                           |
| - | ------------------- | ------------------------------------------------------------------------------ |
| 1 | createLease         | stores a valid residential lease                                               |
| 2 | createLease         | rejects missing property or tenant                                             |
| 3 | createLease         | rejects non-positive rent                                                      |
| 4 | createLease         | rejects endDate not after startDate                                            |
| 5 | createLease         | rejects invalid indexation / currency                                          |
| 6 | createLease         | rejects deposit exceeding Fair Rental Law cap (residential)                   |
| 7 | computeRent         | applies CPI indexation correctly                                               |
| 8 | computeRent         | with no indexation returns base rent unchanged                                 |
| 9 | computeRent         | applies dollar-linked indexation on ILS lease                                  |
| 10| computeRent         | for USD lease stays in USD nominal, reports ILS equivalent                     |
| 11| registerGuarantee   | attaches guarantees and validates type                                         |
| 12| registerGuarantee   | rejects invalid type                                                           |
| 13| registerGuarantee   | enforces Fair Rental Law total cap                                             |
| 14| renewLease          | appends to renewals and updates terms; rebases indexation                      |
| 15| renewLease          | rejects earlier endDate                                                        |
| 16| terminateEarly      | appends termination entry without deleting lease                               |
| 17| terminateEarly      | rejects lease already terminated                                               |
| 18| noticePeriod        | returns statutory minimum for residential                                      |
| 19| noticePeriod        | returns contractual when longer (commercial)                                   |
| 20| keyMoneyTracking    | marks lease as protected and computes refund                                   |
| 21| sheltermaxLaw       | records adjustments and is append-only (also verified via computeRent)         |
| 22| sheltermaxLaw       | rejects unknown adjustment type                                                |
| 23| generateLeaseHebrewPDF | returns a well-formed PDF 1.4 buffer with RTL metadata                      |
| 24| history             | captures every mutation and is never pruned                                    |

Run locally:
```
cd onyx-procurement
node --test test/realestate/lease-tracker.test.js
```

---

## 6. Hebrew glossary (מילון מונחים)

| English                        | Hebrew                           | Transliteration          |
| ------------------------------ | -------------------------------- | ------------------------ |
| Lease / rental contract        | חוזה שכירות                       | `choze schirut`          |
| Landlord                       | משכיר                             | `maskir`                 |
| Tenant                         | שוכר                              | `soker`                  |
| Monthly rent                   | דמי שכירות חודשיים                 | `dmei schirut chodshiim` |
| Deposit                        | פיקדון                            | `pikadon`                |
| Bank guarantee                 | ערבות בנקאית                      | `arvut bankait`          |
| Guarantor                      | ערב                               | `arev`                   |
| Promissory note                | שטר חוב                           | `shtar chov`             |
| Post-dated check               | שיק דחוי                          | `check dachui`           |
| Indexation / linkage           | הצמדה                             | `hatzmada`               |
| CPI                            | מדד המחירים לצרכן                  | `madad mechirim latzarchan` |
| Known index                    | מדד הידוע                         | `madad hayadua`          |
| Basis index                    | מדד בסיס                          | `madad basis`            |
| Dollar-linked                  | צמוד דולר                         | `tzamud dolar`           |
| Fair Rental Law                | חוק שכירות הוגנת                   | `chok schirut hogenet`   |
| Protected tenancy              | דיירות מוגנת                      | `dayarut muganet`        |
| Key money                      | דמי מפתח                          | `dmei mafteach`          |
| Notice period                  | תקופת הודעה מוקדמת                 | `tkufat hodaa mukdemet`  |
| Renewal option                 | אופציית הארכה                     | `optzyat haarakha`       |
| Early termination              | סיום מוקדם                        | `siyum mukdam`           |
| Penalty                        | פיצוי מוסכם                       | `pitzui muskam`          |
| Habitability defect            | ליקוי באכלוסיות                   | `likui be-echlusiyut`    |
| Urgent repair                  | תיקון דחוף                        | `tikun dachuf`           |
| Property                       | נכס                               | `nechess`                |
| Tax ID / ID number             | תעודת זהות                        | `teudat zehut`           |
| Commercial lease               | שכירות מסחרית                     | `schirut mis'charit`     |
| Residential lease              | שכירות למגורים                    | `schirut le-megurim`     |

---

## 7. Hebrew RTL PDF generator

`generateLeaseHebrewPDF(leaseId)` emits a minimal, self-contained PDF 1.4
buffer (Helvetica base font) containing the lease in structured form with
Hebrew labels transliterated alongside English. The output is a `Buffer`
plus a `text` string and metadata (`{direction:'rtl', language:'he', ...}`).

### Current limitation

PDF 1.4 built-in Type-1 fonts (Helvetica / Times / Courier) do not include
Hebrew glyphs in the WinAnsi / StandardEncoding code-pages. The writer
therefore emits readable ASCII-transliterated Hebrew (e.g. `choze schirut`)
so the PDF is guaranteed-valid with zero external dependencies.

### Upgrade path (never delete — only upgrade/grow)

To render true Hebrew glyphs, swap the font object in `_renderHebrewLeaseLines`
for an embedded TTF (e.g. `Alef-Regular.ttf`, `Heebo-Regular.ttf`) via an
`/Type /Font /Subtype /TrueType /FontDescriptor …` object. The refactor is
localized to `generateLeaseHebrewPDF` — callers (`text`, `metadata`) stay
stable. A follow-up ticket (**AG-Y047b — TTF embedding**) will deliver the
glyph-rendering upgrade.

---

## 8. Compliance checklist

- [x] Zero external dependencies (uses only `node:test`, `node:assert`, `Buffer`, `Math`, `Date`, `Map`).
- [x] All methods validate inputs with Hebrew + English error messages.
- [x] `createLease` rejects Fair-Rental-cap violations at entry.
- [x] `registerGuarantee` enforces cumulative-guarantee cap at each addition.
- [x] `terminateEarly` never deletes a lease; always appends a `terminations` entry.
- [x] `renewLease` preserves `previousEndDate / previousRent` and rebases index.
- [x] `sheltermaxLaw` adjustments are append-only and affect `computeRent` only from `effectiveFrom`.
- [x] `keyMoneyTracking` flips status to `protected_tenancy` and persists the record.
- [x] Full audit log in `history` — not pruned, not filtered.
- [x] Hebrew RTL PDF generated with `{direction:'rtl', language:'he'}` metadata.
- [x] Test suite 24/24 green under `node --test`.
- [x] Bilingual public API — JSDoc and error messages carry Hebrew equivalents.

---

## 9. Next upgrades (growth, not replacement)

1. **AG-Y047b — TTF font embedding** for true Hebrew glyph rendering in PDF.
2. **AG-Y047c — GL postings bridge** — emit monthly rent journal entries via
   `onyx-procurement/src/gl/…` so the ERP recognizes rent receivable
   automatically.
3. **AG-Y047d — CPI feed** — wire the Bank of Israel / CBS CPI REST feed into
   `cpiProvider`, replacing the seed table.
4. **AG-Y047e — Property register linking** — cross-link `propertyId` to
   `onyx-procurement/src/realestate/property-register.js` (future module).
5. **AG-Y047f — Tenant portal** — surface `getLease`, `computeRent`, and
   statement generation to `customer-portal/`.
6. **AG-Y047g — Protected-tenant landlord-share table** — replace the
   default 1/3 with a table indexed by contract age, tenancy type, and tenant
   sequence (original tenant vs successor).

Each upgrade extends but does not delete the current API.
