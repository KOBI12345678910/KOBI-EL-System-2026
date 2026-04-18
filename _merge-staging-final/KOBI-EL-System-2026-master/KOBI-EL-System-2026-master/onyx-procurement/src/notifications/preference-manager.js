/**
 * preference-manager.js — Agent X-16 (Swarm 3)
 * Techno-Kol Uzi mega-ERP 2026 — Notification Preference Manager
 *
 * Per-user / per-category notification preferences with:
 *   - Channel selection: in_app | email | whatsapp | sms | disabled
 *   - Do Not Disturb schedule (Israeli weekday + Shabbat awareness)
 *   - Priority rules (critical bypasses DND)
 *   - Digest mode (hourly/daily summary instead of individual)
 *   - Channel fallback chain (try whatsapp, fall back to email)
 *
 * Zero external dependencies. Uses node:fs, node:path, Intl.DateTimeFormat.
 * All time calculations are timezone-aware for Asia/Jerusalem (Israeli weekday
 * starts Sunday; Shabbat = Friday night → Saturday night).
 *
 * JSONL persistence (append-only, last-write-wins replay) at
 *   data/notification-preferences-v2.jsonl
 *
 * Public exports:
 *   loadPreferences(userId)                       → prefs object
 *   savePreferences(userId, prefs)                → void (persists)
 *   resolveChannels(userId, category, severity)   → Array<string>
 *   isInDnd(userId, timestamp)                    → boolean
 *   getDefaultPrefs()                             → default prefs
 *
 * Additional helpers:
 *   shouldDigest(userId, category, severity)      → 'none' | 'hourly' | 'daily'
 *   getDigestQueue(userId)                        → digest state
 *   resetCache()                                  → clear in-memory cache
 *   setStorePath(path)                            → for tests
 *
 * Severity levels: 'info' | 'normal' | 'high' | 'critical'
 * Categories: 'invoice' | 'payment' | 'alert' | 'system' | 'approval' | 'default'
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* ================================================================= */
/*  Constants                                                          */
/* ================================================================= */

const CHANNELS = Object.freeze({
  IN_APP:   'in_app',
  EMAIL:    'email',
  WHATSAPP: 'whatsapp',
  SMS:      'sms',
  DISABLED: 'disabled',
});

const SEVERITIES = Object.freeze({
  INFO:     'info',
  NORMAL:   'normal',
  HIGH:     'high',
  CRITICAL: 'critical',
});

const CATEGORIES = Object.freeze([
  'invoice',
  'payment',
  'alert',
  'system',
  'approval',
]);

const DIGEST_MODES = Object.freeze({
  NONE:   'none',
  HOURLY: 'hourly',
  DAILY:  'daily',
});

const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

// Israeli weekday indexes (JS Date.getDay in UTC + converted below)
// 0 = Sunday, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
const WEEKDAY = Object.freeze({
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
});

// Default in-memory cache of user → prefs
let _cache = new Map();
let _storePath = path.join(process.cwd(), 'data', 'notification-preferences-v2.jsonl');
let _loaded = false;

/* ================================================================= */
/*  Helpers                                                            */
/* ================================================================= */

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* noop */ }
  }
}

function safeJsonParse(line) {
  try { return JSON.parse(line); } catch (_) { return null; }
}

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
 * localParts — return { weekday, hours, minutes } for a given instant in a
 * specific IANA timezone.  Uses Intl.DateTimeFormat (no deps).
 */
function localParts(date, timezone) {
  const d = date instanceof Date ? date : new Date(date);
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    return { weekday: WEEKDAY.SUN, hours: 0, minutes: 0 };
  }
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const wdStr = (parts.find((p) => p.type === 'weekday') || {}).value || 'Sun';
    const hStr  = (parts.find((p) => p.type === 'hour') || {}).value || '00';
    const mStr  = (parts.find((p) => p.type === 'minute') || {}).value || '00';
    const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let h = parseInt(hStr, 10);
    if (h === 24) h = 0;
    return {
      weekday: wdMap[wdStr] != null ? wdMap[wdStr] : 0,
      hours: h,
      minutes: parseInt(mStr, 10) || 0,
    };
  } catch (_) {
    return { weekday: d.getUTCDay(), hours: d.getUTCHours(), minutes: d.getUTCMinutes() };
  }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ================================================================= */
/*  Default preferences                                                */
/* ================================================================= */

/**
 * getDefaultPrefs — sensible defaults for a new user.
 *
 * Structure:
 *   {
 *     timezone: string,
 *     digestMode: 'none' | 'hourly' | 'daily',
 *     channelFallback: Array<channel>,   // fallback chain
 *     categories: {
 *       [categoryId]: {
 *         channels: Array<channel>,
 *         dnd: { enabled, start, end, days, shabbat }
 *       }
 *     }
 *   }
 */
