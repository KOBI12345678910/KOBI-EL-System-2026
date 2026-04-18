# AG-Y009 — Dividend Withholding Tax (מס דיבידנד במקור)

**Agent:** Y-009 — Swarm Tax-Forms
**System:** Techno-Kol Uzi Mega-ERP (Israeli) — Wave 2026
**Module:** `onyx-procurement/src/tax/dividend-withholding.js`
**Test:** `onyx-procurement/test/tax/dividend-withholding.test.js`
**Date:** 2026-04-11
**Rule:** לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.

---

## 1. Purpose — מטרת המודול

Israeli resident companies ("המשלם") distributing דיבידנד to shareholders
are legally required to withhold income tax at source and remit it to
רשות המסים. This module computes the correct withholding rate, builds
the per-distribution tax-credit line, and generates **form 867B**
(the annual consolidated dividend report that every paying company must
file by March 31 each year).

Legal basis:

| Section | Hebrew | Purpose |
|---|---|---|
| §125ב | ניכוי דיבידנד | 25% / 30% base rate for Israeli individual |
| §126(ב) | פטור בין-חברתי | 0% inter-company exemption (Israeli co. → Israeli co.) |
| §164 | חובת ניכוי במקור | General WHT duty on payments |
| §170 | ניכוי מתושב חוץ | WHT on payments to foreign residents |
| §88 | בעל מניות מהותי | 10% substantial-shareholder definition |
| §14(א) | הטבות עולה | 10-year foreign-source exemption for oleh / returning resident |
| §196 | עליונות האמנה | Tax-treaty override over domestic rate |
| כללי ניכוי ריבית, דיבידנד ורווחים (התשס"ו-2005) | | Regulatory detail |

---

## 2. Rate matrix — טבלת שיעורי ניכוי (2026)

### 2.1 Domestic rates — שיעורים פנימיים

| Recipient | Hebrew | Rate | Rule |
|---|---|---|---|
| Israeli individual, regular holder | יחיד תושב ישראל רגיל | **25%** | §125ב |
| Israeli individual, substantial (≥10%) | בעל מניות מהותי | **30%** | §125ב + §88 |
| Israeli company → Israeli company | חברה ישראלית לחברה ישראלית | **0%** | §126(ב) inter-company exemption |
| Foreign individual, regular | יחיד זר רגיל | **25%** | §170 |
| Foreign individual, substantial | יחיד זר מהותי | **30%** | §170 + §88 |
| Foreign company, default | חברה זרה | **25%** | §170 |
| Foreign company, OECD ≥10% | חברה זרה OECD | **15%** | Special OECD rate |
| Oleh, foreign-source dividend | עולה חדש — חו"ל | **0%** | §14(א), 10-year window |
| Oleh, Israeli-source dividend | עולה חדש — ישראל | **25%/30%** | §14 exclusion (domestic source not exempt) |

### 2.2 Substantial-shareholder threshold — סף בעל מניות מהותי

Defined in §88: a "בעל מניות מהותי" is anyone who, directly or
indirectly, alone or together with another, holds **at least 10%** in
one or more of the following classes:

1. The issued share capital.
2. Voting rights.
3. The right to profits / dividends.
4. The right to elect a director.
5. Any other class that the Assessing Officer deems material.

The module implements this as a simple `ownershipPct >= 0.10` test
(captured in the exported constant `SUBSTANTIAL_SHAREHOLDER_THRESHOLD`).
Callers may override via `isSubstantial: true|false` when their
business rules need to account for indirect chains, voting trusts or
option-holder aggregation.

---

## 3. Treaty rate table — טבלת אמנות למניעת כפל מס

`loadTreatyRates()` returns an immutable object keyed by ISO-3166 alpha-2
country code. Each record exposes `{portfolio, substantial, threshold,
article, signed, notes}`. Values are the caps Israel agreed to in each
bilateral DTA.

| Code | מדינה | Country | Portfolio | Substantial | Threshold | Signed |
|---|---|---|---|---|---|---|
| US | ארה״ב | United States | 25% | 12.5% | 10% | 1975 |
| GB/UK | בריטניה | United Kingdom | 15% | 5% | 10% | 2019 |
| DE | גרמניה | Germany | 10% | 5% | 10% | 2014 |
| FR | צרפת | France | 15% | 5% | 10% | 1995 |
| IT | איטליה | Italy | 15% | 10% | 10% | 1995 |
| ES | ספרד | Spain | 10% | 10% | 10% | 1999 |
| NL | הולנד | Netherlands | 15% | 5% | **25%** | 1973 |
| CH | שווייץ | Switzerland | 15% | 5% | 10% | 2003 |
| CA | קנדה | Canada | 15% | 5% | 25% | 2016 |
| CN | סין | China | 10% | 10% | 10% | 1995 |
| IN | הודו | India | 10% | 10% | 10% | 1996 |
| JP | יפן | Japan | 15% | 5% | 25% | 1993 |
| KR | ד. קוריאה | South Korea | 15% | 5% | 10% | 1997 |
| AU | אוסטרליה | Australia | 15% | 5% | 10% | 2019 |
| SG | סינגפור | Singapore | 5% | 5% | 10% | 2005 |
| AT | אוסטריה | Austria | 25% | 25% | 25% | 1970 |
| BE | בלגיה | Belgium | 15% | 15% | 25% | 1972 |
| IE | אירלנד | Ireland | 10% | 10% | 10% | 1995 |
| LU | לוקסמבורג | Luxembourg | 15% | 5% | 10% | 2004 |
| SE | שבדיה | Sweden | 15% | **0%** | 25% | 1959 |
| NO | נורווגיה | Norway | 25% | 10% | 50% | 1966 |
| DK | דנמרק | Denmark | 10% | **0%** | 10% | 2009 |
| FI | פינלנד | Finland | 15% | 5% | 10% | 1997 |
| PT | פורטוגל | Portugal | 15% | 5% | 25% | 2006 |
| GR | יוון | Greece | 25% | 25% | 10% | 1995 |
| CZ | צ׳כיה | Czech Republic | 15% | 5% | 15% | 1993 |
| PL | פולין | Poland | 10% | 5% | 10% | 1991 |
| HU | הונגריה | Hungary | 15% | 5% | 10% | 1991 |
| RO | רומניה | Romania | 15% | 15% | 10% | 1997 |
| RU | רוסיה | Russia | 10% | 10% | 10% | 1994 |
| UA | אוקראינה | Ukraine | 15% | 5% | 10% | 2003 |
| TR | טורקיה | Turkey | 10% | 10% | 10% | 1996 |
| ZA | דרום אפריקה | South Africa | 25% | 25% | 10% | 1978 |
| MX | מקסיקו | Mexico | 10% | 5% | 10% | 2000 |
| BR | ברזיל | Brazil | 15% | 10% | 25% | 2002 |
| AR | ארגנטינה | Argentina | 15% | 10% | 25% | 2005 |
| PH | פיליפינים | Philippines | 15% | 10% | 10% | 1992 |
| TH | תאילנד | Thailand | 15% | 10% | 15% | 1996 |
| VN | וייטנאם | Vietnam | 10% | 10% | 25% | 2009 |
| MT | מלטה | Malta | 15% | **0%** | 10% | 2011 |
| EE | אסטוניה | Estonia | 5% | **0%** | 10% | 2009 |
| LV | לטביה | Latvia | 10% | 5% | 10% | 2006 |
| SI | סלובניה | Slovenia | 15% | 5% | 10% | 2007 |
| HR | קרואטיה | Croatia | 15% | 5% | 25% | 2006 |
| AE | אמירויות | UAE | 15% | **0%** | 10% | 2020 |

Total: **45 country entries** covering Israel's active bilateral DTAs
plus the `UK → GB` alias for legacy callers. The domestic rate applies
to any country not in the table (fallback 25%).

### 3.1 Treaty-vs-domestic precedence

Per §196 a DTA can only *lower* Israeli domestic rates, never raise them.
The module therefore applies:

```
finalRate = min(treatyRate, domesticRate)
```

so a hypothetical treaty that set dividends at 30% would still be capped
at the 25% domestic rate.

### 3.2 Threshold nuance — סף ייעודי באמנה

Each treaty defines its own substantial-ownership threshold (not
necessarily the Israeli §88 10%). The picker uses the **treaty's own
threshold**, not the domestic one, to decide which rate column applies.
Example:

- NL treaty requires **25%** holding for the 5% "substantial" rate.
- A 20% holder satisfies Israeli §88 but not the treaty threshold.
- → Such holder receives the **portfolio 15%** rate, not 5%.

---

## 4. Function reference — מדריך ל-API

### 4.1 `computeDividendWithholding(params)`

Single-payment calculator. Returns immutable object:

```js
{
  netPaid:     5000.00,   // gross – withheld
  withheld:    2500.00,
  rate:        0.25,
  treatyCited: { country: 'US', article: 'Art.12 (US-IL 1975 DTA…)', … } || null,
  form867BRow: { …full 867B line… },
  rule:        '§125ב יחיד תושב ישראל — 25% …'
}
```

Input params:

| Field | Type | Required | Notes |
|---|---|---|---|
| `gross` | number ≥ 0 | yes | Gross dividend (ILS) |
| `shareholderType` | enum | yes | `SHAREHOLDER_TYPES.*` |
| `ownershipPct` | 0..1 | — | Fraction (0.15 = 15%) |
| `isSubstantial` | boolean | — | Explicit override |
| `recipientCountry` | ISO-2 | — | For treaty lookup |
| `treatyLookup` | object | — | Inject custom table (tests) |
| `isOlehBenefits` | boolean | — | §14(א) active |
| `foreignSource` | boolean | — | Paired with isOlehBenefits |
| `date` / `payerTaxId` / `recipientId` / `recipientName` | string | — | Form 867B metadata |

### 4.2 `loadTreatyRates()`

Returns the frozen treaty table (see §3). Stand-alone, so callers can
inject a custom table for testing or for region-restricted builds.

### 4.3 `applyTaxCredit(grossDividend, wht, options)`

Splits the withholding deduction into two components for the recipient's
own annual return:

| Component | Meaning |
|---|---|
| `creditable` | Up to the domestic cap (`capRate * gross`, default 25%). Offsets the recipient's own tax liability. |
| `refundable` | Any excess above the cap. Recipient claims a refund with the WHT certificate. |

Accepts either a raw scalar withheld amount **or** the full result
object returned by `computeDividendWithholding`. The returned effective
rate is rounded to 4 decimal places for display.

### 4.4 `generateForm867B(dividends, options)`

Aggregates a year of distributions into the complete 867B submission:

```
{
  header:  { formType, formTitle_he/en, tax_year, payer_tax_id, payer_name, generated_at, row_count },
  rows:    [ …per-distribution rows (see §5.2)… ],
  summary: { recipients: [ per-recipient totals ], total_gross, total_withheld, total_net, total_distributions },
  xml:     '<?xml version="1.0"…>…</Form867B>'
}
```

The input can be a mix of **raw params** and **already-computed results**
(the function detects which by checking for the `form867BRow` property),
so callers can pass cached computations or live inputs interchangeably.

### 4.5 `createCalculator(options)`

Thin factory that pre-binds a custom treaty table to the computation and
provides the same API as the module-level exports. Intended for tests
that need an isolated instance.

### 4.6 Constants

| Export | Value | Purpose |
|---|---|---|
| `SHAREHOLDER_TYPES` | `{ ISRAELI_INDIVIDUAL, ISRAELI_COMPANY, FOREIGN_INDIVIDUAL, FOREIGN_COMPANY }` | Recipient-type enum |
| `DOMESTIC_RATES` | Frozen rate table | 2026 Israeli rates |
| `SUBSTANTIAL_SHAREHOLDER_THRESHOLD` | `0.10` | §88 threshold |
| `ROUNDING_EPSILON` | `0.005` | Half-penny tolerance for assertions |

---

## 5. Form 867B format — מבנה הטופס

### 5.1 Regulatory context

טופס **867ב** (דוח שנתי על דיבידנד וריבית ששולמו ומס שנוכה במקור) is
filed annually by any Israeli entity that paid dividends or interest
during the tax year. Due date: **March 31** of the year following the
tax year. Filed electronically via שע"מ (ממשק דיווחים). Failure to file
triggers §190 penalty (unreported payments).

### 5.2 Row fields — שדות דיווח

Each row in `generateForm867B(...).rows` contains:

| Field | שם עברי | Description |
|---|---|---|
| `formType` | סוג טופס | Always `"867B"` |
| `formTitle_he` | כותרת עברית | Full Hebrew form title |
| `formTitle_en` | Title | English title |
| `date_of_distribution` | תאריך החלוקה | ISO date YYYY-MM-DD |
| `income_type` | סוג הכנסה | `"DIVIDEND"` |
| `income_type_he` | | `"דיבידנד"` |
| `payer_tax_id` | מספר תיק המשלם | 9-digit company ID |
| `recipient_tax_id` | מ.ז. / ח.פ. המקבל | 9-digit ID / foreign ID |
| `recipient_name` | שם המקבל | Display name |
| `recipient_country` | מדינת תושבות | ISO-2 (default `"IL"`) |
| `recipient_type` | סוג המקבל | Shareholder-type enum |
| `ownership_pct` | אחוז החזקה | Percent (display form, e.g. `5` = 5%) |
| `is_substantial` | בעל מניות מהותי | Boolean |
| `gross_amount` | סכום ברוטו | Rounded to 2 decimals |
| `withholding_rate` | שיעור ניכוי | Percent display form |
| `withheld_amount` | סכום הניכוי | Rounded to 2 decimals |
| `net_amount` | סכום נטו | Rounded to 2 decimals |
| `treaty_country` | מדינת האמנה | ISO-2 or `null` |
| `treaty_article` | סעיף באמנה | e.g. `"Art.10 (DE-IL 2014 DTA)"` |
| `treaty_signed` | שנת חתימה | |
| `legal_basis` | אסמכתא חוקית | Human-readable rule trail |

### 5.3 XML envelope

The XML is hand-serialised with no external deps. It follows the שע"מ
`Form867B` envelope:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Form867B>
  <Header>
    <FormType>867B</FormType>
    <TaxYear>2026</TaxYear>
    <PayerTaxId>514000000</PayerTaxId>
    <PayerName>Techno-Kol Uzi Ltd</PayerName>
    <GeneratedAt>2026-04-11T…</GeneratedAt>
  </Header>
  <Rows>
    <Row>
      <Date>2026-02-01</Date>
      <RecipientTaxId>111111111</RecipientTaxId>
      <RecipientName>דני כהן</RecipientName>
      <RecipientCountry>IL</RecipientCountry>
      <RecipientType>israeli_individual</RecipientType>
      <OwnershipPct>3</OwnershipPct>
      <Substantial>N</Substantial>
      <GrossAmount>50000</GrossAmount>
      <Rate>25</Rate>
      <Withheld>12500</Withheld>
      <Net>37500</Net>
    </Row>
    …
  </Rows>
  <Summary>
    <TotalGross>2000000</TotalGross>
    <TotalWithheld>200000</TotalWithheld>
    <TotalNet>1800000</TotalNet>
    <TotalDistributions>5</TotalDistributions>
  </Summary>
</Form867B>
```

Characters are escaped (`& < > "`) so Hebrew names and special symbols
round-trip safely through XML parsers.

---

## 6. Worked examples — דוגמאות

### 6.1 Israeli individual, regular holder (3%)

```js
computeDividendWithholding({
  gross: 50000,
  shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
  ownershipPct: 0.03,
});
// → { rate: 0.25, withheld: 12500, netPaid: 37500, treatyCited: null }
```

### 6.2 Israeli individual, substantial holder (35%)

```js
computeDividendWithholding({
  gross: 500000,
  shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
  ownershipPct: 0.35,
});
// → { rate: 0.30, withheld: 150000, netPaid: 350000 }
```

### 6.3 Israeli parent company, inter-company 0%

```js
computeDividendWithholding({
  gross: 1000000,
  shareholderType: SHAREHOLDER_TYPES.ISRAELI_COMPANY,
  ownershipPct: 0.60,
});
// → { rate: 0, withheld: 0, netPaid: 1000000, rule: '§126(ב)…' }
```

### 6.4 US corp substantial (20%), treaty applies

```js
computeDividendWithholding({
  gross: 300000,
  shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
  ownershipPct: 0.20,
  recipientCountry: 'US',
});
// → { rate: 0.125, withheld: 37500, netPaid: 262500,
//     treatyCited: { country:'US', article:'Art.12 (US-IL 1975 DTA…)', … } }
```

### 6.5 UAE corp 50% — treaty exemption

```js
computeDividendWithholding({
  gross: 150000,
  shareholderType: SHAREHOLDER_TYPES.FOREIGN_COMPANY,
  ownershipPct: 0.50,
  recipientCountry: 'AE',
});
// → { rate: 0, withheld: 0, netPaid: 150000, treatyCited: { country:'AE', … } }
```

### 6.6 Oleh chadash holds US shares (foreign source)

```js
computeDividendWithholding({
  gross: 100000,
  shareholderType: SHAREHOLDER_TYPES.ISRAELI_INDIVIDUAL,
  ownershipPct: 0.05,
  isOlehBenefits: true,
  foreignSource: true,
});
// → { rate: 0, withheld: 0, netPaid: 100000, rule: '§14(א) Oleh chadash…' }
```

### 6.7 Tax-credit computation for Israeli individual at 30% (substantial)

```js
applyTaxCredit(100000, 30000);
// → { cap: 25000, creditable: 25000, refundable: 5000, effectiveRate: 0.30 }
```

---

## 7. Test coverage — כיסוי הבדיקות

Test file: `onyx-procurement/test/tax/dividend-withholding.test.js` — 40
tests, all passing (`node --test`). Coverage map:

| # | Area | Tests |
|---|---|---|
| 1 | Substantial-shareholder threshold (§88 — 10%) | 01-06 |
| 2 | Inter-company exemption (§126(ב)) | 07-08 |
| 3 | Treaty lookup + fallback + injection | 09-19 |
| 4 | Form 867B row + annual aggregation + XML | 20-24 |
| 5 | applyTaxCredit (cap + refundable split) | 25-28 |
| 6 | Oleh chadash (§14) foreign-source exemption | 29-30 |
| 7 | Validation / error paths | 31-36 |
| 8 | Immutability guarantees | 37-38 |
| 9 | createCalculator instance wrapper | 39 |
| 10 | End-to-end mixed-portfolio 867B | 40 |

### 7.1 Key assertions

- **Exactly 10%** ownership moves Israeli individual from 25% → 30%.
- Explicit `isSubstantial` overrides both directions.
- Israeli company receives 0% even at minority holding.
- NL treaty 20% holder correctly drops to **portfolio 15%** (treaty's
  own 25% threshold not met) instead of the mistaken 5% "substantial".
- NL 30% holder correctly receives **5%**.
- Unknown country + foreign company ≥10% → 15% OECD fallback.
- `applyTaxCredit` correctly splits `30000` withheld on a `100000`
  gross into `25000` creditable + `5000` refundable.
- XML is well-formed with escaped Hebrew content.
- Mixed-portfolio end-to-end totals: 5 distributions, `2_000_000` gross,
  `200_000` withheld, `1_800_000` net.

### 7.2 Run locally

```bash
cd onyx-procurement
node --test test/tax/dividend-withholding.test.js
```

Expected output: `pass 40 / fail 0`.

---

## 8. Integration plan — תכנית אינטגרציה

The module is pure and dependency-free, so it plugs in without changes
to the existing tax pipeline:

| Consumer | Integration point |
|---|---|
| `src/tax/form-857.js` | 857 covers non-employee WHT; 867B covers dividends. Same pipeline, different entry points. |
| `src/tax/form-builders.js` | `type: 'dividend'` income source already recognised — hook the new calculator in the build pass. |
| `src/tax/annual-tax-routes.js` | Add `GET /api/tax/dividend/compute` and `POST /api/tax/867b/generate` endpoints. |
| Payroll module | Directors drawing dividends as compensation need the substantial-holder branch. |
| BI dashboard | Feed `summary.total_withheld` into the monthly WHT remittance counter. |

**Never delete** existing 857 handling — 867B complements it. Both forms
co-exist permanently per the project rule.

---

## 9. Compliance checklist — רשימת בדיקות תאימות

- [x] Rates reflect 2026 Israeli tax year
- [x] §88 substantial-shareholder threshold = 10%
- [x] §126(ב) inter-company exemption implemented (0%)
- [x] §125ב / §170 domestic rates correct
- [x] §14(א) Oleh 10-year foreign-source exemption
- [x] 45 treaty entries with per-country ownership thresholds
- [x] Treaty cap never exceeds domestic rate (§196)
- [x] Form 867B header + rows + per-recipient summary
- [x] שע"מ-compatible XML envelope
- [x] Bilingual (Hebrew + English) comments and field labels
- [x] Zero external dependencies (uses only Node core)
- [x] Zero mutation — all results frozen
- [x] No `delete` statements anywhere in the module
- [x] 40 unit tests passing
- [x] Bankers-rounding to 2 decimal places

---

## 10. Open items / future upgrades

1. **Real-time treaty protocols.** Some rows (RU, GR, AT) still carry
   the historical 25% cap — when Israel signs a new protocol the module
   should be *extended*, not rewritten, by adding a new version key
   (e.g. `RU_2026`) while keeping `RU` as the current-law fallback.
2. **Indirect holdings aggregation.** §88 considers indirect holdings
   "alone or together with another". Callers are expected to pre-compute
   the effective percentage; a future agent can add an auto-aggregator.
3. **PPT (principal-purpose test).** Many post-BEPS treaties now carry
   a PPT clause — we treat treaty access as automatic; a future version
   should flag suspected treaty-shopping cases for manual review.
4. **Capital-gains split.** Dividends paid out of capital-reduction
   proceeds (רווחי הון מוסוים) may attract different rates under §97 —
   out of scope for AG-Y009 but should be added as AG-Y010 later.

---

**Status:** GREEN — module + tests + report delivered. Keep forever
(per system rule: never delete, only upgrade & grow).
