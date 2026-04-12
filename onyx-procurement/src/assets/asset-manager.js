/**
 * Fixed Asset Management & Depreciation Engine
 * ניהול רכוש קבוע ופחת — Techno-Kol Uzi mega-ERP
 *
 * Agent: X-34  |  Swarm: 3B
 *
 * Compliance:
 *   - תקנות מס הכנסה (פחת), תשל"א-1941
 *     (Income Tax Regulations — Depreciation, 1941 and subsequent amendments)
 *   - IAS 16 — Property, Plant & Equipment (revaluation model)
 *   - IAS 36 — Impairment of Assets (recoverable amount test)
 *   - IFRS 5 — Disposal / classification as held for sale
 *
 * Design principles:
 *   - Zero external dependencies (pure Node / pure JS)
 *   - Never deletes data — all state changes are append-only transactions
 *   - Hebrew / English bilingual labels on every category and transaction
 *   - Real math — no shortcuts, no rounding that loses cents
 *   - Deterministic: identical inputs produce identical outputs
 *
 * Exports (public API):
 *   addAsset(fields)                       → id
 *   runDepreciation(asOf, [opts])          → entries[]
 *   dispose(assetId, saleAmount, date)     → { gain_loss, journal }
 *   transfer(assetId, newLocation, custodian) → void
 *   forecast(assetId, years)               → yearly projection
 *   impairmentTest(assetId, recoverable)   → adjustment
 *   auditReport()                          → unreconciled items
 *   categorySummary()                      → totals per category
 *
 * Run with Node >= 18. No npm install required.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// 1. ISRAELI DEPRECIATION RATE CATALOG
// Source: תקנות מס הכנסה (פחת) — לוח א' (schedule A) of Israeli Tax Auth.
// Rates are annual straight-line % applied to original cost (or adjusted
// cost after revaluation). Ranges are given where the law permits either
// normal or accelerated depreciation for specific sub-classes.
// ═══════════════════════════════════════════════════════════════════════

const CATEGORY_RATES = Object.freeze({
  // Buildings — מבנים
  BUILDING_RESIDENTIAL: {
    he: 'מבנה מגורים',
    en: 'Residential building',
    rate: 0.04,            // 4% — standard non-industrial
    useful_life: 25,
    accelerated: false,
  },
  BUILDING_OFFICE: {
    he: 'מבנה משרדים',
    en: 'Office building',
    rate: 0.04,            // 4%
    useful_life: 25,
    accelerated: false,
  },
  BUILDING_INDUSTRIAL: {
    he: 'מבנה תעשייתי',
    en: 'Industrial building',
    rate: 0.08,            // 8% — accelerated (industrial track)
    useful_life: 12.5,
    accelerated: true,
  },

  // Machinery & equipment — מכונות וציוד
  MACHINERY_GENERAL: {
    he: 'מכונות וציוד כללי',
    en: 'General machinery',
    rate: 0.15,            // 15% — baseline plant
    useful_life: 6.67,
    accelerated: false,
  },
  HEAVY_EQUIPMENT: {
    he: 'ציוד כבד',
    en: 'Heavy equipment',
    rate: 0.20,            // 20% — bulldozers, cranes, earth-movers
    useful_life: 5,
    accelerated: false,
  },

  // IT — טכנולוגיית מידע
  COMPUTERS: {
    he: 'מחשבים וציוד היקפי',
    en: 'Computers & peripherals',
    rate: 0.33,            // 33% — 3 year full write-off
    useful_life: 3,
    accelerated: false,
  },
  MOBILE_PHONES: {
    he: 'טלפונים סלולריים',
    en: 'Mobile phones',
    rate: 0.50,            // 50% — 2 year full write-off
    useful_life: 2,
    accelerated: false,
  },
  SOFTWARE: {
    he: 'תוכנה',
    en: 'Software licenses',
    rate: 0.33,            // 33% — matches תקנות for purchased software
    useful_life: 3,
    accelerated: false,
  },

  // Vehicles — כלי רכב
  VEHICLE_PRIVATE: {
    he: 'רכב פרטי',
    en: 'Private vehicle',
    rate: 0.15,            // 15%
    useful_life: 6.67,
    accelerated: false,
  },
  VEHICLE_TRUCK: {
    he: 'משאית',
    en: 'Truck',
    rate: 0.20,            // 20%
    useful_life: 5,
    accelerated: false,
  },

  // Office furniture — ריהוט משרדי
  FURNITURE_STANDARD: {
    he: 'ריהוט משרדי',
    en: 'Office furniture',
    rate: 0.06,            // 6% — default lower bound
    useful_life: 16.67,
    accelerated: false,
  },
  FURNITURE_ACCELERATED: {
    he: 'ריהוט משרדי (מואץ)',
    en: 'Office furniture (accelerated)',
    rate: 0.15,            // 15% — upper bound where heavy wear applies
    useful_life: 6.67,
    accelerated: true,
  },

  // Tools — כלי עבודה
  TOOLS: {
    he: 'כלי עבודה',
    en: 'Hand & power tools',
    rate: 0.25,            // 25%
    useful_life: 4,
    accelerated: false,
  },
});

// ═══════════════════════════════════════════════════════════════════════
// 2. DEPRECIATION METHODS
// Each method exports a function (costBase, salvage, lifeYears, periodIndex,
// totalPeriods, extra) → depreciation for that period.
// ═══════════════════════════════════════════════════════════════════════

const METHODS = Object.freeze({
  STRAIGHT_LINE: 'straight_line',
  DECLINING_BALANCE: 'declining_balance', // double declining
  SUM_OF_YEARS: 'sum_of_years',
  UNITS_OF_PRODUCTION: 'units_of_production',
  ACCELERATED: 'accelerated',             // category-driven high rate
});

/**
 * Straight-line annual depreciation.
 * (cost - salvage) / lifeYears
 */
