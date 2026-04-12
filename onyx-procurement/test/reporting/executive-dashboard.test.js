/**
 * Unit tests for src/reporting/executive-dashboard.js
 * Agent Y-181 — Executive Dashboard aggregator
 *
 * 15+ tests covering:
 *   - registerSource / listSources / unregisterSource
 *   - async + sync build paths
 *   - bilingual labels (Hebrew + English) for every KPI
 *   - target evaluation (on / warn / off / unknown)
 *   - trend arrows vs prior period (up / down / flat / none)
 *   - Palantir dark tokens injection into metadata
 *   - failing source does not abort build
 *   - extras bucket for unknown KPIs
 *   - topRisks normalisation + bilingual titles
 *   - mergeSources precedence rules
 *   - formatNIS output branches
 *   - period object handling
 *
 * Run:
 *   node --test onyx-procurement/test/reporting/executive-dashboard.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ExecutiveDashboard,
  PALANTIR_DARK_TOKENS,
  KPI_DEFINITIONS,
  KPI_KEYS,
  DEFAULT_TARGETS,
  TREND_TOKENS,
  computeTrend,
  evaluateTarget,
  statusColor,
  trendColor,
  formatNIS,
  formatValue,
  mergeSources,
  normaliseSnapshot,
  normaliseRisks,
} = require('../../src/reporting/executive-dashboard');

// ─── fixture helpers ───────────────────────────────────────────

function fullKpiBlock() {
  return {
    revenue: 11_500_000,
    grossMargin: 34.2,
    opEx: 6_100_000,
    ebitda: 1_900_000,
    cashPosition: 5_250_000,
    backlog: 22_300_000,
    aging: 720_000,
    workforce: 148,
    openRFQs: 17,
    openWOs: 42,
    safetyIncidents: 1,
    qualityPPM: 340,
    onTime: 94.5,
    npsScore: 52,
    churnRate: 3.4,
    topRisks: [
      { id: 'R-1', title_en: 'FX exposure', title_he: 'חשיפה למט"ח', severity: 'high' },
      { title: 'Single-source component', severity: 'medium' },
      'Regulatory change in VAT reporting',
    ],
  };
}

function priorKpiSnapshot() {
  const def = fullKpiBlock();
  const kpis = {};
  for (const [k, v] of Object.entries(def)) {
    if (k === 'topRisks') continue;
    // Bake 10 % lower values into the prior snapshot
    kpis[k] = { value: typeof v === 'number' ? v * 0.9 : v };
  }
  return { kpis };
}

function fixedClock() {
  const date = new Date('2026-04-01T00:00:00Z');
  return () => date;
}

// ─── test suite ───────────────────────────────────────────

test('1. KPI catalogue has all 16 required metrics with bilingual labels', () => {
  const required = [
    'revenue',
    'grossMargin',
    'opEx',
    'ebitda',
    'cashPosition',
    'backlog',
    'aging',
    'workforce',
    'openRFQs',
    'openWOs',
    'safetyIncidents',
    'qualityPPM',
    'onTime',
    'npsScore',
    'churnRate',
    'topRisks',
  ];
  for (const key of required) {
    assert.ok(KPI_DEFINITIONS[key], `missing KPI definition: ${key}`);
    assert.ok(KPI_DEFINITIONS[key].label_en, `missing EN label for ${key}`);
    assert.ok(KPI_DEFINITIONS[key].label_he, `missing HE label for ${key}`);
    // Hebrew label must contain at least one non-ASCII char
    assert.match(
      KPI_DEFINITIONS[key].label_he,
      /[\u0590-\u05FF]/,
      `HE label for ${key} should contain Hebrew characters`,
    );
  }
  assert.equal(KPI_KEYS.length, 16);
});

test('2. registerSource stores fetcher; unregister & list work', () => {
  const dash = new ExecutiveDashboard();
  dash.registerSource('sales', () => ({ revenue: 1 }));
  dash.registerSource('finance', () => ({ ebitda: 2 }));
  assert.deepEqual(dash.listSources().sort(), ['finance', 'sales']);
  dash.unregisterSource('sales');
  assert.deepEqual(dash.listSources(), ['finance']);
});

test('3. registerSource rejects invalid inputs', () => {
  const dash = new ExecutiveDashboard();
  assert.throws(() => dash.registerSource('', () => ({})), /non-empty/);
  assert.throws(() => dash.registerSource('x', null), /function/);
});

test('4. build() aggregates multiple mockable sources into one snapshot', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSources({
    finance: () => ({
      revenue: 11_500_000,
      grossMargin: 34.2,
      opEx: 6_100_000,
      ebitda: 1_900_000,
      cashPosition: 5_250_000,
    }),
    sales: () => ({ backlog: 22_300_000, aging: 720_000 }),
    hr: () => Promise.resolve({ workforce: 148 }),
    procurement: () => ({ openRFQs: 17 }),
    operations: () => ({ openWOs: 42, onTime: 94.5 }),
    safety: () => ({ safetyIncidents: 1 }),
    quality: () => ({ qualityPPM: 340 }),
    customer: () => ({ npsScore: 52, churnRate: 3.4 }),
    risk: () => ({
      topRisks: [{ title: 'FX exposure', severity: 'high' }],
    }),
  });

  const snapshot = await dash.build('2026-Q1');

  assert.equal(snapshot.version, 'exec-dash/1.0');
  assert.equal(snapshot.tenant, 'techno-kol-uzi');
  assert.equal(snapshot.kpis.revenue.value, 11_500_000);
  assert.equal(snapshot.kpis.ebitda.status, 'warn'); // min=1.5M, stretch=2.2M → between
  assert.equal(snapshot.kpis.onTime.status, 'on'); // 94.5 > 92
  assert.equal(snapshot.kpis.topRisks.value.length, 1);
  assert.equal(snapshot.summary.total, 16);
});

test('5. Bilingual labels and legend are present in metadata', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('all', () => fullKpiBlock());
  const snapshot = await dash.build({ from: '2026-01-01', to: '2026-03-31', label_en: 'Q1', label_he: 'רבעון-1' });

  // Every KPI has both labels
  for (const key of KPI_KEYS) {
    const entry = snapshot.kpis[key];
    assert.ok(entry.label_en, `${key} missing label_en`);
    assert.ok(entry.label_he, `${key} missing label_he`);
    assert.match(entry.label_he, /[\u0590-\u05FF]/);
  }

  const i18n = snapshot.metadata.i18n;
  assert.deepEqual(i18n.locales, ['en', 'he']);
  assert.equal(i18n.rtl.he, true);
  assert.match(i18n.labels.title_he, /לוח/);
  assert.match(i18n.labels.title_en, /Executive/);
  assert.match(i18n.labels.subtitle_he, /רבעון-1/);
});

test('6. Palantir dark theme tokens appear in metadata.theme', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('all', () => fullKpiBlock());
  const snapshot = await dash.build('2026-Q1');

  assert.equal(snapshot.metadata.theme.name, 'palantir-dark');
  assert.deepEqual(snapshot.metadata.theme.tokens, PALANTIR_DARK_TOKENS);
  assert.equal(snapshot.metadata.theme.tokens.bg.primary, '#0B0F14');
  assert.equal(snapshot.metadata.theme.tokens.brand.blue, '#00A3E0');
  assert.ok(Array.isArray(snapshot.metadata.theme.tokens.chart));
  assert.ok(snapshot.metadata.theme.tokens.chart.length >= 4);
});

test('7. KPI status colours come from Palantir tokens', () => {
  assert.equal(statusColor('on'), PALANTIR_DARK_TOKENS.status.success);
  assert.equal(statusColor('warn'), PALANTIR_DARK_TOKENS.status.warning);
  assert.equal(statusColor('off'), PALANTIR_DARK_TOKENS.status.danger);
  assert.equal(statusColor('unknown'), PALANTIR_DARK_TOKENS.status.neutral);
});

test('8. evaluateTarget handles min / max / band / stretch / null', () => {
  // {min, stretch} — higher is better
  assert.equal(evaluateTarget(13_000_000, { min: 10_000_000, stretch: 12_000_000 }), 'on');
  assert.equal(evaluateTarget(11_000_000, { min: 10_000_000, stretch: 12_000_000 }), 'warn');
  assert.equal(evaluateTarget(9_000_000, { min: 10_000_000, stretch: 12_000_000 }), 'off');

  // {max} — lower is better
  assert.equal(evaluateTarget(400, { max: 500 }), 'on');
  assert.equal(evaluateTarget(480, { max: 500 }), 'warn');
  assert.equal(evaluateTarget(600, { max: 500 }), 'off');

  // {min, max} band
  assert.equal(evaluateTarget(150, { min: 120, max: 200 }), 'on');
  assert.equal(evaluateTarget(125, { min: 120, max: 200 }), 'warn');
  assert.equal(evaluateTarget(250, { min: 120, max: 200 }), 'off');

  // no target
  assert.equal(evaluateTarget(42, null), 'unknown');
  assert.equal(evaluateTarget(NaN, { max: 10 }), 'unknown');
});

test('9. computeTrend produces up / down / flat / none directions', () => {
  assert.equal(computeTrend(110, 100).direction, 'up');
  assert.equal(computeTrend(90, 100).direction, 'down');
  assert.equal(computeTrend(100, 100).direction, 'flat');
  assert.equal(computeTrend(null, 100).direction, 'none');
  assert.equal(computeTrend(100, null).direction, 'none');

  const up = computeTrend(110, 100);
  assert.equal(up.token, TREND_TOKENS.up);
  assert.equal(up.deltaAbs, 10);
  assert.equal(up.deltaPct, 10);

  // Divisor zero safe
  const fromZero = computeTrend(50, 0);
  assert.equal(fromZero.direction, 'up');
  assert.equal(fromZero.deltaPct, 100);
});

test('10. Trend arrows use prior snapshot when provided', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('all', () => fullKpiBlock());
  dash.setPriorSnapshot(priorKpiSnapshot());

  const snapshot = await dash.build('2026-Q1');
  // Current revenue = 11.5M, prior = 10.35M → up
  assert.equal(snapshot.kpis.revenue.trend.direction, 'up');
  assert.equal(snapshot.kpis.revenue.trend.token, TREND_TOKENS.up);
  // Aging current 720k, prior 648k → aging went up, which is bad (down-direction KPI)
  assert.equal(snapshot.kpis.aging.trend.direction, 'up');
  assert.equal(
    snapshot.kpis.aging.trend.color,
    PALANTIR_DARK_TOKENS.trend.down,
    'rising aging should render with the "bad" trend colour',
  );
});

test('11. failing source does not abort build; its error is captured', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('sales', () => ({ revenue: 11_500_000, backlog: 22_300_000 }));
  dash.registerSource('finance', async () => {
    throw new Error('SQL timeout');
  });
  dash.registerSource('quality', () => {
    throw new Error('ISO feed unavailable');
  });

  const snapshot = await dash.build('2026-Q1');

  assert.ok(snapshot.sourceErrors.finance.includes('SQL timeout'));
  assert.ok(snapshot.sourceErrors.quality.includes('ISO feed'));
  // Sales source still delivered its KPIs
  assert.equal(snapshot.kpis.revenue.value, 11_500_000);
  assert.equal(snapshot.kpis.backlog.value, 22_300_000);
  // Missing finance KPIs come back null / unknown
  assert.equal(snapshot.kpis.ebitda.value, null);
  assert.equal(snapshot.kpis.ebitda.status, 'unknown');
  // Source meta reflects both ok and error states
  assert.equal(snapshot.metadata.sources.sales.status, 'ok');
  assert.equal(snapshot.metadata.sources.finance.status, 'error');
});

test('12. buildSync is a pure builder and yields same shape as async', () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  const snapshot = dash.buildSync(fullKpiBlock(), '2026-Q1');
  assert.equal(snapshot.version, 'exec-dash/1.0');
  assert.equal(snapshot.kpis.revenue.value, 11_500_000);
  assert.equal(snapshot.summary.total, 16);
  // No fetchers were consulted, yet sourceErrors exists
  assert.deepEqual(snapshot.sourceErrors, {});
  assert.equal(snapshot.metadata.sources.inline.status, 'ok');
});

test('13. topRisks normalised into bilingual objects with severity colours', () => {
  const out = normaliseRisks([
    { title_en: 'FX', title_he: 'מט"ח', severity: 'high' },
    { title: 'Chain', severity: 'medium' },
    'Bare string risk',
  ]);
  assert.equal(out.length, 3);
  assert.equal(out[0].title_en, 'FX');
  assert.equal(out[0].title_he, 'מט"ח');
  assert.equal(out[0].color, PALANTIR_DARK_TOKENS.status.danger);
  assert.equal(out[1].severity, 'medium');
  assert.equal(out[1].color, PALANTIR_DARK_TOKENS.status.warning);
  assert.equal(out[2].title_en, 'Bare string risk');
  assert.equal(out[2].title_he, 'Bare string risk');
});

test('14. formatNIS covers all magnitude branches', () => {
  assert.equal(formatNIS(1_500_000_000), '₪1.50B');
  assert.equal(formatNIS(1_500_000), '₪1.50M');
  assert.equal(formatNIS(2_500), '₪2.5K');
  assert.equal(formatNIS(42), '₪42.00');
  assert.equal(formatNIS(-3_000_000), '-₪3.00M');
  assert.equal(formatNIS(NaN), '—');
});

test('15. mergeSources precedence: later sources win, topRisks are concatenated', () => {
  const { merged, extras } = mergeSources([
    { revenue: 1, unknownA: 'extra-a' },
    { revenue: 2, ebitda: 5, topRisks: [{ title: 'A' }] },
    { topRisks: [{ title: 'B' }], extraWidget: true },
  ]);
  assert.equal(merged.revenue, 2); // later wins
  assert.equal(merged.ebitda, 5);
  assert.equal(merged.topRisks.length, 2);
  assert.deepEqual(extras, { unknownA: 'extra-a', extraWidget: true });
});

test('16. normaliseSnapshot accepts objects, counts, items and nulls', () => {
  assert.equal(normaliseSnapshot(null).value, null);
  assert.equal(normaliseSnapshot(42).value, 42);
  assert.equal(normaliseSnapshot({ value: 100 }).value, 100);
  assert.equal(normaliseSnapshot({ count: 9 }).value, 9);
  assert.deepEqual(normaliseSnapshot({ items: [1, 2] }).value, [1, 2]);
  assert.deepEqual(normaliseSnapshot([1, 2]).value, [1, 2]);
});

test('17. period object is preserved and exposed in subtitle labels', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('all', () => fullKpiBlock());
  const snapshot = await dash.build({
    from: '2026-01-01',
    to: '2026-03-31',
    label_en: 'Q1 2026',
    label_he: 'רבעון 1 2026',
  });
  assert.equal(snapshot.period.from, '2026-01-01');
  assert.equal(snapshot.period.to, '2026-03-31');
  assert.equal(snapshot.period.label_en, 'Q1 2026');
  assert.equal(snapshot.period.label_he, 'רבעון 1 2026');
  assert.match(snapshot.metadata.i18n.labels.subtitle_he, /רבעון 1 2026/);
});

test('18. Summary counters add up and target override works', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('all', () => fullKpiBlock());
  dash.setTargets({
    revenue: { min: 20_000_000, stretch: 25_000_000 }, // now off target
    grossMargin: { min: 50 }, // now off
  });

  const snapshot = await dash.build('2026-Q1');
  assert.equal(snapshot.kpis.revenue.status, 'off');
  assert.equal(snapshot.kpis.grossMargin.status, 'off');
  const { on, warn, off, unknown, total } = snapshot.summary;
  assert.equal(on + warn + off + unknown, total);
  assert.equal(total, 16);
});

test('19. Extras bucket captures unknown KPIs from sources', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('finance', () => ({
    revenue: 11_500_000,
    customMetricXYZ: 123, // unknown KPI
  }));
  const snapshot = await dash.build('2026-Q1');
  assert.equal(snapshot.extras.customMetricXYZ, 123);
  assert.equal(snapshot.kpis.revenue.value, 11_500_000);
});

test('20. Each family is represented and formatted_he covers units', async () => {
  const dash = new ExecutiveDashboard({ clock: fixedClock() });
  dash.registerSource('all', () => fullKpiBlock());
  const snapshot = await dash.build('2026-Q1');
  const families = new Set(KPI_KEYS.map((k) => KPI_DEFINITIONS[k].family));
  const expected = ['financial', 'sales', 'hr', 'procurement', 'operations', 'safety', 'quality', 'customer', 'risk'];
  for (const f of expected) assert.ok(families.has(f), `family ${f} missing`);
  // Formatted outputs are strings
  for (const key of KPI_KEYS) {
    assert.equal(typeof snapshot.kpis[key].formatted_en, 'string');
    assert.equal(typeof snapshot.kpis[key].formatted_he, 'string');
  }
});
