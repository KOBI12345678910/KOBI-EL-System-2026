/**
 * Customer Meeting Scheduler — Unit Tests  |  מבחני מתזמן פגישות
 * =============================================================
 *
 * Agent Y-097  |  Swarm Customer-Ops  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:  node --test onyx-procurement/test/customer/meeting-scheduler.test.js
 *
 * Covers:
 *   • defineMeetingType happy-path + upgrade-in-place (never delete)
 *   • setAvailability — Israeli business hours default, exceptions
 *   • generateBookingLink — slug uniqueness
 *   • publicSlots — weekly windows, advanceNotice, buffer, maxPerDay,
 *     slot granularity, date-range clamping, exception blocking
 *   • bookMeeting — success, form-required rejection, too-soon, double-
 *     booking prevention, daily-cap enforcement
 *   • rescheduleRequest — slot clash & audit-trail preservation
 *   • cancel — status kept, reminders suppressed (never delete)
 *   • reminders — 24h + 1h default, offset parsing, bilingual template
 *   • videoLink — stub + bridge preference
 *   • noShowTracking — attended / no-show + survey side-effect
 *   • postMeetingSurvey — idempotency
 *   • calendarSync — dry-run event shape + bridge passthrough
 *   • audit trail is append-only
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  MeetingScheduler,
  LABELS,
  labels,
  TEMPLATES,
  buildNotification,
  offsetToMinutes,
  normalizeWeekly,
  DEFAULT_WEEKLY_SCHEDULE,
  DEFAULT_TIMEZONE,
  _internal,
} = require(path.resolve(
  __dirname, '..', '..',
  'src', 'customer', 'meeting-scheduler.js',
));

/* ---------- fixtures ---------- */

function fixedClock(iso) {
  let now = new Date(iso);
  return {
    now: () => new Date(now.getTime()),
    advance: (ms) => { now = new Date(now.getTime() + ms); },
    set: (iso2) => { now = new Date(iso2); },
  };
}

function counterId() {
  let n = 0;
  return () => {
    n += 1;
    return String(n).padStart(6, '0');
  };
}

function seed() {
  // 2026-04-13 Monday at 08:00 UTC → well before the 09:00 window.
  const clock = fixedClock('2026-04-13T08:00:00.000Z');
  const rid = counterId();
  const sent = [];
  const notifier = { send: (x) => sent.push(x) };
  const sch = new MeetingScheduler({
    clock: clock.now,
    randomId: rid,
    notifier,
  });
  sch.defineMeetingType({
    id: 'demo',
    name_he: 'שיחת הדגמה',
    name_en: 'Demo call',
    duration: 30,
    buffer: 0,
    advanceNotice: 0,
    maxPerDay: 6,
    hosts: ['uzi'],
    location: 'video',
    videoProvider: 'zoom',
    bookingForm: [
      { key: 'company', label_he: 'חברה', label_en: 'Company', required: true },
      { key: 'topic',   label_he: 'נושא', label_en: 'Topic',   required: false },
    ],
  });
  sch.setAvailability({
    userId: 'uzi',
    weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
    timezone: DEFAULT_TIMEZONE,
    exceptions: [],
  });
  return { sch, clock, sent };
}

/* =====================================================================
 * LABELS / templates
 * ===================================================================*/

test('labels: all labels expose he+en and fallback for unknown', () => {
  for (const k of Object.keys(LABELS)) {
    assert.ok(LABELS[k].he, `${k}.he`);
    assert.ok(LABELS[k].en, `${k}.en`);
  }
  const unknown = labels('zzznope');
  assert.equal(unknown.he, 'zzznope');
  assert.equal(unknown.en, 'zzznope');
});

test('buildNotification produces bilingual envelope with interpolation', () => {
  const n = buildNotification('confirm', {
    guest: 'Dana', host: 'Uzi',
    when: '2026-04-13T09:00:00.000Z',
    meeting: 'Demo', duration: 30, location: 'video',
    manageUrl: 'https://x/manage/a',
  });
  assert.match(n.subject_he, /Demo/);
  assert.match(n.subject_en, /Demo/);
  assert.match(n.body_he, /שלום Dana/);
  assert.match(n.body_en, /Hello Dana/);
});

test('offsetToMinutes accepts d / h / m forms and raw numbers', () => {
  assert.equal(offsetToMinutes('24h'), 24 * 60);
  assert.equal(offsetToMinutes('1h'),  60);
  assert.equal(offsetToMinutes('30m'), 30);
  assert.equal(offsetToMinutes('2d'),  2 * 24 * 60);
  assert.equal(offsetToMinutes(45),    45);
  assert.throws(() => offsetToMinutes('weird'));
});

test('normalizeWeekly accepts numeric / english / hebrew day keys', () => {
  const w = normalizeWeekly({
    0: [{ start: '09:00', end: '10:00' }],
    monday: { start: '11:00', end: '12:00' },
    שלישי: [{ start: '14:00', end: '15:00' }],
  });
  assert.equal(w[0][0].start, '09:00');
  assert.equal(w[1][0].start, '11:00');
  assert.equal(w[2][0].start, '14:00');
  assert.deepEqual(w[6], []);
});

/* =====================================================================
 * defineMeetingType
 * ===================================================================*/

test('defineMeetingType rejects bad config', () => {
  const sch = new MeetingScheduler();
  assert.throws(() => sch.defineMeetingType());
  assert.throws(() => sch.defineMeetingType({ id: 'x' }));
  assert.throws(() => sch.defineMeetingType({
    id: 'x', name_he: 'a', duration: 0,
  }));
  assert.throws(() => sch.defineMeetingType({
    id: 'x', name_he: 'a', duration: 30, location: 'nope',
  }));
});

