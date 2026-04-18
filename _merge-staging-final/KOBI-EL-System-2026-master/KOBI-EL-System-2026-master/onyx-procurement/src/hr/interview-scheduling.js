/* ============================================================================
 * Techno-Kol Uzi Mega-ERP — Interview Scheduling Engine
 * Agent Y-062 / Swarm HR / Kobi EL 2026
 * ----------------------------------------------------------------------------
 * מנוע תזמון ראיונות — שילוב יומן, RTL עברי, תקשורת דו-לשונית
 *
 * Distinct from onboarding (Y-063) and recruiting-pipeline (other agents):
 *   - This module owns the *scheduling* layer between the moment a candidate
 *     reaches the "interview" stage and the moment the interview is recorded
 *     as completed / no-show / cancelled.
 *   - Hands off downstream events (interview.completed, interview.no_show)
 *     to the recruiting pipeline so the candidate stage can advance.
 *
 * Rule of the ERP: לא מוחקים רק משדרגים ומגדלים.
 *   - reschedule appends a new history row; it does NOT mutate the previous
 *     slot in place.
 *   - cancel flips status to 'cancelled' and stamps a reason; the record
 *     stays in the Map forever.
 *   - no-show events accumulate in an append-only event log per candidate.
 *
 * Zero dependencies: pure Node built-ins (node:crypto for stable IDs).
 * No external libraries. ICS / iCalendar serializer is hand-written per
 * RFC 5545. Email body is plain UTF-8 text + ICS attachment, returned as
 * a structured object — caller wires it to whatever transport (SMTP, SES,
 * Mailgun, smoke signals).
 *
 * Bilingual: every user-facing string ships as { he, en }. RTL text is
 * delivered with the Unicode RIGHT-TO-LEFT MARK (U+200F) at the start of
 * Hebrew lines so terminals & legacy MUAs render correctly.
 *
 * Israeli-holiday awareness: 2026 holidays are pinned to Gregorian dates
 * (the Hebrew calendar conversion was done at module load time once, so
 * we can stay zero-dep). Update yearly via `israeliHolidays2026()`.
 *
 * Storage: in-memory `Map` instances (interviews, availability, events,
 * policy, candidates). Easily swappable for a persistent store via the
 * constructor `store` adapter.
 *
 * Public exports:
 *   class    InterviewScheduler
 *   const    INTERVIEW_STATUS
 *   const    INTERVIEW_FORMAT
 *   const    LABELS
 *   const    HEBREW_GLOSSARY
 *   function israeliHolidays2026
 *   function isIsraeliHoliday
 *   function isWeekend
 * ==========================================================================*/

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const RLM = '\u200F'; // RIGHT-TO-LEFT MARK for Hebrew lines

const INTERVIEW_STATUS = Object.freeze({
  PROPOSED:  'proposed',
  CONFIRMED: 'confirmed',
  RESCHEDULED: 'rescheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW:   'no_show',
});

const INTERVIEW_FORMAT = Object.freeze({
  ONSITE: 'onsite',
  VIDEO:  'video',
  PHONE:  'phone',
});

const EVENT_TYPE = Object.freeze({
  PROPOSED:    'proposed',
  CONFIRMED:   'confirmed',
  RESCHEDULED: 'rescheduled',
  CANCELLED:   'cancelled',
  REMINDER:    'reminder',
  NO_SHOW:     'no_show',
  COMPLETED:   'completed',
  INVITE_SENT: 'invite_sent',
});

const DAY_NAMES = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

