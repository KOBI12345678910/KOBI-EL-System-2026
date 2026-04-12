/**
 * Vendor Performance Scoring — Techno-Kol Uzi (Swarm 3, Agent X-05)
 * ================================================================
 *
 * Composite 0-100 score for a supplier based on five weighted
 * dimensions, produced from raw purchase-order history. Append-only,
 * pure functions, no deletions, zero third-party dependencies.
 *
 * Weights (sum = 1.00):
 *   on-time delivery rate ........ 40 %
 *   price competitiveness ........ 20 %
 *   quality (reject / RMA) ....... 20 %
 *   communication responsiveness . 10 %
 *   payment terms ................ 10 %
 *
 * Badges:
 *   >85        ספק מועדף  (Preferred)
 *   70-85      ספק מאושר  (Approved)
 *   50-70      ניטור       (Monitor)
 *   <50        הסרה        (Remove)
 *
 * Israeli metal-fab specifics:
 *   - steel price index benchmarking is monthly (LME-aligned)
 *   - delivery windows: urgent = 24h, standard = 7d
 *   - קיבוץ / רמת גולן cooperative discounts (1-3% uplift vs
 *     list price treated as "competitive" not "cheap")
 *
 * Bilingual (HE/EN) Hebrew-first output. All text strings are
 * unicode-safe RTL.
 *
 * Export surface:
 *   scoreVendor(vendorId, history)        -> { composite, dimensions, badge, risks, recommendations }
 *   compareVendors(records)               -> ranked table
 *   detectSingleSource(catalog, category) -> concentration warnings
 *   vendorScorecard(vendorId, history)    -> Hebrew formatted report string
 *
 * NO DELETIONS — this module is append-only. It never mutates inputs.
 */

'use strict';

// =====================================================================
//  Constants
// =====================================================================

const WEIGHTS = Object.freeze({
  onTimeDelivery: 0.40,
  priceCompetitiveness: 0.20,
  quality: 0.20,
  communication: 0.10,
  paymentTerms: 0.10,
});

const BADGE_PREFERRED = 'ספק מועדף';
const BADGE_APPROVED = 'ספק מאושר';
const BADGE_MONITOR = 'ניטור';
const BADGE_REMOVE = 'הסרה';

const BADGE_EN = Object.freeze({
  [BADGE_PREFERRED]: 'Preferred',
  [BADGE_APPROVED]: 'Approved',
  [BADGE_MONITOR]: 'Monitor',
  [BADGE_REMOVE]: 'Remove',
});

// Risk codes (stable machine-readable)
const RISK_SINGLE_SOURCE = 'SINGLE_SOURCE';
const RISK_CONCENTRATION = 'CONCENTRATION';
const RISK_DECLINING = 'DECLINING_TREND';
const RISK_LATE_STREAK = 'LATE_STREAK';
const RISK_NO_HISTORY = 'NO_HISTORY';
const RISK_QUALITY = 'QUALITY_RED';
const RISK_PAYMENT = 'PAYMENT_TERMS_WEAK';

const RISK_LABELS_HE = Object.freeze({
  [RISK_SINGLE_SOURCE]: 'תלות ספק יחיד (single-source)',
  [RISK_CONCENTRATION]: 'ריכוז הוצאה גבוה',
  [RISK_DECLINING]: 'מגמת ירידה בציון',
  [RISK_LATE_STREAK]: 'רצף איחורים באספקה',
  [RISK_NO_HISTORY]: 'אין היסטוריית רכש',
  [RISK_QUALITY]: 'איכות תחת הסף המותר',
  [RISK_PAYMENT]: 'תנאי תשלום לא תחרותיים',
});

// Thresholds
const SINGLE_SOURCE_THRESHOLD = 0.60;     // >60% of a category
const CONCENTRATION_THRESHOLD = 0.30;      // >30% of total spend
const LATE_STREAK_THRESHOLD = 3;           // 3 consecutive late POs
const DECLINE_WINDOW = 5;                  // last N scores for trend
const DECLINE_DELTA = 5;                   // >=5pt drop = declining
const URGENT_WINDOW_HOURS = 24;
const STANDARD_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Quality red-line
const REJECT_RED_PCT = 0.05;              // >5% rejects is red

// Communication (hours to first response)
const COMM_GOLD_HOURS = 4;
const COMM_SILVER_HOURS = 12;
const COMM_BRONZE_HOURS = 24;
const COMM_LATE_HOURS = 72;

