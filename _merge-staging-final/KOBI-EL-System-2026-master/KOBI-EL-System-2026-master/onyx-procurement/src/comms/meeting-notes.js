/**
 * Meeting Notes Capture + Action-Item Extraction Engine
 * ─────────────────────────────────────────────────────
 * Agent Y-131 • Techno-Kol Uzi mega-ERP • Swarm Comms
 *
 *   לכידת סיכומי פגישות, מיצוי משימות והחלטות, סיכום אוטומטי,
 *   יצוא דו-לשוני, חיפוש TF-IDF וקישור למערכות משימות.
 *
 * Rule of the ERP: לא מוחקים רק משדרגים ומגדלים
 *   Notes and action items are strictly append-only. `deleteNote`
 *   is a soft tombstone that flips a `retracted` flag and preserves
 *   the full audit history. No purge, no overwrite.
 *
 * Zero external deps. Node built-ins only (Map, Set, crypto
 * `randomUUID`, EventEmitter). No WebSockets, no DB driver, no
 * NLP package — extraction is rule-based and fully auditable.
 *
 * Bilingual (he / en) on every label, type, export section and error
 * message. RTL-safe markdown output. Supports mixed Hebrew/English
 * meetings — typical in Israeli tech teams.
 *
 * Public API (class `MeetingNotes`):
 *   createMeeting({id,title_he,title_en,date,attendees,organizer,meetingType})
 *   addNote({meetingId,content,author,timestamp})
 *   extractActionItems(meetingId)      → [{text,owner,dueDate,priority,...}]
 *   extractDecisions(meetingId)        → [{text,author,timestamp,...}]
 *   linkToTasks(meetingId, taskSystem) → [{taskId,...}]
 *   summarize(meetingId, {maxLength})  → { summary, sentences, actions }
 *   exportMarkdown(meetingId)          → bilingual markdown string
 *   exportPDF(meetingId)               → structured PDF payload
 *   followUp(meetingId, days)          → scheduled followup record
 *   searchMeetings(query, filters)     → ranked TF-IDF results
 *   relatedMeetings(meetingId)         → overlap-scored siblings
 *   attendance({attendeeId, period})   → meeting hours per person
 *
 * Meeting types (7):
 *   standup | planning | review | retro | customer | board | 1-on-1
 *
 * Action-item syntax (rule-based, case-insensitive):
 *   Hebrew : פעולה: / לעשות: / משימה: / אחראי: / עד: / דדליין: / דחוף / עדיפות:
 *   English: action: / todo: / task: / owner: / by: / due: / urgent / priority:
 *
 * Decision syntax:
 *   Hebrew : החלטה: / הוחלט: / סוכם:
 *   English: decision: / decided: / agreed:
 *
 * Usage:
 *   const { MeetingNotes } = require('./comms/meeting-notes');
 *   const mn = new MeetingNotes();
 *   const m = mn.createMeeting({ title_he: 'סטנדאפ', title_en: 'Standup',
 *     date: '2026-04-11', attendees: ['u1','u2'], organizer: 'u1',
 *     meetingType: 'standup' });
 *   mn.addNote({ meetingId: m.id, author: 'u1',
 *     content: 'פעולה: לסגור דוח. אחראי: @dani. עד: 2026-04-15' });
 *   const actions = mn.extractActionItems(m.id);
 */

'use strict';

const { EventEmitter } = require('node:events');
let _randomUUID;
try {
  _randomUUID = require('node:crypto').randomUUID;
} catch (_) {
  _randomUUID = null;
}

// ═══════════════════════════════════════════════════════════════════════
// 0. TINY ID / TIME HELPERS
// ═══════════════════════════════════════════════════════════════════════

let _idSeq = 0;
/**
 * Generate a collision-safe id with a monotonic counter suffix so
 * two calls in the same ms always differ — tests rely on stable order.
 */
