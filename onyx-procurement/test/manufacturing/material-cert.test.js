/**
 * Unit tests for MaterialCertManager — mill certificate tracker
 * Agent Y-044 — written 2026-04-11
 *
 * Run:   node --test test/manufacturing/material-cert.test.js
 *
 * Coverage:
 *   - Cert storage (all four EN 10204 types, type 3.2 inspector rule)
 *   - Chemistry vs spec (EN 10025 S355, ASTM A36, AISI 304)
 *   - Mechanical vs spec (yield / tensile / elongation)
 *   - Lot association + lot-level trace
 *   - Heat-number trace (normalisation: "HB-123456" === "hb123456")
 *   - searchByStandard inventory rollup
 *   - alertExpiringInventory 5-year threshold
 *   - CoC bundling + failure propagation
 *   - History retention (revised cert keeps the old one)
 *   - Audit log monotonic growth
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MaterialCertManager,
  EN10204_TYPES,
  STANDARD_SPECS,
  ISRAELI_SUPPLIERS,
} = require('../../src/manufacturing/material-cert.js');

/* ────────────────────────────────────────────────
 * Shared fixtures
 * ──────────────────────────────────────────────── */

function compliantS355Cert(overrides) {
  return Object.assign({
    cert_type: '3.1',
    supplier: 'חברת ברזל',
    mill: 'ArcelorMittal Ostrava',
    heat_number: 'HB-700123',
    material_grade: 'S355JR',
    standard: 'EN 10025 S355',
    chemistry: { C: 0.18, Si: 0.30, Mn: 1.40, P: 0.020, S: 0.015, Cu: 0.25, N: 0.008 },
    mechanical: { yieldStrength: 380, tensile: 510, elongation: 25 },
    dimensions: { thickness: 10, width: 1500, length: 6000 },
    quantity: 12,
    documents: ['/certs/HB-700123.pdf'],
    issueDate: '2026-01-15',
  }, overrides || {});
}

function compliant304Cert(overrides) {
  return Object.assign({
    cert_type: '3.2',
    supplier: 'שחם מתכות',
    mill: 'Outokumpu Tornio',
    heat_number: 'SH-55881',
    material_grade: '304',
    standard: 'AISI 304',
    chemistry: { C: 0.06, Mn: 1.80, P: 0.030, S: 0.020, Si: 0.50, Cr: 18.5, Ni: 9.0, N: 0.06 },
    mechanical: { yieldStrength: 230, tensile: 580, elongation: 45 },
    dimensions: { thickness: 3, width: 1250, length: 2500 },
    quantity: 8,
    inspectorStamp: 'Lloyds-IL-5521',
    documents: ['/certs/SH55881.pdf'],
    issueDate: '2026-02-02',
  }, overrides || {});
}

/* ────────────────────────────────────────────────
 * 1. Cert storage — all four EN 10204 types
 * ──────────────────────────────────────────────── */

test('01. receiveCert stores a type 3.1 cert and returns deterministic id', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert());
  assert.equal(cert.certId, 'CERT-000001');
  assert.equal(cert.cert_type, '3.1');
  assert.equal(cert.tier, 3);
  assert.equal(cert.supplier_meta.en, 'Hevrat Barzel Ltd.');
  assert.equal(cert.heat_number_normalized, 'HB700123');
});

test('02. receiveCert accepts type 2.1 (declaration of compliance)', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert({ cert_type: '2.1', heat_number: 'BZ-2201', supplier: 'ברזלי' }));
  assert.equal(cert.cert_type, '2.1');
  assert.equal(cert.tier, 1);
  assert.equal(cert.cert_type_en.startsWith('Declaration'), true);
});

test('03. receiveCert accepts type 2.2 (test report)', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert({ cert_type: '2.2', heat_number: 'YD-9001', supplier: 'י.ד. ברזל' }));
  assert.equal(cert.cert_type, '2.2');
  assert.equal(cert.tier, 2);
});

test('04. receiveCert rejects type 3.2 without inspectorStamp', () => {
  const m = new MaterialCertManager();
  assert.throws(
    () => m.receiveCert(compliant304Cert({ inspectorStamp: undefined })),
    /inspectorStamp/
  );
});

