# AG-Y130 — Life Events Reminder System (Birthdays, Anniversaries & Milestones)

**Agent:** Y-130
**Module:** `onyx-procurement/src/comms/life-events.js`
**Tests:** `onyx-procurement/test/comms/life-events.test.js`
**Status:** DELIVERED — 39/39 tests passing
**Rule:** לא מוחקים רק משדרגים ומגדלים (never delete, only upgrade and grow)
**Date:** 2026-04-11
**Dependencies:** zero (pure JavaScript, Node built-ins only)

---

## 1. Scope

A zero-dependency life-event reminder engine for the Techno-Kol Uzi
mega-ERP. Tracks birthdays, work anniversaries, weddings, newborns,
retirements, promotions, achievements, and bereavements with
bilingual (Hebrew / English) output on every label, card, greeting,
notification, and calendar entry. Every record is append-only — old
events never disappear, they transition through the event status
lifecycle and the history is always retrievable.

The module ships with a minimal but correct Hebrew calendar
implementation (Hillel II) so that users who celebrate birthdays
on the לוח עברי (Hebrew calendar) get the right Gregorian reminder
date every year — even across leap-year Adar shifts.

### Public API

| Method | Purpose |
|---|---|
| `registerPerson(p)` | Upsert employee metadata (name HE/EN, dept, manager, hireDate, DOB) |
| `recordEvent({personId,type,date,lunar,notes,supersedesEventId})` | Append a life event (never deletes) |
| `upcomingEvents({days,audience,types,includeOptedOut,includeSensitive,now})` | Events whose next occurrence falls in the window |
| `notifyManagers({personId,event,managerId})` | Append bilingual manager reminder |
| `autoCardGeneration({eventId})` | Bilingual card template (returns null for bereavement) |
| `customizableGreeting({eventId,sender,personalNote})` | Personalised card built on top of auto template |
| `giftBudget({personId,eventType,department,refDate,allocate,spend,note})` | Department budget + milestone multipliers |
| `preferenceRespect({userId})` | Return celebration preference (default opt-in) |
| `setPreference(userId, pref)` | Upsert preference (keeps history) |
| `excludeSensitive({eventType})` | Filter + manual-action guidance for bereavement |
| `companyMilestones({now, lookaheadDays})` | Upcoming 1/3/5/10/15/20/25/30/35/40-year anniversaries |
| `newbornGift({employeeId,babyBornDate,notes})` | Israeli custom: auto-create CHILD_BIRTH event + card + budget |
| `weddingCustom({employeeId,weddingDate,notes})` | Israeli custom: auto-create MARRIAGE event + card + budget |
| `annualSummary(period)` | Roll-up of events in a calendar year or date window |
| `calendarIntegration({employeeId,now,lookaheadDays})` | Emit ICS-shaped calendar records |
| `getEvent(id)` / `listEvents(filter)` / `markCelebrated(id, note)` | Read / status transitions |

---

## 2. Event Types

Eight tracked types. Each has bilingual labels and a bilingual card
template (except bereavement, which is intentionally card-less).

| Key | Hebrew | English | Recurring? | Default budget (ILS) | Card? | Sensitive? |
|---|---|---|---|---|---|---|
| `birthday` | יום הולדת | Birthday | yes | 150 | yes | no |
| `work-anniversary` | יום שנה לעבודה | Work Anniversary | yes | 250 (× milestone) | yes | no |
| `marriage` | חתונה | Wedding | no | 500 | yes | no |
| `child-birth` | לידת ילד | Newborn | no | 400 | yes | no |
| `retirement` | פרישה | Retirement | no | 1500 | yes | no |
| `promotion` | קידום | Promotion | no | 200 | yes | no |
| `achievement` | הישג | Achievement | no | 200 | yes | no |
| `bereavement` | אבל | Bereavement | no | 0 (personal) | NO | YES |

### Event status lifecycle

`scheduled → acknowledged → celebrated`
plus: `sensitive_hold` (bereavement), `opted_out` (preference),
`superseded` (replaced by a newer record — old record preserved).

---

## 3. Israeli Workplace Culture Notes

