/**
 * ONYX PROCUREMENT — Automated Follow-up Engine
 * ──────────────────────────────────────────────────────────────────
 * Agent Y-129 — Techno-Kol Uzi mega-ERP 2026
 *
 * Purpose (מטרה):
 *   Rules-based, event-triggered cadence engine used across sales,
 *   customer support and accounts receivable to drive automated
 *   follow-ups WITHOUT actually delivering any message. The engine
 *   emits "envelopes" — structured dispatch intents — that are then
 *   handed off to:
 *
 *     • Y-121 (email-templates)  — rendered email payloads
 *     • Y-122 (sms-gateway)       — Israeli SMS providers
 *     • Y-123 (whatsapp)          — WhatsApp Business API
 *
 *   The engine is deterministic: given the same (cadences, enrollments,
 *   tick timestamps, condition evaluations), it always emits the same
 *   set of envelopes. This lets us unit-test every branch without real
 *   network traffic.
 *
 * Rule enforced (הכלל הבלתי-עביר):
 *   "לא מוחקים רק משדרגים ומגדלים"
 *   — Nothing is ever deleted. Skipping a step appends to a skip log.
 *     Completing an enrollment freezes its state. Emergency-stop
 *     flips a flag; it does NOT drop the enrollment from memory. The
 *     full append-only `history()` trail survives every operation.
 *
 * Triggers (טריגרים):
 *   opportunity-created     — הזדמנות מכירה חדשה
 *   quote-sent              — הצעת מחיר נשלחה
 *   demo-scheduled          — הדגמה נקבעה
 *   invoice-due-soon        — חשבונית לקראת פרעון
 *   invoice-overdue         — חשבונית באיחור
 *   support-ticket-open     — קריאת שירות פתוחה
 *   customer-silent-90d     — לקוח לא פעיל 90 יום
 *   lead-stuck              — ליד תקוע
 *
 * Channels (ערוצים) for envelopes:
 *   email | sms | whatsapp | task (internal task-assignment envelope)
 *
 * Conditions (תנאים — evaluated before each step):
 *   replied           — reply received since step emitted
 *   not-replied
 *   opened            — email/wa message marked opened
 *   not-opened
 *   clicked           — CTA click registered
 *   not-clicked
 *   amount-gt:<n>     — entity.amount > n
 *   amount-lt:<n>
 *
 * Storage:
 *   In-memory Maps. Everything is append-only.
 *
 * Zero external dependencies — Node built-ins only.
 */

'use strict';

const crypto = require('node:crypto');

// ──────────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────────

const TRIGGERS = Object.freeze([
  'opportunity-created',
  'quote-sent',
  'demo-scheduled',
  'invoice-due-soon',
  'invoice-overdue',
  'support-ticket-open',
  'customer-silent-90d',
  'lead-stuck'
]);

const TRIGGER_LABELS = Object.freeze({
  'opportunity-created':  { he: 'הזדמנות מכירה נפתחה',   en: 'Opportunity created' },
  'quote-sent':           { he: 'הצעת מחיר נשלחה',       en: 'Quote sent' },
  'demo-scheduled':       { he: 'הדגמה נקבעה',           en: 'Demo scheduled' },
  'invoice-due-soon':     { he: 'חשבונית לקראת פרעון',    en: 'Invoice due soon' },
  'invoice-overdue':      { he: 'חשבונית באיחור',          en: 'Invoice overdue' },
  'support-ticket-open':  { he: 'קריאת שירות פתוחה',      en: 'Support ticket open' },
  'customer-silent-90d':  { he: 'לקוח שקט 90 יום',        en: 'Customer silent 90 days' },
  'lead-stuck':           { he: 'ליד תקוע',               en: 'Lead stuck' }
});

const CHANNELS = Object.freeze(['email', 'sms', 'whatsapp', 'task']);

const OUTCOMES = Object.freeze([
  'responded',
  'converted',
  'dropped-out',
  'escalated'
]);

const ENROLLMENT_STATE = Object.freeze({
  ACTIVE:    'active',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  STOPPED:   'stopped'      // emergencyStop
});

const CONDITION_OPERATORS = Object.freeze([
  'replied',
  'not-replied',
  'opened',
  'not-opened',
  'clicked',
  'not-clicked',
  'amount-gt',
  'amount-lt'
]);

