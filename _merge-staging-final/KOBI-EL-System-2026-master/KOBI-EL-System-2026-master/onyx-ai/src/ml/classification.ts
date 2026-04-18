/**
 * ONYX AI — Classification Toolkit (Agent Y-157)
 * ==============================================
 * Techno-Kol Uzi mega-ERP — ערכת סיווג
 *
 * Zero-dependency (Node built-ins only) pure-TypeScript classification
 * toolkit used by ONYX AI for quick-fire business classification tasks.
 *
 * Implemented algorithms:
 *   1. Logistic Regression (batch gradient descent, binary)
 *   2. Gaussian Naive Bayes (multi-class)
 *   3. Decision Stump (one-level decision tree, binary / multi-class)
 *
 * Plus supporting utilities that every pipeline needs:
 *   - train/test split (deterministic when given a seed)
 *   - k-fold cross-validation helper
 *   - confusion matrix + precision / recall / f1 / accuracy
 *   - bilingual (Hebrew + English) feature label map
 *   - four ready-made use-case feature sets:
 *       * invoice fraud probability        — הסתברות הונאה בחשבונית
 *       * supplier delivery risk           — סיכון אי-עמידה באספקה
 *       * defect class                     — סיווג פגמים
 *       * payment lateness risk            — סיכון איחור בתשלום
 *
 * Rules:
 *   - NEVER delete previous work
 *   - NO external dependencies (built-ins only)
 *   - Bilingual (עברית + English) throughout
 *
 * Usage:
 *
 *   import {
 *     LogisticRegression,
 *     GaussianNaiveBayes,
 *     DecisionStump,
 *     trainTestSplit,
 *     kFoldCrossValidate,
 *     confusionMatrix,
 *     classificationReport,
 *     BILINGUAL_FEATURES,
 *   } from './ml/classification';
 *
 *   const { xTrain, yTrain, xTest, yTest } = trainTestSplit(X, y, 0.2, 42);
 *   const model = new LogisticRegression({ learningRate: 0.1, epochs: 300 });
 *   model.fit(xTrain, yTrain);
 *   const preds = model.predict(xTest);
 *   const cm = confusionMatrix(yTest, preds, [0, 1]);
 *   const report = classificationReport(yTest, preds, [0, 1]);
 */

// ============================================================
// Types — טיפוסים
// ============================================================

/** Row of numeric features / שורת תכונות מספריות */
export type FeatureVector = number[];

/** Feature matrix — מטריצת תכונות (n rows x m cols) */
export type FeatureMatrix = FeatureVector[];

/** Class label — תווית מחלקה (number OR string) */
export type Label = number | string;

/** Label vector / וקטור תוויות */
export type LabelVector = Label[];

/** Binary prediction with calibrated probability / חיזוי בינארי עם הסתברות */
export interface BinaryPrediction {
  /** Predicted label / התווית החזויה */
  label: Label;
  /** P(class = positiveClass | x) / הסתברות המחלקה החיובית */
  probability: number;
}

/** Multi-class prediction / חיזוי רב-מחלקות */
export interface MultiClassPrediction {
  /** Predicted label / התווית החזויה */
  label: Label;
  /** Per-class score / ציון לכל מחלקה */
  scores: Record<string, number>;
}

/** Bilingual feature label / תווית דו-לשונית לתכונה */
export interface BilingualLabel {
  /** Machine key / מפתח מערכת */
  key: string;
  /** English label / תווית באנגלית */
  en: string;
  /** Hebrew label / תווית בעברית */
  he: string;
  /** Short description / תיאור קצר */
  description?: { en: string; he: string };
}

/** Named feature set for a use-case / אוסף תכונות למקרה שימוש */
export interface FeatureSet {
  /** Name / שם */
  name: { en: string; he: string };
  /** Feature labels in column order / תוויות בסדר העמודות */
  features: BilingualLabel[];
  /** Class labels in order (index → label) / תוויות המחלקות */
  classes: BilingualLabel[];
}

/** Train / test split result / תוצאת חלוקת אימון-בדיקה */
export interface SplitResult {
  xTrain: FeatureMatrix;
  yTrain: LabelVector;
  xTest: FeatureMatrix;
  yTest: LabelVector;
}

/** Cross-validation fold result / תוצאה של קפל בחלוקה צולבת */
export interface FoldResult {
  fold: number;
  accuracy: number;
  macroF1: number;
  size: number;
}

/** Aggregated cross-validation report / דו"ח מסכם של תיקוף צולב */
export interface CrossValidationReport {
  k: number;
  folds: FoldResult[];
  meanAccuracy: number;
  stdAccuracy: number;
  meanMacroF1: number;
}