This module is built specifically for the Israeli workplace. The
customs below drive concrete defaults and behaviors in the code.

### יום הולדת — Birthdays (strong)

* Birthdays are one of the most visible workplace celebrations in
  Israel. Team kitchen cake, small group gathering, and a WhatsApp
  group "מזל טוב!" burst are extremely common — often organised by
  the direct manager or a nominated "cheer captain".
* The default department budget of **150 ₪** matches a typical
  cake + small gift from a kupa (team fund) or petty-cash reimbursement.
* A subset of traditional / religious employees prefer the Hebrew
  calendar (לוח עברי) for their birthday. The module supports this
  with `lunar: true` on `recordEvent`, and reconverts each year.

### שנות ותק — Work anniversaries (mild, milestone-driven)

* Year-1 through year-4 anniversaries are usually low-key — a "well
  done" Slack/WhatsApp message from the manager, maybe a team
  shout-out.
* **Milestone years — 5, 10, 15, 20, 25, 30, 35, 40** — are treated
  very differently. These earn a formal gift (מתנת ותק), a
  certificate, and sometimes a bonus or extra vacation day. The
  module multiplies the base budget:

| Years | Multiplier | Base × 250 = suggested ILS |
|---|---|---|
| 1 | 1.0× | 250 |
| 3 | 1.2× | 300 |
| 5 | 2.0× | 500 |
| 10 | 3.0× | 750 |
| 15 | 3.5× | 875 |
| 20 | 4.5× | 1,125 |
| 25 | 6.0× | 1,500 |
| 30 | 7.0× | 1,750 |
| 35 | 8.0× | 2,000 |
| 40 | 10.0× | 2,500 |

### חתונה — Wedding (strong)

* מעטפה (cash/check in an envelope) or a registry gift is the
  norm. Many Israeli companies send at least a congratulatory card
  signed by the team and a gift worth 300–800 ₪.
* `weddingCustom()` records the event, produces a bilingual card,
  and pulls the default 500 ₪ budget.

### לידת ילד — Newborn (strong)

* It is standard for employers to send a baby gift (מתנת לידה) and
  a card to the maternity ward or the employee's home. A few
  companies also give a one-time bonus.
* `newbornGift()` produces the event record + card + 400 ₪ default
  gift allocation.

### פרישה — Retirement (formal)

* Retirements are marked with a send-off — often the biggest
  single life-event celebration an employee receives. Budget
  default 1,500 ₪ reflects a meal/gift combo and certificate.

### אבל / ניחום אבלים — Bereavement (HIGHLY sensitive)

* **Absolute rule:** no automated card, no automated email blast.
* In Israeli culture, condolences (ניחום אבלים) are personal. The
  direct manager and HR make contact by phone, visit the shiva
  house if appropriate, and coordinate any company-wide mention
  discreetly. Sending an auto-generated "so sorry for your loss"
  card is considered cold and inappropriate.
* Code behavior:
  * `recordEvent({type:'bereavement',...})` → status becomes
    `sensitive_hold` immediately.
  * `autoCardGeneration` → returns `{automated:false, sensitive:true, card:null}`
    with a bilingual message: "אירוע רגיש — לא נוצר כרטיס אוטומטי. נדרשת פנייה אישית."
  * `notifyManagers` → produces a notification whose body reads
    "אנא פנה אישית ולא דרך כרטיס אוטומטי" / "Please reach out
    personally — no automated card will be sent."
  * `upcomingEvents` → excludes bereavement from the default
    public roll-up (must explicitly pass `includeSensitive:true`).
  * `calendarIntegration` → NEVER publishes bereavement to the
    team calendar.
  * `excludeSensitive` → returns the three recommended manual
    actions: personal phone call, shiva visit coordination,
    discreet team briefing.

### Opt-out — preferenceRespect

* A non-trivial slice of employees prefer privacy (introverts,
  new employees still settling in, employees going through
  personal difficulty). The system defaults to opt-in but
  `setPreference(userId, {publicCelebration:false})` flips that.
* `upcomingEvents` and `calendarIntegration` exclude opted-out
  users by default. The old preference value is retained in
  `history[]` when replaced — nothing is deleted.

