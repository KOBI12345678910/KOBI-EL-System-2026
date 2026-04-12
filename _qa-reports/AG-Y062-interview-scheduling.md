# AG-Y062 — Interview Scheduling Engine / מנוע תזמון ראיונות

**Agent**: Y-062
**Module**: `onyx-procurement/src/hr/interview-scheduling.js`
**Tests**:  `onyx-procurement/test/hr/interview-scheduling.test.js`
**Status**: GREEN — 27/27 tests passing
**Date**:   2026-04-11
**Owner**:  Swarm HR / Kobi EL

---

## 1. Purpose / מטרה

| EN | HE |
|---|---|
| Schedule interviews between candidates and interviewer panels with calendar conflict detection, Israeli holiday awareness, append-only history, and bilingual (he/en) communication. | תזמון ראיונות בין מועמדים לפאנל מראיינים, זיהוי התנגשויות יומן, מודעות לחגים ישראליים, היסטוריה רק-בהוספה, ותקשורת דו-לשונית (עברית/אנגלית). |

The module fits between the recruiting pipeline (candidate sourced & screened)
and the onboarding workflow (offer accepted → Day 1 starts). Once an interview
is `completed` or `no_show` it emits an event which the pipeline picks up to
advance the candidate stage.

המודול ממוקם בין מסלול הגיוס (איתור וסינון מועמד) למנוע הקליטה (חתימה →
יום ראשון). כל אירוע `הושלם` או `אי הופעה` נרשם ביומן האירועים שמסלול
הגיוס קורא ממנו כדי להעביר את המועמד לשלב הבא.

---

## 2. Immutable Rules / כללים בלתי משתנים

| # | Rule | כלל |
|---|---|---|
| 1 | לא מוחקים רק משדרגים ומגדלים | `cancel` flips status only; `reschedule` appends a history row; `noShow` is an append-only event log. |
| 2 | Zero external dependencies | Pure Node built-ins. Only `node:crypto` for stable IDs. ICS hand-rolled per RFC 5545. |
| 3 | Hebrew RTL + bilingual labels | All user-facing strings ship as `{ he, en }`. Hebrew lines prefixed with U+200F (RLM). |
| 4 | Israeli holiday awareness | `israeliHolidays2026()` ships 16 dates covering all 8 mandatory holiday categories. |
| 5 | In-memory storage | `Map` instances for interviews, availability, candidate logs, plus a global event log. |
| 6 | Append-only event log | Every state transition is captured in both per-record `history[]` and the global `eventLog[]`. |

---

## 3. Class API / ממשק המחלקה

### `class InterviewScheduler`

| Method | Purpose (EN) | מטרה (HE) |
|---|---|---|
| `defineSlotPolicy(policy)` | Set business hours, min duration, break, holidays, weekendOff | קביעת מדיניות חלונות זמן |
| `addInterviewerAvailability({interviewerId, slots})` | Additive — appends, never overwrites | הוספת זמינות למראיין (תוספת בלבד) |
| `proposeTimes({candId, reqId, interviewers, duration, candidatePreferredSlots?})` | Returns up to 3 best common slots | הצעת עד 3 חלונות זמן משותפים |
| `confirmInterview({candId, slot, interviewers, room, format, videoLink?})` | Lock the interview, validates format | אישור הראיון, ולידציה לפורמט |
| `sendInviteEmail({interviewId, template, lang})` | Bilingual invite + ICS attachment | שליחת הזמנה דו-לשונית עם קובץ ICS |
| `generateICS(interviewId)` | RFC 5545 hand-rolled iCalendar | יצירת קובץ ICS לפי RFC 5545 |
| `rescheduleInterview(id, newSlot, reason)` | Append-only — original slot kept in history | דחייה למועד חדש, השומרת את ההיסטוריה |
| `cancelInterview(id, reason)` | Status flip only, record preserved | ביטול — שינוי סטטוס בלבד |
| `sendReminder(id, hoursBefore)` | Bilingual reminder | תזכורת דו-לשונית |
| `noShowTracker(candId, interviewId)` | Append-only no-show events per candidate | יומן אי-הופעה לכל מועמד |
| `calendarConflicts(interviewerId, period)` | Detect double-bookings | זיהוי חפיפות יומן |
| `fairDistribution(ids, period)` | Round-robin load metric | מטריקת איזון עומסים |
| `israeliHolidays2026()` | List of 2026 holidays | רשימת חגי 2026 |

---

## 4. Slot Policy Configuration / תצורת מדיניות חלונות

```js
const scheduler = new InterviewScheduler();
scheduler.defineSlotPolicy({
  businessHours:  { start: '09:00', end: '18:00' },  // שעות עבודה
  minDurationMin: 30,                                // משך מינימלי בדקות
  breakMin:       15,                                // הפסקה בין ראיונות
  weekendOff:     ['Fri', 'Sat'],                    // סופ"ש ישראלי
  holidays:       ['2026-04-13'],                    // חגים מותאמים אישית
  timezone:       'Asia/Jerusalem',                  // אזור זמן
});
```

