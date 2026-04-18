/**
 * Duplicate Bill / Invoice Detector  |  מזהה כפילויות חשבוניות
 * =============================================================
 *
 * Agent X-02  |  Swarm 3  |  Techno-Kol Uzi mega-ERP
 *
 * Zero-dependency fuzzy-matching engine for detecting potential duplicate
 * accounts-payable bills before they are paid twice. The module combines
 * multiple weak signals — vendor identity, monetary totals, temporal
 * proximity, description similarity, reference-number reuse — and yields
 * a confidence score in [0, 1].
 *
 * -------------------------------------------------------------
 * SIGNAL LADDER
 * -------------------------------------------------------------
 *   Signal                                                    Score
 *   ───────────────────────────────────────────────────────── ─────
 *   S1  Same vendor + same invoice_no + same total            1.00
 *   S2  Same vendor + same total + |Δdate| ≤ 7 days           0.90
 *   S3  Same vendor + total within ±1 % + |Δdate| ≤ 14 days   0.75
 *   S4  Vendor Levenshtein < 3 + exact total + |Δdate| ≤ 7 d  0.80
 *   S5  Similar description (Jaccard ≥ 0.6) + same amount     0.60
 *   S6  Same vendor + same reference/check number reused      flag
 *
 * Confidence of a group = max(signal.score) (conservative).
 * Any single signal with score ≥ 0.50 marks the pair as a duplicate.
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   findDuplicates(bills)                    → Group[]
 *   isDuplicate(bill1, bill2)                → {duplicate, confidence, signals}
 *   normalizeHebrew(str)                     → string
 *   levenshtein(a, b)                        → integer
 *
 * The module mutates nothing. `findDuplicates` is O(n²) on the input and
 * is intended for batches up to a few thousand bills — well within the
 * expected daily load at Techno-Kol Uzi's procurement desk.
 *
 * RULE: never delete — the caller decides what to do with flagged pairs.
 * This module only *reports*. It is safe to run on production data.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Bilingual error / label dictionary
// ─────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    exactMatch: 'Exact match: same vendor, invoice number, and total',
    sameVendorSameTotal7: 'Same vendor and total within 7 days',
    sameVendorNearTotal14: 'Same vendor, total within 1%, 14-day window',
    similarVendorExactTotal: 'Similar vendor name and exact total, 7-day window',
    similarDescriptionSameAmount: 'Similar description and identical amount',
    referenceReuse: 'Reference / check number reused for same vendor',
  },
  he: {
    exactMatch: 'התאמה מוחלטת: אותו ספק, מספר חשבונית וסכום',
    sameVendorSameTotal7: 'אותו ספק וסכום זהה בתוך 7 ימים',
    sameVendorNearTotal14: 'אותו ספק, סכום בסטייה של עד 1%, בחלון 14 ימים',
    similarVendorExactTotal: 'שם ספק דומה וסכום זהה בחלון 7 ימים',
    similarDescriptionSameAmount: 'תיאור דומה ואותו סכום',
    referenceReuse: 'מספר הפניה / המחאה בשימוש חוזר עבור אותו ספק',
  },
};

// ─────────────────────────────────────────────────────────────
// Hebrew normalization
// ─────────────────────────────────────────────────────────────

/**
 * Niqqud (Hebrew vowel points & cantillation) — Unicode range.
 *   U+0591..U+05BD  cantillation marks
 *   U+05BF          rafe
 *   U+05C1..U+05C2  shin/sin dots
 *   U+05C4..U+05C5  upper/lower dots
 *   U+05C7          qamats qatan
 */
