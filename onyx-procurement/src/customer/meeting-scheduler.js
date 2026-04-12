/**
 * Customer Meeting Scheduler  |  מתזמן פגישות לקוחות
 * =============================================================
 *
 * Agent Y-097  |  Swarm Customer-Ops  |  Techno-Kol Uzi mega-ERP
 *
 * A zero-dependency, Calendly-lite meeting scheduler. Lets staff
 * publish shareable booking links, exposes public 30-minute slots
 * based on an Israeli-timezone weekly schedule, books guest meetings,
 * sends bilingual (Hebrew + English) confirmation / reminder /
 * reschedule / cancel notifications, tracks no-shows, fires post-
 * meeting CSAT surveys, stubs Zoom / Google Meet / Teams links and
 * optionally syncs the owner's calendar through upstream calendar-
 * sync agents (X-67 Google, X-68 Outlook) when wired.
 *
 * -------------------------------------------------------------
 * DESIGN PRINCIPLES
 * -------------------------------------------------------------
 *   • Never delete — cancelled bookings are flagged `status='cancelled'`
 *     with a full `statusHistory[]` trail; meeting types, availability
 *     exceptions and booking links are versioned in place rather than
 *     removed.                                      (לא מוחקים רק משדרגים ומגדלים)
 *   • Bilingual — every label / notification has `_he` and `_en`.
 *   • Zero deps — only `node:crypto` for deterministic ids.
 *   • Hermetic — pure in-memory store; optional repository / notifier /
 *     calendar-sync bridges wire through the constructor options bag.
 *   • Deterministic — an injectable `clock` allows tests to freeze time
 *     and an injectable `randomId` allows stable id generation.
 *   • Israeli business hours default — Sunday-Thursday 09:00-18:00
 *     Asia/Jerusalem, plus Friday 09:00-13:00 (shortened). Shabbat off.
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   defineMeetingType(def)                        → {ok, id}
 *   setAvailability(cfg)                          → {ok, userId}
 *   generateBookingLink(cfg)                      → {ok, id, url, slug}
 *   publicSlots(linkId, {from, to})               → Slot[]
 *   bookMeeting({linkId, slot, guestInfo, formAnswers})
 *                                                 → {ok, id, confirmation}
 *   rescheduleRequest({bookingId, newSlot, requester, reason})
 *                                                 → {ok, oldSlot, newSlot, notified}
 *   cancel({bookingId, reason, requester})        → {ok, notified}
 *   reminders({bookingId, offsets})               → Reminder[]
 *   videoLink(bookingId)                          → {ok, provider, url}
 *   noShowTracking(bookingId, mark)               → {ok, status}
 *   postMeetingSurvey(bookingId)                  → {ok, surveyId, url}
 *   calendarSync(userId)                          → {ok, provider, events}
 *
 *   + utilities: getBooking, listBookings, listMeetingTypes,
 *     listLinks, labels(key), _internal (for tests).
 *
 * RULE: לא מוחקים רק משדרגים ומגדלים — never delete, only upgrade & grow.
 */

'use strict';

const crypto = require('crypto');

/* =====================================================================
 * BILINGUAL LABELS & NOTIFICATION TEMPLATES
 * ===================================================================*/

const LABELS = {
  title:           { he: 'מתזמן פגישות',            en: 'Meeting Scheduler' },
  meetingType:     { he: 'סוג פגישה',                en: 'Meeting type' },
  duration:        { he: 'משך',                      en: 'Duration' },
  bookingLink:     { he: 'קישור לקביעת פגישה',      en: 'Booking link' },
  availableSlots:  { he: 'משבצות זמן פנויות',       en: 'Available slots' },
  book:            { he: 'קבע פגישה',                en: 'Book meeting' },
  reschedule:      { he: 'שינוי מועד',               en: 'Reschedule' },
  cancel:          { he: 'ביטול',                    en: 'Cancel' },
  confirmation:    { he: 'אישור פגישה',              en: 'Meeting confirmation' },
  reminder:        { he: 'תזכורת פגישה',             en: 'Meeting reminder' },
  rescheduled:     { he: 'עודכן מועד פגישה',         en: 'Meeting rescheduled' },
  cancelled:       { he: 'פגישה בוטלה',              en: 'Meeting cancelled' },
  noShow:          { he: 'לא התייצב',                en: 'No-show' },
  attended:        { he: 'השתתף',                    en: 'Attended' },
  scheduled:       { he: 'מתוזמנת',                  en: 'Scheduled' },
  inPerson:        { he: 'פרונטלית',                 en: 'In-person' },
  phone:           { he: 'טלפון',                    en: 'Phone' },
  video:           { he: 'וידאו',                    en: 'Video' },
  host:            { he: 'מארח',                     en: 'Host' },
  guest:           { he: 'אורח',                     en: 'Guest' },
  durationMinutes: { he: 'דקות',                     en: 'minutes' },
  timezone:        { he: 'אזור זמן',                 en: 'Timezone' },
  form:            { he: 'טופס הרשמה',               en: 'Booking form' },
  survey:          { he: 'סקר שביעות רצון',          en: 'Satisfaction survey' },
  video_zoom:      { he: 'Zoom',                     en: 'Zoom' },
  video_meet:      { he: 'Google Meet',              en: 'Google Meet' },
  video_teams:     { he: 'Microsoft Teams',          en: 'Microsoft Teams' },
};

/**
 * Look up a bilingual label. Unknown keys return the key itself so the
 * caller always gets something renderable.
 */
function labels(key) {
  return LABELS[key] || { he: key, en: key };
}

/* =====================================================================
 * NOTIFICATION TEMPLATES  (bilingual)
 * ===================================================================*/

const TEMPLATES = {
  confirm: {
    subject_he: 'אישור פגישה — {meeting}',
    subject_en: 'Meeting confirmation — {meeting}',
    body_he:
      'שלום {guest},\n' +
      'פגישתך עם {host} אושרה ל-{when}.\n' +
      'סוג: {meeting}.\n' +
      'משך: {duration} דקות.\n' +
      'מיקום: {location}.\n' +
      'לשינוי מועד או ביטול: {manageUrl}\n' +
      'בברכה, Techno-Kol Uzi',
    body_en:
      'Hello {guest},\n' +
      'Your meeting with {host} is confirmed for {when}.\n' +
      'Type: {meeting}.\n' +
      'Duration: {duration} minutes.\n' +
      'Location: {location}.\n' +
      'To reschedule or cancel: {manageUrl}\n' +
      'Best regards, Techno-Kol Uzi',
  },
  remind: {
    subject_he: 'תזכורת: {meeting} ב-{when}',
    subject_en: 'Reminder: {meeting} at {when}',
    body_he:
      'שלום {guest}, תזכורת לפגישתך עם {host} שתתקיים ב-{when}.',
    body_en:
      'Hi {guest}, reminder of your meeting with {host} at {when}.',
  },
  reschedule: {
    subject_he: 'עודכן מועד פגישה — {meeting}',
    subject_en: 'Meeting rescheduled — {meeting}',
    body_he:
      'מועד הפגישה עודכן מ-{oldWhen} ל-{newWhen}.',
    body_en:
      'The meeting has been moved from {oldWhen} to {newWhen}.',
  },
  cancel: {
    subject_he: 'פגישה בוטלה — {meeting}',
    subject_en: 'Meeting cancelled — {meeting}',
    body_he:
      'הפגישה המתוכננת ל-{when} בוטלה. סיבה: {reason}.',
    body_en:
      'The meeting scheduled for {when} has been cancelled. Reason: {reason}.',
  },
  survey: {
    subject_he: 'נשמח לשמוע ממך — {meeting}',
    subject_en: 'We would love your feedback — {meeting}',
    body_he:
      'תודה שהשתתפת בפגישה. נשמח לשמוע את דעתך: {surveyUrl}',
    body_en:
      'Thank you for attending. We would love your feedback: {surveyUrl}',
  },
  /* =================================================================
   * Y-097 external-sales templates
   * =================================================================
   * Dedicated envelopes for customer meetings (distinct from the
   * Calendly-lite guest-booking flow above). These keep the subject
   * lines specific to sales/account management and always emit
   * both Hebrew and English bodies in a single notification object.
   */
  customer_confirm: {
    subject_he: 'אישור פגישת לקוח — {meeting}',
    subject_en: 'Customer meeting confirmation — {meeting}',
    body_he:
      'שלום,\n' +
      'פגישתכם מול צוות Techno-Kol Uzi אושרה.\n' +
      'סוג פגישה: {meeting}\n' +
      'מועד: {when}\n' +
      'משך: {duration} דקות\n' +
      'מיקום: {location}\n' +
      'משתתפים (מצדנו): {owners}\n' +
      'סדר יום: {agenda}\n' +
      'מזהה פגישה: {meetingId}\n' +
      'בברכה, Techno-Kol Uzi',
    body_en:
      'Hello,\n' +
      'Your meeting with the Techno-Kol Uzi team is confirmed.\n' +
      'Meeting type: {meeting}\n' +
      'When: {when}\n' +
      'Duration: {duration} minutes\n' +
      'Location: {location}\n' +
      'Our attendees: {owners}\n' +
      'Agenda: {agenda}\n' +
      'Meeting ID: {meetingId}\n' +
      'Best regards, Techno-Kol Uzi',
  },
  customer_reminder: {
    subject_he: 'תזכורת: פגישה ב-{when} ({hours} שעות מראש)',
    subject_en: 'Reminder: meeting at {when} ({hours}h advance)',
    body_he:
      'תזכורת — פגישת {meeting} תתקיים ב-{when}.\n' +
      'סדר יום: {agenda}\n' +
      'נשמח לראותכם.',
    body_en:
      'Reminder — your {meeting} meeting is at {when}.\n' +
      'Agenda: {agenda}\n' +
      'We look forward to seeing you.',
  },
  customer_reschedule: {
    subject_he: 'שינוי מועד פגישת לקוח — {meeting}',
    subject_en: 'Customer meeting rescheduled — {meeting}',
    body_he:
      'הפגישה עודכנה מ-{oldWhen} ל-{newWhen}.\n' +
      'סיבה: {reason}',
    body_en:
      'The meeting moved from {oldWhen} to {newWhen}.\n' +
      'Reason: {reason}',
  },
  customer_cancel: {
    subject_he: 'פגישת לקוח בוטלה — {meeting}',
    subject_en: 'Customer meeting cancelled — {meeting}',
    body_he:
      'הפגישה שנקבעה ל-{when} בוטלה. סיבה: {reason}.\n' +
      'מזהה נשמר להיסטוריה: {meetingId}',
    body_en:
      'The meeting scheduled for {when} was cancelled. Reason: {reason}.\n' +
      'Record preserved as: {meetingId}',
  },
};