/** Per-class precision / recall / f1 / תוצאה למחלקה */
export interface ClassMetrics {
  label: Label;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

/** Full classification report / דו"ח סיווג מלא */
export interface ClassificationReport {
  accuracy: number;
  perClass: ClassMetrics[];
  macroF1: number;
  weightedF1: number;
  total: number;
}

// ============================================================
// Deterministic RNG — מחולל מספרים פסאודו-אקראיים קבוע
// ============================================================

/**
 * Mulberry32 — small fast deterministic PRNG. Same seed ⇒ same sequence.
 * Used for train/test split and shuffling so tests are reproducible.
 * מחולל קטן ודטרמיניסטי — זרע זהה מחזיר רצף זהה.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle, deterministic when given a PRNG.
 * ערבוב פישר-ייטס — דטרמיניסטי בהינתן PRNG.
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

// ============================================================
// Train / Test Split — חלוקת אימון ובדיקה
// ============================================================

/**
 * Deterministic train/test split.
 * @param X  feature matrix (n rows)
 * @param y  label vector   (n rows)
 * @param testSize fraction in (0,1) that goes to test
 * @param seed optional PRNG seed (defaults to 42)
 * חלוקה דטרמיניסטית של אימון ובדיקה.
 */
export function trainTestSplit(
  X: FeatureMatrix,
  y: LabelVector,
  testSize = 0.2,
  seed = 42,
): SplitResult {
  if (X.length !== y.length) {
    throw new Error(
      'trainTestSplit: X and y must have the same length / אורכי X ו-y חייבים להיות זהים',
    );
  }
  if (X.length === 0) {
    throw new Error('trainTestSplit: empty dataset / מערך ריק');
  }
  if (testSize <= 0 || testSize >= 1) {
    throw new Error(
      'trainTestSplit: testSize must be in (0,1) / יחס חייב להיות בין 0 ל-1',
    );
  }
  const n = X.length;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(i);
  shuffleInPlace(indices, mulberry32(seed));
  const testCount = Math.max(1, Math.floor(n * testSize));
  const trainCount = n - testCount;
  const xTrain: FeatureMatrix = [];
  const yTrain: LabelVector = [];
  const xTest: FeatureMatrix = [];
  const yTest: LabelVector = [];
  for (let i = 0; i < trainCount; i++) {
    const idx = indices[i];
    xTrain.push(X[idx].slice());
    yTrain.push(y[idx]);
  }
  for (let i = trainCount; i < n; i++) {
    const idx = indices[i];
    xTest.push(X[idx].slice());
    yTest.push(y[idx]);
  }
  return { xTrain, yTrain, xTest, yTest };
}

// ============================================================
// Logistic Regression (binary) — רגרסיה לוגיסטית
// ============================================================

export interface LogisticRegressionOptions {
  /** Learning rate / קצב למידה */
  learningRate?: number;
  /** Number of gradient-descent iterations / מספר איטרציות ירידת גרדיאנט */
  epochs?: number;
  /** L2 regularisation weight / משקל רגולריזציה */
  l2?: number;
  /** Positive class label / תווית המחלקה החיובית */
  positiveClass?: Label;
  /** Negative class label / תווית המחלקה השלילית */
  negativeClass?: Label;
  /** Probability threshold for class decision / סף הסתברות לסיווג */
  threshold?: number;
}

/**
 * Numerically stable sigmoid / סיגמואיד יציב מספרית.
 * For very negative z, returns exp(z) / (1 + exp(z)).
 */
export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Binary logistic regression trained with batch gradient descent.
 * רגרסיה לוגיסטית בינארית עם ירידת גרדיאנט אצוותית.
 */
export class LogisticRegression {
  public weights: number[] = [];
  public bias = 0;
  public readonly learningRate: number;
  public readonly epochs: number;
  public readonly l2: number;
  public readonly positiveClass: Label;
  public readonly negativeClass: Label;
  public readonly threshold: number;
  public readonly lossHistory: number[] = [];

  constructor(opts: LogisticRegressionOptions = {}) {
    this.learningRate = opts.learningRate ?? 0.1;
    this.epochs = opts.epochs ?? 500;
    this.l2 = opts.l2 ?? 0;
    this.positiveClass = opts.positiveClass ?? 1;
    this.negativeClass = opts.negativeClass ?? 0;
    this.threshold = opts.threshold ?? 0.5;
  }

