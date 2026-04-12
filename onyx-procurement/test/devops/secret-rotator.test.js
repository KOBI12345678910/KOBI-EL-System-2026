/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AG-Y172 — secret-rotator.js test suite
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Zero-dependency tests: pure Node `assert`. No mocha / jest / tap.
 * Run with:  node onyx-procurement/test/devops/secret-rotator.test.js
 *
 * Coverage goals (≥ 15 tests):
 *   1.  generateStrongSecret — length, entropy, boundary checks
 *   2.  scheduleRotation — happy path + interval bounds + id validation
 *   3.  rotate() creates PENDING and does NOT flip the ACTIVE pointer
 *   4.  activateNew() promotes PENDING → ACTIVE and demotes old → GRACE
 *   5.  Dual-key window — ACTIVE + GRACE both accepted by verifyInUse
 *   6.  retireOld() refuses to retire ACTIVE
 *   7.  retireOld() refuses to retire still-in-grace (without force)
 *   8.  retireOld() flips to RETIRED and keeps row (never-delete rule)
 *   9.  emergencyRotation — instant revoke of previous version
 *  10.  emergencyRotation with keepGrace=true keeps previous in GRACE
 *  11.  Audit log is append-only and captures every transition
 *  12.  Usage log records service → version mapping
 *  13.  rotateIfDue — no-op when not yet due
 *  14.  rotateIfDue — triggers when due
 *  15.  Injectable storage — custom backend is called
 *  16.  Monotonic state machine — cannot re-activate a RETIRED version
 *  17.  idempotent retireOld on an already-RETIRED version
 *  18.  verifyInUse with unknown versionId → verified === false
 *  19.  listVersions hides secret material unless includeSecret:true
 *  20.  Error i18n — every error has EN + HE text
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

const assert = require('node:assert');

const {
  SecretRotator,
  MemoryStorage,
  SecretRotatorError,
  STATUS,
  ROTATION_REASON,
  AUDIT_EVENT,
  MIN_SECRET_BYTES,
  MAX_SECRET_BYTES,
  MIN_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
  MS_PER_DAY,
  addDays,
} = require('../../src/devops/secret-rotator');

// ─────────────────────────── Tiny harness ────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  const p = Promise.resolve().then(fn).then(
    () => { passed++; process.stdout.write('.'); },
    (e) => { failed++; failures.push({ name, error: e }); process.stdout.write('F'); }
  );
  pending.push(p);
}
const pending = [];

function fakeClock(startMs = Date.parse('2026-04-11T09:00:00Z')) {
  let t = startMs;
  const clock = () => t;
  clock.advance = (ms) => { t += ms; };
  clock.advanceDays = (d) => { t += Math.round(d * MS_PER_DAY); };
  clock.set = (ms) => { t = ms; };
  return clock;
}

// ─────────────────────────── TESTS ───────────────────────────────────────

test('01 generateStrongSecret — default length ≥ 32 bytes (64 hex chars)', () => {
  const r = new SecretRotator();
  const s = r.generateStrongSecret();
  assert.strictEqual(typeof s, 'string');
  assert.strictEqual(s.length, MIN_SECRET_BYTES * 2);
  assert.match(s, /^[0-9a-f]+$/);
});

test('02 generateStrongSecret — two calls produce different values', () => {
  const r = new SecretRotator();
  const a = r.generateStrongSecret();
  const b = r.generateStrongSecret();
  assert.notStrictEqual(a, b);
});

test('03 generateStrongSecret — rejects < 32 bytes', () => {
  const r = new SecretRotator();
  assert.throws(() => r.generateStrongSecret(16), /E_WEAK_ENTROPY/);
  assert.throws(() => r.generateStrongSecret(0), /E_WEAK_ENTROPY/);
  assert.throws(() => r.generateStrongSecret(-1), /E_WEAK_ENTROPY/);
});

test('04 generateStrongSecret — rejects > 1024 bytes', () => {
  const r = new SecretRotator();
  assert.throws(() => r.generateStrongSecret(2048), /E_TOO_LARGE/);
});

