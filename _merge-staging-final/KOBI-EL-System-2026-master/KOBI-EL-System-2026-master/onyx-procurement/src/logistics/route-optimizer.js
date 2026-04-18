/**
 * Delivery Route Optimizer — Techno-Kol Uzi / Onyx Procurement
 * Agent X-09 (Swarm 3, Mega-ERP 2026)
 *
 * מיטוב מסלולי חלוקה — אלגוריתם TSP היוריסטי בלתי-תלוי תלויות.
 *
 * Responsibilities
 *   1. Great-circle distance (Haversine) between two WGS-84 points.
 *   2. Full N×N distance matrix for a set of stops.
 *   3. Nearest-neighbour initial tour (greedy).
 *   4. 2-opt improvement (edge swap) until no further gain.
 *   5. Time-window awareness (opening hours per stop).
 *   6. Vehicle-capacity constraint (VRP-lite).
 *   7. Israeli specifics: rush hours, weekend restrictions, Jerusalem
 *      traffic penalty, Highway-6 toll flag.
 *   8. Deep-links for Google Maps / Waze and a Hebrew turn-by-turn
 *      textual summary for the driver.
 *
 * Exports
 *   - optimizeRoute(stops, options)
 *   - haversine(lat1, lon1, lat2, lon2)
 *   - distanceMatrix(stops)
 *   - nearestNeighbor(matrix, start)
 *   - twoOpt(route, matrix)
 *   - multiVehicleAssign(stops, vehicles)
 *   - googleMapsLink(stops)  /  wazeLink(stop)
 *   - hebrewTurnByTurn(orderedStops)
 *
 * Zero dependencies. Pure JS. Node >= 14. Browser-safe (no `require`).
 *
 * Author: Agent X-09
 * Date:   2026-04-11
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// 0. Constants — Techno-Kol Uzi defaults & Israeli road-network heuristics
// ═══════════════════════════════════════════════════════════════════════

/** Earth mean radius in kilometres (IUGG). */
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Default depot — Techno-Kol Uzi HQ, Tel Aviv area.
 * Override via options.depot in optimizeRoute().
 */
const DEFAULT_DEPOT = Object.freeze({
  id: 'DEPOT',
  name: 'Techno-Kol Uzi HQ',
  name_he: 'מטה טכנו-קול עוזי',
  lat: 32.0853,   // Tel Aviv center (Rabin Square)
  lng: 34.7818,
  is_depot: true,
});

/**
 * Default average driving speed in km/h. Intentionally conservative for
 * Gush-Dan inner-city mix. Used when a per-edge speed is not supplied.
 */
const DEFAULT_SPEED_KMH = 45;

/** Rush-hour windows (local clock, 24h). Morning + evening. */
const RUSH_HOURS_MORNING = Object.freeze({ start: 7, end: 9 });
const RUSH_HOURS_EVENING = Object.freeze({ start: 16, end: 19 });

/** Multiplicative time penalty applied inside rush hours. */
const RUSH_HOUR_PENALTY = 1.45;

/** Jerusalem traffic penalty (applied if either endpoint is in J-lem). */
const JERUSALEM_PENALTY = 1.25;

/**
 * A rough bounding-box for Jerusalem metro (used for heuristic penalty).
 * Not a replacement for a real reverse-geocoder — just enough to flag
 * obvious J-lem stops.
 */
const JERUSALEM_BBOX = Object.freeze({
  minLat: 31.70, maxLat: 31.90,
  minLng: 35.13, maxLng: 35.30,
});

/** Highway 6 approximate longitude corridor (flag only, never cost). */
const HIGHWAY_6_LNG_MIN = 34.90;
const HIGHWAY_6_LNG_MAX = 35.05;

/** Weekend restriction — Saturday (Shabbat). 0 = Sunday … 6 = Saturday. */
const SHABBAT_DAY = 6;

/** Day-of-week in Hebrew. */
const DAYS_HE = Object.freeze([
  'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
]);

