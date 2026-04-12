/**
 * Anomaly Detection Engine — Financial Transactions
 * Techno-Kol Uzi mega-ERP / Agent 100
 *
 * Zero dependencies. Pure JavaScript statistics. No ML libs, no HTTP calls,
 * no file I/O. Everything is deterministic and offline-friendly.
 *
 * Implements ten complementary statistical methods for fraud / anomaly
 * detection on a flat array of transaction records:
 *
 *   1.  Z-score                       — amount vs historical mean/stdev
 *                                       (grouped by vendor + category)
 *   2.  IQR (Tukey)                   — 1.5x IQR outlier rule
 *   3.  Moving average deviation      — 30 / 90 / 365 day rolling average
 *   4.  Seasonal decomposition        — monthly seasonality index
 *   5.  Benford's law                 — first-digit distribution (chi^2)
 *   6.  Duplicate detection           — fuzzy vendor + exact amount +
 *                                       date within 7 days
 *   7.  Round-amount suspicion        — exact round amounts flagged
 *   8.  Time-of-day anomaly           — transactions at unusual hours
 *   9.  Velocity checks               — too many tx in short window
 *   10. Geographic anomaly            — distance between IPs/lat-lon
 *
 * Each detection returns a record of the form:
 *
 *   {
 *     transaction_id:   <string>,
 *     anomaly_type:     <string>,         // e.g. 'zscore', 'benford'
 *     severity:         <integer 1..10>,
 *     explanation_he:   <string>,         // Hebrew
 *     explanation_en:   <string>,         // English
 *     confidence:       <number 0..1>,
 *     metric:           <object>          // raw numbers for audit
 *   }
 *
 * A Transaction is expected to look like:
 *
 *   {
 *     id:        'tx-0001',
 *     vendor:    'ACME Steel',
 *     category:  'materials',
 *     amount:    12345.67,
 *     currency:  'ILS',
 *     date:      '2026-04-11',        // ISO or yyyy-mm-dd
 *     timestamp: '2026-04-11T14:22:03Z', // optional, used for hour / velocity
 *     ip:        '1.2.3.4',           // optional
 *     lat:       31.04,               // optional
 *     lon:       34.85,               // optional
 *   }
 *
 * Nothing here mutates the input array. All methods are pure.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. TUNABLE THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULTS = Object.freeze({
  zScoreThreshold:       3.0,     // |z| >= 3 => anomaly
  iqrK:                  1.5,     // Tukey rule constant
  movingWindows:         [30, 90, 365],
  movingThreshold:       3.0,     // deviation in standard deviations
  benfordMinSamples:     30,      // chi^2 meaningful only above this
  benfordChiCritical:    15.507,  // chi^2 8 dof, p=0.05
  duplicateWindowDays:   7,
  duplicateAmountEps:    0.01,    // absolute NIS tolerance
  duplicateVendorSim:    0.85,    // fuzzy match cutoff
  roundSuspicionMinPct:  0.20,    // 20% of vendor's tx round => suspicious
  timeOfDayStartHour:    6,       // 06:00 .. 22:00 considered "normal"
  timeOfDayEndHour:      22,
  velocityWindowMinutes: 5,
  velocityMaxTxInWindow: 5,
  geoMaxKmPerHour:       900,     // faster than a commercial jet => anomaly
});

// Benford expected distribution for digits 1..9 (log10((d+1)/d))
const BENFORD_EXPECTED = [
  null, // index 0 unused
  0.30103, 0.17609, 0.12494, 0.09691,
  0.07918, 0.06695, 0.05799, 0.05115, 0.04576,
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. PURE STATISTICS HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function variance(arr, m) {
  if (!arr || arr.length < 2) return 0;
  if (m === undefined) m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    s += d * d;
  }
  return s / (arr.length - 1); // sample variance
}

function stdev(arr, m) {
  return Math.sqrt(variance(arr, m));
}

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Quartile via the "exclusive" (Excel QUARTILE.EXC) style.
 * Works well for small sample sizes typical in procurement.
 */
function quartile(sortedAsc, q) {
  if (!sortedAsc || sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedAsc[base + 1] !== undefined) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  }
  return sortedAsc[base];
}

/**
 * Z-score of value inside sample (population mean/stdev).
 * Zero stdev => 0 (avoid NaN; anomaly determined elsewhere).
 */
function computeZScore(value, sample) {
  if (!sample || sample.length === 0) return 0;
  const m = mean(sample);
  const sd = stdev(sample, m);
  if (sd === 0) return 0;
  return (value - m) / sd;
}

