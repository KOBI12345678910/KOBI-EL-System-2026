/**
 * Sales Commission Engine  |  מנוע עמלות מכירות
 * =============================================================
 *
 * Agent Y-017  |  Swarm Sales  |  Techno-Kol Uzi mega-ERP 2026
 *
 * A zero-dependency, in-memory commission calculator for
 * Kobi Elkayam's Mega-ERP. Handles flat / tiered / accelerator
 * plans, splits between multiple salespeople, manager team
 * overrides, caps, floors, draws against commission, clawbacks
 * on unpaid invoices, pipeline forecasting and bilingual
 * Hebrew/English commission statements (plain text PDF).
 *
 * No external libraries. Deterministic. Never deletes —
 * assignments, calculations and clawbacks are append-only.
 *
 * -------------------------------------------------------------
 * RULE: "לא מוחקים רק משדרגים ומגדלים"
 *   - `definePlan` with an existing id bumps its `version` and
 *     keeps the old versions in `this._planHistory`.
 *   - `assignPlan` appends to `this._assignments`; an end date
 *     is stamped on the previous assignment, it is never deleted.
 *   - `applyClawback` writes negative-amount entries into the
 *     same `calculations` log instead of mutating prior rows.
 *
 * -------------------------------------------------------------
 * PLAN TYPES
 * -------------------------------------------------------------
 *
 *   flat         — single rate on every Shekel of amount.
 *                  { type:'flat', rate:0.05 }
 *
 *   tiered       — bracketed rate per cumulative sales bucket,
 *                  applied marginally (higher brackets only
 *                  touch the portion of sales above `from`).
 *                  { type:'tiered', tiers:[
 *                      { from: 0,      to: 100000,  rate: 0.03 },
 *                      { from: 100000, to: 250000,  rate: 0.05 },
 *                      { from: 250000, to: Infinity,rate: 0.08 },
 *                  ]}
 *
 *   accelerator  — tiered + quota. Below quota, `baseRate` is
 *                  paid; every Shekel above quota is multiplied
 *                  by `acceleratorRate` (typical comp plan:
 *                  5% to quota, 8% above quota).
 *                  { type:'accelerator', quota: 200000,
 *                    baseRate: 0.05, acceleratorRate: 0.08 }
 *
 * All three support `cap`, `floor`, `draw`, `splitRules`,
 * `clawbackPeriodDays`.
 *
 * -------------------------------------------------------------
 * SPLIT RULES
 * -------------------------------------------------------------
 * A deal can be split between many salespeople (seller, Sales
 * Engineer, manager, channel partner). Format:
 *
 *   splitRules: [
 *     { salespersonId: 'S001', role: 'seller', pct: 0.70 },
 *     { salespersonId: 'E010', role: 'se',     pct: 0.20 },
 *     { salespersonId: 'M100', role: 'manager',pct: 0.10, override: true },
 *   ]
 *
 * Or the deal itself may carry a `split` property, overriding
 * the plan's splitRules for that one deal:
 *
 *   { id:'D1', amount:50000, split:[
 *       { salespersonId:'S001', pct:0.6 },
 *       { salespersonId:'S002', pct:0.4 }
 *   ]}
 *
 * `applySplit(deal, splitRules)` validates that all `pct` values
 * sum to exactly 1.0 (within a 0.0001 tolerance) and throws
 * `E_SPLIT_NOT_100` otherwise — commissions can never leak.
 *
 * Manager override (`override:true`) is *additive* — it does
 * not reduce the seller's share. The override slice is paid
 * from a separate "team override" pool so the plan total can
 * exceed 100% when the manager line is included.
 *
 * -------------------------------------------------------------
 * CLAWBACK LOGIC
 * -------------------------------------------------------------
 * Each deal carries `closedDate` (when the revenue was booked)
 * and `paidDate` (when the customer actually paid the invoice).
 * If `paidDate` is null or `paidDate - closedDate` exceeds the
 * plan's `clawbackPeriodDays`, `applyClawback(salesperson, period)`
 * reverses the commission by appending a *negative* entry with
 * `reason:'clawback'` and `sourceDealId` pointing at the original
 * row. The original row is untouched (never delete).
 *
 * -------------------------------------------------------------
 * PUBLIC API
 * -------------------------------------------------------------
 *   definePlan(spec)                         → planId
 *   assignPlan(salespersonId, planId, date)  → assignmentId
 *   calculate({salesperson, period, sales})  → { perDeal[], totals }
 *   applySplit(deal, splitRules)             → [{ salespersonId, amount, commission, role, pct }]
 *   applyClawback(salesperson, period)       → [{ dealId, amount, reason }]
 *   forecast({salesperson, pipeline})        → { total, perDeal[], asOf }
 *   generateStatement(salesperson, period)   → { buffer, filename, mime }
 *   listPlans()                              → Plan[]
 *   listAssignments(salespersonId?)          → Assignment[]
 *   listCalculations(salespersonId?, period?)→ CalcRow[]
 *   snapshot()                               → deep-clone of state
 */