test('05 constructor — rejects weak secretBytes', () => {
  assert.throws(() => new SecretRotator({ secretBytes: 8 }), /E_WEAK_ENTROPY/);
});

test('06 scheduleRotation — happy path bootstraps first PENDING version', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock });
  const rec = await r.scheduleRotation('jwt-key', 90);
  assert.strictEqual(rec.secretId, 'jwt-key');
  assert.strictEqual(rec.intervalDays, 90);
  assert.strictEqual(rec.nextRotationAt, addDays(clock(), 90));
  const versions = await r.listVersions('jwt-key');
  assert.strictEqual(versions.length, 1);
  assert.strictEqual(versions[0].status, STATUS.PENDING);
  assert.strictEqual(versions[0].reason, ROTATION_REASON.INITIAL);
});

test('07 scheduleRotation — rejects bad intervals', async () => {
  const r = new SecretRotator();
  await assert.rejects(() => r.scheduleRotation('k', 0), /E_BAD_INTERVAL/);
  await assert.rejects(() => r.scheduleRotation('k', 99999), /E_BAD_INTERVAL/);
  await assert.rejects(() => r.scheduleRotation('k', NaN), /E_BAD_INTERVAL/);
});

test('08 scheduleRotation — rejects bad secretId', async () => {
  const r = new SecretRotator();
  await assert.rejects(() => r.scheduleRotation('', 30), /E_BAD_ID/);
  await assert.rejects(() => r.scheduleRotation('has space', 30), /E_BAD_ID/);
  await assert.rejects(() => r.scheduleRotation('x'.repeat(200), 30), /E_BAD_ID/);
});

test('09 rotate() — creates PENDING without flipping ACTIVE', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock });
  await r.scheduleRotation('api-key', 30);
  const [bootstrap] = await r.listVersions('api-key');
  await r.activateNew('api-key', bootstrap.versionId);

  clock.advanceDays(15);
  const { versionId: newId } = await r.rotate('api-key');

  const versions = await r.listVersions('api-key');
  const active = versions.find((v) => v.status === STATUS.ACTIVE);
  const pending = versions.find((v) => v.versionId === newId);
  assert.strictEqual(active.versionId, bootstrap.versionId,
    'ACTIVE must not change until activateNew() is called');
  assert.strictEqual(pending.status, STATUS.PENDING);
});

test('10 activateNew() — promotes PENDING and demotes old to GRACE', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock, graceDays: 7 });
  await r.scheduleRotation('sig', 60);
  const [v0] = await r.listVersions('sig');
  await r.activateNew('sig', v0.versionId);
  clock.advanceDays(30);
  const { versionId: v1Id } = await r.rotate('sig');
  await r.activateNew('sig', v1Id);

  const versions = await r.listVersions('sig');
  const v0After = versions.find((v) => v.versionId === v0.versionId);
  const v1After = versions.find((v) => v.versionId === v1Id);
  assert.strictEqual(v0After.status, STATUS.GRACE);
  assert.strictEqual(v1After.status, STATUS.ACTIVE);
  assert.strictEqual(
    v0After.graceEndsAt,
    addDays(v0After.graceStartedAt, 7),
    'grace end = grace start + graceDays'
  );
});

test('11 Dual-key window — ACTIVE + GRACE both accepted by verifyInUse', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock, graceDays: 7 });
  await r.scheduleRotation('enc', 30);
  const [v0] = await r.listVersions('enc');
  await r.activateNew('enc', v0.versionId);
  const { versionId: v1Id } = await r.rotate('enc');
  await r.activateNew('enc', v1Id);

  const oldCheck = await r.verifyInUse('enc', 'auth-api', v0.versionId);
  const newCheck = await r.verifyInUse('enc', 'auth-api', v1Id);
  assert.strictEqual(oldCheck.verified, true, 'old (grace) must still verify');
  assert.strictEqual(newCheck.verified, true, 'new (active) must verify');
  assert.deepStrictEqual(new Set(oldCheck.accepted), new Set([v1Id, v0.versionId]));
});

