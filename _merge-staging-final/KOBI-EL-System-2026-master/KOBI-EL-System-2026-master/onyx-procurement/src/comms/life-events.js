/**
 * Life Events Reminder System — אירועי חיים
 * Agent Y-130 • Techno-Kol Uzi mega-ERP • Swarm Comms
 *
 * Birthdays, work anniversaries, marriages, newborns, bereavements,
 * retirements, promotions, achievements — the full Israeli workplace
 * tradition of marking personal and professional milestones.
 *
 * Israeli workplace culture context (הקשר תרבותי):
 *   • יום הולדת — birthdays are strongly celebrated; often cake in
 *     the kitchen and a WhatsApp message from the team.
 *   • שנות ותק — work anniversaries are less formal but 5/10/15/20
 *     year milestones traditionally earn a gift (מתנת ותק).
 *   • לידת ילד — newborns: companies traditionally send a gift
 *     (מתנת לידה), a congratulatory card, and sometimes a small bonus.
 *   • חתונה — weddings: it is common for employers to send a
 *     wedding gift or מעטפה (check/cash gift).
 *   • אבל / ניחום אבלים — bereavements are treated with dignity;
 *     never automated. A manager makes personal contact, and shiva
 *     visits are coordinated by HR manually.
 *   • לוח עברי — some employees (religious or traditional) celebrate
 *     birthdays on the Hebrew calendar rather than Gregorian. The
 *     system supports both — and can recompute the Gregorian date
 *     each year based on the Hebrew date of birth.
 *
 * Rule of the ERP: לא מוחקים רק משדרגים ומגדלים
 *   Nothing is ever deleted. Events are append-only. Preferences
 *   changes keep history. Cancelled events transition status but
 *   remain in the audit trail.
 *
 * Bilingual: every event type, card template, greeting and label
 * ships with { he, en } variants so the UI can render either way.
 *
 * Zero deps. Node >= 14. Pure in-memory by default; pass a store
 * adapter (`createMemoryStore()`-shaped) for persistence.
 *
 * Public exports:
 *   class  LifeEvents
 *   const  EVENT_TYPES
 *   const  EVENT_STATUS
 *   const  MILESTONES_YEARS
 *   const  LABELS
 *   const  HebrewCalendar      — minimal Hillel II arithmetic
 *   function createMemoryStore()
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS — event types, statuses, labels
// ═══════════════════════════════════════════════════════════════════

/** The eight tracked life-event types. */
const EVENT_TYPES = Object.freeze({
  BIRTHDAY:          'birthday',
  WORK_ANNIVERSARY:  'work-anniversary',
  MARRIAGE:          'marriage',
  CHILD_BIRTH:       'child-birth',
  RETIREMENT:        'retirement',
  PROMOTION:         'promotion',
  ACHIEVEMENT:       'achievement',
  BEREAVEMENT:       'bereavement',
});

const EVENT_TYPE_LIST = Object.freeze([
  EVENT_TYPES.BIRTHDAY,
  EVENT_TYPES.WORK_ANNIVERSARY,
  EVENT_TYPES.MARRIAGE,
  EVENT_TYPES.CHILD_BIRTH,
  EVENT_TYPES.RETIREMENT,
  EVENT_TYPES.PROMOTION,
  EVENT_TYPES.ACHIEVEMENT,
  EVENT_TYPES.BEREAVEMENT,
]);

/** Event lifecycle — events are never deleted, only transition. */
const EVENT_STATUS = Object.freeze({
  SCHEDULED:      'scheduled',
  ACKNOWLEDGED:   'acknowledged',
  CELEBRATED:     'celebrated',
  SENSITIVE_HOLD: 'sensitive_hold',  // bereavement etc.
  OPTED_OUT:      'opted_out',       // person prefers privacy
  SUPERSEDED:     'superseded',      // replaced by upgraded record
});

/** Sensitive event types that MUST NOT trigger automated cards/notices. */
const SENSITIVE_TYPES = Object.freeze([EVENT_TYPES.BEREAVEMENT]);

/** Milestone anniversary years that customarily earn a gift. */
const MILESTONES_YEARS = Object.freeze([1, 3, 5, 10, 15, 20, 25, 30, 35, 40]);

/** Default department gift budgets (ILS) per event type. */
const DEFAULT_BUDGETS = Object.freeze({
  [EVENT_TYPES.BIRTHDAY]:         150,   // cake + small gift
  [EVENT_TYPES.WORK_ANNIVERSARY]: 250,   // non-milestone
  [EVENT_TYPES.MARRIAGE]:         500,   // מתנת חתונה
  [EVENT_TYPES.CHILD_BIRTH]:      400,   // מתנת לידה
  [EVENT_TYPES.RETIREMENT]:       1500,  // big send-off
  [EVENT_TYPES.PROMOTION]:        200,
  [EVENT_TYPES.ACHIEVEMENT]:      200,
  [EVENT_TYPES.BEREAVEMENT]:      0,     // never via budget — personal
});

/** Milestone-year multipliers for work anniversaries. */
const MILESTONE_MULTIPLIERS = Object.freeze({
  1:  1.0,
  3:  1.2,
  5:  2.0,   // first big one
  10: 3.0,
  15: 3.5,
  20: 4.5,
  25: 6.0,
  30: 7.0,
  35: 8.0,
  40: 10.0,
});

/** Bilingual labels for every event type. */
const LABELS = Object.freeze({
  [EVENT_TYPES.BIRTHDAY]: Object.freeze({
    he: 'יום הולדת',
    en: 'Birthday',
  }),
  [EVENT_TYPES.WORK_ANNIVERSARY]: Object.freeze({
    he: 'יום שנה לעבודה',
    en: 'Work Anniversary',
  }),
  [EVENT_TYPES.MARRIAGE]: Object.freeze({
    he: 'חתונה',
    en: 'Wedding',
  }),
  [EVENT_TYPES.CHILD_BIRTH]: Object.freeze({
    he: 'לידת ילד',
    en: 'Newborn',
  }),
  [EVENT_TYPES.RETIREMENT]: Object.freeze({
    he: 'פרישה',
    en: 'Retirement',
  }),
  [EVENT_TYPES.PROMOTION]: Object.freeze({
    he: 'קידום',
    en: 'Promotion',
  }),
  [EVENT_TYPES.ACHIEVEMENT]: Object.freeze({
    he: 'הישג',
    en: 'Achievement',
  }),
  [EVENT_TYPES.BEREAVEMENT]: Object.freeze({
    he: 'אבל',
    en: 'Bereavement',
  }),
});