test('defineMeetingType upgrades in place & preserves prior revisions', () => {
  const sch = new MeetingScheduler({ randomId: counterId() });
  sch.defineMeetingType({
    id: 'demo', name_he: 'א', name_en: 'A', duration: 30, location: 'phone',
  });
  sch.defineMeetingType({
    id: 'demo', name_he: 'ב', name_en: 'B', duration: 45, location: 'phone',
  });
  const list = sch.listMeetingTypes();
  assert.equal(list.length, 1);
  assert.equal(list[0].duration, 45);
  assert.equal(list[0].name_he, 'ב');
  // Internal: versions preserved (never delete)
  assert.ok(sch._meetingTypes.get('demo')._versions.length >= 1);
  assert.equal(sch._meetingTypes.get('demo')._versions[0].duration, 30);
});

/* =====================================================================
 * setAvailability
 * ===================================================================*/

test('setAvailability defaults to Israeli business hours — shabbat closed', () => {
  const sch = new MeetingScheduler();
  sch.setAvailability({ userId: 'uzi' });
  const a = sch.getAvailability('uzi');
  assert.equal(a.timezone, 'Asia/Jerusalem');
  assert.deepEqual(a.weeklySchedule[6], []); // Saturday closed
  assert.equal(a.weeklySchedule[0][0].start, '09:00'); // Sunday 9
  assert.equal(a.weeklySchedule[5][0].end,   '13:00'); // Friday short
});

test('setAvailability upgrade-in-place keeps prior versions', () => {
  const sch = new MeetingScheduler();
  sch.setAvailability({ userId: 'uzi', weeklySchedule: DEFAULT_WEEKLY_SCHEDULE });
  sch.setAvailability({
    userId: 'uzi',
    weeklySchedule: { 1: [{ start: '10:00', end: '11:00' }] },
  });
  const a = sch.getAvailability('uzi');
  assert.equal(a.weeklySchedule[1][0].start, '10:00');
  assert.equal(sch._availability.get('uzi')._versions.length, 1);
});

/* =====================================================================
 * generateBookingLink
 * ===================================================================*/

test('generateBookingLink returns unique shareable URLs', () => {
  const { sch } = seed();
  const a = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo', campaign: 'spring',
  });
  const b = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo', campaign: 'spring',
  });
  assert.ok(a.ok && b.ok);
  assert.notEqual(a.url, b.url);
  assert.match(a.url, /\/book\//);
  assert.match(b.slug, /-/);
  const links = sch.listLinks('uzi');
  assert.equal(links.length, 2);
});

test('generateBookingLink rejects unknown host or meeting type', () => {
  const { sch } = seed();
  assert.throws(() => sch.generateBookingLink({ userId: 'x', meetingTypeId: 'demo' }));
  assert.throws(() => sch.generateBookingLink({ userId: 'uzi', meetingTypeId: 'x' }));
});

/* =====================================================================
 * publicSlots — availability calculation
 * ===================================================================*/

test('publicSlots returns 30-min windows inside business hours', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  // Same Monday, ask for slots between 09:00 and 11:00
  const slots = sch.publicSlots(linkId, {
    from: '2026-04-13T09:00:00.000Z',
    to:   '2026-04-13T11:00:00.000Z',
  });
  const starts = slots.map((s) => s.start);
  assert.ok(starts.includes('2026-04-13T09:00:00.000Z'));
  assert.ok(starts.includes('2026-04-13T09:30:00.000Z'));
  assert.ok(starts.includes('2026-04-13T10:00:00.000Z'));
  assert.ok(starts.includes('2026-04-13T10:30:00.000Z'));
  for (const s of slots) assert.equal(s.duration, 30);
});

test('publicSlots skips closed days (saturday)', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  // 2026-04-18 is Saturday
  const sat = sch.publicSlots(linkId, {
    from: '2026-04-18T00:00:00.000Z',
    to:   '2026-04-18T23:59:00.000Z',
  });
  assert.equal(sat.length, 0);
});

test('publicSlots enforces advanceNotice', () => {
  const clock = fixedClock('2026-04-13T09:30:00.000Z');
  const sch = new MeetingScheduler({ clock: clock.now, randomId: counterId() });
  sch.defineMeetingType({
    id: 'demo', name_he: 'ד', name_en: 'D',
    duration: 30, advanceNotice: 120, location: 'phone',
  });
  sch.setAvailability({ userId: 'uzi' });
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const slots = sch.publicSlots(linkId, {
    from: '2026-04-13T09:00:00.000Z',
    to:   '2026-04-13T13:00:00.000Z',
  });
  // earliest = 11:30
  for (const s of slots) assert.ok(new Date(s.start) >= new Date('2026-04-13T11:30:00.000Z'));
});

test('publicSlots honours exceptions (blocked day)', () => {
  const { sch } = seed();
  sch.setAvailability({
    userId: 'uzi',
    weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
    exceptions: [{ date: '2026-04-14', blocked: true, note: 'חג' }],
  });
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const slots = sch.publicSlots(linkId, {
    from: '2026-04-14T00:00:00.000Z',
    to:   '2026-04-14T23:00:00.000Z',
  });
  assert.equal(slots.length, 0);
});

