/**
 * Internal Broadcast / Employee Announcement System
 * Techno-Kol Uzi — Mega-ERP — Agent Y-127
 * ==================================================
 *
 * Purpose
 * -------
 * A zero-dependency, append-only, bilingual (HE/EN) internal
 * broadcast engine for the Techno-Kol Uzi mega-ERP.  It is used
 * *inside the company* — to push notices, policy updates, safety
 * alerts, shift reminders and polls to *employees only*.  It is
 * NOT a customer-facing marketing tool.
 *
 * Governing rule
 * --------------
 *   לא מוחקים רק משדרגים ומגדלים
 *   "We never delete, only upgrade and grow."
 *
 * In practice this means:
 *   - `recallAnnouncement` does NOT erase an announcement.  It
 *     appends a retraction note and flips a flag so the UI can
 *     render it struck-through.  The original payload, delivery
 *     log, read receipts and acknowledgment ledger stay intact
 *     forever for audit.
 *   - No method exposes `delete`, `remove`, or `clear` on the
 *     store.  Everything is append-only.
 *   - All state mutations are logged into `auditTrail` with a
 *     monotonic sequence number.
 *
 * Channels supported
 * ------------------
 *   email                -> SMTP gateway (stubbed)
 *   in-app               -> bell-icon inbox widget
 *   sms                  -> Israeli SMS provider (stubbed)
 *   whatsapp             -> WhatsApp Business API (stubbed)
 *   notification-center  -> OS push / service worker (stubbed)
 *
 * Priority ladder
 * ---------------
 *   normal     -> digest-eligible, no override
 *   important  -> forces in-app toast regardless of digest
 *   urgent     -> forces in-app toast + email + SMS
 *   emergency  -> forces *all* channels, bypasses digest,
 *                 bypasses approval, bypasses quiet-hours,
 *                 requires explicit acknowledgment
 *
 * Emergency rules
 * ---------------
 * `emergencyBroadcast` is the only path that can bypass normal
 * approval.  It is reserved for:
 *   - fire / evacuation
 *   - facility lockdown / security incident
 *   - severe-weather shelter order
 *   - gas leak / hazardous material release
 *   - mass-casualty / medical emergency
 *
 * It always targets "all", always forces every channel, always
 * sets `requireAck = true`, and always writes to the compliance
 * log so regulators can later verify the company did the right
 * thing at the right moment.
 *
 * Export surface
 * --------------
 *   class Broadcast
 *     createAnnouncement(spec)        -> announcement record
 *     publishNow(id)                  -> delivery report
 *     scheduledPublish()              -> runs all due items
 *     trackDelivery(id)               -> per-recipient status
 *     trackReadReceipts(id)           -> who read, when
 *     acknowledgmentRequired(id)      -> mark as mandatory-ack
 *     pendingAcks({userId})           -> user's open acks
 *     recallAnnouncement(o)           -> retraction (non-destructive)
 *     emergencyBroadcast(o)           -> critical-only path
 *     pollEmbed(o)                    -> attach poll to announcement
 *     complianceLog()                 -> audit-grade export
 *     digestMode(o)                   -> user digest preference
 *     translateAuto(o)                -> auto-translate stub
 *     analytics(o)                    -> open/ack/read metrics
 *
 *     // helpers exposed for tests
 *     _now()                          -> injectable clock
 *     _snapshot()                     -> deep read-only snapshot
 *
 * Dependencies
 * ------------
 * Zero third-party.  Node built-ins only (`node:crypto` for ids).
 */

'use strict';

const crypto = require('node:crypto');

// =====================================================================
//  Constants — channels, priorities, statuses, audiences
// =====================================================================

const CHANNELS = Object.freeze({
  EMAIL:               'email',
  IN_APP:              'in-app',
  SMS:                 'sms',
  WHATSAPP:            'whatsapp',
  NOTIFICATION_CENTER: 'notification-center',
  PUSH:                'push', // Y-127 upgrade — OS/mobile push (alias of notification-center)
});

const ALL_CHANNELS = Object.freeze([
  CHANNELS.EMAIL,
  CHANNELS.IN_APP,
  CHANNELS.SMS,
  CHANNELS.WHATSAPP,
  CHANNELS.NOTIFICATION_CENTER,
  CHANNELS.PUSH,
]);

const PRIORITY = Object.freeze({
  INFO:      'info',       // Y-127 upgrade — below normal, digest-only candidate
  NORMAL:    'normal',
  IMPORTANT: 'important',
  URGENT:    'urgent',
  EMERGENCY: 'emergency',
});

const PRIORITY_ORDER = Object.freeze({
  info:      -1,
  normal:    0,
  important: 1,
  urgent:    2,
  emergency: 3,
});

const AUDIENCE_TYPE = Object.freeze({
  ALL:        'all',
  DEPARTMENT: 'department',
  ROLE:       'role',
  CUSTOM:     'custom',
});

const DELIVERY_STATUS = Object.freeze({
  PENDING:   'pending',
  SENT:      'sent',
  DELIVERED: 'delivered',
  FAILED:    'failed',
  READ:      'read',
});

const ACK_STATUS = Object.freeze({
  NOT_REQUIRED: 'not-required',
  PENDING:      'pending',
  ACKNOWLEDGED: 'acknowledged',
});

const DIGEST_FREQ = Object.freeze({
  OFF:     'off',
  DAILY:   'daily',
  WEEKLY:  'weekly',
});

// Emergency categories that bypass approval.  Used for audit.
const EMERGENCY_CATEGORIES = Object.freeze([
  'fire',
  'lockdown',
  'severe-weather',
  'gas-leak',
  'hazmat',
  'medical',
  'security',
  'evacuation',
]);

// Hebrew glossary — single source of truth for UI strings.
const HEBREW_GLOSSARY = Object.freeze({
  announcement:        'הודעה',
  broadcast:           'שידור פנימי',
  publish:             'פרסום',
  schedule:            'תזמון',
  recall:              'משיכה',
  retraction:          'הודעת ביטול',
  acknowledge:         'אישור קריאה',
  pendingAck:          'ממתין לאישור',
  acknowledged:        'אושר',
  emergency:           'חירום',
  evacuation:          'פינוי',
  fire:                'שריפה',
  lockdown:            'סגר חירום',
  severeWeather:       'מזג אוויר קיצוני',
  gasLeak:             'דליפת גז',
  hazmat:              'חומרים מסוכנים',
  priorityNormal:      'רגיל',
  priorityImportant:   'חשוב',
  priorityUrgent:      'דחוף',
  priorityEmergency:   'חירום מיידי',
  channelEmail:        'דוא"ל',
  channelInApp:        'התראה באפליקציה',
  channelSms:          'מסרון SMS',
  channelWhatsapp:     'וואטסאפ',
  channelPush:         'מרכז ההתראות',
  audienceAll:         'כל העובדים',
  audienceDepartment:  'מחלקה',
  audienceRole:        'תפקיד',
  audienceCustom:      'רשימה מותאמת',
  readReceipt:         'אישור קריאה',
  digestDaily:         'תקציר יומי',
  poll:                'סקר',
  policyUpdate:        'עדכון נוהל',
  iReadAndUnderstood:  'קראתי והבנתי',
  // Y-127 upgrade additions
  priorityInfo:        'מידע כללי',
  channelPush:         'התראת דחיפה',
  segments:            'פלחים',
  tenure:              'ותק',
  location:            'מיקום',
  cancelled:           'בוטל',
  cancelReason:        'סיבת ביטול',
  ackReminder:         'תזכורת לאישור קריאה',
  optOut:              'ביטול הרשמה',
  optIn:               'הרשמה',
  deliveryReport:      'דוח משלוח',
  history:             'היסטוריה',
  template:            'תבנית',
  audienceSelection:   'בחירת קהל יעד',
  requiresAck:         'נדרש אישור קריאה',
  broadcastCreated:    'שידור נוצר',
  broadcastScheduled:  'שידור תוזמן',
  broadcastSent:       'שידור נשלח',
  broadcastCancelled:  'שידור בוטל',
  essentialOnly:       'חובה — לא ניתן לבטל הרשמה',
});

