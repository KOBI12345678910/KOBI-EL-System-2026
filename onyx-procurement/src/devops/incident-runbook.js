/**
 * incident-runbook.js — Incident Response Runbook Engine
 * Agent Y-180 — Techno-Kol Uzi mega-ERP — written 2026-04-11
 *
 * Zero dependencies. Pure Node.js built-ins only. No disk I/O.
 * Every method is pure or mutates in-memory state of the IncidentRunbook
 * instance. The caller is responsible for persistence, transport, and
 * actually sending notifications (Slack webhooks, status-page APIs,
 * regulator email, etc.).
 *
 * Principle: "לא מוחקים רק משדרגים ומגדלים" — runbooks, incidents, and
 * audit-log entries are append-only. Once a step is advanced it becomes
 * history; you cannot remove it. You may only add new steps, new
 * runbooks, and new incidents.
 *
 * Bilingual: every user-facing string ships in both Hebrew (he) and
 * English (en). The engine never guesses a locale — callers pick one
 * when they render templates. Comms templates, postmortem skeleton,
 * severity metadata, and the Israeli PDPL breach notice all carry
 * parallel he/en payloads.
 *
 * Public API:
 *   const { IncidentRunbook, SEVERITY, ESCALATION_CHAIN } =
 *     require('./incident-runbook');
 *   const rb = new IncidentRunbook({ now: () => Date.now() });
 *   rb.defineRunbook('db-outage', [ ...steps ]);
 *   const incidentId = rb.start({
 *     scenario: 'db-outage',
 *     severity: 'SEV1',
 *     title: { he: 'נפילת מסד נתונים', en: 'Database outage' },
 *     reporter: 'oncall-1',
 *   });
 *   rb.advance(incidentId, 'verify-replica', 'ok');
 *   rb.renderSlack(incidentId, 'he');
 *   rb.renderStatusPage(incidentId, 'en');
 *   rb.renderRegulatorNotice(incidentId, 'he');  // only if PDPL breach
 *   rb.renderPostmortem(incidentId);
 *
 * SLA (severity → response / resolution minutes):
 *   SEV1 : respond 5m,   resolve 240m (4h)
 *   SEV2 : respond 15m,  resolve 480m (8h)
 *   SEV3 : respond 60m,  resolve 1440m (24h)
 *   SEV4 : respond 240m, resolve 4320m (72h)
 *
 * Escalation chain: on-call → lead → director. Each rung fires when the
 * corresponding SLA threshold is blown. The engine never wakes anyone up
 * itself — it only flags which rung *should* be paged and records the
 * decision in the append-only audit log.
 *
 * Israeli Privacy Protection Law Amendment 13 ("חוק הגנת הפרטיות תיקון
 * 13") mandates that material personal-data breaches be reported to the
 * Privacy Protection Authority ("הרשות להגנת הפרטיות") within 72 hours
 * of discovery, and that affected data subjects be notified without
 * undue delay. renderRegulatorNotice() emits a bilingual template that
 * fills in the mandatory fields; renderDataSubjectNotice() emits the
 * user-facing version.
 */

'use strict';

/* ------------------------------------------------------------------ *
 *  Constants                                                         *
 * ------------------------------------------------------------------ */

const SEVERITY = Object.freeze({
  SEV1: Object.freeze({
    code: 'SEV1',
    label: Object.freeze({ he: 'חמור ביותר', en: 'Critical' }),
    description: Object.freeze({
      he: 'השבתה מלאה או אובדן נתונים — פגיעה בכלל המשתמשים',
      en: 'Full outage or data loss — all users impacted',
    }),
    responseMinutes: 5,
    resolutionMinutes: 240,
    wakeOnCall: true,
    pageDirector: true,
  }),
  SEV2: Object.freeze({
    code: 'SEV2',
    label: Object.freeze({ he: 'חמור', en: 'High' }),
    description: Object.freeze({
      he: 'השבתה חלקית או פגיעה בפונקציונליות קריטית',
      en: 'Partial outage or critical feature degraded',
    }),
    responseMinutes: 15,
    resolutionMinutes: 480,
    wakeOnCall: true,
    pageDirector: false,
  }),
  SEV3: Object.freeze({
    code: 'SEV3',
    label: Object.freeze({ he: 'בינוני', en: 'Medium' }),
    description: Object.freeze({
      he: 'תקלה בפיצ׳ר משני, יש דרך עקיפה',
      en: 'Minor feature broken, workaround exists',
    }),
    responseMinutes: 60,
    resolutionMinutes: 1440,
    wakeOnCall: false,
    pageDirector: false,
  }),
  SEV4: Object.freeze({
    code: 'SEV4',
    label: Object.freeze({ he: 'נמוך', en: 'Low' }),
    description: Object.freeze({
      he: 'באג קוסמטי או הערת תיעוד',
      en: 'Cosmetic bug or documentation note',
    }),
    responseMinutes: 240,
    resolutionMinutes: 4320,
    wakeOnCall: false,
    pageDirector: false,
  }),
});

