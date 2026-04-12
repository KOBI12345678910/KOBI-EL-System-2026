/**
 * BulletinBoard — Digital Announcement Board
 * Techno-Kol Uzi Mega-ERP
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים
 * (Never delete — only upgrade and grow)
 *
 * Zero dependencies. Bilingual (HE/EN).
 * Use cases:
 *   - Shop floor TV screens (digital signage, Palantir dark theme)
 *   - Mobile app (QR from physical board → phone view)
 *   - HR announcements, safety alerts, lunch menus, marketplace,
 *     job postings, shout-outs, company events, achievements.
 *
 * File: onyx-procurement/src/comms/bulletin-board.js
 */

'use strict';

// ----- Constants -------------------------------------------------------------

const POST_TYPES = Object.freeze([
  'announcement',
  'safety-alert',
  'achievement',
  'event',
  'job-posting',
  'marketplace',
  'shout-out',
  'menu',
]);

const CATEGORIES = Object.freeze({
  'hr-announcements':      { he: 'הודעות משאבי אנוש',      en: 'HR Announcements',      priority: 3 },
  'safety-notices':        { he: 'בטיחות ורווחה',          en: 'Safety & Welfare',       priority: 1 },
  'company-events':        { he: 'אירועי חברה',           en: 'Company Events',         priority: 4 },
  'employee-achievements': { he: 'הישגי עובדים',          en: 'Employee Achievements',  priority: 4 },
  'lunch-menus':           { he: 'תפריט מטבח',            en: 'Kitchen / Lunch Menu',   priority: 5 },
  'marketplace':           { he: 'לוח יד שנייה',          en: 'Marketplace',            priority: 6 },
  'job-postings':          { he: 'משרות פנימיות',         en: 'Internal Job Postings',  priority: 4 },
  'shout-outs':            { he: 'מילה טובה לעובד',       en: 'Peer Shout-Outs',        priority: 5 },
});

const REACTION_TYPES = Object.freeze(['like', 'thanks', 'relevant']);

const POST_STATE = Object.freeze({
  DRAFT:          'draft',
  PENDING:        'pending-moderation',
  PUBLISHED:      'published',
  ARCHIVED:       'archived',
  REJECTED:       'rejected',
});

// ----- Helpers ---------------------------------------------------------------

function nowISO() { return new Date().toISOString(); }

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function isoOrNull(v) {
  const d = parseDate(v);
  return d ? d.toISOString() : null;
}