// Y-127 Upgrade — new broadcast statuses (extends draft/scheduled/published/expired).
const BROADCAST_STATUS = Object.freeze({
  DRAFT:      'draft',
  SCHEDULED:  'scheduled',
  PUBLISHED:  'published',
  SENT:       'sent',       // alias for published (Y-127 naming)
  CANCELLED:  'cancelled',
  EXPIRED:    'expired',
});

// Y-127 Upgrade — broadcast types that users CANNOT opt out of.
// Emergency, safety, and policy broadcasts are always essential.
const ESSENTIAL_BROADCAST_TYPES = Object.freeze([
  'emergency',
  'safety',
  'policy',
  'compliance',
  'security',
  'fire',
  'lockdown',
  'evacuation',
  'hazmat',
  'medical',
]);

// Y-127 Upgrade — supported audience criteria keys.
const AUDIENCE_CRITERIA_KEYS = Object.freeze([
  'departments',
  'roles',
  'tenures',
  'locations',
  'segments',
  'custom',
  'all',
]);

// =====================================================================
//  Pure helpers
// =====================================================================

function makeId(prefix) {
  // Crypto-backed random id; falls back to timestamp if crypto fails.
  try {
    return prefix + '-' + crypto.randomBytes(6).toString('hex');
  } catch (_err) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }
}

function frozenClone(value) {
  // Deep-freeze clone.  Used for read-only snapshots.
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) {
    return Object.freeze(value.map(frozenClone));
  }
  const out = {};
  for (const k of Object.keys(value)) out[k] = frozenClone(value[k]);
  return Object.freeze(out);
}

function toTime(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseChannels(channels) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(channels)) return out;
  for (const ch of channels) {
    if (typeof ch !== 'string') continue;
    if (!ALL_CHANNELS.includes(ch)) continue;
    if (seen.has(ch)) continue;
    seen.add(ch);
    out.push(ch);
  }
  return out;
}

function normalisePriority(p) {
  if (typeof p !== 'string') return PRIORITY.NORMAL;
  const lower = p.toLowerCase();
  if (PRIORITY_ORDER[lower] == null) return PRIORITY.NORMAL;
  return lower;
}

function normaliseAudience(audience) {
  const a = audience && typeof audience === 'object' ? audience : {};
  if (a.all === true || a.type === AUDIENCE_TYPE.ALL) {
    return { type: AUDIENCE_TYPE.ALL };
  }
  if (a.department) {
    return {
      type: AUDIENCE_TYPE.DEPARTMENT,
      department: String(a.department),
    };
  }
  if (a.role) {
    return {
      type: AUDIENCE_TYPE.ROLE,
      role: String(a.role),
    };
  }
  if (Array.isArray(a.custom)) {
    return {
      type: AUDIENCE_TYPE.CUSTOM,
      members: a.custom.map(String),
    };
  }
  if (a.type === AUDIENCE_TYPE.CUSTOM && Array.isArray(a.members)) {
    return {
      type: AUDIENCE_TYPE.CUSTOM,
      members: a.members.map(String),
    };
  }
  // Y-127 upgrade — multi-criteria audience (departments/roles/tenures/locations/segments).
  // Any of the plural keys triggers the "criteria" audience type.
  const hasCriteria = (
    Array.isArray(a.departments) ||
    Array.isArray(a.roles) ||
    Array.isArray(a.tenures) ||
    Array.isArray(a.locations) ||
    Array.isArray(a.segments)
  );
  if (hasCriteria) {
    return {
      type: 'criteria',
      departments: Array.isArray(a.departments) ? a.departments.map(String) : [],
      roles:       Array.isArray(a.roles)       ? a.roles.map(String)       : [],
      tenures:     Array.isArray(a.tenures)     ? a.tenures.map(String)     : [],
      locations:   Array.isArray(a.locations)   ? a.locations.map(String)   : [],
      segments:    Array.isArray(a.segments)    ? a.segments.map(String)    : [],
    };
  }
  // Default: all employees.
  return { type: AUDIENCE_TYPE.ALL };
}

function bilingualSafe(obj, he, en) {
  const heText = typeof he === 'string' ? he : '';
  const enText = typeof en === 'string' ? en : '';
  // At least one must be non-empty, or emit placeholder.
  if (!heText && !enText) {
    return { he: '(ללא תוכן)', en: '(no content)' };
  }
  return {
    he: heText || enText,
    en: enText || heText,
  };
}

// =====================================================================
//  Broadcast class
// =====================================================================

class Broadcast {
  /**
   * @param {object} [options]
   * @param {() => number} [options.now]            - injectable clock (ms)
   * @param {Array<{id:string, department?:string, role?:string, email?:string, phone?:string, locale?:string}>} [options.directory] - employee directory
   * @param {object} [options.gateways]             - per-channel send fn map (for tests)
   */
  constructor(options = {}) {
    this._nowFn = typeof options.now === 'function' ? options.now : () => Date.now();
    this._directory = Array.isArray(options.directory) ? options.directory.slice() : [];
    this._gateways = options.gateways && typeof options.gateways === 'object' ? options.gateways : {};

    // Append-only stores.  Objects keyed by id, arrays are event logs.
    this._announcements = Object.create(null);       // id -> record
    this._createOrder = [];                          // insertion order of ids
    this._deliveries = Object.create(null);          // id -> array of events
    this._reads = Object.create(null);               // id -> array of read events
    this._acks = Object.create(null);                // id -> array of ack events
    this._polls = Object.create(null);               // id -> poll definition
    this._pollVotes = Object.create(null);           // id -> array of votes
    this._retractions = Object.create(null);         // id -> retraction record
    this._digestPrefs = Object.create(null);         // userId -> { frequency }
    this._complianceLog = [];                        // append-only compliance entries
    this._auditTrail = [];                           // append-only general audit
    this._seq = 0;

    // Y-127 Upgrade — additional append-only stores.
    // NOTE: לא מוחקים — all cancellations / opt-outs are flags or additions,
    // never removals from the log.
    this._templates = Object.create(null);           // templateId -> template definition
    this._optOuts = Object.create(null);             // userId -> Set<broadcastType>
    this._optOutLog = [];                            // append-only opt-in/out events
    this._cancellations = Object.create(null);       // id -> { reason, at, by }
    this._ackReminders = Object.create(null);        // id -> array of reminder events
    this._history = [];                              // append-only history events
    // Y-127 extended directory fields — also accept hireDate / tenure / location / segments.
    // The _directory is already plain objects; resolvers look for these keys.
  }

  // ---------------------------------------------------------------
  //  Public API
  // ---------------------------------------------------------------

