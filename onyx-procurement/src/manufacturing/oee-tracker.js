/**
 * oee-tracker.js — Overall Equipment Effectiveness tracker (מעקב OEE)
 * Agent Y-035 / Swarm Manufacturing / Techno-Kol Uzi Mega-ERP — Wave 2026
 * ---------------------------------------------------------------------------
 *
 * Tracks Overall Equipment Effectiveness for the Techno-Kol Uzi metal-fab
 * floor (CNC mills, press brakes, laser cutters, painting booths, welding
 * stations). OEE is the gold-standard KPI for manufacturing productivity:
 *
 *     OEE = Availability × Performance × Quality
 *
 *   Availability = Run Time / Planned Production Time
 *                  (how much of the planned time the machine actually ran)
 *
 *   Performance  = (Ideal Cycle Time × Total Count) / Run Time
 *                  (how fast the machine ran vs its design speed)
 *
 *   Quality      = Good Count / Total Count
 *                  (how many good pieces vs total produced)
 *
 * World-class OEE target is **85%** — achieved by only a fraction of plants
 * worldwide (Nakajima, TPM, 1988). Typical discrete-manufacturing OEE sits
 * at 40-60% and "good" is ~75%. We benchmark every machine against 0.85.
 *
 * The module also decomposes losses into the Six Big Losses framework
 * (also Nakajima 1988), mapping each `downtime.reason` code to one of:
 *
 *   Availability losses  → (1) Equipment Failure, (2) Setup & Adjustment
 *   Performance  losses  → (3) Idling & Minor Stops, (4) Reduced Speed
 *   Quality      losses  → (5) Startup Rejects, (6) Production Rejects
 *
 * Every reason code carries a bilingual Hebrew/English label. The six
 * big-loss categories themselves are also bilingual.
 *
 * Rule of the system (לא מוחקים רק משדרגים ומגדלים):
 *   - `recordRun` APPENDS to the in-memory log. Nothing is ever deleted.
 *   - Upgrades may add new reason codes without breaking callers.
 *   - All snapshot methods (`oee`, `sixBigLosses`, `downtimeReasonCodes`,
 *     `worldClassGap`, `generateReport`) are pure reads — zero mutation.
 *
 * Zero external dependencies. Only Node.js built-ins (none actually needed).
 *
 * ---------------------------------------------------------------------------
 * Public API — class `OEETracker`:
 *
 *   new OEETracker({ worldClassOEE = 0.85, alertThreshold = 0.60 } = {})
 *
 *   .recordRun({ machineId, shift, plannedTime, runTime,
 *                downtime: [{ reason, duration }],
 *                piecesProduced, piecesGood, idealCycleTime,
 *                timestamp? })
 *       → run record (frozen)
 *
 *   .oee(machineId, period?)                → rolled-up OEE + breakdown
 *   .sixBigLosses(machineId, period?)       → six-big-losses attribution
 *   .downtimeReasonCodes(machineId?, period?) → Pareto of downtime reasons
 *   .worldClassGap(machineId, period?)      → actualOEE − 0.85 + coaching
 *   .alertLowOEE(threshold?)                → machines below threshold
 *   .generateReport(machineId, period?)     → bilingual report + SVG sparkline
 *
 *   .REASON_CODES                           → frozen bilingual reason dict
 *   .BIG_LOSS_LABELS                        → frozen bilingual big-loss dict
 *   .WORLD_CLASS_OEE                        → 0.85 (Nakajima benchmark)
 *
 * Static re-exports for interop with plain-function callers:
 *   OEETracker.REASON_CODES
 *   OEETracker.BIG_LOSS_LABELS
 *   OEETracker.WORLD_CLASS_OEE
 *
 * ---------------------------------------------------------------------------
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — benchmark & classifications
// ═══════════════════════════════════════════════════════════════════════════

/** World-class OEE benchmark (Nakajima 1988 / JIPM) — 85%. */
const WORLD_CLASS_OEE = 0.85;

/** Default alert threshold below which a machine is flagged. */
const DEFAULT_ALERT_THRESHOLD = 0.60;

/**
 * Six Big Losses (Nakajima) — bilingual HE/EN labels.
 * Keys match the `bigLoss` field of every reason code in REASON_CODES.
 */
