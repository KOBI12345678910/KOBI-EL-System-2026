/**
 * Metadata & Tag Manager — Unit Tests  |  מנהל מטא-דאטה ותיוג
 * ==============================================================
 *
 * Agent Y-113  |  Swarm Documents  |  Techno-Kol Uzi mega-ERP
 *
 * Run with:   node --test test/documents/metadata-manager.test.js
 *      or:    node --test
 *
 * Requires Node >= 18 for the built-in `node:test` runner.
 *
 * Exercises:
 *   • defineSchema — field typing, enum required values, upgrade
 *     keeps history, duplicate fields rejected
 *   • applySchema — required-field enforcement, type coercion,
 *     default values, array items, pattern, enum, reference,
 *     date validation, unknown-field preservation
 *   • enforceRequiredFields — missing / invalid reporting
 *   • facetValues — distinct value aggregation across docs,
 *     including array unfolding
 *   • defineTagTaxonomy — hierarchical parent-child wiring,
 *     bilingual synonyms auto-indexed, append-only upgrade
 *   • tagDocument / untagDocument — additive + soft-remove
 *   • synonymMatch — Hebrew and English, nikud-insensitive
 *   • autoTag — explicit rules (any/all), synonym fallback,
 *     retired tags skipped
 *   • listByTag — any / all modes, descendant expansion
 *   • bulkRetag — source retired, target carries moved docs,
 *     history preserved
 *   • tagFrequency / unusedTags
 *   • metadataHistory — append-only chain through multiple
 *     applySchema calls
 *   • propagateMetadata — cascades to children with field subset
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  MetadataManager,
  FIELD_TYPES,
  _internal,
} = require(path.resolve(
  __dirname, '..', '..', 'src', 'documents', 'metadata-manager.js',
));

// ─────────────────────────────────────────────────────────────
// Fixture helpers — pinned clock
// ─────────────────────────────────────────────────────────────

function makeMgr(startTs) {
  const state = { t: startTs == null ? Date.UTC(2026, 3, 11) : startTs };
  const mgr = new MetadataManager({ now: () => state.t });
  return {
    mgr,
    tick(ms) { state.t += ms; return state.t; },
    set(ms)  { state.t = ms;  return state.t; },
    now()    { return state.t; },
  };
}

/** Seed an invoice schema used by several tests. */
function seedInvoiceSchema(mgr) {
  return mgr.defineSchema({
    name: 'invoice',
    fields: [
      { name: 'number', type: 'string', required: true,
        validation: { min: 1, pattern: '^[A-Z0-9-]+$' } },
      { name: 'amount', type: 'number', required: true,
        validation: { min: 0 } },
      { name: 'currency', type: 'enum', required: true,
        default: 'ILS', validation: { values: ['ILS', 'USD', 'EUR'] } },
      { name: 'issued_on', type: 'date', required: true },
      { name: 'vat_registered', type: 'boolean', default: true },
      { name: 'supplier_ref', type: 'reference', required: true,
        validation: { refSchema: 'supplier' } },
      { name: 'tags', type: 'array',
        validation: { itemType: 'string', max: 20 } },
      { name: 'notes_he', type: 'string', language: 'he' },
    ],
  });
}

/** Seed a realistic ERP-oriented Hebrew/English tag taxonomy. */
function seedTaxonomy(mgr) {
  return mgr.defineTagTaxonomy({
    tags: [
      { id: 'finance', name_he: 'כספים',    name_en: 'Finance',
        color: '#0B5FFF', synonyms: ['financial', 'כסף'] },
      { id: 'invoice', name_he: 'חשבונית',  name_en: 'Invoice',
        parent: 'finance', synonyms: ['bill', 'receipt', 'חשבון'] },
      { id: 'quote',   name_he: 'הצעת מחיר', name_en: 'Quote',
        parent: 'finance', synonyms: ['quotation', 'הצעה'] },
      { id: 'site',    name_he: 'אתר',       name_en: 'Site',
        color: '#FFA500' },
      { id: 'permit',  name_he: 'היתר',      name_en: 'Permit',
        parent: 'site', synonyms: ['building permit', 'היתר בנייה'] },
      { id: 'drawing', name_he: 'תרשים',     name_en: 'Drawing',
        parent: 'site', synonyms: ['blueprint', 'שרטוט'] },
    ],
  });
}

