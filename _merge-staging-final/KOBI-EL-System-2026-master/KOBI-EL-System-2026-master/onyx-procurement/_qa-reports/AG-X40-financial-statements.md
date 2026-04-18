# QA Report — AG-X40 Financial Statements Generator

**Agent:** X-40 (Swarm 3C)
**System:** Techno-Kol Uzi ERP — Kobi EL mega-ERP 2026
**Date:** 2026-04-11
**Status:** GREEN — 30 / 30 unit tests passing (zero dependencies)

## Deliverables

| File | Path | Purpose |
| --- | --- | --- |
| `financial-statements.js` | `onyx-procurement/src/gl/financial-statements.js` | Full financial-statement generator (TB, BS, IS, CF, Equity) |
| `financial-statements.test.js` | `onyx-procurement/test/payroll/financial-statements.test.js` | 30 synthetic-data unit tests covering every public API |
| `AG-X40-financial-statements.md` | `onyx-procurement/_qa-reports/AG-X40-financial-statements.md` | This QA report |

## Scope

A zero-dependency, pure-JavaScript generator for the full suite of
Israeli statutory and managerial financial statements. Compliant with
Israeli GAAP and IFRS for SMEs. Every figure is bilingual (Hebrew +
English) and carries an audit trail back to the source GL lines so the
front-end can drill down.

### Reports Produced

1. **Trial Balance (מאזן בוחן)**
   - Accounts with opening / movement / closing split (debit & credit)
   - Signed closing balance using normal-side convention per section
   - Subtotals by section (assets / liab / equity / revenue / cogs / opex / finance / tax)
   - Balanced check (total debits = total credits) with tolerant rounding

2. **Balance Sheet (מאזן)**
   - Current + non-current assets (נכסים שוטפים / שאינם שוטפים)
   - Current + non-current liabilities
   - Equity with synthetic retained-earnings line folding the period's
     operating result into book equity so `Assets = Liab + Equity` holds
   - Comparative-date column with variance and percent change
   - Fundamental balance check (assets = liab + equity)

