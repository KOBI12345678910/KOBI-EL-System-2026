/**
 * Unified Notification Service — User Preferences
 * ──────────────────────────────────────────────────
 * Agent-76 — Notifications
 *
 * Stores per-user preferences:
 *   - which channels are enabled
 *   - quiet hours (start/end, local HH:MM)
 *   - timezone (IANA, default Asia/Jerusalem)
 *   - frequency cap (max non-critical notifications per hour)
 *   - per-type overrides (opt-out of specific notification types)
 *
 * Storage backends:
 *   - Primary: Supabase table `notification_preferences`
 *     (user_id text PK, channels jsonb, quiet_hours jsonb, frequency_cap int,
 *      type_overrides jsonb, timezone text, updated_at timestamptz)
 *   - Fallback: JSONL file at data/notification-preferences.jsonl (last-write-wins replay)
 *
 * The SQL migration is exported via `migrationSql()` so an operator can apply
 * it once. The module is resilient — if Supabase is unreachable or the table
 * does not exist, it transparently falls back to the JSONL store.
 *
 * Zero external deps — uses `fs`, `path`.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { CHANNELS, PRIORITIES } = require('./notification-types');

// ───────────────────────────────────────────────────────────────
// Defaults
// ───────────────────────────────────────────────────────────────

/**
 * DEFAULT_PREFERENCES — applied when a user has no stored preferences.
 * All channels enabled, quiet hours 22:00 – 07:00 (Israeli timezone),
 * frequency cap 30 non-critical notifications per hour.
 */
const DEFAULT_PREFERENCES = Object.freeze({
  channels: Object.freeze({
    [CHANNELS.EMAIL]:    true,
    [CHANNELS.WHATSAPP]: true,
    [CHANNELS.SMS]:      true,
    [CHANNELS.PUSH]:     true,
    [CHANNELS.IN_APP]:   true,
  }),
  quietHours: Object.freeze({
    enabled: true,
    start:   '22:00',
    end:     '07:00',
  }),
  timezone:      'Asia/Jerusalem',
  frequencyCap:  30,     // max non-critical notifications per hour
  typeOverrides: Object.freeze({}),  // { wage_slip_ready: false, ... }
});

// ───────────────────────────────────────────────────────────────
// SQL migration
// ───────────────────────────────────────────────────────────────

function migrationSql() {
  return `
-- notification_preferences — per-user notification settings
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id          TEXT PRIMARY KEY,
  channels         JSONB      NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours      JSONB      NOT NULL DEFAULT '{"enabled":true,"start":"22:00","end":"07:00"}'::jsonb,
  timezone         TEXT       NOT NULL DEFAULT 'Asia/Jerusalem',
  frequency_cap    INTEGER    NOT NULL DEFAULT 30,
  type_overrides   JSONB      NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_updated
  ON notification_preferences (updated_at DESC);
`.trim();
}

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

function safeJsonParse(line) {
  try { return JSON.parse(line); } catch (_) { return null; }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

/**
 * mergeDefaults — shallow-merge user prefs on top of defaults.
 * Returns a plain (non-frozen) object so callers can safely mutate copies.
 */
function mergeDefaults(userPrefs) {
  const u = userPrefs || {};
  return {
    channels: Object.assign({}, DEFAULT_PREFERENCES.channels, u.channels || {}),
    quietHours: Object.assign({}, DEFAULT_PREFERENCES.quietHours, u.quietHours || {}),
    timezone:     u.timezone     || DEFAULT_PREFERENCES.timezone,
    frequencyCap: typeof u.frequencyCap === 'number' ? u.frequencyCap : DEFAULT_PREFERENCES.frequencyCap,
    typeOverrides: Object.assign({}, DEFAULT_PREFERENCES.typeOverrides, u.typeOverrides || {}),
  };
}

/**
 * parseHHMM — return integer minutes since midnight, or null if invalid.
 */
function parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^([0-2]?\d):([0-5]\d)$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h > 23) return null;
  return h * 60 + mm;
}

/**
 * currentLocalMinute — minutes since midnight in the given IANA timezone.
 * Uses Intl.DateTimeFormat — available in Node 20+ without extra deps.
 */
function currentLocalMinute(timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const hPart = parts.find(p => p.type === 'hour');
    const mPart = parts.find(p => p.type === 'minute');
    const h = hPart ? parseInt(hPart.value, 10) : 0;
    const m = mPart ? parseInt(mPart.value, 10) : 0;
    return (h === 24 ? 0 : h) * 60 + m;
  } catch (_) {
    // Fallback: UTC
    const d = new Date();
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
}