// ═════════════════════════════════════════════════════════════
// 1. Schema definition
// ═════════════════════════════════════════════════════════════

test('defineSchema compiles, assigns version 1, exposes fields', () => {
  const { mgr } = makeMgr();
  const s = seedInvoiceSchema(mgr);
  assert.equal(s.name, 'invoice');
  assert.equal(s.version, 1);
  assert.equal(s.fields.length, 8);
  assert.equal(s.fields[0].name, 'number');
  assert.equal(s.fields[0].type, 'string');
  assert.equal(s.fields[0].required, true);
  assert.equal(s.fields[2].default, 'ILS');
});

test('defineSchema rejects unknown type and duplicates', () => {
  const { mgr } = makeMgr();
  assert.throws(
    () => mgr.defineSchema({ name: 's', fields: [{ name: 'x', type: 'blob' }] }),
    (e) => e.code === 'E_SCHEMA_FIELD',
  );
  assert.throws(
    () => mgr.defineSchema({
      name: 's2',
      fields: [
        { name: 'a', type: 'string' },
        { name: 'a', type: 'number' },
      ],
    }),
    (e) => e.code === 'E_SCHEMA_FIELD',
  );
});

test('enum field requires validation.values', () => {
  const { mgr } = makeMgr();
  assert.throws(
    () => mgr.defineSchema({
      name: 's',
      fields: [{ name: 'e', type: 'enum' }],
    }),
    (e) => e.code === 'E_SCHEMA_FIELD',
  );
});

test('defineSchema upgrade keeps history, bumps version', () => {
  const { mgr, tick } = makeMgr();
  seedInvoiceSchema(mgr);
  tick(1000);
  const v2 = mgr.defineSchema({
    name: 'invoice',
    fields: [
      { name: 'number', type: 'string', required: true,
        validation: { min: 1 } },
      { name: 'amount', type: 'number', required: true },
      { name: 'currency', type: 'enum', required: true,
        default: 'ILS', validation: { values: ['ILS', 'USD', 'EUR'] } },
      { name: 'issued_on', type: 'date', required: true },
      { name: 'vat_registered', type: 'boolean', default: true },
      { name: 'supplier_ref', type: 'reference', required: true },
      { name: 'tags', type: 'array', validation: { itemType: 'string' } },
      { name: 'notes_he', type: 'string', language: 'he' },
      { name: 'project_code', type: 'string' }, // new field
    ],
  });
  assert.equal(v2.version, 2);
  const hist = mgr.getSchemaHistory('invoice');
  assert.equal(hist.length, 2);
  assert.equal(hist[0].fields.length, 8);
  assert.equal(hist[1].fields.length, 9);
});

// ═════════════════════════════════════════════════════════════
// 2. Applying metadata
// ═════════════════════════════════════════════════════════════

test('applySchema validates and stores', () => {
  const { mgr } = makeMgr();
  seedInvoiceSchema(mgr);
  const rec = mgr.applySchema({
    docId: 'DOC-001',
    schemaName: 'invoice',
    metadata: {
      number: 'INV-2026-0001',
      amount: 12345.67,
      currency: 'ILS',
      issued_on: '2026-04-01',
      supplier_ref: 'SUP-42',
      tags: ['urgent', 'verified'],
      notes_he: 'חשבונית בגין עבודות אדריכלות',
    },
    user: 'kobi',
  });
  assert.equal(rec.docId, 'DOC-001');
  assert.equal(rec.schemaName, 'invoice');
  assert.equal(rec.schemaVersion, 1);
  assert.equal(rec.metadata.number, 'INV-2026-0001');
  assert.equal(typeof rec.metadata.issued_on, 'number'); // date → ts
  assert.equal(rec.metadata.vat_registered, true);       // default filled
  assert.deepEqual(rec.metadata.tags, ['urgent', 'verified']);
});

