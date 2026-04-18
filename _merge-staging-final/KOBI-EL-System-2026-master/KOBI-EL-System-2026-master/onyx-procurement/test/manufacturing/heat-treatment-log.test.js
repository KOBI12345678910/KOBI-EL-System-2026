/* ============================================================================
 * Test suite — Heat Treatment Log Tracker (Y-042)
 * ----------------------------------------------------------------------------
 * Zero-dep node:test runner. Run with:
 *     node --test test/manufacturing/heat-treatment-log.test.js
 * ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HeatTreatmentLog,
  THERMOCOUPLE_TYPES,
  PROCESS_CATALOG,
  FURNACE_CLASSES,
  HARDNESS_SCALES,
} = require('../../src/manufacturing/heat-treatment-log');

/* ----------------------------------------------------------------------------
 * helpers
 * -------------------------------------------------------------------------- */
function seededLog() {
  const log = new HeatTreatmentLog();
  log.defineFurnace({
    id: 'FUR-VAC-01',
    type: 'vacuum-batch',
    temperatureRange: { minC: 200, maxC: 1250 },
    tcMapping: [
      { location: 'top',    offset: 0.4 },
      { location: 'middle', offset: 0.0 },
      { location: 'bottom', offset: -0.3 },
    ],
    thermocoupleType: 'K',
    calibrationDue: '2026-06-01',
    class: '2',
    he: 'תנור ואקום אצוות 01',
    en: 'Vacuum Batch Furnace 01',
  });
  log.defineRecipe({
    id: 'RCP-4140-Q&T',
    name_he: 'הרתחה והטמפרה — 4140',
    name_en: 'Quench & Temper — 4140',
    process: 'temper',
    targetTemp: 540,
    soakTime: 60,
    coolingRate: 5,
    atmosphere: 'nitrogen',
    rampRate: 8,
    toleranceC: 8,
    minTimeAtTemp: 60,
  });
  return log;
}

/* ============================================================================
 * 1. Catalog integrity
 * ========================================================================== */
test('catalogs are frozen and complete', () => {
  assert.ok(Object.isFrozen(THERMOCOUPLE_TYPES));
  assert.ok(Object.isFrozen(PROCESS_CATALOG));
  assert.ok(Object.isFrozen(FURNACE_CLASSES));
  assert.ok(Object.isFrozen(HARDNESS_SCALES));
  // AMS 2750 thermocouples
  for (const t of ['K', 'J', 'T', 'N', 'R', 'S', 'B']) {
    assert.ok(THERMOCOUPLE_TYPES[t], 'TC type ' + t + ' missing');
    assert.ok(THERMOCOUPLE_TYPES[t].he.length > 0);
    assert.ok(THERMOCOUPLE_TYPES[t].en.length > 0);
  }
  // process catalog
  for (const p of ['anneal', 'normalize', 'temper', 'quench', 'stress-relief', 'case-harden']) {
    assert.ok(PROCESS_CATALOG[p], 'process ' + p + ' missing');
  }
  // furnace classes 1..6 per AMS 2750G Table 6
  for (const c of ['1', '2', '3', '4', '5', '6']) {
    assert.ok(FURNACE_CLASSES[c], 'class ' + c + ' missing');
  }
});

/* ============================================================================
 * 2. defineFurnace
 * ========================================================================== */
test('defineFurnace stores furnace with bilingual labels', () => {
  const log = seededLog();
  const f = log.getFurnace('FUR-VAC-01');
  assert.equal(f.id, 'FUR-VAC-01');
  assert.equal(f.thermocoupleType, 'K');
  assert.equal(f.class, '2');
  assert.equal(f.tcMapping.length, 3);
  assert.equal(f.he, 'תנור ואקום אצוות 01');
  assert.equal(f.version, 1);
});

test('defineFurnace rejects TC type that cannot reach max temp', () => {
  const log = new HeatTreatmentLog();
  // Type J max ~760°C; 1100°C should be rejected.
  assert.throws(() => log.defineFurnace({
    id: 'BAD-J',
    type: 'pit',
    temperatureRange: { minC: 200, maxC: 1100 },
    tcMapping: [{ location: 'centre', offset: 0 }],
    thermocoupleType: 'J',
    calibrationDue: '2026-12-01',
  }), /thermocouple type J/);
});