'use strict';

// ─────────────────────────────────────────────────────────────
// Bilingual labels
// ─────────────────────────────────────────────────────────────

const PLAN_TYPE_LABELS = {
  flat:        { he: 'אחיד',    en: 'Flat' },
  tiered:      { he: 'מדורג',   en: 'Tiered' },
  accelerator: { he: 'מאיץ',    en: 'Accelerator' },
};

const ROLE_LABELS = {
  seller:   { he: 'איש מכירות',        en: 'Seller' },
  se:       { he: 'מהנדס מכירות',      en: 'Sales Engineer' },
  manager:  { he: 'מנהל',               en: 'Manager' },
  partner:  { he: 'שותף עסקי',          en: 'Channel Partner' },
  overlay:  { he: 'תומך מכירות',        en: 'Overlay' },
};

const REASON_LABELS = {
  sale:      { he: 'מכירה',        en: 'Sale' },
  split:     { he: 'פיצול',        en: 'Split' },
  accelerator: { he: 'מאיץ',      en: 'Accelerator' },
  override:  { he: 'הפרש מנהל',    en: 'Manager Override' },
  cap:       { he: 'תקרה הופעלה',  en: 'Cap Applied' },
  floor:     { he: 'רצפה הופעלה',  en: 'Floor Applied' },
  draw:      { he: 'משיכה',        en: 'Draw Recovery' },
  clawback:  { he: 'שלילת עמלה',  en: 'Clawback' },
};

// ─────────────────────────────────────────────────────────────
// Tiny deterministic id helper
// ─────────────────────────────────────────────────────────────

function makeIdFactory(prefix) {
  let n = 0;
  return function next() {
    n += 1;
    return prefix + '-' + String(n).padStart(5, '0');
  };
}

// ─────────────────────────────────────────────────────────────
// Guarded numeric helpers
// ─────────────────────────────────────────────────────────────

function round2(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return null;
  return Math.floor((db.getTime() - da.getTime()) / 86400000);
}

function inPeriod(date, period) {
  const d = parseDate(date);
  if (!d) return false;
  const from = parseDate(period && period.from);
  const to = parseDate(period && period.to);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function periodKey(period) {
  if (!period) return 'all';
  const f = period.from ? new Date(period.from).toISOString().slice(0, 10) : 'BOT';
  const t = period.to ? new Date(period.to).toISOString().slice(0, 10) : 'EOT';
  return f + '_' + t;
}

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

function validatePlanSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('E_PLAN_INVALID: spec must be object');
  }
  if (!spec.id || typeof spec.id !== 'string') {
    throw new Error('E_PLAN_INVALID: id required');
  }
  if (!PLAN_TYPE_LABELS[spec.type]) {
    throw new Error('E_PLAN_INVALID: type must be flat|tiered|accelerator');
  }
  if (spec.type === 'flat') {
    if (typeof spec.rate !== 'number' || spec.rate < 0) {
      throw new Error('E_PLAN_INVALID: flat plan needs rate ≥ 0');
    }
  }
  if (spec.type === 'tiered') {
    if (!Array.isArray(spec.tiers) || spec.tiers.length === 0) {
      throw new Error('E_PLAN_INVALID: tiered plan needs tiers[]');
    }
    let prevTo = 0;
    for (let i = 0; i < spec.tiers.length; i += 1) {
      const t = spec.tiers[i];
      if (typeof t.from !== 'number' || typeof t.to !== 'number'
        || typeof t.rate !== 'number') {
        throw new Error('E_PLAN_INVALID: tier ' + i + ' malformed');
      }
      if (t.from > t.to) {
        throw new Error('E_PLAN_INVALID: tier ' + i + ' from > to');
      }
      if (i > 0 && Math.abs(t.from - prevTo) > 0.0001) {
        throw new Error('E_PLAN_INVALID: tier ' + i + ' not contiguous');
      }
      prevTo = t.to;
    }
  }
  if (spec.type === 'accelerator') {
    if (typeof spec.quota !== 'number' || spec.quota < 0) {
      throw new Error('E_PLAN_INVALID: accelerator plan needs quota ≥ 0');
    }
    if (typeof spec.baseRate !== 'number' || spec.baseRate < 0) {
      throw new Error('E_PLAN_INVALID: accelerator needs baseRate');
    }
    if (typeof spec.acceleratorRate !== 'number'
      || spec.acceleratorRate < spec.baseRate) {
      throw new Error('E_PLAN_INVALID: acceleratorRate must be ≥ baseRate');
    }
  }
  if (spec.cap !== undefined && spec.cap !== null) {
    if (typeof spec.cap !== 'number' || spec.cap < 0) {
      throw new Error('E_PLAN_INVALID: cap must be ≥ 0');
    }
  }
  if (spec.floor !== undefined && spec.floor !== null) {
    if (typeof spec.floor !== 'number' || spec.floor < 0) {
      throw new Error('E_PLAN_INVALID: floor must be ≥ 0');
    }
  }
  if (spec.draw !== undefined && spec.draw !== null) {
    if (typeof spec.draw !== 'number' || spec.draw < 0) {
      throw new Error('E_PLAN_INVALID: draw must be ≥ 0');
    }
  }
  if (spec.clawbackPeriodDays !== undefined && spec.clawbackPeriodDays !== null) {
    if (typeof spec.clawbackPeriodDays !== 'number'
      || spec.clawbackPeriodDays < 0) {
      throw new Error('E_PLAN_INVALID: clawbackPeriodDays must be ≥ 0');
    }
  }
  if (spec.splitRules !== undefined && spec.splitRules !== null) {
    if (!Array.isArray(spec.splitRules)) {
      throw new Error('E_PLAN_INVALID: splitRules must be array');
    }
  }
}