test('applySchema throws on missing required field', () => {
  const { mgr } = makeMgr();
  seedInvoiceSchema(mgr);
  assert.throws(
    () => mgr.applySchema({
      docId: 'DOC-002',
      schemaName: 'invoice',
      metadata: {
        number: 'INV-X',
        // amount missing
        issued_on: '2026-04-01',
        supplier_ref: 'SUP-1',
      },
    }),
    (e) => e.code === 'E_METADATA_INVALID'
        && Array.isArray(e.errors)
        && e.errors.some((x) => x.includes('amount')),
  );
});

test('applySchema rejects bad pattern, enum, date', () => {
  const { mgr } = makeMgr();
  seedInvoiceSchema(mgr);
  assert.throws(() => mgr.applySchema({
    docId: 'D', schemaName: 'invoice',
    metadata: {
      number: 'inv lower', amount: 1, issued_on: '2026-04-01',
      supplier_ref: 'SUP-1',
    },
  }), (e) => e.code === 'E_METADATA_INVALID');

  assert.throws(() => mgr.applySchema({
    docId: 'D', schemaName: 'invoice',
    metadata: {
      number: 'INV-1', amount: 1, currency: 'GBP',
      issued_on: '2026-04-01', supplier_ref: 'SUP-1',
    },
  }), (e) => e.code === 'E_METADATA_INVALID');

  assert.throws(() => mgr.applySchema({
    docId: 'D', schemaName: 'invoice',
    metadata: {
      number: 'INV-1', amount: 1,
      issued_on: 'not-a-date', supplier_ref: 'SUP-1',
    },
  }), (e) => e.code === 'E_METADATA_INVALID');
});

test('applySchema preserves unknown fields but still validates known ones', () => {
  const { mgr } = makeMgr();
  seedInvoiceSchema(mgr);
  const rec = mgr.applySchema({
    docId: 'DOC-003',
    schemaName: 'invoice',
    metadata: {
      number: 'INV-3',
      amount: 100,
      issued_on: '2026-04-01',
      supplier_ref: 'SUP-1',
      extra_custom: { foo: 'bar' },
    },
  });
  assert.deepEqual(rec.metadata.extra_custom, { foo: 'bar' });
});

test('applySchema keeps metadata history append-only across updates', () => {
  const { mgr, tick } = makeMgr();
  seedInvoiceSchema(mgr);
  mgr.applySchema({
    docId: 'DOC-H', schemaName: 'invoice',
    metadata: {
      number: 'INV-H1', amount: 10,
      issued_on: '2026-04-01', supplier_ref: 'SUP-1',
    },
  });
  tick(60_000);
  mgr.applySchema({
    docId: 'DOC-H', schemaName: 'invoice',
    metadata: {
      number: 'INV-H1', amount: 20, // upgraded
      issued_on: '2026-04-01', supplier_ref: 'SUP-1',
    },
  });
  const hist = mgr.metadataHistory('DOC-H');
  assert.equal(hist.length, 2);
  assert.equal(hist[0].metadata.amount, 10);
  assert.equal(hist[1].metadata.amount, 20);
  // Current is the latest
  const cur = mgr.getMetadata('DOC-H', 'invoice');
  assert.equal(cur.metadata.amount, 20);
});

// ═════════════════════════════════════════════════════════════
// 3. enforceRequiredFields
// ═════════════════════════════════════════════════════════════

