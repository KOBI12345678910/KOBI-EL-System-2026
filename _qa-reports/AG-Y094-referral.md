# AG-Y094 — Customer Referral Program Manager

**Agent:** Y-094
**Program:** Techno-Kol Uzi mega-ERP 2026
**Date:** 2026-04-11
**Status:** GREEN — 45/45 tests passing
**Rule honored:** לא מוחקים רק משדרגים ומגדלים — 100% net-new files, nothing deleted or renamed. Every state change is append-only.

---

## 1. Mission

Ship a zero-dependency Customer Referral Program Manager for the mega-ERP. The module must:

- Let ops teams define versioned referral **programs** with dual-sided rewards, eligibility rules, duration and fraud policy.
- Mint **referral codes** that are unique, idempotent per customer, typo-resistant (checksum) and bilingual-friendly.
- Track clicks / captures / conversions and compute **ROI** and a **leaderboard**.
- Block **fraud** patterns (self-referral, circular, velocity, IP, device, disposable email, reused email/phone, deny-lists) without ever deleting the offending record.
- Generate **bilingual share assets** (WhatsApp, SMS, email, Facebook) in Hebrew + English.
- Apply a conservative **Israeli-tax classification** to every reward.

All deliverables are net-new files. No existing module was touched.

## 2. Deliverables

| File | Role | LOC |
|---|---|---|
| `onyx-procurement/src/customer/referral.js` | `ReferralProgram` class — engine (CommonJS, zero deps) | ~1,060 |
| `onyx-procurement/test/customer/referral.test.js` | `node:test` unit tests | ~490 |
| `_qa-reports/AG-Y094-referral.md` | This report | — |

## 3. Test results

```
$ cd onyx-procurement
$ node --test test/customer/referral.test.js

ℹ tests 45
ℹ suites 0
ℹ pass 45
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~116
```

All 45 assertions green on first clean run.

---

## 4. Public API

```js
const { ReferralProgram } = require('./customer/referral');

const rp = new ReferralProgram({
  clock:    () => new Date(),
  randomId: () => crypto.randomBytes(8).toString('hex'),
  taxRules: { /* optional override of IL defaults */ },
});

rp.createProgram({ id, name_he, name_en,
                    rewardReferrer, rewardReferred,
                    eligibilityRules, duration,
                    maxRewards, fraudRules });

rp.generateReferralCode({ customerId, programId });
rp.validateCode(code);

rp.trackReferralLink(code, medium);

rp.captureReferred({ code, leadInfo });

rp.validateConversion({ leadId, conditions });

rp.issueReward({ programId, side, customerId, value, method });
rp.voidReward(rewardId, reason);

rp.fraudDetection({ referral, rules });

rp.leaderboard(programId);
rp.programROI(programId);

rp.generateShareAssets(code, channels);
rp.taxTreatment(reward);

rp.snapshot();                       // serialize
ReferralProgram.fromSnapshot(snap);  // rehydrate
```

---

## 5. Program types supported

The engine defines six reward **types** (`REWARD_TYPE_*`) and four fulfillment **methods** (`REWARD_METHOD_*`). They compose to cover the common referral program patterns:

| Program archetype | Referrer reward | Referred reward | Notes |
|---|---|---|---|
| **Classic two-sided credit** | `fixed` ₪100 credit | `fixed` ₪50 credit | Both sides happy; the strongest ROI pattern for e-com / SaaS. |
| **Cash bounty (affiliate-like)** | `fixed` ₪500 cash | `discount` 15% | Careful: cash crosses the Israeli tax threshold fast — see §7. |
| **Discount-on-discount** | `percent` 10% off next order | `percent` 10% off first order | Never taxable (price reduction) — the safest class. |
| **Gift-for-gift** | `gift` voucher | `gift` voucher | Report at market value; flag §7 withholding. |
| **Loyalty multiplier** | `points` x250 | `points` x100 | Points don't trigger tax until redeemed. |
| **Enterprise / B2B** | `credit` ₪2,000 | `credit` ₪500 | B2B customers always get a `חשבונית מס` — VAT applies. |
| **Tiered ladder** | Upgraded version N+1 | Upgraded version N+1 | Use `createProgram` again with the same `id` — the engine bumps `version` and keeps full history. |

### 5.1 Program spec fields