test('publicSlots honours maxPerDay cap from prior bookings', () => {
  const { sch } = seed();
  // re-define demo with maxPerDay=2
  sch.defineMeetingType({
    id: 'demo', name_he: 'ד', name_en: 'D', duration: 30,
    maxPerDay: 2, location: 'phone',
  });
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@example.com', name: 'A' },
    formAnswers: { company: 'AC' },
  });
  sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:30:00.000Z' },
    guestInfo: { email: 'b@example.com', name: 'B' },
    formAnswers: { company: 'BC' },
  });
  const slots = sch.publicSlots(linkId, {
    from: '2026-04-13T09:00:00.000Z',
    to:   '2026-04-13T16:00:00.000Z',
  });
  // No slots left on the capped day
  const sameDay = slots.filter((s) => s.date === '2026-04-13');
  assert.equal(sameDay.length, 0);
});

/* =====================================================================
 * bookMeeting — happy path + double-booking prevention
 * ===================================================================*/

test('bookMeeting: happy path sends bilingual confirmation + auto video link', () => {
  const { sch, sent } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const res = sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'dana@example.com', name: 'Dana' },
    formAnswers: { company: 'Acme' },
  });
  assert.ok(res.ok);
  assert.equal(res.booking.status, 'scheduled');
  assert.ok(res.booking.videoUrl.startsWith('https://zoom.us/j/'));
  assert.equal(res.confirmation.subject_he.includes('אישור'), true);
  assert.equal(res.confirmation.subject_en.includes('confirmation'), true);
  assert.equal(sent.length >= 1, true); // confirmation sent
});

test('bookMeeting: required form field missing is rejected', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const res = sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'dana@example.com', name: 'Dana' },
    formAnswers: {},
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'form_required:company');
});

test('bookMeeting: too-soon (before advanceNotice) rejected', () => {
  const clock = fixedClock('2026-04-13T08:55:00.000Z');
  const sch = new MeetingScheduler({ clock: clock.now, randomId: counterId() });
  sch.defineMeetingType({
    id: 'demo', name_he: 'ד', name_en: 'D',
    duration: 30, advanceNotice: 60, location: 'phone',
  });
  sch.setAvailability({ userId: 'uzi' });
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const res = sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' }, // only 5 min away
    guestInfo: { email: 'x@y.com' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'too_soon');
});

test('bookMeeting: double-booking the same host/slot is rejected', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const ok = sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@example.com' },
    formAnswers: { company: 'AC' },
  });
  assert.ok(ok.ok);
  const bad = sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'b@example.com' },
    formAnswers: { company: 'BC' },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'slot_taken');
  assert.ok(bad.conflictId);
});

test('bookMeeting: buffer prevents back-to-back clashes', () => {
  const clock = fixedClock('2026-04-13T08:00:00.000Z');
  const sch = new MeetingScheduler({ clock: clock.now, randomId: counterId() });
  sch.defineMeetingType({
    id: 'demo', name_he: 'ד', name_en: 'D',
    duration: 30, buffer: 15, location: 'phone',
  });
  sch.setAvailability({ userId: 'uzi' });
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' },
  });
  const bad = sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:30:00.000Z' }, // collides because of 15m buffer
    guestInfo: { email: 'b@x.com' },
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'slot_taken');
});

/* =====================================================================
 * rescheduleRequest
 * ===================================================================*/

test('rescheduleRequest moves slot + preserves history + reschedules reminders', () => {
  const { sch, sent } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId,
    slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' },
    formAnswers: { company: 'AC' },
  });
  const r = sch.rescheduleRequest({
    bookingId: book.id,
    newSlot: { start: '2026-04-13T10:00:00.000Z' },
    requester: 'host',
    reason: 'rescheduled per guest',
  });
  assert.ok(r.ok);
  assert.equal(r.oldSlot.start, '2026-04-13T09:00:00.000Z');
  assert.equal(r.newSlot.start, '2026-04-13T10:00:00.000Z');
  const b = sch.getBooking(book.id);
  assert.equal(b.status, 'rescheduled');
  assert.ok(b.statusHistory.length >= 2); // scheduled + rescheduled
  // Reminders were recomputed against the new start time
  const rems = sch.listReminders(book.id);
  assert.equal(rems.length, 2);
  const fireTimes = rems.map((r) => r.fireAt).sort();
  assert.ok(fireTimes.includes('2026-04-12T10:00:00.000Z')); // 24h before new slot
  assert.ok(fireTimes.includes('2026-04-13T09:00:00.000Z')); // 1h before new slot
  // A reschedule notification was sent
  assert.ok(sent.some((s) =>
    s.notification.subject_en.startsWith('Meeting rescheduled')));
});

test('rescheduleRequest into a conflicting slot is rejected', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const a = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const b = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T10:00:00.000Z' },
    guestInfo: { email: 'b@x.com' }, formAnswers: { company: 'BC' },
  });
  const res = sch.rescheduleRequest({
    bookingId: a.id,
    newSlot: { start: '2026-04-13T10:00:00.000Z' },
    requester: 'host',
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'slot_taken');
  assert.equal(res.conflictId, b.id);
});

/* =====================================================================
 * cancel — never delete
 * ===================================================================*/

test('cancel keeps booking row and suppresses reminders', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const before = sch.listReminders(book.id);
  assert.equal(before.every((r) => r.status === 'scheduled'), true);
  const res = sch.cancel({ bookingId: book.id, reason: 'out of town' });
  assert.ok(res.ok);
  const still = sch.getBooking(book.id);
  assert.equal(still.status, 'cancelled');
  assert.ok(still.statusHistory.some((h) => h.status === 'cancelled'));
  const after = sch.listReminders(book.id);
  assert.equal(after.every((r) => r.status === 'suppressed'), true);
});

