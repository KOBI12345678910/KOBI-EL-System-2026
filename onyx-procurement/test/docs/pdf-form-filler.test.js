/**
 * Unit tests for PDFFormFiller — programmatic AcroForm filler
 * Agent Y-120 — written 2026-04-11
 *
 * Run:   node --test test/docs/pdf-form-filler.test.js
 *
 * Coverage (>=18 tests):
 *   01. parseForm — JSON object descriptor round-trips
 *   02. parseForm — JSON string descriptor
 *   03. parseForm — plain-text descriptor
 *   04. parseForm — Buffer input
 *   05. parseForm — rejects missing fields array
 *   06. parseForm — rejects unknown field type
 *   07. parseForm — rejects invalid rect
 *   08. parseForm — rejects duplicate field names
 *   09. getFieldNames — returns names in descriptor order
 *   10. validateFieldTypes — accepts valid values
 *   11. validateFieldTypes — rejects wrong types
 *   12. fillForm — text + number + checkbox + date + signature
 *   13. fillForm — required field missing throws
 *   14. fillForm — dropdown value outside options throws
 *   15. fillForm — date coercion from Date object
 *   16. fillForm — produces stable hash for identical values
 *   17. flattenForm — marks flattened=true and keeps fields
 *   18. generatePDFBuffer — valid %PDF-1.4 header + %%EOF trailer
 *   19. generatePDFBuffer — contains xref and startxref
 *   20. extractFormData — reverses fill back to data dict
 *   21. localizeFieldLabels — he / en / both
 *   22. localizeFieldLabels — unknown lang throws
 *   23. templateRegistry — has all 6 Israeli forms
 *   24. templateRegistry — frozen (immutable)
 *   25. fillTemplate — form101 end-to-end
 *   26. fillTemplate — form161 end-to-end
 *   27. fillTemplate — unknown template throws
 *   28. listTemplates — returns bilingual summary
 *   29. checkbox truthy/falsy coercion
 *   30. radio value validation
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PDFFormFiller,
  FIELD_TYPES,
  FORM_FAMILIES,
  TEMPLATE_REGISTRY,
  pdfEscapeString,
  pdfAsciiSafe,
  isValidDateString,
  isValidRect,
  normalizeForm,
  validateFormShape,
  generatePDFBuffer,
} = require('../../src/docs/pdf-form-filler');

/* ---------- shared fixture ---------- */

function sampleForm() {
  return {
    meta: { id: 'sample', he: 'טופס לדוגמה', en: 'Sample form', version: '1.0', pageSize: { w: 595, h: 842 } },
    fields: [
      { name: 'fullName',  type: 'text',     rect: [50, 800, 200, 24], required: true,  label: { he: 'שם מלא',       en: 'Full name' } },
      { name: 'age',       type: 'number',   rect: [50, 770, 100, 24], required: true,  label: { he: 'גיל',           en: 'Age' } },
      { name: 'isMember',  type: 'checkbox', rect: [50, 740, 24,  24], required: false, label: { he: 'חבר',           en: 'Member' } },
      { name: 'startDate', type: 'date',     rect: [50, 710, 150, 24], required: false, label: { he: 'תאריך התחלה',  en: 'Start date' } },
      { name: 'color',     type: 'dropdown', rect: [50, 680, 150, 24], required: false, label: { he: 'צבע',            en: 'Color' }, options: ['red', 'green', 'blue'] },
      { name: 'sig',       type: 'signature',rect: [50, 100, 200, 50], required: false, label: { he: 'חתימה',          en: 'Signature' } },
    ],
  };
}

/* ---------- 01-08: parseForm ---------- */

test('01 parseForm — JSON object descriptor round-trips', () => {
  const filler = new PDFFormFiller();
  const f = sampleForm();
  const out = filler.parseForm(f);
  assert.equal(out.meta.id, 'sample');
  assert.equal(out.fields.length, 6);
  // Ensure it is a *clone* — mutating output must not touch input
  out.fields[0].name = 'mutated';
  assert.equal(f.fields[0].name, 'fullName');
});