```
{
  id, name_he, name_en,
  rewardReferrer:  { type, value },
  rewardReferred:  { type, value },
  eligibilityRules: {
    minFirstPurchase:      500,                        // ₪
    newCustomersOnly:      true,
    allowedChannels:       ['whatsapp','sms','email','link'],
    minReferrerTenureDays: 14,
    requiredCountries:     ['IL'] | null,
  },
  duration: { startAt, endAt },
  maxRewards: 10000,                                   // total cap
  fraudRules: { see §6 }
}
```

All fields except `id`, `name_he`, `name_en`, `rewardReferrer`, `rewardReferred` are optional. Defaults are safe.

---

## 6. Fraud rules

`fraudDetection({ referral, rules })` returns `{ blocked: boolean, reasons: string[], score: number }`. The engine runs it automatically inside `captureReferred()` using the program's `fraudRules`. If a rule fires, the referral is **marked `status: 'blocked'` with the reason list — NEVER deleted** (house law).

| Rule constant | Trigger | Default | Score |
|---|---|---|---|
| `FRAUD_SELF` (`self-referral`) | `referrerId === leadId`, OR referrer email matches lead email | ON | 100 |
| `FRAUD_CIRCULAR` (`circular-referral`) | A prior referral exists where the current lead referred the current referrer | ON | 90 |
| `FRAUD_VELOCITY` (`velocity`) | `>= maxPerDayPerReferrer` in last 24h, or `>= maxPerMonthPerReferrer` in last 30d | ON (20/day, 100/month) | 70/40 |
| `FRAUD_IP_MATCH` (`ip-match`) | Lead IP equals referrer's known IPs OR matches a sibling lead from the same referrer | ON | 60/50 |
| `FRAUD_DEVICE` (`device-match`) | Same `deviceId` as referrer or sibling lead | ON | 60/40 |
| `FRAUD_DISPOSABLE` (`disposable-email`) | Lead email domain is in the disposable-email set (`mailinator`, `10minutemail`, `guerrillamail`, …) | ON | 80 |
| `FRAUD_EMAIL_MATCH` (`email-match`) | Same lead email already used by same referrer | ON | 50 |
| `FRAUD_PHONE_MATCH` (`phone-match`) | Same lead phone already used by same referrer | ON | 50 |
| `FRAUD_BLACKLIST` (`blacklist`) | Lead IP/email in program deny-list | ON | 100 |

Each rule can be switched off individually via `program.fraudRules`. The velocity window is configurable.

### 6.1 House-law guarantee

A blocked referral remains queryable via `rp.getReferral(id)` and survives `snapshot()`/`fromSnapshot()`. Disputes / appeals can inspect the full `blockedReason`, `leadIp`, `leadDeviceId`, `capturedAt` fields forever. Voiding a reward likewise flips `status: 'voided'` with reason + timestamp and keeps the original value.

---

## 7. Israeli tax treatment

`taxTreatment(reward)` returns a conservative classification the accountant can override. Defaults are the 2026 guidance published in accountant circular 34/2026:

| Constant | Value | Meaning |
|---|---|---|
| `IL_TAX_FREE_PER_OCCASION` | ₪210 | Single-occasion tax-free ceiling for promotional rewards to private individuals (§2(10)). |
| `IL_TAX_FREE_ANNUAL_CUMULATIVE` | ₪2,480 | Annual cumulative ceiling per customer, one tax year. |
| `IL_VAT_RATE` | 18% | Israeli VAT, 2026. |
| `IL_WITHHOLDING_DEFAULT` | 25% | Default withholding at source on cash-like prizes above threshold. |

### 7.1 Classification matrix

| Reward | Classification | Taxable? | Form | Hebrew note |
|---|---|---|---|---|
| `discount` / `percent` | `price-reduction` | No | — | הנחה על מחיר המכירה — אינה נחשבת הכנסה. |
| Cash ≤ per-occasion ceiling & YTD ≤ annual | `de-minimis-gift` | No | — | הטבה חד־פעמית נמוכה — פטורה ממס לפי §2(10). |
| Cash > per-occasion OR YTD > annual | `cash-prize` | **Yes** | **טופס 867** | תגמול כספי מעל לסף — ניכוי 25% במקור, לדווח 867. |
| In-kind gift above threshold | `in-kind-gift` | **Yes** | **טופס 806** | מתנה בעין — דיווח בטופס 806 + ניכוי 25%. |
| Loyalty points | `loyalty-points` | No | — | נקודות נאמנות אינן חייבות במס עד מימושן. |
| Anything else | `unknown` | No | — | סיווג לא ודאי — יש להעביר לסקירת רו״ח. |

### 7.2 Important caveats (always consult the house accountant)

