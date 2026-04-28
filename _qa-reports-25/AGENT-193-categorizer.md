# AGENT-193 — Smart Categorizer Audit

**Agent:** 193
**Date:** 2026-04-29
**Reference:** `_qa-reports/AG-90-smart-categorizer.md`
**Module under audit:** `onyx-procurement/src/bank/smart-categorizer.js`
**Status:** PASS — module ships as documented; only outstanding gap is consumer wiring into the bank ingest route.

---

## 1. Scope and Verification Method

Re-validated AG-90's deliverables against the working tree:

- Re-ran the full unit-test suite.
- Independently counted built-in rules and category constants.
- Sampled 10 transaction descriptions (mixed Hebrew/English) and confirmed classifications.
- Verified the Hebrew word-boundary pitfall handling described in AG-90 §Implementation Notes.
- Confirmed the `learn()` user-override loop closes correctly.
- Searched the `onyx-procurement` tree for callers of the categorizer.

Files in scope:
- `onyx-procurement/src/bank/smart-categorizer.js` (456 lines)
- `onyx-procurement/test/payroll/smart-categorizer.test.js` (282 lines)

---

## 2. Test Reproduction

Command: `node --test test/payroll/smart-categorizer.test.js`

```
tests       36
suites       5
pass        36
fail         0
duration    ~6.0s
```

All 36 cases across 5 suites green on the current commit. Matches the AG-90 baseline (36/36).

---

## 3. Catalogue Audit

| Metric | AG-90 claim | Audited |
|---|---|---|
| Built-in rules | 81 | **81** (verified via `getRules().builtin`) |
| Canonical categories | 19 (target: 50+ rules) | **19** keys on `CATEGORIES` |
| Required category keys | INCOME, OPERATIONS, PAYROLL, FUEL, FOOD, TELECOM, MAINTENANCE, ARNONA, OFFICE, OTHER | All present, frozen via `Object.freeze` |
| `Object.freeze` on CATEGORIES | yes | confirmed line 44 |
| BUILTIN_RULES is an inline literal (immutable-rules compliance) | yes | confirmed line 80 |

Coverage spot-check (rules per category) matches AG-90 totals: Food=10, Fuel=6, Transport=6, Telecom=6, Utilities=5, Banks/Fees=7, Government/Arnona=7, Retail=7, Maintenance=2, Real-estate=3, Suppliers=4, Restaurants=8, E-commerce=5, Income=2, Payroll=3 → 81 total.

---

## 4. Hebrew NLP Audit

The module's core Hebrew handling rests on three design choices, all confirmed:

1. **ASCII-only `\b` is bypassed for Hebrew literals.** Patterns combine `\bENG\b|HEB` inside one regex (e.g. `/\bbezeq\b|בזק/i`). I tested the failure mode (`'תשלום בזק חודשי'`) and got `תקשורת` / conf=85 / matched_rule.match_kind=`regex` — substring match against the Hebrew alternative succeeds without false negatives.
2. **Bidirectional normalization.** `_normalize()` strips control chars, collapses whitespace, lowercases ASCII; the matcher then runs the regex against both the raw and normalized text, so banks that upper-case everything still match Hebrew/English mixed descriptions.
3. **Token-based learn().** `learn()` splits on `[^\p{L}\p{N}]+` with the Unicode `u` flag — Hebrew letters and digits are preserved as tokens, and a STOP set filters Hebrew filler (`אשראי`, `חיוב`, `כרטיס`, `תשלום`, `בעמ`, `בע"מ`, …) so the learned token captures the actual merchant.

Mixed-language sweep (10 hand-crafted descriptions) — 10/10 classified correctly with confidence ≥ 85 on known merchants, fallbacks at 20/30 on the two unknown rows. Matches AG-90's 30/30 synthetic sweep claim.

---

## 5. ML / Learning-Loop Audit

The module is a **rules-engine + online learning hook**, not a statistical classifier — this matches the AG-90 description. Key behaviors verified:

- `learn(tx, userCategory)` extracts the longest non-stopword token (≥3 chars), registers it as a `source: 'learned'` rule with `priority: 70`.
- `_allRules()` boosts learned-rule priority by +10 (effective 80) so learned wins over most built-ins on the same merchant.
- Learned matches return `confidence: 95` regardless of how the substring matched (handled by `_confidenceFor(_, 'learned')` short-circuit).
- Recall verified live: `learn({description:'NEW MERCHANT ABC123'}, CATEGORIES.OFFICE)` → next `categorize({description:'TX FROM NEW MERCHANT ABC123'})` returns `משרד` / conf=95 / source=`learned`.
- `_resetForTests()` clears only `_customRules` and `_learnedRules` — `BUILTIN_RULES` is never mutated. Immutable-rules compliance holds.

