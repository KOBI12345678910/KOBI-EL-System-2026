/**
 * NotificationCenter.test.jsx — Agent X-16 / Swarm 3
 * Render smoke tests for the NotificationCenter component.
 *
 * Framework-agnostic: works under `vitest`, `jest`, and `node --test`.
 * Uses `react-dom/server` renderToString so no JSDOM is required.
 *
 * Run:
 *   npx vitest run src/components/NotificationCenter.test.jsx
 *   # or
 *   node --test src/components/NotificationCenter.test.jsx
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import NotificationCenter, {
  PALANTIR_DARK,
  CATEGORIES,
  CATEGORY_LABELS,
  SNOOZE_DURATIONS,
  NOTIFICATION_CENTER_HE,
  timeAgoHe,
} from './NotificationCenter.jsx';

/* ------------------------------------------------------------------ */
/*  Minimal assertion helper                                            */
/* ------------------------------------------------------------------ */

function assert(cond, msg) {
  if (!cond) {
    const err = new Error('Assertion failed: ' + (msg || ''));
    // eslint-disable-next-line no-console
    console.error(err);
    throw err;
  }
}

function eq(a, b, msg) {
  assert(a === b, `${msg || ''} — expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                                */
/* ------------------------------------------------------------------ */

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('Palantir dark theme exposes canonical colors', () => {
  eq(PALANTIR_DARK.bg, '#0b0d10', 'bg');
  eq(PALANTIR_DARK.panel, '#13171c', 'panel');
  eq(PALANTIR_DARK.accent, '#4a9eff', 'accent');
  assert(PALANTIR_DARK.badge && PALANTIR_DARK.badge.length > 0, 'badge color missing');
});

test('CATEGORIES exposes all five expected categories', () => {
  eq(CATEGORIES.length, 5, 'expected 5 categories');
  assert(CATEGORIES.includes('invoice'), 'missing invoice');
  assert(CATEGORIES.includes('payment'), 'missing payment');
  assert(CATEGORIES.includes('alert'), 'missing alert');
  assert(CATEGORIES.includes('system'), 'missing system');
  assert(CATEGORIES.includes('approval'), 'missing approval');
});

test('Category labels are in Hebrew', () => {
  assert(CATEGORY_LABELS.invoice.length > 0, 'invoice label empty');
  assert(/[\u0590-\u05FF]/.test(CATEGORY_LABELS.invoice), 'invoice label not Hebrew');
  assert(/[\u0590-\u05FF]/.test(CATEGORY_LABELS.payment), 'payment label not Hebrew');
});

test('SNOOZE_DURATIONS defines 1h, 1d, 1w', () => {
  eq(SNOOZE_DURATIONS['1h'], 60 * 60 * 1000, '1h ms');
  eq(SNOOZE_DURATIONS['1d'], 24 * 60 * 60 * 1000, '1d ms');
  eq(SNOOZE_DURATIONS['1w'], 7 * 24 * 60 * 60 * 1000, '1w ms');
});

test('Hebrew labels include RTL title', () => {
  assert(NOTIFICATION_CENTER_HE.title.includes('התראות'), 'title missing התראות');
  assert(NOTIFICATION_CENTER_HE.markAllRead.length > 0, 'markAllRead empty');
  assert(NOTIFICATION_CENTER_HE.tabAll.length > 0, 'tabAll empty');
});

test('timeAgoHe: fresh timestamp → ממש עכשיו', () => {
  const now = Date.now();
  const result = timeAgoHe(now, now);
  assert(result.includes('עכשיו'), `expected ממש עכשיו, got ${result}`);
});

test('timeAgoHe: 1 minute ago → לפני דקה', () => {
  const now = 10_000_000_000;
  const ts = now - 60 * 1000;
  eq(timeAgoHe(ts, now), 'לפני דקה', '1 minute');
});

test('timeAgoHe: 5 minutes ago → לפני 5 דקות', () => {
  const now = 10_000_000_000;
  const ts = now - 5 * 60 * 1000;
  eq(timeAgoHe(ts, now), 'לפני 5 דקות', '5 minutes');
});

test('timeAgoHe: 1 hour ago → לפני שעה', () => {
  const now = 10_000_000_000;
  const ts = now - 60 * 60 * 1000;
  eq(timeAgoHe(ts, now), 'לפני שעה', '1 hour');
});

test('timeAgoHe: 3 hours ago → לפני 3 שעות', () => {
  const now = 10_000_000_000;
  const ts = now - 3 * 60 * 60 * 1000;
  eq(timeAgoHe(ts, now), 'לפני 3 שעות', '3 hours');
});

test('timeAgoHe: 1 day ago → לפני יום', () => {
  const now = 10_000_000_000;
  const ts = now - 24 * 60 * 60 * 1000;
  eq(timeAgoHe(ts, now), 'לפני יום', '1 day');
});

test('timeAgoHe: 2 days ago → לפני 2 ימים', () => {
  const now = 10_000_000_000;
  const ts = now - 2 * 24 * 60 * 60 * 1000;
  eq(timeAgoHe(ts, now), 'לפני 2 ימים', '2 days');
});

test('timeAgoHe: null timestamp → em-dash', () => {
  eq(timeAgoHe(null), '—', 'null fallback');
});

test('NotificationCenter renders to HTML containing bell button', () => {
  const element = React.createElement(NotificationCenter, {
    notifications: [],
    onMarkRead: () => {},
    onMarkAllRead: () => {},
    onNavigate: () => {},
    onSnooze: () => {},
    onArchive: () => {},
  });
  const html = renderToString(element);
  assert(typeof html === 'string' && html.length > 0, 'empty render');
  assert(html.includes('dir="rtl"'), 'missing RTL direction');
  assert(html.includes('aria-label'), 'missing aria-label');
  // The bell button itself should be rendered even when panel is closed
  assert(html.includes('button'), 'expected button element');
});

test('NotificationCenter renders unread badge when unread notifications exist', () => {
  const now = Date.now();
  const element = React.createElement(NotificationCenter, {
    notifications: [
      {
        id: 'n1',
        title: 'חשבונית חדשה',
        body: 'חשבונית מספר 1001 התקבלה',
        category: 'invoice',
        severity: 'normal',
        read: false,
        mentioned: false,
        archived: false,
        snoozedUntil: null,
        timestamp: now - 60 * 1000,
      },
      {
        id: 'n2',
        title: 'תשלום התקבל',
        body: 'תשלום ₪15,000',
        category: 'payment',
        severity: 'normal',
        read: false,
        mentioned: false,
        archived: false,
        snoozedUntil: null,
        timestamp: now - 5 * 60 * 1000,
      },
    ],
  });
  const html = renderToString(element);
  // Badge shows the count of unread — 2
  assert(html.includes('>2<'), `expected unread count 2 in ${html.slice(0, 200)}`);
});

test('NotificationCenter respects archived + snoozed filter', () => {
  const now = Date.now();
  const element = React.createElement(NotificationCenter, {
    notifications: [
      {
        id: 'n1', title: 't1', body: 'b1', category: 'invoice',
        read: false, archived: true,
        snoozedUntil: null, timestamp: now,
      },
      {
        id: 'n2', title: 't2', body: 'b2', category: 'invoice',
        read: false, archived: false,
        snoozedUntil: now + 60_000, timestamp: now,
      },
    ],
  });
  const html = renderToString(element);
  // Both notifications are archived/snoozed → badge should not show 2
  assert(!html.includes('>2<'), 'archived+snoozed should not count');
});

test('NotificationCenter includes Palantir bg color inline', () => {
  const element = React.createElement(NotificationCenter, {
    notifications: [],
  });
  const html = renderToString(element);
  // Root should contain Palantir theme color — rendered inline in some button
  assert(
    html.includes('#13171c') || html.includes('#0b0d10') ||
    html.includes('#232a33') || html.includes('#4a9eff'),
    'missing Palantir theme colors in inline style'
  );
});

/* ------------------------------------------------------------------ */
/*  Runner — works under vitest/jest AND plain node                    */
/* ------------------------------------------------------------------ */

const isVitestOrJest =
  typeof globalThis.describe === 'function' &&
  typeof globalThis.it === 'function';

if (isVitestOrJest) {
  // eslint-disable-next-line no-undef
  describe('NotificationCenter', () => {
    for (const t of tests) {
      // eslint-disable-next-line no-undef
      it(t.name, async () => {
        await t.fn();
      });
    }
  });
} else {
  // Plain node runner — execute synchronously & report
  (async () => {
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
      try {
        await t.fn();
        // eslint-disable-next-line no-console
        console.log(`  PASS  ${t.name}`);
        passed += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`  FAIL  ${t.name}`);
        // eslint-disable-next-line no-console
        console.error('        ', err && err.message ? err.message : err);
        failed += 1;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nNotificationCenter: ${passed} passed, ${failed} failed`);
    if (failed > 0 && typeof process !== 'undefined') process.exitCode = 1;
  })();
}
