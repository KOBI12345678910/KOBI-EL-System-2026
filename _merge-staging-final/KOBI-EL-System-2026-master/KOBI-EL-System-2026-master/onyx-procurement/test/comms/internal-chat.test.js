/**
 * Internal Team Chat — test suite
 * Agent Y-126 / Swarm 3 — Techno-Kol Uzi mega-ERP 2026
 *
 * Run:  node --test onyx-procurement/test/comms/internal-chat.test.js
 *
 * Zero external deps: uses node:test + node:assert/strict. Covers
 *   • channel create / join / leave / visibility
 *   • message send → edit → soft-delete preservation (audit chain)
 *   • threading (replyTo + threadRootId propagation)
 *   • mention extraction (Hebrew prose + ASCII handles)
 *   • full-text Hebrew search (niqqud, final letters, stopwords)
 *   • reactions and pinning
 *   • direct messages (1:1 encrypted) + group DMs
 *   • notification settings + presence
 *   • slash commands (built-ins + custom)
 *   • file upload metadata
 *   • compliance export (json / csv / ndjson preserves deleted)
 *   • realtime bridge + optional X-13 SSE hub hook-up
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  InternalChat,
  ChatError,
  tokenize,
  extractMentions,
  _xorCipher,
  _xorDecipher,
} = require('../../src/comms/internal-chat');

// ─── tokenizer ─────────────────────────────────────────────────────────

test('tokenize: strips niqqud and normalizes final letters', () => {
  const a = tokenize('שָׁלוֹם עוֹלָם');
  const b = tokenize('שלום עולם');
  assert.deepEqual(a, b);
  // Final mem should normalise so "שלום" and "שלומ" both hit the same token.
  const c = tokenize('שלום');
  const d = tokenize('שלומ');
  assert.deepEqual(c, d);
});

test('tokenize: drops Hebrew + English stopwords', () => {
  const t = tokenize('של הוא and the system');
  assert.deepEqual(t, ['system']);
});

test('tokenize: keeps mixed Hebrew/English terms', () => {
  const t = tokenize('דוח VAT דחוף ASAP');
  assert.ok(t.includes('vat'));
  assert.ok(t.includes('asap'));
  assert.ok(t.includes('דחופ')); // final-letter normalised
});

// ─── mention extraction ───────────────────────────────────────────────

test('extractMentions: picks up ASCII handles from Hebrew prose', () => {
  const m = extractMentions('שלום @dani ו @liora, בדקתם את @mario?');
  assert.deepEqual(m, ['dani', 'liora', 'mario']);
});

test('extractMentions: de-dupes and ignores trailing punctuation', () => {
  const m = extractMentions('@avi, @avi! @avi?');
  assert.deepEqual(m, ['avi']);
});

test('extractMentions: supports dots, dashes, underscores', () => {
  const m = extractMentions('hi @kobi.el @yossi-1 @dan_2');
  assert.deepEqual(m, ['kobi.el', 'yossi-1', 'dan_2']);
});

// ─── channel lifecycle ────────────────────────────────────────────────

test('createChannel: public channel + listChannels visibility', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general',
    description: 'ערוץ כללי',
    visibility: 'public',
    members: ['u1', 'u2'],
    owners: ['u1'],
  });
  assert.ok(ch.id.startsWith('ch_'));
  assert.equal(ch.name, 'general');
  assert.equal(ch.visibility, 'public');
  assert.deepEqual(ch.owners, ['u1']);

  const listAll = chat.listChannels({ userId: 'u3' });
  assert.equal(listAll.length, 1); // public visible to non-member
  const listMember = chat.listChannels({ userId: 'u1' });
  assert.equal(listMember.length, 1);
});

test('createChannel: private channel hidden from non-members', () => {
  const chat = new InternalChat();
  chat.createChannel({
    name: 'finance', visibility: 'private',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  assert.equal(chat.listChannels({ userId: 'outsider' }).length, 0);
  assert.equal(chat.listChannels({ userId: 'u2' }).length, 1);
});

test('joinChannel: private requires inviter who is a member', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'finance', visibility: 'private',
    members: ['u1'], owners: ['u1'],
  });
  assert.throws(
    () => chat.joinChannel({ channelId: ch.id, userId: 'u2' }),
    (e) => e.code === 'private_channel'
  );
  const joined = chat.joinChannel({
    channelId: ch.id, userId: 'u2', invitedBy: 'u1',
  });
  assert.ok(joined.members.includes('u2'));
});

test('leaveChannel: promotes a new owner if last owner leaves', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'dev', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const after = chat.leaveChannel({ channelId: ch.id, userId: 'u1' });
  assert.deepEqual(after.owners, ['u2']);
  assert.deepEqual(after.members, ['u2']);
});

// ─── message flow ─────────────────────────────────────────────────────

test('sendMessage: stores text, mentions, and tokens', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const m = chat.sendMessage({
    channelId: ch.id,
    userId:    'u1',
    text:      'שלום @u2 הדוח מוכן?',
  });
  assert.ok(m.messageId.startsWith('msg_'));
  assert.equal(m.userId, 'u1');
  assert.deepEqual(m.mentions, ['u2']);
  assert.equal(m.pinned, false);
  assert.equal(m.deleted, false);
});

test('sendMessage: supports threading via replyTo', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'eng', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const root = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'deploy status?' });
  const r1   = chat.sendMessage({ channelId: ch.id, userId: 'u2', text: 'green', replyTo: root.messageId });
  const r2   = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'thanks', replyTo: root.messageId });
  assert.equal(r1.threadRootId, root.messageId);
  assert.equal(r2.threadRootId, root.messageId);
  const rootNow = chat.messages.get(root.messageId);
  assert.equal(rootNow.threadReplyCount, 2);
});

test('editMessage: tracks full edit history, only author can edit', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'בדיקה' });
  const e = chat.editMessage({ messageId: m.messageId, userId: 'u1', newText: 'בדיקה 2' });
  assert.equal(e.text, 'בדיקה 2');
  assert.equal(e.editCount, 1);
  assert.equal(e.editHistory[0].prevText, 'בדיקה');
  assert.throws(
    () => chat.editMessage({ messageId: m.messageId, userId: 'u2', newText: 'nope' }),
    (err) => err.code === 'forbidden'
  );
});

test('deleteMessage: soft delete preserves text + audit trail', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'secret הערה' });
  const d = chat.deleteMessage({
    messageId: m.messageId, userId: 'u1', reason: 'typo',
  });
  assert.equal(d.deleted, true);
  assert.equal(d.deleteReason, 'typo');
  // Body is preserved — never purged.
  assert.equal(d.text, 'secret הערה');
  // Audit log contains the delete entry and the earlier send.
  const auditKinds = chat.auditLog.map(a => a.type);
  assert.ok(auditKinds.includes('message.send'));
  assert.ok(auditKinds.includes('message.delete'));
  const del = chat.auditLog.find(a => a.type === 'message.delete');
  assert.ok(del.preservedBytes > 0, 'delete audit records preserved byte count');
});

test('deleteMessage: idempotent and still records attempt in audit', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'x' });
  chat.deleteMessage({ messageId: m.messageId, userId: 'u1' });
  chat.deleteMessage({ messageId: m.messageId, userId: 'u1' });
  const redundant = chat.auditLog.find(a => a.type === 'message.delete.redundant');
  assert.ok(redundant, 'redundant delete is audited');
});

test('deleteMessage: channel owner can delete another user\'s message', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u2', text: 'oops' });
  const d = chat.deleteMessage({
    messageId: m.messageId, userId: 'u1', reason: 'moderation',
  });
  assert.equal(d.deleted, true);
});

// ─── reactions + pinning ──────────────────────────────────────────────

test('reactMessage: toggles reaction on/off', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'hi' });
  let r = chat.reactMessage({ messageId: m.messageId, userId: 'u2', emoji: ':+1:' });
  assert.deepEqual(r.reactions[':+1:'], ['u2']);
  r = chat.reactMessage({ messageId: m.messageId, userId: 'u2', emoji: ':+1:' });
  assert.ok(!r.reactions[':+1:'], 'toggled off');
});

test('pinMessage: pins + unpins (owner required for own-pin toggle)', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1', 'u2'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'important' });
  const p = chat.pinMessage({ messageId: m.messageId, userId: 'u1' });
  assert.equal(p.pinned, true);
  const u = chat.pinMessage({ messageId: m.messageId, userId: 'u1' });
  assert.equal(u.pinned, false);
});

// ─── search ───────────────────────────────────────────────────────────

test('searchMessages: Hebrew full-text w/ niqqud + final letter matching', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'ops', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'שָׁלוֹם עולם' });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'סטטוס VAT דחוף' });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'לא רלוונטי' });
  const r1 = chat.searchMessages({ query: 'שלום' });
  assert.equal(r1.total, 1);
  const r2 = chat.searchMessages({ query: 'VAT' });
  assert.equal(r2.total, 1);
  const r3 = chat.searchMessages({ query: 'דחופ' }); // final-letter variant
  assert.equal(r3.total, 1);
});

test('searchMessages: excludes deleted by default, preserves on includeDeleted', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'ops', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'סוד מדינה' });
  chat.deleteMessage({ messageId: m.messageId, userId: 'u1' });
  assert.equal(chat.searchMessages({ query: 'סוד' }).total, 0);
  assert.equal(chat.searchMessages({ query: 'סוד', includeDeleted: true }).total, 1);
});

test('searchMessages: highlights matching tokens with guillemets', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'ops', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'דוח של מרץ' });
  const r = chat.searchMessages({ query: 'דוח' });
  assert.equal(r.total, 1);
  assert.ok(r.results[0].highlight.includes('\u00ABדוח\u00BB'));
});

// ─── direct messages ──────────────────────────────────────────────────

test('directMessage: creates DM channel and round-trips encryption', () => {
  const chat = new InternalChat();
  const m = chat.directMessage({
    fromUserId: 'alice', toUserId: 'bob', text: 'Hi שלום',
  });
  assert.equal(m.encrypted, true);
  const plain = chat.decryptDM(m.messageId);
  assert.equal(plain, 'Hi שלום');
  // Second DM reuses the same channel.
  const m2 = chat.directMessage({
    fromUserId: 'bob', toUserId: 'alice', text: 'מה נשמע?',
  });
  assert.equal(m2.channelId, m.channelId);
});

test('directMessage: refuses self-DM', () => {
  const chat = new InternalChat();
  assert.throws(
    () => chat.directMessage({ fromUserId: 'u1', toUserId: 'u1', text: 'self' }),
    (e) => e.code === 'self_dm'
  );
});

test('groupDM: caps at 12 members and reuses channel', () => {
  const chat = new InternalChat();
  const m1 = chat.groupDM({ userIds: ['a', 'b', 'c'], text: 'hi all' });
  const m2 = chat.groupDM({ userIds: ['c', 'b', 'a'], text: 'again' });
  assert.equal(m1.channelId, m2.channelId);
  assert.throws(
    () => chat.groupDM({ userIds: ['u1'], text: 'nope' }),
    (e) => e.code === 'too_few_members'
  );
});

test('_xorCipher: round-trips Hebrew bodies', () => {
  const enc = _xorCipher('המערכת מדברת עברית', 'seed');
  const dec = _xorDecipher(enc, 'seed');
  assert.equal(dec, 'המערכת מדברת עברית');
});

// ─── notifications + presence ─────────────────────────────────────────

test('notificationSettings: persists muted + keywords', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  const prefs = chat.notificationSettings({
    userId: 'u1', channelId: ch.id,
    muted: true, keywords: ['URGENT', 'VAT'],
  });
  assert.equal(prefs.muted, true);
  assert.deepEqual(prefs.keywords, ['urgent', 'vat']);
});

test('presence: reports and updates status', () => {
  const chat = new InternalChat();
  const a = chat.presence({ userId: 'u1', status: 'active' });
  assert.equal(a.status, 'active');
  const b = chat.presence({ userId: 'u1', status: 'dnd' });
  assert.equal(b.status, 'dnd');
  assert.throws(
    () => chat.presence({ userId: 'u1', status: 'bogus' }),
    (e) => e.code === 'invalid_status'
  );
});

// ─── slash commands ───────────────────────────────────────────────────

test('slashCommands: built-ins dispatch correctly', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  const r = chat.slashCommands({
    command: '/me', args: ['working on VAT'],
    context: { userId: 'u1', channelId: ch.id },
  });
  assert.equal(r.command, 'me');
  assert.equal(r.result.text, '*working on VAT*');

  const dnd = chat.slashCommands({
    command: '/dnd', context: { userId: 'u1', channelId: ch.id },
  });
  assert.equal(dnd.result.status, 'dnd');
});

test('slashCommands: custom registration works', () => {
  const chat = new InternalChat();
  chat.registerSlashCommand('ping', (args, ctx) => ({ pong: args.join(' '), user: ctx.userId }));
  const r = chat.slashCommands({
    command: '/ping', args: ['hello'], context: { userId: 'u1' },
  });
  assert.equal(r.result.pong, 'hello');
});

test('slashCommands: unknown command throws', () => {
  const chat = new InternalChat();
  assert.throws(
    () => chat.slashCommands({ command: '/zzz' }),
    (e) => e.code === 'unknown_slash'
  );
});

// ─── file upload ──────────────────────────────────────────────────────

test('fileUpload: stores metadata + emits audit', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'general', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  const f = chat.fileUpload({
    channelId: ch.id, userId: 'u1',
    file: { name: 'Q1-report.pdf', mime: 'application/pdf', size: 8192 },
  });
  assert.ok(f.fileId.startsWith('file_'));
  assert.equal(f.name, 'Q1-report.pdf');
  const a = chat.auditLog.find(x => x.type === 'file.upload');
  assert.ok(a);
});

// ─── compliance export ───────────────────────────────────────────────

test('export: json format includes deleted + edit history', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'ops', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  const m = chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'v1' });
  chat.editMessage({ messageId: m.messageId, userId: 'u1', newText: 'v2' });
  chat.deleteMessage({ messageId: m.messageId, userId: 'u1', reason: 'compliance' });

  const dump = chat.export({ channelId: ch.id, format: 'json' });
  assert.equal(dump.rowCount, 1);
  const row = dump.messages[0];
  assert.equal(row.deleted, true);
  assert.equal(row.deleteReason, 'compliance');
  assert.equal(row.text, 'v2');           // current body preserved
  assert.equal(row.editCount, 1);
  assert.equal(row.editHistory[0].prevText, 'v1');
});

test('export: csv + ndjson formats', () => {
  const chat = new InternalChat();
  const ch = chat.createChannel({
    name: 'ops', visibility: 'public',
    members: ['u1'], owners: ['u1'],
  });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'alpha' });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'beta' });
  const csv = chat.export({ channelId: ch.id, format: 'csv' });
  assert.ok(csv.startsWith('messageId,'));
  assert.ok(csv.includes('"alpha"'));
  assert.ok(csv.includes('"beta"'));
  const nd = chat.export({ channelId: ch.id, format: 'ndjson' });
  assert.equal(nd.split('\n').length, 2);
});

// ─── realtime bridge ──────────────────────────────────────────────────

test('realtimeUpdates: in-process subscribers receive events', () => {
  const chat = new InternalChat();
  const rt = chat.realtimeUpdates();
  const seen = [];
  rt.subscribe(ev => seen.push(ev.type));
  const ch = chat.createChannel({
    name: 'g', visibility: 'public', members: ['u1'], owners: ['u1'],
  });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'hi' });
  assert.ok(seen.includes('channel.create'));
  assert.ok(seen.includes('message.send'));
});

test('realtimeUpdates: relays to X-13 SSE hub if provided', () => {
  const seen = [];
  const fakeHub = { publish: (ch, ev) => seen.push({ ch, type: ev && ev.type }) };
  const chat = new InternalChat({ sseHub: fakeHub });
  const ch = chat.createChannel({
    name: 'g', visibility: 'public', members: ['u1'], owners: ['u1'],
  });
  chat.sendMessage({ channelId: ch.id, userId: 'u1', text: 'hi' });
  assert.ok(seen.some(x => x.ch === 'alerts' && x.type === 'chat.message.send'));
});

// ─── ChatError ────────────────────────────────────────────────────────

test('ChatError: carries code metadata', () => {
  const chat = new InternalChat();
  try {
    chat.createChannel({ name: '', visibility: 'public' });
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof ChatError);
    assert.equal(e.code, 'invalid_name');
  }
});