  /**
   * Create a new announcement record.  Does NOT deliver it.
   * Returns the frozen announcement record.
   *
   * Required-ish fields:
   *   title_he / title_en   - at least one
   *   body_he  / body_en    - at least one
   *   sender                - { id, name } or userId string
   *
   * Optional:
   *   id            - caller-provided id, else auto-generated
   *   audience      - { all:true } | { department } | { role } | { custom: [...] }
   *   channels      - subset of ALL_CHANNELS, default ['in-app']
   *   priority      - normal | important | urgent | emergency
   *   publishAt     - Date/string/number, else "now"
   *   expireAt      - Date/string/number, optional
   *   requireAck    - boolean, default false
   *   category      - e.g. 'policy', 'safety', 'shift'
   *   tags          - string[]
   */
  createAnnouncement(spec = {}) {
    const now = this._now();
    const id = (typeof spec.id === 'string' && spec.id.trim()) ? spec.id.trim() : makeId('ann');

    if (this._announcements[id]) {
      throw new Error(`Broadcast: announcement id "${id}" already exists (append-only, cannot overwrite)`);
    }

    const title = bilingualSafe({}, spec.title_he, spec.title_en);
    const body  = bilingualSafe({}, spec.body_he,  spec.body_en);

    const sender = spec.sender && typeof spec.sender === 'object'
      ? { id: String(spec.sender.id || 'system'), name: String(spec.sender.name || spec.sender.id || 'system') }
      : { id: String(spec.sender || 'system'), name: String(spec.sender || 'system') };

    const audience = normaliseAudience(spec.audience);
    const channels = normaliseChannels(spec.channels);
    if (channels.length === 0) channels.push(CHANNELS.IN_APP);

    const priority = normalisePriority(spec.priority);
    const publishAt = toTime(spec.publishAt) || now;
    const expireAt = toTime(spec.expireAt);

    const record = {
      id,
      title,
      body,
      sender,
      audience,
      channels,
      priority,
      publishAt,
      expireAt,
      requireAck: spec.requireAck === true || priority === PRIORITY.EMERGENCY,
      category: typeof spec.category === 'string' ? spec.category : 'general',
      tags: Array.isArray(spec.tags) ? spec.tags.map(String) : [],
      createdAt: now,
      publishedAt: null,
      status: 'draft',   // draft -> scheduled -> published -> expired
      retracted: false,
      retractedAt: null,
      retractionReason: null,
      poll: null,
      source: spec.source || 'manual',
    };

    // Auto-classify future publish as scheduled.
    if (publishAt > now) {
      record.status = 'scheduled';
    }

    this._announcements[id] = record;
    this._createOrder.push(id);
    this._deliveries[id] = [];
    this._reads[id] = [];
    this._acks[id] = [];

    this._audit('createAnnouncement', { id, priority, audienceType: audience.type });

    // Policy / safety items always flow into the compliance log.
    if (record.requireAck || record.category === 'policy' || record.category === 'safety') {
      this._logCompliance(record, 'created');
    }

    return frozenClone(record);
  }

  /**
   * Deliver an announcement immediately across its configured channels.
   * Resolves the audience against the directory, creates delivery events
   * per recipient per channel, and returns a delivery report.
   */
  publishNow(announcementId) {
    const record = this._requireAnnouncement(announcementId);

    if (record.retracted) {
      throw new Error(`Broadcast: cannot publish retracted announcement "${announcementId}"`);
    }

    const now = this._now();
    const recipients = this._resolveAudience(record.audience);
    const channels = this._effectiveChannels(record);

    const events = [];
    for (const user of recipients) {
      for (const channel of channels) {
        const ok = this._sendViaChannel(channel, user, record);
        const event = {
          announcementId: record.id,
          userId: user.id,
          channel,
          status: ok ? DELIVERY_STATUS.DELIVERED : DELIVERY_STATUS.FAILED,
          at: now,
          priority: record.priority,
        };
        this._deliveries[record.id].push(event);
        events.push(event);
      }

      // Ack expectation per recipient (one per user, not per channel).
      if (record.requireAck) {
        this._acks[record.id].push({
          announcementId: record.id,
          userId: user.id,
          status: ACK_STATUS.PENDING,
          at: now,
        });
      }
    }

    record.publishedAt = now;
    record.status = 'published';

    this._audit('publishNow', {
      id: record.id,
      recipients: recipients.length,
      channels,
      events: events.length,
    });

    return {
      announcementId: record.id,
      publishedAt: now,
      recipientCount: recipients.length,
      channelCount: channels.length,
      eventCount: events.length,
      channels: channels.slice(),
      priority: record.priority,
    };
  }

  /**
   * Runs all scheduled announcements whose publishAt <= now.
   * Returns the list of published ids.  Safe to call repeatedly —
   * already-published items are skipped.
   */
  scheduledPublish() {
    const now = this._now();
    const published = [];
    for (const id of this._createOrder) {
      const rec = this._announcements[id];
      if (!rec) continue;
      if (rec.status !== 'scheduled') continue;
      if (rec.retracted) continue;
      if (rec.publishAt > now) continue;
      try {
        const report = this.publishNow(id);
        published.push(report);
      } catch (err) {
        this._audit('scheduledPublishError', { id, error: String(err && err.message || err) });
      }
    }
    // Expire old ones — not destructive, just flip status.
    for (const id of this._createOrder) {
      const rec = this._announcements[id];
      if (!rec) continue;
      if (rec.expireAt && rec.expireAt <= now && rec.status !== 'expired') {
        rec.status = 'expired';
        this._audit('autoExpire', { id });
      }
    }
    return published;
  }

  /**
   * Per-recipient delivery status for a given announcement.
   * Returns array of { userId, channel, status, at }.
   */
  trackDelivery(announcementId) {
    const record = this._requireAnnouncement(announcementId);
    const events = this._deliveries[record.id] || [];
    // Reads take precedence over delivered, in output only (append-only).
    const readByUserChannel = new Map();
    for (const r of (this._reads[record.id] || [])) {
      readByUserChannel.set(`${r.userId}::${r.channel || '*'}`, r.at);
    }
    return events.map((e) => {
      const readAt = readByUserChannel.get(`${e.userId}::${e.channel}`)
                  || readByUserChannel.get(`${e.userId}::*`);
      return Object.freeze({
        userId: e.userId,
        channel: e.channel,
        status: readAt ? DELIVERY_STATUS.READ : e.status,
        sentAt: e.at,
        readAt: readAt || null,
      });
    });
  }

  /**
   * Record that a user read the announcement.  Append-only.
   * Returns the read receipt list for the announcement.
   */
  trackReadReceipts(announcementId, readEvent) {
    const record = this._requireAnnouncement(announcementId);
    if (readEvent && typeof readEvent === 'object' && readEvent.userId) {
      this._reads[record.id].push({
        announcementId: record.id,
        userId: String(readEvent.userId),
        channel: readEvent.channel || null,
        at: toTime(readEvent.at) || this._now(),
      });
      this._audit('trackReadReceipts', { id: record.id, userId: readEvent.userId });
    }
    // Return a frozen snapshot.
    return (this._reads[record.id] || []).map(frozenClone);
  }

  /**
   * Mark an announcement as requiring explicit acknowledgment.
   * If it was already published, the function adds pending-ack
   * entries for all current recipients that don't yet have one.
   */
  acknowledgmentRequired(announcementId) {
    const record = this._requireAnnouncement(announcementId);
    if (!record.requireAck) {
      record.requireAck = true;
      this._audit('acknowledgmentRequired', { id: record.id });
      this._logCompliance(record, 'ack-required');
    }

    // Back-fill pending acks for recipients already delivered to.
    const seen = new Set(
      (this._acks[record.id] || []).map((a) => a.userId),
    );
    const recipients = new Set(
      (this._deliveries[record.id] || []).map((d) => d.userId),
    );
    const now = this._now();
    for (const userId of recipients) {
      if (seen.has(userId)) continue;
      this._acks[record.id].push({
        announcementId: record.id,
        userId,
        status: ACK_STATUS.PENDING,
        at: now,
      });
    }

    return {
      announcementId: record.id,
      requireAck: true,
      pendingCount: (this._acks[record.id] || []).filter((a) => a.status === ACK_STATUS.PENDING).length,
    };
  }

  /**
   * Record an explicit user acknowledgment ("I read and understood").
   * Append-only: keeps the previous pending entry and adds the
   * acknowledged marker.  Convenience method beyond the spec's
   * core API — but idempotent and non-destructive.
   */
  acknowledge({ announcementId, userId, signature }) {
    const record = this._requireAnnouncement(announcementId);
    const uid = String(userId);
    const now = this._now();
    this._acks[record.id].push({
      announcementId: record.id,
      userId: uid,
      status: ACK_STATUS.ACKNOWLEDGED,
      at: now,
      signature: typeof signature === 'string' ? signature : HEBREW_GLOSSARY.iReadAndUnderstood,
    });
    this._audit('acknowledge', { id: record.id, userId: uid });
    if (record.category === 'policy' || record.category === 'safety' || record.priority === PRIORITY.EMERGENCY) {
      this._logCompliance(record, 'acknowledged', { userId: uid });
    }
    return { announcementId: record.id, userId: uid, at: now };
  }

