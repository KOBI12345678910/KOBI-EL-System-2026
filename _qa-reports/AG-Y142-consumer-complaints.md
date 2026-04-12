# AG-Y142 — Consumer Complaints Handler / טפסני תלונות צרכנים

**Agent:** Y-142
**Module:** `onyx-procurement/src/compliance/consumer-complaints.js`
**Tests:** `onyx-procurement/test/compliance/consumer-complaints.test.js`
**Run:** `node --test onyx-procurement/test/compliance/consumer-complaints.test.js`
**Status:** 27/27 tests passing (target ≥ 18)
**Date:** 2026-04-11
**House rule:** לא מוחקים רק משדרגים ומגדלים
**External deps:** zero — only `node:crypto` (built-in)

---

## 1. Mission / משימה

### EN
Build a consumer-complaints intake, classification, routing, and
escalation engine compliant with **Consumer Protection Law, 5741-1981**
(*חוק הגנת הצרכן, התשמ"א-1981*). The module must be bilingual (Hebrew
RTL + English LTR), entirely in-memory, append-only, and ready to hand
off to the commissioner workflow at `הרשות להגנת הצרכן ולסחר הוגן`.

### HE
יש לבנות מנוע לקליטה, סיווג, ניתוב והסלמה של תלונות צרכנים המציית
ל**חוק הגנת הצרכן, התשמ"א-1981**. המודול דו-לשוני (עברית RTL +
אנגלית), מבוסס זיכרון בלבד, append-only, ומוכן להעברה לרשות להגנת
הצרכן ולסחר הוגן לצורך הסלמה רגולטורית.

---

## 2. Statutory basis / מקור חוקי

| Section / סעיף | Hebrew | English | Applied to |
|---|---|---|---|
| §2א | איסור אפלייה ונגישות | Non-discrimination & accessibility | `accessibility` |
| §4א | חובת גילוי | Duty of disclosure | `quality` |
| §7 | איסור הטעייה | Prohibition on misleading ads | `misleading-ad` |
| §14ג | עסקת מכר מרחוק — 14 יום | Distance-sale 14-day cooling-off | `refund-denied`, `refundEligibility()` |
| §14ג1 | 4 חודשים לאזרח ותיק / בעל מוגבלות | 4-month window for elderly/disabled | `refundEligibility()` |
| §14ד | הוראות אספקה | Delivery provisions | `delivery` |
| §17 | אחריות על טובין | Warranty on goods | `warranty`, `defective-product` |
| §17ב | סימון מחיר | Price marking | `price-discrepancy` |
| §22 | עיצום כספי (עד ₪45,000) | Administrative fine (up to ₪45,000) | `escalateToCommissioner()` |
| §31 | אכיפה אזרחית + תובענה ייצוגית | Civil enforcement + class action | `escalateToCommissioner()` |
| §31א | הגנת פרטיות הצרכן | Consumer privacy | `privacy` |

**Companion statute:** חוק האחריות למוצרים פגומים, התש"ם-1980 —
Defective Products Liability Law, 5740-1980. Applied by
`refundEligibility()` when `category === 'defective-product'` or
`'quality'`: refund is *always* available, no window.

