/* ============================================================================
 * Test suite — Welder Certification Tracker (Y-043)
 * ----------------------------------------------------------------------------
 * Zero-dep node assertion test runner. Run with:
 *     node test/manufacturing/welder-certs.test.js
 * ========================================================================== */

'use strict';

const assert = require('assert');
const {
  WelderCerts,
  WELDING_STANDARDS,
  WELDING_PROCESSES,
  WELDING_POSITIONS,
  POSITION_COVERS,
  UNLIMITED_MM,
  _thicknessRange,
} = require('../../src/manufacturing/welder-certs');

/* ---- tiny test harness ---- */
let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

function run() {
  for (const t of tests) {
    try {
      t.fn();
      passed++;
      console.log('  ok  ' + t.name);
    } catch (e) {
      failed++;
      console.log('  FAIL  ' + t.name);
      console.log('    ' + (e && e.stack ? e.stack : e));
    }
  }
  console.log('');
  console.log('passed: ' + passed + '   failed: ' + failed);
  if (failed > 0) process.exit(1);
}

/* ============================================================================
 * 1. Catalog integrity
 * ========================================================================== */
test('catalogs are frozen and complete', () => {
  assert.ok(Object.isFrozen(WELDING_STANDARDS));
  assert.ok(Object.isFrozen(WELDING_PROCESSES));
  assert.ok(Object.isFrozen(WELDING_POSITIONS));
  assert.strictEqual(Object.keys(WELDING_STANDARDS).length, 4);
  assert.strictEqual(Object.keys(WELDING_PROCESSES).length, 6);
  assert.strictEqual(Object.keys(WELDING_POSITIONS).length, 10);
  // 6G is the universal qualifier — should cover every other position.
  const sixG = POSITION_COVERS['6G'];
  assert.ok(sixG.includes('1G') && sixG.includes('4G') && sixG.includes('4F'));
});

test('thickness range per ASME IX QW-451 (simplified)', () => {
  assert.deepStrictEqual(_thicknessRange(1),    { minMm: 0,   maxMm: 2   });
  assert.deepStrictEqual(_thicknessRange(6),    { minMm: 1.5, maxMm: 12  });
  assert.deepStrictEqual(_thicknessRange(20),   { minMm: 5,   maxMm: UNLIMITED_MM });
});

/* ============================================================================
 * 2. createWelder — lifecycle + bilingual ID
 * ========================================================================== */
test('createWelder stores a welder with Hebrew ת.ז key', () => {
  const wc = new WelderCerts();
  const w = wc.createWelder({
    id: 'WLD-001',
    name: 'אבי כהן',
    'ת.ז': '312345678',
    photo: null,
    hireDate: '2024-06-01',
  });
  assert.strictEqual(w.id, 'WLD-001');
  assert.strictEqual(w.name, 'אבי כהן');
  assert.strictEqual(w.teudatZehut, '312345678');
  assert.strictEqual(w.active, true);
});

test('createWelder rejects bad ת.ז', () => {
  const wc = new WelderCerts();
  assert.throws(() => wc.createWelder({
    id: 'WLD-BAD', name: 'x', 'ת.ז': '123', hireDate: '2024-01-01',
  }), /ת\.ז/);
});

test('createWelder called twice upgrades instead of deleting', () => {
  const wc = new WelderCerts();
  wc.createWelder({ id: 'WLD-002', name: 'original', 'ת.ז': '111111118', hireDate: '2024-01-01' });
  const again = wc.createWelder({ id: 'WLD-002', name: 'updated', 'ת.ז': '111111118', hireDate: '2024-01-01' });
  assert.strictEqual(again.name, 'updated');
  assert.ok(again.history.length >= 1); // history preserved
});

test('deactivateWelder keeps the record (never delete)', () => {
  const wc = new WelderCerts();
  wc.createWelder({ id: 'WLD-003', name: 'x', 'ת.ז': '222222226', hireDate: '2024-01-01' });
  const d = wc.deactivateWelder('WLD-003', 'left company');
  assert.strictEqual(d.active, false);
  assert.strictEqual(d.deactivationReason, 'left company');
  // still retrievable
  assert.ok(wc.getWelder('WLD-003'));
});