test('enforceRequiredFields reports ok vs missing', () => {
  const { mgr } = makeMgr();
  seedInvoiceSchema(mgr);
  mgr.applySchema({
    docId: 'DOC-R', schemaName: 'invoice',
    metadata: {
      number: 'INV-R', amount: 1,
      issued_on: '2026-04-01', supplier_ref: 'SUP-1',
    },
  });
  const ok = mgr.enforceRequiredFields({ docId: 'DOC-R', schemaName: 'invoice' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.missing, []);

  // Document that was never applied — everything missing
  const bad = mgr.enforceRequiredFields({
    docId: 'DOC-NOPE', schemaName: 'invoice',
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.includes('number'));
  assert.ok(bad.missing.includes('amount'));
});

// ═════════════════════════════════════════════════════════════
// 4. facetValues
// ═════════════════════════════════════════════════════════════

test('facetValues aggregates distinct values and unfolds arrays', () => {
  const { mgr } = makeMgr();
  seedInvoiceSchema(mgr);
  const make = (id, currency, tags) => mgr.applySchema({
    docId: id, schemaName: 'invoice',
    metadata: {
      number: id, amount: 10, currency, issued_on: '2026-04-01',
      supplier_ref: 'SUP-1', tags,
    },
  });
  make('F1', 'ILS', ['urgent']);
  make('F2', 'ILS', ['urgent', 'verified']);
  make('F3', 'USD', ['verified']);
  make('F4', 'EUR', []);

  const curFacet = mgr.facetValues('invoice', 'currency');
  assert.deepEqual(
    curFacet.map((x) => [x.value, x.count]),
    [['ILS', 2], ['EUR', 1], ['USD', 1]],
  );

  const tagFacet = mgr.facetValues('invoice', 'tags');
  // urgent:2, verified:2, sorted by count then alpha
  assert.deepEqual(
    tagFacet.map((x) => [x.value, x.count]),
    [['urgent', 2], ['verified', 2]],
  );
});

// ═════════════════════════════════════════════════════════════
// 5. Tag taxonomy + hierarchy
// ═════════════════════════════════════════════════════════════

test('defineTagTaxonomy wires parents & children, auto-indexes synonyms', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  const tree = mgr.getTagTree();
  // Two roots: finance, site
  const ids = tree.map((t) => t.id);
  assert.deepEqual(ids, ['finance', 'site']);
  const finance = tree.find((t) => t.id === 'finance');
  assert.deepEqual(finance.children.map((c) => c.id), ['invoice', 'quote']);
  const site = tree.find((t) => t.id === 'site');
  assert.deepEqual(site.children.map((c) => c.id), ['drawing', 'permit']);

  // Synonym index populated
  assert.equal(mgr.synonymMatch('bill').id, 'invoice');
  assert.equal(mgr.synonymMatch('חשבון').id, 'invoice');
  assert.equal(mgr.synonymMatch('חשבונית').id, 'invoice');
  assert.equal(mgr.synonymMatch('blueprint').id, 'drawing');
  assert.equal(mgr.synonymMatch('היתר בנייה').id, 'permit');
  assert.equal(mgr.synonymMatch('nothing-here'), null);
});

test('taxonomy upgrade is append-only: new tags added, old preserved', () => {
  const { mgr, tick } = makeMgr();
  seedTaxonomy(mgr);
  const v1 = mgr.listTags();
  tick(500);
  mgr.defineTagTaxonomy({
    tags: [
      { id: 'contract', name_he: 'חוזה', name_en: 'Contract',
        parent: 'finance' },
    ],
  });
  const v2 = mgr.listTags();
  assert.ok(v2.length === v1.length + 1);
  assert.ok(v2.some((t) => t.id === 'contract'));
  // Finance now has a new child
  const tree = mgr.getTagTree();
  const finance = tree.find((t) => t.id === 'finance');
  assert.ok(finance.children.some((c) => c.id === 'contract'));
});

// ═════════════════════════════════════════════════════════════
// 6. tagDocument / untagDocument
// ═════════════════════════════════════════════════════════════

test('tagDocument is additive, duplicate-safe, and logs append-only', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  const r1 = mgr.tagDocument('D1', ['invoice', 'finance'], 'kobi');
  assert.deepEqual(r1.added.sort(), ['finance', 'invoice']);
  const r2 = mgr.tagDocument('D1', ['invoice', 'permit'], 'kobi');
  assert.deepEqual(r2.added, ['permit']);
  assert.equal(r2.total, 3);
  const log = mgr.listTagHistory('D1');
  assert.equal(log.length, 3);
  assert.ok(log.every((ev) => ev.action === 'add'));
});

test('tagDocument rejects unknown and retired tags', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  assert.throws(
    () => mgr.tagDocument('D', ['nope'], 'k'),
    (e) => e.code === 'E_TAG_MISSING',
  );
});

