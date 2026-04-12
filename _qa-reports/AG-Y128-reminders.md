# AG-Y128 — Scheduled Reminders Engine / מנוע תזכורות מתוזמן

**Agent:** Y-128
**Module:** `onyx-procurement/src/comms/reminders.js`
**Class:** `ReminderScheduler` (co-located with the preserved `ReminderEngine`)
**Tests:** `onyx-procurement/test/comms/reminders.test.js` — **24 / 24 passing**
**Run command:** `node --test test/comms/reminders.test.js`
**Date:** 2026-04-11
**Rule enforced:** *לא מוחקים רק משדרגים ומגדלים* — nothing deleted, only upgraded and grown.
**Dependencies:** Zero external. Node built-ins only (`node:test`, `node:assert/strict`, `node:crypto`).

---

## 1. Scope / תחום

**EN:** A generic, cross-domain, time-based reminder engine. Used by invoicing, procurement, HR, construction, tax filings, contracts, bank reconciliation, expense approvals and any module that needs to notify a human or a downstream system at a future point in time. The class is dispatcher-injectable so it can route through the SMS gateway (Y-121), WhatsApp bridge (Y-122), email templates (Y-123) or any channel added later without touching the scheduler itself.

**HE:** מנוע תזכורות מתוזמנות גנרי לכלל המערכת: חשבוניות, רכש, משאבי אנוש, בנייה, דיווחי מס, חוזים, התאמות בנקאיות ואישורי הוצאות. נשלח דרך Dispatcher הניתן להזרקה, כך שאותו המנוע מזין את כל ערוצי התקשורת של המערכת (SMS — Y-121, WhatsApp — Y-122, אימייל — Y-123) בלי להתערב בקוד המתזמן עצמו.

---

## 2. Immutability Rule / כלל אי-המחיקה

**EN:** The pre-existing `ReminderEngine` class (1000+ lines) is preserved as-is. The Y-128 upgrade adds a new `ReminderScheduler` class **alongside** it in the same file, exporting both. `cancelReminder`, `snoozeReminder`, failed dispatches — none delete records. They flip `status` and append to the per-reminder `history[]` and the global `_logGlobal[]`. Cancelling an already-cancelled reminder is idempotent and does not duplicate history entries.

**HE:** מחלקת `ReminderEngine` המקורית נשמרה ללא שינוי. השדרוג של Y-128 מוסיף מחלקה חדשה `ReminderScheduler` באותו קובץ ומייצא את שתיהן יחד. כל פעולה שעלולה "למחוק" — ביטול, דחייה, כישלון שליחה — רק הופכת את הסטטוס ורושמת רשומה חדשה ביומן התזכורת וביומן הגלובלי. ביטול כפול הוא אידמפוטנטי ואינו מוסיף רשומה כפולה.

---

## 3. Public API / ממשק ציבורי

Every method matches the Y-128 specification exactly:

| Method | HE | Description |
|---|---|---|
| `scheduleReminder({id, subject, trigger, leadTime, recurrence, audience, channels, template, priority})` | תזמון תזכורת | Schedule a new reminder. `trigger.type` ∈ `one-time` / `date-based` / `relative-to-event`. |
| `listDueReminders(now)` | רשימת תזכורות לביצוע | All reminders whose `fireAt ≤ now` and whose status is `scheduled` or `snoozed`. |
| `processDue(now, dispatcher)` | עיבוד תזכורות | Dispatches every due reminder through an injected async function. Advances recurring reminders. |
| `snoozeReminder(reminderId, until)` | דחיית תזכורת | Delays a reminder; the original record is preserved. `until` accepts Date / ISO / epoch / offset string. |
| `cancelReminder(reminderId, reason)` | ביטול תזכורת | Status flip only. Idempotent. |
| `reminderHistory(reminderId)` | היסטוריית תזכורת | Full append-only log for one reminder. |
| `upcomingForEntity(entityId, days)` | תזכורות קרובות לישות | Entity-scoped upcoming list in a day window (default 7). |
| `israeliBusinessDayCheck(date)` | בדיקת יום עסקים ישראלי | Sunday–Thursday, skips Israeli holidays (re-uses Y-034 pattern). |
| `quietHoursSkip(date, {start, end})` | דילוג שעות שקט | Defers reminders landing inside `20:00 → 07:00` (or any window) to the next allowed time. |
| `cronLiteParser(expression)` | פרסר קרון-לייט | Parses `daily/weekly/monthly/annual` + `HH:MM`. |
| `bulkSchedule(reminders)` | תזמון מרוכז | Batch creation; per-item errors are collected, never thrown. |

