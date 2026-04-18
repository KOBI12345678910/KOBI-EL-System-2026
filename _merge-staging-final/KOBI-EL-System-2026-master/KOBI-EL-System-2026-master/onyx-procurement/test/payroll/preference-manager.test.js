/**
 * preference-manager.test.js — Agent X-16 / Swarm 3
 * Techno-Kol Uzi mega-ERP 2026 — written 2026-04-11
 *
 * Unit tests for src/notifications/preference-manager.js
 *
 * Run:
 *   node --test test/payroll/preference-manager.test.js
 *
 * Coverage (20 cases):
 *   01. getDefaultPrefs — shape + Asia/Jerusalem timezone
 *   02. loadPreferences — returns defaults for unknown user
 *   03. savePreferences + loadPreferences round-trip
 *   04. savePreferences — patch merges on top of current state
 *   05. resolveChannels — default category, normal severity
 *   06. resolveChannels — disabled category returns []
 *   07. resolveChannels — critical bypasses DND
 *   08. resolveChannels — high severity keeps in_app during DND
 *   09. resolveChannels — normal severity is suppressed during DND
 *   10. resolveChannels — digest category returns [] when digest enabled
 *   11. resolveChannels — fallback chain used when channels empty
 *   12. isInDnd — inside the wrap-around window (01:00) returns true
 *   13. isInDnd — outside the window (12:00) returns false
 *   14. isInDnd — Shabbat awareness (Saturday 10:00)
 *   15. isInDnd — non-Shabbat Friday afternoon (14:00) respects schedule
 *   16. parseHHMM — valid + invalid forms
 *   17. isInDndForCategory — simple (non-wrap) window
 *   18. isInDndForCategory — days array limits applicability
 *   19. shouldDigest — critical never digests
 *   20. shouldDigest — normal event in digestCategories returns configured mode
 *
 * Runner: node:test (Node >= 18). Zero external deps.
 */

'use strict';

const { test } = require('node:test');
const assert  = require('node:assert/strict');
const path    = require('node:path');
const fs      = require('node:fs');
const os      = require('node:os');

const mgr = require(path.resolve(__dirname, '..', '..', 'src', 'notifications', 'preference-manager.js'));

const {
  loadPreferences,
  savePreferences,
  resolveChannels,
  isInDnd,
  isInDndForCategory,
  shouldDigest,
  getDefaultPrefs,
  parseHHMM,
  setStorePath,
  resetCache,
  CHANNELS,
  SEVERITIES,
  DIGEST_MODES,
  WEEKDAY,
  DEFAULT_TIMEZONE,
} = mgr;

// ─── Test isolation: point the store at a unique tmp file for every run ───
const TMP_STORE = path.join(os.tmpdir(), `pref-mgr-test-${process.pid}-${Date.now()}.jsonl`);
setStorePath(TMP_STORE);

// Always start clean
if (fs.existsSync(TMP_STORE)) {
  try { fs.unlinkSync(TMP_STORE); } catch (_) {}
}

/**
 * Helper — build a timestamp in Asia/Jerusalem wall-clock.
 * Assumes IST/IDT offset (UTC+2 / UTC+3) — for test determinism we pass
 * Date objects that will be interpreted via Intl.DateTimeFormat in the
 * module under test, so we just need a date whose local projection in
 * Asia/Jerusalem yields the expected weekday + time.
 *
 * We construct the UTC instant that corresponds to a specific wall time
 * in the Asia/Jerusalem zone by using the standard offset of +2h.  Tests
 * below avoid DST transition dates.
 */
function at(yyyyMmDd, hhmm) {
  const [yy, mm, dd] = yyyyMmDd.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  // Use UTC-2 to get the equivalent UTC instant of Asia/Jerusalem wall time
  // assuming standard time (IST = UTC+2). Tests pick January dates where this holds.
  return new Date(Date.UTC(yy, mm - 1, dd, h - 2, m, 0));
}

// ─── 01 ───────────────────────────────────────────────────────────
test('01. getDefaultPrefs — has Asia/Jerusalem tz, all categories, fallback chain', () => {
  const d = getDefaultPrefs();
  assert.equal(d.timezone, 'Asia/Jerusalem');
  assert.equal(d.digestMode, DIGEST_MODES.NONE);
  assert.ok(Array.isArray(d.channelFallback) && d.channelFallback.length > 0);
  assert.ok(d.categories.invoice);
  assert.ok(d.categories.payment);
  assert.ok(d.categories.alert);
  assert.ok(d.categories.system);
  assert.ok(d.categories.approval);
  assert.ok(d.categories.default);
  assert.ok(d.categories.default.dnd.enabled);
});

// ─── 02 ───────────────────────────────────────────────────────────
test('02. loadPreferences — unknown user returns defaults', () => {
  resetCache();
  const p = loadPreferences('nobody@nowhere.co.il');
  assert.equal(p.timezone, DEFAULT_TIMEZONE);
  assert.deepEqual(p.categories.invoice.channels, [CHANNELS.IN_APP, CHANNELS.EMAIL]);
});

