# AG-Y095 — Customer Loyalty Engine | מנוע תוכנית נאמנות לקוחות

**Agent:** Y-095
**Date:** 2026-04-11
**Scope:** Techno-Kol Uzi mega-ERP — repeat-purchase loyalty rewards module.
**Status:** Delivered — 22/22 tests passing
**Distinct from:** Y-094 (customer referral program — one-off invite rewards).

---

## 1. Overview | תקציר מנהלים

> **HE:** נבנה מנוע תוכנית נאמנות טהור JavaScript, ללא תלויות חיצוניות, עם
> תמיכה מלאה בעברית RTL, תוויות דו-לשוניות בכל שדה, והתאמה מלאה לחוק
> הגנת הצרכן התשמ"א-1981. המנוע מממש מחלקה `LoyaltyEngine` עם 14 מתודות
> ציבוריות לניהול תוכניות, רישום חברים (בהסכמה מפורשת בלבד), צבירה
> ומימוש נקודות, פקיעת תוקף, דרגות חברות, העברות נקודות בין לקוחות,
> דוחות היסטוריה, ביקורת תוכנית, סגירת תוכנית וזיהוי הונאה.

> **EN:** A pure-JavaScript, zero-dependency loyalty points engine with full
> Hebrew/RTL support, bilingual labels on every surface and strict compliance
> with Israeli Consumer Protection Law 5741-1981. The module exposes a
> `LoyaltyEngine` class with 14 public methods for program management,
> consent-gated enrollment, points earning and redemption, FIFO expiry,
> tier management, peer-to-peer transfers, bilingual statements,
> program-level auditing, graceful closure and fraud detection.

**Files delivered**

| File | Purpose |
|---|---|
| `onyx-procurement/src/customer/loyalty.js` | LoyaltyEngine implementation (~1,100 LOC, 0 deps) |
| `onyx-procurement/test/customer/loyalty.test.js` | 22 Node built-in tests (≥ 18 required) |
| `_qa-reports/AG-Y095-loyalty.md` | This bilingual QA report |

**House rule honored:** *לא מוחקים רק משדרגים ומגדלים* — every log is
append-only; corrections are new rows; `closeProgram` grandfathers existing
members and NEVER deletes the plan. Plan versions are immutable — only
strictly-better upgrades allowed.

---

## 2. Test Suite Summary | סיכום חבילת בדיקות

```
$ node --test test/customer/loyalty.test.js
✔ 1. definePlan — creates bilingual plan with tiers
✔ 2. definePlan — rejects degradation of existing plan
✔ 3. definePlan — allows strictly-better upgrade
✔ 4. enrollCustomer — refuses without consentDoc (Consumer Protection)
✔ 5. enrollCustomer — stores consent vault entry
✔ 6. earnPoints — applies earnRate and tier multiplier
✔ 7. earnPoints — respects eligibleCategories subset
✔ 8. redeemPoints — decrements balance, validates sufficient funds
✔ 9. expireOldPoints — produces expire rows, keeps earn rows intact
✔ 10. expireOldPoints — FIFO, partially-consumed earn rows do not expire consumed part
✔ 11. tierRecalculation — promotes on 12-month activity
✔ 12. tierRecalculation — applies 30-day downgrade grace (no instant demotion)
✔ 13. tierBenefits — returns inherited perks + next-tier progress
✔ 14. transferPoints — writes paired rows, preserves both histories
✔ 15. transferPoints — rejects cross-plan and self-transfer
✔ 16. historyStatement — bilingual rows + closing balance
✔ 17. refundOrder — reverses earn row, preserves original, flags over-redeemed
✔ 18. fraudDetection — rapid-redemption flag
✔ 19. fraudDetection — circular-transfer flag
✔ 20. fraudDetection — excessive earn in single day
✔ 21. closeProgram — grandfathers existing members, preserves plan
✔ 22. programAudit — issued/redeemed/expired/outstanding

tests 22 | pass 22 | fail 0 | duration_ms ~124
```

---

## 3. Tier Structure | מבנה דרגות

Five-tier canonical ladder. Tier names are lowercase ASCII internally and
localized via `LABELS`:

| Rank | tier (internal) | עברית | English | Default threshold* | Default multiplier | Sample benefits |
|---:|---|---|---|---:|---:|---|
| 0 | `bronze`   | ארד    | Bronze   |      0 | ×1.00 | `free-ship-500` (free shipping ≥ ₪500) |
| 1 | `silver`   | כסף    | Silver   |  1,000 | ×1.25 | `free-ship-300` (free shipping ≥ ₪300) |
| 2 | `gold`     | זהב    | Gold     |  5,000 | ×1.50 | `birthday-100` (+100 pts birthday) |
| 3 | `platinum` | פלטינה | Platinum | 15,000 | ×1.75 | `priority-support` (10-min SLA) |
| 4 | `diamond`  | יהלום  | Diamond  | 40,000 | ×2.00 | `private-concierge` (personal manager) |

\* Thresholds are configurable per plan. The `definePlan` call validates
that every tier uses one of the five canonical names — rejecting free-form
strings so downstream reporting stays consistent.

### Inheritance (customer-friendly)

A member sitting at `gold` inherits *all* lower-tier benefits. The
`tierBenefits(customerId)` method walks the array and returns every
`{tier, benefit}` pair at or below the member's rank. This is a business
requirement from legal — customers are never surprised that "gold lost
free shipping".

### Tier recalculation window

`tierRecalculation(customerId)` sums the **basePoints** (pre-multiplier)
earned in the last **12 months** and promotes to the highest tier whose
threshold is met. Transferred-in points do **not** count toward the tier
window (`basePoints = 0` on transfer rows).

### 30-day downgrade grace period

If the computed tier would be *lower* than the current tier, the engine
refuses to demote the customer immediately. Instead it writes a tier-history
row with `downgradeGraceUntil = now + 30d`. This is a consumer-protection
gesture — the member has 30 days to earn back their rank before losing
benefits. Covered by test #12.

---

## 4. Earn / Redeem Rules | כללי צבירה ומימוש

### Earn formula

```
basePoints      = floor(eligibleAmount × plan.earnRate)
totalPoints     = floor(basePoints × tierMultiplier × explicitMultiplier)
```

- `earnRate` is "points per ILS" — e.g. `1` means 1 pt / ₪, `0.5` means a pt
  per ₪2, `2` means a double-points event.
- `eligibleCategories` is an optional allow-list. If supplied, only the
  matching portion of the order counts. Shape: `[{name, amount}]`.
- `explicitMultiplier` is an optional temporary boost (e.g. Black Friday
  ×3) supplied at earn time.
- `tierMultiplier` comes from the member's current tier in the current
  plan version — never a past version.

### Redeem rules

- `redeemPoints({customerId, points, reward, orderId})` validates that
  `currentBalance(customerId) >= points` and appends a negative row on
  the redeem log.
- `reward` carries `{type, name_he, name_en, value}`. Common types:
  `discount`, `free-item`, `shipping`, `gift-card`.
- Redemption is an append-only operation. Reversal = new positive
  `earn-reversal`-style row, never a delete.

### Expiry — FIFO

- Each earn row carries `expiresAt = ts + plan.expiryDays`.
- `expireOldPoints(now?)` walks the ledgers and, for each customer,
  computes the live-points-per-earn-row by subtracting already-consumed
  points FIFO. Only the truly-live-but-past-expiry portion is written as
  a new negative `expire` row. The original earn row is **never mutated**.
- Covered by tests #9 and #10.

### Refund flow (Consumer Protection §14ג)

- `refundOrder(customerId, orderId, reason)` looks up the original earn
  row and appends a negative `earn-reversal` row.
- If the customer's current balance is lower than the points earned
  from that specific order (i.e. they already spent those points), the
  reversal is marked `partial: true` and `supervisorFlag: true` — a
  human must decide how to handle the missing points.
- Original earn row is preserved for audit. Covered by test #17.

---

## 5. Israeli Consumer Protection Law Compliance | עמידה בחוק הגנת הצרכן

### 5.1 Explicit enrollment consent — §2, §2א