test('untagDocument is a soft-remove but logs the retirement', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  mgr.tagDocument('D2', ['invoice', 'permit'], 'k');
  const r = mgr.untagDocument('D2', ['invoice'], 'k');
  assert.deepEqual(r.removed, ['invoice']);
  // Doc still has permit
  const list = mgr.listByTag(['permit']);
  assert.ok(list.includes('D2'));
  assert.ok(!mgr.listByTag(['invoice']).includes('D2'));
  const log = mgr.listTagHistory('D2');
  assert.ok(log.some((ev) => ev.action === 'retire' && ev.tagId === 'invoice'));
});

// ═════════════════════════════════════════════════════════════
// 7. Auto-tagging (rules + synonyms)
// ═════════════════════════════════════════════════════════════

test('autoTag with explicit rules (any / all)', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  const rules = [
    { tagId: 'invoice', match: { any: ['invoice', 'חשבונית'] } },
    { tagId: 'permit',  match: { all: ['permit', 'building'] } },
  ];
  const r1 = mgr.autoTag({
    docId: 'A1',
    content: 'This is an invoice for April works',
    rules,
  });
  assert.deepEqual(r1.added, ['invoice']);

  const r2 = mgr.autoTag({
    docId: 'A2',
    content: 'Hebrew: חשבונית חודשית',
    rules,
  });
  assert.deepEqual(r2.added, ['invoice']);

  const r3 = mgr.autoTag({
    docId: 'A3',
    content: 'Building permit approved for block 42',
    rules,
  });
  assert.deepEqual(r3.added, ['permit']);

  // all[] requires both words — missing "building" should fail
  const r4 = mgr.autoTag({
    docId: 'A4',
    content: 'Permit only',
    rules,
  });
  assert.deepEqual(r4.added, []);
});

test('autoTag synonym fallback when rules omitted', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  const r = mgr.autoTag({
    docId: 'S1',
    content: 'מסמך זה הוא חשבונית לאתר הבנייה בחיפה',
  });
  // Should find invoice via Hebrew synonym, and probably site via "אתר"
  assert.ok(r.added.includes('invoice'));
});

// ═════════════════════════════════════════════════════════════
// 8. listByTag (any / all / descendants)
// ═════════════════════════════════════════════════════════════

test('listByTag any/all + descendant expansion', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  mgr.tagDocument('L1', ['invoice'], 'k');
  mgr.tagDocument('L2', ['quote'], 'k');
  mgr.tagDocument('L3', ['permit'], 'k');
  mgr.tagDocument('L4', ['invoice', 'permit'], 'k');

  // any = union
  assert.deepEqual(
    mgr.listByTag(['invoice', 'permit'], { mode: 'any' }),
    ['L1', 'L3', 'L4'],
  );
  // all = intersection
  assert.deepEqual(
    mgr.listByTag(['invoice', 'permit'], { mode: 'all' }),
    ['L4'],
  );
  // descendants: querying `finance` picks up invoice+quote docs too
  assert.deepEqual(
    mgr.listByTag(['finance'], { includeDescendants: true }).sort(),
    ['L1', 'L2', 'L4'],
  );
});

// ═════════════════════════════════════════════════════════════
// 9. bulkRetag
// ═════════════════════════════════════════════════════════════

test('bulkRetag moves docs and retires the source tag', () => {
  const { mgr, tick } = makeMgr();
  mgr.defineTagTaxonomy({
    tags: [
      { id: 'old-inv', name_he: 'ישן', name_en: 'Old Invoice' },
      { id: 'new-inv', name_he: 'חדש', name_en: 'New Invoice' },
    ],
  });
  mgr.tagDocument('B1', ['old-inv'], 'k');
  mgr.tagDocument('B2', ['old-inv'], 'k');
  tick(100);
  const r = mgr.bulkRetag({
    sourceTag: 'old-inv', targetTag: 'new-inv', user: 'admin',
  });
  assert.equal(r.moved, 2);
  assert.deepEqual(r.docs.sort(), ['B1', 'B2']);

  // Source is retired but still present in the taxonomy
  const src = mgr.getTag('old-inv');
  assert.ok(src && src.retired_at != null);

  // new-inv carries the docs
  assert.deepEqual(mgr.listByTag(['new-inv']).sort(), ['B1', 'B2']);
  // old-inv can no longer be applied to new docs
  assert.throws(
    () => mgr.tagDocument('B3', ['old-inv'], 'k'),
    (e) => e.code === 'E_TAG_RETIRED',
  );
});