const ESCALATION_CHAIN = Object.freeze([
  Object.freeze({
    rung: 1,
    role: 'on-call',
    label: Object.freeze({ he: 'כונן ראשי', en: 'Primary On-Call' }),
    triggerAt: 'respond',
  }),
  Object.freeze({
    rung: 2,
    role: 'lead',
    label: Object.freeze({ he: 'ראש צוות DevOps', en: 'DevOps Lead' }),
    triggerAt: 'response_sla_miss',
  }),
  Object.freeze({
    rung: 3,
    role: 'director',
    label: Object.freeze({ he: 'מנהל הנדסה', en: 'Engineering Director' }),
    triggerAt: 'resolution_sla_miss',
  }),
]);

const INCIDENT_STATE = Object.freeze({
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  MITIGATED: 'MITIGATED',
  RESOLVED: 'RESOLVED',
  POSTMORTEM: 'POSTMORTEM',
  CLOSED: 'CLOSED',
});

const STEP_OUTCOME = Object.freeze({
  OK: 'ok',
  FAIL: 'fail',
  SKIP: 'skip',
  ESCALATE: 'escalate',
});

/* ------------------------------------------------------------------ *
 *  Helpers                                                           *
 * ------------------------------------------------------------------ */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

function bilingual(he, en) {
  return Object.freeze({ he: String(he), en: String(en) });
}

function assertLocale(locale) {
  if (locale !== 'he' && locale !== 'en') {
    throw new Error(
      "incident-runbook: locale must be 'he' or 'en', got: " + locale
    );
  }
}

function assertSeverity(sev) {
  if (!Object.prototype.hasOwnProperty.call(SEVERITY, sev)) {
    throw new Error(
      'incident-runbook: unknown severity ' +
        sev +
        ' — valid: SEV1, SEV2, SEV3, SEV4'
    );
  }
}

function cloneSteps(steps) {
  // Deep-ish clone that preserves the decision tree shape.
  return steps.map(function (step) {
    if (!step || typeof step !== 'object') {
      throw new Error('incident-runbook: step must be an object');
    }
    if (typeof step.id !== 'string' || !step.id) {
      throw new Error('incident-runbook: every step needs a string id');
    }
    const branches = step.branches
      ? Object.assign({}, step.branches)
      : Object.freeze({});
    const actions = Array.isArray(step.actions) ? step.actions.slice() : [];
    return {
      id: step.id,
      title: step.title || bilingual(step.id, step.id),
      owner: step.owner || 'on-call',
      timerMinutes:
        typeof step.timerMinutes === 'number' ? step.timerMinutes : null,
      actions: actions,
      branches: branches, // { outcome: nextStepId | 'END' }
      terminal: Boolean(step.terminal),
    };
  });
}

/* ------------------------------------------------------------------ *
 *  Comms Templates (bilingual)                                       *
 * ------------------------------------------------------------------ */

