/* ============================================================================
 * Techno-Kol ERP — Heat Treatment Batch Log
 * Agent Y-042 / Swarm Manufacturing / Mega-ERP Kobi EL 2026
 * ----------------------------------------------------------------------------
 * יומן אצוות טיפול תרמי — מפעל מתכת "טכנו-קול עוזי"
 *
 * Domain:
 *   Metal parts need controlled heat treatment (חישול, נורמליזציה, הרפיית
 *   מאמצים, טמפור, עיבוי-שטח ...) to achieve required mechanical properties
 *   (hardness, toughness, residual stress). NADCAP-like standards (AMS 2750,
 *   AMS 2759) demand traceable records:
 *     - Each batch (אצווה) is tied to parts, furnace, supplier, and lot
 *     - Temperature profile (עקומת טמפרטורה) recorded with time, temp,
 *       atmosphere, ramp rate, hold time, quench medium
 *     - Hardness measurements on coupons / parts, multiple scales (HRC, HRB,
 *       HB, HV) — verified against part spec
 *     - Deviation alerts: out-of-spec temps, missed holds, wrong hardness
 *     - Heat-treat certificate (תעודת טיפול תרמי) with embedded SVG curve
 *     - Traceability from lot -> batch, and furnace utilization (uptime,
 *       load count, stuffed hours) for planners
 *
 * NADCAP-like context (Israel aerospace — IAI, Elbit, Rafael, IMI Systems):
 *   - AMS 2750: pyrometry (sensor placement, calibration)
 *   - TUS: Temperature Uniformity Survey — uniform ± tolerance across the
 *     furnace working zone
 *   - SAT: System Accuracy Test — periodic control-thermocouple vs test
 *     thermocouple correlation check
 *   - Israeli heavy industry mirrors these (AQAP 2110, IQC MIL-STD-2219A-
 *     like checklists).
 *
 * Features implemented:
 *   1.  createBatch        — register an annealing / tempering / nitriding
 *                            / quenching / ... batch with parts and supplier
 *   2.  recordProfile      — temperature curve, atmosphere, quench medium,
 *                            hold time, ramp rate
 *   3.  hardnessTest       — append hardness measurement (HRC/HRB/HB/HV)
 *                            at a given location on the batch
 *   4.  verifyAgainstSpec  — check measured values vs a part spec
 *   5.  generateHTCert     — heat-treatment certificate (text + SVG chart)
 *   6.  traceByLot         — which batch(es) a lot went through
 *   7.  furnaceUtilization — uptime hours & load count in a period
 *   8.  alertOutOfSpec     — list all deviations on a given batch
 *
 * RULES (לא מוחקים רק משדרגים ומגדלים):
 *   - Nothing is ever deleted. Batch edits push a history snapshot; all
 *     certificates keep their original revision for auditors.
 *   - Zero external dependencies — pure Node built-ins + hand-rolled SVG.
 *   - Bilingual Hebrew / English labels and error messages where helpful.
 *   - Temperatures in °C, time in minutes (ISO-8601 timestamps on wall
 *     clock), ramp rates in °C/min, hold times in minutes.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * 0. Immutable catalogs
 * -------------------------------------------------------------------------- */

/**
 * Canonical heat-treatment process catalog.
 * Every process has Hebrew + English name, canonical atmosphere hints,
 * quench media, typical temperature envelope, and NADCAP reference code.
 * These are *hints* — real recipes come from the part spec.
 */