/* ============================================================================
 * 3. issueCertification — full cert lifecycle
 * ========================================================================== */
function seededWC() {
  const wc = new WelderCerts();
  wc.createWelder({
    id: 'WLD-010', name: 'יוסי לוי', 'ת.ז': '333333334', hireDate: '2024-01-01',
  });
  return wc;
}

test('issueCertification creates a valid cert', () => {
  const wc = seededWC();
  const c = wc.issueCertification({
    welderId: 'WLD-010',
    standard: 'AWS-D1.1',
    process: 'GMAW',
    position: '3G',
    material: 'S355',
    thicknessRange: { testMm: 10 },
    issueDate: '2026-01-01',
    expiryDate: '2029-01-01',
    testedBy: 'CWI-Avi',
    witnessedBy: 'QA-Dana',
  });
  assert.strictEqual(c.standard, 'AWS-D1.1');
  assert.strictEqual(c.process, 'GMAW');
  assert.strictEqual(c.status, 'active');
  assert.ok(c.thicknessRange.maxMm >= 10);
  assert.ok(c.positionLabel_he.length > 0);
});

test('re-issuing supersedes the previous cert instead of deleting', () => {
  const wc = seededWC();
  const a = wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'CWI-Avi', witnessedBy: 'QA-Dana',
  });
  const b = wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 12 },
    issueDate: '2026-04-01', expiryDate: '2029-04-01',
    testedBy: 'CWI-Avi', witnessedBy: 'QA-Dana',
  });
  // the old one should still be retrievable but marked superseded
  const old = wc.getCertification(a.id);
  assert.strictEqual(old.status, 'superseded');
  assert.strictEqual(old.supersededBy, b.id);
  assert.strictEqual(b.supersededFromId, a.id);
});

test('issueCertification rejects expiryDate before issueDate', () => {
  const wc = seededWC();
  assert.throws(() => wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2026-04-01', expiryDate: '2025-04-01',
    testedBy: 'a', witnessedBy: 'b',
  }), /expiryDate/);
});

/* ============================================================================
 * 4. 6-month continuity rule — AWS D1.1 §4.2.3.1 / ASME IX QW-322.1
 * ========================================================================== */
test('continuity: fresh cert + recent weld -> valid', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'CWI-Avi', witnessedBy: 'QA-Dana',
  });
  wc.recordContinuity('WLD-010', { date: '2026-03-15', process: 'GMAW' });
  const v = wc.checkValidity('WLD-010', 'GMAW', '3G', 'S355', '2026-04-11');
  assert.strictEqual(v.valid, true);
  assert.strictEqual(v.reason, 'ok');
});

test('continuity: no weld in last 6 months -> invalid (lapsed)', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2025-01-01', expiryDate: '2028-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  // Last weld was 9 months ago (2025-07-11), so it's stale.
  wc.recordContinuity('WLD-010', { date: '2025-07-11', process: 'GMAW' });
  const v = wc.checkValidity('WLD-010', 'GMAW', '3G', 'S355', '2026-04-11');
  assert.strictEqual(v.valid, false);
  assert.ok(/continuity/i.test(v.reason));
});

test('continuity per-process — SMAW continuity does not save a GMAW cert', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2025-01-01', expiryDate: '2028-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.recordContinuity('WLD-010', { date: '2026-04-01', process: 'SMAW' });
  const v = wc.checkValidity('WLD-010', 'GMAW', '3G', 'S355', '2026-04-11');
  assert.strictEqual(v.valid, false);
});

/* ============================================================================
 * 5. Position coverage — 6G is the universal qualifier
 * ========================================================================== */
