/**
 * Polls / Quick-Surveys Engine — Agent Y-133
 * Techno-Kol Uzi Mega-ERP
 *
 * Rule: לא מוחקים רק משדרגים ומגדלים
 * (Never delete — only upgrade and grow)
 *
 * Zero dependencies. Bilingual (HE/EN). Hebrew RTL.
 *
 * Complements Y-134 deeper feedback. This module is the lightweight,
 * instant-poll flavour — five poll types, append-only vote log,
 * anonymous hashing, audience filters, discussion threads, ban/annotate
 * (never delete), JSON + CSV export, live snapshots.
 *
 * File: onyx-procurement/src/comms/polls.js
 */

'use strict';

// ----- Poll type catalogue ---------------------------------------------------

const POLL_TYPES = Object.freeze({
  'single-choice':   { he: 'בחירה יחידה',     en: 'Single choice',     allowMultiple: false, needsOptions: true  },
  'multiple-choice': { he: 'בחירה מרובה',     en: 'Multiple choice',   allowMultiple: true,  needsOptions: true  },
  'yes-no':          { he: 'כן / לא',          en: 'Yes / No',          allowMultiple: false, needsOptions: false },
  'rating':          { he: 'דירוג 1-5',        en: 'Rating 1-5',        allowMultiple: false, needsOptions: false },
  'emoji':           { he: 'תגובת אמוג׳י',    en: 'Emoji reaction',    allowMultiple: false, needsOptions: false },
});

const POLL_STATE = Object.freeze({
  DRAFT:   'draft',
  ACTIVE:  'active',
  CLOSED:  'closed',
  EXPIRED: 'expired',
});

const DEFAULT_YES_NO = Object.freeze([
  { id: 'yes', he: 'כן', en: 'Yes' },
  { id: 'no',  he: 'לא', en: 'No'  },
]);

const DEFAULT_RATING = Object.freeze([
  { id: '1', he: 'כוכב 1', en: '1 star'  },
  { id: '2', he: 'כוכב 2', en: '2 stars' },
  { id: '3', he: 'כוכב 3', en: '3 stars' },
  { id: '4', he: 'כוכב 4', en: '4 stars' },
  { id: '5', he: 'כוכב 5', en: '5 stars' },
]);

const DEFAULT_EMOJI = Object.freeze([
  { id: '👍', he: 'לייק',       en: 'Thumbs up' },
  { id: '❤', he: 'אהבה',        en: 'Love'      },
  { id: '😂', he: 'מצחיק',       en: 'Laugh'     },
  { id: '😮', he: 'מפתיע',       en: 'Wow'       },
  { id: '😢', he: 'עצוב',        en: 'Sad'       },
  { id: '👎', he: 'דיסלייק',     en: 'Thumbs down' },
]);

// ----- helpers ---------------------------------------------------------------

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
  return JSON.parse(JSON.stringify(obj));
}

function nonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

