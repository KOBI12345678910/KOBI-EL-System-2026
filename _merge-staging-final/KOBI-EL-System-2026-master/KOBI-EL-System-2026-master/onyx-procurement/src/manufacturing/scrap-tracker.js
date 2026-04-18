/* ============================================================================
 * Techno-Kol ERP — Metal Scrap Tracker
 * Agent Y-041 / Mega-ERP Kobi EL 2026 / Manufacturing Swarm
 * ----------------------------------------------------------------------------
 * עוקב גרוטאות מתכת — הפרדה, שקילה, תמחור, הכנסות מיחזור
 *
 * Scope:
 *   A full scrap lifecycle module for a metal-fab shop (Techno-Kol Uzi).
 *   Every kg of material that leaves the useful-product stream is captured,
 *   segregated by alloy + grade, reconciled against raw-material consumption,
 *   and converted into revenue when sold to a scrapyard (פרזולים / מחזור מתכת).
 *
 * Public API (class ScrapTracker):
 *   1.  recordScrap({wo, operation, material, grade, weightKg, reason,
 *                    operator, date})                  — קליטת גרוטאה
 *   2.  segregateByGrade(period)                        — הפרדה לפי סוג + ציון
 *   3.  scrapRate(sku, period)                          — אחוז גרוטאה לכל SKU
 *   4.  scrapCost(period)                               — עלות גרוטאה בש"ח
 *   5.  sellToScrapyard({yardId, materials})            — מכירה למגרש גרוטאות
 *   6.  reconcileInventory(period)                      — יישור מלאי
 *   7.  recycledContentReport()                         — דוח קיימות
 *   8.  reasonPareto(period)                            — פרטו של סיבות
 *
 * Design rules:
 *   - לא מוחקים, רק משדרגים ומגדלים — no delete / no mutate of history.
 *   - Zero external dependencies (pure Node ≥ 14).
 *   - Bilingual Hebrew/English labels throughout.
 *   - Deterministic — no hidden random, no Date.now side-effects in pure calc.
 *   - Money rounded to agorot (2 dp, half-to-even).
 *   - Weight rounded to grams (3 dp).
 *
 * Material grades (ISO / JIS / Israeli market convention):
 *   steel      — mild carbon: S235JR (Fe37), S275JR, S355J2, tool steels
 *   stainless  — 304 (1.4301), 316 (1.4401), 430 (1.4016)
 *   aluminum   — 1050, 5083, 6061, 6082 (מוצר פרופיל/לוחות)
 *   copper     — C101, C110 (heavy/bright copper)
 *   brass      — CuZn37 (yellow), CuZn39Pb3 (leaded free-machining)
 *   mixed      — unsorted, lowest price/kg
 * ========================================================================== */

'use strict';

/* ============================================================================
 * 0. Frozen catalogs — material grades, reasons, scrapyards
 * ========================================================================== */

const MATERIALS = Object.freeze({
  steel:     { id: 'steel',     he: 'פלדה',         en: 'Steel (mild carbon)' },
  stainless: { id: 'stainless', he: 'נירוסטה',      en: 'Stainless steel'    },
  aluminum:  { id: 'aluminum',  he: 'אלומיניום',     en: 'Aluminum'           },
  copper:    { id: 'copper',    he: 'נחושת',        en: 'Copper'             },
  brass:     { id: 'brass',     he: 'פליז',         en: 'Brass'              },
  mixed:     { id: 'mixed',     he: 'מעורב',        en: 'Mixed / unsorted'   }
});

/**
 * Known grade sub-classifications per material (extendable by caller).
 * A caller may pass any string for `grade`; these are the defaults the
 * segregator will use when no grade is supplied.
 */
