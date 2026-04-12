/**
 * onyx-procurement / src / intercompany / ic-engine.js
 * ─────────────────────────────────────────────────────────────
 * Techno-Kol Uzi — Swarm 3C / Agent X-41
 * מנוע עסקאות בין-חברתיות (Inter-Company Transaction Engine)
 *
 * Single-file, zero-dependency, bilingual (Hebrew / English) engine
 * for tracking intercompany (IC) transactions across a multi-entity
 * group such as:
 *
 *   - Techno-Kol Uzi Ltd          (parent, metal fabrication)
 *   - Techno-Kol Real Estate Ltd  (subsidiary, holds properties)
 *   - (future) Techno-Kol HR Services Ltd
 *   - (future) Techno-Kol Leasing Ltd
 *
 * Capabilities
 * ────────────
 *   1. Define legal entities and link them in a corporate hierarchy
 *   2. Record IC transactions (sales, loans, mgmt fees, rent, ...)
 *   3. Auto-generate mirror entry on the counterparty
 *   4. Reconciliation of both sides (matched / discrepancies)
 *   5. Transfer pricing checks (arm's length, cost plus, CUP, TNMM)
 *   6. Elimination entries for consolidated financials
 *   7. FX translation between entity functional currencies
 *   8. Israeli Income Tax Ordinance §85A deductibility flags
 *   9. Contemporaneous documentation requirements
 *  10. Year-end balance confirmation letters
 *
 * Rules of engagement
 * ───────────────────
 *   - Never delete existing records. Cancellations are reversals.
 *   - Zero dependencies. Pure Node / ES2019.
 *   - Bilingual labels on every public enum.
 *   - Israeli tax references are the legal baseline (§85A, etc.).
 *
 * This file is deliberately long and explicit so the numbers behind
 * every IC posting can be traced for an ITA audit without a debugger.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// 0. Constants / bilingual labels
// ─────────────────────────────────────────────────────────────────────

const VERSION = '1.0.0-X41';

const ENTITY_TYPES = Object.freeze({
  PARENT:       'parent',
  SUBSIDIARY:   'subsidiary',
  BRANCH:       'branch',
  JOINT:        'joint_venture',
  ASSOCIATE:    'associate',
});

const ENTITY_TYPE_LABELS = Object.freeze({
  parent:        { he: 'חברת אם',            en: 'Parent' },
  subsidiary:    { he: 'חברת בת',            en: 'Subsidiary' },
  branch:        { he: 'סניף',                en: 'Branch' },
  joint_venture: { he: 'מיזם משותף',         en: 'Joint Venture' },
  associate:     { he: 'חברה כלולה',         en: 'Associate' },
});

const TX_TYPES = Object.freeze({
  SALE_GOODS:   'sale_goods',
  SALE_SERVICE: 'sale_service',
  MGMT_FEE:     'management_fee',
  LOAN_PRINCIPAL: 'loan_principal',
  LOAN_INTEREST:  'loan_interest',
  RENT:         'rent',
  ROYALTY:      'royalty',
  COST_SHARE:   'cost_sharing',
  DIVIDEND:     'dividend',
  CAPITAL_INJECTION: 'capital_injection',
  REIMBURSEMENT:     'reimbursement',
});

const TX_TYPE_LABELS = Object.freeze({
  sale_goods:        { he: 'מכירת טובין',      en: 'Sale of goods' },
  sale_service:      { he: 'מכירת שירותים',    en: 'Sale of services' },
  management_fee:    { he: 'דמי ניהול',        en: 'Management fee' },
  loan_principal:    { he: 'קרן הלוואה',       en: 'Loan principal' },
  loan_interest:     { he: 'ריבית הלוואה',     en: 'Loan interest' },
  rent:              { he: 'שכר דירה',         en: 'Rent' },
  royalty:           { he: 'תמלוגים',          en: 'Royalty' },
  cost_sharing:      { he: 'חלוקת עלויות',     en: 'Cost sharing' },
  dividend:          { he: 'דיבידנד',          en: 'Dividend' },
  capital_injection: { he: 'הזרמת הון',        en: 'Capital injection' },
  reimbursement:     { he: 'החזר הוצאות',      en: 'Reimbursement' },
});

const TX_STATUS = Object.freeze({
  DRAFT:     'draft',
  POSTED:    'posted',
  MATCHED:   'matched',
  DISPUTED:  'disputed',
  REVERSED:  'reversed',
  ELIMINATED:'eliminated',
});

const TP_METHODS = Object.freeze({
  CUP:   'CUP',    // Comparable Uncontrolled Price
  COST_PLUS: 'CP', // Cost Plus
  RPM:   'RPM',   // Resale Price Method
  TNMM:  'TNMM',  // Transactional Net Margin
  PSM:   'PSM',   // Profit Split Method
  SAFE_HARBOR: 'SH',
});

const TP_METHOD_LABELS = Object.freeze({
  CUP:  { he: 'שיטת השוואת מחיר בלתי מבוקר',   en: 'Comparable Uncontrolled Price' },
  CP:   { he: 'שיטת עלות פלוס',                en: 'Cost Plus' },
  RPM:  { he: 'שיטת מחיר המכירה מחדש',         en: 'Resale Price' },
  TNMM: { he: 'שיטת הרווח התפעולי נטו',        en: 'Transactional Net Margin' },
  PSM:  { he: 'שיטת חלוקת הרווח',              en: 'Profit Split' },
  SH:   { he: 'נמל מבטחים',                    en: 'Safe Harbor' },
});

// Israeli §85A thresholds (ILS). Source: Income Tax Ordinance [new] §85A
// + regs. Values are the current baseline; the caller may override them
// at runtime via setComplianceThresholds() if the Tax Authority updates.
const DEFAULT_COMPLIANCE = Object.freeze({
  // Master file + local file required if consolidated group revenue
  // exceeds this.
  MASTER_FILE_REV_ILS: 150_000_000,
  // CbCR (Country-by-Country) required if consolidated group revenue
  // exceeds this (approx NIS 3.4B per current §85B regs).
  CBCR_REV_ILS: 3_400_000_000,
  // Currently-accepted arm's-length range for ILS loans (annual).
  // The Tax Authority periodically publishes a safe-harbor rate; we
  // default to a 5% mid-point with a ±150bp tolerance band.
  LOAN_RATE_MIN: 0.035,
  LOAN_RATE_MID: 0.050,
  LOAN_RATE_MAX: 0.065,
  // Minimum cost-plus markup for routine services (G&A, back-office).
  MIN_SERVICE_MARKUP: 0.05,
  // Cost-plus markup typically accepted by ITA for low-value-adding
  // intra-group services (OECD TPG Ch. VII).
  LVA_MARKUP: 0.05,
  // Range accepted for routine manufacturing / distribution.
  TNMM_ROS_MIN: 0.02,
  TNMM_ROS_MAX: 0.10,
  // Docs must be contemporaneous and produced within X days of request.
  DOC_RESPONSE_DAYS: 60,
});

const DOC_REQ = Object.freeze({
  NONE:        'none',
  LIGHT:       'light',
  LOCAL_FILE:  'local_file',
  FULL_TP:     'full_tp',   // local file + master file
});

// ─────────────────────────────────────────────────────────────────────
// 1. Internal stores (in-memory; caller is free to persist externally)
// ─────────────────────────────────────────────────────────────────────

function createStore() {
  return {
    entities:     new Map(),           // id -> entity
    relations:    [],                  // [{parentId, childId, pct, since}]
    transactions: new Map(),           // id -> tx
    fxRates:      new Map(),           // "USD-ILS-2026-04-01" -> rate
    confirmations:new Map(),           // period -> [{entityA, entityB, ...}]
    audit:        [],                  // append-only audit log
    compliance:   Object.assign({}, DEFAULT_COMPLIANCE),
    _seq:         0,
  };
}

// A single module-level store used by the default exported functions.
// Consumers who want isolation can call `createEngine()` instead.
const _defaultStore = createStore();

// ─────────────────────────────────────────────────────────────────────
// 2. Helpers: id / clone / money / date
// ─────────────────────────────────────────────────────────────────────

function _nextId(store, prefix) {
  store._seq += 1;
  const t = Date.now().toString(36);
  const n = store._seq.toString(36).padStart(4, '0');
  return `${prefix}-${t}-${n}`;
}

function _now() { return new Date(); }

function _iso(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function _period(dateish) {
  const dt = (dateish instanceof Date) ? dateish : new Date(dateish);
  if (isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function _round(x, dp) {
  const p = Math.pow(10, dp == null ? 2 : dp);
  return Math.round((Number(x) + Number.EPSILON) * p) / p;
}

function _money(x) { return _round(x, 2); }

function _clone(o) {
  if (o == null) return o;
  if (o instanceof Date) return new Date(o.getTime());
  if (Array.isArray(o)) return o.map(_clone);
  if (typeof o === 'object') {
    const out = {};
    for (const k of Object.keys(o)) out[k] = _clone(o[k]);
    return out;
  }
  return o;
}

function _audit(store, action, ref, payload) {
  store.audit.push({
    at: _iso(_now()),
    action,
    ref,
    payload: _clone(payload || null),
  });
}

function _require(val, msg) {
  if (val == null || val === '') {
    const e = new Error(msg || 'missing required field');
    e.code = 'IC_INVALID';
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 3. Entities and hierarchy
// ─────────────────────────────────────────────────────────────────────

function defineEntity(entity, store) {
  store = store || _defaultStore;
  _require(entity, 'entity object required');
  _require(entity.name, 'entity.name required');

  const type = entity.type || ENTITY_TYPES.SUBSIDIARY;
  if (!Object.values(ENTITY_TYPES).includes(type)) {
    const e = new Error('invalid entity type: ' + type);
    e.code = 'IC_INVALID';
    throw e;
  }

  const id = entity.id || _nextId(store, 'ent');
  if (store.entities.has(id)) {
    const e = new Error('entity already exists: ' + id);
    e.code = 'IC_DUP';
    throw e;
  }

  const rec = {
    id,
    name:          entity.name,
    nameHe:        entity.nameHe || entity.name,
    type,
    typeLabel:     ENTITY_TYPE_LABELS[type],
    taxId:         entity.taxId || null,         // ח.פ (IL company ID)
    country:       entity.country || 'IL',
    functionalCcy: entity.functionalCcy || 'ILS',
    active:        entity.active !== false,
    incorporated:  _iso(entity.incorporated || _now()),
    createdAt:     _iso(_now()),
    meta:          _clone(entity.meta || {}),
  };

  store.entities.set(id, rec);
  _audit(store, 'entity.define', id, rec);
  return id;
}

function linkEntities(parentId, childId, pct, store) {
  store = store || _defaultStore;
  _require(parentId, 'parentId required');
  _require(childId, 'childId required');

  if (!store.entities.has(parentId)) {
    const e = new Error('parent not found: ' + parentId);
    e.code = 'IC_NOT_FOUND'; throw e;
  }
  if (!store.entities.has(childId)) {
    const e = new Error('child not found: ' + childId);
    e.code = 'IC_NOT_FOUND'; throw e;
  }
  if (parentId === childId) {
    const e = new Error('an entity cannot own itself');
    e.code = 'IC_INVALID'; throw e;
  }
  if (_wouldCreateCycle(store, parentId, childId)) {
    const e = new Error('circular ownership detected');
    e.code = 'IC_CYCLE'; throw e;
  }

  const ownership = Number(pct);
  if (!isFinite(ownership) || ownership < 0 || ownership > 100) {
    const e = new Error('pct must be 0..100');
    e.code = 'IC_INVALID'; throw e;
  }

  const rel = {
    parentId,
    childId,
    pct: _round(ownership, 4),
    since: _iso(_now()),
  };
  store.relations.push(rel);
  _audit(store, 'relation.link', `${parentId}->${childId}`, rel);
  return _clone(rel);
}

function _wouldCreateCycle(store, parentId, childId) {
  // If adding parent -> child would create a cycle, it means child
  // already (transitively) owns parent.
  const ancestors = new Set();
  const stack = [parentId];
  while (stack.length) {
    const cur = stack.pop();
    for (const r of store.relations) {
      if (r.childId === cur) {
        if (r.parentId === childId) return true;
        if (!ancestors.has(r.parentId)) {
          ancestors.add(r.parentId);
          stack.push(r.parentId);
        }
      }
    }
  }
  return false;
}

function listEntities(store) {
  store = store || _defaultStore;
  return Array.from(store.entities.values()).map(_clone);
}

function getEntity(id, store) {
  store = store || _defaultStore;
  const e = store.entities.get(id);
  return e ? _clone(e) : null;
}

function getHierarchy(rootId, store) {
  store = store || _defaultStore;
  if (!store.entities.has(rootId)) return null;

  function buildNode(id) {
    const ent = _clone(store.entities.get(id));
    ent.children = store.relations
      .filter(r => r.parentId === id)
      .map(r => ({
        rel: { pct: r.pct, since: r.since },
        node: buildNode(r.childId),
      }));
    return ent;
  }
  return buildNode(rootId);
}

// ─────────────────────────────────────────────────────────────────────
// 4. FX rates
// ─────────────────────────────────────────────────────────────────────

function setFxRate(from, to, date, rate, store) {
  store = store || _defaultStore;
  _require(from, 'from currency');
  _require(to, 'to currency');
  _require(rate, 'rate');
  const d = (date instanceof Date) ? date : new Date(date || _now());
  const key = `${from}-${to}-${d.toISOString().slice(0, 10)}`;
  store.fxRates.set(key, Number(rate));
  _audit(store, 'fx.set', key, { rate });
  return key;
}

function getFxRate(from, to, date, store) {
  store = store || _defaultStore;
  if (from === to) return 1;
  const d = (date instanceof Date) ? date : new Date(date || _now());
  const key = `${from}-${to}-${d.toISOString().slice(0, 10)}`;
  if (store.fxRates.has(key)) return store.fxRates.get(key);
  // Fall back to latest rate on or before that date.
  const prefix = `${from}-${to}-`;
  let best = null, bestDate = null;
  for (const [k, v] of store.fxRates.entries()) {
    if (!k.startsWith(prefix)) continue;
    const kd = k.slice(prefix.length);
    if (kd <= d.toISOString().slice(0, 10)) {
      if (bestDate == null || kd > bestDate) { best = v; bestDate = kd; }
    }
  }
  if (best != null) return best;
  // Try inverse rate.
  const invPrefix = `${to}-${from}-`;
  for (const [k, v] of store.fxRates.entries()) {
    if (!k.startsWith(invPrefix)) continue;
    const kd = k.slice(invPrefix.length);
    if (kd <= d.toISOString().slice(0, 10)) {
      return 1 / v;
    }
  }
  return null;
}

function translateAmount(amount, from, to, date, store) {
  if (from === to) return _money(amount);
  const rate = getFxRate(from, to, date, store);
  if (rate == null) {
    const e = new Error(`no FX rate ${from}->${to} for ${date}`);
    e.code = 'IC_NO_FX';
    throw e;
  }
  return _money(Number(amount) * rate);
}

// ─────────────────────────────────────────────────────────────────────
// 5. Transfer pricing checks
// ─────────────────────────────────────────────────────────────────────

/**
 * Evaluate whether a proposed IC transaction complies with §85A
 * (arm's length principle) based on type, amount, and inputs.
 *
 * Returns { compliant, method, issues[], deductible, docRequirement }
 */