/**
 * Generic moving-average anomaly. For each index i with enough history,
 * compares value[i] to the mean of the previous `window` values and flags
 * indexes whose deviation exceeds `threshold` standard deviations.
 */
function movingAverageAnomaly(series, window, threshold) {
  const out = [];
  if (!Array.isArray(series) || series.length === 0) return out;
  const w = Math.max(1, window | 0);
  const t = threshold === undefined ? 3 : threshold;
  for (let i = w; i < series.length; i++) {
    const slice = series.slice(i - w, i);
    const m = mean(slice);
    const sd = stdev(slice, m);
    if (sd === 0) continue;
    const z = (series[i] - m) / sd;
    if (Math.abs(z) >= t) out.push(i);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. STRING HELPERS  (Levenshtein / fuzzy vendor match)
// ═══════════════════════════════════════════════════════════════════════════

function normalizeVendor(v) {
  if (!v) return '';
  return String(v)
    .toLowerCase()
    .replace(/[\u0591-\u05C7]/g, '') // strip Hebrew diacritics
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = new Array(bl + 1);
  const curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,      // insertion
        prev[j] + 1,          // deletion
        prev[j - 1] + cost    // substitution
      );
    }
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

/** Similarity in [0..1]. 1 = identical, 0 = totally different. */
function vendorSimilarity(a, b) {
  const na = normalizeVendor(a);
  const nb = normalizeVendor(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const d = levenshtein(na, nb);
  const m = Math.max(na.length, nb.length);
  return m === 0 ? 1 : 1 - d / m;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. DATE / TIME HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function parseDate(d) {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : new Date(t);
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return Infinity;
  return Math.abs((da.getTime() - db.getTime()) / 86400000);
}

function hoursBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return Infinity;
  return Math.abs((da.getTime() - db.getTime()) / 3600000);
}

/** Great-circle distance in km via haversine. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. BENFORD'S LAW
// ═══════════════════════════════════════════════════════════════════════════

function firstSignificantDigit(x) {
  const n = Math.abs(Number(x));
  if (!Number.isFinite(n) || n === 0) return 0;
  let s = n;
  while (s >= 10) s /= 10;
  while (s < 1) s *= 10;
  return Math.floor(s);
}

/**
 * Analyze an array of positive amounts against Benford's law.
 * Returns { conforms, chi_square, deviation, suspicious_digits, observed }.
 *
 *   conforms:   boolean — true if chi^2 below critical value (p=0.05, 8 dof)
 *   chi_square: number
 *   deviation:  max absolute diff between observed and expected frequency
 *   suspicious_digits: array of digits (1..9) whose frequency deviates
 *                      by > 3 standard errors from expected
 *   observed:   digit -> frequency map
 */
function analyzeAgainstBenford(amounts) {
  const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // index 0 unused
  let n = 0;
  if (Array.isArray(amounts)) {
    for (const a of amounts) {
      const d = firstSignificantDigit(a);
      if (d >= 1 && d <= 9) {
        counts[d]++;
        n++;
      }
    }
  }
  const observed = {};
  for (let d = 1; d <= 9; d++) observed[d] = n === 0 ? 0 : counts[d] / n;

  if (n < DEFAULTS.benfordMinSamples) {
    return {
      conforms: true, // not enough data to conclude otherwise
      chi_square: 0,
      deviation: 0,
      suspicious_digits: [],
      observed,
      sample_size: n,
      reason: 'insufficient_samples',
    };
  }

  let chi = 0;
  let maxDev = 0;
  const suspicious = [];
  for (let d = 1; d <= 9; d++) {
    const expected = n * BENFORD_EXPECTED[d];
    const diff = counts[d] - expected;
    if (expected > 0) chi += (diff * diff) / expected;
    const obsFreq = counts[d] / n;
    const dev = Math.abs(obsFreq - BENFORD_EXPECTED[d]);
    if (dev > maxDev) maxDev = dev;
    // Standard error for binomial frequency: sqrt(p*(1-p)/n)
    const se = Math.sqrt((BENFORD_EXPECTED[d] * (1 - BENFORD_EXPECTED[d])) / n);
    if (se > 0 && Math.abs(obsFreq - BENFORD_EXPECTED[d]) > 3 * se) {
      suspicious.push(d);
    }
  }

  return {
    conforms: chi < DEFAULTS.benfordChiCritical,
    chi_square: chi,
    deviation: maxDev,
    suspicious_digits: suspicious,
    observed,
    sample_size: n,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns an array of {a, b, similarity, days_apart, reason}
 * where a/b are transaction objects suspected to be duplicates.
 *
 * Heuristic: same (fuzzy) vendor, amount within eps, dates within N days.
 */
function findDuplicates(transactions, opts) {
  const cfg = Object.assign({}, DEFAULTS, opts || {});
  const out = [];
  if (!Array.isArray(transactions) || transactions.length < 2) return out;

  // sort by date to keep comparisons local
  const withIdx = transactions.map((t, i) => ({ t, i }));
  withIdx.sort((x, y) => {
    const dx = parseDate(x.t.date) || new Date(0);
    const dy = parseDate(y.t.date) || new Date(0);
    return dx.getTime() - dy.getTime();
  });

  for (let i = 0; i < withIdx.length; i++) {
    const a = withIdx[i].t;
    for (let j = i + 1; j < withIdx.length; j++) {
      const b = withIdx[j].t;
      const gap = daysBetween(a.date, b.date);
      if (gap > cfg.duplicateWindowDays) break; // dates only grow further apart
      if (Math.abs(Number(a.amount) - Number(b.amount)) > cfg.duplicateAmountEps) continue;
      const sim = vendorSimilarity(a.vendor, b.vendor);
      if (sim >= cfg.duplicateVendorSim) {
        out.push({
          a,
          b,
          similarity: sim,
          days_apart: gap,
          reason: 'fuzzy_vendor_same_amount_close_date',
        });
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. GROUPING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function groupBy(arr, keyFn) {
  const out = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

function vendorCategoryKey(t) {
  return `${normalizeVendor(t.vendor)}::${(t.category || '').toLowerCase()}`;
}

function isRoundAmount(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return false;
  return n > 0 && Math.abs(n - Math.round(n)) < 1e-9 && Math.round(n) % 100 === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. INDIVIDUAL DETECTORS (each returns array of anomaly records)
// ═══════════════════════════════════════════════════════════════════════════

function detectZScore(transactions, cfg) {
  const out = [];
  const groups = groupBy(transactions, vendorCategoryKey);
  for (const [, group] of groups) {
    if (group.length < 4) continue; // not enough history
    const amounts = group.map((t) => Number(t.amount) || 0);
    const m = mean(amounts);
    const sd = stdev(amounts, m);
    if (sd === 0) continue;
    for (const t of group) {
      const z = (Number(t.amount) - m) / sd;
      if (Math.abs(z) >= cfg.zScoreThreshold) {
        const ratio = m === 0 ? 0 : Number(t.amount) / m;
        // severity combines |z| with the ratio so a 10x-mean outlier always
        // ranks as high-severity even if its own presence inflated stdev.
        const ratioScore = Number.isFinite(ratio) ? Math.log2(Math.max(ratio, 1.01)) * 2 : 0;
        const severity = clampSeverity(Math.max(Math.abs(z), 3 + ratioScore));
        out.push({
          transaction_id: t.id,
          anomaly_type: 'zscore',
          severity,
          explanation_he: `סכום חריג פי ${ratio.toFixed(1)} מהממוצע של ${t.vendor || 'ספק'}`,
          explanation_en: `Amount ${ratio.toFixed(1)}x higher than average for ${t.vendor || 'vendor'}`,
          confidence: Math.min(0.99, 0.6 + Math.abs(z) / 20),
          metric: { z, mean: m, stdev: sd, amount: Number(t.amount) },
        });
      }
    }
  }
  return out;
}

function detectIQR(transactions, cfg) {
  const out = [];
  const groups = groupBy(transactions, vendorCategoryKey);
  for (const [, group] of groups) {
    if (group.length < 5) continue;
    const amounts = group.map((t) => Number(t.amount) || 0).sort((a, b) => a - b);
    const q1 = quartile(amounts, 0.25);
    const q3 = quartile(amounts, 0.75);
    const iqr = q3 - q1;
    if (iqr === 0) continue;
    const lo = q1 - cfg.iqrK * iqr;
    const hi = q3 + cfg.iqrK * iqr;
    for (const t of group) {
      const v = Number(t.amount) || 0;
      if (v < lo || v > hi) {
        const dist = v > hi ? v - hi : lo - v;
        const severity = clampSeverity(1 + (dist / (iqr || 1)) * 2);
        out.push({
          transaction_id: t.id,
          anomaly_type: 'iqr',
          severity,
          explanation_he: 'סכום חורג מהטווח הבין־רבעוני של הספק (כלל 1.5×IQR)',
          explanation_en: 'Amount outside vendor interquartile range (1.5x IQR rule)',
          confidence: 0.75,
          metric: { q1, q3, iqr, lo, hi, amount: v },
        });
      }
    }
  }
  return out;
}

function detectMovingAverage(transactions, cfg) {
  const out = [];
  const groups = groupBy(transactions, vendorCategoryKey);
  for (const [, group] of groups) {
    // sort chronologically
    const sorted = group.slice().sort((a, b) => {
      const da = parseDate(a.date) || new Date(0);
      const db = parseDate(b.date) || new Date(0);
      return da.getTime() - db.getTime();
    });
    for (const w of cfg.movingWindows) {
      if (sorted.length <= w) continue;
      const amounts = sorted.map((t) => Number(t.amount) || 0);
      const idxs = movingAverageAnomaly(amounts, w, cfg.movingThreshold);
      for (const i of idxs) {
        const t = sorted[i];
        const slice = amounts.slice(i - w, i);
        const m = mean(slice);
        out.push({
          transaction_id: t.id,
          anomaly_type: 'moving_average',
          severity: clampSeverity(1 + (amounts[i] / (m || 1))),
          explanation_he: `סטייה משמעותית מממוצע ${w} העסקאות האחרונות`,
          explanation_en: `Significant deviation from ${w}-transaction moving average`,
          confidence: 0.7,
          metric: { window: w, moving_avg: m, amount: amounts[i] },
        });
      }
    }
  }
  return out;
}

function detectSeasonal(transactions, cfg) {
  // Simplified seasonal decomposition: bucket by month (1..12), compute
  // index = month_median / global_median. Flag tx whose amount is > 3x the
  // expected seasonal level using leave-one-out so a single anomaly doesn't
  // pollute the baseline it's being compared against.
  const out = [];
  const groups = groupBy(transactions, vendorCategoryKey);
  for (const [, group] of groups) {
    if (group.length < 12) continue;
    const allAmounts = group.map((t) => Number(t.amount) || 0);
    // bucket by month
    const byMonth = new Map();
    for (const t of group) {
      const d = parseDate(t.date);
      if (!d) continue;
      const m = d.getUTCMonth() + 1;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(Number(t.amount) || 0);
    }
    for (const t of group) {
      const d = parseDate(t.date);
      if (!d) continue;
      const m = d.getUTCMonth() + 1;
      const bucket = byMonth.get(m) || [];
      // leave-one-out: remove this tx's own value once
      const otherInMonth = bucket.slice();
      const selfIdx = otherInMonth.indexOf(Number(t.amount) || 0);
      if (selfIdx !== -1) otherInMonth.splice(selfIdx, 1);
      if (otherInMonth.length === 0) continue;
      // robust: median instead of mean to resist outliers
      const monthMedian = median(otherInMonth);
      const others = allAmounts.slice();
      const globalIdx = others.indexOf(Number(t.amount) || 0);
      if (globalIdx !== -1) others.splice(globalIdx, 1);
      if (others.length === 0) continue;
      const globalMedian = median(others);
      if (globalMedian === 0) continue;
      const seasonalIdx = monthMedian / globalMedian;
      const expected = globalMedian * seasonalIdx;
      if (expected === 0) continue;
      const v = Number(t.amount) || 0;
      const ratio = v / expected;
      if (ratio >= 3 || ratio <= 0.25) {
        out.push({
          transaction_id: t.id,
          anomaly_type: 'seasonal',
          severity: clampSeverity(Math.abs(Math.log2(ratio || 0.0001)) * 2),
          explanation_he: 'חריגה עונתית: הסכום אינו מתאים לדפוס החודשי',
          explanation_en: 'Seasonal anomaly: amount does not match monthly pattern',
          confidence: 0.6,
          metric: {
            month: m,
            seasonal_index: seasonalIdx,
            expected,
            amount: v,
            ratio,
          },
        });
      }
    }
  }
  return out;
}

function detectBenford(transactions, cfg) {
  const out = [];
  // Only meaningful on a large enough sample, and per vendor/category.
  const groups = groupBy(transactions, vendorCategoryKey);
  for (const [, group] of groups) {
    if (group.length < cfg.benfordMinSamples) continue;
    const amounts = group.map((t) => Number(t.amount) || 0).filter((x) => x > 0);
    const result = analyzeAgainstBenford(amounts);
    if (result.conforms) continue;
    // Tag each transaction whose leading digit is among the suspicious set.
    for (const t of group) {
      const d = firstSignificantDigit(Number(t.amount) || 0);
      if (result.suspicious_digits.includes(d)) {
        out.push({
          transaction_id: t.id,
          anomaly_type: 'benford',
          severity: clampSeverity(2 + result.chi_square / 10),
          explanation_he: 'חשד לזיוף — הסכום סוטה מהתפלגות חוק בנפורד',
          explanation_en: "Possible fraud — amount deviates from Benford's law",
          confidence: 0.55,
          metric: {
            leading_digit: d,
            chi_square: result.chi_square,
            suspicious_digits: result.suspicious_digits,
          },
        });
      }
    }
  }
  return out;
}

function detectDuplicates(transactions, cfg) {
  const out = [];
  const pairs = findDuplicates(transactions, cfg);
  const seen = new Set();
  for (const p of pairs) {
    const key = p.b.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      transaction_id: p.b.id,
      anomaly_type: 'duplicate',
      severity: clampSeverity(5 + (1 - p.days_apart / cfg.duplicateWindowDays) * 5),
      explanation_he: 'עסקה כפולה חשודה',
      explanation_en: 'Suspected duplicate transaction',
      confidence: Math.min(0.99, 0.6 + p.similarity * 0.4),
      metric: {
        duplicate_of: p.a.id,
        similarity: p.similarity,
        days_apart: p.days_apart,
      },
    });
  }
  return out;
}

function detectRoundAmounts(transactions, cfg) {
  const out = [];
  const groups = groupBy(transactions, (t) => normalizeVendor(t.vendor));
  for (const [, group] of groups) {
    if (group.length < 5) continue;
    const rounds = group.filter((t) => isRoundAmount(t.amount));
    const pct = rounds.length / group.length;
    if (pct < cfg.roundSuspicionMinPct) continue;
    for (const t of rounds) {
      out.push({
        transaction_id: t.id,
        anomaly_type: 'round_amount',
        severity: clampSeverity(2 + pct * 8),
        explanation_he: 'שיעור גבוה של סכומים עגולים — חשד לחשבוניות מזויפות',
        explanation_en: 'High proportion of round amounts — possible fake invoices',
        confidence: 0.5 + pct * 0.4,
        metric: { round_ratio: pct, amount: Number(t.amount) || 0 },
      });
    }
  }
  return out;
}

function detectTimeOfDay(transactions, cfg) {
  const out = [];
  for (const t of transactions) {
    // Time-of-day only makes sense when an actual timestamp is recorded.
    // A bare date string (yyyy-mm-dd) parses to midnight UTC and would
    // generate spurious "03:00" alerts, so we skip those.
    if (!t.timestamp) continue;
    const d = parseDate(t.timestamp);
    if (!d) continue;
    const h = d.getUTCHours();
    if (h >= cfg.timeOfDayStartHour && h < cfg.timeOfDayEndHour) continue;
    out.push({
      transaction_id: t.id,
      anomaly_type: 'time_of_day',
      severity: clampSeverity(3 + (h < 6 ? 6 - h : h - 22)),
      explanation_he: `עסקה בוצעה בשעה חריגה (${String(h).padStart(2, '0')}:00)`,
      explanation_en: `Transaction at unusual hour (${String(h).padStart(2, '0')}:00 UTC)`,
      confidence: 0.55,
      metric: { hour: h },
    });
  }
  return out;
}

function detectVelocity(transactions, cfg) {
  const out = [];
  const groups = groupBy(transactions, (t) => normalizeVendor(t.vendor));
  const windowMs = cfg.velocityWindowMinutes * 60 * 1000;
  for (const [, group] of groups) {
    const sorted = group
      .slice()
      .filter((t) => parseDate(t.timestamp || t.date))
      .sort((a, b) => {
        const da = parseDate(a.timestamp || a.date).getTime();
        const db = parseDate(b.timestamp || b.date).getTime();
        return da - db;
      });
    if (sorted.length < cfg.velocityMaxTxInWindow) continue;
    // Sliding window
    for (let i = 0; i < sorted.length; i++) {
      const start = parseDate(sorted[i].timestamp || sorted[i].date).getTime();
      let j = i;
      while (
        j < sorted.length &&
        parseDate(sorted[j].timestamp || sorted[j].date).getTime() - start <= windowMs
      ) {
        j++;
      }
      const count = j - i;
      if (count >= cfg.velocityMaxTxInWindow) {
        // flag the burst — only the last of the burst
        const t = sorted[j - 1];
        out.push({
          transaction_id: t.id,
          anomaly_type: 'velocity',
          severity: clampSeverity(Math.min(10, count)),
          explanation_he: `מהירות חריגה: ${count} עסקאות באותו ספק תוך ${cfg.velocityWindowMinutes} דקות`,
          explanation_en: `Unusual velocity: ${count} transactions with same vendor within ${cfg.velocityWindowMinutes} minutes`,
          confidence: Math.min(0.95, 0.6 + count * 0.05),
          metric: { count, window_minutes: cfg.velocityWindowMinutes },
        });
        i = j - 1; // skip past the burst
      }
    }
  }
  return out;
}

function detectGeographic(transactions, cfg) {
  const out = [];
  // group by some actor key if present, otherwise by vendor
  const key = (t) => t.user_id || t.account_id || normalizeVendor(t.vendor) || 'global';
  const groups = groupBy(transactions, key);
  for (const [, group] of groups) {
    const withGeo = group
      .filter(
        (t) =>
          typeof t.lat === 'number' &&
          typeof t.lon === 'number' &&
          parseDate(t.timestamp || t.date)
      )
      .slice()
      .sort((a, b) => {
        const da = parseDate(a.timestamp || a.date).getTime();
        const db = parseDate(b.timestamp || b.date).getTime();
        return da - db;
      });
    for (let i = 1; i < withGeo.length; i++) {
      const prev = withGeo[i - 1];
      const curr = withGeo[i];
      const dist = haversineKm(prev.lat, prev.lon, curr.lat, curr.lon);
      const hours = hoursBetween(
        prev.timestamp || prev.date,
        curr.timestamp || curr.date
      );
      if (hours === 0 || !Number.isFinite(hours)) continue;
      const speed = dist / hours;
      if (speed > cfg.geoMaxKmPerHour) {
        out.push({
          transaction_id: curr.id,
          anomaly_type: 'geographic',
          severity: clampSeverity(3 + Math.log10(speed / cfg.geoMaxKmPerHour) * 3),
          explanation_he: `אי־אפשרות גאוגרפית: ${Math.round(dist)} ק"מ תוך ${hours.toFixed(
            1
          )} שעות`,
          explanation_en: `Impossible travel: ${Math.round(dist)} km in ${hours.toFixed(
            1
          )} hours`,
          confidence: Math.min(0.99, 0.7 + speed / (cfg.geoMaxKmPerHour * 10)),
          metric: { km: dist, hours, km_per_hour: speed },
        });
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. SEVERITY NORMALISER
// ═══════════════════════════════════════════════════════════════════════════

function clampSeverity(x) {
  if (!Number.isFinite(x)) return 1;
  if (x < 1) return 1;
  if (x > 10) return 10;
  return Math.round(x);
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. PUBLIC ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run every detector over the full transaction set.
 * Returns a flat array of anomaly records (possibly multiple per transaction).
 */
function detectAnomalies(transactions, opts) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];
  const cfg = Object.assign({}, DEFAULTS, opts || {});
  const out = [];
  out.push(...detectZScore(transactions, cfg));
  out.push(...detectIQR(transactions, cfg));
  out.push(...detectMovingAverage(transactions, cfg));
  out.push(...detectSeasonal(transactions, cfg));
  out.push(...detectBenford(transactions, cfg));
  out.push(...detectDuplicates(transactions, cfg));
  out.push(...detectRoundAmounts(transactions, cfg));
  out.push(...detectTimeOfDay(transactions, cfg));
  out.push(...detectVelocity(transactions, cfg));
  out.push(...detectGeographic(transactions, cfg));
  // Sort by severity descending then by confidence for deterministic output.
  out.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return b.confidence - a.confidence;
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // primary API
  detectAnomalies,
  analyzeAgainstBenford,
  findDuplicates,
  computeZScore,
  movingAverageAnomaly,

  // internals (exposed for white-box tests)
  DEFAULTS,
  BENFORD_EXPECTED,
  mean,
  variance,
  stdev,
  median,
  quartile,
  firstSignificantDigit,
  vendorSimilarity,
  normalizeVendor,
  levenshtein,
  haversineKm,
  isRoundAmount,
  clampSeverity,
  detectZScore,
  detectIQR,
  detectMovingAverage,
  detectSeasonal,
  detectBenford,
  detectDuplicates,
  detectRoundAmounts,
  detectTimeOfDay,
  detectVelocity,
  detectGeographic,
};
