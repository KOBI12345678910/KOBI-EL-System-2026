# AG-Y145 — Gift & Hospitality Register
## דוח QA — מרשם מתנות ואירוח לעובדים

**Agent**: Y-145 (Compliance Swarm)
**System**: Techno-Kol Uzi Mega-ERP 2026 / onyx-procurement
**Report date / תאריך דוח**: 2026-04-11
**Status / מצב**: PASS — 26/26 בדיקות עוברות

---

## 1. Mission / משימה

Build an anti-corruption register that tracks every gift, meal, trip, event ticket, discount, loan, service or cash-equivalent benefit flowing to Techno-Kol Uzi employees from third parties, and enforce Israeli anti-bribery law חוק העונשין §290-291 through tier-based approvals, conflict-of-interest checks, annual cumulative ceilings, exception overrides, training expiry, and quarterly attestation reminders.

בנה מרשם אנטי-שחיתות המתעד כל מתנה, ארוחה, נסיעה, כרטיס לאירוע, הנחה, הלוואה, שירות או שווה-מזומן שזורם לעובד של טכנו-קול עוזי מגורם חיצוני, ואוכף את חוק העונשין §290-291 באמצעות שכבות אישור לפי ערך, בדיקות ניגוד עניינים, תקרה מצטברת שנתית, חריגי דילוג, תוקף הכשרה, ותזכורות רבעוניות.

---

## 2. Files / קבצים

| Path / נתיב | Purpose / מטרה |
| --- | --- |
| `onyx-procurement/src/compliance/gift-register.js` | Production module (class `GiftRegister`, 0 external deps) |
| `onyx-procurement/test/compliance/gift-register.test.js` | 26 Node built-in tests (node:test + node:assert/strict) |
| `_qa-reports/AG-Y145-gift-register.md` | This QA report |

---

## 3. Legal basis — חוק העונשין, התשל"ז-1977

### 3.1 §290 — לקיחת שוחד (taking a bribe)

> **סעיף 290(א)** — "עובד הציבור הלוקח שוחד בעד פעולה הקשורה בתפקידו, דינו מאסר עשר שנים או קנס..."

An Israeli public servant who takes a bribe in connection with an act of his office is liable to up to **ten years** of imprisonment and/or a fine. The statute defines "bribe" (שוחד) very broadly, including money, money's worth, a service, a benefit, or any other advantage — whether given to the public servant directly, to a family member, or through an intermediary (§290-291 read together with §293).

### 3.2 §291 — מתן שוחד (giving a bribe)

> **סעיף 291(א)** — "הנותן שוחד לעובד הציבור בעד פעולה הקשורה בתפקידו, דינו מאסר שבע שנים או קנס..."