  /** Converts labels (any) to 0 / 1 for training. / הופך תוויות ל-0/1. */
  private encode(y: LabelVector): number[] {
    return y.map((v) => {
      if (v === this.positiveClass) return 1;
      if (v === this.negativeClass) return 0;
      // Fallback: coerce truthy number to 1
      if (typeof v === 'number') return v > 0 ? 1 : 0;
      throw new Error(
        `LogisticRegression: unknown label "${String(v)}" / תווית לא מוכרת`,
      );
    });
  }

  /** Fit the model. / אימון המודל. */
  public fit(X: FeatureMatrix, y: LabelVector): void {
    if (X.length === 0) throw new Error('LogisticRegression.fit: empty X');
    if (X.length !== y.length) {
      throw new Error(
        'LogisticRegression.fit: X/y length mismatch / אורכי X ו-y אינם תואמים',
      );
    }
    const m = X.length;
    const nFeatures = X[0].length;
    this.weights = new Array(nFeatures).fill(0);
    this.bias = 0;
    const yEnc = this.encode(y);

    for (let epoch = 0; epoch < this.epochs; epoch++) {
      const gradW = new Array(nFeatures).fill(0);
      let gradB = 0;
      let loss = 0;
      for (let i = 0; i < m; i++) {
        const xi = X[i];
        let z = this.bias;
        for (let j = 0; j < nFeatures; j++) z += this.weights[j] * xi[j];
        const p = sigmoid(z);
        const err = p - yEnc[i];
        for (let j = 0; j < nFeatures; j++) gradW[j] += err * xi[j];
        gradB += err;
        // Binary cross-entropy (with clipping to avoid log(0))
        const pc = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
        loss += -(yEnc[i] * Math.log(pc) + (1 - yEnc[i]) * Math.log(1 - pc));
      }
      // L2 penalty (excludes bias)
      if (this.l2 > 0) {
        for (let j = 0; j < nFeatures; j++) {
          gradW[j] += this.l2 * this.weights[j];
          loss += 0.5 * this.l2 * this.weights[j] * this.weights[j];
        }
      }
      // Parameter update
      for (let j = 0; j < nFeatures; j++) {
        this.weights[j] -= (this.learningRate * gradW[j]) / m;
      }
      this.bias -= (this.learningRate * gradB) / m;
      this.lossHistory.push(loss / m);
    }
  }

  /** Returns P(positiveClass | x). / מחזיר את ההסתברות למחלקה החיובית. */
  public predictProba(x: FeatureVector): number {
    let z = this.bias;
    for (let j = 0; j < this.weights.length; j++) z += this.weights[j] * x[j];
    return sigmoid(z);
  }

  /** Predict labels for a batch of rows. / חיזוי תוויות עבור אוסף רשומות. */
  public predict(X: FeatureMatrix): LabelVector {
    const out: LabelVector = [];
    for (const row of X) {
      const p = this.predictProba(row);
      out.push(p >= this.threshold ? this.positiveClass : this.negativeClass);
    }
    return out;
  }

  /** Full per-row result with probability + label. / חיזוי מלא עם הסתברות ותווית. */
  public predictDetailed(X: FeatureMatrix): BinaryPrediction[] {
    return X.map((x) => {
      const p = this.predictProba(x);
      return {
        label: p >= this.threshold ? this.positiveClass : this.negativeClass,
        probability: p,
      };
    });
  }
}

// ============================================================
// Gaussian Naive Bayes (multi-class) — בייס נאיבי גאוסיאני
// ============================================================

export interface NaiveBayesOptions {
  /** Laplace smoothing for variance / החלקת לפלאס על שונות */
  varSmoothing?: number;
}

/**
 * Gaussian Naive Bayes classifier for continuous features.
 * Assumes features are conditionally independent given the class and
 * that each feature follows a Gaussian within each class.
 * מסווג בייס נאיבי גאוסיאני לתכונות רציפות.
 */
export class GaussianNaiveBayes {
  public classes: Label[] = [];
  public priors: Record<string, number> = {};
  public means: Record<string, number[]> = {};
  public variances: Record<string, number[]> = {};
  public readonly varSmoothing: number;

  constructor(opts: NaiveBayesOptions = {}) {
    this.varSmoothing = opts.varSmoothing ?? 1e-9;
  }

