/**
 * CAPA Workflow — Agent Y-038 (Swarm Quality)
 * Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * Corrective and Preventive Action (CAPA) — 8D methodology
 * תהליך פעולות מתקנות ומונעות — מתודולוגיית 8D
 *
 * ISO 9001:2015 — clause 10.2 "Nonconformity and corrective action".
 * Integrates with Y-037 NCR (Nonconformance Report) as upstream trigger.
 *
 * 8D Methodology (Ford 1987):
 *   D1 — Team           (הקמת צוות)
 *   D2 — Problem        (הגדרת הבעיה)
 *   D3 — Containment    (פעולה מכילה)
 *   D4 — Root Cause     (שורש הבעיה)
 *   D5 — Permanent      (פעולה קבועה)
 *   D6 — Implement      (יישום)
 *   D7 — Prevent        (מניעת חזרה)
 *   D8 — Close          (סגירה)
 *
 * Rules:
 *   - Never delete — CAPAs are archived, not removed
 *   - Zero external dependencies — Node built-ins only
 *   - Bilingual (Hebrew + English) throughout
 *   - Pure in-memory store — host ERP wires its own repo
 *   - 8D gated progression — D-n+1 requires D-n evidence
 *
 * Public API (class CAPAWorkflow):
 *   - createCAPA({trigger, description_he, description_en, rootCause,
 *                 sourceId, severity, owner}) → capaId
 *   - advanceStage(capaId, stage, evidence)      → capa
 *   - effectivenessCheck(capaId, {daysAfter, metric, result}) → check
 *   - relatedCAPAs(capaId)                       → capa[]  (recurrence)
 *   - openCAPAs(owner?)                          → capa[]
 *   - overdueCAPAs()                             → capa[]
 *   - generate8DReport(capaId)                   → bilingual report object
 *   - metrics(period)                            → KPI object
 *   - escalation(capaId)                         → escalation object
 *
 * Constants exposed:
 *   - STAGES, TRIGGERS, SEVERITIES, STATUS,
 *     STAGE_SLA_DAYS, ESCALATION_DAYS,
 *     ISO_9001_REFS, LABELS_HE, LABELS_EN
 *
 * Y-037 NCR integration:
 *   createCAPA({ trigger: 'ncr', sourceId: 'NCR-000123', ... })
 *   The NCR engine can call this directly — sourceId links back.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════════

/** 8D Stage identifiers — order matters for gated progression. */
const STAGES = Object.freeze({
  D1_TEAM:         'D1_TEAM',
  D2_PROBLEM:      'D2_PROBLEM',
  D3_CONTAINMENT:  'D3_CONTAINMENT',
  D4_ROOT_CAUSE:   'D4_ROOT_CAUSE',
  D5_PERMANENT:    'D5_PERMANENT',
  D6_IMPLEMENT:    'D6_IMPLEMENT',
  D7_PREVENT:      'D7_PREVENT',
  D8_CLOSE:        'D8_CLOSE',
});

const STAGE_ORDER = Object.freeze([
  STAGES.D1_TEAM,
  STAGES.D2_PROBLEM,
  STAGES.D3_CONTAINMENT,
  STAGES.D4_ROOT_CAUSE,
  STAGES.D5_PERMANENT,
  STAGES.D6_IMPLEMENT,
  STAGES.D7_PREVENT,
  STAGES.D8_CLOSE,
]);

const TRIGGERS = Object.freeze({
  NCR:                'ncr',                 // דיווח אי־התאמה (Y-037)
  AUDIT:              'audit',               // ביקורת פנים/חוץ
  CUSTOMER_COMPLAINT: 'customer-complaint',  // תלונת לקוח
  INTERNAL:           'internal',            // יוזמה פנימית
});

const VALID_TRIGGERS = new Set(Object.values(TRIGGERS));

const SEVERITIES = Object.freeze({
  CRITICAL: 'CRITICAL', // קריטי — safety / regulatory / mass recall
  MAJOR:    'MAJOR',    // מהותי — line stop / customer impact
  MINOR:    'MINOR',    // זוטר — internal rework
  OBSERVE:  'OBSERVE',  // הערה — monitoring only
});

const VALID_SEVERITIES = new Set(Object.values(SEVERITIES));

const STATUS = Object.freeze({
  OPEN:       'OPEN',       // פתוח
  IN_PROGRESS:'IN_PROGRESS',// בתהליך
  VERIFYING:  'VERIFYING',  // באימות אפקטיביות
  CLOSED:     'CLOSED',     // סגור
  ESCALATED:  'ESCALATED',  // הוסלם
  ARCHIVED:   'ARCHIVED',   // בארכיון  (never hard-deleted)
});

/**
 * Stage SLA days — counted from CAPA creation.
 * ISO 9001 does not set absolute numbers; these follow industry norms
 * (ASQ CAPA benchmarks + Ford 8D guide) and can be tuned per company.
 */
const STAGE_SLA_DAYS = Object.freeze({
  D1_TEAM:         1,   // Team assembled within 1 day
  D2_PROBLEM:      3,   // Problem described within 3 days
  D3_CONTAINMENT:  5,   // Containment in place within 5 days (protects customer)
  D4_ROOT_CAUSE:  14,   // Root cause within 2 weeks
  D5_PERMANENT:   21,   // Permanent action plan within 3 weeks
  D6_IMPLEMENT:   45,   // Implementation within 45 days
  D7_PREVENT:     60,   // Prevent recurrence within 60 days
  D8_CLOSE:       90,   // Full closure within 90 days
});

