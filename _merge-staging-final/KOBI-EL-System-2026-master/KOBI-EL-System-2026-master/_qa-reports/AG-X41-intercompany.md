# AG-X41 — Inter-Company Transaction Engine (Techno-Kol group)

**Agent:** X-41 (Swarm 3C)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/intercompany/ic-engine.js`
**Tests:**  `onyx-procurement/test/payroll/ic-engine.test.js`
**Rule of engagement:** additive — nothing deleted, zero dependencies, bilingual Hebrew / English.

---

## 0. Executive summary

| Deliverable                                                                                       | Status |
|---------------------------------------------------------------------------------------------------|--------|
| `onyx-procurement/src/intercompany/ic-engine.js` — pure-JS IC engine (zero deps, ~1 200 LOC)     | created |
| `onyx-procurement/test/payroll/ic-engine.test.js` — 26 cases, all green                          | created |
| Hebrew / English bilingual labels (entity types, tx types, TP methods, TP issues)                | complete |
| Israeli Section 85A transfer-pricing checks (loans, services, rent, cost share)                   | implemented |
| Auto-mirror counterparty posting + non-destructive reversals                                       | implemented |
| Consolidation eliminations JV entries (for agent X-42)                                            | implemented |
| Multi-currency IC translation (USD / EUR / ILS) with FX rate store                                | implemented |
| Year-end balance confirmation letters (bilingual)                                                  | implemented |

Test run:

```
ℹ tests 26
ℹ suites 0
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 185.9843
```

---

## 1. What the module does

`ic-engine.js` is a single-file, zero-dependency, bilingual engine for
tracking inter-company (IC) transactions across a multi-entity group
such as **Techno-Kol Uzi Ltd** (parent, metal fabrication) and
**Techno-Kol Real Estate Ltd** (subsidiary, holds properties). It
supports future affiliates (HR services, leasing) out of the box.

The engine answers the questions a group controller has to answer every
quarter and at year-end:

1. Which companies are in the group and who owns whom?
2. What IC transactions (sales, loans, management fees, rent, ...) were
   posted and were both sides recorded symmetrically?
3. Are the prices we charged between the companies at arm's length
   under **§85A of the Income Tax Ordinance**?
4. How do we eliminate intra-group amounts for consolidated financials?
5. Are we above the §85A documentation / master-file / CbCR thresholds?
6. What is the net IC balance between entity A and entity B as of date X?

All math is plain JavaScript — no `currency.js`, no `decimal.js`, no
third-party HTTP clients. The file is self-contained under
`src/intercompany/` and exposes both a default in-memory store and an
isolated `createEngine()` factory so unit tests can run in parallel.

---

## 2. Public API

```js
const IC = require('./src/intercompany/ic-engine');

// 1. Isolated engine (recommended for tests)
const eng = IC.createEngine();

// 2. Entity hierarchy
const parent = eng.defineEntity({
  id: 'TK-UZI', name: 'Techno-Kol Uzi Ltd', nameHe: 'טכנו-קול עוזי בע"מ',
  type: IC.ENTITY_TYPES.PARENT, country: 'IL', functionalCcy: 'ILS',
  taxId: '514000001', meta: { annualRevenueILS: 120_000_000 },
});
const re = eng.defineEntity({
  id: 'TK-RE', name: 'Techno-Kol Real Estate Ltd', nameHe: 'טכנו-קול נדל"ן בע"מ',
  type: IC.ENTITY_TYPES.SUBSIDIARY, country: 'IL', functionalCcy: 'ILS',
  taxId: '514000002',
});
eng.linkEntities(parent, re, 100);

// 3. Record a rent transaction + auto-mirror
const txId = eng.recordICTransaction({
  from: re, to: parent, type: IC.TX_TYPES.RENT,
  amount: 25_000, currency: 'ILS', date: '2026-01-31',
  marketRent: 25_000, documentation: true, documentationRef: 'LEASE-2026',
  description: 'Monthly factory rent', descriptionHe: 'שכר דירה חודשי',
});

// 4. Reconcile and eliminate for consolidation
const rec  = eng.reconcile(re, parent, '2026-01');
const elim = eng.generateEliminations('2026-01');

// 5. TP report for ITA
const rpt = eng.transferPricingReport('2026-01');