test('defineFurnace rejects unknown thermocouple type', () => {
  const log = new HeatTreatmentLog();
  assert.throws(() => log.defineFurnace({
    id: 'BAD-TC',
    type: 'pit',
    temperatureRange: { minC: 100, maxC: 600 },
    tcMapping: [{ location: 'centre', offset: 0 }],
    thermocoupleType: 'Z',
    calibrationDue: '2026-12-01',
  }), /thermocoupleType/);
});

test('defineFurnace upgrade preserves history (לא מוחקים)', () => {
  const log = seededLog();
  const v2 = log.defineFurnace({
    id: 'FUR-VAC-01',
    type: 'vacuum-batch',
    temperatureRange: { minC: 200, maxC: 1200 }, // adjusted (still within K)
    tcMapping: [
      { location: 'top',    offset: 0.4 },
      { location: 'middle', offset: 0.0 },
      { location: 'bottom', offset: -0.3 },
    ],
    thermocoupleType: 'K',
    calibrationDue: '2026-09-01',
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.history.length, 1);
  assert.equal(v2.history[0].snapshot.temperatureRange.maxC, 1250);
});

/* ============================================================================
 * 3. defineRecipe
 * ========================================================================== */
test('defineRecipe stores bilingual recipe with process metadata', () => {
  const log = seededLog();
  const r = log.getRecipe('RCP-4140-Q&T');
  assert.equal(r.process, 'temper');
  assert.equal(r.name_he, 'הרתחה והטמפרה — 4140');
  assert.equal(r.targetTemp, 540);
  assert.equal(r.toleranceC, 8);
  assert.equal(r.processMeta.en, 'Tempering');
});

test('defineRecipe rejects unknown process', () => {
  const log = new HeatTreatmentLog();
  assert.throws(() => log.defineRecipe({
    id: 'BAD',
    name_he: 'x',
    name_en: 'x',
    process: 'foo',
    targetTemp: 500,
    soakTime: 30,
    coolingRate: 5,
    atmosphere: 'air',
    rampRate: 8,
  }), /process must be one of/);
});

/* ============================================================================
 * 4. startLot / logReading / completeLot
 * ========================================================================== */
test('startLot creates an in-progress lot tied to recipe + furnace', () => {
  const log = seededLog();
  const lot = log.startLot({
    lotId: 'LOT-001',
    partNumber: 'PN-AXLE-22',
    qty: 12,
    heatNo: 'HEAT-2026-04-A',
    material: '4140',
    recipeId: 'RCP-4140-Q&T',
    furnaceId: 'FUR-VAC-01',
    operatorId: 'OP-AVI',
  });
  assert.equal(lot.status, 'in-progress');
  assert.equal(lot.qty, 12);
  assert.equal(lot.heatNo, 'HEAT-2026-04-A');
  assert.ok(lot.recipeSnapshot);
  assert.ok(lot.furnaceSnapshot);
});

test('startLot refuses to overwrite an existing lot (append-only)', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-DUP', partNumber: 'P', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  assert.throws(() => log.startLot({
    lotId: 'LOT-DUP', partNumber: 'P', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  }), /append-only/);
});

test('logReading appends time-series readings in order', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-002', partNumber: 'PN', qty: 2, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  const r1 = log.logReading({
    lotId: 'LOT-002', timestamp: '2026-04-11T08:00:00Z', setTemp: 540,
    actualTemp: [{ location: 'top', value: 540 }, { location: 'bottom', value: 539 }],
  });
  const r2 = log.logReading({
    lotId: 'LOT-002', timestamp: '2026-04-11T08:30:00Z', setTemp: 540,
    actualTemp: [{ location: 'top', value: 541 }, { location: 'bottom', value: 540 }],
  });
  assert.equal(r1.seq, 1);
  assert.equal(r2.seq, 2);
  const lot = log.lots.get('LOT-002');
  assert.equal(lot.readings.length, 2);
});