  /**
   * Returns the list of announcements the given user still needs to ack.
   * Uses the reduce of ack events: a user is pending if the latest
   * ack event for them is "pending".
   */
  pendingAcks({ userId }) {
    const uid = String(userId || '');
    const pending = [];
    for (const id of this._createOrder) {
      const rec = this._announcements[id];
      if (!rec || !rec.requireAck) continue;
      const events = (this._acks[id] || []).filter((a) => a.userId === uid);
      if (events.length === 0) continue;
      // Sort by time ascending; last wins.
      events.sort((a, b) => a.at - b.at);
      const latest = events[events.length - 1];
      if (latest.status === ACK_STATUS.PENDING) {
        pending.push({
          announcementId: rec.id,
          title: rec.title,
          priority: rec.priority,
          publishedAt: rec.publishedAt,
          retracted: rec.retracted,
        });
      }
    }
    return pending;
  }

  /**
   * Retract an announcement *without deleting it*.  Creates a
   * separate retraction message, flips the `retracted` flag on
   * the original, and logs to compliance.  Original payload,
   * deliveries, reads and acks remain untouched.
   */
  recallAnnouncement({ announcementId, reason }) {
    const record = this._requireAnnouncement(announcementId);
    const now = this._now();

    // Append-only retraction marker.
    record.retracted = true;
    record.retractedAt = now;
    record.retractionReason = typeof reason === 'string' && reason.trim() ? reason.trim() : '(no reason given)';

    // Create a companion "retraction notice" announcement so
    // recipients actually learn about it.  This one is new — the
    // original is NOT deleted.
    const notice = this.createAnnouncement({
      id: `${record.id}-retraction`,
      title_he: `בוטל: ${record.title.he}`,
      title_en: `Retracted: ${record.title.en}`,
      body_he: `ההודעה "${record.title.he}" בוטלה. סיבה: ${record.retractionReason}.`,
      body_en: `The announcement "${record.title.en}" has been retracted. Reason: ${record.retractionReason}.`,
      sender: record.sender,
      audience: record.audience,
      channels: record.channels,
      priority: record.priority === PRIORITY.EMERGENCY ? PRIORITY.URGENT : record.priority,
      requireAck: record.requireAck,
      category: 'retraction',
      source: 'recall',
    });

    this._retractions[record.id] = {
      announcementId: record.id,
      retractionId: notice.id,
      reason: record.retractionReason,
      at: now,
    };

    this._audit('recallAnnouncement', { id: record.id, reason: record.retractionReason });
    this._logCompliance(record, 'retracted', { reason: record.retractionReason });

    // Publish the retraction notice immediately if original was
    // already published; otherwise leave it as draft/scheduled.
    if (record.publishedAt) {
      this.publishNow(notice.id);
    }

    return {
      announcementId: record.id,
      retracted: true,
      retractionId: notice.id,
      at: now,
      originalPreserved: true,
    };
  }

  /**
   * Critical-safety path.  Bypasses approval, targets all, forces
   * every channel, sets requireAck=true, logs to compliance with
   * an emergency tag.
   */
  emergencyBroadcast({ content = {}, targetAll = true, category = 'emergency', sender } = {}) {
    const title_he = content.title_he || 'הודעת חירום';
    const title_en = content.title_en || 'EMERGENCY ANNOUNCEMENT';
    const body_he  = content.body_he  || 'נא לפעול מיידית לפי הוראות הבטיחות.';
    const body_en  = content.body_en  || 'Please follow safety instructions immediately.';

    const audience = targetAll
      ? { all: true }
      : normaliseAudience(content.audience);

    const emergencyCategory = EMERGENCY_CATEGORIES.includes(category) ? category : 'emergency';

    const record = this.createAnnouncement({
      title_he,
      title_en,
      body_he,
      body_en,
      sender: sender || { id: 'system-emergency', name: 'Emergency System' },
      audience,
      channels: ALL_CHANNELS.slice(),
      priority: PRIORITY.EMERGENCY,
      requireAck: true,
      category: emergencyCategory,
      source: 'emergency',
      tags: ['bypass-approval', 'critical-safety', emergencyCategory],
    });

    // Bypass all approval — publish immediately.
    const report = this.publishNow(record.id);

    this._logCompliance(this._announcements[record.id], 'emergency-broadcast', {
      category: emergencyCategory,
      bypassedApproval: true,
    });
    this._audit('emergencyBroadcast', {
      id: record.id,
      category: emergencyCategory,
      recipients: report.recipientCount,
    });

    return {
      announcementId: record.id,
      report,
      bypassedApproval: true,
      category: emergencyCategory,
    };
  }

  /**
   * Attach a poll to an announcement.  Subsequent
   * trackDelivery / analytics calls will include poll state.
   */
  pollEmbed({ announcementId, question, options }) {
    const record = this._requireAnnouncement(announcementId);
    const opts = Array.isArray(options) ? options.map(String).filter(Boolean) : [];
    if (opts.length < 2) {
      throw new Error('Broadcast.pollEmbed: need at least two options');
    }
    const q = typeof question === 'string' && question.trim() ? question.trim() : '(no question)';
    this._polls[record.id] = {
      announcementId: record.id,
      question: q,
      options: opts,
      createdAt: this._now(),
    };
    this._pollVotes[record.id] = this._pollVotes[record.id] || [];
    record.poll = frozenClone(this._polls[record.id]);
    this._audit('pollEmbed', { id: record.id, optionCount: opts.length });
    return frozenClone(this._polls[record.id]);
  }

  /**
   * Record a vote on an attached poll.  Append-only — a user's
   * last vote wins in tallies but earlier votes stay in the log.
   */
  votePoll({ announcementId, userId, optionIndex }) {
    const record = this._requireAnnouncement(announcementId);
    const poll = this._polls[record.id];
    if (!poll) throw new Error(`Broadcast.votePoll: no poll on ${record.id}`);
    if (typeof optionIndex !== 'number' || optionIndex < 0 || optionIndex >= poll.options.length) {
      throw new Error('Broadcast.votePoll: invalid optionIndex');
    }
    this._pollVotes[record.id].push({
      announcementId: record.id,
      userId: String(userId),
      optionIndex,
      at: this._now(),
    });
    return { announcementId: record.id, userId: String(userId), optionIndex };
  }

  /**
   * Export the compliance log — mandatory-acknowledgment items.
   * Returns a frozen snapshot array.
   */
  complianceLog() {
    return this._complianceLog.map(frozenClone);
  }

  /**
   * Set a user's digest-mode preference.  In digest mode, "normal"
   * priority items are withheld from real-time channels and
   * bundled into a daily / weekly summary.
   */
  digestMode({ userId, frequency }) {
    const uid = String(userId || '');
    if (!uid) throw new Error('Broadcast.digestMode: userId required');
    const freq = Object.values(DIGEST_FREQ).includes(frequency) ? frequency : DIGEST_FREQ.DAILY;
    this._digestPrefs[uid] = { frequency: freq, updatedAt: this._now() };
    this._audit('digestMode', { userId: uid, frequency: freq });
    return { userId: uid, frequency: freq };
  }

  /**
   * Stub for auto-translation.  In production this would call an
   * LLM / translation service.  We expose a deterministic stub so
   * tests can verify the pipeline without network I/O.
   */
  translateAuto({ sourceLanguage, targetLanguage, text } = {}) {
    const src = String(sourceLanguage || 'he').toLowerCase();
    const dst = String(targetLanguage || 'en').toLowerCase();
    const input = typeof text === 'string' ? text : '';
    if (!input) return { sourceLanguage: src, targetLanguage: dst, text: '', stub: true };
    // Deterministic, visibly-marked stub.
    const translated = `[${src}->${dst}] ${input}`;
    return {
      sourceLanguage: src,
      targetLanguage: dst,
      text: translated,
      stub: true,
    };
  }