// 6. Net IC balance & year-end confirmation
const bal = eng.getICBalance(parent, re, '2026-12-31');
const letters = eng.yearEndConfirmation(2026);
```

### Public exports

| Function                   | Purpose                                                   |
|----------------------------|-----------------------------------------------------------|
| `defineEntity(entity)`     | Register a legal entity and return its id                 |
| `linkEntities(p, c, pct)`  | Link parent → child with ownership %                      |
| `getHierarchy(rootId)`     | Tree view of group under a root                           |
| `setFxRate(from,to,d,r)`   | Store an FX rate for future translations                  |
| `recordICTransaction(tx)`  | Create a primary + mirrored IC posting                    |
| `reverseTransaction(id)`   | Non-destructive reversal (audit-logged)                   |
| `attachDocumentation(id,r)`| Attach contemporaneous doc + re-run §85A checks           |
| `reconcile(a,b,period)`    | Two-sided reconciliation                                  |
| `generateEliminations(p)`  | JV entries for consolidation (X-42 input)                 |
| `transferPricingReport(p)` | Full §85A report with filing obligations                  |
| `getICBalance(a,b,asOf)`   | Net IC position with bilingual direction text             |
| `yearEndConfirmation(year)`| Bilingual balance confirmation letters                    |
| `evaluateTransferPricing`  | Pure TP rule engine (testable)                            |
| `setComplianceThresholds`  | Override §85A thresholds if ITA updates rates             |

---

## 3. Entity model

```js
{
  id: 'TK-UZI',
  name: 'Techno-Kol Uzi Ltd',
  nameHe: 'טכנו-קול עוזי בע"מ',
  type: 'parent',                  // parent / subsidiary / branch / joint_venture / associate
  typeLabel: { he: 'חברת אם', en: 'Parent' },
  taxId: '514000001',              // Israeli company ID (ח.פ)
  country: 'IL',
  functionalCcy: 'ILS',
  incorporated: '2010-01-01T00:00:00.000Z',
  active: true,
  meta: { annualRevenueILS: 120_000_000 },
}
```

Relationships are stored separately:
```js
{ parentId: 'TK-UZI', childId: 'TK-RE', pct: 100, since: '2026-04-11...' }
```
and the engine rejects:
- self-ownership
- circular ownership (depth-first scan)
- percentages outside 0..100

---

## 4. Transaction types and §85A behaviour

| Code                | Hebrew            | TP method default | Docs  | Deductible |
|---------------------|-------------------|-------------------|-------|------------|
| `sale_goods`        | מכירת טובין       | CUP               | local | yes        |
| `sale_service`      | מכירת שירותים     | Cost Plus (5 %)  | local | yes        |
| `management_fee`    | דמי ניהול         | Cost Plus (5 %)  | local | yes        |
| `loan_principal`    | קרן הלוואה        | safe-harbor       | light | N/A (BS)  |
| `loan_interest`     | ריבית הלוואה      | CUP (3.5-6.5 %)  | local | yes        |
| `rent`              | שכר דירה          | CUP (±15 %)      | local | yes        |
| `royalty`           | תמלוגים           | CUP               | local | yes        |
| `cost_sharing`      | חלוקת עלויות      | PSM               | local | yes        |
| `dividend`          | דיבידנד           | §126(b)           | light | no         |
| `capital_injection` | הזרמת הון         | safe-harbor       | light | no         |
| `reimbursement`     | החזר הוצאות       | safe-harbor       | light | no         |

The TP checks come straight out of the Income Tax Regulations
(Determination of Market Conditions), 2006 and OECD TPG 2022. Default
thresholds live in `DEFAULT_COMPLIANCE`:

- `MASTER_FILE_REV_ILS` = 150 000 000 ILS (local file + master file)
- `CBCR_REV_ILS` = 3 400 000 000 ILS (country-by-country report)
- `LOAN_RATE_MIN/MID/MAX` = 3.5 % / 5 % / 6.5 %
- `MIN_SERVICE_MARKUP` = 5 %
- `LVA_MARKUP` = 5 % (low-value-adding intra-group services)
- `TNMM_ROS_MIN/MAX` = 2 % / 10 % (routine manuf. / distrib.)
- `DOC_RESPONSE_DAYS` = 60

All can be overridden at runtime with `setComplianceThresholds({...})`.

### §85A issue codes

| Code            | Trigger                                                         |
|-----------------|-----------------------------------------------------------------|
| `TP_LOW_MARKUP` | Services / goods markup below min                               |
| `TP_NO_COST`    | Service tx without cost base → can't verify markup              |
| `TP_LOAN_LOW`   | Loan interest below 3.5 %                                       |
| `TP_LOAN_HIGH`  | Loan interest above 6.5 %                                       |
| `TP_LOAN_NO_RATE` | Loan without stated rate → deemed interest                    |
| `TP_RENT_OFF`   | Rent > ±15 % from market benchmark                              |
| `TP_NO_MARKET_RENT` | Rent tx without market comparable                           |
| `TP_NO_KEY`     | Cost sharing without allocation key                             |
| `TP_NO_DOCS`    | Non-compliant tx + missing contemporaneous documentation        |
| `TP_UNKNOWN_TYPE` | Transaction type not recognised                               |

If a posting is non-compliant and has no documentation, the engine
flips `deductible = false` — this is the same treatment the ITA will
apply in an audit (the expense gets added back on the tax reconciliation).

---

## 5. Mirror / reconciliation logic

Every call to `recordICTransaction` produces **two** rows:

- **primary** (`side = 'from'`) — the row as posted by the source entity
- **mirror** (`side = 'to'`, `mirrorOf = primary.id`) — the counter-side
  row automatically created for the destination entity's books

`reconcile(entityA, entityB, period)` walks every primary posting that
involves the pair, looks up the stored mirror, and raises discrepancies
as needed:

| Code               | Meaning                                              |
|--------------------|------------------------------------------------------|
| `REC_UNMATCHED`    | Primary has no mirror (or the mirror was removed)    |
| `REC_DIRECTION`    | Mirror direction inverted                            |
| `REC_AMOUNT`       | Amount mismatch > 0.01                               |
| `REC_CCY`          | Currency on the two sides differs                    |

Matched rows are flipped to `status = 'matched'` so they can be
highlighted in the controller's dashboard.

The design is intentionally **non-destructive**: reversals go through
`reverseTransaction()` which creates an opposite-signed new posting and
marks both original and mirror as `reversed`, preserving the audit
trail required by the ITA and by ISA 580 for management representation.

---

## 6. Eliminations for consolidation (feeds agent X-42)

`generateEliminations(period)` buckets all primary postings by
`(from, to, type, currency)` and emits one journal-entry object per
bucket:

```js
{
  id: 'elim-<t>-<n>',
  period: '2026-02',
  pair: 'Techno-Kol Uzi Ltd -> Techno-Kol Real Estate Ltd',
  pairIds: ['TK-UZI','TK-RE'],
  txType: 'management_fee',
  currency: 'ILS',
  lines: [
    { dr: 10500, cr: 0, account: '4100', accountLabel: 'Mgmt Fee Income - IC', ... },
    { dr: 0, cr: 10500, account: '6100', accountLabel: 'Mgmt Fee Expense - IC', ... },
  ],
  totalEliminated: 10500,
  basedOn: ['ictx-...', ...],
}
```

Account map used by `_eliminationAccounts()`:

| Type                | Dr account              | Cr account            |
|---------------------|-------------------------|-----------------------|
| sale_goods/service  | 4000 Revenue-IC         | 5000 COGS-IC          |
| management_fee      | 4100 Mgmt Fee Income-IC | 6100 Mgmt Fee Exp-IC  |
| rent                | 4200 Rental Income-IC   | 6200 Rent Expense-IC  |
| loan_interest       | 4300 Interest Income-IC | 6300 Interest Exp-IC  |
| loan_principal      | 1500 IC Loans Payable   | 1200 IC Loans Recv    |
| dividend            | 4400 Dividend Inc-IC    | 3100 Retained Earnings|
| royalty             | 4500 Royalty Inc-IC     | 6500 Royalty Exp-IC   |
| cost_sharing/reimb  | 4600 Recharges Inc-IC   | 6600 Recharges Exp-IC |
| capital_injection   | 3200 Invest. in Sub     | 3000 Share Capital    |

Agent X-42 (consolidation) consumes the `lines[]` array as-is and
applies it to the group trial balance so intra-group amounts disappear.

---

## 7. FX translation

The engine stores rates keyed by `"{from}-{to}-YYYY-MM-DD"`. When a
cross-currency posting comes in, both entity functional currencies are
computed:

```js
eng.setFxRate('USD', 'ILS', '2026-03-15', 3.7);