test('completeLot transitions to completed and locks further readings', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-003', partNumber: 'PN', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  log.logReading({
    lotId: 'LOT-003', timestamp: '2026-04-11T08:00:00Z', setTemp: 540,
    actualTemp: [{ location: 'middle', value: 540 }],
  });
  log.completeLot({
    lotId: 'LOT-003',
    hardnessHRC: 32,
    hardnessHB: 302,
    visualInspection: 'no scale, dimensional ok',
    passed: true,
  });
  const lot = log.lots.get('LOT-003');
  assert.equal(lot.status, 'completed');
  assert.equal(lot.result.hardnessHRC, 32);
  assert.throws(() => log.logReading({
    lotId: 'LOT-003', timestamp: '2026-04-11T08:01:00Z', setTemp: 540,
    actualTemp: [{ location: 'middle', value: 540 }],
  }), /not in-progress|אינה פעילה/);
});

test('completeLot reject path requires rejectReason', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-REJ', partNumber: 'PN', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  assert.throws(() => log.completeLot({
    lotId: 'LOT-REJ', passed: false,
  }), /rejectReason/);
  const r = log.completeLot({
    lotId: 'LOT-REJ', passed: false, rejectReason: 'soft spots, hardness HRC 22',
  });
  assert.equal(r.status, 'rejected');
  assert.equal(r.result.passed, false);
});

/* ============================================================================
 * 5. deviationCheck
 * ========================================================================== */
test('deviationCheck flags over-temperature within the soak window', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-DEV', partNumber: 'PN', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  // Reach band, then spike
  log.logReading({ lotId: 'LOT-DEV', timestamp: '2026-04-11T08:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  log.logReading({ lotId: 'LOT-DEV', timestamp: '2026-04-11T08:30:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 562 }] }); // +22 > tol 8
  log.logReading({ lotId: 'LOT-DEV', timestamp: '2026-04-11T09:30:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  const dev = log.deviationCheck('LOT-DEV');
  assert.equal(dev.within, false);
  assert.ok(dev.deviations.find(d => d.kind === 'over-temperature'));
});

