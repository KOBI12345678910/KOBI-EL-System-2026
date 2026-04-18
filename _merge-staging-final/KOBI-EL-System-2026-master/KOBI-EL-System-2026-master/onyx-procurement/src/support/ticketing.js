/**
 * Customer Support Ticketing System — Backend Module
 * ─────────────────────────────────────────────────────
 * Agent X-21 — Swarm 3B — Techno-Kol Uzi mega-ERP
 *
 * Responsibilities:
 *   • Full ticket lifecycle: create → triage → assign → comment → resolve → close
 *   • SLA tracking with response- & resolution-deadlines, per-priority matrix
 *   • Pause SLA clock while ticket is in "waiting" (customer response) state
 *   • Internal/external comment threads with full audit history
 *   • Attachment references (not blobs — just URL/storage keys)
 *   • Tags (add/remove, case-insensitive, dedup)
 *   • Filters + pagination for list queries
 *   • Stats roll-up (total, by_status, by_priority, avg resolution hours)
 *   • SLA breach scanner → tickets whose response OR resolution deadline has passed
 *
 * Storage:
 *   • Default = in-memory Map-backed store (no deps)
 *   • Pluggable via `store` option → supply a Supabase-compatible adapter
 *     (.select / .insert / .update / .eq / .in) and the same class works
 *     over a remote table. A thin `SupabaseTicketAdapter` helper is exported
 *     below for convenience.
 *
 * RULES honoured:
 *   • never delete — closing ≠ destroying, archive flag only
 *   • Hebrew RTL bilingual — all enum labels exposed via `TICKET_LABELS_HE`
 *   • Palantir dark theme — visual concerns live in the React component,
 *                           but priority/severity colour tokens exported here
 *                           so UI + PDF exports stay consistent
 *   • zero deps — pure node, no npm installs required
 *
 * Run smoke demo:
 *   node -e "require('./src/support/ticketing').__smoke()"
 */

'use strict';

/* ================================================================== */
/*  Enums / constants                                                  */
/* ================================================================== */

const STATUS = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING: 'waiting',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
});

const STATUS_LIST = Object.freeze([
  STATUS.OPEN,
  STATUS.IN_PROGRESS,
  STATUS.WAITING,
  STATUS.RESOLVED,
  STATUS.CLOSED,
]);

const PRIORITY = Object.freeze({
  LOW: 'low',
  MED: 'med',
  HIGH: 'high',
  URGENT: 'urgent',
});

const PRIORITY_LIST = Object.freeze([
  PRIORITY.URGENT,
  PRIORITY.HIGH,
  PRIORITY.MED,
  PRIORITY.LOW,
]);

/**
 * SLA matrix — minutes.
 * First-response and full-resolution deadlines, per priority.
 * Pause-on-wait: SLA clock stops while status === "waiting".
 */
const SLA_RULES = Object.freeze({
  urgent: { responseMin: 2 * 60,   resolutionMin: 8 * 60 },        //  2h /  8h
  high:   { responseMin: 4 * 60,   resolutionMin: 24 * 60 },       //  4h / 24h
  med:    { responseMin: 8 * 60,   resolutionMin: 72 * 60 },       //  8h / 72h
  low:    { responseMin: 24 * 60,  resolutionMin: 7 * 24 * 60 },   // 24h /  7d
});

const PRIORITY_COLOURS = Object.freeze({
  urgent: '#ff5c5c',
  high:   '#ff9f43',
  med:    '#f5a623',
  low:    '#4a9eff',
});

const STATUS_COLOURS = Object.freeze({
  open:         '#4a9eff',
  in_progress:  '#3ddc84',
  waiting:      '#f5a623',
  resolved:     '#8b95a5',
  closed:       '#5a6472',
});

