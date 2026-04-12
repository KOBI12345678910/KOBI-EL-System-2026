# AG-Y095 — Customer Loyalty Points (Earn / Burn / Tiers / IFRS 15)

**Agent:** Y-095
**Owner:** Techno-Kol Uzi Mega-ERP (Kobi EL 2026)
**Date:** 2026-04-11
**Status:** DELIVERED
**Rule:** לא מוחקים רק משדרגים ומגדלים — NEVER DELETE, ONLY UPGRADE

---

## 1. Files delivered

| File | Purpose |
|------|---------|
| `onyx-procurement/src/customer/loyalty-points.js` | Zero-dependency `LoyaltyPoints` class (earn/burn/tier/IFRS 15) |
| `onyx-procurement/test/customer/loyalty-points.test.js` | 34 unit tests (all passing) |
| `_qa-reports/AG-Y095-loyalty-points.md` | This report |

**Test result:** 34/34 passing — `node --test test/customer/loyalty-points.test.js`

**Dependencies:** ZERO. Pure JS, Node built-in test runner, no HTTP, no file I/O.

---

## 2. Exported API surface

`LoyaltyPoints` class methods:

| Method | Purpose |
|--------|---------|
| `defineProgram({id,name_he,name_en,earnRules,redeemRules,tiers,expiryDays})` | Register program — idempotent, frozen snapshot |
| `earnPoints({customerId,event,units})` | Append an earn row, FIFO-aware, tier + campaign multipliers applied |
| `redeemPoints({customerId,redemption})` | Burn points against a redeemRule, FIFO consumption |
| `balance(customerId,{soonDays?})` | Current + expiring-soon + lifetime + tier |
| `statement(customerId,{from?,to?})` | Bilingual Hebrew/English account statement |
| `tierProgress(customerId)` | Current tier, next tier, points-to-next, progress 0..1 |
| `expirePoints({asOfDate?})` | FIFO expire on/before `asOfDate`, one expire row per affected earn |
| `breakageCalc()` | Breakage rate, redemption rate, outstanding rate, reversal value |
| `liabilityProvision({from?,to?})` | IFRS 15 closing contract liability, ready-to-post journal |
| `fraudRules({velocity?,duplicates?,geoMismatch?})` | Returns alert list with Hebrew + English descriptions |
| `campaignPoints({customerSegment,multiplier,duration})` | Register time-boxed multiplier campaign |
| `giftTransfer({fromCustomer,toCustomer,points,reason})` | Two-row atomic transfer (out + in) between customers |

Also exported: `EARN_TYPES`, `REDEEM_TYPES`, `LEDGER_TYPES`, `LABELS`,
`DEFAULT_FAIR_VALUE_PER_POINT`, `DEFAULT_REDEMPTION_PROBABILITY`,
`DEFAULT_FRAUD_THRESHOLDS`, `_internal` (helpers for tests only).

---

## 3. Earn rules (supported event types)

| Type | Hebrew | English | Typical formula |
|------|--------|---------|-----------------|
| `purchase` | רכישה | Purchase | `pointsPerUnit × units` (e.g. 1 pt / ₪) |
| `review` | חוות דעת | Product review | fixed bonus |
| `referral` | הפניה | Referral (new customer joined) | fixed bonus |
| `birthday` | יום הולדת | Birthday bonus | once/year fixed bonus |
| `signup` | הרשמה | Signup bonus | one-time fixed bonus |

**Points per earn event:**
```
points = floor(units × rule.pointsPerUnit × rule.multiplier
                     × tierMultiplier × campaignMultiplier)
```
The module snapshots `tierAtTime` on every earn row so a historical tier
never “evaporates” even if the program tier table is upgraded later.

---

## 4. Redeem rules (supported reward types)

| Type | Hebrew | English | Semantics |
|------|--------|---------|-----------|
| `discount` | הנחה | Flat-ILS discount | `pointCost` pts → `value` ILS off next order |
| `free-item` | מוצר חינם | Free SKU | `pointCost` pts → SKU specified in `value` / meta |
| `shipping` | משלוח חינם | Free shipping | `pointCost` pts → shipping waiver ILS |
| `gift-card` | שובר מתנה | Gift card / voucher | `pointCost` pts → voucher for `value` ILS |

FIFO enforcement: burns consume the oldest earn row first. Earn rows are
frozen — the module swaps a new frozen row into the array slot when the
FIFO counter (`remaining`) is decremented, preserving append-only order
semantics while allowing counter updates for audit.

