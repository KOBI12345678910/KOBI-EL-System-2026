/**
 * Financial Consolidation Engine — Multi-Entity Group Roll-Up
 * Agent X-42 • Techno-Kol Uzi • Swarm 3C • Kobi's mega-ERP 2026
 *
 * Consolidates sub-ledger trial balances from multiple legal entities into a
 * single group (parent + subs). Pure functions, zero dependencies, Hebrew
 * bilingual output, Israeli GAAP + IFRS for SMEs compliant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STANDARDS
 * ─────────────────────────────────────────────────────────────────────────
 * • Full consolidation for control (>50% ownership)
 * • Equity method for significant influence (20%–50%)
 * • Cost method for minor interest (<20%)
 * • Currency translation per IAS 21:
 *     - Income statement items at period average rate
 *     - Balance sheet items at closing (period-end) rate
 *     - Equity at historical (acquisition / contribution) rate
 *     - Translation difference plugs to OCI / CTA
 * • Intercompany eliminations (receivables, payables, sales, COGS,
 *   investments in subs, interest, management fees, unrealized profit
 *   in ending inventory)
 * • Non-controlling interest (NCI) recognized at proportional net assets
 *   plus share of sub's post-acquisition profit
 * • Goodwill = Cost of Investment − Parent's share of acquiree net assets
 *   at fair value (including FV uplifts)
 * • Chart-of-accounts harmonization via per-entity mapping tables
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MUTATION POLICY
 * ─────────────────────────────────────────────────────────────────────────
 * Nothing is deleted. All inputs are cloned before manipulation. The engine
 * is append-only: eliminations are recorded as adjustment lines, never
 * overwrites. Full audit trail is produced for every consolidation run.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EXPORTS
 * ─────────────────────────────────────────────────────────────────────────
 *   defineGroup(parent, subs)                     → group structure
 *   mapAccounts(groupState, entityId, table)      → void
 *   translate(entityTB, functional, pres, rates)  → translated TB
 *   consolidate(groupState, period)               → full pack
 *   verifyEquality(consolidatedTB)                → {balanced, deltas}
 *   prioryearComparative(groupState, period)      → comparative view
 *   auditPackage(groupState, period)              → working papers
 *
 * Run style:
 *   const c = require('./consolidator');
 *   const g = c.defineGroup(parentEntity, [subA, subB]);
 *   c.mapAccounts(g, 'subA', { '1000-A': '1000' });
 *   c.loadTrialBalance(g, 'parent', parentTB, 'ILS');
 *   c.loadTrialBalance(g, 'subA', subATB, 'USD');
 *   c.addIntercompany(g, icEntries);
 *   const pack = c.consolidate(g, { period: '2026-Q1', rates: {...} });
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// HEBREW / ENGLISH LABELS (bilingual output)
// ═══════════════════════════════════════════════════════════════

const LABELS = {
  // group / entity
  group: { he: 'קבוצה', en: 'Group' },
  parent: { he: 'חברה אם', en: 'Parent' },
  subsidiary: { he: 'חברה בת', en: 'Subsidiary' },
  associate: { he: 'חברה כלולה', en: 'Associate' },
  investment: { he: 'השקעה', en: 'Investment' },

  // method
  method_full: { he: 'איחוד מלא', en: 'Full consolidation' },
  method_equity: { he: 'שווי מאזני', en: 'Equity method' },
  method_cost: { he: 'עלות', en: 'Cost method' },

  // accounts
  ar_ic: { he: 'חייבים בינחברתיים', en: 'Intercompany receivables' },
  ap_ic: { he: 'זכאים בינחברתיים', en: 'Intercompany payables' },
  sales_ic: { he: 'מכירות בינחברתיות', en: 'Intercompany sales' },
  cogs_ic: { he: 'עלות מכר בינחברתית', en: 'Intercompany cost of sales' },
  int_inc_ic: { he: 'הכנסות ריבית בינחברתיות', en: 'Intercompany interest income' },
  int_exp_ic: { he: 'הוצאות ריבית בינחברתיות', en: 'Intercompany interest expense' },
  mgmt_ic: { he: 'דמי ניהול בינחברתיים', en: 'Intercompany management fees' },
  inv_in_sub: { he: 'השקעה בחברות בנות', en: 'Investment in subsidiaries' },
  equity_sub: { he: 'הון עצמי של הבת', en: 'Subsidiary equity' },

  // statement elements
  assets: { he: 'נכסים', en: 'Assets' },
  liabilities: { he: 'התחייבויות', en: 'Liabilities' },
  equity: { he: 'הון עצמי', en: 'Equity' },
  revenue: { he: 'הכנסות', en: 'Revenue' },
  expenses: { he: 'הוצאות', en: 'Expenses' },
  net_income: { he: 'רווח נקי', en: 'Net income' },
  nci: { he: 'זכויות מיעוט', en: 'Non-controlling interest (NCI)' },
  goodwill: { he: 'מוניטין', en: 'Goodwill' },
  fv_adj: { he: 'התאמות שווי הוגן', en: 'Fair value adjustments' },
  cta: { he: 'הפרשי תרגום מצטברים', en: 'Cumulative translation adjustment (CTA)' },
  unrealized_profit: { he: 'רווח לא ממומש במלאי', en: 'Unrealized profit in inventory' },

  // labels used in output rows
  consolidated: { he: 'מאוחד', en: 'Consolidated' },
  eliminations: { he: 'ביטולים', en: 'Eliminations' },
  balanced: { he: 'מאזן מאוזן', en: 'Balanced' },
  unbalanced: { he: 'מאזן לא מאוזן', en: 'Unbalanced' },
};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const CONSOLIDATION_METHOD = Object.freeze({
  FULL: 'full',
  EQUITY: 'equity',
  COST: 'cost',
});

const OWNERSHIP_THRESHOLDS = Object.freeze({
  CONTROL: 0.5001,       // > 50% → control → full consolidation
  SIGNIFICANT: 0.20,     // 20%..50% → equity method
});

const ACCOUNT_CLASS = Object.freeze({
  ASSET: 'A',        // debit-natured balance sheet
  LIABILITY: 'L',    // credit-natured balance sheet
  EQUITY: 'E',       // credit-natured balance sheet
  REVENUE: 'R',      // credit-natured income statement
  EXPENSE: 'X',      // debit-natured income statement
});

const ELIMINATION_TYPE = Object.freeze({
  IC_AR_AP: 'IC_AR_AP',
  IC_SALES_COGS: 'IC_SALES_COGS',
  IC_UNREALIZED_PROFIT: 'IC_UNREALIZED_PROFIT',
  IC_INVESTMENT_EQUITY: 'IC_INVESTMENT_EQUITY',
  IC_INTEREST: 'IC_INTEREST',
  IC_MGMT_FEE: 'IC_MGMT_FEE',
  FX_TRANSLATION: 'FX_TRANSLATION',
  GOODWILL_RECOGNITION: 'GOODWILL_RECOGNITION',
  FV_ADJUSTMENT: 'FV_ADJUSTMENT',
  NCI_ALLOCATION: 'NCI_ALLOCATION',
});

const ROUNDING_TOLERANCE = 0.01;  // 1 agorot rounding tolerance

// ═══════════════════════════════════════════════════════════════
// HELPERS — money, rounding, cloning
// ═══════════════════════════════════════════════════════════════

function round2(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 0;
  return Math.round(Number(n) * 100) / 100;
}

function isNum(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function toNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function sum(arr, pick) {
  if (!Array.isArray(arr)) return 0;
  let s = 0;
  for (const x of arr) {
    s += pick ? toNum(pick(x)) : toNum(x);
  }
  return s;
}

function deepClone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(deepClone);
  const out = {};
  for (const k in o) {
    if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = deepClone(o[k]);
  }
  return out;
}

function classifyAccount(account) {
  if (!account) return ACCOUNT_CLASS.ASSET;
  if (account.class) return account.class;
  const code = String(account.code || account.account_code || '').trim();
  if (/^1/.test(code)) return ACCOUNT_CLASS.ASSET;
  if (/^2/.test(code)) return ACCOUNT_CLASS.LIABILITY;
  if (/^3/.test(code)) return ACCOUNT_CLASS.EQUITY;
  if (/^4/.test(code)) return ACCOUNT_CLASS.REVENUE;
  if (/^[5-9]/.test(code)) return ACCOUNT_CLASS.EXPENSE;
  return ACCOUNT_CLASS.ASSET;
}

function isBalanceSheet(cls) {
  return cls === ACCOUNT_CLASS.ASSET ||
         cls === ACCOUNT_CLASS.LIABILITY ||
         cls === ACCOUNT_CLASS.EQUITY;
}

function isIncomeStatement(cls) {
  return cls === ACCOUNT_CLASS.REVENUE || cls === ACCOUNT_CLASS.EXPENSE;
}

// ═══════════════════════════════════════════════════════════════
// GROUP DEFINITION
// ═══════════════════════════════════════════════════════════════

/**
 * Define a consolidation group.
 *
 * @param {Object} parent  { id, name, currency }
 * @param {Array}  subs    [{ id, name, currency, ownership, acquisitionDate, costOfInvestment, netAssetsAtAcquisition, fairValueUplifts }]
 * @returns {Object} groupState
 */