  /** Fit the model. / אימון המודל. */
  public fit(X: FeatureMatrix, y: LabelVector): void {
    if (X.length === 0) throw new Error('GaussianNaiveBayes.fit: empty X');
    if (X.length !== y.length) {
      throw new Error(
        'GaussianNaiveBayes.fit: X/y length mismatch / אורכי X ו-y אינם תואמים',
      );
    }
    const nFeatures = X[0].length;
    const grouped: Record<string, FeatureMatrix> = {};
    for (let i = 0; i < X.length; i++) {
      const key = String(y[i]);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(X[i]);
    }
    const classKeys = Object.keys(grouped).sort();
    const total = X.length;
    // Compute global variance for smoothing (max of per-feature variance * epsilon)
    let globalVarMax = 0;
    for (const cls of classKeys) {
      const rows = grouped[cls];
      for (let j = 0; j < nFeatures; j++) {
        let sum = 0;
        for (const r of rows) sum += r[j];
        const mean = sum / rows.length;
        let varSum = 0;
        for (const r of rows) varSum += (r[j] - mean) * (r[j] - mean);
        const v = varSum / rows.length;
        if (v > globalVarMax) globalVarMax = v;
      }
    }
    const smoothing = this.varSmoothing * (globalVarMax || 1);

    this.classes = [];
    this.priors = {};
    this.means = {};
    this.variances = {};
    for (const cls of classKeys) {
      const rows = grouped[cls];
      this.classes.push(rows.length ? (this.restoreLabel(cls, y)) : cls);
      this.priors[cls] = rows.length / total;
      const mean = new Array(nFeatures).fill(0);
      for (const r of rows) for (let j = 0; j < nFeatures; j++) mean[j] += r[j];
      for (let j = 0; j < nFeatures; j++) mean[j] /= rows.length;
      const variance = new Array(nFeatures).fill(0);
      for (const r of rows) {
        for (let j = 0; j < nFeatures; j++) {
          const d = r[j] - mean[j];
          variance[j] += d * d;
        }
      }
      for (let j = 0; j < nFeatures; j++) {
        variance[j] = variance[j] / rows.length + smoothing;
      }
      this.means[cls] = mean;
      this.variances[cls] = variance;
    }
  }

  /** Recovers the original label value from its string key. */
  private restoreLabel(key: string, y: LabelVector): Label {
    for (const v of y) if (String(v) === key) return v;
    return key;
  }

  /** Log-probability of a single row given a class. */
  private logLikelihood(x: FeatureVector, cls: string): number {
    const mean = this.means[cls];
    const variance = this.variances[cls];
    let logLik = Math.log(this.priors[cls]);
    for (let j = 0; j < x.length; j++) {
      const v = variance[j];
      const d = x[j] - mean[j];
      logLik += -0.5 * Math.log(2 * Math.PI * v) - (d * d) / (2 * v);
    }
    return logLik;
  }

  /** Predict normalised per-class probabilities. / חיזוי הסתברויות מנורמלות. */
  public predictProba(x: FeatureVector): Record<string, number> {
    const logs: Record<string, number> = {};
    let maxLog = -Infinity;
    for (const cls of Object.keys(this.priors)) {
      const l = this.logLikelihood(x, cls);
      logs[cls] = l;
      if (l > maxLog) maxLog = l;
    }
    let sum = 0;
    const exps: Record<string, number> = {};
    for (const cls of Object.keys(logs)) {
      const e = Math.exp(logs[cls] - maxLog);
      exps[cls] = e;
      sum += e;
    }
    const out: Record<string, number> = {};
    for (const cls of Object.keys(exps)) out[cls] = exps[cls] / sum;
    return out;
  }

  /** Predict labels. / חיזוי תוויות. */
  public predict(X: FeatureMatrix): LabelVector {
    const out: LabelVector = [];
    for (const x of X) {
      const probs = this.predictProba(x);
      let bestCls = '';
      let bestP = -Infinity;
      for (const cls of Object.keys(probs)) {
        if (probs[cls] > bestP) {
          bestP = probs[cls];
          bestCls = cls;
        }
      }
      // Restore original label type
      const idx = this.classes.findIndex((c) => String(c) === bestCls);
      out.push(idx >= 0 ? this.classes[idx] : bestCls);
    }
    return out;
  }