> **HE:** לפי חוק הגנת הצרכן וחוק הגנת הפרטיות, אסור לצרף צרכן לתוכנית
> נאמנות ללא הסכמתו המפורשת. המנוע דורש אובייקט `consentDoc` המכיל
> `documentId` ו-`signedAt` בכל קריאה ל-`enrollCustomer`, וזורק שגיאה
> `E_CONSENT_REQUIRED` אם ההסכמה חסרה. ההסכמה נשמרת לצמיתות בכספת
> `consentVault`, כולל IP, שפה, שיטת חתימה ומספר גרסה של מסמך ההסכמה.

> **EN:** The Consumer Protection Law, combined with the Privacy Protection
> Law, prohibits enrolling a consumer in a loyalty scheme without explicit
> opt-in. The engine requires a `consentDoc` object containing at minimum
> `{documentId, signedAt}` on every `enrollCustomer` call and throws
> `E_CONSENT_REQUIRED` otherwise. The consent record is stored permanently
> in the `consentVault`, including IP, language, signature method and
> document version. Covered by tests #4 and #5.

### 5.2 No retroactive degradation — §2ב (unfair terms)

> **HE:** כל שדרוג של תוכנית ב-`definePlan` חייב להיות "מחמיר יותר
> לטובה" — שיעור צבירה גדול או שווה, ימי תוקף ארוכים או שווים, לפחות
> אותה כמות דרגות, וכל דרגה קיימת חייבת לשמור על מכפלת הטבה שלא פחותה.
> ניסיון להוריד תנאים זורק `E_DEGRADATION`.

> **EN:** Every `definePlan` update must be strictly better than the prior
> version. The `_isStrictlyBetter` helper enforces `earnRate ≥`,
> `expiryDays ≥`, `tiers.length ≥`, and every existing tier retains a
> multiplier not smaller than before. Attempting to degrade any of these
> throws `E_DEGRADATION`. Plans are versioned — prior versions remain
> accessible via `getPlanHistory(planId)`. Covered by tests #2 and #3.

### 5.3 Truthful disclosure — §7

Every ledger row is bilingual (`reason_he`, `reason_en`), typed, and
contains the plan version at the time of the event. The `historyStatement`
method returns a bilingual statement with a closing balance, header in both
languages, and labels pulled from the `LABELS` constant — so the customer
can see exactly what they earned, spent and lost. Expiry dates are always
set on the earn row and shown on every statement row. Covered by test #16.

### 5.4 Order cancellation — §14ג (ביטול עסקה)

`refundOrder` produces a negative `earn-reversal` row pointing to the
original earn row via `reversalOf`. The original is preserved. When the
customer has already spent the refunded points, `supervisorFlag: true`
is raised so a human can make a case-by-case decision (absorb the loss,
collect the debt, partial refund). Covered by test #17.

### 5.5 Point-expiry disclosure — §7

Every statement row carries `expiresAt`. `expireOldPoints` produces a
new `expire` row per batch — never touches the earn row — and records
the `originalExpiresAt` on the expire row so the audit trail is airtight.
Covered by test #9.

### 5.6 Transfer audit trail

`transferPoints` writes two rows with a shared `pairId`:

- `transfer-out` on the sender's redeem log (negative points)
- `transfer-in` on the receiver's earn log (positive points, `basePoints = 0`)

And a top-level entry on `_transferLog`. Transfers cannot be undone by
deletion, only by a fresh counter-transfer. Self-transfer and cross-plan
transfer are rejected. Transferred-in points inherit a fresh `expiresAt`
based on the current plan's `expiryDays`. Covered by tests #14 and #15.

### 5.7 Program closure

`closeProgram(planId, date?)` creates an immutable closure record with a
snapshot of every grandfathered member's balance and tier, marks the
plan's `status: 'closed'` (preventing new enrollments and new accruals),
but keeps the plan in the Map forever with full version history. Existing
members never forfeit points from closure alone — only from the normal
expiry rule. Covered by test #21.

---

## 6. Fraud Detection Rules | כללי זיהוי הונאה

`fraudDetection(customerId)` returns `{customerId, scannedAt, flags,
suspicion}` and runs four rules:

| # | Rule | Severity | Trigger | Hebrew explanation |
|---|---|---|---|---|
| 1 | `rapid-redemption`    | medium | Redeem within 60 s of earn | מימוש מהיר מדי לאחר הצבירה |
| 2 | `circular-transfer`   | high   | A→B→A within 24 h          | העברה מעגלית בתוך 24 שעות |
| 3 | `excessive-earn-day`  | high   | > 50,000 pts earned in single day | צבירה חריגה ביום אחד |
| 4 | `outlier-order-amount`| low    | Order > 10× rolling median  | סכום הזמנה חריג |