test('05. receiveCert stores type 3.2 when an inspector stamp is provided', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliant304Cert());
  assert.equal(cert.cert_type, '3.2');
  assert.equal(cert.tier, 4);
  assert.equal(cert.inspectorStamp, 'Lloyds-IL-5521');
});

test('06. receiveCert rejects invalid cert_type', () => {
  const m = new MaterialCertManager();
  assert.throws(
    () => m.receiveCert(compliantS355Cert({ cert_type: '4.0' })),
    /invalid cert_type/
  );
});

test('07. receiveCert deep-copies chemistry so external mutation is harmless', () => {
  const m = new MaterialCertManager();
  const payload = compliantS355Cert();
  const cert = m.receiveCert(payload);
  payload.chemistry.C = 0.99;
  assert.equal(cert.chemistry.C, 0.18);
});

/* ────────────────────────────────────────────────
 * 2. Chemistry / mechanical vs spec
 * ──────────────────────────────────────────────── */

test('08. verifyAgainstStandard passes a compliant S355 cert', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert());
  const r = m.verifyAgainstStandard(cert, 'EN 10025 S355');
  assert.equal(r.pass, true);
  assert.equal(r.chemistry_pass, true);
  assert.equal(r.mechanical_pass, true);
});

test('09. verifyAgainstStandard fails when carbon exceeds the max', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert({
    heat_number: 'HB-BAD01',
    chemistry: { C: 0.35, Si: 0.30, Mn: 1.40, P: 0.020, S: 0.015, Cu: 0.25, N: 0.008 },
  }));
  const r = m.verifyAgainstStandard(cert);
  assert.equal(r.pass, false);
  assert.equal(r.chemistry_pass, false);
  const cCheck = r.chemistry_checks.find((c) => c.element === 'C');
  assert.equal(cCheck.pass, false);
  assert.equal(cCheck.actual, 0.35);
  assert.equal(cCheck.limit, 0.24);
});

test('10. verifyAgainstStandard fails when yieldStrength is below the min', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert({
    heat_number: 'HB-WEAK1',
    mechanical: { yieldStrength: 200, tensile: 380, elongation: 24 },
  }));
  const r = m.verifyAgainstStandard(cert);
  assert.equal(r.pass, false);
  assert.equal(r.mechanical_pass, false);
  const y = r.mechanical_checks.find((c) => c.property === 'yieldStrength');
  assert.equal(y.pass, false);
  assert.equal(y.limit, 355);
});

test('11. verifyAgainstStandard fails when stainless Cr is below the min', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliant304Cert({
    heat_number: 'SH-LOCR1',
    chemistry: { C: 0.06, Mn: 1.80, P: 0.030, S: 0.020, Si: 0.50, Cr: 17.0, Ni: 9.0, N: 0.06 },
  }));
  const r = m.verifyAgainstStandard(cert);
  assert.equal(r.pass, false);
  const crCheck = r.chemistry_checks.find((c) => c.element === 'Cr' && c.kind === 'min');
  assert.equal(crCheck.pass, false);
  assert.equal(crCheck.actual, 17.0);
  assert.equal(crCheck.limit, 18.0);
});

test('12. verifyAgainstStandard returns a graceful failure for an unknown standard', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert({ standard: 'MADE-UP-STANDARD' }));
  const r = m.verifyAgainstStandard(cert);
  assert.equal(r.pass, false);
  assert.match(r.reason_en, /Unknown standard/);
});

test('13. verifyAgainstStandard marks missing chemistry as failing', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert({
    heat_number: 'HB-NOC01',
    chemistry: { Si: 0.30, Mn: 1.40, P: 0.020, S: 0.015, Cu: 0.25, N: 0.008 }, // no C
  }));
  const r = m.verifyAgainstStandard(cert);
  assert.equal(r.pass, false);
  const cCheck = r.chemistry_checks.find((c) => c.element === 'C');
  assert.equal(cCheck.pass, false);
  assert.equal(cCheck.reason, 'missing');
});