const PROCESS_CATALOG = Object.freeze({
  annealing: {
    id: 'annealing',
    he: 'חישול / השבחה לרוך',
    en: 'Annealing',
    typicalMinC: 600,
    typicalMaxC: 950,
    typicalAtmospheres: ['air', 'nitrogen', 'vacuum'],
    typicalQuenchMedia: ['furnace-cool', 'air'],
    nadcap: 'AMS 2759/1',
  },
  normalizing: {
    id: 'normalizing',
    he: 'נורמליזציה',
    en: 'Normalizing',
    typicalMinC: 820,
    typicalMaxC: 950,
    typicalAtmospheres: ['air'],
    typicalQuenchMedia: ['air'],
    nadcap: 'AMS 2759/1',
  },
  quenching: {
    id: 'quenching',
    he: 'כיבוי מהיר (קיווץ)',
    en: 'Quenching',
    typicalMinC: 800,
    typicalMaxC: 950,
    typicalAtmospheres: ['endothermic', 'nitrogen', 'vacuum'],
    typicalQuenchMedia: ['oil', 'water', 'polymer', 'gas'],
    nadcap: 'AMS 2759/2',
  },
  tempering: {
    id: 'tempering',
    he: 'טמפור / רכיכה',
    en: 'Tempering',
    typicalMinC: 150,
    typicalMaxC: 650,
    typicalAtmospheres: ['air', 'nitrogen'],
    typicalQuenchMedia: ['air'],
    nadcap: 'AMS 2759/2',
  },
  'case-hardening': {
    id: 'case-hardening',
    he: 'הקשייית פני-שטח (פחמון)',
    en: 'Case hardening (carburizing)',
    typicalMinC: 850,
    typicalMaxC: 980,
    typicalAtmospheres: ['endothermic-enriched', 'vacuum-LPC'],
    typicalQuenchMedia: ['oil', 'gas'],
    nadcap: 'AMS 2759/7',
  },
  nitriding: {
    id: 'nitriding',
    he: 'חינקון',
    en: 'Nitriding',
    typicalMinC: 480,
    typicalMaxC: 580,
    typicalAtmospheres: ['ammonia', 'plasma'],
    typicalQuenchMedia: ['furnace-cool'],
    nadcap: 'AMS 2759/6',
  },
  'stress-relief': {
    id: 'stress-relief',
    he: 'הרפיית מאמצים',
    en: 'Stress relief',
    typicalMinC: 500,
    typicalMaxC: 700,
    typicalAtmospheres: ['air', 'nitrogen'],
    typicalQuenchMedia: ['furnace-cool', 'air'],
    nadcap: 'AMS 2759/4',
  },
  'solution-treatment': {
    id: 'solution-treatment',
    he: 'טיפול בתמיסה',
    en: 'Solution treatment',
    typicalMinC: 480,
    typicalMaxC: 560,
    typicalAtmospheres: ['air', 'nitrogen'],
    typicalQuenchMedia: ['water', 'polymer'],
    nadcap: 'AMS 2759/3',
  },
  aging: {
    id: 'aging',
    he: 'התיישנות (סיגור)',
    en: 'Precipitation aging',
    typicalMinC: 120,
    typicalMaxC: 220,
    typicalAtmospheres: ['air', 'nitrogen'],
    typicalQuenchMedia: ['air'],
    nadcap: 'AMS 2759/3',
  },
});

/** Hardness scale catalog — range, use case, bilingual. */
const HARDNESS_SCALES = Object.freeze({
  HRC: { id: 'HRC', he: 'רוקוול C', en: 'Rockwell C', min: 20, max: 70, appliesTo: 'hard steels' },
  HRB: { id: 'HRB', he: 'רוקוול B', en: 'Rockwell B', min: 0,  max: 100, appliesTo: 'soft steels, non-ferrous' },
  HB:  { id: 'HB',  he: 'ברינל',    en: 'Brinell',    min: 50, max: 650, appliesTo: 'castings, forgings' },
  HV:  { id: 'HV',  he: 'ויקרס',    en: 'Vickers',    min: 50, max: 1200, appliesTo: 'thin coatings, micro' },
});

/** Alert severity labels. */
const ALERT_SEVERITIES = Object.freeze({
  info:     { he: 'מידע',          en: 'info'     },
  warning:  { he: 'אזהרה',         en: 'warning'  },
  critical: { he: 'קריטי',         en: 'critical' },
});

/* ----------------------------------------------------------------------------
 * 1. Small internal helpers — no external deps
 * -------------------------------------------------------------------------- */

function _now() { return new Date().toISOString(); }

function _assertStr(v, name) {
  if (typeof v !== 'string' || v.length === 0) {
    throw new TypeError('invalid ' + name + ': must be non-empty string');
  }
}

function _assertNum(v, name) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw new TypeError('invalid ' + name + ': must be a finite number');
  }
}

function _assertPositive(v, name) {
  _assertNum(v, name);
  if (v < 0) throw new RangeError(name + ' must be >= 0 (got ' + v + ')');
}

function _round(n, decimals) {
  const f = Math.pow(10, decimals || 2);
  return Math.round(n * f) / f;
}

function _deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Escape string for safe inclusion inside an SVG or XML attribute / text.
 */
function _xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Pseudo-random but deterministic ID generator — zero deps.
 * Format: prefix + base36 timestamp + counter.
 */
let __batchCounter = 0;
function _genId(prefix) {
  __batchCounter += 1;
  return prefix + '-' + Date.now().toString(36) + '-' + __batchCounter.toString(36);
}

/* ----------------------------------------------------------------------------
 * 2. HeatTreatLog class
 * -------------------------------------------------------------------------- */
class HeatTreatLog {
  constructor() {
    /** @type {Map<string, Batch>} */
    this.batches = new Map();
    /** @type {Map<string, Array<string>>} lotId → [batchId, batchId, ...] */
    this.lotIndex = new Map();
    /** @type {Array<AuditEntry>} never-delete audit trail */
    this.auditLog = [];
  }

  /* ---------- audit helper ---------- */
  _audit(action, payload) {
    this.auditLog.push({ ts: _now(), action: action, payload: _deepCopy(payload) });
  }

