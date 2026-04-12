/* ============================================================================
 * Techno-Kol ERP — fx-engine test suite
 * Agent X-36 / Swarm 3C / Onyx Procurement
 * ----------------------------------------------------------------------------
 * Zero deps. Runs under plain Node — `node test/payroll/fx-engine.test.js`.
 *
 * Covers 28 cases:
 *   01 createFxEngine returns expected API shape
 *   02 listCurrencies covers primary basket of 12
 *   03 getRate — same currency returns 1 with IDENTITY source
 *   04 getRate — USD→ILS direct BoI rate
 *   05 getRate — ILS→USD returns inverse
 *   06 getRate — EUR→USD triangulated via ILS
 *   07 getRate — unknown currency throws FxError(UNKNOWN_CCY)
 *   08 getRate — date without rates throws FxError(RATE_NOT_FOUND)
 *   09 convert — amount × rate rounded to target decimals (ILS 2dp)
 *   10 convert — JPY uses 0 decimals, JOD uses 3 decimals
 *   11 convert — rejects non-finite amount
 *   12 setOverride — direct pair beats BoI
 *   13 setOverride — inverse path from reverse override
 *   14 setOverride — rejects non-positive rate
 *   15 Historical lookup — past date resolves from store
 *   16 Staleness — rate older than threshold flagged stale=true
 *   17 Weekend gap — fetching for Saturday returns last trading day rate
 *   18 Bank of Israel XML parsing — UNIT-scaled JPY rate
 *   19 loadRates from XML round-trips through getRate
 *   20 cacheStats — hits/misses tracked, LRU size reflects entries
 *   21 revalue — unrealized gain computed vs book value
 *   22 revalue — unrealized loss negative, aggregated by ccy
 *   23 revalue — returns IAS 21 tax notice bilingual
 *   24 revalue — empty positions returns zero totals
 *   25 purgeExpired — drops days older than cutoff
 *   26 Pluggable fetcher — refreshFromBoi uses injected fn
 *   27 Rounding — banker's rounding on .5 edge
 *   28 Triangle via USD — historic fallback when direct missing
 * ========================================================================== */

'use strict';

const path = require('path');
const {
  createFxEngine,
  FxError,
  parseBoiXml,
  round,
  currentRateDate,
  lastTradingDay,
  isIsraeliWeekend,
  SUPPORTED
} = require(path.join(__dirname, '..', '..', 'onyx-procurement', 'src', 'fx', 'fx-engine.js'));

/* ----------------------------------------------------------------------------
 * Tiny assertion + harness (no deps)
 * -------------------------------------------------------------------------- */
const results = [];

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertClose(actual, expected, eps, msg) {
  const e = eps == null ? 1e-9 : eps;
  if (Math.abs(actual - expected) > e) {
    throw new Error(`${msg || 'assertClose'}: expected ~${expected}, got ${actual} (eps=${e})`);
  }
}
function assertDeep(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || 'assertDeep'}: ${a} !== ${e}`);
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertTrue failed');
}
function assertThrowsWithCode(fn, code, msg) {
  try { fn(); }
  catch (err) {
    if (err && err.code === code) return;
    throw new Error(`${msg || 'assertThrows'}: expected code ${code}, got ${err && err.code}`);
  }
  throw new Error(`${msg || 'assertThrows'}: expected throw with code ${code}`);
}
async function assertRejectsCode(promise, code, msg) {
  try { await promise; }
  catch (err) {
    if (err && err.code === code) return;
    throw new Error(`${msg || 'assertRejects'}: expected code ${code}, got ${err && err.code}`);
  }
  throw new Error(`${msg || 'assertRejects'}: expected rejection with code ${code}`);
}

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok  - ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  FAIL- ${name}\n        ${err.message}`);
  }
}

/* ----------------------------------------------------------------------------
 * Shared fixtures
 * -------------------------------------------------------------------------- */