test('deviationCheck flags time-at-temperature short of minimum', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-SHORT', partNumber: 'PN', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  // Only 10 minutes within band — recipe needs 60.
  log.logReading({ lotId: 'LOT-SHORT', timestamp: '2026-04-11T08:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  log.logReading({ lotId: 'LOT-SHORT', timestamp: '2026-04-11T08:10:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  const dev = log.deviationCheck('LOT-SHORT');
  assert.equal(dev.timeAtTempOk, false);
  assert.ok(dev.deviations.find(d => d.kind === 'time-at-temperature-short'));
});

test('deviationCheck happy path returns within=true and no deviations', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-OK', partNumber: 'PN', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  log.logReading({ lotId: 'LOT-OK', timestamp: '2026-04-11T08:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  log.logReading({ lotId: 'LOT-OK', timestamp: '2026-04-11T08:30:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 542 }] });
  log.logReading({ lotId: 'LOT-OK', timestamp: '2026-04-11T09:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 539 }] });
  log.logReading({ lotId: 'LOT-OK', timestamp: '2026-04-11T09:30:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  const dev = log.deviationCheck('LOT-OK');
  assert.equal(dev.within, true);
  assert.equal(dev.deviations.length, 0);
  assert.equal(dev.timeAtTempOk, true);
});

/* ============================================================================
 * 6. furnaceCalibrationCheck — overdue alert (AMS 2750)
 * ========================================================================== */
test('furnaceCalibrationCheck flags overdue calibration', () => {
  const log = seededLog();
  // Today is 2026-04-11; calibrationDue 2026-06-01 -> not overdue.
  const ok = log.furnaceCalibrationCheck('FUR-VAC-01', '2026-04-11');
  assert.equal(ok.overdue, false);
  // Move the asOf forward past the due date
  const overdue = log.furnaceCalibrationCheck('FUR-VAC-01', '2026-08-15');
  assert.equal(overdue.overdue, true);
  assert.ok(overdue.daysOverdue > 0);
  assert.ok(/CALIBRATION OVERDUE/.test(overdue.alert_en));
  assert.ok(/בפיגור/.test(overdue.alert_he));
});

test('recordCalibration bumps calibrationDue per class cadence', () => {
  const log = seededLog();
  const ev = log.recordCalibration('FUR-VAC-01', '2026-04-11T10:00:00Z', 'CWI-Avi');
  // Class 2 cadence is 90 days
  assert.equal(ev.cadenceDays, FURNACE_CLASSES['2'].calIntervalControlDays);
  const refreshed = log.getFurnace('FUR-VAC-01');
  assert.equal(refreshed.calibrationDue, ev.nextDue);
});

/* ============================================================================
 * 7. systemAccuracyTest (SAT) — quarterly for class 2
 * ========================================================================== */
test('systemAccuracyTest passes when control vs test TC within tolerance', () => {
  const log = seededLog();
  const sat = log.systemAccuracyTest('FUR-VAC-01', {
    controlReadingC: 540, testReadingC: 540.5, performedAt: '2026-04-11T10:00:00Z', performedBy: 'QA-Dana',
  });
  assert.equal(sat.passed, true);
  assert.equal(sat.cadenceDays, 90); // class 2 quarterly
  assert.ok(sat.deviationC <= sat.allowedDeviationC);
});

test('systemAccuracyTest fails when deviation exceeds tolerance', () => {
  const log = seededLog();
  const sat = log.systemAccuracyTest('FUR-VAC-01', {
    controlReadingC: 540, testReadingC: 548, performedAt: '2026-04-11T10:00:00Z', performedBy: 'QA-Dana',
  });
  assert.equal(sat.passed, false);
  assert.equal(sat.result_en, 'FAIL');
  assert.equal(sat.result_he, 'כשל');
});

/* ============================================================================
 * 8. Traceability chain
 * ========================================================================== */
test('traceability walks raw heat -> lot -> part -> assembly -> ship', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-TRACE', partNumber: 'PN-WING', qty: 3, heatNo: 'HEAT-2026-99',
    material: '4340', recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  log.logReading({ lotId: 'LOT-TRACE', timestamp: '2026-04-11T08:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  log.logReading({ lotId: 'LOT-TRACE', timestamp: '2026-04-11T09:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  log.completeLot({ lotId: 'LOT-TRACE', hardnessHRC: 30, passed: true });

  log.registerPart('SN-1001', 'LOT-TRACE');
  log.registerPart('SN-1002', 'LOT-TRACE');
  log.registerAssembly('ASM-A1', ['SN-1001', 'SN-1002']);
  log.registerShipment('SHP-101', ['ASM-A1'], '2026-04-12');

  const trace = log.traceability('SN-1001');
  assert.equal(trace.found, true);
  assert.equal(trace.heatNo, 'HEAT-2026-99');
  assert.equal(trace.material, '4340');
  assert.equal(trace.lot.lotId, 'LOT-TRACE');
  assert.equal(trace.assemblies.length, 1);
  assert.equal(trace.assemblies[0].assemblyId, 'ASM-A1');
  assert.equal(trace.shipments.length, 1);
  assert.equal(trace.shipments[0].shipmentId, 'SHP-101');
  assert.ok(trace.chain_he.includes('יציקה'));
});

test('traceability returns not-found for unknown serial', () => {
  const log = seededLog();
  const trace = log.traceability('SN-DOES-NOT-EXIST');
  assert.equal(trace.found, false);
  assert.ok(/not registered/.test(trace.message_en));
});

/* ============================================================================
 * 9. Bilingual certificate
 * ========================================================================== */
test('generateCertificate produces bilingual cert with all readings', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-CERT', partNumber: 'PN-77', qty: 5, heatNo: 'HEAT-2026-77',
    material: '4140', recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP-MOSHE',
  });
  log.logReading({ lotId: 'LOT-CERT', timestamp: '2026-04-11T08:00:00Z', setTemp: 540, actualTemp: [{ location: 'top', value: 540 }] });
  log.logReading({ lotId: 'LOT-CERT', timestamp: '2026-04-11T09:00:00Z', setTemp: 540, actualTemp: [{ location: 'top', value: 540 }] });
  log.completeLot({ lotId: 'LOT-CERT', hardnessHRC: 31, hardnessHB: 295, visualInspection: 'clean', passed: true });
  const cert = log.generateCertificate('LOT-CERT');
  // header is bilingual
  assert.ok(cert.header_he.includes('תעודת'));
  assert.ok(cert.header_en.includes('Heat Treatment'));
  // text block contains the lot, the operator, the motto, the result both ways
  assert.ok(cert.textBlock.includes('LOT-CERT'));
  assert.ok(cert.textBlock.includes('OP-MOSHE'));
  assert.ok(cert.textBlock.includes('PASS'));
  assert.ok(cert.textBlock.includes('תקין'));
  assert.ok(cert.textBlock.includes('לא מוחקים'));
  // signature placeholders
  assert.equal(cert.signaturePlaceholders.length, 2);
  assert.equal(cert.signaturePlaceholders[0].role_en, 'Operator');
  assert.equal(cert.signaturePlaceholders[1].role_he, 'אבטחת איכות');
  // readings present
  assert.ok(Array.isArray(cert.readings));
  assert.equal(cert.readings.length, 2);
});

test('generateCertificate refuses to certify a still-running lot', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-OPEN', partNumber: 'P', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  assert.throws(() => log.generateCertificate('LOT-OPEN'), /in-progress|פעילה/);
});

/* ============================================================================
 * 10. hardnessLog — multiple scales
 * ========================================================================== */
test('hardnessLog accepts HRC, HRB, HB, HV in a single batch', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-HARD', partNumber: 'P', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  const out = log.hardnessLog({
    lotId: 'LOT-HARD',
    readings: [
      { scale: 'HRC', value: 30, location: 'edge'   },
      { scale: 'HRB', value: 92, location: 'face'   },
      { scale: 'HB',  value: 285, location: 'core'  },
      { scale: 'HV',  value: 305, location: 'core'  },
    ],
  });
  assert.equal(out.length, 4);
  assert.equal(out[0].scaleMeta.he, 'רוקוול C');
  const stored = log.hardness.get('LOT-HARD');
  assert.equal(stored.length, 4);
});