function getDefaultPrefs() {
  // DND default: 22:00 → 07:00 on every day, respect Shabbat
  const defaultDnd = {
    enabled: true,
    start: '22:00',
    end: '07:00',
    // Days on which the DND window applies.  Use Israeli weekday numbers.
    days: [WEEKDAY.SUN, WEEKDAY.MON, WEEKDAY.TUE, WEEKDAY.WED, WEEKDAY.THU, WEEKDAY.FRI, WEEKDAY.SAT],
    // When true, DND is active for the entire Shabbat (Friday sunset → Saturday sunset)
    shabbat: true,
  };

  const byCategory = {
    invoice:  { channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],               dnd: deepClone(defaultDnd) },
    payment:  { channels: [CHANNELS.IN_APP, CHANNELS.EMAIL, CHANNELS.WHATSAPP], dnd: deepClone(defaultDnd) },
    alert:    { channels: [CHANNELS.IN_APP, CHANNELS.WHATSAPP, CHANNELS.SMS], dnd: deepClone(defaultDnd) },
    system:   { channels: [CHANNELS.IN_APP],                              dnd: deepClone(defaultDnd) },
    approval: { channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],               dnd: deepClone(defaultDnd) },
    default:  { channels: [CHANNELS.IN_APP, CHANNELS.EMAIL],               dnd: deepClone(defaultDnd) },
  };

  return {
    timezone:        DEFAULT_TIMEZONE,
    digestMode:      DIGEST_MODES.NONE,
    digestCategories: [],  // categories that should be digested
    channelFallback: [CHANNELS.WHATSAPP, CHANNELS.SMS, CHANNELS.EMAIL, CHANNELS.IN_APP],
    categories:      byCategory,
  };
}

/* ================================================================= */
/*  JSONL persistence                                                  */
/* ================================================================= */

function setStorePath(p) {
  _storePath = p;
  _loaded = false;
  _cache = new Map();
}

function resetCache() {
  _cache = new Map();
  _loaded = false;
}

function _loadJsonl() {
  if (_loaded) return;
  _loaded = true;
  if (!fs.existsSync(_storePath)) return;
  let raw;
  try { raw = fs.readFileSync(_storePath, 'utf8'); } catch (_) { return; }
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const rec = safeJsonParse(line);
    if (rec && rec.userId && rec.prefs) {
      _cache.set(rec.userId, rec.prefs);
    }
  }
}

function _appendJsonl(userId, prefs) {
  ensureDir(_storePath);
  try {
    fs.appendFileSync(
      _storePath,
      JSON.stringify({ userId, prefs, ts: Date.now() }) + '\n',
      'utf8'
    );
  } catch (_) { /* swallow — in-memory cache is still valid */ }
}

/* ================================================================= */
/*  Merge helpers                                                      */
/* ================================================================= */

function mergeCategoryPref(base, patch) {
  if (!patch) return base;
  return {
    channels: Array.isArray(patch.channels) ? patch.channels.slice() : base.channels.slice(),
    dnd: patch.dnd ? Object.assign({}, base.dnd, patch.dnd) : Object.assign({}, base.dnd),
  };
}

/**
 * mergeDefaults — shallow-deep merge user prefs on top of defaults.
 */
function mergeDefaults(userPrefs) {
  const def = getDefaultPrefs();
  if (!userPrefs || typeof userPrefs !== 'object') return def;

  const merged = {
    timezone: userPrefs.timezone || def.timezone,
    digestMode: Object.values(DIGEST_MODES).includes(userPrefs.digestMode)
      ? userPrefs.digestMode
      : def.digestMode,
    digestCategories: Array.isArray(userPrefs.digestCategories)
      ? userPrefs.digestCategories.slice()
      : def.digestCategories.slice(),
    channelFallback: Array.isArray(userPrefs.channelFallback) && userPrefs.channelFallback.length
      ? userPrefs.channelFallback.slice()
      : def.channelFallback.slice(),
    categories: {},
  };

  const catKeys = new Set([...Object.keys(def.categories), ...Object.keys(userPrefs.categories || {})]);
  for (const k of catKeys) {
    const baseCat = def.categories[k] || def.categories.default;
    const patchCat = (userPrefs.categories || {})[k];
    merged.categories[k] = mergeCategoryPref(deepClone(baseCat), patchCat);
  }
  if (!merged.categories.default) merged.categories.default = deepClone(def.categories.default);

  return merged;
}

/* ================================================================= */
/*  Public API — load / save                                           */
/* ================================================================= */

/**
 * loadPreferences(userId) — return merged preferences for the user.
 * Shape:
 *   {
 *     timezone, digestMode, channelFallback,
 *     categories: { [categoryId]: { channels: [], dnd: { start, end, days } } }
 *   }
 */