/**
 * isInQuietHours — true if the CURRENT time in the user's timezone falls inside
 * their configured quiet hours window. Wrap-around windows (e.g. 22:00 → 07:00)
 * are handled correctly.
 */
function isInQuietHours(prefs, nowDate) {
  if (!prefs || !prefs.quietHours || !prefs.quietHours.enabled) return false;
  const start = parseHHMM(prefs.quietHours.start);
  const end   = parseHHMM(prefs.quietHours.end);
  if (start === null || end === null) return false;
  const cur = nowDate instanceof Date && !isNaN(nowDate.getTime())
    ? ((nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes()) /* fallback-safe */)
    : currentLocalMinute(prefs.timezone || 'Asia/Jerusalem');
  if (start === end) return false;
  if (start < end) {
    return cur >= start && cur < end;
  }
  // wrap-around (e.g. 22:00..07:00)
  return cur >= start || cur < end;
}

// ───────────────────────────────────────────────────────────────
// NotificationPreferences class
// ───────────────────────────────────────────────────────────────

class NotificationPreferences {
  /**
   * @param {object} [opts]
   * @param {object} [opts.supabase]  supabase client (optional)
   * @param {string} [opts.storePath] JSONL fallback path
   * @param {object} [opts.logger]
   */
  constructor(opts = {}) {
    this.supabase  = opts.supabase || null;
    this.storePath = opts.storePath || path.join(process.cwd(), 'data', 'notification-preferences.jsonl');
    this.logger    = opts.logger || {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    };
    // user_id → prefs (in-memory cache built from JSONL)
    this._cache = new Map();
    ensureDir(this.storePath);
    this._loadJsonl();
  }

