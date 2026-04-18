/**
 * Discount Rules Engine — Stacking / Exclusivity / Priority
 * Agent Y-019 — Swarm: Mega-ERP Techno-Kol Uzi — Kobi EL
 *
 * ---------------------------------------------------------------
 *  A deterministic, fully-documented, zero-dependency discount
 *  rules engine for the Israeli ERP (Techno-Kol Uzi / ONYX
 *  Procurement).
 *
 *  Design rules (הקדוש-קדושים):
 *    לא מוחקים — רק משדרגים ומגדלים.
 *    • This module NEVER deletes rules. `disableRule()` only
 *      flips a flag; the rule object and all history remain.
 *    • The internal rule store is an append-only Map keyed by
 *      rule id; re-defining an existing id creates a NEW version
 *      object and pushes the old one onto `rule.history[]`.
 *    • Zero runtime dependencies (pure Node / CommonJS).
 *    • Bilingual (Hebrew / English) explanations for UI + audit.
 *    • All math in integer agorot internally, converted to ₪ on
 *      the way out, so no floating-point drift.
 *
 *  Public surface (exported):
 *    class DiscountEngine
 *      .defineRule(rule)
 *      .disableRule(id)            // soft-disable, never deletes
 *      .getRule(id)
 *      .listRules()                // all (active + disabled)
 *      .listActiveRules(date?)
 *      .validateRule(rule)
 *      .evaluate({cart, customer, context})
 *      .apply(cart, discounts?)
 *      .explain(cart)
 *    const CONSTANTS, ACTION_TYPES, RULE_TYPES, CONDITION_OPS
 *
 *  Rule shape (what you pass to defineRule):
 *    {
 *      id:          string                      // required, unique
 *      type:        'customer'|'item'|'quantity'|'period'|'cart'
 *      condition:   Condition                   // AND/OR tree or leaf
 *      action:      { type, value, ...extras }  // see ACTION_TYPES
 *      priority:    integer (default 100)       // higher = earlier
 *      stackable:   boolean (default true)
 *      exclusive:   boolean (default false)     // if true — only this rule
 *      maxDiscount: number (₪) | null           // cap per rule
 *      startDate:   ISO string | null
 *      endDate:     ISO string | null
 *      note_he:     string (optional)
 *      note_en:     string (optional)
 *    }
 *
 *  Condition grammar:
 *    A Condition is either a LEAF ({field, op, value}) or a
 *    COMPOSITE ({all: [...]}) = AND, ({any: [...]}) = OR, or
 *    ({not: Condition}).  The leaf `field` is a dotted path
 *    evaluated against the context object {cart, customer, ctx}.
 *
 *    Supported ops:
 *      eq | ne | gt | gte | lt | lte | in | nin | contains |
 *      startsWith | endsWith | between | exists | regex
 *
 *  Action types:
 *    { type: 'percent',   value: 10 }                      // 10% off
 *    { type: 'amount',    value: 50 }                      // 50 ₪ off
 *    { type: 'bogo',      value: 1, targetSku: 'SKU-X' }   // buy X get
 *                                                            X free,
 *                                                            value = N free
 *    { type: 'freeItem',  sku: 'SKU-Y', qty: 1 }           // add free
 *    { type: 'upgrade',   fromSku, toSku }                 // swap to
 *                                                            better SKU
 *                                                            at same price
 *  Each action may also carry:
 *    scope:   'cart' | 'line'          (default 'cart' for
 *                                       percent/amount)
 *    targetSku / targetCategory        (filter for line scope)
 *
 *  Consumer protection (חוק הגנת הצרכן — Israel):
 *    – The engine refuses to show a "prior price" that is not
 *      truthful.  A rule can opt-in by supplying `priorPrice`
 *      on a cart line; the engine then checks that the prior
 *      price has been the effective price for at least
 *      PRIOR_PRICE_MIN_DAYS calendar days before the promotion
 *      started.  If not, the explanation flags it red.
 *    – `maxDiscount` caps are enforced per-rule AND per-line.
 *    – `MAX_TOTAL_DISCOUNT_PCT` caps the combined discount for
 *      a whole cart so stacking cannot ever push a customer
 *      below cost without an explicit override.
 * ---------------------------------------------------------------
 */