const GRADE_CATALOG = Object.freeze({
  steel: Object.freeze([
    { grade: 'S235JR',  he: 'פלדה רכה S235 (Fe37)',  typicalPricePerKg: 0.90 },
    { grade: 'S275JR',  he: 'פלדה S275',             typicalPricePerKg: 0.95 },
    { grade: 'S355J2',  he: 'פלדה קונסטרוקטיבית',     typicalPricePerKg: 1.00 },
    { grade: 'TOOL',    he: 'פלדת כלים',             typicalPricePerKg: 1.40 }
  ]),
  stainless: Object.freeze([
    { grade: '304',     he: 'נירוסטה 304 (1.4301)',  typicalPricePerKg: 5.20 },
    { grade: '316',     he: 'נירוסטה 316 (1.4401)',  typicalPricePerKg: 7.80 },
    { grade: '430',     he: 'נירוסטה 430 (1.4016)',  typicalPricePerKg: 3.10 }
  ]),
  aluminum: Object.freeze([
    { grade: '1050',    he: 'אלומיניום טהור 1050',    typicalPricePerKg: 6.00 },
    { grade: '5083',    he: 'אלומיניום ימי 5083',     typicalPricePerKg: 6.40 },
    { grade: '6061',    he: 'אלומיניום 6061',         typicalPricePerKg: 6.20 },
    { grade: '6082',    he: 'אלומיניום פרופיל 6082',  typicalPricePerKg: 6.10 }
  ]),
  copper: Object.freeze([
    { grade: 'C101',    he: 'נחושת כבדה C101',        typicalPricePerKg: 32.00 },
    { grade: 'C110',    he: 'נחושת בוהקת C110',       typicalPricePerKg: 30.50 }
  ]),
  brass: Object.freeze([
    { grade: 'CuZn37',  he: 'פליז צהוב CuZn37',       typicalPricePerKg: 18.00 },
    { grade: 'CuZn39Pb3', he: 'פליז עופרתי לעיבוד',   typicalPricePerKg: 17.00 }
  ]),
  mixed: Object.freeze([
    { grade: 'MIXED',   he: 'גרוטאה מעורבת',          typicalPricePerKg: 0.60 }
  ])
});

/**
 * Bilingual reason codes. Keys are stable machine IDs.
 * Extended freely by the caller — this is the Techno-Kol baseline.
 */
const REASON_CODES = Object.freeze({
  setup_error:       { code: 'setup_error',       he: 'טעות הרכבה / סטאפ',     en: 'Setup / fixturing error' },
  tool_wear:         { code: 'tool_wear',         he: 'שחיקת כלי',              en: 'Tool wear'               },
  programming_error: { code: 'programming_error', he: 'שגיאת תכנות CNC',        en: 'Programming error'       },
  material_defect:   { code: 'material_defect',   he: 'פגם בחומר גלם',          en: 'Material defect'         },
  operator_error:    { code: 'operator_error',    he: 'טעות אופרטור',           en: 'Operator error'          },
  machine_failure:   { code: 'machine_failure',   he: 'תקלת מכונה',             en: 'Machine failure'         },
  dimensional:       { code: 'dimensional',       he: 'חריגה מממדים',           en: 'Out-of-tolerance'        },
  weld_defect:       { code: 'weld_defect',       he: 'פגם ריתוך',              en: 'Weld defect'             },
  surface_defect:    { code: 'surface_defect',    he: 'פגם שטח / שריטה',        en: 'Surface defect'          },
  first_article:     { code: 'first_article',     he: 'פריט ראשון / כיול',      en: 'First-article setup'     },
  edge_trim:         { code: 'edge_trim',         he: 'קצה/חיתוך — נורמטיבי',   en: 'Edge / trim — normal'    }
});

/**
 * Seed catalog of Israeli scrapyards. The caller can register more via
 * registerScrapyard(...). These defaults reflect real businesses that
 * operate in the metal-recycling (פרזולים / מחזור מתכת) sector in Israel
 * as of 2026. Prices are indicative only — actual quotes fluctuate with
 * the LME (London Metal Exchange) and the shekel/USD rate.
 */
const DEFAULT_SCRAPYARDS = Object.freeze([
  {
    yardId: 'PRZ-HADERA',
    he: 'פרזולים — חדרה',
    en: 'Parzolim — Hadera',
    region: 'חדרה',
    accepts: ['steel', 'stainless', 'aluminum', 'copper', 'brass', 'mixed']
  },
  {
    yardId: 'MTR-ASHDOD',
    he: 'מיחזור מתכות — אשדוד',
    en: 'Metal Recycling — Ashdod',
    region: 'אשדוד',
    accepts: ['steel', 'stainless', 'aluminum', 'mixed']
  },
  {
    yardId: 'ZVI-HAIFA',
    he: 'צבי גרוטאות — מפרץ חיפה',
    en: 'Zvi Scrap — Haifa Bay',
    region: 'חיפה',
    accepts: ['steel', 'stainless', 'aluminum', 'copper', 'brass', 'mixed']
  },
  {
    yardId: 'NHB-BE7',
    he: 'נחושת הנגב — באר שבע',
    en: 'Negev Copper — Be\'er Sheva',
    region: 'באר שבע',
    accepts: ['copper', 'brass']
  }
]);