eng.recordICTransaction({
  from: 'TK-USA', to: 'TK-UZI', type: 'management_fee',
  amount: 10_000, cost: 9_000, currency: 'USD', date: '2026-03-15',
  documentation: true,
});
// → amountFrom (USD side) = 10_000
// → amountTo   (ILS side) = 37_000
```

If an exact date is missing, the most recent earlier rate is used. If
none is available the inverse rate is tried, and only after that does
the engine raise `IC_NO_FX`.

---

## 8. Test coverage

26 node:test cases across 11 areas:

| #  | Case                                                             | Status |
|----|------------------------------------------------------------------|--------|
| 1  | Module exports stable API surface                                | pass |
| 2  | defineEntity creates bilingual entity with tax id                | pass |
| 3  | linkEntities builds parent-child hierarchy with pct              | pass |
| 4  | linkEntities rejects circular ownership                          | pass |
| 5  | linkEntities rejects invalid percentages                         | pass |
| 6  | recordICTransaction mirrors entry on counterparty                | pass |
| 7  | recordICTransaction rejects same-entity and unknown entities     | pass |
| 8  | TP check flags low markup on management fees (§85A)              | pass |
| 9  | TP check flags loan rate outside 3.5 % .. 6.5 % band             | pass |
| 10 | TP check disallows deductibility if no docs AND non-compliant    | pass |
| 11 | reconcile returns matched set when both sides agree              | pass |
| 12 | reconcile flags missing mirror as REC_UNMATCHED                  | pass |
| 13 | cross-currency IC transaction is translated both sides           | pass |
| 14 | missing FX rate throws IC_NO_FX                                  | pass |
| 15 | generateEliminations bundles postings by type into JV entries    | pass |
| 16 | elimination accounts are correct for each transaction type      | pass |
| 17 | transferPricingReport aggregates and reports §85A status         | pass |
| 18 | transferPricingReport triggers master file at > 150 M ILS        | pass |
| 19 | getICBalance computes net position in A functional ccy           | pass |
| 20 | yearEndConfirmation generates bilingual letters                  | pass |
| 21 | reverseTransaction is non-destructive and audits both legs       | pass |
| 22 | attachDocumentation re-evaluates TP compliance                   | pass |
| 23 | dividends are excluded from working IC balance                   | pass |
| 24 | isolated engines do not share state                              | pass |
| 25 | setComplianceThresholds overrides §85A defaults                  | pass |
| 26 | cost-sharing without allocation key fails TP check               | pass |

Command:
```
node --test test/payroll/ic-engine.test.js
```

---

## 9. Files touched

| Path                                                              | Change |
|-------------------------------------------------------------------|--------|
| `onyx-procurement/src/intercompany/ic-engine.js`                  | new (~1 200 LOC) |
| `onyx-procurement/test/payroll/ic-engine.test.js`                 | new (26 tests) |
| `_qa-reports/AG-X41-intercompany.md`                              | this report |

Nothing in the repo was deleted or renamed. Zero dependencies added.

---

## 10. Integration notes for Agent X-42 (consolidation)

Agent X-42 can consume this engine directly:

```js
const IC = require('./src/intercompany/ic-engine');

// X-42 will call this once per period close:
const elimEntries = IC.generateEliminations('2026-03');

// For each entry, X-42 posts a journal to the consolidation ledger:
for (const entry of elimEntries) {
  for (const line of entry.lines) {
    consolidationLedger.post({
      account: line.account,
      dr: line.dr, cr: line.cr,
      desc: line.descHe + ' | ' + line.desc,
      ref: entry.id,
      sourceTx: entry.basedOn,
    });
  }
}
```

X-42 must call `IC.reconcile(a, b, period)` for every pair BEFORE
running eliminations to ensure no orphan mirrors remain — otherwise
the consolidated TB will be out of balance.

---

## 11. Open items for future swarms

- Wire this engine into the Onyx UI under `/intercompany` (route TBD).
- Pipe `yearEndConfirmation()` into the notifications/email module so
  the letters auto-send on 31 December.
- Add a periodic cron under `src/jobs/ic-fx-sync.js` to refresh FX
  rates from Bank of Israel XML feed (free, no auth).
- Once the HR services entity is incorporated, call `defineEntity()`
  + `linkEntities()` — no code changes needed in this module.

— Agent **X-41**, Swarm 3C.