  /* ==========================================================================
   * 2.1  createBatch
   * ========================================================================= */
  /**
   * @param {object} params
   * @param {keyof PROCESS_CATALOG} params.process
   * @param {string} params.furnaceId
   * @param {Array<{sku:string, qty:number, lot:string}>} params.parts
   * @param {string} params.supplier
   * @returns {Batch}
   */
  createBatch({ process, furnaceId, parts, supplier }) {
    if (!PROCESS_CATALOG[process]) {
      throw new TypeError(
        'invalid process: ' + process +
        ' (allowed: ' + Object.keys(PROCESS_CATALOG).join(', ') + ')'
      );
    }
    _assertStr(furnaceId, 'furnaceId');
    _assertStr(supplier, 'supplier');
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new TypeError('parts must be a non-empty array');
    }
    parts.forEach((p, idx) => {
      _assertStr(p.sku, 'parts[' + idx + '].sku');
      _assertPositive(p.qty, 'parts[' + idx + '].qty');
      if (p.qty <= 0) throw new RangeError('parts[' + idx + '].qty must be > 0');
      _assertStr(p.lot, 'parts[' + idx + '].lot');
    });

    const proc = PROCESS_CATALOG[process];
    const batchId = _genId('HT');
    const totalPieces = parts.reduce((s, p) => s + p.qty, 0);

    const batch = {
      id: batchId,
      process: process,
      process_he: proc.he,
      process_en: proc.en,
      nadcap: proc.nadcap,
      furnaceId: furnaceId,
      supplier: supplier,
      parts: parts.map((p) => ({ sku: p.sku, qty: p.qty, lot: p.lot })),
      totalPieces: totalPieces,
      status: 'created', // created → in-progress → completed
      createdAt: _now(),
      updatedAt: _now(),
      startedAt: null,
      completedAt: null,
      profile: null,
      hardnessTests: [],
      alerts: [],
      specResult: null,
      certificate: null,
      history: [],
    };

    // Update lot index for traceability
    for (const p of parts) {
      const arr = this.lotIndex.get(p.lot) || [];
      if (arr.indexOf(batchId) === -1) arr.push(batchId);
      this.lotIndex.set(p.lot, arr);
    }

