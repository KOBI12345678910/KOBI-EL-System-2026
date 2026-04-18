/**
 * ONYX OPS — Alert Manager
 * ========================
 * Agent X-55 (Swarm 3 — Techno-Kol Uzi mega-ERP 2026)
 *
 * Prometheus Alertmanager-compatible alert router with Israeli business
 * awareness. Zero-dependency, drop-in module.
 *
 * מנהל התראות מלא בעברית+English — ניתוב לפי חומרה, השתקות, קבוצות,
 * השהיות, אסקלציה, ולוח תורנויות עם מודעות לשבת ולחגי ישראל.
 *
 * Features
 * --------
 *   1.  fire(alert)                  — receive an alert from any source
 *   2.  deduplication                — same labels → one active alert
 *   3.  grouping                     — similar alerts coalesced into a digest
 *   4.  silence(matchers, duration)  — mute rules for N hours
 *   5.  inhibit(src, tgt)            — suppress downstream when upstream fires
 *   6.  defineRoute(matcher, ch)     — route by labels (severity → channel)
 *   7.  escalation policies          — page next person if not ack'd in X min
 *   8.  on-call schedule             — weekly rotation, Israeli handoffs
 *   9.  ack + resolve                — full lifecycle bookkeeping
 *  10.  runbook references           — KB links attached to notifications
 *
 * Severities
 * ----------
 *   critical  — page immediately, 24/7
 *   high      — page business hours, notify off-hours
 *   medium    — email/slack notify
 *   low       — daily digest
 *   info      — dashboard only
 *
 * Channels (stub adapters — replace with real adapters in production)
 * -------------------------------------------------------------------
 *   slack       — webhook
 *   email       — via Agent 73
 *   sms         — via Agent 75
 *   whatsapp    — via Agent 74
 *   pagerduty   — webhook
 *   dashboard   — websocket / SSE
 *
 * Public API
 * ----------
 *   const mgr = createManager(opts);
 *   mgr.fire(alert)          → alertId
 *   mgr.ack(alertId, userId) → bool
 *   mgr.resolve(alertId)     → bool
 *   mgr.silence({matchers, duration, reason, createdBy}) → silenceId
 *   mgr.unsilence(silenceId) → bool
 *   mgr.defineRoute(matcher, channels, opts?) → routeId
 *   mgr.defineInhibit(sourceMatcher, targetMatcher, opts?) → inhibitId
 *   mgr.listActive()         → array
 *   mgr.listSilenced()       → array
 *   mgr.listGrouped()        → array
 *   mgr.stats()              → object
 *   mgr.tick(now)            → void   (drives escalation / expiry / digest flush)
 *   mgr.setOnCall(schedule)  → void
 *   mgr.getCurrentOnCall(now) → {primary, secondary, ...}
 *   mgr.close()              → void
 *
 * Zero deps. Pure Node ≥18. Safe for unit tests (inject `now`, `channels`).
 */

'use strict';

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const STATE = {
  FIRING:   'firing',
  ACKED:    'acknowledged',
  RESOLVED: 'resolved',
  SILENCED: 'silenced',
  INHIBITED:'inhibited',
};

// Bilingual severity labels for operator notifications
const SEVERITY_HE = {
  critical: 'קריטי',
  high:     'גבוה',
  medium:   'בינוני',
  low:      'נמוך',
  info:     'מידע',
};

// Israeli business hours — Sunday .. Thursday, 08:00–18:00 local time
const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END   = 18;

// Israeli weekend: Friday afternoon through Saturday evening.
// Handoff BEFORE Shabbat = Friday 14:00 (ops team out early).
const FRIDAY_HANDOFF_HOUR  = 14;
const SATURDAY_EXIT_HOUR   = 20; // מוצאי שבת approximate

// Digest flush interval (ms) — daily digest channel = low severity
const DIGEST_FLUSH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Group similar alerts — time window (ms)
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// Default escalation grace period (ms)
const DEFAULT_ESCALATION_GRACE_MS = 15 * 60 * 1000;

// Max silences / groups to retain (memory bound)
const MAX_SILENCES = 10_000;
const MAX_GROUPS   = 10_000;
const MAX_HISTORY  = 50_000;