  /** Full per-row result with label + all class scores. / חיזוי מלא עם ציונים. */
  public predictDetailed(X: FeatureMatrix): MultiClassPrediction[] {
    return X.map((x) => {
      const scores = this.predictProba(x);
      let bestCls = '';
      let bestP = -Infinity;
      for (const cls of Object.keys(scores)) {
        if (scores[cls] > bestP) {
          bestP = scores[cls];
          bestCls = cls;
        }
      }
      const idx = this.classes.findIndex((c) => String(c) === bestCls);
      return {
        label: idx >= 0 ? this.classes[idx] : bestCls,
        scores,
      };
    });
  }
}

// ============================================================
// Decision Stump — גדם החלטה
// ============================================================

export interface DecisionStumpOptions {
  /** Criterion for picking the split: 'gini' or 'entropy' / קריטריון בחירת פיצול */
  criterion?: 'gini' | 'entropy';
}

interface StumpSplit {
  featureIndex: number;
  threshold: number;
  leftLabel: Label;
  rightLabel: Label;
  impurity: number;
}

/**
 * One-level decision tree ("decision stump"). Picks the best (feature,
 * threshold) pair that minimises impurity (Gini or entropy). Handles
 * binary and multi-class problems.
 * עץ החלטה בגובה 1 — בוחר פיצול הכי טוב לפי Gini/Entropy.
 */
export class DecisionStump {
  public split: StumpSplit | null = null;
  public readonly criterion: 'gini' | 'entropy';

  constructor(opts: DecisionStumpOptions = {}) {
    this.criterion = opts.criterion ?? 'gini';
  }

  private impurity(counts: Record<string, number>, total: number): number {
    if (total === 0) return 0;
    let imp = 0;
    if (this.criterion === 'gini') {
      let sqSum = 0;
      for (const c of Object.keys(counts)) {
        const p = counts[c] / total;
        sqSum += p * p;
      }
      imp = 1 - sqSum;
    } else {
      for (const c of Object.keys(counts)) {
        const p = counts[c] / total;
        if (p > 0) imp += -p * Math.log2(p);
      }
    }
    return imp;
  }

  private majority(labels: LabelVector): { label: Label; counts: Record<string, number> } {
    const counts: Record<string, number> = {};
    let bestLabel: Label = labels[0];
    let bestCount = 0;
    for (const l of labels) {
      const k = String(l);
      counts[k] = (counts[k] || 0) + 1;
      if (counts[k] > bestCount) {
        bestCount = counts[k];
        bestLabel = l;
      }
    }
    return { label: bestLabel, counts };
  }

  /** Fit the stump. / אימון הגדם. */
  public fit(X: FeatureMatrix, y: LabelVector): void {
    if (X.length === 0) throw new Error('DecisionStump.fit: empty X');
    if (X.length !== y.length) {
      throw new Error(
        'DecisionStump.fit: X/y length mismatch / אורכי X ו-y אינם תואמים',
      );
    }
    const nFeatures = X[0].length;
    let best: StumpSplit | null = null;

    for (let f = 0; f < nFeatures; f++) {
      // Candidate thresholds = unique sorted values of feature f
      const valsSet = new Set<number>();
      for (const row of X) valsSet.add(row[f]);
      const vals = Array.from(valsSet).sort((a, b) => a - b);
      // Midpoints between consecutive unique values are the candidate cuts
      const candidates: number[] = [];
      for (let i = 0; i < vals.length - 1; i++) {
        candidates.push((vals[i] + vals[i + 1]) / 2);
      }
      if (candidates.length === 0 && vals.length === 1) {
        candidates.push(vals[0]);
      }
      for (const t of candidates) {
        const leftLabels: LabelVector = [];
        const rightLabels: LabelVector = [];
        for (let i = 0; i < X.length; i++) {
          if (X[i][f] <= t) leftLabels.push(y[i]);
          else rightLabels.push(y[i]);
        }
        if (leftLabels.length === 0 || rightLabels.length === 0) continue;
        const leftMaj = this.majority(leftLabels);
        const rightMaj = this.majority(rightLabels);
        const leftImp = this.impurity(leftMaj.counts, leftLabels.length);
        const rightImp = this.impurity(rightMaj.counts, rightLabels.length);
        const weighted =
          (leftLabels.length * leftImp + rightLabels.length * rightImp) /
          X.length;
        if (best === null || weighted < best.impurity) {
          best = {
            featureIndex: f,
            threshold: t,
            leftLabel: leftMaj.label,
            rightLabel: rightMaj.label,
            impurity: weighted,
          };
        }
      }
    }
    if (best === null) {
      // Degenerate dataset → predict the overall majority class
      const maj = this.majority(y);
      best = {
        featureIndex: 0,
        threshold: 0,
        leftLabel: maj.label,
        rightLabel: maj.label,
        impurity: this.impurity(maj.counts, y.length),
      };
    }
    this.split = best;
  }

  /** Predict labels. / חיזוי תוויות. */
  public predict(X: FeatureMatrix): LabelVector {
    if (!this.split) throw new Error('DecisionStump.predict: not fitted');
    const s = this.split;
    return X.map((row) => (row[s.featureIndex] <= s.threshold ? s.leftLabel : s.rightLabel));
  }

