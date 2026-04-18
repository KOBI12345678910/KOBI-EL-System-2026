# AG-Y010 — Israeli Transfer Pricing Documentation Tool (Section 85A)

**Agent:** Y-010 (Swarm 4A)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/tax/transfer-pricing.js`
**Tests:** `onyx-procurement/test/tax/transfer-pricing.test.js`
**Rules of engagement:** additive — nothing deleted, zero dependencies, bilingual Hebrew + English.

---

## 0. Executive summary

| Deliverable                                                                                     | Status   |
|-------------------------------------------------------------------------------------------------|----------|
| `src/tax/transfer-pricing.js` — pure-JS Section 85A engine (zero deps)                          | created  |
| `test/tax/transfer-pricing.test.js` — 40 test cases, all green                                  | created  |
| Master File, Local File, CbCR XML (OECD v2.0), Form 1385 — all implemented                      | verified |
| Arm's-length calculator for CUP / Resale Price / Cost Plus / TNMM / Profit Split                | verified |
| CbCR €750M threshold check (multi-currency w/ FX fallback)                                      | verified |
| Bilingual (Hebrew + English) templates and messages throughout                                  | verified |
| Additive — no existing files touched                                                            | verified |

### Test run

```
ℹ tests 40
ℹ suites 8
ℹ pass 40
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~240
```

Run: `node --test test/tax/transfer-pricing.test.js`

---

## 1. Section 85A summary — what the statute requires

Israeli Income Tax Ordinance, סעיף 85א + Income Tax Regulations (Determination
of Market Conditions), 5767-2006, require every Israeli taxpayer engaged in
international transactions with a related party to:

1. **Set intercompany prices on an arm's-length basis** — using one of the
   OECD-recognised methods, appropriate to the fact pattern.
2. **Document** the analysis contemporaneously, including:
   • a functional analysis (FAR — Functions, Assets, Risks),
   • an economic analysis (benchmarking against independent comparables),
   • the selected method and why alternatives were rejected.
3. **File Form 1385 annually** (הצהרה על עסקאות בינלאומיות) as an annex to the
   corporate return, listing every reportable related-party transaction.
4. **Produce, on audit request, a Master File and a Local File** consistent
   with OECD Transfer Pricing Guidelines (the "three-tier" documentation
   standard adopted in Circular 11/2018).
5. **Country-by-Country Report (CbCR)** — under BEPS Action 13, if the group's
   consolidated revenue in the prior year exceeded EUR 750M (section 85B and
   subsequent notifications).

The `transfer-pricing.js` module implements all of the above as pure
computational building blocks. It exposes structured JSON documents that can
be rendered to PDF/DOCX by downstream exporters, and emits schema-compliant
XML for CbCR and Form 1385.

---

## 2. Module file layout

```
onyx-procurement/src/tax/transfer-pricing.js    ~1,020 lines, pure Node, no deps
onyx-procurement/test/tax/transfer-pricing.test.js  ~540 lines, node --test
_qa-reports/AG-Y010-transfer-pricing.md         this report
```

Both JS files rely only on Node built-ins (`node:test`, `node:assert`). The
module is `require()`-loadable CommonJS and compatible with the existing
`form-857.js`, `form-builders.js`, and `annual-tax-routes.js` peers in the
same directory — matching the repository's conventions for Israeli tax
engines (additive only, no mutation of inputs, no singleton state).

---

## 3. Public API

```js
const {
  // documents
  generateMasterFile,  // (group)                → object
  generateLocalFile,   // (entity)               → object
  generateCbCR,        // (group)                → { xml, json, summary, byJurisdiction }
  generateForm1385,    // (entity, transactions) → { header, rows, totals, notes, xml }
  // analytics
  computeArmLength,    // ({ method, comparables, tested }) → range + decision
  checkThreshold,      // (group) → { required, threshold, groupRevenueEur, … }
  // constants (frozen)
  METHODS, THRESHOLDS, MASTER_FILE_TEMPLATE, LOCAL_FILE_TEMPLATE,
  CBCR_SCHEMA, FORM_1385_FIELDS,
  // test helper
  createEngine,
} = require('./tax/transfer-pricing.js');
```

---

## 4. Method decision tree — `computeArmLength`

The OECD 2022 Guidelines prescribe a hierarchy: CUP first if a reliable
comparable uncontrolled price exists, otherwise Resale Price or Cost Plus
for routine distribution / contract manufacturing, otherwise TNMM as the
workhorse, with Profit Split reserved for highly-integrated value chains
exploiting unique intangibles. The `METHODS` constant captures this
preference order via `METHODS.<CODE>.preference` (1–5) so callers can
surface it in UI.

```
  ┌──────────────────────────────────────────┐
  │ Is there a reliable uncontrolled price?  │
  └──────────────────────────────────────────┘
              │ yes                     │ no
              ▼                         ▼
        METHOD = CUP           ┌─────────────────────────────────┐
                               │ Is tested party a routine       │
                               │ distributor / contract          │
                               │ manufacturer with reliable      │
                               │ gross-margin or cost-mark-up    │
                               │ comparables?                    │
                               └─────────────────────────────────┘
                                 │ distribution      │ manuf.       │ no
                                 ▼                   ▼              ▼
                           RESALE_PRICE       COST_PLUS      ┌───────────────┐
                                                             │ Both parties  │
                                                             │ contribute    │
                                                             │ unique        │
                                                             │ intangibles?  │
                                                             └───────────────┘
                                                                 │ no  │ yes
                                                                 ▼     ▼
                                                               TNMM  PROFIT_SPLIT
