/**
 * pnl-drilldown.js — מנוע פירוט דוח רווח והפסד / P&L Drill-Down Engine
 * Agent Y-182 / Swarm Reporting / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Hierarchical Profit & Loss drill-down engine for the Israeli chart of
 * accounts (תקינה ישראלית → Form 6111 row mapping).
 *
 * Given a FLAT list of accounts plus a period-to-period amount feed, this
 * module produces a fully materialised tree with:
 *
 *   • Parent → child hierarchy based on `parentCode` edges.
 *   • Aggregated current / prior / budget amounts rolled UP from leaves.
 *   • Variance vs. prior period (absolute + % + direction)
 *   • Variance vs. budget         (absolute + % + direction)
 *   • Contribution % of parent (node.current / parent.current * 100)
 *   • Gross / Operating / Net margin at every node (vs. top-level revenue)
 *   • Israeli Form 6111 row mapping per leaf and rolled-up section code
 *   • Bilingual account names  — { he, en } preserved on every node
 *   • NIS formatting helpers   — he-IL locale, ILS currency
 *   • drill(accountCode)       — zoom into a node and its immediate children
 *
 * Rule of engagement: "לא מוחקים רק משדרגים ומגדלים" — the engine is
 * append-only. No mutation of caller input; no destructive operations;
 * errors on malformed trees are thrown, never silently swallowed.
 *
 * Node.js built-ins only — zero external dependencies. Importable from the
 * browser bundle via webpack / esbuild as-is.
 *
 * ---------------------------------------------------------------------------
 * Public API:
 *
 *   const { PnLDrilldown, formatNIS, SECTION_MAP } = require('./pnl-drilldown');
 *
 *   const engine = new PnLDrilldown({ locale: 'he-IL' });
 *   engine.buildTree(accounts, amounts);
 *   const revenueNode = engine.drill('4000');      // zoom to revenue section
 *   const marginInfo  = engine.getMargins('6000'); // gross/op/net at node
 *   const report      = engine.renderReport();    // bilingual markdown
 *
 * Data shapes:
 *
 *   Account       = {
 *     code: '4000',
 *     parentCode: null | '3000',
 *     he: 'הכנסות ממכירות',
 *     en: 'Sales revenue',
 *     type: 'revenue' | 'cogs' | 'expense' | 'financial' | 'tax',
 *     form6111Row?: 1010,      // optional explicit row code
 *   }
 *
 *   Amount        = {
 *     code: '4000',
 *     current: 125000,         // NIS, signed for expenses/revenue as stored
 *     prior?:   110000,
 *     budget?:  120000,
 *   }
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// 1. CONSTANTS — Israeli P&L categories and Form 6111 section ranges
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canonical P&L account types used by the engine. Each node is classified
 * into exactly one of these buckets for margin calculation purposes.
 */
const PNL_TYPE = Object.freeze({
  REVENUE:   'revenue',
  COGS:      'cogs',
  EXPENSE:   'expense',   // operating / G&A / selling / marketing
  FINANCIAL: 'financial', // interest, FX, bank charges
  TAX:       'tax',       // corporate tax, withholding
  OTHER:     'other',     // extraordinary / non-classified
});

/**
 * SECTION_MAP — bilingual section descriptors aligned to Form 6111 row
 * ranges (see onyx-procurement/src/tax/form-6111.js for full COA).
 *
 * Order is the canonical printing order of the income statement.
 */
const SECTION_MAP = Object.freeze([
  {
    id: 'REVENUES',
    he: 'הכנסות',
    en: 'Revenues',
    type: PNL_TYPE.REVENUE,
    range: [1000, 1999],
    sign: +1,
  },
  {
    id: 'COGS',
    he: 'עלות המכירות',
    en: 'Cost of Goods Sold',
    type: PNL_TYPE.COGS,
    range: [2000, 2999],
    sign: -1,
  },
  {
    id: 'OPEX',
    he: 'הוצאות תפעוליות',
    en: 'Operating Expenses',
    type: PNL_TYPE.EXPENSE,
    range: [3000, 4999],
    sign: -1,
  },
  {
    id: 'FINANCIAL',
    he: 'הכנסות והוצאות מימון',
    en: 'Financial Items',
    type: PNL_TYPE.FINANCIAL,
    range: [5000, 5999],
    sign: -1,
  },
  {
    id: 'EXTRAORDINARY',
    he: 'הכנסות והוצאות חד-פעמיות',
    en: 'Extraordinary Items',
    type: PNL_TYPE.OTHER,
    range: [6000, 6999],
    sign: -1,
  },
]);

