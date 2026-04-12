# AG-90 — Smart Bank Transaction Categorizer

**Agent:** 90
**Owner:** Kobi / Techno-Kol Uzi Mega-ERP (2026)
**Date:** 2026-04-11
**Status:** DELIVERED — all tests green

---

## Summary

Agent 90 ships a pure-JavaScript, zero-dependency smart categorizer for
Israeli bank and credit-card transactions. The module classifies free-text
descriptions (Hebrew + English) into canonical Hebrew categories using a
built-in catalogue of 81 merchant rules, an `addRule()` hook for custom
overrides, and a `learn()` hook that remembers user corrections.

**Immutable-rules compliance:** nothing was deleted, only new files added.
No new `package.json` dependencies — uses only Node built-ins (`node:test`,
`node:assert/strict`).

### Deliverables

| File | Purpose |
| --- | --- |
| `onyx-procurement/src/bank/smart-categorizer.js` | Main module (categorize, addRule, learn, getRules) |
| `onyx-procurement/test/payroll/smart-categorizer.test.js` | 36-case `node:test` suite |
| `_qa-reports/AG-90-smart-categorizer.md` | This report |

---

## Public API

```js
const {
  CATEGORIES,           // frozen map of Hebrew category labels
  categorize,           // (tx) => { category, subcategory, confidence, matched_rule }
  addRule,              // (pattern, category, opts) => ruleId
  learn,                // (tx, userCategory, opts) => learnedRuleId | null
  getRules,             // () => snapshot with counts + merged rule list
} = require('./src/bank/smart-categorizer');
```

### Category dictionary (Hebrew canonical)

`הכנסות`, `הוצאות תפעול`, `שכר`, `דלק`, `מזון`, `תקשורת`, `אחזקה`,
`ארנונה`, `משרד`, `תחבורה`, `חשמל ומים`, `עמלות בנק`, `ממשלה`,
`קמעונאות`, `מסעדות`, `מסחר אלקטרוני`, `נדלן`, `ספקים`, `אחר`.

### Confidence scale

| Match kind | Score |
| --- | --- |
| Exact normalized string match | 100 |
| Regex / anchored pattern | 85 |
| Substring / fuzzy | 60 |
| Learned user override | 95 |
| Amount-sign fallback | 20 (expense) / 30 (income) |
| Unmatched | 0 (category = `אחר`) |

---

## rules_count

- **81 built-in rules** shipped (target was 50+).
- Custom rules: 0 (runtime-registered via `addRule()`).
- Learned rules: 0 (runtime-registered via `learn()`).

### Coverage by category (built-in)

| Category | Rules |
| --- | --- |
| מזון (Food / Supermarkets / Pharm) | 10 — Shufersal, Rami Levy, Mega, Yochananof, Victory, AM:PM, Tiv Taam, Osher Ad, Hazi Hinam, Super-Pharm |
| דלק (Fuel) | 6 — Paz, Delek, Sonol, Dor Alon, Ten, Sadaf |
| תחבורה (Transport) | 6 — Rav-Kav, Gett, Pango, CelloPark, Egged, Israel Railways |
| תקשורת (Telecom) | 6 — Bezeq, Partner/Orange, Cellcom, Pelephone, HOT, YES |
| חשמל ומים (Utilities) | 5 — IEC, מי אביבים, מקורות, תאגיד המים, חברת החשמל |
| עמלות בנק (Banks/Fees) | 7 — Hapoalim, Leumi, Discount, Mizrahi, Yahav, Jerusalem, generic fees |
| ממשלה / ארנונה | 7 — ביטוח לאומי, מס הכנסה, מע"מ, עיריית, ארנונה, רשות המיסים, רשם החברות |
| קמעונאות (Retail) | 7 — Fox, Castro, H&M, Zara, IKEA, KSP, BUG |
| אחזקה (Maintenance) | 2 — Home Center, Ace |
| נדלן (Real estate) | 3 — ועד בית, rent/שכירות, משכנתא |
| ספקים (Techno-Kol suppliers) | 4 — Hot-Mil, Bromil, AkzoNobel, Shahal Metals |
| מסעדות (Restaurants) | 8 — Aroma, Cafe Cafe, Greg, McDonald's, Burger King, Domino's, Pizza Hut, 10bis |
| מסחר אלקטרוני (E-commerce) | 5 — Amazon, AliExpress, Shopify, eBay, PayPal |
| הכנסות (Income) | 2 — inbound transfer, refund/זיכוי מלקוח |
| שכר (Payroll) | 3 — payroll/משכורת, pension fund, קרן השתלמות |
| **Total** | **81** |

---

## accuracy_estimate

### Synthetic sweep (30 representative descriptions)

A deterministic sanity test was run from the command line against 30
hand-crafted Israeli merchant descriptions (half Hebrew, half English,
mixed with branch suffixes like `DEAL TLV 1234`):

```
builtin_rules: 81
accuracy: 30/30 = 100.0%
```

### Estimated production accuracy

