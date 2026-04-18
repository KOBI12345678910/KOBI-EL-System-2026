/**
 * Customer Health Score Engine  |  מנוע ניקוד בריאות לקוח
 * =============================================================
 *
 * Agent Y-099  |  Techno-Kol Uzi mega-ERP
 *
 * A zero-dependency, in-memory customer health score engine. Tracks product
 * usage, payment behavior, support load, NPS/CSAT, engagement, commercial
 * signals, and relationship quality. Produces a composite health score
 * (0..100), trends it over time, triggers alerts on decline, explains the
 * top drivers bilingually, fires intervention playbooks, back-tests against
 * churned customers, segments health, renders SVG dials, and runs
 * what-if simulations.
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים — nothing here deletes history;
 *       scores accumulate as an append-only time-series per customer.
 *
 * No external libraries — only Node built-ins (not even that: pure JS).
 * Everything is deterministic. All I/O is in-process. Bilingual HE+EN.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Factor {
 *     name:        string,            // stable factor key
 *     label_he:    string,            // Hebrew label
 *     label_en:    string,            // English label
 *     weight:      number,            // 0..1, sum of all weights = 1.0
 *     dataSource:  string,            // logical source name, e.g. 'usage'
 *     scoreFn:     (data) => number,  // 0..100, pure function
 *     decay:       number,            // 0..1, daily decay if data is stale
 *   }
 *
 *   Model {
 *     factors:     Factor[],
 *     thresholds:  { healthy, watch, risk, critical },
 *   }
 *
 *   ScoreRecord {
 *     customerId:  string,
 *     total:       number,            // 0..100 weighted composite
 *     breakdown:   { [factor]: { raw, weighted, weight, label_he, label_en } },
 *     status:      'healthy'|'watch'|'risk'|'critical',
 *     trend:       number,            // points vs previous score (can be <0)
 *     timestamp:   number,            // ms epoch
 *   }
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   defineModel({factors, thresholds})
 *   ingestData(customerId, source, payload)
 *   computeScore(customerId)               → ScoreRecord
 *   trendAnalysis(customerId, period)      → {points[], slope, delta, min, max}
 *   alertDecline({threshold})              → Alert[]
 *   explainScore(customerId)               → {top_drivers_he[], top_drivers_en[]}
 *   playbookTrigger(customerId)            → Playbook | null
 *   registerPlaybook(status, playbook)     → void
 *   correlateChurn(churnedCustomers)       → {precision, recall, f1, ...}
 *   segmentHealth(segment)                 → {avg, min, max, count, dist}
 *   visualizeHealth(customerId)            → string (SVG)
 *   whatIfSimulator({customerId, factor, newValue}) → {before, after, delta}
 *   assignSegment(customerId, segment)     → void
 *   listCustomers()                        → string[]
 *   status(total, thresholds?)             → 'healthy'|'watch'|'risk'|'critical'
 *
 * Rule reminder: Never delete — all history appended, all factors
 * additive, all past scores preserved.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CONSTANTS & DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_THRESHOLDS = Object.freeze({
  healthy: 80,
  watch: 60,
  risk: 40,
  critical: 0,
});

const STATUS_LABELS = Object.freeze({
  healthy: { he: 'בריא', en: 'Healthy' },
  watch: { he: 'מעקב', en: 'Watch' },
  risk: { he: 'סיכון', en: 'Risk' },
  critical: { he: 'קריטי', en: 'Critical' },
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. PURE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function clamp(x, lo, hi) {
  if (typeof x !== 'number' || Number.isNaN(x)) return lo;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

function daysBetween(a, b) {
  return Math.abs((b - a) / 86400000);
}

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function statusFromTotal(total, thresholds) {
  const t = thresholds || DEFAULT_THRESHOLDS;
  if (total >= t.healthy) return 'healthy';
  if (total >= t.watch) return 'watch';
  if (total >= t.risk) return 'risk';
  return 'critical';
}

// Linear regression slope (least squares) — used for trend slope.
function slope(points) {
  const n = points.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i];
    sumXY += i * points[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. DEFAULT FACTORS — 7 pillars of customer health
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Each factor gets a scoreFn that normalizes raw data into 0..100.
 * Default weights sum to 1.0 after normalizeFactors().
 */
