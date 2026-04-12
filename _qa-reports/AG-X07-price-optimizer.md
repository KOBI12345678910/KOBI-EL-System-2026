# AG-X07 — Dynamic Price Optimizer (Metal Fabrication)

**Agent:** X-07
**Swarm:** 3
**Project:** Kobi's mega-ERP — Techno-Kol Uzi
**Module:** `onyx-procurement/src/pricing/price-optimizer.js`
**Date:** 2026-04-11
**Status:** GREEN — 24/24 tests passing

---

## 1. Scope

Build a dynamic price optimizer for an Israeli metal-fabrication shop
(Techno-Kol Uzi). Requirements:

* 10-step pricing algorithm (cost-plus through VAT)
* Israeli metal-fab specifics (CRS / galvanized / SS304 / SS316 / aluminum)
* Benchmarks against איילון, דיסאל, פעל גיא
* Standard margins by category (structural 25%, precision 40%, custom 50%)
* Bilingual Hebrew / English explanations
* Zero external dependencies
* Append-only history (never delete)
* 15+ unit tests

---

## 2. Files delivered

| File | Lines | Purpose |
|---|---|---|
| `onyx-procurement/src/pricing/price-optimizer.js` | ~640 | Pricing engine |
| `onyx-procurement/test/payroll/price-optimizer.test.js` | ~370 | Unit tests |
| `_qa-reports/AG-X07-price-optimizer.md` | this file | QA report |

---

## 3. Algorithm — 10 steps, executed in order

1. **Cost-plus baseline** — materials × priceByKg + labor × minuteRate,
   + overhead (22%) × category margin (25 / 40 / 50%).
2. **Market adjustment** — if competitor average is ±8% off our baseline,
   nudge 40% toward the market (soft, never farther away).
3. **Customer tier** — VIP −5%, REGULAR 0%, SMALL +5%.
4. **Volume break** — quantity tiers 1 / 10 / 50 / 100 / 500 / 1000 with
   discounts 0 / 2 / 5 / 8 / 12 / 15%.
5. **Seasonal index** — month-keyed 0.95–1.05 curve (summer dip, Q1 and Q4
   rallies).
6. **Urgency surcharge** — STANDARD 0% / EXPRESS +8% / RUSH +15%.
7. **Payment terms** — CASH −2% / NET-30 0 / NET-60 +2% / NET-90 +3.5%.
8. **Churn-risk adjustment** — LOYAL 0, NEUTRAL 0, AT_RISK −4%, LOST −7%.
9. **FX conversion** — context.fxRates override; defaults USD = 3.70,
   EUR = 4.00.
10. **VAT** — Israeli 18% by default, `includeVat: false` opts out,
    `vatRate` overrides.

Every step emits a record:

```js
{ code, label_he, label_en, percent, delta, basis, reason }
```

so the UI (or a downstream audit log) can render a full breakdown without
re-executing the pipeline.

---

## 4. Public API

| Function | Signature | Returns |
|---|---|---|
| `optimizePrice` | `(product, customer, context)` | Full decision with `base`, `adjustments[]`, `final`, `currency`, `confidence`, `explanation_he`, `explanation_en` |
| `bulkRepricing` | `(items[], options)` | Per-item results + aggregate summary (total cost, revenue, blended margin) |
| `whatIf` | `(product, scenarios[])` | Side-by-side comparison w/ best/worst + delta vs. baseline |
| `getPriceHistory` | `(productId)` | Append-only timeline + trend (`up` / `down` / `flat`) |
| `recordPriceQuote` | `(record)` | Manual insert into history |
| `CONSTANTS` | — | Frozen tunable tables |

---

## 5. Israeli metal-fab specifics

* **Raw-material index** (₪/kg, overridable):
  CRS 4.80, galvanized 5.60, SS304 18.50, SS316 26.00, Al-6061 22.00.
* **Labor rates** (₪/min):
  cutting 2.10, bending 2.40, welding 3.20, painting 1.80, assembly 2.50.
* **Competitors benchmarked:** איילון, דיסאל, פעל גיא (user supplies
  averages via `context.benchmarks.competitorAvg`).

---

## 6. Design / non-functional

* **Zero external deps** — only `node:test` + `node:assert` in tests.
* **Integer agorot** — all monetary math runs on integer agorot
  (שקל × 100) then converts back, eliminating float drift
  (verified: `round2(0.1 + 0.2) === 0.3`).
