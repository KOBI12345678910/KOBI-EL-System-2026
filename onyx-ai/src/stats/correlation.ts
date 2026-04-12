/**
 * ONYX AI — Correlation Matrix Tool
 * כלי מטריצת מתאם — Techno-Kol Uzi mega-ERP / Agent Y-160
 * ------------------------------------------------------------
 *
 * Zero external dependencies. Pure TypeScript / Node built-ins.
 * אפס תלויות חיצוניות — TypeScript טהור.
 *
 * Provides three correlation coefficients plus permutation-test
 * p-values, ranking of significant correlations, and a bilingual
 * SVG heatmap renderer.
 *
 * מספק שלושה מקדמי מתאם בתוספת ערכי p מבחן-החלפה (permutation),
 * דירוג מתאמים מובהקים, ומחולל תצוגת חום SVG דו-לשוני.
 *
 * Methods / שיטות:
 *   - pearson   — linear correlation / מתאם לינארי
 *   - spearman  — rank-based correlation / מתאם דירוגי
 *   - kendall   — tau-b (ties-corrected) / טאו-ב עם תיקון תיקו
 *
 * The whole module is deterministic given a fixed seed for the
 * permutation test. Seed is the 32-bit xorshift initial state.
 * כל המודול דטרמיניסטי בהינתן זרע קבוע למבחן ההחלפה.
 */

// -----------------------------------------------------------------
// Types — טיפוסים
// -----------------------------------------------------------------

/** Correlation method name / שם שיטת מתאם. */
export type CorrelationMethod = 'pearson' | 'spearman' | 'kendall';

/**
 * Bilingual label (Hebrew + English).
 * תווית דו-לשונית (עברית + אנגלית).
 */
export interface BilingualLabel {
  he: string;
  en: string;
}

/**
 * Input column — one named numeric series.
 * עמודת קלט — סדרה מספרית עם שם.
 */
export interface Series {
  label: BilingualLabel;
  values: ReadonlyArray<number>;
}

/**
 * A single correlation cell inside the matrix.
 * תא בודד במטריצת המתאם.
 */
export interface CorrelationCell {
  readonly rowIndex: number;
  readonly colIndex: number;
  readonly row: BilingualLabel;
  readonly col: BilingualLabel;
  /** Coefficient in [-1, 1]. NaN if undefined (e.g., zero variance). */
  readonly r: number;
  /** Two-sided permutation p-value in [0, 1]. NaN when r is NaN. */
  readonly pValue: number;
  /** Sample size used (pairwise complete observations). */
  readonly n: number;
}

/**
 * Full correlation matrix result.
 * תוצאה מלאה של מטריצת המתאם.
 */
export interface CorrelationMatrix {
  readonly method: CorrelationMethod;
  readonly labels: ReadonlyArray<BilingualLabel>;
  /** r[i][j] — coefficient between series i and j. */
  readonly r: ReadonlyArray<ReadonlyArray<number>>;
  /** p[i][j] — matching two-sided permutation p-value. */
  readonly p: ReadonlyArray<ReadonlyArray<number>>;
  /** Long-form cells excluding self-correlations. Upper triangle only. */
  readonly cells: ReadonlyArray<CorrelationCell>;
}

/**
 * Options for correlation matrix computation.
 * אפשרויות לחישוב מטריצת המתאם.
 */
export interface CorrelationOptions {
  /** Method to use — default 'pearson'. */
  method?: CorrelationMethod;
  /** Number of permutations for p-value — default 1000. */
  permutations?: number;
  /** PRNG seed — default 0x6d2b79f5 (arbitrary fixed constant). */
  seed?: number;
  /** Skip p-value computation (faster) — default false. */
  skipPValue?: boolean;
}

/**
 * Options for heatmap SVG rendering.
 * אפשרויות לרינדור SVG של מפת החום.
 */
export interface HeatmapOptions {
  /** Pixel size of a single cell — default 56. */
  cellSize?: number;
  /** Left/top margin in pixels for labels — default 180. */
  margin?: number;
  /** Language for rendered labels — default 'both'. */
  language?: 'he' | 'en' | 'both';
  /** Show numeric r values inside cells — default true. */
  showValues?: boolean;
  /** Title shown above the matrix. */
  title?: BilingualLabel;
}

/**
 * Ranking of significant correlations.
 * דירוג מתאמים מובהקים.
 */
export interface SignificantCorrelation extends CorrelationCell {
  /** absolute magnitude used for sorting */
  readonly magnitude: number;
  /** 'positive' | 'negative' — direction of association */
  readonly direction: 'positive' | 'negative' | 'none';
}

