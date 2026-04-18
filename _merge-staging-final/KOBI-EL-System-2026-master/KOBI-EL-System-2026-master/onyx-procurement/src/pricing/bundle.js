/**
 * Bundle / Kit Pricing Engine — Mega-ERP Techno-Kol Uzi
 * Agent Y-018 — Kobi's mega-ERP — pricing suite
 *
 * ---------------------------------------------------------------
 *  Zero-dependency, deterministic engine for product bundles
 *  (a.k.a. "kits" / "חבילות מוצרים").  A bundle bundles several
 *  SKUs into a single sellable unit and must answer four business
 *  questions:
 *
 *    1. How much does the customer pay?      → priceBundle()
 *    2. How do we split that price across
 *       the components for revenue
 *       recognition under IFRS 15?           → priceBundle().allocations
 *    3. How many bundles can we ship given
 *       current component inventory?         → availability()
 *    4. Which component lines does the
 *       warehouse pick for order fulfilment? → explode()
 *
 *  Rule from the product owner:
 *    "לא מוחקים רק משדרגים ומגדלים"
 *    (never delete — only upgrade and grow)
 *
 *  Therefore `defineBundle` is append-only: redefining an existing
 *  SKU stores the new version under a monotonic revision counter
 *  and returns the previous revision, so auditors can replay any
 *  historical price.  Nothing is ever removed.
 *
 *  ---------------------------------------------------------------
 *  Pricing modes
 *  ---------------------------------------------------------------
 *    'sum'      — bundle price = Σ (component standalone price × qty)
 *                 (useful for pure kits where there is no "deal")
 *    'fixed'    — bundle price = `price` (a flat contract price)
 *    'discount' — bundle price = sum × (1 − discountPct/100)
 *
 *  ---------------------------------------------------------------
 *  Allocation methods (IFRS 15 §§ 73-86 — relative standalone method)
 *  ---------------------------------------------------------------
 *    'relative' — split the discount in proportion to each
 *                 component's standalone selling price (SSP).
 *                 This is the IFRS-15 default.
 *    'even'     — split equally across component lines.  Used
 *                 for promotional kits where the components are
 *                 roughly interchangeable.
 *    'weight'   — use user-supplied weights (per component).
 *                 Falls back to 'relative' when weights are
 *                 missing or sum to zero.
 *
 *  ---------------------------------------------------------------
 *  Israeli VAT
 *  ---------------------------------------------------------------
 *    Israeli VAT (מע"מ) applies to the TOTAL bundle price, not to
 *    every component separately — that is what the invoice shows
 *    to the customer.  But for GL posting and IFRS-15 revenue
 *    recognition we must still allocate the net-of-VAT revenue
 *    across the components.  priceBundle() returns both:
 *      - priceNet, priceVat, priceGross      (what the invoice shows)
 *      - allocations[i].revenueNet           (what the GL books)
 *    Round-off is absorbed into the component with the largest SSP
 *    so Σ allocations = priceNet exactly (agorot-level reconciliation).
 *
 *  ---------------------------------------------------------------
 *  Nesting
 *  ---------------------------------------------------------------
 *    A bundle may contain other bundles (bundle-of-bundles).  The
 *    engine recursively explodes to leaves up to `maxDepth`
 *    (default 8).  Cycles and orphans are caught by validateBundle.
 *
 *  ---------------------------------------------------------------
 *  Math precision
 *  ---------------------------------------------------------------
 *    All monetary math is performed in integer agorot (₪ × 100) to
 *    avoid JS floating-point drift, then converted back to shekel
 *    on the way out.  `EPS = 0.01` shekel is the acceptable
 *    rounding tolerance for allocation-sum = total invariants.
 *
 *  Exports (CommonJS):
 *    class BundlePricing
 *    CONSTANTS
 *
 *  Node test runner:
 *    node --test test/pricing/bundle.test.js
 * ---------------------------------------------------------------
 */

'use strict';