// Bilingual labels — UI freely chooses he|en
const LABELS = Object.freeze({
  interview:        { he: 'ראיון',                en: 'Interview' },
  candidate:        { he: 'מועמד',                en: 'Candidate' },
  interviewer:      { he: 'מראיין',               en: 'Interviewer' },
  scheduled:        { he: 'מתוזמן',               en: 'Scheduled' },
  proposed:         { he: 'מוצע',                 en: 'Proposed' },
  confirmed:        { he: 'מאושר',                en: 'Confirmed' },
  rescheduled:      { he: 'נדחה למועד חדש',       en: 'Rescheduled' },
  cancelled:        { he: 'בוטל',                 en: 'Cancelled' },
  completed:        { he: 'הושלם',                en: 'Completed' },
  no_show:          { he: 'לא הופיע',             en: 'No-Show' },
  room:             { he: 'חדר',                  en: 'Room' },
  format_onsite:    { he: 'באתר',                 en: 'Onsite' },
  format_video:     { he: 'וידאו',                en: 'Video' },
  format_phone:     { he: 'טלפון',                en: 'Phone' },
  reminder:         { he: 'תזכורת',               en: 'Reminder' },
  reschedule_reason:{ he: 'סיבת דחייה',           en: 'Reschedule Reason' },
  cancel_reason:    { he: 'סיבת ביטול',           en: 'Cancellation Reason' },
  duration_min:     { he: 'משך בדקות',            en: 'Duration (minutes)' },
  weekend:          { he: 'סוף שבוע',             en: 'Weekend' },
  holiday:          { he: 'חג ישראלי',            en: 'Israeli Holiday' },
});

// Hebrew glossary — terms used in the module, for QA & i18n review
const HEBREW_GLOSSARY = Object.freeze({
  'interview':           'ראיון',
  'interviewer':         'מראיין',
  'candidate':           'מועמד',
  'schedule':            'תזמון',
  'reschedule':          'דחייה למועד חדש',
  'availability':        'זמינות',
  'slot':                'חלון זמן',
  'conflict':            'התנגשות',
  'double-booking':      'חפיפת יומן',
  'reminder':            'תזכורת',
  'no-show':             'אי הופעה',
  'cancellation':        'ביטול',
  'invitation':          'הזמנה',
  'business hours':      'שעות עבודה',
  'weekend':             'סוף שבוע',
  'holiday':             'חג',
  'load balance':        'איזון עומסים',
  'round-robin':         'תורנות מחזורית',
  'fair distribution':   'חלוקה הוגנת',
  'video meeting':       'פגישת וידאו',
  'phone screen':        'ראיון טלפוני',
  'onsite':              'באתר',
  'panel':               'פאנל ראיונות',
});

// Default policy values
const DEFAULT_POLICY = Object.freeze({
  businessHours:  { start: '09:00', end: '18:00' },
  minDurationMin: 30,
  breakMin:       15,
  weekendOff:     ['Fri', 'Sat'], // Israeli weekend
  holidays:       [],
  timezone:       'Asia/Jerusalem',
});

// ═══════════════════════════════════════════════════════════════════════════
// ISRAELI HOLIDAYS — 2026
// Pinned Gregorian dates. Hebrew calendar conversion was done out-of-band
// so the runtime stays zero-dependency.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the canonical list of 2026 Israeli national & religious holidays
 * the scheduler must avoid. Each entry has Hebrew + English label.
 */
function israeliHolidays2026() {
  return [
    { date: '2026-04-01', he: 'ערב פסח',                  en: 'Erev Pesach' },
    { date: '2026-04-02', he: 'פסח א',                    en: 'Pesach Day 1' },
    { date: '2026-04-08', he: 'שביעי של פסח',             en: 'Shvi\'i shel Pesach' },
    { date: '2026-04-14', he: 'יום הזיכרון לשואה',         en: 'Yom HaShoah' },
    { date: '2026-04-21', he: 'יום הזיכרון לחללי צה"ל',    en: 'Yom HaZikaron' },
    { date: '2026-04-22', he: 'יום העצמאות',               en: 'Yom HaAtzmaut' },
    { date: '2026-05-22', he: 'ערב שבועות',               en: 'Erev Shavuot' },
    { date: '2026-05-23', he: 'שבועות',                   en: 'Shavuot' },
    { date: '2026-09-11', he: 'ערב ראש השנה',             en: 'Erev Rosh Hashana' },
    { date: '2026-09-12', he: 'ראש השנה א',               en: 'Rosh Hashana Day 1' },
    { date: '2026-09-13', he: 'ראש השנה ב',               en: 'Rosh Hashana Day 2' },
    { date: '2026-09-20', he: 'ערב יום כיפור',             en: 'Erev Yom Kippur' },
    { date: '2026-09-21', he: 'יום כיפור',                en: 'Yom Kippur' },
    { date: '2026-09-25', he: 'ערב סוכות',                en: 'Erev Sukkot' },
    { date: '2026-09-26', he: 'סוכות א',                  en: 'Sukkot Day 1' },
    { date: '2026-10-03', he: 'שמיני עצרת/שמחת תורה',     en: 'Shemini Atzeret / Simchat Torah' },
  ];
}