Every flag is bilingual (`message_he` / `message_en`) and carries enough
context (`earnId`, `redeemId`, `counterparty`, `deltaSec`, `deltaHours`,
etc.) for a human investigator. Rules 1–3 are covered by tests #18, #19, #20.

---

## 7. Hebrew Glossary | מילון מונחים

| עברית | English | Internal key |
|---|---|---|
| תוכנית נאמנות | Loyalty plan | `plan` |
| חבר מועדון | Member | `member` |
| יתרת נקודות | Points balance | `balance` |
| צבירה | Earn | `earn` |
| מימוש | Redeem | `redeem` |
| פג תוקף | Expired | `expired` |
| העברה יוצאת | Transfer out | `transfer-out` |
| העברה נכנסת | Transfer in | `transfer-in` |
| ביטול צבירה (החזר) | Earn reversal (refund) | `earn-reversal` |
| דרגת חבר | Tier | `tier` |
| ארד | Bronze | `bronze` |
| כסף | Silver | `silver` |
| זהב | Gold | `gold` |
| פלטינה | Platinum | `platinum` |
| יהלום | Diamond | `diamond` |
| דוח חשבון נקודות | Points statement | `statement` |
| מתאריך | From date | `fromDate` |
| עד תאריך | To date | `toDate` |
| הסכמה מפורשת לתוכנית נאמנות | Explicit loyalty consent | `consent` |
| נדרשת הסכמה מפורשת של הצרכן לפי חוק הגנת הצרכן | Explicit consumer consent required per Consumer Protection Law | `consentRequired` |
| תוכנית סגורה | Program closed | `closed` |
| תוכנית פעילה | Program active | `active` |
| התחייבות פתוחה | Outstanding liability | `outstanding` |
| הטבות | Benefits | `benefits` |
| דרגה הבאה | Next tier | `nextTier` |
| נקודות לדרגה הבאה | Points to next tier | `pointsToNextTier` |
| החזר ללקוח | Customer refund | `refund` |
| חשד הונאה | Fraud suspected | `fraud` |
| מסלול ביקורת | Audit trail | `auditTrail` |

All labels live in the `LABELS` constant (`LABELS.he`, `LABELS.en`) and are
`Object.freeze`d at module load. `LABELS.he.dir === 'rtl'`, `LABELS.en.dir
=== 'ltr'` for downstream UI layout decisions.

---

## 8. Public API Contract | חוזה API

```js
const { LoyaltyEngine } = require('./customer/loyalty');
const engine = new LoyaltyEngine({ now, randomId });   // both optional

// 1. Define a plan
engine.definePlan({
  id, name_he, name_en, earnRate,
  tiers: [{ name, threshold, multiplier, benefits }],
  expiryDays, currency
});

// 2. Consent-gated enrollment
engine.enrollCustomer({
  customerId, planId,
  consentDoc: { documentId, signedAt, version?, language?, ipAddress?, method? }
});

// 3. Repeat-purchase earn
engine.earnPoints({
  customerId, orderId, orderAmount,
  eligibleCategories?,     // [{name, amount}]
  multiplier?              // explicit boost
});

// 4. Redeem
engine.redeemPoints({
  customerId, points,
  reward: { type, name_he, name_en, value },
  orderId?
});

// 5. Balance + expiry
engine.currentBalance(customerId);
engine.expireOldPoints(now?);

// 6. Tier management
engine.tierRecalculation(customerId);
engine.tierBenefits(customerId);

// 7. Peer transfer
engine.transferPoints({
  fromCustomerId, toCustomerId, points, reason
});

// 8. Reports
engine.historyStatement(customerId, { fromDate, toDate });
engine.programAudit({ fromDate, toDate });

// 9. Program lifecycle
engine.closeProgram(planId, date?);

// 10. Consumer-protection refund
engine.refundOrder(customerId, orderId, reason);

// 11. Fraud detection
engine.fraudDetection(customerId);

// 12. Read-only introspection
engine.getPlan(planId);
engine.getPlanHistory(planId);
engine.getMember(customerId);
engine.getConsent(customerId);
engine.getEarnLog(customerId);
engine.getRedeemLog(customerId);
engine.getExpireLog(customerId);
engine.getTransferLog();
engine.getClosureLog(planId);
engine.getAuditLog();
```