function defineGroup(parent, subs) {
  if (!parent || !parent.id) {
    throw new Error('defineGroup: parent with id is required');
  }
  const safeSubs = Array.isArray(subs) ? subs : [];

  const group = {
    parent: {
      id: String(parent.id),
      name: parent.name || parent.id,
      currency: parent.currency || 'ILS',
      type: 'parent',
    },
    subs: [],
    // sub registrar by id
    byId: {},
    // per-entity chart-of-accounts mapping (sub local code → group code)
    mappings: {},
    // loaded trial balances (raw, per entity, in local currency)
    trialBalances: {},
    // loaded trial balances after translation (presentation currency)
    translatedTBs: {},
    // intercompany transaction register (from Agent X-41 feed)
    intercompany: [],
    // account catalogue (merged group CoA)
    accountCatalog: {},
    // historical goodwill & FV adjustments captured at acquisition
    acquisition: {},
    // audit trail of every consolidation step
    auditTrail: [],
    // priorperiod snapshots for comparative view
    snapshots: {},
  };

  group.byId[group.parent.id] = group.parent;
  group.trialBalances[group.parent.id] = [];
  group.translatedTBs[group.parent.id] = [];
  group.mappings[group.parent.id] = {};

  for (const s of safeSubs) {
    if (!s || !s.id) continue;
    const ownership = isNum(s.ownership) ? Math.max(0, Math.min(1, s.ownership)) : 1;
    const method = resolveConsolidationMethod(ownership);
    const sub = {
      id: String(s.id),
      name: s.name || s.id,
      currency: s.currency || 'ILS',
      ownership,
      method,
      acquisitionDate: s.acquisitionDate || null,
      costOfInvestment: round2(s.costOfInvestment || 0),
      netAssetsAtAcquisition: round2(s.netAssetsAtAcquisition || 0),
      fairValueUplifts: Array.isArray(s.fairValueUplifts)
        ? s.fairValueUplifts.map((u) => ({
            account: u.account,
            amount: round2(u.amount || 0),
            label: u.label || '',
          }))
        : [],
      type: 'subsidiary',
      parentId: group.parent.id,
    };
    group.subs.push(sub);
    group.byId[sub.id] = sub;
    group.trialBalances[sub.id] = [];
    group.translatedTBs[sub.id] = [];
    group.mappings[sub.id] = {};

    // capture acquisition snapshot
    const fvTotal = sum(sub.fairValueUplifts, (u) => u.amount);
    const impliedGoodwill = round2(
      sub.costOfInvestment - sub.ownership * (sub.netAssetsAtAcquisition + fvTotal)
    );
    group.acquisition[sub.id] = {
      costOfInvestment: sub.costOfInvestment,
      netAssetsAtAcquisition: sub.netAssetsAtAcquisition,
      fairValueUpliftsTotal: round2(fvTotal),
      ownership: sub.ownership,
      goodwillAtAcquisition: impliedGoodwill,
      acquisitionDate: sub.acquisitionDate,
    };
  }

  pushAudit(group, 'GROUP_DEFINED', {
    parent: group.parent.id,
    subsidiaries: group.subs.map((s) => ({
      id: s.id, ownership: s.ownership, method: s.method,
    })),
  });

  return group;
}

function resolveConsolidationMethod(ownership) {
  if (ownership > OWNERSHIP_THRESHOLDS.CONTROL) return CONSOLIDATION_METHOD.FULL;
  if (ownership >= OWNERSHIP_THRESHOLDS.SIGNIFICANT) return CONSOLIDATION_METHOD.EQUITY;
  return CONSOLIDATION_METHOD.COST;
}

function pushAudit(group, step, payload) {
  group.auditTrail.push({
    step,
    at: new Date().toISOString(),
    payload: payload == null ? null : deepClone(payload),
  });
}

// ═══════════════════════════════════════════════════════════════
// CHART-OF-ACCOUNTS HARMONIZATION
// ═══════════════════════════════════════════════════════════════

