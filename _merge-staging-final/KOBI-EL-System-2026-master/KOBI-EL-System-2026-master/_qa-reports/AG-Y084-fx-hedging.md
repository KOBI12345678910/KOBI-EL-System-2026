# AG-Y084 — FX Hedging Tracker (READ-ONLY)

**Agent:** AG-Y084
**Module:** `onyx-procurement/src/finance/fx-hedging.js`
**Tests:** `onyx-procurement/test/finance/fx-hedging.test.js`
**Date:** 2026-04-11
**Swarm:** Techno-Kol Uzi mega-ERP — Finance / Treasury domain
**Rule respected:** לא מוחקים רק משדרגים ומגדלים (never delete; only upgrade and grow)
**Status:** PASSING — 22 / 22 unit tests green (`node --test test/finance/fx-hedging.test.js`)

---

## 1. Scope & intent — Hebrew/English

**EN.** A dependency-free, read-only tracker of foreign-exchange hedging positions
for Techno-Kol Uzi group treasury. The module records hedges that were booked in
the outside world (Bloomberg / Reuters / bank portal), nets exposures by currency,
values positions mark-to-market, runs the IFRS 9 effectiveness test, produces a
maturity ladder and counterparty concentration view, plans rollovers, splits
realized vs unrealized P&L, measures the hedge ratio, checks corporate
hedging-policy compliance, and renders a bilingual PDF report with an SVG chart.

**HE.** מודול מעקב פוזיציות גידור מט״ח, ללא תלויות חיצוניות, למערך האוצר של
קבוצת טכנו-קול עוזי. המערכת רושמת חוזי גידור שנסגרו מחוץ למערכת (בפלטפורמות
חיצוניות), מנתחת חשיפה נטו לפי מטבע, מחשבת שווי הוגן עדכני (MTM), מריצה מבחן
יעילות גידור לפי IFRS 9, בונה סולם פדיונות, מודדת ריכוז חשיפה לצד נגדי, מתכננת
גלגולי עסקה, מפצלת רווח/הפסד ממומש מול לא-ממומש, מודדת יחס גידור, בודקת תאימות
למדיניות הגידור הפנימית, ומפיקה דוח PDF דו-לשוני עם גרף SVG של חשיפה בזמן.

> **Critical**: this module never trades. It is explicitly read-only — see
> section 6 below.

---

## 2. Supported hedge instruments / כלי גידור

| Code            | Hebrew           | English        | Payoff profile            | Model used              |
|-----------------|------------------|----------------|---------------------------|-------------------------|
| `forward`       | פורוורד          | Forward        | Linear, delta ≈ 1         | `N × (spot − strike)`   |
| `option`        | אופציה           | Option         | Convex, one-sided         | Intrinsic-only (no vol) |
| `swap`          | החלף (Swap)      | Swap           | Stream of cash-flows      | Linear (same as fwd)    |
| `collar`        | קולר             | Collar         | Zero-cost corridor        | Bounded `[floor, cap]`  |
| `range-forward` | פורוורד טווח     | Range-Forward  | Variant of collar         | Bounded `[floor, cap]`  |

The valuation functions are deliberately simple and transparent. This is a
treasury **tracker**, not a quant pricer — the formulas err on the conservative,
auditable side (intrinsic-only for options, no discount factor, no vol surface).

### Why this simplification is safe

* The module never quotes prices to counterparties.
* All decisions are still made by a treasurer with access to live bank quotes.
* The conservative value is always ≤ the true market value for long-option
  positions, which means management reports understate P&L rather than overstate.
* Auditors can recompute any number with a pocket calculator.

---

## 3. IFRS 9 hedge accounting notes / הערות IFRS 9

**Test method: dollar-offset.**
For each hedge with a linked `hedgedItem`, we compute

```
ΔFV(hedged item) = item.notional × (currentRate − initialRate)
ΔFV(hedge)       = − hedge.notional × (currentRate − hedge.rate) × delta
ratio            = − ΔFV(hedge) / ΔFV(hedged item)
effective        = 0.80 ≤ ratio ≤ 1.25
```

The 80 – 125 % band is the historical IAS 39 rule; IFRS 9 (2018) dropped the
hard band in favour of a **qualitative** economic-relationship assessment plus a
**quantitative** rebalancing rule, but the 80/125 heuristic remains the most
widely used backstop and is the one used here. The band is exposed as
`FXHedgingTracker.IFRS9_EFFECTIVENESS_MIN / MAX`.