/** Escalation thresholds (days past SLA → escalation level). */
const ESCALATION_DAYS = Object.freeze({
  LEVEL_1_SUPERVISOR: 3,   // 3 days over SLA → supervisor
  LEVEL_2_MANAGER:    7,   // 7 days over SLA → dept manager
  LEVEL_3_EXECUTIVE:  14,  // 14 days over SLA → executive / QM
});

/** Minimum days to wait after D6 (implementation) before effectiveness check. */
const MIN_EFFECTIVENESS_WAIT_DAYS = 30;

/** Severity multipliers for SLA — critical CAPAs are faster. */
const SEVERITY_SLA_MULTIPLIER = Object.freeze({
  CRITICAL: 0.5,
  MAJOR:    0.75,
  MINOR:    1.0,
  OBSERVE:  1.5,
});

const ISO_9001_REFS = Object.freeze({
  '8.7':   'Control of nonconforming outputs — בקרת פלטים לא תואמים',
  '9.1':   'Monitoring, measurement, analysis — ניטור, מדידה וניתוח',
  '9.2':   'Internal audit — ביקורת פנים',
  '9.3':   'Management review — סקר הנהלה',
  '10.1':  'Improvement — שיפור',
  '10.2':  'Nonconformity and corrective action — אי־התאמה ופעולה מתקנת',
  '10.3':  'Continual improvement — שיפור מתמיד',
});

// ══════════════════════════════════════════════════════════════════
// BILINGUAL LABELS (frozen)
// ══════════════════════════════════════════════════════════════════

const LABELS_HE = Object.freeze({
  title:            'דוח פעולה מתקנת ומונעת (CAPA) — מתודולוגיית 8D',
  capaId:           'מזהה CAPA',
  trigger:          'גורם מעורר',
  severity:         'חומרה',
  status:           'סטטוס',
  owner:            'אחראי',
  createdAt:        'נוצר בתאריך',
  description:      'תיאור הבעיה',
  rootCause:        'שורש הבעיה',
  containment:      'פעולה מכילה',
  permanentAction:  'פעולה קבועה',
  implementation:   'יישום',
  prevention:       'מניעת חזרה',
  effectiveness:    'אימות אפקטיביות',
  closed:           'סגירה',
  timeToContain:    'זמן להכלה',
  timeToResolve:    'זמן לפתרון',
  recurrenceRate:   'שיעור חזרה',
  dueDate:          'תאריך יעד',
  escalation:       'הסלמה',
  stages: Object.freeze({
    D1_TEAM:         'D1 — הקמת צוות',
    D2_PROBLEM:      'D2 — הגדרת הבעיה',
    D3_CONTAINMENT:  'D3 — פעולה מכילה',
    D4_ROOT_CAUSE:   'D4 — שורש הבעיה',
    D5_PERMANENT:    'D5 — פעולה קבועה',
    D6_IMPLEMENT:    'D6 — יישום',
    D7_PREVENT:      'D7 — מניעת חזרה',
    D8_CLOSE:        'D8 — סגירה',
  }),
  triggers: Object.freeze({
    ncr:                  'אי־התאמה (NCR)',
    audit:                'ביקורת',
    'customer-complaint': 'תלונת לקוח',
    internal:             'פנימי',
  }),
  severities: Object.freeze({
    CRITICAL: 'קריטי',
    MAJOR:    'מהותי',
    MINOR:    'זוטר',
    OBSERVE:  'הערה',
  }),
});

