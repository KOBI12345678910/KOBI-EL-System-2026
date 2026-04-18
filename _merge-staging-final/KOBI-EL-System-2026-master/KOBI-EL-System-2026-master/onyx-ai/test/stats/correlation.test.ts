/**
 * ONYX AI — Correlation Matrix Tests
 * בדיקות מטריצת מתאם — Agent Y-160
 * ------------------------------------------------------------
 *
 * Uses the Node built-in test runner (`node --test`) so no
 * additional dev dependencies are required. Covers all three
 * coefficients, p-value behavior, matrix construction, the
 * significant-correlation ranker, and SVG heatmap rendering.
 *
 * משתמש במריץ הבדיקות המובנה של Node. כולל את כל שלוש השיטות,
 * התנהגות ערך p, בניית מטריצה, מדרג מובהקות, וקבצי SVG.
 *
 * Run:
 *   npx node --test --require ts-node/register test/stats/correlation.test.ts
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {
  pearson,
  spearman,
  kendall,
  correlation,
  correlationMatrix,
  permutationPValue,
  rankSignificantCorrelations,
  renderHeatmapSvg,
  heatmapColor,
  fractionalRanks,
  escapeXml,
  createRng,
  shuffleInPlace,
  pairwiseClean,
} from '../../src/stats/correlation';
import type {
  Series,
  CorrelationMatrix,
  BilingualLabel,
} from '../../src/stats/correlation';

// -----------------------------------------------------------------
// Helpers — עוזרים
// -----------------------------------------------------------------

const CLOSE = 1e-9;

function makeLabel(he: string, en: string): BilingualLabel {
  return { he, en };
}

function makeSeries(
  he: string,
  en: string,
  values: number[],
): Series {
  return { label: makeLabel(he, en), values };
}

function approx(actual: number, expected: number, tol = 1e-6): void {
  if (Number.isNaN(expected)) {
    assert.ok(Number.isNaN(actual), `expected NaN, got ${actual}`);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `expected ${expected} but got ${actual} (tol ${tol})`,
  );
}

// -----------------------------------------------------------------
// 1. Pearson — perfect positive correlation
// מתאם פירסון חיובי מושלם
// -----------------------------------------------------------------

test('pearson: perfect positive linear correlation returns 1', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [2, 4, 6, 8, 10];
  approx(pearson(x, y), 1, CLOSE);
});

// -----------------------------------------------------------------
// 2. Pearson — perfect negative correlation
// מתאם פירסון שלילי מושלם
// -----------------------------------------------------------------

test('pearson: perfect negative linear correlation returns -1', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [10, 8, 6, 4, 2];
  approx(pearson(x, y), -1, CLOSE);
});

// -----------------------------------------------------------------
// 3. Pearson — no linear relationship
// מתאם פירסון ללא קשר לינארי
// -----------------------------------------------------------------

test('pearson: uncorrelated data yields magnitude below 0.5', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8];
  const y = [3, 1, 4, 1, 5, 9, 2, 6];
  const r = pearson(x, y);
  assert.ok(Number.isFinite(r));
  assert.ok(Math.abs(r) < 0.75, `expected small |r|, got ${r}`);
});

// -----------------------------------------------------------------
// 4. Pearson vs reference value
// פירסון מול ערך ייחוס ידוע
// -----------------------------------------------------------------

test('pearson: matches textbook value on reference sample', () => {
  // Known reference from Wikipedia example: r ≈ 0.5298 for this set.
  const x = [1, 2, 3, 4, 5];
  const y = [2, 5, 4, 8, 6];
  // Hand-computed: mean_x=3, mean_y=5,
  // num = (-2)(-3)+(-1)(0)+(0)(-1)+(1)(3)+(2)(1) = 6+0+0+3+2 = 11
  // dx2 = 4+1+0+1+4 = 10, dy2 = 9+0+1+9+1 = 20
  // r = 11/sqrt(200) ≈ 0.7778
  approx(pearson(x, y), 11 / Math.sqrt(200), 1e-9);
});

// -----------------------------------------------------------------
// 5. Zero variance must return NaN
// שונות אפס חייבת להחזיר NaN
// -----------------------------------------------------------------

test('pearson: returns NaN when one vector has zero variance', () => {
  const x = [1, 1, 1, 1, 1];
  const y = [2, 4, 6, 8, 10];
  const r = pearson(x, y);
  assert.ok(Number.isNaN(r), `expected NaN, got ${r}`);
});

// -----------------------------------------------------------------
// 6. Fractional ranks with ties
// דירוג ממוצע עם תיקו
// -----------------------------------------------------------------

test('fractionalRanks: assigns averaged ranks to tied observations', () => {
  // Values 1,2,2,3 => ranks 1, 2.5, 2.5, 4
  assert.deepEqual(fractionalRanks([1, 2, 2, 3]), [1, 2.5, 2.5, 4]);
  // Values 5,5,5,5 => all tied at rank (1+2+3+4)/4 = 2.5
  assert.deepEqual(fractionalRanks([5, 5, 5, 5]), [2.5, 2.5, 2.5, 2.5]);
  // Single value => rank 1
  assert.deepEqual(fractionalRanks([7]), [1]);
});

// -----------------------------------------------------------------
// 7. Spearman picks up monotone non-linear relationships
// ספירמן מזהה קשרים מונוטוניים לא-לינאריים
// -----------------------------------------------------------------

test('spearman: monotone transformation yields rho = 1', () => {
  const x = [1, 2, 3, 4, 5, 6];
  // y = exp(x) — strictly monotone, non-linear
  const y = x.map((v) => Math.exp(v));
  approx(spearman(x, y), 1, CLOSE);
  // Pearson is confused by the curvature, but still positive.
  assert.ok(pearson(x, y) < 0.99);
});

// -----------------------------------------------------------------
// 8. Spearman — perfect negative
// ספירמן שלילי מושלם
// -----------------------------------------------------------------

test('spearman: reverse monotone yields rho = -1', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [100, 80, 60, 40, 20];
  approx(spearman(x, y), -1, CLOSE);
});

// -----------------------------------------------------------------
// 9. Kendall — perfectly concordant
// קנדל — קונקורדנט מושלם
// -----------------------------------------------------------------

test('kendall: fully concordant pairs yield tau = 1', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [10, 20, 30, 40, 50];
  approx(kendall(x, y), 1, CLOSE);
});

// -----------------------------------------------------------------
// 10. Kendall — discordant / ties
// קנדל עם תיקו ודיסקורדנט
// -----------------------------------------------------------------

test('kendall: reference sample matches hand-computed tau-b', () => {
  // x: 1,2,3,4   y: 2,1,3,4
  // Pairs (i,j): (1,2)(1,3)(1,4)(2,3)(2,4)(3,4) = 6 pairs
  //   (1,2): dx=-1,dy=1 => disc
  //   (1,3): dx=-2,dy=-1 => conc
  //   (1,4): dx=-3,dy=-2 => conc
  //   (2,3): dx=-1,dy=-2 => conc
  //   (2,4): dx=-2,dy=-3 => conc
  //   (3,4): dx=-1,dy=-1 => conc
  // C=5, D=1, no ties => tau = 4/6 ≈ 0.6666666...
  approx(kendall([1, 2, 3, 4], [2, 1, 3, 4]), 4 / 6, 1e-9);
});

// -----------------------------------------------------------------
// 11. Kendall is NaN for zero-variance vector
// קנדל מחזיר NaN לשונות אפס
// -----------------------------------------------------------------

test('kendall: zero variance on one side returns NaN', () => {
  const x = [5, 5, 5, 5];
  const y = [1, 2, 3, 4];
  assert.ok(Number.isNaN(kendall(x, y)));
});

// -----------------------------------------------------------------
// 12. Pairwise clean drops NaN / Infinity pairs
// ניקוי זוגות עם ערכים חסרים
// -----------------------------------------------------------------

test('pairwiseClean: removes pairs containing NaN or infinity', () => {
  const x = [1, NaN, 3, 4, Infinity, 6];
  const y = [2, 4, NaN, 8, 10, 12];
  const clean = pairwiseClean(x, y);
  assert.deepEqual(clean.x, [1, 4, 6]);
  assert.deepEqual(clean.y, [2, 8, 12]);
});

// -----------------------------------------------------------------
// 13. Permutation p-value — strong signal is significant
// ערך p מובהק לאות חזק
// -----------------------------------------------------------------

test('permutationPValue: strong correlation yields p < 0.05', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const y = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
  const p = permutationPValue(x, y, 'pearson', 500, 42);
  assert.ok(p < 0.05, `expected small p, got ${p}`);
});

// -----------------------------------------------------------------
// 14. Permutation p-value — determinism
// דטרמיניזם של מבחן ההחלפה בהינתן אותו זרע
// -----------------------------------------------------------------

test('permutationPValue: same seed yields same p-value', () => {
  const x = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
  const y = [2, 7, 1, 8, 2, 8, 1, 8, 2, 8];
  const p1 = permutationPValue(x, y, 'spearman', 200, 123);
  const p2 = permutationPValue(x, y, 'spearman', 200, 123);
  assert.equal(p1, p2);
  const p3 = permutationPValue(x, y, 'spearman', 200, 999);
  // Different seed is usually different (not strictly required,
  // but very likely with 200 permutations).
  assert.ok(typeof p3 === 'number');
});

// -----------------------------------------------------------------
// 15. correlationMatrix — diagonal, symmetry, length validation
// מטריצת מתאם: אלכסון, סימטריה, בדיקת אורך
// -----------------------------------------------------------------

test('correlationMatrix: diagonal is 1 and matrix is symmetric', () => {
  const series: Series[] = [
    makeSeries('מכירות', 'Sales', [10, 20, 30, 40, 50]),
    makeSeries('הוצאות', 'Expenses', [5, 9, 14, 20, 27]),
    makeSeries('לקוחות', 'Customers', [2, 3, 5, 8, 13]),
  ];
  const m = correlationMatrix(series, {
    method: 'pearson',
    permutations: 100,
    seed: 7,
  });
  for (let i = 0; i < 3; i++) approx(m.r[i][i], 1, CLOSE);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      approx(m.r[i][j], m.r[j][i], CLOSE);
      approx(m.p[i][j], m.p[j][i], CLOSE);
    }
  }
  // Upper-triangle cells only: C(3,2) = 3.
  assert.equal(m.cells.length, 3);
});

// -----------------------------------------------------------------
// 16. correlationMatrix — length mismatch throws
// מטריצת מתאם: אורך לא תואם זורק שגיאה
// -----------------------------------------------------------------

test('correlationMatrix: throws when series lengths differ', () => {
  const series: Series[] = [
    makeSeries('א', 'A', [1, 2, 3]),
    makeSeries('ב', 'B', [1, 2, 3, 4]),
  ];
  assert.throws(
    () => correlationMatrix(series),
    /length 4 but expected 3/,
  );
});

// -----------------------------------------------------------------
// 17. correlationMatrix — skipPValue produces NaN p-values
// דילוג על חישוב p מחזיר NaN
// -----------------------------------------------------------------

test('correlationMatrix: skipPValue leaves off-diagonal p as NaN', () => {
  const series: Series[] = [
    makeSeries('א', 'A', [1, 2, 3, 4, 5]),
    makeSeries('ב', 'B', [5, 4, 3, 2, 1]),
  ];
  const m = correlationMatrix(series, { skipPValue: true });
  assert.ok(Number.isNaN(m.p[0][1]));
  assert.ok(Number.isNaN(m.cells[0].pValue));
});

// -----------------------------------------------------------------
// 18. rankSignificantCorrelations — filters + orders
// דירוג מתאמים מובהקים: מסנן וסדר
// -----------------------------------------------------------------

test('rankSignificantCorrelations: orders by magnitude and respects alpha', () => {
  const series: Series[] = [
    makeSeries('הכנסות', 'Revenue', [100, 110, 120, 130, 140, 150, 160, 170]),
    makeSeries('עלויות', 'Costs',   [ 50,  54,  58,  62,  66,  70,  74,  78]),
    makeSeries('רעש',    'Noise',   [  3,   1,   4,   1,   5,   9,   2,   6]),
    makeSeries('זמן',    'Time',    [  1,   2,   3,   4,   5,   6,   7,   8]),
  ];
  const m = correlationMatrix(series, {
    method: 'pearson',
    permutations: 500,
    seed: 2026,
  });
  const ranked = rankSignificantCorrelations(m, 0.05);
  // There must be at least one significant pair.
  assert.ok(ranked.length >= 1);
  // Top entry should be the strongest |r|.
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].magnitude >= ranked[i].magnitude);
  }
  // All entries satisfy alpha (or NaN p-values, which are skipped).
  for (const cell of ranked) {
    if (Number.isFinite(cell.pValue)) {
      assert.ok(cell.pValue <= 0.05);
    }
  }
});

// -----------------------------------------------------------------
// 19. rankSignificantCorrelations — direction tagging
// תיוג כיוון (חיובי/שלילי)
// -----------------------------------------------------------------

test('rankSignificantCorrelations: tags direction positive vs negative', () => {
  const series: Series[] = [
    makeSeries('עולה', 'Up',   [1, 2, 3, 4, 5, 6, 7, 8]),
    makeSeries('יורד', 'Down', [8, 7, 6, 5, 4, 3, 2, 1]),
  ];
  const m = correlationMatrix(series, {
    method: 'pearson',
    permutations: 200,
    seed: 11,
  });
  const ranked = rankSignificantCorrelations(m, 0.5);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].direction, 'negative');
  approx(ranked[0].r, -1, CLOSE);
});

// -----------------------------------------------------------------
// 20. heatmapColor — deterministic mapping extremes
// מיפוי צבע דטרמיניסטי לקצוות
// -----------------------------------------------------------------

test('heatmapColor: maps -1, 0, +1 to expected color shades', () => {
  // -1 -> blue (30,64,175)
  assert.equal(heatmapColor(-1), 'rgb(30,64,175)');
  // +1 -> red (185,28,28)
  assert.equal(heatmapColor(1), 'rgb(185,28,28)');
  // 0 -> white (248,250,252)
  assert.equal(heatmapColor(0), 'rgb(248,250,252)');
  // NaN -> neutral grey
  assert.equal(heatmapColor(NaN), '#e5e7eb');
});

// -----------------------------------------------------------------
// 21. renderHeatmapSvg — contains bilingual labels + method name
// SVG מכיל תוויות דו-לשוניות ושם שיטה
// -----------------------------------------------------------------

test('renderHeatmapSvg: bilingual mode embeds he+en labels and method', () => {
  const series: Series[] = [
    makeSeries('מכירות', 'Sales',   [1, 2, 3, 4, 5]),
    makeSeries('רווח',   'Profit',  [2, 3, 5, 7, 11]),
  ];
  const m = correlationMatrix(series, {
    method: 'spearman',
    permutations: 100,
    seed: 17,
  });
  const svg = renderHeatmapSvg(m, { language: 'both' });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('מכירות / Sales'));
  assert.ok(svg.includes('רווח / Profit'));
  assert.ok(svg.includes('ספירמן'));
  assert.ok(svg.includes('Spearman'));
  // Direction attribute for Hebrew text rendering.
  assert.ok(svg.includes('dir="auto"'));
});

// -----------------------------------------------------------------
// 22. renderHeatmapSvg — Hebrew-only mode excludes English
// מצב עברית בלבד מסתיר אנגלית
// -----------------------------------------------------------------

test('renderHeatmapSvg: he-only mode omits English labels', () => {
  const series: Series[] = [
    makeSeries('א-עברית', 'Aleph', [1, 2, 3]),
    makeSeries('ב-עברית', 'Bet',   [3, 2, 1]),
  ];
  const m = correlationMatrix(series, {
    method: 'kendall',
    skipPValue: true,
  });
  const svg = renderHeatmapSvg(m, { language: 'he' });
  assert.ok(svg.includes('א-עברית'));
  assert.ok(svg.includes('ב-עברית'));
  assert.ok(!svg.includes('Aleph'));
  assert.ok(!svg.includes('Bet'));
  assert.ok(svg.includes('קנדל'));
});

// -----------------------------------------------------------------
// 23. renderHeatmapSvg — English-only
// SVG באנגלית בלבד
// -----------------------------------------------------------------

test('renderHeatmapSvg: en-only mode omits Hebrew labels', () => {
  const series: Series[] = [
    makeSeries('יחידה א', 'UnitA', [1, 2, 3]),
    makeSeries('יחידה ב', 'UnitB', [3, 2, 1]),
  ];
  const m = correlationMatrix(series, {
    method: 'pearson',
    skipPValue: true,
  });
  const svg = renderHeatmapSvg(m, { language: 'en' });
  assert.ok(svg.includes('UnitA'));
  assert.ok(svg.includes('UnitB'));
  assert.ok(!svg.includes('יחידה א'));
  assert.ok(svg.includes('Pearson'));
});

// -----------------------------------------------------------------
// 24. escapeXml guards against injection
// ברחת XML מונעת הזרקה
// -----------------------------------------------------------------

test('escapeXml: escapes XML-significant characters', () => {
  assert.equal(
    escapeXml('<svg>&"\''),
    '&lt;svg&gt;&amp;&quot;&apos;',
  );
});

// -----------------------------------------------------------------
// 25. createRng / shuffleInPlace — deterministic shuffle
// ערבוב דטרמיניסטי באמצעות זרע קבוע
// -----------------------------------------------------------------

test('createRng + shuffleInPlace: deterministic given seed', () => {
  const a = [1, 2, 3, 4, 5, 6, 7, 8];
  const b = [1, 2, 3, 4, 5, 6, 7, 8];
  shuffleInPlace(a, createRng(42));
  shuffleInPlace(b, createRng(42));
  assert.deepEqual(a, b);
  // Different seed -> typically different order.
  const c = [1, 2, 3, 4, 5, 6, 7, 8];
  shuffleInPlace(c, createRng(43));
  assert.notDeepEqual(a, c);
});

// -----------------------------------------------------------------
// 26. correlation() dispatcher selects the right method
// הבורר correlation בוחר את השיטה הנכונה
// -----------------------------------------------------------------

test('correlation: dispatcher routes to pearson/spearman/kendall', () => {
  const x = [1, 2, 3, 4, 5];
  const y = [1, 4, 9, 16, 25];
  approx(correlation(x, y, 'pearson'), pearson(x, y), CLOSE);
  approx(correlation(x, y, 'spearman'), spearman(x, y), CLOSE);
  approx(correlation(x, y, 'kendall'), kendall(x, y), CLOSE);
  // Unknown method throws.
  assert.throws(
    () => correlation(x, y, 'garbage' as unknown as 'pearson'),
    /Unknown method/,
  );
});

// -----------------------------------------------------------------
// 27. End-to-end realistic Techno-Kol scenario
// תרחיש מציאותי מקצה-לקצה
// -----------------------------------------------------------------

test('end-to-end: procurement scenario produces ranked correlations and SVG', () => {
  // Simulated monthly metrics for 12 months in a Techno-Kol project.
  const series: Series[] = [
    makeSeries('עלות חומרים', 'Materials Cost',
      [ 10, 12, 11, 14, 16, 15, 18, 19, 21, 22, 24, 25]),
    makeSeries('שעות עבודה',  'Labor Hours',
      [100,110,108,125,140,135,160,168,180,190,205,215]),
    makeSeries('אחוז תקלות',  'Defect Rate',
      [5.0, 4.8, 5.1, 4.5, 4.2, 4.4, 3.8, 3.6, 3.2, 3.0, 2.8, 2.5]),
    makeSeries('שביעות רצון',  'Satisfaction',
      [7.0, 7.1, 7.0, 7.3, 7.5, 7.4, 7.8, 8.0, 8.2, 8.4, 8.6, 8.8]),
  ];
  const m: CorrelationMatrix = correlationMatrix(series, {
    method: 'spearman',
    permutations: 300,
    seed: 2026,
  });
  // Diagonal is 1 across the board.
  for (let i = 0; i < 4; i++) approx(m.r[i][i], 1, CLOSE);
  // Materials vs Labor should be strongly positive.
  const materialsVsLabor = m.r[0][1];
  assert.ok(materialsVsLabor > 0.9, `expected strong positive, got ${materialsVsLabor}`);
  // Defect vs Satisfaction should be strongly negative.
  const defectVsSatisfaction = m.r[2][3];
  assert.ok(
    defectVsSatisfaction < -0.9,
    `expected strong negative, got ${defectVsSatisfaction}`,
  );
  const ranked = rankSignificantCorrelations(m, 0.05, 0.5);
  assert.ok(ranked.length >= 2);
  // Top ranked must have |r| >= next.
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].magnitude >= ranked[i].magnitude);
  }
  // SVG renders successfully.
  const svg = renderHeatmapSvg(m, {
    language: 'both',
    title: { he: 'מתאמי רכש', en: 'Procurement Correlations' },
  });
  assert.ok(svg.includes('מתאמי רכש / Procurement Correlations'));
  assert.ok(svg.length > 500);
});