// ═══════════════════════════════════════════════════════════════════════
// 1. Haversine — great-circle distance
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute great-circle distance in kilometres between two WGS-84 points.
 *
 * @param {number} lat1 latitude of point A in decimal degrees
 * @param {number} lon1 longitude of point A in decimal degrees
 * @param {number} lat2 latitude of point B in decimal degrees
 * @param {number} lon2 longitude of point B in decimal degrees
 * @returns {number} distance in km, always >= 0
 */
function haversine(lat1, lon1, lat2, lon2) {
  if (
    !Number.isFinite(lat1) || !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) || !Number.isFinite(lon2)
  ) return 0;

  const toRad = Math.PI / 180;
  const φ1 = lat1 * toRad;
  const φ2 = lat2 * toRad;
  const Δφ = (lat2 - lat1) * toRad;
  const Δλ = (lon2 - lon1) * toRad;

  const sinHalfΔφ = Math.sin(Δφ / 2);
  const sinHalfΔλ = Math.sin(Δλ / 2);

  const a =
    sinHalfΔφ * sinHalfΔφ +
    Math.cos(φ1) * Math.cos(φ2) * sinHalfΔλ * sinHalfΔλ;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Distance matrix
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a symmetric N×N distance matrix using Haversine.
 *
 * @param {Array<{lat:number,lng:number}>} stops
 * @returns {number[][]} matrix[i][j] in km
 */