/** Bilingual greeting card bodies — short, warm, workplace-appropriate. */
const CARD_TEMPLATES = Object.freeze({
  [EVENT_TYPES.BIRTHDAY]: Object.freeze({
    he: 'מזל טוב ליום הולדתך! שתהיה לך שנה מלאה באושר, בריאות והצלחה. מכל הצוות.',
    en: 'Happy birthday! Wishing you a year filled with joy, health, and success. From the whole team.',
  }),
  [EVENT_TYPES.WORK_ANNIVERSARY]: Object.freeze({
    he: 'מזל טוב לשנות הוותק! תודה על תרומתך לצוות ולחברה. מצפים לעוד הרבה שנים יחד.',
    en: 'Congratulations on your work anniversary! Thank you for everything you bring to the team. Here is to many more years together.',
  }),
  [EVENT_TYPES.MARRIAGE]: Object.freeze({
    he: 'מזל טוב לחתונה! שתזכו לבנות בית נאמן בישראל, מלא אהבה ושמחה.',
    en: 'Mazal tov on your wedding! May you build a home full of love, laughter, and joy.',
  }),
  [EVENT_TYPES.CHILD_BIRTH]: Object.freeze({
    he: 'מזל טוב להולדת הילד! שיגדל לתפארת המשפחה. ברוך הבא לעולם.',
    en: 'Mazal tov on the new baby! Wishing your family health, joy, and endless nachas.',
  }),
  [EVENT_TYPES.RETIREMENT]: Object.freeze({
    he: 'לאחר שנים רבות של עבודה מסורה — חופשה מתוקה ומגיעה לך. תודה על הכל.',
    en: 'After many years of dedicated service — enjoy a sweet, well-earned rest. Thank you for everything.',
  }),
  [EVENT_TYPES.PROMOTION]: Object.freeze({
    he: 'מזל טוב לקידום! המשך כך — הגעת לזה ביושר.',
    en: 'Congratulations on the promotion! Well deserved — keep going strong.',
  }),
  [EVENT_TYPES.ACHIEVEMENT]: Object.freeze({
    he: 'מזל טוב על ההישג! אנחנו גאים בך ובעבודתך.',
    en: 'Congratulations on this achievement! We are proud of you and your work.',
  }),
  // No automated card for bereavement — personal outreach only.
  [EVENT_TYPES.BEREAVEMENT]: null,
});

// ═══════════════════════════════════════════════════════════════════
// HEBREW CALENDAR — minimal Hillel II implementation
// ═══════════════════════════════════════════════════════════════════
//
// Enough arithmetic to convert between Gregorian and Hebrew (Jewish)
// dates within a few decades of today. Used so a person born on
// 15 Nisan 5760 can have next year's birthday recomputed to the
// correct Gregorian date each year.
//
// The algorithm is the classical Hillel II calendar (the calendar
// fixed by Hillel II in 358 CE), as documented in Dershowitz & Reingold
// "Calendrical Calculations" and widely cross-checked against Hebcal.
//
// All dates use the convention: Hebrew day/month/year are 1-indexed.
// Months: 1=Nisan, 2=Iyar, 3=Sivan, 4=Tammuz, 5=Av, 6=Elul,
//         7=Tishrei, 8=Cheshvan, 9=Kislev, 10=Tevet, 11=Shvat,
//         12=Adar / 12=Adar I, 13=Adar II (leap years).
//
// Note: the Hebrew year is offset from civil year; Rosh Hashanah
// (1 Tishrei) begins a new Hebrew year. So 1 Tishrei 5786 is late
// September 2025, while 15 Nisan 5786 is mid-April 2026.

const HEBREW_MONTHS = Object.freeze({
  NISAN:    1,
  IYAR:     2,
  SIVAN:    3,
  TAMMUZ:   4,
  AV:       5,
  ELUL:     6,
  TISHREI:  7,
  CHESHVAN: 8,
  KISLEV:   9,
  TEVET:   10,
  SHVAT:   11,
  ADAR:    12,
  ADAR_I:  12,
  ADAR_II: 13,
});

const HEBREW_MONTH_NAMES_HE = Object.freeze({
  1:  'ניסן',
  2:  'אייר',
  3:  'סיוון',
  4:  'תמוז',
  5:  'אב',
  6:  'אלול',
  7:  'תשרי',
  8:  'חשוון',
  9:  'כסלו',
  10: 'טבת',
  11: 'שבט',
  12: 'אדר',
  13: 'אדר ב׳',
});

function isHebrewLeapYear(year) {
  // 7 leap years in every 19-year Metonic cycle at positions
  // 3, 6, 8, 11, 14, 17, 19.
  return ((7 * year + 1) % 19) < 7;
}

function hebrewMonthsInYear(year) {
  return isHebrewLeapYear(year) ? 13 : 12;
}

function hebrewYearLengthInDays(year) {
  return hebrewToAbsolute(year + 1, 7, 1) - hebrewToAbsolute(year, 7, 1);
}

function isLongCheshvan(year) {
  return (hebrewYearLengthInDays(year) % 10) === 5;
}

function isShortKislev(year) {
  return (hebrewYearLengthInDays(year) % 10) === 3;
}

function hebrewMonthLength(year, month) {
  // 30-day months: Nisan, Sivan, Av, Tishrei, Shvat + variable Cheshvan/Kislev
  if ([1, 3, 5, 7, 11].indexOf(month) !== -1) return 30;
  if ([2, 4, 6, 10, 13].indexOf(month) !== -1) return 29;
  if (month === 12) {
    // Adar: 29 normally, 30 in leap year (Adar I). Adar II is always 29.
    return isHebrewLeapYear(year) ? 30 : 29;
  }
  if (month === 8) {
    // Cheshvan — 29 or 30 depending on year length
    return isLongCheshvan(year) ? 30 : 29;
  }
  if (month === 9) {
    // Kislev — 29 or 30 depending on year length
    return isShortKislev(year) ? 29 : 30;
  }
  throw new Error('invalid hebrew month ' + month);
}

// Convert Hebrew (year, month, day) to "absolute" day number
// (days since the epoch used by Dershowitz/Reingold, which is
// 1 Tishrei 1 = day 1). Gregorian epoch is RD 1 = 0001-01-01 (proleptic).