The mirror offence: anyone giving a bribe to a public servant in connection with an act of his office is liable to up to **seven years** of imprisonment. This section is what creates direct exposure for Techno-Kol Uzi employees who **offer** gifts, entertainment, or benefits to any ציבור recipient — including municipal planners, Interior Ministry permit officers, Tax Authority inspectors, Land Authority (רמ"י) staff, and military procurement officers we interact with daily.

### 3.3 §291א — Bribing a foreign public official

Added in 2008 to align Israel with the OECD Anti-Bribery Convention. An employee who bribes a foreign government official in the course of international business is liable to the same penalties as §291. Travel gifts, conference invitations, and consulting payments to foreign officials are all within scope.

### 3.4 §293 — Definition of "benefit" (טובת הנאה)

§293 makes the §290-291 definitions expansive: "benefit" includes any money, money's worth, service, loan, advantage, hospitality, or favour — whether delivered before or after the related act, whether solicited by the recipient or offered spontaneously, and whether accepted directly or through an intermediary.

### 3.5 Private-sector exposure

Even though §290-291 strictly target public servants, **private-sector employees** of Techno-Kol Uzi remain exposed through:

- **§252-254** (breach of trust by a corporate employee)
- **§2 חוק איסור הלבנת הון, התש"ס-2000** (money-laundering — receiving proceeds of bribery)
- **§254א חוק העונשין** (corporate liability for officers' acts)
- **§5 חוק החברות** (directors' fiduciary duty of loyalty)
- **State Attorney Guideline 1.14** (הנחיית פרקליט המדינה 1.14 — corporate self-reporting expectations)

Accordingly, this register applies a **stricter-than-law** internal policy to all employees regardless of public/private recipient status.

---

## 4. Threshold table / טבלת תקרות

### 4.1 Private sector (default)

| Tier | טווח | ILS range | Action | פעולה |
| --- | --- | --- | --- | --- |
| `none` | ללא הצהרה | `< ₪200` | No declaration | אין חובת הצהרה |
| `declare` | הצהרה בלבד | `₪200-500` | Declare within 7 days | להצהיר תוך 7 ימים |
| `declare-approve` | הצהרה + אישור | `₪500-2,000` | Declare + manager approval | הצהרה + אישור מנהל |
| `refuse` | לסרב/להחזיר | `> ₪2,000` | Must refuse or return | לסרב או להחזיר |
| **Annual cumulative** | **תקרה שנתית** | **₪3,000** | Escalate to compliance | להעביר לציות |

### 4.2 Public sector (§290-291 exposure)

| Tier | ILS range | Rationale |
| --- | --- | --- |
| `none` | `< ₪100` | Halved floor — inspectors, clerks |
| `declare` | `₪100-150` | Courtesy coffee or token only |
| `declare-approve` | `₪150-300` | Formal approval required |
| `refuse` | `> ₪300` | Anything above ₪300 is refused — statutory risk |
| **Annual cumulative** | **₪500** | Lifetime-value aggregation per official |

### 4.3 Always-declare items / פריטים הצהרה חובה

Regardless of value, the following items must always be declared (escalate `none → declare` automatically):

- **Travel / נסיעה** (flights, hotels, transport)
- **Event tickets / כרטיסי אירוע** (concerts, sports, premieres)
- **Cash-equivalent / שווה-מזומן** (vouchers, gift cards, crypto) — further escalated to `declare-approve` even below ₪500

---

## 5. Conflict-of-interest rules / כללי ניגוד עניינים

A gift triggers a conflict-of-interest flag when the giver satisfies any of these conditions, with severity rollup:

| Rule | Severity | Hebrew reason |
| --- | --- | --- |
| Active vendor of the company | high | ספק פעיל של החברה |
| Prospective vendor in negotiation | medium | ספק פוטנציאלי במו"מ |
| Active customer | medium | לקוח פעיל של החברה |
| Pending deal / open RFQ | high | עסקה פתוחה עם החברה |
| Employee directly involved in the contract | high | העובד מעורב ישירות בהתקשרות |
| Public official | high | עובד ציבור — §290-291 |

Any HIGH-severity flag is persisted on the gift record and surfaced in `auditReport().conflicts`. The register **does not refuse** a gift solely because a conflict exists — it escalates visibility so the compliance officer can decide.

---

## 6. Public-sector restrictions / הגבלות למגזר הציבורי

When the recipient is a public official (Techno-Kol Uzi is **giving** rather than receiving), call `publicSectorGift(recipient, value)`. It returns:

```json
{
  "allowed": false,
  "tier": "refuse",
  "reason": "Exceeds public-sector ceiling — §290/291 exposure",
  "reasonHe": "חריגה מתקרת המגזר הציבורי — חשיפה ל-§290/291",
  "statuteReference": "§290 + §291 + §293 חוק העונשין תשל\"ז-1977"
}
```

Practical rules enforced:

1. **≤ ₪100** — allowed; no declaration.
2. **₪100-150** — allowed with declaration (courtesy coffee, token).
3. **₪150-300** — requires compliance approval; document business rationale.
4. **> ₪300** — **refuse**; any variance needs board-level exception request.
5. **Travel, tickets, cash-equivalents** — always trigger approval regardless of value.

The recipient profile must include a stable identifier (`id`) and should set `isPublicOfficial: true` on the giver envelope to propagate the flag into the conflict checker.

---

## 7. API contract / חוזה API

```js
const { GiftRegister, GIFT_TYPES, DECISIONS } = require('./gift-register.js');
const reg = new GiftRegister();

// register vendor metadata used by the conflict checker
reg.registerVendor('vendor-acme', {
  active: true,
  pendingDeals: ['RFQ-2026-044'],
  involvedEmployees: ['emp-101'],
});

// declare a gift
const gift = reg.declareGift({
  employeeId: 'emp-101',
  giftType: GIFT_TYPES.EVENT_TICKET,
  givenBy: 'vendor-acme',
  estimatedValue: 1500,
  currency: 'ILS',
  context: 'Hapoel T"A season box',
  date: '2026-04-01',
  declaredWithinDays: 1,
});

// approve / return / donate / forfeit
reg.approveGift({
  giftId: gift.giftId,
  approverId: 'mgr-001',
  decision: DECISIONS.DONATE_TO_CHARITY,
  notes: 'Donate to youth sports charity',
});

// cumulative check
const agg = reg.aggregateAnnual('emp-101', 2026);
if (agg.exceededCeiling) escalate(agg);

// quarterly attestation reminder
reg.register90DayReminder();

// bilingual compliance report
const rep = reg.auditReport({ from: '2026-01-01', to: '2026-12-31' });
```

### 7.1 Methods

| Method | Purpose |
| --- | --- |
| `declareGift(input)` | Create a gift record + auto-classify + conflict check |
| `threshold(policy)` | Return bilingual tier schema for `'private'` or `'public'` |
| `classifyGift(valueIls, type, policy)` | Pure tier classification |
| `approveGift({giftId, approverId, decision, notes})` | Append decision (never overwrite) |
| `giftHistory({employeeId, giverId, year, tier})` | Filtered history |
| `conflictOfInterestCheck({employeeId, giver})` | COI screening with severity |
| `aggregateAnnual(employeeId, year)` | Cumulative total + ceiling flag |
| `auditReport(period)` | Bilingual company-wide statistics |
| `exceptionRequest({giftId, reason, approver})` | Override for unusual cases |
| `publicSectorGift(recipient, value)` | Public-sector outbound check |
| `training({employeeId, completed, expiryDays})` | Record annual training |
| `trainingStatus(employeeId)` | Current validity + days-left |
| `register90DayReminder(opts)` | Bilingual quarterly attestation |
| `registerVendor(id, profile)` | Vendor registry for COI |
| `auditLog(filter)` / `verifyChain()` | Append-only hash-chained events |

---

## 8. Immutability guarantees / ערבויות אי-השחתה

- **Event log**: hash-chained (SHA-256 over canonicalised JSON) — every mutation appends a new event whose `prevHash` equals the previous event's `hash`. `verifyChain()` walks the chain and returns `{ valid: false, brokenAt: i }` on tamper.
- **Decisions**: stored as an append-only array on each gift record; every subsequent decision adds rather than replaces. A gift can go `accept → donate → forfeit → return` and all four entries are preserved.
- **Exceptions**: tracked in a separate `_exceptions` Map; the gift retains `exceptions[]` for historical visibility.
- **Training**: every `training()` call pushes to `_trainingLog`. The latest record is surfaced via `trainingStatus()` but older records remain in the log.
- **Reminders**: pushed to `_reminders` and emit `REMINDER_ISSUED` events.
- **No destructive APIs**: there is no `delete`, no `reset`, and no `purge`. "לא מוחקים רק משדרגים ומגדלים" is enforced by construction.

---

## 9. Hebrew glossary / מונחון

| English | עברית | Context |
| --- | --- | --- |
| Gift register | מרשם מתנות | The overall module |
| Hospitality | אירוח | Meals, entertainment |
| Benefit | טובת הנאה | Legal term from §293 |
| Bribe | שוחד | §290-291 core offence |
| Public servant | עובד ציבור | §290 actor |
| Conflict of interest | ניגוד עניינים | COI check |
| Active vendor | ספק פעיל | COI trigger |
| Prospective vendor | ספק פוטנציאלי | COI trigger |
| Pending deal | עסקה פתוחה | COI trigger |
| Declaration | הצהרה | Employee's report |
| Approval | אישור | Manager sign-off |
| Refuse / return | סירוב / החזרה | Tier-4 action |
| Donate to charity | תרומה לצדקה | Decision option |
| Forfeit | החרמה | Surrender to company |
| Exception request | בקשת חריגה | Board-level override |
| Annual cumulative | תקרה שנתית מצטברת | Per-employee ceiling |
| Training expiry | פג תוקף הכשרה | Annual anti-bribery training |
| Quarterly attestation | הצהרה רבעונית | 90-day reminder |
| Stay order | צו עיכוב | Court-issued freeze |
| Compliance officer | קצין ציות | Owner of escalations |
| Protocol | פרוטוקול | Diplomatic context |
| Append-only | לוג בלבד — ללא מחיקה | Immutability policy |

---

## 10. Test results / תוצאות בדיקה

```
node --test onyx-procurement/test/compliance/gift-register.test.js

▶ GiftRegister — declaration for every gift type
  ✔ 1) declareGift accepts physical-gift, meal, travel, event-ticket,
       discount, loan, service, cash-equivalent
  ✔ 2) declareGift rejects unknown gift type
▶ GiftRegister — threshold tiers
  ✔ 3) ₪150 physical gift is below threshold (NONE tier)
  ✔ 4) ₪350 gift requires declaration only
  ✔ 5) ₪1,500 gift requires declaration + approval
  ✔ 6) ₪3,000 gift must be refused
  ✔ 7) threshold() returns bilingual schema with 4 tiers and annual ceiling
  ✔ 8) always-declare types (travel, event-ticket, cash) escalate NONE→DECLARE
▶ GiftRegister — approval flow (append-only)
  ✔ 9) approveGift appends accept decision and flips status to approved
  ✔ 10) approveGift supports all four decisions and append-only chain
  ✔ 11) approveGift rejects unknown decisions and missing gifts
▶ GiftRegister — history & conflict of interest
  ✔ 12) giftHistory filters by employeeId and giverId
  ✔ 13) conflictOfInterestCheck flags current vendor with pending deal as HIGH severity
  ✔ 14) conflict flags propagate into the declared gift record
▶ GiftRegister — public-sector stricter rules (§290-291)
  ✔ 15) public-sector ₪400 gift must be refused
  ✔ 16) public-sector ₪90 coffee is within allowance
  ✔ 17) declaring a public-sector gift uses the stricter policy
▶ GiftRegister — annual cumulative
  ✔ 18) aggregateAnnual sums per-employee totals and flags ceiling breaches
  ✔ 19) aggregateAnnual is within ceiling when cumulative ≤ 3,000
▶ GiftRegister — exceptions, training & reminders
  ✔ 20) exceptionRequest attaches to gift and marks it under-exception
  ✔ 21) training() stores expiry and trainingStatus reports expiry window
  ✔ 22) trainingStatus returns no-training-on-file for unknown employees
  ✔ 23) register90DayReminder issues bilingual reminders to all employees with history
▶ GiftRegister — audit, reporting & immutability
  ✔ 24) auditReport produces bilingual statistics with refusals, conflicts, top givers
  ✔ 25) auditLog is append-only and hash-chain verifies
  ✔ 26) FX conversion — USD/EUR/GBP normalise to ILS

ℹ tests     26
ℹ suites     8
ℹ pass      26
ℹ fail       0
```

26 tests passing, 0 failing. Coverage spans all eight gift types, all four threshold tiers, all four decision types, COI severity rollup, public-sector stricter policy, annual cumulative ceiling, exception handling, training expiry, quarterly reminders, bilingual reporting, FX normalisation, and hash-chain immutability verification.

---

## 11. Integration notes / הערות אינטגרציה

- **Zero external dependencies** — module uses only `node:crypto`. The test file uses only `node:test` + `node:assert/strict`.
- **Loose coupling** — the host application should wire `gift.declared`, `conflict.flagged`, and `reminder.issued` events to HR mail, Slack, or the audit dashboard. The module emits events; it never imports transport layers.
- **Vendor registry** — `registerVendor(id, profile)` is the hook for the procurement bridge (AG-Y109). The vendor file already stored in onyx-procurement can be replayed into the register on startup.
- **Training pipeline** — `training()` can be driven by the LMS integration. On startup, replay all training completions to rebuild the `_training` Map.
- **Scheduler** — `register90DayReminder()` is idempotent and should be called by a cron/worker once per calendar quarter (1-Jan / 1-Apr / 1-Jul / 1-Oct).
- **RTL UI** — every user-facing payload returns both `*He` and English fields; the dashboard should bind Hebrew labels to RTL containers.

---

## 12. Sign-off / אישור

| Signature | Role | Date |
| --- | --- | --- |
| Agent Y-145 | Compliance Swarm (code) | 2026-04-11 |
| Compliance Officer | Techno-Kol Uzi | _pending_ |
| General Counsel | Techno-Kol Uzi | _pending_ |

**Verdict**: READY FOR REVIEW — דוח מוכן לבדיקה משפטית.