test('cancel is idempotent', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  sch.cancel({ bookingId: book.id, reason: 'r' });
  const again = sch.cancel({ bookingId: book.id, reason: 'r' });
  assert.equal(again.ok, true);
  assert.equal(again.alreadyCancelled, true);
});

/* =====================================================================
 * reminders — scheduling
 * ===================================================================*/

test('reminders default to 24h + 1h offsets with bilingual envelope', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const rems = sch.listReminders(book.id);
  assert.equal(rems.length, 2);
  const offsets = rems.map((r) => r.offsetMin).sort((a, b) => b - a);
  assert.deepEqual(offsets, [24 * 60, 60]);
  for (const r of rems) {
    assert.ok(r.notification.subject_he.includes('תזכורת'));
    assert.ok(r.notification.subject_en.includes('Reminder'));
  }
});

test('reminders accepts custom offset list', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const rems = sch.reminders({ bookingId: book.id, offsets: ['2d', '4h', '15m'] });
  const offs = rems.map((r) => r.offsetMin);
  assert.deepEqual(offs.sort((a, b) => b - a), [2 * 24 * 60, 4 * 60, 15]);
});

/* =====================================================================
 * videoLink
 * ===================================================================*/

test('videoLink stubs a deterministic URL per provider when no bridge', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const vl = sch.videoLink(book.id);
  assert.ok(vl.ok);
  assert.equal(vl.provider, 'zoom');
  assert.match(vl.url, /^https:\/\/zoom\.us\//);
});

test('videoLink prefers a wired bridge when provided', () => {
  const clock = fixedClock('2026-04-13T08:00:00.000Z');
  const videoBridge = {
    createMeeting: () => ({ url: 'https://example.com/custom', provider: 'meet' }),
  };
  const sch = new MeetingScheduler({ clock: clock.now, randomId: counterId(), videoBridge });
  sch.defineMeetingType({
    id: 'demo', name_he: 'ד', name_en: 'D', duration: 30,
    location: 'video', videoProvider: 'meet',
  });
  sch.setAvailability({ userId: 'uzi' });
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' },
  });
  assert.equal(book.booking.videoUrl, 'https://example.com/custom');
});

/* =====================================================================
 * noShowTracking + survey
 * ===================================================================*/

test('noShowTracking: attended triggers survey side-effect', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const r = sch.noShowTracking(book.id, 'attended');
  assert.ok(r.ok);
  const b = sch.getBooking(book.id);
  assert.equal(b.status, 'attended');
  assert.equal(b.attended, true);
  assert.equal(b.surveySent, true);
  assert.ok(b.surveyId);
});

test('noShowTracking: no-show does NOT trigger the survey', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  sch.noShowTracking(book.id, 'no-show');
  const b = sch.getBooking(book.id);
  assert.equal(b.status, 'no-show');
  assert.equal(b.surveySent, false);
});

test('postMeetingSurvey is idempotent', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const first = sch.postMeetingSurvey(book.id);
  const second = sch.postMeetingSurvey(book.id);
  assert.equal(second.alreadySent, true);
  assert.equal(second.surveyId, first.surveyId);
});

/* =====================================================================
 * calendarSync
 * ===================================================================*/

test('calendarSync dry-run returns bookings as events', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  const res = sch.calendarSync('uzi');
  assert.ok(res.ok);
  assert.equal(res.provider, 'dry-run');
  assert.equal(res.events.length, 1);
  assert.match(res.events[0].summary, /Meeting demo/);
});

test('calendarSync passes through to bridge when wired', () => {
  const clock = fixedClock('2026-04-13T08:00:00.000Z');
  const calls = [];
  const bridge = {
    syncUser: (p) => {
      calls.push(p);
      return { provider: 'google', synced: p.events.length };
    },
  };
  const sch = new MeetingScheduler({
    clock: clock.now, randomId: counterId(), calendarBridge: bridge,
  });
  sch.defineMeetingType({
    id: 'demo', name_he: 'ד', name_en: 'D', duration: 30, location: 'phone',
  });
  sch.setAvailability({ userId: 'uzi' });
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' },
  });
  const r = sch.calendarSync('uzi');
  assert.ok(r.ok);
  assert.equal(r.provider, 'google');
  assert.equal(r.synced, 1);
  assert.equal(calls.length, 1);
});

/* =====================================================================
 * audit trail
 * ===================================================================*/

test('audit trail is append-only and captures every mutation', () => {
  const { sch } = seed();
  const { id: linkId } = sch.generateBookingLink({
    userId: 'uzi', meetingTypeId: 'demo',
  });
  const book = sch.bookMeeting({
    linkId, slot: { start: '2026-04-13T09:00:00.000Z' },
    guestInfo: { email: 'a@x.com' }, formAnswers: { company: 'AC' },
  });
  sch.rescheduleRequest({
    bookingId: book.id,
    newSlot: { start: '2026-04-13T10:00:00.000Z' },
  });
  sch.cancel({ bookingId: book.id, reason: 'test' });
  const trail = sch.getAuditTrail();
  const events = trail.map((x) => x.event);
  assert.ok(events.includes('meeting_type.upsert'));
  assert.ok(events.includes('availability.upsert'));
  assert.ok(events.includes('link.create'));
  assert.ok(events.includes('booking.create'));
  assert.ok(events.includes('booking.reminders'));
  assert.ok(events.includes('booking.reschedule'));
  assert.ok(events.includes('booking.cancel'));
});