| Field | EN | HE | Default |
|---|---|---|---|
| `businessHours` | Daily start/end hours (HH:MM, UTC interpretation) | שעות עבודה יומיות | 09:00–18:00 |
| `minDurationMin` | Minimum interview length in minutes | משך מינימלי | 30 |
| `breakMin` | Mandatory gap between back-to-back interviews | הפסקת חובה | 15 |
| `weekendOff` | Day-of-week strings excluded from scheduling | ימים שאינם זמינים | `['Fri', 'Sat']` |
| `holidays` | Extra YYYY-MM-DD strings on top of national list | חגים מותאמים | `[]` |
| `timezone` | IANA TZ identifier (advisory only) | אזור זמן | `Asia/Jerusalem` |

Validation: `defineSlotPolicy({ minDurationMin: 1 })` throws — minimum is 5 minutes.

---

## 5. ICS Fields (RFC 5545) / שדות ICS

The hand-rolled `generateICS()` produces a single VEVENT inside a VCALENDAR
wrapper, with one VALARM (1-hour pre-event display reminder).

| Field | Format | Notes |
|---|---|---|
| `BEGIN:VCALENDAR` | wrapper open | RFC 5545 §3.4 |
| `VERSION:2.0` | required | iCalendar core version |
| `PRODID` | `-//Techno-Kol Uzi//Interview Scheduler Y-062//EN` | product identifier |
| `CALSCALE:GREGORIAN` | required for international dates | |
| `METHOD:REQUEST` | scheduling method | so MUAs render it as an invite |
| `BEGIN:VEVENT` | event open | |
| `UID` | `<interviewId>@techno-kol.co.il` | globally unique |
| `DTSTAMP` | `YYYYMMDDTHHmmssZ` | UTC creation time |
| `DTSTART` | `YYYYMMDDTHHmmssZ` | UTC start |
| `DTEND` | `YYYYMMDDTHHmmssZ` | UTC end |
| `SUMMARY` | `Interview / ראיון — candidate <id>` | bilingual title |
| `DESCRIPTION` | escaped multi-line | escaped per RFC 5545 §3.3.11 |
| `LOCATION` | room / video link / "Phone" | depends on format |
| `STATUS` | `CONFIRMED` / `CANCELLED` | mirrors interview status |
| `ORGANIZER` | `mailto:recruiting@techno-kol.co.il` | with `CN` |
| `ATTENDEE` (×N) | one per interviewer + candidate | with `CN`, `ROLE`, `PARTSTAT` |
| `BEGIN:VALARM` | reminder open | |
| `TRIGGER:-PT1H` | 1 hour before start | |
| `ACTION:DISPLAY` | popup-style | |
| `DESCRIPTION` | "Interview reminder / תזכורת ראיון" | bilingual |
| `END:VALARM` | reminder close | |
| `END:VEVENT` | event close | |
| `END:VCALENDAR` | wrapper close | |

**Line folding**: lines longer than 75 octets are folded with CRLF + leading
space, per RFC 5545 §3.1. Special characters (`,`, `;`, `\n`, `\\`) are escaped.

---

## 6. Israeli Holidays 2026 / חגי ישראל 2026

The module ships 16 pinned Gregorian dates covering all 8 mandatory categories:

| # | Date | Hebrew | English |
|---|------|--------|---------|
| 1 | 2026-04-01 | ערב פסח | Erev Pesach |
| 2 | 2026-04-02 | פסח א | Pesach Day 1 |
| 3 | 2026-04-08 | שביעי של פסח | Shvi'i shel Pesach |
| 4 | 2026-04-14 | יום הזיכרון לשואה | Yom HaShoah (Holocaust Day) |
| 5 | 2026-04-21 | יום הזיכרון לחללי צה"ל | Yom HaZikaron (Fallen Soldiers Day) |
| 6 | 2026-04-22 | יום העצמאות | Yom HaAtzmaut (Independence Day) |
| 7 | 2026-05-22 | ערב שבועות | Erev Shavuot |
| 8 | 2026-05-23 | שבועות | Shavuot |
| 9 | 2026-09-11 | ערב ראש השנה | Erev Rosh Hashana |
| 10 | 2026-09-12 | ראש השנה א | Rosh Hashana Day 1 |
| 11 | 2026-09-13 | ראש השנה ב | Rosh Hashana Day 2 |
| 12 | 2026-09-20 | ערב יום כיפור | Erev Yom Kippur |
| 13 | 2026-09-21 | יום כיפור | Yom Kippur |
| 14 | 2026-09-25 | ערב סוכות | Erev Sukkot |
| 15 | 2026-09-26 | סוכות א | Sukkot Day 1 |
| 16 | 2026-10-03 | שמיני עצרת/שמחת תורה | Shemini Atzeret / Simchat Torah |