test('12 retireOld() — refuses to retire ACTIVE', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('k1', 30);
  const [v] = await r.listVersions('k1');
  await r.activateNew('k1', v.versionId);
  await assert.rejects(
    () => r.retireOld('k1', v.versionId),
    /E_CANNOT_RETIRE_ACTIVE/
  );
});

test('13 retireOld() — refuses to retire still-in-grace without force', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock, graceDays: 7 });
  await r.scheduleRotation('k2', 30);
  const [v0] = await r.listVersions('k2');
  await r.activateNew('k2', v0.versionId);
  const { versionId: v1Id } = await r.rotate('k2');
  await r.activateNew('k2', v1Id);
  await assert.rejects(
    () => r.retireOld('k2', v0.versionId),
    /E_STILL_IN_GRACE/
  );
});

test('14 retireOld() — succeeds after grace window expires', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock, graceDays: 7 });
  await r.scheduleRotation('k3', 30);
  const [v0] = await r.listVersions('k3');
  await r.activateNew('k3', v0.versionId);
  const { versionId: v1Id } = await r.rotate('k3');
  await r.activateNew('k3', v1Id);

  clock.advanceDays(8);  // past the 7-day grace
  const retired = await r.retireOld('k3', v0.versionId);
  assert.strictEqual(retired.status, STATUS.RETIRED);

  // row still present — never-delete rule
  const list = await r.listVersions('k3');
  assert.strictEqual(list.length, 2);
  assert.ok(list.find((v) => v.versionId === v0.versionId && v.status === STATUS.RETIRED));
});

test('15 retireOld() — force:true works within grace window', async () => {
  const r = new SecretRotator({ graceDays: 7 });
  await r.scheduleRotation('k4', 30);
  const [v0] = await r.listVersions('k4');
  await r.activateNew('k4', v0.versionId);
  const { versionId: v1Id } = await r.rotate('k4');
  await r.activateNew('k4', v1Id);

  const ret = await r.retireOld('k4', v0.versionId, { force: true });
  assert.strictEqual(ret.status, STATUS.RETIRED);
});

test('16 retireOld() — idempotent on already-RETIRED version', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock, graceDays: 1 });
  await r.scheduleRotation('k5', 30);
  const [v0] = await r.listVersions('k5');
  await r.activateNew('k5', v0.versionId);
  const { versionId: v1Id } = await r.rotate('k5');
  await r.activateNew('k5', v1Id);
  clock.advanceDays(2);

  const first = await r.retireOld('k5', v0.versionId);
  const second = await r.retireOld('k5', v0.versionId);
  assert.strictEqual(first.status, STATUS.RETIRED);
  assert.strictEqual(second.status, STATUS.RETIRED);
  assert.strictEqual(first.retiredAt, second.retiredAt, 'idempotent — no re-stamp');
});

test('17 emergencyRotation — instant revoke (keepGrace=false default)', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('leaked', 30);
  const [v0] = await r.listVersions('leaked');
  await r.activateNew('leaked', v0.versionId);

  const { versionId: newId } = await r.emergencyRotation(
    'leaked',
    'Observed token on pastebin'
  );

  const versions = await r.listVersions('leaked');
  const v0After = versions.find((v) => v.versionId === v0.versionId);
  const newActive = versions.find((v) => v.versionId === newId);
  assert.strictEqual(v0After.status, STATUS.RETIRED,
    'emergency must retire the compromised version immediately');
  assert.strictEqual(newActive.status, STATUS.ACTIVE);
});

test('18 emergencyRotation — keepGrace:true keeps prior version in GRACE', async () => {
  const r = new SecretRotator({ graceDays: 2 });
  await r.scheduleRotation('leaked2', 30);
  const [v0] = await r.listVersions('leaked2');
  await r.activateNew('leaked2', v0.versionId);

  await r.emergencyRotation('leaked2', 'suspicious — read-only grace', {
    keepGrace: true,
  });

  const versions = await r.listVersions('leaked2');
  const v0After = versions.find((v) => v.versionId === v0.versionId);
  assert.strictEqual(v0After.status, STATUS.GRACE);
});

test('19 emergencyRotation — rejects empty reason', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('x', 30);
  await assert.rejects(() => r.emergencyRotation('x', ''), /E_BAD_REASON/);
  await assert.rejects(() => r.emergencyRotation('x', '   '), /E_BAD_REASON/);
});

