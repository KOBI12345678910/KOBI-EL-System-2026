/**
 * Bill of Materials (BOM) Manager — Agent Y-031 (Swarm Manufacturing)
 * Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * Metal-fabrication BOM manager with multi-level explode, scrap-aware
 * consumption math, cost rollup (material + labor + overhead), engineering
 * change (substitute), revision history, where-used reverse lookup, diff,
 * and validation (circular-reference detection, negative quantities,
 * missing components).
 *
 * Golden rule: לא מוחקים רק משדרגים ומגדלים — NEVER delete.
 * Old revisions are marked `status: 'obsolete'` with a pointer to the
 * superseding revision (`supersededBy`) so history is preserved forever.
 *
 * Metal-fab specifics:
 *   - Scrap % per operation (cutting 5%, welding 2%, bending 3% defaults)
 *   - UOMs: kg / meter / piece / m2 / liter / each
 *   - Material-certificate traceability hooks (lotId / heatNumber / millCert)
 *   - Sub-assemblies (nested BOMs) — explodes to raw-material leaves
 *   - Alternatives list per component (primary + approved substitutes)
 *   - Routing link for labor & overhead roll-up
 *
 * Bilingual Hebrew/English. Zero external dependencies. In-memory store.
 *
 * Exports:
 *   - class BOMManager
 *   - DEFAULT_SCRAP_RATES
 *   - UOMS, BOM_STATUS, LABELS
 *   - ECO_STATUS, REQUIRED_ECO_ROLES
 *
 * Usage:
 *   const { BOMManager } = require('./bom-manager');
 *   const mgr = new BOMManager();
 *   const bom = mgr.createBOM({ sku: 'GATE-01', name_he: 'שער פלדה', ... });
 *   const exploded = mgr.explodeBOM('GATE-01', 10);
 *   const cost = mgr.costRollup('GATE-01');
 *
 * 2026-04 GROW (Y-031 spec extension — never delete, only upgrade and grow):
 *   - defineBOM({ partNumber, rev, items[]: { childPart, qty, uom, scrap%,
 *     level, alternateGroup?, effectivityFrom, effectivityTo } })
 *   - explode(partNumber, rev, qty)         — explicit-rev variant
 *   - implode(childPart)                    — alias of whereUsed
 *   - availabilityCheck(part, rev, qty, inv)— shortages list
 *   - ecoRequest({ bomId, changes, requester, reason, effectiveDate })
 *   - approveEco(ecoId, approvers[])        — engineering + quality + purchasing dual approval
 *   - alternateGroup(part, rev, group)      — list of substitutable comps
 *   - phantomBOM(partNumber)                — transparent pass-through
 *   - costedBOM(part, rev, priceMap)        — line-by-line extended cost
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────
// Constants — ready-only, bilingual, frozen
// ─────────────────────────────────────────────────────────────────────

/**
 * Default scrap/yield percentages per metal-fab operation. Expressed as
 * decimal (0.05 === 5%). Applied on top of nominal component quantity:
 *
 *   effectiveQty = nominalQty × (1 + scrap)
 *
 * i.e. to end up with 100kg after a 5% cutting scrap we must issue 105kg
 * of raw stock. Override per-BOM-component with `scrap` on the component
 * row, or per-operation on the routing.
 */
const DEFAULT_SCRAP_RATES = Object.freeze({
  cutting: 0.05,   // חיתוך — laser/plasma/saw drop
  welding: 0.02,   // ריתוך — spatter + burn-off
  bending: 0.03,   // כיפוף — bend allowance waste
  drilling: 0.01,  // קידוח — swarf
  grinding: 0.02,  // השחזה — grind loss
  punching: 0.04,  // ניקוב — slug waste
  painting: 0.05,  // צביעה — overspray
  galvanizing: 0.03, // גילוון — drip/strip
  assembly: 0.00,  // הרכבה — no material loss
  inspection: 0.00,// בדיקה — no material loss
  default: 0.02,   // fallback for unknown ops
});

/** Valid units of measure for metal-fab BOMs. */
const UOMS = Object.freeze({
  KG: 'kg',        // ק"ג — mass (sheet, plate, bar)
  METER: 'meter',  // מטר — linear (rod, tube, profile)
  MM: 'mm',        // מ"מ — fine linear (fasteners, tolerances)
  PIECE: 'piece',  // יחידה — discrete (bolt, nut, bracket)
  M2: 'm2',        // מ"ר — area (coating, plating)
  M3: 'm3',        // מ"ק — volume (fill material)
  LITER: 'liter',  // ליטר — liquids (paint, oil, coolant)
  EACH: 'each',    // unit — generic discrete
});

/** BOM lifecycle status. Obsolete revisions are kept forever. */
const BOM_STATUS = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  OBSOLETE: 'obsolete',   // superseded but NEVER deleted
  ARCHIVED: 'archived',   // read-only historical snapshot
});

/** Bilingual labels for UI. */
const LABELS = Object.freeze({
  en: Object.freeze({
    bom: 'Bill of Materials',
    revision: 'Revision',
    effectiveDate: 'Effective Date',
    endDate: 'End Date',
    components: 'Components',
    sku: 'SKU',
    qty: 'Quantity',
    uom: 'Unit of Measure',
    scrap: 'Scrap %',
    scrap_cutting: 'Cutting scrap',
    scrap_welding: 'Welding scrap',
    scrap_bending: 'Bending scrap',
    alternatives: 'Alternatives',
    routing: 'Routing',
    whereUsed: 'Where Used',
    costRollup: 'Cost Roll-up',
    materialCost: 'Material Cost',
    laborCost: 'Labor Cost',
    overheadCost: 'Overhead Cost',
    totalCost: 'Total Cost',
    explode: 'Explode BOM',
    active: 'Active',
    obsolete: 'Obsolete',
    draft: 'Draft',
    archived: 'Archived',
    substitute: 'Substitute Component',
    engineeringChange: 'Engineering Change',
    materialCert: 'Material Certificate',
    lotTraceability: 'Lot Traceability',
  }),
  he: Object.freeze({
    bom: 'עץ מוצר',
    revision: 'גרסה',
    effectiveDate: 'תאריך תחילה',
    endDate: 'תאריך סיום',
    components: 'רכיבים',
    sku: 'מק"ט',
    qty: 'כמות',
    uom: 'יחידת מידה',
    scrap: 'אחוז פחת',
    scrap_cutting: 'פחת חיתוך',
    scrap_welding: 'פחת ריתוך',
    scrap_bending: 'פחת כיפוף',
    alternatives: 'חלופות',
    routing: 'מסלול ייצור',
    whereUsed: 'היכן משמש',
    costRollup: 'גלגול עלות',
    materialCost: 'עלות חומר',
    laborCost: 'עלות עבודה',
    overheadCost: 'עלות תקורה',
    totalCost: 'עלות כוללת',
    explode: 'פיצוץ עץ מוצר',
    active: 'פעיל',
    obsolete: 'מיושן',
    draft: 'טיוטה',
    archived: 'בארכיון',
    substitute: 'החלפת רכיב',
    engineeringChange: 'שינוי הנדסי',
    materialCert: 'תעודת חומר',
    lotTraceability: 'עקיבות מנה',
  }),
});

/** Max explode depth — guard against pathological nesting. */
const MAX_EXPLODE_DEPTH = 64;

/**
 * ECO (Engineering Change Order) lifecycle. Append-only — once an ECO is
 * filed it is NEVER deleted. Approval is dual: engineering + quality +
 * purchasing must each sign off before status flips to APPROVED.
 */
const ECO_STATUS = Object.freeze({
  PENDING: 'pending',     // ממתין — filed, awaiting approvals
  APPROVED: 'approved',   // מאושר — all required approvers signed
  REJECTED: 'rejected',   // נדחה — at least one approver rejected
  EFFECTIVE: 'effective', // בתוקף — applied to the BOM (new revision created)
  CANCELLED: 'cancelled', // בוטל — withdrawn before approval (still kept)
});

/**
 * Roles required for an ECO approval. Each role MUST have at least one
 * approver entry before status can flip to APPROVED.
 */
const REQUIRED_ECO_ROLES = Object.freeze(['engineering', 'quality', 'purchasing']);

/** Bilingual labels for ECO roles. */
const ECO_ROLE_LABELS = Object.freeze({
  engineering: { he: 'הנדסה', en: 'Engineering' },
  quality:     { he: 'איכות', en: 'Quality' },
  purchasing:  { he: 'רכש',   en: 'Purchasing' },
});

/** Special phantom flag — phantom BOMs pass through quantities without stocking. */
const PHANTOM_FLAG = '__phantom__';

// ─────────────────────────────────────────────────────────────────────
// Small helpers — all pure
// ─────────────────────────────────────────────────────────────────────