function distanceMatrix(stops) {
  const n = Array.isArray(stops) ? stops.length : 0;
  const m = new Array(n);
  for (let i = 0; i < n; i++) {
    m[i] = new Array(n);
    m[i][i] = 0;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversine(stops[i].lat, stops[i].lng, stops[j].lat, stops[j].lng);
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Nearest-neighbour initial tour
// ═══════════════════════════════════════════════════════════════════════

/**
 * Greedy nearest-neighbour TSP construction starting at `start` (default 0).
 * The returned route is a closed tour: start → … → start.
 *
 * @param {number[][]} matrix symmetric distance matrix
 * @param {number} [start=0] index to begin at
 * @returns {number[]} tour as a sequence of indices, closed (first==last)
 */
function nearestNeighbor(matrix, start = 0) {
  const n = matrix.length;
  if (n === 0) return [];
  if (n === 1) return [start, start];

  const visited = new Array(n).fill(false);
  const route = [start];
  visited[start] = true;

  let current = start;
  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = matrix[current][j];
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best === -1) break;
    route.push(best);
    visited[best] = true;
    current = best;
  }
  route.push(start); // close the tour
  return route;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. 2-opt improvement
// ═══════════════════════════════════════════════════════════════════════

/**
 * Total length of a closed tour `route` over `matrix`.
 * @param {number[]} route
 * @param {number[][]} matrix
 */
function tourLength(route, matrix) {
  let sum = 0;
  for (let i = 0; i < route.length - 1; i++) {
    sum += matrix[route[i]][route[i + 1]];
  }
  return sum;
}

/**
 * In-place 2-opt edge swap. Operates on a *closed* tour (first == last).
 * Returns the improved tour plus the number of improvement passes used.
 *
 * Classic 2-opt: pick two edges (i,i+1) and (j,j+1); if reversing the
 * segment between them shortens the tour, apply the reversal.
 *
 * @param {number[]} route  closed tour, route[0] === route[route.length-1]
 * @param {number[][]} matrix
 * @param {number} [maxPasses=50] safety cap for very large N
 * @returns {{route:number[], passes:number, improvements:number, distance:number}}
 */
function twoOpt(route, matrix, maxPasses = 50) {
  const n = route.length - 1; // exclude the closing duplicate
  if (n < 4) {
    return {
      route: route.slice(),
      passes: 0,
      improvements: 0,
      distance: tourLength(route, matrix),
    };
  }

  let best = route.slice();
  let improved = true;
  let passes = 0;
  let improvements = 0;

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = best[i - 1];
        const b = best[i];
        const c = best[j];
        const d = best[j + 1];
        // Current edges: (a,b) + (c,d). Proposed: (a,c) + (b,d).
        const before = matrix[a][b] + matrix[c][d];
        const after  = matrix[a][c] + matrix[b][d];
        if (after + 1e-12 < before) {
          // Reverse segment best[i..j] (inclusive)
          let lo = i, hi = j;
          while (lo < hi) {
            const tmp = best[lo];
            best[lo] = best[hi];
            best[hi] = tmp;
            lo++; hi--;
          }
          improved = true;
          improvements++;
        }
      }
    }
  }

  return {
    route: best,
    passes,
    improvements,
    distance: tourLength(best, matrix),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. Israeli specifics — rush hours, weekend, Jerusalem, Highway 6
// ═══════════════════════════════════════════════════════════════════════

/** Is a given hour (0..23) within either rush window? */
function isRushHour(hour) {
  return (
    (hour >= RUSH_HOURS_MORNING.start && hour < RUSH_HOURS_MORNING.end) ||
    (hour >= RUSH_HOURS_EVENING.start && hour < RUSH_HOURS_EVENING.end)
  );
}

/** True if the given lat/lng lies inside the Jerusalem heuristic bbox. */
function isInJerusalem(lat, lng) {
  return (
    lat >= JERUSALEM_BBOX.minLat && lat <= JERUSALEM_BBOX.maxLat &&
    lng >= JERUSALEM_BBOX.minLng && lng <= JERUSALEM_BBOX.maxLng
  );
}

/**
 * Heuristic check: does a straight-line segment between two points
 * plausibly run along Highway 6 (Trans-Israel)? Returns true if the mid
 * longitude sits inside the H6 corridor and the segment is > 20 km.
 */
function usesHighway6(aLat, aLng, bLat, bLng) {
  const midLng = (aLng + bLng) / 2;
  const inCorridor = midLng >= HIGHWAY_6_LNG_MIN && midLng <= HIGHWAY_6_LNG_MAX;
  if (!inCorridor) return false;
  const dist = haversine(aLat, aLng, bLat, bLng);
  return dist >= 20;
}

/**
 * Given a distance in km and a departure hour, return the travel time in
 * minutes with Israeli penalties applied.
 *
 * @param {number} distKm
 * @param {number} hour 0..23
 * @param {{lat:number,lng:number}} from
 * @param {{lat:number,lng:number}} to
 * @param {number} [speedKmh=DEFAULT_SPEED_KMH]
 * @returns {{minutes:number, penalties:string[]}}
 */
function edgeTravelTime(distKm, hour, from, to, speedKmh = DEFAULT_SPEED_KMH) {
  const baseMin = (distKm / speedKmh) * 60;
  let factor = 1;
  const penalties = [];

  if (isRushHour(hour)) {
    factor *= RUSH_HOUR_PENALTY;
    penalties.push('rush_hour');
  }
  if (isInJerusalem(from.lat, from.lng) || isInJerusalem(to.lat, to.lng)) {
    factor *= JERUSALEM_PENALTY;
    penalties.push('jerusalem');
  }

  return { minutes: baseMin * factor, penalties };
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Time windows & capacity — validation helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Parse "HH:MM" or {open, close} to a {open, close} pair of minute-of-day.
 * Returns null if the stop has no declared opening hours.
 */
function parseWindow(stop) {
  if (!stop || !stop.opening) return null;
  const o = stop.opening;
  if (typeof o !== 'object') return null;
  const toMin = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]);
  };
  const open = toMin(o.open);
  const close = toMin(o.close);
  if (open == null || close == null) return null;
  return { open, close };
}

/**
 * Simulate a tour in minutes-of-day, starting from `departureMin`, returning
 * arrival/wait info per stop and any time-window violations.
 *
 * @param {Array<object>} orderedStops the tour (already ordered, closed)
 * @param {number[][]} matrix
 * @param {object} options
 * @returns {{arrivals:Array<object>, total_time_min:number, violations:string[]}}
 */