---

## 4. Hebrew Calendar (לוח עברי) Support

The module includes a minimal Hillel II calendar implementation
so that lunar birthdays are honored. Why this matters: a user
born on 15 Nisan will celebrate on a different Gregorian date
every year (the Hebrew year is 12 or 13 lunar months, shifting
against the solar calendar by ±11 days).

### Public facade `HebrewCalendar`

```js
HebrewCalendar.fromGregorian(date)        // {year, month, day}
HebrewCalendar.toGregorian(year, month, day) // → Date (UTC midnight)
HebrewCalendar.isLeapYear(year)           // 7-in-19 Metonic
HebrewCalendar.recurringGregorian(gregBirth, refDate)
```

### Verified anchors (known cross-checks against Hebcal):

| Hebrew | Gregorian |
|---|---|
| 1 Tishrei 5785 (ר״ה) | 2024-10-03 |
| 1 Tishrei 5786 (ר״ה) | 2025-09-23 |
| 15 Nisan 5786 (פסח) | 2026-04-02 |
| 24 Nisan 5786 | 2026-04-11 (today) |

### Hebrew month table

| # | HE | EN | Length |
|---|---|---|---|
| 7 | תשרי | Tishrei | 30 |
| 8 | חשוון | Cheshvan | 29 / 30 |
| 9 | כסלו | Kislev | 29 / 30 |
| 10 | טבת | Tevet | 29 |
| 11 | שבט | Shvat | 30 |
| 12 | אדר / אדר א׳ | Adar / Adar I | 29 (30 leap) |
| 13 | אדר ב׳ | Adar II | 29 (leap only) |
| 1 | ניסן | Nisan | 30 |
| 2 | אייר | Iyar | 29 |
| 3 | סיוון | Sivan | 30 |
| 4 | תמוז | Tammuz | 29 |
| 5 | אב | Av | 30 |
| 6 | אלול | Elul | 29 |

### Leap-year handling

In non-leap Hebrew years there is a single Adar. In leap years
Adar splits into Adar I (30 days) and Adar II (29 days). A birthday
originally on 15 Adar II (in a leap year) falls back to 15 Adar
when the reference year is non-leap. The module handles this in
`HebrewCalendar.recurringGregorian`.

---

## 5. Never-Delete Rule (לא מוחקים רק משדרגים ומגדלים)

The module respects the ERP's governing rule at every layer:

1. **Events** — `recordEvent` only appends. To replace a record,
   pass `supersedesEventId`; the old record transitions to
   `superseded` and keeps its full `statusHistory[]`. Verified
   by test "never delete: listEvents keeps everything after
   supersede".
2. **Status transitions** — every change appends to
   `statusHistory[{status, note, at}]` — no in-place overwrites.
3. **Preferences** — `setPreference` pushes the previous snapshot
   onto `history[{snapshot, replacedAt}]` before writing the new
   value. Verified by test "preference history is preserved on change".
4. **Budget spend** — each `spend` call appends to `spendHistory[]`
   with timestamp and note; no individual line items are ever
   mutated or removed. Verified by test "allocate and spend
   tracking + history never deletes".
5. **Notifications** — `appendNotification` only pushes; the store
   exposes `listNotifications` which returns a copy.
6. **Calendar events** — `appendCalendarEvent` only pushes.

---

## 6. Hebrew Glossary (מונחים)