function hebrewCalendarElapsedDays(year) {
  const monthsElapsed =
    235 * Math.floor((year - 1) / 19)                      // whole cycles
    + 12 * ((year - 1) % 19)                                // regular years
    + Math.floor((7 * ((year - 1) % 19) + 1) / 19);         // leap months
  const partsElapsed = 204 + 793 * (monthsElapsed % 1080);
  const hoursElapsed = 5 + 12 * monthsElapsed
    + 793 * Math.floor(monthsElapsed / 1080)
    + Math.floor(partsElapsed / 1080);
  const conjunctionDay = 1 + 29 * monthsElapsed + Math.floor(hoursElapsed / 24);
  const conjunctionParts = 1080 * (hoursElapsed % 24) + (partsElapsed % 1080);

  let altDay;
  if (
    conjunctionParts >= 19440 ||
    (
      (conjunctionDay % 7) === 2 &&
      conjunctionParts >= 9924 &&
      !isHebrewLeapYear(year)
    ) ||
    (
      (conjunctionDay % 7) === 1 &&
      conjunctionParts >= 16789 &&
      isHebrewLeapYear(year - 1)
    )
  ) {
    altDay = conjunctionDay + 1;
  } else {
    altDay = conjunctionDay;
  }

  if ([0, 3, 5].indexOf(altDay % 7) !== -1) {
    altDay += 1;
  }
  return altDay;
}

function hebrewNewYear(year) {
  // Return the absolute day of 1 Tishrei of the given Hebrew year.
  return HEBREW_EPOCH + hebrewCalendarElapsedDays(year);
}

// The absolute RD of 1 Tishrei of year 1 (proleptic Gregorian -3761-09-07).
// Derivation: Hillel II calendar epoch = -1373428 days before Gregorian
// 0001-01-01. We encode it as a constant after back-solving one
// known anchor (Rosh Hashanah 5786 = 2025-09-23, 15 Nisan 5786 = 2026-04-02)
// so round-trips work.
const HEBREW_EPOCH = -1373428;

function hebrewToAbsolute(year, month, day) {
  let abs = day;
  if (month < 7) {
    // Months before Tishrei in civil terms (Nisan..Elul of the NEW year)
    for (let m = 7; m <= hebrewMonthsInYear(year - 1); m += 1) {
      abs += hebrewMonthLength(year - 1, m);
    }
    // Wait — for months Nisan..Elul of year Y we want to count:
    //   days in Tishrei..last month of year (Y-1)  — NO, we handled via civil year.
    // Correct approach: hebrew year numbering begins on Tishrei. But by
    // convention in calendrical calculations the "civil" Hebrew year for
    // months Nisan..Elul is the SAME year number as Tishrei of the
    // previous autumn. So if we treat `year` as the civil year label
    // (which is what this module uses), then:
    //   - months 7..13 belong to the year that began on 1 Tishrei of that year
    //   - months 1..6 belong to the civil continuation of that year
    // But by convention, birthdays use "civil" year numbering consistently,
    // so this branch needs to count Tishrei..end of `year` + months 1..(m-1) of `year`.
    // Re-derive below.
    abs = day;
    for (let m = 7; m <= hebrewMonthsInYear(year); m += 1) {
      abs += hebrewMonthLength(year, m);
    }
    for (let m = 1; m < month; m += 1) {
      abs += hebrewMonthLength(year, m);
    }
  } else {
    for (let m = 7; m < month; m += 1) {
      abs += hebrewMonthLength(year, m);
    }
  }
  return hebrewNewYear(year) + abs - 1;
}

function absoluteToHebrew(absDay) {
  // Binary-search the Hebrew year whose Tishrei 1 ≤ absDay < next Tishrei 1.
  // Approximate the year by scaling; then refine.
  let approx = Math.floor((absDay - HEBREW_EPOCH) / 366);
  while (hebrewNewYear(approx + 1) <= absDay) approx += 1;
  while (hebrewNewYear(approx) > absDay) approx -= 1;
  const year = approx;

  // Walk months from Tishrei forward.
  let month = 7;
  while (true) {
    const monthLen = hebrewMonthLength(year, month);
    const monthStart = hebrewToAbsolute(year, month, 1);
    if (absDay < monthStart + monthLen) break;
    month += 1;
    if (month > hebrewMonthsInYear(year)) month = 1;
    if (month === 7) break; // safety, should not happen
  }
  const monthStart = hebrewToAbsolute(year, month, 1);
  const day = absDay - monthStart + 1;
  return { year, month, day };
}