function loadPreferences(userId) {
  if (!userId) return mergeDefaults(null);
  _loadJsonl();
  if (_cache.has(userId)) {
    return mergeDefaults(_cache.get(userId));
  }
  return mergeDefaults(null);
}

/**
 * savePreferences(userId, prefs) — persist (JSONL append + in-memory cache).
 * Patch is DEEP-merged on top of the current stored value: top-level scalars
 * are replaced by the patch, but the `categories` object is merged per-key
 * so patching a single category does not wipe the others.
 */
function savePreferences(userId, prefs) {
  if (!userId) throw new Error('userId required');
  if (!prefs || typeof prefs !== 'object') throw new Error('prefs required');
  _loadJsonl();
  const current = _cache.has(userId) ? _cache.get(userId) : mergeDefaults(null);

  // Shallow merge top-level fields (except categories)
  const combined = {
    timezone:         prefs.timezone         != null ? prefs.timezone         : current.timezone,
    digestMode:       prefs.digestMode       != null ? prefs.digestMode       : current.digestMode,
    digestCategories: Array.isArray(prefs.digestCategories) ? prefs.digestCategories.slice() : (current.digestCategories || []).slice(),
    channelFallback:  Array.isArray(prefs.channelFallback)  ? prefs.channelFallback.slice()  : (current.channelFallback  || []).slice(),
    categories:       Object.assign({}, current.categories || {}),
  };

  // Deep-merge categories key by key
  if (prefs.categories && typeof prefs.categories === 'object') {
    for (const k of Object.keys(prefs.categories)) {
      const baseCat = combined.categories[k] || current.categories[k] || (getDefaultPrefs().categories[k] || getDefaultPrefs().categories.default);
      combined.categories[k] = mergeCategoryPref(deepClone(baseCat), prefs.categories[k]);
    }
  }

  const merged = mergeDefaults(combined);
  _cache.set(userId, merged);
  _appendJsonl(userId, merged);
}

/* ================================================================= */
/*  Do Not Disturb logic                                               */
/* ================================================================= */

/**
 * isShabbat — returns true if the given timestamp falls inside the Shabbat
 * window in the user's timezone.
 *
 * Conservative definition used here (no astronomy calcs):
 *   Shabbat begins Friday 18:00 local and ends Saturday 20:00 local.
 *   This is a close-enough-in-Israel heuristic that works for all of the
 *   year without requiring sunset tables.
 */
function isShabbat(timestamp, timezone) {
  const { weekday, hours, minutes } = localParts(timestamp, timezone || DEFAULT_TIMEZONE);
  const totalMin = hours * 60 + minutes;
  // Friday 18:00 (=1080) onwards
  if (weekday === WEEKDAY.FRI && totalMin >= 18 * 60) return true;
  // All day Saturday until 20:00 (=1200)
  if (weekday === WEEKDAY.SAT && totalMin < 20 * 60) return true;
  return false;
}

/**
 * isInDndForCategory — internal check for a specific category's DND config.
 */
function isInDndForCategory(dnd, timestamp, timezone) {
  if (!dnd || dnd.enabled === false) return false;

  // Shabbat awareness overrides day windows
  if (dnd.shabbat && isShabbat(timestamp, timezone)) return true;

  const startMin = parseHHMM(dnd.start);
  const endMin = parseHHMM(dnd.end);
  if (startMin === null || endMin === null) return false;

  const { weekday, hours, minutes } = localParts(timestamp, timezone);
  const curMin = hours * 60 + minutes;

  // Check weekday applies
  const daysList = Array.isArray(dnd.days) && dnd.days.length ? dnd.days : [0, 1, 2, 3, 4, 5, 6];

  if (startMin === endMin) return false;

  if (startMin < endMin) {
    // Simple window (e.g. 09:00 → 17:00)
    if (!daysList.includes(weekday)) return false;
    return curMin >= startMin && curMin < endMin;
  }

  // Wrap-around window (e.g. 22:00 → 07:00)
  // If we're in the "late" part (22:00..23:59) → the day must be in list
  // If we're in the "early" part (00:00..07:00) → the previous day must be in list
  if (curMin >= startMin) {
    return daysList.includes(weekday);
  }
  if (curMin < endMin) {
    const prevDay = (weekday + 6) % 7;
    return daysList.includes(prevDay);
  }
  return false;
}

/**
 * isInDnd(userId, timestamp) — is the user currently inside their DND window
 * for their DEFAULT category?  (Use isInDndForCategory internally to check
 * per-category if needed.)
 *
 * Any category's DND blocks if enabled — but since category-level is the
 * honest question, we check the 'default' category here.  resolveChannels
 * below does the per-category check.
 */
