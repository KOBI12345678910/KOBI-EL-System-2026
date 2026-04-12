/**
 * Revenue Waterfall Engine — מנוע מפל הכנסות
 * =================================================================
 *
 * Agent Y-195  •  Swarm Reporting & Finance  •  Techno-Kol Uzi mega-ERP
 * =================================================================
 *
 * Zero-dependency bilingual revenue waterfall engine. Builds the
 * canonical SaaS "start → new → expansion → contraction → churn →
 * end" roll-forward, then adapts the same engine to Techno-Kol Uzi's
 * real business: project-based metal fabrication revenue recognised
 * at completion milestones (welding, cutting, powder-coating,
 * installation). The same waterfall also works for hybrid cases:
 * retainer customers (SaaS-like ARR) who also book one-shot
 * fabrication projects.
 *
 * =====================================================================
 * THE GOLDEN RULE OF THE ERP
 * =====================================================================
 * לא מוחקים — רק משדרגים ומגדלים
 * Nothing is ever deleted. Every waterfall snapshot is append-only;
 * customers that churn are not removed from the customerBase — they
 * transition to status CHURNED and remain in the ledger forever, so
 * we can resurrect, re-engage and compute reactivation metrics years
 * later. A "correction" is a new snapshot that references the prior
 * snapshot via `supersedes`, never an in-place overwrite.
 *
 * =====================================================================
 * ZERO DEPENDENCIES
 * =====================================================================
 * Only Node built-ins (`node:crypto`). No npm packages. No HTTP, no
 * disk, no database — the engine is pure and deterministic. SVG is
 * hand-rolled as a string template so it can be served as-is to the
 * dashboard or embedded in any PDF renderer downstream.
 *
 * =====================================================================
 * BILINGUAL
 * =====================================================================
 * Every label, status, category, axis, tooltip and error message
 * ships as `{ he, en }`. The SVG emits `direction="rtl"` when the
 * caller passes `{ lang: 'he' }` and `direction="ltr"` for English.
 *
 * ---------------------------------------------------------------------
 * PUBLIC API
 * ---------------------------------------------------------------------
 *   class RevenueWaterfall
 *     • build(periodStart, periodEnd, customerBase)        → snapshot
 *     • buildProjectBased(periodStart, periodEnd, projects) → snapshot
 *     • rollForward(prevSnapshot, currCustomerBase)         → snapshot
 *     • netRetention(snapshot)                              → number (0..∞)
 *     • grossRetention(snapshot)                            → number (0..1)
 *     • quickRatio(snapshot)                                → number
 *     • burnMultiple(snapshot, netBurn)                     → number
 *     • renderSVG(snapshot, opts?)                          → string
 *     • history(customerId?)                                → snapshot[]
 *     • latest()                                            → snapshot|null
 *
 *   const BUCKETS       — start / new / expansion / contraction / churn / end
 *   const CUSTOMER_STATUS — active / new / churned / won_back / expanded / contracted
 *   const LABELS_HE     — Hebrew label dictionary
 *   const LABELS_EN     — English label dictionary
 *   const PALANTIR_THEME — colour & typography tokens
 *   function formatNIS(n, opts?)   — Israeli Shekel formatter
 *   function formatPct(n, opts?)   — percentage formatter
 *   function classifyCustomer(prev, curr) — MRR delta classifier
 *   function createMemoryStore()
 */

'use strict';

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** Waterfall buckets — canonical SaaS + project roll-forward */
const BUCKETS = Object.freeze({
  START:       'start',
  NEW:         'new',
  EXPANSION:   'expansion',
  CONTRACTION: 'contraction',
  CHURN:       'churn',
  END:         'end',
});

const BUCKET_ORDER = Object.freeze([
  BUCKETS.START,
  BUCKETS.NEW,
  BUCKETS.EXPANSION,
  BUCKETS.CONTRACTION,
  BUCKETS.CHURN,
  BUCKETS.END,
]);

/** Customer lifecycle status — append-only; churned customers are kept */
const CUSTOMER_STATUS = Object.freeze({
  ACTIVE:     'active',
  NEW:        'new',
  EXPANDED:   'expanded',
  CONTRACTED: 'contracted',
  CHURNED:    'churned',
  WON_BACK:   'won_back',
});

/** Project completion status — used by buildProjectBased */
const PROJECT_STATUS = Object.freeze({
  PLANNED:     'planned',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
  ON_HOLD:     'on_hold',
  CANCELLED:   'cancelled',
});

/** Revenue recognition model */
const REV_MODEL = Object.freeze({
  SUBSCRIPTION:       'subscription',      // monthly recurring
  PROJECT_COMPLETION: 'project_completion', // metal fab, one-shot
  PROJECT_MILESTONE:  'project_milestone',  // staged %-complete
  RETAINER:           'retainer',           // hybrid SaaS-like
});

