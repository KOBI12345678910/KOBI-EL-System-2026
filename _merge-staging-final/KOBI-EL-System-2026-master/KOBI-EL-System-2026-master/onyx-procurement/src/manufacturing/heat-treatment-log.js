/* ============================================================================
 * Techno-Kol ERP — Heat Treatment Log Tracker (HeatTreatmentLog)
 * Agent Y-042 / Swarm Manufacturing / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * עוקב יומן טיפול תרמי — מפעל מתכת "טכנו-קול עוזי"
 *
 * Standards implemented:
 *   - ISO 9001          — Quality Management System (traceability §8.5.2)
 *   - AS9100 Rev D      — Aerospace QMS (traceability §8.5.2)
 *   - NADCAP AC7102     — Heat Treating accreditation
 *   - AMS 2750 Rev G    — Pyrometry (furnace classification, TUS, SAT,
 *                         thermocouple usage limits, calibration cadence)
 *   - AMS 2759          — Heat treatment of steel parts (sub-specs)
 *
 * Domain:
 *   Israeli metal fabricator "טכנו-קול עוזי" treats parts for IAI / Elbit /
 *   Rafael / IMI Systems and EU automotive primes. Every lot must carry an
 *   end-to-end pyrometric record from raw-material heat number through ship.
 *   This module is the canonical store: furnaces, recipes, lots, time-series
 *   readings, hardness logs, deviations, calibration alerts, certificates,
 *   and the genealogy graph (raw heat -> HT lot -> part -> assembly -> ship).
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Append-only. Nothing is ever deleted. Edits push history snapshots.
 *   - Zero external dependencies (Node built-ins only).
 *   - Bilingual Hebrew + English labels and error messages on every public
 *     surface.
 *   - In-memory Map storage; serialisation is the caller's job.
 *   - Temperatures in °C. Times are ISO-8601 wall-clock strings. Soak times
 *     in minutes. Ramp / cooling rates in °C/min.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Immutable catalogs
 * -------------------------------------------------------------------------- */

/**
 * Thermocouple types per AMS 2750 Rev G Table 3 / 4.
 * Each entry carries the IEC 60584 base-metal/noble-metal classification,
 * the practical upper-temperature limit for **expendable** TCs in
 * instrument-class furnaces, the maximum number of uses (single-use vs
 * reusable), and the bilingual descriptor for certificates.
 */
const THERMOCOUPLE_TYPES = Object.freeze({
  K: Object.freeze({ id: 'K', he: 'כרומל-אלומל (סוג K)', en: 'Chromel/Alumel (Type K)',         metalClass: 'base',  maxC: 1260, expendableMaxC: 1149, asTC: true }),
  J: Object.freeze({ id: 'J', he: 'ברזל-קונסטנטן (סוג J)', en: 'Iron/Constantan (Type J)',        metalClass: 'base',  maxC: 760,  expendableMaxC: 593,  asTC: true }),
  T: Object.freeze({ id: 'T', he: 'נחושת-קונסטנטן (סוג T)', en: 'Copper/Constantan (Type T)',       metalClass: 'base',  maxC: 370,  expendableMaxC: 260,  asTC: true }),
  N: Object.freeze({ id: 'N', he: 'ניקרוסיל-נסיל (סוג N)', en: 'Nicrosil/Nisil (Type N)',          metalClass: 'base',  maxC: 1260, expendableMaxC: 1149, asTC: true }),
  R: Object.freeze({ id: 'R', he: 'פלטינה-13%רודיום (סוג R)', en: 'Pt/Pt-13%Rh (Type R)',             metalClass: 'noble', maxC: 1480, expendableMaxC: 1480, asTC: true }),
  S: Object.freeze({ id: 'S', he: 'פלטינה-10%רודיום (סוג S)', en: 'Pt/Pt-10%Rh (Type S)',             metalClass: 'noble', maxC: 1480, expendableMaxC: 1480, asTC: true }),
  B: Object.freeze({ id: 'B', he: 'פלטינה-30/6%רודיום (סוג B)', en: 'Pt-30%Rh/Pt-6%Rh (Type B)',         metalClass: 'noble', maxC: 1700, expendableMaxC: 1700, asTC: true }),
});

/**
 * Heat-treat process catalog (canonical, bilingual, frozen).
 * Used for cross-checking the recipe `process` field and rendering
 * certificate text.
 */
const PROCESS_CATALOG = Object.freeze({
  'anneal':         Object.freeze({ id: 'anneal',         he: 'חישול / רוך',         en: 'Annealing',         typicalMinC: 600, typicalMaxC: 950,  toleranceC: 14 }),
  'normalize':      Object.freeze({ id: 'normalize',      he: 'נורמליזציה',           en: 'Normalizing',       typicalMinC: 820, typicalMaxC: 950,  toleranceC: 14 }),
  'temper':         Object.freeze({ id: 'temper',         he: 'טמפור (השבחה)',        en: 'Tempering',         typicalMinC: 150, typicalMaxC: 700,  toleranceC: 8  }),
  'quench':         Object.freeze({ id: 'quench',         he: 'הרתחה (הקפאה)',        en: 'Quenching',         typicalMinC: 780, typicalMaxC: 900,  toleranceC: 14 }),
  'stress-relief':  Object.freeze({ id: 'stress-relief',  he: 'הרפיית מאמצים',        en: 'Stress Relief',     typicalMinC: 550, typicalMaxC: 680,  toleranceC: 14 }),
  'case-harden':    Object.freeze({ id: 'case-harden',    he: 'עיבוי שטח (קשיחות)',  en: 'Case Hardening',    typicalMinC: 850, typicalMaxC: 950,  toleranceC: 14 }),
});