function evaluateTransferPricing(tx, store) {
  store = store || _defaultStore;
  const c = store.compliance;
  const out = {
    compliant: true,
    method: null,
    issues: [],
    deductible: true,
    docRequirement: DOC_REQ.LIGHT,
    section85A: true,
  };

  switch (tx.type) {
    case TX_TYPES.SALE_GOODS: {
      out.method = tx.tpMethod || TP_METHODS.CUP;
      if (tx.cost != null) {
        const markup = (tx.amount - tx.cost) / tx.cost;
        if (markup < c.MIN_SERVICE_MARKUP) {
          out.compliant = false;
          out.issues.push({
            code: 'TP_LOW_MARKUP',
            he: 'שיעור רווח נמוך מדי לעסקת טובין',
            en: 'Markup below arm\'s length for goods sale',
            value: _round(markup, 4),
            threshold: c.MIN_SERVICE_MARKUP,
          });
        }
      }
      out.docRequirement = DOC_REQ.LOCAL_FILE;
      break;
    }
    case TX_TYPES.SALE_SERVICE:
    case TX_TYPES.MGMT_FEE: {
      out.method = tx.tpMethod || TP_METHODS.COST_PLUS;
      if (tx.cost != null) {
        const markup = (tx.amount - tx.cost) / tx.cost;
        const min = tx.lowValueAdding ? c.LVA_MARKUP : c.MIN_SERVICE_MARKUP;
        if (markup < min) {
          out.compliant = false;
          out.issues.push({
            code: 'TP_LOW_MARKUP',
            he: 'מרווח מתחת לטווח זרוע הארוכה לשירותים',
            en: 'Markup below arm\'s length for services',
            value: _round(markup, 4),
            threshold: min,
          });
        }
      } else {
        out.issues.push({
          code: 'TP_NO_COST',
          he: 'חסר בסיס עלות לעסקת שירות - לא ניתן לבדוק מרווח',
          en: 'No cost base provided - cannot verify markup',
        });
      }
      out.docRequirement = DOC_REQ.LOCAL_FILE;
      break;
    }
    case TX_TYPES.LOAN_INTEREST: {
      out.method = tx.tpMethod || TP_METHODS.CUP;
      const rate = Number(tx.rate);
      if (!isFinite(rate)) {
        out.compliant = false;
        out.issues.push({
          code: 'TP_LOAN_NO_RATE',
          he: 'הלוואה בין-חברתית ללא שיעור ריבית - ייוחס ריבית רעיונית',
          en: 'IC loan without stated rate — deemed interest will apply',
        });
      } else {
        if (rate < c.LOAN_RATE_MIN) {
          out.compliant = false;
          out.issues.push({
            code: 'TP_LOAN_LOW',
            he: 'ריבית הלוואה נמוכה מהטווח המקובל',
            en: 'Loan rate below accepted range',
            value: rate,
            threshold: c.LOAN_RATE_MIN,
          });
        } else if (rate > c.LOAN_RATE_MAX) {
          out.compliant = false;
          out.issues.push({
            code: 'TP_LOAN_HIGH',
            he: 'ריבית הלוואה גבוהה מהטווח המקובל',
            en: 'Loan rate above accepted range',
            value: rate,
            threshold: c.LOAN_RATE_MAX,
          });
        }
      }
      out.docRequirement = DOC_REQ.LOCAL_FILE;
      break;
    }
    case TX_TYPES.RENT: {
      out.method = tx.tpMethod || TP_METHODS.CUP;
      if (tx.marketRent != null) {
        const diff = Math.abs(tx.amount - tx.marketRent) / tx.marketRent;
        if (diff > 0.15) {
          out.compliant = false;
          out.issues.push({
            code: 'TP_RENT_OFF',
            he: 'שכר דירה חורג מ-15% מהערך השוק',
            en: 'Rent deviates more than 15% from market',
            value: _round(diff, 4),
          });
        }
      } else {
        out.issues.push({
          code: 'TP_NO_MARKET_RENT',
          he: 'חסרה הערכת שכ"ד שוק להשוואה',
          en: 'No market rent benchmark provided',
        });
      }
      out.docRequirement = DOC_REQ.LOCAL_FILE;
      break;
    }
    case TX_TYPES.COST_SHARE: {
      out.method = tx.tpMethod || TP_METHODS.PSM;
      if (tx.allocationKey == null) {
        out.compliant = false;
        out.issues.push({
          code: 'TP_NO_KEY',
          he: 'חסר מפתח הקצאה לעלות חלוקה',
          en: 'Missing allocation key for cost sharing',
        });
      }
      out.docRequirement = DOC_REQ.LOCAL_FILE;
      break;
    }
    case TX_TYPES.DIVIDEND: {
      // Dividends between Israeli resident companies are generally
      // tax-exempt per §126(b). Still require documentation.
      out.method = TP_METHODS.SAFE_HARBOR;
      out.deductible = false;
      out.docRequirement = DOC_REQ.LIGHT;
      out.section85A = false;
      break;
    }
    case TX_TYPES.CAPITAL_INJECTION: {
      out.method = TP_METHODS.SAFE_HARBOR;
      out.deductible = false;
      out.docRequirement = DOC_REQ.LIGHT;
      out.section85A = false;
      break;
    }
    case TX_TYPES.LOAN_PRINCIPAL:
    case TX_TYPES.REIMBURSEMENT: {
      // Principal movements and pure reimbursements don't hit P&L.
      out.method = TP_METHODS.SAFE_HARBOR;
      out.deductible = false;
      out.docRequirement = DOC_REQ.LIGHT;
      break;
    }
    case TX_TYPES.ROYALTY: {
      out.method = tx.tpMethod || TP_METHODS.CUP;
      out.docRequirement = DOC_REQ.LOCAL_FILE;
      break;
    }
    default:
      out.issues.push({
        code: 'TP_UNKNOWN_TYPE',
        he: 'סוג עסקה לא מוכר',
        en: 'Unknown transaction type',
      });
      out.compliant = false;
  }

  // Documentation rule: if compliance band breached AND no docs,
  // deductibility is denied for tax purposes.
  if (!out.compliant && !tx.documentation) {
    out.deductible = false;
    out.issues.push({
      code: 'TP_NO_DOCS',
      he: 'אין תיעוד חוזי/כלכלי - ההוצאה לא תותר בניכוי',
      en: 'No contemporaneous documentation — expense disallowed',
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 6. Core IC transaction recording (+ auto-mirror)
// ─────────────────────────────────────────────────────────────────────

function recordICTransaction(input, store) {
  store = store || _defaultStore;
  _require(input, 'tx input');
  _require(input.from, 'tx.from (source entity)');
  _require(input.to,   'tx.to (destination entity)');
  _require(input.type, 'tx.type');
  _require(input.amount, 'tx.amount');

  if (input.from === input.to) {
    const e = new Error('from and to cannot be the same entity');
    e.code = 'IC_INVALID'; throw e;
  }
  if (!store.entities.has(input.from)) {
    const e = new Error('unknown from entity: ' + input.from);
    e.code = 'IC_NOT_FOUND'; throw e;
  }
  if (!store.entities.has(input.to)) {
    const e = new Error('unknown to entity: ' + input.to);
    e.code = 'IC_NOT_FOUND'; throw e;
  }
  if (!Object.values(TX_TYPES).includes(input.type)) {
    const e = new Error('invalid tx type: ' + input.type);
    e.code = 'IC_INVALID'; throw e;
  }
  const amount = Number(input.amount);
  if (!isFinite(amount) || amount <= 0) {
    const e = new Error('amount must be positive number');
    e.code = 'IC_INVALID'; throw e;
  }

  const fromEnt = store.entities.get(input.from);
  const toEnt   = store.entities.get(input.to);
  const currency = input.currency || fromEnt.functionalCcy;
  const txDate = input.date ? new Date(input.date) : _now();

  // Transfer pricing pre-check
  const tp = evaluateTransferPricing({
    type: input.type,
    amount,
    cost: input.cost,
    rate: input.rate,
    marketRent: input.marketRent,
    lowValueAdding: input.lowValueAdding,
    allocationKey: input.allocationKey,
    documentation: input.documentation,
    tpMethod: input.tpMethod,
  }, store);

  const pairKey = _pairKey(input.from, input.to);
  const id = _nextId(store, 'ictx');

  const base = {
    id,
    pairKey,
    type: input.type,
    typeLabel: TX_TYPE_LABELS[input.type],
    from: input.from,
    to: input.to,
    fromName: fromEnt.name,
    toName: toEnt.name,
    currency,
    amount: _money(amount),
    date: _iso(txDate),
    period: _period(txDate),
    description: input.description || '',
    descriptionHe: input.descriptionHe || '',
    status: TX_STATUS.POSTED,
    documentation: !!input.documentation,
    documentationRef: input.documentationRef || null,
    tp,
    cost: input.cost != null ? _money(input.cost) : null,
    rate: input.rate != null ? Number(input.rate) : null,
    marketRent: input.marketRent != null ? _money(input.marketRent) : null,
    allocationKey: input.allocationKey || null,
    tpMethod: tp.method,
    mirrorOf: null,
    side: 'from',
    createdAt: _iso(_now()),
    meta: _clone(input.meta || {}),
  };

  // FX translation fields — amounts in both entities' functional ccy.
  base.amountFrom = (currency === fromEnt.functionalCcy)
    ? base.amount
    : _tryTranslate(amount, currency, fromEnt.functionalCcy, txDate, store);
  base.amountTo = (currency === toEnt.functionalCcy)
    ? base.amount
    : _tryTranslate(amount, currency, toEnt.functionalCcy, txDate, store);

  store.transactions.set(id, base);

  // Auto-mirror entry (counterparty side)
  const mirror = _clone(base);
  mirror.id = _nextId(store, 'ictx');
  mirror.side = 'to';
  mirror.mirrorOf = base.id;
  // Flip sign semantics: the counterparty sees the opposite direction.
  mirror.from = input.to;
  mirror.to = input.from;
  mirror.fromName = toEnt.name;
  mirror.toName = fromEnt.name;
  mirror.amountFrom = base.amountTo;
  mirror.amountTo = base.amountFrom;
  store.transactions.set(mirror.id, mirror);
  base.mirrorId = mirror.id;

  _audit(store, 'ictx.record', id, { id, mirrorId: mirror.id });
  return id;
}

function _tryTranslate(amount, from, to, date, store) {
  try { return translateAmount(amount, from, to, date, store); }
  catch (err) { return null; }
}

function _pairKey(a, b) {
  return [a, b].sort().join('~');
}

function getTransaction(id, store) {
  store = store || _defaultStore;
  const tx = store.transactions.get(id);
  return tx ? _clone(tx) : null;
}

function listTransactions(filter, store) {
  store = store || _defaultStore;
  filter = filter || {};
  const out = [];
  for (const tx of store.transactions.values()) {
    if (filter.entity && tx.from !== filter.entity && tx.to !== filter.entity) continue;
    if (filter.type && tx.type !== filter.type) continue;
    if (filter.period && tx.period !== filter.period) continue;
    if (filter.status && tx.status !== filter.status) continue;
    if (filter.side && tx.side !== filter.side) continue;
    out.push(_clone(tx));
  }
  return out;
}

function reverseTransaction(id, reason, store) {
  store = store || _defaultStore;
  const tx = store.transactions.get(id);
  if (!tx) {
    const e = new Error('tx not found: ' + id);
    e.code = 'IC_NOT_FOUND'; throw e;
  }
  if (tx.status === TX_STATUS.REVERSED) return null;

  // Never delete — create an opposite-signed tx and flag both.
  const rev = recordICTransaction({
    from: tx.to,   // swap direction
    to:   tx.from,
    type: tx.type,
    amount: tx.amount,
    currency: tx.currency,
    date: _now(),
    description: `Reversal of ${tx.id}: ${reason || ''}`,
    descriptionHe: `ביטול של ${tx.id}: ${reason || ''}`,
    documentation: tx.documentation,
  }, store);
  tx.status = TX_STATUS.REVERSED;
  tx.reversedBy = rev;
  if (tx.mirrorId && store.transactions.has(tx.mirrorId)) {
    store.transactions.get(tx.mirrorId).status = TX_STATUS.REVERSED;
  }
  _audit(store, 'ictx.reverse', id, { reversedBy: rev, reason });
  return rev;
}

// ─────────────────────────────────────────────────────────────────────
// 7. Reconciliation
// ─────────────────────────────────────────────────────────────────────

/**
 * Reconcile two entities for a given period.
 *
 * Every "from-side" posting must have a matching "to-side" mirror
 * whose amount agrees after FX translation. Any mismatch is reported
 * as a discrepancy with a code + bilingual message.
 */
function reconcile(entityA, entityB, period, store) {
  store = store || _defaultStore;
  _require(entityA, 'entityA');
  _require(entityB, 'entityB');

  // Collect primary-side postings that involve this pair. Each primary
  // posting should have a mirror entry on the counterparty side.
  // Orphan mirrors (primary missing) are flagged separately.
  const primaries = [];
  const seenMirrorIds = new Set();
  for (const tx of store.transactions.values()) {
    if (period && tx.period !== period) continue;
    const involves =
      (tx.from === entityA && tx.to === entityB) ||
      (tx.from === entityB && tx.to === entityA);
    if (!involves) continue;
    if (tx.side === 'from') {
      primaries.push(tx);
      if (tx.mirrorId) seenMirrorIds.add(tx.mirrorId);
    }
  }

  const matched = [];
  const discrepancies = [];

  for (const p of primaries) {
    const mirror = p.mirrorId ? store.transactions.get(p.mirrorId) : null;
    if (!mirror) {
      discrepancies.push({
        code: 'REC_UNMATCHED',
        he: 'עסקה חד-צדדית ללא רישום מקביל',
        en: 'Unmatched one-sided transaction',
        txId: p.id,
      });
      continue;
    }
    // Ensure the mirror is still on the counterparty side.
    const mirrorOk =
      (mirror.from === (p.from === entityA ? entityB : entityA)) &&
      (mirror.to === p.from);
    if (!mirrorOk) {
      discrepancies.push({
        code: 'REC_DIRECTION',
        he: 'כיוון המראה אינו תואם',
        en: 'Mirror direction mismatch',
        txId: p.id,
        mirrorId: mirror.id,
      });
      continue;
    }

    const pVal = p.amount;
    const mVal = mirror.amount;
    if (Math.abs(pVal - mVal) > 0.01) {
      discrepancies.push({
        code: 'REC_AMOUNT',
        he: 'סכום אינו תואם בין שני הצדדים',
        en: 'Amount mismatch between two sides',
        txId: p.id,
        mirrorId: mirror.id,
        delta: _money(pVal - mVal),
      });
    } else if (p.currency !== mirror.currency) {
      discrepancies.push({
        code: 'REC_CCY',
        he: 'מטבע אינו תואם בין שני הצדדים',
        en: 'Currency mismatch',
        txId: p.id,
        mirrorId: mirror.id,
      });
    } else {
      matched.push({ txId: p.id, mirrorId: mirror.id, amount: pVal });
      p.status = TX_STATUS.MATCHED;
      mirror.status = TX_STATUS.MATCHED;
    }
  }

  // Orphan "to" side postings (mirror exists, no primary found in this set)
  for (const tx of store.transactions.values()) {
    if (period && tx.period !== period) continue;
    if (tx.side !== 'to') continue;
    const involves =
      (tx.from === entityA && tx.to === entityB) ||
      (tx.from === entityB && tx.to === entityA);
    if (!involves) continue;
    // Was this mirror already matched to its primary?
    if (seenMirrorIds.has(tx.id)) continue;
    // If the primary is also in the store and was processed, skip.
    const primaryStillExists = tx.mirrorOf && store.transactions.has(tx.mirrorOf);
    if (primaryStillExists) continue;
    discrepancies.push({
      code: 'REC_UNMATCHED',
      he: 'רישום מראה יתום - חסר רישום ראשי',
      en: 'Orphan mirror entry - primary missing',
      txId: tx.id,
    });
  }

  const result = {
    entityA, entityB, period: period || 'ALL',
    matched, discrepancies,
    matchedCount: matched.length,
    discrepancyCount: discrepancies.length,
    clean: discrepancies.length === 0,
  };
  _audit(store, 'reconcile', `${entityA}~${entityB}`, {
    matched: matched.length, issues: discrepancies.length,
  });
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// 8. Elimination entries (for consolidated financial statements)
// ─────────────────────────────────────────────────────────────────────

/**
 * Generate elimination JVs for all IC balances in a period.
 * The consolidation agent (X-42) consumes these to remove
 * intra-group revenue / expense / receivables / payables.
 *
 * Returns an array of journal-entry objects with Dr/Cr lines.
 */
function generateEliminations(period, store) {
  store = store || _defaultStore;
  const out = [];

  // Bucket by (pair, type) so multiple postings within a period roll up.
  const buckets = new Map();
  for (const tx of store.transactions.values()) {
    if (tx.side !== 'from') continue;                 // only primary side
    if (tx.status === TX_STATUS.REVERSED) continue;
    if (period && tx.period !== period) continue;
    const key = `${tx.from}|${tx.to}|${tx.type}|${tx.currency}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(tx);
  }

  for (const [key, txs] of buckets.entries()) {
    const total = txs.reduce((s, t) => s + t.amount, 0);
    const first = txs[0];
    const { drAccount, crAccount, label } = _eliminationAccounts(first.type);
    const entry = {
      id: _nextId(store, 'elim'),
      period: period || first.period,
      pair: `${first.fromName} -> ${first.toName}`,
      pairIds: [first.from, first.to],
      txType: first.type,
      currency: first.currency,
      lines: [
        {
          dr: _money(total), cr: 0,
          account: drAccount.code,
          accountLabel: drAccount.label,
          desc: `Eliminate ${label.en}`, descHe: `סילוק ${label.he}`,
        },
        {
          dr: 0, cr: _money(total),
          account: crAccount.code,
          accountLabel: crAccount.label,
          desc: `Eliminate ${label.en}`, descHe: `סילוק ${label.he}`,
        },
      ],
      totalEliminated: _money(total),
      basedOn: txs.map(t => t.id),
    };
    // Mark source txs as eliminated in consolidation (non-destructive).
    for (const t of txs) t.consolidationStatus = TX_STATUS.ELIMINATED;
    out.push(entry);
  }
  _audit(store, 'elim.generate', period || 'ALL', { count: out.length });
  return out;
}

function _eliminationAccounts(type) {
  // Simplified IL CoA chart — metal fab group.
  // DR side removes the P&L / BS item on one company,
  // CR side removes the counterparty item on the other.
  const label = TX_TYPE_LABELS[type] || { he: type, en: type };
  switch (type) {
    case TX_TYPES.SALE_GOODS:
    case TX_TYPES.SALE_SERVICE:
      return {
        drAccount: { code: '4000', label: 'Revenue - IC' },
        crAccount: { code: '5000', label: 'COGS - IC' },
        label,
      };
    case TX_TYPES.MGMT_FEE:
      return {
        drAccount: { code: '4100', label: 'Mgmt Fee Income - IC' },
        crAccount: { code: '6100', label: 'Mgmt Fee Expense - IC' },
        label,
      };
    case TX_TYPES.RENT:
      return {
        drAccount: { code: '4200', label: 'Rental Income - IC' },
        crAccount: { code: '6200', label: 'Rent Expense - IC' },
        label,
      };
    case TX_TYPES.LOAN_INTEREST:
      return {
        drAccount: { code: '4300', label: 'Interest Income - IC' },
        crAccount: { code: '6300', label: 'Interest Expense - IC' },
        label,
      };
    case TX_TYPES.LOAN_PRINCIPAL:
      return {
        drAccount: { code: '1500', label: 'IC Loans Payable' },
        crAccount: { code: '1200', label: 'IC Loans Receivable' },
        label,
      };
    case TX_TYPES.DIVIDEND:
      return {
        drAccount: { code: '4400', label: 'Dividend Income - IC' },
        crAccount: { code: '3100', label: 'Retained Earnings' },
        label,
      };
    case TX_TYPES.ROYALTY:
      return {
        drAccount: { code: '4500', label: 'Royalty Income - IC' },
        crAccount: { code: '6500', label: 'Royalty Expense - IC' },
        label,
      };
    case TX_TYPES.COST_SHARE:
    case TX_TYPES.REIMBURSEMENT:
      return {
        drAccount: { code: '4600', label: 'Recharges Income - IC' },
        crAccount: { code: '6600', label: 'Recharges Expense - IC' },
        label,
      };
    case TX_TYPES.CAPITAL_INJECTION:
      return {
        drAccount: { code: '3200', label: 'Investment in Subsidiary' },
        crAccount: { code: '3000', label: 'Share Capital' },
        label,
      };
    default:
      return {
        drAccount: { code: '9998', label: 'IC Suspense Dr' },
        crAccount: { code: '9999', label: 'IC Suspense Cr' },
        label,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────
// 9. Transfer pricing report (for ITA)
// ─────────────────────────────────────────────────────────────────────

/**
 * Produce a transfer-pricing master document for a period:
 *   - entity list and relationships
 *   - IC transactions grouped by type and pair
 *   - compliance status
 *   - documentation coverage
 *   - filing obligation (master file / local file / CbCR)
 *
 * Output is serialisable — the calling pipeline can render it as PDF
 * or XML for ITA submission under §85A.
 */
function transferPricingReport(period, store) {
  store = store || _defaultStore;
  const c = store.compliance;

  const txsInPeriod = Array.from(store.transactions.values())
    .filter(t => t.side === 'from' && (!period || t.period === period));

  // Aggregate by pair + type
  const grouped = {};
  let totalGroupIC = 0;
  const nonCompliant = [];
  const docsMissing = [];

  for (const t of txsInPeriod) {
    if (t.status === TX_STATUS.REVERSED) continue;
    const key = `${t.from}~${t.to}~${t.type}`;
    if (!grouped[key]) {
      grouped[key] = {
        from: t.from, to: t.to, type: t.type,
        typeLabel: t.typeLabel,
        count: 0, total: 0,
        compliant: true, issues: [],
      };
    }
    grouped[key].count += 1;
    grouped[key].total += t.amount;
    totalGroupIC += t.amount;
    if (t.tp && !t.tp.compliant) {
      grouped[key].compliant = false;
      grouped[key].issues.push(...(t.tp.issues || []));
      nonCompliant.push({ txId: t.id, issues: t.tp.issues });
    }
    if (t.tp && (t.tp.docRequirement === DOC_REQ.LOCAL_FILE
             || t.tp.docRequirement === DOC_REQ.FULL_TP)
        && !t.documentation) {
      docsMissing.push(t.id);
    }
  }

  for (const k of Object.keys(grouped)) grouped[k].total = _money(grouped[k].total);

  // Group revenue across all entities (for threshold checks)
  const groupRevenueILS = _estimateGroupRevenue(store, period);

  const obligation = {
    localFile:  groupRevenueILS >= c.MASTER_FILE_REV_ILS,
    masterFile: groupRevenueILS >= c.MASTER_FILE_REV_ILS,
    cbcr:       groupRevenueILS >= c.CBCR_REV_ILS,
    thresholdILS: {
      localFile: c.MASTER_FILE_REV_ILS,
      cbcr: c.CBCR_REV_ILS,
    },
    groupRevenueILS,
  };

  const report = {
    generatedAt: _iso(_now()),
    engineVersion: VERSION,
    period: period || 'ALL',
    reportingEntity: _pickReportingEntity(store),
    entities: Array.from(store.entities.values()).map(e => ({
      id: e.id, name: e.name, nameHe: e.nameHe,
      taxId: e.taxId, country: e.country, type: e.type,
      functionalCcy: e.functionalCcy,
    })),
    relationships: _clone(store.relations),
    totalICVolume: _money(totalGroupIC),
    groups: Object.values(grouped),
    nonCompliantCount: nonCompliant.length,
    nonCompliantTransactions: nonCompliant,
    documentationMissing: docsMissing,
    complianceThresholds: _clone(c),
    filingObligation: obligation,
    legalBasis: {
      primary: 'Income Tax Ordinance §85A',
      secondary: [
        'Income Tax Regulations (Determination of Market Conditions), 2006',
        'OECD Transfer Pricing Guidelines 2022',
      ],
      he: {
        primary: 'פקודת מס הכנסה סעיף 85א',
      },
    },
    signatureBlock: {
      preparedBy: null,
      approvedBy: null,
      preparedAt: _iso(_now()),
    },
  };
  _audit(store, 'tp.report', period || 'ALL', {
    txCount: txsInPeriod.length, nonCompliant: nonCompliant.length,
  });
  return report;
}

function _pickReportingEntity(store) {
  // Heuristic: pick the parent with most children.
  const childCount = new Map();
  for (const r of store.relations) {
    childCount.set(r.parentId, (childCount.get(r.parentId) || 0) + 1);
  }
  let best = null, bestN = -1;
  for (const [id, n] of childCount.entries()) {
    if (n > bestN) { bestN = n; best = id; }
  }
  if (best == null) {
    // fall back to any entity
    for (const e of store.entities.values()) return _clone(e);
    return null;
  }
  return _clone(store.entities.get(best));
}

function _estimateGroupRevenue(store, period) {
  // Sum external-customer + IC revenue across all entities.
  // In a real ERP this would read from GL; for standalone operation
  // we rely on cached entity.meta.annualRevenueILS if provided.
  let total = 0;
  for (const ent of store.entities.values()) {
    const r = ent.meta && Number(ent.meta.annualRevenueILS);
    if (isFinite(r)) total += r;
  }
  return _money(total);
}

// ─────────────────────────────────────────────────────────────────────
// 10. IC balance between two entities
// ─────────────────────────────────────────────────────────────────────

/**
 * Net IC position of entityA vs entityB as of a given date.
 * Positive = A owes B, negative = B owes A, 0 = clean.
 * Returns amounts in A's functional currency.
 */
function getICBalance(entityA, entityB, asOf, store) {
  store = store || _defaultStore;
  _require(entityA, 'entityA'); _require(entityB, 'entityB');

  const a = store.entities.get(entityA);
  const b = store.entities.get(entityB);
  if (!a || !b) {
    const e = new Error('entity not found');
    e.code = 'IC_NOT_FOUND'; throw e;
  }
  const cutoff = asOf ? new Date(asOf) : _now();

  let aOwesB = 0;   // A's payables to B
  let bOwesA = 0;   // B's payables to A

  for (const tx of store.transactions.values()) {
    if (tx.side !== 'from') continue;
    if (tx.status === TX_STATUS.REVERSED) continue;
    const td = new Date(tx.date);
    if (td > cutoff) continue;

    const amountInA = (tx.currency === a.functionalCcy)
      ? tx.amount
      : _tryTranslate(tx.amount, tx.currency, a.functionalCcy, td, store);
    if (amountInA == null) continue;

    if (tx.from === entityA && tx.to === entityB) {
      // A is providing goods/services to B → B owes A
      // except for LOAN_PRINCIPAL flowing A→B → A has receivable
      // and DIVIDEND/CAPITAL_INJECTION which are equity moves.
      if (tx.type === TX_TYPES.LOAN_PRINCIPAL) {
        bOwesA += amountInA;
      } else if (tx.type === TX_TYPES.DIVIDEND
              || tx.type === TX_TYPES.CAPITAL_INJECTION) {
        // Equity in nature — skip from working balance
        continue;
      } else {
        bOwesA += amountInA;
      }
    } else if (tx.from === entityB && tx.to === entityA) {
      if (tx.type === TX_TYPES.DIVIDEND
       || tx.type === TX_TYPES.CAPITAL_INJECTION) {
        continue;
      }
      aOwesB += amountInA;
    }
  }
  const net = _money(aOwesB - bOwesA);
  return {
    entityA, entityB,
    asOf: _iso(cutoff),
    currency: a.functionalCcy,
    aOwesB: _money(aOwesB),
    bOwesA: _money(bOwesA),
    net,
    direction: net > 0 ? `${a.name} owes ${b.name}`
             : net < 0 ? `${b.name} owes ${a.name}`
             : 'clean',
    directionHe: net > 0 ? `${a.nameHe} חייבת ל-${b.nameHe}`
               : net < 0 ? `${b.nameHe} חייבת ל-${a.nameHe}`
               : 'נקי',
  };
}

// ─────────────────────────────────────────────────────────────────────
// 11. Year-end balance confirmation
// ─────────────────────────────────────────────────────────────────────

/**
 * Produce a year-end confirmation letter payload for each IC pair,
 * so both controllers can formally sign it off before audit.
 */
function yearEndConfirmation(year, store) {
  store = store || _defaultStore;
  const period = `${year}-12`;
  const pairs = new Set();
  for (const tx of store.transactions.values()) {
    if (tx.side !== 'from') continue;
    if (tx.status === TX_STATUS.REVERSED) continue;
    const y = Number(tx.period.slice(0, 4));
    if (y > year) continue;
    pairs.add(_pairKey(tx.from, tx.to));
  }
  const asOf = new Date(`${year}-12-31T23:59:59Z`);
  const letters = [];
  for (const key of pairs) {
    const [a, b] = key.split('~');
    const bal = getICBalance(a, b, asOf, store);
    const rec = reconcile(a, b, null, store);
    letters.push({
      id: _nextId(store, 'conf'),
      year,
      entityA: a,
      entityB: b,
      asOf: _iso(asOf),
      balance: bal,
      reconciliation: {
        matched: rec.matchedCount,
        discrepancies: rec.discrepancyCount,
        clean: rec.clean,
      },
      bodyEn:
        `We hereby confirm the inter-company balance between ` +
        `${bal.entityA} and ${bal.entityB} as of ${asOf.toISOString().slice(0,10)} ` +
        `is ${bal.net} ${bal.currency} (${bal.direction}). ` +
        `Matched ${rec.matchedCount} / discrepancies ${rec.discrepancyCount}.`,
      bodyHe:
        `הרינו לאשר כי יתרת הפעילות הבין-חברתית בין ` +
        `${bal.entityA} לבין ${bal.entityB} נכון ל-${asOf.toISOString().slice(0,10)} ` +
        `עומדת על ${bal.net} ${bal.currency}. ` +
        `תואמו ${rec.matchedCount} עסקאות, נמצאו ${rec.discrepancyCount} אי-התאמות.`,
      signatures: {
        controllerA: null,
        controllerB: null,
        signedAt: null,
      },
    });
  }
  const key = `yearend-${year}`;
  store.confirmations.set(key, letters);
  _audit(store, 'confirmation.issue', key, { count: letters.length });
  return letters;
}

// ─────────────────────────────────────────────────────────────────────
// 12. Documentation / compliance helpers
// ─────────────────────────────────────────────────────────────────────

function attachDocumentation(txId, docRef, store) {
  store = store || _defaultStore;
  const tx = store.transactions.get(txId);
  if (!tx) {
    const e = new Error('tx not found: ' + txId);
    e.code = 'IC_NOT_FOUND'; throw e;
  }
  tx.documentation = true;
  tx.documentationRef = docRef;
  if (tx.mirrorId) {
    const m = store.transactions.get(tx.mirrorId);
    if (m) { m.documentation = true; m.documentationRef = docRef; }
  }
  // Re-evaluate TP compliance with docs attached.
  tx.tp = evaluateTransferPricing({
    type: tx.type,
    amount: tx.amount,
    cost: tx.cost,
    rate: tx.rate,
    marketRent: tx.marketRent,
    allocationKey: tx.allocationKey,
    documentation: true,
    tpMethod: tx.tpMethod,
  }, store);
  _audit(store, 'doc.attach', txId, { docRef });
  return _clone(tx);
}

function setComplianceThresholds(overrides, store) {
  store = store || _defaultStore;
  Object.assign(store.compliance, overrides || {});
  _audit(store, 'compliance.update', 'cfg', overrides);
  return _clone(store.compliance);
}

function getComplianceThresholds(store) {
  store = store || _defaultStore;
  return _clone(store.compliance);
}

function getAuditLog(store) {
  store = store || _defaultStore;
  return _clone(store.audit);
}

// ─────────────────────────────────────────────────────────────────────
// 13. Factory + exports
// ─────────────────────────────────────────────────────────────────────

/**
 * Build an isolated engine. Each engine has its own store so unit tests
 * can run in parallel without interference.
 */
function createEngine() {
  const store = createStore();
  return {
    store,
    defineEntity:  (e)          => defineEntity(e, store),
    linkEntities:  (p, c, pct)  => linkEntities(p, c, pct, store),
    listEntities:  ()           => listEntities(store),
    getEntity:     (id)         => getEntity(id, store),
    getHierarchy:  (id)         => getHierarchy(id, store),

    setFxRate:     (f, t, d, r) => setFxRate(f, t, d, r, store),
    getFxRate:     (f, t, d)    => getFxRate(f, t, d, store),
    translateAmount: (a, f, t, d) => translateAmount(a, f, t, d, store),

    recordICTransaction: (x) => recordICTransaction(x, store),
    getTransaction:      (id) => getTransaction(id, store),
    listTransactions:    (f) => listTransactions(f, store),
    reverseTransaction:  (id, r) => reverseTransaction(id, r, store),
    attachDocumentation: (id, d) => attachDocumentation(id, d, store),

    reconcile:             (a, b, p) => reconcile(a, b, p, store),
    generateEliminations:  (p)       => generateEliminations(p, store),
    transferPricingReport: (p)       => transferPricingReport(p, store),
    getICBalance:          (a, b, d) => getICBalance(a, b, d, store),
    yearEndConfirmation:   (y)       => yearEndConfirmation(y, store),

    evaluateTransferPricing: (tx)   => evaluateTransferPricing(tx, store),
    setComplianceThresholds: (o)    => setComplianceThresholds(o, store),
    getComplianceThresholds: ()     => getComplianceThresholds(store),
    getAuditLog:             ()     => getAuditLog(store),
  };
}

module.exports = {
  // Core factory
  createEngine,
  createStore,

  // Constants / enums
  VERSION,
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  TX_TYPES,
  TX_TYPE_LABELS,
  TX_STATUS,
  TP_METHODS,
  TP_METHOD_LABELS,
  DOC_REQ,
  DEFAULT_COMPLIANCE,

  // Default-store functions
  defineEntity,
  linkEntities,
  listEntities,
  getEntity,
  getHierarchy,
  setFxRate,
  getFxRate,
  translateAmount,
  recordICTransaction,
  getTransaction,
  listTransactions,
  reverseTransaction,
  attachDocumentation,
  reconcile,
  generateEliminations,
  transferPricingReport,
  getICBalance,
  yearEndConfirmation,
  evaluateTransferPricing,
  setComplianceThresholds,
  getComplianceThresholds,
  getAuditLog,
};