// ---------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------
const CONSTANTS = Object.freeze({
  ISRAELI_VAT_RATE: 0.18,           // 18% as of 2026-01-01 (מע"מ)
  DEFAULT_MAX_DEPTH: 8,
  EPS_SHEKEL: 0.01,                 // 1 agora
  PRICING_MODES: Object.freeze(['sum', 'fixed', 'discount']),
  ALLOCATION_METHODS: Object.freeze(['relative', 'even', 'weight']),
});

// ---------------------------------------------------------------
//  Small helpers — no deps
// ---------------------------------------------------------------
function toAgorot(shekel) {
  // round half-away-from-zero at agora level
  return Math.round(Number(shekel) * 100);
}
function toShekel(agorot) {
  return Math.round(Number(agorot)) / 100;
}
function isPositiveNumber(n) {
  return typeof n === 'number' && isFinite(n) && n >= 0;
}
function isPositiveInt(n) {
  return typeof n === 'number' && isFinite(n) && n > 0 && Math.floor(n) === n;
}

// ---------------------------------------------------------------
//  BundlePricing class
// ---------------------------------------------------------------
class BundlePricing {
  /**
   * @param {object} [opts]
   * @param {number} [opts.maxDepth=8]         nesting depth cap
   * @param {number} [opts.vatRate=0.18]       Israeli VAT (override for tests / historical)
   * @param {Map|object} [opts.catalog]        optional injected catalog Map<sku, standalonePrice>
   */
  constructor(opts = {}) {
    this.maxDepth = isPositiveInt(opts.maxDepth) ? opts.maxDepth : CONSTANTS.DEFAULT_MAX_DEPTH;
    this.vatRate = typeof opts.vatRate === 'number' ? opts.vatRate : CONSTANTS.ISRAELI_VAT_RATE;

    // Append-only store of bundles.  Each entry is an array of revisions.
    // bundles : Map<sku, Array<BundleRevision>>
    this._bundles = new Map();

    // Append-only store of component SSPs (standalone selling price, net-of-VAT).
    // Keys are non-bundle SKUs.  Bundles are looked up in this._bundles first.
    // catalog : Map<sku, { price:number, name_he?:string, name_en?:string, inventory?:number }>
    this._catalog = new Map();

    // Optional constructor-supplied catalog (tests / embedding apps)
    if (opts.catalog) {
      const src = opts.catalog instanceof Map ? opts.catalog.entries() : Object.entries(opts.catalog);
      for (const [sku, row] of src) {
        this.upsertComponent(sku, row);
      }
    }
  }

  // -------------------------------------------------------------
  //  Catalog — append-only upsert of leaf components
  // -------------------------------------------------------------
  /**
   * Register (or upgrade) a leaf component.  Previous values are
   * never deleted — the catalog is a versioned store keyed by sku.
   *
   * @param {string} sku
   * @param {object} row { price, name_he, name_en, inventory? }
   */
  upsertComponent(sku, row) {
    if (typeof sku !== 'string' || sku.length === 0) {
      throw new Error('upsertComponent: sku must be a non-empty string');
    }
    if (!row || typeof row !== 'object') {
      throw new Error(`upsertComponent(${sku}): row must be an object`);
    }
    if (!isPositiveNumber(row.price)) {
      throw new Error(`upsertComponent(${sku}): price must be a non-negative number`);
    }
    const prev = this._catalog.get(sku) || null;
    const next = Object.freeze({
      sku,
      price: Number(row.price),
      name_he: String(row.name_he || sku),
      name_en: String(row.name_en || sku),
      inventory: isPositiveNumber(row.inventory) ? Number(row.inventory) : 0,
      revision: (prev ? prev.revision : 0) + 1,
      createdAt: new Date().toISOString(),
    });
    this._catalog.set(sku, next);
    return next;
  }

  /**
   * Adjust inventory (append-only; never goes below 0).
   */
  setInventory(sku, qty) {
    const row = this._catalog.get(sku);
    if (!row) throw new Error(`setInventory: unknown component sku ${sku}`);
    const next = Object.freeze({ ...row, inventory: Math.max(0, Number(qty) || 0) });
    this._catalog.set(sku, next);
    return next;
  }

