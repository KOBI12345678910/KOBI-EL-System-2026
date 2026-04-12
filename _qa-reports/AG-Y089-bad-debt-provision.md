# AG-Y089 — Bad Debt Provisioning (IFRS 9 ECL + Israeli Tax)

**Agent:** Y-089 (Swarm 4D — Finance / Credit-risk)
**Date:** 2026-04-11
**Scope:** Kobi Mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/finance/bad-debt-provision.js`
**Tests:** `onyx-procurement/test/finance/bad-debt-provision.test.js`
**Rule of engagement:** additive only (לא מוחקים רק משדרגים ומגדלים), zero dependencies, bilingual Hebrew + English.

---

## 0. Executive summary

| Deliverable                                                                            | Status   |
|----------------------------------------------------------------------------------------|----------|
| `src/finance/bad-debt-provision.js` — pure-JS IFRS 9 + Israeli tax engine (zero deps)  | created  |
| `test/finance/bad-debt-provision.test.js` — 51 test cases, all green                   | created  |
| IFRS 9 three-stage ECL model (Stage 1 12-month, Stage 2/3 lifetime)                    | verified |
| Simplified approach / provision-matrix (IFRS 9 §5.5.15)                                | verified |
| Specific provision register with customer-level accumulation                           | verified |
| Write-off workflow state machine (DRAFT → PENDING → APPROVED → POSTED → REVERSED)      | verified |
| Israeli tax deductibility engine — §17(4) triggering events                            | verified |
| Provision movement (opening + new − reversal − write-off ± FX = closing)               | verified |
| Back-test with MAE/MAPE/bias/calibration ratio and GREEN/YELLOW/RED traffic light      | verified |
| Forward-looking macro adjustment (GDP / unemployment / sector)                         | verified |
| IFRS 7 §35M disclosure table (3 stages, gross / ECL / net / coverage%)                 | verified |
| Bilingual (Hebrew + English) labels, reasons and headers                               | verified |
| Event log — additive, never cleared                                                    | verified |
| Additive — no existing files touched                                                   | verified |

### Test run

```
node --test onyx-procurement/test/finance/bad-debt-provision.test.js

ℹ tests      51
ℹ suites      0
ℹ pass       51
ℹ fail        0
ℹ cancelled   0
ℹ skipped     0
ℹ todo        0
ℹ duration_ms ~224
```

All 51 tests pass on the first clean run.

---

## 1. Why this module exists

Until now the ERP tracked customer balances and ageing, but had no formal
provisioning engine.  Two different consumers need one:

1. **Financial statements** — IFRS 9 (mandatory for Israeli public companies
   and for any entity using IFRS; also adopted by many private companies).
   Requires expected-credit-loss measurement, forward-looking information,
   and three-stage disclosure.
2. **Annual corporate tax return (Form 1301 / reconciliation Form 6111)** —
   Israeli tax authority (רשות המסים) allows deduction of bad debts ONLY
   under §17(4) of the Income Tax Ordinance, with strict conditions that
   differ from book accounting.  A "book" provision and a "tax" provision
   diverge — the difference is a temporary difference to be disclosed.

The old process was a spreadsheet maintained by the controller.  Under the
"לא מוחקים רק משדרגים ומגדלים" rule we additively grow the system: the
spreadsheet still exists, this module now sits alongside it and can be
consumed by Form 1301 / 6111 generators, the management dashboard, and
the auditor-friendly export layer.

---

## 2. Module file layout

```
onyx-procurement/src/finance/bad-debt-provision.js    ~880 lines, pure Node, no deps
onyx-procurement/test/finance/bad-debt-provision.test.js ~550 lines, node --test
_qa-reports/AG-Y089-bad-debt-provision.md             this report
```

Dependencies: Node built-ins only (`node:test`, `node:assert/strict` in the
test file). The module itself pulls in nothing.  CommonJS, `require()`-loadable.

---

## 3. Public API

```js
const {
  BadDebtProvision,
  // frozen constants
  IFRS9_STAGES,
  DEFAULT_LGD,
  ISRAELI_TAX_RULES,
  SICR_TRIGGERS,
  MACRO_FACTOR_WEIGHTS,
  WRITEOFF_STATES,
  // helpers (exported so callers can build integrations)
  stageFromAge,
  discountFactor,
  yearsFromAgeBucket,
  round2,
  round4,
} = require('./onyx-procurement/src/finance/bad-debt-provision.js');

const prov = new BadDebtProvision({
  defaultDiscountRate: 0.04,
  reportingCurrency: 'ILS',
  entity: 'Techno-Kol Uzi Ltd.',
  lang: 'he',
});