// ═══════════════════════════════════════════════════════════════════════
// UTILITY — label matching, fingerprinting, deep clone
// ═══════════════════════════════════════════════════════════════════════

/**
 * Stable label fingerprint → used for deduplication.
 * Sorted key=value pairs joined by commas, then SHA-1 (short).
 */
function fingerprint(labels) {
  const keys = Object.keys(labels || {}).sort();
  const parts = keys.map((k) => `${k}=${String(labels[k])}`);
  const canonical = parts.join(',');
  return crypto.createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Match a label-set against a matcher object.
 * A matcher is a plain object: {key: value | RegExp | {re: 'pattern'}}.
 * All keys must match. Missing labels → no match.
 */
function labelsMatch(labels, matcher) {
  if (!matcher || typeof matcher !== 'object') return false;
  const keys = Object.keys(matcher);
  if (keys.length === 0) return true; // empty matcher = match everything
  for (const key of keys) {
    const want = matcher[key];
    const have = labels[key];
    if (have === undefined || have === null) return false;
    if (want instanceof RegExp) {
      if (!want.test(String(have))) return false;
    } else if (want && typeof want === 'object' && typeof want.re === 'string') {
      // Safe RegExp construction — matcher came from trusted config
      const re = new RegExp(want.re, want.flags || '');
      if (!re.test(String(have))) return false;
    } else if (String(have) !== String(want)) {
      return false;
    }
  }
  return true;
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof RegExp) {
    // Preserve matcher semantics — RegExps are immutable so sharing is safe.
    return obj;
  }
  if (obj instanceof Date) return new Date(obj.getTime());
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
  return out;
}

function makeId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

function nowMs(injected) {
  return typeof injected === 'function' ? injected() : Date.now();
}

// ═══════════════════════════════════════════════════════════════════════
// STUB CHANNEL ADAPTERS
// Replace each with the real integration at deploy time (Agent 73/74/75 etc.).
// Each adapter returns {ok:true} or {ok:false, error} and NEVER throws.
// ═══════════════════════════════════════════════════════════════════════

function stubAdapter(name) {
  return {
    name,
    sent: [],
    async send(payload) {
      // In tests, we just record. In prod, wire to the real transport.
      this.sent.push({ at: Date.now(), payload: deepClone(payload) });
      return { ok: true, channel: name };
    },
    reset() {
      this.sent.length = 0;
    },
  };
}