const TEMPLATES = Object.freeze({
  slackInternal: Object.freeze({
    he:
      ':rotating_light: *אירוע ${severity} — ${title}*\n' +
      'מזהה: ${id}\n' +
      'מצב: ${state}\n' +
      'דווח על ידי: ${reporter}\n' +
      'זמן פתיחה: ${openedAt}\n' +
      'כונן אחראי: ${oncall}\n' +
      'צעד נוכחי: ${currentStep}\n' +
      'SLA תגובה: ${respondBy}\n' +
      'SLA פתרון: ${resolveBy}\n' +
      'ערוץ: #incident-${id}',
    en:
      ':rotating_light: *Incident ${severity} — ${title}*\n' +
      'ID: ${id}\n' +
      'State: ${state}\n' +
      'Reporter: ${reporter}\n' +
      'Opened: ${openedAt}\n' +
      'On-call: ${oncall}\n' +
      'Current step: ${currentStep}\n' +
      'Response SLA: ${respondBy}\n' +
      'Resolution SLA: ${resolveBy}\n' +
      'Channel: #incident-${id}',
  }),
  statusPage: Object.freeze({
    he:
      '[${severity}] ${title}\n' +
      'עודכן: ${updatedAt}\n' +
      'אנו חוקרים כרגע בעיה המשפיעה על ${impact}. ' +
      'נעדכן כאן כל ${updateCadence} דקות עד לפתרון מלא. ' +
      'תודה על הסבלנות.',
    en:
      '[${severity}] ${title}\n' +
      'Updated: ${updatedAt}\n' +
      'We are currently investigating an issue affecting ${impact}. ' +
      'We will post updates here every ${updateCadence} minutes until ' +
      'full resolution. Thank you for your patience.',
  }),
  regulatorPdpl: Object.freeze({
    he:
      'לכבוד הרשות להגנת הפרטיות, משרד המשפטים\n' +
      'הנדון: הודעה על אירוע אבטחת מידע — חוק הגנת הפרטיות, תיקון 13\n\n' +
      'בהתאם לחובת הדיווח הקבועה בחוק הגנת הפרטיות, התשמ"א-1981, ' +
      'כפי שתוקן בתיקון 13, אנו מדווחים בזאת על אירוע אבטחת מידע מהותי ' +
      'שהתרחש במערכותינו.\n\n' +
      '1. פרטי הגוף המדווח: ${orgName}, ח.פ. ${orgId}\n' +
      '2. מועד גילוי האירוע: ${discoveredAt}\n' +
      '3. מועד תחילת האירוע (משוער): ${occurredAt}\n' +
      '4. תיאור האירוע: ${description}\n' +
      '5. סוגי המידע שנחשפו: ${dataCategories}\n' +
      '6. מספר משתמשים שנפגעו (משוער): ${affectedCount}\n' +
      '7. סיכון צפוי לזכויות נשואי המידע: ${riskAssessment}\n' +
      '8. צעדים שננקטו להכלה: ${containmentActions}\n' +
      '9. צעדים שננקטו לצמצום הנזק: ${mitigationActions}\n' +
      '10. איש קשר אצלנו: ${dpoName}, ${dpoEmail}, ${dpoPhone}\n\n' +
      'הודעה זו נשלחת במסגרת חלון הדיווח בן 72 השעות מרגע הגילוי. ' +
      'נמשיך לעדכן ככל שהמידע יתבהר.\n\n' +
      'בכבוד רב,\n${dpoName}\nממונה הגנת הפרטיות, ${orgName}',
    en:
      'To: Israel Privacy Protection Authority, Ministry of Justice\n' +
      'Subject: Data Breach Notification — Privacy Protection Law ' +
      'Amendment 13\n\n' +
      'Pursuant to the notification obligation set out in the Privacy ' +
      'Protection Law 5741-1981, as amended by Amendment 13, we hereby ' +
      'report a material personal data security incident that occurred ' +
      'in our systems.\n\n' +
      '1. Reporting entity: ${orgName}, Co. Reg. ${orgId}\n' +
      '2. Discovery timestamp: ${discoveredAt}\n' +
      '3. Estimated incident start: ${occurredAt}\n' +
      '4. Incident description: ${description}\n' +
      '5. Categories of data exposed: ${dataCategories}\n' +
      '6. Estimated affected individuals: ${affectedCount}\n' +
      '7. Assessed risk to data subjects: ${riskAssessment}\n' +
      '8. Containment actions taken: ${containmentActions}\n' +
      '9. Mitigation actions taken: ${mitigationActions}\n' +
      '10. Point of contact: ${dpoName}, ${dpoEmail}, ${dpoPhone}\n\n' +
      'This notification is issued within the statutory 72-hour ' +
      'disclosure window. We will send follow-up updates as further ' +
      'information becomes available.\n\n' +
      'Sincerely,\n${dpoName}\nData Protection Officer, ${orgName}',
  }),
  dataSubjectNotice: Object.freeze({
    he:
      'שלום ${subjectName},\n\n' +
      'ברצוננו להודיע לך כי ב-${discoveredAt} זוהה אירוע אבטחת מידע ' +
      'אשר ייתכן שחשף פרטים הנוגעים אליך מסוג: ${dataCategories}. ' +
      'אנו פועלים בהתאם לחוק הגנת הפרטיות תיקון 13.\n\n' +
      'הצעדים המיידיים שננקטו: ${mitigationActions}\n' +
      'הצעדים המומלצים שננקוט בשמך: ${recommendedActions}\n\n' +
      'לכל שאלה: ${dpoEmail} / ${dpoPhone}\n\n' +
      '${orgName}',
    en:
      'Dear ${subjectName},\n\n' +
      'We are writing to inform you that on ${discoveredAt} a data ' +
      'security incident was identified which may have exposed ' +
      'information about you of the following types: ${dataCategories}. ' +
      'We are acting in accordance with Israeli Privacy Protection Law ' +
      'Amendment 13.\n\n' +
      'Immediate actions we have taken: ${mitigationActions}\n' +
      'Recommended actions for you: ${recommendedActions}\n\n' +
      'For any questions: ${dpoEmail} / ${dpoPhone}\n\n' +
      '${orgName}',
  }),
  postmortem: Object.freeze({
    he: [
      '# ניתוח אירוע לאחר מעשה — ${title}',
      '',
      '**מזהה אירוע**: ${id}',
      '**חומרה**: ${severity}',
      '**נפתח**: ${openedAt}',
      '**נסגר**: ${closedAt}',
      '**משך כולל (דקות)**: ${durationMinutes}',
      '',
      '## סיכום מנהלים',
      '${executiveSummary}',
      '',
      '## ציר זמן',
      '${timeline}',
      '',
      '## סיבה שורשית (5 פעמים למה)',
      '1. ${why1}',
      '2. ${why2}',
      '3. ${why3}',
      '4. ${why4}',
      '5. ${why5}',
      '',
      '## מה עבד',
      '${whatWorked}',
      '',
      '## מה לא עבד',
      '${whatFailed}',
      '',
      '## היכן התמזל מזלנו',
      '${whereWeGotLucky}',
      '',
      '## פעולות מתקנות',
      '${actionItems}',
      '',
      '## לקחים',
      '${lessons}',
      '',
      '---',
      '*ללא האשמה (blameless) — אנו מתמקדים במערכת לא באנשים.*',
    ].join('\n'),
    en: [
      '# Postmortem — ${title}',
      '',
      '**Incident ID**: ${id}',
      '**Severity**: ${severity}',
      '**Opened**: ${openedAt}',
      '**Closed**: ${closedAt}',
      '**Duration (minutes)**: ${durationMinutes}',
      '',
      '## Executive Summary',
      '${executiveSummary}',
      '',
      '## Timeline',
      '${timeline}',
      '',
      '## Root Cause (5 Whys)',
      '1. ${why1}',
      '2. ${why2}',
      '3. ${why3}',
      '4. ${why4}',
      '5. ${why5}',
      '',
      '## What Went Well',
      '${whatWorked}',
      '',
      '## What Went Wrong',
      '${whatFailed}',
      '',
      '## Where We Got Lucky',
      '${whereWeGotLucky}',
      '',
      '## Action Items',
      '${actionItems}',
      '',
      '## Lessons Learned',
      '${lessons}',
      '',
      '---',
      '*Blameless — we focus on the system, not the individuals.*',
    ].join('\n'),
  }),
});