// Gregorian <-> absolute (RD) helpers.
function isGregorianLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function gregorianMonthLength(y, m) {
  if (m === 2) return isGregorianLeap(y) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function gregorianToAbsolute(y, m, d) {
  let abs = d;
  for (let mm = 1; mm < m; mm += 1) abs += gregorianMonthLength(y, mm);
  abs += 365 * (y - 1)
    + Math.floor((y - 1) / 4)
    - Math.floor((y - 1) / 100)
    + Math.floor((y - 1) / 400);
  return abs;
}

function absoluteToGregorian(absDay) {
  let y = Math.floor(absDay / 366) + 1;
  while (gregorianToAbsolute(y + 1, 1, 1) <= absDay) y += 1;
  while (gregorianToAbsolute(y, 1, 1) > absDay) y -= 1;
  let m = 1;
  while (m <= 12 && gregorianToAbsolute(y, m, gregorianMonthLength(y, m)) < absDay) {
    m += 1;
  }
  const d = absDay - gregorianToAbsolute(y, m, 1) + 1;
  return { y, m, d };
}

// ───────────────────────────────────────────────────────────────────
// Public HebrewCalendar facade
// ───────────────────────────────────────────────────────────────────

const HebrewCalendar = Object.freeze({
  MONTHS: HEBREW_MONTHS,
  MONTH_NAMES_HE: HEBREW_MONTH_NAMES_HE,
  isLeapYear: isHebrewLeapYear,
  monthsInYear: hebrewMonthsInYear,
  monthLength: hebrewMonthLength,

  /**
   * Convert a Gregorian Date (or y/m/d) to Hebrew {year, month, day}.
   * @param {Date|{y:number,m:number,d:number}} g
   */
  fromGregorian(g) {
    let y, m, d;
    if (g instanceof Date) {
      y = g.getUTCFullYear();
      m = g.getUTCMonth() + 1;
      d = g.getUTCDate();
    } else {
      ({ y, m, d } = g);
    }
    const abs = gregorianToAbsolute(y, m, d);
    return absoluteToHebrew(abs);
  },

  /**
   * Convert a Hebrew date to a Gregorian Date (UTC midnight).
   * @param {number} year
   * @param {number} month  1..13
   * @param {number} day    1..30
   */
  toGregorian(year, month, day) {
    const abs = hebrewToAbsolute(year, month, day);
    const { y, m, d } = absoluteToGregorian(abs);
    return new Date(Date.UTC(y, m - 1, d));
  },

  /**
   * Given a Gregorian date of birth and a reference Gregorian date,
   * return the Gregorian date in the reference year on which the same
   * Hebrew day-of-year falls. Used for Hebrew birthdays.
   * Handles missing days (e.g. Adar II → falls back to Adar on non-leap years).
   */
  recurringGregorian(gregBirth, refDate) {
    const h = HebrewCalendar.fromGregorian(gregBirth);
    const refYearHeb = HebrewCalendar.fromGregorian(refDate).year;

    // Adjust for leap-year month shifts:
    //  - Adar II (13) in leap year → Adar (12) in non-leap year
    //  - Adar (12) in non-leap year in leap year → Adar I still (12)
    let month = h.month;
    if (!isHebrewLeapYear(refYearHeb) && month === 13) month = 12;

    // Try (refYearHeb, month, day) and (refYearHeb+1, month, day),
    // return whichever is ≥ refDate.
    for (const yr of [refYearHeb, refYearHeb + 1]) {
      // Clamp day to month length.
      const maxDay = hebrewMonthLength(yr, month);
      const day = Math.min(h.day, maxDay);
      const greg = HebrewCalendar.toGregorian(yr, month, day);
      if (greg.getTime() >= startOfDay(refDate).getTime()) return greg;
    }
    // Fallback
    const maxDay = hebrewMonthLength(refYearHeb + 1, month);
    return HebrewCalendar.toGregorian(refYearHeb + 1, month, Math.min(h.day, maxDay));
  },
});

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function startOfDay(d) {
  const c = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function addDays(d, n) {
  const c = new Date(d.getTime());
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

function daysBetween(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS);
}

function toDate(v) {
  if (v instanceof Date) return v;
  return new Date(v);
}

function isValidEventType(t) {
  return EVENT_TYPE_LIST.indexOf(t) !== -1;
}

function isSensitive(t) {
  return SENSITIVE_TYPES.indexOf(t) !== -1;
}

function makeEventId() {
  return 'evt_' + Date.now().toString(36) + '_' +
    Math.floor(Math.random() * 1e9).toString(36);
}

function assertNonEmpty(v, name) {
  if (v === null || v === undefined || v === '') {
    throw new Error(name + ' is required');
  }
}

/**
 * Compute the NEXT recurrence of an anniversary-style event on or after
 * `ref`. For `lunar === true` use the Hebrew calendar to recompute.
 * For non-recurring events (bereavement, wedding, newborn, retirement,
 * promotion, achievement) the original date is returned unchanged.
 */
function nextRecurrence(eventType, originalDate, ref, lunar) {
  const orig = toDate(originalDate);
  const refD = startOfDay(ref);
  const recurring = (
    eventType === EVENT_TYPES.BIRTHDAY ||
    eventType === EVENT_TYPES.WORK_ANNIVERSARY
  );
  if (!recurring) return orig;

  if (lunar) {
    return HebrewCalendar.recurringGregorian(orig, refD);
  }

  // Gregorian recurrence: same month/day, next year if already past.
  const refY = refD.getUTCFullYear();
  let candidate = new Date(Date.UTC(
    refY,
    orig.getUTCMonth(),
    orig.getUTCDate(),
  ));
  if (candidate.getTime() < refD.getTime()) {
    candidate = new Date(Date.UTC(
      refY + 1,
      orig.getUTCMonth(),
      orig.getUTCDate(),
    ));
  }
  // Handle 29-Feb birthdays in non-leap years → shift to 28-Feb.
  if (orig.getUTCMonth() === 1 && orig.getUTCDate() === 29) {
    const cy = candidate.getUTCFullYear();
    if (!isGregorianLeap(cy)) {
      candidate = new Date(Date.UTC(cy, 1, 28));
    }
  }
  return candidate;
}

/**
 * Compute the "year number" of a recurring event at `onDate`.
 * For a birthday born 1990-05-15, on 2026-05-15 returns 36.
 */
function yearsSince(originalDate, onDate) {
  const orig = toDate(originalDate);
  const on = toDate(onDate);
  let years = on.getUTCFullYear() - orig.getUTCFullYear();
  const beforeAnniv =
    (on.getUTCMonth() < orig.getUTCMonth()) ||
    (on.getUTCMonth() === orig.getUTCMonth() && on.getUTCDate() < orig.getUTCDate());
  if (beforeAnniv) years -= 1;
  return Math.max(0, years);
}

// ═══════════════════════════════════════════════════════════════════
// STORE — memory adapter (swappable)
// ═══════════════════════════════════════════════════════════════════

function createMemoryStore() {
  const events = new Map();       // eventId → event
  const people = new Map();       // personId → { personId, prefs, dept, manager, hireDate }
  const prefs = new Map();        // userId → { publicCelebration, channels, updatedAt, history }
  const budgets = new Map();      // key(dept:type) → { allocated, spent, history }
  const notifs = [];              // append-only manager notification log
  const calendarEvents = [];      // append-only mirror for calendarIntegration

  return {
    // events
    saveEvent(e) {
      events.set(e.eventId, e);
      return e;
    },
    getEvent(id) {
      return events.get(id) || null;
    },
    listEvents() {
      return Array.from(events.values());
    },
    updateEventStatus(id, status, note) {
      const e = events.get(id);
      if (!e) return null;
      const upgraded = Object.assign({}, e, {
        status,
        statusHistory: (e.statusHistory || []).concat([{
          status,
          note: note || null,
          at: new Date().toISOString(),
        }]),
      });
      events.set(id, upgraded);
      return upgraded;
    },

    // people
    upsertPerson(p) {
      const prev = people.get(p.personId) || {};
      const merged = Object.assign({}, prev, p);
      people.set(p.personId, merged);
      return merged;
    },
    getPerson(id) {
      return people.get(id) || null;
    },
    listPeople() {
      return Array.from(people.values());
    },

    // preferences
    getPreference(userId) {
      return prefs.get(userId) || null;
    },
    setPreference(userId, pref) {
      const prev = prefs.get(userId);
      const history = prev && prev.history ? prev.history.slice() : [];
      if (prev) history.push({ snapshot: prev, replacedAt: new Date().toISOString() });
      const upgraded = Object.assign({}, pref, {
        updatedAt: new Date().toISOString(),
        history,
      });
      prefs.set(userId, upgraded);
      return upgraded;
    },

    // budgets
    getBudget(department, eventType) {
      return budgets.get(department + ':' + eventType) || null;
    },
    setBudget(department, eventType, data) {
      const key = department + ':' + eventType;
      const prev = budgets.get(key);
      const history = prev && prev.history ? prev.history.slice() : [];
      if (prev) history.push({ snapshot: prev, replacedAt: new Date().toISOString() });
      const upgraded = Object.assign({}, prev || {}, data, { history });
      budgets.set(key, upgraded);
      return upgraded;
    },
    listBudgets() {
      return Array.from(budgets.entries()).map(([key, val]) => {
        const [department, eventType] = key.split(':');
        return Object.assign({ department, eventType }, val);
      });
    },

    // notifications
    appendNotification(n) {
      notifs.push(n);
      return n;
    },
    listNotifications() {
      return notifs.slice();
    },

    // calendar integration
    appendCalendarEvent(c) {
      calendarEvents.push(c);
      return c;
    },
    listCalendarEvents() {
      return calendarEvents.slice();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// LifeEvents — main class
// ═══════════════════════════════════════════════════════════════════

class LifeEvents {
  /**
   * @param {object} [opts]
   * @param {object} [opts.store]  — storage adapter (defaults to memory)
   * @param {() => Date} [opts.now] — clock (testability)
   * @param {object} [opts.budgetDefaults] — override per-type defaults
   */
  constructor(opts) {
    opts = opts || {};
    this.store = opts.store || createMemoryStore();
    this._now = opts.now || (() => new Date());
    this.budgetDefaults = Object.assign({}, DEFAULT_BUDGETS, opts.budgetDefaults || {});
  }

  now() {
    return this._now();
  }

  // ────────────────────────────────────────────────────────────────
  // Person / preference registration
  // ────────────────────────────────────────────────────────────────

  registerPerson(p) {
    assertNonEmpty(p && p.personId, 'personId');
    return this.store.upsertPerson({
      personId: p.personId,
      nameHe: p.nameHe || null,
      nameEn: p.nameEn || null,
      department: p.department || null,
      managerId: p.managerId || null,
      hireDate: p.hireDate ? toDate(p.hireDate) : null,
      dateOfBirth: p.dateOfBirth ? toDate(p.dateOfBirth) : null,
      dobLunar: !!p.dobLunar,
      email: p.email || null,
      phone: p.phone || null,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // recordEvent
  // ────────────────────────────────────────────────────────────────

  /**
   * Append a life event. Never deletes; supersedes by upgrading the
   * earlier record's status to SUPERSEDED if the caller passes
   * `supersedesEventId`.
   *
   * @param {object} params
   * @param {string} params.personId
   * @param {string} params.type        one of EVENT_TYPES
   * @param {Date|string} params.date   Gregorian date. For lunar birthdays
   *                                    pass the Gregorian equivalent of the
   *                                    Hebrew DOB and set `lunar:true`.
   * @param {boolean} [params.lunar]    celebrate per Hebrew calendar?
   * @param {string} [params.notes]
   * @param {string} [params.supersedesEventId]
   */
  recordEvent(params) {
    assertNonEmpty(params && params.personId, 'personId');
    if (!isValidEventType(params.type)) {
      throw new Error('invalid event type: ' + params.type);
    }
    assertNonEmpty(params.date, 'date');

    const date = toDate(params.date);
    if (isNaN(date.getTime())) throw new Error('invalid date');

    const person = this.store.getPerson(params.personId);
    const event = {
      eventId: makeEventId(),
      personId: params.personId,
      type: params.type,
      date,
      lunar: !!params.lunar,
      notes: params.notes || null,
      department: person ? person.department : null,
      managerId: person ? person.managerId : null,
      status: isSensitive(params.type) ? EVENT_STATUS.SENSITIVE_HOLD : EVENT_STATUS.SCHEDULED,
      createdAt: this.now().toISOString(),
      statusHistory: [{
        status: isSensitive(params.type) ? EVENT_STATUS.SENSITIVE_HOLD : EVENT_STATUS.SCHEDULED,
        note: null,
        at: this.now().toISOString(),
      }],
    };

    this.store.saveEvent(event);

    if (params.supersedesEventId) {
      this.store.updateEventStatus(
        params.supersedesEventId,
        EVENT_STATUS.SUPERSEDED,
        'replaced by ' + event.eventId,
      );
    }
    return event;
  }

  // ────────────────────────────────────────────────────────────────
  // upcomingEvents
  // ────────────────────────────────────────────────────────────────

  /**
   * List events whose NEXT occurrence falls in the next N days.
   * Respects personal celebration preference (excludes opted-out unless
   * caller explicitly requests them).
   *
   * @param {object} [params]
   * @param {number} [params.days=30]
   * @param {string|Array<string>} [params.audience]  department filter(s)
   * @param {Array<string>} [params.types]            whitelist of types
   * @param {boolean} [params.includeOptedOut=false]
   * @param {boolean} [params.includeSensitive=false] (bereavement etc.)
   * @param {Date} [params.now]
   */
  upcomingEvents(params) {
    params = params || {};
    const days = typeof params.days === 'number' ? params.days : 30;
    const now = params.now ? toDate(params.now) : this.now();
    const windowEnd = addDays(startOfDay(now), days);

    const types = params.types
      ? params.types.filter(isValidEventType)
      : EVENT_TYPE_LIST.slice();

    let audienceSet = null;
    if (params.audience) {
      audienceSet = new Set(
        Array.isArray(params.audience) ? params.audience : [params.audience]
      );
    }

    const all = this.store.listEvents();
    const results = [];

    for (const e of all) {
      if (e.status === EVENT_STATUS.SUPERSEDED) continue;
      if (types.indexOf(e.type) === -1) continue;
      if (audienceSet && e.department && !audienceSet.has(e.department)) continue;
      if (!params.includeSensitive && isSensitive(e.type)) continue;

      // Preference check
      if (!params.includeOptedOut) {
        const pref = this.store.getPreference(e.personId);
        if (pref && pref.publicCelebration === false) continue;
      }

      const next = nextRecurrence(e.type, e.date, now, e.lunar);
      if (
        next.getTime() >= startOfDay(now).getTime() &&
        next.getTime() <= windowEnd.getTime()
      ) {
        results.push({
          eventId: e.eventId,
          personId: e.personId,
          type: e.type,
          label: LABELS[e.type],
          originalDate: e.date,
          nextOccurrence: next,
          daysUntil: daysBetween(now, next),
          yearsCompleted:
            e.type === EVENT_TYPES.BIRTHDAY || e.type === EVENT_TYPES.WORK_ANNIVERSARY
              ? (e.lunar
                  ? HebrewCalendar.fromGregorian(next).year -
                    HebrewCalendar.fromGregorian(e.date).year
                  : yearsSince(e.date, next))
              : null,
          lunar: !!e.lunar,
          department: e.department,
          status: e.status,
        });
      }
    }
    results.sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());
    return results;
  }

  // ────────────────────────────────────────────────────────────────
  // notifyManagers
  // ────────────────────────────────────────────────────────────────

  /**
   * Produce a bilingual reminder for the manager and log it.
   * Returns the notification record (append-only).
   */
  notifyManagers(params) {
    assertNonEmpty(params && params.personId, 'personId');
    assertNonEmpty(params.event, 'event');

    const person = this.store.getPerson(params.personId);
    const event = typeof params.event === 'string'
      ? this.store.getEvent(params.event)
      : params.event;

    if (!event) throw new Error('event not found');

    const managerId = params.managerId
      || event.managerId
      || (person && person.managerId)
      || null;

    const label = LABELS[event.type];
    const personName = person
      ? (person.nameHe || person.nameEn || person.personId)
      : event.personId;

    const notification = {
      notificationId: 'notif_' + Date.now().toString(36) + '_' +
        Math.floor(Math.random() * 1e9).toString(36),
      managerId,
      personId: event.personId,
      eventId: event.eventId,
      eventType: event.type,
      acknowledged: false,
      createdAt: this.now().toISOString(),
      subject: {
        he: 'תזכורת: ' + label.he + ' של ' + personName,
        en: 'Reminder: ' + label.en + ' — ' + personName,
      },
      body: {
        he:
          'שלום, זוהי תזכורת כי ' + personName + ' חוגג ' + label.he + ' בקרוב.' +
          (isSensitive(event.type)
            ? ' אנא פנה אישית ולא דרך כרטיס אוטומטי.'
            : ' אנא שקול לאשר ולשלוח ברכה.'),
        en:
          'Hi, this is a reminder that ' + personName + ' has an upcoming ' + label.en + '.' +
          (isSensitive(event.type)
            ? ' Please reach out personally — no automated card will be sent.'
            : ' Please consider acknowledging and sending a greeting.'),
      },
      sensitive: isSensitive(event.type),
    };

    this.store.appendNotification(notification);

    // Transition event status only for non-sensitive
    if (!isSensitive(event.type) && event.status === EVENT_STATUS.SCHEDULED) {
      this.store.updateEventStatus(
        event.eventId,
        EVENT_STATUS.ACKNOWLEDGED,
        'manager notified',
      );
    }
    return notification;
  }

  // ────────────────────────────────────────────────────────────────
  // autoCardGeneration
  // ────────────────────────────────────────────────────────────────

  /**
   * Produce a bilingual Hebrew/English greeting card template.
   * Bereavement → returns null and logs a sensitive-hold notice.
   */
  autoCardGeneration(params) {
    assertNonEmpty(params && params.eventId, 'eventId');
    const event = this.store.getEvent(params.eventId);
    if (!event) throw new Error('event not found');

    if (isSensitive(event.type)) {
      return {
        eventId: event.eventId,
        automated: false,
        sensitive: true,
        message: {
          he: 'אירוע רגיש — לא נוצר כרטיס אוטומטי. נדרשת פנייה אישית.',
          en: 'Sensitive event — no automated card. Personal outreach required.',
        },
      };
    }

    const person = this.store.getPerson(event.personId);
    const personName = person
      ? (person.nameHe || person.nameEn || person.personId)
      : event.personId;
    const template = CARD_TEMPLATES[event.type];

    return {
      eventId: event.eventId,
      personId: event.personId,
      eventType: event.type,
      automated: true,
      sensitive: false,
      card: {
        he: {
          title: LABELS[event.type].he + ' — ' + personName,
          body: template.he,
          signature: 'הצוות',
        },
        en: {
          title: LABELS[event.type].en + ' — ' + personName,
          body: template.en,
          signature: 'The Team',
        },
      },
      generatedAt: this.now().toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────────────
  // giftBudget
  // ────────────────────────────────────────────────────────────────

  /**
   * Return the suggested budget for a specific event+department, and
   * the running spent total. Handles milestone multipliers for
   * work anniversaries (1/3/5/10/15/20/25/30/35/40 year marks).
   *
   * If the caller passes `spend` the amount is deducted from the
   * remaining budget and appended to history (never deleted).
   */
  giftBudget(params) {
    assertNonEmpty(params && params.personId, 'personId');
    if (!isValidEventType(params.eventType)) {
      throw new Error('invalid eventType');
    }

    const person = this.store.getPerson(params.personId);
    const department = params.department
      || (person && person.department)
      || 'default';

    const base = this.budgetDefaults[params.eventType] || 0;
    let suggested = base;
    let milestoneYears = null;

    if (params.eventType === EVENT_TYPES.WORK_ANNIVERSARY) {
      const ref = params.refDate ? toDate(params.refDate) : this.now();
      if (person && person.hireDate) {
        milestoneYears = yearsSince(person.hireDate, ref);
        if (milestoneYears === 0) milestoneYears = 1;
        if (MILESTONES_YEARS.indexOf(milestoneYears) !== -1) {
          suggested = Math.round(base * MILESTONE_MULTIPLIERS[milestoneYears]);
        }
      }
    }

    let budgetRecord = this.store.getBudget(department, params.eventType) || {
      department,
      eventType: params.eventType,
      allocated: 0,
      spent: 0,
      spendHistory: [],
    };

    if (typeof params.allocate === 'number') {
      budgetRecord = this.store.setBudget(department, params.eventType, {
        department,
        eventType: params.eventType,
        allocated: (budgetRecord.allocated || 0) + params.allocate,
        spent: budgetRecord.spent || 0,
        spendHistory: budgetRecord.spendHistory || [],
      });
    }

    if (typeof params.spend === 'number' && params.spend > 0) {
      const newHistory = (budgetRecord.spendHistory || []).concat([{
        personId: params.personId,
        amount: params.spend,
        at: this.now().toISOString(),
        note: params.note || null,
      }]);
      budgetRecord = this.store.setBudget(department, params.eventType, {
        department,
        eventType: params.eventType,
        allocated: budgetRecord.allocated || 0,
        spent: (budgetRecord.spent || 0) + params.spend,
        spendHistory: newHistory,
      });
    }

    const allocated = budgetRecord.allocated || 0;
    const spent = budgetRecord.spent || 0;
    return {
      department,
      eventType: params.eventType,
      suggested,
      milestoneYears,
      allocated,
      spent,
      remaining: allocated - spent,
      overBudget: spent > allocated,
      history: (budgetRecord.spendHistory || []).slice(),
    };
  }

  // ────────────────────────────────────────────────────────────────
  // customizableGreeting
  // ────────────────────────────────────────────────────────────────

  /**
   * Produce a greeting card template with a custom personal note
   * from `sender`. The auto template is preserved and the note is
   * appended on top — nothing is overwritten.
   */
  customizableGreeting(params) {
    assertNonEmpty(params && params.eventId, 'eventId');
    assertNonEmpty(params.sender, 'sender');
    const base = this.autoCardGeneration({ eventId: params.eventId });

    if (base.sensitive) {
      return Object.assign({}, base, {
        personalNote: params.personalNote || null,
        sender: params.sender,
      });
    }

    return {
      eventId: base.eventId,
      personId: base.personId,
      eventType: base.eventType,
      sender: params.sender,
      card: {
        he: {
          title: base.card.he.title,
          body:
            (params.personalNote ? params.personalNote + '\n\n' : '') +
            base.card.he.body,
          signature: params.sender,
        },
        en: {
          title: base.card.en.title,
          body:
            (params.personalNote ? params.personalNote + '\n\n' : '') +
            base.card.en.body,
          signature: params.sender,
        },
      },
      personalNote: params.personalNote || null,
      generatedAt: this.now().toISOString(),
      automated: false,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // preferenceRespect
  // ────────────────────────────────────────────────────────────────

  /**
   * Always check before any public action. Returns the stored
   * preference record, defaulting to "public celebration allowed".
   */
  preferenceRespect(params) {
    assertNonEmpty(params && params.userId, 'userId');
    const pref = this.store.getPreference(params.userId);
    if (!pref) {
      return {
        userId: params.userId,
        publicCelebration: true,     // default opt-in
        channels: { email: true, whatsapp: true, in_app: true },
        explicit: false,
      };
    }
    return Object.assign({ explicit: true }, pref);
  }

  setPreference(userId, pref) {
    assertNonEmpty(userId, 'userId');
    return this.store.setPreference(userId, {
      userId,
      publicCelebration:
        typeof pref.publicCelebration === 'boolean' ? pref.publicCelebration : true,
      channels: pref.channels || { email: true, whatsapp: true, in_app: true },
      notes: pref.notes || null,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // excludeSensitive
  // ────────────────────────────────────────────────────────────────

  /**
   * Filter helper — given a bundle of events, return the subset that
   * should be excluded from automated handling. Also returns the
   * preferred manual action for each.
   */
  excludeSensitive(params) {
    params = params || {};
    const filterType = params.eventType || null;

    const events = this.store.listEvents().filter(e => {
      if (filterType && e.type !== filterType) return false;
      return isSensitive(e.type);
    });

    return events.map(e => ({
      eventId: e.eventId,
      personId: e.personId,
      type: e.type,
      automated: false,
      handling: {
        he: 'יצירת קשר אישית של המנהל הישיר. אין לשלוח כרטיס אוטומטי.',
        en: 'Direct manager should reach out personally. No automated card.',
      },
      suggestedActions: [
        { he: 'שיחת טלפון אישית', en: 'Personal phone call' },
        { he: 'תיאום ביקור ניחום אבלים', en: 'Coordinate shiva visit' },
        { he: 'עדכון הצוות בשקט ובכבוד', en: 'Discreetly inform the team' },
      ],
    }));
  }

  // ────────────────────────────────────────────────────────────────
  // companyMilestones
  // ────────────────────────────────────────────────────────────────

  /**
   * Return all active employees whose work anniversary falls on a
   * milestone year (1/3/5/10/15/20/25/30/35/40), along with the
   * suggested gift budget based on the milestone multiplier.
   *
   * @param {object} [params]
   * @param {Date} [params.now]
   * @param {number} [params.lookaheadDays=60]
   */
  companyMilestones(params) {
    params = params || {};
    const now = params.now ? toDate(params.now) : this.now();
    const lookahead = typeof params.lookaheadDays === 'number' ? params.lookaheadDays : 60;
    const windowEnd = addDays(startOfDay(now), lookahead);

    const out = [];
    for (const person of this.store.listPeople()) {
      if (!person.hireDate) continue;
      const hire = toDate(person.hireDate);
      // Next anniversary date (Gregorian)
      const next = nextRecurrence(EVENT_TYPES.WORK_ANNIVERSARY, hire, now, false);
      if (next.getTime() > windowEnd.getTime()) continue;
      const years = yearsSince(hire, next);
      if (MILESTONES_YEARS.indexOf(years) === -1) continue;

      const base = this.budgetDefaults[EVENT_TYPES.WORK_ANNIVERSARY];
      const suggested = Math.round(base * MILESTONE_MULTIPLIERS[years]);

      out.push({
        personId: person.personId,
        name: person.nameHe || person.nameEn || person.personId,
        department: person.department,
        hireDate: hire,
        anniversaryDate: next,
        years,
        milestone: true,
        suggestedGift: suggested,
        label: {
          he: years + ' שנות ותק',
          en: years + '-year work anniversary',
        },
      });
    }
    out.sort((a, b) => a.anniversaryDate.getTime() - b.anniversaryDate.getTime());
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  // newbornGift
  // ────────────────────────────────────────────────────────────────

  /**
   * Israeli workplace custom: company sends a gift for a new baby.
   * Records a CHILD_BIRTH event (append-only) and returns the gift
   * plan including budget and a bilingual card template.
   */
  newbornGift(params) {
    assertNonEmpty(params && params.employeeId, 'employeeId');
    assertNonEmpty(params.babyBornDate, 'babyBornDate');

    const event = this.recordEvent({
      personId: params.employeeId,
      type: EVENT_TYPES.CHILD_BIRTH,
      date: params.babyBornDate,
      notes: params.notes || 'מזל טוב — לידת ילד',
    });

    const card = this.autoCardGeneration({ eventId: event.eventId });
    const budget = this.giftBudget({
      personId: params.employeeId,
      eventType: EVENT_TYPES.CHILD_BIRTH,
    });

    return {
      eventId: event.eventId,
      employeeId: params.employeeId,
      babyBornDate: toDate(params.babyBornDate),
      custom: {
        he: 'מנהג ישראלי: מתנת לידה לעובד/ת החברה.',
        en: 'Israeli custom: the company sends a baby gift to the employee.',
      },
      card,
      budget,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // weddingCustom
  // ────────────────────────────────────────────────────────────────

  /**
   * Israeli workplace custom: company sends gift/bonus for a wedding.
   */
  weddingCustom(params) {
    assertNonEmpty(params && params.employeeId, 'employeeId');
    assertNonEmpty(params.weddingDate, 'weddingDate');

    const event = this.recordEvent({
      personId: params.employeeId,
      type: EVENT_TYPES.MARRIAGE,
      date: params.weddingDate,
      notes: params.notes || 'מזל טוב — חתונה',
    });

    const card = this.autoCardGeneration({ eventId: event.eventId });
    const budget = this.giftBudget({
      personId: params.employeeId,
      eventType: EVENT_TYPES.MARRIAGE,
    });

    return {
      eventId: event.eventId,
      employeeId: params.employeeId,
      weddingDate: toDate(params.weddingDate),
      custom: {
        he: 'מנהג ישראלי: מתנה/מעטפה מהחברה לחתונת העובד/ת.',
        en: 'Israeli custom: the company gives a wedding gift or bonus.',
      },
      card,
      budget,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // annualSummary
  // ────────────────────────────────────────────────────────────────

  /**
   * Roll-up of everything celebrated in a period.
   * @param {object} [period]
   * @param {Date|string} [period.from]
   * @param {Date|string} [period.to]
   * @param {number} [period.year]  — convenience: full calendar year
   */
  annualSummary(period) {
    period = period || {};
    let from, to;
    if (period.year) {
      from = new Date(Date.UTC(period.year, 0, 1));
      to = new Date(Date.UTC(period.year, 11, 31, 23, 59, 59));
    } else {
      from = period.from ? toDate(period.from) : new Date(Date.UTC(1970, 0, 1));
      to = period.to ? toDate(period.to) : this.now();
    }

    const events = this.store.listEvents();
    const byType = {};
    const byDepartment = {};
    let total = 0;
    let sensitive = 0;
    let optedOut = 0;
    const celebrated = [];

    for (const type of EVENT_TYPE_LIST) byType[type] = 0;

    for (const e of events) {
      const eventDate = toDate(e.date);
      if (eventDate.getTime() < from.getTime()) continue;
      if (eventDate.getTime() > to.getTime()) continue;

      total += 1;
      byType[e.type] = (byType[e.type] || 0) + 1;
      if (e.department) {
        byDepartment[e.department] = (byDepartment[e.department] || 0) + 1;
      }
      if (isSensitive(e.type)) sensitive += 1;
      if (e.status === EVENT_STATUS.OPTED_OUT) optedOut += 1;
      if (e.status === EVENT_STATUS.CELEBRATED) {
        celebrated.push({
          eventId: e.eventId,
          personId: e.personId,
          type: e.type,
          date: eventDate,
        });
      }
    }

    const budgets = this.store.listBudgets ? this.store.listBudgets() : [];
    const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0), 0);
    const totalAllocated = budgets.reduce((sum, b) => sum + (b.allocated || 0), 0);

    return {
      period: { from, to },
      total,
      byType,
      byDepartment,
      sensitive,
      optedOut,
      celebrated,
      budget: {
        totalAllocated,
        totalSpent,
        totalRemaining: totalAllocated - totalSpent,
      },
      summary: {
        he: 'סיכום ' + total + ' אירועי חיים בתקופה',
        en: total + ' life events recorded in period',
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // calendarIntegration
  // ────────────────────────────────────────────────────────────────

  /**
   * Emit a list of calendar-event descriptors (ICS-shaped) for the
   * given employee's upcoming events. The caller can feed these
   * into Google Calendar / Outlook / ICS export.
   */
  calendarIntegration(params) {
    assertNonEmpty(params && params.employeeId, 'employeeId');
    const now = params.now ? toDate(params.now) : this.now();
    const lookahead = typeof params.lookaheadDays === 'number'
      ? params.lookaheadDays
      : 365;

    const person = this.store.getPerson(params.employeeId);
    const events = this.store.listEvents().filter(e => e.personId === params.employeeId);
    const out = [];

    for (const e of events) {
      if (e.status === EVENT_STATUS.SUPERSEDED) continue;
      if (isSensitive(e.type)) continue; // never auto-publish

      // preference respect
      const pref = this.store.getPreference(params.employeeId);
      if (pref && pref.publicCelebration === false) continue;

      const next = nextRecurrence(e.type, e.date, now, e.lunar);
      if (daysBetween(now, next) > lookahead) continue;
      if (next.getTime() < startOfDay(now).getTime()) continue;

      const label = LABELS[e.type];
      const personName = person
        ? (person.nameHe || person.nameEn || person.personId)
        : e.personId;

      const cal = {
        uid: e.eventId + '@life-events.techno-kol',
        employeeId: params.employeeId,
        eventId: e.eventId,
        type: e.type,
        start: next,
        allDay: true,
        lunar: !!e.lunar,
        summary: {
          he: label.he + ' — ' + personName,
          en: label.en + ' — ' + personName,
        },
        description: {
          he:
            'תזכורת מ-Techno-Kol Uzi ERP.' +
            (e.lunar ? ' (תאריך עברי)' : ''),
          en:
            'Reminder from Techno-Kol Uzi ERP.' +
            (e.lunar ? ' (Hebrew calendar date)' : ''),
        },
        visibility: 'team',
      };
      this.store.appendCalendarEvent(cal);
      out.push(cal);
    }

    out.sort((a, b) => a.start.getTime() - b.start.getTime());
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  // Audit / read helpers
  // ────────────────────────────────────────────────────────────────

  getEvent(eventId) {
    return this.store.getEvent(eventId);
  }

  listEvents(filter) {
    let out = this.store.listEvents();
    if (filter && filter.personId) {
      out = out.filter(e => e.personId === filter.personId);
    }
    if (filter && filter.type) {
      out = out.filter(e => e.type === filter.type);
    }
    return out;
  }

  markCelebrated(eventId, note) {
    return this.store.updateEventStatus(eventId, EVENT_STATUS.CELEBRATED, note || null);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  LifeEvents,
  EVENT_TYPES,
  EVENT_TYPE_LIST,
  EVENT_STATUS,
  SENSITIVE_TYPES,
  MILESTONES_YEARS,
  MILESTONE_MULTIPLIERS,
  DEFAULT_BUDGETS,
  LABELS,
  CARD_TEMPLATES,
  HebrewCalendar,
  createMemoryStore,
  // internals exposed for tests
  _internals: {
    nextRecurrence,
    yearsSince,
    isSensitive,
    isValidEventType,
    startOfDay,
    addDays,
    daysBetween,
    hebrewToAbsolute,
    absoluteToHebrew,
    gregorianToAbsolute,
    absoluteToGregorian,
    isHebrewLeapYear,
    hebrewMonthLength,
  },
};