const NIQQUD_RE = /[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/g;

/** Final-form Hebrew letters → non-final form (so "ירושלים" == "ירושלימ"). */
const FINAL_MAP = Object.freeze({
  '\u05DA': '\u05DB', // ך → כ
  '\u05DD': '\u05DE', // ם → מ
  '\u05DF': '\u05E0', // ן → נ
  '\u05E3': '\u05E4', // ף → פ
  '\u05E5': '\u05E6', // ץ → צ
});

/**
 * Aggressive Hebrew / Latin normalizer for fuzzy comparison.
 *
 * Steps:
 *   1. Coerce to string, early-return `''` on null/undefined.
 *   2. Unicode NFKC compose (splits/normalizes combined glyphs).
 *   3. Strip niqqud (vowel points + cantillation).
 *   4. Map final-form letters to their regular counterparts.
 *   5. Drop ZWNJ / ZWJ / BOM / bidi controls that contaminate OCR.
 *   6. Drop common punctuation that tends to be noisy in vendor names
 *      (quotes, apostrophes, periods, commas, dashes, parentheses).
 *   7. Collapse any whitespace run to a single space.
 *   8. Lowercase Latin letters (Hebrew letters are case-less).
 *   9. Trim.
 *
 * @param {unknown} str
 * @returns {string}
 */
function normalizeHebrew(str) {
  if (str === null || str === undefined) return '';
  let s = String(str);
  if (s.length === 0) return '';

  // 1. NFKC
  if (typeof s.normalize === 'function') {
    try { s = s.normalize('NFKC'); } catch (_) { /* ancient runtime — ignore */ }
  }

  // 2. Strip niqqud
  s = s.replace(NIQQUD_RE, '');

  // 3. Final letters → regular
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    out += FINAL_MAP[ch] || ch;
  }
  s = out;

  // 4. Strip zero-width + bidi controls
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');

  // 5. Drop punctuation noise (keep digits, letters, whitespace, slash)
  s = s.replace(/["'`’‘“”״׳.,;:!?()\[\]{}<>\-–—_*+=]/g, ' ');

  // 6. Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  // 7. Lowercase Latin (Hebrew is case-less and unaffected)
  s = s.toLowerCase();

  return s;
}

// ─────────────────────────────────────────────────────────────
// Levenshtein distance (classic 2-row DP, O(min(a,b)) space)
// ─────────────────────────────────────────────────────────────

/**
 * Iterative Levenshtein edit distance — zero deps.
 *
 * Uses two rolling integer arrays rather than a full n×m matrix, so the
 * memory footprint is O(min(|a|, |b|)) which matters for long vendor
 * descriptions coming from OCR.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} non-negative integer distance
 */
function levenshtein(a, b) {
  const sA = a === null || a === undefined ? '' : String(a);
  const sB = b === null || b === undefined ? '' : String(b);

  if (sA === sB) return 0;
  if (sA.length === 0) return sB.length;
  if (sB.length === 0) return sA.length;

  // Ensure sA is the shorter string — reduces memory.
  let short = sA;
  let long = sB;
  if (short.length > long.length) {
    const tmp = short; short = long; long = tmp;
  }

  const m = short.length;
  const n = long.length;

  let prev = new Array(m + 1);
  let curr = new Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    const chB = long.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const cost = short.charCodeAt(i - 1) === chB ? 0 : 1;
      const del = prev[i] + 1;
      const ins = curr[i - 1] + 1;
      const sub = prev[i - 1] + cost;
      let min = del < ins ? del : ins;
      if (sub < min) min = sub;
      curr[i] = min;
    }
    const tmp = prev; prev = curr; curr = tmp;
  }

  return prev[m];
}

// ─────────────────────────────────────────────────────────────
// Amount, date, and text utilities
// ─────────────────────────────────────────────────────────────

/**
 * Coerce any bill-total shape into a finite number of NIS.
 * Accepts: number, "1,234.56", "₪1,234.56", {amount: 100}, null.
 * Returns NaN for unparseable values — the caller must treat NaN as
 * "unknown" and not as a match.
 */
function parseAmount(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v === 'object' && v !== null) {
    if ('amount' in v) return parseAmount(v.amount);
    if ('total' in v) return parseAmount(v.total);
    if ('value' in v) return parseAmount(v.value);
    return NaN;
  }
  const s = String(v).replace(/[₪$€£]/g, '').replace(/,/g, '').trim();
  if (s.length === 0) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Coerce any date-ish input to a millisecond epoch.
 * Accepts: Date, number (epoch), ISO string, DD/MM/YYYY, YYYY-MM-DD.
 * Returns NaN when unparseable.
 */