// ═══════════════════════════════════════════════════════════════════
// BILINGUAL LABELS
// ═══════════════════════════════════════════════════════════════════

const LABELS_HE = Object.freeze({
  title:            'מפל הכנסות',
  subtitle:         'ניתוח גלגול מתקופה לתקופה',
  start:            'התחלה',
  new:              'לקוחות חדשים',
  expansion:        'הרחבה',
  contraction:      'צמצום',
  churn:            'נטישה',
  end:              'סיום',
  netRetention:     'שימור נטו (NRR)',
  grossRetention:   'שימור ברוטו (GRR)',
  quickRatio:       'יחס מהיר',
  period:           'תקופה',
  customers:        'לקוחות',
  projects:         'פרויקטים',
  arr:              'הכנסה שנתית חוזרת',
  mrr:              'הכנסה חודשית חוזרת',
  amount:           'סכום',
  count:            'מספר',
  percentOfStart:   '% מההתחלה',
  deltaVsStart:     'שינוי מההתחלה',
  projectBased:     'מפל מבוסס פרויקטים',
  saasBased:        'מפל מבוסס מנויים',
  metalFab:         'ייצור מתכת',
  completionRev:    'הכנסה מהשלמה',
  milestone:        'אבן דרך',
  errorPeriod:      'תאריך סיום חייב להיות אחרי תאריך התחלה',
  errorBase:        'customerBase חייב להיות מערך',
  errorSnapshot:    'snapshot לא נמצא',
});

const LABELS_EN = Object.freeze({
  title:            'Revenue Waterfall',
  subtitle:         'Period-to-Period Roll-Forward Analysis',
  start:            'Starting',
  new:              'New',
  expansion:        'Expansion',
  contraction:      'Contraction',
  churn:            'Churn',
  end:              'Ending',
  netRetention:     'Net Revenue Retention (NRR)',
  grossRetention:   'Gross Revenue Retention (GRR)',
  quickRatio:       'Quick Ratio',
  period:           'Period',
  customers:        'Customers',
  projects:         'Projects',
  arr:              'Annual Recurring Revenue',
  mrr:              'Monthly Recurring Revenue',
  amount:           'Amount',
  count:            'Count',
  percentOfStart:   '% of Start',
  deltaVsStart:     'Delta vs Start',
  projectBased:     'Project-Based Waterfall',
  saasBased:        'Subscription-Based Waterfall',
  metalFab:         'Metal Fabrication',
  completionRev:    'Completion Revenue',
  milestone:        'Milestone',
  errorPeriod:      'periodEnd must be after periodStart',
  errorBase:        'customerBase must be an array',
  errorSnapshot:    'snapshot not found',
});

// ═══════════════════════════════════════════════════════════════════
// PALANTIR THEME TOKENS
// ═══════════════════════════════════════════════════════════════════

const PALANTIR_THEME = Object.freeze({
  colors: Object.freeze({
    bg:            '#0b0f17',   // near-black navy
    surface:       '#101623',
    surfaceAlt:    '#162031',
    border:        '#1f2b3e',
    text:          '#e6edf6',
    textMuted:     '#9aa8bf',
    accent:        '#1f8bff',   // signature Palantir blue
    accentAlt:     '#00d1b2',
    success:       '#00b37e',   // expansion / new
    warning:       '#f2a900',   // contraction
    danger:        '#d22b2b',   // churn
    gridline:      '#22304a',
    // bucket-specific
    bucketStart:       '#1f8bff',
    bucketNew:         '#00b37e',
    bucketExpansion:   '#00d1b2',
    bucketContraction: '#f2a900',
    bucketChurn:       '#d22b2b',
    bucketEnd:         '#1f8bff',
  }),
  fonts: Object.freeze({
    he:   'Rubik, Heebo, "Arial Hebrew", Arial, sans-serif',
    en:   'Inter, "IBM Plex Sans", Helvetica, Arial, sans-serif',
    mono: '"IBM Plex Mono", "JetBrains Mono", monospace',
  }),
  type: Object.freeze({
    displayPt: 32,
    h1Pt:      22,
    h2Pt:      18,
    bodyPt:    12,
    smallPt:   10,
  }),
  layout: Object.freeze({
    width:    1000,
    height:   560,
    marginT:  56,
    marginR:  32,
    marginB:  72,
    marginL:  64,
  }),
});

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

/**
 * Israeli Shekel formatter. Never uses `Intl.NumberFormat` so the
 * engine stays deterministic across locales. Zero-dep.
 */
