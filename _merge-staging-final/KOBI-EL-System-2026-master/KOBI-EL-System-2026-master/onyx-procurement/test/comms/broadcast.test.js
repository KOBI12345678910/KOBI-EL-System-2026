/**
 * Tests — Broadcast Announcement Engine (Agent Y-127 upgrade)
 * Zero-dep: node:test + node:assert.
 *
 * Rule enforced:  לא מוחקים רק משדרגים ומגדלים
 * (nothing is ever deleted — cancellation is a status flip + append-only log)
 *
 * Coverage:
 *   1.  createBroadcast — bilingual, channel & priority validation
 *   2.  scheduleBroadcast — future publishAt, status=scheduled
 *   3.  sendNow — immediate dispatch, delivery events
 *   4.  cancelBroadcast — status flip, reason captured, record preserved
 *   5.  audienceSelector — departments/roles/tenures/locations/segments
 *   6.  audienceSelector — custom list + all
 *   7.  ackTracking — count acknowledged / pending
 *   8.  ackReminder — sends reminders only to non-acknowledgers
 *   9.  deliveryReport — sent/delivered/opened/clicked/acknowledged counts
 *  10.  emergencyBroadcast — bypasses opt-out, forces all channels
 *  11.  opt-out enforcement — normal broadcast skips opted-out users
 *  12.  opt-out enforcement — essential broadcasts cannot be opted out of
 *  13.  templateBroadcast — bilingual variable substitution
 *  14.  broadcastHistory — append-only filter by action / status
 *  15.  createBroadcast — rejects invalid channels
 *  16.  sendNow — rejects cancelled broadcast
 *  17.  cancelBroadcast — preserves record, history entry appended
 *  18.  Hebrew RTL — titles & bodies preserved in bilingual view
 *  19.  No deletes — append-only invariants after cancel
 *  20.  Opt-out list query form returns user ids
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  Broadcast,
  CHANNELS,
  PRIORITY,
  BROADCAST_STATUS,
  ESSENTIAL_BROADCAST_TYPES,
  HEBREW_GLOSSARY,
} = require('../../src/comms/broadcast');

// ---- helpers ---------------------------------------------------------------

function fixedClock(startMs = Date.UTC(2026, 3, 11, 9, 0, 0)) { // 2026-04-11 09:00 UTC
  let t = startMs;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    set: (ms) => { t = ms; },
  };
}

function mockDirectory() {
  // 8 employees across departments/roles/locations/segments with varied tenure.
  const hire = (years) => Date.UTC(2026, 3, 11) - (years * 365.25 * 24 * 3600 * 1000);
  return [
    { id: 'u1', department: 'eng',      role: 'dev',     location: 'tel-aviv', segments: ['core'],     hireDate: hire(0.5) }, // new
    { id: 'u2', department: 'eng',      role: 'dev',     location: 'haifa',    segments: ['core'],     hireDate: hire(2) },   // mid
    { id: 'u3', department: 'hr',       role: 'manager', location: 'tel-aviv', segments: ['leads'],    hireDate: hire(4) },   // senior
    { id: 'u4', department: 'hr',       role: 'rep',     location: 'beer-sheva', segments: ['support'],hireDate: hire(8) },   // veteran
    { id: 'u5', department: 'finance',  role: 'cfo',     location: 'tel-aviv', segments: ['leads'],    hireDate: hire(10) },  // veteran
    { id: 'u6', department: 'ops',      role: 'worker',  location: 'haifa',    segments: ['floor'],    hireDate: hire(0.2) }, // new
    { id: 'u7', department: 'ops',      role: 'worker',  location: 'haifa',    segments: ['floor'],    hireDate: hire(1.5) }, // mid
    { id: 'u8', department: 'security', role: 'guard',   location: 'tel-aviv', segments: ['floor'],    hireDate: hire(5) },   // senior
  ];
}

function makeBroadcast(overrides = {}) {
  const clock = overrides.clock || fixedClock();
  const b = new Broadcast({
    now: clock.now,
    directory: overrides.directory || mockDirectory(),
  });
  return { b, clock };
}

// ---- tests -----------------------------------------------------------------

test('Y127-01 createBroadcast — creates bilingual record with channels & priority', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'עדכון נוהל בטיחות',
    title_en: 'Safety policy update',
    body_he: 'יש לקרוא ולאשר עד סוף השבוע',
    body_en: 'Please read and acknowledge by end of week',
    channels: ['email', 'in-app', 'push'],
    audience: { all: true },
    priority: 'normal',
    requiresAck: true,
  });

  assert.ok(v.id, 'has id');
  assert.equal(v.title_he, 'עדכון נוהל בטיחות');
  assert.equal(v.title_en, 'Safety policy update');
  assert.equal(v.body_he, 'יש לקרוא ולאשר עד סוף השבוע');
  assert.equal(v.body_en, 'Please read and acknowledge by end of week');
  assert.deepEqual(v.channels.sort(), ['email', 'in-app', 'push']);
  assert.equal(v.priority, 'normal');
  assert.equal(v.requiresAck, true);
  assert.equal(v.status, 'draft');
  assert.equal(v.cancelled, false);
});

test('Y127-02 scheduleBroadcast — sets status=scheduled & future publishAt', () => {
  const { b, clock } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'כנס חברה',
    title_en: 'Company event',
    body_he: 'יום שישי',
    body_en: 'Friday',
    channels: ['in-app'],
    priority: 'info',
    audience: { all: true },
  });
  const future = clock.now() + 48 * 3600 * 1000;
  const scheduled = b.scheduleBroadcast(v.id, future);
  assert.equal(scheduled.status, 'scheduled');
  assert.equal(scheduled.scheduledFor, future);
});

test('Y127-03 sendNow — immediate dispatch produces delivery events', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'התראה',
    title_en: 'Alert',
    body_he: 'גוף ההודעה',
    body_en: 'Body text',
    channels: ['in-app', 'email'],
    audience: { all: true },
    priority: 'normal',
  });
  const r = b.sendNow(v.id);
  assert.equal(r.broadcastId, v.id);
  assert.equal(r.recipientCount, 8);
  assert.equal(r.channelCount, 2);
  assert.equal(r.eventCount, 16);    // 8 users * 2 channels
  assert.equal(r.status, 'sent');
});

test('Y127-04 cancelBroadcast — flips status, records reason, preserves record', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'טיוטה',
    title_en: 'Draft',
    body_he: 'תוכן',
    body_en: 'content',
    channels: ['email'],
    audience: { all: true },
    priority: 'normal',
  });
  const cancelled = b.cancelBroadcast(v.id, 'ראש ביזנס ביקש לעצור');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.cancellationReason, 'ראש ביזנס ביקש לעצור');

  // Record STILL present in store (לא מוחקים)
  const snap = b._snapshot();
  assert.ok(snap.announcements[v.id], 'original record preserved');
  assert.equal(snap.announcements[v.id].status, 'cancelled');
});

test('Y127-05 audienceSelector — filters by department/role/location', () => {
  const { b } = makeBroadcast();
  const engs = b.audienceSelector({ criteria: { departments: ['eng'] } });
  assert.equal(engs.length, 2);
  assert.deepEqual(engs.map((u) => u.id).sort(), ['u1', 'u2']);

  const tlvWorkers = b.audienceSelector({ criteria: { locations: ['tel-aviv'], roles: ['guard', 'cfo'] } });
  assert.deepEqual(tlvWorkers.map((u) => u.id).sort(), ['u5', 'u8']);

  const haifaOps = b.audienceSelector({ criteria: { departments: ['ops'], locations: ['haifa'] } });
  assert.equal(haifaOps.length, 2);
});

test('Y127-06 audienceSelector — tenure bands + segments + custom + all', () => {
  const { b } = makeBroadcast();
  const veterans = b.audienceSelector({ criteria: { tenures: ['veteran'] } });
  assert.deepEqual(veterans.map((u) => u.id).sort(), ['u4', 'u5']);

  const newbies = b.audienceSelector({ criteria: { tenures: ['new'] } });
  assert.deepEqual(newbies.map((u) => u.id).sort(), ['u1', 'u6']);

  const floor = b.audienceSelector({ criteria: { segments: ['floor'] } });
  assert.deepEqual(floor.map((u) => u.id).sort(), ['u6', 'u7', 'u8']);

  const custom = b.audienceSelector({ criteria: { custom: ['u1', 'u3', 'u5'] } });
  assert.deepEqual(custom.map((u) => u.id).sort(), ['u1', 'u3', 'u5']);

  const all = b.audienceSelector({ criteria: { all: true } });
  assert.equal(all.length, 8);
});

test('Y127-07 ackTracking — counts acknowledged vs pending', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'נוהל חדש',
    title_en: 'New policy',
    body_he: 'גוף',
    body_en: 'body',
    channels: ['in-app'],
    audience: { all: true },
    priority: 'normal',
    requiresAck: true,
  });
  b.sendNow(v.id);
  // Users u1 & u2 acknowledge.
  b.acknowledge({ announcementId: v.id, userId: 'u1' });
  b.acknowledge({ announcementId: v.id, userId: 'u2' });

  const track = b.ackTracking(v.id);
  assert.equal(track.total, 8);
  assert.equal(track.acknowledged, 2);
  assert.equal(track.pending, 6);
  assert.deepEqual(track.acknowledgedUserIds.sort(), ['u1', 'u2']);
  assert.equal(track.pendingUserIds.length, 6);
});

test('Y127-08 ackReminder — sends reminders only to non-acknowledgers', () => {
  const { b, clock } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'הנחיות חירום',
    title_en: 'Emergency guidelines',
    body_he: 'לקרוא',
    body_en: 'read',
    channels: ['in-app', 'email'],
    audience: { all: true },
    priority: 'urgent',
    requiresAck: true,
  });
  b.sendNow(v.id);
  b.acknowledge({ announcementId: v.id, userId: 'u1' });
  b.acknowledge({ announcementId: v.id, userId: 'u5' });
  clock.advance(3600 * 1000);

  const rem = b.ackReminder(v.id);
  assert.equal(rem.remindersSent, 6, 'reminds only the 6 non-ackers');
  assert.ok(!rem.userIds.includes('u1'));
  assert.ok(!rem.userIds.includes('u5'));
  assert.equal(rem.events.length, 12); // 6 users * 2 channels
});

test('Y127-09 deliveryReport — sent/delivered/opened/acknowledged counts', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'עדכון מערכת',
    title_en: 'System update',
    body_he: 'תוכן',
    body_en: 'content',
    channels: ['email', 'in-app'],
    audience: { all: true },
    priority: 'normal',
    requiresAck: true,
  });
  b.sendNow(v.id);
  // Record reads for 4 users.
  for (const uid of ['u1', 'u2', 'u3', 'u4']) {
    b.trackReadReceipts(v.id, { userId: uid, channel: 'email' });
  }
  // Ack by 2.
  b.acknowledge({ announcementId: v.id, userId: 'u1' });
  b.acknowledge({ announcementId: v.id, userId: 'u2' });

  const rep = b.deliveryReport(v.id);
  assert.equal(rep.sent, 16);
  assert.equal(rep.delivered, 16);
  assert.equal(rep.opened, 4);
  assert.equal(rep.clicked, 4);
  assert.equal(rep.acknowledged, 2);
  assert.equal(rep.failed, 0);
  assert.equal(rep.status, 'sent');
});

test('Y127-10 emergencyBroadcast — bypasses opt-out, forces all channels, requires ack', () => {
  const { b } = makeBroadcast();
  // u3 opts out of everything non-essential; emergency MUST still reach them.
  b.optOutList({ userId: 'u3', broadcastType: 'all-non-essential', optOut: true });

  const result = b.emergencyBroadcastY127({
    message_he: 'שריפה — פנו לאזור המפגש',
    message_en: 'FIRE — evacuate to assembly point',
    allEmployees: true,
  });
  assert.equal(result.emergency, true);
  assert.equal(result.bypassedScheduling, true);
  assert.equal(result.bypassedOptOut, true);
  assert.equal(result.report.recipientCount, 8, 'reaches every employee including opted-out u3');
  // All 5 Y-127 channels dispatched.
  assert.equal(result.channels.length, 5);

  const track = b.ackTracking(result.broadcastId);
  assert.equal(track.total, 8);
  assert.equal(track.pending, 8);
});

test('Y127-11 opt-out enforcement — non-essential broadcast skips opted-out users', () => {
  const { b } = makeBroadcast();
  b.optOutList({ userId: 'u3', broadcastType: 'marketing', optOut: true });
  b.optOutList({ userId: 'u5', broadcastType: 'marketing', optOut: true });

  const v = b.createBroadcast({
    title_he: 'מבצע',
    title_en: 'Promo',
    body_he: 'הנחה',
    body_en: 'discount',
    channels: ['email'],
    audience: { all: true },
    priority: 'info',
  });
  // Force category on the underlying record so opt-out filter engages.
  b._announcements[v.id].category = 'marketing';

  const r = b.sendNow(v.id);
  assert.equal(r.recipientCount, 6, 'u3 & u5 filtered out by opt-out');

  const opted = b.optOutList('marketing');
  assert.deepEqual(opted.sort(), ['u3', 'u5']);
});

test('Y127-12 opt-out enforcement — essential types cannot be opted out', () => {
  const { b } = makeBroadcast();
  const resultSafety = b.optOutList({ userId: 'u1', broadcastType: 'safety', optOut: true });
  assert.equal(resultSafety.optedOut, false);
  assert.equal(resultSafety.rejected, true);

  const resultEmergency = b.optOutList({ userId: 'u2', broadcastType: 'emergency', optOut: true });
  assert.equal(resultEmergency.optedOut, false);

  // Policy broadcast hits u1 even though they tried to opt out.
  const v = b.createBroadcast({
    title_he: 'נוהל',
    title_en: 'Policy',
    body_he: '...',
    body_en: '...',
    channels: ['in-app'],
    audience: { all: true },
    priority: 'urgent',
  });
  b._announcements[v.id].category = 'safety';
  const r = b.sendNow(v.id);
  assert.equal(r.recipientCount, 8);
});

test('Y127-13 templateBroadcast — bilingual variable substitution', () => {
  const { b } = makeBroadcast();
  b.registerTemplate({
    id: 'shift-reminder',
    title_he: 'תזכורת משמרת — {{shift}}',
    title_en: 'Shift reminder — {{shift}}',
    body_he: 'שלום {{name}}, משמרתך בשעה {{time}}',
    body_en: 'Hi {{name}}, your shift is at {{time}}',
    channels: ['in-app', 'sms'],
    priority: 'normal',
    requiresAck: false,
  });

  const v = b.templateBroadcast('shift-reminder', {
    shift: 'בוקר',
    name: 'דוד',
    time: '08:00',
  });
  assert.equal(v.title_he, 'תזכורת משמרת — בוקר');
  assert.equal(v.title_en, 'Shift reminder — בוקר');
  assert.equal(v.body_he, 'שלום דוד, משמרתך בשעה 08:00');
  assert.equal(v.body_en, 'Hi דוד, your shift is at 08:00');
  assert.deepEqual(v.channels.sort(), ['in-app', 'sms']);
});

test('Y127-14 broadcastHistory — append-only filter by action', () => {
  const { b } = makeBroadcast();
  const v1 = b.createBroadcast({
    title_he: 'א',
    title_en: 'A',
    body_he: 'a',
    body_en: 'a',
    channels: ['in-app'],
    audience: { all: true },
    priority: 'normal',
  });
  b.sendNow(v1.id);
  b.cancelBroadcast(v1.id, 'bug found'); // should be ignored for sent — still records history
  const v2 = b.createBroadcast({
    title_he: 'ב',
    title_en: 'B',
    body_he: 'b',
    body_en: 'b',
    channels: ['in-app'],
    audience: { all: true },
    priority: 'normal',
  });

  const creates = b.broadcastHistory({ action: 'createBroadcast' });
  assert.equal(creates.length, 2);

  const cancels = b.broadcastHistory({ action: 'cancelBroadcast' });
  assert.equal(cancels.length, 1);
  assert.equal(cancels[0].reason, 'bug found');
});

test('Y127-15 createBroadcast — rejects invalid channels', () => {
  const { b } = makeBroadcast();
  assert.throws(() => b.createBroadcast({
    title_he: 'x', title_en: 'x', body_he: 'x', body_en: 'x',
    channels: ['fax', 'carrier-pigeon'],
    audience: { all: true },
    priority: 'normal',
  }), /no valid channels/);
});

test('Y127-16 sendNow — rejects cancelled broadcast', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'x',
    title_en: 'x',
    body_he: 'x',
    body_en: 'x',
    channels: ['in-app'],
    audience: { all: true },
    priority: 'normal',
  });
  b.cancelBroadcast(v.id, 'nevermind');
  assert.throws(() => b.sendNow(v.id), /cancelled/);
});

test('Y127-17 cancelBroadcast — history entry appended, record preserved', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'טיוטה',
    title_en: 'Draft',
    body_he: 'תוכן',
    body_en: 'content',
    channels: ['email'],
    audience: { all: true },
    priority: 'normal',
  });
  const before = b.broadcastHistory().length;
  b.cancelBroadcast(v.id, 'reason-א');
  const after = b.broadcastHistory().length;
  assert.ok(after > before, 'history grew');

  // Cancel twice (idempotent, appends another event)
  b.cancelBroadcast(v.id, 'reason-ב');
  const after2 = b.broadcastHistory().length;
  assert.ok(after2 > after);

  // Record still there.
  const snap = b._snapshot();
  assert.ok(snap.announcements[v.id]);
});

test('Y127-18 Hebrew RTL — titles and bodies preserved verbatim', () => {
  const { b } = makeBroadcast();
  const hebrewTitle = 'אזהרה בטיחותית — דרך לא מאובטחת ✓';
  const hebrewBody  = 'בעלי חברה: נא לוודא שכל העובדים בסביבת העבודה קיבלו את ההודעה.';
  const v = b.createBroadcast({
    title_he: hebrewTitle,
    title_en: 'Safety warning',
    body_he: hebrewBody,
    body_en: 'Safety body',
    channels: ['in-app'],
    audience: { all: true },
    priority: 'urgent',
  });
  assert.equal(v.title_he, hebrewTitle);
  assert.equal(v.body_he, hebrewBody);

  // Glossary exposes Hebrew labels.
  assert.equal(HEBREW_GLOSSARY.broadcastCancelled, 'שידור בוטל');
  assert.equal(HEBREW_GLOSSARY.priorityInfo, 'מידע כללי');
  assert.equal(HEBREW_GLOSSARY.channelPush, 'התראת דחיפה');
});

test('Y127-19 No deletes — append-only invariants after cancel', () => {
  const { b } = makeBroadcast();
  const v = b.createBroadcast({
    title_he: 'א', title_en: 'A', body_he: 'a', body_en: 'a',
    channels: ['email', 'in-app'], audience: { all: true }, priority: 'normal',
    requiresAck: true,
  });
  b.sendNow(v.id);
  b.acknowledge({ announcementId: v.id, userId: 'u1' });

  const deliveriesBefore = (b._snapshot().deliveries[v.id] || []).length;
  const acksBefore = (b._snapshot().acks[v.id] || []).length;
  const histBefore = b.broadcastHistory().length;

  b.cancelBroadcast(v.id, 'rollback');

  const deliveriesAfter = (b._snapshot().deliveries[v.id] || []).length;
  const acksAfter = (b._snapshot().acks[v.id] || []).length;
  const histAfter = b.broadcastHistory().length;

  assert.equal(deliveriesAfter, deliveriesBefore, 'delivery log not truncated');
  assert.equal(acksAfter, acksBefore, 'ack log not truncated');
  assert.ok(histAfter > histBefore, 'history only grows');
});

test('Y127-20 optOutList — query form returns opted-out user ids', () => {
  const { b } = makeBroadcast();
  b.optOutList({ userId: 'u1', broadcastType: 'newsletter', optOut: true });
  b.optOutList({ userId: 'u2', broadcastType: 'newsletter', optOut: true });
  b.optOutList({ userId: 'u3', broadcastType: 'marketing', optOut: true });

  assert.deepEqual(b.optOutList('newsletter').sort(), ['u1', 'u2']);
  assert.deepEqual(b.optOutList('marketing'), ['u3']);
  assert.deepEqual(b.optOutList('never-heard-of-this'), []);

  // Opt back in (append-only — log grows either way).
  const snap = b._snapshot();
  const preLogLen = (snap.auditTrail || []).length;
  b.optOutList({ userId: 'u1', broadcastType: 'newsletter', optOut: false });
  assert.deepEqual(b.optOutList('newsletter'), ['u2']);
  assert.ok(b._snapshot().auditTrail.length >= preLogLen);
});