const LABELS_EN = Object.freeze({
  title:            'Corrective & Preventive Action (CAPA) — 8D Methodology',
  capaId:           'CAPA ID',
  trigger:          'Trigger',
  severity:         'Severity',
  status:           'Status',
  owner:            'Owner',
  createdAt:        'Created',
  description:      'Problem description',
  rootCause:        'Root cause',
  containment:      'Containment action',
  permanentAction:  'Permanent action',
  implementation:   'Implementation',
  prevention:       'Prevention',
  effectiveness:    'Effectiveness check',
  closed:           'Closure',
  timeToContain:    'Time-to-containment',
  timeToResolve:    'Time-to-resolution',
  recurrenceRate:   'Recurrence rate',
  dueDate:          'Due date',
  escalation:       'Escalation',
  stages: Object.freeze({
    D1_TEAM:         'D1 — Team',
    D2_PROBLEM:      'D2 — Problem',
    D3_CONTAINMENT:  'D3 — Containment',
    D4_ROOT_CAUSE:   'D4 — Root Cause',
    D5_PERMANENT:    'D5 — Permanent Action',
    D6_IMPLEMENT:    'D6 — Implement',
    D7_PREVENT:      'D7 — Prevent',
    D8_CLOSE:        'D8 — Close',
  }),
  triggers: Object.freeze({
    ncr:                  'Nonconformance (NCR)',
    audit:                'Audit finding',
    'customer-complaint': 'Customer complaint',
    internal:             'Internal initiative',
  }),
  severities: Object.freeze({
    CRITICAL: 'Critical',
    MAJOR:    'Major',
    MINOR:    'Minor',
    OBSERVE:  'Observation',
  }),
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ══════════════════════════════════════════════════════════════════
// UTILITIES (pure, local)
// ══════════════════════════════════════════════════════════════════

function _toDate(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string' && v.length > 0) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  throw new TypeError('capa-workflow: invalid date value — ' + String(v));
}

function _now() {
  return new Date();
}

function _addDays(date, days) {
  const d = _toDate(date);
  d.setTime(d.getTime() + days * MS_PER_DAY);
  return d;
}

function _daysBetween(a, b) {
  const da = _toDate(a).getTime();
  const db = _toDate(b).getTime();
  return Math.round((db - da) / MS_PER_DAY);
}

function _iso(d) {
  return _toDate(d).toISOString();
}

function _isoDate(d) {
  return _toDate(d).toISOString().slice(0, 10);
}

function _requireNonEmpty(value, field) {
  if (value === undefined || value === null || value === '') {
    throw new Error('capa-workflow: missing required field — ' + field);
  }
  return value;
}

function _normalizeStageName(stage) {
  if (!stage) {
    throw new Error('capa-workflow: stage is required');
  }
  const s = String(stage).toUpperCase().replace(/-/g, '_');
  if (STAGES[s]) return STAGES[s];
  // accept short forms D1..D8
  const short = s.replace(/^D(\d)$/, (_, n) => STAGE_ORDER[Number(n) - 1] || s);
  if (STAGES[short]) return STAGES[short];
  // accept exact value
  if (Object.values(STAGES).includes(s)) return s;
  throw new Error('capa-workflow: unknown stage — ' + stage);
}

function _stageIndex(stage) {
  return STAGE_ORDER.indexOf(stage);
}

function _severityMultiplier(sev) {
  return SEVERITY_SLA_MULTIPLIER[sev] !== undefined
    ? SEVERITY_SLA_MULTIPLIER[sev]
    : 1.0;
}

/**
 * Compute due date for a stage, SLA-adjusted by severity.
 */
function _stageDue(createdAt, stage, severity) {
  const days = STAGE_SLA_DAYS[stage] || 30;
  const adjusted = Math.max(1, Math.round(days * _severityMultiplier(severity)));
  return _addDays(createdAt, adjusted);
}

/**
 * Normalize a user-provided description into a bilingual pair.
 * Falls back gracefully if only one language is provided.
 */
function _normalizeDescription(he, en) {
  const h = (he || '').toString().trim();
  const e = (en || '').toString().trim();
  if (!h && !e) {
    throw new Error('capa-workflow: at least one of description_he / description_en is required');
  }
  return {
    he: h || e,
    en: e || h,
  };
}

function _freezeShallow(obj) {
  return Object.freeze(Object.assign({}, obj));
}

/**
 * Stable tokenization for similarity comparison.
 * Lower-case, split on non-word, drop tokens shorter than 3 chars,
 * preserve Hebrew chars via Unicode class.
 */
function _tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

/**
 * Jaccard similarity between two token arrays (0..1).
 */
function _jaccard(aTokens, bTokens) {
  if (!aTokens.length && !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const unionSize = a.size + b.size - inter;
  return unionSize === 0 ? 0 : inter / unionSize;
}

// ══════════════════════════════════════════════════════════════════
// CAPAWorkflow CLASS
// ══════════════════════════════════════════════════════════════════

class CAPAWorkflow {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now]      - clock fn (for tests) → Date
   * @param {Object}   [options.ncrRepo]  - optional Y-037 NCR repo with
   *                                         findNcrById(id) → ncr|null
   * @param {Function} [options.idGen]    - id generator override
   */
  constructor(options = {}) {
    this._now = typeof options.now === 'function' ? options.now : _now;
    this._ncrRepo = options.ncrRepo || null;
    this._idGen = typeof options.idGen === 'function' ? options.idGen : null;

    // in-memory store
    this._capas = new Map();   // id → capa
    this._counter = 0;

    // denormalized indexes
    this._byOwner = new Map(); // owner → Set<id>
    this._bySource = new Map();// sourceId → Set<id>
  }

  // ──────────────────────────────────────────────────────────────
  // ID generation
  // ──────────────────────────────────────────────────────────────

  _nextId() {
    if (this._idGen) return this._idGen();
    this._counter += 1;
    return 'CAPA-' + String(this._counter).padStart(6, '0');
  }

  // ──────────────────────────────────────────────────────────────
  // Public: createCAPA
  // ──────────────────────────────────────────────────────────────

  /**
   * Create a new CAPA record and start at D1_TEAM.
   *
   * @param {Object} input
   * @param {'ncr'|'audit'|'customer-complaint'|'internal'} input.trigger
   * @param {string} [input.description_he] - Hebrew problem description
   * @param {string} [input.description_en] - English problem description
   * @param {string} [input.rootCause]      - Optional initial hypothesis
   * @param {string} [input.sourceId]       - NCR id / audit id / complaint id
   * @param {string} [input.severity]       - CRITICAL / MAJOR / MINOR / OBSERVE
   * @param {string} [input.owner]          - userId responsible
   * @returns {string} capaId
   */
  createCAPA(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('capa-workflow: createCAPA requires an input object');
    }

    const trigger = _requireNonEmpty(input.trigger, 'trigger');
    if (!VALID_TRIGGERS.has(trigger)) {
      throw new Error('capa-workflow: invalid trigger — ' + trigger);
    }

    const severity = input.severity || SEVERITIES.MAJOR;
    if (!VALID_SEVERITIES.has(severity)) {
      throw new Error('capa-workflow: invalid severity — ' + severity);
    }

    const description = _normalizeDescription(input.description_he, input.description_en);
    const owner = (input.owner || 'unassigned').toString();
    const sourceId = input.sourceId ? String(input.sourceId) : null;
    const rootCauseHypothesis = input.rootCause ? String(input.rootCause) : null;

    // NCR cross-reference enrichment (optional, best-effort).
    let ncrSnapshot = null;
    if (trigger === TRIGGERS.NCR && sourceId && this._ncrRepo
        && typeof this._ncrRepo.findNcrById === 'function') {
      try {
        const ncr = this._ncrRepo.findNcrById(sourceId);
        if (ncr) {
          ncrSnapshot = {
            ncrId:     ncr.id || sourceId,
            product:   ncr.product || null,
            supplier:  ncr.supplier || null,
            severity:  ncr.severity || null,
            loggedAt:  ncr.loggedAt || ncr.createdAt || null,
          };
        }
      } catch (_err) {
        // safe-by-default: do not break CAPA creation on NCR lookup failure
        ncrSnapshot = null;
      }
    }

    const createdAt = this._now();
    const id = this._nextId();

    const capa = {
      id,
      trigger,
      severity,
      owner,
      sourceId,
      ncrSnapshot,
      description, // { he, en }
      rootCauseHypothesis,
      status: STATUS.OPEN,
      createdAt: _iso(createdAt),
      updatedAt: _iso(createdAt),
      currentStage: STAGES.D1_TEAM,
      stages: {}, // stageName → { enteredAt, completedAt, evidence, notes }
      stageHistory: [{
        stage: STAGES.D1_TEAM,
        enteredAt: _iso(createdAt),
        actor: owner,
      }],
      effectivenessChecks: [],
      escalationLevel: 0,
      escalationHistory: [],
      closedAt: null,
      closureReason: null,
      closureOutcome: null,
      // final due = D8 deadline
      dueDate: _iso(_stageDue(createdAt, STAGES.D8_CLOSE, severity)),
    };

    // initialize D1 slot
    capa.stages[STAGES.D1_TEAM] = {
      enteredAt: _iso(createdAt),
      completedAt: null,
      dueAt: _iso(_stageDue(createdAt, STAGES.D1_TEAM, severity)),
      evidence: null,
      notes: null,
    };

    this._capas.set(id, capa);

    // index by owner
    if (!this._byOwner.has(owner)) this._byOwner.set(owner, new Set());
    this._byOwner.get(owner).add(id);

    // index by source
    if (sourceId) {
      if (!this._bySource.has(sourceId)) this._bySource.set(sourceId, new Set());
      this._bySource.get(sourceId).add(id);
    }

    return id;
  }

  // ──────────────────────────────────────────────────────────────
  // Public: advanceStage — gated 8D progression
  // ──────────────────────────────────────────────────────────────

  /**
   * Advance a CAPA to the next stage. Requires evidence per ISO 9001 10.2.2.
   * Gated: cannot skip stages; cannot advance a CLOSED / ARCHIVED CAPA.
   *
   * @param {string} capaId
   * @param {string} stage  - target stage (D1..D8 or full name)
   * @param {Object} evidence - {notes, attachments, approvedBy, measurement}
   * @returns {Object} updated capa snapshot (frozen shell)
   */
  advanceStage(capaId, stage, evidence) {
    const capa = this._capas.get(capaId);
    if (!capa) {
      throw new Error('capa-workflow: CAPA not found — ' + capaId);
    }
    if (capa.status === STATUS.CLOSED || capa.status === STATUS.ARCHIVED) {
      throw new Error('capa-workflow: cannot advance a ' + capa.status + ' CAPA');
    }

    const target = _normalizeStageName(stage);
    const targetIdx = _stageIndex(target);
    const currentIdx = _stageIndex(capa.currentStage);

    if (targetIdx === -1) {
      throw new Error('capa-workflow: unknown target stage — ' + stage);
    }
    if (targetIdx <= currentIdx) {
      throw new Error(
        'capa-workflow: cannot move backwards or to the same stage — ' +
        capa.currentStage + ' → ' + target,
      );
    }
    if (targetIdx !== currentIdx + 1) {
      throw new Error(
        'capa-workflow: 8D stages are gated — must advance one at a time. ' +
        'current=' + capa.currentStage + ' target=' + target,
      );
    }

    if (!evidence || typeof evidence !== 'object') {
      throw new Error('capa-workflow: evidence is required per ISO 9001 10.2.2');
    }
    const hasNotes = evidence.notes && String(evidence.notes).trim().length > 0;
    const hasAttachments = Array.isArray(evidence.attachments) && evidence.attachments.length > 0;
    const hasApproval = evidence.approvedBy && String(evidence.approvedBy).trim().length > 0;
    if (!hasNotes && !hasAttachments) {
      throw new Error('capa-workflow: evidence must include notes or attachments');
    }

    // Stage-specific gate: D6 requires implementation timestamp
    if (target === STAGES.D6_IMPLEMENT && !evidence.implementedAt) {
      throw new Error('capa-workflow: D6 (Implement) requires evidence.implementedAt');
    }
    // D8 close needs approver
    if (target === STAGES.D8_CLOSE && !hasApproval) {
      throw new Error('capa-workflow: D8 (Close) requires evidence.approvedBy');
    }
    // D4 needs rootCause
    if (target === STAGES.D4_ROOT_CAUSE && !evidence.rootCause) {
      throw new Error('capa-workflow: D4 (Root Cause) requires evidence.rootCause');
    }
    // D3 containment needs containmentAction
    if (target === STAGES.D3_CONTAINMENT && !evidence.containmentAction) {
      throw new Error('capa-workflow: D3 (Containment) requires evidence.containmentAction');
    }

    const now = this._now();
    const nowIso = _iso(now);

    // Complete current stage
    const currentSlot = capa.stages[capa.currentStage] || {
      enteredAt: capa.createdAt,
      completedAt: null,
      dueAt: _iso(_stageDue(capa.createdAt, capa.currentStage, capa.severity)),
      evidence: null,
    };
    currentSlot.completedAt = nowIso;
    currentSlot.evidence = _freezeShallow({
      notes: evidence.notes || null,
      attachments: Array.isArray(evidence.attachments) ? evidence.attachments.slice() : [],
      approvedBy: evidence.approvedBy || null,
      measurement: evidence.measurement || null,
      containmentAction: evidence.containmentAction || null,
      rootCause: evidence.rootCause || null,
      permanentAction: evidence.permanentAction || null,
      preventiveAction: evidence.preventiveAction || null,
      implementedAt: evidence.implementedAt ? _iso(evidence.implementedAt) : null,
    });
    capa.stages[capa.currentStage] = currentSlot;

    // Side-effect: copy rootCause into capa top-level when D4 completes.
    if (target === STAGES.D4_ROOT_CAUSE) {
      // (stage we're ENTERING is D4; evidence is for D3)
      // ISO: rootCause is captured when D4 is entered. But we also accept it
      // inline when advancing TO D4 — store on capa for quick access.
    }
    if (evidence.rootCause && !capa.confirmedRootCause) {
      capa.confirmedRootCause = evidence.rootCause;
    }
    if (evidence.containmentAction && !capa.containmentAction) {
      capa.containmentAction = evidence.containmentAction;
      capa.containmentAt = nowIso;
    }
    if (evidence.permanentAction && !capa.permanentAction) {
      capa.permanentAction = evidence.permanentAction;
    }
    if (evidence.implementedAt && !capa.implementedAt) {
      capa.implementedAt = _iso(evidence.implementedAt);
    }
    if (evidence.preventiveAction && !capa.preventiveAction) {
      capa.preventiveAction = evidence.preventiveAction;
    }

    // Enter new stage
    capa.currentStage = target;
    capa.updatedAt = nowIso;
    capa.status = target === STAGES.D8_CLOSE ? STATUS.VERIFYING : STATUS.IN_PROGRESS;
    capa.stages[target] = {
      enteredAt: nowIso,
      completedAt: null,
      dueAt: _iso(_stageDue(capa.createdAt, target, capa.severity)),
      evidence: null,
      notes: evidence.notes || null,
    };
    capa.stageHistory.push({
      stage: target,
      enteredAt: nowIso,
      actor: evidence.actor || capa.owner,
    });

    // D8 — mark closed only after an effectiveness check passes.
    // We allow entering D8 with approver; closedAt set when effectiveness passes.
    if (target === STAGES.D8_CLOSE) {
      capa.stages[STAGES.D8_CLOSE].completedAt = nowIso;
      capa.stages[STAGES.D8_CLOSE].evidence = _freezeShallow({
        notes: evidence.notes || null,
        approvedBy: evidence.approvedBy,
        attachments: Array.isArray(evidence.attachments) ? evidence.attachments.slice() : [],
      });
      // closed only if already verified effective
      if (capa.effectivenessChecks.some((c) => c.passed)) {
        capa.status = STATUS.CLOSED;
        capa.closedAt = nowIso;
        capa.closureReason = evidence.closureReason || 'effectiveness verified';
        capa.closureOutcome = 'EFFECTIVE';
      } else {
        capa.status = STATUS.VERIFYING;
      }
    }

    return _freezeShallow(Object.assign({}, capa));
  }

  // ──────────────────────────────────────────────────────────────
  // Public: effectivenessCheck
  // ──────────────────────────────────────────────────────────────

  /**
   * Verify the corrective action worked by re-measuring the original
   * defect metric some time after implementation.
   *
   * ISO 9001:2015 §10.2.1(f) — "review the effectiveness of any corrective
   * action taken".
   *
   * @param {string} capaId
   * @param {Object} check
   * @param {number} check.daysAfter  - how many days after implementation
   * @param {string} check.metric     - metric name (e.g. 'defect_rate_pct')
   * @param {Object} check.result     - { baseline, current, target, passed? }
   * @returns {Object} effectiveness check record (frozen)
   */
  effectivenessCheck(capaId, check) {
    const capa = this._capas.get(capaId);
    if (!capa) {
      throw new Error('capa-workflow: CAPA not found — ' + capaId);
    }
    if (!check || typeof check !== 'object') {
      throw new TypeError('capa-workflow: effectivenessCheck requires a check object');
    }
    if (typeof check.daysAfter !== 'number' || !(check.daysAfter >= 0)) {
      throw new Error('capa-workflow: daysAfter must be a non-negative number');
    }
    if (check.daysAfter < MIN_EFFECTIVENESS_WAIT_DAYS) {
      throw new Error(
        'capa-workflow: effectiveness check too early — minimum ' +
        MIN_EFFECTIVENESS_WAIT_DAYS + ' days after implementation',
      );
    }
    if (!check.metric) {
      throw new Error('capa-workflow: metric name is required');
    }
    if (!check.result || typeof check.result !== 'object') {
      throw new Error('capa-workflow: result object is required');
    }
    if (!capa.implementedAt && capa.currentStage !== STAGES.D8_CLOSE
        && _stageIndex(capa.currentStage) < _stageIndex(STAGES.D6_IMPLEMENT)) {
      throw new Error(
        'capa-workflow: cannot verify effectiveness before D6 (Implement) — ' +
        'current stage: ' + capa.currentStage,
      );
    }

    // Pass/fail rule: if `passed` is explicit, use it; otherwise compare
    // current vs target (lower-is-better assumption by default; caller may
    // override by supplying `higherIsBetter: true`).
    const { baseline, current, target, higherIsBetter } = check.result;
    let passed = check.result.passed;
    if (typeof passed !== 'boolean') {
      if (typeof current === 'number' && typeof target === 'number') {
        passed = higherIsBetter ? (current >= target) : (current <= target);
      } else {
        throw new Error(
          'capa-workflow: effectivenessCheck needs either result.passed or ' +
          'numeric result.current + result.target',
        );
      }
    }

    const improvement = (typeof baseline === 'number' && typeof current === 'number')
      ? (baseline - current) // lower is better by default
      : null;

    const now = this._now();
    const record = Object.freeze({
      capaId,
      checkedAt: _iso(now),
      daysAfter: check.daysAfter,
      metric: String(check.metric),
      baseline: typeof baseline === 'number' ? baseline : null,
      current:  typeof current  === 'number' ? current  : null,
      target:   typeof target   === 'number' ? target   : null,
      improvement,
      passed: Boolean(passed),
      notes: check.notes || null,
      verifiedBy: check.verifiedBy || null,
    });

    capa.effectivenessChecks.push(record);
    capa.updatedAt = _iso(now);

    // Auto-close when effectiveness passes AND CAPA has reached D8.
    if (record.passed && capa.currentStage === STAGES.D8_CLOSE
        && capa.status !== STATUS.CLOSED) {
      capa.status = STATUS.CLOSED;
      capa.closedAt = _iso(now);
      capa.closureReason = 'effectiveness verified';
      capa.closureOutcome = 'EFFECTIVE';
    }
    // Failed effectiveness → CAPA reopens for another root-cause pass.
    if (!record.passed) {
      capa.status = STATUS.IN_PROGRESS;
      capa.closureOutcome = 'INEFFECTIVE';
    }

    return record;
  }

  // ──────────────────────────────────────────────────────────────
  // Public: relatedCAPAs — recurrence detection
  // ──────────────────────────────────────────────────────────────

  /**
   * Find past CAPAs that look similar to this one — used to detect
   * systemic / recurring issues. Matches on:
   *   1. Same trigger + same sourceId (exact)
   *   2. Same NCR product / supplier (if ncrSnapshot available)
   *   3. Jaccard text similarity ≥ 0.35 on descriptions
   *   4. Same confirmed root cause (normalized)
   *
   * @param {string} capaId
   * @returns {Array} sorted by similarity score desc
   */
  relatedCAPAs(capaId) {
    const seed = this._capas.get(capaId);
    if (!seed) return [];

    const seedTokensHe = _tokenize(seed.description.he);
    const seedTokensEn = _tokenize(seed.description.en);
    const seedRcTokens = _tokenize(seed.confirmedRootCause || seed.rootCauseHypothesis || '');

    const matches = [];
    for (const other of this._capas.values()) {
      if (other.id === capaId) continue;

      let score = 0;
      const reasons = [];

      // same sourceId
      if (seed.sourceId && other.sourceId && seed.sourceId === other.sourceId) {
        score += 0.9;
        reasons.push('same-source');
      }

      // same NCR product
      if (seed.ncrSnapshot && other.ncrSnapshot) {
        if (seed.ncrSnapshot.product && seed.ncrSnapshot.product === other.ncrSnapshot.product) {
          score += 0.4;
          reasons.push('same-product');
        }
        if (seed.ncrSnapshot.supplier && seed.ncrSnapshot.supplier === other.ncrSnapshot.supplier) {
          score += 0.3;
          reasons.push('same-supplier');
        }
      }

      // text similarity
      const simHe = _jaccard(seedTokensHe, _tokenize(other.description.he));
      const simEn = _jaccard(seedTokensEn, _tokenize(other.description.en));
      const textSim = Math.max(simHe, simEn);
      if (textSim >= 0.35) {
        score += textSim;
        reasons.push('text-sim-' + textSim.toFixed(2));
      }

      // same root cause
      const otherRc = other.confirmedRootCause || other.rootCauseHypothesis || '';
      const rcSim = _jaccard(seedRcTokens, _tokenize(otherRc));
      if (rcSim >= 0.4) {
        score += rcSim * 0.8;
        reasons.push('root-cause-sim-' + rcSim.toFixed(2));
      }

      // same trigger bonus — weak signal
      if (other.trigger === seed.trigger) {
        score += 0.05;
      }

      if (score >= 0.35) {
        matches.push({
          capaId: other.id,
          score: Number(score.toFixed(3)),
          reasons,
          trigger: other.trigger,
          severity: other.severity,
          status: other.status,
          createdAt: other.createdAt,
          description: other.description,
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  // ──────────────────────────────────────────────────────────────
  // Public: openCAPAs / overdueCAPAs — dashboard queries
  // ──────────────────────────────────────────────────────────────

  /**
   * List all open CAPAs, optionally filtered by owner.
   */
  openCAPAs(owner) {
    const out = [];
    const iter = owner && this._byOwner.has(owner)
      ? Array.from(this._byOwner.get(owner)).map((id) => this._capas.get(id))
      : Array.from(this._capas.values());

    for (const capa of iter) {
      if (!capa) continue;
      if (capa.status === STATUS.CLOSED || capa.status === STATUS.ARCHIVED) continue;
      out.push(this._dashboardView(capa));
    }
    out.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    return out;
  }

  /**
   * List CAPAs whose current-stage due date is in the past and which
   * are not yet closed/archived.
   */
  overdueCAPAs() {
    const now = this._now().getTime();
    const out = [];
    for (const capa of this._capas.values()) {
      if (capa.status === STATUS.CLOSED || capa.status === STATUS.ARCHIVED) continue;
      const stageSlot = capa.stages[capa.currentStage];
      if (!stageSlot) continue;
      const due = new Date(stageSlot.dueAt).getTime();
      if (due < now) {
        const overdueDays = Math.floor((now - due) / MS_PER_DAY);
        const view = this._dashboardView(capa);
        // _dashboardView returns a frozen shell — rebuild with extras.
        out.push(Object.freeze(Object.assign({}, view, {
          overdueDays,
          overdueStage: capa.currentStage,
        })));
      }
    }
    out.sort((a, b) => b.overdueDays - a.overdueDays);
    return out;
  }

  _dashboardView(capa) {
    const stageSlot = capa.stages[capa.currentStage] || {};
    return Object.freeze({
      id: capa.id,
      trigger: capa.trigger,
      severity: capa.severity,
      status: capa.status,
      owner: capa.owner,
      currentStage: capa.currentStage,
      stageDueAt: stageSlot.dueAt || null,
      description_he: capa.description.he,
      description_en: capa.description.en,
      createdAt: capa.createdAt,
      dueDate: capa.dueDate,
      escalationLevel: capa.escalationLevel,
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Public: generate8DReport — bilingual structured report
  // ──────────────────────────────────────────────────────────────

  /**
   * Produce a bilingual 8D report object that is directly serializable
   * to PDF, XML, or JSON. The caller is responsible for rendering; this
   * function only returns the *content* model.
   *
   * @param {string} capaId
   * @returns {Object} report { meta, sections: [...] }
   */
  generate8DReport(capaId) {
    const capa = this._capas.get(capaId);
    if (!capa) {
      throw new Error('capa-workflow: CAPA not found — ' + capaId);
    }

    const sections = STAGE_ORDER.map((stage) => {
      const slot = capa.stages[stage] || null;
      return {
        stage,
        labelHe: LABELS_HE.stages[stage],
        labelEn: LABELS_EN.stages[stage],
        enteredAt: slot ? slot.enteredAt : null,
        completedAt: slot ? slot.completedAt : null,
        dueAt: slot ? slot.dueAt : null,
        evidence: slot ? slot.evidence : null,
        state: !slot
          ? 'PENDING'
          : slot.completedAt
            ? 'COMPLETED'
            : 'IN_PROGRESS',
      };
    });

    return Object.freeze({
      meta: Object.freeze({
        capaId: capa.id,
        title: {
          he: LABELS_HE.title,
          en: LABELS_EN.title,
        },
        preparedAt: _iso(this._now()),
        trigger: {
          code: capa.trigger,
          he: LABELS_HE.triggers[capa.trigger] || capa.trigger,
          en: LABELS_EN.triggers[capa.trigger] || capa.trigger,
        },
        severity: {
          code: capa.severity,
          he: LABELS_HE.severities[capa.severity] || capa.severity,
          en: LABELS_EN.severities[capa.severity] || capa.severity,
        },
        owner: capa.owner,
        status: capa.status,
        createdAt: capa.createdAt,
        closedAt: capa.closedAt,
        dueDate: capa.dueDate,
        isoReference: {
          code: '10.2',
          he: ISO_9001_REFS['10.2'],
          en: 'ISO 9001:2015 §10.2 Nonconformity and corrective action',
        },
        sourceId: capa.sourceId,
        ncrSnapshot: capa.ncrSnapshot,
      }),
      problem: Object.freeze({
        he: capa.description.he,
        en: capa.description.en,
      }),
      rootCause: {
        he: capa.confirmedRootCause || capa.rootCauseHypothesis || '',
        en: capa.confirmedRootCause || capa.rootCauseHypothesis || '',
      },
      containment: capa.containmentAction || null,
      permanentAction: capa.permanentAction || null,
      preventiveAction: capa.preventiveAction || null,
      sections: Object.freeze(sections.map(Object.freeze)),
      effectivenessChecks: Object.freeze(capa.effectivenessChecks.slice()),
      escalationHistory: Object.freeze(capa.escalationHistory.slice()),
      labels: Object.freeze({
        he: LABELS_HE,
        en: LABELS_EN,
      }),
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Public: metrics — KPI rollup for a given period
  // ──────────────────────────────────────────────────────────────

  /**
   * Compute KPIs for all CAPAs created inside the `period` window.
   *
   * @param {Object|string} period
   *   - string 'all'              — all CAPAs
   *   - { from: Date, to: Date }  — explicit window
   * @returns {Object} metrics
   */
  metrics(period) {
    let from = null;
    let to = null;
    if (period && typeof period === 'object') {
      if (period.from) from = _toDate(period.from);
      if (period.to) to = _toDate(period.to);
    }

    const inWindow = (iso) => {
      const t = new Date(iso).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      return true;
    };

    let total = 0;
    let open = 0;
    let closed = 0;
    let escalated = 0;
    let ineffective = 0;
    let sumContainmentDays = 0;
    let containmentCount = 0;
    let sumResolutionDays = 0;
    let resolutionCount = 0;
    const byTrigger = {};
    const bySeverity = {};

    // For recurrence: group closed CAPAs by sourceId and by root-cause token set.
    const sourceMap = new Map();

    for (const capa of this._capas.values()) {
      if (!inWindow(capa.createdAt)) continue;
      total += 1;

      byTrigger[capa.trigger] = (byTrigger[capa.trigger] || 0) + 1;
      bySeverity[capa.severity] = (bySeverity[capa.severity] || 0) + 1;

      if (capa.status === STATUS.CLOSED) {
        closed += 1;
        if (capa.closedAt) {
          sumResolutionDays += _daysBetween(capa.createdAt, capa.closedAt);
          resolutionCount += 1;
        }
      } else if (capa.status === STATUS.ARCHIVED) {
        // do not count archived in open/closed
      } else {
        open += 1;
      }

      if (capa.status === STATUS.ESCALATED || capa.escalationLevel > 0) {
        escalated += 1;
      }
      if (capa.closureOutcome === 'INEFFECTIVE') {
        ineffective += 1;
      }

      if (capa.containmentAt) {
        sumContainmentDays += _daysBetween(capa.createdAt, capa.containmentAt);
        containmentCount += 1;
      }

      if (capa.sourceId) {
        if (!sourceMap.has(capa.sourceId)) sourceMap.set(capa.sourceId, 0);
        sourceMap.set(capa.sourceId, sourceMap.get(capa.sourceId) + 1);
      }
    }

    // Recurrence rate = # sources that appeared in >1 CAPA / # unique sources
    let recurrentSources = 0;
    let uniqueSources = 0;
    for (const count of sourceMap.values()) {
      uniqueSources += 1;
      if (count > 1) recurrentSources += 1;
    }
    const recurrenceRate = uniqueSources === 0
      ? 0
      : Number((recurrentSources / uniqueSources).toFixed(4));

    const avgTimeToContainment = containmentCount === 0
      ? null
      : Number((sumContainmentDays / containmentCount).toFixed(2));
    const avgTimeToResolution = resolutionCount === 0
      ? null
      : Number((sumResolutionDays / resolutionCount).toFixed(2));

    return Object.freeze({
      period: Object.freeze({
        from: from ? _isoDate(from) : null,
        to:   to   ? _isoDate(to)   : null,
      }),
      total,
      open,
      closed,
      escalated,
      ineffective,
      effectivenessRate: closed === 0
        ? null
        : Number(((closed - ineffective) / closed).toFixed(4)),
      avgTimeToContainmentDays: avgTimeToContainment,
      avgTimeToResolutionDays:  avgTimeToResolution,
      recurrenceRate,
      byTrigger:  Object.freeze(Object.assign({}, byTrigger)),
      bySeverity: Object.freeze(Object.assign({}, bySeverity)),
      computedAt: _iso(this._now()),
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Public: escalation — auto-escalate aged CAPAs
  // ──────────────────────────────────────────────────────────────

  /**
   * Compute (and record) the escalation level for a single CAPA based
   * on how long it has been sitting past its current stage SLA.
   *
   *   0 — on time
   *   1 — > 3 days overdue → supervisor
   *   2 — > 7 days         → manager
   *   3 — > 14 days        → executive / QM
   *
   * @param {string} capaId
   * @returns {Object} escalation record
   */
  escalation(capaId) {
    const capa = this._capas.get(capaId);
    if (!capa) {
      throw new Error('capa-workflow: CAPA not found — ' + capaId);
    }
    if (capa.status === STATUS.CLOSED || capa.status === STATUS.ARCHIVED) {
      return Object.freeze({
        capaId,
        level: 0,
        reason: 'not-active',
        overdueDays: 0,
        recordedAt: _iso(this._now()),
      });
    }

    const stageSlot = capa.stages[capa.currentStage];
    if (!stageSlot || !stageSlot.dueAt) {
      return Object.freeze({
        capaId,
        level: 0,
        reason: 'no-sla',
        overdueDays: 0,
        recordedAt: _iso(this._now()),
      });
    }

    const now = this._now();
    const dueMs = new Date(stageSlot.dueAt).getTime();
    const diffDays = Math.floor((now.getTime() - dueMs) / MS_PER_DAY);
    const overdueDays = Math.max(0, diffDays);

    let level = 0;
    let target = null;
    if (overdueDays >= ESCALATION_DAYS.LEVEL_3_EXECUTIVE) {
      level = 3;
      target = 'executive-quality-manager';
    } else if (overdueDays >= ESCALATION_DAYS.LEVEL_2_MANAGER) {
      level = 2;
      target = 'department-manager';
    } else if (overdueDays >= ESCALATION_DAYS.LEVEL_1_SUPERVISOR) {
      level = 1;
      target = 'supervisor';
    }

    const record = Object.freeze({
      capaId,
      level,
      target,
      stage: capa.currentStage,
      overdueDays,
      severity: capa.severity,
      recordedAt: _iso(now),
    });

    // persist only if level changed or is > 0
    if (level > capa.escalationLevel) {
      capa.escalationLevel = level;
      capa.escalationHistory.push(record);
      capa.updatedAt = _iso(now);
      if (level > 0) capa.status = STATUS.ESCALATED;
    }

    return record;
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers for integration (Y-037 NCR etc.)
  // ──────────────────────────────────────────────────────────────

  /** Return the full CAPA (frozen shell) — read-only. */
  getCAPA(capaId) {
    const capa = this._capas.get(capaId);
    if (!capa) return null;
    return _freezeShallow(Object.assign({}, capa));
  }

  /** Archive (soft-delete) a CAPA — we never truly delete. */
  archiveCAPA(capaId, reason) {
    const capa = this._capas.get(capaId);
    if (!capa) {
      throw new Error('capa-workflow: CAPA not found — ' + capaId);
    }
    capa.status = STATUS.ARCHIVED;
    capa.archivedAt = _iso(this._now());
    capa.archiveReason = reason || 'archived';
    return _freezeShallow(Object.assign({}, capa));
  }

  /** Count total CAPAs (for tests / dashboards). */
  count() {
    return this._capas.size;
  }

  /** Test helper — reset store. */
  _reset() {
    this._capas.clear();
    this._byOwner.clear();
    this._bySource.clear();
    this._counter = 0;
  }
}

// ══════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════

module.exports = {
  CAPAWorkflow,
  // constants for callers / tests
  STAGES,
  STAGE_ORDER,
  TRIGGERS,
  SEVERITIES,
  STATUS,
  STAGE_SLA_DAYS,
  ESCALATION_DAYS,
  SEVERITY_SLA_MULTIPLIER,
  MIN_EFFECTIVENESS_WAIT_DAYS,
  ISO_9001_REFS,
  LABELS_HE,
  LABELS_EN,
};
