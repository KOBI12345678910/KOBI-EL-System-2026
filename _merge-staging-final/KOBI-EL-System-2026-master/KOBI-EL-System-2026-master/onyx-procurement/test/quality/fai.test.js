/**
 * Tests for src/quality/fai.js — First Article Inspection (AS9102)
 *
 * Coverage:
 *   - createFAI + form 1/2/3 structure
 *   - addMaterial / addSpecialProcess / addSpecification
 *   - extractCharacteristics (bubbles / BOM / notes)
 *   - parseTolerance helper
 *   - recordResult + auto verdict from bounds
 *   - verdict() — pass / fail / pending
 *   - generateFormPDFs payload shape
 *   - deltaFAI — added / removed / modified / unchanged
 *   - trackExpiry — within window / expired / no-fai-on-file
 *   - non-mutation of returned records (clone isolation)
 *
 * Run:  node --test test/quality/fai.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  FAIManager,
  FAIR_REASONS,
  FORM_LABELS,
  CHAR_TYPES,
  GLOSSARY,
  _internals,
} = require('../../src/quality/fai.js');

// ─── fixtures ────────────────────────────────────────────────────────────────

function baseInputs(overrides = {}) {
  return {
    part: {
      partNumber: 'TKU-AERO-12345',
      partName: 'Bracket, Mounting, Titanium',
      isAssembly: false,
      processRef: 'MP-0012 rev B',
      ...overrides.part,
    },
    drawing: {
      drawingNumber: 'DRW-TKU-12345',
      additionalChanges: [],
      ...overrides.drawing,
    },
    revision: overrides.revision || 'A',
    purchaseOrder: {
      poNumber: 'PO-4500123',
      lineItem: '001',
      lastManufacturedAt: '2026-04-01T00:00:00.000Z',
      ...overrides.purchaseOrder,
    },
    supplier: {
      supplierCode: 'SUP-042',
      legalName: 'Ramat-Gan Metal Works Ltd.',
      cageCode: 'K1234',
      ...overrides.supplier,
    },
    fairReason: overrides.fairReason || 'new-part',
  };
}

const sampleDrawingMetadata = {
  bubbles: [
    { number: 1, description: 'Overall length', nominal: 100.0, tolerance: '±0.1', units: 'mm', zone: 'A4' },
    { number: 2, description: 'Width', nominal: 50.0, tolerance: '±0.05', units: 'mm' },
    { number: 3, description: 'Hole dia', nominal: 10.0, tolerance: '+0.05/-0.00', units: 'mm' },
  ],
  bomCharacteristics: [
    { description: 'Surface roughness', nominal: 1.6, tolerance: '+0.4', units: 'Ra' },
  ],
  notes: [
    'All edges deburred',
    'Break sharp edges 0.2×45°',
  ],
};

// ─── createFAI ───────────────────────────────────────────────────────────────

describe('FAIManager.createFAI', () => {
  test('creates a draft FAI with all three AS9102 forms', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());

    assert.match(fai.id, /^FAI-\d{6}$/);
    assert.equal(fai.status, 'draft');
    assert.equal(fai.fairReason, 'new-part');
    assert.deepEqual(fai.form1.title, FORM_LABELS.form1);
    assert.deepEqual(fai.form2.title, FORM_LABELS.form2);
    assert.deepEqual(fai.form3.title, FORM_LABELS.form3);
    assert.equal(fai.form1.partNumber, 'TKU-AERO-12345');
    assert.equal(fai.form1.drawingNumber, 'DRW-TKU-12345');
    assert.equal(fai.form1.drawingRevision, 'A');
    assert.equal(fai.form1.poNumber, 'PO-4500123');
    assert.equal(fai.form1.supplierCode, 'SUP-042');
    assert.equal(fai.form1.supplierCagecCode, 'K1234');
    assert.equal(fai.form1.fullFAI, true);
    assert.equal(fai.form1.partialFAI, false);
  });

  test('rejects invalid fairReason', () => {
    const mgr = new FAIManager();
    assert.throws(() => mgr.createFAI(baseInputs({ fairReason: 'banana' })), /fairReason must be one of/);
  });

  test('partialFAI flag set for revision-change reason', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs({ fairReason: 'revision-change' }));
    assert.equal(fai.form1.fullFAI, false);
    assert.equal(fai.form1.partialFAI, true);
    assert.ok(fai.form1.reasonForPartialFAI);
    assert.equal(fai.form1.reasonForPartialFAI.en, 'Revision Change');
    assert.equal(fai.form1.reasonForPartialFAI.he, 'שינוי גרסת שרטוט');
  });

  test('all FAIR_REASONS are accepted', () => {
    for (const reason of FAIR_REASONS) {
      const mgr = new FAIManager();
      const fai = mgr.createFAI(baseInputs({ fairReason: reason }));
      assert.equal(fai.fairReason, reason);
    }
  });

  test('required fields are validated', () => {
    const mgr = new FAIManager();
    assert.throws(() => mgr.createFAI({ ...baseInputs(), part: {} }), /part\.partNumber/);
    assert.throws(() => mgr.createFAI({ ...baseInputs(), drawing: {} }), /drawing\.drawingNumber/);
    assert.throws(() => mgr.createFAI({ ...baseInputs(), supplier: {} }), /supplier\.supplierCode/);
    assert.throws(() => mgr.createFAI({ ...baseInputs(), purchaseOrder: {} }), /purchaseOrder\.poNumber/);
  });

  test('returns a clone — mutating result does not affect store', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    fai.form1.partNumber = 'HACKED';
    const fresh = mgr.getFAI(fai.id);
    assert.equal(fresh.form1.partNumber, 'TKU-AERO-12345');
  });

  test('sequential IDs', () => {
    const mgr = new FAIManager();
    const a = mgr.createFAI(baseInputs());
    const b = mgr.createFAI(baseInputs({ part: { partNumber: 'PN-2' } }));
    assert.equal(a.id, 'FAI-000001');
    assert.equal(b.id, 'FAI-000002');
  });
});

// ─── Form 2 accessors ────────────────────────────────────────────────────────

describe('Form 2 — Product Accountability', () => {
  test('addMaterial captures raw-material traceability fields', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    mgr.addMaterial(fai.id, {
      name: 'Titanium 6Al-4V',
      specification: 'AMS 4911',
      certificateOfConformance: 'CoC-2026-0099',
      heatNumber: 'H-8812',
      lotNumber: 'L-442',
      supplier: 'Ramat-Gan Metals',
    });
    const fresh = mgr.getFAI(fai.id);
    assert.equal(fresh.form2.materials.length, 1);
    assert.equal(fresh.form2.materials[0].name, 'Titanium 6Al-4V');
    assert.equal(fresh.form2.materials[0].specification, 'AMS 4911');
    assert.equal(fresh.form2.materials[0].heatNumber, 'H-8812');
  });

  test('addSpecialProcess tracks approval status', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    mgr.addSpecialProcess(fai.id, {
      code: 'SP-ANODIZE',
      name: 'Type II Anodize',
      processSpec: 'MIL-A-8625',
      supplier: 'Coating Shop Ltd.',
      approvalStatus: 'approved',
      certificateNumber: 'NADCAP-AC7108',
    });
    const fresh = mgr.getFAI(fai.id);
    assert.equal(fresh.form2.specialProcesses.length, 1);
    assert.equal(fresh.form2.specialProcesses[0].approvalStatus, 'approved');
  });

  test('addSpecification records applicable spec documents', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    mgr.addSpecification(fai.id, { code: 'AS9102', title: 'FAI Standard', revision: 'C' });
    const fresh = mgr.getFAI(fai.id);
    assert.equal(fresh.form2.specifications[0].code, 'AS9102');
    assert.equal(fresh.form2.specifications[0].revision, 'C');
  });
});

// ─── parseTolerance ──────────────────────────────────────────────────────────

describe('parseTolerance helper', () => {
  const { parseTolerance } = _internals;

  test('symmetric ±', () => {
    assert.deepEqual(parseTolerance(100, '±0.1'), { lower: 99.9, upper: 100.1 });
  });

  test('symmetric +/-', () => {
    assert.deepEqual(parseTolerance(50, '+/-0.05'), { lower: 49.95, upper: 50.05 });
  });

  test('asymmetric +A/-B', () => {
    assert.deepEqual(parseTolerance(10, '+0.05/-0.00'), { lower: 10, upper: 10.05 });
  });

  test('single upper +X', () => {
    assert.deepEqual(parseTolerance(20, '+0.2'), { lower: 20, upper: 20.2 });
  });

  test('single lower -X', () => {
    assert.deepEqual(parseTolerance(20, '-0.1'), { lower: 19.9, upper: 20 });
  });

  test('empty tolerance → exact value', () => {
    assert.deepEqual(parseTolerance(30, ''), { lower: 30, upper: 30 });
  });

  test('ISO fit returns null (explicit bounds required)', () => {
    assert.equal(parseTolerance(10, 'H7'), null);
  });

  test('invalid nominal returns null', () => {
    assert.equal(parseTolerance('not-a-number', '±0.1'), null);
  });
});

// ─── extractCharacteristics ─────────────────────────────────────────────────

describe('extractCharacteristics', () => {
  test('extracts bubbles, BOM items, and notes', () => {
    const mgr = new FAIManager();
    const chars = mgr.extractCharacteristics(sampleDrawingMetadata);
    assert.equal(chars.length, 6); // 3 bubbles + 1 BOM + 2 notes
    assert.equal(chars[0].type, 'dimension');
    assert.equal(chars[0].description, 'Overall length');
    assert.equal(chars[0].nominal, 100);
    assert.deepEqual(chars[0].bounds, { lower: 99.9, upper: 100.1 });
    assert.equal(chars[3].description, 'Surface roughness');
    assert.equal(chars[4].type, 'note');
    assert.equal(chars[4].description, 'All edges deburred');
  });

  test('handles empty metadata gracefully', () => {
    const mgr = new FAIManager();
    assert.deepEqual(mgr.extractCharacteristics({}), []);
  });

  test('pure function — does not mutate inputs', () => {
    const mgr = new FAIManager();
    const snapshot = JSON.stringify(sampleDrawingMetadata);
    mgr.extractCharacteristics(sampleDrawingMetadata);
    assert.equal(JSON.stringify(sampleDrawingMetadata), snapshot);
  });

  test('addCharacteristic assigns sequential bubble IDs', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    const extracted = mgr.extractCharacteristics(sampleDrawingMetadata);
    extracted.forEach(c => mgr.addCharacteristic(fai.id, c));
    const fresh = mgr.getFAI(fai.id);
    assert.equal(fresh.form3.characteristics.length, 6);
    assert.equal(fresh.form3.characteristics[0].id, 'CHR-0001');
    assert.equal(fresh.form3.characteristics[5].id, 'CHR-0006');
  });

  test('addCharacteristic rejects invalid type', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    assert.throws(
      () => mgr.addCharacteristic(fai.id, { type: 'magic', description: 'bad' }),
      /characteristic\.type must be one of/,
    );
  });
});

// ─── recordResult + verdict ──────────────────────────────────────────────────

describe('recordResult + verdict', () => {
  function seedFAI() {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    mgr.extractCharacteristics(sampleDrawingMetadata).forEach(c => mgr.addCharacteristic(fai.id, c));
    return { mgr, faiId: fai.id };
  }

  test('pending verdict when nothing measured', () => {
    const { mgr, faiId } = seedFAI();
    const v = mgr.verdict(faiId);
    assert.equal(v.verdict, 'pending');
    assert.equal(v.pending, 6);
    assert.equal(v.total, 6);
  });

  test('auto-derives accept when actualValue is within bounds', () => {
    const { mgr, faiId } = seedFAI();
    const char = mgr.recordResult(faiId, 'CHR-0001', {
      actualValue: 100.03,
      toolUsed: 'CMM-Mitutoyo',
      inspector: 'Y. Cohen',
    });
    assert.equal(char.result, 'accept');
  });

  test('auto-derives reject when actualValue is out of bounds', () => {
    const { mgr, faiId } = seedFAI();
    const char = mgr.recordResult(faiId, 'CHR-0001', {
      actualValue: 101.5,
      toolUsed: 'CMM',
      inspector: 'A. Levi',
    });
    assert.equal(char.result, 'reject');
  });

  test('explicit result overrides auto-derivation', () => {
    const { mgr, faiId } = seedFAI();
    const char = mgr.recordResult(faiId, 'CHR-0001', {
      actualValue: 100.0,
      result: 'reject',
      notes: 'visual defect',
      inspector: 'QA-1',
    });
    assert.equal(char.result, 'reject');
  });

  test('unknown char id → throws', () => {
    const { mgr, faiId } = seedFAI();
    assert.throws(() => mgr.recordResult(faiId, 'CHR-9999', { result: 'accept' }), /not found/);
  });

  test('PASS requires every characteristic to be accepted', () => {
    const { mgr, faiId } = seedFAI();
    const chars = mgr.getFAI(faiId).form3.characteristics;
    for (const c of chars) {
      if (c.bounds) {
        mgr.recordResult(faiId, c.id, { actualValue: c.nominal, inspector: 'Y' });
      } else {
        mgr.recordResult(faiId, c.id, { result: 'accept', inspector: 'Y' });
      }
    }
    const v = mgr.verdict(faiId);
    assert.equal(v.verdict, 'pass');
    assert.equal(v.accepted, 6);
    assert.equal(v.rejected, 0);
    assert.equal(v.pending, 0);
  });

  test('FAIL propagates from a single rejection', () => {
    const { mgr, faiId } = seedFAI();
    const chars = mgr.getFAI(faiId).form3.characteristics;
    for (const c of chars) {
      mgr.recordResult(faiId, c.id, { result: 'accept', inspector: 'Y' });
    }
    mgr.recordResult(faiId, chars[2].id, { result: 'reject', inspector: 'Y' });
    const v = mgr.verdict(faiId);
    assert.equal(v.verdict, 'fail');
    assert.equal(v.rejected, 1);
  });
});

// ─── generateFormPDFs ────────────────────────────────────────────────────────

describe('generateFormPDFs', () => {
  test('emits three bilingual form payloads', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    mgr.extractCharacteristics(sampleDrawingMetadata).forEach(c => mgr.addCharacteristic(fai.id, c));
    mgr.addMaterial(fai.id, { name: 'Ti-6Al-4V', specification: 'AMS 4911' });
    const pdfs = mgr.generateFormPDFs(fai.id);

    assert.ok(pdfs.form1 && pdfs.form2 && pdfs.form3);
    assert.equal(pdfs.form1.footer.page, '1 of 3');
    assert.equal(pdfs.form2.footer.page, '2 of 3');
    assert.equal(pdfs.form3.footer.page, '3 of 3');
    assert.deepEqual(pdfs.form1.title, FORM_LABELS.form1);
    assert.deepEqual(pdfs.form2.title, FORM_LABELS.form2);
    assert.deepEqual(pdfs.form3.title, FORM_LABELS.form3);
    assert.equal(pdfs.form1.header.partNumber, 'TKU-AERO-12345');
    assert.equal(pdfs.form3.header.totalCharacteristics, 6);
    assert.equal(pdfs.form2.body.materials.length, 1);
    assert.equal(pdfs.form1.bilingual, true);
  });
});

// ─── deltaFAI ────────────────────────────────────────────────────────────────

describe('deltaFAI', () => {
  function build(rev, mutate) {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs({ revision: rev }));
    mgr.extractCharacteristics(sampleDrawingMetadata).forEach(c => mgr.addCharacteristic(fai.id, c));
    if (mutate) mutate(mgr, fai.id);
    return mgr.getFAI(fai.id);
  }

  test('detects added characteristics', () => {
    const prev = build('A');
    const curr = build('B', (mgr, id) => {
      mgr.addCharacteristic(id, {
        bubbleNumber: 99,
        description: 'New callout',
        nominal: 5,
        tolerance: '±0.02',
      });
    });
    const mgr = new FAIManager();
    const delta = mgr.deltaFAI(prev, curr);
    assert.equal(delta.isDelta, true);
    assert.equal(delta.changes.added.length, 1);
    assert.equal(delta.changes.removed.length, 0);
    assert.ok(delta.reinspectionRequired.length >= 1);
    assert.equal(delta.revisionChanged, true);
  });

  test('detects removed characteristics', () => {
    const prev = build('A');
    const currFai = build('B');
    currFai.form3.characteristics = currFai.form3.characteristics.slice(0, 4); // drop last 2
    const mgr = new FAIManager();
    const delta = mgr.deltaFAI(prev, currFai);
    assert.equal(delta.changes.removed.length, 2);
  });

  test('detects modified characteristics (tolerance change)', () => {
    const prev = build('A');
    const curr = build('A');
    curr.form3.characteristics[0].tolerance = '±0.2';
    curr.form3.characteristics[0].bounds = { lower: 99.8, upper: 100.2 };
    const mgr = new FAIManager();
    const delta = mgr.deltaFAI(prev, curr);
    assert.ok(delta.changes.modified.length >= 1);
    const touched = delta.changes.modified.map(m => m.field);
    assert.ok(touched.includes('tolerance'));
    assert.ok(touched.includes('bounds'));
  });

  test('identical FAIs → everything unchanged', () => {
    const prev = build('A');
    const curr = build('A');
    const mgr = new FAIManager();
    const delta = mgr.deltaFAI(prev, curr);
    assert.equal(delta.changes.added.length, 0);
    assert.equal(delta.changes.removed.length, 0);
    assert.equal(delta.changes.modified.length, 0);
    assert.equal(delta.unchanged.length, 6);
  });

  test('supplier change flagged', () => {
    const prev = build('A');
    const curr = build('A');
    curr.form1.supplierCode = 'SUP-099';
    const mgr = new FAIManager();
    const delta = mgr.deltaFAI(prev, curr);
    assert.equal(delta.supplierChanged, true);
  });
});

// ─── trackExpiry ─────────────────────────────────────────────────────────────

describe('trackExpiry', () => {
  test('within window — not expired', () => {
    const mgr = new FAIManager({ clock: () => new Date('2027-01-01T00:00:00Z') });
    const fai = mgr.createFAI(baseInputs({
      purchaseOrder: { poNumber: 'PO-1', lastManufacturedAt: '2026-06-01T00:00:00Z' },
    }));
    const e = mgr.trackExpiry(fai.id);
    assert.equal(e.expired, false);
    assert.equal(e.reason, 'within-window');
    assert.ok(e.daysRemaining > 0);
  });

  test('manufacturing break > 2y → expired', () => {
    const mgr = new FAIManager({ clock: () => new Date('2029-01-01T00:00:00Z') });
    const fai = mgr.createFAI(baseInputs({
      purchaseOrder: { poNumber: 'PO-1', lastManufacturedAt: '2026-01-01T00:00:00Z' },
    }));
    const e = mgr.trackExpiry(fai.id);
    assert.equal(e.expired, true);
    assert.equal(e.reason, 'manufacturing-break-exceeded');
    assert.ok(e.daysRemaining < 0);
  });

  test('exact boundary — just-expired', () => {
    const mgr = new FAIManager({ clock: () => new Date('2028-01-02T00:00:00Z') });
    const fai = mgr.createFAI(baseInputs({
      purchaseOrder: { poNumber: 'PO-1', lastManufacturedAt: '2026-01-01T00:00:00Z' },
    }));
    const e = mgr.trackExpiry(fai.id);
    assert.equal(e.expired, true);
  });

  test('lookup by (supplier, part) returns latest matching FAI', () => {
    const clock = () => new Date('2026-05-01T00:00:00Z');
    const mgr = new FAIManager({ clock });
    const first = mgr.createFAI(baseInputs({
      purchaseOrder: { poNumber: 'PO-1', lastManufacturedAt: '2026-01-01T00:00:00Z' },
    }));
    const second = mgr.createFAI(baseInputs({
      purchaseOrder: { poNumber: 'PO-2', lastManufacturedAt: '2026-04-01T00:00:00Z' },
    }));
    const result = mgr.trackExpiry(
      { supplierCode: 'SUP-042' },
      { partNumber: 'TKU-AERO-12345' },
    );
    assert.equal(result.found, true);
    assert.equal(result.faiId, second.id);
    assert.equal(result.expired, false);
    // first still exists (never deleted — לא מוחקים רק משדרגים ומגדלים)
    assert.equal(mgr.getFAI(first.id).id, first.id);
  });

  test('no FAI on file → expired with reason no-fai-on-file', () => {
    const mgr = new FAIManager();
    const result = mgr.trackExpiry(
      { supplierCode: 'SUP-MISSING' },
      { partNumber: 'UNKNOWN-PART' },
    );
    assert.equal(result.found, false);
    assert.equal(result.expired, true);
    assert.equal(result.reason, 'no-fai-on-file');
  });

  test('custom mfgBreakYears honored', () => {
    const mgr = new FAIManager({
      mfgBreakYears: 5,
      clock: () => new Date('2030-06-01T00:00:00Z'),
    });
    const fai = mgr.createFAI(baseInputs({
      purchaseOrder: { poNumber: 'PO-1', lastManufacturedAt: '2026-01-01T00:00:00Z' },
    }));
    const e = mgr.trackExpiry(fai.id);
    assert.equal(e.mfgBreakYears, 5);
    assert.equal(e.expired, false);
  });
});

// ─── non-destructive guarantees ──────────────────────────────────────────────

describe('non-destructive guarantees (לא מוחקים רק משדרגים ומגדלים)', () => {
  test('no delete method on manager', () => {
    const mgr = new FAIManager();
    assert.equal(typeof mgr.delete, 'undefined');
    assert.equal(typeof mgr.remove, 'undefined');
  });

  test('listFAIs retains all historical records', () => {
    const mgr = new FAIManager();
    mgr.createFAI(baseInputs());
    mgr.createFAI(baseInputs({ part: { partNumber: 'PN-2' } }));
    mgr.createFAI(baseInputs({ part: { partNumber: 'PN-3' } }));
    assert.equal(mgr.listFAIs().length, 3);
  });

  test('audit trail grows with each mutation', () => {
    const mgr = new FAIManager();
    const fai = mgr.createFAI(baseInputs());
    mgr.addCharacteristic(fai.id, { description: 'x', nominal: 1, tolerance: '±0.1' });
    mgr.recordResult(fai.id, 'CHR-0001', { result: 'accept', inspector: 'A' });
    const fresh = mgr.getFAI(fai.id);
    assert.ok(fresh.audit.length >= 3);
    assert.equal(fresh.audit[0].event, 'created');
  });
});

// ─── bilingual glossary ──────────────────────────────────────────────────────

describe('Bilingual (HE + EN) support', () => {
  test('GLOSSARY has both languages for every term', () => {
    for (const key of Object.keys(GLOSSARY)) {
      assert.ok(GLOSSARY[key].he && GLOSSARY[key].he.length > 0, `missing HE for ${key}`);
      assert.ok(GLOSSARY[key].en && GLOSSARY[key].en.length > 0, `missing EN for ${key}`);
    }
  });

  test('FORM_LABELS bilingual for all three forms', () => {
    for (const f of ['form1', 'form2', 'form3']) {
      assert.ok(FORM_LABELS[f].he && FORM_LABELS[f].en);
    }
  });

  test('CHAR_TYPES covers dimension / note / material / process / test', () => {
    assert.deepEqual(
      [...CHAR_TYPES].sort(),
      ['dimension', 'material', 'note', 'process', 'test'].sort(),
    );
  });
});
