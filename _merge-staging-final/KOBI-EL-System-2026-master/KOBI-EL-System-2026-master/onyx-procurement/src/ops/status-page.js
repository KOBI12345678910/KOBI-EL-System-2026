/**
 * ONYX OPS — Public Status Page
 * -----------------------------
 * Agent X-62 / Techno-Kol Uzi mega-ERP (Swarm 3D)
 *
 * A Palantir-dark-themed, bilingual (Hebrew RTL / English LTR) public
 * status page for a multi-component production system. Consumes health
 * checks from X-56 (or any compatible probe), tracks incidents, computes
 * 90-day uptime per component, supports subscriptions, RSS/Atom feed,
 * and renders static HTML that can be served without any server runtime.
 *
 * Design rules (hard constraints):
 *   - ZERO external dependencies (only Node built-ins: crypto, fs, path)
 *   - Never deletes incident history; resolved incidents remain in the store
 *   - Hebrew RTL + English LTR toggle in the client HTML
 *   - Palantir dark theme (inline CSS, no frameworks)
 *   - Pure functions where possible; all mutating APIs return the mutated id
 *
 * Public API:
 *   createStatusPage(components[], opts?) -> Page
 *     page.setStatus(componentId, status, message?) -> void
 *     page.startIncident(data) -> id
 *     page.updateIncident(id, update) -> void
 *     page.resolveIncident(id) -> void
 *     page.getComponent(id) -> component
 *     page.getIncident(id) -> incident
 *     page.listIncidents({from,to,activeOnly}) -> incident[]
 *     page.overallStatus() -> { level, label, labelHe }
 *     page.uptime(componentId, days=90) -> number (0..100)
 *     page.render({lang}) -> HTML string
 *     page.renderJson() -> JSON-safe object
 *     page.subscribe(target, opts?) -> subscription id
 *     page.unsubscribe(id) -> boolean
 *     page.feed({lang}) -> RSS XML string
 *     page.writeStatic(dir) -> { htmlPath, jsonPath, feedPath } (no-op if fs unavailable)
 *     page.ingestHealth(componentId, healthResult) -> status (X-56 bridge)
 *
 * Status levels (ordered from best to worst — rank used by overall status):
 *   0 operational           (green  / tikin)
 *   1 maintenance           (blue   / tehzukah) — out-of-band, worst-case ignored
 *   2 degraded              (yellow / beitzuim mufhatim)
 *   3 partial_outage        (orange / takalah helkhit)
 *   4 major_outage          (red    / takalah ma'arkhetit)
 */

'use strict';

const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LEVELS = Object.freeze({
  OPERATIONAL: 'operational',
  MAINTENANCE: 'maintenance',
  DEGRADED: 'degraded',
  PARTIAL_OUTAGE: 'partial_outage',
  MAJOR_OUTAGE: 'major_outage',
});

const VALID_STATUSES = new Set(Object.values(STATUS_LEVELS));

// Rank used to compute overall status (larger = worse). Maintenance is
// intentionally ranked *below* degraded because planned maintenance is
// not an outage — but it still dominates "operational" to surface it.
const STATUS_RANK = Object.freeze({
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
});

const STATUS_COLORS = Object.freeze({
  operational:    { bg: '#14532d', fg: '#a6f4c5', dot: '#10b981', emoji: '\uD83D\uDFE2' },
  maintenance:    { bg: '#1e3a5f', fg: '#a5c8ff', dot: '#3b82f6', emoji: '\uD83D\uDD35' },
  degraded:       { bg: '#4a3a0a', fg: '#fde68a', dot: '#f59e0b', emoji: '\uD83D\uDFE1' },
  partial_outage: { bg: '#4a2a0a', fg: '#fdba74', dot: '#f97316', emoji: '\uD83D\uDFE0' },
  major_outage:   { bg: '#4c0519', fg: '#fca5a5', dot: '#ef4444', emoji: '\uD83D\uDD34' },
});

const STATUS_LABELS_EN = Object.freeze({
  operational:    'Operational',
  maintenance:    'Under maintenance',
  degraded:       'Degraded performance',
  partial_outage: 'Partial outage',
  major_outage:   'Major outage',
});

const STATUS_LABELS_HE = Object.freeze({
  operational:    'תקין',
  maintenance:    'תחזוקה מתוכננת',
  degraded:       'ביצועים מופחתים',
  partial_outage: 'תקלה חלקית',
  major_outage:   'תקלה מערכתית',
});

const OVERALL_LABELS_EN = Object.freeze({
  operational:    'All systems operational',
  maintenance:    'Scheduled maintenance in progress',
  degraded:       'Some systems experiencing degraded performance',
  partial_outage: 'Partial system outage',
  major_outage:   'Major system outage',
});

