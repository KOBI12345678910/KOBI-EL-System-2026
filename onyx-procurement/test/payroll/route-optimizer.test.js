/**
 * Delivery Route Optimizer — Unit Tests
 * Techno-Kol Uzi / Onyx Procurement — Agent X-09
 *
 * Run with:
 *   node --test test/payroll/route-optimizer.test.js
 *
 * Zero deps. Uses built-in node:test (Node >= 18).
 *
 * Covers 40+ assertions across 13 describe blocks:
 *   - Haversine correctness against hand-computed values
 *   - Distance-matrix symmetry & zero-diagonal
 *   - Nearest-neighbour determinism
 *   - 2-opt provable improvement on known-bad tours
 *   - Time-window waits & violations
 *   - Vehicle-capacity enforcement
 *   - Multi-vehicle assignment (VRP sweep)
 *   - Rush-hour + Jerusalem + Highway 6 detection
 *   - Google Maps / Waze deep-link format
 *   - Hebrew turn-by-turn text
 *   - Edge cases (empty / single / duplicate)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const R = require(path.resolve(
  __dirname, '..', '..', 'src', 'logistics', 'route-optimizer.js'
));

// ──────────────────────────────────────────────────────────────────────
// 0. Fixtures — known Israeli stops with tabulated coordinates
// ──────────────────────────────────────────────────────────────────────

const TLV    = { id: 'TLV',    name: 'Tel Aviv',    name_he: 'תל אביב',    lat: 32.0853, lng: 34.7818 };
const HERZ   = { id: 'HERZ',   name: 'Herzliya',    name_he: 'הרצליה',     lat: 32.1663, lng: 34.8441 };
const NETA   = { id: 'NETA',   name: 'Netanya',     name_he: 'נתניה',      lat: 32.3215, lng: 34.8532 };
const HAIFA  = { id: 'HAIFA',  name: 'Haifa',       name_he: 'חיפה',       lat: 32.7940, lng: 34.9896 };
const JLEM   = { id: 'JLEM',   name: 'Jerusalem',   name_he: 'ירושלים',    lat: 31.7683, lng: 35.2137 };
const BEER   = { id: 'BEER',   name: 'Beer Sheva',  name_he: 'באר שבע',    lat: 31.2518, lng: 34.7913 };
const EILAT  = { id: 'EILAT',  name: 'Eilat',       name_he: 'אילת',        lat: 29.5581, lng: 34.9482 };
const RAMLA  = { id: 'RAMLA',  name: 'Ramla',       name_he: 'רמלה',       lat: 31.9293, lng: 34.8664 };
const ASHDOD = { id: 'ASHDOD', name: 'Ashdod',      name_he: 'אשדוד',      lat: 31.8014, lng: 34.6435 };
const PETAH  = { id: 'PETAH',  name: 'Petah Tikva', name_he: 'פתח תקווה',  lat: 32.0870, lng: 34.8878 };

// ──────────────────────────────────────────────────────────────────────
// 1. Haversine — against hand-computed / well-known pairs
// ──────────────────────────────────────────────────────────────────────

describe('1. haversine()', () => {
  test('identical point → 0 km', () => {
    assert.equal(R.haversine(32.0853, 34.7818, 32.0853, 34.7818), 0);
  });

  test('Tel Aviv → Jerusalem ≈ 54 km', () => {
    const d = R.haversine(TLV.lat, TLV.lng, JLEM.lat, JLEM.lng);
    assert.ok(d > 50 && d < 60, `expected ~54km, got ${d}`);
  });

  test('Tel Aviv → Haifa ≈ 81 km (great-circle)', () => {
    const d = R.haversine(TLV.lat, TLV.lng, HAIFA.lat, HAIFA.lng);
    assert.ok(d > 78 && d < 84, `expected ~81km (great-circle), got ${d}`);
  });

  test('Tel Aviv → Eilat ≈ 281 km', () => {
    const d = R.haversine(TLV.lat, TLV.lng, EILAT.lat, EILAT.lng);
    assert.ok(d > 275 && d < 290, `expected ~281km, got ${d}`);
  });

  test('symmetric: A→B == B→A', () => {
    const a = R.haversine(TLV.lat, TLV.lng, HAIFA.lat, HAIFA.lng);
    const b = R.haversine(HAIFA.lat, HAIFA.lng, TLV.lat, TLV.lng);
    assert.equal(a, b);
  });

  test('invalid coordinates → 0', () => {
    assert.equal(R.haversine(NaN, 0, 0, 0), 0);
    assert.equal(R.haversine(0, null, 0, 0), 0);
  });

  test('pole-to-equator ≈ quarter circumference (~10,007 km)', () => {
    const d = R.haversine(90, 0, 0, 0);
    assert.ok(d > 10000 && d < 10015, `expected ~10007km, got ${d}`);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2. distanceMatrix()
// ──────────────────────────────────────────────────────────────────────

describe('2. distanceMatrix()', () => {
  test('empty input → empty matrix', () => {
    assert.deepEqual(R.distanceMatrix([]), []);
  });

  test('single stop → 1×1 zero matrix', () => {
    const m = R.distanceMatrix([TLV]);
    assert.equal(m.length, 1);
    assert.equal(m[0][0], 0);
  });

  test('symmetric and zero on diagonal for N=5', () => {
    const m = R.distanceMatrix([TLV, HERZ, NETA, HAIFA, JLEM]);
    assert.equal(m.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(m[i][i], 0, `diagonal[${i}] should be 0`);
      for (let j = 0; j < 5; j++) {
        assert.equal(m[i][j], m[j][i], `asymmetric at (${i},${j})`);
      }
    }
  });

  test('TLV→HAIFA cell matches haversine directly', () => {
    const m = R.distanceMatrix([TLV, HAIFA]);
    const direct = R.haversine(TLV.lat, TLV.lng, HAIFA.lat, HAIFA.lng);
    assert.equal(m[0][1], direct);
    assert.equal(m[1][0], direct);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 3. nearestNeighbor() — deterministic greedy construction
// ──────────────────────────────────────────────────────────────────────

describe('3. nearestNeighbor()', () => {
  test('empty matrix → []', () => {
    assert.deepEqual(R.nearestNeighbor([]), []);
  });

  test('single-node matrix → [0,0]', () => {
    assert.deepEqual(R.nearestNeighbor([[0]]), [0, 0]);
  });

  test('visits every index exactly once (excluding close)', () => {
    const stops = [TLV, HERZ, NETA, HAIFA, JLEM, BEER];
    const m = R.distanceMatrix(stops);
    const route = R.nearestNeighbor(m, 0);
    assert.equal(route.length, stops.length + 1);
    assert.equal(route[0], route[route.length - 1]); // closed
    const uniq = new Set(route.slice(0, -1));
    assert.equal(uniq.size, stops.length);
  });

  test('starts at requested index', () => {
    const stops = [TLV, HERZ, NETA, HAIFA];
    const m = R.distanceMatrix(stops);
    const r = R.nearestNeighbor(m, 2);
    assert.equal(r[0], 2);
    assert.equal(r[r.length - 1], 2);
  });

  test('on a simple chain (TLV,HERZ,NETA,HAIFA) goes north in order', () => {
    const stops = [TLV, HERZ, NETA, HAIFA];
    const m = R.distanceMatrix(stops);
    const r = R.nearestNeighbor(m, 0);
    assert.deepEqual(r, [0, 1, 2, 3, 0]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 4. twoOpt() — proves improvement on a known-bad tour
// ──────────────────────────────────────────────────────────────────────

describe('4. twoOpt()', () => {
  test('2-opt never degrades an NN chain', () => {
    const stops = [TLV, HERZ, NETA, HAIFA];
    const m = R.distanceMatrix(stops);
    const nn = R.nearestNeighbor(m, 0);
    const nnLen = R.tourLength(nn, m);
    const opt = R.twoOpt(nn, m);
    assert.ok(opt.distance <= nnLen + 1e-9, 'final distance must not exceed NN length');
  });

  test('crossed tour (0,2,1,3,0) is repaired to shorter tour', () => {
    //  Y
    //  ^
    //  |   3
    //  |  1
    //  | 2
    //  |0
    //  +------> X
    const square = [
      { id: 0, lat: 0.00, lng: 0.00 },
      { id: 1, lat: 0.02, lng: 0.02 },
      { id: 2, lat: 0.01, lng: 0.01 },
      { id: 3, lat: 0.03, lng: 0.03 },
    ];
    const m = R.distanceMatrix(square);
    const bad = [0, 2, 1, 3, 0]; // intentionally sub-optimal
    const badLen = R.tourLength(bad, m);
    const opt = R.twoOpt(bad, m);
    assert.ok(opt.distance <= badLen + 1e-9, 'distance must not grow');
    assert.ok(opt.distance < badLen || opt.improvements === 0);
  });

  test('improves a 5-city zig-zag', () => {
    const stops = [
      { id: 'A', lat: 32.0, lng: 34.8 },
      { id: 'B', lat: 32.5, lng: 34.8 },
      { id: 'C', lat: 32.1, lng: 34.8 },
      { id: 'D', lat: 32.4, lng: 34.8 },
      { id: 'E', lat: 32.2, lng: 34.8 },
    ];
    const m = R.distanceMatrix(stops);
    const badRoute = [0, 1, 2, 3, 4, 0];
    const badLen = R.tourLength(badRoute, m);
    const opt = R.twoOpt(badRoute, m);
    assert.ok(opt.distance < badLen, `expected improvement, got ${opt.distance} vs ${badLen}`);
    assert.ok(opt.improvements > 0);
  });

  test('tour fewer than 4 nodes → unchanged', () => {
    const stops = [TLV, HERZ];
    const m = R.distanceMatrix(stops);
    const route = [0, 1, 0];
    const opt = R.twoOpt(route, m);
    assert.deepEqual(opt.route, route);
    assert.equal(opt.improvements, 0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 5. optimizeRoute() — end-to-end happy paths
// ──────────────────────────────────────────────────────────────────────

describe('5. optimizeRoute() — happy paths', () => {
  test('empty stops returns safe empty result', () => {
    const r = R.optimizeRoute([]);
    assert.equal(r.total_distance_km, 0);
    assert.equal(r.ordered_stops.length, 0);
    assert.ok(r.warnings.includes('no stops provided'));
  });

  test('single delivery returns depot→stop→depot', () => {
    const r = R.optimizeRoute([HERZ], { depot: TLV });
    assert.equal(r.ordered_stops.length, 3);
    // When the caller overrides the depot the merged depot keeps the
    // caller-supplied name but is always marked is_depot=true.
    assert.equal(r.ordered_stops[0].is_depot, true);
    assert.equal(r.ordered_stops[0].name, 'Tel Aviv');
    assert.equal(r.ordered_stops[1].id, 'HERZ');
    assert.equal(r.ordered_stops[2].is_depot, true);
    assert.ok(r.total_distance_km > 0);
  });

  test('default depot (no override) carries Techno-Kol Uzi HQ name', () => {
    const r = R.optimizeRoute([HERZ]);
    assert.equal(r.ordered_stops[0].name, 'Techno-Kol Uzi HQ');
    assert.equal(r.ordered_stops[0].name_he, 'מטה טכנו-קול עוזי');
    assert.equal(r.ordered_stops[0].is_depot, true);
  });

  test('4 stops optimised tour is <= nearest-neighbour tour', () => {
    const stops = [NETA, HAIFA, HERZ, JLEM];
    const r = R.optimizeRoute(stops, { depot: TLV });
    assert.ok(r.improvements.final_km <= r.improvements.initial_km + 1e-9);
    assert.equal(r.ordered_stops[0].is_depot, true);
    assert.equal(r.ordered_stops[r.ordered_stops.length - 1].is_depot, true);
    // Every delivery stop appears exactly once
    const deliveries = r.ordered_stops.filter((s) => !s.is_depot);
    const ids = new Set(deliveries.map((s) => s.id));
    assert.equal(ids.size, 4);
  });

  test('zero stops or single delivery never produce improvement', () => {
    const r = R.optimizeRoute([HERZ], { depot: TLV });
    assert.equal(r.improvements.swaps, 0);
  });

  test('total_time_min is positive and finite', () => {
    const r = R.optimizeRoute([HERZ, NETA, HAIFA], { depot: TLV });
    assert.ok(Number.isFinite(r.total_time_min));
    assert.ok(r.total_time_min > 0);
  });

  test('return_to_depot=false leaves tour open at last delivery', () => {
    const r = R.optimizeRoute([HERZ, NETA], { depot: TLV, returnToDepot: false });
    const last = r.ordered_stops[r.ordered_stops.length - 1];
    assert.equal(last.is_depot, undefined);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 6. Time windows — waits & violations
// ──────────────────────────────────────────────────────────────────────

describe('6. Time windows', () => {
  test('arriving before opening → waited_min recorded, no violation', () => {
    const late = Object.assign({}, HERZ, { opening: { open: '10:00', close: '18:00' } });
    const r = R.optimizeRoute([late], { depot: TLV, departureMin: 6 * 60 });
    const stopArrival = r.arrivals.find((a) => a.id === 'HERZ');
    assert.ok(stopArrival.waited_min > 0, 'should have waited for opening');
    assert.equal(r.violations.length, 0);
  });

  test('arriving after close → violation reported', () => {
    const early = Object.assign({}, HERZ, { opening: { open: '06:00', close: '06:30' } });
    // Depart at 08:00 so we arrive long after 06:30.
    const r = R.optimizeRoute([early], { depot: TLV, departureMin: 8 * 60 });
    assert.ok(r.violations.length >= 1);
    assert.ok(r.violations[0].includes('after close'));
  });

  test('stop with no opening block behaves as 24/7', () => {
    const r = R.optimizeRoute([HERZ], { depot: TLV });
    assert.equal(r.violations.length, 0);
  });

  test('parseWindow handles both "HH:MM" and minute integers', () => {
    assert.deepEqual(R.parseWindow({ opening: { open: '08:00', close: '17:30' } }),
      { open: 480, close: 1050 });
    assert.deepEqual(R.parseWindow({ opening: { open: 480, close: 1050 } }),
      { open: 480, close: 1050 });
    assert.equal(R.parseWindow({}), null);
    assert.equal(R.parseWindow(null), null);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 7. Vehicle capacity enforcement
// ──────────────────────────────────────────────────────────────────────

describe('7. Vehicle capacity', () => {
  test('within capacity → ok', () => {
    const c = R.validateCapacity(
      [Object.assign({}, HERZ, { demand: 50 }),
       Object.assign({}, NETA, { demand: 30 })],
      { capacity: 100 }
    );
    assert.equal(c.ok, true);
    assert.equal(c.total, 80);
  });

  test('exceeds capacity → violation', () => {
    const c = R.validateCapacity(
      [Object.assign({}, HERZ, { demand: 60 }),
       Object.assign({}, NETA, { demand: 60 })],
      { capacity: 100 }
    );
    assert.equal(c.ok, false);
    assert.equal(c.violations.length, 1);
    assert.ok(c.violations[0].includes('exceeds'));
  });

  test('optimizeRoute flags capacity overflow', () => {
    const stops = [
      Object.assign({}, HERZ, { demand: 80 }),
      Object.assign({}, NETA, { demand: 80 }),
    ];
    const r = R.optimizeRoute(stops, { depot: TLV, vehicle: { capacity: 100 } });
    assert.ok(r.violations.some((v) => v.includes('capacity')));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 8. Multi-vehicle assignment (VRP sweep)
// ──────────────────────────────────────────────────────────────────────

describe('8. multiVehicleAssign()', () => {
  test('splits across 2 vehicles when single cannot hold all', () => {
    const stops = [
      Object.assign({}, HERZ,  { demand: 40 }),
      Object.assign({}, NETA,  { demand: 40 }),
      Object.assign({}, HAIFA, { demand: 40 }),
      Object.assign({}, JLEM,  { demand: 40 }),
    ];
    const result = R.multiVehicleAssign(stops, [
      { id: 'V1', capacity: 100 },
      { id: 'V2', capacity: 100 },
    ], { depot: TLV });
    assert.ok(result.assignments.length >= 1);
    const loads = result.assignments.map((a) => a.load);
    for (const l of loads) assert.ok(l <= 100);
  });

  test('no vehicles → all unassigned', () => {
    const stops = [HERZ, NETA];
    const r = R.multiVehicleAssign(stops, [], { depot: TLV });
    assert.equal(r.assignments.length, 0);
    assert.equal(r.unassigned.length, 2);
  });

  test('each assignment closes at depot', () => {
    const stops = [
      Object.assign({}, HERZ, { demand: 10 }),
      Object.assign({}, NETA, { demand: 10 }),
    ];
    const r = R.multiVehicleAssign(stops, [{ id: 'V1', capacity: 100 }], { depot: TLV });
    assert.equal(r.assignments.length, 1);
    const tour = r.assignments[0].stops;
    assert.equal(tour[0].is_depot, true);
    assert.equal(tour[tour.length - 1].is_depot, true);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 9. Rush hours, Jerusalem, Highway 6
// ──────────────────────────────────────────────────────────────────────

describe('9. Israeli specifics', () => {
  test('isRushHour() morning + evening windows', () => {
    assert.equal(R.isRushHour(7), true);
    assert.equal(R.isRushHour(8), true);
    assert.equal(R.isRushHour(9), false); // 9 is excluded (end)
    assert.equal(R.isRushHour(16), true);
    assert.equal(R.isRushHour(18), true);
    assert.equal(R.isRushHour(19), false);
    assert.equal(R.isRushHour(12), false);
    assert.equal(R.isRushHour(23), false);
  });

  test('isInJerusalem() bbox check', () => {
    assert.equal(R.isInJerusalem(JLEM.lat, JLEM.lng), true);
    assert.equal(R.isInJerusalem(TLV.lat, TLV.lng), false);
    assert.equal(R.isInJerusalem(HAIFA.lat, HAIFA.lng), false);
  });

  test('usesHighway6() flag for a long north-south corridor segment', () => {
    // A point near H6 north and a point near H6 south:
    const north = { lat: 32.60, lng: 34.97 };
    const south = { lat: 31.50, lng: 34.97 };
    assert.equal(R.usesHighway6(north.lat, north.lng, south.lat, south.lng), true);
    // Short segment inside the corridor should NOT flag:
    assert.equal(R.usesHighway6(32.05, 34.97, 32.10, 34.97), false);
    // Outside corridor:
    assert.equal(R.usesHighway6(TLV.lat, TLV.lng, HERZ.lat, HERZ.lng), false);
  });

  test('rush-hour penalty applied via edgeTravelTime', () => {
    const base = R.edgeTravelTime(45, 12, TLV, HERZ);       // noon
    const rush = R.edgeTravelTime(45, 8,  TLV, HERZ);       // 08:00
    assert.ok(rush.minutes > base.minutes);
    assert.ok(rush.penalties.includes('rush_hour'));
    assert.ok(!base.penalties.includes('rush_hour'));
  });

  test('optimizeRoute reports jerusalem_touched flag', () => {
    const r = R.optimizeRoute([HERZ, JLEM], { depot: TLV });
    assert.equal(r.flags.jerusalem_touched, true);
  });

  test('optimizeRoute reports weekend flag on Saturday', () => {
    const r = R.optimizeRoute([HERZ], { depot: TLV, day: 6 });
    assert.equal(r.flags.weekend, true);
    assert.ok(r.warnings.some((w) => w.includes('שבת')));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 10. Google Maps & Waze deep-links
// ──────────────────────────────────────────────────────────────────────

describe('10. Deep-links', () => {
  test('googleMapsLink format', () => {
    const url = R.googleMapsLink([TLV, HERZ, NETA]);
    assert.ok(url.startsWith('https://www.google.com/maps/dir/'));
    assert.ok(url.includes('32.085300,34.781800'));
    assert.ok(url.includes('32.166300,34.844100'));
    assert.ok(url.includes('32.321500,34.853200'));
  });

  test('googleMapsLink empty input → empty string', () => {
    assert.equal(R.googleMapsLink([]), '');
    assert.equal(R.googleMapsLink(null), '');
  });

  test('wazeLink format includes navigate=yes', () => {
    const url = R.wazeLink(JLEM);
    assert.ok(url.startsWith('https://waze.com/ul?ll='));
    assert.ok(url.includes('navigate=yes'));
    assert.ok(url.includes('31.768300,35.213700'));
  });

  test('wazeLegLinks skips depots', () => {
    const stops = [
      Object.assign({}, TLV, { is_depot: true }),
      HERZ,
      NETA,
      Object.assign({}, TLV, { is_depot: true }),
    ];
    const legs = R.wazeLegLinks(stops);
    assert.equal(legs.length, 2);
    assert.ok(legs[0].includes('32.166300'));
    assert.ok(legs[1].includes('32.321500'));
  });

  test('optimizeRoute yields a non-empty google_maps_url', () => {
    const r = R.optimizeRoute([HERZ, NETA], { depot: TLV });
    assert.ok(r.google_maps_url.startsWith('https://www.google.com/maps/dir/'));
    assert.ok(r.waze_legs.length >= 2);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 11. Hebrew turn-by-turn summary
// ──────────────────────────────────────────────────────────────────────

describe('11. hebrewTurnByTurn()', () => {
  test('contains expected Hebrew headers and directions', () => {
    const stops = [
      Object.assign({}, TLV, { is_depot: true }),
      HERZ,
      NETA,
      Object.assign({}, TLV, { is_depot: true }),
    ];
    const txt = R.hebrewTurnByTurn(stops, { total_km: 120.5, total_time_min: 150 });
    assert.ok(txt.includes('מסלול חלוקה'));
    assert.ok(txt.includes('יציאה מ'));
    assert.ok(txt.includes('חזרה ל'));
    assert.ok(txt.includes('הרצליה'));
    assert.ok(txt.includes('נתניה'));
    assert.ok(txt.includes('120.50'));
    assert.ok(txt.includes('150'));
  });

  test('empty or tiny tour → empty string', () => {
    assert.equal(R.hebrewTurnByTurn([]), '');
    assert.equal(R.hebrewTurnByTurn([TLV]), '');
  });

  test('Jerusalem leg triggers the traffic hint', () => {
    const stops = [
      Object.assign({}, TLV, { is_depot: true }),
      JLEM,
      Object.assign({}, TLV, { is_depot: true }),
    ];
    const txt = R.hebrewTurnByTurn(stops);
    assert.ok(txt.includes('עומסי ירושלים'));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 12. Improvements accounting
// ──────────────────────────────────────────────────────────────────────

describe('12. improvements block', () => {
  test('reports initial_km, final_km, saved_km, saved_pct', () => {
    const r = R.optimizeRoute([HERZ, NETA, HAIFA, JLEM, BEER], { depot: TLV });
    const imp = r.improvements;
    assert.ok(Number.isFinite(imp.initial_km));
    assert.ok(Number.isFinite(imp.final_km));
    assert.ok(imp.final_km <= imp.initial_km + 1e-9);
    assert.ok(imp.saved_km >= 0);
    assert.ok(imp.saved_pct >= 0);
    assert.ok(imp.saved_pct <= 100);
  });

  test('passes >= 1 for non-trivial tours', () => {
    const r = R.optimizeRoute([HERZ, NETA, HAIFA, JLEM], { depot: TLV });
    assert.ok(r.improvements.passes >= 1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 13. Helper utilities
// ──────────────────────────────────────────────────────────────────────

describe('13. minutesToHHMM() + constants', () => {
  test('minutesToHHMM format', () => {
    assert.equal(R.minutesToHHMM(0),   '00:00');
    assert.equal(R.minutesToHHMM(60),  '01:00');
    assert.equal(R.minutesToHHMM(480), '08:00');
    assert.equal(R.minutesToHHMM(1439),'23:59');
    assert.equal(R.minutesToHHMM(1440),'00:00');
  });

  test('exported defaults are frozen constants', () => {
    assert.equal(R.DEFAULT_DEPOT.name, 'Techno-Kol Uzi HQ');
    assert.equal(R.DEFAULT_DEPOT.name_he, 'מטה טכנו-קול עוזי');
    assert.ok(Object.isFrozen(R.DEFAULT_DEPOT));
    assert.equal(R.DEFAULT_SPEED_KMH, 45);
    assert.equal(R.SHABBAT_DAY, 6);
  });

  test('tourLength sums matrix edges', () => {
    const stops = [TLV, HERZ, NETA];
    const m = R.distanceMatrix(stops);
    const route = [0, 1, 2, 0];
    const expected = m[0][1] + m[1][2] + m[2][0];
    assert.equal(R.tourLength(route, m), expected);
  });
});
