/**
 * Unified Notification Service — History & Audit Log
 * ─────────────────────────────────────────────────────
 * Agent-76 — Notifications
 *
 * Records every notification emission with enough detail to:
 *   • show a user their inbox (unread / read)
 *   • produce an audit trail (who sent what, to whom, via which channel, outcome)
 *   • enforce frequency caps (hourly) and throttle (per-type)
 *
 * Storage:
 *   • Append-only JSONL at data/notification-history.jsonl (primary)
 *   • Optional Supabase table `notification_history` (if client provided)
 *
 * The module keeps a rolling in-memory index of "recent" events (last 30 days)
 * for fast reads. Older events are still on disk; dumpAll() streams them.
 *
 * Zero external deps.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ───────────────────────────────────────────────────────────────
// SQL migration
// ───────────────────────────────────────────────────────────────

function migrationSql() {
  return `
-- notification_history — audit + user-facing inbox
CREATE TABLE IF NOT EXISTS notification_history (
  id              TEXT        PRIMARY KEY,
  user_id         TEXT        NOT NULL,
  type_id         TEXT        NOT NULL,
  priority        TEXT        NOT NULL,
  title           TEXT,
  body            TEXT,
  channels        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  delivered_on    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  failed_on       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  data            JSONB,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_user_created
  ON notification_history (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_history_unread
  ON notification_history (user_id) WHERE read_at IS NULL;
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

function genId() {
  return 'h_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

// ───────────────────────────────────────────────────────────────
// NotificationHistory class
// ───────────────────────────────────────────────────────────────

class NotificationHistory {
  /**
   * @param {object} [opts]
   * @param {object} [opts.supabase]
   * @param {string} [opts.storePath]
   * @param {number} [opts.retentionMs]  how far back to keep in the in-memory index
   * @param {object} [opts.logger]
   */
  constructor(opts = {}) {
    this.supabase     = opts.supabase || null;
    this.storePath    = opts.storePath || path.join(process.cwd(), 'data', 'notification-history.jsonl');
    this.retentionMs  = opts.retentionMs || 30 * 24 * 60 * 60 * 1000; // 30 days
    this.logger       = opts.logger || {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    };
    // id → record (in-memory for recent events)
    this._recent  = new Map();
    // user_id → [ids] ordered newest-first
    this._byUser  = new Map();

    ensureDir(this.storePath);
    this._loadJsonl();
  }

  // ─── JSONL persistence ───
  _loadJsonl() {
    if (!fs.existsSync(this.storePath)) return;
    let raw;
    try { raw = fs.readFileSync(this.storePath, 'utf8'); } catch (_) { return; }
    const cutoff = Date.now() - this.retentionMs;
    const lines = raw.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const rec = safeJsonParse(line);
      if (!rec || !rec.id) continue;
      if (rec.action === 'record') {
        if (rec.createdAt < cutoff) continue;
        this._indexRecord(rec.record);
      } else if (rec.action === 'mark_read') {
        const r = this._recent.get(rec.id);
        if (r) r.readAt = rec.ts;
      }
    }
  }

  _indexRecord(record) {
    if (!record || !record.id) return;
    this._recent.set(record.id, record);
    const list = this._byUser.get(record.userId) || [];
    list.unshift(record.id);
    this._byUser.set(record.userId, list);
  }

  _append(obj) {
    try {
      fs.appendFileSync(this.storePath, JSON.stringify(obj) + '\n', 'utf8');
    } catch (err) {
      this.logger.error('[notification-history] append failed', err && err.message);
    }
  }

  // ─── Supabase (optional) ───
  async _supabaseInsert(record) {
    if (!this.supabase) return false;
    try {
      const row = {
        id:           record.id,
        user_id:      record.userId,
        type_id:      record.typeId,
        priority:     record.priority,
        title:        record.title,
        body:         record.body,
        channels:     record.channels,
        delivered_on: record.deliveredOn,
        failed_on:    record.failedOn,
        data:         record.data || null,
        read_at:      record.readAt ? new Date(record.readAt).toISOString() : null,
        created_at:   new Date(record.createdAt).toISOString(),
      };
      const { error } = await this.supabase.from('notification_history').insert(row);
      if (error) { this.logger.debug('[notification-history] supabase insert error', error.message); return false; }
      return true;
    } catch (err) {
      this.logger.warn('[notification-history] supabase insert failed', err && err.message);
      return false;
    }
  }

  async _supabaseMarkRead(id) {
    if (!this.supabase) return false;
    try {
      const { error } = await this.supabase
        .from('notification_history')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) { this.logger.debug('[notification-history] supabase mark_read error', error.message); return false; }
      return true;
    } catch (err) {
      this.logger.warn('[notification-history] supabase mark_read failed', err && err.message);
      return false;
    }
  }

  // ─── Public API ───

  /**
   * record — log a new notification emission.
   *
   * @param {object} input
   * @param {string} input.userId
   * @param {string} input.typeId
   * @param {string} input.priority
   * @param {string} input.title
   * @param {string} input.body
   * @param {string[]} input.channels        — requested channels
   * @param {string[]} input.deliveredOn     — channels that succeeded
   * @param {string[]} input.failedOn        — channels that failed
   * @param {object}   [input.data]          — original data payload
   * @returns {object} record
   */
  async record(input) {
    const record = {
      id:          genId(),
      userId:      input.userId,
      typeId:      input.typeId,
      priority:    input.priority || 'normal',
      title:       input.title || '',
      body:        input.body || '',
      channels:    Array.isArray(input.channels)    ? input.channels.slice()    : [],
      deliveredOn: Array.isArray(input.deliveredOn) ? input.deliveredOn.slice() : [],
      failedOn:    Array.isArray(input.failedOn)    ? input.failedOn.slice()    : [],
      data:        input.data || null,
      readAt:      null,
      createdAt:   Date.now(),
    };
    this._indexRecord(record);
    this._append({ action: 'record', id: record.id, record, createdAt: record.createdAt });
    // best-effort DB
    this._supabaseInsert(record).catch(() => {});
    return record;
  }

  /**
   * getUnread — unread notifications for a user, newest first.
   */
  getUnread(userId, { limit = 50 } = {}) {
    const ids = this._byUser.get(userId) || [];
    const out = [];
    for (const id of ids) {
      const r = this._recent.get(id);
      if (r && !r.readAt) {
        out.push(r);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /**
   * getHistory — all notifications for a user, newest first.
   */
  getHistory(userId, { limit = 100, offset = 0 } = {}) {
    const ids = this._byUser.get(userId) || [];
    const slice = ids.slice(offset, offset + limit);
    return slice.map(id => this._recent.get(id)).filter(Boolean);
  }

  /**
   * markRead — flag a notification as read.
   */
  async markRead(id) {
    const r = this._recent.get(id);
    if (!r) return false;
    if (r.readAt) return true;
    r.readAt = Date.now();
    this._append({ action: 'mark_read', id, ts: r.readAt });
    this._supabaseMarkRead(id).catch(() => {});
    return true;
  }

  /**
   * countRecent — how many non-critical notifications a user received in the
   * last `windowMs`. Used by the frequency cap check.
   */
  countRecent(userId, windowMs) {
    const cutoff = Date.now() - windowMs;
    const ids = this._byUser.get(userId) || [];
    let n = 0;
    for (const id of ids) {
      const r = this._recent.get(id);
      if (!r) continue;
      if (r.createdAt < cutoff) break;  // newest-first ordering
      if (r.priority === 'critical') continue;
      n++;
    }
    return n;
  }

  /**
   * lastEmissionOfType — epoch ms of the last time (userId, typeId) was sent.
   * Used by the per-type throttle.
   */
  lastEmissionOfType(userId, typeId) {
    const ids = this._byUser.get(userId) || [];
    for (const id of ids) {
      const r = this._recent.get(id);
      if (r && r.typeId === typeId) return r.createdAt;
    }
    return 0;
  }

  /**
   * stats — lightweight counters.
   */
  stats() {
    return {
      totalRecent: this._recent.size,
      users: this._byUser.size,
      retentionMs: this.retentionMs,
    };
  }
}

module.exports = {
  NotificationHistory,
  migrationSql,
};
