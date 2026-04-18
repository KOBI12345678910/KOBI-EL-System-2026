/**
 * Unit tests for property-manager — מנהל נכסי נדל"ן
 * Agent Y-046 — written 2026-04-11
 *
 * Run:   node --test test/realestate/property-manager.test.js
 *
 * Coverage:
 *   - registerProperty() — happy path, aliases (block/parcel), type validation
 *   - getProperty() + getPropertyByGushHelka() — exact & block-level lookup
 *   - linkToTabu() — extract linkage + owner auto-append
 *   - ownerHistory() — chain of title, never truncated
 *   - updateValuation() — append-only, chronological sort, currentValuation
 *   - encumbrances() — add, release (never delete), filter
 *   - ownershipShare() — 50/50 spouses, sum validation, overflow rejection
 *   - cadastralData() — ADOT stub blob
 *   - exportProperty() / snapshot()
 *   - audit trail present
 *
 * Principle: לא מוחקים — רק משדרגים ומגדלים.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PropertyManager,
  PROPERTY_TYPES,
  VALUATION_METHODS,
  ENCUMBRANCE_TYPES,
  HEBREW_LABELS,
  _internal,
} = require('../../src/realestate/property-manager.js');

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function mkManager() {
  return new PropertyManager();
}

function seedApartment(pm, overrides = {}) {
  return pm.registerProperty(
    Object.assign(
      {
        id: 'p-dizengoff-77',
        address: 'רחוב דיזנגוף 77, תל אביב',
        gush: 7106,
        helka: 42,
        subParcel: 5,
        propertyType: 'residential',
        areaSqm: 92,
        rooms: 4,
        floors: 3,
        purchaseDate: '2019-06-15',
        purchasePrice: 2_450_000,
        currentValue: 3_100_000,
      },
      overrides,
    ),
  );
}

// ──────────────────────────────────────────────────────────────
// 1. Constants
// ──────────────────────────────────────────────────────────────

test('01. constants export frozen arrays', () => {
  assert.ok(Object.isFrozen(PROPERTY_TYPES));
  assert.ok(PROPERTY_TYPES.includes('residential'));
  assert.ok(PROPERTY_TYPES.includes('commercial'));
  assert.ok(PROPERTY_TYPES.includes('industrial'));
  assert.ok(PROPERTY_TYPES.includes('land'));
  assert.ok(PROPERTY_TYPES.includes('mixed'));
  assert.ok(Object.isFrozen(VALUATION_METHODS));
  assert.ok(Object.isFrozen(ENCUMBRANCE_TYPES));
  assert.equal(HEBREW_LABELS.gush, 'גוש');
  assert.equal(HEBREW_LABELS.helka, 'חלקה');
  assert.equal(HEBREW_LABELS.subParcel, 'תת-חלקה');
  assert.equal(HEBREW_LABELS.tabu, 'נסח טאבו');
  assert.equal(HEBREW_LABELS.betterment_levy, 'היטל השבחה');
});

// ──────────────────────────────────────────────────────────────
// 2. registerProperty
// ──────────────────────────────────────────────────────────────

test('02. registerProperty creates a well-formed property record', () => {
  const pm = mkManager();
  const prop = seedApartment(pm);
  assert.equal(prop.id, 'p-dizengoff-77');
  assert.equal(prop.gush, 7106);
  assert.equal(prop.helka, 42);
  assert.equal(prop.subParcel, 5);
  assert.equal(prop.propertyType, 'residential');
  assert.equal(prop.propertyTypeHe, 'נכס מגורים');
  assert.equal(prop.address, 'רחוב דיזנגוף 77, תל אביב');
  assert.equal(prop.areaSqm, 92);
  assert.equal(prop.rooms, 4);
  assert.equal(prop.currentValue, 3_100_000);
  assert.ok(prop.createdAt);
  assert.ok(prop.updatedAt);
  // seed valuation
  assert.equal(prop.valuationHistory.length, 1);
  assert.equal(prop.valuationHistory[0].value, 3_100_000);
});

test('03. registerProperty accepts block/parcel aliases', () => {
  const pm = mkManager();
  const prop = pm.registerProperty({
    address: 'הרצל 10, חיפה',
    block: 10560,
    parcel: 88,
    propertyType: 'commercial',
    purchasePrice: 4_800_000,
    currentValue: 5_250_000,
  });
  assert.equal(prop.gush, 10560);
  assert.equal(prop.helka, 88);
  assert.equal(prop.propertyType, 'commercial');
  assert.equal(prop.propertyTypeHe, 'נכס מסחרי');
});

test('04. registerProperty auto-generates id when not supplied', () => {
  const pm = mkManager();
  const prop = pm.registerProperty({
    address: 'ויצמן 5, רמת גן',
    gush: 6205,
    helka: 101,
    propertyType: 'residential',
  });
  assert.match(prop.id, /^prop_/);
});

test('05. registerProperty rejects missing gush/helka', () => {
  const pm = mkManager();
  assert.throws(
    () => pm.registerProperty({ address: 'x', helka: 1 }),
    /gush/,
  );
  assert.throws(
    () => pm.registerProperty({ address: 'x', gush: 1 }),
    /helka/,
  );
});

test('06. registerProperty rejects unknown propertyType', () => {
  const pm = mkManager();
  assert.throws(
    () =>
      pm.registerProperty({
        gush: 1,
        helka: 1,
        propertyType: 'spaceship',
      }),
    /propertyType/,
  );
});

test('07. registerProperty rejects duplicate id', () => {
  const pm = mkManager();
  seedApartment(pm);
  assert.throws(() => seedApartment(pm), /already registered/);
});

// ──────────────────────────────────────────────────────────────
// 3. getPropertyByGushHelka — Tabu-style lookup
// ──────────────────────────────────────────────────────────────

test('08. getPropertyByGushHelka exact triple returns the single unit', () => {
  const pm = mkManager();
  seedApartment(pm);
  const found = pm.getPropertyByGushHelka(7106, 42, 5);
  assert.ok(found, 'expected a property to be found');
  assert.equal(Array.isArray(found), false);
  assert.equal(found.id, 'p-dizengoff-77');
});

test('09. getPropertyByGushHelka without subParcel returns all units in the parcel', () => {
  const pm = mkManager();
  pm.registerProperty({
    id: 'p-1',
    gush: 7106,
    helka: 42,
    subParcel: 5,
    propertyType: 'residential',
  });
  pm.registerProperty({
    id: 'p-2',
    gush: 7106,
    helka: 42,
    subParcel: 6,
    propertyType: 'residential',
  });
  pm.registerProperty({
    id: 'p-3',
    gush: 7106,
    helka: 42,
    subParcel: 7,
    propertyType: 'residential',
  });
  const found = pm.getPropertyByGushHelka(7106, 42);
  assert.ok(Array.isArray(found));
  assert.equal(found.length, 3);
  const ids = found.map((f) => f.id).sort();
  assert.deepEqual(ids, ['p-1', 'p-2', 'p-3']);
});

test('10. getPropertyByGushHelka returns null when nothing matches', () => {
  const pm = mkManager();
  seedApartment(pm);
  assert.equal(pm.getPropertyByGushHelka(9999, 1), null);
  assert.equal(pm.getPropertyByGushHelka(7106, 42, 999), null);
});

test('11. getPropertyByGushHelka accepts string numerics', () => {
  const pm = mkManager();
  seedApartment(pm);
  const found = pm.getPropertyByGushHelka('7106', '42', '5');
  assert.ok(found);
  assert.equal(found.id, 'p-dizengoff-77');
});

// ──────────────────────────────────────────────────────────────
// 4. linkToTabu
// ──────────────────────────────────────────────────────────────

test('12. linkToTabu attaches an extract and auto-appends owners', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.linkToTabu('p-dizengoff-77', {
    extractNumber: 'TAB-2026-00042',
    issuedAt: '2026-03-20',
    office: 'לשכת רישום מקרקעין תל אביב',
    pdfUrl: 'https://tabu.gov.il/extracts/2026-00042.pdf',
    hash: 'sha256:aa',
    owners: ['כהן דוד', 'כהן שרה'],
    encumbrances: [{ type: 'mortgage', holder: 'בנק הפועלים' }],
  });
  const prop = pm.getProperty('p-dizengoff-77');
  assert.equal(prop.tabuLinks.length, 1);
  assert.equal(prop.tabuLinks[0].extractNumber, 'TAB-2026-00042');
  // owners auto-appended
  assert.equal(prop.ownerHistory.length, 2);
  assert.ok(prop.ownerHistory.some((o) => o.name === 'כהן דוד'));
  assert.ok(prop.ownerHistory.some((o) => o.name === 'כהן שרה'));
});

test('13. linkToTabu rejects bad input', () => {
  const pm = mkManager();
  seedApartment(pm);
  assert.throws(() => pm.linkToTabu('p-dizengoff-77'), /tabuRef/);
  assert.throws(() => pm.linkToTabu('no-such-id', { extractNumber: 'x' }), /not found/);
});

// ──────────────────────────────────────────────────────────────
// 5. ownerHistory — chain of title
// ──────────────────────────────────────────────────────────────

test('14. addOwner builds a chain of title, never deleting prior owners', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.addOwner('p-dizengoff-77', { name: 'לוי רות', from: '2010-01-01' });
  pm.addOwner('p-dizengoff-77', { name: 'אברהם נעמה', from: '2015-05-10' });
  pm.addOwner('p-dizengoff-77', { name: 'כהן דוד', from: '2019-06-15' });

  const chain = pm.ownerHistory('p-dizengoff-77');
  assert.equal(chain.length, 3);
  // Earlier owners now have .to closed
  assert.ok(chain[0].to);
  assert.ok(chain[1].to);
  assert.equal(chain[2].to, null);
  assert.equal(chain[2].name, 'כהן דוד');
});

test('15. addOwner with keepOpen=true supports co-ownership', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.addOwner('p-dizengoff-77', {
    name: 'כהן דוד',
    from: '2019-06-15',
    keepOpen: true,
  });
  pm.addOwner('p-dizengoff-77', {
    name: 'כהן שרה',
    from: '2019-06-15',
    keepOpen: true,
  });
  const chain = pm.ownerHistory('p-dizengoff-77');
  assert.equal(chain.length, 2);
  assert.equal(chain[0].to, null);
  assert.equal(chain[1].to, null);
});

// ──────────────────────────────────────────────────────────────
// 6. updateValuation — append-only, currentValuation
// ──────────────────────────────────────────────────────────────

test('16. updateValuation appends to history; valuationHistory sorted asc', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.updateValuation('p-dizengoff-77', {
    date: '2022-01-10',
    value: 3_300_000,
    valuer: 'שמאי - אברהם כהן',
    method: 'comparable',
  });
  pm.updateValuation('p-dizengoff-77', {
    date: '2024-06-30',
    value: 3_550_000,
    valuer: 'שמאי - יעל שפירא',
    method: 'comparable',
  });
  pm.updateValuation('p-dizengoff-77', {
    date: '2026-01-15',
    value: 3_900_000,
    valuer: 'שמאי - יעל שפירא',
    method: 'DCF',
  });

  const hist = pm.valuationHistory('p-dizengoff-77');
  // Seed valuation + 3 appended = 4
  assert.equal(hist.length, 4);
  // Sorted ascending by date
  const dates = hist.map((h) => new Date(h.date).getTime());
  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i] >= dates[i - 1], 'valuation history must be ascending');
  }
  // Current valuation is the latest
  const current = pm.currentValuation('p-dizengoff-77');
  assert.equal(current.value, 3_900_000);
  assert.equal(current.method, 'DCF');

  // exportProperty.currentValue also reflects the latest
  const exported = pm.exportProperty('p-dizengoff-77');
  assert.equal(exported.currentValue, 3_900_000);
});

test('17. updateValuation rejects bad inputs', () => {
  const pm = mkManager();
  seedApartment(pm);
  assert.throws(
    () => pm.updateValuation('p-dizengoff-77', { value: 'a lot' }),
    /value/,
  );
  assert.throws(
    () =>
      pm.updateValuation('p-dizengoff-77', {
        value: 1,
        method: 'crystal-ball',
      }),
    /method/,
  );
});

// ──────────────────────────────────────────────────────────────
// 7. encumbrances
// ──────────────────────────────────────────────────────────────

test('18. addEncumbrance + releaseEncumbrance never deletes history', () => {
  const pm = mkManager();
  seedApartment(pm);
  const mortgage = pm.addEncumbrance('p-dizengoff-77', {
    type: 'mortgage',
    holder: 'בנק הפועלים',
    amount: 1_800_000,
    description: 'משכנתא ראשונה',
    referenceNumber: 'MORT-9001',
  });
  pm.addEncumbrance('p-dizengoff-77', {
    type: 'caveat',
    holder: 'עו״ד רונית ברק',
    description: 'הערת אזהרה לטובת קונה',
  });
  pm.addEncumbrance('p-dizengoff-77', {
    type: 'injunction',
    court: 'בית משפט השלום תל אביב',
    description: 'צו מניעה זמני',
  });

  // Active = 3
  let active = pm.encumbrances('p-dizengoff-77');
  assert.equal(active.length, 3);

  // Release mortgage
  pm.releaseEncumbrance('p-dizengoff-77', mortgage.id, 'פרעון מלא');

  active = pm.encumbrances('p-dizengoff-77');
  assert.equal(active.length, 2);

  const full = pm.encumbrances('p-dizengoff-77', { includeReleased: true });
  assert.equal(full.length, 3);
  const released = full.find((e) => e.id === mortgage.id);
  assert.ok(released.releasedAt);
  assert.equal(released.releaseNote, 'פרעון מלא');
});

test('19. addEncumbrance rejects unknown types', () => {
  const pm = mkManager();
  seedApartment(pm);
  assert.throws(
    () => pm.addEncumbrance('p-dizengoff-77', { type: 'curse' }),
    /type/,
  );
});

// ──────────────────────────────────────────────────────────────
// 8. ownershipShare — 50/50 spouses must sum to 100
// ──────────────────────────────────────────────────────────────

test('20. ownershipShare supports 50/50 spouses summing to 100%', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.ownershipShare({
    propertyId: 'p-dizengoff-77',
    owner: 'כהן דוד',
    sharePct: 50,
  });
  pm.ownershipShare({
    propertyId: 'p-dizengoff-77',
    owner: 'כהן שרה',
    sharePct: 50,
  });
  assert.equal(pm.totalOwnershipShare('p-dizengoff-77'), 100);

  const shares = pm.ownershipShares('p-dizengoff-77');
  assert.equal(shares.length, 2);
  const total = shares.reduce((s, r) => s + r.sharePct, 0);
  assert.equal(total, 100);
});

test('21. ownershipShare rejects totals above 100%', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.ownershipShare({
    propertyId: 'p-dizengoff-77',
    owner: 'כהן דוד',
    sharePct: 70,
  });
  assert.throws(
    () =>
      pm.ownershipShare({
        propertyId: 'p-dizengoff-77',
        owner: 'כהן שרה',
        sharePct: 50,
      }),
    /exceed 100%/,
  );
});

test('22. ownershipShare rejects negative or out-of-range sharePct', () => {
  const pm = mkManager();
  seedApartment(pm);
  assert.throws(
    () =>
      pm.ownershipShare({
        propertyId: 'p-dizengoff-77',
        owner: 'x',
        sharePct: -1,
      }),
    /between 0 and 100/,
  );
  assert.throws(
    () =>
      pm.ownershipShare({
        propertyId: 'p-dizengoff-77',
        owner: 'x',
        sharePct: 101,
      }),
    /between 0 and 100/,
  );
});

test('23. ownershipShare supports complex 4-way partition (25/25/25/25)', () => {
  const pm = mkManager();
  seedApartment(pm);
  const heirs = ['כהן אבי', 'כהן רות', 'כהן נעם', 'כהן טל'];
  heirs.forEach((owner) =>
    pm.ownershipShare({
      propertyId: 'p-dizengoff-77',
      owner,
      sharePct: 25,
    }),
  );
  assert.equal(pm.totalOwnershipShare('p-dizengoff-77'), 100);
});

// ──────────────────────────────────────────────────────────────
// 9. cadastralData (ADOT stub)
// ──────────────────────────────────────────────────────────────

test('24. cadastralData returns a stub blob keyed to gush/helka', () => {
  const pm = mkManager();
  seedApartment(pm);
  const blob = pm.cadastralData('p-dizengoff-77');
  assert.equal(blob.source, 'ADOT');
  assert.equal(blob.gush, 7106);
  assert.equal(blob.helka, 42);
  assert.equal(blob.subParcel, 5);
  assert.ok(blob.note.includes('stub'));
  // idempotent
  const blob2 = pm.cadastralData('p-dizengoff-77');
  assert.equal(blob2.source, 'ADOT');
});

// ──────────────────────────────────────────────────────────────
// 10. export / snapshot / audit
// ──────────────────────────────────────────────────────────────

test('25. exportProperty returns a JSON-safe snapshot', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.addOwner('p-dizengoff-77', { name: 'כהן דוד', from: '2019-06-15' });
  pm.updateValuation('p-dizengoff-77', { value: 3_500_000 });
  const exported = pm.exportProperty('p-dizengoff-77');
  const roundTrip = JSON.parse(JSON.stringify(exported));
  assert.deepEqual(exported, roundTrip);
  assert.equal(exported.id, 'p-dizengoff-77');
});

test('26. snapshot dumps the entire portfolio', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.registerProperty({
    id: 'p-shoham-land',
    gush: 5200,
    helka: 15,
    propertyType: 'land',
    address: 'שדה חקלאי - בקעת אונו',
  });
  const snap = pm.snapshot();
  assert.equal(snap.meta.count, 2);
  assert.equal(snap.properties.length, 2);
  assert.ok(snap.meta.generatedAt);
});

test('27. auditTrail records every mutation', () => {
  const pm = mkManager();
  seedApartment(pm);
  pm.linkToTabu('p-dizengoff-77', {
    extractNumber: 'TAB-2026-1',
    owners: ['כהן דוד'],
  });
  pm.updateValuation('p-dizengoff-77', { value: 3_400_000 });
  pm.addEncumbrance('p-dizengoff-77', { type: 'mortgage', holder: 'בנק לאומי' });
  pm.ownershipShare({
    propertyId: 'p-dizengoff-77',
    owner: 'כהן דוד',
    sharePct: 100,
  });
  const audit = pm.auditTrail();
  assert.ok(audit.length >= 5);
  const actions = audit.map((a) => a.action);
  assert.ok(actions.includes('registerProperty'));
  assert.ok(actions.includes('linkToTabu'));
  assert.ok(actions.includes('updateValuation'));
  assert.ok(actions.includes('addEncumbrance'));
  assert.ok(actions.includes('ownershipShare'));
});

// ──────────────────────────────────────────────────────────────
// 11. Internal helpers (white-box)
// ──────────────────────────────────────────────────────────────

test('28. _internal.gushHelkaKey normalizes numeric and strings', () => {
  assert.equal(_internal.gushHelkaKey(7106, 42, 5), '7106/42/5');
  assert.equal(_internal.gushHelkaKey('7106', '42'), '7106/42');
  assert.equal(_internal.gushHelkaKey(null, 42), null);
});

test('29. listProperties filter by propertyType and block', () => {
  const pm = mkManager();
  pm.registerProperty({
    id: 'r1',
    gush: 100,
    helka: 1,
    propertyType: 'residential',
  });
  pm.registerProperty({
    id: 'c1',
    gush: 100,
    helka: 2,
    propertyType: 'commercial',
  });
  pm.registerProperty({
    id: 'r2',
    gush: 200,
    helka: 1,
    propertyType: 'residential',
  });
  assert.equal(pm.listProperties({ propertyType: 'residential' }).length, 2);
  assert.equal(pm.listProperties({ propertyType: 'commercial' }).length, 1);
  assert.equal(pm.listProperties({ gush: 100 }).length, 2);
  assert.equal(pm.listProperties({ gush: 100, helka: 2 }).length, 1);
  assert.equal(pm.listProperties().length, 3);
});

test('30. end-to-end scenario: Tel Aviv apartment with full lifecycle', () => {
  const pm = mkManager();
  const apt = pm.registerProperty({
    id: 'e2e-apt',
    address: 'שדרות רוטשילד 120, תל אביב',
    gush: 7457,
    helka: 312,
    subParcel: 12,
    propertyType: 'residential',
    areaSqm: 110,
    rooms: 4.5,
    floors: 8,
    purchaseDate: '2018-09-01',
    purchasePrice: 3_200_000,
    currentValue: 3_200_000,
  });
  assert.equal(apt.id, 'e2e-apt');

  // Link to Tabu
  pm.linkToTabu('e2e-apt', {
    extractNumber: 'TAB-2026-E2E',
    issuedAt: '2026-04-01',
    office: 'לשכת רישום מקרקעין תל אביב',
    owners: ['גולן משה'],
  });

  // Add spouse ownership
  pm.ownershipShare({ propertyId: 'e2e-apt', owner: 'גולן משה', sharePct: 50 });
  pm.ownershipShare({ propertyId: 'e2e-apt', owner: 'גולן דנה', sharePct: 50 });
  assert.equal(pm.totalOwnershipShare('e2e-apt'), 100);

  // Mortgage
  const m = pm.addEncumbrance('e2e-apt', {
    type: 'mortgage',
    holder: 'בנק מזרחי טפחות',
    amount: 2_100_000,
    referenceNumber: 'MORT-E2E',
  });

  // Valuation updates
  pm.updateValuation('e2e-apt', {
    date: '2021-03-01',
    value: 3_800_000,
    valuer: 'שמאי - רונן שלו',
    method: 'comparable',
  });
  pm.updateValuation('e2e-apt', {
    date: '2026-02-15',
    value: 4_650_000,
    valuer: 'שמאי - רונן שלו',
    method: 'DCF',
  });
  assert.equal(pm.currentValuation('e2e-apt').value, 4_650_000);

  // Release mortgage on refinance
  pm.releaseEncumbrance('e2e-apt', m.id, 'מיחזור משכנתא');
  assert.equal(pm.encumbrances('e2e-apt').length, 0);
  assert.equal(pm.encumbrances('e2e-apt', { includeReleased: true }).length, 1);

  // Tabu lookup
  const found = pm.getPropertyByGushHelka(7457, 312, 12);
  assert.ok(found);
  assert.equal(found.id, 'e2e-apt');

  // Cadastral stub
  const cad = pm.cadastralData('e2e-apt');
  assert.equal(cad.gush, 7457);
  assert.equal(cad.source, 'ADOT');
});