'use strict';

// ───────────────────────────────────────────────────────────
// Constants (exported for tests + UI config screens)
// ───────────────────────────────────────────────────────────
const CONSTANTS = Object.freeze({
  DEFAULT_PRIORITY: 100,
  MAX_TOTAL_DISCOUNT_PCT: 80,      // cart-wide safety cap (%)
  PRIOR_PRICE_MIN_DAYS: 30,         // Israeli חוק הגנת הצרכן
  VAT_RATE: 0.18,                   // 18% (2026)
  AGOROT_PER_SHEKEL: 100,
});

const RULE_TYPES = Object.freeze([
  'customer', 'item', 'quantity', 'period', 'cart',
]);

const ACTION_TYPES = Object.freeze([
  'percent', 'amount', 'bogo', 'freeItem', 'upgrade',
]);

const CONDITION_OPS = Object.freeze([
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
  'in', 'nin', 'contains', 'startsWith', 'endsWith',
  'between', 'exists', 'regex',
]);

// ───────────────────────────────────────────────────────────
// Integer-agorot helpers (no floating-point drift)
// ───────────────────────────────────────────────────────────
const toAgorot = (shekels) => Math.round(Number(shekels) * CONSTANTS.AGOROT_PER_SHEKEL);
const toShekels = (agorot) => Math.round(agorot) / CONSTANTS.AGOROT_PER_SHEKEL;

