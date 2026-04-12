/**
 * CRM Sales Pipeline  |  צנרת מכירות CRM
 * =============================================================
 *
 * Agent X-35  |  Swarm 3B  |  Techno-Kol Uzi mega-ERP
 *
 * A zero-dependency, in-memory CRM sales pipeline. Deals, stages,
 * activities, contacts, forecasting, velocity metrics, win/loss
 * analysis, stale-deal detection and auto-stage-progression rules.
 *
 * No external libraries — only Node built-ins. Deterministic ids.
 * Hebrew+English bilingual labels on every stage, activity and signal.
 *
 * -------------------------------------------------------------
 * DOMAIN MODEL
 * -------------------------------------------------------------
 *
 *   Deal {
 *     id, title, client_id, prospect_name, contact_id, owner,
 *     value, currency, probability, stage, expected_close_date,
 *     source, tags[], notes, created_at, updated_at,
 *     stage_entered_at, stage_history[], activity_ids[],
 *     closed_at?, won?, lost_reason?, actual_value?
 *   }
 *
 *   Contact {
 *     id, name, role, phone, email, client_id
 *   }
 *
 *   Activity {
 *     id, deal_id, type, datetime, duration_minutes, outcome,
 *     subject, body, completed, created_at, created_by,
 *     reminder_at?, stale_after?
 *   }
 *
 *   Stage (default ladder):
 *     Lead       → הצעה / Lead          0.10
 *     Qualified  → איכותני / Qualified  0.25
 *     Proposal   → הצעת מחיר / Proposal 0.45
 *     Negotiation→ משא ומתן / Negotiation 0.70
 *     Won        → זכייה / Won           1.00
 *     Lost       → הפסד / Lost           0.00
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   createDeal(fields)                    → id
 *   updateDeal(dealId, patch)             → Deal
 *   updateStage(dealId, newStage, comment?) → void
 *   logActivity(dealId, activity)         → id
 *   addContact(contact)                   → id
 *   listByOwner(ownerId)                  → Deal[]
 *   pipelineView(stageFilters?)           → { stages[], totals }
 *   forecast(period)                      → { committed, best_case, pipeline, weighted }
 *   velocityReport(period)                → { stages[], overall_days }
 *   winLossAnalysis(period)               → { by_source, by_reason, win_rate }
 *   forecastAccuracy(lookback)            → { mape, bias, samples }
 *   staleDeals(thresholdDays?)            → Deal[]
 *   dueFollowUps(now?)                    → Activity[]
 *   renderEmail(templateKey, ctx)         → { subject, body }
 *   autoProgressRules(rules?)             → list of transitions applied
 *
 * RULE: never delete. Stage transitions are append-only (`stage_history`),
 * activities are append-only, deals can be `closed` but never removed.
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Bilingual label dictionary
// ─────────────────────────────────────────────────────────────

const STAGE_KEYS = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];

const STAGE_LABELS = {
  Lead:        { he: 'הצעה',      en: 'Lead',        probability: 0.10, order: 0 },
  Qualified:   { he: 'איכותני',   en: 'Qualified',   probability: 0.25, order: 1 },
  Proposal:    { he: 'הצעת מחיר', en: 'Proposal',    probability: 0.45, order: 2 },
  Negotiation: { he: 'משא ומתן',  en: 'Negotiation', probability: 0.70, order: 3 },
  Won:         { he: 'זכייה',     en: 'Won',         probability: 1.00, order: 4 },
  Lost:        { he: 'הפסד',      en: 'Lost',        probability: 0.00, order: 5 },
};

const ACTIVITY_TYPES = {
  call:    { he: 'שיחה',    en: 'Call' },
  email:   { he: 'אימייל',  en: 'Email' },
  meeting: { he: 'פגישה',   en: 'Meeting' },
  task:    { he: 'משימה',   en: 'Task' },
  note:    { he: 'הערה',    en: 'Note' },
};

const LABELS = {
  notFound:        { he: 'לא נמצא',          en: 'not found' },
  invalidStage:    { he: 'שלב לא חוקי',      en: 'invalid stage' },
  invalidActivity: { he: 'פעילות לא חוקית',  en: 'invalid activity type' },
  dealClosed:      { he: 'עסקה סגורה',       en: 'deal is closed' },
  staleWarn:       { he: 'עסקה תקועה',       en: 'stale deal' },
  autoProgress:    { he: 'התקדמות אוטומטית', en: 'auto-progressed' },
};

// ─────────────────────────────────────────────────────────────
// Deterministic ID generator
// ─────────────────────────────────────────────────────────────

function makeIdGen(prefix) {
  let n = 0;
  return function next() {
    n += 1;
    return prefix + '_' + n.toString(36).padStart(6, '0');
  };
}

// ─────────────────────────────────────────────────────────────
// Utilities (zero-dep, non-mutating)
// ─────────────────────────────────────────────────────────────

function parseDate(v) {
  if (v == null) return NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : NaN;
}

function isoDay(ts) {
  if (!Number.isFinite(ts)) return null;
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + dy;
}

function daysBetween(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const DAY = 86400000;
  return Math.abs(a - b) / DAY;
}

function addDays(ts, days) {
  return ts + days * 86400000;
}

function toNum(v) {
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function shallowClone(obj) {
  if (obj == null) return obj;
  const out = {};
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    const v = obj[k];
    if (Array.isArray(v)) out[k] = v.slice();
    else out[k] = v;
  }
  return out;
}

function periodStart(period, nowTs) {
  const now = Number.isFinite(nowTs) ? nowTs : Date.now();
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (period) {
    case 'day':     return Date.UTC(y, m, d.getUTCDate());
    case 'week':    return now - 7 * 86400000;
    case 'month':   return Date.UTC(y, m, 1);
    case 'quarter': return Date.UTC(y, Math.floor(m / 3) * 3, 1);
    case 'year':    return Date.UTC(y, 0, 1);
    case 'all':     return 0;
    default:        return Date.UTC(y, m, 1);
  }
}

function periodEnd(period, nowTs) {
  const now = Number.isFinite(nowTs) ? nowTs : Date.now();
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (period) {
    case 'day':     return Date.UTC(y, m, d.getUTCDate() + 1) - 1;
    case 'week':    return now;
    case 'month':   return Date.UTC(y, m + 1, 1) - 1;
    case 'quarter': return Date.UTC(y, Math.floor(m / 3) * 3 + 3, 1) - 1;
    case 'year':    return Date.UTC(y + 1, 0, 1) - 1;
    case 'all':     return Number.MAX_SAFE_INTEGER;
    default:        return Date.UTC(y, m + 1, 1) - 1;
  }
}

// ─────────────────────────────────────────────────────────────
// In-memory repository
// ─────────────────────────────────────────────────────────────

function createPipeline(initial) {
  const state = {
    deals: new Map(),
    contacts: new Map(),
    activities: new Map(),
    dealIdGen: makeIdGen('DEAL'),
    contactIdGen: makeIdGen('CONTACT'),
    activityIdGen: makeIdGen('ACT'),
    now: function () { return Date.now(); },
  };

  if (initial && typeof initial.now === 'function') {
    state.now = initial.now;
  }

  // ─────────────────────────────────────────────────────────
  // Contact operations
  // ─────────────────────────────────────────────────────────
  function addContact(fields) {
    if (!fields || typeof fields !== 'object') {
      throw new Error('addContact: fields object is required');
    }
    if (!fields.name || typeof fields.name !== 'string') {
      throw new Error('addContact: name is required');
    }
    const id = state.contactIdGen();
    const contact = {
      id: id,
      name: fields.name,
      role: fields.role || '',
      phone: fields.phone || '',
      email: fields.email || '',
      client_id: fields.client_id || null,
      created_at: state.now(),
    };
    state.contacts.set(id, contact);
    return id;
  }

  function getContact(id) {
    const c = state.contacts.get(id);
    return c ? shallowClone(c) : null;
  }

  // ─────────────────────────────────────────────────────────
  // Deal operations
  // ─────────────────────────────────────────────────────────
  function createDeal(fields) {
    if (!fields || typeof fields !== 'object') {
      throw new Error('createDeal: fields object is required');
    }
    if (!fields.title || typeof fields.title !== 'string') {
      throw new Error('createDeal: title is required');
    }
    const value = toNum(fields.value);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('createDeal: value must be a non-negative number');
    }
    const stage = fields.stage || 'Lead';
    if (!STAGE_LABELS[stage]) {
      throw new Error('createDeal: ' + LABELS.invalidStage.en + ': ' + stage);
    }
    const probability = fields.probability != null
      ? clamp01(toNum(fields.probability))
      : STAGE_LABELS[stage].probability;

    const now = state.now();
    const id = state.dealIdGen();
    const deal = {
      id: id,
      title: fields.title,
      client_id: fields.client_id || null,
      prospect_name: fields.prospect_name || '',
      contact_id: fields.contact_id || null,
      owner: fields.owner || '',
      value: value,
      currency: fields.currency || 'ILS',
      probability: probability,
      stage: stage,
      expected_close_date: fields.expected_close_date
        ? parseDate(fields.expected_close_date)
        : null,
      source: fields.source || 'unknown',
      tags: Array.isArray(fields.tags) ? fields.tags.slice() : [],
      notes: fields.notes || '',
      created_at: now,
      updated_at: now,
      stage_entered_at: now,
      stage_history: [{
        stage: stage,
        entered_at: now,
        comment: 'created',
      }],
      activity_ids: [],
      closed_at: null,
      won: null,
      lost_reason: null,
      actual_value: null,
    };
    state.deals.set(id, deal);
    return id;
  }

  function getDeal(dealId) {
    const d = state.deals.get(dealId);
    return d ? shallowClone(d) : null;
  }

  function updateDeal(dealId, patch) {
    const deal = state.deals.get(dealId);
    if (!deal) throw new Error('updateDeal: ' + LABELS.notFound.en + ': ' + dealId);
    if (!patch || typeof patch !== 'object') {
      throw new Error('updateDeal: patch object is required');
    }
    const allowed = ['title', 'contact_id', 'owner', 'value', 'probability',
                     'expected_close_date', 'source', 'tags', 'notes', 'currency',
                     'prospect_name', 'client_id'];
    for (let i = 0; i < allowed.length; i += 1) {
      const k = allowed[i];
      if (patch[k] === undefined) continue;
      if (k === 'value') {
        const v = toNum(patch.value);
        if (!Number.isFinite(v) || v < 0) {
          throw new Error('updateDeal: invalid value');
        }
        deal.value = v;
      } else if (k === 'probability') {
        deal.probability = clamp01(toNum(patch.probability));
      } else if (k === 'expected_close_date') {
        deal.expected_close_date = patch.expected_close_date
          ? parseDate(patch.expected_close_date)
          : null;
      } else if (k === 'tags') {
        deal.tags = Array.isArray(patch.tags) ? patch.tags.slice() : [];
      } else {
        deal[k] = patch[k];
      }
    }
    deal.updated_at = state.now();
    return shallowClone(deal);
  }

  function updateStage(dealId, newStage, comment) {
    const deal = state.deals.get(dealId);
    if (!deal) throw new Error('updateStage: ' + LABELS.notFound.en + ': ' + dealId);
    if (!STAGE_LABELS[newStage]) {
      throw new Error('updateStage: ' + LABELS.invalidStage.en + ': ' + newStage);
    }
    if (deal.closed_at != null) {
      throw new Error('updateStage: ' + LABELS.dealClosed.en);
    }
    if (deal.stage === newStage) return;
    const now = state.now();
    deal.stage = newStage;
    deal.stage_entered_at = now;
    deal.updated_at = now;
    deal.probability = STAGE_LABELS[newStage].probability;
    deal.stage_history.push({
      stage: newStage,
      entered_at: now,
      comment: comment || '',
    });
    if (newStage === 'Won') {
      deal.closed_at = now;
      deal.won = true;
      deal.actual_value = deal.value;
    } else if (newStage === 'Lost') {
      deal.closed_at = now;
      deal.won = false;
      deal.lost_reason = comment || '';
      deal.actual_value = 0;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Activity operations
  // ─────────────────────────────────────────────────────────
  function logActivity(dealId, activity) {
    const deal = state.deals.get(dealId);
    if (!deal) throw new Error('logActivity: ' + LABELS.notFound.en + ': ' + dealId);
    if (!activity || typeof activity !== 'object') {
      throw new Error('logActivity: activity object is required');
    }
    const type = activity.type;
    if (!ACTIVITY_TYPES[type]) {
      throw new Error('logActivity: ' + LABELS.invalidActivity.en + ': ' + type);
    }
    const now = state.now();
    const id = state.activityIdGen();
    const record = {
      id: id,
      deal_id: dealId,
      type: type,
      datetime: activity.datetime != null ? parseDate(activity.datetime) : now,
      duration_minutes: Number.isFinite(Number(activity.duration_minutes))
        ? Number(activity.duration_minutes) : 0,
      outcome: activity.outcome || '',
      subject: activity.subject || '',
      body: activity.body || '',
      completed: !!activity.completed,
      created_at: now,
      created_by: activity.created_by || deal.owner || '',
      reminder_at: activity.reminder_at != null ? parseDate(activity.reminder_at) : null,
    };
    state.activities.set(id, record);
    deal.activity_ids.push(id);
    deal.updated_at = now;
    return id;
  }

  function getActivity(id) {
    const a = state.activities.get(id);
    return a ? shallowClone(a) : null;
  }

  function listActivities(dealId) {
    const deal = state.deals.get(dealId);
    if (!deal) return [];
    const out = [];
    for (let i = 0; i < deal.activity_ids.length; i += 1) {
      const a = state.activities.get(deal.activity_ids[i]);
      if (a) out.push(shallowClone(a));
    }
    out.sort(function (x, y) { return x.datetime - y.datetime; });
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // Query / list operations
  // ─────────────────────────────────────────────────────────
  function listDeals() {
    const out = [];
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      out.push(shallowClone(step.value));
      step = vals.next();
    }
    return out;
  }

  function listByOwner(ownerId) {
    const out = [];
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      const d = step.value;
      if (d.owner === ownerId) out.push(shallowClone(d));
      step = vals.next();
    }
    out.sort(function (a, b) { return b.updated_at - a.updated_at; });
    return out;
  }

  function pipelineView(stageFilters) {
    const filters = Array.isArray(stageFilters) && stageFilters.length
      ? stageFilters : STAGE_KEYS.slice();
    const groups = {};
    for (let i = 0; i < filters.length; i += 1) {
      const k = filters[i];
      if (!STAGE_LABELS[k]) continue;
      groups[k] = {
        stage: k,
        label_he: STAGE_LABELS[k].he,
        label_en: STAGE_LABELS[k].en,
        order: STAGE_LABELS[k].order,
        deals: [],
        total_value: 0,
        weighted_value: 0,
        count: 0,
      };
    }
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      const d = step.value;
      if (groups[d.stage]) {
        const copy = shallowClone(d);
        copy.age_days = (state.now() - d.created_at) / 86400000;
        copy.stage_age_days = (state.now() - d.stage_entered_at) / 86400000;
        groups[d.stage].deals.push(copy);
        groups[d.stage].total_value += d.value;
        groups[d.stage].weighted_value += d.value * d.probability;
        groups[d.stage].count += 1;
      }
      step = vals.next();
    }
    const stages = Object.keys(groups)
      .map(function (k) { return groups[k]; })
      .sort(function (a, b) { return a.order - b.order; });
    // sort deals within each stage by updated_at desc for stable rendering
    for (let i = 0; i < stages.length; i += 1) {
      stages[i].deals.sort(function (a, b) { return b.updated_at - a.updated_at; });
    }
    let total = 0, weighted = 0, count = 0;
    for (let i = 0; i < stages.length; i += 1) {
      total += stages[i].total_value;
      weighted += stages[i].weighted_value;
      count += stages[i].count;
    }
    return {
      stages: stages,
      totals: {
        total_value: total,
        weighted_value: weighted,
        count: count,
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // Forecast
  // ─────────────────────────────────────────────────────────
  function forecast(period) {
    const p = period || 'month';
    const ps = periodStart(p, state.now());
    const pe = periodEnd(p, state.now());
    let committed = 0;   // deals in Won state closed in period
    let bestCase  = 0;   // committed + Negotiation stage value
    let pipeline  = 0;   // sum of value of all open deals expected to close in period
    let weighted  = 0;   // pipeline × probability
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      const d = step.value;
      const ecd = d.expected_close_date;
      const inPeriod = Number.isFinite(ecd) && ecd >= ps && ecd <= pe;
      if (d.stage === 'Won' && d.closed_at != null && d.closed_at >= ps && d.closed_at <= pe) {
        committed += Number.isFinite(d.actual_value) ? d.actual_value : d.value;
      } else if (d.stage !== 'Lost' && d.closed_at == null) {
        if (inPeriod) {
          pipeline += d.value;
          weighted += d.value * d.probability;
          if (d.stage === 'Negotiation' || d.stage === 'Proposal') {
            bestCase += d.value;
          }
        }
      }
      step = vals.next();
    }
    bestCase += committed;
    return {
      period: p,
      period_start: ps,
      period_end: pe,
      committed: Math.round(committed * 100) / 100,
      best_case: Math.round(bestCase * 100) / 100,
      pipeline: Math.round(pipeline * 100) / 100,
      weighted: Math.round(weighted * 100) / 100,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Velocity report
  // ─────────────────────────────────────────────────────────
  function velocityReport(period) {
    const p = period || 'quarter';
    const ps = periodStart(p, state.now());
    const pe = periodEnd(p, state.now());
    // For each closed deal in period, walk stage_history and accumulate durations
    const stats = {};
    for (let i = 0; i < STAGE_KEYS.length; i += 1) {
      stats[STAGE_KEYS[i]] = { total_days: 0, samples: 0 };
    }
    let totalDays = 0, closedCount = 0;
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      const d = step.value;
      if (d.closed_at == null) { step = vals.next(); continue; }
      if (d.closed_at < ps || d.closed_at > pe) { step = vals.next(); continue; }
      closedCount += 1;
      totalDays += (d.closed_at - d.created_at) / 86400000;
      const hist = d.stage_history;
      for (let j = 0; j < hist.length; j += 1) {
        const cur = hist[j];
        const next = hist[j + 1];
        const end = next ? next.entered_at : d.closed_at;
        const days = (end - cur.entered_at) / 86400000;
        if (days >= 0 && stats[cur.stage]) {
          stats[cur.stage].total_days += days;
          stats[cur.stage].samples += 1;
        }
      }
      step = vals.next();
    }
    const stages = [];
    for (let i = 0; i < STAGE_KEYS.length; i += 1) {
      const k = STAGE_KEYS[i];
      const s = stats[k];
      stages.push({
        stage: k,
        label_he: STAGE_LABELS[k].he,
        label_en: STAGE_LABELS[k].en,
        avg_days: s.samples > 0 ? Math.round((s.total_days / s.samples) * 100) / 100 : 0,
        samples: s.samples,
      });
    }
    return {
      period: p,
      period_start: ps,
      period_end: pe,
      overall_days: closedCount > 0 ? Math.round((totalDays / closedCount) * 100) / 100 : 0,
      closed_deals: closedCount,
      stages: stages,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Win/Loss analysis
  // ─────────────────────────────────────────────────────────
  function winLossAnalysis(period) {
    const p = period || 'quarter';
    const ps = periodStart(p, state.now());
    const pe = periodEnd(p, state.now());
    const bySource = {};
    const byReason = {};
    let wins = 0, losses = 0, wonValue = 0, lostValue = 0;
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      const d = step.value;
      if (d.closed_at == null || d.closed_at < ps || d.closed_at > pe) {
        step = vals.next();
        continue;
      }
      const src = d.source || 'unknown';
      if (!bySource[src]) {
        bySource[src] = { source: src, won: 0, lost: 0, won_value: 0, lost_value: 0, win_rate: 0 };
      }
      if (d.won === true) {
        wins += 1;
        wonValue += d.actual_value != null ? d.actual_value : d.value;
        bySource[src].won += 1;
        bySource[src].won_value += d.actual_value != null ? d.actual_value : d.value;
      } else if (d.won === false) {
        losses += 1;
        lostValue += d.value;
        bySource[src].lost += 1;
        bySource[src].lost_value += d.value;
        const reason = d.lost_reason || 'unspecified';
        if (!byReason[reason]) {
          byReason[reason] = { reason: reason, count: 0, lost_value: 0 };
        }
        byReason[reason].count += 1;
        byReason[reason].lost_value += d.value;
      }
      step = vals.next();
    }
    const srcList = Object.keys(bySource).map(function (k) {
      const r = bySource[k];
      const total = r.won + r.lost;
      r.win_rate = total > 0 ? Math.round((r.won / total) * 1000) / 1000 : 0;
      return r;
    }).sort(function (a, b) { return b.won_value - a.won_value; });
    const reasonList = Object.keys(byReason).map(function (k) {
      return byReason[k];
    }).sort(function (a, b) { return b.count - a.count; });
    const total = wins + losses;
    return {
      period: p,
      period_start: ps,
      period_end: pe,
      wins: wins,
      losses: losses,
      win_rate: total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0,
      won_value: Math.round(wonValue * 100) / 100,
      lost_value: Math.round(lostValue * 100) / 100,
      by_source: srcList,
      by_reason: reasonList,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Forecast accuracy — compare each closed deal's weighted forecast
  // (value × probability-at-creation) to the actual_value.
  // Produces MAPE (mean absolute percent error) and bias.
  // ─────────────────────────────────────────────────────────
  function forecastAccuracy(lookbackDays) {
    const days = Number.isFinite(lookbackDays) ? lookbackDays : 90;
    const cutoff = state.now() - days * 86400000;
    let sumAbsErr = 0, sumErr = 0, samples = 0, sumForecast = 0, sumActual = 0;
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      const d = step.value;
      if (d.closed_at == null || d.closed_at < cutoff) { step = vals.next(); continue; }
      const firstEntry = d.stage_history[0];
      const firstProb = firstEntry && STAGE_LABELS[firstEntry.stage]
        ? STAGE_LABELS[firstEntry.stage].probability
        : 0.1;
      const forecastVal = d.value * firstProb;
      const actual = d.actual_value != null ? d.actual_value : 0;
      const err = actual - forecastVal;
      sumForecast += forecastVal;
      sumActual += actual;
      sumErr += err;
      sumAbsErr += Math.abs(err);
      samples += 1;
      step = vals.next();
    }
    const denom = sumForecast || 1;
    return {
      lookback_days: days,
      samples: samples,
      forecast_total: Math.round(sumForecast * 100) / 100,
      actual_total: Math.round(sumActual * 100) / 100,
      mape: samples > 0 ? Math.round((sumAbsErr / denom) * 1000) / 1000 : 0,
      bias: samples > 0 ? Math.round((sumErr / denom) * 1000) / 1000 : 0,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Stale deals — open deals whose stage_age > threshold
  // ─────────────────────────────────────────────────────────
  function staleDeals(thresholdDays) {
    const threshold = Number.isFinite(thresholdDays) ? thresholdDays : 14;
    const now = state.now();
    const out = [];
    const vals = state.deals.values();
    let step = vals.next();
    while (!step.done) {
      const d = step.value;
      if (d.closed_at == null) {
        const ageDays = (now - d.stage_entered_at) / 86400000;
        if (ageDays >= threshold) {
          const copy = shallowClone(d);
          copy.stage_age_days = Math.round(ageDays * 100) / 100;
          copy.warning_he = LABELS.staleWarn.he + ' — ' + Math.round(ageDays) + ' ימים';
          copy.warning_en = LABELS.staleWarn.en + ' — ' + Math.round(ageDays) + ' days';
          out.push(copy);
        }
      }
      step = vals.next();
    }
    out.sort(function (a, b) { return b.stage_age_days - a.stage_age_days; });
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // Follow-ups due — activities with reminder_at <= now and not completed
  // ─────────────────────────────────────────────────────────
  function dueFollowUps(nowTs) {
    const now = Number.isFinite(nowTs) ? nowTs : state.now();
    const out = [];
    const vals = state.activities.values();
    let step = vals.next();
    while (!step.done) {
      const a = step.value;
      if (!a.completed && a.reminder_at != null && a.reminder_at <= now) {
        const deal = state.deals.get(a.deal_id);
        const copy = shallowClone(a);
        copy.deal_title = deal ? deal.title : '';
        copy.deal_owner = deal ? deal.owner : '';
        out.push(copy);
      }
      step = vals.next();
    }
    out.sort(function (a, b) { return a.reminder_at - b.reminder_at; });
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // Calendar export — activities in window (ICS-like flat array)
  // ─────────────────────────────────────────────────────────
  function calendarEvents(fromTs, toTs) {
    const from = Number.isFinite(fromTs) ? fromTs : 0;
    const to = Number.isFinite(toTs) ? toTs : Number.MAX_SAFE_INTEGER;
    const out = [];
    const vals = state.activities.values();
    let step = vals.next();
    while (!step.done) {
      const a = step.value;
      if (a.datetime >= from && a.datetime <= to
          && (a.type === 'call' || a.type === 'meeting' || a.type === 'task')) {
        const deal = state.deals.get(a.deal_id);
        out.push({
          id: a.id,
          title: a.subject || (ACTIVITY_TYPES[a.type].en + ' — ' + (deal ? deal.title : '')),
          start: a.datetime,
          end: a.datetime + (a.duration_minutes || 30) * 60000,
          type: a.type,
          deal_id: a.deal_id,
          owner: deal ? deal.owner : a.created_by,
          body: a.body,
        });
      }
      step = vals.next();
    }
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  // ─────────────────────────────────────────────────────────
  // Auto-stage-progression rules
  // Defaults:
  //  - if Lead has ≥ 1 completed meeting → Qualified
  //  - if Qualified has a proposal-type activity → Proposal
  //  - if Proposal has ≥ 2 negotiation activities → Negotiation
  // Users may pass custom rules (array of functions) returning newStage | null.
  // ─────────────────────────────────────────────────────────
  function autoProgressRules(rules) {
    const appliedList = [];
    const chain = Array.isArray(rules) && rules.length ? rules : defaultAutoRules();
    const ids = [];
    const dealVals = state.deals.values();
    let step = dealVals.next();
    while (!step.done) {
      ids.push(step.value.id);
      step = dealVals.next();
    }
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const deal = state.deals.get(id);
      if (!deal || deal.closed_at != null) continue;
      const acts = listActivities(id);
      for (let j = 0; j < chain.length; j += 1) {
        const decision = chain[j](deal, acts);
        if (decision && decision.newStage && decision.newStage !== deal.stage) {
          try {
            updateStage(id, decision.newStage, decision.comment || LABELS.autoProgress.en);
            appliedList.push({
              deal_id: id,
              from: deal.stage,
              to: decision.newStage,
              reason: decision.comment || LABELS.autoProgress.en,
            });
            break;
          } catch (e) {
            // ignore invalid transitions
          }
        }
      }
    }
    return appliedList;
  }

  function defaultAutoRules() {
    return [
      function leadToQualified(deal, acts) {
        if (deal.stage !== 'Lead') return null;
        let meetings = 0;
        for (let i = 0; i < acts.length; i += 1) {
          if (acts[i].type === 'meeting' && acts[i].completed) meetings += 1;
        }
        if (meetings >= 1) {
          return { newStage: 'Qualified', comment: 'auto: qualifying meeting held' };
        }
        return null;
      },
      function qualifiedToProposal(deal, acts) {
        if (deal.stage !== 'Qualified') return null;
        for (let i = 0; i < acts.length; i += 1) {
          const a = acts[i];
          if (a.type === 'email' && /proposal|הצעה|quote/i.test(a.subject + ' ' + a.body)) {
            return { newStage: 'Proposal', comment: 'auto: proposal sent' };
          }
        }
        return null;
      },
      function proposalToNegotiation(deal, acts) {
        if (deal.stage !== 'Proposal') return null;
        let neg = 0;
        for (let i = 0; i < acts.length; i += 1) {
          const a = acts[i];
          if ((a.type === 'call' || a.type === 'meeting') && /negotiat|מחיר|מו"מ/i.test(a.outcome + ' ' + a.subject)) {
            neg += 1;
          }
        }
        if (neg >= 2) {
          return { newStage: 'Negotiation', comment: 'auto: negotiation cycles ≥ 2' };
        }
        return null;
      },
    ];
  }

  // ─────────────────────────────────────────────────────────
  // Email templates (rendered, never sent by this module)
  // ─────────────────────────────────────────────────────────
  const EMAIL_TEMPLATES = {
    intro: {
      subject_he: 'הצגת {{company}} — הזדמנות לשיתוף פעולה',
      subject_en: 'Introducing {{company}} — partnership opportunity',
      body_he: 'שלום {{name}},\n\nבשם צוות {{company}} שמחים ליצור קשר לגבי {{deal_title}}.\n\nנשמח לקבוע שיחה קצרה.\n\nבברכה,\n{{owner}}',
      body_en: 'Hello {{name}},\n\nOn behalf of {{company}} we would like to discuss {{deal_title}}.\n\nWould you be available for a brief call?\n\nBest,\n{{owner}}',
    },
    followup: {
      subject_he: 'מעקב — {{deal_title}}',
      subject_en: 'Follow-up — {{deal_title}}',
      body_he: 'שלום {{name}},\n\nרציתי לוודא שקיבלת את ההצעה בסך {{value}} ₪ ולשמוע את דעתך.\n\nתודה,\n{{owner}}',
      body_en: 'Hi {{name}},\n\nI wanted to confirm you received the proposal for {{value}} and hear your feedback.\n\nThanks,\n{{owner}}',
    },
    proposal: {
      subject_he: 'הצעת מחיר — {{deal_title}}',
      subject_en: 'Proposal — {{deal_title}}',
      body_he: 'שלום {{name}},\n\nמצורפת הצעת המחיר עבור {{deal_title}} בסך {{value}} ₪.\n\nתוקף: 30 ימים.\n\n{{owner}}',
      body_en: 'Hello {{name}},\n\nAttached is the proposal for {{deal_title}} totaling {{value}}.\n\nValid for 30 days.\n\n{{owner}}',
    },
    won: {
      subject_he: 'תודה! — {{deal_title}}',
      subject_en: 'Thank you! — {{deal_title}}',
      body_he: 'שלום {{name}},\n\nתודה שבחרת בנו! נצור קשר ביום-יומיים הקרובים לתיאום.\n\n{{owner}}',
      body_en: 'Hi {{name}},\n\nThank you for choosing us! We will reach out within 1-2 business days to coordinate next steps.\n\n{{owner}}',
    },
    lost: {
      subject_he: 'תודה על הזמן — {{deal_title}}',
      subject_en: 'Thank you for your time — {{deal_title}}',
      body_he: 'שלום {{name}},\n\nתודה על שקילת ההצעה. נשמח להיות בקשר לעתיד.\n\n{{owner}}',
      body_en: 'Hi {{name}},\n\nThank you for reviewing our proposal. We remain available for future opportunities.\n\n{{owner}}',
    },
  };

  function renderEmail(templateKey, ctx) {
    const tpl = EMAIL_TEMPLATES[templateKey];
    if (!tpl) throw new Error('renderEmail: template not found: ' + templateKey);
    const c = ctx || {};
    const lang = c.lang === 'en' ? 'en' : 'he';
    const subj = lang === 'en' ? tpl.subject_en : tpl.subject_he;
    const body = lang === 'en' ? tpl.body_en : tpl.body_he;
    function fill(s) {
      return s.replace(/\{\{(\w+)\}\}/g, function (_m, k) {
        return c[k] != null ? String(c[k]) : '';
      });
    }
    return {
      subject: fill(subj),
      body: fill(body),
      lang: lang,
      template: templateKey,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Snapshot export
  // ─────────────────────────────────────────────────────────
  function snapshot() {
    return {
      deals: listDeals(),
      contacts: Array.from(state.contacts.values()).map(shallowClone),
      activities: Array.from(state.activities.values()).map(shallowClone),
      stages: STAGE_KEYS.map(function (k) {
        return {
          key: k,
          label_he: STAGE_LABELS[k].he,
          label_en: STAGE_LABELS[k].en,
          probability: STAGE_LABELS[k].probability,
          order: STAGE_LABELS[k].order,
        };
      }),
    };
  }

  return {
    // deals
    createDeal: createDeal,
    updateDeal: updateDeal,
    updateStage: updateStage,
    getDeal: getDeal,
    listDeals: listDeals,
    listByOwner: listByOwner,
    // contacts
    addContact: addContact,
    getContact: getContact,
    // activities
    logActivity: logActivity,
    getActivity: getActivity,
    listActivities: listActivities,
    // views / analytics
    pipelineView: pipelineView,
    forecast: forecast,
    velocityReport: velocityReport,
    winLossAnalysis: winLossAnalysis,
    forecastAccuracy: forecastAccuracy,
    staleDeals: staleDeals,
    dueFollowUps: dueFollowUps,
    calendarEvents: calendarEvents,
    autoProgressRules: autoProgressRules,
    renderEmail: renderEmail,
    snapshot: snapshot,
    // constants
    STAGE_KEYS: STAGE_KEYS.slice(),
    STAGE_LABELS: STAGE_LABELS,
    ACTIVITY_TYPES: ACTIVITY_TYPES,
    LABELS: LABELS,
    // utilities exposed for testing
    _internals: {
      parseDate: parseDate,
      isoDay: isoDay,
      daysBetween: daysBetween,
      addDays: addDays,
      clamp01: clamp01,
      periodStart: periodStart,
      periodEnd: periodEnd,
    },
  };
}

module.exports = {
  createPipeline: createPipeline,
  STAGE_KEYS: STAGE_KEYS,
  STAGE_LABELS: STAGE_LABELS,
  ACTIVITY_TYPES: ACTIVITY_TYPES,
};