/* =====================================================================
 * ======================================================================
 *             Y-097  EXTERNAL-SALES MEETING SCHEDULER TESTS
 * ======================================================================
 * ===================================================================*/

const {
  ISRAELI_HOLIDAYS_2026,
  isIsraeliHoliday,
  icsStamp,
  intersectRange,
  intersectMany,
} = require(path.resolve(
  __dirname, '..', '..', 'src', 'customer', 'meeting-scheduler.js',
));

/** Y-097 fixture — multi-owner + customer scope, no Calendly link. */
function seedY097() {
  // 2026-04-13 is a Monday (non-holiday) at 06:00 UTC so any working
  // hour inside 09:00-18:00 UTC is in the future from the clock.
  const clock = fixedClock('2026-04-13T06:00:00.000Z');
  const rid = counterId();
  const sent = [];
  const notifier = { send: (x) => sent.push(x) };
  const sch = new MeetingScheduler({
    clock: clock.now,
    randomId: rid,
    notifier,
  });
  sch.defineMeetingType({
    id: 'discovery',
    name_he: 'פגישת היכרות',
    name_en: 'Discovery meeting',
    durationMin: 60,
    buffer: 0,
    location: 'video',
    bookingLink: 'https://scheduler.technokol.local/discovery',
  });
  sch.defineMeetingType({
    id: 'site-visit',
    name_he: 'ביקור באתר לקוח',
    name_en: 'Customer site visit',
    durationMin: 90,
    location: 'customer-site',
  });
  // Default Sun-Thu 09-18 auto-seeded for owners via lazy ensure.
  return { sch, clock, sent };
}

/* ---------- 1. defineMeetingType accepts new location vocabulary ---------- */
test('Y-097: defineMeetingType accepts onsite / customer-site / video / phone', () => {
  const sch = new MeetingScheduler();
  sch.defineMeetingType({
    id: 't1', name_he: 'אונסייט', name_en: 'Onsite',
    durationMin: 60, location: 'onsite',
  });
  sch.defineMeetingType({
    id: 't2', name_he: 'ביקור', name_en: 'Site',
    durationMin: 45, location: 'customer-site',
  });
  sch.defineMeetingType({
    id: 't3', name_he: 'טלפון', name_en: 'Phone',
    durationMin: 15, location: 'phone',
  });
  const list = sch.listMeetingTypes().map((m) => m.id).sort();
  assert.deepEqual(list, ['t1', 't2', 't3']);
  assert.throws(() => sch.defineMeetingType({
    id: 'bad', name_he: 'x', name_en: 'x',
    durationMin: 30, location: 'nope',
  }));
});

/* ---------- 2. defineMeetingType stores bilingual names + bookingLink ---------- */
test('Y-097: defineMeetingType stores Hebrew+English names and bookingLink', () => {
  const { sch } = seedY097();
  const [disc] = sch.listMeetingTypes().filter((m) => m.id === 'discovery');
  assert.equal(disc.name_he, 'פגישת היכרות');
  assert.equal(disc.name_en, 'Discovery meeting');
  assert.equal(disc.durationMin, 60);
  assert.equal(disc.bookingLink, 'https://scheduler.technokol.local/discovery');
});

/* ---------- 3. proposeSlots: owner intersection ---------- */
test('Y-097: proposeSlots returns intersection of owner availability windows', () => {
  const { sch } = seedY097();
  // uzi uses default 09-18. alice gets a tighter 10-12 window.
  sch.setAvailability({
    userId: 'alice',
    weeklySchedule: {
      1: [{ start: '10:00', end: '12:00' }],
      2: [{ start: '10:00', end: '12:00' }],
      3: [{ start: '10:00', end: '12:00' }],
      4: [{ start: '10:00', end: '12:00' }],
      0: [{ start: '10:00', end: '12:00' }],
    },
  });
  const slots = sch.proposeSlots({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    preferredTimeRange: {
      from: '2026-04-13T00:00:00.000Z',
      to:   '2026-04-13T23:59:59.000Z',
    },
    owners: ['uzi', 'alice'],
  });
  assert.ok(slots.length >= 1, 'at least one intersection slot');
  // All returned slots must start at-or-after 10:00 (alice's floor)
  // and end at-or-before 12:00 (alice's ceiling).
  for (const s of slots) {
    const sh = new Date(s.start).getUTCHours();
    const eh = new Date(s.end).getUTCHours();
    const em = new Date(s.end).getUTCMinutes();
    assert.ok(sh >= 10, `start hour ${sh} must be >= 10`);
    assert.ok((eh === 12 && em === 0) || eh < 12, `end hour ${eh}:${em} must be <= 12:00`);
    assert.equal(s.duration, 60);
    assert.deepEqual(s.owners, ['uzi', 'alice']);
  }
});

/* ---------- 4. proposeSlots: skips Israeli holidays ---------- */
test('Y-097: proposeSlots excludes Israeli holidays (Yom HaAtzmaut 2026-04-22)', () => {
  const { sch } = seedY097();
  const slots = sch.proposeSlots({
    customerId: 'cust-77',
    meetingTypeId: 'discovery',
    preferredTimeRange: {
      // 2026-04-22 Wednesday is Yom HaAtzmaut (full-day holiday).
      from: '2026-04-22T00:00:00.000Z',
      to:   '2026-04-22T23:59:59.000Z',
    },
    owners: ['uzi'],
  });
  assert.equal(slots.length, 0, 'no slots on Yom HaAtzmaut');
});