test('6G cert covers 1G/2G/3G/4G/5G plate production', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'ASME-IX', process: 'GTAW', position: '6G',
    material: 'SS304', thicknessRange: { testMm: 12 },
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.recordContinuity('WLD-010', { date: '2026-04-01', process: 'GTAW' });
  for (const pos of ['1G', '2G', '3G', '4G', '5G', '6G', '2F', '4F']) {
    const v = wc.checkValidity('WLD-010', 'GTAW', pos, 'SS304', '2026-04-11');
    assert.strictEqual(v.valid, true, 'should be valid at ' + pos);
  }
});

test('2G cert does NOT cover 3G / 4G production', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'SMAW', position: '2G',
    material: 'A36', thicknessRange: { testMm: 8 },
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.recordContinuity('WLD-010', { date: '2026-04-01', process: 'SMAW' });
  const ok = wc.checkValidity('WLD-010', 'SMAW', '1G', 'A36', '2026-04-11');
  const no = wc.checkValidity('WLD-010', 'SMAW', '3G', 'A36', '2026-04-11');
  assert.strictEqual(ok.valid, true);
  assert.strictEqual(no.valid, false);
  assert.ok(/position|תנוחה/.test(no.reason + no.reason_he));
});

/* ============================================================================
 * 6. Material & thickness envelope
 * ========================================================================== */
test('checkValidity fails when material does not match', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.recordContinuity('WLD-010', { date: '2026-04-01', process: 'GMAW' });
  const v = wc.checkValidity('WLD-010', 'GMAW', '3G', 'SS304', '2026-04-11');
  assert.strictEqual(v.valid, false);
  assert.ok(/material|חומר/.test(v.reason + v.reason_he));
});

test('checkValidity fails when thickness outside range', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 6 },  // range 1.5..12
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.recordContinuity('WLD-010', { date: '2026-04-01', process: 'GMAW' });
  const v = wc.checkValidity('WLD-010', 'GMAW', '3G',
    { name: 'S355', thicknessMm: 20 }, '2026-04-11');
  assert.strictEqual(v.valid, false);
  assert.ok(/thickness|עובי/.test(v.reason + v.reason_he));
});

/* ============================================================================
 * 7. Expiry alerts
 * ========================================================================== */
test('expiringCerts returns certs within window, sorted by days left', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2023-05-01', expiryDate: '2026-05-01',  // 20 days from 2026-04-11
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'SMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2023-04-20', expiryDate: '2026-04-20',  // 9 days from 2026-04-11
    testedBy: 'a', witnessedBy: 'b',
  });
  const alerts = wc.expiringCerts(30, '2026-04-11');
  assert.strictEqual(alerts.length, 2);
  // sorted ascending by days remaining
  assert.ok(alerts[0].daysUntilExpiry <= alerts[1].daysUntilExpiry);
});

test('expiringCerts excludes already-expired (negative daysLeft)', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2022-01-01', expiryDate: '2025-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  const alerts = wc.expiringCerts(90, '2026-04-11');
  assert.strictEqual(alerts.length, 0);
});

test('expired certs also return invalid from checkValidity', () => {
  const wc = seededWC();
  wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2022-01-01', expiryDate: '2025-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.recordContinuity('WLD-010', { date: '2024-12-01', process: 'GMAW' });
  const v = wc.checkValidity('WLD-010', 'GMAW', '3G', 'S355', '2026-04-11');
  assert.strictEqual(v.valid, false);
  assert.ok(/expire|פג/.test(v.reason + v.reason_he));
});

/* ============================================================================
 * 8. WPS + PQR store
 * ========================================================================== */
test('weldingProcedureSpec register + fetch', () => {
  const wc = new WelderCerts();
  const reg = wc.weldingProcedureSpec({
    id: 'WPS-001',
    process: 'GMAW',
    jointType: 'butt',
    baseMetal: { spec: 'A36', thickness: '6-20mm' },
    fillerMetal: { AWS: 'ER70S-6', size: '1.2mm' },
    shieldingGas: '82Ar/18CO2',
    position: '3G',
    amperage: '200-260',
    voltage: '22-28',
    travelSpeed: '250-350 mm/min',
    preheat: 100,
    name_he: 'WPS פלדה מבנית 3G',
    name_en: 'Structural steel WPS 3G',
  });
  assert.strictEqual(reg.version, 1);
  const fetched = wc.weldingProcedureSpec('WPS-001');
  assert.strictEqual(fetched.id, 'WPS-001');
  assert.strictEqual(fetched.jointType, 'butt');
});