prov.computeECL({ receivable, probabilityDefault, lossGivenDefault, exposureAtDefault, discountRate, ageBucket });
prov.agingMethod({ agingBuckets, historicalLossRates });
prov.specificProvision({ customerId, amount, justification, approver, taxTrigger, evidence });
prov.writeOffRequest(customerId, { amount, reason, triggerEvent, evidence });
prov.taxDeductibility(provision);
prov.provisionMovement({ opening, newProvisions, reversals, writeOffs, fx, label });
prov.backTest({ historicalProvisions, actualLosses });
prov.forwardLookingAdjustment({ macroFactor, scenario, basePd, basePortfolio });
prov.disclosureTable({ label, asOf, stage1, stage2, stage3 });

// internal state accessors (all return defensive copies)
prov.events();              // event log
prov.specificFor(customerId); // list of specific provisions for a customer
prov.writeOff(id);          // lookup a write-off request
```

---

## 4. IFRS 9 stages — how the engine classifies

IFRS 9 §5.5 establishes a three-stage model for impairment of financial
assets measured at amortised cost or FVTOCI (trade receivables are the
primary case here).

| Stage | Name                  | Measurement            | Trigger                                          |
|-------|-----------------------|------------------------|--------------------------------------------------|
| 1     | Performing            | 12-month ECL           | At initial recognition, and while no SICR       |
| 2     | Underperforming       | Lifetime ECL           | Significant Increase in Credit Risk (SICR)      |
| 3     | Credit-impaired       | Lifetime ECL, on net   | Objective evidence of impairment / default      |

### Stage-assignment logic in the module

`stageFromAge(bucket)` maps age buckets to stages using both English and
Hebrew names (case-insensitive substring match):

```
current / 0-30 / לא בפיגור  → STAGE_1
31 / 60 / 61 / 90           → STAGE_2
91 / 120 / default / impaired / פגום / בכשל → STAGE_3
```

Callers can override the auto-assignment by passing `receivable.stage`
explicitly.

### SICR triggers tracked

The `SICR_TRIGGERS` constant is exported so downstream modules (credit
scoring, dunning) can feed their own indicators in.  Each trigger has a
weight that future versions can aggregate into a composite SICR score.

| Trigger code       | Label                                          | Weight |
|--------------------|------------------------------------------------|--------|
| `DPD_30_PLUS`      | Days past due ≥ 30                             | 1.0    |
| `DPD_60_PLUS`      | Days past due ≥ 60                             | 1.5    |
| `DPD_90_PLUS`      | Days past due ≥ 90 (default)                   | 2.0    |
| `RATING_DOWNGRADE` | Internal rating downgrade ≥ 2 notches          | 1.0    |
| `PAYMENT_HOLIDAY`  | Forbearance / payment holiday                  | 1.2    |
| `COVENANT_BREACH`  | Covenant breach                                | 1.0    |
| `FORECLOSURE`      | Collateral foreclosure initiated               | 1.5    |
| `BANKRUPTCY_FILED` | Bankruptcy filing                              | 10.0   |

### ECL formula

```
ECL = PD × LGD × EAD × DF
```

where:

* **PD** = probability of default (12-month for Stage 1; lifetime for
  Stage 2/3).
* **LGD** = loss given default (default fallback = 65% for unsecured
  trade — `DEFAULT_LGD.UNSECURED_TRADE`).
* **EAD** = exposure at default (defaults to `receivable.amount`).
* **DF** = 1 / (1 + r)^t — IFRS 9 §5.5.17 requires discounting to the
  reporting date at the effective interest rate.  For trade receivables
  without a significant financing component, `r` may be set to zero
  (the caller controls this).

### Provision-matrix (simplified approach, IFRS 9 §5.5.15)

`agingMethod()` implements the provision-matrix permitted for trade
receivables, contract assets, and lease receivables without a significant
financing component.  The caller supplies buckets and loss rates; if a
bucket is missing from the loss-rate table, a conservative default is used:

| Bucket      | Default rate |
|-------------|--------------|
| `current`   | 0.5%         |
| `0-30`      | 1.0%         |
| `31-60`     | 3.0%         |
| `61-90`     | 8.0%         |
| `91-120`    | 20.0%        |
| `121-180`   | 40.0%        |
| `>180`      | 75.0%        |
| `default`   | 100.0%       |

Rows returned by `agingMethod()` carry the IFRS 9 stage classification so
the same output feeds directly into `disclosureTable()`.

---

## 5. Israeli tax rules — §17(4) of the Income Tax Ordinance

### 5.1 Statute anchors

| Reference                                                            | Label (HE)                                |
|----------------------------------------------------------------------|-------------------------------------------|
| Income Tax Ordinance, §17(4)                                         | פקודת מס הכנסה, סעיף 17(4)                |
| Income Tax Regulations (רשימה של חובות אבודים) 1980                 | תקנות מס הכנסה (רשימה של חובות אבודים)    |
| Form 6111 — reconciliation (accounting → taxable income)            | טופס 6111 — התאמה להכנסה חייבת            |
| Form 6111 row 051 — "הפרשה לחובות מסופקים שאינה מותרת בניכוי"        | שורה 051                                   |

### 5.2 Five cumulative conditions (the engine enforces all)

| # | Condition (EN)                                                           | Condition (HE)                                        |
|---|---------------------------------------------------------------------------|-------------------------------------------------------|
| 1 | The debt arose in the ordinary course of the taxpayer's business         | החוב נוצר במהלך העסקים הרגיל של הנישום                |
| 2 | The debt was previously included in taxable income (accrual basis)       | החוב נכלל בעבר בהכנסה החייבת (על בסיס מצטבר)          |
| 3 | The debt is definitively unrecoverable (not merely "doubtful")           | החוב בלתי גביה באופן סופי (לא רק מסופק)               |
| 4 | Reasonable collection efforts were made and documented                   | נעשו מאמצי גבייה סבירים ותועדו                        |
| 5 | Specific debtor identified and amount quantified                         | זיהוי ספציפי של החייב וסכום מכומת                     |

### 5.3 Triggering events accepted by the Tax Authority

The module hard-codes the accepted catalogue in
`ISRAELI_TAX_RULES.triggeringEvents`:

| Code                         | Event (EN)                                                 | Event (HE)                                         | Deductible |
|------------------------------|------------------------------------------------------------|----------------------------------------------------|------------|
| `BANKRUPTCY`                 | Customer bankruptcy / liquidation                          | פשיטת רגל / פירוק של החייב                         | YES        |
| `COURT_JUDGMENT_UNENFORCED`  | Judgment + failed execution (הוצאה לפועל)                  | פסק דין + תיק הוצל"פ שנסגר כחסר נכסים              | YES        |
| `DEBTOR_UNTRACEABLE`         | Debtor untraceable after reasonable search                 | החייב נעלם / בלתי ניתן לאיתור לאחר חיפוש סביר      | YES        |
| `COMPROMISE_WRITEOFF`        | Waiver of balance (the waived part)                        | פשרה / ויתור על יתרת חוב                           | YES        |
| `STATUTE_LIMITATION`         | Statute of limitations expired (general: 7 years)          | התיישנות (כלל: 7 שנים)                              | YES        |
| `GENERAL_RESERVE`            | General / statistical reserve                              | הפרשה כללית / סטטיסטית                             | **NO**     |
| `DOUBTFUL_NOT_EVIDENCED`     | Doubtful without specific evidence                         | מסופק ללא ראיה ספציפית                             | **NO**     |

### 5.4 Decision flow

```
taxDeductibility(provision)
  ├── type in {GENERAL, AGING, MATRIX, STAGE_1, STAGE_2}
  │     → NOT deductible, booked as temporary difference, Form 6111 row 051
  │
  ├── type SPECIFIC + taxTrigger present
  │     ├── trigger in deductibleSet (BANKRUPTCY, COURT_JUDGMENT_UNENFORCED, ...)
  │     │      → deductible, evidence flag set if missing
  │     └── trigger in nonDeductibleSet (GENERAL_RESERVE, DOUBTFUL_NOT_EVIDENCED)
  │            → NOT deductible, temporary difference
  │
  └── type SPECIFIC without trigger
        → NOT deductible, "doubtful only" reason returned