---

## 5. Tier engine

Tiers are sorted by `threshold` ascending. On every earn, the customer
cache refreshes `lifetime` and recomputes `tier = highest threshold ≤ lifetime`.

**Example program shipped with tests:**

| Tier | Threshold (lifetime pts) | Multiplier | Benefits |
|------|--------------------------|------------|----------|
| bronze | 0 | 1.0× | (none) |
| silver | 1,000 | 1.25× | free-shipping |
| gold | 5,000 | 1.5× | free-shipping, priority-support |
| platinum | 20,000 | 2.0× | free-shipping, priority-support, free-returns |

`tierProgress(customerId)` returns:
`{currentTier, currentThreshold, currentBenefits, currentMultiplier,
  nextTier, nextThreshold, pointsToNext, progressRatio}` — ready for UI.

---

## 6. IFRS 15 treatment (the important bit)

Under IFRS 15 loyalty points are a **separate performance obligation**.
At the sale we allocate part of the transaction price to points and
DEFER it until redemption or expiry — whichever comes first.

### 6.1 Sale journal (at point of earn)
```
DR  Cash / AR                         gross invoice
CR  Revenue — goods / services        allocated portion
CR  Contract liability — loyalty pts  fairValue × expected redemption
```

### 6.2 Redemption journal
```
DR  Contract liability — loyalty pts  fairValue of redeemed points
CR  Revenue — loyalty                 released portion
```

### 6.3 Breakage (expiry) journal — accrual reversal
```
DR  Contract liability — loyalty pts  fairValue of expired points
CR  Revenue — loyalty breakage        released portion
```

### 6.4 Fair value per point
`LoyaltyPoints` auto-derives fair value per point from the **best** redeem
rule (highest `value / pointCost` ratio). This is conservative — it
represents the maximum value a customer could extract. If no redeemRules
are defined, we fall back to `DEFAULT_FAIR_VALUE_PER_POINT = 0.05 ILS`.

### 6.5 `liabilityProvision(period)` returns:
```javascript
{
  period:              {from, to},
  outstandingPoints:   <number>,           // sum of remaining FIFO at to
  fairValuePerPoint:   <ILS>,
  redemptionProbability: 0.70,             // default; override per program
  closingLiabilityILS: <ILS>,              // outstanding × fvpp × prob
  journal: {
    dr: { account: 'deferred-revenue-loyalty-points',    amount: 0 },
    cr: { account: 'contract-liability-loyalty-points',  amount: closing }
  },
  heMemo: 'התחייבות IFRS 15 של N נקודות = ₪X',
  enMemo: 'IFRS 15 liability for N points = ILS X'
}
```
Ready for the GL posting module to consume directly.

### 6.6 Israeli GAAP alignment
IFRS 15 is the operative standard for Israeli public companies
(תקן חשבונאות 25 / התקן הבינלאומי 15). The accounts named above
match Israeli חשבונאות chart-of-accounts conventions:
- `הכנסות מסחורות/שירותים` ← `Revenue — goods / services`
- `התחייבות חוזית — כוכבי נאמנות` ← `Contract liability — loyalty points`
- `הכנסות מנטישה (Breakage)` ← `Revenue — loyalty breakage`

---

## 7. Breakage

Breakage is the fraction of points that expire without ever being
redeemed. Our formula:

```
breakageRate   = totalExpired / totalEarnedGross
redemptionRate = totalRedeemed / totalEarnedGross
outstandingRate= outstanding / totalEarnedGross
reversalValueILS = totalExpired × fairValuePerPoint
```

`DEFAULT_REDEMPTION_PROBABILITY = 0.70` (industry median ≈ 30% breakage;
source: Colloquy / Bond Brand Loyalty / Shopify loyalty studies). The
operator can override per program once real redemption history is
available — recompute `breakageCalc()` monthly and feed the rolling
12-month average into `liabilityProvision` going forward.

---

## 8. FIFO expiry

`expirePoints({asOfDate})` walks the ledger in insertion order and
expires every earn row whose `expiresAt <= asOfDate`. Each expired earn
row produces exactly one `expire` ledger entry (`type = 'expire'`, points
negative, `sourceEarnId` linking back). The `remaining` counter on the
earn row is zeroed via swap-in frozen rebuild — never mutated in place.

Tests cover:
- old expires first, recent survives (standard FIFO)
- partial earn already redeemed → only the residual expires
- nothing expires before cutoff