/* ------------------------------------------------------------------ *
 *  Template rendering                                                *
 * ------------------------------------------------------------------ */

function renderTemplate(tpl, vars) {
  return String(tpl).replace(/\$\{([a-zA-Z0-9_]+)\}/g, function (_m, key) {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key]);
    }
    return '${' + key + '}';
  });
}

/* ------------------------------------------------------------------ *
 *  IncidentRunbook class                                             *
 * ------------------------------------------------------------------ */

class IncidentRunbook {
  constructor(opts) {
    const o = opts || {};
    this.now = typeof o.now === 'function' ? o.now : Date.now;
    this.orgName = o.orgName || 'Techno-Kol Uzi';
    this.orgId = o.orgId || '515123456';
    this.dpoName = o.dpoName || 'ממונה הגנת הפרטיות';
    this.dpoEmail = o.dpoEmail || 'dpo@techno-kol.co.il';
    this.dpoPhone = o.dpoPhone || '+972-3-0000000';

    this._runbooks = new Map(); // scenario → { steps, createdAt }
    this._incidents = new Map(); // incidentId → incident record
    this._auditLog = []; // append-only
    this._seq = 0;
  }

  /* ------------------------------- *
   *  Runbook definition              *
   * ------------------------------- */

  defineRunbook(scenario, steps) {
    if (typeof scenario !== 'string' || !scenario) {
      throw new Error('defineRunbook: scenario must be a non-empty string');
    }
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error('defineRunbook: steps must be a non-empty array');
    }
    // לא מוחקים — if a runbook for this scenario already exists we
    // version it instead of overwriting.
    const existing = this._runbooks.get(scenario);
    const version = existing ? existing.version + 1 : 1;
    const prepared = cloneSteps(steps);
    const record = Object.freeze({
      scenario: scenario,
      version: version,
      steps: prepared,
      stepIndex: Object.freeze(
        prepared.reduce(function (acc, s) {
          acc[s.id] = s;
          return acc;
        }, {})
      ),
      createdAt: this.now(),
      previous: existing || null,
    });
    this._runbooks.set(scenario, record);
    this._audit('runbook.defined', { scenario: scenario, version: version });
    return record;
  }

  getRunbook(scenario) {
    return this._runbooks.get(scenario) || null;
  }

  listRunbooks() {
    const out = [];
    this._runbooks.forEach(function (r) {
      out.push({
        scenario: r.scenario,
        version: r.version,
        stepCount: r.steps.length,
      });
    });
    return out;
  }

  /* ------------------------------- *
   *  Incident lifecycle              *
   * ------------------------------- */

  start(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('start: input object required');
    }
    const scenario = input.scenario;
    const rb = this._runbooks.get(scenario);
    if (!rb) {
      throw new Error('start: no runbook defined for scenario ' + scenario);
    }
    const sev = input.severity || 'SEV3';
    assertSeverity(sev);
    const sevMeta = SEVERITY[sev];
    const now = this.now();
    this._seq += 1;
    const id = 'INC-' + this._formatDate(now) + '-' + pad2(this._seq);
    const firstStepId = rb.steps[0].id;
    const incident = {
      id: id,
      scenario: scenario,
      runbookVersion: rb.version,
      severity: sev,
      title: input.title || bilingual(scenario, scenario),
      reporter: input.reporter || 'unknown',
      oncall: input.oncall || 'on-call',
      impact: input.impact || bilingual('משתמשים רבים', 'many users'),
      pdplBreach: Boolean(input.pdplBreach),
      dataCategories: input.dataCategories || [],
      affectedCount:
        typeof input.affectedCount === 'number' ? input.affectedCount : 0,
      state: INCIDENT_STATE.OPEN,
      openedAt: now,
      respondBy: now + sevMeta.responseMinutes * 60 * 1000,
      resolveBy: now + sevMeta.resolutionMinutes * 60 * 1000,
      currentStepId: firstStepId,
      history: [],
      stakeholderNotifications: [],
      escalationRung: 1,
      closedAt: null,
      postmortem: null,
    };
    this._incidents.set(id, incident);
    this._audit('incident.started', {
      id: id,
      scenario: scenario,
      severity: sev,
    });
    this._notifyStakeholders(incident, 'incident.started');
    return id;
  }

  advance(incidentId, stepId, outcome) {
    const inc = this._requireIncident(incidentId);
    if (inc.state === INCIDENT_STATE.CLOSED) {
      throw new Error('advance: incident ' + incidentId + ' is closed');
    }
    if (inc.currentStepId !== stepId) {
      throw new Error(
        'advance: expected currentStepId=' +
          inc.currentStepId +
          ' but got ' +
          stepId
      );
    }
    const rb = this._runbooks.get(inc.scenario);
    const step = rb.stepIndex[stepId];
    if (!step) {
      throw new Error('advance: step ' + stepId + ' not in runbook');
    }
    const now = this.now();
    const next =
      step.branches && Object.prototype.hasOwnProperty.call(step.branches, outcome)
        ? step.branches[outcome]
        : step.branches && step.branches['*']
        ? step.branches['*']
        : null;

    const entry = Object.freeze({
      stepId: stepId,
      outcome: outcome,
      at: now,
      next: next || 'END',
    });
    inc.history.push(entry);

    if (inc.state === INCIDENT_STATE.OPEN) {
      inc.state = INCIDENT_STATE.IN_PROGRESS;
    }

    // SLA miss → escalate.
    if (now > inc.respondBy && inc.escalationRung < 2) {
      inc.escalationRung = 2;
      this._notifyStakeholders(inc, 'escalation.response_sla_miss');
    }
    if (now > inc.resolveBy && inc.escalationRung < 3) {
      inc.escalationRung = 3;
      this._notifyStakeholders(inc, 'escalation.resolution_sla_miss');
    }

    if (outcome === STEP_OUTCOME.ESCALATE && inc.escalationRung < 3) {
      inc.escalationRung += 1;
      this._notifyStakeholders(inc, 'escalation.manual');
    }

    if (!next || next === 'END' || step.terminal) {
      inc.currentStepId = null;
      inc.state =
        outcome === STEP_OUTCOME.OK
          ? INCIDENT_STATE.MITIGATED
          : INCIDENT_STATE.IN_PROGRESS;
    } else {
      inc.currentStepId = next;
    }

    this._audit('incident.advanced', {
      id: incidentId,
      stepId: stepId,
      outcome: outcome,
      next: next || 'END',
    });
    return Object.assign({}, entry, { state: inc.state });
  }

  resolve(incidentId, summary) {
    const inc = this._requireIncident(incidentId);
    inc.state = INCIDENT_STATE.RESOLVED;
    inc.closedAt = this.now();
    inc.resolveSummary = summary || bilingual('נפתר', 'Resolved');
    this._audit('incident.resolved', { id: incidentId });
    this._notifyStakeholders(inc, 'incident.resolved');
    return inc;
  }

  close(incidentId) {
    const inc = this._requireIncident(incidentId);
    inc.state = INCIDENT_STATE.CLOSED;
    if (!inc.closedAt) inc.closedAt = this.now();
    this._audit('incident.closed', { id: incidentId });
    return inc;
  }

  getIncident(incidentId) {
    return this._incidents.get(incidentId) || null;
  }

  listIncidents() {
    const out = [];
    this._incidents.forEach(function (inc) {
      out.push({
        id: inc.id,
        scenario: inc.scenario,
        severity: inc.severity,
        state: inc.state,
        openedAt: inc.openedAt,
        closedAt: inc.closedAt,
      });
    });
    return out;
  }

  /* ------------------------------- *
   *  SLA helpers                     *
   * ------------------------------- */

  slaStatus(incidentId) {
    const inc = this._requireIncident(incidentId);
    const now = this.now();
    return {
      respondBy: inc.respondBy,
      resolveBy: inc.resolveBy,
      respondMissed: now > inc.respondBy,
      resolveMissed: now > inc.resolveBy,
      remainingRespondMs: Math.max(0, inc.respondBy - now),
      remainingResolveMs: Math.max(0, inc.resolveBy - now),
    };
  }

  /* ------------------------------- *
   *  Escalation                      *
   * ------------------------------- */

  escalationStatus(incidentId) {
    const inc = this._requireIncident(incidentId);
    const rung = ESCALATION_CHAIN[inc.escalationRung - 1];
    return {
      rung: inc.escalationRung,
      role: rung.role,
      label: rung.label,
      chain: ESCALATION_CHAIN.map(function (r) {
        return { rung: r.rung, role: r.role, label: r.label };
      }),
    };
  }

  /* ------------------------------- *
   *  Comms rendering                 *
   * ------------------------------- */

  renderSlack(incidentId, locale) {
    assertLocale(locale);
    const inc = this._requireIncident(incidentId);
    const sevMeta = SEVERITY[inc.severity];
    const vars = {
      severity: inc.severity,
      title: inc.title[locale],
      id: inc.id,
      state: inc.state,
      reporter: inc.reporter,
      oncall: inc.oncall,
      openedAt: isoFromMs(inc.openedAt),
      respondBy: isoFromMs(inc.respondBy),
      resolveBy: isoFromMs(inc.resolveBy),
      currentStep: inc.currentStepId || (locale === 'he' ? 'הסתיים' : 'done'),
      sevLabel: sevMeta.label[locale],
    };
    return renderTemplate(TEMPLATES.slackInternal[locale], vars);
  }

  renderStatusPage(incidentId, locale) {
    assertLocale(locale);
    const inc = this._requireIncident(incidentId);
    const vars = {
      severity: inc.severity,
      title: inc.title[locale],
      updatedAt: isoFromMs(this.now()),
      impact: inc.impact[locale],
      updateCadence: inc.severity === 'SEV1' ? 15 : 30,
    };
    return renderTemplate(TEMPLATES.statusPage[locale], vars);
  }

  renderRegulatorNotice(incidentId, locale) {
    assertLocale(locale);
    const inc = this._requireIncident(incidentId);
    if (!inc.pdplBreach) {
      throw new Error(
        'renderRegulatorNotice: incident ' +
          incidentId +
          ' is not flagged as a PDPL breach'
      );
    }
    const categories = inc.dataCategories.length
      ? inc.dataCategories.join(', ')
      : locale === 'he'
      ? 'טרם נקבע'
      : 'to be determined';
    const vars = {
      orgName: this.orgName,
      orgId: this.orgId,
      discoveredAt: isoFromMs(inc.openedAt),
      occurredAt: isoFromMs(inc.openedAt),
      description: inc.title[locale],
      dataCategories: categories,
      affectedCount: inc.affectedCount,
      riskAssessment:
        locale === 'he'
          ? 'נמוך עד בינוני, בהערכה מתמשכת'
          : 'Low to medium, under continuous assessment',
      containmentActions:
        locale === 'he'
          ? 'בידוד השירות המושפע, סגירת גישות חריגות'
          : 'Isolated affected service, revoked anomalous access',
      mitigationActions:
        locale === 'he'
          ? 'סבב מפתחות, כפיית ריסט סיסמאות, חיזוק ניטור'
          : 'Key rotation, forced password reset, enhanced monitoring',
      dpoName: this.dpoName,
      dpoEmail: this.dpoEmail,
      dpoPhone: this.dpoPhone,
    };
    return renderTemplate(TEMPLATES.regulatorPdpl[locale], vars);
  }

  renderDataSubjectNotice(incidentId, locale, subject) {
    assertLocale(locale);
    const inc = this._requireIncident(incidentId);
    const s = subject || {};
    const categories = inc.dataCategories.length
      ? inc.dataCategories.join(', ')
      : locale === 'he'
      ? 'טרם נקבע'
      : 'to be determined';
    const vars = {
      subjectName: s.name || (locale === 'he' ? 'לקוח/ה יקר/ה' : 'Valued user'),
      discoveredAt: isoFromMs(inc.openedAt),
      dataCategories: categories,
      mitigationActions:
        locale === 'he'
          ? 'סבב מפתחות, כפיית ריסט סיסמאות'
          : 'Key rotation, forced password reset',
      recommendedActions:
        locale === 'he'
          ? 'שינוי סיסמה, הפעלת 2FA, ניטור חיוב'
          : 'Change password, enable 2FA, monitor billing',
      dpoEmail: this.dpoEmail,
      dpoPhone: this.dpoPhone,
      orgName: this.orgName,
    };
    return renderTemplate(TEMPLATES.dataSubjectNotice[locale], vars);
  }

  /* ------------------------------- *
   *  Postmortem                      *
   * ------------------------------- */

  renderPostmortem(incidentId, fields) {
    const inc = this._requireIncident(incidentId);
    const f = fields || {};
    const closedAt = inc.closedAt || this.now();
    const durationMs = closedAt - inc.openedAt;
    const out = {};
    ['he', 'en'].forEach((locale) => {
      const timeline = inc.history
        .map(function (h) {
          return (
            '- ' +
            isoFromMs(h.at) +
            ' — ' +
            h.stepId +
            ' → ' +
            h.outcome +
            (h.next !== 'END' ? ' → ' + h.next : '')
          );
        })
        .join('\n');
      const vars = {
        id: inc.id,
        title: inc.title[locale],
        severity: inc.severity,
        openedAt: isoFromMs(inc.openedAt),
        closedAt: isoFromMs(closedAt),
        durationMinutes: Math.round(durationMs / 60000),
        executiveSummary:
          f.executiveSummary ||
          (locale === 'he' ? '[למלא בסיכום]' : '[to be filled]'),
        timeline:
          timeline || (locale === 'he' ? 'אין אירועים' : 'No events'),
        why1: f.why1 || '?',
        why2: f.why2 || '?',
        why3: f.why3 || '?',
        why4: f.why4 || '?',
        why5: f.why5 || '?',
        whatWorked:
          f.whatWorked || (locale === 'he' ? '[למלא]' : '[to be filled]'),
        whatFailed:
          f.whatFailed || (locale === 'he' ? '[למלא]' : '[to be filled]'),
        whereWeGotLucky:
          f.whereWeGotLucky ||
          (locale === 'he' ? '[למלא]' : '[to be filled]'),
        actionItems:
          f.actionItems || (locale === 'he' ? '[למלא]' : '[to be filled]'),
        lessons:
          f.lessons || (locale === 'he' ? '[למלא]' : '[to be filled]'),
      };
      out[locale] = renderTemplate(TEMPLATES.postmortem[locale], vars);
    });
    inc.postmortem = out;
    inc.state = INCIDENT_STATE.POSTMORTEM;
    this._audit('incident.postmortem', { id: incidentId });
    return out;
  }

  /* ------------------------------- *
   *  Audit log (append-only)         *
   * ------------------------------- */

  auditLog() {
    return this._auditLog.slice();
  }

  /* ------------------------------- *
   *  Private                         *
   * ------------------------------- */

  _requireIncident(id) {
    const inc = this._incidents.get(id);
    if (!inc) throw new Error('incident not found: ' + id);
    return inc;
  }

  _notifyStakeholders(incident, event) {
    const entry = Object.freeze({
      at: this.now(),
      event: event,
      rung: incident.escalationRung,
      role: ESCALATION_CHAIN[incident.escalationRung - 1].role,
    });
    incident.stakeholderNotifications.push(entry);
    this._audit('stakeholder.notified', {
      id: incident.id,
      event: event,
      role: entry.role,
    });
  }

  _audit(event, payload) {
    this._auditLog.push(
      Object.freeze({
        at: this.now(),
        event: event,
        payload: Object.freeze(Object.assign({}, payload || {})),
      })
    );
  }

  _formatDate(ms) {
    const d = new Date(ms);
    return (
      d.getUTCFullYear() +
      pad2(d.getUTCMonth() + 1) +
      pad2(d.getUTCDate())
    );
  }
}

/* ------------------------------------------------------------------ *
 *  Exports                                                           *
 * ------------------------------------------------------------------ */

module.exports = {
  IncidentRunbook: IncidentRunbook,
  SEVERITY: SEVERITY,
  ESCALATION_CHAIN: ESCALATION_CHAIN,
  INCIDENT_STATE: INCIDENT_STATE,
  STEP_OUTCOME: STEP_OUTCOME,
  TEMPLATES: TEMPLATES,
};