const OVERALL_LABELS_HE = Object.freeze({
  operational:    'כל המערכות תקינות',
  maintenance:    'תחזוקה מתוכננת בתהליך',
  degraded:       'ביצועים מופחתים',
  partial_outage: 'תקלה חלקית',
  major_outage:   'תקלה מערכתית',
});

// Default component catalogue for the Techno-Kol Uzi platform.
// Callers may override by passing their own components[] to createStatusPage.
const DEFAULT_COMPONENTS = Object.freeze([
  { id: 'core-api',        name: 'Core API',         nameHe: 'שרת ליבה (שכר / רכש / הנה״ח)' },
  { id: 'web-app',         name: 'Web application',  nameHe: 'אפליקציית ווב' },
  { id: 'database',        name: 'Database',         nameHe: 'מסד נתונים' },
  { id: 'background-jobs', name: 'Background jobs',  nameHe: 'משימות רקע' },
  { id: 'email',           name: 'Email delivery',   nameHe: 'שליחת דוא״ל' },
  { id: 'sms',             name: 'SMS delivery',     nameHe: 'שליחת SMS' },
  { id: 'tax-export',      name: 'Tax authority export', nameHe: 'שידור רשות המיסים' },
  { id: 'bank',            name: 'Bank integration', nameHe: 'חיבור בנקים' },
  { id: 'storage',         name: 'File storage',     nameHe: 'אחסון קבצים' },
  { id: 'search',          name: 'Search',           nameHe: 'חיפוש' },
]);

const MS_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_UPTIME_WINDOW_DAYS = 90;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function nowMs() {
  return Date.now();
}

function genId(prefix) {
  const hex = crypto.randomBytes(6).toString('hex');
  return `${prefix}-${hex}`;
}

function escapeHtml(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(input) {
  return escapeHtml(input); // same rules for our text nodes
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

function isoDate(ms) {
  return new Date(ms).toISOString();
}

function validateStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`status-page: invalid status "${status}"`);
  }
}

function normalizeComponents(components) {
  const src = Array.isArray(components) && components.length ? components : DEFAULT_COMPONENTS;
  const seen = new Set();
  return src.map((c) => {
    if (!c || typeof c.id !== 'string' || !c.id) {
      throw new Error('status-page: component requires an "id" string');
    }
    if (seen.has(c.id)) {
      throw new Error(`status-page: duplicate component id "${c.id}"`);
    }
    seen.add(c.id);
    return {
      id: c.id,
      name: typeof c.name === 'string' ? c.name : c.id,
      nameHe: typeof c.nameHe === 'string' ? c.nameHe : (c.name || c.id),
      group: typeof c.group === 'string' ? c.group : null,
    };
  });
}

