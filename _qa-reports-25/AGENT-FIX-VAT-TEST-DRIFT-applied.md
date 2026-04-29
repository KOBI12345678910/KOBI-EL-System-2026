# AGENT-FIX-VAT-TEST-DRIFT — applied

Date: 2026-04-29
Scope: Test-side fix for VAT rate drift (0.17 -> 0.18 effective 2026-01-01).
Source code unchanged. Total LOC changed: 28 (well under 30 budget).

## Outcome
- Before: 13 test failures (in scope: 6 listed; rest are dependent assertions in same files).
- After:  138/138 pass in `test/sales/quote-builder.test.js`,
                    `test/realestate/broker-fees.test.js`,
                    `test/seed/israeli-seed.test.js`.

Run: `node --test test/sales/quote-builder.test.js test/realestate/broker-fees.test.js test/seed/israeli-seed.test.js`
Result: `tests 138 / pass 138 / fail 0`.

## Files updated (3)

### 1. onyx-procurement/test/sales/quote-builder.test.js
| Line | Before | After |
|---|---|---|
| 67  | `'ctor: default VAT 17%, default currency ILS'` | `'ctor: default VAT 18%, default currency ILS'` |
| 70  | `assert.equal(b.vatRate, 0.17)` | `assert.equal(b.vatRate, 0.18)` |
| 142 | title `17% VAT` | title `18% VAT` |
| 156 | `t.vat = round2(350 * 0.17) // 59.5` | `round2(350 * 0.18) // 63` |
| 157 | `t.gross = round2(350 + 350 * 0.17) // 409.5` | `round2(350 + 350 * 0.18) // 413` |
| 169 | comment `VAT @ 17% = 680.85, gross = 4685.85` | `VAT @ 18% = 720.9, gross = 4725.9` |
| 173-174 | `t.vat=680.85, t.gross=4685.85` | `t.vat=720.9, t.gross=4725.9` |
| 176 | `t.vat_rate = 0.17` | `t.vat_rate = 0.18` |
| 235,238-239 | comment `VAT 153 -> gross 1053`; `vat=153, gross=1053` | `VAT 162 -> gross 1062`; `vat=162, gross=1062` |
| 336,339-340 | comment `VAT 1445.85, gross 9950.85`; `vat=1445.85, gross=9950.85` | `VAT 1530.9, gross 10035.9`; `vat=1530.9, gross=10035.9` |

### 2. onyx-procurement/test/realestate/broker-fees.test.js
| Line | Before | After |
|---|---|---|
| 239,246 | title/comment `17%`; `gross=50000, vat=8500, total=58500` | `18%`; `gross=50000, vat=9000, total=59000` |
| 250 | `vatRate=0.17` | `vatRate=0.18` |
| 270 | `vat=850 // 17%` | `vat=900 // 18%` |
| 271 | `total=5850` | `total=5900` |
| 293 | `perSide.buyer.total=11700` | `perSide.buyer.total=11800` |
| 326,330-331 | `vat=13.6k, total=93.6k`; `vat=13600, total=93600` | `vat=14.4k, total=94.4k`; `vat=14400, total=94400` |
| 489 | `vat=20400 // 17% of 120k` | `vat=21600 // 18% of 120k` |
| 490 | `total=140400` | `total=141600` |
| 572 | `assert.equal(VAT_RATE, 0.17)` | `assert.equal(VAT_RATE, 0.18)` |

### 3. onyx-procurement/test/seed/israeli-seed.test.js
| Line | Before | After |
|---|---|---|
| 405,409 | title `VAT rate is 17%`; `it.vat_rate=0.17` | `VAT rate is 18%`; `it.vat_rate=0.18` |
| 437,443 | title `subtotal + 17% = total`; `subtotal_nis * 0.17` | `subtotal + 18% = total`; `subtotal_nis * 0.18` |

## Decisions / Constraints honoured
- No source code changed (test-side only).
- No tests with explicit 2025 dates were touched. All edited tests had no date constraint or carried 2026 fixture dates already.
- Other 0.17 occurrences left untouched (out of scope; e.g. `qa-08-rfq-quotes.test.js`, `vat-routes.test.js`, `quarterly-tax-report.test.js` line 777, `valuation.test.js` profit margins, fixtures); those either inject `VAT_RATE: 0.17` into routes locally or test 2025 historical values.
- Total ~28 changed lines across 3 files.