test('14. verifyAgainstStandard passes ASTM A36 with conforming values', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert({
    standard: 'ASTM A36',
    material_grade: 'A36',
    heat_number: 'KV-90001',
    supplier: 'כבירים',
    chemistry: { C: 0.22, Mn: 0.95, P: 0.030, S: 0.040, Si: 0.30, Cu: 0.18 },
    mechanical: { yieldStrength: 260, tensile: 420, elongation: 22 },
  }));
  const r = m.verifyAgainstStandard(cert);
  assert.equal(r.pass, true);
});

/* ────────────────────────────────────────────────
 * 3. Lot association + trace-by-lot
 * ──────────────────────────────────────────────── */

test('15. associateWithLot creates a new lot when given an object payload', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert());
  const lot = m.associateWithLot(cert.certId, {
    description: 'טבלה 10 מ"מ',
    quantity: 4,
    location: 'מחסן A',
    weightKg: 470,
  });
  assert.equal(lot.lotId, 'LOT-000001');
  assert.equal(lot.certId, cert.certId);
  assert.deepEqual(m.certs.get(cert.certId).lots, ['LOT-000001']);
});

test('16. associateWithLot links multiple lots to the same cert', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert());
  m.associateWithLot(cert.certId, { description: 'lot A', quantity: 2 });
  m.associateWithLot(cert.certId, { description: 'lot B', quantity: 3 });
  assert.equal(m.certs.get(cert.certId).lots.length, 2);
});

test('17. re-binding a lot to a new cert pushes the old binding into history', () => {
  const m = new MaterialCertManager();
  const c1 = m.receiveCert(compliantS355Cert());
  const c2 = m.receiveCert(compliant304Cert());
  const lot = m.associateWithLot(c1.certId, { description: 'misc', quantity: 1 });
  m.associateWithLot(c2.certId, lot.lotId);
  const updated = m.lots.get(lot.lotId);
  assert.equal(updated.certId, c2.certId);
  assert.equal(updated.history.length, 1);
  assert.equal(updated.history[0].previousCertId, c1.certId);
});

test('18. traceByLot returns full cert + verification for a bound lot', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert());
  const lot = m.associateWithLot(cert.certId, { description: 'plate 10mm', quantity: 4 });
  const trace = m.traceByLot(lot.lotId);
  assert.equal(trace.traced, true);
  assert.equal(trace.certId, cert.certId);
  assert.equal(trace.heat_number, 'HB-700123');
  assert.equal(trace.supplier, 'חברת ברזל');
  assert.equal(trace.mill, 'ArcelorMittal Ostrava');
  assert.equal(trace.standard, 'EN 10025 S355');
  assert.equal(trace.verification.pass, true);
});

test('19. traceByLot reports untraced when lot has no cert', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert());
  const lot = m.associateWithLot(cert.certId, { description: 'x', quantity: 1 });
  // create an orphan lot manually
  m.lots.set('LOT-ORPH', { lotId: 'LOT-ORPH', description: 'orphan', quantity: 0, certId: null, history: [], createdAt: new Date().toISOString() });
  const t = m.traceByLot('LOT-ORPH');
  assert.equal(t.traced, false);
  assert.match(t.reason_en, /not yet associated/);
  // and the real lot still traces
  assert.equal(m.traceByLot(lot.lotId).traced, true);
});

/* ────────────────────────────────────────────────
 * 4. Heat-number trace + normalisation
 * ──────────────────────────────────────────────── */

test('20. traceByHeatNumber normalises spaces / dashes / case', () => {
  const m = new MaterialCertManager();
  const cert = m.receiveCert(compliantS355Cert());
  m.associateWithLot(cert.certId, { description: 'lot X', quantity: 5 });
  const a = m.traceByHeatNumber('HB-700123');
  const b = m.traceByHeatNumber('hb 700123');
  const c = m.traceByHeatNumber('HB_700_123');
  assert.equal(a.found, true);
  assert.equal(b.found, true);
  assert.equal(c.found, true);
  assert.equal(a.certs[0].certId, cert.certId);
  assert.equal(a.lots.length, 1);
});

test('21. traceByHeatNumber returns found:false for unknown heat', () => {
  const m = new MaterialCertManager();
  m.receiveCert(compliantS355Cert());
  const r = m.traceByHeatNumber('ZZ-000000');
  assert.equal(r.found, false);
  assert.equal(r.certs.length, 0);
  assert.equal(r.lots.length, 0);
});