/**
 * Register a per-entity account mapping table.
 * table is { localCode: { code, label_he, label_en, class } } OR
 * shorthand { localCode: groupCode }.
 */
function mapAccounts(groupState, entityId, mappingTable) {
  if (!groupState || !groupState.byId[entityId]) {
    throw new Error(`mapAccounts: unknown entity ${entityId}`);
  }
  if (!mappingTable || typeof mappingTable !== 'object') {
    throw new Error('mapAccounts: mappingTable must be an object');
  }
  const normalized = {};
  for (const key in mappingTable) {
    if (!Object.prototype.hasOwnProperty.call(mappingTable, key)) continue;
    const v = mappingTable[key];
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      normalized[String(key)] = {
        code: String(v),
        label_he: '',
        label_en: '',
        class: null,
      };
    } else {
      normalized[String(key)] = {
        code: String(v.code || v.group_code || key),
        label_he: v.label_he || v.labelHe || '',
        label_en: v.label_en || v.labelEn || '',
        class: v.class || null,
      };
    }
  }
  groupState.mappings[entityId] = {
    ...(groupState.mappings[entityId] || {}),
    ...normalized,
  };
  pushAudit(groupState, 'COA_MAPPING_REGISTERED', {
    entityId,
    mappings: Object.keys(normalized).length,
  });
}

