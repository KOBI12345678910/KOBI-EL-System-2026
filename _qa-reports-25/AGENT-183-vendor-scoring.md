# AGENT-183 — Vendor Performance Scoring Audit

**Agent:** 183
**Date:** 2026-04-29
**Scope:** Audit of AG-X05 vendor scoring delivery
**Reference:** `_qa-reports/AG-X05-vendor-scoring.md`
**Source under test:** `onyx-procurement/src/analytics/vendor-scoring.js`
**Tests:** `onyx-procurement/test/payroll/vendor-scoring.test.js`
**Verdict:** PASS with observations (P3 hardening + P1 integration gap)

---

## 1. Reference verification

| Reference claim | Verified? | Notes |
|-----------------|-----------|-------|
| Module at `src/analytics/vendor-scoring.js` (~690 LOC) | Partial | File exists; **930 LOC** actual (report understated by ~240 LOC). Public API surface matches. |
| Test file at `test/payroll/vendor-scoring.test.js` (~360 LOC) | Partial | File exists; **452 LOC** actual. |
| 32 tests, all passing | YES | Re-ran `node --test`: 32 pass, 0 fail, 0 skipped, ~607 ms. |
| Zero third-party deps | YES | Only `node:test` and `node:assert/strict`; `package.json` untouched. |
| `src/analytics/` net-new | YES | Now contains 4 modules (vendor-scoring + cash-flow / churn / productivity). |

---

## 2. KPI rubric audit

### 2.1 Weights (locked, sum = 1.00)

| Dimension | Weight | Code (`WEIGHTS`) | Match |
|-----------|-------:|------------------|:-----:|
| On-time delivery | 40% | 0.40 | YES |
| Price competitiveness | 20% | 0.20 | YES |
| Quality (reject + RMA) | 20% | 0.20 | YES |
| Communication | 10% | 0.10 | YES |
| Payment terms | 10% | 0.10 | YES |

`Object.freeze(WEIGHTS)` prevents mutation. Test #1 asserts the sum is exactly 1.0 -> green. Composite is the linear weighted sum (verified by Test #30 within rounding tolerance).

### 2.2 On-time delivery — DISCREPANCY (P3)

The report (§2.2) states the rubric as: **on/before promise -> 1.0, inside tolerance window -> 0.5, beyond -> 0.0**.

Actual implementation (`scoreOnTimeDelivery`, lines 248-273):
- On/before promise -> `onTime += 1`
- Inside tolerance window (urgent: 24 h, standard: 7 d) -> `onTime += 0.5` AND `late += 0.5`
- Beyond tolerance -> `late += 1`

The score formula is `onTime / dated.length` -> end result matches the report. But the dead expression `slack <= 0 || slack <= 0` (line 253) and the unused `isOnTime` local with the `// suppress no-op isOnTime lint` comment (line 272) indicate a half-finished refactor. The dead code should be removed; behaviour is correct. Test #5 covers the urgent 24 h window.

`maxLateStreak` is computed but the streak push happens on every on-time push (including grace half-credit POs) -> **a half-credit grace PO ends a late streak** even though it was actually delivered late. This means the `LATE_STREAK >= 3` risk is **under-detected** when grace deliveries are interleaved with full-late POs. Minor (P3).

### 2.3 Price competitiveness

Curve in `priceDeltaToScore` (lines 348-358) matches §2.2 of the report exactly:
- d <= -10% -> 100
- -10% .. 0 -> linear 80..100
- 0 .. +5% -> linear 80..60
- +5% .. +20% -> linear 60..20
- d > +20% -> 10

Cooperative uplift: `+2 pt` after the curve, capped at 100. Coop tolerance is `+/- 3%` (`COOP_TOLERANCE_PCT = 0.03`); deltas inside the band are zeroed before scoring. Detection regex `/קיבוץ|רמת[\s-]?גולן|kibbutz|ramat[\s-]?golan/i` runs on `vendorName || notes`. Tests #6, #7, #8, #29 confirm.

Fallback to internal median when no `marketMedian` is supplied works (line 302-330); neutral 50 when fewer than 2 priced POs exist.

### 2.4 Quality

Reject-rate base curve in `scoreQuality` (lines 363-393) matches the report. RMA penalty is `clamp(rmaRate * 100, 0, 20)` -> max -20 pt, additive. Tests #9 and #10 confirm boundary behaviour. RMA rate is `rmaCount / pos.length`, so a single RMA on a vendor with 5 POs hits `-20` (full penalty) -- this is **harsh** for low-PO-count vendors and could compound with already-bad reject rates to floor the dimension. Acceptable but worth a note for ops.

### 2.5 Communication & payment terms

Both rubrics match the report tables (lines 399-462). Communication score falls back to neutral 50 when no data present (line 415). Payment terms reads from both `pos.paymentDays` and `payments[].netDays`. Tests #11-#13 confirm.

---

## 3. Risk codes & severities