  // ─── JSONL persistence (fallback / cache) ───
  _loadJsonl() {
    if (!fs.existsSync(this.storePath)) return;
    let raw;
    try { raw = fs.readFileSync(this.storePath, 'utf8'); } catch (_) { return; }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const rec = safeJsonParse(line);
      if (rec && rec.userId && rec.prefs) {
        this._cache.set(rec.userId, rec.prefs);
      }
    }
  }

  _appendJsonl(userId, prefs) {
    try {
      fs.appendFileSync(this.storePath,
        JSON.stringify({ userId, prefs, ts: Date.now() }) + '\n', 'utf8');
    } catch (err) {
      this.logger.error('[notification-preferences] JSONL append failed', err && err.message);
    }
  }

  // ─── Supabase helpers ───
  async _supabaseFetch(userId) {
    if (!this.supabase) return null;
    try {
      const { data, error } = await this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) { this.logger.debug('[notification-preferences] supabase get error', error.message); return null; }
      if (!data) return null;
      return {
        channels:     data.channels       || {},
        quietHours:   data.quiet_hours    || {},
        timezone:     data.timezone       || 'Asia/Jerusalem',
        frequencyCap: typeof data.frequency_cap === 'number' ? data.frequency_cap : 30,
        typeOverrides: data.type_overrides || {},
      };
    } catch (err) {
      this.logger.warn('[notification-preferences] supabase fetch failed', err && err.message);
      return null;
    }
  }

  async _supabaseUpsert(userId, prefs) {
    if (!this.supabase) return false;
    try {
      const row = {
        user_id:        userId,
        channels:       prefs.channels,
        quiet_hours:    prefs.quietHours,
        timezone:       prefs.timezone,
        frequency_cap:  prefs.frequencyCap,
        type_overrides: prefs.typeOverrides,
        updated_at:     new Date().toISOString(),
      };
      const { error } = await this.supabase
        .from('notification_preferences')
        .upsert(row, { onConflict: 'user_id' });
      if (error) { this.logger.debug('[notification-preferences] supabase upsert error', error.message); return false; }
      return true;
    } catch (err) {
      this.logger.warn('[notification-preferences] supabase upsert failed', err && err.message);
      return false;
    }
  }

  // ─── Public API ───

  /**
   * get — return merged preferences for a user (never throws).
   * Reads from Supabase first, falls back to JSONL cache, then to defaults.
   */
  async get(userId) {
    if (!userId) return mergeDefaults(null);
    // Try Supabase
    const fromDb = await this._supabaseFetch(userId);
    if (fromDb) {
      this._cache.set(userId, fromDb);
      return mergeDefaults(fromDb);
    }
    // Fall back to JSONL cache
    if (this._cache.has(userId)) {
      return mergeDefaults(this._cache.get(userId));
    }
    return mergeDefaults(null);
  }

  /**
   * set — replace preferences for a user. Writes to Supabase AND JSONL.
   * `patch` is merged on top of the current stored value.
   */
  async set(userId, patch) {
    if (!userId) throw new Error('userId required');
    const current = await this.get(userId);
    const merged  = mergeDefaults(Object.assign({}, current, patch || {}));

    // Normalise: ensure channels booleans
    for (const k of Object.keys(merged.channels)) {
      merged.channels[k] = Boolean(merged.channels[k]);
    }

    // Persist to Supabase (best-effort)
    await this._supabaseUpsert(userId, merged);
    // Persist to JSONL (source of truth when DB is down)
    this._cache.set(userId, merged);
    this._appendJsonl(userId, merged);
    return merged;
  }

  /**
   * isChannelEnabled — convenience helper.
   */
  async isChannelEnabled(userId, channel) {
    const prefs = await this.get(userId);
    return Boolean(prefs.channels && prefs.channels[channel]);
  }

  /**
   * isTypeMuted — a user can opt out of a specific notification type.
   */
  async isTypeMuted(userId, typeId) {
    const prefs = await this.get(userId);
    const override = prefs.typeOverrides && prefs.typeOverrides[typeId];
    return override === false;
  }

  /**
   * isQuietHours — wrapper so callers don't need to import the internal helper.
   */
  async isQuietHoursFor(userId) {
    const prefs = await this.get(userId);
    return isInQuietHours(prefs);
  }

  /**
   * shouldDeliver — top-level decision used by the notification service.
   *
   *   Rules:
   *     - priority = critical → ALWAYS deliver, ignore prefs, ignore quiet hours.
   *     - priority = info     → if channel === email deliver, else skip.
   *     - priority = high     → respect channel enabled + type opt-out, but bypass quiet hours.
   *     - priority = normal   → respect everything.
   *
   * Returns { allow: boolean, reason: string }.
   */
  async shouldDeliver(userId, channel, typeDef) {
    if (!typeDef) return { allow: false, reason: 'unknown_type' };
    const priority = typeDef.priority || PRIORITIES.NORMAL;
    // critical always wins
    if (priority === PRIORITIES.CRITICAL) return { allow: true, reason: 'critical_override' };

    const prefs = await this.get(userId);

    // info = email-only
    if (priority === PRIORITIES.INFO && channel !== CHANNELS.EMAIL) {
      return { allow: false, reason: 'info_email_only' };
    }

    // per-type opt-out
    if (prefs.typeOverrides && prefs.typeOverrides[typeDef.id] === false) {
      return { allow: false, reason: 'type_muted' };
    }

    // channel disabled
    if (!prefs.channels || !prefs.channels[channel]) {
      return { allow: false, reason: 'channel_disabled' };
    }

    // quiet hours — bypassed for high priority
    if (priority !== PRIORITIES.HIGH && isInQuietHours(prefs)) {
      return { allow: false, reason: 'quiet_hours' };
    }

    return { allow: true, reason: 'ok' };
  }

  /**
   * REST handlers — Express-style (req,res) handlers.
   *
   *   GET  /api/notifications/preferences?userId=... → returns merged prefs
   *   POST /api/notifications/preferences            → body { userId, prefs }
   */
  getHandler() {
    const self = this;
    return async function getPrefsHandler(req, res) {
      try {
        const userId = req.query.userId || (req.actor && req.actor.user) || req.headers['x-user-id'];
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const prefs = await self.get(userId);
        return res.json({ userId, prefs });
      } catch (err) {
        return res.status(500).json({ error: 'internal', detail: err && err.message });
      }
    };
  }

  setHandler() {
    const self = this;
    return async function setPrefsHandler(req, res) {
      try {
        const body = req.body || {};
        const userId = body.userId || (req.query && req.query.userId) || req.headers['x-user-id'];
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const merged = await self.set(userId, body.prefs || body);
        return res.json({ userId, prefs: merged });
      } catch (err) {
        return res.status(500).json({ error: 'internal', detail: err && err.message });
      }
    };
  }
}

module.exports = {
  NotificationPreferences,
  DEFAULT_PREFERENCES,
  migrationSql,
  mergeDefaults,
  parseHHMM,
  currentLocalMinute,
  isInQuietHours,
};