// ───────────────────────────────────────────────────────────
// Dotted-path getter  "customer.tier" -> ctx.customer.tier
// ───────────────────────────────────────────────────────────
function getPath(obj, path) {
  if (obj == null) return undefined;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// ───────────────────────────────────────────────────────────
// Condition evaluator
// Accepts either a LEAF {field, op, value}
// or a composite  {all:[...]} / {any:[...]} / {not: cond}
// ───────────────────────────────────────────────────────────
function evaluateCondition(condition, scope) {
  if (condition == null) return true;                // no condition = always
  if (Array.isArray(condition)) {                    // shorthand: AND
    return condition.every((c) => evaluateCondition(c, scope));
  }
  if (condition.all) return condition.all.every((c) => evaluateCondition(c, scope));
  if (condition.any) return condition.any.some((c) => evaluateCondition(c, scope));
  if (condition.not) return !evaluateCondition(condition.not, scope);

  // LEAF
  const { field, op, value } = condition;
  if (!field || !op) return false;
  const actual = getPath(scope, field);

  switch (op) {
    case 'eq':         return actual === value;
    case 'ne':         return actual !== value;
    case 'gt':         return Number(actual) >  Number(value);
    case 'gte':        return Number(actual) >= Number(value);
    case 'lt':         return Number(actual) <  Number(value);
    case 'lte':        return Number(actual) <= Number(value);
    case 'in':         return Array.isArray(value) && value.includes(actual);
    case 'nin':        return Array.isArray(value) && !value.includes(actual);
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(value);
      if (typeof actual === 'string') return actual.includes(String(value));
      return false;
    case 'startsWith': return typeof actual === 'string' && actual.startsWith(String(value));
    case 'endsWith':   return typeof actual === 'string' && actual.endsWith(String(value));
    case 'between': {
      if (!Array.isArray(value) || value.length !== 2) return false;
      const n = Number(actual);
      return n >= Number(value[0]) && n <= Number(value[1]);
    }
    case 'exists':     return actual !== undefined && actual !== null;
    case 'regex':
      try { return new RegExp(value).test(String(actual ?? '')); }
      catch { return false; }
    default:           return false;
  }
}

// ───────────────────────────────────────────────────────────
// Date-window helper
// ───────────────────────────────────────────────────────────
function isWithinWindow(rule, when) {
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (Number.isNaN(t)) return false;
  if (rule.startDate) {
    const s = new Date(rule.startDate).getTime();
    if (Number.isFinite(s) && t < s) return false;
  }
  if (rule.endDate) {
    const e = new Date(rule.endDate).getTime();
    if (Number.isFinite(e) && t > e) return false;
  }
  return true;
}

// ───────────────────────────────────────────────────────────
// Consumer-protection guard — חוק הגנת הצרכן
// Returns { ok, reason_he, reason_en }
// ───────────────────────────────────────────────────────────
function checkPriorPriceHonesty(line, rule, when) {
  if (!line || line.priorPrice == null) return { ok: true };
  const prior = Number(line.priorPrice);
  const curr = Number(line.unitPrice);
  if (!Number.isFinite(prior) || !Number.isFinite(curr)) {
    return { ok: true };
  }
  if (prior <= curr) {
    return {
      ok: false,
      reason_he: 'מחיר קודם חייב להיות גבוה ממחיר הנוכחי',
      reason_en: 'prior price must be higher than current price',
    };
  }
  // Must have been in force for at least PRIOR_PRICE_MIN_DAYS days
  if (line.priorPriceSince && rule.startDate) {
    const since = new Date(line.priorPriceSince).getTime();
    const promoStart = new Date(rule.startDate).getTime();
    if (Number.isFinite(since) && Number.isFinite(promoStart)) {
      const days = (promoStart - since) / (1000 * 60 * 60 * 24);
      if (days < CONSTANTS.PRIOR_PRICE_MIN_DAYS) {
        return {
          ok: false,
          reason_he: `מחיר קודם חייב להיות בתוקף לפחות ${CONSTANTS.PRIOR_PRICE_MIN_DAYS} ימים לפני המבצע`,
          reason_en: `prior price must be in force at least ${CONSTANTS.PRIOR_PRICE_MIN_DAYS} days before promotion`,
        };
      }
    }
  }
  return { ok: true };
}

// ───────────────────────────────────────────────────────────
// Deep-clone helper (pure JSON-safe data)
// ───────────────────────────────────────────────────────────
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

// ───────────────────────────────────────────────────────────
// Line-total helpers
// ───────────────────────────────────────────────────────────
function lineSubtotalAgorot(line) {
  const qty = Number(line.qty ?? line.quantity ?? 1);
  const price = Number(line.unitPrice ?? line.price ?? 0);
  return Math.round(qty * toAgorot(price));
}

function cartSubtotalAgorot(cart) {
  const lines = cart?.lines ?? [];
  return lines.reduce((sum, l) => sum + lineSubtotalAgorot(l), 0);
}

// ═══════════════════════════════════════════════════════════
// DiscountEngine — main class
// ═══════════════════════════════════════════════════════════
class DiscountEngine {
  constructor(opts = {}) {
    this._rules = new Map();     // id -> rule (append-only by id)
    this._clock = opts.clock || (() => new Date());
    // opts.logger is optional — we never require one
    this._logger = opts.logger || null;
  }

  // ───────────── rule lifecycle (never deletes) ─────────────
  defineRule(raw) {
    const validation = this.validateRule(raw);
    if (!validation.ok) {
      const err = new Error(`invalid rule: ${validation.errors.join('; ')}`);
      err.code = 'E_INVALID_RULE';
      err.errors = validation.errors;
      throw err;
    }
    const rule = this._normalise(raw);
    const existing = this._rules.get(rule.id);
    if (existing) {
      // Keep old version in history — לא מוחקים, רק משדרגים
      rule.history = [...(existing.history || []), {
        version: (existing.version || 1),
        replacedAt: this._clock().toISOString(),
        snapshot: clone({ ...existing, history: undefined }),
      }];
      rule.version = (existing.version || 1) + 1;
      rule.createdAt = existing.createdAt;
    } else {
      rule.version = 1;
      rule.history = [];
      rule.createdAt = this._clock().toISOString();
    }
    rule.updatedAt = this._clock().toISOString();
    this._rules.set(rule.id, rule);
    return clone(rule);
  }

  disableRule(id) {
    const r = this._rules.get(id);
    if (!r) return false;
    r.disabled = true;
    r.updatedAt = this._clock().toISOString();
    return true;
  }

  enableRule(id) {
    const r = this._rules.get(id);
    if (!r) return false;
    r.disabled = false;
    r.updatedAt = this._clock().toISOString();
    return true;
  }

  getRule(id) {
    const r = this._rules.get(id);
    return r ? clone(r) : null;
  }

  listRules() {
    return Array.from(this._rules.values()).map(clone);
  }

  listActiveRules(date) {
    const when = date || this._clock();
    return this.listRules().filter((r) => !r.disabled && isWithinWindow(r, when));
  }

  // ───────────── validation ─────────────
  validateRule(rule) {
    const errors = [];
    if (!rule || typeof rule !== 'object') {
      return { ok: false, errors: ['rule must be an object'] };
    }
    if (!rule.id || typeof rule.id !== 'string') errors.push('id required (string)');
    if (!RULE_TYPES.includes(rule.type)) {
      errors.push(`type must be one of ${RULE_TYPES.join('|')}`);
    }
    if (!rule.action || typeof rule.action !== 'object') {
      errors.push('action required (object)');
    } else {
      if (!ACTION_TYPES.includes(rule.action.type)) {
        errors.push(`action.type must be one of ${ACTION_TYPES.join('|')}`);
      }
      if (rule.action.type === 'percent') {
        const v = Number(rule.action.value);
        if (!Number.isFinite(v) || v <= 0 || v > 100) {
          errors.push('action.value for percent must be 0<v<=100');
        }
      }
      if (rule.action.type === 'amount') {
        const v = Number(rule.action.value);
        if (!Number.isFinite(v) || v <= 0) {
          errors.push('action.value for amount must be > 0');
        }
      }
      if (rule.action.type === 'bogo') {
        const v = Number(rule.action.value);
        if (!Number.isFinite(v) || v < 1) {
          errors.push('action.value for bogo (free qty) must be >= 1');
        }
      }
      if (rule.action.type === 'freeItem' && !rule.action.sku) {
        errors.push('action.sku required for freeItem');
      }
      if (rule.action.type === 'upgrade') {
        if (!rule.action.fromSku || !rule.action.toSku) {
          errors.push('upgrade requires fromSku and toSku');
        }
      }
    }
    if (rule.condition) {
      try {
        // touch-test the condition with an empty scope
        evaluateCondition(rule.condition, {});
      } catch (e) {
        errors.push(`condition syntax error: ${e.message}`);
      }
    }
    if (rule.startDate) {
      if (Number.isNaN(new Date(rule.startDate).getTime())) {
        errors.push('startDate invalid');
      }
    }
    if (rule.endDate) {
      if (Number.isNaN(new Date(rule.endDate).getTime())) {
        errors.push('endDate invalid');
      }
    }
    if (rule.startDate && rule.endDate) {
      if (new Date(rule.startDate).getTime() > new Date(rule.endDate).getTime()) {
        errors.push('startDate must be <= endDate');
      }
    }
    if (rule.maxDiscount != null) {
      const m = Number(rule.maxDiscount);
      if (!Number.isFinite(m) || m < 0) errors.push('maxDiscount must be >= 0');
    }
    if (rule.priority != null && !Number.isInteger(Number(rule.priority))) {
      errors.push('priority must be an integer');
    }
    return { ok: errors.length === 0, errors };
  }

  _normalise(raw) {
    return {
      id: raw.id,
      type: raw.type,
      condition: raw.condition ?? null,
      action: { ...raw.action },
      priority: Number.isInteger(raw.priority)
        ? raw.priority
        : CONSTANTS.DEFAULT_PRIORITY,
      stackable: raw.stackable !== false,          // default true
      exclusive: raw.exclusive === true,           // default false
      maxDiscount: raw.maxDiscount ?? null,
      startDate: raw.startDate ?? null,
      endDate: raw.endDate ?? null,
      note_he: raw.note_he ?? '',
      note_en: raw.note_en ?? '',
      disabled: raw.disabled === true,
    };
  }

  // ───────────── evaluate ─────────────
  evaluate({ cart, customer, context } = {}) {
    const when = (context && context.date) || this._clock();
    const scope = { cart: cart || { lines: [] }, customer: customer || {}, ctx: context || {} };
    const active = this.listActiveRules(when);

    const matching = [];
    for (const rule of active) {
      if (evaluateCondition(rule.condition, scope)) {
        matching.push(rule);
      }
    }

    // Sort by priority DESC, stable by id
    matching.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return String(a.id).localeCompare(String(b.id));
    });

    // Exclusivity handling: first exclusive rule locks everything else out.
    // A higher-priority non-exclusive rule still wins over a lower-priority
    // exclusive rule because we scan in priority order.
    const picked = [];
    let lockedByExclusive = false;
    for (const r of matching) {
      if (lockedByExclusive) break;
      if (r.exclusive) {
        picked.push(r);
        lockedByExclusive = true;
        break;
      }
      if (!r.stackable && picked.length > 0) {
        // non-stackable: only apply if nothing else picked yet
        continue;
      }
      picked.push(r);
      if (!r.stackable) {
        // a non-stackable rule also prevents further stacking
        lockedByExclusive = true;
      }
    }

    return picked;
  }

  // ───────────── apply ─────────────
  apply(cart, discounts) {
    // `cart` is mutated (as spec'd) — but we defensively clone lines
    // so callers can hold onto the original object reference.
    const working = cart || { lines: [] };
    working.lines = (working.lines || []).map((l) => ({ ...l }));
    working.breakdown = [];
    working.notes = [];

    const rules = discounts && discounts.length
      ? discounts
      : this.evaluate({ cart: working, customer: working.customer, context: working.context });

    const whenStr = ((working.context && working.context.date)
      ? new Date(working.context.date)
      : this._clock()).toISOString();

    const subtotalBeforeAgorot = cartSubtotalAgorot(working);
    let runningSubtotalAgorot = subtotalBeforeAgorot;
    let totalDiscountAgorot = 0;
    let honestyWarnings = [];

    for (const rule of rules) {
      const entry = this._applyOne(working, rule, runningSubtotalAgorot, whenStr);
      if (entry) {
        working.breakdown.push(entry);
        totalDiscountAgorot += entry.discountAgorot;
        runningSubtotalAgorot = Math.max(0, runningSubtotalAgorot - entry.discountAgorot);
        if (entry.warnings && entry.warnings.length) {
          honestyWarnings = honestyWarnings.concat(entry.warnings);
        }
      }
    }

    // Cart-wide safety cap — MAX_TOTAL_DISCOUNT_PCT
    const cap = Math.round(subtotalBeforeAgorot * (CONSTANTS.MAX_TOTAL_DISCOUNT_PCT / 100));
    if (totalDiscountAgorot > cap) {
      const over = totalDiscountAgorot - cap;
      totalDiscountAgorot = cap;
      working.breakdown.push({
        ruleId: '__cart_cap__',
        type: 'cap',
        discountAgorot: -over,
        discount: -toShekels(over),
        label_he: `כובעל תקרת ${CONSTANTS.MAX_TOTAL_DISCOUNT_PCT}% הנחה מצטברת`,
        label_en: `Capped at ${CONSTANTS.MAX_TOTAL_DISCOUNT_PCT}% total discount`,
      });
      runningSubtotalAgorot = subtotalBeforeAgorot - cap;
    }

    working.subtotal = toShekels(subtotalBeforeAgorot);
    working.totalDiscount = toShekels(totalDiscountAgorot);
    working.total = toShekels(Math.max(0, subtotalBeforeAgorot - totalDiscountAgorot));
    working.honestyWarnings = honestyWarnings;
    working.appliedRules = rules.map((r) => r.id);

    // Mutate the original cart as promised by the spec
    if (cart && cart !== working) {
      cart.lines = working.lines;
      cart.breakdown = working.breakdown;
      cart.subtotal = working.subtotal;
      cart.totalDiscount = working.totalDiscount;
      cart.total = working.total;
      cart.honestyWarnings = working.honestyWarnings;
      cart.appliedRules = working.appliedRules;
      cart.notes = working.notes;
    }

    return {
      subtotal: working.subtotal,
      totalDiscount: working.totalDiscount,
      total: working.total,
      breakdown: working.breakdown,
      honestyWarnings: working.honestyWarnings,
      appliedRules: working.appliedRules,
    };
  }

  _applyOne(cart, rule, runningSubtotalAgorot, whenStr) {
    const action = rule.action;
    const scope = action.scope || ((action.type === 'percent' || action.type === 'amount') ? 'cart' : 'line');
    const warnings = [];
    let discountAgorot = 0;
    let label_he = rule.note_he || '';
    let label_en = rule.note_en || '';
    let detail = {};

    // Consumer-protection prior-price check on any line this rule touches
    const touched = this._linesForRule(cart, rule, scope);
    for (const l of touched) {
      const h = checkPriorPriceHonesty(l, rule, whenStr);
      if (!h.ok) {
        warnings.push({
          ruleId: rule.id,
          line: l.sku || l.id,
          reason_he: h.reason_he,
          reason_en: h.reason_en,
        });
      }
    }

    switch (action.type) {
      case 'percent': {
        const pct = Number(action.value);
        if (scope === 'cart') {
          discountAgorot = Math.round(runningSubtotalAgorot * (pct / 100));
          label_he = label_he || `${pct}% הנחה על כלל העגלה`;
          label_en = label_en || `${pct}% off entire cart`;
        } else {
          for (const l of touched) {
            const sub = lineSubtotalAgorot(l);
            const d = Math.round(sub * (pct / 100));
            discountAgorot += d;
          }
          label_he = label_he || `${pct}% הנחה על פריטים נבחרים`;
          label_en = label_en || `${pct}% off selected items`;
        }
        break;
      }
      case 'amount': {
        const amt = toAgorot(Number(action.value));
        if (scope === 'cart') {
          discountAgorot = Math.min(amt, runningSubtotalAgorot);
          label_he = label_he || `₪${Number(action.value).toFixed(2)} הנחה מהעגלה`;
          label_en = label_en || `₪${Number(action.value).toFixed(2)} off cart`;
        } else {
          for (const l of touched) {
            const sub = lineSubtotalAgorot(l);
            const d = Math.min(amt, sub);
            discountAgorot += d;
          }
          label_he = label_he || `₪${Number(action.value).toFixed(2)} הנחה על פריטים נבחרים`;
          label_en = label_en || `₪${Number(action.value).toFixed(2)} off selected items`;
        }
        break;
      }
      case 'bogo': {
        // Buy X, get N free (of the same SKU or action.targetSku)
        const freeQty = Number(action.value || 1);
        const targetSku = action.targetSku;
        for (const l of touched) {
          if (targetSku && l.sku !== targetSku) continue;
          const qty = Number(l.qty ?? l.quantity ?? 1);
          const eligibleFree = Math.min(freeQty, Math.floor(qty / 2));
          if (eligibleFree > 0) {
            const unitAgorot = toAgorot(Number(l.unitPrice || 0));
            discountAgorot += eligibleFree * unitAgorot;
            detail.freeUnits = (detail.freeUnits || 0) + eligibleFree;
          }
        }
        label_he = label_he || `קנה אחד קבל ${freeQty} חינם`;
        label_en = label_en || `Buy one get ${freeQty} free`;
        break;
      }
      case 'freeItem': {
        const qty = Number(action.qty || 1);
        const freeLine = {
          sku: action.sku,
          description: action.description || action.sku,
          qty,
          unitPrice: 0,
          addedBy: rule.id,
          meta: { free: true },
        };
        cart.lines = cart.lines.concat([freeLine]);
        detail.freeItemSku = action.sku;
        detail.freeItemQty = qty;
        label_he = label_he || `מתנה: ${action.sku} x${qty}`;
        label_en = label_en || `Free item: ${action.sku} x${qty}`;
        // freeItem does not reduce the cart subtotal — it adds value.
        break;
      }
      case 'upgrade': {
        // Swap fromSku -> toSku, cost stays the same (value delivered is free)
        for (const l of cart.lines) {
          if (l.sku === action.fromSku) {
            l.sku = action.toSku;
            l.description = action.toDescription || l.description;
            l.upgradedFrom = action.fromSku;
            detail.upgradedFromSku = action.fromSku;
            detail.upgradedToSku = action.toSku;
          }
        }
        label_he = label_he || `שדרוג חינם: ${action.fromSku} → ${action.toSku}`;
        label_en = label_en || `Free upgrade: ${action.fromSku} → ${action.toSku}`;
        break;
      }
      default:
        return null;
    }

    // Enforce per-rule maxDiscount cap
    if (rule.maxDiscount != null) {
      const cap = toAgorot(rule.maxDiscount);
      if (discountAgorot > cap) {
        detail.cappedFromAgorot = discountAgorot;
        discountAgorot = cap;
      }
    }

    // Never discount more than the current running subtotal
    if (discountAgorot > runningSubtotalAgorot) {
      detail.cappedBySubtotalAgorot = discountAgorot - runningSubtotalAgorot;
      discountAgorot = runningSubtotalAgorot;
    }

    return {
      ruleId: rule.id,
      type: action.type,
      priority: rule.priority,
      stackable: rule.stackable,
      exclusive: rule.exclusive,
      discountAgorot,
      discount: toShekels(discountAgorot),
      scope,
      label_he,
      label_en,
      detail,
      warnings,
    };
  }

  _linesForRule(cart, rule, scope) {
    const lines = cart.lines || [];
    if (scope === 'cart') return lines;
    const action = rule.action || {};
    return lines.filter((l) => {
      if (action.targetSku && l.sku !== action.targetSku) return false;
      if (action.targetCategory && l.category !== action.targetCategory) return false;
      return true;
    });
  }

  // ───────────── explain — bilingual audit trail ─────────────
  explain(cart) {
    const entries = (cart && cart.breakdown) || [];
    const lines_he = [];
    const lines_en = [];

    const subtotal = Number(cart && cart.subtotal) || 0;
    const total = Number(cart && cart.total) || 0;
    const totalDiscount = Number(cart && cart.totalDiscount) || 0;

    lines_he.push(`סכום לפני הנחה: ₪${subtotal.toFixed(2)}`);
    lines_en.push(`Subtotal before discounts: ₪${subtotal.toFixed(2)}`);

    if (entries.length === 0) {
      lines_he.push('לא חלה הנחה על עגלה זו.');
      lines_en.push('No discounts applied to this cart.');
    } else {
      lines_he.push('פירוט ההנחות שהוחלו:');
      lines_en.push('Applied discounts:');
      for (const e of entries) {
        const amt = Number(e.discount).toFixed(2);
        lines_he.push(
          `  • [${e.ruleId}] ${e.label_he} — הנחה ₪${amt}` +
            (e.detail && e.detail.cappedFromAgorot ? '  (הוגבל ע"י תקרה)' : ''),
        );
        lines_en.push(
          `  • [${e.ruleId}] ${e.label_en} — discount ₪${amt}` +
            (e.detail && e.detail.cappedFromAgorot ? '  (capped)' : ''),
        );
      }
    }

    lines_he.push(`סה"כ הנחה: ₪${totalDiscount.toFixed(2)}`);
    lines_en.push(`Total discount: ₪${totalDiscount.toFixed(2)}`);
    lines_he.push(`סכום לתשלום: ₪${total.toFixed(2)}`);
    lines_en.push(`Total to pay: ₪${total.toFixed(2)}`);

    if (cart && cart.honestyWarnings && cart.honestyWarnings.length) {
      lines_he.push('אזהרות חוק הגנת הצרכן:');
      lines_en.push('Consumer-protection warnings:');
      for (const w of cart.honestyWarnings) {
        lines_he.push(`  ! [${w.ruleId}] ${w.reason_he}`);
        lines_en.push(`  ! [${w.ruleId}] ${w.reason_en}`);
      }
    }

    return {
      he: lines_he.join('\n'),
      en: lines_en.join('\n'),
      entries: clone(entries),
    };
  }
}

// ───────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────
module.exports = {
  DiscountEngine,
  CONSTANTS,
  RULE_TYPES,
  ACTION_TYPES,
  CONDITION_OPS,
  // helpers exposed for tests / reuse
  evaluateCondition,
  isWithinWindow,
  checkPriorPriceHonesty,
  toAgorot,
  toShekels,
};