| עברית | תעתיק / תרגום | שימוש במודול |
|---|---|---|
| יום הולדת | Yom Huledet — Birthday | `EVENT_TYPES.BIRTHDAY` |
| שנות ותק | Shnot Vetek — Years of seniority | milestone anniversaries |
| מתנת ותק | Matnat Vetek — Seniority gift | 5/10/15/20-year bonus |
| מתנת לידה | Matnat Leida — Baby gift | `newbornGift()` |
| מתנת חתונה | Matnat Hatuna — Wedding gift | `weddingCustom()` |
| מעטפה | Ma'atafa — Envelope (cash gift) | traditional wedding/bar mitzva present |
| מזל טוב | Mazal Tov — Congratulations | greeting-card bodies |
| ניחום אבלים | Nihum Aveilim — Condolences | sensitive-type handling |
| שבעה / שִבְעָה | Shiva — 7 days of mourning | `excludeSensitive.suggestedActions` |
| קידום | Kidum — Promotion | `EVENT_TYPES.PROMOTION` |
| פרישה | Prisha — Retirement | `EVENT_TYPES.RETIREMENT` |
| הישג | Hesseg — Achievement | `EVENT_TYPES.ACHIEVEMENT` |
| לוח עברי | Lu'ach Ivri — Hebrew calendar | `lunar: true` flag |
| ראש השנה | Rosh Hashana — New Year | 1 Tishrei |
| פסח | Pesach — Passover | 15 Nisan (anchor used in tests) |
| קופה / קופת צוות | Kupa / Kupat Tzevet — Team kitty | source of birthday-cake budget |
| תעודת הערכה | Te'udat Ha'arakha — Certificate of appreciation | milestone deliverable |
| נחת | Nachat — Pride & joy (from family) | used in newborn card EN text |

---

## 7. Test Coverage Summary

**39 tests — all passing.** Run with:

```
cd onyx-procurement
node --test test/comms/life-events.test.js
```

### Coverage breakdown

1. **Hebrew calendar (3 tests)** — known anchors, random round-trips,
   Metonic leap-year detection.
2. **recordEvent (4 tests)** — append with status, sensitive auto-hold,
   invalid-type rejection, supersede preserves old record.
3. **upcomingEvents (7 tests)** — N-day window sorting, audience filter,
   type filter, default bereavement exclusion, preference respect,
   lunar birthday (two tests — before and after Nisan), lunar vs
   gregorian divergence.
4. **notifyManagers (2 tests)** — bilingual reminder + status
   transition; bereavement stays on hold with personal-outreach text.
5. **autoCardGeneration (2 tests)** — HE/EN card; bereavement returns
   null + sensitive notice.
6. **customizableGreeting (1 test)** — personal note prepended,
   sender signature.
7. **giftBudget (4 tests)** — 5-year milestone 2× multiplier, 10-year
   3×, non-milestone base, allocate/spend history append-only.
8. **preferenceRespect (3 tests)** — default opt-in, explicit read,
   history preserved on change.
9. **excludeSensitive (1 test)** — guidance shape.
10. **companyMilestones (2 tests)** — filter by milestone years,
    20-year 4.5× multiplier.
11. **newbornGift (1 test)** — full flow: event + card + budget.
12. **weddingCustom (1 test)** — full flow.
13. **annualSummary (2 tests)** — calendar year roll-up, from/to window.
14. **calendarIntegration (2 tests)** — ICS shape + sort order; exclude
    bereavement and opted-out.
15. **Never delete (1 test)** — supersede + celebrated both stored.
16. **Sanity (2 tests)** — LABELS bilingual coverage, MILESTONES list.

---

## 8. Integration Points (suggested)

* **HR onboarding (Y-063)** — during `recordEvent` for hire, call
  `registerPerson()` with `hireDate` so work anniversaries are
  auto-derived.
* **Notifications service (Agent-76)** — `notifyManagers` produces
  records compatible with `notification-service.send()` — wire them
  through the notification queue for email/WhatsApp delivery.
* **Payroll (Y-072)** — milestone gifts / bonuses above tax
  thresholds need to flow to payroll; `giftBudget` history can be
  the source of truth.
* **HR handbook (Y-074)** — link preference settings
  (`setPreference`) from the employee self-service portal.

---

## 9. Governance

* **Storage** — default `createMemoryStore()` is pure in-memory.
  Swap in a Supabase / SQL adapter matching the same shape to
  persist. All history arrays are preserved.
* **Clock** — the constructor accepts `{now: () => new Date()}`
  for deterministic testing.
* **Extension** — `budgetDefaults` can be overridden per customer
  to match that company's generosity curve.
* **Bilingual** — every user-facing output is `{he, en}` so no UI
  string needs to be hard-coded in either language.

---

**End of report — Agent Y-130 delivered 2026-04-11**
**Module, tests, and report are append-only. Never delete.**
