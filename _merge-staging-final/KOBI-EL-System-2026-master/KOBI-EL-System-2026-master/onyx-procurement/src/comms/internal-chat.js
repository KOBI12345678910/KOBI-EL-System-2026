/**
 * Internal Team Chat (Slack-lite) — Techno-Kol Uzi mega-ERP 2026
 * ─────────────────────────────────────────────────────────────
 * Agent Y-126 / Swarm 3 / Comms stack
 *
 *   צ'אט פנימי עם ערוצים, הודעות ישירות, פתילים, תגובות, אזכורים,
 *   נעיצה, חיפוש מלא בעברית, הגדרות התראה, נוכחות, פקודות סלאש,
 *   העלאת קבצים ויצוא תאימות. אפס תלויות, מודע עברית, תקוע בזכרון.
 *
 * Rule enforced: **לא מוחקים רק משדרגים ומגדלים** — every message is
 * preserved forever. `deleteMessage()` is a soft-delete that flips a
 * `deleted` flag and writes an audit entry. No purge, no overwrite.
 * Edits keep the full history chain.
 *
 * Zero external deps. Node >= 18 built-ins only (Map / Set / crypto
 * `randomUUID`). No WebSockets, no DB driver — wires cleanly into the
 * X-13 SSE hub (`src/realtime/sse-hub.js`) when one is passed in.
 *
 * Public API (class `InternalChat`):
 *   createChannel({name, description, visibility, members, owners})
 *   sendMessage({channelId, userId, text, attachments, mentions, replyTo})
 *   editMessage({messageId, userId, newText})
 *   deleteMessage({messageId, userId, reason})     — soft delete
 *   reactMessage({messageId, userId, emoji})
 *   pinMessage({messageId, userId})
 *   searchMessages({query, channelId, user, dateRange})
 *   listChannels({userId})
 *   joinChannel({channelId, userId, invitedBy})
 *   leaveChannel({channelId, userId})
 *   directMessage({fromUserId, toUserId, text})   — 1:1 "encrypted" DM
 *   groupDM({userIds, text})                      — small group DM
 *   notificationSettings({userId, channelId, muted, keywords})
 *   presence({userId, status})
 *   slashCommands({command, args, context})       — extensible registry
 *   fileUpload({channelId, file})                 — metadata + stub store
 *   export({channelId, period, format})           — compliance export
 *   realtimeUpdates()                             — returns X-13 bridge
 *
 * Usage:
 *   const { InternalChat } = require('./comms/internal-chat');
 *   const chat = new InternalChat({ sseHub: hub });  // hub is optional
 *   const ch = chat.createChannel({
 *     name: 'general', visibility: 'public',
 *     members: ['u1','u2'], owners: ['u1']
 *   });
 *   chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'שלום @u2' });
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// 0. TINY ID / TIME HELPERS
// ═══════════════════════════════════════════════════════════════════════

let _idSeq = 0;

/**
 * Generate a monotonic, collision-safe identifier. Uses crypto.randomUUID
 * when available and appends a local counter so two calls in the same ms
 * always differ — tests rely on deterministic ordering.
 */
function _newId(prefix) {
  _idSeq = (_idSeq + 1) >>> 0;
  const seq = String(_idSeq).padStart(6, '0');
  let rnd = '';
  try {
    // Node 18+: crypto.randomUUID; fall back to hex timestamp.
    const crypto = require('crypto');
    if (crypto && typeof crypto.randomUUID === 'function') {
      rnd = crypto.randomUUID().slice(0, 8);
    }
  } catch (_e) {
    rnd = '';
  }
  if (!rnd) rnd = Math.floor(Math.random() * 0xffffffff).toString(16);
  return `${prefix}_${Date.now().toString(36)}_${seq}_${rnd}`;
}

function _nowMs() { return Date.now(); }

/**
 * Deep-freeze a plain object so stored records are tamper-evident.
 * Arrays of objects are handled, but cycles are not — we don't build any.
 */
function _deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Object.isFrozen(obj)) return obj;
  for (const k of Object.keys(obj)) _deepFreeze(obj[k]);
  return Object.freeze(obj);
}

// ═══════════════════════════════════════════════════════════════════════
// 1. HEBREW-AWARE TOKENIZATION (inlined — keeps module zero-dep)
// ═══════════════════════════════════════════════════════════════════════

// U+0591..U+05BD, U+05BF, U+05C1..U+05C2, U+05C4..U+05C5, U+05C7
const NIQQUD_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

const HEB_FINAL = Object.freeze({
  'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ',
});

// Compact stopword sets — intentionally lean so e.g. "של" is skipped but
// meaningful terms stay.
const HEB_STOPWORDS = new Set([
  'של', 'את', 'עם', 'זה', 'זו', 'זאת', 'הוא', 'היא', 'הם', 'הן',
  'על', 'אל', 'אם', 'כי', 'או', 'גם', 'לא', 'כן', 'יש', 'אין',
  'עוד', 'כמו', 'בין', 'תחת', 'מעל', 'אצל',
  'לי', 'לך', 'לו', 'לה', 'לנו', 'לכם', 'להם', 'להן',
  'אני', 'אתה', 'אנחנו', 'אתם', 'אתן',
  'ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ',
  'מה', 'מי', 'איך', 'למה', 'איפה', 'מתי',
  'אבל', 'כדי', 'רק', 'עד', 'כבר', 'אולי',
]);

const EN_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'or', 'but', 'not',
  'this', 'these', 'those', 'they', 'them', 'their', 'there',
  'do', 'does', 'did', 'can', 'could', 'would', 'should', 'so', 'if',
]);