/**
 * Fixed "now" — Sunday 2026-04-12 11:00 UTC = 14:00 Jerusalem (after 10:00).
 * Sunday is a BoI trading day in Israel. rate date = 2026-04-12.
 * Rates loaded for 2026-04-12.
 */
const NOW_SUN_1400 = new Date('2026-04-12T11:00:00Z'); // Sun 14:00 IL
const NOW_SAT      = new Date('2026-04-11T12:00:00Z'); // Sat — weekend
const NOW_SUN_09   = new Date('2026-04-12T05:00:00Z'); // Sun 08:00 IL (before 10:00)

const SNAPSHOT_SUN_12 = {
  date: '2026-04-12',
  rates: {
    USD: 3.72,   // 1 USD = 3.72 ILS
    EUR: 4.01,
    GBP: 4.65,
    JPY: 0.024,  // 1 JPY = 0.024 ILS
    CHF: 4.10,
    CAD: 2.72,
    AUD: 2.45,
    HKD: 0.475,
    CNY: 0.515,
    JOD: 5.25,
    EGP: 0.078
  }
};

function freshEngine(now) {
  return createFxEngine({
    now: () => now || NOW_SUN_1400,
    staleHours: 48
  });
}

/* ----------------------------------------------------------------------------
 * Test cases
 * -------------------------------------------------------------------------- */