**Regulator / רגולטור:**
`הרשות להגנת הצרכן ולסחר הוגן` — משרד הכלכלה והתעשייה
Israel Consumer Protection and Fair Trade Authority — Ministry of Economy
[https://www.gov.il/he/departments/molsa](https://www.gov.il/he/departments/molsa)

---

## 3. Nine complaint categories / תשע קטגוריות תלונה

| # | Key | עברית | English | Statute |
|---|-----|-------|---------|---------|
| 1 | `misleading-ad` | פרסום מטעה | Misleading advertisement | §7 |
| 2 | `defective-product` | מוצר פגום | Defective product | §17 + PLL 1980 |
| 3 | `warranty` | הפרת אחריות | Warranty breach | §17-18 |
| 4 | `refund-denied` | סירוב להחזר | Refund refusal | §14ג |
| 5 | `price-discrepancy` | אי-התאמת מחיר | Price discrepancy | §17ב |
| 6 | `quality` | פגם באיכות | Quality defect | §4א |
| 7 | `delivery` | בעיית אספקה | Delivery problem | §14ד |
| 8 | `privacy` | פגיעה בפרטיות | Privacy breach | §31א |
| 9 | `accessibility` | ליקוי נגישות | Accessibility failure | §2א |

---

## 4. Public API / ממשק

| Method | Description (EN) | תיאור (HE) |
|---|---|---|
| `receiveComplaint()` | Intake + hash customerId + auto-classify | קליטה + hashing ת.ז. + סיווג אוטומטי |
| `classifyComplaint()` | Severity (minor/major/critical) via keywords + amount | סיווג חומרה לפי מילות מפתח וסכום |
| `assignInvestigator()` | Route by category (`auto`) + set SLA | ניתוב לפי קטגוריה + קביעת SLA |
| `statutoryDeadline()` | 14-day ack + 60-day resolution targets | 14 יום אישור + 60 יום פתרון |
| `recordResponse()` | Append refund/replace/repair/credit/reject | הוספת תגובה (append-only) |
| `refundEligibility()` | §14ג/§14ג1 cooling-off + PLL defect rule | זכות ביטול §14ג/§14ג1 + חוק מוצרים פגומים |
| `escalateToCommissioner()` | Formal escalation + §22 fine ceiling | הסלמה + תקרת קנס §22 |
| `templateResponse()` | Bilingual HE/EN letter with statute citation | מכתב דו-לשוני עם ציטוט חוקי |
| `trackSLA()` | Hours elapsed + breach flag | שעות חלפו + דגל הפרה |
| `bulkClass()` | Period aggregate by category/severity/status | דוח תקופתי מצטבר |
| `consumerRights()` | Bilingual rights summary | סיכום זכויות דו-לשוני |
| `listComplaints(filter)` | Query by status/category/severity | שאילתה לפי סטטוס/קטגוריה |
| `getComplaint(id)` | Retrieve by id | שליפה לפי מזהה |
| `events(filter)` | Read-only hash-chained event log | יומן אירועים שרשרתי |
| `closeComplaint()` | Close without deletion | סגירה ללא מחיקה |

---

## 5. Severity auto-classification / סיווג חומרה אוטומטי

**Critical** — triggered by:
- Hebrew/English safety keywords: `שריפה, כוויה, פציעה, אשפוז, מכת חשמל, הרעלה, מוות, קטלני, סכנה, פיצוץ, fire, burn, injur, hospital, shock, poison, death, fatal`
- Amount ≥ ₪20,000

**Major** — triggered by:
- Hebrew/English refund keywords: `החזר, החלפה, שבור, לא עובד, פגום, נזילה, תקלה, refund, replace, broken, defect, leak`
- Amount ≥ ₪2,000
- Sensitive categories: `misleading-ad`, `privacy`, `accessibility`, `defective-product`, `refund-denied`

**Minor** — default.

---

## 6. Status lifecycle / מחזור חיים

```
received → under-investigation → responded → resolved
                              ↘  escalated  ↘  closed
```

Transitions are strictly forward. No state regression. No record deletion.
Every transition writes a hash-chained event to the append-only log.

---

## 7. SLA targets / יעדי SLA

| Stage | Hours | Days | Statute alignment |
|---|---|---|---|
| Acknowledgment / אישור | 336 | 14 | "Reasonable time" per §31 (best practice 14d) |
| Resolution / פתרון | 1,440 | 60 | Best practice for dispute closure |
| Critical complaint | 24 | 1 | Internal escalation — not statutory |
| Major complaint | 72 | 3 | Internal escalation — not statutory |

---

## 8. Cooling-off decision matrix / טבלת זכות ביטול §14ג

| Purchase channel | Default window | Protected window (≥65 / disabled) | Reference |
|---|---|---|---|
| `online` | 14 days | 120 days | §14ג / §14ג1 |
| `phone` | 14 days | 120 days | §14ג / §14ג1 |
| `catalog` | 14 days | 120 days | §14ג / §14ג1 |
| `door-to-door` | 14 days | 120 days | §14ג / §14ג1 |
| `in-store` | — | — | No automatic cooling-off |
| **Any channel + defective product** | **Always** | **Always** | §17 + PLL 1980 |

---

## 9. Test coverage / כיסוי בדיקות

**Total: 27 tests — all passing**

```
ℹ tests 27
ℹ pass  27
ℹ fail  0
ℹ duration_ms 106.59
```

| # | Test | Focus |
|---|------|-------|
| 1 | construction defaults | 14/60-day SLA baseline |
| 2 | receiveComplaint — id + hash | intake, PII hashing |
| 3 | receiveComplaint — unknown category | schema guard |
| 4 | classify — Hebrew critical keyword `שריפה` | RTL classification |
| 5 | classify — amount ≥ ₪20,000 | threshold escalation |
| 6 | classify — refund keyword major | keyword severity |
| 7 | classify — minor default | fallback bucket |
| 8 | assignInvestigator auto-route | privacy→dpo-team, delivery→logistics-team |
| 9 | assignInvestigator transition | received → under-investigation |
| 10 | statutoryDeadline | 14d ack + 60d resolution |
| 11 | recordResponse refund resolves | state transition |
| 12 | recordResponse reject stays | state guard |
| 13 | recordResponse invalid type | schema guard |
| 14 | refundEligibility defective | PLL always refundable |
| 15 | refundEligibility §14ג online in-window | 6/14 days elapsed |
| 16 | refundEligibility §14ג expired | 41/14 days elapsed |
| 17 | refundEligibility §14ג1 elderly | 69/120 days — extended window |
| 18 | refundEligibility in-store N/A | not a distance sale |
| 19 | escalateToCommissioner | caps fine at §22 ceiling ₪45k |
| 20 | templateResponse bilingual | HE + EN with statute citation |
| 21 | trackSLA within window | no breach |
| 22 | trackSLA after 20 days | ack breach detected |
| 23 | bulkClass aggregate | shape-stable 9-category output |
| 24 | consumerRights | bilingual §14ג citation present |
| 25 | event log hash chain | append-only integrity |
| 26 | listComplaints filter | by status + category |
| 27 | all 9 categories accepted | statutory completeness |

---

## 10. Append-only guarantees / ערובות append-only

- **Never-delete invariant:** no method removes any complaint, response,
  escalation, or event.
- **Hash-chained event log:** each event's `prevHash` equals the previous
  event's `hash`. `GENESIS_HASH = '0'×64` seeds the chain.
- **Frozen records:** events and responses are `Object.freeze`-d so
  downstream code cannot mutate history.
- **Snapshots over references:** `listComplaints()` and `getComplaint()`
  return shallow clones with cloned sub-arrays.
- **Status can only advance**, never regress.
- **Escalations are reference-numbered** (`ESC-<complaintId>-<seq>`)
  and appended in order.

---

## 11. Hebrew glossary / מילון עברית ↔ English

| עברית | English | Module symbol |
|---|---|---|
| תלונת צרכן | consumer complaint | `complaint` |
| פרסום מטעה | misleading advertisement | `misleading-ad` |
| מוצר פגום | defective product | `defective-product` |
| הפרת אחריות | warranty breach | `warranty` |
| סירוב להחזר | refund refusal | `refund-denied` |
| אי-התאמת מחיר | price discrepancy | `price-discrepancy` |
| פגם באיכות | quality defect | `quality` |
| בעיית אספקה | delivery problem | `delivery` |
| פגיעה בפרטיות | privacy breach | `privacy` |
| ליקוי נגישות | accessibility failure | `accessibility` |
| חומרה | severity | `SEVERITY` |
| קל / בינוני / חמור | minor / major / critical | `minor/major/critical` |
| זכות ביטול | cooling-off right | `refundEligibility()` |
| עסקת מכר מרחוק | distance sale | `purchaseChannel === 'online'` |
| חלון ביטול | cooling-off window | `windowDays` |
| זמן סביר | reasonable time | `statutoryDeadline()` |
| עיצום כספי | administrative fine | `escalateToCommissioner({fineIls})` |
| הסלמה | escalation | `escalateToCommissioner()` |
| יומן אירועים | event log | `events()` |
| חתימה שרשרתית | hash chain | `_append()` → `sha256Hex` |
| ת.ז. (תעודת זהות) | national ID | `customerIdHash` |
| שירות לקוחות | customer service | `templateResponse()` |
| הרשות להגנת הצרכן | Consumer Protection Authority | `escalation.commissioner` |
| רשויות אכיפה | enforcement authorities | — |
| תובענה ייצוגית | class action | §31 |
| דוח תקופתי | period report | `bulkClass()` |

---

## 12. Integration handoff / התממשקות

```js
const { ConsumerComplaints } = require('./src/compliance/consumer-complaints');
const cc = new ConsumerComplaints({ idSalt: process.env.Y142_SALT });

// Wire to web intake:
app.post('/complaints', (req, res) => {
  const complaint = cc.receiveComplaint(req.body);
  cc.assignInvestigator({ complaintId: complaint.id, investigatorId: 'auto' });
  res.json({ ok: true, complaint });
});

// Daily SLA sweep:
for (const c of cc.listComplaints({ status: 'under-investigation' })) {
  const sla = cc.trackSLA(c.id);
  if (sla.breach) alertOps(c.id, sla);
}

// Regulator escalation (§22):
cc.escalateToCommissioner(complaintId, { fineIls: 12000, notes: 'Repeat offender' });
```

---

## 13. Compliance sign-off / אישור ציות

- [x] Zero external dependencies (Node built-ins only)
- [x] Append-only event log with SHA-256 hash chain
- [x] Hebrew RTL + English LTR bilingual surfaces
- [x] All 9 statutory categories present and tested
- [x] §14ג 14-day cooling-off enforced
- [x] §14ג1 extended 4-month window for elderly/disabled
- [x] §17 + PLL 1980 "defective always refundable" rule
- [x] §22 ₪45,000 fine ceiling capped in escalation
- [x] PII (customerId) hashed with SHA-256 + salt
- [x] 27 tests passing (> 18 minimum target)
- [x] House rule: לא מוחקים רק משדרגים ומגדלים — upheld

**Status: READY FOR INTEGRATION** — מוכן לשילוב