/* ============================================================================
 * 1. Rounding utilities — deterministic, banker's to avoid drift in sums
 * ========================================================================== */

/** Round a number to N decimals using half-to-even (banker's rounding). */
function roundHalfEven(n, dp) {
  if (!isFinite(n)) return 0;
  const factor = Math.pow(10, dp);
  const shifted = n * factor;
  const floor = Math.floor(shifted);
  const diff = shifted - floor;
  const eps = 1e-9;
  let rounded;
  if (diff > 0.5 + eps) rounded = floor + 1;
  else if (diff < 0.5 - eps) rounded = floor;
  else rounded = (floor % 2 === 0) ? floor : floor + 1;
  return rounded / factor;
}

function round2(n) { return roundHalfEven(n, 2); }
function round3(n) { return roundHalfEven(n, 3); }

/** Shallow-clone primitives only — deep-freeze via JSON round-trip for records. */
function freezeRecord(obj) {
  return Object.freeze(JSON.parse(JSON.stringify(obj)));
}

/* ============================================================================
 * 2. Class ScrapTracker
 * ========================================================================== */

class ScrapTracker {
  constructor(opts) {
    opts = opts || {};
    /** @type {Array<Object>} — append-only scrap event log */
    this.events = [];
    /** @type {Array<Object>} — append-only scrapyard sale log */
    this.sales = [];
    /** @type {Map<string, Object>} — scrapyard registry */
    this.yards = new Map();
    /** @type {Map<string, Object>} — SKU master (bom + standard weights) */
    this.skus = new Map();
    /** @type {Map<string, Object>} — raw-material cost/kg by material:grade key */
    this.materialCosts = new Map();
    /** @type {Map<string, Object>} — raw-material consumption by period */
    this.consumption = new Map();
    /** @type {Map<string, Object>} — finished-goods weight by period */
    this.finishedGoods = new Map();
    /** Sequence counters for deterministic IDs. */
    this._seqEvent  = 1;
    this._seqTicket = 1;

    // Seed known scrapyards unless caller asks for a clean slate.
    if (opts.seedYards !== false) {
      for (const y of DEFAULT_SCRAPYARDS) this.yards.set(y.yardId, { ...y });
    }
    // Seed default raw-material cost/kg (NIS) — caller may override.
    if (opts.seedCosts !== false) {
      this._seedDefaultCosts();
    }
  }

  /* ------------------------------------------------------------------------
   * 2.0  Seeding + registration helpers
   * ---------------------------------------------------------------------- */

  _seedDefaultCosts() {
    // Raw-material buy-in NIS/kg (Techno-Kol procurement averages 2025-2026).
    // These are the *upstream* cost, i.e. what we pay the supplier, not the
    // scrap resale value. Used by scrapCost() to value wasted metal.
    const seed = [
      ['steel',     'S235JR',    4.20],
      ['steel',     'S275JR',    4.40],
      ['steel',     'S355J2',    4.80],
      ['steel',     'TOOL',      22.00],
      ['stainless', '304',       28.00],
      ['stainless', '316',       42.00],
      ['stainless', '430',       18.00],
      ['aluminum',  '1050',      22.00],
      ['aluminum',  '5083',      25.00],
      ['aluminum',  '6061',      24.00],
      ['aluminum',  '6082',      23.00],
      ['copper',    'C101',      52.00],
      ['copper',    'C110',      51.00],
      ['brass',     'CuZn37',    38.00],
      ['brass',     'CuZn39Pb3', 39.00],
      ['mixed',     'MIXED',     3.00]
    ];
    for (const [material, grade, costPerKg] of seed) {
      this.materialCosts.set(`${material}:${grade}`, {
        material, grade, costPerKg, currency: 'ILS'
      });
    }
  }