test('hardnessLog rejects unknown hardness scale', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-BADH', partNumber: 'P', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  assert.throws(() => log.hardnessLog({
    lotId: 'LOT-BADH', readings: [{ scale: 'HRX', value: 30 }],
  }), /hardness scale|סקאלת קשיחות/);
});

test('hardnessLog appends — does not overwrite', () => {
  const log = seededLog();
  log.startLot({
    lotId: 'LOT-APPEND', partNumber: 'P', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  log.hardnessLog({ lotId: 'LOT-APPEND', readings: [{ scale: 'HRC', value: 30 }] });
  log.hardnessLog({ lotId: 'LOT-APPEND', readings: [{ scale: 'HRC', value: 31 }] });
  log.hardnessLog({ lotId: 'LOT-APPEND', readings: [{ scale: 'HB',  value: 290 }] });
  const stored = log.hardness.get('LOT-APPEND');
  assert.equal(stored.length, 3);
  assert.equal(stored[0].value, 30);
  assert.equal(stored[1].value, 31);
  assert.equal(stored[2].scale, 'HB');
});

/* ============================================================================
 * 11. Audit log — append-only
 * ========================================================================== */
test('auditLog captures every mutating action', () => {
  const log = seededLog();
  const before = log.auditLog.length;
  log.startLot({
    lotId: 'LOT-AUD', partNumber: 'P', qty: 1, heatNo: 'H', material: '4140',
    recipeId: 'RCP-4140-Q&T', furnaceId: 'FUR-VAC-01', operatorId: 'OP',
  });
  log.logReading({ lotId: 'LOT-AUD', timestamp: '2026-04-11T08:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  log.logReading({ lotId: 'LOT-AUD', timestamp: '2026-04-11T09:00:00Z', setTemp: 540, actualTemp: [{ location: 'm', value: 540 }] });
  log.hardnessLog({ lotId: 'LOT-AUD', readings: [{ scale: 'HRC', value: 30 }] });
  log.completeLot({ lotId: 'LOT-AUD', hardnessHRC: 30, passed: true });
  log.generateCertificate('LOT-AUD');
  assert.ok(log.auditLog.length >= before + 6);
  for (const entry of log.auditLog) {
    assert.ok(entry.ts);
    assert.ok(entry.action);
  }
});
