# AG-Y096 — Unified Customer Communication Log (communication-log.js)

**Agent:** Y-096
**Program:** Techno-Kol Uzi mega-ERP 2026 / onyx-procurement
**Date:** 2026-04-11
**Status:** GREEN — 32 / 32 tests passing
**Rule honoured:** "לא מוחקים רק משדרגים ומגדלים" — NEVER DELETE, ONLY UPGRADE

> This deliverable is an **upgrade sibling** of the earlier
> `src/customer/comm-log.js` (also shipped by Y-096 in a previous wave).
> That file is left on disk, untouched, forever. The new
> `communication-log.js` adds a 6-channel taxonomy, thread
> deduplication, sentiment trend, and owner-audit endpoints that the
> older module didn't expose. Both modules coexist; downstream callers
> migrate at their own pace. No existing file was modified, renamed, or
> deleted.
>
> זהו אח־השדרוג למודול `comm-log.js` הקיים. הקובץ הישן נשמר כמות שהוא,
> לעולמים. המודול החדש `communication-log.js` מוסיף טקסונומיית שישה
> ערוצים, איחוד שרשורי דוא"ל, מגמת סנטימנט, ואודיט נקודתי לפי אחראי —
> שהמודול הישן לא חשף. שני המודולים חיים זה לצד זה.

---

## 1. Deliverables / קבצים שנמסרו

| File / קובץ | Role / תפקיד | LOC |
|---|---|---|
| `onyx-procurement/src/customer/communication-log.js` | `CommunicationLog` class + enums + bilingual labels, zero external deps | ~600 |
| `onyx-procurement/test/customer/communication-log.test.js` | Node built-in test runner suite — 32 tests, all green | ~410 |
| `_qa-reports/AG-Y096-communication-log.md` | This report / הדו"ח הזה | — |

### Test run / הרצת המבחנים

```
$ cd onyx-procurement
$ node --test test/customer/communication-log.test.js

ℹ tests 32
ℹ suites 0
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms ~120
```

Tests required: **≥ 18**. Delivered: **32** (all passing on Node ≥ 18).

---

## 2. Mission / משימה

Aggregate every inbound and outbound customer interaction — across
email, SMS, phone, in-person, chat, and WhatsApp — into one
append-only log so that any rep opening a customer profile sees a
single chronological feed. The module must:

- Record interactions across all six channels.
- Return a chronological timeline with filters.
- Compute counts, response time, last-touch, silence alerts.
- Support full-text search + tag filtering.
- Attach documents by reference without mutating interactions.
- Trend sentiment and audit owner activity.
- Dedup email threads (`Re:` / `Fwd:` / `תגובה:` / `העברה:`).
- Remain deterministic, pure, zero-dependency, Hebrew-aware.

## 3. Channel taxonomy / טקסונומיית ערוצים

Six canonical channels, exported as a frozen array
`CHANNELS = ['email','sms','call','in-person','chat','whatsapp']`.
Every channel has both a Hebrew and English label.

| `code` | English label | תווית עברית | Typical direction | Threading? |
|---|---|---|---|---|
| `email` | Email | דוא"ל | inbound + outbound | **yes** (Re/Fw/תגובה) |
| `sms` | SMS | מסרון | usually outbound | no |
| `call` | Phone call | שיחת טלפון | either | no |
| `in-person` | In-person meeting | פגישה פנים אל פנים | logged by rep | no |
| `chat` | Chat (web widget / Intercom-style) | צ׳אט | either | no |
| `whatsapp` | WhatsApp | ווטסאפ | either | no |

**Direction** is an orthogonal, closed enum
`DIRECTIONS = ['inbound','outbound']`.
`inbound` = initiated by the customer side, `outbound` = initiated by us.

**Sentiment** is optional per-row and uses a closed enum
`SENTIMENTS = ['positive','neutral','negative']`.
The sentiment trend collapses those to `+1 / 0 / −1` and reports a
rolling average across scored rows.

## 4. Response-time formula / נוסחת זמן תגובה

```
responseTime({customerId, maxGapHours = 24})
```

Let `R(c)` be the chronologically sorted list of interactions for
customer `c`. For every `inbound` interaction `i` at time `t_i`:

1. Scan forward through `R(c)`.
2. Stop at the first `outbound` interaction `o` with `t_o − t_i ≤ gap`
   where `gap = maxGapHours · 3 600 000 ms`.