test('02 parseForm — JSON string descriptor', () => {
  const filler = new PDFFormFiller();
  const s = JSON.stringify(sampleForm());
  const out = filler.parseForm(s);
  assert.equal(out.meta.id, 'sample');
  assert.equal(out.fields[1].name, 'age');
});

test('03 parseForm — plain-text descriptor', () => {
  const filler = new PDFFormFiller();
  const txt = [
    '# sample plain-text form',
    'meta: id=plainSample, version=2026-01, w=595, h=842, he="דוגמה", en="Plain sample"',
    'field: fullName|text|50,800,200,24|שם מלא|Full name|required',
    'field: age|number|50,770,100,24|גיל|Age',
    'field: color|dropdown|50,680,150,24|צבע|Color|options=red,green,blue',
  ].join('\n');
  const out = filler.parseForm(txt);
  assert.equal(out.meta.id, 'plainSample');
  assert.equal(out.fields.length, 3);
  assert.equal(out.fields[0].required, true);
  assert.deepEqual(out.fields[2].options, ['red', 'green', 'blue']);
});

test('04 parseForm — Buffer input', () => {
  const filler = new PDFFormFiller();
  const buf = Buffer.from(JSON.stringify(sampleForm()), 'utf8');
  const out = filler.parseForm(buf);
  assert.equal(out.meta.id, 'sample');
});

test('05 parseForm — rejects missing fields array', () => {
  const filler = new PDFFormFiller();
  assert.throws(
    () => filler.parseForm({ meta: { id: 'bad' } }),
    /FORM_FIELDS_NOT_ARRAY/
  );
});

test('06 parseForm — rejects unknown field type', () => {
  const filler = new PDFFormFiller();
  const bad = {
    meta: { id: 'bad' },
    fields: [{ name: 'x', type: 'hologram', rect: [0, 0, 10, 10] }],
  };
  assert.throws(() => filler.parseForm(bad), /FIELD_TYPE_UNKNOWN/);
});

test('07 parseForm — rejects invalid rect', () => {
  const filler = new PDFFormFiller();
  const bad = {
    meta: { id: 'bad' },
    fields: [{ name: 'x', type: 'text', rect: [0, 0, -5, 10] }],
  };
  assert.throws(() => filler.parseForm(bad), /FIELD_RECT_INVALID/);
});

test('08 parseForm — rejects duplicate field names', () => {
  const filler = new PDFFormFiller();
  const bad = {
    meta: { id: 'bad' },
    fields: [
      { name: 'x', type: 'text', rect: [0, 0, 10, 10] },
      { name: 'x', type: 'number', rect: [0, 0, 10, 10] },
    ],
  };
  assert.throws(() => filler.parseForm(bad), /FIELD_NAME_DUPLICATE/);
});

/* ---------- 09: getFieldNames ---------- */

test('09 getFieldNames — returns names in descriptor order', () => {
  const filler = new PDFFormFiller();
  const names = filler.getFieldNames(sampleForm());
  assert.deepEqual(names, ['fullName', 'age', 'isMember', 'startDate', 'color', 'sig']);
});

/* ---------- 10-11: validateFieldTypes ---------- */

test('10 validateFieldTypes — accepts valid values', () => {
  const filler = new PDFFormFiller();
  const form = sampleForm();
  const results = filler.validateFieldTypes(form.fields, {
    fullName: 'Kobi', age: 45, isMember: true, startDate: '2026-04-11', color: 'red',
  });
  for (const r of results) assert.equal(r.ok, true, `${r.field} should be ok but: ${r.reason}`);
});

test('11 validateFieldTypes — rejects wrong types', () => {
  const filler = new PDFFormFiller();
  const form = sampleForm();
  const results = filler.validateFieldTypes(form.fields, {
    fullName: 'Kobi', age: 'not-a-number', isMember: 'maybe', startDate: '2026-13-99', color: 'purple',
  });
  const byName = Object.fromEntries(results.map(r => [r.field, r]));
  assert.equal(byName.age.ok, false);
  assert.match(byName.age.reason, /TYPE_MISMATCH/);
  assert.equal(byName.isMember.ok, false);
  assert.equal(byName.startDate.ok, false);
  assert.equal(byName.color.ok, false);
  assert.match(byName.color.reason, /DROPDOWN_VALUE_UNKNOWN/);
});