function depStraightLine(cost, salvage, lifeYears) {
  if (lifeYears <= 0) return 0;
  const base = Math.max(0, cost - salvage);
  return round2(base / lifeYears);
}

/**
 * Double-declining-balance annual depreciation for a given year.
 * year is 1-based. NBV never crosses salvage — last period clamps.
 */
function depDecliningBalance(cost, salvage, lifeYears, year) {
  if (lifeYears <= 0) return 0;
  const rate = 2 / lifeYears; // double declining factor
  let nbv = cost;
  let lastDep = 0;
  for (let y = 1; y <= year; y++) {
    const raw = nbv * rate;
    // Never depreciate below salvage
    const allowed = Math.max(0, Math.min(raw, nbv - salvage));
    lastDep = allowed;
    nbv -= allowed;
  }
  return round2(lastDep);
}

/**
 * Sum-of-the-years-digits depreciation.
 * (lifeYears - year + 1) / SYD * (cost - salvage)
 */
function depSumOfYears(cost, salvage, lifeYears, year) {
  if (lifeYears <= 0) return 0;
  const syd = (lifeYears * (lifeYears + 1)) / 2;
  const factor = (lifeYears - year + 1) / syd;
  return round2(Math.max(0, (cost - salvage) * factor));
}

/**
 * Units-of-production depreciation.
 * (cost - salvage) * (unitsThisPeriod / totalExpectedUnits)
 */
function depUnitsOfProduction(cost, salvage, unitsThisPeriod, totalUnits) {
  if (totalUnits <= 0) return 0;
  const base = Math.max(0, cost - salvage);
  return round2(base * (unitsThisPeriod / totalUnits));
}

// ═══════════════════════════════════════════════════════════════════════
// 3. DATE & MATH UTILITIES
// ═══════════════════════════════════════════════════════════════════════