---

## 9. Fraud engine

| Rule | Default threshold | Severity | Bilingual alert |
|------|-------------------|----------|-----------------|
| `velocity-earns-per-hour` | > 10 earn events in 60 min | high | `מהירות חריגה: N צבירות בשעה` / `Unusual velocity: N earns within 1 hour` |
| `velocity-points-per-day` | > 10,000 pts in 24 h | medium | `חריגה יומית: N נקודות ב-YYYY-MM-DD` |
| `duplicate-earn` | same subtype + points ≤ 30 s apart | high | `כפילות זוהתה: אותה צבירה פעמיים בתוך 30 שניות` |
| `geo-mismatch` | ≥ 500 km Haversine in < 1 h | high | `אי-התאמה גאוגרפית: N ק"מ בפחות משעה` |

Thresholds are set at construction time (`new LoyaltyPoints({fraudThresholds})`)
**or** per-call via `fraudRules({…})`. Individual rules can be disabled by
passing `false` — e.g. `{velocity:false}` skips velocity checks.

The test covering geo-mismatch uses TLV (32.0853, 34.7818) → JFK
(40.6413, -73.7781) — haversine distance ≈ 9,116 km, well past the 500 km
threshold in under one hour.

---

## 10. Campaigns

```javascript
lp.campaignPoints({
  customerSegment: 'all',          // or a (customerId) => boolean predicate
  multiplier: 2,                    // double-points
  duration: { from: '2026-04-01', to: '2026-04-30' }
});
```

Campaign multipliers stack multiplicatively with tier multipliers.
Earns OUTSIDE the `[from, to]` window are unaffected. Multiple campaigns
can overlap — all matching multipliers compound. Campaigns are NEVER
deleted; expired campaigns simply stop contributing multipliers.

---

## 11. Gift transfer between customers

```javascript
lp.giftTransfer({
  fromCustomer: 'c-1',
  toCustomer:   'c-2',
  points:       200,
  reason:       'birthday'
});
```