test('weldingProcedureSpec upsert bumps version and keeps history', () => {
  const wc = new WelderCerts();
  wc.weldingProcedureSpec({ id: 'WPS-A', process: 'GTAW', amperage: '100-140' });
  const v2 = wc.weldingProcedureSpec({ id: 'WPS-A', process: 'GTAW', amperage: '120-160' });
  assert.strictEqual(v2.version, 2);
  assert.ok(v2.history.length >= 1);
});

test('procedureQualificationRecord binds a WPS and back-links it', () => {
  const wc = new WelderCerts();
  wc.weldingProcedureSpec({ id: 'WPS-B', process: 'SMAW' });
  const pqr = wc.procedureQualificationRecord({
    id: 'PQR-100',
    wpsId: 'WPS-B',
    testDate: '2025-12-01',
    testLab: 'Mechanical test lab IL',
    tensileResults: { MPa: 560, failureLocation: 'base metal' },
    bendResults: 'pass',
    qualifiedBy: 'CWI-Avi',
  });
  assert.strictEqual(pqr.id, 'PQR-100');
  const wps = wc.weldingProcedureSpec('WPS-B');
  assert.strictEqual(wps.pqrRef, 'PQR-100'); // back-linked
});

test('procedureQualificationRecord rejects unknown WPS', () => {
  const wc = new WelderCerts();
  assert.throws(() => wc.procedureQualificationRecord({ id: 'PQR-X', wpsId: 'MISSING' }),
    /unknown WPS/);
});

/* ============================================================================
 * 9. generateCertificate — bilingual structure
 * ========================================================================== */
test('generateCertificate produces bilingual He/En text block', () => {
  const wc = seededWC();
  const cert = wc.issueCertification({
    welderId: 'WLD-010', standard: 'EN-ISO-9606', process: 'GTAW', position: '6G',
    material: 'SS304', thicknessRange: { testMm: 12 },
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'CWI-Avi', witnessedBy: 'QA-Dana', waffleId: 'WPS-042',
  });
  const doc = wc.generateCertificate(cert.id);
  assert.ok(doc.header_he.length > 0);
  assert.ok(doc.header_en.length > 0);
  assert.ok(doc.textBlock.includes('EN ISO 9606'));
  assert.ok(doc.textBlock.includes('יוסי לוי'));  // Hebrew welder name
  assert.ok(doc.textBlock.includes('6G'));
  assert.ok(doc.textBlock.includes('לא מוחקים'));  // never-delete motto
  assert.ok(doc.meta.qrPayload.includes(cert.id));
  // meta.signatures must have both lines filled
  assert.strictEqual(doc.meta.signatures.length, 2);
  assert.strictEqual(doc.meta.signatures[0].name, 'CWI-Avi');
});

/* ============================================================================
 * 10. Audit log never empties
 * ========================================================================== */
test('auditLog captures every mutating action', () => {
  const wc = seededWC();
  const before = wc.auditLog.length;
  const cert = wc.issueCertification({
    welderId: 'WLD-010', standard: 'AWS-D1.1', process: 'GMAW', position: '3G',
    material: 'S355', thicknessRange: { testMm: 10 },
    issueDate: '2026-01-01', expiryDate: '2029-01-01',
    testedBy: 'a', witnessedBy: 'b',
  });
  wc.recordContinuity('WLD-010', { date: '2026-04-01', process: 'GMAW' });
  wc.generateCertificate(cert.id);
  assert.ok(wc.auditLog.length >= before + 3);
  // Nothing in auditLog ever loses information — we can walk it end-to-end.
  for (const entry of wc.auditLog) {
    assert.ok(entry.ts);
    assert.ok(entry.action);
  }
});

/* ============================================================================
 * Run
 * ========================================================================== */
run();