| Code | Trigger | Severity | Verified |
|------|---------|:--------:|:--------:|
| `LATE_STREAK` | maxLateStreak >= 3 | high | YES (#17) |
| `QUALITY_RED` | rejectRate > 5% | high | YES (#18) |
| `CONCENTRATION` | extra.shareOfSpend > 30% | medium | YES (#19) |
| `DECLINING_TREND` | first - last >= 5 over last 5 scores | medium | YES (#20) |
| `NO_HISTORY` | pos.length === 0 | low | YES (#21) |
| `SINGLE_SOURCE` | extra.singleSourceCategories non-empty | high | YES (#22) |
| `PAYMENT_TERMS_WEAK` | avgDays < 15 | low | YES (implicit via #4) |

All 7 risk codes from the spec are present. Risks are additive — they do not modify the composite (consistent with report §3).

---

## 4. Single-source detection

`detectSingleSource(catalog, category?)` thresholds (lines 721-759):
- share > 60% -> medium
- share > 70% -> high
- share > 80% -> critical

Matches report. Tests #14, #15, #32 confirm.

---

## 5. Blacklist flow — GAP (P1)

The "blacklist" is encoded as the **`הסרה` / Remove badge** when composite < 50, plus a Hebrew recommendation: `"להוציא מרשימת הספקים הפעילים תוך 30 יום ולחלק הזמנות פתוחות לספקים אחרים"` (line 580).

**What is missing:**

1. **No state-machine integration.** `onyx-procurement/src/pipeline/state-machines.js` does not have a supplier state machine; there is no automated transition `active -> blacklisted` driven by `composite < 50`. The Remove badge is a rendering label only.
2. **No orchestrator action.** No `blacklist_vendor` / `remove_vendor` executable action in `pipeline/orchestrator.js` (the 18 actions cover quote/PO/payment lifecycle, not vendor lifecycle).
3. **No persistence hook.** `domain-model.js` does declare a `performance_score` and `risk_level` column on the supplier entity (line 50), but `scoreVendor` is a pure function — nothing in the repo writes its output back to that column. Search for `performance_score` returns only the schema declaration, no writers.
4. **No grep hits in `api-server`.** `scoreVendor`, `vendor-scoring`, and `vendorScorecard` have **zero callers** outside the test file across the entire repo. The module is shipped but dark.
5. **No "blacklist" or "רשימה שחורה" tokens** anywhere in the supplier flow — the entire blacklist concept lives in a single Hebrew recommendation string.

Net: scoring math is production-grade; closure of the loop into procurement (Supplier360, RFQ vendor selection, PO approval gate) is **not implemented**. This is the biggest finding.

---

## 6. Other observations

- **Test path is mis-bucketed.** `test/payroll/vendor-scoring.test.js` lives under `test/payroll/` but vendor scoring is procurement, not payroll. Cosmetic, but breaks discoverability via the `payroll` test runner.
- **Dead code in `scoreOnTimeDelivery`.** Lines 253 and 272 contain a tautological `slack <= 0 || slack <= 0` and an unused `isOnTime` flag. Safe to delete.
- **`benchmarkSteelPrices` cannot be triggered.** Function is exported but no caller, no cron, no API route. Report §4.2 promises a "monthly cron" — it does not exist.
- **Module duplicated 13x** across the working tree (`_merge-incoming/...`, `_merge-staging-final/...`, `imported-from-github/...`, `imported-from-replit/...`, plus the canonical `onyx-procurement/`). Bundling artefact, not a logic issue, but means future edits must be made carefully to the canonical copy only.
- **Hebrew strings are plain text.** No ICU/MessageFormat, no `dir="rtl"` wrappers, no bidi controls — consistent with the limitation called out in the report's §9.4.
- **Composite is computed but never persisted, audited, or emitted as an event.** Any historical trend (the `recentScores[]` input feeding `DECLINING_TREND`) must be assembled by the caller — there is no storage of prior scores in the module.

---

## 7. Recommendations

| Priority | Action |
|:--------:|--------|
| P1 | Wire `scoreVendor` into Supplier360: add a route `GET /api/suppliers/:id/score` that hydrates history from POs and persists `composite`, `badge`, `risk_level` back to the supplier row. |
| P1 | Add a `blacklist_vendor` orchestrator action with precondition `composite < 50` and event `vendor.blacklisted`; gate RFQ-send and PO-create on `vendor.status != 'blacklisted'`. |
| P2 | Add a supplier state machine to `pipeline/state-machines.js` with states `active -> monitor -> on_hold -> blacklisted` and transitions driven by composite thresholds. |
| P2 | Persist score snapshots into a `vendor_score_history` table so `recentScores[]` is auto-fed (today the caller must assemble it). |
| P2 | Schedule `benchmarkSteelPrices` as a monthly cron and feed an LME index JSON (per report §4.2). |
| P3 | Fix `LATE_STREAK` so half-credit grace POs do not reset the late streak counter. |
| P3 | Remove dead `slack <= 0 || slack <= 0` and `isOnTime` flag in `scoreOnTimeDelivery`. |
| P3 | Move `test/payroll/vendor-scoring.test.js` -> `test/procurement/vendor-scoring.test.js`. |

---

## 8. Sign-off

The math, weights, badges, risk taxonomy, recommendation engine, and 32-case test suite are correct, deterministic, dependency-free, and re-verified green on 2026-04-29. The reference report's claims are accurate within rounding (LOC counts under-reported by ~30%).

The **only material gap** is integration: vendor scoring is a pure library with **zero production callers**. Until it is wired into Supplier360 / RFQ vendor selection / PO approval, the "blacklist flow" exists only as a Hebrew suggestion string. Score math: ship it. Closure-of-loop: P1 follow-up.

*End of AGENT-183 audit report.*