/**
 * CORPORATE_TAX_RATE_2026 — Israeli corporate tax rate used only when the
 * caller does not provide an explicit tax line. 23% since 2018.
 */
const CORPORATE_TAX_RATE_2026 = 0.23;

// ═══════════════════════════════════════════════════════════════════════════
// 2. NUMERIC HELPERS — rounding, safe math, formatting
// ═══════════════════════════════════════════════════════════════════════════

/** Round to 2 decimal places to avoid binary float drift. */
function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Round to 4 decimal places — used when propagating ratios. */
function r4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

/** Coerce to number; non-numeric → 0. */
function num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Sum a list of numbers safely, rounding at the end. */
function sum(arr) {
  return r2((arr || []).reduce((a, b) => a + num(b), 0));
}

/**
 * Percentage change from oldVal → newVal.
 *   - Returns null when the base is zero (division-by-zero is not a number).
 *   - Returned value is already rounded to 2 decimals (i.e. 12.34 means 12.34%).
 */
function pctChange(newVal, oldVal) {
  const a = num(oldVal);
  const b = num(newVal);
  if (a === 0) return null;
  return r2(((b - a) / Math.abs(a)) * 100);
}

/**
 * Variance descriptor produced by varianceVsPrior / varianceVsBudget.
 *   absolute: signed difference (current - baseline)
 *   percent : signed percentage (null on zero baseline)
 *   direction: 'up' | 'down' | 'flat'
 *   favorable: boolean — up is favorable for revenue, down for expenses
 */
function varianceObj({ current, baseline, sign }) {
  const abs = r2(num(current) - num(baseline));
  const pct = pctChange(current, baseline);
  let direction = 'flat';
  if (abs > 0.005) direction = 'up';
  else if (abs < -0.005) direction = 'down';
  const favorable = sign > 0
    ? direction === 'up'
    : direction === 'down';
  return {
    absolute: abs,
    percent:  pct,
    direction,
    favorable: direction === 'flat' ? null : favorable,
  };
}

/**
 * Format a number as NIS currency in he-IL locale.
 *   formatNIS(1234.5) → '‏1,234.50 ₪' (or similar, depending on runtime ICU).
 * When Intl is unavailable (very old Node), falls back to a plain ₪ suffix.
 */
function formatNIS(n, locale) {
  const value = num(n);
  const loc = locale || 'he-IL';
  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency: 'ILS',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (_err) {
    // Fallback for environments without Intl ICU
    const fixed = Math.abs(value).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const sign = value < 0 ? '-' : '';
    return `${sign}${fixed} ₪`;
  }
}