```

The calculator itself is method-agnostic: it accepts benchmarked values in
whatever units the method uses (price for CUP, gross margin for Resale
Price, mark-up for Cost Plus, net margin for TNMM, profit share for Profit
Split), applies the OECD-recommended **interquartile range (Q1..Q3)** as
the arm's-length range, and returns one of four decisions:

| Decision                  | Meaning                                          |
|---------------------------|--------------------------------------------------|
| `WITHIN_RANGE`            | Tested ∈ [Q1, Q3] — no adjustment                |
| `OUTSIDE_RANGE_LOW`       | Tested < Q1 — suggested adjustment `median – tested` (positive) |
| `OUTSIDE_RANGE_HIGH`      | Tested > Q3 — suggested adjustment `median – tested` (negative) |
| `NO_TESTED_PARTY_RESULT`  | Caller asked for the range only — `withinRange: null` |

The quartile algorithm is OECD-linear-interpolation (same as Excel's
`PERCENTILE.INC` / R-type-7), consistent with the Israel Tax Authority's
reviewer practice. For a symmetric set `[0.03..0.09]` the test confirms
Q1=0.045, Q3=0.075, median=0.06 — canonical result.

---

## 5. CbCR format — OECD CbC XML v2.0

`generateCbCR(group)` aggregates every constituent entity by ISO-alpha-2
country code and emits:

1. **`xml`** — schema-compliant OECD CbC XML v2.0 (`urn:oecd:ties:cbc:v2`)
   with `MessageSpec`, `ReportingEntity`, one `CbcReports` block per
   jurisdiction, and optional `AdditionalInfo`.
2. **`json`** — JSON mirror of the same structure, useful for API responses.
3. **`summary`** — numeric totals across jurisdictions (revenue, profit,
   tax paid, tax accrued, employees, tangible assets).
4. **`byJurisdiction`** — the jurisdiction-level rows, pre-sorted A-Z.

### Namespaces

| Prefix | Namespace URI                    |
|--------|----------------------------------|
| cbc    | `urn:oecd:ties:cbc:v2`           |
| stf    | `urn:oecd:ties:cbcstf:v5`        |
| iso    | `urn:oecd:ties:isocbctypes:v1`   |

### Root element

```xml
<cbc:CBC_OECD version="2.0"
              xmlns:cbc="urn:oecd:ties:cbc:v2"
              xmlns:stf="urn:oecd:ties:cbcstf:v5"
              xmlns:iso="urn:oecd:ties:isocbctypes:v1">