**Sign convention.** The hedge P&L is economically opposite to the underlying
item's P&L (e.g. a receivable strengthens when the asset currency appreciates
while a matching payer forward loses value). The module models that opposite
sign explicitly so that a **perfectly matched** hedge returns a ratio of exactly
`1.0`, not `−1.0`.

**Effectiveness categories reported:**

* `effective: true` + reason `"Within IFRS 9 80–125% band."`
* `effective: false` + reason `"Outside IFRS 9 band (0.80–1.25)."`
* `effective: true` + reason `"No movement — trivially effective."` (both ΔFV = 0)
* `effective: false` + reason `"Hedged item did not move while hedge did..."`
  (ΔFV_item = 0, ΔFV_hedge ≠ 0 — dollar-offset zero-division guard)

**What the module does NOT do (by design):**

* Regression analysis (IAS 39 Method 2) — auditors can run their own.
* Hypothetical derivative method — outside scope of a tracker.
* Time-value exclusion journal entries — posted by GL, not by tracker.

---

## 4. Rule: **לא מוחקים רק משדרגים ומגדלים**

Every part of the module preserves history:

1. **`recordHedge` rejects duplicates** with `E_DUPLICATE_HEDGE`. A hedge can
   never be silently overwritten. Use `rolloverSchedule` to extend.
2. **`rolloverSchedule` never deletes** the original hedge. It creates a NEW
   record with id `{originalId}_R{n}`, sets `rolloverOf` on the new record and
   `rolledInto` + `status = ROLLED_OVER` on the original. Both records remain
   queryable forever via `get()` / `list()`.
3. **Hedge history** is an append-only array stored on every record. Events are
   logged (`RECORDED`, `ROLLED_OVER`, `CREATED_AS_ROLLOVER_OF`) with timestamps.
4. **Audit log** on the tracker instance (`auditLog()`) keeps a frozen event
   trail for every significant action at instance level.
5. **Returned objects are deep-frozen** so callers cannot accidentally tamper
   with stored state after retrieval.

There is no `delete` / `remove` / `purge` method, by design.

---

## 5. Policy engine — rules supported

`policyCompliance({ policy, currentPositions })` runs the following checks.
All policy fields are optional; unset fields are skipped.

| Rule                           | Field                         | Enforcement                                                           |
|--------------------------------|-------------------------------|-----------------------------------------------------------------------|
| Instrument whitelist           | `allowedInstruments[]`        | Hedge type must be in list                                            |
| Currency whitelist             | `allowedCurrencies[]`         | Non-base leg must be in list                                          |
| Maximum tenor                  | `maxTenorDays`                | Days between today and maturity must be ≤ cap                         |
| Minimum hedge ratio per ccy    | `minHedgeRatio` (0–1 or 0–100)| Hedged / gross exposure ≥ min                                         |
| Maximum hedge ratio per ccy    | `maxHedgeRatio` (0–1 or 0–100)| Hedged / gross exposure ≤ max                                         |
| Counterparty concentration cap | `maxCounterpartyConcentration`| Any single bank's share of total notional must be ≤ cap               |

Every returned violation carries a bilingual label (`label.he` / `label.en`),
the rule id, the offending hedge/ccy, and a numeric value, for consumption by
the Hebrew UI.

---

## 6. Read-only enforcement — safety rationale

### The contract

```js
// All of these throw E_READ_ONLY_NO_TRADING:
tracker.trade()
tracker.executeTrade()
tracker.placeOrder()
tracker.buy()
tracker.sell()
tracker.transferFunds()
tracker.settleNow()

// Module-level sentinel — same throw:
require('./fx-hedging').trade()
require('./fx-hedging').executeTrade()
```

### Implementation

1. The constructor installs a fixed list of forbidden method names as
   instance properties — each a stub that immediately calls `readOnlyGuard(name)`
   which throws `FXHedgingError` with code `E_READ_ONLY_NO_TRADING`.
2. A second pair of forbidden sentinels is exported at module level so even
   `require('fx-hedging').trade()` fails loudly.
3. Test `#20` asserts that **all seven** forbidden names throw the correct
   error code; this test is the contract's executable specification.
4. A regex `TRADING_PATTERN` is defined in-module as a hook for future
   guard-rails (linter, CI rule) — any newly-added method matching
   `/trade|execute|place_?order|buy|sell|send|transfer|wire|pay|settle_?now/i`
   should either be re-named or explicitly routed through `readOnlyGuard`.

### Why a tracker, not an execution layer?