/* ---------- 12-16: fillForm ---------- */

test('12 fillForm — text + number + checkbox + date + signature', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillForm({
    form: sampleForm(),
    values: {
      fullName: 'קובי אל',
      age: 45,
      isMember: true,
      startDate: '2026-04-11',
      color: 'green',
      sig: 'Kobi El',
    },
  });
  assert.equal(filled.fields[0].value, 'קובי אל');
  assert.equal(filled.fields[1].value, 45);
  assert.equal(filled.fields[2].value, true);
  assert.equal(filled.fields[3].value, '2026-04-11');
  assert.equal(filled.fields[4].value, 'green');
  assert.equal(filled.fields[5].value, 'Kobi El');
  assert.equal(filled.flattened, false);
  assert.equal(typeof filled.hash, 'string');
  assert.equal(filled.hash.length, 64);
});

test('13 fillForm — required field missing throws', () => {
  const filler = new PDFFormFiller();
  assert.throws(
    () => filler.fillForm({ form: sampleForm(), values: { age: 30 } }),
    /REQUIRED_FIELD_MISSING: fullName/
  );
});

test('14 fillForm — dropdown value outside options throws', () => {
  const filler = new PDFFormFiller();
  assert.throws(
    () => filler.fillForm({
      form: sampleForm(),
      values: { fullName: 'x', age: 1, color: 'octarine' },
    }),
    /DROPDOWN_VALUE_UNKNOWN: color=octarine/
  );
});

test('15 fillForm — date coercion from Date object', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillForm({
    form: sampleForm(),
    values: { fullName: 'A', age: 1, startDate: new Date('2026-04-11T00:00:00Z') },
  });
  assert.equal(filled.fields[3].value, '2026-04-11');
});

test('16 fillForm — produces stable hash for identical values', () => {
  const filler = new PDFFormFiller();
  const values = { fullName: 'Kobi', age: 45, color: 'red' };
  const a = filler.fillForm({ form: sampleForm(), values });
  const b = filler.fillForm({ form: sampleForm(), values });
  assert.equal(a.hash, b.hash);
});

/* ---------- 17: flattenForm ---------- */

test('17 flattenForm — marks flattened=true and keeps fields', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillForm({
    form: sampleForm(),
    values: { fullName: 'Kobi', age: 45, isMember: true },
  });
  const flat = filler.flattenForm(filled);
  assert.equal(flat.flattened, true);
  assert.equal(flat.fields.length, filled.fields.length, 'fields preserved, nothing deleted');
  assert.equal(flat.staticLines.length, filled.fields.length);
  const byName = Object.fromEntries(flat.staticLines.map(l => [l.name, l]));
  assert.equal(byName.isMember.rendered, 'Yes');
  assert.equal(byName.isMember.readOnly, true);
  assert.equal(byName.fullName.rendered, 'Kobi');
});

/* ---------- 18-19: generatePDFBuffer ---------- */

test('18 generatePDFBuffer — valid %PDF-1.4 header + %%EOF trailer', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillForm({
    form: sampleForm(),
    values: { fullName: 'Kobi', age: 45, color: 'red' },
  });
  const buf = filler.generatePDFBuffer(filled);
  assert.ok(Buffer.isBuffer(buf), 'returns a Buffer');
  const head = buf.slice(0, 8).toString('latin1');
  assert.equal(head, '%PDF-1.4');
  const tail = buf.slice(-6).toString('latin1');
  assert.equal(tail, '%%EOF\n');
});

test('19 generatePDFBuffer — contains xref, startxref and all 5 objects', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillForm({
    form: sampleForm(),
    values: { fullName: 'Kobi', age: 45 },
  });
  const buf = filler.generatePDFBuffer(filled);
  const s = buf.toString('latin1');
  assert.ok(s.includes('xref'),     'must contain xref table');
  assert.ok(s.includes('startxref'),'must contain startxref');
  assert.ok(s.includes('trailer'),  'must contain trailer');
  assert.ok(s.includes('/Catalog'), 'catalog obj present');
  assert.ok(s.includes('/Pages'),   'pages obj present');
  assert.ok(s.includes('/Font'),    'font obj present');
  assert.ok(s.includes('BT'),       'content stream BT present');
  assert.ok(s.includes('ET'),       'content stream ET present');
});

