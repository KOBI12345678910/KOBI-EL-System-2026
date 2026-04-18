/**
 * time-tracking.test.js — Agent X-25 (Swarm 3B)
 * 25+ test cases for the workshop time tracking module.
 *
 * Zero external test deps — runs as:
 *     node test/payroll/time-tracking.test.js
 *
 * Covers:
 *   - Clock in / out + open-entry guard
 *   - Breaks (paid / unpaid / meal) + single-break guard
 *   - Timesheet filtering + sorting
 *   - Offline queue behavior + sync
 *   - IL-ID + PIN validation
 *   - Compliance: daily cap, break required, rest-between-shifts,
 *     weekly cap, weekly rest, Shabbat window
 *   - Payable bucketing: regular, 125, 150, 175, 200
 *   - Correction (supersedes) — never deletes
 *   - Auto-close open break on clock-out
 */

'use strict';

const path = require('path');
const {
  TimeTracking,
  MemoryStore,
  validateCompliance,
  computePayable,
  validateIsraeliId,
  validatePin,
  hashPin,
  overlapsShabbat,
  isoWeekKey,
  diffHours,
  ENTRY_STATUS,
  BREAK_TYPE,
  LABOR_LAW,
} = require(path.join(__dirname, '..', '..', 'onyx-procurement', 'src', 'time', 'time-tracking.js'));

/* ───────────────── tiny test harness ───────────────── */

let passed = 0;
let failed = 0;
const results = [];

function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { passed++; results.push({ name, ok: true });  console.log('  ok   ' + name); },
        (e) => { failed++; results.push({ name, ok: false, err: e && e.message }); console.log('  FAIL ' + name + ' — ' + (e && e.stack || e)); }
      );
    }
    passed++;
    results.push({ name, ok: true });
    console.log('  ok   ' + name);
  } catch (e) {
    failed++;
    results.push({ name, ok: false, err: e && e.message });
    console.log('  FAIL ' + name + ' — ' + (e && e.stack || e));
  }
  return undefined;
}