function resolveGroupAccount(groupState, entityId, localCode) {
  const table = groupState.mappings[entityId] || {};
  const mapped = table[localCode];
  if (mapped) return mapped;
  // fallback: use local code as-is
  return {
    code: String(localCode),
    label_he: '',
    label_en: '',
    class: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// TRIAL BALANCE LOADING
// ═══════════════════════════════════════════════════════════════

/**
 * Load an entity's trial balance. TB is array of
 *   { code, label_he?, label_en?, class?, debit, credit, historical_rate? }
 * or                                       { balance, ... }.
 */
function loadTrialBalance(groupState, entityId, tb, currency) {
  if (!groupState || !groupState.byId[entityId]) {
    throw new Error(`loadTrialBalance: unknown entity ${entityId}`);
  }
  const ent = groupState.byId[entityId];
  if (currency && ent.currency !== currency) {
    ent.currency = currency;
  }
  const rows = Array.isArray(tb) ? tb : [];
  const normalized = rows
    .filter((r) => r && (r.code || r.account_code))
    .map((r) => {
      const code = String(r.code || r.account_code);
      const mapped = resolveGroupAccount(groupState, entityId, code);
      const cls = r.class || mapped.class || classifyAccount({ code: mapped.code });
      const debit = toNum(r.debit);
      const credit = toNum(r.credit);
      const explicitBalance = r.balance != null ? toNum(r.balance) : null;
      const netBalance = explicitBalance != null
        ? explicitBalance
        : debitCreditToSigned(cls, debit, credit);
      return {
        entityId,
        localCode: code,
        groupCode: mapped.code,
        class: cls,
        label_he: r.label_he || mapped.label_he || '',
        label_en: r.label_en || mapped.label_en || '',
        debit: round2(debit),
        credit: round2(credit),
        balance: round2(netBalance),
        historicalRate: isNum(r.historical_rate) ? r.historical_rate : null,
        currency: ent.currency,
      };
    });
  groupState.trialBalances[entityId] = normalized;

  // update catalog
  for (const row of normalized) {
    if (!groupState.accountCatalog[row.groupCode]) {
      groupState.accountCatalog[row.groupCode] = {
        code: row.groupCode,
        class: row.class,
        label_he: row.label_he,
        label_en: row.label_en,
      };
    }
  }
  pushAudit(groupState, 'TB_LOADED', {
    entityId, rows: normalized.length, currency: ent.currency,
  });
  return normalized;
}

/**
 * Convert debit/credit pair into a signed balance where
 *   assets / expenses → positive is debit
 *   liabilities / equity / revenue → positive is credit
 */
function debitCreditToSigned(cls, debit, credit) {
  if (cls === ACCOUNT_CLASS.ASSET || cls === ACCOUNT_CLASS.EXPENSE) {
    return round2(toNum(debit) - toNum(credit));
  }
  return round2(toNum(credit) - toNum(debit));
}

// ═══════════════════════════════════════════════════════════════
// CURRENCY TRANSLATION (IAS 21)
// ═══════════════════════════════════════════════════════════════

/**
 * Translate an entity's trial balance from its functional currency to the
 * group's presentation currency using the IAS 21 rule set.
 *
 * rates: { closing, average, historical? (number | map by account) }
 */
function translate(entityTB, functional, presentation, rates) {
  if (functional === presentation || !rates) {
    return {
      rows: Array.isArray(entityTB) ? deepClone(entityTB) : [],
      ctaDifference: 0,
      functional,
      presentation,
      rates: rates || null,
    };
  }
  const rows = Array.isArray(entityTB) ? entityTB : [];
  const closing = toNum(rates.closing);
  const avg = toNum(rates.average);
  const histDefault = isNum(rates.historical) ? rates.historical : null;
  const histMap = rates.historical && typeof rates.historical === 'object' ? rates.historical : null;

  if (closing <= 0 || avg <= 0) {
    throw new Error('translate: closing and average rates must be positive');
  }

  let bsDebitTranslated = 0;
  let bsCreditTranslated = 0;
  let isProfitTranslated = 0;

  const translated = rows.map((r) => {
    const cls = r.class || classifyAccount({ code: r.groupCode || r.code });
    let rate;
    if (cls === ACCOUNT_CLASS.EQUITY) {
      rate =
        (histMap && isNum(histMap[r.groupCode])) ? histMap[r.groupCode] :
        (isNum(r.historicalRate) ? r.historicalRate :
        (histDefault != null ? histDefault : closing));
    } else if (isBalanceSheet(cls)) {
      rate = closing;
    } else {
      rate = avg;
    }
    const newDebit = round2(toNum(r.debit) * rate);
    const newCredit = round2(toNum(r.credit) * rate);
    const newBalance = round2(toNum(r.balance) * rate);

    if (cls === ACCOUNT_CLASS.ASSET) {
      bsDebitTranslated += newBalance;
    } else if (cls === ACCOUNT_CLASS.LIABILITY || cls === ACCOUNT_CLASS.EQUITY) {
      bsCreditTranslated += newBalance;
    } else if (cls === ACCOUNT_CLASS.REVENUE) {
      isProfitTranslated += newBalance;
    } else if (cls === ACCOUNT_CLASS.EXPENSE) {
      isProfitTranslated -= newBalance;
    }

    return {
      ...r,
      debit: newDebit,
      credit: newCredit,
      balance: newBalance,
      rateApplied: rate,
      currency: presentation,
      functionalCurrency: functional,
    };
  });

  // CTA = BS credit side + translated net income - BS debit side
  const ctaDifference = round2(bsDebitTranslated - bsCreditTranslated - isProfitTranslated);

  return {
    rows: translated,
    ctaDifference,
    functional,
    presentation,
    rates: {
      closing,
      average: avg,
      historical: histDefault,
      historicalMap: histMap,
    },
  };
}

function translateGroup(groupState, rates) {
  const presentation = groupState.parent.currency;
  const ctaPerEntity = {};
  // parent rows copy as-is
  groupState.translatedTBs[groupState.parent.id] = deepClone(
    groupState.trialBalances[groupState.parent.id] || []
  );
  ctaPerEntity[groupState.parent.id] = 0;

  for (const sub of groupState.subs) {
    const tb = groupState.trialBalances[sub.id] || [];
    const subRates = rates && rates[sub.id] ? rates[sub.id] : rates;
    const result = translate(tb, sub.currency, presentation, subRates);
    groupState.translatedTBs[sub.id] = result.rows;
    ctaPerEntity[sub.id] = result.ctaDifference;
  }
  pushAudit(groupState, 'TRANSLATION_DONE', {
    presentation, cta: ctaPerEntity,
  });
  return ctaPerEntity;
}

// ═══════════════════════════════════════════════════════════════
// INTERCOMPANY / ELIMINATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Register intercompany transactions (typically fed by Agent X-41).
 * Each entry:
 *   {
 *     type: 'AR_AP' | 'SALES_COGS' | 'INTEREST' | 'MGMT_FEE' | 'INVESTMENT',
 *     from, to, amount, currency,
 *     // SALES_COGS extras:
 *     margin (0..1), stillInEndingInventory (amount at sale price),
 *     // AR_AP extras:
 *     arAccount, apAccount,
 *     // SALES_COGS extras:
 *     salesAccount, cogsAccount, inventoryAccount,
 *     // INTEREST extras:
 *     interestIncomeAccount, interestExpenseAccount,
 *     // MGMT_FEE extras:
 *     feeIncomeAccount, feeExpenseAccount,
 *   }
 */
function addIntercompany(groupState, entries) {
  if (!Array.isArray(entries)) return;
  for (const e of entries) {
    if (!e || !e.type) continue;
    groupState.intercompany.push(deepClone(e));
  }
  pushAudit(groupState, 'IC_REGISTERED', { added: entries.length });
}

/**
 * Create elimination journal entries from the intercompany register.
 * Returns a list of adjustment lines to be added to the consolidated TB.
 */
function buildEliminations(groupState) {
  const elims = [];
  const entries = groupState.intercompany || [];
  for (const e of entries) {
    switch (e.type) {
      case 'AR_AP': {
        const amt = round2(toNum(e.amount));
        if (amt === 0) break;
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_AR_AP,
          e.arAccount || '1150',
          'IC AR',
          -amt,
          ACCOUNT_CLASS.ASSET,
          { from: e.from, to: e.to, description: 'Eliminate IC receivable' }
        ));
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_AR_AP,
          e.apAccount || '2150',
          'IC AP',
          -amt,
          ACCOUNT_CLASS.LIABILITY,
          { from: e.from, to: e.to, description: 'Eliminate IC payable' }
        ));
        break;
      }
      case 'SALES_COGS': {
        const amt = round2(toNum(e.amount));
        if (amt === 0) break;
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_SALES_COGS,
          e.salesAccount || '4100',
          'IC Sales',
          -amt,
          ACCOUNT_CLASS.REVENUE,
          { from: e.from, to: e.to, description: 'Eliminate IC sales' }
        ));
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_SALES_COGS,
          e.cogsAccount || '5100',
          'IC COGS',
          -amt,
          ACCOUNT_CLASS.EXPENSE,
          { from: e.from, to: e.to, description: 'Eliminate IC COGS' }
        ));
        // unrealized profit in ending inventory
        const stillIn = round2(toNum(e.stillInEndingInventory));
        const margin = isNum(e.margin) ? Math.max(0, Math.min(1, e.margin)) : 0;
        const unrealized = round2(stillIn * margin);
        if (unrealized !== 0) {
          elims.push(makeElim(
            ELIMINATION_TYPE.IC_UNREALIZED_PROFIT,
            e.inventoryAccount || '1300',
            'Inventory (UP)',
            -unrealized,
            ACCOUNT_CLASS.ASSET,
            {
              from: e.from,
              to: e.to,
              description: 'Reduce inventory for unrealized IC profit',
            }
          ));
          elims.push(makeElim(
            ELIMINATION_TYPE.IC_UNREALIZED_PROFIT,
            e.cogsAccount || '5100',
            'COGS (UP)',
            unrealized,
            ACCOUNT_CLASS.EXPENSE,
            {
              from: e.from,
              to: e.to,
              description: 'Increase COGS for unrealized profit',
            }
          ));
        }
        break;
      }
      case 'INTEREST': {
        const amt = round2(toNum(e.amount));
        if (amt === 0) break;
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_INTEREST,
          e.interestIncomeAccount || '4500',
          'IC Interest Income',
          -amt,
          ACCOUNT_CLASS.REVENUE,
          { from: e.from, to: e.to, description: 'Eliminate IC interest income' }
        ));
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_INTEREST,
          e.interestExpenseAccount || '5500',
          'IC Interest Expense',
          -amt,
          ACCOUNT_CLASS.EXPENSE,
          { from: e.from, to: e.to, description: 'Eliminate IC interest expense' }
        ));
        break;
      }
      case 'MGMT_FEE': {
        const amt = round2(toNum(e.amount));
        if (amt === 0) break;
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_MGMT_FEE,
          e.feeIncomeAccount || '4600',
          'IC Mgmt Fee Income',
          -amt,
          ACCOUNT_CLASS.REVENUE,
          { from: e.from, to: e.to, description: 'Eliminate IC management fee income' }
        ));
        elims.push(makeElim(
          ELIMINATION_TYPE.IC_MGMT_FEE,
          e.feeExpenseAccount || '5600',
          'IC Mgmt Fee Expense',
          -amt,
          ACCOUNT_CLASS.EXPENSE,
          { from: e.from, to: e.to, description: 'Eliminate IC management fee expense' }
        ));
        break;
      }
      case 'INVESTMENT': {
        // handled in investment elimination below (requires sub equity lookup)
        elims.push({
          type: ELIMINATION_TYPE.IC_INVESTMENT_EQUITY,
          groupCode: e.investmentAccount || '1800',
          label: 'Investment placeholder',
          amount: 0,
          class: ACCOUNT_CLASS.ASSET,
          meta: { from: e.from, to: e.to, raw: deepClone(e) },
        });
        break;
      }
      default:
        // unknown IC type → record as no-op note (never fail)
        elims.push({
          type: 'UNKNOWN_IC',
          groupCode: 'X',
          label: 'unknown',
          amount: 0,
          class: ACCOUNT_CLASS.ASSET,
          meta: { raw: deepClone(e) },
        });
    }
  }
  return elims;
}