### Error codes

Every internal `_assert` includes a machine-readable code. Error messages
take the shape `[CODE] human text`, so callers can `err.code` or
regex-match the message. Common codes:

| Code | Meaning |
|---|---|
| `E_SPEC`, `E_PLAN_ID`, `E_BILINGUAL` | Plan specification errors |
| `E_EARN_RATE`, `E_TIER_*` | Invalid numeric / tier fields |
| `E_DEGRADATION` | Plan update would degrade consumer terms |
| `E_PLAN_MISSING`, `E_PLAN_CLOSED`, `E_ALREADY_CLOSED` | Plan lifecycle |
| `E_CONSENT_REQUIRED`, `E_CONSENT_FIELDS` | Missing / malformed consent |
| `E_DUP_ENROLL`, `E_NOT_ENROLLED` | Membership state |
| `E_AMT`, `E_POINTS`, `E_ORDER`, `E_REWARD` | Input validation |
| `E_INSUFFICIENT` | Balance check failed |
| `E_FROM`, `E_TO`, `E_SELF`, `E_CROSS_PLAN` | Transfer validation |
| `E_FROM_NOT_ENROLLED`, `E_TO_NOT_ENROLLED` | Transfer membership |
| `E_NO_EARN` | refundOrder cannot find original earn row |

---

## 9. Integration Notes | הערות אינטגרציה

- **Not yet wired into the Fastify server** — this is an autonomous
  Agent Y-095 deliverable. Wiring into `onyx-procurement/server.js`
  (routes: `POST /loyalty/plan`, `POST /loyalty/enroll`,
  `POST /loyalty/earn`, `POST /loyalty/redeem`, `GET /loyalty/balance/:id`,
  `GET /loyalty/statement/:id`, `POST /loyalty/transfer`,
  `POST /loyalty/refund`, `GET /loyalty/audit`) is a follow-up task.

- **Distinct from `loyalty-points.js`** — a parallel module
  `src/customer/loyalty-points.js` (different class: `LoyaltyPoints`)
  handles the IFRS 15-oriented deferred-revenue variant of the same
  business problem. This new `loyalty.js` is the Y-095 repeat-purchase
  engine with consumer-protection-first semantics. Both can co-exist per
  house rule *לא מוחקים רק משדרגים ומגדלים* — the new module is an
  *addition*, not a replacement.

- **Storage:** in-memory Maps only, as spec'd. Persisting to SQLite /
  Postgres is a separate task and would replace only the Map back-ends
  while keeping the append-only semantics.

- **Zero external deps:** only `node:crypto` (with a deterministic
  `_idCounter` fallback for test environments and bundlers). No npm
  packages.

---

## 10. Coverage Matrix | מטריצת כיסוי

| Requirement from task brief | Test IDs |
|---|---|
| Plan definition                      | #1, #2, #3 |
| Enrollment with consent              | #4, #5 |
| Earn / redeem / balance              | #6, #7, #8 |
| Expiry                               | #9, #10 |
| Tier recalc                          | #11, #12 |
| Tier benefits                        | #13 |
| Transfer preserves records           | #14, #15 |
| Consumer-protection refund scenario  | #17 |
| Fraud detection                      | #18, #19, #20 |
| Program closure                      | #21 |
| Program audit                        | #22 |
| Bilingual statement                  | #16 |

22 tests total — above the 18-test minimum.

---

## 11. Sign-off | אישור סופי

- [x] `node --test` — 22/22 passing
- [x] Zero external npm deps
- [x] Hebrew RTL + bilingual labels on every surface
- [x] Israeli Consumer Protection Law §2, §2א, §2ב, §7, §14ג enforced in code
- [x] Append-only storage — no `delete`, no mutation of ledger rows
- [x] `closeProgram` grandfathers existing members and preserves plan
- [x] Bilingual QA report with tier structure, earn/redeem rules,
      consumer-law compliance, Hebrew glossary

**House rule honored:** לא מוחקים רק משדרגים ומגדלים ✓
