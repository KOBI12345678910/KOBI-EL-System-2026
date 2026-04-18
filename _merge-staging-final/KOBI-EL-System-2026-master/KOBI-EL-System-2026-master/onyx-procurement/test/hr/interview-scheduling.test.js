/**
 * Tests — Interview Scheduling Engine
 * Agent Y-062 • Techno-Kol Uzi mega-ERP • Swarm HR
 *
 * Zero-dependency — node:test + node:assert/strict only.
 *
 * Run: node --test test/hr/interview-scheduling.test.js
 *
 * Coverage:
 *   1.  Slot policy configuration
 *   2.  Interviewer availability — additive
 *   3.  proposeTimes intersection of two interviewers
 *   4.  proposeTimes returns at most 3 slots
 *   5.  Weekend exclusion (Fri/Sat per Israeli policy)
 *   6.  Israeli holiday exclusion (Pesach 2026-04-02)
 *   7.  Custom holiday exclusion via policy
 *   8.  Business-hours filtering
 *   9.  Confirm interview happy path
 *  10.  Confirm rejects format/room/video link mismatches
 *  11.  Double-booking detection at confirm time
 *  12.  ICS generation — RFC 5545 well-formed
 *  13.  Bilingual invite email body (he + en)
 *  14.  ICS attachment present in invite
 *  15.  Reschedule preserves history (append-only)
 *  16.  Reschedule rejects conflicts
 *  17.  Cancel preserves record (status flip only)
 *  18.  Reminder bilingual content
 *  19.  No-show tracker append-only
 *  20.  calendarConflicts detects overlap across two interviews
 *  21.  fairDistribution metric across interviewers
 *  22.  Israeli holidays 2026 list completeness
 *  23.  HEBREW_GLOSSARY exported and non-empty
 *  24.  Append-only event log captures full lifecycle
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  InterviewScheduler,
  INTERVIEW_STATUS,
  INTERVIEW_FORMAT,
  EVENT_TYPE,
  LABELS,
  HEBREW_GLOSSARY,
  israeliHolidays2026,
  isIsraeliHoliday,
  isWeekend,
  intersectMany,
} = require('../../src/hr/interview-scheduling.js');

// ──────────────────────────────────────────────────────────────────
// FIXTURES
// ──────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-04-13T08:00:00.000Z'); // Mon
const fixedClock = () => new Date(FIXED_NOW);

function freshScheduler() {
  const s = new InterviewScheduler({ now: fixedClock });
  s.defineSlotPolicy({
    businessHours:  { start: '09:00', end: '18:00' },
    minDurationMin: 30,
    breakMin:       15,
    weekendOff:     ['Fri', 'Sat'],
    holidays:       [],
  });
  return s;
}

// Helper — produce a Mon date at HH:MM UTC
function mondayAt(h, m = 0) {
  // 2026-04-13 is a Monday
  return new Date(Date.UTC(2026, 3, 13, h, m, 0)).toISOString();
}
function tuesdayAt(h, m = 0) {
  return new Date(Date.UTC(2026, 3, 14, h, m, 0)).toISOString();
}
function wednesdayAt(h, m = 0) {
  return new Date(Date.UTC(2026, 3, 15, h, m, 0)).toISOString();
}

// ──────────────────────────────────────────────────────────────────
// TEST 1 — Slot policy configuration
// ──────────────────────────────────────────────────────────────────
test('1. defineSlotPolicy stores defaults and overrides', () => {
  const s = new InterviewScheduler({ now: fixedClock });
  s.defineSlotPolicy({
    businessHours:  { start: '08:00', end: '17:00' },
    minDurationMin: 45,
    breakMin:       10,
    weekendOff:     ['Fri', 'Sat'],
    holidays:       [],
  });
  assert.equal(s.policy.businessHours.start, '08:00');
  assert.equal(s.policy.businessHours.end,   '17:00');
  assert.equal(s.policy.minDurationMin, 45);
  assert.equal(s.policy.breakMin, 10);
  assert.deepEqual(s.policy.weekendOff, ['Fri', 'Sat']);
});

test('1b. defineSlotPolicy rejects too-short duration', () => {
  const s = new InterviewScheduler({ now: fixedClock });
  assert.throws(() => s.defineSlotPolicy({ minDurationMin: 1 }), /minDurationMin/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 2 — Availability is additive
// ──────────────────────────────────────────────────────────────────
test('2. addInterviewerAvailability is additive (never overwrites)', () => {
  const s = freshScheduler();
  s.addInterviewerAvailability({
    interviewerId: 'I1',
    slots: [{ start: mondayAt(10), end: mondayAt(12) }],
  });
  s.addInterviewerAvailability({
    interviewerId: 'I1',
    slots: [{ start: mondayAt(14), end: mondayAt(16) }],
  });
  const have = s.availability.get('I1');
  assert.equal(have.length, 2);
});

// ──────────────────────────────────────────────────────────────────
// TEST 3 — proposeTimes intersection of two interviewers
// ──────────────────────────────────────────────────────────────────
test('3. proposeTimes intersects two interviewers correctly', () => {
  const s = freshScheduler();
  s.addInterviewerAvailability({
    interviewerId: 'I1',
    slots: [{ start: mondayAt(9), end: mondayAt(13) }],
  });
  s.addInterviewerAvailability({
    interviewerId: 'I2',
    slots: [{ start: mondayAt(11), end: mondayAt(15) }],
  });
  const proposals = s.proposeTimes({
    candId:       'C1',
    reqId:        'R1',
    interviewers: ['I1', 'I2'],
    duration:     30,
  });
  assert.ok(proposals.length > 0);
  // every proposal must lie in the intersection [11:00, 13:00)
  for (const p of proposals) {
    assert.ok(new Date(p.start).getTime() >= new Date(mondayAt(11)).getTime());
    assert.ok(new Date(p.end).getTime()   <= new Date(mondayAt(13)).getTime());
  }
});

// ──────────────────────────────────────────────────────────────────
// TEST 4 — At most 3 proposals
// ──────────────────────────────────────────────────────────────────
test('4. proposeTimes returns at most 3 slots', () => {
  const s = freshScheduler();
  s.addInterviewerAvailability({
    interviewerId: 'I1',
    slots: [{ start: mondayAt(9), end: mondayAt(17) }],
  });
  s.addInterviewerAvailability({
    interviewerId: 'I2',
    slots: [{ start: mondayAt(9), end: mondayAt(17) }],
  });
  const out = s.proposeTimes({
    candId: 'C1', interviewers: ['I1', 'I2'], duration: 30,
  });
  assert.ok(out.length <= 3);
  assert.ok(out.length > 0);
});

// ──────────────────────────────────────────────────────────────────
// TEST 5 — Weekend exclusion (Fri+Sat)
// ──────────────────────────────────────────────────────────────────
test('5. Weekend exclusion (Fri/Sat) — no proposals', () => {
  const s = freshScheduler();
  // Friday 2026-04-17 and Saturday 2026-04-18
  const fri = (h) => new Date(Date.UTC(2026, 3, 17, h, 0)).toISOString();
  const sat = (h) => new Date(Date.UTC(2026, 3, 18, h, 0)).toISOString();
  s.addInterviewerAvailability({
    interviewerId: 'I1', slots: [{ start: fri(9), end: sat(17) }],
  });
  s.addInterviewerAvailability({
    interviewerId: 'I2', slots: [{ start: fri(9), end: sat(17) }],
  });
  const out = s.proposeTimes({ candId: 'C1', interviewers: ['I1', 'I2'], duration: 30 });
  // Whatever is left must NOT fall on Fri/Sat
  for (const p of out) {
    assert.ok(!isWeekend(p.start, ['Fri', 'Sat']));
  }
  // utility function direct check
  assert.equal(isWeekend(fri(10), ['Fri', 'Sat']), true);
  assert.equal(isWeekend(sat(10), ['Fri', 'Sat']), true);
  assert.equal(isWeekend(mondayAt(10), ['Fri', 'Sat']), false);
});

// ──────────────────────────────────────────────────────────────────
// TEST 6 — Israeli holiday exclusion (Pesach 2026-04-02)
// ──────────────────────────────────────────────────────────────────
test('6. Israeli holiday exclusion — Pesach 2026-04-02 blocked', () => {
  const s = freshScheduler();
  const pesach = (h) => new Date(Date.UTC(2026, 3, 2, h, 0)).toISOString();
  s.addInterviewerAvailability({
    interviewerId: 'I1', slots: [{ start: pesach(9), end: pesach(17) }],
  });
  s.addInterviewerAvailability({
    interviewerId: 'I2', slots: [{ start: pesach(9), end: pesach(17) }],
  });
  const out = s.proposeTimes({ candId: 'C1', interviewers: ['I1', 'I2'], duration: 30 });
  assert.equal(out.length, 0, 'no slots should fall on Pesach');
  assert.equal(isIsraeliHoliday('2026-04-02'), true);
  assert.equal(isIsraeliHoliday('2026-09-21'), true); // Yom Kippur
});

// ──────────────────────────────────────────────────────────────────
// TEST 7 — Custom holiday exclusion via policy
// ──────────────────────────────────────────────────────────────────
test('7. Custom holiday in policy is honored', () => {
  const s = new InterviewScheduler({ now: fixedClock });
  s.defineSlotPolicy({
    businessHours:  { start: '09:00', end: '18:00' },
    minDurationMin: 30,
    breakMin:       15,
    weekendOff:     ['Fri', 'Sat'],
    holidays:       ['2026-04-13'], // company holiday on test Monday
  });
  s.addInterviewerAvailability({ interviewerId: 'I1', slots: [{ start: mondayAt(9), end: mondayAt(17) }] });
  s.addInterviewerAvailability({ interviewerId: 'I2', slots: [{ start: mondayAt(9), end: mondayAt(17) }] });
  const out = s.proposeTimes({ candId: 'C1', interviewers: ['I1', 'I2'], duration: 30 });
  assert.equal(out.length, 0);
});

// ──────────────────────────────────────────────────────────────────
// TEST 8 — Business hours filtering
// ──────────────────────────────────────────────────────────────────
test('8. Business hours filtering — pre-09:00 / post-18:00 dropped', () => {
  const s = freshScheduler();
  // availability spans 06:00 .. 22:00 — only 09:00..18:00 should survive
  s.addInterviewerAvailability({ interviewerId: 'I1', slots: [{ start: tuesdayAt(6), end: tuesdayAt(22) }] });
  s.addInterviewerAvailability({ interviewerId: 'I2', slots: [{ start: tuesdayAt(6), end: tuesdayAt(22) }] });
  const out = s.proposeTimes({ candId: 'C1', interviewers: ['I1', 'I2'], duration: 30 });
  for (const p of out) {
    const sh = new Date(p.start).getUTCHours();
    const eh = new Date(p.end).getUTCHours();
    assert.ok(sh >= 9, `start ${p.start} ≥ 09:00`);
    assert.ok(eh <= 18, `end ${p.end} ≤ 18:00`);
  }
});

// ──────────────────────────────────────────────────────────────────
// TEST 9 — Confirm interview happy path
// ──────────────────────────────────────────────────────────────────
test('9. confirmInterview returns a record with status=confirmed', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId:       'C1',
    slot:         { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1', 'I2'],
    room:         'A101',
    format:       INTERVIEW_FORMAT.ONSITE,
  });
  assert.equal(r.status, INTERVIEW_STATUS.CONFIRMED);
  assert.equal(r.candId, 'C1');
  assert.equal(r.room, 'A101');
  assert.deepEqual(r.interviewers, ['I1', 'I2']);
  assert.equal(r.history.length, 1);
});

// ──────────────────────────────────────────────────────────────────
// TEST 10 — Confirm rejects bad format / missing room or videoLink
// ──────────────────────────────────────────────────────────────────
test('10. confirmInterview validates format/room/videoLink', () => {
  const s = freshScheduler();
  assert.throws(() => s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], format: 'fax',
  }), /format/);
  assert.throws(() => s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], format: INTERVIEW_FORMAT.VIDEO,
  }), /videoLink/);
  assert.throws(() => s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], format: INTERVIEW_FORMAT.ONSITE,
  }), /room/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 11 — Double-booking detection at confirm time
// ──────────────────────────────────────────────────────────────────
test('11. confirmInterview rejects double-booking on same interviewer', () => {
  const s = freshScheduler();
  s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  assert.throws(() => s.confirmInterview({
    candId: 'C2', slot: { start: mondayAt(10, 30), end: mondayAt(11, 30) },
    interviewers: ['I1'], room: 'A2', format: INTERVIEW_FORMAT.ONSITE,
  }), /conflict|double-booked/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 12 — ICS generation well-formed
// ──────────────────────────────────────────────────────────────────
test('12. generateICS produces RFC 5545 well-formed output', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const ics = s.generateICS(r.id);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /VERSION:2\.0\r\n/);
  assert.match(ics, /PRODID:-\/\/Techno-Kol Uzi/);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /END:VEVENT/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /UID:INT-/);
  assert.match(ics, /DTSTART:\d{8}T\d{6}Z/);
  assert.match(ics, /DTEND:\d{8}T\d{6}Z/);
  assert.match(ics, /SUMMARY:/);
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /TRIGGER:-PT1H/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 13 — Bilingual invite email body (he + en)
// ──────────────────────────────────────────────────────────────────
test('13. sendInviteEmail produces bilingual body when lang="both"', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const email = s.sendInviteEmail({ interviewId: r.id, template: 'full', lang: 'both' });
  assert.match(email.body, /שלום/);                    // Hebrew greeting
  assert.match(email.body, /Hello/);                   // English greeting
  assert.match(email.body, /טכנו-קול עוזי/);          // Hebrew sign-off
  assert.match(email.body, /Techno-Kol Uzi/);          // English sign-off
  assert.match(email.body, /\u200F/);                  // RLM mark present
});

test('13b. sendInviteEmail he-only and en-only', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], format: INTERVIEW_FORMAT.VIDEO, videoLink: 'https://meet.example/abc',
  });
  const he = s.sendInviteEmail({ interviewId: r.id, template: 'full', lang: 'he' });
  const en = s.sendInviteEmail({ interviewId: r.id, template: 'full', lang: 'en' });
  assert.match(he.body, /שלום/);
  assert.doesNotMatch(he.body, /Hello/);
  assert.match(en.body, /Hello/);
  assert.doesNotMatch(en.body, /שלום/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 14 — ICS attachment present in invite
// ──────────────────────────────────────────────────────────────────
test('14. sendInviteEmail attaches ICS file', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const email = s.sendInviteEmail({ interviewId: r.id, template: 'full', lang: 'both' });
  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0].filename, `interview-${r.id}.ics`);
  assert.match(email.attachments[0].contentType, /text\/calendar/);
  assert.match(email.attachments[0].content, /BEGIN:VCALENDAR/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 15 — Reschedule preserves history
// ──────────────────────────────────────────────────────────────────
test('15. rescheduleInterview is append-only (history preserved)', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const oldStart = new Date(r.slot.start).toISOString();
  const updated = s.rescheduleInterview(r.id,
    { start: tuesdayAt(14), end: tuesdayAt(15) },
    'candidate requested later time',
  );
  assert.equal(updated.history.length, 2);
  assert.equal(updated.history[1].type, EVENT_TYPE.RESCHEDULED);
  assert.equal(new Date(updated.history[1].from.start).toISOString(), oldStart);
  assert.equal(new Date(updated.slot.start).toISOString(), tuesdayAt(14));
  assert.match(updated.history[1].reason, /candidate/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 16 — Reschedule rejects conflicts
// ──────────────────────────────────────────────────────────────────
test('16. rescheduleInterview rejects conflict with another interview', () => {
  const s = freshScheduler();
  const a = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  s.confirmInterview({
    candId: 'C2', slot: { start: tuesdayAt(14), end: tuesdayAt(15) },
    interviewers: ['I1'], room: 'A2', format: INTERVIEW_FORMAT.ONSITE,
  });
  assert.throws(() => s.rescheduleInterview(a.id,
    { start: tuesdayAt(14, 30), end: tuesdayAt(15, 30) },
    'collision attempt',
  ), /conflict/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 17 — Cancel preserves record
// ──────────────────────────────────────────────────────────────────
test('17. cancelInterview flips status only — record stays', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  s.cancelInterview(r.id, 'role closed');
  const after = s.getInterview(r.id);
  assert.ok(after, 'record still exists');
  assert.equal(after.status, INTERVIEW_STATUS.CANCELLED);
  assert.equal(after.history.length, 2);
  assert.match(after.history[1].reason, /role closed/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 18 — Reminder bilingual content
// ──────────────────────────────────────────────────────────────────
test('18. sendReminder produces bilingual reminder', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const rem = s.sendReminder(r.id, 24);
  assert.equal(rem.hoursBefore, 24);
  assert.match(rem.bodyHe, /תזכורת/);
  assert.match(rem.bodyEn, /Reminder/);
});

// ──────────────────────────────────────────────────────────────────
// TEST 19 — No-show tracker append-only
// ──────────────────────────────────────────────────────────────────
test('19. noShowTracker appends event log per candidate', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const log1 = s.noShowTracker('C1', r.id);
  assert.equal(log1.length, 1);
  assert.equal(log1[0].type, EVENT_TYPE.NO_SHOW);
  // Confirm interview status flipped
  assert.equal(s.getInterview(r.id).status, INTERVIEW_STATUS.NO_SHOW);
  // Confirm second no-show stacks
  const r2 = s.confirmInterview({
    candId: 'C1', slot: { start: tuesdayAt(10), end: tuesdayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const log2 = s.noShowTracker('C1', r2.id);
  assert.equal(log2.length, 2);
});

// ──────────────────────────────────────────────────────────────────
// TEST 20 — calendarConflicts detects overlap
// ──────────────────────────────────────────────────────────────────
test('20. calendarConflicts detects overlapping interviews for one interviewer', () => {
  const s = freshScheduler();
  // Use direct map insertion to bypass confirm-time guard
  const id1 = 'INT-A';
  const id2 = 'INT-B';
  s.interviews.set(id1, {
    id: id1, candId: 'C1', interviewers: ['I1'],
    slot: { start: new Date(mondayAt(10)), end: new Date(mondayAt(11)) },
    format: INTERVIEW_FORMAT.ONSITE, room: 'A1', videoLink: null,
    status: INTERVIEW_STATUS.CONFIRMED, history: [], createdAt: FIXED_NOW,
  });
  s.interviews.set(id2, {
    id: id2, candId: 'C2', interviewers: ['I1'],
    slot: { start: new Date(mondayAt(10, 30)), end: new Date(mondayAt(11, 30)) },
    format: INTERVIEW_FORMAT.ONSITE, room: 'A2', videoLink: null,
    status: INTERVIEW_STATUS.CONFIRMED, history: [], createdAt: FIXED_NOW,
  });
  const conflicts = s.calendarConflicts('I1', {
    start: mondayAt(0), end: tuesdayAt(0),
  });
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].a, id1);
  assert.equal(conflicts[0].b, id2);
});

// ──────────────────────────────────────────────────────────────────
// TEST 21 — fairDistribution metric
// ──────────────────────────────────────────────────────────────────
test('21. fairDistribution computes counts and imbalance', () => {
  const s = freshScheduler();
  s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  s.confirmInterview({
    candId: 'C2', slot: { start: mondayAt(11, 30), end: mondayAt(12, 30) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  s.confirmInterview({
    candId: 'C3', slot: { start: tuesdayAt(10), end: tuesdayAt(11) },
    interviewers: ['I2'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  const dist = s.fairDistribution(['I1', 'I2', 'I3'], {
    start: mondayAt(0), end: wednesdayAt(0),
  });
  assert.equal(dist.counts.I1, 2);
  assert.equal(dist.counts.I2, 1);
  assert.equal(dist.counts.I3, 0);
  assert.equal(dist.total, 3);
  assert.ok(dist.spread === 2);
  assert.ok(dist.imbalance > 0);
});

// ──────────────────────────────────────────────────────────────────
// TEST 22 — Israeli holidays 2026 list completeness
// ──────────────────────────────────────────────────────────────────
test('22. israeliHolidays2026 includes the canonical 8 categories', () => {
  const list = israeliHolidays2026();
  const en = list.map(h => h.en).join(' | ');
  assert.match(en, /Rosh Hashana/);
  assert.match(en, /Yom Kippur/);
  assert.match(en, /Sukkot/);
  assert.match(en, /Pesach/);
  assert.match(en, /Shavuot/);
  assert.match(en, /Yom HaAtzmaut/);   // Independence Day
  assert.match(en, /Yom HaShoah/);     // Holocaust Day
  assert.match(en, /Yom HaZikaron/);   // Fallen Soldiers Day
  // Each entry has Hebrew label
  for (const h of list) {
    assert.ok(h.he && h.he.length > 0, `Hebrew label missing for ${h.en}`);
    assert.match(h.date, /^2026-\d{2}-\d{2}$/);
  }
});

// ──────────────────────────────────────────────────────────────────
// TEST 23 — HEBREW_GLOSSARY exported
// ──────────────────────────────────────────────────────────────────
test('23. HEBREW_GLOSSARY exported and non-empty', () => {
  assert.ok(HEBREW_GLOSSARY);
  assert.ok(Object.keys(HEBREW_GLOSSARY).length >= 15);
  assert.equal(HEBREW_GLOSSARY['interview'], 'ראיון');
  assert.equal(HEBREW_GLOSSARY['no-show'],   'אי הופעה');
  assert.ok(LABELS.confirmed.he);
  assert.ok(LABELS.confirmed.en);
});

// ──────────────────────────────────────────────────────────────────
// TEST 24 — Append-only event log captures lifecycle
// ──────────────────────────────────────────────────────────────────
test('24. event log captures full interview lifecycle (append-only)', () => {
  const s = freshScheduler();
  const r = s.confirmInterview({
    candId: 'C1', slot: { start: mondayAt(10), end: mondayAt(11) },
    interviewers: ['I1'], room: 'A1', format: INTERVIEW_FORMAT.ONSITE,
  });
  s.sendInviteEmail({ interviewId: r.id, template: 'full', lang: 'both' });
  s.sendReminder(r.id, 24);
  s.rescheduleInterview(r.id, { start: tuesdayAt(10), end: tuesdayAt(11) }, 'shifted');
  s.cancelInterview(r.id, 'candidate withdrew');

  const log = s.getEventLog();
  const types = log.map(e => e.type);
  assert.deepEqual(types, [
    EVENT_TYPE.CONFIRMED,
    EVENT_TYPE.INVITE_SENT,
    EVENT_TYPE.REMINDER,
    EVENT_TYPE.RESCHEDULED,
    EVENT_TYPE.CANCELLED,
  ]);
  // Record itself still present
  assert.ok(s.getInterview(r.id));
  assert.equal(s.getInterview(r.id).status, INTERVIEW_STATUS.CANCELLED);
});

// ──────────────────────────────────────────────────────────────────
// BONUS: intersectMany utility direct test
// ──────────────────────────────────────────────────────────────────
test('25. intersectMany utility returns common windows', () => {
  const a = [{ start: new Date(mondayAt(9)), end: new Date(mondayAt(13)) }];
  const b = [{ start: new Date(mondayAt(11)), end: new Date(mondayAt(15)) }];
  const out = intersectMany([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].start.toISOString(), mondayAt(11));
  assert.equal(out[0].end.toISOString(),   mondayAt(13));
});