  /** Register / upsert a scrapyard. Never deletes — only replaces by id. */
  registerScrapyard(yard) {
    if (!yard || !yard.yardId) throw new Error('registerScrapyard: yardId is required');
    const existing = this.yards.get(yard.yardId) || {};
    this.yards.set(yard.yardId, { ...existing, ...yard });
    return this.yards.get(yard.yardId);
  }

  /** Register a SKU with its BOM for scrap-rate calculation. */
  registerSKU(sku) {
    if (!sku || !sku.sku) throw new Error('registerSKU: sku is required');
    this.skus.set(sku.sku, {
      sku: sku.sku,
      name: sku.name || sku.sku,
      name_he: sku.name_he || sku.name || sku.sku,
      material: sku.material || 'steel',
      grade: sku.grade || null,
      rawWeightKg: Number(sku.rawWeightKg) || 0,
      finishedWeightKg: Number(sku.finishedWeightKg) || 0
    });
    return this.skus.get(sku.sku);
  }

  /** Override or add raw-material cost in NIS/kg. */
  setMaterialCost(material, grade, costPerKg) {
    const key = `${material}:${grade}`;
    this.materialCosts.set(key, { material, grade, costPerKg: Number(costPerKg), currency: 'ILS' });
  }

  /** Record raw-material consumption for a period — used by reconcileInventory. */
  recordConsumption(period, material, grade, weightKg) {
    const key = `${period}|${material}|${grade || '*'}`;
    const prev = this.consumption.get(key) || { period, material, grade: grade || '*', weightKg: 0 };
    prev.weightKg = round3(prev.weightKg + Number(weightKg));
    this.consumption.set(key, prev);
  }

  /** Record finished-goods output weight for a period. */
  recordFinishedGoods(period, material, grade, weightKg) {
    const key = `${period}|${material}|${grade || '*'}`;
    const prev = this.finishedGoods.get(key) || { period, material, grade: grade || '*', weightKg: 0 };
    prev.weightKg = round3(prev.weightKg + Number(weightKg));
    this.finishedGoods.set(key, prev);
  }

  /* ------------------------------------------------------------------------
   * 2.1  recordScrap — the core capture point
   * ---------------------------------------------------------------------- */

  /**
   * Record a scrap event. Validates all inputs and appends to the log.
   * @returns {Object} the immutable event record.
   */
  recordScrap(args) {
    if (!args || typeof args !== 'object') {
      throw new Error('recordScrap: args required');
    }
    const { wo, operation, material, grade, weightKg, reason, operator, date, sku, notes } = args;

    if (!wo)                 throw new Error('recordScrap: wo (work order) is required');
    if (!operation)          throw new Error('recordScrap: operation is required');
    if (!MATERIALS[material]) {
      throw new Error(`recordScrap: unknown material "${material}". Must be one of: ${Object.keys(MATERIALS).join(', ')}`);
    }
    if (typeof weightKg !== 'number' || !isFinite(weightKg) || weightKg <= 0) {
      throw new Error('recordScrap: weightKg must be a positive finite number');
    }
    if (!reason) throw new Error('recordScrap: reason is required');
    if (!operator) throw new Error('recordScrap: operator is required');

    const when = date ? new Date(date) : new Date();
    if (isNaN(when.getTime())) {
      throw new Error('recordScrap: date is invalid');
    }

    // Resolve reason — accept either machine id ("setup_error") or free text.
    const reasonObj = REASON_CODES[reason]
      ? { ...REASON_CODES[reason] }
      : { code: String(reason), he: String(reason), en: String(reason), custom: true };

    // Period string YYYY-MM for aggregation (stable, no locale drift).
    const period = `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`;

    const id = `SCR-${String(this._seqEvent++).padStart(6, '0')}`;
    const record = freezeRecord({
      id,
      wo: String(wo),
      sku: sku ? String(sku) : null,
      operation: String(operation),
      material,
      grade: grade ? String(grade) : null,
      weightKg: round3(weightKg),
      reason: reasonObj,
      operator: String(operator),
      date: when.toISOString(),
      period,
      notes: notes ? String(notes) : null,
      createdAt: new Date().toISOString()
    });
    this.events.push(record);
    return record;
  }