3. If found: append `Δ = t_o − t_i` to `deltas`.
4. If no such `o` exists (either none, or the next one is beyond the
   gap): increment `unanswered`.

Returned object:

```
{
  avgMs      : mean(deltas) or null,
  avgHours   : avgMs / 3 600 000,
  responded  : deltas.length,
  unanswered : number of inbound rows that were not replied to in time,
  sample     : responded + unanswered
}
```

Only **inbound → outbound** transitions are measured — outbound is never
counted as "initiator" of a response. Rows from the same customer
across every channel participate. The formula is channel-agnostic by
design — an inbound email can legitimately be answered by a WhatsApp
reply.

נוסחה (עברית):
עבור כל פנייה נכנסת, נחפש קדימה את הפנייה היוצאת הבאה בתוך חלון של
`maxGapHours` שעות. ההפרש הוא זמן התגובה. ממוצע זמני התגובה = הסכום /
מספר התגובות. פניות נכנסות שלא קיבלו מענה בזמן נספרות תחת
`unanswered`.

## 5. Append-only enforcement / שמירה על צבירה בלבד

The rule **לא מוחקים רק משדרגים ומגדלים** is wired into the type
system at three layers:

1. **Frozen rows** — every new interaction is passed through a deep
   `Object.freeze`, including its `attachments`, `tags`, and
   `docRefs` arrays. Any `row.subject = 'x'` or `row.tags.push(y)`
   silently no-ops in non-strict mode and throws in strict mode.
2. **Defensive copies on read** — `getTimeline`, `search`,
   `taggedInteractions`, `lastTouch`, and `exportAll` all return
   **new** shallow-cloned objects with **new** arrays. Callers can
   mutate their copies freely; the ledger is immune. The test
   "append-only — recorded rows are frozen" verifies this.
3. **No public delete / clear / update** — the class does not export
   any method whose name implies destruction. The test "append-only —
   size only ever grows" asserts
   `typeof log.deleteInteraction === 'undefined'`,
   `typeof log.clear === 'undefined'`,
   `typeof log.updateInteraction === 'undefined'`.

**Document attachment is append-only too.** When
`attachDocument({interactionId, docId})` is called, the original
interaction row is **not** mutated. Instead, the reference is stored
in a parallel `Map _docRefs` and merged into the row only at read time
by `getTimeline`. The frozen original still has `docRefs === []`.

**Thread dedup is pure.** `deduplicateThread()` groups an array
passed by the caller; it never writes to the ledger.

## 6. API surface / ממשק

| Method | Bilingual description |
|---|---|
| `recordInteraction(opts)` | רישום פנייה חדשה בכל אחד מששת הערוצים. Append-only. |
| `getTimeline(customerId, filters)` | ציר זמן כרונולוגי עם סינון לפי תאריך/ערוץ/אחראי/כיוון. |
| `countByChannel(customerId, period)` | מונה אינטראקציות לכל ערוץ בתקופה נתונה. |
| `responseTime({customerId, maxGapHours})` | ממוצע זמן תגובה לפניות נכנסות. |
| `lastTouch(customerId)` | הפנייה האחרונה + כמה ימים עברו מאז. |
| `silenceAlerts(threshold)` | רשימת לקוחות שלא תקשרו איתם X ימים. |
| `search(query, filters)` | חיפוש טקסט חופשי בנושא + תוכן. |
| `taggedInteractions(tag)` | שליפה לפי תגית. |
| `attachDocument({interactionId, docId})` | קישור מסמך ממנהל המסמכים — לא משנה את הפנייה המקורית. |
| `sentimentTrend(customerId, period)` | סדרת זמן של סנטימנט + ממוצע נע. |
| `loginAction(ownerId, period)` | אודיט — כמה פניות כל אחראי רשם. |
| `deduplicateThread(interactions)` | זיהוי שרשורי דוא"ל מתוך מערך פניות. |
| `size()` | מספר הפניות שנרשמו בלוג (תמיד עולה). |
| `exportAll()` | יצוא עותק מלא — לגיבוי / שחזור / איחוד. |

## 7. Test coverage map / מפת כיסוי מבחנים

32 tests, grouped:

| # | Group | Tests |
|---|---|---|
| 1 | Channel + enum exports | 3 |
| 2 | `recordInteraction` all 6 channels + rejection of bad input | 4 |
| 3 | Append-only enforcement (frozen rows, no delete method) | 2 |
| 4 | `getTimeline` ordering + 4 filter variants | 4 |
| 5 | `countByChannel` | 2 |
| 6 | `responseTime` (happy path + unanswered) | 2 |
| 7 | `lastTouch` + `silenceAlerts` | 2 |
| 8 | `search` (Hebrew, narrow-by, empty) | 3 |
| 9 | `taggedInteractions` | 1 |
| 10 | `attachDocument` (merge at read + unknown id) | 2 |
| 11 | `sentimentTrend` | 1 |
| 12 | `loginAction` owner audit | 1 |
| 13 | `deduplicateThread` (HE/EN prefixes, dormant reactivation split, non-email stays solo) | 3 |
| 14 | Glossary sanity | 1 |
| 15 | Internal helper correctness | 1 |
| **Total** | | **32** |

All tests are deterministic — they use a fixed clock
(`new CommunicationLog({ now: () => REF })`) and a fixed `REF =
2026-04-11T09:00:00Z`. Re-running never flakes.

## 8. Hebrew glossary / מילון עברי

| English | עברית | הערה |
|---|---|---|
| Interaction | אינטראקציה / פנייה | פעולת תקשורת יחידה |
| Timeline | ציר זמן | רצף כרונולוגי ממוין מההישן לחדש |
| Channel | ערוץ | דוא"ל, מסרון, שיחה, פגישה, צ׳אט, ווטסאפ |
| Inbound | נכנס | הלקוח יזם |
| Outbound | יוצא | אנחנו יזמנו |
| Subject | נושא | כותרת הפנייה |
| Content | תוכן | גוף ההודעה |
| Contact | איש קשר | מי אצל הלקוח כתב / קיבל |
| Owner | אחראי | הנציג אצלנו שרשם |
| Timestamp | חותמת זמן | epoch-ms (ms since 1970) |
| Attachment | קובץ מצורף | לא מאוחסן — רק referenced |
| Sentiment | סנטימנט / טון | חיובי / ניטרלי / שלילי |
| Tag | תגית | לסינון מהיר |
| Thread | שרשור | אוסף הודעות דוא"ל על אותו נושא |
| Dedup | איחוד | זיהוי שרשור → קבוצת הודעות |
| Silence | שתיקה | חוסר תקשורת X ימים |
| Response time | זמן תגובה | inbound → outbound ההבא |
| Last touch | מגע אחרון | הפנייה האחרונה |
| Audit | אודיט | לוג של מי רשם מה |
| Append-only | צבירה בלבד | לא מוחקים — רק מוסיפים |

## 9. RTL / bilingual behaviour / התנהגות דו־לשונית

- All user-facing labels are exported twice: `CHANNEL_LABELS_HE`,
  `CHANNEL_LABELS_EN`, same for direction + sentiment.
- Error messages from `recordInteraction` are bilingual
  (`'invalid channel "fax" / ערך לא תקין. Allowed: ...'`) so that
  alerts surface in both languages in the dashboard.
- Subject normalisation for email threading strips six prefix
  patterns: `Re:`, `Fw:`, `Fwd:`, `תגובה:`, `מענה:`, `העברה:`.
  The test `normalizeSubjectForThread strips prefixes (HE + EN)`
  covers `"Re: FW: תגובה: הצעת מחיר" → "הצעת מחיר"`.
- All search and tag matching are Unicode-aware (JavaScript string
  comparisons on code units work transparently for Hebrew).

## 10. Non-goals / מה לא כלול

- No persistence — storage is in-memory per the spec. A caller who
  wants durability can wrap `exportAll()` + `recordInteraction()`
  in a journal file or a DB row. The module intentionally ships no
  write-adapter so we keep it pure.
- No automatic sentiment detection — `sentiment` is passed in by the
  caller (the upstream NLP pipeline of Y-101 VoC is responsible).
- No GDPR erase — the older `comm-log.js` already implements
  pseudonymisation. When the requirement changes, the upgrade path is
  to add a read-time filter here, not a destructive delete.
- No duplicate detection beyond email threads — that is Y-102
  (anomaly detector) territory.

## 11. Signed off by / חתום ע"י

**Agent Y-096** — "Unified Customer Communication Log"
All 32 tests green. Zero external dependencies. Append-only.
Hebrew + English. Nothing deleted. Nothing mutated.