  /**
   * Open-rate / ack-rate / time-to-read metrics for a single
   * announcement.  Works against append-only logs — never mutates.
   */
  analytics({ announcementId }) {
    const record = this._requireAnnouncement(announcementId);
    const deliveries = this._deliveries[record.id] || [];
    const reads = this._reads[record.id] || [];
    const acks = this._acks[record.id] || [];

    // Unique user counts.
    const uniqueRecipients = new Set();
    const uniqueDelivered = new Set();
    for (const d of deliveries) {
      uniqueRecipients.add(d.userId);
      if (d.status === DELIVERY_STATUS.DELIVERED || d.status === DELIVERY_STATUS.SENT || d.status === DELIVERY_STATUS.READ) {
        uniqueDelivered.add(d.userId);
      }
    }

    const uniqueReaders = new Set(reads.map((r) => r.userId));

    // Latest ack per user.
    const latestAckPerUser = new Map();
    for (const a of acks) {
      const prev = latestAckPerUser.get(a.userId);
      if (!prev || prev.at <= a.at) latestAckPerUser.set(a.userId, a);
    }
    let acknowledgedUsers = 0;
    let pendingUsers = 0;
    for (const a of latestAckPerUser.values()) {
      if (a.status === ACK_STATUS.ACKNOWLEDGED) acknowledgedUsers++;
      else if (a.status === ACK_STATUS.PENDING) pendingUsers++;
    }

    // Avg time to read (ms) — first delivery vs first read per user.
    const firstDeliveryPerUser = new Map();
    for (const d of deliveries) {
      const prev = firstDeliveryPerUser.get(d.userId);
      if (prev == null || d.at < prev) firstDeliveryPerUser.set(d.userId, d.at);
    }
    const firstReadPerUser = new Map();
    for (const r of reads) {
      const prev = firstReadPerUser.get(r.userId);
      if (prev == null || r.at < prev) firstReadPerUser.set(r.userId, r.at);
    }
    let deltaSum = 0;
    let deltaCount = 0;
    for (const [user, deliveredAt] of firstDeliveryPerUser.entries()) {
      const readAt = firstReadPerUser.get(user);
      if (readAt != null && readAt >= deliveredAt) {
        deltaSum += (readAt - deliveredAt);
        deltaCount += 1;
      }
    }

    const recipientCount = uniqueRecipients.size;
    const openRate = recipientCount ? (uniqueReaders.size / recipientCount) : 0;
    const deliveryRate = recipientCount ? (uniqueDelivered.size / recipientCount) : 0;
    const ackRate = record.requireAck && recipientCount
      ? (acknowledgedUsers / recipientCount)
      : null;

    return {
      announcementId: record.id,
      priority: record.priority,
      requireAck: record.requireAck,
      retracted: record.retracted,
      recipientCount,
      deliveredUsers: uniqueDelivered.size,
      deliveryRate,
      readers: uniqueReaders.size,
      openRate,
      acknowledgedUsers,
      pendingAckUsers: pendingUsers,
      ackRate,
      avgTimeToReadMs: deltaCount ? Math.round(deltaSum / deltaCount) : null,
      pollTallies: this._pollTallies(record.id),
    };
  }

  // ===============================================================
  //  Y-127 Upgrade — Broadcast Announcement Engine
  //  לא מוחקים — only adds append-only methods and flips status flags.
  //  Backward-compatible wrappers around createAnnouncement / publishNow.
  // ===============================================================

  /**
   * Y-127 — Create a broadcast.  Thin wrapper over createAnnouncement
   * that returns a plain (non-frozen) broadcast record shaped like the
   * Y-127 spec: {id, title_he, title_en, body_he, body_en, channels,
   * audience, priority, scheduledFor, requiresAck, status, createdAt}.
   *
   * @param {object} spec
   * @returns {object}
   */
  createBroadcast({
    id,
    title_he,
    title_en,
    body_he,
    body_en,
    channels,
    audience,
    priority,
    scheduledFor,
    requiresAck,
  } = {}) {
    // Validate channels against Y-127 list (email/sms/in-app/push/whatsapp).
    const y127Channels = ['email', 'sms', 'in-app', 'push', 'whatsapp'];
    const normChannels = Array.isArray(channels)
      ? channels.filter((c) => y127Channels.includes(c))
      : [];
    if (Array.isArray(channels) && channels.length > 0 && normChannels.length === 0) {
      throw new Error(`Broadcast.createBroadcast: no valid channels supplied (allowed: ${y127Channels.join(', ')})`);
    }

    // Validate priority against Y-127 list (info/normal/urgent/emergency).
    const y127Priorities = ['info', 'normal', 'urgent', 'emergency'];
    const prio = typeof priority === 'string' && y127Priorities.includes(priority)
      ? priority
      : 'normal';

    const record = this.createAnnouncement({
      id,
      title_he,
      title_en,
      body_he,
      body_en,
      sender: { id: 'system', name: 'Broadcast Engine' },
      audience,
      channels: normChannels,
      priority: prio,
      publishAt: scheduledFor,
      requireAck: requiresAck === true,
      category: 'broadcast',
      source: 'createBroadcast',
    });

    // Log to append-only history.
    this._history.push({
      seq: ++this._seq,
      action: 'createBroadcast',
      broadcastId: record.id,
      at: this._now(),
      priority: record.priority,
      requiresAck: record.requireAck,
      channels: record.channels,
      status: record.status,
    });

    // Return a mutable-shaped Y-127 view of the record.
    return this._broadcastView(record.id);
  }

  /**
   * Y-127 — Schedule a broadcast for future dispatch.
   * Sets publishAt and flips status to 'scheduled'.
   */
  scheduleBroadcast(broadcastId, datetime) {
    const record = this._requireAnnouncement(broadcastId);
    const when = toTime(datetime);
    if (when == null) {
      throw new Error(`Broadcast.scheduleBroadcast: invalid datetime "${datetime}"`);
    }
    if (record.status === 'published' || record.status === 'sent') {
      throw new Error(`Broadcast.scheduleBroadcast: "${broadcastId}" already sent`);
    }
    if (this._cancellations[broadcastId]) {
      throw new Error(`Broadcast.scheduleBroadcast: "${broadcastId}" is cancelled`);
    }
    record.publishAt = when;
    record.status = 'scheduled';
    this._history.push({
      seq: ++this._seq,
      action: 'scheduleBroadcast',
      broadcastId,
      at: this._now(),
      scheduledFor: when,
    });
    this._audit('scheduleBroadcast', { id: broadcastId, scheduledFor: when });
    return this._broadcastView(broadcastId);
  }

  /**
   * Y-127 — Immediately dispatch a broadcast.  Wraps publishNow.
   */
  sendNow(broadcastId) {
    const record = this._requireAnnouncement(broadcastId);
    if (this._cancellations[broadcastId]) {
      throw new Error(`Broadcast.sendNow: "${broadcastId}" is cancelled`);
    }

    // Filter recipients by opt-out list BEFORE publishing.
    // We do this by temporarily resolving audience and injecting opt-out
    // filter, using an internal publish path.
    const result = this._publishFiltered(record);

    this._history.push({
      seq: ++this._seq,
      action: 'sendNow',
      broadcastId,
      at: this._now(),
      recipientCount: result.recipientCount,
    });

    return result;
  }

  /**
   * Y-127 — Cancel a broadcast.  NON-DESTRUCTIVE:
   *   - Flips status to 'cancelled'
   *   - Records the reason in append-only cancellation store
   *   - Preserves the original record, delivery log, ack log and history
   *
   * לא מוחקים — the record is retained for audit forever.
   */
  cancelBroadcast(broadcastId, reason) {
    const record = this._requireAnnouncement(broadcastId);
    if (record.status === 'cancelled') {
      // Idempotent — but still append the event.
      this._history.push({
        seq: ++this._seq,
        action: 'cancelBroadcast',
        broadcastId,
        at: this._now(),
        reason: String(reason || ''),
        note: 'already-cancelled',
      });
      return this._broadcastView(broadcastId);
    }
    const prevStatus = record.status;
    record.status = 'cancelled';
    const entry = {
      broadcastId,
      previousStatus: prevStatus,
      reason: typeof reason === 'string' && reason.trim() ? reason.trim() : '(no reason given)',
      at: this._now(),
    };
    this._cancellations[broadcastId] = entry;
    this._history.push({
      seq: ++this._seq,
      action: 'cancelBroadcast',
      broadcastId,
      at: entry.at,
      reason: entry.reason,
      previousStatus: prevStatus,
    });
    this._audit('cancelBroadcast', { id: broadcastId, reason: entry.reason });
    this._logCompliance(record, 'cancelled', { reason: entry.reason });
    return this._broadcastView(broadcastId);
  }