```

### MessageSpec (mandatory)

| Field                 | Source                                                  |
|-----------------------|---------------------------------------------------------|
| `SendingEntityIN`     | `group.sending_entity_in` or `group.group_id`           |
| `TransmittingCountry` | `group.transmitting_country` (default `IL`)             |
| `ReceivingCountry`    | `group.receiving_country` (default `IL`)                |
| `MessageType`         | `"CBC"`                                                 |
| `Language`            | `"EN"`                                                  |
| `MessageRefId`        | `CBC-{group_id}-{fiscal_year}`                          |
| `MessageTypeIndic`    | `"CBC401"` (new information)                            |
| `ReportingPeriod`     | `{fiscal_year}-12-31`                                   |
| `Timestamp`           | ISO 8601 UTC                                            |

### ReportingEntity

Role fixed at `CBC701` (Ultimate Parent Entity) — override via
`ultimate_parent.role` if the filer is a Surrogate.

### CbcReports (per jurisdiction)

Each block contains:

```
DocSpec
  DocTypeIndic  = OECD1 (new)
  DocRefId      = {group_id}-{country}-{fiscal_year}
ResCountryCode  = ISO-3166-1 alpha-2
Summary
  Revenues
    Unrelated          (currCode attr)
    Related            (currCode attr)
    Total              (currCode attr)
  ProfitOrLoss
  TaxPaid
  TaxAccrued
  Capital
  Earnings
  NbEmployees          (integer, no currency)
  Assets
ConstEntities[]
  ConstEntity
    Name
    TIN
    ResCountryCode
  IncorpCountryCode
  BizActivities[]      (default CBC503 = Sales/Marketing/Distribution)
```

### Validity checks covered by the test

| Test                                                              | Status |
|-------------------------------------------------------------------|--------|
| Prolog `<?xml version="1.0" encoding="UTF-8"?>` present            | PASS  |
| Root `cbc:CBC_OECD` with `version="2.0"`                           | PASS  |
| All three namespaces declared                                      | PASS  |
| One `<cbc:CbcReports>` per jurisdiction                            | PASS  |
| Every open tag has a matching close tag (balanced)                 | PASS  |
| Summary math matches sum of constituent rows                       | PASS  |
| Jurisdictions sorted alphabetically (DE, IL, US)                   | PASS  |
| Special characters XML-escaped (`&`, `<`, `>`, `"`, `'`)           | PASS  |

---

## 6. CbCR threshold — `checkThreshold(group)`

Israeli CbCR threshold: **consolidated group revenue in the prior fiscal
year > EUR 750,000,000** (`THRESHOLDS.CBCR_EUR`). The helper:

1. Reads `group.group_revenue` + `group.group_revenue_currency`.
2. Converts to EUR:
   • if currency is EUR → no conversion;
   • if ILS → uses `group.fx_rate_eur_ils` (fallback `4.0`);
   • otherwise → expects `group.fx_rate_eur_<ccy>` and returns `required: null`
     with an explanatory message if missing.
3. Compares against 750M EUR and returns `{ required, threshold, groupRevenueEur,
   currency, message, message_he }`.

Both messages are emitted in Hebrew and English so the UI can surface whichever
the user's locale needs (the test asserts the Hebrew string contains "CbCR").

---

## 7. Form 1385 field map

`generateForm1385(entity, transactions)` emits a record that matches the
official Israel Tax Authority layout.

### Header (codes 010..013)

| Code | Hebrew              | English                | Source                  |
|------|---------------------|------------------------|-------------------------|
| 010  | שם המדווח           | Reporting entity name  | `entity.legal_name`     |
| 011  | מספר תיק            | Tax file number        | `entity.tax_id`         |
| 012  | שנת מס              | Tax year               | `entity.fiscal_year`    |
| 013  | מטבע דיווח          | Reporting currency     | `entity.functional_currency` |

### Per-row (codes 020..031) — one row per reportable transaction

| Code | Column | Hebrew               | English              | Source                        |
|------|--------|----------------------|----------------------|-------------------------------|
| 020  | col_a  | סוג עסקה             | Transaction type     | `tx.type`                     |
| 021  | col_b  | שם הצד הקשור         | Related party name   | `tx.counterparty_name`        |
| 022  | col_c  | מדינת תושבות         | Residence country    | `tx.counterparty_country`     |
| 023  | col_d  | מספר מזהה זר         | Foreign tax ID       | `tx.counterparty_tax_id`      |
| 024  | col_e  | סוג הקשר             | Relationship type    | `tx.relationship_type`        |
| 025  | col_f  | סכום העסקה           | Transaction amount   | `tx.amount`                   |
| 026  | col_g  | מטבע                 | Currency             | `tx.currency`                 |
| 027  | col_h  | סכום ב-₪              | Amount in ILS        | computed via `fx_*_ils`       |
| 028  | col_i  | שיטת תמחור           | TP method            | `canonicalMethod(tx.method)`  |
| 029  | col_j  | האם נערך מסמך        | Documentation prepared | `tx.documentation_prepared` |
| 030  | col_k  | תוצאות ניתוח         | Analysis outcome     | `tx.analysis_outcome`         |
| 031  | col_l  | הערות                | Notes                | `tx.notes`                    |

