/**
 * Tests — BulletinBoard
 * Zero-dep (node:assert + node:test).
 *
 * Covers:
 *   - Post lifecycle (create → moderate → publish → archive)
 *   - Pinning (including expiry)
 *   - Moderation queue
 *   - Digital signage rotation (normal + fallback)
 *   - Emergency takeover
 *   - Reactions + comments
 *   - QR code generation
 *   - Accessibility mode
 *   - Retention analytics
 *   - Archive preservation (לא מוחקים)
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BulletinBoard,
  POST_TYPES,
  CATEGORIES,
  REACTION_TYPES,
  POST_STATE,
} = require('../../src/comms/bulletin-board');

// ---- helpers ----------------------------------------------------------------

function makeBoard(opts) {
  return new BulletinBoard(opts);
}

function basePost(overrides = {}) {
  return Object.assign({
    type: 'announcement',
    title_he: 'ישיבת צוות ביום שלישי',
    title_en: 'Team meeting Tuesday',
    content: { he: 'ישיבת צוות בחדר הישיבות', en: 'Team meeting in conference room' },
    postedBy: 'hr-manager',
    category: 'hr-announcements',
  }, overrides);
}

// ---- tests ------------------------------------------------------------------

test('constants export correctly', () => {
  assert.ok(Array.isArray(POST_TYPES));
  assert.ok(POST_TYPES.includes('announcement'));
  assert.ok(POST_TYPES.includes('safety-alert'));
  assert.ok(POST_TYPES.includes('menu'));
  assert.ok(CATEGORIES['safety-notices']);
  assert.equal(CATEGORIES['safety-notices'].he, 'בטיחות ורווחה');
  assert.deepEqual(REACTION_TYPES, ['like', 'thanks', 'relevant']);
  assert.equal(POST_STATE.PUBLISHED, 'published');
});

test('createPost: rejects invalid type', () => {
  const b = makeBoard();
  assert.throws(() => b.createPost({ type: 'not-real', title_en: 'x' }), /type must be one of/);
});

test('createPost: rejects missing titles', () => {
  const b = makeBoard();
  assert.throws(() => b.createPost({ type: 'announcement' }), /title_he or title_en required/);
});

test('createPost: queues for moderation by default', () => {
  const b = makeBoard();
  const p = b.createPost(basePost());
  assert.equal(p.state, POST_STATE.PENDING);
  const queue = b.pendingModeration({});
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, p.id);
});

test('createPost: pre-approved authors bypass moderation', () => {
  const b = makeBoard({ preApprovedAuthors: ['ceo'] });
  const p = b.createPost(basePost({ postedBy: 'ceo' }));
  assert.equal(p.state, POST_STATE.PUBLISHED);
  assert.equal(b.pendingModeration({}).length, 0);
});

test('createPost: autoModerate=false publishes immediately', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  assert.equal(p.state, POST_STATE.PUBLISHED);
});

test('approvePost moves from queue to published', () => {
  const b = makeBoard();
  const p = b.createPost(basePost());
  const approved = b.approvePost({ postId: p.id, moderator: 'mod-01' });
  assert.equal(approved.state, POST_STATE.PUBLISHED);
  assert.equal(approved.moderatedBy, 'mod-01');
  assert.equal(b.pendingModeration({}).length, 0);
});

test('rejectPost marks state rejected and drops from queue', () => {
  const b = makeBoard();
  const p = b.createPost(basePost());
  const rejected = b.rejectPost({ postId: p.id, moderator: 'mod-01', reason: 'duplicate' });
  assert.equal(rejected.state, POST_STATE.REJECTED);
  assert.equal(rejected.rejectionReason, 'duplicate');
  assert.equal(b.pendingModeration({}).length, 0);
});

test('listCurrent shows only published, non-expired posts', () => {
  const b = makeBoard({ autoModerate: false });
  const past = new Date(Date.now() - 3600_000).toISOString();
  const future = new Date(Date.now() + 3600_000).toISOString();
  const a = b.createPost(basePost({ title_en: 'A' }));
  const b2 = b.createPost(basePost({ title_en: 'B (expired)', expireAt: past }));
  const c = b.createPost(basePost({ title_en: 'C', expireAt: future }));
  const current = b.listCurrent({});
  const ids = current.map((p) => p.id);
  assert.ok(ids.includes(a.id));
  assert.ok(!ids.includes(b2.id));
  assert.ok(ids.includes(c.id));
});

test('listCurrent: safety-alerts float to the top', () => {
  const b = makeBoard({ autoModerate: false });
  b.createPost(basePost({ title_en: 'regular', type: 'announcement' }));
  b.createPost(basePost({ title_en: 'menu', type: 'menu', category: 'lunch-menus' }));
  const alert = b.createPost(basePost({
    title_en: 'EMERGENCY DRILL',
    type: 'safety-alert',
    category: 'safety-notices',
  }));
  const current = b.listCurrent({});
  assert.equal(current[0].id, alert.id);
});

test('listCurrent: filters by category and type', () => {
  const b = makeBoard({ autoModerate: false });
  b.createPost(basePost({ category: 'hr-announcements' }));
  b.createPost(basePost({ category: 'lunch-menus', type: 'menu' }));
  const menus = b.listCurrent({ category: 'lunch-menus' });
  assert.equal(menus.length, 1);
  assert.equal(menus[0].category, 'lunch-menus');
  const types = b.listCurrent({ type: 'menu' });
  assert.equal(types.length, 1);
  assert.equal(types[0].type, 'menu');
});

test('pinPost sticks post to top, unpinPost reverses it', () => {
  const b = makeBoard({ autoModerate: false });
  const a = b.createPost(basePost({ title_en: 'A' }));
  const pinned = b.createPost(basePost({ title_en: 'P' }));
  b.pinPost({ postId: pinned.id, untilDate: new Date(Date.now() + 3600_000) });
  const current = b.listCurrent({});
  assert.equal(current[0].id, pinned.id);
  b.unpinPost({ postId: pinned.id });
  const after = b.listCurrent({});
  // after unpin, pinned post is just a regular post — order by recency, so P still newer
  assert.ok(after.some((p) => p.id === a.id));
});

test('pinPost rejects invalid date', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  assert.throws(() => b.pinPost({ postId: p.id, untilDate: 'not-a-date' }), /valid date/);
});

test('pinPost: auto-unpins when pinUntil expires (via listCurrent)', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  const past = new Date(Date.now() - 1000);
  b.pinPost({ postId: p.id, untilDate: new Date(Date.now() + 60000) });
  // simulate pinUntil in the past by direct write (internal test)
  b.posts.get(p.id).pinUntil = past.toISOString();
  const current = b.listCurrent({});
  const found = current.find((x) => x.id === p.id);
  assert.equal(found.pinned, false);
});

test('archivePost preserves post but removes from current (never delete)', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  b.archivePost({ postId: p.id, archivedBy: 'admin' });
  assert.equal(b.listCurrent({}).length, 0);
  const archive = b.listArchive({});
  assert.equal(archive.length, 1);
  assert.equal(archive[0].id, p.id);
  assert.equal(archive[0].state, POST_STATE.ARCHIVED);
  assert.equal(archive[0].archivedBy, 'admin');
  // NEVER-DELETE invariant: original post still retrievable by id
  assert.ok(b.getPost(p.id));
});

test('pendingModeration: filters by submittedBy', () => {
  const b = makeBoard();
  b.createPost(basePost({ postedBy: 'user-1' }));
  b.createPost(basePost({ postedBy: 'user-2' }));
  assert.equal(b.pendingModeration({ submittedBy: 'user-1' }).length, 1);
  assert.equal(b.pendingModeration({ submittedBy: 'user-2' }).length, 1);
  assert.equal(b.pendingModeration({}).length, 2);
});

test('reactionsEnabled + react: increments counts', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  b.reactionsEnabled({ postId: p.id, types: ['like', 'thanks'] });
  b.react({ postId: p.id, userId: 'u1', type: 'like' });
  b.react({ postId: p.id, userId: 'u2', type: 'like' });
  b.react({ postId: p.id, userId: 'u1', type: 'like' }); // dedupe same user
  b.react({ postId: p.id, userId: 'u3', type: 'thanks' });
  const post = b.getPost(p.id);
  assert.equal(post.reactions.like, 2);
  assert.equal(post.reactions.thanks, 1);
  assert.throws(
    () => b.react({ postId: p.id, userId: 'u1', type: 'relevant' }),
    /not enabled/
  );
});

test('commentsEnabled + addComment: moderated by default', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  b.commentsEnabled({ postId: p.id });
  const c = b.addComment({ postId: p.id, userId: 'u1', text: 'נהדר!' });
  assert.equal(c.state, 'pending');
  assert.equal(b.listComments({ postId: p.id, state: 'approved' }).length, 0);
  b.approveComment({ postId: p.id, commentId: c.id });
  assert.equal(b.listComments({ postId: p.id, state: 'approved' }).length, 1);
});

test('comments disabled by default — addComment throws', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  assert.throws(() => b.addComment({ postId: p.id, userId: 'u1', text: 'x' }), /disabled/);
});

test('rotationSchedule persists items and duration', () => {
  const b = makeBoard({ autoModerate: false });
  const p1 = b.createPost(basePost({ title_en: 'P1' }));
  const p2 = b.createPost(basePost({ title_en: 'P2' }));
  const s = b.rotationSchedule({
    locationId: 'factory-floor-1',
    items: [p1.id, p2.id],
    duration: 10000,
  });
  assert.equal(s.locationId, 'factory-floor-1');
  assert.equal(s.items.length, 2);
  assert.equal(s.duration, 10000);
});

test('digitalSignageFeed: returns rotation items + Palantir dark theme', () => {
  const b = makeBoard({ autoModerate: false });
  const p1 = b.createPost(basePost({ title_en: 'P1' }));
  const p2 = b.createPost(basePost({ title_en: 'P2' }));
  b.rotationSchedule({ locationId: 'loc-a', items: [p1.id, p2.id], duration: 5000 });
  const feed = b.digitalSignageFeed({ locationId: 'loc-a' });
  assert.equal(feed.mode, 'normal');
  assert.equal(feed.items.length, 2);
  assert.equal(feed.duration, 5000);
  assert.equal(feed.theme.name, 'palantir-dark');
  assert.equal(feed.theme.direction, 'rtl');
  assert.ok(feed.theme.bg);
});

test('digitalSignageFeed: fallback shows recent posts when no schedule', () => {
  const b = makeBoard({ autoModerate: false });
  b.createPost(basePost({ title_en: 'A' }));
  b.createPost(basePost({ title_en: 'B' }));
  const feed = b.digitalSignageFeed({ locationId: 'loc-unknown' });
  assert.ok(feed.items.length >= 2);
});

test('digitalSignageFeed: safety-alerts always included', () => {
  const b = makeBoard({ autoModerate: false });
  const normal = b.createPost(basePost({ title_en: 'Normal' }));
  const alert = b.createPost(basePost({
    title_en: 'SAFETY',
    type: 'safety-alert',
    category: 'safety-notices',
  }));
  b.rotationSchedule({ locationId: 'loc-b', items: [normal.id], duration: 5000 });
  const feed = b.digitalSignageFeed({ locationId: 'loc-b' });
  assert.ok(feed.items.some((p) => p.id === alert.id));
});

test('emergencyTakeover: overrides feed with emergency theme', () => {
  const b = makeBoard({ autoModerate: false });
  const p1 = b.createPost(basePost({ title_en: 'Normal' }));
  b.rotationSchedule({ locationId: 'loc-c', items: [p1.id], duration: 5000 });
  const emrg = b.emergencyTakeover({
    locationId: 'loc-c',
    emergencyPost: {
      title_he: 'אירוע חירום - פינוי המבנה',
      title_en: 'EMERGENCY - EVACUATE BUILDING',
      content: { he: 'יציאה דרך דלתות הפינוי', en: 'Exit via emergency doors' },
    },
  });
  const feed = b.digitalSignageFeed({ locationId: 'loc-c' });
  assert.equal(feed.mode, 'emergency');
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].id, emrg.id);
  assert.equal(feed.theme.name, 'palantir-emergency');
  assert.equal(feed.theme.accent, '#ff2a2a');
});

test('clearEmergency: restores normal feed', () => {
  const b = makeBoard({ autoModerate: false });
  const p1 = b.createPost(basePost({ title_en: 'Normal' }));
  b.rotationSchedule({ locationId: 'loc-d', items: [p1.id], duration: 5000 });
  b.emergencyTakeover({
    locationId: 'loc-d',
    emergencyPost: { title_he: 'x', title_en: 'x' },
  });
  b.clearEmergency({ locationId: 'loc-d' });
  const feed = b.digitalSignageFeed({ locationId: 'loc-d' });
  assert.equal(feed.mode, 'normal');
});

test('emergencyTakeover: rejects missing title', () => {
  const b = makeBoard();
  assert.throws(
    () => b.emergencyTakeover({ locationId: 'x', emergencyPost: {} }),
    /title_he\/title_en required/
  );
});

test('qrCodeForMobile: returns signed URL and matrix', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  const qr = b.qrCodeForMobile({ postId: p.id, baseUrl: 'https://bulletin.example' });
  assert.equal(qr.postId, p.id);
  assert.ok(qr.url.includes(p.id));
  assert.ok(qr.signedUrl.includes('?t='));
  assert.ok(qr.token.length > 0);
  assert.equal(qr.matrix.length, 21);
  assert.equal(qr.matrix[0].length, 21);
});

test('accessibilityMode: sets high-contrast + large-font', () => {
  const b = makeBoard();
  const profile = b.accessibilityMode({
    'high-contrast': true,
    'large-font': true,
    'screen-reader-friendly': true,
  });
  assert.equal(profile['high-contrast'], true);
  assert.equal(profile['large-font'], true);
  assert.equal(profile['screen-reader-friendly'], true);
  // Signage feed carries profile through
  const feed = b.digitalSignageFeed({ locationId: 'loc-e' });
  assert.equal(feed.accessibility['high-contrast'], true);
  assert.equal(feed.accessibility['large-font'], true);
});

test('accessibilityMode: accepts camelCase aliases', () => {
  const b = makeBoard();
  const profile = b.accessibilityMode({ highContrast: true, largeFont: true });
  assert.equal(profile['high-contrast'], true);
  assert.equal(profile['large-font'], true);
});

test('retentionAnalytics: computes engagement correctly', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost());
  b.reactionsEnabled({ postId: p.id, types: ['like', 'thanks'] });
  b.commentsEnabled({ postId: p.id });
  for (let i = 0; i < 100; i += 1) b.recordImpression({ postId: p.id });
  for (let i = 0; i < 25; i += 1) b.recordView({ postId: p.id });
  b.react({ postId: p.id, userId: 'u1', type: 'like' });
  b.react({ postId: p.id, userId: 'u2', type: 'thanks' });
  const c = b.addComment({ postId: p.id, userId: 'u1', text: 'ok' });
  b.approveComment({ postId: p.id, commentId: c.id });
  const metrics = b.retentionAnalytics({ postId: p.id });
  assert.equal(metrics.impressions, 100);
  assert.equal(metrics.views, 25);
  assert.equal(metrics.totalReactions, 2);
  assert.equal(metrics.comments, 1);
  // engagement = (25 + 2 + 1) / 100 = 0.28
  assert.equal(metrics.engagementRate, 0.28);
  assert.equal(metrics.clickThroughRate, 0.25);
});

test('audit log: appends and never clears (לא מוחקים)', () => {
  const b = makeBoard();
  const p = b.createPost(basePost());
  b.approvePost({ postId: p.id, moderator: 'mod' });
  b.pinPost({ postId: p.id, untilDate: new Date(Date.now() + 60000) });
  b.archivePost({ postId: p.id });
  const actions = b.auditLog.map((e) => e.action);
  assert.ok(actions.includes('createPost'));
  assert.ok(actions.includes('approvePost'));
  assert.ok(actions.includes('pinPost'));
  assert.ok(actions.includes('archivePost'));
  // Archive kept the record accessible
  const restored = b.getPost(p.id);
  assert.ok(restored);
  assert.equal(restored.state, POST_STATE.ARCHIVED);
});

test('stats: summarizes board state', () => {
  const b = makeBoard();
  const p1 = b.createPost(basePost({ title_en: '1' }));
  const p2 = b.createPost(basePost({ title_en: '2' }));
  b.approvePost({ postId: p1.id, moderator: 'm' });
  b.rejectPost({ postId: p2.id, moderator: 'm', reason: 'off-topic' });
  const s = b.stats();
  assert.equal(s.total, 2);
  assert.equal(s.published, 1);
  assert.equal(s.rejected, 1);
  assert.ok(s.auditEntries >= 3);
});

test('all post types can be created', () => {
  const b = makeBoard({ autoModerate: false });
  for (const t of POST_TYPES) {
    const p = b.createPost(basePost({ type: t, title_en: `type-${t}` }));
    assert.equal(p.type, t);
  }
});

test('bilingual fields preserved through create → list → archive', () => {
  const b = makeBoard({ autoModerate: false });
  const p = b.createPost(basePost({
    title_he: 'מבצע פסח 2026',
    title_en: 'Passover 2026 Campaign',
    content: { he: 'פרטים בהמשך', en: 'Details soon' },
  }));
  const current = b.listCurrent({});
  assert.equal(current[0].title_he, 'מבצע פסח 2026');
  assert.equal(current[0].title_en, 'Passover 2026 Campaign');
  assert.equal(current[0].content.he, 'פרטים בהמשך');
  b.archivePost({ postId: p.id });
  const arc = b.listArchive({});
  assert.equal(arc[0].title_he, 'מבצע פסח 2026');
});