* **Regulatory.** Executing FX trades from an ERP would require banking
  licenses, connectivity tests, STP certification and ISDA compliance — none of
  which Techno-Kol Uzi has.
* **Operational.** Bank platforms already have trading UIs, four-eye approval,
  kill switches and a certified audit trail. We do not want to compete with
  them.
* **Safety.** A bug in a trading automation costs millions. A bug in a reporting
  module costs a Monday morning. The asymmetry justifies a bright-line read-only
  boundary.
* **Alignment with Anthropic policy.** Claude does not execute trades, place
  orders, send money, or initiate transfers on the user's behalf — this module's
  surface mirrors that policy.

### What to tell the treasurer

*"The ERP now SHOWS your hedges, computes effectiveness, and flags policy
breaches. You still trade on Bloomberg / on your bank's terminal. After the
trade is done, key-in the confirmation in the ERP (or hook up an import file) —
that's what `recordHedge` is for."*

---

## 7. Public API surface

| Method                                       | Returns                                                   |
|----------------------------------------------|-----------------------------------------------------------|
| `recordHedge(h)`                             | Frozen hedge snapshot                                     |
| `addExposure(ex)`                            | Frozen exposure snapshot                                  |
| `exposureReport({ currency, period })`       | Net exposure by currency, with hedge offset               |
| `hedgeEffectiveness(hedgeId)`                | IFRS 9 dollar-offset result (ratio, effective, reason)    |
| `markToMarket({ hedgeId, currentRate })`     | MTM value + method                                        |
| `maturityLadder()`                           | Buckets 0-7d / 8-30d / 31-90d / 91-180d / 180+ / overdue  |
| `counterpartyExposure(counterpartyId)`       | Aggregated notional + per-pair breakdown                  |
| `rolloverSchedule({ hedgeId, newMaturity, newRate })` | `{ original, rollover, rateDelta, daysExtended }` |
| `gainLoss({ hedgeId, closingDate })`         | Realized vs unrealized split                              |
| `hedgeRatio(exposure, hedged)`               | Ratio + percentage + classification                       |
| `policyCompliance({ policy, currentPositions })` | `{ compliant, violations, checks }`                   |
| `generateHedgeReport(period)`                | `{ pdf: Buffer, svg: string, summary: object }`           |
| `list()` / `get(id)` / `auditLog()`          | Read helpers                                              |

Any call to `trade`, `executeTrade`, `placeOrder`, `buy`, `sell`,
`transferFunds`, `settleNow` throws `E_READ_ONLY_NO_TRADING`.

---

## 8. Test coverage (22 / 22 passing)

| #   | Test name                                                                       | Covers                                 |
|----:|---------------------------------------------------------------------------------|----------------------------------------|
| 01  | recordHedge stores a forward and returns a frozen record                        | happy-path, freeze                     |
| 02  | recordHedge validates required/typed fields                                     | input validation                       |
| 03  | recordHedge rejects duplicates — never delete, never overwrite                  | rule compliance                        |
| 04  | exposureReport nets receivables/payables/commitments and subtracts hedged       | netting math                           |
| 05  | exposureReport filters by currency and period                                   | filtering                              |
| 06  | markToMarket — forward linear payoff                                            | MTM forward                            |
| 07  | markToMarket — option intrinsic-only, never negative                            | MTM option                             |
| 08  | markToMarket — collar is bounded by cap/floor                                   | MTM corridor                           |
| 09  | hedgeEffectiveness — IFRS 9 in-band ratio qualifies                             | IFRS 9 positive case                   |
| 10  | hedgeEffectiveness — out-of-band fails                                          | IFRS 9 negative case                   |
| 11  | hedgeEffectiveness — zero movement is trivially effective                       | div-by-zero guard                      |
| 12  | maturityLadder buckets by days-to-maturity                                      | bucket boundaries                      |
| 13  | counterpartyExposure aggregates outstanding notional per bank                   | concentration                          |
| 14  | rolloverSchedule archives original + creates new hedge (rule: no delete)        | rule compliance                        |
| 15  | rolloverSchedule rejects a maturity that is not after the original              | guard                                  |
| 16  | gainLoss splits realized vs unrealized by closingDate                           | P&L split                              |
| 17  | hedgeRatio — numeric and object inputs, classification bands                    | API flexibility + bands                |
| 18  | policyCompliance runs all rule families                                         | five rule families                     |
| 19  | generateHedgeReport produces PDF + SVG + summary                                | PDF signature, Hebrew chart label      |
| 20  | **READ-ONLY ENFORCEMENT — all trade-like methods throw E_READ_ONLY_NO_TRADING** | safety contract                        |
| 21  | audit log accumulates on every significant action                               | audit trail                            |
| 22  | bilingual labels are present on public outputs                                  | bilingual contract                     |

