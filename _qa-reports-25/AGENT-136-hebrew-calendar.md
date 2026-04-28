# AGENT-136 — Hebrew Calendar Handling Audit

**Scope:** Auditing how Jewish holidays (Shabbat, Rosh Hashana, Yom Kippur, Sukkot, Pesach, Shavuot, Purim, Tisha B'Av, etc.) are handled across payroll, attendance, business-day computations, dunning/collections, and scheduling. **Date:** 2026-04-29 (Yom HaZikaron eve in some tables — directly relevant).

---

## 1. Library Used? **None — all hand-rolled.**

- **No `@hebcal/core` dependency** in any active service. The string `"@hebcal/core": "^6.3.2"` exists only in `_merge-incoming/techno-uzi-erp/.../api-server/package.json` — that's a stale Replit import, not a live dependency.
- All Hebrew-calendar logic is implemented in-house with **zero external deps**.

Two real implementations exist:

| Module | File | Algorithm |
|---|---|---|
| `HebrewCalendar` facade (life-events) | `onyx-procurement/src/comms/life-events.js:430-495` | Pure-JS Hillel II arithmetic (`gregorianToAbsolute` / `absoluteToHebrew`, `hebrewMonthsInYear`, `hebrewMonthLength`, `isHebrewLeapYear`) |
| `gregorianToHebrew` (check printer) | `onyx-procurement/src/payments/check-printer.js:485-540` | Reingold/Dershowitz-style (`hebToAbsolute`, `hebDaysInMonth`), with gematria year text (`תשפ״ו`) for cheque face |

The `HebrewCalendar` facade is the **only** real bidirectional Gregorian↔Hebrew converter. Everything else uses Gregorian-date lookup tables.

---

## 2. Holiday Tables — **Five Independent Copies (NOT a single source of truth)**

| Module | File:Line | Coverage | Format | Notes |
|---|---|---|---|---|
| Reminders / DND | `onyx-procurement/src/comms/reminders.js:248-275` | 2025-2027 | `{start,end,he,en}` ranges | Used for `nextNonHoliday()` |
| Meeting scheduler | `onyx-procurement/src/customer/meeting-scheduler.js:278-296` | 2026 only | `{date,he,en}` per-day | 17 entries |
| Manufacturing WO scheduler | `onyx-procurement/src/manufacturing/wo-scheduler.js:1134-1152` | 2026 only | `[iso,en,he]` tuple | 16 entries |
| DevOps autoscaler | `onyx-procurement/src/devops/autoscaler.js:75-93` | 2026 only | `{date,name,nameHe}` | **Includes Tisha B'Av** (2026-07-23); the only table that does |
| Seasonality (anomaly model) | `onyx-ai/src/seasonality/seasonality.ts:300-344` | 5785-5792 (2024-2032) | Hebrew-year anchors → derived | Ships flags for RoshHaShana/YomKippur/Sukkot/Pesach/Shavuot. Pluggable via `opts.hebrewCalendar` injection |

**Discrepancies between tables (2026):**
- Pesach Day 1: meeting-scheduler `2026-04-02` vs wo-scheduler/autoscaler `2026-04-03` — **off by one day**.
- Yom Kippur: autoscaler `2026-09-22` vs meeting-scheduler/wo-scheduler/reminders `2026-09-21`.
- Rosh Hashana: autoscaler `2026-09-13/14` vs all others `2026-09-12/13`.
- Sukkot Day 1: autoscaler `2026-09-27` vs others `2026-09-26`.
- Simchat Torah: autoscaler `2026-10-04` vs others `2026-10-03`.
- Yom HaZikaron: meeting-scheduler `2026-04-21` vs wo-scheduler `2026-04-29` (**today**) — off by 8 days, pointing at the Israeli Memorial Day shift this year.

Autoscaler appears to be one calendar-day later than the others system-wide — likely a TZ off-by-one bug (UTC vs Asia/Jerusalem).

---

## 3. Shabbat Detection — Three Different Definitions

| Definition | Source | Purpose |
|---|---|---|
| `Friday 18:00 → Saturday 20:00` (local) | `onyx-procurement/src/notifications/preference-manager.js:353-361` | DND / quiet-hours |
| `Friday 14:00 → Saturday 20:00` | `onyx-procurement/src/ops/alert-manager.js:259-262` (with `FRIDAY_HANDOFF_HOUR=14`) | On-call / alerts |
| `Friday `LABOR_LAW.SHABBAT_START_HOUR` → Saturday `LABOR_LAW.SHABBAT_END_HOUR`` | `onyx-procurement/src/time/time-tracking.js:746-763` | Payroll wages — overlap check via 30-min step iteration |
| `getDay() === 6` (Saturday only, full day off) | `onyx-procurement/src/manufacturing/wo-scheduler.js:1162` (`SHABBAT_DAY_UTC = 6`) | Scheduler |
| API `isFriday`/`isSaturday` from JS Date | `api-server/src/routes/hr-attendance-advanced.ts:256-287` | Israeli §17 OT calculation |

**No astronomical sunset table.** All implementations use a fixed clock-time heuristic. The code in `preference-manager.js` admits this is "close-enough-in-Israel" and notes no sunset tables are used. Consequence: Shabbat windows are **wrong by 30-90 minutes** for actual halachic observance, especially in winter (early sunset) and summer (late sunset). Tolerable for ops/DND, **not** rigorous for payroll audit.

---

## 4. Payroll — Chag Pay Treatment

- `wage-slip-calculator.js:75-83` defines `OVERTIME_RATES.HOLIDAY = 2.00` and the comment `200% — חג / מועד`. **However** — there is NO calendar lookup that ever triggers this multiplier.
- `wage-slip-calculator.js:297` reads `holiday_pay` directly from the **timesheet** (`timesheet.holiday_pay`). The system trusts upstream callers to mark days as holiday; nothing automatically detects that 2026-09-21 is Yom Kippur and flags those hours.
- `time-tracking.js:828-841` only checks `overlapsShabbat()`. Holiday hours fall through into the regular/125%/150% buckets exactly like a Wednesday.
- `api-server/src/routes/hr-attendance-advanced.ts:256-287` (`calcIsraeliOvertime`) takes only `isFriday`/`isSaturday` — no holiday flag at all.
- **`AGENT-186-time-tracking.md:130` already flags this exact gap:** "Holiday saving (chag) not separated from Shabbat. Both route to 175/200 via `observesShabbat` flag; no distinct holiday calendar."
- **`QA-AGENT-90-VACATION-SICK.md:225`** also flags it as **CRITICAL**: "No holiday calendar, no holiday-pay premium."

**Net:** §18 of the Hours of Work and Rest Law (180% for chag, or 100% on top if the worker is granted comp day) is **not enforced anywhere in payroll**.

---

## 5. Attendance / Vacation Day Counting

`techno-kol-ops/client/src/engines/hoursAttendanceEngine.ts` defines `ShiftType = 'regular' | 'overtime_125' | 'overtime_150' | 'night' | 'saturday' | 'holiday'` but `daysCount` (line 68) computes "כולל סופי שבוע? לא" — without consulting a holiday calendar. Vacation days during Pesach/Sukkot are deducted from balance even though the office is closed.

`AttendanceCalendar.tsx`, `VacationRequestForm.tsx`, `EmployeeHoursLog.tsx` reference holiday/shabbat names in UI strings but contain **no calendar lookup logic**.

---

## 6. Dunning / Collections

- `onyx-procurement/src/collections/dunning.js` — **zero hits** for `holiday`, `shabbat`, or `chag`. Sends dunning letters on raw aging-bucket arithmetic with no calendar adjustment. A reminder dated 2026-09-21 (Yom Kippur) will fire.
- `onyx-procurement/src/comms/reminders.js:290-297` — `nextNonHoliday(epochMs)` exists and uses `ISRAELI_HOLIDAYS` ranges. **But it caps at 15 forward iterations, then "gives up"** — fragile if a holiday cluster (e.g., the full Tishrei window 2026-09-12 through 2026-10-03 is 22 days when stacked with Shabbatot). It's wired only into the comms reminder scheduler (`reminders.js:936` — `if (cfg.israeliHolidayAware) t = nextNonHoliday(t)`), not into AR/dunning.
- `finance/debt-collection.js`, `realestate/rent-collection.js` — no holiday awareness. Late fees accrue on Shabbat/Chag.

---

## 7. Business-Day Arithmetic — No Centralized Helper

There is no `il-calendar.js`, no `isWorkingDay()`, no `addBusinessDays()` utility. `_qa-reports/AG-X55-alert-manager.md:267` explicitly recommends creating one but it has not been built. Each module re-implements its own day-of-week + holiday combinator inline:
- autoscaler `_scheduleInfo()` (Sun-Thu = business)
- wo-scheduler `(dow !== SHABBAT_DAY_UTC && !isHoliday(...))`
- alert-manager `temporalFlags()`
- meeting-scheduler `slotGen()` (Sun-Thu 09:00-18:00, Fri 09:00-13:00)

---

## 8. Hebrew Date Display — Two Engines

- **`HebrewCalendar.fromGregorian()`** (life-events.js) — used for Hebrew-birthday recurrence (`recurringGregorian`), correct Adar/Adar II handling for leap years.
- **`gregorianToHebrew()`** (check-printer.js) — produces gematria text like `ה׳ ניסן תשפ״ו` for the date field on physical cheques. Hand-coded gematria (`HEB_GEMATRIA`) including the `יה→טו` / `יו→טז` Name-of-God avoidance rule. Solid.
- **Mobile DashboardScreen.tsx:27-35** — `function hebrewDate()` uses **only Gregorian month/day names in Hebrew letters** (`ינואר, פברואר, ...`). It is **NOT a Hebrew-calendar date** despite the function name. **Misleading naming.**

---

## 9. Findings & Risk Summary

| # | Finding | Severity | Location |
|---|---|---|---|
| 1 | Five disjoint 2026 holiday tables disagree on dates (TZ off-by-one in autoscaler) | **High** | meeting-scheduler / wo-scheduler / autoscaler / reminders / seasonality |
| 2 | Payroll never auto-detects chag — §18 200% premium unreachable from calendar | **Critical** | wage-slip-calculator.js, time-tracking.js, hr-attendance-advanced.ts |
| 3 | Shabbat is clock-time, not sunset-based | Medium | preference-manager, alert-manager, time-tracking |
| 4 | Dunning/AR/rent-collection ignore holidays — letters fire on Yom Kippur | High | collections/dunning.js, finance/debt-collection.js |
| 5 | `nextNonHoliday()` caps at 15 days, breaks during Tishrei cluster | Medium | comms/reminders.js:290 |
| 6 | No central `il-calendar.js` / `isWorkingDay()` helper | Medium | system-wide |
| 7 | `mobile-app hebrewDate()` is Gregorian-with-Hebrew-text, mislabeled | Low | mobile-app/src/screens/DashboardScreen.tsx:27 |
| 8 | Vacation balance counts holidays as PTO days | High | techno-kol-ops/client/src/engines/hoursAttendanceEngine.ts |

---

## 10. Recommendations

1. **Create `onyx-procurement/src/time/il-calendar.js`** as the canonical source: holiday table 2025-2030 minimum, `isHoliday(date, opts)`, `isShabbat(date)`, `isWorkingDay(date)`, `nextWorkingDay(date)`, `addBusinessDays(date, n)`. Re-export everywhere.
2. **Promote `bundledHebrewCalendar` from `onyx-ai/src/seasonality/seasonality.ts`** (it already covers 5785-5792 and is the cleanest implementation) into a shared package; the seasonality module then `import`s from there instead of bundling its own copy.
3. **Wire holiday detection into `wage-slip-calculator.js` and `hr-attendance-advanced.ts:calcIsraeliOvertime`** — accept `isHoliday` flag and apply the 200% bucket.
4. **Reconcile autoscaler's 2026 dates** — currently +1 day vs the rest, a real bug.
5. **Holiday-skip in dunning** — `collections/dunning.js` should call `nextWorkingDay()` before queueing an email/SMS.
6. **Fix `nextNonHoliday`'s 15-day cap** — Tishrei cluster (Rosh Hashana → Simchat Torah) plus weekend = up to 24 days.
7. **Rename mobile `hebrewDate()` → `hebrewFormattedGregorianDate()` or use the real `HebrewCalendar.fromGregorian()`.**