function validateSplitSum(split) {
  if (!Array.isArray(split) || split.length === 0) return;
  let sum = 0;
  for (let i = 0; i < split.length; i += 1) {
    const row = split[i];
    if (row && row.override) continue; // overrides are additive
    if (typeof row.pct !== 'number' || row.pct < 0 || row.pct > 1) {
      throw new Error('E_SPLIT_INVALID: pct must be 0..1 at index ' + i);
    }
    sum += row.pct;
  }
  if (Math.abs(sum - 1.0) > 0.0001) {
    throw new Error('E_SPLIT_NOT_100: sum=' + sum.toFixed(4)
      + ' must be 1.0000 (excluding overrides)');
  }
}

// ─────────────────────────────────────────────────────────────
// Rate engines
// ─────────────────────────────────────────────────────────────

function commissionForFlat(plan, amount) {
  return {
    gross: amount * plan.rate,
    tier: { from: 0, to: Infinity, rate: plan.rate },
    acceleratorApplied: false,
  };
}

function commissionForTiered(plan, amount) {
  // Marginal-tier calculation:
  //   only the portion of `amount` that falls inside each
  //   tier's [from, to) window is taxed at that tier's rate.
  let gross = 0;
  let used = 0;
  const hit = [];
  for (let i = 0; i < plan.tiers.length; i += 1) {
    const t = plan.tiers[i];
    if (amount <= t.from) break;
    const slice = Math.min(amount, t.to) - t.from;
    if (slice <= 0) continue;
    gross += slice * t.rate;
    used += slice;
    hit.push({ from: t.from, to: t.to, rate: t.rate, amount: slice });
    if (amount <= t.to) break;
  }
  return {
    gross: gross,
    tier: hit[hit.length - 1] || { from: 0, to: 0, rate: 0 },
    hitTiers: hit,
    acceleratorApplied: false,
    usedAmount: used,
  };
}

function commissionForAccelerator(plan, amount, priorPeriodSales) {
  // `priorPeriodSales` = cumulative sales booked to this
  // salesperson earlier in the same period. Lets us split a
  // single deal across the quota boundary. When `priorPeriodSales`
  // is undefined we treat the deal in isolation.
  const prior = priorPeriodSales || 0;
  const cumulative = prior + amount;
  let gross = 0;
  let acceleratorApplied = false;
  if (cumulative <= plan.quota) {
    gross = amount * plan.baseRate;
  } else if (prior >= plan.quota) {
    gross = amount * plan.acceleratorRate;
    acceleratorApplied = true;
  } else {
    const underQuota = plan.quota - prior;
    const overQuota = amount - underQuota;
    gross = underQuota * plan.baseRate + overQuota * plan.acceleratorRate;
    acceleratorApplied = true;
  }
  return {
    gross: gross,
    tier: {
      from: 0, to: plan.quota, rate: plan.baseRate,
      acceleratorRate: plan.acceleratorRate,
    },
    acceleratorApplied: acceleratorApplied,
    quota: plan.quota,
    cumulative: cumulative,
  };
}

function commissionForAmount(plan, amount, priorPeriodSales) {
  if (plan.type === 'flat') return commissionForFlat(plan, amount);
  if (plan.type === 'tiered') return commissionForTiered(plan, amount);
  if (plan.type === 'accelerator') {
    return commissionForAccelerator(plan, amount, priorPeriodSales);
  }
  throw new Error('E_PLAN_TYPE: ' + plan.type);
}