// -----------------------------------------------------------------
// Deterministic PRNG (xorshift32) — מחולל אקראי דטרמיניסטי
// -----------------------------------------------------------------

/**
 * Creates a deterministic PRNG using xorshift32.
 * Returned function yields floats in [0, 1).
 * יוצר מחולל אקראי דטרמיניסטי (xorshift32).
 */
export function createRng(seed: number): () => number {
  // Coerce to a non-zero 32-bit unsigned integer.
  let state = (seed | 0) >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return function rng(): number {
    // xorshift32 — classic Marsaglia constants.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * Fisher–Yates shuffle (in-place). Uses an injected RNG so the
 * permutation test is deterministic. ערבוב פישר-ייטס.
 */
export function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// -----------------------------------------------------------------
// Basic vector math — חישובים וקטוריים בסיסיים
// -----------------------------------------------------------------

/**
 * Strips (x,y) pairs where either side is NaN or non-finite.
 * מסיר זוגות עם ערכים חסרים.
 */
export function pairwiseClean(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
): { x: number[]; y: number[] } {
  const n = Math.min(x.length, y.length);
  const cx: number[] = [];
  const cy: number[] = [];
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (Number.isFinite(xi) && Number.isFinite(yi)) {
      cx.push(xi);
      cy.push(yi);
    }
  }
  return { x: cx, y: cy };
}

function mean(v: ReadonlyArray<number>): number {
  if (v.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return s / v.length;
}

// -----------------------------------------------------------------
// Pearson correlation — מתאם פירסון
// -----------------------------------------------------------------

/**
 * Computes Pearson's r on cleaned pairs.
 * מחשב מקדם מתאם פירסון על זוגות נקיים.
 * Returns NaN when either vector has zero variance or n<2.
 */
export function pearson(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
): number {
  const clean = pairwiseClean(x, y);
  const n = clean.x.length;
  if (n < 2) return NaN;
  const mx = mean(clean.x);
  const my = mean(clean.y);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = clean.x[i] - mx;
    const dy = clean.y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0 || !Number.isFinite(denom)) return NaN;
  const r = num / denom;
  // Numerical clamp — floating point can push |r| slightly above 1.
  if (r > 1) return 1;
  if (r < -1) return -1;
  return r;
}

// -----------------------------------------------------------------
// Ranking with tie handling — דירוג עם טיפול בתיקו
// -----------------------------------------------------------------

/**
 * Fractional (average) ranks with ties. R's default "average" method.
 * דירוג ממוצע עם טיפול בתיקו — בדיוק כמו ברירת המחדל של R.
 */
export function fractionalRanks(v: ReadonlyArray<number>): number[] {
  const n = v.length;
  if (n === 0) return [];
  // Pair (value, originalIndex) and stable-sort ascending.
  const indexed: Array<{ val: number; idx: number }> = new Array(n);
  for (let i = 0; i < n; i++) {
    indexed[i] = { val: v[i], idx: i };
  }
  indexed.sort((a, b) => {
    if (a.val < b.val) return -1;
    if (a.val > b.val) return 1;
    return a.idx - b.idx;
  });
  const ranks: number[] = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].val === indexed[i].val) j++;
    // Average rank is 1-based: ((i+1)+(j+1))/2
    const avg = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].idx] = avg;
    }
    i = j + 1;
  }
  return ranks;
}

// -----------------------------------------------------------------
// Spearman correlation — מתאם ספירמן
// -----------------------------------------------------------------

/**
 * Spearman rho — Pearson on fractional ranks.
 * Handles ties via average ranking. מתאם ספירמן עם טיפול בתיקו.
 */
export function spearman(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
): number {
  const clean = pairwiseClean(x, y);
  if (clean.x.length < 2) return NaN;
  const rx = fractionalRanks(clean.x);
  const ry = fractionalRanks(clean.y);
  return pearson(rx, ry);
}

// -----------------------------------------------------------------
// Kendall tau-b — מתאם קנדל
// -----------------------------------------------------------------

/**
 * Kendall's tau-b, the tie-corrected variant.
 * מקדם קנדל טאו-ב, עם תיקון תיקו.
 *
 * tau-b = (C - D) / sqrt((C + D + Tx) * (C + D + Ty))
 * where C, D are concordant / discordant pair counts and
 * Tx, Ty are pair counts tied only on x or y (not both).
 */