/* ---------- 20: extractFormData ---------- */

test('20 extractFormData — reverses fill back to data dict', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillForm({
    form: sampleForm(),
    values: {
      fullName: 'Kobi', age: 45, isMember: false, startDate: '2026-04-11', color: 'blue', sig: 'k',
    },
  });
  const data = filler.extractFormData(filled);
  assert.deepEqual(data, {
    fullName: 'Kobi',
    age: 45,
    isMember: false,
    startDate: '2026-04-11',
    color: 'blue',
    sig: 'k',
  });
});

/* ---------- 21-22: localizeFieldLabels ---------- */

test('21 localizeFieldLabels — he / en / both', () => {
  const filler = new PDFFormFiller();
  const he = filler.localizeFieldLabels(sampleForm(), 'he');
  const en = filler.localizeFieldLabels(sampleForm(), 'en');
  const both = filler.localizeFieldLabels(sampleForm(), 'both');
  assert.equal(he.fields[0].displayLabel, 'שם מלא');
  assert.equal(en.fields[0].displayLabel, 'Full name');
  assert.equal(both.fields[0].displayLabel, 'שם מלא / Full name');
  assert.equal(he.localizedLang, 'he');
  assert.equal(en.localizedLang, 'en');
  assert.equal(both.localizedLang, 'both');
});

test('22 localizeFieldLabels — unknown lang throws', () => {
  const filler = new PDFFormFiller();
  assert.throws(
    () => filler.localizeFieldLabels(sampleForm(), 'klingon'),
    /LANG_UNKNOWN: klingon/
  );
});

/* ---------- 23-24: templateRegistry ---------- */

test('23 templateRegistry — has all 6 Israeli forms', () => {
  const filler = new PDFFormFiller();
  const ids = Object.keys(filler.templateRegistry).sort();
  assert.deepEqual(ids, ['form101', 'form102', 'form106', 'form126', 'form1301', 'form161']);
  // Each must carry bilingual meta + at least one field.
  for (const id of ids) {
    const t = filler.templateRegistry[id];
    assert.ok(t.meta.he && t.meta.en, `${id} missing bilingual meta`);
    assert.ok(Array.isArray(t.fields) && t.fields.length > 0, `${id} has no fields`);
    assert.ok(t.meta.authority, `${id} missing authority`);
  }
});

test('24 templateRegistry — frozen (immutable)', () => {
  assert.ok(Object.isFrozen(TEMPLATE_REGISTRY));
  assert.ok(Object.isFrozen(TEMPLATE_REGISTRY.form101));
  assert.ok(Object.isFrozen(TEMPLATE_REGISTRY.form101.meta));
  assert.throws(() => { TEMPLATE_REGISTRY.form101 = null; }, TypeError);
});

/* ---------- 25-27: fillTemplate ---------- */

test('25 fillTemplate — form101 end-to-end', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillTemplate('form101', {
    fullName: 'משה כהן',
    idNumber: '123456789',
    birthDate: '1980-05-15',
    address: 'רחוב הרצל 10, תל אביב',
    maritalStatus: 'married',
    numChildren: 3,
    residentIL: true,
    requestCredit: true,
    employeeSig: 'Moshe Cohen',
  });
  assert.equal(filled.meta.id, 'form101');
  assert.equal(filled.fields.find(f => f.name === 'fullName').value, 'משה כהן');
  assert.equal(filled.fields.find(f => f.name === 'numChildren').value, 3);
  assert.equal(filled.fields.find(f => f.name === 'residentIL').value, true);
  // The original template must not have been mutated.
  assert.equal(TEMPLATE_REGISTRY.form101.fields[0].value, undefined);
});