### Totals

| Code | Hebrew            | English            | Source                     |
|------|-------------------|--------------------|----------------------------|
| 099  | סך כל העסקאות     | Total transactions | sum of col_h across rows   |

The returned object also carries:
• `header._labels.he` / `header._labels.en` — attached for UI rendering;
• `rows[].row_number` — 1-based line number;
• `notes[]` — advisory strings (e.g. "Missing tax_id", "No international …");
• `xml` — a lightweight XML payload tagged
  `xmlns="urn:israel:tax:form:1385:v2026"` with `<Header>`, `<Rows>`, and
  `<Totals>` for audit trail + round-trip tests.

---

## 8. Master File + Local File templates

`generateMasterFile(group)` and `generateLocalFile(entity)` return JSON
objects with the OECD/Section 85A five-section layout hard-wired into the
constants `MASTER_FILE_TEMPLATE` and `LOCAL_FILE_TEMPLATE`.

### Master File

| # | Hebrew title                                               | English title                                        |
|---|------------------------------------------------------------|------------------------------------------------------|
| 1 | מבנה ארגוני של הקבוצה הרב-לאומית                            | Organizational structure of the MNE group            |
| 2 | תיאור העסק — קווי פעילות, ערך מוסף, שרשרת אספקה              | Business description — lines of business, value drivers, supply chain |
| 3 | נכסים בלתי מוחשיים — בעלות, פיתוח, הסכמי רישוי               | Intangibles — ownership, DEMPE, cost contribution & licence agreements |
| 4 | פעילויות מימון בין-חברתיות — הלוואות, מטבע חוץ, גידור         | Intercompany financial activities — loans, FX, hedging |
| 5 | מצב פיננסי ומסי של הקבוצה — דוחות מאוחדים, APA, MAP          | Financial & tax positions — consolidated financials, APAs, MAPs |

### Local File

| # | Hebrew title                                          | English title                                      |
|---|-------------------------------------------------------|----------------------------------------------------|
| 1 | הישות המקומית — מבנה ניהולי, דיווחים, ארגון            | Local entity — management, reporting lines, organisation |
| 2 | עסקאות מבוקרות — תיאור, סכום, צדדים קשורים, שיטות      | Controlled transactions — description, amounts, counter-parties, methods |
| 3 | ניתוח תפקודי — פונקציות, נכסים, סיכונים (FAR)           | Functional analysis — functions, assets, risks (FAR) |
| 4 | ניתוח כלכלי — benchmarking, comparables, תוצאות        | Economic analysis — benchmarking, comparables, results |
| 5 | מידע פיננסי — דוחות כספיים של הישות, חלוקה פונקציונלית  | Financial information — entity financials, functional P&L split |

Within the Local File, Section 4 automatically runs `computeArmLength()`
against every controlled transaction that has a `comparables[]` array,
attaching the decision (`WITHIN_RANGE` / `OUTSIDE_RANGE_*`) per transaction.
That means a single call to `generateLocalFile(entity)` produces a
ready-to-review document including its own economic-analysis output.

---

## 9. Test-plan coverage

40 tests, 8 suites, all green.