// ─────────────────────────────────────────────────────────────
// CommissionEngine class
// ─────────────────────────────────────────────────────────────

class CommissionEngine {
  constructor(options) {
    const opts = options || {};
    this._now = typeof opts.now === 'function'
      ? opts.now
      : function () { return Date.now(); };

    this._plans = new Map();            // id → latest plan
    this._planHistory = new Map();      // id → [ …older versions ]
    this._assignments = [];             // append-only log
    this._assignmentId = makeIdFactory('ASSIGN');
    this._calculations = [];            // append-only log of calc rows
    this._calcId = makeIdFactory('CALC');
    this._clawbacks = [];               // append-only log of clawback rows
    this._clawbackId = makeIdFactory('CLAW');
    this._drawLedger = new Map();       // salespersonId → outstanding draw
  }

  // ------------------------------------------------------------
  // Plan management
  // ------------------------------------------------------------

  definePlan(spec) {
    validatePlanSpec(spec);
    const existing = this._plans.get(spec.id);
    const version = existing ? (existing.version + 1) : 1;
    if (existing) {
      const hist = this._planHistory.get(spec.id) || [];
      hist.push(existing);
      this._planHistory.set(spec.id, hist);
    }
    const plan = {
      id: spec.id,
      name: spec.name || spec.id,
      type: spec.type,
      rate: spec.rate,
      tiers: spec.tiers ? spec.tiers.map(function (t) { return Object.assign({}, t); }) : undefined,
      quota: spec.quota,
      baseRate: spec.baseRate,
      acceleratorRate: spec.acceleratorRate,
      cap: spec.cap !== undefined ? spec.cap : null,
      floor: spec.floor !== undefined ? spec.floor : null,
      draw: spec.draw !== undefined ? spec.draw : null,
      splitRules: spec.splitRules ? spec.splitRules.map(function (r) { return Object.assign({}, r); }) : null,
      clawbackPeriodDays: spec.clawbackPeriodDays !== undefined
        ? spec.clawbackPeriodDays
        : null,
      version: version,
      createdAt: this._now(),
      labels: {
        type: PLAN_TYPE_LABELS[spec.type],
      },
    };
    this._plans.set(spec.id, plan);
    return plan.id;
  }

  listPlans() {
    return Array.from(this._plans.values()).map(function (p) {
      return Object.assign({}, p);
    });
  }

  getPlan(planId) {
    const p = this._plans.get(planId);
    if (!p) return null;
    return Object.assign({}, p);
  }

  // ------------------------------------------------------------
  // Assignments
  // ------------------------------------------------------------

  assignPlan(salespersonId, planId, effectiveDate) {
    if (!salespersonId) throw new Error('E_ASSIGN: salespersonId required');
    if (!this._plans.has(planId)) {
      throw new Error('E_ASSIGN: unknown planId ' + planId);
    }
    const eff = parseDate(effectiveDate) || new Date(this._now());
    // End previous active assignment for this salesperson
    for (let i = 0; i < this._assignments.length; i += 1) {
      const a = this._assignments[i];
      if (a.salespersonId === salespersonId && !a.endDate) {
        a.endDate = new Date(eff.getTime() - 86400000).toISOString();
      }
    }
    const id = this._assignmentId();
    const rec = {
      id: id,
      salespersonId: salespersonId,
      planId: planId,
      effectiveDate: eff.toISOString(),
      endDate: null,
      createdAt: this._now(),
    };
    this._assignments.push(rec);
    return id;
  }

  listAssignments(salespersonId) {
    const out = [];
    for (let i = 0; i < this._assignments.length; i += 1) {
      const a = this._assignments[i];
      if (salespersonId && a.salespersonId !== salespersonId) continue;
      out.push(Object.assign({}, a));
    }
    return out;
  }

  getActivePlanFor(salespersonId, asOf) {
    const at = parseDate(asOf) || new Date(this._now());
    let best = null;
    for (let i = 0; i < this._assignments.length; i += 1) {
      const a = this._assignments[i];
      if (a.salespersonId !== salespersonId) continue;
      const eff = parseDate(a.effectiveDate);
      if (eff > at) continue;
      const end = a.endDate ? parseDate(a.endDate) : null;
      if (end && end < at) continue;
      if (!best || parseDate(best.effectiveDate) < eff) best = a;
    }
    return best ? this._plans.get(best.planId) : null;
  }

  // ------------------------------------------------------------
  // Split calculation — `applySplit`
  // ------------------------------------------------------------

