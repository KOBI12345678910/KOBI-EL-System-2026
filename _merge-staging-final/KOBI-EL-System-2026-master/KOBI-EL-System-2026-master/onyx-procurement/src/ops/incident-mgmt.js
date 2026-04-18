/**
 * ONYX OPS — Incident Management
 * ------------------------------
 * Techno-Kol Uzi / Swarm 3D / Agent X-61
 *
 * Zero-dependency, bilingual (Hebrew + English), blameless incident
 * management for the Kobi mega-ERP. Covers:
 *
 *   1. Incident declaration with severity (SEV1..SEV4)
 *   2. Auto-assigned on-call commander
 *   3. War-room spin-up stub (chat channel + invites)
 *   4. Stakeholder status broadcasts (minutely during SEV1)
 *   5. Timeline capture (every action logged with timestamp)
 *   6. Contributing-factors identification
 *   7. Resolution + recovery tracking
 *   8. Postmortem template auto-generation (bilingual)
 *   9. Action items with owners + due dates
 *  10. Blameless culture wording hard-coded
 *
 * Severity response targets:
 *   SEV1 — critical, all users affected, data-loss risk —  15 min
 *   SEV2 — major, subset affected, workaround exists      —  30 min
 *   SEV3 — minor, single function degraded                — 240 min (4h)
 *   SEV4 — cosmetic or planned                            — next business day
 *
 * Integration hooks (pluggable, all optional):
 *   - alertManager   (Agent X-55): alert → declareIncident()
 *   - logCollector   (Agent X-54): pulls logs into timeline
 *   - sloService     (Agent X-60): SLO data feeds impact
 *   - chatProvider               : spins war rooms
 *   - notifier                   : sends stakeholder emails / SMS
 *
 * Rules:
 *   - Never delete: incidents only go to archived=true
 *   - Zero external dependencies (node built-ins only)
 *   - Hebrew + English bilingual strings throughout
 *   - Safe-by-default: errors in integrations never break the host
 *
 * Usage:
 *   const im = require('./src/ops/incident-mgmt');
 *   const svc = im.createIncidentService({ chatProvider, notifier, sloService });
 *   const id = svc.declareIncident({
 *     title: 'Payment gateway 500s',
 *     severity: 'SEV1',
 *     description: 'All payment attempts failing',
 *     reporter: 'alerts@onyx',
 *   });
 *   svc.addTimelineEntry(id, { action: 'restarted gateway', actor: 'opsbot' });
 *   svc.resolveIncident(id, 'DNS flap on upstream');
 *   const md = svc.generatePostmortem(id);
 */

'use strict';

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SEVERITY = Object.freeze({
  SEV1: 'SEV1',
  SEV2: 'SEV2',
  SEV3: 'SEV3',
  SEV4: 'SEV4',
});

const VALID_SEVERITIES = new Set(Object.values(SEVERITY));

const STATUS = Object.freeze({
  DECLARED:       'declared',      // הוכרז
  INVESTIGATING:  'investigating', // בבדיקה
  IDENTIFIED:     'identified',    // זוהה
  MITIGATING:     'mitigating',    // בטיפול
  MONITORING:     'monitoring',    // במעקב
  RESOLVED:       'resolved',      // נפתר
  POSTMORTEM:     'postmortem',    // בתחקור
  CLOSED:         'closed',        // סגור
});

const VALID_STATUSES = new Set(Object.values(STATUS));

// Response-time targets in minutes (SEV4 is 960 min = 16h ~= next business day)
const SEVERITY_RESPONSE_MIN = Object.freeze({
  SEV1:  15,
  SEV2:  30,
  SEV3: 240,
  SEV4: 960,
});

// Broadcast cadence in seconds (how often we push status updates)
const SEVERITY_BROADCAST_SEC = Object.freeze({
  SEV1:   60,   // minutely during SEV1
  SEV2:  300,   // every 5 min
  SEV3: 1800,   // every 30 min
  SEV4: 3600,   // hourly
});