function makeElim(type, groupCode, label, amount, cls, meta) {
  return {
    type,
    groupCode: String(groupCode),
    label,
    amount: round2(amount),
    class: cls,
    meta: meta || {},
  };
}

/**
 * Eliminate parent's investment against sub's equity and compute goodwill,
 * NCI, and fair-value adjustments. Produces a set of elimination lines that
 * wipe the investment line and the sub's pre-acquisition equity, plugging
 * goodwill, NCI, and FV uplifts.
 */
function eliminateInvestmentAndComputeGoodwill(groupState) {
  const elims = [];
  const goodwillPerSub = {};
  const nciPerSub = {};

  for (const sub of groupState.subs) {
    if (sub.method !== CONSOLIDATION_METHOD.FULL) continue;
    const acq = groupState.acquisition[sub.id] || {};
    const cost = round2(acq.costOfInvestment || 0);
    const netAssetsAtAcq = round2(acq.netAssetsAtAcquisition || 0);
    const fvTotal = round2(acq.fairValueUpliftsTotal || 0);
    const ownership = isNum(acq.ownership) ? acq.ownership : sub.ownership;
    const currentEquity = subCurrentEquity(groupState, sub.id);

    // Goodwill is locked at acquisition date:
    //   GW = Cost − Parent share of (book + FV uplifts)
    const goodwill = round2(cost - ownership * (netAssetsAtAcq + fvTotal));
    goodwillPerSub[sub.id] = goodwill;

    // NCI at reporting date = (1 − ownership) × current sub equity
    // (at-acq NCI + NCI share of post-acq movements rolled into one figure)
    const nci = round2((1 - ownership) * currentEquity);
    nciPerSub[sub.id] = nci;

    // Eliminate the parent's investment in full
    elims.push(makeElim(
      ELIMINATION_TYPE.IC_INVESTMENT_EQUITY,
      '1800',
      'Investment in ' + sub.id,
      -cost,
      ACCOUNT_CLASS.ASSET,
      { sub: sub.id, description: 'Eliminate investment in subsidiary' }
    ));
    // Eliminate the parent's share of the subsidiary's current equity.
    // The remainder of sub equity is reclassified to NCI below.
    const parentShareOfCurrent = round2(ownership * currentEquity);
    elims.push(makeElim(
      ELIMINATION_TYPE.IC_INVESTMENT_EQUITY,
      '3000',
      'Equity of ' + sub.id,
      -parentShareOfCurrent,
      ACCOUNT_CLASS.EQUITY,
      {
        sub: sub.id,
        description: 'Eliminate parent share of subsidiary equity',
        ownership,
        currentEquity,
      }
    ));
    // plug fair value uplifts
    const uplifts = Array.isArray(sub.fairValueUplifts) ? sub.fairValueUplifts : [];
    for (const u of uplifts) {
      const amt = round2(toNum(u.amount));
      if (amt === 0) continue;
      elims.push(makeElim(
        ELIMINATION_TYPE.FV_ADJUSTMENT,
        u.account || '1900',
        u.label || 'FV adjustment',
        amt,
        ACCOUNT_CLASS.ASSET,
        { sub: sub.id, description: 'Fair value uplift at acquisition' }
      ));
    }
    // recognize goodwill
    if (goodwill !== 0) {
      elims.push(makeElim(
        ELIMINATION_TYPE.GOODWILL_RECOGNITION,
        '1950',
        'Goodwill ' + sub.id,
        goodwill,
        ACCOUNT_CLASS.ASSET,
        { sub: sub.id, description: 'Goodwill recognized on consolidation' }
      ));
    }
    // recognize NCI in equity
    if (nci !== 0) {
      elims.push(makeElim(
        ELIMINATION_TYPE.NCI_ALLOCATION,
        '3900',
        'NCI ' + sub.id,
        nci,
        ACCOUNT_CLASS.EQUITY,
        { sub: sub.id, description: 'Non-controlling interest' }
      ));
    }
  }

  return { elims, goodwillPerSub, nciPerSub };
}

function subCurrentEquity(groupState, subId) {
  const rows = groupState.translatedTBs[subId] || groupState.trialBalances[subId] || [];
  let equity = 0;
  for (const r of rows) {
    const cls = r.class || classifyAccount({ code: r.groupCode || r.code });
    if (cls === ACCOUNT_CLASS.EQUITY) equity += toNum(r.balance);
  }
  return round2(equity);
}

// ═══════════════════════════════════════════════════════════════
// CONSOLIDATION DRIVER
// ═══════════════════════════════════════════════════════════════

/**
 * Consolidate the group for the given period.
 *
 * options: { period, rates }
 *   rates: { subId: { closing, average, historical? } } OR a shared rate map.
 *
 * Returns:
 *   {
 *     period,
 *     consolidatedTB[],
 *     eliminations[],
 *     NCI: { total, perSub },
 *     goodwill: { total, perSub },
 *     reportPack: { balanceSheet, incomeStatement, equityRoll },
 *     auditTrail[]
 *   }
 */