test('26 fillTemplate — form161 end-to-end', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillTemplate('form161', {
    employeeName: 'Sara Levi',
    employeeId: '987654321',
    employerName: 'Techno-Kol Uzi',
    retirementDate: '2026-03-31',
    yearsOfService: 25,
    severanceAmt: 450000,
    reason: 'retirement',
    continuityReq: false,
  });
  assert.equal(filled.meta.id, 'form161');
  assert.equal(filled.fields.find(f => f.name === 'severanceAmt').value, 450000);
  assert.equal(filled.fields.find(f => f.name === 'reason').value, 'retirement');
});

test('27 fillTemplate — unknown template throws', () => {
  const filler = new PDFFormFiller();
  assert.throws(() => filler.fillTemplate('form9999', {}), /TEMPLATE_UNKNOWN/);
});

/* ---------- 28: listTemplates ---------- */

test('28 listTemplates — returns bilingual summary', () => {
  const filler = new PDFFormFiller();
  const list = filler.listTemplates();
  assert.equal(list.length, 6);
  const form101 = list.find(t => t.id === 'form101');
  assert.equal(form101.he, 'טופס 101');
  assert.equal(form101.en, 'Form 101');
  assert.ok(form101.fieldCount > 0);
});

/* ---------- 29-30: extra validation edges ---------- */

test('29 checkbox truthy/falsy coercion', () => {
  const filler = new PDFFormFiller();
  const form = {
    meta: { id: 'cb' },
    fields: [
      { name: 'a', type: 'checkbox', rect: [0, 0, 10, 10], required: false, label: { he: 'א', en: 'A' } },
      { name: 'b', type: 'checkbox', rect: [0, 0, 10, 10], required: false, label: { he: 'ב', en: 'B' } },
      { name: 'c', type: 'checkbox', rect: [0, 0, 10, 10], required: false, label: { he: 'ג', en: 'C' } },
      { name: 'd', type: 'checkbox', rect: [0, 0, 10, 10], required: false, label: { he: 'ד', en: 'D' } },
    ],
  };
  const filled = filler.fillForm({
    form,
    values: { a: 'Yes', b: 'No', c: 1, d: 0 },
  });
  assert.equal(filled.fields[0].value, true);
  assert.equal(filled.fields[1].value, false);
  assert.equal(filled.fields[2].value, true);
  assert.equal(filled.fields[3].value, false);
});

test('30 radio value validation', () => {
  const filler = new PDFFormFiller();
  const form = {
    meta: { id: 'radio' },
    fields: [
      { name: 'pick', type: 'radio', rect: [0, 0, 10, 10], required: true, label: { he: 'בחר', en: 'Pick' }, options: ['one', 'two', 'three'] },
    ],
  };
  const good = filler.fillForm({ form, values: { pick: 'two' } });
  assert.equal(good.fields[0].value, 'two');
  assert.throws(
    () => filler.fillForm({ form, values: { pick: 'nine' } }),
    /RADIO_VALUE_UNKNOWN/
  );
});

/* ---------- 31: helper exports ---------- */

test('31 helper exports — pdfEscapeString, isValidDateString, isValidRect', () => {
  assert.equal(pdfEscapeString('a(b)c\\d'), 'a\\(b\\)c\\\\d');
  assert.equal(pdfAsciiSafe('קובי Kobi'), '???? Kobi');
  assert.equal(isValidDateString('2026-04-11'), true);
  assert.equal(isValidDateString('2026-02-30'), false);
  assert.equal(isValidDateString('not a date'), false);
  assert.equal(isValidRect([0, 0, 100, 200]), true);
  assert.equal(isValidRect([0, 0, -1, 200]), false);
  assert.equal(isValidRect('nope'), false);
});

/* ---------- 32: flattened still rendered to PDF ---------- */

test('32 generatePDFBuffer — works on flattened form too', () => {
  const filler = new PDFFormFiller();
  const filled = filler.fillForm({
    form: sampleForm(),
    values: { fullName: 'Kobi', age: 45 },
  });
  const flat = filler.flattenForm(filled);
  const buf = filler.generatePDFBuffer(flat);
  assert.ok(buf.toString('latin1').startsWith('%PDF-1.4'));
  assert.ok(buf.toString('latin1').endsWith('%%EOF\n'));
});