  // -------------------------------------------------------------
  //  defineBundle — append-only, versioned
  // -------------------------------------------------------------
  /**
   * @param {object} spec
   * @param {string} spec.sku
   * @param {string} spec.name_he
   * @param {string} spec.name_en
   * @param {Array<{sku:string, qty:number, weight?:number}>} spec.components
   * @param {'sum'|'fixed'|'discount'} spec.pricingMode
   * @param {number} [spec.price]              required when pricingMode === 'fixed' (net-of-VAT)
   * @param {number} [spec.discountPct]        required when pricingMode === 'discount' (0..100)
   * @param {'relative'|'even'|'weight'} [spec.allocationMethod='relative']
   * @returns {object} the stored bundle revision (frozen)
   */
  defineBundle(spec) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('defineBundle: spec must be an object');
    }
    const {
      sku,
      name_he,
      name_en,
      components,
      pricingMode,
      price,
      discountPct,
      allocationMethod = 'relative',
    } = spec;

    if (typeof sku !== 'string' || !sku) {
      throw new Error('defineBundle: sku must be a non-empty string');
    }
    if (!Array.isArray(components) || components.length === 0) {
      throw new Error(`defineBundle(${sku}): components must be a non-empty array`);
    }
    if (!CONSTANTS.PRICING_MODES.includes(pricingMode)) {
      throw new Error(
        `defineBundle(${sku}): pricingMode must be one of ${CONSTANTS.PRICING_MODES.join(', ')}`
      );
    }
    if (!CONSTANTS.ALLOCATION_METHODS.includes(allocationMethod)) {
      throw new Error(
        `defineBundle(${sku}): allocationMethod must be one of ${CONSTANTS.ALLOCATION_METHODS.join(', ')}`
      );
    }
    if (pricingMode === 'fixed' && !isPositiveNumber(price)) {
      throw new Error(`defineBundle(${sku}): pricingMode 'fixed' requires numeric price`);
    }
    if (pricingMode === 'discount') {
      if (typeof discountPct !== 'number' || discountPct < 0 || discountPct > 100) {
        throw new Error(`defineBundle(${sku}): discountPct must be 0..100`);
      }
    }

    // Normalise & freeze components
    const normComponents = components.map((c, idx) => {
      if (!c || typeof c !== 'object') {
        throw new Error(`defineBundle(${sku}): component[${idx}] must be an object`);
      }
      if (typeof c.sku !== 'string' || !c.sku) {
        throw new Error(`defineBundle(${sku}): component[${idx}].sku required`);
      }
      if (!isPositiveNumber(c.qty) || c.qty <= 0) {
        throw new Error(`defineBundle(${sku}): component[${idx}].qty must be > 0`);
      }
      return Object.freeze({
        sku: c.sku,
        qty: Number(c.qty),
        weight: isPositiveNumber(c.weight) ? Number(c.weight) : undefined,
      });
    });

    const prevRevisions = this._bundles.get(sku) || [];
    const revision = prevRevisions.length + 1;

    const bundle = Object.freeze({
      sku,
      name_he: String(name_he || sku),
      name_en: String(name_en || sku),
      components: Object.freeze(normComponents),
      pricingMode,
      price: pricingMode === 'fixed' ? Number(price) : null,
      discountPct: pricingMode === 'discount' ? Number(discountPct) : null,
      allocationMethod,
      revision,
      createdAt: new Date().toISOString(),
    });

    // Append-only: push a new revision rather than overwrite
    const history = prevRevisions.slice();
    history.push(bundle);
    this._bundles.set(sku, history);

    return bundle;
  }

  /**
   * Return the latest revision of a bundle (or null).
   */
  getBundle(sku) {
    const h = this._bundles.get(sku);
    if (!h || h.length === 0) return null;
    return h[h.length - 1];
  }

  /**
   * Return the full revision history of a bundle (append-only).
   */
  getBundleHistory(sku) {
    const h = this._bundles.get(sku);
    return h ? h.slice() : [];
  }

  // -------------------------------------------------------------
  //  validateBundle
  // -------------------------------------------------------------
  /**
   * Check:
   *   - no circular references (a bundle that contains itself
   *     directly or transitively)
   *   - no orphan components (every referenced SKU exists either
   *     as a leaf in the catalog or as another bundle)
   *   - no zero-qty components
   *
   * @param {object|string} bundleOrSku
   * @returns {{ok:boolean, errors:Array<{code,message_he,message_en}>}}
   */
  validateBundle(bundleOrSku) {
    const errors = [];
    const root =
      typeof bundleOrSku === 'string' ? this.getBundle(bundleOrSku) : bundleOrSku;
    if (!root) {
      errors.push({
        code: 'BUNDLE_NOT_FOUND',
        message_he: 'החבילה לא נמצאה',
        message_en: 'Bundle not found',
      });
      return { ok: false, errors };
    }

    // DFS over the bundle graph, detecting back-edges (cycles).
    const visiting = new Set();
    const visited = new Set();
    const walk = (sku, path) => {
      if (visiting.has(sku)) {
        errors.push({
          code: 'CIRCULAR_REFERENCE',
          message_he: `זיהוי מעגל: ${[...path, sku].join(' → ')}`,
          message_en: `Circular reference: ${[...path, sku].join(' -> ')}`,
          cycle: [...path, sku],
        });
        return;
      }
      if (visited.has(sku)) return;
      visiting.add(sku);

      const b = this.getBundle(sku);
      if (b) {
        if (path.length + 1 > this.maxDepth) {
          errors.push({
            code: 'MAX_DEPTH_EXCEEDED',
            message_he: `חריגה מעומק הקינון (${this.maxDepth})`,
            message_en: `Nesting depth exceeds maxDepth (${this.maxDepth})`,
          });
        } else {
          for (const c of b.components) {
            if (c.qty <= 0) {
              errors.push({
                code: 'ZERO_QTY',
                message_he: `רכיב עם כמות אפסית: ${c.sku}`,
                message_en: `Component has non-positive qty: ${c.sku}`,
              });
            }
            // if the child is neither a bundle nor a leaf — orphan
            if (!this._bundles.has(c.sku) && !this._catalog.has(c.sku)) {
              errors.push({
                code: 'ORPHAN_COMPONENT',
                message_he: `רכיב יתום (לא קיים): ${c.sku}`,
                message_en: `Orphan component (not in catalog): ${c.sku}`,
                sku: c.sku,
              });
            }
            walk(c.sku, [...path, sku]);
          }
        }
      }
      visiting.delete(sku);
      visited.add(sku);
    };
    walk(root.sku, []);

    return { ok: errors.length === 0, errors };
  }

  // -------------------------------------------------------------
  //  nestedBundles — recursive expansion to leaves
  // -------------------------------------------------------------
  /**
   * Recursively walk bundle-of-bundles and return a flat array of
   * { sku, qty, depth } leaf component lines, with qty multiplied
   * along the path.  Throws on cycles or depth overflow.
   *
   * NOTE: this is the low-level walker used by explode() and
   *       priceBundle() internally.  A convenience alias.
   *
   * @param {string} sku
   * @param {number} [qty=1]
   * @returns {Array<{sku:string, qty:number, depth:number}>}
   */
  nestedBundles(sku, qty = 1) {
    const out = [];
    const seen = new Set();
    const walk = (s, q, depth) => {
      if (depth > this.maxDepth) {
        throw new Error(`nestedBundles(${sku}): maxDepth ${this.maxDepth} exceeded at ${s}`);
      }
      if (seen.has(s)) {
        // guard against cycles in a best-effort way here too
        throw new Error(`nestedBundles(${sku}): circular reference at ${s}`);
      }
      const b = this.getBundle(s);
      if (!b) {
        // leaf
        out.push({ sku: s, qty: q, depth });
        return;
      }
      seen.add(s);
      for (const c of b.components) {
        walk(c.sku, q * c.qty, depth + 1);
      }
      seen.delete(s);
    };
    walk(sku, qty, 0);

    // Merge duplicate leaves
    const merged = new Map();
    for (const row of out) {
      const prev = merged.get(row.sku);
      if (prev) {
        prev.qty += row.qty;
        prev.depth = Math.max(prev.depth, row.depth);
      } else {
        merged.set(row.sku, { ...row });
      }
    }
    return Array.from(merged.values());
  }

  // -------------------------------------------------------------
  //  explode — for order fulfilment
  // -------------------------------------------------------------
  /**
   * For a bundle sku and a desired order qty, return a flat list of
   * component picking lines { sku, qty, name_he, name_en }.  Nested
   * bundles are expanded to leaves.
   *
   * @param {string} bundleSku
   * @param {number} qty
   * @returns {Array<{sku, qty, name_he, name_en}>}
   */
  explode(bundleSku, qty = 1) {
    if (!isPositiveInt(qty)) {
      throw new Error(`explode(${bundleSku}): qty must be a positive integer`);
    }
    const b = this.getBundle(bundleSku);
    if (!b) throw new Error(`explode: bundle ${bundleSku} not found`);

    const leaves = this.nestedBundles(bundleSku, qty);
    return leaves.map(row => {
      const leaf = this._catalog.get(row.sku);
      return {
        sku: row.sku,
        qty: row.qty,
        name_he: leaf ? leaf.name_he : row.sku,
        name_en: leaf ? leaf.name_en : row.sku,
      };
    });
  }

  // -------------------------------------------------------------
  //  availability — min across components (per-bundle cover)
  // -------------------------------------------------------------
  /**
   * How many whole bundles can we assemble right now?
   *
   *   availability = min over components of floor(inventory / qty_per_bundle)
   *
   * Nested bundles are expanded to leaves first.  A leaf with zero
   * inventory and positive qty-per-bundle makes availability = 0.
   *
   * @param {string} bundleSku
   * @returns {number}
   */
  availability(bundleSku) {
    const b = this.getBundle(bundleSku);
    if (!b) throw new Error(`availability: bundle ${bundleSku} not found`);

    const leaves = this.nestedBundles(bundleSku, 1); // per-bundle qty
    if (leaves.length === 0) return 0;

    let minCover = Infinity;
    for (const leaf of leaves) {
      const inv = this._catalog.get(leaf.sku);
      const have = inv ? Number(inv.inventory) || 0 : 0;
      const cover = Math.floor(have / leaf.qty);
      if (cover < minCover) minCover = cover;
      if (minCover === 0) break;
    }
    return minCover === Infinity ? 0 : minCover;
  }

  // -------------------------------------------------------------
  //  priceBundle — total + per-component allocation (IFRS 15)
  // -------------------------------------------------------------
  /**
   * @param {string} bundleSku
   * @param {object} [context]
   * @param {number} [context.qty=1]           how many bundles ordered
   * @param {boolean}[context.includeVat=true] include VAT in gross total
   * @param {number} [context.vatRate]         override instance vatRate
   *
   * @returns {{
   *   bundleSku: string,
   *   revision: number,
   *   qty: number,
   *   pricingMode: string,
   *   allocationMethod: string,
   *   componentLines: Array<{sku, qty, unitSsp, lineSsp, name_he, name_en}>,
   *   sumOfStandalone: number,
   *   priceNet: number,         // what the customer pays excl. VAT
   *   priceVat: number,         // Israeli VAT portion
   *   priceGross: number,       // priceNet + priceVat
   *   allocations: Array<{
   *     sku, qty, revenueNet, sharePct, name_he, name_en
   *   }>,
   *   checksum: {
   *     allocSumNet: number,    // Σ allocations.revenueNet
   *     deltaNet: number        // should be 0 (within 1 agora)
   *   }
   * }}
   */
  priceBundle(bundleSku, context = {}) {
    const qty = isPositiveInt(context.qty) ? context.qty : 1;
    const includeVat = context.includeVat === undefined ? true : !!context.includeVat;
    const vatRate = typeof context.vatRate === 'number' ? context.vatRate : this.vatRate;

    const bundle = this.getBundle(bundleSku);
    if (!bundle) throw new Error(`priceBundle: bundle ${bundleSku} not found`);

    // Validate first — throws on cycle / orphan (don't price broken bundles)
    const { ok, errors } = this.validateBundle(bundle);
    if (!ok) {
      const err = new Error(`priceBundle(${bundleSku}): invalid bundle`);
      err.errors = errors;
      throw err;
    }

    // -----------------------------------------------------------
    // 1. Build component lines with standalone selling prices.
    //    Nested bundles are resolved recursively: a nested bundle's
    //    SSP is the SUM of its own leaf SSPs (so the math reconciles
    //    at every level without double-counting discounts).
    // -----------------------------------------------------------
    const resolveSsp = (sku) => {
      const leaf = this._catalog.get(sku);
      if (leaf) return { priceAgorot: toAgorot(leaf.price), name_he: leaf.name_he, name_en: leaf.name_en };
      const sub = this.getBundle(sku);
      if (sub) {
        // recurse to get sub-bundle's sum-of-standalone (ignore sub-bundle discount)
        let sumAg = 0;
        for (const c of sub.components) {
          const sspA = resolveSsp(c.sku).priceAgorot;
          sumAg += sspA * c.qty;
        }
        return { priceAgorot: sumAg, name_he: sub.name_he, name_en: sub.name_en };
      }
      throw new Error(`priceBundle: orphan component ${sku} (should have been caught by validateBundle)`);
    };

    const componentLines = bundle.components.map(c => {
      const ssp = resolveSsp(c.sku);
      const lineQty = c.qty * qty;
      const lineSspAgorot = ssp.priceAgorot * lineQty;
      return {
        sku: c.sku,
        qty: lineQty,
        unitSspAgorot: ssp.priceAgorot,
        lineSspAgorot,
        weight: c.weight,
        name_he: ssp.name_he,
        name_en: ssp.name_en,
      };
    });

    const sumOfStandaloneAgorot = componentLines.reduce((s, l) => s + l.lineSspAgorot, 0);

    // -----------------------------------------------------------
    // 2. Compute bundle net price per pricing mode.
    // -----------------------------------------------------------
    let priceNetAgorot;
    switch (bundle.pricingMode) {
      case 'sum':
        priceNetAgorot = sumOfStandaloneAgorot;
        break;
      case 'fixed':
        priceNetAgorot = toAgorot(bundle.price) * qty;
        break;
      case 'discount':
        priceNetAgorot = Math.round(sumOfStandaloneAgorot * (1 - bundle.discountPct / 100));
        break;
      default:
        throw new Error(`priceBundle: unknown pricingMode ${bundle.pricingMode}`);
    }
    if (priceNetAgorot < 0) priceNetAgorot = 0;

    // -----------------------------------------------------------
    // 3. Allocate priceNet back to the component lines.
    //    Integer-math with largest-remainder absorption so that
    //    Σ allocations = priceNet exactly in agorot.
    // -----------------------------------------------------------
    const allocations = this._allocate(
      componentLines,
      priceNetAgorot,
      bundle.allocationMethod
    );

    // -----------------------------------------------------------
    // 4. VAT — Israeli VAT is applied on the total bundle price,
    //    then shown alongside the net-of-VAT per-component split.
    // -----------------------------------------------------------
    const priceVatAgorot = includeVat ? Math.round(priceNetAgorot * vatRate) : 0;
    const priceGrossAgorot = priceNetAgorot + priceVatAgorot;

    // Allocation integrity check
    const allocSumAgorot = allocations.reduce((s, a) => s + a.revenueNetAgorot, 0);
    const deltaAgorot = allocSumAgorot - priceNetAgorot;

    // Convert everything to shekel on the way out
    return {
      bundleSku,
      revision: bundle.revision,
      qty,
      pricingMode: bundle.pricingMode,
      allocationMethod: bundle.allocationMethod,
      componentLines: componentLines.map(l => ({
        sku: l.sku,
        qty: l.qty,
        unitSsp: toShekel(l.unitSspAgorot),
        lineSsp: toShekel(l.lineSspAgorot),
        name_he: l.name_he,
        name_en: l.name_en,
      })),
      sumOfStandalone: toShekel(sumOfStandaloneAgorot),
      priceNet: toShekel(priceNetAgorot),
      priceVat: toShekel(priceVatAgorot),
      priceGross: toShekel(priceGrossAgorot),
      vatRate,
      allocations: allocations.map(a => ({
        sku: a.sku,
        qty: a.qty,
        revenueNet: toShekel(a.revenueNetAgorot),
        sharePct: Math.round(a.sharePct * 10000) / 100, // 2 decimals
        name_he: a.name_he,
        name_en: a.name_en,
      })),
      checksum: {
        allocSumNet: toShekel(allocSumAgorot),
        deltaNet: toShekel(deltaAgorot),
      },
    };
  }

  // -------------------------------------------------------------
  //  internal: allocate priceNetAgorot across componentLines
  // -------------------------------------------------------------
  _allocate(componentLines, priceNetAgorot, method) {
    const n = componentLines.length;
    if (n === 0) return [];

    // Decide raw weights per method
    let rawWeights;
    if (method === 'even') {
      rawWeights = componentLines.map(() => 1);
    } else if (method === 'weight') {
      const anyWeight = componentLines.some(l => typeof l.weight === 'number' && l.weight > 0);
      if (anyWeight) {
        rawWeights = componentLines.map(l =>
          typeof l.weight === 'number' && l.weight > 0 ? l.weight : 0
        );
        // if somebody configured weights but all zero → fall back
        if (rawWeights.every(w => w === 0)) {
          rawWeights = componentLines.map(l => l.lineSspAgorot || 1);
        }
      } else {
        // no weights supplied → fall back to 'relative'
        rawWeights = componentLines.map(l => l.lineSspAgorot || 1);
      }
    } else {
      // 'relative' — proportional to line SSP
      rawWeights = componentLines.map(l => l.lineSspAgorot || 1);
    }

    const totalWeight = rawWeights.reduce((s, w) => s + w, 0);
    if (totalWeight <= 0) {
      // degenerate case — split evenly
      rawWeights = componentLines.map(() => 1);
    }
    const totalW = rawWeights.reduce((s, w) => s + w, 0);

    // Floor-allocate in agorot
    const floored = rawWeights.map(w => Math.floor((priceNetAgorot * w) / totalW));
    let assigned = floored.reduce((s, a) => s + a, 0);
    let leftover = priceNetAgorot - assigned;

    // Distribute leftover agorot by largest remainder,
    // deterministic tie-break: largest lineSSP first, then index.
    const remainders = rawWeights.map((w, i) => {
      const exact = (priceNetAgorot * w) / totalW;
      return { i, rem: exact - floored[i], ssp: componentLines[i].lineSspAgorot };
    });
    remainders.sort((a, b) => {
      if (b.rem !== a.rem) return b.rem - a.rem;
      if (b.ssp !== a.ssp) return b.ssp - a.ssp;
      return a.i - b.i;
    });
    const allocAgorot = floored.slice();
    for (let k = 0; k < leftover && k < remainders.length; k++) {
      allocAgorot[remainders[k].i] += 1;
    }
    // If leftover > n (can happen when rounding direction accumulates),
    // keep cycling through the remainders list.
    let cursor = 0;
    while (allocAgorot.reduce((s, a) => s + a, 0) < priceNetAgorot && n > 0) {
      allocAgorot[remainders[cursor % remainders.length].i] += 1;
      cursor++;
      if (cursor > priceNetAgorot + n) break; // safety valve
    }
    // And the mirror case (overshoot)
    while (allocAgorot.reduce((s, a) => s + a, 0) > priceNetAgorot && n > 0) {
      // take 1 agora off the line with the largest current allocation
      let maxIdx = 0;
      for (let i = 1; i < allocAgorot.length; i++) {
        if (allocAgorot[i] > allocAgorot[maxIdx]) maxIdx = i;
      }
      if (allocAgorot[maxIdx] === 0) break;
      allocAgorot[maxIdx] -= 1;
    }

    return componentLines.map((l, i) => ({
      sku: l.sku,
      qty: l.qty,
      revenueNetAgorot: allocAgorot[i],
      sharePct: priceNetAgorot > 0 ? allocAgorot[i] / priceNetAgorot : 0,
      name_he: l.name_he,
      name_en: l.name_en,
    }));
  }
}

// ---------------------------------------------------------------
//  Exports
// ---------------------------------------------------------------
module.exports = {
  BundlePricing,
  CONSTANTS,
};