function consolidate(groupState, options) {
  if (!groupState || !groupState.parent) {
    throw new Error('consolidate: invalid group state');
  }
  const opts = options || {};
  const period = opts.period || 'UNSPECIFIED';
  const rates = opts.rates || {};

  // 1. Translate all subs to presentation currency
  const ctaPerEntity = translateGroup(groupState, rates);

  // 2. Aggregate all translated TBs into a single pool by group account
  const aggregated = {};
  const contributions = {};

  function addToAggregate(entityId, row) {
    const key = row.groupCode || row.code;
    const cls = row.class || classifyAccount({ code: key });
    if (!aggregated[key]) {
      aggregated[key] = {
        groupCode: key,
        class: cls,
        label_he: row.label_he || '',
        label_en: row.label_en || '',
        debit: 0,
        credit: 0,
        balance: 0,
        contributors: [],
      };
    }
    aggregated[key].debit = round2(aggregated[key].debit + toNum(row.debit));
    aggregated[key].credit = round2(aggregated[key].credit + toNum(row.credit));
    aggregated[key].balance = round2(aggregated[key].balance + toNum(row.balance));
    aggregated[key].contributors.push({
      entityId,
      debit: toNum(row.debit),
      credit: toNum(row.credit),
      balance: toNum(row.balance),
    });
  }

  // parent contributes fully
  for (const r of groupState.translatedTBs[groupState.parent.id] || []) {
    addToAggregate(groupState.parent.id, r);
  }
  contributions[groupState.parent.id] = {
    method: 'parent',
    rows: (groupState.translatedTBs[groupState.parent.id] || []).length,
  };

  for (const sub of groupState.subs) {
    const rows = groupState.translatedTBs[sub.id] || [];
    contributions[sub.id] = {
      method: sub.method,
      rows: rows.length,
      ownership: sub.ownership,
    };
    if (sub.method === CONSOLIDATION_METHOD.FULL) {
      for (const r of rows) addToAggregate(sub.id, r);
    } else if (sub.method === CONSOLIDATION_METHOD.EQUITY) {
      // Equity method: do not aggregate sub lines. The parent already
      // carries the investment at cost. We only post the adjustment
      // (ownership * post-acq equity movement) — a debit to investment
      // and a credit to equity-method income. If the parent has no
      // pre-existing investment line, we also seed the initial cost.
      const { adjustmentInvestment, adjustmentIncome, seedInvestment } =
        buildEquityMethodAdjustment(groupState, sub, rows);
      if (seedInvestment) addToAggregate(sub.id, seedInvestment);
      if (adjustmentInvestment) addToAggregate(sub.id, adjustmentInvestment);
      if (adjustmentIncome) addToAggregate(sub.id, adjustmentIncome);
    } else {
      // Cost method: investment stays at cost. If parent already has
      // the line we leave it; otherwise seed from acquisition record.
      const existing = hasExistingInvestmentLine(groupState, '1850');
      if (!existing) {
        const costRow = buildCostMethodRow(groupState, sub);
        if (costRow) addToAggregate(sub.id, costRow);
      }
    }
  }

  // 3. Book CTA as equity line (OCI). CTA is a credit-natured equity plug;
  // positive balance → credit side, negative → debit side.
  let totalCTA = 0;
  for (const entId in ctaPerEntity) {
    totalCTA = round2(totalCTA + toNum(ctaPerEntity[entId]));
  }
  if (totalCTA !== 0) {
    addToAggregate('group', {
      groupCode: '3500',
      class: ACCOUNT_CLASS.EQUITY,
      label_he: LABELS.cta.he,
      label_en: LABELS.cta.en,
      debit: totalCTA < 0 ? -totalCTA : 0,
      credit: totalCTA > 0 ? totalCTA : 0,
      balance: totalCTA,
    });
  }

  // 4. Build eliminations: IC transactions
  const icElims = buildEliminations(groupState);

  // 5. Build eliminations: investment <-> equity + goodwill + NCI
  const { elims: invElims, goodwillPerSub, nciPerSub } =
    eliminateInvestmentAndComputeGoodwill(groupState);

  const allElims = icElims.concat(invElims);

  // 6. Apply eliminations to aggregate
  for (const e of allElims) {
    if (!e.groupCode || e.groupCode === 'X') continue;
    if (e.amount === 0) continue;
    addToAggregate('elim', {
      groupCode: e.groupCode,
      class: e.class,
      label_he: e.label || '',
      label_en: e.label || '',
      debit: e.class === ACCOUNT_CLASS.ASSET || e.class === ACCOUNT_CLASS.EXPENSE
        ? (e.amount > 0 ? e.amount : 0)
        : (e.amount < 0 ? -e.amount : 0),
      credit: e.class === ACCOUNT_CLASS.ASSET || e.class === ACCOUNT_CLASS.EXPENSE
        ? (e.amount < 0 ? -e.amount : 0)
        : (e.amount > 0 ? e.amount : 0),
      balance: e.amount,
    });
  }

  // 7. Materialize consolidated TB (sorted by code). We rebuild debit/credit
  // from the signed balance so that final d/c always ties out even if
  // contributing rows came from different currencies / rates.
  const consolidatedTB = Object.values(aggregated)
    .map((r) => {
      const bal = round2(r.balance);
      const natDebit = r.class === ACCOUNT_CLASS.ASSET || r.class === ACCOUNT_CLASS.EXPENSE;
      const debit = natDebit
        ? (bal >= 0 ? bal : 0)
        : (bal < 0 ? -bal : 0);
      const credit = natDebit
        ? (bal < 0 ? -bal : 0)
        : (bal >= 0 ? bal : 0);
      return {
        groupCode: r.groupCode,
        class: r.class,
        label_he: r.label_he,
        label_en: r.label_en,
        debit: round2(debit),
        credit: round2(credit),
        balance: bal,
      };
    })
    .sort((a, b) => String(a.groupCode).localeCompare(String(b.groupCode)));

  // 8. Totals
  const totalGoodwill = round2(
    Object.values(goodwillPerSub).reduce((s, v) => s + toNum(v), 0)
  );
  const totalNCI = round2(
    Object.values(nciPerSub).reduce((s, v) => s + toNum(v), 0)
  );

  // 9. Report pack
  const reportPack = buildReportPack(consolidatedTB, {
    goodwill: totalGoodwill,
    nci: totalNCI,
    cta: totalCTA,
    period,
  });

  // 10. Snapshot for comparatives
  groupState.snapshots[period] = {
    period,
    consolidatedTB: deepClone(consolidatedTB),
    eliminations: deepClone(allElims),
    NCI: { total: totalNCI, perSub: deepClone(nciPerSub) },
    goodwill: { total: totalGoodwill, perSub: deepClone(goodwillPerSub) },
    cta: totalCTA,
    reportPack: deepClone(reportPack),
    at: new Date().toISOString(),
  };

  pushAudit(groupState, 'CONSOLIDATION_COMPLETE', {
    period,
    consolidatedRows: consolidatedTB.length,
    eliminations: allElims.length,
    goodwill: totalGoodwill,
    nci: totalNCI,
    cta: totalCTA,
  });

  return {
    period,
    consolidatedTB,
    eliminations: allElims,
    NCI: { total: totalNCI, perSub: goodwillPerSub ? nciPerSub : {} },
    goodwill: { total: totalGoodwill, perSub: goodwillPerSub },
    cta: totalCTA,
    contributions,
    reportPack,
    auditTrail: deepClone(groupState.auditTrail),
  };
}