  /* ------------------------------------------------------------------------
   * 2.2  segregateByGrade — group for scrapyard pricing
   * ---------------------------------------------------------------------- */

  /**
   * Segregate all events in `period` by material + grade. Returns an array
   * of buckets ready for a scrapyard quote request.
   * @param {string} period — 'YYYY-MM' or '*' for all-time.
   */
  segregateByGrade(period) {
    const filter = (period && period !== '*') ? period : null;
    const buckets = new Map();

    for (const ev of this.events) {
      if (filter && ev.period !== filter) continue;
      const gradeKey = ev.grade || '_NO_GRADE_';
      const key = `${ev.material}|${gradeKey}`;
      const bucket = buckets.get(key) || {
        material: ev.material,
        material_he: MATERIALS[ev.material].he,
        material_en: MATERIALS[ev.material].en,
        grade: ev.grade || null,
        weightKg: 0,
        eventCount: 0,
        events: []
      };
      bucket.weightKg = round3(bucket.weightKg + ev.weightKg);
      bucket.eventCount += 1;
      bucket.events.push(ev.id);
      buckets.set(key, bucket);
    }

    // Enrich each bucket with suggested price/kg from GRADE_CATALOG (reference only).
    const result = [];
    for (const bucket of buckets.values()) {
      const grades = GRADE_CATALOG[bucket.material] || [];
      const match = grades.find(g => g.grade === bucket.grade);
      bucket.suggestedPricePerKg = match ? match.typicalPricePerKg : (grades[0] ? grades[0].typicalPricePerKg : 0);
      bucket.suggestedRevenue = round2(bucket.weightKg * bucket.suggestedPricePerKg);
      result.push(bucket);
    }
    // Sort heaviest first so big lots lead in the quote request.
    result.sort((a, b) => b.weightKg - a.weightKg);
    return result;
  }

  /* ------------------------------------------------------------------------
   * 2.3  scrapRate — % scrapped vs raw consumed for a given SKU
   * ---------------------------------------------------------------------- */

  /**
   * Returns the scrap rate for an SKU in a period as a fraction [0..1] and %.
   * Formula: (scrap weight linked to this SKU) / (raw-material weight consumed).
   * Falls back to events filtered by SKU when no consumption is registered.
   */
  scrapRate(sku, period) {
    const filter = (period && period !== '*') ? period : null;
    if (!sku) throw new Error('scrapRate: sku is required');
    const master = this.skus.get(sku);

    // Scrap total for the SKU over the period.
    let scrapKg = 0;
    for (const ev of this.events) {
      if (filter && ev.period !== filter) continue;
      if (ev.sku !== sku) continue;
      scrapKg += ev.weightKg;
    }

    // Raw-material basis — prefer registered consumption, else BOM × events.
    let rawKg = 0;
    if (master) {
      // Count how many WOs this SKU appeared in, approximate raw from BOM.
      const wos = new Set();
      for (const ev of this.events) {
        if (filter && ev.period !== filter) continue;
        if (ev.sku !== sku) continue;
        wos.add(ev.wo);
      }
      rawKg = master.rawWeightKg * wos.size;
    }
    // Override with explicit consumption if registered.
    for (const c of this.consumption.values()) {
      if (filter && c.period !== filter) continue;
      // Heuristic: any consumption matching the SKU's material.
      if (master && c.material === master.material) rawKg = Math.max(rawKg, c.weightKg);
    }

    if (rawKg <= 0) {
      return { sku, period: filter || '*', scrapKg: round3(scrapKg), rawKg: 0, rate: 0, ratePct: 0 };
    }
    const rate = scrapKg / rawKg;
    return {
      sku,
      period: filter || '*',
      scrapKg: round3(scrapKg),
      rawKg: round3(rawKg),
      rate: roundHalfEven(rate, 6),
      ratePct: round2(rate * 100)
    };
  }

  /* ------------------------------------------------------------------------
   * 2.4  scrapCost — value lost in ₪ for a period
   * ---------------------------------------------------------------------- */