function makeId(prefix) {
  _idSeq += 1;
  const base = _randomUUID
    ? _randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${base}${_idSeq.toString(36)}`;
}

function nowIso(d) {
  if (d instanceof Date) return d.toISOString();
  if (typeof d === 'string' || typeof d === 'number') {
    const x = new Date(d);
    if (!Number.isNaN(x.getTime())) return x.toISOString();
  }
  return new Date().toISOString();
}

function daysBetween(a, b) {
  const MS = 24 * 60 * 60 * 1000;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS);
}

function addDaysIso(baseIso, days) {
  const d = new Date(baseIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

// ═══════════════════════════════════════════════════════════════════════
// 1. CONSTANTS — meeting types, labels, keyword grammar
// ═══════════════════════════════════════════════════════════════════════

const MEETING_TYPES = Object.freeze({
  standup: { he: 'סטנדאפ יומי', en: 'Daily Standup', defaultMinutes: 15 },
  planning: { he: 'תכנון ספרינט', en: 'Planning', defaultMinutes: 60 },
  review: { he: 'סקירה', en: 'Review', defaultMinutes: 45 },
  retro: { he: 'רטרוספקטיבה', en: 'Retro', defaultMinutes: 60 },
  customer: { he: 'פגישת לקוח', en: 'Customer Meeting', defaultMinutes: 45 },
  board: { he: 'ישיבת דירקטוריון', en: 'Board Meeting', defaultMinutes: 90 },
  '1-on-1': { he: 'שיחה אישית', en: '1-on-1', defaultMinutes: 30 },
});

const VALID_MEETING_TYPES = Object.freeze(Object.keys(MEETING_TYPES));

const PRIORITY_LABELS = Object.freeze({
  high: { he: 'גבוהה', en: 'High' },
  medium: { he: 'בינונית', en: 'Medium' },
  low: { he: 'נמוכה', en: 'Low' },
});

/**
 * Rule-based action / decision / owner / due-date keyword grammar.
 *
 * We intentionally use a FLAT list of (label, regex, type) rows so
 * new languages can be appended without touching the matcher. The
 * matcher is case-insensitive and Unicode-aware.
 *
 * Each row's regex captures the TEXT AFTER the marker, stopping at
 * sentence-final punctuation (.!?\n) or the next marker.
 */
const HEBREW_ACTION_MARKERS = ['פעולה', 'לעשות', 'משימה', 'צריך לעשות', 'todo-he'];
const HEBREW_OWNER_MARKERS = ['אחראי', 'אחראית', 'בעלים', 'מבצע'];
const HEBREW_DUE_MARKERS = ['עד', 'דדליין', 'תאריך יעד'];
const HEBREW_PRIORITY_MARKERS = ['עדיפות', 'דחיפות'];
const HEBREW_URGENT_TOKENS = ['דחוף', 'דחופה', 'בהול'];
const HEBREW_DECISION_MARKERS = ['החלטה', 'הוחלט', 'סוכם', 'מחליטים'];

const ENGLISH_ACTION_MARKERS = ['action', 'todo', 'task', 'ai'];
const ENGLISH_OWNER_MARKERS = ['owner', 'assignee', 'resp', 'responsible'];
const ENGLISH_DUE_MARKERS = ['by', 'due', 'deadline', 'target'];
const ENGLISH_PRIORITY_MARKERS = ['priority', 'prio'];
const ENGLISH_URGENT_TOKENS = ['urgent', 'asap', 'critical', 'p0'];
const ENGLISH_DECISION_MARKERS = ['decision', 'decided', 'agreed', 'resolution'];

// ═══════════════════════════════════════════════════════════════════════
// 2. ERRORS
// ═══════════════════════════════════════════════════════════════════════

class MeetingError extends Error {
  constructor(code, messageHe, messageEn, details) {
    super(`${code}: ${messageEn}`);
    this.name = 'MeetingError';
    this.code = code;
    this.message_he = messageHe;
    this.message_en = messageEn;
    this.details = details || {};
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3. TEXT NORMALIZATION & TOKENIZATION (for TF-IDF search)
// ═══════════════════════════════════════════════════════════════════════

const HEBREW_NIQQUD = /[\u0591-\u05C7]/g;
const HEBREW_FINAL_MAP = {
  '\u05DA': '\u05DB', // ך → כ
  '\u05DD': '\u05DE', // ם → מ
  '\u05DF': '\u05E0', // ן → נ
  '\u05E3': '\u05E4', // ף → פ
  '\u05E5': '\u05E6', // ץ → צ
};
function normalizeFinalLetters(s) {
  let out = '';
  for (const ch of s) out += HEBREW_FINAL_MAP[ch] || ch;
  return out;
}

const HEBREW_STOPWORDS = new Set([
  'של', 'את', 'על', 'עם', 'כי', 'הוא', 'היא', 'זה', 'לא', 'כן', 'או',
  'אם', 'גם', 'כמו', 'מה', 'אני', 'אנחנו', 'הם', 'הן', 'יש', 'אין',
  'ב', 'ל', 'מ', 'ה', 'ו', 'ש',
]);
const ENGLISH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'that',
  'this', 'it', 'be', 'as', 'we', 'you', 'i', 'they', 'he', 'she',
]);

/**
 * Tokenise for TF-IDF search. Strips niqqud, normalises final letters,
 * removes stopwords, keeps mixed Hebrew/English meaningfully.
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const clean = text
    .replace(HEBREW_NIQQUD, '')
    .toLowerCase();
  const normalised = normalizeFinalLetters(clean);
  const raw = normalised
    .split(/[\s.,;:!?()\[\]{}"'`\/\\<>\-+=\u2013\u2014]+/u)
    .filter(Boolean);
  return raw.filter(
    tok =>
      tok.length >= 2 &&
      !HEBREW_STOPWORDS.has(tok) &&
      !ENGLISH_STOPWORDS.has(tok)
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 4. ACTION ITEM + DECISION EXTRACTION (rule-based, bilingual)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Split content into "segments" so marker parsing doesn't bleed across
 * sentences. We split on: period, exclamation, question mark, newline,
 * and Hebrew sof-pasuk (׃) and maqaf runs.
 */
function splitSegments(text) {
  if (!text) return [];
  return text
    .split(/[.!?\n\r\u05C3]+/u)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Case-insensitive marker finder. Given a segment and a list of
 * markers, returns the content AFTER the first marker occurrence,
 * stopped at the next known marker or end of segment.
 *
 * Returns null when no marker is present.
 */
function findMarker(segment, markers) {
  if (!segment) return null;
  const lower = segment.toLowerCase();
  let bestIdx = -1;
  let bestMarker = null;
  for (const m of markers) {
    const ml = m.toLowerCase();
    // Hebrew doesn't need \b; English does. A simple split on marker
    // is safer than \b because Hebrew letters are Unicode ranges.
    const idx = lower.indexOf(ml);
    if (idx === -1) continue;
    // Reject matches that are inside another English word. We look at
    // the character just BEFORE idx and just AFTER idx+ml.length. If
    // both sides are ASCII letters, it's an infix — skip.
    const prev = idx > 0 ? lower[idx - 1] : ' ';
    const next = idx + ml.length < lower.length ? lower[idx + ml.length] : ' ';
    const isEnglishMarker = /^[a-z]/.test(ml);
    if (isEnglishMarker) {
      if (/[a-z0-9]/.test(prev)) continue;
      // The immediate character after the marker must be a separator —
      // either a colon, whitespace, punctuation, or Hebrew text. This
      // prevents "actor" from matching "action".
      if (/[a-z0-9]/.test(next)) continue;
    }
    if (bestIdx === -1 || idx < bestIdx) {
      bestIdx = idx;
      bestMarker = m;
    }
  }
  if (bestIdx === -1) return null;
  // Tail after the marker (preserve original case for extraction).
  let tail = segment.slice(bestIdx + bestMarker.length);
  // Skip a single leading colon + whitespace.
  tail = tail.replace(/^\s*[:\uFF1A\-\u2013\u2014]\s*/u, '').trim();
  return { marker: bestMarker, tail, startIdx: bestIdx };
}

/**
 * All inline sub-markers (owner/due/priority) collected with their
 * category so parseActionTail can walk the string once.
 */
function buildSubMarkerTable() {
  const rows = [];
  for (const m of HEBREW_OWNER_MARKERS) rows.push({ marker: m, kind: 'owner' });
  for (const m of ENGLISH_OWNER_MARKERS) rows.push({ marker: m, kind: 'owner' });
  for (const m of HEBREW_DUE_MARKERS) rows.push({ marker: m, kind: 'due' });
  for (const m of ENGLISH_DUE_MARKERS) rows.push({ marker: m, kind: 'due' });
  for (const m of HEBREW_PRIORITY_MARKERS) rows.push({ marker: m, kind: 'priority' });
  for (const m of ENGLISH_PRIORITY_MARKERS) rows.push({ marker: m, kind: 'priority' });
  return rows;
}
const SUB_MARKER_TABLE = buildSubMarkerTable();

/**
 * Find every sub-marker occurrence (owner/due/priority) in a string.
 * Returns a sorted array of `{ kind, marker, start, end }` where
 * `start` is the position of the marker and `end` is where its
 * following colon (if any) ends.
 *
 * The scan is case-insensitive for English markers and Unicode-aware
 * for Hebrew. To avoid infix matches in English (e.g. "owner" matching
 * inside "downer"), we require the char before/after the marker to
 * NOT be an ASCII word character for English markers. Hebrew markers
 * have no such collision risk so they match anywhere.
 */
function findAllSubMarkers(text) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const row of SUB_MARKER_TABLE) {
    const ml = row.marker.toLowerCase();
    const isEnglish = /^[a-z]/.test(ml);
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(ml, from);
      if (idx === -1) break;
      const prev = idx > 0 ? lower[idx - 1] : ' ';
      const next = idx + ml.length < lower.length ? lower[idx + ml.length] : ' ';
      if (isEnglish) {
        if (/[a-z0-9]/.test(prev) || /[a-z0-9]/.test(next)) {
          from = idx + ml.length;
          continue;
        }
      }
      // Figure out where the marker's "value span" begins. We accept
      // an optional separator (`:`, `-`, `—`, whitespace) immediately
      // after the marker.
      let valStart = idx + ml.length;
      while (valStart < text.length && /[\s:\-\u2013\u2014\uFF1A]/u.test(text[valStart])) {
        valStart += 1;
      }
      hits.push({
        kind: row.kind,
        marker: row.marker,
        start: idx,
        valStart,
      });
      from = idx + ml.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  // Dedup overlapping same-start hits — keep the longest marker.
  const filtered = [];
  for (const h of hits) {
    const last = filtered[filtered.length - 1];
    if (last && last.start === h.start) {
      if (h.marker.length > last.marker.length) filtered[filtered.length - 1] = h;
      continue;
    }
    if (last && h.start < last.valStart) continue; // nested, skip
    filtered.push(h);
  }
  return filtered;
}

/**
 * Within the tail of an action marker, pull out owner + due-date +
 * priority if they're present as inline sub-markers. Any portion not
 * consumed by sub-markers becomes the action `text`.
 *
 * Strategy:
 *   1. Find every sub-marker hit and sort by position.
 *   2. Text BEFORE the first sub-marker is the action description.
 *   3. Each sub-marker span runs from `valStart` to the next marker
 *      (or end of string), stopping at the first sentence terminator
 *      (`,` `;` `\n`).
 */
function parseActionTail(tail) {
  let owner = null;
  let dueDate = null;
  let priority = 'medium';

  // Urgent tokens bump priority regardless of position.
  const lowerTail = tail.toLowerCase();
  for (const tok of HEBREW_URGENT_TOKENS.concat(ENGLISH_URGENT_TOKENS)) {
    if (lowerTail.includes(tok.toLowerCase())) {
      priority = 'high';
      break;
    }
  }

  const hits = findAllSubMarkers(tail);
  let text;
  if (hits.length === 0) {
    text = tail.trim();
  } else {
    text = tail.slice(0, hits[0].start).trim();
    for (let i = 0; i < hits.length; i += 1) {
      const hit = hits[i];
      const next = hits[i + 1];
      const endBoundary = next ? next.start : tail.length;
      // Value runs to the next marker OR the first `,`/`;`/`\n`,
      // whichever comes first — this is what lets a sentence like
      // "action: X. owner: a, by: tomorrow" split correctly.
      let v = tail.slice(hit.valStart, endBoundary);
      const sepIdx = v.search(/[,;\n]/u);
      if (sepIdx !== -1) v = v.slice(0, sepIdx);
      v = v.trim();
      if (hit.kind === 'owner') {
        const handleMatch = v.match(/^@?([^\s,.;]{1,40})/u);
        if (handleMatch) owner = handleMatch[1].replace(/^@/, '');
      } else if (hit.kind === 'due') {
        const parsed = parseDueDate(v);
        if (parsed) dueDate = parsed;
      } else if (hit.kind === 'priority') {
        const p = v.toLowerCase();
        if (/high|גבוה|דחוף|p0|p1/u.test(p)) priority = 'high';
        else if (/low|נמוכ|p3|p4/u.test(p)) priority = 'low';
        else if (/med|בינונ|p2/u.test(p)) priority = 'medium';
      }
    }
  }

  // Truncate text at the first sentence-terminator (period/!/?).
  // This keeps "להכין דוח מכירות רבעוני" from trailing into the next bit.
  const termIdx = text.search(/[.!?\n\r]/u);
  if (termIdx !== -1) text = text.slice(0, termIdx);

  // Remove Hebrew urgent tokens from the text so the action label is clean.
  for (const tok of HEBREW_URGENT_TOKENS) {
    text = text.replace(new RegExp(tok, 'gu'), '').trim();
  }
  for (const tok of ENGLISH_URGENT_TOKENS) {
    text = text.replace(new RegExp('\\b' + tok + '\\b', 'giu'), '').trim();
  }
  // Strip surrounding parens if the urgent marker lived inside ().
  text = text.replace(/\(\s*\)/gu, '').trim();
  text = text.replace(/^[\s,;:\-]+|[\s,;:\-]+$/gu, '');
  return { text, owner, dueDate, priority };
}

/**
 * Parse a due-date string. Supports:
 *   • ISO 8601 (2026-04-15)
 *   • dd/mm/yyyy and dd.mm.yyyy
 *   • "tomorrow", "next week", "מחר", "שבוע הבא", "end of month"
 *   • "3 days", "בעוד 3 ימים"
 * Returns an ISO-8601 string or null.
 */
function parseDueDate(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const dmy = s.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const d = new Date(`${year}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const now = new Date();
  if (/מחר|tomorrow/u.test(s)) return addDaysIso(now.toISOString(), 1);
  if (/today|היום/u.test(s)) return now.toISOString();
  if (/next week|שבוע הבא/u.test(s)) return addDaysIso(now.toISOString(), 7);
  if (/end of month|סוף חודש/u.test(s)) {
    const eom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return eom.toISOString();
  }
  const inDays = s.match(/(?:in|בעוד)\s*(\d+)\s*(?:days?|ימים?)/u);
  if (inDays) return addDaysIso(now.toISOString(), parseInt(inDays[1], 10));
  const bareDays = s.match(/^(\d+)\s*(?:days?|ימים?)/u);
  if (bareDays) return addDaysIso(now.toISOString(), parseInt(bareDays[1], 10));

  return null;
}

/**
 * Find every action-marker occurrence in `content`. Unlike the
 * sub-marker scanner, action markers can repeat — we return the
 * full sorted hit list so `extractActionsFromContent` can carve
 * one span per marker.
 */
function findAllActionMarkers(text) {
  const lower = text.toLowerCase();
  const hits = [];
  const allMarkers = HEBREW_ACTION_MARKERS.concat(ENGLISH_ACTION_MARKERS);
  for (const m of allMarkers) {
    const ml = m.toLowerCase();
    const isEnglish = /^[a-z]/.test(ml);
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(ml, from);
      if (idx === -1) break;
      const prev = idx > 0 ? lower[idx - 1] : ' ';
      const next = idx + ml.length < lower.length ? lower[idx + ml.length] : ' ';
      if (isEnglish) {
        if (/[a-z0-9]/.test(prev) || /[a-z0-9]/.test(next)) {
          from = idx + ml.length;
          continue;
        }
      }
      let valStart = idx + ml.length;
      while (valStart < text.length && /[\s:\-\u2013\u2014\uFF1A]/u.test(text[valStart])) {
        valStart += 1;
      }
      hits.push({ marker: m, start: idx, valStart });
      from = idx + ml.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);
  // Dedup overlapping hits at the same start — keep the longest marker.
  const filtered = [];
  for (const h of hits) {
    const last = filtered[filtered.length - 1];
    if (last && last.start === h.start) {
      if (h.marker.length > last.marker.length) filtered[filtered.length - 1] = h;
      continue;
    }
    if (last && h.start < last.valStart) continue;
    filtered.push(h);
  }
  return filtered;
}

/**
 * Run the full bilingual action-item extraction on a note's content.
 * Returns an array of action candidates ready to be persisted.
 *
 * Algorithm:
 *   1. Scan the content for every action marker (action/todo/פעולה…).
 *   2. For each action marker, the "tail" runs from its valStart to
 *      the next action marker OR end of content.
 *   3. The tail is passed to parseActionTail which isolates the
 *      description, owner, dueDate, and priority using sub-markers.
 */
function extractActionsFromContent(content) {
  if (!content) return [];
  const hits = findAllActionMarkers(content);
  if (hits.length === 0) return [];
  const out = [];
  for (let i = 0; i < hits.length; i += 1) {
    const h = hits[i];
    const nextStart = hits[i + 1] ? hits[i + 1].start : content.length;
    const tail = content.slice(h.valStart, nextStart);
    const parsed = parseActionTail(tail);
    if (!parsed.text) continue;
    out.push({
      text: parsed.text,
      owner: parsed.owner,
      dueDate: parsed.dueDate,
      priority: parsed.priority,
      marker: h.marker,
    });
  }
  return out;
}

/**
 * Extract decisions — simpler than actions since a decision has no
 * owner / due-date modifiers.
 */
function extractDecisionsFromContent(content) {
  if (!content) return [];
  const segments = splitSegments(content);
  const out = [];
  const allDecisionMarkers = HEBREW_DECISION_MARKERS.concat(ENGLISH_DECISION_MARKERS);
  for (const seg of segments) {
    const hit = findMarker(seg, allDecisionMarkers);
    if (!hit || !hit.tail) continue;
    let text = hit.tail.trim();
    // Drop a trailing period/comma that survived the split.
    text = text.replace(/[\s,.;:]+$/u, '');
    if (!text) continue;
    out.push({ text, marker: hit.marker });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// 5. MAIN CLASS
// ═══════════════════════════════════════════════════════════════════════

class MeetingNotes extends EventEmitter {
  constructor(opts) {
    super();
    const options = opts || {};
    /** @type {Map<string, object>} */
    this.meetings = new Map();
    /** @type {Map<string, object[]>} — append-only notes per meeting */
    this.notes = new Map();
    /** @type {Map<string, object[]>} — append-only action items */
    this.actions = new Map();
    /** @type {Map<string, object[]>} */
    this.decisions = new Map();
    /** @type {Map<string, object[]>} — followup schedules */
    this.followUps = new Map();
    /** @type {object[]} — task system emission log (audit) */
    this.taskEmissions = [];
    this._clock = options.clock || (() => new Date());
  }

  // ─── meeting lifecycle ─────────────────────────────────────────────

  /**
   * Create a meeting record. id is optional — one is generated when
   * omitted so tests can pass bare metadata.
   */
  createMeeting(input) {
    if (!input || typeof input !== 'object') {
      throw new MeetingError(
        'BAD_INPUT',
        'חסרים פרטי פגישה',
        'Missing meeting input',
        {}
      );
    }
    const { id, title_he, title_en, date, attendees, organizer, meetingType } = input;
    if (!title_he && !title_en) {
      throw new MeetingError(
        'MISSING_TITLE',
        'חסרה כותרת לפגישה',
        'Meeting must have at least one title (he or en)',
        {}
      );
    }
    if (!meetingType || !VALID_MEETING_TYPES.includes(meetingType)) {
      throw new MeetingError(
        'BAD_TYPE',
        'סוג פגישה לא תקין',
        `meetingType must be one of: ${VALID_MEETING_TYPES.join(', ')}`,
        { got: meetingType }
      );
    }
    if (!organizer) {
      throw new MeetingError(
        'MISSING_ORGANIZER',
        'חסר מארגן הפגישה',
        'organizer is required',
        {}
      );
    }
    const meetingId = id || makeId('mtg');
    if (this.meetings.has(meetingId)) {
      throw new MeetingError(
        'DUPLICATE_ID',
        'מזהה פגישה קיים כבר',
        `Meeting ${meetingId} already exists`,
        { id: meetingId }
      );
    }
    const typeDef = MEETING_TYPES[meetingType];
    const meeting = {
      id: meetingId,
      title_he: title_he || title_en,
      title_en: title_en || title_he,
      date: nowIso(date),
      attendees: Array.isArray(attendees) ? attendees.slice() : [],
      organizer,
      meetingType,
      type_labels: typeDef,
      createdAt: nowIso(this._clock()),
      expectedMinutes: typeDef.defaultMinutes,
      status: 'scheduled',
    };
    this.meetings.set(meetingId, meeting);
    this.notes.set(meetingId, []);
    this.actions.set(meetingId, []);
    this.decisions.set(meetingId, []);
    this.followUps.set(meetingId, []);
    this.emit('meeting.created', meeting);
    return meeting;
  }

  /**
   * Return a meeting by id or throw NOT_FOUND.
   */
  getMeeting(meetingId) {
    const m = this.meetings.get(meetingId);
    if (!m) {
      throw new MeetingError(
        'NOT_FOUND',
        'פגישה לא נמצאה',
        `Meeting ${meetingId} not found`,
        { id: meetingId }
      );
    }
    return m;
  }

  listMeetings(filter) {
    const out = Array.from(this.meetings.values());
    if (!filter) return out;
    return out.filter(m => {
      if (filter.meetingType && m.meetingType !== filter.meetingType) return false;
      if (filter.organizer && m.organizer !== filter.organizer) return false;
      return true;
    });
  }

  // ─── notes ──────────────────────────────────────────────────────────

  /**
   * Append a note. Runs action + decision extraction and records any
   * hits into the append-only arrays. Never mutates prior notes.
   */
  addNote(input) {
    if (!input || typeof input !== 'object') {
      throw new MeetingError('BAD_INPUT', 'חסרים נתוני הערה', 'Missing note input', {});
    }
    const { meetingId, content, author, timestamp } = input;
    const meeting = this.getMeeting(meetingId);
    if (!content || typeof content !== 'string') {
      throw new MeetingError(
        'EMPTY_CONTENT',
        'תוכן ההערה ריק',
        'Note content is required',
        {}
      );
    }
    if (!author) {
      throw new MeetingError(
        'MISSING_AUTHOR',
        'חסר מחבר להערה',
        'Note author is required',
        {}
      );
    }
    const note = {
      id: makeId('note'),
      meetingId,
      content,
      author,
      timestamp: nowIso(timestamp || this._clock()),
      createdAt: nowIso(this._clock()),
      retracted: false,
    };
    this.notes.get(meetingId).push(note);
    this.emit('note.added', note);

    // Incrementally extract + append.
    const acts = extractActionsFromContent(content);
    for (const a of acts) {
      const action = {
        id: makeId('act'),
        meetingId,
        noteId: note.id,
        text: a.text,
        owner: a.owner,
        dueDate: a.dueDate,
        priority: a.priority,
        marker: a.marker,
        createdAt: note.timestamp,
        status: 'open',
      };
      this.actions.get(meetingId).push(action);
      this.emit('action.extracted', action);
    }
    const decs = extractDecisionsFromContent(content);
    for (const d of decs) {
      const decision = {
        id: makeId('dec'),
        meetingId,
        noteId: note.id,
        text: d.text,
        marker: d.marker,
        author,
        timestamp: note.timestamp,
      };
      this.decisions.get(meetingId).push(decision);
      this.emit('decision.extracted', decision);
    }

    // Meeting transitions to in-progress on the first note.
    if (meeting.status === 'scheduled') {
      meeting.status = 'in-progress';
    }
    return note;
  }

  listNotes(meetingId, opts) {
    this.getMeeting(meetingId);
    const all = this.notes.get(meetingId).slice();
    const includeRetracted = !!(opts && opts.includeRetracted);
    return includeRetracted ? all : all.filter(n => !n.retracted);
  }

  /**
   * Soft-retract a note. The note stays in storage with retracted=true.
   * We NEVER delete — this is the ERP's immutable-history rule.
   */
  retractNote(noteId, reason) {
    for (const arr of this.notes.values()) {
      for (const n of arr) {
        if (n.id === noteId) {
          n.retracted = true;
          n.retractedReason = reason || null;
          n.retractedAt = nowIso(this._clock());
          this.emit('note.retracted', n);
          return n;
        }
      }
    }
    throw new MeetingError('NOT_FOUND', 'הערה לא נמצאה', `Note ${noteId} not found`);
  }

  // ─── extraction (public) ───────────────────────────────────────────

  /**
   * Return all extracted action items for a meeting. Active notes only.
   */
  extractActionItems(meetingId) {
    this.getMeeting(meetingId);
    const retractedNotes = new Set(
      this.notes.get(meetingId).filter(n => n.retracted).map(n => n.id)
    );
    return this.actions
      .get(meetingId)
      .filter(a => !retractedNotes.has(a.noteId))
      .map(a => ({
        text: a.text,
        owner: a.owner,
        dueDate: a.dueDate,
        priority: a.priority,
        id: a.id,
        marker: a.marker,
        status: a.status,
      }));
  }

  extractDecisions(meetingId) {
    this.getMeeting(meetingId);
    const retractedNotes = new Set(
      this.notes.get(meetingId).filter(n => n.retracted).map(n => n.id)
    );
    return this.decisions
      .get(meetingId)
      .filter(d => !retractedNotes.has(d.noteId))
      .map(d => ({
        text: d.text,
        author: d.author,
        timestamp: d.timestamp,
        id: d.id,
        marker: d.marker,
      }));
  }

  // ─── task linking ─────────────────────────────────────────────────

  /**
   * Emit tasks to a mockable task system. The `taskSystem` is any
   * object with a `createTask({...})` method. When absent, we log the
   * event internally and return a preview array.
   */
  linkToTasks(meetingId, taskSystem) {
    const meeting = this.getMeeting(meetingId);
    const actions = this.extractActionItems(meetingId);
    const created = [];
    for (const a of actions) {
      const payload = {
        title: a.text,
        owner: a.owner,
        dueDate: a.dueDate,
        priority: a.priority,
        source: {
          system: 'meeting-notes',
          meetingId,
          meetingTitle_he: meeting.title_he,
          meetingTitle_en: meeting.title_en,
          actionId: a.id,
        },
      };
      let taskId = null;
      if (taskSystem && typeof taskSystem.createTask === 'function') {
        const res = taskSystem.createTask(payload);
        taskId = (res && (res.id || res.taskId)) || makeId('task');
      } else {
        taskId = makeId('task');
      }
      const record = {
        taskId,
        actionId: a.id,
        meetingId,
        payload,
        emittedAt: nowIso(this._clock()),
      };
      this.taskEmissions.push(record);
      this.emit('task.emitted', record);
      created.push(record);
    }
    return created;
  }

  // ─── summarization ────────────────────────────────────────────────

  /**
   * Extractive summary: first sentence of every non-retracted note
   * (dedup by text), capped to `maxLength` chars, with action items
   * appended as a bulleted tail.
   */
  summarize(meetingId, opts) {
    const meeting = this.getMeeting(meetingId);
    const { maxLength = 500 } = opts || {};
    const notes = this.listNotes(meetingId);
    const sentences = [];
    const seen = new Set();
    for (const n of notes) {
      const first = splitSegments(n.content)[0];
      if (!first) continue;
      const sig = first.trim().toLowerCase();
      if (seen.has(sig)) continue;
      seen.add(sig);
      sentences.push(first.trim());
    }
    let summary = sentences.join(' • ');
    const actions = this.extractActionItems(meetingId);
    let actionsLine = '';
    if (actions.length) {
      const labels = actions.slice(0, 5).map(a => `[${a.priority || 'medium'}] ${a.text}`);
      actionsLine = ' :: משימות/Actions: ' + labels.join('; ');
    }
    const full = (summary + actionsLine).trim();
    if (full.length <= maxLength) {
      return {
        meetingId,
        title_he: meeting.title_he,
        title_en: meeting.title_en,
        summary: full,
        sentenceCount: sentences.length,
        actionCount: actions.length,
        truncated: false,
      };
    }
    // Truncate at the nearest safe character; don't cut mid-word if
    // we can avoid it.
    let cut = full.slice(0, maxLength - 1);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) cut = cut.slice(0, lastSpace);
    return {
      meetingId,
      title_he: meeting.title_he,
      title_en: meeting.title_en,
      summary: cut + '…',
      sentenceCount: sentences.length,
      actionCount: actions.length,
      truncated: true,
    };
  }

  // ─── export: markdown ──────────────────────────────────────────────

  /**
   * Bilingual markdown export. RTL-safe: every Hebrew section is
   * wrapped with an explicit `dir="rtl"` marker for renderers that
   * honour it (GitLab, Gitea, Obsidian). The English section is LTR.
   */
  exportMarkdown(meetingId) {
    const meeting = this.getMeeting(meetingId);
    const notes = this.listNotes(meetingId);
    const actions = this.extractActionItems(meetingId);
    const decisions = this.extractDecisions(meetingId);
    const lines = [];
    // Title block (bilingual).
    lines.push(`# ${meeting.title_he} / ${meeting.title_en}`);
    lines.push('');
    lines.push(`> **סוג / Type:** ${meeting.type_labels.he} / ${meeting.type_labels.en}`);
    lines.push(`> **תאריך / Date:** ${meeting.date}`);
    lines.push(`> **מארגן / Organizer:** ${meeting.organizer}`);
    lines.push(
      `> **משתתפים / Attendees:** ${meeting.attendees.join(', ') || '(none)'}`
    );
    lines.push('');

    // Notes (he)
    lines.push('## הערות (Notes)');
    lines.push('<div dir="rtl">');
    if (notes.length === 0) {
      lines.push('_אין הערות / no notes_');
    } else {
      for (const n of notes) {
        lines.push(`- **${n.author}** @ ${n.timestamp}: ${n.content}`);
      }
    }
    lines.push('</div>');
    lines.push('');

    // Decisions
    lines.push('## החלטות / Decisions');
    if (decisions.length === 0) {
      lines.push('_אין החלטות / no decisions_');
    } else {
      for (const d of decisions) {
        lines.push(`- ${d.text}  _(${d.author})_`);
      }
    }
    lines.push('');

    // Action items
    lines.push('## משימות / Action Items');
    if (actions.length === 0) {
      lines.push('_אין משימות / no action items_');
    } else {
      lines.push('| # | טקסט / Text | אחראי / Owner | עד / Due | עדיפות / Priority |');
      lines.push('|---|---|---|---|---|');
      actions.forEach((a, i) => {
        lines.push(
          `| ${i + 1} | ${a.text} | ${a.owner || '—'} | ${a.dueDate || '—'} | ${a.priority || 'medium'} |`
        );
      });
    }
    lines.push('');
    lines.push('---');
    lines.push(
      `_Generated by Techno-Kol meeting-notes engine @ ${nowIso(this._clock())}_`
    );
    return lines.join('\n');
  }

  // ─── export: PDF payload ──────────────────────────────────────────

  /**
   * Structured PDF-ready payload. A downstream renderer (PDFKit, wkhtmltopdf,
   * onyx-procurement/src/printing/*) can consume this without touching the
   * core data model.
   */
  exportPDF(meetingId) {
    const meeting = this.getMeeting(meetingId);
    const notes = this.listNotes(meetingId);
    const actions = this.extractActionItems(meetingId);
    const decisions = this.extractDecisions(meetingId);
    return {
      format: 'pdf-payload-v1',
      dir: 'rtl',
      metadata: {
        title_he: meeting.title_he,
        title_en: meeting.title_en,
        type: meeting.meetingType,
        type_labels: meeting.type_labels,
        date: meeting.date,
        organizer: meeting.organizer,
        attendees: meeting.attendees,
      },
      sections: [
        {
          key: 'notes',
          title_he: 'הערות',
          title_en: 'Notes',
          rows: notes.map(n => ({
            author: n.author,
            timestamp: n.timestamp,
            content: n.content,
          })),
        },
        {
          key: 'decisions',
          title_he: 'החלטות',
          title_en: 'Decisions',
          rows: decisions.map(d => ({ text: d.text, author: d.author })),
        },
        {
          key: 'actions',
          title_he: 'משימות',
          title_en: 'Action Items',
          columns: [
            { key: 'text', he: 'טקסט', en: 'Text' },
            { key: 'owner', he: 'אחראי', en: 'Owner' },
            { key: 'dueDate', he: 'עד', en: 'Due' },
            { key: 'priority', he: 'עדיפות', en: 'Priority' },
          ],
          rows: actions.map(a => ({
            text: a.text,
            owner: a.owner,
            dueDate: a.dueDate,
            priority: a.priority,
            priority_label: PRIORITY_LABELS[a.priority] || PRIORITY_LABELS.medium,
          })),
        },
      ],
      generatedAt: nowIso(this._clock()),
    };
  }

  // ─── follow-up scheduling ─────────────────────────────────────────

  /**
   * Schedule a follow-up check N days from now. Produces a record
   * that downstream job runners (X-13 SSE, reminder engines) can
   * pick up. We never schedule in the past — negative days flip
   * to 1 day so the follow-up still fires.
   */
  followUp(meetingId, days) {
    const meeting = this.getMeeting(meetingId);
    const actions = this.extractActionItems(meetingId);
    const safeDays = Math.max(1, Math.floor(Number(days) || 1));
    const dueAt = addDaysIso(nowIso(this._clock()), safeDays);
    const record = {
      id: makeId('fup'),
      meetingId,
      createdAt: nowIso(this._clock()),
      dueAt,
      daysAhead: safeDays,
      openActionCount: actions.length,
      message_he: `המשך למעקב פגישה: ${meeting.title_he}`,
      message_en: `Follow up on meeting: ${meeting.title_en}`,
      actions: actions.map(a => ({
        actionId: a.id,
        text: a.text,
        owner: a.owner,
      })),
    };
    this.followUps.get(meetingId).push(record);
    this.emit('followup.scheduled', record);
    return record;
  }

  // ─── search (TF-IDF) ──────────────────────────────────────────────

  /**
   * Tiny TF-IDF scorer over the full meeting corpus. Index is built
   * from meeting title (he+en) + every active note's content. Each
   * document represents one meeting. Results are ranked and filtered
   * by the supplied filters.
   */
  searchMeetings(query, filters) {
    const q = tokenize(query || '');
    if (q.length === 0) return [];
    const docs = [];
    for (const meeting of this.meetings.values()) {
      const notes = this.listNotes(meeting.id)
        .map(n => n.content)
        .join(' ');
      const textBag = [meeting.title_he, meeting.title_en, notes].join(' ');
      const tokens = tokenize(textBag);
      const tf = {};
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
      docs.push({ meeting, tokens, tf });
    }
    if (docs.length === 0) return [];
    // Document-frequency.
    const df = {};
    for (const d of docs) {
      for (const term of Object.keys(d.tf)) {
        df[term] = (df[term] || 0) + 1;
      }
    }
    const N = docs.length;
    const scored = [];
    for (const d of docs) {
      let score = 0;
      for (const term of q) {
        const tf = d.tf[term] || 0;
        if (tf === 0) continue;
        const idf = Math.log(1 + N / (df[term] || 1));
        score += tf * idf;
      }
      if (score > 0) scored.push({ meeting: d.meeting, score });
    }
    let results = scored.sort((a, b) => b.score - a.score);

    // Apply filters.
    if (filters) {
      if (filters.type) {
        results = results.filter(r => r.meeting.meetingType === filters.type);
      }
      if (filters.organizer) {
        results = results.filter(r => r.meeting.organizer === filters.organizer);
      }
      if (filters.attendees && filters.attendees.length) {
        const want = new Set(filters.attendees);
        results = results.filter(r =>
          r.meeting.attendees.some(a => want.has(a))
        );
      }
      if (filters.dateRange) {
        const from = filters.dateRange.from ? new Date(filters.dateRange.from) : null;
        const to = filters.dateRange.to ? new Date(filters.dateRange.to) : null;
        results = results.filter(r => {
          const d = new Date(r.meeting.date);
          if (from && d < from) return false;
          if (to && d > to) return false;
          return true;
        });
      }
    }
    return results.map(r => ({
      meetingId: r.meeting.id,
      title_he: r.meeting.title_he,
      title_en: r.meeting.title_en,
      date: r.meeting.date,
      meetingType: r.meeting.meetingType,
      score: Math.round(r.score * 1000) / 1000,
    }));
  }

  // ─── related meetings ─────────────────────────────────────────────

  /**
   * Score sibling meetings by overlapping attendees (Jaccard) and
   * topic (cosine over TF vectors). Returns the top 10.
   */
  relatedMeetings(meetingId) {
    const base = this.getMeeting(meetingId);
    const baseAtt = new Set(base.attendees);
    const baseText = tokenize(
      [base.title_he, base.title_en, this.listNotes(meetingId).map(n => n.content).join(' ')].join(' ')
    );
    const baseTf = {};
    for (const t of baseText) baseTf[t] = (baseTf[t] || 0) + 1;
    const baseNorm = Math.sqrt(
      Object.values(baseTf).reduce((s, v) => s + v * v, 0)
    );
    const out = [];
    for (const other of this.meetings.values()) {
      if (other.id === meetingId) continue;
      const otherAtt = new Set(other.attendees);
      // Jaccard over attendees.
      let inter = 0;
      for (const a of baseAtt) if (otherAtt.has(a)) inter += 1;
      const union = baseAtt.size + otherAtt.size - inter || 1;
      const jaccard = inter / union;
      // Cosine over tokens.
      const otherTokens = tokenize(
        [other.title_he, other.title_en, this.listNotes(other.id).map(n => n.content).join(' ')].join(' ')
      );
      const otherTf = {};
      for (const t of otherTokens) otherTf[t] = (otherTf[t] || 0) + 1;
      const otherNorm = Math.sqrt(
        Object.values(otherTf).reduce((s, v) => s + v * v, 0)
      );
      let dot = 0;
      for (const term of Object.keys(baseTf)) {
        if (otherTf[term]) dot += baseTf[term] * otherTf[term];
      }
      const cosine = baseNorm && otherNorm ? dot / (baseNorm * otherNorm) : 0;
      // Weighted: attendees dominate, then topic.
      const score = 0.6 * jaccard + 0.4 * cosine;
      if (score > 0) {
        out.push({
          meetingId: other.id,
          title_he: other.title_he,
          title_en: other.title_en,
          date: other.date,
          jaccard: Math.round(jaccard * 1000) / 1000,
          cosine: Math.round(cosine * 1000) / 1000,
          score: Math.round(score * 1000) / 1000,
        });
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 10);
  }

  // ─── attendance tracking ──────────────────────────────────────────

  /**
   * Roll up meeting hours per person within an optional period. A
   * "period" is `{from,to}` ISO strings.
   */
  attendance(input) {
    const { attendeeId, period } = input || {};
    if (!attendeeId) {
      throw new MeetingError(
        'MISSING_ATTENDEE',
        'חסר מזהה משתתף',
        'attendeeId is required',
        {}
      );
    }
    const from = period && period.from ? new Date(period.from) : null;
    const to = period && period.to ? new Date(period.to) : null;
    const meetings = [];
    let totalMinutes = 0;
    for (const m of this.meetings.values()) {
      if (!m.attendees.includes(attendeeId)) continue;
      const d = new Date(m.date);
      if (from && d < from) continue;
      if (to && d > to) continue;
      meetings.push({
        meetingId: m.id,
        title_he: m.title_he,
        title_en: m.title_en,
        date: m.date,
        meetingType: m.meetingType,
        minutes: m.expectedMinutes,
      });
      totalMinutes += m.expectedMinutes;
    }
    return {
      attendeeId,
      meetingCount: meetings.length,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      period: period || null,
      meetings,
      label_he: `${meetings.length} פגישות, ${Math.round(totalMinutes / 60 * 100) / 100} שעות`,
      label_en: `${meetings.length} meetings, ${Math.round(totalMinutes / 60 * 100) / 100} hours`,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 6. EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  MeetingNotes,
  MeetingError,
  MEETING_TYPES,
  VALID_MEETING_TYPES,
  PRIORITY_LABELS,
  tokenize,
  extractActionsFromContent,
  extractDecisionsFromContent,
  parseDueDate,
  splitSegments,
  findMarker,
  HEBREW_ACTION_MARKERS,
  HEBREW_DECISION_MARKERS,
  ENGLISH_ACTION_MARKERS,
  ENGLISH_DECISION_MARKERS,
  HEBREW_OWNER_MARKERS,
  HEBREW_DUE_MARKERS,
  ENGLISH_OWNER_MARKERS,
  ENGLISH_DUE_MARKERS,
  daysBetween,
  addDaysIso,
  nowIso,
};