function parseDate(v) {
  if (v === null || v === undefined) return NaN;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim();
  if (s.length === 0) return NaN;

  // DD/MM/YYYY or DD-MM-YYYY (Israeli civil format)
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    let y = Number(m[3]);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isFinite(dt.getTime()) ? dt.getTime() : NaN;
  }

  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

const ONE_DAY_MS = 86400000;

/**
 * Absolute day difference between two date-ish values.
 * Returns Infinity if either side is unparseable — callers treat this
 * as "out of any window".
 */
function dayDiff(a, b) {
  const ta = parseDate(a);
  const tb = parseDate(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb) / ONE_DAY_MS;
}

/**
 * Amounts are considered "equal" if they agree to the nearest agora.
 */
function amountsEqual(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) < 0.01;
}

/**
 * Relative amount delta in [0, ∞). Returns Infinity for unparseable sides.
 */
function amountRelDelta(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / denom;
}

/**
 * Vendor key for bucketing — normalized vendor name OR vendor id when the
 * name is missing. Returns '' if nothing usable is present.
 */
function vendorKey(bill) {
  if (!bill || typeof bill !== 'object') return '';
  const name = bill.vendor_name || bill.vendor || (bill.supplier && bill.supplier.name) || '';
  const id = bill.vendor_id || (bill.supplier && bill.supplier.id) || '';
  const norm = normalizeHebrew(name);
  if (norm) return norm;
  return id ? `#${String(id)}` : '';
}

/**
 * Tokenize normalized text into a Set of words of length ≥ 2.
 * Used by the Jaccard similarity of descriptions.
 */
function tokenSet(str) {
  const norm = normalizeHebrew(str);
  if (!norm) return new Set();
  const out = new Set();
  const parts = norm.split(' ');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length >= 2) out.add(p);
  }
  return out;
}

/**
 * Jaccard similarity between two token sets, in [0, 1].
 */