function buildEquityMethodRow(groupState, sub, subRows) {
  // Legacy helper — returns a full carrying-amount row. Retained for
  // backwards-compat use; the driver now prefers buildEquityMethodAdjustment.
  const acq = groupState.acquisition[sub.id] || {};
  const cost = toNum(acq.costOfInvestment);
  const netAssetsAtAcq = toNum(acq.netAssetsAtAcquisition);
  let currentEquity = 0;
  for (const r of subRows) {
    const cls = r.class || classifyAccount({ code: r.groupCode || r.code });
    if (cls === ACCOUNT_CLASS.EQUITY) currentEquity += toNum(r.balance);
  }
  const share = toNum(sub.ownership) * (currentEquity - netAssetsAtAcq);
  const carrying = round2(cost + share);
  return {
    groupCode: '1820',
    class: ACCOUNT_CLASS.ASSET,
    label_he: LABELS.associate.he + ' ' + sub.id,
    label_en: LABELS.associate.en + ' ' + sub.id,
    debit: carrying > 0 ? carrying : 0,
    credit: carrying < 0 ? -carrying : 0,
    balance: carrying,
  };
}

/**
 * Equity method bookings — produce journal adjustments to be added on top
 * of the parent's existing investment carrying amount. Returns up to three
 * synthetic rows:
 *   seedInvestment      — only if parent has no investment line yet
 *   adjustmentInvestment — DR Investment (asset) by share of post-acq profit
 *   adjustmentIncome     — CR Equity-method income (revenue) by same amount
 */
function buildEquityMethodAdjustment(groupState, sub, subRows) {
  const acq = groupState.acquisition[sub.id] || {};
  const cost = round2(toNum(acq.costOfInvestment));
  const netAssetsAtAcq = toNum(acq.netAssetsAtAcquisition);
  let currentEquity = 0;
  for (const r of subRows) {
    const cls = r.class || classifyAccount({ code: r.groupCode || r.code });
    if (cls === ACCOUNT_CLASS.EQUITY) currentEquity += toNum(r.balance);
  }
  const share = round2(toNum(sub.ownership) * (currentEquity - netAssetsAtAcq));

  const hasInvLine = hasExistingInvestmentLine(groupState, '1820');
  const seedInvestment = hasInvLine || cost === 0 ? null : {
    groupCode: '1820',
    class: ACCOUNT_CLASS.ASSET,
    label_he: LABELS.associate.he + ' ' + sub.id,
    label_en: LABELS.associate.en + ' ' + sub.id,
    debit: cost,
    credit: 0,
    balance: cost,
  };

  const adjustmentInvestment = share === 0 ? null : {
    groupCode: '1820',
    class: ACCOUNT_CLASS.ASSET,
    label_he: LABELS.associate.he + ' (adj) ' + sub.id,
    label_en: LABELS.associate.en + ' (adj) ' + sub.id,
    debit: share > 0 ? share : 0,
    credit: share < 0 ? -share : 0,
    balance: share,
  };
  const adjustmentIncome = share === 0 ? null : {
    groupCode: '4820',
    class: ACCOUNT_CLASS.REVENUE,
    label_he: 'רווח שווי מאזני ' + sub.id,
    label_en: 'Equity-method income ' + sub.id,
    debit: share < 0 ? -share : 0,
    credit: share > 0 ? share : 0,
    balance: share,
  };
  return { seedInvestment, adjustmentInvestment, adjustmentIncome };
}

function hasExistingInvestmentLine(groupState, code) {
  const parentRows = groupState.translatedTBs[groupState.parent.id] ||
                     groupState.trialBalances[groupState.parent.id] || [];
  for (const r of parentRows) {
    if ((r.groupCode || r.localCode) === code && toNum(r.balance) !== 0) return true;
  }
  return false;
}

function buildCostMethodRow(groupState, sub) {
  const acq = groupState.acquisition[sub.id] || {};
  const cost = round2(toNum(acq.costOfInvestment));
  if (cost === 0) return null;
  return {
    groupCode: '1850',
    class: ACCOUNT_CLASS.ASSET,
    label_he: LABELS.investment.he + ' ' + sub.id,
    label_en: LABELS.investment.en + ' ' + sub.id,
    debit: cost,
    credit: 0,
    balance: cost,
  };
}

// ═══════════════════════════════════════════════════════════════
// STATEMENT ASSEMBLY
// ═══════════════════════════════════════════════════════════════