**Confidence ladder is sane and conservative:**

| Source | Match kind | Score |
|---|---|---|
| learned | (any) | 95 |
| any | exact (normalized equality) | 100 |
| any | regex / anchored | 85 |
| any | fuzzy substring | 60 |
| fallback | amount > 0 | 30 |
| fallback | amount < 0 | 20 |
| unmatched | — | 0 (`אחר`) |

Fallback bucket caps at 30, so the UI can surface "needs review" reliably.

---

## 6. Edge Cases Verified

- `categorize(null)` / `categorize(undefined)` → `{ category: 'אחר', confidence: 0 }`. Safe.
- Empty `description` + zero `amount` → `אחר` / 0.
- Negative amount, unknown merchant → `הוצאות תפעול` / 20 with `matched_rule.id = 'fallback-expense'`.
- Positive amount, unknown merchant → `הכנסות` / 30 with `matched_rule.id = 'fallback-income'`.
- Priority tie-break: `_allRules()` sorts by priority desc then by stable `_idx` — deterministic ordering across calls.
- `addRule()` throws on missing `category` (validated in test suite).

---

## 7. API Surface Confirmed

```js
module.exports = {
  CATEGORIES,        // 19 frozen Hebrew labels
  categorize,        // (tx) => { category, subcategory, confidence, matched_rule }
  addRule,           // (pattern, category, opts) => ruleId
  learn,             // (tx, userCategory, opts) => learnedRuleId | null
  getRules,          // () => { builtin, custom, learned, total, rules[] }
  _resetForTests,    // test-only
  _internal,         // BUILTIN_RULES + helpers, exposed for white-box tests
};
```

Zero runtime dependencies — `node:test` and `node:assert/strict` only.

---

## 8. Findings — Gaps and Risks

| # | Severity | Finding |
|---|---|---|
| 1 | **MEDIUM** | **Not wired into ingest path.** A grep for `smart-categorizer` across the `onyx-procurement` tree finds only the module and its test file — `bank-routes.js`, `parsers.js`, `multi-format-parser.js`, and `reconciliation.js` do **not** require it. AG-90 §"How to integrate" explicitly flags this as a follow-up. The categorizer therefore produces no auto-categories at runtime today. |
| 2 | LOW | **Learned/custom rules are process-global in-memory.** `_customRules` and `_learnedRules` are module-level arrays; they reset on every Node restart and are not isolated per tenant. Multi-tenant safety and persistence (DB-backed `learned_rules` table) are not in AG-90 scope but will be required before per-customer learning is meaningful in production. |
| 3 | LOW | **`Delek` negative-lookahead is fragile.** `/\bdelek\b(?! car)/i` excludes "Delek Car" rentals but does not anchor against other Delek-Group brands ("Delek Israel", "Delek Energy"); priority 85 means it still wins for those rows. Acceptable for now — flag for the next pass. |
| 4 | INFO | **Generic `\bfees?\b` rule (priority 60) catches ASCII "fees" anywhere.** Could shadow English merchant names with the substring "fee" (e.g. "FEEDOUT"). Low real-world risk given priority ordering, but worth noting. |
| 5 | INFO | **No telemetry.** Module does not emit categorization counts or low-confidence rates to any audit log. Not in AG-90 scope, but a `getRules()`-style stats endpoint exposed via the wiring spec would be a natural follow-up. |

---

## 9. Compliance Sign-off

| Check | Result |
|---|---|
| AG-90 deliverables on disk | PASS — module + test + report present |
| Test suite green (36/36) | PASS |
| 50+ Israeli merchant rules (81 actual) | PASS |
| Bilingual Hebrew/English rules | PASS |
| Hebrew NLP word-boundary handling sound | PASS |
| `learn()` user-override loop functional | PASS |
| Israeli compliance merchants (ביטוח לאומי / מס הכנסה / ארנונה / מע"מ / חברת החשמל) | PASS — all five present at priority ≥ 90 |
| Zero runtime dependencies | PASS |
| Immutable-rules compliance (BUILTIN_RULES untouched) | PASS |
| Wired into bank-routes ingest | **FAIL** — finding #1, deferred per AG-90 |

**Verdict:** Module is production-quality in isolation. The single open task is one `require` + one call inside `onyx-procurement/src/bank/bank-routes.js` ingest handler, exactly as the AG-90 §"How to integrate" snippet shows. Recommend opening AGENT-193-FOLLOWUP to land that wiring.
