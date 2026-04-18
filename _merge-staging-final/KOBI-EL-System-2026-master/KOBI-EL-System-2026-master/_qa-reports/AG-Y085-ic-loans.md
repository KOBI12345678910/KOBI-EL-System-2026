# AG-Y085 — Intercompany Loans Tracker (`ICLoans`)

**Agent:** Y-085 (Finance / Swarm-Complement)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/finance/ic-loans.js`
**Tests:**  `onyx-procurement/test/finance/ic-loans.test.js`
**Complements:** `AG-X41-intercompany` (IC transaction engine),
`AG-Y010-transfer-pricing` (Section 85A documentation tool).
**Rules of engagement:**
- לא מוחקים רק משדרגים ומגדלים — additive only, no file touched outside the two deliverables.
- Zero runtime dependencies (pure Node, ES2019).
- Bilingual Hebrew + English on every enum and user-facing string.

---

## 0. Executive summary

| Deliverable                                                                              | Status   |
|------------------------------------------------------------------------------------------|----------|
| `src/finance/ic-loans.js` — `class ICLoans` + pure helpers (zero deps)                   | created  |
| `test/finance/ic-loans.test.js` — 38 tests, 13 suites, all green                         | created  |
| Amortization engine: level / bullet / interest-only / zero-rate                          | verified |
| Accrual engine: ACT/365, ACT/360, 30/360 with payment-split chunks                       | verified |
| Israeli §85A arm's-length documentation (CUP method, IQR boundary)                       | verified |
| Israeli §3(i) imputed-interest floor warning                                             | verified |
| Thin-cap heuristic (debt/equity 3:1) + BEPS Action 4 (30 % EBITDA)                       | verified |
| WHT 25 % statutory + treaty relief lookup (Form 2513 flow)                               | verified |
| Bank-exception override on treaty rate                                                   | verified |
| FX revaluation for non-functional-currency loans (USD, EUR)                              | verified |
| Bilingual Hebrew/English IC loan agreement generator                                     | verified |
| Consolidation-elimination JV proposal (mirrored debit/credit)                            | verified |
| Audit log — every mutating action is recorded and immutable                              | verified |

### Test run

```
ℹ tests 38
ℹ suites 13
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~150
```

Command: `node --test test/finance/ic-loans.test.js`

---

## 1. Public API

```js
const { ICLoans } = require('onyx-procurement/src/finance/ic-loans');

const ic = new ICLoans();

const loan = ic.originateLoan({
  lender: 'TKU-ISR-HQ',
  borrower: 'TKU-RE-LTD',
  principal: 1_000_000,
  currency: 'ILS',
  rate: 0.06,
  rateType: 'fixed',          // or 'floating' | 'prime+X' | 'libor+X' | 'sofr+X'
  term: { startDate: '2026-01-01', maturityDate: '2031-01-01', gracePeriodMonths: 0 },
  paymentSchedule: { frequency: 'MONTHLY', amortization: 'level', dayCount: 'ACT/365' },
  purpose: 'Intragroup working capital facility',
  intercompanyAgreement: {
    reference: 'ICL-2026-001',
    signatories: ['CFO', 'CEO'],
    jurisdiction: 'Tel Aviv',
    governingLaw: 'Israeli law',
  },
});

ic.calculateInterest(loan.loanId, { from: '2026-01-01', to: '2026-07-01' });
ic.recordPayment({ loanId: loan.loanId, date: '2026-02-01', principal: 10_000, interest: 5_000, type: 'scheduled' });
ic.outstandingBalance(loan.loanId, '2026-07-01');