let _uidCounter = 0;
function uid(prefix) {
  _uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_uidCounter.toString(36)}`;
}

/**
 * Zero-dep deterministic hash (djb2 variant, base36-encoded).
 * Used for anonymising voter IDs when anonymous === true.
 * Not cryptographic — we simply need consistent, one-way-enough shadowing
 * for a light-weight poll engine; Y-134 handles strong feedback anonymity.
 */
function djb2Hash(input) {
  let hash = 5381;
  const s = String(input || '');
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i);
    hash = hash >>> 0; // force unsigned 32-bit
  }
  return hash.toString(36);
}

function anonymizeVoter(voterId, pollId) {
  // Salt with pollId so the same voter looks different across polls.
  return 'anon-' + djb2Hash(`${pollId}::${voterId}`);
}

function roundPct(n) {
  return Math.round(n * 10000) / 100; // two decimal places
}

// CSV escaping helper — RFC 4180 compliant, handles Hebrew, newlines, commas.
function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ----- normalise options -----------------------------------------------------

function normalizeOptions(type, userOptions) {
  if (type === 'yes-no')  return DEFAULT_YES_NO.map((o) => ({ ...o }));
  if (type === 'rating')  return DEFAULT_RATING.map((o) => ({ ...o }));
  if (type === 'emoji')   return DEFAULT_EMOJI.map((o) => ({ ...o }));
  if (!Array.isArray(userOptions) || userOptions.length < 2) {
    throw new Error(`poll type '${type}' requires an options array with at least 2 entries`);
  }
  return userOptions.map((o, i) => {
    if (typeof o === 'string') {
      return { id: `opt-${i + 1}`, he: o, en: o };
    }
    if (o && typeof o === 'object') {
      return {
        id: nonEmptyString(o.id) ? o.id : `opt-${i + 1}`,
        he: o.he || o.label || '',
        en: o.en || o.label || '',
      };
    }
    throw new Error(`invalid option at index ${i}`);
  });
}

// ----- Polls class -----------------------------------------------------------

class Polls {
  constructor(opts = {}) {
    this.polls      = new Map(); // pollId → poll object
    this.votes      = new Map(); // pollId → append-only array of vote entries
    this.voters     = new Map(); // pollId → Map<voterKey, latestVoteIdx>
    this.bans       = new Map(); // pollId → Set of banned voterKeys
    this.comments   = new Map(); // pollId → append-only array of comment entries
    this._history   = new Map(); // pollId → append-only audit log per poll
    this.globalLog  = [];         // global append-only audit
    this.pollTypes  = POLL_TYPES;
    this.pollStates = POLL_STATE;
    this.options = {
      defaultAudience: opts.defaultAudience || 'all',
    };
  }

  // ---- internal -----------------------------------------------------------

  _auditGlobal(action, payload) {
    this.globalLog.push({ ts: nowISO(), action, payload: clone(payload || {}) });
  }

  _auditPoll(pollId, action, payload) {
    if (!this._history.has(pollId)) this._history.set(pollId, []);
    this._history.get(pollId).push({ ts: nowISO(), action, payload: clone(payload || {}) });
    this._auditGlobal(action, Object.assign({ pollId }, payload || {}));
  }

  _getPoll(pollId) {
    const p = this.polls.get(pollId);
    if (!p) throw new Error(`poll not found: ${pollId}`);
    return p;
  }

  _voterKey(poll, voterId) {
    return poll.anonymous ? anonymizeVoter(voterId, poll.id) : String(voterId);
  }

  _refreshState(poll) {
    // Auto-expire an active poll whose closesAt has passed (never removes anything).
    if (poll.state === POLL_STATE.ACTIVE && poll.closesAt) {
      if (new Date(poll.closesAt).getTime() <= Date.now()) {
        poll.state = POLL_STATE.EXPIRED;
        poll.expiredAt = nowISO();
        this._auditPoll(poll.id, 'autoExpire', { closesAt: poll.closesAt });
      }
    }
    return poll;
  }

  // ---- createPoll ---------------------------------------------------------

  createPoll({
    id,
    question_he,
    question_en,
    type,
    options,
    audience,
    closesAt,
    allowMultiple,
    anonymous,
    createdBy,
    allowChange,
    allowComments,
  } = {}) {
    if (!POLL_TYPES[type]) {
      throw new Error(`type must be one of: ${Object.keys(POLL_TYPES).join(', ')}`);
    }
    if (!nonEmptyString(question_he) && !nonEmptyString(question_en)) {
      throw new Error('question_he or question_en required');
    }
    const normalizedOpts = normalizeOptions(type, options);

    // allowMultiple can only be true for types that permit it.
    const typeAllowsMulti = POLL_TYPES[type].allowMultiple;
    const effectiveMulti = !!allowMultiple && typeAllowsMulti;

    const poll = {
      id: id || uid('poll'),
      question_he: question_he || '',
      question_en: question_en || '',
      type,
      type_labels: { he: POLL_TYPES[type].he, en: POLL_TYPES[type].en },
      options: normalizedOpts,
      audience: Array.isArray(audience) && audience.length ? audience.slice() : [this.options.defaultAudience],
      audienceSize: null, // optional — voterParticipation falls back to unique voters
      closesAt: isoOrNull(closesAt),
      allowMultiple: effectiveMulti,
      anonymous: !!anonymous,
      allowChange: !!allowChange,      // if true, voter may re-cast (override)
      allowComments: allowComments !== false,
      createdBy: createdBy || 'system',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      state: POLL_STATE.ACTIVE,
      closedAt: null,
      closedReason: null,
      expiredAt: null,
    };

    if (this.polls.has(poll.id)) {
      throw new Error(`poll id already exists: ${poll.id}`);
    }

    this.polls.set(poll.id, poll);
    this.votes.set(poll.id, []);
    this.voters.set(poll.id, new Map());
    this.bans.set(poll.id, new Set());
    this.comments.set(poll.id, []);
    this._history.set(poll.id, []);

    this._auditPoll(poll.id, 'createPoll', {
      type, anonymous: poll.anonymous, allowMultiple: poll.allowMultiple,
    });

    return clone(poll);
  }

  // ---- setAudienceSize ----------------------------------------------------

  setAudienceSize(pollId, size) {
    const p = this._getPoll(pollId);
    if (!Number.isFinite(size) || size < 0) throw new Error('audience size must be >= 0');
    p.audienceSize = Math.floor(size);
    p.updatedAt = nowISO();
    this._auditPoll(pollId, 'setAudienceSize', { size: p.audienceSize });
    return clone(p);
  }

  // ---- castVote -----------------------------------------------------------

  castVote({ pollId, voterId, choices } = {}) {
    const poll = this._refreshState(this._getPoll(pollId));
    if (!nonEmptyString(voterId)) throw new Error('voterId required');

    if (poll.state !== POLL_STATE.ACTIVE) {
      throw new Error(`cannot vote — poll is ${poll.state}`);
    }

    // Normalise choices into an array
    let picks = Array.isArray(choices) ? choices.slice() : [choices];
    picks = picks.filter((c) => c !== undefined && c !== null && c !== '');
    if (picks.length === 0) throw new Error('at least one choice required');

    if (!poll.allowMultiple && picks.length > 1) {
      throw new Error('poll does not allow multiple selections');
    }

    // Validate every choice against poll options
    const validIds = new Set(poll.options.map((o) => o.id));
    const normalizedPicks = picks.map((c) => String(c));
    for (const c of normalizedPicks) {
      if (!validIds.has(c)) {
        throw new Error(`invalid choice '${c}' for poll ${pollId}`);
      }
    }
    // De-dupe within a single ballot
    const uniqPicks = Array.from(new Set(normalizedPicks));

    const voterKey = this._voterKey(poll, voterId);

    // Banned voters may never cast new votes
    if (this.bans.get(pollId).has(voterKey)) {
      throw new Error(`voter is banned from poll ${pollId}`);
    }

    const voterMap = this.voters.get(pollId);
    const log = this.votes.get(pollId);
    const alreadyVoted = voterMap.has(voterKey);

    if (alreadyVoted && !poll.allowChange) {
      throw new Error('voter has already cast a vote for this poll');
    }

    const entry = {
      idx: log.length, // append-only index
      voteId: uid('vote'),
      pollId,
      voterKey,                               // hashed if anonymous, else raw voterId
      voterIdRaw: poll.anonymous ? null : String(voterId),
      choices: uniqPicks,
      ts: nowISO(),
      status: 'counted',                      // 'counted' | 'superseded' | 'excluded'
      excludeReason: null,
      anonymous: poll.anonymous,
    };

    // If voter had a previous vote and re-voting is allowed, mark prior as superseded.
    if (alreadyVoted && poll.allowChange) {
      const prevIdx = voterMap.get(voterKey);
      const prev = log[prevIdx];
      if (prev && prev.status === 'counted') {
        prev.status = 'superseded';
        prev.supersededBy = entry.voteId;
        prev.supersededAt = nowISO();
      }
    }

    log.push(entry);
    voterMap.set(voterKey, entry.idx);

    this._auditPoll(pollId, 'castVote', {
      voteId: entry.voteId, voterKey, choices: entry.choices, anonymous: poll.anonymous,
    });

    return clone(entry);
  }

  // ---- results ------------------------------------------------------------

  results(pollId) {
    const poll = this._refreshState(this._getPoll(pollId));
    const log = this.votes.get(pollId);
    const counts = Object.create(null);
    for (const o of poll.options) counts[o.id] = 0;

    let totalBallots = 0;
    let totalPicks = 0;
    const uniqueVoters = new Set();

    for (const v of log) {
      if (v.status !== 'counted') continue;
      totalBallots += 1;
      uniqueVoters.add(v.voterKey);
      for (const c of v.choices) {
        if (counts[c] !== undefined) {
          counts[c] += 1;
          totalPicks += 1;
        }
      }
    }

    // Percentages are computed against totalPicks for multi-select
    // (so they sum to 100%), and against totalBallots otherwise.
    const pctBase = poll.allowMultiple ? totalPicks : totalBallots;

    const rows = poll.options.map((o) => {
      const count = counts[o.id] || 0;
      const pct = pctBase > 0 ? roundPct(count / pctBase) : 0;
      return {
        id: o.id,
        label: { he: o.he, en: o.en },
        count,
        pct,
      };
    });

    // Rating average (only meaningful for 'rating' polls)
    let ratingAverage = null;
    if (poll.type === 'rating' && totalBallots > 0) {
      let sum = 0;
      let n = 0;
      for (const v of log) {
        if (v.status !== 'counted') continue;
        for (const c of v.choices) {
          const num = parseInt(c, 10);
          if (Number.isFinite(num)) { sum += num; n += 1; }
        }
      }
      ratingAverage = n > 0 ? Math.round((sum / n) * 100) / 100 : null;
    }

    return {
      pollId,
      type: poll.type,
      state: poll.state,
      question: { he: poll.question_he, en: poll.question_en },
      options: rows,
      totalBallots,
      totalPicks,
      uniqueVoters: uniqueVoters.size,
      ratingAverage,
      generatedAt: nowISO(),
    };
  }

  // ---- liveResults --------------------------------------------------------

  liveResults(pollId) {
    // Streaming-friendly snapshot: small, flat, versioned.
    const base = this.results(pollId);
    const poll = this._getPoll(pollId);
    return {
      v: 1,
      pollId,
      state: base.state,
      closesAt: poll.closesAt,
      anonymous: poll.anonymous,
      totalBallots: base.totalBallots,
      uniqueVoters: base.uniqueVoters,
      ratingAverage: base.ratingAverage,
      options: base.options.map((o) => ({ id: o.id, label: o.label, count: o.count, pct: o.pct })),
      snapshotAt: nowISO(),
    };
  }

  // ---- closePoll ----------------------------------------------------------

  closePoll(pollId, reason) {
    const poll = this._getPoll(pollId);
    // לא מוחקים — רק הופכים סטייט ושומרים הכל.
    poll.state = POLL_STATE.CLOSED;
    poll.closedAt = nowISO();
    poll.closedReason = reason || '';
    poll.updatedAt = nowISO();
    this._auditPoll(pollId, 'closePoll', { reason: poll.closedReason });
    return clone(poll);
  }

  // ---- extendPoll ---------------------------------------------------------

  extendPoll(pollId, newClosesAt) {
    const poll = this._getPoll(pollId);
    const d = parseDate(newClosesAt);
    if (!d) throw new Error('newClosesAt must be a valid date');
    const prev = poll.closesAt;
    poll.closesAt = d.toISOString();
    // Reactivate if previously expired — extension brings it back to life.
    if (poll.state === POLL_STATE.EXPIRED && d.getTime() > Date.now()) {
      poll.state = POLL_STATE.ACTIVE;
      poll.expiredAt = null;
    }
    poll.updatedAt = nowISO();
    this._auditPoll(pollId, 'extendPoll', { previousClosesAt: prev, newClosesAt: poll.closesAt });
    return clone(poll);
  }

  // ---- listActive ---------------------------------------------------------

  listActive(audienceFilter) {
    const out = [];
    for (const poll of this.polls.values()) {
      this._refreshState(poll);
      if (poll.state !== POLL_STATE.ACTIVE) continue;
      if (audienceFilter) {
        const match = poll.audience.includes(audienceFilter) || poll.audience.includes('all');
        if (!match) continue;
      }
      out.push(clone(poll));
    }
    out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return out;
  }

  // ---- export -------------------------------------------------------------

  export(pollId, format = 'json') {
    const poll = this._getPoll(pollId);
    const log = this.votes.get(pollId);
    const results = this.results(pollId);

    if (format === 'json') {
      return JSON.stringify({
        poll: clone(poll),
        votes: log.map(clone),
        results,
        comments: this.comments.get(pollId).map(clone),
        exportedAt: nowISO(),
      }, null, 2);
    }

    if (format === 'csv') {
      const header = [
        'poll_id','poll_type','question_he','question_en','state',
        'vote_id','voter_key','is_anonymous','status','choice','choice_label_he','choice_label_en','ts','exclude_reason',
      ];
      const lines = [header.map(csvEscape).join(',')];
      const optLookup = Object.create(null);
      for (const o of poll.options) optLookup[o.id] = o;

      for (const v of log) {
        // One row per choice to keep multi-select flat.
        const picks = v.choices.length > 0 ? v.choices : [''];
        for (const c of picks) {
          const opt = optLookup[c] || { he: '', en: '' };
          lines.push([
            poll.id,
            poll.type,
            poll.question_he,
            poll.question_en,
            poll.state,
            v.voteId,
            v.voterKey,
            v.anonymous ? 'true' : 'false',
            v.status,
            c,
            opt.he || '',
            opt.en || '',
            v.ts,
            v.excludeReason || '',
          ].map(csvEscape).join(','));
        }
      }
      return lines.join('\r\n');
    }

    throw new Error(`unknown export format: ${format}`);
  }

  // ---- voterParticipation -------------------------------------------------

  voterParticipation(pollId) {
    const poll = this._getPoll(pollId);
    const voterMap = this.voters.get(pollId);
    const log = this.votes.get(pollId);
    let counted = 0;
    for (const v of log) if (v.status === 'counted') counted += 1;

    // Use declared audienceSize when available, else count unique voters.
    const uniqueVoters = voterMap.size;
    const base = poll.audienceSize && poll.audienceSize > 0 ? poll.audienceSize : uniqueVoters;

    const pct = base > 0 ? roundPct(uniqueVoters / base) : 0;

    return {
      pollId,
      audience: poll.audience,
      audienceSize: poll.audienceSize || null,
      uniqueVoters,
      countedBallots: counted,
      participationPct: pct,
      snapshotAt: nowISO(),
    };
  }

  // ---- discussionThread ---------------------------------------------------

  discussionThread(pollId, action, payload) {
    const poll = this._getPoll(pollId);
    if (!poll.allowComments) {
      throw new Error(`comments disabled for poll ${pollId}`);
    }
    const list = this.comments.get(pollId);

    if (!action || action === 'list') {
      return list.map(clone);
    }

    if (action === 'add') {
      const { userId, text, parentId } = payload || {};
      if (!nonEmptyString(userId)) throw new Error('userId required');
      if (!nonEmptyString(text))   throw new Error('text required');
      const cmt = {
        id: uid('cmt'),
        pollId,
        userId: poll.anonymous ? anonymizeVoter(userId, poll.id) : String(userId),
        text: String(text),
        parentId: parentId || null,
        createdAt: nowISO(),
        status: 'visible',
      };
      list.push(cmt);
      this._auditPoll(pollId, 'discussionAdd', { commentId: cmt.id });
      return clone(cmt);
    }

    if (action === 'hide') {
      const { commentId, reason } = payload || {};
      const c = list.find((x) => x.id === commentId);
      if (!c) throw new Error(`comment not found: ${commentId}`);
      // לא מוחקים — שומרים ומסמנים
      c.status = 'hidden';
      c.hiddenReason = reason || '';
      c.hiddenAt = nowISO();
      this._auditPoll(pollId, 'discussionHide', { commentId, reason });
      return clone(c);
    }

    throw new Error(`unknown discussion action: ${action}`);
  }

  // ---- ban ----------------------------------------------------------------

  ban(pollId, voterId, reason) {
    const poll = this._getPoll(pollId);
    if (!nonEmptyString(voterId)) throw new Error('voterId required');

    const voterKey = this._voterKey(poll, voterId);
    this.bans.get(pollId).add(voterKey);

    // Annotate existing votes — never delete, never rewrite choices.
    const log = this.votes.get(pollId);
    let excluded = 0;
    for (const v of log) {
      if (v.voterKey === voterKey && v.status !== 'excluded') {
        v.status = 'excluded';
        v.excludeReason = reason || 'banned';
        v.excludedAt = nowISO();
        excluded += 1;
      }
    }

    this._auditPoll(pollId, 'ban', { voterKey, reason, excludedCount: excluded });
    return {
      pollId,
      voterKey,
      reason: reason || '',
      excludedCount: excluded,
      at: nowISO(),
    };
  }

  // ---- history ------------------------------------------------------------

  history(pollId) {
    if (!this.polls.has(pollId)) throw new Error(`poll not found: ${pollId}`);
    return (this._history.get(pollId) || []).map(clone);
  }

  // ---- misc ---------------------------------------------------------------

  getPoll(pollId) {
    const p = this.polls.get(pollId);
    if (!p) return null;
    this._refreshState(p);
    return clone(p);
  }

  getVotes(pollId) {
    if (!this.polls.has(pollId)) throw new Error(`poll not found: ${pollId}`);
    return (this.votes.get(pollId) || []).map(clone);
  }

  stats() {
    let active = 0, closed = 0, expired = 0, draft = 0, totalVotes = 0;
    for (const p of this.polls.values()) {
      this._refreshState(p);
      if (p.state === POLL_STATE.ACTIVE)  active  += 1;
      if (p.state === POLL_STATE.CLOSED)  closed  += 1;
      if (p.state === POLL_STATE.EXPIRED) expired += 1;
      if (p.state === POLL_STATE.DRAFT)   draft   += 1;
      totalVotes += (this.votes.get(p.id) || []).length;
    }
    return {
      totalPolls: this.polls.size,
      active, closed, expired, draft,
      totalVotes,
      globalAuditEntries: this.globalLog.length,
    };
  }
}

module.exports = {
  Polls,
  POLL_TYPES,
  POLL_STATE,
  DEFAULT_YES_NO,
  DEFAULT_RATING,
  DEFAULT_EMOJI,
  anonymizeVoter,
  djb2Hash,
  csvEscape,
  normalizeOptions,
};