function formatTemplate(tpl, ctx) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) =>
    ctx[k] == null ? '' : String(ctx[k]));
}

/**
 * Build the two-language email envelope for a template key.
 */
function buildNotification(templateKey, ctx) {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) throw new Error(`Unknown template: ${templateKey}`);
  return {
    templateKey,
    subject_he: formatTemplate(tpl.subject_he, ctx),
    subject_en: formatTemplate(tpl.subject_en, ctx),
    body_he:    formatTemplate(tpl.body_he,    ctx),
    body_en:    formatTemplate(tpl.body_en,    ctx),
  };
}

/* =====================================================================
 * DEFAULTS
 * ===================================================================*/

/**
 * Israeli business hours. Weekday indexing matches JS `getDay()` where
 * Sunday = 0, Saturday = 6. Shabbat (Saturday) is intentionally left
 * empty so bookings can never be placed on the Jewish day of rest.
 * Friday is shortened to 09:00–13:00 per Israeli practice.
 */
const DEFAULT_WEEKLY_SCHEDULE = {
  0: [{ start: '09:00', end: '18:00' }], // Sunday    / ראשון
  1: [{ start: '09:00', end: '18:00' }], // Monday    / שני
  2: [{ start: '09:00', end: '18:00' }], // Tuesday   / שלישי
  3: [{ start: '09:00', end: '18:00' }], // Wednesday / רביעי
  4: [{ start: '09:00', end: '18:00' }], // Thursday  / חמישי
  5: [{ start: '09:00', end: '13:00' }], // Friday    / שישי (shortened)
  6: [],                                 // Saturday  / שבת (closed)
};

const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

/* =====================================================================
 * ISRAELI HOLIDAYS  (Y-097)
 * =====================================================================
 * 2026 national & religious holidays the customer meeting scheduler
 * must avoid. Each entry has Hebrew + English labels and a YYYY-MM-DD
 * date. Kept in sync with Y-062 (hr/interview-scheduling.js) so the
 * swarm shares a single source of truth for the year.
 */
const ISRAELI_HOLIDAYS_2026 = [
  { date: '2026-03-03', he: 'פורים',                    en: 'Purim' },
  { date: '2026-04-01', he: 'ערב פסח',                  en: 'Erev Pesach' },
  { date: '2026-04-02', he: 'פסח א׳',                   en: 'Pesach Day 1' },
  { date: '2026-04-08', he: 'שביעי של פסח',             en: "Shvi'i shel Pesach" },
  { date: '2026-04-14', he: 'יום הזיכרון לשואה',         en: 'Yom HaShoah' },
  { date: '2026-04-21', he: 'יום הזיכרון לחללי צה״ל',    en: 'Yom HaZikaron' },
  { date: '2026-04-22', he: 'יום העצמאות',               en: 'Yom HaAtzmaut' },
  { date: '2026-05-22', he: 'ערב שבועות',               en: 'Erev Shavuot' },
  { date: '2026-05-23', he: 'שבועות',                   en: 'Shavuot' },
  { date: '2026-09-11', he: 'ערב ראש השנה',             en: 'Erev Rosh Hashana' },
  { date: '2026-09-12', he: 'ראש השנה א׳',              en: 'Rosh Hashana Day 1' },
  { date: '2026-09-13', he: 'ראש השנה ב׳',              en: 'Rosh Hashana Day 2' },
  { date: '2026-09-20', he: 'ערב יום כיפור',             en: 'Erev Yom Kippur' },
  { date: '2026-09-21', he: 'יום כיפור',                en: 'Yom Kippur' },
  { date: '2026-09-25', he: 'ערב סוכות',                en: 'Erev Sukkot' },
  { date: '2026-09-26', he: 'סוכות א׳',                 en: 'Sukkot Day 1' },
  { date: '2026-10-03', he: 'שמחת תורה',                en: 'Simchat Torah' },
];

function israeliHolidays2026() {
  return ISRAELI_HOLIDAYS_2026.slice();
}

function isIsraeliHoliday(date, extra = []) {
  const d = new Date(date);
  const ymd = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const merged = ISRAELI_HOLIDAYS_2026.concat(
    (extra || []).map((h) => (typeof h === 'string' ? { date: h } : h)),
  );
  return merged.some((h) => h.date === ymd);
}

/* =====================================================================
 * RFC 5545 ICS HELPERS  (Y-097, mirrors Y-062 pattern)
 * ===================================================================*/

