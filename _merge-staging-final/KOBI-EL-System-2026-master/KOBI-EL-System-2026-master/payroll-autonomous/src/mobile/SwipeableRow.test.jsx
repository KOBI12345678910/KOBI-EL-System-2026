/**
 * SwipeableRow.test.jsx — Agent X-20 / Swarm 3
 * Framework-agnostic smoke tests for the SwipeableRow component.
 *
 * Runs under `vitest`, `jest`, or `node --test`.
 * Uses `react-dom/server` renderToString so no JSDOM is required.
 *
 * Run:
 *   npx vitest run src/mobile/SwipeableRow.test.jsx
 *   # or
 *   node --test src/mobile/SwipeableRow.test.jsx
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import SwipeableRow, {
  SWIPE_THEME,
  SWIPE_LABELS,
  computeSwipeAction,
  clampOffset,
  describeSwipeReveal,
} from './SwipeableRow.jsx';

/* ------------------------------------------------------------------ */
/*  Minimal assertion helpers                                          */
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
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

/* ---- Theme + labels ---- */

test('SWIPE_THEME exposes Palantir dark colors', () => {
  eq(SWIPE_THEME.bg, '#13171c', 'bg');
  eq(SWIPE_THEME.deleteBg, '#da3633', 'delete red');
  eq(SWIPE_THEME.editBg, '#4a9eff', 'edit blue (Palantir accent)');
});

test('SWIPE_LABELS contain Hebrew strings', () => {
  assert(SWIPE_LABELS.delete === 'מחק', 'delete label must be Hebrew');
  assert(SWIPE_LABELS.edit === 'ערוך', 'edit label must be Hebrew');
  assert(SWIPE_LABELS.confirm.length > 4, 'confirm message present');
});

/* ---- computeSwipeAction ---- */

test('computeSwipeAction returns null below threshold', () => {
  eq(computeSwipeAction(0), null, '0');
  eq(computeSwipeAction(20), null, '+20 below threshold');
  eq(computeSwipeAction(-20), null, '-20 below threshold');
  eq(computeSwipeAction(79), null, '+79 below threshold');
  eq(computeSwipeAction(-79), null, '-79 below threshold');
});

test('computeSwipeAction returns "edit" for right swipe past threshold', () => {
  eq(computeSwipeAction(80), 'edit', '+80 exactly');
  eq(computeSwipeAction(150), 'edit', '+150');
  eq(computeSwipeAction(1000), 'edit', 'huge positive');
});

test('computeSwipeAction returns "delete" for left swipe past threshold', () => {
  eq(computeSwipeAction(-80), 'delete', '-80 exactly');
  eq(computeSwipeAction(-120), 'delete', '-120');
  eq(computeSwipeAction(-9999), 'delete', 'huge negative');
});

test('computeSwipeAction honors custom threshold', () => {
  eq(computeSwipeAction(50, 100), null, '50 with threshold 100');
  eq(computeSwipeAction(100, 100), 'edit', '100 with threshold 100');
  eq(computeSwipeAction(-100, 100), 'delete', '-100 with threshold 100');
});

test('computeSwipeAction handles bad inputs safely', () => {
  eq(computeSwipeAction(undefined), null, 'undefined');
  eq(computeSwipeAction(null), null, 'null');
  eq(computeSwipeAction('not a number'), null, 'garbage');
});

/* ---- clampOffset ---- */

test('clampOffset caps to 2.2x threshold each direction', () => {
  eq(clampOffset(50), 50, 'inside bounds');
  eq(clampOffset(-50), -50, 'inside bounds negative');
  eq(clampOffset(1000, 80), 176, 'clamped to 80 * 2.2 = 176');
  eq(clampOffset(-1000, 80), -176, 'clamped negative to -176');
});

test('clampOffset handles zero/bad threshold', () => {
  const v = clampOffset(50, 0);
  assert(typeof v === 'number' && !Number.isNaN(v), 'still returns a number');
});

/* ---- describeSwipeReveal ---- */

test('describeSwipeReveal reveals edit for positive dx', () => {
  const r = describeSwipeReveal(50);
  assert(r, 'expected a reveal object');
  eq(r.kind, 'edit', 'kind');
  eq(r.label, SWIPE_LABELS.edit, 'label');
  eq(r.bg, SWIPE_THEME.editBg, 'bg');
});

test('describeSwipeReveal reveals delete for negative dx', () => {
  const r = describeSwipeReveal(-50);
  assert(r, 'expected a reveal object');
  eq(r.kind, 'delete', 'kind');
  eq(r.label, SWIPE_LABELS.delete, 'label');
  eq(r.bg, SWIPE_THEME.deleteBg, 'bg');
});

test('describeSwipeReveal returns null near 0 (no flicker)', () => {
  eq(describeSwipeReveal(0), null, 'at rest');
  eq(describeSwipeReveal(3), null, 'tiny positive');
  eq(describeSwipeReveal(-3), null, 'tiny negative');
});

/* ---- SSR render ---- */

test('SwipeableRow renders to an RTL list-item with Hebrew labels', () => {
  const element = React.createElement(
    SwipeableRow,
    { onDelete: () => {}, onEdit: () => {} },
    React.createElement('span', null, 'שורה לבדיקה')
  );
  const html = renderToString(element);
  assert(typeof html === 'string' && html.length > 0, 'non-empty render');
  assert(html.includes('dir="rtl"'), 'RTL direction');
  assert(html.includes('שורה לבדיקה'), 'children rendered');
  assert(html.includes('מחק'), 'delete label present');
  assert(html.includes('ערוך'), 'edit label present');
});

test('SwipeableRow renders without children safely', () => {
  const element = React.createElement(SwipeableRow, { onDelete: () => {}, onEdit: () => {} });
  const html = renderToString(element);
  assert(html.length > 0, 'no crash without children');
});

test('SwipeableRow uses Palantir dark accent in inline styles', () => {
  const element = React.createElement(
    SwipeableRow,
    { onDelete: () => {}, onEdit: () => {} },
    'row'
  );
  const html = renderToString(element);
  assert(
    html.includes('#4a9eff') || html.includes('rgb(74'),
    'Palantir accent present'
  );
  assert(
    html.includes('#da3633') || html.toLowerCase().includes('da3633'),
    'delete red present'
  );
});

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

const isVitestOrJest =
  typeof globalThis.describe === 'function' && typeof globalThis.it === 'function';

if (isVitestOrJest) {
  // eslint-disable-next-line no-undef
  describe('SwipeableRow', () => {
    for (const t of tests) {
      // eslint-disable-next-line no-undef
      it(t.name, async () => {
        await t.fn();
      });
    }
  });
} else {
  (async () => {
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
      try {
        await t.fn();
        // eslint-disable-next-line no-console
        console.log('  ok  —', t.name);
        passed++;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('  FAIL —', t.name, err.message);
        failed++;
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `\nSwipeableRow smoke: ${passed} passed, ${failed} failed (${tests.length} total)`
    );
    if (failed > 0 && typeof process !== 'undefined') process.exit(1);
  })();
}