const DEFAULT_FACTORS = Object.freeze([
  {
    name: 'product_usage',
    label_he: 'שימוש במוצר',
    label_en: 'Product Usage',
    weight: 0.22,
    dataSource: 'usage',
    decay: 0.02,
    scoreFn: (d) => {
      if (!d) return 50;
      // login frequency 0..30 per month → 0..40
      const login = clamp((d.logins_per_month || 0) / 30, 0, 1) * 40;
      // feature adoption 0..1 → 0..35
      const adopt = clamp(d.feature_adoption || 0, 0, 1) * 35;
      // active users ratio 0..1 → 0..25
      const active = clamp(d.active_users_ratio || 0, 0, 1) * 25;
      return clamp(login + adopt + active, 0, 100);
    },
  },
  {
    name: 'payment_health',
    label_he: 'בריאות תשלומים',
    label_en: 'Payment Health',
    weight: 0.18,
    dataSource: 'payments',
    decay: 0.01,
    scoreFn: (d) => {
      if (!d) return 50;
      // on-time rate 0..1 → 0..70
      const onTime = clamp(d.on_time_rate != null ? d.on_time_rate : 1, 0, 1) * 70;
      // credit issues count (penalty)
      const issues = clamp(d.credit_issues || 0, 0, 10);
      const penalty = issues * 7;
      // days past due (penalty)
      const dpd = clamp(d.days_past_due || 0, 0, 90);
      const dpdPenalty = (dpd / 90) * 30;
      return clamp(onTime + 30 - penalty - dpdPenalty, 0, 100);
    },
  },
  {
    name: 'support_tickets',
    label_he: 'קריאות שירות',
    label_en: 'Support Tickets',
    weight: 0.14,
    dataSource: 'support',
    decay: 0.03,
    scoreFn: (d) => {
      if (!d) return 80;
      // volume 0..20+ tickets/month (more = worse)
      const vol = clamp(d.volume || 0, 0, 20);
      const volScore = 50 - (vol / 20) * 50;
      // severity 1..5 (higher = worse)
      const sev = clamp(d.avg_severity || 1, 1, 5);
      const sevScore = 30 - ((sev - 1) / 4) * 30;
      // oldest open ticket age in days (older = worse)
      const age = clamp(d.oldest_open_days || 0, 0, 60);
      const ageScore = 20 - (age / 60) * 20;
      return clamp(volScore + sevScore + ageScore, 0, 100);
    },
  },
  {
    name: 'nps_csat',
    label_he: 'NPS/שביעות רצון',
    label_en: 'NPS / CSAT',
    weight: 0.14,
    dataSource: 'survey',
    decay: 0.015,
    scoreFn: (d) => {
      if (!d) return 50;
      // NPS is -100..+100 → 0..60
      const nps = clamp(d.nps != null ? d.nps : 0, -100, 100);
      const npsScore = ((nps + 100) / 200) * 60;
      // CSAT 0..5 → 0..40
      const csat = clamp(d.csat != null ? d.csat : 3, 0, 5);
      const csatScore = (csat / 5) * 40;
      return clamp(npsScore + csatScore, 0, 100);
    },
  },
  {
    name: 'engagement',
    label_he: 'מעורבות',
    label_en: 'Engagement',
    weight: 0.12,
    dataSource: 'engagement',
    decay: 0.025,
    scoreFn: (d) => {
      if (!d) return 50;
      // meetings per quarter 0..12 → 0..40
      const meet = clamp((d.meetings_per_quarter || 0) / 12, 0, 1) * 40;
      // response rate 0..1 → 0..30
      const resp = clamp(d.response_rate != null ? d.response_rate : 0.5, 0, 1) * 30;
      // exec engagement 0..1 → 0..30
      const exec = clamp(d.exec_engagement != null ? d.exec_engagement : 0, 0, 1) * 30;
      return clamp(meet + resp + exec, 0, 100);
    },
  },
  {
    name: 'commercial_signals',
    label_he: 'סיגנלים מסחריים',
    label_en: 'Commercial Signals',
    weight: 0.12,
    dataSource: 'commercial',
    decay: 0.01,
    scoreFn: (d) => {
      if (!d) return 50;
      // expansion intent 0..1 → 0..40
      const exp = clamp(d.expansion_signal != null ? d.expansion_signal : 0, 0, 1) * 40;
      // upsell opportunities 0..5 → 0..30
      const up = clamp(d.upsell_opportunities || 0, 0, 5) / 5 * 30;
      // contract length in months 0..60 → 0..30
      const contract = clamp(d.contract_length_months || 0, 0, 60) / 60 * 30;
      return clamp(exp + up + contract, 0, 100);
    },
  },
  {
    name: 'relationship',
    label_he: 'יחסים',
    label_en: 'Relationship',
    weight: 0.08,
    dataSource: 'csm',
    decay: 0.02,
    scoreFn: (d) => {
      if (!d) return 60;
      // CSM rapport 0..10 → 0..50
      const rap = clamp(d.csm_rapport != null ? d.csm_rapport : 5, 0, 10) / 10 * 50;
      // champion present → 0..25
      const champ = d.champion_present ? 25 : 0;
      // last qbr days ago (fresher = better)
      const qbr = clamp(d.days_since_last_qbr != null ? d.days_since_last_qbr : 90, 0, 180);
      const qbrScore = 25 - (qbr / 180) * 25;
      return clamp(rap + champ + qbrScore, 0, 100);
    },
  },
]);