  applySplit(deal, splitRules) {
    if (!deal || typeof deal !== 'object') {
      throw new Error('E_SPLIT: deal required');
    }
    const dealSplit = (deal.split && deal.split.length) ? deal.split : splitRules;
    if (!dealSplit || dealSplit.length === 0) {
      return [{
        dealId: deal.id,
        salespersonId: deal.salesperson || null,
        role: 'seller',
        pct: 1.0,
        amount: deal.amount,
        override: false,
      }];
    }
    validateSplitSum(dealSplit);
    const out = [];
    for (let i = 0; i < dealSplit.length; i += 1) {
      const row = dealSplit[i];
      out.push({
        dealId: deal.id,
        salespersonId: row.salespersonId,
        role: row.role || 'seller',
        pct: row.pct,
        amount: round2(deal.amount * row.pct),
        override: !!row.override,
      });
    }
    return out;
  }

  // ------------------------------------------------------------
  // Main per-period commission calculation
  // ------------------------------------------------------------

  calculate(input) {
    if (!input || !input.salesperson) {
      throw new Error('E_CALC: salesperson required');
    }
    if (!Array.isArray(input.sales)) {
      throw new Error('E_CALC: sales array required');
    }
    const salesperson = input.salesperson;
    const period = input.period || { from: null, to: null };
    const plan = input.plan
      || this.getActivePlanFor(salesperson, period.to || period.from);
    if (!plan) {
      throw new Error('E_CALC: no active plan for ' + salesperson
        + ' in period ' + periodKey(period));
    }

    // Build "assigned to this salesperson" shares for each deal.
    // - If the deal has an explicit `split`, we use that.
    // - Else if the plan has `splitRules` and the deal has no split,
    //   we use plan rules (common for SE-attached plans).
    // - Else the full amount goes to `salesperson`.
    const myDeals = [];
    for (let i = 0; i < input.sales.length; i += 1) {
      const deal = input.sales[i];
      if (!inPeriod(deal.closedDate || deal.date, period)) continue;
      const shares = this.applySplit(deal, plan.splitRules || null);
      let myShare = null;
      for (let j = 0; j < shares.length; j += 1) {
        if (shares[j].salespersonId === salesperson) {
          myShare = shares[j];
          break;
        }
      }
      // If no split was specified at all, deal is 100% this salesperson
      if (!myShare && !deal.split && !(plan.splitRules && plan.splitRules.length)) {
        myShare = {
          dealId: deal.id,
          salespersonId: salesperson,
          role: 'seller',
          pct: 1.0,
          amount: deal.amount,
          override: false,
        };
      }
      if (!myShare) continue;
      myDeals.push({ deal: deal, share: myShare });
    }

    // Run calculations in closedDate order so accelerator gets the
    // correct running `priorPeriodSales`.
    myDeals.sort(function (a, b) {
      const da = parseDate(a.deal.closedDate) || new Date(0);
      const db = parseDate(b.deal.closedDate) || new Date(0);
      return da.getTime() - db.getTime();
    });

    const perDeal = [];
    let running = 0;          // running share amount (net of splits)
    let grossCommission = 0;
    let overridePool = 0;     // manager team overrides on my deals
    let acceleratorApplied = false;

    for (let i = 0; i < myDeals.length; i += 1) {
      const pair = myDeals[i];
      const deal = pair.deal;
      const share = pair.share;
      const calc = commissionForAmount(plan, share.amount, running);
      running += share.amount;
      const grossShare = round2(calc.gross);
      grossCommission += grossShare;
      if (calc.acceleratorApplied) acceleratorApplied = true;

      // Manager override: only counted when the share row itself
      // belongs to a manager with override:true. Here we collect
      // override slices *attached to this deal* and stash them
      // separately so we can report/write them.
      if (deal.split && Array.isArray(deal.split)) {
        for (let k = 0; k < deal.split.length; k += 1) {
          const r = deal.split[k];
          if (r.override && r.salespersonId === salesperson) {
            overridePool += round2(deal.amount * r.pct * plan.baseRate
              || deal.amount * r.pct * (plan.rate || 0.01));
          }
        }
      }

      perDeal.push({
        dealId: deal.id,
        closedDate: deal.closedDate,
        paidDate: deal.paidDate || null,
        customer: deal.customer,
        productGroup: deal.productGroup,
        grossAmount: deal.amount,
        shareAmount: share.amount,
        sharePct: share.pct,
        role: share.role,
        margin: deal.margin,
        commission: grossShare,
        hitTiers: calc.hitTiers || null,
        acceleratorApplied: calc.acceleratorApplied || false,
        reason: 'sale',
      });
    }

    // Cap / Floor
    let beforeCap = grossCommission;
    let capApplied = false;
    let floorApplied = false;
    if (plan.cap !== null && plan.cap !== undefined
        && grossCommission > plan.cap) {
      grossCommission = plan.cap;
      capApplied = true;
    }
    if (plan.floor !== null && plan.floor !== undefined
        && grossCommission < plan.floor) {
      grossCommission = plan.floor;
      floorApplied = true;
    }

    // Draw recovery — prior draws owed are recovered from current
    // commission before paying out (but not below zero).
    const outstandingDraw = this._drawLedger.get(salesperson) || 0;
    let drawRecovered = 0;
    let netPayable = grossCommission;
    if (outstandingDraw > 0) {
      drawRecovered = Math.min(outstandingDraw, grossCommission);
      netPayable = grossCommission - drawRecovered;
      this._drawLedger.set(salesperson, outstandingDraw - drawRecovered);
    }

    // Draw advance — if plan has a monthly draw and the net falls
    // below it, top up to the draw amount and add the delta to the
    // outstanding draw ledger (to be recovered against future).
    let drawAdvanced = 0;
    if (plan.draw && plan.draw > 0 && netPayable < plan.draw) {
      drawAdvanced = plan.draw - netPayable;
      netPayable = plan.draw;
      this._drawLedger.set(salesperson,
        (this._drawLedger.get(salesperson) || 0) + drawAdvanced);
    }

    // Persist calculation rows (append-only)
    const runId = this._calcId();
    const runTs = this._now();
    const persistedRows = [];
    for (let i = 0; i < perDeal.length; i += 1) {
      const row = Object.assign({
        id: this._calcId(),
        runId: runId,
        salespersonId: salesperson,
        planId: plan.id,
        planVersion: plan.version,
        period: periodKey(period),
        amount: perDeal[i].commission,
        ts: runTs,
      }, perDeal[i]);
      this._calculations.push(row);
      persistedRows.push(row);
    }

    const totals = {
      runId: runId,
      salespersonId: salesperson,
      planId: plan.id,
      planName: plan.name,
      planType: plan.type,
      period: periodKey(period),
      dealCount: perDeal.length,
      totalSales: round2(running),
      grossCommission: round2(beforeCap),
      capApplied: capApplied,
      floorApplied: floorApplied,
      acceleratorApplied: acceleratorApplied,
      capAmount: plan.cap,
      floorAmount: plan.floor,
      commissionAfterCap: round2(grossCommission),
      drawRecovered: round2(drawRecovered),
      drawAdvanced: round2(drawAdvanced),
      outstandingDraw: round2(this._drawLedger.get(salesperson) || 0),
      overrideAmount: round2(overridePool),
      netPayable: round2(netPayable + overridePool),
    };

    return { perDeal: perDeal, totals: totals, persistedRows: persistedRows };
  }