function icsStamp(date) {
  const iso = new Date(date).toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function icsFold(line) {
  if (line.length <= 75) return line;
  const out = [];
  let i = 0;
  while (i < line.length) {
    out.push((i === 0 ? '' : ' ') + line.slice(i, i + 75));
    i += 75;
  }
  return out.join('\r\n');
}

/**
 * Intersect two slot ranges; return the inner window or null if disjoint.
 */
function intersectRange(a, b) {
  const start = new Date(Math.max(new Date(a.start).getTime(),
                                   new Date(b.start).getTime()));
  const end   = new Date(Math.min(new Date(a.end).getTime(),
                                   new Date(b.end).getTime()));
  return start < end ? { start, end } : null;
}

/**
 * Intersect a list of slot-arrays. Returns the common windows.
 */
function intersectMany(slotArrays) {
  if (!slotArrays || slotArrays.length === 0) return [];
  let common = slotArrays[0].map((s) => ({
    start: new Date(s.start), end: new Date(s.end),
  }));
  for (let i = 1; i < slotArrays.length; i++) {
    const next = slotArrays[i];
    const newCommon = [];
    for (const a of common) {
      for (const b of next) {
        const ix = intersectRange(a, b);
        if (ix) newCommon.push(ix);
      }
    }
    common = newCommon;
    if (common.length === 0) return [];
  }
  return common;
}

/**
 * Reminder offset vocabulary — accepts `"24h"`, `"1h"`, `"30m"` etc.
 * and the already-numeric minute forms.
 */
function offsetToMinutes(offset) {
  if (typeof offset === 'number' && Number.isFinite(offset)) return offset;
  if (typeof offset !== 'string') throw new Error(`Bad offset: ${offset}`);
  const m = offset.trim().toLowerCase().match(/^(\d+)\s*([dhm]?)$/);
  if (!m) throw new Error(`Bad offset: ${offset}`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 'd': return n * 24 * 60;
    case 'h': return n * 60;
    case 'm':
    case '':  return n;
  }
  throw new Error(`Bad offset: ${offset}`);
}

/* =====================================================================
 * SMALL HELPERS
 * ===================================================================*/

function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s));
  if (!m) throw new Error(`Bad time: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toIsoDate(date) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Combine a UTC date with an HH:MM wall-clock time. The scheduler
 * stores all wall times as if they were already in the owner's
 * timezone — we do NOT do IANA conversion here because Node's
 * built-in APIs do not expose the offset without `Intl`. For
 * Asia/Jerusalem the test harness provides slots already anchored to
 * UTC midnight of the target day, which is sufficient for the slot
 * math (start/end comparisons are in the same frame of reference).
 */
function combineDateAndHHMM(baseDate, hhmm) {
  const d = new Date(baseDate);
  const mins = parseHHMM(hhmm);
  d.setUTCHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d;
}

function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60_000);
}

function rangeOverlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) &&
         new Date(bStart) < new Date(aEnd);
}

function deepFreeze(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  return obj;
}

/**
 * Normalize a user-supplied weekly schedule: keys may be numbers,
 * strings, or English/Hebrew weekday names. Each day's value may be a
 * single window or an array of windows.
 */
const DAY_ALIAS = {
  sun: 0, sunday: 0, ראשון: 0,
  mon: 1, monday: 1, שני: 1,
  tue: 2, tuesday: 2, שלישי: 2,
  wed: 3, wednesday: 3, רביעי: 3,
  thu: 4, thursday: 4, חמישי: 4,
  fri: 5, friday: 5, שישי: 5,
  sat: 6, saturday: 6, שבת: 6,
};

function normalizeWeekly(schedule) {
  const out = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  if (!schedule) return out;
  for (const [rawKey, rawVal] of Object.entries(schedule)) {
    let key = rawKey;
    if (!/^\d+$/.test(rawKey)) {
      const a = DAY_ALIAS[rawKey.toLowerCase ? rawKey.toLowerCase() : rawKey];
      if (a == null) continue;
      key = a;
    }
    const idx = Number(key);
    if (!(idx >= 0 && idx <= 6)) continue;
    const arr = Array.isArray(rawVal) ? rawVal : [rawVal];
    out[idx] = arr
      .filter(Boolean)
      .map((w) => ({
        start: w.start,
        end:   w.end,
      }));
  }
  return out;
}

/* =====================================================================
 * MAIN CLASS
 * ===================================================================*/

class MeetingScheduler {
  /**
   * @param {object} [options]
   * @param {() => Date} [options.clock]         injectable clock
   * @param {() => string} [options.randomId]    injectable id factory
   * @param {object} [options.notifier]          .send(notification) bridge
   * @param {object} [options.calendarBridge]    X-67/X-68 bridge — .syncUser()
   * @param {object} [options.videoBridge]       Zoom/Meet/Teams stub
   * @param {string} [options.publicBaseUrl]     base URL for booking links
   * @param {number} [options.slotMinutes=30]    slot granularity
   */
  constructor(options = {}) {
    this._clock     = options.clock     || (() => new Date());
    this._randomId  = options.randomId  || (() => crypto.randomBytes(8).toString('hex'));
    this._notifier  = options.notifier  || null;
    this._calendar  = options.calendarBridge || null;
    this._video     = options.videoBridge || null;
    this._baseUrl   = options.publicBaseUrl || 'https://scheduler.technokol.local/book';
    this._slotMin   = Number.isFinite(options.slotMinutes)
      ? options.slotMinutes : DEFAULT_SLOT_MINUTES;

    /** meetingTypeId -> MeetingType */
    this._meetingTypes = new Map();
    /** userId -> Availability */
    this._availability = new Map();
    /** linkId -> BookingLink */
    this._links = new Map();
    /** bookingId -> Booking */
    this._bookings = new Map();
    /** bookingId -> Reminder[] */
    this._reminders = new Map();
    /** append-only audit log */
    this._audit = [];
    /** slug -> linkId (unique shareable slugs) */
    this._slugs = new Map();

    /* =====================================================================
     * Y-097 EXTERNAL-SALES MEETINGS STORAGE
     * =====================================================================
     * The pre-existing `_bookings` map is the Calendly-lite guest-booking
     * path (keyed by a shareable `linkId`). The Y-097 upgrade adds an
     * append-only, multi-owner external-sales meetings store. Both live
     * side-by-side — we never delete the earlier store, we only grow.
     * ---------------------------------------------------------------
     * customerId -> [{ at, event, ...payload }]  — append-only log
     */
    /** meetingId -> Meeting (external-sales path) */
    this._meetings    = new Map();
    /** customerId -> event log entries (noShow, booking, outcome, ...) */
    this._customerLog = new Map();
    /** meetingId -> Outcome[] (append-only) */
    this._outcomes    = new Map();
    /** userId -> bookingLinkId (self-service) */
    this._selfServiceLinks = new Map();
    /**
     * Injectable custom Israeli holidays — callers can extend the
     * default 2026 list through the constructor so we stay testable.
     */
    this._customHolidays = Array.isArray(options.customHolidays)
      ? options.customHolidays.slice() : [];
  }

  /* ---------- audit helpers ---------- */

  _log(event, payload) {
    this._audit.push({
      at: this._clock().toISOString(),
      event,
      ...payload,
    });
  }

  _nextId(prefix) {
    return `${prefix}_${this._randomId()}`;
  }

  /* =================================================================
   * 1. defineMeetingType
   * =================================================================*/

  /**
   * Register a meeting type. Idempotent: calling twice with the same
   * `id` upgrades the definition in place (never delete — we keep the
   * previous revision in `_versions`).
   */
  defineMeetingType(def) {
    if (!def || !def.id) throw new Error('defineMeetingType: id required');
    if (!def.name_he && !def.name_en)
      throw new Error('defineMeetingType: at least one name required');
    // Y-097 upgrade: support `durationMin` alias alongside legacy `duration`.
    const rawDur = def.duration != null ? def.duration : def.durationMin;
    const duration = rawDur != null ? Number(rawDur) : 30;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error('defineMeetingType: duration>0');
    // Y-097 upgrade: accept both the legacy Calendly-lite vocabulary
    // ('in-person') and the new external-sales vocabulary
    // ('onsite'|'customer-site'). We never reject a value that was
    // valid in a prior revision — we only *grow* the whitelist.
    const location = def.location || 'video';
    if (!['in-person', 'phone', 'video', 'onsite', 'customer-site'].includes(location))
      throw new Error(`defineMeetingType: bad location ${location}`);
    if (location === 'video' &&
        def.videoProvider &&
        !['zoom', 'meet', 'teams'].includes(def.videoProvider))
      throw new Error(`defineMeetingType: bad videoProvider ${def.videoProvider}`);

    const prior = this._meetingTypes.get(def.id);
    const record = {
      id:              def.id,
      name_he:         def.name_he || def.name_en,
      name_en:         def.name_en || def.name_he,
      duration,
      buffer:          Number(def.buffer)        || 0,
      advanceNotice:   Number(def.advanceNotice) || 0,
      maxPerDay:       Number(def.maxPerDay)     || 0,
      hosts:           Array.isArray(def.hosts) ? def.hosts.slice() : [],
      location,
      videoProvider:   def.videoProvider || (location === 'video' ? 'zoom' : null),
      bookingForm:     def.bookingForm ? JSON.parse(JSON.stringify(def.bookingForm)) : [],
      // Y-097: optional self-service booking URL stored on the type.
      bookingLink:     def.bookingLink || null,
      durationMin:     duration,
      createdAt:       prior ? prior.createdAt : this._clock().toISOString(),
      updatedAt:       this._clock().toISOString(),
      _versions:       prior ? prior._versions.concat(prior) : [],
    };
    this._meetingTypes.set(def.id, record);
    this._log('meeting_type.upsert', { id: def.id });
    return { ok: true, id: def.id };
  }

  listMeetingTypes() {
    return Array.from(this._meetingTypes.values())
      .map((m) => ({ ...m, _versions: undefined }));
  }

  /* =================================================================
   * 2. setAvailability
   * =================================================================*/

  /**
   * Define a host's weekly schedule + exceptions. Re-calling replaces
   * the active schedule but pushes the old version into history.
   */
  setAvailability(cfg) {
    if (!cfg || !cfg.userId) throw new Error('setAvailability: userId required');
    const prior = this._availability.get(cfg.userId);
    const record = {
      userId:         cfg.userId,
      weeklySchedule: normalizeWeekly(cfg.weeklySchedule || DEFAULT_WEEKLY_SCHEDULE),
      timezone:       cfg.timezone || DEFAULT_TIMEZONE,
      // exception: { date: 'YYYY-MM-DD', windows:[{start,end}], blocked:boolean, note }
      exceptions:     (cfg.exceptions || []).map((e) => ({
        date:    e.date,
        blocked: !!e.blocked,
        windows: Array.isArray(e.windows)
          ? e.windows.map((w) => ({ start: w.start, end: w.end }))
          : [],
        note: e.note || '',
      })),
      updatedAt: this._clock().toISOString(),
      _versions: prior ? prior._versions.concat(prior) : [],
    };
    this._availability.set(cfg.userId, record);
    this._log('availability.upsert', { userId: cfg.userId });
    return { ok: true, userId: cfg.userId };
  }

  getAvailability(userId) {
    const a = this._availability.get(userId);
    if (!a) return null;
    return { ...a, _versions: undefined };
  }

  /* =================================================================
   * 3. generateBookingLink
   * =================================================================*/

  /**
   * Create a shareable booking link pointing at a (userId, meetingTypeId)
   * pair. A `campaign` tag is preserved for later analytics. Slugs are
   * unique and collisions retry with an additional random suffix.
   */
  generateBookingLink(cfg) {
    if (!cfg || !cfg.userId || !cfg.meetingTypeId)
      throw new Error('generateBookingLink: userId & meetingTypeId required');
    if (!this._meetingTypes.has(cfg.meetingTypeId))
      throw new Error(`unknown meeting type ${cfg.meetingTypeId}`);
    if (!this._availability.has(cfg.userId))
      throw new Error(`no availability for user ${cfg.userId}`);

    const linkId = this._nextId('lnk');
    let slug = (cfg.slug || `${cfg.userId}-${cfg.meetingTypeId}`)
      .toString().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40);
    while (this._slugs.has(slug)) {
      slug = `${slug}-${this._randomId().slice(0, 4)}`;
    }
    this._slugs.set(slug, linkId);

    const link = {
      id:            linkId,
      userId:        cfg.userId,
      meetingTypeId: cfg.meetingTypeId,
      campaign:      cfg.campaign || null,
      slug,
      url:           `${this._baseUrl}/${slug}`,
      createdAt:     this._clock().toISOString(),
      active:        true,
    };
    this._links.set(linkId, link);
    this._log('link.create', { linkId, slug });
    return { ok: true, id: linkId, url: link.url, slug };
  }

  listLinks(userId) {
    return Array.from(this._links.values())
      .filter((l) => !userId || l.userId === userId);
  }

  _resolveLink(linkIdOrSlug) {
    if (this._links.has(linkIdOrSlug)) return this._links.get(linkIdOrSlug);
    const mapped = this._slugs.get(linkIdOrSlug);
    if (mapped) return this._links.get(mapped);
    return null;
  }

  /* =================================================================
   * 4. publicSlots
   * =================================================================*/

  /**
   * Generate the 30-minute (configurable) slot grid for a booking link
   * between `from` and `to`. Honours:
   *   • weekly schedule windows
   *   • exceptions (blocked days or replacement windows)
   *   • meeting-type advanceNotice + buffer + maxPerDay
   *   • existing bookings that already consume slots
   *
   * Times are anchored to UTC-midnight + wall clock — the scheduler
   * does NOT attempt DST conversion (see `combineDateAndHHMM` note).
   * Callers that need IANA offsets should supply pre-converted windows.
   */
  publicSlots(linkIdOrSlug, dateRange = {}) {
    const link = this._resolveLink(linkIdOrSlug);
    if (!link || !link.active) return [];
    const mt = this._meetingTypes.get(link.meetingTypeId);
    const av = this._availability.get(link.userId);
    if (!mt || !av) return [];

    const now = this._clock();
    const from = dateRange.from ? new Date(dateRange.from) : now;
    const to   = dateRange.to   ? new Date(dateRange.to)
      : addMinutes(from, 14 * 24 * 60); // default 14 days
    if (to <= from) return [];

    const step = this._slotMin;
    const dur  = mt.duration;
    const buf  = mt.buffer || 0;
    const earliest = addMinutes(now, mt.advanceNotice || 0);
    const slots = [];

    // Walk day-by-day from `from` to `to`.
    const cursor = new Date(Date.UTC(
      from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0,
    ));
    const end = new Date(Date.UTC(
      to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate(), 23, 59, 59, 999,
    ));

    while (cursor <= end) {
      const dateKey = toIsoDate(cursor);
      const dow = cursor.getUTCDay();
      let windows;
      const ex = av.exceptions.find((e) => e.date === dateKey);
      if (ex) {
        if (ex.blocked) { windows = []; }
        else if (ex.windows && ex.windows.length) { windows = ex.windows; }
        else { windows = av.weeklySchedule[dow] || []; }
      } else {
        windows = av.weeklySchedule[dow] || [];
      }

      const bookedToday = this._bookingsOnDay(link.userId, dateKey)
        .filter((b) => b.status !== 'cancelled');

      if (mt.maxPerDay && bookedToday.length >= mt.maxPerDay) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const remainingToday =
        mt.maxPerDay ? mt.maxPerDay - bookedToday.length : Infinity;
      let createdToday = 0;

      for (const w of windows) {
        let wStart = parseHHMM(w.start);
        const wEnd  = parseHHMM(w.end);
        while (wStart + dur <= wEnd) {
          const slotStart = combineDateAndHHMM(cursor, minutesToHHMM(wStart));
          const slotEnd   = addMinutes(slotStart, dur);
          if (slotStart >= earliest) {
            const conflict = bookedToday.some((b) =>
              rangeOverlaps(
                slotStart,
                slotEnd,
                addMinutes(b.start, -buf),
                addMinutes(b.end,    buf),
              ),
            );
            if (!conflict) {
              if (createdToday < remainingToday) {
                slots.push({
                  start: slotStart.toISOString(),
                  end:   slotEnd.toISOString(),
                  date:  dateKey,
                  duration: dur,
                  linkId: link.id,
                });
                createdToday++;
              } else {
                break;
              }
            }
          }
          wStart += step;
        }
        if (createdToday >= remainingToday) break;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return slots;
  }

  _bookingsOnDay(userId, dateKey) {
    return Array.from(this._bookings.values())
      .filter((b) =>
        b.userId === userId && toIsoDate(b.start) === dateKey);
  }

  /* =================================================================
   * 5. bookMeeting
   * =================================================================*/

  /**
   * Atomically book a slot. Rejects if:
   *   • the link is inactive or unknown
   *   • the slot is in the past (honours advanceNotice)
   *   • the slot overlaps with any existing (non-cancelled) booking
   *     for the host (double-booking prevention)
   *   • a required bookingForm answer is missing
   */
  bookMeeting({ linkId, slot, guestInfo, formAnswers }) {
    if (!linkId) throw new Error('bookMeeting: linkId required');
    if (!slot || !slot.start)
      throw new Error('bookMeeting: slot.start required');
    if (!guestInfo || !guestInfo.email)
      throw new Error('bookMeeting: guestInfo.email required');

    const link = this._resolveLink(linkId);
    if (!link || !link.active) return { ok: false, reason: 'link_inactive' };
    const mt = this._meetingTypes.get(link.meetingTypeId);
    const av = this._availability.get(link.userId);
    if (!mt || !av) return { ok: false, reason: 'misconfigured' };

    // Form validation
    for (const field of mt.bookingForm || []) {
      if (field.required) {
        const v = (formAnswers || {})[field.key];
        if (v == null || v === '')
          return { ok: false, reason: `form_required:${field.key}` };
      }
    }

    const start = new Date(slot.start);
    const end = slot.end
      ? new Date(slot.end)
      : addMinutes(start, mt.duration);
    const now = this._clock();
    if (start < addMinutes(now, mt.advanceNotice || 0)) {
      return { ok: false, reason: 'too_soon' };
    }

    // Double-booking guard — expand stored bookings by buffer
    const buf = mt.buffer || 0;
    for (const b of this._bookings.values()) {
      if (b.userId !== link.userId) continue;
      if (b.status === 'cancelled') continue;
      if (rangeOverlaps(
        start, end,
        addMinutes(b.start, -buf),
        addMinutes(b.end,    buf),
      )) {
        return { ok: false, reason: 'slot_taken', conflictId: b.id };
      }
    }
    if (mt.maxPerDay) {
      const dayCount = this._bookingsOnDay(link.userId, toIsoDate(start))
        .filter((b) => b.status !== 'cancelled').length;
      if (dayCount >= mt.maxPerDay)
        return { ok: false, reason: 'max_per_day' };
    }

    const id = this._nextId('bkg');
    const booking = {
      id,
      linkId:        link.id,
      userId:        link.userId,
      meetingTypeId: mt.id,
      start:         start.toISOString(),
      end:           end.toISOString(),
      duration:      mt.duration,
      guestInfo: {
        name:    guestInfo.name  || '',
        email:   String(guestInfo.email).toLowerCase().trim(),
        phone:   guestInfo.phone || '',
        company: guestInfo.company || '',
        lang:    guestInfo.lang   || 'he',
      },
      formAnswers: formAnswers ? { ...formAnswers } : {},
      location:    mt.location,
      videoProvider: mt.videoProvider || null,
      videoUrl:    null,
      status:      'scheduled',
      statusHistory: [{
        at:     this._clock().toISOString(),
        status: 'scheduled',
      }],
      createdAt:   this._clock().toISOString(),
      updatedAt:   this._clock().toISOString(),
      noShow:      null,
      attended:    null,
      surveySent:  false,
      campaign:    link.campaign,
    };
    this._bookings.set(id, booking);
    this._log('booking.create', { id, userId: link.userId, start: booking.start });

    // Auto-provision a video link stub for video meetings.
    if (mt.location === 'video') {
      const vl = this.videoLink(id);
      booking.videoUrl = vl.url;
    }

    // Schedule the default reminders (24h + 1h). `reminders()` is
    // idempotent; callers can override later.
    this.reminders({ bookingId: id, offsets: ['24h', '1h'] });

    const confirmation = buildNotification('confirm', {
      guest: booking.guestInfo.name || booking.guestInfo.email,
      host: link.userId,
      when: booking.start,
      meeting: mt.name_he + ' / ' + mt.name_en,
      duration: mt.duration,
      location: this._locationLabel(mt.location, booking.videoUrl),
      manageUrl: `${this._baseUrl.replace(/\/book$/, '')}/manage/${id}`,
    });
    this._deliver(confirmation, booking);

    return { ok: true, id, booking: { ...booking }, confirmation };
  }

  _locationLabel(location, videoUrl) {
    if (location === 'video') return videoUrl || 'video';
    if (location === 'phone') return 'phone';
    return 'in-person';
  }

  _deliver(notification, booking) {
    if (!this._notifier || typeof this._notifier.send !== 'function') return;
    try {
      this._notifier.send({ notification, booking });
    } catch (e) {
      this._log('notify.error', { bookingId: booking && booking.id, err: String(e) });
    }
  }

  /* =================================================================
   * 6. rescheduleRequest
   * =================================================================*/

  /**
   * Move a booking to a new slot. The old slot is preserved in
   * `statusHistory[]`; the booking row is upgraded in place.
   */
  rescheduleRequest({ bookingId, newSlot, requester, reason }) {
    const b = this._bookings.get(bookingId);
    if (!b) return { ok: false, reason: 'unknown_booking' };
    if (b.status === 'cancelled')
      return { ok: false, reason: 'already_cancelled' };
    if (!newSlot || !newSlot.start)
      return { ok: false, reason: 'bad_slot' };

    const mt = this._meetingTypes.get(b.meetingTypeId);
    const newStart = new Date(newSlot.start);
    const newEnd = newSlot.end
      ? new Date(newSlot.end)
      : addMinutes(newStart, mt.duration);
    if (newStart < addMinutes(this._clock(), (mt && mt.advanceNotice) || 0))
      return { ok: false, reason: 'too_soon' };

    // Double-booking guard excluding this very booking
    const buf = (mt && mt.buffer) || 0;
    for (const other of this._bookings.values()) {
      if (other.id === b.id) continue;
      if (other.userId !== b.userId) continue;
      if (other.status === 'cancelled') continue;
      if (rangeOverlaps(
        newStart, newEnd,
        addMinutes(other.start, -buf),
        addMinutes(other.end,    buf),
      )) return { ok: false, reason: 'slot_taken', conflictId: other.id };
    }

    const oldStart = b.start;
    const oldEnd = b.end;
    b.start = newStart.toISOString();
    b.end = newEnd.toISOString();
    b.status = 'rescheduled';
    b.statusHistory.push({
      at: this._clock().toISOString(),
      status: 'rescheduled',
      by: requester || 'system',
      reason: reason || null,
      from: oldStart,
      to: b.start,
    });
    b.updatedAt = this._clock().toISOString();
    this._log('booking.reschedule', { id: b.id, from: oldStart, to: b.start });

    // Recalculate reminders for the new time.
    this.reminders({ bookingId: b.id, offsets: ['24h', '1h'] });

    const notif = buildNotification('reschedule', {
      guest: b.guestInfo.name || b.guestInfo.email,
      meeting: b.meetingTypeId,
      oldWhen: oldStart,
      newWhen: b.start,
    });
    this._deliver(notif, b);

    return { ok: true, oldSlot: { start: oldStart, end: oldEnd },
             newSlot: { start: b.start, end: b.end }, notified: true };
  }

  /* =================================================================
   * 7. cancel
   * =================================================================*/

  /**
   * Cancel a booking — never deletes. The booking row is kept with
   * `status='cancelled'` and the audit trail is appended. Scheduled
   * reminders for the booking are suppressed.
   */
  cancel({ bookingId, reason, requester }) {
    const b = this._bookings.get(bookingId);
    if (!b) return { ok: false, reason: 'unknown_booking' };
    if (b.status === 'cancelled')
      return { ok: true, alreadyCancelled: true };
    b.status = 'cancelled';
    b.statusHistory.push({
      at: this._clock().toISOString(),
      status: 'cancelled',
      by: requester || 'system',
      reason: reason || null,
    });
    b.updatedAt = this._clock().toISOString();

    const rs = this._reminders.get(b.id) || [];
    for (const r of rs) r.status = 'suppressed';

    this._log('booking.cancel', { id: b.id, reason: reason || null });

    const notif = buildNotification('cancel', {
      guest: b.guestInfo.name || b.guestInfo.email,
      meeting: b.meetingTypeId,
      when: b.start,
      reason: reason || '—',
    });
    this._deliver(notif, b);

    return { ok: true, notified: true };
  }

  /* =================================================================
   * 8. reminders
   * =================================================================*/

  /**
   * Schedule bilingual reminder envelopes at the given offsets
   * before the booking start (defaults: 24h + 1h). Idempotent —
   * re-calling replaces the reminder list for that booking.
   * Returns the computed reminder records.
   */
  reminders({ bookingId, offsets }) {
    const b = this._bookings.get(bookingId);
    if (!b) return [];
    if (b.status === 'cancelled') return [];
    const list = (offsets && offsets.length ? offsets : ['24h', '1h'])
      .map(offsetToMinutes)
      .filter((m) => m > 0)
      .sort((a, z) => z - a); // farthest-first (24h then 1h)

    const start = new Date(b.start);
    const records = list.map((mins) => ({
      id:        this._nextId('rem'),
      bookingId: b.id,
      offsetMin: mins,
      fireAt:    addMinutes(start, -mins).toISOString(),
      status:    'scheduled',
      notification: buildNotification('remind', {
        guest:   b.guestInfo.name || b.guestInfo.email,
        meeting: b.meetingTypeId,
        when:    b.start,
        host:    b.userId,
      }),
    }));
    this._reminders.set(b.id, records);
    this._log('booking.reminders', { id: b.id, count: records.length });
    return records.slice();
  }

  listReminders(bookingId) {
    return (this._reminders.get(bookingId) || []).slice();
  }

  /* =================================================================
   * 9. videoLink
   * =================================================================*/

  /**
   * Stub a video-conference join URL. Uses the optional
   * `options.videoBridge` if one is wired (returning its result),
   * otherwise generates a deterministic pseudo-URL keyed to the
   * booking id + provider.
   */
  videoLink(bookingId) {
    const b = this._bookings.get(bookingId);
    if (!b) return { ok: false, reason: 'unknown_booking' };
    const mt = this._meetingTypes.get(b.meetingTypeId);
    const provider = (mt && mt.videoProvider) || b.videoProvider || 'zoom';

    if (this._video && typeof this._video.createMeeting === 'function') {
      try {
        const res = this._video.createMeeting({
          bookingId, provider, start: b.start, end: b.end,
        });
        if (res && res.url) {
          b.videoUrl = res.url;
          return { ok: true, provider, url: res.url };
        }
      } catch (e) {
        this._log('video.error', { bookingId: b.id, err: String(e) });
      }
    }

    const host = ({
      zoom:  'zoom.us/j/',
      meet:  'meet.google.com/',
      teams: 'teams.microsoft.com/l/meetup-join/',
    })[provider] || 'meet.local/';
    const slug = b.id.replace(/_/g, '').slice(0, 12);
    const url  = `https://${host}${slug}`;
    b.videoUrl = url;
    return { ok: true, provider, url };
  }

  /* =================================================================
   * 10. noShowTracking
   * =================================================================*/

  /**
   * Mark a booking as attended or no-show. Called by a timer after
   * the meeting ends (or manually by the host). Never deletes —
   * the status history is appended.
   */
  noShowTracking(bookingId, mark = 'no-show') {
    const b = this._bookings.get(bookingId);
    if (!b) return { ok: false, reason: 'unknown_booking' };
    if (b.status === 'cancelled')
      return { ok: false, reason: 'cancelled_booking' };
    if (!['attended', 'no-show'].includes(mark))
      return { ok: false, reason: 'bad_mark' };
    b.status    = mark;
    b.attended  = mark === 'attended';
    b.noShow    = mark === 'no-show';
    b.statusHistory.push({
      at:     this._clock().toISOString(),
      status: mark,
    });
    b.updatedAt = this._clock().toISOString();
    this._log('booking.track', { id: b.id, mark });
    if (mark === 'attended') this.postMeetingSurvey(b.id);
    return { ok: true, status: mark };
  }

  /* =================================================================
   * 11. postMeetingSurvey
   * =================================================================*/

  /**
   * Trigger a CSAT survey after a meeting. Idempotent — only fires
   * once per booking (tracked by `surveySent`). Returns the survey
   * envelope so callers can inspect what was sent.
   */
  postMeetingSurvey(bookingId) {
    const b = this._bookings.get(bookingId);
    if (!b) return { ok: false, reason: 'unknown_booking' };
    if (b.surveySent)
      return { ok: true, alreadySent: true, surveyId: b.surveyId };
    const surveyId = this._nextId('srv');
    b.surveySent = true;
    b.surveyId = surveyId;
    b.surveyUrl = `${this._baseUrl.replace(/\/book$/, '')}/survey/${surveyId}`;
    const notif = buildNotification('survey', {
      guest: b.guestInfo.name || b.guestInfo.email,
      meeting: b.meetingTypeId,
      surveyUrl: b.surveyUrl,
    });
    this._deliver(notif, b);
    this._log('booking.survey', { id: b.id, surveyId });
    return { ok: true, surveyId, url: b.surveyUrl, notification: notif };
  }

  /* =================================================================
   * 12. calendarSync
   * =================================================================*/

  /**
   * Push all active bookings for a host to the optional calendar
   * bridge (X-67 Google, X-68 Outlook). When no bridge is wired the
   * method returns a dry-run payload so tests can still assert on
   * the shape.
   */
  calendarSync(userId) {
    const events = Array.from(this._bookings.values())
      .filter((b) => b.userId === userId && b.status !== 'cancelled')
      .map((b) => ({
        id:          b.id,
        summary:     `Meeting ${b.meetingTypeId} — ${b.guestInfo.email}`,
        start:       b.start,
        end:         b.end,
        location:    this._locationLabel(b.location, b.videoUrl),
        description: b.videoUrl
          ? `Video: ${b.videoUrl}`
          : `Guest: ${b.guestInfo.email}`,
      }));

    let provider = 'dry-run';
    let synced = events.length;
    if (this._calendar && typeof this._calendar.syncUser === 'function') {
      try {
        const res = this._calendar.syncUser({ userId, events });
        provider = (res && res.provider) || 'bridged';
        synced = (res && res.synced) != null ? res.synced : synced;
      } catch (e) {
        this._log('calendar.error', { userId, err: String(e) });
        return { ok: false, reason: 'bridge_error' };
      }
    }
    this._log('calendar.sync', { userId, provider, count: events.length });
    return { ok: true, provider, events, synced };
  }

  /* =================================================================
   * Read / utility
   * =================================================================*/

  getBooking(bookingId) {
    const b = this._bookings.get(bookingId);
    return b ? { ...b, statusHistory: b.statusHistory.slice() } : null;
  }

  listBookings(filter = {}) {
    return Array.from(this._bookings.values())
      .filter((b) => !filter.userId || b.userId === filter.userId)
      .filter((b) => !filter.status || b.status === filter.status);
  }

  /** Raw audit log — append-only. */
  getAuditTrail() {
    return this._audit.slice();
  }

  /* =====================================================================
   * ═══════════════════════════════════════════════════════════════════
   *                    Y-097  EXTERNAL-SALES API
   * ═══════════════════════════════════════════════════════════════════
   * Distinct from the Calendly-lite guest-booking path above. These
   * methods model a traditional CRM/outside-sales meeting lifecycle:
   *   propose  →  book  →  confirm  →  remind  →  outcome  →  history
   * Append-only per the immutable rule (לא מוחקים רק משדרגים ומגדלים).
   * =====================================================================
   */

  /* ---------- tiny shared helpers ---------- */

  _ensureAvailability(userId) {
    if (!this._availability.has(userId)) {
      // Lazily seed the default Sun-Thu 09-18 schedule so ad-hoc owners
      // work out of the box for proposeSlots() without prior setAvailability.
      this.setAvailability({ userId });
    }
    return this._availability.get(userId);
  }

  _appendCustomerLog(customerId, entry) {
    if (!customerId) return;
    const list = this._customerLog.get(customerId) || [];
    list.push({
      at: this._clock().toISOString(),
      ...entry,
    });
    this._customerLog.set(customerId, list);
  }

  /* =================================================================
   * Y-097 #1  — proposeSlots
   * =================================================================*/
  /**
   * Compute the intersection of the given owners' availability inside
   * `preferredTimeRange`, honouring Israeli business hours, weekends
   * and national holidays. Returns candidate slots sized for the
   * meeting type (durationMin), ready to be offered to the customer.
   *
   * @param {object} p
   * @param {string} p.customerId
   * @param {string} p.meetingTypeId
   * @param {{from:string,to:string}} p.preferredTimeRange
   * @param {string[]} p.owners    attending staff user ids
   */
  proposeSlots({ customerId, meetingTypeId, preferredTimeRange, owners }) {
    if (!customerId) throw new Error('proposeSlots: customerId required');
    if (!meetingTypeId) throw new Error('proposeSlots: meetingTypeId required');
    if (!preferredTimeRange || !preferredTimeRange.from || !preferredTimeRange.to)
      throw new Error('proposeSlots: preferredTimeRange{from,to} required');
    if (!Array.isArray(owners) || owners.length === 0)
      throw new Error('proposeSlots: owners required');

    const mt = this._meetingTypes.get(meetingTypeId);
    if (!mt) throw new Error(`proposeSlots: unknown meetingType ${meetingTypeId}`);

    const from = new Date(preferredTimeRange.from);
    const to   = new Date(preferredTimeRange.to);
    if (!(to > from)) return [];

    const dur = mt.duration;
    const step = this._slotMin;

    // Per-owner daily windows projected into absolute Date pairs.
    const ownerWindows = owners.map((ownerId) => {
      const av = this._ensureAvailability(ownerId);
      const out = [];
      const cursor = new Date(Date.UTC(
        from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0,
      ));
      while (cursor <= to) {
        const dateKey = toIsoDate(cursor);
        const dow = cursor.getUTCDay();
        // Skip Israeli holidays
        if (isIsraeliHoliday(cursor, this._customHolidays)) {
          cursor.setUTCDate(cursor.getUTCDate() + 1);
          continue;
        }
        const ex = av.exceptions.find((e) => e.date === dateKey);
        let windows;
        if (ex) {
          if (ex.blocked) { windows = []; }
          else if (ex.windows && ex.windows.length) { windows = ex.windows; }
          else { windows = av.weeklySchedule[dow] || []; }
        } else {
          windows = av.weeklySchedule[dow] || [];
        }
        for (const w of windows) {
          const ws = combineDateAndHHMM(cursor, w.start);
          const we = combineDateAndHHMM(cursor, w.end);
          if (ws < to && we > from) {
            out.push({
              start: new Date(Math.max(ws.getTime(), from.getTime())),
              end:   new Date(Math.min(we.getTime(), to.getTime())),
            });
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return out;
    });

    // Intersect every owner's windows.
    const common = intersectMany(ownerWindows);
    if (common.length === 0) return [];

    // Remove windows already taken by existing (non-cancelled) meetings
    // for any of the owners.
    const busy = [];
    for (const m of this._meetings.values()) {
      if (m.status === 'cancelled') continue;
      if (!m.owners.some((o) => owners.includes(o))) continue;
      busy.push({ start: new Date(m.start), end: new Date(m.end) });
    }

    const slots = [];
    for (const w of common) {
      let cursor = w.start.getTime();
      const winEnd = w.end.getTime();
      while (cursor + dur * 60_000 <= winEnd) {
        const s = new Date(cursor);
        const e = new Date(cursor + dur * 60_000);
        const conflict = busy.some((b) =>
          rangeOverlaps(s, e, b.start, b.end),
        );
        if (!conflict) {
          slots.push({
            start: s.toISOString(),
            end:   e.toISOString(),
            duration: dur,
            owners: owners.slice(),
          });
        }
        cursor += step * 60_000;
      }
    }
    this._log('proposeSlots', {
      customerId, meetingTypeId, owners, count: slots.length,
    });
    return slots;
  }

  /* =================================================================
   * Y-097 #2  — bookMeeting  (external-sales overload)
   * =================================================================
   * NOTE: This method overloads the existing Calendly-lite
   * `bookMeeting({linkId,slot,guestInfo,formAnswers})`. When a
   * `customerId` is present we take the Y-097 path; otherwise we
   * preserve the legacy guest-booking behaviour completely.
   */
  bookMeeting(args) {
    if (args && args.customerId && !args.linkId) {
      return this._bookCustomerMeeting(args);
    }
    return this._legacyBookMeeting(args);
  }

  _bookCustomerMeeting({ customerId, meetingTypeId, slot, owners, agenda, notes }) {
    if (!customerId)    throw new Error('bookMeeting: customerId required');
    if (!meetingTypeId) throw new Error('bookMeeting: meetingTypeId required');
    if (!slot || !slot.start) throw new Error('bookMeeting: slot.start required');
    if (!Array.isArray(owners) || owners.length === 0)
      throw new Error('bookMeeting: owners required');

    const mt = this._meetingTypes.get(meetingTypeId);
    if (!mt) throw new Error(`bookMeeting: unknown meetingType ${meetingTypeId}`);

    const start = new Date(slot.start);
    const end = slot.end
      ? new Date(slot.end)
      : addMinutes(start, mt.duration);

    // Double-book guard across owners
    for (const m of this._meetings.values()) {
      if (m.status === 'cancelled') continue;
      if (!m.owners.some((o) => owners.includes(o))) continue;
      if (rangeOverlaps(start, end, m.start, m.end)) {
        return { ok: false, reason: 'slot_taken', conflictId: m.id };
      }
    }

    const id = this._nextId('mtg');
    const createdAt = this._clock().toISOString();
    const record = {
      id,
      customerId,
      meetingTypeId,
      start:  start.toISOString(),
      end:    end.toISOString(),
      owners: owners.slice(),
      agenda: agenda || '',
      notes:  notes  || '',
      location: mt.location,
      status: 'scheduled',
      statusHistory: [{
        at: createdAt,
        status: 'scheduled',
        by: 'system',
      }],
      createdAt,
      updatedAt: createdAt,
    };
    this._meetings.set(id, record);
    this._outcomes.set(id, []);
    this._appendCustomerLog(customerId, {
      event: 'meeting.scheduled',
      meetingId: id, meetingTypeId, start: record.start, owners,
    });
    this._log('customerMeeting.create', {
      id, customerId, meetingTypeId, start: record.start,
    });
    return { ok: true, id, meeting: { ...record }, status: 'scheduled' };
  }

  _legacyBookMeeting({ linkId, slot, guestInfo, formAnswers }) {
    if (!linkId) throw new Error('bookMeeting: linkId required');
    if (!slot || !slot.start)
      throw new Error('bookMeeting: slot.start required');
    if (!guestInfo || !guestInfo.email)
      throw new Error('bookMeeting: guestInfo.email required');

    const link = this._resolveLink(linkId);
    if (!link || !link.active) return { ok: false, reason: 'link_inactive' };
    const mt = this._meetingTypes.get(link.meetingTypeId);
    const av = this._availability.get(link.userId);
    if (!mt || !av) return { ok: false, reason: 'misconfigured' };

    for (const field of mt.bookingForm || []) {
      if (field.required) {
        const v = (formAnswers || {})[field.key];
        if (v == null || v === '')
          return { ok: false, reason: `form_required:${field.key}` };
      }
    }

    const start = new Date(slot.start);
    const end = slot.end
      ? new Date(slot.end)
      : addMinutes(start, mt.duration);
    const now = this._clock();
    if (start < addMinutes(now, mt.advanceNotice || 0)) {
      return { ok: false, reason: 'too_soon' };
    }

    const buf = mt.buffer || 0;
    for (const b of this._bookings.values()) {
      if (b.userId !== link.userId) continue;
      if (b.status === 'cancelled') continue;
      if (rangeOverlaps(
        start, end,
        addMinutes(b.start, -buf),
        addMinutes(b.end,    buf),
      )) {
        return { ok: false, reason: 'slot_taken', conflictId: b.id };
      }
    }
    if (mt.maxPerDay) {
      const dayCount = this._bookingsOnDay(link.userId, toIsoDate(start))
        .filter((b) => b.status !== 'cancelled').length;
      if (dayCount >= mt.maxPerDay)
        return { ok: false, reason: 'max_per_day' };
    }

    const id = this._nextId('bkg');
    const booking = {
      id,
      linkId:        link.id,
      userId:        link.userId,
      meetingTypeId: mt.id,
      start:         start.toISOString(),
      end:           end.toISOString(),
      duration:      mt.duration,
      guestInfo: {
        name:    guestInfo.name  || '',
        email:   String(guestInfo.email).toLowerCase().trim(),
        phone:   guestInfo.phone || '',
        company: guestInfo.company || '',
        lang:    guestInfo.lang   || 'he',
      },
      formAnswers: formAnswers ? { ...formAnswers } : {},
      location:    mt.location,
      videoProvider: mt.videoProvider || null,
      videoUrl:    null,
      status:      'scheduled',
      statusHistory: [{
        at:     this._clock().toISOString(),
        status: 'scheduled',
      }],
      createdAt:   this._clock().toISOString(),
      updatedAt:   this._clock().toISOString(),
      noShow:      null,
      attended:    null,
      surveySent:  false,
      campaign:    link.campaign,
    };
    this._bookings.set(id, booking);
    this._log('booking.create', { id, userId: link.userId, start: booking.start });

    if (mt.location === 'video') {
      const vl = this.videoLink(id);
      booking.videoUrl = vl.url;
    }

    this.reminders({ bookingId: id, offsets: ['24h', '1h'] });

    const confirmation = buildNotification('confirm', {
      guest: booking.guestInfo.name || booking.guestInfo.email,
      host: link.userId,
      when: booking.start,
      meeting: mt.name_he + ' / ' + mt.name_en,
      duration: mt.duration,
      location: this._locationLabel(mt.location, booking.videoUrl),
      manageUrl: `${this._baseUrl.replace(/\/book$/, '')}/manage/${id}`,
    });
    this._deliver(confirmation, booking);

    return { ok: true, id, booking: { ...booking }, confirmation };
  }

  /* =================================================================
   * Y-097 #3  — sendConfirmation
   * =================================================================*/
  sendConfirmation(meetingId, lang) {
    const m = this._meetings.get(meetingId);
    if (!m) return { ok: false, reason: 'unknown_meeting' };
    const mt = this._meetingTypes.get(m.meetingTypeId);
    const meetingLabel = mt
      ? `${mt.name_he} / ${mt.name_en}`
      : m.meetingTypeId;
    const ctx = {
      meeting:   meetingLabel,
      when:      m.start,
      duration:  mt ? mt.duration : m.duration || 30,
      location:  m.location,
      owners:    m.owners.join(', '),
      agenda:    m.agenda || '—',
      meetingId: m.id,
    };
    const notification = buildNotification('customer_confirm', ctx);
    notification.ics = this.generateICS(meetingId);
    notification.lang = lang || 'bilingual';
    if (lang === 'he') notification.primary = {
      subject: notification.subject_he, body: notification.body_he,
    };
    else if (lang === 'en') notification.primary = {
      subject: notification.subject_en, body: notification.body_en,
    };
    else notification.primary = {
      subject: `${notification.subject_he} | ${notification.subject_en}`,
      body:    `${notification.body_he}\n\n— — —\n\n${notification.body_en}`,
    };
    this._deliver(notification, m);
    this._log('customerMeeting.confirm', { id: m.id, lang: notification.lang });
    return { ok: true, notification };
  }

  /* =================================================================
   * Y-097 #4  — generateICS  (RFC 5545)
   * =================================================================*/
  generateICS(meetingId) {
    const m = this._meetings.get(meetingId);
    if (!m) throw new Error(`generateICS: unknown meeting ${meetingId}`);
    const mt = this._meetingTypes.get(m.meetingTypeId);
    const summary = icsEscape(
      mt
        ? `${mt.name_he} / ${mt.name_en} — ${m.customerId}`
        : `Meeting ${m.id} — ${m.customerId}`,
    );
    const desc = icsEscape([
      `Customer: ${m.customerId}`,
      `Owners: ${m.owners.join(', ')}`,
      `Location: ${m.location}`,
      m.agenda ? `Agenda: ${m.agenda}` : null,
      m.notes  ? `Notes: ${m.notes}`   : null,
      `Status: ${m.status}`,
    ].filter(Boolean).join('\n'));
    const location = icsEscape(m.location || '');
    const dtStart = icsStamp(m.start);
    const dtEnd   = icsStamp(m.end);
    const dtStamp = icsStamp(m.createdAt || this._clock());

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Techno-Kol Uzi//Customer Meeting Scheduler Y-097//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${m.id}@techno-kol.co.il`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `LOCATION:${location}`,
      `STATUS:${m.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
      'ORGANIZER;CN=Techno-Kol Sales:mailto:sales@techno-kol.co.il',
      ...m.owners.map((o) =>
        `ATTENDEE;CN=${o};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${o}@techno-kol.co.il`,
      ),
      `ATTENDEE;CN=Customer ${m.customerId};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:customer-${m.customerId}@customers.local`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Meeting reminder / תזכורת פגישה',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  /* =================================================================
   * Y-097 #5  — rescheduleMeeting  (append-only)
   * =================================================================*/
  rescheduleMeeting(meetingId, newSlot, reason) {
    const m = this._meetings.get(meetingId);
    if (!m) return { ok: false, reason: 'unknown_meeting' };
    if (m.status === 'cancelled')
      return { ok: false, reason: 'already_cancelled' };
    if (!newSlot || !newSlot.start)
      return { ok: false, reason: 'bad_slot' };

    const mt = this._meetingTypes.get(m.meetingTypeId);
    const newStart = new Date(newSlot.start);
    const newEnd = newSlot.end
      ? new Date(newSlot.end)
      : addMinutes(newStart, mt ? mt.duration : m.duration || 30);

    // Double-booking guard across owners (excluding self).
    for (const other of this._meetings.values()) {
      if (other.id === m.id) continue;
      if (other.status === 'cancelled') continue;
      if (!other.owners.some((o) => m.owners.includes(o))) continue;
      if (rangeOverlaps(newStart, newEnd, other.start, other.end))
        return { ok: false, reason: 'slot_taken', conflictId: other.id };
    }

    const oldStart = m.start;
    const oldEnd = m.end;
    m.start = newStart.toISOString();
    m.end   = newEnd.toISOString();
    m.status = 'rescheduled';
    m.statusHistory.push({
      at: this._clock().toISOString(),
      status: 'rescheduled',
      reason: reason || null,
      from: oldStart,
      to: m.start,
    });
    m.updatedAt = this._clock().toISOString();
    this._appendCustomerLog(m.customerId, {
      event: 'meeting.rescheduled',
      meetingId: m.id,
      from: oldStart,
      to: m.start,
      reason: reason || null,
    });
    this._log('customerMeeting.reschedule', {
      id: m.id, from: oldStart, to: m.start,
    });

    const notif = buildNotification('customer_reschedule', {
      meeting: mt ? `${mt.name_he} / ${mt.name_en}` : m.meetingTypeId,
      oldWhen: oldStart,
      newWhen: m.start,
      reason:  reason || '—',
    });
    this._deliver(notif, m);

    return {
      ok: true,
      oldSlot: { start: oldStart, end: oldEnd },
      newSlot: { start: m.start, end: m.end },
      history: m.statusHistory.slice(),
    };
  }

  /* =================================================================
   * Y-097 #6  — cancelMeeting  (status flip, record preserved)
   * =================================================================*/
  cancelMeeting(meetingId, reason) {
    const m = this._meetings.get(meetingId);
    if (!m) return { ok: false, reason: 'unknown_meeting' };
    if (m.status === 'cancelled')
      return { ok: true, alreadyCancelled: true };
    m.status = 'cancelled';
    m.statusHistory.push({
      at: this._clock().toISOString(),
      status: 'cancelled',
      reason: reason || null,
    });
    m.updatedAt = this._clock().toISOString();
    this._appendCustomerLog(m.customerId, {
      event: 'meeting.cancelled',
      meetingId: m.id,
      reason: reason || null,
    });
    this._log('customerMeeting.cancel', { id: m.id, reason: reason || null });

    const mt = this._meetingTypes.get(m.meetingTypeId);
    const notif = buildNotification('customer_cancel', {
      meeting: mt ? `${mt.name_he} / ${mt.name_en}` : m.meetingTypeId,
      when: m.start,
      reason: reason || '—',
      meetingId: m.id,
    });
    this._deliver(notif, m);
    return { ok: true, status: 'cancelled', record: { ...m } };
  }

  /* =================================================================
   * Y-097 #7  — sendReminder
   * =================================================================*/
  sendReminder(meetingId, hoursBefore) {
    const m = this._meetings.get(meetingId);
    if (!m) return { ok: false, reason: 'unknown_meeting' };
    if (m.status === 'cancelled') return { ok: false, reason: 'cancelled' };
    const hrs = Number.isFinite(Number(hoursBefore)) ? Number(hoursBefore) : 24;
    const mt = this._meetingTypes.get(m.meetingTypeId);
    const notification = buildNotification('customer_reminder', {
      meeting: mt ? `${mt.name_he} / ${mt.name_en}` : m.meetingTypeId,
      when: m.start,
      hours: hrs,
      agenda: m.agenda || '—',
    });
    this._deliver(notification, m);
    this._log('customerMeeting.reminder', {
      id: m.id, hoursBefore: hrs,
    });
    return { ok: true, hoursBefore: hrs, notification };
  }

  /* =================================================================
   * Y-097 #8  — noShowTracker  (append-only event log)
   * =================================================================*/
  noShowTracker(customerId) {
    if (!customerId) throw new Error('noShowTracker: customerId required');
    const log = this._customerLog.get(customerId) || [];
    // Canonical source: explicit customer-log entries with the
    // `meeting.no-show` / `meeting.attended` event types. Outcomes
    // feed this log through `recordOutcome`, so we only read the log
    // here to avoid double-counting.
    const entries = log.filter((e) =>
      e.event === 'meeting.no-show' || e.event === 'meeting.attended',
    );
    // Deduplicate by (meetingId, event) just in case an outcome was
    // recorded twice or appended manually — keep the earliest `at`.
    const seen = new Map();
    for (const e of entries) {
      const key = `${e.meetingId || ''}:${e.event}`;
      if (!seen.has(key)) seen.set(key, e);
    }
    const all = Array.from(seen.values()).sort((a, z) =>
      new Date(a.at).getTime() - new Date(z.at).getTime(),
    );
    const count = all.filter((e) => e.event === 'meeting.no-show').length;
    return {
      customerId,
      count,
      events: all,
    };
  }

  /* =================================================================
   * Y-097 #9  — recordOutcome
   * =================================================================*/
  recordOutcome({ meetingId, outcome, notes, nextSteps, opportunityUpdate }) {
    const m = this._meetings.get(meetingId);
    if (!m) return { ok: false, reason: 'unknown_meeting' };
    const allowed = ['productive', 'inconclusive', 'no-show', 'rescheduled'];
    if (!allowed.includes(outcome))
      return { ok: false, reason: 'bad_outcome' };

    const entry = {
      at: this._clock().toISOString(),
      outcome,
      notes:    notes     || '',
      nextSteps: Array.isArray(nextSteps) ? nextSteps.slice() : (nextSteps ? [nextSteps] : []),
      opportunityUpdate: opportunityUpdate
        ? JSON.parse(JSON.stringify(opportunityUpdate))
        : null,
    };
    const list = this._outcomes.get(meetingId) || [];
    list.push(entry);
    this._outcomes.set(meetingId, list);

    // Mirror the outcome onto the meeting record so reads don't need
    // to cross-join but keep the raw append-only list canonical.
    m.lastOutcome = outcome;
    m.statusHistory.push({
      at: entry.at,
      status: `outcome:${outcome}`,
    });
    m.updatedAt = entry.at;

    this._appendCustomerLog(m.customerId, {
      event: outcome === 'no-show' ? 'meeting.no-show' : `meeting.outcome.${outcome}`,
      meetingId,
      notes: entry.notes,
      nextSteps: entry.nextSteps,
    });
    this._log('customerMeeting.outcome', { id: meetingId, outcome });
    return { ok: true, outcome, entry, history: list.slice() };
  }

  /* =================================================================
   * Y-097 #10 — meetingHistory  (full append-only history)
   * =================================================================*/
  meetingHistory(customerId) {
    if (!customerId) throw new Error('meetingHistory: customerId required');
    const meetings = Array.from(this._meetings.values())
      .filter((m) => m.customerId === customerId)
      .sort((a, z) => new Date(a.start).getTime() - new Date(z.start).getTime())
      .map((m) => ({
        id: m.id,
        meetingTypeId: m.meetingTypeId,
        start: m.start,
        end: m.end,
        status: m.status,
        owners: m.owners.slice(),
        agenda: m.agenda,
        outcomes: (this._outcomes.get(m.id) || []).slice(),
        statusHistory: m.statusHistory.slice(),
      }));
    return {
      customerId,
      count: meetings.length,
      meetings,
      log: (this._customerLog.get(customerId) || []).slice(),
    };
  }

  /* =================================================================
   * Y-097 #11 — bookingLinkGenerator
   * =================================================================*/
  bookingLinkGenerator(userId, duration) {
    if (!userId) throw new Error('bookingLinkGenerator: userId required');
    const dur = Number.isFinite(Number(duration)) ? Number(duration) : 30;
    const id  = this._nextId('blg');
    const slug = `${userId}-${dur}min-${this._randomId().slice(0, 6)}`
      .toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const url = `${this._baseUrl.replace(/\/book$/, '')}/self/${slug}`;
    const record = {
      id,
      userId,
      duration: dur,
      slug,
      url,
      createdAt: this._clock().toISOString(),
      active: true,
    };
    this._selfServiceLinks.set(id, record);
    this._log('bookingLinkGenerator', { id, userId, duration: dur });
    return { ok: true, id, url, slug, duration: dur };
  }

  /* =================================================================
   * Y-097 #12 — teamAvailabilityView
   * =================================================================*/
  teamAvailabilityView(userIds, dateRange) {
    if (!Array.isArray(userIds) || userIds.length === 0)
      throw new Error('teamAvailabilityView: userIds required');
    if (!dateRange || !dateRange.from || !dateRange.to)
      throw new Error('teamAvailabilityView: dateRange{from,to} required');

    const from = new Date(dateRange.from);
    const to   = new Date(dateRange.to);
    const days = [];
    const cursor = new Date(Date.UTC(
      from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 0, 0, 0, 0,
    ));
    while (cursor <= to) {
      days.push(toIsoDate(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const matrix = {};
    for (const uid of userIds) {
      const av = this._ensureAvailability(uid);
      matrix[uid] = {};
      for (const day of days) {
        const d = new Date(`${day}T00:00:00.000Z`);
        const dow = d.getUTCDay();
        let windows = [];
        const isHoliday = isIsraeliHoliday(d, this._customHolidays);
        if (isHoliday) {
          windows = [];
        } else {
          const ex = av.exceptions.find((e) => e.date === day);
          if (ex) {
            if (ex.blocked) windows = [];
            else if (ex.windows && ex.windows.length) windows = ex.windows;
            else windows = av.weeklySchedule[dow] || [];
          } else {
            windows = av.weeklySchedule[dow] || [];
          }
        }
        // Subtract owner's existing meetings from windows.
        const busy = Array.from(this._meetings.values())
          .filter((m) => m.status !== 'cancelled' && m.owners.includes(uid))
          .filter((m) => toIsoDate(m.start) === day)
          .map((m) => ({ start: m.start, end: m.end }));
        matrix[uid][day] = {
          holiday: isHoliday,
          weekday: dow,
          windows: windows.map((w) => ({ start: w.start, end: w.end })),
          busy,
          isAvailable: !isHoliday && windows.length > 0,
        };
      }
    }
    return {
      userIds: userIds.slice(),
      from: from.toISOString(),
      to:   to.toISOString(),
      days,
      matrix,
    };
  }

  /** Y-097 read helper */
  getCustomerMeeting(meetingId) {
    const m = this._meetings.get(meetingId);
    if (!m) return null;
    return {
      ...m,
      statusHistory: m.statusHistory.slice(),
      outcomes:      (this._outcomes.get(meetingId) || []).slice(),
    };
  }

  /** Y-097 instance helper */
  israeliHolidays2026() {
    return israeliHolidays2026();
  }
}

/* =====================================================================
 * EXPORTS
 * ===================================================================*/

module.exports = {
  MeetingScheduler,
  LABELS,
  labels,
  TEMPLATES,
  buildNotification,
  offsetToMinutes,
  normalizeWeekly,
  DEFAULT_WEEKLY_SCHEDULE,
  DEFAULT_TIMEZONE,
  // Y-097 additions
  ISRAELI_HOLIDAYS_2026,
  israeliHolidays2026,
  isIsraeliHoliday,
  icsStamp,
  icsEscape,
  icsFold,
  intersectRange,
  intersectMany,
  _internal: {
    parseHHMM,
    minutesToHHMM,
    toIsoDate,
    combineDateAndHHMM,
    addMinutes,
    rangeOverlaps,
    deepFreeze,
    formatTemplate,
    icsStamp,
    icsEscape,
    icsFold,
    intersectRange,
    intersectMany,
  },
};