/* ---------- 5. proposeSlots: shabbat/weekend closed by default ---------- */
test('Y-097: proposeSlots returns empty on Saturday (Shabbat)', () => {
  const { sch } = seedY097();
  const slots = sch.proposeSlots({
    customerId: 'cust-shabbat',
    meetingTypeId: 'discovery',
    preferredTimeRange: {
      // 2026-04-18 is a Saturday (Shabbat) — completely off.
      from: '2026-04-18T00:00:00.000Z',
      to:   '2026-04-18T23:59:59.000Z',
    },
    owners: ['uzi'],
  });
  assert.equal(slots.length, 0);
});

/* ---------- 6. bookMeeting: external-sales path happy-case ---------- */
test('Y-097: bookMeeting books a customer meeting with owners, agenda, notes', () => {
  const { sch } = seedY097();
  const res = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: {
      start: '2026-04-13T10:00:00.000Z',
      end:   '2026-04-13T11:00:00.000Z',
    },
    owners: ['uzi', 'alice'],
    agenda: 'Intro + roadmap review',
    notes: 'Customer uses legacy ERP',
  });
  assert.equal(res.ok, true);
  assert.ok(res.id.startsWith('mtg_'), 'meeting id has mtg_ prefix');
  assert.equal(res.meeting.status, 'scheduled');
  assert.equal(res.meeting.customerId, 'cust-42');
  assert.deepEqual(res.meeting.owners, ['uzi', 'alice']);
  assert.equal(res.meeting.agenda, 'Intro + roadmap review');
});

/* ---------- 7. bookMeeting: double-booking one owner is rejected ---------- */
test('Y-097: bookMeeting rejects when any owner is already busy', () => {
  const { sch } = seedY097();
  sch.bookMeeting({
    customerId: 'cust-A',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  const clash = sch.bookMeeting({
    customerId: 'cust-B',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:30:00.000Z', end: '2026-04-13T11:30:00.000Z' },
    owners: ['uzi', 'bob'],
  });
  assert.equal(clash.ok, false);
  assert.equal(clash.reason, 'slot_taken');
});

/* ---------- 8. sendConfirmation: bilingual + ICS attached ---------- */
test('Y-097: sendConfirmation produces bilingual envelope with ICS attachment', () => {
  const { sch, sent } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
    agenda: 'intro',
  });
  sent.length = 0;
  const res = sch.sendConfirmation(b.id, 'bilingual');
  assert.equal(res.ok, true);
  assert.match(res.notification.subject_he, /אישור פגישת לקוח/);
  assert.match(res.notification.subject_en, /Customer meeting confirmation/);
  assert.match(res.notification.body_he, /Techno-Kol Uzi/);
  assert.match(res.notification.body_en, /Techno-Kol Uzi/);
  assert.ok(res.notification.ics.includes('BEGIN:VCALENDAR'));
  assert.ok(res.notification.ics.includes('END:VCALENDAR'));
  assert.equal(sent.length, 1, 'notifier.send was called once');
});

/* ---------- 9. sendConfirmation: hebrew-only primary ---------- */
test('Y-097: sendConfirmation supports lang="he" primary envelope', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  const res = sch.sendConfirmation(b.id, 'he');
  assert.equal(res.notification.lang, 'he');
  assert.match(res.notification.primary.subject, /אישור פגישת לקוח/);
  assert.match(res.notification.primary.body, /Techno-Kol Uzi/);
});

/* ---------- 10. generateICS: RFC 5545 fields present ---------- */
test('Y-097: generateICS emits RFC-5545 fields (UID, DTSTART, DTEND, SUMMARY, VALARM)', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-99',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi', 'alice'],
    agenda: 'Deep dive',
  });
  const ics = sch.generateICS(b.id);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('VERSION:2.0'));
  assert.ok(ics.includes('PRODID:-//Techno-Kol Uzi//Customer Meeting Scheduler Y-097//EN'));
  assert.ok(ics.includes(`UID:${b.id}@techno-kol.co.il`));
  assert.ok(ics.includes('DTSTART:20260413T100000Z'));
  assert.ok(ics.includes('DTEND:20260413T110000Z'));
  assert.ok(ics.includes('SUMMARY:'));
  assert.ok(ics.includes('LOCATION:'));
  assert.ok(ics.includes('BEGIN:VALARM'));
  assert.ok(ics.includes('TRIGGER:-PT1H'));
  assert.ok(ics.includes('STATUS:CONFIRMED'));
  assert.ok(ics.includes('ATTENDEE;CN=uzi'));
  assert.ok(ics.includes('ATTENDEE;CN=alice'));
  assert.ok(ics.includes('ATTENDEE;CN=Customer cust-99'));
  // CRLF line endings
  assert.ok(ics.includes('\r\n'));
});

/* ---------- 11. generateICS: cancelled meeting flags STATUS:CANCELLED ---------- */
test('Y-097: generateICS for cancelled meeting emits STATUS:CANCELLED', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-55',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  sch.cancelMeeting(b.id, 'customer unreachable');
  const ics = sch.generateICS(b.id);
  assert.ok(ics.includes('STATUS:CANCELLED'));
});

