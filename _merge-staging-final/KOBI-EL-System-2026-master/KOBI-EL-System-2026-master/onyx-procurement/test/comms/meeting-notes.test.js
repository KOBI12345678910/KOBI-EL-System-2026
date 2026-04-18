/**
 * Meeting Notes Capture + Action-Item Extraction — test suite
 * Agent Y-131 • Techno-Kol Uzi mega-ERP 2026
 *
 * Run:  node --test onyx-procurement/test/comms/meeting-notes.test.js
 *
 * Zero external deps: uses node:test + node:assert/strict. Covers
 *   • meeting creation with all 7 types + validation
 *   • append-only note insertion + soft retraction
 *   • Hebrew action item extraction (פעולה / לעשות / אחראי / עד)
 *   • English action item extraction (action / todo / owner / by)
 *   • mixed Hebrew/English extraction
 *   • priority inference (urgent / דחוף / explicit)
 *   • due-date parsing (ISO / dd.mm.yyyy / relative)
 *   • decision extraction (החלטה / decision)
 *   • extractive summarization with length cap
 *   • bilingual markdown export (sections + RTL wrapper)
 *   • PDF-payload export shape
 *   • followup scheduling with open-action snapshot
 *   • TF-IDF search with filters (type/date/organizer/attendees)
 *   • related meetings via attendee Jaccard + topic cosine
 *   • attendance roll-up with period filter
 *   • task system mock emission
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  MeetingNotes,
  MeetingError,
  MEETING_TYPES,
  VALID_MEETING_TYPES,
  tokenize,
  extractActionsFromContent,
  extractDecisionsFromContent,
  parseDueDate,
} = require('../../src/comms/meeting-notes');

// ─── helpers ────────────────────────────────────────────────────────────

function buildSeed() {
  const mn = new MeetingNotes();
  const m = mn.createMeeting({
    title_he: 'סטנדאפ יומי',
    title_en: 'Daily Standup',
    date: '2026-04-10T08:00:00Z',
    attendees: ['u1', 'u2', 'u3'],
    organizer: 'u1',
    meetingType: 'standup',
  });
  return { mn, meetingId: m.id };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. meeting lifecycle
// ═══════════════════════════════════════════════════════════════════════

test('createMeeting: happy path returns bilingual meeting record', () => {
  const mn = new MeetingNotes();
  const m = mn.createMeeting({
    title_he: 'תכנון ספרינט',
    title_en: 'Sprint Planning',
    date: '2026-04-11',
    attendees: ['u1', 'u2'],
    organizer: 'u1',
    meetingType: 'planning',
  });
  assert.ok(m.id.startsWith('mtg_'));
  assert.equal(m.title_he, 'תכנון ספרינט');
  assert.equal(m.title_en, 'Sprint Planning');
  assert.equal(m.meetingType, 'planning');
  assert.equal(m.type_labels.he, 'תכנון ספרינט');
  assert.equal(m.status, 'scheduled');
  assert.deepEqual(m.attendees, ['u1', 'u2']);
});

test('createMeeting: rejects invalid meeting type', () => {
  const mn = new MeetingNotes();
  assert.throws(
    () =>
      mn.createMeeting({
        title_he: 'x',
        title_en: 'x',
        date: '2026-04-11',
        attendees: [],
        organizer: 'u1',
        meetingType: 'not-real',
      }),
    err => err instanceof MeetingError && err.code === 'BAD_TYPE'
  );
});

test('createMeeting: all 7 meeting types are valid', () => {
  assert.deepEqual(
    VALID_MEETING_TYPES.slice().sort(),
    ['1-on-1', 'board', 'customer', 'planning', 'retro', 'review', 'standup'].sort()
  );
  for (const t of VALID_MEETING_TYPES) {
    const mn = new MeetingNotes();
    const m = mn.createMeeting({
      title_he: 'x',
      title_en: 'x',
      date: '2026-04-11',
      attendees: ['u1'],
      organizer: 'u1',
      meetingType: t,
    });
    assert.equal(m.meetingType, t);
    assert.ok(MEETING_TYPES[t].he);
    assert.ok(MEETING_TYPES[t].en);
  }
});

test('createMeeting: missing title / organizer is rejected', () => {
  const mn = new MeetingNotes();
  assert.throws(
    () =>
      mn.createMeeting({
        date: '2026-04-11',
        meetingType: 'standup',
        organizer: 'u1',
      }),
    err => err.code === 'MISSING_TITLE'
  );
  assert.throws(
    () =>
      mn.createMeeting({
        title_he: 'x',
        title_en: 'x',
        meetingType: 'standup',
      }),
    err => err.code === 'MISSING_ORGANIZER'
  );
});

// ═══════════════════════════════════════════════════════════════════════
// 2. notes: append-only
// ═══════════════════════════════════════════════════════════════════════

test('addNote: appends and transitions meeting to in-progress', () => {
  const { mn, meetingId } = buildSeed();
  const note = mn.addNote({
    meetingId,
    content: 'נושא ראשון: סטטוס משימות השבוע',
    author: 'u1',
    timestamp: '2026-04-10T08:05:00Z',
  });
  assert.ok(note.id.startsWith('note_'));
  assert.equal(note.retracted, false);
  assert.equal(mn.getMeeting(meetingId).status, 'in-progress');
  assert.equal(mn.listNotes(meetingId).length, 1);
});

test('addNote + retractNote: retraction is soft (history preserved)', () => {
  const { mn, meetingId } = buildSeed();
  const a = mn.addNote({ meetingId, content: 'הערה אחת', author: 'u1' });
  const b = mn.addNote({ meetingId, content: 'הערה שנייה', author: 'u2' });
  mn.retractNote(a.id, 'off-topic');
  assert.equal(mn.listNotes(meetingId).length, 1);
  assert.equal(mn.listNotes(meetingId, { includeRetracted: true }).length, 2);
  assert.equal(mn.listNotes(meetingId)[0].id, b.id);
  // The retracted note is STILL in storage with the flag on.
  const all = mn.listNotes(meetingId, { includeRetracted: true });
  const retracted = all.find(n => n.id === a.id);
  assert.equal(retracted.retracted, true);
  assert.equal(retracted.retractedReason, 'off-topic');
});

// ═══════════════════════════════════════════════════════════════════════
// 3. action item extraction
// ═══════════════════════════════════════════════════════════════════════

test('extractActionItems: Hebrew markers (פעולה / אחראי / עד)', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content:
      'פעולה: להכין דוח מכירות רבעוני. אחראי: @dani. עד: 2026-04-15',
  });
  const actions = mn.extractActionItems(meetingId);
  assert.equal(actions.length, 1);
  assert.match(actions[0].text, /דוח מכירות רבעוני/);
  assert.equal(actions[0].owner, 'dani');
  assert.ok(actions[0].dueDate);
  assert.equal(actions[0].dueDate.startsWith('2026-04-15'), true);
  assert.equal(actions[0].priority, 'medium');
});

test('extractActionItems: English markers (action / owner / by)', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u2',
    content:
      'Action: ship the new dashboard. Owner: @liora. By: 2026-05-01. Priority: high',
  });
  const actions = mn.extractActionItems(meetingId);
  assert.equal(actions.length, 1);
  assert.match(actions[0].text, /ship the new dashboard/i);
  assert.equal(actions[0].owner, 'liora');
  assert.equal(actions[0].priority, 'high');
  assert.ok(actions[0].dueDate.startsWith('2026-05-01'));
});

test('extractActionItems: todo marker + urgent token', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u3',
    content: 'todo: fix the login page (URGENT). owner: mario',
  });
  const actions = mn.extractActionItems(meetingId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].priority, 'high');
  assert.equal(actions[0].owner, 'mario');
});

test('extractActionItems: Hebrew urgent token (דחוף) bumps priority', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content: 'לעשות: לסגור דוח מע"מ דחוף. אחראי: avi',
  });
  const actions = mn.extractActionItems(meetingId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].priority, 'high');
  assert.equal(actions[0].owner, 'avi');
});

test('extractActionItems: multi-sentence note yields multiple actions', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content:
      'פעולה: לקבוע פגישת סקירה. אחראי: @yael. action: update runbook. owner: dani. todo: invite new vendor. owner: rami',
  });
  const actions = mn.extractActionItems(meetingId);
  assert.equal(actions.length, 3);
  const owners = actions.map(a => a.owner).sort();
  assert.deepEqual(owners, ['dani', 'rami', 'yael']);
});

test('extractActionItems: stand-alone helper works without a meeting', () => {
  const actions = extractActionsFromContent(
    'Action: buy office supplies. by: tomorrow. priority: low'
  );
  assert.equal(actions.length, 1);
  assert.match(actions[0].text, /buy office supplies/i);
  assert.equal(actions[0].priority, 'low');
  assert.ok(actions[0].dueDate);
});

test('parseDueDate: ISO / dd.mm.yyyy / relative / Hebrew', () => {
  assert.ok(parseDueDate('2026-04-15').startsWith('2026-04-15'));
  assert.ok(parseDueDate('15.04.2026').startsWith('2026-04-15'));
  assert.ok(parseDueDate('tomorrow'));
  assert.ok(parseDueDate('מחר'));
  assert.ok(parseDueDate('in 3 days'));
  assert.ok(parseDueDate('בעוד 3 ימים'));
  assert.equal(parseDueDate('total nonsense ###'), null);
});

// ═══════════════════════════════════════════════════════════════════════
// 4. decision extraction
// ═══════════════════════════════════════════════════════════════════════

test('extractDecisions: Hebrew markers (החלטה / הוחלט / סוכם)', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content: 'החלטה: לעבור ל-Postgres. הוחלט: גיוס שני מפתחים נוספים',
  });
  const decs = mn.extractDecisions(meetingId);
  assert.equal(decs.length, 2);
  assert.match(decs[0].text, /Postgres/);
  assert.match(decs[1].text, /שני מפתחים/);
  assert.equal(decs[0].author, 'u1');
});

test('extractDecisions: English markers (decision / decided / agreed)', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u2',
    content: 'Decision: adopt OKRs. agreed: monthly review cadence',
  });
  const decs = mn.extractDecisions(meetingId);
  assert.equal(decs.length, 2);
  const texts = decs.map(d => d.text.toLowerCase());
  assert.ok(texts.some(t => t.includes('adopt okrs')));
  assert.ok(texts.some(t => t.includes('monthly review')));
});

test('extractDecisions: stand-alone helper', () => {
  const decs = extractDecisionsFromContent(
    'סוכם: להגדיל את התקציב ב-15%. decision: pause feature X'
  );
  assert.equal(decs.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════
// 5. summarization
// ═══════════════════════════════════════════════════════════════════════

test('summarize: first sentence of each note + action tail', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({ meetingId, author: 'u1', content: 'פתיחה ושיחה כללית. נקודות פרטניות.' });
  mn.addNote({
    meetingId,
    author: 'u2',
    content: 'דיון תקציב. פעולה: לעדכן גיליון. אחראי: @dani. עד: 2026-04-20',
  });
  const s = mn.summarize(meetingId, { maxLength: 500 });
  assert.match(s.summary, /פתיחה ושיחה כללית/);
  assert.match(s.summary, /דיון תקציב/);
  assert.match(s.summary, /משימות|Actions/);
  assert.equal(s.actionCount, 1);
  assert.equal(s.truncated, false);
});

test('summarize: truncates to maxLength and marks truncated=true', () => {
  const { mn, meetingId } = buildSeed();
  for (let i = 0; i < 30; i++) {
    mn.addNote({
      meetingId,
      author: 'u1',
      content: `נושא מספר ${i}: דיון מפורט ארוך וארוך מאוד עם פרטים רבים.`,
    });
  }
  const s = mn.summarize(meetingId, { maxLength: 200 });
  assert.equal(s.truncated, true);
  assert.ok(s.summary.length <= 200);
  assert.match(s.summary, /…$/);
});

// ═══════════════════════════════════════════════════════════════════════
// 6. markdown export (bilingual)
// ═══════════════════════════════════════════════════════════════════════

test('exportMarkdown: bilingual sections present + RTL wrapper', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content: 'החלטה: לעבור ל-Postgres. פעולה: להכין migration plan. אחראי: @dani. עד: 2026-04-15',
  });
  const md = mn.exportMarkdown(meetingId);
  assert.match(md, /# סטנדאפ יומי \/ Daily Standup/);
  assert.match(md, /סוג \/ Type/);
  assert.match(md, /הערות \(Notes\)/);
  assert.match(md, /החלטות \/ Decisions/);
  assert.match(md, /משימות \/ Action Items/);
  assert.match(md, /<div dir="rtl">/);
  assert.match(md, /Postgres/);
  assert.match(md, /dani/);
  // Table headers.
  assert.match(md, /אחראי \/ Owner/);
  assert.match(md, /עדיפות \/ Priority/);
});

test('exportPDF: structured payload has he+en on every section', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content: 'פעולה: לעדכן אתר. אחראי: @dan. priority: low',
  });
  const pdf = mn.exportPDF(meetingId);
  assert.equal(pdf.format, 'pdf-payload-v1');
  assert.equal(pdf.dir, 'rtl');
  const keys = pdf.sections.map(s => s.key);
  assert.deepEqual(keys.sort(), ['actions', 'decisions', 'notes']);
  for (const sec of pdf.sections) {
    assert.ok(sec.title_he);
    assert.ok(sec.title_en);
  }
  const actionSec = pdf.sections.find(s => s.key === 'actions');
  assert.equal(actionSec.rows.length, 1);
  assert.equal(actionSec.rows[0].owner, 'dan');
  assert.equal(actionSec.rows[0].priority, 'low');
});

// ═══════════════════════════════════════════════════════════════════════
// 7. task system linking (mock)
// ═══════════════════════════════════════════════════════════════════════

test('linkToTasks: emits tasks for every action via mock system', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content: 'פעולה: לכתוב בדיקות. אחראי: @qa. action: deploy. owner: ops',
  });
  const calls = [];
  const mockSystem = {
    createTask(p) {
      calls.push(p);
      return { id: `ext_${calls.length}` };
    },
  };
  const created = mn.linkToTasks(meetingId, mockSystem);
  assert.equal(created.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(created[0].taskId, 'ext_1');
  assert.equal(created[1].taskId, 'ext_2');
  assert.equal(created[0].payload.source.meetingId, meetingId);
});

// ═══════════════════════════════════════════════════════════════════════
// 8. follow-up scheduling
// ═══════════════════════════════════════════════════════════════════════

test('followUp: schedules bilingual reminder with open-action snapshot', () => {
  const { mn, meetingId } = buildSeed();
  mn.addNote({
    meetingId,
    author: 'u1',
    content: 'פעולה: להעביר מסמך. אחראי: dani',
  });
  const fup = mn.followUp(meetingId, 7);
  assert.ok(fup.id.startsWith('fup_'));
  assert.equal(fup.daysAhead, 7);
  assert.equal(fup.openActionCount, 1);
  assert.match(fup.message_he, /סטנדאפ/);
  assert.match(fup.message_en, /Daily Standup/);
  assert.equal(fup.actions.length, 1);
  assert.equal(fup.actions[0].owner, 'dani');
});

test('followUp: negative days clamp to 1 (never in the past)', () => {
  const { mn, meetingId } = buildSeed();
  const fup = mn.followUp(meetingId, -5);
  assert.equal(fup.daysAhead, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// 9. search (TF-IDF)
// ═══════════════════════════════════════════════════════════════════════

test('searchMeetings: TF-IDF ranks the best match first', () => {
  const mn = new MeetingNotes();
  const a = mn.createMeeting({
    title_he: 'ישיבת דירקטוריון רבעונית',
    title_en: 'Board Meeting Q2',
    date: '2026-04-01',
    attendees: ['u1', 'u2'],
    organizer: 'u1',
    meetingType: 'board',
  });
  const b = mn.createMeeting({
    title_he: 'תכנון ספרינט',
    title_en: 'Sprint Planning',
    date: '2026-04-02',
    attendees: ['u3', 'u4'],
    organizer: 'u3',
    meetingType: 'planning',
  });
  mn.addNote({ meetingId: a.id, author: 'u1', content: 'דיון על תקציב הדירקטוריון' });
  mn.addNote({ meetingId: b.id, author: 'u3', content: 'דיון על משימות ספרינט' });

  const hits = mn.searchMeetings('דירקטוריון');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].meetingId, a.id);
});

test('searchMeetings: filters by type, organizer, attendees, and date range', () => {
  const mn = new MeetingNotes();
  mn.createMeeting({
    title_he: 'פגישת לקוח 1',
    title_en: 'Customer 1',
    date: '2026-03-01',
    attendees: ['u1'],
    organizer: 'u1',
    meetingType: 'customer',
  });
  mn.createMeeting({
    title_he: 'פגישת לקוח 2',
    title_en: 'Customer 2',
    date: '2026-04-01',
    attendees: ['u2'],
    organizer: 'u2',
    meetingType: 'customer',
  });
  mn.createMeeting({
    title_he: 'סטנדאפ לקוח',
    title_en: 'Standup',
    date: '2026-04-05',
    attendees: ['u1', 'u2'],
    organizer: 'u1',
    meetingType: 'standup',
  });
  // type filter
  const byType = mn.searchMeetings('לקוח', { type: 'customer' });
  assert.equal(byType.length, 2);
  // organizer filter
  const byOrg = mn.searchMeetings('לקוח', { organizer: 'u2' });
  assert.equal(byOrg.length, 1);
  // attendees filter
  const byAtt = mn.searchMeetings('לקוח', { attendees: ['u1'] });
  assert.ok(byAtt.length >= 1);
  // date range filter
  const byDate = mn.searchMeetings('לקוח', {
    dateRange: { from: '2026-03-15', to: '2026-04-10' },
  });
  assert.equal(byDate.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════
// 10. related meetings
// ═══════════════════════════════════════════════════════════════════════

test('relatedMeetings: ranks by attendee overlap + topic cosine', () => {
  const mn = new MeetingNotes();
  const base = mn.createMeeting({
    title_he: 'סקירה טכנית',
    title_en: 'Tech Review',
    date: '2026-04-01',
    attendees: ['alice', 'bob', 'carol'],
    organizer: 'alice',
    meetingType: 'review',
  });
  const sibling = mn.createMeeting({
    title_he: 'סקירה טכנית נוספת',
    title_en: 'Another Tech Review',
    date: '2026-04-08',
    attendees: ['alice', 'bob'],
    organizer: 'alice',
    meetingType: 'review',
  });
  const stranger = mn.createMeeting({
    title_he: 'פגישת שיווק',
    title_en: 'Marketing',
    date: '2026-04-09',
    attendees: ['dave', 'eve'],
    organizer: 'dave',
    meetingType: 'planning',
  });
  mn.addNote({ meetingId: base.id, author: 'alice', content: 'ארכיטקטורה ועומסים' });
  mn.addNote({
    meetingId: sibling.id,
    author: 'alice',
    content: 'ארכיטקטורה ועומסים במערכת',
  });
  mn.addNote({ meetingId: stranger.id, author: 'dave', content: 'קמפיין חדש' });

  const rel = mn.relatedMeetings(base.id);
  assert.ok(rel.length >= 1);
  assert.equal(rel[0].meetingId, sibling.id);
  const strangerHit = rel.find(r => r.meetingId === stranger.id);
  if (strangerHit) {
    assert.ok(strangerHit.score < rel[0].score);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 11. attendance
// ═══════════════════════════════════════════════════════════════════════

test('attendance: rolls up minutes/hours per person + period filter', () => {
  const mn = new MeetingNotes();
  mn.createMeeting({
    title_he: 'a',
    title_en: 'a',
    date: '2026-03-01',
    attendees: ['u1', 'u2'],
    organizer: 'u1',
    meetingType: 'standup',
  }); // 15 min
  mn.createMeeting({
    title_he: 'b',
    title_en: 'b',
    date: '2026-03-10',
    attendees: ['u1'],
    organizer: 'u1',
    meetingType: 'planning',
  }); // 60 min
  mn.createMeeting({
    title_he: 'c',
    title_en: 'c',
    date: '2026-04-05',
    attendees: ['u1'],
    organizer: 'u2',
    meetingType: 'review',
  }); // 45 min

  const total = mn.attendance({ attendeeId: 'u1' });
  assert.equal(total.meetingCount, 3);
  assert.equal(total.totalMinutes, 15 + 60 + 45);
  assert.equal(total.totalHours, Math.round(((15 + 60 + 45) / 60) * 100) / 100);
  assert.match(total.label_he, /3 פגישות/);

  const windowed = mn.attendance({
    attendeeId: 'u1',
    period: { from: '2026-04-01', to: '2026-04-30' },
  });
  assert.equal(windowed.meetingCount, 1);
  assert.equal(windowed.totalMinutes, 45);
});

// ═══════════════════════════════════════════════════════════════════════
// 12. tokenizer sanity (powers search)
// ═══════════════════════════════════════════════════════════════════════

test('tokenize: strips niqqud + stopwords + normalises final letters', () => {
  const a = tokenize('שָׁלוֹם עוֹלָם');
  const b = tokenize('שלום עולם');
  assert.deepEqual(a, b);
  // Hebrew final-letter normalisation.
  const c = tokenize('שלום');
  const d = tokenize('שלומ');
  assert.deepEqual(c, d);
  // Stopwords dropped.
  const e = tokenize('של הוא and the system');
  assert.deepEqual(e, ['system']);
});