function jaccard(aSet, bSet) {
  if (aSet.size === 0 && bSet.size === 0) return 0;
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let inter = 0;
  const smaller = aSet.size <= bSet.size ? aSet : bSet;
  const larger = smaller === aSet ? bSet : aSet;
  smaller.forEach((tok) => { if (larger.has(tok)) inter++; });
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ─────────────────────────────────────────────────────────────
// Pair-wise comparison
// ─────────────────────────────────────────────────────────────

/**
 * A "signal" is a named reason two bills look like duplicates, along
 * with a confidence weight in [0, 1] and a bilingual label suitable for
 * showing the end user. Signals are combined by taking the MAX — this
 * gives the most generous-but-stable confidence across independent tests.
 *
 * @typedef {Object} Signal
 * @property {string} code     - machine-readable ID
 * @property {number} score    - weight in [0, 1]
 * @property {string} label_en - English user-facing sentence
 * @property {string} label_he - Hebrew user-facing sentence
 * @property {Object} [detail] - optional debug payload
 */

/**
 * Compare two bills and return the full list of signals that fire.
 * Empty array means "no evidence of duplication".
 *
 * @param {object} a
 * @param {object} b
 * @returns {Signal[]}
 */
function collectSignals(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [];

  const signals = [];

  const keyA = vendorKey(a);
  const keyB = vendorKey(b);
  const sameVendor = keyA.length > 0 && keyA === keyB;

  const invA = normalizeHebrew(a.invoice_no || a.invoiceNo || a.bill_no || a.number || '');
  const invB = normalizeHebrew(b.invoice_no || b.invoiceNo || b.bill_no || b.number || '');
  const sameInvoiceNo = invA.length > 0 && invA === invB;

  const totA = parseAmount(a.total != null ? a.total : a.amount);
  const totB = parseAmount(b.total != null ? b.total : b.amount);
  const totalEqual = amountsEqual(totA, totB);
  const totalRel = amountRelDelta(totA, totB);

  const days = dayDiff(a.date || a.invoice_date || a.bill_date, b.date || b.invoice_date || b.bill_date);

  // ── S1: exact match
  if (sameVendor && sameInvoiceNo && totalEqual) {
    signals.push({
      code: 'S1_EXACT',
      score: 1.0,
      label_en: LABELS.en.exactMatch,
      label_he: LABELS.he.exactMatch,
      detail: { vendor: keyA, invoice_no: invA, total: totA },
    });
  }

  // ── S2: same vendor + same total within 7 days
  if (sameVendor && totalEqual && days <= 7) {
    signals.push({
      code: 'S2_VENDOR_TOTAL_7D',
      score: 0.90,
      label_en: LABELS.en.sameVendorSameTotal7,
      label_he: LABELS.he.sameVendorSameTotal7,
      detail: { vendor: keyA, total: totA, days: Math.round(days) },
    });
  }

  // ── S3: same vendor + near-total (±1%) within 14 days
  if (sameVendor && totalRel <= 0.01 && !totalEqual && days <= 14) {
    signals.push({
      code: 'S3_VENDOR_NEAR_TOTAL_14D',
      score: 0.75,
      label_en: LABELS.en.sameVendorNearTotal14,
      label_he: LABELS.he.sameVendorNearTotal14,
      detail: { vendor: keyA, totals: [totA, totB], rel_delta: totalRel, days: Math.round(days) },
    });
  }

  // ── S4: similar vendor name (Levenshtein < 3) + exact total within 7 days
  //        only fires when vendors differ but are *close*
  if (!sameVendor && keyA && keyB) {
    const dist = levenshtein(keyA, keyB);
    if (dist < 3 && totalEqual && days <= 7) {
      signals.push({
        code: 'S4_SIMILAR_VENDOR_EXACT_TOTAL',
        score: 0.80,
        label_en: LABELS.en.similarVendorExactTotal,
        label_he: LABELS.he.similarVendorExactTotal,
        detail: { vendors: [keyA, keyB], distance: dist, total: totA, days: Math.round(days) },
      });
    }
  }

  // ── S5: similar description (Jaccard ≥ 0.6) + same amount
  //        description can come from any of a few common field names
  const descA = a.description || a.desc || a.memo || a.notes || '';
  const descB = b.description || b.desc || b.memo || b.notes || '';
  if (descA && descB && totalEqual) {
    const sim = jaccard(tokenSet(descA), tokenSet(descB));
    if (sim >= 0.60) {
      signals.push({
        code: 'S5_SIMILAR_DESC_SAME_AMOUNT',
        score: 0.60,
        label_en: LABELS.en.similarDescriptionSameAmount,
        label_he: LABELS.he.similarDescriptionSameAmount,
        detail: { jaccard: sim, total: totA },
      });
    }
  }

  // ── S6: check / reference number reused for same vendor
  //        (this is a *flag*, not a high-confidence duplicate on its own)
  const refA = normalizeHebrew(a.check_no || a.reference || a.ref || a.payment_ref || '');
  const refB = normalizeHebrew(b.check_no || b.reference || b.ref || b.payment_ref || '');
  if (sameVendor && refA.length > 0 && refA === refB) {
    signals.push({
      code: 'S6_REFERENCE_REUSE',
      score: 0.55,
      label_en: LABELS.en.referenceReuse,
      label_he: LABELS.he.referenceReuse,
      detail: { vendor: keyA, reference: refA },
      flag: true,
    });
  }

  return signals;
}

/**
 * Combined confidence of a signal list = max(score). Returns 0 if empty.
 */
function combineConfidence(signals) {
  if (!signals || signals.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < signals.length; i++) {
    if (signals[i].score > best) best = signals[i].score;
  }
  return best;
}

/**
 * Public pair-wise API.
 * @param {object} bill1
 * @param {object} bill2
 * @returns {{duplicate: boolean, confidence: number, signals: Signal[]}}
 */
function isDuplicate(bill1, bill2) {
  if (bill1 === bill2) {
    // same object identity — always a duplicate by definition
    return {
      duplicate: true,
      confidence: 1,
      signals: [{
        code: 'S0_SAME_REF',
        score: 1,
        label_en: 'Identical object reference',
        label_he: 'מופע זהה של אותו אובייקט',
      }],
    };
  }
  const signals = collectSignals(bill1, bill2);
  const confidence = combineConfidence(signals);
  return {
    duplicate: confidence >= 0.5,
    confidence,
    signals,
  };
}

// ─────────────────────────────────────────────────────────────
// Batch grouping (Union-Find)
// ─────────────────────────────────────────────────────────────

/**
 * Classic Union-Find / Disjoint-Set over indices [0, n). Path-compressed
 * and union-by-rank so the near-linear α(n) bound holds. We use it to
 * collapse the pair-wise edges into connected components.
 */
function makeUF(n) {
  const parent = new Array(n);
  const rank = new Array(n);
  for (let i = 0; i < n; i++) { parent[i] = i; rank[i] = 0; }
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
    return true;
  }
  return { find, union };
}