function worstOf(statuses) {
  let worst = 'operational';
  let worstRank = STATUS_RANK.operational;
  for (const s of statuses) {
    const r = STATUS_RANK[s];
    if (r === undefined) continue;
    if (r > worstRank) {
      worstRank = r;
      worst = s;
    }
  }
  return worst;
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

function createStatusPage(components, opts) {
  const options = Object.assign({
    refreshSec: 60,
    uptimeWindowDays: DEFAULT_UPTIME_WINDOW_DAYS,
    incidentRetentionDays: 365,   // never deleted, but feed truncation
    title: 'Techno-Kol Uzi — System Status',
    titleHe: 'טכנו-קול עוזי — מצב מערכת',
    brand: 'Techno-Kol Uzi',
    url: 'https://status.techno-kol.example/',
    now: null, // optional clock injection for tests
  }, opts || {});

  const clock = typeof options.now === 'function' ? options.now : nowMs;

  // ── state (never deletes incidents) ────────────────────────────────────────
  const normalizedComponents = normalizeComponents(components);
  const componentIndex = new Map();
  for (const c of normalizedComponents) {
    componentIndex.set(c.id, {
      ...c,
      status: STATUS_LEVELS.OPERATIONAL,
      lastMessage: null,
      lastMessageHe: null,
      lastChangedAt: clock(),
      // timeline of { at, status } (append-only — never deleted)
      history: [{ at: clock(), status: STATUS_LEVELS.OPERATIONAL }],
    });
  }

  const incidents = new Map();          // id -> incident
  const subscriptions = new Map();      // id -> { target, channel, createdAt }

  // ── event bus (stub for webhooks / tests) ──────────────────────────────────
  const listeners = { status: [], incident: [], subscription: [] };
  function emit(event, payload) {
    const arr = listeners[event];
    if (!arr) return;
    for (const fn of arr) {
      try { fn(payload); } catch (_) { /* listeners must never crash core */ }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STATUS
  // ──────────────────────────────────────────────────────────────────────────

  function setStatus(componentId, status, message, messageHe) {
    const comp = componentIndex.get(componentId);
    if (!comp) throw new Error(`status-page: unknown component "${componentId}"`);
    validateStatus(status);
    const at = clock();
    const prev = comp.status;
    comp.status = status;
    comp.lastMessage = message || null;
    comp.lastMessageHe = messageHe || message || null;
    comp.lastChangedAt = at;
    if (prev !== status) {
      comp.history.push({ at, status });
    }
    emit('status', { at, componentId, from: prev, to: status, message: comp.lastMessage });
    return comp.status;
  }

  function getComponent(componentId) {
    const comp = componentIndex.get(componentId);
    return comp ? { ...comp, history: comp.history.slice() } : null;
  }

  function listComponents() {
    return normalizedComponents.map((c) => {
      const live = componentIndex.get(c.id);
      return {
        id: c.id,
        name: c.name,
        nameHe: c.nameHe,
        status: live.status,
        lastMessage: live.lastMessage,
        lastMessageHe: live.lastMessageHe,
        lastChangedAt: live.lastChangedAt,
      };
    });
  }

  function overallStatus() {
    const statuses = [];
    for (const c of componentIndex.values()) statuses.push(c.status);
    const level = worstOf(statuses);
    return {
      level,
      label: OVERALL_LABELS_EN[level],
      labelHe: OVERALL_LABELS_HE[level],
      at: clock(),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INCIDENTS
  // ──────────────────────────────────────────────────────────────────────────

  function startIncident(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('status-page: startIncident(data) requires an object');
    }
    const {
      title,
      titleHe,
      componentIds = [],
      impact = STATUS_LEVELS.DEGRADED,
      message,
      messageHe,
      startedAt,
    } = data;

    if (typeof title !== 'string' || !title.trim()) {
      throw new Error('status-page: incident.title is required');
    }
    validateStatus(impact);
    if (!Array.isArray(componentIds) || componentIds.length === 0) {
      throw new Error('status-page: incident.componentIds must be a non-empty array');
    }
    for (const cid of componentIds) {
      if (!componentIndex.has(cid)) {
        throw new Error(`status-page: unknown component "${cid}" in incident`);
      }
    }

    const id = genId('inc');
    const at = typeof startedAt === 'number' ? startedAt : clock();
    const inc = {
      id,
      title: title.trim(),
      titleHe: (typeof titleHe === 'string' && titleHe.trim()) ? titleHe.trim() : title.trim(),
      componentIds: componentIds.slice(),
      impact,
      status: 'investigating',       // investigating | identified | monitoring | resolved
      startedAt: at,
      resolvedAt: null,
      updates: [],
    };
    if (message || messageHe) {
      inc.updates.push({
        at,
        status: 'investigating',
        message: message || messageHe || '',
        messageHe: messageHe || message || '',
      });
    }
    incidents.set(id, inc);

    // Propagate impact to affected components (worst-of preserved)
    for (const cid of componentIds) {
      const comp = componentIndex.get(cid);
      if (STATUS_RANK[impact] > STATUS_RANK[comp.status]) {
        setStatus(cid, impact, message, messageHe);
      }
    }
    emit('incident', { kind: 'started', incident: inc });
    return id;
  }

  function updateIncident(id, update) {
    const inc = incidents.get(id);
    if (!inc) throw new Error(`status-page: unknown incident "${id}"`);
    if (inc.resolvedAt) {
      throw new Error(`status-page: incident "${id}" is already resolved`);
    }
    if (!update || typeof update !== 'object') {
      throw new Error('status-page: updateIncident(id, update) requires an object');
    }
    const {
      status,
      message,
      messageHe,
      impact,
      at,
    } = update;

    const when = typeof at === 'number' ? at : clock();
    if (status) {
      const allowed = new Set(['investigating', 'identified', 'monitoring', 'resolved']);
      if (!allowed.has(status)) {
        throw new Error(`status-page: invalid incident status "${status}"`);
      }
      inc.status = status;
    }
    if (impact) {
      validateStatus(impact);
      inc.impact = impact;
      // push impact to components if it got worse
      for (const cid of inc.componentIds) {
        const comp = componentIndex.get(cid);
        if (STATUS_RANK[impact] > STATUS_RANK[comp.status]) {
          setStatus(cid, impact, message, messageHe);
        }
      }
    }
    inc.updates.push({
      at: when,
      status: inc.status,
      message: message || '',
      messageHe: messageHe || message || '',
    });
    emit('incident', { kind: 'updated', incident: inc });
  }

  function resolveIncident(id, finalMessage, finalMessageHe) {
    const inc = incidents.get(id);
    if (!inc) throw new Error(`status-page: unknown incident "${id}"`);
    if (inc.resolvedAt) return;  // idempotent, never deletes
    const at = clock();
    inc.status = 'resolved';
    inc.resolvedAt = at;
    inc.updates.push({
      at,
      status: 'resolved',
      message: finalMessage || 'Incident resolved.',
      messageHe: finalMessageHe || finalMessage || 'התקלה נפתרה.',
    });

    // If an affected component has no other active incidents on it, clear it.
    for (const cid of inc.componentIds) {
      const stillActive = listActiveIncidents().some((other) =>
        other.id !== id && other.componentIds.indexOf(cid) !== -1,
      );
      if (!stillActive) {
        // Only reset to operational if the component's current status matches
        // this incident's impact — we don't override worse conditions set elsewhere.
        const comp = componentIndex.get(cid);
        if (comp && comp.status !== STATUS_LEVELS.OPERATIONAL) {
          setStatus(cid, STATUS_LEVELS.OPERATIONAL, finalMessage, finalMessageHe);
        }
      }
    }
    emit('incident', { kind: 'resolved', incident: inc });
  }

  function getIncident(id) {
    const inc = incidents.get(id);
    if (!inc) return null;
    return JSON.parse(JSON.stringify(inc));
  }

  function listIncidents(filter) {
    const f = filter || {};
    const now = clock();
    const from = typeof f.from === 'number' ? f.from : now - options.uptimeWindowDays * MS_DAY;
    const to = typeof f.to === 'number' ? f.to : now;
    const out = [];
    for (const inc of incidents.values()) {
      if (inc.startedAt < from || inc.startedAt > to) continue;
      if (f.activeOnly && inc.resolvedAt) continue;
      out.push(JSON.parse(JSON.stringify(inc)));
    }
    out.sort((a, b) => b.startedAt - a.startedAt);
    return out;
  }

  function listActiveIncidents() {
    const out = [];
    for (const inc of incidents.values()) {
      if (!inc.resolvedAt) out.push(inc);
    }
    out.sort((a, b) => b.startedAt - a.startedAt);
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // UPTIME
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Compute uptime percentage for a component over the last `days` days.
   * An interval counts as "down" if its status rank >= partial_outage (3).
   * Degraded and maintenance do NOT count against uptime — they get their
   * own reporting, in line with how public status pages (Atlassian, GitHub)
   * treat availability.
   */
  function uptime(componentId, days) {
    const comp = componentIndex.get(componentId);
    if (!comp) throw new Error(`status-page: unknown component "${componentId}"`);
    const windowDays = days || options.uptimeWindowDays;
    const now = clock();
    const windowStart = now - windowDays * MS_DAY;
    const history = comp.history.slice();

    // Build intervals from history + current
    const intervals = [];
    for (let i = 0; i < history.length; i++) {
      const start = history[i].at;
      const end = i + 1 < history.length ? history[i + 1].at : now;
      intervals.push({ start, end, status: history[i].status });
    }

    let totalMs = 0;
    let downMs = 0;
    for (const iv of intervals) {
      const s = Math.max(iv.start, windowStart);
      const e = Math.min(iv.end, now);
      if (e <= s) continue;
      const dur = e - s;
      totalMs += dur;
      if (STATUS_RANK[iv.status] >= STATUS_RANK.partial_outage) {
        downMs += dur;
      }
    }
    if (totalMs === 0) return 100;
    const pct = 100 * (1 - downMs / totalMs);
    return Math.round(pct * 1000) / 1000; // 3-decimal precision
  }

  function uptimeAll(days) {
    const out = {};
    for (const c of normalizedComponents) {
      out[c.id] = uptime(c.id, days);
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUBSCRIPTIONS (stub — real dispatch lives elsewhere)
  // ──────────────────────────────────────────────────────────────────────────

  function subscribe(target, subOpts) {
    if (typeof target !== 'string' || !target.trim()) {
      throw new Error('status-page: subscribe requires an email or webhook URL');
    }
    const t = target.trim();
    let channel;
    if (t.startsWith('http://') || t.startsWith('https://')) {
      channel = 'webhook';
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
      channel = 'email';
    } else {
      throw new Error('status-page: target must be an email or http(s) URL');
    }
    const id = genId('sub');
    subscriptions.set(id, {
      id,
      target: t,
      channel,
      components: (subOpts && Array.isArray(subOpts.components))
        ? subOpts.components.slice()
        : null, // null = all components
      createdAt: clock(),
    });
    emit('subscription', { kind: 'created', id, target: t, channel });
    return id;
  }

  function unsubscribe(id) {
    const sub = subscriptions.get(id);
    if (!sub) return false;
    // Never hard-delete per house rules — mark as inactive.
    sub.active = false;
    sub.cancelledAt = clock();
    emit('subscription', { kind: 'cancelled', id });
    return true;
  }

  function listSubscriptions() {
    return [...subscriptions.values()].map((s) => ({ ...s }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LISTENERS
  // ──────────────────────────────────────────────────────────────────────────
  function on(event, handler) {
    if (!listeners[event]) throw new Error(`status-page: unknown event "${event}"`);
    if (typeof handler !== 'function') throw new Error('status-page: handler must be a function');
    listeners[event].push(handler);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // X-56 HEALTH CHECK BRIDGE
  // Accepts whatever shape X-56 returns, normalizes to a status level.
  // Minimum supported shapes:
  //   { status: 'pass'|'warn'|'fail' }
  //   { healthy: true|false, latencyMs }
  //   { level: 'operational'|... }
  //   'pass' / 'fail' strings
  // ──────────────────────────────────────────────────────────────────────────
  function ingestHealth(componentId, result) {
    const status = classifyHealth(result);
    if (!status) return null;
    // Don't override an active incident's worse status, and don't flap
    const comp = componentIndex.get(componentId);
    if (!comp) throw new Error(`status-page: unknown component "${componentId}"`);
    const activeWorse = listActiveIncidents().some((inc) =>
      inc.componentIds.indexOf(componentId) !== -1 &&
      STATUS_RANK[inc.impact] > STATUS_RANK[status],
    );
    if (activeWorse) return comp.status;
    if (comp.status !== status) {
      setStatus(componentId, status, extractHealthMessage(result));
    }
    return status;
  }

  function classifyHealth(result) {
    if (result === null || result === undefined) return null;
    if (typeof result === 'string') {
      const r = result.toLowerCase();
      if (r === 'pass' || r === 'ok' || r === 'healthy' || r === 'up') return 'operational';
      if (r === 'warn' || r === 'degraded') return 'degraded';
      if (r === 'fail' || r === 'down' || r === 'unhealthy') return 'major_outage';
      return null;
    }
    if (typeof result !== 'object') return null;
    if (typeof result.level === 'string' && VALID_STATUSES.has(result.level)) {
      return result.level;
    }
    if (typeof result.status === 'string') {
      const s = result.status.toLowerCase();
      if (s === 'pass' || s === 'ok') return 'operational';
      if (s === 'warn') return 'degraded';
      if (s === 'fail') return 'major_outage';
    }
    if (typeof result.healthy === 'boolean') {
      return result.healthy ? 'operational' : 'major_outage';
    }
    return null;
  }

  function extractHealthMessage(result) {
    if (!result || typeof result !== 'object') return null;
    if (typeof result.message === 'string') return result.message;
    if (typeof result.error === 'string') return result.error;
    if (typeof result.detail === 'string') return result.detail;
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDERING
  // ──────────────────────────────────────────────────────────────────────────

  function renderJson() {
    const overall = overallStatus();
    return {
      brand: options.brand,
      title: options.title,
      titleHe: options.titleHe,
      generatedAt: isoDate(clock()),
      overall,
      components: listComponents().map((c) => ({
        id: c.id,
        name: c.name,
        nameHe: c.nameHe,
        status: c.status,
        statusLabel: STATUS_LABELS_EN[c.status],
        statusLabelHe: STATUS_LABELS_HE[c.status],
        uptime90d: uptime(c.id, options.uptimeWindowDays),
        lastMessage: c.lastMessage,
        lastMessageHe: c.lastMessageHe,
        lastChangedAt: isoDate(c.lastChangedAt),
      })),
      activeIncidents: listActiveIncidents().map(serializeIncident),
      recentIncidents: listIncidents({}).map(serializeIncident),
      statusLevels: Object.values(STATUS_LEVELS),
    };
  }

  function serializeIncident(inc) {
    return {
      id: inc.id,
      title: inc.title,
      titleHe: inc.titleHe,
      componentIds: inc.componentIds.slice(),
      impact: inc.impact,
      impactLabel: STATUS_LABELS_EN[inc.impact],
      impactLabelHe: STATUS_LABELS_HE[inc.impact],
      status: inc.status,
      startedAt: isoDate(inc.startedAt),
      resolvedAt: inc.resolvedAt ? isoDate(inc.resolvedAt) : null,
      updates: inc.updates.map((u) => ({
        at: isoDate(u.at),
        status: u.status,
        message: u.message,
        messageHe: u.messageHe,
      })),
    };
  }

  function render(renderOpts) {
    const lang = (renderOpts && renderOpts.lang) === 'en' ? 'en' : 'he';
    const isHe = lang === 'he';
    const dir = isHe ? 'rtl' : 'ltr';
    const overall = overallStatus();
    const components = listComponents();
    const active = listActiveIncidents();
    const history = listIncidents({});
    const upAll = uptimeAll(options.uptimeWindowDays);
    const t = isHe ? {
      title: options.titleHe,
      subtitle: 'דף מצב המערכת',
      components: 'רכיבי מערכת',
      active: 'תקלות פעילות',
      history: 'היסטוריית תקלות (90 ימים אחרונים)',
      uptime: 'זמינות 90 ימים',
      subscribe: 'הירשמו לעדכונים',
      subscribeBtn: 'הרשמה',
      subscribePh: 'דוא״ל או webhook',
      rss: 'RSS',
      lastUpdated: 'עודכן לאחרונה',
      noIncidents: 'אין תקלות פעילות כעת',
      noHistory: 'לא נרשמו תקלות בחלון הזמן האחרון',
      autoRefresh: `רענון אוטומטי כל ${options.refreshSec} שניות`,
      langBtn: 'EN',
      copyright: `© ${new Date(clock()).getFullYear()} ${options.brand}`,
    } : {
      title: options.title,
      subtitle: 'System status page',
      components: 'Components',
      active: 'Active incidents',
      history: 'Incident history (last 90 days)',
      uptime: '90-day uptime',
      subscribe: 'Subscribe to updates',
      subscribeBtn: 'Subscribe',
      subscribePh: 'Email or webhook URL',
      rss: 'RSS',
      lastUpdated: 'Last updated',
      noIncidents: 'No active incidents right now',
      noHistory: 'No incidents recorded in this window',
      autoRefresh: `Auto-refresh every ${options.refreshSec} seconds`,
      langBtn: 'עברית',
      copyright: `(c) ${new Date(clock()).getFullYear()} ${options.brand}`,
    };

    const overallColor = STATUS_COLORS[overall.level];
    const overallLabel = isHe ? overall.labelHe : overall.label;

    const componentsHtml = components.map((c) => {
      const color = STATUS_COLORS[c.status];
      const name = isHe ? c.nameHe : c.name;
      const label = isHe ? STATUS_LABELS_HE[c.status] : STATUS_LABELS_EN[c.status];
      const msg = (isHe ? c.lastMessageHe : c.lastMessage) || '';
      const up = upAll[c.id];
      return `
      <li class="component" data-status="${escapeHtml(c.status)}">
        <span class="dot" style="background:${color.dot}"></span>
        <div class="component-main">
          <div class="component-name">${escapeHtml(name)}</div>
          ${msg ? `<div class="component-msg">${escapeHtml(msg)}</div>` : ''}
        </div>
        <div class="component-meta">
          <span class="pill" style="background:${color.bg};color:${color.fg}">${escapeHtml(label)}</span>
          <span class="uptime" title="${escapeHtml(t.uptime)}">${up.toFixed(2)}%</span>
        </div>
      </li>`;
    }).join('');

    const activeHtml = active.length === 0
      ? `<p class="empty">${escapeHtml(t.noIncidents)}</p>`
      : active.map((inc) => renderIncidentHtml(inc, isHe)).join('');

    const historyHtml = history.length === 0
      ? `<p class="empty">${escapeHtml(t.noHistory)}</p>`
      : history.map((inc) => renderIncidentHtml(inc, isHe)).join('');

    const lastUpdated = isoDate(clock());

    return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="${options.refreshSec}">
<title>${escapeHtml(t.title)}</title>
<link rel="alternate" type="application/rss+xml" title="RSS" href="./feed.xml">
<style>
:root {
  --bg: #0b0f14;
  --bg-elev: #121820;
  --bg-hi: #1a2230;
  --fg: #e5e9f0;
  --fg-dim: #8a94a6;
  --border: #1f2937;
  --accent: #2dd4bf;
  --shadow: 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px rgba(0,0,0,0.5);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans Hebrew", "David", sans-serif; }
body { min-height: 100vh; }
.container { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
header .brand { font-weight: 600; font-size: 14px; color: var(--fg-dim); letter-spacing: 0.08em; text-transform: uppercase; }
header .lang-toggle { background: var(--bg-elev); color: var(--fg); border: 1px solid var(--border); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; text-decoration: none; }
header .lang-toggle:hover { background: var(--bg-hi); }
h1 { font-size: 28px; margin: 0 0 6px 0; font-weight: 600; letter-spacing: -0.01em; }
.subtitle { color: var(--fg-dim); font-size: 14px; margin: 0 0 24px 0; }
.overall {
  background: ${overallColor.bg};
  color: ${overallColor.fg};
  padding: 20px 24px;
  border-radius: 10px;
  font-size: 18px;
  font-weight: 600;
  display: flex; align-items: center; gap: 14px;
  box-shadow: var(--shadow);
  margin-bottom: 32px;
  border: 1px solid ${overallColor.dot};
}
.overall .dot { width: 14px; height: 14px; border-radius: 50%; background: ${overallColor.dot}; box-shadow: 0 0 0 4px rgba(255,255,255,0.06); }
section { margin-bottom: 36px; }
section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-dim); margin: 0 0 12px 0; font-weight: 600; }
.empty { color: var(--fg-dim); font-size: 13px; font-style: italic; margin: 8px 0; }
ul.components { list-style: none; padding: 0; margin: 0; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.component { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.component:last-child { border-bottom: none; }
.component .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.component-main { flex: 1; min-width: 0; }
.component-name { font-weight: 500; font-size: 15px; }
.component-msg { font-size: 12px; color: var(--fg-dim); margin-top: 2px; }
.component-meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.pill { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; white-space: nowrap; }
.uptime { font-variant-numeric: tabular-nums; font-size: 12px; color: var(--fg-dim); min-width: 60px; text-align: ${isHe ? 'left' : 'right'}; }
.incident { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; }
.incident.active { border-color: #ef4444; box-shadow: 0 0 0 1px rgba(239,68,68,0.2); }
.incident-title { font-weight: 600; font-size: 15px; margin: 0 0 6px 0; }
.incident-meta { font-size: 12px; color: var(--fg-dim); margin-bottom: 10px; }
.incident-update { border-${isHe ? 'right' : 'left'}: 2px solid var(--border); padding-${isHe ? 'right' : 'left'}: 12px; margin-bottom: 8px; font-size: 13px; }
.incident-update time { display: block; font-size: 11px; color: var(--fg-dim); margin-bottom: 2px; }
form.subscribe { display: flex; gap: 8px; background: var(--bg-elev); border: 1px solid var(--border); padding: 14px; border-radius: 10px; }
form.subscribe input { flex: 1; background: var(--bg); color: var(--fg); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; font-size: 14px; }
form.subscribe button { background: var(--accent); color: #0b0f14; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; }
form.subscribe button:hover { filter: brightness(1.1); }
.rss-link { display: inline-block; margin-top: 8px; color: var(--fg-dim); font-size: 12px; text-decoration: none; }
.rss-link:hover { color: var(--accent); }
footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--fg-dim); font-size: 12px; text-align: center; }
footer .updated { display: block; margin-bottom: 4px; }
@media (max-width: 600px) {
  h1 { font-size: 22px; }
  .overall { font-size: 16px; padding: 16px 18px; }
  .component { padding: 12px 14px; gap: 10px; }
  .uptime { min-width: 48px; }
  form.subscribe { flex-direction: column; }
}
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="brand">${escapeHtml(options.brand)}</div>
    <a class="lang-toggle" href="./?lang=${isHe ? 'en' : 'he'}">${escapeHtml(t.langBtn)}</a>
  </header>
  <h1>${escapeHtml(t.title)}</h1>
  <p class="subtitle">${escapeHtml(t.subtitle)}</p>

  <div class="overall" role="status" aria-live="polite">
    <span class="dot"></span>
    <span>${escapeHtml(overallLabel)}</span>
  </div>

  <section>
    <h2>${escapeHtml(t.active)}</h2>
    ${activeHtml}
  </section>

  <section>
    <h2>${escapeHtml(t.components)}</h2>
    <ul class="components">${componentsHtml}</ul>
  </section>

  <section>
    <h2>${escapeHtml(t.history)}</h2>
    ${historyHtml}
  </section>

  <section>
    <h2>${escapeHtml(t.subscribe)}</h2>
    <form class="subscribe" method="post" action="./subscribe">
      <input name="target" type="text" placeholder="${escapeHtml(t.subscribePh)}" required>
      <button type="submit">${escapeHtml(t.subscribeBtn)}</button>
    </form>
    <a class="rss-link" href="./feed.xml">${escapeHtml(t.rss)}</a>
  </section>

  <footer>
    <span class="updated">${escapeHtml(t.lastUpdated)}: <time datetime="${escapeHtml(lastUpdated)}">${escapeHtml(lastUpdated)}</time></span>
    <span>${escapeHtml(t.autoRefresh)}</span>
    <br>
    <span>${escapeHtml(t.copyright)}</span>
  </footer>
</div>
</body>
</html>
`;
  }

  function renderIncidentHtml(inc, isHe) {
    const color = STATUS_COLORS[inc.impact];
    const title = isHe ? inc.titleHe : inc.title;
    const impactLabel = isHe ? STATUS_LABELS_HE[inc.impact] : STATUS_LABELS_EN[inc.impact];
    const active = !inc.resolvedAt;
    const started = isoDate(inc.startedAt);
    const resolved = inc.resolvedAt ? isoDate(inc.resolvedAt) : '';
    const updatesHtml = inc.updates.map((u) => {
      const when = isoDate(u.at);
      const m = isHe ? u.messageHe : u.message;
      return `
        <div class="incident-update">
          <time datetime="${escapeHtml(when)}">${escapeHtml(when)} — ${escapeHtml(u.status)}</time>
          ${m ? escapeHtml(m) : ''}
        </div>`;
    }).join('');
    return `
      <article class="incident${active ? ' active' : ''}">
        <h3 class="incident-title">${escapeHtml(title)}</h3>
        <div class="incident-meta">
          <span class="pill" style="background:${color.bg};color:${color.fg}">${escapeHtml(impactLabel)}</span>
          <span>&nbsp;&middot;&nbsp;${escapeHtml(started)}</span>
          ${resolved ? `<span>&nbsp;&middot;&nbsp;${escapeHtml(resolved)}</span>` : ''}
        </div>
        ${updatesHtml}
      </article>`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RSS FEED
  // ──────────────────────────────────────────────────────────────────────────
  function feed(feedOpts) {
    const lang = (feedOpts && feedOpts.lang) === 'en' ? 'en' : 'he';
    const isHe = lang === 'he';
    const items = listIncidents({}).slice(0, 50);
    const title = isHe ? options.titleHe : options.title;
    const link = options.url;
    const desc = isHe ? 'עדכוני מצב מערכת' : 'System status updates';
    const lastBuild = new Date(clock()).toUTCString();

    const itemsXml = items.map((inc) => {
      const pubDate = new Date(inc.startedAt).toUTCString();
      const t = isHe ? inc.titleHe : inc.title;
      const impactLabel = isHe ? STATUS_LABELS_HE[inc.impact] : STATUS_LABELS_EN[inc.impact];
      const lastUpdate = inc.updates[inc.updates.length - 1];
      const body = lastUpdate
        ? (isHe ? lastUpdate.messageHe : lastUpdate.message) || ''
        : '';
      return `    <item>
      <title>${escapeXml(`[${impactLabel}] ${t}`)}</title>
      <link>${escapeXml(link + '#' + inc.id)}</link>
      <guid isPermaLink="false">${escapeXml(inc.id)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(body)}</description>
    </item>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(desc)}</description>
    <language>${isHe ? 'he' : 'en'}</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${itemsXml}
  </channel>
</rss>
`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STATIC FILE EMISSION
  // ──────────────────────────────────────────────────────────────────────────
  function writeStatic(outputDir) {
    let fs, path;
    try {
      fs = require('fs');
      path = require('path');
    } catch (_) {
      return { htmlPath: null, jsonPath: null, feedPath: null };
    }
    if (!outputDir) throw new Error('status-page: writeStatic requires a directory');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const htmlPath = path.join(outputDir, 'index.html');
    const jsonPath = path.join(outputDir, 'status.json');
    const feedPath = path.join(outputDir, 'feed.xml');
    fs.writeFileSync(htmlPath, render({ lang: 'he' }), 'utf8');
    fs.writeFileSync(jsonPath, JSON.stringify(renderJson(), null, 2), 'utf8');
    fs.writeFileSync(feedPath, feed({ lang: 'he' }), 'utf8');
    return { htmlPath, jsonPath, feedPath };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC SURFACE
  // ──────────────────────────────────────────────────────────────────────────
  return {
    // status
    setStatus,
    getComponent,
    listComponents,
    overallStatus,
    ingestHealth,

    // incidents
    startIncident,
    updateIncident,
    resolveIncident,
    getIncident,
    listIncidents,
    listActiveIncidents,

    // uptime
    uptime,
    uptimeAll,

    // subscriptions
    subscribe,
    unsubscribe,
    listSubscriptions,

    // events
    on,

    // rendering
    render,
    renderJson,
    feed,
    writeStatic,

    // constants (frozen)
    STATUS_LEVELS,
    STATUS_RANK,
    STATUS_LABELS_EN,
    STATUS_LABELS_HE,

    // introspection
    get options() { return { ...options }; },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  createStatusPage,
  STATUS_LEVELS,
  STATUS_RANK,
  STATUS_LABELS_EN,
  STATUS_LABELS_HE,
  STATUS_COLORS,
  DEFAULT_COMPONENTS,
  // exported for whitebox tests
  _worstOf: worstOf,
  _escapeHtml: escapeHtml,
  _normalizeComponents: normalizeComponents,
};