test('20 Audit log — append-only, captures every transition', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock });
  await r.scheduleRotation('audited', 30);
  const [v0] = await r.listVersions('audited');
  await r.activateNew('audited', v0.versionId);
  const { versionId: v1Id } = await r.rotate('audited');
  await r.activateNew('audited', v1Id);

  const log = await r.getAuditLog('audited');
  const events = log.map((e) => e.event);
  assert.ok(events.includes(AUDIT_EVENT.SCHEDULED));
  assert.ok(events.includes(AUDIT_EVENT.ROTATED));
  assert.ok(events.includes(AUDIT_EVENT.ACTIVATED));
  // append-only: timestamps must be non-decreasing
  for (let i = 1; i < log.length; i++) {
    assert.ok(log[i].at >= log[i - 1].at);
  }
});

test('21 Usage log — records service → version mapping', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('svc-key', 30);
  const [v0] = await r.listVersions('svc-key');
  await r.activateNew('svc-key', v0.versionId);
  await r.verifyInUse('svc-key', 'auth-api', v0.versionId);
  await r.verifyInUse('svc-key', 'billing-worker', v0.versionId);

  const usage = await r.getUsageLog('svc-key');
  assert.strictEqual(usage.length, 2);
  const services = usage.map((u) => u.serviceName).sort();
  assert.deepStrictEqual(services, ['auth-api', 'billing-worker']);
});

test('22 rotateIfDue — no-op when not due', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock });
  await r.scheduleRotation('rdue', 30);
  const result = await r.rotateIfDue('rdue');
  assert.strictEqual(result, null);
});

test('23 rotateIfDue — triggers when due', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock });
  await r.scheduleRotation('rdue2', 30);
  const [v0] = await r.listVersions('rdue2');
  await r.activateNew('rdue2', v0.versionId);

  clock.advanceDays(31);
  const res = await r.rotateIfDue('rdue2');
  assert.ok(res);
  assert.ok(res.versionId);
  const versions = await r.listVersions('rdue2');
  assert.ok(versions.find((v) => v.versionId === res.versionId && v.status === STATUS.PENDING));
});

test('24 Injectable storage — a custom backend is actually called', async () => {
  const calls = [];
  const base = new MemoryStorage();
  const spy = {
    upsertSecret: async (r) => { calls.push(['upsertSecret', r.secretId]); return base.upsertSecret(r); },
    getSecret:    async (id) => { calls.push(['getSecret', id]); return base.getSecret(id); },
    listSecrets:  async () => { calls.push(['listSecrets']); return base.listSecrets(); },
    insertVersion:async (v) => { calls.push(['insertVersion', v.versionId]); return base.insertVersion(v); },
    updateVersion:async (v) => { calls.push(['updateVersion', v.versionId, v.status]); return base.updateVersion(v); },
    getVersion:   async (s,v) => { calls.push(['getVersion', s, v]); return base.getVersion(s, v); },
    listVersions: async (id) => { calls.push(['listVersions', id]); return base.listVersions(id); },
    appendAudit:  async (e) => { calls.push(['appendAudit', e.event]); return base.appendAudit(e); },
    listAudit:    async (id) => { calls.push(['listAudit', id]); return base.listAudit(id); },
    recordUsage:  async (u) => { calls.push(['recordUsage']); return base.recordUsage(u); },
    listUsage:    async (id) => { calls.push(['listUsage', id]); return base.listUsage(id); },
  };
  const r = new SecretRotator({ storage: spy });
  await r.scheduleRotation('pluggable', 30);

  const appendAuditCalls = calls.filter((c) => c[0] === 'appendAudit');
  const insertCalls = calls.filter((c) => c[0] === 'insertVersion');
  assert.ok(appendAuditCalls.length >= 1, 'custom backend must receive audit writes');
  assert.ok(insertCalls.length >= 1, 'custom backend must receive version inserts');
});