/* ---------- 12. rescheduleMeeting preserves history (append-only) ---------- */
test('Y-097: rescheduleMeeting preserves full status history + old slot', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  const res = sch.rescheduleMeeting(
    b.id,
    { start: '2026-04-14T11:00:00.000Z', end: '2026-04-14T12:00:00.000Z' },
    'customer requested morning',
  );
  assert.equal(res.ok, true);
  assert.equal(res.oldSlot.start, '2026-04-13T10:00:00.000Z');
  assert.equal(res.newSlot.start, '2026-04-14T11:00:00.000Z');
  const m = sch.getCustomerMeeting(b.id);
  assert.equal(m.statusHistory.length, 2);
  assert.equal(m.statusHistory[0].status, 'scheduled');
  assert.equal(m.statusHistory[1].status, 'rescheduled');
  assert.equal(m.statusHistory[1].reason, 'customer requested morning');
  assert.equal(m.statusHistory[1].from, '2026-04-13T10:00:00.000Z');
  // Meeting itself should still exist — never deleted.
  assert.equal(m.id, b.id);
});

/* ---------- 13. cancelMeeting: status flip, record preserved ---------- */
test('Y-097: cancelMeeting flips status but preserves record (never delete)', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  const res = sch.cancelMeeting(b.id, 'customer sick');
  assert.equal(res.ok, true);
  assert.equal(res.status, 'cancelled');
  const m = sch.getCustomerMeeting(b.id);
  assert.equal(m.status, 'cancelled');
  assert.equal(m.statusHistory[m.statusHistory.length - 1].reason, 'customer sick');
  // Idempotent
  const again = sch.cancelMeeting(b.id, 'duplicate');
  assert.equal(again.ok, true);
  assert.equal(again.alreadyCancelled, true);
});

/* ---------- 14. sendReminder: bilingual reminder envelope ---------- */
test('Y-097: sendReminder emits bilingual reminder envelope with hours param', () => {
  const { sch, sent } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
    agenda: 'intro',
  });
  sent.length = 0;
  const res = sch.sendReminder(b.id, 24);
  assert.equal(res.ok, true);
  assert.equal(res.hoursBefore, 24);
  assert.match(res.notification.subject_he, /תזכורת/);
  assert.match(res.notification.subject_en, /Reminder/);
  assert.match(res.notification.body_he, /פגישת/);
  assert.match(res.notification.body_en, /meeting/);
  assert.equal(sent.length, 1);
});

/* ---------- 15. recordOutcome: productive outcome with next steps ---------- */
test('Y-097: recordOutcome accepts productive + next steps + opportunity update', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  const res = sch.recordOutcome({
    meetingId: b.id,
    outcome: 'productive',
    notes: 'Customer is excited',
    nextSteps: ['send proposal', 'schedule follow-up'],
    opportunityUpdate: { stage: 'negotiation', amount: 50000 },
  });
  assert.equal(res.ok, true);
  assert.equal(res.outcome, 'productive');
  assert.equal(res.history.length, 1);
  assert.deepEqual(res.entry.nextSteps, ['send proposal', 'schedule follow-up']);
  assert.equal(res.entry.opportunityUpdate.stage, 'negotiation');
  const m = sch.getCustomerMeeting(b.id);
  assert.equal(m.lastOutcome, 'productive');
});

/* ---------- 16. recordOutcome: rejects unknown outcome labels ---------- */
test('Y-097: recordOutcome rejects outcomes not in the whitelist', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-42',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  const res = sch.recordOutcome({
    meetingId: b.id,
    outcome: 'great',
  });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'bad_outcome');
  // Valid labels must all work:
  for (const o of ['productive', 'inconclusive', 'no-show', 'rescheduled']) {
    const r = sch.recordOutcome({ meetingId: b.id, outcome: o });
    assert.equal(r.ok, true, `outcome ${o} should be accepted`);
  }
});

/* ---------- 17. noShowTracker derives events from outcomes ---------- */
test('Y-097: noShowTracker returns append-only no-show log for a customer', () => {
  const { sch } = seedY097();
  const b1 = sch.bookMeeting({
    customerId: 'cust-77', meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  const b2 = sch.bookMeeting({
    customerId: 'cust-77', meetingTypeId: 'discovery',
    slot: { start: '2026-04-14T10:00:00.000Z', end: '2026-04-14T11:00:00.000Z' },
    owners: ['uzi'],
  });
  sch.recordOutcome({ meetingId: b1.id, outcome: 'no-show', notes: 'first no-show' });
  sch.recordOutcome({ meetingId: b2.id, outcome: 'productive' });
  const ns = sch.noShowTracker('cust-77');
  assert.equal(ns.count, 1);
  assert.equal(ns.customerId, 'cust-77');
  assert.equal(ns.events[0].event, 'meeting.no-show');
  assert.equal(ns.events[0].meetingId, b1.id);
});

/* ---------- 18. meetingHistory: full append-only view ---------- */
test('Y-097: meetingHistory returns every meeting for a customer including cancelled', () => {
  const { sch } = seedY097();
  const b1 = sch.bookMeeting({
    customerId: 'cust-h', meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'], agenda: 'first',
  });
  const b2 = sch.bookMeeting({
    customerId: 'cust-h', meetingTypeId: 'site-visit',
    slot: { start: '2026-04-14T09:00:00.000Z', end: '2026-04-14T10:30:00.000Z' },
    owners: ['uzi'], agenda: 'site visit',
  });
  sch.cancelMeeting(b1.id, 'rescheduled externally');
  sch.recordOutcome({ meetingId: b2.id, outcome: 'productive', nextSteps: ['proposal'] });

  const hist = sch.meetingHistory('cust-h');
  assert.equal(hist.count, 2);
  assert.equal(hist.customerId, 'cust-h');
  // Ordered by start time
  assert.equal(hist.meetings[0].id, b1.id);
  assert.equal(hist.meetings[1].id, b2.id);
  // Cancelled record still present with cancelled status
  assert.equal(hist.meetings[0].status, 'cancelled');
  // Outcomes present on b2
  assert.equal(hist.meetings[1].outcomes.length, 1);
  assert.equal(hist.meetings[1].outcomes[0].outcome, 'productive');
  // Customer log event stream captures scheduling + cancellation + outcome
  const eventSet = new Set(hist.log.map((e) => e.event));
  assert.ok(eventSet.has('meeting.scheduled'));
  assert.ok(eventSet.has('meeting.cancelled'));
  assert.ok(eventSet.has('meeting.outcome.productive'));
});

/* ---------- 19. bookingLinkGenerator: self-service URL ---------- */
test('Y-097: bookingLinkGenerator builds a self-service URL per user/duration', () => {
  const { sch } = seedY097();
  const a = sch.bookingLinkGenerator('uzi', 30);
  const b = sch.bookingLinkGenerator('uzi', 60);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.duration, 30);
  assert.equal(b.duration, 60);
  assert.ok(a.url.includes('/self/'));
  assert.ok(a.url.includes('uzi'));
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.slug, b.slug);
});