// Bilingual labels — NEVER use blame-loaded wording
const SEVERITY_LABELS = Object.freeze({
  SEV1: { he: 'קריטי — כל המשתמשים',              en: 'Critical — all users affected'            },
  SEV2: { he: 'מהותי — תת-קבוצה, קיים מעקף',       en: 'Major — subset affected, workaround exists' },
  SEV3: { he: 'נמוך — פונקציה אחת במצב פגום',       en: 'Minor — single function degraded'           },
  SEV4: { he: 'קוסמטי או מתוכנן',                  en: 'Cosmetic or planned'                        },
});

const STATUS_LABELS = Object.freeze({
  declared:      { he: 'הוכרז',     en: 'Declared'      },
  investigating: { he: 'בבדיקה',    en: 'Investigating' },
  identified:    { he: 'זוהה',     en: 'Identified'    },
  mitigating:    { he: 'בטיפול',    en: 'Mitigating'    },
  monitoring:    { he: 'במעקב',    en: 'Monitoring'    },
  resolved:      { he: 'נפתר',     en: 'Resolved'      },
  postmortem:    { he: 'בתחקור',    en: 'Postmortem'    },
  closed:        { he: 'סגור',     en: 'Closed'        },
});

// Blameless culture wording — used in auto-generated postmortem front-matter.
// Both strings are required reading for every participant.
const BLAMELESS_STATEMENT = Object.freeze({
  he:
    'תחקיר זה הוא ללא האשמה. המטרה שלנו היא ללמוד ממה שקרה, לא למצוא אשמים. '
    + 'אנשים פעלו על בסיס המידע הטוב ביותר שהיה בידם באותו רגע, והחלטותיהם '
    + 'היו סבירות בהינתן ההקשר. אנחנו מתמקדים בגורמי מערכת, לא באנשים.',
  en:
    'This postmortem is blameless. Our goal is to learn from what happened, '
    + 'not to find someone to blame. People acted on the best information '
    + 'available to them at the time, and their decisions were reasonable '
    + 'given the context. We focus on systemic factors, not individuals.',
});

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function nowIso(clock) {
  return new Date(typeof clock === 'function' ? clock() : Date.now()).toISOString();
}

function nowMs(clock) {
  return typeof clock === 'function' ? clock() : Date.now();
}