// ─── 03 ───────────────────────────────────────────────────────────
test('03. savePreferences + loadPreferences round-trip', () => {
  resetCache();
  setStorePath(TMP_STORE);
  savePreferences('kobi@technokol.co.il', {
    timezone: 'Asia/Jerusalem',
    categories: {
      invoice: { channels: [CHANNELS.IN_APP, CHANNELS.WHATSAPP], dnd: { enabled: false } },
    },
  });
  const p = loadPreferences('kobi@technokol.co.il');
  assert.deepEqual(p.categories.invoice.channels, [CHANNELS.IN_APP, CHANNELS.WHATSAPP]);
  assert.equal(p.categories.invoice.dnd.enabled, false);
});

// ─── 04 ───────────────────────────────────────────────────────────
test('04. savePreferences — patch preserves untouched categories', () => {
  resetCache();
  savePreferences('user1', {
    categories: {
      payment: { channels: [CHANNELS.SMS] },
    },
  });
  savePreferences('user1', {
    categories: {
      alert: { channels: [CHANNELS.WHATSAPP] },
    },
  });
  const p = loadPreferences('user1');
  assert.deepEqual(p.categories.payment.channels, [CHANNELS.SMS]);
  assert.deepEqual(p.categories.alert.channels, [CHANNELS.WHATSAPP]);
});

// ─── 05 ───────────────────────────────────────────────────────────
test('05. resolveChannels — default user, normal severity, midday → defaults', () => {
  resetCache();
  // Wednesday 2026-01-14 12:00 Asia/Jerusalem — not Shabbat, not in DND
  const ts = at('2026-01-14', '12:00').getTime();
  const chans = resolveChannels('user2', 'invoice', SEVERITIES.NORMAL, ts);
  assert.deepEqual(chans, [CHANNELS.IN_APP, CHANNELS.EMAIL]);
});

// ─── 06 ───────────────────────────────────────────────────────────
test('06. resolveChannels — category disabled returns []', () => {
  resetCache();
  savePreferences('user3', {
    categories: { invoice: { channels: [CHANNELS.DISABLED] } },
  });
  const ts = at('2026-01-14', '12:00').getTime();
  assert.deepEqual(resolveChannels('user3', 'invoice', SEVERITIES.NORMAL, ts), []);
});

// ─── 07 ───────────────────────────────────────────────────────────
test('07. resolveChannels — critical bypasses DND window', () => {
  resetCache();
  // Wednesday 2026-01-14 03:00 Asia/Jerusalem — inside default 22:00→07:00 DND
  const ts = at('2026-01-14', '03:00').getTime();
  const chans = resolveChannels('user4', 'alert', SEVERITIES.CRITICAL, ts);
  // Default alert channels include in_app + whatsapp + sms → all delivered
  assert.ok(chans.includes(CHANNELS.IN_APP));
  assert.ok(chans.includes(CHANNELS.WHATSAPP));
  assert.ok(chans.includes(CHANNELS.SMS));
});

// ─── 08 ───────────────────────────────────────────────────────────
test('08. resolveChannels — high severity keeps in_app during DND', () => {
  resetCache();
  const ts = at('2026-01-14', '03:00').getTime();
  const chans = resolveChannels('user5', 'invoice', SEVERITIES.HIGH, ts);
  assert.deepEqual(chans, [CHANNELS.IN_APP]);
});

// ─── 09 ───────────────────────────────────────────────────────────
test('09. resolveChannels — normal severity suppressed during DND', () => {
  resetCache();
  const ts = at('2026-01-14', '03:00').getTime();
  const chans = resolveChannels('user6', 'invoice', SEVERITIES.NORMAL, ts);
  assert.deepEqual(chans, []);
});

// ─── 10 ───────────────────────────────────────────────────────────
test('10. resolveChannels — digest mode returns [] for non-critical in digestCategories', () => {
  resetCache();
  savePreferences('user7', {
    digestMode: DIGEST_MODES.HOURLY,
    digestCategories: ['system'],
  });
  // 12:00 — not in DND
  const ts = at('2026-01-14', '12:00').getTime();
  assert.deepEqual(resolveChannels('user7', 'system', SEVERITIES.NORMAL, ts), []);
  // Critical still bypasses
  const critical = resolveChannels('user7', 'system', SEVERITIES.CRITICAL, ts);
  assert.ok(critical.length > 0);
});

// ─── 11 ───────────────────────────────────────────────────────────
test('11. resolveChannels — fallback chain used when category channels empty', () => {
  resetCache();
  savePreferences('user8', {
    channelFallback: [CHANNELS.WHATSAPP, CHANNELS.EMAIL],
    categories: {
      // Intentionally empty channels — will hit fallback
      payment: { channels: [] },
    },
  });
  const ts = at('2026-01-14', '12:00').getTime();
  const chans = resolveChannels('user8', 'payment', SEVERITIES.NORMAL, ts);
  // Fallback yields exactly 1 channel (first in chain)
  assert.deepEqual(chans, [CHANNELS.WHATSAPP]);
});