/**
 * Scan a batch of bills for potential duplicates. Returns an array of
 * groups; each group has a `primary` (the canonical bill), a list of
 * `candidates` (everyone else in the group), the aggregated `signals`
 * from every pair-wise edge inside the group, and the maximum
 * `combined_confidence` seen.
 *
 * The primary is chosen deterministically as the bill with the lowest
 * "index" among the bills in the group — falling back to the earliest
 * known date when indices tie. This keeps the output stable for UI.
 *
 * @param {Array<object>} bills
 * @returns {Array<{primary: object, candidates: object[], signals: Signal[], combined_confidence: number}>}
 */
function findDuplicates(bills) {
  if (!Array.isArray(bills) || bills.length < 2) return [];

  const n = bills.length;
  const uf = makeUF(n);
  /** @type {Array<{i: number, j: number, signals: Signal[], confidence: number}>} */
  const edges = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sigs = collectSignals(bills[i], bills[j]);
      if (sigs.length === 0) continue;
      const conf = combineConfidence(sigs);
      // Only merge on "real" duplicate evidence (≥ 0.5). Sub-threshold
      // signals are reported only inside existing groups.
      if (conf >= 0.5) {
        uf.union(i, j);
        edges.push({ i, j, signals: sigs, confidence: conf });
      }
    }
  }

  if (edges.length === 0) return [];

  // Bucket indices by root
  /** @type {Map<number, number[]>} */
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const r = uf.find(i);
    let list = buckets.get(r);
    if (!list) { list = []; buckets.set(r, list); }
    list.push(i);
  }

  const groups = [];
  buckets.forEach((indices) => {
    if (indices.length < 2) return;
    indices.sort((a, b) => a - b);

    // Aggregate signals from every edge whose endpoints are in this group
    const indexSet = new Set(indices);
    const allSignals = [];
    let best = 0;
    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      if (indexSet.has(ed.i) && indexSet.has(ed.j)) {
        for (let s = 0; s < ed.signals.length; s++) allSignals.push(ed.signals[s]);
        if (ed.confidence > best) best = ed.confidence;
      }
    }

    // Choose primary: earliest known date, fallback = lowest index
    let primaryIdx = indices[0];
    let primaryDate = parseDate(bills[primaryIdx].date || bills[primaryIdx].invoice_date);
    for (let k = 1; k < indices.length; k++) {
      const idx = indices[k];
      const d = parseDate(bills[idx].date || bills[idx].invoice_date);
      if (Number.isFinite(d)) {
        if (!Number.isFinite(primaryDate) || d < primaryDate) {
          primaryDate = d;
          primaryIdx = idx;
        }
      }
    }

    const candidates = [];
    for (let k = 0; k < indices.length; k++) {
      if (indices[k] !== primaryIdx) candidates.push(bills[indices[k]]);
    }

    groups.push({
      primary: bills[primaryIdx],
      candidates,
      signals: allSignals,
      combined_confidence: best,
    });
  });

  // Stable output: highest confidence first, then by primary "index"
  groups.sort((g1, g2) => {
    if (g2.combined_confidence !== g1.combined_confidence) {
      return g2.combined_confidence - g1.combined_confidence;
    }
    return bills.indexOf(g1.primary) - bills.indexOf(g2.primary);
  });

  return groups;
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  // Public API
  findDuplicates,
  isDuplicate,
  normalizeHebrew,
  levenshtein,
  // Exposed for tests / diagnostics
  _internal: {
    collectSignals,
    combineConfidence,
    parseAmount,
    parseDate,
    dayDiff,
    amountsEqual,
    amountRelDelta,
    vendorKey,
    tokenSet,
    jaccard,
    LABELS,
  },
};