---

## 4. Recurrence Types / סוגי חזרתיות

| Type | HE | Example expression | First fire after `from` |
|---|---|---|---|
| `daily` | יומי | `daily 09:30` | Next 09:30 UTC |
| `weekly` | שבועי | `weekly mon 08:00` | Next Monday 08:00 UTC |
| `monthly` | חודשי | `monthly 1 07:15` | Next "day-1 07:15" of the next month |
| `annual` | שנתי | `annual 04-15 10:00` | Next April 15 at 10:00 UTC |
| `custom` | קרון מותאם | `custom 0 9 * * 1` | Delegated to the existing 5-field cron parser in the same file |

DOW tokens accepted: `sun/mon/tue/wed/thu/fri/sat` **or** numeric `0..6`. Months are 1-indexed (1–12); days-of-month 1–31.

A recurring reminder is advanced inside `processDue`: after a successful dispatch, the scheduler asks `nextCronLiteFire(parsed, currentFireAt)` for the next occurrence, re-applies any user deferrals (business day + quiet hours), and flips the status back to `scheduled`. If a recurrence yields `null` (e.g. the `endDate` was passed) the reminder terminates in `dispatched`.

**HE:** בכל חזרה מוצלחת המנוע מחשב את ה-`fireAt` הבא על פי כלל החזרתיות, מחיל את הדחיות (יום עסקים, שעות שקט) ומחזיר את הסטטוס ל-`scheduled`. אם אין יותר התרחשויות — הסטטוס נשאר `dispatched` והרשומה נשמרת לארכיון היסטוריה.

---

## 5. Cron-Lite Syntax Cheat-Sheet / תחביר קרון-לייט

```
daily   <HH:MM>                 // daily 09:30     — every day at 09:30 UTC
weekly  <DOW> <HH:MM>            // weekly mon 08:00 — every Monday 08:00
monthly <day> <HH:MM>            // monthly 1 07:15  — 1st of each month
annual  <MM-DD> <HH:MM>          // annual 04-15 10:00 — April 15 each year
custom  <5-field cron>           // custom 0 9 * * 1 — delegated to parseCron()
```

Invalid inputs rejected with a descriptive `RangeError` / `TypeError`:

- `''` → `"empty expression"`
- `'nope 12:00'` → `"unknown kind"`
- `'daily 99:99'` → `"out-of-range HH:MM"`
- `'weekly xyz 08:00'` → `"unknown DOW"`
- `'monthly 40 07:15'` → `"day-of-month out of range"`

---

## 6. Israeli Calendar Handling / טיפול בלוח הישראלי

### Business Day Rule / חוקי יום עסקים

- **Weekend:** Friday (ערב שבת) + Saturday (שבת) are **not** business days — they are skipped.
- **Work week:** Sunday, Monday, Tuesday, Wednesday, Thursday are business days.
- **Holidays:** The full static table `ISRAELI_HOLIDAYS` (2025-2027) is respected. Covers Passover, Memorial Day, Independence Day, Shavuot, Rosh Hashanah, Yom Kippur and Sukkot. Any date falling inside an inclusive `{start, end}` range is treated as a holiday.
- **Pattern source:** Re-uses the Y-034 constant table already in the module (`ISRAELI_HOLIDAYS` + `isIsraeliHoliday(epochMs)` + `nextNonHoliday(epochMs)`).

`israeliBusinessDayCheck(date)` returns a bilingual object:

```jsonc
{
  "epochMs": 1776243600000,
  "iso": "2026-04-11T11:00:00.000Z",
  "dow": 6,
  "dow_he": "שבת",
  "dow_en": "Saturday",
  "isWeekend": true,
  "isHoliday": false,
  "isBusinessDay": false,
  "nextBusinessEpoch": 1776330000000,
  "nextBusinessISO": "2026-04-12T11:00:00.000Z"
}
```

### Integration path / שילוב במתזמן