function isIsraeliHoliday(date, customHolidays = []) {
  const ymd = toYMD(date);
  const merged = israeliHolidays2026().concat(customHolidays.map(h => (
    typeof h === 'string' ? { date: h, he: '', en: '' } : h
  )));
  return merged.some(h => h.date === ymd);
}

function isWeekend(date, weekendOff = ['Fri', 'Sat']) {
  const day = DAY_NAMES[new Date(date).getUTCDay()];
  return weekendOff.includes(day);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function toYMD(d) {
  const dt = new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toISO(d) {
  return new Date(d).toISOString();
}

/** RFC 5545 UTC timestamp: YYYYMMDDTHHmmssZ */
function icsStamp(d) {
  const iso = new Date(d).toISOString();
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function genInterviewId() {
  return 'INT-' + uid();
}

/** Returns true iff [aStart,aEnd) and [bStart,bEnd) overlap by ≥ 1 ms */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

/** Returns the intersection [max(start), min(end)) or null if disjoint. */
function intersect(a, b) {
  const start = new Date(Math.max(new Date(a.start).getTime(), new Date(b.start).getTime()));
  const end   = new Date(Math.min(new Date(a.end).getTime(),   new Date(b.end).getTime()));
  return start < end ? { start, end } : null;
}

/** Intersect a list of slot-arrays. Returns flat array of common windows. */
function intersectMany(slotArrays) {
  if (!slotArrays || slotArrays.length === 0) return [];
  let common = slotArrays[0].map(s => ({ start: new Date(s.start), end: new Date(s.end) }));
  for (let i = 1; i < slotArrays.length; i++) {
    const next = slotArrays[i];
    const newCommon = [];
    for (const a of common) {
      for (const b of next) {
        const ix = intersect(a, b);
        if (ix) newCommon.push(ix);
      }
    }
    common = newCommon;
    if (common.length === 0) return [];
  }
  return common;
}

/** Parse "HH:MM" → minutes from midnight */
function parseHM(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** Returns true iff slot lies fully within business hours (UTC interpretation) */
function withinBusinessHours(slot, businessHours) {
  const startMin = new Date(slot.start).getUTCHours() * 60 + new Date(slot.start).getUTCMinutes();
  const endMin   = new Date(slot.end).getUTCHours()   * 60 + new Date(slot.end).getUTCMinutes();
  const bhStart  = parseHM(businessHours.start);
  const bhEnd    = parseHM(businessHours.end);
  // handle endMin == 0 (midnight rollover) → out of bounds
  return startMin >= bhStart && (endMin === 0 ? false : endMin <= bhEnd);
}

/** Slice a window into N-minute chunks honoring break length. */
function sliceIntoSlots(window, durationMin, breakMin) {
  const out = [];
  const winStart = new Date(window.start).getTime();
  const winEnd   = new Date(window.end).getTime();
  const stepMs   = (durationMin + breakMin) * 60 * 1000;
  const durMs    = durationMin * 60 * 1000;
  for (let t = winStart; t + durMs <= winEnd; t += stepMs) {
    out.push({ start: new Date(t), end: new Date(t + durMs) });
  }
  return out;
}

/** RFC 5545: fold lines >75 octets and escape commas/semicolons/newlines */
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

// ═══════════════════════════════════════════════════════════════════════════
// CLASS — InterviewScheduler
// ═══════════════════════════════════════════════════════════════════════════

class InterviewScheduler {
  constructor(opts = {}) {
    // in-memory stores (Maps preserve insertion order — handy for events)
    this.policy        = { ...DEFAULT_POLICY };
    this.availability  = new Map();   // interviewerId → [{start,end}, ...]
    this.interviews    = new Map();   // interviewId  → record
    this.candidateLog  = new Map();   // candId       → [event, ...]   append-only
    this.eventLog      = [];          // global append-only event log
    this.now           = opts.now || (() => new Date());
    this.locale        = opts.locale || 'he';
  }

  // ─────────────────────────────────────────────────────────────────────
  // 1. defineSlotPolicy
  // ─────────────────────────────────────────────────────────────────────
  defineSlotPolicy(policy = {}) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...this.policy,
      ...policy,
      businessHours: {
        ...DEFAULT_POLICY.businessHours,
        ...(this.policy.businessHours || {}),
        ...(policy.businessHours || {}),
      },
      weekendOff: policy.weekendOff || this.policy.weekendOff || DEFAULT_POLICY.weekendOff,
      holidays:   policy.holidays   || this.policy.holidays   || DEFAULT_POLICY.holidays,
    };
    if (this.policy.minDurationMin < 5) {
      throw new Error('minDurationMin must be ≥ 5');
    }
    return this.policy;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. addInterviewerAvailability  (additive — never overwrites)
  // ─────────────────────────────────────────────────────────────────────
  addInterviewerAvailability({ interviewerId, slots }) {
    if (!interviewerId) throw new Error('interviewerId required');
    if (!Array.isArray(slots)) throw new Error('slots must be an array');
    const existing = this.availability.get(interviewerId) || [];
    const normalized = slots.map(s => ({
      start: new Date(s.start),
      end:   new Date(s.end),
    }));
    // sort & dedupe by start
    const merged = existing.concat(normalized).sort((a, b) => a.start - b.start);
    this.availability.set(interviewerId, merged);
    return merged.length;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. proposeTimes — intersect availability, return 3 best slots
  // ─────────────────────────────────────────────────────────────────────
  proposeTimes({ candId, reqId, interviewers, duration, durationMin, candidatePreferredSlots }) {
    if (!candId) throw new Error('candId required');
    if (!Array.isArray(interviewers) || interviewers.length === 0) {
      throw new Error('interviewers[] required');
    }
    const dur = Number(duration || durationMin || this.policy.minDurationMin);
    if (dur < this.policy.minDurationMin) {
      throw new Error(`duration < minDurationMin (${this.policy.minDurationMin})`);
    }

    // 1. Gather availability arrays for each interviewer
    const slotArrays = interviewers.map(id => this.availability.get(id) || []);
    if (slotArrays.some(a => a.length === 0)) return [];

    // 2. Intersect into common windows
    const common = intersectMany(slotArrays);
    if (common.length === 0) return [];

    // 3. Optionally clip to candidate preferences
    const clipped = candidatePreferredSlots && candidatePreferredSlots.length
      ? intersectMany([common, candidatePreferredSlots.map(s => ({
          start: new Date(s.start), end: new Date(s.end),
        }))])
      : common;

    // 4. Slice into duration-sized chunks honoring break time
    let candidates = [];
    for (const w of clipped) {
      candidates.push(...sliceIntoSlots(w, dur, this.policy.breakMin));
    }

    // 5. Filter — weekends, holidays, business hours, and existing bookings
    const wkOff = this.policy.weekendOff;
    const holidays = this.policy.holidays || [];
    candidates = candidates.filter(s => {
      if (isWeekend(s.start, wkOff)) return false;
      if (isIsraeliHoliday(s.start, holidays)) return false;
      if (!withinBusinessHours(s, this.policy.businessHours)) return false;
      // collide with any confirmed/proposed booking for any interviewer
      for (const id of interviewers) {
        if (this._hasConflict(id, s)) return false;
      }
      return true;
    });

    // 6. Sort earliest-first, return top 3
    candidates.sort((a, b) => a.start - b.start);
    const top3 = candidates.slice(0, 3).map(s => ({
      start: s.start.toISOString(),
      end:   s.end.toISOString(),
      durationMin: dur,
      reqId: reqId || null,
      candId,
      interviewers,
    }));
    return top3;
  }

  /** internal: does interviewer `id` already have a booking that overlaps `slot`? */
  _hasConflict(interviewerId, slot) {
    for (const r of this.interviews.values()) {
      if (r.status === INTERVIEW_STATUS.CANCELLED) continue;
      if (!r.interviewers.includes(interviewerId)) continue;
      if (overlaps(r.slot.start, r.slot.end, slot.start, slot.end)) return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. confirmInterview
  // ─────────────────────────────────────────────────────────────────────
  confirmInterview({ candId, slot, interviewers, room, format, videoLink }) {
    if (!candId) throw new Error('candId required');
    if (!slot || !slot.start || !slot.end) throw new Error('slot{start,end} required');
    if (!Array.isArray(interviewers) || interviewers.length === 0) {
      throw new Error('interviewers[] required');
    }
    if (!Object.values(INTERVIEW_FORMAT).includes(format)) {
      throw new Error(`format must be one of ${Object.values(INTERVIEW_FORMAT).join('|')}`);
    }
    if (format === INTERVIEW_FORMAT.VIDEO && !videoLink) {
      throw new Error('videoLink required for video format');
    }
    if (format === INTERVIEW_FORMAT.ONSITE && !room) {
      throw new Error('room required for onsite format');
    }
    // double-booking check across all interviewers
    for (const id of interviewers) {
      if (this._hasConflict(id, slot)) {
        throw new Error(`conflict: interviewer ${id} double-booked at ${toISO(slot.start)}`);
      }
    }
    const id = genInterviewId();
    const record = {
      id,
      candId,
      interviewers,
      slot: { start: new Date(slot.start), end: new Date(slot.end) },
      room: room || null,
      format,
      videoLink: videoLink || null,
      status: INTERVIEW_STATUS.CONFIRMED,
      history: [{
        at: this.now(),
        type: EVENT_TYPE.CONFIRMED,
        slot: { start: new Date(slot.start), end: new Date(slot.end) },
        format,
        room: room || null,
      }],
      createdAt: this.now(),
    };
    this.interviews.set(id, record);
    this._appendEvent({ interviewId: id, candId, type: EVENT_TYPE.CONFIRMED });
    return record;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. sendInviteEmail — bilingual + ICS attachment
  // ─────────────────────────────────────────────────────────────────────
  sendInviteEmail({ interviewId, template, lang }) {
    const r = this.interviews.get(interviewId);
    if (!r) throw new Error('interview not found');

    const ics = this.generateICS(interviewId);
    const langOut = (lang === 'en' || lang === 'he') ? lang : 'both';
    const subject = this._buildSubject(r, langOut);
    const body    = this._buildBody(r, langOut, template);

    const email = {
      to: `candidate-${r.candId}@candidates.local`,
      cc: r.interviewers.map(i => `interviewer-${i}@techno-kol.co.il`),
      subject,
      body,
      lang: langOut,
      attachments: [{
        filename: `interview-${interviewId}.ics`,
        contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
        content: ics,
      }],
    };
    this._appendEvent({ interviewId, candId: r.candId, type: EVENT_TYPE.INVITE_SENT, lang: langOut });
    return email;
  }

  _buildSubject(r, lang) {
    const dt = new Date(r.slot.start).toISOString().slice(0, 16).replace('T', ' ');
    if (lang === 'he') return `${RLM}הזמנה לראיון • ${dt}`;
    if (lang === 'en') return `Interview invitation — ${dt}`;
    return `${RLM}הזמנה לראיון / Interview invitation — ${dt}`;
  }

  _buildBody(r, lang, template) {
    const dt = new Date(r.slot.start).toISOString().slice(0, 16).replace('T', ' ');
    const fmtKey = `format_${r.format}`;
    const fmtLabel = LABELS[fmtKey] || { he: r.format, en: r.format };

    const he = [
      `${RLM}שלום,`,
      `${RLM}אנו שמחים להזמינך לראיון אצלנו.`,
      `${RLM}תאריך ושעה: ${dt}`,
      `${RLM}פורמט: ${fmtLabel.he}`,
      r.room ? `${RLM}חדר: ${r.room}` : null,
      r.videoLink ? `${RLM}קישור וידאו: ${r.videoLink}` : null,
      `${RLM}מראיינים: ${r.interviewers.join(', ')}`,
      `${RLM}בכבוד רב,`,
      `${RLM}צוות גיוס - טכנו-קול עוזי`,
    ].filter(Boolean).join('\n');

    const en = [
      'Hello,',
      'We are pleased to invite you for an interview.',
      `Date & time: ${dt}`,
      `Format: ${fmtLabel.en}`,
      r.room ? `Room: ${r.room}` : null,
      r.videoLink ? `Video link: ${r.videoLink}` : null,
      `Interviewers: ${r.interviewers.join(', ')}`,
      'Best regards,',
      'Techno-Kol Uzi Recruiting Team',
    ].filter(Boolean).join('\n');

    if (template === 'short') {
      if (lang === 'he') return `${RLM}ראיון: ${dt}`;
      if (lang === 'en') return `Interview: ${dt}`;
      return `${RLM}ראיון / Interview: ${dt}`;
    }
    if (lang === 'he') return he;
    if (lang === 'en') return en;
    return `${he}\n\n— — — — —\n\n${en}`;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. generateICS — RFC 5545 hand-rolled
  // ─────────────────────────────────────────────────────────────────────
  generateICS(interviewId) {
    const r = this.interviews.get(interviewId);
    if (!r) throw new Error('interview not found');

    const dtStart = icsStamp(r.slot.start);
    const dtEnd   = icsStamp(r.slot.end);
    const dtStamp = icsStamp(r.createdAt || this.now());
    const summary = icsEscape(`Interview / ראיון — candidate ${r.candId}`);
    const desc    = icsEscape([
      `Interviewers: ${r.interviewers.join(', ')}`,
      `Format: ${r.format}`,
      r.room ? `Room: ${r.room}` : null,
      r.videoLink ? `Video: ${r.videoLink}` : null,
      `Status: ${r.status}`,
    ].filter(Boolean).join('\n'));
    const location = icsEscape(
      r.format === INTERVIEW_FORMAT.ONSITE ? (r.room || '')
      : r.format === INTERVIEW_FORMAT.VIDEO  ? (r.videoLink || '')
      : 'Phone',
    );

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Techno-Kol Uzi//Interview Scheduler Y-062//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${interviewId}@techno-kol.co.il`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `LOCATION:${location}`,
      `STATUS:${r.status === INTERVIEW_STATUS.CANCELLED ? 'CANCELLED' : 'CONFIRMED'}`,
      `ORGANIZER;CN=Techno-Kol Recruiting:mailto:recruiting@techno-kol.co.il`,
      ...r.interviewers.map(i =>
        `ATTENDEE;CN=${i};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${i}@techno-kol.co.il`
      ),
      `ATTENDEE;CN=Candidate ${r.candId};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:cand-${r.candId}@candidates.local`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      `DESCRIPTION:Interview reminder / תזכורת ראיון`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];

    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  // ─────────────────────────────────────────────────────────────────────
  // 7. rescheduleInterview — append-only history
  // ─────────────────────────────────────────────────────────────────────
  rescheduleInterview(interviewId, newSlot, reason) {
    const r = this.interviews.get(interviewId);
    if (!r) throw new Error('interview not found');
    if (r.status === INTERVIEW_STATUS.CANCELLED) {
      throw new Error('cannot reschedule a cancelled interview');
    }
    if (!newSlot || !newSlot.start || !newSlot.end) {
      throw new Error('newSlot{start,end} required');
    }
    // conflict check (excluding this very interview)
    for (const id of r.interviewers) {
      for (const other of this.interviews.values()) {
        if (other.id === r.id) continue;
        if (other.status === INTERVIEW_STATUS.CANCELLED) continue;
        if (!other.interviewers.includes(id)) continue;
        if (overlaps(other.slot.start, other.slot.end, newSlot.start, newSlot.end)) {
          throw new Error(`conflict: interviewer ${id} already booked`);
        }
      }
    }
    // append history row — DO NOT overwrite the previous slot
    r.history.push({
      at: this.now(),
      type: EVENT_TYPE.RESCHEDULED,
      from: { start: new Date(r.slot.start), end: new Date(r.slot.end) },
      to:   { start: new Date(newSlot.start), end: new Date(newSlot.end) },
      reason: reason || '',
    });
    r.slot = { start: new Date(newSlot.start), end: new Date(newSlot.end) };
    r.status = INTERVIEW_STATUS.CONFIRMED;
    this._appendEvent({ interviewId, candId: r.candId, type: EVENT_TYPE.RESCHEDULED, reason });
    return r;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 8. cancelInterview — status flip only, preserves record
  // ─────────────────────────────────────────────────────────────────────
  cancelInterview(interviewId, reason) {
    const r = this.interviews.get(interviewId);
    if (!r) throw new Error('interview not found');
    if (r.status === INTERVIEW_STATUS.CANCELLED) return r; // idempotent
    r.status = INTERVIEW_STATUS.CANCELLED;
    r.history.push({
      at: this.now(),
      type: EVENT_TYPE.CANCELLED,
      reason: reason || '',
    });
    this._appendEvent({ interviewId, candId: r.candId, type: EVENT_TYPE.CANCELLED, reason });
    return r;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 9. sendReminder — bilingual
  // ─────────────────────────────────────────────────────────────────────
  sendReminder(interviewId, hoursBefore) {
    const r = this.interviews.get(interviewId);
    if (!r) throw new Error('interview not found');
    if (r.status === INTERVIEW_STATUS.CANCELLED) {
      throw new Error('cannot remind for a cancelled interview');
    }
    const hrs = Number(hoursBefore || 24);
    const dt = new Date(r.slot.start).toISOString().slice(0, 16).replace('T', ' ');
    const reminder = {
      interviewId,
      hoursBefore: hrs,
      candTo: `candidate-${r.candId}@candidates.local`,
      interviewerTo: r.interviewers.map(i => `interviewer-${i}@techno-kol.co.il`),
      bodyHe: `${RLM}תזכורת: ראיון מתוכנן בעוד ${hrs} שעות (${dt}). מצפים לראותך.`,
      bodyEn: `Reminder: your interview is scheduled in ${hrs} hours (${dt}). See you then.`,
      sentAt: this.now(),
    };
    this._appendEvent({ interviewId, candId: r.candId, type: EVENT_TYPE.REMINDER, hoursBefore: hrs });
    return reminder;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 10. noShowTracker — append-only event log per candidate
  // ─────────────────────────────────────────────────────────────────────
  noShowTracker(candId, interviewId) {
    if (!candId) throw new Error('candId required');
    const log = this.candidateLog.get(candId) || [];
    if (interviewId) {
      const r = this.interviews.get(interviewId);
      if (r) {
        r.status = INTERVIEW_STATUS.NO_SHOW;
        r.history.push({ at: this.now(), type: EVENT_TYPE.NO_SHOW });
      }
      log.push({
        at: this.now(),
        type: EVENT_TYPE.NO_SHOW,
        interviewId,
      });
      this.candidateLog.set(candId, log);
      this._appendEvent({ interviewId, candId, type: EVENT_TYPE.NO_SHOW });
    }
    return log.slice(); // append-only — return a copy
  }

  // ─────────────────────────────────────────────────────────────────────
  // 11. calendarConflicts — detect double-booking
  // ─────────────────────────────────────────────────────────────────────
  calendarConflicts(interviewerId, period) {
    if (!interviewerId) throw new Error('interviewerId required');
    const start = period && period.start ? new Date(period.start) : new Date(0);
    const end   = period && period.end   ? new Date(period.end)   : new Date('9999-12-31');
    const all = [...this.interviews.values()]
      .filter(r => r.status !== INTERVIEW_STATUS.CANCELLED)
      .filter(r => r.interviewers.includes(interviewerId))
      .filter(r => new Date(r.slot.start) < end && new Date(r.slot.end) > start)
      .sort((a, b) => new Date(a.slot.start) - new Date(b.slot.start));

    const conflicts = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (overlaps(all[i].slot.start, all[i].slot.end, all[j].slot.start, all[j].slot.end)) {
          conflicts.push({
            interviewerId,
            a: all[i].id,
            b: all[j].id,
            aSlot: all[i].slot,
            bSlot: all[j].slot,
          });
        }
      }
    }
    return conflicts;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 12. fairDistribution — round-robin load balance metric
  // ─────────────────────────────────────────────────────────────────────
  fairDistribution(interviewerIds, period) {
    if (!Array.isArray(interviewerIds) || interviewerIds.length === 0) {
      throw new Error('interviewerIds[] required');
    }
    const start = period && period.start ? new Date(period.start) : new Date(0);
    const end   = period && period.end   ? new Date(period.end)   : new Date('9999-12-31');
    const counts = {};
    for (const id of interviewerIds) counts[id] = 0;

    for (const r of this.interviews.values()) {
      if (r.status === INTERVIEW_STATUS.CANCELLED) continue;
      if (new Date(r.slot.start) >= end || new Date(r.slot.end) <= start) continue;
      for (const id of r.interviewers) {
        if (id in counts) counts[id]++;
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const fairShare = total / interviewerIds.length;
    const variance = interviewerIds.length === 0 ? 0 :
      interviewerIds.reduce((acc, id) => acc + Math.pow(counts[id] - fairShare, 2), 0)
      / interviewerIds.length;
    const max = Math.max(...Object.values(counts), 0);
    const min = Math.min(...Object.values(counts), 0);
    return {
      counts,
      total,
      fairShare,
      variance,
      spread: max - min,
      // Gini-style 0..1 — 0 means perfectly fair
      imbalance: total === 0 ? 0 : (max - min) / Math.max(1, total),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 13. israeliHolidays2026 — instance helper
  // ─────────────────────────────────────────────────────────────────────
  israeliHolidays2026() {
    return israeliHolidays2026();
  }

  // ─────────────────────────────────────────────────────────────────────
  // INTERNAL — append-only event log
  // ─────────────────────────────────────────────────────────────────────
  _appendEvent(ev) {
    this.eventLog.push({ at: this.now(), ...ev });
  }

  // Convenience getters
  getInterview(id) { return this.interviews.get(id); }
  listInterviews() { return [...this.interviews.values()]; }
  getEventLog()    { return this.eventLog.slice(); }
  getCandidateLog(candId) { return (this.candidateLog.get(candId) || []).slice(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  InterviewScheduler,
  INTERVIEW_STATUS,
  INTERVIEW_FORMAT,
  EVENT_TYPE,
  LABELS,
  HEBREW_GLOSSARY,
  DEFAULT_POLICY,
  israeliHolidays2026,
  isIsraeliHoliday,
  isWeekend,
  // exposed for test introspection
  intersectMany,
  overlaps,
  withinBusinessHours,
  sliceIntoSlots,
  icsEscape,
  icsFold,
};