async function run() {
  console.log('fx-engine.test.js — Techno-Kol ERP multi-currency engine');
  console.log('-----------------------------------------------------------');

  await test('01 createFxEngine returns expected API shape', async () => {
    const e = freshEngine();
    for (const key of ['getRate','convert','revalue','loadRates','setOverride','refreshFromBoi','cacheStats','listCurrencies','purgeExpired','describeCurrency','dumpRates']) {
      assertEq(typeof e[key], 'function', `missing ${key}`);
    }
  });

  await test('02 listCurrencies covers primary basket of 12', async () => {
    const e = freshEngine();
    const list = e.listCurrencies();
    assertEq(list.length, 12, 'basket size');
    for (const c of ['ILS','USD','EUR','GBP','JPY','CHF','CAD','AUD','HKD','CNY','JOD','EGP']) {
      assertTrue(list.indexOf(c) >= 0, `missing ${c}`);
    }
  });

  await test('03 getRate same currency returns 1 with IDENTITY source', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const r = e.getRate('USD','USD','2026-04-12');
    assertEq(r.rate, 1);
    assertEq(r.source, 'IDENTITY');
    assertEq(r.stale, false);
  });

  await test('04 getRate USD->ILS direct BoI rate', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const r = e.getRate('USD','ILS','2026-04-12');
    assertEq(r.rate, 3.72);
    assertEq(r.source, 'BOI');
    assertEq(r.direction, 'direct');
  });

  await test('05 getRate ILS->USD returns inverse', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const r = e.getRate('ILS','USD','2026-04-12');
    assertClose(r.rate, 1 / 3.72, 1e-9);
    assertEq(r.source, 'BOI');
  });

  await test('06 getRate EUR->USD triangulated via ILS', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const r = e.getRate('EUR','USD','2026-04-12');
    // EUR->ILS / USD->ILS = 4.01 / 3.72
    assertClose(r.rate, 4.01 / 3.72, 1e-9);
    assertEq(r.direction, 'triangle');
    assertTrue(r.source.indexOf('/ILS') >= 0, 'source mentions ILS triangulation');
  });

  await test('07 getRate unknown currency throws FxError(UNKNOWN_CCY)', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    assertThrowsWithCode(() => e.getRate('ZZZ','ILS','2026-04-12'), 'UNKNOWN_CCY');
  });

  await test('08 getRate date without rates throws RATE_NOT_FOUND', async () => {
    const e = freshEngine();
    // No loadRates() called — should not find anything
    assertThrowsWithCode(() => e.getRate('USD','ILS','2026-04-12'), 'RATE_NOT_FOUND');
  });

  await test('09 convert rounds to target decimals (ILS 2dp)', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const c = e.convert(100, 'USD', 'ILS', '2026-04-12');
    assertEq(c.converted, 372);
    assertEq(c.from, 'USD');
    assertEq(c.to, 'ILS');
  });

  await test('10 JPY uses 0 decimals, JOD uses 3 decimals', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    // 1000 USD -> JPY: 3.72/0.024 = 155 -> 155000 JPY integer
    const cJpy = e.convert(1000, 'USD', 'JPY', '2026-04-12');
    assertEq(Math.floor(cJpy.converted), cJpy.converted, 'JPY should be integer');
    // 100 USD -> JOD: (100*3.72)/5.25 = 70.857... round 3dp
    const cJod = e.convert(100, 'USD', 'JOD', '2026-04-12');
    // Should have at most 3 decimals
    const str = cJod.converted.toString();
    const dotIdx = str.indexOf('.');
    if (dotIdx >= 0) {
      assertTrue(str.length - dotIdx - 1 <= 3, `JOD decimals should be ≤3, got ${str}`);
    }
  });

  await test('11 convert rejects non-finite amount', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    assertThrowsWithCode(() => e.convert(NaN,'USD','ILS','2026-04-12'), 'BAD_AMOUNT');
    assertThrowsWithCode(() => e.convert(Infinity,'USD','ILS','2026-04-12'), 'BAD_AMOUNT');
    assertThrowsWithCode(() => e.convert('abc','USD','ILS','2026-04-12'), 'BAD_AMOUNT');
  });

  await test('12 setOverride direct pair beats BoI', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    e.setOverride('USD','ILS', 3.95, '2026-04-12');
    const r = e.getRate('USD','ILS','2026-04-12');
    assertEq(r.rate, 3.95);
    assertEq(r.source, 'OVERRIDE');
  });

  await test('13 setOverride inverse path from reverse override', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    e.setOverride('ILS','USD', 0.25, '2026-04-12');
    // Now USD->ILS should equal 1/0.25 = 4
    const r = e.getRate('USD','ILS','2026-04-12');
    assertClose(r.rate, 4, 1e-9);
    assertEq(r.source, 'OVERRIDE_INV');
  });

  await test('14 setOverride rejects non-positive rate', async () => {
    const e = freshEngine();
    assertThrowsWithCode(() => e.setOverride('USD','ILS', 0, '2026-04-12'), 'BAD_RATE');
    assertThrowsWithCode(() => e.setOverride('USD','ILS', -1, '2026-04-12'), 'BAD_RATE');
  });

  await test('15 Historical lookup resolves from store', async () => {
    const e = freshEngine();
    e.loadRates({ date: '2025-12-31', rates: { USD: 3.65, EUR: 3.95 } });
    const r = e.getRate('USD','ILS','2025-12-31');
    assertEq(r.rate, 3.65);
    assertEq(r.asOf, '2025-12-31');
  });

  await test('16 Staleness: rate older than threshold flagged stale', async () => {
    const e = createFxEngine({ now: () => NOW_SUN_1400, staleHours: 24 });
    e.loadRates({ date: '2026-04-05', rates: { USD: 3.70 } });
    // Query 2026-04-12 — nothing for that day, so fallback to 2026-04-05
    const r = e.getRate('USD','ILS','2026-04-12');
    assertEq(r.rate, 3.70);
    assertEq(r.stale, true, 'should be stale (>24h)');
  });

  await test('17 Weekend gap returns last trading day', async () => {
    // Saturday 2026-04-11 → last trading Thu 2026-04-09 (since Fri is also weekend)
    assertTrue(isIsraeliWeekend('2026-04-11'), 'Sat is weekend');
    assertTrue(isIsraeliWeekend('2026-04-10'), 'Fri is weekend');
    assertEq(lastTradingDay('2026-04-11'), '2026-04-09');
    const cur = currentRateDate(NOW_SAT);
    assertEq(cur, '2026-04-09');
  });

  await test('18 Bank of Israel XML parsing with UNIT scaling', async () => {
    const xml = `<?xml version="1.0"?>
      <CURRENCIES>
        <LAST_UPDATE>2026-04-12</LAST_UPDATE>
        <CURRENCY>
          <CURRENCYCODE>USD</CURRENCYCODE>
          <NAME>Dollar</NAME>
          <RATE>3.7200</RATE>
          <UNIT>1</UNIT>
          <CHANGE>0.15</CHANGE>
        </CURRENCY>
        <CURRENCY>
          <CURRENCYCODE>JPY</CURRENCYCODE>
          <NAME>Yen</NAME>
          <RATE>2.4000</RATE>
          <UNIT>100</UNIT>
          <CHANGE>-0.10</CHANGE>
        </CURRENCY>
      </CURRENCIES>`;
    const p = parseBoiXml(xml);
    assertEq(p.asOf, '2026-04-12');
    assertClose(p.rates.USD.rate, 3.72);
    // JPY is 2.40 per 100 yen → 0.024 per yen
    assertClose(p.rates.JPY.rate, 0.024);
  });

  await test('19 loadRates from XML round-trips through getRate', async () => {
    const xml = `<CURRENCIES><LAST_UPDATE>2026-04-12</LAST_UPDATE>
      <CURRENCY><CURRENCYCODE>USD</CURRENCYCODE><RATE>3.7200</RATE><UNIT>1</UNIT></CURRENCY>
      <CURRENCY><CURRENCYCODE>EUR</CURRENCYCODE><RATE>4.0100</RATE><UNIT>1</UNIT></CURRENCY>
    </CURRENCIES>`;
    const e = freshEngine();
    e.loadRates(xml);
    const r = e.getRate('USD','ILS','2026-04-12');
    assertEq(r.rate, 3.72);
    const r2 = e.getRate('EUR','USD','2026-04-12');
    assertClose(r2.rate, 4.01/3.72, 1e-9);
  });

  await test('20 cacheStats hits/misses tracked', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    e.getRate('USD','ILS','2026-04-12'); // miss
    e.getRate('USD','ILS','2026-04-12'); // hit
    e.getRate('USD','ILS','2026-04-12'); // hit
    const s = e.cacheStats();
    assertEq(s.hits, 2);
    assertEq(s.misses, 1);
    assertTrue(s.size >= 1);
  });

  await test('21 revalue computes unrealized gain vs book value', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    // Held 1000 USD booked at 3.60 ILS; closing at 3.72 → gain 120 ILS
    const res = e.revalue(
      [{ id: 'INV-1', currency: 'USD', amount: 1000, bookRateIls: 3.60 }],
      '2026-04-12'
    );
    assertEq(res.lines.length, 1);
    assertEq(res.lines[0].closingValueIls, 3720);
    assertEq(res.lines[0].bookValueIls, 3600);
    assertEq(res.lines[0].unrealizedIls, 120);
    assertEq(res.totalUnrealizedIls, 120);
  });

  await test('22 revalue aggregates by currency with losses', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const res = e.revalue([
      { currency: 'USD', amount: 1000, bookValueIls: 3800 }, // loss 80
      { currency: 'USD', amount: 500,  bookValueIls: 2000 }, // gain -140 (1860-2000 = -140)... actually 500*3.72=1860, so loss 140
      { currency: 'EUR', amount: 250,  bookValueIls: 1000 }  // 250*4.01=1002.50 → gain 2.5
    ], '2026-04-12');
    const byUsd = res.byCurrency.find((x) => x.currency === 'USD');
    const byEur = res.byCurrency.find((x) => x.currency === 'EUR');
    assertTrue(byUsd.unrealizedIls < 0, 'USD line aggregated as loss');
    assertTrue(byEur.unrealizedIls > 0, 'EUR line aggregated as gain');
    // grand total is sum of both
    assertClose(res.totalUnrealizedIls, byUsd.unrealizedIls + byEur.unrealizedIls, 0.01);
  });

  await test('23 revalue returns IAS 21 tax notice bilingual', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const res = e.revalue([{ currency: 'USD', amount: 100 }], '2026-04-12');
    assertTrue(typeof res.taxNotice.en === 'string' && res.taxNotice.en.indexOf('IAS 21') >= 0);
    assertTrue(typeof res.taxNotice.he === 'string' && res.taxNotice.he.indexOf('IAS 21') >= 0);
  });

  await test('24 revalue empty positions returns zero totals', async () => {
    const e = freshEngine();
    e.loadRates(SNAPSHOT_SUN_12);
    const res = e.revalue([], '2026-04-12');
    assertEq(res.lines.length, 0);
    assertEq(res.totalUnrealizedIls, 0);
    assertEq(res.byCurrency.length, 0);
    assertEq(res.stale, false);
  });

  await test('25 purgeExpired drops days older than cutoff', async () => {
    const e = freshEngine();
    e.loadRates({ date: '2024-01-01', rates: { USD: 3.50 } });
    e.loadRates({ date: '2025-06-15', rates: { USD: 3.65 } });
    e.loadRates({ date: '2026-04-12', rates: { USD: 3.72 } });
    // default purge (anchor now, 400 days) should drop 2024-01-01
    const n = e.purgeExpired('2026-04-12', 400);
    assertTrue(n >= 1, 'should purge at least one day');
    // 2026-04-12 must still be present
    const r = e.getRate('USD','ILS','2026-04-12');
    assertEq(r.rate, 3.72);
  });

  await test('26 Pluggable fetcher: refreshFromBoi uses injected fn', async () => {
    let called = 0;
    const fakeFetcher = async (url) => {
      called += 1;
      assertTrue(url.indexOf('boi.org.il') >= 0, 'called BoI URL');
      return `<CURRENCIES><LAST_UPDATE>2026-04-12</LAST_UPDATE>
        <CURRENCY><CURRENCYCODE>USD</CURRENCYCODE><RATE>3.8800</RATE><UNIT>1</UNIT></CURRENCY>
        </CURRENCIES>`;
    };
    const e = createFxEngine({
      now: () => NOW_SUN_1400,
      fetcher: fakeFetcher
    });
    const out = await e.refreshFromBoi();
    assertEq(called, 1);
    assertEq(out.count >= 1, true);
    const r = e.getRate('USD','ILS','2026-04-12');
    assertEq(r.rate, 3.88);
    assertEq(r.source, 'BOI');
  });

  await test('27 Rounding: banker\'s rounding on .5 edge', async () => {
    // 2.5 -> 2 (round half to even)
    // 3.5 -> 4
    // 2.125 -> 2.12 (banker: 2 is even)
    // 2.135 -> 2.14 (nearest)
    assertEq(round(2.5, 'JPY'), 2, 'JPY 0dp: 2.5 -> 2');
    assertEq(round(3.5, 'JPY'), 4, 'JPY 0dp: 3.5 -> 4');
    assertEq(round(10, 'ILS'), 10);
    assertEq(round(10.005, 'ILS'), 10.01);
  });

  await test('28 Triangle via USD: historic fallback when direct missing', async () => {
    // Load rates for past dates, none for query date
    const e = createFxEngine({ now: () => NOW_SUN_1400, staleHours: 1 });
    e.loadRates({ date: '2026-04-01', rates: { USD: 3.71, EUR: 4.00, GBP: 4.60 } });
    // Query a pair on 2026-04-12 — no rates, should resolve with stale flag
    const r = e.getRate('EUR','GBP','2026-04-12');
    assertTrue(r.rate > 0, 'rate computed');
    assertEq(r.stale, true);
    // EUR/GBP should be ~ 4.00/4.60
    assertClose(r.rate, 4.00/4.60, 1e-9);
  });

  /* ------------------------------------------------------------------ */
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log('-----------------------------------------------------------');
  console.log(`  ${pass}/${results.length} passed, ${fail} failed`);
  if (fail > 0) {
    for (const r of results) if (!r.ok) console.log(`  FAIL ${r.name}: ${r.error}`);
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('RUNNER CRASH:', err);
  process.exitCode = 2;
});