Produces **two atomic ledger rows**:
- `transfer-out` on sender (points negative, FIFO consumed from sender's earns)
- `transfer-in` on recipient (points positive, new earn-like row with fresh expiry)

Rules:
1. `fromCustomer === toCustomer` → thrown
2. `points <= 0` → thrown
3. Insufficient sender balance → thrown (no partial transfers)
4. Transferred points **count toward recipient's lifetime** → may trigger tier upgrade.
5. Sender's lifetime is NOT decremented (they earned them legitimately).

---

## 12. Bilingual glossary (Hebrew / English)

| Key | Hebrew | English |
|-----|--------|---------|
| heading | כוכבי נאמנות — דוח חשבון | Loyalty points — account statement |
| balance | יתרה נוכחית | Current balance |
| expiring | פגי־תוקף קרובים | Expiring soon |
| tier | דרגה | Tier |
| nextTier | הדרגה הבאה | Next tier |
| pointsToNext | נקודות לדרגה הבאה | Points to next tier |
| earn | צבירה | Earned |
| burn | שימוש | Redeemed |
| expire | פג תוקף | Expired |
| transferIn | העברה נכנסת | Transfer in |
| transferOut | העברה יוצאת | Transfer out |
| campaign | מבצע | Campaign bonus |
| adjust | התאמה | Adjustment |
| lifetime | סה״כ לאורך החיים | Lifetime total |
| period | תקופה | Period |
| noActivity | אין פעילות בתקופה זו | No activity in this period |
| liability | התחייבות IFRS 15 | IFRS 15 liability |
| breakage | שיעור נטישה (Breakage) | Breakage rate |
| purchase | רכישה | Purchase |
| review | חוות דעת | Product review |
| referral | הפניה | Referral |
| birthday | יום הולדת | Birthday bonus |
| signup | הרשמה | Signup bonus |
| discount | הנחה | Discount |
| free-item | מוצר חינם | Free item |
| shipping | משלוח חינם | Free shipping |
| gift-card | שובר מתנה | Gift card |

All labels live in the exported `LABELS` map — extend, never remove.

---

## 13. Test coverage summary

```
pass 34 / fail 0 / duration ~142ms
```

| Area | Tests |
|------|-------|
| defineProgram | 3 |
| earnPoints | 4 |
| redeemPoints | 3 |
| balance | 2 |
| tierProgress | 2 |
| statement (bilingual) | 2 |
| expirePoints FIFO | 3 |
| breakageCalc | 1 |
| liabilityProvision (IFRS 15) | 2 |
| fraudRules | 3 |
| campaignPoints | 3 |
| giftTransfer | 2 |
| integration end-to-end | 1 |
| internal helpers | 3 |
| **TOTAL** | **34** |

Run with:
```
cd onyx-procurement
node --test test/customer/loyalty-points.test.js
```

---

## 14. Architectural notes

- **Append-only ledger.** Nothing is ever spliced out. Expiry, redemption,
  transfers — all produce new rows. The `remaining` counter on earn rows
  is updated via frozen-row swap (preserves immutability of each row
  object) so auditors can replay the ledger deterministically.
- **Clock injection.** `new LoyaltyPoints({now: () => iso})` lets tests
  run with a deterministic clock — critical for FIFO expiry tests.
- **Frozen snapshots.** `tierAtTime`, `fairValue`, `meta` captured on
  every earn row. Even if the program contract is upgraded later, prior
  earns retain their historical economics.
- **Zero dependencies.** No `uuid`, no `date-fns`, no `lodash`. Everything
  is hand-rolled and runs in any Node 18+ environment.
- **Pure functions everywhere.** The class holds state, but helper
  functions (`addDays`, `haversineKm`, `round2`, `toISODate`, `label`)
  are pure and re-exported via `_internal` for direct testing.

---

## 15. Upgrade lanes (never delete — grow)

Future agents can extend this module along these seams **without** removing anything:

1. **More earn types.** Extend `EARN_TYPES` constant and add rules — existing ledger rows unchanged.
2. **More redeem types.** Extend `REDEEM_TYPES`. `_fairValuePerPoint` will naturally pick up the best new ratio.
3. **Dynamic redemption probability.** Replace `DEFAULT_REDEMPTION_PROBABILITY` with a rolling 12-month actual from `breakageCalc()`.
4. **Segment predicates.** `_customerInSegment` currently resolves all named segments as truthy; inject a predicate registry to scope campaigns.
5. **Tier downgrades.** Current tiers are sticky-up (lifetime only grows). Add a `_annualDecay` helper without changing existing ledger semantics.
6. **External GL integration.** `liabilityProvision(period).journal` is already in a post-ready shape — just pipe to `src/gl/`.

---

## 16. Compliance & audit checklist

- [x] Append-only ledger
- [x] Frozen row snapshots (immutable after commit)
- [x] Bilingual error messages
- [x] IFRS 15 performance-obligation split (documented + implemented)
- [x] FIFO expiry with audit trail (`sourceEarnId` link)
- [x] Breakage calculation + accrual reversal value
- [x] Fraud alerts in Hebrew + English
- [x] Zero external dependencies (security surface = 0)
- [x] Deterministic clock for reproducible tests
- [x] Tier-snapshot preservation (historical multipliers immutable)

---

## 17. Hebrew glossary — full lexicon

| Technical | עברית |
|-----------|-------|
| Loyalty program | תוכנית נאמנות |
| Loyalty points / stars | נקודות נאמנות / כוכבי נאמנות |
| Ledger | ספר חשבונות |
| Earn (points) | צבירת נקודות |
| Burn / Redeem | מימוש נקודות |
| Expiry | פג תוקף |
| Tier | דרגה |
| Multiplier | מכפיל |
| Threshold | סף |
| Benefits | הטבות |
| Campaign | מבצע |
| Segment | מקטע / סגמנט |
| Fair value | שווי הוגן |
| Contract liability | התחייבות חוזית |
| Performance obligation | מחויבות ביצוע |
| Deferred revenue | הכנסה נדחית |
| Breakage | נטישה (Breakage) |
| Accrual reversal | ביטול צבירה |
| Fraud | הונאה |
| Velocity | מהירות |
| Duplicate | כפילות |
| Geographic mismatch | אי-התאמה גאוגרפית |
| Transfer | העברה |
| Gift | מתנה |
| Recipient | מקבל |
| Sender | שולח |
| IFRS 15 | התקן הבינלאומי 15 / תקן חשבונאות 25 |

---

## 18. Sign-off

**Agent Y-095 — DELIVERED** · 2026-04-11 ·
`src/customer/loyalty-points.js` (class `LoyaltyPoints`, 12 public methods) +
`test/customer/loyalty-points.test.js` (34 tests, all passing) +
this report.

**Rule honoured:** לא מוחקים רק משדרגים ומגדלים.