/* ---------- 20. teamAvailabilityView: matrix with holiday flag ---------- */
test('Y-097: teamAvailabilityView returns matrix flagging Israeli holidays', () => {
  const { sch } = seedY097();
  const view = sch.teamAvailabilityView(['uzi', 'alice'], {
    // 2026-04-20 Mon through 2026-04-23 Thu covers 04-22 Yom HaAtzmaut.
    from: '2026-04-20T00:00:00.000Z',
    to:   '2026-04-23T23:59:59.000Z',
  });
  assert.deepEqual(view.userIds, ['uzi', 'alice']);
  assert.equal(view.days.length, 4);
  for (const uid of ['uzi', 'alice']) {
    const atzmaut = view.matrix[uid]['2026-04-22'];
    assert.equal(atzmaut.holiday, true);
    assert.equal(atzmaut.windows.length, 0);
    assert.equal(atzmaut.isAvailable, false);
    const monday = view.matrix[uid]['2026-04-20'];
    assert.equal(monday.isAvailable, true);
    assert.ok(monday.windows.length >= 1);
  }
});

/* ---------- 21. Israeli holiday list + isIsraeliHoliday helper ---------- */
test('Y-097: ISRAELI_HOLIDAYS_2026 + isIsraeliHoliday cover national dates', () => {
  assert.ok(Array.isArray(ISRAELI_HOLIDAYS_2026));
  assert.ok(ISRAELI_HOLIDAYS_2026.length >= 15);
  // Each entry has date/he/en:
  for (const h of ISRAELI_HOLIDAYS_2026) {
    assert.match(h.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(h.he && h.he.length);
    assert.ok(h.en && h.en.length);
  }
  assert.equal(isIsraeliHoliday('2026-04-22T09:00:00Z'), true);
  assert.equal(isIsraeliHoliday('2026-04-13T09:00:00Z'), false);
  assert.equal(isIsraeliHoliday('2026-09-21T12:00:00Z'), true); // Yom Kippur
});

/* ---------- 22. intersectMany + icsStamp helper sanity ---------- */
test('Y-097: helper exports (intersectRange/intersectMany/icsStamp) behave', () => {
  const a = { start: '2026-04-13T09:00:00Z', end: '2026-04-13T12:00:00Z' };
  const b = { start: '2026-04-13T11:00:00Z', end: '2026-04-13T13:00:00Z' };
  const ix = intersectRange(a, b);
  assert.equal(ix.start.toISOString(), '2026-04-13T11:00:00.000Z');
  assert.equal(ix.end.toISOString(),   '2026-04-13T12:00:00.000Z');
  assert.equal(intersectRange(a, { start: '2026-04-14T00:00:00Z', end: '2026-04-14T01:00:00Z' }), null);
  const many = intersectMany([
    [a],
    [b],
    [{ start: '2026-04-13T10:00:00Z', end: '2026-04-13T11:30:00Z' }],
  ]);
  assert.equal(many.length, 1);
  assert.equal(many[0].start.toISOString(), '2026-04-13T11:00:00.000Z');
  assert.equal(many[0].end.toISOString(),   '2026-04-13T11:30:00.000Z');
  assert.equal(icsStamp('2026-04-13T10:00:00.000Z'), '20260413T100000Z');
});

/* ---------- 23. audit trail captures Y-097 events ---------- */
test('Y-097: audit trail includes customerMeeting.* events (append-only)', () => {
  const { sch } = seedY097();
  const b = sch.bookMeeting({
    customerId: 'cust-audit',
    meetingTypeId: 'discovery',
    slot: { start: '2026-04-13T10:00:00.000Z', end: '2026-04-13T11:00:00.000Z' },
    owners: ['uzi'],
  });
  sch.sendConfirmation(b.id, 'bilingual');
  sch.sendReminder(b.id, 24);
  sch.rescheduleMeeting(
    b.id,
    { start: '2026-04-14T10:00:00.000Z', end: '2026-04-14T11:00:00.000Z' },
    'customer',
  );
  sch.recordOutcome({ meetingId: b.id, outcome: 'productive' });
  const trail = sch.getAuditTrail();
  const events = trail.map((e) => e.event);
  assert.ok(events.includes('customerMeeting.create'));
  assert.ok(events.includes('customerMeeting.confirm'));
  assert.ok(events.includes('customerMeeting.reminder'));
  assert.ok(events.includes('customerMeeting.reschedule'));
  assert.ok(events.includes('customerMeeting.outcome'));
  assert.ok(events.includes('proposeSlots') || events.length > 0);
});