function simulateTour(orderedStops, matrix, options) {
  const depart = options.departureMin != null ? options.departureMin : 8 * 60;
  const service = options.serviceMin != null ? options.serviceMin : 5;
  const speed = options.speedKmh || DEFAULT_SPEED_KMH;
  const arrivals = [];
  const violations = [];
  let clock = depart;

  for (let i = 0; i < orderedStops.length; i++) {
    const stop = orderedStops[i];
    arrivals.push({
      id: stop.id,
      name: stop.name,
      arrival_min: clock,
      arrival_hhmm: minutesToHHMM(clock),
    });

    // Time-window check
    const win = parseWindow(stop);
    if (win) {
      if (clock < win.open) {
        // Wait until opening
        const wait = win.open - clock;
        clock = win.open;
        arrivals[arrivals.length - 1].waited_min = wait;
      } else if (clock > win.close) {
        violations.push(
          `stop ${stop.id || i} arrived ${minutesToHHMM(clock)} after close ${minutesToHHMM(win.close)}`
        );
      }
    }

    // Service time (skip depot)
    if (!stop.is_depot) clock += service;

    // Travel to next stop
    if (i < orderedStops.length - 1) {
      const next = orderedStops[i + 1];
      const distKm = matrix[i][i + 1];
      const hour = Math.floor(clock / 60) % 24;
      const t = edgeTravelTime(distKm, hour, stop, next, speed);
      clock += t.minutes;
    }
  }

  return { arrivals, total_time_min: clock - depart, violations };
}