  /** Predict probability of the positive branch being chosen (binary only). */
  public predictProba(x: FeatureVector, positiveClass: Label): number {
    if (!this.split) throw new Error('DecisionStump.predictProba: not fitted');
    const branchLabel =
      x[this.split.featureIndex] <= this.split.threshold
        ? this.split.leftLabel
        : this.split.rightLabel;
    return branchLabel === positiveClass ? 1 : 0;
  }
}

// ============================================================
// Confusion matrix + metrics — מטריצת בלבול ומדדים
// ============================================================

export interface ConfusionMatrix {
  /** Ordered class labels (rows = true, cols = predicted) / תוויות בסדר קבוע */
  labels: Label[];
  /** matrix[i][j] = count(true=labels[i] & pred=labels[j]) / מספרי הופעות */
  matrix: number[][];
}

/**
 * Build a confusion matrix. If `labels` omitted the union of y/yHat is used.
 * בונה מטריצת בלבול. אם לא מועברות תוויות, משתמש באיחוד של יעדים וחיזויים.
 */
export function confusionMatrix(
  yTrue: LabelVector,
  yPred: LabelVector,
  labels?: Label[],
): ConfusionMatrix {
  if (yTrue.length !== yPred.length) {
    throw new Error(
      'confusionMatrix: yTrue and yPred length mismatch / אורכים שונים',
    );
  }
  let lbls: Label[];
  if (labels && labels.length > 0) {
    lbls = labels.slice();
  } else {
    const set = new Set<string>();
    for (const v of yTrue) set.add(String(v));
    for (const v of yPred) set.add(String(v));
    // Reconstruct original label values from yTrue/yPred
    const ordered: Label[] = [];
    for (const k of Array.from(set).sort()) {
      const found =
        yTrue.find((v) => String(v) === k) ??
        yPred.find((v) => String(v) === k) ??
        k;
      ordered.push(found);
    }
    lbls = ordered;
  }
  const idx: Record<string, number> = {};
  for (let i = 0; i < lbls.length; i++) idx[String(lbls[i])] = i;
  const matrix: number[][] = [];
  for (let i = 0; i < lbls.length; i++) {
    matrix.push(new Array(lbls.length).fill(0));
  }
  for (let i = 0; i < yTrue.length; i++) {
    const t = idx[String(yTrue[i])];
    const p = idx[String(yPred[i])];
    if (t === undefined || p === undefined) continue;
    matrix[t][p] += 1;
  }
  return { labels: lbls, matrix };
}

/**
 * Accuracy = (TP + TN) / total.
 * דיוק כללי = חיזויים נכונים / סך הכל.
 */
export function accuracyScore(yTrue: LabelVector, yPred: LabelVector): number {
  if (yTrue.length === 0) return 0;
  let ok = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (String(yTrue[i]) === String(yPred[i])) ok += 1;
  }
  return ok / yTrue.length;
}

/**
 * Full classification report: per-class precision/recall/f1 plus
 * macro and weighted averages.
 * דו"ח סיווג מלא לפי מחלקה + ממוצעים.
 */
export function classificationReport(
  yTrue: LabelVector,
  yPred: LabelVector,
  labels?: Label[],
): ClassificationReport {
  const cm = confusionMatrix(yTrue, yPred, labels);
  const n = cm.labels.length;
  const total = yTrue.length;
  const perClass: ClassMetrics[] = [];
  let macroF1 = 0;
  let weightedF1 = 0;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    correct += cm.matrix[i][i];
    let colSum = 0;
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      colSum += cm.matrix[j][i];
      rowSum += cm.matrix[i][j];
    }
    const tp = cm.matrix[i][i];
    const precision = colSum === 0 ? 0 : tp / colSum;
    const recall = rowSum === 0 ? 0 : tp / rowSum;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    perClass.push({
      label: cm.labels[i],
      precision,
      recall,
      f1,
      support: rowSum,
    });
    macroF1 += f1;
    weightedF1 += f1 * rowSum;
  }
  macroF1 = n === 0 ? 0 : macroF1 / n;
  weightedF1 = total === 0 ? 0 : weightedF1 / total;
  const accuracy = total === 0 ? 0 : correct / total;
  return { accuracy, perClass, macroF1, weightedF1, total };
}

/**
 * Pretty-print a confusion matrix as a bilingual string grid.
 * הדפסה דו-לשונית של מטריצת הבלבול.
 */
