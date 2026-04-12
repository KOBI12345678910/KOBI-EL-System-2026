/**
 * Tests for src/documents/pdf-form-filler.js — Agent AG-Y120
 *
 * Covers:
 *   - seedIsraeliForms() — all 7 Israeli forms register correctly
 *   - loadTemplate() — field map schema + validation
 *   - fillForm() — PDF output, text content, Hebrew RTL handling
 *   - bilingualFill() — Hebrew + English twin outputs
 *   - batchFill() — mass fill for multiple employees
 *   - flattenForm() — marker injection, idempotent
 *   - validate() — required / type / Hebrew sanity
 *   - preview() — structural preview without rendering
 *   - coordinateLookup() — field map + PDF scan
 *   - hebrewFontHandler() — font list + visual-order helper
 *
 * Run: node --test test/documents/pdf-form-filler.test.js
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  PDFFormFiller,
  FIELD_TYPES,
  DEFAULT_HEBREW_FONTS,
  _internal,
} = require('../../src/documents/pdf-form-filler.js');

// ═════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═════════════════════════════════════════════════════════════════════════════

const EMPLOYEE_HE = {
  tax_year: 2026,
  employee_name: 'ישראל ישראלי',
  employee_id: '123456782',
  birth_date: '1985-06-15',
  immigration_date: '1985-06-15',
  gender: 'זכר',
  address_street: 'רחוב הרצל 1',
  address_city: 'תל אביב',
  phone: '03-1234567',
  marital_status: 'נשוי',
  spouse_name: 'שרה ישראלי',
  spouse_id: '234567893',
  spouse_works: true,
  num_children: 2,
  credit_points: 2.25,
  new_immigrant: false,
  single_parent: false,
  disabled_child: false,
  residence_zone: '',
  has_other_income: false,
  other_income_source: '',
  signature: 'ישראל ישראלי',
  signature_date: '2026-01-15',
};

const WAGE_SUMMARY_106 = {
  tax_year: 2026,
  employer_name: 'טכנו קול עוזי בע"מ',
  employer_tax_id: '516123456',
  employee_name: 'ישראל ישראלי',
  employee_id: '123456782',
  employment_start: '2020-01-01',
  employment_end: '2026-12-31',
  gross_wages: 180000,
  taxable_wages: 175000,
  income_tax: 30000,
  bituach_leumi: 12000,
  mas_briut: 5500,
  pension_employee: 10500,
  pension_employer: 10500,
  severance_employer: 15000,
  keren_hishtalmut_emp: 4500,
  keren_hishtalmut_er: 13500,
  credit_points_used: 2.25,
  signature: 'Techno-Kol Uzi Payroll',
};

// ═════════════════════════════════════════════════════════════════════════════
// seedIsraeliForms
// ═════════════════════════════════════════════════════════════════════════════

describe('seedIsraeliForms', () => {
  test('registers all 7 Israeli government forms', () => {
    const f = new PDFFormFiller();
    const names = f.seedIsraeliForms();
    const expected = [
      'tofes-101',
      'tofes-106',
      'tofes-161',
      'tofes-143',
      'pcn836',
      'form-1301',
      'form-126',
    ];
    for (const n of expected) {
      assert.ok(names.includes(n), `expected template "${n}" to be seeded`);
      assert.ok(f.templates.has(n), `template "${n}" should be registered`);
    }
  });

  test('each seeded template has fields with valid coordinates', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    for (const [name, tpl] of f.templates) {
      assert.ok(tpl.fields.length > 0, `${name} has no fields`);
      for (const field of tpl.fields) {
        assert.equal(typeof field.x, 'number', `${name}.${field.name} missing x`);
        assert.equal(typeof field.y, 'number', `${name}.${field.name} missing y`);
        assert.ok(
          Object.values(FIELD_TYPES).includes(field.type),
          `${name}.${field.name} invalid type`
        );
      }
    }
  });

  test('tofes-101 has the canonical employee-declaration fields', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const tpl = f.templates.get('tofes-101');
    const fieldNames = tpl.fields.map((x) => x.name);
    assert.ok(fieldNames.includes('employee_name'));
    assert.ok(fieldNames.includes('employee_id'));
    assert.ok(fieldNames.includes('credit_points'));
    assert.ok(fieldNames.includes('spouse_works'));
    assert.ok(fieldNames.includes('signature'));
  });

  test('pcn836 has VAT-specific fields', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const tpl = f.templates.get('pcn836');
    const names = tpl.fields.map((x) => x.name);
    assert.ok(names.includes('vat_file_number'));
    assert.ok(names.includes('vat_output'));
    assert.ok(names.includes('vat_input_equipment'));
    assert.ok(names.includes('net_vat_due'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// loadTemplate
// ═════════════════════════════════════════════════════════════════════════════

describe('loadTemplate', () => {
  test('accepts minimal field definition', () => {
    const f = new PDFFormFiller();
    const tpl = f.loadTemplate({
      name: 'my-form',
      fields: [{ name: 'fullName', x: 100, y: 700, type: 'text' }],
    });
    assert.equal(tpl.name, 'my-form');
    assert.equal(tpl.fields[0].page, 1);
    assert.equal(tpl.fields[0].align, 'left');
  });

  test('defaults align=right for Hebrew fields', () => {
    const f = new PDFFormFiller();
    f.loadTemplate({
      name: 'my-form',
      fields: [{ name: 'name', x: 100, y: 700, type: 'text', hebrew: true }],
    });
    assert.equal(f.templates.get('my-form').fields[0].align, 'right');
  });

  test('throws on missing name', () => {
    const f = new PDFFormFiller();
    assert.throws(() => f.loadTemplate({ fields: [{ name: 'x', x: 0, y: 0, type: 'text' }] }));
  });

  test('throws on empty fields array', () => {
    const f = new PDFFormFiller();
    assert.throws(() => f.loadTemplate({ name: 'x', fields: [] }));
  });

  test('throws on unknown field type', () => {
    const f = new PDFFormFiller();
    assert.throws(() =>
      f.loadTemplate({
        name: 'x',
        fields: [{ name: 'a', x: 0, y: 0, type: 'foobar' }],
      })
    );
  });

  test('throws on field missing x/y', () => {
    const f = new PDFFormFiller();
    assert.throws(() =>
      f.loadTemplate({
        name: 'x',
        fields: [{ name: 'a', type: 'text' }],
      })
    );
  });

  test('replaces existing template of same name', () => {
    const f = new PDFFormFiller();
    f.loadTemplate({
      name: 'x',
      fields: [{ name: 'a', x: 0, y: 0, type: 'text' }],
    });
    f.loadTemplate({
      name: 'x',
      fields: [
        { name: 'a', x: 0, y: 0, type: 'text' },
        { name: 'b', x: 0, y: 0, type: 'text' },
      ],
    });
    assert.equal(f.templates.get('x').fields.length, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// fillForm
// ═════════════════════════════════════════════════════════════════════════════

describe('fillForm', () => {
  test('produces a PDF buffer starting with %PDF-', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const { pdf, warnings } = f.fillForm({ templateName: 'tofes-101', data: EMPLOYEE_HE });
    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.length > 100, 'pdf buffer should be non-trivial');
    assert.ok(pdf.toString('latin1').startsWith('%PDF-'), 'pdf starts with magic bytes');
    assert.ok(Array.isArray(warnings));
  });

  test('throws on unknown template', () => {
    const f = new PDFFormFiller();
    assert.throws(
      () => f.fillForm({ templateName: 'no-such-form', data: {} }),
      /unknown template/
    );
  });

  test('fills Form 106 wage summary without throwing', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const { pdf } = f.fillForm({ templateName: 'tofes-106', data: WAGE_SUMMARY_106 });
    assert.ok(pdf.length > 0);
  });

  test('options.signature fills empty signature fields', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const data = { ...EMPLOYEE_HE };
    delete data.signature;
    const { pdf } = f.fillForm({
      templateName: 'tofes-101',
      data,
      options: { signature: 'Auto-sign: Kobi EL' },
    });
    assert.ok(Buffer.isBuffer(pdf));
  });

  test('checkbox fields render X when true', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const prev = f.preview({
      templateName: 'tofes-101',
      data: { spouse_works: true, new_immigrant: false },
    });
    const spouseWorks = prev.fields.find((x) => x.name === 'spouse_works');
    const newImmig = prev.fields.find((x) => x.name === 'new_immigrant');
    assert.equal(spouseWorks.value, 'X');
    assert.equal(newImmig.value, '');
  });

  test('numeric fields stringify correctly', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const prev = f.preview({
      templateName: 'tofes-101',
      data: { credit_points: 2.25, num_children: 2 },
    });
    assert.equal(prev.fields.find((x) => x.name === 'credit_points').value, '2.25');
    assert.equal(prev.fields.find((x) => x.name === 'num_children').value, '2');
  });

  test('with pdfkit missing, falls back to stub writer producing valid PDF', () => {
    const f = new PDFFormFiller();
    // Force no-pdfkit code path.
    f.pdfkit = null;
    f.seedIsraeliForms();
    const { pdf, warnings, stub } = f.fillForm({
      templateName: 'tofes-101',
      data: EMPLOYEE_HE,
    });
    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.toString('latin1').startsWith('%PDF-'));
    assert.ok(pdf.toString('latin1').includes('%%EOF'));
    assert.equal(stub, true);
    assert.ok(warnings.some((w) => /pdfkit-not-installed/.test(w)));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Hebrew text handling
// ═════════════════════════════════════════════════════════════════════════════

describe('Hebrew / RTL handling', () => {
  test('containsHebrew detects Hebrew letters', () => {
    assert.equal(_internal.containsHebrew('ישראל'), true);
    assert.equal(_internal.containsHebrew('Hello'), false);
    assert.equal(_internal.containsHebrew('Hello ישראל'), true);
    assert.equal(_internal.containsHebrew(null), false);
    assert.equal(_internal.containsHebrew(''), false);
  });

  test('visualOrderHebrew keeps latin digits LTR inside a mixed run', () => {
    const out = _internal.visualOrderHebrew('שנת 2026 ישראל');
    // Hebrew runs reversed but digit run preserved.
    assert.ok(out.includes('2026'), 'digits must remain in order');
  });

  test('visualOrderHebrew is idempotent twice-reversed → original visual order', () => {
    const original = 'שלום עולם';
    const once = _internal.visualOrderHebrew(original);
    const twice = _internal.visualOrderHebrew(once);
    assert.notEqual(once, original);
    // Reversing a reversed pure-Hebrew string yields the original.
    assert.equal(twice, original);
  });

  test('sanitizeHebrew rejects unpaired high surrogate', () => {
    const bad = '\uD800notpaired';
    const res = _internal.sanitizeHebrew(bad);
    assert.equal(res.ok, false);
  });

  test('sanitizeHebrew escapes PDF literal meta-characters', () => {
    const res = _internal.sanitizeHebrew('(hello)\\world');
    assert.ok(res.ok);
    assert.ok(res.text.includes('\\('));
    assert.ok(res.text.includes('\\)'));
    assert.ok(res.text.includes('\\\\'));
  });

  test('hebrewFontHandler returns font list with David first', () => {
    const f = new PDFFormFiller();
    const h = f.hebrewFontHandler();
    assert.equal(h.preferred, 'David');
    assert.ok(h.fontList.includes('Narkisim'));
    assert.ok(h.fontList.includes('Arial Hebrew'));
    assert.equal(typeof h.visualOrder, 'function');
  });

  test('DEFAULT_HEBREW_FONTS contains expected fonts', () => {
    assert.ok(DEFAULT_HEBREW_FONTS.includes('David'));
    assert.ok(DEFAULT_HEBREW_FONTS.includes('Narkisim'));
    assert.ok(DEFAULT_HEBREW_FONTS.includes('Arial Hebrew'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// validate
// ═════════════════════════════════════════════════════════════════════════════

describe('validate', () => {
  test('passes with full employee record', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const res = f.validate({ templateName: 'tofes-101', data: EMPLOYEE_HE });
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  test('flags required field when marked required and missing', () => {
    const f = new PDFFormFiller();
    f.loadTemplate({
      name: 't',
      fields: [
        { name: 'a', x: 0, y: 0, type: 'text', required: true },
        { name: 'b', x: 0, y: 20, type: 'text' },
      ],
    });
    const res = f.validate({ templateName: 't', data: { b: 'ok' } });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /a/.test(e)));
  });

  test('warns on radio value outside options', () => {
    const f = new PDFFormFiller();
    f.loadTemplate({
      name: 't',
      fields: [
        {
          name: 'gender',
          x: 0,
          y: 0,
          type: 'radio',
          options: ['male', 'female'],
        },
      ],
    });
    const res = f.validate({ templateName: 't', data: { gender: 'other' } });
    assert.equal(res.valid, true, 'warnings are not errors');
    assert.ok(res.warnings.length > 0);
  });

  test('rejects unpaired surrogate in Hebrew field', () => {
    const f = new PDFFormFiller();
    f.loadTemplate({
      name: 't',
      fields: [{ name: 'name', x: 0, y: 0, type: 'text', hebrew: true }],
    });
    const res = f.validate({ templateName: 't', data: { name: '\uD800bad' } });
    assert.equal(res.valid, false);
  });

  test('rejects control characters in text field', () => {
    const f = new PDFFormFiller();
    f.loadTemplate({
      name: 't',
      fields: [{ name: 'n', x: 0, y: 0, type: 'text' }],
    });
    const res = f.validate({ templateName: 't', data: { n: 'bad\x01' } });
    assert.equal(res.valid, false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// preview
// ═════════════════════════════════════════════════════════════════════════════

describe('preview', () => {
  test('returns structural rows for each field', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const p = f.preview({ templateName: 'tofes-106', data: WAGE_SUMMARY_106 });
    assert.equal(p.template, 'tofes-106');
    assert.ok(p.fields.length >= 18);
    const grossRow = p.fields.find((r) => r.name === 'gross_wages');
    assert.ok(grossRow);
    assert.equal(grossRow.value, '180000');
    assert.equal(grossRow.empty, false);
  });

  test('marks empty fields', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const p = f.preview({
      templateName: 'tofes-101',
      data: { employee_name: 'Kobi' },
    });
    const nameRow = p.fields.find((r) => r.name === 'employee_name');
    const phoneRow = p.fields.find((r) => r.name === 'phone');
    assert.equal(nameRow.empty, false);
    assert.equal(phoneRow.empty, true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// bilingualFill
// ═════════════════════════════════════════════════════════════════════════════

describe('bilingualFill', () => {
  test('produces two PDFs (he + en)', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const res = f.bilingualFill({
      templateName: 'tofes-106',
      data_he: WAGE_SUMMARY_106,
      data_en: {
        ...WAGE_SUMMARY_106,
        employer_name: 'Techno-Kol Uzi Ltd',
        employee_name: 'Israel Israeli',
      },
    });
    assert.ok(Buffer.isBuffer(res.he.pdf));
    assert.ok(Buffer.isBuffer(res.en.pdf));
    assert.notEqual(res.he.pdf.length, 0);
    assert.notEqual(res.en.pdf.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// batchFill
// ═════════════════════════════════════════════════════════════════════════════

describe('batchFill', () => {
  test('fills 5 employees into Form 101', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const records = [];
    for (let i = 0; i < 5; i++) {
      records.push({
        ...EMPLOYEE_HE,
        employee_name: `עובד ${i + 1}`,
        employee_id: `12345678${i}`,
      });
    }
    const res = f.batchFill({ templateName: 'tofes-101', records });
    assert.equal(res.ok, 5);
    assert.equal(res.failed, 0);
    assert.equal(res.results.length, 5);
    for (const r of res.results) {
      assert.ok(Buffer.isBuffer(r.pdf));
    }
  });

  test('throws on non-array records', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    assert.throws(() => f.batchFill({ templateName: 'tofes-101', records: 'notarr' }));
  });

  test('records with invalid data still return a result slot', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const res = f.batchFill({
      templateName: 'tofes-101',
      records: [EMPLOYEE_HE, {}],
    });
    assert.equal(res.results.length, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// flattenForm
// ═════════════════════════════════════════════════════════════════════════════

describe('flattenForm', () => {
  test('injects /Flattened true marker into stub PDF', () => {
    const f = new PDFFormFiller();
    f.pdfkit = null;
    f.seedIsraeliForms();
    const { pdf } = f.fillForm({ templateName: 'tofes-101', data: EMPLOYEE_HE });
    const flat = f.flattenForm(pdf);
    assert.equal(flat.flattened, true);
    assert.ok(flat.pdf.toString('latin1').includes('/Flattened true'));
  });

  test('idempotent when already flattened', () => {
    const f = new PDFFormFiller();
    f.pdfkit = null;
    f.seedIsraeliForms();
    const { pdf } = f.fillForm({ templateName: 'tofes-101', data: EMPLOYEE_HE });
    const first = f.flattenForm(pdf);
    const second = f.flattenForm(first.pdf);
    assert.equal(second.flattened, true);
  });

  test('non-buffer input returned unchanged', () => {
    const f = new PDFFormFiller();
    const res = f.flattenForm('not a buffer');
    assert.equal(res.flattened, false);
    assert.equal(res.pdf, 'not a buffer');
  });

  test('options.flatten triggers flatten automatically', () => {
    const f = new PDFFormFiller();
    f.pdfkit = null;
    f.seedIsraeliForms();
    const { pdf } = f.fillForm({
      templateName: 'tofes-101',
      data: EMPLOYEE_HE,
      options: { flatten: true },
    });
    assert.ok(pdf.toString('latin1').includes('/Flattened true'));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// coordinateLookup
// ═════════════════════════════════════════════════════════════════════════════

describe('coordinateLookup', () => {
  test('returns seeded template even without explicit load', () => {
    const f = new PDFFormFiller();
    const { template } = f.coordinateLookup({ formName: 'tofes-161' });
    assert.ok(template);
    assert.equal(template.name, 'tofes-161');
  });

  test('returns null for unknown form name', () => {
    const f = new PDFFormFiller();
    const { template } = f.coordinateLookup({ formName: 'no-such-form' });
    assert.equal(template, null);
  });

  test('extracts coordinates from a stub PDF', () => {
    const f = new PDFFormFiller();
    f.pdfkit = null;
    f.seedIsraeliForms();
    const { pdf } = f.fillForm({
      templateName: 'tofes-101',
      data: { employee_name: 'Kobi', tax_year: 2026 },
    });
    const res = f.coordinateLookup({ formName: 'tofes-101', pdfBuffer: pdf });
    assert.ok(res.extractedFromPdf.length > 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Integration: seed → fill → flatten → coordinateLookup
// ═════════════════════════════════════════════════════════════════════════════

describe('integration — end-to-end pipeline', () => {
  test('fills PCN836 VAT report and flattens output', () => {
    const f = new PDFFormFiller();
    f.seedIsraeliForms();
    const data = {
      vat_file_number: '516123456',
      period: '2026-03',
      business_name: 'טכנו קול עוזי בע"מ',
      sales_total: 1500000,
      vat_output: 270000,
      purchases_total: 800000,
      vat_input_equipment: 90000,
      vat_input_other: 54000,
      net_vat_due: 126000,
      exempt_sales: 0,
      export_sales: 250000,
    };
    const { pdf } = f.fillForm({
      templateName: 'pcn836',
      data,
      options: { flatten: true },
    });
    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.toString('latin1').startsWith('%PDF-'));
  });

  test('fills all 7 seeded forms without throwing', () => {
    const f = new PDFFormFiller();
    const seeded = f.seedIsraeliForms();
    for (const name of seeded) {
      const { pdf } = f.fillForm({ templateName: name, data: {} });
      assert.ok(Buffer.isBuffer(pdf), `${name} should produce a buffer`);
    }
  });
});