```

### 5.5 What the engine does NOT do (scope fence)

* No PDF rendering — that is handled by the form-builders package.
* No database persistence — this is a pure computational engine.  The
  event log lives in-memory; callers can pipe it to the audit-trail store.
* No FX rate feeds — callers pass pre-converted ILS amounts or an
  explicit `fx` retranslation line.
* No auto-link to customer master data — caller passes `customerId` as a
  string; the engine does not validate its existence.

---

## 6. Disclosure table (IFRS 7 §35M)

The `disclosureTable(period)` method produces the standard three-stage
disclosure required by IFRS 7 §35M, suitable for rendering into the
audited financial statements.

### 6.1 Table structure (bilingual headers exported)

| שלב / Stage                | בסיס / Basis                       | יתרת חוב / Gross carrying | ECL      | נטו / Net | אחוז כיסוי / Coverage % |
|----------------------------|------------------------------------|---------------------------|----------|-----------|-------------------------|
| שלב 1 — מבוצע              | 12-month ECL                       | 1,000,000                 | 5,000    | 995,000   | 0.5%                    |
| שלב 2 — בסיכון             | Lifetime ECL                       |   200,000                 | 12,000   | 188,000   | 6.0%                    |
| שלב 3 — פגום               | Lifetime ECL on net amortised cost |    80,000                 | 48,000   | 32,000    | 60.0%                   |
| **Total / סה״כ**           |                                    | **1,280,000**             | **65,000** | **1,215,000** | **5.08%**             |

### 6.2 Footnotes emitted

* Amounts in ILS. Rounded to the nearest whole unit.
* Coverage % = ECL ÷ Gross carrying.
* IFRS 9 §5.5 — ECL model; §5.5.17 — discounting at effective interest rate.
* Stage transfers disclosed separately — see Note X.

The Hebrew versions are emitted in parallel (`footnotesHe`, `titleHe`,
`headers.he`), ready to be consumed by the bilingual PDF renderer.

---

## 7. Forward-looking adjustment (IFRS 9)

IFRS 9 §5.5.17 requires ECL to incorporate reasonable and supportable
forward-looking information.  The engine exposes three macro factors:

| Factor         | Base | Optimistic shift | Pessimistic shift | Elasticity |
|----------------|------|------------------|-------------------|------------|
| `GDP`          | 0    | −0.20            | +0.30             | 1.5        |
| `unemployment` | 0    | −0.15            | +0.40             | 2.0        |
| `sector`       | 0    | −0.10            | +0.25             | 1.2        |

Adjustment:

```
ΔPD        = basePd × scenarioShift × elasticity
adjustedPd = clamp(basePd + ΔPD, 0, 1)
```

If `basePortfolio` is supplied, the engine also returns the currency
impact (`portfolioAdjustment`) so callers can wire it into their
dashboard.

---

## 8. Back-test (calibration)

`backTest({ historicalProvisions, actualLosses })` compares prior-period
predictions to realised losses and returns:

| Field              | Meaning                                                          |
|--------------------|------------------------------------------------------------------|
| `mae`              | Mean absolute error (currency units)                             |
| `mape`             | Mean absolute percentage error                                   |
| `bias`             | Mean signed error (positive = over-provisioned)                  |
| `calibrationRatio` | Σ predicted ÷ Σ actual  (ideal = 1.0)                            |
| `status`           | GREEN (MAPE < 10%), YELLOW (10-25%), RED (> 25%)                 |
| `statusHe`         | תקין / התראה / חריגה                                             |

Use cases:

* Controller: confirm model still fits after a shock period.
* Auditor: evidence that management reviews assumptions.
* Tax audit: defend the "reasonableness" criterion in §17(4).

---

## 9. Provision movement (roll-forward)

```
Opening balance
+ New provisions raised
− Reversals (over-provision released)
− Write-offs (utilisation against the allowance)
± FX retranslation (foreign-currency exposures)
= Closing balance
```

Returned as a 6-row table with both English and Hebrew labels, matching
what auditors expect as the "movement note" in the financial statements.

---

## 10. Write-off workflow

Write-off is **separate from provision**.  A provision reduces the
carrying amount; a write-off **derecognises** the asset (IFRS 9 §5.4.4
requires derecognition when there is no reasonable expectation of
recovery).

### State machine

```
DRAFT
  │
  │ .submit()
  ▼