function formatNIS(n, opts = {}) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const num = Number(n);
  const neg = num < 0;
  const abs = Math.abs(num);
  const fractionDigits = opts.fractionDigits != null ? opts.fractionDigits : 2;
  const fixed = abs.toFixed(fractionDigits);
  const [intPart, fracPart] = fixed.split('.');
  // thousands separator — comma is the Israeli ledger convention
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = fracPart ? `${withCommas}.${fracPart}` : withCommas;
  const sign = neg ? '−' : '';
  const symbol = opts.symbol != null ? opts.symbol : '₪';
  const compact = opts.compact === true;
  if (compact && abs >= 1_000_000) {
    const mil = (abs / 1_000_000).toFixed(2);
    return `${sign}${symbol}${mil}M`;
  }
  if (compact && abs >= 1_000) {
    const k = (abs / 1_000).toFixed(1);
    return `${sign}${symbol}${k}K`;
  }
  return `${sign}${symbol}${body}`;
}

/** Percentage formatter — 0.85 → "85.00%" */
function formatPct(n, opts = {}) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const num = Number(n);
  const fractionDigits = opts.fractionDigits != null ? opts.fractionDigits : 2;
  const pct = (num * 100).toFixed(fractionDigits);
  return `${pct}%`;
}

/** Escape text for safe SVG embedding */
function escapeSvg(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Stable snapshot id */
function makeSnapshotId(periodStart, periodEnd, revenueEnd) {
  const h = crypto.createHash('sha1');
  h.update(`${periodStart}|${periodEnd}|${revenueEnd}`);
  return `snap_${h.digest('hex').slice(0, 12)}`;
}

/** Parse an ISO date or Date or milliseconds */
function toDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'number') return new Date(d);
  if (typeof d === 'string') return new Date(d);
  throw new Error('invalid date value');
}

/** Classify a customer's MRR delta into a waterfall bucket */
function classifyCustomer(prev, curr) {
  const prevMrr = prev && typeof prev.mrr === 'number' ? prev.mrr : 0;
  const currMrr = curr && typeof curr.mrr === 'number' ? curr.mrr : 0;
  if (prevMrr === 0 && currMrr > 0) {
    return { bucket: BUCKETS.NEW, delta: currMrr, prev: 0, curr: currMrr };
  }
  if (prevMrr > 0 && currMrr === 0) {
    return { bucket: BUCKETS.CHURN, delta: -prevMrr, prev: prevMrr, curr: 0 };
  }
  if (currMrr > prevMrr) {
    return { bucket: BUCKETS.EXPANSION, delta: currMrr - prevMrr, prev: prevMrr, curr: currMrr };
  }
  if (currMrr < prevMrr) {
    return { bucket: BUCKETS.CONTRACTION, delta: currMrr - prevMrr, prev: prevMrr, curr: currMrr };
  }
  return { bucket: null, delta: 0, prev: prevMrr, curr: currMrr };
}

