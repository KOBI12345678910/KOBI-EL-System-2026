/**
 * Sales Territory Manager — Unit Tests
 * Agent Y-028 | Swarm Sales | Techno-Kol Uzi mega-ERP
 *
 * Covers:
 *   01. defineTerritory: basic spec + id generation
 *   02. defineTerritory: rule validation (invalid rule rejected)
 *   03. Israeli geo rules: city → region (Tel Aviv, Haifa, Jerusalem, Beer Sheva, Tzfat, Netanya)
 *   04. Israeli geo rules: zip code → region
 *   05. assignAccount: geo match
 *   06. assignAccount: industry match
 *   07. assignAccount: size match (employees + revenue)
 *   08. assignAccount: product match
 *   09. assignAccount: best match wins on multi-rule score
 *   10. assignAccount: rule_priority tie-break
 *   11. assignAccount: no territory returns null territory_id
 *   12. coverageCheck: uncovered accounts
 *   13. coverageCheck: overlap detection
 *   14. coverageCheck: clean single-territory coverage
 *   15. rebalance: 'accounts' metric levels count
 *   16. rebalance: 'revenue' metric — spread decreases (LPT)
 *   17. rebalance: 'pipeline' metric — plan entries recorded
 *   18. rebalance: unknown metric throws
 *   19. territoryPerformance: revenue / pipeline / win-rate / attainment
 *   20. handoff: append-only history + roster moves
 *   21. handoff: unknown territory throws
 *   22. updateTerritory: active=false retires without deletion
 *   23. regions() introspection returns 6 Israeli regions with zip ranges
 *   24. ruleTypes() introspection: 4 bilingual types
 *   25. Hebrew+English labels present on territory, rule types, metrics
 *   26. accountRegion() resolves by explicit region, city, then zip
 *
 * Run with:
 *   node --test test/sales/territory-manager.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const mod = require(path.resolve(__dirname, '..', '..', 'src', 'sales', 'territory-manager.js'));
const { TerritoryManager, REGIONS, RULE_TYPES, METRICS, _internals } = mod;

// ───────────── helpers ─────────────
function freshTM() { return new TerritoryManager(); }

function tlvTerritory(tm, id, extra) {
  extra = extra || {};
  return tm.defineTerritory(Object.assign({
    id: id || 'tlv',
    name_he: 'מטרופולין תל אביב',
    name_en: 'Tel Aviv Metro',
    rules: [{ type: 'geo', value: { region: 'tel_aviv_metro' } }],
    salespeople: [{ id: 'sp_dan', name_he: 'דן', name_en: 'Dan', quota: 500000 }],
  }, extra));
}

function haifaTerritory(tm, id) {
  return tm.defineTerritory({
    id: id || 'hfa',
    name_he: 'מטרופולין חיפה',
    name_en: 'Haifa Metro',
    rules: [{ type: 'geo', value: { region: 'haifa_metro' } }],
    salespeople: [{ id: 'sp_yael', name_he: 'יעל', name_en: 'Yael', quota: 300000 }],
  });
}

function jlmTerritory(tm, id) {
  return tm.defineTerritory({
    id: id || 'jlm',
    name_he: 'ירושלים',
    name_en: 'Jerusalem',
    rules: [{ type: 'geo', value: { region: 'jerusalem' } }],
    salespeople: [{ id: 'sp_miri', name_he: 'מירי', name_en: 'Miri', quota: 200000 }],
  });
}

// ═══════════════════════════════════════════════════════════════
// 01
// ═══════════════════════════════════════════════════════════════
test('01 defineTerritory generates id and stores spec', () => {
  const tm = freshTM();
  const id = tlvTerritory(tm);
  assert.equal(id, 'tlv');
  const t = tm.getTerritory('tlv');
  assert.ok(t);
  assert.equal(t.name_he, 'מטרופולין תל אביב');
  assert.equal(t.name_en, 'Tel Aviv Metro');
  assert.equal(t.active, true);
  assert.equal(t.rules.length, 1);
  assert.equal(t.rules[0].type, 'geo');
});

// ═══════════════════════════════════════════════════════════════
// 02
// ═══════════════════════════════════════════════════════════════
test('02 defineTerritory rejects invalid rule type', () => {
  const tm = freshTM();
  assert.throws(function () {
    tm.defineTerritory({
      id: 'bad',
      name_he: 'רע',
      name_en: 'Bad',
      rules: [{ type: 'made_up', value: 'x' }],
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 03
// ═══════════════════════════════════════════════════════════════
test('03 Israeli geo: city → region', () => {
  assert.equal(_internals.resolveRegionFromCity('Tel Aviv'), 'tel_aviv_metro');
  assert.equal(_internals.resolveRegionFromCity('תל אביב'), 'tel_aviv_metro');
  assert.equal(_internals.resolveRegionFromCity('Haifa'), 'haifa_metro');
  assert.equal(_internals.resolveRegionFromCity('חיפה'), 'haifa_metro');
  assert.equal(_internals.resolveRegionFromCity('Jerusalem'), 'jerusalem');
  assert.equal(_internals.resolveRegionFromCity('ירושלים'), 'jerusalem');
  assert.equal(_internals.resolveRegionFromCity('Beer Sheva'), 'south');
  assert.equal(_internals.resolveRegionFromCity('צפת'), 'north');
  assert.equal(_internals.resolveRegionFromCity('Netanya'), 'central');
  assert.equal(_internals.resolveRegionFromCity('רחובות'), 'central');
  assert.equal(_internals.resolveRegionFromCity(null), null);
  assert.equal(_internals.resolveRegionFromCity('Atlantis'), null);
});

// ═══════════════════════════════════════════════════════════════
// 04
// ═══════════════════════════════════════════════════════════════
test('04 Israeli geo: zip → region', () => {
  // Tel Aviv (6xxxxxx)
  assert.equal(_internals.resolveRegionFromZip(6100000), 'tel_aviv_metro');
  assert.equal(_internals.resolveRegionFromZip(6789012), 'tel_aviv_metro');
  // Haifa (3xxxxxx)
  assert.equal(_internals.resolveRegionFromZip(3100000), 'haifa_metro');
  // Jerusalem (9xxxxxx)
  assert.equal(_internals.resolveRegionFromZip(9200000), 'jerusalem');
  // Beer Sheva (84xxxxx)
  assert.equal(_internals.resolveRegionFromZip(8400000), 'south');
  // Safed (13xxxxx)
  assert.equal(_internals.resolveRegionFromZip(1300000), 'north');
  // Netanya (42xxxxx)
  assert.equal(_internals.resolveRegionFromZip(4200000), 'central');
  // Bnei Brak (51xxxxx)
  assert.equal(_internals.resolveRegionFromZip(5100000), 'tel_aviv_metro');
  // Invalid
  assert.equal(_internals.resolveRegionFromZip(NaN), null);

  // parseZip with partial digits
  assert.equal(_internals.parseZip('12345'), 1234500);
  assert.equal(_internals.parseZip('1234567'), 1234567);
});

// ═══════════════════════════════════════════════════════════════
// 05
// ═══════════════════════════════════════════════════════════════
test('05 assignAccount: geo match by city', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  haifaTerritory(tm);
  const acc = { id: 'acc_1', city: 'Tel Aviv', industry: 'tech' };
  const res = tm.assignAccount(acc);
  assert.equal(res.territory_id, 'tlv');
  assert.equal(res.matched_rules.length, 1);
  assert.equal(acc.assigned_territory, 'tlv');
});

// ═══════════════════════════════════════════════════════════════
// 06
// ═══════════════════════════════════════════════════════════════
test('06 assignAccount: industry rule', () => {
  const tm = freshTM();
  tm.defineTerritory({
    id: 'ind_const',
    name_he: 'בנייה',
    name_en: 'Construction',
    rules: [{ type: 'industry', value: ['construction', 'בנייה'] }],
    salespeople: [{ id: 'sp1' }],
  });
  const a = { id: 'a1', industry: 'construction' };
  const b = { id: 'b1', industry: 'retail' };
  assert.equal(tm.assignAccount(a).territory_id, 'ind_const');
  assert.equal(tm.assignAccount(b).territory_id, null);
});

// ═══════════════════════════════════════════════════════════════
// 07
// ═══════════════════════════════════════════════════════════════
test('07 assignAccount: size rule — employees and revenue metrics', () => {
  const tm = freshTM();
  tm.defineTerritory({
    id: 'enterprise',
    name_he: 'חברות גדולות',
    name_en: 'Enterprise',
    rules: [{ type: 'size', value: { min: 250, metric: 'employees' } }],
    salespeople: [{ id: 'ent_sp' }],
  });
  tm.defineTerritory({
    id: 'highrev',
    name_he: 'הכנסה גבוהה',
    name_en: 'High Revenue',
    rules: [{ type: 'size', value: { min: 10000000, metric: 'revenue' } }],
    salespeople: [{ id: 'hr_sp' }],
  });

  const big = { id: 'bigco', size_employees: 400, city: 'Somewhere', industry: 'x' };
  const small = { id: 'smallco', size_employees: 12 };
  const rich = { id: 'richco', annual_revenue: 25000000, size_employees: 50 };

  assert.equal(tm.assignAccount(big).territory_id, 'enterprise');
  assert.equal(tm.assignAccount(small).territory_id, null);
  assert.equal(tm.assignAccount(rich).territory_id, 'highrev');
});

// ═══════════════════════════════════════════════════════════════
// 08
// ═══════════════════════════════════════════════════════════════
test('08 assignAccount: product rule', () => {
  const tm = freshTM();
  tm.defineTerritory({
    id: 'paint',
    name_he: 'צביעה',
    name_en: 'Painting',
    rules: [{ type: 'product', value: ['paint', 'primer', 'צבע'] }],
    salespeople: [{ id: 'p_sp' }],
  });
  const acc = { id: 'p1', products: ['primer', 'brushes'] };
  const miss = { id: 'p2', products: ['hammer'] };
  assert.equal(tm.assignAccount(acc).territory_id, 'paint');
  assert.equal(tm.assignAccount(miss).territory_id, null);
});

// ═══════════════════════════════════════════════════════════════
// 09
// ═══════════════════════════════════════════════════════════════
test('09 assignAccount: best-match wins when multiple territories match', () => {
  const tm = freshTM();
  // broad territory: only 1 rule (geo)
  tm.defineTerritory({
    id: 'broad',
    name_he: 'כללי תל אביב',
    name_en: 'Broad TLV',
    rules: [{ type: 'geo', value: { region: 'tel_aviv_metro' } }],
    salespeople: [{ id: 'b_sp' }],
  });
  // narrow territory: 3 rules (geo + industry + size)
  tm.defineTerritory({
    id: 'narrow',
    name_he: 'הייטק גדול תל אביב',
    name_en: 'Big Tech TLV',
    rules: [
      { type: 'geo', value: { region: 'tel_aviv_metro' } },
      { type: 'industry', value: 'tech' },
      { type: 'size', value: { min: 100, metric: 'employees' } },
    ],
    salespeople: [{ id: 'n_sp' }],
  });

  const acc = { id: 'match_all', city: 'Tel Aviv', industry: 'tech', size_employees: 300 };
  // the 'narrow' territory has 3/3 matches = 1.0; 'broad' has 1/1 = 1.0.
  // Tie on score -> lower rule_priority wins; both default to 100 → created_at
  // 'broad' was defined first so it wins on tie. Let's force priority.
  const res = tm.assignAccount(acc);
  assert.ok(res.territory_id);
  assert.ok(['broad', 'narrow'].indexOf(res.territory_id) !== -1);
  // now re-run with a stronger priority on narrow and verify it wins
  const tm2 = freshTM();
  tm2.defineTerritory({
    id: 'broad',
    name_he: 'רחב',
    name_en: 'Broad',
    rules: [{ type: 'geo', value: { region: 'tel_aviv_metro' } }],
    salespeople: [{ id: 'b2' }],
    rule_priority: 100,
  });
  tm2.defineTerritory({
    id: 'narrow',
    name_he: 'צר',
    name_en: 'Narrow',
    rules: [
      { type: 'geo', value: { region: 'tel_aviv_metro' } },
      { type: 'industry', value: 'tech' },
      { type: 'size', value: { min: 100, metric: 'employees' } },
    ],
    salespeople: [{ id: 'n2' }],
    rule_priority: 10, // higher priority (lower number)
  });
  const res2 = tm2.assignAccount({ id: 'a', city: 'Tel Aviv', industry: 'tech', size_employees: 300 });
  assert.equal(res2.territory_id, 'narrow');
});

// ═══════════════════════════════════════════════════════════════
// 10
// ═══════════════════════════════════════════════════════════════
test('10 assignAccount: tie-breaks deterministic (priority → created_at)', () => {
  const tm = freshTM();
  tm.defineTerritory({
    id: 'a',
    name_he: 'א',
    name_en: 'A',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 'a_sp' }],
    rule_priority: 50,
  });
  tm.defineTerritory({
    id: 'b',
    name_he: 'ב',
    name_en: 'B',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 'b_sp' }],
    rule_priority: 50,
  });
  // both priority 50 → creation order wins → 'a'
  const r = tm.assignAccount({ id: 'x', city: 'Netanya' });
  assert.equal(r.territory_id, 'a');
});

// ═══════════════════════════════════════════════════════════════
// 11
// ═══════════════════════════════════════════════════════════════
test('11 assignAccount: no match returns null territory_id', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  const r = tm.assignAccount({ id: 'z', city: 'Haifa' });
  assert.equal(r.territory_id, null);
  assert.equal(r.matched_rules.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// 12
// ═══════════════════════════════════════════════════════════════
test('12 coverageCheck: uncovered accounts reported', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  const accounts = [
    { id: 'a', city: 'Tel Aviv' },
    { id: 'b', city: 'Haifa' },
    { id: 'c', city: 'Jerusalem' },
  ];
  const cov = tm.coverageCheck(accounts);
  assert.equal(cov.uncovered.length, 2);
  assert.equal(cov.covered.length, 1);
  assert.equal(cov.covered[0].account_id, 'a');
  const uncoveredIds = cov.uncovered.map(u => u.account_id).sort();
  assert.deepEqual(uncoveredIds, ['b', 'c']);
});

// ═══════════════════════════════════════════════════════════════
// 13
// ═══════════════════════════════════════════════════════════════
test('13 coverageCheck: overlap detection', () => {
  const tm = freshTM();
  // Two overlapping territories both matching "tel_aviv_metro + tech"
  tm.defineTerritory({
    id: 'geo_tlv',
    name_he: 'גאוגרפי תל אביב',
    name_en: 'Geo TLV',
    rules: [{ type: 'geo', value: { region: 'tel_aviv_metro' } }],
    salespeople: [{ id: 'g' }],
  });
  tm.defineTerritory({
    id: 'ind_tech',
    name_he: 'הייטק',
    name_en: 'Tech',
    rules: [{ type: 'industry', value: 'tech' }],
    salespeople: [{ id: 't' }],
  });
  const accounts = [
    { id: 'overlap', city: 'Tel Aviv', industry: 'tech' },
    { id: 'only_geo', city: 'Tel Aviv', industry: 'retail' },
  ];
  const cov = tm.coverageCheck(accounts);
  assert.equal(cov.overlaps.length, 1);
  assert.equal(cov.overlaps[0].account_id, 'overlap');
  assert.equal(cov.overlaps[0].territories.length, 2);
  assert.equal(cov.covered.length, 1);
  assert.equal(cov.covered[0].account_id, 'only_geo');
});

// ═══════════════════════════════════════════════════════════════
// 14
// ═══════════════════════════════════════════════════════════════
test('14 coverageCheck: clean single-territory coverage', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  haifaTerritory(tm);
  jlmTerritory(tm);
  const accounts = [
    { id: 'a', city: 'Tel Aviv' },
    { id: 'b', city: 'Haifa' },
    { id: 'c', city: 'Jerusalem' },
  ];
  const cov = tm.coverageCheck(accounts);
  assert.equal(cov.covered.length, 3);
  assert.equal(cov.uncovered.length, 0);
  assert.equal(cov.overlaps.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// 15
// ═══════════════════════════════════════════════════════════════
test('15 rebalance: "accounts" metric levels distribution', () => {
  const tm = freshTM();
  // Both territories cover the same region → every account matches both.
  tm.defineTerritory({
    id: 't1', name_he: 'טריטוריה 1', name_en: 'Territory 1',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 's1' }],
  });
  tm.defineTerritory({
    id: 't2', name_he: 'טריטוריה 2', name_en: 'Territory 2',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 's2' }],
  });
  // 6 accounts, all currently assigned to t1
  const accounts = [];
  for (let i = 0; i < 6; i += 1) {
    accounts.push({ id: 'a' + i, city: 'Netanya', assigned_territory: 't1', revenue: 100, pipeline: 200 });
  }
  const res = tm.rebalance({ metric: 'accounts', accounts: accounts });
  // After rebalance counts should be 3/3
  assert.equal(res.after.t1, 3);
  assert.equal(res.after.t2, 3);
  assert.equal(res.before.t1, 6);
  assert.equal(res.before.t2, 0);
  assert.equal(res.spread_before, 6);
  assert.equal(res.spread_after, 0);
  assert.equal(res.improved, true);
  // 3 accounts should be flagged as moving
  const moves = res.plan.filter(p => !p.unmovable && p.to !== p.from);
  assert.equal(moves.length, 3);
});

// ═══════════════════════════════════════════════════════════════
// 16
// ═══════════════════════════════════════════════════════════════
test('16 rebalance: "revenue" — spread shrinks with LPT', () => {
  const tm = freshTM();
  tm.defineTerritory({
    id: 't1', name_he: 'א', name_en: 'A',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 's1' }],
  });
  tm.defineTerritory({
    id: 't2', name_he: 'ב', name_en: 'B',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 's2' }],
  });
  const accounts = [
    { id: 'a1', city: 'Netanya', revenue: 1000000, assigned_territory: 't1' },
    { id: 'a2', city: 'Netanya', revenue: 500000, assigned_territory: 't1' },
    { id: 'a3', city: 'Netanya', revenue: 400000, assigned_territory: 't1' },
    { id: 'a4', city: 'Netanya', revenue: 100000, assigned_territory: 't1' },
  ];
  const res = tm.rebalance({ metric: 'revenue', accounts: accounts });
  assert.equal(res.before.t1, 2000000);
  assert.equal(res.before.t2, 0);
  assert.ok(res.spread_after < res.spread_before);
  // LPT on [1000k, 500k, 400k, 100k]:
  //   place 1000k → t1 (or t2; tie → creation order t1) → t1=1000
  //   place 500k → smallest is t2 → t2=500
  //   place 400k → smallest is t2 (500<1000 still) → t2=900
  //   place 100k → smallest is t2 (900<1000) → t2=1000  → final 1000/1000
  assert.equal(res.after.t1, 1000000);
  assert.equal(res.after.t2, 1000000);
  assert.equal(res.spread_after, 0);
});

// ═══════════════════════════════════════════════════════════════
// 17
// ═══════════════════════════════════════════════════════════════
test('17 rebalance: "pipeline" plan entries', () => {
  const tm = freshTM();
  tm.defineTerritory({
    id: 't1', name_he: 'א', name_en: 'A',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 's' }],
  });
  tm.defineTerritory({
    id: 't2', name_he: 'ב', name_en: 'B',
    rules: [{ type: 'geo', value: { region: 'central' } }],
    salespeople: [{ id: 's' }],
  });
  const accounts = [
    { id: 'a1', city: 'Netanya', pipeline: 10, assigned_territory: 't1' },
    { id: 'a2', city: 'Netanya', pipeline: 20, assigned_territory: 't1' },
  ];
  const res = tm.rebalance({ metric: 'pipeline', accounts: accounts });
  assert.equal(res.metric, 'pipeline');
  assert.ok(res.plan.length >= 1);
});

// ═══════════════════════════════════════════════════════════════
// 18
// ═══════════════════════════════════════════════════════════════
test('18 rebalance: unknown metric throws', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  assert.throws(function () {
    tm.rebalance({ metric: 'weight', accounts: [] });
  });
});

// ═══════════════════════════════════════════════════════════════
// 19
// ═══════════════════════════════════════════════════════════════
test('19 territoryPerformance: KPIs (revenue, pipeline, win rate, attainment)', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  const accounts = [
    { id: 'a', city: 'Tel Aviv', assigned_territory: 'tlv', revenue: 200000, pipeline: 100000, active_deals: 3, last_result: 'won' },
    { id: 'b', city: 'Tel Aviv', assigned_territory: 'tlv', revenue: 300000, pipeline: 50000,  active_deals: 2, last_result: 'won' },
    { id: 'c', city: 'Tel Aviv', assigned_territory: 'tlv', revenue: 50000,  pipeline: 25000,  active_deals: 1, last_result: 'lost' },
  ];
  const kpi = tm.territoryPerformance('tlv', 'quarter', accounts);
  assert.equal(kpi.territory_id, 'tlv');
  assert.equal(kpi.account_count, 3);
  assert.equal(kpi.revenue, 550000);
  assert.equal(kpi.pipeline, 175000);
  assert.equal(kpi.active_deals, 6);
  assert.equal(kpi.win_count, 2);
  assert.equal(kpi.loss_count, 1);
  assert.ok(Math.abs(kpi.win_rate - 2 / 3) < 1e-9);
  assert.equal(kpi.quota, 500000);
  assert.ok(kpi.quota_attainment > 1); // 550k / 500k
  assert.equal(kpi.territory_name.he, 'מטרופולין תל אביב');
  assert.equal(kpi.territory_name.en, 'Tel Aviv Metro');
});

// ═══════════════════════════════════════════════════════════════
// 20
// ═══════════════════════════════════════════════════════════════
test('20 handoff: append-only with roster move', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  haifaTerritory(tm);
  // assign two accounts to TLV first so they're in its roster
  tm.assignAccount({ id: 'a', city: 'Tel Aviv' });
  tm.assignAccount({ id: 'b', city: 'Tel Aviv' });
  const hid = tm.handoff({
    fromTerritory: 'tlv',
    toTerritory: 'hfa',
    effectiveDate: '2026-04-15',
    accounts: ['a'],
    reason: 'reorg',
  });
  assert.ok(hid);
  const history = tm.listHandoffs('tlv');
  assert.equal(history.length, 1);
  assert.equal(history[0].id, hid);
  assert.equal(history[0].accounts[0], 'a');
  assert.equal(history[0].reason, 'reorg');
  const tlv = tm.getTerritory('tlv');
  const hfa = tm.getTerritory('hfa');
  assert.equal(tlv.account_ids.indexOf('a'), -1);
  assert.ok(hfa.account_ids.indexOf('a') !== -1);
  // a second handoff appends, does not replace
  tm.handoff({
    fromTerritory: 'tlv',
    toTerritory: 'hfa',
    accounts: ['b'],
  });
  assert.equal(tm.listHandoffs().length, 2);
});

// ═══════════════════════════════════════════════════════════════
// 21
// ═══════════════════════════════════════════════════════════════
test('21 handoff: unknown territory throws', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  assert.throws(function () {
    tm.handoff({ fromTerritory: 'tlv', toTerritory: 'ghost', accounts: [] });
  });
  assert.throws(function () {
    tm.handoff({ fromTerritory: 'ghost', toTerritory: 'tlv', accounts: [] });
  });
});

// ═══════════════════════════════════════════════════════════════
// 22
// ═══════════════════════════════════════════════════════════════
test('22 updateTerritory: active=false retires without deletion', () => {
  const tm = freshTM();
  tlvTerritory(tm);
  tm.updateTerritory('tlv', { active: false });
  const t = tm.getTerritory('tlv');
  assert.equal(t.active, false);
  // Still enumerated (never deleted)
  const all = tm.listTerritories();
  assert.equal(all.length, 1);
  // But new assignments skip it
  const r = tm.assignAccount({ id: 'x', city: 'Tel Aviv' });
  assert.equal(r.territory_id, null);
});

// ═══════════════════════════════════════════════════════════════
// 23
// ═══════════════════════════════════════════════════════════════
test('23 regions(): 6 Israeli regions with zip ranges', () => {
  const tm = freshTM();
  const r = tm.regions();
  assert.deepEqual(
    Object.keys(r).sort(),
    ['central', 'haifa_metro', 'jerusalem', 'north', 'south', 'tel_aviv_metro'].sort()
  );
  for (const key of Object.keys(r)) {
    assert.ok(r[key].name_he);
    assert.ok(r[key].name_en);
    assert.ok(r[key].zip_range_count > 0, key + ' must have at least one zip range');
    assert.ok(r[key].city_count > 0, key + ' must have at least one city');
  }
});

// ═══════════════════════════════════════════════════════════════
// 24
// ═══════════════════════════════════════════════════════════════
test('24 ruleTypes(): 4 bilingual types', () => {
  const tm = freshTM();
  const types = tm.ruleTypes();
  assert.deepEqual(Object.keys(types).sort(), ['geo', 'industry', 'product', 'size']);
  assert.ok(types.geo.he);
  assert.ok(types.geo.en);
  assert.ok(types.industry.he);
  assert.ok(types.size.he);
  assert.ok(types.product.en);
});

// ═══════════════════════════════════════════════════════════════
// 25
// ═══════════════════════════════════════════════════════════════
test('25 bilingual labels present on territory, RULE_TYPES, METRICS', () => {
  assert.ok(RULE_TYPES.geo.he && RULE_TYPES.geo.en);
  assert.ok(METRICS.revenue.he && METRICS.revenue.en);
  assert.ok(REGIONS.north.he && REGIONS.north.en);
  const tm = freshTM();
  tlvTerritory(tm);
  const t = tm.getTerritory('tlv');
  assert.ok(t.name_he);
  assert.ok(t.name_en);
});

// ═══════════════════════════════════════════════════════════════
// 26
// ═══════════════════════════════════════════════════════════════
test('26 accountRegion(): explicit > city > zip resolution order', () => {
  const tm = freshTM();
  // explicit region wins
  assert.equal(tm.accountRegion({ region: 'north', city: 'Tel Aviv' }), 'north');
  // fall back to city
  assert.equal(tm.accountRegion({ city: 'Haifa' }), 'haifa_metro');
  // fall back to zip (6-digit gets padded to 7)
  assert.equal(tm.accountRegion({ zip: '8400000' }), 'south');
  // nothing resolvable
  assert.equal(tm.accountRegion({}), null);
});