**Coverage check** (test #22):
* Rosh Hashana ✓
* Yom Kippur ✓
* Sukkot ✓
* Pesach ✓
* Shavuot ✓
* Yom HaAtzmaut (Independence Day) ✓
* Yom HaShoah (Holocaust Day) ✓
* Yom HaZikaron (Fallen Soldiers Day) ✓

Custom org-specific holidays can be added via `policy.holidays = ['YYYY-MM-DD', ...]`
and are honored alongside the national list.

---

## 7. Hebrew Glossary / מילון עברי

| English | עברית | RTL |
|---|---|---|
| interview | ראיון | RLM |
| interviewer | מראיין | RLM |
| candidate | מועמד | RLM |
| schedule | תזמון | RLM |
| reschedule | דחייה למועד חדש | RLM |
| availability | זמינות | RLM |
| slot | חלון זמן | RLM |
| conflict | התנגשות | RLM |
| double-booking | חפיפת יומן | RLM |
| reminder | תזכורת | RLM |
| no-show | אי הופעה | RLM |
| cancellation | ביטול | RLM |
| invitation | הזמנה | RLM |
| business hours | שעות עבודה | RLM |
| weekend | סוף שבוע | RLM |
| holiday | חג | RLM |
| load balance | איזון עומסים | RLM |
| round-robin | תורנות מחזורית | RLM |
| fair distribution | חלוקה הוגנת | RLM |
| video meeting | פגישת וידאו | RLM |
| phone screen | ראיון טלפוני | RLM |
| onsite | באתר | RLM |
| panel | פאנל ראיונות | RLM |

All Hebrew labels are exported via `HEBREW_GLOSSARY` and the bilingual `LABELS`
constant for direct UI consumption.

---

## 8. Test Coverage / כיסוי בדיקות

`node --test test/hr/interview-scheduling.test.js`

```
ℹ tests 27
ℹ pass  27
ℹ fail  0
```

| # | Test | Domain |
|---|---|---|
| 1, 1b | `defineSlotPolicy` defaults & validation | policy |
| 2 | additive availability | availability |
| 3 | two-interviewer intersection | proposeTimes |
| 4 | at-most-3 cap | proposeTimes |
| 5 | Friday/Saturday exclusion | weekend |
| 6 | Pesach 2026-04-02 exclusion | holiday |
| 7 | custom holiday from policy | holiday |
| 8 | business-hours filtering | proposeTimes |
| 9 | confirm happy path | confirm |
| 10 | format/room/video validation | confirm |
| 11 | double-booking rejection at confirm | conflict |
| 12 | RFC 5545 well-formed ICS | ICS |
| 13, 13b | bilingual + he-only + en-only invite body | invite |
| 14 | ICS attachment present | invite |
| 15 | reschedule preserves history | reschedule |
| 16 | reschedule rejects conflict | reschedule |
| 17 | cancel preserves record | cancel |
| 18 | bilingual reminder | reminder |
| 19 | no-show append-only log | no-show |
| 20 | calendarConflicts overlap detection | conflict |
| 21 | fairDistribution metric | balance |
| 22 | 2026 holiday list completeness | holiday |
| 23 | glossary exported | i18n |
| 24 | full lifecycle event log | events |
| 25 | intersectMany utility | utility |

---

## 9. Edge Cases & Hardening / מקרי קצה

| Case | Handled? | How |
|---|---|---|
| Cancel a cancelled interview | ✓ | Idempotent — returns same record |
| Reschedule a cancelled interview | ✓ | Throws |
| `proposeTimes` with no interviewer availability | ✓ | Returns `[]` |
| Holiday spanning weekend | ✓ | Both filters apply independently |
| `videoLink` missing for video format | ✓ | Throws at confirm |
| `room` missing for onsite format | ✓ | Throws at confirm |
| Two interviewers with disjoint availability | ✓ | Returns `[]` |
| ICS lines >75 octets | ✓ | Folded per RFC 5545 §3.1 |
| Hebrew text in ICS DESCRIPTION | ✓ | UTF-8, escaped per §3.3.11 |
| Append-only event log integrity | ✓ | All transitions logged + asserted in test 24 |

---

## 10. Integration Points / נקודות שילוב

| Producer | Event | Consumer |
|---|---|---|
| recruiting-pipeline | candidate.stage = `interview` | Y-062 (this) — call `proposeTimes` |
| Y-062 | `interview.completed` | recruiting-pipeline → advance stage |
| Y-062 | `interview.no_show` | recruiting-pipeline → flag candidate |
| Y-062 | `interview.confirmed` | calendar mirror (downstream) |
| Y-062 | `invite.sent` | comms / audit log |

---

## 11. Files / קבצים

| Path | Purpose |
|---|---|
| `onyx-procurement/src/hr/interview-scheduling.js` | engine (≈ 600 LOC) |
| `onyx-procurement/test/hr/interview-scheduling.test.js` | 27 unit tests |
| `_qa-reports/AG-Y062-interview-scheduling.md` | this report |

---

## 12. Sign-off / אישור

* Built per Agent Y-062 spec ✓
* All 27 tests passing ✓
* Zero external dependencies (only `node:crypto`) ✓
* Hebrew RTL + bilingual UX ✓
* Israeli holiday awareness (16 dates / 8 categories) ✓
* Append-only — `לא מוחקים רק משדרגים ומגדלים` ✓
* RFC 5545 ICS hand-rolled ✓

**Status**: READY FOR INTEGRATION / מוכן לשילוב