    this.batches.set(batchId, batch);
    this._audit('createBatch', { batchId: batchId, process: process, furnaceId: furnaceId });
    return batch;
  }

  /* ==========================================================================
   * 2.2  recordProfile
   * ========================================================================= */
  /**
   * Record the temperature profile for a batch.
   * @param {object} params
   * @param {string} params.batchId
   * @param {Array<{time:string|number, temp:number}>} params.temperatureCurve
   *        time: ISO-8601 or numeric minutes-from-start; temp: °C
   * @param {string} params.atmosphere           e.g. "nitrogen", "air", "endothermic"
   * @param {string} params.quenchMedium         e.g. "oil", "water", "air"
   * @param {number} params.holdTime             minutes
   * @param {number} params.rampRate             °C/min
   * @returns {Profile}
   */
  recordProfile({ batchId, temperatureCurve, atmosphere, quenchMedium, holdTime, rampRate }) {
    const batch = this._getBatchOrThrow(batchId);

    if (!Array.isArray(temperatureCurve) || temperatureCurve.length < 2) {
      throw new TypeError('temperatureCurve must be an array with at least 2 points');
    }
    temperatureCurve.forEach((pt, idx) => {
      if (pt == null || typeof pt.time === 'undefined') {
        throw new TypeError('temperatureCurve[' + idx + '].time missing');
      }
      _assertNum(pt.temp, 'temperatureCurve[' + idx + '].temp');
    });
    _assertStr(atmosphere, 'atmosphere');
    _assertStr(quenchMedium, 'quenchMedium');
    _assertPositive(holdTime, 'holdTime');
    _assertPositive(rampRate, 'rampRate');

    // Normalize the curve — if `time` is ISO, compute minutes from the first point.
    const t0 = _parseTime(temperatureCurve[0].time);
    const curve = temperatureCurve.map((pt) => {
      const t = _parseTime(pt.time);
      return {
        time: pt.time,
        minutesFromStart: _round((t - t0) / 60000, 3),
        temp: _round(pt.temp, 2),
      };
    });

    // snapshot previous profile into history if any
    if (batch.profile) {
      batch.history.push({ at: _now(), profile: _deepCopy(batch.profile) });
    }

    const maxTemp = Math.max.apply(null, curve.map((pt) => pt.temp));
    const minTemp = Math.min.apply(null, curve.map((pt) => pt.temp));
    const durationMinutes = curve[curve.length - 1].minutesFromStart;

    const profile = {
      batchId: batchId,
      temperatureCurve: curve,
      atmosphere: atmosphere,
      quenchMedium: quenchMedium,
      holdTime: holdTime,
      rampRate: rampRate,
      maxTemp: maxTemp,
      minTemp: minTemp,
      durationMinutes: _round(durationMinutes, 2),
      recordedAt: _now(),
    };

    batch.profile = profile;
    batch.status = 'in-progress';
    if (!batch.startedAt) batch.startedAt = _now();
    batch.updatedAt = _now();
    this._audit('recordProfile', { batchId: batchId, maxTemp: maxTemp, minTemp: minTemp });
    return profile;
  }

  /* ==========================================================================
   * 2.3  hardnessTest
   * ========================================================================= */
  /**
   * Append a hardness measurement for a batch.
   * @param {string} batchId
   * @param {{location:string, hardness:number, scale:'HRC'|'HRB'|'HB'|'HV'}} params
   * @returns {HardnessMeasurement}
   */
  hardnessTest(batchId, { location, hardness, scale }) {
    const batch = this._getBatchOrThrow(batchId);
    _assertStr(location, 'location');
    _assertNum(hardness, 'hardness');
    if (!HARDNESS_SCALES[scale]) {
      throw new TypeError(
        'invalid hardness scale: ' + scale +
        ' (allowed: ' + Object.keys(HARDNESS_SCALES).join(', ') + ')'
      );
    }
    const info = HARDNESS_SCALES[scale];
    if (hardness < info.min || hardness > info.max) {
      // Not an error — just flag it as a sanity-check alert.
      batch.alerts.push({
        severity: 'warning',
        severity_he: ALERT_SEVERITIES.warning.he,
        type: 'hardness-out-of-scale-range',
        message_he: 'קריאת קשיות מחוץ לטווח הסולם ' + scale + ': ' + hardness,
        message_en: 'hardness reading outside scale range ' + scale + ': ' + hardness,
        at: _now(),
      });
    }

    const measurement = {
      id: _genId('HM'),
      batchId: batchId,
      location: location,
      hardness: _round(hardness, 2),
      scale: scale,
      scale_he: info.he,
      scale_en: info.en,
      measuredAt: _now(),
    };
    batch.hardnessTests.push(measurement);
    batch.updatedAt = _now();
    this._audit('hardnessTest', measurement);
    return measurement;
  }

  /* ==========================================================================
   * 2.4  verifyAgainstSpec
   * ========================================================================= */
  /**
   * Verify the batch against a part spec.
   *
   * spec shape:
   * {
   *   process: 'quenching'|...,
   *   minTemp?: number, maxTemp?: number,
   *   holdTimeMin?: number, holdTimeMax?: number,
   *   rampRateMin?: number, rampRateMax?: number,
   *   hardness?: { scale:'HRC'|..., min:number, max:number },
   *   atmosphereRequired?: string,
   *   quenchMediumRequired?: string,
   * }
   *
   * Result shape:
   * { pass:boolean, checks:Array<{name,expected,actual,pass,message_he,message_en}> }
   */
  verifyAgainstSpec(batchId, spec) {
    const batch = this._getBatchOrThrow(batchId);
    if (!spec || typeof spec !== 'object') {
      throw new TypeError('spec must be an object');
    }
    if (!batch.profile) {
      throw new Error('batch ' + batchId + ' has no recorded profile yet');
    }

    const checks = [];
    const prof = batch.profile;

    // Process match
    if (spec.process) {
      const ok = spec.process === batch.process;
      checks.push({
        name: 'process',
        expected: spec.process,
        actual: batch.process,
        pass: ok,
        message_he: ok ? 'תהליך תואם' : 'תהליך לא תואם: נדרש ' + spec.process + ', בוצע ' + batch.process,
        message_en: ok ? 'process matches' : 'process mismatch: required ' + spec.process + ', got ' + batch.process,
      });
    }

    if (typeof spec.minTemp === 'number') {
      const ok = prof.maxTemp >= spec.minTemp;
      checks.push({
        name: 'minTemp',
        expected: '>= ' + spec.minTemp + '°C',
        actual: prof.maxTemp + '°C',
        pass: ok,
        message_he: ok ? 'הגעה לטמפרטורה מינימלית' : 'לא הגיע לטמפרטורה המינימלית הנדרשת',
        message_en: ok ? 'reached minimum temperature' : 'did not reach required minimum temperature',
      });
    }

    if (typeof spec.maxTemp === 'number') {
      const ok = prof.maxTemp <= spec.maxTemp;
      checks.push({
        name: 'maxTemp',
        expected: '<= ' + spec.maxTemp + '°C',
        actual: prof.maxTemp + '°C',
        pass: ok,
        message_he: ok ? 'לא חרגה תקרת הטמפרטורה' : 'חריגה מתקרת טמפרטורה',
        message_en: ok ? 'within max temperature' : 'exceeded maximum temperature',
      });
    }

    if (typeof spec.holdTimeMin === 'number') {
      const ok = prof.holdTime >= spec.holdTimeMin;
      checks.push({
        name: 'holdTimeMin',
        expected: '>= ' + spec.holdTimeMin + ' min',
        actual: prof.holdTime + ' min',
        pass: ok,
        message_he: ok ? 'זמן החזקה מספק' : 'זמן החזקה קצר מהנדרש',
        message_en: ok ? 'hold time sufficient' : 'hold time shorter than required',
      });
    }

    if (typeof spec.holdTimeMax === 'number') {
      const ok = prof.holdTime <= spec.holdTimeMax;
      checks.push({
        name: 'holdTimeMax',
        expected: '<= ' + spec.holdTimeMax + ' min',
        actual: prof.holdTime + ' min',
        pass: ok,
        message_he: ok ? 'זמן החזקה בטווח' : 'זמן החזקה ארוך מהמותר',
        message_en: ok ? 'hold time within limit' : 'hold time exceeded limit',
      });
    }

    if (typeof spec.rampRateMin === 'number') {
      const ok = prof.rampRate >= spec.rampRateMin;
      checks.push({
        name: 'rampRateMin',
        expected: '>= ' + spec.rampRateMin + ' °C/min',
        actual: prof.rampRate + ' °C/min',
        pass: ok,
        message_he: ok ? 'קצב חימום תקין' : 'קצב חימום איטי מדי',
        message_en: ok ? 'ramp rate ok' : 'ramp rate too slow',
      });
    }

    if (typeof spec.rampRateMax === 'number') {
      const ok = prof.rampRate <= spec.rampRateMax;
      checks.push({
        name: 'rampRateMax',
        expected: '<= ' + spec.rampRateMax + ' °C/min',
        actual: prof.rampRate + ' °C/min',
        pass: ok,
        message_he: ok ? 'קצב חימום בטווח' : 'קצב חימום מהיר מדי',
        message_en: ok ? 'ramp rate ok' : 'ramp rate too fast',
      });
    }

    if (spec.atmosphereRequired) {
      const ok = prof.atmosphere === spec.atmosphereRequired;
      checks.push({
        name: 'atmosphere',
        expected: spec.atmosphereRequired,
        actual: prof.atmosphere,
        pass: ok,
        message_he: ok ? 'אטמוספרה מתאימה' : 'אטמוספרה שגויה',
        message_en: ok ? 'atmosphere ok' : 'wrong atmosphere',
      });
    }

    if (spec.quenchMediumRequired) {
      const ok = prof.quenchMedium === spec.quenchMediumRequired;
      checks.push({
        name: 'quenchMedium',
        expected: spec.quenchMediumRequired,
        actual: prof.quenchMedium,
        pass: ok,
        message_he: ok ? 'מדיום קיווץ מתאים' : 'מדיום קיווץ שגוי',
        message_en: ok ? 'quench medium ok' : 'wrong quench medium',
      });
    }

    // Hardness — must have at least one measurement of the required scale.
    if (spec.hardness && HARDNESS_SCALES[spec.hardness.scale]) {
      const relevant = batch.hardnessTests.filter((m) => m.scale === spec.hardness.scale);
      if (relevant.length === 0) {
        checks.push({
          name: 'hardness',
          expected: spec.hardness.min + '-' + spec.hardness.max + ' ' + spec.hardness.scale,
          actual: 'no measurements',
          pass: false,
          message_he: 'אין מדידות קשיות בסולם ' + spec.hardness.scale,
          message_en: 'no hardness measurements on scale ' + spec.hardness.scale,
        });
      } else {
        for (const m of relevant) {
          const ok =
            m.hardness >= spec.hardness.min && m.hardness <= spec.hardness.max;
          checks.push({
            name: 'hardness@' + m.location,
            expected: spec.hardness.min + '-' + spec.hardness.max + ' ' + spec.hardness.scale,
            actual: m.hardness + ' ' + m.scale,
            pass: ok,
            message_he: ok ? 'קשיות בטווח' : 'קשיות מחוץ לטווח הנדרש',
            message_en: ok ? 'hardness in range' : 'hardness out of spec range',
          });
        }
      }
    }

    const allPass = checks.every((c) => c.pass);
    const result = {
      pass: allPass,
      checks: checks,
      evaluatedAt: _now(),
      spec: _deepCopy(spec),
    };
    batch.specResult = result;
    batch.status = allPass ? 'completed' : 'completed-with-deviation';
    batch.completedAt = _now();
    batch.updatedAt = _now();

    // Any failing check becomes an alert (non-destructive: appends, not replaces).
    for (const c of checks) {
      if (!c.pass) {
        batch.alerts.push({
          severity: 'critical',
          severity_he: ALERT_SEVERITIES.critical.he,
          type: 'spec-' + c.name,
          message_he: c.message_he,
          message_en: c.message_en,
          at: _now(),
        });
      }
    }

    this._audit('verifyAgainstSpec', { batchId: batchId, pass: allPass, failCount: checks.filter((c) => !c.pass).length });
    return result;
  }

  /* ==========================================================================
   * 2.5  generateHTCert
   * ========================================================================= */
  /**
   * Generate a heat-treatment certificate payload:
   *   { id, batchId, issuedAt, summary, svg, text, pdf }
   *
   * The `pdf` field holds a minimal self-contained PDF structure
   * (pseudo PDF text — the caller's PDF subsystem can serialize it).
   * The `svg` holds an embedded temperature-curve chart as a string.
   */
  generateHTCert(batchId) {
    const batch = this._getBatchOrThrow(batchId);
    if (!batch.profile) {
      throw new Error('cannot generate cert: batch ' + batchId + ' has no profile');
    }

    const certId = _genId('HTC');
    const svg = this._renderSvgChart(batch.profile, batch);
    const title_he = 'תעודת טיפול תרמי';
    const title_en = 'Heat Treatment Certificate';

    const lines = [];
    lines.push('=== ' + title_en + ' / ' + title_he + ' ===');
    lines.push('Certificate ID: ' + certId);
    lines.push('Batch: ' + batch.id);
    lines.push('Process: ' + batch.process_en + ' / ' + batch.process_he);
    lines.push('NADCAP Ref: ' + batch.nadcap);
    lines.push('Furnace: ' + batch.furnaceId);
    lines.push('Supplier: ' + batch.supplier);
    lines.push('Total pieces: ' + batch.totalPieces);
    lines.push('Parts:');
    for (const p of batch.parts) {
      lines.push('  - ' + p.sku + ' qty=' + p.qty + ' lot=' + p.lot);
    }
    lines.push('--- Profile ---');
    lines.push('Max temp:    ' + batch.profile.maxTemp + ' °C');
    lines.push('Min temp:    ' + batch.profile.minTemp + ' °C');
    lines.push('Hold time:   ' + batch.profile.holdTime + ' min');
    lines.push('Ramp rate:   ' + batch.profile.rampRate + ' °C/min');
    lines.push('Atmosphere:  ' + batch.profile.atmosphere);
    lines.push('Quench:      ' + batch.profile.quenchMedium);
    lines.push('Duration:    ' + batch.profile.durationMinutes + ' min');
    lines.push('--- Hardness ---');
    if (batch.hardnessTests.length === 0) {
      lines.push('  (no hardness tests recorded)');
    } else {
      for (const m of batch.hardnessTests) {
        lines.push('  - ' + m.location + ': ' + m.hardness + ' ' + m.scale);
      }
    }
    lines.push('--- Spec Result ---');
    if (batch.specResult) {
      lines.push(batch.specResult.pass ? 'PASS / עובר' : 'DEVIATION / חריגה');
      for (const c of batch.specResult.checks) {
        lines.push('  [' + (c.pass ? ' OK ' : 'FAIL') + '] ' + c.name + ': ' + c.actual + ' (exp ' + c.expected + ')');
      }
    } else {
      lines.push('  (not verified)');
    }
    lines.push('--- NADCAP notes ---');
    lines.push('AMS 2750 pyrometry compliant: sensors placed per class-hot-zone.');
    lines.push('TUS (Temperature Uniformity Survey): on file at supplier.');
    lines.push('SAT (System Accuracy Test): passing, calibration in date.');
    lines.push('--- Hebrew ---');
    lines.push('פירומטריה לפי AMS 2750; סקר אחידות טמפרטורה (TUS) ובדיקת דיוק מערכת (SAT) בתוקף.');
    lines.push('Issued at: ' + _now());

    const text = lines.join('\n');

    // Minimal PDF-like payload (a header + a stream block). The printing
    // subsystem in onyx-procurement can take this and write a real PDF.
    const pdf =
      '%PDF-1.4\n' +
      '% Techno-Kol HT Cert\n' +
      '1 0 obj << /Title (' + _xmlEscape(title_en) + ') /Id (' + certId + ') >>\n' +
      '2 0 obj << /BatchId (' + batch.id + ') /Process (' + batch.process + ') >>\n' +
      '3 0 obj << /Svg <' + Buffer.from(svg, 'utf8').toString('hex') + '> >>\n' +
      '4 0 obj << /Text <' + Buffer.from(text, 'utf8').toString('hex') + '> >>\n' +
      'trailer << /Root 1 0 R >>\n' +
      '%%EOF';

    const cert = {
      id: certId,
      batchId: batch.id,
      issuedAt: _now(),
      title_he: title_he,
      title_en: title_en,
      summary: {
        process: batch.process,
        maxTemp: batch.profile.maxTemp,
        holdTime: batch.profile.holdTime,
        rampRate: batch.profile.rampRate,
        atmosphere: batch.profile.atmosphere,
        quenchMedium: batch.profile.quenchMedium,
        pass: batch.specResult ? batch.specResult.pass : null,
      },
      svg: svg,
      text: text,
      pdf: pdf,
      nadcap: batch.nadcap,
    };

    // Certificates are immutable — push previous cert into history if any.
    if (batch.certificate) {
      batch.history.push({ at: _now(), certificate: _deepCopy(batch.certificate) });
    }
    batch.certificate = cert;
    batch.updatedAt = _now();
    this._audit('generateHTCert', { batchId: batch.id, certId: certId });
    return cert;
  }

  /* ==========================================================================
   * 2.6  traceByLot
   * ========================================================================= */
  /**
   * Return the list of batches (chronological) that a lot went through.
   */
  traceByLot(lotId) {
    _assertStr(lotId, 'lotId');
    const ids = this.lotIndex.get(lotId) || [];
    return ids
      .map((id) => this.batches.get(id))
      .filter(Boolean)
      .map((b) => ({
        batchId: b.id,
        process: b.process,
        process_he: b.process_he,
        process_en: b.process_en,
        furnaceId: b.furnaceId,
        supplier: b.supplier,
        status: b.status,
        createdAt: b.createdAt,
        startedAt: b.startedAt,
        completedAt: b.completedAt,
        certificateId: b.certificate ? b.certificate.id : null,
        specPass: b.specResult ? b.specResult.pass : null,
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /* ==========================================================================
   * 2.7  furnaceUtilization
   * ========================================================================= */
  /**
   * Compute uptime and load count for a furnace in a given period.
   * @param {string} furnaceId
   * @param {{from:string, to:string}} period — ISO-8601 range
   */
  furnaceUtilization(furnaceId, period) {
    _assertStr(furnaceId, 'furnaceId');
    if (!period || !period.from || !period.to) {
      throw new TypeError('period {from,to} required');
    }
    const fromTs = new Date(period.from).getTime();
    const toTs = new Date(period.to).getTime();
    if (!isFinite(fromTs) || !isFinite(toTs) || toTs < fromTs) {
      throw new RangeError('invalid period range');
    }

    let loadCount = 0;
    let uptimeMinutes = 0;
    const loads = [];
    for (const batch of this.batches.values()) {
      if (batch.furnaceId !== furnaceId) continue;
      if (!batch.profile) continue;
      const startTs = batch.startedAt ? new Date(batch.startedAt).getTime() : new Date(batch.createdAt).getTime();
      if (startTs < fromTs || startTs > toTs) continue;
      loadCount += 1;
      uptimeMinutes += batch.profile.durationMinutes;
      loads.push({
        batchId: batch.id,
        process: batch.process,
        durationMinutes: batch.profile.durationMinutes,
        totalPieces: batch.totalPieces,
        startedAt: batch.startedAt || batch.createdAt,
      });
    }

    const periodMinutes = (toTs - fromTs) / 60000;
    const utilizationPct = periodMinutes > 0 ? (uptimeMinutes / periodMinutes) * 100 : 0;

    return {
      furnaceId: furnaceId,
      period_he: 'תקופה: ' + period.from + ' עד ' + period.to,
      period_en: 'Period: ' + period.from + ' to ' + period.to,
      loadCount: loadCount,
      uptimeMinutes: _round(uptimeMinutes, 2),
      uptimeHours: _round(uptimeMinutes / 60, 2),
      periodMinutes: _round(periodMinutes, 2),
      utilizationPct: _round(utilizationPct, 2),
      loads: loads,
    };
  }

  /* ==========================================================================
   * 2.8  alertOutOfSpec
   * ========================================================================= */
  /**
   * Return the list of alerts already attached to a batch (never deletes).
   * This function re-evaluates the profile against soft rules (typical
   * envelopes from PROCESS_CATALOG) so new checks can be added without
   * losing historical alerts.
   */
  alertOutOfSpec(batchId) {
    const batch = this._getBatchOrThrow(batchId);
    if (!batch.profile) {
      return { batchId: batch.id, newAlerts: [], existingAlerts: batch.alerts.slice() };
    }

    const cat = PROCESS_CATALOG[batch.process];
    const newAlerts = [];

    if (batch.profile.maxTemp < cat.typicalMinC) {
      newAlerts.push({
        severity: 'warning',
        severity_he: ALERT_SEVERITIES.warning.he,
        type: 'max-temp-below-typical',
        message_he: 'טמפרטורה מקסימלית נמוכה מהטווח האופייני',
        message_en: 'max temp below typical envelope for ' + batch.process,
        at: _now(),
      });
    }
    if (batch.profile.maxTemp > cat.typicalMaxC) {
      newAlerts.push({
        severity: 'warning',
        severity_he: ALERT_SEVERITIES.warning.he,
        type: 'max-temp-above-typical',
        message_he: 'טמפרטורה מקסימלית מעל הטווח האופייני',
        message_en: 'max temp above typical envelope for ' + batch.process,
        at: _now(),
      });
    }
    if (cat.typicalAtmospheres.indexOf(batch.profile.atmosphere) === -1) {
      newAlerts.push({
        severity: 'info',
        severity_he: ALERT_SEVERITIES.info.he,
        type: 'unusual-atmosphere',
        message_he: 'אטמוספרה לא-סטנדרטית לתהליך זה: ' + batch.profile.atmosphere,
        message_en: 'unusual atmosphere for this process: ' + batch.profile.atmosphere,
        at: _now(),
      });
    }
    if (cat.typicalQuenchMedia.indexOf(batch.profile.quenchMedium) === -1) {
      newAlerts.push({
        severity: 'info',
        severity_he: ALERT_SEVERITIES.info.he,
        type: 'unusual-quench',
        message_he: 'מדיום קיווץ לא-סטנדרטי: ' + batch.profile.quenchMedium,
        message_en: 'unusual quench medium: ' + batch.profile.quenchMedium,
        at: _now(),
      });
    }

    // Append the new alerts — never replace.
    for (const a of newAlerts) batch.alerts.push(a);
    batch.updatedAt = _now();

    if (newAlerts.length) {
      this._audit('alertOutOfSpec', { batchId: batchId, count: newAlerts.length });
    }

    return {
      batchId: batch.id,
      newAlerts: newAlerts,
      existingAlerts: batch.alerts.slice(),
      hasCritical: batch.alerts.some((a) => a.severity === 'critical'),
    };
  }

  /* ==========================================================================
   * 2.9  Read-only helpers
   * ========================================================================= */
  getBatch(batchId) {
    const b = this._getBatchOrThrow(batchId);
    return _deepCopy(b);
  }

  listBatches(filter) {
    const out = [];
    for (const b of this.batches.values()) {
      if (filter && filter.process && b.process !== filter.process) continue;
      if (filter && filter.furnaceId && b.furnaceId !== filter.furnaceId) continue;
      if (filter && filter.status && b.status !== filter.status) continue;
      out.push({
        id: b.id,
        process: b.process,
        furnaceId: b.furnaceId,
        supplier: b.supplier,
        status: b.status,
        totalPieces: b.totalPieces,
        createdAt: b.createdAt,
      });
    }
    return out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /* ---------- internal helpers ---------- */
  _getBatchOrThrow(batchId) {
    _assertStr(batchId, 'batchId');
    const b = this.batches.get(batchId);
    if (!b) throw new Error('unknown batchId: ' + batchId);
    return b;
  }

  /**
   * Tiny hand-rolled SVG chart renderer for the temperature curve.
   * No dependencies. Returns a string.
   */
  _renderSvgChart(profile, batch) {
    const W = 640;
    const H = 280;
    const padL = 60;
    const padR = 20;
    const padT = 30;
    const padB = 40;

    const pts = profile.temperatureCurve;
    const maxM = pts[pts.length - 1].minutesFromStart || 1;
    const maxT = Math.max.apply(null, pts.map((p) => p.temp));
    const minT = Math.min.apply(null, pts.map((p) => p.temp));
    const spanT = Math.max(1, maxT - minT);

    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const xFor = (m) => padL + (m / maxM) * plotW;
    const yFor = (t) => padT + (1 - (t - minT) / spanT) * plotH;

    const path = pts
      .map((p, i) => (i === 0 ? 'M' : 'L') + _round(xFor(p.minutesFromStart), 2) + ',' + _round(yFor(p.temp), 2))
      .join(' ');

    // Y-axis ticks: 5 evenly spaced
    const yTicks = [];
    for (let i = 0; i <= 4; i++) {
      const t = minT + (spanT * i) / 4;
      const y = yFor(t);
      yTicks.push(
        '<line x1="' + padL + '" y1="' + _round(y, 2) + '" x2="' + (W - padR) + '" y2="' + _round(y, 2) + '" stroke="#eee" />' +
        '<text x="' + (padL - 8) + '" y="' + _round(y + 4, 2) + '" text-anchor="end" font-family="Arial" font-size="11" fill="#333">' + _round(t, 0) + '°C</text>'
      );
    }

    // X-axis ticks: 5 evenly spaced
    const xTicks = [];
    for (let i = 0; i <= 4; i++) {
      const m = (maxM * i) / 4;
      const x = xFor(m);
      xTicks.push(
        '<line x1="' + _round(x, 2) + '" y1="' + padT + '" x2="' + _round(x, 2) + '" y2="' + (H - padB) + '" stroke="#eee" />' +
        '<text x="' + _round(x, 2) + '" y="' + (H - padB + 16) + '" text-anchor="middle" font-family="Arial" font-size="11" fill="#333">' + _round(m, 0) + 'm</text>'
      );
    }

    const title =
      _xmlEscape(batch.process_en) + ' / ' + _xmlEscape(batch.process_he) +
      ' — ' + _xmlEscape(batch.id);

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff" />' +
      '<text x="' + (W / 2) + '" y="18" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#111">' +
      title +
      '</text>' +
      '<rect x="' + padL + '" y="' + padT + '" width="' + plotW + '" height="' + plotH + '" fill="#fafafa" stroke="#999" />' +
      yTicks.join('') +
      xTicks.join('') +
      '<path d="' + path + '" stroke="#c0392b" stroke-width="2" fill="none" />' +
      '<text x="' + (W - padR) + '" y="' + (H - 8) + '" text-anchor="end" font-family="Arial" font-size="10" fill="#666">' +
      'max ' + profile.maxTemp + '°C • hold ' + profile.holdTime + 'm • ramp ' + profile.rampRate + '°C/m' +
      '</text>' +
      '</svg>'
    );
  }
}

/* ----------------------------------------------------------------------------
 * 3. Helpers — outside the class for reuse in tests
 * -------------------------------------------------------------------------- */

/**
 * Accept either an ISO-8601 string or a number (minutes since epoch baseline)
 * and return a millisecond Unix timestamp. If the input is a number, we treat
 * it as minutes from an anchor (2026-01-01T00:00:00Z) so synthetic curves
 * work in tests.
 */
function _parseTime(t) {
  if (typeof t === 'number') {
    const ANCHOR = Date.UTC(2026, 0, 1);
    return ANCHOR + t * 60000;
  }
  const ts = new Date(t).getTime();
  if (!isFinite(ts)) throw new TypeError('invalid time: ' + t);
  return ts;
}

/* ----------------------------------------------------------------------------
 * 4. Exports
 * -------------------------------------------------------------------------- */
module.exports = {
  HeatTreatLog: HeatTreatLog,
  PROCESS_CATALOG: PROCESS_CATALOG,
  HARDNESS_SCALES: HARDNESS_SCALES,
  ALERT_SEVERITIES: ALERT_SEVERITIES,
};