function buildReportPack(consolidatedTB, extras) {
  const bs = { assets: [], liabilities: [], equity: [] };
  const is = { revenue: [], expenses: [] };
  let totalAssets = 0, totalLiabilities = 0, totalEquity = 0;
  let totalRev = 0, totalExp = 0;

  for (const r of consolidatedTB) {
    if (r.class === ACCOUNT_CLASS.ASSET) {
      bs.assets.push(r);
      totalAssets += toNum(r.balance);
    } else if (r.class === ACCOUNT_CLASS.LIABILITY) {
      bs.liabilities.push(r);
      totalLiabilities += toNum(r.balance);
    } else if (r.class === ACCOUNT_CLASS.EQUITY) {
      bs.equity.push(r);
      totalEquity += toNum(r.balance);
    } else if (r.class === ACCOUNT_CLASS.REVENUE) {
      is.revenue.push(r);
      totalRev += toNum(r.balance);
    } else if (r.class === ACCOUNT_CLASS.EXPENSE) {
      is.expenses.push(r);
      totalExp += toNum(r.balance);
    }
  }

  const netIncome = round2(totalRev - totalExp);
  totalAssets = round2(totalAssets);
  totalLiabilities = round2(totalLiabilities);
  totalEquity = round2(totalEquity);

  return {
    period: extras.period,
    balanceSheet: {
      label: LABELS.consolidated.he + ' / ' + LABELS.consolidated.en,
      assets: bs.assets,
      liabilities: bs.liabilities,
      equity: bs.equity,
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        liabilitiesAndEquity: round2(totalLiabilities + totalEquity),
      },
      memos: {
        goodwill: round2(extras.goodwill || 0),
        nci: round2(extras.nci || 0),
        cta: round2(extras.cta || 0),
      },
    },
    incomeStatement: {
      label: LABELS.net_income.he + ' / ' + LABELS.net_income.en,
      revenue: is.revenue,
      expenses: is.expenses,
      totals: {
        revenue: round2(totalRev),
        expenses: round2(totalExp),
        netIncome,
      },
    },
    equityRoll: {
      openingEquity: null,
      netIncome,
      cta: round2(extras.cta || 0),
      closingEquity: round2(totalEquity),
      nci: round2(extras.nci || 0),
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Confirm debits = credits and assets = liabilities + equity
 */
function verifyEquality(consolidatedTB) {
  if (!Array.isArray(consolidatedTB)) {
    return { balanced: false, deltas: { reason: 'not an array' } };
  }
  let totalDebit = 0, totalCredit = 0;
  let a = 0, l = 0, eq = 0, r = 0, x = 0;
  for (const row of consolidatedTB) {
    totalDebit += toNum(row.debit);
    totalCredit += toNum(row.credit);
    switch (row.class) {
      case ACCOUNT_CLASS.ASSET: a += toNum(row.balance); break;
      case ACCOUNT_CLASS.LIABILITY: l += toNum(row.balance); break;
      case ACCOUNT_CLASS.EQUITY: eq += toNum(row.balance); break;
      case ACCOUNT_CLASS.REVENUE: r += toNum(row.balance); break;
      case ACCOUNT_CLASS.EXPENSE: x += toNum(row.balance); break;
      default: break;
    }
  }
  const netIncome = r - x;
  // extended equity includes current period profit
  const extendedEquity = round2(eq + netIncome);
  const dcDelta = round2(totalDebit - totalCredit);
  const balanceDelta = round2(a - (l + extendedEquity));
  const balancedDC = Math.abs(dcDelta) <= ROUNDING_TOLERANCE;
  const balancedBS = Math.abs(balanceDelta) <= ROUNDING_TOLERANCE;
  return {
    balanced: balancedDC && balancedBS,
    deltas: {
      debitCreditDelta: dcDelta,
      balanceSheetDelta: balanceDelta,
      totals: {
        debit: round2(totalDebit),
        credit: round2(totalCredit),
        assets: round2(a),
        liabilities: round2(l),
        equity: round2(eq),
        netIncome: round2(netIncome),
        extendedEquity,
      },
    },
    label: balancedDC && balancedBS ? LABELS.balanced : LABELS.unbalanced,
  };
}

// ═══════════════════════════════════════════════════════════════
// PRIOR-YEAR COMPARATIVE
// ═══════════════════════════════════════════════════════════════

/**
 * Given a period and a stored previous period, produce a side-by-side
 * comparative consolidation. Requires both snapshots to be present.
 */
function prioryearComparative(groupState, period, priorPeriod) {
  if (!groupState || !groupState.snapshots) {
    return { error: 'no snapshots' };
  }
  const snap = groupState.snapshots[period];
  if (!snap) return { error: 'period not consolidated: ' + period };
  const priorKey = priorPeriod || findPriorSnapshot(groupState, period);
  const prior = priorKey ? groupState.snapshots[priorKey] : null;

  const current = indexByCode(snap.consolidatedTB);
  const previous = prior ? indexByCode(prior.consolidatedTB) : {};
  const codes = Array.from(new Set([...Object.keys(current), ...Object.keys(previous)])).sort();

  const rows = codes.map((code) => {
    const c = current[code] || { balance: 0, class: null, label_he: '', label_en: '' };
    const p = previous[code] || { balance: 0, class: null };
    const delta = round2(toNum(c.balance) - toNum(p.balance));
    const pct = toNum(p.balance) !== 0 ? round2((delta / toNum(p.balance)) * 100) : null;
    return {
      groupCode: code,
      class: c.class || p.class,
      label_he: c.label_he || '',
      label_en: c.label_en || '',
      current: round2(toNum(c.balance)),
      prior: round2(toNum(p.balance)),
      delta,
      deltaPct: pct,
    };
  });

  return {
    period,
    priorPeriod: priorKey,
    rows,
    current: { totals: snap.reportPack.balanceSheet.totals },
    prior: prior ? { totals: prior.reportPack.balanceSheet.totals } : null,
  };
}

function indexByCode(tb) {
  const out = {};
  for (const r of tb || []) {
    out[r.groupCode || r.code] = r;
  }
  return out;
}

function findPriorSnapshot(groupState, period) {
  const keys = Object.keys(groupState.snapshots || {}).filter((k) => k !== period);
  if (keys.length === 0) return null;
  keys.sort();
  const idx = keys.findIndex((k) => k > period);
  if (idx === 0) return null;
  if (idx === -1) return keys[keys.length - 1];
  return keys[idx - 1];
}

// ═══════════════════════════════════════════════════════════════
// AUDIT PACKAGE
// ═══════════════════════════════════════════════════════════════

/**
 * Build working-paper bundle for external audit — includes all inputs,
 * every translation rate, every elimination, every goodwill / NCI
 * calculation, and the audit trail.
 */
function auditPackage(groupState, period) {
  if (!groupState) return { error: 'no group' };
  const snap = groupState.snapshots[period];
  const pkg = {
    generatedAt: new Date().toISOString(),
    period,
    group: {
      parent: deepClone(groupState.parent),
      subs: deepClone(groupState.subs),
    },
    acquisition: deepClone(groupState.acquisition),
    coaMappings: deepClone(groupState.mappings),
    accountCatalog: deepClone(groupState.accountCatalog),
    trialBalancesRaw: deepClone(groupState.trialBalances),
    trialBalancesTranslated: deepClone(groupState.translatedTBs),
    intercompany: deepClone(groupState.intercompany),
    snapshot: snap ? deepClone(snap) : null,
    verification: snap ? verifyEquality(snap.consolidatedTB) : null,
    auditTrail: deepClone(groupState.auditTrail),
    labels: deepClone(LABELS),
    tieOuts: snap ? buildTieOuts(snap) : null,
  };
  return pkg;
}

function buildTieOuts(snap) {
  const totals = snap.reportPack.balanceSheet.totals;
  return {
    assetsTieOut: round2(totals.assets),
    liabilitiesAndEquityTieOut: round2(totals.liabilitiesAndEquity),
    netIncomeTieOut: round2(snap.reportPack.incomeStatement.totals.netIncome),
    goodwillTieOut: round2(snap.goodwill.total),
    nciTieOut: round2(snap.NCI.total),
    ctaTieOut: round2(snap.cta),
  };
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // constants
  LABELS,
  CONSOLIDATION_METHOD,
  OWNERSHIP_THRESHOLDS,
  ACCOUNT_CLASS,
  ELIMINATION_TYPE,
  ROUNDING_TOLERANCE,

  // group setup
  defineGroup,
  mapAccounts,
  loadTrialBalance,
  addIntercompany,

  // core
  translate,
  translateGroup,
  consolidate,
  verifyEquality,
  prioryearComparative,
  auditPackage,

  // lower-level helpers (exposed for tests & interop)
  _internals: {
    classifyAccount,
    debitCreditToSigned,
    resolveConsolidationMethod,
    resolveGroupAccount,
    buildEliminations,
    eliminateInvestmentAndComputeGoodwill,
    buildEquityMethodRow,
    buildCostMethodRow,
    buildReportPack,
    deepClone,
    round2,
    sum,
    isBalanceSheet,
    isIncomeStatement,
    pushAudit,
  },
};
