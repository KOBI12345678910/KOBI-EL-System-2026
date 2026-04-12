/**
 * Tests — Life Events Reminder System
 * Agent Y-130 • Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency — uses only node:assert and node:test.
 * Covers: upcoming window, Hebrew calendar conversion + lunar
 * birthday recurrence, preference respect, bereavement handling,
 * milestone year calculation, newborn / wedding custom flows,
 * annual summary, calendar integration, never-delete rule.
 *
 * Run: node --test test/comms/life-events.test.js
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');

const {
  LifeEvents,
  EVENT_TYPES,
  EVENT_STATUS,
  MILESTONES_YEARS,
  LABELS,
  HebrewCalendar,
  createMemoryStore,
  _internals,
} = require('../../src/comms/life-events.js');

// ──────────────────────────────────────────────────────────────────
// FIXTURES
// ──────────────────────────────────────────────────────────────────

const NOW = new Date(Date.UTC(2026, 3, 11)); // 2026-04-11

function makeLE(now) {
  return new LifeEvents({ now: () => now || NOW });
}

function registerDani(le, overrides) {
  return le.registerPerson(Object.assign({
    personId: 'dani',
    nameHe: 'דני כהן',
    nameEn: 'Dani Cohen',
    department: 'production',
    managerId: 'moshe',
    hireDate: new Date(Date.UTC(2021, 3, 20)),        // 5y on 2026-04-20
    dateOfBirth: new Date(Date.UTC(1990, 4, 15)),      // 36y on 2026-05-15
  }, overrides || {}));
}

// ══════════════════════════════════════════════════════════════════
// HEBREW CALENDAR
// ══════════════════════════════════════════════════════════════════

test('HebrewCalendar: known anchors round-trip', () => {
  // Rosh Hashanah 5786 = 2025-09-23
  const rh5786 = HebrewCalendar.toGregorian(5786, 7, 1);
  assert.equal(rh5786.toISOString().slice(0, 10), '2025-09-23');

  // 15 Nisan 5786 (first day of Pesach) = 2026-04-02
  const pesach5786 = HebrewCalendar.toGregorian(5786, 1, 15);
  assert.equal(pesach5786.toISOString().slice(0, 10), '2026-04-02');

  // Rosh Hashanah 5785 = 2024-10-03
  const rh5785 = HebrewCalendar.toGregorian(5785, 7, 1);
  assert.equal(rh5785.toISOString().slice(0, 10), '2024-10-03');

  // Reverse: 2026-04-11 → 24 Nisan 5786 (15 Nisan + 9 days)
  const h = HebrewCalendar.fromGregorian(new Date(Date.UTC(2026, 3, 11)));
  assert.equal(h.year, 5786);
  assert.equal(h.month, 1);
  assert.equal(h.day, 24);
});

test('HebrewCalendar: round-trip random dates', () => {
  const samples = [
    [5786, 7, 1], [5786, 1, 15], [5785, 9, 25], [5787, 3, 6],
    [5784, 12, 14], [5790, 7, 10],
  ];
  for (const [y, m, d] of samples) {
    const g = HebrewCalendar.toGregorian(y, m, d);
    const h = HebrewCalendar.fromGregorian(g);
    assert.deepEqual({ y: h.year, m: h.month, d: h.day }, { y, m, d });
  }
});

test('HebrewCalendar: leap years (Metonic cycle)', () => {
  // Leap years: 3,6,8,11,14,17,19 of each 19-cycle
  assert.equal(_internals.isHebrewLeapYear(5782), true);   // 5782 = 3 mod 19 is leap
  assert.equal(_internals.isHebrewLeapYear(5784), true);   // 5784 leap
  assert.equal(_internals.isHebrewLeapYear(5785), false);  // 5785 non-leap
  assert.equal(_internals.isHebrewLeapYear(5786), false);  // 5786 non-leap
  assert.equal(_internals.isHebrewLeapYear(5787), true);   // 5787 leap
});

// ══════════════════════════════════════════════════════════════════
// RECORD EVENT
// ══════════════════════════════════════════════════════════════════

test('recordEvent: creates append-only record with id and status history', () => {
  const le = makeLE();
  registerDani(le);
  const e = le.recordEvent({
    personId: 'dani',
    type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),
  });
  assert.ok(e.eventId);
  assert.equal(e.status, EVENT_STATUS.SCHEDULED);
  assert.equal(e.statusHistory.length, 1);
  assert.equal(e.personId, 'dani');
  assert.equal(e.department, 'production');
});

test('recordEvent: bereavement enters SENSITIVE_HOLD immediately', () => {
  const le = makeLE();
  registerDani(le);
  const e = le.recordEvent({
    personId: 'dani',
    type: EVENT_TYPES.BEREAVEMENT,
    date: NOW,
  });
  assert.equal(e.status, EVENT_STATUS.SENSITIVE_HOLD);
});

test('recordEvent: rejects invalid event type', () => {
  const le = makeLE();
  assert.throws(() => le.recordEvent({
    personId: 'dani', type: 'nope', date: NOW,
  }), /invalid event type/);
});

test('recordEvent: supersedesEventId transitions old record (never delete)', () => {
  const le = makeLE();
  registerDani(le);
  const e1 = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),
  });
  const e2 = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),
    supersedesEventId: e1.eventId,
  });
  const stored1 = le.getEvent(e1.eventId);
  const stored2 = le.getEvent(e2.eventId);
  assert.equal(stored1.status, EVENT_STATUS.SUPERSEDED);
  assert.equal(stored2.status, EVENT_STATUS.SCHEDULED);
  // Old record still exists — never deleted
  assert.ok(stored1);
  assert.equal(stored1.statusHistory.length, 2);
});

// ══════════════════════════════════════════════════════════════════
// UPCOMING EVENTS
// ══════════════════════════════════════════════════════════════════

test('upcomingEvents: returns events within N-day window sorted by date', () => {
  const le = makeLE();
  registerDani(le);
  le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),   // May 15 → 34 days out
  });
  le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.WORK_ANNIVERSARY,
    date: new Date(Date.UTC(2021, 3, 20)),   // April 20 → 9 days out
  });

  const up = le.upcomingEvents({ days: 60 });
  assert.equal(up.length, 2);
  assert.equal(up[0].type, EVENT_TYPES.WORK_ANNIVERSARY);
  assert.equal(up[0].daysUntil, 9);
  assert.equal(up[0].yearsCompleted, 5);   // 2026 - 2021
  assert.equal(up[1].type, EVENT_TYPES.BIRTHDAY);
  assert.equal(up[1].yearsCompleted, 36);  // 2026 - 1990
});

test('upcomingEvents: filters by audience (department)', () => {
  const le = makeLE();
  registerDani(le);
  le.registerPerson({
    personId: 'ruth', nameHe: 'רות', department: 'hr',
    hireDate: new Date(Date.UTC(2021, 3, 25)),
  });
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.WORK_ANNIVERSARY,
    date: new Date(Date.UTC(2021, 3, 20)) });
  le.recordEvent({ personId: 'ruth', type: EVENT_TYPES.WORK_ANNIVERSARY,
    date: new Date(Date.UTC(2021, 3, 25)) });

  const prodOnly = le.upcomingEvents({ days: 60, audience: 'production' });
  assert.equal(prodOnly.length, 1);
  assert.equal(prodOnly[0].personId, 'dani');

  const hrOnly = le.upcomingEvents({ days: 60, audience: ['hr'] });
  assert.equal(hrOnly.length, 1);
  assert.equal(hrOnly[0].personId, 'ruth');
});

test('upcomingEvents: filters by types', () => {
  const le = makeLE();
  registerDani(le);
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)) });
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.WORK_ANNIVERSARY,
    date: new Date(Date.UTC(2021, 3, 20)) });

  const birthdaysOnly = le.upcomingEvents({
    days: 60,
    types: [EVENT_TYPES.BIRTHDAY],
  });
  assert.equal(birthdaysOnly.length, 1);
  assert.equal(birthdaysOnly[0].type, EVENT_TYPES.BIRTHDAY);
});

test('upcomingEvents: excludes bereavement by default', () => {
  const le = makeLE();
  registerDani(le);
  le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BEREAVEMENT,
    date: new Date(Date.UTC(2026, 3, 13)),
  });
  const up = le.upcomingEvents({ days: 60 });
  assert.equal(up.filter(e => e.type === EVENT_TYPES.BEREAVEMENT).length, 0);

  const withSensitive = le.upcomingEvents({ days: 60, includeSensitive: true });
  assert.equal(withSensitive.filter(e => e.type === EVENT_TYPES.BEREAVEMENT).length, 1);
});

test('upcomingEvents: respects public-celebration preference', () => {
  const le = makeLE();
  registerDani(le);
  le.setPreference('dani', { publicCelebration: false });
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)) });

  const up = le.upcomingEvents({ days: 60 });
  assert.equal(up.length, 0);

  const optedIn = le.upcomingEvents({ days: 60, includeOptedOut: true });
  assert.equal(optedIn.length, 1);
});

// ══════════════════════════════════════════════════════════════════
// LUNAR BIRTHDAY RECURRENCE
// ══════════════════════════════════════════════════════════════════

test('upcomingEvents: lunar birthday recurs on Hebrew calendar', () => {
  const le = makeLE(new Date(Date.UTC(2026, 2, 20))); // March 20, 2026
  le.registerPerson({ personId: 'avi', nameHe: 'אבי', department: 'hr' });

  // Born on 15 Nisan 5750 = 1990-04-10 (Gregorian)
  const gregBirth = HebrewCalendar.toGregorian(5750, 1, 15);
  assert.equal(gregBirth.toISOString().slice(0, 10), '1990-04-10');

  le.recordEvent({
    personId: 'avi',
    type: EVENT_TYPES.BIRTHDAY,
    date: gregBirth,
    lunar: true,
  });

  // Next Nisan 15 from March 20, 2026 → 15 Nisan 5786 = 2026-04-02
  const up = le.upcomingEvents({ days: 60 });
  assert.equal(up.length, 1);
  assert.equal(up[0].nextOccurrence.toISOString().slice(0, 10), '2026-04-02');
  assert.equal(up[0].lunar, true);
  // Hebrew year difference: 5786 - 5750 = 36 years old
  assert.equal(up[0].yearsCompleted, 36);
});

test('upcomingEvents: lunar birthday — after Nisan rolls to next Hebrew year', () => {
  // Now is April 11, 2026 → past 15 Nisan 5786. Next should be 15 Nisan 5787.
  const le = makeLE(new Date(Date.UTC(2026, 3, 11)));
  le.registerPerson({ personId: 'avi', nameHe: 'אבי' });
  const gregBirth = HebrewCalendar.toGregorian(5750, 1, 15);
  le.recordEvent({
    personId: 'avi', type: EVENT_TYPES.BIRTHDAY,
    date: gregBirth, lunar: true,
  });

  const up = le.upcomingEvents({ days: 400 });
  assert.equal(up.length, 1);
  // 15 Nisan 5787 in Gregorian is in April 2027
  const expected = HebrewCalendar.toGregorian(5787, 1, 15);
  assert.equal(
    up[0].nextOccurrence.toISOString().slice(0, 10),
    expected.toISOString().slice(0, 10),
  );
});

test('upcomingEvents: lunar vs gregorian differ in timing', () => {
  const le = makeLE(new Date(Date.UTC(2026, 2, 20)));
  le.registerPerson({ personId: 'gregor', nameHe: 'גריגור' });
  le.registerPerson({ personId: 'lunar', nameHe: 'לונאר' });
  const gregBirth = HebrewCalendar.toGregorian(5750, 1, 15); // 1990-04-10

  // Both born same Gregorian day; one lunar, one gregorian.
  le.recordEvent({ personId: 'gregor', type: EVENT_TYPES.BIRTHDAY,
    date: gregBirth, lunar: false });
  le.recordEvent({ personId: 'lunar', type: EVENT_TYPES.BIRTHDAY,
    date: gregBirth, lunar: true });

  const up = le.upcomingEvents({ days: 400 });
  assert.equal(up.length, 2);
  const gregEvent = up.find(e => e.personId === 'gregor');
  const lunarEvent = up.find(e => e.personId === 'lunar');
  // gregorian 1990-04-10 in 2026 is always 2026-04-10
  assert.equal(gregEvent.nextOccurrence.toISOString().slice(0, 10), '2026-04-10');
  // Lunar 15 Nisan 5786 = 2026-04-02
  assert.equal(lunarEvent.nextOccurrence.toISOString().slice(0, 10), '2026-04-02');
});

// ══════════════════════════════════════════════════════════════════
// NOTIFY MANAGERS
// ══════════════════════════════════════════════════════════════════

test('notifyManagers: produces bilingual notification and transitions status', () => {
  const le = makeLE();
  registerDani(le);
  const ev = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),
  });
  const n = le.notifyManagers({ personId: 'dani', event: ev.eventId });
  assert.equal(n.managerId, 'moshe');
  assert.match(n.subject.he, /יום הולדת/);
  assert.match(n.subject.en, /Birthday/);
  assert.match(n.body.he, /דני כהן/);
  assert.equal(n.sensitive, false);

  // Event now acknowledged
  const updated = le.getEvent(ev.eventId);
  assert.equal(updated.status, EVENT_STATUS.ACKNOWLEDGED);
});

test('notifyManagers: bereavement stays SENSITIVE_HOLD and body uses personal outreach phrasing', () => {
  const le = makeLE();
  registerDani(le);
  const ev = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BEREAVEMENT,
    date: NOW,
  });
  const n = le.notifyManagers({ personId: 'dani', event: ev.eventId });
  assert.equal(n.sensitive, true);
  assert.match(n.body.he, /פנה אישית/);
  assert.match(n.body.en, /personally/);
  // Status stays SENSITIVE_HOLD
  const updated = le.getEvent(ev.eventId);
  assert.equal(updated.status, EVENT_STATUS.SENSITIVE_HOLD);
});

// ══════════════════════════════════════════════════════════════════
// AUTO CARD GENERATION
// ══════════════════════════════════════════════════════════════════

test('autoCardGeneration: produces Hebrew + English card template', () => {
  const le = makeLE();
  registerDani(le);
  const ev = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),
  });
  const card = le.autoCardGeneration({ eventId: ev.eventId });
  assert.equal(card.automated, true);
  assert.ok(card.card.he.body.length > 0);
  assert.ok(card.card.en.body.length > 0);
  assert.match(card.card.he.title, /דני/);
});

test('autoCardGeneration: bereavement returns null card + sensitive notice', () => {
  const le = makeLE();
  registerDani(le);
  const ev = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BEREAVEMENT,
    date: NOW,
  });
  const card = le.autoCardGeneration({ eventId: ev.eventId });
  assert.equal(card.automated, false);
  assert.equal(card.sensitive, true);
  assert.ok(!card.card);
  assert.match(card.message.he, /רגיש/);
});

// ══════════════════════════════════════════════════════════════════
// CUSTOMIZABLE GREETING
// ══════════════════════════════════════════════════════════════════

test('customizableGreeting: prepends personal note and uses sender signature', () => {
  const le = makeLE();
  registerDani(le);
  const ev = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),
  });
  const g = le.customizableGreeting({
    eventId: ev.eventId,
    sender: 'moshe',
    personalNote: 'מזל טוב אחי!',
  });
  assert.match(g.card.he.body, /מזל טוב אחי/);
  assert.equal(g.card.he.signature, 'moshe');
  assert.equal(g.automated, false);
});

// ══════════════════════════════════════════════════════════════════
// GIFT BUDGET
// ══════════════════════════════════════════════════════════════════

test('giftBudget: 5-year milestone doubles base budget', () => {
  const le = makeLE();
  registerDani(le);
  const b = le.giftBudget({
    personId: 'dani',
    eventType: EVENT_TYPES.WORK_ANNIVERSARY,
    refDate: new Date(Date.UTC(2026, 3, 20)), // 5 years since 2021-04-20
  });
  assert.equal(b.milestoneYears, 5);
  assert.equal(b.suggested, 500); // 250 base × 2.0 multiplier
});

test('giftBudget: 10-year milestone triples base budget', () => {
  const le = makeLE();
  le.registerPerson({
    personId: 'veteran', nameHe: 'ותיק',
    department: 'production',
    hireDate: new Date(Date.UTC(2016, 3, 20)),
  });
  const b = le.giftBudget({
    personId: 'veteran',
    eventType: EVENT_TYPES.WORK_ANNIVERSARY,
    refDate: new Date(Date.UTC(2026, 3, 20)),
  });
  assert.equal(b.milestoneYears, 10);
  assert.equal(b.suggested, 750); // 250 × 3.0
});

test('giftBudget: non-milestone year uses base', () => {
  const le = makeLE();
  le.registerPerson({
    personId: 'two-years', hireDate: new Date(Date.UTC(2024, 3, 20)),
    department: 'production',
  });
  const b = le.giftBudget({
    personId: 'two-years',
    eventType: EVENT_TYPES.WORK_ANNIVERSARY,
    refDate: new Date(Date.UTC(2026, 3, 20)),
  });
  assert.equal(b.milestoneYears, 2);
  assert.equal(b.suggested, 250); // base, no multiplier
});

test('giftBudget: allocate and spend tracking + history never deletes', () => {
  const le = makeLE();
  registerDani(le);

  le.giftBudget({
    personId: 'dani', eventType: EVENT_TYPES.BIRTHDAY,
    allocate: 1000,
  });
  le.giftBudget({
    personId: 'dani', eventType: EVENT_TYPES.BIRTHDAY,
    spend: 150, note: 'cake',
  });
  const b = le.giftBudget({
    personId: 'dani', eventType: EVENT_TYPES.BIRTHDAY,
    spend: 200, note: 'flowers',
  });
  assert.equal(b.allocated, 1000);
  assert.equal(b.spent, 350);
  assert.equal(b.remaining, 650);
  assert.equal(b.history.length, 2);
  assert.equal(b.history[0].note, 'cake');
  assert.equal(b.history[1].note, 'flowers');
});

// ══════════════════════════════════════════════════════════════════
// PREFERENCE RESPECT
// ══════════════════════════════════════════════════════════════════

test('preferenceRespect: default is opt-in (publicCelebration true)', () => {
  const le = makeLE();
  const pref = le.preferenceRespect({ userId: 'unknown' });
  assert.equal(pref.publicCelebration, true);
  assert.equal(pref.explicit, false);
});

test('preferenceRespect: returns explicit stored preference', () => {
  const le = makeLE();
  le.setPreference('shy', { publicCelebration: false });
  const pref = le.preferenceRespect({ userId: 'shy' });
  assert.equal(pref.publicCelebration, false);
  assert.equal(pref.explicit, true);
});

test('preferenceRespect: preference history is preserved on change (never delete)', () => {
  const le = makeLE();
  le.setPreference('dani', { publicCelebration: true });
  le.setPreference('dani', { publicCelebration: false });
  const pref = le.preferenceRespect({ userId: 'dani' });
  assert.equal(pref.publicCelebration, false);
  assert.equal(pref.history.length, 1);
  assert.equal(pref.history[0].snapshot.publicCelebration, true);
});

// ══════════════════════════════════════════════════════════════════
// EXCLUDE SENSITIVE
// ══════════════════════════════════════════════════════════════════

test('excludeSensitive: lists bereavement events with handling guidance', () => {
  const le = makeLE();
  registerDani(le);
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)) });
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BEREAVEMENT,
    date: NOW });
  const list = le.excludeSensitive({ eventType: EVENT_TYPES.BEREAVEMENT });
  assert.equal(list.length, 1);
  assert.equal(list[0].automated, false);
  assert.match(list[0].handling.he, /אישית/);
  assert.match(list[0].handling.en, /personally/);
  assert.ok(list[0].suggestedActions.length >= 3);
});

// ══════════════════════════════════════════════════════════════════
// COMPANY MILESTONES
// ══════════════════════════════════════════════════════════════════

test('companyMilestones: returns only people on milestone years (5,10,15,20...)', () => {
  const le = makeLE();
  le.registerPerson({ personId: 'a', hireDate: new Date(Date.UTC(2021, 3, 20)), department: 'x' });
  le.registerPerson({ personId: 'b', hireDate: new Date(Date.UTC(2024, 3, 20)), department: 'x' });
  le.registerPerson({ personId: 'c', hireDate: new Date(Date.UTC(2016, 3, 20)), department: 'x' });
  le.registerPerson({ personId: 'd', hireDate: new Date(Date.UTC(2006, 3, 20)), department: 'x' });

  const ms = le.companyMilestones({ lookaheadDays: 60 });
  // a=5y, c=10y, d=20y → 3 milestone people; b=2y non-milestone
  assert.equal(ms.length, 3);
  const ids = ms.map(m => m.personId).sort();
  assert.deepEqual(ids, ['a', 'c', 'd']);

  const years = ms.map(m => m.years).sort((x, y) => x - y);
  assert.deepEqual(years, [5, 10, 20]);
});

test('companyMilestones: 20-year milestone uses 4.5× multiplier', () => {
  const le = makeLE();
  le.registerPerson({
    personId: 'twenty', hireDate: new Date(Date.UTC(2006, 3, 20)),
    department: 'production',
  });
  const ms = le.companyMilestones({ lookaheadDays: 60 });
  assert.equal(ms.length, 1);
  assert.equal(ms[0].years, 20);
  assert.equal(ms[0].suggestedGift, Math.round(250 * 4.5)); // 1125
});

// ══════════════════════════════════════════════════════════════════
// NEWBORN / WEDDING CUSTOM
// ══════════════════════════════════════════════════════════════════

test('newbornGift: creates child-birth event + card + budget', () => {
  const le = makeLE();
  registerDani(le);
  const out = le.newbornGift({
    employeeId: 'dani',
    babyBornDate: new Date(Date.UTC(2026, 3, 1)),
  });
  assert.ok(out.eventId);
  assert.match(out.custom.he, /מתנת לידה/);
  assert.match(out.custom.en, /baby gift/);
  assert.ok(out.card.card.he.body.length > 0);
  assert.equal(out.budget.eventType, EVENT_TYPES.CHILD_BIRTH);
  assert.equal(out.budget.suggested, 400);

  const stored = le.getEvent(out.eventId);
  assert.equal(stored.type, EVENT_TYPES.CHILD_BIRTH);
});

test('weddingCustom: creates marriage event + card + budget', () => {
  const le = makeLE();
  registerDani(le);
  const out = le.weddingCustom({
    employeeId: 'dani',
    weddingDate: new Date(Date.UTC(2026, 5, 15)),
  });
  assert.ok(out.eventId);
  assert.match(out.custom.he, /מעטפה/);
  assert.equal(out.budget.suggested, 500);

  const stored = le.getEvent(out.eventId);
  assert.equal(stored.type, EVENT_TYPES.MARRIAGE);
});

// ══════════════════════════════════════════════════════════════════
// ANNUAL SUMMARY
// ══════════════════════════════════════════════════════════════════

test('annualSummary: counts events in calendar year', () => {
  const le = makeLE();
  registerDani(le);
  // Two 2026 events (marriage + newborn)
  le.weddingCustom({ employeeId: 'dani', weddingDate: new Date(Date.UTC(2026, 5, 15)) });
  le.newbornGift({ employeeId: 'dani', babyBornDate: new Date(Date.UTC(2026, 7, 1)) });
  // A 2025 event that should NOT be counted
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.PROMOTION,
    date: new Date(Date.UTC(2025, 5, 1)) });

  const summary = le.annualSummary({ year: 2026 });
  assert.equal(summary.total, 2);
  assert.equal(summary.byType[EVENT_TYPES.MARRIAGE], 1);
  assert.equal(summary.byType[EVENT_TYPES.CHILD_BIRTH], 1);
  assert.equal(summary.byType[EVENT_TYPES.PROMOTION], 0);
});

test('annualSummary: from/to window filter', () => {
  const le = makeLE();
  registerDani(le);
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.PROMOTION,
    date: new Date(Date.UTC(2026, 0, 15)) });
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.PROMOTION,
    date: new Date(Date.UTC(2026, 5, 15)) });

  const q1 = le.annualSummary({
    from: new Date(Date.UTC(2026, 0, 1)),
    to: new Date(Date.UTC(2026, 2, 31)),
  });
  assert.equal(q1.total, 1);
});

// ══════════════════════════════════════════════════════════════════
// CALENDAR INTEGRATION
// ══════════════════════════════════════════════════════════════════

test('calendarIntegration: emits upcoming events for team calendar', () => {
  const le = makeLE();
  registerDani(le);
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)) });
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.WORK_ANNIVERSARY,
    date: new Date(Date.UTC(2021, 3, 20)) });

  const cal = le.calendarIntegration({ employeeId: 'dani' });
  assert.equal(cal.length, 2);
  // Sorted by start date
  assert.ok(cal[0].start.getTime() <= cal[1].start.getTime());
  assert.ok(cal[0].uid.indexOf('life-events.techno-kol') !== -1);
  assert.ok(cal[0].summary.he.length > 0);
  assert.ok(cal[0].summary.en.length > 0);
});

test('calendarIntegration: excludes bereavement and opted-out users', () => {
  const le = makeLE();
  registerDani(le);
  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BEREAVEMENT, date: NOW });
  const cal = le.calendarIntegration({ employeeId: 'dani' });
  assert.equal(cal.length, 0);

  le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)) });
  le.setPreference('dani', { publicCelebration: false });
  const cal2 = le.calendarIntegration({ employeeId: 'dani' });
  assert.equal(cal2.length, 0);
});

// ══════════════════════════════════════════════════════════════════
// NEVER DELETE RULE
// ══════════════════════════════════════════════════════════════════

test('never delete: listEvents keeps everything after supersede + status changes', () => {
  const le = makeLE();
  registerDani(le);
  const e1 = le.recordEvent({ personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)) });
  const e2 = le.recordEvent({
    personId: 'dani', type: EVENT_TYPES.BIRTHDAY,
    date: new Date(Date.UTC(1990, 4, 15)),
    supersedesEventId: e1.eventId,
  });
  le.markCelebrated(e2.eventId);

  const all = le.listEvents({ personId: 'dani' });
  assert.equal(all.length, 2);                  // old record still present
  const statuses = all.map(e => e.status).sort();
  assert.deepEqual(statuses, [EVENT_STATUS.CELEBRATED, EVENT_STATUS.SUPERSEDED]);
});

// ══════════════════════════════════════════════════════════════════
// LABELS SANITY
// ══════════════════════════════════════════════════════════════════

test('LABELS: every event type has Hebrew + English', () => {
  for (const t of Object.values(EVENT_TYPES)) {
    assert.ok(LABELS[t], 'label missing for ' + t);
    assert.ok(LABELS[t].he.length > 0, 'he missing for ' + t);
    assert.ok(LABELS[t].en.length > 0, 'en missing for ' + t);
  }
});

test('MILESTONES_YEARS: covers classic Israeli workplace milestones', () => {
  for (const y of [5, 10, 15, 20, 25, 30]) {
    assert.ok(MILESTONES_YEARS.indexOf(y) !== -1, y + ' missing');
  }
});