test('22. receiving a revised cert for the same heat keeps the old one in history', () => {
  const m = new MaterialCertManager();
  const first  = m.receiveCert(compliantS355Cert());
  const second = m.receiveCert(compliantS355Cert({
    chemistry: { C: 0.19, Si: 0.30, Mn: 1.45, P: 0.020, S: 0.015, Cu: 0.25, N: 0.008 },
  }));
  assert.equal(first.certId, second.certId);            // same id, versioned
  assert.equal(second.version, 2);
  assert.equal(second.history.length, 1);
  assert.equal(second.history[0].version, 1);
  assert.equal(second.history[0].chemistry.C, 0.18);     // old value preserved
  assert.equal(second.chemistry.C, 0.19);                 // new value active
});

/* ────────────────────────────────────────────────
 * 5. Search by standard
 * ──────────────────────────────────────────────── */

test('23. searchByStandard rolls up quantity and certs', () => {
  const m = new MaterialCertManager();
  m.receiveCert(compliantS355Cert({ heat_number: 'HB-1', quantity: 10 }));
  m.receiveCert(compliantS355Cert({ heat_number: 'HB-2', quantity: 7  }));
  m.receiveCert(compliant304Cert({   heat_number: 'SH-3', quantity: 5  }));
  const r = m.searchByStandard('EN 10025 S355');
  assert.equal(r.found, true);
  assert.equal(r.certCount, 2);
  assert.equal(r.totalQuantity, 17);
  const r2 = m.searchByStandard('AISI 304');
  assert.equal(r2.found, true);
  assert.equal(r2.totalQuantity, 5);
});

test('24. searchByStandard returns found:false for a standard not on file', () => {
  const m = new MaterialCertManager();
  m.receiveCert(compliantS355Cert());
  const r = m.searchByStandard('ASTM A572 Gr50');
  assert.equal(r.found, false);
  assert.equal(r.totalQuantity, 0);
  assert.equal(r.certs.length, 0);
});

/* ────────────────────────────────────────────────
 * 6. Expiring-inventory flag
 * ──────────────────────────────────────────────── */

test('25. alertExpiringInventory flags certs older than 5 years', () => {
  const m = new MaterialCertManager();
  m.receiveCert(compliantS355Cert({ heat_number: 'OLD-001', issueDate: '2019-01-01' }));
  m.receiveCert(compliantS355Cert({ heat_number: 'NEW-001', issueDate: '2026-01-01' }));
  const r = m.alertExpiringInventory({ referenceDate: '2026-04-11' });
  assert.equal(r.flagged_count, 1);
  assert.equal(r.flagged[0].heat_number, 'OLD-001');
  assert.ok(r.flagged[0].ageYears >= 5);
  assert.match(r.note_en, /do not expire/);
});

test('26. alertExpiringInventory yearsThreshold is tunable', () => {
  const m = new MaterialCertManager();
  m.receiveCert(compliantS355Cert({ heat_number: 'H-2024', issueDate: '2024-01-01' }));
  const r = m.alertExpiringInventory({ yearsThreshold: 2, referenceDate: '2026-04-11' });
  assert.equal(r.flagged_count, 1);
});

/* ────────────────────────────────────────────────
 * 7. Certificate of Conformance — CoC bundling
 * ──────────────────────────────────────────────── */

test('27. generateCoC bundles all unique certs referenced by a shipment', () => {
  const m = new MaterialCertManager();
  const c1 = m.receiveCert(compliantS355Cert());
  const c2 = m.receiveCert(compliant304Cert());
  const l1 = m.associateWithLot(c1.certId, { description: 'plate 10mm', quantity: 4 });
  const l2 = m.associateWithLot(c1.certId, { description: 'plate 10mm batch 2', quantity: 2 });
  const l3 = m.associateWithLot(c2.certId, { description: 'ss 304 sheet', quantity: 8 });

  const coc = m.generateCoC({
    id: 'SHIP-2026-0101',
    customer: 'בזק בניין ותשתיות',
    date: '2026-04-11',
    lotIds: [l1.lotId, l2.lotId, l3.lotId],
  });

  assert.equal(coc.coc_id, 'COC-SHIP-2026-0101');
  assert.equal(coc.totalLots, 3);
  assert.equal(coc.totalQuantity, 14);
  assert.equal(coc.totalCerts, 2);        // c1 appears once even though two lots
  assert.equal(coc.allPassed, true);
  assert.equal(coc.failedChecks.length, 0);

  const certIds = coc.certs.map((c) => c.certId).sort();
  assert.deepEqual(certIds, [c1.certId, c2.certId].sort());
});