// ──────────────────────────────────────────────────────────────────
// INTERNAL HELPERS — zero-dep primitives
// ──────────────────────────────────────────────────────────────────

function _nowIso(now) {
  if (now == null) return new Date().toISOString();
  if (now instanceof Date) return now.toISOString();
  if (typeof now === 'number') return new Date(now).toISOString();
  if (typeof now === 'string') return new Date(now).toISOString();
  return new Date().toISOString();
}

function _toMs(now) {
  if (now == null) return Date.now();
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number') return now;
  if (typeof now === 'string') return Date.parse(now);
  return Date.now();
}

function _uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
}

function _frozenCopy(obj) {
  return Object.freeze(JSON.parse(JSON.stringify(obj)));
}

function _dayMs() { return 24 * 60 * 60 * 1000; }

// ──────────────────────────────────────────────────────────────────
// FollowupEngine — the whole feature lives here
// ──────────────────────────────────────────────────────────────────

class FollowupEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      clock: () => Date.now(),
      defaultLocale: 'he',
      onEnvelope: null       // optional async hook: (envelope) => void
    }, options);

    // cadenceId → cadence definition
    this._cadences = new Map();

    // entityId → Set<enrollmentId>
    this._entityIndex = new Map();

    // enrollmentId → enrollment record
    this._enrollments = new Map();

    // Append-only event log — every write goes here too.
    // Each entry is a frozen object with { seq, at, type, ... }
    this._log = [];

    // Envelopes emitted by processTick() — append-only, never pruned.
    // Each envelope is frozen.
    this._envelopes = [];

    // emergency-stop set: entityId → { at, reason }
    this._stopped = new Map();
  }

  // ────────────────────────────────────────────────────────────────
  // defineCadence — register a reusable cadence by id
  // ────────────────────────────────────────────────────────────────
  defineCadence(spec = {}) {
    const { id, name_he, name_en, trigger, steps } = spec;

    if (!id || typeof id !== 'string') {
      throw new Error('defineCadence: id is required');
    }
    if (!name_he && !name_en) {
      throw new Error('defineCadence: name_he or name_en required');
    }
    if (!TRIGGERS.includes(trigger)) {
      throw new Error(`defineCadence: invalid trigger "${trigger}". Valid: ${TRIGGERS.join(', ')}`);
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('defineCadence: at least one step required');
    }

    // Validate each step.
    const normSteps = steps.map((s, i) => {
      if (typeof s.offsetDays !== 'number' || !Number.isFinite(s.offsetDays)) {
        throw new Error(`defineCadence: step[${i}].offsetDays must be a finite number`);
      }
      if (!CHANNELS.includes(s.channel)) {
        throw new Error(`defineCadence: step[${i}].channel must be one of ${CHANNELS.join(', ')}`);
      }
      if (!s.template || typeof s.template !== 'string') {
        throw new Error(`defineCadence: step[${i}].template is required`);
      }
      const condition = s.condition || null;
      if (condition) {
        this._validateCondition(condition);
      }
      return Object.freeze({
        offsetDays:  s.offsetDays,
        channel:     s.channel,
        template:    s.template,
        condition:   condition,
        subject_he:  s.subject_he || null,
        subject_en:  s.subject_en || null
      });
    });

    // Preserve old cadence (upgrade, not replace) — keep a history
    // list so we never delete. Upgrading is allowed but the previous
    // version is kept under `_revisions` for auditability.
    const prior = this._cadences.get(id);
    const cadence = {
      id,
      name_he: name_he || name_en,
      name_en: name_en || name_he,
      trigger,
      steps: Object.freeze(normSteps),
      createdAt: prior ? prior.createdAt : _nowIso(this.options.clock()),
      updatedAt: _nowIso(this.options.clock()),
      _revisions: prior ? [...(prior._revisions || []), _frozenCopy(prior)] : []
    };
    this._cadences.set(id, cadence);
    this._appendLog({
      type: 'cadence-defined',
      cadenceId: id,
      trigger,
      stepCount: normSteps.length,
      upgraded: !!prior
    });
    return cadence;
  }

  _validateCondition(condition) {
    if (typeof condition !== 'string') {
      throw new Error('condition must be a string');
    }
    const [op] = condition.split(':');
    if (!CONDITION_OPERATORS.includes(op)) {
      throw new Error(`invalid condition operator "${op}". Valid: ${CONDITION_OPERATORS.join(', ')}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // enrollEntity — kick off a cadence for an entity
  // ────────────────────────────────────────────────────────────────
  enrollEntity(entityId, cadenceId, context = {}) {
    if (!entityId) throw new Error('enrollEntity: entityId is required');
    if (!this._cadences.has(cadenceId)) {
      throw new Error(`enrollEntity: unknown cadenceId "${cadenceId}"`);
    }
    if (this._stopped.has(entityId)) {
      // Emergency-stopped entities may not enroll into new cadences.
      const res = {
        ok: false,
        error: 'ENTITY_EMERGENCY_STOPPED',
        entityId,
        stoppedAt: this._stopped.get(entityId).at
      };
      this._appendLog({ type: 'enroll-blocked', entityId, cadenceId, reason: 'emergency-stop' });
      return res;
    }

    const cadence = this._cadences.get(cadenceId);
    const enrollmentId = _uid('enr');
    const nowMs = _toMs(this.options.clock());

    const enrollment = {
      id:            enrollmentId,
      entityId,
      cadenceId,
      trigger:       cadence.trigger,
      enrolledAt:    _nowIso(nowMs),
      enrolledAtMs:  nowMs,
      state:         ENROLLMENT_STATE.ACTIVE,
      currentStep:   0,
      context:       Object.assign({}, context),
      // append-only history for THIS enrollment
      history:       [],
      // append-only skip ledger
      skips:         [],
      // append-only emitted-envelope ids
      emitted:       [],
      // response flags used for condition evaluation
      flags: {
        replied:  false,
        opened:   false,
        clicked:  false,
        unsubscribed: false
      },
      pausedUntilMs: null,
      outcome:       null,
      completedAt:   null
    };

    this._enrollments.set(enrollmentId, enrollment);
    if (!this._entityIndex.has(entityId)) this._entityIndex.set(entityId, new Set());
    this._entityIndex.get(entityId).add(enrollmentId);

    this._appendHistory(enrollment, { type: 'enrolled', cadenceId, trigger: cadence.trigger });
    this._appendLog({ type: 'enrolled', enrollmentId, entityId, cadenceId });

    return {
      ok: true,
      enrollmentId,
      entityId,
      cadenceId,
      state: enrollment.state
    };
  }

  // ────────────────────────────────────────────────────────────────
  // processTick — walk all active enrollments, emit due envelopes
  // ────────────────────────────────────────────────────────────────
  processTick(now) {
    const nowMs = _toMs(now || this.options.clock());
    const emitted = [];
    const skipped = [];

    for (const enrollment of this._enrollments.values()) {
      // Skip terminal states (completed / emergency-stopped).
      if (enrollment.state === ENROLLMENT_STATE.COMPLETED) continue;
      if (enrollment.state === ENROLLMENT_STATE.STOPPED) continue;

      // Paused branch — either auto-resume or stay paused.
      if (enrollment.state === ENROLLMENT_STATE.PAUSED) {
        if (enrollment.pausedUntilMs && nowMs >= enrollment.pausedUntilMs) {
          // Auto-resume: clear the pause, log the resume, continue the tick.
          enrollment.state = ENROLLMENT_STATE.ACTIVE;
          enrollment.pausedUntilMs = null;
          this._appendHistory(enrollment, { type: 'auto-resumed', at: _nowIso(nowMs) });
        } else {
          continue; // still paused — skip this enrollment entirely.
        }
      }

      const cadence = this._cadences.get(enrollment.cadenceId);
      if (!cadence) continue;

      // Loop the step pointer forward while the current step is due
      // AND has not been gated out by a condition. We may emit multiple
      // envelopes in one tick if several steps have come due together.
      // This mirrors batch processing after an outage.
      let safetyCounter = 0;
      while (enrollment.state === ENROLLMENT_STATE.ACTIVE) {
        safetyCounter += 1;
        if (safetyCounter > 1000) break; // anti-runaway

        const stepIndex = enrollment.currentStep;
        if (stepIndex >= cadence.steps.length) {
          // All steps done — mark as completed with a natural outcome.
          this._autoCompleteEnrollment(enrollment, nowMs);
          break;
        }

        const step = cadence.steps[stepIndex];
        const dueAtMs = enrollment.enrolledAtMs + step.offsetDays * _dayMs();
        if (nowMs < dueAtMs) break; // not due yet

        // Condition gate
        if (step.condition) {
          const entitySnapshot = this._buildEntitySnapshot(enrollment);
          const shouldRun = this.conditionEvaluator(step.condition, entitySnapshot);
          if (!shouldRun) {
            // Gated out — append skip and advance pointer.
            const skipRec = Object.freeze({
              stepIndex,
              condition: step.condition,
              reason: 'condition-false',
              at: _nowIso(nowMs),
              auto: true
            });
            enrollment.skips.push(skipRec);
            this._appendHistory(enrollment, {
              type: 'step-skipped',
              stepIndex,
              reason: 'condition-false',
              condition: step.condition
            });
            skipped.push({ enrollmentId: enrollment.id, stepIndex, reason: 'condition-false' });
            enrollment.currentStep = stepIndex + 1;
            continue;
          }
        }

        // Build & persist envelope.
        const envelope = this._buildEnvelope(enrollment, cadence, step, stepIndex, nowMs);
        this._envelopes.push(envelope);
        enrollment.emitted.push(envelope.id);
        this._appendHistory(enrollment, {
          type: 'step-emitted',
          stepIndex,
          envelopeId: envelope.id,
          channel: step.channel,
          template: step.template
        });
        emitted.push(envelope);

        enrollment.currentStep = stepIndex + 1;
      }
    }

    // Fire a lifecycle hook for each envelope if the caller supplied one.
    if (typeof this.options.onEnvelope === 'function') {
      for (const env of emitted) {
        try {
          this.options.onEnvelope(env);
        } catch (_e) { /* swallow — hook failure never breaks the tick */ }
      }
    }

    this._appendLog({
      type: 'tick',
      at: _nowIso(nowMs),
      emitted: emitted.length,
      skipped: skipped.length
    });

    return { at: _nowIso(nowMs), emitted, skipped };
  }

  _buildEnvelope(enrollment, cadence, step, stepIndex, nowMs) {
    return Object.freeze({
      id:            _uid('env'),
      enrollmentId:  enrollment.id,
      entityId:      enrollment.entityId,
      cadenceId:     cadence.id,
      cadenceName_he: cadence.name_he,
      cadenceName_en: cadence.name_en,
      trigger:       cadence.trigger,
      stepIndex,
      channel:       step.channel,
      template:      step.template,
      subject_he:    step.subject_he,
      subject_en:    step.subject_en,
      context:       Object.freeze(Object.assign({}, enrollment.context)),
      emittedAt:     _nowIso(nowMs),
      // Downstream routing hint — which Y-agent will actually deliver.
      delivery: Object.freeze({
        email:    'Y-121:email-templates',
        sms:      'Y-122:sms-gateway',
        whatsapp: 'Y-123:whatsapp',
        task:     'internal:task-queue'
      }[step.channel] || 'unknown')
    });
  }

  _buildEntitySnapshot(enrollment) {
    return Object.assign(
      {},
      enrollment.context || {},
      { _flags: Object.assign({}, enrollment.flags) }
    );
  }

  _autoCompleteEnrollment(enrollment, nowMs) {
    enrollment.state = ENROLLMENT_STATE.COMPLETED;
    enrollment.outcome = enrollment.flags.replied ? 'responded' : 'dropped-out';
    enrollment.completedAt = _nowIso(nowMs);
    this._appendHistory(enrollment, {
      type: 'auto-completed',
      outcome: enrollment.outcome
    });
    this._appendLog({
      type: 'enrollment-completed',
      enrollmentId: enrollment.id,
      outcome: enrollment.outcome,
      auto: true
    });
  }

  // ────────────────────────────────────────────────────────────────
  // skipStep — manual skip with reason (append-only)
  // ────────────────────────────────────────────────────────────────
  skipStep(enrollmentId, stepIndex, reason) {
    const enrollment = this._enrollments.get(enrollmentId);
    if (!enrollment) return { ok: false, error: 'UNKNOWN_ENROLLMENT' };
    if (typeof stepIndex !== 'number') {
      return { ok: false, error: 'STEP_INDEX_REQUIRED' };
    }
    const cadence = this._cadences.get(enrollment.cadenceId);
    if (!cadence) return { ok: false, error: 'UNKNOWN_CADENCE' };
    if (stepIndex < 0 || stepIndex >= cadence.steps.length) {
      return { ok: false, error: 'STEP_OUT_OF_RANGE', stepIndex };
    }
    const skipRec = Object.freeze({
      stepIndex,
      reason: reason || 'manual-skip',
      at: _nowIso(this.options.clock()),
      auto: false
    });
    enrollment.skips.push(skipRec);
    // Fast-forward the pointer past this step if we haven't yet.
    if (enrollment.currentStep <= stepIndex) {
      enrollment.currentStep = stepIndex + 1;
    }
    this._appendHistory(enrollment, {
      type: 'manual-skip',
      stepIndex,
      reason: skipRec.reason
    });
    this._appendLog({
      type: 'step-skipped-manual',
      enrollmentId,
      stepIndex,
      reason: skipRec.reason
    });
    return { ok: true, enrollmentId, stepIndex, reason: skipRec.reason };
  }

  // ────────────────────────────────────────────────────────────────
  // completeEnrollment — caller-driven finalization
  // ────────────────────────────────────────────────────────────────
  completeEnrollment(enrollmentId, outcome) {
    const enrollment = this._enrollments.get(enrollmentId);
    if (!enrollment) return { ok: false, error: 'UNKNOWN_ENROLLMENT' };
    if (!OUTCOMES.includes(outcome)) {
      return {
        ok: false,
        error: 'INVALID_OUTCOME',
        outcome,
        valid: OUTCOMES.slice()
      };
    }
    if (enrollment.state === ENROLLMENT_STATE.COMPLETED) {
      // Idempotent upgrade — keep the original outcome, append history.
      this._appendHistory(enrollment, {
        type: 'complete-ignored',
        reason: 'already-completed',
        requestedOutcome: outcome
      });
      return { ok: true, enrollmentId, outcome: enrollment.outcome, already: true };
    }
    enrollment.state = ENROLLMENT_STATE.COMPLETED;
    enrollment.outcome = outcome;
    enrollment.completedAt = _nowIso(this.options.clock());
    this._appendHistory(enrollment, { type: 'completed', outcome });
    this._appendLog({ type: 'enrollment-completed', enrollmentId, outcome, auto: false });
    return { ok: true, enrollmentId, outcome };
  }

  // ────────────────────────────────────────────────────────────────
  // pauseEnrollment — put on hold until a future timestamp
  // ────────────────────────────────────────────────────────────────
  pauseEnrollment(enrollmentId, until) {
    const enrollment = this._enrollments.get(enrollmentId);
    if (!enrollment) return { ok: false, error: 'UNKNOWN_ENROLLMENT' };
    if (enrollment.state === ENROLLMENT_STATE.COMPLETED) {
      return { ok: false, error: 'ALREADY_COMPLETED' };
    }
    if (enrollment.state === ENROLLMENT_STATE.STOPPED) {
      return { ok: false, error: 'ENROLLMENT_STOPPED' };
    }
    const untilMs = _toMs(until);
    if (!Number.isFinite(untilMs)) {
      return { ok: false, error: 'INVALID_UNTIL' };
    }
    enrollment.state = ENROLLMENT_STATE.PAUSED;
    enrollment.pausedUntilMs = untilMs;
    this._appendHistory(enrollment, {
      type: 'paused',
      until: _nowIso(untilMs)
    });
    this._appendLog({ type: 'enrollment-paused', enrollmentId, until: _nowIso(untilMs) });
    return { ok: true, enrollmentId, until: _nowIso(untilMs) };
  }

  // Optional: manual resume (processTick also auto-resumes on due time).
  resumeEnrollment(enrollmentId) {
    const enrollment = this._enrollments.get(enrollmentId);
    if (!enrollment) return { ok: false, error: 'UNKNOWN_ENROLLMENT' };
    if (enrollment.state !== ENROLLMENT_STATE.PAUSED) {
      return { ok: false, error: 'NOT_PAUSED' };
    }
    enrollment.state = ENROLLMENT_STATE.ACTIVE;
    enrollment.pausedUntilMs = null;
    this._appendHistory(enrollment, { type: 'resumed' });
    this._appendLog({ type: 'enrollment-resumed', enrollmentId });
    return { ok: true, enrollmentId };
  }

  // ────────────────────────────────────────────────────────────────
  // emergencyStop — kill every active cadence for an entity
  // ────────────────────────────────────────────────────────────────
  emergencyStop(entityId, reason = 'do-not-contact') {
    if (!entityId) return { ok: false, error: 'ENTITY_ID_REQUIRED' };
    const at = _nowIso(this.options.clock());
    this._stopped.set(entityId, { at, reason });

    const affectedIds = [];
    const pool = this._entityIndex.get(entityId) || new Set();
    for (const enrollmentId of pool) {
      const enrollment = this._enrollments.get(enrollmentId);
      if (!enrollment) continue;
      if (enrollment.state === ENROLLMENT_STATE.COMPLETED) continue;
      if (enrollment.state === ENROLLMENT_STATE.STOPPED) continue;
      enrollment.state = ENROLLMENT_STATE.STOPPED;
      enrollment.flags.unsubscribed = true;
      this._appendHistory(enrollment, { type: 'emergency-stopped', reason });
      affectedIds.push(enrollmentId);
    }

    this._appendLog({
      type: 'emergency-stop',
      entityId,
      reason,
      affected: affectedIds.length
    });

    return { ok: true, entityId, affected: affectedIds.length, stoppedAt: at, reason };
  }

  // ────────────────────────────────────────────────────────────────
  // recordResponse — called by Y-121/122/123 when a reply/open/click
  // event comes back. Does NOT deliver anything; it just flips flags
  // so subsequent condition evaluations see the new state.
  // ────────────────────────────────────────────────────────────────
  recordResponse(enrollmentId, kind, meta = {}) {
    const enrollment = this._enrollments.get(enrollmentId);
    if (!enrollment) return { ok: false, error: 'UNKNOWN_ENROLLMENT' };
    const valid = new Set(['replied', 'opened', 'clicked', 'unsubscribed']);
    if (!valid.has(kind)) {
      return { ok: false, error: 'INVALID_KIND', kind };
    }
    enrollment.flags[kind] = true;
    this._appendHistory(enrollment, { type: 'response', kind, meta });
    this._appendLog({ type: 'response', enrollmentId, kind });
    return { ok: true, enrollmentId, kind };
  }

  // ────────────────────────────────────────────────────────────────
  // effectiveness — per-cadence metrics over a period
  // Returns { sent, responded, converted, unsub, responseRate,
  //           conversionRate, unsubRate, period }
  // ────────────────────────────────────────────────────────────────
  effectiveness({ cadenceId, period } = {}) {
    if (!cadenceId) return { ok: false, error: 'CADENCE_ID_REQUIRED' };
    if (!this._cadences.has(cadenceId)) {
      return { ok: false, error: 'UNKNOWN_CADENCE' };
    }

    let fromMs = -Infinity;
    let toMs   =  Infinity;
    if (period && typeof period === 'object') {
      if (period.from) fromMs = _toMs(period.from);
      if (period.to)   toMs   = _toMs(period.to);
    }

    let sent = 0;
    let responded = 0;
    let converted = 0;
    let unsub = 0;
    let enrolled = 0;
    let completed = 0;

    for (const enrollment of this._enrollments.values()) {
      if (enrollment.cadenceId !== cadenceId) continue;
      const enrMs = enrollment.enrolledAtMs;
      if (enrMs < fromMs || enrMs > toMs) continue;
      enrolled += 1;
      sent += enrollment.emitted.length;
      if (enrollment.flags.replied) responded += 1;
      if (enrollment.outcome === 'converted') converted += 1;
      if (enrollment.flags.unsubscribed) unsub += 1;
      if (enrollment.state === ENROLLMENT_STATE.COMPLETED) completed += 1;
    }

    const safeRate = (num, denom) =>
      denom > 0 ? +(num / denom).toFixed(4) : 0;

    return {
      ok: true,
      cadenceId,
      period: {
        from: Number.isFinite(fromMs) ? _nowIso(fromMs) : null,
        to:   Number.isFinite(toMs)   ? _nowIso(toMs)   : null
      },
      enrolled,
      completed,
      sent,
      responded,
      converted,
      unsub,
      responseRate:   safeRate(responded, enrolled),
      conversionRate: safeRate(converted, enrolled),
      unsubRate:      safeRate(unsub, enrolled)
    };
  }

  // ────────────────────────────────────────────────────────────────
  // listActive — enumerate currently-active enrollments
  // ────────────────────────────────────────────────────────────────
  listActive({ trigger, cadenceId } = {}) {
    const out = [];
    for (const enrollment of this._enrollments.values()) {
      if (enrollment.state !== ENROLLMENT_STATE.ACTIVE &&
          enrollment.state !== ENROLLMENT_STATE.PAUSED) continue;
      if (trigger && enrollment.trigger !== trigger) continue;
      if (cadenceId && enrollment.cadenceId !== cadenceId) continue;
      out.push({
        id:           enrollment.id,
        entityId:     enrollment.entityId,
        cadenceId:    enrollment.cadenceId,
        trigger:      enrollment.trigger,
        state:        enrollment.state,
        currentStep:  enrollment.currentStep,
        enrolledAt:   enrollment.enrolledAt,
        pausedUntil:  enrollment.pausedUntilMs
                        ? _nowIso(enrollment.pausedUntilMs)
                        : null
      });
    }
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  // history — full append-only log for an entity
  // Aggregates every enrollment's own history + global log entries
  // referring to that entity.
  // ────────────────────────────────────────────────────────────────
  history(entityId) {
    if (!entityId) return [];
    const pool = this._entityIndex.get(entityId) || new Set();
    const out = [];
    for (const enrollmentId of pool) {
      const enrollment = this._enrollments.get(enrollmentId);
      if (!enrollment) continue;
      for (const h of enrollment.history) {
        out.push(Object.assign({ enrollmentId }, h));
      }
    }
    // Sort by seq for stable ordering.
    out.sort((a, b) => (a._seq || 0) - (b._seq || 0));
    return out;
  }

  // ────────────────────────────────────────────────────────────────
  // conditionEvaluator — pure function, exported for test-ability
  // ────────────────────────────────────────────────────────────────
  conditionEvaluator(condition, entity) {
    if (!condition) return true;
    if (!entity) entity = {};
    const flags = entity._flags || {};
    const [op, rawArg] = String(condition).split(':');

    switch (op) {
      case 'replied':      return !!flags.replied;
      case 'not-replied':  return !flags.replied;
      case 'opened':       return !!flags.opened;
      case 'not-opened':   return !flags.opened;
      case 'clicked':      return !!flags.clicked;
      case 'not-clicked':  return !flags.clicked;
      case 'amount-gt': {
        const n = Number(rawArg);
        return Number.isFinite(n) && Number(entity.amount) > n;
      }
      case 'amount-lt': {
        const n = Number(rawArg);
        return Number.isFinite(n) && Number(entity.amount) < n;
      }
      default:
        return false;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Introspection helpers
  // ────────────────────────────────────────────────────────────────
  getCadence(cadenceId) {
    const c = this._cadences.get(cadenceId);
    return c ? _frozenCopy(c) : null;
  }

  getEnrollment(enrollmentId) {
    const e = this._enrollments.get(enrollmentId);
    if (!e) return null;
    // Return a snapshot copy — callers must not mutate internal state.
    return _frozenCopy(e);
  }

  getEnvelopes({ enrollmentId, entityId, channel } = {}) {
    return this._envelopes
      .filter((e) => !enrollmentId || e.enrollmentId === enrollmentId)
      .filter((e) => !entityId || e.entityId === entityId)
      .filter((e) => !channel || e.channel === channel)
      .slice();
  }

  getLog() {
    return this._log.slice();
  }

  isEmergencyStopped(entityId) {
    return this._stopped.has(entityId);
  }

  // ────────────────────────────────────────────────────────────────
  // Internal: append-only log helpers
  // ────────────────────────────────────────────────────────────────
  _appendLog(entry) {
    const rec = Object.freeze(Object.assign(
      { _seq: this._log.length, at: _nowIso(this.options.clock()) },
      entry
    ));
    this._log.push(rec);
    return rec;
  }

  _appendHistory(enrollment, entry) {
    const rec = Object.freeze(Object.assign(
      {
        _seq: this._log.length + enrollment.history.length,
        at: _nowIso(this.options.clock())
      },
      entry
    ));
    enrollment.history.push(rec);
    return rec;
  }
}

// ──────────────────────────────────────────────────────────────────
// EXPORTS
// ──────────────────────────────────────────────────────────────────
module.exports = {
  FollowupEngine,
  TRIGGERS,
  TRIGGER_LABELS,
  CHANNELS,
  OUTCOMES,
  ENROLLMENT_STATE,
  CONDITION_OPERATORS
};
module.exports.default = FollowupEngine;