3. **Income Statement (דו"ח רווח והפסד)**
   - Revenue → COGS → Gross Profit (+ gross margin %)
   - Operating expenses bucketed by category → Operating Profit (+ margin %)
   - Finance net (income vs expense)
   - Pre-tax profit
   - Israeli 23 % corporate tax
   - Net profit (+ net margin %)
   - Prior-period comparative OR YoY same-period-last-year
   - Growth % for revenue / gross / operating / net

4. **Cash Flow Statement (דו"ח תזרים מזומנים — שיטה עקיפה)**
   - Operating: pre-tax income + non-cash addbacks + ΔWC
     - Depreciation / amortisation automatically detected and added back
     - Depreciation credits to asset accounts are excluded from investing
       to avoid double counting
   - Investing: Δ non-current assets (net of non-cash items)
   - Financing: Δ non-current liabilities + equity capital movements - dividends
   - Begin + net change = end cash reconciliation check

5. **Statement of Changes in Equity (דו"ח על השינויים בהון העצמי)**
   - Opening + movements (share capital, dividends, period NI) + closing
   - Automatic classification of movements based on account names

### Additional Features

- **Period selection** — accepts `{year, month}`, `{year, quarter}`,
  `{year}`, `{from, to}` custom range, or shorthand strings
  (`'2026-Q1'`, `'2026-03'`, `'2026'`)
- **Prior-period comparison** — `priorPeriod()` for month/quarter/year
  and length-mirroring for custom ranges
- **YoY comparison** — `yoyPeriod()` returns same period last year
- **Consolidation** — `entities` filter + `eliminations` array, with an
  injectable `consolidator` function for Agent X-42 integration
- **Multi-currency** — `fx_to_ils` on each line, FX applied at
  normalisation so all totals are ILS
- **Drill-down** — every account row carries `audit` with source line
  IDs for both opening and movement
- **Exports**
  - `toExcelXml(pack)` — SpreadsheetML 2003 XML (zero-dep, opens in Excel)
  - `toPrintableText(pack)` — readable text summary for PDF generators
- **Auditor-ready format** — deterministic output (no `Date.now()`),
  section totals, subtotals, comparative and variance columns,
  balancing checks with tolerant rounding

## Israeli Accounting Compliance

- **Corporate tax rate:** 23 % (since 2018) — exposed as `CORPORATE_TAX_RATE`
- **Chart of accounts:** standard Israeli תקינה prefixes (1xxx assets,
  2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx COGS, 6xxx/7xxx opex,
  8xxx finance, 9xxx tax)
- **Bilingual labels:** every section, every audit column, every exported
  cell carries Hebrew AND English labels (RTL-safe)
- **Base currency:** ILS throughout; multi-currency rolled up via `fx_to_ils`
- **Balance tolerance:** 0.02 ILS for check assertions (handles 2dp drift)

## Public API

```js
const fs = require('./src/gl/financial-statements.js');

fs.trialBalance(period, { glLines, priorGlLines?, entities?, eliminations? })
  → { period, accounts, subtotals, totals, balanced, diff, meta }

fs.balanceSheet(asOf, { glLines, comparativeDate?, entities?, eliminations? })
  → { as_of, assets, liabilities, equity, totals, comparative, variance, checks, meta }

fs.incomeStatement(fromDate, toDate, { glLines, prior?, yoy?, taxRate? })
  → { period, revenue, cogs, opex, finance_net, profit, margins, tax, comparative, growth, meta }

fs.cashFlowStatement(fromDate, toDate, { glLines, priorGlLines?, nonCashAccounts?, dividendsPaid? })
  → { period, operating, investing, financing, net_change, beginning_cash, ending_cash, reconciliation, meta }

fs.equityStatement(period, { glLines, taxRate? })
  → { period, rows, opening_total, movements, closing_total, meta }

fs.reportPack(period, opts)
  → { period, trial_balance, income_statement, balance_sheet, cash_flow_statement, equity_statement, checks, meta }

// Export helpers
fs.toExcelXml(pack) → string (SpreadsheetML 2003 XML)
fs.toPrintableText(pack) → string
```

## Test Results

```
▶ test/payroll/financial-statements.test.js
  ✔ 1) exports: module exposes the required public API
  ✔ 2) resolvePeriod: month / quarter / year / custom / shorthand
  ✔ 3) priorPeriod: month/quarter/year
  ✔ 4) yoyPeriod: same period last year
  ✔ 5) classify: by account number prefix
  ✔ 6) normaliseLine: FX converts to ILS
  ✔ 7) trialBalance: balanced on well-formed ledger
  ✔ 8) trialBalance: imbalance is surfaced
  ✔ 9) trialBalance: subtotals include every used section
  ✔ 10) trialBalance: opening / movement / closing split
  ✔ 11) balanceSheet: total assets = total liab + equity
  ✔ 12) balanceSheet: comparative date produces variance
  ✔ 13) balanceSheet: net income folds into equity
  ✔ 14) incomeStatement: revenue → gross → operating → net cascade
  ✔ 15) incomeStatement: margin percents
  ✔ 16) incomeStatement: yoy comparative growth
  ✔ 17) incomeStatement: applies 23% Israeli corporate tax
  ✔ 18) cashFlowStatement: indirect method with NI + depreciation
  ✔ 19) cashFlowStatement: begin + net = ending cash
  ✔ 20) cashFlowStatement: investing vs financing separation
  ✔ 21) equityStatement: opening + movements + closing rows
  ✔ 22) equityStatement: tracks dividends and new share capital
  ✔ 23) reportPack: bundles all statements with checks
  ✔ 24) consolidation: entities filter narrows the ledger
  ✔ 25) consolidation: eliminations net out intercompany
  ✔ 26) toExcelXml: generates valid SpreadsheetML
  ✔ 27) toPrintableText: readable text summary
  ✔ 28) multi-currency: USD/EUR roll up to ILS
  ✔ 29) empty inputs: reports return full structure without crashing
  ✔ 30) drill-down audit ids preserved on every account row

ℹ tests 30
ℹ pass 30
ℹ fail 0
ℹ duration_ms ~165
```

## Invariants Verified

1. **Double-entry invariant** — when GL debits = credits, the balance
   sheet automatically satisfies `Assets = Liabilities + Equity`. The
   synthetic retained-earnings line folds `Revenue - COGS - Opex -
   Finance - BookedTax` into equity, and an accrued-tax liability is
   auto-synthesised when tax has not been booked, so the BS always balances.
2. **Cash-flow reconciliation** — `beginning_cash + operating +
   investing + financing = ending_cash` within `BALANCE_TOLERANCE`.
3. **Deterministic output** — no `Date.now()` or `Math.random()` inside
   the module; two identical inputs always produce identical outputs.
4. **Zero dependencies** — only Node built-ins (`fs`, `path`) are even
   imported, and only for path resolution. The statements engine itself
   is pure math.

## Known Limits / Future Work

- Direct-method cash flow not yet implemented (indirect only)
- The income-statement "category" mapping for opex uses only the
  prefix-based subsection — callers can extend via the `kind` field on
  GL lines if finer categorisation is needed
- Consolidation eliminations default their offset leg to account `2195`
  ("Intercompany Elimination Clearing"); override via
  `eliminations[i].offset_account` when needed
- PDF export is delegated to Agent X-48 (`src/reports/pdf-generator.js`)
  via the `toPrintableText()` bridge — a fully-typeset PDF is out of
  scope for this agent
- `nonCashAccounts` opts array is available but optional — by default
  depreciation/amortisation lines are matched via the regex
  `/depreciation|amortisation|amortization|פחת|הפחתות/i` on name fields

## Sign-off

- Module is ready for integration into the GL reporting pipeline.
- All 30 unit tests pass on Node 22.x with zero external dependencies.
- Output is deterministic, auditor-ready, and fully bilingual.
- Compatible with Agent X-42 (consolidation) via the injectable
  `consolidator` hook.
- Compatible with Agent X-48 (PDF generator) via `toPrintableText()`
  and Excel export via `toExcelXml()`.