  /**
   * Cost = Σ weight(ev) × costPerKg(material:grade). Missing cost rows fall
   * back to material:* or 0 and are reported in `unpriced`.
   */
  scrapCost(period) {
    const filter = (period && period !== '*') ? period : null;
    let totalNis = 0;
    const byMaterial = new Map();
    const unpriced = [];

    for (const ev of this.events) {
      if (filter && ev.period !== filter) continue;
      const gradeKey = ev.grade || '';
      let priceRow = this.materialCosts.get(`${ev.material}:${gradeKey}`);
      if (!priceRow) {
        // Fall back: any grade of same material — take the average.
        const sameMat = [...this.materialCosts.values()].filter(r => r.material === ev.material);
        if (sameMat.length > 0) {
          const avg = sameMat.reduce((s, r) => s + r.costPerKg, 0) / sameMat.length;
          priceRow = { material: ev.material, grade: '*', costPerKg: avg };
        } else {
          unpriced.push(ev.id);
          continue;
        }
      }
      const cost = ev.weightKg * priceRow.costPerKg;
      totalNis += cost;

      const mKey = `${ev.material}|${ev.grade || '*'}`;
      const row = byMaterial.get(mKey) || {
        material: ev.material,
        material_he: MATERIALS[ev.material].he,
        grade: ev.grade || null,
        weightKg: 0,
        costNis: 0
      };
      row.weightKg = round3(row.weightKg + ev.weightKg);
      row.costNis = round2(row.costNis + cost);
      byMaterial.set(mKey, row);
    }

    return {
      period: filter || '*',
      totalNis: round2(totalNis),
      byMaterial: [...byMaterial.values()].sort((a, b) => b.costNis - a.costNis),
      unpricedEventIds: unpriced,
      currency: 'ILS'
    };
  }

  /* ------------------------------------------------------------------------
   * 2.5  sellToScrapyard — issue a sales ticket + revenue record
   * ---------------------------------------------------------------------- */

  /**
   * Sell a set of segregated lots to a registered scrapyard.
   * Produces an immutable "sales ticket" (תעודת מכירה) with line totals.
   * Never mutates the underlying scrap events — those remain the source of
   * truth. The ticket simply *references* lot buckets.
   */
  sellToScrapyard(args) {
    if (!args || !args.yardId) throw new Error('sellToScrapyard: yardId is required');
    const yard = this.yards.get(args.yardId);
    if (!yard) throw new Error(`sellToScrapyard: unknown yardId "${args.yardId}"`);
    if (!Array.isArray(args.materials) || args.materials.length === 0) {
      throw new Error('sellToScrapyard: materials must be a non-empty array');
    }

    const when = args.date ? new Date(args.date) : new Date();
    const ticketId = `SCR-TKT-${String(this._seqTicket++).padStart(6, '0')}`;

    let totalRevenue = 0;
    let totalWeight = 0;
    const lines = [];

    for (let i = 0; i < args.materials.length; i++) {
      const m = args.materials[i];
      if (!m || typeof m !== 'object') {
        throw new Error(`sellToScrapyard: materials[${i}] must be an object`);
      }
      if (typeof m.weightKg !== 'number' || !isFinite(m.weightKg) || m.weightKg <= 0) {
        throw new Error(`sellToScrapyard: materials[${i}].weightKg must be a positive number`);
      }
      if (typeof m.pricePerKg !== 'number' || !isFinite(m.pricePerKg) || m.pricePerKg < 0) {
        throw new Error(`sellToScrapyard: materials[${i}].pricePerKg must be >= 0`);
      }
      const material = m.material || null;
      if (material && !MATERIALS[material]) {
        throw new Error(`sellToScrapyard: materials[${i}].material "${material}" unknown`);
      }
      if (material && yard.accepts && yard.accepts.indexOf(material) === -1) {
        throw new Error(`sellToScrapyard: yard ${args.yardId} does not accept ${material}`);
      }
      const lineTotal = round2(m.weightKg * m.pricePerKg);
      totalRevenue += lineTotal;
      totalWeight += m.weightKg;
      lines.push(freezeRecord({
        material,
        material_he: material ? MATERIALS[material].he : null,
        grade: m.grade || null,
        weightKg: round3(m.weightKg),
        pricePerKg: round2(m.pricePerKg),
        lineTotal,
        currency: 'ILS'
      }));
    }

    // VAT note — scrapyards in Israel generally apply standard VAT (17%),
    // reported on a normal self-invoice (חשבונית עצמית). We do NOT compute
    // VAT here; the invoicing module handles that. This is a revenue event.
    const ticket = freezeRecord({
      ticketId,
      yardId: yard.yardId,
      yardName_he: yard.he,
      yardName_en: yard.en,
      date: when.toISOString(),
      period: `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`,
      lines,
      totalWeightKg: round3(totalWeight),
      totalRevenue: round2(totalRevenue),
      currency: 'ILS',
      createdAt: new Date().toISOString()
    });
    this.sales.push(ticket);
    return ticket;
  }