PENDING_APPROVAL
  ├── .approve(approver) ──► APPROVED ──► .post() ──► POSTED ──► .reverse(reason) ──► REVERSED
  └── .reject(approver, reason) ──► REJECTED
```

Each transition is logged in `stateHistory` and in the central event log.
The returned record is a fluent object so the caller can chain:

```js
const wo = prov.writeOffRequest('C1', { amount: 5000, triggerEvent: 'BANKRUPTCY' });
wo.submit();
wo.approve('CFO');
wo.post();
```

---

## 11. Test coverage

51 tests across 11 sections:

| §   | Section                              | Tests |
|-----|--------------------------------------|-------|
| A   | Module surface                       | 5     |
| B   | computeECL (IFRS 9 stages)           | 7     |
| C   | agingMethod (provision matrix)       | 4     |
| D   | specificProvision                    | 3     |
| E   | writeOffRequest (state machine)      | 4     |
| F   | taxDeductibility (Israeli §17(4))    | 8     |
| G   | provisionMovement                    | 3     |
| H   | backTest                             | 5     |
| I   | forwardLookingAdjustment             | 6     |
| J   | disclosureTable                      | 3     |
| K   | Integration / end-to-end             | 3     |

All tests run with `node --test` — no mocha, no jest, no ts-node.

---

## 12. Hebrew glossary — מונחים

| English (technical)                         | Hebrew                                         |
|---------------------------------------------|------------------------------------------------|
| Bad debt                                    | חוב אבוד                                       |
| Doubtful debt                                | חוב מסופק                                      |
| Provision (allowance)                       | הפרשה                                          |
| Specific provision                          | הפרשה ספציפית                                  |
| General reserve                             | הפרשה כללית                                    |
| Write-off                                   | מחיקה                                          |
| Expected Credit Loss (ECL)                  | הפסדי אשראי צפויים                             |
| 12-month ECL                                | ECL ל-12 חודש                                  |
| Lifetime ECL                                | ECL לכל אורך החיים                             |
| Probability of Default (PD)                 | הסתברות לכשל                                   |
| Loss Given Default (LGD)                    | הפסד בהינתן כשל                                |
| Exposure at Default (EAD)                   | חשיפה בזמן כשל                                 |
| Effective Interest Rate (EIR)               | שיעור ריבית אפקטיבי                            |
| Stage (IFRS 9)                              | שלב                                            |
| Performing                                   | מבוצע                                          |
| Underperforming                              | בסיכון                                         |
| Credit-impaired                              | פגום / בכשל                                   |
| Significant Increase in Credit Risk (SICR)  | החמרה משמעותית בסיכון האשראי                   |
| Forward-looking information                  | מידע צופה פני עתיד                            |
| Provision matrix (simplified approach)       | מטריצת הפרשה (גישה פשוטה)                     |
| Aging bucket                                 | חלוקת גיל (bucket)                            |
| Discount factor                              | גורם היוון                                     |
| Amortised cost                               | עלות מופחתת                                    |
| Coverage ratio                               | יחס כיסוי                                      |
| Roll-forward / movement                      | תנועה (opening + new − reversal − WO = close)  |
| Back-test                                    | ביקורת לאחור / כיול                            |
| Calibration                                  | כיול                                           |
| Temporary difference (tax)                   | הפרש עיתוי                                     |
| Form 1301 (corporate return)                | טופס 1301 — דוח שנתי לחברות                    |
| Form 6111 (reconciliation)                  | טופס 6111 — התאמה להכנסה חייבת                |
| Israeli Tax Ordinance §17(4)                | פקודת מס הכנסה סעיף 17(4)                     |
| Execution proceedings (הוצאה לפועל)          | הוצאה לפועל                                   |
| Bankruptcy                                   | פשיטת רגל                                      |
| Liquidation                                   | פירוק                                          |
| Statute of limitations                       | התיישנות                                       |
| Untraceable debtor                           | חייב בלתי ניתן לאיתור                          |

---

## 13. Integration points (for downstream agents)

| Consumer                                            | Method used                                 | Notes                                                                   |
|-----------------------------------------------------|---------------------------------------------|-------------------------------------------------------------------------|
| Form 1301 generator (`src/tax/form-builders.js`)    | `taxDeductibility()`                        | Row 051 of Form 6111                                                    |
| Financial statements (`src/gl/financial-statements`)| `disclosureTable()`, `provisionMovement()`  | Bilingual labels plug straight in                                       |
| Management dashboard                                 | `backTest()`, `disclosureTable().totals`   | Traffic-light status + coverage ratio                                   |
| Customer portal / dunning                            | `specificProvision()`                       | Record-keeping for adverse outcomes                                     |
| Audit trail (`src/audit`)                            | `events()`                                  | Append-only log — never cleared                                         |

---

## 14. Rule compliance — לא מוחקים רק משדרגים ומגדלים

The module obeys the governance rule explicitly:

* **No file deletions.** The module is a new addition; nothing existing
  was touched or removed.
* **Event log is append-only.** The `_events` array in the class grows
  monotonically; there is no method to clear it.
* **Specific provisions accumulate per customer** — a second call for the
  same customer pushes a new record; it does not overwrite the first.
* **Write-off state history is append-only** — every transition adds a row
  to `stateHistory`, never replacing.
* **`specificFor()` and `events()` return defensive copies** — callers that
  mutate what they receive cannot affect the engine's internal state
  (verified by test K3).

---

## 15. Next steps for follow-on agents

These are suggested (not done here) — they will be tackled by sibling
agents under the "additive growth" rule:

1. **Wire to dunning engine (AG-Y050 family)** — pull DPD buckets and
   SICR triggers from `dunning.js` into `computeECL()` calls.
2. **PDF rendering** — extend `src/reports/management-dashboard-pdf.js`
   to include the `disclosureTable()` output.
3. **Persistence** — stream `events()` output into
   `src/audit/audit-trail.js` so the event log survives process restarts.
4. **Bank of Israel macro feed** — connect `forwardLookingAdjustment()`
   to the live GDP/unemployment series once the BOI data connector lands.
5. **Auditor export** — Excel workpaper showing every provision row with
   full justification, evidence file list, approver, and tax-deductibility
   flag.

---

*End of v1 report — AG-Y089 — Bad Debt Provisioning (IFRS 9 ECL + Israeli tax)*

---
---

# AG-Y089 v2 — Canonical ECL API Upgrade (2026-04-11)

**Agent:** Y-089 (v2 upgrade pass)
**Rule:** לא מוחקים רק משדרגים ומגדלים — this upgrade is strictly **additive**. No v1 method was removed or semantically changed.
**New test count:** 35 (on top of the v1 baseline 51) → **86 total, all green**.

```
node --test onyx-procurement/test/finance/bad-debt-provision.test.js