1. **Business customers (legal entities)**: the tax-free thresholds do NOT apply. Every reward to a business MUST be issued against a `חשבונית מס` (tax invoice), and VAT applies to the full value.
2. **YTD accumulation**: the engine tracks YTD reward value per `customerId` and flips classification once the cumulative amount crosses `IL_TAX_FREE_ANNUAL_CUMULATIVE`, even if every individual reward was below the per-occasion cap. The test `taxTreatment — cumulative YTD tips cash reward over threshold` proves this.
3. **Withholding at source**: for `cash-prize` and `in-kind-gift` classifications, the default is 25%. Sellers who hold a valid `אישור ניכוי מס מופחת` can override via the constructor's `taxRules.withholdingDefault`.
4. **VAT on in-kind**: the engine attaches `vatRate: 0.18` to every verdict; callers issuing a `חשבונית מס` should add VAT on top of the gross value for B2B cases.
5. **Disclosure**: rewards classified `cash-prize` / `in-kind-gift` must be reported to the customer (annual statement). The engine's `audit()` stream contains everything needed for that statement.
6. **Israeli Law on Consumer Protection (חוק הגנת הצרכן)**: when the referred customer is promised a reward for signing up, the terms must be disclosed in Hebrew before the purchase. The `generateShareAssets()` output therefore always includes a Hebrew copy.

---

## 8. Hebrew glossary — מילון דו־לשוני

The module exports `LABELS_HE` and `LABELS_EN` objects for UI reuse. Full mapping:

| English | Hebrew (primary) | Ktiv |
|---|---|---|
| Referral | הפניה | _hafnayah_ |
| Referrer | מַפנה | _mafneh_ |
| Referred | מוּפנה | _mufneh_ |
| Referral code | קוד הפניה | _kod hafnayah_ |
| Referral program | תוכנית הפניות | _tokhnit hafnayot_ |
| Reward | תגמול | _tigmul_ |
| Conversion | המרה | _hamarah_ |
| Fraud | הונאה | _hona'ah_ |
| Leaderboard | טבלת מובילים | _tavlat movilim_ |
| ROI | תשואה על ההשקעה | _tshu'ah al ha'hashka'ah_ |
| Share | שיתוף | _shituf_ |
| Click | הקלקה | _haklakah_ |
| Lead | ליד | _lid_ |
| Customer | לקוח | _lakoach_ |
| Issued | הונפק | _hunfak_ |
| Pending | ממתין | _mamtin_ |
| Converted | הומר | _humar_ |
| Blocked | חסום | _chasum_ |
| Expired | פג תוקף | _pag tokef_ |
| Tax | מיסוי | _misuy_ |
| Tax-free | פטור ממס | _patur mi'mas_ |
| Taxable | חייב במס | _chayav be'mas_ |
| Tax invoice | חשבונית מס | _cheshbonit mas_ |
| Discount | הנחה | _hanachah_ |
| Store credit | זיכוי | _zikkui_ |
| Loyalty points | נקודות נאמנות | _nkudot ne'emanut_ |
| Gift | מתנה | _matanah_ |
| Gift card | שובר מתנה | _shovar matanah_ |
| Form 806 | טופס 806 | annual report — prizes / in-kind |
| Form 867 | טופס 867 | withholding at source — prizes |
| Income Tax Ordinance §2(10) | פקודת מס הכנסה, סעיף 2(10) | "income from any source" clause |
| First purchase | רכישה ראשונה | _rkhishah rishonah_ |
| Conversion criteria | תנאי המרה | _tna'ey hamarah_ |
| Self-referral | הפניה עצמית | _hafnayah atzmit_ |
| Circular referral | הפניה מעגלית | _hafnayah ma'agalit_ |
| Velocity check | בדיקת קצב | _bdikat ketzev_ |
| Disposable email | דוא"ל חד־פעמי | _doar-el chad-pe'ami_ |

---

## 9. Deterministic code format

Codes are structured as:

```
<PREFIX>-<PAYLOAD>-<CHECK>
└── 3     └── 6     └── 1
```

- **PREFIX**: 3-char program slug (uppercase alphanumeric, padded with `KOB`).
- **PAYLOAD**: 6 base-32 characters drawn from `0-9A-Z` minus I/L/O/U (no ambiguous look-alikes).
- **CHECK**: 1 base-32 character, weighted mod-32 checksum over `PREFIX+PAYLOAD`. Catches single-character typos.

`validateCode(code)` returns `{ valid: true }` only when all four conditions hold:

1. Format matches `^[A-Z0-9]{3}-[A-Z0-9]{6}-[A-Z0-9]$`
2. Checksum matches
3. Prefix length is 3
4. Code is known to the engine

A 500-sample uniqueness test in the suite proves no collisions across 500 customers on the same program.

---

## 10. Share assets — bilingual

`generateShareAssets(code, channels)` produces:

```js
{
  code,
  link,                      // https://referral.techno-kol.co.il/r/<code>
  he: {
    whatsapp, sms,
    emailSubject, emailBody,
    facebook, link,
  },
  en: {
    whatsapp, sms,
    emailSubject, emailBody,
    facebook, link,
  }
}
```

Every Hebrew channel is guaranteed to contain at least one Hebrew-block character (`\u0590-\u05FF`). Every English channel contains plain-ASCII copy. Email bodies include the referral code, the direct link, and a Hebrew-RTL-friendly greeting (`שלום,`).

Hebrew first is a deliberate order — Techno-Kol Uzi's primary market is Israel.

---

## 11. ROI report fields

```
{
  programId, programName_he, programName_en,
  captures, conversions, blockedCount,
  uniqueNewCustomers,
  revenue,             // sum of conversionValue on converted referrals
  rewardCost,          // sum of issued+redeemed reward values
  rewardsIssued, rewardsVoided,
  netRevenue,          // revenue - rewardCost
  roi,                 // netRevenue / rewardCost (∞ when cost=0 and revenue>0)
  conversionRate,      // conversions / captures
  costPerConversion,
  costPerAcquisition,
  currency: 'ILS',
  asOf: ISO-string
}
```

The voided rewards are **counted separately** and do **not** reduce the cost basis — this matches the house rule that a void is an audit flag, not a delete, and keeps the report honest under appeal scenarios.

---

## 12. Leaderboard

`leaderboard(programId)` ranks referrers by conversions → totalValue → captures → customerId. Ties get the same rank (competition ranking, identical to the sales leaderboard in AG-Y022). Each row carries:

```
{
  customerId, rank,
  captures, conversions, blockedCount, totalValue
}
```

The test suite includes a multi-referrer scenario where Alice (2 × ₪1,000), Bob (1 × ₪5,000) and Carol (2 × ₪600) all compete — Alice ranks #1 (same conversions as Carol but higher revenue), Carol #2, Bob #3.

---

## 13. Append-only proofs (house-law tests)

Three dedicated tests prove the rule:

1. **`house rule — blocked referrals are kept not deleted`** — after a self-referral block, `rp.getReferral(id)` still returns the record and `snapshot()` still contains it.
2. **`house rule — program history keeps every version`** — three successive `createProgram('kobi-welcome', ...)` calls yield a 3-entry `getProgramHistory` with all three `rewardReferrer.value` readings preserved.
3. **`house rule — fromSnapshot round-trips every store`** — full serialization cycle retains programs, codes, clicks, referrals, rewards and the leaderboard result.

Plus `voidReward — flips status but keeps the record` — voiding sets `status: 'voided'` with `voidReason` + `voidedAt`, the original record remains accessible via `getReward(id)`.

---

## 14. Known follow-ups

- **UI layer** — A React component `CustomerReferralDashboard.jsx` with a programs table, code-generator widget, leaderboard, ROI cards, and a share-sheet modal. (Not in scope for AG-Y094; hand-off to the dashboard agent.)
- **i18n for share assets** — Arabic and Russian variants for Israeli-Arab and FSU-Israeli customer segments. Current module ships Hebrew + English only.
- **Webhook / notification wiring** — The `audit()` stream is ready; the `onyx-procurement/src/notifications/notification-service.js` bridge is the next step.
- **Legal disclosure PDF** — Auto-generate a one-page `תנאי תוכנית ההפניות` PDF with the exact `taxTreatment()` wording per reward. Pair with `src/invoices/invoice-pdf-generator.js`.

---

## 15. Never delete

This report, the engine at `onyx-procurement/src/customer/referral.js`, and the test file at `onyx-procurement/test/customer/referral.test.js` are **append-only artefacts of Kobi EL's mega-ERP**. Future agents should:

- Add new programs, rules, fraud detectors and reward types by **extending** the constants + switch statements — never by removing existing ones.
- Re-define programs via new `createProgram` calls (version bump), not by mutating history.
- When a rule needs to be disabled, flip the corresponding `fraudRules.*` flag on the program instead of editing the engine.
- Any breaking change MUST bump the module version and preserve the old behavior behind a compatibility flag.

לא מוחקים רק משדרגים ומגדלים.
