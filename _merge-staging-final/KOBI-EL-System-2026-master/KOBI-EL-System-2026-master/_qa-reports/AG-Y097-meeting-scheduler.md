# AG-Y097 — Customer Meeting Scheduler / מתזמן פגישות לקוחות

**Agent:** Y-097 (Customer Meeting Scheduler)
**Swarm:** Customer-Ops
**System:** Techno-Kol Uzi mega-ERP
**Module path:** `onyx-procurement/src/customer/meeting-scheduler.js`
**Test path:** `onyx-procurement/test/customer/meeting-scheduler.test.js`
**Author:** Kobi
**Date:** 2026-04-11
**Status:** GREEN — 57 / 57 tests passing (34 legacy + 23 new Y-097)
**Rule / כלל:** לא מוחקים רק משדרגים ומגדלים (Never delete, only upgrade & grow)

---

## 1. Mission / משימה

### English
Build an external-sales **customer meeting scheduler** that is distinct from
Y-062 interview scheduling. The scheduler must:

1. Define meeting types with bilingual Hebrew/English labels, minute-precision
   durations, buffer windows and four location modes (`onsite`, `video`,
   `phone`, `customer-site`).
2. Propose candidate slots by intersecting every owner's availability inside
   a preferred date range, filtering out Israeli holidays, Shabbat and
   existing meetings.
3. Book, confirm, remind, reschedule, cancel and track meetings **without
   ever deleting a row**. Every mutation is append-only via `statusHistory[]`
   and the per-customer event log.
4. Emit RFC 5545 ICS calendar attachments built from pure Node built-ins
   (no external libraries), following the same hand-rolled pattern used by
   Y-062 interview scheduling.
5. Record outcomes (`productive` / `inconclusive` / `no-show` / `rescheduled`)
   and feed a customer meeting history view.
6. Offer a self-service `bookingLinkGenerator()` for prospects and a
   consolidated `teamAvailabilityView()` matrix for sales managers.

### עברית
לבנות **מתזמן פגישות חיצוניות ללקוחות** שנבדל מסוכן Y-062 לתזמון ראיונות
עובדים. מודול המתזמן חייב:

1. להגדיר סוגי פגישות עם תוויות דו-לשוניות (עברית/אנגלית), משך בדיוק של דקה,
   חלונות מרווח ו-4 מצבי מיקום: `onsite`, `video`, `phone`, `customer-site`.
2. להציע משבצות זמן על-ידי חיתוך (intersection) של זמינות כל בעלי העניין
   בטווח התאריכים המבוקש, תוך השמטת חגי ישראל, שבת ופגישות קיימות.
3. להזמין, לאשר, לתזכר, לשנות מועד, לבטל ולעקוב אחר פגישות **מבלי למחוק אף
   שורה**. כל שינוי מתועד ב-`statusHistory[]` ובלוג אירועי הלקוח.
4. להפיק קובצי יומן RFC 5545 ICS באמצעות מודולי Node מובנים בלבד (ללא
   תלויות חיצוניות), בדיוק לפי הדפוס שבו השתמש Y-062.
5. לתעד תוצאות (`productive` / `inconclusive` / `no-show` / `rescheduled`)
   ולהזין תצוגת היסטוריית פגישות ללקוח.
6. לספק יוצר קישורי הזמנה עצמאית `bookingLinkGenerator()` ללקוחות פוטנציאליים
   ומטריצת זמינות צוות מאוחדת `teamAvailabilityView()` למנהלי מכירות.

---

## 2. Upgrade-in-Place Summary / תקציר השדרוג

### What already existed
The `customer/meeting-scheduler.js` file already shipped a **Calendly-lite guest
booking** flow (keyed by `linkId` + `guestInfo`) — 34 existing tests, all
green. Per the immutable rule we did **not** rewrite or remove anything.

### What Y-097 added
Alongside the legacy API, we grew the class with an external-sales overload:

| New method | Purpose / מטרה |
|---|---|
| `proposeSlots({customerId, meetingTypeId, preferredTimeRange, owners})` | Intersect owner availability and return candidate windows |
| `bookMeeting({customerId, meetingTypeId, slot, owners, agenda, notes})` | Multi-owner customer meeting booking (legacy `linkId` form preserved) |
| `sendConfirmation(meetingId, lang)` | Bilingual envelope + ICS attachment |
| `generateICS(meetingId)` | RFC 5545 VCALENDAR/VEVENT/VALARM, zero-dep |
| `rescheduleMeeting(meetingId, newSlot, reason)` | Append-only history |
| `cancelMeeting(meetingId, reason)` | Status flip, record preserved |
| `sendReminder(meetingId, hoursBefore)` | Bilingual reminder envelope |
| `noShowTracker(customerId)` | Append-only no-show event log |
| `recordOutcome({meetingId, outcome, notes, nextSteps, opportunityUpdate})` | Whitelisted outcome recording |
| `meetingHistory(customerId)` | Full append-only history with outcomes |
| `bookingLinkGenerator(userId, duration)` | Self-service URL for prospects |
| `teamAvailabilityView(userIds, dateRange)` | Holiday-aware availability matrix |
| `israeliHolidays2026()` (instance) | Expose the default holiday list |
| `getCustomerMeeting(meetingId)` | Read helper for the new store |

Support helpers added at module scope (also exported for reuse):
`ISRAELI_HOLIDAYS_2026`, `isIsraeliHoliday`, `icsStamp`, `icsEscape`, `icsFold`,
`intersectRange`, `intersectMany`.

### What was preserved (never deleted)
* Every existing method, every existing field on meeting types.
* The `location` whitelist **grew** from `['in-person','phone','video']` to
  also include `'onsite'` and `'customer-site'` — older values still valid.
* A new `durationMin` alias was added without breaking the legacy `duration`.
* The 34 original tests continue to pass byte-for-byte.

---

## 3. Meeting Types Catalogue / קטלוג סוגי פגישות

The schema for a meeting type is now:

```js
{
  id:            'discovery',            // stable key
  name_he:       'פגישת היכרות',         // Hebrew label
  name_en:       'Discovery meeting',    // English label
  duration:      60,                     // legacy
  durationMin:   60,                     // new Y-097 alias
  buffer:        0,                      // minutes
  advanceNotice: 0,                      // minutes
  maxPerDay:     0,                      // 0 = unlimited
  hosts:         ['uzi', 'alice'],       // owner user ids
  location:      'video',                // 'onsite' | 'video' | 'phone' | 'customer-site' | 'in-person'
  videoProvider: 'zoom',                 // zoom | meet | teams (video only)
  bookingForm:   [ /* { key, label_he, label_en, required } */ ],
  bookingLink:   'https://scheduler.technokol.local/discovery',
  createdAt:     '2026-04-11T08:00:00Z',
  updatedAt:     '2026-04-11T08:00:00Z',
  _versions:     [ /* prior revisions */ ],
}
```

### Recommended catalogue for external sales

| id | name_he | name_en | duration | location |
|---|---|---|---|---|
| `discovery` | פגישת היכרות | Discovery meeting | 60 min | video |
| `demo` | שיחת הדגמה | Product demo | 30 min | video |
| `site-visit` | ביקור באתר לקוח | Customer site visit | 90 min | customer-site |
| `onsite-pilot` | פיילוט באתר הלקוח | Onsite pilot | 120 min | onsite |
| `closing` | פגישת חתימה | Closing meeting | 45 min | onsite |
| `phone-intro` | שיחת היכרות טלפונית | Phone intro | 15 min | phone |

---

## 4. RFC 5545 ICS Fields Emitted / שדות ICS לפי RFC 5545