export function kendall(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
): number {
  const clean = pairwiseClean(x, y);
  const n = clean.x.length;
  if (n < 2) return NaN;
  let concordant = 0;
  let discordant = 0;
  let tieX = 0;
  let tieY = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = clean.x[i] - clean.x[j];
      const dy = clean.y[i] - clean.y[j];
      const prod = dx * dy;
      if (prod > 0) {
        concordant++;
      } else if (prod < 0) {
        discordant++;
      } else if (dx === 0 && dy === 0) {
        // Double tie — contributes to neither term.
      } else if (dx === 0) {
        tieX++;
      } else {
        tieY++;
      }
    }
  }
  const denom = Math.sqrt(
    (concordant + discordant + tieX) * (concordant + discordant + tieY),
  );
  if (denom === 0 || !Number.isFinite(denom)) return NaN;
  const tau = (concordant - discordant) / denom;
  if (tau > 1) return 1;
  if (tau < -1) return -1;
  return tau;
}

// -----------------------------------------------------------------
// Method dispatcher — בורר שיטה
// -----------------------------------------------------------------

/**
 * Computes a correlation coefficient by method name.
 * מחשב מקדם מתאם לפי שם שיטה.
 */
export function correlation(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
  method: CorrelationMethod = 'pearson',
): number {
  switch (method) {
    case 'pearson':
      return pearson(x, y);
    case 'spearman':
      return spearman(x, y);
    case 'kendall':
      return kendall(x, y);
    default: {
      const exhaustive: never = method;
      throw new Error(`Unknown method: ${String(exhaustive)}`);
    }
  }
}

// -----------------------------------------------------------------
// Permutation test p-value — ערך p במבחן החלפה
// -----------------------------------------------------------------

/**
 * Two-sided permutation p-value for a single correlation.
 * ערך p במבחן החלפה דו-צדדי.
 *
 * Shuffles y repeatedly and counts how often |r_perm| >= |r_obs|.
 * Adds +1 to numerator and denominator (the Phipson-Smyth
 * correction) so the p-value never reaches exactly zero.
 */
export function permutationPValue(
  x: ReadonlyArray<number>,
  y: ReadonlyArray<number>,
  method: CorrelationMethod = 'pearson',
  permutations = 1000,
  seed = 0x6d2b79f5,
): number {
  const clean = pairwiseClean(x, y);
  if (clean.x.length < 3) return NaN;
  const rObs = correlation(clean.x, clean.y, method);
  if (!Number.isFinite(rObs)) return NaN;
  const absObs = Math.abs(rObs);
  const rng = createRng(seed);
  const shuffled = clean.y.slice();
  let hits = 0;
  const iterations = Math.max(1, Math.floor(permutations));
  for (let t = 0; t < iterations; t++) {
    shuffleInPlace(shuffled, rng);
    const rPerm = correlation(clean.x, shuffled, method);
    if (Number.isFinite(rPerm) && Math.abs(rPerm) >= absObs) {
      hits++;
    }
  }
  // Phipson-Smyth correction: (hits + 1) / (perms + 1).
  return (hits + 1) / (iterations + 1);
}

// -----------------------------------------------------------------
// Full matrix — מטריצה מלאה
// -----------------------------------------------------------------

/**
 * Computes the full correlation matrix for a list of series.
 * מחשב מטריצת מתאם מלאה עבור רשימת סדרות.
 *
 * Diagonal is always exactly 1 (or NaN if the series has zero
 * variance). Matrix is symmetric.
 */
export function correlationMatrix(
  series: ReadonlyArray<Series>,
  options: CorrelationOptions = {},
): CorrelationMatrix {
  const method: CorrelationMethod = options.method ?? 'pearson';
  const permutations = options.permutations ?? 1000;
  const seed = options.seed ?? 0x6d2b79f5;
  const skipPValue = options.skipPValue === true;

  const k = series.length;
  if (k === 0) {
    return {
      method,
      labels: [],
      r: [],
      p: [],
      cells: [],
    };
  }

  // Validate equal length — caller contract.
  const expectedLen = series[0].values.length;
  for (let i = 1; i < k; i++) {
    if (series[i].values.length !== expectedLen) {
      throw new Error(
        `correlationMatrix: series "${series[i].label.en}" has length ` +
          `${series[i].values.length} but expected ${expectedLen}.`,
      );
    }
  }

  const labels = series.map((s) => s.label);
  const r: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const p: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const cells: CorrelationCell[] = [];

  for (let i = 0; i < k; i++) {
    r[i][i] = correlation(series[i].values, series[i].values, method);
    p[i][i] = 0;
    for (let j = i + 1; j < k; j++) {
      const xi = series[i].values;
      const yj = series[j].values;
      const rij = correlation(xi, yj, method);
      // Distinct seed per pair so we don't reuse the same permutation
      // sequence across every cell — avoids correlated noise.
      const pairSeed = (seed + i * 1000003 + j * 97) >>> 0;
      const pij = skipPValue
        ? NaN
        : permutationPValue(xi, yj, method, permutations, pairSeed);
      r[i][j] = rij;
      r[j][i] = rij;
      p[i][j] = pij;
      p[j][i] = pij;
      const clean = pairwiseClean(xi, yj);
      cells.push({
        rowIndex: i,
        colIndex: j,
        row: series[i].label,
        col: series[j].label,
        r: rij,
        pValue: pij,
        n: clean.x.length,
      });
    }
  }

  return { method, labels, r, p, cells };
}