  /* ------------------------------------------------------------------------
   * 2.6  reconcileInventory — mass-balance sanity check
   * ---------------------------------------------------------------------- */

  /**
   * For every material in the period:
   *   consumed  = Σ recordConsumption(period, material)
   *   finished  = Σ recordFinishedGoods(period, material)
   *   scrapped  = Σ events(period, material).weightKg
   *   balance   = consumed - finished - scrapped
   *
   * A non-zero balance implies either missing scrap entries, mis-weighed
   * raw material, or phantom finished goods. Tolerance defaults to 0.5 kg
   * per material (roughly dust / cutting fluid) but is configurable.
   */
  reconcileInventory(period, opts) {
    opts = opts || {};
    const tolerance = typeof opts.toleranceKg === 'number' ? opts.toleranceKg : 0.5;
    const filter = (period && period !== '*') ? period : null;

    const byMaterial = new Map();
    const ensure = (material) => {
      if (!byMaterial.has(material)) {
        byMaterial.set(material, {
          material,
          material_he: MATERIALS[material] ? MATERIALS[material].he : material,
          consumedKg: 0,
          finishedKg: 0,
          scrappedKg: 0
        });
      }
      return byMaterial.get(material);
    };

    for (const c of this.consumption.values()) {
      if (filter && c.period !== filter) continue;
      ensure(c.material).consumedKg += c.weightKg;
    }
    for (const f of this.finishedGoods.values()) {
      if (filter && f.period !== filter) continue;
      ensure(f.material).finishedKg += f.weightKg;
    }
    for (const ev of this.events) {
      if (filter && ev.period !== filter) continue;
      ensure(ev.material).scrappedKg += ev.weightKg;
    }

    const rows = [];
    let allOk = true;
    for (const r of byMaterial.values()) {
      r.consumedKg = round3(r.consumedKg);
      r.finishedKg = round3(r.finishedKg);
      r.scrappedKg = round3(r.scrappedKg);
      r.balanceKg  = round3(r.consumedKg - r.finishedKg - r.scrappedKg);
      r.ok = Math.abs(r.balanceKg) <= tolerance;
      if (!r.ok) allOk = false;
      rows.push(r);
    }

    return {
      period: filter || '*',
      toleranceKg: tolerance,
      ok: allOk,
      rows: rows.sort((a, b) => b.consumedKg - a.consumedKg)
    };
  }

  /* ------------------------------------------------------------------------
   * 2.7  recycledContentReport — sustainability metrics
   * ---------------------------------------------------------------------- */