function genId(prefix) {
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function safeInvoke(fn, ...args) {
  if (typeof fn !== 'function') return null;
  try {
    return fn(...args);
  } catch (err) {
    // Integration failures must never break incident handling.
    // eslint-disable-next-line no-console
    console.error('[incident-mgmt] integration error:', err && err.message);
    return null;
  }
}

function requireStr(name, v) {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${name} required`);
  }
  return v.trim();
}

function validSeverity(sev) {
  const s = String(sev || '').toUpperCase();
  if (!VALID_SEVERITIES.has(s)) {
    throw new Error(`invalid severity: ${sev} (expected SEV1|SEV2|SEV3|SEV4)`);
  }
  return s;
}

function validStatus(st) {
  const s = String(st || '').toLowerCase();
  if (!VALID_STATUSES.has(s)) {
    throw new Error(
      `invalid status: ${st} (expected one of ${Array.from(VALID_STATUSES).join(',')})`,
    );
  }
  return s;
}

function minutesBetween(aIso, bIso) {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, (b - a) / 60000);
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY STORE (swap-in by the caller if persistence is wanted)
// ═══════════════════════════════════════════════════════════════

class InMemoryIncidentStore {
  constructor() {
    this.byId = new Map();
  }
  save(inc) { this.byId.set(inc.id, inc); return inc; }
  get(id)   { return this.byId.get(id) || null; }
  all()     { return Array.from(this.byId.values()); }
}

// ═══════════════════════════════════════════════════════════════
// ROUND-ROBIN ON-CALL ROSTER
// ═══════════════════════════════════════════════════════════════

class OnCallRoster {
  /**
   * @param {string[]} commanders — user-ids eligible to be incident commander
   */
  constructor(commanders) {
    this.commanders = Array.isArray(commanders) && commanders.length > 0
      ? commanders.slice()
      : ['oncall@onyx'];
    this.cursor = 0;
  }
  /** round-robin pick, stable */
  next() {
    const pick = this.commanders[this.cursor % this.commanders.length];
    this.cursor += 1;
    return pick;
  }
  size() { return this.commanders.length; }
}

// ═══════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════

class IncidentService {
  /**
   * @param {object} opts
   * @param {object} [opts.store]       — any store with save/get/all
   * @param {OnCallRoster} [opts.roster]— commander roster
   * @param {function} [opts.clock]     — () => ms since epoch (for tests)
   * @param {function} [opts.idGen]     — (prefix) => string
   * @param {object}   [opts.chatProvider]     — { createChannel, invite }
   * @param {object}   [opts.notifier]         — { broadcast({channels, message}) }
   * @param {object}   [opts.sloService]       — X-60: { getImpact(service) }
   * @param {object}   [opts.logCollector]     — X-54: { fetch({since, until, service}) }
   * @param {object}   [opts.alertManager]     — X-55: { ack(alertId) }
   * @param {string[]} [opts.defaultStakeholders]
   */
  constructor(opts = {}) {
    this.store = opts.store || new InMemoryIncidentStore();
    this.roster = opts.roster || new OnCallRoster(opts.commanders || ['oncall@onyx']);
    this.clock = typeof opts.clock === 'function' ? opts.clock : () => Date.now();
    this.idGen = typeof opts.idGen === 'function' ? opts.idGen : genId;
    this.chatProvider = opts.chatProvider || null;
    this.notifier = opts.notifier || null;
    this.sloService = opts.sloService || null;
    this.logCollector = opts.logCollector || null;
    this.alertManager = opts.alertManager || null;
    this.defaultStakeholders = Array.isArray(opts.defaultStakeholders)
      ? opts.defaultStakeholders.slice()
      : ['oncall@onyx', 'eng-leads@onyx'];

    // audit log of EVERY broadcast the service emitted — callers can inspect
    this._broadcastLog = [];
  }

  // ─────────────────────────────────────────────
  // 1. declareIncident
  // ─────────────────────────────────────────────
  declareIncident(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('input object required');
    }
    const title = requireStr('title', input.title);
    const severity = validSeverity(input.severity);
    const description = typeof input.description === 'string' ? input.description : '';
    const reporter = requireStr('reporter', input.reporter);

    const id = this.idGen('INC');
    const declaredAt = nowIso(this.clock);

    // 2. Auto-assign commander via on-call roster
    const commander = this.roster.next();

    const responseTargetMin = SEVERITY_RESPONSE_MIN[severity];
    const responseDueIso = new Date(nowMs(this.clock) + responseTargetMin * 60000).toISOString();

    // Pull SLO impact data if configured (Agent X-60 integration)
    const sloImpact = safeInvoke(
      this.sloService && this.sloService.getImpact,
      input.service || null,
    );

    const inc = {
      id,
      title,
      description,
      severity,
      severity_label: SEVERITY_LABELS[severity],
      status: STATUS.DECLARED,
      status_label: STATUS_LABELS[STATUS.DECLARED],
      reporter,
      commander,
      service: input.service || null,
      alert_id: input.alert_id || null,
      declared_at: declaredAt,
      acknowledged_at: null,
      resolved_at: null,
      closed_at: null,
      response_due: responseDueIso,
      response_target_min: responseTargetMin,
      broadcast_cadence_sec: SEVERITY_BROADCAST_SEC[severity],
      last_broadcast_at: null,
      stakeholders: this.defaultStakeholders.slice(),
      timeline: [],                  // array of { ts, action, actor, notes }
      status_updates: [],            // array of { ts, status, message }
      contributing_factors: [],      // array of strings
      root_cause: null,
      mitigation: null,              // summary of what mitigated
      war_room: null,                // { channel_id, joined }
      action_items: [],              // [{ id, description, owner, due, status }]
      what_went_well: [],
      what_went_wrong: [],
      slo_impact: sloImpact || null,
      archived: false,
    };

    // 3. War-room spin-up
    inc.war_room = this._spinUpWarRoom(inc);

    // timeline: declaration event
    this._pushTimeline(inc, {
      action: 'incident.declared',
      actor: reporter,
      notes: `severity=${severity}; commander=${commander}`,
    });

    // ack originating alert if any
    if (inc.alert_id) {
      safeInvoke(this.alertManager && this.alertManager.ack, inc.alert_id);
      this._pushTimeline(inc, {
        action: 'alert.acknowledged',
        actor: 'incident-mgmt',
        notes: `alert_id=${inc.alert_id}`,
      });
    }

    this.store.save(inc);

    // Initial broadcast to stakeholders
    this._broadcast(inc, `Incident declared: ${title} (${severity})`);

    return id;
  }

  // ─────────────────────────────────────────────
  // 2. assignCommander (manual override)
  // ─────────────────────────────────────────────
  assignCommander(incidentId, userId) {
    const inc = this._mustGet(incidentId);
    const uid = requireStr('userId', userId);
    const prev = inc.commander;
    inc.commander = uid;
    this._pushTimeline(inc, {
      action: 'commander.reassigned',
      actor: 'incident-mgmt',
      notes: `${prev} -> ${uid}`,
    });
    this.store.save(inc);
  }

  // ─────────────────────────────────────────────
  // 3. updateStatus (broadcasts to stakeholders)
  // ─────────────────────────────────────────────
  updateStatus(incidentId, status, message) {
    const inc = this._mustGet(incidentId);
    const s = validStatus(status);
    const msg = typeof message === 'string' ? message : '';
    inc.status = s;
    inc.status_label = STATUS_LABELS[s];
    const ts = nowIso(this.clock);
    inc.status_updates.push({ ts, status: s, message: msg });
    if (s === STATUS.INVESTIGATING && !inc.acknowledged_at) {
      inc.acknowledged_at = ts;
    }
    this._pushTimeline(inc, {
      action: 'status.changed',
      actor: 'incident-mgmt',
      notes: `${s}${msg ? ': ' + msg : ''}`,
    });
    this._broadcast(inc, `[${inc.severity}] ${inc.title} — ${STATUS_LABELS[s].en}: ${msg}`);
    this.store.save(inc);
  }

  // ─────────────────────────────────────────────
  // 4. addTimelineEntry
  // ─────────────────────────────────────────────
  addTimelineEntry(incidentId, entry) {
    const inc = this._mustGet(incidentId);
    if (!entry || typeof entry !== 'object') {
      throw new Error('entry object required');
    }
    const action = requireStr('action', entry.action);
    const actor = requireStr('actor', entry.actor);
    const notes = typeof entry.notes === 'string' ? entry.notes : '';
    this._pushTimeline(inc, { action, actor, notes });
    this.store.save(inc);
  }

  // ─────────────────────────────────────────────
  // 5. addContributingFactor
  // ─────────────────────────────────────────────
  addContributingFactor(incidentId, factor) {
    const inc = this._mustGet(incidentId);
    const f = requireStr('factor', factor);
    inc.contributing_factors.push(f);
    this._pushTimeline(inc, {
      action: 'factor.added',
      actor: 'incident-mgmt',
      notes: f,
    });
    this.store.save(inc);
  }

  // ─────────────────────────────────────────────
  // 6. resolveIncident
  // ─────────────────────────────────────────────
  resolveIncident(incidentId, rootCause) {
    const inc = this._mustGet(incidentId);
    const rc = requireStr('rootCause', rootCause);
    inc.root_cause = rc;
    inc.status = STATUS.RESOLVED;
    inc.status_label = STATUS_LABELS[STATUS.RESOLVED];
    inc.resolved_at = nowIso(this.clock);
    this._pushTimeline(inc, {
      action: 'incident.resolved',
      actor: 'incident-mgmt',
      notes: rc,
    });
    this._broadcast(inc, `[${inc.severity}] ${inc.title} — RESOLVED: ${rc}`);
    this.store.save(inc);
  }

  // ─────────────────────────────────────────────
  // 7. addActionItem
  // ─────────────────────────────────────────────
  addActionItem(incidentId, item) {
    const inc = this._mustGet(incidentId);
    if (!item || typeof item !== 'object') {
      throw new Error('item object required');
    }
    const description = requireStr('description', item.description);
    const owner = requireStr('owner', item.owner);
    const due = item.due ? String(item.due) : null;
    const ai = {
      id: this.idGen('AI'),
      description,
      owner,
      due,
      status: 'open',
      created_at: nowIso(this.clock),
    };
    inc.action_items.push(ai);
    this._pushTimeline(inc, {
      action: 'action_item.added',
      actor: 'incident-mgmt',
      notes: `${ai.id} ${owner}: ${description}`,
    });
    this.store.save(inc);
    return ai;
  }

  // ─────────────────────────────────────────────
  // 8. generatePostmortem (markdown, bilingual)
  // ─────────────────────────────────────────────
  generatePostmortem(incidentId) {
    const inc = this._mustGet(incidentId);

    // Mark status as postmortem (if not already closed)
    if (inc.status !== STATUS.POSTMORTEM && inc.status !== STATUS.CLOSED) {
      inc.status = STATUS.POSTMORTEM;
      inc.status_label = STATUS_LABELS[STATUS.POSTMORTEM];
      this._pushTimeline(inc, {
        action: 'postmortem.started',
        actor: 'incident-mgmt',
        notes: '',
      });
      this.store.save(inc);
    }

    const mttrMin = inc.resolved_at
      ? minutesBetween(inc.declared_at, inc.resolved_at)
      : null;
    const mttdMin = inc.acknowledged_at
      ? minutesBetween(inc.declared_at, inc.acknowledged_at)
      : null;

    // Auto-seed the 5-whys template from root cause + factors
    const fiveWhys = this._fiveWhysTemplate(inc);

    const lines = [];
    lines.push(`# Postmortem — ${inc.title}`);
    lines.push('');
    lines.push(`**Incident ID:** \`${inc.id}\`  `);
    lines.push(`**Severity:** ${inc.severity} — ${inc.severity_label.en} / ${inc.severity_label.he}  `);
    lines.push(`**Status:** ${inc.status} (${STATUS_LABELS[inc.status].he})  `);
    lines.push(`**Declared:** ${inc.declared_at}  `);
    lines.push(`**Resolved:** ${inc.resolved_at || '—'}  `);
    lines.push(`**MTTD:** ${mttdMin != null ? mttdMin.toFixed(2) + ' min' : '—'}  `);
    lines.push(`**MTTR:** ${mttrMin != null ? mttrMin.toFixed(2) + ' min' : '—'}  `);
    lines.push(`**Commander:** ${inc.commander}  `);
    lines.push(`**Reporter:** ${inc.reporter}  `);
    lines.push('');
    lines.push('## Blameless statement / הצהרת אי-האשמה');
    lines.push('');
    lines.push('> ' + BLAMELESS_STATEMENT.en);
    lines.push('>');
    lines.push('> ' + BLAMELESS_STATEMENT.he);
    lines.push('');

    // Summary
    lines.push('## 1. Summary / תקציר');
    lines.push('');
    lines.push(`**EN:** ${inc.description || inc.title}`);
    lines.push('');
    lines.push(`**HE:** ${inc.description || inc.title}`);
    lines.push('');

    // Impact
    lines.push('## 2. Impact / השפעה');
    lines.push('');
    lines.push('| Dimension / מימד | Value / ערך |');
    lines.push('|---|---|');
    lines.push(`| Who / מי | ${inc.service || 'all users / כל המשתמשים'} |`);
    lines.push(`| What / מה | ${inc.title} |`);
    lines.push(`| When / מתי | ${inc.declared_at} → ${inc.resolved_at || 'ongoing / בתהליך'} |`);
    lines.push(`| How many / כמה | ${inc.slo_impact && inc.slo_impact.affected_users != null
      ? inc.slo_impact.affected_users
      : 'TBD'} |`);
    if (inc.slo_impact) {
      lines.push(`| SLO burn / שחיקת SLO | ${JSON.stringify(inc.slo_impact)} |`);
    }
    lines.push('');

    // Timeline
    lines.push('## 3. Timeline / ציר זמן');
    lines.push('');
    if (inc.timeline.length === 0) {
      lines.push('*(empty)*');
    } else {
      for (const t of inc.timeline) {
        lines.push(`- **${t.ts}** — \`${t.action}\` — ${t.actor}${t.notes ? ' — ' + t.notes : ''}`);
      }
    }
    lines.push('');

    // Root cause — 5 whys
    lines.push('## 4. Root cause analysis — 5 Whys / ניתוח שורש — 5 למה');
    lines.push('');
    lines.push(`**Root cause / סיבת שורש:** ${inc.root_cause || 'TBD'}`);
    lines.push('');
    for (let i = 0; i < fiveWhys.length; i++) {
      lines.push(`${i + 1}. **Why / למה:** ${fiveWhys[i]}`);
    }
    lines.push('');

    // Contributing factors
    lines.push('## 5. Contributing factors / גורמים תורמים');
    lines.push('');
    if (inc.contributing_factors.length === 0) {
      lines.push('*(none identified / לא זוהו)*');
    } else {
      for (const f of inc.contributing_factors) {
        lines.push(`- ${f}`);
      }
    }
    lines.push('');

    // What went well
    lines.push('## 6. What went well / מה הלך טוב');
    lines.push('');
    if (inc.what_went_well.length === 0) {
      lines.push('*(add items / הוסף פריטים)*');
    } else {
      for (const w of inc.what_went_well) lines.push(`- ${w}`);
    }
    lines.push('');

    // What went wrong
    lines.push('## 7. What went wrong / מה הלך לא טוב');
    lines.push('');
    if (inc.what_went_wrong.length === 0) {
      lines.push('*(add items / הוסף פריטים)*');
    } else {
      for (const w of inc.what_went_wrong) lines.push(`- ${w}`);
    }
    lines.push('');

    // Action items
    lines.push('## 8. Action items / פריטי פעולה');
    lines.push('');
    if (inc.action_items.length === 0) {
      lines.push('*(none / אין)*');
    } else {
      lines.push('| ID | Description | Owner | Due | Status |');
      lines.push('|---|---|---|---|---|');
      for (const ai of inc.action_items) {
        lines.push(`| \`${ai.id}\` | ${ai.description} | ${ai.owner} | ${ai.due || '—'} | ${ai.status} |`);
      }
    }
    lines.push('');

    lines.push('---');
    lines.push('*Generated by ONYX OPS incident-mgmt (Agent X-61) — blameless culture enforced / נוצר על ידי מערכת ניהול אירועים — תרבות ללא האשמה*');

    return lines.join('\n');
  }

  // ─────────────────────────────────────────────
  // 9. addWhatWentWell / addWhatWentWrong
  // ─────────────────────────────────────────────
  addWhatWentWell(incidentId, note) {
    const inc = this._mustGet(incidentId);
    const n = requireStr('note', note);
    inc.what_went_well.push(n);
    this.store.save(inc);
  }
  addWhatWentWrong(incidentId, note) {
    const inc = this._mustGet(incidentId);
    const n = requireStr('note', note);
    inc.what_went_wrong.push(n);
    this.store.save(inc);
  }

  // ─────────────────────────────────────────────
  // 10. listActive / listRecent / metrics
  // ─────────────────────────────────────────────
  listActive() {
    return this.store.all()
      .filter((i) => !i.archived && i.status !== STATUS.CLOSED && i.status !== STATUS.RESOLVED)
      .sort((a, b) => a.declared_at < b.declared_at ? 1 : -1);
  }

  /**
   * @param {object} period — { since?: iso, until?: iso }
   */
  listRecent(period = {}) {
    const since = period.since ? Date.parse(period.since) : 0;
    const until = period.until ? Date.parse(period.until) : Infinity;
    return this.store.all()
      .filter((i) => {
        const d = Date.parse(i.declared_at);
        return d >= since && d <= until;
      })
      .sort((a, b) => a.declared_at < b.declared_at ? 1 : -1);
  }

  /**
   * @param {object} period — { since?: iso, until?: iso }
   * @returns {{ mttr_min:number, mttd_min:number, count:number, by_severity:object }}
   */
  metrics(period = {}) {
    const list = this.listRecent(period);
    const out = {
      count: list.length,
      by_severity: { SEV1: 0, SEV2: 0, SEV3: 0, SEV4: 0 },
      mttr_min: 0,
      mttd_min: 0,
      resolved: 0,
      acknowledged: 0,
    };
    let mttrSum = 0;
    let mttdSum = 0;
    for (const i of list) {
      out.by_severity[i.severity] = (out.by_severity[i.severity] || 0) + 1;
      if (i.resolved_at) {
        out.resolved += 1;
        mttrSum += minutesBetween(i.declared_at, i.resolved_at);
      }
      if (i.acknowledged_at) {
        out.acknowledged += 1;
        mttdSum += minutesBetween(i.declared_at, i.acknowledged_at);
      }
    }
    out.mttr_min = out.resolved > 0 ? mttrSum / out.resolved : 0;
    out.mttd_min = out.acknowledged > 0 ? mttdSum / out.acknowledged : 0;
    return out;
  }

  // ─────────────────────────────────────────────
  // Archive (NEVER delete — archive instead)
  // ─────────────────────────────────────────────
  archiveIncident(incidentId) {
    const inc = this._mustGet(incidentId);
    inc.archived = true;
    inc.status = STATUS.CLOSED;
    inc.status_label = STATUS_LABELS[STATUS.CLOSED];
    inc.closed_at = nowIso(this.clock);
    this._pushTimeline(inc, {
      action: 'incident.archived',
      actor: 'incident-mgmt',
      notes: '',
    });
    this.store.save(inc);
  }

  // ─────────────────────────────────────────────
  // Log collector integration — pulls entries in
  // ─────────────────────────────────────────────
  attachLogs(incidentId, opts = {}) {
    const inc = this._mustGet(incidentId);
    if (!this.logCollector || typeof this.logCollector.fetch !== 'function') {
      return 0;
    }
    const until = opts.until || nowIso(this.clock);
    const since = opts.since || inc.declared_at;
    const logs = safeInvoke(this.logCollector.fetch, {
      since,
      until,
      service: inc.service,
    }) || [];
    let n = 0;
    for (const entry of logs) {
      if (!entry) continue;
      this._pushTimeline(inc, {
        action: 'log.attached',
        actor: entry.source || 'log-collector',
        notes: entry.message || JSON.stringify(entry),
      });
      n += 1;
    }
    this.store.save(inc);
    return n;
  }

  // ─────────────────────────────────────────────
  // Broadcast scheduler helper — call this from a timer loop. It
  // re-broadcasts status for any active incident whose last broadcast
  // is older than its severity-cadence. For SEV1 this means minutely.
  // Returns the list of incident-ids re-broadcast this tick.
  // ─────────────────────────────────────────────
  tickBroadcasts() {
    const now = nowMs(this.clock);
    const rebroadcast = [];
    for (const inc of this.listActive()) {
      const cadenceMs = SEVERITY_BROADCAST_SEC[inc.severity] * 1000;
      const last = inc.last_broadcast_at ? Date.parse(inc.last_broadcast_at) : 0;
      if (now - last >= cadenceMs) {
        this._broadcast(
          inc,
          `[${inc.severity}] ${inc.title} — status: ${inc.status}`,
        );
      }
    }
    return rebroadcast;
  }

  // ─────────────────────────────────────────────
  // Test / introspection helpers
  // ─────────────────────────────────────────────
  get(id)        { return this.store.get(id); }
  all()          { return this.store.all(); }
  broadcastLog() { return this._broadcastLog.slice(); }

  // ═══════════════════════════════════════════
  // INTERNALS
  // ═══════════════════════════════════════════

  _mustGet(id) {
    const inc = this.store.get(id);
    if (!inc) throw new Error(`incident not found: ${id}`);
    return inc;
  }

  _pushTimeline(inc, entry) {
    inc.timeline.push({
      ts: nowIso(this.clock),
      action: entry.action,
      actor: entry.actor,
      notes: entry.notes || '',
    });
  }

  _spinUpWarRoom(inc) {
    // Stub integration: create chat channel and invite stakeholders
    const channelName = `inc-${inc.id.toLowerCase()}`;
    let channelId = channelName;
    if (this.chatProvider && typeof this.chatProvider.createChannel === 'function') {
      const r = safeInvoke(this.chatProvider.createChannel, {
        name: channelName,
        topic: `[${inc.severity}] ${inc.title}`,
      });
      if (r && r.channel_id) channelId = r.channel_id;
    }
    const invited = [];
    for (const uid of this.defaultStakeholders) {
      if (this.chatProvider && typeof this.chatProvider.invite === 'function') {
        safeInvoke(this.chatProvider.invite, channelId, uid);
      }
      invited.push(uid);
    }
    // commander always in the room
    if (this.chatProvider && typeof this.chatProvider.invite === 'function') {
      safeInvoke(this.chatProvider.invite, channelId, inc.commander);
    }
    if (!invited.includes(inc.commander)) invited.push(inc.commander);
    return { channel_id: channelId, joined: invited };
  }

  _broadcast(inc, message) {
    const ts = nowIso(this.clock);
    inc.last_broadcast_at = ts;
    const payload = {
      ts,
      incident_id: inc.id,
      severity: inc.severity,
      status: inc.status,
      channels: inc.stakeholders.slice(),
      message,
      message_he: `[${inc.severity}] ${inc.title} — ${STATUS_LABELS[inc.status].he}`,
    };
    this._broadcastLog.push(payload);
    if (this.notifier && typeof this.notifier.broadcast === 'function') {
      safeInvoke(this.notifier.broadcast, payload);
    }
    return payload;
  }

  _fiveWhysTemplate(inc) {
    const arr = [];
    if (inc.root_cause) {
      arr.push(inc.root_cause);
    } else {
      arr.push('Why did the incident occur? / למה האירוע קרה?');
    }
    for (let i = 1; i < 5; i++) {
      arr.push('Why? / למה?');
    }
    return arr;
  }
}