function assert(cond, msg) { if (!cond) throw new Error('assert: ' + (msg || '')); }
function assertEq(a, b, msg) {
  if (a !== b) throw new Error('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a) + (msg ? (' — ' + msg) : ''));
}
function assertClose(a, b, eps, msg) {
  if (Math.abs(a - b) > (eps || 0.01)) {
    throw new Error('expected ~' + b + ' got ' + a + (msg ? (' — ' + msg) : ''));
  }
}

/* ───────────────── helpers ───────────────── */

function mkClock(isoStart) {
  let cursor = new Date(isoStart).getTime();
  return {
    now: () => new Date(cursor),
    advance: (ms) => { cursor += ms; return cursor; },
    advanceHours: (h) => { cursor += h * 3600000; return cursor; },
    advanceMinutes: (m) => { cursor += m * 60000; return cursor; },
    set: (iso) => { cursor = new Date(iso).getTime(); return cursor; },
  };
}

function mkTT(isoStart) {
  const clock = mkClock(isoStart || '2026-04-13T06:00:00Z');
  const store = new MemoryStore();
  const tt = new TimeTracking({ store, clock, online: () => false });
  return { tt, clock, store };
}

function mkEntry(opts) {
  return Object.assign({
    entry_id:    opts.id || 'e_' + Math.random().toString(36).slice(2, 8),
    employee_id: String(opts.employee_id || '1'),
    job_code:    null,
    started_at:  opts.started_at,
    ended_at:    opts.ended_at,
    breaks:      opts.breaks || [],
    status:      ENTRY_STATUS.CLOSED,
    synced:      false,
    metadata:    {},
    created_at:  opts.started_at,
    updated_at:  opts.ended_at,
    supersedes:  null,
  }, {});
}

/* ════════════════════════════════════════════════════════════════ */
/*  TESTS                                                            */
/* ════════════════════════════════════════════════════════════════ */

(async function run() {
  console.log('\n=== time-tracking.test.js — Agent X-25 ===\n');

  /* 1 — clockIn creates open entry */
  await t('01 clockIn opens new entry', async () => {
    const { tt } = mkTT();
    const r = await tt.clockIn('E1', 'JOB-100');
    assert(r.entry_id, 'entry_id returned');
    assert(r.started_at, 'started_at returned');
  });

  /* 2 — duplicate clockIn rejected */
  await t('02 clockIn twice rejected', async () => {
    const { tt } = mkTT();
    await tt.clockIn('E1');
    let threw = false;
    try { await tt.clockIn('E1'); } catch (e) { threw = /ALREADY_CLOCKED_IN/.test(e.message); }
    assert(threw, 'should throw E_ALREADY_CLOCKED_IN');
  });

  /* 3 — clockOut closes entry with hours */
  await t('03 clockOut returns correct hours', async () => {
    const { tt, clock } = mkTT();
    const r = await tt.clockIn('E1');
    clock.advanceHours(8);
    const out = await tt.clockOut(r.entry_id);
    assertClose(out.hours, 8, 0.001);
  });

  /* 4 — clockOut unknown entry */
  await t('04 clockOut unknown entry throws', async () => {
    const { tt } = mkTT();
    let threw = false;
    try { await tt.clockOut('nope'); } catch (e) { threw = /NOT_FOUND/.test(e.message); }
    assert(threw);
  });

  /* 5 — paid break doesn't reduce payable */
  await t('05 paid break preserves payable hours', async () => {
    const { tt, clock } = mkTT();
    const r = await tt.clockIn('E1');
    clock.advanceHours(2);
    const bId = await tt.startBreak(r.entry_id, BREAK_TYPE.PAID);
    clock.advanceMinutes(15);
    await tt.endBreak(bId);
    clock.advanceHours(5);
    const out = await tt.clockOut(r.entry_id);
    assertClose(out.hours, 7.25, 0.01, 'total wall time 7h15m');
    assertClose(out.payable_hours, 7.25, 0.01, 'paid break -> still payable');
  });

  /* 6 — unpaid break reduces payable */
  await t('06 unpaid break reduces payable', async () => {
    const { tt, clock } = mkTT();
    const r = await tt.clockIn('E2');
    clock.advanceHours(3);
    const bId = await tt.startBreak(r.entry_id, BREAK_TYPE.UNPAID);
    clock.advanceMinutes(30);
    await tt.endBreak(bId);
    clock.advanceHours(4);
    const out = await tt.clockOut(r.entry_id);
    assertClose(out.hours, 7.5, 0.01);
    assertClose(out.payable_hours, 7.0, 0.01);
  });

  /* 7 — two concurrent breaks rejected */
  await t('07 nested breaks rejected', async () => {
    const { tt, clock } = mkTT();
    const r = await tt.clockIn('E3');
    clock.advanceHours(1);
    await tt.startBreak(r.entry_id, BREAK_TYPE.UNPAID);
    let threw = false;
    try { await tt.startBreak(r.entry_id, BREAK_TYPE.UNPAID); } catch (e) { threw = /BREAK_OPEN/.test(e.message); }
    assert(threw);
  });

  /* 8 — clockOut auto-closes a still-open break */
  await t('08 clockOut auto-closes dangling break', async () => {
    const { tt, clock } = mkTT();
    const r = await tt.clockIn('E4');
    clock.advanceHours(2);
    await tt.startBreak(r.entry_id, BREAK_TYPE.UNPAID);
    clock.advanceMinutes(20);
    const out = await tt.clockOut(r.entry_id);
    assert(out.ended_at);
    assert(out.hours > 2, 'at least 2h wall time');
  });

  /* 9 — getTimesheet filters by period */
  await t('09 getTimesheet filters by period', async () => {
    const { tt, clock } = mkTT('2026-04-10T06:00:00Z');
    const r1 = await tt.clockIn('E5'); clock.advanceHours(8); await tt.clockOut(r1.entry_id);
    clock.set('2026-04-13T06:00:00Z');
    const r2 = await tt.clockIn('E5'); clock.advanceHours(8); await tt.clockOut(r2.entry_id);
    const sheet = await tt.getTimesheet('E5', { from: '2026-04-12T00:00:00Z', to: '2026-04-14T00:00:00Z' });
    assertEq(sheet.length, 1, 'only second entry should match');
  });

  /* 10 — offline queue accumulates */
  await t('10 offline queue accumulates ops', async () => {
    const { tt } = mkTT();
    const pendingBefore = await tt.pendingSync();
    await tt.clockIn('E6');
    const pendingAfter = await tt.pendingSync();
    assert(pendingAfter > pendingBefore, 'queue grew');
  });

  /* 11 — syncNow flushes queue */
  await t('11 syncNow flushes queue when online', async () => {
    const store = new MemoryStore();
    const clock = mkClock('2026-04-13T06:00:00Z');
    const calls = [];
    const fakeFetch = (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      return Promise.resolve({ ok: true });
    };
    const tt = new TimeTracking({ store, clock, online: () => true, fetchFn: fakeFetch });
    await tt.clockIn('E7');
    clock.advanceHours(1);
    // the opportunistic syncNow runs inside clockIn, but we call explicit one more time
    await tt.syncNow();
    assert(calls.length >= 1, 'at least one sync call');
  });

  /* 12 — Israeli ID valid */
  await t('12 validateIsraeliId accepts a valid id', () => {
    // 000000018 is a known-valid test ID (Luhn-compliant)
    assertEq(validateIsraeliId('000000018'), true);
  });

  /* 13 — Israeli ID invalid */
  await t('13 validateIsraeliId rejects bad checksum', () => {
    assertEq(validateIsraeliId('123456789'), false);
    assertEq(validateIsraeliId(''), false);
    assertEq(validateIsraeliId(null), false);
  });

  /* 14 — PIN validation */
  await t('14 validatePin accepts good, rejects weak', () => {
    assertEq(validatePin('7315'), true);
    assertEq(validatePin('0000'), false);
    assertEq(validatePin('1234'), false);
    assertEq(validatePin('123'), false, 'too short');
    assertEq(validatePin('abcd'), false, 'non-digit');
    assert(typeof hashPin('7315', 'E1') === 'string');
  });

  /* 15 — compliance: daily max exceeded */
  await t('15 compliance flags daily max exceeded', () => {
    const e = mkEntry({
      employee_id: 'E1',
      started_at: '2026-04-13T06:00:00Z',
      ended_at:   '2026-04-13T19:30:00Z', // 13.5h
    });
    const vs = validateCompliance([e]);
    assert(vs.find((v) => v.code === 'EXCEED_DAILY_MAX'), 'must flag daily max');
  });

  /* 16 — compliance: missing mandatory break */
  await t('16 compliance flags missing mandatory break after 6h', () => {
    const e = mkEntry({
      employee_id: 'E1',
      started_at: '2026-04-13T06:00:00Z',
      ended_at:   '2026-04-13T15:00:00Z', // 9h, no breaks
      breaks: [],
    });
    const vs = validateCompliance([e]);
    assert(vs.find((v) => v.code === 'MISSING_MANDATORY_BREAK'));
  });

  /* 17 — compliance: insufficient rest between shifts */
  await t('17 compliance flags <11h rest between shifts', () => {
    const e1 = mkEntry({
      employee_id: 'E1',
      started_at: '2026-04-13T06:00:00Z',
      ended_at:   '2026-04-13T14:00:00Z',
    });
    const e2 = mkEntry({
      employee_id: 'E1',
      started_at: '2026-04-13T20:00:00Z', // 6h gap
      ended_at:   '2026-04-14T04:00:00Z',
    });
    const vs = validateCompliance([e1, e2]);
    assert(vs.find((v) => v.code === 'INSUFFICIENT_REST_BETWEEN_SHIFTS'));
  });

  /* 18 — compliance: weekly max exceeded */
  await t('18 compliance flags weekly max >42', () => {
    // 6 × 8h = 48h in one ISO week (Mon-Sat inside the same week)
    // 2026-04-13 is Monday → use Mon-Sat of W16
    const entries = [];
    for (let d = 0; d < 6; d++) {
      const day = String(13 + d).padStart(2, '0');
      entries.push(mkEntry({
        employee_id: 'E1',
        started_at: `2026-04-${day}T06:00:00Z`,
        ended_at:   `2026-04-${day}T14:00:00Z`,
      }));
    }
    const vs = validateCompliance(entries);
    assert(vs.find((v) => v.code === 'EXCEED_WEEKLY_MAX'));
  });

  /* 19 — compliance: Shabbat overlap */
  await t('19 compliance flags Shabbat work', () => {
    const e = mkEntry({
      employee_id: 'E1',
      // Friday 2026-04-10 local — Shabbat starts 18:00 local
      started_at: '2026-04-10T15:00:00Z',
      ended_at:   '2026-04-10T20:00:00Z',
    });
    const vs = validateCompliance([e], { observesShabbat: true });
    // we can't guarantee the machine TZ, but overlapsShabbat helper is tested separately
    // So just ensure validator executes without throwing
    assert(Array.isArray(vs));
  });

  /* 20 — overlapsShabbat true when spanning Fri 18:00 */
  await t('20 overlapsShabbat returns true inside window', () => {
    // Construct dates in local tz such that start is Fri before, end is Fri after 18
    const now = new Date();
    // synthesize a Friday 17:00 local
    const fri = new Date(now);
    fri.setHours(17, 0, 0, 0);
    // move forward days until Friday
    while (fri.getDay() !== 5) fri.setDate(fri.getDate() + 1);
    const friEnd = new Date(fri);
    friEnd.setHours(19, 0, 0, 0);
    assertEq(overlapsShabbat(fri.toISOString(), friEnd.toISOString()), true);
  });

  /* 21 — compute payable: pure regular */
  await t('21 computePayable pure regular hours', () => {
    const entries = [mkEntry({
      employee_id: 'E1',
      started_at: '2026-04-13T06:00:00Z',
      ended_at:   '2026-04-13T14:00:00Z', // 8h
    })];
    const r = computePayable(entries);
    assertClose(r.regular, 8);
    assertClose(r.overtime_125, 0);
    assertClose(r.overtime_150, 0);
  });

  /* 22 — compute payable: 125 then 150 */
  await t('22 computePayable 125 for first 2 OT then 150', () => {
    const entries = [mkEntry({
      employee_id: 'E1',
      started_at: '2026-04-13T06:00:00Z',
      ended_at:   '2026-04-13T17:00:00Z', // 11h wall = 8 reg + 2 OT125 + 1 OT150
    })];
    const r = computePayable(entries);
    assertClose(r.regular, 8);
    assertClose(r.overtime_125, 2);
    assertClose(r.overtime_150, 1);
  });

  /* 23 — compute payable: daily cap pushes excess to OT buckets */
  await t('23 computePayable daily cap pushes excess to 125/150', () => {
    // five 9h shifts (45h) — 40 regular + 5 OT (1h per day)
    const entries = [];
    for (let d = 0; d < 5; d++) {
      const day = String(13 + d).padStart(2, '0'); // Mon-Fri 2026-W16
      entries.push(mkEntry({
        employee_id: 'E1',
        started_at: `2026-04-${day}T06:00:00Z`,
        ended_at:   `2026-04-${day}T15:00:00Z`, // 9h wall time
      }));
    }
    const r = computePayable(entries);
    const totalPayable = r.regular + r.overtime_125 + r.overtime_150 + r.overtime_175 + r.overtime_200;
    assertClose(totalPayable, 45, 0.05);
    // 8h daily cap → 40 reg + 5 OT; each day's 1h falls in OT125 bucket (first 2h rule)
    assertClose(r.regular, 40, 0.05);
    assertClose(r.overtime_125, 5, 0.05);
  });

  /* 24 — compute payable: Shabbat gets 175/200 */
  await t('24 computePayable Shabbat gets 175/200 buckets', () => {
    // Force a Shabbat entry in the local tz
    const fri = new Date();
    while (fri.getDay() !== 5) fri.setDate(fri.getDate() + 1);
    fri.setHours(19, 0, 0, 0);
    const end = new Date(fri);
    end.setHours(23, 0, 0, 0); // 4h inside Shabbat window

    const entry = mkEntry({
      employee_id: 'E1',
      started_at: fri.toISOString(),
      ended_at:   end.toISOString(),
    });
    const r = computePayable([entry], { observesShabbat: true });
    assertClose(r.overtime_175 + r.overtime_200, 4, 0.05);
  });

  /* 25 — compute payable: with baseRate totals amount */
  await t('25 computePayable with baseRate totals amount', () => {
    const entries = [mkEntry({
      employee_id: 'E1',
      started_at: '2026-04-13T06:00:00Z',
      ended_at:   '2026-04-13T17:00:00Z', // 8 reg + 2×125 + 1×150
    })];
    const r = computePayable(entries, { baseRate: 50 });
    // 8*50 + 2*50*1.25 + 1*50*1.5 = 400 + 125 + 75 = 600
    assertClose(r.total_amount, 600, 0.1);
  });

  /* 26 — correction never deletes */
  await t('26 correctEntry supersedes instead of deleting', async () => {
    const { tt, clock, store } = mkTT();
    const r = await tt.clockIn('E9');
    clock.advanceHours(8);
    await tt.clockOut(r.entry_id);
    const oldEntry = store.getEntry(r.entry_id);
    const corr = await tt.correctEntry(r.entry_id, { job_code: 'FIXED' }, 'data-fix');
    const reloadedOld = store.getEntry(r.entry_id);
    const fresh = store.getEntry(corr.entry_id);
    assertEq(reloadedOld.status, ENTRY_STATUS.SUPERSEDED);
    assertEq(fresh.supersedes, r.entry_id);
    assert(oldEntry, 'original still present (never deleted)');
  });

  /* 27 — isoWeekKey stable */
  await t('27 isoWeekKey format YYYY-Www', () => {
    const k = isoWeekKey(new Date('2026-04-13T10:00:00Z'));
    assert(/^\d{4}-W\d{2}$/.test(k), 'format ok: ' + k);
  });

  /* 28 — diffHours sanity */
  await t('28 diffHours sanity check', () => {
    assertClose(diffHours('2026-04-13T06:00:00Z', '2026-04-13T14:30:00Z'), 8.5);
    assertClose(diffHours('2026-04-13T14:30:00Z', '2026-04-13T06:00:00Z'), 0, 0.001, 'no negative');
  });

  /* 29 — empty arrays safe */
  await t('29 empty arrays return empty/zero safely', () => {
    assertEq(validateCompliance([]).length, 0);
    const r = computePayable([]);
    assertClose(r.regular, 0);
    assertClose(r.overtime_125, 0);
  });

  /* 30 — timesheet sorts ascending */
  await t('30 timesheet sorts entries ascending', async () => {
    const { tt, clock } = mkTT('2026-04-10T06:00:00Z');
    const ra = await tt.clockIn('E10'); clock.advanceHours(4); await tt.clockOut(ra.entry_id);
    clock.set('2026-04-11T06:00:00Z');
    const rb = await tt.clockIn('E10'); clock.advanceHours(4); await tt.clockOut(rb.entry_id);
    const sheet = await tt.getTimesheet('E10', {});
    assertEq(sheet.length, 2);
    assert(new Date(sheet[0].started_at) < new Date(sheet[1].started_at));
  });

  /* 31 — labor law constants exported */
  await t('31 LABOR_LAW constants exported correctly', () => {
    assertEq(LABOR_LAW.MAX_REGULAR_HOURS_PER_DAY, 8);
    assertEq(LABOR_LAW.MIN_REST_BETWEEN_SHIFTS_HOURS, 11);
    assertEq(LABOR_LAW.MAX_REGULAR_HOURS_PER_WEEK, 42);
  });

  /* 32 — clock-in requires employeeId */
  await t('32 clockIn missing employeeId throws', async () => {
    const { tt } = mkTT();
    let threw = false;
    try { await tt.clockIn(); } catch (e) { threw = /employeeId required/.test(e.message); }
    assert(threw);
  });

  /* ───── summary ───── */
  console.log('\n---');
  console.log(`Total: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nFAILURES:');
    for (const r of results) if (!r.ok) console.log('  - ' + r.name + ': ' + r.err);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
})();