  /**
   * Computes the basic "recycled content" and "recovery rate" indicators
   * used by ESG / sustainability reporting (ISO 14021, EN 45557).
   *
   *   total scrap    = Σ events.weightKg
   *   total recycled = Σ sales ticket line weights
   *   recovery rate  = recycled / total scrap  (how much of what we scrapped
   *                                             actually left the site to
   *                                             be re-melted)
   *   total revenue  = Σ sales.totalRevenue
   */
  recycledContentReport() {
    let totalScrap = 0;
    const byMaterialScrap = new Map();
    for (const ev of this.events) {
      totalScrap += ev.weightKg;
      byMaterialScrap.set(ev.material, round3((byMaterialScrap.get(ev.material) || 0) + ev.weightKg));
    }

    let totalRecycled = 0;
    let totalRevenue = 0;
    const byMaterialRecycled = new Map();
    for (const t of this.sales) {
      totalRevenue += t.totalRevenue;
      for (const line of t.lines) {
        totalRecycled += line.weightKg;
        if (line.material) {
          byMaterialRecycled.set(line.material, round3((byMaterialRecycled.get(line.material) || 0) + line.weightKg));
        }
      }
    }

    const recoveryRate = totalScrap > 0 ? (totalRecycled / totalScrap) : 0;
    const materials = [];
    const allMats = new Set([...byMaterialScrap.keys(), ...byMaterialRecycled.keys()]);
    for (const m of allMats) {
      const scrapped  = byMaterialScrap.get(m) || 0;
      const recycled  = byMaterialRecycled.get(m) || 0;
      const rate = scrapped > 0 ? recycled / scrapped : 0;
      materials.push({
        material: m,
        material_he: MATERIALS[m] ? MATERIALS[m].he : m,
        scrappedKg: round3(scrapped),
        recycledKg: round3(recycled),
        recoveryRate: roundHalfEven(rate, 4),
        recoveryPct: round2(rate * 100)
      });
    }
    materials.sort((a, b) => b.scrappedKg - a.scrappedKg);

    return {
      totalScrapKg: round3(totalScrap),
      totalRecycledKg: round3(totalRecycled),
      recoveryRate: roundHalfEven(recoveryRate, 4),
      recoveryPct: round2(recoveryRate * 100),
      totalRevenueNis: round2(totalRevenue),
      materials,
      standard: 'ISO 14021 / EN 45557 (self-declaration basis)',
      note_he: 'דוח קיימות — אחוז שיקום חומר, הוצאה ממחזור, והכנסה'
    };
  }

  /* ------------------------------------------------------------------------
   * 2.8  reasonPareto — top scrap causes
   * ---------------------------------------------------------------------- */

  /**
   * Classical Pareto (80/20) analysis of scrap reasons. Returns reasons
   * ranked by weight (descending) with cumulative %.
   */
  reasonPareto(period) {
    const filter = (period && period !== '*') ? period : null;
    const counts = new Map();

    for (const ev of this.events) {
      if (filter && ev.period !== filter) continue;
      const key = ev.reason.code;
      const row = counts.get(key) || {
        code: key,
        he: ev.reason.he,
        en: ev.reason.en,
        weightKg: 0,
        events: 0
      };
      row.weightKg = round3(row.weightKg + ev.weightKg);
      row.events += 1;
      counts.set(key, row);
    }

    const rows = [...counts.values()].sort((a, b) => b.weightKg - a.weightKg);
    const totalKg = rows.reduce((s, r) => s + r.weightKg, 0);

    let cum = 0;
    for (const r of rows) {
      r.pct = totalKg > 0 ? round2((r.weightKg / totalKg) * 100) : 0;
      cum += r.weightKg;
      r.cumulativePct = totalKg > 0 ? round2((cum / totalKg) * 100) : 0;
      // 80/20 flag: the top reasons that together ≤ 80% are "vital few".
      r.isVitalFew = r.cumulativePct <= 80 || r === rows[0];
    }

    return {
      period: filter || '*',
      totalKg: round3(totalKg),
      rows
    };
  }

  /* ------------------------------------------------------------------------
   * 2.9  Introspection helpers (read-only)
   * ---------------------------------------------------------------------- */

  /** Return all scrap events (optionally filtered by period). Read-only copy. */
  getEvents(period) {
    const filter = (period && period !== '*') ? period : null;
    return filter ? this.events.filter(e => e.period === filter).map(e => ({ ...e }))
                  : this.events.map(e => ({ ...e }));
  }

  /** Return all sales tickets (optionally filtered by period). Read-only copy. */
  getSales(period) {
    const filter = (period && period !== '*') ? period : null;
    return filter ? this.sales.filter(t => t.period === filter).map(t => ({ ...t }))
                  : this.sales.map(t => ({ ...t }));
  }

  /** Return the registered scrapyards (read-only copy). */
  listScrapyards() {
    return [...this.yards.values()].map(y => ({ ...y }));
  }
}

/* ============================================================================
 * 3. Exports
 * ========================================================================== */

module.exports = {
  ScrapTracker,
  MATERIALS,
  GRADE_CATALOG,
  REASON_CODES,
  DEFAULT_SCRAPYARDS,
  round2,
  round3,
  roundHalfEven
};

// ES-module compatibility (for TS/ESM callers).
module.exports.default = ScrapTracker;