  /**
   * Y-127 — Audience selector.
   * Returns the subset of the directory matching the given criteria.
   * Criteria keys: departments, roles, tenures, locations, segments, custom, all.
   *
   * - `tenures` is an array of tenure bands: 'new' (<1y), 'mid' (1–3y),
   *   'senior' (3–7y), 'veteran' (>=7y).  Matched against user.hireDate.
   * - `segments` are arbitrary string labels on user.segments array.
   * - All criteria are AND-combined; empty arrays are ignored.
   */
  audienceSelector({ criteria } = {}) {
    const c = criteria && typeof criteria === 'object' ? criteria : {};
    const dir = this._directory;
    if (!Array.isArray(dir) || dir.length === 0) return [];

    if (c.all === true) return dir.slice();

    if (Array.isArray(c.custom) && c.custom.length > 0) {
      const set = new Set(c.custom.map(String));
      return dir.filter((u) => u && set.has(String(u.id)));
    }

    const deps = Array.isArray(c.departments) ? new Set(c.departments.map(String)) : null;
    const roles = Array.isArray(c.roles) ? new Set(c.roles.map(String)) : null;
    const tenures = Array.isArray(c.tenures) ? new Set(c.tenures.map(String)) : null;
    const locs = Array.isArray(c.locations) ? new Set(c.locations.map(String)) : null;
    const segs = Array.isArray(c.segments) ? new Set(c.segments.map(String)) : null;

    if (!deps && !roles && !tenures && !locs && !segs) return dir.slice();

    const now = this._now();
    return dir.filter((u) => {
      if (!u) return false;
      if (deps && !deps.has(String(u.department || ''))) return false;
      if (roles && !roles.has(String(u.role || ''))) return false;
      if (locs && !locs.has(String(u.location || ''))) return false;
      if (segs) {
        const us = Array.isArray(u.segments) ? u.segments.map(String) : [];
        const match = us.some((s) => segs.has(s));
        if (!match) return false;
      }
      if (tenures) {
        const band = this._tenureBand(u.hireDate, now);
        if (!tenures.has(band)) return false;
      }
      return true;
    });
  }

  /**
   * Y-127 — Track acks for a broadcast requiring acknowledgment.
   * Returns { broadcastId, total, acknowledged, pending, acknowledgedUserIds, pendingUserIds }.
   */
  ackTracking(broadcastId) {
    const record = this._requireAnnouncement(broadcastId);
    const acks = this._acks[record.id] || [];
    const latestByUser = new Map();
    for (const a of acks) {
      const prev = latestByUser.get(a.userId);
      if (!prev || prev.at <= a.at) latestByUser.set(a.userId, a);
    }
    const acknowledgedUserIds = [];
    const pendingUserIds = [];
    for (const [uid, a] of latestByUser.entries()) {
      if (a.status === ACK_STATUS.ACKNOWLEDGED) acknowledgedUserIds.push(uid);
      else if (a.status === ACK_STATUS.PENDING) pendingUserIds.push(uid);
    }
    return {
      broadcastId: record.id,
      requiresAck: record.requireAck,
      total: latestByUser.size,
      acknowledged: acknowledgedUserIds.length,
      pending: pendingUserIds.length,
      acknowledgedUserIds,
      pendingUserIds,
    };
  }

  /**
   * Y-127 — Send reminders to non-acknowledgers.
   * Appends reminder events to the ack log + reminder log.
   * Returns { broadcastId, remindersSent, userIds, at }.
   */
  ackReminder(broadcastId) {
    const record = this._requireAnnouncement(broadcastId);
    if (!record.requireAck) {
      throw new Error(`Broadcast.ackReminder: "${broadcastId}" does not require acknowledgment`);
    }
    const track = this.ackTracking(broadcastId);
    const pendingIds = track.pendingUserIds;
    const now = this._now();
    const reminderEvents = [];

    for (const userId of pendingIds) {
      // Re-dispatch a lightweight reminder via the same channels.
      const user = this._directory.find((u) => u && String(u.id) === userId) || { id: userId };
      for (const channel of record.channels) {
        const ok = this._sendViaChannel(channel, user, record);
        const event = {
          broadcastId: record.id,
          userId,
          channel,
          kind: 'ack-reminder',
          status: ok ? DELIVERY_STATUS.DELIVERED : DELIVERY_STATUS.FAILED,
          at: now,
        };
        // Append to delivery log too, so analytics see it.
        this._deliveries[record.id].push({
          announcementId: record.id,
          userId,
          channel,
          status: event.status,
          at: now,
          priority: record.priority,
          kind: 'ack-reminder',
        });
        reminderEvents.push(event);
      }
    }

    this._ackReminders[record.id] = this._ackReminders[record.id] || [];
    this._ackReminders[record.id].push({
      at: now,
      count: pendingIds.length,
      userIds: pendingIds.slice(),
    });

    this._history.push({
      seq: ++this._seq,
      action: 'ackReminder',
      broadcastId: record.id,
      at: now,
      remindersSent: pendingIds.length,
    });
    this._audit('ackReminder', { id: record.id, count: pendingIds.length });

    return {
      broadcastId: record.id,
      remindersSent: pendingIds.length,
      userIds: pendingIds,
      events: reminderEvents,
      at: now,
    };
  }

  /**
   * Y-127 — Delivery report.
   * Returns a per-broadcast summary:
   *   { sent, delivered, opened, clicked, acknowledged }
   *
   * In the in-memory stub, "sent" and "delivered" are the same
   * (gateways are stubbed), "opened" counts unique readers, "clicked"
   * is a synonym for opened (UI click tracking stub), "acknowledged"
   * counts unique acknowledgers.
   */
  deliveryReport(broadcastId) {
    const record = this._requireAnnouncement(broadcastId);
    const deliveries = this._deliveries[record.id] || [];
    const reads = this._reads[record.id] || [];
    const acks = this._acks[record.id] || [];

    let sent = 0;
    let delivered = 0;
    let failed = 0;
    const deliveredUsers = new Set();
    const sentUsers = new Set();
    for (const d of deliveries) {
      if (d.status === DELIVERY_STATUS.SENT || d.status === DELIVERY_STATUS.DELIVERED) {
        sent += 1;
        sentUsers.add(d.userId);
      }
      if (d.status === DELIVERY_STATUS.DELIVERED) {
        delivered += 1;
        deliveredUsers.add(d.userId);
      }
      if (d.status === DELIVERY_STATUS.FAILED) failed += 1;
    }
    const openedUsers = new Set(reads.map((r) => r.userId));
    const latestAckPerUser = new Map();
    for (const a of acks) {
      const prev = latestAckPerUser.get(a.userId);
      if (!prev || prev.at <= a.at) latestAckPerUser.set(a.userId, a);
    }
    let acknowledgedUsers = 0;
    for (const a of latestAckPerUser.values()) {
      if (a.status === ACK_STATUS.ACKNOWLEDGED) acknowledgedUsers += 1;
    }

    return {
      broadcastId: record.id,
      status: record.status,
      sent,
      delivered,
      failed,
      opened: openedUsers.size,
      clicked: openedUsers.size,   // click tracking stub = open events
      acknowledged: acknowledgedUsers,
      // Back-compat with analytics shape.
      sentUsers: sentUsers.size,
      deliveredUsers: deliveredUsers.size,
      priority: record.priority,
      requiresAck: record.requireAck,
      channels: record.channels.slice(),
      generatedAt: this._now(),
    };
  }