test('25 Monotonic state machine — cannot re-activate a RETIRED version', async () => {
  const clock = fakeClock();
  const r = new SecretRotator({ now: clock, graceDays: 1 });
  await r.scheduleRotation('mono', 30);
  const [v0] = await r.listVersions('mono');
  await r.activateNew('mono', v0.versionId);
  const { versionId: v1 } = await r.rotate('mono');
  await r.activateNew('mono', v1);
  clock.advanceDays(2);
  await r.retireOld('mono', v0.versionId);

  await assert.rejects(
    () => r.activateNew('mono', v0.versionId),
    /E_BAD_STATE/
  );
});

test('26 verifyInUse — unknown versionId → verified === false', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('vk', 30);
  const [v0] = await r.listVersions('vk');
  await r.activateNew('vk', v0.versionId);

  const result = await r.verifyInUse('vk', 'svc', 'v_does_not_exist');
  assert.strictEqual(result.verified, false);
  assert.strictEqual(result.active, v0.versionId);
});

test('27 verifyInUse — no versionId arg returns verified:null', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('vk2', 30);
  const [v0] = await r.listVersions('vk2');
  await r.activateNew('vk2', v0.versionId);
  const result = await r.verifyInUse('vk2', 'svc');
  assert.strictEqual(result.verified, null);
  assert.deepStrictEqual(result.accepted, [v0.versionId]);
});

test('28 listVersions hides secret material unless includeSecret:true', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('hide', 30);
  const safeList = await r.listVersions('hide');
  assert.strictEqual(safeList[0]._secretHex, undefined);
  const unsafeList = await r.listVersions('hide', { includeSecret: true });
  assert.strictEqual(typeof unsafeList[0]._secretHex, 'string');
  assert.strictEqual(unsafeList[0]._secretHex.length, MIN_SECRET_BYTES * 2);
});

test('29 Error i18n — every SecretRotatorError has EN + HE text', () => {
  try {
    const r = new SecretRotator();
    r.generateStrongSecret(1);
  } catch (e) {
    assert.ok(e instanceof SecretRotatorError);
    assert.ok(typeof e.messageEn === 'string' && e.messageEn.length > 0);
    assert.ok(typeof e.messageHe === 'string' && e.messageHe.length > 0);
    // Hebrew contains at least one Hebrew-range character
    assert.match(e.messageHe, /[\u0590-\u05FF]/);
    return;
  }
  throw new Error('Expected error was not thrown');
});

test('30 Fingerprint is stable for same secret, different for different', () => {
  const r = new SecretRotator();
  // Use private _fingerprint helper indirectly via two versions.
  const a = r._fingerprint('deadbeef'.repeat(8));
  const b = r._fingerprint('deadbeef'.repeat(8));
  const c = r._fingerprint('feedface'.repeat(8));
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.strictEqual(a.length, 16);
});

test('31 scheduleRotation on existing secret updates interval without wiping versions', async () => {
  const r = new SecretRotator();
  await r.scheduleRotation('keep', 30);
  const before = await r.listVersions('keep');
  await r.scheduleRotation('keep', 90);
  const after = await r.listVersions('keep');
  assert.strictEqual(before.length, after.length, 'existing versions must be preserved');
  const rec = await r.storage.getSecret('keep');
  assert.strictEqual(rec.intervalDays, 90);
});

test('32 auditHook receives every audit event', async () => {
  const received = [];
  const r = new SecretRotator({ auditHook: (e) => received.push(e.event) });
  await r.scheduleRotation('hook', 30);
  const [v0] = await r.listVersions('hook');
  await r.activateNew('hook', v0.versionId);
  assert.ok(received.length >= 2);
  assert.ok(received.includes(AUDIT_EVENT.SCHEDULED));
  assert.ok(received.includes(AUDIT_EVENT.ACTIVATED));
});

// ─────────────────────────── Runner ──────────────────────────────────────

(async () => {
  // Allow all `test(...)` calls to register their promises first.
  await new Promise((r) => setImmediate(r));
  await Promise.all(pending);
  process.stdout.write('\n');
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) {
      console.error(`\n  FAIL: ${f.name}\n    ${f.error && f.error.stack || f.error}`);
    }
    process.exit(1);
  }
  process.exit(0);
})();