/** Round to 2 decimal places (banker-safe for accounting). */
function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Parse ISO-like date to Date. Returns null if invalid. */
function parseDate(s) {
  if (s instanceof Date) return new Date(s.getTime());
  if (typeof s !== 'string') return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a Date as YYYY-MM-DD. */
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Integer number of months between two dates — counts partial months
 * according to the mid-month convention commonly used in Israel:
 *   if the asset is acquired on or before the 15th → full month
 *   otherwise → half month on the acquisition month.
 */
function monthsBetweenMidMonth(from, to) {
  const base =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  // mid-month convention applied at the FROM boundary
  const fromDay = from.getDate();
  const adjustment = fromDay <= 15 ? 0 : -0.5;
  // and at the TO boundary (closing partial month)
  const toDay = to.getDate();
  const toAdjust = toDay >= 15 ? 0.5 : 0;
  return Math.max(0, base + adjustment + toAdjust);
}

/** Days between two dates, positive inclusive. */
function daysBetween(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / MS);
}

// ═══════════════════════════════════════════════════════════════════════
// 4. STATE STORE (pure in-memory, append-only)
//    Exposed via `createAssetStore()` so tests can spin up isolated stores.
//    The default module-level store is used by the bare exports below.
// ═══════════════════════════════════════════════════════════════════════