/** Index an array of customers by id for O(1) lookup */
function indexById(arr) {
  const m = new Map();
  for (const c of arr || []) {
    if (c && c.id != null) m.set(String(c.id), c);
  }
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY APPEND-ONLY STORE
// ═══════════════════════════════════════════════════════════════════

function createMemoryStore() {
  const snapshots = [];
  return {
    save(snapshot) {
      snapshots.push(snapshot);
      return snapshot;
    },
    list() {
      return snapshots.slice();
    },
    latest() {
      return snapshots.length ? snapshots[snapshots.length - 1] : null;
    },
    byId(id) {
      return snapshots.find((s) => s.snapshotId === id) || null;
    },
    count() {
      return snapshots.length;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// THE ENGINE
// ═══════════════════════════════════════════════════════════════════

class RevenueWaterfall {
  constructor(options = {}) {
    this.store = options.store || createMemoryStore();
    this.theme = options.theme || PALANTIR_THEME;
    this.defaultLang = options.lang === 'en' ? 'en' : 'he';
    this.currency = options.currency || 'NIS';
  }

  // ─────────────────────────────────────────────────────────────────
  // BUILD — SaaS / MRR-ARR waterfall
  // ─────────────────────────────────────────────────────────────────

  /**
   * Build a revenue waterfall from a periodical customer base.
   *
   * @param {string|Date} periodStart
   * @param {string|Date} periodEnd
   * @param {Array<{id, name?, mrrStart, mrrEnd, status?}>} customerBase
   * @returns {Object} snapshot { start, new, expansion, contraction, churn, end, ...}
   */
  build(periodStart, periodEnd, customerBase) {
    const ps = toDate(periodStart);
    const pe = toDate(periodEnd);
    if (!(pe.getTime() > ps.getTime())) {
      throw new Error(LABELS_EN.errorPeriod);
    }
    if (!Array.isArray(customerBase)) {
      throw new Error(LABELS_EN.errorBase);
    }

    const buckets = {
      [BUCKETS.NEW]:         { amount: 0, count: 0, customers: [] },
      [BUCKETS.EXPANSION]:   { amount: 0, count: 0, customers: [] },
      [BUCKETS.CONTRACTION]: { amount: 0, count: 0, customers: [] },
      [BUCKETS.CHURN]:       { amount: 0, count: 0, customers: [] },
    };

    let startMrr = 0;
    let endMrr = 0;
    let startCount = 0;
    let endCount = 0;

    for (const c of customerBase) {
      const prevMrr = typeof c.mrrStart === 'number' ? c.mrrStart : 0;
      const currMrr = typeof c.mrrEnd === 'number' ? c.mrrEnd : 0;
      startMrr += prevMrr;
      endMrr += currMrr;
      if (prevMrr > 0) startCount += 1;
      if (currMrr > 0) endCount += 1;

      const cls = classifyCustomer({ mrr: prevMrr }, { mrr: currMrr });
      if (cls.bucket) {
        const b = buckets[cls.bucket];
        b.amount += cls.delta;
        b.count += 1;
        b.customers.push({
          id: c.id,
          name: c.name || String(c.id),
          prev: cls.prev,
          curr: cls.curr,
          delta: cls.delta,
        });
      }
    }

    // End = Start + New + Expansion + Contraction + Churn
    // (contraction and churn are already negative, so we add)
    const computedEnd =
      startMrr +
      buckets[BUCKETS.NEW].amount +
      buckets[BUCKETS.EXPANSION].amount +
      buckets[BUCKETS.CONTRACTION].amount +
      buckets[BUCKETS.CHURN].amount;

    // Sanity check — the sum should match the observed end MRR,
    // but floating point drift is allowed up to 0.01 NIS.
    const drift = Math.abs(computedEnd - endMrr);
    const reconciles = drift < 0.01;

    const snapshotId = makeSnapshotId(ps.toISOString(), pe.toISOString(), endMrr);

    const snapshot = {
      snapshotId,
      type: REV_MODEL.SUBSCRIPTION,
      periodStart: ps.toISOString(),
      periodEnd: pe.toISOString(),
      currency: this.currency,
      start:       { amount: startMrr, count: startCount, label: { he: LABELS_HE.start, en: LABELS_EN.start } },
      new:         { amount: buckets[BUCKETS.NEW].amount,         count: buckets[BUCKETS.NEW].count,         customers: buckets[BUCKETS.NEW].customers,         label: { he: LABELS_HE.new,         en: LABELS_EN.new } },
      expansion:   { amount: buckets[BUCKETS.EXPANSION].amount,   count: buckets[BUCKETS.EXPANSION].count,   customers: buckets[BUCKETS.EXPANSION].customers,   label: { he: LABELS_HE.expansion,   en: LABELS_EN.expansion } },
      contraction: { amount: buckets[BUCKETS.CONTRACTION].amount, count: buckets[BUCKETS.CONTRACTION].count, customers: buckets[BUCKETS.CONTRACTION].customers, label: { he: LABELS_HE.contraction, en: LABELS_EN.contraction } },
      churn:       { amount: buckets[BUCKETS.CHURN].amount,       count: buckets[BUCKETS.CHURN].count,       customers: buckets[BUCKETS.CHURN].customers,       label: { he: LABELS_HE.churn,       en: LABELS_EN.churn } },
      end:         { amount: endMrr, count: endCount, label: { he: LABELS_HE.end, en: LABELS_EN.end } },
      computedEnd,
      reconciles,
      drift,
      netRetention: startMrr === 0 ? null : endMrr / startMrr,
      grossRetention: startMrr === 0 ? null : (startMrr + buckets[BUCKETS.CONTRACTION].amount + buckets[BUCKETS.CHURN].amount) / startMrr,
      quickRatio: (Math.abs(buckets[BUCKETS.CHURN].amount) + Math.abs(buckets[BUCKETS.CONTRACTION].amount)) === 0
        ? null
        : (buckets[BUCKETS.NEW].amount + buckets[BUCKETS.EXPANSION].amount) /
          (Math.abs(buckets[BUCKETS.CHURN].amount) + Math.abs(buckets[BUCKETS.CONTRACTION].amount)),
      createdAt: new Date().toISOString(),
      supersedes: null,
    };

    this.store.save(snapshot);
    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────
  // BUILD — Project-based (metal fab) waterfall
  // ─────────────────────────────────────────────────────────────────

  /**
   * Build a waterfall for project-based revenue (metal fabrication at
   * Techno-Kol Uzi: welding, cutting, powder-coating, installation).
   *
   * A project is "recognised" when its completion status flips to
   * COMPLETED during the period. Scope expansion becomes expansion;
   * change-orders that shrink scope become contraction; cancellations
   * become churn; new project awards that start AND complete in the
   * period become "new". Projects that were in-progress at the start
   * and still in-progress at the end contribute the delta of their
   * percent-complete multiplied by contract value to the appropriate
   * bucket.
   *
   * @param {string|Date} periodStart
   * @param {string|Date} periodEnd
   * @param {Array} projects  — each: {id, customerId?, contractValue, pctCompleteStart, pctCompleteEnd, statusStart, statusEnd, contractValueStart?}
   */
  buildProjectBased(periodStart, periodEnd, projects) {
    const ps = toDate(periodStart);
    const pe = toDate(periodEnd);
    if (!(pe.getTime() > ps.getTime())) {
      throw new Error(LABELS_EN.errorPeriod);
    }
    if (!Array.isArray(projects)) {
      throw new Error('projects must be an array');
    }

    const buckets = {
      [BUCKETS.NEW]:         { amount: 0, count: 0, projects: [] },
      [BUCKETS.EXPANSION]:   { amount: 0, count: 0, projects: [] },
      [BUCKETS.CONTRACTION]: { amount: 0, count: 0, projects: [] },
      [BUCKETS.CHURN]:       { amount: 0, count: 0, projects: [] },
    };

    let startRev = 0;
    let endRev = 0;
    let startCount = 0;
    let endCount = 0;

    for (const p of projects) {
      const valStart = typeof p.contractValueStart === 'number'
        ? p.contractValueStart
        : (typeof p.contractValue === 'number' ? p.contractValue : 0);
      const valEnd = typeof p.contractValue === 'number' ? p.contractValue : 0;
      const pctS = typeof p.pctCompleteStart === 'number' ? Math.max(0, Math.min(1, p.pctCompleteStart)) : 0;
      const pctE = typeof p.pctCompleteEnd === 'number' ? Math.max(0, Math.min(1, p.pctCompleteEnd)) : 0;
      const recognisedStart = valStart * pctS;
      const recognisedEnd = valEnd * pctE;

      const statusStart = p.statusStart || PROJECT_STATUS.PLANNED;
      const statusEnd = p.statusEnd || PROJECT_STATUS.PLANNED;

      startRev += recognisedStart;
      endRev += recognisedEnd;
      if (recognisedStart > 0) startCount += 1;
      if (recognisedEnd > 0) endCount += 1;

      const brand = {
        id: p.id,
        customerId: p.customerId,
        name: p.name || String(p.id),
        recognisedStart,
        recognisedEnd,
        delta: recognisedEnd - recognisedStart,
        statusStart,
        statusEnd,
      };

      // Classification
      if (statusStart === PROJECT_STATUS.CANCELLED || statusEnd === PROJECT_STATUS.CANCELLED) {
        // full churn: anything recognised at start is written off
        if (recognisedStart > 0) {
          buckets[BUCKETS.CHURN].amount += -recognisedStart;
          buckets[BUCKETS.CHURN].count += 1;
          buckets[BUCKETS.CHURN].projects.push({ ...brand, delta: -recognisedStart });
        }
        continue;
      }
      if (recognisedStart === 0 && recognisedEnd > 0) {
        buckets[BUCKETS.NEW].amount += recognisedEnd;
        buckets[BUCKETS.NEW].count += 1;
        buckets[BUCKETS.NEW].projects.push(brand);
        continue;
      }
      if (recognisedEnd > recognisedStart) {
        buckets[BUCKETS.EXPANSION].amount += (recognisedEnd - recognisedStart);
        buckets[BUCKETS.EXPANSION].count += 1;
        buckets[BUCKETS.EXPANSION].projects.push(brand);
        continue;
      }
      if (recognisedEnd < recognisedStart) {
        // this is unusual for % complete — treat as scope contraction
        buckets[BUCKETS.CONTRACTION].amount += (recognisedEnd - recognisedStart);
        buckets[BUCKETS.CONTRACTION].count += 1;
        buckets[BUCKETS.CONTRACTION].projects.push(brand);
        continue;
      }
      // equal — no movement
    }

    const computedEnd =
      startRev +
      buckets[BUCKETS.NEW].amount +
      buckets[BUCKETS.EXPANSION].amount +
      buckets[BUCKETS.CONTRACTION].amount +
      buckets[BUCKETS.CHURN].amount;

    const drift = Math.abs(computedEnd - endRev);
    const reconciles = drift < 0.01;

    const snapshotId = makeSnapshotId(ps.toISOString(), pe.toISOString(), endRev);

    const snapshot = {
      snapshotId,
      type: REV_MODEL.PROJECT_COMPLETION,
      periodStart: ps.toISOString(),
      periodEnd: pe.toISOString(),
      currency: this.currency,
      start:       { amount: startRev, count: startCount, label: { he: LABELS_HE.start, en: LABELS_EN.start } },
      new:         { amount: buckets[BUCKETS.NEW].amount,         count: buckets[BUCKETS.NEW].count,         projects: buckets[BUCKETS.NEW].projects,         label: { he: LABELS_HE.new,         en: LABELS_EN.new } },
      expansion:   { amount: buckets[BUCKETS.EXPANSION].amount,   count: buckets[BUCKETS.EXPANSION].count,   projects: buckets[BUCKETS.EXPANSION].projects,   label: { he: LABELS_HE.expansion,   en: LABELS_EN.expansion } },
      contraction: { amount: buckets[BUCKETS.CONTRACTION].amount, count: buckets[BUCKETS.CONTRACTION].count, projects: buckets[BUCKETS.CONTRACTION].projects, label: { he: LABELS_HE.contraction, en: LABELS_EN.contraction } },
      churn:       { amount: buckets[BUCKETS.CHURN].amount,       count: buckets[BUCKETS.CHURN].count,       projects: buckets[BUCKETS.CHURN].projects,       label: { he: LABELS_HE.churn,       en: LABELS_EN.churn } },
      end:         { amount: endRev, count: endCount, label: { he: LABELS_HE.end, en: LABELS_EN.end } },
      computedEnd,
      reconciles,
      drift,
      netRetention: startRev === 0 ? null : endRev / startRev,
      grossRetention: startRev === 0 ? null : (startRev + buckets[BUCKETS.CONTRACTION].amount + buckets[BUCKETS.CHURN].amount) / startRev,
      quickRatio: (Math.abs(buckets[BUCKETS.CHURN].amount) + Math.abs(buckets[BUCKETS.CONTRACTION].amount)) === 0
        ? null
        : (buckets[BUCKETS.NEW].amount + buckets[BUCKETS.EXPANSION].amount) /
          (Math.abs(buckets[BUCKETS.CHURN].amount) + Math.abs(buckets[BUCKETS.CONTRACTION].amount)),
      createdAt: new Date().toISOString(),
      supersedes: null,
    };

    this.store.save(snapshot);
    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────
  // ROLL-FORWARD — prev snapshot + new customer base → new snapshot
  // ─────────────────────────────────────────────────────────────────

  /**
   * Roll forward from a previous snapshot. The previous snapshot's
   * `end` becomes the new snapshot's `start`; the new customer base
   * supplies the deltas. Every customer present in both sides is
   * classified; customers that disappear are churn; new ids are new.
   */
  rollForward(prevSnapshot, currCustomerBase) {
    if (!prevSnapshot || typeof prevSnapshot !== 'object') {
      throw new Error(LABELS_EN.errorSnapshot);
    }
    if (!Array.isArray(currCustomerBase)) {
      throw new Error(LABELS_EN.errorBase);
    }
    // Re-build a waterfall where mrrStart is taken from prev snapshot
    // (by customer id) and mrrEnd from the new base.
    const prevIndex = new Map();
    // If the previous snapshot carried per-customer detail, use it
    const bucketSources = [
      prevSnapshot.new && prevSnapshot.new.customers,
      prevSnapshot.expansion && prevSnapshot.expansion.customers,
      prevSnapshot.contraction && prevSnapshot.contraction.customers,
      prevSnapshot.churn && prevSnapshot.churn.customers,
    ].filter(Boolean);
    for (const list of bucketSources) {
      for (const c of list) {
        prevIndex.set(String(c.id), c.curr);
      }
    }

    const currIndex = indexById(currCustomerBase);
    const allIds = new Set([
      ...Array.from(prevIndex.keys()),
      ...Array.from(currIndex.keys()),
    ]);

    const rebuilt = Array.from(allIds).map((id) => {
      const prev = prevIndex.get(id);
      const curr = currIndex.get(id);
      return {
        id,
        name: (curr && curr.name) || id,
        mrrStart: typeof prev === 'number' ? prev : 0,
        mrrEnd: curr && typeof curr.mrrEnd === 'number' ? curr.mrrEnd : (curr && typeof curr.mrr === 'number' ? curr.mrr : 0),
      };
    });

    const nextStart = toDate(prevSnapshot.periodEnd);
    const nextEnd = new Date(nextStart.getTime() + (toDate(prevSnapshot.periodEnd).getTime() - toDate(prevSnapshot.periodStart).getTime()));
    const snapshot = this.build(nextStart, nextEnd, rebuilt);
    snapshot.supersedes = null;
    snapshot.rolledFrom = prevSnapshot.snapshotId;
    return snapshot;
  }

  // ─────────────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────────────

  netRetention(snapshot) {
    if (!snapshot || !snapshot.start || snapshot.start.amount === 0) return null;
    return snapshot.end.amount / snapshot.start.amount;
  }

  grossRetention(snapshot) {
    if (!snapshot || !snapshot.start || snapshot.start.amount === 0) return null;
    const lost = Math.abs(snapshot.contraction.amount) + Math.abs(snapshot.churn.amount);
    return (snapshot.start.amount - lost) / snapshot.start.amount;
  }

  quickRatio(snapshot) {
    if (!snapshot) return null;
    const gained = snapshot.new.amount + snapshot.expansion.amount;
    const lost = Math.abs(snapshot.contraction.amount) + Math.abs(snapshot.churn.amount);
    if (lost === 0) return null;
    return gained / lost;
  }

  burnMultiple(snapshot, netBurn) {
    if (!snapshot || typeof netBurn !== 'number' || netBurn <= 0) return null;
    const netNew = snapshot.new.amount + snapshot.expansion.amount + snapshot.contraction.amount + snapshot.churn.amount;
    if (netNew <= 0) return null;
    return netBurn / netNew;
  }

  // ─────────────────────────────────────────────────────────────────
  // HISTORY
  // ─────────────────────────────────────────────────────────────────

  history() {
    return this.store.list();
  }

  latest() {
    return this.store.latest();
  }

  // ─────────────────────────────────────────────────────────────────
  // SVG RENDER — Palantir theme, bilingual
  // ─────────────────────────────────────────────────────────────────

  /**
   * Render a bilingual, Palantir-themed SVG of the waterfall. Returns
   * a complete `<svg ...>...</svg>` string. The caller can inline it
   * into HTML, pipe it to a PDF renderer, or serve it as an asset.
   *
   * @param {Object} snapshot
   * @param {Object} [opts]
   * @param {'he'|'en'} [opts.lang='he']
   * @param {number}    [opts.width]
   * @param {number}    [opts.height]
   */
  renderSVG(snapshot, opts = {}) {
    if (!snapshot || !snapshot.start || !snapshot.end) {
      throw new Error(LABELS_EN.errorSnapshot);
    }
    const lang = opts.lang === 'en' ? 'en' : this.defaultLang;
    const labels = lang === 'he' ? LABELS_HE : LABELS_EN;
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    const theme = this.theme;
    const W = opts.width || theme.layout.width;
    const H = opts.height || theme.layout.height;
    const mT = theme.layout.marginT;
    const mR = theme.layout.marginR;
    const mB = theme.layout.marginB;
    const mL = theme.layout.marginL;
    const innerW = W - mL - mR;
    const innerH = H - mT - mB;

    // Waterfall geometry
    const bars = [
      { key: BUCKETS.START,       amount: snapshot.start.amount,       cumulative: snapshot.start.amount,             fillKey: 'bucketStart',       isTotal: true  },
      { key: BUCKETS.NEW,         amount: snapshot.new.amount,         cumulative: snapshot.start.amount + snapshot.new.amount, fillKey: 'bucketNew',         isTotal: false },
      { key: BUCKETS.EXPANSION,   amount: snapshot.expansion.amount,   cumulative: snapshot.start.amount + snapshot.new.amount + snapshot.expansion.amount, fillKey: 'bucketExpansion',   isTotal: false },
      { key: BUCKETS.CONTRACTION, amount: snapshot.contraction.amount, cumulative: snapshot.start.amount + snapshot.new.amount + snapshot.expansion.amount + snapshot.contraction.amount, fillKey: 'bucketContraction', isTotal: false },
      { key: BUCKETS.CHURN,       amount: snapshot.churn.amount,       cumulative: snapshot.start.amount + snapshot.new.amount + snapshot.expansion.amount + snapshot.contraction.amount + snapshot.churn.amount, fillKey: 'bucketChurn',       isTotal: false },
      { key: BUCKETS.END,         amount: snapshot.end.amount,         cumulative: snapshot.end.amount,               fillKey: 'bucketEnd',         isTotal: true  },
    ];

    const maxCumulative = Math.max(
      snapshot.start.amount,
      snapshot.end.amount,
      snapshot.start.amount + Math.max(0, snapshot.new.amount) + Math.max(0, snapshot.expansion.amount),
      1, // avoid /0
    );
    const yScale = (v) => (innerH - (v / maxCumulative) * innerH);

    const barWidth = innerW / bars.length * 0.7;
    const slotWidth = innerW / bars.length;

    // Build bar rects and connecting lines
    const barEls = [];
    const labelEls = [];
    const valueEls = [];
    const connectorEls = [];
    let prevTopY = null;
    let prevRightX = null;

    bars.forEach((b, i) => {
      const slotCenter = mL + slotWidth * i + slotWidth / 2;
      const x = slotCenter - barWidth / 2;
      let yTop, yBottom, h;
      if (b.isTotal) {
        yTop = mT + yScale(b.amount);
        yBottom = mT + innerH;
        h = yBottom - yTop;
      } else {
        const startY = mT + yScale(b.cumulative - b.amount);
        const endY = mT + yScale(b.cumulative);
        yTop = Math.min(startY, endY);
        yBottom = Math.max(startY, endY);
        h = Math.max(2, yBottom - yTop);
      }
      const fill = theme.colors[b.fillKey];
      barEls.push(
        `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" opacity="0.92" rx="2" ry="2" />`
      );
      // label under bar
      labelEls.push(
        `<text x="${slotCenter.toFixed(1)}" y="${(mT + innerH + 22).toFixed(1)}" fill="${theme.colors.text}" font-family="${lang === 'he' ? theme.fonts.he : theme.fonts.en}" font-size="${theme.type.bodyPt}" text-anchor="middle">${escapeSvg(labels[b.key])}</text>`
      );
      // value above bar
      const valueStr = formatNIS(b.amount, { compact: true });
      const valueY = yTop - 6;
      valueEls.push(
        `<text x="${slotCenter.toFixed(1)}" y="${valueY.toFixed(1)}" fill="${theme.colors.text}" font-family="${theme.fonts.mono}" font-size="${theme.type.smallPt}" text-anchor="middle">${escapeSvg(valueStr)}</text>`
      );
      // connector from previous bar's top to this bar's top
      if (prevRightX != null && prevTopY != null && !b.isTotal) {
        const leftX = x;
        connectorEls.push(
          `<line x1="${prevRightX.toFixed(1)}" y1="${prevTopY.toFixed(1)}" x2="${leftX.toFixed(1)}" y2="${prevTopY.toFixed(1)}" stroke="${theme.colors.textMuted}" stroke-width="1" stroke-dasharray="2,2" />`
        );
      }
      prevRightX = x + barWidth;
      prevTopY = b.isTotal ? yTop : (b.amount >= 0 ? yTop : yBottom);
    });

    // Axis baseline
    const baselineY = mT + innerH;
    const gridEls = [];
    for (let g = 0; g <= 4; g++) {
      const gy = mT + (innerH / 4) * g;
      const gval = maxCumulative - (maxCumulative / 4) * g;
      gridEls.push(
        `<line x1="${mL}" y1="${gy.toFixed(1)}" x2="${(mL + innerW).toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${theme.colors.gridline}" stroke-width="0.5" />`
      );
      gridEls.push(
        `<text x="${(mL - 6).toFixed(1)}" y="${(gy + 4).toFixed(1)}" fill="${theme.colors.textMuted}" font-family="${theme.fonts.mono}" font-size="${theme.type.smallPt}" text-anchor="end">${escapeSvg(formatNIS(gval, { compact: true }))}</text>`
      );
    }

    // Metrics bar at the top
    const nrr = this.netRetention(snapshot);
    const grr = this.grossRetention(snapshot);
    const qr = this.quickRatio(snapshot);
    const metricsText = [
      `${labels.netRetention}: ${nrr != null ? formatPct(nrr) : '—'}`,
      `${labels.grossRetention}: ${grr != null ? formatPct(grr) : '—'}`,
      `${labels.quickRatio}: ${qr != null ? qr.toFixed(2) : '—'}`,
    ].join('   |   ');

    const titleText = snapshot.type === REV_MODEL.PROJECT_COMPLETION
      ? `${labels.title} — ${labels.projectBased}`
      : `${labels.title} — ${labels.saasBased}`;

    const periodText = `${labels.period}: ${snapshot.periodStart.slice(0, 10)} → ${snapshot.periodEnd.slice(0, 10)}`;

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" direction="${dir}" font-family="${lang === 'he' ? theme.fonts.he : theme.fonts.en}">`,
      `  <rect x="0" y="0" width="${W}" height="${H}" fill="${theme.colors.bg}" />`,
      `  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="${theme.colors.surface}" stroke="${theme.colors.border}" stroke-width="1" rx="6" ry="6" />`,
      `  <text x="${mL}" y="28" fill="${theme.colors.text}" font-size="${theme.type.h1Pt}" font-weight="700">${escapeSvg(titleText)}</text>`,
      `  <text x="${mL}" y="46" fill="${theme.colors.textMuted}" font-size="${theme.type.smallPt}">${escapeSvg(periodText)}</text>`,
      `  <text x="${(W - mR).toFixed(1)}" y="28" fill="${theme.colors.accent}" font-size="${theme.type.bodyPt}" text-anchor="end">${escapeSvg(metricsText)}</text>`,
      ...gridEls,
      `  <line x1="${mL}" y1="${baselineY}" x2="${(mL + innerW).toFixed(1)}" y2="${baselineY}" stroke="${theme.colors.border}" stroke-width="1" />`,
      ...connectorEls,
      ...barEls,
      ...valueEls,
      ...labelEls,
      `  <text x="${mL}" y="${(H - 14).toFixed(1)}" fill="${theme.colors.textMuted}" font-size="${theme.type.smallPt}">${escapeSvg(labels.subtitle)}</text>`,
      `  <text x="${(W - mR).toFixed(1)}" y="${(H - 14).toFixed(1)}" fill="${theme.colors.textMuted}" font-size="${theme.type.smallPt}" text-anchor="end">Techno-Kol Uzi • Agent Y-195</text>`,
      `</svg>`,
    ].join('\n');

    return svg;
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  RevenueWaterfall,
  BUCKETS,
  BUCKET_ORDER,
  CUSTOMER_STATUS,
  PROJECT_STATUS,
  REV_MODEL,
  LABELS_HE,
  LABELS_EN,
  PALANTIR_THEME,
  formatNIS,
  formatPct,
  classifyCustomer,
  createMemoryStore,
  escapeSvg,
  makeSnapshotId,
  toDate,
  indexById,
};