Every call to `generateICS(meetingId)` produces a CRLF-delimited VCALENDAR
containing exactly the following lines (unless cancelled, in which case
`STATUS:CANCELLED` replaces `STATUS:CONFIRMED`):

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Techno-Kol Uzi//Customer Meeting Scheduler Y-097//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:<meetingId>@techno-kol.co.il
DTSTAMP:<YYYYMMDDTHHMMSSZ>
DTSTART:<YYYYMMDDTHHMMSSZ>
DTEND:<YYYYMMDDTHHMMSSZ>
SUMMARY:<he> / <en> — <customerId>
DESCRIPTION:Customer: …\nOwners: …\nLocation: …\nAgenda: …\nStatus: …
LOCATION:<location>
STATUS:CONFIRMED | CANCELLED
ORGANIZER;CN=Techno-Kol Sales:mailto:sales@techno-kol.co.il
ATTENDEE;CN=<owner>;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:<owner>@techno-kol.co.il
ATTENDEE;CN=Customer <customerId>;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:customer-<customerId>@customers.local
BEGIN:VALARM
TRIGGER:-PT1H
ACTION:DISPLAY
DESCRIPTION:Meeting reminder / תזכורת פגישה
END:VALARM
END:VEVENT
END:VCALENDAR
```

### Compliance notes
* Timestamps are UTC (`Z` suffix).
* `icsEscape()` quotes `\`, `;`, `,` and newlines per RFC 5545 §3.3.11.
* `icsFold()` wraps any line longer than 75 octets at 75-char boundaries and
  re-joins with `CRLF + SP` (RFC 5545 §3.1).
* The VCALENDAR ends with a trailing `\r\n` per the spec.
* `VALARM` fires a `DISPLAY` reminder 1 hour before the meeting.

---

## 5. Israeli Holidays (2026) / חגי ישראל

The class ships a canonical 2026 holiday list identical to Y-062's so the
whole swarm shares one source of truth. `proposeSlots` and
`teamAvailabilityView` exclude these dates automatically.

| Date | Hebrew | English |
|---|---|---|
| 2026-03-03 | פורים | Purim |
| 2026-04-01 | ערב פסח | Erev Pesach |
| 2026-04-02 | פסח א׳ | Pesach Day 1 |
| 2026-04-08 | שביעי של פסח | Shvi'i shel Pesach |
| 2026-04-14 | יום הזיכרון לשואה | Yom HaShoah |
| 2026-04-21 | יום הזיכרון לחללי צה״ל | Yom HaZikaron |
| 2026-04-22 | יום העצמאות | Yom HaAtzmaut |
| 2026-05-22 | ערב שבועות | Erev Shavuot |
| 2026-05-23 | שבועות | Shavuot |
| 2026-09-11 | ערב ראש השנה | Erev Rosh Hashana |
| 2026-09-12 | ראש השנה א׳ | Rosh Hashana Day 1 |
| 2026-09-13 | ראש השנה ב׳ | Rosh Hashana Day 2 |
| 2026-09-20 | ערב יום כיפור | Erev Yom Kippur |
| 2026-09-21 | יום כיפור | Yom Kippur |
| 2026-09-25 | ערב סוכות | Erev Sukkot |
| 2026-09-26 | סוכות א׳ | Sukkot Day 1 |
| 2026-10-03 | שמחת תורה | Simchat Torah |

Custom additions can be injected through the `customHolidays` constructor
option so local office closures or company-specific blackouts apply without
editing the module.

---

## 6. Business Hours / שעות פעילות

Default Israeli weekly schedule (auto-seeded for any owner referenced in
`proposeSlots` if `setAvailability` was never called for them):

| יום / Day | חלון / Window |
|---|---|
| ראשון / Sunday    | 09:00 – 18:00 |
| שני / Monday      | 09:00 – 18:00 |
| שלישי / Tuesday   | 09:00 – 18:00 |
| רביעי / Wednesday | 09:00 – 18:00 |
| חמישי / Thursday  | 09:00 – 18:00 |
| שישי / Friday     | 09:00 – 13:00 (קצר / shortened) |
| שבת / Saturday    | סגור / closed (Shabbat) |

Timezone defaults to `Asia/Jerusalem`. Callers can override with
`setAvailability({ userId, weeklySchedule, exceptions, timezone })`.

---

## 7. Outcome Vocabulary / מילון תוצאות

`recordOutcome({outcome})` accepts exactly these values — anything else is
rejected with `{ok:false, reason:'bad_outcome'}`:

| outcome | עברית | When to use |
|---|---|---|
| `productive` | פורייה | Meeting advanced the deal — book next step |
| `inconclusive` | לא חד משמעית | More discovery needed, no clear decision |
| `no-show` | לא הגיע | Customer did not attend; feeds `noShowTracker` |
| `rescheduled` | נדחה | Moved to a new slot after the meeting started |

Outcomes are **append-only** per meeting — you can record multiple
outcomes over the lifetime of a meeting, but you can never overwrite
an earlier one. The latest outcome is mirrored to `meeting.lastOutcome`
for convenience and logged under `statusHistory[]` as
`outcome:<value>`.

---

## 8. Hebrew Glossary / מילון עברי

| English | עברית | Context |
|---|---|---|
| Meeting Scheduler | מתזמן פגישות | Module title |
| Customer meeting | פגישת לקוח | Y-097 scope |
| Discovery meeting | פגישת היכרות | `discovery` type |
| Product demo | שיחת הדגמה | `demo` type |
| Customer site visit | ביקור באתר לקוח | `site-visit` type |
| Onsite pilot | פיילוט באתר הלקוח | `onsite-pilot` type |
| Closing meeting | פגישת חתימה | `closing` type |
| Phone intro | שיחת היכרות טלפונית | `phone-intro` type |
| Propose slots | הצע משבצות זמן | `proposeSlots()` |
| Book meeting | קבע פגישה | `bookMeeting()` |
| Confirmation | אישור פגישה | `sendConfirmation()` |
| Reschedule | שינוי מועד | `rescheduleMeeting()` |
| Cancel | ביטול | `cancelMeeting()` |
| Reminder | תזכורת | `sendReminder()` |
| No-show | לא הגיע | `noShowTracker()` |
| Attended | נוכח | outcome: attended |
| Productive | פורייה | outcome: productive |
| Inconclusive | לא חד משמעית | outcome: inconclusive |
| Rescheduled | נדחה | outcome: rescheduled |
| Agenda | סדר יום | `meeting.agenda` |
| Notes | הערות | `meeting.notes` |
| Owner / host | בעל עניין / מארח | `meeting.owners[]` |
| Customer | לקוח | `meeting.customerId` |
| Meeting type | סוג פגישה | `meetingTypeId` |
| Duration | משך | `durationMin` |
| Buffer | חיץ | `buffer` |
| Location | מיקום | `meeting.location` |
| Onsite | אונסייט / אצלנו | `location: 'onsite'` |
| Customer site | באתר הלקוח | `location: 'customer-site'` |
| Video | וידאו | `location: 'video'` |
| Phone | טלפון | `location: 'phone'` |
| Business hours | שעות פעילות | Sun-Thu 09-18, Fri 09-13 |
| Shabbat | שבת | Weekend closed |
| Israeli holiday | חג ישראלי | `ISRAELI_HOLIDAYS_2026` |
| Weekday | יום חול | Non-weekend day |
| Availability | זמינות | `setAvailability()` |
| Team availability view | תצוגת זמינות צוות | `teamAvailabilityView()` |
| Self-service booking link | קישור הזמנה עצמאית | `bookingLinkGenerator()` |
| History | היסטוריה | `meetingHistory()` |
| Append-only | הוספה-בלבד / אין מחיקה | Immutable rule |
| Outcome | תוצאה | `recordOutcome()` |
| Next step | צעד הבא | `nextSteps[]` |
| Opportunity update | עדכון הזדמנות | `opportunityUpdate` |
| Proposal | הצעת מחיר | Common next step |
| Intersection | חיתוך | Slot intersection |
| ICS | קובץ יומן | RFC 5545 attachment |
| UID | מזהה ייחודי | `UID:` field |
| Reminder (VALARM) | תזכורת (VALARM) | ICS alarm |

---

## 9. Test Coverage / כיסוי בדיקות

Test file: `onyx-procurement/test/customer/meeting-scheduler.test.js`

```
node --test onyx-procurement/test/customer/meeting-scheduler.test.js
```

Result: **57 / 57 passing** (34 legacy + 23 new Y-097).

### New Y-097 test list (23 tests — exceeds the required 18)

| # | Name | Covers |
|---|---|---|
| 1 | defineMeetingType accepts onsite / customer-site / video / phone | location whitelist grown |
| 2 | defineMeetingType stores Hebrew+English names and bookingLink | bilingual + booking URL |
| 3 | proposeSlots returns intersection of owner availability windows | `intersectMany` over owners |
| 4 | proposeSlots excludes Israeli holidays (Yom HaAtzmaut 2026-04-22) | holiday filter |
| 5 | proposeSlots returns empty on Saturday (Shabbat) | weekend closure |
| 6 | bookMeeting books a customer meeting with owners, agenda, notes | external-sales overload |
| 7 | bookMeeting rejects when any owner is already busy | multi-owner conflict |
| 8 | sendConfirmation produces bilingual envelope with ICS attachment | bilingual + ICS |
| 9 | sendConfirmation supports lang="he" primary envelope | lang selection |
| 10 | generateICS emits RFC-5545 fields (UID, DTSTART, DTEND, SUMMARY, VALARM) | RFC 5545 compliance |
| 11 | generateICS for cancelled meeting emits STATUS:CANCELLED | cancelled flag |
| 12 | rescheduleMeeting preserves full status history + old slot | append-only reschedule |
| 13 | cancelMeeting flips status but preserves record (never delete) | immutable rule |
| 14 | sendReminder emits bilingual reminder envelope with hours param | reminder flow |
| 15 | recordOutcome accepts productive + next steps + opportunity update | outcome recording |
| 16 | recordOutcome rejects outcomes not in the whitelist | outcome validation |
| 17 | noShowTracker returns append-only no-show log for a customer | tracker derivation |
| 18 | meetingHistory returns every meeting for a customer including cancelled | full history view |
| 19 | bookingLinkGenerator builds a self-service URL per user/duration | self-service URL |
| 20 | teamAvailabilityView returns matrix flagging Israeli holidays | team matrix |
| 21 | ISRAELI_HOLIDAYS_2026 + isIsraeliHoliday cover national dates | holiday list sanity |
| 22 | Helper exports (intersectRange/intersectMany/icsStamp) behave | utility round-trip |
| 23 | Audit trail includes customerMeeting.* events (append-only) | audit trail |

---

## 10. Zero-Dependency Proof / הוכחת Zero-Dep

The only `require()` at the top of `meeting-scheduler.js` is:

```js
const crypto = require('crypto');   // Node built-in only
```

No external packages. The entire module compiles to a single file and
loads via `node -e "require('./src/customer/meeting-scheduler.js')"` without
`node_modules/`.

---

## 11. Status / סטטוס

**GREEN — ready to ship.**

* לא מוחקים — legacy 34 tests untouched, all passing.
* משדרגים ומגדלים — 13 new methods + 7 new utilities + 23 new tests added.
* דו-לשוני — every label, template and subject exposes `he` + `en`.
* Zero-dep — only `node:crypto`.
* Israeli calendar — Sun-Thu 09-18, Fri 09-13, Shabbat off, 17 national
  holidays excluded.
* RFC 5545 — hand-rolled VCALENDAR with VALARM, line-folding and escaping.