* **Append-only history** — the in-memory `_priceHistory` Map is only
  ever written to (`push`); there is NO deletion path, consistent with
  the project's hard rule.
* **Bilingual** — every label, explanation, and constant has `he` / `en`
  pairs. Hebrew renders RTL when consumed by the UI layer.
* **Confidence scoring** — 0–1 score that decays with missing data
  (no materials −20%, no labor −15%, no benchmarks −10%, etc.).
* **Never-negative guarantee** — final unit price is floored at zero
  even if customer tier + volume + churn produce catastrophic discounts.
* **Graceful degradation** — `bulkRepricing` catches per-item errors
  and reports them in the summary rather than crashing the batch.

---

## 7. Test suite (15+ cases — actual: 24)

Run: `node --test test/payroll/price-optimizer.test.js`

### Results

```
✔ cost-plus: structural frame baseline matches hand calculation
✔ cost-plus: precision (40%) and custom (50%) margins applied correctly
✔ customer tier: VIP gets -5%, SMALL gets +5%, REGULAR unchanged
✔ volume: quantity 1 → 0%, 10 → 2%, 100 → 8%, 1000 → 15%
✔ volume: larger orders reduce per-unit price
✔ seasonal: month 8 (summer dip, 0.95) < month 12 (year-end rally, 1.05)
✔ urgency: RUSH adds +15%, EXPRESS adds +8%, STANDARD adds 0%
✔ payment terms: CASH -2%, NET_30 0%, NET_60 +2%, NET_90 +3.5%
✔ churn risk: AT_RISK and LOST apply defensive discounts
✔ currency: USD/EUR conversion uses context.fxRates when provided
✔ VAT: inclusion adds 18% on top by default, exclusion yields gross = net
✔ VAT: optimizePrice total.gross uses Israeli 18% by default
✔ market: competitor avg ~8% lower nudges our price downward
✔ market: no benchmarks → market adjustment is neutral
✔ bilingual: explanation_he and explanation_en are both returned
✔ confidence: drops when data is missing (no category, no labor, no customer)
✔ bulkRepricing: returns summary totals and per-item margin analysis
✔ bulkRepricing: gracefully reports failures without throwing
✔ whatIf: compares multiple scenarios and identifies best/worst
✔ price history: records every optimizePrice call and exposes a trend
✔ price history: recordPriceQuote appends without removing existing entries
✔ end-to-end: VIP bulk rush-order with USD + competitor nudge + VAT
✔ precision: round2 avoids float drift
✔ constants: expected tables are frozen and complete

ℹ tests 24
ℹ pass  24
ℹ fail  0
ℹ duration_ms 161.97
```

### Hand-verified reference case

Structural frame, REGULAR customer, qty 1, month 5, no benchmarks, no VAT:

| Step | Expected | Got |
|---|---|---|
| Materials (25 kg CRS + 10 kg galvanized) | 120 + 56 = 176 ₪ | 176 ✓ |
| Labor (20m cut + 15m bend + 30m weld) | 42 + 36 + 96 = 174 ₪ | 174 ✓ |
| Direct cost | 350 ₪ | 350 ✓ |
| Overhead (22%) | 77 ₪ | 77 ✓ |
| Cost before margin | 427 ₪ | 427 ✓ |
| Baseline (+ 25% structural margin) | 533.75 ₪ | 533.75 ✓ |

---

## 8. Compliance checks

* [x] Zero dependencies (only Node built-ins)
* [x] Hebrew bilingual (every label has `name_he` / `name_en` or
      `label_he` / `label_en`)
* [x] Never-delete rule respected (history map is append-only, no
      `.delete()` / `.clear()` anywhere)
* [x] 15+ unit tests (24 delivered)
* [x] All tests green
* [x] Frozen CONSTANTS table (verified via `Object.isFrozen`)

---

## 9. Integration notes

* The module is pure CommonJS so `require('./price-optimizer')` works
  inside `server.js` and every existing onyx-procurement route.
* To persist history across restarts, wire `_priceHistory` to the
  existing `src/db` layer — the store contract is trivial
  (`Map<productId, Array<entry>>`).
* Competitor benchmark scraping is left as a stub (per brief):
  `context.benchmarks.competitorAvg` is whatever the scraper or the
  sales ops team provides. A follow-up agent can plug in a real
  crawler against איילון / דיסאל / פעל גיא without touching the
  pricing core.

---

## 10. Sign-off

Module is production-ready for Swarm 3 integration.
All deliverables created; tests green.

— Agent X-07