const TICKET_LABELS_HE = Object.freeze({
  status: {
    open:        'פתוח',
    in_progress: 'בטיפול',
    waiting:     'ממתין ללקוח',
    resolved:    'נפתר',
    closed:      'סגור',
  },
  priority: {
    urgent: 'דחוף',
    high:   'גבוה',
    med:    'בינוני',
    low:    'נמוך',
  },
  fields: {
    id:          'מזהה',
    client_id:   'לקוח',
    subject:     'נושא',
    description: 'תיאור',
    status:      'סטטוס',
    priority:    'עדיפות',
    category:    'קטגוריה',
    assignee:    'מטפל',
    sla_due:     'יעד SLA',
    created_at:  'נוצר בתאריך',
    updated_at:  'עודכן בתאריך',
    tags:        'תגיות',
    comments:    'הערות',
    attachments: 'קבצים מצורפים',
  },
  actions: {
    create:  'פתיחת פנייה',
    assign:  'שיוך',
    comment: 'הוספת הערה',
    resolve: 'סגירת טיפול',
    reopen:  'פתיחה מחדש',
  },
});

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

let __idSeq = 0;
function genId(prefix = 'tkt') {
  __idSeq += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${__idSeq.toString(36)}${rnd}`;
}

function nowISO(clock) {
  if (typeof clock === 'function') return new Date(clock()).toISOString();
  return new Date().toISOString();
}

function toMs(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function addMinutesISO(iso, minutes) {
  const t = toMs(iso);
  return new Date(t + minutes * 60 * 1000).toISOString();
}

function normalizeTag(tag) {
  if (tag == null) return '';
  return String(tag).trim().toLowerCase().replace(/\s+/g, '-');
}

function isValidStatus(s)   { return STATUS_LIST.includes(s); }
function isValidPriority(p) { return PRIORITY_LIST.includes(p); }

/* ================================================================== */
/*  InMemoryTicketStore                                                */
/* ================================================================== */

class InMemoryTicketStore {
  constructor() {
    this._tickets = new Map();
  }
  insert(ticket)        { this._tickets.set(ticket.id, ticket); return ticket; }
  get(id)               { return this._tickets.get(id) || null; }
  update(id, patch) {
    const cur = this._tickets.get(id);
    if (!cur) return null;
    const next = Object.assign({}, cur, patch);
    this._tickets.set(id, next);
    return next;
  }
  all()                 { return Array.from(this._tickets.values()); }
  size()                { return this._tickets.size; }
  clear()               { this._tickets.clear(); }
}

/* ================================================================== */
/*  TicketingService                                                   */
/* ================================================================== */

class TicketingService {
  /**
   * @param {object} [opts]
   * @param {object} [opts.store]  Pluggable store; defaults to in-memory.
   *                               Must expose: insert / get / update / all.
   * @param {Function} [opts.clock]  Optional clock for deterministic tests,
   *                                 returns ms or Date.
   * @param {Function} [opts.idGen]  Optional id generator for deterministic tests.
   * @param {Function} [opts.onEvent]  Optional listener (evt,payload) — audit bus.
   */
  constructor(opts = {}) {
    this.store  = opts.store  || new InMemoryTicketStore();
    this.clock  = opts.clock  || (() => Date.now());
    this.idGen  = opts.idGen  || genId;
    this.onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : null;
  }

  _now() {
    const v = this.clock();
    if (v instanceof Date) return v.toISOString();
    return new Date(v).toISOString();
  }

  _emit(evt, payload) {
    if (!this.onEvent) return;
    try { this.onEvent(evt, payload); } catch (_) { /* fail-open */ }
  }

  /* -------------------------------------------------------- */
  /*  createTicket                                            */
  /* -------------------------------------------------------- */
  createTicket(input = {}) {
    const {
      client_id,
      subject,
      description = '',
      priority = PRIORITY.MED,
      category = 'general',
      assignee = null,
      tags = [],
      attachments = [],
      created_by = 'system',
    } = input;

    if (!client_id)          throw new Error('ticketing.createTicket: client_id required');
    if (!subject || !String(subject).trim())
                             throw new Error('ticketing.createTicket: subject required');
    if (!isValidPriority(priority))
                             throw new Error(`ticketing.createTicket: invalid priority "${priority}"`);

    const now = this._now();
    const rules = SLA_RULES[priority];
    const slaDue = {
      response_due:   addMinutesISO(now, rules.responseMin),
      resolution_due: addMinutesISO(now, rules.resolutionMin),
      paused_ms:      0,
      paused_since:   null,
      first_response_at: null,
      resolved_at:       null,
    };

    const ticket = {
      id:          this.idGen('tkt'),
      client_id:   String(client_id),
      subject:     String(subject).trim(),
      description: String(description || ''),
      status:      STATUS.OPEN,
      priority,
      category:    String(category || 'general'),
      assignee:    assignee ? String(assignee) : null,
      sla_due:     slaDue,
      created_at:  now,
      updated_at:  now,
      created_by:  String(created_by || 'system'),
      tags:        [...new Set((tags || []).map(normalizeTag).filter(Boolean))],
      comments:    [],
      attachments: (attachments || []).map((a) => ({
        id:       this.idGen('att'),
        name:     String(a.name || 'file'),
        ref:      String(a.ref || a.url || ''),
        mime:     String(a.mime || 'application/octet-stream'),
        size:     Number(a.size || 0),
        added_at: now,
        added_by: String(created_by || 'system'),
      })),
      history: [
        {
          at:     now,
          by:     String(created_by || 'system'),
          action: 'created',
          note:   `ticket opened with priority ${priority}`,
        },
      ],
      archived: false,
    };

    this.store.insert(ticket);
    this._emit('ticket.created', { id: ticket.id, priority, client_id });
    return ticket;
  }

  /* -------------------------------------------------------- */
  /*  getTicket                                               */
  /* -------------------------------------------------------- */
  getTicket(id) {
    if (!id) return null;
    return this.store.get(id);
  }

  /* -------------------------------------------------------- */
  /*  listTickets                                             */
  /* -------------------------------------------------------- */
  listTickets(filters = {}) {
    const {
      status,
      priority,
      client_id,
      assignee,
      category,
      tag,
      search,
      include_archived = false,
      from,
      to,
      sort = 'created_at:desc',
      page = 1,
      limit = 25,
    } = filters;

    let rows = this.store.all();

    if (!include_archived) rows = rows.filter((r) => !r.archived);
    if (status) {
      const set = Array.isArray(status) ? new Set(status) : new Set([status]);
      rows = rows.filter((r) => set.has(r.status));
    }
    if (priority) {
      const set = Array.isArray(priority) ? new Set(priority) : new Set([priority]);
      rows = rows.filter((r) => set.has(r.priority));
    }
    if (client_id) rows = rows.filter((r) => r.client_id === String(client_id));
    if (assignee)  rows = rows.filter((r) => r.assignee === String(assignee));
    if (category)  rows = rows.filter((r) => r.category === String(category));
    if (tag) {
      const needle = normalizeTag(tag);
      rows = rows.filter((r) => r.tags.includes(needle));
    }
    if (from) {
      const fm = toMs(from);
      rows = rows.filter((r) => toMs(r.created_at) >= fm);
    }
    if (to) {
      const tm = toMs(to);
      rows = rows.filter((r) => toMs(r.created_at) <= tm);
    }
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      rows = rows.filter((r) => {
        if (r.subject && r.subject.toLowerCase().includes(q)) return true;
        if (r.description && r.description.toLowerCase().includes(q)) return true;
        if (r.id && r.id.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    // sorting
    const [sortKey, sortDirRaw] = String(sort).split(':');
    const dir = (sortDirRaw || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'priority') {
        const rank = { urgent: 4, high: 3, med: 2, low: 1 };
        av = rank[a.priority] || 0;
        bv = rank[b.priority] || 0;
      }
      if (typeof av === 'string' && /_at$/.test(sortKey)) {
        av = toMs(av); bv = toMs(bv);
      }
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return  1 * dir;
      return 0;
    });

    const total = rows.length;
    const pg    = Math.max(1, Number(page) || 1);
    const lim   = Math.max(1, Math.min(200, Number(limit) || 25));
    const start = (pg - 1) * lim;
    const items = rows.slice(start, start + lim);

    return {
      items,
      total,
      page: pg,
      limit: lim,
      pages: Math.max(1, Math.ceil(total / lim)),
    };
  }

  /* -------------------------------------------------------- */
  /*  updateStatus  (with SLA pause/resume)                   */
  /* -------------------------------------------------------- */
  updateStatus(id, status, userId = 'system', note = '') {
    if (!isValidStatus(status)) {
      throw new Error(`ticketing.updateStatus: invalid status "${status}"`);
    }
    const cur = this.store.get(id);
    if (!cur) return null;

    const now = this._now();
    const nowMs = toMs(now);
    const prevStatus = cur.status;
    const sla = Object.assign({}, cur.sla_due);

    // Pause/resume SLA clock when entering/leaving "waiting".
    if (prevStatus !== STATUS.WAITING && status === STATUS.WAITING) {
      sla.paused_since = now;
    }
    if (prevStatus === STATUS.WAITING && status !== STATUS.WAITING && sla.paused_since) {
      const pausedFor = nowMs - toMs(sla.paused_since);
      if (pausedFor > 0) {
        sla.paused_ms = (sla.paused_ms || 0) + pausedFor;
        sla.response_due   = new Date(toMs(sla.response_due)   + pausedFor).toISOString();
        sla.resolution_due = new Date(toMs(sla.resolution_due) + pausedFor).toISOString();
      }
      sla.paused_since = null;
    }

    if (status === STATUS.RESOLVED && !sla.resolved_at) {
      sla.resolved_at = now;
    }
    // first transition out of "open" counts as first response
    if (prevStatus === STATUS.OPEN && status !== STATUS.OPEN && !sla.first_response_at) {
      sla.first_response_at = now;
    }

    const patch = {
      status,
      sla_due: sla,
      updated_at: now,
      history: cur.history.concat([{
        at: now,
        by: String(userId || 'system'),
        action: 'status',
        note: note || `${prevStatus} → ${status}`,
      }]),
    };
    const next = this.store.update(id, patch);
    this._emit('ticket.status_changed', { id, from: prevStatus, to: status });
    return next;
  }

  /* -------------------------------------------------------- */
  /*  assign                                                  */
  /* -------------------------------------------------------- */
  assign(id, assigneeId, userId = 'system') {
    const cur = this.store.get(id);
    if (!cur) return null;
    const now = this._now();
    const patch = {
      assignee: assigneeId ? String(assigneeId) : null,
      updated_at: now,
      history: cur.history.concat([{
        at: now,
        by: String(userId || 'system'),
        action: 'assign',
        note: assigneeId ? `assigned → ${assigneeId}` : 'unassigned',
      }]),
    };
    const next = this.store.update(id, patch);
    this._emit('ticket.assigned', { id, assignee: assigneeId });
    return next;
  }

  /* -------------------------------------------------------- */
  /*  addComment                                              */
  /* -------------------------------------------------------- */
  addComment(id, comment, isInternal = false) {
    const cur = this.store.get(id);
    if (!cur) return null;
    if (comment == null || typeof comment !== 'object') {
      throw new Error('ticketing.addComment: comment must be an object');
    }
    const body = String(comment.body || comment.text || '').trim();
    if (!body) throw new Error('ticketing.addComment: comment body required');
    const author = String(comment.author || comment.by || 'system');

    const now   = this._now();
    const nowMs = toMs(now);

    const entry = {
      id:       this.idGen('cmt'),
      author,
      at:       now,
      body,
      internal: Boolean(isInternal),
      attachments: (comment.attachments || []).map((a) => ({
        id:   this.idGen('att'),
        name: String(a.name || 'file'),
        ref:  String(a.ref || a.url || ''),
        mime: String(a.mime || 'application/octet-stream'),
        size: Number(a.size || 0),
      })),
    };

    // SLA book-keeping (we do everything in-line here to avoid double writes).
    const sla = Object.assign({}, cur.sla_due);

    // First-response credit: first public (non-internal) comment from someone
    // who is NOT the client counts as the first response.
    if (!sla.first_response_at && !isInternal && author !== cur.client_id) {
      sla.first_response_at = now;
    }

    // Auto-resume: if customer (client author) replies while ticket is waiting
    // → flip to in_progress + resume SLA clock.
    let nextStatus = cur.status;
    const isClientReply = !isInternal && author === cur.client_id;
    if (isClientReply && cur.status === STATUS.WAITING) {
      nextStatus = STATUS.IN_PROGRESS;
      if (sla.paused_since) {
        const pausedFor = nowMs - toMs(sla.paused_since);
        if (pausedFor > 0) {
          sla.paused_ms = (sla.paused_ms || 0) + pausedFor;
          sla.response_due   = new Date(toMs(sla.response_due)   + pausedFor).toISOString();
          sla.resolution_due = new Date(toMs(sla.resolution_due) + pausedFor).toISOString();
        }
        sla.paused_since = null;
      }
    }

    const history = cur.history.concat([{
      at: now,
      by: author,
      action: 'comment',
      note: (isInternal ? '[internal] ' : '') + (body.length > 80 ? body.slice(0, 80) + '…' : body),
    }]);

    if (nextStatus !== cur.status) {
      history.push({
        at: now,
        by: author,
        action: 'status',
        note: `${cur.status} → ${nextStatus} (auto-resume: customer replied)`,
      });
    }

    const patch = {
      comments:   cur.comments.concat([entry]),
      status:     nextStatus,
      sla_due:    sla,
      updated_at: now,
      history,
    };
    const next = this.store.update(id, patch);
    this._emit('ticket.comment_added', { id, comment_id: entry.id, internal: isInternal });
    if (nextStatus !== cur.status) {
      this._emit('ticket.status_changed', { id, from: cur.status, to: nextStatus });
    }
    return next;
  }

  /* -------------------------------------------------------- */
  /*  addTag / removeTag                                      */
  /* -------------------------------------------------------- */
  addTag(id, tag, userId = 'system') {
    const cur = this.store.get(id);
    if (!cur) return null;
    const t = normalizeTag(tag);
    if (!t) return cur;
    if (cur.tags.includes(t)) return cur;
    const now = this._now();
    const next = this.store.update(id, {
      tags: cur.tags.concat([t]),
      updated_at: now,
      history: cur.history.concat([{ at: now, by: userId, action: 'tag_add', note: t }]),
    });
    this._emit('ticket.tag_added', { id, tag: t });
    return next;
  }

  removeTag(id, tag, userId = 'system') {
    const cur = this.store.get(id);
    if (!cur) return null;
    const t = normalizeTag(tag);
    if (!cur.tags.includes(t)) return cur;
    const now = this._now();
    const next = this.store.update(id, {
      tags: cur.tags.filter((x) => x !== t),
      updated_at: now,
      history: cur.history.concat([{ at: now, by: userId, action: 'tag_remove', note: t }]),
    });
    this._emit('ticket.tag_removed', { id, tag: t });
    return next;
  }

  /* -------------------------------------------------------- */
  /*  addAttachment                                           */
  /* -------------------------------------------------------- */
  addAttachment(id, attachment, userId = 'system') {
    const cur = this.store.get(id);
    if (!cur) return null;
    if (!attachment || typeof attachment !== 'object') {
      throw new Error('ticketing.addAttachment: attachment must be an object');
    }
    const now = this._now();
    const att = {
      id:       this.idGen('att'),
      name:     String(attachment.name || 'file'),
      ref:      String(attachment.ref || attachment.url || ''),
      mime:     String(attachment.mime || 'application/octet-stream'),
      size:     Number(attachment.size || 0),
      added_at: now,
      added_by: String(userId || 'system'),
    };
    const next = this.store.update(id, {
      attachments: cur.attachments.concat([att]),
      updated_at: now,
      history: cur.history.concat([{ at: now, by: userId, action: 'attach', note: att.name }]),
    });
    this._emit('ticket.attachment_added', { id, attachment_id: att.id });
    return next;
  }

  /* -------------------------------------------------------- */
  /*  archive (soft-only, never delete)                       */
  /* -------------------------------------------------------- */
  archive(id, userId = 'system') {
    const cur = this.store.get(id);
    if (!cur) return null;
    const now = this._now();
    return this.store.update(id, {
      archived: true,
      updated_at: now,
      history: cur.history.concat([{ at: now, by: userId, action: 'archive', note: 'soft-archived' }]),
    });
  }
  unarchive(id, userId = 'system') {
    const cur = this.store.get(id);
    if (!cur) return null;
    const now = this._now();
    return this.store.update(id, {
      archived: false,
      updated_at: now,
      history: cur.history.concat([{ at: now, by: userId, action: 'unarchive', note: '' }]),
    });
  }

  /* -------------------------------------------------------- */
  /*  SLA breach scanner                                      */
  /* -------------------------------------------------------- */
  getSlaBreach(asOf) {
    const cutoff = asOf ? toMs(asOf) : toMs(this._now());
    const breached = [];
    for (const t of this.store.all()) {
      if (t.archived) continue;
      if (t.status === STATUS.CLOSED) continue;
      if (t.status === STATUS.WAITING) continue; // paused — skip
      const sla = t.sla_due || {};
      const resDue = toMs(sla.response_due);
      const fixDue = toMs(sla.resolution_due);
      const missedResponse   = !sla.first_response_at && resDue && cutoff > resDue;
      const missedResolution = !sla.resolved_at && fixDue && cutoff > fixDue && t.status !== STATUS.RESOLVED;
      if (missedResponse || missedResolution) {
        breached.push({
          id:        t.id,
          client_id: t.client_id,
          subject:   t.subject,
          priority:  t.priority,
          status:    t.status,
          assignee:  t.assignee,
          missed:    {
            response:   Boolean(missedResponse),
            resolution: Boolean(missedResolution),
          },
          over_by_min: {
            response:   missedResponse   ? Math.round((cutoff - resDue) / 60000) : 0,
            resolution: missedResolution ? Math.round((cutoff - fixDue) / 60000) : 0,
          },
          sla_due: sla,
        });
      }
    }
    // urgent first
    breached.sort((a, b) => {
      const rank = { urgent: 4, high: 3, med: 2, low: 1 };
      return (rank[b.priority] || 0) - (rank[a.priority] || 0);
    });
    return breached;
  }

  /* -------------------------------------------------------- */
  /*  stats                                                   */
  /* -------------------------------------------------------- */
  stats(period = {}) {
    const { from, to } = period || {};
    const rows = this.store.all().filter((r) => {
      if (r.archived) return false;
      if (from && toMs(r.created_at) < toMs(from)) return false;
      if (to   && toMs(r.created_at) > toMs(to))   return false;
      return true;
    });

    const by_status = { open: 0, in_progress: 0, waiting: 0, resolved: 0, closed: 0 };
    const by_priority = { urgent: 0, high: 0, med: 0, low: 0 };
    let resolvedCount = 0;
    let sumResolutionMs = 0;

    for (const t of rows) {
      if (by_status[t.status] != null) by_status[t.status] += 1;
      if (by_priority[t.priority] != null) by_priority[t.priority] += 1;
      if (t.sla_due && t.sla_due.resolved_at) {
        const ms = toMs(t.sla_due.resolved_at) - toMs(t.created_at) - (t.sla_due.paused_ms || 0);
        if (ms > 0) {
          sumResolutionMs += ms;
          resolvedCount += 1;
        }
      }
    }

    const avgResolutionHours = resolvedCount > 0
      ? Math.round((sumResolutionMs / resolvedCount / 3600000) * 100) / 100
      : 0;

    const slaBreachCount = this.getSlaBreach().filter((b) => {
      if (from && toMs(b.sla_due.response_due) < toMs(from)) return false;
      if (to   && toMs(b.sla_due.response_due) > toMs(to))   return false;
      return true;
    }).length;

    return {
      total: rows.length,
      by_status,
      by_priority,
      avg_resolution_hours: avgResolutionHours,
      sla_breach_count: slaBreachCount,
      resolved_count: resolvedCount,
      period: { from: from || null, to: to || null },
    };
  }

  /* -------------------------------------------------------- */
  /*  bulk ops                                                */
  /* -------------------------------------------------------- */
  bulkAssign(ids, assigneeId, userId = 'system') {
    const out = [];
    for (const id of ids || []) {
      const t = this.assign(id, assigneeId, userId);
      if (t) out.push(t);
    }
    return out;
  }
  bulkUpdateStatus(ids, status, userId = 'system') {
    const out = [];
    for (const id of ids || []) {
      const t = this.updateStatus(id, status, userId);
      if (t) out.push(t);
    }
    return out;
  }
  bulkAddTag(ids, tag, userId = 'system') {
    const out = [];
    for (const id of ids || []) {
      const t = this.addTag(id, tag, userId);
      if (t) out.push(t);
    }
    return out;
  }
}

/* ================================================================== */
/*  SupabaseTicketAdapter — thin helper for pluggable storage         */
/* ================================================================== */

class SupabaseTicketAdapter {
  /**
   * @param {object} supabase  supabase-js client
   * @param {string} [table='support_tickets']
   */
  constructor(supabase, table = 'support_tickets') {
    if (!supabase) throw new Error('SupabaseTicketAdapter: supabase client required');
    this.supabase = supabase;
    this.table = table;
  }
  async insert(ticket) {
    const { data, error } = await this.supabase.from(this.table).insert(ticket).select().single();
    if (error) throw error;
    return data;
  }
  async get(id) {
    const { data, error } = await this.supabase.from(this.table).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  }
  async update(id, patch) {
    const { data, error } = await this.supabase.from(this.table).update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  async all() {
    const { data, error } = await this.supabase.from(this.table).select('*');
    if (error) throw error;
    return data || [];
  }
}

/* ================================================================== */
/*  Smoke demo                                                         */
/* ================================================================== */

function __smoke() {
  const svc = new TicketingService();
  const t = svc.createTicket({
    client_id: 'cli_001',
    subject:   'לא מצליח להתחבר לחשבון',
    description: 'דף ההתחברות זורק שגיאת 500',
    priority: PRIORITY.HIGH,
    category: 'auth',
  });
  svc.assign(t.id, 'agent_dan');
  svc.addComment(t.id, { body: 'בודק את הלוגים', author: 'agent_dan' });
  svc.updateStatus(t.id, STATUS.WAITING, 'agent_dan', 'awaiting customer logs');
  svc.addTag(t.id, 'auth-500');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(svc.stats(), null, 2));
}

/* ================================================================== */
/*  Exports                                                            */
/* ================================================================== */

module.exports = {
  TicketingService,
  InMemoryTicketStore,
  SupabaseTicketAdapter,
  STATUS,
  STATUS_LIST,
  PRIORITY,
  PRIORITY_LIST,
  SLA_RULES,
  PRIORITY_COLOURS,
  STATUS_COLOURS,
  TICKET_LABELS_HE,
  // helpers (exported for tests)
  normalizeTag,
  addMinutesISO,
  toMs,
  __smoke,
};