| Scenario | Estimate |
| --- | --- |
| Known top-tier Israeli merchants (Shufersal, Paz, Bezeq, ...) | **~95–98%** — covered by exact-anchor rules with high priority |
| Long-tail Hebrew-only merchants with typos | **~70–80%** — fuzzy substring works on normalized form |
| Fully unknown merchants | ~20–30% falls through to amount-sign heuristic (coarse but useful) |
| After 10+ `learn()` user corrections for a given customer | approaches 100% for the seen merchants |

Confidence is intentionally conservative: fallback income/expense
classifications never exceed 30, forcing the UI to flag them for review.

---

## test_results

Command: `node --test test/payroll/smart-categorizer.test.js`

```
ℹ tests 36
ℹ suites 5
ℹ pass 36
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~213
```

### Test suites

1. **built-in rules catalogue** (2 tests)
   - Catalogue ships with 50+ rules (actual: 81).
   - All canonical `CATEGORIES` keys exposed.

2. **categorize() happy paths** (24 tests)
   - Food: Shufersal, Rami Levy (Hebrew), Yochananof.
   - Fuel: Paz, Sonol (Hebrew), Delek.
   - Transport: Rav-Kav, Pango.
   - Telecom: Bezeq, Cellcom (Hebrew).
   - Utilities: חברת החשמל, מקורות.
   - Government: ביטוח לאומי, מס הכנסה.
   - Arnona: ארנונה.
   - Retail: IKEA.
   - Restaurants: Aroma, דומינוס.
   - E-commerce: Amazon, AliExpress.
   - Suppliers: הוט מיל (Techno-Kol specific).
   - Payroll: משכורת.
   - Income: העברה נכנסת.
   - Real estate: ועד בית.

3. **custom rules** (3 tests)
   - `addRule()` with regex pattern, priority 95.
   - `addRule()` with string pattern → exact match confidence 100.
   - `addRule()` validation (throws without category).

4. **learn() user overrides** (2 tests)
   - `learn()` recalls override on subsequent `categorize()` call with
     confidence >= 90 and source `learned`.
   - `learn()` safely no-ops on empty input.

5. **fallback & edge cases** (5 tests)
   - Empty transaction → `אחר` / confidence 0.
   - `null` / `undefined` transaction is safe.
   - Unknown merchant + negative amount → `הוצאות תפעול` fallback.
   - Unknown merchant + positive amount → `הכנסות` fallback.
   - Priority tie-break: higher priority wins.

---

## Implementation notes

1. **Hebrew word-boundary pitfall.** JavaScript `\b` is ASCII-only; Hebrew
   letters are not "word characters", so `\bבזק\b` fails to match. The
   catalogue therefore uses `\b` for ASCII alternatives and plain
   substring matches for Hebrew alternatives, combined with `|` inside a
   single regex per rule.
2. **Priority model.** Learned rules > custom rules > built-ins, with an
   implicit +10 boost on learned rules so a user correction beats a
   generic built-in match for the same merchant.
3. **Normalization.** Control chars stripped, whitespace collapsed,
   lowercased; regexes are evaluated against both raw and normalized
   text so banks that upper-case everything still match.
4. **Fallback heuristic.** Unknown descriptions still get a coarse
   income/expense bucket via `transaction.amount` sign — confidence is
   capped under 35 to encourage manual review in the UI.
5. **Zero deps.** Only `node:test` + `node:assert/strict`, matching the
   rest of the `onyx-procurement` test suite convention (see
   `src/bank/multi-format-parser.test.js`).
6. **Immutable rules compliance.** `BUILTIN_RULES` is an inline frozen
   literal; `_resetForTests()` clears only `_customRules` and
   `_learnedRules`, never the built-ins.

---

## How to integrate

```js
const { categorize, learn } = require('./src/bank/smart-categorizer');

// 1. Score every row at ingest time
for (const tx of parsedStatement.transactions) {
  const { category, subcategory, confidence, matched_rule } = categorize(tx);
  tx.auto_category = category;
  tx.auto_subcategory = subcategory;
  tx.auto_confidence = confidence;
  tx.auto_rule_id = matched_rule?.id ?? null;
}

// 2. When a user edits a row in the UI, call learn() so we get better next time
learn(tx, userEditedCategory, { subcategory: userEditedSubcategory });
```

Integration into `onyx-procurement/src/bank/bank-routes.js` is a
straightforward follow-up (one require + one call inside the ingest
handler); nothing in this agent's scope modifies that file.

---

## Sign-off

| Check | Result |
| --- | --- |
| Zero new runtime dependencies | PASS |
| Bilingual (Hebrew + English) rules | PASS |
| 50+ Israeli merchant rules | PASS (81) |
| `categorize`, `addRule`, `learn` exports | PASS |
| Israeli compliance: ביטוח לאומי / מס הכנסה / ארנונה / מע"מ / חברת החשמל | PASS |
| Immutable rules — only new files, nothing deleted | PASS |
| `node --test` 36/36 green | PASS |