export function formatConfusionMatrix(cm: ConfusionMatrix): string {
  const header = 'true\\pred | אמת\\חיזוי';
  const lines: string[] = [header];
  const headerCols = cm.labels.map((l) => String(l).padStart(6)).join(' ');
  lines.push('              ' + headerCols);
  for (let i = 0; i < cm.labels.length; i++) {
    const rowLbl = String(cm.labels[i]).padStart(12);
    const cells = cm.matrix[i].map((v) => String(v).padStart(6)).join(' ');
    lines.push(rowLbl + ' ' + cells);
  }
  return lines.join('\n');
}

// ============================================================
// Cross-validation — תיקוף צולב
// ============================================================

/** Anything with fit/predict is a classifier. / כל אובייקט עם fit ו-predict. */
export interface Classifier {
  fit(X: FeatureMatrix, y: LabelVector): void;
  predict(X: FeatureMatrix): LabelVector;
}

/** Factory function so each fold gets a fresh model instance. */
export type ClassifierFactory = () => Classifier;

/**
 * Stratified-free k-fold cross-validation. Shuffles deterministically
 * then splits into k folds.
 * תיקוף צולב בעזרת k קפלים. מערבב באופן דטרמיניסטי ואז מחלק ל-k קבוצות.
 */
export function kFoldCrossValidate(
  factory: ClassifierFactory,
  X: FeatureMatrix,
  y: LabelVector,
  k = 5,
  seed = 42,
): CrossValidationReport {
  if (X.length !== y.length) {
    throw new Error(
      'kFoldCrossValidate: X/y length mismatch / אורכי X ו-y אינם תואמים',
    );
  }
  if (k < 2) {
    throw new Error('kFoldCrossValidate: k must be >= 2 / k חייב להיות ≥ 2');
  }
  if (k > X.length) {
    throw new Error(
      'kFoldCrossValidate: k cannot exceed sample count / k אינו יכול לעלות על מספר הדגימות',
    );
  }
  const n = X.length;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(i);
  shuffleInPlace(indices, mulberry32(seed));
  const folds: number[][] = [];
  const foldSize = Math.floor(n / k);
  let start = 0;
  for (let i = 0; i < k; i++) {
    const size = i < n % k ? foldSize + 1 : foldSize;
    folds.push(indices.slice(start, start + size));
    start += size;
  }
  const foldResults: FoldResult[] = [];
  for (let i = 0; i < k; i++) {
    const testIdx = folds[i];
    const trainIdx: number[] = [];
    for (let j = 0; j < k; j++) if (j !== i) trainIdx.push(...folds[j]);
    const xTrain = trainIdx.map((idx) => X[idx].slice());
    const yTrain = trainIdx.map((idx) => y[idx]);
    const xTest = testIdx.map((idx) => X[idx].slice());
    const yTest = testIdx.map((idx) => y[idx]);
    const model = factory();
    model.fit(xTrain, yTrain);
    const preds = model.predict(xTest);
    const report = classificationReport(yTest, preds);
    foldResults.push({
      fold: i,
      accuracy: report.accuracy,
      macroF1: report.macroF1,
      size: testIdx.length,
    });
  }
  const meanAccuracy =
    foldResults.reduce((s, f) => s + f.accuracy, 0) / foldResults.length;
  const meanMacroF1 =
    foldResults.reduce((s, f) => s + f.macroF1, 0) / foldResults.length;
  let varAcc = 0;
  for (const f of foldResults) {
    varAcc += (f.accuracy - meanAccuracy) * (f.accuracy - meanAccuracy);
  }
  varAcc /= foldResults.length;
  return {
    k,
    folds: foldResults,
    meanAccuracy,
    stdAccuracy: Math.sqrt(varAcc),
    meanMacroF1,
  };
}

// ============================================================
// Bilingual feature definitions — תוויות דו-לשוניות לתכונות
// ============================================================

/**
 * Ready-made bilingual feature sets for common ONYX use cases.
 * כל אחד מגדיר את סדר העמודות, תוויותיהן והמחלקות האפשריות.
 */