const BIG_LOSS_LABELS = Object.freeze({
  equipment_failure: {
    he: 'כשל ציוד / תקלת מכונה',
    en: 'Equipment Failure / Breakdown',
    category: 'availability',
  },
  setup_adjustment: {
    he: 'התאמות ושינויי כלי עבודה',
    en: 'Setup & Adjustment',
    category: 'availability',
  },
  idling_minor_stops: {
    he: 'עצירות קטנות / הרצות חלקיות',
    en: 'Idling & Minor Stops',
    category: 'performance',
  },
  reduced_speed: {
    he: 'מהירות מופחתת',
    en: 'Reduced Speed',
    category: 'performance',
  },
  startup_rejects: {
    he: 'פסולת סטארט-אפ',
    en: 'Startup Rejects',
    category: 'quality',
  },
  production_rejects: {
    he: 'פסולת ייצור שוטפת',
    en: 'Production Rejects',
    category: 'quality',
  },
});

/**
 * Reason codes → Six Big Losses mapping.
 * Every code carries a bilingual HE/EN label.
 *
 * Metal-fab floor codes: laser, CNC, press brake, welding, painting,
 * material handling — tuned for the Techno-Kol Uzi shop floor.
 */
const REASON_CODES = Object.freeze({
  // ─── Equipment Failure (Availability) ───────────────────────────────
  mechanical_breakdown: {
    bigLoss: 'equipment_failure',
    he: 'תקלה מכנית',
    en: 'Mechanical Breakdown',
  },
  electrical_fault: {
    bigLoss: 'equipment_failure',
    he: 'תקלת חשמל',
    en: 'Electrical Fault',
  },
  hydraulic_leak: {
    bigLoss: 'equipment_failure',
    he: 'דליפה הידראולית',
    en: 'Hydraulic Leak',
  },
  controller_crash: {
    bigLoss: 'equipment_failure',
    he: 'קריסת בקר CNC',
    en: 'CNC Controller Crash',
  },
  tool_breakage: {
    bigLoss: 'equipment_failure',
    he: 'שבר כלי חיתוך',
    en: 'Tool Breakage',
  },

  // ─── Setup & Adjustment (Availability) ──────────────────────────────
  setup_changeover: {
    bigLoss: 'setup_adjustment',
    he: 'החלפת סדרה / setup',
    en: 'Setup / Changeover',
  },
  tool_change: {
    bigLoss: 'setup_adjustment',
    he: 'החלפת כלי עבודה',
    en: 'Tool Change',
  },
  material_changeover: {
    bigLoss: 'setup_adjustment',
    he: 'החלפת חומר גלם',
    en: 'Material Changeover',
  },
  fixture_adjustment: {
    bigLoss: 'setup_adjustment',
    he: 'כיוון התקן אחיזה',
    en: 'Fixture Adjustment',
  },
  program_upload: {
    bigLoss: 'setup_adjustment',
    he: 'טעינת תוכנית CNC',
    en: 'CNC Program Upload',
  },

  // ─── Idling & Minor Stops (Performance) ─────────────────────────────
  jammed_part: {
    bigLoss: 'idling_minor_stops',
    he: 'תקיעת חלק',
    en: 'Jammed Part',
  },
  sensor_misread: {
    bigLoss: 'idling_minor_stops',
    he: 'שגיאת חיישן',
    en: 'Sensor Misread',
  },
  operator_break: {
    bigLoss: 'idling_minor_stops',
    he: 'הפסקת מפעיל',
    en: 'Operator Break',
  },
  awaiting_material: {
    bigLoss: 'idling_minor_stops',
    he: 'המתנה לחומר גלם',
    en: 'Awaiting Material',
  },
  awaiting_crane: {
    bigLoss: 'idling_minor_stops',
    he: 'המתנה לעגורן',
    en: 'Awaiting Overhead Crane',
  },

  // ─── Reduced Speed (Performance) ────────────────────────────────────
  slow_feed_rate: {
    bigLoss: 'reduced_speed',
    he: 'קצב הזנה איטי',
    en: 'Slow Feed Rate',
  },
  worn_tooling: {
    bigLoss: 'reduced_speed',
    he: 'כלי עבודה שחוקים',
    en: 'Worn Tooling',
  },
  operator_inefficiency: {
    bigLoss: 'reduced_speed',
    he: 'חוסר יעילות מפעיל',
    en: 'Operator Inefficiency',
  },
  material_hardness: {
    bigLoss: 'reduced_speed',
    he: 'חומר קשה מהתקן',
    en: 'Material Harder Than Spec',
  },

  // ─── Startup Rejects (Quality) ──────────────────────────────────────
  startup_scrap: {
    bigLoss: 'startup_rejects',
    he: 'פסולת הרצה ראשונית',
    en: 'Startup Scrap',
  },
  warmup_rejects: {
    bigLoss: 'startup_rejects',
    he: 'חלקים פגומים בחימום',
    en: 'Warm-Up Rejects',
  },
  first_piece_inspection_fail: {
    bigLoss: 'startup_rejects',
    he: 'כשל בדיקת חלק ראשון',
    en: 'First-Piece Inspection Fail',
  },

  // ─── Production Rejects (Quality) ───────────────────────────────────
  dimension_out_of_tol: {
    bigLoss: 'production_rejects',
    he: 'סטייה ממידה',
    en: 'Dimension Out of Tolerance',
  },
  surface_defect: {
    bigLoss: 'production_rejects',
    he: 'פגם פני שטח',
    en: 'Surface Defect',
  },
  weld_defect: {
    bigLoss: 'production_rejects',
    he: 'פגם ריתוך',
    en: 'Weld Defect',
  },
  paint_defect: {
    bigLoss: 'production_rejects',
    he: 'פגם צביעה',
    en: 'Paint Defect',
  },
  bend_angle_error: {
    bigLoss: 'production_rejects',
    he: 'שגיאת זווית כיפוף',
    en: 'Bend Angle Error',
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — rounding, validation, period filtering
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Round to `digits` decimal places with IEEE-754 drift protection.
 * Used everywhere OEE factors are reported so 0.85 looks like 0.85
 * and not 0.8499999999.
 */
function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Clamp to [0, 1] — OEE factors can never leave this interval. */
function clamp01(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Positive-or-zero — turns NaN/negative into 0. */
function nonNeg(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Validate & normalise a reason code, carrying the bilingual labels.
 * Unknown codes fall into a synthetic "other" code still mapped to
 * production_rejects so we never silently drop losses.
 */
function resolveReason(code) {
  if (typeof code === 'string' && REASON_CODES[code]) {
    return { code, ...REASON_CODES[code] };
  }
  return {
    code: typeof code === 'string' && code ? code : 'unspecified',
    bigLoss: 'equipment_failure',
    he: 'סיבה לא מזוהה',
    en: 'Unspecified Reason',
  };
}

/**
 * Parse a `period` filter. Accepts either:
 *   • { from: Date|string, to: Date|string }     — explicit window
 *   • string shortcut: 'today', 'week', 'month', 'all'
 *   • undefined / null                            — all-time
 */
function parsePeriod(period) {
  if (!period || period === 'all') return { from: -Infinity, to: Infinity };

  if (typeof period === 'string') {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    if (period === 'today') return { from: now - DAY, to: now + DAY };
    if (period === 'week') return { from: now - 7 * DAY, to: now + DAY };
    if (period === 'month') return { from: now - 30 * DAY, to: now + DAY };
    return { from: -Infinity, to: Infinity };
  }

  const from = period.from ? new Date(period.from).getTime() : -Infinity;
  const to = period.to ? new Date(period.to).getTime() : Infinity;
  return {
    from: Number.isFinite(from) ? from : -Infinity,
    to: Number.isFinite(to) ? to : Infinity,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OEETracker — the main class
// ═══════════════════════════════════════════════════════════════════════════

class OEETracker {
  constructor({
    worldClassOEE = WORLD_CLASS_OEE,
    alertThreshold = DEFAULT_ALERT_THRESHOLD,
  } = {}) {
    /** Append-only log of machine runs. Never truncated. */
    this._runs = [];
    this.worldClassOEE = clamp01(worldClassOEE);
    this.alertThreshold = clamp01(alertThreshold);

    // Expose constants on the instance for convenience.
    this.REASON_CODES = REASON_CODES;
    this.BIG_LOSS_LABELS = BIG_LOSS_LABELS;
    this.WORLD_CLASS_OEE = this.worldClassOEE;
  }

  // ─── recordRun ────────────────────────────────────────────────────────

  /**
   * Record a machine run. Returns the normalised frozen record.
   *
   * Required fields:
   *   machineId         string
   *   plannedTime       minutes of planned production time
   *   runTime           minutes actually running
   *   piecesProduced    total pieces (good + bad)
   *   piecesGood        good pieces
   *   idealCycleTime    ideal minutes per piece (design speed)
   *
   * Optional:
   *   shift             'morning' | 'afternoon' | 'night' | string
   *   downtime          array of { reason, duration } — duration in minutes
   *   timestamp         Date or ISO string — defaults to now
   */
  recordRun(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('recordRun requires an object');
    }

    const machineId = String(input.machineId || '').trim();
    if (!machineId) throw new Error('machineId is required');

    const plannedTime = nonNeg(input.plannedTime);
    const runTime = Math.min(nonNeg(input.runTime), plannedTime);
    const piecesProduced = Math.floor(nonNeg(input.piecesProduced));
    const piecesGood = Math.min(
      Math.floor(nonNeg(input.piecesGood)),
      piecesProduced
    );
    const idealCycleTime = nonNeg(input.idealCycleTime);

    // Downtime list — each entry resolved to bilingual label + big-loss cat.
    const downtime = Array.isArray(input.downtime)
      ? input.downtime.map((d) => {
          const resolved = resolveReason(d && d.reason);
          return Object.freeze({
            reason: resolved.code,
            duration: nonNeg(d && d.duration),
            bigLoss: resolved.bigLoss,
            label: { he: resolved.he, en: resolved.en },
          });
        })
      : [];

    // Factor math — pinned to the OEE textbook formulas.
    const availability = plannedTime > 0 ? clamp01(runTime / plannedTime) : 0;
    const performance =
      runTime > 0
        ? clamp01((idealCycleTime * piecesProduced) / runTime)
        : 0;
    const quality = piecesProduced > 0 ? clamp01(piecesGood / piecesProduced) : 0;
    const oee = clamp01(availability * performance * quality);

    const timestamp = input.timestamp
      ? new Date(input.timestamp).toISOString()
      : new Date().toISOString();

    const record = Object.freeze({
      machineId,
      shift: input.shift ? String(input.shift) : 'unspecified',
      plannedTime,
      runTime,
      downtime: Object.freeze(downtime),
      piecesProduced,
      piecesGood,
      piecesRejected: piecesProduced - piecesGood,
      idealCycleTime,
      availability: round(availability, 4),
      performance: round(performance, 4),
      quality: round(quality, 4),
      oee: round(oee, 4),
      timestamp,
      _ts: new Date(timestamp).getTime(),
    });

    this._runs.push(record);
    return record;
  }

  // ─── internal: select runs for machine/period ────────────────────────

  _selectRuns(machineId, period) {
    const { from, to } = parsePeriod(period);
    return this._runs.filter((r) => {
      if (machineId && r.machineId !== machineId) return false;
      return r._ts >= from && r._ts <= to;
    });
  }

  // ─── oee ─────────────────────────────────────────────────────────────

  /**
   * Rolled-up OEE for a machine (or all machines if omitted).
   * Rolls up by SUMMING raw inputs across runs, then computing the
   * three factors once — avoids weighting bias from averaging ratios.
   */
  oee(machineId, period) {
    const runs = this._selectRuns(machineId, period);

    if (runs.length === 0) {
      return {
        machineId: machineId || 'all',
        runs: 0,
        availability: 0,
        performance: 0,
        quality: 0,
        oee: 0,
        plannedTime: 0,
        runTime: 0,
        piecesProduced: 0,
        piecesGood: 0,
      };
    }

    let plannedTime = 0;
    let runTime = 0;
    let piecesProduced = 0;
    let piecesGood = 0;
    let idealTime = 0;

    for (const r of runs) {
      plannedTime += r.plannedTime;
      runTime += r.runTime;
      piecesProduced += r.piecesProduced;
      piecesGood += r.piecesGood;
      idealTime += r.idealCycleTime * r.piecesProduced;
    }

    const availability = plannedTime > 0 ? clamp01(runTime / plannedTime) : 0;
    const performance = runTime > 0 ? clamp01(idealTime / runTime) : 0;
    const quality = piecesProduced > 0 ? clamp01(piecesGood / piecesProduced) : 0;
    const oee = clamp01(availability * performance * quality);

    return {
      machineId: machineId || 'all',
      runs: runs.length,
      availability: round(availability, 4),
      performance: round(performance, 4),
      quality: round(quality, 4),
      oee: round(oee, 4),
      plannedTime,
      runTime,
      piecesProduced,
      piecesGood,
    };
  }

  // ─── sixBigLosses ────────────────────────────────────────────────────

  /**
   * Decompose losses across the Six Big Losses (Nakajima).
   *
   *   Availability losses:
   *     (1) Equipment Failure        — breakdowns, faults
   *     (2) Setup & Adjustment       — changeovers, tool changes
   *   Performance losses:
   *     (3) Idling & Minor Stops     — jams, waits, brief stops
   *     (4) Reduced Speed            — running below ideal cycle time
   *   Quality losses:
   *     (5) Startup Rejects          — warm-up/first-piece scrap
   *     (6) Production Rejects       — rejects during steady-state run
   *
   * The first four are computed from downtime + cycle-time data.
   * The last two need the caller to tag quality downtime entries with
   * a startup_rejects / production_rejects reason; if none are tagged
   * we split rejected pieces evenly between them as an approximation
   * (see `rejectSplit`).
   */
  sixBigLosses(machineId, period, { rejectSplit = 0.5 } = {}) {
    const runs = this._selectRuns(machineId, period);

    const losses = {
      equipment_failure: 0,
      setup_adjustment: 0,
      idling_minor_stops: 0,
      reduced_speed: 0,
      startup_rejects: 0,
      production_rejects: 0,
    };

    let totalRuntime = 0;
    let totalIdeal = 0;
    let totalPlanned = 0;
    let totalProduced = 0;
    let totalGood = 0;

    // Aggregate downtime into the four "time-based" big-loss buckets.
    for (const r of runs) {
      totalRuntime += r.runTime;
      totalPlanned += r.plannedTime;
      totalIdeal += r.idealCycleTime * r.piecesProduced;
      totalProduced += r.piecesProduced;
      totalGood += r.piecesGood;

      for (const d of r.downtime) {
        if (losses[d.bigLoss] !== undefined) {
          losses[d.bigLoss] += d.duration;
        }
      }
    }

    // Reduced-speed loss = run time − (ideal cycle × total count).
    // If ideal < run time, the gap is the "speed" loss (in minutes).
    const speedLoss = Math.max(0, totalRuntime - totalIdeal);
    // If downtime already tagged `reduced_speed` we don't double-count:
    // use the larger of the two (explicit tag OR computed gap).
    losses.reduced_speed = Math.max(losses.reduced_speed, round(speedLoss, 2));

    // Quality losses in MINUTES of lost production time
    // = (rejected pieces × ideal cycle time).
    const rejected = Math.max(0, totalProduced - totalGood);
    const avgIdeal =
      totalProduced > 0 ? totalIdeal / totalProduced : 0;

    // Caller-provided split between startup and production rejects.
    // Default 50/50 if not explicitly tagged.
    const splitRatio = Math.max(0, Math.min(1, rejectSplit));

    // If the caller tagged any startup/production reject downtime, use
    // that ratio instead of the default split.
    const taggedStart = losses.startup_rejects;
    const taggedProd = losses.production_rejects;
    const taggedTotal = taggedStart + taggedProd;

    const rejectMinutes = round(rejected * avgIdeal, 2);

    if (taggedTotal > 0) {
      // Honour caller tags proportionally.
      losses.startup_rejects = round(
        rejectMinutes * (taggedStart / taggedTotal),
        2
      );
      losses.production_rejects = round(
        rejectMinutes * (taggedProd / taggedTotal),
        2
      );
    } else {
      losses.startup_rejects = round(rejectMinutes * splitRatio, 2);
      losses.production_rejects = round(
        rejectMinutes * (1 - splitRatio),
        2
      );
    }

    // Round time-based losses.
    losses.equipment_failure = round(losses.equipment_failure, 2);
    losses.setup_adjustment = round(losses.setup_adjustment, 2);
    losses.idling_minor_stops = round(losses.idling_minor_stops, 2);

    // Summaries per OEE category.
    const availabilityLoss =
      losses.equipment_failure + losses.setup_adjustment;
    const performanceLoss =
      losses.idling_minor_stops + losses.reduced_speed;
    const qualityLoss = losses.startup_rejects + losses.production_rejects;

    return {
      machineId: machineId || 'all',
      runs: runs.length,
      totalPlannedTime: totalPlanned,
      losses: {
        equipment_failure: {
          minutes: losses.equipment_failure,
          label: BIG_LOSS_LABELS.equipment_failure,
        },
        setup_adjustment: {
          minutes: losses.setup_adjustment,
          label: BIG_LOSS_LABELS.setup_adjustment,
        },
        idling_minor_stops: {
          minutes: losses.idling_minor_stops,
          label: BIG_LOSS_LABELS.idling_minor_stops,
        },
        reduced_speed: {
          minutes: losses.reduced_speed,
          label: BIG_LOSS_LABELS.reduced_speed,
        },
        startup_rejects: {
          minutes: losses.startup_rejects,
          label: BIG_LOSS_LABELS.startup_rejects,
        },
        production_rejects: {
          minutes: losses.production_rejects,
          label: BIG_LOSS_LABELS.production_rejects,
        },
      },
      categories: {
        availability: round(availabilityLoss, 2),
        performance: round(performanceLoss, 2),
        quality: round(qualityLoss, 2),
      },
    };
  }

  // ─── downtimeReasonCodes ─────────────────────────────────────────────

  /**
   * Pareto of downtime reasons — sorted descending by total minutes.
   * Each entry carries bilingual labels + cumulative percent (for the
   * classic Pareto 80/20 curve).
   */
  downtimeReasonCodes(machineId, period) {
    const runs = this._selectRuns(machineId, period);

    const buckets = new Map();
    let totalMinutes = 0;

    for (const r of runs) {
      for (const d of r.downtime) {
        const existing = buckets.get(d.reason) || {
          reason: d.reason,
          minutes: 0,
          occurrences: 0,
          bigLoss: d.bigLoss,
          label: d.label,
        };
        existing.minutes += d.duration;
        existing.occurrences += 1;
        buckets.set(d.reason, existing);
        totalMinutes += d.duration;
      }
    }

    const sorted = [...buckets.values()].sort((a, b) => {
      if (b.minutes !== a.minutes) return b.minutes - a.minutes;
      // Deterministic tiebreak by reason code.
      return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
    });

    let cumulative = 0;
    const pareto = sorted.map((entry) => {
      const pct = totalMinutes > 0 ? entry.minutes / totalMinutes : 0;
      cumulative += pct;
      return {
        reason: entry.reason,
        minutes: round(entry.minutes, 2),
        occurrences: entry.occurrences,
        bigLoss: entry.bigLoss,
        label: entry.label,
        percent: round(pct * 100, 2),
        cumulativePercent: round(Math.min(cumulative, 1) * 100, 2),
      };
    });

    return {
      machineId: machineId || 'all',
      totalMinutes: round(totalMinutes, 2),
      pareto,
    };
  }

  // ─── worldClassGap ───────────────────────────────────────────────────

  /**
   * Gap vs world-class OEE (0.85 by default). Returns:
   *   actual           — current rolled-up OEE
   *   benchmark        — world-class target
   *   gap              — benchmark − actual (positive = below target)
   *   gapPercent       — gap as % of benchmark
   *   factorGaps       — per-factor gap vs world-class (A 0.9, P 0.95, Q 0.999)
   *   coaching         — bilingual recommendation on the weakest factor
   */
  worldClassGap(machineId, period) {
    const current = this.oee(machineId, period);

    const benchmark = this.worldClassOEE;

    // World-class per-factor targets (Nakajima):
    //   Availability ≥ 0.90
    //   Performance  ≥ 0.95
    //   Quality      ≥ 0.9999 (~1.0)
    const factorBenchmarks = {
      availability: 0.9,
      performance: 0.95,
      quality: 0.9999,
    };

    const factorGaps = {
      availability: round(
        factorBenchmarks.availability - current.availability,
        4
      ),
      performance: round(
        factorBenchmarks.performance - current.performance,
        4
      ),
      quality: round(factorBenchmarks.quality - current.quality, 4),
    };

    // Identify the factor furthest below its target (the "bottleneck").
    let weakest = 'availability';
    let worst = factorGaps.availability;
    if (factorGaps.performance > worst) {
      weakest = 'performance';
      worst = factorGaps.performance;
    }
    if (factorGaps.quality > worst) {
      weakest = 'quality';
      worst = factorGaps.quality;
    }

    const coaching = {
      availability: {
        he: 'התמקדו בהפחתת כשלי ציוד והקצרת זמני החלפה (SMED).',
        en: 'Focus on reducing equipment failures and shortening changeovers (SMED).',
      },
      performance: {
        he: 'התמקדו בעצירות קטנות, קצב הזנה ושחיקת כלי עבודה.',
        en: 'Tackle minor stops, feed rate, and tool wear.',
      },
      quality: {
        he: 'הפחיתו פסולת סטארט-אפ ושיפור בדיקת חלק ראשון.',
        en: 'Reduce startup scrap and tighten first-piece inspection.',
      },
    };

    return {
      machineId: machineId || 'all',
      actual: current.oee,
      benchmark: round(benchmark, 4),
      gap: round(benchmark - current.oee, 4),
      gapPercent: round(((benchmark - current.oee) / benchmark) * 100, 2),
      factorBenchmarks,
      factorGaps,
      weakestFactor: weakest,
      coaching: coaching[weakest],
      atWorldClass: current.oee >= benchmark,
    };
  }

  // ─── alertLowOEE ─────────────────────────────────────────────────────

  /**
   * Return an array of machines whose current OEE is below the threshold.
   * `threshold` overrides the constructor default for this call only.
   */
  alertLowOEE(threshold = this.alertThreshold) {
    const t = clamp01(threshold);

    const byMachine = new Map();
    for (const r of this._runs) {
      if (!byMachine.has(r.machineId)) byMachine.set(r.machineId, null);
    }

    const alerts = [];
    for (const machineId of byMachine.keys()) {
      const snap = this.oee(machineId);
      if (snap.runs === 0) continue;
      if (snap.oee < t) {
        alerts.push({
          machineId,
          oee: snap.oee,
          threshold: round(t, 4),
          severity:
            snap.oee < t * 0.75
              ? 'critical'
              : snap.oee < t * 0.9
                ? 'high'
                : 'warning',
          availability: snap.availability,
          performance: snap.performance,
          quality: snap.quality,
          message: {
            he: `התראת OEE נמוך: מכונה ${machineId} — OEE ${(
              snap.oee * 100
            ).toFixed(1)}% מתחת לסף ${(t * 100).toFixed(1)}%.`,
            en: `Low OEE alert: machine ${machineId} — OEE ${(
              snap.oee * 100
            ).toFixed(1)}% below threshold ${(t * 100).toFixed(1)}%.`,
          },
        });
      }
    }

    // Worst offenders first.
    alerts.sort((a, b) => a.oee - b.oee);
    return alerts;
  }

  // ─── generateReport ──────────────────────────────────────────────────

  /**
   * Bilingual OEE report for a single machine + optional period.
   * Returns a JSON-friendly object containing:
   *   • rolled-up OEE breakdown
   *   • six big losses
   *   • Pareto of downtime reasons
   *   • world-class gap analysis
   *   • trend sparkline — inline SVG string of the last N runs' OEE
   *   • text summary in HE and EN
   */
  generateReport(machineId, period, { trendPoints = 14 } = {}) {
    const snapshot = this.oee(machineId, period);
    const bigLosses = this.sixBigLosses(machineId, period);
    const pareto = this.downtimeReasonCodes(machineId, period);
    const gap = this.worldClassGap(machineId, period);

    // Trend — take up to N most-recent runs for this machine, in order.
    const runs = this._selectRuns(machineId, period);
    const trend = runs
      .slice(-trendPoints)
      .map((r) => ({ t: r.timestamp, oee: r.oee }));

    const sparkline = buildSparklineSVG(trend.map((p) => p.oee));

    const paretoBars = buildParetoBarSVG(pareto.pareto.slice(0, 6));

    const oeePct = (snapshot.oee * 100).toFixed(1);
    const gapPct = (gap.gapPercent || 0).toFixed(1);
    const weakestLabel = {
      availability: { he: 'זמינות', en: 'Availability' },
      performance: { he: 'ביצועים', en: 'Performance' },
      quality: { he: 'איכות', en: 'Quality' },
    }[gap.weakestFactor];

    return {
      machineId: machineId || 'all',
      generatedAt: new Date().toISOString(),
      period: period || 'all',
      snapshot,
      sixBigLosses: bigLosses,
      paretoReasons: pareto,
      worldClassGap: gap,
      trend,
      svg: {
        sparkline,
        pareto: paretoBars,
      },
      summary: {
        he: `דוח OEE — מכונה ${snapshot.machineId}: OEE ${oeePct}% (זמינות ${(
          snapshot.availability * 100
        ).toFixed(1)}% · ביצועים ${(snapshot.performance * 100).toFixed(
          1
        )}% · איכות ${(snapshot.quality * 100).toFixed(
          1
        )}%). פער ממצוינות עולמית: ${gapPct}%. הגורם החלש ביותר: ${
          weakestLabel.he
        }.`,
        en: `OEE Report — machine ${snapshot.machineId}: OEE ${oeePct}% (Availability ${(
          snapshot.availability * 100
        ).toFixed(1)}% · Performance ${(snapshot.performance * 100).toFixed(
          1
        )}% · Quality ${(snapshot.quality * 100).toFixed(
          1
        )}%). Gap to world-class: ${gapPct}%. Weakest factor: ${
          weakestLabel.en
        }.`,
      },
    };
  }
}

// Attach static constants too for consumers who import them directly.
OEETracker.REASON_CODES = REASON_CODES;
OEETracker.BIG_LOSS_LABELS = BIG_LOSS_LABELS;
OEETracker.WORLD_CLASS_OEE = WORLD_CLASS_OEE;

// ═══════════════════════════════════════════════════════════════════════════
// SVG helpers — zero-dep inline SVG for reports
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tiny sparkline SVG — values expected in [0,1].
 * Width 240, height 48, green above world-class, red below alert threshold.
 */
function buildSparklineSVG(values) {
  const W = 240;
  const H = 48;
  const pad = 4;
  const innerW = W - 2 * pad;
  const innerH = H - 2 * pad;

  if (!values || values.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="OEE trend sparkline (no data)"><rect x="0" y="0" width="${W}" height="${H}" fill="#f8f8f8"/><text x="${W / 2}" y="${H / 2 + 4}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#666">no data</text></svg>`;
  }

  const n = values.length;
  const step = n === 1 ? 0 : innerW / (n - 1);

  const points = values
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + innerH - clamp01(v) * innerH;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  // World-class reference line at y corresponding to 0.85.
  const refY = pad + innerH - WORLD_CLASS_OEE * innerH;
  const last = values[values.length - 1];
  const color =
    last >= WORLD_CLASS_OEE ? '#1a7f37' : last >= 0.6 ? '#b08800' : '#b02a37';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}" role="img" aria-label="OEE trend sparkline">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
    `<line x1="${pad}" y1="${refY.toFixed(2)}" x2="${W - pad}" y2="${refY.toFixed(2)}" stroke="#888" stroke-width="0.5" stroke-dasharray="2 2"/>` +
    `<polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}"/>` +
    `</svg>`
  );
}

/**
 * Pareto mini bar chart SVG — expects [{ reason, percent }] (already
 * sorted desc). Width 360, height 120, text labels bilingual via title.
 */
function buildParetoBarSVG(items) {
  const W = 360;
  const H = 120;
  const pad = 8;
  const barArea = H - 2 * pad - 14;
  const labelY = H - pad;

  if (!items || items.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pareto chart (no data)"><rect x="0" y="0" width="${W}" height="${H}" fill="#f8f8f8"/><text x="${W / 2}" y="${H / 2}" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#666">no data</text></svg>`;
  }

  const maxPct = Math.max(...items.map((x) => x.percent || 0), 1);
  const barW = (W - 2 * pad) / items.length - 4;

  let bars = '';
  items.forEach((item, i) => {
    const h = ((item.percent || 0) / maxPct) * barArea;
    const x = pad + i * (barW + 4);
    const y = pad + barArea - h;
    const shortCode = String(item.reason || '').slice(0, 8);
    bars +=
      `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" ` +
      `width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="#2563eb">` +
      `<title>${escapeXml(item.label && item.label.en)} (${escapeXml(item.label && item.label.he)}) — ${item.percent || 0}%</title>` +
      `</rect>` +
      `<text x="${(x + barW / 2).toFixed(2)}" y="${labelY}" ` +
      `font-family="sans-serif" font-size="9" text-anchor="middle" fill="#333">` +
      `${escapeXml(shortCode)}</text>`;
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" ` +
    `viewBox="0 0 ${W} ${H}" role="img" aria-label="Pareto of downtime reasons">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
    bars +
    `</svg>`
  );
}

function escapeXml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  OEETracker,
  REASON_CODES,
  BIG_LOSS_LABELS,
  WORLD_CLASS_OEE,
  DEFAULT_ALERT_THRESHOLD,
  // Helpers re-exported for testing / reuse.
  round,
  clamp01,
  parsePeriod,
  buildSparklineSVG,
  buildParetoBarSVG,
};