function _stripNiqqud(str) {
  if (typeof str !== 'string') return '';
  return str.replace(NIQQUD_RE, '');
}

function _normalizeFinalLetters(str) {
  if (typeof str !== 'string') return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += HEB_FINAL[ch] || ch;
  }
  return out;
}

function _isHebChar(ch) {
  const c = ch.charCodeAt(0);
  return c >= 0x05D0 && c <= 0x05EA;
}
function _isAsciiAlnum(ch) {
  const c = ch.charCodeAt(0);
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

/**
 * Tokenize any Hebrew / English / mixed string for the chat search index.
 * 1) strip niqqud 2) normalize final letters 3) split on non-alnum
 * 4) lowercase 5) drop stopwords. Returns lowercased tokens.
 */
function tokenize(str) {
  if (typeof str !== 'string' || str.length === 0) return [];
  const base = _normalizeFinalLetters(_stripNiqqud(str));
  const out = [];
  let buf = '';
  for (let i = 0; i < base.length; i++) {
    const ch = base[i];
    if (_isHebChar(ch) || _isAsciiAlnum(ch)) {
      buf += ch;
    } else {
      if (buf.length > 0) { out.push(buf); buf = ''; }
    }
  }
  if (buf.length > 0) out.push(buf);

  const filtered = [];
  for (const t of out) {
    const lo = t.toLowerCase();
    if (!lo) continue;
    if (HEB_STOPWORDS.has(lo) || EN_STOPWORDS.has(lo)) continue;
    filtered.push(lo);
  }
  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. MENTION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extract @mentions from a message body. Supports:
 *   @user.id, @user-id, @user_id    (ASCII-friendly handles)
 *   @channel   reserved broadcast
 *   @here      reserved broadcast
 *   @everyone  alias for @channel
 *
 * The handle after `@` runs until the first whitespace or one of
 * `,.:;!?()[]{}"'` — Hebrew letters after the @ are NOT treated as
 * handles to avoid misreading ordinary prose ("אני @דני" still parses
 * `דני` only when it's a valid ASCII-ish handle; Hebrew-only handles are
 * not recommended). Duplicates are de-duped and order is preserved.
 */
function extractMentions(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const mentions = [];
  const seen = new Set();
  const re = /@([A-Za-z0-9._-]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const handle = m[1].toLowerCase();
    if (!handle) continue;
    if (seen.has(handle)) continue;
    seen.add(handle);
    mentions.push(handle);
  }
  return mentions;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. "ENCRYPTION" STUB FOR DMs
// ═══════════════════════════════════════════════════════════════════════

/**
 * Simple reversible obfuscation used for 1:1 DM bodies. NOT a real cipher
 * — it's a framing helper so DM rows in memory look different from
 * channel rows and so a memory dump doesn't expose plain text casually.
 * A real deployment should swap in libsodium or Node crypto.subtle.
 *
 * We XOR the bytes with a per-DM key derived from participant IDs + salt,
 * then base64. Decrypt is identical. Key derivation is deterministic so
 * tests can round-trip without storing secrets.
 */
function _deriveKey(seed) {
  const s = String(seed || '');
  // FNV-1a 32-bit — short, fast, deterministic.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    h = Math.imul(h ^ (h >>> 7), 0x01000193);
    out[i] = h & 0xff;
  }
  return out;
}

function _xorCipher(text, seed) {
  const key = _deriveKey(seed);
  // Encode as UTF-8 bytes so Hebrew survives.
  const enc = Buffer.from(String(text || ''), 'utf8');
  const out = Buffer.alloc(enc.length);
  for (let i = 0; i < enc.length; i++) out[i] = enc[i] ^ key[i % key.length];
  return out.toString('base64');
}

function _xorDecipher(b64, seed) {
  const key = _deriveKey(seed);
  const buf = Buffer.from(String(b64 || ''), 'base64');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out.toString('utf8');
}

// ═══════════════════════════════════════════════════════════════════════
// 4. ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════

class ChatError extends Error {
  constructor(code, message, extra) {
    super(message || code);
    this.name = 'ChatError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. MAIN CLASS
// ═══════════════════════════════════════════════════════════════════════

class InternalChat {
  /**
   * @param {Object} [options]
   * @param {Object} [options.sseHub]  SSE hub instance from src/realtime/sse-hub.js
   * @param {Function} [options.clock] () => ms, for deterministic tests
   * @param {Object} [options.logger]  { info, warn, error } optional
   * @param {string} [options.dmSalt]  salt for DM key derivation
   */
  constructor(options = {}) {
    this.sseHub = options.sseHub || null;
    this.clock = typeof options.clock === 'function' ? options.clock : _nowMs;
    this.logger = options.logger || null;
    this.dmSalt = options.dmSalt || 'techno-kol-uzi-2026';

    // Primary storage — Maps keyed by id.
    this.channels  = new Map(); // channelId  → channel record
    this.messages  = new Map(); // messageId  → message record
    this.files     = new Map(); // fileId     → file metadata
    this.notifPrefs = new Map(); // `${userId}:${channelId}` → prefs
    this.presenceMap = new Map(); // userId   → { status, since, lastSeen }
    this.auditLog = []; // append-only; NEVER purged

    // Derived indices (built alongside writes, never the source of truth).
    this.channelByName = new Map(); // lowercased name → channelId (public only)
    this.userChannels  = new Map(); // userId → Set<channelId>
    this.tokenIndex    = new Map(); // token → Set<messageId>
    this.channelMessages = new Map(); // channelId → ordered array of ids
    this.threadMap     = new Map(); // rootMessageId → ordered array of replies
    this.pinnedByChannel = new Map(); // channelId → Set<messageId>

    // Slash command registry — extensible via registerSlashCommand().
    this.slashRegistry = new Map();
    this._installDefaultSlashCommands();
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.1 Channels
  // ─────────────────────────────────────────────────────────────────

  /**
   * createChannel({name, description, visibility, members, owners})
   * visibility: 'public' (default) | 'private'
   * Returns the channel record.
   */
  createChannel(input) {
    const {
      name,
      description = '',
      visibility = 'public',
      members = [],
      owners = [],
    } = input || {};

    if (!name || typeof name !== 'string') {
      throw new ChatError('invalid_name', 'channel name required');
    }
    if (visibility !== 'public' && visibility !== 'private') {
      throw new ChatError('invalid_visibility', 'visibility must be public or private');
    }
    const normName = name.trim().toLowerCase();
    if (visibility === 'public' && this.channelByName.has(normName)) {
      throw new ChatError('name_taken', `public channel "${name}" already exists`);
    }

    const id = _newId('ch');
    const memberSet = new Set(members);
    for (const o of owners) memberSet.add(o); // owners always members
    const ownerSet  = new Set(owners.length ? owners : members.slice(0, 1));
    if (ownerSet.size === 0 && memberSet.size > 0) {
      ownerSet.add(Array.from(memberSet)[0]);
    }

    const channel = {
      id,
      kind:        'channel',                // vs 'dm' / 'group_dm'
      name:        name.trim(),
      normName,
      description: String(description || ''),
      visibility,
      members:     Array.from(memberSet),
      owners:      Array.from(ownerSet),
      createdAt:   this.clock(),
      updatedAt:   this.clock(),
      archived:    false,
      messageCount: 0,
    };
    this.channels.set(id, channel);
    if (visibility === 'public') this.channelByName.set(normName, id);
    this.channelMessages.set(id, []);
    this.pinnedByChannel.set(id, new Set());

    for (const u of memberSet) this._linkUserChannel(u, id);

    this._audit({ type: 'channel.create', channelId: id, by: owners[0] || null });
    this._emit('channel.create', { channelId: id, name: channel.name, visibility });
    return this._snapshotChannel(channel);
  }

  _linkUserChannel(userId, channelId) {
    if (!userId) return;
    let s = this.userChannels.get(userId);
    if (!s) { s = new Set(); this.userChannels.set(userId, s); }
    s.add(channelId);
  }
  _unlinkUserChannel(userId, channelId) {
    if (!userId) return;
    const s = this.userChannels.get(userId);
    if (s) s.delete(channelId);
  }

  /**
   * listChannels({userId}) — channels visible to user.
   * Public channels are always visible. Private channels only when the
   * user is a member. DMs and group DMs are returned only when the user
   * is a participant.
   */
  listChannels(input) {
    const { userId } = input || {};
    const out = [];
    for (const ch of this.channels.values()) {
      if (ch.archived) continue;
      const isMember = userId ? ch.members.includes(userId) : false;
      if (ch.kind === 'channel') {
        if (ch.visibility === 'public' || isMember) out.push(this._snapshotChannel(ch));
      } else if (isMember) {
        // DM / group DM — only participants see it.
        out.push(this._snapshotChannel(ch));
      }
    }
    // Deterministic order — newest first.
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }

  joinChannel(input) {
    const { channelId, userId, invitedBy = null } = input || {};
    const ch = this._requireChannel(channelId);
    if (ch.kind !== 'channel') {
      throw new ChatError('cannot_join_dm', 'cannot join direct messages');
    }
    if (ch.visibility === 'private' && !invitedBy) {
      throw new ChatError('private_channel', 'private channel requires an inviter');
    }
    if (ch.visibility === 'private' && !ch.members.includes(invitedBy)) {
      throw new ChatError('inviter_not_member', 'inviter must already be a member');
    }
    if (ch.members.includes(userId)) {
      return this._snapshotChannel(ch); // idempotent
    }
    ch.members = ch.members.concat([userId]);
    ch.updatedAt = this.clock();
    this._linkUserChannel(userId, channelId);
    this._audit({ type: 'channel.join', channelId, userId, invitedBy });
    this._emit('channel.join', { channelId, userId, invitedBy });
    return this._snapshotChannel(ch);
  }

  leaveChannel(input) {
    const { channelId, userId } = input || {};
    const ch = this._requireChannel(channelId);
    if (!ch.members.includes(userId)) return this._snapshotChannel(ch);
    ch.members = ch.members.filter(u => u !== userId);
    // If the last owner leaves, promote the first remaining member.
    if (ch.owners.includes(userId)) {
      ch.owners = ch.owners.filter(u => u !== userId);
      if (ch.owners.length === 0 && ch.members.length > 0) {
        ch.owners = [ch.members[0]];
      }
    }
    ch.updatedAt = this.clock();
    this._unlinkUserChannel(userId, channelId);
    this._audit({ type: 'channel.leave', channelId, userId });
    this._emit('channel.leave', { channelId, userId });
    return this._snapshotChannel(ch);
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.2 Messages
  // ─────────────────────────────────────────────────────────────────

  /**
   * sendMessage({channelId, userId, text, attachments, mentions, replyTo})
   * Supports threads (via replyTo) and @mentions. The `mentions` argument
   * is merged with auto-extracted mentions from the body.
   */
  sendMessage(input) {
    const {
      channelId, userId, text = '',
      attachments = [], mentions = [], replyTo = null,
    } = input || {};

    const ch = this._requireChannel(channelId);
    if (!userId) throw new ChatError('user_required', 'userId is required');
    if (!this._userCanPostInChannel(ch, userId)) {
      throw new ChatError('forbidden', 'user is not a member of the channel');
    }

    let thread = null;
    if (replyTo) {
      const root = this.messages.get(replyTo);
      if (!root || root.deleted || root.channelId !== channelId) {
        throw new ChatError('bad_reply_to', 'replyTo message not found in channel');
      }
      thread = root.threadRootId || root.id;
    }

    const auto = extractMentions(text);
    const mentionSet = new Set(auto.concat(Array.isArray(mentions) ? mentions : []));
    const now = this.clock();

    const msgId = _newId('msg');
    const record = {
      id:             msgId,
      channelId,
      userId,
      text:           String(text),
      attachments:    Array.isArray(attachments) ? attachments.slice() : [],
      mentions:       Array.from(mentionSet),
      replyTo:        replyTo || null,
      threadRootId:   thread,
      threadReplyCount: 0,
      reactions:      {},                 // emoji → Set<userId>
      pinned:         false,
      deleted:        false,
      deleteReason:   null,
      editHistory:    [],                 // [{ ts, by, prevText }]
      createdAt:      now,
      updatedAt:      now,
      tokens:         tokenize(text),     // for search
    };
    this.messages.set(msgId, record);

    // Per-channel ordered id list.
    this.channelMessages.get(channelId).push(msgId);

    // Thread bookkeeping.
    if (thread) {
      let arr = this.threadMap.get(thread);
      if (!arr) { arr = []; this.threadMap.set(thread, arr); }
      arr.push(msgId);
      const root = this.messages.get(thread);
      if (root) root.threadReplyCount += 1;
    }

    // Build search tokens.
    this._indexTokens(msgId, record.tokens);

    // Update channel counters.
    ch.messageCount += 1;
    ch.updatedAt = now;

    this._audit({ type: 'message.send', messageId: msgId, channelId, userId });
    this._emit('message.send', this._snapshotMessage(record, ch));

    return this._snapshotMessage(record, ch);
  }

  /**
   * editMessage({messageId, userId, newText})
   * Only the author can edit their own message. History is preserved —
   * `editHistory` is an append-only list of prior versions.
   */
  editMessage(input) {
    const { messageId, userId, newText } = input || {};
    const msg = this._requireMessage(messageId);
    if (msg.deleted) {
      throw new ChatError('deleted_message', 'cannot edit a deleted message');
    }
    if (msg.userId !== userId) {
      throw new ChatError('forbidden', 'only the author may edit');
    }
    if (typeof newText !== 'string') {
      throw new ChatError('invalid_text', 'newText must be a string');
    }
    const prev = msg.text;
    if (prev === newText) return this._snapshotMessage(msg, this.channels.get(msg.channelId));

    // Push previous version into history.
    msg.editHistory.push(Object.freeze({
      ts:       this.clock(),
      by:       userId,
      prevText: prev,
    }));
    msg.text = newText;
    msg.updatedAt = this.clock();

    // Rebuild token index for this message.
    this._unindexTokens(msg.id, msg.tokens);
    msg.tokens = tokenize(newText);
    this._indexTokens(msg.id, msg.tokens);

    // Refresh mentions — union of previous auto-extracted + new.
    const freshMentions = extractMentions(newText);
    msg.mentions = Array.from(new Set(msg.mentions.concat(freshMentions)));

    this._audit({
      type: 'message.edit', messageId, userId,
      prevLen: prev.length, newLen: newText.length,
    });
    this._emit('message.edit', this._snapshotMessage(msg, this.channels.get(msg.channelId)));
    return this._snapshotMessage(msg, this.channels.get(msg.channelId));
  }

  /**
   * deleteMessage({messageId, userId, reason})
   * Soft delete: the record remains in storage, the `deleted` flag flips,
   * and an audit entry is written. The original text stays in-place so
   * compliance exports include the full history. Rule: **NEVER purge**.
   *
   * Authors can delete their own messages; channel owners can delete any
   * message in their channel.
   */
  deleteMessage(input) {
    const { messageId, userId, reason = null } = input || {};
    const msg = this._requireMessage(messageId);
    const ch  = this.channels.get(msg.channelId);
    const isAuthor = msg.userId === userId;
    const isOwner  = ch && ch.owners.includes(userId);
    if (!isAuthor && !isOwner) {
      throw new ChatError('forbidden', 'only author or channel owner may delete');
    }
    if (msg.deleted) {
      // Idempotent — but still record re-delete attempts in the audit log.
      this._audit({ type: 'message.delete.redundant', messageId, userId });
      return this._snapshotMessage(msg, ch);
    }
    msg.deleted = true;
    msg.deleteReason = reason;
    msg.deletedAt = this.clock();
    msg.deletedBy = userId;
    msg.updatedAt = this.clock();

    this._audit({
      type: 'message.delete', messageId, userId, reason,
      // For compliance: record that the body is preserved.
      preservedBytes: Buffer.byteLength(msg.text || '', 'utf8'),
    });
    this._emit('message.delete', { messageId, channelId: msg.channelId, userId, reason });
    return this._snapshotMessage(msg, ch);
  }

  /**
   * reactMessage({messageId, userId, emoji})
   * Toggles the reaction — call twice to remove. Emoji is stored verbatim.
   */
  reactMessage(input) {
    const { messageId, userId, emoji } = input || {};
    const msg = this._requireMessage(messageId);
    if (msg.deleted) throw new ChatError('deleted_message', 'cannot react to deleted message');
    if (!emoji) throw new ChatError('invalid_emoji', 'emoji required');

    let bucket = msg.reactions[emoji];
    if (!bucket) { bucket = new Set(); msg.reactions[emoji] = bucket; }
    let action;
    if (bucket.has(userId)) { bucket.delete(userId); action = 'remove'; }
    else { bucket.add(userId); action = 'add'; }
    if (bucket.size === 0) delete msg.reactions[emoji];
    msg.updatedAt = this.clock();

    this._audit({ type: 'message.react', messageId, userId, emoji, action });
    this._emit('message.react', { messageId, userId, emoji, action });
    return this._snapshotMessage(msg, this.channels.get(msg.channelId));
  }

  /**
   * pinMessage({messageId, userId}) — channel members can pin; owners can unpin
   * anyone's pin. Toggles on/off.
   */
  pinMessage(input) {
    const { messageId, userId } = input || {};
    const msg = this._requireMessage(messageId);
    if (msg.deleted) throw new ChatError('deleted_message', 'cannot pin deleted message');
    const ch = this.channels.get(msg.channelId);
    if (!ch || !ch.members.includes(userId)) {
      throw new ChatError('forbidden', 'must be a channel member to pin');
    }
    const pinned = this.pinnedByChannel.get(msg.channelId);
    let action;
    if (msg.pinned) {
      msg.pinned = false;
      pinned.delete(msg.id);
      action = 'unpin';
    } else {
      msg.pinned = true;
      pinned.add(msg.id);
      action = 'pin';
    }
    msg.updatedAt = this.clock();
    this._audit({ type: `message.${action}`, messageId, userId });
    this._emit(`message.${action}`, { messageId, channelId: msg.channelId, userId });
    return this._snapshotMessage(msg, ch);
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.3 Search
  // ─────────────────────────────────────────────────────────────────

  /**
   * searchMessages({query, channelId, user, dateRange})
   * query can be a multi-word phrase — all tokens must match (AND semantics).
   * Results are scored by (token overlap ratio) × recency boost and sorted
   * descending. Deleted messages are excluded by default.
   */
  searchMessages(input) {
    const {
      query = '', channelId = null, user = null,
      dateRange = null, includeDeleted = false, limit = 50,
    } = input || {};

    const qTokens = tokenize(query);
    if (qTokens.length === 0) return { total: 0, results: [], query, tokens: [] };

    // Candidate set: intersection of posting lists.
    let candidates = null;
    for (const t of qTokens) {
      const posting = this.tokenIndex.get(t);
      if (!posting || posting.size === 0) { candidates = new Set(); break; }
      if (candidates === null) {
        candidates = new Set(posting);
      } else {
        const next = new Set();
        for (const id of candidates) if (posting.has(id)) next.add(id);
        candidates = next;
      }
      if (candidates.size === 0) break;
    }
    if (!candidates || candidates.size === 0) {
      return { total: 0, results: [], query, tokens: qTokens };
    }

    const now = this.clock();
    const results = [];
    for (const id of candidates) {
      const msg = this.messages.get(id);
      if (!msg) continue;
      if (!includeDeleted && msg.deleted) continue;
      if (channelId && msg.channelId !== channelId) continue;
      if (user && msg.userId !== user) continue;
      if (dateRange) {
        const { from, to } = dateRange;
        if (from && msg.createdAt < from) continue;
        if (to   && msg.createdAt > to)   continue;
      }

      // Score: token overlap + mild recency boost (decays over 30 days).
      const overlap  = qTokens.length / Math.max(1, msg.tokens.length);
      const ageDays  = (now - msg.createdAt) / 86_400_000;
      const recency  = 1 / (1 + ageDays / 30);
      const score    = overlap * 0.7 + recency * 0.3;

      results.push({
        messageId: msg.id,
        channelId: msg.channelId,
        userId:    msg.userId,
        text:      msg.text,
        createdAt: msg.createdAt,
        score,
        highlight: this._highlight(msg.text, qTokens),
      });
    }

    results.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
    const sliced = results.slice(0, Math.max(1, limit | 0));
    return { total: results.length, results: sliced, query, tokens: qTokens };
  }

  /**
   * Highlight matching tokens with «» markers (bidi-safe for Hebrew and
   * Latin alike). Returns the original text plus a hit snippet.
   */
  _highlight(text, qTokens) {
    if (!text || qTokens.length === 0) return text;
    const tokenSet = new Set(qTokens);
    let out = '';
    let buf = '';
    const flush = () => {
      if (!buf) return;
      const lo = _normalizeFinalLetters(_stripNiqqud(buf)).toLowerCase();
      if (tokenSet.has(lo)) out += '\u00AB' + buf + '\u00BB';
      else out += buf;
      buf = '';
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (_isHebChar(ch) || _isAsciiAlnum(ch)) {
        buf += ch;
      } else {
        flush();
        out += ch;
      }
    }
    flush();
    return out;
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.4 Direct messages
  // ─────────────────────────────────────────────────────────────────

  /**
   * directMessage({fromUserId, toUserId, text}) — 1:1 encrypted DM.
   * Lazily creates a DM channel between the two users on first send.
   * The text is XOR-encoded with a per-pair key (see _xorCipher docs).
   */
  directMessage(input) {
    const { fromUserId, toUserId, text = '', attachments = [] } = input || {};
    if (!fromUserId || !toUserId) {
      throw new ChatError('user_required', 'both user ids required');
    }
    if (fromUserId === toUserId) {
      throw new ChatError('self_dm', 'cannot DM yourself');
    }
    const dmId = this._getOrCreateDM([fromUserId, toUserId], 'dm');

    const enc = _xorCipher(text, this.dmSalt + ':' + dmId);
    const result = this.sendMessage({
      channelId: dmId,
      userId:    fromUserId,
      text:      text,                 // plain text stays in `text` for search
      attachments,
    });
    // Attach ciphertext alongside; UI can display plain but persist cipher.
    const msg = this.messages.get(result.messageId);
    msg.cipherText = enc;
    msg.encrypted  = true;
    return this._snapshotMessage(msg, this.channels.get(dmId));
  }

  /**
   * groupDM({userIds, text}) — ad-hoc small group DM (<= 12 participants).
   * The first user in the array is treated as the sender.
   */
  groupDM(input) {
    const { userIds = [], text = '', attachments = [] } = input || {};
    const uniq = Array.from(new Set(userIds));
    if (uniq.length < 2) throw new ChatError('too_few_members', 'group DM requires 2+ users');
    if (uniq.length > 12) throw new ChatError('too_many_members', 'group DM capped at 12');
    const dmId = this._getOrCreateDM(uniq, 'group_dm');
    return this.sendMessage({
      channelId: dmId,
      userId:    uniq[0],
      text,
      attachments,
    });
  }

  _getOrCreateDM(userIds, kind) {
    const key = userIds.slice().sort().join('|');
    for (const ch of this.channels.values()) {
      if (ch.kind === kind && ch.dmKey === key) return ch.id;
    }
    const id = _newId('dm');
    const channel = {
      id,
      kind,
      name:        kind === 'dm' ? `dm:${key}` : `group:${key}`,
      normName:    (kind === 'dm' ? `dm:${key}` : `group:${key}`).toLowerCase(),
      description: '',
      visibility:  'private',
      members:     userIds.slice(),
      owners:      userIds.slice(),
      createdAt:   this.clock(),
      updatedAt:   this.clock(),
      archived:    false,
      messageCount: 0,
      dmKey:       key,
    };
    this.channels.set(id, channel);
    this.channelMessages.set(id, []);
    this.pinnedByChannel.set(id, new Set());
    for (const u of userIds) this._linkUserChannel(u, id);
    this._audit({ type: 'dm.create', channelId: id, kind, members: userIds.slice() });
    this._emit('dm.create', { channelId: id, kind, members: userIds.slice() });
    return id;
  }

  /**
   * Decrypt a DM message body — helper for UI code.
   */
  decryptDM(messageId) {
    const msg = this._requireMessage(messageId);
    if (!msg.encrypted || !msg.cipherText) return msg.text;
    return _xorDecipher(msg.cipherText, this.dmSalt + ':' + msg.channelId);
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.5 Notifications / presence
  // ─────────────────────────────────────────────────────────────────

  /**
   * notificationSettings({userId, channelId, muted, keywords})
   * Sets per-channel notification preferences. Call with no muted/keywords
   * to read current settings.
   */
  notificationSettings(input) {
    const { userId, channelId, muted, keywords } = input || {};
    if (!userId || !channelId) {
      throw new ChatError('invalid_input', 'userId and channelId required');
    }
    const key = `${userId}:${channelId}`;
    let prefs = this.notifPrefs.get(key);
    if (!prefs) {
      prefs = { userId, channelId, muted: false, keywords: [] };
      this.notifPrefs.set(key, prefs);
    }
    if (typeof muted === 'boolean') prefs.muted = muted;
    if (Array.isArray(keywords)) {
      prefs.keywords = keywords.map(k => String(k).toLowerCase()).filter(Boolean);
    }
    prefs.updatedAt = this.clock();
    this._audit({ type: 'notif.update', userId, channelId, muted: prefs.muted });
    return { ...prefs, keywords: prefs.keywords.slice() };
  }

  /**
   * presence({userId, status}) — update or read a user's presence.
   * status: 'active' | 'away' | 'dnd' | 'offline'
   * Calling with status undefined returns the current record.
   */
  presence(input) {
    const { userId, status } = input || {};
    if (!userId) throw new ChatError('user_required', 'userId required');
    const valid = ['active', 'away', 'dnd', 'offline'];
    let rec = this.presenceMap.get(userId);
    if (!rec) {
      rec = { userId, status: 'offline', since: this.clock(), lastSeen: this.clock() };
      this.presenceMap.set(userId, rec);
    }
    if (status !== undefined) {
      if (!valid.includes(status)) {
        throw new ChatError('invalid_status', `status must be one of ${valid.join(',')}`);
      }
      if (rec.status !== status) {
        rec.status = status;
        rec.since  = this.clock();
        this._audit({ type: 'presence.update', userId, status });
        this._emit('presence.update', { userId, status });
      }
      rec.lastSeen = this.clock();
    }
    return { ...rec };
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.6 Slash commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Register a slash command handler. Callback:
   *   (args: string[], context: {userId, channelId, chat, raw}) => any
   */
  registerSlashCommand(name, handler) {
    if (!name || typeof handler !== 'function') {
      throw new ChatError('invalid_slash', 'name and handler required');
    }
    const norm = String(name).toLowerCase().replace(/^\//, '');
    this.slashRegistry.set(norm, handler);
  }

  /**
   * slashCommands({command, args, context})
   * Dispatches the command or throws if not registered. The shipped
   * defaults are listed in _installDefaultSlashCommands().
   */
  slashCommands(input) {
    const { command, args = [], context = {} } = input || {};
    if (!command) throw new ChatError('invalid_slash', 'command required');
    const norm = String(command).toLowerCase().replace(/^\//, '');
    const handler = this.slashRegistry.get(norm);
    if (!handler) {
      throw new ChatError('unknown_slash', `/${norm} is not registered`);
    }
    const ctx = Object.assign({}, context, { chat: this });
    const out = handler(Array.isArray(args) ? args : [args], ctx);
    this._audit({ type: 'slash.invoke', command: norm, userId: context.userId || null });
    return { command: norm, result: out };
  }

  _installDefaultSlashCommands() {
    // /me — post an "action" style message
    this.registerSlashCommand('me', (args, ctx) => {
      const text = `*${args.join(' ')}*`;
      return this.sendMessage({
        channelId: ctx.channelId, userId: ctx.userId, text,
      });
    });
    // /shrug — Unicode shrug
    this.registerSlashCommand('shrug', (args, ctx) => {
      const text = (args.join(' ') + ' ' + '\u00AF\\_(\u30C4)_/\u00AF').trim();
      return this.sendMessage({
        channelId: ctx.channelId, userId: ctx.userId, text,
      });
    });
    // /dnd — set presence to do-not-disturb
    this.registerSlashCommand('dnd', (_args, ctx) => {
      return this.presence({ userId: ctx.userId, status: 'dnd' });
    });
    // /away — set presence to away
    this.registerSlashCommand('away', (_args, ctx) => {
      return this.presence({ userId: ctx.userId, status: 'away' });
    });
    // /active — set presence to active
    this.registerSlashCommand('active', (_args, ctx) => {
      return this.presence({ userId: ctx.userId, status: 'active' });
    });
    // /invite @user — add a user to the current channel
    this.registerSlashCommand('invite', (args, ctx) => {
      const target = (args[0] || '').replace(/^@/, '');
      return this.joinChannel({
        channelId: ctx.channelId, userId: target, invitedBy: ctx.userId,
      });
    });
    // /leave — leave the current channel
    this.registerSlashCommand('leave', (_args, ctx) => {
      return this.leaveChannel({ channelId: ctx.channelId, userId: ctx.userId });
    });
    // /search <query> — run a channel-scoped search
    this.registerSlashCommand('search', (args, ctx) => {
      return this.searchMessages({
        query: args.join(' '), channelId: ctx.channelId,
      });
    });
    // /pin <messageId> — pin a message
    this.registerSlashCommand('pin', (args, ctx) => {
      return this.pinMessage({ messageId: args[0], userId: ctx.userId });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.7 File upload (metadata store — bytes live wherever the caller puts
  // them, the chat keeps file descriptors in its audit chain).
  // ─────────────────────────────────────────────────────────────────

  /**
   * fileUpload({channelId, file, userId})
   * `file` = { name, mime, size, url?, checksum? }
   * Returns a file record with a generated fileId. The caller is expected
   * to have placed the blob at `file.url` already — the chat only tracks
   * metadata.
   */
  fileUpload(input) {
    const { channelId, file, userId = null } = input || {};
    const ch = this._requireChannel(channelId);
    if (!file || !file.name) throw new ChatError('invalid_file', 'file metadata required');
    const fileId = _newId('file');
    const record = {
      fileId,
      channelId,
      uploadedBy: userId,
      name:       String(file.name),
      mime:       String(file.mime || 'application/octet-stream'),
      size:       Number(file.size || 0),
      url:        file.url || null,
      checksum:   file.checksum || null,
      createdAt:  this.clock(),
    };
    this.files.set(fileId, record);
    ch.updatedAt = this.clock();
    this._audit({ type: 'file.upload', fileId, channelId, userId, name: record.name, size: record.size });
    this._emit('file.upload', record);
    return { ...record };
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.8 Compliance export
  // ─────────────────────────────────────────────────────────────────

  /**
   * export({channelId, period, format})
   * Emits a compliance-grade dump for a channel in json or csv. Deleted
   * messages are INCLUDED and labelled `deleted=true` — the rule is
   * "לא מוחקים רק משדרגים ומגדלים". Nothing is stripped.
   *
   * `period` = { from, to } in ms; both optional.
   * `format` = 'json' (default) | 'csv' | 'ndjson'
   */
  export(input) {
    const { channelId, period = null, format = 'json' } = input || {};
    const ch = this._requireChannel(channelId);
    const ids = this.channelMessages.get(channelId) || [];
    const from = period && period.from;
    const to   = period && period.to;

    const rows = [];
    for (const id of ids) {
      const m = this.messages.get(id);
      if (!m) continue;
      if (from && m.createdAt < from) continue;
      if (to   && m.createdAt > to)   continue;
      rows.push({
        messageId:    m.id,
        channelId:    m.channelId,
        channelName:  ch.name,
        userId:       m.userId,
        text:         m.text,
        mentions:     m.mentions.slice(),
        replyTo:      m.replyTo,
        threadRootId: m.threadRootId,
        pinned:       m.pinned,
        deleted:      m.deleted,
        deleteReason: m.deleteReason || null,
        deletedAt:    m.deletedAt || null,
        deletedBy:    m.deletedBy || null,
        editCount:    m.editHistory.length,
        editHistory:  m.editHistory.slice(),
        createdAt:    m.createdAt,
        updatedAt:    m.updatedAt,
      });
    }

    this._audit({ type: 'export', channelId, format, rowCount: rows.length });

    if (format === 'json') {
      return {
        channel:      this._snapshotChannel(ch),
        exportedAt:   this.clock(),
        rowCount:     rows.length,
        messages:     rows,
      };
    }
    if (format === 'ndjson') {
      return rows.map(r => JSON.stringify(r)).join('\n');
    }
    if (format === 'csv') {
      const header = [
        'messageId', 'channelId', 'channelName', 'userId', 'createdAt',
        'updatedAt', 'pinned', 'deleted', 'deletedAt', 'deletedBy',
        'deleteReason', 'editCount', 'replyTo', 'threadRootId', 'mentions',
        'text',
      ];
      const esc = (v) => {
        if (v == null) return '';
        const s = Array.isArray(v) ? v.join('|') : String(v);
        return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
      };
      const lines = [header.join(',')];
      for (const r of rows) lines.push(header.map(k => esc(r[k])).join(','));
      return lines.join('\n');
    }
    throw new ChatError('invalid_format', `unknown export format: ${format}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.9 Realtime bridge
  // ─────────────────────────────────────────────────────────────────

  /**
   * realtimeUpdates() — returns a bridge object compatible with the X-13
   * SSE hub. If `options.sseHub` was provided at construction time, chat
   * events are relayed via `sseHub.publish('alerts', ...)`. Either way the
   * returned object exposes `.subscribe(handler)` for in-process listeners.
   */
  realtimeUpdates() {
    if (this._realtime) return this._realtime;
    const listeners = new Set();
    const bridge = {
      channel: 'internal_chat',
      subscribe(fn) {
        if (typeof fn !== 'function') throw new ChatError('invalid_listener', 'listener must be a function');
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      _emit: (type, payload) => {
        for (const l of listeners) {
          try { l({ type, payload, at: this.clock() }); } catch (_e) { /* ignore */ }
        }
      },
      stats: () => ({ listeners: listeners.size }),
    };
    this._realtime = bridge;
    return bridge;
  }

  /**
   * Internal — emit a chat event to both the in-process bridge and the
   * optional X-13 SSE hub.
   */
  _emit(type, payload) {
    if (this._realtime) {
      try { this._realtime._emit(type, payload); } catch (_e) { /* ignore */ }
    }
    if (this.sseHub && typeof this.sseHub.publish === 'function') {
      try {
        this.sseHub.publish('alerts', { type: `chat.${type}`, payload });
      } catch (_e) { /* ignore */ }
    }
    if (this.logger && typeof this.logger.info === 'function') {
      try { this.logger.info('chat_event', { type }); } catch (_e) { /* ignore */ }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 5.10 Helpers / validation
  // ─────────────────────────────────────────────────────────────────

  _requireChannel(channelId) {
    const ch = this.channels.get(channelId);
    if (!ch) throw new ChatError('channel_not_found', `channel ${channelId} not found`);
    if (ch.archived) throw new ChatError('channel_archived', 'channel is archived');
    return ch;
  }

  _requireMessage(messageId) {
    const m = this.messages.get(messageId);
    if (!m) throw new ChatError('message_not_found', `message ${messageId} not found`);
    return m;
  }

  _userCanPostInChannel(ch, userId) {
    if (ch.kind === 'channel' && ch.visibility === 'public') {
      // Public channels: auto-join on first post so the user becomes a member.
      if (!ch.members.includes(userId)) {
        ch.members = ch.members.concat([userId]);
        this._linkUserChannel(userId, ch.id);
      }
      return true;
    }
    return ch.members.includes(userId);
  }

  _indexTokens(messageId, tokens) {
    for (const t of tokens) {
      let s = this.tokenIndex.get(t);
      if (!s) { s = new Set(); this.tokenIndex.set(t, s); }
      s.add(messageId);
    }
  }
  _unindexTokens(messageId, tokens) {
    for (const t of tokens) {
      const s = this.tokenIndex.get(t);
      if (!s) continue;
      s.delete(messageId);
      if (s.size === 0) this.tokenIndex.delete(t);
    }
  }

  _audit(entry) {
    this.auditLog.push(Object.freeze({ ...entry, at: this.clock() }));
  }

  _snapshotChannel(ch) {
    return {
      id:           ch.id,
      kind:         ch.kind,
      name:         ch.name,
      description:  ch.description,
      visibility:   ch.visibility,
      members:      ch.members.slice(),
      owners:       ch.owners.slice(),
      createdAt:    ch.createdAt,
      updatedAt:    ch.updatedAt,
      archived:     ch.archived,
      messageCount: ch.messageCount,
    };
  }

  _snapshotMessage(msg, ch) {
    const reactions = {};
    for (const e of Object.keys(msg.reactions || {})) {
      reactions[e] = Array.from(msg.reactions[e] || []);
    }
    return {
      messageId:        msg.id,
      channelId:        msg.channelId,
      channelName:      ch ? ch.name : null,
      userId:           msg.userId,
      text:             msg.text,
      mentions:         msg.mentions.slice(),
      attachments:      msg.attachments.slice(),
      replyTo:          msg.replyTo,
      threadRootId:     msg.threadRootId,
      threadReplyCount: msg.threadReplyCount,
      reactions,
      pinned:           msg.pinned,
      deleted:          msg.deleted,
      deleteReason:     msg.deleteReason,
      deletedAt:        msg.deletedAt || null,
      deletedBy:        msg.deletedBy || null,
      editCount:        msg.editHistory.length,
      editHistory:      msg.editHistory.slice(),
      encrypted:        !!msg.encrypted,
      createdAt:        msg.createdAt,
      updatedAt:        msg.updatedAt,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  InternalChat,
  ChatError,
  // Exposed for tests and downstream tokenization reuse:
  tokenize,
  extractMentions,
  _xorCipher,
  _xorDecipher,
};
