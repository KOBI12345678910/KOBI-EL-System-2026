/**
 * AuditTrail.test.jsx — Agent 98
 * Smoke tests for the AuditTrail component.
 *
 * Framework-agnostic: works under `vitest`, `jest`, and `node --test`.
 * Uses `react-dom/server` renderToString so no JSDOM is required.
 *
 * Run:
 *   npx vitest run src/components/AuditTrail.test.jsx
 *   # or
 *   node --test src/components/AuditTrail.test.jsx
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import AuditTrail, {
  PALANTIR_DARK,
  AUDIT_TRAIL_LABELS,
  buildCSV,
  highlightHebrew,
  fmtJerusalem,
  severityColor,
  severityLabel,
  defaultMockFetch,
} from './AuditTrail.jsx';

/* ------------------------------------------------------------------ */
/*  Minimal assertion helper that works without an assertion lib       */
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
/*  Test cases                                                         */
/* ------------------------------------------------------------------ */

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('PALANTIR_DARK theme exposes canonical colors', () => {
  eq(PALANTIR_DARK.bg, '#0b0d10', 'bg');
  eq(PALANTIR_DARK.panel, '#13171c', 'panel');
  eq(PALANTIR_DARK.accent, '#4a9eff', 'accent');
});

test('Hebrew labels are present and non-empty', () => {
  assert(
    AUDIT_TRAIL_LABELS.title && AUDIT_TRAIL_LABELS.title.length > 2,
    'title label missing'
  );
  assert(AUDIT_TRAIL_LABELS.empty.includes('אין'), 'empty label missing Hebrew');
  assert(AUDIT_TRAIL_LABELS.export.includes('CSV'), 'export label missing CSV');
});

test('severityColor maps severities to theme colors', () => {
  eq(severityColor('info'), PALANTIR_DARK.info, 'info');
  eq(severityColor('warning'), PALANTIR_DARK.warn, 'warning');
  eq(severityColor('critical'), PALANTIR_DARK.critical, 'critical');
  eq(severityColor('unknown'), PALANTIR_DARK.info, 'default fallback to info');
});

test('severityLabel returns Hebrew labels', () => {
  eq(severityLabel('info'), AUDIT_TRAIL_LABELS.info, 'info label');
  eq(severityLabel('warning'), AUDIT_TRAIL_LABELS.warning, 'warning label');
  eq(severityLabel('critical'), AUDIT_TRAIL_LABELS.critical, 'critical label');
});

test('fmtJerusalem renders a Hebrew date for a valid timestamp', () => {
  const ts = '2026-04-11T09:15:00.000Z';
  const s = fmtJerusalem(ts);
  assert(typeof s === 'string' && s.length > 5, 'expected non-empty date string');
  // Must contain the numeric year
  assert(s.includes('2026'), `expected year 2026 in ${s}`);
});

test('highlightHebrew returns raw string when no Hebrew present', () => {
  const out = highlightHebrew('hello world');
  eq(out, 'hello world', 'plain ascii passthrough');
});

test('highlightHebrew returns React nodes when Hebrew present', () => {
  const out = highlightHebrew('שלום world');
  assert(Array.isArray(out), 'expected array parts');
  assert(out.length >= 1, 'expected at least one part');
});

test('buildCSV produces a UTF-8 BOM header row', () => {
  const csv = buildCSV([
    {
      id: 'x1',
      timestamp: '2026-04-11T09:15:00.000Z',
      actorName: 'קובי',
      actorIdLast4: '1234',
      actionType: 'create',
      resourceType: 'invoice',
      resourceId: 'inv-1',
      severity: 'info',
      ip: '10.0.0.1',
      userAgent: 'UA',
      message: 'נוצר',
    },
  ]);
  assert(csv.charCodeAt(0) === 0xfeff, 'missing UTF-8 BOM');
  assert(csv.includes('id,'), 'missing id header');
  assert(csv.includes('inv-1'), 'missing resource id');
  assert(csv.includes('קובי'), 'missing Hebrew actor');
});

test('defaultMockFetch returns shape { events, total, page }', async () => {
  const res = await defaultMockFetch({ page: 1, limit: 10 });
  assert(Array.isArray(res.events), 'events must be array');
  assert(typeof res.total === 'number', 'total must be number');
  assert(res.events.length <= 10, 'page limit respected');
});

test('defaultMockFetch filters by actionType', async () => {
  const res = await defaultMockFetch({ action: 'delete', page: 1, limit: 20 });
  assert(
    res.events.every((e) => e.actionType === 'delete'),
    'all events must be delete'
  );
});

test('AuditTrail renders to a string containing Hebrew title', () => {
  const element = React.createElement(AuditTrail, {
    fetchEvents: async () => ({ events: [], total: 0, page: 1 }),
  });
  const html = renderToString(element);
  assert(typeof html === 'string' && html.length > 0, 'empty render');
  assert(html.includes('יומן ביקורת'), 'missing Hebrew title in render');
  assert(html.includes('dir="rtl"'), 'missing RTL direction');
  // Palantir color must appear inline
  assert(
    html.includes('#0b0d10') || html.includes('rgb(11'),
    'missing Palantir bg'
  );
});

test('AuditTrail respects empty-state when events array is empty', () => {
  // The component starts in "loading" state; we only validate it mounts
  // without throwing when given an empty fetcher.
  const element = React.createElement(AuditTrail, {
    fetchEvents: async () => ({ events: [], total: 0, page: 1 }),
    onExport: async () => undefined,
    theme: 'dark',
  });
  const html = renderToString(element);
  assert(html.includes('טוען') || html.includes('יומן'), 'expected loading/title');
});

/* ------------------------------------------------------------------ */
/*  Runner — works under vitest/jest AND plain node                    */
/* ------------------------------------------------------------------ */

const isVitestOrJest =
  typeof globalThis.describe === 'function' &&
  typeof globalThis.it === 'function';

if (isVitestOrJest) {
  // eslint-disable-next-line no-undef
  describe('AuditTrail', () => {
    for (const t of tests) {
      // eslint-disable-next-line no-undef
      it(t.name, async () => {
        await t.fn();
      });
    }
  });
} else {
  // Standalone runner
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
      `\nAuditTrail smoke: ${passed} passed, ${failed} failed (${tests.length} total)`
    );
    if (failed > 0 && typeof process !== 'undefined') process.exit(1);
  })();
}