// ─── 12 ───────────────────────────────────────────────────────────
test('12. isInDnd — default prefs, 03:00 weekday is inside 22:00→07:00 window', () => {
  resetCache();
  const ts = at('2026-01-14', '03:00').getTime();
  assert.equal(isInDnd('user9', ts), true);
});

// ─── 13 ───────────────────────────────────────────────────────────
test('13. isInDnd — default prefs, 12:00 weekday is outside window', () => {
  resetCache();
  const ts = at('2026-01-14', '12:00').getTime();
  assert.equal(isInDnd('user10', ts), false);
});

// ─── 14 ───────────────────────────────────────────────────────────
test('14. isInDnd — Shabbat awareness: Saturday 10:00 → DND active', () => {
  resetCache();
  // 2026-01-17 is a Saturday (Shabbat)
  const ts = at('2026-01-17', '10:00').getTime();
  assert.equal(isInDnd('user11', ts), true);
});

// ─── 15 ───────────────────────────────────────────────────────────
test('15. isInDnd — Friday 14:00 is before Shabbat and outside window → false', () => {
  resetCache();
  // 2026-01-16 is a Friday — before 18:00 Shabbat cutoff
  const ts = at('2026-01-16', '14:00').getTime();
  assert.equal(isInDnd('user12', ts), false);
});

// ─── 16 ───────────────────────────────────────────────────────────
test('16. parseHHMM — valid + invalid forms', () => {
  assert.equal(parseHHMM('09:30'), 9 * 60 + 30);
  assert.equal(parseHHMM('00:00'), 0);
  assert.equal(parseHHMM('23:59'), 23 * 60 + 59);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('9:30'), 9 * 60 + 30);
  assert.equal(parseHHMM('garbage'), null);
  assert.equal(parseHHMM(null), null);
  assert.equal(parseHHMM(''), null);
});

// ─── 17 ───────────────────────────────────────────────────────────
test('17. isInDndForCategory — simple window 09:00→17:00 blocks 12:00', () => {
  const dnd = {
    enabled: true,
    start: '09:00',
    end: '17:00',
    days: [WEEKDAY.SUN, WEEKDAY.MON, WEEKDAY.TUE, WEEKDAY.WED, WEEKDAY.THU],
    shabbat: false,
  };
  // Wednesday 2026-01-14 12:00
  const ts = at('2026-01-14', '12:00').getTime();
  assert.equal(isInDndForCategory(dnd, ts, DEFAULT_TIMEZONE), true);
  // 08:00 outside window
  const ts2 = at('2026-01-14', '08:00').getTime();
  assert.equal(isInDndForCategory(dnd, ts2, DEFAULT_TIMEZONE), false);
});

// ─── 18 ───────────────────────────────────────────────────────────
test('18. isInDndForCategory — days filter excludes non-workdays', () => {
  const dnd = {
    enabled: true,
    start: '09:00',
    end: '17:00',
    days: [WEEKDAY.SUN, WEEKDAY.MON, WEEKDAY.TUE, WEEKDAY.WED, WEEKDAY.THU], // no Fri/Sat
    shabbat: false,
  };
  // Saturday 2026-01-17 12:00 — in time window but NOT in days list
  const ts = at('2026-01-17', '12:00').getTime();
  assert.equal(isInDndForCategory(dnd, ts, DEFAULT_TIMEZONE), false);
});

// ─── 19 ───────────────────────────────────────────────────────────
test('19. shouldDigest — critical severity always returns NONE', () => {
  resetCache();
  savePreferences('user13', {
    digestMode: DIGEST_MODES.DAILY,
    digestCategories: ['alert'],
  });
  assert.equal(shouldDigest('user13', 'alert', SEVERITIES.CRITICAL), DIGEST_MODES.NONE);
});

// ─── 20 ───────────────────────────────────────────────────────────
test('20. shouldDigest — normal event in digestCategories returns configured mode', () => {
  resetCache();
  savePreferences('user14', {
    digestMode: DIGEST_MODES.HOURLY,
    digestCategories: ['system', 'invoice'],
  });
  assert.equal(shouldDigest('user14', 'system', SEVERITIES.NORMAL), DIGEST_MODES.HOURLY);
  // Not in digest list → immediate
  assert.equal(shouldDigest('user14', 'alert', SEVERITIES.NORMAL), DIGEST_MODES.NONE);
});

// ─── Cleanup ──────────────────────────────────────────────────────
test('99. cleanup — remove test jsonl store', () => {
  try {
    if (fs.existsSync(TMP_STORE)) fs.unlinkSync(TMP_STORE);
  } catch (_) { /* noop */ }
  assert.ok(true);
});