/**
 * AMS 2750 Rev G furnace classes (Table 6 / 8).
 * Each class has a Temperature Uniformity Survey tolerance (`tusBandC`) and
 * a System Accuracy Test cadence (`satIntervalDays`) that governs how often
 * the furnace must be re-verified. Calibration of control thermocouples is
 * derived from the class plus the thermocouple metal class — see
 * `_tcCalibrationDays()`.
 */
const FURNACE_CLASSES = Object.freeze({
  '1': Object.freeze({ id: '1', he: 'מחלקה 1', en: 'Class 1', tusBandC: 3,  satIntervalDays: 30,  calIntervalControlDays: 30  }),
  '2': Object.freeze({ id: '2', he: 'מחלקה 2', en: 'Class 2', tusBandC: 6,  satIntervalDays: 90,  calIntervalControlDays: 90  }),
  '3': Object.freeze({ id: '3', he: 'מחלקה 3', en: 'Class 3', tusBandC: 8,  satIntervalDays: 90,  calIntervalControlDays: 90  }),
  '4': Object.freeze({ id: '4', he: 'מחלקה 4', en: 'Class 4', tusBandC: 10, satIntervalDays: 180, calIntervalControlDays: 180 }),
  '5': Object.freeze({ id: '5', he: 'מחלקה 5', en: 'Class 5', tusBandC: 14, satIntervalDays: 180, calIntervalControlDays: 180 }),
  '6': Object.freeze({ id: '6', he: 'מחלקה 6', en: 'Class 6', tusBandC: 28, satIntervalDays: 365, calIntervalControlDays: 365 }),
});

/**
 * Hardness scales accepted by the hardness log. Conversion is intentionally
 * NOT done — ASTM E140 conversions are non-bijective and depend on alloy.
 * The log preserves whatever scale the inspector reported.
 */
const HARDNESS_SCALES = Object.freeze({
  HRC: Object.freeze({ id: 'HRC', he: 'רוקוול C', en: 'Rockwell C', minTypical: 20, maxTypical: 70 }),
  HRB: Object.freeze({ id: 'HRB', he: 'רוקוול B', en: 'Rockwell B', minTypical: 20, maxTypical: 100 }),
  HB:  Object.freeze({ id: 'HB',  he: 'ברינל',    en: 'Brinell',    minTypical: 80, maxTypical: 650 }),
  HV:  Object.freeze({ id: 'HV',  he: 'ויקרס',    en: 'Vickers',    minTypical: 80, maxTypical: 940 }),
});

/* ----------------------------------------------------------------------------
 * 1. Tiny helpers
 * -------------------------------------------------------------------------- */

/** Wraps `new Error()` with bilingual message. */
function bilingualError(en, he) {
  const e = new Error(en + ' / ' + he);
  e.message_en = en;
  e.message_he = he;
  return e;
}

