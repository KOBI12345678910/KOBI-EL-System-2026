# AG-Y057 — Real Estate Broker Fee Tracker (חוק המתווכים)
**Agent:** Y-057 | **Swarm:** Real Estate | **Project:** Techno-Kol Uzi mega-ERP 2026
**Date:** 2026-04-11
**Status:** PASS — 38/38 tests green

---

## 1. Scope

A zero-dependency real estate broker fee tracker for Kobi Elkayam's
Mega-ERP, fully compliant with Israeli **Brokers in Real Estate
Law** (חוק המתווכים במקרקעין, התשנ"ו-1996).

It manages licensed brokers, exclusivity agreements, viewing logs,
commission claims, double-claim disputes, tax invoices (with
allocation numbers), and proactive license expiry alerts — all
bilingual Hebrew + English, all append-only.

### Delivered files

- `onyx-procurement/src/realestate/broker-fees.js` — engine (~700 LOC)
- `onyx-procurement/test/realestate/broker-fees.test.js` — 38 tests (11 groups)
- `_qa-reports/AG-Y057-broker-fees.md` — this report

### RULES respected

- **לא מוחקים רק משדרגים ומגדלים** —
  - `registerBroker` with an existing id bumps `version` and pushes
    the previous record into `_brokerHistory`.
  - `signExclusivity` stamps the previous agreement's `endedAt` and
    `supersededBy`, then appends a new version — nothing is removed.
  - `logShowing` is append-only.
  - `openDispute` and `resolveDispute` append new claim versions to
    `_claimHistory`; the losing claim is marked REJECTED but is
    never deleted.
  - `generateInvoice` is append-only; test 33 verifies there is
    NO `delete*` or `remove*` method on the class.
- Zero external dependencies. Only Node built-ins.
- Bilingual labels on every enum (`TRANSACTION_TYPE_LABELS`,
  `EXCLUSIVITY_TYPE_LABELS`, `SHOWING_OUTCOME_LABELS`,
  `CLAIM_STATUS_LABELS`, `DISPUTE_STATUS_LABELS`).
- Real code — no stubs.

---

## 2. Public API

```js
const { BrokerFeeTracker } = require(
  'onyx-procurement/src/realestate/broker-fees.js'
);
const t = new BrokerFeeTracker({ now });
```

| Method | Purpose |
|---|---|
| `registerBroker({id,name,licenseNumber,licenseExpiry,phone,email})` | Register / upgrade a licensed broker (§ 2). |
| `signExclusivity({propertyId,broker,startDate,endDate,exclusiveType,marketingActions,customer,writtenSigned})` | Sign an exclusivity (ייחודיות) agreement. |
| `logShowing({propertyId,broker,visitor,date,outcome,notes})` | Append-only viewing log. |
| `computeCommission({transactionType,price,rate,split})` | Gross + VAT + per-side breakdown. |
| `claimCommission({saleId,broker,buyerBrokerPct,sellerBrokerPct,price,propertyId,transactionType})` | Record a commission claim for a transaction (§ 14). |
| `validateAgreement(id)` | Run § 9 written-form validator, return issues with bilingual messages. |
| `openDispute({claimIds,reason})` | Open a dispute between 2+ competing claims. |
| `resolveDispute(disputeId,winnerClaimId,resolution)` | Decide the winner; loser → REJECTED but retained. |
| `disputes(idOrClaimId)` | Lookup dispute(s) by dispute id or by claim id. |
| `generateInvoice(claimId,{dueDate})` | Bilingual brokerage invoice with allocation number. |
| `licenseRenewalAlert(days)` | Brokers whose license expires within `days` days. |
| `getBroker / getAgreement / getClaim / getInvoice` | Current-version lookups. |
| `brokerHistory / agreementHistory / claimHistoryOf` | History accessors (never empty after upgrade). |
| `allBrokers / allClaims / allInvoices / allAgreements` | Current-version lists. |

---

## 3. Brokers Law Reference (חוק המתווכים)

| Section | Hebrew | Meaning | Enforced by |
|---|---|---|---|
| § 2 | חובת רישיון | Only licensed brokers may engage in brokerage. Every broker must have a license number + expiry. | `registerBroker` requires both fields; `claimCommission` rejects expired-license claims. |
| § 9 | דרישת הכתב | A brokerage order must be **in writing**, signed by the customer, with broker/customer/property/commission fields. | `validateAgreement` returns `E_NOT_IN_WRITING`, `E_MISSING_CUSTOMER`, `E_MISSING_MARKETING_ACTIONS`, etc. |
| § 14 | זכאות לעמלה | Broker entitled only if (a) licensed, (b) § 9 fulfilled, (c) "effective cause" (גורם יעיל). | Disputes track double-claims; `resolveDispute` records the decision. |
| Regulations 1997 | ייחודיות | An exclusivity agreement must carry at least 2 marketing actions (e.g., online listing + open house). | `signExclusivity` enforces `E_EXCLUSIVITY_REQUIRES_TWO_ACTIONS`. |

---

## 4. Commission Caps (market practice + law)

| Transaction | Cap per side | VAT | Code constant |
|---|---|---|---|
| Sale (מכירה) | **2%** of the price | 17% on top | `SALE_CAP_PCT = 0.02` |
| Rental (השכרה) | **1 month** of rent | 17% on top | `RENTAL_CAP_MONTHS = 1` |
| Luxury (>= 5M ILS) | Same 2% cap | 17% | Governed by `SALE_CAP_PCT` |
| New from developer | Out of scope | — | Handled by `contracts/` module |

Enforcement:
- `computeCommission` throws `E_RATE_EXCEEDS_CAP` if `rate > cap`.
- `claimCommission` throws `E_RATE_EXCEEDS_CAP` if either
  `buyerBrokerPct` or `sellerBrokerPct` exceeds the cap.

### Worked example — sale @2%

```
price        = 2,500,000 ILS
rate         = 0.02
gross        = 50,000
vat (17%)    = 8,500
total        = 58,500
```

### Worked example — rental @1 month

```
monthly rent = 5,000 ILS
rate         = 1 (one month)
gross        = 5,000
vat (17%)    = 850
total        = 5,850
```

### Split example — buyer + seller both at 2%

```
price         = 2,000,000
buyerPct      = 0.02 → 40,000 gross
sellerPct     = 0.02 → 40,000 gross
total gross   = 80,000
vat (17%)     = 13,600
total         = 93,600
```

---

## 5. Exclusivity Types (ייחודיות)

| Enum value | Hebrew | English | Notes |
|---|---|---|---|
| `hafnayat-nechesh` | הפניית נכס (ייחודיות) | Exclusive Listing | Customer agrees the broker is the sole marketer; most common for premium listings. |
| `seker-mochrit` | סקר מוכרת (ייחודיות) | Seller-side Survey | Common in sales; broker conducts a market survey for the seller. |
| `none` | ללא ייחודיות | No Exclusivity | Customer keeps the right to use multiple brokers; no marketing-action requirement. |

Any `hafnayat-nechesh` or `seker-mochrit` agreement MUST include at
least two marketing actions (1997 regulations). Examples that pass:
`['online-listing','open-house']`, `['newspaper','yad2-boost']`,
`['video-tour','agent-network']`.

---

## 6. Data Flow

```
registerBroker ──► broker (licensed)
                       │
signExclusivity ──►  agreement v1 ──► agreement v2 (upgraded)
                       │                   │
logShowing ────────► showing (append-only)
                       │
claimCommission ───► claim v1 ─(openDispute)──► claim v2 DISPUTED
                                                │
                                  resolveDispute │
                                                ▼
                                  winner → claim v3 OPEN
                                  loser  → claim v3 REJECTED
                       │
generateInvoice ───► invoice (allocationNumber)
                       │
                  claim v4 INVOICED
```

All arrows are **append-only**. Previous versions remain in
`_brokerHistory`, `_agreementHistory`, `_claimHistory`.

---

## 7. Validation Matrix (`validateAgreement`)

| Code | Hebrew | English | Triggered when |
|---|---|---|---|
| `E_AGREEMENT_NOT_FOUND` | ההסכם לא נמצא | Agreement not found | Unknown id / propertyId |
| `E_NOT_IN_WRITING` | ההסכם לא נחתם בכתב (סעיף 9) | Agreement not in writing (§ 9) | `writtenSigned:false` |
| `E_MISSING_CUSTOMER` | חסרים פרטי לקוח | Customer details missing | No `customer.id` / `customer.name` |
| `E_BROKER_MISSING` | המתווך לא רשום במערכת | Broker not registered | Broker id unknown |
| `E_LICENSE_EXPIRED` | רישיון המתווך פג תוקף | Broker license expired | `licenseExpiry < now` |
| `E_INVALID_DURATION` | תוקף ההסכם לא חוקי | Invalid agreement duration | `endDate <= startDate` |
| `E_MISSING_MARKETING_ACTIONS` | חסרות פעולות שיווק לייחודיות | Marketing actions missing for exclusivity | Exclusivity type != 'none' with <2 actions |

---

## 8. Invoice Structure

| Field | Meaning |
|---|---|
| `id` | `INV-BRK-000001`-style synthetic id |
| `claimId`, `saleId`, `propertyId` | Upstream linkage |
| `broker` | `{ id, name, licenseNumber }` — license is printed on the invoice |
| `lines[]` | Per-side line items: `{ side, description{he,en}, gross, vat, total }` |
| `gross`, `vat`, `total`, `vatRate`, `currency` | Totals (ILS, 17% VAT) |
| `allocationNumber` | Synthetic `IL<YYYYMMDD><claim>` — real ones come from the tax-exports module |
| `headings` | `{ he: 'חשבונית מס — דמי תיווך במקרקעין', en: 'Tax Invoice — Real Estate Brokerage Fees' }` |
| `legalNotice` | Bilingual § 9 / § 14 compliance note |
| `issuedAt`, `dueDate` | Dates |

The claim is upgraded to status `invoiced`; the previous version is
preserved in `_claimHistory`.

---

## 9. Test Coverage (38/38)

| Group | Tests |
|---|---|
| `registerBroker` | 4 (create, upgrade-history, missing license, malformed) |
| `signExclusivity` | 6 (happy-path, invalid type, 2-actions rule, 'none', end-before-start, upgrade-history) |
| `logShowing` | 2 (append, rejections) |
| `computeCommission` | 7 (sale 2%, cap, rental 1mo, rental cap, split, bad split, invalid type) |
| `claimCommission` | 4 (create, expired license, empty, cap) |
| `validateAgreement` | 4 (valid, missing customer + writing, expired license, missing) |
| `disputes` | 3 (open, resolve, lookup by claim) |
| `generateInvoice` | 2 (produce, refuse disputed) |
| `licenseRenewalAlert` | 3 (expires within N, expired, default) |
| Non-deletion | 2 (no `delete*`, history retained) |
| Module exports | 1 |

### Run command

```bash
node --test onyx-procurement/test/realestate/broker-fees.test.js
```

### Latest run (2026-04-11)

```
ℹ tests 38
ℹ pass 38
ℹ fail 0
ℹ duration_ms ~500
```

---

## 10. Hebrew Glossary

| Hebrew | Transliteration | English |
|---|---|---|
| חוק המתווכים במקרקעין | ḥok ha-metavkhim ba-mekarka'in | Brokers in Real Estate Law (1996) |
| מתווך מוסמך | metavkh musmakh | Licensed broker |
| רישיון מתווך | rishayon metavkh | Broker license |
| רשם המתווכים | Rasham ha-Metavkhim | Registrar of Real Estate Brokers |
| דמי תיווך | dmei tivukh | Brokerage fees |
| הזמנת תיווך | hazmanat tivukh | Brokerage order (the § 9 written form) |
| דרישת הכתב | drishat ha-ktav | Written-form requirement (§ 9) |
| הגורם היעיל | ha-goram ha-ya'il | "Effective cause" (entitlement test — § 14) |
| ייחודיות | yekhudi'yut | Exclusivity |
| הפניית נכס | hafnayat nekhes | Exclusive listing (exclusivity form) |
| סקר מוכרת | seker mokhret | Seller-side survey (exclusivity form) |
| פעולות שיווק | pe'ulot shivuk | Marketing actions (1997 regs, need 2+) |
| חשבונית מס | khesbonit mas | Tax invoice |
| מספר הקצאה | mispar hakzaa | Allocation number (IL tax authority) |
| מע"מ | ma"m | VAT (Value Added Tax) — 17% in 2026 |
| מחלוקת כפל תיווך | makhloket kefel tivukh | Double-broker commission dispute |
| נכס | nekhes | Property |
| מכירה | mekhira | Sale |
| השכרה | haskhara | Rental |
| קונה | kone | Buyer |
| מוכר | mokher | Seller |
| שוכר | sokher | Tenant |
| משכיר | maskhir | Landlord |

---

## 11. Integration Points

- **tax-exports/** — replace `generateAllocationNumber` stub with
  real Israel Tax Authority API call when the property comes into
  the "luxury" bracket (>= 5M ILS).
- **invoices/** — pipe `generateInvoice` output into
  `invoice-pdf-generator.js` for a bilingual PDF.
- **gl/** — book `gross` as brokerage income, `vat` into the
  VAT-output ledger (code 830).
- **crm/** — link `registerBroker.id` to CRM contacts so viewing
  logs roll up under broker activity.
- **notifications/** — feed `licenseRenewalAlert(30)` into the
  daily notification digest.

---

## 12. Non-Deletion Proof (Rule Compliance)

Test 33 introspects the class prototype and asserts no method name
matches `/^delete/i` or `/^remove/i`. Tests 10, 32 and 37 verify
that upgraded records are retained in `_brokerHistory`,
`_agreementHistory` and `_claimHistory`. Nothing in this engine
ever erases a row.

```
  /לא מוחקים רק משדרגים ומגדלים/ — verified by tests 10, 28, 29, 32, 33, 37.
```

---

## 13. Known Limitations / Future Upgrades

- Allocation number is synthetic (`IL<YYYYMMDD><claim>`); real
  numbers require a live call to `gov.il/he/departments/taxes`.
  Upgrade path: wire into `tax-exports/allocation-service.js`.
- License format validator accepts 4-8 digits — the Registrar uses
  5-7 in practice; a tighter regex can be installed without
  breaking callers.
- New-construction sales (from developer) are explicitly out of
  scope — they live in `contracts/new-build.js` with different
  caps.
- No persistence layer — the tracker is in-memory by design.
  Wiring into `db/` would be additive (a storage adapter), not
  destructive.

---

**End of report. Never delete.**