// -----------------------------------------------------------------
// Significant correlations ranking — דירוג מתאמים מובהקים
// -----------------------------------------------------------------

/**
 * Ranks correlation cells by absolute magnitude, filtering by
 * significance level (alpha) and absolute threshold.
 * מדרג תאי מתאם לפי העוצמה המוחלטת, מסנן לפי רמת מובהקות.
 *
 * Ties break deterministically: larger |r| first, then smaller p,
 * then row index, then column index.
 */
export function rankSignificantCorrelations(
  matrix: CorrelationMatrix,
  alpha = 0.05,
  minAbsR = 0,
): SignificantCorrelation[] {
  const out: SignificantCorrelation[] = [];
  for (const cell of matrix.cells) {
    if (!Number.isFinite(cell.r)) continue;
    const mag = Math.abs(cell.r);
    if (mag < minAbsR) continue;
    // When p-value was skipped, treat as "always significant".
    if (Number.isFinite(cell.pValue) && cell.pValue > alpha) continue;
    let direction: 'positive' | 'negative' | 'none';
    if (cell.r > 0) direction = 'positive';
    else if (cell.r < 0) direction = 'negative';
    else direction = 'none';
    out.push({ ...cell, magnitude: mag, direction });
  }
  out.sort((a, b) => {
    if (b.magnitude !== a.magnitude) return b.magnitude - a.magnitude;
    if (Number.isFinite(a.pValue) && Number.isFinite(b.pValue)) {
      if (a.pValue !== b.pValue) return a.pValue - b.pValue;
    }
    if (a.rowIndex !== b.rowIndex) return a.rowIndex - b.rowIndex;
    return a.colIndex - b.colIndex;
  });
  return out;
}

// -----------------------------------------------------------------
// Heatmap SVG rendering — רינדור SVG של מפת חום
// -----------------------------------------------------------------

/**
 * XML-escapes a string for safe inclusion inside SVG text / attr.
 * מבריח תווי XML להכנסה בטוחה לתוך SVG.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Maps r in [-1, 1] to a diverging color.
 * -1 => deep blue, 0 => near white, +1 => deep red.
 * ממפה r לצבע בטווח הכחול-לבן-אדום.
 */
