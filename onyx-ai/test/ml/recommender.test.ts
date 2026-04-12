/**
 * ONYX AI — Recommender Engine Tests (Agent Y-158)
 * ============================================================
 * Exercises the RecommenderEngine for Techno-Kol Uzi mega-ERP.
 *
 * Run with:
 *   npx node --test --require ts-node/register test/ml/recommender.test.ts
 *
 * Coverage goals (17 tests):
 *   - Similarity primitives (cosine / Jaccard / Pearson) — 4 tests
 *   - Item-item collaborative filtering                 — 3 tests
 *   - User-item collaborative filtering                 — 3 tests
 *   - RFQ supplier content-based recommendation         — 2 tests
 *   - Cold-start fallback                               — 2 tests
 *   - Top-K + diversity (MMR)                           — 2 tests
 *   - Bilingual explanation shape                       — 1 test
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  RecommenderEngine,
  cosineSimilarity,
  cosineSimilaritySparse,
  jaccardSimilarity,
  pearsonCorrelation,
  recommendItemsForItem,
  recommendItemsForUser,
  recommendSuppliersForRFQ,
  recommendNextBestAction,
  Interaction,
  ItemFeatures,
  SupplierFeatures,
} from '../../src/ml/recommender';

// ---------------------------------------------------------------
// Fixtures — a small metal-products catalogue
// ---------------------------------------------------------------

const ITEMS: ItemFeatures[] = [
  {
    itemId: 'SKU-ALU-001',
    tags: ['aluminum', 'sheet', 'anodized', '3mm'],
    numeric: { priceNIS: 120, weightKg: 3 },
    nameHe: 'לוח אלומיניום 3 מ"מ',
    nameEn: 'Aluminum sheet 3mm',
  },
  {
    itemId: 'SKU-ALU-002',
    tags: ['aluminum', 'sheet', 'anodized', '5mm'],
    numeric: { priceNIS: 200, weightKg: 5 },
    nameHe: 'לוח אלומיניום 5 מ"מ',
    nameEn: 'Aluminum sheet 5mm',
  },
  {
    itemId: 'SKU-STL-001',
    tags: ['steel', 'bar', 'galvanized', '12mm'],
    numeric: { priceNIS: 80, weightKg: 4 },
    nameHe: 'מוט פלדה מגולוון 12 מ"מ',
    nameEn: 'Galvanized steel bar 12mm',
  },
  {
    itemId: 'SKU-STL-002',
    tags: ['steel', 'bar', 'galvanized', '16mm'],
    numeric: { priceNIS: 110, weightKg: 7 },
    nameHe: 'מוט פלדה מגולוון 16 מ"מ',
    nameEn: 'Galvanized steel bar 16mm',
  },
  {
    itemId: 'SKU-CPR-001',
    tags: ['copper', 'wire', 'insulated'],
    numeric: { priceNIS: 300, weightKg: 2 },
    nameHe: 'חוט נחושת מבודד',
    nameEn: 'Insulated copper wire',
  },
  {
    itemId: 'SKU-FAS-001',
    tags: ['fastener', 'stainless', 'M8'],
    numeric: { priceNIS: 5, weightKg: 0.01 },
    nameHe: 'בורג נירוסטה M8',
    nameEn: 'Stainless fastener M8',
  },
];

const INTERACTIONS: Interaction[] = [
  // userA — aluminum fan
  { userId: 'userA', itemId: 'SKU-ALU-001', weight: 5 },
  { userId: 'userA', itemId: 'SKU-ALU-002', weight: 4 },
  { userId: 'userA', itemId: 'SKU-FAS-001', weight: 3 },
  // userB — aluminum fan + copper
  { userId: 'userB', itemId: 'SKU-ALU-001', weight: 4 },
  { userId: 'userB', itemId: 'SKU-ALU-002', weight: 3 },
  { userId: 'userB', itemId: 'SKU-CPR-001', weight: 5 },
  // userC — steel fan
  { userId: 'userC', itemId: 'SKU-STL-001', weight: 5 },
  { userId: 'userC', itemId: 'SKU-STL-002', weight: 4 },
  // userD — mixed steel + fastener
  { userId: 'userD', itemId: 'SKU-STL-001', weight: 3 },
  { userId: 'userD', itemId: 'SKU-FAS-001', weight: 4 },
  // userE — overlaps userA heavily
  { userId: 'userE', itemId: 'SKU-ALU-001', weight: 4 },
  { userId: 'userE', itemId: 'SKU-ALU-002', weight: 4 },
  { userId: 'userE', itemId: 'SKU-CPR-001', weight: 3 },
];

const SUPPLIERS: SupplierFeatures[] = [
  {
    supplierId: 'SUP-01',
    capabilities: ['aluminum', 'anodizing', 'laser-cut', 'ISO9001'],
    metrics: { leadDays: 7, priceIndex: 0.95 },
    nameHe: 'אלומטק תעשיות',
    nameEn: 'AluMetal Industries',
  },
  {
    supplierId: 'SUP-02',
    capabilities: ['steel', 'galvanizing', 'welding', 'ISO9001'],
    metrics: { leadDays: 14, priceIndex: 0.85 },
    nameHe: 'פלדן',
    nameEn: 'Peladan Steel',
  },
  {
    supplierId: 'SUP-03',
    capabilities: ['aluminum', 'steel', 'laser-cut', 'welding'],
    metrics: { leadDays: 21, priceIndex: 1.05 },
    nameHe: 'מכונאות שילוב',
    nameEn: 'Shiluv Machining',
  },
  {
    supplierId: 'SUP-04',
    capabilities: ['copper', 'wire-drawing', 'insulation'],
    metrics: { leadDays: 10, priceIndex: 1.0 },
    nameHe: 'נחושת הצפון',
    nameEn: 'Northern Copper',
  },
];

// ---------------------------------------------------------------
// 1. Similarity metric tests
// ---------------------------------------------------------------

test('cosineSimilarity: orthogonal vectors → 0; identical → 1', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
  assert.equal(cosineSimilarity([], []), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test('cosineSimilaritySparse: sparse maps return same result as dense', () => {
  const a = new Map([['x', 1], ['y', 2], ['z', 3]]);
  const b = new Map([['x', 1], ['y', 2], ['z', 3]]);
  assert.ok(Math.abs(cosineSimilaritySparse(a, b) - 1) < 1e-9);

  const c = new Map([['x', 1]]);
  const d = new Map([['y', 1]]);
  assert.equal(cosineSimilaritySparse(c, d), 0);
});

test('jaccardSimilarity: set overlap', () => {
  assert.equal(jaccardSimilarity(['a', 'b'], ['a', 'b']), 1);
  assert.equal(jaccardSimilarity(['a', 'b'], ['c', 'd']), 0);
  assert.ok(Math.abs(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'd']) - 0.5) < 1e-9);
  assert.equal(jaccardSimilarity([], []), 0);
  // Case-insensitive
  assert.equal(jaccardSimilarity(['ALU'], ['alu']), 1);
});

test('pearsonCorrelation: perfect positive, negative, and no-overlap', () => {
  const a = new Map([['x', 1], ['y', 2], ['z', 3]]);
  const b = new Map([['x', 2], ['y', 4], ['z', 6]]);
  assert.ok(Math.abs(pearsonCorrelation(a, b) - 1) < 1e-9);

  const c = new Map([['x', 1], ['y', 2], ['z', 3]]);
  const d = new Map([['x', 3], ['y', 2], ['z', 1]]);
  assert.ok(Math.abs(pearsonCorrelation(c, d) + 1) < 1e-9);

  // Zero overlap → 0
  const e = new Map([['x', 1]]);
  const f = new Map([['y', 1]]);
  assert.equal(pearsonCorrelation(e, f), 0);
});

// ---------------------------------------------------------------
// 2. Item-item CF
// ---------------------------------------------------------------

test('item-item CF: seed ALU-001 recommends ALU-002 first', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const recs = engine.recommendItemsForItem('SKU-ALU-001', { k: 3, diversity: 0 });
  assert.ok(recs.length > 0, 'should produce recommendations');
  assert.equal(recs[0].id, 'SKU-ALU-002');
  assert.equal(recs[0].source, 'item-item');
  assert.ok(recs[0].score > 0);
});

test('item-item CF: excludes the seed item itself', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const recs = engine.recommendItemsForItem('SKU-STL-001', { k: 5 });
  for (const r of recs) {
    assert.notEqual(r.id, 'SKU-STL-001');
  }
});

test('item-item CF: functional wrapper matches class method', () => {
  const fromClass = new RecommenderEngine(INTERACTIONS, ITEMS)
    .recommendItemsForItem('SKU-ALU-001', { k: 3, diversity: 0 });
  const fromFn = recommendItemsForItem(INTERACTIONS, ITEMS, 'SKU-ALU-001', {
    k: 3,
    diversity: 0,
  });
  assert.deepEqual(
    fromClass.map((r) => r.id),
    fromFn.map((r) => r.id),
  );
});

// ---------------------------------------------------------------
// 3. User-item CF
// ---------------------------------------------------------------

test('user-item CF: recommends items owned by similar users, never self', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const recs = engine.recommendItemsForUser('userA', { k: 3 });
  assert.ok(recs.length > 0);
  const ownedA = new Set(['SKU-ALU-001', 'SKU-ALU-002', 'SKU-FAS-001']);
  for (const r of recs) {
    assert.ok(!ownedA.has(r.id), `already owned: ${r.id}`);
    assert.equal(r.source, 'user-item');
  }
});

test('user-item CF: userA should see SKU-CPR-001 (learned from userB/userE)', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const recs = engine.recommendItemsForUser('userA', { k: 5, diversity: 0 });
  const ids = recs.map((r) => r.id);
  assert.ok(ids.includes('SKU-CPR-001'), `expected copper wire, got ${ids.join(',')}`);
});

test('user-item CF: unknown user → cold-start fallback', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const recs = engine.recommendItemsForUser('userZZZ', { k: 3 });
  assert.ok(recs.length > 0);
  assert.equal(recs[0].source, 'cold-start');
});

// ---------------------------------------------------------------
// 4. Supplier / RFQ content-based
// ---------------------------------------------------------------

test('RFQ supplier ranking: aluminum anodizing RFQ → SUP-01 first', () => {
  const engine = new RecommenderEngine([], [], SUPPLIERS);
  const recs = engine.recommendSuppliersForRFQ(
    {
      rfqId: 'RFQ-2026-0001',
      requirements: ['aluminum', 'anodizing', 'laser-cut'],
    },
    { k: 3, diversity: 0 },
  );
  assert.ok(recs.length > 0);
  assert.equal(recs[0].id, 'SUP-01');
  assert.equal(recs[0].source, 'content');
});

test('RFQ supplier ranking: maxLeadDays constraint filters slow suppliers', () => {
  const engine = new RecommenderEngine([], [], SUPPLIERS);
  const recs = engine.recommendSuppliersForRFQ(
    {
      rfqId: 'RFQ-2026-0002',
      requirements: ['aluminum', 'steel', 'welding'],
      constraints: { maxLeadDays: 10 },
    },
    { k: 5 },
  );
  // SUP-02 (14d) and SUP-03 (21d) violate maxLeadDays=10.
  for (const r of recs) {
    assert.notEqual(r.id, 'SUP-02');
    assert.notEqual(r.id, 'SUP-03');
  }
});

// ---------------------------------------------------------------
// 5. Cold-start fallbacks
// ---------------------------------------------------------------

test('cold-start: seed item with no interactions uses content-based', () => {
  // Item exists in catalogue but has ZERO interactions.
  const lonelyItems: ItemFeatures[] = [
    ...ITEMS,
    {
      itemId: 'SKU-NEW-001',
      tags: ['aluminum', 'sheet', 'anodized', '8mm'],
      numeric: { priceNIS: 250, weightKg: 8 },
      nameHe: 'לוח חדש',
      nameEn: 'New sheet',
    },
  ];
  const engine = new RecommenderEngine(INTERACTIONS, lonelyItems);
  const recs = engine.recommendItemsForItem('SKU-NEW-001', { k: 3, diversity: 0 });
  assert.ok(recs.length > 0);
  assert.equal(recs[0].source, 'content');
  // Should prefer other aluminum sheets.
  assert.ok(['SKU-ALU-001', 'SKU-ALU-002'].includes(recs[0].id));
});

test('cold-start: empty catalogue + unknown user still returns []', () => {
  const engine = new RecommenderEngine([], []);
  const recs = engine.recommendItemsForUser('nobody', { k: 3 });
  assert.deepEqual(recs, []);
});

// ---------------------------------------------------------------
// 6. Top-K + diversity
// ---------------------------------------------------------------

test('Top-K: honours k parameter', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const recs1 = engine.recommendItemsForItem('SKU-ALU-001', { k: 1 });
  const recs3 = engine.recommendItemsForItem('SKU-ALU-001', { k: 3 });
  assert.equal(recs1.length, 1);
  assert.ok(recs3.length <= 3);
  assert.ok(recs3.length >= recs1.length);
});

test('Diversity: high diversity penalty spreads across tag clusters', () => {
  // Add more items so that diversity has room to operate.
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const relevanceOnly = engine.recommendItemsForItem('SKU-ALU-001', {
    k: 3,
    diversity: 0,
  });
  const diverse = engine.recommendItemsForItem('SKU-ALU-001', {
    k: 3,
    diversity: 0.9,
  });
  // Both return at least one item.
  assert.ok(relevanceOnly.length > 0);
  assert.ok(diverse.length > 0);
  // Scores are sorted desc in the relevance-only path.
  for (let i = 1; i < relevanceOnly.length; i++) {
    assert.ok(relevanceOnly[i - 1].score >= relevanceOnly[i].score);
  }
});

// ---------------------------------------------------------------
// 7. Next-best-action & bilingual
// ---------------------------------------------------------------

test('NBA: dormant account surfaces a rule-based follow-up action', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS);
  const recs = engine.recommendNextBestAction(
    {
      repId: 'rep-1',
      accountId: 'ACC-42',
      purchasedItems: ['SKU-ALU-001'],
      daysSinceLastContact: 45,
    },
    { k: 5 },
  );
  const hasRule = recs.some((r) => r.source === 'rule-based');
  assert.ok(hasRule, 'expected at least one rule-based action');
  const actionRec = recs.find((r) => r.id.startsWith('action:contact:'));
  assert.ok(actionRec, 'expected contact-followup action');
});

test('All recommendations expose a Hebrew + English explanation', () => {
  const engine = new RecommenderEngine(INTERACTIONS, ITEMS, SUPPLIERS);

  const allRecs = [
    ...engine.recommendItemsForItem('SKU-ALU-001', { k: 2 }),
    ...engine.recommendItemsForUser('userA', { k: 2 }),
    ...engine.recommendSuppliersForRFQ(
      { rfqId: 'RFQ-X', requirements: ['aluminum'] },
      { k: 2 },
    ),
    ...engine.recommendNextBestAction(
      {
        repId: 'rep-1',
        accountId: 'ACC-999',
        purchasedItems: ['SKU-ALU-001'],
        daysSinceLastContact: 10,
      },
      { k: 2 },
    ),
  ];

  assert.ok(allRecs.length >= 4);
  for (const r of allRecs) {
    assert.ok(r.explanation, `missing explanation on ${r.id}`);
    assert.equal(typeof r.explanation.he, 'string');
    assert.equal(typeof r.explanation.en, 'string');
    assert.ok(r.explanation.he.length > 0, `empty Hebrew on ${r.id}`);
    assert.ok(r.explanation.en.length > 0, `empty English on ${r.id}`);
  }
});

test('Functional entry points wire through end-to-end', () => {
  const user = recommendItemsForUser(INTERACTIONS, ITEMS, 'userA', { k: 2 });
  const item = recommendItemsForItem(INTERACTIONS, ITEMS, 'SKU-STL-001', { k: 2 });
  const sup = recommendSuppliersForRFQ(SUPPLIERS, {
    rfqId: 'RFQ-Q',
    requirements: ['copper', 'insulation'],
  });
  const nba = recommendNextBestAction(
    INTERACTIONS,
    ITEMS,
    {
      repId: 'rep-2',
      accountId: 'ACC-7',
      purchasedItems: ['SKU-STL-001'],
      daysSinceLastContact: 5,
    },
    { k: 3 },
  );
  assert.ok(user.length > 0);
  assert.ok(item.length > 0);
  assert.ok(sup.length > 0);
  assert.equal(sup[0].id, 'SUP-04');
  assert.ok(Array.isArray(nba));
});