When a reminder is scheduled with `respectIsraeliBusinessDays: true` (per-reminder) **or** the scheduler was constructed with that global flag, `_applyDeferrals` runs the check; if the target is not a business day, the `fireAt` is pushed to the next business day (preserving the time-of-day) and a `{reason:'israeli-business-day'}` entry is pushed to the reminder's `deferrals[]` array **and** to the history log — never overwritten.

**HE:** כאשר מבקשים מהמתזמן לכבד ימי עסקים, המועד מועבר ליום העסקים הבא תוך שמירה על השעה. הדחייה נרשמת בשדה `deferrals[]` של הרשומה וביומן ההיסטוריה.

---

## 7. Quiet Hours / שעות שקט

- Default window: `{start:'20:00', end:'07:00'}` — wraps midnight, i.e. from 20:00 one day to 07:00 the next.
- `quietHoursSkip(date, hours)` returns `{inQuiet, epochMs, deferredTo, deferredISO, reason_he, reason_en}`.
- A reminder originally set for `22:30` UTC is pushed to `07:00` UTC of the next day and the deferral is annotated in the reminder's `deferrals[]` array.
- The scheduler accepts a constructor default (`new ReminderScheduler({quietHours:{start,end}})`) **and** per-reminder overrides (`spec.quietHours`).
- Outside the window, the helper is a pure no-op and returns `deferredTo == epochMs`.

**HE:** כל תזכורת שנופלת בתוך חלון השקט נדחית אוטומטית אל תחילת שעות הפעילות, והדבר נרשם ביומן ההיסטוריה.

---

## 8. Dispatcher Injection / הזרקת Dispatcher

`processDue(now, dispatcher)` calls:

```js
async dispatcher({id, subject, template, audience, channels, priority, fireAt, label_he, label_en, dispatchCount})
```

and expects `{ok, error?, result?}` in return. A throwing dispatcher is caught and treated as `ok:false`. Channels list is passed through unchanged so Y-121 / Y-122 / Y-123 can pick their own primary/secondary/fallback ordering.

On `ok === false` the reminder's status becomes `failed`, `lastError` is set, and a `dispatch-failed` history entry is appended — the record is NOT deleted. On `ok === true` the status becomes `dispatched` (or advanced forward if recurring).

---

## 9. Storage Model / מודל אחסון

All storage is in-memory and uses `Map`:

| Field | Purpose |
|---|---|
| `ReminderScheduler._store: Map<id, reminder>` | primary reminder index |
| `ReminderScheduler._logGlobal: Array<{id, at, action, detail}>` | append-only global event log |
| `reminder.history: Array<{at, action, detail}>` | append-only per-reminder log |
| `reminder.deferrals: Array<{reason, reason_he, reason_en, from, to}>` | why the `fireAt` was moved |

History entries include: `scheduled`, `dispatched`, `dispatch-failed`, `snoozed`, `cancelled`, `recurring-next`.

---

## 10. Test Matrix / מטריצת בדיקות

**Result:** `24 tests — 24 passing — 0 failing`

| # | Test | Covers |
|---:|---|---|
| 01 | module exports the expected symbols | Surface check |
| 02 | cron-lite parser: daily HH:MM | Daily recurrence |
| 03 | cron-lite parser: weekly mon 08:00 | Weekly (named DOW) |
| 04 | cron-lite parser: monthly 1 07:15 | Monthly |
| 05 | cron-lite parser: annual 04-15 10:00 | Annual |
| 06 | cron-lite parser rejects garbage | Error branches |
| 07 | scheduleReminder creates a one-time reminder | Happy path |
| 08 | scheduleReminder respects leadTime | Pre-fire offset |
| 09 | recurrence string stored as parsed object | Recurrence plumbing |
| 10 | scheduleReminder validates required fields | Input guards |
| 11 | listDueReminders filters by fireAt ≤ now | Due detection |
| 12 | processDue calls dispatcher for each due reminder | Dispatcher injection |
| 13 | processDue advances recurring reminders | Recurrence advance |
| 14 | processDue marks failed dispatch without deleting | Immutability on failure |
| 15 | snoozeReminder preserves record and appends history | Snooze |
| 16 | cancelReminder flips status without deleting | Cancel |
| 17 | cancelReminder is idempotent | Idempotency |
| 18 | reminderHistory is append-only | Append-only log |
| 19 | upcomingForEntity filters by entityId and window | Entity scoping |
| 20 | israeliBusinessDayCheck flags weekends & holidays | IL calendar |
| 21 | quietHoursSkip defers reminders scheduled during quiet hours | Quiet hours defer |
| 22 | quietHoursSkip is a no-op outside the quiet window | Quiet hours no-op |
| 23 | bulkSchedule creates all and collects failures | Batch + error collection |
| 24 | relative-to-event trigger resolves offset from anchor | `relative-to-event` type |