/** Format a percentage rounded to 2 decimals, with null-safety. */
function formatPct(p) {
  if (p == null || Number.isNaN(p)) return '—';
  return `${r2(p).toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. SECTION / TYPE RESOLVERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a form-6111 row code (or a numeric account code that looks like a row)
 * to its canonical section descriptor. Returns null if out of range.
 */
function resolveSection(rowCode) {
  const n = Number(rowCode);
  if (!Number.isFinite(n)) return null;
  for (const section of SECTION_MAP) {
    if (n >= section.range[0] && n <= section.range[1]) return section;
  }
  return null;
}

/**
 * Resolve an account's canonical PNL type. Explicit `type` wins; otherwise
 * the account's 6111 row / code is scanned against SECTION_MAP ranges.
 */
function resolvePnlType(account) {
  if (!account) return PNL_TYPE.OTHER;
  if (account.type && Object.values(PNL_TYPE).includes(account.type)) {
    return account.type;
  }
  const row = account.form6111Row != null
    ? account.form6111Row
    : Number.parseInt(String(account.code || '').replace(/[^0-9]/g, ''), 10);
  const section = resolveSection(row);
  return section ? section.type : PNL_TYPE.OTHER;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PnLDrilldown CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hierarchical P&L drill-down engine.
 *
 * Typical usage:
 *
 *   const engine = new PnLDrilldown({ locale: 'he-IL' });
 *   engine.buildTree(accounts, amounts);
 *   engine.drill('4000');             // immediate children of node 4000
 *   engine.varianceVsPrior('4000');   // variance object for one node
 *   engine.getMargins();              // top-level gross/op/net margins
 *   engine.renderReport({ lang: 'bi' });  // bilingual text report
 */
class PnLDrilldown {
  /**
   * @param {object} opts
   * @param {string} [opts.locale='he-IL']         — Intl locale for NIS formatting
   * @param {number} [opts.corporateTaxRate]       — override default 23%
   * @param {boolean}[opts.strict=true]            — throw on malformed input
   */
  constructor(opts = {}) {
    this.locale = opts.locale || 'he-IL';
    this.corporateTaxRate = opts.corporateTaxRate != null
      ? Number(opts.corporateTaxRate)
      : CORPORATE_TAX_RATE_2026;
    this.strict = opts.strict !== false;

    /** @type {Map<string, object>} keyed by account code → full node */
    this.nodes = new Map();
    /** Root-level nodes (no parent or parent not present in tree). */
    this.roots = [];
    /** Cached top-level aggregates populated by buildTree. */
    this.totals = null;
    /** Raw inputs kept (never mutated) for audit reproducibility. */
    this._rawAccounts = null;
    this._rawAmounts  = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.1 buildTree — ingest and materialise the hierarchy
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Ingest a flat chart-of-accounts + an amount feed and materialise the
   * full hierarchical tree with all rolled-up metrics.
   *
   * @param {Account[]} accounts — flat list of accounts with parentCode edges
   * @param {Amount[]}  amounts  — period amounts keyed by account code
   * @returns {object[]} root nodes (also accessible on `engine.roots`)
   */
  buildTree(accounts, amounts) {
    if (!Array.isArray(accounts)) {
      throw new TypeError('accounts must be an array');
    }
    if (amounts != null && !Array.isArray(amounts)) {
      throw new TypeError('amounts must be an array or null');
    }

    // preserve the caller's input untouched
    this._rawAccounts = accounts.map((a) => ({ ...a }));
    this._rawAmounts  = (amounts || []).map((a) => ({ ...a }));

    // index amounts by code for O(1) lookup
    const amountByCode = new Map();
    for (const rec of this._rawAmounts) {
      if (!rec || rec.code == null) continue;
      amountByCode.set(String(rec.code), {
        current: num(rec.current),
        prior:   rec.prior  != null ? num(rec.prior)  : null,
        budget:  rec.budget != null ? num(rec.budget) : null,
      });
    }

    // 1. materialise bare nodes
    this.nodes = new Map();
    for (const acc of this._rawAccounts) {
      if (!acc || acc.code == null) {
        if (this.strict) throw new Error('account missing required `code` field');
        continue;
      }
      const code = String(acc.code);
      if (this.nodes.has(code)) {
        if (this.strict) throw new Error(`duplicate account code: ${code}`);
        continue;
      }
      const amt = amountByCode.get(code) || { current: 0, prior: null, budget: null };
      const pnlType = resolvePnlType(acc);
      const row = acc.form6111Row != null
        ? Number(acc.form6111Row)
        : Number.parseInt(String(code).replace(/[^0-9]/g, ''), 10);
      const section = resolveSection(row);

      this.nodes.set(code, {
        code,
        parentCode: acc.parentCode != null ? String(acc.parentCode) : null,
        he: acc.he || acc.nameHe || acc.name_he || '',
        en: acc.en || acc.nameEn || acc.name_en || '',
        type: pnlType,
        form6111Row: Number.isFinite(row) ? row : null,
        section: section ? { id: section.id, he: section.he, en: section.en } : null,
        sectionSign: section ? section.sign : 0,

        // amounts on this node alone (before roll-up)
        own: { ...amt },
        // rolled-up totals (populated in step 3)
        current: 0,
        prior:   null,
        budget:  null,

        children: [],
        parent: null,
        depth: 0,
        // derived metrics filled in step 4
        contributionPct: null,
        varianceVsPrior:  null,
        varianceVsBudget: null,
        grossMargin:      null,
        operatingMargin:  null,
        netMargin:        null,
      });
    }

    // 2. wire parent → child edges
    this.roots = [];
    for (const node of this.nodes.values()) {
      if (node.parentCode && this.nodes.has(node.parentCode)) {
        const parent = this.nodes.get(node.parentCode);
        parent.children.push(node);
        node.parent = parent;
      } else {
        this.roots.push(node);
      }
    }

    // 2b. detect cycles (DFS depth assignment)
    const seen = new Set();
    const inStack = new Set();
    const assignDepth = (node, depth) => {
      if (inStack.has(node.code)) {
        throw new Error(`cycle detected in account hierarchy at: ${node.code}`);
      }
      inStack.add(node.code);
      node.depth = depth;
      seen.add(node.code);
      for (const ch of node.children) assignDepth(ch, depth + 1);
      inStack.delete(node.code);
    };
    for (const root of this.roots) assignDepth(root, 0);

    // 3. roll amounts UP from leaves — post-order traversal
    const rollup = (node) => {
      if (node.children.length === 0) {
        node.current = r2(node.own.current);
        node.prior   = node.own.prior  != null ? r2(node.own.prior)  : null;
        node.budget  = node.own.budget != null ? r2(node.own.budget) : null;
        return;
      }
      let cur = num(node.own.current);
      let pri = node.own.prior  != null ? num(node.own.prior)  : 0;
      let bud = node.own.budget != null ? num(node.own.budget) : 0;
      let priHas = node.own.prior  != null;
      let budHas = node.own.budget != null;
      for (const ch of node.children) {
        rollup(ch);
        cur += num(ch.current);
        if (ch.prior != null)  { pri += num(ch.prior);  priHas = true; }
        if (ch.budget != null) { bud += num(ch.budget); budHas = true; }
      }
      node.current = r2(cur);
      node.prior   = priHas ? r2(pri) : null;
      node.budget  = budHas ? r2(bud) : null;
    };
    for (const root of this.roots) rollup(root);

    // 4. compute top-level aggregates (revenue / cogs / opex / financial / tax)
    this.totals = this._computeTotals();

    // 5. fill derived metrics — contribution %, variances, margins
    const fillDerived = (node) => {
      if (node.parent) {
        const base = num(node.parent.current);
        node.contributionPct = base !== 0
          ? r2((num(node.current) / base) * 100)
          : null;
      } else {
        node.contributionPct = null;
      }
      node.varianceVsPrior  = this._variance(node, 'prior');
      node.varianceVsBudget = this._variance(node, 'budget');
      const margins = this._marginsForNode(node);
      node.grossMargin     = margins.grossMargin;
      node.operatingMargin = margins.operatingMargin;
      node.netMargin       = margins.netMargin;
      for (const ch of node.children) fillDerived(ch);
    };
    for (const root of this.roots) fillDerived(root);

    return this.roots;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.2 totals — revenue / cogs / opex / financial / tax
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Compute top-level totals by summing across all nodes whose type matches
   * the bucket. Because only LEAF `own` amounts are stored pre-rollup, the
   * safest aggregation is over all nodes without children (leaves).
   *
   * Signed convention:
   *   Revenue is positive. COGS / expenses / financial net / tax are stored
   *   as positive magnitudes and SUBTRACTED from revenue when computing
   *   gross / operating / net profit. If a caller stores expenses as
   *   negative numbers we take `Math.abs` on the totals so margins are
   *   always consistent regardless of input sign convention.
   */
  _computeTotals() {
    const bucket = {
      revenue: { current: 0, prior: 0, budget: 0, hasPrior: false, hasBudget: false },
      cogs:    { current: 0, prior: 0, budget: 0, hasPrior: false, hasBudget: false },
      expense: { current: 0, prior: 0, budget: 0, hasPrior: false, hasBudget: false },
      financial:{current: 0, prior: 0, budget: 0, hasPrior: false, hasBudget: false },
      tax:     { current: 0, prior: 0, budget: 0, hasPrior: false, hasBudget: false },
      other:   { current: 0, prior: 0, budget: 0, hasPrior: false, hasBudget: false },
    };

    for (const node of this.nodes.values()) {
      if (node.children.length > 0) continue; // only leaves
      const t = node.type in bucket ? node.type : 'other';
      const b = bucket[t];
      const signMul = t === 'revenue' ? 1 : 1; // magnitudes summed; sign applied later
      b.current += Math.abs(num(node.own.current)) * signMul;
      if (node.own.prior != null)  { b.prior  += Math.abs(num(node.own.prior));  b.hasPrior  = true; }
      if (node.own.budget != null) { b.budget += Math.abs(num(node.own.budget)); b.hasBudget = true; }
    }

    const finalize = (b) => ({
      current: r2(b.current),
      prior:   b.hasPrior  ? r2(b.prior)  : null,
      budget:  b.hasBudget ? r2(b.budget) : null,
    });

    const revenue   = finalize(bucket.revenue);
    const cogs      = finalize(bucket.cogs);
    const expense   = finalize(bucket.expense);
    const financial = finalize(bucket.financial);
    let   tax       = finalize(bucket.tax);
    const other     = finalize(bucket.other);

    // Derived lines — always computed from magnitudes
    const grossProfit = {
      current: r2(revenue.current - cogs.current),
      prior:   revenue.prior  != null && cogs.prior  != null ? r2(revenue.prior  - cogs.prior)  : null,
      budget:  revenue.budget != null && cogs.budget != null ? r2(revenue.budget - cogs.budget) : null,
    };
    const operatingProfit = {
      current: r2(grossProfit.current - expense.current),
      prior:   grossProfit.prior  != null && expense.prior  != null ? r2(grossProfit.prior  - expense.prior)  : null,
      budget:  grossProfit.budget != null && expense.budget != null ? r2(grossProfit.budget - expense.budget) : null,
    };
    const preTaxProfit = {
      current: r2(operatingProfit.current - financial.current + other.current),
      prior:   operatingProfit.prior  != null ? r2(operatingProfit.prior  - (financial.prior  || 0) + (other.prior  || 0)) : null,
      budget:  operatingProfit.budget != null ? r2(operatingProfit.budget - (financial.budget || 0) + (other.budget || 0)) : null,
    };
    // Synthetic tax if no explicit tax bucket supplied
    if (tax.current === 0 && preTaxProfit.current > 0) {
      tax = {
        current: r2(preTaxProfit.current * this.corporateTaxRate),
        prior:   preTaxProfit.prior  != null && preTaxProfit.prior  > 0
          ? r2(preTaxProfit.prior  * this.corporateTaxRate) : null,
        budget:  preTaxProfit.budget != null && preTaxProfit.budget > 0
          ? r2(preTaxProfit.budget * this.corporateTaxRate) : null,
      };
    }
    const netProfit = {
      current: r2(preTaxProfit.current - tax.current),
      prior:   preTaxProfit.prior  != null ? r2(preTaxProfit.prior  - (tax.prior  || 0)) : null,
      budget:  preTaxProfit.budget != null ? r2(preTaxProfit.budget - (tax.budget || 0)) : null,
    };

    return {
      revenue,
      cogs,
      grossProfit,
      expense,
      operatingProfit,
      financial,
      other,
      preTaxProfit,
      tax,
      netProfit,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.3 drill — zoom to a node and expose its immediate children
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Return a drill-down view of a single account code and its direct
   * children, with amounts, contribution %, and variance blocks.
   *
   * @param {string} accountCode
   * @returns {object}
   *   {
   *     node:        { code, he, en, current, prior, budget, section, ... },
   *     path:        [...ancestors from root → node],
   *     children:    [{code, he, en, current, prior, budget, contributionPct, variance*}]
   *     amounts:     { current, prior, budget, formatted: { current, prior, budget } }
   *     varianceVsPrior:  variance object
   *     varianceVsBudget: variance object
   *     margins:     { grossMargin, operatingMargin, netMargin }
   *   }
   */
  drill(accountCode) {
    const code = String(accountCode);
    const node = this.nodes.get(code);
    if (!node) {
      throw new Error(`unknown account code: ${accountCode}`);
    }

    // path from root → node
    const path = [];
    let cur = node;
    while (cur) {
      path.unshift({
        code: cur.code,
        he:   cur.he,
        en:   cur.en,
      });
      cur = cur.parent;
    }

    const formatVal = (v) => v == null ? null : formatNIS(v, this.locale);

    const children = node.children
      .slice()
      .sort((a, b) => num(b.current) - num(a.current))
      .map((ch) => ({
        code:            ch.code,
        he:              ch.he,
        en:              ch.en,
        type:            ch.type,
        form6111Row:     ch.form6111Row,
        section:         ch.section,
        current:         ch.current,
        prior:           ch.prior,
        budget:          ch.budget,
        formatted: {
          current: formatVal(ch.current),
          prior:   formatVal(ch.prior),
          budget:  formatVal(ch.budget),
        },
        contributionPct: ch.contributionPct,
        varianceVsPrior: ch.varianceVsPrior,
        varianceVsBudget: ch.varianceVsBudget,
        grossMargin:     ch.grossMargin,
        operatingMargin: ch.operatingMargin,
        netMargin:       ch.netMargin,
        childCount:      ch.children.length,
      }));

    return {
      node: {
        code:             node.code,
        he:               node.he,
        en:               node.en,
        type:             node.type,
        form6111Row:      node.form6111Row,
        section:          node.section,
        depth:            node.depth,
        current:          node.current,
        prior:            node.prior,
        budget:           node.budget,
        contributionPct:  node.contributionPct,
      },
      path,
      children,
      amounts: {
        current: node.current,
        prior:   node.prior,
        budget:  node.budget,
        formatted: {
          current: formatVal(node.current),
          prior:   formatVal(node.prior),
          budget:  formatVal(node.budget),
        },
      },
      varianceVsPrior:  node.varianceVsPrior,
      varianceVsBudget: node.varianceVsBudget,
      margins: {
        grossMargin:     node.grossMargin,
        operatingMargin: node.operatingMargin,
        netMargin:       node.netMargin,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.4 variance calculators
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Internal variance helper. `which` selects the baseline key.
   */
  _variance(node, which /* 'prior' | 'budget' */) {
    if (!node || node[which] == null) return null;
    const sign = node.type === PNL_TYPE.REVENUE ? +1 : -1;
    return varianceObj({
      current:  node.current,
      baseline: node[which],
      sign,
    });
  }

  /**
   * Variance of a node's current value vs. the prior period.
   * Returns null if no prior amount was supplied for that subtree.
   */
  varianceVsPrior(accountCode) {
    const node = this.nodes.get(String(accountCode));
    if (!node) throw new Error(`unknown account code: ${accountCode}`);
    return this._variance(node, 'prior');
  }

  /**
   * Variance of a node's current value vs. budget.
   * Returns null if no budget amount was supplied for that subtree.
   */
  varianceVsBudget(accountCode) {
    const node = this.nodes.get(String(accountCode));
    if (!node) throw new Error(`unknown account code: ${accountCode}`);
    return this._variance(node, 'budget');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.5 contribution % of parent
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Contribution percentage of a node to its immediate parent.
   * Returns null for roots or when the parent current = 0.
   */
  contribution(accountCode) {
    const node = this.nodes.get(String(accountCode));
    if (!node) throw new Error(`unknown account code: ${accountCode}`);
    return node.contributionPct;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.6 margins — gross / operating / net for any node
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Margin computation for an arbitrary node.
   *
   *   grossMargin     = grossProfit     / revenue
   *   operatingMargin = operatingProfit / revenue
   *   netMargin       = netProfit       / revenue
   *
   * For non-root nodes, the margin is expressed as the node's own
   * contribution to each respective profit line — that is, how much of the
   * total gross profit this specific subtree represents.
   *
   *   nodeGrossMargin = node.current / totalRevenue * typeSign
   *
   * For the top-level revenue node and roots, margins are anchored to the
   * engine totals. All percentages are rounded to 2 decimals.
   */
  _marginsForNode(node) {
    const T = this.totals;
    if (!T || num(T.revenue.current) === 0) {
      return { grossMargin: null, operatingMargin: null, netMargin: null };
    }
    const revenue = num(T.revenue.current);
    // top-level totals → whole-company margins
    if (!node || !node.parent || node.depth === 0) {
      return {
        grossMargin:     r2((num(T.grossProfit.current)     / revenue) * 100),
        operatingMargin: r2((num(T.operatingProfit.current) / revenue) * 100),
        netMargin:       r2((num(T.netProfit.current)       / revenue) * 100),
      };
    }
    // any other node — how much of each profit line does this subtree
    // capture relative to total revenue. For a revenue subtree that's a
    // positive contribution; for a cost subtree it's negative.
    const sign = node.type === PNL_TYPE.REVENUE ? +1 : -1;
    const share = (num(node.current) / revenue) * 100 * sign;
    return {
      grossMargin:     r2(share),
      operatingMargin: r2(share),
      netMargin:       r2(share),
    };
  }

  /**
   * Public entry point — margins for a specific node, or the whole company
   * when no code is supplied.
   */
  getMargins(accountCode) {
    if (accountCode == null) {
      return this._marginsForNode(null);
    }
    const node = this.nodes.get(String(accountCode));
    if (!node) throw new Error(`unknown account code: ${accountCode}`);
    return {
      grossMargin:     node.grossMargin,
      operatingMargin: node.operatingMargin,
      netMargin:       node.netMargin,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.7 Form 6111 line mapping
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Return the Form 6111 row code and section for a given account.
   * Falls back to the resolver (type + prefix) when no explicit row is set.
   */
  form6111LineOf(accountCode) {
    const node = this.nodes.get(String(accountCode));
    if (!node) throw new Error(`unknown account code: ${accountCode}`);
    return {
      row:     node.form6111Row,
      section: node.section,
    };
  }

  /**
   * Aggregate the tree by Form 6111 section, so callers can print a
   * compliant statutory income statement directly from the drill-down.
   */
  form6111Summary() {
    const summary = {};
    for (const section of SECTION_MAP) {
      summary[section.id] = {
        id:      section.id,
        he:      section.he,
        en:      section.en,
        range:   section.range,
        current: 0,
        prior:   null,
        budget:  null,
        leafCount: 0,
      };
    }
    for (const node of this.nodes.values()) {
      if (node.children.length > 0) continue; // leaves only
      if (!node.section) continue;
      const bucket = summary[node.section.id];
      if (!bucket) continue;
      bucket.current = r2(bucket.current + Math.abs(num(node.own.current)));
      if (node.own.prior != null) {
        bucket.prior = r2((bucket.prior || 0) + Math.abs(num(node.own.prior)));
      }
      if (node.own.budget != null) {
        bucket.budget = r2((bucket.budget || 0) + Math.abs(num(node.own.budget)));
      }
      bucket.leafCount += 1;
    }
    return summary;
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.8 tree traversal helpers
  // ─────────────────────────────────────────────────────────────────────

  /** Iterate depth-first over every node. */
  *walk(startCode) {
    const start = startCode == null
      ? this.roots
      : [this.nodes.get(String(startCode))].filter(Boolean);
    const stack = [...start];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      yield n;
      for (let i = n.children.length - 1; i >= 0; i--) {
        stack.push(n.children[i]);
      }
    }
  }

  /** Return a plain JSON-friendly snapshot of the whole tree. */
  toJSON() {
    const toPlain = (n) => ({
      code:            n.code,
      he:              n.he,
      en:              n.en,
      type:            n.type,
      form6111Row:     n.form6111Row,
      section:         n.section,
      depth:           n.depth,
      current:         n.current,
      prior:           n.prior,
      budget:          n.budget,
      contributionPct: n.contributionPct,
      varianceVsPrior: n.varianceVsPrior,
      varianceVsBudget: n.varianceVsBudget,
      grossMargin:     n.grossMargin,
      operatingMargin: n.operatingMargin,
      netMargin:       n.netMargin,
      children:        n.children.map(toPlain),
    });
    return {
      totals: this.totals,
      roots:  this.roots.map(toPlain),
      generatedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4.9 bilingual report rendering
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Render a bilingual (he + en) markdown-style text report.
   *
   * @param {object}  [opts]
   * @param {'he'|'en'|'bi'} [opts.lang='bi']   — language mode
   * @param {number}  [opts.maxDepth=3]          — how deep to indent
   */
  renderReport(opts = {}) {
    const lang    = opts.lang || 'bi';
    const maxDepth= opts.maxDepth != null ? opts.maxDepth : 3;
    const T       = this.totals;
    const fmt     = (v) => v == null ? '—' : formatNIS(v, this.locale);
    const hEn     = (he, en) => lang === 'he' ? he
                              : lang === 'en' ? en
                              : `${he} / ${en}`;

    const L = [];
    L.push(hEn('# דוח רווח והפסד — פירוט היררכי',
               '# P&L Report — Hierarchical Drill-Down'));
    L.push('');
    L.push(hEn(`**תאריך הפקה:** ${new Date().toISOString().slice(0,10)}`,
               `**Generated:** ${new Date().toISOString().slice(0,10)}`));
    L.push(hEn('**תקן:** טופס 6111 של רשות המסים',
               '**Standard:** Israeli Tax Authority Form 6111'));
    L.push('');

    // top-level
    L.push(hEn('## סיכום רמה עליונה', '## Top-Level Summary'));
    L.push('');
    L.push('| # | ' + hEn('סעיף', 'Line') + ' | ' + hEn('נוכחי', 'Current') + ' | ' + hEn('קודם', 'Prior') + ' | ' + hEn('תקציב', 'Budget') + ' |');
    L.push('|---|---|---:|---:|---:|');
    const row = (he, en, o) =>
      `| | ${hEn(he, en)} | ${fmt(o.current)} | ${fmt(o.prior)} | ${fmt(o.budget)} |`;
    L.push(row('הכנסות',        'Revenue',          T.revenue));
    L.push(row('עלות המכר',     'COGS',             T.cogs));
    L.push(row('רווח גולמי',    'Gross Profit',     T.grossProfit));
    L.push(row('הוצאות תפעול',  'Operating Exp.',   T.expense));
    L.push(row('רווח תפעולי',   'Operating Profit', T.operatingProfit));
    L.push(row('מימון נטו',     'Finance Net',      T.financial));
    L.push(row('רווח לפני מס',  'Pre-Tax Profit',   T.preTaxProfit));
    L.push(row('מס חברות',      'Corporate Tax',    T.tax));
    L.push(row('רווח נקי',      'Net Profit',       T.netProfit));
    L.push('');

    // margins
    const m = this._marginsForNode(null);
    L.push(hEn('## שולי רווח', '## Margins'));
    L.push('');
    L.push(`- ${hEn('שיעור רווח גולמי',     'Gross Margin')     }: ${formatPct(m.grossMargin)}`);
    L.push(`- ${hEn('שיעור רווח תפעולי',   'Operating Margin') }: ${formatPct(m.operatingMargin)}`);
    L.push(`- ${hEn('שיעור רווח נקי',       'Net Margin')       }: ${formatPct(m.netMargin)}`);
    L.push('');

    // hierarchy
    L.push(hEn('## עץ חשבונות — פירוט', '## Account Tree — Drill-Down'));
    L.push('');
    const writeNode = (n, depth) => {
      if (depth > maxDepth) return;
      const indent = '  '.repeat(depth);
      const label = hEn(n.he || n.code, n.en || n.code);
      const vp  = n.varianceVsPrior;
      const vb  = n.varianceVsBudget;
      const cp  = n.contributionPct != null ? ` (${formatPct(n.contributionPct)})` : '';
      const varTxt = [];
      if (vp) varTxt.push(`Δprior ${formatPct(vp.percent)}`);
      if (vb) varTxt.push(`Δbudget ${formatPct(vb.percent)}`);
      L.push(`${indent}- **${n.code}** ${label} — ${fmt(n.current)}${cp}` +
             (varTxt.length ? `  [${varTxt.join(', ')}]` : ''));
      for (const ch of n.children) writeNode(ch, depth + 1);
    };
    for (const root of this.roots) writeNode(root, 0);
    L.push('');

    L.push(hEn('---', '---'));
    L.push(hEn('_נוצר ע"י PnLDrilldown / Agent Y-182 — לא מוחקים, רק משדרגים._',
               '_Generated by PnLDrilldown / Agent Y-182 — append-only, never destructive._'));
    return L.join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  PnLDrilldown,
  formatNIS,
  formatPct,
  pctChange,
  varianceObj,
  resolveSection,
  resolvePnlType,
  SECTION_MAP,
  PNL_TYPE,
  CORPORATE_TAX_RATE_2026,
  // exposed for testing
  _internals: {
    r2,
    r4,
    num,
    sum,
  },
};