function defaultChannels() {
  return {
    slack:     stubAdapter('slack'),
    email:     stubAdapter('email'),
    sms:       stubAdapter('sms'),
    whatsapp:  stubAdapter('whatsapp'),
    pagerduty: stubAdapter('pagerduty'),
    dashboard: stubAdapter('dashboard'),
    phone:     stubAdapter('phone'), // phone = voice call / paging escalation
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ISRAELI CALENDAR — minimal holiday awareness
// You can extend `holidays` in opts for the current year. Defaults include
// the fixed civil dates; Hebrew-calendar holidays should be injected via opts.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Default holiday stubs for 2026 (from public Israeli gov calendar).
 * Extend via createManager({ holidays: [...] }).
 * Format: 'YYYY-MM-DD' strings (local time).
 */
const DEFAULT_HOLIDAYS_2026 = [
  '2026-04-02', // Passover eve
  '2026-04-03', // Passover 1st day
  '2026-04-08', // Passover 7th day
  '2026-04-21', // Memorial Day
  '2026-04-22', // Independence Day
  '2026-05-21', // Shavuot eve
  '2026-05-22', // Shavuot
  '2026-09-11', // Rosh Hashana eve
  '2026-09-12', // Rosh Hashana 1
  '2026-09-13', // Rosh Hashana 2
  '2026-09-20', // Yom Kippur eve
  '2026-09-21', // Yom Kippur
  '2026-09-25', // Sukkot eve
  '2026-09-26', // Sukkot 1
  '2026-10-03', // Simchat Torah eve
  '2026-10-04', // Simchat Torah
];

function toDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Israeli-aware temporal flags at time `t`.
 * Sunday=0 .. Saturday=6 (JS convention).
 */
function temporalFlags(t, holidays) {
  const d = new Date(t);
  const day = d.getDay();
  const hour = d.getHours();
  const dateStr = toDateStr(d);
  const isHoliday = holidays.has(dateStr);

  // Shabbat: Friday 14:00 through Saturday 20:00
  const isShabbat =
    (day === 5 && hour >= FRIDAY_HANDOFF_HOUR) ||
    (day === 6 && hour < SATURDAY_EXIT_HOUR);

  // Business hours: Sunday..Thursday, 08–18
  const isBusinessDay = day >= 0 && day <= 4;
  const isBusinessHours =
    isBusinessDay &&
    !isHoliday &&
    hour >= BUSINESS_HOURS_START &&
    hour < BUSINESS_HOURS_END;

  return {
    day,
    hour,
    dateStr,
    isHoliday,
    isShabbat,
    isBusinessDay,
    isBusinessHours,
    isWeekend: day === 5 || day === 6,
    isFridayHandoff: day === 5 && hour === FRIDAY_HANDOFF_HOUR,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ON-CALL SCHEDULE
// A schedule is an array of rotations. Each rotation has:
//   {name, members:[{id,name,phone,email}], rotationHours, startAt}
// getCurrentOnCall walks the rotation and returns the active member,
// respecting Friday handoff (shifts early before Shabbat).
// ═══════════════════════════════════════════════════════════════════════

function defaultSchedule() {
  return {
    primary: {
      name: 'primary-ops',
      members: [
        { id: 'kobi',  name: 'Kobi El',  phone: '+972500000001', email: 'kobi@technokol.co.il' },
        { id: 'yossi', name: 'Yossi',    phone: '+972500000002', email: 'yossi@technokol.co.il' },
        { id: 'tali',  name: 'Tali',     phone: '+972500000003', email: 'tali@technokol.co.il' },
      ],
      rotationHours: 24 * 7, // weekly rotation
      startAt: Date.UTC(2026, 0, 4, 0, 0, 0), // first Sunday of 2026 at 00:00 UTC
    },
    secondary: {
      name: 'backup',
      members: [
        { id: 'dana',   name: 'Dana',   phone: '+972500000004', email: 'dana@technokol.co.il' },
        { id: 'avi',    name: 'Avi',    phone: '+972500000005', email: 'avi@technokol.co.il' },
      ],
      rotationHours: 24 * 14, // biweekly rotation
      startAt: Date.UTC(2026, 0, 4, 0, 0, 0),
    },
  };
}

function pickRotationMember(rotation, t) {
  if (!rotation || !Array.isArray(rotation.members) || rotation.members.length === 0) {
    return null;
  }
  const rotationMs = (rotation.rotationHours || 168) * 3600 * 1000;
  const elapsed = Math.max(0, t - (rotation.startAt || 0));
  const idx = Math.floor(elapsed / rotationMs) % rotation.members.length;
  return rotation.members[idx];
}

// ═══════════════════════════════════════════════════════════════════════
// MANAGER FACTORY
// ═══════════════════════════════════════════════════════════════════════

function createManager(opts = {}) {
  const channels = opts.channels || defaultChannels();
  const holidays = new Set(opts.holidays || DEFAULT_HOLIDAYS_2026);
  const nowFn = opts.now || Date.now;
  const runbookBase = opts.runbookBase || 'https://kb.technokol.co.il/runbook';
  const escalationGrace = typeof opts.escalationGraceMs === 'number'
    ? opts.escalationGraceMs
    : DEFAULT_ESCALATION_GRACE_MS;
  const groupWindow = typeof opts.groupWindowMs === 'number'
    ? opts.groupWindowMs
    : GROUP_WINDOW_MS;
  const digestInterval = typeof opts.digestIntervalMs === 'number'
    ? opts.digestIntervalMs
    : DIGEST_FLUSH_INTERVAL_MS;

  // ─────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────

  // alertId -> alert record
  const active = new Map();
  // fingerprint -> alertId (deduplication index)
  const fpIndex = new Map();
  // alertId -> history of transitions
  const history = [];
  // silences (id -> silence)
  const silences = new Map();
  // routes (id -> route)
  const routes = [];
  // inhibit rules (id -> rule)
  const inhibits = [];
  // groupKey -> group record
  const groups = new Map();
  // daily low-severity digest buffer
  let digestBuffer = [];
  let lastDigestFlushAt = nowFn();
  // on-call schedule (mutable)
  let schedule = opts.schedule || defaultSchedule();
  // counters
  const counters = {
    fired: 0,
    deduped: 0,
    suppressed: 0, // silenced or inhibited
    escalated: 0,
    resolved: 0,
    acked: 0,
    notificationsSent: 0,
    digestsSent: 0,
  };

  // ─────────────────────────────────────────────────────────────────────
  // ROUTING helpers
  // ─────────────────────────────────────────────────────────────────────

  function defaultRoutes() {
    // severity=critical  → phone + sms + slack(urgent) + pagerduty
    // severity=high      → slack + email  (escalation layer chooses phone/sms)
    // severity=medium    → email + slack
    // severity=low       → digest (collected, flushed daily)
    // severity=info      → dashboard
    defineRoute({ severity: 'critical' }, ['phone', 'sms', 'slack', 'pagerduty']);
    defineRoute({ severity: 'high', service: 'payroll' }, ['slack', 'email']);
    defineRoute({ severity: 'high' }, ['slack', 'email']);
    defineRoute({ severity: 'medium' }, ['email', 'slack']);
    defineRoute({ severity: 'low' }, ['__digest__']);
    defineRoute({ severity: 'info' }, ['dashboard']);
  }

  function defineRoute(matcher, channelList, options = {}) {
    const id = makeId('route');
    routes.push({
      id,
      matcher: deepClone(matcher),
      channels: Array.isArray(channelList) ? channelList.slice() : [],
      continue: !!options.continue, // if true, keep matching other routes
    });
    return id;
  }

  function defineInhibit(sourceMatcher, targetMatcher, options = {}) {
    const id = makeId('inhibit');
    inhibits.push({
      id,
      source: deepClone(sourceMatcher),
      target: deepClone(targetMatcher),
      // Optional: only inhibit when labels in `equal` match between src+tgt.
      equal: Array.isArray(options.equal) ? options.equal.slice() : [],
    });
    return id;
  }

  function removeInhibit(id) {
    const ix = inhibits.findIndex((r) => r.id === id);
    if (ix === -1) return false;
    inhibits.splice(ix, 1);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────
  // SILENCES
  // ─────────────────────────────────────────────────────────────────────

  function silence({ matchers, duration, reason, createdBy } = {}) {
    if (!matchers || typeof matchers !== 'object') {
      throw new Error('silence.matchers required');
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('silence.duration (ms) must be > 0');
    }
    if (silences.size >= MAX_SILENCES) {
      // Evict the oldest expired, else the oldest active.
      const t = nowFn();
      let victim = null;
      for (const [id, s] of silences) {
        if (s.expiresAt <= t) { victim = id; break; }
      }
      if (!victim) victim = silences.keys().next().value;
      silences.delete(victim);
    }
    const id = makeId('sil');
    const createdAt = nowFn();
    silences.set(id, {
      id,
      matchers: deepClone(matchers),
      createdAt,
      expiresAt: createdAt + duration,
      reason: reason || '',
      createdBy: createdBy || 'system',
    });
    return id;
  }

  function unsilence(id) {
    return silences.delete(id);
  }

  function listSilenced() {
    const t = nowFn();
    const out = [];
    for (const s of silences.values()) {
      if (s.expiresAt > t) out.push(deepClone(s));
    }
    return out;
  }

  function isSilenced(alert, t) {
    for (const s of silences.values()) {
      if (s.expiresAt <= t) continue;
      if (labelsMatch(alert.labels, s.matchers)) return s;
    }
    return null;
  }

  function sweepSilences(t) {
    for (const [id, s] of silences) {
      if (s.expiresAt <= t) silences.delete(id);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // INHIBITION
  // A target alert is inhibited if there is an ACTIVE (firing) alert
  // matching a source matcher, optionally sharing labels listed in `equal`.
  // ─────────────────────────────────────────────────────────────────────

  function isInhibited(alert) {
    for (const rule of inhibits) {
      if (!labelsMatch(alert.labels, rule.target)) continue;
      // look for any active firing source
      for (const a of active.values()) {
        if (a.state !== STATE.FIRING) continue;
        if (a.id === alert.id) continue;
        if (!labelsMatch(a.labels, rule.source)) continue;
        // equal labels must match between source and target
        let allEqual = true;
        for (const key of rule.equal) {
          if (a.labels[key] !== alert.labels[key]) { allEqual = false; break; }
        }
        if (!allEqual) continue;
        return { rule: rule.id, sourceAlertId: a.id };
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // ROUTING — find the first matching route (or `continue` through many)
  // ─────────────────────────────────────────────────────────────────────

  function resolveChannels(alert) {
    const selected = new Set();
    for (const r of routes) {
      if (labelsMatch(alert.labels, r.matcher)) {
        for (const c of r.channels) selected.add(c);
        if (!r.continue) break;
      }
    }
    if (selected.size === 0) {
      // default fallback — dashboard only
      selected.add('dashboard');
    }
    return Array.from(selected);
  }

  // Adjust channel selection based on Israeli temporal context + severity.
  function adjustChannelsByTime(alert, channelList, t) {
    const flags = temporalFlags(t, holidays);

    // Shabbat (incl. Friday afternoon) & holidays: only critical paging; all
    // else queued to dashboard + daily digest so we don't wake the team.
    if (flags.isShabbat || flags.isHoliday) {
      if (alert.severity === 'critical') return channelList; // page through
      // non-critical during shabbat → dashboard + digest only
      return ['dashboard', '__digest__'];
    }

    // Weekend but not strictly shabbat (Friday morning): high → slack+email.
    // Medium+ off-hours → notify + email (no phone). Low → digest.
    if (!flags.isBusinessHours) {
      if (alert.severity === 'critical') return channelList;
      if (alert.severity === 'high') {
        // drop phone calls off-hours; keep slack + email + sms
        return channelList.filter((c) => c !== 'phone' && c !== 'pagerduty');
      }
      if (alert.severity === 'low') return ['__digest__'];
    }

    return channelList;
  }

  // ─────────────────────────────────────────────────────────────────────
  // GROUPING
  // Alerts sharing the same groupKey (alertname+service+severity by default)
  // are coalesced into a group. The group is "flushed" (notified) on first
  // alert; later alerts within the window are added silently to the group.
  // ─────────────────────────────────────────────────────────────────────

  function groupKeyFor(alert) {
    const parts = [
      alert.labels.alertname || alert.name || 'unknown',
      alert.labels.service || '',
      alert.severity,
    ];
    return parts.join('|');
  }

  function pushToGroup(alert, t) {
    const key = groupKeyFor(alert);
    let g = groups.get(key);
    if (!g || (t - g.startedAt) > groupWindow) {
      if (groups.size >= MAX_GROUPS) {
        const victim = groups.keys().next().value;
        groups.delete(victim);
      }
      g = {
        key,
        startedAt: t,
        severity: alert.severity,
        alerts: [],
        notifiedAt: 0,
      };
      groups.set(key, g);
    }
    g.alerts.push(alert.id);
    return g;
  }

  function listGrouped() {
    return Array.from(groups.values()).map((g) => ({
      key: g.key,
      startedAt: g.startedAt,
      severity: g.severity,
      count: g.alerts.length,
      notifiedAt: g.notifiedAt,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────
  // NOTIFICATION DISPATCH
  // ─────────────────────────────────────────────────────────────────────

  function buildNotificationPayload(alert, onCall) {
    const sevHe = SEVERITY_HE[alert.severity] || alert.severity;
    const runbook = alert.runbook || `${runbookBase}/${alert.labels.alertname || 'generic'}`;
    return {
      id: alert.id,
      fingerprint: alert.fingerprint,
      severity: alert.severity,
      severity_he: sevHe,
      title: alert.title || alert.labels.alertname || 'ONYX Alert',
      title_he: alert.title_he || `התראת מערכת: ${alert.labels.alertname || 'כללי'}`,
      summary: alert.summary || '',
      summary_he: alert.summary_he || '',
      labels: deepClone(alert.labels),
      annotations: deepClone(alert.annotations || {}),
      runbook,
      startsAt: alert.startsAt,
      onCall: onCall ? { id: onCall.id, name: onCall.name } : null,
      state: alert.state,
      // Bilingual short text ready for SMS/WhatsApp:
      sms_text:
        `[${alert.severity.toUpperCase()}] ${alert.title || alert.labels.alertname || 'ALERT'} — ` +
        `${alert.summary || ''} | RB: ${runbook}`,
      sms_text_he:
        `[${sevHe}] ${alert.title_he || alert.labels.alertname || 'התראה'} — ` +
        `${alert.summary_he || ''} | ספר ריצה: ${runbook}`,
    };
  }

  async function dispatch(alert, channelList, onCall) {
    const payload = buildNotificationPayload(alert, onCall);
    const results = [];
    for (const chName of channelList) {
      if (chName === '__digest__') {
        digestBuffer.push({ ...payload, _at: alert.startsAt });
        results.push({ channel: '__digest__', ok: true, queued: true });
        continue;
      }
      const adapter = channels[chName];
      if (!adapter || typeof adapter.send !== 'function') {
        results.push({ channel: chName, ok: false, error: 'no_adapter' });
        continue;
      }
      try {
        const r = await adapter.send(payload);
        results.push(Object.assign({ channel: chName }, r));
        counters.notificationsSent++;
      } catch (err) {
        // Adapter failures must never break the manager
        results.push({ channel: chName, ok: false, error: String(err && err.message || err) });
      }
    }
    return results;
  }

  // ─────────────────────────────────────────────────────────────────────
  // FIRE — the main entry point
  // ─────────────────────────────────────────────────────────────────────

  function fire(input = {}) {
    const t = nowFn();
    const labels = deepClone(input.labels || {});
    if (!labels.alertname && input.name) labels.alertname = input.name;
    const severity = labels.severity || input.severity || 'medium';
    if (!SEVERITY_RANK.hasOwnProperty(severity)) {
      throw new Error(`Invalid severity: ${severity}`);
    }
    labels.severity = severity;

    const fp = fingerprint(labels);

    // DEDUPE — if already active, just bump count + lastSeenAt
    const existingId = fpIndex.get(fp);
    if (existingId) {
      const existing = active.get(existingId);
      if (existing && existing.state !== STATE.RESOLVED) {
        existing.count += 1;
        existing.lastSeenAt = t;
        counters.deduped++;
        history.push({ at: t, alertId: existing.id, type: 'dedupe' });
        trimHistory();
        return existing.id;
      }
    }

    const alertId = makeId('alert');
    const alert = {
      id: alertId,
      fingerprint: fp,
      labels,
      severity,
      name: labels.alertname || input.name || 'alert',
      title: input.title || labels.alertname || 'ONYX Alert',
      title_he: input.title_he || '',
      summary: input.summary || '',
      summary_he: input.summary_he || '',
      annotations: deepClone(input.annotations || {}),
      runbook: input.runbook || null,
      state: STATE.FIRING,
      count: 1,
      startsAt: t,
      lastSeenAt: t,
      ackedBy: null,
      ackedAt: 0,
      resolvedAt: 0,
      escalationLevel: 0,
      lastEscalatedAt: 0,
      suppressedBy: null,
    };
    active.set(alertId, alert);
    fpIndex.set(fp, alertId);
    counters.fired++;
    history.push({ at: t, alertId, type: 'fire', severity });
    trimHistory();

    // SUPPRESSION — silence first, then inhibit
    const sil = isSilenced(alert, t);
    if (sil) {
      alert.state = STATE.SILENCED;
      alert.suppressedBy = { kind: 'silence', id: sil.id, reason: sil.reason };
      counters.suppressed++;
      history.push({ at: t, alertId, type: 'silenced', by: sil.id });
      return alertId;
    }
    const inh = isInhibited(alert);
    if (inh) {
      alert.state = STATE.INHIBITED;
      alert.suppressedBy = { kind: 'inhibit', id: inh.rule, by: inh.sourceAlertId };
      counters.suppressed++;
      history.push({ at: t, alertId, type: 'inhibited', by: inh.sourceAlertId });
      return alertId;
    }

    // GROUPING — coalesce
    const g = pushToGroup(alert, t);
    const isFirstInGroup = g.alerts.length === 1;

    // ROUTING — pick channels, then Israeli time adjustment
    let channelList = resolveChannels(alert);
    channelList = adjustChannelsByTime(alert, channelList, t);

    // If this is NOT the first alert in the group AND the group was already
    // notified recently, skip the per-alert dispatch (it'll be in the digest).
    if (!isFirstInGroup && g.notifiedAt > 0 && (t - g.notifiedAt) < groupWindow) {
      history.push({ at: t, alertId, type: 'grouped', key: g.key });
      return alertId;
    }

    // ON-CALL resolution
    const onCall = getCurrentOnCall(t);

    // DISPATCH
    dispatch(alert, channelList, onCall.primary).then((results) => {
      g.notifiedAt = t;
      history.push({
        at: t,
        alertId,
        type: 'dispatched',
        channels: results.map((r) => r.channel),
      });
      trimHistory();
    }).catch((err) => {
      history.push({ at: t, alertId, type: 'dispatch_error', error: String(err.message) });
      trimHistory();
    });

    return alertId;
  }

  // ─────────────────────────────────────────────────────────────────────
  // ACK / RESOLVE
  // ─────────────────────────────────────────────────────────────────────

  function ack(alertId, userId) {
    const a = active.get(alertId);
    if (!a) return false;
    if (a.state === STATE.RESOLVED) return false;
    const t = nowFn();
    a.state = STATE.ACKED;
    a.ackedBy = userId || 'anonymous';
    a.ackedAt = t;
    counters.acked++;
    history.push({ at: t, alertId, type: 'ack', by: userId });
    trimHistory();
    return true;
  }

  function resolve(alertId) {
    const a = active.get(alertId);
    if (!a) return false;
    const t = nowFn();
    a.state = STATE.RESOLVED;
    a.resolvedAt = t;
    counters.resolved++;
    history.push({ at: t, alertId, type: 'resolve' });
    fpIndex.delete(a.fingerprint);
    trimHistory();
    return true;
  }

  function listActive() {
    const out = [];
    for (const a of active.values()) {
      if (a.state === STATE.FIRING ||
          a.state === STATE.ACKED ||
          a.state === STATE.SILENCED ||
          a.state === STATE.INHIBITED) {
        out.push(deepClone(a));
      }
    }
    // critical first
    out.sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity]);
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // ESCALATION
  // Every tick, scan for firing alerts that are not acked within the grace
  // window. Escalate: level 0 → primary (already paged), level 1 → secondary,
  // level 2 → pagerduty broadcast. Never escalate resolved / acked alerts.
  // ─────────────────────────────────────────────────────────────────────

  function escalateAlert(alert, t) {
    alert.escalationLevel += 1;
    alert.lastEscalatedAt = t;
    counters.escalated++;

    const onCall = getCurrentOnCall(t);
    history.push({
      at: t,
      alertId: alert.id,
      type: 'escalate',
      level: alert.escalationLevel,
    });

    let extra;
    let member = null;
    if (alert.escalationLevel === 1) {
      // notify secondary
      member = onCall.secondary;
      extra = ['slack', 'sms', 'phone'];
    } else if (alert.escalationLevel === 2) {
      // broadcast
      extra = ['pagerduty', 'phone', 'sms', 'slack'];
      member = onCall.primary; // cc primary again for paging
    } else {
      extra = ['pagerduty'];
    }

    dispatch(alert, extra, member).catch(() => {});
  }

  function tick(injectedNow) {
    const t = typeof injectedNow === 'number' ? injectedNow : nowFn();
    sweepSilences(t);

    for (const a of active.values()) {
      if (a.state !== STATE.FIRING) continue;
      // only critical + high are escalated automatically
      if (a.severity !== 'critical' && a.severity !== 'high') continue;
      const lastAt = a.lastEscalatedAt || a.startsAt;
      if (t - lastAt >= escalationGrace && a.escalationLevel < 3) {
        escalateAlert(a, t);
      }
    }

    // Flush digest daily
    if (t - lastDigestFlushAt >= digestInterval) {
      flushDigest(t);
    }
  }

  function flushDigest(t) {
    if (digestBuffer.length === 0) {
      lastDigestFlushAt = t;
      return { ok: true, count: 0 };
    }
    const items = digestBuffer.slice();
    digestBuffer = [];
    lastDigestFlushAt = t;
    counters.digestsSent++;
    const payload = {
      id: makeId('digest'),
      at: t,
      count: items.length,
      items,
      summary_he: `דייג'סט יומי — ${items.length} התראות במסלול בינוני/נמוך`,
      summary_en: `Daily digest — ${items.length} medium/low-severity alerts`,
    };
    if (channels.email && typeof channels.email.send === 'function') {
      channels.email.send(payload).catch(() => {});
    }
    return { ok: true, count: items.length };
  }

  // ─────────────────────────────────────────────────────────────────────
  // ON-CALL LOOKUP
  // ─────────────────────────────────────────────────────────────────────

  function setOnCall(next) {
    if (!next || typeof next !== 'object') {
      throw new Error('setOnCall: schedule object required');
    }
    schedule = next;
  }

  function getCurrentOnCall(injectedNow) {
    const t = typeof injectedNow === 'number' ? injectedNow : nowFn();
    const flags = temporalFlags(t, holidays);

    // Friday handoff: shift primary 2h earlier to account for early Shabbat.
    // This is achieved by asking the schedule for "t - 2h" on Friday before
    // the handoff (so the handoff is visible from 14:00 onward).
    let lookup = t;
    if (flags.day === 5 && flags.hour >= FRIDAY_HANDOFF_HOUR) {
      // advance the rotation clock so the week rolls to the next member
      lookup = t + 24 * 3600 * 1000;
    }

    return {
      primary: pickRotationMember(schedule.primary, lookup),
      secondary: pickRotationMember(schedule.secondary, lookup),
      flags,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // HOUSEKEEPING
  // ─────────────────────────────────────────────────────────────────────

  function trimHistory() {
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }
  }

  function stats() {
    let firing = 0, acked = 0, silenced = 0, inhibited = 0, resolved = 0;
    for (const a of active.values()) {
      if (a.state === STATE.FIRING) firing++;
      else if (a.state === STATE.ACKED) acked++;
      else if (a.state === STATE.SILENCED) silenced++;
      else if (a.state === STATE.INHIBITED) inhibited++;
      else if (a.state === STATE.RESOLVED) resolved++;
    }
    return {
      counters: Object.assign({}, counters),
      active: { firing, acked, silenced, inhibited, resolved, total: active.size },
      silences: silences.size,
      groups: groups.size,
      routes: routes.length,
      inhibits: inhibits.length,
      historyLength: history.length,
      digestBuffered: digestBuffer.length,
    };
  }

  function close() {
    active.clear();
    fpIndex.clear();
    silences.clear();
    groups.clear();
    digestBuffer = [];
  }

  // ─────────────────────────────────────────────────────────────────────
  // WIRE DEFAULT ROUTES
  // ─────────────────────────────────────────────────────────────────────

  if (opts.defaultRoutes !== false) defaultRoutes();

  // ─────────────────────────────────────────────────────────────────────
  // RETURN MANAGER
  // ─────────────────────────────────────────────────────────────────────

  return {
    // lifecycle
    fire,
    ack,
    resolve,
    tick,
    close,
    // silences
    silence,
    unsilence,
    listSilenced,
    // routing / inhibit
    defineRoute,
    defineInhibit,
    removeInhibit,
    // views
    listActive,
    listGrouped,
    stats,
    flushDigest,
    // on-call
    setOnCall,
    getCurrentOnCall,
    // introspection for tests
    _internal: {
      active,
      fpIndex,
      silences,
      routes,
      inhibits,
      groups,
      history,
      channels,
      get digestBuffer() { return digestBuffer; },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  createManager,
  // Expose helpers so server code and tests can reuse them without
  // reaching into the module internals.
  fingerprint,
  labelsMatch,
  temporalFlags,
  pickRotationMember,
  defaultChannels,
  stubAdapter,
  SEVERITIES,
  SEVERITY_RANK,
  SEVERITY_HE,
  STATE,
  DEFAULT_HOLIDAYS_2026,
};