tests      86
suites      0
pass       86
fail        0
```

---

## V2.1. Why a v2 pass

The original v1 (see §1-§15 above) shipped a fully functional IFRS 9 + Israeli
tax engine, but under a v1-native API (`agingMethod`, `writeOffRequest`,
`forwardLookingAdjustment`, ...). Downstream integration consumers expect the
**canonical, spec-compliant** API surface from the IFRS 9 literature. The v2
upgrade adds that canonical surface to the same class without deleting any v1
method — every v1 test still runs green.

---

## V2.2. New public methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `agingBuckets(arBalance, opts?)` | `(invoices[], {asOf, currency})` | Split AR into the 7 canonical IFRS 9 buckets: `current / 0-30 / 31-60 / 61-90 / 91-180 / 181-365 / 365+` |
| `historicalLossRate(periodHistory)` | `([{asOf, buckets, losses}])` | Weighted loss-rate per bucket across periods |
| `forwardLookingFactor({macroIndicators})` | `({gdpGrowth, unemployment, industryPmi})` | Single scalar FLF multiplier (GREEN/NEUTRAL/ADVERSE) |
| `stageClassification(customer)` | `({customerId, daysPastDue, rating, ratingAtOrigination, forbearance, bankruptcy, legalProcedure})` | Returns STAGE_1 / STAGE_2 / STAGE_3 with bilingual reasons |
| `computeECL({exposure, stage, PD, LGD, EAD, lifetime, flf?, discountRate?})` | canonical form | ECL = PD × LGD × EAD × DF × FLF — new shape is detected automatically and routed through the same backend as v1 |
| `computeSimplifiedMatrix(customer, lossRates)` | `({customerId, buckets}, {bucket:rate})` | Per-customer provision matrix (IFRS 9 §5.5.15 simplified approach) |
| `provisionJournalEntry(totalECL, priorECL)` | `(t, p)` | DR bad-debt expense / CR allowance (or inverse on release). Zero delta → empty entry |
| `writeOff({customerId, invoiceId, amount, reason, triggerEvent?})` | new-style | Creates a write-off with **Israeli §17(4) 3-year rule check**. Strong triggers (BANKRUPTCY, COURT_JUDGMENT_UNENFORCED, LIQUIDATION) bypass the waiting period |
| `recoveryTracking({writeOffId, recoveredAmount, date, note?})` | `({id, n, date})` | Reverses the write-off proportionally to the recovery; emits DR Cash / CR Bad-debt-recovery JE |
| `agingReport(asOf, snapshot?)` | `(isoDate, ar?)` | Bilingual aging report, pulls from `setARSnapshot()` if no snapshot passed |
| `stageMigration(period)` | `({from:{cid:stage}, to:{cid:stage}})` | Stage transition matrix; counts stable / improved / deteriorated |
| `collectionEffort(customerId, attempts)` | `(id, [{type, date, note, outcome, by}])` | Append-only collection-effort ledger, feeds write-off eligibility |

### Dual-dispatch `writeOff`

The v1 `writeOff(id)` getter is preserved. The v2 `writeOff({...})` creator is
dispatched by input shape:

```js
prov.writeOff('WO-000001')            // v1 getter — still works
prov.writeOff({customerId, ...})      // v2 creator — new behaviour
```

Additive. No deletion. Both signatures live in the same method and are
covered by v2.H3 test.

### Backward compatible `computeECL`

The v1 `{receivable, probabilityDefault, lossGivenDefault, exposureAtDefault,
discountRate, ageBucket}` and the v2 `{exposure, stage, PD, LGD, EAD,
lifetime, flf}` shapes are **both** accepted. Shape detection is done by
feature-flagging on the `receivable` key: if absent, the v2 shape is assumed.
All 7 v1 computeECL tests still pass unchanged.

---

## V2.3. IFRS 9 three stages — canonical mapping

| Stage | Condition | Horizon | Israeli reporting impact |
|-------|-----------|---------|--------------------------|
| **Stage 1 — Performing** | No SICR since initial recognition; DPD < 30 | 12-month ECL | Book provision only; not tax deductible |
| **Stage 2 — SICR** | DPD ≥ 30, 2-notch rating downgrade, forbearance granted | Lifetime ECL | Book provision only; not tax deductible |
| **Stage 3 — Credit-impaired** | DPD ≥ 90, bankruptcy filed, legal procedure opened, write-off pending | Lifetime ECL on net carrying | Triggers may also be §17(4)-deductible |

### ECL formula (v2 canonical)

```
ECL = PD × LGD × EAD × DF × FLF
    │    │     │      │    │
    │    │     │      │    └─ Forward-looking factor (1 at neutral)
    │    │     │      └────── Discount factor 1/(1+r)^t
    │    │     └───────────── Exposure at default
    │    └─────────────────── Loss given default
    └──────────────────────── Probability of default