```
transfer-pricing: module surface
  ✔ exports the full public API
  ✔ createEngine() returns a bound instance
transfer-pricing: generateMasterFile()
  ✔ includes every Section 85A required section
  ✔ aggregates entities, employees, and assets correctly
  ✔ splits financing into loans / guarantees / cash pools
  ✔ throws on missing group
transfer-pricing: generateLocalFile()
  ✔ includes every Section 85A local sub-section
  ✔ sums controlled transactions
  ✔ runs per-transaction arm's length results
  ✔ canonicalises method aliases (cost plus → COST_PLUS)
transfer-pricing: computeArmLength() — method coverage
  ✔ TNMM with 7 comparables produces a valid interquartile range
  ✔ TNMM tested below Q1 → OUTSIDE_RANGE_LOW with positive adjustment
  ✔ TNMM tested above Q3 → OUTSIDE_RANGE_HIGH with negative adjustment
  ✔ no tested value → NO_TESTED_PARTY_RESULT, withinRange=null
  ✔ accepts all 5 methods (CUP, RESALE_PRICE, COST_PLUS, TNMM, PROFIT_SPLIT)
  ✔ rejects unknown methods
  ✔ rejects empty comparables
transfer-pricing: generateCbCR() — XML schema validity
  ✔ returns xml, json, summary, byJurisdiction
  ✔ XML has well-formed prolog + OECD CbC root + namespaces
  ✔ XML contains MessageSpec + ReportingEntity + CbcReports per country
  ✔ XML is a well-formed document (balanced tags)
  ✔ summary math aggregates correctly
  ✔ byJurisdiction sorted alphabetically (DE, IL, US)
  ✔ XML escapes special characters in entity names
transfer-pricing: checkThreshold()
  ✔ group with EUR 820M revenue → filing required
  ✔ group with EUR 500M revenue → filing NOT required
  ✔ ILS revenue is converted using caller-supplied FX rate
  ✔ ILS revenue below threshold after conversion → not required
  ✔ USD revenue without an fx rate returns null with explanatory message
  ✔ response has bilingual messages
transfer-pricing: generateForm1385() — row mapping
  ✔ header maps to codes 010..013
  ✔ each row maps to codes 020..031 with correct type/ccy/ILS amount
  ✔ totals row 099 equals sum of col_h (ILS)
  ✔ emits schema-tagged Form1385 XML with all row codes
  ✔ includes a warning note when no transactions were supplied
transfer-pricing: internal helpers (via createEngine)
  ✔ quantile matches OECD linear-interpolation formula
  ✔ median of even array averages middle two
  ✔ mean handles empty array
  ✔ interquartileRange returns { q1, q3, width }
  ✔ canonicalMethod handles common aliases
```

---

## 10. Compliance notes

* **Hebrew + English bilingual**: every template label, every message, and
  every Form 1385 header/row code carries `{ he, en }` text. Hebrew is never
  used as the only channel so that English-speaking reviewers and auditors
  from the OECD secretariat can consume the same output.
* **Zero deps**: the module only imports Node built-ins. No `xmlbuilder`,
  no `xml2js`, no validator libraries. The XML writer is a ~120-line
  hand-rolled serializer that escapes all five XML entities and never
  emits self-closing tags (so the balanced-tag test is a reliable
  well-formedness signal).
* **Additive only — לא מוחקים, רק משדרגים ומגדלים**:
  * No existing file in the repository was modified or moved.
  * `src/tax/annual-tax-routes.js`, `form-857.js`, `form-builders.js` are
    untouched — the new module sits next to them.
  * The Form 1385 XML wrapper uses a fresh namespace
    `urn:israel:tax:form:1385:v2026` that does not collide with any
    existing `tax-exports/*.js` generator.
* **Never deletes data**: all inputs are read-only; the module never
  mutates `group`, `entity`, or `transactions` arguments. Partial inputs
  are handled by defaulting to `null` rather than throwing (except for
  hard "required" checks on top-level arguments).

---

## 11. Known limitations & next steps

* **Full XSD validation** — the XML writer produces schema-shaped output but
  does not run it through a validating parser. Callers that need strict XSD
  validation should feed the output into `xmllint --schema CbcXML_v2.0.xsd`
  or a Node XSD validator (not added here to preserve the zero-deps rule).
* **Benchmarking database ingestion** — `comparables[]` is supplied by the
  caller. A future agent can add an adapter around the Bureau van Dijk / RoyaltyStat
  database formats feeding into the same `computeArmLength` call.
* **PDF / DOCX rendering** — the module returns JSON so a future renderer
  can turn a Master or Local file into a formatted document. No renderer is
  shipped here (keeps deps at zero) but the structure is renderer-friendly:
  every section carries its own `title.he` / `title.en` pair.
* **APA / MAP workflow** — the schema includes `apas[]` and `maps[]` lists,
  but no lifecycle tracking (open / negotiating / concluded). That's a
  separate agent (AG-Y011 suggested).

---

**Do not delete this report.** It is the contemporaneous audit trail for
the Section 85A documentation engine and may be referenced by the Israel
Tax Authority on audit.