/**
 * Round to 4 decimal places (metal-fab precision — kg to the gram).
 * EPSILON bump avoids IEEE-754 drift (e.g. 1.005 → 1.0050 not 1.0049).
 */
function round4(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/** Round to 2 decimal places (currency — agora). */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Non-empty string guard. */
function isStr(s) {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * Resolve the scrap rate for a component, giving priority to:
 *   1. Component-row override (`component.scrap`)
 *   2. Routing operation default (from DEFAULT_SCRAP_RATES)
 *   3. DEFAULT_SCRAP_RATES.default
 */
function resolveScrap(component, operation) {
  if (component && Number.isFinite(component.scrap)) {
    return Math.max(0, component.scrap);
  }
  if (operation && typeof DEFAULT_SCRAP_RATES[operation] === 'number') {
    return DEFAULT_SCRAP_RATES[operation];
  }
  return DEFAULT_SCRAP_RATES.default;
}

/**
 * Generate a simple internal ID when the caller doesn't supply one. Not
 * cryptographic — just deterministic-enough for in-memory store.
 */
let _idCounter = 0;
function nextId(prefix) {
  _idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
}

// ─────────────────────────────────────────────────────────────────────
// BOMManager — the whole deal
// ─────────────────────────────────────────────────────────────────────

class BOMManager {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.itemMaster] Map of sku → item master data:
   *        { name_he, name_en, standardCost, uom, type, certRequired }
   * @param {Object} [opts.routings] Map of routingId → routing:
   *        { operations: [{ name, type, setupMin, runMinPerUnit, laborRate, overheadRate, scrap }], ... }
   * @param {Object} [opts.scrapOverrides] Partial override for DEFAULT_SCRAP_RATES.
   */
  constructor(opts = {}) {
    /** Primary store: bomId → bom record (all revisions, active or obsolete). */
    this._boms = new Map();
    /** Index: sku → Set of bomIds (all revisions of that parent item). */
    this._bySku = new Map();
    /** Index: componentSku → Set of bomIds that reference it (where-used). */
    this._whereUsed = new Map();
    /** Item master data (optional) — price & metadata lookup for cost rollup. */
    this._itemMaster = new Map(Object.entries(opts.itemMaster || {}));
    /** Routing master. */
    this._routings = new Map(Object.entries(opts.routings || {}));
    /** Per-manager scrap-rate overrides. */
    this._scrapRates = Object.freeze({ ...DEFAULT_SCRAP_RATES, ...(opts.scrapOverrides || {}) });
    /** Immutable audit trail — every state change is appended, never removed. */
    this._audit = [];
    /** ECO log — append-only. ecoId → eco record. */
    this._ecos = new Map();
    /** Phantom-part registry — partNumber → { partNumber, name_he, name_en, addedAt }. */
    this._phantoms = new Map();
  }

  // ────────────────────────────────────────────────────────────────
  // Item & routing master hooks
  // ────────────────────────────────────────────────────────────────

  /** Upsert an item-master record (used by cost rollup + validate). */
  upsertItem(sku, data) {
    if (!isStr(sku)) throw new Error('upsertItem: sku is required');
    const existing = this._itemMaster.get(sku) || {};
    this._itemMaster.set(sku, { sku, ...existing, ...data });
    return this._itemMaster.get(sku);
  }

  getItem(sku) {
    return this._itemMaster.get(sku) || null;
  }

  /** Upsert a routing record (labor & overhead source for cost rollup). */
  upsertRouting(routingId, data) {
    if (!isStr(routingId)) throw new Error('upsertRouting: routingId is required');
    const existing = this._routings.get(routingId) || {};
    this._routings.set(routingId, { routingId, ...existing, ...data });
    return this._routings.get(routingId);
  }

  getRouting(routingId) {
    return this._routings.get(routingId) || null;
  }

  // ────────────────────────────────────────────────────────────────
  // createBOM — public API #1
  // ────────────────────────────────────────────────────────────────

  /**
   * Create a new BOM revision. Validates and indexes. Does NOT mutate
   * existing revisions — call `obsoleteRevision()` separately to
   * supersede an older rev.
   *
   * @param {Object} params
   * @param {string} params.sku               Parent item SKU (required)
   * @param {string} [params.name_he]         Hebrew display name
   * @param {string} [params.name_en]         English display name
   * @param {string|number} [params.revision] Revision label (default 'A')
   * @param {Array}  params.components        [{ sku, qty, uom, scrap?, operation?, isOptional?, alternatives?, certRequired?, notes? }]
   * @param {string} [params.routingId]       Link to routing for labor/overhead
   * @param {string} [params.effectiveDate]   ISO date — when revision becomes active
   * @param {string} [params.endDate]         ISO date — when revision retires (optional)
   * @param {string} [params.status]          BOM_STATUS value (default DRAFT)
   * @param {string} [params.notes]           Free-text engineering notes
   * @param {string} [params.id]              Override auto-generated id
   * @returns {Object} stored BOM record
   */
  createBOM(params = {}) {
    const {
      sku,
      name_he = '',
      name_en = '',
      revision = 'A',
      components = [],
      routingId = null,
      effectiveDate = null,
      endDate = null,
      status = BOM_STATUS.DRAFT,
      notes = '',
      id = null,
    } = params;

    if (!isStr(sku)) {
      throw new Error('createBOM: sku is required');
    }
    if (!Array.isArray(components)) {
      throw new Error('createBOM: components must be an array');
    }

    // Normalize components — every row becomes a frozen, validated shape.
    const normalizedComponents = components.map((c, idx) => {
      if (!c || !isStr(c.sku)) {
        throw new Error(`createBOM: component[${idx}] missing sku`);
      }
      const qty = Number(c.qty);
      if (!Number.isFinite(qty)) {
        throw new Error(`createBOM: component[${idx}] (${c.sku}) qty must be a number`);
      }
      return {
        sku: c.sku,
        name_he: c.name_he || '',
        name_en: c.name_en || '',
        qty,
        uom: c.uom || UOMS.PIECE,
        scrap: Number.isFinite(c.scrap) ? Number(c.scrap) : null,
        operation: c.operation || null,
        isOptional: Boolean(c.isOptional),
        alternatives: Array.isArray(c.alternatives) ? c.alternatives.slice() : [],
        certRequired: Boolean(c.certRequired),
        notes: c.notes || '',
        // Metal-fab certificate traceability hook — populated at issue-to-production time.
        materialCert: c.materialCert || null,
        // 2026-04 GROW (Y-031) — preserved through normalization:
        level: Number.isFinite(c.level) ? Number(c.level) : 1,
        alternateGroup: c.alternateGroup || null,
        effectivityFrom: c.effectivityFrom || null,
        effectivityTo: c.effectivityTo || null,
        subRev: c.subRev || null,
      };
    });

    const bomId = id || nextId('BOM');
    const now = new Date().toISOString();
    const record = {
      id: bomId,
      sku,
      name_he,
      name_en,
      revision: String(revision),
      components: normalizedComponents,
      routingId,
      effectiveDate: effectiveDate || now.slice(0, 10),
      endDate,
      status,
      notes,
      createdAt: now,
      updatedAt: now,
      supersededBy: null,    // bomId of replacement revision, filled by obsoleteRevision()
      supersedes: null,      // bomId of previous revision
      history: [],           // append-only audit entries
    };

    // Validate BEFORE indexing — if it throws, store stays clean.
    const validation = this.validateBOM(record);
    if (!validation.ok) {
      const err = new Error(`createBOM: validation failed — ${validation.errors.join('; ')}`);
      err.validation = validation;
      throw err;
    }

    // Index.
    this._boms.set(bomId, record);
    if (!this._bySku.has(sku)) this._bySku.set(sku, new Set());
    this._bySku.get(sku).add(bomId);
    for (const c of normalizedComponents) {
      if (!this._whereUsed.has(c.sku)) this._whereUsed.set(c.sku, new Set());
      this._whereUsed.get(c.sku).add(bomId);
    }

    this._audit.push({ at: now, action: 'create', bomId, sku, revision: record.revision });
    record.history.push({ at: now, action: 'create', rev: record.revision });
    return record;
  }

  /** Retrieve a BOM record by id. Returns null when not found. */
  getBOM(bomId) {
    return this._boms.get(bomId) || null;
  }

  /**
   * Find the ACTIVE BOM for a given parent SKU, optionally filtered by
   * effective date. If `asOfDate` is supplied we pick the revision whose
   * window contains it.
   */
  getActiveBOMForSku(sku, asOfDate = null) {
    const ids = this._bySku.get(sku);
    if (!ids || ids.size === 0) return null;
    const dateStr = asOfDate ? String(asOfDate).slice(0, 10) : null;
    let latest = null;
    for (const id of ids) {
      const bom = this._boms.get(id);
      if (!bom) continue;
      if (bom.status !== BOM_STATUS.ACTIVE && bom.status !== BOM_STATUS.DRAFT) continue;
      if (dateStr) {
        if (bom.effectiveDate && bom.effectiveDate > dateStr) continue;
        if (bom.endDate && bom.endDate < dateStr) continue;
      }
      if (!latest || (bom.updatedAt > latest.updatedAt)) latest = bom;
    }
    return latest;
  }

  // ────────────────────────────────────────────────────────────────
  // explodeBOM — public API #2
  // ────────────────────────────────────────────────────────────────

  /**
   * Recursively explode a BOM to raw-material leaves. Handles
   * sub-assemblies (a component SKU that itself has a BOM), scrap
   * inclusion, and a depth guard to catch runaway cycles even when
   * validateBOM was skipped.
   *
   * @param {string} sku     Parent SKU to explode
   * @param {number} [qty=1] Quantity of the parent to build
   * @param {number} [levels=MAX_EXPLODE_DEPTH] Max recursion depth
   * @returns {Object} { parentSku, parentQty, lines, totalsByLeaf, depth }
   *
   * Each `lines` row:
   *   { level, parentSku, sku, name_he, name_en, nominalQty, effectiveQty,
   *     uom, scrap, operation, isOptional, path, isLeaf, bomId? }
   *
   * `totalsByLeaf` maps raw-leaf SKU → { qty, uom } aggregated.
   */
  explodeBOM(sku, qty = 1, levels = MAX_EXPLODE_DEPTH) {
    if (!isStr(sku)) throw new Error('explodeBOM: sku is required');
    const parentQty = Number(qty);
    if (!Number.isFinite(parentQty) || parentQty < 0) {
      throw new Error('explodeBOM: qty must be a non-negative number');
    }
    const maxDepth = Math.min(Math.max(1, Number(levels) || MAX_EXPLODE_DEPTH), MAX_EXPLODE_DEPTH);

    const lines = [];
    const totalsByLeaf = Object.create(null);
    let maxReached = 0;

    // Depth-first traversal. `stack` is visited-SKU path for cycle detection.
    const walk = (parentSkuLocal, parentQtyLocal, level, stack) => {
      if (level > maxDepth) {
        throw new Error(`explodeBOM: max depth ${maxDepth} exceeded at ${parentSkuLocal}`);
      }
      if (level > maxReached) maxReached = level;

      const bom = this.getActiveBOMForSku(parentSkuLocal);
      if (!bom) {
        // Treat as raw leaf — no BOM means nothing to explode.
        const leafSku = parentSkuLocal;
        if (!totalsByLeaf[leafSku]) {
          const item = this.getItem(leafSku);
          totalsByLeaf[leafSku] = { qty: 0, uom: (item && item.uom) || UOMS.PIECE };
        }
        totalsByLeaf[leafSku].qty = round4(totalsByLeaf[leafSku].qty + parentQtyLocal);
        return;
      }

      for (const comp of bom.components) {
        // Circular-reference guard.
        if (stack.includes(comp.sku)) {
          const err = new Error(
            `explodeBOM: circular reference — ${[...stack, comp.sku].join(' -> ')}`
          );
          err.cycle = [...stack, comp.sku];
          throw err;
        }

        const scrap = resolveScrap(comp, comp.operation);
        const nominal = round4(parentQtyLocal * comp.qty);
        const effective = round4(nominal * (1 + scrap));

        // If the component itself has an active BOM, descend. Otherwise
        // treat as raw material leaf.
        const subBom = this.getActiveBOMForSku(comp.sku);
        const isLeaf = !subBom;

        lines.push({
          level,
          parentSku: parentSkuLocal,
          sku: comp.sku,
          name_he: comp.name_he || (this.getItem(comp.sku) && this.getItem(comp.sku).name_he) || '',
          name_en: comp.name_en || (this.getItem(comp.sku) && this.getItem(comp.sku).name_en) || '',
          nominalQty: nominal,
          effectiveQty: effective,
          uom: comp.uom,
          scrap,
          operation: comp.operation,
          isOptional: comp.isOptional,
          path: [...stack, comp.sku],
          isLeaf,
          bomId: subBom ? subBom.id : null,
          certRequired: comp.certRequired,
        });

        if (isLeaf) {
          if (!totalsByLeaf[comp.sku]) {
            totalsByLeaf[comp.sku] = { qty: 0, uom: comp.uom };
          }
          totalsByLeaf[comp.sku].qty = round4(totalsByLeaf[comp.sku].qty + effective);
        } else {
          // Recurse into sub-assembly.
          walk(comp.sku, effective, level + 1, [...stack, comp.sku]);
        }
      }
    };

    walk(sku, parentQty, 1, [sku]);

    return {
      parentSku: sku,
      parentQty,
      lines,
      totalsByLeaf,
      depth: maxReached,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // costRollup — public API #3
  // ────────────────────────────────────────────────────────────────

  /**
   * Roll up the standard cost of a parent SKU:
   *
   *   material = Σ (effectiveQty × standardCost)     from explodeBOM leaves
   *   labor    = Σ (setupMin + runMin × qty) × laborRate / 60
   *   overhead = Σ (setupMin + runMin × qty) × overheadRate / 60
   *
   * All values are rounded to 2 decimals (currency). If a leaf has no
   * item-master standard cost we log it on `missingCosts` so the caller
   * can surface the gap.
   */
  costRollup(sku, qty = 1) {
    if (!isStr(sku)) throw new Error('costRollup: sku is required');

    const exploded = this.explodeBOM(sku, qty);
    const missingCosts = [];
    const byLeaf = [];

    let material = 0;
    for (const [leafSku, info] of Object.entries(exploded.totalsByLeaf)) {
      const item = this.getItem(leafSku);
      if (!item || !Number.isFinite(item.standardCost)) {
        missingCosts.push(leafSku);
        byLeaf.push({ sku: leafSku, qty: info.qty, uom: info.uom, unitCost: null, lineCost: 0 });
        continue;
      }
      const lineCost = round2(info.qty * item.standardCost);
      material += lineCost;
      byLeaf.push({
        sku: leafSku,
        qty: info.qty,
        uom: info.uom,
        unitCost: item.standardCost,
        lineCost,
      });
    }
    material = round2(material);

    // Walk all BOMs in the explode tree and collect routings for labor/OH.
    let labor = 0;
    let overhead = 0;
    const visitedBoms = new Set();
    const collectRouting = (bomId, multiplier) => {
      if (!bomId || visitedBoms.has(bomId)) return;
      visitedBoms.add(bomId);
      const bom = this.getBOM(bomId);
      if (!bom || !bom.routingId) return;
      const routing = this.getRouting(bom.routingId);
      if (!routing || !Array.isArray(routing.operations)) return;
      for (const op of routing.operations) {
        const setupMin = Number(op.setupMin || 0);
        const runMinPerUnit = Number(op.runMinPerUnit || 0);
        const totalMin = setupMin + runMinPerUnit * multiplier;
        const laborRate = Number(op.laborRate || 0);
        const overheadRate = Number(op.overheadRate || 0);
        labor += (totalMin / 60) * laborRate;
        overhead += (totalMin / 60) * overheadRate;
      }
    };

    // Parent-level routing.
    const parentBom = this.getActiveBOMForSku(sku);
    if (parentBom) collectRouting(parentBom.id, qty);

    // Sub-assembly routings (sum qty per sub-BOM from explode lines).
    const subBomQty = new Map();
    for (const line of exploded.lines) {
      if (line.bomId) {
        subBomQty.set(line.bomId, (subBomQty.get(line.bomId) || 0) + line.effectiveQty);
      }
    }
    for (const [bomId, mult] of subBomQty.entries()) {
      collectRouting(bomId, mult);
    }

    labor = round2(labor);
    overhead = round2(overhead);
    const total = round2(material + labor + overhead);

    return {
      sku,
      qty,
      material,
      labor,
      overhead,
      total,
      byLeaf,
      missingCosts,
      routingsUsed: [...visitedBoms],
    };
  }

  // ────────────────────────────────────────────────────────────────
  // whereUsed — public API #4
  // ────────────────────────────────────────────────────────────────

  /**
   * Reverse lookup: which BOMs consume `componentSku`? Returns a list of
   * `{ bomId, parentSku, revision, status, qty, uom, scrap }` — one entry
   * per BOM line using the component (direct references only, not
   * transitive parents).
   *
   * Pass `{ transitive: true }` to include parents-of-parents.
   */
  whereUsed(componentSku, opts = {}) {
    if (!isStr(componentSku)) throw new Error('whereUsed: componentSku is required');
    const { transitive = false, includeObsolete = true } = opts;

    const direct = [];
    const bomIds = this._whereUsed.get(componentSku) || new Set();
    for (const id of bomIds) {
      const bom = this._boms.get(id);
      if (!bom) continue;
      if (!includeObsolete && bom.status === BOM_STATUS.OBSOLETE) continue;
      for (const comp of bom.components) {
        if (comp.sku !== componentSku) continue;
        direct.push({
          bomId: bom.id,
          parentSku: bom.sku,
          revision: bom.revision,
          status: bom.status,
          qty: comp.qty,
          uom: comp.uom,
          scrap: comp.scrap,
          isOptional: comp.isOptional,
        });
      }
    }

    if (!transitive) return direct;

    // BFS upwards: any BOM whose parent SKU appears as a component of
    // another BOM is indirectly affected.
    const seen = new Set(direct.map(d => d.parentSku));
    const queue = [...seen];
    const transitiveList = [];
    while (queue.length) {
      const nextSku = queue.shift();
      const parents = this._whereUsed.get(nextSku) || new Set();
      for (const pid of parents) {
        const pbom = this._boms.get(pid);
        if (!pbom) continue;
        if (!includeObsolete && pbom.status === BOM_STATUS.OBSOLETE) continue;
        if (seen.has(pbom.sku)) continue;
        seen.add(pbom.sku);
        queue.push(pbom.sku);
        transitiveList.push({
          bomId: pbom.id,
          parentSku: pbom.sku,
          revision: pbom.revision,
          status: pbom.status,
          via: nextSku,
        });
      }
    }

    return { direct, transitive: transitiveList };
  }

  // ────────────────────────────────────────────────────────────────
  // compareBOMs — public API #5
  // ────────────────────────────────────────────────────────────────

  /**
   * Diff two revisions of the same parent SKU (or any two BOMs by id).
   * Returns { added, removed, changed, unchanged } grouped by component
   * sku. `changed` rows include per-field diff objects.
   *
   * Accepts either revision labels (string) or full BOM ids.
   */
  compareBOMs(sku, revA, revB) {
    const resolve = (rev) => {
      if (!rev) return null;
      // First: try as bomId
      if (this._boms.has(rev)) return this._boms.get(rev);
      // Fall back: lookup by (sku, revision label)
      const candidates = this._bySku.get(sku) || new Set();
      for (const id of candidates) {
        const b = this._boms.get(id);
        if (b && String(b.revision) === String(rev)) return b;
      }
      return null;
    };
    const a = resolve(revA);
    const b = resolve(revB);
    if (!a) throw new Error(`compareBOMs: cannot find revision ${revA} for sku ${sku}`);
    if (!b) throw new Error(`compareBOMs: cannot find revision ${revB} for sku ${sku}`);

    const mapA = new Map(a.components.map(c => [c.sku, c]));
    const mapB = new Map(b.components.map(c => [c.sku, c]));

    const added = [];
    const removed = [];
    const changed = [];
    const unchanged = [];

    for (const [csku, cA] of mapA.entries()) {
      const cB = mapB.get(csku);
      if (!cB) {
        removed.push({ sku: csku, qty: cA.qty, uom: cA.uom });
        continue;
      }
      const fieldDiff = {};
      if (round4(cA.qty) !== round4(cB.qty)) {
        fieldDiff.qty = { from: cA.qty, to: cB.qty };
      }
      if (cA.uom !== cB.uom) fieldDiff.uom = { from: cA.uom, to: cB.uom };
      if ((cA.scrap || 0) !== (cB.scrap || 0)) {
        fieldDiff.scrap = { from: cA.scrap, to: cB.scrap };
      }
      if (Boolean(cA.isOptional) !== Boolean(cB.isOptional)) {
        fieldDiff.isOptional = { from: cA.isOptional, to: cB.isOptional };
      }
      if (cA.operation !== cB.operation) {
        fieldDiff.operation = { from: cA.operation, to: cB.operation };
      }
      if (Object.keys(fieldDiff).length) {
        changed.push({ sku: csku, diff: fieldDiff });
      } else {
        unchanged.push({ sku: csku });
      }
    }
    for (const [csku, cB] of mapB.entries()) {
      if (!mapA.has(csku)) {
        added.push({ sku: csku, qty: cB.qty, uom: cB.uom });
      }
    }

    return {
      a: { id: a.id, revision: a.revision, status: a.status, effectiveDate: a.effectiveDate },
      b: { id: b.id, revision: b.revision, status: b.status, effectiveDate: b.effectiveDate },
      added,
      removed,
      changed,
      unchanged,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        changedCount: changed.length,
        unchangedCount: unchanged.length,
      },
    };
  }

  // ────────────────────────────────────────────────────────────────
  // obsoleteRevision — public API #6 (preserves history!)
  // ────────────────────────────────────────────────────────────────

  /**
   * Mark `bomId` as obsolete, pointing to `newRevId` as the superseding
   * revision. Enforces the golden rule: **NEVER delete**. The record
   * stays in the store forever — status flips to OBSOLETE, endDate is
   * set to today, and a history entry is appended.
   *
   * @param {string} bomId      Revision being retired
   * @param {string} newRevId   Revision taking over (must already exist)
   * @returns {Object} updated old record
   */
  obsoleteRevision(bomId, newRevId) {
    const old = this._boms.get(bomId);
    if (!old) throw new Error(`obsoleteRevision: bomId ${bomId} not found`);
    const next = newRevId ? this._boms.get(newRevId) : null;
    if (newRevId && !next) {
      throw new Error(`obsoleteRevision: replacement ${newRevId} not found`);
    }
    if (next && next.sku !== old.sku) {
      throw new Error(
        `obsoleteRevision: replacement ${newRevId} is for sku ${next.sku}, not ${old.sku}`
      );
    }

    const now = new Date().toISOString();
    old.status = BOM_STATUS.OBSOLETE;
    old.endDate = now.slice(0, 10);
    old.supersededBy = newRevId || null;
    old.updatedAt = now;
    old.history.push({
      at: now,
      action: 'obsolete',
      rev: old.revision,
      supersededBy: newRevId || null,
    });

    if (next) {
      next.supersedes = bomId;
      next.status = BOM_STATUS.ACTIVE;
      next.updatedAt = now;
      next.history.push({ at: now, action: 'activate', rev: next.revision, supersedes: bomId });
    }

    this._audit.push({ at: now, action: 'obsolete', bomId, supersededBy: newRevId || null });
    return old;
  }

  // ────────────────────────────────────────────────────────────────
  // validateBOM — public API #7
  // ────────────────────────────────────────────────────────────────

  /**
   * Validate a BOM record (either stored or a proposed one). Checks:
   *
   *   1. Required fields (sku, components array)
   *   2. Missing component skus / blanks
   *   3. Negative, zero, or non-finite quantities
   *   4. Self-reference (parent component === parent sku)
   *   5. Circular reference in the explode tree
   *   6. Unknown UOM strings
   *   7. Unknown operations on components
   *   8. Alternates referenced but not known
   *   9. Scrap outside [0, 1] range
   *  10. Duplicate component skus (warn only)
   *
   * Returns `{ ok, errors, warnings }`. When called during createBOM the
   * BOM is not yet indexed — the function walks known BOMs for cycle
   * detection but also synthetically includes the candidate record.
   */
  validateBOM(bom) {
    const errors = [];
    const warnings = [];

    if (!bom || typeof bom !== 'object') {
      return { ok: false, errors: ['bom is required'], warnings };
    }
    if (!isStr(bom.sku)) errors.push('sku is required');
    if (!Array.isArray(bom.components)) {
      errors.push('components must be an array');
      return { ok: false, errors, warnings };
    }
    if (bom.components.length === 0) {
      warnings.push('components array is empty');
    }

    const seenSkus = new Set();
    for (let i = 0; i < bom.components.length; i += 1) {
      const c = bom.components[i];
      const label = `component[${i}]`;
      if (!c || typeof c !== 'object') {
        errors.push(`${label}: not an object`);
        continue;
      }
      if (!isStr(c.sku)) {
        errors.push(`${label}: missing sku`);
        continue;
      }
      if (c.sku === bom.sku) {
        errors.push(`${label} (${c.sku}): self-reference — a BOM cannot contain its own sku`);
      }
      if (seenSkus.has(c.sku)) {
        warnings.push(`${label} (${c.sku}): duplicate component sku`);
      }
      seenSkus.add(c.sku);
      if (!Number.isFinite(c.qty)) {
        errors.push(`${label} (${c.sku}): qty must be a finite number`);
      } else if (c.qty < 0) {
        errors.push(`${label} (${c.sku}): qty must be non-negative (got ${c.qty})`);
      } else if (c.qty === 0 && !c.isOptional) {
        warnings.push(`${label} (${c.sku}): qty is zero but not marked optional`);
      }
      if (c.uom && !Object.values(UOMS).includes(c.uom)) {
        warnings.push(`${label} (${c.sku}): unknown uom "${c.uom}"`);
      }
      if (c.scrap != null && Number.isFinite(c.scrap)) {
        if (c.scrap < 0 || c.scrap > 1) {
          errors.push(`${label} (${c.sku}): scrap must be in [0,1] (got ${c.scrap})`);
        }
      }
      if (c.operation && !(c.operation in this._scrapRates)) {
        warnings.push(`${label} (${c.sku}): unknown operation "${c.operation}"`);
      }
      if (Array.isArray(c.alternatives)) {
        for (const alt of c.alternatives) {
          if (!isStr(alt)) {
            warnings.push(`${label} (${c.sku}): alternate is not a string`);
          }
        }
      }
    }

    // Cycle detection — walk the synthetic store (existing BOMs + this
    // candidate record). Uses recursive DFS with a visited stack.
    if (errors.length === 0) {
      try {
        this._detectCycles(bom);
      } catch (e) {
        errors.push(e.message);
      }
    }

    return { ok: errors.length === 0, errors, warnings };
  }

  /**
   * Detect cycles in the BOM graph that would result from adding or
   * updating `candidate`. Throws on detection.
   */
  _detectCycles(candidate) {
    // Build a temporary sku-to-children map from existing active BOMs.
    const childMap = new Map();
    for (const bom of this._boms.values()) {
      if (bom.id === candidate.id) continue; // superseded by candidate
      if (bom.status === BOM_STATUS.OBSOLETE) continue;
      if (!childMap.has(bom.sku)) childMap.set(bom.sku, new Set());
      for (const c of bom.components) childMap.get(bom.sku).add(c.sku);
    }
    // Insert the candidate (may be new or replacement).
    if (!childMap.has(candidate.sku)) childMap.set(candidate.sku, new Set());
    for (const c of candidate.components) childMap.get(candidate.sku).add(c.sku);

    const visiting = new Set();
    const visited = new Set();
    const dfs = (node, stack) => {
      if (visiting.has(node)) {
        throw new Error(`circular reference detected: ${[...stack, node].join(' -> ')}`);
      }
      if (visited.has(node)) return;
      visiting.add(node);
      const children = childMap.get(node) || new Set();
      for (const ch of children) {
        dfs(ch, [...stack, node]);
      }
      visiting.delete(node);
      visited.add(node);
    };
    dfs(candidate.sku, []);
  }

  // ────────────────────────────────────────────────────────────────
  // substituteComponent — public API #8 (engineering change)
  // ────────────────────────────────────────────────────────────────

  /**
   * Engineering change: swap `oldSku` for `newSku` in the given BOM.
   * Creates a NEW revision (letter bump: A → B → C …) and marks the
   * old revision obsolete. Keeps the same qty/uom/scrap unless
   * explicitly overridden.
   *
   * @param {string} bomId
   * @param {string} oldSku
   * @param {string} newSku
   * @param {string} [effectiveDate]  ISO date for the new revision
   * @param {Object} [overrides]      { qty, uom, scrap, operation, notes }
   * @returns {Object} { oldBom, newBom }
   */
  substituteComponent(bomId, oldSku, newSku, effectiveDate = null, overrides = {}) {
    const old = this._boms.get(bomId);
    if (!old) throw new Error(`substituteComponent: bomId ${bomId} not found`);
    if (!isStr(oldSku) || !isStr(newSku)) {
      throw new Error('substituteComponent: oldSku and newSku are required');
    }
    const idx = old.components.findIndex(c => c.sku === oldSku);
    if (idx < 0) {
      throw new Error(`substituteComponent: ${oldSku} not in BOM ${bomId}`);
    }

    const newComponents = old.components.map((c, i) => {
      if (i !== idx) return { ...c, alternatives: c.alternatives.slice() };
      return {
        ...c,
        sku: newSku,
        qty: overrides.qty != null ? Number(overrides.qty) : c.qty,
        uom: overrides.uom || c.uom,
        scrap: overrides.scrap != null ? Number(overrides.scrap) : c.scrap,
        operation: overrides.operation || c.operation,
        notes: overrides.notes || `substituted from ${oldSku} — ${c.notes || ''}`.trim(),
        alternatives: [...new Set([oldSku, ...c.alternatives])],
      };
    });

    // Revision label bump — letters first (A→B), then fall back to numeric suffix.
    const nextRev = this._nextRevisionLabel(old.revision);

    const newBom = this.createBOM({
      sku: old.sku,
      name_he: old.name_he,
      name_en: old.name_en,
      revision: nextRev,
      components: newComponents,
      routingId: old.routingId,
      effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
      status: BOM_STATUS.ACTIVE,
      notes: `ECO: substitute ${oldSku} -> ${newSku}. ${old.notes || ''}`.trim(),
    });

    this.obsoleteRevision(bomId, newBom.id);

    return { oldBom: old, newBom };
  }

  /**
   * Bump a revision label. Pure function — returns the next label without
   * mutating anything. Handles A..Z, then A1, A2, etc. once Z is reached.
   */
  _nextRevisionLabel(current) {
    const str = String(current || 'A').trim();
    // Match like "A", "B3", "REV-1"
    const letterMatch = /^([A-Z])$/.exec(str);
    if (letterMatch) {
      const code = str.charCodeAt(0);
      if (code < 90 /* Z */) return String.fromCharCode(code + 1);
      return 'A1';
    }
    const letterNumMatch = /^([A-Z])(\d+)$/.exec(str);
    if (letterNumMatch) {
      return `${letterNumMatch[1]}${Number(letterNumMatch[2]) + 1}`;
    }
    const numericMatch = /^(\d+)$/.exec(str);
    if (numericMatch) return String(Number(numericMatch[1]) + 1);
    return `${str}.1`;
  }

  // ────────────────────────────────────────────────────────────────
  // Metal-fab cert traceability hook
  // ────────────────────────────────────────────────────────────────

  /**
   * Attach material-certificate data to a specific component issue. Does
   * NOT mutate the BOM master — instead it pushes a traceability record
   * onto an internal log (which a WMS / shop-floor system would query).
   *
   * In a full ERP this would become a foreign key into an issue-to-prod
   * record; here we just capture it so downstream tests / audits can
   * verify it was flagged.
   */
  attachMaterialCert(bomId, componentSku, cert) {
    const bom = this._boms.get(bomId);
    if (!bom) throw new Error(`attachMaterialCert: bomId ${bomId} not found`);
    if (!cert || !isStr(cert.lotId || cert.heatNumber || cert.millCert)) {
      throw new Error('attachMaterialCert: cert must include lotId or heatNumber or millCert');
    }
    const comp = bom.components.find(c => c.sku === componentSku);
    if (!comp) {
      throw new Error(`attachMaterialCert: ${componentSku} not in BOM ${bomId}`);
    }
    const entry = {
      at: new Date().toISOString(),
      bomId,
      sku: componentSku,
      cert: { ...cert },
    };
    bom.history.push({ at: entry.at, action: 'cert-attach', sku: componentSku, cert: cert.lotId || cert.heatNumber || cert.millCert });
    this._audit.push({ at: entry.at, action: 'cert-attach', ...entry });
    return entry;
  }

  // ════════════════════════════════════════════════════════════════
  // 2026-04 GROW — Y-031 spec extension
  // ════════════════════════════════════════════════════════════════
  // Adds: defineBOM, explode, implode, availabilityCheck, ecoRequest,
  // approveEco, alternateGroup, phantomBOM, costedBOM. All built on top
  // of the existing primitives — never delete, only upgrade and grow.

  // ────────────────────────────────────────────────────────────────
  // defineBOM — Y-031 multi-level shape
  // ────────────────────────────────────────────────────────────────

  /**
   * Define a BOM in the Y-031 spec shape (multi-level, with effectivity
   * dates and alternateGroup tags). Internally normalizes to the existing
   * createBOM data model so all downstream tooling (explode, costRollup,
   * whereUsed, validateBOM) just works.
   *
   *   defineBOM({
   *     partNumber: 'GATE-01',
   *     rev: 'A',
   *     name_he: 'שער פלדה',
   *     items: [
   *       { childPart: 'STEEL-SHEET-2MM', qty: 18, uom: 'kg',
   *         scrap: 0.05, level: 1, alternateGroup: 'SHEETS',
   *         effectivityFrom: '2026-01-01', effectivityTo: '2026-12-31' },
   *       ...
   *     ],
   *     status: 'active',
   *     phantom: false,
   *     routingId: 'RTG-GATE',
   *   })
   *
   * Notes:
   *   - `level` is informational (UI hint); recursion is by sub-BOM lookup.
   *   - `scrap` may be expressed as 0..1 OR 0..100 — values >1 are
   *     interpreted as percent and divided by 100.
   *   - `effectivityFrom`/`effectivityTo` are stored on the row AND
   *     bubble up to the BOM record's effectiveDate/endDate when this is
   *     the only row (or as widest envelope).
   *   - Re-defining an existing partNumber+rev throws to enforce
   *     immutability of revisions; bump the rev to make a change.
   *
   * @returns {Object} stored BOM record (compatible with createBOM output)
   */
  defineBOM(spec = {}) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('defineBOM: spec object is required');
    }
    const {
      partNumber,
      rev = 'A',
      name_he = '',
      name_en = '',
      items = [],
      status = BOM_STATUS.ACTIVE,
      routingId = null,
      effectiveDate = null,
      endDate = null,
      notes = '',
      phantom = false,
      id = null,
    } = spec;

    if (!isStr(partNumber)) {
      throw new Error('defineBOM: partNumber is required');
    }
    if (!Array.isArray(items)) {
      throw new Error('defineBOM: items must be an array');
    }

    // Reject duplicate (partNumber, rev) — revisions are immutable.
    const existing = this.findBOM(partNumber, rev);
    if (existing) {
      throw new Error(
        `defineBOM: revision ${rev} of ${partNumber} already exists (id=${existing.id}). ` +
        `Bump rev to upgrade.`,
      );
    }

    // Translate items[] → components[] expected by createBOM().
    const components = items.map((it, idx) => {
      if (!it || typeof it !== 'object') {
        throw new Error(`defineBOM: items[${idx}] is not an object`);
      }
      // Allow either childPart (Y-031 spec) or sku (legacy).
      const childPart = it.childPart || it.sku;
      if (!isStr(childPart)) {
        throw new Error(`defineBOM: items[${idx}] missing childPart`);
      }
      // Scrap normalization: accept percentage 0..100 or fraction 0..1.
      let scrap = null;
      if (it.scrap != null && Number.isFinite(it.scrap)) {
        scrap = Number(it.scrap);
        if (scrap < 0 || scrap > 100) {
          throw new Error(
            `defineBOM: items[${idx}] (${childPart}) scrap% must be in [0,100] (got ${scrap})`,
          );
        }
        if (scrap > 1) scrap = scrap / 100;
      }
      return {
        sku: childPart,
        name_he: it.name_he || '',
        name_en: it.name_en || '',
        qty: Number(it.qty),
        uom: it.uom || UOMS.PIECE,
        scrap,
        operation: it.operation || null,
        isOptional: Boolean(it.isOptional),
        alternatives: Array.isArray(it.alternatives) ? it.alternatives.slice() : [],
        certRequired: Boolean(it.certRequired),
        notes: it.notes || '',
        materialCert: it.materialCert || null,
        // Y-031 extension fields preserved on the component row:
        level: Number.isFinite(it.level) ? Number(it.level) : 1,
        alternateGroup: it.alternateGroup || null,
        effectivityFrom: it.effectivityFrom || null,
        effectivityTo: it.effectivityTo || null,
      };
    });

    // Compute envelope effectivity dates from rows if not explicitly given.
    let envelopeFrom = effectiveDate;
    let envelopeTo = endDate;
    if (!envelopeFrom) {
      const fromCandidates = components.map(c => c.effectivityFrom).filter(Boolean).sort();
      if (fromCandidates.length) envelopeFrom = fromCandidates[0];
    }
    if (!envelopeTo) {
      const toCandidates = components.map(c => c.effectivityTo).filter(Boolean).sort();
      if (toCandidates.length) envelopeTo = toCandidates[toCandidates.length - 1];
    }

    const record = this.createBOM({
      sku: partNumber,
      name_he,
      name_en,
      revision: rev,
      components,
      routingId,
      effectiveDate: envelopeFrom,
      endDate: envelopeTo,
      status,
      notes,
      id,
    });
    record.phantom = Boolean(phantom);
    if (phantom) this.phantomBOM(partNumber);

    // Re-emit a Y-031-flavoured audit entry so the new spec is traceable.
    this._audit.push({
      at: new Date().toISOString(),
      action: 'defineBOM',
      bomId: record.id,
      partNumber,
      rev: record.revision,
      itemCount: components.length,
      phantom: Boolean(phantom),
    });
    return record;
  }

  /**
   * Find a stored BOM by (partNumber, rev). Considers ALL statuses
   * (active, draft, obsolete, archived) — needed by ECO-driven workflows
   * that diff against historical revisions.
   */
  findBOM(partNumber, rev) {
    if (!isStr(partNumber)) return null;
    const ids = this._bySku.get(partNumber);
    if (!ids || ids.size === 0) return null;
    const wantRev = rev != null ? String(rev) : null;
    for (const id of ids) {
      const bom = this._boms.get(id);
      if (!bom) continue;
      if (wantRev && String(bom.revision) !== wantRev) continue;
      return bom;
    }
    return null;
  }

  // ────────────────────────────────────────────────────────────────
  // explode / implode — Y-031 spec aliases
  // ────────────────────────────────────────────────────────────────

  /**
   * Y-031 spec explode: multi-level full flat list with scrap factor
   * applied. Wraps the underlying explodeBOM() but allows pinning a
   * specific revision (otherwise defaults to the active rev).
   *
   * @param {string} partNumber
   * @param {string|null} rev   Specific revision (null → active)
   * @param {number} qty
   * @param {Object} [opts]     { asOfDate, maxDepth }
   */
  explode(partNumber, rev = null, qty = 1, opts = {}) {
    if (!isStr(partNumber)) throw new Error('explode: partNumber is required');
    const parentQty = Number(qty);
    if (!Number.isFinite(parentQty) || parentQty < 0) {
      throw new Error('explode: qty must be a non-negative number');
    }

    // If rev is given, temporarily make THAT revision the active one
    // for the duration of the call by routing through a custom walker.
    if (rev != null) {
      const target = this.findBOM(partNumber, rev);
      if (!target) {
        throw new Error(`explode: ${partNumber} rev ${rev} not found`);
      }
      return this._explodeFromRecord(target, parentQty, opts);
    }
    return this.explodeBOM(partNumber, parentQty, opts.maxDepth || MAX_EXPLODE_DEPTH);
  }

  /**
   * Internal — explode starting from a specific BOM record (rather than
   * resolving by sku → active). Used by `explode()` when the caller pins
   * a specific revision and by `costedBOM()`.
   */
  _explodeFromRecord(rootBom, parentQty, opts = {}) {
    const maxDepth = Math.min(Math.max(1, Number(opts.maxDepth) || MAX_EXPLODE_DEPTH), MAX_EXPLODE_DEPTH);
    const asOfDate = opts.asOfDate ? String(opts.asOfDate).slice(0, 10) : null;
    const includePhantoms = opts.includePhantoms !== false;

    const lines = [];
    const totalsByLeaf = Object.create(null);
    let maxReached = 0;

    const walk = (currentBom, qtyLocal, level, stack) => {
      if (level > maxDepth) {
        throw new Error(`explode: max depth ${maxDepth} exceeded at ${currentBom.sku}`);
      }
      if (level > maxReached) maxReached = level;

      for (const comp of currentBom.components) {
        if (stack.includes(comp.sku)) {
          const err = new Error(
            `explode: circular reference — ${[...stack, comp.sku].join(' -> ')}`,
          );
          err.cycle = [...stack, comp.sku];
          throw err;
        }

        // Effectivity date filter — skip rows outside the as-of window.
        if (asOfDate) {
          if (comp.effectivityFrom && comp.effectivityFrom > asOfDate) continue;
          if (comp.effectivityTo && comp.effectivityTo < asOfDate) continue;
        }

        const scrap = resolveScrap(comp, comp.operation);
        const nominal = round4(qtyLocal * comp.qty);
        const effective = round4(nominal * (1 + scrap));

        // Resolve sub-BOM by (sku, rev) if the row pins a rev, else active.
        let subBom = null;
        if (comp.subRev != null) {
          subBom = this.findBOM(comp.sku, comp.subRev);
        } else {
          subBom = this.getActiveBOMForSku(comp.sku, asOfDate);
        }
        const isPhantom = this.isPhantom(comp.sku);
        const isLeaf = !subBom && !isPhantom;

        lines.push({
          level,
          parentSku: currentBom.sku,
          sku: comp.sku,
          name_he: comp.name_he || (this.getItem(comp.sku) && this.getItem(comp.sku).name_he) || '',
          name_en: comp.name_en || (this.getItem(comp.sku) && this.getItem(comp.sku).name_en) || '',
          nominalQty: nominal,
          effectiveQty: effective,
          uom: comp.uom,
          scrap,
          operation: comp.operation,
          isOptional: comp.isOptional,
          path: [...stack, comp.sku],
          isLeaf,
          isPhantom,
          alternateGroup: comp.alternateGroup || null,
          effectivityFrom: comp.effectivityFrom || null,
          effectivityTo: comp.effectivityTo || null,
          bomId: subBom ? subBom.id : null,
          certRequired: comp.certRequired,
        });

        if (isPhantom && includePhantoms) {
          // Phantom: pass through, do NOT stock. Recurse if there's a BOM,
          // otherwise treat children as raw leaves with the phantom qty.
          if (subBom) {
            walk(subBom, effective, level + 1, [...stack, comp.sku]);
          }
          // No leaf accounting — phantoms are transparent.
        } else if (subBom) {
          walk(subBom, effective, level + 1, [...stack, comp.sku]);
        } else {
          if (!totalsByLeaf[comp.sku]) {
            totalsByLeaf[comp.sku] = { qty: 0, uom: comp.uom };
          }
          totalsByLeaf[comp.sku].qty = round4(totalsByLeaf[comp.sku].qty + effective);
        }
      }
    };

    walk(rootBom, parentQty, 1, [rootBom.sku]);

    return {
      parentSku: rootBom.sku,
      parentRev: rootBom.revision,
      parentQty,
      lines,
      totalsByLeaf,
      depth: maxReached,
    };
  }

  /**
   * Y-031 spec implode: reverse lookup — which BOMs use this child? Alias
   * of whereUsed() with both direct + transitive results in one shot.
   *
   * @param {string} childPart
   * @param {Object} [opts]   { transitive: false, includeObsolete: true }
   */
  implode(childPart, opts = {}) {
    if (!isStr(childPart)) throw new Error('implode: childPart is required');
    const includeTransitive = opts.transitive !== false; // default ON for implode
    const includeObsolete = opts.includeObsolete !== false;
    const result = this.whereUsed(childPart, { transitive: includeTransitive, includeObsolete });
    if (Array.isArray(result)) {
      return { childPart, direct: result, transitive: [] };
    }
    return { childPart, ...result };
  }

  // ────────────────────────────────────────────────────────────────
  // availabilityCheck — shortages report
  // ────────────────────────────────────────────────────────────────

  /**
   * Compare exploded raw-leaf demand against an inventory map and return
   * a shortages list (one row per leaf where on-hand < required).
   *
   * @param {string} partNumber
   * @param {string|null} rev    optional pinned revision
   * @param {number} qty
   * @param {Object} inventoryMap   { sku: numberOnHand, ... }
   * @returns {Object} {
   *   partNumber, rev, qty, ok,
   *   demand: [{sku, required, uom}],
   *   shortages: [{sku, required, onHand, short, uom}],
   *   surplus:   [{sku, required, onHand, surplus, uom}],
   * }
   */
  availabilityCheck(partNumber, rev = null, qty = 1, inventoryMap = {}) {
    if (!isStr(partNumber)) throw new Error('availabilityCheck: partNumber is required');
    if (!inventoryMap || typeof inventoryMap !== 'object') {
      throw new Error('availabilityCheck: inventoryMap must be an object');
    }
    const exploded = this.explode(partNumber, rev, qty);
    const demand = [];
    const shortages = [];
    const surplus = [];
    for (const [sku, info] of Object.entries(exploded.totalsByLeaf)) {
      const required = round4(info.qty);
      const onHand = Number(inventoryMap[sku] || 0);
      demand.push({ sku, required, uom: info.uom });
      if (onHand + 1e-9 < required) {
        shortages.push({
          sku,
          required,
          onHand: round4(onHand),
          short: round4(required - onHand),
          uom: info.uom,
        });
      } else {
        surplus.push({
          sku,
          required,
          onHand: round4(onHand),
          surplus: round4(onHand - required),
          uom: info.uom,
        });
      }
    }
    return {
      partNumber,
      rev: exploded.parentRev || null,
      qty,
      ok: shortages.length === 0,
      demand,
      shortages,
      surplus,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // ECO — engineering change order workflow (append-only)
  // ────────────────────────────────────────────────────────────────

  /**
   * File a new ECO request. The ECO is a proposal — it does NOT mutate
   * the BOM until it has been approved (engineering + quality + purchasing)
   * and applied via applyEco() or by referencing the ECO id when calling
   * defineBOM/createBOM for the new revision.
   *
   * @param {Object} eco
   * @param {string} eco.bomId         BOM being changed
   * @param {Array}  eco.changes       free-shape change descriptors (e.g.
   *                                    [{ op: 'sub', from: 'OLD', to: 'NEW' }])
   * @param {string} eco.requester
   * @param {string} eco.reason
   * @param {string} [eco.effectiveDate]
   * @returns {Object} stored ECO record
   */
  ecoRequest(eco = {}) {
    if (!eco || typeof eco !== 'object') {
      throw new Error('ecoRequest: eco object is required');
    }
    const { bomId, changes, requester, reason, effectiveDate = null } = eco;
    if (!isStr(bomId)) throw new Error('ecoRequest: bomId is required');
    if (!this._boms.has(bomId)) {
      throw new Error(`ecoRequest: bomId ${bomId} not found`);
    }
    if (!Array.isArray(changes) || changes.length === 0) {
      throw new Error('ecoRequest: changes must be a non-empty array');
    }
    if (!isStr(requester)) throw new Error('ecoRequest: requester is required');
    if (!isStr(reason)) throw new Error('ecoRequest: reason is required');

    const ecoId = nextId('ECO');
    const now = new Date().toISOString();
    const record = {
      id: ecoId,
      bomId,
      partNumber: this._boms.get(bomId).sku,
      changes: changes.map(c => ({ ...c })),
      requester,
      reason,
      effectiveDate: effectiveDate || now.slice(0, 10),
      status: ECO_STATUS.PENDING,
      approvals: [],     // append-only audit of approver actions
      requiredRoles: REQUIRED_ECO_ROLES.slice(),
      createdAt: now,
      updatedAt: now,
      history: [{ at: now, action: 'create', requester, status: ECO_STATUS.PENDING }],
    };
    this._ecos.set(ecoId, record);
    this._audit.push({ at: now, action: 'eco-request', ecoId, bomId, requester });
    return record;
  }

  /**
   * Apply approver decisions to an ECO. Each approver entry MUST include
   * `{ role, approver, decision?, comment? }`. Roles must come from
   * REQUIRED_ECO_ROLES. The ECO becomes APPROVED only when EVERY required
   * role has at least one approver with `decision !== 'reject'` (default
   * decision is 'approve').
   *
   * Append-only — re-calling approveEco simply pushes more rows; the
   * historical approval timeline is preserved.
   */
  approveEco(ecoId, approvers = []) {
    if (!isStr(ecoId)) throw new Error('approveEco: ecoId is required');
    const eco = this._ecos.get(ecoId);
    if (!eco) throw new Error(`approveEco: ecoId ${ecoId} not found`);
    if (!Array.isArray(approvers) || approvers.length === 0) {
      throw new Error('approveEco: approvers must be a non-empty array');
    }
    if (eco.status === ECO_STATUS.CANCELLED) {
      throw new Error(`approveEco: ECO ${ecoId} is cancelled`);
    }

    const now = new Date().toISOString();
    for (const a of approvers) {
      if (!a || typeof a !== 'object') {
        throw new Error('approveEco: approver must be an object');
      }
      const role = String(a.role || '').toLowerCase();
      if (!REQUIRED_ECO_ROLES.includes(role)) {
        throw new Error(
          `approveEco: unknown role "${a.role}" — must be one of ${REQUIRED_ECO_ROLES.join(', ')}`,
        );
      }
      if (!isStr(a.approver)) {
        throw new Error('approveEco: approver name is required');
      }
      const decision = a.decision === 'reject' ? 'reject' : 'approve';
      const entry = {
        role,
        approver: a.approver,
        decision,
        comment: a.comment || '',
        at: now,
      };
      eco.approvals.push(entry);
      eco.history.push({ at: now, action: `approval-${decision}`, role, approver: a.approver });
    }
    eco.updatedAt = now;

    // Reject wins immediately if any role has rejected.
    const rejected = eco.approvals.some(x => x.decision === 'reject');
    if (rejected) {
      eco.status = ECO_STATUS.REJECTED;
      eco.history.push({ at: now, action: 'status-change', from: ECO_STATUS.PENDING, to: ECO_STATUS.REJECTED });
      this._audit.push({ at: now, action: 'eco-rejected', ecoId });
      return eco;
    }

    // Otherwise, are all required roles covered with at least one approve?
    const approvedRoles = new Set(
      eco.approvals.filter(x => x.decision === 'approve').map(x => x.role),
    );
    const allCovered = REQUIRED_ECO_ROLES.every(r => approvedRoles.has(r));
    if (allCovered) {
      const prev = eco.status;
      eco.status = ECO_STATUS.APPROVED;
      eco.history.push({ at: now, action: 'status-change', from: prev, to: ECO_STATUS.APPROVED });
      this._audit.push({ at: now, action: 'eco-approved', ecoId });
    }
    return eco;
  }

  /** Mark an APPROVED ECO as EFFECTIVE — i.e. applied to the BOM tree. */
  markEcoEffective(ecoId) {
    const eco = this._ecos.get(ecoId);
    if (!eco) throw new Error(`markEcoEffective: ecoId ${ecoId} not found`);
    if (eco.status !== ECO_STATUS.APPROVED) {
      throw new Error(`markEcoEffective: ECO ${ecoId} must be APPROVED first (was ${eco.status})`);
    }
    const now = new Date().toISOString();
    eco.status = ECO_STATUS.EFFECTIVE;
    eco.history.push({ at: now, action: 'status-change', from: ECO_STATUS.APPROVED, to: ECO_STATUS.EFFECTIVE });
    eco.updatedAt = now;
    this._audit.push({ at: now, action: 'eco-effective', ecoId });
    return eco;
  }

  /** Cancel a PENDING ECO. The record stays in the store forever. */
  cancelEco(ecoId, reason = '') {
    const eco = this._ecos.get(ecoId);
    if (!eco) throw new Error(`cancelEco: ecoId ${ecoId} not found`);
    if (eco.status !== ECO_STATUS.PENDING) {
      throw new Error(`cancelEco: ECO ${ecoId} is not PENDING (was ${eco.status})`);
    }
    const now = new Date().toISOString();
    const prev = eco.status;
    eco.status = ECO_STATUS.CANCELLED;
    eco.updatedAt = now;
    eco.history.push({ at: now, action: 'status-change', from: prev, to: ECO_STATUS.CANCELLED, reason });
    this._audit.push({ at: now, action: 'eco-cancelled', ecoId, reason });
    return eco;
  }

  /** Look up an ECO by id. */
  getEco(ecoId) {
    return this._ecos.get(ecoId) || null;
  }

  /** List ECOs (optionally filtered by status / bomId). */
  listEcos({ status = null, bomId = null } = {}) {
    const out = [];
    for (const eco of this._ecos.values()) {
      if (status && eco.status !== status) continue;
      if (bomId && eco.bomId !== bomId) continue;
      out.push(eco);
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  // ────────────────────────────────────────────────────────────────
  // alternateGroup — substitutable components
  // ────────────────────────────────────────────────────────────────

  /**
   * List of substitutable components for a given alternateGroup tag on a
   * specific BOM (partNumber, rev). Returns every row whose
   * alternateGroup matches `group` plus their `alternatives` lists.
   *
   * @returns {Object} { group, members: [{ sku, qty, uom, alternatives, ... }] }
   */
  alternateGroup(partNumber, rev, group) {
    if (!isStr(partNumber)) throw new Error('alternateGroup: partNumber is required');
    if (!isStr(group)) throw new Error('alternateGroup: group is required');
    const bom = rev != null ? this.findBOM(partNumber, rev) : this.getActiveBOMForSku(partNumber);
    if (!bom) {
      throw new Error(`alternateGroup: ${partNumber}${rev != null ? ` rev ${rev}` : ''} not found`);
    }
    const members = [];
    for (const comp of bom.components) {
      if (comp.alternateGroup === group) {
        members.push({
          sku: comp.sku,
          qty: comp.qty,
          uom: comp.uom,
          alternateGroup: comp.alternateGroup,
          alternatives: comp.alternatives.slice(),
          isOptional: comp.isOptional,
          effectivityFrom: comp.effectivityFrom || null,
          effectivityTo: comp.effectivityTo || null,
        });
      }
    }
    return { partNumber, rev: bom.revision, group, members };
  }

  // ────────────────────────────────────────────────────────────────
  // phantomBOM — transparent pass-through (not stocked)
  // ────────────────────────────────────────────────────────────────

  /**
   * Mark `partNumber` as a phantom — transparent during explode (its
   * children are issued directly, the phantom itself is never stocked
   * nor purchased). Append-only registry; phantoms are NEVER removed.
   *
   * @returns {Object} phantom record
   */
  phantomBOM(partNumber, meta = {}) {
    if (!isStr(partNumber)) throw new Error('phantomBOM: partNumber is required');
    const existing = this._phantoms.get(partNumber);
    if (existing) {
      // Idempotent — refresh metadata but never delete the phantom marker.
      const updated = { ...existing, ...meta, updatedAt: new Date().toISOString() };
      this._phantoms.set(partNumber, updated);
      return updated;
    }
    const record = {
      partNumber,
      name_he: meta.name_he || '',
      name_en: meta.name_en || '',
      addedAt: new Date().toISOString(),
      flag: PHANTOM_FLAG,
    };
    this._phantoms.set(partNumber, record);
    this._audit.push({ at: record.addedAt, action: 'phantom-mark', partNumber });
    return record;
  }

  /** Is `partNumber` a phantom? */
  isPhantom(partNumber) {
    return this._phantoms.has(partNumber);
  }

  /** List all phantom parts. */
  listPhantoms() {
    return [...this._phantoms.values()];
  }

  // ────────────────────────────────────────────────────────────────
  // costedBOM — line-by-line extended cost
  // ────────────────────────────────────────────────────────────────

  /**
   * Y-031 spec costedBOM — produce a line list where every leaf gets an
   * `unitPrice` from priceMap and an `extCost` (= effectiveQty × unitPrice).
   * Falls back to item-master `standardCost` when priceMap entry is missing.
   * Phantoms appear in the line list but contribute zero ext cost.
   *
   * @param {string} partNumber
   * @param {string|null} rev
   * @param {Object} priceMap   { sku: number }
   * @returns {Object} { partNumber, rev, lines, totalCost, missingPrices }
   */
  costedBOM(partNumber, rev = null, priceMap = {}) {
    if (!isStr(partNumber)) throw new Error('costedBOM: partNumber is required');
    if (!priceMap || typeof priceMap !== 'object') {
      throw new Error('costedBOM: priceMap must be an object');
    }
    const exploded = this.explode(partNumber, rev, 1);
    const missingPrices = [];
    const lines = [];
    let totalCost = 0;

    for (const line of exploded.lines) {
      // Phantoms: emit a line for traceability but zero extCost.
      if (line.isPhantom) {
        lines.push({ ...line, unitPrice: 0, extCost: 0, isPhantom: true });
        continue;
      }
      // Sub-assembly rollup rows: also zero (their leaves carry the cost).
      if (!line.isLeaf) {
        lines.push({ ...line, unitPrice: 0, extCost: 0 });
        continue;
      }
      let unit = priceMap[line.sku];
      if (unit == null || !Number.isFinite(Number(unit))) {
        const item = this.getItem(line.sku);
        if (item && Number.isFinite(item.standardCost)) {
          unit = item.standardCost;
        } else {
          unit = null;
          missingPrices.push(line.sku);
        }
      }
      const ext = unit != null ? round2(line.effectiveQty * Number(unit)) : 0;
      if (unit != null) totalCost += ext;
      lines.push({
        ...line,
        unitPrice: unit != null ? Number(unit) : null,
        extCost: ext,
      });
    }
    return {
      partNumber,
      rev: exploded.parentRev || null,
      lines,
      totalCost: round2(totalCost),
      missingPrices,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Introspection helpers
  // ────────────────────────────────────────────────────────────────

  /** List all BOMs (optionally filtered). Preserves obsolete revisions. */
  listBOMs({ sku = null, status = null } = {}) {
    const out = [];
    for (const bom of this._boms.values()) {
      if (sku && bom.sku !== sku) continue;
      if (status && bom.status !== status) continue;
      out.push(bom);
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  /** Read-only copy of the internal audit trail. */
  getAuditTrail() {
    return this._audit.slice();
  }

  /** Total number of stored BOM records (all statuses, including obsolete). */
  size() {
    return this._boms.size;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  BOMManager,
  DEFAULT_SCRAP_RATES,
  UOMS,
  BOM_STATUS,
  LABELS,
  MAX_EXPLODE_DEPTH,
  // 2026-04 GROW exports (Y-031 spec):
  ECO_STATUS,
  REQUIRED_ECO_ROLES,
  ECO_ROLE_LABELS,
  PHANTOM_FLAG,
  // internals exposed for white-box testing
  _internals: {
    round4,
    round2,
    resolveScrap,
  },
};