// ═══════════════════════════════════════════════════════════════
// MODULE-LEVEL FACADE (default singleton) + factory
// ═══════════════════════════════════════════════════════════════

function createIncidentService(opts) {
  return new IncidentService(opts || {});
}

// A default in-memory singleton, for simple use cases
const defaultService = new IncidentService();

module.exports = {
  // classes / factory
  IncidentService,
  InMemoryIncidentStore,
  OnCallRoster,
  createIncidentService,

  // default facade (delegates to singleton)
  declareIncident:       (x)       => defaultService.declareIncident(x),
  assignCommander:       (id, u)   => defaultService.assignCommander(id, u),
  updateStatus:          (id, s, m) => defaultService.updateStatus(id, s, m),
  addTimelineEntry:      (id, e)   => defaultService.addTimelineEntry(id, e),
  addContributingFactor: (id, f)   => defaultService.addContributingFactor(id, f),
  resolveIncident:       (id, rc)  => defaultService.resolveIncident(id, rc),
  addActionItem:         (id, it)  => defaultService.addActionItem(id, it),
  generatePostmortem:    (id)      => defaultService.generatePostmortem(id),
  addWhatWentWell:       (id, n)   => defaultService.addWhatWentWell(id, n),
  addWhatWentWrong:      (id, n)   => defaultService.addWhatWentWrong(id, n),
  listActive:            ()        => defaultService.listActive(),
  listRecent:            (p)       => defaultService.listRecent(p),
  metrics:               (p)       => defaultService.metrics(p),
  archiveIncident:       (id)      => defaultService.archiveIncident(id),
  attachLogs:            (id, o)   => defaultService.attachLogs(id, o),
  tickBroadcasts:        ()        => defaultService.tickBroadcasts(),

  // constants (exported for tests + consumers)
  SEVERITY,
  STATUS,
  SEVERITY_RESPONSE_MIN,
  SEVERITY_BROADCAST_SEC,
  SEVERITY_LABELS,
  STATUS_LABELS,
  BLAMELESS_STATEMENT,

  // default singleton (advanced)
  _defaultService: defaultService,
};