Run: `cd onyx-procurement && node --test test/comms/reminders.test.js`

---

## 11. Hebrew Glossary / מילון דו-לשוני

| English | עברית |
|---|---|
| Schedule reminder | תזמון תזכורת |
| List due reminders | רשימת תזכורות לביצוע |
| Process due reminders | עיבוד תזכורות שהגיע זמנן |
| Snooze reminder | דחיית תזכורת |
| Cancel reminder | ביטול תזכורת |
| Reminder history | היסטוריית תזכורת |
| Upcoming for entity | תזכורות קרובות לישות |
| Israeli business-day check | בדיקת יום עסקים ישראלי |
| Quiet-hours defer | דילוג שעות שקט |
| Cron-lite parser | פרסר קרון-לייט |
| Bulk schedule | תזמון מרוכז |
| Daily / Weekly / Monthly / Annual | יומי / שבועי / חודשי / שנתי |
| Business day | יום עסקים |
| Quiet hours | שעות שקט |
| Dispatcher | משגר |
| Lead time | זמן התראה מקדים |
| Recurrence | חזרתיות |
| Audience | קהל יעד |
| Channel fallback | נפילה על ערוץ חלופי |
| Append-only log | יומן בלתי-מחיק |
| Status flip | החלפת סטטוס |
| Holiday skip | דילוג חג |

The same glossary is exported from the source file as `REMINDER_GLOSSARY` so callers can reuse it for tooltips, audit exports and UI labels without duplicating strings.

---

## 12. Integration Points / נקודות חיבור

| Upstream caller | Trigger | Channels |
|---|---|---|
| Invoicing | invoice-due-date | email → WhatsApp |
| Procurement | PO receive-by-date | email → SMS |
| Tax / compliance | VAT filing, annual report | email (high priority) |
| HR / payroll | payslip delivery, work-visa renewals | email → WhatsApp |
| Construction PM | permit expiry, inspection windows | SMS → email |
| Contracts | renewal T-minus-30, signature deadline | email → SMS |
| Bank reconciliation | month-end close reminders | email |
| CRM follow-ups | quote follow-up cadence | WhatsApp → email |
| Maintenance | recurring asset checks | email (weekly cron-lite) |

All of them plug into the **same** `ReminderScheduler` instance via a thin wrapper that converts the domain entity → `scheduleReminder()` call.

---

## 13. Known Limitations / מגבלות ידועות

1. **Static holiday table** — `ISRAELI_HOLIDAYS` ships dates for 2025–2027 only. Extending past 2027 requires an upgrade to the table (per the no-delete rule, append only).
2. **UTC minute grid** — cron-lite operates on UTC minutes. A timezone-aware upgrade (`options.timezone`) is planned for the Y-128.1 revision.
3. **In-memory only** — no persistence layer. Callers wanting durability should serialize `listAll()` + `globalLog()` to their own store and rehydrate by replaying `scheduleReminder()` + `snoozeReminder()` + `cancelReminder()`.
4. **Single-process** — the scheduler is not cluster-aware. A distributed version would front this class with a leader-election wrapper (planned as Y-128.2).

---

## 14. Sign-off / אישור

- Zero external dependencies: **YES** — only `node:crypto` + `node:test` + `node:assert/strict`.
- Bilingual labels (HE+EN) on every public payload: **YES**.
- Rule "לא מוחקים רק משדרגים ומגדלים" respected end-to-end: **YES** — cancel/snooze/failure all flip status and append history; the original `ReminderEngine` class was preserved verbatim alongside the new `ReminderScheduler`.
- At least 18 tests: **YES** — 24 tests shipped, 24 passing.
- Reuses Y-034 Israeli-calendar pattern: **YES** — `ISRAELI_HOLIDAYS` + `isIsraeliHoliday` + `nextNonHoliday`.
- Dispatcher is injectable (Y-121 / Y-122 / Y-123 agnostic): **YES**.

**Agent Y-128 — complete. / הסוכן Y-128 — הושלם.**