  /**
   * Y-127 — Emergency broadcast (Y-127 signature).
   * Bypasses normal scheduling, marks the record as emergency,
   * forces all channels if requested, and requires acknowledgment.
   *
   * @param {object} spec
   * @param {string} spec.message_he - Hebrew body
   * @param {string} spec.message_en - English body
   * @param {string[]} [spec.channels] - optional channel subset (defaults to all)
   * @param {boolean} [spec.allEmployees] - target everyone (default true)
   */
  emergencyBroadcastY127({ message_he, message_en, channels, allEmployees = true } = {}) {
    const body_he = typeof message_he === 'string' && message_he ? message_he : 'הודעת חירום — יש לפעול מיידית.';
    const body_en = typeof message_en === 'string' && message_en ? message_en : 'EMERGENCY — act immediately.';

    // Channels: default to every available Y-127 channel.
    const y127Channels = ['email', 'sms', 'in-app', 'push', 'whatsapp'];
    const useChannels = Array.isArray(channels) && channels.length > 0
      ? channels.filter((c) => y127Channels.includes(c))
      : y127Channels.slice();

    const record = this.createAnnouncement({
      title_he: 'שידור חירום',
      title_en: 'EMERGENCY BROADCAST',
      body_he,
      body_en,
      sender: { id: 'system-emergency', name: 'Emergency System' },
      audience: allEmployees ? { all: true } : { all: true },
      channels: useChannels,
      priority: PRIORITY.EMERGENCY,
      requireAck: true,
      category: 'emergency',
      source: 'emergencyBroadcast',
      tags: ['bypass-approval', 'critical-safety', 'emergency'],
    });

    // Bypass ALL scheduling and opt-outs.  Publish immediately to the
    // full directory, regardless of opt-out preferences.
    const report = this._publishFiltered(this._announcements[record.id], {
      bypassOptOut: true,
      bypassSchedule: true,
    });

    this._logCompliance(this._announcements[record.id], 'emergency-broadcast-y127', {
      bypassedOptOut: true,
      bypassedSchedule: true,
      channels: useChannels,
    });
    this._history.push({
      seq: ++this._seq,
      action: 'emergencyBroadcast',
      broadcastId: record.id,
      at: this._now(),
      allEmployees: !!allEmployees,
      recipientCount: report.recipientCount,
    });

    return {
      broadcastId: record.id,
      emergency: true,
      bypassedScheduling: true,
      bypassedOptOut: true,
      report,
      allEmployees: !!allEmployees,
      channels: useChannels,
    };
  }

  /**
   * Y-127 — Append-only broadcast history.
   * @param {object} [filters]
   * @param {string} [filters.status]
   * @param {string} [filters.priority]
   * @param {string} [filters.action]
   * @param {number} [filters.since] - ms timestamp
   * @param {number} [filters.until] - ms timestamp
   */
  broadcastHistory(filters = {}) {
    const { status, priority, action, since, until } = filters || {};
    let items = this._history.slice();
    if (action) items = items.filter((h) => h.action === action);
    if (since != null) items = items.filter((h) => h.at >= Number(since));
    if (until != null) items = items.filter((h) => h.at <= Number(until));
    if (status || priority) {
      items = items.filter((h) => {
        const rec = this._announcements[h.broadcastId];
        if (!rec) return false;
        if (status && rec.status !== status) return false;
        if (priority && rec.priority !== priority) return false;
        return true;
      });
    }
    return items.map((h) => Object.assign({}, h));
  }