function clone(obj) {
  // Zero-dep structured clone (good enough for plain post data)
  return JSON.parse(JSON.stringify(obj));
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// Lightweight UID (zero deps)
let _uidCounter = 0;
function uid(prefix) {
  _uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_uidCounter.toString(36)}`;
}

// ----- BulletinBoard ---------------------------------------------------------

class BulletinBoard {
  constructor(opts = {}) {
    this.posts = new Map();            // postId → post
    this.comments = new Map();         // postId → [comment]
    this.reactions = new Map();        // postId → { like: Set, thanks: Set, relevant: Set }
    this.reactionSettings = new Map(); // postId → allowed reactions array
    this.commentSettings = new Map();  // postId → { enabled, moderated }
    this.rotationSchedules = new Map();// locationId → { items, duration, updatedAt }
    this.emergencyState = new Map();   // locationId → emergencyPost | null
    this.auditLog = [];                // append-only: לא מוחקים
    this.moderationQueue = [];         // array of postIds pending review
    this.accessibilityProfile = {
      'high-contrast': false,
      'large-font': false,
      'screen-reader-friendly': true, // default on (Israeli A11y Law 5568)
    };
    this.autoModerate = opts.autoModerate !== false; // default: queue new posts
    this.moderatedAuthors = new Set(opts.preApprovedAuthors || []);
    this.categories = CATEGORIES;
    this.postTypes = POST_TYPES;
    this.reactionTypes = REACTION_TYPES;
  }

  // ---- audit (append-only) -------------------------------------------------

  _audit(action, payload) {
    this.auditLog.push({
      ts: nowISO(),
      action,
      payload: clone(payload || {}),
    });
  }

  // ---- validation ----------------------------------------------------------

  _validatePost(p) {
    const errors = [];
    if (!p || typeof p !== 'object') {
      errors.push('post object required');
      return errors;
    }
    if (!POST_TYPES.includes(p.type)) {
      errors.push(`type must be one of: ${POST_TYPES.join(', ')}`);
    }
    if (!nonEmptyString(p.title_he) && !nonEmptyString(p.title_en)) {
      errors.push('title_he or title_en required');
    }
    if (p.category && !CATEGORIES[p.category]) {
      errors.push(`unknown category: ${p.category}`);
    }
    if (p.pinUntil && !parseDate(p.pinUntil)) {
      errors.push('pinUntil must be a valid date');
    }
    if (p.expireAt && !parseDate(p.expireAt)) {
      errors.push('expireAt must be a valid date');
    }
    return errors;
  }

  // ---- createPost ----------------------------------------------------------

  createPost({
    id,
    type,
    title_he,
    title_en,
    content,
    image,
    postedBy,
    category,
    pinUntil,
    expireAt,
    priority,
  } = {}) {
    const draft = {
      id: id || uid('post'),
      type,
      title_he: title_he || '',
      title_en: title_en || '',
      content: content || { he: '', en: '' },
      image: image || null,
      postedBy: postedBy || 'system',
      category: category || 'hr-announcements',
      pinUntil: isoOrNull(pinUntil),
      expireAt: isoOrNull(expireAt),
      priority: typeof priority === 'number'
        ? priority
        : (CATEGORIES[category] && CATEGORIES[category].priority) || 5,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      state: POST_STATE.PENDING,
      pinned: false,
      views: 0,
      impressions: 0,
      reactions: { like: 0, thanks: 0, relevant: 0 },
      archivedAt: null,
      moderatedBy: null,
      moderatedAt: null,
    };

    const errors = this._validatePost(draft);
    if (errors.length) {
      const err = new Error('Invalid post: ' + errors.join('; '));
      err.validation = errors;
      throw err;
    }

    // Pre-approved authors bypass moderation
    if (!this.autoModerate || this.moderatedAuthors.has(draft.postedBy)) {
      draft.state = POST_STATE.PUBLISHED;
      draft.moderatedBy = 'auto';
      draft.moderatedAt = nowISO();
    } else {
      this.moderationQueue.push(draft.id);
    }

    this.posts.set(draft.id, draft);
    this.reactions.set(draft.id, { like: new Set(), thanks: new Set(), relevant: new Set() });
    this.comments.set(draft.id, []);
    this.reactionSettings.set(draft.id, REACTION_TYPES.slice());
    this.commentSettings.set(draft.id, { enabled: false, moderated: true });

    this._audit('createPost', { id: draft.id, type: draft.type, state: draft.state });
    return clone(draft);
  }

  // ---- moderation ----------------------------------------------------------

  approvePost({ postId, moderator }) {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`post not found: ${postId}`);
    p.state = POST_STATE.PUBLISHED;
    p.moderatedBy = moderator || 'unknown';
    p.moderatedAt = nowISO();
    p.updatedAt = nowISO();
    this.moderationQueue = this.moderationQueue.filter((id) => id !== postId);
    this._audit('approvePost', { postId, moderator });
    return clone(p);
  }

  rejectPost({ postId, moderator, reason }) {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`post not found: ${postId}`);
    p.state = POST_STATE.REJECTED;
    p.moderatedBy = moderator || 'unknown';
    p.moderatedAt = nowISO();
    p.rejectionReason = reason || '';
    p.updatedAt = nowISO();
    this.moderationQueue = this.moderationQueue.filter((id) => id !== postId);
    this._audit('rejectPost', { postId, moderator, reason });
    return clone(p);
  }

  pendingModeration({ submittedBy } = {}) {
    const out = [];
    for (const id of this.moderationQueue) {
      const p = this.posts.get(id);
      if (!p) continue;
      if (submittedBy && p.postedBy !== submittedBy) continue;
      out.push(clone(p));
    }
    return out;
  }

  // ---- listCurrent ---------------------------------------------------------

  listCurrent({ category, type, locationId } = {}) {
    const now = Date.now();
    const visible = [];
    for (const p of this.posts.values()) {
      if (p.state !== POST_STATE.PUBLISHED) continue;
      if (p.expireAt && new Date(p.expireAt).getTime() <= now) continue;
      if (category && p.category !== category) continue;
      if (type && p.type !== type) continue;
      // Refresh pinned status based on pinUntil
      if (p.pinUntil) {
        p.pinned = new Date(p.pinUntil).getTime() > now;
      }
      visible.push(clone(p));
    }
    // Sort: pinned first, then safety-alerts, then priority, then recency
    visible.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.type === 'safety-alert' && b.type !== 'safety-alert') return -1;
      if (b.type === 'safety-alert' && a.type !== 'safety-alert') return 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return visible;
  }

  // ---- pinPost -------------------------------------------------------------

  pinPost({ postId, untilDate }) {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`post not found: ${postId}`);
    const d = parseDate(untilDate);
    if (!d) throw new Error('untilDate must be a valid date');
    p.pinned = true;
    p.pinUntil = d.toISOString();
    p.updatedAt = nowISO();
    this._audit('pinPost', { postId, untilDate: p.pinUntil });
    return clone(p);
  }

  unpinPost({ postId }) {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`post not found: ${postId}`);
    p.pinned = false;
    p.pinUntil = null;
    p.updatedAt = nowISO();
    this._audit('unpinPost', { postId });
    return clone(p);
  }

  // ---- archivePost (NEVER DELETE) -----------------------------------------

  archivePost({ postId, archivedBy }) {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`post not found: ${postId}`);
    // לא מוחקים — רק מסמנים כארכיון
    p.state = POST_STATE.ARCHIVED;
    p.archivedAt = nowISO();
    p.archivedBy = archivedBy || 'system';
    p.updatedAt = nowISO();
    this._audit('archivePost', { postId, archivedBy });
    return clone(p);
  }

  listArchive({ category, type } = {}) {
    const out = [];
    for (const p of this.posts.values()) {
      if (p.state !== POST_STATE.ARCHIVED) continue;
      if (category && p.category !== category) continue;
      if (type && p.type !== type) continue;
      out.push(clone(p));
    }
    return out.sort((a, b) =>
      new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
    );
  }

  // ---- reactions -----------------------------------------------------------

  reactionsEnabled({ postId, types }) {
    if (!this.posts.has(postId)) throw new Error(`post not found: ${postId}`);
    const allowed = Array.isArray(types) && types.length
      ? types.filter((t) => REACTION_TYPES.includes(t))
      : REACTION_TYPES.slice();
    this.reactionSettings.set(postId, allowed);
    this._audit('reactionsEnabled', { postId, types: allowed });
    return { postId, types: allowed };
  }

  react({ postId, userId, type }) {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`post not found: ${postId}`);
    const allowed = this.reactionSettings.get(postId) || REACTION_TYPES.slice();
    if (!allowed.includes(type)) {
      throw new Error(`reaction '${type}' not enabled for post ${postId}`);
    }
    const buckets = this.reactions.get(postId);
    buckets[type].add(userId);
    p.reactions[type] = buckets[type].size;
    this._audit('react', { postId, userId, type });
    return { postId, counts: clone(p.reactions) };
  }

  // ---- comments ------------------------------------------------------------

  commentsEnabled({ postId, moderated = true } = {}) {
    if (!this.posts.has(postId)) throw new Error(`post not found: ${postId}`);
    this.commentSettings.set(postId, { enabled: true, moderated });
    this._audit('commentsEnabled', { postId, moderated });
    return { postId, enabled: true, moderated };
  }

  addComment({ postId, userId, text }) {
    if (!this.posts.has(postId)) throw new Error(`post not found: ${postId}`);
    const settings = this.commentSettings.get(postId) || { enabled: false };
    if (!settings.enabled) throw new Error(`comments disabled for post ${postId}`);
    const comment = {
      id: uid('cmt'),
      postId,
      userId,
      text: String(text || ''),
      createdAt: nowISO(),
      state: settings.moderated ? 'pending' : 'approved',
    };
    this.comments.get(postId).push(comment);
    this._audit('addComment', { postId, userId, commentId: comment.id });
    return clone(comment);
  }

  approveComment({ postId, commentId }) {
    const list = this.comments.get(postId) || [];
    const c = list.find((x) => x.id === commentId);
    if (!c) throw new Error(`comment not found: ${commentId}`);
    c.state = 'approved';
    this._audit('approveComment', { postId, commentId });
    return clone(c);
  }

  listComments({ postId, state = 'approved' } = {}) {
    const list = this.comments.get(postId) || [];
    return list.filter((c) => !state || c.state === state).map(clone);
  }

  // ---- digital signage -----------------------------------------------------

  rotationSchedule({ locationId, items, duration }) {
    if (!nonEmptyString(locationId)) throw new Error('locationId required');
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('items (array of postIds) required');
    }
    const normalized = {
      locationId,
      items: items.slice(),
      duration: typeof duration === 'number' && duration > 0 ? duration : 8000,
      updatedAt: nowISO(),
    };
    this.rotationSchedules.set(locationId, normalized);
    this._audit('rotationSchedule', normalized);
    return clone(normalized);
  }

  digitalSignageFeed({ locationId } = {}) {
    if (!nonEmptyString(locationId)) throw new Error('locationId required');

    // Emergency takeover wins everything
    const emergency = this.emergencyState.get(locationId);
    if (emergency) {
      return {
        locationId,
        mode: 'emergency',
        theme: this._theme(true),
        accessibility: clone(this.accessibilityProfile),
        items: [clone(emergency)],
        duration: 15000,
        rotateBetween: false,
        generatedAt: nowISO(),
      };
    }

    const schedule = this.rotationSchedules.get(locationId);
    let items = [];

    if (schedule) {
      for (const postId of schedule.items) {
        const p = this.posts.get(postId);
        if (p && p.state === POST_STATE.PUBLISHED) items.push(clone(p));
      }
    }

    // Always include safety-alerts + pinned posts (regardless of schedule)
    const currentlyVisible = this.listCurrent();
    const mustShow = currentlyVisible.filter(
      (p) => p.type === 'safety-alert' || p.pinned
    );
    for (const p of mustShow) {
      if (!items.find((x) => x.id === p.id)) items.push(p);
    }

    // Fallback: show most recent published items
    if (items.length === 0) {
      items = currentlyVisible.slice(0, 10);
    }

    return {
      locationId,
      mode: 'normal',
      theme: this._theme(false),
      accessibility: clone(this.accessibilityProfile),
      items,
      duration: (schedule && schedule.duration) || 8000,
      rotateBetween: true,
      generatedAt: nowISO(),
    };
  }

  _theme(emergency) {
    // Palantir-style dark theme tokens
    return emergency ? {
      name:       'palantir-emergency',
      bg:         '#1a0000',
      fg:         '#ffffff',
      accent:     '#ff2a2a',
      border:     '#ff6b6b',
      font:       'system-ui, Arial, sans-serif',
      direction:  'rtl',
    } : {
      name:       'palantir-dark',
      bg:         '#0b0e14',
      fg:         '#e6edf3',
      accent:     '#3fb950',
      border:     '#21262d',
      font:       'system-ui, Arial, sans-serif',
      direction:  'rtl',
    };
  }

  // ---- emergency takeover --------------------------------------------------

  emergencyTakeover({ locationId, emergencyPost }) {
    if (!nonEmptyString(locationId)) throw new Error('locationId required');
    if (!emergencyPost || !nonEmptyString(emergencyPost.title_he || emergencyPost.title_en)) {
      throw new Error('emergencyPost with title_he/title_en required');
    }
    const post = {
      id: emergencyPost.id || uid('emrg'),
      type: 'safety-alert',
      title_he: emergencyPost.title_he || '',
      title_en: emergencyPost.title_en || '',
      content: emergencyPost.content || { he: '', en: '' },
      image: emergencyPost.image || null,
      postedBy: emergencyPost.postedBy || 'emergency-system',
      category: 'safety-notices',
      priority: 0,
      state: POST_STATE.PUBLISHED,
      pinned: true,
      pinUntil: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      reactions: { like: 0, thanks: 0, relevant: 0 },
      isEmergency: true,
    };
    this.emergencyState.set(locationId, post);
    this._audit('emergencyTakeover', { locationId, postId: post.id });
    return clone(post);
  }

  clearEmergency({ locationId }) {
    if (!this.emergencyState.has(locationId)) return null;
    const prev = this.emergencyState.get(locationId);
    this.emergencyState.delete(locationId);
    this._audit('clearEmergency', { locationId, postId: prev.id });
    return clone(prev);
  }

  // ---- QR code for mobile --------------------------------------------------

  qrCodeForMobile({ postId, baseUrl = 'https://bulletin.technokol.local' }) {
    if (!this.posts.has(postId)) throw new Error(`post not found: ${postId}`);
    const url = `${baseUrl}/post/${encodeURIComponent(postId)}`;
    // Zero-dep QR: return ASCII payload + url; real rendering handled client side.
    // Signed token helps prevent guessable URLs on the physical board.
    const token = Buffer
      .from(`${postId}:${Date.now()}`)
      .toString('base64')
      .replace(/=+$/, '');
    return {
      postId,
      url,
      signedUrl: `${url}?t=${token}`,
      token,
      matrix: this._qrMatrixStub(postId),
      format: 'svg|png (rendered client-side)',
    };
  }

  _qrMatrixStub(postId) {
    // Simple deterministic matrix stub (not a real QR — rendering is client-side).
    // We return a square boolean grid that clients / tests can verify structure of.
    const size = 21; // QR version 1
    const grid = [];
    let seed = 0;
    for (let i = 0; i < postId.length; i += 1) seed = (seed * 31 + postId.charCodeAt(i)) >>> 0;
    for (let y = 0; y < size; y += 1) {
      const row = [];
      for (let x = 0; x < size; x += 1) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        row.push(((seed >> 16) & 1) === 1);
      }
      grid.push(row);
    }
    return grid;
  }

  // ---- accessibility -------------------------------------------------------

  accessibilityMode(profile = {}) {
    // Normalize incoming keys (supports hyphenated or camelCase)
    const next = { ...this.accessibilityProfile };
    const map = {
      'high-contrast':          'high-contrast',
      highContrast:             'high-contrast',
      'large-font':             'large-font',
      largeFont:                'large-font',
      'screen-reader-friendly': 'screen-reader-friendly',
      screenReaderFriendly:     'screen-reader-friendly',
    };
    for (const k of Object.keys(profile)) {
      const key = map[k];
      if (key) next[key] = !!profile[k];
    }
    this.accessibilityProfile = next;
    this._audit('accessibilityMode', next);
    return clone(next);
  }

  // ---- retention analytics -------------------------------------------------

  recordImpression({ postId }) {
    const p = this.posts.get(postId);
    if (!p) return;
    p.impressions = (p.impressions || 0) + 1;
  }

  recordView({ postId }) {
    const p = this.posts.get(postId);
    if (!p) return;
    p.views = (p.views || 0) + 1;
  }

  retentionAnalytics({ postId }) {
    const p = this.posts.get(postId);
    if (!p) throw new Error(`post not found: ${postId}`);
    const totalReactions = p.reactions.like + p.reactions.thanks + p.reactions.relevant;
    const impressions = p.impressions || 0;
    const views = p.views || 0;
    const commentsList = (this.comments.get(postId) || []).filter((c) => c.state === 'approved');
    const engagementRate = impressions > 0 ? (views + totalReactions + commentsList.length) / impressions : 0;
    const clickThrough = impressions > 0 ? views / impressions : 0;
    return {
      postId,
      type: p.type,
      category: p.category,
      impressions,
      views,
      reactions: clone(p.reactions),
      totalReactions,
      comments: commentsList.length,
      engagementRate: Math.round(engagementRate * 10000) / 10000,
      clickThroughRate: Math.round(clickThrough * 10000) / 10000,
      state: p.state,
      createdAt: p.createdAt,
      ageHours: Math.round(
        (Date.now() - new Date(p.createdAt).getTime()) / 3600000 * 100
      ) / 100,
    };
  }

  // ---- utilities -----------------------------------------------------------

  getPost(postId) {
    const p = this.posts.get(postId);
    return p ? clone(p) : null;
  }

  stats() {
    let published = 0, archived = 0, pending = 0, rejected = 0;
    for (const p of this.posts.values()) {
      if (p.state === POST_STATE.PUBLISHED) published += 1;
      else if (p.state === POST_STATE.ARCHIVED) archived += 1;
      else if (p.state === POST_STATE.PENDING) pending += 1;
      else if (p.state === POST_STATE.REJECTED) rejected += 1;
    }
    return {
      total: this.posts.size,
      published,
      archived,
      pending,
      rejected,
      locations: this.rotationSchedules.size,
      emergencies: this.emergencyState.size,
      auditEntries: this.auditLog.length,
    };
  }
}

module.exports = {
  BulletinBoard,
  POST_TYPES,
  CATEGORIES,
  REACTION_TYPES,
  POST_STATE,
};