// ═══════════════════════════════════════════════════════════════════════════
// 3. HEALTHSCORE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class HealthScore {
  constructor(opts = {}) {
    this.model = null;
    this.data = new Map();        // customerId -> { source -> { payload, timestamp } }
    this.history = new Map();     // customerId -> ScoreRecord[]
    this.segments = new Map();    // customerId -> segment name
    this.playbooks = new Map();   // status -> playbook definition
    this.alertLog = [];           // append-only alert ledger
    this.clock = opts.clock || (() => Date.now());
    this.defineModel({
      factors: DEFAULT_FACTORS.map((f) => ({ ...f })),
      thresholds: { ...DEFAULT_THRESHOLDS },
    });
    this._installDefaultPlaybooks();
  }

  // ─────────────────────────────────────────────────────────────
  // 3.1  Model definition
  // ─────────────────────────────────────────────────────────────

  defineModel(spec) {
    if (!spec || !Array.isArray(spec.factors) || spec.factors.length === 0) {
      throw new Error('defineModel: factors[] is required');
    }
    const factors = spec.factors.map((f, i) => {
      if (!f.name) throw new Error(`factor #${i} missing name`);
      if (typeof f.scoreFn !== 'function') {
        throw new Error(`factor '${f.name}' missing scoreFn`);
      }
      return {
        name: f.name,
        label_he: f.label_he || f.name,
        label_en: f.label_en || f.name,
        weight: typeof f.weight === 'number' ? f.weight : 1,
        dataSource: f.dataSource || f.name,
        scoreFn: f.scoreFn,
        decay: typeof f.decay === 'number' ? f.decay : 0,
      };
    });
    const totalW = factors.reduce((s, f) => s + f.weight, 0);
    if (totalW <= 0) throw new Error('defineModel: total weight must be > 0');
    // Normalize weights to 1.0 — never mutate caller's data.
    for (const f of factors) f.weight = f.weight / totalW;

    this.model = {
      factors,
      thresholds: {
        ...DEFAULT_THRESHOLDS,
        ...(spec.thresholds || {}),
      },
    };
    return this.model;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.2  Data ingestion — additive, never deletes
  // ─────────────────────────────────────────────────────────────

  ingestData(customerId, source, payload) {
    if (!customerId) throw new Error('ingestData: customerId required');
    if (!source) throw new Error('ingestData: source required');
    let bucket = this.data.get(customerId);
    if (!bucket) {
      bucket = {};
      this.data.set(customerId, bucket);
    }
    bucket[source] = {
      payload: payload || {},
      timestamp: this.clock(),
    };
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.3  computeScore — weighted composite with decay
  // ─────────────────────────────────────────────────────────────

  computeScore(customerId) {
    if (!this.model) throw new Error('computeScore: model not defined');
    const now = this.clock();
    const bucket = this.data.get(customerId) || {};
    const breakdown = {};
    let total = 0;

    for (const f of this.model.factors) {
      const entry = bucket[f.dataSource];
      const payload = entry ? entry.payload : null;
      let raw = clamp(f.scoreFn(payload), 0, 100);

      // Apply time-based decay — stale data quietly erodes score.
      if (entry && f.decay > 0) {
        const ageDays = daysBetween(entry.timestamp, now);
        // exp decay: raw * (1 - decay)^ageDays
        const decayFactor = Math.pow(1 - clamp(f.decay, 0, 1), ageDays);
        raw = raw * decayFactor;
      }

      const weighted = raw * f.weight;
      breakdown[f.name] = {
        raw: round2(raw),
        weighted: round2(weighted),
        weight: round2(f.weight),
        label_he: f.label_he,
        label_en: f.label_en,
        has_data: !!entry,
      };
      total += weighted;
    }

    total = round2(clamp(total, 0, 100));
    const status = statusFromTotal(total, this.model.thresholds);

    // Trend — delta vs last recorded score.
    const hist = this.history.get(customerId) || [];
    const prev = hist.length > 0 ? hist[hist.length - 1].total : total;
    const trend = round2(total - prev);

    const record = {
      customerId,
      total,
      breakdown,
      status,
      trend,
      timestamp: now,
    };

    hist.push(record);
    this.history.set(customerId, hist);

    // Alert hook — record a decline event if trend drops below 0.
    if (trend < 0 && Math.abs(trend) > 0.01) {
      this.alertLog.push({
        customerId,
        delta: trend,
        from: prev,
        to: total,
        status,
        timestamp: now,
      });
    }

    return record;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.4  trendAnalysis — slope + deltas over a time window
  // ─────────────────────────────────────────────────────────────

  trendAnalysis(customerId, period) {
    const hist = this.history.get(customerId) || [];
    if (hist.length === 0) {
      return { points: [], slope: 0, delta: 0, min: 0, max: 0, direction: 'flat' };
    }
    let filtered = hist;
    if (period && typeof period === 'object' && period.days) {
      const cutoff = this.clock() - period.days * 86400000;
      filtered = hist.filter((h) => h.timestamp >= cutoff);
    }
    if (filtered.length === 0) filtered = [hist[hist.length - 1]];

    const totals = filtered.map((h) => h.total);
    const first = totals[0];
    const last = totals[totals.length - 1];
    const s = slope(totals);

    let direction = 'flat';
    if (s > 0.5) direction = 'improving';
    else if (s < -0.5) direction = 'declining';

    return {
      points: filtered.map((h) => ({ t: h.timestamp, total: h.total, status: h.status })),
      slope: round2(s),
      delta: round2(last - first),
      min: Math.min(...totals),
      max: Math.max(...totals),
      avg: round2(mean(totals)),
      direction,
      direction_he:
        direction === 'improving' ? 'משתפר'
        : direction === 'declining' ? 'נדרדר'
        : 'יציב',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.5  alertDecline — customers whose score dropped > threshold
  // ─────────────────────────────────────────────────────────────

  alertDecline(opts = {}) {
    const threshold = typeof opts.threshold === 'number' ? opts.threshold : 10;
    const alerts = [];
    for (const [customerId, hist] of this.history.entries()) {
      if (hist.length < 2) continue;
      const last = hist[hist.length - 1];
      const prev = hist[hist.length - 2];
      const drop = prev.total - last.total;
      if (drop >= threshold) {
        alerts.push({
          customerId,
          drop: round2(drop),
          from: prev.total,
          to: last.total,
          status: last.status,
          severity:
            drop >= 30 ? 'critical'
            : drop >= 20 ? 'high'
            : drop >= 10 ? 'medium'
            : 'low',
          message_he: `ניקוד הלקוח ${customerId} ירד ב-${round2(drop)} נקודות (מ-${prev.total} ל-${last.total})`,
          message_en: `Customer ${customerId} health dropped ${round2(drop)} points (${prev.total} → ${last.total})`,
          timestamp: last.timestamp,
        });
      }
    }
    // Sort: highest drop first.
    alerts.sort((a, b) => b.drop - a.drop);
    return alerts;
  }

  // ─────────────────────────────────────────────────────────────
  // 3.6  explainScore — bilingual top drivers (positive + negative)
  // ─────────────────────────────────────────────────────────────

  explainScore(customerId) {
    const hist = this.history.get(customerId) || [];
    if (hist.length === 0) {
      return {
        customerId,
        total: 0,
        status: 'critical',
        top_drivers_he: ['אין נתונים'],
        top_drivers_en: ['No data available'],
        strengths: [],
        weaknesses: [],
      };
    }
    const last = hist[hist.length - 1];
    const entries = Object.entries(last.breakdown)
      .map(([name, b]) => ({ name, ...b }))
      .sort((a, b) => b.weighted - a.weighted);

    const strengths = entries
      .filter((e) => e.raw >= 75)
      .slice(0, 3);
    const weaknesses = entries
      .filter((e) => e.raw < 60)
      .sort((a, b) => a.raw - b.raw)
      .slice(0, 3);

    const top_drivers_he = [];
    const top_drivers_en = [];

    for (const s of strengths) {
      top_drivers_he.push(`חוזק: ${s.label_he} (${s.raw})`);
      top_drivers_en.push(`Strength: ${s.label_en} (${s.raw})`);
    }
    for (const w of weaknesses) {
      top_drivers_he.push(`חולשה: ${w.label_he} (${w.raw})`);
      top_drivers_en.push(`Weakness: ${w.label_en} (${w.raw})`);
    }

    if (top_drivers_he.length === 0) {
      top_drivers_he.push('אין גורמים בולטים — ניקוד מאוזן');
      top_drivers_en.push('No stand-out factors — balanced score');
    }

    return {
      customerId,
      total: last.total,
      status: last.status,
      status_he: STATUS_LABELS[last.status].he,
      status_en: STATUS_LABELS[last.status].en,
      top_drivers_he,
      top_drivers_en,
      strengths: strengths.map((s) => s.name),
      weaknesses: weaknesses.map((w) => w.name),
      timestamp: last.timestamp,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.7  Playbooks — intervention triggers
  // ─────────────────────────────────────────────────────────────

  registerPlaybook(status, playbook) {
    if (!STATUS_LABELS[status]) {
      throw new Error(`registerPlaybook: invalid status '${status}'`);
    }
    this.playbooks.set(status, playbook);
  }

  _installDefaultPlaybooks() {
    this.registerPlaybook('watch', {
      name: 'watch_playbook',
      title_he: 'ספר משחקים: מעקב',
      title_en: 'Playbook: Watch',
      steps: [
        { id: 'csm_ping', he: 'יצירת קשר CSM תוך 72 שעות', en: 'CSM ping within 72h' },
        { id: 'usage_review', he: 'סקירת דפוסי שימוש', en: 'Review usage patterns' },
      ],
    });
    this.registerPlaybook('risk', {
      name: 'risk_playbook',
      title_he: 'ספר משחקים: סיכון',
      title_en: 'Playbook: Risk',
      steps: [
        { id: 'exec_call', he: 'שיחת מנכ"ל תוך 48 שעות', en: 'Executive call within 48h' },
        { id: 'root_cause', he: 'ניתוח סיבת שורש', en: 'Root-cause analysis' },
        { id: 'save_plan', he: 'תוכנית שימור 30 יום', en: '30-day save plan' },
      ],
    });
    this.registerPlaybook('critical', {
      name: 'critical_playbook',
      title_he: 'ספר משחקים: קריטי',
      title_en: 'Playbook: Critical',
      steps: [
        { id: 'exec_escalation', he: 'הסלמה להנהלה בכירה תוך 24 שעות', en: 'Exec escalation within 24h' },
        { id: 'war_room', he: 'חדר מלחמה לשימור לקוח', en: 'War room for retention' },
        { id: 'credit', he: 'הצעת פיצוי / זיכוי', en: 'Offer credit / compensation' },
        { id: 'roadmap_commit', he: 'התחייבות למפת דרכים', en: 'Roadmap commitments' },
      ],
    });
  }

  playbookTrigger(customerId) {
    const hist = this.history.get(customerId) || [];
    if (hist.length === 0) return null;
    const last = hist[hist.length - 1];
    // Trigger on non-healthy status or significant decline.
    const decline = hist.length >= 2 ? hist[hist.length - 2].total - last.total : 0;
    const trigger = last.status !== 'healthy' || decline >= 10;
    if (!trigger) return null;

    const playbook = this.playbooks.get(last.status);
    if (!playbook) return null;

    return {
      customerId,
      triggered_at: last.timestamp,
      reason: decline >= 10 ? 'decline' : 'status',
      reason_he: decline >= 10 ? 'ירידה חדה' : 'סטטוס לא בריא',
      current_status: last.status,
      current_total: last.total,
      decline: round2(decline),
      playbook,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.8  correlateChurn — back-test score vs actual churn
  // ─────────────────────────────────────────────────────────────

  correlateChurn(churnedCustomers) {
    if (!Array.isArray(churnedCustomers)) {
      throw new Error('correlateChurn: expected array of customer ids');
    }
    const churnedSet = new Set(churnedCustomers);
    let tp = 0, fp = 0, fn = 0, tn = 0;
    const details = [];

    for (const [customerId, hist] of this.history.entries()) {
      if (hist.length === 0) continue;
      const last = hist[hist.length - 1];
      const atRisk = last.status === 'risk' || last.status === 'critical';
      const churned = churnedSet.has(customerId);
      if (atRisk && churned) tp++;
      else if (atRisk && !churned) fp++;
      else if (!atRisk && churned) fn++;
      else tn++;
      details.push({
        customerId,
        total: last.total,
        status: last.status,
        atRisk,
        churned,
        correct: (atRisk && churned) || (!atRisk && !churned),
      });
    }

    // Handle churned customers not in history.
    for (const cid of churnedCustomers) {
      if (!this.history.has(cid)) {
        fn++;
        details.push({
          customerId: cid,
          total: null,
          status: 'unknown',
          atRisk: false,
          churned: true,
          correct: false,
          note: 'no history',
        });
      }
    }

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    const accuracy = tp + tn + fp + fn > 0 ? (tp + tn) / (tp + tn + fp + fn) : 0;

    return {
      tp, fp, fn, tn,
      precision: round2(precision),
      recall: round2(recall),
      f1: round2(f1),
      accuracy: round2(accuracy),
      sample_size: details.length,
      details,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.9  segmentHealth — avg health per segment
  // ─────────────────────────────────────────────────────────────

  assignSegment(customerId, segment) {
    this.segments.set(customerId, segment);
  }

  segmentHealth(segment) {
    const scores = [];
    const dist = { healthy: 0, watch: 0, risk: 0, critical: 0 };
    const members = [];
    for (const [customerId, hist] of this.history.entries()) {
      if (hist.length === 0) continue;
      if (segment && this.segments.get(customerId) !== segment) continue;
      const last = hist[hist.length - 1];
      scores.push(last.total);
      dist[last.status]++;
      members.push({ customerId, total: last.total, status: last.status });
    }
    if (scores.length === 0) {
      return {
        segment: segment || 'all',
        count: 0,
        avg: 0, min: 0, max: 0,
        dist,
        members: [],
      };
    }
    return {
      segment: segment || 'all',
      count: scores.length,
      avg: round2(mean(scores)),
      min: Math.min(...scores),
      max: Math.max(...scores),
      dist,
      members: members.sort((a, b) => a.total - b.total),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.10  visualizeHealth — SVG dial + trend sparkline
  // ─────────────────────────────────────────────────────────────

  visualizeHealth(customerId) {
    const hist = this.history.get(customerId) || [];
    if (hist.length === 0) {
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">' +
        '<text x="160" y="90" text-anchor="middle" font-size="16" fill="#666">אין נתונים / No data</text>' +
        '</svg>'
      );
    }
    const last = hist[hist.length - 1];
    const total = last.total;
    const statusColors = {
      healthy: '#16a34a',
      watch: '#eab308',
      risk: '#f97316',
      critical: '#dc2626',
    };
    const color = statusColors[last.status];

    // Dial: semi-circle from -90deg to +90deg.
    const cx = 90, cy = 100, r = 70;
    const startAngle = -Math.PI;
    const endAngle = startAngle + (total / 100) * Math.PI;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = total > 50 ? 1 : 0;

    // Sparkline (right side): last up to 20 points.
    const spark = hist.slice(-20).map((h) => h.total);
    const spX0 = 180, spY0 = 50, spW = 120, spH = 100;
    let spMin = Math.min(...spark, 0);
    let spMax = Math.max(...spark, 100);
    if (spMax === spMin) spMax = spMin + 1;
    const spPts = spark.map((v, i) => {
      const x = spX0 + (spark.length > 1 ? (i / (spark.length - 1)) * spW : spW / 2);
      const y = spY0 + spH - ((v - spMin) / (spMax - spMin)) * spH;
      return `${round2(x)},${round2(y)}`;
    }).join(' ');

    const statusHe = STATUS_LABELS[last.status].he;
    const statusEn = STATUS_LABELS[last.status].en;

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" font-family="Arial,Helvetica,sans-serif">' +
      // Dial background arc (full half circle gray).
      `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="#e5e7eb" stroke-width="14"/>` +
      // Dial foreground arc (proportional).
      `<path d="M ${round2(x1)} ${round2(y1)} A ${r} ${r} 0 ${largeArc} 1 ${round2(x2)} ${round2(y2)}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>` +
      // Dial score.
      `<text x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="28" font-weight="bold" fill="${color}">${total}</text>` +
      // Status label.
      `<text x="${cx}" y="${cy + 40}" text-anchor="middle" font-size="12" fill="#374151">${statusEn} / ${statusHe}</text>` +
      // Sparkline frame.
      `<rect x="${spX0 - 4}" y="${spY0 - 4}" width="${spW + 8}" height="${spH + 8}" fill="none" stroke="#e5e7eb" stroke-width="1" rx="4"/>` +
      // Sparkline.
      `<polyline points="${spPts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
      // Sparkline label.
      `<text x="${spX0 + spW / 2}" y="${spY0 + spH + 22}" text-anchor="middle" font-size="10" fill="#6b7280">Trend / מגמה</text>` +
      // Customer id label.
      `<text x="160" y="16" text-anchor="middle" font-size="11" fill="#111827">${String(customerId).replace(/[<>&]/g, '')}</text>` +
      '</svg>'
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 3.11  whatIfSimulator — projection without mutating state
  // ─────────────────────────────────────────────────────────────

  whatIfSimulator(opts) {
    if (!opts || !opts.customerId || !opts.factor) {
      throw new Error('whatIfSimulator: customerId + factor required');
    }
    const { customerId, factor, newValue } = opts;
    const hist = this.history.get(customerId) || [];
    const before = hist.length > 0 ? hist[hist.length - 1] : null;

    // Clone current data bucket, substitute the one factor, compute in-memory.
    const bucket = this.data.get(customerId) || {};
    const simBucket = {};
    for (const k of Object.keys(bucket)) {
      simBucket[k] = { payload: { ...bucket[k].payload }, timestamp: bucket[k].timestamp };
    }

    const f = this.model.factors.find((x) => x.name === factor);
    if (!f) throw new Error(`whatIfSimulator: unknown factor '${factor}'`);

    simBucket[f.dataSource] = {
      payload: typeof newValue === 'object' && newValue !== null ? newValue : { value: newValue },
      timestamp: this.clock(),
    };

    // Compute a shadow score without touching history.
    let total = 0;
    const breakdown = {};
    for (const ff of this.model.factors) {
      const entry = simBucket[ff.dataSource];
      const payload = entry ? entry.payload : null;
      const raw = clamp(ff.scoreFn(payload), 0, 100);
      const weighted = raw * ff.weight;
      breakdown[ff.name] = { raw: round2(raw), weighted: round2(weighted) };
      total += weighted;
    }
    total = round2(clamp(total, 0, 100));
    const status = statusFromTotal(total, this.model.thresholds);

    const delta = before ? round2(total - before.total) : total;

    return {
      customerId,
      factor,
      newValue,
      before: before ? { total: before.total, status: before.status } : null,
      after: { total, status, breakdown },
      delta,
      status_change: before && before.status !== status,
      recommendation_he:
        delta > 5 ? 'כדאי לבצע שינוי זה' :
        delta < -5 ? 'לא מומלץ — ירידה צפויה' :
        'השפעה זניחה',
      recommendation_en:
        delta > 5 ? 'Recommended — meaningful improvement' :
        delta < -5 ? 'Not recommended — expected decline' :
        'Negligible impact',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3.12  Utilities
  // ─────────────────────────────────────────────────────────────

  status(total, thresholds) {
    return statusFromTotal(total, thresholds || (this.model && this.model.thresholds));
  }

  listCustomers() {
    const ids = new Set();
    for (const k of this.data.keys()) ids.add(k);
    for (const k of this.history.keys()) ids.add(k);
    for (const k of this.segments.keys()) ids.add(k);
    return Array.from(ids);
  }

  getHistory(customerId) {
    return (this.history.get(customerId) || []).slice();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  HealthScore,
  DEFAULT_FACTORS,
  DEFAULT_THRESHOLDS,
  STATUS_LABELS,
  // helpers exposed for tests
  statusFromTotal,
  clamp,
  slope,
  mean,
  round2,
};