export const BILINGUAL_FEATURES: Record<string, FeatureSet> = {
  invoiceFraud: {
    name: {
      en: 'Invoice fraud probability',
      he: 'הסתברות הונאה בחשבונית',
    },
    features: [
      {
        key: 'amount',
        en: 'Invoice amount (NIS)',
        he: 'סכום החשבונית (ש"ח)',
      },
      {
        key: 'roundAmount',
        en: 'Is round amount (0/1)',
        he: 'האם סכום עגול (0/1)',
      },
      {
        key: 'vendorAgeMonths',
        en: 'Vendor age (months)',
        he: 'ותק הספק (חודשים)',
      },
      {
        key: 'priorInvoices',
        en: 'Prior invoices from vendor',
        he: 'חשבוניות קודמות מהספק',
      },
      {
        key: 'submittedAfterHours',
        en: 'Submitted after hours (0/1)',
        he: 'הוגשה מחוץ לשעות עבודה (0/1)',
      },
      {
        key: 'vatMismatch',
        en: 'VAT mismatch (0/1)',
        he: 'אי-התאמת מע"מ (0/1)',
      },
    ],
    classes: [
      { key: '0', en: 'legitimate', he: 'לגיטימית' },
      { key: '1', en: 'fraud', he: 'הונאה' },
    ],
  },

  supplierDeliveryRisk: {
    name: {
      en: 'Supplier delivery risk',
      he: 'סיכון אי-עמידה באספקה',
    },
    features: [
      {
        key: 'pastLateRate',
        en: 'Past late-delivery rate',
        he: 'שיעור איחורים בעבר',
      },
      {
        key: 'avgLeadTimeDays',
        en: 'Average lead time (days)',
        he: 'זמן אספקה ממוצע (ימים)',
      },
      {
        key: 'orderSize',
        en: 'Order size (units)',
        he: 'גודל ההזמנה (יחידות)',
      },
      {
        key: 'distanceKm',
        en: 'Distance (km)',
        he: 'מרחק (ק"מ)',
      },
      {
        key: 'weatherSeverity',
        en: 'Weather severity (0-1)',
        he: 'חומרת מזג האוויר (0-1)',
      },
    ],
    classes: [
      { key: '0', en: 'on-time', he: 'בזמן' },
      { key: '1', en: 'late', he: 'באיחור' },
    ],
  },

  defectClass: {
    name: {
      en: 'Defect class',
      he: 'סיווג פגמים',
    },
    features: [
      {
        key: 'sizeDeviationMm',
        en: 'Size deviation (mm)',
        he: 'סטייה במידה (מ"מ)',
      },
      {
        key: 'surfaceRoughness',
        en: 'Surface roughness (Ra)',
        he: 'חספוס פני שטח (Ra)',
      },
      {
        key: 'colorDeltaE',
        en: 'Color delta-E',
        he: 'סטיית צבע Delta-E',
      },
      {
        key: 'temperatureC',
        en: 'Process temperature (°C)',
        he: 'טמפרטורת תהליך (°C)',
      },
    ],
    classes: [
      { key: 'none', en: 'no defect', he: 'ללא פגם' },
      { key: 'cosmetic', en: 'cosmetic', he: 'פגם קוסמטי' },
      { key: 'structural', en: 'structural', he: 'פגם מבני' },
    ],
  },

  paymentLateness: {
    name: {
      en: 'Payment lateness risk',
      he: 'סיכון איחור בתשלום',
    },
    features: [
      {
        key: 'customerAgeMonths',
        en: 'Customer age (months)',
        he: 'ותק הלקוח (חודשים)',
      },
      {
        key: 'avgDaysToPay',
        en: 'Average days to pay',
        he: 'ממוצע ימי תשלום',
      },
      {
        key: 'openBalance',
        en: 'Current open balance (NIS)',
        he: 'יתרה פתוחה נוכחית (ש"ח)',
      },
      {
        key: 'creditLimit',
        en: 'Credit limit (NIS)',
        he: 'מסגרת אשראי (ש"ח)',
      },
      {
        key: 'priorLateCount',
        en: 'Prior late payments',
        he: 'תשלומים קודמים באיחור',
      },
    ],
    classes: [
      { key: '0', en: 'on-time', he: 'בזמן' },
      { key: '1', en: 'late', he: 'באיחור' },
    ],
  },
};

/** Translate a class label into human-readable bilingual string. / תרגום תווית. */
export function translateLabel(
  useCase: keyof typeof BILINGUAL_FEATURES,
  label: Label,
): { en: string; he: string } | null {
  const set = BILINGUAL_FEATURES[useCase];
  if (!set) return null;
  const key = String(label);
  const cls = set.classes.find((c) => c.key === key);
  return cls ? { en: cls.en, he: cls.he } : null;
}

/** Translate an array index to its feature label. / תרגום אינדקס לתווית. */
export function featureLabelAt(
  useCase: keyof typeof BILINGUAL_FEATURES,
  index: number,
): BilingualLabel | null {
  const set = BILINGUAL_FEATURES[useCase];
  if (!set) return null;
  return set.features[index] ?? null;
}

// ============================================================
// End of module / סוף המודול
// ============================================================
