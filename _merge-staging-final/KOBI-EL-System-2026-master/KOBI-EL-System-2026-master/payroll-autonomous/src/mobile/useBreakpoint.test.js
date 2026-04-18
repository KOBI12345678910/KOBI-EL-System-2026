/**
 * useBreakpoint.test.js — Agent X-20 / Swarm 3
 * Framework-agnostic smoke tests for the useBreakpoint hook.
 *
 * Runs under `vitest`, `jest`, or `node --test`.
 * No JSDOM required — tests validate the PURE helpers exported
 * alongside the hook (getBreakpointForWidth, describeBreakpoint,
 * SSR_DEFAULT, BREAKPOINTS, BP_QUERIES).
 *
 * Run:
 *   npx vitest run src/mobile/useBreakpoint.test.js
 *   # or
 *   node --test src/mobile/useBreakpoint.test.js
 */

import {
  default as useBreakpoint,
  BREAKPOINTS,
  BP_QUERIES,
  SSR_DEFAULT,
  getBreakpointForWidth,
  describeBreakpoint,
} from './useBreakpoint.js';

/* ------------------------------------------------------------------ */
/*  Minimal assert helpers                                             */
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
/*  Test list                                                          */
/* ------------------------------------------------------------------ */

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('BREAKPOINTS exposes canonical thresholds', () => {
  eq(BREAKPOINTS.mobile, 0, 'mobile min');
  eq(BREAKPOINTS.tablet, 768, 'tablet min');
  eq(BREAKPOINTS.desktop, 1024, 'desktop min');
});

test('BP_QUERIES contains max-width/min-width queries', () => {
  assert(BP_QUERIES.mobile.includes('max-width: 767px'), 'mobile query');
  assert(BP_QUERIES.tablet.includes('min-width: 768px'), 'tablet min');
  assert(BP_QUERIES.tablet.includes('max-width: 1023px'), 'tablet max');
  assert(BP_QUERIES.desktop.includes('min-width: 1024px'), 'desktop query');
});

test('getBreakpointForWidth maps widths to correct bucket', () => {
  eq(getBreakpointForWidth(320), 'mobile', '320px is mobile');
  eq(getBreakpointForWidth(767), 'mobile', '767px is still mobile');
  eq(getBreakpointForWidth(768), 'tablet', '768px is tablet boundary');
  eq(getBreakpointForWidth(900), 'tablet', '900px is tablet');
  eq(getBreakpointForWidth(1023), 'tablet', '1023px is still tablet');
  eq(getBreakpointForWidth(1024), 'desktop', '1024px is desktop boundary');
  eq(getBreakpointForWidth(1920), 'desktop', '1920px is desktop');
});

test('getBreakpointForWidth handles zero and bad inputs', () => {
  eq(getBreakpointForWidth(0), 'mobile', '0 defaults to mobile');
  eq(getBreakpointForWidth(undefined), 'mobile', 'undefined defaults to mobile');
  eq(getBreakpointForWidth(null), 'mobile', 'null defaults to mobile');
  eq(getBreakpointForWidth('not a number'), 'mobile', 'garbage → mobile');
});

test('describeBreakpoint returns flags matching the bp', () => {
  const m = describeBreakpoint(400);
  eq(m.bp, 'mobile', 'mobile bp');
  eq(m.isMobile, true, 'isMobile true');
  eq(m.isTablet, false, 'isTablet false');
  eq(m.isDesktop, false, 'isDesktop false');
  eq(m.width, 400, 'width echoed');

  const t = describeBreakpoint(900);
  eq(t.bp, 'tablet', 'tablet bp');
  eq(t.isTablet, true, 'isTablet true for 900');

  const d = describeBreakpoint(1440);
  eq(d.bp, 'desktop', 'desktop bp');
  eq(d.isDesktop, true, 'isDesktop true');
});

test('SSR_DEFAULT is a desktop-like frozen descriptor', () => {
  eq(SSR_DEFAULT.bp, 'desktop', 'SSR default is desktop');
  eq(SSR_DEFAULT.isDesktop, true, 'isDesktop true');
  eq(SSR_DEFAULT.isMobile, false, 'isMobile false');
  assert(Object.isFrozen(SSR_DEFAULT), 'SSR_DEFAULT should be frozen');
});

test('useBreakpoint export is a function', () => {
  assert(typeof useBreakpoint === 'function', 'hook must be callable function');
});

test('boundary sweep: every integer width from 760 to 1030 is categorized', () => {
  for (let w = 760; w <= 1030; w++) {
    const d = describeBreakpoint(w);
    if (w < 768) eq(d.bp, 'mobile', `w=${w}`);
    else if (w < 1024) eq(d.bp, 'tablet', `w=${w}`);
    else eq(d.bp, 'desktop', `w=${w}`);
  }
});

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

const isVitestOrJest =
  typeof globalThis.describe === 'function' && typeof globalThis.it === 'function';

if (isVitestOrJest) {
  // eslint-disable-next-line no-undef
  describe('useBreakpoint', () => {
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
      `\nuseBreakpoint smoke: ${passed} passed, ${failed} failed (${tests.length} total)`
    );
    if (failed > 0 && typeof process !== 'undefined') process.exit(1);
  })();
}