function createAssetStore() {
  /** @type {Map<string, object>} */
  const assets = new Map();
  /** @type {Array<object>} */
  const transactions = [];
  /** @type {Array<object>} */
  const maintenance = [];
  /** @type {Array<object>} */
  const journal = [];
  let seq = 0;

  function nextId(prefix) {
    seq += 1;
    return `${prefix}-${String(seq).padStart(6, '0')}`;
  }

  // ──────────────────────────────────────────────────────────────────
  // ADD ASSET
  // ──────────────────────────────────────────────────────────────────
  function addAsset(fields) {
    if (!fields || typeof fields !== 'object') {
      throw new Error('addAsset: fields object required');
    }
    const cat = fields.category;
    const catMeta = CATEGORY_RATES[cat];
    if (!catMeta) {
      throw new Error(
        `addAsset: unknown category "${cat}". Known: ${Object.keys(CATEGORY_RATES).join(', ')}`
      );
    }

    const acq = parseDate(fields.acquisition_date);
    if (!acq) {
      throw new Error('addAsset: acquisition_date must be a valid ISO date');
    }

    const cost = Number(fields.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error('addAsset: cost must be a non-negative number');
    }

    const salvage = Number(fields.salvage_value || 0);
    if (!Number.isFinite(salvage) || salvage < 0) {
      throw new Error('addAsset: salvage_value must be non-negative');
    }
    if (salvage > cost) {
      throw new Error('addAsset: salvage_value cannot exceed cost');
    }

    // Useful life defaults to category's implied life
    const life = Number(fields.useful_life_years || catMeta.useful_life);
    if (!Number.isFinite(life) || life <= 0) {
      throw new Error('addAsset: useful_life_years must be positive');
    }

    const method = fields.depreciation_method || METHODS.STRAIGHT_LINE;
    if (!Object.values(METHODS).includes(method)) {
      throw new Error(`addAsset: unknown depreciation_method "${method}"`);
    }

    const id = fields.id || nextId('FA');
    if (assets.has(id)) {
      throw new Error(`addAsset: asset id "${id}" already exists`);
    }

    const barcode = fields.barcode || generateBarcode(id);

    const asset = {
      id,
      name: String(fields.name || '').trim() || `Asset ${id}`,
      name_he: fields.name_he || null,
      category: cat,
      category_he: catMeta.he,
      category_en: catMeta.en,
      serial_no: fields.serial_no || null,
      location: fields.location || 'UNASSIGNED',
      custodian: fields.custodian || null,
      acquisition_date: fmtDate(acq),
      cost: round2(cost),
      salvage_value: round2(salvage),
      useful_life_years: life,
      depreciation_method: method,
      depreciation_rate: catMeta.rate,
      accumulated_depreciation: 0,
      current_nbv: round2(cost),
      status: 'ACTIVE',
      barcode,
      total_units_capacity: fields.total_units_capacity || null,
      units_used: 0,
      impairment_loss: 0,
      revaluation_surplus: 0,
      last_depreciated_to: fmtDate(acq),
      created_at: new Date().toISOString(),
    };

    assets.set(id, asset);

    transactions.push({
      tx_id: nextId('TX'),
      asset_id: id,
      type: 'ACQUIRE',
      type_he: 'רכישה',
      date: asset.acquisition_date,
      amount: asset.cost,
      memo: `Acquired ${asset.name} (${asset.category_en})`,
      created_at: asset.created_at,
    });

    return id;
  }

  // ──────────────────────────────────────────────────────────────────
  // RUN DEPRECIATION — monthly, mid-month convention, auto-journal
  // ──────────────────────────────────────────────────────────────────
  function runDepreciation(asOf, opts = {}) {
    const asOfDate = parseDate(asOf);
    if (!asOfDate) throw new Error('runDepreciation: asOf must be a date');
    const entries = [];

    for (const asset of assets.values()) {
      if (asset.status !== 'ACTIVE') continue;
      const last = parseDate(asset.last_depreciated_to);
      if (!last || last >= asOfDate) continue;

      const months = monthsBetweenMidMonth(last, asOfDate);
      if (months <= 0) continue;

      // Base annual depreciation by method
      let annual = 0;
      const lifeYears = asset.useful_life_years;
      const cost = asset.cost + asset.revaluation_surplus - asset.impairment_loss;
      const salvage = asset.salvage_value;

      // Year index counted from acquisition
      const acqDate = parseDate(asset.acquisition_date);
      const yearIndex =
        Math.max(1, Math.ceil(monthsBetweenMidMonth(acqDate, asOfDate) / 12));

      switch (asset.depreciation_method) {
        case METHODS.STRAIGHT_LINE:
          annual = depStraightLine(cost, salvage, lifeYears);
          break;
        case METHODS.DECLINING_BALANCE:
          annual = depDecliningBalance(cost, salvage, lifeYears, yearIndex);
          break;
        case METHODS.SUM_OF_YEARS:
          annual = depSumOfYears(cost, salvage, lifeYears, yearIndex);
          break;
        case METHODS.UNITS_OF_PRODUCTION: {
          const units = Number(opts.units_this_period || 0);
          const total = Number(asset.total_units_capacity || 0);
          annual = depUnitsOfProduction(cost, salvage, units, total) * 12; // normalize
          break;
        }
        case METHODS.ACCELERATED:
          // Accelerated uses the legally permitted category rate
          annual = round2(
            Math.max(0, (cost - salvage) * asset.depreciation_rate)
          );
          break;
      }

      // Pro-rata for number of months since last depreciation
      let periodDep = round2((annual * months) / 12);

      // Never exceed NBV - salvage
      const floor = asset.salvage_value;
      const maxAllowed = Math.max(0, round2(asset.current_nbv - floor));
      if (periodDep > maxAllowed) periodDep = maxAllowed;

      if (periodDep <= 0) {
        asset.last_depreciated_to = fmtDate(asOfDate);
        continue;
      }

      asset.accumulated_depreciation = round2(
        asset.accumulated_depreciation + periodDep
      );
      asset.current_nbv = round2(asset.current_nbv - periodDep);
      asset.last_depreciated_to = fmtDate(asOfDate);

      const tx = {
        tx_id: nextId('TX'),
        asset_id: asset.id,
        type: 'DEPRECIATE',
        type_he: 'פחת',
        date: fmtDate(asOfDate),
        amount: periodDep,
        memo: `Depreciation for ${months.toFixed(2)} months`,
        method: asset.depreciation_method,
      };
      transactions.push(tx);

      // Auto-post GL journal (double entry)
      const gl = {
        entry_id: nextId('JE'),
        date: fmtDate(asOfDate),
        asset_id: asset.id,
        debit: { account: '7200-DEP-EXP', name_he: 'הוצאות פחת', amount: periodDep },
        credit: { account: '1590-ACC-DEP', name_he: 'פחת שנצבר', amount: periodDep },
        memo: `Monthly depreciation — ${asset.name} (${asset.category_he})`,
      };
      journal.push(gl);

      entries.push({ ...tx, journal: gl, asset_id: asset.id, new_nbv: asset.current_nbv });
    }

    return entries;
  }

  // ──────────────────────────────────────────────────────────────────
  // DISPOSE — sale with gain/loss calculation
  // ──────────────────────────────────────────────────────────────────
  function dispose(assetId, saleAmount, disposalDate) {
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`dispose: asset "${assetId}" not found`);
    if (asset.status !== 'ACTIVE') {
      throw new Error(`dispose: asset "${assetId}" is not active`);
    }

    const saleDate = parseDate(disposalDate) || new Date();
    const sale = Number(saleAmount);
    if (!Number.isFinite(sale) || sale < 0) {
      throw new Error('dispose: saleAmount must be non-negative');
    }

    // Catch up depreciation to disposal date
    runDepreciation(fmtDate(saleDate));

    const nbv = asset.current_nbv;
    const gainLoss = round2(sale - nbv);

    asset.status = 'DISPOSED';
    asset.disposal_date = fmtDate(saleDate);
    asset.disposal_proceeds = round2(sale);
    asset.disposal_gain_loss = gainLoss;

    const tx = {
      tx_id: nextId('TX'),
      asset_id: assetId,
      type: 'DISPOSE',
      type_he: 'מימוש',
      date: fmtDate(saleDate),
      amount: sale,
      gain_loss: gainLoss,
      memo: `Disposed ${asset.name} for ${sale} NIS`,
    };
    transactions.push(tx);

    // Journal: debit cash + accumulated dep, credit asset, debit loss / credit gain
    const lines = [
      { account: '1000-CASH', name_he: 'מזומן', debit: round2(sale), credit: 0 },
      {
        account: '1590-ACC-DEP',
        name_he: 'פחת שנצבר',
        debit: round2(asset.accumulated_depreciation),
        credit: 0,
      },
      {
        account: '1500-FA',
        name_he: 'רכוש קבוע',
        debit: 0,
        credit: round2(asset.cost + asset.revaluation_surplus - asset.impairment_loss),
      },
    ];
    if (gainLoss >= 0) {
      lines.push({
        account: '4900-GAIN-FA',
        name_he: 'רווח ממימוש רכוש קבוע',
        debit: 0,
        credit: Math.abs(gainLoss),
      });
    } else {
      lines.push({
        account: '7900-LOSS-FA',
        name_he: 'הפסד ממימוש רכוש קבוע',
        debit: Math.abs(gainLoss),
        credit: 0,
      });
    }

    const gl = {
      entry_id: nextId('JE'),
      date: fmtDate(saleDate),
      asset_id: assetId,
      lines,
      memo: `Disposal of ${asset.name} — ${gainLoss >= 0 ? 'gain' : 'loss'} ${Math.abs(gainLoss)} NIS`,
    };
    journal.push(gl);

    return { gain_loss: gainLoss, journal: gl, transaction: tx };
  }

  // ──────────────────────────────────────────────────────────────────
  // TRANSFER — move between locations / custodians
  // ──────────────────────────────────────────────────────────────────
  function transfer(assetId, newLocation, newCustodian) {
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`transfer: asset "${assetId}" not found`);
    if (asset.status !== 'ACTIVE') {
      throw new Error(`transfer: asset "${assetId}" is not active`);
    }
    if (!newLocation) throw new Error('transfer: newLocation required');

    const oldLocation = asset.location;
    const oldCustodian = asset.custodian;
    asset.location = newLocation;
    if (typeof newCustodian !== 'undefined') asset.custodian = newCustodian;

    transactions.push({
      tx_id: nextId('TX'),
      asset_id: assetId,
      type: 'TRANSFER',
      type_he: 'העברה',
      date: fmtDate(new Date()),
      from_location: oldLocation,
      to_location: newLocation,
      from_custodian: oldCustodian,
      to_custodian: newCustodian,
      memo: `Transferred ${asset.name} from ${oldLocation} to ${newLocation}`,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // REVALUE — IAS 16 model
  // ──────────────────────────────────────────────────────────────────
  function revalue(assetId, newFairValue, date) {
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`revalue: asset "${assetId}" not found`);
    if (asset.status !== 'ACTIVE') {
      throw new Error(`revalue: asset "${assetId}" is not active`);
    }
    const fv = Number(newFairValue);
    if (!Number.isFinite(fv) || fv < 0) {
      throw new Error('revalue: newFairValue must be non-negative');
    }

    const surplus = round2(fv - asset.current_nbv);
    asset.revaluation_surplus = round2(asset.revaluation_surplus + surplus);
    asset.current_nbv = round2(fv);

    transactions.push({
      tx_id: nextId('TX'),
      asset_id: assetId,
      type: 'REVALUE',
      type_he: 'הערכה מחדש',
      date: fmtDate(parseDate(date) || new Date()),
      amount: surplus,
      memo: `Revalued to ${fv} (surplus ${surplus})`,
    });

    return { surplus, new_nbv: asset.current_nbv };
  }

  // ──────────────────────────────────────────────────────────────────
  // FORECAST — N-year NBV projection
  // ──────────────────────────────────────────────────────────────────
  function forecast(assetId, years) {
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`forecast: asset "${assetId}" not found`);
    const n = Number(years);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('forecast: years must be positive');
    }

    const schedule = [];
    let nbv = asset.current_nbv;
    let accum = asset.accumulated_depreciation;
    const salvage = asset.salvage_value;
    const life = asset.useful_life_years;

    for (let y = 1; y <= Math.floor(n); y++) {
      let dep = 0;
      const baseCost = asset.cost + asset.revaluation_surplus - asset.impairment_loss;
      switch (asset.depreciation_method) {
        case METHODS.STRAIGHT_LINE:
          dep = depStraightLine(baseCost, salvage, life);
          break;
        case METHODS.DECLINING_BALANCE:
          dep = round2(nbv * (2 / life));
          if (nbv - dep < salvage) dep = round2(nbv - salvage);
          break;
        case METHODS.SUM_OF_YEARS:
          dep = depSumOfYears(baseCost, salvage, life, y);
          break;
        case METHODS.ACCELERATED:
          dep = round2(Math.max(0, (baseCost - salvage) * asset.depreciation_rate));
          break;
        default:
          dep = depStraightLine(baseCost, salvage, life);
      }
      if (dep > nbv - salvage) dep = round2(Math.max(0, nbv - salvage));
      nbv = round2(nbv - dep);
      accum = round2(accum + dep);
      schedule.push({
        year: y,
        depreciation: dep,
        accumulated: accum,
        nbv,
      });
    }
    return schedule;
  }

  // ──────────────────────────────────────────────────────────────────
  // IMPAIRMENT TEST — IAS 36
  //   carrying = NBV;  recoverable = higher of fair value and value-in-use
  //   if carrying > recoverable → impairment loss = carrying - recoverable
  // ──────────────────────────────────────────────────────────────────
  function impairmentTest(assetId, recoverable) {
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`impairmentTest: asset "${assetId}" not found`);
    const rec = Number(recoverable);
    if (!Number.isFinite(rec) || rec < 0) {
      throw new Error('impairmentTest: recoverable must be non-negative');
    }
    const carrying = asset.current_nbv;
    if (rec >= carrying) {
      return { impaired: false, adjustment: 0, carrying, recoverable: rec };
    }
    const adjustment = round2(carrying - rec);
    asset.impairment_loss = round2(asset.impairment_loss + adjustment);
    asset.current_nbv = round2(rec);

    transactions.push({
      tx_id: nextId('TX'),
      asset_id: assetId,
      type: 'IMPAIR',
      type_he: 'ירידת ערך',
      date: fmtDate(new Date()),
      amount: adjustment,
      memo: `Impaired from ${carrying} to ${rec}`,
    });

    journal.push({
      entry_id: nextId('JE'),
      asset_id: assetId,
      date: fmtDate(new Date()),
      debit: { account: '7910-IMP-LOSS', name_he: 'הפסד מירידת ערך', amount: adjustment },
      credit: { account: '1595-IMPAIRMENT', name_he: 'קיזוז ירידת ערך', amount: adjustment },
      memo: 'Impairment write-down (IAS 36)',
    });

    return { impaired: true, adjustment, carrying, recoverable: rec, new_nbv: rec };
  }

  // ──────────────────────────────────────────────────────────────────
  // MAINTENANCE — scheduled and actual services
  // ──────────────────────────────────────────────────────────────────
  function scheduleMaintenance(assetId, spec) {
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`scheduleMaintenance: asset "${assetId}" not found`);
    const record = {
      maint_id: nextId('MT'),
      asset_id: assetId,
      type: spec.type || 'SCHEDULED',
      type_he: spec.type_he || 'תחזוקה מתוכננת',
      scheduled_date: spec.scheduled_date,
      cost: Number(spec.cost || 0),
      vendor: spec.vendor || null,
      description: spec.description || '',
      completed: false,
    };
    maintenance.push(record);
    return record.maint_id;
  }

  function completeMaintenance(maintId, actualCost, completedDate) {
    const rec = maintenance.find((m) => m.maint_id === maintId);
    if (!rec) throw new Error(`completeMaintenance: "${maintId}" not found`);
    rec.completed = true;
    rec.actual_cost = Number(actualCost || rec.cost);
    rec.completed_date = completedDate || fmtDate(new Date());
  }

  // ──────────────────────────────────────────────────────────────────
  // AUDIT / PHYSICAL COUNT
  //   Accepts a map of { assetId: foundLocation } and returns items whose
  //   location does not match the register or that are missing entirely.
  // ──────────────────────────────────────────────────────────────────
  function auditReport(physicalCount = {}) {
    const unreconciled = [];
    const counted = new Set(Object.keys(physicalCount));

    for (const asset of assets.values()) {
      if (asset.status !== 'ACTIVE') continue;
      if (!counted.has(asset.id)) {
        unreconciled.push({
          asset_id: asset.id,
          issue: 'MISSING',
          issue_he: 'חסר במפקד',
          expected_location: asset.location,
          found_location: null,
          nbv: asset.current_nbv,
        });
        continue;
      }
      const found = physicalCount[asset.id];
      if (found !== asset.location) {
        unreconciled.push({
          asset_id: asset.id,
          issue: 'LOCATION_MISMATCH',
          issue_he: 'אי התאמה במיקום',
          expected_location: asset.location,
          found_location: found,
          nbv: asset.current_nbv,
        });
      }
    }

    // Ghost items — found but not on register
    for (const id of counted) {
      if (!assets.has(id)) {
        unreconciled.push({
          asset_id: id,
          issue: 'GHOST',
          issue_he: 'פריט לא רשום',
          expected_location: null,
          found_location: physicalCount[id],
          nbv: null,
        });
      }
    }

    return unreconciled;
  }

  // ──────────────────────────────────────────────────────────────────
  // CATEGORY SUMMARY
  // ──────────────────────────────────────────────────────────────────
  function categorySummary() {
    const summary = {};
    for (const asset of assets.values()) {
      const key = asset.category;
      if (!summary[key]) {
        const meta = CATEGORY_RATES[key];
        summary[key] = {
          category: key,
          category_he: meta.he,
          category_en: meta.en,
          count: 0,
          cost: 0,
          accumulated_depreciation: 0,
          nbv: 0,
          active: 0,
          disposed: 0,
        };
      }
      const bucket = summary[key];
      bucket.count += 1;
      bucket.cost = round2(bucket.cost + asset.cost);
      bucket.accumulated_depreciation = round2(
        bucket.accumulated_depreciation + asset.accumulated_depreciation
      );
      bucket.nbv = round2(bucket.nbv + asset.current_nbv);
      if (asset.status === 'ACTIVE') bucket.active += 1;
      if (asset.status === 'DISPOSED') bucket.disposed += 1;
    }
    return Object.values(summary);
  }

  // ──────────────────────────────────────────────────────────────────
  // READ HELPERS (never mutate)
  // ──────────────────────────────────────────────────────────────────
  function getAsset(id) {
    const a = assets.get(id);
    return a ? { ...a } : null;
  }

  function listAssets(filter = {}) {
    const out = [];
    for (const a of assets.values()) {
      if (filter.status && a.status !== filter.status) continue;
      if (filter.category && a.category !== filter.category) continue;
      if (filter.location && a.location !== filter.location) continue;
      out.push({ ...a });
    }
    return out;
  }

  function getTransactions(assetId) {
    return transactions
      .filter((t) => !assetId || t.asset_id === assetId)
      .map((t) => ({ ...t }));
  }

  function getJournal(assetId) {
    return journal
      .filter((j) => !assetId || j.asset_id === assetId)
      .map((j) => ({ ...j }));
  }

  return {
    // mutating
    addAsset,
    runDepreciation,
    dispose,
    transfer,
    revalue,
    forecast,
    impairmentTest,
    scheduleMaintenance,
    completeMaintenance,
    // queries
    auditReport,
    categorySummary,
    getAsset,
    listAssets,
    getTransactions,
    getJournal,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 5. BARCODE GENERATOR — deterministic, Code-128 compatible ASCII string
// ═══════════════════════════════════════════════════════════════════════

function generateBarcode(seed) {
  // Simple checksum-suffixed tag; compatible with most Code-128 readers.
  const base = String(seed).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum = (sum + base.charCodeAt(i) * (i + 1)) % 103;
  const checksum = String(sum).padStart(3, '0');
  return `*${base}-${checksum}*`;
}

// ═══════════════════════════════════════════════════════════════════════
// 6. DEFAULT SINGLETON STORE + BARE EXPORTS
// Matches the contract asked for in the task prompt:
//   addAsset, runDepreciation, dispose, transfer, forecast,
//   impairmentTest, auditReport, categorySummary
// ═══════════════════════════════════════════════════════════════════════

const defaultStore = createAssetStore();

function addAsset(fields) { return defaultStore.addAsset(fields); }
function runDepreciation(asOf, opts) { return defaultStore.runDepreciation(asOf, opts); }
function dispose(id, sale, date) { return defaultStore.dispose(id, sale, date); }
function transfer(id, loc, custodian) { return defaultStore.transfer(id, loc, custodian); }
function forecast(id, years) { return defaultStore.forecast(id, years); }
function impairmentTest(id, rec) { return defaultStore.impairmentTest(id, rec); }
function auditReport(count) { return defaultStore.auditReport(count); }
function categorySummary() { return defaultStore.categorySummary(); }

module.exports = {
  // Core API (bare)
  addAsset,
  runDepreciation,
  dispose,
  transfer,
  forecast,
  impairmentTest,
  auditReport,
  categorySummary,

  // Factory for isolated stores (used by tests and scoped tenants)
  createAssetStore,

  // Catalogs & constants
  CATEGORY_RATES,
  METHODS,

  // Pure math helpers (exported for unit testing)
  depStraightLine,
  depDecliningBalance,
  depSumOfYears,
  depUnitsOfProduction,
  round2,
  parseDate,
  fmtDate,
  monthsBetweenMidMonth,
  daysBetween,
  generateBarcode,
};