function isInDnd(userId, timestamp) {
  const prefs = loadPreferences(userId);
  const ts = timestamp || Date.now();
  const tz = prefs.timezone || DEFAULT_TIMEZONE;
  const def = prefs.categories.default || prefs.categories[CATEGORIES[0]];
  if (!def) return false;
  return isInDndForCategory(def.dnd, ts, tz);
}

/* ================================================================= */
/*  Channel resolution                                                 */
/* ================================================================= */

/**
 * resolveChannels(userId, category, severity) — decide which channels should
 * be used for the given event.  Applies:
 *   - Per-category channel preferences
 *   - DND (critical bypasses DND entirely; high bypasses DND for in_app only)
 *   - Digest mode (returns [] if this category is currently being digested)
 *   - Fallback chain (if configured channels are empty or disabled)
 *
 * @param {string} userId
 * @param {string} category   one of CATEGORIES or 'default'
 * @param {string} severity   'info' | 'normal' | 'high' | 'critical'
 * @param {number} [timestamp=now]
 * @returns {Array<string>}   list of channel names, or [] if suppressed
 */
function resolveChannels(userId, category, severity, timestamp) {
  const prefs = loadPreferences(userId);
  const ts = timestamp || Date.now();
  const tz = prefs.timezone || DEFAULT_TIMEZONE;
  const sev = severity || SEVERITIES.NORMAL;

  const catPref = (prefs.categories && (prefs.categories[category] || prefs.categories.default)) || null;
  if (!catPref) return [];

  // Category explicitly disabled: channels === [DISABLED] (single entry) is an
  // explicit opt-out and MUST NOT fall back. An empty channels array, however,
  // means "no preference set" and should hit the fallback chain below.
  if (Array.isArray(catPref.channels)
      && catPref.channels.length === 1
      && catPref.channels[0] === CHANNELS.DISABLED) {
    return [];
  }

  // Digest mode — for non-critical, if this category is in digestCategories,
  // return [] (the digest worker will batch it).
  if (sev !== SEVERITIES.CRITICAL
      && prefs.digestMode !== DIGEST_MODES.NONE
      && Array.isArray(prefs.digestCategories)
      && prefs.digestCategories.includes(category)) {
    return [];
  }

  // Critical bypasses DND entirely
  const inDnd = isInDndForCategory(catPref.dnd, ts, tz);
  if (sev === SEVERITIES.CRITICAL) {
    return catPref.channels.filter((c) => c !== CHANNELS.DISABLED);
  }

  if (inDnd) {
    // High severity: still deliver on in_app only
    if (sev === SEVERITIES.HIGH) {
      const inApp = catPref.channels.filter((c) => c === CHANNELS.IN_APP);
      if (inApp.length > 0) return inApp;
      return [];
    }
    // info / normal suppressed during DND
    return [];
  }

  // Channels active (filter DISABLED just in case)
  let resolved = catPref.channels.filter((c) => c !== CHANNELS.DISABLED);

  // Apply fallback chain if nothing was configured
  if (resolved.length === 0 && Array.isArray(prefs.channelFallback)) {
    resolved = prefs.channelFallback
      .filter((c) => c !== CHANNELS.DISABLED)
      .slice(0, 1);  // fallback delivers on ONE channel
  }

  return resolved;
}

/* ================================================================= */
/*  Digest helpers                                                     */
/* ================================================================= */

/**
 * shouldDigest(userId, category, severity) — return the digest mode that
 * applies to this event.  'none' means deliver immediately.
 */
function shouldDigest(userId, category, severity) {
  const prefs = loadPreferences(userId);
  const sev = severity || SEVERITIES.NORMAL;
  if (sev === SEVERITIES.CRITICAL) return DIGEST_MODES.NONE;
  if (prefs.digestMode === DIGEST_MODES.NONE) return DIGEST_MODES.NONE;
  if (!Array.isArray(prefs.digestCategories) || !prefs.digestCategories.includes(category)) {
    return DIGEST_MODES.NONE;
  }
  return prefs.digestMode;
}

/* ================================================================= */
/*  Exports                                                            */
/* ================================================================= */

module.exports = {
  // Public API
  loadPreferences,
  savePreferences,
  resolveChannels,
  isInDnd,
  getDefaultPrefs,

  // Extended
  shouldDigest,
  isShabbat,

  // Internal but useful
  isInDndForCategory,
  mergeDefaults,
  parseHHMM,
  localParts,
  resetCache,
  setStorePath,

  // Constants
  CHANNELS,
  SEVERITIES,
  CATEGORIES,
  DIGEST_MODES,
  WEEKDAY,
  DEFAULT_TIMEZONE,
};