  // ------------------------------------------------------------
  // Clawback
  // ------------------------------------------------------------

  applyClawback(salesperson, period) {
    const plan = this.getActivePlanFor(salesperson,
      (period && period.to) || (period && period.from));
    if (!plan || plan.clawbackPeriodDays === null
        || plan.clawbackPeriodDays === undefined) {
      return [];
    }
    const limit = plan.clawbackPeriodDays;
    const nowMs = this._now();
    const out = [];

    // Walk this salesperson's sale rows in the period.
    for (let i = 0; i < this._calculations.length; i += 1) {
      const row = this._calculations[i];
      if (row.salespersonId !== salesperson) continue;
      if (row.reason !== 'sale') continue;
      if (period && !inPeriod(row.closedDate, period)) continue;
      // Already clawed back?
      let already = false;
      for (let j = 0; j < this._calculations.length; j += 1) {
        const cb = this._calculations[j];
        if (cb.reason === 'clawback' && cb.sourceCalcId === row.id) {
          already = true; break;
        }
      }
      if (already) continue;

      // Determine if deal is overdue.
      let overdue = false;
      let reason = null;
      const paid = parseDate(row.paidDate);
      const closed = parseDate(row.closedDate);
      if (!paid) {
        // Not yet paid. Only clawback if now is past the deadline.
        if (closed) {
          const diff = Math.floor((nowMs - closed.getTime()) / 86400000);
          if (diff > limit) { overdue = true; reason = 'unpaid_overdue'; }
        }
      } else if (closed) {
        const diff = Math.floor((paid.getTime() - closed.getTime()) / 86400000);
        if (diff > limit) { overdue = true; reason = 'paid_late'; }
      }
      if (!overdue) continue;

      const clawRow = {
        id: this._calcId(),
        runId: 'CLAWBACK-' + this._clawbackId(),
        salespersonId: salesperson,
        planId: plan.id,
        planVersion: plan.version,
        period: periodKey(period),
        dealId: row.dealId,
        closedDate: row.closedDate,
        paidDate: row.paidDate,
        customer: row.customer,
        productGroup: row.productGroup,
        grossAmount: row.grossAmount,
        shareAmount: row.shareAmount,
        sharePct: row.sharePct,
        role: row.role,
        commission: -Math.abs(row.commission),
        amount: -Math.abs(row.commission),
        acceleratorApplied: false,
        reason: 'clawback',
        clawbackReason: reason,
        sourceCalcId: row.id,
        ts: this._now(),
      };
      this._calculations.push(clawRow);
      this._clawbacks.push({
        id: clawRow.id,
        dealId: row.dealId,
        salespersonId: salesperson,
        amount: clawRow.commission,
        reason: reason,
      });
      out.push({
        dealId: row.dealId,
        amount: clawRow.commission,
        reason: reason,
      });
    }
    return out;
  }