Run: `cd onyx-procurement && node --test test/finance/fx-hedging.test.js`

---

## 9. Hebrew glossary / מילון מונחים

| English                  | עברית                       | Notes                                             |
|--------------------------|-----------------------------|---------------------------------------------------|
| FX / Foreign Exchange    | מט"ח / מטבע חוץ             |                                                   |
| Hedging                  | גידור                       |                                                   |
| Hedge instrument         | כלי גידור                   |                                                   |
| Forward                  | פורוורד / חוזה אקדמה         | Linear payoff                                     |
| Option (call / put)      | אופציה (קול / פוט)          | Right, not obligation                             |
| Swap                     | החלף                        | Currency swap / interest-rate swap                |
| Collar                   | קולר                        | Long put + short call, often zero-cost            |
| Range-forward            | פורוורד טווח                | Bounded corridor                                  |
| Notional                 | ערך נקוב / סכום חוזי        |                                                   |
| Strike / Contract rate   | שער מימוש / שער חוזי         |                                                   |
| Spot rate                | שער ספוט / שער עדכני         |                                                   |
| Maturity                 | מועד פדיון                  |                                                   |
| Tenor                    | תקופת חוזה                  |                                                   |
| Counterparty             | צד נגדי                     | Usually a bank                                    |
| Concentration risk       | סיכון ריכוזיות               | Too much with one bank                            |
| Exposure                 | חשיפה                       |                                                   |
| Receivable               | חייבים                      | Owed to us                                        |
| Payable                  | זכאים                       | We owe                                            |
| Commitment               | התחייבות עתידית              | Not yet booked                                    |
| Transactional hedge      | חשיפת עסקה                   | IFRS 9 purpose                                    |
| Translational hedge      | חשיפת תרגום                  | Foreign-sub consolidation                         |
| Economic hedge           | חשיפה כלכלית                 | Future forecast                                   |
| Hedge ratio              | יחס גידור                   | Hedged / exposed                                  |
| Effectiveness test       | מבחן יעילות                  | IFRS 9 dollar-offset                              |
| Mark-to-market / MTM     | שווי הוגן                    |                                                   |
| Realized P&L             | רווח/הפסד ממומש              | After maturity or close                           |
| Unrealized P&L           | רווח/הפסד לא-ממומש           | Still open                                        |
| Rollover                 | גלגול עסקה                   | Extend a maturing hedge                           |
| Dollar-offset method     | שיטת קיזוז דולרי             | Δhedge / Δitem                                    |
| Read-only                | קריאה בלבד                  | No trading                                        |
| Policy compliance        | תאימות למדיניות               |                                                   |
| Maturity ladder          | סולם פדיונות                 |                                                   |

---

## 10. Integration notes (for the bridge module)

* The module is a plain CommonJS file; it plugs directly into the ERP via
  `require('./src/finance/fx-hedging')`.
* Zero runtime dependencies → safe to embed in any Node version ≥ 14.
* The PDF generator uses hand-rolled UTF-16BE hex strings for Hebrew glyphs.
  On a viewer that cannot render Hebrew with the `Helvetica` font (most Reader
  versions cannot), the Hebrew lines will appear as small squares but the
  English lines remain legible — for a production rollout swap in an embedded
  Hebrew-capable TrueType font (David / Frank Ruehl).
* The PDF buffer carries a non-standard `.svgChart` property so consumers who
  prefer the vector chart can grab it directly without regenerating.
* `FXHedgingTracker` holds state in-memory only. For persistence across
  restarts, serialize via `list()` + `auditLog()` and rehydrate on boot.

---

## 11. Rule check — `לא מוחקים רק משדרגים ומגדלים`

* ☑ No `delete` method exists.
* ☑ `recordHedge` never overwrites; duplicates throw.
* ☑ `rolloverSchedule` creates a NEW record and archives the old via status,
      never mutating the id.
* ☑ History arrays are append-only.
* ☑ Audit log is append-only.
* ☑ Returned objects are deep-frozen.
* ☑ This report itself will never be deleted; it will only be upgraded.

---

**AG-Y084 complete — READ-ONLY FX HEDGING TRACKER SHIPPED AND PASSING.**