ic.thinCapRules({ entity: 'TKU-RE-LTD', debtEquityRatio: 4.5, maxRatio: 3.0, interestExpense: 1_000_000 });
ic.withholdingTax({ borrower: 'TKU-IL', lender: 'TKU-US', interest: 100_000, lenderCountry: 'US', treatyCertificate: 'CERT-2026-US-001' });
ic.currencyRevaluation({ loanId, asOfDate: '2026-06-30', spotRate: 3.85, functionalCurrency: 'ILS', previousSpot: 3.70 });
ic.armsLengthSupport(loan.loanId);           // also available as ic["arm'sLengthSupport"](id)
ic.generateLoanAgreement(loan.loanId);
ic.consolidationElimination({ from: '2026-01-01', to: '2026-12-31' });
```

All methods are **pure with respect to the external world** — they mutate
the private in-memory store but never touch the GL, the ledger, or any
external API. Journal entries are returned as proposals for the
consolidation or GL adapters to post.

---

## 2. Israeli transfer-pricing notes — Section 85A

**Section 85A of the Israeli Income Tax Ordinance [New Version]** requires
that every transaction between related parties — including
intercompany loans — be priced on an arm's-length basis, and that the
taxpayer maintain **contemporaneous documentation** supporting the
rationale for the price (or, here, the interest rate). The documentation
standard is elaborated in the **Income Tax Regulations (Determination of
Market Conditions), 5767-2006**, and in **ITA Circular 11/2018**.

For an intercompany loan this means:

1. **Rate selection rationale** — why was 5.75 % chosen and not, say, 6.5 %?
   The typical methodology is **CUP (Comparable Uncontrolled Price)**:
   benchmark against independent lending in a comparable credit-risk
   profile, tenor, currency, and covenant package.
2. **Credit spread analysis** — what is the notional stand-alone rating
   of the borrower (i.e., if it had to borrow from a third party), and
   what spread over the risk-free curve does that imply?
3. **Loan covenants** — guarantee / collateral / subordination — all of
   these affect the arm's-length rate and must be reflected in the
   benchmarking memo.
4. **Interquartile range (IQR)** — Israeli practice, aligned with OECD
   guidance, accepts that any rate within the IQR of a reasonable set
   of comparables is presumptively arm's-length. Outside the IQR, the
   ITA expects an adjustment (or a credible business-purpose narrative).

### How this module helps

- `originateLoan` automatically attaches a bilingual **§85A note** to
  every loan record (`loan.section85ANote.he` / `.en`), stating that
  the transaction is subject to Section 85A documentation.
- `armsLengthSupport(loanId)` returns a full TP memo:
  - **Method:** CUP.
  - **Statutory anchor:** §85A + Regs 5767-2006.
  - **Comparables:** caller-supplied set, or a synthesised baseline
    grounded on the BoI curve and the §3(i) imputed rate (clearly
    marked `synthesised: true` so an auditor can distinguish them).
  - **IQR:** Q1 / median / Q3 of the comparable rates.
  - **Conclusion:** `inRange: true|false`, with bilingual rationale.
- `calculateInterest` uses the declared rate — there is no implicit
  rate substitution — so a §85A finding by the ITA translates directly
  into a re-run of the same function with the adjusted rate, producing
  the exact catch-up amount.

### Interaction with §3(i) — imputed interest

**Section 3(i) of the Ordinance** deems a minimum interest rate on
shareholder loans and certain intercompany balances ("ריבית רעיונית").
The baseline rate is published periodically by the ITA (the 2026 value
in this module is `0.043`, overridable via `setImputedRate`).

When the declared loan rate is meaningfully **below** the §3(i) floor
and **no `armsLengthSupport` object was pre-attached** at origination,
`originateLoan` attaches an `armsLengthWarning` on the loan record and
writes an `ARMS_LENGTH_WARNING` entry to the audit log. This is an
additive signal — the loan is still created (the accounting team may
have a legitimate reason) — but it ensures the case never silently
passes through.

### Form 1385 cross-reference

For multi-jurisdictional IC loans the module integrates upstream into
**AG-Y010 (transfer-pricing.js)**: `armsLengthSupport` is shaped to be
directly consumable by the Form 1385 generator (`generateForm1385`),
so the annual declaration can pull comparables straight out of the
loan records without a second round of data entry.

---

## 3. Thin-capitalisation rules

Unlike many OECD members, Israel does not have a codified debt-to-equity
ratio in statute. Instead, the ITA applies **two parallel heuristics**
in a §85A audit:

### Test 1 — Debt/equity 3:1 heuristic

Long-standing ITA audit practice treats a debt-to-equity ratio of
**3:1** as the implicit ceiling beyond which interest on related-party
debt is at risk of recharacterisation as a non-deductible equity
return. The "excess fraction" is computed as `(D/E − 3) / (D/E)`; for
a 4.5:1 ratio this is `1.5 / 4.5 = 33.33 %`, so one-third of the
interest is flagged as non-deductible.

In the test suite: `1_000_000 * 0.3333 = 333_333.33` non-deductible →
at a 23 % corporate rate this is `76_666.66` of additional tax.

### Test 2 — BEPS Action 4 (30 % EBITDA)

For MNE groups above the de-minimis threshold, Israel has adopted the
BEPS Action 4 earnings-stripping rule: **net interest expense may not
exceed 30 % of tax-adjusted EBITDA**. The excess is disallowed in the
year and carried forward to future years (a carry-forward mechanism
not tracked in this module — it is left to the corporate-tax engine).

Both tests run independently and the **more restrictive** result is
the binding non-deductible amount. If only one input is provided, only
that test is executed. The method is:

```js
ic.thinCapRules({
  entity: 'TKU-RE-LTD',
  debtEquityRatio: 4.5,
  maxRatio: 3.0,               // override the ITA baseline if needed
  interestExpense: 1_000_000,
  ebitda: 2_000_000,            // optional — adds the BEPS test
});
```

---

## 4. Withholding tax on interest (§164, §170)

**Israeli statute:** interest paid to a foreign lender is subject to
Withholding Tax under §170 of the Ordinance. The statutory ceiling is
**25 %** (`IL_WHT_INTEREST_DEFAULT`); the default value of the module.

### Treaty relief

Where the lender is resident in a jurisdiction that has a **Double
Taxation Agreement (DTA)** with Israel, the **lower** of the statutory
rate and the treaty rate applies. Treaty relief is **conditional** on
the lender providing an **Israeli Form 2513 / 2513A certificate of
residency** — the module models this as the `treatyCertificate` field
(truthy = certificate on file; falsy = statutory ceiling applies).

The DTA rates baked into `DTA_INTEREST_RATES` are the 2026 baseline
rates for the 20 most commonly encountered jurisdictions in Israeli
intercompany lending:

| Country | Code | Interest WHT rate under treaty |
|---|---|---|
| United States | US | 17.5 % (general), 10 % (bank) |
| United Kingdom | GB | 15 % |
| Germany | DE | 5 % |
| France | FR | 10 % |
| Netherlands | NL | 10 % |
| Switzerland | CH | 10 % |
| Canada | CA | 15 % |
| Japan | JP | 10 % |
| China | CN | 10 % |
| India | IN | 10 % |
| Italy | IT | 10 % |
| Spain | ES | 10 % |
| Austria | AT | 15 % |
| Belgium | BE | 15 % |
| Romania | RO | 5 % |
| Ireland | IE | 5 % |
| Luxembourg | LU | 10 % |
| Singapore | SG | 7 % |
| Korea | KR | 10 % |
| Australia | AU | 10 % |

Rates are overridable via `ic.setDTARate('US', 0.10)` — always verify
the exact rate in the protocol currently in force on the payment date,
since several treaties have been amended in recent years.

### Bank exception

A handful of treaties (notably Israel–US) grant a **further reduced
rate** — typically **10 %** — on interest paid to a foreign bank. Set
`bankException: true` to cap the applied rate at **10 %** regardless of
the treaty's general rate.

### Domestic loans

When both borrower and lender are Israeli (`lenderCountry: 'IL'`), the
module reports the statutory amount for completeness but notes in both
Hebrew and English that **no WHT obligation** applies on domestic
interest (subject to §164-§170 withholding on non-exempt payees).

---

## 5. FX revaluation — non-functional-currency loans

A loan booked in a currency other than the lender/borrower functional
currency must be **revalued** at every reporting date at the current
spot rate. Unrealised gains or losses are booked against the
`FX-GAIN-LOSS` P&L account on each side.

The sign convention inside `currencyRevaluation` is:

- **Lender (the creditor, holds an AR):**
  spot ↑ = gain (debit AR-IC, credit FX-GAIN-LOSS)
- **Borrower (the debtor, holds an AP):**
  spot ↑ = loss (debit FX-GAIN-LOSS, credit AP-IC)

The returned record contains a `journal` object with **two mirrored JV
proposals** (one for the lender, one for the borrower), ready to be
fed into the GL adapter in `src/gl/`. The module itself **does not
post** journals — it emits proposals. This keeps the behaviour
deterministic and easy to audit.

The first revaluation of a loan requires either a previous
`setFxRate` entry in the X-41 engine or an explicit `previousSpot`
parameter. For a loan booked in the functional currency, the previous
rate is assumed to be `1.0` (zero impact).

---

## 6. Hebrew glossary — מילון עברי-אנגלי

| Hebrew | Transliteration | English |
|---|---|---|
| הלוואה בין-חברתית | halva'a ben-havratit | Intercompany loan |
| חברות קשורות | havarot kshurot | Related parties |
| ריבית קבועה / משתנה | ribit k'vu'a / mishtana | Fixed / floating rate |
| ריבית רעיונית | ribit ra'ayonit | Imputed (notional) interest |
| מרחק הידיים | merhak ha-yadayim | Arm's length |
| סעיף 85א | se'if 85-alef | Section 85A |
| סעיף 3(י) | se'if 3(yud) | Section 3(i) |
| מחירי העברה | mehirey ha'avara | Transfer pricing |
| מסמכי מחירי העברה | mismakhey mehirey ha'avara | TP documentation |
| נכס בלתי-מוחשי | nekhes bilti-muhashi | Intangible asset |
| יחס חוב להון | yahas hov le-hon | Debt-to-equity ratio |
| היוון דק | hivun dak | Thin capitalisation |
| ניכוי במקור | nikui bamakor | Withholding tax |
| אמנה למניעת כפל מס | amana limniat kefel mas | Double-taxation treaty |
| אישור תושבות | ishur toshavut | Residency certificate |
| טופס 2513 | tofes 2513 | Form 2513 (residency) |
| לוח סילוקין | luach silukin | Amortization schedule |
| תקופת גרייס | tkufat grace | Grace period |
| מועד פירעון | mo'ed pira'on | Maturity date |
| שערוך מט"ח | shi'aruch matach | FX revaluation |
| איחוד דוחות | ihud dohot | Consolidation |
| ביטולי איחוד | bituley ihud | Consolidation elimination |
| הוצאה לא מותרת בניכוי | hotza'a lo muteret ba-nikui | Non-deductible expense |
| ריבית תעריף | ribit ta'arif | Prime / reference rate |
| דמי ניהול | d'mey nihul | Management fee |
| מלווה | malve | Lender |
| לווה | love | Borrower |
| קרן | keren | Principal |
| ריבית | ribit | Interest |
| כשל | keshel | Default |
| טיוטה | tyuta | Draft |
| פעילה | pe'ilah | Active |
| נפרעה | nifre'a | Repaid |
| מוחזרה | muhzera | Restructured |

---

## 7. Test coverage summary (by suite)

| Suite | Tests | Notes |
|---|---|---|
| `originateLoan` | 5 | validation + §3(i) floor + §85A note |
| `buildAmortization` | 3 | level, bullet, zero-rate |
| `dayCountFraction` | 3 | ACT/365, ACT/360, 30/360 |
| `calculateInterest` | 3 | simple accrual, payment-split chunks, inverted-period guard |
| `recordPayment` | 4 | scheduled / late / full-repay / gross waterfall |
| `outstandingBalance` | 2 | multi-payment running total |
| `thinCapRules` | 4 | clean, D/E breach, BEPS 30 % EBITDA, input guard |
| `withholdingTax` | 5 | domestic, statutory, treaty relief, bank exception, negative guard |
| `currencyRevaluation` | 3 | USD gain, EUR loss, same-currency zero |
| `armsLengthSupport` | 3 | synthesised, supplied comparables, alias equivalence |
| `generateLoanAgreement` | 1 | bilingual clause presence |
| `consolidationElimination` | 1 | mirrored BS + P&L JV entries |
| `audit log` | 1 | do-not-delete invariant |
| **Total** | **38** | **all green** |

---

## 8. Known limitations & follow-ups

1. **BEPS carry-forward of disallowed interest** — not tracked here;
   the corporate-tax engine (AG-Y001 etc.) should pick up the
   non-deductible amount and carry it forward to the next year.
2. **Floating-rate reset curves** — the engine accepts the rate type
   but expects the caller to supply the **all-in rate** at origination.
   A future upgrade can accept a reference curve (prime, SOFR, LIBOR
   legacy) and reset the coupon at each payment date. Since the amortization
   schedule is rebuilt only at origination, a reset engine should call
   `originateLoan` on the restructured tranche rather than mutate the
   existing one — that is the additive pattern in this file.
3. **Form 1385 cross-module integration** — `armsLengthSupport` returns
   a shape that is *ready* for Form 1385 but the integration step lives
   in `AG-Y010` (transfer-pricing). A follow-up PR can add a thin
   adapter in `src/tax/transfer-pricing.js` that pulls all active
   IC loans via `ICLoans#listLoans({ status: 'active' })` and passes
   them into `generateForm1385`.
4. **Multi-tranche loans** — one loan record = one tranche. For a
   revolver with multiple drawdowns, model each drawdown as its own
   loan with a shared `intercompanyAgreement.reference`.
5. **Early payment premium / penalty** — not modelled. Add as a line
   item on `recordPayment` under a `fee` field if the IC agreement
   provides for one; current implementation only splits between
   principal and interest.

---

## 9. Files created

- `onyx-procurement/src/finance/ic-loans.js` (≈ 850 LOC)
- `onyx-procurement/test/finance/ic-loans.test.js` (≈ 420 LOC)
- `_qa-reports/AG-Y085-ic-loans.md` (this document)

**Nothing was deleted. Nothing outside the three files was modified.**
The module, the tests, and this report stand on their own.

---

*End of AG-Y085 report. לא מוחקים רק משדרגים ומגדלים.*