  // ------------------------------------------------------------
  // Pipeline forecasting
  // ------------------------------------------------------------

  forecast(input) {
    if (!input || !input.salesperson) {
      throw new Error('E_FORECAST: salesperson required');
    }
    if (!Array.isArray(input.pipeline)) {
      throw new Error('E_FORECAST: pipeline array required');
    }
    const plan = input.plan
      || this.getActivePlanFor(input.salesperson, this._now());
    if (!plan) {
      throw new Error('E_FORECAST: no active plan for ' + input.salesperson);
    }
    let running = 0;
    const perDeal = [];
    let total = 0;
    for (let i = 0; i < input.pipeline.length; i += 1) {
      const deal = input.pipeline[i];
      const probability = typeof deal.probability === 'number'
        ? deal.probability
        : 0.5;
      const expectedAmount = (deal.amount || 0) * probability;
      // Forecast uses expected (probability-weighted) amount for
      // the tier math so the running total mirrors what we'd
      // actually pay if the pipeline closes as weighted.
      const calc = commissionForAmount(plan, expectedAmount, running);
      running += expectedAmount;
      const weighted = round2(calc.gross);
      total += weighted;
      perDeal.push({
        dealId: deal.id,
        customer: deal.customer,
        amount: deal.amount,
        probability: probability,
        expectedAmount: round2(expectedAmount),
        weightedCommission: weighted,
        acceleratorApplied: calc.acceleratorApplied || false,
      });
    }

    // Apply cap at forecast level too (net of draw is not meaningful
    // for a forecast so we skip drawRecovery here).
    let capApplied = false;
    let totalCapped = total;
    if (plan.cap !== null && plan.cap !== undefined && total > plan.cap) {
      totalCapped = plan.cap;
      capApplied = true;
    }

    return {
      salespersonId: input.salesperson,
      planId: plan.id,
      planName: plan.name,
      asOf: new Date(this._now()).toISOString(),
      dealCount: perDeal.length,
      grossForecast: round2(total),
      total: round2(totalCapped),
      capApplied: capApplied,
      perDeal: perDeal,
    };
  }

  // ------------------------------------------------------------
  // Bilingual commission statement (text-PDF)
  // ------------------------------------------------------------

  generateStatement(salesperson, period) {
    const rows = this.listCalculations(salesperson, period);
    const plan = this.getActivePlanFor(salesperson,
      (period && period.to) || (period && period.from) || this._now());

    let gross = 0;
    let clawback = 0;
    let net = 0;
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      if (r.reason === 'clawback') clawback += r.commission;
      else gross += r.commission;
    }
    net = gross + clawback; // clawback rows are already negative

    const periodLabel = periodKey(period);
    const he = [];
    const en = [];