// Payment terms (days) — longer is better for buyer
const PAY_GOLD_DAYS = 90;
const PAY_SILVER_DAYS = 60;
const PAY_BRONZE_DAYS = 30;

// Cooperative uplift (we do not penalise cooperatives by 1-3%)
const COOP_TOLERANCE_PCT = 0.03;

// =====================================================================
//  Math / numeric helpers
// =====================================================================

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function safeNum(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function median(arr) {
  const xs = arr
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x))
    .sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2 === 0) return (xs[mid - 1] + xs[mid]) / 2;
  return xs[mid];
}

function sum(arr) {
  let s = 0;
  for (const x of arr) s += Number(x) || 0;
  return s;
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// =====================================================================
//  History normaliser
// =====================================================================

/**
 * Accepts either a plain array of PO objects OR a structured
 * history object and returns a normalised shape.
 *
 * Normalised PO:
 *   { id, category, urgent, orderedAt, promisedAt, deliveredAt,
 *     amount, unitPrice, qty, rejected, rma, commHours, paymentDays,
 *     isCooperative, marketMedian }
 */
function normaliseHistory(history) {
  let pos = [];
  let communications = [];
  let payments = [];

  if (Array.isArray(history)) {
    pos = history;
  } else if (history && typeof history === 'object') {
    if (Array.isArray(history.purchaseOrders)) pos = history.purchaseOrders;
    else if (Array.isArray(history.pos)) pos = history.pos;
    else if (Array.isArray(history.orders)) pos = history.orders;
    if (Array.isArray(history.communications)) communications = history.communications;
    if (Array.isArray(history.payments)) payments = history.payments;
  }

  const nPos = pos.map((p, i) => {
    const ordered = toDate(p.orderedAt || p.ordered_at || p.orderedDate || p.date);
    const promised = toDate(p.promisedAt || p.promised_at || p.promisedDate || p.dueDate);
    const delivered = toDate(p.deliveredAt || p.delivered_at || p.deliveredDate || p.receivedAt);
    const urgent = !!(p.urgent || p.isUrgent || p.priority === 'urgent');
    const category = String(p.category || p.productCategory || 'general').trim() || 'general';
    const amount = safeNum(p.amount || p.total || p.totalAmount);
    const unitPrice = safeNum(p.unitPrice || p.price);
    const qty = safeNum(p.qty || p.quantity, 1);
    const rejected = safeNum(p.rejected || p.rejectedQty || 0);
    const rma = !!(p.rma || p.hasRma);
    const commHours = p.commHours != null ? safeNum(p.commHours) :
      (p.responseHours != null ? safeNum(p.responseHours) : null);
    const paymentDays = p.paymentDays != null ? safeNum(p.paymentDays) :
      (p.netDays != null ? safeNum(p.netDays) : null);
    const isCooperative = !!(p.isCooperative || p.cooperative ||
      /קיבוץ|רמת[\s-]?גולן|kibbutz|ramat[\s-]?golan/i.test(String(p.vendorName || p.notes || '')));
    const marketMedian = p.marketMedian != null ? safeNum(p.marketMedian) : null;

    return {
      id: p.id || p.poNumber || `po-${i}`,
      category,
      urgent,
      orderedAt: ordered,
      promisedAt: promised,
      deliveredAt: delivered,
      amount,
      unitPrice,
      qty,
      rejected,
      rma,
      commHours,
      paymentDays,
      isCooperative,
      marketMedian,
      raw: p,
    };
  });

  return { pos: nPos, communications, payments };
}

// =====================================================================
//  Dimension scorers (each returns 0..100)
// =====================================================================

/**
 * On-time delivery rate — honours urgent (24h) vs standard (7d)
 * windows. Score = % of POs delivered within their window.
 */
function scoreOnTimeDelivery(pos) {
  const dated = pos.filter((p) => p.deliveredAt && p.promisedAt);
  if (dated.length === 0) {
    return { score: 0, onTimeRate: 0, samples: 0, onTime: 0, late: 0, detail: 'אין נתוני אספקה' };
  }
  let onTime = 0;
  let late = 0;
  const streaks = [];
  let currentStreak = 0;
  for (const p of dated) {
    const window = p.urgent
      ? URGENT_WINDOW_HOURS * HOUR_MS
      : STANDARD_WINDOW_DAYS * DAY_MS;
    const slack = p.deliveredAt.getTime() - p.promisedAt.getTime();
    const isOnTime = slack <= 0 || slack <= 0; // delivered on/before promised
    // true definition: delivered by promisedAt + window? No — "on-time"
    // means delivered by promisedAt; window is the tolerance for
    // counting catastrophic lateness later. We count strict on-time.
    if (p.deliveredAt.getTime() <= p.promisedAt.getTime()) {
      onTime++;
      streaks.push(currentStreak);
      currentStreak = 0;
    } else {
      // grace: within window => still "on-time-ish" (half credit)
      if (p.deliveredAt.getTime() - p.promisedAt.getTime() <= window) {
        onTime += 0.5;
        late += 0.5;
      } else {
        late++;
      }
      currentStreak++;
    }
    // suppress no-op isOnTime lint
    if (isOnTime) { /* keep */ }
  }
  streaks.push(currentStreak);
  const rate = onTime / dated.length;
  const score = clamp(rate * 100, 0, 100);
  const maxStreak = streaks.reduce((a, b) => (a > b ? a : b), 0);
  return {
    score: round1(score),
    onTimeRate: round2(rate),
    samples: dated.length,
    onTime,
    late,
    maxLateStreak: maxStreak,
    detail: `${onTime}/${dated.length} בזמן`,
  };
}

/**
 * Price competitiveness vs market median.
 *   delta = (vendorPrice - marketMedian) / marketMedian
 *   delta <= -0.10 ......... 100 (10% cheaper or better)
 *   delta in [-0.10, 0] .... linear 100..80
 *   delta in [0, +0.05] .... linear 80..60  (within 5% above median)
 *   delta in [+0.05,+0.20] . linear 60..20
 *   delta > +0.20 .......... 10
 * Cooperative uplift: deltas in [-COOP_TOLERANCE..+COOP_TOLERANCE]
 * are treated as exactly zero (kibbutz/Ramat Golan coop discounts
 * are acknowledged).
 */
function scorePriceCompetitiveness(pos) {
  const withMedian = pos.filter((p) => p.marketMedian > 0 && p.unitPrice > 0);
  if (withMedian.length === 0) {
    // fall back to internal median across pos
    const prices = pos.map((p) => p.unitPrice).filter((x) => x > 0);
    if (prices.length < 2) {
      return {
        score: 50, // neutral — no evidence either way
        delta: 0,
        samples: 0,
        detail: 'אין חציון שוק — ציון נייטרלי',
      };
    }
    const m = median(prices);
    let totalDelta = 0;
    let n = 0;
    for (const p of pos) {
      if (p.unitPrice > 0 && m > 0) {
        totalDelta += (p.unitPrice - m) / m;
        n++;
      }
    }
    const avgDelta = n > 0 ? totalDelta / n : 0;
    return {
      score: round1(priceDeltaToScore(avgDelta, false)),
      delta: round2(avgDelta),
      samples: n,
      detail: 'חציון פנימי (ללא בנצ׳מרק חיצוני)',
    };
  }
  let totalDelta = 0;
  let hasCoop = false;
  for (const p of withMedian) {
    let d = (p.unitPrice - p.marketMedian) / p.marketMedian;
    if (p.isCooperative) hasCoop = true;
    if (p.isCooperative && Math.abs(d) <= COOP_TOLERANCE_PCT) d = 0;
    totalDelta += d;
  }
  const avg = totalDelta / withMedian.length;
  return {
    score: round1(priceDeltaToScore(avg, hasCoop)),
    delta: round2(avg),
    samples: withMedian.length,
    detail: hasCoop ? 'כולל זיכוי שיתופי (קיבוץ/רמת גולן)' : 'בנצ׳מרק מול חציון שוק',
  };
}

function priceDeltaToScore(delta, isCoop) {
  const d = Number(delta) || 0;
  let s;
  if (d <= -0.10) s = 100;
  else if (d <= 0) s = 80 + ((-d) / 0.10) * 20; // -10%..0 -> 80..100
  else if (d <= 0.05) s = 80 - (d / 0.05) * 20; // 0..+5% -> 80..60
  else if (d <= 0.20) s = 60 - ((d - 0.05) / 0.15) * 40; // +5%..+20% -> 60..20
  else s = 10;
  if (isCoop) s = Math.min(100, s + 2);
  return clamp(s, 0, 100);
}

/**
 * Quality score based on reject rate and RMA count.
 */
function scoreQuality(pos) {
  const totalQty = sum(pos.map((p) => p.qty));
  const totalRejected = sum(pos.map((p) => p.rejected));
  const rmaCount = pos.filter((p) => p.rma).length;
  const rejectRate = totalQty > 0 ? totalRejected / totalQty : 0;
  const rmaRate = pos.length > 0 ? rmaCount / pos.length : 0;

  // reject rate -> base score
  let base;
  if (rejectRate <= 0.001) base = 100;
  else if (rejectRate <= 0.01) base = 100 - (rejectRate / 0.01) * 10;   // 0-1% -> 100-90
  else if (rejectRate <= 0.03) base = 90 - ((rejectRate - 0.01) / 0.02) * 20; // 1-3% -> 90-70
  else if (rejectRate <= 0.05) base = 70 - ((rejectRate - 0.03) / 0.02) * 20; // 3-5% -> 70-50
  else if (rejectRate <= 0.10) base = 50 - ((rejectRate - 0.05) / 0.05) * 30; // 5-10% -> 50-20
  else base = 10;

  // RMA penalty (up to -20)
  const rmaPenalty = clamp(rmaRate * 100, 0, 20);
  const score = clamp(base - rmaPenalty, 0, 100);

  return {
    score: round1(score),
    rejectRate: round2(rejectRate),
    rmaCount,
    rmaRate: round2(rmaRate),
    samples: pos.length,
    detail: totalQty === 0
      ? 'אין נתוני כמות'
      : `${totalRejected}/${totalQty} פגומים, ${rmaCount} RMA`,
  };
}

/**
 * Communication responsiveness — uses commHours on POs OR
 * an explicit communications[] array of {requestAt, responseAt}.
 */
function scoreCommunication(pos, communications) {
  const hoursFromPos = pos
    .map((p) => p.commHours)
    .filter((h) => h != null && Number.isFinite(h) && h >= 0);

  const hoursFromComm = (communications || [])
    .map((c) => {
      const req = toDate(c.requestAt || c.request_at || c.askedAt);
      const res = toDate(c.responseAt || c.response_at || c.repliedAt);
      if (!req || !res) return null;
      return (res.getTime() - req.getTime()) / HOUR_MS;
    })
    .filter((h) => h != null && Number.isFinite(h) && h >= 0);

  const all = hoursFromPos.concat(hoursFromComm);
  if (all.length === 0) {
    return { score: 50, avgHours: null, samples: 0, detail: 'אין נתוני תקשורת — ציון נייטרלי' };
  }
  const avg = sum(all) / all.length;
  let score;
  if (avg <= COMM_GOLD_HOURS) score = 100;
  else if (avg <= COMM_SILVER_HOURS) score = 100 - ((avg - COMM_GOLD_HOURS) / (COMM_SILVER_HOURS - COMM_GOLD_HOURS)) * 15; // 100-85
  else if (avg <= COMM_BRONZE_HOURS) score = 85 - ((avg - COMM_SILVER_HOURS) / (COMM_BRONZE_HOURS - COMM_SILVER_HOURS)) * 20; // 85-65
  else if (avg <= COMM_LATE_HOURS) score = 65 - ((avg - COMM_BRONZE_HOURS) / (COMM_LATE_HOURS - COMM_BRONZE_HOURS)) * 40; // 65-25
  else score = 15;

  return {
    score: round1(clamp(score, 0, 100)),
    avgHours: round1(avg),
    samples: all.length,
    detail: `ממוצע ${round1(avg)} שעות תגובה`,
  };
}

/**
 * Payment terms score — longer net is better for the buyer.
 */
function scorePaymentTerms(pos, payments) {
  const termsFromPos = pos
    .map((p) => p.paymentDays)
    .filter((d) => d != null && Number.isFinite(d) && d > 0);
  const termsFromPayments = (payments || [])
    .map((p) => safeNum(p.netDays || p.paymentDays))
    .filter((d) => Number.isFinite(d) && d > 0);

  const all = termsFromPos.concat(termsFromPayments);
  if (all.length === 0) {
    return { score: 50, avgDays: null, samples: 0, detail: 'אין נתוני תשלום — ציון נייטרלי' };
  }
  const avg = sum(all) / all.length;
  let score;
  if (avg >= PAY_GOLD_DAYS) score = 100;
  else if (avg >= PAY_SILVER_DAYS) score = 80 + ((avg - PAY_SILVER_DAYS) / (PAY_GOLD_DAYS - PAY_SILVER_DAYS)) * 20; // 80-100
  else if (avg >= PAY_BRONZE_DAYS) score = 60 + ((avg - PAY_BRONZE_DAYS) / (PAY_SILVER_DAYS - PAY_BRONZE_DAYS)) * 20; // 60-80
  else if (avg >= 7) score = 30 + ((avg - 7) / (PAY_BRONZE_DAYS - 7)) * 30; // 30-60
  else score = 15;

  return {
    score: round1(clamp(score, 0, 100)),
    avgDays: round1(avg),
    samples: all.length,
    detail: `שוטף +${round1(avg)} ימים`,
  };
}

// =====================================================================
//  Composite + badge
// =====================================================================

function badgeFor(composite) {
  if (composite > 85) return BADGE_PREFERRED;
  if (composite >= 70) return BADGE_APPROVED;
  if (composite >= 50) return BADGE_MONITOR;
  return BADGE_REMOVE;
}

function compositeScore(dims) {
  return (
    dims.onTimeDelivery.score * WEIGHTS.onTimeDelivery +
    dims.priceCompetitiveness.score * WEIGHTS.priceCompetitiveness +
    dims.quality.score * WEIGHTS.quality +
    dims.communication.score * WEIGHTS.communication +
    dims.paymentTerms.score * WEIGHTS.paymentTerms
  );
}

// =====================================================================
//  Risk detection
// =====================================================================

function detectRisks(dims, pos, extra) {
  const risks = [];
  extra = extra || {};

  if (pos.length === 0) {
    risks.push({ code: RISK_NO_HISTORY, he: RISK_LABELS_HE[RISK_NO_HISTORY], severity: 'low' });
    return risks;
  }

  // Late streak
  if ((dims.onTimeDelivery.maxLateStreak || 0) >= LATE_STREAK_THRESHOLD) {
    risks.push({
      code: RISK_LATE_STREAK,
      he: RISK_LABELS_HE[RISK_LATE_STREAK],
      severity: 'high',
      detail: `רצף של ${dims.onTimeDelivery.maxLateStreak} איחורים`,
    });
  }

  // Quality red-line
  if ((dims.quality.rejectRate || 0) > REJECT_RED_PCT) {
    risks.push({
      code: RISK_QUALITY,
      he: RISK_LABELS_HE[RISK_QUALITY],
      severity: 'high',
      detail: `${round2((dims.quality.rejectRate || 0) * 100)}% פגומים`,
    });
  }

  // Concentration risk (provided by caller via extra.shareOfSpend)
  if (extra.shareOfSpend != null && extra.shareOfSpend > CONCENTRATION_THRESHOLD) {
    risks.push({
      code: RISK_CONCENTRATION,
      he: RISK_LABELS_HE[RISK_CONCENTRATION],
      severity: 'medium',
      detail: `${Math.round(extra.shareOfSpend * 100)}% מסך הרכש`,
    });
  }

  // Single source (caller sets extra.singleSourceCategories[])
  if (Array.isArray(extra.singleSourceCategories) && extra.singleSourceCategories.length > 0) {
    risks.push({
      code: RISK_SINGLE_SOURCE,
      he: RISK_LABELS_HE[RISK_SINGLE_SOURCE],
      severity: 'high',
      detail: `${extra.singleSourceCategories.join(', ')}`,
    });
  }

  // Declining trend (caller supplies extra.recentScores[])
  if (Array.isArray(extra.recentScores) && extra.recentScores.length >= 3) {
    const window = extra.recentScores.slice(-DECLINE_WINDOW);
    const first = window[0];
    const last = window[window.length - 1];
    if (first - last >= DECLINE_DELTA) {
      risks.push({
        code: RISK_DECLINING,
        he: RISK_LABELS_HE[RISK_DECLINING],
        severity: 'medium',
        detail: `ירידה של ${round1(first - last)} נקודות`,
      });
    }
  }

  // Payment terms too weak (<15 days)
  if (dims.paymentTerms.avgDays != null && dims.paymentTerms.avgDays < 15) {
    risks.push({
      code: RISK_PAYMENT,
      he: RISK_LABELS_HE[RISK_PAYMENT],
      severity: 'low',
      detail: `${round1(dims.paymentTerms.avgDays)} ימים`,
    });
  }

  return risks;
}

// =====================================================================
//  Recommendations (auto-generated, Hebrew)
// =====================================================================

function buildRecommendations(composite, dims, risks) {
  const recs = [];

  if (composite > 85) {
    recs.push('להגדיל הקצאת תקציב לספק ולשקול הסכם מסגרת שנתי');
  } else if (composite >= 70) {
    recs.push('להמשיך עבודה שוטפת תוך מעקב רבעוני');
  } else if (composite >= 50) {
    recs.push('לפתוח תהליך איתור ספק חלופי במקביל, להימנע מהזמנות גדולות');
  } else {
    recs.push('להוציא מרשימת הספקים הפעילים תוך 30 יום ולחלק הזמנות פתוחות לספקים אחרים');
  }

  if (dims.onTimeDelivery.score < 70) {
    recs.push('להכניס סעיף קנס בגין איחורים להסכם + מעקב יומי על POs פתוחים');
  }
  if (dims.priceCompetitiveness.score < 60) {
    recs.push('לבקש הצעת מחיר מחודשת מול מחיר שוק/LME עדכני');
  }
  if (dims.quality.score < 70) {
    recs.push('להפעיל בדיקת QA נכנסת 100% עד להתייצבות שיעור הפסולים');
  }
  if (dims.communication.score < 60) {
    recs.push('להגדיר נקודת קשר ייעודית ו-SLA של 4 שעות למייל ראשון');
  }
  if (dims.paymentTerms.score < 60) {
    recs.push('לנסות לקדם את תנאי התשלום לשוטף +60 לפחות');
  }

  for (const r of risks) {
    if (r.code === RISK_SINGLE_SOURCE) {
      recs.push('לאתר ספק שני באותה קטגוריה כדי להפחית תלות (second-source)');
    }
    if (r.code === RISK_CONCENTRATION) {
      recs.push('לפזר הוצאה מעבר לספק יחיד — יעד: אף ספק לא מעל 30% מהרכש');
    }
    if (r.code === RISK_DECLINING) {
      recs.push('לזמן פגישת שימור ספק ולתעד תוכנית שיפור עם אבני דרך');
    }
    if (r.code === RISK_LATE_STREAK) {
      recs.push('להקפיא הזמנות חדשות עד לסגירת הפיגורים הקיימים');
    }
  }

  // dedupe while preserving order
  const seen = new Set();
  const out = [];
  for (const r of recs) {
    if (!seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

// =====================================================================
//  Public API — scoreVendor
// =====================================================================

/**
 * Score a single vendor.
 *
 * @param {string} vendorId
 * @param {Array|Object} history — array of POs OR structured history
 *   object: { purchaseOrders, communications, payments, recentScores,
 *   shareOfSpend, singleSourceCategories }
 * @returns {Object}
 */
function scoreVendor(vendorId, history) {
  const { pos, communications, payments } = normaliseHistory(history);
  const extra = (history && typeof history === 'object' && !Array.isArray(history))
    ? {
        shareOfSpend: history.shareOfSpend,
        singleSourceCategories: history.singleSourceCategories,
        recentScores: history.recentScores,
      }
    : {};

  const dims = {
    onTimeDelivery: scoreOnTimeDelivery(pos),
    priceCompetitiveness: scorePriceCompetitiveness(pos),
    quality: scoreQuality(pos),
    communication: scoreCommunication(pos, communications),
    paymentTerms: scorePaymentTerms(pos, payments),
  };

  const composite = round1(clamp(compositeScore(dims), 0, 100));
  const badge = badgeFor(composite);
  const risks = detectRisks(dims, pos, extra);
  const recommendations = buildRecommendations(composite, dims, risks);

  return {
    vendorId: String(vendorId || ''),
    composite,
    badge,
    badgeEn: BADGE_EN[badge] || '',
    dimensions: dims,
    weights: WEIGHTS,
    risks,
    recommendations,
    samples: pos.length,
    asOf: new Date().toISOString(),
  };
}

// =====================================================================
//  Public API — compareVendors
// =====================================================================

/**
 * Compare vendors.
 *
 * @param {Array} records — each { vendorId, history } or a precomputed
 *                           scoreVendor result.
 * @returns {Array} ranked table: [{ rank, vendorId, composite, badge, ... }]
 */
function compareVendors(records) {
  if (!Array.isArray(records)) return [];
  const scored = records.map((r) => {
    if (r && r.composite != null && r.dimensions) return r;
    return scoreVendor(r.vendorId, r.history);
  });
  scored.sort((a, b) => b.composite - a.composite);
  return scored.map((s, i) => ({
    rank: i + 1,
    vendorId: s.vendorId,
    composite: s.composite,
    badge: s.badge,
    onTime: s.dimensions.onTimeDelivery.score,
    price: s.dimensions.priceCompetitiveness.score,
    quality: s.dimensions.quality.score,
    communication: s.dimensions.communication.score,
    paymentTerms: s.dimensions.paymentTerms.score,
    risks: s.risks.map((r) => r.code),
    recommendationsCount: s.recommendations.length,
  }));
}

// =====================================================================
//  Public API — detectSingleSource
// =====================================================================

/**
 * Detect single-source dependency inside a catalog of POs.
 *
 * @param {Array|Object} catalog — array of POs (each has category,
 *   vendorId, amount) OR object { purchaseOrders: [...] }
 * @param {string} [category]    — if given, filter to this category
 * @returns {Array} warnings: [{ category, vendorId, share, severity }]
 */
function detectSingleSource(catalog, category) {
  let list = [];
  if (Array.isArray(catalog)) list = catalog;
  else if (catalog && Array.isArray(catalog.purchaseOrders)) list = catalog.purchaseOrders;
  else if (catalog && Array.isArray(catalog.pos)) list = catalog.pos;

  const byCat = new Map();
  for (const p of list) {
    const cat = String(p.category || p.productCategory || 'general').trim() || 'general';
    if (category && cat !== category) continue;
    const vid = String(p.vendorId || p.vendor || 'unknown');
    const amt = safeNum(p.amount || p.total || p.totalAmount || 0);
    if (!byCat.has(cat)) byCat.set(cat, { total: 0, byVendor: new Map() });
    const entry = byCat.get(cat);
    entry.total += amt;
    entry.byVendor.set(vid, (entry.byVendor.get(vid) || 0) + amt);
  }

  const warnings = [];
  for (const [cat, entry] of byCat) {
    if (entry.total <= 0) continue;
    for (const [vid, amt] of entry.byVendor) {
      const share = amt / entry.total;
      if (share > SINGLE_SOURCE_THRESHOLD) {
        warnings.push({
          category: cat,
          vendorId: vid,
          share: round2(share),
          sharePct: Math.round(share * 100),
          totalAmount: round2(entry.total),
          severity: share > 0.80 ? 'critical' : (share > 0.70 ? 'high' : 'medium'),
          he: `${vid} מהווה ${Math.round(share * 100)}% מהרכש בקטגוריה ${cat}`,
        });
      }
    }
  }
  warnings.sort((a, b) => b.share - a.share);
  return warnings;
}

// =====================================================================
//  Public API — vendorScorecard (Hebrew formatted report)
// =====================================================================

function pad(str, n) {
  str = String(str);
  while (str.length < n) str += ' ';
  return str;
}
function padLeft(str, n) {
  str = String(str);
  while (str.length < n) str = ' ' + str;
  return str;
}

/**
 * Return a human-readable, bilingual (HE-first) scorecard string.
 */
function vendorScorecard(vendorId, history) {
  const s = scoreVendor(vendorId, history);
  const line = '─'.repeat(60);
  const dline = '═'.repeat(60);

  const dimLine = (labelHe, labelEn, dim, weight) => {
    const bar = renderBar(dim.score);
    return `${pad(labelHe, 20)} ${pad(labelEn, 16)} ${padLeft(round1(dim.score).toString(), 5)}  ${bar}  [${Math.round(weight * 100)}%]`;
  };

  const out = [];
  out.push(dline);
  out.push(`כרטיס ביצוע ספק · Vendor Scorecard`);
  out.push(`ספק: ${s.vendorId}`);
  out.push(`תאריך: ${s.asOf.slice(0, 10)}`);
  out.push(dline);
  out.push('');
  out.push(`ציון משוקלל / Composite: ${s.composite} / 100`);
  out.push(`תג / Badge:              ${s.badge}  (${s.badgeEn})`);
  out.push(`מדגם / Samples:          ${s.samples} POs`);
  out.push('');
  out.push(line);
  out.push('מימדים / Dimensions');
  out.push(line);
  out.push(dimLine('אספקה בזמן', 'On-time', s.dimensions.onTimeDelivery, WEIGHTS.onTimeDelivery));
  out.push(dimLine('תחרותיות מחיר', 'Price', s.dimensions.priceCompetitiveness, WEIGHTS.priceCompetitiveness));
  out.push(dimLine('איכות', 'Quality', s.dimensions.quality, WEIGHTS.quality));
  out.push(dimLine('תקשורת', 'Communication', s.dimensions.communication, WEIGHTS.communication));
  out.push(dimLine('תנאי תשלום', 'Payment', s.dimensions.paymentTerms, WEIGHTS.paymentTerms));
  out.push('');

  if (s.risks.length > 0) {
    out.push(line);
    out.push('סיכונים / Risks');
    out.push(line);
    for (const r of s.risks) {
      const sev = r.severity === 'high' ? '!!!'
        : r.severity === 'medium' ? '!!' : '!';
      out.push(`  ${sev} ${r.he}${r.detail ? ' — ' + r.detail : ''}`);
    }
    out.push('');
  }

  if (s.recommendations.length > 0) {
    out.push(line);
    out.push('המלצות / Recommendations');
    out.push(line);
    s.recommendations.forEach((rec, i) => {
      out.push(`  ${i + 1}. ${rec}`);
    });
    out.push('');
  }

  out.push(dline);
  out.push(`נוסחה: On-time 40% | Price 20% | Quality 20% | Comm 10% | Pay 10%`);
  out.push(dline);

  return out.join('\n');
}

function renderBar(score) {
  const n = Math.round(clamp(score, 0, 100) / 5);   // 0..20 cells
  return '█'.repeat(n) + '·'.repeat(20 - n);
}

// =====================================================================
//  Israeli steel price index benchmarking
// =====================================================================

/**
 * Compare a vendor's unit prices against a monthly steel price index
 * (LME-aligned). The index is `{ 'YYYY-MM': pricePerKgILS }`.
 *
 * Returns a breakdown by month with delta and an overall average delta.
 */
function benchmarkSteelPrices(pos, monthlyIndex) {
  if (!pos || pos.length === 0 || !monthlyIndex) {
    return { months: [], avgDelta: 0, samples: 0 };
  }
  const months = [];
  let totalDelta = 0;
  let n = 0;
  for (const p of pos) {
    if (!(p.unitPrice > 0) || !p.orderedAt) continue;
    const key = p.orderedAt.toISOString().slice(0, 7);
    const idx = safeNum(monthlyIndex[key]);
    if (idx <= 0) continue;
    const delta = (p.unitPrice - idx) / idx;
    months.push({
      month: key,
      vendorPrice: p.unitPrice,
      indexPrice: idx,
      delta: round2(delta),
      deltaPct: Math.round(delta * 100),
    });
    totalDelta += delta;
    n++;
  }
  return {
    months,
    avgDelta: n > 0 ? round2(totalDelta / n) : 0,
    samples: n,
  };
}

// =====================================================================
//  Exports
// =====================================================================

module.exports = {
  // main API
  scoreVendor,
  compareVendors,
  detectSingleSource,
  vendorScorecard,

  // extras
  benchmarkSteelPrices,

  // exposed for tests / reuse
  scoreOnTimeDelivery,
  scorePriceCompetitiveness,
  scoreQuality,
  scoreCommunication,
  scorePaymentTerms,
  badgeFor,
  compositeScore,
  detectRisks,
  buildRecommendations,
  normaliseHistory,
  priceDeltaToScore,

  // constants
  WEIGHTS,
  BADGE_PREFERRED,
  BADGE_APPROVED,
  BADGE_MONITOR,
  BADGE_REMOVE,
  BADGE_EN,
  RISK_SINGLE_SOURCE,
  RISK_CONCENTRATION,
  RISK_DECLINING,
  RISK_LATE_STREAK,
  RISK_NO_HISTORY,
  RISK_QUALITY,
  RISK_PAYMENT,
  SINGLE_SOURCE_THRESHOLD,
  CONCENTRATION_THRESHOLD,
  LATE_STREAK_THRESHOLD,
  URGENT_WINDOW_HOURS,
  STANDARD_WINDOW_DAYS,
};