test('28. generateCoC surfaces failed standard checks in failedChecks', () => {
  const m = new MaterialCertManager();
  const bad = m.receiveCert(compliantS355Cert({
    heat_number: 'HB-BAD02',
    chemistry: { C: 0.40, Si: 0.30, Mn: 1.40, P: 0.020, S: 0.015, Cu: 0.25, N: 0.008 },
  }));
  const lot = m.associateWithLot(bad.certId, { description: 'bad plate', quantity: 1 });
  const coc = m.generateCoC({ id: 'SHIP-BAD-001', lotIds: [lot.lotId] });
  assert.equal(coc.allPassed, false);
  assert.equal(coc.failedChecks.length, 1);
  assert.equal(coc.failedChecks[0].certId, bad.certId);
});

test('29. generateCoC flags lots that do not exist', () => {
  const m = new MaterialCertManager();
  const c = m.receiveCert(compliantS355Cert());
  const lot = m.associateWithLot(c.certId, { description: 'ok', quantity: 1 });
  const coc = m.generateCoC({ id: 'SHIP-MIX', lotIds: [lot.lotId, 'LOT-DOES-NOT-EXIST'] });
  assert.equal(coc.totalLots, 1);
  assert.equal(coc.allPassed, false);
  assert.equal(coc.failedChecks.find((f) => f.lotId === 'LOT-DOES-NOT-EXIST').reason_en, 'lot not found');
});

test('30. generateCoC rejects empty / missing lotIds', () => {
  const m = new MaterialCertManager();
  assert.throws(() => m.generateCoC({ id: 'SHIP-EMPTY', lotIds: [] }), /non-empty array/);
  assert.throws(() => m.generateCoC({ id: 'SHIP-NONE' }), /non-empty array/);
});

/* ────────────────────────────────────────────────
 * 8. Audit log + catalog integrity
 * ──────────────────────────────────────────────── */

test('31. auditLog grows monotonically and never shrinks (לא מוחקים)', () => {
  const m = new MaterialCertManager();
  const before = m.auditLog.length;
  const c = m.receiveCert(compliantS355Cert());
  m.associateWithLot(c.certId, { description: 'x', quantity: 1 });
  m.generateCoC({ id: 'SHIP-X', lotIds: [m.certs.get(c.certId).lots[0]] });
  assert.equal(m.auditLog.length > before, true);
  const actions = m.auditLog.map((e) => e.action);
  assert.ok(actions.includes('receiveCert'));
  assert.ok(actions.includes('associateWithLot'));
  assert.ok(actions.includes('generateCoC'));
});

test('32. EN10204_TYPES catalog is frozen (cannot be mutated)', () => {
  assert.equal(Object.isFrozen(EN10204_TYPES), true);
  assert.throws(() => { EN10204_TYPES['4.0'] = {}; }, TypeError);
});

test('33. STANDARD_SPECS exposes all required standards', () => {
  const ids = Object.keys(STANDARD_SPECS);
  assert.ok(ids.includes('EN 10025 S355'));
  assert.ok(ids.includes('ASTM A36'));
  assert.ok(ids.includes('ASTM A572 Gr50'));
  assert.ok(ids.includes('ASTM A500 Gr B'));
  assert.ok(ids.includes('AISI 304'));
  assert.ok(ids.includes('AISI 316'));
  assert.ok(ids.includes('EN 10216 P235GH'));
});

test('34. ISRAELI_SUPPLIERS catalog contains the five seed suppliers', () => {
  assert.ok(ISRAELI_SUPPLIERS['חברת ברזל']);
  assert.ok(ISRAELI_SUPPLIERS['ברזלי']);
  assert.ok(ISRAELI_SUPPLIERS['שחם מתכות']);
  assert.ok(ISRAELI_SUPPLIERS['כבירים']);
  assert.ok(ISRAELI_SUPPLIERS['י.ד. ברזל']);
});