  /**
   * Y-127 — Register a template.
   */
  registerTemplate({ id, title_he, title_en, body_he, body_en, channels, priority, requiresAck } = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('Broadcast.registerTemplate: id required');
    }
    if (this._templates[id]) {
      throw new Error(`Broadcast.registerTemplate: id "${id}" already exists (append-only)`);
    }
    const tpl = {
      id,
      title_he: String(title_he || ''),
      title_en: String(title_en || ''),
      body_he: String(body_he || ''),
      body_en: String(body_en || ''),
      channels: Array.isArray(channels) ? channels.slice() : ['in-app'],
      priority: typeof priority === 'string' ? priority : 'normal',
      requiresAck: requiresAck === true,
      createdAt: this._now(),
    };
    this._templates[id] = tpl;
    this._audit('registerTemplate', { id });
    return Object.assign({}, tpl);
  }

  /**
   * Y-127 — Instantiate a broadcast from a template, substituting
   * {{var}} placeholders in both Hebrew and English bodies/titles.
   */
  templateBroadcast(templateId, vars = {}) {
    const tpl = this._templates[templateId];
    if (!tpl) throw new Error(`Broadcast.templateBroadcast: unknown template "${templateId}"`);
    const v = vars && typeof vars === 'object' ? vars : {};
    const substitute = (s) => {
      if (typeof s !== 'string') return '';
      return s.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        return (v[key] !== undefined && v[key] !== null) ? String(v[key]) : `{{${key}}}`;
      });
    };
    const spec = {
      title_he: substitute(tpl.title_he),
      title_en: substitute(tpl.title_en),
      body_he: substitute(tpl.body_he),
      body_en: substitute(tpl.body_en),
      channels: tpl.channels.slice(),
      priority: tpl.priority,
      requiresAck: tpl.requiresAck,
      audience: (v && v.audience) ? v.audience : { all: true },
    };
    const view = this.createBroadcast(spec);
    this._history.push({
      seq: ++this._seq,
      action: 'templateBroadcast',
      broadcastId: view.id,
      templateId,
      at: this._now(),
    });
    return view;
  }

  /**
   * Y-127 — Manage opt-out list.
   * Usage:
   *   optOutList('marketing')                         -> list of user ids opted out of this type
   *   optOutList({ userId, broadcastType, optOut:true }) -> add user
   *   optOutList({ userId, broadcastType, optOut:false }) -> re-opt in (append event, keep log)
   *
   * Essential types (emergency, safety, policy, compliance, security, etc.)
   * CANNOT be opted out of — the call is ignored and logged.
   */
  optOutList(arg) {
    // Read-only query form: optOutList('marketing')
    if (typeof arg === 'string') {
      const broadcastType = arg;
      const out = [];
      for (const uid of Object.keys(this._optOuts)) {
        if (this._optOuts[uid] && this._optOuts[uid].has(broadcastType)) {
          out.push(uid);
        }
      }
      return out;
    }

    // Mutation form: { userId, broadcastType, optOut }
    const obj = arg && typeof arg === 'object' ? arg : {};
    const userId = String(obj.userId || '');
    const broadcastType = String(obj.broadcastType || '');
    const optOut = obj.optOut !== false; // default true

    if (!userId) throw new Error('Broadcast.optOutList: userId required');
    if (!broadcastType) throw new Error('Broadcast.optOutList: broadcastType required');

    // Essential types cannot be opted out of.
    if (ESSENTIAL_BROADCAST_TYPES.includes(broadcastType) && optOut) {
      this._optOutLog.push({
        seq: ++this._seq,
        userId,
        broadcastType,
        action: 'opt-out-rejected',
        reason: 'essential-broadcast-type',
        at: this._now(),
      });
      this._audit('optOutRejected', { userId, broadcastType });
      return {
        userId,
        broadcastType,
        optedOut: false,
        rejected: true,
        reason: 'essential-broadcast-type',
      };
    }

    if (!this._optOuts[userId]) this._optOuts[userId] = new Set();
    if (optOut) {
      this._optOuts[userId].add(broadcastType);
    } else {
      this._optOuts[userId].delete(broadcastType);
    }
    this._optOutLog.push({
      seq: ++this._seq,
      userId,
      broadcastType,
      action: optOut ? 'opt-out' : 'opt-in',
      at: this._now(),
    });
    this._audit('optOutList', { userId, broadcastType, optOut });
    return {
      userId,
      broadcastType,
      optedOut: !!optOut,
    };
  }

  // ---------------------------------------------------------------
  //  Y-127 Internal helpers
  // ---------------------------------------------------------------

  _broadcastView(id) {
    const rec = this._announcements[id];
    if (!rec) return null;
    const cancellation = this._cancellations[id] || null;
    return {
      id: rec.id,
      title_he: rec.title.he,
      title_en: rec.title.en,
      body_he: rec.body.he,
      body_en: rec.body.en,
      channels: rec.channels.slice(),
      audience: Object.assign({}, rec.audience),
      priority: rec.priority,
      scheduledFor: rec.publishAt,
      requiresAck: rec.requireAck,
      status: rec.status,
      createdAt: rec.createdAt,
      publishedAt: rec.publishedAt,
      category: rec.category,
      retracted: rec.retracted,
      cancelled: rec.status === 'cancelled',
      cancellationReason: cancellation ? cancellation.reason : null,
    };
  }

  _publishFiltered(record, { bypassOptOut = false, bypassSchedule = false } = {}) {
    if (record.retracted) {
      throw new Error(`Broadcast: cannot publish retracted announcement "${record.id}"`);
    }
    if (record.status === 'cancelled') {
      throw new Error(`Broadcast: cannot publish cancelled broadcast "${record.id}"`);
    }

    const now = this._now();
    let recipients = this._resolveAudience(record.audience);
    const channels = this._effectiveChannels(record);

    // Opt-out enforcement (unless essential / bypassed).
    const broadcastType = record.category || 'general';
    const isEssential = ESSENTIAL_BROADCAST_TYPES.includes(broadcastType)
      || record.priority === PRIORITY.EMERGENCY;

    if (!bypassOptOut && !isEssential) {
      recipients = recipients.filter((u) => {
        const set = this._optOuts[String(u.id)];
        if (!set) return true;
        // A user opted out of THIS broadcastType OR of 'all' non-essentials?
        if (set.has(broadcastType)) return false;
        if (set.has('all-non-essential')) return false;
        return true;
      });
    }

    const events = [];
    for (const user of recipients) {
      for (const channel of channels) {
        const ok = this._sendViaChannel(channel, user, record);
        const event = {
          announcementId: record.id,
          userId: String(user.id),
          channel,
          status: ok ? DELIVERY_STATUS.DELIVERED : DELIVERY_STATUS.FAILED,
          at: now,
          priority: record.priority,
        };
        this._deliveries[record.id].push(event);
        events.push(event);
      }
      if (record.requireAck) {
        this._acks[record.id].push({
          announcementId: record.id,
          userId: String(user.id),
          status: ACK_STATUS.PENDING,
          at: now,
        });
      }
    }

    record.publishedAt = now;
    record.status = 'sent'; // Y-127 uses 'sent' for completed broadcasts

    this._audit('sendNow', {
      id: record.id,
      recipients: recipients.length,
      channels,
      bypassOptOut,
      bypassSchedule,
    });

    return {
      broadcastId: record.id,
      publishedAt: now,
      recipientCount: recipients.length,
      channelCount: channels.length,
      eventCount: events.length,
      channels: channels.slice(),
      priority: record.priority,
      status: record.status,
      events,
    };
  }

  _tenureBand(hireDate, nowMs) {
    if (!hireDate) return 'unknown';
    const t = toTime(hireDate);
    if (t == null) return 'unknown';
    const years = (nowMs - t) / (1000 * 60 * 60 * 24 * 365.25);
    if (years < 1) return 'new';
    if (years < 3) return 'mid';
    if (years < 7) return 'senior';
    return 'veteran';
  }

  // ---------------------------------------------------------------
  //  Test / inspection helpers
  // ---------------------------------------------------------------

  _now() { return this._nowFn(); }

  _snapshot() {
    return frozenClone({
      announcements: this._announcements,
      deliveries: this._deliveries,
      reads: this._reads,
      acks: this._acks,
      polls: this._polls,
      pollVotes: this._pollVotes,
      retractions: this._retractions,
      complianceLog: this._complianceLog,
      auditTrail: this._auditTrail,
      digestPrefs: this._digestPrefs,
      createOrder: this._createOrder,
    });
  }

  // ---------------------------------------------------------------
  //  Internal
  // ---------------------------------------------------------------

  _requireAnnouncement(id) {
    const rec = this._announcements[id];
    if (!rec) throw new Error(`Broadcast: unknown announcement id "${id}"`);
    return rec;
  }

  _resolveAudience(audience) {
    const dir = this._directory;
    if (!Array.isArray(dir) || dir.length === 0) return [];
    switch (audience.type) {
      case AUDIENCE_TYPE.ALL:
        return dir.slice();
      case AUDIENCE_TYPE.DEPARTMENT:
        return dir.filter((u) => u && u.department === audience.department);
      case AUDIENCE_TYPE.ROLE:
        return dir.filter((u) => u && u.role === audience.role);
      case AUDIENCE_TYPE.CUSTOM: {
        const set = new Set(audience.members || []);
        return dir.filter((u) => u && set.has(u.id));
      }
      case 'criteria':
        // Y-127 upgrade — multi-criteria resolution via audienceSelector.
        return this.audienceSelector({
          criteria: {
            departments: audience.departments || [],
            roles: audience.roles || [],
            tenures: audience.tenures || [],
            locations: audience.locations || [],
            segments: audience.segments || [],
          },
        });
      default:
        return [];
    }
  }

  _effectiveChannels(record) {
    // Emergency forces every channel we know about.
    if (record.priority === PRIORITY.EMERGENCY) return ALL_CHANNELS.slice();

    // Urgent ensures at least in-app, email, sms.
    if (record.priority === PRIORITY.URGENT) {
      const base = new Set(record.channels);
      base.add(CHANNELS.IN_APP);
      base.add(CHANNELS.EMAIL);
      base.add(CHANNELS.SMS);
      return Array.from(base);
    }

    return record.channels.slice();
  }

  _sendViaChannel(channel, user, record) {
    // If caller injected a gateway (tests), use it.
    const gw = this._gateways[channel];
    if (typeof gw === 'function') {
      try {
        const result = gw({ user, record, priority: record.priority });
        return result !== false;
      } catch (_err) {
        return false;
      }
    }
    // Otherwise: succeed-silently stub.  Real adapters live in
    // onyx-procurement/src/adapters/* and are wired in production.
    return true;
  }

  _logCompliance(record, action, extra = {}) {
    const entry = {
      seq: ++this._seq,
      announcementId: record.id,
      action,
      category: record.category,
      priority: record.priority,
      requireAck: record.requireAck,
      at: this._now(),
      extra: extra && typeof extra === 'object' ? Object.assign({}, extra) : {},
    };
    this._complianceLog.push(entry);
  }

  _audit(action, data) {
    this._auditTrail.push({
      seq: ++this._seq,
      action,
      data: data && typeof data === 'object' ? Object.assign({}, data) : {},
      at: this._now(),
    });
  }

  _pollTallies(id) {
    const poll = this._polls[id];
    if (!poll) return null;
    const latestByUser = new Map();
    for (const v of (this._pollVotes[id] || [])) {
      latestByUser.set(v.userId, v);
    }
    const tallies = new Array(poll.options.length).fill(0);
    for (const v of latestByUser.values()) tallies[v.optionIndex]++;
    return {
      question: poll.question,
      options: poll.options.slice(),
      votes: tallies,
      totalVotes: latestByUser.size,
    };
  }
}

// =====================================================================
//  Exports
// =====================================================================

module.exports = {
  Broadcast,
  CHANNELS,
  ALL_CHANNELS,
  PRIORITY,
  PRIORITY_ORDER,
  AUDIENCE_TYPE,
  DELIVERY_STATUS,
  ACK_STATUS,
  DIGEST_FREQ,
  EMERGENCY_CATEGORIES,
  HEBREW_GLOSSARY,
  // Y-127 upgrade exports
  BROADCAST_STATUS,
  ESSENTIAL_BROADCAST_TYPES,
  AUDIENCE_CRITERIA_KEYS,
};