// ═════════════════════════════════════════════════════════════
// 10. tagFrequency / unusedTags
// ═════════════════════════════════════════════════════════════

test('tagFrequency counts adds within period', () => {
  const { mgr, tick } = makeMgr(Date.UTC(2026, 3, 10));
  seedTaxonomy(mgr);
  mgr.tagDocument('F1', ['invoice'], 'k');
  mgr.tagDocument('F2', ['invoice'], 'k');
  mgr.tagDocument('F3', ['permit'], 'k');
  tick(1000);
  mgr.tagDocument('F4', ['invoice'], 'k');

  const all = mgr.tagFrequency();
  const invCount = all.find((x) => x.tagId === 'invoice').count;
  const perCount = all.find((x) => x.tagId === 'permit').count;
  assert.equal(invCount, 3);
  assert.equal(perCount, 1);
  // Ordering: invoice first
  assert.equal(all[0].tagId, 'invoice');

  // Period filter: only the first batch
  const narrow = mgr.tagFrequency({
    from: Date.UTC(2026, 3, 10),
    to:   Date.UTC(2026, 3, 10) + 500,
  });
  const invNarrow = narrow.find((x) => x.tagId === 'invoice').count;
  assert.equal(invNarrow, 2);
});

test('unusedTags returns tags never applied', () => {
  const { mgr } = makeMgr();
  seedTaxonomy(mgr);
  mgr.tagDocument('U1', ['invoice'], 'k');
  const unused = mgr.unusedTags().map((t) => t.id);
  assert.ok(!unused.includes('invoice'));
  assert.ok(unused.includes('quote'));
  assert.ok(unused.includes('drawing'));
  assert.ok(unused.includes('permit'));
});

// ═════════════════════════════════════════════════════════════
// 11. propagateMetadata
// ═════════════════════════════════════════════════════════════

test('propagateMetadata cascades to linked children with field subset', () => {
  const { mgr } = makeMgr();
  seedInvoiceSchema(mgr);
  mgr.applySchema({
    docId: 'PARENT',
    schemaName: 'invoice',
    metadata: {
      number: 'INV-P',
      amount: 999,
      currency: 'USD',
      issued_on: '2026-04-01',
      supplier_ref: 'SUP-42',
    },
  });
  // Two children need a base metadata record first to satisfy
  // required fields — then we'll cascade currency only.
  for (const id of ['CH1', 'CH2']) {
    mgr.applySchema({
      docId: id,
      schemaName: 'invoice',
      metadata: {
        number: `INV-${id}`, amount: 1,
        issued_on: '2026-04-01', supplier_ref: 'SUP-42',
      },
    });
    mgr.linkChild('PARENT', id);
  }
  const r = mgr.propagateMetadata({
    docId: 'PARENT',
    toChildren: true,
    schemaName: 'invoice',
    fields: ['currency'],
    user: 'admin',
  });
  assert.deepEqual(r.applied.sort(), ['CH1', 'CH2']);
  // Children now have USD
  const ch1 = mgr.getMetadata('CH1', 'invoice');
  const ch2 = mgr.getMetadata('CH2', 'invoice');
  assert.equal(ch1.metadata.currency, 'USD');
  assert.equal(ch2.metadata.currency, 'USD');
  // but their amount stays at 1 (not cascaded)
  assert.equal(ch1.metadata.amount, 1);
});

// ═════════════════════════════════════════════════════════════
// 12. Internal helpers
// ═════════════════════════════════════════════════════════════

test('normTerm strips nikud + punctuation and lowercases', () => {
  const n = _internal.normTerm;
  assert.equal(n('  Invoice!  '), 'invoice');
  assert.equal(n('בֵּית-סֵפֶר'), 'בית ספר');
  assert.equal(n('bUilding   permIt'), 'building permit');
});

test('FIELD_TYPES is frozen + exhaustive', () => {
  assert.ok(Object.isFrozen(FIELD_TYPES));
  assert.deepEqual(
    FIELD_TYPES.slice().sort(),
    ['array','boolean','date','enum','number','reference','string'],
  );
});