export function heatmapColor(r: number): string {
  if (!Number.isFinite(r)) return '#e5e7eb';
  const clamped = Math.max(-1, Math.min(1, r));
  // Two-stop gradient around 0.
  // Interpolate between blue (30,64,175) and white (248,250,252)
  // for negative side, and between white and red (185,28,28) for positive.
  const blue = [30, 64, 175];
  const white = [248, 250, 252];
  const red = [185, 28, 28];
  let rgb: [number, number, number];
  if (clamped < 0) {
    const t = -clamped;
    rgb = [
      Math.round(white[0] + (blue[0] - white[0]) * t),
      Math.round(white[1] + (blue[1] - white[1]) * t),
      Math.round(white[2] + (blue[2] - white[2]) * t),
    ];
  } else {
    const t = clamped;
    rgb = [
      Math.round(white[0] + (red[0] - white[0]) * t),
      Math.round(white[1] + (red[1] - white[1]) * t),
      Math.round(white[2] + (red[2] - white[2]) * t),
    ];
  }
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function formatBilingual(
  label: BilingualLabel,
  language: 'he' | 'en' | 'both',
): string {
  if (language === 'he') return label.he;
  if (language === 'en') return label.en;
  return `${label.he} / ${label.en}`;
}

/**
 * Renders the correlation matrix as an SVG heatmap.
 * מרנדר את מטריצת המתאם כ-SVG של מפת חום.
 *
 * The SVG declares lang="he" + dir="auto" so a browser renders
 * Hebrew labels correctly without extra CSS.
 */
export function renderHeatmapSvg(
  matrix: CorrelationMatrix,
  options: HeatmapOptions = {},
): string {
  const cellSize = options.cellSize ?? 56;
  const margin = options.margin ?? 180;
  const language: 'he' | 'en' | 'both' = options.language ?? 'both';
  const showValues = options.showValues !== false;
  const title: BilingualLabel = options.title ?? {
    he: 'מטריצת מתאם',
    en: 'Correlation Matrix',
  };

  const k = matrix.labels.length;
  const width = margin + k * cellSize + 40;
  const height = margin + k * cellSize + 40;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
      `width="${width}" height="${height}" lang="he" dir="auto" ` +
      `role="img" aria-label="${escapeXml(formatBilingual(title, language))}">`,
  );
  parts.push(
    `<style>text{font-family:Arial,Helvetica,'Segoe UI',sans-serif;font-size:12px;}` +
      `.t{font-size:16px;font-weight:700;}` +
      `.v{font-size:11px;text-anchor:middle;dominant-baseline:central;}` +
      `</style>`,
  );
  parts.push(
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
  );
  // Title
  parts.push(
    `<text class="t" x="${width / 2}" y="24" text-anchor="middle">` +
      `${escapeXml(formatBilingual(title, language))}</text>`,
  );
  // Method subtitle
  const methodLabel: Record<CorrelationMethod, BilingualLabel> = {
    pearson: { he: 'פירסון', en: 'Pearson' },
    spearman: { he: 'ספירמן', en: 'Spearman' },
    kendall: { he: 'קנדל טאו-ב', en: 'Kendall tau-b' },
  };
  parts.push(
    `<text x="${width / 2}" y="44" text-anchor="middle" fill="#475569">` +
      `${escapeXml(formatBilingual(methodLabel[matrix.method], language))}</text>`,
  );

  // Column labels — rotated 45 deg for readability.
  for (let j = 0; j < k; j++) {
    const cx = margin + j * cellSize + cellSize / 2;
    const cy = margin - 8;
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="start" ` +
        `transform="rotate(-45 ${cx} ${cy})">` +
        `${escapeXml(formatBilingual(matrix.labels[j], language))}</text>`,
    );
  }
  // Row labels — anchored at end of the left margin.
  for (let i = 0; i < k; i++) {
    const rx = margin - 8;
    const ry = margin + i * cellSize + cellSize / 2 + 4;
    parts.push(
      `<text x="${rx}" y="${ry}" text-anchor="end">` +
        `${escapeXml(formatBilingual(matrix.labels[i], language))}</text>`,
    );
  }

  // Cells
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const x = margin + j * cellSize;
      const y = margin + i * cellSize;
      const rij = matrix.r[i][j];
      const fill = heatmapColor(rij);
      const label = Number.isFinite(rij) ? rij.toFixed(2) : 'NA';
      parts.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" ` +
          `fill="${fill}" stroke="#94a3b8" stroke-width="1"/>`,
      );
      if (showValues) {
        const textColor =
          Number.isFinite(rij) && Math.abs(rij) > 0.55 ? '#ffffff' : '#0f172a';
        parts.push(
          `<text class="v" x="${x + cellSize / 2}" y="${y + cellSize / 2}" ` +
            `fill="${textColor}">${label}</text>`,
        );
      }
    }
  }

  // Legend — small horizontal color bar
  const legendX = margin;
  const legendY = margin + k * cellSize + 16;
  const legendW = Math.min(200, k * cellSize);
  const legendH = 10;
  const stops = 20;
  for (let s = 0; s < stops; s++) {
    const t = -1 + (2 * s) / (stops - 1);
    parts.push(
      `<rect x="${legendX + (s * legendW) / stops}" y="${legendY}" ` +
        `width="${legendW / stops + 0.5}" height="${legendH}" ` +
        `fill="${heatmapColor(t)}"/>`,
    );
  }
  parts.push(
    `<text x="${legendX}" y="${legendY + legendH + 12}" text-anchor="start">-1</text>`,
  );
  parts.push(
    `<text x="${legendX + legendW / 2}" y="${legendY + legendH + 12}" ` +
      `text-anchor="middle">0</text>`,
  );
  parts.push(
    `<text x="${legendX + legendW}" y="${legendY + legendH + 12}" ` +
      `text-anchor="end">+1</text>`,
  );

  parts.push(`</svg>`);
  return parts.join('');
}