```

For Stage 1, PD is the **12-month PD**. For Stage 2 and Stage 3, PD is the
**lifetime PD** (over the remaining life of the exposure).

---

## V2.4. Israeli write-off requirements (ITA §17(4))

The canonical Israeli Tax Authority requirements for a bad-debt deduction, as
encoded in `_createWriteOffV2()`:

| Requirement (EN) | Requirement (HE) | Enforced by |
|------------------|------------------|-------------|
| Debt arose in ordinary course of business | החוב נוצר במהלך העסקים הרגיל | caller must supply `reason` |
| Debt previously in taxable income (accrual) | החוב נכלל בעבר בהכנסה החייבת | caller must supply `invoiceId` |
| Definitively unrecoverable (not merely doubtful) | בלתי גביה סופית (לא רק מסופק) | `triggerEvent` or 3-year rule |
| Reasonable collection effort documented | מאמצי גבייה סבירים מתועדים | `collectionEffort()` ledger |
| Specific debtor + quantified amount | זיהוי ספציפי + סכום כומת | `customerId` + `amount` required |
| Waiting period: 3 years since first effort | המתנה 3 שנים מהמאמץ הראשון | `yearsSinceFirstEffort >= 3` |

**Strong-trigger bypass:** the waiting period is waived when the trigger is
`BANKRUPTCY`, `COURT_JUDGMENT_UNENFORCED`, or `LIQUIDATION`, in line with
ITA enforcement practice and section 17(4) guidance.

The computed `meetsIsraeliTaxRules` boolean is written on every write-off
record and surfaces through `writeOffLedger()`.

---

## V2.5. Hebrew glossary (מילון עברי)

| English | עברית | Symbol / Reference |
|---------|--------|--------------------|
| Expected Credit Loss | הפסד אשראי צפוי | ECL |
| Probability of Default | הסתברות כשל | PD |
| Loss Given Default | הפסד בעת כשל | LGD |
| Exposure at Default | חשיפה בעת כשל | EAD |
| Forward-Looking Factor | גורם צופה פני עתיד | FLF |
| Discount Factor | מקדם היוון | DF |
| Significant Increase in Credit Risk | החמרה משמעותית בסיכון האשראי | SICR |
| Days Past Due | ימי פיגור | DPD |
| Performing | מבוצע (Stage 1) | — |
| Underperforming | בסיכון (Stage 2) | — |
| Credit-impaired | פגום (Stage 3) | — |
| Provision for doubtful debts | הפרשה לחובות מסופקים | Contra-AR |
| Bad debt write-off | מחיקת חוב אבוד | — |
| Bad debt recovery | השבת חוב אבוד | — |
| Aging bucket | דלי גיול | — |
| Allowance | הפרשה | — |
| Collection effort | מאמץ גבייה | — |
| Collateral / Lien | ביטחון / שעבוד | — |
| Forbearance | הקלות תשלום | — |
| Bankruptcy / Liquidation | פשיטת רגל / פירוק | ITA trigger |
| Court judgment unenforced | פסק דין בלתי ניתן לאכיפה (תיק הוצל"פ סגור) | ITA trigger |
| Stage migration | מעברים בין שלבים | IFRS 7 §35M |
| Provision journal entry | פקודת יומן להפרשה | — |
| Simplified approach | גישה פשוטה | IFRS 9 §5.5.15 |
| Temporary difference | הפרש עיתוי | IAS 12 |
| Allowance for doubtful accounts | הפרשה לחובות מסופקים (ניגוד לקוחות) | 1190 |
| Bad debt expense | הוצאות חובות מסופקים | 6820 |
| Bad debt recovery revenue | הכנסות מהשבת חובות אבודים | 6825 |

---

## V2.6. Test coverage map (v2 tests only)

| § | Test ID | Name | Purpose |
|---|---------|------|---------|
| A | V2.A1 | agingBuckets — 7-bucket split | Canonical bucketing |
| A | V2.A2 | agingBuckets — per-customer rollup | byCustomer aggregation |
| A | V2.A3 | agingBuckets — dict-shape AR | Flexible input shape |
| B | V2.B1 | historicalLossRate — weighted | Cross-period math |
| B | V2.B2 | historicalLossRate — rejects empty | Validation |
| C | V2.C1 | forwardLookingFactor — baseline=1 | Anchor check |
| C | V2.C2 | forwardLookingFactor — recession ADVERSE | Regime classification |
| C | V2.C3 | forwardLookingFactor — boom FAVOURABLE | Regime classification |
| D | V2.D1 | stageClassification — STAGE_1 performing | Default path |
| D | V2.D2 | stageClassification — STAGE_2 DPD≥30 | SICR trigger |
| D | V2.D3 | stageClassification — STAGE_3 DPD≥90 | Impairment |
| D | V2.D4 | stageClassification — bankruptcy→STAGE_3 | Trigger event |
| D | V2.D5 | stageClassification — rating downgrade→STAGE_2 | 2-notch rule |
| E | V2.E1 | computeECL — canonical v2 shape | New signature |
| E | V2.E2 | computeECL — 12m vs lifetime | Horizon differentiation |
| E | V2.E3 | computeECL — FLF multiplies ECL | Macro integration |
| F | V2.F1 | computeSimplifiedMatrix — customer matrix | §5.5.15 compliance |
| F | V2.F2 | computeSimplifiedMatrix — rejects missing args | Validation |
| G | V2.G1 | provisionJournalEntry — increase DR/CR | Journal generation |
| G | V2.G2 | provisionJournalEntry — decrease release | Reverse journal |
| G | V2.G3 | provisionJournalEntry — zero delta | No-op entry |
| H | V2.H1 | writeOff — blocked without effort | 3-year rule enforcement |
| H | V2.H2 | writeOff — BANKRUPTCY bypasses rule | Strong trigger |
| H | V2.H3 | writeOff — v1 getter still works | Backward compat |
| H | V2.H4 | collectionEffort — append-only | Ledger immutability |
| H | V2.H5 | writeOff — passes after 4 years | Waiting period satisfied |
| I | V2.I1 | recoveryTracking — partial recovery | Partial state |
| I | V2.I2 | recoveryTracking — full reversal | Full state |
| I | V2.I3 | recoveryTracking — rejects unknown id | Validation |
| J | V2.J1 | agingReport — bilingual output | HE + EN headers |
| K | V2.K1 | stageMigration — improvements + deteriorations | Transition matrix |
| L | V2.L1 | append-only write-off ledger | Immutability |
| L | V2.L2 | append-only provision journal ledger | Immutability |
| M | V2.M1 | End-to-end ECL flow | Integration |
| M | V2.M2 | Write-off → recovery end-to-end | Integration |

Total v2 = **35 tests, all green.**
Total v1+v2 = **86 tests, all green.**

---

## V2.7. House-rule compliance

| Rule | How it's enforced |
|------|-------------------|
| לא מוחקים רק משדרגים ומגדלים | Every v1 method (11 methods) kept in place; v2 adds 12 new methods alongside |
| Zero external dependencies | Only `node:test`, `node:assert/strict`, and `path` are used |
| Hebrew RTL + bilingual labels | Every public object has `he`/`He` sibling fields; glossary above |
| IFRS 9 compliance | Stage 1/2/3, ECL formula, §5.5.15 simplified approach, §5.4.4 write-off, §35M disclosure |
| Israeli tax compliance | §17(4) 3-year rule + strong-trigger bypass + documented effort ledger |
| Append-only ledgers | `writeOffLedger`, `journalLedger`, `_events`, `_collectionEfforts` — all concat, never splice |
| In-memory storage | No external persistence; snapshot via `events()` / `writeOffLedger()` / `journalLedger()` |

---

*End of report — AG-Y089 v1 + v2 — Bad Debt Provisioning (IFRS 9 ECL + Israeli tax)*