/** 480 → "08:00" */
function minutesToHHMM(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

/**
 * Capacity validation — sum of demand[i] must not exceed vehicle.capacity.
 * Returns {ok:boolean, total, violations:[]}.
 */
function validateCapacity(stops, vehicle) {
  let total = 0;
  for (const s of stops) {
    if (s.is_depot) continue;
    total += Number(s.demand || 0);
  }
  const cap = Number(vehicle && vehicle.capacity) || Infinity;
  return {
    ok: total <= cap,
    total,
    capacity: cap,
    violations: total > cap
      ? [`total demand ${total} exceeds capacity ${cap}`]
      : [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 7. Multi-vehicle assignment (VRP-lite)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Assign stops to vehicles using a capacity-aware greedy sweep.
 *
 * Strategy:
 *   1. Sort stops by polar angle from the depot (sweep algorithm).
 *   2. Walk the sweep, assigning each stop to the current vehicle until
 *      capacity is exceeded; then move to the next vehicle.
 *   3. Each vehicle's subset is then optimised independently via
 *      nearest-neighbour + 2-opt.
 *
 * @param {Array<object>} stops stops WITH demand (optional)
 * @param {Array<{id:string, capacity:number}>} vehicles
 * @param {object} [options]
 * @returns {{assignments:Array<object>, unassigned:Array<object>}}
 */
function multiVehicleAssign(stops, vehicles, options = {}) {
  const depot = Object.assign({}, DEFAULT_DEPOT, options.depot || {}, {
    is_depot: true,
  });
  const deliveries = stops.filter((s) => !s.is_depot);

  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    return { assignments: [], unassigned: deliveries.slice() };
  }

  // Sweep by polar angle around depot
  const withAngle = deliveries.map((s) => {
    const dy = s.lat - depot.lat;
    const dx = s.lng - depot.lng;
    const angle = Math.atan2(dy, dx);
    return { stop: s, angle };
  });
  withAngle.sort((a, b) => a.angle - b.angle);

  const assignments = [];
  const unassigned = [];
  let vIdx = 0;
  let current = [];
  let currentDemand = 0;

  const flush = () => {
    if (current.length === 0) return;
    const v = vehicles[vIdx];
    const subset = [depot, ...current, depot];
    const mat = distanceMatrix(subset);
    const nn = nearestNeighbor(mat, 0);
    const opt = twoOpt(nn, mat);
    assignments.push({
      vehicle_id: v.id,
      vehicle_capacity: v.capacity,
      load: currentDemand,
      stops: opt.route.map((idx) => subset[idx]),
      distance_km: opt.distance,
    });
  };

  for (const entry of withAngle) {
    const s = entry.stop;
    const dem = Number(s.demand || 0);
    const cap = Number(vehicles[vIdx] && vehicles[vIdx].capacity) || Infinity;
    if (currentDemand + dem > cap) {
      flush();
      vIdx++;
      current = [];
      currentDemand = 0;
      if (vIdx >= vehicles.length) {
        unassigned.push(s);
        continue;
      }
    }
    current.push(s);
    currentDemand += dem;
  }
  flush();

  return { assignments, unassigned };
}

// ═══════════════════════════════════════════════════════════════════════
// 8. Driver deep-links & Hebrew turn-by-turn
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a Google Maps deep link that draws a route through every stop.
 * Format: https://www.google.com/maps/dir/lat,lng/lat,lng/…
 *
 * @param {Array<{lat:number,lng:number}>} orderedStops
 * @returns {string}
 */
function googleMapsLink(orderedStops) {
  if (!Array.isArray(orderedStops) || orderedStops.length === 0) return '';
  const parts = orderedStops
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`);
  return 'https://www.google.com/maps/dir/' + parts.join('/');
}

/**
 * Build a Waze deep link for a SINGLE destination stop.
 * Format: https://waze.com/ul?ll=lat,lng&navigate=yes
 *
 * @param {{lat:number,lng:number}} stop
 * @returns {string}
 */
function wazeLink(stop) {
  if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return '';
  return `https://waze.com/ul?ll=${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}&navigate=yes`;
}

/**
 * Build a list of per-leg Waze links — one per non-depot stop.
 * @param {Array<object>} orderedStops
 * @returns {string[]}
 */
function wazeLegLinks(orderedStops) {
  return orderedStops
    .filter((s) => s && !s.is_depot)
    .map(wazeLink);
}

/**
 * Generate a Hebrew, right-to-left friendly turn-by-turn textual summary
 * for the driver. Purely textual — no routing API involved.
 *
 * @param {Array<object>} orderedStops full closed tour
 * @param {object} [options]
 * @returns {string}
 */
function hebrewTurnByTurn(orderedStops, options = {}) {
  if (!Array.isArray(orderedStops) || orderedStops.length < 2) return '';
  const lines = [];
  lines.push('מסלול חלוקה — טכנו-קול עוזי');
  lines.push('═══════════════════════════════');

  for (let i = 0; i < orderedStops.length; i++) {
    const s = orderedStops[i];
    const label = s.name_he || s.name || s.id || `עצירה ${i + 1}`;
    if (i === 0) {
      lines.push(`יציאה מ: ${label}`);
    } else if (i === orderedStops.length - 1) {
      lines.push(`חזרה ל: ${label}`);
    } else {
      const prev = orderedStops[i - 1];
      const dist = haversine(prev.lat, prev.lng, s.lat, s.lng);
      let hint = `${i}. נסע אל: ${label} (${dist.toFixed(1)} ק"מ)`;
      if (usesHighway6(prev.lat, prev.lng, s.lat, s.lng)) {
        hint += ' — שימו לב לאגרת כביש 6';
      }
      if (isInJerusalem(s.lat, s.lng)) {
        hint += ' — עומסי ירושלים';
      }
      lines.push(hint);
    }
  }

  if (options.total_km != null) {
    lines.push('───────────────────────────────');
    lines.push(`סה"כ מרחק: ${Number(options.total_km).toFixed(2)} ק"מ`);
  }
  if (options.total_time_min != null) {
    lines.push(`זמן משוער: ${Math.round(options.total_time_min)} דקות`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════
// 9. High-level optimizeRoute — the public entry point
// ═══════════════════════════════════════════════════════════════════════

/**
 * Optimise a delivery route with full Israeli logistics semantics.
 *
 * @param {Array<object>} stops  raw delivery stops (without depot)
 * @param {object} [options]
 *   depot: {lat,lng,name,name_he}        default Techno-Kol Uzi HQ
 *   departureMin: 480                    minutes-of-day of truck departure
 *   serviceMin:   5                      service time per stop
 *   speedKmh:     45                     average speed
 *   day:          0..6                   day-of-week (0=Sunday)
 *   returnToDepot:true                   close the tour at the depot
 *   twoOptPasses: 50                     cap on improvement passes
 *   vehicle:      {capacity}             capacity check (optional)
 *
 * @returns {object}
 *   ordered_stops        stops array in visiting order (closed tour)
 *   total_distance_km    sum of all legs
 *   total_time_min       simulated minutes including penalties
 *   improvements         {initial_km, final_km, passes, swaps, saved_km, saved_pct}
 *   warnings             [] Hebrew/English warnings
 *   flags                {highway_6_used, jerusalem_touched, weekend, rush_hour_segments}
 *   google_maps_url
 *   waze_legs            []
 *   driver_summary_he    turn-by-turn text
 *   violations           [] time-window / capacity violations
 */
function optimizeRoute(stops, options = {}) {
  const opts = Object.assign({
    depot: DEFAULT_DEPOT,
    departureMin: 8 * 60,
    serviceMin: 5,
    speedKmh: DEFAULT_SPEED_KMH,
    day: new Date().getDay(),
    returnToDepot: true,
    twoOptPasses: 50,
    vehicle: null,
  }, options || {});

  // ── 0. Input sanity ───────────────────────────────────────────────
  if (!Array.isArray(stops) || stops.length === 0) {
    return {
      ordered_stops: [],
      total_distance_km: 0,
      total_time_min: 0,
      improvements: { initial_km: 0, final_km: 0, passes: 0, swaps: 0, saved_km: 0, saved_pct: 0 },
      warnings: ['no stops provided'],
      flags: { highway_6_used: false, jerusalem_touched: false, weekend: false, rush_hour_segments: 0 },
      google_maps_url: '',
      waze_legs: [],
      driver_summary_he: '',
      violations: [],
    };
  }

  // ── 1. Build full tour — depot, deliveries, (depot) ───────────────
  const depot = Object.assign({}, DEFAULT_DEPOT, opts.depot || {}, { is_depot: true });
  const deliveries = stops.filter((s) => !s.is_depot);
  const warnings = [];
  const violations = [];

  // Capacity check
  if (opts.vehicle && Number.isFinite(opts.vehicle.capacity)) {
    const cap = validateCapacity(deliveries, opts.vehicle);
    if (!cap.ok) {
      violations.push(...cap.violations);
      warnings.push(`capacity overflow: ${cap.total}/${cap.capacity}`);
    }
  }

  // Weekend
  const isWeekend = opts.day === SHABBAT_DAY;
  if (isWeekend) warnings.push(`שבת — ${DAYS_HE[opts.day]} — ייתכנו הגבלות תנועה`);

  const fullStops = [depot, ...deliveries];
  if (opts.returnToDepot) fullStops.push(depot);

  // When there is a single delivery, NN/2-opt is trivial — still run it.
  const matrix = distanceMatrix(fullStops);

  // ── 2. Nearest-neighbour initial tour (without trailing close) ────
  // We run NN on the open set: depot + deliveries (indices 0..k)
  // and then close manually via depot index.
  const openStops = opts.returnToDepot
    ? fullStops.slice(0, -1) // drop the trailing depot duplicate
    : fullStops;
  const openMatrix = distanceMatrix(openStops);

  let route = nearestNeighbor(openMatrix, 0);
  // nearestNeighbor returns a closed tour back to index 0 — which
  // matches openStops[0] (the depot). Convert to indices into fullStops.
  // Since openStops === fullStops.slice(0,-1), index mapping is 1:1 for
  // all but the closing element (which we rebuild anyway).
  const initialLen = tourLength(route, openMatrix);

  // ── 3. 2-opt improvement ──────────────────────────────────────────
  const opt = twoOpt(route, openMatrix, opts.twoOptPasses);

  // ── 4. Rebuild the ordered stop array ─────────────────────────────
  let orderedStops = opt.route.map((idx) => openStops[idx]);

  if (opts.returnToDepot) {
    // NN already closes the tour back at index 0 (the depot),
    // so orderedStops already ends with the depot object.
    if (orderedStops[orderedStops.length - 1] !== depot) {
      orderedStops.push(depot);
    }
  } else {
    // Caller explicitly does NOT want to return to the depot — drop
    // the trailing depot that NN added automatically.
    if (
      orderedStops.length > 1 &&
      orderedStops[orderedStops.length - 1] === depot
    ) {
      orderedStops = orderedStops.slice(0, -1);
    }
  }

  // ── 5. Simulate the tour for time & penalties ─────────────────────
  const orderedMatrix = distanceMatrix(orderedStops);
  const sim = simulateTour(orderedStops, orderedMatrix, {
    departureMin: opts.departureMin,
    serviceMin: opts.serviceMin,
    speedKmh: opts.speedKmh,
  });
  violations.push(...sim.violations);

  // ── 6. Flag detection ─────────────────────────────────────────────
  let highway6 = false;
  let jerusalemTouched = false;
  let rushSegments = 0;
  let clock = opts.departureMin;

  for (let i = 0; i < orderedStops.length - 1; i++) {
    const a = orderedStops[i];
    const b = orderedStops[i + 1];
    if (usesHighway6(a.lat, a.lng, b.lat, b.lng)) highway6 = true;
    if (isInJerusalem(a.lat, a.lng) || isInJerusalem(b.lat, b.lng)) jerusalemTouched = true;
    const hour = Math.floor(clock / 60) % 24;
    if (isRushHour(hour)) rushSegments++;
    const distKm = orderedMatrix[i][i + 1];
    clock += (distKm / opts.speedKmh) * 60 + opts.serviceMin;
  }

  // ── 7. Final accounting ───────────────────────────────────────────
  const finalLen = tourLength(opt.route, openMatrix);
  const savedKm = Math.max(0, initialLen - finalLen);
  const savedPct = initialLen > 0 ? (savedKm / initialLen) * 100 : 0;

  const gmaps = googleMapsLink(orderedStops);
  const waze = wazeLegLinks(orderedStops);

  const summary = hebrewTurnByTurn(orderedStops, {
    total_km: finalLen,
    total_time_min: sim.total_time_min,
  });

  return {
    ordered_stops: orderedStops,
    total_distance_km: Number(finalLen.toFixed(4)),
    total_time_min: Number(sim.total_time_min.toFixed(2)),
    improvements: {
      initial_km: Number(initialLen.toFixed(4)),
      final_km: Number(finalLen.toFixed(4)),
      passes: opt.passes,
      swaps: opt.improvements,
      saved_km: Number(savedKm.toFixed(4)),
      saved_pct: Number(savedPct.toFixed(2)),
    },
    warnings,
    flags: {
      highway_6_used: highway6,
      jerusalem_touched: jerusalemTouched,
      weekend: isWeekend,
      rush_hour_segments: rushSegments,
    },
    google_maps_url: gmaps,
    waze_legs: waze,
    driver_summary_he: summary,
    violations,
    arrivals: sim.arrivals,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 10. Exports
// ═══════════════════════════════════════════════════════════════════════

const api = Object.freeze({
  // primary
  optimizeRoute,
  haversine,
  distanceMatrix,
  nearestNeighbor,
  twoOpt,
  multiVehicleAssign,

  // helpers
  tourLength,
  simulateTour,
  edgeTravelTime,
  validateCapacity,
  isRushHour,
  isInJerusalem,
  usesHighway6,
  parseWindow,
  minutesToHHMM,

  // driver links & summary
  googleMapsLink,
  wazeLink,
  wazeLegLinks,
  hebrewTurnByTurn,

  // constants
  EARTH_RADIUS_KM,
  DEFAULT_DEPOT,
  DEFAULT_SPEED_KMH,
  RUSH_HOURS_MORNING,
  RUSH_HOURS_EVENING,
  RUSH_HOUR_PENALTY,
  JERUSALEM_PENALTY,
  JERUSALEM_BBOX,
  SHABBAT_DAY,
  DAYS_HE,
});

// CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
// Global (for plain-script loaders)
if (typeof globalThis !== 'undefined') {
  globalThis.RouteOptimizer = api;
}