    // Hebrew block (RTL)
    he.push('דוח עמלות — ' + salesperson);
    he.push('תקופה: ' + periodLabel);
    he.push('תכנית עמלות: ' + (plan ? plan.name : 'לא מוגדרת'));
    he.push('סוג תכנית: ' + (plan ? PLAN_TYPE_LABELS[plan.type].he : '—'));
    he.push('');
    he.push('פירוט עסקאות:');
    he.push('שורה  עסקה              לקוח               סכום       עמלה     סיבה');
    he.push('---- ------------------ ------------------ ---------- -------- -----');
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const reasonHe = REASON_LABELS[r.reason] ? REASON_LABELS[r.reason].he : r.reason;
      he.push(
        String(i + 1).padStart(4, ' ') + ' '
        + String(r.dealId || '').padEnd(18, ' ') + ' '
        + String(r.customer || '').padEnd(18, ' ') + ' '
        + String(round2(r.shareAmount || 0)).padStart(10, ' ') + ' '
        + String(round2(r.commission || 0)).padStart(8, ' ') + '  '
        + reasonHe
      );
    }
    he.push('');
    he.push('סך עמלה ברוטו: ' + round2(gross).toFixed(2));
    he.push('שלילות (clawback): ' + round2(clawback).toFixed(2));
    he.push('סך לתשלום נטו: ' + round2(net).toFixed(2));
    he.push('');

    // English block (LTR)
    en.push('COMMISSION STATEMENT — ' + salesperson);
    en.push('Period: ' + periodLabel);
    en.push('Plan: ' + (plan ? plan.name : 'none'));
    en.push('Plan type: ' + (plan ? PLAN_TYPE_LABELS[plan.type].en : '—'));
    en.push('');
    en.push('Deal detail:');
    en.push('  #  Deal               Customer           Sales     Comm     Reason');
    en.push(' --- ------------------ ------------------ --------- -------- ------');
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const reasonEn = REASON_LABELS[r.reason] ? REASON_LABELS[r.reason].en : r.reason;
      en.push(
        String(i + 1).padStart(4, ' ') + ' '
        + String(r.dealId || '').padEnd(18, ' ') + ' '
        + String(r.customer || '').padEnd(18, ' ') + ' '
        + String(round2(r.shareAmount || 0)).padStart(9, ' ') + ' '
        + String(round2(r.commission || 0)).padStart(8, ' ') + '  '
        + reasonEn
      );
    }
    en.push('');
    en.push('Gross commission: ' + round2(gross).toFixed(2));
    en.push('Clawbacks:        ' + round2(clawback).toFixed(2));
    en.push('Net payable:      ' + round2(net).toFixed(2));

    const body = he.join('\n')
      + '\n\n================================================================\n\n'
      + en.join('\n') + '\n';

    // Minimal single-page "plain text PDF" — good enough for
    // emailing out, no external libs, browsers and PDF viewers
    // render it. Full-featured PDF generation is outside scope.
    const pdf = buildSimplePdf(body);

    return {
      buffer: pdf,
      body: body,
      filename: 'commission-' + salesperson + '-' + periodLabel + '.pdf',
      mime: 'application/pdf',
    };
  }

  // ------------------------------------------------------------
  // Inspection
  // ------------------------------------------------------------

  listCalculations(salespersonId, period) {
    const out = [];
    for (let i = 0; i < this._calculations.length; i += 1) {
      const r = this._calculations[i];
      if (salespersonId && r.salespersonId !== salespersonId) continue;
      if (period && !inPeriod(r.closedDate, period)
          && !inPeriod(r.ts && new Date(r.ts), period)) {
        // If period is specified, require either closed or booked
        // within the window. For clawback rows, fall back to `ts`
        // so they show on the period where they were applied.
        if (r.reason === 'clawback') {
          if (!inPeriod(new Date(r.ts), period)) continue;
        } else {
          continue;
        }
      }
      out.push(Object.assign({}, r));
    }
    return out;
  }

  listClawbacks() {
    return this._clawbacks.map(function (c) { return Object.assign({}, c); });
  }

  outstandingDraw(salespersonId) {
    return this._drawLedger.get(salespersonId) || 0;
  }

  snapshot() {
    return {
      plans: this.listPlans(),
      assignments: this.listAssignments(),
      calculations: this.listCalculations(),
      clawbacks: this.listClawbacks(),
      drawLedger: Array.from(this._drawLedger.entries()).map(function (e) {
        return { salespersonId: e[0], outstanding: e[1] };
      }),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Minimal single-page PDF builder (zero-dep, plain text)
// Produces a valid PDF 1.4 document with a Courier-rendered
// body. Not a replacement for pdf-kit, but enough for a
// Hebrew+English statement attachment.
// ─────────────────────────────────────────────────────────────

function buildSimplePdf(text) {
  // Escape PDF-reserved chars and split into lines the viewer
  // can handle (Courier, 10pt, origin at bottom-left).
  const lines = String(text).split(/\r?\n/);
  const safe = lines.map(function (ln) {
    return ln
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  });
  let content = 'BT /F1 9 Tf 36 780 Td 11 TL\n';
  for (let i = 0; i < safe.length; i += 1) {
    content += '(' + safe[i] + ') Tj T*\n';
  }
  content += 'ET\n';
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);

  // Minimal cross-referenced PDF skeleton.
  const objs = [];
  objs.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objs.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objs.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
    + '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
  );
  objs.push(
    '4 0 obj\n<< /Length ' + contentBytes.length + ' >>\nstream\n'
    + content + 'endstream\nendobj\n'
  );
  objs.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objs.length; i += 1) {
    offsets.push(pdf.length);
    pdf += objs[i];
  }
  const xrefStart = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objs.length; i += 1) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\n';
  pdf += 'startxref\n' + xrefStart + '\n%%EOF\n';
  return Buffer.from(pdf, 'binary');
}

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  CommissionEngine: CommissionEngine,
  PLAN_TYPE_LABELS: PLAN_TYPE_LABELS,
  ROLE_LABELS: ROLE_LABELS,
  REASON_LABELS: REASON_LABELS,
};