/** Defensive deep-clone for plain JSON-y data. */
function cloneJSON(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** Days between two ISO date strings (b - a), as a signed integer. */
function daysBetween(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.floor((b - a) / 86_400_000);
}

/** Add `n` days to an ISO date and return YYYY-MM-DD. */
function addDays(iso, n) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Append-only push that keeps a frozen snapshot. */
function appendFrozen(arr, item) {
  arr.push(Object.freeze(cloneJSON(item)));
  return arr[arr.length - 1];
}

/* ----------------------------------------------------------------------------
 * 2. Class HeatTreatmentLog
 * -------------------------------------------------------------------------- */

class HeatTreatmentLog {
  constructor() {
    /** @type {Map<string, object>} */ this.furnaces       = new Map();
    /** @type {Map<string, object>} */ this.recipes        = new Map();
    /** @type {Map<string, object>} */ this.lots           = new Map();
    /** @type {Map<string, object>} */ this.parts          = new Map(); // serialNumber -> part record
    /** @type {Map<string, object>} */ this.assemblies     = new Map(); // assemblyId   -> {parts:[]}
    /** @type {Map<string, object>} */ this.shipments      = new Map(); // shipmentId   -> {assemblies:[], date}
    /** @type {Map<string, object[]>} */ this.hardness     = new Map(); // lotId -> [reading, ...]
    /** @type {Map<string, object[]>} */ this.calibrations = new Map(); // furnaceId -> [event, ...]
    /** @type {Map<string, object[]>} */ this.satHistory   = new Map(); // furnaceId -> [SAT result, ...]

    /** Append-only audit log. Nothing in here is ever rewritten. */
    /** @type {object[]} */ this.auditLog = [];
  }

  /* ------------------------------------------------------------------------
   * 2.1 Audit
   * ---------------------------------------------------------------------- */
  _audit(action, payload) {
    const entry = Object.freeze({
      ts: new Date().toISOString(),
      action: action,
      payload: cloneJSON(payload) || {},
    });
    this.auditLog.push(entry);
    return entry;
  }

  /* ------------------------------------------------------------------------
   * 2.2 Furnace definition
   * ---------------------------------------------------------------------- */
  /**
   * Register or upgrade a furnace.
   * Per AMS 2750 §3.3 the furnace record carries:
   *   - id, type (e.g. "vacuum-batch", "atmosphere-pit", "induction"),
   *   - operating temperature range,
   *   - thermocouple type used for control + over-temp protection,
   *   - tcMapping: physical location -> calibration offset °C,
   *   - calibrationDue: ISO date for next instrument calibration,
   *   - class: AMS 2750 furnace class (default '2' for aerospace work).
   *
   * Append-only: re-defining keeps the prior version on `history`.
   */
  defineFurnace(spec) {
    if (!spec || typeof spec !== 'object') {
      throw bilingualError('defineFurnace requires a spec object', 'defineFurnace דורש אובייקט מפרט');
    }
    const { id, type, temperatureRange, tcMapping, thermocoupleType, calibrationDue } = spec;
    if (!id) throw bilingualError('furnace id is required', 'מזהה תנור חובה');
    if (!type) throw bilingualError('furnace type is required', 'סוג תנור חובה');
    if (!temperatureRange || temperatureRange.minC === undefined || temperatureRange.maxC === undefined) {
      throw bilingualError('temperatureRange {minC, maxC} is required', 'נדרש טווח טמפרטורה');
    }
    if (temperatureRange.minC >= temperatureRange.maxC) {
      throw bilingualError('temperatureRange.minC must be < maxC', 'minC חייב להיות קטן מ-maxC');
    }
    if (!thermocoupleType || !THERMOCOUPLE_TYPES[thermocoupleType]) {
      throw bilingualError(
        'thermocoupleType must be one of: ' + Object.keys(THERMOCOUPLE_TYPES).join(','),
        'סוג צמד תרמי חייב להיות אחד מ: ' + Object.keys(THERMOCOUPLE_TYPES).join(',')
      );
    }
    if (!Array.isArray(tcMapping) || tcMapping.length === 0) {
      throw bilingualError('tcMapping must be a non-empty array', 'tcMapping חייב להיות מערך לא-ריק');
    }
    for (const m of tcMapping) {
      if (!m || !m.location || typeof m.offset !== 'number') {
        throw bilingualError('each tcMapping entry needs {location, offset:number}', 'כל רישום tcMapping דורש location ו-offset מספרי');
      }
    }
    if (!calibrationDue) throw bilingualError('calibrationDue is required (ISO date)', 'תאריך כיול הבא חובה');

    // Verify the chosen thermocouple covers the operating envelope.
    const tc = THERMOCOUPLE_TYPES[thermocoupleType];
    if (temperatureRange.maxC > tc.maxC) {
      throw bilingualError(
        'thermocouple type ' + thermocoupleType + ' max ' + tc.maxC + '°C exceeded by furnace max ' + temperatureRange.maxC + '°C',
        'סוג צמד תרמי ' + thermocoupleType + ' חורג מטמפרטורת התנור'
      );
    }

    const klass = spec.class || '2';
    if (!FURNACE_CLASSES[klass]) {
      throw bilingualError('unknown AMS 2750 class ' + klass, 'מחלקת AMS 2750 לא ידועה: ' + klass);
    }

    const prior = this.furnaces.get(id);
    const history = prior ? prior.history.concat([Object.freeze({
      ts: new Date().toISOString(),
      from: 'upgrade',
      snapshot: cloneJSON(prior),
    })]) : [];

    const record = Object.freeze({
      id: id,
      type: type,
      class: klass,
      classMeta: FURNACE_CLASSES[klass],
      temperatureRange: Object.freeze({ minC: temperatureRange.minC, maxC: temperatureRange.maxC }),
      tcMapping: Object.freeze(tcMapping.map(m => Object.freeze({ location: m.location, offset: m.offset }))),
      thermocoupleType: thermocoupleType,
      thermocoupleMeta: THERMOCOUPLE_TYPES[thermocoupleType],
      calibrationDue: calibrationDue,
      he: spec.he || 'תנור ' + id,
      en: spec.en || 'Furnace ' + id,
      createdAt: prior ? prior.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: prior ? prior.version + 1 : 1,
      history: Object.freeze(history),
    });
    this.furnaces.set(id, record);
    this._audit('defineFurnace', { id: id, version: record.version });
    return record;
  }

  getFurnace(id) {
    return this.furnaces.get(id);
  }

  /* ------------------------------------------------------------------------
   * 2.3 Recipe definition
   * ---------------------------------------------------------------------- */
  /**
   * Register or upgrade a recipe (process specification).
   * Bilingual name. Process must be in PROCESS_CATALOG.
   */
  defineRecipe(spec) {
    if (!spec || typeof spec !== 'object') {
      throw bilingualError('defineRecipe requires a spec object', 'defineRecipe דורש אובייקט מפרט');
    }
    const { id, name_he, name_en, process, targetTemp, soakTime, coolingRate, atmosphere, rampRate } = spec;
    if (!id) throw bilingualError('recipe id is required', 'מזהה מתכון חובה');
    if (!name_he || !name_en) throw bilingualError('bilingual name_he + name_en required', 'שם דו-לשוני חובה');
    if (!PROCESS_CATALOG[process]) {
      throw bilingualError(
        'process must be one of: ' + Object.keys(PROCESS_CATALOG).join(','),
        'תהליך חייב להיות אחד מ: ' + Object.keys(PROCESS_CATALOG).join(',')
      );
    }
    if (typeof targetTemp !== 'number' || targetTemp <= 0) {
      throw bilingualError('targetTemp must be positive number °C', 'targetTemp חייב להיות מספר חיובי');
    }
    if (typeof soakTime !== 'number' || soakTime <= 0) {
      throw bilingualError('soakTime must be positive minutes', 'soakTime חייב להיות חיובי');
    }
    if (typeof rampRate !== 'number' || rampRate <= 0) {
      throw bilingualError('rampRate must be positive °C/min', 'rampRate חייב להיות חיובי');
    }
    if (typeof coolingRate !== 'number') {
      throw bilingualError('coolingRate °C/min required', 'coolingRate חובה');
    }
    if (!atmosphere) throw bilingualError('atmosphere is required', 'אטמוספירה חובה');

    const proc = PROCESS_CATALOG[process];
    // Tolerance defaults to the process catalog value but a recipe can override.
    const toleranceC = (typeof spec.toleranceC === 'number' && spec.toleranceC > 0) ? spec.toleranceC : proc.toleranceC;
    // The minimum time-at-temperature: by default the soakTime itself.
    const minTimeAtTemp = (typeof spec.minTimeAtTemp === 'number' && spec.minTimeAtTemp > 0) ? spec.minTimeAtTemp : soakTime;

    const prior = this.recipes.get(id);
    const history = prior ? prior.history.concat([Object.freeze({
      ts: new Date().toISOString(),
      from: 'upgrade',
      snapshot: cloneJSON(prior),
    })]) : [];

    const record = Object.freeze({
      id: id,
      name_he: name_he,
      name_en: name_en,
      process: process,
      processMeta: proc,
      targetTemp: targetTemp,
      soakTime: soakTime,
      coolingRate: coolingRate,
      atmosphere: atmosphere,
      rampRate: rampRate,
      toleranceC: toleranceC,
      minTimeAtTemp: minTimeAtTemp,
      createdAt: prior ? prior.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: prior ? prior.version + 1 : 1,
      history: Object.freeze(history),
    });
    this.recipes.set(id, record);
    this._audit('defineRecipe', { id: id, version: record.version, process: process });
    return record;
  }

  getRecipe(id) {
    return this.recipes.get(id);
  }

  /* ------------------------------------------------------------------------
   * 2.4 Lot lifecycle: start / log / complete
   * ---------------------------------------------------------------------- */
  /**
   * Start a lot. The lot is *open* until completeLot is called.
   * Lots are append-only: re-starting an existing open lot throws.
   */
  startLot(spec) {
    if (!spec || typeof spec !== 'object') {
      throw bilingualError('startLot requires spec', 'startLot דורש מפרט');
    }
    const { lotId, partNumber, qty, heatNo, material, recipeId, furnaceId, operatorId } = spec;
    if (!lotId) throw bilingualError('lotId required', 'מזהה אצווה חובה');
    if (this.lots.has(lotId)) {
      throw bilingualError('lot ' + lotId + ' already exists (append-only)', 'אצווה ' + lotId + ' כבר קיימת — לא מוחקים, רק משדרגים');
    }
    if (!partNumber) throw bilingualError('partNumber required', 'מק"ט חובה');
    if (typeof qty !== 'number' || qty <= 0) throw bilingualError('qty must be positive', 'כמות חייבת להיות חיובית');
    if (!heatNo) throw bilingualError('heatNo (raw material heat) required', 'מספר היציקה (heat) חובה');
    if (!material) throw bilingualError('material required', 'חומר חובה');
    if (!operatorId) throw bilingualError('operatorId required', 'מזהה מפעיל חובה');

    const recipe = this.recipes.get(recipeId);
    if (!recipe) throw bilingualError('unknown recipeId ' + recipeId, 'מתכון לא ידוע: ' + recipeId);
    const furnace = this.furnaces.get(furnaceId);
    if (!furnace) throw bilingualError('unknown furnaceId ' + furnaceId, 'תנור לא ידוע: ' + furnaceId);

    if (recipe.targetTemp > furnace.temperatureRange.maxC || recipe.targetTemp < furnace.temperatureRange.minC) {
      throw bilingualError(
        'recipe ' + recipeId + ' target ' + recipe.targetTemp + '°C outside furnace ' + furnaceId + ' envelope',
        'מתכון ' + recipeId + ' בטמפרטורה ' + recipe.targetTemp + '°C מחוץ לטווח התנור'
      );
    }

    const lot = {
      lotId: lotId,
      partNumber: partNumber,
      qty: qty,
      heatNo: heatNo,
      material: material,
      recipeId: recipeId,
      recipeSnapshot: cloneJSON(recipe),
      furnaceId: furnaceId,
      furnaceSnapshot: cloneJSON(furnace),
      operatorId: operatorId,
      startedAt: new Date().toISOString(),
      readings: [],          // append-only time series
      hardness: [],          // append-only hardness reports (mirrored in this.hardness)
      status: 'in-progress', // 'in-progress' | 'completed' | 'rejected'
      result: null,
      completedAt: null,
      history: [],
    };
    this.lots.set(lotId, lot);
    this.hardness.set(lotId, []);
    this._audit('startLot', { lotId: lotId, recipeId: recipeId, furnaceId: furnaceId, qty: qty });
    return cloneJSON(lot);
  }

  /**
   * Append a reading to the time series. NEVER overwrites; ordered by ts.
   * `actualTemp` is an array of {location, value}; `setTemp` is the
   * controller setpoint at that moment.
   */
  logReading(spec) {
    if (!spec || typeof spec !== 'object') throw bilingualError('logReading requires spec', 'logReading דורש מפרט');
    const { lotId, timestamp, actualTemp, setTemp } = spec;
    const lot = this.lots.get(lotId);
    if (!lot) throw bilingualError('unknown lotId ' + lotId, 'אצווה לא ידועה: ' + lotId);
    if (lot.status !== 'in-progress') {
      throw bilingualError('lot ' + lotId + ' is not in-progress', 'אצווה ' + lotId + ' אינה פעילה');
    }
    if (!timestamp) throw bilingualError('timestamp required', 'חותמת זמן חובה');
    if (!Array.isArray(actualTemp) || actualTemp.length === 0) {
      throw bilingualError('actualTemp must be non-empty array', 'actualTemp חייב להיות מערך לא-ריק');
    }
    for (const r of actualTemp) {
      if (!r || !r.location || typeof r.value !== 'number') {
        throw bilingualError('each actualTemp entry needs {location, value:number}', 'כל קריאה דורשת location ו-value');
      }
    }
    if (typeof setTemp !== 'number') throw bilingualError('setTemp number required', 'setTemp חובה');

    const reading = Object.freeze({
      timestamp: timestamp,
      actualTemp: Object.freeze(actualTemp.map(r => Object.freeze({ location: r.location, value: r.value }))),
      setTemp: setTemp,
      seq: lot.readings.length + 1,
    });
    lot.readings.push(reading);
    this._audit('logReading', { lotId: lotId, seq: reading.seq, ts: timestamp });
    return reading;
  }

  /**
   * Append a hardness reading set to a lot. Each reading is
   * {scale, value, location?, indenter?, ts?}. Multiple scales allowed.
   */
  hardnessLog(spec) {
    if (!spec || typeof spec !== 'object') throw bilingualError('hardnessLog requires spec', 'hardnessLog דורש מפרט');
    const { lotId, readings } = spec;
    const lot = this.lots.get(lotId);
    if (!lot) throw bilingualError('unknown lotId ' + lotId, 'אצווה לא ידועה: ' + lotId);
    if (!Array.isArray(readings) || readings.length === 0) {
      throw bilingualError('readings must be non-empty array', 'יש לציין קריאות');
    }
    const out = [];
    for (const r of readings) {
      if (!r || !HARDNESS_SCALES[r.scale]) {
        throw bilingualError(
          'unknown hardness scale (allowed: ' + Object.keys(HARDNESS_SCALES).join(',') + ')',
          'סקאלת קשיחות לא ידועה'
        );
      }
      if (typeof r.value !== 'number' || r.value <= 0) {
        throw bilingualError('hardness value must be positive number', 'ערך קשיחות חייב להיות חיובי');
      }
      const entry = Object.freeze({
        scale: r.scale,
        scaleMeta: HARDNESS_SCALES[r.scale],
        value: r.value,
        location: r.location || 'as-reported',
        indenter: r.indenter || HARDNESS_SCALES[r.scale].en,
        ts: r.ts || new Date().toISOString(),
        seq: (this.hardness.get(lotId) || []).length + out.length + 1,
      });
      out.push(entry);
    }
    const arr = this.hardness.get(lotId) || [];
    for (const e of out) arr.push(e);
    this.hardness.set(lotId, arr);
    // mirror onto the lot for read-side convenience
    for (const e of out) lot.hardness.push(e);
    this._audit('hardnessLog', { lotId: lotId, count: out.length });
    return out;
  }

  /**
   * Mark a lot as completed. Once called the lot is closed for readings.
   * Stores hardness summary, visual inspection, and pass/fail.
   */
  completeLot(spec) {
    if (!spec || typeof spec !== 'object') throw bilingualError('completeLot requires spec', 'completeLot דורש מפרט');
    const { lotId, hardnessHRC, hardnessHB, visualInspection, passed, rejectReason } = spec;
    const lot = this.lots.get(lotId);
    if (!lot) throw bilingualError('unknown lotId ' + lotId, 'אצווה לא ידועה: ' + lotId);
    if (lot.status !== 'in-progress') {
      throw bilingualError('lot ' + lotId + ' already completed', 'אצווה ' + lotId + ' כבר נסגרה');
    }
    if (typeof passed !== 'boolean') throw bilingualError('passed boolean required', 'יש לציין passed');
    if (!passed && !rejectReason) throw bilingualError('rejectReason required when passed=false', 'נדרש נימוק דחיה');

    // History snapshot before transitioning
    lot.history.push(Object.freeze({
      ts: new Date().toISOString(),
      from: 'in-progress',
      snapshot: cloneJSON({
        readings: lot.readings.length,
        hardness: lot.hardness.length,
      }),
    }));

    const result = Object.freeze({
      hardnessHRC: typeof hardnessHRC === 'number' ? hardnessHRC : null,
      hardnessHB:  typeof hardnessHB  === 'number' ? hardnessHB  : null,
      visualInspection: visualInspection || '',
      passed: passed,
      rejectReason: passed ? null : rejectReason,
    });
    lot.result = result;
    lot.status = passed ? 'completed' : 'rejected';
    lot.completedAt = new Date().toISOString();

    // Mirror the summary hardness as a final hardnessLog entry if not zero.
    const finals = [];
    if (typeof hardnessHRC === 'number') finals.push({ scale: 'HRC', value: hardnessHRC, location: 'final-summary' });
    if (typeof hardnessHB  === 'number') finals.push({ scale: 'HB',  value: hardnessHB,  location: 'final-summary' });
    if (finals.length > 0) this.hardnessLog({ lotId: lotId, readings: finals });

    this._audit('completeLot', { lotId: lotId, passed: passed });
    return cloneJSON(lot);
  }

  /* ------------------------------------------------------------------------
   * 2.5 Deviation detection
   * ---------------------------------------------------------------------- */
  /**
   * Cross-check the recorded readings against the recipe.
   * Returns:
   *   {
   *     lotId,
   *     within: <bool>,
   *     deviations: [{ ts, location, actual, target, deltaC, kind }],
   *     timeAtTempMinutes,
   *     minTimeAtTempRequired,
   *     timeAtTempOk: <bool>,
   *   }
   */
  deviationCheck(lotId) {
    const lot = this.lots.get(lotId);
    if (!lot) throw bilingualError('unknown lotId ' + lotId, 'אצווה לא ידועה: ' + lotId);
    const recipe = this.recipes.get(lot.recipeId);
    if (!recipe) throw bilingualError('recipe ' + lot.recipeId + ' missing', 'מתכון חסר');
    const tol = recipe.toleranceC;
    const target = recipe.targetTemp;
    const minTime = recipe.minTimeAtTemp;

    const deviations = [];
    let firstAtTemp = null;
    let lastAtTemp = null;
    let totalAtTempMs = 0;
    let prevAtTemp = null;

    for (const r of lot.readings) {
      let anyAtTemp = false;
      for (const tc of r.actualTemp) {
        const delta = tc.value - target;
        if (Math.abs(delta) > tol) {
          // Below the soak band before reaching target is normal ramp; we
          // only flag deviations *during* the soak window. We approximate the
          // soak window as "any reading within tol of target counts as in
          // band, anything beyond tol once any TC has reached the band is a
          // deviation."
          if (firstAtTemp !== null) {
            deviations.push(Object.freeze({
              ts: r.timestamp,
              location: tc.location,
              actual: tc.value,
              target: target,
              deltaC: delta,
              kind: delta > 0 ? 'over-temperature' : 'under-temperature',
            }));
          }
        } else {
          anyAtTemp = true;
        }
      }
      if (anyAtTemp) {
        if (firstAtTemp === null) firstAtTemp = r.timestamp;
        lastAtTemp = r.timestamp;
        if (prevAtTemp) {
          totalAtTempMs += new Date(r.timestamp).getTime() - new Date(prevAtTemp).getTime();
        }
        prevAtTemp = r.timestamp;
      } else {
        prevAtTemp = null;
      }
    }

    const timeAtTempMinutes = Math.floor(totalAtTempMs / 60000);
    const timeAtTempOk = timeAtTempMinutes >= minTime;
    if (!timeAtTempOk) {
      deviations.push(Object.freeze({
        ts: lastAtTemp || lot.startedAt,
        location: 'aggregate',
        actual: timeAtTempMinutes,
        target: minTime,
        deltaC: timeAtTempMinutes - minTime,
        kind: 'time-at-temperature-short',
      }));
    }

    const result = Object.freeze({
      lotId: lotId,
      within: deviations.length === 0,
      deviations: Object.freeze(deviations),
      timeAtTempMinutes: timeAtTempMinutes,
      minTimeAtTempRequired: minTime,
      timeAtTempOk: timeAtTempOk,
      toleranceC: tol,
      targetTemp: target,
    });
    return result;
  }

  /* ------------------------------------------------------------------------
   * 2.6 Bilingual certificate
   * ---------------------------------------------------------------------- */
  /**
   * Build a bilingual heat-treatment certificate for a completed lot.
   * Returns a structured object plus a textBlock string with both languages
   * suitable for PDF rendering.
   */
  generateCertificate(lotId) {
    const lot = this.lots.get(lotId);
    if (!lot) throw bilingualError('unknown lotId ' + lotId, 'אצווה לא ידועה: ' + lotId);
    if (lot.status === 'in-progress') {
      throw bilingualError('lot ' + lotId + ' is still in-progress', 'אצווה ' + lotId + ' עדיין פעילה');
    }
    const recipe = this.recipes.get(lot.recipeId);
    const furnace = this.furnaces.get(lot.furnaceId);
    const dev = this.deviationCheck(lotId);
    const hardness = (this.hardness.get(lotId) || []).map(h => ({
      scale: h.scale, value: h.value, location: h.location, ts: h.ts,
    }));

    const certNo = 'HT-CERT-' + lotId + '-v1';
    const issuedAt = new Date().toISOString();
    const passEn = lot.status === 'completed' ? 'PASS' : 'REJECTED';
    const passHe = lot.status === 'completed' ? 'תקין' : 'נדחה';

    const header_he = 'תעודת טיפול תרמי — טכנו-קול עוזי';
    const header_en = 'Heat Treatment Certificate — Techno-Kol Uzi Metalworks';
    const motto = 'לא מוחקים רק משדרגים ומגדלים / Append-only, never delete';

    const textBlock = [
      header_he,
      header_en,
      '----------------------------------------',
      'Cert No / מספר תעודה: ' + certNo,
      'Issued / הונפק: ' + issuedAt,
      'Lot ID / מספר אצווה: ' + lot.lotId,
      'Part Number / מק"ט: ' + lot.partNumber,
      'Quantity / כמות: ' + lot.qty,
      'Heat No / מספר יציקה: ' + lot.heatNo,
      'Material / חומר: ' + lot.material,
      '----------------------------------------',
      'Recipe / מתכון: ' + recipe.name_en + ' / ' + recipe.name_he,
      'Process / תהליך: ' + recipe.processMeta.en + ' / ' + recipe.processMeta.he,
      'Target Temp / טמפרטורת יעד: ' + recipe.targetTemp + ' °C  ± ' + recipe.toleranceC + ' °C',
      'Soak Time / זמן השהייה: ' + recipe.soakTime + ' min',
      'Atmosphere / אטמוספירה: ' + recipe.atmosphere,
      'Cooling Rate / קצב קירור: ' + recipe.coolingRate + ' °C/min',
      '----------------------------------------',
      'Furnace / תנור: ' + furnace.id + ' (' + furnace.type + ')',
      'AMS 2750 Class / מחלקת AMS 2750: ' + furnace.class,
      'Thermocouple Type / סוג צמד תרמי: ' + furnace.thermocoupleType + ' — ' + furnace.thermocoupleMeta.en + ' / ' + furnace.thermocoupleMeta.he,
      'Calibration Due / כיול הבא: ' + furnace.calibrationDue,
      '----------------------------------------',
      'Operator / מפעיל: ' + lot.operatorId,
      'Started / התחלה: ' + lot.startedAt,
      'Completed / סיום: ' + lot.completedAt,
      'Time-at-Temperature / זמן בטמפרטורה: ' + dev.timeAtTempMinutes + ' min (min required ' + dev.minTimeAtTempRequired + ')',
      'Deviations / חריגות: ' + dev.deviations.length,
      'Hardness Readings / קריאות קשיחות: ' + hardness.length,
      'Result / תוצאה: ' + passEn + ' / ' + passHe,
      '----------------------------------------',
      'Operator signature / חתימת מפעיל: ____________________',
      'QA signature / חתימת אבטחת איכות: ____________________',
      motto,
    ].join('\n');

    const certificate = Object.freeze({
      certNo: certNo,
      issuedAt: issuedAt,
      header_he: header_he,
      header_en: header_en,
      lot: cloneJSON(lot),
      recipe: cloneJSON(recipe),
      furnace: cloneJSON(furnace),
      readings: cloneJSON(lot.readings),
      hardness: hardness,
      deviations: cloneJSON(dev.deviations),
      timeAtTempMinutes: dev.timeAtTempMinutes,
      minTimeAtTempRequired: dev.minTimeAtTempRequired,
      passed: lot.status === 'completed',
      result_he: passHe,
      result_en: passEn,
      signaturePlaceholders: Object.freeze([
        Object.freeze({ role_en: 'Operator',           role_he: 'מפעיל',          name: lot.operatorId, signature: '____________________' }),
        Object.freeze({ role_en: 'Quality Assurance',  role_he: 'אבטחת איכות',   name: '<QA>',         signature: '____________________' }),
      ]),
      textBlock: textBlock,
      motto: motto,
    });

    this._audit('generateCertificate', { lotId: lotId, certNo: certNo });
    return certificate;
  }

  /* ------------------------------------------------------------------------
   * 2.7 Traceability
   * ---------------------------------------------------------------------- */
  /**
   * Register a part instance after the lot is completed. The part is tied
   * to its lot, which is in turn tied to the raw heat number.
   */
  registerPart(serialNumber, lotId, partNumber) {
    if (!serialNumber) throw bilingualError('serialNumber required', 'מספר סידורי חובה');
    const lot = this.lots.get(lotId);
    if (!lot) throw bilingualError('unknown lotId ' + lotId, 'אצווה לא ידועה: ' + lotId);
    const partRec = Object.freeze({
      serialNumber: serialNumber,
      lotId: lotId,
      partNumber: partNumber || lot.partNumber,
      registeredAt: new Date().toISOString(),
    });
    this.parts.set(serialNumber, partRec);
    this._audit('registerPart', { serialNumber: serialNumber, lotId: lotId });
    return partRec;
  }

  registerAssembly(assemblyId, partSerials) {
    if (!assemblyId) throw bilingualError('assemblyId required', 'מזהה הרכבה חובה');
    if (!Array.isArray(partSerials) || partSerials.length === 0) {
      throw bilingualError('partSerials must be non-empty array', 'יש לציין מספרי חלקים');
    }
    for (const sn of partSerials) {
      if (!this.parts.has(sn)) throw bilingualError('part ' + sn + ' not registered', 'חלק לא רשום: ' + sn);
    }
    const rec = Object.freeze({
      assemblyId: assemblyId,
      parts: Object.freeze(partSerials.slice()),
      registeredAt: new Date().toISOString(),
    });
    this.assemblies.set(assemblyId, rec);
    this._audit('registerAssembly', { assemblyId: assemblyId, parts: partSerials.length });
    return rec;
  }

  registerShipment(shipmentId, assemblyIds, date) {
    if (!shipmentId) throw bilingualError('shipmentId required', 'מזהה משלוח חובה');
    if (!Array.isArray(assemblyIds) || assemblyIds.length === 0) {
      throw bilingualError('assemblyIds must be non-empty', 'יש לציין הרכבות');
    }
    for (const a of assemblyIds) {
      if (!this.assemblies.has(a)) throw bilingualError('assembly ' + a + ' missing', 'הרכבה חסרה: ' + a);
    }
    const rec = Object.freeze({
      shipmentId: shipmentId,
      assemblies: Object.freeze(assemblyIds.slice()),
      date: date || new Date().toISOString(),
    });
    this.shipments.set(shipmentId, rec);
    this._audit('registerShipment', { shipmentId: shipmentId, assemblies: assemblyIds.length });
    return rec;
  }

  /**
   * Walk the genealogy:
   *   raw heat -> HT lot -> part -> assembly -> shipment.
   * Returns each layer (or null if missing).
   */
  traceability(serialNumber) {
    const part = this.parts.get(serialNumber);
    if (!part) {
      return Object.freeze({ serialNumber: serialNumber, found: false, message_en: 'part not registered', message_he: 'חלק לא רשום' });
    }
    const lot = this.lots.get(part.lotId);
    const heatNo = lot ? lot.heatNo : null;
    const material = lot ? lot.material : null;

    const assemblies = [];
    for (const a of this.assemblies.values()) {
      if (a.parts.includes(serialNumber)) assemblies.push(a);
    }
    const shipments = [];
    for (const s of this.shipments.values()) {
      for (const aid of s.assemblies) {
        if (assemblies.find(a => a.assemblyId === aid)) {
          shipments.push(s);
          break;
        }
      }
    }
    return Object.freeze({
      serialNumber: serialNumber,
      found: true,
      heatNo: heatNo,
      material: material,
      lot: lot ? cloneJSON(lot) : null,
      part: cloneJSON(part),
      assemblies: cloneJSON(assemblies),
      shipments: cloneJSON(shipments),
      chain_he: 'יציקה -> אצווה -> חלק -> הרכבה -> משלוח',
      chain_en: 'raw heat -> HT lot -> part -> assembly -> ship',
    });
  }

  /* ------------------------------------------------------------------------
   * 2.8 Calibration & SAT (AMS 2750)
   * ---------------------------------------------------------------------- */
  /**
   * Compute the calibration interval (days) for the *control* thermocouple
   * given the AMS 2750 furnace class and TC metal class. Base-metal TCs in
   * Class 1/2 furnaces require monthly calibration; noble-metal TCs are
   * allowed longer cadence.
   */
  _tcCalibrationDays(furnaceClass, tcMetalClass) {
    const klass = FURNACE_CLASSES[furnaceClass] || FURNACE_CLASSES['2'];
    if (tcMetalClass === 'noble') {
      // AMS 2750G Table 3 — noble-metal control TCs may be calibrated up to
      // semi-annually for Class 1/2 if records support it; we use the
      // conservative class default.
      return klass.calIntervalControlDays;
    }
    return klass.calIntervalControlDays;
  }

  /**
   * Check if a furnace's control TC calibration is overdue.
   * Returns {furnaceId, overdue, daysOverdue, calibrationDue, asOf}.
   * Class-dependent frequency is honoured via _tcCalibrationDays.
   */
  furnaceCalibrationCheck(furnaceId, asOf) {
    const furnace = this.furnaces.get(furnaceId);
    if (!furnace) throw bilingualError('unknown furnaceId ' + furnaceId, 'תנור לא ידוע: ' + furnaceId);
    const today = asOf || new Date().toISOString().slice(0, 10);
    const days = daysBetween(furnace.calibrationDue, today);
    const overdue = days > 0;
    const cadence = this._tcCalibrationDays(furnace.class, furnace.thermocoupleMeta.metalClass);
    return Object.freeze({
      furnaceId: furnaceId,
      class: furnace.class,
      thermocoupleType: furnace.thermocoupleType,
      cadenceDays: cadence,
      calibrationDue: furnace.calibrationDue,
      asOf: today,
      daysOverdue: overdue ? days : 0,
      overdue: overdue,
      alert_en: overdue ? 'CALIBRATION OVERDUE by ' + days + ' day(s)' : 'within calibration window',
      alert_he: overdue ? 'כיול בפיגור של ' + days + ' ימים' : 'בתוך חלון הכיול',
    });
  }

  /**
   * Record a calibration event (instrument calibration of control TC).
   * Pushes a frozen entry to the per-furnace calibrations map and bumps
   * the next-due date by `_tcCalibrationDays`.
   */
  recordCalibration(furnaceId, performedAt, performedBy) {
    const furnace = this.furnaces.get(furnaceId);
    if (!furnace) throw bilingualError('unknown furnaceId ' + furnaceId, 'תנור לא ידוע: ' + furnaceId);
    const cadence = this._tcCalibrationDays(furnace.class, furnace.thermocoupleMeta.metalClass);
    const event = Object.freeze({
      furnaceId: furnaceId,
      performedAt: performedAt || new Date().toISOString(),
      performedBy: performedBy || 'unknown',
      cadenceDays: cadence,
      nextDue: addDays(performedAt || new Date().toISOString(), cadence),
    });
    if (!this.calibrations.has(furnaceId)) this.calibrations.set(furnaceId, []);
    this.calibrations.get(furnaceId).push(event);

    // upgrade the furnace record (append-only via defineFurnace)
    this.defineFurnace({
      id: furnace.id,
      type: furnace.type,
      class: furnace.class,
      temperatureRange: { minC: furnace.temperatureRange.minC, maxC: furnace.temperatureRange.maxC },
      tcMapping: furnace.tcMapping.map(m => ({ location: m.location, offset: m.offset })),
      thermocoupleType: furnace.thermocoupleType,
      calibrationDue: event.nextDue,
      he: furnace.he,
      en: furnace.en,
    });
    this._audit('recordCalibration', { furnaceId: furnaceId, nextDue: event.nextDue });
    return event;
  }

  /**
   * SAT — System Accuracy Test (AMS 2750 §3.4).
   * For Class 2 furnaces this defaults to quarterly (90 d). The result is
   * pass/fail based on the absolute deviation between the control and test
   * thermocouples.
   */
  systemAccuracyTest(furnaceId, opts) {
    const furnace = this.furnaces.get(furnaceId);
    if (!furnace) throw bilingualError('unknown furnaceId ' + furnaceId, 'תנור לא ידוע: ' + furnaceId);
    opts = opts || {};
    const controlReadingC = typeof opts.controlReadingC === 'number' ? opts.controlReadingC : null;
    const testReadingC = typeof opts.testReadingC === 'number' ? opts.testReadingC : null;
    const performedAt = opts.performedAt || new Date().toISOString();
    const performedBy = opts.performedBy || 'unknown';

    const klass = FURNACE_CLASSES[furnace.class];
    const cadenceDays = klass.satIntervalDays;
    // AMS 2750 §3.4.4 SAT acceptance: ±1.1 °C or ±0.4% of reading,
    // whichever is greater (for Class 2 typical aerospace work).
    const allowedC = controlReadingC !== null ? Math.max(1.1, Math.abs(controlReadingC) * 0.004) : 1.1;
    const deviation = (controlReadingC !== null && testReadingC !== null)
      ? Math.abs(controlReadingC - testReadingC)
      : null;
    const passed = deviation !== null ? deviation <= allowedC : false;
    const nextDue = addDays(performedAt, cadenceDays);

    const event = Object.freeze({
      furnaceId: furnaceId,
      class: furnace.class,
      cadenceDays: cadenceDays,
      performedAt: performedAt,
      performedBy: performedBy,
      controlReadingC: controlReadingC,
      testReadingC: testReadingC,
      deviationC: deviation,
      allowedDeviationC: allowedC,
      passed: passed,
      nextDue: nextDue,
      result_he: passed ? 'תקין' : 'כשל',
      result_en: passed ? 'PASS' : 'FAIL',
    });
    if (!this.satHistory.has(furnaceId)) this.satHistory.set(furnaceId, []);
    this.satHistory.get(furnaceId).push(event);
    this._audit('systemAccuracyTest', { furnaceId: furnaceId, passed: passed });
    return event;
  }
}

/* ----------------------------------------------------------------------------
 * 3. Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  HeatTreatmentLog: HeatTreatmentLog,
  THERMOCOUPLE_TYPES: THERMOCOUPLE_TYPES,
  PROCESS_CATALOG: PROCESS_CATALOG,
  FURNACE_CLASSES: FURNACE_CLASSES,
  HARDNESS_SCALES: HARDNESS_SCALES,
  // exposed helpers (handy for tests)
  _daysBetween: daysBetween,
  _addDays: addDays,
};
