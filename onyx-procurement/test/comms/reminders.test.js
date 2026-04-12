/**
 * Tests — ReminderScheduler (Agent Y-128)
 *
 * Zero-dep: node:test + node:assert/strict.
 * Run with:    node --test test/comms/reminders.test.js
 *
 * Coverage (≥ 18 tests — we ship 24):
 *   01 module exports the expected symbols
 *   02 cron-lite parser: daily
 *   03 cron-lite parser: weekly (named DOW)
 *   04 cron-lite parser: monthly
 *   05 cron-lite parser: annual
 *   06 cron-lite parser rejects garbage
 *   07 scheduleReminder creates a one-time reminder
 *   08 scheduleReminder respects leadTime (pre-fire offset)
 *   09 scheduleReminder with recurrence stores parsed recurrence
 *   10 scheduleReminder validates required fields
 *   11 listDueReminders returns only items due at or before `now`
 *   12 processDue dispatches via injected dispatcher
 *   13 processDue advances recurring reminders to the next fire
 *   14 processDue records failed dispatch but preserves record
 *   15 snoozeReminder delays fire-time and preserves record (append-only)
 *   16 cancelReminder flips status without deleting the record
 *   17 cancelling is idempotent
 *   18 reminderHistory is append-only and grows with each action
 *   19 upcomingForEntity filters by entityId and days window
 *   20 israeliBusinessDayCheck skips Friday / Saturday / holidays
 *   21 quietHoursSkip defers reminders scheduled in the silent window
 *   22 quietHoursSkip returns input when outside window
 *   23 bulkSchedule creates many reminders, collecting failures
 *   24 relative-to-event trigger resolves against supplied anchor
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ReminderScheduler,
  cronLiteParser,
  israeliBusinessDayCheck,
  quietHoursSkip,
  REMINDER_GLOSSARY,
} = require('../../src/comms/reminders');

// ──────────────────────────────────────────────────────────────
// Fixed reference clock: 2026-04-12 (Sunday = business day in IL),
// 09:00 UTC — avoids Passover (which ends 2026-04-08 in our table)
// so the business-day helper behaves predictably.
// ──────────────────────────────────────────────────────────────
const REFERENCE_NOW = Date.UTC(2026, 3, 12, 9, 0, 0); // Apr 12 2026 09:00Z
const fakeClock = () => REFERENCE_NOW;

function hours (n) { return n * 60 * 60 * 1000; }
function days  (n) { return n * 24 * 60 * 60 * 1000; }

// ──────────────────────────────────────────────────────────────
// 01 — module exports
// ──────────────────────────────────────────────────────────────
test('01 module exports the expected symbols', () => {
  assert.equal(typeof ReminderScheduler, 'function');
  assert.equal(typeof cronLiteParser, 'function');
  assert.equal(typeof israeliBusinessDayCheck, 'function');
  assert.equal(typeof quietHoursSkip, 'function');
  assert.equal(typeof REMINDER_GLOSSARY, 'object');
  assert.ok(REMINDER_GLOSSARY.scheduleReminder.he.length > 0);
  assert.ok(REMINDER_GLOSSARY.scheduleReminder.en.length > 0);
});

// ──────────────────────────────────────────────────────────────
// 02-05 — cron-lite parser variants
// ──────────────────────────────────────────────────────────────
test('02 cron-lite parser: daily HH:MM', () => {
  const p = cronLiteParser('daily 09:30');
  assert.equal(p.kind, 'daily');
  assert.equal(p.hour, 9);
  assert.equal(p.minute, 30);
  assert.equal(p.label_he, 'יומי');
});

test('03 cron-lite parser: weekly mon 08:00', () => {
  const p = cronLiteParser('weekly mon 08:00');
  assert.equal(p.kind, 'weekly');
  assert.equal(p.dow, 1);
  assert.equal(p.hour, 8);
  assert.equal(p.minute, 0);
});

test('04 cron-lite parser: monthly 1 07:15', () => {
  const p = cronLiteParser('monthly 1 07:15');
  assert.equal(p.kind, 'monthly');
  assert.equal(p.day, 1);
  assert.equal(p.hour, 7);
  assert.equal(p.minute, 15);
});

test('05 cron-lite parser: annual 04-15 10:00', () => {
  const p = cronLiteParser('annual 04-15 10:00');
  assert.equal(p.kind, 'annual');
  assert.equal(p.month, 4);
  assert.equal(p.day, 15);
  assert.equal(p.hour, 10);
  assert.equal(p.minute, 0);
});

// ──────────────────────────────────────────────────────────────
// 06 — parser rejects garbage
// ──────────────────────────────────────────────────────────────
test('06 cron-lite parser rejects garbage', () => {
  assert.throws(() => cronLiteParser(''), /empty expression/);
  assert.throws(() => cronLiteParser('nope 12:00'), /unknown kind/);
  assert.throws(() => cronLiteParser('daily 99:99'), /out-of-range/);
  assert.throws(() => cronLiteParser('weekly xyz 08:00'), /unknown DOW/);
});

// ──────────────────────────────────────────────────────────────
// 07 — scheduleReminder one-time
// ──────────────────────────────────────────────────────────────
test('07 scheduleReminder creates a one-time reminder', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const fireIso = new Date(REFERENCE_NOW + hours(3)).toISOString();
  const r = s.scheduleReminder({
    id: 'rem-01',
    subject: { he: 'תשלום ספק', en: 'Vendor payment' },
    trigger: { type: 'one-time', when: fireIso },
    channels: ['email', 'sms'],
    priority: 'high',
  });
  assert.equal(r.id, 'rem-01');
  assert.equal(r.subject.he, 'תשלום ספק');
  assert.equal(r.subject.en, 'Vendor payment');
  assert.equal(r.status, 'scheduled');
  assert.equal(r.fireAt, REFERENCE_NOW + hours(3));
  assert.deepEqual(r.channels, ['email', 'sms']);
  assert.equal(r.priority, 'high');
  assert.equal(r.history.length, 1);
  assert.equal(r.history[0].action, 'scheduled');
});

// ──────────────────────────────────────────────────────────────
// 08 — leadTime pre-fire offset
// ──────────────────────────────────────────────────────────────
test('08 scheduleReminder respects leadTime', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const event = new Date(REFERENCE_NOW + days(2)).toISOString();
  const r = s.scheduleReminder({
    subject: 'Renewal',
    trigger: { type: 'date-based', when: event },
    leadTime: '2h',
  });
  // leadTime moves the fire time EARLIER by 2h
  assert.equal(r.fireAt, REFERENCE_NOW + days(2) - hours(2));
  assert.equal(r.baseFireAt, REFERENCE_NOW + days(2));
});

// ──────────────────────────────────────────────────────────────
// 09 — recurrence string stored as parsed object
// ──────────────────────────────────────────────────────────────
test('09 scheduleReminder with recurrence stores parsed recurrence', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const r = s.scheduleReminder({
    subject: { he: 'דו״ח שבועי', en: 'Weekly report' },
    trigger: { type: 'date-based', when: new Date(REFERENCE_NOW + hours(1)).toISOString() },
    recurrence: 'weekly mon 09:00',
  });
  assert.equal(r.recurrence.kind, 'weekly');
  assert.equal(r.recurrence.dow, 1);
  assert.equal(r.recurrence.hour, 9);
});

// ──────────────────────────────────────────────────────────────
// 10 — required field validation
// ──────────────────────────────────────────────────────────────
test('10 scheduleReminder validates required fields', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  assert.throws(() => s.scheduleReminder(null), /requires an object/);
  assert.throws(() => s.scheduleReminder({}), /subject is required|trigger is required/);
  assert.throws(() => s.scheduleReminder({ subject: 'X' }), /trigger is required/);
  assert.throws(() => s.scheduleReminder({
    subject: 'X',
    trigger: { type: 'one-time' }, // no `when`
  }), /trigger\.when is required/);
});

// ──────────────────────────────────────────────────────────────
// 11 — listDueReminders returns only items due at/before now
// ──────────────────────────────────────────────────────────────
test('11 listDueReminders filters by fireAt ≤ now', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  s.scheduleReminder({
    id: 'past-1',
    subject: 'past',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW - hours(1)).toISOString() },
  });
  s.scheduleReminder({
    id: 'past-2',
    subject: 'past',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW - hours(3)).toISOString() },
  });
  s.scheduleReminder({
    id: 'future-1',
    subject: 'future',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(2)).toISOString() },
  });
  const due = s.listDueReminders(REFERENCE_NOW);
  assert.equal(due.length, 2);
  // chronological ordering
  assert.equal(due[0].id, 'past-2');
  assert.equal(due[1].id, 'past-1');
});

// ──────────────────────────────────────────────────────────────
// 12 — processDue calls injected dispatcher
// ──────────────────────────────────────────────────────────────
test('12 processDue calls dispatcher for each due reminder', async () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const calls = [];
  const dispatcher = async (payload) => {
    calls.push(payload);
    return { ok: true, result: { channel: payload.channels[0] } };
  };
  s.scheduleReminder({
    id: 'd-1',
    subject: { he: 'חשבונית', en: 'Invoice' },
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW - hours(1)).toISOString() },
    channels: ['email'],
  });
  s.scheduleReminder({
    id: 'd-2',
    subject: { he: 'אספקה', en: 'Delivery' },
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW - hours(2)).toISOString() },
    channels: ['sms'],
  });
  const res = await s.processDue(REFERENCE_NOW, dispatcher);
  assert.equal(res.processed, 2);
  assert.equal(res.dispatched, 2);
  assert.equal(res.failed, 0);
  assert.equal(calls.length, 2);
  // each payload carries bilingual labels
  assert.ok(calls[0].label_he && calls[0].label_en);
  // records advanced to dispatched
  const all = s.listAll().map(r => r.status);
  assert.ok(all.every(st => st === 'dispatched'));
});

// ──────────────────────────────────────────────────────────────
// 13 — recurring reminders roll to next fire
// ──────────────────────────────────────────────────────────────
test('13 processDue advances recurring reminders', async () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const dispatcher = async () => ({ ok: true });
  const r = s.scheduleReminder({
    id: 'recur-1',
    subject: 'Daily backup',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW - hours(1)).toISOString() },
    recurrence: 'daily 09:00',
  });
  const before = r.fireAt;
  await s.processDue(REFERENCE_NOW, dispatcher);
  const all = s.listAll();
  const rec = all.find(x => x.id === 'recur-1');
  assert.equal(rec.status, 'scheduled');
  assert.ok(rec.fireAt > before, 'fireAt should advance forward');
  // history has both dispatched and recurring-next
  const actions = rec.history.map(h => h.action);
  assert.ok(actions.includes('dispatched'));
  assert.ok(actions.includes('recurring-next'));
});

// ──────────────────────────────────────────────────────────────
// 14 — failed dispatch preserves record
// ──────────────────────────────────────────────────────────────
test('14 processDue marks failed dispatch without deleting record', async () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const dispatcher = async () => ({ ok: false, error: 'SMTP 500' });
  s.scheduleReminder({
    id: 'fail-1',
    subject: 'Broken',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW - hours(1)).toISOString() },
  });
  const res = await s.processDue(REFERENCE_NOW, dispatcher);
  assert.equal(res.failed, 1);
  assert.equal(res.dispatched, 0);
  const r = s.listAll().find(x => x.id === 'fail-1');
  assert.equal(r.status, 'failed');
  assert.equal(r.lastError, 'SMTP 500');
  // record still present — "לא מוחקים רק משדרגים ומגדלים"
  assert.ok(r.history.some(h => h.action === 'dispatch-failed'));
});

// ──────────────────────────────────────────────────────────────
// 15 — snoozeReminder delays and preserves history
// ──────────────────────────────────────────────────────────────
test('15 snoozeReminder preserves record and appends history', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const r = s.scheduleReminder({
    id: 'snz',
    subject: 'Meeting',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(1)).toISOString() },
  });
  const before = r.history.length;
  const snoozed = s.snoozeReminder('snz', new Date(REFERENCE_NOW + hours(4)).toISOString());
  assert.equal(snoozed.status, 'snoozed');
  assert.equal(snoozed.fireAt, REFERENCE_NOW + hours(4));
  assert.equal(snoozed.history.length, before + 1);
  assert.equal(snoozed.history[snoozed.history.length - 1].action, 'snoozed');
  // the original record is still accessible
  assert.equal(s.listAll().length, 1);
});

// ──────────────────────────────────────────────────────────────
// 16 — cancelReminder flips status, never deletes
// ──────────────────────────────────────────────────────────────
test('16 cancelReminder flips status without deleting', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  s.scheduleReminder({
    id: 'cx',
    subject: 'Task',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(1)).toISOString() },
  });
  const cancelled = s.cancelReminder('cx', 'superseded');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.history.some(h => h.action === 'cancelled'), true);
  assert.equal(s.listAll().length, 1, 'record still stored');
});

// ──────────────────────────────────────────────────────────────
// 17 — cancelling is idempotent
// ──────────────────────────────────────────────────────────────
test('17 cancelReminder is idempotent', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  s.scheduleReminder({
    id: 'idem',
    subject: 'Z',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(1)).toISOString() },
  });
  s.cancelReminder('idem', 'r1');
  const hist1 = s.reminderHistory('idem').length;
  s.cancelReminder('idem', 'r2');
  const hist2 = s.reminderHistory('idem').length;
  // idempotent: no duplicate "cancelled" entry
  assert.equal(hist2, hist1);
});

// ──────────────────────────────────────────────────────────────
// 18 — append-only history (never shrinks)
// ──────────────────────────────────────────────────────────────
test('18 reminderHistory is append-only', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  s.scheduleReminder({
    id: 'log',
    subject: 'Log me',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(1)).toISOString() },
  });
  s.snoozeReminder('log', new Date(REFERENCE_NOW + hours(5)).toISOString());
  s.cancelReminder('log', 'done');
  const hist = s.reminderHistory('log');
  // expect at least: scheduled, snoozed, cancelled
  const actions = hist.map(h => h.action);
  assert.ok(actions.includes('scheduled'));
  assert.ok(actions.includes('snoozed'));
  assert.ok(actions.includes('cancelled'));
  // history entries are ordered chronologically
  for (let i = 1; i < hist.length; i += 1) {
    assert.ok(hist[i].at >= hist[i - 1].at);
  }
});

// ──────────────────────────────────────────────────────────────
// 19 — upcomingForEntity filters by entity + window
// ──────────────────────────────────────────────────────────────
test('19 upcomingForEntity filters by entityId and window', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  s.scheduleReminder({
    id: 'a1',
    subject: 'Customer A reminder 1',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + days(1)).toISOString() },
    audience: { entityId: 'cust-A' },
  });
  s.scheduleReminder({
    id: 'a2',
    subject: 'Customer A far future',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + days(30)).toISOString() },
    audience: { entityId: 'cust-A' },
  });
  s.scheduleReminder({
    id: 'b1',
    subject: 'Customer B',
    trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + days(2)).toISOString() },
    audience: { entityId: 'cust-B' },
  });
  const a = s.upcomingForEntity('cust-A', 7);
  assert.equal(a.length, 1, 'only the in-window A reminder should appear');
  assert.equal(a[0].id, 'a1');
  const aWide = s.upcomingForEntity('cust-A', 60);
  assert.equal(aWide.length, 2);
});

// ──────────────────────────────────────────────────────────────
// 20 — Israeli business-day skip (Sun-Thu excluding holidays)
// ──────────────────────────────────────────────────────────────
test('20 israeliBusinessDayCheck flags weekends & holidays', () => {
  // 2026-04-10 = Friday
  const friday = Date.UTC(2026, 3, 10, 10, 0, 0);
  const friChk = israeliBusinessDayCheck(friday);
  assert.equal(friChk.isBusinessDay, false);
  assert.equal(friChk.isWeekend, true);
  assert.ok(friChk.nextBusinessEpoch > friday);

  // 2026-04-11 = Saturday (Shabbat)
  const saturday = Date.UTC(2026, 3, 11, 10, 0, 0);
  const satChk = israeliBusinessDayCheck(saturday);
  assert.equal(satChk.isBusinessDay, false);

  // 2026-04-12 = Sunday — a business day in Israel
  const sunday = Date.UTC(2026, 3, 12, 10, 0, 0);
  const sunChk = israeliBusinessDayCheck(sunday);
  assert.equal(sunChk.isBusinessDay, true);
  assert.equal(sunChk.isWeekend, false);

  // 2026-04-23 = Independence Day (per ISRAELI_HOLIDAYS table)
  const indep = Date.UTC(2026, 3, 23, 10, 0, 0);
  const indepChk = israeliBusinessDayCheck(indep);
  assert.equal(indepChk.isHoliday, true);
  assert.equal(indepChk.isBusinessDay, false);
});

// ──────────────────────────────────────────────────────────────
// 21 — quietHoursSkip defers reminder in silent window
// ──────────────────────────────────────────────────────────────
test('21 quietHoursSkip defers reminders scheduled during quiet hours', () => {
  // Quiet block: 20:00 → 07:00 (wraps midnight)
  const quiet = { start: '20:00', end: '07:00' };
  // A reminder at 22:30 UTC should be deferred to 07:00 UTC next day
  const epoch = Date.UTC(2026, 3, 12, 22, 30, 0);
  const res = quietHoursSkip(epoch, quiet);
  assert.equal(res.inQuiet, true);
  assert.ok(res.deferredTo > epoch);
  const d = new Date(res.deferredTo);
  assert.equal(d.getUTCHours(), 7);
  assert.equal(d.getUTCMinutes(), 0);
  assert.ok(res.reason_he && res.reason_en);

  // Scheduler integration: deferral recorded on the reminder
  const s = new ReminderScheduler({ clock: fakeClock, quietHours: quiet });
  const r = s.scheduleReminder({
    id: 'quiet-1',
    subject: 'Midnight ping',
    trigger: { type: 'one-time', when: new Date(epoch).toISOString() },
  });
  assert.ok(r.deferrals.length > 0);
  assert.equal(r.deferrals[0].reason, 'quiet-hours');
  assert.ok(r.fireAt > epoch);
});

// ──────────────────────────────────────────────────────────────
// 22 — quietHoursSkip returns input when outside window
// ──────────────────────────────────────────────────────────────
test('22 quietHoursSkip is a no-op outside the quiet window', () => {
  const quiet = { start: '20:00', end: '07:00' };
  // 14:00 UTC is clearly outside 20→07
  const epoch = Date.UTC(2026, 3, 12, 14, 0, 0);
  const res = quietHoursSkip(epoch, quiet);
  assert.equal(res.inQuiet, false);
  assert.equal(res.deferredTo, epoch);
});

// ──────────────────────────────────────────────────────────────
// 23 — bulkSchedule creates many reminders
// ──────────────────────────────────────────────────────────────
test('23 bulkSchedule creates all and collects failures', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const batch = [
    { id: 'b1', subject: 'A', trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(1)).toISOString() } },
    { id: 'b2', subject: 'B', trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(2)).toISOString() } },
    { id: 'b3', subject: 'C' /* missing trigger -> should fail */ },
    { id: 'b4', subject: 'D', trigger: { type: 'one-time', when: new Date(REFERENCE_NOW + hours(4)).toISOString() } },
  ];
  const res = s.bulkSchedule(batch);
  assert.equal(res.ok, 3);
  assert.equal(res.failed, 1);
  assert.equal(res.created.length, 3);
  assert.equal(res.failures.length, 1);
  assert.match(res.failures[0].error, /trigger is required/);
});

// ──────────────────────────────────────────────────────────────
// 24 — relative-to-event trigger resolves correctly
// ──────────────────────────────────────────────────────────────
test('24 relative-to-event trigger resolves offset from anchor', () => {
  const s = new ReminderScheduler({ clock: fakeClock });
  const eventIso = new Date(REFERENCE_NOW + days(3)).toISOString();
  const r = s.scheduleReminder({
    id: 'rel',
    subject: 'T-minus 1 day',
    trigger: { type: 'relative-to-event', relativeTo: eventIso, offset: '-1d' },
  });
  assert.equal(r.fireAt, REFERENCE_NOW + days(3) - days(1));
});
